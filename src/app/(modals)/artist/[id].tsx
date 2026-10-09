import React, { useEffect, useState } from 'react'
import { View, ActivityIndicator, StyleSheet, Alert } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import ArtistProfileScreen, { ArtistProfile, ArtistSong, ArtistAlbum } from '@/components/ArtistProfileScreen'
import NewArtistProfileScreen from '@/components/NewArtistProfileScreen'
import PersistStatus from '@/store/PersistStatus'
import { getSingerDetail, getAlbumList } from '@/helpers/userApi/getMusicSource'
import { getNeteaseSingerAlbums } from '@/helpers/userApi/netease-music-api'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { Track } from 'react-native-track-player'


export default function ArtistPage() {
	const { id } = useLocalSearchParams<{ id: string }>()
	const { top, bottom } = useSafeAreaInsets()
	const [artist, setArtist] = useState<ArtistProfile | null>(null)
	const [loading, setLoading] = useState(true)
	const oldArtistPage = PersistStatus.get('music.oldArtistPage' as any) === true

	useEffect(() => {
		if (!id) return
		setLoading(true)
		getSingerDetail(id)
			.then(async (detail) => {
				if (detail) {
					const songs: ArtistSong[] = (detail.musicList || []).slice(0, 10).map((song: Track, index: number) => {
						const pubTime = (song as any).public_time || (song as any).publishTime || ''
						let year = ''
						if (pubTime) {
							const m = String(pubTime).match(/\d{4}/)
							if (m) year = m[0]
						}
						return {
							id: String(song.id || song.songmid || index),
							title: song.title || '未知歌曲',
							subtitle: song.artist || '',
							artwork: song.artwork || '',
							duration: song.duration ? `${Math.floor(song.duration / 60)}:${String(Math.floor(song.duration % 60)).padStart(2, '0')}` : '',
							songmid: song.songmid || String(song.id || ''),
							platform: song.platform || song.source || '',
							source: song.source || song.platform || '',
							originalId: song.originalId || song.id,
							album: (song as any).album || '',
							year,
						}
					})

						// 获取专辑和EP/单曲（所有平台）
						const artistIdStr = String(detail.id || id)
						const isNetease = artistIdStr.startsWith("netease_") || /^\d+$/.test(artistIdStr)
						const isKugou = artistIdStr.startsWith("kugou_") || artistIdStr.startsWith("kg_")
						const isKuwo = artistIdStr.startsWith("kuwo_") || artistIdStr.startsWith("kw_")
						let albums: ArtistAlbum[] = []
						let eps: ArtistAlbum[] = []
						if (isNetease) {
							try {
								const cleanId = artistIdStr.replace(/^(netease_|wy_)/, "")
								const rawAlbums = await getNeteaseSingerAlbums(cleanId, 0, 30)
								const mapped: ArtistAlbum[] = rawAlbums.map((a: any) => ({
									id: a.album_mid || String(a.id || ""),
									title: a.album_name || a.name || "",
									subtitle: a.subType || "",
									artwork: a.artwork || a.picUrl || "",
								}))
								albums = mapped.filter((a: ArtistAlbum) => a.subtitle === "专辑")
								eps = mapped.filter((a: ArtistAlbum) => a.subtitle === "EP" || a.subtitle === "单曲")
							} catch (e) {
								console.warn("获取歌手专辑失败:", e)
							}
						} else if (isKugou || isKuwo) {
							// 酷狗/酷我：获取全部专辑（参考Kumone，传入大limit，API内部循环获取所有页，每页100张，最多2000张）
							try {
								const allAlbums = await getAlbumList(artistIdStr, 0, 9999)
								const mapped: ArtistAlbum[] = allAlbums.map((a: any) => ({
									id: a.album_mid || a.albumId || String(a.id || ""),
									title: a.album_name || a.name || a.title || "",
									subtitle: a.subType || a.album_type || "",
									artwork: a.artwork || a.picUrl || a.img || "",
								}))
								// 按分类拆分：专辑归专辑栏，EP/单曲归 EP与单曲 栏（镜像平台分类）
								albums = mapped.filter((a: ArtistAlbum) => a.subtitle === "专辑" || (a.subtitle !== "EP" && a.subtitle !== "单曲"))
								eps = mapped.filter((a: ArtistAlbum) => a.subtitle === "EP" || a.subtitle === "单曲")
								console.log(`[歌手专辑] ${isKugou ? '酷狗' : '酷我'}歌手获取专辑${albums.length}张，EP/单曲${eps.length}个（全部）`)
							} catch (e) {
								console.warn("获取歌手专辑失败:", e)
							}
						}
					setArtist({
						id: detail.id || id,
						name: detail.title || '未知歌手',
						genre: '歌手',
						heroImage: detail.singerImg || '',
						avatar: detail.singerImg || '',
						songs,
						albums,
						eps,
						compilations: [],
						playlists: [],
						videos: [],
					})
				}
			})
			.catch((error) => {
				console.error('获取歌手详情失败:', error)
			})
			.finally(() => setLoading(false))
	}, [id])

	const handlePlaySong = async (song: ArtistSong) => {
		try {
			const allSongs = artist?.songs || []
			const songIndex = allSongs.findIndex((s) => s.id === song.id)
			if (songIndex >= 0) {
				const tracks = allSongs.map((s, i) => ({
					id: s.id,
					url: '',
					title: s.title,
					artist: s.subtitle || '',
					artwork: s.artwork || '',
					duration: 0,
					songmid: s.songmid || s.id,
					platform: s.platform || s.source || '',
					source: s.source || s.platform || '',
					originalId: s.originalId || s.id,
				}))
				await (myTrackPlayer as any).setQueue(tracks)
				await (myTrackPlayer as any).skip(songIndex)
				await myTrackPlayer.play()
			}
		} catch (error) {
			console.error('播放歌曲失败:', error)
		}
	}

	const handlePlayAll = async (songs: ArtistSong[]) => {
		try {
			const tracks = songs.map((s) => ({
				id: s.id,
				url: '',
				title: s.title,
				artist: s.subtitle || '',
				artwork: s.artwork || '',
				duration: 0,
				songmid: s.songmid || s.id,
				platform: s.platform || s.source || '',
				source: s.source || s.platform || '',
				originalId: s.originalId || s.id,
			}))
			await (myTrackPlayer as any).setQueue(tracks)
			await myTrackPlayer.play()
		} catch (error) {
			console.error('播放全部失败:', error)
		}
	}

	const handleMore = (song: ArtistSong) => {
		Alert.alert(
			song.title,
			`歌手：${song.subtitle || '未知'}`,
			[
				{ text: '播放', onPress: () => handlePlaySong(song) },
				{ text: '取消', style: 'cancel' },
			]
		)
	}

	if (loading) {
		return (
			<View style={[styles.loadingContainer, { paddingTop: top }]}>
				<ActivityIndicator size="large" color="#fff" />
			</View>
		)
	}

	if (!artist) {
		return (
			<View style={[styles.loadingContainer, { paddingTop: top }]}>
				<ActivityIndicator size="large" color="#fff" />
			</View>
		)
	}


	return (
		<View style={{ flex: 1, backgroundColor: '#0e0d12' }}>
			{oldArtistPage ? (
			<ArtistProfileScreen
				artist={artist}
				onBack={() => router.back()}
				onPlaySong={handlePlaySong}
				onPlayAll={handlePlayAll}
				onMore={handleMore}
				onOpenAlbum={() => {}}
				onOpenPlaylist={() => {}}
				onOpenVideo={() => {}}
			/>
		) : (
			<NewArtistProfileScreen
				artist={artist}
				onBack={() => router.back()}
				onPlaySong={handlePlaySong}
				onPlayAll={handlePlayAll}
				onOpenAlbum={() => {}}
			/>
		) }
			{/* 底部迷你播放器 */}
			
		</View>
	)
}

const styles = StyleSheet.create({
	loadingContainer: {
		flex: 1,
		backgroundColor: '#0e0d12',
		alignItems: 'center',
		justifyContent: 'center',
	},
})
