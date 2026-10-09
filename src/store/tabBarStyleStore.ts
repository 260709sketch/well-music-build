// 底部状态栏样式设置
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type TabBarStyle = 'auto' | 'floating-pill'

// dock 栏与迷你播放器背景模糊程度
export type DockBlurLevel = 'default' | 'off' | 'low' | 'medium' | 'high'

export const DOCK_BLUR_LEVEL_LABELS: Record<DockBlurLevel, string> = {
	default: '默认',
	off: '关闭模糊',
	low: '低',
	medium: '中',
	high: '高',
}

/**
 * 根据模糊等级计算 BlurView intensity
 * default 即当前 App 默认值（暗色 72 / 亮色 64）
 */
export function resolveDockBlurIntensity(level: DockBlurLevel, isDark: boolean): number {
	switch (level) {
		case 'off': return 0
		case 'low': return isDark ? 40 : 34
		case 'medium': return isDark ? 60 : 54
		case 'high': return isDark ? 96 : 86
		case 'default':
		default: return isDark ? 72 : 64
	}
}

interface TabBarStyleState {
	tabBarStyle: TabBarStyle
	setTabBarStyle: (style: TabBarStyle) => void
	dockBlurLevel: DockBlurLevel
	setDockBlurLevel: (level: DockBlurLevel) => void
}

export const useTabBarStyleStore = create<TabBarStyleState>()(
	persist(
		(set) => ({
			tabBarStyle: 'auto',
			setTabBarStyle: (style) => set({ tabBarStyle: style }),
			dockBlurLevel: 'default',
			setDockBlurLevel: (level) => set({ dockBlurLevel: level }),
		}),
		{
			name: 'tabbar-style-storage',
			storage: createJSONStorage(() => AsyncStorage),
			// 迁移：旧版底部栏样式统一迁移到悬浮胶囊（旧默认底部栏/毛玻璃/液态玻璃已移除）
			migrate: (persistedState: any, version) => {
				if (persistedState && persistedState.tabBarStyle) {
					const old = persistedState.tabBarStyle
					if (old === 'kumone-glass' || old === 'ios26' || old === 'ios26-v2') {
						return { ...persistedState, tabBarStyle: 'auto' as TabBarStyle }
					}
				}
				return persistedState
			},
		},
	),
)
