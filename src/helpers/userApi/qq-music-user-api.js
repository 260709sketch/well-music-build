// QQ 音乐用户相关 API
// 完全参考 LX-Y-Music-IOS 的 tx/user.ts 实现

const QQ_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * 从 QQ 音乐 Cookie 中提取 uin
 * 参考 LX extractUin：支持 QQ 登录(uin=xxx)、微信登录(wxUin=xxx)、euin 回退
 */
export function extractQRdUin(cookie) {
  if (!cookie) return null
  // QQ 登录: uin=xxx (纯数字或 o 开头)
  const uinMatch = cookie.match(/(?:^|;)\s*uin=(\d+|o[A-Za-z0-9_-]+)/)
  if (uinMatch) return uinMatch[1]
  // 微信登录: wxUin=xxx or wxuin=xxx
  const wxUinMatch = cookie.match(/(?:^|;)\s*(?:wxUin|wxuin)=(\d+|[A-Za-z0-9_-]+)/i)
  if (wxUinMatch) return wxUinMatch[1]
  // euin 回退
  const fakeUinMatch = cookie.match(/euin=([A-Za-z0-9_*]+)/)
  if (fakeUinMatch) {
    const realUinMatch = cookie.match(/(?:^|;)\s*uin=(\d+)/)
    if (realUinMatch) return realUinMatch[1]
    return fakeUinMatch[1]
  }
  console.log('[QQ] 无法从 Cookie 提取 uin')
  return null
}

/**
 * 获取 QQ 音乐用户信息
 * 参考 LX getUserInfo：POST + form body，返回 body.data.nick / body.data.avatarUrl
 */
export async function getQQUserInfo(cookie) {
  try {
    if (!cookie) {
      console.log('[QQ] 未设置 Cookie')
      return null
    }
    const uin = extractQRdUin(cookie)
    if (!uin) {
      console.log('[QQ] Cookie 中未找到 uin')
      return null
    }
    // LX 实现：POST + form body
    const bodyData = `cid=205360838&userid=${uin}&reqfrom=1`
    const res = await fetch('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg', {
      method: 'POST',
      headers: {
        'User-Agent': QQ_UA,
        Referer: 'https://y.qq.com/',
        Cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyData,
    })
    const data = await res.json()
    console.log('[QQ] user info response code:', data?.code, 'hasData:', !!data?.data)

    if (data.code === 1000) {
      console.log('[QQ] Cookie 已过期')
      return null
    }
    if (data.code !== 0 && data.code !== 200) {
      console.log('[QQ] 获取用户信息失败, code:', data.code)
      return null
    }

    const nickname = data.data?.nick || data.data?.name || 'QQ音乐用户'
    const avatar = data.data?.avatarUrl || data.data?.avatar || ''
    return { uin, nickname, avatar }
  } catch (error) {
    console.error('[QQ] 获取用户信息异常:', error)
    return null
  }
}

/**
 * 获取 QQ 音乐关注歌手列表
 * 注意：LX 的 tx/user.ts 中没有关注歌手 API，这里用通用接口尝试
 */
export async function getQQFollowedSingers(cookie, limit = 30, offset = 0) {
  try {
    const uin = extractQRdUin(cookie)
    if (!uin) return []
    // QQ音乐关注歌手接口（尝试）
    const bodyData = `cid=205360838&userid=${uin}&reqfrom=1&offset=${offset}&limit=${limit}`
    const res = await fetch('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_follow_singer_list.fcg', {
      method: 'POST',
      headers: {
        'User-Agent': QQ_UA,
        Referer: 'https://y.qq.com/',
        Cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: bodyData,
    })
    const data = await res.json()
    if (data.code !== 0 && data.code !== 200) return []
    const singers = data?.data?.singerList || data?.data?.list || []
    return singers.map((s) => ({
      id: `qq_${s.singer_mid || s.mid || s.singerid || s.id}`,
      singerMid: s.singer_mid || s.mid || '',
      name: s.singer_name || s.name || '',
      avatar: s.singer_pic || s.pic || `https://y.gtimg.cn/music/photo_new/T001R300x300M000${s.singer_mid || s.mid}.jpg`,
      platform: 'qq',
    }))
  } catch (error) {
    console.error('[QQ] 获取关注歌手异常:', error)
    return []
  }
}

export async function getAllQQFollowedSingers(cookie) {
  let all = []
  let offset = 0
  const limit = 30
  while (true) {
    const batch = await getQQFollowedSingers(cookie, limit, offset)
    all = all.concat(batch)
    if (batch.length < limit) break
    offset += limit
    if (all.length >= 200) break
    await new Promise((r) => setTimeout(r, 150))
  }
  return all
}

export default {
  extractQRdUin,
  getQQUserInfo,
  getQQFollowedSingers,
  getAllQQFollowedSingers,
}
