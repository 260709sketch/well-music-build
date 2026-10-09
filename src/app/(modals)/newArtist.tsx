import React from 'react'
import SFSymbol from '@/components/SFSymbol'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from 'react-native-fast-image'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, router } from 'expo-router'
import { useAppTheme } from '@/hooks/useAppTheme'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { unknownTrackImageUri } from '@/constants/images'

export default function NewArtistScreen() {
	const insets = useSafeAreaInsets()
	const { isDark } = useAppTheme()
	const params = useLocalSearchParams<any>()

	let songs: any[] = []
	let albums: any[] = []
	try { if (params.songs) songs = JSON.parse(params.songs) } catch (e) {}
	try { if (params.albums) albums = JSON.parse(params.albums) } catch (e) {}
	// 最多展示50首，避免大量歌曲导致闪退
	songs = songs.slice(0, 50)
	const artist = {
		name: params.name || '歌手',
		avatar: params.avatar || '',
		songs,
		albums,
	}

	return (
		<View style={[styles.container, { backgroundColor: isDark ? '#000' : '#fff' }]}>
			<View style={styles.dragIndicator} />

			<View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
				<View style={{ width: 50 }} />
				<Text style={[styles.navTitle, { color: isDark ? '#fff' : '#000' }]}>歌手主页</Text>
				<TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
					<Text style={styles.navDone}>完成</Text>
				</TouchableOpacity>
			</View>

			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
				<View style={styles.header}>
					<FastImage
						source={{ uri: artist.avatar || unknownTrackImageUri }}
						style={styles.avatar}
					/>
					<View style={styles.headerInfo}>
						<Text style={[styles.artistName, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{artist.name}</Text>
						<Text style={styles.artistSub} numberOfLines={1}>
							热门歌曲 {artist.songs.length} 首{artist.albums.length ? ` · 专辑 ${artist.albums.length} 张` : ''}
						</Text>
					</View>
				</View>

				<Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>热门歌曲</Text>

				{artist.songs.length > 0 && (
					<View style={styles.playButtons}>
						<TouchableOpacity style={styles.playAllBtn} onPress={() => { if (artist.songs.length > 0) myTrackPlayer.playWithReplacePlayList(artist.songs[0], artist.songs, artist.name || null) }}>
							<SFSymbol systemName="play.fill" size={13} color="#ffffff" />
							<Text style={styles.playAllText}>播放全部</Text>
						</TouchableOpacity>
					</View>
				)}

				{artist.songs.length === 0 ? (
					<Text style={styles.emptyText}>暂无歌曲</Text>
				) : (
					artist.songs.map((song: any, index: number) => (
						<TouchableOpacity key={song.id || index} style={styles.songRow} onPress={() => {
							const idx = artist.songs.findIndex((s: any) => String(s.id) === String(song.id))
							myTrackPlayer.setQueue(artist.songs).then(() => myTrackPlayer.skip(idx >= 0 ? idx : 0))
						}}>
							<Text style={[styles.songIndex, { color: index < 3 ? '#F85B5B' : '#999' }]}>{index + 1}</Text>
							<FastImage
								source={{ uri: song.artwork || unknownTrackImageUri }}
								style={styles.songCover}
							/>
							<View style={styles.songInfo}>
								<Text style={[styles.songTitle, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{song.title}</Text>
								<Text style={styles.songSub} numberOfLines={1}>{song.album || song.subtitle || ''}</Text>
							</View>
						</TouchableOpacity>
					))
				)}

				{artist.albums.length > 0 && (
					<>
						<Text style={[styles.sectionTitle, { marginTop: 20, color: isDark ? '#fff' : '#000' }]}>专辑</Text>
						<View style={styles.albumGrid}>
							{artist.albums.map((album: any, index: number) => (
								<TouchableOpacity key={album.id || index} style={styles.albumCard}>
									<FastImage
										source={{ uri: album.artwork || unknownTrackImageUri }}
										style={styles.albumCover}
									/>
									<Text style={[styles.albumTitle, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{album.title}</Text>
									{album.subtitle ? (
										<Text style={styles.albumSub} numberOfLines={1}>{album.subtitle}</Text>
									) : null}
								</TouchableOpacity>
							))}
						</View>
					</>
				)}
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	dragIndicator: {
		width: 36,
		height: 5,
		borderRadius: 3,
		backgroundColor: '#ccc',
		alignSelf: 'center',
		marginTop: 8,
	},
	navBar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		height: 44,
	},
	navTitle: {
		fontSize: 17,
		fontWeight: '500',
	},
	navDone: {
		fontSize: 17,
		color: '#F85B5B',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 20,
		marginTop: 20,
	},
	avatar: {
		width: 72,
		height: 72,
		borderRadius: 36,
	},
	headerInfo: {
		marginLeft: 16,
		flex: 1,
	},
	artistName: {
		fontSize: 20,
		fontWeight: '500',
	},
	artistSub: {
		fontSize: 12,
		color: '#999',
		marginTop: 4,
	},
	sectionTitle: {
		fontSize: 17,
		fontWeight: '500',
		marginLeft: 20,
		marginTop: 24,
		marginBottom: 12,
	},
	playButtons: {
		flexDirection: 'row',
		paddingHorizontal: 20,
		marginBottom: 16,
	},
	playAllBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: '#F85B5B',
		paddingHorizontal: 16,
		height: 38,
		borderRadius: 19,
		paddingHorizontal: 16,
	},
	playAllText: {
		color: '#fff',
		fontSize: 14,
		fontWeight: '500',
		marginLeft: 4,
	},
	emptyText: {
		fontSize: 14,
		color: '#999',
		textAlign: 'center',
		marginTop: 40,
	},
	songRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 20,
		paddingVertical: 8,
	},
	songIndex: {
		fontSize: 14,
		width: 24,
	},
	songCover: {
		width: 40,
		height: 40,
		borderRadius: 6,
		marginRight: 12,
	},
	songInfo: {
		flex: 1,
	},
	songTitle: {
		fontSize: 15,
		fontWeight: '500',
	},
	songSub: {
		fontSize: 12,
		color: '#999',
		marginTop: 2,
	},
	albumGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		paddingHorizontal: 20,
	},
	albumCard: {
		width: '30%',
		marginRight: '3.33%',
		marginBottom: 16,
	},
	albumCover: {
		width: '100%',
		aspectRatio: 1,
		borderRadius: 12,
	},
	albumTitle: {
		fontSize: 13,
		fontWeight: '500',
		marginTop: 6,
	},
	albumSub: {
		fontSize: 11,
		color: '#999',
		marginTop: 2,
	},
})
