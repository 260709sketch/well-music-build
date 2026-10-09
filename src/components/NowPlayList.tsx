import { unknownTrackImageUri } from '@/constants/images'
import SFSymbol from '@/components/SFSymbol'
import { ThemeColors } from '@/constants/tokens'
import myTrackPlayer, { MusicRepeatMode } from '@/helpers/trackPlayerIndex'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useUtilsStyles } from '@/styles'
import { isSameMediaItem } from '@/utils/mediaItem'
import { FlashList } from '@shopify/flash-list'
import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useMemo, useRef } from 'react'
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Track, useIsPlaying } from 'react-native-track-player'
import { setPlayList, getPlayList } from '@/store/playList'

export type TracksListProps = {
	id: string
	tracks: Track[]
	hideQueueControls?: boolean
}

const ITEM_HEIGHT = 68

const ItemDivider = React.memo(() => {
	const colors = useThemeColors()
	const utilsStyles = useUtilsStyles()
	const styles = useMemo(() => createStyles(colors, utilsStyles), [colors, utilsStyles])

	return <View style={styles.itemDivider} />
})

const EmptyListComponent = React.memo(() => {
	const utilsStyles = useUtilsStyles()

	return (
		<View>
			<Text style={utilsStyles.emptyContentText}>No songs</Text>
			<FastImage
				source={{ uri: unknownTrackImageUri, priority: FastImage.priority.normal }}
				style={utilsStyles.emptyContentImage}
			/>
		</View>
	)
})

