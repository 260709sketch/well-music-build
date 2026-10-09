// 封面解析：QQ 音乐封面有防盗链，WebView 加载失败导致动态背景黑屏
// 自动用同名+同歌手搜索酷狗（4秒超时），失败后 fallback 网易云搜索同名同歌手同专辑
import { searchKugouMusic } from '@/helpers/userApi/kugou-music-api'
import { searchNeteaseMusic } from '@/helpers/userApi/netease-music-api'

// 缓存：歌曲标识 -> 封面 URL，避免重复搜索
const artworkCache = new Map<string, string>()

// 判断是否为 QQ 音乐封面（有防盗链）
const isQQArtwork = (url?: string): boolean => {
  if (!url) return false
  return /y\.gtimg\.cn|imgcache\.qq\.com|qpic\.y\.qq\.com|music\.qq\.com/i.test(url)
}

// 判断歌曲是否来自 QQ 音乐平台
const isQQPlatform = (track: any): boolean => {
  const platform = String(track?.platform || track?.source || '').toLowerCase()
  if (platform === 'qq' || platform === 'tencent' || platform === 'tx') return true
  const id = String(track?.id || track?.songmid || '')
  if (id.startsWith('qq_') || id.startsWith('tx_')) return true
  return isQQArtwork(track?.artwork)
}

// 从歌手字段提取主要歌手名（去掉分隔符后的第一个）
const extractMainArtist = (artist?: string): string => {
  if (!artist) return ''
  return artist.split(/[\/、,&]/)[0].trim()
}

// 带超时的 Promise
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ])

// 从搜索结果中匹配最佳歌曲（同名+同歌手优先，其次同名，再次第一个）
const findBestMatch = (
  list: any[],
  title: string,
  artist: string,
  album?: string
): any | null => {
  if (!list || list.length === 0) return null
  const targetTitle = title.toLowerCase()
  const targetArtist = artist.toLowerCase()
  const targetAlbum = (album || '').toLowerCase()

  // 1. 同名 + 同歌手 + 同专辑
  let matched = list.find((item: any) => {
    const itemTitle = String(item.title || '').toLowerCase()
    const itemArtist = String(item.artist || '').toLowerCase()
    const itemAlbum = String(item.album || '').toLowerCase()
    return itemTitle === targetTitle &&
      (targetArtist === '' || itemArtist.includes(targetArtist) || targetArtist.includes(itemArtist)) &&
      (targetAlbum === '' || itemAlbum.includes(targetAlbum) || targetAlbum.includes(itemAlbum))
  })

  // 2. 同名 + 同歌手
  if (!matched) {
    matched = list.find((item: any) => {
      const itemTitle = String(item.title || '').toLowerCase()
      const itemArtist = String(item.artist || '').toLowerCase()
      return itemTitle === targetTitle &&
        (targetArtist === '' || itemArtist.includes(targetArtist) || targetArtist.includes(itemArtist))
    })
  }

  // 3. 同名
  if (!matched) {
    matched = list.find((item: any) => String(item.title || '').toLowerCase() === targetTitle)
  }

  // 4. 第一个结果
  if (!matched) {
    matched = list[0]
  }

  return matched || null
}

/**
 * 解析适用于 AMLL 动态背景的封面 URL
 * - QQ 音乐：先搜酷狗（4秒超时），失败后搜网易云，都失败用原封面
 * - 其他平台：直接用原封面
 */
export const resolveAMLLArtwork = async (
  track: { title?: string; artist?: string; album?: string; artwork?: string; id?: string; platform?: string; source?: string }
): Promise<string> => {
  const originalArt = track?.artwork || ''

  // 非 QQ 音乐直接用原封面
  if (!isQQPlatform(track as any)) {
    return originalArt
  }

  // 查缓存
  const cacheKey = `${track?.id || ''}_${track?.title || ''}_${track?.artist || ''}`
  if (cacheKey !== '_' && artworkCache.has(cacheKey)) {
    return artworkCache.get(cacheKey)!
  }

  const title = (track?.title || '').trim()
  const artist = extractMainArtist(track?.artist)
  const album = (track?.album || '').trim()
  if (!title) return originalArt

  const keyword = artist ? `${title} ${artist}` : title

  // 1. 酷狗搜索（4秒超时）
  try {
    const result = await withTimeout(searchKugouMusic(keyword, 1, 10), 4000)
    if (result?.data && result.data.length > 0) {
      const matched = findBestMatch(result.data, title, artist, album)
      if (matched?.artwork) {
        if (cacheKey !== '_') artworkCache.set(cacheKey, matched.artwork)
        return matched.artwork
      }
    }
  } catch (e) {
    console.warn('[resolveAMLLArtwork] 酷狗搜索超时/失败，尝试网易云:', e)
  }

  // 2. 网易云搜索 fallback
  try {
    const result = await searchNeteaseMusic(keyword, 1, 10)
    const list = result?.data || result?.songs || result
    if (Array.isArray(list) && list.length > 0) {
      const matched = findBestMatch(list, title, artist, album)
      if (matched?.artwork) {
        if (cacheKey !== '_') artworkCache.set(cacheKey, matched.artwork)
        return matched.artwork
      }
    }
  } catch (e) {
    console.warn('[resolveAMLLArtwork] 网易云搜索失败，使用原封面:', e)
  }

  return originalArt
}

// 清空缓存
export const clearAMLLArtworkCache = () => {
  artworkCache.clear()
}
