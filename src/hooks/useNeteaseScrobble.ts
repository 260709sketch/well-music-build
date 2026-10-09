import { useEffect, useRef } from 'react'
import { scrobbleStartNeteaseSong, scrobbleNeteaseSong } from '@/helpers/userApi/netease-music-api'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'

// 判断是否是网易云歌曲
export const isNeteaseTrack = (track: any): boolean => {
  if (!track) return false
  const platform = track.platform || track.source || ''
  const id = String(track.id || track.songmid || '')
  return platform === 'netease' || platform === 'wy' || id.startsWith('netease_') || id.startsWith('wy_') || /^\d+$/.test(id)
}

// 获取网易云歌曲ID（去除前缀）
export const getNeteaseSongId = (track: any): string => {
  const id = String(track?.id || track?.songmid || '')
  return id.replace(/^(netease_|wy_)/, '')
}

// 获取网易云 cookie
const getNeteaseCookie = (): string => {
  try {
    return useDailyRecommendStore.getState().cookie || ''
  } catch {
    return ''
  }
}

interface ScrobbleOptions {
  track: any
  isPlaying: boolean
  currentTime: number
  duration: number
}

/**
 * 网易云听歌上报 Hook
 * - 播放开始时发送 startplay（写入最近播放）
 * - 播放超过10秒或歌曲10%时发送 play（增加听歌排行次数）
 * 参考 Kumone 实现：startplay + play 两个 weblog 都必须发送
 */
export const useNeteaseScrobble = ({ track, isPlaying, currentTime, duration }: ScrobbleOptions) => {
  const startScrobbledRef = useRef(false)
  const finishScrobbledRef = useRef(false)
  const lastTrackIdRef = useRef<string>('')
  const cookieRef = useRef<string>('')

  // 歌曲变化时重置状态
  useEffect(() => {
    const songId = getNeteaseSongId(track)
    if (songId !== lastTrackIdRef.current) {
      lastTrackIdRef.current = songId
      startScrobbledRef.current = false
      finishScrobbledRef.current = false
      cookieRef.current = getNeteaseCookie()
    }
  }, [track])

  // 播放开始时发送 startplay（写入最近播放）
  useEffect(() => {
    if (!isPlaying || !track || !isNeteaseTrack(track)) return
    if (startScrobbledRef.current) return
    if (!cookieRef.current) return // 未登录网易云不发送

    startScrobbledRef.current = true
    const songId = getNeteaseSongId(track)
    console.log(`[Scrobble] startplay: ${songId}`)
    scrobbleStartNeteaseSong(songId, cookieRef.current).catch((e) => {
      console.error('[Scrobble] startplay failed:', e)
      startScrobbledRef.current = false // 失败后允许重试
    })
  }, [isPlaying, track])

  // 播放进度超过阈值时发送 play（增加听歌排行次数）
  useEffect(() => {
    if (!isPlaying || !track || !isNeteaseTrack(track)) return
    if (finishScrobbledRef.current) return
    if (!cookieRef.current) return
    if (currentTime <= 0 || duration <= 0) return

    // 阈值：播放超过10秒，或超过歌曲时长的10%（取较小值）
    const threshold = Math.min(10, duration * 0.1)
    if (currentTime < threshold) return

    finishScrobbledRef.current = true
    const songId = getNeteaseSongId(track)
    const playedSeconds = Math.floor(currentTime)
    console.log(`[Scrobble] play: ${songId}, ${playedSeconds}s`)
    scrobbleNeteaseSong(songId, playedSeconds, cookieRef.current).catch((e) => {
      console.error('[Scrobble] play failed:', e)
      finishScrobbledRef.current = false // 失败后允许重试
    })
  }, [currentTime, duration, isPlaying, track])
}
