import React from 'react'
import { requireNativeComponent } from 'react-native'

// 原生组件：内部是 MPVolumeView 的 AirPlay 路由按钮，
// 点击后弹出系统 AirPlay 设备选择面板（Apple Music 同款交互）。
const NativeAirPlayRoutePicker = requireNativeComponent<any>('WellMusicAirPlayView')

type Props = {
  color?: string
  size?: number
}

export const AirPlayRoutePicker: React.FC<Props> = ({ color = '#d9d9d9', size = 26 }) => {
  return <NativeAirPlayRoutePicker tintColor={color} style={{ width: size, height: size }} />
}
