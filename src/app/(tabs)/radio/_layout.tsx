import { getStackScreenWithSearchBar } from '@/constants/layout'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import PersistStatus from '@/store/PersistStatus'
import { useDefaultStyles } from '@/styles'
import i18n, { nowLanguage } from '@/utils/i18n'
import { Stack } from 'expo-router'
import { View } from 'react-native'
const RadiolistsScreenLayout = () => {
	const language = nowLanguage.useValue()
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const solidNavBar = PersistStatus.get('app.solidNavBar' as any) === true
	const defaultStyles = useDefaultStyles()
	return (
		<View style={defaultStyles.container} key={language}>
			<Stack>
				<Stack.Screen
					name="index"
					options={{
						...getStackScreenWithSearchBar(colors),
					headerTitle: '发现',
					
					
					}}
				/>
				<Stack.Screen
					name="[name]"
					options={{
						headerTitle: '',
						headerBackVisible: true,
						headerTransparent: solidNavBar ? false : true,
						headerBlurEffect: solidNavBar ? undefined : 'systemMaterial',
						headerStyle: {
							backgroundColor: solidNavBar ? (isDark ? '#000' : '#fff') : 'transparent',
						},
						headerShadowVisible: false,
						headerTintColor: colors.primary,
					}}
				/>
				<Stack.Screen
					name="dailySongs"
					options={{
						headerTitle: '',
						headerBackTitle: '发现',
						headerBackVisible: true,
						headerTransparent: solidNavBar ? false : true,
						headerBlurEffect: solidNavBar ? undefined : 'systemMaterial',
						headerStyle: {
							backgroundColor: solidNavBar ? (isDark ? '#000' : '#fff') : 'transparent',
							borderBottomWidth: 0,
						},
						headerTintColor: colors.primary,
					}}
				/>
			</Stack>
		</View>
	)
}

export default RadiolistsScreenLayout
