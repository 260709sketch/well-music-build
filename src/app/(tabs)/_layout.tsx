import { AutoAdaptiveDock } from '@/components/AutoAdaptiveDock'
import SFSymbol from '@/components/SFSymbol'
import { FloatingPillDock } from '@/components/FloatingPillDock'
import SystemNativeTabBar, { isIOS26OrAbove } from '@/components/SystemNativeTabBar'
import { useAppTheme } from '@/hooks/useAppTheme'
import { useTabBarStyleStore } from '@/store/tabBarStyleStore'
import { useDockHideStore } from '@/store/dockHideStore'
import i18n from '@/utils/i18n'
import { FontAwesome, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { Tabs, usePathname } from 'expo-router'
import React, { useEffect, useRef } from 'react'
import { View } from 'react-native'

// 判断是否为详情页（需要隐藏dock栏）—— 只处理tab内详情页，modal歌手/专辑页保持原样
const isDetailPage = (pathname: string): boolean => {
	// 播放器路由不改变状态
	if (pathname === '/player') return false
	// 主tab页面
	const mainRoutes = ['/radio', '/favorites', '/search', '/profile', '/']
	if (mainRoutes.includes(pathname)) return false
	// tab内详情页：歌单、历史、收藏歌曲、排行榜、搜索结果
	if (pathname.startsWith('/favorites/')) return true
	if (pathname.startsWith('/search/')) return true
	if (pathname.startsWith('/radio/')) return true
	if (pathname.startsWith('/profile/')) return true
	// modal歌手/专辑页不处理（保持原样全屏覆盖）
	return false
}

const TabsNavigation = () => {
	const { colors } = useAppTheme()
	const { tabBarStyle } = useTabBarStyleStore()
	const pathname = usePathname()
	const hideTimer = useRef<NodeJS.Timeout | null>(null)

	// 只有tab页面的路由才改变dock状态
	// /player和歌手/专辑等modal页不改变状态，避免返回时dock闪烁
	const isTabRoute = (p: string): boolean => {
		return p.startsWith('/radio') || p.startsWith('/favorites') ||
			p.startsWith('/search') ||
			p.startsWith('/profile') || p === '/'
	}

	useEffect(() => {
		// 非tab路由（播放器、歌手页、专辑页等）不改变dock状态
		if (!isTabRoute(pathname)) return
		if (hideTimer.current) clearTimeout(hideTimer.current)
		hideTimer.current = setTimeout(() => {
			const hidden = isDetailPage(pathname)
			useDockHideStore.getState().setHidden(hidden)
		}, 30)
		return () => {
			if (hideTimer.current) clearTimeout(hideTimer.current)
		}
	}, [pathname])

	return (
		<View style={{ flex: 1, backgroundColor: colors.background }}>
			{/* 底部安全区遮罩，放在dock后面防止透出 */}
			<View style={{
				position: 'absolute',
				bottom: 0,
				left: 0,
				right: 0,
				height: 34,
				backgroundColor: colors.background,
			}} />
			<Tabs
				screenOptions={{
					tabBarActiveTintColor: colors.primary,
					tabBarInactiveTintColor: colors.textMuted,
					headerShown: false,
					tabBar: () => null,
					tabBarStyle: { display: 'none' },
					tabBarItemStyle: { display: 'none' },
				}}
			>
				<Tabs.Screen
					name="radio"
					options={{
						title: '首页',
						tabBarIcon: ({ color }) => <SFSymbol systemName="house" size={24} color={color} />,
					}}
				/>
				<Tabs.Screen
					name="favorites"
					options={{
						title: i18n.t('appTab.favorites'),
						tabBarIcon: ({ color }) => <FontAwesome name="heart" size={20} color={color} />,
					}}
				/>
				<Tabs.Screen
					name="search"
					options={{
						title: i18n.t('appTab.search'),
						tabBarIcon: ({ color }) => (
							<MaterialCommunityIcons name="text-search" size={26} color={color} />
						),
					}}
				/>
				<Tabs.Screen
					name="profile"
					options={{
						title: '我的',
						tabBarIcon: ({ color }) => <SFSymbol systemName="person" size={23} color={color} />,
					}}
				/>
			</Tabs>
			{/* 底部栏：iOS 26+ 系统原生液态玻璃 / iOS 26 以下自定义浮动胶囊 */}
			{isIOS26OrAbove()
				? <SystemNativeTabBar />
				: (tabBarStyle === 'floating-pill' ? <FloatingPillDock /> : <AutoAdaptiveDock />)}
		</View>
	)
}

export default TabsNavigation
