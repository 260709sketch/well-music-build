import { unknownTrackImageUri } from '@/constants/images'
import { getPlayHistory, clearPlayHistory, removeFromPlayHistory, PlayHistoryItem } from '@/helpers/playHistory'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useFocusEffect, useNavigation } from 'expo-router'
import React, { useCallback, useMemo, useState } from 'react'
import { ActionSheetIOS, Pressable, StyleSheet, View } from 'react-native'
import { showToast } from '@/utils/utils'
import PlaylistTemplateScreen from '@/components/PlaylistTemplateScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import SFSymbol from '@/components/SFSymbol'
import { MenuView } from '@react-native-menu/menu'

const PlayHistoryScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const navigation = useNavigation()
	const insets = useSafeAreaInsets()
	const [history, setHistory] = useState<PlayHistoryItem[]>([])

	// 本次启动会话内该页面入场上浮只播一次（杀后台重进恢复）
	const [entranceEnabled] = useState(() => {
		const set: Set<string> = ((globalThis as any).__playedPageFloatSet ||= new Set())
		const key = 'library_play_history'
		if (set.has(key)) return false
		set.add(key)
		return true
	})

	// 右上角 ⋯ 菜单（同歌单页样式：圆形浅灰底 + 三点，点击展开清除选项）
	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerTintColor: '#fc3c44',
...getNavBarOptions(isDark, solidNavBarEnabled),
			headerRight: () => (
				<MenuView
					title="最近播放"
					onPressAction={({ nativeEvent }) => {
						if (nativeEvent.event === 'clear') handleClearHistory()
					}}
					actions={[{ id: 'clear', title: '清除历史播放', image: 'trash', attributes: { destructive: true } }]}
				>
					<Pressable hitSlop={8} style={styles.headerMoreBtn}>
						<SFSymbol systemName="ellipsis" size={26} color="#fc3c44" weight="semibold" />
					</Pressable>
				</MenuView>
			),
		})
	}, [navigation])

	// 纯本地播放历史（不同步网易云）
	useFocusEffect(
		useCallback(() => {
			setHistory(getPlayHistory())
		}, []),
	)

	const songs = useMemo(() => history as any[], [history])
	const firstSongCover = songs[0]?.artwork || unknownTrackImageUri

	const handleClearHistory = () => {
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: ['取消', '清除历史播放'],
				cancelButtonIndex: 0,
				destructiveButtonIndex: 1,
				title: '确定要清除所有播放历史吗？',
			},
			(buttonIndex) => {
				if (buttonIndex === 1) {
					clearPlayHistory()
					setHistory([])
					showToast('历史播放已清除', '', 'success')
				}
			},
		)
	}

	const handlePlayAll = useCallback(() => {
		if (songs.length === 0) { showToast('暂无播放记录', '', 'info'); return }
		myTrackPlayer.playWithReplacePlayList(songs[0] as any, songs as any)
	}, [songs])

	const handlePlaySong = useCallback(
		(song: any) => {
			if (songs.length === 0) return
			myTrackPlayer.playWithReplacePlayList(song, songs as any)
		},
		[songs],
	)

	const handleRemoveFromHistory = useCallback((song: any) => {
		const songId = String(song.id || song.songmid || '')
		const newHistory = removeFromPlayHistory(songId)
		setHistory(newHistory)
		showToast('已从历史移除', '', 'success')
	}, [])

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<PlaylistTemplateScreen
				topInset={solidNavBarEnabled ? 0 : insets.top + 44 + 4}
				songs={songs}
				title="最近播放"
				coverUri={firstSongCover}
				searchPlaceholder="搜索历史歌曲"
				showPlatformLabel
				animateEntrance={entranceEnabled}
				removeLabel="从历史移除"
				onRemoveSong={handleRemoveFromHistory}
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
	headerMoreBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
	},
})

export default PlayHistoryScreen
