import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface ToastStyleState {
	topOffset: number
	titleSize: number
	subtitleSize: number
	maxWidth: string
	bgOpacity: number
	setTopOffset: (v: number) => void
	setTitleSize: (v: number) => void
	setSubtitleSize: (v: number) => void
	setMaxWidth: (v: string) => void
	setBgOpacity: (v: number) => void
}

export const useToastStyleStore = create<ToastStyleState>()(
	persist(
		(set) => ({
			topOffset: 120,
			titleSize: 12.5,
			subtitleSize: 11,
			maxWidth: '80%',
			bgOpacity: 0.82,
			setTopOffset: (v) => set({ topOffset: v }),
			setTitleSize: (v) => set({ titleSize: v }),
			setSubtitleSize: (v) => set({ subtitleSize: v }),
			setMaxWidth: (v) => set({ maxWidth: v }),
			setBgOpacity: (v) => set({ bgOpacity: v }),
		}),
		{
			name: 'toast-style-storage',
			storage: createJSONStorage(() => AsyncStorage),
			version: 3,
			migrate: (persisted: any) => ({
				...persisted,
				topOffset: 120,
				titleSize: 12.5,
				subtitleSize: 11,
			}),
		},
	),
)
