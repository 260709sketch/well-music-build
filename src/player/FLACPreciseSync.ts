/**
 * 高音质歌词同步模块
 * 原理：播放无损及以上音质时后台下载到本机，转成无损 PCM 后无缝切换
 * 因为 AVFoundation 在 FLAC/无损格式中 seek 有几秒误差，转成 PCM 后 seek 精准
 *
 * 精准同步下载缓存：开启后下载的歌曲不自动删除，下次播放直接用本地文件
 * 超出存储限制时自动清理最久未播放的歌曲（LRU）
 */
import * as FileSystem from 'expo-file-system'
import { NativeModules } from 'react-native'
import ReactNativeTrackPlayer, { State, Event } from 'react-native-track-player'
import PersistStatus from '@/store/PersistStatus'
import { logInfo, logError } from '@/helpers/logger'
import LyricManager from '@/helpers/lyricManager'

// 缓存目录
const FLAC_CACHE_DIR = `${FileSystem.cacheDirectory}KumoneFLAC/`
// 缓存索引文件
const CACHE_INDEX_FILE = `${FLAC_CACHE_DIR}cacheIndex.json`

// 当前正在下载的任务
let currentDownloadTask: { url: string; file: string; cancel: () => void } | null = null
// 正在下载的歌曲 key：同步登记（任何 await 之前设置），防止 Resolver 与切歌监听
// 对同一首歌各触发一次下载的双触发竞态（竞态会产生两个不同文件、两次直换、两次音频中断）
let inflightDownloadKey: string | null = null
// 当前本地文件路径
let currentLocalFile: string | null = null
// 当前歌曲标识
let currentMusicKey: string | null = null
// 切源标记：replaceCurrentTrack 触发的 ActiveTrackChanged 是同歌换源，不是真切歌
let isSourceSwitchInProgress = false
// 已直换过的本地文件：同一文件只直换一次（双触发去重，防止连续多次音频中断）
let lastSwitchedLocalFile: string | null = null

// 缓存索引类型
interface CacheEntry {
	musicKey: string
	title: string
	artist: string
	filePath: string // 绝对路径，不含 file://
	fileSize: number // 字节
	downloadTime: number // 下载时间戳
	lastPlayTime: number // 最后播放时间戳
	playCount: number // 播放次数
}

interface CacheIndex {
	entries: Record<string, CacheEntry> // musicKey -> entry
}

// 内存中的缓存索引
let cacheIndex: CacheIndex | null = null

/**
 * 检查设置是否开启 高音质歌词同步
 */
export const isPreciseFLACEnabled = (): boolean => {
	return PersistStatus.get('music.preciseFLAC') !== false
}

/**
 * 检查设置是否开启 精准同步下载缓存
 */
export const isPreciseFLACCacheEnabled = (): boolean => {
	return PersistStatus.get('music.preciseFLACCache') === true
}

/**
 * 获取缓存大小限制（MB），默认 1024MB（1GB）
 */
export const getCacheLimitMB = (): number => {
	const limit = PersistStatus.get('music.preciseFLACCacheLimit' as any)
	if (limit && typeof limit === 'number' && limit > 0) return limit
	return 1024 // 默认1GB
}

/**
 * 判断是否是无损及以上音质
 */
export const isHighQuality = (quality?: string): boolean => {
	if (!quality) return false
	const q = quality.toLowerCase()
	return (
		q.includes('flac') ||
		q.includes('hires') ||
		q.includes('hi-res') ||
		q.includes('master') ||
		q.includes('lossless') ||
		q.includes('24bit') ||
		q.includes('24-bit') ||
		q.includes('dolby') ||
		q.includes('atmos') ||
		q.includes('jymaster')
	)
}

/**
 * 检查 URL 是否是无损格式网络流
 */
