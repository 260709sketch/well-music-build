import { create } from 'zustand'
import { musicApiStore } from '@/helpers/trackPlayerIndex'
import { showToast } from '@/utils/utils'
import { createMusicApiFromScript } from '@/helpers/userApi/importMusicSource'
import { reloadLxMusicScript } from '@/helpers/userApi/lxMusicSourceAdapter'
import { searchNeteaseMusic } from '@/helpers/userApi/netease-music-api'
import { searchWithKeyword as searchQQMusic } from '@/helpers/userApi/qq-music-api'
import { searchKuwoMusic } from '@/helpers/userApi/kuwo-music-api'
import { searchKugouMusic } from '@/helpers/userApi/kugou-music-api'

export const QUALITY_LEVELS = [
  { key: 'master', label: 'Master', color: '#9B59B6' },
  { key: 'hires', label: 'Hi-Res', color: '#FF6B6B' },
  { key: '24bit', label: '24bit', color: '#E67E22' },
  { key: 'flac', label: 'FLAC', color: '#4ECDC4' },
  { key: '320k', label: '320K', color: '#45B7D1' },
  { key: '128k', label: '128K', color: '#95A5A6' },
]

export const TEST_QUALITY_ORDER = ['master', 'hires', '24bit', 'flac', '320k', '128k']

export const PLATFORMS = [
  { id: 'kw', name: '酷我', prefix: 'kw_' },
  { id: 'kg', name: '酷狗', prefix: 'kg_' },
  { id: 'tx', name: 'QQ', prefix: '' },
  { id: 'wy', name: '网易', prefix: 'wy_' },
]

// 各平台品牌色（仅用于源测试结果可视化）
export const PLATFORM_COLORS: Record<string, string> = {
  kw: '#f8641c',
  kg: '#0b8eff',
  tx: '#31c27c',
  wy: '#ed3f42',
}

export interface PlatformQualityResult {
  platform: string
  platformName: string
  found: boolean
  songName?: string
  maxQuality: string | null
  qualityResults: Record<string, { success: boolean; error?: string; time: number }>
}

export interface SourceTestResult {
  sourceId: string
  sourceName: string
  status: 'pending' | 'testing' | 'success' | 'failed'
  delay: number | null
  maxQuality: string | null
  message: string
  testedSong: string
  testedPlatform: string | null
  platformResults: PlatformQualityResult[]
  progress?: string
  qualityResults?: Record<string, any>
}

export type KeywordsMap = Record<string, string>

export type TestReport =
  | { id: number; mode: 'all'; ok: number; fail: number; elapsed: number }
  | {
      id: number
      mode: 'single'
      sourceId: string
      sourceName: string
      success: boolean
      bestPlatform?: string
      maxLabel?: string | null
    }

interface SourceTestState {
  results: SourceTestResult[]
  isTesting: boolean
  testingSourceId: string | null
  elapsedTime: number
  ranAll: boolean
  logLines: string[]
  lastReport: TestReport | null
  gotoToken: number
  appendLog: (line: string) => void
  testSingleSource: (
    sourceId: string,
    opts?: { keyword?: string; timeoutSec?: number; silent?: boolean },
  ) => Promise<void>
  testAll: (keywords: KeywordsMap, timeoutSec: number) => Promise<void>
  stop: () => void
  clearResults: () => void
  requestGotoTest: () => void
  consumeReport: () => void
}

// 这些是跨组件实例存活的运行时变量（滑出页面/组件卸载后测试仍继续）
let shouldContinue = true
let elapsedTimer: ReturnType<typeof setInterval> | null = null
let testStartTime = 0
let reportSeq = 1

const pendingResult = (a: any): SourceTestResult => ({
  sourceId: a.id,
  sourceName: a.name,
  status: 'pending',
  delay: null,
  maxQuality: null,
  message: '',
  testedSong: '',
  testedPlatform: null,
  platformResults: [],
  qualityResults: {},
})

