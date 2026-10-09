import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface SourceSwitchToastState {
	enabled: boolean
	setEnabled: (enabled: boolean) => void
}

export const useSourceSwitchToastStore = create<SourceSwitchToastState>()(
	persist(
		(set) => ({
			enabled: true,
			setEnabled: (enabled) => set({ enabled }),
		}),
		{
			name: 'source-switch-toast-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
