import { Event, useTrackPlayerEvents, Track } from 'react-native-track-player'
import { scrobbleStart, scrobbleFinish, isNeteaseLoggedIn } from '@/helpers/userApi/neteaseScrobble'
import { logInfo, logError } from '@/helpers/logger'
import PersistStatus from '@/store/PersistStatus'

// 开关：听歌排行（play）与最近播放（startplay）
function rankingSyncEnabled() { return PersistStatus.get('music.scrobbleToNetease') !== false }
function recentSyncEnabled() { return PersistStatus.get('music.recentSyncNetease') !== false }

// 只监听 PlaybackActiveTrackChanged（活跃曲目变化，最可靠）
// 不再同时监听 PlaybackTrackChanged，否则切歌一次会触发两次 startplay
const events = [
	Event.PlaybackState,
	Event.PlaybackError,
	Event.PlaybackQueueEnded,
	Event.PlaybackActiveTrackChanged,
	Event.PlaybackPlayWhenReadyChanged,
]

// 存储当前已上报的歌曲信息，用于切换歌曲时完成上报
let currentReported: {
  trackId: number
  sourceId: number
  startTime: number
} | null = null

// 防重复：记录最近一次 startplay 的 trackId 和时间
let lastStartTrackId: number | null = null
let lastStartTime = 0
// 同一首歌 30 秒内不重复上报 startplay
const START_DEDUP_MS = 30000

/**
 * 从 track 对象中提取网易云歌曲 ID
 */
function extractNeteaseTrackId(track: Track | null | undefined): number | null {
  if (!track) return null

  const idFields = ['id', 'neteaseId', 'wyId', 'songId', 'musicId']
  for (const field of idFields) {
    const value = (track as any)[field]
    if (value && typeof value === 'number' && value > 0) {
      return value
    }
    if (value && typeof value === 'string') {
      const cleanId = value.replace(/^(netease_|wy_)/, '')
      const numId = parseInt(cleanId, 10)
      if (!isNaN(numId) && numId > 0) {
        return numId
      }
    }
  }

  const url = (track as any).url || (track as any).uri || ''
  if (url) {
    const idMatch = url.match(/[?&]id=(\d+)/) || url.match(/\/song\/(\d+)/)
    if (idMatch) {
      return parseInt(idMatch[1], 10)
    }
  }

  return null
}

/**
 * 判断是否为网易云歌曲
 */
function isNeteaseTrack(track: Track | null | undefined): boolean {
  if (!track) return false

  const platform = (track as any).platform || (track as any).source || ''
  if (platform === 'netease' || platform === 'wy' || platform === 'netease_cloud') {
    return true
  }

  const id = extractNeteaseTrackId(track)
  return id !== null
}

/**
 * 获取来源歌单 ID
 */
function extractSourceId(track: Track | null | undefined): number {
  if (!track) return 0
  const sourceId = (track as any).playlistId || (track as any).sourceId || (track as any).albumId
  if (sourceId && typeof sourceId === 'number') {
    return sourceId
  }
  return 0
}

export const useLogTrackPlayerState = () => {
	useTrackPlayerEvents(events, async (event) => {
		if (event.type === Event.PlaybackState) {
			console.log('Playback state: ', event.state)

			// 听歌排行只在"整首听完"时由 lyricManager 按进度接近结尾上报，
			// 这里不再因 ended/切歌补报，避免没听完就计入听歌排行。
			if (event.state === 'ended' || event.state === 3) {
				currentReported = null
			}
		} else if (event.type === Event.PlaybackQueueEnded) {
			console.log(' PlaybackQueueEnded: ', event.track)
		} else if (event.type === Event.PlaybackPlayWhenReadyChanged) {
			console.log('Ready ?:', event.playWhenReady)
		}
		// 活跃曲目变化（切歌）时触发——只在这里处理，保证一首歌只 startplay 一次
		else if (event.type === Event.PlaybackActiveTrackChanged) {
			try {
				const newTrack = (event as any).track
				const newTrackId = extractNeteaseTrackId(newTrack)

				if (!newTrackId || !isNeteaseTrack(newTrack) || !isNeteaseLoggedIn()) {
					return
				}

				const sourceId = extractSourceId(newTrack)
				const now = Date.now()

				// 防重复：同一首歌在 30 秒内已经 startplay 过，跳过
				if (newTrackId === lastStartTrackId && now - lastStartTime < START_DEDUP_MS) {
					logInfo('[听歌上报] 同一首歌，跳过重复startplay', { trackId: newTrackId })
					return
				}

				// 切歌不补报上一首的 play（听歌排行）——只有真的听完才计；
				// 最近播放（startplay）不受影响，照常上报。

				// 开始新歌曲的 startplay 上报（写入最近播放）
				if (recentSyncEnabled()) await scrobbleStart(newTrackId, sourceId)
				currentReported = { trackId: newTrackId, sourceId, startTime: now }
				lastStartTrackId = newTrackId
				lastStartTime = now
				logInfo('[听歌上报] 切歌-开始新歌曲', { trackId: newTrackId, sourceId })
			} catch (e) {
				logError('[听歌上报] 歌曲切换处理失败', e)
			}
		} else {
			// 其他事件忽略
		}
	})
}