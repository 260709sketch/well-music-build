import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import FastImage from 'react-native-fast-image'
import RNFS from 'react-native-fs'
import { getAudioCacheSizeMB, clearCache as clearAudioCache } from '@/player/CacheManager'

// iOS SDWebImage (FastImage) 缓存目录
const FASTIMAGE_CACHE_DIR = `${RNFS.LibraryDirectoryPath}/Caches/com.hackemist.SDImageCache/default`

// 递归计算目录大小
const dirSize = async (dir: string): Promise<number> => {
	try {
		const items = await RNFS.readDir(dir)
		let total = 0
		for (const item of items) {
			if (item.isFile()) {
				total += item.size || 0
			} else if (item.isDirectory()) {
				total += await dirSize(item.path)
			}
		}
		return total
	} catch {
		return 0
	}
}

export type CacheSizeLimit = '1g' | '3g' | '5g' | '7g' | '15g' | '20g'

interface CacheManagerState {
	// 音频缓存上限（MB）
	audioCacheLimitMB: number
	// 图片缓存上限（MB）
	imageCacheLimitMB: number
	// 音频缓存大小（MB，非持久化）
	audioCacheSizeMB: number
	// 图片缓存大小（非持久化，启动时异步计算）
	imageCacheSize: number // bytes
	// 函数
	setAudioCacheLimitMB: (mb: number) => void
	setImageCacheLimitMB: (mb: number) => void
	clearAllCache: () => Promise<void>
	clearAudioCache: () => Promise<void>
	getAudioCacheSizeMB: () => Promise<number>
	updateAudioCacheSize: () => Promise<void>
	getImageCacheSizeMB: () => Promise<number>
	updateImageCacheSize: () => Promise<void>
	isImageCacheFull: () => boolean
	isAudioCacheFull: () => boolean
	clearImageCache: () => Promise<void>
}

export const useCacheManagerStore = create<CacheManagerState>()(
	persist(
		(set, get) => ({
			audioCacheLimitMB: 2048, // 默认 2GB
			imageCacheLimitMB: 2048, // 默认 2GB
			audioCacheSizeMB: 0,
			imageCacheSize: 0,

			setAudioCacheLimitMB: (mb) => set({ audioCacheLimitMB: mb }),
			setImageCacheLimitMB: (mb) => set({ imageCacheLimitMB: mb }),

			clearAllCache: async () => {
				await clearAudioCache()
				FastImage.clearDiskCache()
				FastImage.clearMemoryCache()
				set({ audioCacheSizeMB: 0, imageCacheSize: 0 })
			},

			clearAudioCache: async () => {
				await clearAudioCache()
				set({ audioCacheSizeMB: 0 })
			},

			getAudioCacheSizeMB: async () => {
				return await getAudioCacheSizeMB()
			},

			updateAudioCacheSize: async () => {
				const size = await getAudioCacheSizeMB()
				set({ audioCacheSizeMB: size })
			},

			getImageCacheSizeMB: async () => {
				const bytes = await dirSize(FASTIMAGE_CACHE_DIR)
				return bytes / (1024 * 1024)
			},

			updateImageCacheSize: async () => {
				const bytes = await dirSize(FASTIMAGE_CACHE_DIR)
				set({ imageCacheSize: bytes })
			},

			isImageCacheFull: () => {
				const state = get()
				const limitBytes = state.imageCacheLimitMB * 1024 * 1024
				return state.imageCacheSize >= limitBytes
			},

			isAudioCacheFull: () => {
				const state = get()
				return state.audioCacheSizeMB >= state.audioCacheLimitMB
			},

			clearImageCache: async () => {
				FastImage.clearDiskCache()
				FastImage.clearMemoryCache()
				set({ imageCacheSize: 0 })
			},
		}),
		{
			name: 'cache-manager-storage',
			storage: createJSONStorage(() => AsyncStorage),
			partialize: (state) => ({
				audioCacheLimitMB: state.audioCacheLimitMB,
				imageCacheLimitMB: state.imageCacheLimitMB,
			}),
		},
	),
)

/**
 * 全局工具：判断当前是否应该缓存图片
 * 图片缓存超过 maxCacheSize 上限时返回 false（不缓存新图片）
 * 清理缓存后自动恢复缓存
 */
export const shouldCacheImage = (): boolean => {
	return !useCacheManagerStore.getState().isImageCacheFull()
}
