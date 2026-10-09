import { unknownTrackImageUri } from '@/constants/images'
import SFSymbol from '@/components/SFSymbol'
import { LibraryIcon } from '@/components/LibraryIcon'
import { FloatingPillDock } from '@/components/FloatingPillDock'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useLastActiveTrack } from '@/hooks/useLastActiveTrack'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { useDockHideStore } from '@/store/dockHideStore'
import { FontAwesome, FontAwesome6, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import * as Haptics from 'expo-haptics'
import { useRouter, usePathname } from 'expo-router'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Platform,
	StyleSheet,
	TouchableOpacity,
	View,
	Text,
} from 'react-native'
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

// ========== 设计参数（参考 Kumone GlassTabBar） ==========
const TAB_BAR_HEIGHT = 56 // 内容高度
const TAB_BAR_INSET = 4 // 内边距
const MINIPLAYER_HEIGHT = 58
const HORIZONTAL_PADDING = 12
const ELEMENT_GAP = 8
const COVER_SIZE = 42
const PLAY_BUTTON_SIZE = 36

// ========== Tab 定义 ==========
type TabItem = {
	name: string
	label: string
	icon: (color: string, focused: boolean) => React.ReactNode
}

const NAV_TABS: TabItem[] = [
	{
		name: 'radio',
		label: '发现',
		icon: (color) => <SFSymbol systemName="house" size={24} color={color} />,
	},
	{
		name: 'favorites',
		label: '音乐库',
		icon: (color) => <SFSymbol systemName="square.grid.2x2.fill" size={24} color={color} />,
	},
	{
		name: 'search',
		label: '搜索',
		icon: (color) => <SFSymbol systemName="magnifyingglass" size={24} color={color} />,
	},
	{
		name: 'profile',
		label: '我的',
		icon: (color) => <SFSymbol systemName="person" size={22} color={color} />,
	},
]

// ========== 工具函数 ==========
const isTabActive = (pathname: string, tabName: string): boolean => {
	if (tabName === 'profile') {
		return pathname.startsWith('/profile') || pathname.startsWith('/(tabs)/profile')
	}
	return pathname.startsWith(`/${tabName}`)
}

const getActiveTabIndex = (pathname: string): number => {
	const idx = NAV_TABS.findIndex((tab) => isTabActive(pathname, tab.name))
	return idx
}

// ========== 增强毛玻璃背景（多层折射 + 饱和度 + 边缘高光） ==========
const GlassBackground = ({ intensity = 40, borderRadius = 0, isLiquidGlass = false }: { intensity?: number; borderRadius?: number; isLiquidGlass?: boolean }) => {
	const { isDark, blurTint } = useAppTheme()
	const [renderKey, setRenderKey] = useState(0)
	const [showBlur, setShowBlur] = useState(true)

	useEffect(() => {
		setShowBlur(false)
		const timer = setTimeout(() => {
			setRenderKey((k) => k + 1)
			setShowBlur(true)
		}, 50)
		return () => clearTimeout(timer)
	}, [isDark, intensity])

	return (
		<View style={[StyleSheet.absoluteFillObject, { borderRadius, overflow: 'hidden' }]}>
			{/* 第一层：基础模糊 */}
			{showBlur && (
				<BlurView
					key={`blur1-${isDark}-${intensity}-${renderKey}`}
					intensity={intensity}
					tint={blurTint}
					style={{ flex: 1 }}
				/>
			)}
			{/* 第二层：轻微模糊叠加，模拟折射层次 */}
			{showBlur && (
				<BlurView
					key={`blur2-${isDark}-${intensity}-${renderKey}`}
					intensity={Math.max(10, intensity - 20)}
					tint={blurTint}
					style={StyleSheet.absoluteFillObject}
				/>
			)}
			{/* 饱和度叠加层 */}
			<View
				style={{
					...StyleSheet.absoluteFillObject,
					backgroundColor: isDark
						? 'rgba(120, 130, 255, 0.05)'
						: (isLiquidGlass ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.20)'),
				}}
			/>
			{/* 顶部15%高光带：模拟光线从上方折射进入 */}
			<LinearGradient
				colors={[
					isDark ? 'rgba(255,255,255,0.15)' : (isLiquidGlass ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.40)'),
					'rgba(255,255,255,0)',
				]}
				start={{ x: 0.5, y: 0 }}
				end={{ x: 0.5, y: 1 }}
				style={{
					position: 'absolute',
					top: 0, left: 0, right: 0,
					height: '15%',
					borderTopLeftRadius: borderRadius,
					borderTopRightRadius: borderRadius,
				}}
			/>
			{/* 底部暗带：模拟玻璃厚度 */}
			<LinearGradient
				colors={[
					'rgba(0,0,0,0)',
					isDark ? 'rgba(0,0,0,0.12)' : (isLiquidGlass ? 'rgba(0,0,0,0.05)' : 'rgba(0,0,0,0.02)'),
				]}
				start={{ x: 0.5, y: 0 }}
				end={{ x: 0.5, y: 1 }}
				style={{
					position: 'absolute',
					bottom: 0, left: 0, right: 0,
					height: '35%',
					borderBottomLeftRadius: borderRadius,
					borderBottomRightRadius: borderRadius,
				}}
			/>
			{/* 左侧边缘折射光 */}
			<LinearGradient
				colors={[
					isDark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.1)',
					'rgba(255,255,255,0)',
				]}
				start={{ x: 0, y: 0.5 }}
				end={{ x: 1, y: 0.5 }}
				style={{
					position: 'absolute',
					top: 0, bottom: 0, left: 0,
					width: 6,
				}}
			/>
			{/* 右侧边缘折射光 */}
			<LinearGradient
				colors={[
					'rgba(255,255,255,0)',
					isDark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.08)',
				]}
				start={{ x: 0, y: 0.5 }}
				end={{ x: 1, y: 0.5 }}
				style={{
					position: 'absolute',
					top: 0, bottom: 0, right: 0,
					width: 6,
				}}
			/>
			{/* 顶部1px高光边框 */}
			<View
				style={{
					position: 'absolute',
					top: 0, left: 0, right: 0,
					height: 1,
					backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.3)',
				}}
			/>
		</View>
	)
}

