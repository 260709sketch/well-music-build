import { screenPadding } from '@/constants/tokens'
import SFSymbol from '@/components/SFSymbol'
import { logInfo } from '@/helpers/logger'
import { getAlbumList, getAlbumSongList, getSingerDetail, getSingerMidBySingerName, getSingerBio, getSingerAllSongs } from '@/helpers/userApi/getMusicSource'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useDefaultStyles } from '@/styles'
import { useLocalSearchParams, usePathname, router } from 'expo-router'
import { unknownTrackImageUri } from '@/constants/images'
import myTrackPlayer, { playListsStore } from '@/helpers/trackPlayerIndex'
import { showToast } from '@/utils/utils'
import { likeNeteaseSong } from '@/helpers/userApi/netease-music-api'
import { resolveTrackAlbum } from '@/helpers/userApi/resolveTrackAlbum'
import { MenuView } from '@react-native-menu/menu'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { DownloadQualityModal } from '@/components/DownloadQualityModal'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, ActionSheetIOS, Animated, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View, Dimensions } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from 'react-native-fast-image'
import { Track } from 'react-native-track-player'
import { ScrollToTopFAB, useScrollToTop } from '@/components/ScrollToTopFAB'
import { Ionicons } from '@expo/vector-icons'
import ShareIntent from './shareintent'
import PersistStatus from '@/store/PersistStatus'
import { useFavorites } from '@/store/library'
import { TrackShortcutsMenu } from '@/components/TrackShortcutsMenu'
import { StopPropagation } from '@/components/utils/StopPropagation'
import { LinearGradient } from 'expo-linear-gradient'
import ImageColors from 'react-native-image-colors'
import getOrCreateMMKV from '@/store/getOrCreateMMKV'

const singerCacheStore = getOrCreateMMKV('singerCache', true)

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const BASE_SCREEN_WIDTH = 393 // iPhone 14 Pro 基准宽度（B方案：以用户手机为基准等比缩放，14 Pro 上完全不变）
const ALBUM_CARD_SIZE = Math.round(160 * (SCREEN_WIDTH / BASE_SCREEN_WIDTH))
const NEW_ALBUM_COVER_SIZE = Math.round(160 * (SCREEN_WIDTH / BASE_SCREEN_WIDTH)) // 新歌手主页专辑/EP封面
const HEADER_HEIGHT = 420
const NAVBAR_HEIGHT = 44

type AlbumItem = {
	album_mid: string
	album_name: string
	singer_mid: string
	singer_name: string
	artwork: string
	songCount?: number
	public_time?: string
	subType?: string
}

const SingerListScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const defaultStyles = useDefaultStyles()
	const pathname = usePathname()
	const { top, bottom: safeBottom } = useSafeAreaInsets()
	const { favorites, toggleTrackFavorite } = useFavorites()
	const newArtistScrollRef = useRef<any>(null)
	const { onScroll: onNewArtistScroll, scrollToTop: newArtistScrollToTop, progress: newArtistFabProgress, shown: newArtistFabShown } = useScrollToTop(newArtistScrollRef)
	logInfo('pathname', pathname)
	const isShareIntentPath = pathname.includes('well')
	const { name: playlistNameRaw, album, singer, year, platform, singerName } = useLocalSearchParams<{ name: string; album?: string; singer?: string; year?: string; platform?: string; singerName?: string }>()
	// 手动解码URL中的名字（encodeURIComponent编码的需要解码）
	const playlistName = playlistNameRaw ? decodeURIComponent(playlistNameRaw) : ''
	const isAlbum = !!album
	logInfo('album', album)
	// 旧版歌手主页开关（顶层调用 hook，避免条件 return 后调用违反 hook 规则）
	const oldArtistPage = PersistStatus.useValue('music.oldArtistPage' as any) === true

	const [albumLoading, setAlbumLoading] = useState(false)
	const [showAllSongs, setShowAllSongs] = useState(true) // 一次性展示最多50首，不提供展开
	const [loadedCoverCount, setLoadedCoverCount] = useState(10) // 懒加载封面：初始只加载前10首封面
	const loadedCoverCountRef = useRef(10)
	const [allSongs, setAllSongs] = useState<any[]>([])
	const [allSongsTotal, setAllSongsTotal] = useState(0)
	const [loadingMoreSongs, setLoadingMoreSongs] = useState(false)
	const [allSongsHasMore, setAllSongsHasMore] = useState(true)
	const [loadMoreHintY, setLoadMoreHintY] = useState(0)
		const [showAllDesc, setShowAllDesc] = useState(false)
		const [singerBio, setSingerBio] = useState('')
	const [albumIntroExpanded, setAlbumIntroExpanded] = useState(false)
	const [albumIntroModalVisible, setAlbumIntroModalVisible] = useState(false)
	const [albumBgColor, setAlbumBgColor] = useState('#1c1c1e')
	const [currentTrack, setCurrentTrack] = useState<Track | null>(null)
	const [customToast, setCustomToast] = useState({ visible: false, message: '' })
	const [showDownloadModal, setShowDownloadModal] = useState(false)
	const [downloadSong, setDownloadSong] = useState<any>(null)
	const storedPlayLists = playListsStore.useValue()
	const { isLoggedIn, cookie } = useDailyRecommendStore()
	const longPressTriggered = useRef(false)
	const customToastTimer = useRef<any>(null)
	const [visibleSongPages, setVisibleSongPages] = useState(1)
	const [visibleAlbumCount, setVisibleAlbumCount] = useState(5)
	const [visibleEpCount, setVisibleEpCount] = useState(5)
	const [albumOffset, setAlbumOffset] = useState(0)
	const [hasMoreAlbums, setHasMoreAlbums] = useState(true)
	const [loadingMoreAlbums, setLoadingMoreAlbums] = useState(false)
	// 专辑页面拉伸头部动画
	const albumScrollY = useRef(new Animated.Value(0)).current

	// 内存缓存（模块级，作为双重保障）
	const memoryCache = new Map<string, { data: any; timestamp: number }>()
