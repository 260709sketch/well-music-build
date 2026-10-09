// 跨平台换源：当前音源失败后，搜索其他平台的同名歌曲
import { searchNeteaseMusic } from './userApi/netease-music-api'
import { searchKugouMusic } from './userApi/kugou-music-api'
import { searchKuwoMusic } from './userApi/kuwo-music-api'

export interface CrossPlatformMatch {
  id: string
  platform: string
  title: string
  artist: string
  album?: string
  artwork?: string
  duration?: number
  songmid: string
}

// 清理字符串用于匹配
const cleanStr = (str: string): string => {
  if (!str) return ''
  return String(str)
    .replace(/\s|'|\.|,|，|&|"|、|\(|\)|（|）|`|~|-|<|>|\||\/|\]|\[|!|！/g, '')
    .toLowerCase()
    .trim()
}

// 解析时长为秒
const parseDuration = (duration: any): number => {
  if (!duration) return 0
  if (typeof duration === 'number') return duration
  if (typeof duration === 'string') {
    const parts = duration.split(':')
    let sec = 0
    let unit = 1
    while (parts.length) {
      sec += parseInt(parts.pop() || '0') * unit
      unit *= 60
    }
    return sec
  }
  return 0
}

// 匹配歌曲：歌名+歌手+时长
const matchSong = (
  results: any[],
  originalTitle: string,
  originalArtist: string,
  originalDuration: number,
  platform: string,
): CrossPlatformMatch | null => {
  if (!results || results.length === 0) return null

  const fTitle = cleanStr(originalTitle)
  const fArtist = cleanStr(originalArtist)

  let bestMatch: CrossPlatformMatch | null = null
  let bestScore = -1

  for (const item of results) {
    const title = item.title || item.name || item.songname || ''
    const artist = item.artist || item.singer || item.artists || ''
    const duration = parseDuration(item.duration || item.interval || item.dt)

    const fItemTitle = cleanStr(title)
    const fItemArtist = cleanStr(artist)

    // 歌名匹配
    const titleMatch = fTitle.includes(fItemTitle) || fItemTitle.includes(fTitle)
    if (!titleMatch) continue

    // 歌手匹配
    const artistMatch = !fArtist || !fItemArtist || fArtist.includes(fItemArtist) || fItemArtist.includes(fArtist)

    // 时长匹配（5秒内）
    const durationMatch = !originalDuration || !duration || Math.abs(originalDuration - duration) < 5

    let score = 0
    if (titleMatch) score += 50
    if (artistMatch) score += 30
    if (durationMatch) score += 20

    if (score > bestScore) {
      bestScore = score
      const prefix = platform === 'netease' ? 'netease_' : platform === 'kugou' ? 'kg_' : 'kw_'
      bestMatch = {
        id: String(item.id),
        platform,
        title,
        artist,
        album: item.album || item.albumName,
        artwork: item.artwork || item.picUrl || item.img,
        duration,
        songmid: prefix + item.id,
      }
    }
  }

  return bestScore >= 60 ? bestMatch : null
}

/**
 * 跨平台搜索匹配歌曲
 * @param title 歌名
 * @param artist 歌手
 * @param duration 时长（秒）
 * @param excludePlatform 排除的平台（当前平台）
 * @returns 匹配到的歌曲信息
 */
export const searchCrossPlatform = async (
  title: string,
  artist: string,
  duration: number,
  excludePlatform?: string,
): Promise<CrossPlatformMatch | null> => {
  console.log(`[跨平台换源] 搜索: "${title}" - "${artist}", 时长: ${duration}s, 排除: ${excludePlatform}`)

  const platforms = [
    { key: 'netease', search: searchNeteaseMusic },
    { key: 'kugou', search: searchKugouMusic },
    { key: 'kuwo', search: searchKuwoMusic },
  ].filter(p => p.key !== excludePlatform)

  for (const { key, search } of platforms) {
    try {
      console.log(`[跨平台换源] 搜索 ${key}...`)
      const query = `${title} ${artist}`.trim()
      const result = await search(query, 1, 10)
      const data = result?.data || []
      console.log(`[跨平台换源] ${key} 返回 ${data.length} 条结果`)

      const match = matchSong(data, title, artist, duration, key)
      if (match) {
        console.log(`[跨平台换源] 匹配成功: [${key}] "${match.title}" - "${match.artist}" (${match.duration}s)`)
        return match
      }
    } catch (e: any) {
      console.log(`[跨平台换源] ${key} 搜索失败: ${e?.message}`)
    }
  }

  console.log('[跨平台换源] 未找到匹配歌曲')
  return null
}
