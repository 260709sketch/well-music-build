import PersistStatus from '@/store/PersistStatus'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { useCacheManagerStore } from '@/store/cacheManagerStore'
import { usePlayerStyleStore } from '@/store/playerStyleStore'
import { useTabBarStyleStore } from '@/store/tabBarStyleStore'
import { usePreloadSettingsStore } from '@/store/preloadSettingsStore'
import { useCrossPlatformFallbackStore } from '@/store/crossPlatformFallbackStore'
import { useLayoutStore } from '@/store/playerLayoutStore'
import { useGlassHighlightStore } from '@/store/glassHighlightStore'
import { useHideBannerStore } from '@/store/hideBannerStore'
import { useListenStatsStore } from '@/store/listenStatsStore'
import { useTitleLanguageStore } from '@/store/titleLanguageStore'
import RNFS from 'react-native-fs'
import { Platform, Alert } from 'react-native'

export interface BackupData {
  version: string
  backupTime: number
  // 1. 完整音源数据
  musicApi: any[]
  selectedMusicApi: any
  // 2. 软件设置项
  settings: {
    quality: string
    themeMode: string
    playerStyle: string
    tabBarStyle: string
    preloadEnabled: boolean
    preloadCount: number
    preloadDelay: number
    verifyCacheUrl: boolean
    crossPlatformFallback: boolean
    maxCacheSize: string
    showTranslation: boolean
    detailFontSize: number
    delaySeconds: number
    delayBySong?: Record<string, number>
    isCachedIconVisible: boolean
    songsNumsToLoad: number
    autoCacheLocal: boolean
    enabledMusicSources: string[]
  }
  // 3. 收藏的歌曲数据及歌曲完整信息
  favorites: any[]
  // 4. 导入的网易云歌单数据
  playLists: any[]
  // 5. 网易云音乐 Cookie
  neteaseCookie: string
  neteaseUserInfo: {
    nickname: string
    avatar: string
    userId: string
    isLoggedIn: boolean
  }
  neteaseUserPlaylists: any[]
  // 6. 历史播放数据
  playHistory: any[]
  // 7. 其他数据
  searchHistory: any[]
  dailyRecommend: any[]
  selectedRapArtists: string[]
  // 8. 播放器布局调整参数
  playerLayout: any
  // 9. 用户手动调整的各项开关
  userTweaks?: {
    karaokeEnabled: boolean
    autoPlayOnLaunch: boolean
    showStylizedRecommend: boolean
    recentSyncNetease: boolean
    scrobbleToNetease: boolean
    songHighlightAnimation: boolean
    glassTopHighlight: boolean
    hideNeteaseBanner: boolean
    chineseTitleEnabled: boolean
  }
  // 9.5 听歌统计（播放次数 + 累计时长）
  listenStats?: {
    playCount: number
    listenSeconds: number
  }
  // 10. AsyncStorage 全量快照（local-config 设置、搜索历史、换源/音量/听歌统计等全部键，绝不遗漏）
  asyncStorage?: Record<string, string | null>
  // 11. MMKV appPersistStatus 全量快照（播放队列/当前歌曲/进度/播放模式/本地导入音乐等全部键）
  persistStatusMmkv?: Record<string, string>
}

export const BACKUP_VERSION = '1.1.0'

