import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface VolumeNormalizationState {
  enabled: boolean
  targetVolume: number // 0.1 - 1.0
  setEnabled: (v: boolean) => void
  setTargetVolume: (v: number) => void
}

export const useVolumeNormalizationStore = create<VolumeNormalizationState>()(
  persist(
    (set) => ({
      enabled: false,
      targetVolume: 0.85,
      setEnabled: (v) => set({ enabled: v }),
      setTargetVolume: (v) => set({ targetVolume: Math.max(0.1, Math.min(1, v)) }),
    }),
    {
      name: 'volume-normalization-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
