// 「我的」页最近播放 = 网易云云端最近播放（与音乐库的本地历史分开）
import { unknownTrackImageUri } from '@/constants/images'
import { getNeteaseRecentSongs } from '@/helpers/userApi/netease-music-api'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useFocusEffect, useNavigation } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import PlaylistTemplateScreen from '@/components/PlaylistTemplateScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const ProfilePlayHistoryScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const navigation = useNavigation()
	const insets = useSafeAreaInsets()
	const { isLoggedIn, cookie } = useDailyRecommendStore()
	const [songs, setSongs] = useState<any[]>([])

	// 本次启动会话内该页面入场上浮只播一次（杀后台重进恢复）
	const [entranceEnabled] = useState(() => {
		const set: Set<string> = ((globalThis as any).__playedPageFloatSet ||= new Set())
		const key = 'profile_recent_play'
		if (set.has(key)) return false
		set.add(key)
		return true
	})

	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerTintColor: '#fc3c44',
			headerRight: null,
			headerTitle: '',
			headerBackVisible: true,
			headerBackTitle: '返回',
			headerShadowVisible: false,
			...getNavBarOptions(isDark, solidNavBarEnabled),
		})
	}, [navigation, isDark, solidNavBarEnabled])

	// 每次进入页面重新拉取云端最近播放
	useFocusEffect(
		useCallback(() => {
			let cancelled = false
			;(async () => {
				if (isLoggedIn && cookie) {
					const cloud = await getNeteaseRecentSongs(cookie, 50)
					if (!cancelled) setSongs(cloud)
				} else {
					if (!cancelled) setSongs([])
				}
			})()
			return () => { cancelled = true }
		}, [isLoggedIn, cookie]),
	)

	const firstSongCover = songs[0]?.artwork || unknownTrackImageUri

	const handlePlayAll = useCallback(() => {
		if (!songs.length) return
		myTrackPlayer.playWithReplacePlayList(songs[0], songs, '网易云最近播放')
	}, [songs])

	const handlePlaySong = useCallback(
		(song: any) => {
			myTrackPlayer.playWithReplacePlayList(song, songs, '网易云最近播放')
		},
		[songs],
	)

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<PlaylistTemplateScreen
				topInset={solidNavBarEnabled ? 0 : insets.top + 44 + 4}
				songs={songs}
				title="最近播放"
				coverUri={firstSongCover}
				searchPlaceholder="搜索最近播放的歌曲"
				showSearch={false}
				showPlatformLabel
				animateEntrance={entranceEnabled}
				onPlayAll={handlePlayAll}
				onPlaySong={handlePlaySong}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
})

export default ProfilePlayHistoryScreen
