/**
 * 本地连续收听天数统计
 * 每天首次播放歌曲时 bump 一次（同一天幂等，内存缓存避免频繁读 AsyncStorage）
 * 网易云无连续收听天数的公开接口，故用本机连续播放天数近似
 */
import AsyncStorage from '@react-native-async-storage/async-storage'

const KEY = 'listen_streak'
let cachedDate = ''
let cachedDays = 0

export const bumpListenStreak = async (): Promise<number> => {
	const today = new Date().toDateString()
	if (cachedDate === today) return cachedDays
	let days = 0
	try {
		const raw = await AsyncStorage.getItem(KEY)
		const data = raw ? JSON.parse(raw) : null
		const yesterday = new Date(Date.now() - 86400000).toDateString()
		if (data && data.date === today) {
			days = data.days
		} else {
			days = data && data.date === yesterday ? (data.days || 0) + 1 : 1
			await AsyncStorage.setItem(KEY, JSON.stringify({ date: today, days }))
		}
	} catch (e) {}
	cachedDate = today
	cachedDays = days
	return days
}

export const getListenStreak = async (): Promise<number> => {
	if (cachedDate === new Date().toDateString()) return cachedDays
	try {
		const raw = await AsyncStorage.getItem(KEY)
		if (!raw) return 0
		const data = JSON.parse(raw)
		const today = new Date().toDateString()
		const yesterday = new Date(Date.now() - 86400000).toDateString()
		if (data.date === today || data.date === yesterday) return data.days
		return 0
	} catch (e) {
		return 0
	}
}
