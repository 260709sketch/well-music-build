/**
 * 网易云听歌统计（我的页展示，进入页面时实时刷新）
 * - weeklyMinutes: 每周听歌时长（分钟，-1 表示未登录/获取失败，官方听歌足迹接口，失败回退近似算法）
 * - favoriteCount: 收藏歌曲数（「我喜欢的音乐」歌单 trackCount，-1 表示未获取）
 * - streakDays: 连续收听天数（本地统计，每天真实播放时 bump 一次；网易云无公开接口）
 */
import { create } from 'zustand'
import { getNeteaseUserPlaylists, getNeteaseWeeklyListenMinutes, getNeteaseContinuousListenDays } from '@/helpers/userApi/netease-music-api'
import { getListenStreak } from '@/helpers/listenStreak'
import { getThisWeekListenSeconds } from '@/helpers/listenWeekly'

interface NeteaseStatsState {
	weeklyMinutes: number
	favoriteCount: number
	streakDays: number
	loading: boolean
	refresh: (cookie: string, uid: string) => Promise<void>
}

export const useNeteaseStatsStore = create<NeteaseStatsState>((set) => ({
	weeklyMinutes: -1,
	favoriteCount: -1,
	streakDays: -1,
	loading: false,
	refresh: async (cookie, uid) => {
		set({ loading: true })
		try {
			const [weekly, playlists, streak, localWeekly] = await Promise.all([
				cookie ? getNeteaseWeeklyListenMinutes(cookie, uid) : -1,
				cookie ? getNeteaseUserPlaylists(uid, cookie) : [],
				cookie ? getNeteaseContinuousListenDays(cookie) : -1,
				getThisWeekListenSeconds(),
			])
			const favPlaylist = (playlists || []).find((p: any) => p.isLoved)
			// 每周听歌：网易云官方接口失败(-1/<=0)时回退本地按天统计
			const weeklyMinutes =
				weekly > 0 ? weekly : Math.max(0, Math.floor(localWeekly / 60))
			// 连续收听：网易云足迹接口失败时回退本地连续播放天数
			const localStreak = await getListenStreak()
			const streakDays = streak > 0 ? streak : Math.max(0, localStreak)
			set({
				weeklyMinutes,
				favoriteCount: favPlaylist ? favPlaylist.trackCount : 0,
				streakDays,
				loading: false,
			})
		} catch (e) {
			console.error('获取网易云听歌统计失败:', e)
			set({ loading: false, weeklyMinutes: -1, favoriteCount: -1, streakDays: -1 })
		}
	},
}))