export const isFLACUrl = (url: string): boolean => {
	if (!url || url.startsWith('file://')) return false
	try {
		const urlObj = new URL(url)
		const pathname = urlObj.pathname.toLowerCase()
		return (
			pathname.endsWith('.flac') ||
			pathname.includes('.flac') ||
			pathname.endsWith('.wav') ||
			pathname.endsWith('.ape') ||
			pathname.endsWith('.m4a') ||
			pathname.endsWith('.dsd')
		)
	} catch {
		const lower = url.toLowerCase()
		return lower.includes('.flac') || lower.includes('.wav') || lower.includes('.ape') || lower.includes('.m4a')
	}
}

/**
 * 确保缓存目录存在
 */
const ensureCacheDir = async (): Promise<void> => {
	try {
		const dirInfo = await FileSystem.getInfoAsync(FLAC_CACHE_DIR)
		if (!dirInfo.exists) {
			await FileSystem.makeDirectoryAsync(FLAC_CACHE_DIR, { intermediates: true })
			logInfo('[高音质歌词同步] 创建缓存目录成功')
		}
	} catch (e) {
		logError('[高音质歌词同步] 创建缓存目录失败:', e)
	}
}

/**
 * 加载缓存索引
 */
const loadCacheIndex = async (): Promise<CacheIndex> => {
	if (cacheIndex) return cacheIndex
	try {
		await ensureCacheDir()
		const fileInfo = await FileSystem.getInfoAsync(CACHE_INDEX_FILE)
		if (fileInfo.exists) {
			const content = await FileSystem.readAsStringAsync(CACHE_INDEX_FILE)
			cacheIndex = JSON.parse(content)
			logInfo(`[高音质歌词同步] 加载缓存索引成功，共${Object.keys(cacheIndex.entries).length}首`)
		} else {
			cacheIndex = { entries: {} }
		}
	} catch (e) {
		logError('[高音质歌词同步] 加载缓存索引失败:', e)
		cacheIndex = { entries: {} }
	}
	return cacheIndex
}

/**
 * 保存缓存索引
 */
const saveCacheIndex = async (): Promise<void> => {
	if (!cacheIndex) return
	try {
		await FileSystem.writeAsStringAsync(CACHE_INDEX_FILE, JSON.stringify(cacheIndex))
	} catch (e) {
		logError('[高音质歌词同步] 保存缓存索引失败:', e)
	}
}

/**
 * 计算当前缓存总大小（字节）
 */
export const getCacheTotalSize = async (): Promise<number> => {
	const index = await loadCacheIndex()
	let total = 0
	for (const key of Object.keys(index.entries)) {
		total += index.entries[key].fileSize
	}
	return total
}

/**
 * 获取缓存歌曲数量
 */
export const getCacheCount = async (): Promise<number> => {
	const index = await loadCacheIndex()
	return Object.keys(index.entries).length
}

/**
 * LRU 清理：超出存储限制时删除最久未播放的歌曲
 */
export const cleanupCache = async (): Promise<void> => {
	if (!isPreciseFLACCacheEnabled()) return
	const index = await loadCacheIndex()
	const limitBytes = getCacheLimitMB() * 1024 * 1024
	let totalSize = 0
	for (const key of Object.keys(index.entries)) {
		totalSize += index.entries[key].fileSize
	}

	if (totalSize <= limitBytes) {
		logInfo(`[高音质歌词同步] 缓存大小 ${(totalSize / 1024 / 1024).toFixed(1)}MB，未超出限制 ${getCacheLimitMB()}MB`)
		return
	}

	logInfo(`[高音质歌词同步] 缓存大小 ${(totalSize / 1024 / 1024).toFixed(1)}MB 超出限制 ${getCacheLimitMB()}MB，开始LRU清理`)

	// 按最后播放时间排序（最久的在前）
	const entries = Object.values(index.entries).sort((a, b) => a.lastPlayTime - b.lastPlayTime)

	let removed = 0
	for (const entry of entries) {
		if (totalSize <= limitBytes) break
		// 不删除当前正在播放的歌曲
		if (entry.musicKey === currentMusicKey) continue
		try {
			const fileInfo = await FileSystem.getInfoAsync(entry.filePath)
			if (fileInfo.exists) {
				await FileSystem.deleteAsync(entry.filePath, { idempotent: true })
			}
			totalSize -= entry.fileSize
			delete index.entries[entry.musicKey]
			removed++
			logInfo(`[高音质歌词同步] LRU清理删除: ${entry.title} - ${entry.artist} (${(entry.fileSize / 1024 / 1024).toFixed(1)}MB)`)
		} catch (e) {
			logError('[高音质歌词同步] LRU清理删除失败:', e)
		}
	}

	await saveCacheIndex()
	logInfo(`[高音质歌词同步] LRU清理完成，删除${removed}首，剩余缓存 ${(totalSize / 1024 / 1024).toFixed(1)}MB`)
}

