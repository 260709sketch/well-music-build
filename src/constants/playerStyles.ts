// 播放器样式配置
export type PlayerStyle = 'classic' | 'immersive' | 'appleMusic2'

export const PLAYER_STYLES: { value: PlayerStyle; label: string }[] = [
	{ value: 'classic', label: '经典样式' },
	{ value: 'immersive', label: '沉浸式（WellMusic v2）' },
	{ value: 'appleMusic2', label: 'Apple Music 2' },
]

export const DEFAULT_PLAYER_STYLE: PlayerStyle = 'immersive'

export const PLAYER_STYLE_STORAGE_KEY = 'player_style'
