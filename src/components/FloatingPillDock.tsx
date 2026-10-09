import { unknownTrackImageUri } from '@/constants/images'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useLastActiveTrack } from '@/hooks/useLastActiveTrack'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import LyricManager from '@/helpers/lyricManager'
import { useDockHideStore } from '@/store/dockHideStore'
import { useTabBarStyleStore, resolveDockBlurIntensity } from '@/store/tabBarStyleStore'
import PersistStatus from '@/store/PersistStatus'
import { Ionicons } from '@expo/vector-icons'
import SFSymbol from '@/components/SFSymbol'
import { BlurView } from 'expo-blur'
import LiquidGlassBackground from '@/components/LiquidGlassBackground'
import * as Haptics from 'expo-haptics'
import { useRouter, usePathname } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { StyleSheet, TouchableOpacity, View, Text, Platform, Keyboard } from 'react-native'
import FastImage from 'react-native-fast-image'
import Animated, {
	useAnimatedStyle,
	useSharedValue,
	withSequence,
	withSpring,
	withTiming,
	runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useActiveTrack, useIsPlaying } from 'react-native-track-player'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

// ========== 设计参数（参考图实测，取 build30/31 之间） ==========
const PLAYER_HEIGHT = 54          // 播放器胶囊高度
const TAB_BAR_HEIGHT = 64        // Tab 胶囊高度
const PLAYER_MARGIN = 11         // 播放器胶囊左右边距
const TAB_MARGIN = 9            // Tab 胶囊左右边距
const CAPSULE_GAP = 8           // 两个胶囊间距
const COVER_SIZE = 42           // 封面尺寸
const COVER_RADIUS = 9
const PILL_HEIGHT = 56          // 选中块高度（Kumone: contentHeight=56）
const PILL_INSET = 4            // 选中块左右内边距（Kumone: cellW-8）
const PILL_RADIUS = 28          // Kumone 全圆角胶囊（=PILL_HEIGHT/2）
const ACCENT_LIGHT = '#F24A5E'
const ACCENT_DARK = '#FF5F70'

// iOS 26 以上启用纯 JS 液态玻璃效果（无需原生组件，替换 bundle 即可生效）
const IS_IOS_26 = Platform.OS === 'ios' && parseInt(String(Platform.Version), 10) >= 26

// ========== Tab 定义（4 个真实页面） ==========
type TabItem = {
	name: string
	label: string
	icon: (color: string, active: boolean) => React.ReactNode
}

const NAV_TABS: TabItem[] = [
	{ name: 'radio', label: '发现', icon: (c, a) => <SFSymbol systemName="house.fill" size={32} color={c} weight="medium" /> },
	{ name: 'favorites', label: '音乐库', icon: (c, a) => <SFSymbol systemName="square.grid.2x2.fill" size={30} color={c} weight="medium" /> },
	{ name: 'search', label: '搜索', icon: (c) => <SFSymbol systemName="magnifyingglass" size={30} color={c} weight="medium" /> },
	{ name: 'profile', label: '我的', icon: (c, a) => <SFSymbol systemName={a ? 'person.crop.circle.fill' : 'person.crop.circle'} size={30} color={c} weight="medium" /> },
]

const isTabActive = (pathname: string, tabName: string): boolean => {
	if (tabName === 'profile') {
		return pathname.startsWith('/profile') || pathname.startsWith('/(tabs)/profile')
	}
	return pathname.startsWith(`/${tabName}`)
}

const getActiveTabIndex = (pathname: string): number =>
	NAV_TABS.findIndex((tab) => isTabActive(pathname, tab.name))

// ========== 奶白磨砂玻璃背景 ==========
const PillGlass = ({ borderRadius, isDark, blurTint }: { borderRadius: number; isDark: boolean; blurTint: string }) => {
	const dockBlurLevel = useTabBarStyleStore((st) => st.dockBlurLevel)
	const blurIntensity = resolveDockBlurIntensity(dockBlurLevel, isDark)
	return (
		<View style={[StyleSheet.absoluteFillObject, { borderRadius, overflow: 'hidden' }]}>
			{IS_IOS_26 ? (
				<LiquidGlassBackground style={{ flex: 1 }} />
			) : (
				<BlurView intensity={blurIntensity} tint={blurTint as any} style={{ flex: 1 }} />
			)}
			<View
				style={{
					...StyleSheet.absoluteFillObject,
					backgroundColor: isDark ? 'rgba(28,28,30,0.42)' : 'rgba(255,255,255,0.55)',
				}}
			/>
		</View>
	)
}

