/**
 * 应用日志存储工具
 * 用于在设置中查看调试日志
 */

import AsyncStorage from '@react-native-async-storage/async-storage'

const LOG_STORAGE_KEY = 'app_debug_logs'
const MAX_LOGS = 500
const MAX_MESSAGE_LENGTH = 500
const LOG_RETENTION_MS = 7 * 24 * 60 * 60 * 1000 // 日志保留 7 天

export type LogEntry = {
	timestamp: number
	time: string
	level: 'info' | 'warn' | 'error' | 'success'
	tag: string
	message: string
}

let logs: LogEntry[] = []
let loaded = false
let saveTimer: any = null
let pendingSave = false

// 从存储加载日志
async function loadLogs() {
	if (loaded) return
	try {
		const data = await AsyncStorage.getItem(LOG_STORAGE_KEY)
		if (data) {
			logs = JSON.parse(data)
			if (!Array.isArray(logs)) logs = []
			// 自动清理 7 天前的日志
			const cutoff = Date.now() - LOG_RETENTION_MS
			const beforeLen = logs.length
			logs = logs.filter(l => l.timestamp >= cutoff)
			if (logs.length !== beforeLen) scheduleSave()
		}
	} catch (e) {
		logs = []
	}
	loaded = true
}

// 节流保存日志（最多每1.5秒存一次）
function scheduleSave() {
	if (saveTimer) {
		pendingSave = true
		return
	}
	pendingSave = false
	saveTimer = setTimeout(async () => {
		saveTimer = null
		try {
			await AsyncStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(logs))
		} catch (e) {
			// 存储失败忽略
		}
		if (pendingSave) scheduleSave()
	}, 1500)
}

// 添加日志
export function addLog(tag: string, message: string, level: LogEntry['level'] = 'info') {
	// 截断过长的消息
	const truncated = message.length > MAX_MESSAGE_LENGTH
		? message.substring(0, MAX_MESSAGE_LENGTH) + '...(截断)'
		: message

	const now = new Date()
	const entry: LogEntry = {
		timestamp: now.getTime(),
		time: now.toLocaleTimeString('zh-CN', { hour12: false }),
		level,
		tag: tag.substring(0, 40),
		message: truncated,
	}

	logs.unshift(entry)

	if (logs.length > MAX_LOGS) {
		logs = logs.slice(0, MAX_LOGS)
	}

	scheduleSave()
}

// 获取所有日志
export async function getLogs(): Promise<LogEntry[]> {
	await loadLogs()
	return [...logs]
}

// 清空日志
export async function clearLogs() {
	logs = []
	if (saveTimer) {
		clearTimeout(saveTimer)
		saveTimer = null
	}
	try {
		await AsyncStorage.removeItem(LOG_STORAGE_KEY)
	} catch (e) {
		// ignore
	}
}

// 全局捕获 console.error/warn 到应用日志（console.log 太吵，不捕获）
let consoleCaptured = false
export function setupConsoleCapture() {
	if (consoleCaptured) return
	consoleCaptured = true
	const originalError = console.error
	const originalWarn = console.warn
	const formatArgs = (args: any[]) => args.map(a => {
		if (typeof a === 'string') return a
		if (a instanceof Error) return a.message
		try { return JSON.stringify(a) } catch { return String(a) }
	}).join(' ').substring(0, MAX_MESSAGE_LENGTH)
	const isNoise = (msg: string) =>
		msg.includes('LinearGradient colors and locations') ||
		msg.includes('VirtualizedLists should never be nested') ||
		msg.includes('RCTBridge required dispatch_sync') ||
		msg.includes('new NativeEventEmitter') ||
		msg.includes('Sending `onAnimated') ||
		msg.includes('Non-serializable values')
	console.error = (...args: any[]) => {
		originalError.apply(console, args)
		const msg = formatArgs(args)
		if (!isNoise(msg)) { try { addLog('console', msg, 'error') } catch {} }
	}
	console.warn = (...args: any[]) => {
		originalWarn.apply(console, args)
		const msg = formatArgs(args)
		if (!isNoise(msg)) { try { addLog('console', msg, 'warn') } catch {} }
	}
}
