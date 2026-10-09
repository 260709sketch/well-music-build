//
//  FLACConverter.m
//  WellMusic
//
//  FLAC 转无损 PCM（CAF）原生模块
//  原理：AVFoundation 流式播放 FLAC 没有精确 seek 表，拖动有几秒误差；
//        转成 PCM 后有精确帧索引，seek 精准，歌词和人声同步。
//

#import <React/RCTBridgeModule.h>
#import <AVFoundation/AVFoundation.h>

@interface FLACConverter : NSObject <RCTBridgeModule>
@end

@implementation FLACConverter

RCT_EXPORT_MODULE()

RCT_EXPORT_METHOD(convertFLACToPCM:(NSString *)flacPath
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)
{
    dispatch_async(dispatch_get_global_queue(DISPATCH_QUEUE_PRIORITY_DEFAULT, 0), ^{
        @try {
            NSURL *flacURL = [NSURL fileURLWithPath:flacPath];
            NSFileManager *fm = [NSFileManager defaultManager];

            // 检查输入文件
            if (![fm fileExistsAtPath:flacPath]) {
                reject(@"file_not_found", @"FLAC文件不存在", nil);
                return;
            }

            // 输出路径：缓存目录下的 WellMusicFLAC 文件夹
            NSString *cacheDir = [NSSearchPathForDirectoriesInDomains(NSCachesDirectory, NSUserDomainMask, YES) firstObject];
            NSString *outputDir = [cacheDir stringByAppendingPathComponent:@"WellMusicFLAC"];
            if (![fm fileExistsAtPath:outputDir]) {
                [fm createDirectoryAtPath:outputDir withIntermediateDirectories:YES attributes:nil error:nil];
            }

            NSString *outputFileName = [NSString stringWithFormat:@"pcm_%@.caf", [[NSUUID UUID] UUIDString]];
            NSString *outputPath = [outputDir stringByAppendingPathComponent:outputFileName];
            NSURL *outputURL = [NSURL fileURLWithPath:outputPath];

            NSLog(@"[FLACConverter] 开始转换: %@ -> %@", flacPath, outputPath);

            // 打开输入文件
            NSError *inputError = nil;
            AVAudioFile *inputFile = [[AVAudioFile alloc] initForReading:flacURL error:&inputError];
            if (inputError || !inputFile) {
                reject(@"open_failed", [NSString stringWithFormat:@"打开FLAC文件失败: %@", inputError.localizedDescription], inputError);
                return;
            }

            // 获取输入文件格式信息
            AVAudioFormat *processingFormat = inputFile.processingFormat;
            double sampleRate = processingFormat.sampleRate;
            NSInteger channels = processingFormat.channelCount;
            long long totalFrames = inputFile.length;

            NSLog(@"[FLACConverter] 输入格式: %.0fHz, %ld通道, %lld帧", sampleRate, (long)channels, totalFrames);

            // 输出设置：无损 PCM（16-bit integer, 小端, 交错）
            NSDictionary *outputSettings = @{
                AVFormatIDKey: @(kAudioFormatLinearPCM),
                AVSampleRateKey: @(sampleRate),
                AVNumberOfChannelsKey: @(channels),
                AVLinearPCMBitDepthKey: @16,
                AVLinearPCMIsFloatKey: @NO,
                AVLinearPCMIsBigEndianKey: @NO,
                AVLinearPCMIsNonInterleaved: @NO
            };

            // 创建输出文件
            NSError *outputError = nil;
            AVAudioFile *outputFile = [[AVAudioFile alloc] initForWriting:outputURL
                                                                   settings:outputSettings
                                                                      error:&outputError];
            if (outputError || !outputFile) {
                reject(@"create_failed", [NSString stringWithFormat:@"创建PCM文件失败: %@", outputError.localizedDescription], outputError);
                return;
            }

            // 逐帧读取并写入
            AVAudioFrameCount bufferSize = 4096;
            AVAudioPCMBuffer *buffer = [[AVAudioPCMBuffer alloc] initWithPCMFormat:processingFormat
                                                                      frameCapacity:bufferSize];
            long long framesWritten = 0;

            while (inputFile.framePosition < totalFrames) {
                NSError *readError = nil;
                BOOL readSuccess = [inputFile readIntoBuffer:buffer error:&readError];
                if (!readSuccess || readError) {
                    NSLog(@"[FLACConverter] 读取警告: %@", readError.localizedDescription);
                    break;
                }
                if (buffer.frameLength == 0) break;

                NSError *writeError = nil;
                BOOL writeSuccess = [outputFile writeFromBuffer:buffer error:&writeError];
                if (!writeSuccess || writeError) {
                    reject(@"write_failed", [NSString stringWithFormat:@"写入PCM失败: %@", writeError.localizedDescription], writeError);
                    return;
                }
                framesWritten += buffer.frameLength;
            }

            // 检查输出文件
            NSDictionary *outputAttrs = [fm attributesOfItemAtPath:outputPath error:nil];
            unsigned long long outputSize = [outputAttrs fileSize];

            NSLog(@"[FLACConverter] 转换完成! 写入%lld帧, 输出大小: %llu字节", framesWritten, outputSize);

            if (outputSize < 10000) {
                reject(@"output_too_small", @"输出文件太小，转换可能失败", nil);
                return;
            }

            resolve(outputPath);
        } @catch (NSException *exception) {
            reject(@"exception", [NSString stringWithFormat:@"转换异常: %@", exception.reason], nil);
        }
    });
}

@end
