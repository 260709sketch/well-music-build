import { unknownTrackImageUri } from '@/constants/images'
import SFSymbol from '@/components/SFSymbol'
import { ThemeColors } from '@/constants/tokens'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import { useDefaultStyles } from '@/styles'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'
import { FlashList } from '@shopify/flash-list'
import { router } from 'expo-router'
import React, { memo, useCallback, useMemo } from 'react'
import { ActivityIndicator, Keyboard, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import { shouldCacheImage } from '@/store/cacheManagerStore'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Track, useIsPlaying } from 'react-native-track-player'
import { Ionicons } from '@expo/vector-icons'
import { isSameMediaItem } from '@/utils/mediaItem'
import { SearchType } from '@/helpers/searchAll'

export type SearchListProps = {
	id: string
	tracks: Track[]
	hideQueueControls?: boolean
	// 翻页加载更多中（仅控制列表底部菊花）
	isLoading: boolean
	// 首页搜索中（控制空态文案不提前闪现）
	initialLoading?: boolean
	searchType?: SearchType
	platformName?: string
}

const formatDuration = (duration?: number) => {
	if (!duration || duration <= 0) return ''
	const total = Math.floor(duration)
	const m = Math.floor(total / 60)
	const s = total % 60
	return `${m}:${String(s).padStart(2, '0')}`
}

const EmptyComponent = memo(({ typeWord, platformName }: { typeWord: string; platformName: string }) => {
	const { isDark } = useAppTheme()
	const muted = isDark ? '#6c6c70' : '#9a9aa0'
	return (
		<View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 90, gap: 16 }}>
			<SFSymbol systemName="music.note" size={46} color={muted} />
			<Text style={{ color: muted, fontSize: 15, fontWeight: '500' }}>
				{platformName}未找到相关{typeWord}
			</Text>
		</View>
	)
})

const FooterComponent = memo(({ isLoading }: { isLoading: boolean }) => {
	if (isLoading) {
		return (
			<View style={{ paddingVertical: 20 }}>
				<ActivityIndicator size="small" />
			</View>
		)
	}
	return null
})

const createStyles = (colors: ThemeColors, isDark: boolean) =>
	StyleSheet.create({
		card: {
			flexDirection: 'row',
			alignItems: 'center',
			padding: 9,
			marginBottom: 8,
			borderRadius: 14,
			backgroundColor: isDark ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,0,0.032)',
		},
		squareArtwork: {
			width: 52,
			height: 52,
			borderRadius: 10,
			marginRight: 12,
		},
		roundAvatar: {
			width: 52,
			height: 52,
			borderRadius: 26,
			marginRight: 12,
		},
		resultInfo: {
			flex: 1,
			justifyContent: 'center',
			paddingRight: 8,
		},
		resultTitle: {
			fontSize: 17,
			fontWeight: '500',
		},
		resultSub: {
			fontSize: 14,
			color: colors.textMuted,
			marginTop: 3,
		},
		trailing: {
			paddingLeft: 4,
			paddingRight: 4,
		},
		durationText: {
			fontSize: 14,
			color: colors.textMuted,
			fontVariant: ['tabular-nums'],
		},
	})