// ========== 纯 JS 液态玻璃背景（iOS 26 风格，无需原生组件） ==========
// 用高模糊 + 顶部高光 + 内阴影 + 半透明覆盖层模拟液态玻璃质感
const LiquidGlassPill = ({ borderRadius, isDark }: { borderRadius: number; isDark: boolean }) => {
	return (
		<View style={[StyleSheet.absoluteFillObject, { borderRadius, overflow: 'hidden' }]}>
			{/* 底层：高模糊 */}
			<BlurView intensity={isDark ? 60 : 50} tint={isDark ? 'dark' : 'light'} style={{ flex: 1 }} />
			{/* 半透明覆盖层：比普通毛玻璃更透明 */}
			<View
				style={{
					...StyleSheet.absoluteFillObject,
					backgroundColor: isDark ? 'rgba(28,28,30,0.30)' : 'rgba(255,255,255,0.40)',
				}}
			/>
			{/* 顶部高光：液态玻璃标志性的明亮上边缘 */}
			<View
				style={{
					position: 'absolute',
					top: 0,
					left: 0,
					right: 0,
					height: 1.5,
					backgroundColor: isDark ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.60)',
				}}
			/>
			{/* 底部内阴影：增加立体感 */}
			<View
				style={{
					position: 'absolute',
					bottom: 0,
					left: 0,
					right: 0,
					height: 8,
					backgroundColor: isDark ? 'rgba(0,0,0,0.20)' : 'rgba(0,0,0,0.06)',
				}}
			/>
		</View>
	)
}

// ========== 上一曲 ==========
const PrevButton = () => {
	const { isDark } = useAppTheme()
	return (
		<TouchableOpacity
			onPress={() => myTrackPlayer.skipToPrevious()}
			activeOpacity={0.6}
			style={styles.ctrlButton}
			hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
		>
			<SFSymbol systemName="backward.fill" size={20} color={isDark ? '#ffffff' : '#000000'} weight="semibold" />
		</TouchableOpacity>
	)
}

// ========== 播放/暂停（纯图标，无圆底，黑色） ==========
const PlayPauseButton = () => {
	const { playing } = useIsPlaying()
	const { isDark } = useAppTheme()
	return (
		<TouchableOpacity
			onPress={() => { playing ? myTrackPlayer.fadePause() : myTrackPlayer.fadePlay() }}
			activeOpacity={0.7}
			style={styles.ctrlButton}
			hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
		>
			<SFSymbol
				systemName={playing ? 'pause.fill' : 'play.fill'}
				size={17}
				color={isDark ? '#ffffff' : '#000000'}
				weight="semibold"
			/>
		</TouchableOpacity>
	)
}

// ========== 下一曲 ==========
const NextButton = () => {
	const { isDark } = useAppTheme()
	return (
		<TouchableOpacity
			onPress={() => myTrackPlayer.skipToNext()}
			activeOpacity={0.6}
			style={styles.ctrlButton}
			hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
		>
			<SFSymbol systemName="forward.fill" size={20} color={isDark ? '#ffffff' : '#000000'} weight="semibold" />
		</TouchableOpacity>
	)
}