/**
 * 检查歌曲是否有缓存，返回本地文件路径（含 file://）
 */
export const getCachedFLAC = async (musicItem: any): Promise<string | null> => {
	if (!isPreciseFLACCacheEnabled()) return null
	const musicKey = makeMusicKey(musicItem)
	const index = await loadCacheIndex()
	const entry = index.entries[musicKey]
	if (!entry) return null

	// 检查文件是否存在
	try {
		const fileInfo = await FileSystem.getInfoAsync(entry.filePath)
		if (!fileInfo.exists) {
			// 文件不存在，从索引中删除
			delete index.entries[musicKey]
			await saveCacheIndex()
			logInfo(`[高音质歌词同步] 缓存文件不存在，已从索引移除: ${entry.title}`)
			return null
		}
		// 更新最后播放时间
		entry.lastPlayTime = Date.now()
		entry.playCount++
		await saveCacheIndex()
		logInfo(`[高音质歌词同步] 命中缓存: ${entry.title} - ${entry.artist} (播放${entry.playCount}次)`)
		return `file://${entry.filePath}`
	} catch (e) {
		logError('[高音质歌词同步] 检查缓存失败:', e)
		return null
	}
}

/**
 * 添加歌曲到缓存索引
 */
const addToCacheIndex = async (
	musicItem: any,
	filePath: string, // 绝对路径，不含 file://
	fileSize: number,
): Promise<void> => {
	if (!isPreciseFLACCacheEnabled()) return
	const index = await loadCacheIndex()
	const musicKey = makeMusicKey(musicItem)
	const now = Date.now()

	// 如果已存在，先删除旧文件
	const oldEntry = index.entries[musicKey]
	if (oldEntry && oldEntry.filePath !== filePath) {
		try {
			const oldFileInfo = await FileSystem.getInfoAsync(oldEntry.filePath)
			if (oldFileInfo.exists) {
				await FileSystem.deleteAsync(oldEntry.filePath, { idempotent: true })
			}
		} catch (e) { /* ignore */ }
	}

	index.entries[musicKey] = {
		musicKey,
		title: musicItem.title || '未知歌曲',
		artist: musicItem.artist || '未知歌手',
		filePath,
		fileSize,
		downloadTime: now,
		lastPlayTime: now,
		playCount: 1,
	}

	await saveCacheIndex()
	logInfo(`[高音质歌词同步] 已加入缓存: ${musicItem.title} (${(fileSize / 1024 / 1024).toFixed(1)}MB)`)

	// 检查是否需要清理
	await cleanupCache()
}

/**
 * 删除本地 FLAC 文件（切歌时调用）
 * 如果开启了缓存，则不删除，只清除当前状态
 */
