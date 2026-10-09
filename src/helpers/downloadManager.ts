import RNFS from 'react-native-fs'
import { musicApiStore, musicApiSelectedStore, enabledMusicSourcesStore } from '@/player/PlayerStore'
import { writeAudioMetadata, fetchLyrics } from '@/helpers/audioMetadata'
import PersistStatus from '@/store/PersistStatus'
import { Platform } from 'react-native'

export type DownloadQuality = '128k' | '320k' | 'flac' | '24bit' | 'hires' | 'master'

export const DOWNLOAD_QUALITIES: { id: DownloadQuality; label: string; ext: string }[] = [
  { id: '128k', label: '标准 128k', ext: 'mp3' },
  { id: '320k', label: '高清 320k', ext: 'mp3' },
  { id: 'flac', label: '无损 FLAC', ext: 'flac' },
  { id: '24bit', label: '24Bit', ext: 'flac' },
  { id: 'hires', label: 'Hi-Res', ext: 'flac' },
  { id: 'master', label: '母带 Master', ext: 'flac' },
]

const DOWNLOAD_PATH_KEY = 'music.downloadPath'
const DEFAULT_DOWNLOAD_DIR = Platform.OS === 'ios'
  ? `${RNFS.DocumentDirectoryPath}/downloads`
  : `${RNFS.ExternalDirectoryPath}/downloads`

export const getDownloadPath = (): string => {
  const saved = PersistStatus.get(DOWNLOAD_PATH_KEY)
  return saved || DEFAULT_DOWNLOAD_DIR
}

export const setDownloadPath = (path: string) => {
  PersistStatus.set(DOWNLOAD_PATH_KEY, path)
}

const ensureDir = async (dir: string) => {
  try {
    const exists = await RNFS.exists(dir)
    if (!exists) await RNFS.mkdir(dir)
  } catch (e) {
    console.error('[download] create dir error', e)
  }
}

const sanitizeFilename = (name: string): string => {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim()
}

// 从歌曲对象提取封面URL（尝试多个字段）
const extractCoverUrl = (song: any): string | null => {
  const candidates = [
    song?.artwork,
    song?.pic,
    song?.cover,
    song?.albumPic,
    song?.img,
    song?.image,
    song?.singerImg,
    (song as any)?.album?.pic,
    (song as any)?.album?.cover,
  ]
  for (const url of candidates) {
    if (url && typeof url === 'string' && url.startsWith('http')) {
      return url
    }
  }
  return null
}

// 验证URL是否可访问
const validateAudioUrl = async (url: string): Promise<boolean> => {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 3000)
    const response = await fetch(url, { method: 'HEAD', signal: controller.signal })
    clearTimeout(timeoutId)
    return response.ok || response.status === 206
  } catch {
    return false
  }
}

// 内联 base64 解码（不依赖 Buffer，避免 RN 环境 polyfill 不一致）
function base64ToBytes(base64: string): number[] {
	const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '')
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	const bytes: number[] = []
	let i = 0
	while (i < clean.length) {
		const c1 = chars.indexOf(clean[i++])
		const c2 = chars.indexOf(clean[i++])
		const c3 = chars.indexOf(clean[i++])
		const c4 = chars.indexOf(clean[i++])
		if (c1 < 0 || c2 < 0) break
		bytes.push((c1 << 2) | (c2 >> 4))
		if (c3 < 0) break
		bytes.push(((c2 & 15) << 4) | (c3 >> 2))
		if (c4 < 0) break
		bytes.push(((c3 & 3) << 6) | c4)
	}
	return bytes
}

// 读取文件前若干字节，判断是否为真实音频（而非 HTML 错误页 / JSON 提示）
const verifyAudioFileHeader = async (filePath: string): Promise<boolean> => {
  try {
    // 读取文件前 16 字节（base64）
    const headerB64 = await RNFS.read(filePath, 16, 0, 'base64')
    const bytes = base64ToBytes(headerB64)
    const ascii = bytes.map(b => String.fromCharCode(b)).join('')

    console.log(`[download] 文件头 bytes=[${bytes.slice(0,8).map(b=>b.toString(16)).join(',')}] ascii="${ascii.slice(0,8)}"`)

    // 明确是网页/文本错误页
    if (ascii.startsWith('<!DOC') || ascii.startsWith('<html') || ascii.startsWith('<?xml')) {
      console.log('[download] 文件是HTML页面，不是音频')
      return false
    }

    // MP3: ID3 开头
    if (ascii.startsWith('ID3')) return true
    // MP3 帧头: 0xFF 0xFB / 0xFF 0xF3 / 0xFF 0xF2 / 0xFF 0xFA
    if (bytes[0] === 0xff && (bytes[1] === 0xfb || bytes[1] === 0xf3 || bytes[1] === 0xf2 || bytes[1] === 0xfa)) return true
    // FLAC: fLaC
    if (ascii.startsWith('fLaC')) return true
    // OGG: OggS
    if (ascii.startsWith('OggS')) return true
    // M4A/AAC: ftyp
    if (ascii.slice(4, 8) === 'ftyp') return true
    // WAV: RIFF....WAVE
    if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WAVE') return true
    // APE: MAC 
    if (ascii.startsWith('MAC ')) return true
    // WavPack: wvpk
    if (ascii.startsWith('wvpk')) return true

    // 无法识别的格式，保守起见：如果文件足够大也认为有效（某些无损格式头不同）
    const stat = await RNFS.stat(filePath)
    const size = parseInt(stat.size, 10) || 0
    console.log(`[download] 未识别文件头，放行 size=${size}`)
    return size > 50 * 1000 // 大于50KB 才放行
  } catch (e) {
    console.log('[download] 文件头读取失败:', e)
    return false
  }
}

