import { getStackScreenWithSearchBar } from '@/constants/layout'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useDefaultStyles } from '@/styles'
import i18n, { nowLanguage } from '@/utils/i18n'
import { useTitleLanguageStore } from '@/store/titleLanguageStore'
import { Stack } from 'expo-router'
import { View } from 'react-native'

const SearchScreenLayout = () => {
	const language = nowLanguage.useValue()
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const chineseTitleEnabled = useTitleLanguageStore((s) => s.chineseTitleEnabled)
	return (
		<View style={defaultStyles.container} key={language}>
			<Stack>
				<Stack.Screen
					name="index"
					options={{
						...getStackScreenWithSearchBar(colors),
						headerTitle: chineseTitleEnabled ? '搜索' : 'Search',
					}}
				/>
				<Stack.Screen
					name="[name]"
					options={{
						headerTitle: '',
						headerBackVisible: true,
						headerStyle: {
							backgroundColor: colors.background,
						},
						headerTintColor: colors.primary,
					}}
				/>
			</Stack>
		</View>
	)
}

export default SearchScreenLayout
