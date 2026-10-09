import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Animated, StyleSheet, useColorScheme } from 'react-native'
import React from 'react'

/**
 * 顶部导航栏毛玻璃：跟随滚动渐显（Apple Music 风格）
 * - 初始（scrollY <= 0）：完全透明，看不到毛玻璃
 * - 下滑时：毛玻璃渐显
 * - 用法：放在页面最外层，绝对定位在顶部
 */
export const NavigationBarBlur: React.FC<{ scrollY: Animated.Value; intensity?: number }> = ({
	scrollY,
	intensity = 40,
}) => {
	const insets = useSafeAreaInsets()
	const colorScheme = useColorScheme()
	// 紧凑导航栏高度约 44pt + 安全区顶部
	const barHeight = insets.top + 44

	const opacity = scrollY.interpolate({
		inputRange: [0, 30],
		outputRange: [0, 1],
		extrapolate: 'clamp',
	})

	return (
		<Animated.View
			style={[
				styles.container,
				{
					height: barHeight,
					opacity,
				},
			]}
			pointerEvents="none"
		>
			<BlurView
				intensity={intensity}
				tint={colorScheme === 'dark' ? 'dark' : 'light'}
				style={StyleSheet.absoluteFill}
			/>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	container: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		zIndex: 100,
	},
})
