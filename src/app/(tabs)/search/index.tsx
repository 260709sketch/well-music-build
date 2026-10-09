import { SearchList } from '@/components/SearchList'
import SFSymbol from '@/components/SFSymbol'
import { ThemeColors } from '@/constants/tokens'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import searchAll, { SearchPlatform, SearchType } from '@/helpers/searchAll'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useSearchStore } from '@/store/searchStore'
import { useSearchHistoryStore } from '@/store/searchHistoryStore'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	NativeScrollEvent,
	ScrollView,
	StyleSheet,
	Text,
	Keyboard,
	TextInput,
	TouchableOpacity,
	View,
	Animated,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { MenuAction, MenuView } from '@react-native-menu/menu'
import { Track } from 'react-native-track-player'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useNavigation, useFocusEffect } from 'expo-router'
import { useTabBarStyleStore } from '@/store/tabBarStyleStore'
import PersistStatus from '@/store/PersistStatus'
import SegmentedControl from '@react-native-segmented-control/segmented-control'
import FastImage from 'react-native-fast-image'
import { unknownTrackImageUri } from '@/constants/images'
import { shouldCacheImage } from '@/store/cacheManagerStore'
import { router } from 'expo-router'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'
import { ScrollToTopFAB, useScrollToTop } from '@/components/ScrollToTopFAB'
import { getHotSearchByPlatform } from '@/helpers/userApi/hotSearch'

// 搜索分类（综合 / 单曲 / 歌手 / 专辑）
type SearchTab = 'all' | 'songs' | 'artists' | 'album'
const SEARCH_TYPES: { id: SearchTab; name: string }[] = [
	{ id: 'all', name: '综合' },
	{ id: 'songs', name: '单曲' },
	{ id: 'artists', name: '歌手' },
	{ id: 'album', name: '专辑' },
]

// 平台列表
const PLATFORMS: { id: SearchPlatform; name: string }[] = [
	{ id: 'netease', name: '网易云' },
	{ id: 'qq', name: 'QQ音乐' },
	{ id: 'kugou', name: '酷狗' },
	{ id: 'kuwo', name: '酷我' },
]

const PLATFORM_FULL_NAME: Record<SearchPlatform, string> = {
	netease: '网易云音乐',
	qq: 'QQ音乐',
	kugou: '酷狗音乐',
	kuwo: '酷我音乐',
}

// 单次搜索请求的兜底超时
const SEARCH_REQUEST_TIMEOUT = 15000

// 热搜兜底词
const HOT_SEARCHES = [
	'甲乙丙丁',
	'无人之岛',
	'起风了',
	'后来',
	'晴天',
	'七里香',
	'稻香',
	'告白气球',
]

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => setTimeout(() => reject(new Error('SEARCH_TIMEOUT')), ms)),
	])
}

// 右上角平台选择按钮：iOS 原生 UIMenu，位置不动
const PlatformHeaderButton = ({
	current,
	isDark,
	onSelect,
}: {
	current: SearchPlatform
	isDark: boolean
	onSelect: (p: SearchPlatform) => void
}) => {
	const currentFull = PLATFORM_FULL_NAME[current]
	const actions: MenuAction[] = (Object.keys(PLATFORM_FULL_NAME) as SearchPlatform[]).map((id) => ({
		id,
		title: id === current ? PLATFORM_FULL_NAME[id] + '  ✓' : PLATFORM_FULL_NAME[id],
		state: 'off',
	}))
	return (
		<MenuView
			onPressAction={({ nativeEvent: { event } }) => {
				if (event && event !== current) {
					onSelect(event as SearchPlatform)
				}
			}}
			actions={actions}
			shouldOpenOnLongPress={false}
		>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingLeft: 4, marginRight: 8 }}>
				<Text style={{ color: isDark ? '#fff' : '#000', fontSize: 15, fontWeight: '500' }}>{currentFull}</Text>
				<SFSymbol systemName="chevron.down" size={14} color={isDark ? '#9a9aa0' : '#8e8e93'} />
			</View>
		</MenuView>
	)
}

const formatDuration = (duration?: number) => {
	if (!duration || duration <= 0) return ''
	const total = Math.floor(duration)
	const m = Math.floor(total / 60)
	const s = total % 60
	return `${m}:${String(s).padStart(2, '0')}`
}

const SearchlistsScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { top, bottom: safeBottom } = useSafeAreaInsets()
	const navigation = useNavigation()
	useTabBarStyleStore()
	const styles = useMemo(() => createStyles(colors, isDark, top), [colors, isDark, top])

	const muted = isDark ? '#8a8a8e' : '#8e8e93'

	// 单 tab 结果
	const [searchResults, setSearchResults] = useState<Track[]>([])
	// 综合页聚合结果
	const [allSongs, setAllSongs] = useState<Track[]>([])
	const [allArtists, setAllArtists] = useState<Track[]>([])
	const [allAlbums, setAllAlbums] = useState<Track[]>([])
	const [isSearching, setIsSearching] = useState(false)
	const [page, setPage] = useState(1)
	const [hasMore, setHasMore] = useState(true)
	const [isLoadingMore, setIsLoadingMore] = useState(false)
	const [visibleCount, setVisibleCount] = useState(8)
	const searchRequestRef = useRef(0)
	const tabCacheRef = useRef<Record<string, { data: Track[]; hasMore: boolean }>>({})
	const [searchTrigger, setSearchTrigger] = useState(0)
	const inputRef = useRef<TextInput>(null)
	const scrollRef = useRef<ScrollView>(null)
	// 搜索框入场动画：普通下移淡入
	const searchBoxAnim = useRef(new Animated.Value(0)).current
	useEffect(() => {
		Animated.timing(searchBoxAnim, {
			toValue: 1,
			duration: 350,
			useNativeDriver: false,
		}).start()
	}, [])
	const { onScroll: onSearchFabScroll, scrollToTop: searchScrollToTop, progress: searchFabProgress, shown: searchFabShown } = useScrollToTop(scrollRef)
	const [searchType, setSearchType] = useState<SearchTab>('all')

	const [searchPlatform, setSearchPlatform] = useState<SearchPlatform>('netease')
	const [platformSwitchStyle, setPlatformSwitchStyle] = useState<string>(PersistStatus.get('search.platformSwitchStyle' as any) || 'navbar')
	const isNativePlatformSwitch = platformSwitchStyle === 'native'
	const [searchInput, setSearchInput] = useState('')
	const [platformHotWords, setPlatformHotWords] = useState<string[]>([])

	const keyword = useSearchStore((state) => state.keyword)
	const setKeyword = useSearchStore((state) => state.setKeyword)
	const { history, addHistory, removeHistory, clearHistory } = useSearchHistoryStore()
	const [showSearchHistory, setShowSearchHistory] = useState(PersistStatus.get('search.showHistory') !== false)

	useFocusEffect(
		useCallback(() => {
			setShowSearchHistory(PersistStatus.get('search.showHistory') !== false)
		}, [])
	)

	useEffect(() => {
		if (keyword !== searchInput) {
			setSearchInput(keyword)
		}
	}, [keyword])

	useEffect(() => {
		let cancelled = false
		getHotSearchByPlatform(searchPlatform).then((words) => {
			if (!cancelled && words.length > 0) {
				setPlatformHotWords(words)
			}
		})
		return () => { cancelled = true }
	}, [searchPlatform])

	const debouncedSearch = useMemo(
		() =>
			debounce((text: string) => {
				setKeyword(text)
				if (text) {
					addHistory(text)
				}
			}, 300),
		[setKeyword, addHistory],
	)

	const handleSearchInputChange = useCallback(
		(text: string) => {
			if (text.endsWith('    ')) {
				setSearchInput('')
				setKeyword('')
			} else {
				setSearchInput(text)
				debouncedSearch(text)
			}
		},
		[debouncedSearch, setKeyword],
	)

	// 拉取单个分类（page 分页）
	const fetchType = useCallback(
		(type: SearchType, kw: string, pg: number) =>
			withTimeout(searchAll(kw, pg, type, searchPlatform), SEARCH_REQUEST_TIMEOUT)
				.then((r) => ({ data: r.data as Track[], hasMore: r.hasMore as boolean }))
				.catch(() => ({ data: [] as Track[], hasMore: false })),
		[searchPlatform],
	)

	// 关键词 / 分类 / 平台变化重新拉取
	useEffect(() => {
		const requestId = ++searchRequestRef.current
		if (!keyword) {
			setSearchResults([])
			setAllSongs([])
			setAllArtists([])
			setAllAlbums([])
			setIsSearching(false)
			setPage(1)
			setHasMore(true)
			return
		}
		// 切 tab 有缓存直接用，不重复请求
		const cacheKey = searchType + '|' + searchPlatform + '|' + keyword
		if (searchType !== 'all' && tabCacheRef.current[cacheKey]) {
			const c = tabCacheRef.current[cacheKey]
			setSearchResults(c.data)
			setHasMore(c.hasMore)
			setIsSearching(false)
			return
		}
		setIsSearching(true)
		if (searchType === 'all') {
			// 综合：并行拉 单曲/歌手/专辑
			Promise.all([
				fetchType('songs', keyword, 1),
				fetchType('artists', keyword, 1),
				fetchType('album', keyword, 1),
			]).then(([s, a, al]) => {
				if (requestId !== searchRequestRef.current) return
				setAllSongs(s.data)
				setAllArtists(a.data)
				setAllAlbums(al.data)
				setIsSearching(false)
			})
		} else {
			setPage(1)
			const apiType: SearchType = searchType as SearchType
			fetchType(apiType, keyword, 1).then((r) => {
				if (requestId !== searchRequestRef.current) return
				setSearchResults(r.data)
				setHasMore(r.hasMore)
				setIsSearching(false)
				if (r.data.length > 0) tabCacheRef.current[cacheKey] = { data: r.data, hasMore: r.hasMore }
			})
		}
	}, [keyword, searchType, searchPlatform, searchTrigger, fetchType])

	// 单 tab 上拉加载更多
	const handleLoadMore = useCallback(() => {
		if (!keyword || searchType === 'all' || isSearching || isLoadingMore || !hasMore || searchResults.length === 0) return
		const next = page + 1
		setIsLoadingMore(true)
		const apiType: SearchType = searchType as SearchType
		fetchType(apiType, keyword, next).then((r) => {
			setSearchResults((prev) => [...prev, ...r.data])
			setHasMore(r.hasMore)
			setPage(next)
			setIsLoadingMore(false)
		})
	}, [keyword, searchType, isSearching, isLoadingMore, hasMore, searchResults.length, page, fetchType])

	const handleScroll = useCallback(
		(event: { nativeEvent: NativeScrollEvent }) => {
			onSearchFabScroll(event)
			const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent
			if (contentSize.height - layoutMeasurement.height - contentOffset.y < 400) {
			setVisibleCount((v) => v + (searchType === 'songs' ? 8 : 6))
				handleLoadMore()
			}
		},
		[handleLoadMore],
	)

	const handleHistoryPress = useCallback(
		(historyItem: string) => {
			Keyboard.dismiss()
			setSearchInput(historyItem)
			setKeyword(historyItem)
			addHistory(historyItem)
		},
		[setKeyword, addHistory],
	)

	const handleSearchTypeChange = useCallback((type: SearchTab) => {
		setSearchType(type)
		setVisibleCount(type === 'songs' ? 8 : 6)
	}, [])

	const handlePlatformChange = useCallback((platform: SearchPlatform) => {
		setSearchPlatform(platform)
	}, [])

	// 导航栏：固定标题，平台切换方式决定右上角按钮
	useEffect(() => {
		navigation.setOptions({
			title: '搜索',
			headerRight: isNativePlatformSwitch ? () => null : () => (
				<PlatformHeaderButton current={searchPlatform} isDark={isDark} onSelect={handlePlatformChange} />
			),
		})
	}, [navigation, searchPlatform, isDark, handlePlatformChange, isNativePlatformSwitch])

	const doSearch = useCallback(() => {
		Keyboard.dismiss()
		const q = searchInput.trim()
		if (q) {
			setKeyword(q)
			addHistory(q)
			setSearchTrigger((t) => t + 1)
		}
	}, [searchInput, setKeyword, addHistory])

	const clearInput = useCallback(() => {
		setSearchInput('')
		setKeyword('')
		inputRef.current?.focus()
	}, [setKeyword])

	// 点歌手/专辑卡片跳转详情
	const openArtist = useCallback((item: Track) => {
		const singerName = item.title || item.artist
		const singerPlatform = (item as any).platform || (item as any).source || 'netease'
		const singerMid = (item as any).singerMid
		if (singerName && !singerName.includes('未知')) {
			if (singerMid) {
				router.navigate({ pathname: '/(modals)/[name]', params: { name: singerMid, singerName: singerName } })
			} else {
				getSingerMidBySingerName(singerName, singerPlatform).then((mid) => {
					if (mid) router.navigate({ pathname: '/(modals)/[name]', params: { name: mid, singerName } })
				})
			}
		}
	}, [])

	const openAlbum = useCallback((item: Track) => {
		const albumMid = (item as any).albumMid || item.id
		if (albumMid) {
			router.navigate({ pathname: '/(modals)/[name]', params: { name: albumMid, album: '1' } })
		}
	}, [])

	const playSong = useCallback(
		(item: Track) => {
			Keyboard.dismiss()
			myTrackPlayer.play(item as any)
		},
		[],
	)

	const platformFullName = PLATFORM_FULL_NAME[searchPlatform]

	// 综合页：单曲前6首
	const renderSongRow = (item: Track, index: number) => (
		<TouchableOpacity key={`s${index}`} style={styles.songRow} onPress={() => playSong(item)} activeOpacity={0.7}>
			<FastImage
				source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
				style={styles.songCover}
			/>
			<View style={styles.songInfo}>
				<Text numberOfLines={1} style={[styles.songTitle, { color: colors.text }]}>
					{item.title}
				</Text>
				<Text numberOfLines={1} style={[styles.songArtist, { color: muted }]}>
					{item.artist || '未知歌手'}
				</Text>
			</View>
			<Text style={[styles.songDuration, { color: muted }]}>{formatDuration(item.duration)}</Text>
		</TouchableOpacity>
	)

	// 综合页：圆形歌手头像横滑
	const renderArtistCard = (item: Track, index: number) => (
		<TouchableOpacity key={`a${index}`} style={styles.artistCard} onPress={() => openArtist(item)} activeOpacity={0.7}>
			<FastImage
				source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
				style={styles.artistAvatar}
			/>
			<Text numberOfLines={1} style={[styles.artistName, { color: colors.text }]}>
				{item.title}
			</Text>
		</TouchableOpacity>
	)

	// 综合页：方形专辑封面横滑
	const renderAlbumCard = (item: Track, index: number) => (
		<TouchableOpacity key={`al${index}`} style={styles.albumCard} onPress={() => openAlbum(item)} activeOpacity={0.7}>
			<FastImage
				source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
				style={styles.albumCover}
			/>
			<Text numberOfLines={1} style={[styles.albumTitle, { color: colors.text }]}>
				{item.title}
			</Text>
			<Text numberOfLines={1} style={[styles.albumArtist, { color: muted }]}>
				{item.artist || ''}
			</Text>
		</TouchableOpacity>
	)

	const SectionHeader = ({ title, onPressMore }: { title: string; onPressMore?: () => void }) => (
		<View style={styles.sectionHeader}>
			<Text style={[styles.sectionHeaderTitle, { color: colors.text }]}>{title}</Text>
			{onPressMore ? (
				<TouchableOpacity onPress={onPressMore} style={styles.moreBtn}>
					<Text style={[styles.moreText, { color: muted }]}>更多</Text>
					<SFSymbol systemName="chevron.right" size={14} color="#C6C6C6" />
				</TouchableOpacity>
			) : null}
		</View>
	)

	const showResult = keyword.length > 0

	return (
		<View style={styles.container}>
			<ScrollView
				ref={scrollRef}
				contentContainerStyle={[styles.scrollContent, showResult && styles.scrollContentSearched]}
				contentInsetAdjustmentBehavior="automatic"
				showsVerticalScrollIndicator={false}
				keyboardShouldPersistTaps="handled"
				keyboardDismissMode="on-drag"
				onScroll={handleScroll}
				scrollEventThrottle={16}
			>
				{/* 搜索框 */}
				<Animated.View style={[styles.searchBox, {
					opacity: searchBoxAnim,
					transform: [{ translateY: searchBoxAnim.interpolate({ inputRange: [0, 1], outputRange: [-12, 0] }) }]
				}]}>
					<SFSymbol systemName="magnifyingglass" size={19} color={muted} />
					<TextInput
						ref={inputRef}
						style={styles.searchInput}
						value={searchInput}
						onChangeText={handleSearchInputChange}
						onSubmitEditing={doSearch}
						placeholder="搜索歌曲、歌手、专辑、歌单"
						placeholderTextColor={muted}
						returnKeyType="search"
						clearButtonMode="never"
					/>
					{searchInput.length > 0 ? (
						<TouchableOpacity style={styles.clearCircle} onPress={clearInput} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
							<SFSymbol systemName="xmark" size={12} color={isDark ? '#1c1c1e' : '#fff'} />
						</TouchableOpacity>
					) : null}
					<TouchableOpacity onPress={doSearch} hitSlop={{ top: 10, bottom: 10, left: 8, right: 4 }}>
						<Text style={styles.searchBtnText}>搜索</Text>
					</TouchableOpacity>
					</Animated.View>

				{/* 分段：仅搜索时显示 */}
				{showResult ? (
					<>
						{/* iOS原生切换模式：平台分段在页面内 */}
						{isNativePlatformSwitch && (
							<SegmentedControl
								values={PLATFORMS.map((p) => p.name)}
								selectedIndex={PLATFORMS.findIndex((p) => p.id === searchPlatform)}
								onChange={(event) => {
									const idx = event.nativeEvent.selectedSegmentIndex
									handlePlatformChange(PLATFORMS[idx].id)
								}}
								style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 4 }}
							/>
						)}
						{/* 类型分段 */}
						<View style={{ marginBottom: -8 }}>
							<SegmentedControl
								values={SEARCH_TYPES.map((t) => t.name)}
								selectedIndex={SEARCH_TYPES.findIndex((t) => t.id === searchType)}
								onChange={(event) => {
									const idx = event.nativeEvent.selectedSegmentIndex
									handleSearchTypeChange(SEARCH_TYPES[idx].id)
								}}
								style={{ marginHorizontal: 16, marginVertical: 8 }}
							/>
						</View>
					</>
				) : null}

				{/* 未搜索：历史搜索 + 热搜 */}
				{!showResult && showSearchHistory && (
					<>
						{history.length > 0 && (
							<View style={styles.historySection}>
								<View style={styles.historyHeader}>
									<Text style={[styles.sectionTitle, { color: colors.text }]}>历史搜索</Text>
									<TouchableOpacity style={styles.clearAllBtn} onPress={clearHistory}>
										<SFSymbol systemName="trash" size={16} color={muted} />
										<Text style={styles.clearAllText}>清空</Text>
									</TouchableOpacity>
								</View>
								<View style={styles.chipWrap}>
									{history.slice(0, 12).map((item, index) => (
										<View key={index} style={styles.historyChip}>
											<TouchableOpacity style={styles.historyChipMain} onPress={() => handleHistoryPress(item)}>
												<SFSymbol systemName="clock" size={14} color={muted} />
												<Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{item}</Text>
											</TouchableOpacity>
											<TouchableOpacity onPress={() => removeHistory(item)} hitSlop={{ top: 10, bottom: 10, left: 8, right: 10 }}>
												<SFSymbol systemName="xmark" size={13} color={muted} />
											</TouchableOpacity>
										</View>
									))}
								</View>
							</View>
						)}
						<View style={styles.hotSection}>
							<View style={styles.chipWrap}>
								{(platformHotWords.length > 0 ? platformHotWords : HOT_SEARCHES).map((item, index) => (
									<TouchableOpacity key={index} style={styles.hotChip} onPress={() => handleHistoryPress(item)}>
										<Text style={styles.hotIndex}>{index + 1}</Text>
										<Text style={[styles.chipText, { color: colors.text }]} numberOfLines={1}>{item}</Text>
									</TouchableOpacity>
								))}
							</View>
						</View>
					</>
				)}

				{/* 综合页聚合 */}
				{showResult && searchType === 'all' && !isSearching && (
					<View>
						{allSongs.length > 0 && (
							<View style={{ marginBottom: 18 }}>
									<View style={{ paddingHorizontal: 4 }}>{allSongs.slice(0, 6).map(renderSongRow)}</View>
							</View>
						)}
						{allArtists.length > 0 && (
							<View style={{ marginBottom: 18 }}>
								<SectionHeader title="歌手" onPressMore={() => handleSearchTypeChange('artists')} />
								<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 14 }}>
									{allArtists.slice(0, 8).map(renderArtistCard)}
								</ScrollView>
							</View>
						)}
						{allAlbums.length > 0 && (
							<View style={{ marginBottom: 18 }}>
								<SectionHeader title="专辑" onPressMore={() => handleSearchTypeChange('album')} />
								<ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14 }} contentContainerStyle={{ paddingHorizontal: 14, gap: 14 }}>
									{allAlbums.slice(0, 8).map(renderAlbumCard)}
								</ScrollView>
							</View>
						)}

						{allSongs.length === 0 && allArtists.length === 0 && allAlbums.length === 0 && (
							<View style={styles.emptyWrap}>
								<SFSymbol systemName="magnifyingglass" size={44} color={muted} />
								<Text style={[styles.emptySub, { color: muted }]}>{platformFullName}未找到相关结果</Text>
							</View>
						)}
					</View>
				)}

				{/* 单曲：透明行列表（kumone TrackRow 风格） */}
				{showResult && searchType === 'songs' && !isSearching && (
					<View style={{ paddingHorizontal: 4 }}>
						{searchResults.slice(0, visibleCount).map(renderSongRow)}
					</View>
				)}

				{/* 歌手：圆形头像网格（kumone CardGrid） */}
				{showResult && searchType === 'artists' && (
					<View key="artistGrid" style={styles.gridWrap}>
						{searchResults.slice(0, visibleCount).map((item, index) => (
							<TouchableOpacity key={`ag${index}`} style={styles.gridArtistCard} onPress={() => openArtist(item)} activeOpacity={0.7}>
								<FastImage
									source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
									fadeDuration={0}
							style={styles.gridArtistAvatar}
								/>
								<Text numberOfLines={1} style={[styles.gridArtistName, { color: colors.text }]}>
									{item.title}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				)}

				{/* 专辑/歌单：方形封面网格（kumone CoverCardBody） */}
				{showResult && searchType === 'album' && (
					<View key="albumGrid" style={styles.gridWrap}>
						{searchResults.slice(0, visibleCount).map((item, index) => (
							<TouchableOpacity key={`cg${index}`} style={styles.gridAlbumCard} onPress={() => openAlbum(item)} activeOpacity={0.7}>
								<FastImage
									source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
									fadeDuration={0}
							style={styles.gridAlbumCover}
								/>
								<Text numberOfLines={1} style={[styles.gridAlbumTitle, { color: colors.text }]}>
									{item.title}
								</Text>
								<Text numberOfLines={1} style={[styles.gridAlbumSub, { color: muted }]}>
									{item.artist || ''}
								</Text>
							</TouchableOpacity>
						))}
					</View>
				)}
			</ScrollView>
			{searchType !== 'all' && (
				<ScrollToTopFAB progress={searchFabProgress} shown={searchFabShown} onPress={searchScrollToTop} bottom={safeBottom + 128} />
			)}
		</View>
	)
}

function debounce<T extends (...args: any[]) => any>(func: T, wait: number): (...args: Parameters<T>) => void {
	let timeout: ReturnType<typeof setTimeout> | null = null
	return (...args: Parameters<T>) => {
		if (timeout) clearTimeout(timeout)
		timeout = setTimeout(() => func(...args), wait)
	}
}

const createStyles = (colors: ThemeColors, isDark: boolean, _topInset: number) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: colors.background,
		},
		scrollContent: {
			paddingHorizontal: 14,
			paddingTop: 0,
			paddingBottom: 200,
		},
		searchBox: {
			flexDirection: 'row',
			alignItems: 'center',
			paddingHorizontal: 12,
			height: 38,
			borderRadius: 12,
			backgroundColor: isDark ? 'rgba(118,118,128,0.12)' : 'rgba(118,118,128,0.12)',
			marginBottom: 16,
			gap: 6,
		},
		searchInput: {
			flex: 1,
			fontSize: 16,
			color: colors.text,
			padding: 0,
		},
		clearCircle: {
			width: 19,
			height: 19,
			borderRadius: 10,
			backgroundColor: isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.22)',
			alignItems: 'center',
			justifyContent: 'center',
			marginLeft: 2,
			marginRight: 8,
		},
		searchBtnText: {
			fontSize: 16,
			fontWeight: '500',
			paddingLeft: 2,
			color: colors.text,
		},
		sectionTitle: {
			fontSize: 19,
			fontWeight: '500',
		},
		historySection: {
			marginBottom: 18,
		},
		historyHeader: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'center',
			marginBottom: 12,
		},
		clearAllBtn: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 5,
		},
		clearAllText: {
			fontSize: 14,
			fontWeight: '500',
			color: '#8e8e93',
		},
		chipWrap: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: 9,
		},
		historyChip: {
			flexDirection: 'row',
			alignItems: 'center',
			paddingLeft: 12,
			paddingRight: 9,
			paddingVertical: 8,
			borderRadius: 18,
			backgroundColor: '#0000000D',
			gap: 7,
			maxWidth: 220,
		},
		historyChipMain: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 6,
			flexShrink: 1,
		},
		hotSection: {
			marginBottom: 16,
		},
		hotChip: {
			flexDirection: 'row',
			alignItems: 'center',
			paddingHorizontal: 14,
			paddingVertical: 8,
			borderRadius: 18,
			backgroundColor: '#0000000D',
			gap: 7,
		},
		hotIndex: {
			fontSize: 14,
			fontWeight: '500',
			color: '#8e8e93',
			minWidth: 14,
			textAlign: 'center',
		},
		chipText: {
			fontSize: 14.5,
			fontWeight: '500',
			flexShrink: 1,
		},
		gridWrap: {
			flexDirection: 'row',
			flexWrap: 'wrap',
			gap: 16,
			paddingHorizontal: 4,
			marginTop: 8,
		},
		gridArtistCard: {
			width: '47%',
			alignItems: 'center',
			gap: 8,
			marginBottom: 20,
		},
		gridArtistAvatar: {
			width: '100%',
			aspectRatio: 1,
			borderRadius: 999,
		},
		gridArtistName: {
			fontSize: 13,
			fontWeight: '500',
			textAlign: 'center',
		},
		gridAlbumCard: {
			width: '47%',
			gap: 6,
			marginBottom: 20,
		},
		gridAlbumCover: {
			width: '100%',
			aspectRatio: 1,
			borderRadius: 10,
		},
		gridAlbumTitle: {
			fontSize: 13,
			fontWeight: '500',
		},
		gridAlbumSub: {
			fontSize: 11,
		},
		emptyWrap: {
			alignItems: 'center',
			justifyContent: 'center',
			paddingTop: 80,
			gap: 14,
		},
		emptyTitle: {
			fontSize: 16,
			fontWeight: '500',
		},
		emptySub: {
			fontSize: 13,
			textAlign: 'center',
		},
		sectionHeader: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			marginTop: 16,
			marginBottom: 10,
		},
		sectionHeaderTitle: {
			fontSize: 18,
			fontWeight: '500',
		},
		moreBtn: {
			flexDirection: 'row',
			alignItems: 'center',
			gap: 2,
		},
		moreText: {
			fontSize: 14,
		},
		songRow: {
			flexDirection: 'row',
			alignItems: 'center',
			padding: 9,
			marginBottom: 4,
		},
		songCover: {
			width: 48,
			height: 48,
			borderRadius: 8,
			marginRight: 12,
		},
		songInfo: {
			flex: 1,
			justifyContent: 'center',
		},
		songTitle: {
			fontSize: 15,
			fontWeight: '500',
		},
		songArtist: {
			fontSize: 13,
			marginTop: 3,
		},
		songDuration: {
			fontSize: 13,
			fontVariant: ['tabular-nums'],
		},
		artistCard: {
			width: 110,
			alignItems: 'center',
			gap: 8,
		},
		artistAvatar: {
			width: 110,
			height: 110,
			borderRadius: 55,
		},
		artistName: {
			fontSize: 13,
			fontWeight: '500',
			textAlign: 'center',
		},
		albumCard: {
			width: 160,
			gap: 6,
		},
		albumCover: {
			width: 160,
			height: 160,
			borderRadius: 12,
		},
		albumTitle: {
			fontSize: 13,
			fontWeight: '500',
		},
		albumArtist: {
			fontSize: 12,
		},
	})

export default SearchlistsScreen
