import { unknownTrackImageUri } from '@/constants/images'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'
import {
	getNeteasePlaylistFirstSongs,
	getNeteasePlaylistMoreSongs,
	getNeteaseUserPlaylists,
	likeNeteaseSong,
} from '@/helpers/userApi/netease-music-api'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { showToast } from '@/utils/utils'
import PlaylistTemplateScreen from '@/components/PlaylistTemplateScreen'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const RED = '#e53935'

const NeteaseLikedScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const navigation = useNavigation()
	const router = useRouter()
	const insets = useSafeAreaInsets()
	const { isLoggedIn, userId, cookie } = useDailyRecommendStore()

	// 本次启动会话内该页面入场上浮只播一次（杀后台重进恢复）
	const [entranceEnabled] = useState(() => {
		const set: Set<string> = ((globalThis as any).__playedPageFloatSet ||= new Set())
		const key = 'profile_netease_liked'
		if (set.has(key)) return false
		set.add(key)
		return true
	})

	React.useLayoutEffect(() => {
		navigation.setOptions({
			headerTintColor: '#fc3c44',
			headerRight: null,
			headerTitle: '',
			headerBackVisible: true,
			headerBackTitle: '返回',
			headerShadowVisible: false,
			...getNavBarOptions(isDark, solidNavBarEnabled),
		})
	}, [navigation, isDark, colors.background, solidNavBarEnabled])

	const [playlistId, setPlaylistId] = useState('')
	const [songs, setSongs] = useState<any[]>([])
	const [trackIds, setTrackIds] = useState<number[]>([])
	const [trackCount, setTrackCount] = useState(0)
	const [artwork, setArtwork] = useState('')
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState('')

	// 解析「我喜欢的音乐」歌单 id
	useEffect(() => {
		if (!isLoggedIn || !cookie) return
		let cancelled = false
		;(async () => {
			try {
				const playlists = await getNeteaseUserPlaylists(userId || '', cookie)
				if (cancelled) return
				const loved = (playlists || []).find((p: any) => p.isLoved || p.specialType === 5 || p.name === '我喜欢的音乐')
				if (!loved) {
					console.error('[我喜欢的音乐] 未找到，歌单数:', (playlists || []).length, '名称:', (playlists || []).map((p: any) => p.name).join('、'))
					setError('未找到「我喜欢的音乐」歌单')
					setLoading(false)
					return
				}
				setPlaylistId(String(loved.id))
			} catch (e: any) {
				if (cancelled) return
				setError('获取歌单失败: ' + (e?.message || e))
				setLoading(false)
			}
		})()
		return () => { cancelled = true }
	}, [isLoggedIn, cookie, userId])

	useEffect(() => {
		isMountedRef.current = true
		return () => { isMountedRef.current = false }
	}, [])

	// 每次进入页面重新拉取最新歌曲（打开即刷新）
	useFocusEffect(
		useCallback(() => {
			if (!playlistId) return
			let cancelled = false
			;(async () => {
				setLoading(true)
				setError('')
				try {
					const detail = await getNeteasePlaylistFirstSongs(playlistId, cookie || '', 100)
					if (cancelled) return
					setSongs(detail.songs || [])
					setTrackIds(detail.trackIds || [])
					setTrackCount(detail.trackCount || (detail.songs || []).length)
					setArtwork(detail.artwork || '')
				} catch (e: any) {
					if (cancelled) return
					setError('加载歌曲失败: ' + (e?.message || e))
				} finally {
					if (!cancelled) setLoading(false)
				}
			})()
			return () => { cancelled = true }
		}, [playlistId, cookie]),
	)

	// 下滑分批加载更多
	const loadingMoreRef = useRef(false)
	const isMountedRef = useRef(true)
	const loadMoreSongs = useCallback(async () => {
		if (!playlistId || !trackIds.length) return
		const loaded = songs.length
		if (loaded >= trackCount || loadingMoreRef.current) return
		loadingMoreRef.current = true
		try {
			const more = await getNeteasePlaylistMoreSongs(playlistId, trackIds, loaded, 60, cookie || '')
			if (!more.length || !isMountedRef.current) return
			setSongs((prev) => {
				const seen = new Set(prev.map((s: any) => String(s.id || s.songmid || '')))
				const add = more.filter((s: any) => !seen.has(String(s.id || s.songmid || '')))
				return prev.concat(add)
			})
		} catch (e) { console.error('[我喜欢加载更多] 失败:', e) }
		finally { loadingMoreRef.current = false }
	}, [playlistId, trackIds, trackCount, songs.length, cookie])

	const loadingMore = useMemo(() => trackCount > songs.length, [trackCount, songs.length])

	const handlePlayAll = useCallback(() => {
		if (songs.length === 0) { showToast('歌单为空', '', 'info'); return }
		myTrackPlayer.playWithReplacePlayList(songs[0] as any, songs as any, '我喜欢的音乐')
	}, [songs])

	const handlePlaySong = useCallback((song: any) => {
		if (songs.length === 0) return
		myTrackPlayer.playWithReplacePlayList(song, songs as any, '我喜欢的音乐')
	}, [songs])

	// 取消收藏（取消红心）并从列表移除
	const handleUnliked = useCallback(async (song: any) => {
		const songId = String(song.id || song.songmid || '').replace(/^(netease_|wy_)/, '')
		if (!songId) return
		try {
			const res = await likeNeteaseSong(songId, false, cookie || '')
			if (res && res.success === false) throw new Error(res.error || '取消失败')
			showToast('已取消收藏', '', 'success')
			setSongs((prev) => prev.filter((s) => String(s.id || s.songmid) !== String(song.id || song.songmid)))
			setTrackCount((n) => Math.max(0, n - 1))
		} catch (e: any) {
			showToast('取消收藏失败: ' + (e?.message || e), '', 'error')
		}
	}, [cookie])

	if (!isLoggedIn) {
		return (
			<View style={[styles.center, { backgroundColor: colors.background }]}>
				<Text style={[styles.centerText, { color: colors.textMuted }]}>登录网易云后查看「我喜欢的音乐」</Text>
				<TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/(modals)/neteaseLogin' as any)}>
					<Text style={styles.loginBtnText}>去登录</Text>
				</TouchableOpacity>
			</View>
		)
	}

	if (error && songs.length === 0) {
		return (
			<View style={[styles.center, { backgroundColor: colors.background }]}>
				<Text style={[styles.centerText, { color: colors.textMuted }]}>{error}</Text>
				<TouchableOpacity
					style={styles.loginBtn}
					onPress={() => {
						setError('')
						setLoading(true)
						setPlaylistId('')
					}}
				>
					<Text style={styles.loginBtnText}>重试</Text>
				</TouchableOpacity>
			</View>
		)
	}

	if (loading && songs.length === 0) {
		return (
			<View style={[styles.center, { backgroundColor: colors.background }]}>
				<ActivityIndicator color={colors.textMuted} />
			</View>
		)
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<PlaylistTemplateScreen
				topInset={solidNavBarEnabled ? 0 : insets.top + 44 + 4}
				songs={songs}
				title="我喜欢的音乐"
				coverUri={artwork || unknownTrackImageUri}
				searchPlaceholder="搜索我喜欢的音乐"
				animateEntrance={entranceEnabled}
				removeLabel="取消收藏"
				onRemoveSong={handleUnliked}
				onPlayAll={handlePlayAll}
				onPlaySong={handlePlaySong}
				onEndReached={loadMoreSongs}
				loadingMore={loadingMore}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
	centerText: { fontSize: 15, textAlign: 'center', marginBottom: 16 },
	loginBtn: { backgroundColor: RED, borderRadius: 999, paddingHorizontal: 28, paddingVertical: 10 },
	loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
})

export default NeteaseLikedScreen
