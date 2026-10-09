// 跨平台播放回退设置
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

interface CrossPlatformFallbackState {
	enabled: boolean
	setEnabled: (v: boolean) => void
}

export const useCrossPlatformFallbackStore = create<CrossPlatformFallbackState>()(
	persist(
		(set) => ({
			enabled: false, // 默认关闭
			setEnabled: (v: boolean) => set({ enabled: v }),
		}),
		{
			name: 'cross-platform-fallback-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
