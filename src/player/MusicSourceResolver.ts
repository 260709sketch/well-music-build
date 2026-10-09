import { fakeAudioMp3Uri } from '@/constants/images'
import { logError, logInfo } from '@/helpers/logger'
import {
	myGetMusicUrl,
	getNeteaseMusicUrl,
	getKugouMusicUrl,
	getMusicFromKw,
} from '@/helpers/userApi/getMusicSource'
import { searchNeteaseMusic } from '@/helpers/userApi/netease-music-api'
import { getQQMusicUrl } from '@/helpers/userApi/xiaoqiu'
import { searchWithKeyword as searchQQMusic } from '@/helpers/userApi/qq-music-api'
import PersistStatus from '@/store/PersistStatus'
import { useSourceSwitchToastStore } from '@/store/sourceSwitchToastStore'
import { showToast } from '@/utils/utils'
import { reloadLxMusicScript } from '@/helpers/userApi/lxMusicSourceAdapter'
import { createMusicApiFromScript } from '@/helpers/userApi/importMusicSource'
import { tryBuiltinUnblock } from '@/helpers/unblockSources'
import RNFS from 'react-native-fs'
import { isCached, getLocalFilePath } from './CacheManager'
import { musicApiSelectedStore, nowApiState, qualityStore, enabledMusicSourcesStore, musicApiStore } from './PlayerStore'
import { useCrossPlatformFallbackStore } from '@/store/crossPlatformFallbackStore'
import { useAutoSourceSwitchStore } from '@/store/autoSourceSwitchStore'
import { useSourceRequestLogStore } from '@/store/sourceRequestLogStore'

export type SourceResult = {
	url: string
	wasCached: boolean
	/** 实际命中的音源 id（用于播放失败后去重，避免反复横跳同一音源） */
	sourceId?: string | null
	sourceName?: string | null
	quality?: string | null
}

export type ResolveSourceRequestType = 'current' | 'preload'

type ResolveSourceOptions = {
	requestType?: ResolveSourceRequestType
	fallbackMode?: 'all' | 'source_only' | 'quality_only'
	bypassCache?: boolean  // 启动自动播放时绕开所有缓存，强制向音源请求新链接
	/** 本次解析需要排除的音源 id（自动换源时传入已确证播放失败的源，每个源对同一首歌只试一次） */
	excludeSourceIds?: string[]
	/** 后台解析（如冷启动恢复队列）：静默，不弹智能换源/音质降级/失败等任何提示 */
	silent?: boolean
}

type MusicUrlRequestContext = {
	requestKey: string
	requestType: ResolveSourceRequestType
	timeoutMs: number
}

const preloadCache = new Map<string, string>()
// 当前正在解析的「正在播放」请求数；>0 时 preload 让出，避免抢占单例音源运行时导致切歌卡住
let activeCurrentCount = 0
// 内存播放链接缓存（加速二次播放）- 带时间戳用于过期检查
const urlMemoryCache = new Map<string, { url: string; timestamp: number }>()
const MEM_CACHE_EXPIRY_MS = 5 * 60 * 1000 // 5分钟过期
// 音质降级恢复：记录用户原始音质，下一首歌自动恢复
let degradedQualityRestore: IMusic.IQualityKey | null = null
const CURRENT_SOURCE_REQUEST_TIMEOUT_MS = 6000
const PRELOAD_SOURCE_REQUEST_TIMEOUT_MS = 10000

const isCurrentSourceRequest = (requestType: ResolveSourceRequestType) =>
	requestType === 'current'

const getSourceRequestTimeoutMs = (requestType: ResolveSourceRequestType) =>
	isCurrentSourceRequest(requestType)
		? CURRENT_SOURCE_REQUEST_TIMEOUT_MS
		: PRELOAD_SOURCE_REQUEST_TIMEOUT_MS

const getMusicItemSourceKey = (item: IMusic.IMusicItem) =>
	String(item.platform || item.source || 'unknown').replace(/\s+/g, '_')

const createTimeoutPromise = (timeoutMs: number) =>
	new Promise<never>((_, reject) => {
		setTimeout(() => reject(new Error('请求超时')), timeoutMs)
	})

// 快速检查URL是否有效（1秒超时，用于缓存链接验证）
const checkUrlValid = async (url: string): Promise<boolean> => {
	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 1000)
		const response = await fetch(url, {
			method: 'HEAD',
			signal: controller.signal,
		})
		clearTimeout(timeoutId)
		return response.ok || response.status === 206
	} catch {
		return false
	}
}

const createSourceRequestKey = (
	item: IMusic.IMusicItem,
	requestType: ResolveSourceRequestType,
) =>
	`source_${requestType}_${getMusicItemSourceKey(item)}_${item.id}_${Date.now().toString(36)}_${Math.random()
		.toString(36)
		.slice(2, 8)}`

const getSourceRequestLogPrefix = (
	requestType: ResolveSourceRequestType,
	requestKey: string,
) => `[sourceResolver][${requestType}][requestKey=${requestKey}]`

function makePreloadKey(item: IMusic.IMusicItem, sourceId?: string): string {
	const srcId = sourceId || musicApiSelectedStore.getValue()?.id || 'default'
	return `${srcId}::${getMusicItemSourceKey(item)}://${item.id}`
}

export const getPreloadedUrl = (item: IMusic.IMusicItem): string | undefined => {
	return preloadCache.get(makePreloadKey(item))
}

/**
 * 清除指定歌曲的内存缓存和预加载缓存（播放失败重试时调用，避免用过期URL）
 */
