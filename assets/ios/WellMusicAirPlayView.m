#import "WellMusicAirPlayView.h"
#import <AVKit/AVKit.h>

// 用 AVRoutePickerView 承载 AirPlay 按钮：
// MPVolumeView 的路由按钮在附近没有 AirPlay/蓝牙路由时会被系统隐藏（导致底部栏空白），
// AVRoutePickerView 的按钮始终显示，点击弹出系统 AirPlay 设备选择面板（与 Apple Music 一致）。
@interface WellMusicAirPlayView ()
@property (nonatomic, strong) AVRoutePickerView *pickerView;
@end

@implementation WellMusicAirPlayView

- (instancetype)initWithFrame:(CGRect)frame {
  self = [super initWithFrame:frame];
  if (self) {
    _pickerView = [[AVRoutePickerView alloc] initWithFrame:self.bounds];
    _pickerView.tintColor = [UIColor colorWithWhite:0.85 alpha:1.0];
    _pickerView.activeTintColor = [UIColor whiteColor];
    [self addSubview:_pickerView];
  }
  return self;
}

- (void)layoutSubviews {
  [super layoutSubviews];
  _pickerView.frame = self.bounds;
  // 内部按钮默认字形偏小，放大到与底部栏其它 26pt 图标一致
  for (UIView *subview in _pickerView.subviews) {
    if ([subview isKindOfClass:[UIControl class]]) {
      subview.transform = CGAffineTransformMakeScale(1.25, 1.25);
    }
  }
}

- (void)setTintColor:(UIColor *)tintColor {
  [super setTintColor:tintColor];
  _pickerView.tintColor = tintColor;
}

@end