export const NowPlayList = React.memo(({ tracks }: TracksListProps) => {
	const colors = useThemeColors()
	const utilsStyles = useUtilsStyles()
	const styles = useMemo(() => createStyles(colors, utilsStyles), [colors, utilsStyles])
	const listRef = useRef<FlashList<Track>>(null)
	const currentMusic = myTrackPlayer.useCurrentMusic()
	const { playing } = useIsPlaying()
	const { top } = useSafeAreaInsets()
	const repeatMode = myTrackPlayer.useRepeatMode()

	// 播放列表排序
	const handleReorderSong = useCallback((song: any, action: 'top' | 'up' | 'down' | 'bottom') => {
		const list = getPlayList()
		const index = list.findIndex((s: any) => s.id === song.id && s.platform === song.platform)
		if (index === -1) return
		const newList = [...list]
		const [item] = newList.splice(index, 1)
		switch (action) {
			case 'top': newList.unshift(item); break
			case 'up': index > 0 ? newList.splice(index - 1, 0, item) : newList.unshift(item); break
			case 'down': index < newList.length ? newList.splice(index + 1, 0, item) : newList.push(item); break
			case 'bottom': newList.push(item); break
		}
		setPlayList(newList)
	}, [])

	const handleLongPressReorder = useCallback((song: any) => {
		Alert.alert('调整播放顺序', '', [
			{ text: '置顶', onPress: () => handleReorderSong(song, 'top') },
			{ text: '上移', onPress: () => handleReorderSong(song, 'up') },
			{ text: '下移', onPress: () => handleReorderSong(song, 'down') },
			{ text: '置底', onPress: () => handleReorderSong(song, 'bottom') },
			{ text: '取消', style: 'cancel' },
		])
	}, [handleReorderSong])



	const initialIndex = useMemo(
		() =>
			currentMusic
				? tracks.findIndex((track) =>
						isSameMediaItem(
							track as IMusic.IMusicItem,
							currentMusic as IMusic.IMusicItem | null | undefined,
						),
					)
				: -1,
		[currentMusic, tracks],
	)

	const handleTrackSelect = useCallback(async (selectedTrack: Track) => {
		await myTrackPlayer.play(selectedTrack as IMusic.IMusicItem)
	}, [])

	const renderItem = useCallback(
		({ item: track }: { item: Track }) => {
			const isActiveTrack = isSameMediaItem(
				track as IMusic.IMusicItem,
				currentMusic as IMusic.IMusicItem | null | undefined,
			)
			const song = track as any
			return (
				<TouchableOpacity
					activeOpacity={0.82}
					style={[styles.queueItem, isActiveTrack && styles.queueItemActive]}
					onPress={() => myTrackPlayer.play(song, true)}
				>
					<FastImage
						source={{ uri: song.artwork ?? unknownTrackImageUri, cache: 'immutable' }}
						style={styles.queueItemArtwork}
						resizeMode="cover"
					/>
					<View style={styles.queueItemInfo}>
						<Text style={[styles.queueItemTitle, isActiveTrack && styles.queueItemTitleActive]} numberOfLines={1}>
							{song.title}
						</Text>
						<Text style={styles.queueItemArtist} numberOfLines={1}>
							{song.artist}{song.platform ? ` · ${song.platform}` : ''}
						</Text>
					</View>
					{isActiveTrack && (
						<SFSymbol systemName="speaker.wave.3" size={19} color="rgba(255,255,255,0.8)" />
					)}
					<TouchableOpacity
						onPress={(event) => { event.stopPropagation(); myTrackPlayer.remove(song) }}
						style={styles.queueTrailingButton}
					>
						<SFSymbol systemName="trash" size={25} color="rgba(255,255,255,0.68)" />
					</TouchableOpacity>
					<TouchableOpacity
						onPress={(event) => event.stopPropagation()}
						onLongPress={(event) => { event.stopPropagation(); handleLongPressReorder(song) }}
						style={styles.queueTrailingButton}
					>
						<SFSymbol systemName="line.3.horizontal" size={24} color="rgba(255,255,255,0.68)" />
					</TouchableOpacity>
				</TouchableOpacity>
			)
		},
		[handleLongPressReorder, currentMusic],
	)

	const keyExtractor = useCallback((item: Track) => item.id, [])

	useEffect(() => {
		if (initialIndex >= 0) {
			const scrollToCurrent = (attempt: number) => {
				const list = listRef.current
				if (!list) return
				// 直接计算offset：目标item中心 - 视口中心
				const offset = Math.max(0, initialIndex * ITEM_HEIGHT - 200 + ITEM_HEIGHT / 2)
				list.scrollToOffset({ offset, animated: false })
			}
			setTimeout(() => scrollToCurrent(0), 150)
			setTimeout(() => scrollToCurrent(1), 400)
		}
	}, [initialIndex])

	const DismissPlayerSymbol = useMemo(
		() => (
			<View style={[styles.dismissPlayerSymbol, { top: top - 38 }]}>
				<View style={styles.dismissPlayerBar} />
				<View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
					<Text style={styles.header}>播放队列 · {tracks.length}</Text>
					<TouchableOpacity
						onPress={() => {
							Alert.alert(
								'清空播放列表',
								'确定要清空当前播放列表吗？当前播放的歌曲会保留。',
								[
									{ text: '取消', style: 'cancel' },
									{ text: '清空', style: 'destructive', onPress: () => myTrackPlayer.clearToBePlayed() },
								],
							)
						}}
					>
						<SFSymbol systemName="trash" size={24} color="#8e8e93" />
					</TouchableOpacity>
				</View>
				{/* 播放模式切换 */}
				<View style={styles.queueModeSegment}>
					<TouchableOpacity
						style={[styles.queueModeItem, repeatMode === MusicRepeatMode.QUEUE && styles.queueModeItemActive]}
						onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.QUEUE)}
					>
						<SFSymbol systemName="repeat" size={19} color={repeatMode === MusicRepeatMode.QUEUE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
						<Text style={styles.queueModeText}>顺序</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SHUFFLE && styles.queueModeItemActive]}
						onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SHUFFLE)}
					>
						<SFSymbol systemName="shuffle" size={20} color={repeatMode === MusicRepeatMode.SHUFFLE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
						<Text style={styles.queueModeText}>随机</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SINGLE && styles.queueModeItemActive]}
						onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SINGLE)}
					>
						<SFSymbol systemName="repeat.1" size={19} color={repeatMode === MusicRepeatMode.SINGLE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
						<Text style={styles.queueModeText}>单曲</Text>
					</TouchableOpacity>
				</View>
			</View>
		),
		[top, repeatMode],
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
		<View style={styles.container}>
			{DismissPlayerSymbol}
			<FlashList
				data={tracks}
				extraData={listExtraData}
				contentContainerStyle={styles.contentContainer}
				ref={listRef}
				ListEmptyComponent={EmptyListComponent}
				renderItem={renderItem}
				keyExtractor={keyExtractor}
				estimatedItemSize={ITEM_HEIGHT}
				getItemLayout={(_data, index) => ({
					length: ITEM_HEIGHT,
					offset: ITEM_HEIGHT * index,
					index,
				})}
				onScrollToIndexFailed={(info) => {
					const offset = info.index * ITEM_HEIGHT
					listRef.current?.scrollToOffset({ offset, animated: false })
				}}
			/>
		</View>
	)
})

