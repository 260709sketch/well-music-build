import React from 'react'
import SFSymbol from '@/components/SFSymbol'
import { View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'

/**
 * iOS音乐库图标（堆叠专辑+音符，纯View绘制）
 */
export const LibraryIcon = ({ size = 24, color = '#000' }) => {
  const albumSize = size * 0.72
  const cornerRadius = size * 0.18
  const stackOffset = size * 0.14

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      {/* 后面的专辑（堆叠效果） */}
      <View
        style={{
          position: 'absolute',
          width: albumSize,
          height: albumSize,
          borderRadius: cornerRadius,
          backgroundColor: color,
          top: size * 0.08,
          left: size * 0.08,
          opacity: 0.5,
        }}
      />
      {/* 前面的专辑 */}
      <View
        style={{
          width: albumSize,
          height: albumSize,
          borderRadius: cornerRadius,
          backgroundColor: color,
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: stackOffset,
          marginLeft: stackOffset,
        }}
      >
        <SFSymbol systemName="music.note" size={size * 0.4} color="#ffffff" />
      </View>
    </View>
  )
}
