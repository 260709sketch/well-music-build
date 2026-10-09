import React from 'react'
import { View, ViewStyle } from 'react-native'
import { SymbolView } from 'expo-symbols'

/**
 * SF Symbols 图标组件（expo-symbols 渲染，postinstall 补丁已加 size prop + aspectFit + tint 双保险）
 * props: systemName / size / color / weight / scale —— 与原生 SFSymbol 版本 API 一致
 */
interface SFSymbolProps {
  systemName: string
  size?: number
  color?: string
  weight?: 'ultralight' | 'light' | 'thin' | 'regular' | 'medium' | 'semibold' | 'bold' | 'heavy'
  scale?: 'small' | 'default' | 'large'
  style?: ViewStyle
}

// expo-symbols 的 weight 命名是驼峰（ultraLight），需映射
const WEIGHT_MAP: Record<string, string> = {
  ultralight: 'ultraLight',
  light: 'light',
  thin: 'thin',
  regular: 'regular',
  medium: 'medium',
  semibold: 'semibold',
  bold: 'bold',
  heavy: 'heavy',
}

// expo-symbols 的 scale 命名（default/small/medium/large）
const SCALE_MAP: Record<string, string> = {
  small: 'small',
  default: 'default',
  large: 'large',
}

// expo-modules 原生 UIColor 转换只支持命名色 / #hex，不支持 rgba()/rgb() 字符串。
// 不转换会导致 tint 解析失败回落到系统蓝，这里统一归一化为 #RRGGBBAA / #RRGGBB。
const toHex8 = (v: number) =>
  Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')

const normalizeColor = (color: string): string => {
  if (!color) return color
  const m = color.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/)
  if (m) {
    const r = Number(m[1])
    const g = Number(m[2])
    const b = Number(m[3])
    const a = m[4] !== undefined ? Number(m[4]) : 1
    return `#${toHex8(r)}${toHex8(g)}${toHex8(b)}${toHex8(a * 255)}`
  }
  return color
}

const SFSymbol: React.FC<SFSymbolProps> = ({
  systemName,
  size = 24,
  color = '#ffffff',
  weight = 'regular',
  scale = 'default',
  style,
}) => {
  return (
    <View style={[{ width: size, height: size }, style]}>
      <SymbolView
        style={{ width: size, height: size }}
        name={systemName as any}
        size={size}
        tintColor={normalizeColor(color)}
        weight={(WEIGHT_MAP[weight] ?? 'regular') as any}
        scale={(SCALE_MAP[scale] ?? 'default') as any}
        resizeMode="scaleAspectFit"
      />
    </View>
  )
}

export default SFSymbol
