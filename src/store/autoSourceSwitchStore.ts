import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export type FailStrategy = 'lower_quality' | 'play_next' | 'switch_source'

export interface AutoSourceSwitchState {
  enabled: boolean
  maxAttempts: number
  priorityRetry: boolean
  priorityRetryCount: number
  strategyPriority: FailStrategy[]
  setEnabled: (v: boolean) => void
  setMaxAttempts: (n: number) => void
  setPriorityRetry: (v: boolean) => void
  setStrategyPriority: (list: FailStrategy[]) => void
  moveStrategy: (from: number, to: number) => void
}

export const STRATEGY_LABELS: Record<FailStrategy, string> = {
  lower_quality: '降低音质',
  play_next: '播放下一首',
  switch_source: '自动切换音源',
}

export const DEFAULT_STRATEGY_ORDER: FailStrategy[] = [
  'switch_source',
  'lower_quality',
  'play_next',
]

export const useAutoSourceSwitchStore = create<AutoSourceSwitchState>()(
  persist(
    (set, get) => ({
      enabled: true,
      maxAttempts: 5,
      priorityRetry: false,
      priorityRetryCount: 3,
      strategyPriority: [...DEFAULT_STRATEGY_ORDER],
      setEnabled: (v) => set({ enabled: v }),
      setMaxAttempts: (n) => set({ maxAttempts: Math.max(1, Math.min(20, n)) }),
      setPriorityRetry: (v) => set({ priorityRetry: v }),
      setStrategyPriority: (list) => set({ strategyPriority: list }),
      moveStrategy: (from, to) => {
        const list = [...get().strategyPriority]
        const [item] = list.splice(from, 1)
        list.splice(to, 0, item)
        set({ strategyPriority: list })
      },
    }),
    {
      name: 'auto-source-switch-storage',
      storage: createJSONStorage(() => AsyncStorage),
      version: 1,
      migrate: (persistedState: any, version) => {
        if (version === 0 && persistedState?.strategyPriority) {
          // 过滤掉已移除的 switch_platform 策略
          const valid: FailStrategy[] = ['lower_quality', 'play_next', 'switch_source']
          const filtered = persistedState.strategyPriority.filter((s: string) => valid.includes(s as FailStrategy))
          persistedState.strategyPriority = filtered.length > 0 ? filtered : [...DEFAULT_STRATEGY_ORDER]
        }
        return persistedState
      },
    },
  ),
)
