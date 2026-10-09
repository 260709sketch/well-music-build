import { getStackScreenWithSearchBar } from '@/constants/layout'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import { useSolidNavBar } from '@/hooks/useSolidNavBar'
import { useDefaultStyles } from '@/styles'
import { Stack } from 'expo-router'
import { View } from 'react-native'

const ProfileScreenLayout = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { solidNavBarEnabled } = useSolidNavBar()
	const defaultStyles = useDefaultStyles()
	return (
		<View style={defaultStyles.container}>
			<Stack
				screenOptions={{
					contentStyle: { backgroundColor: colors.background },
				}}
			>
				{/* 我的：与音乐库一致的 iOS 原生大标题头部 */}
				<Stack.Screen
					name="index"
					options={{
						...getStackScreenWithSearchBar(colors),
						title: '我的',
					}}
				/>
				{/* 听歌排行：与历史播放一致的原生详情头（仅返回键，push/pop 与外层大标题联动） */}
				<Stack.Screen
					name="record"
					options={{
						headerTitle: '',
						headerBackVisible: true,
						headerTransparent: solidNavBarEnabled ? false : true,
						headerBlurEffect: solidNavBarEnabled ? undefined : 'systemMaterial',
						headerStyle: {
							backgroundColor: solidNavBarEnabled ? (isDark ? '#000' : '#fff') : 'transparent',
						},
						headerTintColor: colors.primary,
						headerShadowVisible: false,
					}}
				/>
				{/* 收藏歌曲：与听歌排行一致的原生详情头（从「我的」进入可正常返回） */}
				<Stack.Screen
					name="favoriteMusic"
					options={{
						headerTitle: '',
						headerBackVisible: true,
						headerTransparent: solidNavBarEnabled ? false : true,
						headerBlurEffect: solidNavBarEnabled ? undefined : 'systemMaterial',
						headerStyle: {
							backgroundColor: solidNavBarEnabled ? (isDark ? '#000' : '#fff') : 'transparent',
						},
						headerTintColor: colors.primary,
						headerShadowVisible: false,
					}}
				/>
				{/* 播放历史：与听歌排行一致的原生详情头 */}
				<Stack.Screen
					name="playHistory"
					options={{
						headerTitle: '',
						headerBackVisible: true,
						headerTransparent: solidNavBarEnabled ? false : true,
						headerBlurEffect: solidNavBarEnabled ? undefined : 'systemMaterial',
						headerStyle: {
							backgroundColor: solidNavBarEnabled ? (isDark ? '#000' : '#fff') : 'transparent',
						},
						headerTintColor: colors.primary,
						headerShadowVisible: false,
					}}
				/>
			</Stack>
		</View>
	)
}

export default ProfileScreenLayout
