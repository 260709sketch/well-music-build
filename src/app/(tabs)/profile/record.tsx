// 网易云听歌排行（最近一周 / 所有时间），数据来自 /weapi/v1/play/record
import SFSymbol from '@/components/SFSymbol'
import { unknownTrackImageUri } from '@/constants/images'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { getNeteaseListenRank } from '@/helpers/userApi/netease-music-api'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { shouldCacheImage } from '@/store/cacheManagerStore'
import { Ionicons } from '@expo/vector-icons'
import { useNavigation, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import SegmentedControl from '@react-native-segmented-control/segmented-control'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const TABS = [
	{ key: 1, label: '最近一周' },
	{ key: 0, label: '所有时间' },
]

const formatCount = (n: number): string => {
	const num = Number(n) || 0
	if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + ' 亿'
	if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + ' 万'
	return String(num)
}

const RANK_COLORS = ['#FC3C44', '#FF9500', '#FFCC00']
// 懒加载：首屏 10 首，之后每次滚动到底再加载 3 首
const INITIAL_COUNT = 10
const LOAD_MORE_COUNT = 3

const ListenRankScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const navigation = useNavigation()
	const router = useRouter()
	const isLoggedIn = useDailyRecommendStore((s) => s.isLoggedIn)
	const insets = useSafeAreaInsets()

	// 与历史播放页一致：原生详情头只保留返回键，标题为空，push/pop 与外层大标题联动
	useLayoutEffect(() => {
		navigation.setOptions({
			headerTitle: '',
			headerRight: null,
			headerTintColor: colors.primary,
...getNavBarOptions(isDark, solidNavBarEnabled),
		})
	}, [navigation, colors, isDark, solidNavBarEnabled])
	const [tab, setTab] = useState<number>(1)
	const [loading, setLoading] = useState(false)
	const [list, setList] = useState<any[]>([])
	const [error, setError] = useState('')
	const [visibleCount, setVisibleCount] = useState(INITIAL_COUNT)

	// 每个 tab 的数据缓存：切换时先秒出旧数据，后台静默刷新，不再每次转圈清空
	const cacheRef = useRef<Record<number, any[]>>({})

	const load = useCallback(async (type: number) => {
		const st = useDailyRecommendStore.getState()
		if (!st.isLoggedIn) {
			setList([])
			cacheRef.current = {}
			return
		}
		// 有缓存立即显示，不转圈；无缓存才显示 loading
		const cached = cacheRef.current[type]
		if (cached) {
			setList(cached)
			setVisibleCount(INITIAL_COUNT)
			setLoading(false)
		} else {
			setLoading(true)
		}
		setError('')
		try {
			const data = await getNeteaseListenRank(st.cookie, st.userId, type)
			const arr = Array.isArray(data) ? data : []
			cacheRef.current[type] = arr
			setList(arr)
			setVisibleCount(INITIAL_COUNT)
		} catch (e: any) {
			// 已有缓存就保留旧数据，不清空；无缓存才报错
			if (!cacheRef.current[type]) {
				setError(e?.message || '加载失败')
				setList([])
			}
		} finally {
			setLoading(false)
		}
	}, [])

	useEffect(() => {
		if (isLoggedIn) load(tab)
		else setList([])
	}, [isLoggedIn, tab, load])

	const playAll = () => {
		if (list.length > 0) myTrackPlayer.playWithReplacePlayList(list[0], list)
	}
	const playSong = (index: number) => {
		if (list[index]) myTrackPlayer.play(list[index])
	}

	// 懒加载：当前只挂载前 visibleCount 首，滚到底再追加
	const visibleList = useMemo(() => list.slice(0, visibleCount), [list, visibleCount])
	const onLoadMore = () => {
		setVisibleCount((c) => (c < list.length ? Math.min(c + LOAD_MORE_COUNT, list.length) : c))
	}
	const hasMore = visibleCount < list.length

	// 懒加载为本地切片、瞬时完成，未加载完不显示转圈（滚到底无感追加）；全部加载完才提示
	const footer =
		list.length > 0 && !hasMore ? (
			<View style={styles.footer}>
				<Text style={[styles.footerText, { color: colors.textMuted }]}>已加载全部 {list.length} 首</Text>
			</View>
		) : null

	const renderItem = ({ item, index }: { item: any; index: number }) => (
		<TouchableOpacity
			style={styles.row}
			activeOpacity={0.7}
			onPress={() => playSong(index)}
		>
			<Text
	numberOfLines={1}
				style={[
					styles.rank,
					{ color: index < 3 ? RANK_COLORS[index] : colors.textMuted },
				]}
			>
				{index + 1}
			</Text>
			<FastImage
				source={{
					uri: item.artwork || unknownTrackImageUri,
					cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache,
				}}
				style={styles.cover}
			/>
			<View style={styles.info}>
				<Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
					{item.title}
				</Text>
				<Text style={[styles.artist, { color: colors.textMuted }]} numberOfLines={1}>
					{item.artist}
				</Text>
			</View>
			<View style={styles.countBox}>
				<SFSymbol systemName="play.fill" size={11} color={colors.textMuted} />
				<Text style={[styles.count, { color: colors.textMuted }]}>
					{formatCount(item.playCount)} 次
				</Text>
			</View>
		</TouchableOpacity>
	)

	const header = (
		<View style={{ paddingHorizontal: 16, paddingTop: solidNavBarEnabled ? 0 : insets.top + 44 + 4 }}>
			{/* 周榜 / 总榜 分段 */}
			<SegmentedControl
				values={TABS.map((t) => t.label)}
				selectedIndex={TABS.findIndex((t) => t.key === tab)}
				onChange={(event) => {
					const idx = event.nativeEvent.selectedSegmentIndex
					setTab(TABS[idx].key)
				}}
				style={{ marginHorizontal: 16, marginVertical: 8 }}
			/>

			<View style={styles.actionRow}>
				<Text style={[styles.total, { color: colors.textMuted }]}>共 {list.length} 首</Text>
				<TouchableOpacity
					style={[styles.playAllBtn, { backgroundColor: colors.primary }]}
					onPress={playAll}
					disabled={list.length === 0}
					activeOpacity={0.8}
				>
					<SFSymbol systemName="play.fill" size={16} color="#ffffff" />
					<Text style={styles.playAllText}>播放全部</Text>
				</TouchableOpacity>
			</View>
		</View>
	)

	if (!isLoggedIn) {
		return (
			<View style={[styles.center, { backgroundColor: colors.background }]}>
				<View style={[styles.loginIcon, { backgroundColor: colors.separator }]}>
					<SFSymbol systemName="person" size={34} color={colors.textMuted} />
				</View>
				<Text style={[styles.tipTitle, { color: colors.text }]}>未登录网易云账号</Text>
				<Text style={[styles.tipSub, { color: colors.textMuted }]}>点击去登录查看你的网易云听歌排行</Text>
				<TouchableOpacity style={[styles.loginBtn, { backgroundColor: colors.primary }]} onPress={() => router.push("/(modals)/neteaseLogin")} activeOpacity={0.8}>
					<Text style={styles.loginBtnText}>去登录</Text>
				</TouchableOpacity>
			</View>
		)
	}

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			<FlatList
				data={visibleList}
				renderItem={renderItem}
				keyExtractor={(item, index) => item.id || String(index)}
				ListHeaderComponent={header}
				ListFooterComponent={footer}
				onEndReached={onLoadMore}
				onEndReachedThreshold={0.3}
				initialNumToRender={10}
				maxToRenderPerBatch={3}
				contentContainerStyle={{ paddingTop: 8, paddingBottom: 180, flexGrow: 1 }}
				showsVerticalScrollIndicator={false}
				ListEmptyComponent={
					loading ? (
						<View style={styles.center}>
							<ActivityIndicator color={colors.primary} />
						</View>
					) : error ? (
						<View style={styles.center}>
							<Text style={[styles.tipSub, { color: colors.textMuted }]}>{error}</Text>
							<TouchableOpacity style={[styles.loginBtn, { backgroundColor: colors.primary }]} onPress={() => load(tab)} activeOpacity={0.8}>
								<Text style={styles.loginBtnText}>重试</Text>
							</TouchableOpacity>
						</View>
					) : (
						<View style={styles.center}>
							<Text style={[styles.tipSub, { color: colors.textMuted }]}>暂无听歌记录</Text>
						</View>
					)
				}
			/>
		</View>
	)
}