async function testSourceQuality(
  api: any,
  songName: string,
  singer: string,
  songmid: string,
  quality: string,
  timeoutMs: number,
): Promise<{ success: boolean; url?: string; error?: string; time: number }> {
  const startTime = Date.now()
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`音质请求超时(${timeoutMs / 1000}秒)`)), timeoutMs),
    )
    const url = await Promise.race([
      api.getMusicUrl(songName, singer, songmid, quality, {
        requestKey: 'sourcetest',
        requestType: 'current',
        timeoutMs,
      } as any),
      timeoutPromise,
    ])
    const elapsed = Date.now() - startTime
    if (url && typeof url === 'string' && url.length > 10 && !url.includes('level=undefined')) {
      return { success: true, url, time: elapsed }
    }
    return { success: false, error: '返回空URL或无效', time: elapsed }
  } catch (error: any) {
    return { success: false, error: error?.message || '未知错误', time: Date.now() - startTime }
  }
}

export const useSourceTestStore = create<SourceTestState>((set, get) => ({
  results: [],
  isTesting: false,
  testingSourceId: null,
  elapsedTime: 0,
  ranAll: false,
  logLines: [],
  lastReport: null,
  gotoToken: 0,

  appendLog: (line: string) =>
    set((s) => ({ logLines: [...s.logLines.slice(-1500), line] })),

  testSingleSource: async (sourceId, opts) => {
    const silent = opts?.silent ?? false
    const timeoutSec = opts?.timeoutSec ?? 20
    const apis = musicApiStore.getValue() || []
    const api = apis.find((a) => a.id === sourceId)
    if (!api) return

    const keyword = opts?.keyword || '晴天'
    if (!keyword.trim()) {
      showToast('请输入测试歌曲名', '', 'error')
      return
    }

    set((s) => {
      if (s.results.length === 0) {
        return {
          results: apis.map((a) =>
            a.id === sourceId ? { ...pendingResult(a), status: 'testing' as const } : pendingResult(a),
          ),
        }
      }
      return {
        results: s.results.map((r) =>
          r.sourceId === sourceId
            ? {
                ...r,
                status: 'testing' as const,
                message: '',
                maxQuality: null,
                testedPlatform: null,
                platformResults: [],
                progress: '正在搜索各平台...',
              }
            : r,
        ),
      }
    })
    set({ testingSourceId: sourceId })
    if (!silent) set({ ranAll: false })

    const totalStart = Date.now()
    const appendLog = get().appendLog
    appendLog(`========== [${api.name}] 开始测试 ==========`)
    appendLog(`测试歌曲: "${keyword}"`)
    appendLog(`--- 搜索阶段（遍历${PLATFORMS.length}个平台）---`)

    let success = false
    let bestPlatform: PlatformQualityResult | null = null
    let totalDelay = 0
    let errMessage = ''

    try {
      let testApi = api
      if (api.scriptType === 'lxmusic') {
        testApi = await reloadLxMusicScript(api)
      } else if (api.script) {
        testApi = await createMusicApiFromScript(api.script)
      }

      if (typeof testApi.getMusicUrl !== 'function') {
        throw new Error('无getMusicUrl方法（脚本未正确初始化）')
      }

      const timeoutMs = timeoutSec * 1000
      const platformResults: PlatformQualityResult[] = []

      for (const platform of PLATFORMS) {
        if (!shouldContinue) break
        appendLog(`[${api.name}] [${platform.name}] 搜索中...`)
        set((s) => ({
          results: s.results.map((r) =>
            r.sourceId === sourceId ? { ...r, progress: `搜索 ${platform.name}...` } : r,
          ),
        }))

        let foundSong: any = null
        let rawId = ''
        try {
          let list: any[] = []
          if (platform.id === 'wy') {
            const res = await searchNeteaseMusic(keyword, 1, 5)
            list = res?.data || []
          } else if (platform.id === 'tx') {
            const res = await searchQQMusic(keyword, 0, 5, 1)
            list = Array.isArray(res) ? res : []
          } else if (platform.id === 'kw') {
            const res = await searchKuwoMusic(keyword, 1, 5)
            list = res?.data || []
          } else if (platform.id === 'kg') {
            const res = await searchKugouMusic(keyword, 1, 5)
            list = res?.data || []
          }
          if (list.length > 0) {
            foundSong = list[0]
            if (platform.id === 'wy') rawId = String(foundSong.id || foundSong.originalId || '')
            else if (platform.id === 'tx') rawId = foundSong.mid || foundSong.songmid || foundSong.id || ''
            else if (platform.id === 'kw') rawId = String(foundSong.id || foundSong.rid || '')
            else if (platform.id === 'kg') rawId = foundSong.hash || foundSong.id || ''
            const sName = foundSong.title || foundSong.songname || foundSong.name || keyword
            const singer =
              foundSong.artist ||
              (Array.isArray(foundSong.singer)
                ? foundSong.singer.map((x: any) => x.name).join('/')
                : foundSong.singername || foundSong.singer || '')
            appendLog(`[${api.name}] [${platform.name}] 找到: ${sName}${singer ? ' - ' + singer : ''} (id:${rawId})`)
          } else {
            appendLog(`[${api.name}] [${platform.name}] 无搜索结果`)
          }
        } catch (searchErr: any) {
          appendLog(`[${api.name}] [${platform.name}] 搜索失败: ${searchErr?.message || '未知错误'}`)
        }

        if (foundSong) {
          const songmid = platform.prefix + rawId
          const singer =
            foundSong.artist ||
            (Array.isArray(foundSong.singer)
              ? foundSong.singer.map((x: any) => x.name).join('/')
              : foundSong.singername || foundSong.singer || '')
          const songName = foundSong.title || foundSong.songname || foundSong.name || keyword
          const qualityResults: Record<string, { success: boolean; error?: string; time: number }> = {}
          let maxQuality: string | null = null

          appendLog(`[${api.name}] [${platform.name}] --- 音质测试 ---`)
          for (const quality of TEST_QUALITY_ORDER) {
            if (!shouldContinue) break
            const qLabel = QUALITY_LEVELS.find((q) => q.key === quality)?.label || quality
            set((s) => ({
              results: s.results.map((r) =>
                r.sourceId === sourceId ? { ...r, progress: `${platform.name} 测试 ${qLabel}` } : r,
              ),
            }))
            const result = await testSourceQuality(testApi, songName, singer, songmid, quality, timeoutMs)
            qualityResults[quality] = result
            if (result.success) {
              if (!maxQuality) maxQuality = quality
              appendLog(`[${api.name}] [${platform.name}]   [OK] ${qLabel} (${result.time}ms)`)
            } else {
              appendLog(`[${api.name}] [${platform.name}]   [FAIL] ${qLabel}: ${result.error} (${result.time}ms)`)
            }
          }

          const pr: PlatformQualityResult = {
            platform: platform.id,
            platformName: platform.name,
            found: true,
            songName: singer ? `${songName} - ${singer}` : songName,
            maxQuality,
            qualityResults,
          }
          platformResults.push(pr)

          if (
            maxQuality &&
            (!bestPlatform ||
              TEST_QUALITY_ORDER.indexOf(maxQuality) <
                TEST_QUALITY_ORDER.indexOf(bestPlatform.maxQuality || '128k'))
          ) {
            bestPlatform = pr
          }
        } else {
          platformResults.push({
            platform: platform.id,
            platformName: platform.name,
            found: false,
            maxQuality: null,
            qualityResults: {},
          })
        }
      }

      totalDelay = Date.now() - totalStart
      success = bestPlatform !== null
      const maxLabel = bestPlatform?.maxQuality
        ? QUALITY_LEVELS.find((q) => q.key === bestPlatform!.maxQuality)?.label
        : null

      const foundCount = platformResults.filter((p) => p.found).length
      appendLog(`--- [${api.name}] 测试汇总（测试${PLATFORMS.length}个平台，${foundCount}个找到歌曲）---`)
      platformResults.forEach((pr) => {
        if (pr.found) {
          const availableQualities = TEST_QUALITY_ORDER.filter((q) => pr.qualityResults[q]?.success)
          const qLabels = availableQualities
            .map((q) => QUALITY_LEVELS.find((ql) => ql.key === q)?.label)
            .join(', ')
          appendLog(`  ${pr.platformName}: ${qLabels || '无可用音质'} (${pr.songName})`)
        } else {
          appendLog(`  ${pr.platformName}: 无搜索结果`)
        }
      })
      appendLog(
        `========== [${api.name}] 完成: ${
          success ? `最佳 ${bestPlatform!.platformName} ${maxLabel}` : '全部失败'
        } (${totalDelay}ms) ==========`,
      )

      set((s) => ({
        results: s.results.map((r) =>
          r.sourceId === sourceId
            ? {
                ...r,
                status: success ? ('success' as const) : ('failed' as const),
                delay: totalDelay,
                maxQuality: bestPlatform?.maxQuality || null,
                testedPlatform: bestPlatform?.platform || null,
                message: success
                  ? `最佳: ${bestPlatform!.platformName} ${maxLabel}`
                  : '所有平台均无可用音质',
                testedSong: bestPlatform?.songName || keyword,
                platformResults,
                progress: undefined,
              }
            : r,
        ),
      }))
    } catch (error: any) {
      totalDelay = Date.now() - totalStart
      errMessage = error?.message || '测试异常'
      appendLog(`[${api.name}] ========== 测试异常: ${errMessage} ==========`)
      set((s) => ({
        results: s.results.map((r) =>
          r.sourceId === sourceId
            ? {
                ...r,
                status: 'failed' as const,
                delay: totalDelay,
                maxQuality: null,
                testedPlatform: null,
                message: errMessage,
                testedSong: keyword,
                platformResults: [],
                progress: undefined,
              }
            : r,
        ),
      }))
    } finally {
      set({ testingSourceId: null })
    }

    // 单个测试（非全部测试内部调用）完成后弹全局完成通知
    if (!silent) {
      const maxLabel = bestPlatform?.maxQuality
        ? QUALITY_LEVELS.find((q) => q.key === bestPlatform!.maxQuality)?.label
        : null
      set({
        ranAll: false,
        lastReport: {
          id: reportSeq++,
          mode: 'single',
          sourceId,
          sourceName: api.name,
          success,
          bestPlatform: bestPlatform?.platformName,
          maxLabel,
        },
      })
    }
  },

  testAll: async (keywords, timeoutSec = 20) => {
    const apis = musicApiStore.getValue() || []
    if (apis.length === 0) {
      showToast('暂无音源', '', 'error')
      return
    }

    shouldContinue = true
    testStartTime = Date.now()
    if (elapsedTimer) clearInterval(elapsedTimer)
    set({
      isTesting: true,
      ranAll: true,
      elapsedTime: 0,
      logLines: [],
      lastReport: null,
      results: apis.map((a) => pendingResult(a)),
    })
    get().appendLog('========== 开始源测试（全平台遍历） ==========')
    elapsedTimer = setInterval(() => {
      set({ elapsedTime: Math.floor((Date.now() - testStartTime) / 1000) })
    }, 1000)

    let stopped = false
    try {
      for (const api of apis) {
        if (!shouldContinue) {
          stopped = true
          break
        }
        await get().testSingleSource(api.id, {
          keyword: keywords[api.id] || '晴天',
          timeoutSec,
          silent: true,
        })
      }
    } finally {
      if (elapsedTimer) {
        clearInterval(elapsedTimer)
        elapsedTimer = null
      }
      const finalElapsed = Math.round((Date.now() - testStartTime) / 1000)
      set({ isTesting: false, testingSourceId: null, elapsedTime: finalElapsed })
      get().appendLog('========== 源测试完成 ==========')
      // 用户主动停止则不弹完成窗
      if (!stopped && shouldContinue) {
        const cur = get().results
        const ok = cur.filter((r) => r.status === 'success').length
        const fail = cur.filter((r) => r.status === 'failed').length
        set({ lastReport: { id: reportSeq++, mode: 'all', ok, fail, elapsed: finalElapsed } })
      }
    }
  },

  stop: () => {
    shouldContinue = false
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    set({ isTesting: false, testingSourceId: null })
    get().appendLog('========== 用户请求停止测试 ==========')
  },

  clearResults: () => {
    shouldContinue = false
    if (elapsedTimer) {
      clearInterval(elapsedTimer)
      elapsedTimer = null
    }
    set({
      results: [],
      logLines: [],
      ranAll: false,
      elapsedTime: 0,
      lastReport: null,
      testingSourceId: null,
      isTesting: false,
    })
  },

  requestGotoTest: () => set((s) => ({ gotoToken: s.gotoToken + 1 })),
  consumeReport: () => set({ lastReport: null }),
}))