export const clearMemoryCacheForItem = (item: IMusic.IMusicItem): void => {
	const srcIdForClear = musicApiSelectedStore.getValue()?.id || 'default'
	const memCacheKey = `${srcIdForClear}::${item.platform || item.source || 'unknown'}_${item.id || item.songmid}`
	urlMemoryCache.delete(memCacheKey)
	preloadCache.delete(makePreloadKey(item))
}

export const preloadSource = async (item: IMusic.IMusicItem): Promise<void> => {
	// 当前正在解析要播放的歌时，preload 让出单例音源运行时/网络，避免拖慢切歌甚至卡死
	if (activeCurrentCount > 0) return
	const key = makePreloadKey(item)
	if (preloadCache.has(key)) return
	try {
		const result = await resolveSource(item, { requestType: 'preload' })
		if (result.url && !result.url.includes('fake')) {
			preloadCache.set(key, result.url)
			if (preloadCache.size > 10) {
				const firstKey = preloadCache.keys().next().value
				if (firstKey) preloadCache.delete(firstKey)
			}
		}
	} catch {
		// preload failures are silent
	}
}

const setQuality = (quality: IMusic.IQualityKey) => {
	qualityStore.setValue(quality)
	PersistStatus.set('music.quality', quality)
}



// 从 songmid/id 中解析平台和纯ID
const parsePlatformFromId = (id: string, platform: string) => {
	const rawId = String(id || '')
	// 通过前缀判断平台
	if (rawId.startsWith('netease_') || rawId.startsWith('wy_')) {
		return { platform: 'netease', cleanId: rawId.replace(/^(netease_|wy_)/, '') }
	}
	if (rawId.startsWith('kugou_') || rawId.startsWith('kg_')) {
		return { platform: 'kugou', cleanId: rawId.replace(/^(kugou_|kg_)/, '') }
	}
	if (rawId.startsWith('kuwo_') || rawId.startsWith('kw_')) {
		return { platform: 'kuwo', cleanId: rawId.replace(/^(kuwo_|kw_)/, '') }
	}
	// 通过 platform 字段判断
	if (platform === 'netease' || platform === 'wy') {
		return { platform: 'netease', cleanId: rawId }
	}
	if (platform === 'kg' || platform === 'kugou') {
		return { platform: 'kugou', cleanId: rawId }
	}
	if (platform === 'kw' || platform === 'kuwo') {
		return { platform: 'kuwo', cleanId: rawId }
	}
	if (platform === 'qq' || platform === 'tx') {
		return { platform: 'qq', cleanId: rawId }
	}
	// 纯数字视为网易云（QQ音乐的mid是字符串，不会匹配这里）
	if (/^\d+$/.test(rawId)) {
		return { platform: 'netease', cleanId: rawId }
	}
	return { platform: platform || 'unknown', cleanId: rawId }
}

// 网易云搜索回退
const getNeteaseUrlBySearch = async (
	title: string,
	artist: string,
	album: string,
	quality: string,
): Promise<string | null> => {
	try {
		const searchKeyword = `${title} ${artist}`.trim()
		logInfo(`[builtin-search] 网易云搜索回退: "${searchKeyword}" album="${album}"`)
		const searchResult = await searchNeteaseMusic(searchKeyword, 1, 20)
		if (!searchResult.data || searchResult.data.length === 0) {
			logInfo('[builtin-search] 网易云搜索结果为空')
			return null
		}
		logInfo(`[builtin-search] 网易云找到 ${searchResult.data.length} 首`)
		const targetTitle = title.toLowerCase().trim()
		const targetArtist = artist.toLowerCase().trim()
		const targetAlbum = (album || '').toLowerCase().trim()
		// 精确匹配：歌名+歌手+专辑
		let matchedSong = searchResult.data.find((song: any) => {
			const t = song.title.toLowerCase().trim()
			const a = (song.artist || '').toLowerCase()
			const al = (song.album || '').toLowerCase()
			return t === targetTitle && a.includes(targetArtist) && (targetAlbum ? al.includes(targetAlbum) : true)
		})
		// 歌名+歌手匹配
		if (!matchedSong) {
			matchedSong = searchResult.data.find((song: any) => {
				const t = song.title.toLowerCase().trim()
				const a = (song.artist || '').toLowerCase()
				return t === targetTitle && a.includes(targetArtist)
			})
		}
		// 歌名包含匹配
		if (!matchedSong) {
			matchedSong = searchResult.data.find((song: any) => {
				const t = song.title.toLowerCase().trim()
				return t.includes(targetTitle) || targetTitle.includes(t)
			})
		}
		// 第一首
		if (!matchedSong) {
			matchedSong = searchResult.data[0]
		}
		logInfo(`[builtin-search] 网易云匹配: "${matchedSong.title}" - ${matchedSong.artist} (id=${matchedSong.id})`)
		const songId = matchedSong.originalId || matchedSong.id
		const url = await getNeteaseMusicUrl(songId, quality === 'flac' ? 'lossless' : 'standard')
		if (url) {
			logInfo('[builtin-search] 网易云搜索回退成功')
			return url
		}
		return null
	} catch (error) {
		logError('[builtin-search] 网易云搜索回退异常:', error)
		return null
	}
}

