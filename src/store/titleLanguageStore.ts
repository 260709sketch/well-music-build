import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface TitleLanguageState {
	chineseTitleEnabled: boolean
	setChineseTitleEnabled: (enabled: boolean) => void
}

export const useTitleLanguageStore = create<TitleLanguageState>()(
	persist(
		(set) => ({
			chineseTitleEnabled: true,
			setChineseTitleEnabled: (enabled) => set({ chineseTitleEnabled: enabled }),
		}),
		{
			name: 'title-language-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
