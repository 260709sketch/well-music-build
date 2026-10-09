import React, { useState, useCallback, useEffect } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
	View,
	Text,
	Modal,
	TouchableOpacity,
	StyleSheet,
	ActivityIndicator,
	FlatList,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import FastImage from 'react-native-fast-image'
import { MenuView } from '@react-native-menu/menu'
import { getNeteaseSimilarSongs } from '@/helpers/userApi/netease-music-api'
import { useThemeColors } from '@/hooks/useAppTheme'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { unknownTrackImageUri } from '@/constants/images'
import { showToast } from '@/utils/utils'

interface SimilarSongsModalProps {
	visible: boolean
	onClose: () => void
	songId: string
	songTitle: string
	platform: string
	onPlaySong?: (song: any) => void
}

export const SimilarSongsModal: React.FC<SimilarSongsModalProps> = ({
	visible,
	onClose,
	songId,
	songTitle,
	platform,
	onPlaySong,
}) => {
	const colors = useThemeColors()
	const [songs, setSongs] = useState<any[]>([])
	const [loading, setLoading] = useState(false)
	const [error, setError] = useState('')
	const loadedRef = React.useRef(false)

	const loadSongs = useCallback(async () => {
		if (loadedRef.current) return
		loadedRef.current = true
		setLoading(true)
		setError('')
		try {
			const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
			const list = await getNeteaseSimilarSongs(cleanId, 30, 0)
			const withCovers = list.map((s: any) => ({
				...s,
				artwork: s.artwork || s.picUrl || s.al?.picUrl || unknownTrackImageUri,
				url: '',
				id: s.id || s.songmid || String(Math.random()),
			}))
			setSongs(withCovers)
		} catch (e: any) {
			setError(e?.message || '加载失败')
		} finally {
			setLoading(false)
		}
	}, [songId])

	useEffect(() => {
		if (visible) {
			loadedRef.current = false
			loadSongs()
		}
	}, [visible, loadSongs])

	const handlePlay = useCallback((track: any) => {
		myTrackPlayer.play(track)
		onClose()
	}, [onClose])

	const handleMenuAction = useCallback((event: string, song: any) => {
		if (event === 'add-to-playlist') {
			myTrackPlayer.add(song as any)
			showToast('已添加到播放队列', '', 'success')
		} else if (event === 'insert-next') {
			myTrackPlayer.addAsNextTrack(song as any)
			showToast('已插播', '', 'success')
		}
	}, [])

	const renderSongItem = ({ item }: { item: any }) => (
		<TouchableOpacity
			style={styles.songItem}
			onPress={() => handlePlay(item)}
			activeOpacity={0.7}
		>
			<FastImage
				source={{ uri: item.artwork || unknownTrackImageUri }}
				style={styles.songCover}
			/>
			<View style={styles.songInfo}>
				<Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>
					{item.title || item.name || '未知歌曲'}
				</Text>
				<Text style={[styles.songArtist, { color: colors.textMuted }]} numberOfLines={1}>
					{item.artist || '未知歌手'}
				</Text>
			</View>
			<View onTouchEnd={(e) => e.stopPropagation()} onStartShouldSetResponder={() => true}>
				<MenuView
					onPressAction={({ nativeEvent: { event } }) => handleMenuAction(event, item)}
					actions={[
						{ id: 'add-to-playlist', title: '添加到播放队列', image: 'plus' },
						{ id: 'insert-next', title: '插播', image: 'arrow.forward.circle' },
					]}
				>
					<View style={styles.moreButton}>
						<SFSymbol systemName="ellipsis" size={20} color={colors.textMuted} />
					</View>
				</MenuView>
			</View>
		</TouchableOpacity>
	)

	return (
		<Modal
			visible={visible}
			animationType="slide"
			presentationStyle="pageSheet"
			onRequestClose={onClose}
		>
			<View style={[styles.container, { backgroundColor: colors.background }]}>
				<View style={styles.header}>
					<Text style={[styles.headerTitle, { color: colors.text }]}>相似歌曲</Text>
					<Text style={[styles.headerCount, { color: colors.textMuted }]}>
						{songs.length > 0 ? `${songs.length} 首` : ''}
					</Text>
				</View>

				{loading ? (
					<View style={styles.center}>
						<ActivityIndicator size="large" color={colors.textMuted} />
					</View>
				) : error ? (
					<View style={styles.center}>
						<Text style={{ color: colors.textMuted, textAlign: 'center', padding: 20 }}>{error}</Text>
					</View>
				) : (
					<FlatList
						data={songs}
						renderItem={renderSongItem}
						keyExtractor={(item) => String(item.id || item.songmid)}
						contentContainerStyle={{ paddingBottom: 30 }}
						showsVerticalScrollIndicator={false}
					/>
				)}
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 20,
		paddingVertical: 14,
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: 'rgba(128,128,128,0.2)',
	},
	headerTitle: {
		fontSize: 17,
		fontWeight: '500',
	},
	headerCount: {
		fontSize: 14,
		marginLeft: 8,
		fontWeight: '500',
	},
	center: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	songItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 10,
	},
	songCover: {
		width: 52,
		height: 52,
		borderRadius: 10,
	},
	songInfo: {
		flex: 1,
		marginLeft: 14,
	},
	songTitle: {
		fontSize: 17,
		fontWeight: '500',
	},
	songArtist: {
		fontSize: 14,
		marginTop: 3,
		fontWeight: '500',
	},
	moreButton: {
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
})
