import { createStore, useStore } from 'zustand'
import { addLog } from '@/utils/appLogger'

type LogLevel = 'INFO' | 'WARN' | 'ERROR'

type LogEntry = {
	timestamp: string
	level: LogLevel
	message: string
	details?: any[]
}

interface LoggerState {
	logs: LogEntry[]
	addLog: (level: LogLevel, ...args: any[]) => void
	clearLogs: () => void
}

const stringifyArg = (arg: any): string => {
	if (typeof arg === 'string') return arg
	try {
		return JSON.stringify(arg, null, 2)
	} catch (error) {
		return `[Unstringifiable Object]: ${Object.prototype.toString.call(arg)}`
	}
}

// 从消息中提取 [tag] 标签，没有则用默认
const extractTag = (message: string): string => {
	const match = message.match(/^\[([^\]]+)\]/)
	return match ? match[1] : 'app'
}

// 映射到 appLogger 的 level
const mapLevel = (level: LogLevel): 'info' | 'warn' | 'error' => {
	switch (level) {
		case 'WARN': return 'warn'
		case 'ERROR': return 'error'
		default: return 'info'
	}
}

export const useLogger = createStore<LoggerState>((set) => ({
	logs: [],
	addLog: (level, ...args) =>
		set((state) => {
			const message = args.map(stringifyArg).join(' ')
			const newLog = {
				timestamp: new Date().toISOString(),
				level,
				message,
				details: args.length > 1 ? args : undefined,
			}

			// 在控制台打印日志
			console.log(`[${newLog.timestamp}] [${level}] ${message}`)

			// 同时写入软件日志（持久化，设置里可查看）
			try {
				const tag = extractTag(message)
				const cleanMsg = message.replace(/^\[[^\]]+\]\s*/, '')
				addLog(tag, cleanMsg || message, mapLevel(level))
			} catch (e) {
				// 忽略写入失败
			}

			return {
				logs: [
					...state.logs,
					{
						timestamp: new Date().toISOString(),
						level,
						message,
						details: args.length > 1 ? args : undefined,
					},
				],
			}
		}),
	clearLogs: () => set({ logs: [] }),
}))

const createLogFunction =
	(level: LogLevel) =>
	(...args: any[]) => {
		useLogger.getState().addLog(level, ...args)
	}

export const logInfo = createLogFunction('INFO')
export const logWarn = createLogFunction('WARN')
export const logError = createLogFunction('ERROR')

export const useLoggerHook = () => useStore(useLogger)
