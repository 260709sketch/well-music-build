import { useCommentModalStore } from '@/store/commentModalStore'
import { useRouter } from 'expo-router'
import { SimilarSongsModal } from '@/components/SimilarSongsModal'
import { Lyric } from '@/components/lyric'
import { MovingText } from '@/components/MovingText'
import { WellMusicAMPlayer } from '@/components/WellMusicAMPlayer'
import { WellMusicAppleMusicV2Player } from '@/components/WellMusicAppleMusicV2Player'
import { usePlayerStyleStore } from '@/store/playerStyleStore'
import { PlayerControls } from '@/components/PlayerControls'
import { PlayerProgressBar } from '@/components/PlayerProgressbar'
import { PlayerRepeatToggle } from '@/components/PlayerRepeatToggle'
import { PlayerVolumeBar } from '@/components/PlayerVolumeBar'
import { QualitySelector } from '@/components/QualitySelector'
import { ShowPlayerListToggle } from '@/components/ShowPlayerListToggle'
import { unknownTrackImageUri } from '@/constants/images'
import { ThemeColors, fontSize, screenPadding } from '@/constants/tokens'
import LyricManager from '@/helpers/lyricManager'
import myTrackPlayer, { useCurrentQuality } from '@/helpers/trackPlayerIndex'
import { currentMusicStore } from '@/player/PlayerStore'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'
import { ThemeOverrideProvider, useThemeColors } from '@/hooks/useAppTheme'
import { usePlayerBackground } from '@/hooks/usePlayerBackground'
import { useTrackPlayerFavorite } from '@/hooks/useTrackPlayerFavorite'
import PersistStatus from '@/store/PersistStatus'
import { useDefaultStyles } from '@/styles'
import i18n from '@/utils/i18n'
import { setTimingClose } from '@/utils/timingClose'
import { Entypo, MaterialCommunityIcons } from '@expo/vector-icons'
import { MenuView } from '@react-native-menu/menu'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import { LinearGradient } from 'expo-linear-gradient'
import { router } from 'expo-router'
import { logInfo, logError } from '@/helpers/logger'
import { StatusBar } from 'expo-status-bar'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	ActionSheetIOS,
	Alert,
	Dimensions,
	Share,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import FastImage from 'react-native-fast-image'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
	Easing,
	runOnJS,
	useAnimatedStyle,
	useSharedValue,
	withSpring,
	withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useActiveTrack, usePlaybackState } from 'react-native-track-player'

const { width: SCREEN_WIDTH } = Dimensions.get('window')
const SWIPE_THRESHOLD = SCREEN_WIDTH * 0.25

// 歌手名字 -> singerMid 内存缓存，避免跳转前重复发网络请求
const singerMidCache = new Map<string, string>()

const LYRIC_DELAY_STEP = 0.5
const LYRIC_DELAY_MIN = -15
const LYRIC_DELAY_MAX = 15

type ArtistDisplayProps = {
	artists: string
	onViewArtist: (artist: string) => void
}

