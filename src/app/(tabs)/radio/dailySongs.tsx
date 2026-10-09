import React, { useCallback, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import { unknownTrackImageUri } from '@/constants/images'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'
import { useNavigation } from 'expo-router'
import PlaylistTemplateScreen from '@/components/PlaylistTemplateScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 同一会话内每日推荐只播一次入场上浮动画
const playedPlaylistFloatSet: Set<string> = ((globalThis as any).__playedPlaylistFloatSet ||= new Set())

const DailySongsScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const navigation = useNavigation()
	const { solidNavBarEnabled } = useSolidNavBar()
	const { tracks, refreshing } = useDailyRecommendStore()
	const insets = useSafeAreaInsets()

	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerTitle: '',
			headerTintColor: '#fc3c44',
			...getNavBarOptions(isDark, solidNavBarEnabled),
		})
	}, [navigation, isDark, solidNavBarEnabled])

	const [entranceEnabled] = useState(() => {
		const key = 'daily-recommend'
		if (playedPlaylistFloatSet.has(key)) return false
		playedPlaylistFloatSet.add(key)
		return true
	})

	const handlePlayAll = useCallback(() => {
		if (tracks.length === 0) return
		myTrackPlayer.playWithReplacePlayList(tracks[0] as any, tracks as any)
	}, [tracks])

	const handlePlayTrack = useCallback((song: any) => {
		if (!song) return
		myTrackPlayer.play(song as any)
	}, [])

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			{tracks.length > 0 ? (
				<PlaylistTemplateScreen
					topInset={solidNavBarEnabled ? 0 : insets.top + 44 + 4}
					songs={tracks as any[]}
					title="每日推荐"
					coverUri={tracks[0]?.artwork || unknownTrackImageUri}
					searchPlaceholder="搜索每日推荐"
					showSearch={false}
					description="根据你音乐口味生成 · 每天 6:00 更新"
					animateEntrance={entranceEnabled}
					onPlayAll={handlePlayAll}
					onPlaySong={handlePlayTrack}
				/>
			) : (
				<View style={styles.empty}>
					<ActivityIndicator size="small" color={colors.primary} />
					<Text style={[styles.emptyText, { color: colors.textMuted }]}>
						{refreshing ? '加载中...' : '暂无推荐'}
					</Text>
				</View>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	empty: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	emptyText: {
		marginTop: 10,
	},
})

export default DailySongsScreen