export const SearchList: React.FC<SearchListProps> = ({
	tracks,
	isLoading,
	initialLoading = false,
	searchType = 'songs',
	platformName = '',
}) => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const defaultStyles = useDefaultStyles()
	const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark])
	const currentMusic = myTrackPlayer.useCurrentMusic()
	const { playing } = useIsPlaying()

	const typeWord = searchType === 'songs' ? '歌曲' : searchType === 'artists' ? '歌手' : '专辑'

	const handleTrackSelect = useCallback(async (selectedTrack: Track) => {
		Keyboard.dismiss()
		if ((selectedTrack as any).isAlbum) {
			const albumMid = (selectedTrack as any).albumMid || selectedTrack.id
			if (albumMid) {
				router.navigate({ pathname: '/(modals)/[name]', params: { name: albumMid, album: '1' } })
			}
			return
		}
		if (selectedTrack.isArtist) {
			const singerName = selectedTrack.title || selectedTrack.artist
			const singerPlatform = (selectedTrack as any).platform || (selectedTrack as any).source || 'netease'
			const trackSingerMid = (selectedTrack as any).singerMid
			if (singerName && !singerName.includes('未知')) {
				if (trackSingerMid) {
					router.navigate({ pathname: '/(modals)/[name]', params: { name: trackSingerMid, singerName: singerName } })
				} else {
					getSingerMidBySingerName(singerName, singerPlatform).then((singerMid) => {
						if (singerMid) {
							router.navigate({ pathname: '/(modals)/[name]', params: { name: singerMid, singerName: singerName } })
						}
					})
				}
			}
			return
		}
		// 歌曲：把当前搜索结果整组入队并从所点歌曲开始播放（与歌单/每日推荐一致），
		// 这样上一首/下一首可用，退出再进队列也会完整保留，而不是只剩一首
		if (searchType === 'songs' && Array.isArray(tracks) && tracks.length > 0) {
			await myTrackPlayer.playWithReplacePlayList(selectedTrack as IMusic.IMusicItem, tracks as IMusic.IMusicItem[])
		} else {
			await myTrackPlayer.play(selectedTrack as IMusic.IMusicItem)
		}
	}, [tracks, searchType])

	const chevronColor = '#C6C6C6'

	const renderItem = useCallback(
		({ item: track }: { item: Track }) => {
			if ((track as any).isAlbum) {
				return (
					<TouchableOpacity style={styles.card} onPress={() => handleTrackSelect(track)} activeOpacity={0.7}>
						<FastImage
							source={{ uri: track.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
							style={styles.squareArtwork}
						/>
						<View style={styles.resultInfo}>
							<Text numberOfLines={1} style={[styles.resultTitle, { color: colors.text }]}>{track.title}</Text>
							<Text numberOfLines={1} style={styles.resultSub}>{track.artist || '未知歌手'}</Text>
						</View>
						<View style={styles.trailing}>
							<SFSymbol systemName="chevron.right" size={19} color={chevronColor} />
						</View>
					</TouchableOpacity>
				)
			}
			if (track.isArtist) {
				return (
					<TouchableOpacity style={styles.card} onPress={() => handleTrackSelect(track)} activeOpacity={0.7}>
						<FastImage
							source={{ uri: track.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
							style={styles.roundAvatar}
						/>
						<View style={styles.resultInfo}>
							<Text numberOfLines={1} style={[styles.resultTitle, { color: colors.text }]}>{track.title}</Text>
							<Text numberOfLines={1} style={styles.resultSub}>查看歌手主页</Text>
						</View>
						<View style={styles.trailing}>
							<SFSymbol systemName="chevron.right" size={19} color={chevronColor} />
						</View>
					</TouchableOpacity>
				)
			}
			const isActiveTrack = isSameMediaItem(
				track as IMusic.IMusicItem,
				currentMusic as IMusic.IMusicItem | null | undefined,
			)
			return (
				<TouchableOpacity
					style={styles.card}
					onPress={() => handleTrackSelect(track)}
					activeOpacity={0.7}
				>
					<FastImage
						source={{ uri: track.artwork || unknownTrackImageUri, cache: shouldCacheImage() ? FastImage.cacheControl.immutable : FastImage.cacheControl.noCache }}
						style={styles.squareArtwork}
					/>
					<View style={styles.resultInfo}>
						<Text
							numberOfLines={1}
							style={[styles.resultTitle, { color: isActiveTrack ? colors.primary : colors.text }]}
						>
							{track.title}
						</Text>
						<Text numberOfLines={1} style={styles.resultSub}>
							{track.artist || '未知歌手'}
						</Text>
					</View>
					<View style={styles.trailing}>
						<Text style={styles.durationText}>{formatDuration(track.duration)}</Text>
					</View>
				</TouchableOpacity>
			)
		},
		[handleTrackSelect, currentMusic, colors, isDark, styles, chevronColor],
	)

	const keyExtractor = useCallback((item: Track, index: number) => `${item.id}-${index}`, [])

	const insets = useSafeAreaInsets()

	const footerComponent = useMemo(
		() => <FooterComponent isLoading={isLoading} />,
		[isLoading],
	)
	const emptyComponent = useMemo(
		() => (!isLoading && !initialLoading ? <EmptyComponent typeWord={typeWord} platformName={platformName} /> : null),
		[isLoading, initialLoading, typeWord, platformName],
	)
	const listExtraData = useMemo(
		() => ({
			currentTrackId: currentMusic?.id ?? null,
			currentTrackPlatform: currentMusic?.platform ?? null,
			playing,
		}),
		[currentMusic?.id, currentMusic?.platform, playing],
	)

	return (
		<View style={[defaultStyles.container, { backgroundColor: 'transparent', minHeight: 300 }]}>
			<FlashList
				data={tracks}
				extraData={listExtraData}
				contentContainerStyle={{
					paddingTop: 4,
					paddingBottom: 128 + insets.bottom,
					paddingHorizontal: 0,
				}}
				ListEmptyComponent={emptyComponent}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				ListFooterComponent={footerComponent}
				estimatedItemSize={80}
				initialNumToRender={8}
				maxToRenderPerBatch={5}
				windowSize={5}
				scrollEnabled={false}
				keyboardDismissMode="on-drag"
				keyboardShouldPersistTaps="handled"
			/>
		</View>
	)
}

export default memo(SearchList)
