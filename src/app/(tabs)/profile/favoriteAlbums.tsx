// 我的收藏（参考 Beans 我的收藏页）：大标题 + 专辑/歌手切换胶囊 + 双列网格
// 专辑卡片 = 正方形封面 + 粗体专辑名(最多2行) + 灰色歌手名；歌手卡片 = 头像 + 歌手名
import SFSymbol from '@/components/SFSymbol'
import { unknownTrackImageUri } from '@/constants/images'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSolidNavBar, getNavBarOptions } from '@/hooks/useSolidNavBar'
import { getNeteaseAlbumSublist, getNeteaseArtistSublist } from '@/helpers/userApi/netease-music-api'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { shouldCacheImage } from '@/store/cacheManagerStore'
import * as Haptics from 'expo-haptics'
import { useFocusEffect, useNavigation, useRouter } from 'expo-router'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

type Album = {
	id: string
	albumId: string
	name: string
	artist: string
	artwork: string
	songCount: number
}

type Artist = {
	id: string
	artistId: string
	name: string
	alias: string
	artwork: string
}

const FavoriteAlbumsScreen = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const navigation = useNavigation()
	const router = useRouter()
	const { isLoggedIn, cookie } = useDailyRecommendStore()
	const insets = useSafeAreaInsets()
	const tab = 'albums' as const
	const [albums, setAlbums] = useState<Album[]>([])
	const [artists, setArtists] = useState<Artist[]>([])
	const [loading, setLoading] = useState(false)
	const isMountedRef = useRef(true)

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

	const load = useCallback(
		async (target: 'albums' | 'artists') => {
			if (!isLoggedIn || !cookie) {
				setAlbums([])
				setArtists([])
				setLoading(false)
				return
			}
			setLoading(true)
			if (target === 'albums') {
				setAlbums(await getNeteaseAlbumSublist(cookie, 0, 60))
			} else {
				setArtists(await getNeteaseArtistSublist(cookie, 0, 60))
			}
			setLoading(false)
		},
		[isLoggedIn, cookie],
	)

	useEffect(() => {
		isMountedRef.current = true
		return () => { isMountedRef.current = false }
	}, [])

	useFocusEffect(
		useCallback(() => {
			load(tab)
		}, [load, tab]),
	)

	const openAlbum = (album: Album) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
		router.push(`/(modals)/${album.id}?album=1` as any)
	}

	const openArtist = (artist: Artist) => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
		router.push(`/(modals)/${encodeURIComponent(artist.name)}?platform=netease` as any)
	}

	const renderAlbum = useCallback(
		({ item }: { item: Album }) => (
			<TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openAlbum(item)}>
				<FastImage
					source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.cacheOnly }}
					style={[styles.cover, { backgroundColor: isDark ? '#2c2c2e' : '#e9e9ec' }]}
				/>
				<Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
					{item.name}
				</Text>
				<Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
					{item.artist}
				</Text>
			</TouchableOpacity>
		),
		[isDark, colors],
	)

	const renderArtist = useCallback(
		({ item }: { item: Artist }) => (
			<TouchableOpacity style={styles.card} activeOpacity={0.85} onPress={() => openArtist(item)}>
				<FastImage
					source={{ uri: item.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.cacheOnly }}
					style={[styles.cover, { backgroundColor: isDark ? '#2c2c2e' : '#e9e9ec' }]}
				/>
				<Text style={[styles.cardTitle, { color: colors.text }]} numberOfLines={2}>
					{item.name}
				</Text>
				{item.alias ? (
					<Text style={[styles.cardSub, { color: colors.textMuted }]} numberOfLines={1}>
						{item.alias}
					</Text>
				) : null}
			</TouchableOpacity>
		),
		[isDark, colors],
	)

	const data = tab === 'albums' ? albums : artists
	const isEmpty = data.length === 0 && !loading

	return (
		<View style={[styles.container, { backgroundColor: colors.background, paddingTop: solidNavBarEnabled ? 0 : insets.top + 44 + 4 }]}>
			{/* 大标题 */}
		<Text style={[styles.pageTitle, { color: colors.text }]}>收藏专辑</Text>

		{!isLoggedIn ? (
				<View style={styles.centerBox}>
					<SFSymbol systemName="square.stack" size={40} color={colors.textMuted} />
					<Text style={[styles.emptyText, { color: colors.textMuted }]}>登录网易云后查看我的收藏</Text>
				</View>
			) : loading && data.length === 0 ? (
				<View style={styles.centerBox}>
					<ActivityIndicator color={colors.text} />
				</View>
			) : isEmpty ? (
				<View style={styles.centerBox}>
					<SFSymbol systemName="square.stack" size={40} color={colors.textMuted} />
					<Text style={[styles.emptyText, { color: colors.textMuted }]}>还没有收藏{tab === 'albums' ? '专辑' : '歌手'}</Text>
				</View>
			) : (
				<FlatList
					key={tab}
					data={data}
					keyExtractor={(item) => item.id}
					renderItem={tab === 'albums' ? renderAlbum : renderArtist}
					numColumns={2}
					columnWrapperStyle={styles.column}
					contentContainerStyle={styles.listContent}
					showsVerticalScrollIndicator={false}
				/>
			)}
		</View>
	)
}

const styles = StyleSheet.create({
	container: { flex: 1 },
	pageTitle: { fontSize: 28, fontWeight: '700', marginTop: 8, marginBottom: 16, paddingHorizontal: 16 },
	centerBox: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
	emptyText: { fontSize: 14 },
	listContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 40 },
	column: { gap: 16 },
	card: { flex: 1, marginBottom: 24 },
	cover: { width: '100%', aspectRatio: 1, borderRadius: 10, marginBottom: 8 },
	cardTitle: { fontSize: 16, fontWeight: '550', lineHeight: 21 },
	cardSub: { fontSize: 13, marginTop: 2, opacity: 0.75 },
})

export default FavoriteAlbumsScreen
