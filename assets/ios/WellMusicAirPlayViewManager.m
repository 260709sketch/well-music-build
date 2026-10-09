#import "WellMusicAirPlayViewManager.h"
#import "WellMusicAirPlayView.h"
#import <React/RCTConvert.h>

@implementation WellMusicAirPlayViewManager

RCT_EXPORT_MODULE(WellMusicAirPlayView)

- (UIView *)view {
  return [[WellMusicAirPlayView alloc] initWithFrame:CGRectZero];
}

RCT_CUSTOM_VIEW_PROPERTY(tintColor, UIColor, WellMusicAirPlayView) {
  if (json) {
    view.tintColor = [RCTConvert UIColor:json];
  }
}

@end