const createStyles = (colors: ThemeColors, utilsStyles: ReturnType<typeof useUtilsStyles>) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: '#1c1c1e',
		},
		contentContainer: {
			paddingTop: 140,
			paddingHorizontal: 20,
			paddingBottom: 210,
			gap: 10,
		},
		itemDivider: {
			...utilsStyles.itemSeparator,
			marginVertical: 9,
			marginLeft: 60,
		},
		dismissPlayerSymbol: {
			position: 'absolute',
			left: 0,
			right: 0,
			zIndex: 1000,
			paddingTop: 10,
			paddingHorizontal: 20,
			paddingBottom: 16,
			backgroundColor: '#1c1c1e',
		},
		dismissPlayerBar: {
			width: 50,
			height: 4,
			borderRadius: 2,
			backgroundColor: colors.text,
			opacity: 0.3,
			alignSelf: 'center',
			marginBottom: 10,
		},
		header: {
			fontSize: 22,
			fontWeight: '500',
			paddingBottom: 6,
			paddingLeft: 0,
			color: '#ffffff',
			letterSpacing: -0.25,
		},
		queueModeSegment: {
			flexDirection: 'row',
			height: 44,
			borderRadius: 22,
			overflow: 'hidden',
			borderWidth: 1,
			borderColor: 'rgba(255,255,255,0.12)',
			backgroundColor: 'rgba(255,255,255,0.055)',
			marginBottom: 16,
		},
		queueModeItem: {
			flex: 1,
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'center',
			gap: 9,
			borderRightWidth: 1,
			borderRightColor: 'rgba(255,255,255,0.10)',
		},
		queueModeItemActive: {
			backgroundColor: 'rgba(255,255,255,0.13)',
		},
		queueModeText: {
			fontSize: 16,
			fontWeight: '500',
			color: 'rgba(255,255,255,0.78)',
		},
		queueItem: {
			flexDirection: 'row',
			alignItems: 'center',
			backgroundColor: 'rgba(255,255,255,0.08)',
			borderRadius: 14,
			paddingHorizontal: 4,
			paddingVertical: 10,
			gap: 10,
		},
		queueItemActive: {
			backgroundColor: 'rgba(255,255,255,0.14)',
		},
		queueItemArtwork: {
			width: 48,
			height: 48,
			borderRadius: 10,
		},
		queueItemInfo: {
			flex: 1,
			flexShrink: 3,
			alignItems: 'flex-start',
		},
		queueItemTitle: {
			fontSize: 16,
			fontWeight: '500',
			color: 'rgba(255,255,255,0.9)',
			marginBottom: 3,
		},
		queueItemTitleActive: {
			color: '#ffffff',
		},
		queueItemArtist: {
			fontSize: 14,
			fontWeight: '500',
			color: 'rgba(255,255,255,0.6)',
		},
		queueTrailingButton: {
			width: 30,
			height: 48,
			alignItems: 'center',
			justifyContent: 'center',
		},
	})