export const removeLocalFLAC = async (reason: string = '切歌'): Promise<void> => {
	if (currentDownloadTask) {
		try {
			currentDownloadTask.cancel()
			logInfo(`[高音质歌词同步] 取消当前下载任务: ${currentDownloadTask.url.substring(0, 50)}...`)
		} catch (e) {
			logError('[高音质歌词同步] 取消下载任务失败:', e)
		}
		currentDownloadTask = null
	}
	// 新歌开始：清除直换去重标记
	lastSwitchedLocalFile = null

	// 如果开启了缓存，不删除文件，只清除当前状态
	if (isPreciseFLACCacheEnabled()) {
		logInfo(`[高音质歌词同步] 缓存已开启，保留本地文件（${reason}）`)
		currentLocalFile = null
		currentMusicKey = null
		return
	}

	// 未开启缓存，删除文件
	if (currentLocalFile) {
		try {
			const fileInfo = await FileSystem.getInfoAsync(currentLocalFile)
			if (fileInfo.exists) {
				await FileSystem.deleteAsync(currentLocalFile, { idempotent: true })
				logInfo(`[高音质歌词同步] 删除本地文件成功（${reason}）: ${currentLocalFile}`)
			}
		} catch (e) {
			logError('[高音质歌词同步] 删除本地文件失败:', e)
		}
		currentLocalFile = null
	}

	currentMusicKey = null
}

/**
 * 生成歌曲唯一标识
 */
const makeMusicKey = (musicItem: any): string => {
	return `${musicItem.platform || musicItem.source || 'unknown'}_${musicItem.id || musicItem.songmid || 'unknown'}`
}

/**
 * 启动 FLAC 后台下载
 */