// ========== 播放/暂停按钮 ==========
const PlayPauseButton = () => {
	const { playing } = useIsPlaying()
	const { isDark } = useAppTheme()
	const [isLoading, setIsLoading] = useState(false)

	const handlePress = useCallback(() => {
		if (playing) {
			myTrackPlayer.fadePause()
		} else {
			myTrackPlayer.fadePlay()
		}
	}, [playing])

	return (
		<TouchableOpacity
			onPress={handlePress}
			activeOpacity={0.8}
			style={[
				styles.playButton,
				{
					width: PLAY_BUTTON_SIZE,
					height: PLAY_BUTTON_SIZE,
					borderRadius: PLAY_BUTTON_SIZE / 2,
					backgroundColor: isDark ? '#ffffff' : '#000000',
				},
			]}
		>
			{isLoading ? (
				<ActivityIndicator size="small" color={isDark ? '#000000' : '#ffffff'} />
			) : (
				<FontAwesome6
					name={playing ? 'pause' : 'play'}
					size={14}
					color={isDark ? '#000000' : '#ffffff'}
					style={playing ? {} : { marginLeft: 2 }}
				/>
			)}
		</TouchableOpacity>
	)
}

// ========== 下一首按钮 ==========
const NextButton = () => {
	const { isDark } = useAppTheme()
	const handlePress = useCallback(() => {
		myTrackPlayer.skipToNext()
	}, [])
	return (
		<TouchableOpacity onPress={handlePress} activeOpacity={0.6} style={styles.nextButton}>
			<FontAwesome6 name="forward" size={17} color={isDark ? '#ffffff' : '#000000'} />
		</TouchableOpacity>
	)
}

