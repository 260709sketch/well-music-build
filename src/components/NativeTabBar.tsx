import React from 'react'
import { requireNativeComponent, ViewStyle, Platform, NativeSyntheticEvent } from 'react-native'

const NativeTabBarNative = requireNativeComponent('NativeTabBar')

interface NativeTabBarProps {
  selectedTab: string
  miniPlayerTitle: string
  miniPlayerArtist: string
  miniPlayerCoverUrl: string
  miniPlayerIsPlaying: boolean
  miniPlayerHasSong: boolean
  onTabSelect: (tab: string) => void
  onPlayPause: () => void
  onPrevious: () => void
  onNext: () => void
  onMiniPlayerPress: () => void
  style?: ViewStyle
}

const NativeTabBar: React.FC<NativeTabBarProps> = ({
  selectedTab,
  miniPlayerTitle,
  miniPlayerArtist,
  miniPlayerCoverUrl,
  miniPlayerIsPlaying,
  miniPlayerHasSong,
  onTabSelect,
  onPlayPause,
  onPrevious,
  onNext,
  onMiniPlayerPress,
  style,
}) => {
  if (Platform.OS !== 'ios') return null

  const handleTabSelect = (event: NativeSyntheticEvent<{ tab: string }>) => {
    onTabSelect(event.nativeEvent.tab)
  }

  return (
    <NativeTabBarNative
      style={style}
      selectedTab={selectedTab}
      miniPlayerTitle={miniPlayerTitle}
      miniPlayerArtist={miniPlayerArtist}
      miniPlayerCoverUrl={miniPlayerCoverUrl}
      miniPlayerIsPlaying={miniPlayerIsPlaying}
      miniPlayerHasSong={miniPlayerHasSong}
      onTabSelect={handleTabSelect}
      onPlayPause={onPlayPause}
      onPrevious={onPrevious}
      onNext={onNext}
      onMiniPlayerPress={onMiniPlayerPress}
    />
  )
}

export default NativeTabBar