const ArtistDisplay = React.memo(({ artists, onViewArtist }: ArtistDisplayProps) => {
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const styles = React.useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])
	const normalizedArtists = artists.trim()
	const artistArray = React.useMemo(
		() => normalizedArtists.split(/[、/,，]/).map((artist) => artist.trim()).filter(Boolean),
		[normalizedArtists],
	)
	const displayArtist = artistArray[0] ?? normalizedArtists
	if (!displayArtist) {
		return null
	}
	if (artistArray.length <= 1) {
		return (
			<TouchableOpacity activeOpacity={0.6} onPress={() => onViewArtist(displayArtist)} hitSlop={{ top: 10, bottom: 10, left: 30, right: 30 }}>
				<Text numberOfLines={1} style={[styles.trackArtistText, { marginTop: 6 }]}>{displayArtist}</Text>
			</TouchableOpacity>
		)
	}
	const artistActions = React.useMemo(
		() =>
			artistArray.map((artist) => ({
				id: artist,
				title: artist,
				image: 'person.crop.circle',
			})),
		[artistArray],
	)
	const handleArtistAction = useCallback(
		({ nativeEvent }: { nativeEvent: { event: string } }) => {
			onViewArtist(nativeEvent.event)
		},
		[onViewArtist],
	)
	return (
		<MenuView
			title="选择歌手"
			onPressAction={handleArtistAction}
			actions={artistActions}
		>
			<TouchableOpacity
				activeOpacity={0.6}
				hitSlop={{ top: 10, bottom: 10, left: 30, right: 30 }}
			>
				<Text numberOfLines={1} style={[styles.trackArtistText, { marginTop: 6 }]}>
					{normalizedArtists}
				</Text>
			</TouchableOpacity>
		</MenuView>
	)

})
// 默认播放器样式（黑胶、经典等），同时供全局常驻 overlay 使用
export const PlayerScreenContent = () => {
	const router = useRouter()
	const { setParams: setCommentParams } = useCommentModalStore()
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const styles = useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])
	const { top, bottom } = useSafeAreaInsets()
	const { isFavorite, toggleFavorite } = useTrackPlayerFavorite()
	const { playerStyle, setPlayerStyle } = usePlayerStyleStore()
	const [showLyrics, setShowLyrics] = useState(false)
	const [showLyricDelayControls, setShowLyricDelayControls] = useState(false)
	const [currentQuality, setCurrentQuality] = useCurrentQuality()
	const [showComments, setShowComments] = useState(false)
	const [showSimilarSongs, setShowSimilarSongs] = useState(false)
	const lyricDelaySeconds = PersistStatus.useValue('lyric.delaySeconds', 0) ?? 0
	const lyricsOpacity = useSharedValue(0)
	const lyricsTranslateY = useSharedValue(50)
	const artworkScale = useSharedValue(1)

	const playbackState = usePlaybackState()
	const isPlaying = playbackState.state === 'playing'

	const lyricsAnimatedStyle = useAnimatedStyle(() => ({
		opacity: lyricsOpacity.value,
		transform: [{ translateY: lyricsTranslateY.value }],
	}))

	const currentActiveTrack = useActiveTrack()
	const currentMusic = currentMusicStore.useValue()
	const prevTrackRef = useRef(currentActiveTrack)

	useEffect(() => {
		if (currentActiveTrack) {
			prevTrackRef.current = currentActiveTrack
		}
	}, [currentActiveTrack])

	// 优先用currentMusicStore（切歌时立即更新），避免useActiveTrack延迟导致显示未知歌曲
	const trackToDisplay = currentMusic ?? currentActiveTrack ?? prevTrackRef.current

	const { imageColors } = usePlayerBackground(trackToDisplay?.artwork ?? unknownTrackImageUri)

	const artworkTranslateX = useSharedValue(0)
	const artworkCrossfade = useSharedValue(1)
	const prevArtworkUri = useRef(unknownTrackImageUri)

	useEffect(() => {
		const newUri = trackToDisplay?.artwork ?? unknownTrackImageUri
		if (newUri !== prevArtworkUri.current) {
			artworkCrossfade.value = 0
			artworkCrossfade.value = withTiming(1, { duration: 420 })
			prevArtworkUri.current = newUri
		}
	}, [trackToDisplay?.artwork])

	const artworkAnimatedStyle = useAnimatedStyle(() => ({
		transform: [
			{ scale: artworkScale.value },
			{ translateX: artworkTranslateX.value },
		] as [{ scale: number }, { translateX: number }],
		opacity: artworkCrossfade.value,
	}))

	const handleSkipNext = useCallback(() => {
		myTrackPlayer.skipToNext()
	}, [])

	const handleSkipPrev = useCallback(() => {
		myTrackPlayer.skipToPrevious()
	}, [])

	const swipeGesture = React.useMemo(() => Gesture.Pan()
		.activeOffsetX([-20, 20])
		.onUpdate((e) => {
			artworkTranslateX.value = e.translationX * 0.5
		})
		.onEnd((e) => {
			if (e.translationX < -SWIPE_THRESHOLD) {
				artworkTranslateX.value = withTiming(-SCREEN_WIDTH * 0.3, { duration: 200 })
				artworkCrossfade.value = withTiming(0, { duration: 200 })
				runOnJS(handleSkipNext)()
			} else if (e.translationX > SWIPE_THRESHOLD) {
				artworkTranslateX.value = withTiming(SCREEN_WIDTH * 0.3, { duration: 200 })
				artworkCrossfade.value = withTiming(0, { duration: 200 })
				runOnJS(handleSkipPrev)()
			}
			artworkTranslateX.value = withSpring(0, { damping: 15, stiffness: 150 })
		}), [handleSkipNext, handleSkipPrev])

	const handleLyricsToggle = useCallback(() => {
		setShowLyrics((prev) => {
			const newShowLyrics = !prev
			if (newShowLyrics) {
				lyricsOpacity.value = withTiming(1, { duration: 300 })
				lyricsTranslateY.value = withSpring(0, { damping: 15, stiffness: 100 })
			} else {
				lyricsOpacity.value = withTiming(0, { duration: 300 })
				lyricsTranslateY.value = withSpring(50, { damping: 15, stiffness: 100 })
			}
			return newShowLyrics
		})
		setShowLyricDelayControls(false)
	}, [lyricsOpacity, lyricsTranslateY])

	useEffect(() => {
		if (isPlaying) {
			artworkScale.value = withSpring(1, {
				damping: 9,
				stiffness: 180,
				mass: 1,
				velocity: 0,
			})
		} else {
			artworkScale.value = withTiming(0.7, {
				duration: 300,
				easing: Easing.linear,
			})
		}
	}, [isPlaying])

	const handleViewArtist = useCallback((artist: string) => {
		if (!artist || artist.includes('未知')) {
			return
		}
		// 网易云多名歌手用 ' / ' 分隔，QQ音乐用 '、'，统一分割取第一个歌手
		const firstArtist = artist.split(/[、/]/)[0].trim()
		const currentTrack = trackToDisplay
		const platform = (currentTrack as any)?.platform || (currentTrack as any)?.source || ''
		const cacheKey = `${platform || 'unknown'}_${firstArtist}`
		const cached = singerMidCache.get(cacheKey)
		// 只对QQ音乐使用新的跳转逻辑（带singerName参数），其他平台完全用原来的逻辑
		const isQQ = platform === 'qq' || platform === 'tx' || platform?.includes('qq') || ((currentTrack as any)?.source || '')?.includes('qq')
		if (isQQ) {
			// QQ音乐：先跳转到歌手名（playlistName就是歌手名，显示正确），后台解析mid缓存
			router.navigate(`/(modals)/${encodeURIComponent(firstArtist)}?platform=${platform}`)
			getSingerMidBySingerName(firstArtist, platform || undefined).then((singerMid) => {
				if (singerMid) {
					singerMidCache.set(cacheKey, singerMid)
				}
			}).catch(() => {})
			return
		} else {
			// 其他平台：完全用原来的逻辑，不动
			if (cached) {
				router.navigate(`/(modals)/${cached}`)
				return
			}
			router.navigate(`/(modals)/${encodeURIComponent(firstArtist)}`)
			getSingerMidBySingerName(firstArtist, platform || undefined).then((singerMid) => {
				if (singerMid) {
					singerMidCache.set(cacheKey, singerMid)
				}
			}).catch(() => {})
		}
	}, [trackToDisplay])

	const handleDownload = useCallback(async () => {
		if (trackToDisplay) {
			myTrackPlayer.cacheAndImportMusic(trackToDisplay as IMusic.IMusicItem)
		}
	}, [trackToDisplay])

	const handleShare = useCallback(async () => {
		try {
			await Share.share({
				title: trackToDisplay?.title,
				message: `歌曲: ${trackToDisplay?.title} by ${trackToDisplay?.artist}`,
				url: trackToDisplay?.url,
			})
		} catch (error) {
			console.error(error.message)
		}
	}, [trackToDisplay])
	const handleTimingClose = useCallback((minutes: number) => {
		setTimingClose(Date.now() + minutes * 60 * 1000)
	}, [])

	const menuActions = React.useMemo(() => {
		const actions = [
			{
				id: 'favorite',
				title: i18n.t('player.like'),
				titleColor: isFavorite ? colors.primary : undefined,
				image: isFavorite ? 'heart.fill' : 'heart',
			},
			{ id: 'album', title: i18n.t('player.showAlbum'), image: 'music.note.list' },
			{ id: 'comments', title: '评论', image: 'text.bubble' },
			{ id: 'similar', title: '相似歌曲', image: 'music.note' },
			{ id: 'lyrics', title: i18n.t('player.showLyrics'), image: 'text.quote' },
			{ id: 'playlist', title: i18n.t('player.addToPlaylist'), image: 'plus.circle' },
			{ id: 'share', title: i18n.t('player.share'), image: 'square.and.arrow.up' },
			{
				id: 'playerStyle',
				title: '播放器样式',
				image: 'paintpalette',
				subactions: [
							{ id: 'style_wellmusic_am', title: (playerStyle === 'wellmusic-am' ? '✓ ' : '') + 'AM' },
								{ id: 'style_applemusic_v2', title: (playerStyle === 'apple-music-v2' ? '✓ ' : '') + 'Apple Music V2' },
						],
			},
			{
				id: 'timing',
				title: i18n.t('player.closeAfter'),
				image: 'timer',
				subactions: [
					{ id: 'timing_10', title: '10 ' + i18n.t('player.minutes') },
					{ id: 'timing_15', title: '15 ' + i18n.t('player.minutes') },
					{ id: 'timing_20', title: '20 ' + i18n.t('player.minutes') },
					{ id: 'timing_30', title: '30 ' + i18n.t('player.minutes') },
					{ id: 'timing_cus', title: i18n.t('player.custom') },
				],
			},
		]
		if (trackToDisplay?.platform !== 'local') {
			actions.splice(4, 0, {
				id: 'download',
				title: i18n.t('player.download'),
				image: 'arrow.down.circle',
			})
		}
		return actions
	}, [colors.primary, isFavorite, trackToDisplay?.platform, playerStyle])
	useEffect(() => {
		if (showLyrics) {
			activateKeepAwakeAsync()
		} else {
			deactivateKeepAwake()
		}

		return () => {
			deactivateKeepAwake() // 清理函数，确保组件卸载时停用屏幕常亮
		}
	}, [showLyrics])
	const handleLyricsFontSizeDecrease = useCallback(() => {
		const currentFontSize = PersistStatus.get('lyric.detailFontSize') ?? 1
		PersistStatus.set('lyric.detailFontSize', currentFontSize - 1 < 0 ? 0 : currentFontSize - 1)
	}, [])

	const handleLyricsFontSizeIncrease = useCallback(() => {
		const currentFontSize = PersistStatus.get('lyric.detailFontSize') ?? 1
		PersistStatus.set('lyric.detailFontSize', currentFontSize + 1 > 3 ? 3 : currentFontSize + 1)
	}, [])
	function formatLyricDelay(delaySeconds: number): string {
		const normalized = Math.abs(delaySeconds) < 0.05 ? 0 : delaySeconds
		const rounded = Math.round(normalized * 10) / 10
		const prefix = rounded > 0 ? '+' : ''
		return `${prefix}${rounded.toFixed(1)}s`
	}
	function updateLyricDelay(nextDelaySeconds: number): void {
		const normalized = Math.round(nextDelaySeconds * 10) / 10
		const clamped = Math.max(LYRIC_DELAY_MIN, Math.min(LYRIC_DELAY_MAX, normalized))
		PersistStatus.set('lyric.delaySeconds', clamped)
		LyricManager.refreshLyric().catch((err) => {
			console.error('refresh lyric after delay changed failed', err)
		})
	}
	function handleLyricDelayDecrease(): void {
		const currentDelay = PersistStatus.get('lyric.delaySeconds') ?? 0
		updateLyricDelay(currentDelay - LYRIC_DELAY_STEP)
	}
	function handleLyricDelayIncrease(): void {
		const currentDelay = PersistStatus.get('lyric.delaySeconds') ?? 0
		updateLyricDelay(currentDelay + LYRIC_DELAY_STEP)
	}
	function handleLyricDelayReset(): void {
		updateLyricDelay(0)
	}
	function toggleLyricDelayControls(): void {
		setShowLyricDelayControls((prev) => !prev)
	}
	function setCustomTimingClose() {
		Alert.prompt(
			i18n.t('player.setTimingClose'),
			i18n.t('player.inputMinutes'),
			[
				{
					text: i18n.t('player.cancel'),
					style: 'cancel',
				},
				{
					text: i18n.t('player.confirm'),
					onPress: (minutes) => {
						if (minutes && !isNaN(Number(minutes))) {
							const milliseconds = Number(minutes) * 60 * 1000
							setTimingClose(Date.now() + milliseconds)
						} else {
							Alert.alert(i18n.t('player.error.title'), i18n.t('player.error.minutesErrorMessage'))
						}
					},
				},
			],
			'plain-text',
		)
	}

	return (
		<>
			<StatusBar style="light" />
			<View
				style={{ flex: 1, backgroundColor: '#000' }}
			>
				<View style={styles.overlayContainer}>
					<DismissPlayerSymbol />
					{showLyrics ? (
						<View style={{ flex: 1, marginTop: top + 40, marginBottom: bottom }}>
							<Animated.View style={[styles.lyricContainer, lyricsAnimatedStyle]}>
								{/* <Pressable style={styles.artworkTouchable} onPress={handleLyricsToggle}> */}
								<Lyric onTurnPageClick={handleLyricsToggle} />
								{/* </Pressable> */}
							</Animated.View>
							<View style={styles.container}>
								<View style={styles.leftItem}>
									<MaterialCommunityIcons
										name="tooltip-minus-outline"
										size={27}
										color={colors.text}
										onPress={handleLyricsToggle}
										style={{ marginBottom: 4 }}
									/>
								</View>
								<View style={styles.centeredItem}>
									<MaterialCommunityIcons
										name="format-font-size-decrease"
										size={30}
										color={colors.text}
										onPress={handleLyricsFontSizeDecrease}
										style={{ marginBottom: 4 }}
									/>
								</View>
								<View style={styles.centeredItem}>
									<MaterialCommunityIcons
										name="format-font-size-increase"
										size={30}
										color={colors.text}
										onPress={handleLyricsFontSizeIncrease}
										style={{ marginBottom: 4 }}
									/>
								</View>
								<View style={styles.rightItem}>
									<TouchableOpacity
										style={styles.lyricDelayToggleButton}
										onPress={toggleLyricDelayControls}
									>
										<MaterialCommunityIcons
											name="timer-outline"
											size={26}
											color={showLyricDelayControls ? colors.primary : colors.text}
										/>
									</TouchableOpacity>
								</View>
							</View>
							{showLyricDelayControls ? (
								<View style={[styles.container, styles.lyricDelayContainer]}>
									<View style={styles.leftItem}>
										<TouchableOpacity
											style={styles.delayAdjustButton}
											onPress={handleLyricDelayDecrease}
										>
											<Text style={styles.delayAdjustText}>-0.5s</Text>
										</TouchableOpacity>
									</View>
									<View style={styles.centeredItem}>
										<TouchableOpacity style={styles.delayValueButton} onPress={handleLyricDelayReset}>
											<Text style={styles.delayLabel}>{i18n.t('player.lyricDelay')}</Text>
											<Text style={styles.delayValueText}>{formatLyricDelay(lyricDelaySeconds)}</Text>
										</TouchableOpacity>
									</View>
									<View style={styles.rightItem}>
										<TouchableOpacity
											style={styles.delayAdjustButton}
											onPress={handleLyricDelayIncrease}
										>
											<Text style={styles.delayAdjustText}>+0.5s</Text>
										</TouchableOpacity>
									</View>
								</View>
							) : null}
						</View>
					) : (
						<View style={{ flex: 1, marginTop: top + 70, marginBottom: bottom }}>
						<GestureDetector gesture={swipeGesture}>
							<Animated.View style={[styles.artworkImageContainer, artworkAnimatedStyle]}>
								<TouchableOpacity style={styles.artworkTouchable} onPress={handleLyricsToggle}>
									<FastImage
										source={{
											uri: trackToDisplay?.artwork ?? unknownTrackImageUri,
											priority: FastImage.priority.high,
										}}
										resizeMode="cover"
										style={styles.artworkImage}
									/>
								</TouchableOpacity>
							</Animated.View>
						</GestureDetector>
							<View style={{ flex: 1 }}>
								<View style={{ marginTop: 'auto' }}>
									<View style={{ height: 60 }}>
										<View
											style={{
												flexDirection: 'row',
												justifyContent: 'space-between',
												alignItems: 'center',
											}}
										>
											{/* Track title */}
											<View style={styles.trackTitleContainer}>
												<MovingText
													text={trackToDisplay?.title ?? ''}
													animationThreshold={30}
													style={styles.trackTitleText}
												/>
											</View>

											{/* 爱心收藏按钮（替代原来的三个点位置） */}
											<TouchableOpacity
												onPress={handleFavorite}
												activeOpacity={0.7}
												style={styles.favoriteButton}
											>
												<MaterialCommunityIcons
													name={isFavorite ? 'heart' : 'heart-outline'}
													size={22}
													color={isFavorite ? '#FF3B30' : colors.icon}
												/>
											</TouchableOpacity>
										</View>

										{/* Track artist */}
									{trackToDisplay?.artist ? (
										<ArtistDisplay artists={trackToDisplay.artist} onViewArtist={handleViewArtist} />
									) : null}
									</View>

									<PlayerProgressBar style={{ marginTop: 32 }} />

									{/* 音质选择器 - 往上靠，居中拉伸 */}
									<View style={{ marginTop: 8, marginBottom: 4 }}>
										<QualitySelector
											currentQuality={currentQuality}
											onQualityChange={setCurrentQuality}
										/>
									</View>

									<PlayerControls style={{ marginTop: 4 }} />
								</View>

								<PlayerVolumeBar style={{ marginTop: 'auto', marginBottom: 30 }} />

								<View style={styles.container}>
									<View style={styles.bottomButtonItem}>
										<MaterialCommunityIcons
											name="tooltip-minus-outline"
											size={27}
											color={colors.text}
											onPress={handleLyricsToggle}
											style={{ marginBottom: 2 }}
										/>
									</View>
									<View style={styles.bottomButtonItem}>
										<PlayerRepeatToggle size={30} style={{ marginBottom: 6 }} />
									</View>
									<View style={styles.bottomButtonItem}>
										<ShowPlayerListToggle size={30} style={{ marginBottom: 6 }} />
									</View>
									<View style={styles.bottomButtonItem}>
										{/* 三个点更多选项按钮（从右上角移到底部） */}
										<MenuView
											title={i18n.t('player.songOptions')}
											onPressAction={({ nativeEvent }) => {
												switch (nativeEvent.event) {
													case 'album':
														handleShowAlbum()
														break
													case 'comments':
														setShowComments(true)
														break
													case 'similar':
														setShowSimilarSongs(true)
														break
													case 'lyrics':
														handleShowLyrics()
														break
													case 'playlist':
														handleAddToPlaylist()
														break
													case 'download':
														handleDownload()
														break
													case 'share':
														handleShare()
														break
													case 'style_wellmusic_am':
														// AM风格提醒（最多3次）
														const amRemindCount = parseInt(PersistStatus.get('am_style_remind_count') ?? '0')
														if (amRemindCount < 3) {
															PersistStatus.set('am_style_remind_count', String(amRemindCount + 1))
															
														}
														setPlayerStyle('wellmusic-am')
															break
														case 'style_applemusic_v2':
																setPlayerStyle('apple-music-v2')
																break
													case 'timing_10':
														handleTimingClose(10)
														break
													case 'timing_15':
														handleTimingClose(15)
														break
													case 'timing_20':
														handleTimingClose(20)
														break
													case 'timing_30':
														handleTimingClose(30)
														break
													case 'timing_cus':
														setCustomTimingClose()
														break
												}
											}}
											actions={menuActions.filter((a: any) => a.id !== 'favorite')}
										>
											<TouchableOpacity style={styles.menuButton}>
												<Entypo name="dots-three-horizontal" size={24} color={colors.text} />
											</TouchableOpacity>
										</MenuView>
									</View>
								</View>
							</View>
						</View>
					)}
				</View>
			</View>
			{showComments && (() => {
                        setCommentParams({
                            songId: trackToDisplay?.id || trackToDisplay?.songmid || '',
                            songTitle: trackToDisplay?.title || '',
                            songArtist: trackToDisplay?.artist || '',
                            songCover: trackToDisplay?.artwork || '',
                            platform: trackToDisplay?.platform || trackToDisplay?.source || 'qq',
                        })
                        router.push('/(modals)/comments')
                        setShowComments(false)
                        return null
                    })()}
					<SimilarSongsModal
						visible={showSimilarSongs}
						onClose={() => setShowSimilarSongs(false)}
						songId={trackToDisplay?.id || ''}
						songTitle={trackToDisplay?.title || ''}
						platform={trackToDisplay?.platform || 'netease'}
					/>
					</>
	)
}