export const startFLACDownload = async (
	url: string,
	musicItem: any,
	onComplete?: (localPath: string) => void,
	onError?: (error: string) => void,
): Promise<void> => {
	if (!isPreciseFLACEnabled()) {
		logInfo('[高音质歌词同步] 设置未开启，跳过下载')
		return
	}

	if (!isFLACUrl(url)) {
		return
	}

	const musicKey = makeMusicKey(musicItem)

	// 双触发去重：同一首歌已有下载任务在跑时跳过。
	// 必须在任何 await 之前同步登记/检查（此函数前面的检查与缓存命中都含 await，
	// 若等 currentDownloadTask 赋值再判，Resolver 与切歌监听的竞态会各下载一份）
	if (inflightDownloadKey === musicKey) {
		logInfo(`[高音质歌词同步] ${musicItem.title || musicKey} 已在下载中，跳过重复下载`)
		return
	}
	inflightDownloadKey = musicKey

	// 如果开启了缓存，先检查是否已有缓存
	if (isPreciseFLACCacheEnabled()) {
		const cachedPath = await getCachedFLAC(musicItem)
		if (cachedPath) {
			logInfo(`[高音质歌词同步] 已有缓存，直接使用本地文件: ${musicItem.title}`)
			inflightDownloadKey = null
			currentMusicKey = musicKey
			currentLocalFile = cachedPath
			// 直接切换到本地文件
			const switchSuccess = await switchToLocalFile(cachedPath, musicItem)
			if (switchSuccess) {
				logInfo('[高音质歌词同步] 缓存切换成功！')
			}
			onComplete?.(cachedPath)
			return
		}
	}

	logInfo(`[高音质歌词同步] 检测到高音质歌曲，开始后台下载: ${musicItem.title || musicKey}`)
	logInfo(`[高音质歌词同步] 下载链接: ${url.substring(0, 100)}`)

	await ensureCacheDir()

	const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}.flac`
	const localPath = `${FLAC_CACHE_DIR}${fileName}`

	try {
		// 先用 HEAD 请求检查 URL 可访问性
		let finalUrl = url
		try {
			const headResp = await fetch(url, {
				method: 'HEAD',
				headers: { 'User-Agent': 'AppleCoreMedia/1.0.0 (iPhone; U; CPU OS 18_0 like Mac OS X)' },
			})
			logInfo(`[高音质歌词同步] URL检查: 状态码=${headResp.status}, Content-Type=${headResp.headers.get('content-type')}, Content-Length=${headResp.headers.get('content-length')}`)
			if (headResp.url && headResp.url !== url) {
				logInfo(`[高音质歌词同步] URL重定向: ${headResp.url.substring(0, 100)}`)
				finalUrl = headResp.url
			}
		} catch (headError: any) {
			logInfo(`[高音质歌词同步] HEAD请求失败（继续用GET下载）: ${headError?.message}`)
		}

		// 创建下载任务
		const downloadResumable = FileSystem.createDownloadResumable(
			finalUrl,
			localPath,
			{ headers: { 'User-Agent': 'AppleCoreMedia/1.0.0 (iPhone; U; CPU OS 18_0 like Mac OS X)' } },
			() => {},
		)

		currentDownloadTask = {
			url: finalUrl,
			file: localPath,
			cancel: () => { try { downloadResumable.cancelAsync() } catch (e) { /* ignore */ } },
		}
		currentMusicKey = musicKey

		// 开始下载
		const result = await downloadResumable.downloadAsync()

		if (result && result.uri) {
			const fileInfo = await FileSystem.getInfoAsync(result.uri, { size: true })
			const fileSize = fileInfo.size || 0

			logInfo(`[高音质歌词同步] 下载完成！文件大小: ${(fileSize / 1024 / 1024).toFixed(2)} MB`)

			if (fileSize < 500000) {
				logError(`[高音质歌词同步] 文件太小（${fileSize}字节），可能不是完整音频`)
				await FileSystem.deleteAsync(result.uri, { idempotent: true })
				onError?.('下载文件太小，可能不是完整音频')
				return
			}

			currentDownloadTask = null

			// FLAC 转无损 PCM（CAF）
			logInfo('[高音质歌词同步] 开始FLAC转无损PCM（转后seek精准）')
			let pcmPath: string | null = null
			try {
				if (NativeModules.FLACConverter) {
					const flacPurePath = result.uri.replace('file://', '')
					pcmPath = await NativeModules.FLACConverter.convertFLACToPCM(flacPurePath)
					logInfo(`[高音质歌词同步] FLAC转PCM完成！路径: ${pcmPath}`)
				} else {
					logError('[高音质歌词同步] 原生模块FLACConverter不存在，直接用FLAC文件（seek可能不精准）')
				}
			} catch (convertError: any) {
				logError('[高音质歌词同步] FLAC转PCM失败:', convertError)
			}

			const finalLocalPath = pcmPath ? `file://${pcmPath}` : result.uri
			currentLocalFile = finalLocalPath

			// 如果开启了缓存，保存到缓存索引
			if (isPreciseFLACCacheEnabled() && pcmPath) {
				// PCM文件大小
				try {
					const pcmFileInfo = await FileSystem.getInfoAsync(`file://${pcmPath}`, { size: true })
					const pcmSize = pcmFileInfo.size || fileSize
					await addToCacheIndex(musicItem, pcmPath, pcmSize)
				} catch (e) {
					logError('[高音质歌词同步] 获取PCM文件大小失败:', e)
					await addToCacheIndex(musicItem, pcmPath, fileSize)
				}
				// 删除原始FLAC文件（已转成PCM，不需要保留）
				try {
					await FileSystem.deleteAsync(result.uri, { idempotent: true })
				} catch (e) { /* ignore */ }
			}

			// 切换到本地文件
			const switchSuccess = await switchToLocalFile(finalLocalPath, musicItem)
			if (switchSuccess) {
				logInfo(`[高音质歌词同步] 切换成功！已使用${pcmPath ? '本地PCM' : '本地FLAC'}文件播放`)
			}

			onComplete?.(finalLocalPath)
		} else {
			try {
				const fileInfo = await FileSystem.getInfoAsync(localPath, { size: true })
				logError(`[高音质歌词同步] 下载失败：无返回结果。本地文件: exists=${fileInfo.exists}, size=${fileInfo.size || 0}`)
			} catch (checkError) {
				logError(`[高音质歌词同步] 下载失败：无返回结果。检查文件异常: ${checkError}`)
			}
			onError?.('下载失败：无返回结果')
		}
	} catch (e: any) {
		if (e?.message?.includes('cancel') || e?.code === 'ERR_CANCELED') {
			logInfo('[高音质歌词同步] 下载已取消')
		} else {
			logError('[高音质歌词同步] 下载异常:', e)
			logError(`[高音质歌词同步] 异常详情: message=${e?.message}, code=${e?.code}, status=${e?.status}`)
			onError?.(e?.message || '下载异常')
		}
	} finally {
		currentDownloadTask = null
		// 释放下载去重登记（若此任务仍对应当前 key）
		if (inflightDownloadKey === musicKey) {
			inflightDownloadKey = null
		}
	}
}

