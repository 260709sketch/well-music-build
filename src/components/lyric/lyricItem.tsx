/**
 * 单行歌词（Kumone 风格）
 * - 当前行：高亮、大字、bold、完全不透明
 * - 非当前行：浅灰色、opacity 0.7、稍小字号（Kumone 的 blur 0.3 极轻微，主要靠 opacity）
 * - 点击跳转到对应时间
 */
import React, { memo, useEffect, useRef } from 'react'
import { Animated, Pressable, Text } from 'react-native'
import { useThemeColors } from '@/hooks/useAppTheme'
import rpx from '../../utils/rpx'
import KaraokeLine from './KaraokeLine'

interface LyricItemProps {
	index: number
	text: string
	fontSize: number
	onLayout: (index: number, height: number) => void
	onPress: () => void
	highlight?: boolean
	light?: boolean
	words?: any[]
	position?: number
}

function LyricItemComponent({
	index,
	text,
	fontSize,
	onLayout,
	onPress,
	highlight,
	light,
	words,
}: LyricItemProps) {
	const colors = useThemeColors()
	const lineHeight = Math.round(fontSize * 1.4)
	const showKaraoke = !!highlight && Array.isArray(words) && words.length > 0

	// Kumone 风格：当前行 1.0，非当前行 0.7（浅灰清晰可见）
	const opacityAnim = useRef(new Animated.Value(highlight ? 1 : 0.7)).current
	const scaleAnim = useRef(new Animated.Value(highlight ? 1 : 0.98)).current

	useEffect(() => {
		Animated.timing(opacityAnim, {
			toValue: highlight ? 1 : light ? 0.85 : 0.7,
			duration: 300,
			useNativeDriver: true,
		}).start()
		Animated.timing(scaleAnim, {
			toValue: highlight ? 1 : 0.98,
			duration: 300,
			useNativeDriver: true,
		}).start()
	}, [highlight, light, opacityAnim, scaleAnim])

	return (
		<Pressable
			onPress={onPress}
			style={{ paddingHorizontal: rpx(48), paddingVertical: rpx(5), width: '100%' }}
		>
			<Animated.View
				style={{
					opacity: opacityAnim,
					transform: [{ scale: scaleAnim }],
					width: '100%',
				}}
			>
				{showKaraoke ? (
					<KaraokeLine
						words={words}
						fontSize={fontSize}
						color={colors.text}
						align="center"
						fontWeight="800"
						lineHeight={lineHeight}
						index={index}
						onLayout={onLayout}
					/>
				) : (
					<Text
						onLayout={({ nativeEvent }) => onLayout(index, nativeEvent.layout.height)}
						style={{
							width: '100%',
							textAlign: 'center',
							color: colors.text,
							fontSize: highlight ? fontSize + 2 : fontSize,
							lineHeight,
							fontWeight: highlight ? '800' : '500',
						}}
					>
						{text}
					</Text>
				)}
			</Animated.View>
		</Pressable>
	)
}

export default memo(LyricItemComponent)
