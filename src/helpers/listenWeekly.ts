/**
 * 本地每周听歌时长统计
 * 播放中按天累计听歌秒数，天然可算「本周」（本周一 00:00 至今）听歌时长。
 * 用 AsyncStorage 持久化，保留近 8 天的记录，超出自动清理。
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'listen_weekly'
type DailyMap = Record<string, number> // 'YYYY-MM-DD' -> 秒数
let cache: DailyMap | null = null

const dayKey = (d: Date): string => {
	const y = d.getFullYear()
	const m = `${d.getMonth() + 1}`.padStart(2, '0')
	const day = `${d.getDate()}`.padStart(2, '0')
	return `${y}-${m}-${day}`
}

const load = async (): Promise<DailyMap> => {
	if (cache) return cache
	try {
		const raw = await AsyncStorage.getItem(KEY)
		cache = raw ? JSON.parse(raw) : {}
	} catch (e) {
		cache = {}
	}
	return cache as DailyMap
}

const persist = async (m: DailyMap) => {
	try {
		// 只保留本周 + 上周，避免无限增长
		const now = new Date()
		const cutoff = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 13)
		const cutoffKey = dayKey(cutoff)
		Object.keys(m).forEach((k) => {
			if (k < cutoffKey) delete m[k]
		})
		await AsyncStorage.setItem(KEY, JSON.stringify(m))
	} catch (e) {}
}

/** 记录今天的新增听歌秒数 */
export const recordListenSeconds = async (seconds: number) => {
	if (!seconds || seconds <= 0) return
	const m = await load()
	const k = dayKey(new Date())
	m[k] = (m[k] || 0) + seconds
	persist(m)
}

/** 本周一零点距今天过去的所有秒数 */
const startOfWeek = (d: Date): Date => {
	const day = d.getDay() === 0 ? 7 : d.getDay() // 周一=1…周日=7
	const diff = day - 1
	const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff)
	return start
}

/** 本周（周一开始）累计听歌秒数 */
export const getThisWeekListenSeconds = async (): Promise<number> => {
	try {
		const m = await load()
		const start = startOfWeek(new Date())
		const keys = Object.keys(m).filter((k) => k >= dayKey(start))
		return keys.reduce((sum, k) => sum + (m[k] || 0), 0)
	} catch (e) {
		return 0
	}
}