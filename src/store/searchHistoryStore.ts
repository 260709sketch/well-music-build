// 搜索历史状态管理
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface SearchHistoryState {
	history: string[]
	addHistory: (keyword: string) => void
	removeHistory: (keyword: string) => void
	clearHistory: () => void
}

export const useSearchHistoryStore = create<SearchHistoryState>()(
	persist(
		(set, get) => ({
			history: [],
			addHistory: (keyword: string) => {
				if (!keyword.trim()) return
				const current = get().history.filter((k) => k !== keyword)
				set({ history: [keyword, ...current].slice(0, 20) }) // 最多保存20条
			},
			removeHistory: (keyword: string) => {
				set({ history: get().history.filter((k) => k !== keyword) })
			},
			clearHistory: () => {
				set({ history: [] })
			},
		}),
		{
			name: 'search-history-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
