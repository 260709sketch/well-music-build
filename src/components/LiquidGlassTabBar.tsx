import React from 'react'
import { requireNativeComponent, ViewStyle, Platform, NativeSyntheticEvent } from 'react-native'

const LiquidGlassTabBarNative = requireNativeComponent('LiquidGlassTabBar')

interface TabItem {
  title: string
  icon: string // SF Symbol name
}

interface LiquidGlassTabBarProps {
  tabItems: TabItem[]
  selectedIndex: number
  onTabSelect: (index: number) => void
  style?: ViewStyle
}

const LiquidGlassTabBar: React.FC<LiquidGlassTabBarProps> = ({
  tabItems,
  selectedIndex,
  onTabSelect,
  style,
}) => {
  if (Platform.OS !== 'ios') return null

  const handleSelect = (event: NativeSyntheticEvent<{ index: number }>) => {
    onTabSelect(event.nativeEvent.index)
  }

  return (
    <LiquidGlassTabBarNative
      style={style}
      tabItems={tabItems}
      selectedIndex={selectedIndex}
      onTabSelect={handleSelect}
    />
  )
}

export default LiquidGlassTabBar
