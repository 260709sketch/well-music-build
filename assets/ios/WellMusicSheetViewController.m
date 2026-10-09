#import "WellMusicSheetViewController.h"
#import <React/RCTBridge.h>
#import <React/RCTRootView.h>

@interface WellMusicSheetViewController ()
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

    RCTBridge *bridge = [self getBridge];
    if (bridge) {
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
}

- (void)viewWillAppear:(BOOL)animated {
    [super viewWillAppear:animated];
    if (@available(iOS 15.0, *)) {
        UISheetPresentationController *sheet = self.presentationController;
        if ([sheet isKindOfClass:[UISheetPresentationController class]]) {
            sheet.detents = @[
                [UISheetPresentationControllerDetent mediumDetent],
                [UISheetPresentationControllerDetent largeDetent],
            ];
            sheet.prefersGrabberVisible = YES;
            sheet.prefersScrollingExpandsWhenScrolledToEdge = YES;
        }
    }
}

- (void)viewDidDisappear:(BOOL)animated {
    [super viewDidDisappear:animated];
    if (self.onDismiss) {
        self.onDismiss();
    }
}

#pragma mark - 获取 RCTBridge

- (RCTBridge *)getBridge {
    UIApplication *app = [UIApplication sharedApplication];
    id delegate = app.delegate;
    if ([delegate respondsToSelector:@selector(bridge)]) {
        id bridge = [delegate valueForKey:@"bridge"];
        if ([bridge isKindOfClass:NSClassFromString(@"RCTBridge")]) {
            return bridge;
        }
    }
    return nil;
}

@end
