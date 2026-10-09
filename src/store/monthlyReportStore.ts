/**
 * 听歌月报存储
 * 按月记录：歌曲播放次数/时长、歌手汇总、每日听歌时长
 * 数据从 useListenStats 播放事件写入；跨月自动新建月份数据
 */
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface MonthlySongStat {
	title: string
	artist: string
	artwork: string
	count: number
	seconds: number
}

export interface MonthData {
	songs: Record<string, MonthlySongStat>
	totalCount: number
	totalSeconds: number
	days: Record<string, number>
}

type SongBrief = { id: string; title: string; artist: string; artwork?: string }

type MonthlyReportState = {
	months: Record<string, MonthData>
	recordPlay: (song: SongBrief) => void
	recordSeconds: (song: SongBrief, seconds: number) => void
	resetMonth: (monthKey: string) => void
}

export const monthKeyOf = (d: Date = new Date()) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
export const dayKeyOf = (d: Date = new Date()) =>
	`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const emptyMonth = (): MonthData => ({ songs: {}, totalCount: 0, totalSeconds: 0, days: {} })

export const useMonthlyReportStore = create<MonthlyReportState>()(
	persist(
		(set, get) => ({
			months: {},
			recordPlay: (song) => {
				if (!song?.id) return
				const mk = monthKeyOf()
				const months = { ...get().months }
				const m = { ...(months[mk] || emptyMonth()) }
				const prev = m.songs[song.id] || { title: song.title, artist: song.artist, artwork: song.artwork || '', count: 0, seconds: 0 }
				m.songs = {
					...m.songs,
					[song.id]: {
						title: song.title || prev.title,
						artist: song.artist || prev.artist,
						artwork: song.artwork || prev.artwork,
						count: prev.count + 1,
						seconds: prev.seconds,
					},
				}
				m.totalCount += 1
				months[mk] = m
				set({ months })
			},
			recordSeconds: (song, seconds) => {
				if (!song?.id || !seconds || seconds <= 0) return
				const mk = monthKeyOf()
				const dk = dayKeyOf()
				const months = { ...get().months }
				const m = { ...(months[mk] || emptyMonth()) }
				const prev = m.songs[song.id] || { title: song.title, artist: song.artist, artwork: song.artwork || '', count: 0, seconds: 0 }
				m.songs = {
					...m.songs,
					[song.id]: {
						title: song.title || prev.title,
						artist: song.artist || prev.artist,
						artwork: song.artwork || prev.artwork,
						count: prev.count,
						seconds: prev.seconds + seconds,
					},
				}
				m.totalSeconds += seconds
				m.days = { ...m.days, [dk]: (m.days[dk] || 0) + seconds }
				months[mk] = m
				set({ months })
			},
			resetMonth: (monthKey) => {
				const months = { ...get().months }
				delete months[monthKey]
				set({ months })
			},
		}),
		{
			name: 'monthly-report',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)

// 本月累计歌手排行（从歌曲统计聚合）
export const aggregateArtists = (m: MonthData | undefined) => {
	if (!m) return []
	const map = new Map<string, { name: string; count: number; seconds: number }>()
	Object.values(m.songs).forEach((s) => {
		if (!s.artist) return
		s.artist.split(/\s*[\/、,&]\s*/).filter(Boolean).forEach((a) => {
			const cur = map.get(a) || { name: a, count: 0, seconds: 0 }
			cur.count += s.count
			cur.seconds += s.seconds
			map.set(a, cur)
		})
	})
	return Array.from(map.values()).sort((a, b) => b.seconds - a.seconds || b.count - a.count)
}
