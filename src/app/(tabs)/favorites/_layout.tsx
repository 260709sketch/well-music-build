import AddPlayListButton from '@/components/AddPlayListButton'
import { getStackScreenWithSearchBar } from '@/constants/layout'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import PersistStatus from '@/store/PersistStatus'
import { useDefaultStyles } from '@/styles'
import i18n, { nowLanguage } from '@/utils/i18n'
import { useTitleLanguageStore } from '@/store/titleLanguageStore'
import { Stack } from 'expo-router'
import { View } from 'react-native'
const FavoritesScreenLayout = () => {
	const language = nowLanguage.useValue()
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const solidNavBar = PersistStatus.get('app.solidNavBar' as any) === true
	const defaultStyles = useDefaultStyles()
	const chineseTitleEnabled = useTitleLanguageStore((s) => s.chineseTitleEnabled)
	return (
		<View style={defaultStyles.container} key={language}>
			<Stack>
					<Stack.Screen
						name="index"
						options={{
							...getStackScreenWithSearchBar(colors),
							headerTitle: chineseTitleEnabled ? '音乐库' : i18n.t('appTab.favorites'),
							// headerRight: () => <AddPlayListButton />,
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
							backgroundColor: solidNavBar ? (isDark ? '#000' : '#fff') : (isDark ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.75)'),
						},
						headerShadowVisible: false,
						headerTintColor: colors.primary,
					}}
				/>
				<Stack.Screen
					name="favoriteMusic"
					options={{
						headerTitle: '',
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
				<Stack.Screen
					name="playHistory"
					options={{
						headerTitle: '',
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

export default FavoritesScreenLayout