// mid解析缓存（避免每次打开歌手页都重新搜索解析）
const singerMidCache = new Map<string, string>()


	// 歌手数据缓存（使用MMKV持久化，缓存7天）
	const getCachedData = (key: string) => {
		try {
			// 先从内存缓存读取
			const memCached = memoryCache.get(key)
			if (memCached && Date.now() - memCached.timestamp < 7 * 24 * 3600 * 1000) {
				return memCached.data
			}
			// 再从MMKV读取
			const cached = singerCacheStore.getString(`singer_cache_${key}`)
			if (cached) {
				const { data, timestamp } = JSON.parse(cached)
				// 缓存7天
				if (Date.now() - timestamp < 7 * 24 * 3600 * 1000) {
					// 存入内存缓存
					memoryCache.set(key, { data, timestamp })
					return data
				}
			}
		} catch (e) {
			console.error('读取缓存失败:', e)
		}
		return null
	}

	const setCachedData = (key: string, data: any) => {
		try {
			const timestamp = Date.now()
			// 存入内存缓存
			memoryCache.set(key, { data, timestamp })
			// 存入MMKV
			singerCacheStore.set(`singer_cache_${key}`, JSON.stringify({
				data,
				timestamp,
			}))
		} catch (e) {
			console.error('写入缓存失败:', e)
		}
	}

	// 初始化时同步读取缓存，实现秒加载
	const initialCache = useMemo(() => {
		if (isShareIntentPath) return null
		const cacheKey = `${isAlbum ? 'album_' : 'singer_'}${platform ? platform + '_' : ''}${playlistName}`
		return getCachedData(cacheKey)
	}, [isAlbum, isShareIntentPath, playlistName, platform])

	const [singerListDetail, setSingerListDetail] = useState<{ musicList: Track[]; singerImg?: string; title?: string; id?: string; description?: string; musicSize?: number; albumSize?: number } | null>(initialCache)
	const [albumList, setAlbumList] = useState<AlbumItem[]>([])
	const [loading, setLoading] = useState(!initialCache)

	// 分类：优先用subType，其次用歌曲数（size<=1=EP与单曲）
	const filteredAlbums = useMemo(() => {
		const albums: AlbumItem[] = []
		const epsAndSingles: AlbumItem[] = []
		for (const a of albumList) {
			const t = (a.subType || '').toLowerCase()
			const cnt = a.songCount || 0
			if (t === 'ep' || t === '单曲' || t === 'single' || (cnt <= 1 && cnt > 0)) {
				epsAndSingles.push(a)
			} else {
				albums.push(a)
			}
		}
		return { albums, epsAndSingles }
	}, [albumList])

	const scrollY = useRef(new Animated.Value(0)).current

	useEffect(() => {
		if (isShareIntentPath) {
			return
		}
		const cacheKey = `${isAlbum ? 'album_' : 'singer_'}${platform ? platform + '_' : ''}${playlistName}`

		// 先显示缓存数据（如果初始化时没有缓存）
		const cached = getCachedData(cacheKey)
		if (cached && !initialCache) {
			setSingerListDetail(cached)
			setLoading(false)
		}

		const fetchSingerListDetail = async () => {
			try {
				let detail
				if (isAlbum) {
					detail = await getAlbumSongList(playlistName)
				} else {
					// 如果传入的是歌手名字（含中文或带platform参数），先异步解析为有效 mid
					let effectiveMid = playlistName
					const isChineseName = /[\u4e00-\u9fa5]/.test(playlistName)
					const hasPlatform = !!platform
					// 判断是否已经是mid（平台前缀/纯数字/QQ风格14位字母数字），是则直接用不重复解析
					const isLikelyMid = /^(netease_|wy_|kugou_|kg_|kuwo_|kw_)/.test(playlistName)
						|| /^\d+$/.test(playlistName)
						|| /^[A-Za-z0-9]{14}$/.test(playlistName)
					// 中文名字 或 带platform参数的英文名字（且不是mid），才需要解析mid
					if ((isChineseName || hasPlatform) && !isLikelyMid) {
						// 第一次：带platform解析
						let resolvedMid = await getSingerMidBySingerName(playlistName, platform as string | undefined)
						// 兜底：第一次失败后，不传platform再试一次（让函数自动尝试所有平台）
						if (!resolvedMid) {
							resolvedMid = await getSingerMidBySingerName(playlistName)
						}
						if (resolvedMid) effectiveMid = resolvedMid
					}
					detail = await getSingerDetail(effectiveMid)
					// 优先用URL传入的歌手名，其次用传入的名字（如果不是mid）
					if (detail) {
						if (singerName) {
							detail.title = singerName
						} else if (!isLikelyMid) {
							detail.title = playlistName
						}
					}
				}
				setSingerListDetail(detail)
				// 切换/刷新歌手时重置歌曲展开与懒加载状态
				if (detail) {
					setShowAllSongs(true)
					setAllSongs([])
					setAllSongsTotal(0)
					setAllSongsHasMore(true)
					setLoadMoreHintY(0)
				}
				// 只有获取到有效数据才存入缓存，避免缓存null导致后面都打不开
				if (detail) {
					setCachedData(cacheKey, detail)
					// 优先加载歌手简介和歌曲总数（直接用歌手 ID）
					const singerDetail: any = detail
					const singerId = String(singerDetail?.id ?? '');
					(async () => {
						try {
							if (singerId) {
								// 加载歌手简介
								const resp = await fetch(`https://music.163.com/api/artist/head/info/get?id=${singerId}`, {
									headers: {
										'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
										'Referer': 'https://music.163.com/',
									},
								})
								const data = await resp.json()
								if (data.code === 200) {
									setSingerBio(data?.data?.artist?.briefDesc || '')
								}
								// 加载歌曲总数
								try {
									const result = await getSingerAllSongs(singerId, 0, 1)
									setAllSongsTotal(result.total)
								} catch (e) {
									console.error('getSingerAllSongs error', e)
								}
							}
						} catch (e) { console.error('getSingerBio error', e) }
					})()
				}
				// 专辑页面提取封面主色调（延迟执行，不阻塞页面渲染）
				if (isAlbum && detail) {
					setTimeout(() => {
						const coverUrl = detail.singerImg || detail.musicList?.[0]?.artwork
						if (coverUrl) {
							ImageColors.getColors(coverUrl, {
								fallback: '#1c1c1e',
								cache: true,
								key: coverUrl,
							})
								.then((colors) => {
								// 使用深色主色调作为背景
								let bg = colors.platform === 'ios' ? colors.primary : colors.dominant
								if (bg) {
									// 将颜色变暗，确保文字可读
									const hex = bg.replace('#', '')
									const r = Math.max(0, Math.floor(parseInt(hex.substr(0, 2), 16) * 0.3))
									const g = Math.max(0, Math.floor(parseInt(hex.substr(2, 2), 16) * 0.3))
									const b = Math.max(0, Math.floor(parseInt(hex.substr(4, 2), 16) * 0.3))
									bg = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
									setAlbumBgColor(bg)
								}
							})
							.catch(() => {})
						}
					}, 100)
				}
			} catch (error) {
				logInfo('fetchSingerListDetail error', error)
				if (!cached) {
					setSingerListDetail(null)
				}
			} finally {
				setLoading(false)
			}
		}
		fetchSingerListDetail()
	}, [isAlbum, isShareIntentPath, playlistName])


	useEffect(() => {
		if (!isAlbum && !isShareIntentPath) {
			const cacheKey = `albums_v5_${playlistName}`
			const cached = getCachedData(cacheKey)
			if (cached) {
				setAlbumList(cached)
				setAlbumOffset(cached.length)
				setHasMoreAlbums(cached.length === 30)
			}
			setVisibleAlbumCount(5)
			setVisibleEpCount(5)
			fetchAlbumList(0, false)
		}
	}, [isAlbum, isShareIntentPath, playlistName])

	// 歌手主页自动加载全部歌曲（最多50首）
	useEffect(() => {
		if (!isAlbum && showAllSongs && allSongs.length === 0 && singerListDetail?.id) {
			loadMoreSongs(true)
		}
	}, [isAlbum, showAllSongs, allSongs.length, singerListDetail?.id])

	// 专辑页面使用系统默认转场动画，确保和歌手页面一致

	const fetchAlbumList = async (offset: number = 0, append: boolean = false) => {
		if (append) setLoadingMoreAlbums(true)
		else setAlbumLoading(true)
		try {
			let effectiveMid = playlistName
			const isChineseName = /[\u4e00-\u9fa5]/.test(playlistName)
			const hasPlatform = !!platform
			const isLikelyMid = /^(netease_|wy_|kugou_|kg_|kuwo_|kw_)/.test(playlistName)
				|| /^\d+$/.test(playlistName)
				|| /^[A-Za-z0-9]{14}$/.test(playlistName)
			if ((isChineseName || hasPlatform) && !isLikelyMid) {
				const midCacheKey = `${playlistName}_${platform || ""}`
				const cachedMid = singerMidCache.get(midCacheKey)
				let resolvedMid = cachedMid
				if (!resolvedMid) {
					resolvedMid = await getSingerMidBySingerName(playlistName, platform as string | undefined)
					if (!resolvedMid) {
						resolvedMid = await getSingerMidBySingerName(playlistName)
					}
					if (resolvedMid) singerMidCache.set(midCacheKey, resolvedMid)
				}
				if (resolvedMid) effectiveMid = resolvedMid
			}
			// 酷狗：一次性拉全量（getKugouSingerAlbums 在 limit>100 时循环取全部），与平台展示一致；
				//       分页时夹带大量新 EP/单曲，会导致下方「专辑」分类只剩寥寥几张
				const isKugouFull = /^(kugou_|kg_)/.test(String(effectiveMid))
				const albums = await getAlbumList(effectiveMid, offset, isKugouFull ? 9999 : 60)
				if (append) {
					setAlbumList(prev => [...prev, ...(albums as unknown as AlbumItem[])])
				} else {
						setAlbumList(albums as unknown as AlbumItem[])
				}
				setAlbumOffset(offset + albums.length)
				setHasMoreAlbums(!isKugouFull && albums.length === 60)
			const cacheKey = `albums_v5_${playlistName}`
			if (!append) setCachedData(cacheKey, albums)
		} catch (error) {
			logInfo('fetchAlbumList error', error)
		} finally {
			setAlbumLoading(false)
			setLoadingMoreAlbums(false)
		}
	}

	const loadMoreAlbums = () => {
		if (hasMoreAlbums && !loadingMoreAlbums && !albumLoading) {
			fetchAlbumList(albumOffset, true)
		}
	}

	const handleAlbumPress = (albumMid: string) => {
		router.push(`/(modals)/${albumMid}?album=1&singer=${playlistName}`)
	}

	const formatYear = (time: string | number) => {
		if (!time) return ''
		const timeStr = String(time)
		// 如果是13位时间戳（毫秒）
		if (/^\d{13}$/.test(timeStr)) {
			const date = new Date(parseInt(timeStr))
			const y = date.getFullYear()
			const m = String(date.getMonth() + 1).padStart(2, '0')
			const d = String(date.getDate()).padStart(2, '0')
			return `${y}-${m}-${d}`
		}
		// 如果是10位时间戳（秒）
		if (/^\d{10}$/.test(timeStr)) {
			const date = new Date(parseInt(timeStr) * 1000)
			const y = date.getFullYear()
			const m = String(date.getMonth() + 1).padStart(2, '0')
			const d = String(date.getDate()).padStart(2, '0')
			return `${y}-${m}-${d}`
		}
		// 如果是日期字符串，直接返回
		return timeStr.slice(0, 10)
	}

	const formatYearOnly = (time: string | number) => {
		if (!time) return ''
		const timeStr = String(time)
		// 如果是13位时间戳（毫秒）
		if (/^\d{13}$/.test(timeStr)) {
			const date = new Date(parseInt(timeStr))
			return String(date.getFullYear())
		}
		// 如果是10位时间戳（秒）
		if (/^\d{10}$/.test(timeStr)) {
			const date = new Date(parseInt(timeStr) * 1000)
			return String(date.getFullYear())
		}
		// 如果是日期字符串，只返回年份
		return timeStr.slice(0, 4)
	}

	const handleSongPress = async (track: Track) => {
		if (longPressTriggered.current) {
			longPressTriggered.current = false
			return
		}
		try {
			setCurrentTrack(track)
			await myTrackPlayer.play(track as any)
		} catch (error) {
			logInfo('handleSongPress error', error)
		}
	}

	const handlePlayAll = async () => {
			try {
				const songs = singerListDetail?.musicList || []
				if (songs.length > 0) {
					// 优先用接口返回的真实名（专辑名/歌手名），避免显示 netease_album_xxx 之类的 ID
					const sourceTitle = singerListDetail?.title || playlistName || null
					await myTrackPlayer.playWithReplacePlayList(songs[0] as any, songs as any, sourceTitle)
				}
			} catch (error) {
				logInfo('handlePlayAll error', error)
			}
		}

	// 长按添加到播放列表
	const showCustomToast = (message: string) => {
		if (customToastTimer.current) clearTimeout(customToastTimer.current)
		setCustomToast({ visible: true, message })
		customToastTimer.current = setTimeout(() => {
			setCustomToast({ visible: false, message: '' })
		}, 2000)
	}
	// 歌曲长按菜单（原生 UIMenu，与歌单页同款；含收藏/下载/添加至自建歌单）
	const handleSongMenuAction = async (actionId: string, track: any) => {
		if (actionId === 'add-to-playlist') {
			try {
				myTrackPlayer.add(track)
				showCustomToast('已添加到播放列表：' + (track.title || ''))
			} catch (e) {
				showCustomToast('添加失败')
			}
			return
		}
		if (actionId === 'insert-next') {
			try {
				myTrackPlayer.addAsNextTrack(track)
				showCustomToast('已插播：' + (track.title || ''))
			} catch (e) {
				showCustomToast('插播失败')
			}
			return
		}
		if (actionId === 'add-to-favorites' || actionId === 'remove-from-favorites') {
			handleToggleFavorite(track)
			return
		}
		if (actionId === 'download') {
			setDownloadSong(track)
			setShowDownloadModal(true)
			return
		}
		if (actionId === 'add-to-custom-playlist') {
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
						myTrackPlayer.addSongToStoredPlayList(selectedPlaylist, track)
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
			return
		}
		if (actionId !== 'view-album') return
		// 查看专辑：统一走 resolveTrackAlbum（自带专辑ID → 网易云反查 → 网易云搜索 → QQ搜索）
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
	}
	// 爱心收藏：本地 + 同步网易云"我喜欢的音乐"
	const handleToggleFavorite = async (track: any) => {
		const isFav = favorites.some((f: any) => f.id === track.id)
		toggleTrackFavorite(track)
		try {
			const { cookie } = useDailyRecommendStore.getState()
			if (!cookie) return
			const songId = track.originalId || track.songmid || String(track.id || '').replace(/^(netease_|wy_)/, '')
			const isNetease = track.platform === 'netease' || track.source === 'netease' || String(track.id || '').startsWith('netease_')
			if (isNetease && songId) {
				await likeNeteaseSong(songId, !isFav, cookie)
			}
		} catch (e) {
			logInfo('同步网易云收藏失败', e)
		}
	}