// QQ音乐搜索回退
const getQQUrlBySearch = async (
	title: string,
	artist: string,
	album: string,
	quality: string,
): Promise<string | null> => {
	try {
		const searchKeyword = `${title} ${artist}`.trim()
		logInfo(`[builtin-search] QQ音乐搜索回退: "${searchKeyword}" album="${album}"`)
		const searchResult = await searchQQMusic(searchKeyword, 0, 20, 1)
		if (!searchResult || !Array.isArray(searchResult) || searchResult.length === 0) {
			logInfo('[builtin-search] QQ搜索结果为空')
			return null
		}
		logInfo(`[builtin-search] QQ找到 ${searchResult.length} 首`)
		const targetTitle = title.toLowerCase().trim()
		const targetArtist = artist.toLowerCase().trim()
		const targetAlbum = (album || '').toLowerCase().trim()
		// 精确匹配：歌名+歌手+专辑
		let matchedSong = searchResult.find((song: any) => {
			const t = (song.title || song.songname || '').toLowerCase().trim()
			const a = (song.singer || []).map((s: any) => s.name).join(',').toLowerCase()
			const al = (song.albumname || song.album?.title || '').toLowerCase()
			return t === targetTitle && a.includes(targetArtist) && (targetAlbum ? al.includes(targetAlbum) : true)
		})
		// 歌名+歌手匹配
		if (!matchedSong) {
			matchedSong = searchResult.find((song: any) => {
				const t = (song.title || song.songname || '').toLowerCase().trim()
				const a = (song.singer || []).map((s: any) => s.name).join(',').toLowerCase()
				return t === targetTitle && a.includes(targetArtist)
			})
		}
		// 歌名包含匹配
		if (!matchedSong) {
			matchedSong = searchResult.find((song: any) => {
				const t = (song.title || song.songname || '').toLowerCase().trim()
				return t.includes(targetTitle) || targetTitle.includes(t)
			})
		}
		// 第一首
		if (!matchedSong) {
			matchedSong = searchResult[0]
		}
		const songmid = matchedSong.mid || matchedSong.songmid || matchedSong.id
		if (!songmid) {
			logInfo('[builtin-search] QQ匹配歌曲无songmid')
			return null
		}
		logInfo(`[builtin-search] QQ匹配: "${matchedSong.title || matchedSong.songname}" - songmid=${songmid}`)
		const url = await getQQMusicUrl(songmid, quality === 'flac' ? 'lossless' : 'standard')
		if (url) {
			logInfo('[builtin-search] QQ搜索回退成功')
			return url
		}
		return null
	} catch (error) {
		logError('[builtin-search] QQ搜索回退异常:', error)
		return null
	}
}

// 内置播放地址获取（当没有音源或音源获取失败时使用）
const getBuiltinMusicUrl = async (
	musicItem: IMusic.IMusicItem,
	quality: string,
): Promise<string | null> => {
	const rawPlatform = musicItem.platform || musicItem.source || ''
	const { platform, cleanId } = parsePlatformFromId(musicItem.id, rawPlatform)
	logInfo(`[builtin] 平台解析: rawPlatform=${rawPlatform}, resolvedPlatform=${platform}, rawId=${musicItem.id}, cleanId=${cleanId}, title=${musicItem.title}`)

	try {

		// 第二步：各平台原生 API 回退
		const crossEnabled = useCrossPlatformFallbackStore.getState().enabled
		const album = musicItem.album || ''

		if (platform === 'netease') {
			logInfo(`[builtin] 尝试网易云原生API: id=${cleanId}`)
			const url = await getNeteaseMusicUrl(cleanId, quality === 'flac' ? 'lossless' : 'standard')
			if (url) {
				logInfo('[builtin] 网易云原生API获取成功')
				return url
			}
			logInfo('[builtin] 网易云原生API失败，尝试网易云搜索回退')
			// 同平台搜索回退
			const searchUrl = await getNeteaseUrlBySearch(musicItem.title, musicItem.artist, album, quality)
			if (searchUrl) return searchUrl
			// 跨平台回退：搜QQ音乐
			if (crossEnabled) {
				logInfo('[builtin] 网易云搜索回退失败，跨平台尝试QQ音乐搜索')
				const qqUrl = await getQQUrlBySearch(musicItem.title, musicItem.artist, album, quality)
				if (qqUrl) return qqUrl
			}
		}

		if (platform === 'kugou') {
			logInfo(`[builtin] 尝试酷狗原生API: id=${cleanId}`)
			const url = await getKugouMusicUrl(
				{ ...musicItem, id: cleanId, originalId: cleanId },
				quality === 'flac' ? 'lossless' : 'standard',
			)
			if (url) {
				logInfo('[builtin] 酷狗原生API获取成功')
				return url
			}
		}

		if (platform === 'kuwo') {
			logInfo(`[builtin] 尝试酷我原生API: id=${cleanId}`)
			const url = await getMusicFromKw(
				{ ...musicItem, id: cleanId, originalId: cleanId },
				quality,
			)
			if (url) {
				logInfo('[builtin] 酷我原生API获取成功')
				return url
			}
		}

		// QQ音乐原生API回退
		if (platform === 'qq' || platform === 'tx') {
			logInfo(`[builtin] 尝试QQ音乐原生API: songmid=${cleanId}`)
			const url = await getQQMusicUrl(cleanId, quality === 'flac' ? 'lossless' : 'standard')
			if (url) {
				logInfo('[builtin] QQ音乐原生API获取成功')
				return url
			}
			logInfo('[builtin] QQ音乐原生API失败，尝试QQ搜索回退')
			// 同平台搜索回退
			const qqSearchUrl = await getQQUrlBySearch(musicItem.title, musicItem.artist, album, quality)
			if (qqSearchUrl) return qqSearchUrl
			// 跨平台回退：搜网易云
			if (crossEnabled) {
				logInfo('[builtin] QQ搜索回退失败，跨平台尝试网易云搜索')
				const neteaseUrl = await getNeteaseUrlBySearch(musicItem.title, musicItem.artist, album, quality)
				if (neteaseUrl) return neteaseUrl
			}
		}

		// 未知平台：尝试两个平台搜索
		if (platform === 'unknown') {
			logInfo('[builtin] 未知平台，尝试网易云搜索')
			const neteaseUrl = await getNeteaseUrlBySearch(musicItem.title, musicItem.artist, album, quality)
			if (neteaseUrl) return neteaseUrl
			if (crossEnabled) {
				logInfo('[builtin] 网易云搜索失败，尝试QQ音乐搜索')
				const qqUrl = await getQQUrlBySearch(musicItem.title, musicItem.artist, album, quality)
				if (qqUrl) return qqUrl
			}
		}

		logInfo('[builtin] 所有回退均失败')
		return null
	} catch (error) {
		logError('[builtin] 内置获取失败:', error)
		return null
	}
}

