import React from 'react'
import { KumoneGlassTabBar } from '@/components/KumoneGlassTabBar'

/**
 * 自适应底部栏
 * - iOS 26 以上：液态玻璃效果（KumoneGlassTabBar 内部判断）
 * - iOS 26 以下：悬浮胶囊（KumoneGlassTabBar 内部判断）
 */
export const AutoAdaptiveDock = () => {
	return <KumoneGlassTabBar isLiquidGlass={true} />
}
