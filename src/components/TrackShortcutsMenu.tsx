import myTrackPlayer, { playListsStore } from '@/helpers/trackPlayerIndex'
import { resolveTrackAlbum } from '@/helpers/userApi/resolveTrackAlbum'
import { resolveTrackBySearch } from '@/helpers/userApi/resolveTrackBySearch'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'
import { likeNeteaseSong } from '@/helpers/userApi/netease-music-api'
import { useFavorites } from '@/store/library'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { isInPlayList } from '@/store/playList'
import { useQueue } from '@/store/queue'
import { DownloadQualityModal } from '@/components/DownloadQualityModal'
import i18n from '@/utils/i18n'
import { showToast } from '@/utils/utils'
import { MenuAction, MenuView } from '@react-native-menu/menu'
import { useFocusEffect, useRouter } from 'expo-router'
import { PropsWithChildren, useCallback, useMemo, useState } from 'react'
import { ActionSheetIOS, Alert, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { BlurView } from 'expo-blur'
import FastImage from 'react-native-fast-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Track } from 'react-native-track-player'
import { match } from 'ts-pattern'

type TrackShortcutsMenuProps = PropsWithChildren<{
	track: Track
	isSinger?: boolean
	allowDelete?: boolean
	onDeleteTrack?: (trackId: string) => void
	showInsertNext?: boolean
	// 开启后长按不再弹出原生下拉菜单，改为"背景模糊 + 底部菜单"（对齐 iOS 长按 Context Menu 效果）
	blurBackdrop?: boolean
}>

export const TrackShortcutsMenu = ({
	track,
	children,
	isSinger,
	allowDelete,
	onDeleteTrack,
	showInsertNext = true,
	blurBackdrop = false,
}: TrackShortcutsMenuProps) => {
	const router = useRouter()
	const insets = useSafeAreaInsets()
	const { favorites, toggleTrackFavorite } = useFavorites()
	const { isLoggedIn, cookie } = useDailyRecommendStore()
	const isFavorite = favorites.find((trackItem) => trackItem.id === track?.id)
	const { activeQueueId } = useQueue()

	const [isInPlaylist, setIsInPlaylist] = useState(false)
	const [showDownloadModal, setShowDownloadModal] = useState(false)
	const [showBlurMenu, setShowBlurMenu] = useState(false)
	const storedPlayLists = playListsStore.useValue() as any[] | null

	// 只显示自建歌单（排除收藏歌单和导入的歌单）
	const customPlaylists = useMemo(() => {
		if (!storedPlayLists) return []
		return storedPlayLists.filter((p) => p.platform === 'custom' || p.platform === 'local' || p.id?.startsWith('custom_') || p.id?.startsWith('local_'))
	}, [storedPlayLists])

	// 解析当前歌曲的歌手（覆盖 singer/singers/artists/ar 数组 与 artist/singerName 字符串），
	// 每名歌手各生成一条菜单项，最多取前 3 位
	const singerNames = useMemo(() => {
		const t = track as any
		const seen = new Set<string>()
		const push = (v: any) => {
			const n = String(v || '').trim()
			if (n && !n.includes('未知') && !seen.has(n)) {
				seen.add(n)
				return n
			}
			return null
		}
		const out: string[] = []
		// 1) 数组字段：singers/singer/artists/ar/artistList/singerList/artistIds
		const arrFields = [t?.singers, t?.singer, t?.artists, t?.ar, t?.artistList, t?.singerList, t?.artistIds]
		for (const field of arrFields) {
			if (!Array.isArray(field)) continue
			let got = false
			for (const it of field) {
				if (it === null || it === undefined) continue
				if (typeof it === 'object') {
					const n = push(it?.name || it?.title || it?.artist || it?.singerName || it?.singer_name || it?.artistName)
					if (n) { out.push(n); got = true }
				} else {
					const n = push(it)
					if (n) { out.push(n); got = true }
				}
			}
			if (got) break
		}
		// 2) 字符串字段兜底：artist / singer / singerName / artistName / singer_name
		if (out.length === 0) {
			for (const sf of [t?.artist, t?.singer, t?.singerName, t?.artistName, t?.singer_name]) {
				if (typeof sf === 'string' && sf.trim()) {
					const parts = String(sf).split(/\s*[\/、,，&;；]\s*/).map((x) => x.trim()).filter(Boolean)
					for (const p of parts) {
						const n = push(p)
						if (n) out.push(n)
					}
					break
				}
			}
		}
		return out.slice(0, 3)
	}, [track])

	const trackPlatform = useMemo(() => {
		const platform = (track as any)?.platform || (track as any)?.source || 'qq'
		const idStr = String((track as any)?.songmid || (track as any)?.id || '')
		if (idStr.startsWith('netease_') || idStr.startsWith('wy_')) return 'netease'
		if (idStr.startsWith('kugou_') || idStr.startsWith('kg_')) return 'kugou'
		if (idStr.startsWith('kuwo_') || idStr.startsWith('kw_')) return 'kuwo'
		return platform
	}, [track])

	const handleViewSinger = useCallback(async (artistName: string) => {
		if (!artistName) return
		const tryNavigate = (mid: string | null, name: string) => {
			try {
				if (mid) router.navigate(`/(modals)/${mid}`)
				else router.navigate(`/(modals)/${encodeURIComponent(name)}?platform=${trackPlatform}`)
				return true
			} catch (navError) {
				console.error('导航到歌手页面失败:', navError)
				return false
			}
		}
		// 优先：用「同歌名+同歌手」后台搜索精确定位该歌曲，从而拿到准确歌手ID
		try {
			const resolved = await resolveTrackBySearch(track)
			const singer = resolved?.singers?.[0]
			if (singer?.mid) {
				if (tryNavigate(singer.mid, singer.name)) return
			} else if (singer?.name) {
				const mid = await getSingerMidBySingerName(singer.name, trackPlatform).catch(() => null)
				if (tryNavigate(mid, singer.name)) return
			}
		} catch (e) {
			// 搜索失败，回退到按名字查歌手
		}
		// 兜底：按当前歌曲歌手名查歌手
		getSingerMidBySingerName(artistName, trackPlatform).then((singerMid) => {
			tryNavigate(singerMid, artistName)
		}).catch(() => {
			tryNavigate(null, artistName)
		})
	}, [router, trackPlatform, track])

	const updateIsInPlaylist = useCallback(() => {
		setIsInPlaylist(isInPlayList(track as IMusic.IMusicItem))
	}, [track])

	useFocusEffect(
		useCallback(() => {
			updateIsInPlaylist()
		}, [updateIsInPlaylist]),
	)

	const handleViewAlbum = async () => {
		const t = track as any
		const hasAlbumId = !!(t.albumMid || t.albummid || t.albumId || t.album_mid || t.album_id || t.albumid)
		if (!hasAlbumId) {
			showToast('正在查找专辑…', '', 'info')
		}
		try {
			const albumMid = await resolveTrackAlbum(t)
			if (albumMid) {
				router.push('/(modals)/' + albumMid + '?album=1')
				return
			}
		} catch (e) {
			// 兜底失败统一提示
		}
		Alert.alert('提示', '暂无专辑信息')
	}
	// 添加至自建歌单（iOS原生弹窗选择）
	const handleAddToCustomPlaylist = useCallback(() => {
		if (customPlaylists.length === 0) {
			Alert.alert('提示', '还没有自建歌单，请先创建一个')
			return
		}
		const options = customPlaylists.map((p) => p.name || p.title || '未命名歌单')
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: ['取消', ...options],
				cancelButtonIndex: 0,
				title: '添加至自建歌单',
			},
			(buttonIndex) => {
				if (buttonIndex === 0) return // 取消
				const selectedPlaylist = customPlaylists[buttonIndex - 1]
				if (selectedPlaylist) {
					// 添加到自建歌单
					myTrackPlayer.addSongToStoredPlayList(selectedPlaylist, track as IMusic.IMusicItem)
					showToast('已添加到 ' + (selectedPlaylist.name || selectedPlaylist.title), '', 'success')

					// 如果是网易云歌曲，同步收藏到网易云
					const platform = (track as any).platform || (track as any).source
					const songId = (track as any).songmid || (track as any).id || ''
					const isNetease =
						platform === 'netease' ||
						platform === 'wy' ||
						String(songId).startsWith('netease_') ||
						String(songId).startsWith('wy_')
					if (isNetease && songId && isLoggedIn && cookie) {
						likeNeteaseSong(songId, true, cookie).then((success) => {
							console.log(`[网易云收藏同步] 添加至自建歌单时收藏 ${songId}: ${success ? '成功' : '失败'}`)
						}).catch((err) => {
							console.error('[网易云收藏同步] 失败:', err)
						})
					}
				}
			},
		)
	}, [customPlaylists, track, isLoggedIn, cookie])

	const albumActions = useMemo(() => {
		return [
			{
				id: 'view-album',
				title: '查看专辑',
				image: 'square.stack',
			},
		]
	}, [])

	// 同步收藏到网易云
	const syncToNetease = useCallback((willBeFavorite: boolean) => {
		if (!isLoggedIn || !cookie) return
		const platform = (track as any).platform || (track as any).source
		const songId = (track as any).songmid || (track as any).id || ''
		const isNetease =
			platform === 'netease' ||
			platform === 'wy' ||
			String(songId).startsWith('netease_') ||
			String(songId).startsWith('wy_')
		if (isNetease && songId) {
			likeNeteaseSong(songId, willBeFavorite, cookie).then((success) => {
				console.log(`[网易云收藏同步] ${willBeFavorite ? '收藏' : '取消收藏'} ${songId}: ${success ? '成功' : '失败'}`)
			}).catch((err) => {
				console.error('[网易云收藏同步] 失败:', err)
			})
		}
	}, [track, isLoggedIn, cookie])

	const handlePressAction = async (id: string) => {
		if (id.startsWith('view-singer-')) {
			const idx = Number(id.replace('view-singer-', ''))
			const name = singerNames[idx]
			if (name) handleViewSinger(name)
			return
		}
		await match(id)
			.with('add-to-favorites', async () => {
				toggleTrackFavorite(track)
				// 同步到网易云
				syncToNetease(true)
				if (activeQueueId?.startsWith('favorites')) {
					//await TrackPlayer.add(track)
				}
			})
			.with('remove-from-favorites', async () => {
				toggleTrackFavorite(track)
				// 同步到网易云
				syncToNetease(false)
				if (activeQueueId?.startsWith('favorites')) {
					// const queue = await TrackPlayer.getQueue()
					// const trackToRemove = queue.findIndex((queueTrack) => queueTrack.url === track.url)
					// await TrackPlayer.remove(trackToRemove)
				}
			})
			.with('add-to-playlist', async () => {
				await myTrackPlayer.add(track as IMusic.IMusicItem)
				updateIsInPlaylist()
				showToast('已添加到播放列表', track.title || '', 'success')
			})
			.with('remove-from-playlist', async () => {
				await myTrackPlayer.remove(track as IMusic.IMusicItem)
				updateIsInPlaylist()
			})
			.with('view-album', async () => {
				handleViewAlbum()
			})
			.with('add-to-custom-playlist', async () => {
				handleAddToCustomPlaylist()
			})
			.with('insert-next', async () => {
				myTrackPlayer.addAsNextTrack(track as IMusic.IMusicItem)
			})
			.with('delete-track', async () => {
				onDeleteTrack?.(track.id)
			})
			.with('download', async () => {
				setShowDownloadModal(true)
			})
			.otherwise(() => {
				console.warn(`Unknown menu action ${id}`)
			})
	}

	// 菜单项（原生 MenuView 与模糊底部菜单共用同一份，点击均走 handlePressAction）
	const menuItems = [
		{
			id: isInPlaylist ? 'remove-from-playlist' : 'add-to-playlist',
			title: isInPlaylist ? i18n.t('menu.removeFromPlayingList') : i18n.t('menu.addToPlayingList'),
			image: isInPlaylist ? 'minus' : 'plus',
		},
		{
			id: isFavorite ? 'remove-from-favorites' : 'add-to-favorites',
			title: isFavorite ? i18n.t('menu.removeFromFavorites') : i18n.t('menu.addToFavorites'),
			image: isFavorite ? 'heart.fill' : 'heart',
		},
		{ id: 'add-to-custom-playlist', title: '添加至自建歌单', image: 'folder.badge.plus' },
		...(isSinger ? [] : (albumActions as any[])),
		...singerNames.map((name, i) => ({
			id: `view-singer-${i}`,
			title: `查看歌手：${name}`,
			image: 'person',
		})),
		...(showInsertNext ? [{ id: 'insert-next', title: '插播', image: 'arrow.forward.circle' }] : []),
		{ id: 'download', title: '下载', image: 'square.and.arrow.down' },
		...(allowDelete
			? [
				{
					id: 'delete-track',
					title: i18n.t('menu.delete'),
					image: 'trash',
					attributes: { destructive: true },
				},
			]
			: []),
	] as any[]

	const runAction = (id: string) => {
		handlePressAction(id)
	}

	return (
		<>
			{blurBackdrop ? (
				<Pressable delayLongPress={260} onLongPress={() => setShowBlurMenu(true)}>
					{children}
				</Pressable>
			) : (
				<MenuView
					shouldOpenOnLongPress
					onPressAction={({ nativeEvent: { event } }) => handlePressAction(event)}
					actions={menuItems}
				>
					{children}
				</MenuView>
			)}

			{blurBackdrop && (
				<Modal transparent visible={showBlurMenu} animationType="fade" onRequestClose={() => setShowBlurMenu(false)}>
					<View style={styles.blurRoot}>
						<BlurView intensity={60} tint="dark" style={StyleSheet.absoluteFill} />
						<View style={styles.dimMask} />
						<Pressable style={StyleSheet.absoluteFill} onPress={() => setShowBlurMenu(false)} />
						<View style={[styles.bottomSheet, { paddingBottom: insets.bottom + 12 }]}>
								<View style={styles.sheetPreview}>
									{track?.artwork ? (
										<FastImage
											source={{ uri: track.artwork, priority: FastImage.priority.high }}
											style={styles.sheetArtwork}
										/>
									) : (
										<View style={[styles.sheetArtwork, styles.sheetArtworkEmpty]} />
									)}
									<View style={styles.sheetMeta}>
										<Text style={styles.sheetTitle} numberOfLines={2}>{track?.title || ''}</Text>
										{!!track?.artist && (
											<Text style={styles.sheetSubtitle} numberOfLines={1}>{track.artist}</Text>
										)}
									</View>
								</View>
								<View style={styles.chevronRow}>
									{menuItems.map((item) => {
										const destructive = item?.attributes?.destructive
										return (
											<TouchableOpacity
												key={item.id}
												style={styles.sheetItem}
												onPress={() => { setShowBlurMenu(false); runAction(item.id) }}
											>
												<Text style={[styles.sheetItemText, destructive && styles.sheetItemTextDestructive]}>
													{item.title}
												</Text>
											</TouchableOpacity>
										)
									})}
									<TouchableOpacity style={[styles.sheetItem, styles.sheetCancelItem]} onPress={() => setShowBlurMenu(false)}>
										<Text style={styles.sheetCancelText}>取消</Text>
									</TouchableOpacity>
								</View>
							</View>
					</View>
				</Modal>
			)}

			<DownloadQualityModal
				visible={showDownloadModal}
				onClose={() => setShowDownloadModal(false)}
				song={track as any}
			/>
		</>
	)
}

