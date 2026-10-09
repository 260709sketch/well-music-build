import { unknownTrackImageUri } from '@/constants/images'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'
import { useNavigation } from 'expo-router'
import React, { useCallback, useMemo } from 'react'
import { StyleSheet, View } from 'react-native'
import { useFavorites } from '@/store/library'
import { showToast } from '@/utils/utils'
import PlaylistTemplateScreen from '@/components/PlaylistTemplateScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const FavoriteMusicScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const navigation = useNavigation()
	const insets = useSafeAreaInsets()
	const { favorites, toggleTrackFavorite } = useFavorites()

	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerTintColor: '#fc3c44',
...getNavBarOptions(isDark, solidNavBarEnabled),
			headerRight: null,
		})
	}, [navigation])

	const songs = useMemo(() => favorites as any[], [favorites])
	const firstSongCover = songs[0]?.artwork || unknownTrackImageUri

	const handlePlayAll = useCallback(() => {
		if (songs.length === 0) { showToast('收藏为空', '', 'info'); return }
		myTrackPlayer.playWithReplacePlayList(songs[0] as any, songs as any)
	}, [songs])

	const handlePlaySong = useCallback((song: any) => {
		if (songs.length === 0) return
		myTrackPlayer.playWithReplacePlayList(song, songs as any)
	}, [songs])

	const handleRemoveFavorite = useCallback((song: any) => {
		toggleTrackFavorite(song)
		showToast('已取消收藏', '', 'success')
	}, [toggleTrackFavorite])

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<PlaylistTemplateScreen
				topInset={solidNavBarEnabled ? 0 : insets.top + 44 + 4}
				songs={songs}
				title="收藏歌曲"
				coverUri={firstSongCover}
				searchPlaceholder="搜索收藏歌曲"
				removeLabel="取消收藏"
				onRemoveSong={handleRemoveFavorite}
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

export default FavoriteMusicScreen