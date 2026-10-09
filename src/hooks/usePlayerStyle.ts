import { useCallback, useEffect, useState } from 'react'
import { MMKV } from 'react-native-mmkv'
import {
	DEFAULT_PLAYER_STYLE,
	PLAYER_STYLE_STORAGE_KEY,
	type PlayerStyle,
} from '@/constants/playerStyles'

const storage = new MMKV()

export const usePlayerStyle = () => {
	const [playerStyle, setPlayerStyleState] = useState<PlayerStyle>(() => {
		try {
			const saved = storage.getString(PLAYER_STYLE_STORAGE_KEY)
			return (saved as PlayerStyle) || DEFAULT_PLAYER_STYLE
		} catch {
			return DEFAULT_PLAYER_STYLE
		}
	})

	const setPlayerStyle = useCallback((style: PlayerStyle) => {
		setPlayerStyleState(style)
		try {
			storage.set(PLAYER_STYLE_STORAGE_KEY, style)
		} catch {
			// ignore
		}
	}, [])

	const isImmersive = playerStyle === 'immersive'
	const isClassic = playerStyle === 'classic'
	const isAppleMusic2 = playerStyle === 'appleMusic2'

	return {
		playerStyle,
		setPlayerStyle,
		isImmersive,
		isClassic,
		isAppleMusic2,
	}
}

// 全局获取播放器样式（用于非组件环境）
export const getPlayerStyle = (): PlayerStyle => {
	try {
		const saved = storage.getString(PLAYER_STYLE_STORAGE_KEY)
		return (saved as PlayerStyle) || DEFAULT_PLAYER_STYLE
	} catch {
		return DEFAULT_PLAYER_STYLE
	}
}
