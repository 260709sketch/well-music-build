import { unknownTrackImageUri, wellMusicIconUri } from '@/constants/images'
import SFSymbol from '@/components/SFSymbol'
import { screenPadding } from '@/constants/tokens'
import { wp, hp, rp, fs } from '@/utils/responsive'
import { playListsStore } from '@/helpers/trackPlayerIndex'
import { Playlist } from '@/helpers/types'
import { useFavorites } from '@/store/library'
import { useSearchStore } from '@/store/searchStore'
import { getPlayHistory } from '@/helpers/playHistory'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { router, useNavigation } from 'expo-router'
import React, { useMemo, useRef, useState } from 'react'
import {
	ActionSheetIOS,
	Alert,
	FlatList,
	ScrollView,
	StyleSheet,
	Text,
		TouchableOpacity,
		View,
		Animated,
	} from 'react-native'
import { Ionicons, MaterialCommunityIcons, FontAwesome } from '@expo/vector-icons'
import FastImage from 'react-native-fast-image'
import { shouldCacheImage } from '@/store/cacheManagerStore'
import { MenuView } from '@react-native-menu/menu'
import { extractSingerNames, navigateToSinger } from '@/helpers/userApi/singerUtils'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScrollToTopFAB, useScrollToTop } from '@/components/ScrollToTopFAB'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { PlaylistSortModal } from '@/components/PlaylistSortModal'
import { SimilarSongsModal } from '@/components/SimilarSongsModal'
import { DownloadQualityModal } from '@/components/DownloadQualityModal'
import PersistStatus from '@/store/PersistStatus'
import { showToast } from '@/utils/utils'
import { resolveTrackAlbum } from '@/helpers/userApi/resolveTrackAlbum'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { likeNeteaseSong, resolveNeteasePlaylistId, getNeteasePlaylistDetail } from '@/helpers/userApi/netease-music-api'
import { getPlayListFromQ } from '@/helpers/userApi/getMusicSource'

// 歌单页主题红（播放中歌名/跳动条）
const ACCENT = '#EC4949'
const commentColor = (isDark: boolean) => (isDark ? '#98989f' : '#8e8e93')

// 播放中指示器（歌单页同款红色跳动条）
const NowPlayingIndicator = ({ color }: any) => {
	const frames = Array.from({ length: 3 }, (_, i) => React.useRef(new Animated.Value(0.36)).current)
	React.useEffect(() => {
		const anims = frames.map((a, i) =>
			Animated.loop(
				Animated.sequence([
					Animated.delay(i * 120),
					Animated.timing(a, { toValue: 1, duration: 350, useNativeDriver: true }),
					Animated.timing(a, { toValue: 0.36, duration: 350, useNativeDriver: true }),
				])
			)
		)
		anims.forEach((a) => a.start())
		return () => anims.forEach((a) => a.stop())
	}, [])
	return (
		<View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 16, gap: 2 }}>
			{frames.map((a: any, i: number) => (
				<Animated.View key={i} style={{ width: 3, height: 11, borderRadius: 2, backgroundColor: color, transform: [{ scaleY: a }] }} />
			))}
		</View>
	)
}

