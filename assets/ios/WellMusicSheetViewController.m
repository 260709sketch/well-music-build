#import "WellMusicSheetViewController.h"
#import <React/RCTBridge.h>
#import <React/RCTRootView.h>

@interface WellMusicSheetViewController () <UISheetPresentationControllerDelegate>
@end

@implementation WellMusicSheetViewController

- (instancetype)initWithComponentName:(NSString *)componentName
                               props:(NSDictionary *)props {
    self = [super init];
    if (self) {
        _componentName = [componentName copy];
        _initialProperties = [props copy];
    }
    return self;
}

- (void)viewDidLoad {
    [super viewDidLoad];
    self.view.backgroundColor = [UIColor systemBackgroundColor];

    // 获取 RCTBridge
    RCTBridge *bridge = [self getBridge];
    if (!bridge) {
        NSLog(@"[WellMusicSheet] bridge not found");
        return;
    }

    // 创建 RCTRootView 加载指定的 React Native 组件
    self.rootView = [[RCTRootView alloc] initWithBridge:bridge
                                            moduleName:self.componentName
                                     initialProperties:self.initialProperties];
    self.rootView.backgroundColor = [UIColor clearColor];
    self.rootView.translatesAutoresizingMaskIntoConstraints = NO;
    [self.view addSubview:self.rootView];

    [NSLayoutConstraint activateConstraints:@[
        [self.rootView.topAnchor constraintEqualToAnchor:self.view.topAnchor],
        [self.rootView.leadingAnchor constraintEqualToAnchor:self.view.leadingAnchor],
        [self.rootView.trailingAnchor constraintEqualToAnchor:self.view.trailingAnchor],
        [self.rootView.bottomAnchor constraintEqualToAnchor:self.view.bottomAnchor],
    ]];
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    // 配置半屏弹窗
    if (@available(iOS 15.0, *)) {
        UISheetPresentationController *sheet = self.presentationController;
        if ([sheet isKindOfClass:[UISheetPresentationController class]]) {
            sheet.detents = @[
                [UISheetPresentationControllerDetent mediumDetent],
                [UISheetPresentationControllerDetent largeDetent],
            ];
            sheet.prefersGrabberVisible = YES;
            sheet.prefersScrollingExpandsWhenScrolledToEdge = YES;
            sheet.largestUndimmedDetentIdentifier = UISheetPresentationControllerDetentIdentifierMedium;
            sheet.delegate = self;
        }
    }
}

- (void)viewDidDisappear:(BOOL)animated {
    [super viewDidDisappear:animated];
    if (self.onDismiss) {
        self.onDismiss();
    }
}

#pragma mark - UISheetPresentationControllerDelegate

- (void)sheetPresentationControllerDidDismiss:(UISheetPresentationController *)sheetPresentationController {
    if (self.onDismiss) {
        self.onDismiss();
    }
}

#pragma mark - 获取 RCTBridge

- (RCTBridge *)getBridge {
    // 从 AppDelegate 获取 bridge
    UIApplication *app = [UIApplication sharedApplication];
    id delegate = app.delegate;
    if ([delegate respondsToSelector:@selector(bridge)]) {
        return [delegate performSelector:@selector(bridge)];
    }
    // 备选：从 window 的 rootViewController 找
    for (UIWindow *window in app.windows) {
        UIViewController *vc = window.rootViewController;
        while (vc.presentedViewController) {
            vc = vc.presentedViewController;
        }
        if ([vc isKindOfClass:NSClassFromString(@"RCTRootView")]) {
            return [(RCTRootView *)vc bridge];
        }
    }
    return nil;
}

@end