// 直接调用音源API获取指定音质的下载URL（不经过resolveSource，避免降级/缓存干扰）
export const getDownloadUrl = async (
  song: IMusic.IMusicItem,
  quality: DownloadQuality,
): Promise<string | null> => {
  const allApis = musicApiStore.getValue() || []
  const selectedApi = musicApiSelectedStore.getValue()
  const enabledIds = enabledMusicSourcesStore.getValue() || []

  // 构建尝试列表：当前选中音源优先，然后其他启用音源
  const tryList: any[] = []
  if (selectedApi) tryList.push(selectedApi)
  for (const api of allApis) {
    if (api?.id !== selectedApi?.id && enabledIds.includes(api.id)) {
      tryList.push(api)
    }
  }
  // 如果都没有，用全部音源
  if (tryList.length === 0) {
    for (const api of allApis) {
      if (api) tryList.push(api)
    }
  }

  const requestKey = `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
  const songId = song.songmid || song.id || ''

  for (const api of tryList) {
    if (!api?.getMusicUrl) continue
    try {
      const url = await Promise.race([
        api.getMusicUrl(
          song.title,
          song.artist,
          songId,
          quality as any,
          { requestKey, requestType: 'download', timeoutMs: 10000 },
        ),
        new Promise<string>((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), 10000),
        ),
      ])

      if (url && typeof url === 'string' && url.startsWith('http') && !url.includes('fake')) {
        const isValid = await validateAudioUrl(url)
        if (isValid) {
          console.log(`[download] ${api.name} ${quality} URL OK`)
          return url
        }
        console.log(`[download] ${api.name} ${quality} URL invalid`)
      }
    } catch (e: any) {
      console.log(`[download] ${api?.name || '?'} ${quality} failed: ${e?.message || e}`)
    }
  }

  return null
}

export type DownloadProgress = {
  jobId: number
  contentLength: number
  bytesWritten: number
  percent: number
}

// 正在下载的任务追踪
export type ActiveDownload = {
  id: string
  name: string
  quality: string
  percent: number
  status: 'resolving' | 'downloading' | 'done' | 'failed'
  error?: string
  speed?: number // 下载速度 bytes/s
  bytesWritten?: number // 已下载字节
  contentLength?: number // 总字节
}

const activeDownloads = new Map<string, ActiveDownload>()
const downloadListeners = new Set<() => void>()

const notifyDownloadListeners = () => {
  downloadListeners.forEach((fn) => fn())
}

export const subscribeDownloads = (fn: () => void) => {
  downloadListeners.add(fn)
  return () => downloadListeners.delete(fn)
}

export const getActiveDownloads = (): ActiveDownload[] => {
  return Array.from(activeDownloads.values())
}

const updateActiveDownload = (id: string, patch: Partial<ActiveDownload>) => {
  const existing = activeDownloads.get(id)
  if (existing) {
    activeDownloads.set(id, { ...existing, ...patch })
  }
  notifyDownloadListeners()
}

const removeActiveDownload = (id: string) => {
  activeDownloads.delete(id)
  notifyDownloadListeners()
}

export const clearCompletedDownloads = () => {
  for (const [id, item] of activeDownloads) {
    if (item.status === 'done' || item.status === 'failed') {
      activeDownloads.delete(id)
    }
  }
  notifyDownloadListeners()
}

export const downloadSong = async (
  song: IMusic.IMusicItem,
  quality: DownloadQuality,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<{ success: boolean; filePath?: string; error?: string }> => {
  const downloadId = `${song.id || song.songmid || song.title}_${quality}_${Date.now()}`
  const songName = `${song.artist || '未知'} - ${song.title || '未知'}`
  const qualityLabel = DOWNLOAD_QUALITIES.find((q) => q.id === quality)?.label || quality

  // 注册到正在下载列表
  activeDownloads.set(downloadId, {
    id: downloadId,
    name: songName,
    quality: qualityLabel,
    percent: 0,
    status: 'resolving',
  })
  notifyDownloadListeners()

  // 1. 获取URL（直接调音源，指定音质）
  const url = await getDownloadUrl(song, quality)
  if (!url) {
    updateActiveDownload(downloadId, { status: 'failed', error: '音源无法下载此音质' })
    updateActiveDownload(downloadId, { status: 'failed', error: '音源无法下载此音质，请选择其他音质或者换源解决' })
    return { success: false, error: '音源无法下载此音质，请选择其他音质或者换源解决' }
  }

  updateActiveDownload(downloadId, { status: 'downloading', percent: 1 })

  // 2. 确定文件路径
  const downloadDir = getDownloadPath()
  await ensureDir(downloadDir)

  const qualityInfo = DOWNLOAD_QUALITIES.find((q) => q.id === quality) || DOWNLOAD_QUALITIES[1]
  const artist = sanitizeFilename(song.artist || '未知歌手')
  const title = sanitizeFilename(song.title || '未知歌曲')
  const filename = `${artist} - ${title}.${qualityInfo.ext}`
  const filePath = `${downloadDir}/${filename}`

  // 3. 检查是否已存在
  try {
    const exists = await RNFS.exists(filePath)
    if (exists) {
      updateActiveDownload(downloadId, { status: 'done', percent: 100 })
      setTimeout(() => removeActiveDownload(downloadId), 3000)
      return { success: true, filePath, error: '已存在同名文件，跳过下载' }
    }
  } catch {}

  // 4. 下载（RNFS 原生下载 + progress 回调，实时更新进度）
  try {
    let lastBytes = 0
    let lastTime = Date.now()

    const download = RNFS.downloadFile({
      fromUrl: url,
      toFile: filePath,
      background: false,
      progressDivider: 1,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
        'Cache-Control': 'no-cache',
      },
      begin: (res) => {
        if (res.contentLength > 0) {
          updateActiveDownload(downloadId, {
            percent: 1,
            status: 'downloading',
            contentLength: res.contentLength,
            bytesWritten: 0,
          })
        }
      },
      progress: (res) => {
        if (res.contentLength > 0) {
          const percent = Math.min(99, (res.bytesWritten / res.contentLength) * 100)
          const now = Date.now()
          const elapsed = (now - lastTime) / 1000
          const speed = elapsed > 0 ? (res.bytesWritten - lastBytes) / elapsed : 0
          lastBytes = res.bytesWritten
          lastTime = now
          updateActiveDownload(downloadId, {
            percent,
            status: 'downloading',
            speed,
            bytesWritten: res.bytesWritten,
            contentLength: res.contentLength,
          })
          if (onProgress) {
            onProgress({
              jobId: res.jobId,
              contentLength: res.contentLength,
              bytesWritten: res.bytesWritten,
              percent,
            })
          }
        }
      },
    })

    const result = await download.promise

    // 接受所有 2xx 状态码
    if (result.statusCode >= 200 && result.statusCode < 300) {
      // 验证文件是否为真实音频（检查文件头，比单纯看大小更准确）
      const fileValid = await verifyAudioFileHeader(filePath)

      if (!fileValid) {
        try { await RNFS.unlink(filePath) } catch {}
        updateActiveDownload(downloadId, { status: 'failed', error: '下载完成但文件无效（可能是错误页面）' })
        return { success: false, error: '下载完成但文件无效，请更换音质或音源重试' }
      }

      updateActiveDownload(downloadId, { status: 'done', percent: 100 })
      // 完成后3秒自动移除记录
      setTimeout(() => removeActiveDownload(downloadId), 3000)

      // 写入元数据（封面/歌词）。FLAC 已改为流式写入，母带/Hi-Res/24bit 大文件也会写入，不再按体积跳过
      setTimeout(async () => {
        try {
          const lyrics = await fetchLyrics(song).catch(() => null)
          const coverUrl = extractCoverUrl(song)
          console.log('[download] metadata:', { title: song.title, artist: song.artist, coverUrl: !!coverUrl, hasLyrics: !!lyrics })
          await writeAudioMetadata(filePath, {
            title: song.title || '',
            artist: song.artist || '',
            album: (song as any).album || '',
            coverUrl: coverUrl || undefined,
            lyrics: lyrics || undefined,
          })
        } catch (e) {
          console.log('[download] metadata write failed:', e)
        }
      }, 500)

      return { success: true, filePath }
    }
    // 清理失败的残文件
    try { await RNFS.unlink(filePath) } catch {}
    updateActiveDownload(downloadId, { status: 'failed', error: `HTTP ${result.statusCode}` })
    return { success: false, error: `下载失败 (HTTP ${result.statusCode})` }
  } catch (e: any) {
    try { await RNFS.unlink(filePath) } catch {}
    updateActiveDownload(downloadId, { status: 'failed', error: e?.message || '下载失败' })
    return { success: false, error: e?.message || '下载失败' }
  }
}

export const getDownloadedFiles = async (): Promise<{ name: string; size: number; path: string }[]> => {
  const dir = getDownloadPath()
  try {
    const exists = await RNFS.exists(dir)
    if (!exists) return []
    const files = await RNFS.readDir(dir)
    return files
      .filter((f) => f.isFile() && /\.(mp3|flac|wav|m4a)$/i.test(f.name))
      .map((f) => ({ name: f.name, size: (f as any).size || 0, path: f.path }))
      .sort((a, b) => b.size - a.size)
  } catch {
    return []
  }
}

export const deleteDownloadedFile = async (path: string): Promise<boolean> => {
  try {
    await RNFS.unlink(path)
    return true
  } catch {
    return false
  }
}

export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
