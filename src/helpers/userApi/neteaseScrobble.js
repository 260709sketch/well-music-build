/**
 * 网易云音乐听歌排行 & 最近播放同步
 * 直接照搬 Kumone（missuo/kumone）的 scrobble 机制，不再自行修补。
 *
 * 两个 weblog 接口配合使用：
 * 1. startplay - 写入「最近播放」列表
 * 2. play - 增加听歌排行次数和时长
 *
 * 传输层与 Kumone 完全一致：
 * - eapi 加密，POST https://interface.music.163.com/eapi/feedback/weblog
 * - 加密体内携带客户端 header（os=pc），否则服务端静默忽略
 * - HTTP Cookie 覆写为桌面 macOS 客户端特征 os=osx + appver=3.1.17
 */

import { eapiBody, buildEapiHeader } from './neteaseCrypto'
import { logInfo, logError } from '../logger'
import { showToast } from '@/utils/utils'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'

// 桌面 macOS 客户端 UA（与 Kumone NeteaseClient.userAgent 一致）
const DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'

// weblog 上报 cookie 覆写：os 改 osx、appver 固定 3.1.17，
// 以匹配 Kumone 的 cookieOverrides: ["os": "osx"]（桌面客户端会话特征）。
function buildScrobbleCookie(cookie) {
	let c = cookie.replace(/os=[^;]+/gi, 'os=osx')
	if (!/os=osx/i.test(c)) c = c + '; os=osx'
	c = c.replace(/appver=[^;]+/gi, 'appver=3.1.17')
	if (!/appver=/i.test(c)) c = c + '; appver=3.1.17'
	return c
}

// 存储当前播放的歌曲信息，用于播放完成时上报
let currentTrackInfo = null

/**
 * 获取网易云 cookie（从 dailyRecommendStore 读取）
 */
function getNeteaseCookie() {
  try {
    const state = useDailyRecommendStore.getState()
    return state.cookie || ''
  } catch (e) {
    logError('获取网易云cookie失败', e)
    return ''
  }
}

/**
 * 检查是否已登录网易云
 */
export function isNeteaseLoggedIn() {
  const cookie = getNeteaseCookie()
  return cookie.includes('MUSIC_U=') || cookie.includes('MUSIC_A=') || cookie.length > 50
}

/**
 * 发送 weblog 上报（eapi /feedback/weblog，照搬 Kumone）
 * @param logs - 日志数组
 */
async function sendWeblog(logs) {
  try {
    const cookie = getNeteaseCookie()
    if (!cookie) {
      logInfo('网易云未登录，跳过听歌上报')
      return false
    }

    const logsString = JSON.stringify(logs)
    // eapi 通路（与 Kumone sendWeblog 完全一致）：加密负载 = { logs: <JSON字符串>, header: <客户端header> }，
    // header 必须随密文携带，否则服务端静默忽略。URL 域名走 interface.music.163.com/eapi<path>。
    const apiPath = '/api/feedback/weblog'
    const body = eapiBody(apiPath, {
      logs: logsString,
      header: buildEapiHeader(cookie),
    })

    const response = await fetch('https://interface.music.163.com/eapi/feedback/weblog', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': buildScrobbleCookie(cookie),
        'User-Agent': DESKTOP_UA,
        'Referer': 'https://music.163.com/',
      },
      body,
    })

    const data = await response.json()
    const action = logs[0] && logs[0].action
    // 完整回显，便于排查"200 但不计入"的真实原因
    logInfo('网易云听歌上报响应(完整)', { action, code: data.code, msg: data.message || data.msg, body: JSON.stringify(data).substring(0, 300) })
    if (data.code === 200) {
      logInfo('网易云听歌上报成功', action)
      return true
    } else {
      logError('网易云听歌上报失败', data)
      showToast(`听歌上报失败(code=${data.code})`, 'netease')
      return false
    }
  } catch (e) {
    logError('网易云听歌上报异常', e)
    showToast('听歌上报异常', 'netease')
    return false
  }
}

/**
 * 开始播放上报（写入最近播放列表）
 * 在歌曲开始播放时调用
 *
 * @param trackId - 歌曲 ID
 * @param sourceId - 来源歌单 ID（可选，默认 0）
 */
