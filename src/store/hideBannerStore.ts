import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface HideBannerState {
	hideNeteaseBanner: boolean
	setHideNeteaseBanner: (hidden: boolean) => void
}

export const useHideBannerStore = create<HideBannerState>()(
	persist(
		(set) => ({
			hideNeteaseBanner: true,
			setHideNeteaseBanner: (hidden) => set({ hideNeteaseBanner: hidden }),
		}),
		{
			name: 'hide-banner-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
