import PersistStatus from '@/store/PersistStatus'
import { IMusic } from '@/helpers/types'

const HISTORY_KEY = 'music.playHistory'
const MAX_HISTORY_SIZE = 100

export type PlayHistoryItem = IMusic.IMusicItem & {
	playedAt: number
}

export const getPlayHistory = (): PlayHistoryItem[] => {
	try {
		return PersistStatus.get(HISTORY_KEY) ?? []
	} catch (error) {
		console.error('获取播放历史失败:', error)
		return []
	}
}

export const addToPlayHistory = (track: IMusic.IMusicItem) => {
	try {
		const history = getPlayHistory()
		// 移除重复的歌曲（相同id）
		const filteredHistory = history.filter((item) => item.id !== track.id)
		// 添加到开头
		const newHistory: PlayHistoryItem[] = [
			{ ...track, playedAt: Date.now() },
			...filteredHistory,
		].slice(0, MAX_HISTORY_SIZE)
		PersistStatus.set(HISTORY_KEY, newHistory)
		return newHistory
	} catch (error) {
		console.error('添加播放历史失败:', error)
		return getPlayHistory()
	}
}

export const clearPlayHistory = () => {
	try {
		PersistStatus.set(HISTORY_KEY, [])
		return []
	} catch (error) {
		console.error('清除播放历史失败:', error)
		return []
	}
}

export const removeFromPlayHistory = (trackId: string) => {
	try {
		const history = getPlayHistory()
		const newHistory = history.filter((item) => item.id !== trackId)
		PersistStatus.set(HISTORY_KEY, newHistory)
		return newHistory
	} catch (error) {
		console.error('移除播放历史失败:', error)
		return getPlayHistory()
	}
}