// ========== 迷你播放胶囊 ==========
export const MiniPlayerCapsule = ({ onPress, isDark, blurTint }: { onPress: () => void; isDark: boolean; blurTint: string }) => {
	const { colors } = useAppTheme()
	const currentMusic = myTrackPlayer.useCurrentMusic()
	const activeTrack = useActiveTrack()
	const lastActiveTrack = useLastActiveTrack()
	const displayedTrack = currentMusic ?? activeTrack ?? lastActiveTrack
	const currentLyric = LyricManager.useCurrentLyric()
	const miniPlayerLyricEnabled = PersistStatus.get('music.miniPlayerLyricEnabled') !== false

	const textScale = useSharedValue(1)
	const translateY = useSharedValue(0)
	const capsuleStyle = useAnimatedStyle(() => ({ transform: [{ translateY: translateY.value }] }))

	const panGesture = useMemo(
		() =>
			Gesture.Race(
				Gesture.Tap()
					.maxDuration(999999)
					.onEnd(() => {
						runOnJS(onPress)()
					}),
				Gesture.Pan()
					.minDistance(5)
					.activeOffsetY([-10, 10])
					.onUpdate((event) => {
						if (event.translationY < 0) translateY.value = Math.max(event.translationY, -100)
					})
					.onEnd((event) => {
						translateY.value = withSpring(0, { damping: 18, stiffness: 250 })
						if (event.translationY < -25) {
							runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light)
							runOnJS(onPress)()
						}
					}),
			),
		[onPress, textScale, translateY],
	)

	if (!displayedTrack) {
		return (
			<Animated.View style={[capsuleStyle, { marginHorizontal: PLAYER_MARGIN, height: PLAYER_HEIGHT, borderRadius: PLAYER_HEIGHT / 2 }, styles.playerShadow]}>
				<View style={[StyleSheet.absoluteFillObject, { borderRadius: PLAYER_HEIGHT / 2, overflow: 'hidden' }]}>
					<PillGlass borderRadius={PLAYER_HEIGHT / 2} isDark={isDark} blurTint={blurTint} />
				</View>
				<View style={styles.placeholderRow}>
					<Text style={{ color: colors.textMuted, fontSize: 13, fontWeight: '500' }}>未在播放</Text>
				</View>
			</Animated.View>
		)
	}

	return (
		<Animated.View style={[capsuleStyle, { marginHorizontal: PLAYER_MARGIN, height: PLAYER_HEIGHT, borderRadius: PLAYER_HEIGHT / 2 }, styles.playerShadow]}>
			<View style={[StyleSheet.absoluteFillObject, { borderRadius: PLAYER_HEIGHT / 2, overflow: 'hidden' }]}>
				<PillGlass borderRadius={PLAYER_HEIGHT / 2} isDark={isDark} blurTint={blurTint} />
			</View>
			<View style={styles.playerInner}>
				<GestureDetector gesture={panGesture}>
					<View style={styles.playerLeft}>
						<FastImage
							key={displayedTrack.artwork ?? 'placeholder'}
							source={{ uri: displayedTrack.artwork ?? unknownTrackImageUri }}
							style={{ width: COVER_SIZE, height: COVER_SIZE, borderRadius: COVER_RADIUS, marginLeft: 8 }}
						/>
						<View style={{ flex: 1, marginLeft: 10, marginRight: 6, justifyContent: 'center' }}>
							<Text style={{ color: colors.text, fontSize: 16, fontWeight: '500' }} numberOfLines={1}>
								{displayedTrack.title ?? '未知'}
							</Text>
							<Text style={{ color: colors.textMuted, fontSize: 11.5, fontWeight: '500', marginTop: 1 }} numberOfLines={1}>
								{miniPlayerLyricEnabled && currentLyric?.lrc ? currentLyric.lrc : (displayedTrack.artist || '未知')}
							</Text>
						</View>
					</View>
				</GestureDetector>
				<View style={styles.playerControls}>
					<PrevButton />
					<PlayPauseButton />
					<NextButton />
				</View>
			</View>
		</Animated.View>
	)
}

// ========== Kumone 风格选中衬底（填满 cell 宽度，全高，淡色） ==========
const ActiveBubble = ({ translateX, cellW, isDark }: { translateX: Animated.SharedValue<number>; cellW: Animated.SharedValue<number>; isDark: boolean }) => {
	const animStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
		width: Math.max(cellW.value - PILL_INSET * 2, 40),
	}))
	return (
		<Animated.View
			style={[
				{
					position: 'absolute',
					top: (TAB_BAR_HEIGHT - PILL_HEIGHT) / 2,
					left: PILL_INSET,
					height: PILL_HEIGHT,
					borderRadius: PILL_RADIUS,
					backgroundColor: isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.075)',
					zIndex: 1,
				},
				animStyle,
			]}
		/>
	)
}

// ========== 单个 Tab ==========
const TabButton = ({
	tab, active, accent, inactive, onPress,
}: {
	tab: TabItem
	active: boolean
	accent: string
	inactive: string
	onPress: () => void
}) => {
	// 用 RNGH Tap 代替 TouchableOpacity：避免旧触摸系统抢走横向拖动，
	// 父级 Pan 在横向滑动时可正常接管，按钮点击仍保留
	const tap = Gesture.Tap()
		.maxDuration(900)
		.onEnd(() => {
			runOnJS(onPress)()
		})
	return (
		<GestureDetector gesture={tap}>
			<View style={styles.tabButton}>
				<View style={{ height: 26, justifyContent: 'center', alignItems: 'center' }}>
					{tab.icon(active ? accent : inactive, active)}
				</View>
				<Text
					numberOfLines={1}
					style={{ marginTop: 2, fontSize: 12.5, fontWeight: active ? '700' : '500', color: active ? accent : inactive }}
				>
					{tab.label}
				</Text>
			</View>
		</GestureDetector>
	)
}

