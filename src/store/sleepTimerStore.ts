/**
 * 睡眠定时器存储
 * - minutes: 倒计时到点暂停播放
 * - endOfSong: 当前歌曲播放完自动暂停（播放器监听切歌触发）
 * - remainingSeconds: 分钟模式剩余秒数，每 5 秒刷新，供 UI 显示倒计时
 *   （5 秒粒度可避免每秒触发菜单 actions 重建收起 @react-native-menu/menu 展开中的子菜单）
 * 内存态：App 重启后失效（与网易云行为一致）
 */
import { create } from 'zustand'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { showToast } from '@/utils/utils'

type EndBehavior = 'minutes' | 'endOfSong'

type SleepTimerState = {
	active: boolean
	endBehavior: EndBehavior
	endAt: number | null
	endOfSongTrackId: string | null
	remainingSeconds: number
	setTimerMinutes: (minutes: number) => void
	setEndOfSong: (trackId: string) => void
	cancel: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null
let tick: ReturnType<typeof setInterval> | null = null

const clearTick = () => {
	if (tick) {
		clearInterval(tick)
		tick = null
	}
}

export const useSleepTimerStore = create<SleepTimerState>()((set) => ({
	active: false,
	endBehavior: 'minutes',
	endAt: null,
	endOfSongTrackId: null,
	remainingSeconds: 0,
	setTimerMinutes: (minutes) => {
		if (timer) clearTimeout(timer)
		clearTick()
		const endAt = Date.now() + minutes * 60 * 1000
		const updateRemaining = () => {
			const remain = Math.max(0, Math.round((endAt - Date.now()) / 1000))
			set({ remainingSeconds: remain })
			if (remain <= 0) clearTick()
		}
		updateRemaining()
		// 倒计时每 5 秒刷新：避免每秒触发 menuActions 重建收起展开中的子菜单
		// 定时结束仍由下方 setTimeout 精确触发（与 tick 间隔无关）
		tick = setInterval(updateRemaining, 5000)
		timer = setTimeout(() => {
			clearTick()
			myTrackPlayer.pause()
			showToast('睡眠定时', '定时结束，已暂停播放', 'info')
			set({ active: false, endAt: null, endOfSongTrackId: null, remainingSeconds: 0 })
		}, minutes * 60 * 1000)
		set({ active: true, endBehavior: 'minutes', endAt, endOfSongTrackId: null })
	},
	setEndOfSong: (trackId) => {
		if (timer) clearTimeout(timer)
		clearTick()
		set({ active: true, endBehavior: 'endOfSong', endAt: null, endOfSongTrackId: trackId, remainingSeconds: 0 })
	},
	cancel: () => {
		if (timer) clearTimeout(timer)
		clearTick()
		set({ active: false, endAt: null, endOfSongTrackId: null, remainingSeconds: 0 })
	},
}))