/**
 * 等待队列中“相邻下一项”完成预装后再 skip，保证 advanceToNextItem 无缝。
 * 分档递增计时：本地 PCM 通常几十毫秒就绪，绝大多数情况第一次 50ms 即满足；
 * 偶发慢盘时最多等约 1s。期间不中断当前播放。
 */
const waitForAdjacentPreload = async (adjacentIndex: number): Promise<void> => {
	const steps = [50, 80, 120, 180, 260, 320]
	for (let i = 0; i < steps.length; i++) {
		await new Promise<void>(resolve => setTimeout(resolve, steps[i]))
		// 注入的相邻项若已被移除（如极端情况下歌曲已切走），提前结束等待
		try {
			const t = await ReactNativeTrackPlayer.getTrack(adjacentIndex)
			if (!t) return
		} catch (e) {
			return
		}
	}
}

/**
 * 无缝切换到本地文件播放
 * FLAC转PCM后，PCM文件有精确帧索引，seek精准
 *
 * 无缝原理（完全参考 Moumusic swapToLocalFile 实现）：
 * 1. 切换前设置 pending 位置锁定歌词（setPendingPosition）
 * 2. 调用原生 replaceCurrentTrack 一次性完成：
 *    移除旧项 → 插入新项 → 跳转 → 精准 seek(tolerance: .zero) → 恢复播放
 * 3. 原生层面原子操作，比 JS 层 skip+seek 快得多，完全无缝
 * 4. pending 机制让歌词全程保持在正确位置，不会跳开头
 */
