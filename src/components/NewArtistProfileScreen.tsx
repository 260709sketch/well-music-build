import React, { useState, useMemo } from 'react'
import SFSymbol from '@/components/SFSymbol'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from 'react-native-fast-image'
import { LinearGradient } from 'expo-linear-gradient'
import { Ionicons } from '@expo/vector-icons'
import { ArtistProfile, ArtistSong, ArtistAlbum } from './ArtistProfileScreen'

interface Props {
	artist: ArtistProfile
	onBack: () => void
	onPlaySong: (song: ArtistSong) => void
	onPlayAll: (songs: ArtistSong[]) => void
	onOpenAlbum: (album: ArtistAlbum) => void
}

export default function NewArtistProfileScreen({ artist, onBack, onPlaySong, onPlayAll, onOpenAlbum }: Props) {
	const insets = useSafeAreaInsets()


	const allAlbums = useMemo(() => {
		return [...(artist.albums || []), ...(artist.eps || [])]
	}, [artist.albums, artist.eps])

	return (
		<View style={styles.container}>
			<View style={styles.dragIndicator} />

			<View style={[styles.navBar, { paddingTop: insets.top + 4 }]}>
				<View style={{ width: 50 }} />
				<Text style={styles.navTitle}>歌手主页</Text>
				<TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
					<Text style={styles.navDone}>完成</Text>
				</TouchableOpacity>
			</View>

			<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
				<View style={styles.header}>
					<FastImage
						source={{ uri: artist.avatar || artist.heroImage || '' }}
						style={styles.avatar}
					/>
					<View style={styles.headerInfo}>
						<Text style={styles.artistName} numberOfLines={1}>{artist.name}</Text>
						<Text style={styles.artistSub} numberOfLines={1}>
							热门歌曲 {artist.songs.length} 首{allAlbums.length ? ` · 专辑 ${allAlbums.length} 张` : ''}
						</Text>
					</View>
				</View>

				<Text style={styles.sectionTitle}>热门歌曲</Text>

				{artist.songs.length > 0 && (
					<View style={styles.playButtons}>
						<TouchableOpacity style={[styles.playAllBtnWrap, { flex: 1 }]} onPress={() => onPlayAll(artist.songs)} activeOpacity={0.85}>
							<LinearGradient
								colors={['#FF6B6B', '#D63031']}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 0 }}
								style={styles.playAllBtn}
							>
								<SFSymbol systemName="play.fill" size={16} color="#ffffff" />
								<Text style={styles.playAllText}>播放全部</Text>
							</LinearGradient>
						</TouchableOpacity>
						<TouchableOpacity style={styles.shuffleBtn} onPress={() => onPlayAll([...artist.songs].sort(() => Math.random() - 0.5))}>
							<SFSymbol systemName="shuffle" size={13} color="#F85B5B" />
							<Text style={styles.shuffleText}>随机播放</Text>
						</TouchableOpacity>
					</View>
				)}


				{artist.songs.length === 0 ? (
					<Text style={styles.emptyText}>暂无歌曲</Text>
				) : (
					artist.songs.map((song, index) => (
						<TouchableOpacity key={song.id || index} style={styles.songRow} onPress={() => onPlaySong(song)}>
							<Text style={[styles.songIndex, { color: index < 3 ? '#F85B5B' : '#999' }]}>{index + 1}</Text>
							<FastImage
								source={{ uri: song.artwork || '' }}
								style={styles.songCover}
							/>
							<View style={styles.songInfo}>
								<Text style={styles.songTitle} numberOfLines={1}>{song.title}</Text>
								<Text style={styles.songSub} numberOfLines={1}>{song.album || song.subtitle || ''}</Text>
							</View>
						</TouchableOpacity>
					))
				)}

				{allAlbums.length > 0 && (
					<>
						<Text style={[styles.sectionTitle, { marginTop: 20 }]}>专辑</Text>
						<View style={styles.albumGrid}>
							{allAlbums.map((album, index) => (
								<TouchableOpacity key={album.id || index} style={styles.albumCard} onPress={() => onOpenAlbum(album)}>
									<FastImage
										source={{ uri: album.artwork || '' }}
										style={styles.albumCover}
									/>
									<Text style={styles.albumTitle} numberOfLines={1}>{album.title}</Text>
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
		backgroundColor: '#fff',
		borderTopLeftRadius: 12,
		borderTopRightRadius: 12,
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
		paddingBottom: 10,
	},
	navTitle: {
		fontSize: 17,
		fontWeight: '500',
		color: '#000',
	},
	navDone: {
		fontSize: 16,
		color: '#007AFF',
		fontWeight: '500',
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	avatar: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: '#f0f0f0',
	},
	headerInfo: {
		flex: 1,
		marginLeft: 14,
	},
	artistName: {
		fontSize: 20,
		fontWeight: '500',
		color: '#000',
	},
	artistSub: {
		fontSize: 12,
		color: '#999',
		marginTop: 4,
	},
	sectionTitle: {
		fontSize: 17,
		fontWeight: '500',
		color: '#000',
		paddingHorizontal: 16,
		marginTop: 10,
		marginBottom: 8,
	},
	playButtons: {
		flexDirection: 'row',
		paddingHorizontal: 16,
		gap: 10,
		marginBottom: 10,
	},
	playAllBtnWrap: {
		borderRadius: 22,
	},
	playAllBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingVertical: 10,
		borderRadius: 22,
	},
	playAllText: {
		fontSize: 13,
		fontWeight: '500',
		color: '#fff',
	},
	shuffleBtn: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
		paddingVertical: 10,
		borderRadius: 22,
		borderWidth: 1,
		borderColor: 'rgba(248,91,91,0.5)',
	},
	shuffleText: {
		fontSize: 13,
		fontWeight: '500',
		color: '#F85B5B',
	},
	searchWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		marginHorizontal: 16,
		paddingHorizontal: 12,
		paddingVertical: 9,
		borderRadius: 14,
		backgroundColor: '#f5f5f5',
		marginBottom: 4,
		gap: 6,
	},
	searchInput: {
		flex: 1,
		fontSize: 14,
		color: '#000',
		padding: 0,
	},
	songRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 6,
		paddingHorizontal: 16,
	},
	songIndex: {
		width: 22,
		fontSize: 13,
		fontWeight: '500',
	},
	songCover: {
		width: 40,
		height: 40,
		borderRadius: 8,
		backgroundColor: '#f0f0f0',
	},
	songInfo: {
		flex: 1,
		marginLeft: 12,
	},
	songTitle: {
		fontSize: 14,
		fontWeight: '500',
		color: '#000',
	},
	songSub: {
		fontSize: 11,
		color: '#999',
		marginTop: 2,
	},
	emptyText: {
		fontSize: 13,
		color: '#999',
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	albumGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		paddingHorizontal: 10,
	},
	albumCard: {
		width: '48%',
		marginHorizontal: '1%',
		marginBottom: 12,
		padding: 6,
		borderRadius: 16,
		backgroundColor: '#f5f5f5',
	},
	albumCover: {
		width: '100%',
		aspectRatio: 1,
		borderRadius: 12,
		backgroundColor: '#e0e0e0',
	},
	albumTitle: {
		fontSize: 11,
		fontWeight: '500',
		color: '#000',
		marginTop: 6,
	},
	albumSub: {
		fontSize: 10,
		color: '#999',
		marginTop: 2,
	},
})
