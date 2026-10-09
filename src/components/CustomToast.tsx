/**
 * 对齐 Kumone ToastView + WellMusic Dock 毛玻璃材质：
 * - iOS systemUltraThinMaterial 毛玻璃（expo-blur 实现）
 * - 高模糊强度 + 半透明底色叠加，确保文字清晰
 * - 圆角 10
 * - 字号 12.5, weight .medium
 * - padding horizontal 16, vertical 9
 * - 阴影 black opacity 0.15, radius 8, y 4
 * - 顶部 8pt，3 秒自动消失
 */
import React from 'react'
import { Text, View } from 'react-native'
import { BlurView } from 'expo-blur'

export const CustomToast = (props: any) => {
	const { text1, text2, isDark = true } = props

	// 文字颜色对齐 Kumone（primary color）
	const titleColor = isDark ? '#fff' : '#000'
	const subColor = isDark ? 'rgba(255,255,255,0.65)' : 'rgba(0,0,0,0.6)'

	return (
		<View
			style={{
				alignSelf: 'center',
				borderRadius: 10,
				overflow: 'hidden',
				shadowColor: '#000',
				shadowOffset: { width: 0, height: 4 },
				shadowOpacity: 0.15,
				shadowRadius: 8,
				elevation: 4,
			}}
		>
			{/* 毛玻璃层：高模糊强度，对齐 Dock 栏 systemUltraThinMaterial */}
			<BlurView
				intensity={100}
				tint={isDark ? 'dark' : 'light'}
				style={{
					paddingHorizontal: 16,
					paddingVertical: 9,
					// 半透明底色叠加，确保文字在复杂背景上清晰可读
					backgroundColor: isDark ? 'rgba(0,0,0,0.35)' : 'rgba(255,255,255,0.45)',
				}}
			>
				<Text
					style={{ fontSize: 12.5, fontWeight: '500', color: titleColor, textAlign: 'center' }}
					numberOfLines={1}
				>
					{text1}
				</Text>
				{text2 ? (
					<Text
						style={{ fontSize: 11, color: subColor, textAlign: 'center', marginTop: 3 }}
						numberOfLines={2}
					>
						{text2}
					</Text>
				) : null}
			</BlurView>
		</View>
	)
}
