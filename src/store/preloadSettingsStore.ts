import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type PreloadCount = 0 | 1 | 2 | 3

interface PreloadSettingsState {
	preloadEnabled: boolean
	preloadCount: PreloadCount
	preloadDelaySeconds: number
	setPreloadEnabled: (enabled: boolean) => void
	setPreloadCount: (count: PreloadCount) => void
	setPreloadDelaySeconds: (seconds: number) => void
}

export const usePreloadSettingsStore = create<PreloadSettingsState>()(
	persist(
		(set) => ({
			preloadEnabled: true,
			preloadCount: 2,
			preloadDelaySeconds: 5,
			setPreloadEnabled: (enabled) => set({ preloadEnabled: enabled }),
			setPreloadCount: (count) => set({ preloadCount: count }),
			setPreloadDelaySeconds: (seconds) => set({ preloadDelaySeconds: seconds }),
		}),
		{
			name: 'preload-settings-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