// 播放器错误边界：组件渲染抛错时显示错误信息而非白屏，便于定位
class PlayerErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; message: string }> {
	state = { hasError: false, message: '' }

	static getDerivedStateFromError(err: any) {
		return { hasError: true, message: String(err?.message || err) }
	}

	render() {
		if (this.state.hasError) {
			return (
				<View style={{ flex: 1, backgroundColor: '#000', alignItems: 'center', justifyContent: 'center', padding: 30 }}>
					<Text style={{ color: '#fff', fontSize: 16, marginBottom: 12 }}>播放器渲染出错</Text>
					<Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' }}>{this.state.message}</Text>
				</View>
			)
		}
		return this.props.children
	}
}

// 播放器主体（含错误边界与暗色主题包装），由全局常驻 overlay 渲染
export const PlayerBody = () => {
	const { playerStyle } = usePlayerStyleStore()

	if (playerStyle === 'apple-music-v2') {
		return (
			<PlayerErrorBoundary>
				<ThemeOverrideProvider resolvedTheme="dark">
					<WellMusicAppleMusicV2Player />
				</ThemeOverrideProvider>
			</PlayerErrorBoundary>
		)
	}

	// 默认 AM 播放器（含旧样式迁移兜底）
	return (
		<PlayerErrorBoundary>
			<ThemeOverrideProvider resolvedTheme="dark">
				<WellMusicAMPlayer />
			</ThemeOverrideProvider>
		</PlayerErrorBoundary>
	)
}