const styles = StyleSheet.create({
	blurRoot: {
		flex: 1,
	},
	dimMask: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0.32)',
	},
	bottomSheet: {
		position: 'absolute',
		left: 10,
		right: 10,
		bottom: 0,
		backgroundColor: 'rgba(28,28,30,0.96)',
		borderTopLeftRadius: 18,
		borderTopRightRadius: 18,
		paddingTop: 12,
		overflow: 'hidden',
	},
	sheetPreview: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingBottom: 12,
		gap: 12,
	},
	sheetArtwork: {
		width: 54,
		height: 54,
		borderRadius: 10,
	},
	sheetArtworkEmpty: {
		backgroundColor: 'rgba(255,255,255,0.12)',
	},
	sheetMeta: {
		flex: 1,
		gap: 3,
	},
	sheetTitle: {
		fontSize: 15,
		fontWeight: '600',
		color: '#fff',
	},
	sheetSubtitle: {
		fontSize: 13,
		fontWeight: '500',
		color: 'rgba(255,255,255,0.6)',
	},
	chevronRow: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: 'rgba(255,255,255,0.14)',
	},
	sheetItem: {
		height: 52,
		alignItems: 'center',
		justifyContent: 'center',
	},
	sheetItemText: {
		fontSize: 16,
		fontWeight: '500',
		color: '#fff',
	},
	sheetItemTextDestructive: {
		color: '#FF453A',
	},
	sheetCancelItem: {
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: 'rgba(255,255,255,0.14)',
	},
	sheetCancelText: {
		fontSize: 16,
		fontWeight: '500',
		color: '#0A84FF',
	},
})