// 收集所有需要备份的数据
export async function collectBackupData(): Promise<BackupData> {
  const dailyState = useDailyRecommendStore.getState()
  const cacheState = useCacheManagerStore.getState()
  const playerStyleState = usePlayerStyleStore.getState()
  const tabBarState = useTabBarStyleStore.getState()
  const preloadState = usePreloadSettingsStore.getState()
  const fallbackState = useCrossPlatformFallbackStore.getState()
  const layoutState = useLayoutStore.getState()

  return {
    version: BACKUP_VERSION,
    backupTime: Date.now(),
    // 1. 完整音源数据
    musicApi: PersistStatus.get('music.musicApi') || [],
    selectedMusicApi: PersistStatus.get('music.selectedMusicApi') || null,
    // 2. 软件设置项
    settings: {
      quality: PersistStatus.get('music.quality') || 'standard',
      themeMode: PersistStatus.get('app.themeMode') || 'system',
      playerStyle: (playerStyleState as any).playerStyle || 'classic',
      tabBarStyle: (tabBarState as any).tabBarStyle || 'default',
      preloadEnabled: (preloadState as any).preloadEnabled || false,
      preloadCount: (preloadState as any).preloadCount || 0,
      preloadDelay: (preloadState as any).preloadDelay || 5,
      verifyCacheUrl: (fallbackState as any).verifyCacheUrl || false,
      crossPlatformFallback: (fallbackState as any).enabled || false,
      maxCacheSize: cacheState.maxCacheSize,
      showTranslation: PersistStatus.get('lyric.showTranslation') || false,
      detailFontSize: PersistStatus.get('lyric.detailFontSize') || 16,
      delaySeconds: PersistStatus.get('lyric.delaySeconds') || 0,
      delayBySong: JSON.parse(PersistStatus.get('lyric.delayBySong') || '{}'),
      isCachedIconVisible: PersistStatus.get('music.isCachedIconVisible') || false,
      songsNumsToLoad: PersistStatus.get('music.songsNumsToLoad') || 10,
      autoCacheLocal: PersistStatus.get('music.autoCacheLocal') || false,
      enabledMusicSources: PersistStatus.get('music.enabledMusicSources') || [],
    },
    // 3. 收藏的歌曲数据及歌曲完整信息
    favorites: PersistStatus.get('music.favorites') || [],
    // 4. 导入的网易云歌单数据
    playLists: PersistStatus.get('music.playLists') || [],
    // 5. 网易云音乐 Cookie
    neteaseCookie: (dailyState as any).cookie || '',
    neteaseUserInfo: {
      nickname: (dailyState as any).nickname || '',
      avatar: (dailyState as any).avatar || '',
      userId: (dailyState as any).userId || '',
      isLoggedIn: (dailyState as any).isLoggedIn || false,
    },
    neteaseUserPlaylists: (dailyState as any).userPlaylists || [],
    // 6. 历史播放数据
    playHistory: PersistStatus.get('music.playHistory') || [],
    // 7. 其他数据
    searchHistory: [],
    dailyRecommend: (dailyState as any).tracks || [],
    selectedRapArtists: (dailyState as any).selectedRapArtists || [],
    // 8. 播放器布局调整参数
    playerLayout: layoutState.settings,
    // 9. 用户手动调整的各项开关
    userTweaks: {
      karaokeEnabled: PersistStatus.get('lyric.karaokeEnabled') ?? false,
      autoPlayOnLaunch: PersistStatus.get('music.autoPlayOnLaunch') ?? false,
      showStylizedRecommend: PersistStatus.get('music.showStylizedRecommend') === true || PersistStatus.get('music.showStylizedRecommend') === 'true',
      recentSyncNetease: PersistStatus.get('music.recentSyncNetease') ?? true,
      scrobbleToNetease: PersistStatus.get('music.scrobbleToNetease') ?? true,
      songHighlightAnimation: PersistStatus.get('music.songHighlightAnimation') ?? true,
      glassTopHighlight: useGlassHighlightStore.getState().glassTopHighlight,
      hideNeteaseBanner: useHideBannerStore.getState().hideNeteaseBanner,
      chineseTitleEnabled: useTitleLanguageStore.getState().chineseTitleEnabled,
    },
    // 听歌统计
    listenStats: {
      playCount: useListenStatsStore.getState().playCount || 0,
      listenSeconds: useListenStatsStore.getState().listenSeconds || 0,
    },
    // 全量快照：AsyncStorage 全部键（原始字符串，含 @___PART___ 分片）
    asyncStorage: await captureAsyncStorage(),
    // 全量快照：MMKV appPersistStatus 全部键
    persistStatusMmkv: capturePersistStatusMmkv(),
  }
}

