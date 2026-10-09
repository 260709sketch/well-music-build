import { useWindowDimensions } from 'react-native'
import { useLayoutStore, type LayoutSettings } from '@/store/playerLayoutStore'

// 基准屏幕：iPhone 14 Pro (393 x 852 pt)
// 用户在 iPhone 14 Pro 上调校的布局值，在其他屏幕上按比例缩放
const BASE_WIDTH = 393
const BASE_HEIGHT = 852

/**
 * 缩放后的播放器布局设置
 * - 垂直方向的值（marginTop、translateY、lyricAreaTop、amllLyricBottom 等）按屏幕高度比例缩放
 * - 水平方向的值（translateX）按屏幕宽度比例缩放
 * - 字号按屏幕高度比例缩放
 * - 字重、对齐方式等不缩放
 */
export const useScaledLayout = (): LayoutSettings => {
	const { width, height } = useWindowDimensions()
	const settings = useLayoutStore((s) => s.settings)

	const scaleY = height / BASE_HEIGHT
	const scaleX = width / BASE_WIDTH

	// 字号用较小的缩放比例，避免在大屏上字号过大
	const fontScale = Math.min(scaleY, 1.15)

	return {
		...settings,
		// 小封面位置（水平/垂直分别缩放）
		miniArtworkTranslateX: settings.miniArtworkTranslateX * scaleX,
		miniArtworkTranslateY: settings.miniArtworkTranslateY * scaleY,
		miniSongInfoTranslateX: settings.miniSongInfoTranslateX * scaleX,
		miniSongInfoTranslateY: settings.miniSongInfoTranslateY * scaleY,
		// 底部控制区（垂直缩放）
		bottomControlsMarginTop: settings.bottomControlsMarginTop * scaleY,
		playControlsMarginTop: settings.playControlsMarginTop * scaleY,
		volumeRowMarginTop: settings.volumeRowMarginTop * scaleY,
		bottomButtonsRowMarginTop: settings.bottomButtonsRowMarginTop * scaleY,
		qualityBadgeMarginTop: settings.qualityBadgeMarginTop * scaleY,
		qualityBadgeTranslateX: settings.qualityBadgeTranslateX * scaleX,
		// iOS26 底部控制区
		ios26BottomControlsMarginTop: settings.ios26BottomControlsMarginTop * scaleY,
		ios26PlayControlsMarginTop: settings.ios26PlayControlsMarginTop * scaleY,
		ios26VolumeRowMarginTop: settings.ios26VolumeRowMarginTop * scaleY,
		ios26QualityBadgeMarginTop: settings.ios26QualityBadgeMarginTop * scaleY,
		// 歌词位置（垂直缩放）
		lyricAreaTop: settings.lyricAreaTop * scaleY,
		lyricActiveOffset: settings.lyricActiveOffset, // 百分比不缩放
		lyricPaddingTop: settings.lyricPaddingTop * scaleY,
		lyricPaddingBottom: settings.lyricPaddingBottom * scaleY,
		lyricLineMargin: settings.lyricLineMargin * scaleY,
		amllLyricBottom: settings.amllLyricBottom * scaleY,
		// 字号（限制最大缩放）
		lyricFontSize: settings.lyricFontSize * fontScale,
		lyricInactiveFontSize: settings.lyricInactiveFontSize * fontScale,
		lyricTranslationFontSize: settings.lyricTranslationFontSize * fontScale,
		queueTitleFontSize: settings.queueTitleFontSize * fontScale,
		// 小封面大小
		lyricMiniArtworkSize: settings.lyricMiniArtworkSize * scaleY,
		// 歌曲信息上边距
		songInfoRowMarginTop: settings.songInfoRowMarginTop * scaleY,
		amv2SongInfoRowOffset: settings.amv2SongInfoRowOffset * scaleY,
		// 播放队列
		queueContentTop: settings.queueContentTop * scaleY,
		queueTitleMarginTop: settings.queueTitleMarginTop * scaleY,
		// 以下不缩放：
		// lyricTextAlign, lyricFontWeight, amllLyricFontWeight, lyricPaddingLeft, lyricPaddingRight
	}
}
