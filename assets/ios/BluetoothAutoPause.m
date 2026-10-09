//
//  BluetoothAutoPause.m
//  WellMusic
//
//  断开音频输出设备（蓝牙耳机/有线耳机拔出）时自动暂停播放。
//  对齐 Kumone PlayerService 中 AVAudioSession.routeChangeNotification 的处理：
//    仅当 route change 原因为 .oldDeviceUnavailable（旧输出设备不可用）时，
//    向 JS 发送 "BluetoothAutoPause.onRouteChange" 事件；JS 收到后自行判断是否暂停。
//

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>
#import <AVFoundation/AVFoundation.h>
#import <UIKit/UIKit.h>

@interface BluetoothAutoPause : RCTEventEmitter <RCTBridgeModule>
@end

@implementation BluetoothAutoPause {
    BOOL _observing;
}

RCT_EXPORT_MODULE()

#pragma mark - RCTEventEmitter

- (NSArray<NSString *> *)supportedEvents {
    return @[ @"onRouteChange" ];
}

// 有 JS 监听者（NativeEventEmitter.addListener）时开始观察
- (void)startObserving {
    if (_observing) return;
    _observing = YES;
    [[NSNotificationCenter defaultCenter]
        addObserver:self
           selector:@selector(handleRouteChange:)
               name:AVAudioSessionRouteChangeNotification
             object:[AVAudioSession sharedInstance]];
    NSLog(@"[BluetoothAutoPause] start observing route change");
}

- (void)stopObserving {
    if (!_observing) return;
    _observing = NO;
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:AVAudioSessionRouteChangeNotification
                                                  object:[AVAudioSession sharedInstance]];
    NSLog(@"[BluetoothAutoPause] stop observing route change");
}

- (void)handleRouteChange:(NSNotification *)notification {
    NSDictionary *userInfo = notification.userInfo;
    NSNumber *reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey];
    if (!reasonValue) return;
    AVAudioSessionRouteChangeReason reason = (AVAudioSessionRouteChangeReason)[reasonValue unsignedIntegerValue];
    // 对齐 Kumone：仅旧输出设备不可用（蓝牙断开/耳机拔出）时触发
    if (reason != AVAudioSessionRouteChangeReasonOldDeviceUnavailable) return;

    // 附带当前输出端口名，方便日志/调试
    AVAudioSession *session = [AVAudioSession sharedInstance];
    NSString *outputName = @"unknown";
    NSString *portType = @"";
    AVAudioSessionRouteDescription *route = session.currentRoute;
    if (route.outputs.count > 0) {
        AVAudioSessionPortDescription *out = route.outputs[0];
        outputName = out.portName ? out.portName : @"unknown";
        portType = out.portType ? out.portType : @"";
    }

    NSLog(@"[BluetoothAutoPause] route change: oldDeviceUnavailable, newOutput=%@(%@) isPlayingViaJS=YES", outputName, portType);
    [self sendEventWithName:@"onRouteChange"
                       body:@{ @"reason": @"oldDeviceUnavailable",
                               @"outputName": outputName,
                               @"portType": portType }];
}

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (void)dealloc {
    if (_observing) {
        [[NSNotificationCenter defaultCenter] removeObserver:self];
    }
}

@end