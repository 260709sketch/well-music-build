import { unknownTrackImageUri, neteaseLogoUri } from '@/constants/images'
import SFSymbol from '@/components/SFSymbol'
import myTrackPlayer, { playListsStore } from '@/helpers/trackPlayerIndex'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useRouter } from 'expo-router'
import React, { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react'
import {
	ActionSheetIOS,
	ActivityIndicator,
	Alert,
	Animated,
	Easing,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import FastImage from 'react-native-fast-image'
import { useFavorites } from '@/store/library'
import { useSearchStore } from '@/store/searchStore'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { likeNeteaseSong } from '@/helpers/userApi/netease-music-api'
import { isInPlayList } from '@/store/playList'
import { LinearGradient } from 'expo-linear-gradient'
import { MenuView } from '@react-native-menu/menu'
import { showToast } from '@/utils/utils'
import { resolveTrackAlbum } from '@/helpers/userApi/resolveTrackAlbum'
import { extractSingerNames, navigateToSinger } from '@/helpers/userApi/singerUtils'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { ScrollToTopFAB, useScrollToTop } from '@/components/ScrollToTopFAB'
import { shouldCacheImage } from '@/store/cacheManagerStore'
import { SimilarSongsModal } from '@/components/SimilarSongsModal'
import { DownloadQualityModal } from '@/components/DownloadQualityModal'
import PersistStatus from '@/store/PersistStatus'

// ===== 主题红色强调色（对齐图谱：网易云/每日推荐红） =====
const ACCENT = '#EC4949'
const commentColor = (isDark: boolean) => (isDark ? '#98989f' : '#8e8e93')

// 播放中指示器（复刻 NowPlayingIndicator）
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

// 歌单页头部模块轻盈上浮（对齐发现页模块动画：18pt 上浮 + 淡入、300ms ease-out cubic，仅挂载时播放一次）
const HeaderEntrance: React.FC<{ enabled: boolean; children: React.ReactNode }> = ({ enabled, children }) => {
	const anim = React.useRef(new Animated.Value(0)).current
	React.useEffect(() => {
		if (!enabled) {
			anim.setValue(1)
			return
		}
		anim.setValue(0)
		const t = Animated.timing(anim, {
			toValue: 1,
			duration: 300,
			easing: Easing.out(Easing.cubic),
			useNativeDriver: true,
		})
		t.start()
		return () => t.stop()
	}, [anim, enabled])
	return (
		<Animated.View style={{ opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }] }}>
			{children}
		</Animated.View>
	)
}

