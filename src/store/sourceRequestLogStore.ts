import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// 音源请求日志（参考 Kumone LXRequestLog）
export interface SourceRequestLog {
  id: string
  date: number // 时间戳
  trackName: string
  trackArtist: string
  platform: string // 请求平台（如 netease/qq/kugou 等）
  requestedQuality: string // 请求音质
  actualQuality: string | null // 实际音质
  url: string | null
  fileSize: number | null // 文件大小（字节）
  duration: number // 耗时（秒）
  success: boolean
  errorMessage: string | null
}

interface SourceRequestLogState {
  logs: SourceRequestLog[]
  addLog: (log: Omit<SourceRequestLog, 'id' | 'date'>) => string
  updateLog: (id: string, updates: Partial<SourceRequestLog>) => void
  clearLogs: () => void
}

const MAX_LOGS = 50

export const useSourceRequestLogStore = create<SourceRequestLogState>()(
  persist(
    (set) => ({
      logs: [],
      addLog: (log) => {
        const newLog: SourceRequestLog = {
          ...log,
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          date: Date.now(),
        }
        set((state) => {
          const newLogs = [newLog, ...state.logs]
          if (newLogs.length > MAX_LOGS) {
            newLogs.length = MAX_LOGS
          }
          return { logs: newLogs }
        })
        return newLog.id
      },
      updateLog: (id, updates) =>
        set((state) => ({
          logs: state.logs.map((l) => (l.id === id ? { ...l, ...updates } : l)),
        })),
      clearLogs: () => set({ logs: [] }),
    }),
    {
      name: 'source-request-log-storage',
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)

// 格式化耗时
export const formatDuration = (duration: number): string => {
  return `${duration.toFixed(1)}s`
}

// 格式化文件大小
export const formatFileSize = (bytes: number | null): string | null => {
  if (!bytes || bytes <= 0) return null
  const mb = bytes / 1024 / 1024
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`
  }
  const kb = bytes / 1024
  return `${kb.toFixed(0)} KB`
}
