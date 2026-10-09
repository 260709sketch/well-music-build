#import <UIKit/UIKit.h>
#import <React/RCTRootView.h>

NS_ASSUME_NONNULL_BEGIN

@interface WellMusicSheetViewController : UIViewController

@property (nonatomic, copy) NSString *componentName;
@property (nonatomic, copy) NSDictionary *initialProperties;
@property (nonatomic, strong) RCTRootView *rootView;
@property (nonatomic, copy) void (^onDismiss)(void);

- (instancetype)initWithComponentName:(NSString *)componentName
                               props:(nullable NSDictionary *)props;

@end

NS_ASSUME_NONNULL_END
