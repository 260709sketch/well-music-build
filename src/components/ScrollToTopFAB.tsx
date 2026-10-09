/**
 * 一键回到顶部悬浮按钮
 *
 * 交互（Safari 工具栏同款方向感知）：
 * - 滚动距离未超过阈值：始终隐藏；
 * - 超过阈值后，手指"上滑一点"（内容向下、往回翻）按钮出现；
 * - 继续"下滑"（内容向上、往下翻）按钮隐藏；
 * - 点击平滑滚回顶部并自动隐藏。
 *
 * 外观：深色模式 = 深墨绿半透明底 + 淡墨绿描边 + 薄荷绿箭头；
 *       浅色模式 = 浅灰底 + 淡灰描边 + 深灰箭头。
 */
import React, { useCallback, useRef, useState } from 'react'
import SFSymbol from '@/components/SFSymbol'
import { Animated, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAppTheme } from '@/hooks/useAppTheme'

export const SCROLL_FAB_SIZE = 48
const DEFAULT_THRESHOLD = 320
const DIR_DELTA = 8

type ScrollableLike = {
	scrollToOffset?: (options: { offset: number; animated?: boolean }) => void
	scrollTo?: (options: { x?: number; y?: number; animated?: boolean }) => void
} | null

export function useScrollToTop(
	scrollRef: React.MutableRefObject<ScrollableLike>,
	threshold: number = DEFAULT_THRESHOLD,
	topOffset: number = 0,
) {
	const progress = useRef(new Animated.Value(0)).current
	const [shown, setShownState] = useState(false)
	const shownRef = useRef(false)
	const lastY = useRef(0)
	const primed = useRef(false)
	const scrollingToTop = useRef(false)

	const setShown = useCallback(
		(next: boolean) => {
			if (shownRef.current === next) return
			shownRef.current = next
			setShownState(next)
			Animated.timing(progress, {
				toValue: next ? 1 : 0,
				duration: 200,
				useNativeDriver: true,
			}).start()
		},
		[progress],
	)

	const onScroll = useCallback(
		(event: any) => {
			const y: number = event?.nativeEvent?.contentOffset?.y ?? 0
			if (!primed.current) {
				primed.current = true
				lastY.current = y
				return
			}
			// 回顶动画过程中不做方向感知，避免 FAB 反复显隐
			if (scrollingToTop.current) {
				if (y <= threshold) {
					scrollingToTop.current = false
					setShown(false)
				}
				lastY.current = y
				return
			}
			const delta = y - lastY.current
			if (y <= threshold) {
				setShown(false)
			} else if (delta < -DIR_DELTA) {
				setShown(true)
			} else if (delta > DIR_DELTA) {
				setShown(false)
			}
			lastY.current = y
		},
		[threshold, setShown],
	)

	const scrollToTop = useCallback(() => {
		setShown(false)
		scrollingToTop.current = true
		const ref = scrollRef.current
		if (!ref) return
		try {
			if (typeof ref.scrollToOffset === 'function') {
				ref.scrollToOffset({ offset: 0, animated: true })
			} else if (typeof ref.scrollTo === 'function') {
				ref.scrollTo({ y: topOffset, animated: true })
			}
		} catch (e) {
			// 忽略滚动异常
		}
	}, [scrollRef, setShown, topOffset])

	return { onScroll, scrollToTop, progress, shown }
}

interface FABProps {
	progress: Animated.Value
	shown: boolean
	onPress: () => void
	bottom: number
	right?: number
}

export function ScrollToTopFAB({ progress, shown, onPress, bottom, right = 16 }: FABProps) {
	const { isDark } = useAppTheme()
	const opacity = progress.interpolate({ inputRange: [0, 1], outputRange: [0, 1] })
	const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [18, 0] })
	const bgColor = isDark ? 'rgba(18,24,23,0.86)' : 'rgba(245,245,245,0.92)'
	const borderColor = isDark ? 'rgba(132,180,166,0.32)' : 'rgba(0,0,0,0.08)'
	const arrowColor = isDark ? '#92D2BE' : '#888888'
	const shadowColor = isDark ? '#000' : '#000'
	const shadowOpacity = isDark ? 0.35 : 0.15
	return (
		<Animated.View
			pointerEvents={shown ? 'auto' : 'none'}
			style={[styles.wrap, { bottom, right, backgroundColor: 'transparent' }, { opacity, transform: [{ translateY }] }]}
		>
			<TouchableOpacity
				activeOpacity={0.7}
				onPress={onPress}
				style={[styles.button, { backgroundColor: bgColor, borderColor, shadowColor, shadowOpacity }]}
			>
				<SFSymbol systemName="arrow.up" size={22} color={arrowColor} />
			</TouchableOpacity>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	wrap: {
		position: 'absolute',
		zIndex: 50,
		elevation: 12,
	},
	button: {
		width: SCROLL_FAB_SIZE,
		height: SCROLL_FAB_SIZE,
		borderRadius: SCROLL_FAB_SIZE / 2,
		borderWidth: 1,
		alignItems: 'center',
		justifyContent: 'center',
		shadowOffset: { width: 0, height: 4 },
		shadowRadius: 10,
	},
})