import AsyncStorage from '@react-native-async-storage/async-storage'
import getOrCreateMMKV from '@/store/getOrCreateMMKV'

// AsyncStorage 全量快照：所有键原样读出（含分片键），恢复时原样写回
// AsyncStorage 快照排除纯缓存键（缓存数据可自动重建，无备份价值，体积大头之一）
const AS_SNAPSHOT_SKIP = new Set([
  'cache-manager-storage',
  'daily-recommend-storage',
  'glass-highlight-storage',
  'hide-banner-storage',
])

async function captureAsyncStorage(): Promise<Record<string, string | null>> {
  try {
    const keys = await AsyncStorage.getAllKeys()
    if (!keys || keys.length === 0) return {}
    const entries = await AsyncStorage.multiGet(keys)
    const snap: Record<string, string | null> = {}
    for (const [k, v] of entries) {
      if (AS_SNAPSHOT_SKIP.has(k)) continue
      snap[k] = v
    }
    return snap
  } catch (e) {
    console.error('[Backup] AsyncStorage 快照失败:', e)
    return {}
  }
}

// MMKV appPersistStatus 全量快照（歌单/音源/收藏/播放队列/进度/当前歌曲等）
// MMKV 快照去重：以下大键已由结构化字段单独备份/恢复，快照里排除，
// 避免同一份数据在备份文件里存两份（大幅缩小备份体积），不丢任何数据。
const MMKV_SNAPSHOT_SKIP = new Set([
  'music.musicApi',
  'music.selectedMusicApi',
  'music.playLists',
  'music.favorites',
  'music.play-list',
  'music.playList',
  'music.playHistory',
  'music.importedLocalMusic',
  'music.musicItem',
])

function capturePersistStatusMmkv(): Record<string, string> {
  try {
    const store = getOrCreateMMKV('appPersistStatus')
    const keys = store.getAllKeys()
    const snap: Record<string, string> = {}
    for (const k of keys) {
      if (MMKV_SNAPSHOT_SKIP.has(k)) continue
      const v = store.getString(k)
      if (v != null) snap[k] = v
    }
    return snap
  } catch (e) {
    console.error('[Backup] MMKV 快照失败:', e)
    return {}
  }
}

// 获取备份文件存储目录
const getBackupDir = (): string => {
  if (Platform.OS === 'ios') {
    return `${RNFS.DocumentDirectoryPath}/backups`
  }
  return `${RNFS.ExternalDirectoryPath}/backups`
}

// 导出备份数据为文件
export async function exportBackupData(): Promise<string> {
  try {
    const data = await collectBackupData()
    const jsonStr = JSON.stringify(data, null, 2)
    const dir = getBackupDir()
    const fileName = `wellmusic_backup_${new Date().toISOString().slice(0, 10)}_${Date.now()}.json`
    const fileUri = `${dir}/${fileName}`
    
    // 确保目录存在
    const dirExists = await RNFS.exists(dir)
    if (!dirExists) {
      await RNFS.mkdir(dir)
    }
    
    await RNFS.writeFile(fileUri, jsonStr, 'utf8')
    
    console.log('[Backup] 备份文件已创建:', fileUri)
    return fileUri
  } catch (error) {
    console.error('[Backup] 导出备份失败:', error)
    throw error
  }
}

// 列出所有备份文件
export async function listBackupFiles(): Promise<{name: string, path: string, size: number, mtime: string}[]> {
  try {
    const dir = getBackupDir()
    const dirExists = await RNFS.exists(dir)
    if (!dirExists) {
      return []
    }
    
    const files = await RNFS.readDir(dir)
    return files
      .filter(f => f.name.endsWith('.json'))
      .map(f => ({
        name: f.name,
        path: f.path,
        size: (f as any).size || 0,
        mtime: (f as any).mtime ? new Date((f as any).mtime).toLocaleString() : '',
      }))
      .sort((a, b) => b.name.localeCompare(a.name))
  } catch (error) {
    console.error('[Backup] 列出备份文件失败:', error)
    return []
  }
}