// ========== 迷你播放条 ==========
const MiniPlayerBar = ({ onPress, isLiquidGlass = false }: { onPress: () => void; isLiquidGlass?: boolean }) => {
	const { colors, isDark } = useAppTheme()
	const currentMusic = myTrackPlayer.useCurrentMusic()
	const activeTrack = useActiveTrack()
	const lastActiveTrack = useLastActiveTrack()
	const displayedTrack = currentMusic ?? activeTrack ?? lastActiveTrack
	const borderRadius = MINIPLAYER_HEIGHT / 2

	const scale = useSharedValue(1)
	const translateY = useSharedValue(0)
	const textScale = useSharedValue(1)
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }, { translateY: translateY.value }],
	}))
	const textAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ scale: textScale.value }],
	}))

	const panGesture = useMemo(
		() =>
			Gesture.Race(
				// Tap 手势：处理点击和长按（maxDuration设极大值避免长按超时失败）
				Gesture.Tap()
					.maxDuration(999999)
					.onStart(() => {
						textScale.value = withSpring(0.96, { damping: 15, stiffness: 300 })
					})
					.onEnd(() => {
						textScale.value = withSequence(
							withSpring(1.02, { damping: 12, stiffness: 350 }),
							withSpring(1, { damping: 18, stiffness: 250 }),
						)
						runOnJS(onPress)()
					}),
				// Pan 手势：处理上滑
				Gesture.Pan()
					.minDistance(5)
					.activeOffsetY([-10, 10])
					.onBegin(() => {
					})
					.onUpdate((event) => {
						if (event.translationY < 0) {
							translateY.value = Math.max(event.translationY, -100)
						}
					})
					.onEnd((event) => {
						translateY.value = withSpring(0, { damping: 18, stiffness: 250 })
						if (event.translationY < -25) {
							runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light)
							runOnJS(onPress)()
						}
					}),
			),
		[scale, translateY, onPress],
	)

	if (!displayedTrack) {
		return (
			<GestureDetector gesture={panGesture}>
				<Animated.View style={animatedStyle}>
					<View style={[styles.miniPlayerContainer, { height: MINIPLAYER_HEIGHT, borderRadius }]}>
						<GlassBackground intensity={isLiquidGlass ? 60 : 25} isLiquidGlass={isLiquidGlass} />
						<View style={styles.miniPlayerPlaceholder}>
							<Text style={[styles.miniPlayerPlaceholderText, { color: colors.textMuted }]}>
								未在播放
							</Text>
						</View>
					</View>
				</Animated.View>
			</GestureDetector>
		)
	}

	return (
		<Animated.View style={animatedStyle}>
			<View style={[styles.miniPlayerContainer, { height: MINIPLAYER_HEIGHT, borderRadius }]}>
				<GlassBackground intensity={isLiquidGlass ? 60 : 35} isLiquidGlass={isLiquidGlass} />
				<GestureDetector gesture={panGesture}>
					<View style={styles.miniPlayerContent}>
						<FastImage
							source={{ uri: displayedTrack.artwork ?? unknownTrackImageUri }}
							style={[styles.miniPlayerCover, { width: COVER_SIZE, height: COVER_SIZE, borderRadius: 10 }]}
						/>
						<Animated.View style={[styles.miniPlayerTextContainer, textAnimatedStyle]}>
							<Text style={[styles.miniPlayerTitle, { color: colors.text }]} numberOfLines={1}>
								{displayedTrack.title ?? '未知'}
							</Text>
							<Text style={[styles.miniPlayerArtist, { color: colors.textMuted }]} numberOfLines={1}>
								{displayedTrack.artist ?? '未知'}
							</Text>
						</Animated.View>
					</View>
				</GestureDetector>
				<View style={styles.miniPlayerButtons}>
					<PlayPauseButton />
					<NextButton />
				</View>
			</View>
		</Animated.View>
	)
}

// ========== 单个 Tab 按钮 ==========
const TabButton = ({
	tab,
	active,
	onPress,
}: {
	tab: TabItem
	active: boolean
	onPress: () => void
}) => {
	const { colors, isDark } = useAppTheme()
	const activeColor = isDark ? '#FFFFFF' : '#000000'
	const inactiveColor = isDark ? 'rgba(255,255,255,0.6)' : 'rgba(0,0,0,0.55)'

	return (
		<TouchableOpacity onPress={onPress} activeOpacity={0.7} style={styles.tabButton}>
			<View style={styles.tabIconContainer}>
				{tab.icon(active ? activeColor : inactiveColor, active)}
			</View>
			<Text
				style={[
					styles.tabLabel,
					{
						color: active ? activeColor : inactiveColor,
						fontSize: 10,
						fontWeight: active ? '700' : '600',
					},
				]}
				numberOfLines={1}
			>
				{tab.label}
			</Text>
		</TouchableOpacity>
	)
}

// ========== 滑动指示器（纯灰色胶囊背景） ==========
const SlidingPill = ({
	translateX,
	width,
	isLiquidGlass = false,
}: {
	translateX: Animated.SharedValue<number>
	width: Animated.SharedValue<number>
	isLiquidGlass?: boolean
}) => {
	const { isDark } = useAppTheme()
	const animatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: translateX.value }],
		width: width.value,
	}))

	return (
		<Animated.View
			style={[
				styles.slidingPill,
				{
					borderRadius: 26,
					backgroundColor: isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.10)',
				},
				animatedStyle,
			]}
		/>
	)
}