// 收藏歌曲行（歌单页同款：点击播放中放大 + 红名 + 长按菜单无三点 + 跳动条/时长，无灰底）
const FavoriteSongItem = React.memo(({ item, index, isActive, isDark, colors, onPress, onMenuAction }: any) => {
	// 当前播放歌曲封面放大（歌单页同款弹簧）
	const coverScale = React.useRef(new Animated.Value(1)).current
	React.useEffect(() => {
		Animated.spring(coverScale, { toValue: isActive ? 1.05 : 1, friction: 6, tension: 120, useNativeDriver: true }).start()
	}, [isActive, coverScale])

	const comment = commentColor(isDark)
	const durationText = (d: number) => {
		const s = Math.max(0, Math.floor(d || 0))
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
	}
	const singerNames = extractSingerNames(item)

	return (
		<View>
			{/* 长按触发菜单（无三点按钮，歌单页同款） */}
			<MenuView
				shouldOpenOnLongPress
				onPressAction={({ nativeEvent: { event } }) => onMenuAction(event, item)}
				actions={[
					{ id: 'add-to-playlist', title: '添加到播放队列', image: 'plus' },
					{ id: 'remove-from-favorites', title: '取消收藏', image: 'heart.slash', attributes: { destructive: true } },
					{ id: 'add-to-custom-playlist', title: '添加至自建歌单', image: 'folder.badge.plus' },
					{ id: 'view-album', title: '查看专辑', image: 'square.stack' },
					...singerNames.map((name, i) => ({
						id: `view-singer-${i}`,
						title: `查看歌手：${name}`,
						image: 'person',
					})),
					{ id: 'insert-next', title: '插播', image: 'arrow.forward.circle' },
					{ id: 'similar', title: '相似歌曲', image: 'music.note' },
					{ id: 'search-same-name', title: '同名搜索', image: 'magnifyingglass' },
					{ id: 'download', title: '下载', image: 'download-outline' },
				]}
			>
				<TouchableOpacity style={styles.songItem} onPress={onPress} activeOpacity={0.7}>
					<Animated.View style={{ transform: [{ scale: coverScale }] }}>
						<FastImage
							source={{ uri: item.artwork || item.img || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : (FastImage.cacheControl as any).noCache }}
							style={styles.songCover}
						/>
					</Animated.View>
					<View style={styles.songInfo}>
						<Text style={[styles.songTitle, { color: isActive ? ACCENT : colors.text }, isActive && styles.songTitleActive]} numberOfLines={1}>
							{item.title || item.name || '未知歌曲'}
						</Text>
						<Text style={[styles.songArtist, { color: comment }]} numberOfLines={1}>
							{item.artist || item.singer || '未知歌手'}
						</Text>
					</View>
					{isActive ? (
						<View style={{ marginLeft: 8 }}>
							<NowPlayingIndicator color={ACCENT} />
						</View>
					) : (
						<Text style={[styles.songDuration, { color: comment }]}>{durationText(item.duration)}</Text>
					)}
				</TouchableOpacity>
			</MenuView>
		</View>
	)

}, (prev: any, next: any) => prev.isActive === next.isActive && prev.item?.id === next.item?.id && prev.colors === next.colors)
const FavoritesScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const navigation = useNavigation()
	const { favorites, toggleTrackFavorite } = useFavorites()
	const storedPlayLists = playListsStore.useValue()
	const { isLoggedIn, cookie } = useDailyRecommendStore()
	const currentMusic = myTrackPlayer.useCurrentMusic()
	const [historyCount, setHistoryCount] = useState(0)
	const [showSortModal, setShowSortModal] = useState(false)
	const [showSimilarSongs, setShowSimilarSongs] = useState(false)
	const [similarSong, setSimilarSong] = useState<any>(null)
	const [showDownloadModal, setShowDownloadModal] = useState(false)
	const [downloadSong, setDownloadSong] = useState<any>(null)
	const [visibleCount, setVisibleCount] = useState(7)
	const [playlistVisibleCount, setPlaylistVisibleCount] = useState(6)
	const [isSortingPlaylists, setIsSortingPlaylists] = useState(false)
	const [playlistOrder, setPlaylistOrder] = useState<string[]>(() => {
		const saved = PersistStatus.get('playlistOrder' as any)
		return Array.isArray(saved) ? saved : []
	})
	const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
		const saved = PersistStatus.get('hiddenPlaylists' as any)
		return Array.isArray(saved) ? saved : []
	})
	const { bottom: safeBottom, top: safeTop } = useSafeAreaInsets()
	const favScrollRef = useRef<any>(null)
	const { onScroll: onFavScroll, scrollToTop: favScrollToTop, progress: favFabProgress, shown: favFabShown } = useScrollToTop(favScrollRef, 320, -safeTop)
	const [showHeaderMenu, setShowHeaderMenu] = useState(false)

	// 收藏歌曲倒序（最新收藏的排第一）
	const reversedFavorites = useMemo(() => [...favorites].reverse(), [favorites])

	// 收藏歌曲变化时重置可见数量
	React.useEffect(() => {
		setVisibleCount(7)
	}, [favorites.length])

	// 滚动接近底部时懒加载更多收藏歌曲
	const handleScroll = (e: any) => {
		onFavScroll(e)
		const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
		// 下滑超过大标题高度时显示右上角菜单，大标题展开时隐藏
		setShowHeaderMenu(contentOffset.y > 60)
		const isCloseToBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - 250
		if (isCloseToBottom && visibleCount < reversedFavorites.length) {
			setVisibleCount(c => Math.min(c + 4, reversedFavorites.length))
		}
	}

	// 横向滚动接近右侧末尾时懒加载更多歌单
	const handlePlaylistScroll = (e: any) => {
		const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent
		const isCloseToEnd = contentOffset.x + layoutMeasurement.width >= contentSize.width - 200
		if (isCloseToEnd && playlistVisibleCount < userPlaylists.length) {
			setPlaylistVisibleCount(c => Math.min(c + 4, userPlaylists.length))
		}
	}

	// 获取历史播放数量
	React.useEffect(() => {
		const history = getPlayHistory()
		setHistoryCount(history?.length || 0)
	}, [])

	// 右上角更多按钮：大标题展开时隐藏，下滑紧凑时显示
	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerRight: () =>
				showHeaderMenu ? (
					<MenuView
						title="音乐库"
						onPressAction={({ nativeEvent }) => {
							if (nativeEvent.event === 'import') handleImportPlaylist()
							else if (nativeEvent.event === 'sort') toggleSortMode()
						}}
						actions={[
							{ id: 'import', title: '导入歌单', image: 'square.and.arrow.down' },
							{ id: 'sort', title: '歌单设置', image: 'slider.horizontal.3' },
						]}
					>
						<TouchableOpacity hitSlop={10} style={{ padding: 4 }} activeOpacity={0.6}>
							<SFSymbol systemName="ellipsis" size={28} color={colors.primary} weight="semibold" />
						</TouchableOpacity>
					</MenuView>
				) : null,
		})
	}, [navigation, colors, showHeaderMenu])

	// 过滤出用户创建的歌单（排除系统歌单、推荐歌单、排行榜），并按自定义顺序排序
	const userPlaylists = useMemo(() => {
		const filtered = (storedPlayLists ?? []).filter((p: any) =>
			p.id && !['favorites', 'local', 'history'].includes(p.id) && !p.isRecommendPlaylist && !p.isToplist && !hiddenIds.includes(p.id)
		)
		if (playlistOrder.length > 0) {
			const orderMap = new Map(playlistOrder.map((id, idx) => [id, idx]))
			return [...filtered].sort((a: any, b: any) => {
				const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER
				const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER
				return idxA - idxB
			})
		}
		return filtered
	}, [storedPlayLists, playlistOrder, hiddenIds])

	// 排序弹窗用：包含隐藏的歌单，不过滤
	const allUserPlaylists = useMemo(() => {
		const filtered = (storedPlayLists ?? []).filter((p: any) =>
			p.id && !['favorites', 'local', 'history'].includes(p.id) && !p.isRecommendPlaylist && !p.isToplist
		)
		if (playlistOrder.length > 0) {
			const orderMap = new Map(playlistOrder.map((id, idx) => [id, idx]))
			return [...filtered].sort((a: any, b: any) => {
				const idxA = orderMap.has(a.id) ? orderMap.get(a.id)! : Number.MAX_SAFE_INTEGER
				const idxB = orderMap.has(b.id) ? orderMap.get(b.id)! : Number.MAX_SAFE_INTEGER
				return idxA - idxB
			})
		}
		return filtered
	}, [storedPlayLists, playlistOrder])

	// 歌单点击
	const handlePlaylistPress = (playlist: any) => {
		if (isSortingPlaylists) return
		router.push(`/(tabs)/favorites/${playlist.id}`)
	}

	// 进入/退出排序模式
	// iOS 原生弹窗导入歌单
	const handleImportPlaylist = () => {
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: ['取消', '导入网易云歌单', '导入QQ音乐歌单', '新建本地歌单'],
				cancelButtonIndex: 0,
			},
			(buttonIndex) => {
				if (buttonIndex === 0) return
				if (buttonIndex === 3) {
					// 新建本地歌单
					Alert.prompt(
						'新建本地歌单',
						'请输入歌单名字',
						(text) => {
							const name = (text || '').trim() || '新建歌单'
							const localPlaylist = {
								id: 'local_' + Date.now(),
								platform: 'local', source: 'local',
								name, title: name,
								artwork: '', artist: '', description: '',
								songs: [], tracks: [],
								createdAt: Date.now(),
							}
							const current = playListsStore.getValue() || []
							const updated = [...current, localPlaylist]
							playListsStore.setValue(updated as any)
							PersistStatus.set('music.playLists', updated)
							showToast('本地歌单创建成功', '', 'success')
						},
						'plain-text',
						'',
						'新建歌单'
					)
					return
				}
				const isNetease = buttonIndex === 1
				const title = isNetease ? '导入网易云歌单' : '导入QQ音乐歌单'
				const placeholder = isNetease
					? '粘贴歌单分享文案、链接或歌单ID（支持短链接）'
					: '粘贴歌单分享链接或歌单ID'
				Alert.prompt(
					title,
					placeholder,
					async (text) => {
						const url = (text || '').trim()
						if (!url) return
						if (isNetease) {
							try {
								showToast('正在导入...', '', 'info')
								const playlistId = await resolveNeteasePlaylistId(url)
								if (!playlistId) throw new Error('无法识别歌单链接')
								const detail = await getNeteasePlaylistDetail(playlistId)
								if (!detail) throw new Error('获取歌单失败')
								const standardPlaylist = {
									id: 'netease_' + (detail.id || playlistId || Date.now()),
									platform: 'netease', source: 'netease',
									name: detail.name || detail.title || '网易云歌单',
									title: detail.name || detail.title || '网易云歌单',
									artwork: detail.artwork || detail.coverImgUrl || detail.coverImg || '',
									artist: detail.creator?.nickname || detail.artist || '',
									description: detail.description || detail.title || '',
									songs: detail.songs || detail.tracks || [],
									tracks: detail.tracks || detail.songs || [],
									createdAt: Date.now(),
								}
								const current = playListsStore.getValue() || []
								const updated = [...current, standardPlaylist]
								playListsStore.setValue(updated as any)
								PersistStatus.set('music.playLists', updated)
								showToast('网易云歌单导入成功', '', 'success')
							} catch (e: any) {
								showToast('导入失败: ' + (e?.message || '未知错误'), '', 'error')
							}
						} else {
							try {
								showToast('正在导入...', '', 'info')
								let playListID = ''
								const idMatch = url.match(/[?&]id=(\d+)/)
								if (idMatch) playListID = idMatch[1]
								if (!playListID) {
									const m = url.match(/\/playlist\/(\d+)/)
									if (m) playListID = m[1]
								}
								if (!playListID) {
									const m = url.match(/\/diss\/(\d+)/)
									if (m) playListID = m[1]
								}
								if (!playListID) {
									const m = url.match(/\/(\d{6,})(?:[?/&]|$)/)
									if (m) playListID = m[1]
								}
								if (!playListID) {
									const m = url.match(/^\d+$/)
									if (m) playListID = url
								}
								if (!playListID) throw new Error('无法识别歌单链接')
								const detail = await getPlayListFromQ(playListID)
								if (!detail || !detail.success) throw new Error(detail?.error || '获取歌单失败')
								const standardSongs = (detail.songs || []).map((song: any) => ({
									...song, platform: 'qq', source: 'tx',
									songmid: song.songmid || song.mid || String(song.id || ''),
									originalId: song.originalId || song.id || '',
								}))
								const standardPlaylist = {
									id: 'qq_' + (detail.id || playListID || Date.now()),
									qqPlaylistId: detail.id || playListID,
									platform: 'qq', source: 'qq',
									name: detail.name || 'QQ音乐歌单',
									title: detail.name || 'QQ音乐歌单',
									artwork: detail.artwork || '',
									artist: detail.artist || '',
									description: detail.title || '',
									songs: standardSongs, tracks: standardSongs,
									createdAt: Date.now(),
								}
								const current = playListsStore.getValue() || []
								const updated = [...current, standardPlaylist]
								playListsStore.setValue(updated as any)
								PersistStatus.set('music.playLists', updated)
								showToast('QQ音乐歌单导入成功', '', 'success')
							} catch (e: any) {
								showToast('导入失败: ' + (e?.message || '未知错误'), '', 'error')
							}
						}
					},
					'plain-text',
					'',
					'default'
				)
			}
		)
	}

	const toggleSortMode = () => {
		setShowSortModal(true)
	}

	const handleSortReorder = (order: string[]) => {
		setPlaylistOrder(order)
		PersistStatus.set('playlistOrder' as any, order)
	}

	// 移动歌单位置
	const movePlaylist = (index: number, direction: 'up' | 'down') => {
		const newIndex = direction === 'up' ? index - 1 : index + 1
		if (newIndex < 0 || newIndex >= userPlaylists.length) return
		const newOrder = [...userPlaylists]
		const [moved] = newOrder.splice(index, 1)
		newOrder.splice(newIndex, 0, moved)
		setPlaylistOrder(newOrder.map((p: any) => p.id))
	}

	// 收藏歌曲点击播放（最新收藏的排第一，用reverse后的索引）
	const handleFavoriteSongPress = (index: number) => {
		if (favorites.length === 0) return
		const reversed = [...favorites].reverse()
		myTrackPlayer.playWithReplacePlayList(reversed[index] as any, reversed as any)
	}

	// 渲染歌单卡片
	const renderPlaylistCard = ({ item }: { item: any }) => {
		const hasCover = !!(item.artwork && item.artwork !== '') || !!(item.coverImg && item.coverImg !== '')
		const songCount = (item.songs?.length || 0) + (item.tracks?.length || 0)
		const coverUri = hasCover ? (item.artwork || item.coverImg) : (songCount === 0 ? wellMusicIconUri : unknownTrackImageUri)
		return (
			<TouchableOpacity
				style={styles.playlistCard}
				onPress={() => handlePlaylistPress(item)}
				activeOpacity={0.7}
			>
				<FastImage
					source={{ uri: coverUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : (FastImage.cacheControl as any).noCache }}
					style={styles.playlistCover}
				/>
			<Text style={[styles.playlistName, { color: colors.text }]} numberOfLines={1}>
				{item.title || item.name || '歌单'}
			</Text>
			<Text style={[styles.playlistDesc, { color: colors.textMuted }]} numberOfLines={1}>
				{item.platform === 'netease' ? '网易云' : item.platform === 'qq' ? 'QQ音乐' : '歌单'} · {item.songs?.length || item.tracks?.length || 0}首
			</Text>
		</TouchableOpacity>
	)
	}

	// 添加至自建歌单（iOS原生弹窗选择，与播放器三点菜单一致）
	const handleAddToCustomPlaylist = (track: any) => {
		const customPlaylists = (storedPlayLists ?? []).filter(
			(p: any) => p.platform === 'custom' || p.platform === 'local' || String(p.id || '').startsWith('custom_') || String(p.id || '').startsWith('local_'),
		)
		if (customPlaylists.length === 0) {
			Alert.alert('提示', '还没有自建歌单，请先创建一个')
			return
		}
		const options = customPlaylists.map((p: any) => p.name || p.title || '未命名歌单')
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
						likeNeteaseSong(songId, true, cookie)
							.then((success) => {
								console.log(`[网易云收藏同步] 添加至自建歌单时收藏 ${songId}: ${success ? '成功' : '失败'}`)
							})
							.catch((err) => {
								console.error('[网易云收藏同步] 失败:', err)
							})
					}
				}
			},
		)
	}

	// 歌曲菜单操作
	const handleSongMenuAction = async (actionId: string, song: any) => {
		const track = song
		if (actionId.startsWith('view-singer-')) {
			const idx = Number(actionId.replace('view-singer-', ''))
			const name = extractSingerNames(track)[idx]
			if (name) await navigateToSinger(router, track, name)
			return
		}
		switch (actionId) {
			case 'add-to-playlist':
				myTrackPlayer.add(track)
				showToast('已添加到播放队列', '', 'success')
				break
			case 'remove-from-playlist':
				myTrackPlayer.remove(track)
				showToast('已从播放队列移除', '', 'success')
				break
			case 'remove-from-favorites':
				toggleTrackFavorite(track)
				showToast('已取消收藏', '', 'success')
				break
			case 'view-album': {
				const t = track as any
				const hasAlbumId = !!(t.albumMid || t.albummid || t.albumId || t.album_mid || t.album_id || t.albumid)
				if (!hasAlbumId) {
					showToast('正在查找专辑…', '', 'info')
				}
				const albumMid = await resolveTrackAlbum(t)
				if (albumMid) {
					router.push('/(modals)/' + albumMid + '?album=1')
				} else {
					Alert.alert('提示', '暂无专辑信息')
				}
				break
			}
			case 'add-to-custom-playlist':
				handleAddToCustomPlaylist(track)
				break
			case 'insert-next':
				myTrackPlayer.addAsNextTrack(track)
				showToast('已插播', '', 'success')
				break
			case 'similar':
				setSimilarSong(track)
				setShowSimilarSongs(true)
				break
			case 'search-same-name':
				useSearchStore.getState().setKeyword(track.title || track.name || '')
				router.navigate('/(tabs)/search')
				break
			case 'download':
				setDownloadSong(track)
				setShowDownloadModal(true)
				break
		}
	}

	// 渲染收藏歌曲
	const renderFavoriteSong = ({ item, index }: { item: any; index: number }) => {
		const isActive = currentMusic && (
			String(item.id || item.songmid || '') === String(currentMusic.id || '') ||
			String(item.songmid || '') === String(currentMusic.songmid || '')
		)
		return (
			<FavoriteSongItem
				item={item}
				index={index}
				isActive={!!isActive}
				isDark={isDark}
				colors={colors}
				onPress={() => handleFavoriteSongPress(index)}
				onMenuAction={handleSongMenuAction}
			/>
		)
	}

	// 旧版音乐库（原界面）
	return (
		<View style={{ flex: 1 }}>
			<View style={[styles.container, { backgroundColor: colors.background }]}>
			<ScrollView ref={favScrollRef} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.scrollContent} onScroll={handleScroll} scrollEventThrottle={16}>
				{/* 历史播放入口 */}
				<TouchableOpacity
					style={styles.historyRow}
					onPress={() => router.push('/(tabs)/favorites/playHistory')}
					activeOpacity={0.7}
				>
					<View style={[styles.historyIcon, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }]}>
						<SFSymbol systemName="clock.arrow.circlepath" size={28} color={colors.text} />
					</View>
					<View style={styles.historyInfo}>
						<Text style={[styles.historyTitle, { color: colors.text }]}>最近播放</Text>
						<Text style={[styles.historySubtitle, { color: colors.textMuted }]}>
							已播放 {historyCount} 首歌曲
						</Text>
					</View>
					<SFSymbol systemName="chevron.right" size={20} color={colors.textMuted} />
				</TouchableOpacity>

				{/* 我的歌单 */}
				<View style={styles.sectionHeader}>
					<Text style={[styles.sectionTitle, { color: colors.text }]}>
						我的歌单 ({userPlaylists.length})
					</Text>
				</View>

				{/* 歌单区域：横向滚动 */}
				{(
					<ScrollView
						horizontal
						showsHorizontalScrollIndicator={false}
						contentContainerStyle={styles.playlistsScroll}
						onScroll={handlePlaylistScroll}
						scrollEventThrottle={200}
					>
						{userPlaylists.length > 0 ? (
							userPlaylists.slice(0, playlistVisibleCount).map((playlist: any, index: number) => (
								<View key={playlist.id || index} style={styles.playlistCardWrapper}>
									{renderPlaylistCard({ item: playlist })}
								</View>
							))
						) : (
							<View style={styles.emptyPlaylists}>
							<Text style={[styles.emptyText, { color: colors.textMuted }]}>暂无歌单</Text>
						</View>
					)}
				</ScrollView>
				)}

				{/* 收藏歌曲 */}
				<View style={styles.sectionHeader}>
					<Text style={[styles.sectionTitle, { color: colors.text }]}>
						收藏歌曲 ({favorites.length})
					</Text>
				</View>

				{/* 收藏歌曲列表（懒加载：初始7首，滚动接近底部加4首） */}
				<View style={styles.songsList}>
					{favorites.length > 0 ? (
						reversedFavorites.slice(0, visibleCount).map((song: any, index: number) => (
							<View key={song.id || song.songmid || index}>
								{renderFavoriteSong({ item: song, index })}
							</View>
						))
					) : (
						<View style={styles.emptySongs}>
							<Text style={[styles.emptyText, { color: colors.textMuted }]}>暂无收藏歌曲</Text>
						</View>
					)}
				</View>
			</ScrollView>
			<ScrollToTopFAB progress={favFabProgress} shown={favFabShown} onPress={favScrollToTop} bottom={safeBottom + 128} />
			</View>

			<SimilarSongsModal
				visible={showSimilarSongs}
				onClose={() => setShowSimilarSongs(false)}
				songId={similarSong?.id || ''}
				songTitle={similarSong?.title || ''}
				platform={similarSong?.platform || 'netease'}
			/>
			<DownloadQualityModal
				visible={showDownloadModal}
				onClose={() => setShowDownloadModal(false)}
				song={downloadSong}
			/>
			<PlaylistSortModal
				visible={showSortModal}
				onClose={() => setShowSortModal(false)}
				playlists={allUserPlaylists}
				onReorder={handleSortReorder}
				onHiddenChange={(ids) => setHiddenIds(ids)}
			/>
		</View>
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
		paddingHorizontal: 12,
		paddingVertical: 12,
		marginTop: 40,
	},
	headerTitle: {
		fontSize: 34,
		fontWeight: '500',
	},
	headerButtons: {
		flexDirection: 'row',
		gap: 12,
	},
	headerButton: {
		width: 40,
		height: 40,
		borderRadius: 20,
		backgroundColor: 'rgba(120,120,128,0.16)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	scrollContent: {
		paddingTop: 0,
		paddingBottom: 130,
	},
	historyRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 12,
	},
	historyIcon: {
		width: 56,
		height: 56,
		borderRadius: 12,
		alignItems: 'center',
		justifyContent: 'center',
	},
	historyInfo: {
		flex: 1,
		marginLeft: 14,
	},
	historyTitle: {
		fontSize: 18,
		fontWeight: '500',
	},
	historySubtitle: {
		fontSize: 14,
		marginTop: 2,
	},
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		marginTop: 24,
		marginBottom: 12,
	},
	sectionTitle: {
		flex: 1,
		fontSize: 20,
		fontWeight: '500',
	},
	seeMore: {
		fontSize: 16,
		fontWeight: '500',
	},
	playlistsScroll: {
		paddingHorizontal: 12,
		gap: 12,
	},
	playlistCardWrapper: {
		width: 150,
	},
	playlistCard: {
		width: 150,
	},
	playlistCover: {
		width: 150,
		height: 150,
		borderRadius: 8,
	},
	playlistName: {
		fontSize: 14,
		fontWeight: '400',
		marginTop: 6,
	},
	playlistDesc: {
		fontSize: 13,
		marginTop: 2,
	},
	sortList: {
		paddingHorizontal: 16,
	},
	sortRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 10,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255,255,255,0.1)',
	},
	sortCover: {
		width: 48,
		height: 48,
		borderRadius: 6,
	},
	sortName: {
		fontSize: 15,
		fontWeight: '500',
	},
	sortDesc: {
		fontSize: 12,
		marginTop: 3,
	},
	sortButtons: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	sortBtn: {
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	emptyPlaylists: {
		width: 150,
		height: 150,
		alignItems: 'center',
		justifyContent: 'center',
	},
	songsList: {
	},
	songItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 7,
	},
	songCover: {
		width: 48,
		height: 48,
		borderRadius: 8,
	},
	songInfo: {
		flex: 1,
		marginLeft: 12,
		marginRight: 8,
	},
	songTitle: {
		fontSize: 16,
		fontWeight: '500',
	},
	songTitleActive: {
		fontSize: 17,
		fontWeight: '600',
	},
	songArtist: {
		fontSize: 12,
		marginTop: 2,
	},
	songDuration: {
		fontSize: 13,
		minWidth: 36,
		textAlign: 'right',
	},
	emptySongs: {
		paddingVertical: 40,
		alignItems: 'center',
	},
	emptyText: {
		fontSize: 15,
	},
})

export default FavoritesScreen