const handleToggleAllSongs = async () => {
		if (showAllSongs) {
			setShowAllSongs(false)
			return
		}
		setShowAllSongs(true)
		setAllSongsHasMore(true)
		if (allSongs.length === 0) {
			loadMoreSongs(true)
		}
	}

	// 分页加载歌手歌曲（reset=true 重新从第一批加载，首批30首，之后每批60首，滚动到底自动加载）
	const loadMoreSongs = async (reset = false) => {
		if (loadingMoreSongs) return
		const singerId = singerListDetail?.id || ''
		if (!singerId) return
		// 最多展示50首，避免大量歌曲导致闪退
		const MAX_SONGS = 50
		if (!reset && allSongs.length >= MAX_SONGS) { setAllSongsHasMore(false); return }
		const total = singerListDetail?.musicSize || allSongsTotal || 0
		const currentOffset = reset ? 0 : allSongs.length
		if (!reset && total && currentOffset >= total) return
		setLoadingMoreSongs(true)
		try {
			const limit = reset ? MAX_SONGS : Math.min(60, MAX_SONGS - allSongs.length)
			const result = await getSingerAllSongs(singerId, currentOffset, limit)
			const newList = (result.list || []).slice(0, MAX_SONGS - (reset ? 0 : allSongs.length))
			let added = 0
			if (reset) {
				setAllSongs(newList)
				added = newList.length
			} else {
				setAllSongs(prev => {
					const seen = new Set(prev.map((s: any) => s.id || s.songmid || s.rid || s.title))
					const merged = [...prev]
					for (const s of newList) {
						const sid = s.id || s.songmid || s.rid || s.title
						if (!seen.has(sid)) { seen.add(sid); merged.push(s); added++ }
					}
					return merged
				})
			}
			if (result.total) setAllSongsTotal(result.total)
			// 后端返回没有更多，或本页为空，或已达总数，标记结束
			const reachedTotal = result.total ? (currentOffset + newList.length >= result.total) : false
			if (result.hasMore === false || newList.length === 0 || reachedTotal) {
				setAllSongsHasMore(false)
			}
		} catch (e) {
			console.error('loadMoreSongs error', e)
		} finally {
			setLoadingMoreSongs(false)
		}
	}

	// 导航栏透明度：滚动超过 HEADER_HEIGHT - top - NAVBAR_HEIGHT 时显示
	const navbarOpacity = scrollY.interpolate({
		inputRange: [0, HEADER_HEIGHT - top - NAVBAR_HEIGHT - 20, HEADER_HEIGHT - top - NAVBAR_HEIGHT],
		outputRange: [0, 0, 1],
		extrapolate: 'clamp',
	})

	// 背景图上移效果
	const headerTranslate = scrollY.interpolate({
		inputRange: [-300, 0, HEADER_HEIGHT],
		outputRange: [100, 0, -HEADER_HEIGHT * 0.5],
		extrapolate: 'clamp',
	})

	const headerScale = scrollY.interpolate({
		inputRange: [-200, 0],
		outputRange: [1.6, 1],
		extrapolate: 'clamp',
	})

	if (isShareIntentPath) {
		return <ShareIntent></ShareIntent>
	}

	if (loading) {
		return (
			<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' }}>
				<ActivityIndicator size="large" color="#fff" />
			</View>
		)
	}

	// 专辑页面
	if (isAlbum) {
		const albumTracks = singerListDetail?.musicList || []
		const albumCover = singerListDetail?.singerImg || albumTracks[0]?.artwork || unknownTrackImageUri
		const albumTitle = singerListDetail?.title || '未知专辑'
		const albumArtist = albumTracks[0]?.artist || '未知歌手'
		const rawYear = year || (albumTracks[0] as any)?.public_time || (albumTracks[0] as any)?.publishTime || (albumTracks[0] as any)?.year || (singerListDetail as any)?.public_time || (singerListDetail as any)?.publishTime || (singerListDetail as any)?.year
		const albumYear = rawYear ? formatYear(rawYear) : ''

		const handleBack = () => {
			router.back()
		}

		return (
			<>
				<View style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}>
					{/* 顶部 Handle Bar */}
				<View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: '#ccc', alignSelf: 'center', marginTop: 8 }} />

				<ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
					{/* 封面 + 信息 */}
					<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 20 }}>
						<FastImage
							source={{ uri: albumCover }}
							style={{ width: 120, height: 120, borderRadius: 12 }}
						/>
						<View style={{ flex: 1, marginLeft: 20 }}>
							<Text style={{
								fontSize: 20,
								fontWeight: '500',
								color: isDark ? '#fff' : '#000',
							}} numberOfLines={2}>
								{albumTitle}
							</Text>
							<Text style={{
								fontSize: 14,
								fontWeight: '500',
								color: '#D85A53',
								marginTop: 6,
							}} numberOfLines={1}>
								{albumArtist}
							</Text>
							<Text style={{
								fontSize: 13,
								color: '#999',
								marginTop: 4,
							}} numberOfLines={1}>
								{albumTracks.length} 首 · {albumYear ? `${albumYear}` : ''}
							</Text>
						</View>
					</View>

					{/* 专辑简介 */}
					{singerListDetail?.description && (
						<View style={{ marginTop: 24, marginHorizontal: 20 }}>
							<Text
								style={{ fontSize: 13, color: isDark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)', lineHeight: 20 }}
								numberOfLines={albumIntroExpanded ? undefined : 2}
							>
								{singerListDetail.description}
							</Text>
							{singerListDetail.description.length > 60 && (
								<TouchableOpacity
									onPress={() => setAlbumIntroExpanded(!albumIntroExpanded)}
									style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}
								>
									<Text style={{ fontSize: 14, color: '#E53935' }}>
										{albumIntroExpanded ? '收起' : '展开简介'}
									</Text>
								</TouchableOpacity>
							)}
						</View>
					)}

					{/* 播放全部按钮 */}
					<TouchableOpacity
						onPress={handlePlayAll}
						activeOpacity={0.85}
						style={{ marginTop: 20, marginHorizontal: 20 }}
					>
						<LinearGradient
							colors={['#FF6B6B', '#D63031']}
							start={{ x: 0, y: 0 }}
							end={{ x: 1, y: 0 }}
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								justifyContent: 'center',
								gap: 6,
								height: 38,
								borderRadius: 19,
							}}
						>
							<SFSymbol systemName="play.fill" size={16} color="#ffffff" />
							<Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>播放全部 ({albumTracks.length})</Text>
						</LinearGradient>
					</TouchableOpacity>

					{/* 歌曲列表 */}
					<View style={{ marginTop: 24 }}>
						{albumTracks.map((track: any, index: number) => (
						<MenuView
							key={index}
							shouldOpenOnLongPress
							onPressAction={({ nativeEvent: { event } }) => handleSongMenuAction(event, track)}
							actions={[
								{ id: 'add-to-playlist', title: '添加到播放队列', image: 'plus' },
								{
									id: favorites.some((f: any) => f.id === track.id) ? 'remove-from-favorites' : 'add-to-favorites',
									title: favorites.some((f: any) => f.id === track.id) ? '取消收藏' : '收藏',
									image: favorites.some((f: any) => f.id === track.id) ? 'heart.fill' : 'heart',
								},
								{ id: 'add-to-custom-playlist', title: '添加至自建歌单', image: 'folder.badge.plus' },
								{ id: 'download', title: '下载', image: 'square.and.arrow.down' },
								{ id: 'insert-next', title: '插播', image: 'arrow.forward.circle' },
								{ id: 'view-album', title: '查看专辑', image: 'square.stack' },
							]}
						>
						<TouchableOpacity
							style={{
								flexDirection: 'row',
								alignItems: 'center',
								paddingHorizontal: 20,
								paddingVertical: 12,
							}}
							onPress={() => handleSongPress(track)}
						>
								<FastImage
									source={{ uri: track.artwork || albumCover }}
									style={{ width: 48, height: 48, borderRadius: 8, marginRight: 14 }}
								/>
								<View style={{ flex: 1 }}>
									<Text style={{
										fontSize: 17,
										fontWeight: '500',
										color: isDark ? '#fff' : '#000',
									}} numberOfLines={1}>
										{track.title}
									</Text>
									<Text style={{
										fontSize: 13,
										color: '#999',
										marginTop: 2,
									}} numberOfLines={1}>
										{track.artist || track.album || ''}
									</Text>
								</View>
								<Text style={{ fontSize: 14, color: '#999', width: 60, textAlign: 'right' }}>
									{track.duration ? Math.floor(track.duration / 60) + ':' + String(Math.floor(track.duration % 60)).padStart(2, '0') : ''}
								</Text>
							</TouchableOpacity>
						</MenuView>
						))}
					</View>

					{/* 该歌手的其他专辑 */}
					{albumList.length > 0 && (
						<View style={{ marginTop: 32 }}>
							<Text style={{
								fontSize: 20,
								fontWeight: '500',
								color: isDark ? '#fff' : '#000',
								marginLeft: 20,
								marginBottom: 16,
							}}>
								该歌手的其他专辑
							</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}>
								{albumList.slice(0, 10).map((album: any, index: number) => (
									<TouchableOpacity key={album.album_mid || index} style={{ width: 140, marginRight: 16 }} onPress={() => {
										const yearParam = album.public_time ? `&year=${album.public_time}` : ''
										router.push(`/(modals)/${album.album_mid}?album=1&singer=${playlistName}${yearParam}`)
									}}>
										<FastImage source={{ uri: album.artwork || '' }} style={{ width: 140, height: 140, borderRadius: 10 }} />
										<Text style={{ fontSize: 15, fontWeight: '500', color: isDark ? '#fff' : '#000', marginTop: 8 }} numberOfLines={2}>{album.album_name}</Text>
										<Text style={{ fontSize: 12, color: '#999', marginTop: 4 }}>{album.public_time ? formatYear(album.public_time) + '-09-16' : ''}</Text>
									</TouchableOpacity>
								))}
							</ScrollView>
							</View>
						)}
					</ScrollView>
				</View>
				<DownloadQualityModal
					visible={showDownloadModal}
					onClose={() => setShowDownloadModal(false)}
					song={downloadSong as any}
				/>
			</>
		)
	}



		const latestAlbum = albumList[0]
	const topSongs = singerListDetail?.musicList?.slice(0, 5) || []

	// 新版歌手主页
	if (!isAlbum && !isShareIntentPath && !oldArtistPage && singerListDetail) {
		const songs = (singerListDetail.musicList || [])
		const songsTotal = singerListDetail.musicSize || allSongsTotal || songs.length
		const displaySongs = showAllSongs ? (allSongs.length > 0 ? allSongs : songs.slice(0, 10)) : songs.slice(0, 10)
		const songsHasMore = showAllSongs && allSongsHasMore
		return (
			<View style={{ flex: 1, backgroundColor: isDark ? '#000' : '#fff' }}>
				<View style={{ width: 36, height: 5, borderRadius: 3, backgroundColor: '#ccc', alignSelf: 'center', marginTop: 8 }} />
				<ScrollView
					ref={newArtistScrollRef}
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ paddingBottom: 100 }}
					scrollEventThrottle={16}
					onScroll={(e) => {
							onNewArtistScroll(e)
							const { contentOffset, layoutMeasurement } = e.nativeEvent
							// 懒加载封面：滚动到接近已加载封面末尾时，逐批加载后续封面
							const headerEst = 520
							const rowH = 64
							const threshold = headerEst + (loadedCoverCountRef.current - 3) * rowH
							if (contentOffset.y + layoutMeasurement.height > threshold && loadedCoverCountRef.current < 50) {
								const next = Math.min(50, loadedCoverCountRef.current + 10)
								loadedCoverCountRef.current = next
								setLoadedCoverCount(next)
							}
						}}				>
					{/* 头部：圆形歌手头像 + 歌手名 */}
					<View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginTop: 20 }}>
						<FastImage source={{ uri: singerListDetail.singerImg || '' }} style={{ width: 100, height: 100, borderRadius: 50 }} />
						<View style={{ marginLeft: 20, flex: 1 }}>
							<Text style={{ fontSize: 22, fontWeight: '500', color: isDark ? '#fff' : '#000' }} numberOfLines={1}>{singerName || singerListDetail.title || playlistName}</Text>
							<Text style={{ fontSize: 13, color: '#999', marginTop: 4 }} numberOfLines={1}>{(singerListDetail.musicSize || allSongsTotal || songs.length)} 首歌曲{(singerListDetail.albumSize || albumList.length) ? ` · ${(singerListDetail.albumSize || albumList.length)} 张专辑` : ''}</Text>
						</View>
					</View>

					{/* 歌手简介 */}
					{singerListDetail?.description && (
						<View style={{ paddingHorizontal: 20, marginTop: 16 }}>
							<Text style={{ fontSize: 13, color: '#999', lineHeight: 20 }} numberOfLines={showAllDesc ? undefined : 3}>
								{singerListDetail.description}
							</Text>
							{singerListDetail.description.length > 100 && (
								<TouchableOpacity onPress={() => setShowAllDesc(!showAllDesc)}>
									<Text style={{ fontSize: 13, color: '#E53935', marginTop: 4 }}>
										{showAllDesc ? '收起' : '展开简介'}
									</Text>
								</TouchableOpacity>
							)}
						</View>
					)}

					{/* 播放热门按钮 */}
					<View style={{ paddingHorizontal: 20, marginTop: 24 }}>
						<TouchableOpacity onPress={handlePlayAll} activeOpacity={0.85}>
							<LinearGradient
								colors={['#FF6B6B', '#D63031']}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 0 }}
								style={{
									flexDirection: 'row',
									alignItems: 'center',
									justifyContent: 'center',
									gap: 6,
									height: 40,
									borderRadius: 20,
								}}
							>
								<SFSymbol systemName="play.fill" size={16} color="#ffffff" />
								<Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>播放全部</Text>
							</LinearGradient>
						</TouchableOpacity>
					</View>

					{/* 热门单曲 */}
					<View style={{ paddingHorizontal: 20, marginTop: 24 }}>
						<Text style={{ fontSize: 18, fontWeight: '500', color: isDark ? '#fff' : '#000', marginBottom: 12 }}>热门歌曲</Text>
					</View>
					{songs.length === 0 ? (
						<Text style={{ fontSize: 14, color: '#999', textAlign: 'center', marginTop: 40 }}>暂无歌曲</Text>
					) : (
						<>
							{displaySongs.map((track: any, index: number) => (
								<MenuView
									key={index}
									shouldOpenOnLongPress
									onPressAction={({ nativeEvent: { event } }) => handleSongMenuAction(event, track)}
									actions={[
										{ id: 'add-to-playlist', title: '添加到播放队列', image: 'plus' },
										{
											id: favorites.some((f: any) => f.id === track.id) ? 'remove-from-favorites' : 'add-to-favorites',
											title: favorites.some((f: any) => f.id === track.id) ? '取消收藏' : '收藏',
											image: favorites.some((f: any) => f.id === track.id) ? 'heart.fill' : 'heart',
										},
										{ id: 'add-to-custom-playlist', title: '添加至自建歌单', image: 'folder.badge.plus' },
										{ id: 'download', title: '下载', image: 'square.and.arrow.down' },
										{ id: 'insert-next', title: '插播', image: 'arrow.forward.circle' },
										{ id: 'view-album', title: '查看专辑', image: 'square.stack' },
									]}
								>
								<TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 }} onPress={() => handleSongPress(track)}>
									<FastImage source={{ uri: track.artwork || '' }} style={{ width: 48, height: 48, borderRadius: 8, marginRight: 14 }} />
									<View style={{ flex: 1 }}>
										<Text style={{ fontSize: 17, fontWeight: '500', color: isDark ? '#fff' : '#000' }} numberOfLines={1}>{track.title}</Text>
										<Text style={{ fontSize: 13, color: '#999', marginTop: 4 }} numberOfLines={1}>{track.artist || track.album || ''}</Text>
									</View>
									<Text style={{ fontSize: 13, color: '#999', width: 60, textAlign: 'right' }}>
										{track.duration ? Math.floor(track.duration / 60) + ':' + String(Math.floor(track.duration % 60)).padStart(2, '0') : ''}
									</Text>
								</TouchableOpacity>
								</MenuView>
							))}
							{null}
						</>
					)}
					{filteredAlbums.albums.length > 0 && (
						<View style={{ marginTop: 24 }}>
							<Text style={{ fontSize: 18, fontWeight: '500', color: isDark ? '#fff' : '#000', marginLeft: 20, marginBottom: 12 }}>专辑</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}
								scrollEventThrottle={100}
								onScroll={(e) => {
									const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
									if (contentSize.width > 0 && contentOffset.x + layoutMeasurement.width >= contentSize.width - 100) {
										setVisibleAlbumCount((prev) => Math.min(prev + 4, filteredAlbums.albums.length))
										if (visibleAlbumCount + 4 >= filteredAlbums.albums.length) loadMoreAlbums()
									}
								}}
							>
								{filteredAlbums.albums.slice(0, visibleAlbumCount).map((album: any, index: number) => (
									<TouchableOpacity key={album.album_mid || index} style={{ width: NEW_ALBUM_COVER_SIZE, marginRight: 12 }} onPress={() => {
										const yearParam = album.public_time ? `&year=${album.public_time}` : ''
										router.push(`/(modals)/${album.album_mid}?album=1&singer=${playlistName}${yearParam}`)
									}}>
										<FastImage source={{ uri: album.artwork || '' }} style={{ width: NEW_ALBUM_COVER_SIZE, height: NEW_ALBUM_COVER_SIZE, borderRadius: 12 }} />
										<Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#fff' : '#000', marginTop: 6 }} numberOfLines={2}>{album.album_name}</Text>
										<Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{album.public_time ? formatYearOnly(album.public_time) : ''}</Text>
									</TouchableOpacity>
								))}
							</ScrollView>
						</View>
					)}
					{filteredAlbums.epsAndSingles.length > 0 && (
						<View style={{ marginTop: 24 }}>
							<Text style={{ fontSize: 18, fontWeight: '500', color: isDark ? '#fff' : '#000', marginLeft: 20, marginBottom: 12 }}>EP与单曲</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20 }}
								scrollEventThrottle={100}
								onScroll={(e) => {
									const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
									if (contentSize.width > 0 && contentOffset.x + layoutMeasurement.width >= contentSize.width - 100) {
										setVisibleEpCount((prev) => Math.min(prev + 4, filteredAlbums.epsAndSingles.length))
										if (visibleEpCount + 4 >= filteredAlbums.epsAndSingles.length) loadMoreAlbums()
									}
								}}
							>
								{filteredAlbums.epsAndSingles.slice(0, visibleEpCount).map((album: any, index: number) => (
									<TouchableOpacity key={album.album_mid || index} style={{ width: NEW_ALBUM_COVER_SIZE, marginRight: 12 }} onPress={() => {
										const yearParam = album.public_time ? `&year=${album.public_time}` : ''
										router.push(`/(modals)/${album.album_mid}?album=1&singer=${playlistName}${yearParam}`)
									}}>
										<FastImage source={{ uri: album.artwork || '' }} style={{ width: NEW_ALBUM_COVER_SIZE, height: NEW_ALBUM_COVER_SIZE, borderRadius: 12 }} />
										<Text style={{ fontSize: 14, fontWeight: '500', color: isDark ? '#fff' : '#000', marginTop: 6 }} numberOfLines={2}>{album.album_name}</Text>
										<Text style={{ fontSize: 12, color: '#999', marginTop: 2 }}>{album.public_time ? formatYearOnly(album.public_time) : ''}</Text>
									</TouchableOpacity>
								))}
							</ScrollView>
						</View>
					)}
					</ScrollView>
					<ScrollToTopFAB progress={newArtistFabProgress} shown={newArtistFabShown} onPress={() => { newArtistScrollToTop(); }} bottom={safeBottom + 74} />
					<DownloadQualityModal
						visible={showDownloadModal}
						onClose={() => setShowDownloadModal(false)}
						song={downloadSong as any}
					/>
					</View>
				)
		}

	return (
		<View style={{ flex: 1, backgroundColor: isDark ? '#000000' : '#f2f2f7' }}>
			{/* 自定义顶部提示（不被modal挡住） */}
			{customToast.visible && (
				<View style={{ position: 'absolute', top: 60, left: 20, right: 20, zIndex: 999, alignItems: 'center' }}>
					<View style={{ backgroundColor: 'rgba(0,0,0,0.85)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12, maxWidth: '90%' }}>
						<Text style={{ color: '#fff', fontSize: 14, textAlign: 'center' }} numberOfLines={2}>{customToast.message}</Text>
					</View>
				</View>
			)}
			{/* 背景图 */}
			<Animated.View
				style={[
					styles.headerBg,
					{
						transform: [{ translateY: headerTranslate }, { scale: headerScale }],
					},
				]}
			>
				<FastImage
					source={{ uri: singerListDetail?.singerImg || unknownTrackImageUri, priority: FastImage.priority.high }}
					style={styles.headerImage}
					resizeMode="cover"
				/>
				{/* 底部渐变遮罩 */}
				<View style={styles.headerGradient} />
			</Animated.View>

			{/* 导航栏 */}
			<Animated.View style={[styles.navbar, { paddingTop: top, height: top + NAVBAR_HEIGHT, opacity: navbarOpacity, backgroundColor: isDark ? '#000000' : '#ffffff' }]}>
				<TouchableOpacity onPress={() => router.back()} style={styles.navButton}>
					<SFSymbol systemName="chevron.left" size={24} color={isDark ? '#fff' : '#000'} />
				</TouchableOpacity>
				<Text style={[styles.navTitle, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{singerName || singerListDetail?.title || playlistName}</Text>
				<View style={styles.navButton} />
			</Animated.View>

			{/* 顶部按钮（未滚动时显示） */}
			<View style={[styles.topButtons, { paddingTop: top }]}>
				<View style={{ width: 36, height: 36 }} />
				<View style={{ width: 36, height: 36 }} />
			</View>

			<ScrollView
				contentInsetAdjustmentBehavior="never"
				scrollEventThrottle={16}
				onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: false })}
				style={{ flex: 1 }}
			>
				{/* 顶部占位（背景图高度） */}
				<View style={{ height: HEADER_HEIGHT }} />

				{/* 内容矩形区域 - 带背景色和顶部圆角，下滑时遮盖头像 */}
				<View style={[styles.contentCard, { backgroundColor: isDark ? '#000000' : '#ffffff' }]}>
					{/* 歌手名 + 播放按钮 */}
					<View style={styles.singerNameRow}>
						<Text style={[styles.singerName, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{singerName || singerListDetail?.title || playlistName}</Text>
						<TouchableOpacity style={styles.playButton} onPress={handlePlayAll}>
							<Ionicons name="play" size={24} color="#fff" style={{ marginLeft: 3 }} />
						</TouchableOpacity>
					</View>

					{/* 最新专辑 */}
					{latestAlbum && (
						<TouchableOpacity style={styles.latestAlbumSection} onPress={() => {
							const yearParam = latestAlbum.public_time ? `&year=${latestAlbum.public_time}` : ''
							router.push(`/(modals)/${latestAlbum.album_mid}?album=1&singer=${playlistName}${yearParam}`)
						}}>
							<FastImage source={{ uri: latestAlbum.artwork || unknownTrackImageUri, priority: FastImage.priority.low }} style={styles.latestAlbumCover} resizeMode="cover" />
							<View style={styles.latestAlbumInfo}>
								<Text style={[styles.latestAlbumDate, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>{latestAlbum.public_time ? formatYear(latestAlbum.public_time) : ''}</Text>
								<Text style={[styles.latestAlbumName, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{latestAlbum.album_name}</Text>
								<Text style={[styles.latestAlbumCount, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>{latestAlbum.songCount || 0} 首歌曲</Text>
								<TouchableOpacity style={styles.addButton} onPress={() => {
									const yearParam = latestAlbum.public_time ? `&year=${latestAlbum.public_time}` : ''
									router.push(`/(modals)/${latestAlbum.album_mid}?album=1&singer=${playlistName}${yearParam}`)
								}}>
									<Text style={styles.addButtonText}>New Alb</Text>
								</TouchableOpacity>
							</View>
						</TouchableOpacity>
					)}

					{/* 歌曲排行 */}
					<View style={styles.section}>
						<View style={styles.sectionHeader}>
							<Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>歌曲排行</Text>
						</View>
						{(() => {
							const allSongs = singerListDetail?.musicList || []
							const displaySongs = showAllSongs ? allSongs : allSongs.slice(0, 5)
							return (
								<View style={{ flexDirection: 'column' }}>
									{displaySongs.map((track, index) => {
							// 前5首直接显示，第6首开始纯滑入（无淡入）
							const SONG_HEIGHT = 70
							const SCREEN_H = Dimensions.get('window').height
							const SONGS_START = 640
							const songPos = SONGS_START + index * SONG_HEIGHT
							const songEntranceStyle = index < 5 ? {} : {
								transform: [{
									translateY: scrollY.interpolate({
										inputRange: [songPos - SCREEN_H, songPos - SCREEN_H + 5 * SONG_HEIGHT],
										outputRange: [50, 0],
										extrapolate: 'clamp',
									}),
								}],
							}
							return (
								<Animated.View key={index} style={songEntranceStyle}>
										<TouchableOpacity key={index} style={styles.songRow} onPress={() => handleSongPress(track)}>
											<FastImage source={{ uri: (index < loadedCoverCount && track.artwork) ? track.artwork : unknownTrackImageUri, priority: FastImage.priority.low }} style={styles.songCover} />
											<View style={styles.songInfo}>
												<Text style={[styles.songName, { color: isDark ? '#fff' : '#000' }]} numberOfLines={1}>{track.title}</Text>
												<Text style={[styles.songArtist, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]} numberOfLines={1}>
													{track.artist}{track.public_time || track.publishTime ? ' · ' + formatYear(track.public_time || track.publishTime) : ''}
												</Text>
											</View>
											<TrackShortcutsMenu track={track} blurBackdrop>
												<TouchableOpacity style={styles.songMoreBtn}>
													<SFSymbol systemName="ellipsis" size={20} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'} />
												</TouchableOpacity>
											</TrackShortcutsMenu>
																</TouchableOpacity>
					</Animated.View>
					)
				})}
					{allSongs.length > 5 && (
										<TouchableOpacity
											style={{
												paddingVertical: 12,
												alignItems: 'center',
												justifyContent: 'center',
												flexDirection: 'row',
												gap: 4,
											}}
											onPress={() => setShowAllSongs(!showAllSongs)}
										>
											<Text style={{ fontSize: 14, color: isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)' }}>
												{showAllSongs ? '收起' : `展开全部 ${allSongs.length} 首`}
											</Text>
											<SFSymbol systemName={showAllSongs ? 'chevron.up' : 'chevron.down'} size={16} color={isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.6)'} />
										</TouchableOpacity>
									)}
								</View>
							)
						})()}
					</View>

					{/* 专辑 */}
					{filteredAlbums.albums.length > 0 && (
						<View style={styles.section}>
							<Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>专辑</Text>
							{albumLoading ? (
								<ActivityIndicator size="small" color={isDark ? '#fff' : '#000'} style={{ marginTop: 20 }} />
							) : (
								<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.albumScroll}
							contentContainerStyle={{ paddingHorizontal: 8 }}
								scrollEventThrottle={100}
								onScroll={(e) => {
									const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
									if (contentSize.width > 0 && contentOffset.x + layoutMeasurement.width >= contentSize.width - 100) {
										setVisibleAlbumCount((prev) => Math.min(prev + 4, filteredAlbums.albums.length))
										if (visibleAlbumCount + 4 >= filteredAlbums.albums.length) loadMoreAlbums()
									}
								}}
							>
									{filteredAlbums.albums.slice(0, visibleAlbumCount).map((album, index) => (
										<TouchableOpacity
											key={album.album_mid || index}
											style={styles.albumCard}
											onPress={() => {
												const yearParam = album.public_time ? `&year=${album.public_time}` : ''
												router.push(`/(modals)/${album.album_mid}?album=1&singer=${playlistName}${yearParam}`)
											}}
										>
											<FastImage source={{ uri: album.artwork || unknownTrackImageUri, priority: FastImage.priority.low }} style={styles.albumCardCover} resizeMode="cover" />
											<Text style={[styles.albumCardName, { color: isDark ? '#fff' : '#000' }]} numberOfLines={2}>{album.album_name}</Text>
											<Text style={[styles.albumCardYear, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>{album.public_time ? formatYear(album.public_time) : ''}</Text>
										</TouchableOpacity>
									))}
								</ScrollView>
							)}
						</View>
					)}

					{/* EP与单曲 */}
					{filteredAlbums.epsAndSingles.length > 0 && (
						<View style={styles.section}>
							<Text style={[styles.sectionTitle, { color: isDark ? '#fff' : '#000' }]}>EP与单曲</Text>
							<ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.albumScroll}
							contentContainerStyle={{ paddingHorizontal: 8 }}
								scrollEventThrottle={100}
								onScroll={(e) => {
									const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent
									if (contentSize.width > 0 && contentOffset.x + layoutMeasurement.width >= contentSize.width - 100) {
										setVisibleEpCount((prev) => Math.min(prev + 4, filteredAlbums.epsAndSingles.length))
										if (visibleEpCount + 4 >= filteredAlbums.epsAndSingles.length) loadMoreAlbums()
									}
								}}
							>
								{filteredAlbums.epsAndSingles.slice(0, visibleEpCount).map((album, index) => (
									<TouchableOpacity
										key={album.album_mid || index}
										style={styles.albumCard}
										onPress={() => {
											const yearParam = album.public_time ? `&year=${album.public_time}` : ''
											router.push(`/(modals)/${album.album_mid}?album=1&singer=${playlistName}${yearParam}`)
										}}
									>
										<FastImage source={{ uri: album.artwork || unknownTrackImageUri, priority: FastImage.priority.low }} style={styles.albumCardCover} resizeMode="cover" />
										<Text style={[styles.albumCardName, { color: isDark ? '#fff' : '#000' }]} numberOfLines={2}>{album.album_name}</Text>
										<Text style={[styles.albumCardYear, { color: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)' }]}>{album.public_time ? formatYear(album.public_time) : ''}</Text>
									</TouchableOpacity>
								))}
							</ScrollView>
						</View>
					)}

					{/* 底部占位 */}
					<View style={{ height: 100 }} />
				</View>
			</ScrollView>

		</View>
	)
}

const styles = StyleSheet.create({
	headerBg: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		height: HEADER_HEIGHT,
		overflow: 'hidden',
	},
	headerImage: {
		width: '100%',
		height: '100%',
	},
	headerGradient: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		height: 230,
		backgroundColor: '#000',
		opacity: 0,
	},
	contentCard: {
		paddingTop: 20,
	},
	navbar: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		backgroundColor: '#000',
		zIndex: 10,
	},
	navButton: {
		width: 36,
		height: 36,
		alignItems: 'center',
		justifyContent: 'center',
	},
	navTitle: {
		flex: 1,
		textAlign: 'center',
		fontSize: 17,
		fontWeight: '500',
		color: '#fff',
	},
	topButtons: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		zIndex: 5,
	},
	topButton: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: 'rgba(0,0,0,0.3)',
		alignItems: 'center',
		justifyContent: 'center',
	},
	singerNameRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 8,
		paddingBottom: 20,
	},
	singerName: {
		flex: 1,
		fontSize: 34,
		fontWeight: '500',
		color: '#fff',
	},
	playButton: {
		width: 52,
		height: 52,
		borderRadius: 26,
		backgroundColor: '#ff453a',
		alignItems: 'center',
		justifyContent: 'center',
		marginLeft: 12,
	},
	latestAlbumSection: {
		flexDirection: 'row',
		paddingHorizontal: 8,
		paddingBottom: 24,
	},
	latestAlbumCover: {
		width: 120,
		height: 120,
		borderRadius: 8,
	},
	latestAlbumInfo: {
		flex: 1,
		marginLeft: 16,
		justifyContent: 'center',
	},
	latestAlbumDate: {
		fontSize: 13,
		color: 'rgba(255,255,255,0.5)',
		marginBottom: 4,
	},
	latestAlbumName: {
		fontSize: 17,
		fontWeight: '500',
		color: '#fff',
		marginBottom: 4,
	},
	latestAlbumCount: {
		fontSize: 13,
		color: 'rgba(255,255,255,0.5)',
		marginBottom: 12,
	},
	addButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		alignSelf: 'flex-start',
		paddingHorizontal: 16,
		paddingVertical: 8,
		borderRadius: 20,
		borderWidth: 1,
		borderColor: 'rgba(255,69,58,0.5)',
	},
	addButtonText: {
		fontSize: 15,
		fontWeight: '500',
		color: '#ff453a',
		textAlign: 'center',
	},
	artistBioSection: {
		paddingHorizontal: 8,
		paddingBottom: 20,
	},
	artistBioText: {
		fontSize: 14,
		lineHeight: 20,
		color: 'rgba(255,255,255,0.6)',
	},
	section: {
		paddingHorizontal: 8,
		paddingBottom: 24,
	},
	sectionHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginBottom: 12,
	},
	sectionTitle: {
		fontSize: 22,
		fontWeight: '500',
		color: '#fff',
	},
	songRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 8,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255,255,255,0.1)',
	},
	songCover: {
		width: 52,
		height: 52,
		borderRadius: 10,
	},
	songInfo: {
		flex: 1,
		marginLeft: 12,
	},
	songName: {
		fontSize: 16,
		fontWeight: '500',
		color: '#fff',
	},
	songArtist: {
		fontSize: 13,
		color: 'rgba(255,255,255,0.5)',
		marginTop: 2,
	},
	songMoreBtn: {
		padding: 8,
	},
	albumScroll: {
		marginTop: 12,
		marginHorizontal: -8,
	},
	albumCard: {
		width: ALBUM_CARD_SIZE,
		marginRight: 16,
	},
	albumCardCover: {
		width: ALBUM_CARD_SIZE,
		height: ALBUM_CARD_SIZE,
		borderRadius: 8,
	},
	albumCardName: {
		fontSize: 15,
		fontWeight: '500',
		color: '#fff',
		marginTop: 8,
	},
	albumCardYear: {
		fontSize: 13,
		color: 'rgba(255,255,255,0.5)',
		marginTop: 2,
	},
	showMoreBtn: {
		paddingVertical: 12,
		alignItems: 'center',
		marginTop: 4,
	},
	showMoreText: {
		fontSize: 14,
		color: 'rgba(255,255,255,0.6)',
		fontWeight: '500',
	},
})

export default SingerListScreen
