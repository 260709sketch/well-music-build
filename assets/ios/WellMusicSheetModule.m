#import "WellMusicSheetModule.h"
#import "WellMusicSheetViewController.h"
#import <UIKit/UIKit.h>

@implementation WellMusicSheetModule

RCT_EXPORT_MODULE(WellMusicSheet)

static WellMusicSheetViewController *currentSheet = nil;

+ (BOOL)requiresMainQueueSetup {
    return YES;
}

- (NSArray<NSString *> *)supportedEvents {
    return @[@"onSheetDismiss"];
}

RCT_EXPORT_METHOD(show:(NSString *)componentName
                  props:(NSDictionary *)props
                  resolver:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_main_queue(), ^{
        // 如果已有弹窗，先关闭
        if (currentSheet) {
            [currentSheet dismissViewControllerAnimated:NO completion:nil];
            currentSheet = nil;
        }

        // 找到最顶层的 viewController
        UIViewController *topVC = [self findTopViewController];
        if (!topVC) {
            reject(@"NO_VC", @"Cannot find top view controller", nil);
            return;
        }

        // 创建半屏弹窗
        WellMusicSheetViewController *sheetVC = [[WellMusicSheetViewController alloc]
            initWithComponentName:componentName
                            props:props];
        sheetVC.onDismiss = ^{
            [self sendEventWithName:@"onSheetDismiss" body:@{@"componentName": componentName}];
            currentSheet = nil;
        };

        currentSheet = sheetVC;
        [topVC presentViewController:sheetVC animated:YES completion:^{
            resolve(@{@"status": @"shown"});
        }];
    });
}

RCT_EXPORT_METHOD(dismiss:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    dispatch_async(dispatch_get_main_queue(), ^{
        if (currentSheet) {
            [currentSheet dismissViewControllerAnimated:YES completion:^{
                resolve(@{@"status": @"dismissed"});
            }];
        } else {
            resolve(@{@"status": @"no_sheet"});
        }
    });
}

RCT_EXPORT_METHOD(isAvailable:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject) {
    if (@available(iOS 15.0, *)) {
        resolve(@{@"available": @YES});
    } else {
        resolve(@{@"available": @NO});
    }
}

#pragma mark - 找到最顶层 viewController

- (UIViewController *)findTopViewController {
    UIWindow *keyWindow = nil;
    for (UIWindow *window in [UIApplication sharedApplication].windows) {
        if (window.isKeyWindow) {
            keyWindow = window;
            break;
        }
    }
    if (!keyWindow && [UIApplication sharedApplication].windows.count > 0) {
        keyWindow = [UIApplication sharedApplication].windows.firstObject;
    }

    UIViewController *vc = keyWindow.rootViewController;
    while (vc.presentedViewController) {
        vc = vc.presentedViewController;
    }
    return vc;
}

@end