export const switchToLocalFile = async (localPath: string, musicItem: any): Promise<boolean> => {
	try {
		const musicKey = makeMusicKey(musicItem)
		if (currentMusicKey !== musicKey) {
			logInfo(`[高音质歌词同步] 切换取消：歌曲已变化`)
			return false
		}

		// 双触发去重：MusicSourceResolver（播放源解析）与 setupFLACSync（切歌监听）会对同一首歌
		// 各触发一次下载/切换，同一本地文件只直换一次，避免用户听到连续两三次音频中断
		if (lastSwitchedLocalFile === localPath) {
			logInfo('[高音质歌词同步] 该本地文件已直换过，跳过重复切换（双触发去重）')
			return true
		}

		const progress = await ReactNativeTrackPlayer.getProgress()
		const currentPosition = progress.position

		logInfo(`[高音质歌词同步] 开始切换本地文件，进度: ${currentPosition.toFixed(2)}秒`)

		const currentIndex = await ReactNativeTrackPlayer.getActiveTrackIndex()
		if (currentIndex === undefined || currentIndex < 0) {
			logError('[高音质歌词同步] 切换失败：无法获取当前track索引')
			return false
		}

		const currentTrack = await ReactNativeTrackPlayer.getTrack(currentIndex)
		if (!currentTrack) {
			logError('[高音质歌词同步] 切换失败：无法获取当前track信息')
			return false
		}

		// 关键第一步：调用 beginSourceSwitch 开启切源保护
		// 1. 设置 isSwitchingSource = true，阻止 PlaybackActiveTrackChanged 重置歌词
		//    （原生 replaceCurrentTrack 会触发 ActiveTrackChanged 事件，会误判为切歌）
		// 2. 设置 pending 位置 + 计时，歌词以正常速率虚拟前进
		//    （切换过程中歌词不会停住不动，和人声完全同步）
		const targetPosition = Math.max(0, currentPosition - 0.1)
		// 标记切源中：防止 setupFLACSync 的 ActiveTrackChanged 监听器误判为切歌
		isSourceSwitchInProgress = true
		try {
			LyricManager.beginSourceSwitch(targetPosition)
			logInfo('[高音质歌词同步] 已开启切源保护，歌词无缝衔接中')
		} catch (e) {
			logInfo('[高音质歌词同步] 开启切源保护失败:', e)
		}

		// 构造新 track（替换 URL 为本地文件路径）
		const newTrack = { ...currentTrack, url: localPath }

		// 调用原生 replaceCurrentTrack（Moumusic 同款实现）
		// 原生内部一次性完成：remove → add → jumpToItem → seek(to:toleranceBefore:.zero toleranceAfter:.zero) → play
		const { TrackPlayerModule } = NativeModules
		if (!TrackPlayerModule || !TrackPlayerModule.replaceCurrentTrack) {
			logError('[高音质歌词同步] 原生 replaceCurrentTrack 不可用，回退到JS方式')
			const result = await switchToLocalFileFallback(localPath, musicItem, targetPosition)
			LyricManager.endSourceSwitch()
			return result
		}

		const result = await TrackPlayerModule.replaceCurrentTrack(newTrack)
		logInfo(`[高音质歌词同步] 原生替换成功，position=${result.position.toFixed(2)}, playing=${result.playing}`)

		// seek 完成后刷新 pending 计时，歌词继续虚拟前进
		// 注意：不调用 forceSyncPosition（会重新设置 startTime 导致歌词回退）
		// 只刷新 pendingStartTime，让虚拟位置从当前时间重新计算
		try {
			LyricManager.setPendingPosition(result.position)
			logInfo('[高音质歌词同步] 歌词pending已刷新')
		} catch (e) {
			logInfo('[高音质歌词同步] 歌词刷新失败（不影响播放）:', e)
		}

		// 解除切源保护（pending 机制继续工作直到播放器追上）
		LyricManager.endSourceSwitch()
		// 延迟清除切源标记，等 ActiveTrackChanged 事件发完
		setTimeout(() => { isSourceSwitchInProgress = false }, 500)
		// 登记已直换的文件（双触发去重）
		lastSwitchedLocalFile = localPath

		logInfo('[高音质歌词同步] 切换完成！本地文件播放中，seek精准，歌词同步')
		return true
	} catch (e) {
		logError('[高音质歌词同步] 切换失败:', e)
		// 切换失败，清除所有保护状态
		try {
			LyricManager.endSourceSwitch()
			LyricManager.clearPendingPosition()
		} catch (_) { /* ignore */ }
		isSourceSwitchInProgress = false
		return false
	}
}

/**
 * 回退方案：JS 层 skip+seek（当原生方法不可用时）
 */
const switchToLocalFileFallback = async (localPath: string, musicItem: any, targetPosition: number): Promise<boolean> => {
	try {
		const currentIndex = await ReactNativeTrackPlayer.getActiveTrackIndex()
		if (currentIndex === undefined || currentIndex < 0) return false

		const currentTrack = await ReactNativeTrackPlayer.getTrack(currentIndex)
		if (!currentTrack) return false

		const playbackState = await ReactNativeTrackPlayer.getPlaybackState()
		const wasPlaying = playbackState.state === State.Playing

		const newTrack = { ...currentTrack, url: localPath }

		// 插到相邻下一首，预装后 skip
		await ReactNativeTrackPlayer.add([newTrack], currentIndex + 1)
		await waitForAdjacentPreload(currentIndex + 1)
		await ReactNativeTrackPlayer.skip(currentIndex + 1)
		await ReactNativeTrackPlayer.seekTo(targetPosition)

		if (wasPlaying) {
			await ReactNativeTrackPlayer.play()
		}

		// 刷新 pending 位置
		LyricManager.setPendingPosition(targetPosition)

		setTimeout(async () => {
			try { await ReactNativeTrackPlayer.remove(currentIndex) } catch (_) { /* ignore */ }
		}, 500)

		return true
	} catch (e) {
		logError('[高音质歌词同步] 回退方案也失败:', e)
		return false
	}
}

