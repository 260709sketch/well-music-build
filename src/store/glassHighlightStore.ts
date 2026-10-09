import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface GlassHighlightState {
	glassTopHighlight: boolean
	setGlassTopHighlight: (v: boolean) => void
}

export const useGlassHighlightStore = create<GlassHighlightState>()(
	persist(
		(set) => ({
			glassTopHighlight: true,
			setGlassTopHighlight: (v) => set({ glassTopHighlight: v }),
		}),
		{
			name: 'glass-highlight-storage',
			storage: {
				getItem: async (name) => {
					const value = await AsyncStorage.getItem(name)
					return value ? JSON.parse(value) : null
				},
				setItem: async (name, value) => {
					await AsyncStorage.setItem(name, JSON.stringify(value))
				},
				removeItem: async (name) => {
					await AsyncStorage.removeItem(name)
				},
			},
		}
	)
)