export async function scrobbleStart(trackId, sourceId = 0) {
  try {
    if (!isNeteaseLoggedIn()) {
      logInfo('网易云未登录，跳过startplay上报')
      return
    }

    // 记录当前播放信息
    currentTrackInfo = {
      trackId,
      sourceId,
      startTime: Date.now(),
      playedSeconds: 0,
    }

    logInfo('准备发送startplay上报', { trackId, sourceId })

    // 发送 startplay weblog
    const result = await sendWeblog([
      {
        action: 'startplay',
        json: {
          id: trackId,
          type: 'song',
          mainsite: '1',
          mainsiteWeb: '1',
          content: `id=${sourceId}`,
        },
      },
    ])

    if (result) {
      logInfo('开始播放上报成功', { trackId, sourceId })
    } else {
      logError('开始播放上报失败', { trackId, sourceId })
    }
  } catch (e) {
    logError('开始播放上报异常', e)
  }
}

/**
 * 播放完成上报（增加听歌排行次数和时长）
 * 在歌曲播放完成或切换歌曲时调用
 *
 * @param trackId - 歌曲 ID
 * @param sourceId - 来源歌单 ID
 * @param seconds - 实际播放秒数
 */
export async function scrobbleFinish(trackId, sourceId = 0, seconds) {
  try {
    if (!isNeteaseLoggedIn()) {
      logInfo('网易云未登录，跳过play上报')
      return
    }

    // 计算实际播放时长
    let playSeconds = seconds
    if (playSeconds === undefined && currentTrackInfo && currentTrackInfo.trackId === trackId) {
      playSeconds = Math.floor((Date.now() - currentTrackInfo.startTime) / 1000)
    }
    if (playSeconds === undefined || playSeconds < 0) {
      playSeconds = 0
    }

    logInfo('准备发送play上报', { trackId, sourceId, seconds: playSeconds })

    // 发送 play weblog
    const result = await sendWeblog([
      {
        action: 'play',
        json: {
          download: 0,
          end: 'playend',
          id: trackId,
          sourceId: String(sourceId),
          time: playSeconds,
          type: 'song',
          wifi: 0,
          source: 'list',
          mainsite: '1',
          mainsiteWeb: '1',
          content: `id=${sourceId}`,
        },
      },
    ])

    if (result) {
      logInfo('播放完成上报成功', { trackId, sourceId, seconds: playSeconds })
    } else {
      logError('播放完成上报失败', { trackId, sourceId, seconds: playSeconds })
    }

    // 清除当前播放信息
    if (currentTrackInfo && currentTrackInfo.trackId === trackId) {
      currentTrackInfo = null
    }
  } catch (e) {
    logError('播放完成上报异常', e)
  }
}

/**
 * 切换歌曲时调用：先完成上一首的上报，再开始下一首的上报
 *
 * @param newTrackId - 新歌曲 ID
 * @param newSourceId - 新来源歌单 ID
 * @param oldTrackId - 上一首歌曲 ID（可选）
 * @param oldSourceId - 上一首来源歌单 ID（可选）
 */
export async function scrobbleSwitch(newTrackId, newSourceId = 0, oldTrackId, oldSourceId = 0) {
  try {
    // 先完成上一首的上报
    if (oldTrackId !== undefined) {
      await scrobbleFinish(oldTrackId, oldSourceId)
    } else if (currentTrackInfo) {
      await scrobbleFinish(currentTrackInfo.trackId, currentTrackInfo.sourceId)
    }

    // 再开始下一首的上报
    await scrobbleStart(newTrackId, newSourceId)
  } catch (e) {
    logError('切换歌曲上报失败', e)
  }
}

/**
 * 获取听歌排行数据
 *
 * @param uid - 用户 ID
 * @param week - true=本周排行, false=所有排行
 * @returns 排行数据
 */
export async function getPlayRecords(uid, week = true) {
  try {
    const cookie = getNeteaseCookie()
    if (!cookie) return []

    const body = eapiBody('/api/v1/play/record', {
      uid,
      type: week ? 1 : 0,
      header: buildEapiHeader(cookie),
    })

    // eapi 接口必须走 interface.music.163.com
    const response = await fetch('https://interface.music.163.com/eapi/v1/play/record', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Cookie': cookie,
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://music.163.com/',
      },
      body,
    })

    const data = await response.json()
    if (data.code === 200) {
      return week ? (data.weekData || []) : (data.allData || [])
    }
    return []
  } catch (e) {
    logError('获取听歌排行失败', e)
    return []
  }
}

export default {
  scrobbleStart,
  scrobbleFinish,
  scrobbleSwitch,
  getPlayRecords,
  isNeteaseLoggedIn,
}