// ========== 主组件：Kumone 风格玻璃底部栏 ==========
export const KumoneGlassTabBar = ({ isLiquidGlass = false }: { isLiquidGlass?: boolean }) => {
	// iOS 26 以下直接使用悬浮胶囊样式
	const iosVersion = parseFloat(Platform.Version as string)
	if (iosVersion < 26) {
		return <FloatingPillDock />
	}

	const { bottom } = useSafeAreaInsets()
	const { colors } = useAppTheme()
	const router = useRouter()
	const pathname = usePathname()

	const tabBarWidth = useSharedValue(0)
	const pillTranslateX = useSharedValue(0)
	const pillWidth = useSharedValue(0)
	const lastValidIndex = useRef(0)
	const isDragging = useRef(false)
	const startX = useSharedValue(0)
	const startTranslateX = useSharedValue(0)

	// 计算当前有效的 active index：非tab页面（如播放器）保持上次选中状态
	const currentTabIndex = getActiveTabIndex(pathname)
	const effectiveActiveIndex = currentTabIndex >= 0 ? currentTabIndex : lastValidIndex.current

	const containerStyle = useMemo(
		() => ({ paddingBottom: bottom - 17 }),
		[bottom],
	)

	const navigateToTab = useCallback(
		(tabName: string) => {
			if (tabName === '(songs)') {
				router.navigate('/')
			} else {
				router.navigate(`/${tabName}`)
			}
		},
		[router],
	)

	const handleTabPress = useCallback(
		(index: number) => {
			const tab = NAV_TABS[index]
			navigateToTab(tab.name)
			if (tabBarWidth.value <= 0) return
			const cellW = tabBarWidth.value / NAV_TABS.length
			lastValidIndex.current = index
			isDragging.current = false
			pillTranslateX.value = withSpring(index * cellW + 4, {
				damping: 22,
				stiffness: 220,
			})
		},
		[tabBarWidth, pillTranslateX, navigateToTab],
	)

	const handleMiniPlayerPress = useCallback(() => {
		router.navigate('/player')
	}, [router])

	const handleLayout = useCallback(
		(e: any) => {
			const width = e.nativeEvent.layout.width
			if (width <= 0) return
			tabBarWidth.value = width
			const cellW = width / NAV_TABS.length
			pillWidth.value = cellW - 8
			const currentIndex = getActiveTabIndex(pathname)
			if (currentIndex >= 0) {
				lastValidIndex.current = currentIndex
				pillTranslateX.value = currentIndex * cellW + 4
			} else {
				pillTranslateX.value = lastValidIndex.current * cellW + 4
			}
		},
		[tabBarWidth, pillWidth, pillTranslateX, pathname],
	)

	// 路由变化时更新 pill 位置
	useEffect(() => {
		if (isDragging.current) return
		if (tabBarWidth.value <= 0) return
		const currentIndex = getActiveTabIndex(pathname)
		if (currentIndex < 0) return // 非tab页面（如播放器）保持上次位置
		const cellW = tabBarWidth.value / NAV_TABS.length
		lastValidIndex.current = currentIndex
		pillTranslateX.value = withSpring(currentIndex * cellW + 4, {
			damping: 22,
			stiffness: 220,
		})
	}, [pathname, tabBarWidth, pillTranslateX])

	// 拖动手势（Kumone 风格：手指拖动 pill 实时切换）
	const panGesture = useMemo(
		() =>
			Gesture.Pan()
				.minDistance(8)
				.onStart((event) => {
					isDragging.current = true
					startX.value = event.x
					startTranslateX.value = pillTranslateX.value
				})
				.onUpdate((event) => {
					if (tabBarWidth.value <= 0) return
					const cellW = tabBarWidth.value / NAV_TABS.length
					const minX = 4
					const maxX = (NAV_TABS.length - 1) * cellW + 4
					// 使用绝对位置差值，pill 完全跟随手指
					let newX = startTranslateX.value + (event.x - startX.value)
					newX = Math.max(minX, Math.min(maxX, newX))
					pillTranslateX.value = newX







				})
				.onEnd(() => {
					if (tabBarWidth.value <= 0) {
						isDragging.current = false
						return
					}
					const cellW = tabBarWidth.value / NAV_TABS.length
					const currentX = pillTranslateX.value
					let newIndex = Math.round((currentX - 4) / cellW)
					newIndex = Math.max(0, Math.min(NAV_TABS.length - 1, newIndex))
					lastValidIndex.current = newIndex
					runOnJS(navigateToTab)(NAV_TABS[newIndex].name)
					pillTranslateX.value = withSpring(newIndex * cellW + 4, {
						damping: 22,
						stiffness: 220,
					})
				}),
		[tabBarWidth, pillTranslateX, navigateToTab, startX, startTranslateX],
	)

	// dock隐藏动画
	const isHidden = useDockHideStore((s) => s.isHidden)
	const dockHideProgress = useSharedValue(0)
	useEffect(() => {
		dockHideProgress.value = withTiming(isHidden ? 1 : 0, { duration: 280 })
	}, [isHidden])
	const dockHideAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: dockHideProgress.value * 80 }],
		opacity: 1 - dockHideProgress.value,
	}))
	const miniPlayerHideAnimatedStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: dockHideProgress.value * 60 }],
	}))

	return (
		<View style={[styles.container, containerStyle]} pointerEvents="box-none">
			{/* 迷你播放条 */}
			<Animated.View style={[styles.miniPlayerWrapper, miniPlayerHideAnimatedStyle]}>
				<MiniPlayerBar onPress={handleMiniPlayerPress} isLiquidGlass={isLiquidGlass} />
			</Animated.View>

			{/* 玻璃 Tab Bar */}
			<Animated.View style={[styles.tabBarWrapper, dockHideAnimatedStyle]}>
				<GestureDetector gesture={panGesture}>
					<View
						style={[
							styles.tabBarContainer,
							{ height: TAB_BAR_HEIGHT + TAB_BAR_INSET * 2, borderRadius: (TAB_BAR_HEIGHT + TAB_BAR_INSET * 2) / 2 },
						]}
						onLayout={handleLayout}
					>
						{/* 毛玻璃背景 */}
						<GlassBackground intensity={isLiquidGlass ? 70 : 30} borderRadius={(TAB_BAR_HEIGHT + TAB_BAR_INSET * 2) / 2} isLiquidGlass={isLiquidGlass} />

						{/* 滑动指示器 */}
						<SlidingPill translateX={pillTranslateX} width={pillWidth} isLiquidGlass={isLiquidGlass} />

						{/* Tab 按钮 */}
						<View style={styles.tabsRow}>
							{NAV_TABS.map((tab, index) => (
								<TabButton
									key={tab.name}
									tab={tab}
									active={effectiveActiveIndex === index}
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

// ========== 样式 ==========
const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 100,
	},
	miniPlayerWrapper: {
		paddingHorizontal: HORIZONTAL_PADDING,
		marginBottom: ELEMENT_GAP,
	},
	miniPlayerContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 8,
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.12,
		shadowRadius: 10,
		elevation: 8,
	},
	miniPlayerContent: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
	},
	miniPlayerCover: {
		marginLeft: 4,
	},
	miniPlayerTextContainer: {
		flex: 1,
		marginLeft: 10,
		marginRight: 8,
		justifyContent: 'center',
	},
	miniPlayerTitle: {
		fontSize: 14,
		fontWeight: '500',
	},
	miniPlayerArtist: {
		fontSize: 11.5,
		fontWeight: '500',
		marginTop: 2,
	},
	miniPlayerButtons: {
		flexDirection: 'row',
		alignItems: 'center',
		marginRight: 6,
	},
	playButton: {
		alignItems: 'center',
		justifyContent: 'center',
	},
	nextButton: {
		width: 34,
		height: 34,
		alignItems: 'center',
		justifyContent: 'center',
		marginLeft: 2,
	},
	miniPlayerPlaceholder: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	miniPlayerPlaceholderText: {
		fontSize: 14,
		fontWeight: '500',
	},
	tabBarWrapper: {
		paddingHorizontal: HORIZONTAL_PADDING,
	},
	tabBarContainer: {
		position: 'relative',
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.15,
		shadowRadius: 12,
		elevation: 10,
	},
	tabsRow: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		zIndex: 10,
	},
	tabButton: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 4,
	},
	tabIconContainer: {
		height: 26,
		alignItems: 'center',
		justifyContent: 'center',
	},
	tabLabel: {
		marginTop: 2,
	},
	slidingPill: {
		position: 'absolute',
		top: TAB_BAR_INSET,
		bottom: TAB_BAR_INSET,
		left: 0,
		zIndex: 5,
		overflow: 'hidden',
	},
})
