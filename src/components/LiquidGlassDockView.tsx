import React from 'react'
import { requireNativeComponent, ViewStyle, Platform } from 'react-native'

/**
 * 液态玻璃原生组件 —— 用空 UITabBar 当背景
 * iOS 26 以上系统自动渲染液态玻璃效果，iOS 26 以下是普通超薄模糊
 */
const LiquidGlassDockViewNative = requireNativeComponent('LiquidGlassDockView')

interface LiquidGlassDockViewProps {
  style?: ViewStyle
}

const LiquidGlassDockView: React.FC<LiquidGlassDockViewProps> = ({ style, children }) => {
  if (Platform.OS !== 'ios') {
    return <>{children}</>
  }
  return (
    <LiquidGlassDockViewNative style={style}>
      {children}
    </LiquidGlassDockViewNative>
  )
}

export default LiquidGlassDockView
