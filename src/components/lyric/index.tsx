import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native'
import MaskedView from '@react-native-masked-view/masked-view'
import { LinearGradient } from 'expo-linear-gradient'

import { ThemeColors } from '@/constants/tokens'
import LyricManager, { useWordLyric, usePosition } from '@/helpers/lyricManager'
import { matchWordsForLine } from '@/helpers/userApi/wordLyric'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useThemeColors } from '@/hooks/useAppTheme'
import useDelayFalsy from '@/hooks/useDelayFalsy'
import PersistStatus from '@/store/PersistStatus'
import delay from '@/utils/delay'
import { musicIsPaused } from '@/utils/trackUtils'
import { FlatList } from 'react-native-gesture-handler'
import rpx from '../../utils/rpx'
import LyricItemComponent from './lyricItem'

const AUTO_SCROLL_THROTTLE_MS = 80
const AUTO_SCROLL_MIN_INDEX_DELTA = 1

interface IItemHeights {
	blankHeight?: number
	[k: number]: number
}

interface IProps {
	onTurnPageClick?: () => void
}

const fontSizeMap = {
	0: rpx(24),
	1: rpx(30),
	2: rpx(36),
	3: rpx(42),
} as Record<number, number>

export default function Lyric(_props: IProps) {
	void _props
	const colors = useThemeColors()
	const styles = useMemo(() => createStyles(colors), [colors])
	const [loading] = useState(false)
	const { meta, lyrics } = LyricManager.useLyricState()
	const currentLrcItem = LyricManager.useCurrentLyric()
	const wordLyric = useWordLyric()
	const position = usePosition()
	const fontSizeKey = PersistStatus.useValue('lyric.detailFontSize', 1)
	const fontSizeStyle = useMemo(
		() => ({
			fontSize: fontSizeMap[fontSizeKey!],
		}),
		[fontSizeKey],
	)

	const [draggingIndex, setDraggingIndex] = useDelayFalsy<number | undefined>(undefined, 2000)
	const musicState = myTrackPlayer.useMusicState()

	const listRef = useRef<FlatList<ILyric.IParsedLrcItem> | null>(null)
	const dragShownRef = useRef(false)
	const itemHeightsRef = useRef<IItemHeights>({})
	const lastAutoScrollAtRef = useRef(0)
	const lastAutoScrollIndexRef = useRef(-1)
	const userDraggingRef = useRef(false)

	const blankComponent = useMemo(() => {
		return (
			<View
				style={styles.empty}
				onLayout={(evt) => {
					itemHeightsRef.current.blankHeight = evt.nativeEvent.layout.height
				}}
			/>
		)
	}, [])

	const handleLyricItemLayout = useCallback((index: number, height: number) => {
		itemHeightsRef.current[index] = height
	}, [])

	const clampLyricIndex = useCallback((index: number, listLength: number) => {
		if (listLength <= 0) {
			return 0
		}
		return Math.min(Math.max(index, 0), listLength - 1)
	}, [])

	const scrollToLyricIndex = useCallback(
		(index: number, listLength: number, force = false) => {
			if (!listRef.current || listLength <= 0) {
				return
			}
			if (userDraggingRef.current && !force) {
				return
			}

			const targetIndex = clampLyricIndex(index, listLength)
			const now = Date.now()
			const indexDelta = Math.abs(targetIndex - lastAutoScrollIndexRef.current)
			const shouldSkip =
				!force &&
				now - lastAutoScrollAtRef.current < AUTO_SCROLL_THROTTLE_MS &&
				indexDelta < AUTO_SCROLL_MIN_INDEX_DELTA

			if (shouldSkip) {
				return
			}

			try {
				listRef.current.scrollToIndex({
					index: targetIndex,
					viewPosition: 0.5,
					viewOffset: 0,
					animated: true,
				})
				lastAutoScrollAtRef.current = now
				lastAutoScrollIndexRef.current = targetIndex
			} catch (error) {
				console.warn('[歌词] 自动跟随失败:', error)
			}
		},
		[clampLyricIndex],
	)

	const scrollToCurrentLrcItem = useCallback(() => {
		const lyricState = LyricManager.getLyricState()
		const lyricItems = lyricState.lyrics
		if (lyricItems.length === 0) {
			return
		}
		const currentLrcItem = LyricManager.getCurrentLyric()
		const targetIndex = currentLrcItem?.index === -1 || !currentLrcItem ? 0 : currentLrcItem.index ?? 0
		scrollToLyricIndex(targetIndex, lyricItems.length, true)
	}, [scrollToLyricIndex])

	useEffect(() => {
		if (
			lyrics.length === 0 ||
			draggingIndex !== undefined ||
			(draggingIndex === undefined && musicIsPaused(musicState)) ||
			lyrics[lyrics.length - 1].time < 1
		) {
			return
		}
		const targetIndex = currentLrcItem?.index === -1 || !currentLrcItem ? 0 : currentLrcItem.index ?? 0
		scrollToLyricIndex(targetIndex, lyrics.length)
	}, [currentLrcItem?.index, lyrics.length, draggingIndex, musicState, scrollToLyricIndex])

	useEffect(() => {
		scrollToCurrentLrcItem()
	}, [scrollToCurrentLrcItem])

	const onScrollBeginDrag = useCallback(() => {
		userDraggingRef.current = true
		dragShownRef.current = true
	}, [])

	const onScrollEndDrag = useCallback(() => {
		dragShownRef.current = false
	}, [])

	const onMomentumScrollEnd = useCallback(() => {
		userDraggingRef.current = false
		if (draggingIndex !== undefined) {
			setDraggingIndex(undefined)
		}
		requestAnimationFrame(() => {
			scrollToCurrentLrcItem()
		})
	}, [draggingIndex, setDraggingIndex, scrollToCurrentLrcItem])

	const onScroll = useCallback((e: any) => {
		if (dragShownRef.current) {
			const offset = e.nativeEvent.contentOffset.y + e.nativeEvent.layoutMeasurement.height / 2

			const itemHeights = itemHeightsRef.current
			let height = itemHeights.blankHeight!
			if (offset <= height) {
				setDraggingIndex(0)
				return
			}
			for (let i = 0; i < lyrics.length; ++i) {
				height += itemHeights[i] ?? 0
				if (height > offset) {
					setDraggingIndex(i)
					return
				}
			}
		}
	}, [lyrics.length, setDraggingIndex])

	const handleLyricItemPress = useCallback(
		async (index: number) => {
			try {
				if (index >= 0 && index < lyrics.length && lyrics[index]) {
					const lyricTime = lyrics[index].time
					if (lyricTime === undefined || isNaN(lyricTime)) {
						console.warn('歌词时间无效:', lyricTime)
						return
					}
					const offset = +(meta?.offset ?? 0) || 0
					const time = lyricTime + offset
					if (time !== undefined && !isNaN(time) && time >= 0) {
						await myTrackPlayer.seekTo(time)
						await myTrackPlayer.play()
					}
				}
			} catch (error) {
				console.error('点击歌词跳转失败:', error)
			}
		},
		[lyrics, meta?.offset],
	)

	const listHeader = useMemo(() => (
		<>
			{blankComponent}
			<View style={styles.lyricMeta}></View>
		</>
	), [blankComponent])

	const renderLyricItem = useCallback(({ item, index }: { item: ILyric.IParsedLrcItem; index: number }) => {
		const isHighlight = currentLrcItem?.index === index
		let words: any[] | undefined
		if (isHighlight && wordLyric.length > 0) {
			const nextTime = index + 1 < lyrics.length ? lyrics[index + 1].time : undefined
			words = matchWordsForLine(wordLyric, item.time ?? 0, nextTime, item.lrc)
		}
		return (
			<LyricItemComponent
				index={index}
				text={item.lrc}
				fontSize={fontSizeStyle.fontSize}
				onLayout={handleLyricItemLayout}
				light={draggingIndex === index}
				highlight={isHighlight}
				words={words}
				position={words ? position : undefined}
				onPress={() => handleLyricItemPress(index)}
			/>
		)
	}, [fontSizeStyle.fontSize, handleLyricItemLayout, draggingIndex, currentLrcItem?.index, handleLyricItemPress, wordLyric, position])

	return (
		<>
			<View style={styles.fwflex1}>
				{loading ? (
					<View style={styles.fwflex1}>
						<ActivityIndicator size="large" color={colors.loading} />
					</View>
				) : lyrics?.length ? (
					<MaskedView
						style={{ flex: 1 }}
						maskElement={
							<LinearGradient
								style={{ flex: 1 }}
								colors={['transparent', 'black', 'black', 'transparent']}
								locations={[0, 0.12, 0.88, 1]}
							/>
						}
					>
						<FlatList
							ref={(_) => {
								listRef.current = _
							}}
							viewabilityConfig={{
								itemVisiblePercentThreshold: 100,
							}}
							onScrollToIndexFailed={({ index }) => {
								delay(80).then(() => {
									if (!userDraggingRef.current) {
										scrollToLyricIndex(index ?? 0, lyrics.length, true)
									}
								})
							}}
							ListHeaderComponent={listHeader}
							ListFooterComponent={blankComponent}
							onScrollBeginDrag={onScrollBeginDrag}
							onMomentumScrollEnd={onMomentumScrollEnd}
							onScroll={onScroll}
							scrollEventThrottle={32}
							style={styles.wrapper}
							data={lyrics}
							initialNumToRender={30}
							overScrollMode="never"
							extraData={currentLrcItem?.index ?? -1}
							renderItem={renderLyricItem}
						/>
					</MaskedView>
				) : (
					<View style={styles.fullCenter}>
						<Text style={[styles.white, fontSizeStyle]}>暂无歌词</Text>
					</View>
				)}
			</View>
		</>
	)
}