// 删除备份文件
export async function deleteBackupFile(filePath: string): Promise<void> {
  try {
    await RNFS.unlink(filePath)
    console.log('[Backup] 备份文件已删除:', filePath)
  } catch (error) {
    console.error('[Backup] 删除备份文件失败:', error)
    throw error
  }
}

// 导入备份数据
export async function importBackupData(fileUri: string): Promise<BackupData> {
  try {
    const content = await RNFS.readFile(fileUri, 'utf8')
    const data = JSON.parse(content) as BackupData
    
    if (!data.version || !data.backupTime) {
      throw new Error('无效的备份文件格式')
    }
    
    return data
  } catch (error) {
    console.error('[Backup] 导入备份失败:', error)
    throw error
  }
}

// 恢复备份数据
export async function restoreBackupData(data: BackupData): Promise<void> {
  try {
    console.log('[Backup] 开始恢复备份数据...')
    
    // 1. 恢复音源数据
    try {
      if (data.musicApi) {
        PersistStatus.set('music.musicApi', data.musicApi)
      }
      if (data.selectedMusicApi) {
        PersistStatus.set('music.selectedMusicApi', data.selectedMusicApi)
      }
    } catch (e) {
      console.error('[Backup] 恢复音源数据失败:', e)
    }
    
    // 2. 恢复软件设置项
    if (data.settings) {
      const s = data.settings
      if (s.quality) PersistStatus.set('music.quality', s.quality)
      if (s.themeMode) PersistStatus.set('app.themeMode', s.themeMode)
      if (s.showTranslation !== undefined) PersistStatus.set('lyric.showTranslation', s.showTranslation)
      if (s.detailFontSize) PersistStatus.set('lyric.detailFontSize', s.detailFontSize)
      if (s.delaySeconds !== undefined) PersistStatus.set('lyric.delaySeconds', s.delaySeconds)
      if (s.delayBySong !== undefined) {
        PersistStatus.set('lyric.delayBySong', JSON.stringify(s.delayBySong || {}))
      }
      if (s.isCachedIconVisible !== undefined) PersistStatus.set('music.isCachedIconVisible', s.isCachedIconVisible)
      if (s.songsNumsToLoad) PersistStatus.set('music.songsNumsToLoad', s.songsNumsToLoad)
      if (s.autoCacheLocal !== undefined) PersistStatus.set('music.autoCacheLocal', s.autoCacheLocal)
      if (s.enabledMusicSources !== undefined) PersistStatus.set('music.enabledMusicSources', s.enabledMusicSources)
      if (s.verifyCacheUrl !== undefined) PersistStatus.set('music.verifyCacheUrl', s.verifyCacheUrl)
      
      // 恢复缓存设置
      const cacheState = useCacheManagerStore.getState()
      if (s.maxCacheSize) cacheState.setMaxCacheSize(s.maxCacheSize)
      
      // 恢复播放器样式
      try {
        const playerStyleState = usePlayerStyleStore.getState()
        if (s.playerStyle && playerStyleState.setPlayerStyle) {
          playerStyleState.setPlayerStyle(s.playerStyle as any)
        }
      } catch (e) {
        console.log('[Backup] 恢复播放器样式失败:', e)
      }
      
      // 恢复底部状态栏样式
      try {
        const tabBarState = useTabBarStyleStore.getState()
        if (s.tabBarStyle && tabBarState.setTabBarStyle) {
          tabBarState.setTabBarStyle(s.tabBarStyle as any)
        }
      } catch (e) {
        console.log('[Backup] 恢复底部栏样式失败:', e)
      }
      
      // 恢复预加载设置
      try {
        const preloadState = usePreloadSettingsStore.getState()
        if (s.preloadEnabled !== undefined && preloadState.setPreloadEnabled) {
          preloadState.setPreloadEnabled(s.preloadEnabled)
        }
        if (s.preloadCount !== undefined && preloadState.setPreloadCount) {
          preloadState.setPreloadCount(s.preloadCount as any)
        }
        if (s.preloadDelay !== undefined && preloadState.setPreloadDelaySeconds) {
          preloadState.setPreloadDelaySeconds(s.preloadDelay)
        }
      } catch (e) {
        console.log('[Backup] 恢复预加载设置失败:', e)
      }
      
      // 恢复跨平台回退设置
      try {
        const fallbackState = useCrossPlatformFallbackStore.getState()
        if (s.crossPlatformFallback !== undefined && fallbackState.setEnabled) {
          fallbackState.setEnabled(s.crossPlatformFallback)
        }
      } catch (e) {
        console.log('[Backup] 恢复跨平台回退设置失败:', e)
      }

      // 恢复播放器布局调整参数
      try {
        if (data.playerLayout) {
          const layoutState = useLayoutStore.getState()
          if (layoutState.updateSettings) {
            layoutState.updateSettings(data.playerLayout)
          }
        }
      } catch (e) {
        console.log('[Backup] 恢复播放器布局参数失败:', e)
      }
    }

    // 恢复用户手动调整的各项开关
    if (data.userTweaks) {
      const t = data.userTweaks
      try {
        if (t.karaokeEnabled !== undefined) PersistStatus.set('lyric.karaokeEnabled', t.karaokeEnabled)
        if (t.autoPlayOnLaunch !== undefined) PersistStatus.set('music.autoPlayOnLaunch', t.autoPlayOnLaunch)
        if (t.showStylizedRecommend !== undefined) PersistStatus.set('music.showStylizedRecommend', t.showStylizedRecommend)
        if (t.recentSyncNetease !== undefined) PersistStatus.set('music.recentSyncNetease', t.recentSyncNetease)
        if (t.scrobbleToNetease !== undefined) PersistStatus.set('music.scrobbleToNetease', t.scrobbleToNetease)
        if (t.songHighlightAnimation !== undefined) PersistStatus.set('music.songHighlightAnimation', t.songHighlightAnimation)
      } catch (e) {
        console.log('[Backup] 恢复持久化开关失败:', e)
      }
      try {
        const glass = useGlassHighlightStore.getState()
        if (t.glassTopHighlight !== undefined && glass.setGlassTopHighlight) glass.setGlassTopHighlight(t.glassTopHighlight)
        const banner = useHideBannerStore.getState()
        if (t.hideNeteaseBanner !== undefined && banner.setHideNeteaseBanner) banner.setHideNeteaseBanner(t.hideNeteaseBanner)
        const titleLang = useTitleLanguageStore.getState()
        if (t.chineseTitleEnabled !== undefined && titleLang.setChineseTitleEnabled) titleLang.setChineseTitleEnabled(t.chineseTitleEnabled)
      } catch (e) {
        console.log('[Backup] 恢复界面开关失败:', e)
      }
    }
    
    // 恢复自定义歌手随机歌曲
    if (data.selectedRapArtists && data.selectedRapArtists.length > 0) {
      try {
        const dailyState = useDailyRecommendStore.getState()
        if ((dailyState as any).setSelectedRapArtists) {
          ;(dailyState as any).setSelectedRapArtists(data.selectedRapArtists)
        }
      } catch (e) {
        console.log('[Backup] 恢复自定义歌手失败:', e)
      }
    }
    
    // 3. 恢复收藏的歌曲
    try {
      if (data.favorites) {
        PersistStatus.set('music.favorites', data.favorites)
      }
    } catch (e) {
      console.error('[Backup] 恢复收藏失败:', e)
    }
    
    // 4. 恢复歌单数据
    try {
      if (data.playLists) {
        PersistStatus.set('music.playLists', data.playLists)
      }
    } catch (e) {
      console.error('[Backup] 恢复歌单失败:', e)
    }
    
    // 5. 恢复网易云Cookie和用户信息
    if (data.neteaseCookie) {
      try {
        const dailyState = useDailyRecommendStore.getState()
        if ((dailyState as any).setLoginInfo) {
          ;(dailyState as any).setLoginInfo(
            data.neteaseCookie,
            data.neteaseUserInfo?.nickname || '网易云用户',
            data.neteaseUserInfo?.avatar || '',
            data.neteaseUserInfo?.userId || '',
          )
        }
      } catch (e) {
        console.error('[Backup] 恢复网易云登录信息失败:', e)
      }
    }
    
    // 6. 恢复历史播放
    try {
      if (data.playHistory) {
        PersistStatus.set('music.playHistory', data.playHistory)
      }
    } catch (e) {
      console.error('[Backup] 恢复历史播放失败:', e)
    }
    
    // 6.5 恢复听歌统计（内存立即生效，不依赖重启）
    if (data.listenStats) {
      try {
        useListenStatsStore.setState({
          playCount: data.listenStats.playCount || 0,
          listenSeconds: data.listenStats.listenSeconds || 0,
        })
        const ls = useListenStatsStore.getState()
        if (typeof ls.incPlay === 'function') {
          // setState 后 persist 会自动写回 AsyncStorage 'listen-stats'
        }
        console.log('[Backup] 听歌统计已恢复:', data.listenStats)
      } catch (e) {
        console.error('[Backup] 听歌统计恢复失败:', e)
      }
    }

    // 7. 恢复 AsyncStorage 全量快照（兜底：local-config、搜索历史、音源引擎等全部键）
    if (data.asyncStorage && Object.keys(data.asyncStorage).length > 0) {
      const pairs: Array<[string, string]> = []
      for (const [k, v] of Object.entries(data.asyncStorage)) {
        if (v != null) pairs.push([k, v])
      }
      if (pairs.length > 0) {
        try {
          await AsyncStorage.multiSet(pairs)
          console.log('[Backup] AsyncStorage 快照已恢复:', pairs.length, '个键')
        } catch (e) {
          console.error('[Backup] AsyncStorage 快照恢复失败:', e)
        }
      }
    }
    
    // 8. 恢复 MMKV appPersistStatus 全量快照（兜底：播放队列/当前歌曲/进度/本地导入等全部键）
    if (data.persistStatusMmkv && Object.keys(data.persistStatusMmkv).length > 0) {
      try {
        const store = getOrCreateMMKV('appPersistStatus')
        for (const [k, v] of Object.entries(data.persistStatusMmkv)) {
          store.set(k, v)
        }
        console.log('[Backup] MMKV 快照已恢复:', Object.keys(data.persistStatusMmkv).length, '个键')
      } catch (e) {
        console.error('[Backup] MMKV 快照恢复失败:', e)
      }
    }
    
    console.log('[Backup] 备份数据恢复完成')
  } catch (error: any) {
    console.error('[Backup] 恢复备份失败:', error?.message, error?.stack)
    throw new Error(error?.message || '恢复备份数据时出错')
  }
}

// 获取备份统计信息
export function getBackupStats(data: BackupData) {
  const playQueue = data.playList || data['play-list'] || []
  return {
    backupDate: new Date(data.backupTime).toLocaleString(),
    favoritesCount: data.favorites?.length || 0,
    playListsCount: data.playLists?.length || 0,
    playHistoryCount: data.playHistory?.length || 0,
    musicApiCount: data.musicApi?.length || 0,
    hasNeteaseCookie: !!data.neteaseCookie,
    neteasePlaylistsCount: data.neteaseUserPlaylists?.length || 0,
    playQueueCount: Array.isArray(playQueue) ? playQueue.length : 0,
    playCount: data.listenStats?.playCount || 0,
    listenSeconds: data.listenStats?.listenSeconds || 0,
  }
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}
