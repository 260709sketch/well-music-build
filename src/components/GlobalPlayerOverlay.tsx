import React, { useEffect } from 'react'
import { Dimensions, StyleSheet, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated'
import { router } from 'expo-router'
import { usePlayerOverlayStore } from '@/store/playerOverlayStore'
import { PlayerBody } from '@/app/player'

const SCREEN_H = Dimensions.get('window').height

/**
 * 全局常驻的播放器 overlay：PlayerBody（含 AMLL 引擎 WebView）永久挂载，
 * 引擎只加载一次 → 进入播放器秒开。
 * - 打开：从底部 spring 弹出；
 * - 关闭：上滑或下滑拖走即退出（拖动跟手，超过阈值/速度快才关闭，否则回弹）；
 * - 未打开：屏幕外 + 不拦截触摸，且引擎由 AMLLLyrics 切入低性能运行。
 * 手势只在 open 时挂载，避免常驻手势干扰其它页面。
 */
export const GlobalPlayerOverlay = () => {
	const open = usePlayerOverlayStore((s) => s.open)
	const setOpen = usePlayerOverlayStore((s) => s.setOpen)

	const slideY = useSharedValue(SCREEN_H)

	useEffect(() => {
		if (open) {
			slideY.value = withSpring(0, { damping: 34, stiffness: 300, mass: 1 })
		} else {
			slideY.value = withTiming(SCREEN_H, { duration: 240 })
		}
	}, [open, slideY])

	const doClose = () => {
		setOpen(false)
		try {
			router.back()
		} catch {}
	}

	const pan = Gesture.Pan()
		.maxPointers(1)
		.activeOffsetY([-50, 50])
		.runOnJS(true)
		.onUpdate((e) => {
			const ty = e.translationY
			// 下滑跟手、上滑减阻尼（避免极轻上滑误关）
			slideY.value = ty > 0 ? ty : ty * 0.4
		})
		.onEnd((e) => {
			const goUp = e.translationY < 0
			const dist = Math.abs(e.translationY)
			const speed = Math.abs(e.velocityY)
			if (dist > SCREEN_H * 0.18 || speed > 900) {
				slideY.value = withTiming(goUp ? -SCREEN_H : SCREEN_H, { duration: 220 })
				setTimeout(() => runOnJS(doClose)(), 230)
			} else {
				slideY.value = withSpring(0, { damping: 34, stiffness: 300 })
			}
		})

	const animStyle = useAnimatedStyle(() => ({
		transform: [{ translateY: slideY.value }],
		opacity: 1 - Math.min(Math.abs(slideY.value) / SCREEN_H, 1) * 0.7,
	}))

	return (
		<View pointerEvents={open ? 'auto' : 'none'} style={styles.wrap}>
			<Animated.View style={[styles.surface, animStyle]}>
				{open ? (
					<GestureDetector gesture={pan}>
						<PlayerBody />
					</GestureDetector>
				) : (
					<PlayerBody />
				)}
			</Animated.View>
		</View>
	)
}

const styles = StyleSheet.create({
	wrap: {
		...StyleSheet.absoluteFillObject,
		zIndex: 9999,
		backgroundColor: 'transparent',
	},
	surface: {
		flex: 1,
		backgroundColor: '#000',
	},
})