import React from 'react'
import { View } from 'react-native'

/**
 * 音频波形AirPlay图标（纯View绘制）
 * 6根圆角竖条，中间最高，两边对称递减
 */
export const AirPlayIcon = ({ size = 25, color = '#fff' }) => {
  const barWidth = size * 0.095
  const gap = size * 0.07
  const borderRadius = barWidth / 2
  // 6根条的高度比例（从左到右）
  const heightRatios = [0.34, 0.68, 0.46, 1.0, 0.68, 0.34]
  const maxHeight = size * 0.82

  return (
    <View
      style={{
        width: size,
        height: size,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: gap,
      }}
    >
      {heightRatios.map((ratio, i) => (
        <View
          key={i}
          style={{
            width: barWidth,
            height: maxHeight * ratio,
            backgroundColor: color,
            borderRadius: borderRadius,
          }}
        />
      ))}
    </View>
  )
}
