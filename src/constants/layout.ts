import { NativeStackNavigationOptions } from '@react-navigation/native-stack'
import { ThemeColors } from './tokens'
import PersistStatus from '@/store/PersistStatus'

export const getStackScreenWithSearchBar = (
	colors: ThemeColors,
): NativeStackNavigationOptions => {
	const solidNavBar = PersistStatus.get('app.solidNavBar' as any) === true

	if (solidNavBar) {
		// 纯色导航栏：不透明，背景色跟随主题
		return {
			headerLargeTitle: true,
			headerTransparent: false,
			headerBlurEffect: undefined,
			headerStyle: {
				backgroundColor: colors.background,
			},
			headerLargeStyle: {
				backgroundColor: colors.background,
			},
			headerLargeTitleStyle: {
				color: colors.text,
				fontSize: 34,
				fontWeight: '500',
			},
			headerTintColor: colors.text,
			headerShadowVisible: false,
		}
	}

	// 毛玻璃导航栏（默认）
	return {
		headerLargeTitle: true,
		// Apple Music 式原生毛玻璃：大标题展开时用纯白底色（与子页 header 一致，push 转场不闪），
		// 滚动到紧凑小标题态时原生 UIVisualEffectView 叠上系统毛玻璃。
		// 全部静态配置，绝不做 JS 动态 setOptions 切换，避免原生 header 重建引发闪烁。
		headerTransparent: true,
		headerBlurEffect: 'systemMaterial',
		headerStyle: {
			backgroundColor: 'transparent',
		},
		headerLargeStyle: {
			backgroundColor: colors.background,
		},
		headerLargeTitleStyle: {
			color: colors.text,
			fontSize: 34,
			fontWeight: '500',
		},
		headerTintColor: colors.text,
		headerShadowVisible: false,
	}
}
