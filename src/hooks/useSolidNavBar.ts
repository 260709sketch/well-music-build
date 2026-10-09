import { useEffect, useState } from 'react'
import PersistStatus from '@/store/PersistStatus'

const KEY = 'app.solidNavBar' as any

/**
 * 纯色导航栏开关：
 * - true: 导航栏纯白（浅色）/纯黑（深色），不透明
 * - false: 导航栏毛玻璃透明（默认）
 */
export const useSolidNavBar = () => {
	const [enabled, setEnabled] = useState<boolean>(() => PersistStatus.get(KEY) === true)

	useEffect(() => {
		PersistStatus.set(KEY, enabled)
	}, [enabled])

	return { solidNavBarEnabled: enabled, setSolidNavBarEnabled: setEnabled }
}

/**
 * 根据当前设置返回导航栏配置
 * @param isDark 是否深色模式
 * @param solid 是否纯色导航栏
 */
export const getNavBarOptions = (isDark: boolean, solid: boolean) => {
	if (solid) {
		return {
			headerTransparent: false,
			headerStyle: {
				backgroundColor: isDark ? '#000000' : '#FFFFFF',
			},
			headerShadowVisible: false,
		}
	}
	return {
		headerTransparent: true,
		headerBlurEffect: 'systemMaterial' as const,
		headerStyle: {
			backgroundColor: 'transparent',
		},
		headerShadowVisible: false,
	}
}