const createStyles = (colors: ThemeColors) =>
	StyleSheet.create({
		wrapper: {
			width: '100%',
			marginVertical: rpx(48),
			flex: 1,
		},
		fwflex1: {
			width: '100%',
			flex: 1,
		},
		empty: {
			paddingTop: '70%',
		},
		white: {
			color: colors.text,
		},
		lyricMeta: {
			position: 'absolute',
			width: '100%',
			flexDirection: 'row',
			justifyContent: 'center',
			alignItems: 'center',
			left: 0,
			paddingHorizontal: rpx(48),
			bottom: rpx(48),
		},
		lyricMetaText: {
			color: colors.text,
			opacity: 0.8,
			maxWidth: '80%',
		},
		linkText: {
			color: colors.primary,
			textDecorationLine: 'underline',
		},
		fullCenter: {
			width: '100%',
			flex: 1,
			justifyContent: 'center',
			alignItems: 'center',
		},
		singleLine: {
			width: '67%',
			height: 1,
			backgroundColor: colors.separator,
			opacity: 0.4,
		},
		playIcon: {
			width: rpx(90),
			textAlign: 'right',
			color: colors.text,
		},
		searchLyric: {
			width: rpx(180),
			marginTop: rpx(14),
			paddingVertical: rpx(10),
			textAlign: 'center',
			alignSelf: 'center',
			color: colors.primary,
			textDecorationLine: 'underline',
		},
	})
