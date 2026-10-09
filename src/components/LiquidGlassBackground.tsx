import React from 'react'
import { requireNativeComponent, ViewStyle, Platform, View } from 'react-native'
import { isIOS26OrAbove } from './SystemNativeTabBar'

const LiquidGlassBackgroundNative = requireNativeComponent('LiquidGlassBackground') as any

interface LiquidGlassBackgroundProps {
  style?: ViewStyle
  children?: React.ReactNode
}

// 液态玻璃背景（iOS 26 专属效果）
// iOS 26+ 渲染原生 UIGlassEffect；iOS 26 以下（含 iOS 17）回退为透明占位层，
// 不调用任何 iOS 26 API，由页面自身的背景色/光晕 + 毛玻璃卡片呈现 Beans 观感，安全不闪退。
const LiquidGlassBackground: React.FC<LiquidGlassBackgroundProps> = ({ style, children }) => {
  if (Platform.OS !== 'ios') return <>{children}</>
  if (!isIOS26OrAbove()) {
    return <View style={style}>{children}</View>
  }
  return (
    <LiquidGlassBackgroundNative style={style}>
      {children}
    </LiquidGlassBackgroundNative>
  )
}

export default LiquidGlassBackground
