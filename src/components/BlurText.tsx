import React from 'react'
import { requireNativeComponent, ViewStyle, StyleSheet } from 'react-native'

const BlurTextView = requireNativeComponent('BlurTextView') as any

interface BlurTextProps {
  text: string
  fontSize?: number
  fontWeight?: string
  color?: string
  blurRadius?: number
  textAlign?: 'left' | 'center' | 'right'
  style?: ViewStyle
}

export default function BlurText({
  text,
  fontSize = 16,
  fontWeight = '500',
  color = '#ffffff',
  blurRadius = 5,
  textAlign = 'center',
  style,
}: BlurTextProps) {
  return (
    <BlurTextView
      text={text}
      fontSize={fontSize}
      fontWeight={fontWeight}
      color={color}
      blurRadius={blurRadius}
      textAlign={textAlign}
      style={[styles.container, style]}
    />
  )
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
})
