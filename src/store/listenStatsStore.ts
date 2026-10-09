/**
 * 听歌统计存储
 * - playCount: 累计播放次数（每切入一首新歌计一次）
 * - listenSeconds: 累计听歌时长（秒，播放中按时间累加）
 * 使用 AsyncStorage 持久化
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

type ListenStatsState = {
	playCount: number
	listenSeconds: number
	incPlay: () => void
	addSeconds: (n: number) => void
	reset: () => void
}

export const useListenStatsStore = create<ListenStatsState>()(
	persist(
		(set) => ({
			playCount: 0,
			listenSeconds: 0,
			incPlay: () => set((s) => ({ playCount: s.playCount + 1 })),
			addSeconds: (n) => set((s) => ({ listenSeconds: Math.max(0, s.listenSeconds + n) })),
			reset: () => set({ playCount: 0, listenSeconds: 0 }),
		}),
		{
			name: 'listen-stats',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
