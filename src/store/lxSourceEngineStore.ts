import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface LXSourceEngineState {
	enabled: boolean
	preloadEnabled: boolean
	setEnabled: (v: boolean) => void
	setPreloadEnabled: (v: boolean) => void
}

export const useLXSourceEngineStore = create<LXSourceEngineState>()(
	persist(
		(set) => ({
			enabled: false,
			preloadEnabled: true,
			setEnabled: (v) => set({ enabled: v }),
			setPreloadEnabled: (v) => set({ preloadEnabled: v }),
		}),
		{
			name: 'lx-source-engine-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