// 验证URL是否为可播放的真实音频（防假播放：返回加密格式/空文件/HTML错误页）
const ENCRYPTED_EXTENSIONS = new Set(['mflac', 'mflac0', 'mgg', 'mgg0', 'mgg1', 'ncm', 'kgm', 'kgma', 'kgg', 'vpr', 'kwm', 'kwl', 'kwb', 'kwmv', 'kwac', 'kwring', 'kwshort', 'qmc', 'qmc0', 'qmc3', 'qmcflac', 'qmcogg', 'tkm'])
const AUDIO_CONTENT_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/flac', 'audio/x-flac', 'audio/ogg', 'audio/aac', 'audio/mp4', 'audio/m4a', 'audio/wav', 'audio/opus', 'audio/x-mpeg', 'audio/x-ogg', 'application/octet-stream', 'audio/x-wav', 'audio/webm']

const validateAudioUrl = async (url: string): Promise<boolean> => {
	try {
		// 只检查加密格式扩展名，不发送GET请求验证（避免防盗链导致有效URL被误过滤）
		const parsed = new URL(url)
		const pathname = parsed.pathname.toLowerCase()
		// 裸域名拦截：路径为空或只有斜杠（如 https://aqqmusic.tc.qq.com/），
		// 不是具体音频文件地址。带 filename/songmid/guid 参数的流媒体接口仍可能有效，放行。
		const strippedPath = pathname.replace(/^\/+/, '')
		if (!strippedPath) {
			const hasFileParam = parsed.searchParams.get('filename') || parsed.searchParams.get('songmid') || parsed.searchParams.get('guid')
			if (!hasFileParam) {
				logInfo(`[validateAudioUrl] 裸域名URL（无具体音频路径），判定无效: ${url.slice(0, 80)}`)
				return false
			}
		}
		const ext = strippedPath.split('.').pop() || ''
		if (ENCRYPTED_EXTENSIONS.has(ext)) {
			logInfo(`[validateAudioUrl] 加密格式 .${ext}，跳过`)
			return false
		}
		// 其他情况放行，让播放器自己尝试播放
		return true
	} catch (e) {
		logInfo('[validateAudioUrl] URL解析失败，放行')
		return true
	}
}

