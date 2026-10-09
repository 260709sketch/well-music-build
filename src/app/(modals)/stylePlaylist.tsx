import React, { useCallback, useEffect, useState } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
	ActivityIndicator,
	FlatList,
	Image,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useRouter } from 'expo-router'
import { Ionicons } from '@expo/vector-icons'
import FastImage from 'react-native-fast-image'
import { getRandomRecommendPlaylist } from '@/helpers/userApi/netease-music-api'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { unknownTrackImageUri } from '@/constants/images'

type PlaylistSong = {
	id: string
	songmid: string
	platform: string
	source: string
	title: string
	artist: string
	album: string
	artwork: string
	duration: number
	url: string
}

type PlaylistData = {
	id: number
	name: string
	coverImgUrl: string
	songs: PlaylistSong[]
}

const StylePlaylistScreen = () => {
	const router = useRouter()
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const [playlist, setPlaylist] = useState<PlaylistData | null>(null)
	const [loading, setLoading] = useState(true)
	const [refreshing, setRefreshing] = useState(false)

	const loadPlaylist = useCallback(async () => {
		try {
			setLoading(true)
			const data = await getRandomRecommendPlaylist()
			if (data) {
				setPlaylist(data)
			}
		} catch (error) {
			console.error('加载风格化歌单失败:', error)
		} finally {
			setLoading(false)
			setRefreshing(false)
		}
	}, [])

	useEffect(() => {
		loadPlaylist()
	}, [loadPlaylist])

	const handleRefresh = useCallback(() => {
		setRefreshing(true)
		loadPlaylist()
	}, [loadPlaylist])

	const handlePlayAll = useCallback(() => {
		if (!playlist || playlist.songs.length === 0) return
		myTrackPlayer.playWithReplacePlayList(playlist.songs[0] as any, playlist.songs as any, playlist.name || playlist.title || null)
	}, [playlist])

	const handlePlaySong = useCallback(
		(index: number) => {
			if (!playlist || playlist.songs.length === 0) return
			myTrackPlayer.playWithReplacePlayList(playlist.songs[index] as any, playlist.songs as any, playlist.name || playlist.title || null)
		},
		[playlist],
	)

	const formatDuration = (seconds: number) => {
		const mins = Math.floor(seconds / 60)
		const secs = Math.floor(seconds % 60)
		return `${mins}:${String(secs).padStart(2, '0')}`
	}

	const renderSongItem = ({ item, index }: { item: PlaylistSong; index: number }) => (
		<TouchableOpacity
			style={styles.songItem}
			onPress={() => handlePlaySong(index)}
			activeOpacity={0.7}
		>
			<Text style={[styles.songIndex, { color: colors.textMuted }]}>{index + 1}</Text>
			<View style={styles.songInfo}>
				<Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>
					{item.title}
				</Text>
				<Text style={[styles.songArtist, { color: colors.textMuted }]} numberOfLines={1}>
					{item.artist}
				</Text>
			</View>
			<Text style={[styles.songDuration, { color: colors.textMuted }]}>
				{formatDuration(item.duration)}
			</Text>
		</TouchableOpacity>
	)

	return (
		<SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
			{/* 顶部导航栏 */}
			<View style={styles.header}>
				<TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
					<SFSymbol systemName="chevron.left" size={28} color={colors.text} />
				</TouchableOpacity>
				<Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1}>
					风格化歌单
				</Text>
				<TouchableOpacity onPress={handleRefresh} style={styles.refreshButton}>
					{refreshing ? (
						<ActivityIndicator size="small" color={colors.text} />
					) : (
						<SFSymbol systemName="arrow.clockwise" size={22} color={colors.text} />
					)}
				</TouchableOpacity>
			</View>

			{loading ? (
				<View style={styles.loadingContainer}>
					<ActivityIndicator size="large" color={colors.primary} />
					<Text style={[styles.loadingText, { color: colors.textMuted }]}>加载中...</Text>
				</View>
			) : (
				<FlatList
					data={playlist?.songs || []}
					renderItem={renderSongItem}
					keyExtractor={(item) => item.id}
					ListHeaderComponent={
						playlist ? (
							<View style={styles.playlistHeader}>
								<FastImage
									source={{ uri: playlist.coverImgUrl || unknownTrackImageUri }}
									style={styles.playlistCover}
								/>
								<Text style={[styles.playlistName, { color: colors.text }]} numberOfLines={2}>
									{playlist.name}
								</Text>
								<Text style={[styles.playlistCount, { color: colors.textMuted }]}>
									共 {playlist.songs.length} 首歌曲
								</Text>
								<TouchableOpacity style={styles.playAllButton} onPress={handlePlayAll}>
									<SFSymbol systemName="play.fill" size={18} color="#ffffff" />
									<Text style={styles.playAllText}>播放全部</Text>
								</TouchableOpacity>
							</View>
						) : null
					}
					contentContainerStyle={styles.listContent}
				/>
			)}
		</SafeAreaView>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		height: 50,
	},
	backButton: {
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	headerTitle: {
		flex: 1,
		fontSize: 18,
		fontWeight: '500',
		textAlign: 'center',
	},
	refreshButton: {
		width: 40,
		height: 40,
		alignItems: 'center',
		justifyContent: 'center',
	},
	loadingContainer: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	loadingText: {
		marginTop: 12,
		fontSize: 14,
	},
	listContent: {
		paddingBottom: 100,
	},
	playlistHeader: {
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingTop: 20,
		paddingBottom: 24,
	},
	playlistCover: {
		width: 180,
		height: 180,
		borderRadius: 12,
		marginBottom: 16,
	},
	playlistName: {
		fontSize: 20,
		fontWeight: '500',
		textAlign: 'center',
		marginBottom: 8,
	},
	playlistCount: {
		fontSize: 14,
		marginBottom: 16,
	},
	playAllButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: '#fa233b',
		paddingHorizontal: 32,
		paddingVertical: 10,
		borderRadius: 20,
		gap: 6,
	},
	playAllText: {
		color: '#fff',
		fontSize: 15,
		fontWeight: '500',
	},
	songItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	songIndex: {
		width: 30,
		fontSize: 14,
		textAlign: 'center',
	},
	songInfo: {
		flex: 1,
		marginLeft: 8,
	},
	songTitle: {
		fontSize: 15,
		fontWeight: '500',
	},
	songArtist: {
		fontSize: 12,
		marginTop: 2,
	},
	songDuration: {
		fontSize: 13,
		marginLeft: 8,
	},
})

export default StylePlaylistScreen