const styles = StyleSheet.create({
	center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
	loginIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
	tipTitle: { fontSize: 17, fontWeight: '500' },
	tipSub: { fontSize: 13, marginTop: 6, textAlign: 'center' },
	loginBtn: { marginTop: 20, paddingHorizontal: 34, paddingVertical: 11, borderRadius: 22 },
	loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '500' },
	segment: { flexDirection: 'row', borderRadius: 10, padding: 3 },
	segmentBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
	segmentActive: { shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
	actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 },
	total: { fontSize: 13 },
	playAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 18 },
	playAllText: { color: '#fff', fontSize: 13, fontWeight: '500' },
	row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 9 },
	rank: { width: 34, textAlign: 'center', fontSize: 15, fontWeight: '500', marginRight: 8 },
	cover: { width: 48, height: 48, borderRadius: 8 },
	info: { flex: 1, marginLeft: 12 },
	title: { fontSize: 15, fontWeight: '500' },
	artist: { fontSize: 12, marginTop: 3 },
	countBox: { flexDirection: 'row', alignItems: 'center', gap: 3, marginLeft: 8 },
	count: { fontSize: 12 },
	footer: { paddingVertical: 18, alignItems: 'center', justifyContent: 'center' },
	footerText: { fontSize: 12 },
})

export default ListenRankScreen