export const resolveSource = async (
	musicItem: IMusic.IMusicItem,
	options: ResolveSourceOptions = {},
): Promise<SourceResult> => {
	const preloadKey = makePreloadKey(musicItem)
	const requestType = options.requestType ?? 'current'
	const fallbackMode = options.fallbackMode ?? 'all'
	const bypassCache = options.bypassCache ?? false
	const excludeSourceIds = options.excludeSourceIds ?? []
	const silent = options.silent ?? false
	// 后台解析（启动恢复）时静默：换源/降级/失败一律不打扰用户，只在日志记录
	const uiToast = (message1: string, message2OrType?: string, type?: 'success' | 'error' | 'info') => {
		if (!silent) showToast(message1, message2OrType, type)
	}

	// 内存缓存检查（最快）- 带过期检查（bypassCache时跳过）
	const currentSrcId = musicApiSelectedStore.getValue()?.id || 'default'
	const memCacheKey = `${currentSrcId}::${musicItem.platform || musicItem.source || 'unknown'}_${musicItem.id || musicItem.songmid}`
	const memCached = !bypassCache ? urlMemoryCache.get(memCacheKey) : null
	if (memCached && !memCached.url.includes('fake')) {
		if (Date.now() - memCached.timestamp < MEM_CACHE_EXPIRY_MS) {
			logInfo('[sourceResolver] 使用内存缓存播放链接')
			return { url: memCached.url, wasCached: true, sourceId: currentSrcId, sourceName: musicApiSelectedStore.getValue()?.name ?? null }
		} else {
			logInfo('[sourceResolver] 内存缓存已过期，删除并重新获取')
			urlMemoryCache.delete(memCacheKey)
		}
	}

	if (musicItem.url && musicItem.url.startsWith('file://')) {
		const isFileExist = await RNFS.exists(musicItem.url)
		if (!isFileExist) {
			if (isCurrentSourceRequest(requestType)) {
				logError('本地文件不存在:', musicItem.url)
				uiToast('错误', '本地文件不存在，请删除并重新缓存或导入。', 'error')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		}
		preloadCache.delete(preloadKey)
		return { url: musicItem.url, wasCached: false }
	}


	const cached = !bypassCache ? await isCached(musicItem) : false
	if (cached) {
		const localPath = getLocalFilePath(musicItem)
		preloadCache.delete(preloadKey)
		logInfo('使用缓存的音频路径播放:', localPath)
		return { url: localPath, wasCached: true }
	}

	// 精准同步下载缓存检查：如果开启了精准同步下载且这首歌有缓存，直接用本地文件
	try {
		const { isPreciseFLACEnabled, isPreciseFLACCacheEnabled, getCachedFLAC } = require('./FLACPreciseSync')
		if (isPreciseFLACEnabled() && isPreciseFLACCacheEnabled()) {
			const cachedLocalPath = await getCachedFLAC(musicItem)
			if (cachedLocalPath) {
				preloadCache.delete(preloadKey)
				logInfo(`[高音质歌词同步] 命中精准同步下载缓存，直接播放本地文件: ${musicItem.title}`)
				return { url: cachedLocalPath, wasCached: true, sourceId: 'precise_flac_cache', sourceName: '精准同步缓存' }
			}
		}
	} catch (e) {
		logError('[高音质歌词同步] 检查精准同步缓存失败:', e)
	}

	// 只在本地与磁盘缓存都未命中时，才复用预加载的远端音源
	const preloaded = getPreloadedUrl(musicItem)
	if (preloaded) {
		logInfo(`[sourceResolver] ⚠️ 使用预加载缓存链接`)
		// 预加载播放提醒已关闭
		preloadCache.delete(preloadKey)
		return { url: preloaded, wasCached: false, sourceId: currentSrcId, sourceName: musicApiSelectedStore.getValue()?.name ?? null }
	}

	if (!musicItem.url || musicItem.url === 'Unknown' || musicItem.url.includes('fake') || musicItem.url.startsWith('http')) {
		const nowMusicApi = musicApiSelectedStore.getValue()

		// 没有导入音源时，检查是否开启了内置音源
		const builtinSourceEnabled = PersistStatus.get('music.builtinSourceEnabled') === 'true'
		if (nowMusicApi == null && !builtinSourceEnabled) {
			logInfo('[sourceResolver] 未导入音源且未开启内置音源，禁止播放')
			if (isCurrentSourceRequest(requestType)) {
				uiToast('无可用音源', '请导入音源脚本或在设置中开启内置音源', 'error')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		}
		if (nowMusicApi == null && builtinSourceEnabled) {
			logInfo('[sourceResolver] 未导入音源但开启了内置音源，直接尝试内置兜底')
			try {
				const unblockResult = await tryBuiltinUnblock(musicItem)
				if (unblockResult && unblockResult.url) {
					logInfo(`[sourceResolver] 内置兜底音源成功: ${unblockResult.source}`)
					if (isCurrentSourceRequest(requestType)) {
						nowApiState.setValue('正常')
						uiToast('内置音源', `已使用${unblockResult.source}播放`, 'info')
					}
					return { url: unblockResult.url, wasCached: false }
				}
			} catch (e) {
				logError('[sourceResolver] 内置兜底异常:', e)
			}
			if (isCurrentSourceRequest(requestType)) {
				uiToast('无法播放', '内置音源也获取失败，请导入音源脚本', 'error')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		}

		const requestKey = createSourceRequestKey(musicItem, requestType)
		const logPrefix = getSourceRequestLogPrefix(requestType, requestKey)
		const timeoutMs = getSourceRequestTimeoutMs(requestType)
		// 音源请求开始时间（用于音源状态日志）
		const requestStartTime = Date.now()

		// 构建音源尝试列表：当前音源 + 其他所有导入的音源（自动换源或跨平台回退开启时才尝试其他音源）
		const autoSwitchEnabled = useAutoSourceSwitchStore.getState().enabled
		const crossPlatformEnabled = false // useCrossPlatformFallbackStore.getState().enabled  // 临时禁用跨平台搜索
		const allApis = musicApiStore.getValue() || []
		// 自动换源时遍历所有导入的音源，不需要手动启用
		// quality_only模式下只尝试当前音源，不换源
		const enabledIds = (autoSwitchEnabled && fallbackMode !== 'quality_only') ? allApis.map(a => a.id) : []
		const sourceTryList: IMusic.MusicApi[] = []
		
		// 确保当前音源是选中的音源（从musicApiStore里找isSelected=true的，避免状态不同步）
		let currentApi = nowMusicApi
		const selectedFromList = allApis.find(a => a.isSelected === true)
		if (selectedFromList && selectedFromList.id !== nowMusicApi?.id) {
			logInfo(`${logPrefix} 音源状态不同步，使用musicApiStore里选中的音源: ${selectedFromList.name}`)
			currentApi = selectedFromList
			musicApiSelectedStore.setValue(selectedFromList)
		}
		
		// 只存音源基本信息，不预加载脚本（QuickJS全局只能运行一个脚本，预加载会互相覆盖）
		// 尝试时才加载对应音源的脚本
		const excludeSourceSet = new Set(excludeSourceIds)
		if (currentApi && !excludeSourceSet.has(currentApi.id)) sourceTryList.push(currentApi)
		
		logInfo(`${logPrefix} 启用的音源ID列表: ${JSON.stringify(enabledIds)}，所有音源数量: ${allApis.length}`)
		
		for (const eid of enabledIds) {
			if (eid !== currentApi?.id && !excludeSourceSet.has(eid)) {
				const api = allApis.find(a => a.id === eid)
				if (api) sourceTryList.push(api)
			}
		}
		
		logInfo(`${logPrefix} 最终音源尝试列表: ${sourceTryList.map(a => a.name).join(', ')}`)

		// 记录最终使用的平台（换源时更新，catch 块也能访问）
		let finalPlatform = nowMusicApi?.name || '未知'

		try {
			if (isCurrentSourceRequest(requestType)) activeCurrentCount++
			// 如果上一首歌触发了音质降级，恢复用户设置的音质（仅当前播放请求）
			if (degradedQualityRestore && isCurrentSourceRequest(requestType)) {
				logInfo(`${logPrefix} 恢复用户设置的音质: ${degradedQualityRestore}`)
				qualityStore.setValue(degradedQualityRestore)
				degradedQualityRestore = null
			}
			// 完整音质降级顺序（从高到低）
			const allQualities: IMusic.IQualityKey[] = ['master', 'hires', '24bit', 'flac', '320k', '128k']
			const originalQuality = qualityStore.getValue()
			const startIdx = allQualities.indexOf(originalQuality)
			const qualityOrder: IMusic.IQualityKey[] = startIdx >= 0
				? allQualities.slice(startIdx)
				: [originalQuality, ...allQualities]

			let resp_url: string | null = null
			let usedSourceName = nowMusicApi.name
			let usedSourceId: string | null = nowMusicApi?.id ?? null
			let usedQuality = originalQuality
			let didSourceFallback = false
			let didQualityFallback = false

			logInfo(`${logPrefix} 开始请求音源: ${musicItem.title} - ${musicItem.artist}, 共${sourceTryList.length}个音源待尝试, 音质顺序: ${qualityOrder.join(' -> ')}`)

			// 歌曲平台（网易云/QQ音乐等）+ 音源名称，用于日志显示
			const trackPlatform = musicItem.platform || musicItem.source || '未知'
			const recordAttempt = (sourceName: string, quality: string, success: boolean, actualQuality: string | null, url: string | null, duration: number, errorMessage: string | null) => {
				if (!isCurrentSourceRequest(requestType)) return
				const logId = useSourceRequestLogStore.getState().addLog({
					trackName: musicItem.title || musicItem.name || '未知歌曲',
					trackArtist: musicItem.artist || musicItem.artists?.map((a: any) => a.name).join('、') || '未知歌手',
					platform: `${trackPlatform} · ${sourceName}`,
					requestedQuality: quality,
					actualQuality,
					url,
					fileSize: null,
					duration,
					success,
					errorMessage,
				})
				// 成功时异步获取文件大小（HEAD 请求 Content-Length），不阻塞播放
				if (success && url && !url.startsWith('file://')) {
					fetch(url, { method: 'HEAD' })
						.then((headRes) => {
							const contentLength = headRes.headers.get('Content-Length')
							if (contentLength) {
								const size = parseInt(contentLength, 10)
								if (size > 0) {
									useSourceRequestLogStore.getState().updateLog(logId, { fileSize: size })
								}
							}
						})
						.catch(() => { /* ignore */ })
				}
			}

			// 根据fallbackMode决定尝试顺序
			if (fallbackMode === 'quality_only') {
				// quality_only：先把当前音源所有音质试完（从用户选择的音质往下降），再换其他音源继续降
				for (let sIdx = 0; sIdx < sourceTryList.length && !resp_url; sIdx++) {
					const baseApi = sourceTryList[sIdx]
					let tryApi: IMusic.MusicApi = baseApi
					try {
						if (baseApi.scriptType === 'lxmusic') {
							tryApi = await reloadLxMusicScript(baseApi)
						} else if (baseApi.script && typeof baseApi.getMusicUrl !== 'function') {
							const reloaded = await createMusicApiFromScript(baseApi.script)
							tryApi = { ...reloaded, id: baseApi.id, isSelected: baseApi.isSelected }
						}
					} catch (e) {
						logError(`${logPrefix} [${baseApi.name}] 加载脚本失败:`, e)
						continue
					}
					if (typeof tryApi.getMusicUrl !== 'function') {
						logInfo(`${logPrefix} [${tryApi.name}] 无getMusicUrl方法，跳过`)
						continue
					}
					for (let qIdx = 0; qIdx < qualityOrder.length && !resp_url; qIdx++) {
						const currentQuality = qualityOrder[qIdx]
						const attemptStartTime = Date.now()
						if (qIdx > 0) {
							didQualityFallback = true
							logInfo(`${logPrefix} [${tryApi.name}] ${qualityOrder[qIdx - 1]}失败，降级到${currentQuality}`)
						}
						try {
							resp_url = await Promise.race([
								tryApi.getMusicUrl(
									musicItem.title,
									musicItem.artist,
									musicItem.songmid || musicItem.id,
									currentQuality,
									{ requestKey, requestType, timeoutMs } as MusicUrlRequestContext,
								),
								createTimeoutPromise(timeoutMs),
							])
							if (!resp_url || resp_url === '') {
								resp_url = null
								recordAttempt(tryApi.name, currentQuality, false, null, null, (Date.now() - attemptStartTime) / 1000, '返回空URL')
								continue
							}
							const isValid = await validateAudioUrl(resp_url)
							if (!isValid) {
								resp_url = null
								recordAttempt(tryApi.name, currentQuality, false, null, null, (Date.now() - attemptStartTime) / 1000, 'URL验证失败')
								continue
							}
							usedSourceName = tryApi.name
							usedSourceId = tryApi.id
							usedQuality = currentQuality
							recordAttempt(tryApi.name, currentQuality, true, currentQuality, resp_url, (Date.now() - attemptStartTime) / 1000, null)
							if (sIdx > 0 || qIdx > 0) {
								if (sIdx > 0) didSourceFallback = true
								if (qIdx > 0) didQualityFallback = true
								if (isCurrentSourceRequest(requestType)) {
										const action = sIdx > 0 ? '切换音源' : '降低音质'
										const toastTitle = sIdx > 0 ? '智能换源' : '音质降级'
										if (useSourceSwitchToastStore.getState().enabled) {
											uiToast(toastTitle, `已${action}至「${tryApi.name}」(${currentQuality})`, 'info')
										}
									}
							}
							logInfo(`${logPrefix} ✅ [${tryApi.name}] 成功获取${currentQuality} (sIdx=${sIdx}, qIdx=${qIdx})`)
						} catch (error) {
							resp_url = null
							const qErrMsg = error instanceof Error ? error.message : String(error)
							recordAttempt(tryApi.name, currentQuality, false, null, null, (Date.now() - attemptStartTime) / 1000, qErrMsg || '请求异常')
							if (qErrMsg === '请求超时') {
								logInfo(`${logPrefix} [${tryApi.name}] 超时，跳过该音源剩余音质`)
								break
							}
						}
					}
				}
			} else {
			// all和source_only：外层音质，内层音源（同音质跨音源优先）
			const timedOutSources = new Set<string>()
			const maxQualityIdx = fallbackMode === 'source_only' ? 1 : qualityOrder.length
			for (let qIdx = 0; qIdx < maxQualityIdx && !resp_url; qIdx++) {
				const currentQuality = qualityOrder[qIdx]
				if (qIdx > 0) {
					didQualityFallback = true
					logInfo(`${logPrefix} 音质${qualityOrder[qIdx - 1]}所有音源均失败，降级到${currentQuality}`)
					if (isCurrentSourceRequest(requestType)) {
						uiToast('音质降级', `${qualityOrder[qIdx - 1]}不可用，尝试${currentQuality}...`, 'info')
					}
				}

				for (let sIdx = 0; sIdx < sourceTryList.length && !resp_url; sIdx++) {
					const baseApi = sourceTryList[sIdx]
					if (timedOutSources.has(baseApi.id)) continue
					// 尝试时才加载脚本，确保QuickJS里运行的是当前音源（避免预加载互相覆盖）
					let tryApi: IMusic.MusicApi = baseApi
					try {
						if (baseApi.scriptType === 'lxmusic') {
							tryApi = await reloadLxMusicScript(baseApi)
						} else if (baseApi.script && typeof baseApi.getMusicUrl !== 'function') {
							const reloaded = await createMusicApiFromScript(baseApi.script)
							tryApi = { ...reloaded, id: baseApi.id, isSelected: baseApi.isSelected }
						}
					} catch (e) {
						logError(`${logPrefix} [${baseApi.name}] 加载脚本失败:`, e)
						continue
					}
					if (typeof tryApi.getMusicUrl !== 'function') {
						logInfo(`${logPrefix} [${tryApi.name}] 无getMusicUrl方法，跳过`)
						continue
					}
					const attemptStartTime = Date.now()
					try {
						resp_url = await Promise.race([
							tryApi.getMusicUrl(
								musicItem.title,
								musicItem.artist,
								musicItem.songmid || musicItem.id,
								currentQuality,
								{ requestKey, requestType, timeoutMs } as MusicUrlRequestContext,
							),
							createTimeoutPromise(timeoutMs),
						])
						if (!resp_url || resp_url === '') {
							resp_url = null
							recordAttempt(tryApi.name, currentQuality, false, null, null, (Date.now() - attemptStartTime) / 1000, '返回空URL')
							continue
						}
						// 验证URL真实可播放性（防假播放：加密格式/空文件/HTML错误页）
						const isValid = await validateAudioUrl(resp_url)
						if (!isValid) {
							logInfo(`${logPrefix} [${tryApi.name}] ${currentQuality} URL验证失败，继续下一个`)
							resp_url = null
							recordAttempt(tryApi.name, currentQuality, false, null, null, (Date.now() - attemptStartTime) / 1000, 'URL验证失败')
							continue
						}
						usedSourceName = tryApi.name
						usedSourceId = tryApi.id
						usedQuality = currentQuality
						recordAttempt(tryApi.name, currentQuality, true, currentQuality, resp_url, (Date.now() - attemptStartTime) / 1000, null)
						if (sIdx > 0 || qIdx > 0) {
							if (sIdx > 0) didSourceFallback = true
							if (qIdx > 0) didQualityFallback = true
							if (isCurrentSourceRequest(requestType)) {
								const fromName = qIdx > 0 ? `${nowMusicApi.name}(${qualityOrder[qIdx - 1]})` : nowMusicApi.name
								const action = sIdx > 0 ? '切换音源' : '降低音质'
								const toastTitle = sIdx > 0 ? '智能换源' : '音质降级'
									if (useSourceSwitchToastStore.getState().enabled) {
										uiToast(toastTitle, `「${fromName}」不可用，已${action}至「${tryApi.name}」(${currentQuality})`, 'info')
									}
								logInfo(`[sourceResolver] ${action}: ${fromName} -> ${tryApi.name} (${currentQuality})`)
							}
						}
						logInfo(`${logPrefix} ✅ [${tryApi.name}] 成功获取${currentQuality}音质的音乐URL (sIdx=${sIdx}, qIdx=${qIdx})`)
				if (isCurrentSourceRequest(requestType) && sIdx === 0 && qIdx === 0) {
					logInfo(`[sourceResolver] 当前音源「${tryApi.name}」直接播放成功，无需换源`)
				}
					} catch (error) {
						const errMsg = error instanceof Error ? error.message : String(error)
						recordAttempt(tryApi.name, currentQuality, false, null, null, (Date.now() - attemptStartTime) / 1000, errMsg || '请求异常')
						if (isCurrentSourceRequest(requestType)) {
							logError(`${logPrefix} [${tryApi.name}] ${currentQuality}音质失败: ${errMsg}`)
						}
						if (errMsg === '请求超时') {
							timedOutSources.add(baseApi.id)
							logInfo(`${logPrefix} [${tryApi.name}] 超时，后续音质直接跳过该音源`)
						}
					}
				}
			}

			} // end of else branch
			// 音质降级最终确认：只更新UI显示，不持久化，下一首歌自动恢复
			if (didQualityFallback && resp_url && isCurrentSourceRequest(requestType)) {
				degradedQualityRestore = originalQuality
				qualityStore.setValue(usedQuality)
				uiToast('音质降级', `${originalQuality} → ${usedQuality}（${usedSourceName}）`, 'info')
			}

			if (!resp_url) {
				logInfo('[sourceResolver] 所有启用音源及音质均获取失败')
				const builtinEnabled = PersistStatus.get('music.builtinSourceEnabled') === 'true'
				// 内置兜底音源由独立开关控制，是当前音源全部失败后最后的可用源，不受「自动换源」开关影响；
				// 自动换源只控制是否在多个导入音源之间切换（见上方 enabledIds）。否则关闭自动换源会导致完全无法播放。
				if (builtinEnabled) {
					logInfo('[sourceResolver] 尝试内置兜底音源')
					try {
						const unblockResult = await tryBuiltinUnblock(musicItem)
						if (unblockResult && unblockResult.url) {
							resp_url = unblockResult.url
							usedSourceName = unblockResult.source
							usedSourceId = 'builtin'
							logInfo(`[sourceResolver] 内置兜底音源成功: ${unblockResult.source}`)
							if (isCurrentSourceRequest(requestType)) {
								nowApiState.setValue('正常')
								const showBuiltinToast = PersistStatus.get('music.builtinSourceToastEnabled') !== 'false'
								if (showBuiltinToast) {
									uiToast('内置音源', `已使用${unblockResult.source}播放`, 'info')
								}
							}
						}
					} catch (unblockErr) {
						logError('[sourceResolver] 内置兜底音源异常:', unblockErr)
					}
				}
			}
			if (!resp_url) {
				logInfo('[sourceResolver] 所有音源及内置兜底均失败')
				if (isCurrentSourceRequest(requestType)) {
					nowApiState.setValue('异常')
					uiToast('无法播放', '所有音源均失败，自动切换下一首', 'error')
					throw new Error('音源无法获取播放地址，请检查音源脚本或更换音源')
				}
				return { url: fakeAudioMp3Uri, wasCached: false }
			}
			logInfo(`${logPrefix} 最终的音乐 URL:`, resp_url)
			if (isCurrentSourceRequest(requestType)) {
				nowApiState.setValue('正常')
				finalPlatform = usedSourceName || '未知'
			}
			// 高音质歌词同步：如果是无损及以上音质且设置开启，启动后台下载
			if (isCurrentSourceRequest(requestType)) {
				const { isFLACUrl, isPreciseFLACEnabled, isHighQuality, startFLACDownload, removeLocalFLAC } = require('./FLACPreciseSync')
				if (isPreciseFLACEnabled() && (isHighQuality(usedQuality) || isFLACUrl(resp_url))) {
					logInfo(`[高音质歌词同步] 检测到高音质歌曲（${usedQuality || '未知'}），开始后台下载: ${musicItem.title || '未知'}`)
					// 先删除上一首歌的本地文件
					removeLocalFLAC('切换新歌')
					// 启动后台下载
					startFLACDownload(resp_url, musicItem, (localPath: string) => {
						logInfo(`[高音质歌词同步] 歌曲「${musicItem.title || '未知'}」下载完成，本地路径: ${localPath}`)
						logInfo('[高音质歌词同步] 后续seek和歌词同步将使用本地文件，更精准')
					}, (error: string) => {
						logError(`[高音质歌词同步] 歌曲「${musicItem.title || '未知'}」下载失败: ${error}`)
						logInfo('[高音质歌词同步] 将继续使用网络播放，seek可能偏几秒')
					})
				}
			}
			return { url: resp_url, wasCached: false, sourceId: usedSourceId, sourceName: usedSourceName, quality: usedQuality }
		} catch (error) {
			if (isCurrentSourceRequest(requestType)) {
				nowApiState.setValue('异常')
			}
			const errMsg = error instanceof Error ? error.message : String(error)
			if (isCurrentSourceRequest(requestType)) {
				logError(`${logPrefix} 获取音乐 URL 失败: ${errMsg}`)
				const errorMessage =
					errMsg === '请求超时'
						? '获取音乐超时，请稍后重试。'
						: errMsg || '获取音乐失败，请稍后重试。'
				uiToast(errorMessage, '', 'error')
			}
			return { url: fakeAudioMp3Uri, wasCached: false }
		} finally {
			if (isCurrentSourceRequest(requestType)) activeCurrentCount--
		}
	}

	return { url: musicItem.url, wasCached: false }
}

/**
 * 快速备用音源解析：遍历音源列表，每个音源最多 3000ms，返回第一个可用URL
 * 用于自动换源场景下的快速兜底，不做音质降级（用当前音质）
 * @param songInfo 歌曲信息 { title, artist, songmid, id }
 * @param sourceList 音源对象列表（MusicApi[]）
 * @param quality 音质（默认当前设置音质）
 * @returns 可用的播放URL
 * @throws 所有音源均不可用时抛出 Error
 */
