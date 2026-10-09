import { Dimensions, Platform, StatusBar } from 'react-native'

/**
 * 屏幕自动适配工具
 * 基准设备：iPhone 14 Pro (393 x 852)
 * 其他设备按比例缩放，确保布局位置一致
 */

// 基准尺寸（iPhone 14 Pro 逻辑分辨率）
const BASE_WIDTH = 393
const BASE_HEIGHT = 852

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

// 宽度缩放比例
const widthScale = SCREEN_WIDTH / BASE_WIDTH
// 高度缩放比例
const heightScale = SCREEN_HEIGHT / BASE_HEIGHT
// 较小的缩放比例（用于正方形元素，避免变形）
const minScale = Math.min(widthScale, heightScale)

/**
 * 基于宽度的缩放（用于水平方向的尺寸、边距、位置）
 */
export function wp(size: number): number {
	return size * widthScale
}

/**
 * 基于高度的缩放（用于垂直方向的尺寸、边距、位置）
 */
export function hp(size: number): number {
	return size * heightScale
}

/**
 * 等比缩放（用于正方形元素、字体大小，避免变形）
 */
export function rp(size: number): number {
	return size * minScale
}

/**
 * 字体大小缩放
 */
export function fs(size: number): number {
	return size * minScale
}

/**
 * 安全区域顶部高度
 */
export function getStatusBarHeight(): number {
	if (Platform.OS === 'ios') {
		// iPhone X 及以上有刘海
		if (SCREEN_HEIGHT >= 812) {
			return 44
		}
		return 20
	}
	return StatusBar.currentHeight || 0
}

/**
 * 安全区域底部高度
 */
export function getBottomSpace(): number {
	if (Platform.OS === 'ios') {
		if (SCREEN_HEIGHT >= 812) {
			return 34
		}
		return 0
	}
	return 0
}

/**
 * 判断是否是小屏手机（iPhone SE 等）
 */
export function isSmallScreen(): boolean {
	return SCREEN_HEIGHT < 700
}

/**
 * 判断是否是大屏手机（iPhone Pro Max 等）
 */
export function isLargeScreen(): boolean {
	return SCREEN_HEIGHT >= 900
}

/**
 * 获取当前设备信息
 */
export function getDeviceInfo() {
	return {
		width: SCREEN_WIDTH,
		height: SCREEN_HEIGHT,
		widthScale,
		heightScale,
		minScale,
		isSmallScreen: isSmallScreen(),
		isLargeScreen: isLargeScreen(),
		statusBarHeight: getStatusBarHeight(),
		bottomSpace: getBottomSpace(),
	}
}

export default {
	wp,
	hp,
	rp,
	fs,
	getStatusBarHeight,
	getBottomSpace,
	isSmallScreen,
	isLargeScreen,
	getDeviceInfo,
}