// ========== 主组件 ==========
export const FloatingPillDock = () => {
	const { bottom } = useSafeAreaInsets()
	const { isDark, blurTint } = useAppTheme() as any
	const router = useRouter()
	const pathname = usePathname()
	const [keyboardHeight, setKeyboardHeight] = useState(0)
	const [kbOffset, setKbOffset] = useState(0)

	const accent = isDark ? ACCENT_DARK : ACCENT_LIGHT
	const inactive = isDark ? 'rgba(255,255,255,0.62)' : 'rgba(0,0,0,0.85)'

	// 键盘监听：仅搜索页面键盘弹出时迷你播放器上移，歌单等其他页面不上移
	useEffect(() => {
		const loadOffset = () => parseInt(PersistStatus.get('app.keyboardMiniPlayerOffset' as any) || '0', 10)
		const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
			if (pathname.includes('search')) {
				setKeyboardHeight(e.endCoordinates.height)
				setKbOffset(loadOffset())
			}
		})
		const hideSub = Keyboard.addListener('keyboardWillHide', () => {
			setKeyboardHeight(0)
		})
		return () => {
			showSub.remove()
			hideSub.remove()
		}
	}, [pathname])

	const tabBarWidth = useSharedValue(0)
	const cellW = useSharedValue(0)
	const bubbleX = useSharedValue(0)
	const startBubbleX = useSharedValue(0)
	const dragging = useSharedValue(false)
	const lastValidIndex = useRef(0)

	const currentTabIndex = getActiveTabIndex(pathname)
	const effectiveActiveIndex = currentTabIndex >= 0 ? currentTabIndex : lastValidIndex.current

	const navigateToTab = useCallback((tabName: string) => {
		router.navigate(`/${tabName}`)
	}, [router])

	const moveBubble = useCallback((index: number, animate: boolean) => {
		if (tabBarWidth.value <= 0) return
		const cellW = tabBarWidth.value / NAV_TABS.length
		const x = index * cellW  // ActiveBubble 的 left 已经是 PILL_INSET
		if (animate) bubbleX.value = withSpring(x, { damping: 29, stiffness: 322 })
		else bubbleX.value = x
	}, [tabBarWidth, bubbleX])

	const handleTabPress = useCallback((index: number) => {
		lastValidIndex.current = index
		navigateToTab(NAV_TABS[index].name)
		moveBubble(index, true)
	}, [navigateToTab, moveBubble])

	const handleLayout = useCallback((e: any) => {
		const width = e.nativeEvent.layout.width
		if (width <= 0) return
		tabBarWidth.value = width
		cellW.value = width / NAV_TABS.length
		const idx = getActiveTabIndex(pathname)
		const useIdx = idx >= 0 ? idx : lastValidIndex.current
		lastValidIndex.current = useIdx
		moveBubble(useIdx, false)
	}, [tabBarWidth, cellW, pathname, moveBubble])

	useEffect(() => {
		if (dragging.value) return
		const idx = getActiveTabIndex(pathname)
		if (idx < 0) return
		lastValidIndex.current = idx
		moveBubble(idx, true)
	}, [pathname, moveBubble, dragging])

	// 手指拖动滑块跟手切换：动画线程内只操作 SharedValue，
	// 所有 ref 写入/导航都通过 runOnJS 回到 JS，避免闪退
	const handleDragEnd = useCallback((index: number) => {
		dragging.value = false
		lastValidIndex.current = index
		navigateToTab(NAV_TABS[index].name)
	}, [navigateToTab, dragging])

	const panGesture = useMemo(
		() =>
			Gesture.Pan()
				.activeOffsetX([-8, 8])
				.onStart(() => {
					dragging.value = true
					startBubbleX.value = bubbleX.value
				})
				.onUpdate((event) => {
					'worklet'
					if (tabBarWidth.value <= 0) return
					const cellW = tabBarWidth.value / NAV_TABS.length
					const minX = 0
					const maxX = (NAV_TABS.length - 1) * cellW
					let nx = startBubbleX.value + event.translationX
					if (nx < minX) nx = minX
					if (nx > maxX) nx = maxX
					bubbleX.value = nx
				})
				.onEnd(() => {
					'worklet'
					if (tabBarWidth.value <= 0) {
						dragging.value = false
						return
					}
					const cellW = tabBarWidth.value / NAV_TABS.length
					let idx = Math.round(bubbleX.value / cellW)
					if (idx < 0) idx = 0
					if (idx > NAV_TABS.length - 1) idx = NAV_TABS.length - 1
					const targetX = idx * cellW
					bubbleX.value = withSpring(targetX, { damping: 29, stiffness: 322 })
					runOnJS(handleDragEnd)(idx)
				}),
		[tabBarWidth, bubbleX, startBubbleX, dragging, handleDragEnd],
	)

	// 详情页：Tab 胶囊下滑隐藏；播放器胶囊下移到 Tab 位置但保留显示
	const isHidden = useDockHideStore((s) => s.isHidden)
	const hideProgress = useSharedValue(0)
	useEffect(() => {
		hideProgress.value = withTiming(isHidden ? 1 : 0, { duration: 300 })
	}, [isHidden, hideProgress])

	const tabHideStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: hideProgress.value * 80 }],
		opacity: 1 - hideProgress.value,
	}))
	// 播放器下移一个 Tab 胶囊 + 间距的距离，正好落到原 Tab 位置；始终保持可见
	// 键盘弹出时迷你播放器上移到键盘上方，留 12px 空隙，平滑动效
	// keyboardHeight 包含底部安全区，需要减去
	const keyboardOffset = useSharedValue(0)
	useEffect(() => {
		const offset = keyboardHeight > 0 ? -(keyboardHeight - bottom + 12) : 0
		keyboardOffset.value = withTiming(offset, { duration: 250 })
	}, [keyboardHeight, keyboardOffset, bottom])
	const playerDropStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: hideProgress.value * (TAB_BAR_HEIGHT + CAPSULE_GAP) + keyboardOffset.value }],
	}))

	const handleMiniPlayerPress = useCallback(() => router.navigate('/player'), [router])

	return (
		<View style={[styles.container, { paddingBottom: Math.max(6, bottom - 14) }]} pointerEvents="box-none">
			{/* 播放器胶囊：键盘弹出时绝对定位到键盘上方，偏移量用户可调 */}
			<Animated.View style={[
				playerDropStyle,
				{
					position: keyboardHeight > 0 ? 'absolute' : 'relative',
					bottom: keyboardHeight > 0 ? keyboardHeight + kbOffset : undefined,
					left: 0,
					right: 0,
					zIndex: 10,
				}
			]}>
				<MiniPlayerCapsule onPress={handleMiniPlayerPress} isDark={isDark} blurTint={blurTint} />
			</Animated.View>

			{/* Tab 胶囊（仅点击切换，衬底弹性滑动；不做手指拖动，避免闪退） */}
			<Animated.View
				style={[{ marginTop: CAPSULE_GAP, marginHorizontal: TAB_MARGIN }, styles.shadow, tabHideStyle]}
				pointerEvents={isHidden ? 'none' : 'auto'}
			>
				<GestureDetector gesture={panGesture}>
				<View
					style={{
						height: TAB_BAR_HEIGHT,
						borderRadius: TAB_BAR_HEIGHT / 2,
						overflow: 'hidden',
						borderWidth: 0.5,
						borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.22)',
					}}
					onLayout={handleLayout}
				>
						<PillGlass borderRadius={TAB_BAR_HEIGHT / 2} isDark={isDark} blurTint={blurTint} />
						<ActiveBubble translateX={bubbleX} cellW={cellW} isDark={isDark} />
						<View style={styles.tabsRow}>
							{NAV_TABS.map((tab, index) => (
								<TabButton
									key={tab.name}
									tab={tab}
									active={effectiveActiveIndex === index}
									accent={accent}
									inactive={inactive}
									onPress={() => handleTabPress(index)}
								/>
							))}
						</View>
				</View>
				</GestureDetector>
			</Animated.View>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 100,
	},
	shadow: {
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 5,
	},
	playerShadow: {
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 5,
	},
	placeholderRow: { flex: 1, alignItems: 'center', justifyContent: 'center' },
	playerInner: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		paddingLeft: 7,
		paddingRight: 7,
	},
	playerLeft: { flex: 1, flexDirection: 'row', alignItems: 'center' },
	playerControls: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingRight: 8 },
	ctrlButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
	tabsRow: { flex: 1, flexDirection: 'row', alignItems: 'center', zIndex: 10 },
	tabButton: { flex: 1, alignItems: 'center', justifyContent: 'center' },
})
