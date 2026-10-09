import React, { useEffect, useState } from 'react'
import { Platform, View, StyleSheet } from 'react-native'
import { usePathname, useRouter } from 'expo-router'
import NativeTabBar from './NativeTabBar'
import { useDockHideStore } from '@/store/dockHideStore'
import { useActiveTrack, useIsPlaying } from 'react-native-track-player'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useLastActiveTrack } from '@/hooks/useLastActiveTrack'
import { unknownTrackImageUri } from '@/constants/images'

// iOS 版本检测
const getIOSVersion = (): number => {
  if (Platform.OS !== 'ios') return 0
  const version = parseFloat(String(Platform.Version))
  return isNaN(version) ? 0 : version
}

export const isIOS26OrAbove = (): boolean => getIOSVersion() >= 26

// 路径 -> RootTab 映射
const routeToTab = (pathname: string): string => {
  if (pathname.startsWith('/radio') || pathname.startsWith('/(tabs)/radio')) return 'discover'
  if (pathname.startsWith('/favorites') || pathname.startsWith('/(tabs)/favorites')) return 'favorites'
  if (pathname.startsWith('/search') || pathname.startsWith('/(tabs)/search')) return 'search'
  if (pathname.startsWith('/profile') || pathname.startsWith('/(tabs)/profile')) return 'profile'
  return 'discover'
}

// tab -> 路由映射
const tabToRoute = (tab: string): string => {
  switch (tab) {
    case 'discover': return '/radio'
    case 'favorites': return '/favorites'
    case 'search': return '/search'
    case 'profile': return '/profile'
    default: return '/radio'
  }
}

const SystemNativeTabBar: React.FC = () => {
  const router = useRouter()
  const pathname = usePathname()
  const hidden = useDockHideStore((st) => st.hidden)
  const activeTrack = useActiveTrack()
  const lastActiveTrack = useLastActiveTrack()
  const { playing } = useIsPlaying()
  const currentMusic = myTrackPlayer.useCurrentMusic()
  const displayedTrack = currentMusic ?? activeTrack ?? lastActiveTrack

  const [selectedTab, setSelectedTab] = useState('discover')

  // 根据当前路径更新选中 tab
  useEffect(() => {
    setSelectedTab(routeToTab(pathname))
  }, [pathname])

  const handleTabSelect = (tab: string) => {
    setSelectedTab(tab)
    router.replace(tabToRoute(tab))
  }

  const handlePlayPause = () => {
    if (playing) {
      myTrackPlayer.fadePause()
    } else {
      myTrackPlayer.fadePlay()
    }
  }

  const handlePrevious = () => {
    myTrackPlayer.skipToPrevious()
  }

  const handleNext = () => {
    myTrackPlayer.skipToNext()
  }

  const handleMiniPlayerPress = () => {
    router.navigate('/player')
  }

  if (hidden) return null

  const hasSong = !!displayedTrack

  return (
    <View style={styles.container} pointerEvents="box-none">
      <NativeTabBar
        style={styles.tabBar}
        selectedTab={selectedTab}
        miniPlayerTitle={displayedTrack?.title ?? ''}
        miniPlayerArtist={displayedTrack?.artist ?? ''}
        miniPlayerCoverUrl={displayedTrack?.artwork ?? unknownTrackImageUri}
        miniPlayerIsPlaying={playing}
        miniPlayerHasSong={hasSong}
        onTabSelect={handleTabSelect}
        onPlayPause={handlePlayPause}
        onPrevious={handlePrevious}
        onNext={handleNext}
        onMiniPlayerPress={handleMiniPlayerPress}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBar: {
    height: 120, // 底部栏 + 迷你播放器高度
  },
})

export default SystemNativeTabBar