const DismissPlayerSymbol = React.memo(() => {
	const colors = useThemeColors()
	const { top } = useSafeAreaInsets()

	return (
		<View
			style={{
				position: 'absolute',
				top: top + 8,
				left: 0,
				right: 0,
				flexDirection: 'row',
				justifyContent: 'center',
			}}
		>
			<View
				style={{
					width: 50,
					height: 8,
					borderRadius: 8,
					backgroundColor: colors.dismissBar,
					opacity: 0.7,
				}}
			/>
		</View>
	)
})

const createStyles = (
	colors: ThemeColors,
	defaultStyles: ReturnType<typeof useDefaultStyles>,
) =>
	StyleSheet.create({
	menuButton: {
		padding: 4,
		justifyContent: 'center',
		alignItems: 'center',
	},
	overlayContainer: {
		...defaultStyles.container,
		paddingHorizontal: screenPadding.horizontal,
		backgroundColor: colors.overlay,
	},
	artworkImageContainer: {
		aspectRatio: 1, // 保持正方形比例
		width: '100%',
		maxHeight: '50%', // 限制最大高度
		alignSelf: 'center',
		borderRadius: 12,
		overflow: 'hidden',
		backgroundColor: colors.artworkPlaceholder,
		shadowColor: colors.shadow,
		shadowOffset: {
			width: 0,
			height: 8,
		},
		shadowOpacity: 0.44,
		shadowRadius: 11.0,
		elevation: 16,
	},
	artworkTouchable: {
		width: '100%',
		height: '100%',
	},
	artworkImage: {
		width: '100%',
		height: '100%',
		resizeMode: 'cover',
		borderRadius: 12,
		backgroundColor: 'transparent',
	},
	trackTitleContainer: {
		flex: 1,
		overflow: 'hidden',
	},
	trackTitleText: {
		...defaultStyles.text,
		fontSize: 22,
		fontWeight: '500',
	},
	trackArtistText: {
		...defaultStyles.text,
		fontSize: fontSize.base,
		opacity: 0.8,
		maxWidth: '90%',
	},
	lyricText: {
		...defaultStyles.text,
		textAlign: 'center',
	},
	lyric: {},
	container: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
	},
	bottomButtonItem: {
		flex: 1,
		alignItems: 'center',
	},
	favoriteButton: {
		padding: 4,
		marginLeft: 8,
	},
	lyricDelayContainer: {
		marginTop: 10,
	},
	lyricDelayToggleButton: {
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
	},
	delayAdjustButton: {
		backgroundColor: colors.overlaySoft,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
	},
	delayAdjustText: {
		...defaultStyles.text,
		fontSize: 14,
		fontWeight: '500',
	},
	delayValueButton: {
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: colors.overlaySoft,
		paddingVertical: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
		minWidth: 130,
	},
	delayLabel: {
		...defaultStyles.text,
		fontSize: 11,
		opacity: 0.8,
	},
	delayValueText: {
		...defaultStyles.text,
		fontSize: 15,
		fontWeight: '500',
	},
	lyricContainer: {
		flex: 1,
	},
	})

// 播放器路由：直接渲染播放器主体（V1/V2），使用原生 card 下滑关闭
export default function Player() {
	return <PlayerBody />
}
