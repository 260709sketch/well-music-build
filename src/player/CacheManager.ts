import { logError, logInfo } from '@/helpers/logger'
import { importedLocalMusicStore, qualityStore } from './PlayerStore'
import PersistStatus from '@/store/PersistStatus'
import * as FileSystem from 'expo-file-system'
import RNFS from 'react-native-fs'
import { useCacheManagerStore } from '@/store/cacheManagerStore'

const cacheDir = FileSystem.documentDirectory + 'musicCache/'

function sanitizeFilename(str: string): string {
	return str.replace(/[/\\?%*:|"<>]/g, '-')
}

export const ensureCacheDirExists = async () => {
	const dirInfo = await FileSystem.getInfoAsync(cacheDir)
	if (!dirInfo.exists) {
		await FileSystem.makeDirectoryAsync(cacheDir, { intermediates: true })
	}
}

export const ensureDirExists = async (dirPath: string) => {
	const dirInfo = await FileSystem.getInfoAsync(dirPath)
	if (!dirInfo.exists) {
		await FileSystem.makeDirectoryAsync(dirPath, { intermediates: true })
	}
}

export const getLocalFilePath = (musicItem: IMusic.IMusicItem): string => {
	const format = qualityStore.getValue() === 'flac' ? 'flac' : 'mp3'
	const safeTitle = sanitizeFilename(musicItem.title)
	const safeArtist = sanitizeFilename(musicItem.artist)
	const platformId = musicItem.platform && musicItem.id
		? `${musicItem.platform}_${musicItem.id}`
		: `${safeTitle}-${safeArtist}`
	return `${cacheDir}${platformId}.${format}`
}

export const isCached = async (musicItem: IMusic.IMusicItem): Promise<boolean> => {
	const filePath = getLocalFilePath(musicItem)
	const fileInfo = await FileSystem.getInfoAsync(filePath)
	return fileInfo.exists
}

// 缓存超过上限时，按修改时间删除最旧的文件，直到低于上限
const trimCacheIfNeeded = async (): Promise<void> => {
	try {
		const { audioCacheLimitMB } = useCacheManagerStore.getState()
		const currentSizeMB = await getAudioCacheSizeMB()
		if (currentSizeMB < audioCacheLimitMB) return

		logInfo(`音频缓存 ${currentSizeMB.toFixed(1)}MB 超过上限 ${audioCacheLimitMB}MB，开始清理旧文件`)
		const dirInfo = await FileSystem.getInfoAsync(cacheDir)
		if (!dirInfo.exists) return

		const files = await FileSystem.readDirectoryAsync(cacheDir)
		const fileInfos = []
		for (const fileName of files) {
			const filePath = cacheDir + fileName
			const info = await FileSystem.getInfoAsync(filePath)
			if (info.exists) {
				fileInfos.push({
					path: filePath,
					size: (info as any).size || 0,
					modificationTime: (info as any).modificationTime || 0,
				})
			}
		}

		// 按修改时间升序（最旧的在前）
		fileInfos.sort((a, b) => a.modificationTime - b.modificationTime)

		let freedMB = 0
		for (const file of fileInfos) {
			if (currentSizeMB - freedMB < audioCacheLimitMB) break
			await FileSystem.deleteAsync(file.path, { idempotent: true })
			freedMB += file.size / (1024 * 1024)
			logInfo(`已删除旧缓存: ${file.path}, 释放 ${(file.size / 1024 / 1024).toFixed(2)}MB`)
		}
		logInfo(`缓存清理完成，共释放 ${freedMB.toFixed(2)}MB`)
	} catch (error) {
		logError('清理缓存失败:', error)
	}
}

export const downloadToCache = async (musicItem: IMusic.IMusicItem): Promise<string> => {
	try {
		await ensureCacheDirExists()
		// 下载前检查缓存上限，超过则清理旧文件
		await trimCacheIfNeeded()
		const localPath = getLocalFilePath(musicItem)
		const downloadResult = await RNFS.downloadFile({
			fromUrl: musicItem.url,
			toFile: localPath,
			progressDivider: 1,
			progress: (res) => {
				const progress = res.bytesWritten / res.contentLength
				logInfo(`下载进度: ${(progress * 100).toFixed(2)}%`)
			},
		}).promise

		if (downloadResult.statusCode === 200) {
			logInfo('音频文件已缓存到本地:', localPath)
			return localPath
		} else {
			throw new Error(`下载失败，状态码: ${downloadResult.statusCode}`)
		}
	} catch (error) {
		logError('下载音频文件时出错:', error)
		throw error
	}
}

export const clearCache = async () => {
	const dirInfo = await FileSystem.getInfoAsync(cacheDir)
	if (dirInfo.exists) {
		await FileSystem.deleteAsync(cacheDir, { idempotent: true })
		const importedLocalMusic = importedLocalMusicStore.getValue() || []
		const updatedImportedLocalMusic = importedLocalMusic.filter((item: IMusic.IMusicItem) => {
			const url = item.url || ''
			const normalizedUrl = url.replace(/^file:\/\//, '')
			return !normalizedUrl.startsWith(cacheDir)
		})
		importedLocalMusicStore.setValue(updatedImportedLocalMusic)
		PersistStatus.set('music.importedLocalMusic', updatedImportedLocalMusic)
		logInfo('缓存已清理')
	} else {
		logInfo('缓存目录不存在，无需清理')
	}
}

// 递归计算音频缓存目录大小（MB）
export const getAudioCacheSizeMB = async (): Promise<number> => {
	try {
		const dirInfo = await FileSystem.getInfoAsync(cacheDir)
		if (!dirInfo.exists) return 0
		const result = await FileSystem.readDirectoryAsync(cacheDir)
		let totalBytes = 0
		for (const fileName of result) {
			const filePath = cacheDir + fileName
			const fileInfo = await FileSystem.getInfoAsync(filePath)
			if (fileInfo.exists && (fileInfo as any).size) {
				totalBytes += (fileInfo as any).size
			}
		}
		return totalBytes / (1024 * 1024)
	} catch (error) {
		logError('计算音频缓存大小失败:', error)
		return 0
	}
}

export { cacheDir }