// 歌单页同款歌曲行（完整长按菜单）
const SongItem = React.memo(({ item, index, isActive, isDark, colors, favorites, isSearching, animate = true, removeLabel = '移除歌曲', showPlatformLabel = false, onPress, onMenuAction }) => {
	// 歌曲行从下方轻盈上浮滑到原位（逐行 30ms 错落，对齐歌单页模块入场动画）
	const appearTy = React.useRef(new Animated.Value(animate ? 18 : 0)).current
	React.useEffect(() => {
		if (!animate || isSearching) { appearTy.setValue(0); return }
		Animated.timing(appearTy, { toValue: 0, duration: 320, delay: (index || 0) * 30, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start()
		return () => appearTy.stopAnimation()
	}, [appearTy, animate, isSearching])

	// 当前播放歌曲封面放大（弹簧）
	const coverScale = React.useRef(new Animated.Value(1)).current
	React.useEffect(() => {
		Animated.spring(coverScale, { toValue: isActive ? 1.05 : 1, friction: 6, tension: 120, useNativeDriver: true }).start()
	}, [isActive, coverScale])

	const comment = commentColor(isDark)
	const trackPlatform = item.platform || item.source || ''
	const platformLabel = trackPlatform === 'netease' || trackPlatform === 'wy'
		? '网易云'
		: trackPlatform === 'qq' || trackPlatform === 'tx'
			? 'QQ音乐'
			: trackPlatform === 'kugou' || trackPlatform === 'kg'
				? '酷狗'
				: trackPlatform === 'kuwo' || trackPlatform === 'kw'
					? '酷我'
					: ''
	const durationText = (d: number) => {
		const s = Math.max(0, Math.floor(d || 0))
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
	}
	const singerNames = extractSingerNames(item)
	return (
		<Animated.View style={{ transform: [{ translateY: appearTy }] }}>
			<MenuView
				shouldOpenOnLongPress
				onPressAction={({ nativeEvent: { event } }) => onMenuAction(event, item)}
				actions={[
					{ id: isInPlayList(item as any) ? 'remove-from-playlist' : 'add-to-playlist', title: isInPlayList(item as any) ? '从播放队列移除' : '添加到播放队列', image: isInPlayList(item as any) ? 'minus' : 'plus' },
					{ id: favorites.find((f) => f.id === item.id) ? 'remove-from-favorites' : 'add-to-favorites', title: favorites.find((f) => f.id === item.id) ? '取消收藏' : '收藏', image: favorites.find((f) => f.id === item.id) ? 'heart.fill' : 'heart' },
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
					{ id: 'remove-from-playlist-song', title: removeLabel, image: 'trash', attributes: { destructive: true } },
				]}
			>
				<TouchableOpacity
					style={styles.refRowInner}
					onPress={onPress}
					activeOpacity={0.7}
				>
					<Animated.View style={{ transform: [{ scale: coverScale }] }}>
						<FastImage
							source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
							style={styles.refRowCover}
						/>
					</Animated.View>
					<View style={styles.refRowInfo}>
						<Text style={[styles.refRowTitle, { color: isActive ? ACCENT : colors.text }, isActive && styles.refRowTitleActive]} numberOfLines={1}>
							{item.title || item.name || '未知歌曲'}
						</Text>
						<Text style={[styles.refRowArtist, { color: comment }]} numberOfLines={1}>
							{item.artist || '未知歌手'}
							{showPlatformLabel && platformLabel ? ` · ${platformLabel}` : ''}
						</Text>
					</View>
					<View style={{ flexDirection: 'row', alignItems: 'center' }}>
						{isActive ? (
							<View style={{ marginRight: 8 }}>
								<NowPlayingIndicator color={ACCENT} />
							</View>
						) : (
							<Text style={[styles.refRowDuration, { color: comment }]}>{durationText(item.duration)}</Text>
						)}
					</View>
				</TouchableOpacity>
			</MenuView>
		</Animated.View>
	)
}, (prev, next) => prev.isActive === next.isActive && prev.item?.id === next.item?.id && prev.colors === next.colors)

export interface ManageAction {
	id: string
	label: string
	icon: string
	onPress: () => void
	disabled?: boolean
	loading?: boolean
}

interface PlaylistTemplateProps {
	songs: any[]
	title: string
	trackCount?: number
	coverUri?: string
	creatorName?: string
	creatorAvatar?: string
	creatorPlatform?: 'netease'
	description?: string
	searchPlaceholder?: string
	showSearch?: boolean
	externalSearchQuery?: string
	hideCustomSearch?: boolean
	manageActions?: ManageAction[]
	showPlatformLabel?: boolean
	removeLabel?: string
	onRemoveSong?: (song: any) => void
	onPlayAll?: () => void
	onPlaySong?: (song: any) => void
	onEndReached?: () => void
	loadingMore?: boolean
	onFavoriteToggle?: (song: any, isFavorite: boolean) => void
	showSort?: boolean
	animateEntrance?: boolean
	topInset?: number
}

// 歌单页统一模板：搜索框 + 封面头部 + 播放全部 + 上浮动画歌曲行 + 完整长按菜单
export type PlaylistTemplateRef = {
	toggleSearch: () => void
}

const PlaylistTemplateScreen = forwardRef<PlaylistTemplateRef, PlaylistTemplateProps>((props, ref) => {
	const { isDark } = useAppTheme()
	const colors = useThemeColors()
	const router = useRouter()
	const currentMusic = myTrackPlayer.useCurrentMusic()
	const { favorites, toggleTrackFavorite } = useFavorites()
	const { isLoggedIn, cookie } = useDailyRecommendStore()
	const storedPlayLists = playListsStore.useValue()
	const { bottom: safeBottom } = useSafeAreaInsets()
	const scrollRef = useRef<any>(null)
	const { onScroll: onFabScroll, scrollToTop, progress: fabProgress, shown: fabShown } = useScrollToTop(scrollRef)

	const [searchQuery, setSearchQuery] = useState('')
	const [searchBarVisible, setSearchBarVisible] = useState(false)
	const searchVisibleRef = useRef(false)
	const searchBarAnim = useRef(new Animated.Value(0)).current
	const searchInputRef = useRef<TextInput>(null)
	const [sortMode, setSortMode] = useState<'default' | 'name' | 'artist' | 'reverse'>('default')
	const [showDownloadModal, setShowDownloadModal] = useState(false)
	const [downloadSong, setDownloadSong] = useState<any>(null)
	const [showSimilarSongs, setShowSimilarSongs] = useState(false)
	const [similarSong, setSimilarSong] = useState<any>(null)
	const scrollY = React.useRef(new Animated.Value(0)).current

	// 暴露给父组件：切换搜索框显示
	useImperativeHandle(ref, () => ({
		toggleSearch: () => {
			const next = !searchVisibleRef.current
			searchVisibleRef.current = next
			setSearchBarVisible(next)
			Animated.timing(searchBarAnim, {
				toValue: next ? 1 : 0,
				duration: 250,
				easing: Easing.out(Easing.ease),
				useNativeDriver: false,
			}).start()
			if (next) {
				setTimeout(() => searchInputRef.current?.focus(), 200)
			} else {
				searchInputRef.current?.blur()
				setSearchQuery('')
			}
		},
	}))

	// 歌曲行上浮入场动画开关（设置「外观 → 歌曲列表上浮动画」）
	const songFloatAnimation = (PersistStatus.useValue('music.songFloatAnimation' as any) as any) !== false
	// 页面入场上浮总开关 = 设置开关 && 本次启动会话内该歌单尚未播过（父页面 animateEntrance=false 时直接显示）
	const entranceEnabled = songFloatAnimation && props.animateEntrance !== false
	const comment = commentColor(isDark)
	const showSortBtn = props.showSort !== false

	const { songs, title, trackCount } = props
	// 总曲目数：歌单元数据里的总数（首屏只加载了部分歌曲，总数需单独记录），无则回退为已加载数量
	const totalCount = trackCount ?? songs.length

	const filteredSongs = useMemo(() => {
		const query = props.externalSearchQuery ?? searchQuery
		if (!query.trim()) return songs
		const q = query.toLowerCase().replace(/\s+/g, '')
		return songs.filter((s: any) =>
			(s.title || s.name || '').toLowerCase().replace(/\s+/g, '').includes(q) ||
			(s.artist || '').toLowerCase().replace(/\s+/g, '').includes(q)
		)
	}, [songs, searchQuery, props.externalSearchQuery])

	const sortedSongs = useMemo(() => {
		const list = [...filteredSongs]
		if (sortMode === 'name') {
			list.sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || '', 'zh-CN'))
		} else if (sortMode === 'artist') {
			list.sort((a, b) => (a.artist || '').localeCompare(b.artist || '', 'zh-CN'))
		} else if (sortMode === 'reverse') {
			list.reverse()
		}
		return list
	}, [filteredSongs, sortMode])

	const cover = props.coverUri || songs[0]?.artwork || unknownTrackImageUri

	const handleSort = useCallback(() => {
		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: ['取消', '默认顺序', '按歌名排序', '按歌手排序', '倒序'],
				cancelButtonIndex: 0,
			},
			(buttonIndex) => {
				if (buttonIndex === 1) setSortMode('default')
				else if (buttonIndex === 2) setSortMode('name')
				else if (buttonIndex === 3) setSortMode('artist')
				else if (buttonIndex === 4) setSortMode('reverse')
			},
		)
	}, [])

	const handleMenuAction = useCallback(async (actionId: string, song: any) => {
		const track = song as IMusic.IMusicItem
		if (actionId.startsWith('view-singer-')) {
			const idx = Number(actionId.replace('view-singer-', ''))
			const name = extractSingerNames(track)[idx]
			if (name) await navigateToSinger(router, track, name)
			return
		}
		switch (actionId) {
			case 'add-to-playlist':
				await myTrackPlayer.add(track)
				showToast('已添加到播放队列', '', 'success')
				break
			case 'remove-from-playlist':
				await myTrackPlayer.remove(track)
				showToast('已从播放队列移除', '', 'success')
				break
			case 'add-to-favorites':
				toggleTrackFavorite(track)
				props.onFavoriteToggle?.(track, true)
				showToast('已收藏', '', 'success')
				break
			case 'remove-from-favorites':
				toggleTrackFavorite(track)
				props.onFavoriteToggle?.(track, false)
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
			case 'add-to-custom-playlist': {
				const customPlaylists = (storedPlayLists ?? []).filter(
					(p: any) => p.platform === 'custom' || p.platform === 'local' || String(p.id || '').startsWith('custom_') || String(p.id || '').startsWith('local_'),
				)
				if (customPlaylists.length === 0) {
					Alert.alert('提示', '还没有自建歌单，请先创建一个')
					break
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
				break
			}
			case 'insert-next':
				myTrackPlayer.addAsNextTrack(track)
				break
			case 'download':
				setDownloadSong(track)
				setShowDownloadModal(true)
				break
			case 'similar':
				setSimilarSong(track)
				setShowSimilarSongs(true)
				break
			case 'search-same-name':
				useSearchStore.getState().setKeyword(track.title || track.name || '')
				router.navigate('/(tabs)/search')
				break
			case 'remove-from-playlist-song':
				if (props.onRemoveSong) props.onRemoveSong(song)
				break
		}
	}, [router, toggleTrackFavorite, props.onRemoveSong, props.onFavoriteToggle, storedPlayLists, isLoggedIn, cookie])

	const isSearching = searchQuery.trim().length > 0

	const renderSongItem = useCallback(({ item, index }: { item: any; index: number }) => {
		const isActive = currentMusic && (
			String(item.id || item.songmid || '') === String(currentMusic.id || '') ||
			String(item.songmid || '') === String(currentMusic.songmid || '')
		)
		return (
			<SongItem
				item={item}
				index={index}
				isActive={!!isActive}
				isDark={isDark}
				colors={colors}
				favorites={favorites}
				isSearching={isSearching}
				animate={entranceEnabled}
				removeLabel={props.removeLabel || '移除歌曲'}
				showPlatformLabel={props.showPlatformLabel}
				onPress={() => props.onPlaySong?.(item)}
				onMenuAction={handleMenuAction}
			/>
		)
	}, [currentMusic, isDark, colors, favorites, isSearching, entranceEnabled, props.removeLabel, props.showPlatformLabel, props.onPlaySong, handleMenuAction])

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<Animated.FlatList
				ref={scrollRef}
				data={sortedSongs}
				renderItem={renderSongItem}
				extraData={currentMusic?.id}
				keyExtractor={(item, index) => `${item.id || item.songmid || 'song'}_${index}`}
				initialNumToRender={8}
					maxToRenderPerBatch={10}
					windowSize={7}
					removeClippedSubviews={false}
					updateCellsBatchingPeriod={80}
					keyboardShouldPersistTaps="handled"
					keyboardDismissMode="interactive"
					onEndReached={props.onEndReached}
					onEndReachedThreshold={0.6}
					onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true, listener: (e) => { onFabScroll(e) } })}
					scrollEventThrottle={16}
				ListHeaderComponent={
					<HeaderEntrance enabled={entranceEnabled}>
					<View style={{ paddingTop: searchBarVisible ? 0 : (props.topInset ?? 0) }}>
							{/* 搜索框：默认隐藏，通过右上角菜单触发后从顶部下拉；hideCustomSearch 时完全不渲染 */}
							{!props.hideCustomSearch && (
								<Animated.View style={{
									height: searchBarAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 44] }),
									opacity: searchBarAnim,
									overflow: 'hidden',
									marginBottom: searchBarAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 12] }),
								}}>
									<View style={[styles.refSearchWrap, { backgroundColor: isDark ? 'rgba(120,120,128,0.18)' : '#F2F2F2' }]}>
										<SFSymbol systemName="magnifyingglass" size={17} color={comment} />
										<TextInput
											ref={searchInputRef}
											style={[styles.refSearchInput, { color: colors.text }]}
											placeholder={props.searchPlaceholder || '搜索歌曲'}
											placeholderTextColor={comment}
											value={searchQuery}
											onChangeText={setSearchQuery}
											returnKeyType="search"
											onSubmitEditing={() => searchInputRef.current?.blur()}
										/>
										{searchQuery.length > 0 && (
											<TouchableOpacity onPress={() => setSearchQuery('')}>
												<SFSymbol systemName="xmark.circle.fill" size={17} color={comment} />
											</TouchableOpacity>
										)}
										{showSortBtn && (
											<TouchableOpacity style={[styles.refSortBtn, { backgroundColor: isDark ? 'rgba(120,120,128,0.18)' : '#F2F2F2' }]} onPress={handleSort}>
												<SFSymbol systemName="arrow.up.arrow.down" size={16} color={comment} />
											</TouchableOpacity>
										)}
									</View>
								</Animated.View>
							)}

						{/* 头部：大封面 + 标题 + 创建者/歌曲数 */}
						<View style={styles.refHeader}>
							<FastImage
								source={{ uri: cover, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
								style={styles.refCover}
							/>
							<View style={styles.refHeaderInfo}>
								<Text style={[styles.refTitle, { color: colors.text }]} numberOfLines={2}>
									{title}
								</Text>
								{props.creatorName ? (
									<View style={styles.refCreatorRow}>
										{props.creatorPlatform === 'netease' ? (
											// 网易云品牌 logo（官方 app 图标位图，自带圆角红底）
											<FastImage
												source={{ uri: neteaseLogoUri, cache: FastImage.cacheControl.immutable }}
												style={[styles.refCreatorAvatar, { borderRadius: 0 }]}
											/>
										) : props.creatorAvatar ? (
									<FastImage
										source={{ uri: props.creatorAvatar, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
										style={styles.refCreatorAvatar}
									/>
								) : (
									<View style={[styles.refCreatorAvatar, { backgroundColor: isDark ? 'rgba(120,120,128,0.25)' : 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' }]}>
										<SFSymbol systemName="person.fill" size={10} color={comment} />
									</View>
								)}
										<Text style={[styles.refCreatorName, { color: comment }]} numberOfLines={1}>{props.creatorName}</Text>
									</View>
								) : null}
								<Text style={[styles.refCount, { color: comment }]}>
									{`${totalCount} 首`}
								</Text>
							</View>
						</View>

						{props.description ? (
							<Text style={[styles.refDesc, { color: colors.textMuted }]} numberOfLines={3}>
								{props.description}
							</Text>
						) : null}

						{/* 管理按钮（删除/刷新/清除等，低调质感胶囊） */}
						{props.manageActions && props.manageActions.length > 0 ? (
							<View style={styles.refManageRow}>
								{props.manageActions.map((act) => (
									<TouchableOpacity
										key={act.id}
										style={[
											styles.refManageBtn,
											{
												backgroundColor: isDark ? 'rgba(120,120,128,0.16)' : 'rgba(120,120,128,0.10)',
												borderWidth: StyleSheet.hairlineWidth,
												borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.06)',
											},
										]}
										onPress={act.onPress}
										disabled={act.disabled}
									>
										{act.loading ? (
											<ActivityIndicator size="small" color={comment} />
										) : (
											<SFSymbol systemName={act.icon} size={15} color={act.disabled ? colors.textMuted : comment} />
										)}
										<Text style={[styles.refManageText, { color: act.disabled ? colors.textMuted : comment }]}>{act.label}</Text>
									</TouchableOpacity>
								))}
							</View>
						) : null}

						{/* 播放全部按钮（参考图：水平红渐变胶囊 + 扁平 + 播放图标居中） */}
						<TouchableOpacity style={[styles.refPlayAll, songs.length === 0 && { opacity: 0.5 }]} onPress={props.onPlayAll} activeOpacity={0.85}>
							<LinearGradient
								colors={['#FF6B6B', '#D63031']}
								start={{ x: 0, y: 0 }}
								end={{ x: 1, y: 0 }}
								style={styles.refPlayAllGradient}
							>
								<SFSymbol systemName="play.fill" size={16} color="#ffffff" />
								<Text style={styles.refPlayAllText}>播放全部 ({totalCount})</Text>
							</LinearGradient>
						</TouchableOpacity>
					</View>
						</HeaderEntrance>
					}
					ListFooterComponent={
					props.loadingMore ? (
						<ActivityIndicator style={{ paddingVertical: 16 }} color={comment} />
					) : (
						<View style={{ height: 16 }} />
					)
				}
				contentContainerStyle={styles.listContent}
				showsVerticalScrollIndicator={false}
			/>
			<ScrollToTopFAB progress={fabProgress} shown={fabShown} onPress={scrollToTop} bottom={safeBottom + 128} />
			<DownloadQualityModal
				visible={showDownloadModal}
				onClose={() => setShowDownloadModal(false)}
				song={downloadSong}
			/>
			<SimilarSongsModal
				visible={showSimilarSongs}
				onClose={() => setShowSimilarSongs(false)}
				songId={similarSong?.id || ''}
				songTitle={similarSong?.title || ''}
				platform={similarSong?.platform || 'netease'}
			/>
		</View>
	)
})

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	listContent: {
		paddingBottom: 120,
	},
	refSearchWrap: {
		flexDirection: 'row',
		alignItems: 'center',
		marginHorizontal: 16,
		marginTop: 8,
		paddingLeft: 12,
		paddingRight: 8,
		height: 36,
		borderRadius: 10,
		gap: 8,
	},
	refSearchInput: {
		flex: 1,
		fontSize: 15,
		padding: 0,
	},
	refSortBtn: {
		width: 30,
		height: 30,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	refHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingTop: 16,
	},
	refCover: {
		width: 150,
		height: 150,
		borderRadius: 12,
		marginRight: 14,
	},
	refHeaderInfo: {
		flex: 1,
	},
	refTitle: {
		fontSize: 20,
		fontWeight: '700',
		letterSpacing: -0.3,
	},
	refCreatorRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: 8,
		gap: 6,
	},
	refCreatorAvatar: {
		width: 18,
		height: 18,
		borderRadius: 9,
	},
	refCreatorName: {
		flex: 1,
		fontSize: 13,
	},
	refCount: {
		fontSize: 13,
		marginTop: 8,
	},
	refDesc: {
		fontSize: 13,
		lineHeight: 18,
		paddingHorizontal: 16,
		marginTop: 10,
	},
	refManageRow: {
		flexDirection: 'row',
		justifyContent: 'flex-start',
		gap: 12,
		marginTop: 10,
		paddingHorizontal: 16,
	},
	refManageBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: 999,
		paddingHorizontal: 16,
		paddingVertical: 8,
		gap: 5,
	},
	refManageText: {
		fontSize: 14,
		fontWeight: '500',
	},
	refPlayAll: {
		marginHorizontal: 16,
		marginTop: 14,
		marginBottom: 14,
	},
	refPlayAllGradient: {
		height: 38,
		borderRadius: 19,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: 6,
	},
	refPlayAllText: {
		color: '#ffffff',
		fontSize: 15,
		fontWeight: '600',
	},
	refRowInner: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 7,
	},
	refRowCover: {
		width: 48,
		height: 48,
		borderRadius: 8,
		marginRight: 12,
	},
	refRowInfo: {
		flex: 1,
		marginRight: 8,
	},
	refRowTitle: {
		fontSize: 16,
		fontWeight: '500',
	},
	refRowTitleActive: {
		fontSize: 17,
		fontWeight: '600',
	},
	refRowArtist: {
		fontSize: 12,
		marginTop: 2,
	},
	refRowDuration: {
		fontSize: 13,
		minWidth: 36,
		textAlign: 'right',
	},
})


export default PlaylistTemplateScreen