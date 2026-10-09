// 播放样式设置
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type PlayerStyle = 'apple-music-v2' | 'wellmusic-am'

interface PlayerStyleState {
	playerStyle: PlayerStyle
	setPlayerStyle: (style: PlayerStyle) => void
}

export const usePlayerStyleStore = create<PlayerStyleState>()(
	persist(
		(set) => ({
			playerStyle: 'wellmusic-am',
			setPlayerStyle: (style: PlayerStyle) => set({ playerStyle: style }),
		}),
		{
			name: 'player-style-storage',
			storage: createJSONStorage(() => AsyncStorage),
			// 迁移：旧播放器（sollin / apple-music-ios26 / well-classic / cymusic-classic）统一映射到
			// 保留的两个播放器：apple-music-v2（Apple Music V2）与 wellmusic-am（AM）。
			migrate: (persistedState: any, version) => {
				if (persistedState && persistedState.playerStyle) {
					const old = persistedState.playerStyle
					const map: Record<string, PlayerStyle> = {
						// 旧沉浸播放（已删除）→ 落到 Apple Music V2
						'wellmusic-am': 'apple-music-v2',
						// 旧 AM（wellmusic-amv2）→ 新 AM
						'wellmusic-amv2': 'wellmusic-am',
						// 旧 Sollin AM V2 → 新 Apple Music V2
						'applemusic-v2': 'apple-music-v2',
						'sollinv2-am': 'apple-music-v2',
						'sollinv2-am-v2': 'wellmusic-am',
						'apple-music-ios26': 'wellmusic-am',
						'sollinv2-v3': 'wellmusic-am',
						'well-classic': 'wellmusic-am',
						'cymusic-classic': 'wellmusic-am',
					}
					if (map[old]) {
						return { ...persistedState, playerStyle: map[old] }
					}
				}
				return persistedState
			},
		},
	),
)