/**
 * 获取当前本地文件路径
 */
export const getCurrentLocalFLACFile = (): string | null => {
	return currentLocalFile
}

/**
 * 获取当前歌曲标识
 */
export const getCurrentMusicKey = (): string | null => {
	return currentMusicKey
}

/**
 * 清理所有缓存
 */
export const clearAllFLACCache = async (): Promise<void> => {
	await removeLocalFLAC('清理缓存')
	try {
		const dirInfo = await FileSystem.getInfoAsync(FLAC_CACHE_DIR)
		if (dirInfo.exists) {
			await FileSystem.deleteAsync(FLAC_CACHE_DIR, { idempotent: true })
			logInfo('[高音质歌词同步] 清理所有缓存成功')
		}
		cacheIndex = null
	} catch (e) {
		logError('[高音质歌词同步] 清理缓存失败:', e)
	}
}

/**
 * 清理单首歌曲的缓存
 */
export const removeCachedSong = async (musicItem: any): Promise<boolean> => {
	const musicKey = makeMusicKey(musicItem)
	const index = await loadCacheIndex()
	const entry = index.entries[musicKey]
	if (!entry) return false

	try {
		const fileInfo = await FileSystem.getInfoAsync(entry.filePath)
		if (fileInfo.exists) {
			await FileSystem.deleteAsync(entry.filePath, { idempotent: true })
		}
		delete index.entries[musicKey]
		await saveCacheIndex()
		logInfo(`[高音质歌词同步] 已删除缓存: ${entry.title}`)
		return true
	} catch (e) {
		logError('[高音质歌词同步] 删除缓存失败:', e)
		return false
	}
}

// 是否已初始化监听
let setupDone = false

/**
 * 初始化 FLAC 精准同步的事件监听
 * 确保每首歌都会检查并启动高音质下载
 * 解决切歌后下一首歌不重新下载的问题
 */
export const setupFLACSync = () => {
	if (setupDone) return
	setupDone = true

	logInfo('[高音质歌词同步] 初始化事件监听')

	// 监听切歌：每首歌开始播放时检查是否需要下载高音质文件
	ReactNativeTrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
		try {
			// 切源中（同歌换文件）：不是真切歌，跳过
			if (isSourceSwitchInProgress) return

			if (!isPreciseFLACEnabled()) return

			const currentIndex = await ReactNativeTrackPlayer.getActiveTrackIndex()
			if (currentIndex === undefined || currentIndex < 0) return

			const track = await ReactNativeTrackPlayer.getTrack(currentIndex)
			if (!track || !track.url) return

			// 已经是本地文件，不用下载
			if (track.url.startsWith('file://')) return

			const musicItem = track as any
			const musicKey = makeMusicKey(musicItem)

			// 同一首歌不重复处理
			if (currentMusicKey === musicKey) return

			// 清理上一首歌的本地文件
			if (currentMusicKey !== null) {
				removeLocalFLAC('切歌').catch(() => {})
			}

			// 如果开启了缓存，先检查缓存
			if (isPreciseFLACCacheEnabled()) {
				const cachedPath = await getCachedFLAC(musicItem)
				if (cachedPath) {
					logInfo(`[高音质歌词同步] 切歌命中缓存: ${musicItem.title || musicKey}`)
					currentMusicKey = musicKey
					currentLocalFile = cachedPath
					switchToLocalFile(cachedPath, musicItem).catch((e) => {
						logInfo('[高音质歌词同步] 缓存切换失败（不影响播放）:', e)
					})
					return
				}
			}

			// 检查 URL 是否是高音质格式
			if (isFLACUrl(track.url)) {
				logInfo(`[高音质歌词同步] 切歌检测到高音质，开始下载: ${musicItem.title || musicKey}`)
				startFLACDownload(track.url, musicItem).catch((e) => {
					logError('[高音质歌词同步] 切歌下载启动失败:', e)
				})
			}
		} catch (e) {
			logError('[高音质歌词同步] 切歌监听异常:', e)
		}
	})
}
