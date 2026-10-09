import { unknownTrackImageUri } from '@/constants/images'
import myTrackPlayer, { playListsStore } from '@/helpers/trackPlayerIndex'
import { Playlist } from '@/helpers/types'
import {
	refreshNeteasePlaylist,
	getNeteasePlaylistDetail,
	getNeteasePlaylistMeta,
	getNeteasePlaylistFirstSongs,
	getNeteasePlaylistMoreSongs,
	removeSongsFromNeteasePlaylist,
	likeNeteaseSong,
} from '@/helpers/userApi/netease-music-api'
import { getPlayListFromQ } from '@/helpers/userApi/getMusicSource'
import PersistStatus from '@/store/PersistStatus'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'

import { Redirect, useLocalSearchParams, usePathname, useRouter, useNavigation } from 'expo-router'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
	ActionSheetIOS,
	Alert,
	Pressable,
	StyleSheet,
	View,
} from 'react-native'
import { showToast } from '@/utils/utils'
import SFSymbol from '@/components/SFSymbol'
import { MenuView } from '@react-native-menu/menu'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { useFavorites } from '@/store/library'
import PlaylistTemplateScreen, { PlaylistTemplateRef } from '@/components/PlaylistTemplateScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// 本次启动会话内已播过入场动画的歌单 id 集合（杀后台重进后自动清空，可再次播放）
const playedPlaylistFloatSet: Set<string> = ((globalThis as any).__playedPlaylistFloatSet ||= new Set())

const PlaylistScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const insets = useSafeAreaInsets()
	const playlistRef = useRef<PlaylistTemplateRef>(null)
	const { name: playlistID } = useLocalSearchParams<{ name: string }>()
	const router = useRouter()
	const navigation = useNavigation()
	const pathname = usePathname()
	// 从发现页进入的歌单（/radio/xxx）不显示搜索框；音乐库歌单保留
	const fromRadioTab = pathname.startsWith('/radio')

	// 同一歌单在本次启动会话内只播一次入场上浮动画（挂载时登记，已播过的再次打开直接显示）
	const [entranceEnabled] = useState(() => {
		const key = playlistID || ''
		if (playedPlaylistFloatSet.has(key)) return false
		playedPlaylistFloatSet.add(key)
		return true
	})

	const playlists = playListsStore.useValue() as Playlist[] | null
	const [isRefreshing, setIsRefreshing] = useState(false)
	const { isLoggedIn, cookie, userPlaylists } = useDailyRecommendStore()
	const { toggleTrackFavorite } = useFavorites()
	const [searchQuery, setSearchQuery] = useState('')
	const [showSearchBar, setShowSearchBar] = useState(false)

	// 判断是否为用户自己创建的网易云歌单（支持移出歌曲）
	const playlist = useMemo(() => {
		return playlists?.find((p) => p.id === playlistID)
	}, [playlistID, playlists])

	const songs = useMemo(() => {
		return playlist?.songs || playlist?.tracks || []
	}, [playlist])

	// 创建者信息（兼容已持久化的旧歌单里 creator 可能以嵌套对象存放）
	const creatorName = useMemo(() => {
		const p: any = playlist
		return p?.artist || p?.creatorName || p?.creator?.nickname || ''
	}, [playlist])
	const creatorAvatar = useMemo(() => {
		const p: any = playlist
		return p?.creatorAvatar || p?.creator?.avatarUrl || ''
	}, [playlist])
	// 歌单简介（用获取到的 description，兼容 intro/desc）
	const playlistDesc = useMemo(() => {
		const p: any = playlist
		return p?.description || p?.intro || p?.desc || ''
	}, [playlist])
	const isRecommendPlaylist = (playlist as any)?.isRecommendPlaylist || (playlist as any)?.isToplist

	// 歌单封面：只使用歌单本身的封面
	const playlistCover = useMemo(() => {
		return playlist?.artwork || playlist?.coverImg || unknownTrackImageUri
	}, [playlist])

	// 进入页面自动同步歌单详情：有歌时轻量同步简介/创建者；无歌时全量加载
	const [isAutoLoading, setIsAutoLoading] = useState(false)
	React.useEffect(() => {
		if (!playlist) return
		const _netease = playlist?.platform === 'netease' || playlist?.platform === 'wy' || playlist?.neteasePlaylistId || String(playlist?.id || '').startsWith('netease_') || String(playlist?.id || '').startsWith('wy_')
		if (!_netease || !playlist.neteasePlaylistId) return
		let cancelled = false
		const pid = playlist.neteasePlaylistId
		const hasSongs = (playlist.songs || playlist.tracks || []).length > 0
		const hasTrackIds = Array.isArray(playlist.neteaseTrackIds) && playlist.neteaseTrackIds.length > 0
		// 需要首屏快载：完全没有歌，或已有歌但缺少 trackIds（旧数据无法分页，重新拉取补齐）
		const needFirstLoad = !hasSongs || !hasTrackIds
		const commitPatch = (patchObj: any) => {
			const all = (playListsStore.getValue() as any[]) || []
			const idx = all.findIndex((p: any) => p.id === playlistID)
			if (idx !== -1) {
				all[idx] = { ...all[idx], ...patchObj }
				playListsStore.setValue(all as any)
				PersistStatus.set('music.playLists', all)
			}
		}
		// 打开页面优先拉取 meta：标题/创建者头像/名字/简介，立即填充头部
		;(async () => {
			try {
				const meta = await getNeteasePlaylistMeta(pid, cookie || '')
				if (cancelled || !meta || Object.keys(meta).length === 0) return
				const patch = {
					title: meta.title || meta.name || playlist.title || playlist.name,
					name: meta.title || meta.name || playlist.title || playlist.name,
					artwork: meta.artwork || playlist.artwork,
					artist: meta.artist || playlist.artist,
					creatorAvatar: meta.creatorAvatar || playlist.creatorAvatar,
					// 直接用官方简介：没简介则置空（头部自然不显示）
					description: meta.description || '',
				}
				// 无变化则跳过，避免写回新引用导致死循环重渲染
				if (patch.title === playlist.title && patch.description === playlist.description && patch.artist === playlist.artist && patch.creatorAvatar === playlist.creatorAvatar && patch.artwork === playlist.artwork) return
				commitPatch(patch)
			} catch (e) { console.error('[歌单meta同步] 失败:', e) }
		})()
		if (needFirstLoad) {
			// 无歌或旧数据：首屏快载（只取前 30 首秒开），n=30 才能拿到完整 trackIds 与准确总曲目数，随后由静默全量刷新替换为全部歌曲
			setIsAutoLoading(true)
			;(async () => {
				try {
					console.log('[自动加载歌单] 首屏快载, id=', pid)
			const detail = await getNeteasePlaylistFirstSongs(pid, cookie || '', 30)
					if (cancelled) return
					const ns = detail.songs || []
					console.log('[自动加载歌单] 首屏完成, songs=', ns.length, '总曲目=', detail.trackCount)
					commitPatch({
						songs: ns,
						tracks: ns,
						neteaseTrackIds: detail.trackIds || [],
						neteaseTrackCount: detail.trackCount || ns.length,
						title: detail.title || detail.name || playlist.title,
						artwork: detail.artwork || playlist.artwork,
						artist: detail.artist || playlist.artist,
						creatorAvatar: detail.creatorAvatar || playlist.creatorAvatar,
						description: detail.description || '',
					})
				} catch (e) {
					console.error('[自动加载歌单] 首屏快载失败，回退全量:', e)
					try {
						if (cancelled) return
						const detail = await getNeteasePlaylistDetail(pid, cookie || '')
						if (cancelled) return
						const ns = detail.songs || detail.tracks || []
						commitPatch({
							songs: ns,
							tracks: ns,
							neteaseTrackIds: (detail as any).neteaseTrackIds || ns.map((s: any) => s.id),
							neteaseTrackCount: ns.length,
							title: detail.title || detail.name || playlist.title,
							artwork: detail.artwork || playlist.artwork,
							artist: detail.artist || playlist.artist,
							creatorAvatar: detail.creatorAvatar || playlist.creatorAvatar,
							description: detail.description || '',
						})
					} catch (e2) { console.error('[自动加载歌单] 全量回退失败:', e2) }
				}
				finally { if (!cancelled) setIsAutoLoading(false) }
			})()
		}
		return () => { cancelled = true }
	}, [playlist, playlistID, cookie])

	// 下滑分批加载更多（几千首歌单：首屏 10 首后按 60 首一批懒加载）
	const isLoadingMoreRef = React.useRef(false)
	const loadMoreSongs = React.useCallback(async () => {
		const _isNet = playlist?.platform === 'netease' || playlist?.platform === 'wy' || playlist?.neteasePlaylistId || String(playlist?.id || '').startsWith('netease_') || String(playlist?.id || '').startsWith('wy_')
		if (!playlist || !_isNet) return
		const trackIds: any[] = playlist.neteaseTrackIds || []
		const base = playlist.neteaseTrackCount || playlist.trackCount || trackIds.length
		if (!trackIds.length || !base) return
		const loaded = (playlist.songs || playlist.tracks || []).length
		if (loaded >= base) return
		if (isLoadingMoreRef.current) return
		isLoadingMoreRef.current = true
		try {
			const more = await getNeteasePlaylistMoreSongs(playlist.neteasePlaylistId, trackIds, loaded, 60, cookie || '')
			if (!more.length) return
			const all = ((playListsStore.getValue() as any[]) || []).slice()
			const idx = all.findIndex((p: any) => p.id === playlistID)
			if (idx === -1) return
			const existing = all[idx].songs || all[idx].tracks || []
			const seen = new Set(existing.map((s: any) => String(s.id || s.songmid || '')))
			const add = more.filter((s: any) => !seen.has(String(s.id || s.songmid || '')))
			if (!add.length) return
			const merged = existing.concat(add)
			all[idx] = { ...all[idx], songs: merged, tracks: merged }
			playListsStore.setValue(all as any)
			PersistStatus.set('music.playLists', all)
		} catch (e) { console.error('[歌单分页加载] 失败:', e) }
		finally { isLoadingMoreRef.current = false }
	}, [playlist, playlistID, cookie])

	const isNeteasePlaylist = useMemo(() => {
		return playlist?.platform === 'netease' || playlist?.platform === 'wy' || playlist?.neteasePlaylistId || String(playlist?.id || '').startsWith('netease_') || String(playlist?.id || '').startsWith('wy_')
	}, [playlist])
	// 判断是否为QQ音乐歌单
	const isQQPlaylist = useMemo(() => {
		return playlist?.platform === 'qq' || playlist?.platform === 'tx'
	}, [playlist])

	// 静默刷新歌单（每次进入都自动刷新全部歌曲，一次拿全；不阻塞页面）
	useEffect(() => {
		if (!isNeteasePlaylist || !playlist?.neteasePlaylistId) return
		let cancelled = false
		;(async () => {
			try {
				const detail = await getNeteasePlaylistDetail(playlist.neteasePlaylistId, cookie || '')
				if (cancelled || !detail) return
				const all = playListsStore.getValue() as any[] || []
				const idx = all.findIndex((p: any) => p.id === playlistID)
				if (idx !== -1) {
					const removedIds = all[idx].removedSongIds || []
					const filteredSongs = (detail.songs || []).filter((s: any) => !removedIds.includes(String(s.id || s.songmid || '')))
					all[idx] = {
						...all[idx],
						songs: filteredSongs,
						tracks: filteredSongs,
						playCount: detail.playCount || all[idx].playCount || 0,
						trackCount: detail.trackCount || filteredSongs.length || all[idx].trackCount,
						artwork: detail.artwork || all[idx].artwork,
						artist: detail.artist || all[idx].artist,
						creatorAvatar: detail.creatorAvatar || all[idx].creatorAvatar,
						description: detail.description || all[idx].description,
					}
					playListsStore.setValue(all as any)
					PersistStatus.set('music.playLists', all)
				}
			} catch (e) {}
		})()
		return () => { cancelled = true }
	}, [isNeteasePlaylist, playlist?.neteasePlaylistId, playlistID, cookie])

	// 从网易云歌单移除歌曲
	const handleRemoveFromNeteasePlaylist = useCallback(async (song: any) => {
		if (!playlist?.neteasePlaylistId || !cookie) return
		const songId = String(song.id || song.songmid || '').replace(/^(netease_|wy_)/, '')
		if (!songId) return

		Alert.alert('移出歌单', `确定将「${song.title || song.name}」移出网易云歌单吗？`, [
			{ text: '取消', style: 'cancel' },
			{
				text: '移出', style: 'destructive', onPress: async () => {
					const result = await removeSongsFromNeteasePlaylist(playlist.neteasePlaylistId, [songId], cookie)
					if (result.success) {
						showToast('已移出歌单', '', 'success')
						// 从本地歌单中移除
						const updatedSongs = songs.filter((s) => String(s.id || s.songmid) !== String(song.id || song.songmid))
						// 更新playlist（通过playListsStore）
						const updatedPlaylists = (playListsStore.getValue() as Playlist[] || []).map((p) => {
							if (p.id === playlistID) {
								return { ...p, songs: updatedSongs }
							}
							return p
						})
						playListsStore.setValue(updatedPlaylists)
					} else {
						showToast('移出失败: ' + (result.error || '未知错误'), '', 'error')
					}
				}
			},
		])
	}, [playlist, cookie, songs, playlistID])

	// 移除歌曲（长按菜单「移除歌曲」动作：网易云歌单走云端移除，本地歌单直接移除）
	const handleRemoveSong = useCallback((song: any) => {
		const songId = String(song.id || song.songmid || '')
		const currentPlaylist = (playListsStore.getValue() as Playlist[] || []).find((p) => p.id === playlistID)
		const isNetease = currentPlaylist?.platform === 'netease' || currentPlaylist?.platform === 'wy' || currentPlaylist?.neteasePlaylistId
		const canRemoveFromNetease = isNetease && currentPlaylist?.neteasePlaylistId && cookie
		if (canRemoveFromNetease) {
			handleRemoveFromNeteasePlaylist(song)
		} else {
			Alert.alert('移除歌曲', '确定将「' + (song.title || song.name) + '」从歌单中移除吗？', [
				{ text: '取消', style: 'cancel' },
				{
					text: '移除', style: 'destructive', onPress: () => {
						const updatedPlaylists = (playListsStore.getValue() as Playlist[] || []).map((p) => {
							if (p.id === playlistID) {
								const updatedSongs = (p.songs || []).filter((s) => String(s.id || s.songmid) !== songId)
								const removedIds = [...(p.removedSongIds || []), songId]
								return { ...p, songs: updatedSongs, removedSongIds: removedIds }
							}
							return p
						})
						playListsStore.setValue(updatedPlaylists)
						PersistStatus.set('music.playLists', updatedPlaylists)
						showToast('已移除歌曲', '', 'success')
					}
				},
			])
		}
	}, [playlistID, cookie, handleRemoveFromNeteasePlaylist])

	// 收藏/取消收藏后同步网易云
	const handleFavoriteToggle = useCallback((song: any, isFavorite: boolean) => {
		if (isLoggedIn && cookie) {
			const platform = song.platform || (song as any).source
			const songId = song.songmid || song.id || ''
			const isNetease = platform === 'netease' || platform === 'wy' || String(songId).startsWith('netease_') || String(songId).startsWith('wy_')
			if (isNetease && songId) {
				likeNeteaseSong(songId, isFavorite, cookie).catch(() => {})
			}
		}
	}, [isLoggedIn, cookie])

	// 自动同步：每30分钟刷新一次
	useEffect(() => {
		if (!isNeteasePlaylist || !playlist?.neteasePlaylistId) return

		const timer = setInterval(() => {
			handleRefresh(true)
		}, 30 * 60 * 1000)

		return () => clearInterval(timer)
	}, [isNeteasePlaylist, playlist?.neteasePlaylistId])

	// 刷新歌单
	const handleRefresh = useCallback(async (silent = false) => {
		if (!silent) setIsRefreshing(true)
		console.log('[歌单刷新] 点击刷新, playlist存在:', !!playlist, 'platform=', playlist?.platform, 'id=', playlist?.id, 'neteaseId=', playlist?.neteasePlaylistId)
		if (!playlist) {
			console.log('[歌单刷新] playlist为null, 跳过')
			if (!silent) setIsRefreshing(false)
			return
		}
		try {
			let updated = null
			if (isNeteasePlaylist && playlist.neteasePlaylistId) {
				console.log('[歌单刷新] 走网易云刷新, ID=', playlist.neteasePlaylistId)
				updated = await refreshNeteasePlaylist(playlist.neteasePlaylistId, cookie)
				console.log('[歌单刷新] 网易云返回, songs数=', updated?.songs?.length)
			} else if (isQQPlaylist) {
				const qqId = playlist.qqPlaylistId || playlist.originalId || String(playlist.id || '').replace(/^qq_/, '')
				console.log('[歌单刷新] 走QQ刷新, ID=', qqId)
				const qqResult = await getPlayListFromQ(String(qqId))
				console.log('[歌单刷新] QQ返回, success=', qqResult.success, 'songs数=', qqResult.songs?.length || qqResult.musicList?.length)
				if (qqResult.success) {
					const qqSongs = (qqResult.songs || qqResult.musicList || []).map((song: any) => ({
						...song,
						platform: 'qq',
						source: 'tx',
						songmid: song.songmid || song.mid || String(song.id || ''),
						originalId: song.originalId || song.id || '',
					}))
					updated = { songs: qqSongs, tracks: qqSongs, artwork: qqResult.artwork }
				}
			} else {
				console.log('[歌单刷新] 不是网易云也不是QQ歌单, 跳过')
			}
			if (!updated) {
				console.log('[歌单刷新] updated为null, 刷新失败')
				return
			}
			const currentPlaylists = playListsStore.getValue() || []
			const updatedPlaylists = currentPlaylists.map((p: any) => {
				if (p.id === playlist.id) {
					const removedIds = p.removedSongIds || []
					const filteredSongs = (updated.songs || []).filter((s: any) => !removedIds.includes(String(s.id || s.songmid || '')))
					return {
						...p,
						songs: filteredSongs,
						tracks: filteredSongs,
						lastRefreshTime: Date.now(),
						artwork: updated.artwork || p.artwork,
						playCount: updated.playCount ?? p.playCount,
						trackCount: updated.trackCount ?? p.trackCount,
						artist: updated.artist || p.artist,
						creatorAvatar: updated.creatorAvatar || p.creatorAvatar,
						description: updated.description || p.description,
					}
				}
				return p
			})
			playListsStore.setValue(updatedPlaylists)
			PersistStatus.set('music.playLists', updatedPlaylists)
			console.log('[歌单刷新] 同步成功')
		} catch (error) {
			console.error('刷新歌单失败:', error)
			console.log('[歌单刷新] 同步失败:', error?.message || error)
		} finally {
			if (!silent) setIsRefreshing(false)
		}
	}, [playlist, isNeteasePlaylist, isQQPlaylist])

	// 播放全部（按歌单原始顺序）
	const handlePlayAll = useCallback(() => {
		if (songs.length === 0) {
			showToast('歌单为空', '', 'info')
			return
		}
		myTrackPlayer.playWithReplacePlayList(songs[0] as any, songs as any, playlist?.name || playlist?.title || null)
	}, [songs, playlist])

	// 播放单曲
	const handlePlaySong = useCallback(
		(song: any) => {
			if (songs.length === 0) return
			myTrackPlayer.playWithReplacePlayList(song, songs as any, playlist?.name || playlist?.title || null)
		},
		[songs, playlist],
	)

	// 删除歌单
	const handleDeletePlaylist = useCallback(() => {
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: ['取消', '删除歌单'],
				cancelButtonIndex: 0,
				destructiveButtonIndex: 1,
				title: `确定要删除"${playlist?.name || playlist?.title || '歌单'}"吗？`,
			},
			(buttonIndex) => {
				if (buttonIndex === 1 && playlist) {
					const current = playListsStore.getValue() || []
					const updated = current.filter((p: any) => p.id !== playlist.id)
					playListsStore.setValue(updated as any)
					PersistStatus.set('music.playLists', updated)
					router.back()
				}
			},
		)
	}, [playlist, router])

	// 设置导航栏：无标题，背景同页面；右上角 ⋯ 圆形按钮（参考图：浅灰圆底+三点）
	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerTintColor: '#fc3c44',
			...getNavBarOptions(isDark, solidNavBarEnabled),
			headerStyle: {
				backgroundColor: solidNavBarEnabled
					? (isDark ? '#000' : '#fff')
					: (isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)'),
			},
			headerRight: () =>
				!isRecommendPlaylist ? (
					<MenuView
						title={playlist?.name || playlist?.title || '歌单'}
						onPressAction={({ nativeEvent }) => {
							if (nativeEvent.event === 'search') {
								if (showSearchBar) {
									setShowSearchBar(false)
									setTimeout(() => setShowSearchBar(true), 50)
								} else {
									setShowSearchBar(true)
								}
							}
							else if (nativeEvent.event === 'refresh') handleRefresh()
							else if (nativeEvent.event === 'delete') handleDeletePlaylist()
						}}
						actions={[
							{ id: 'search', title: '搜索歌曲', image: 'magnifyingglass' },
							{ id: 'refresh', title: '刷新歌单', image: 'arrow.clockwise' },
							{ id: 'delete', title: '删除歌单', image: 'trash', attributes: { destructive: true } },
						]}
					>
						<Pressable hitSlop={8} style={styles.headerMoreBtn}>
							<SFSymbol systemName="ellipsis" size={26} color="#fc3c44" weight="semibold" />
						</Pressable>
					</MenuView>
				) : null,
				headerSearchBarOptions: showSearchBar
					? {
						placeholder: '搜索歌曲',
						tintColor: colors.primary,
						barTintColor: colors.background,
						backgroundColor: colors.surfaceMuted,
						textColor: colors.text,
						hintTextColor: colors.placeholder,
						hideWhenScrolling: false,
						autoFocus: true,
						onChangeText: ({ nativeEvent: { text } }) => setSearchQuery(text),
						onCancelButtonPress: () => {
							setShowSearchBar(false)
							setSearchQuery('')
						},
					}
					: undefined,
		})
	}, [navigation, isRecommendPlaylist, playlist, handleRefresh, handleDeletePlaylist, colors, showSearchBar])


	// 是否还有更多歌曲未加载（列表底部显示加载指示）
	const loadingMore = useMemo(() => {
		if (!playlist) return false
		const total = (playlist as any)?.neteaseTrackCount || (playlist as any)?.trackCount || 0
		const loaded = (playlist?.songs?.length || playlist?.tracks?.length || 0)
		return total > loaded
	}, [playlist])

	if (!playlist) {
		console.warn(`Playlist ${playlistID} was not found!`)
		return <Redirect href={'/(tabs)/favorites'} />
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<PlaylistTemplateScreen
				ref={playlistRef}
				topInset={solidNavBarEnabled ? 0 : insets.top + 44 + 4}
				songs={songs}
				title={playlist.title || playlist.name || '歌单'}
				trackCount={(playlist as any)?.neteaseTrackCount || (playlist as any)?.trackCount || songs.length}
				coverUri={playlistCover}
				creatorName={creatorName}
				creatorAvatar={creatorAvatar}
				description={playlistDesc}
				searchPlaceholder="搜索歌单内歌曲"
				showSearch={!fromRadioTab}
				externalSearchQuery={searchQuery}
				hideCustomSearch={true}
				animateEntrance={entranceEnabled}
				removeLabel="移除歌曲"
				onRemoveSong={handleRemoveSong}
				onPlayAll={handlePlayAll}
				onPlaySong={handlePlaySong}
				onEndReached={loadMoreSongs}
				loadingMore={loadingMore}
				onFavoriteToggle={handleFavoriteToggle}
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

export default PlaylistScreen