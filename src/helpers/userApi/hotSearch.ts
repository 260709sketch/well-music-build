// 各平台热搜词获取
// 网易云 / QQ音乐 / 酷狗 / 酷我

export interface HotSearchItem {
  word: string
  score?: number
}

// 网易云热搜
export async function getNeteaseHotSearch(): Promise<string[]> {
  try {
    const res = await fetch('https://music.163.com/api/search/hot/detail', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        Referer: 'https://music.163.com/',
      },
    })
    const json = await res.json()
    if (json?.code === 200 && Array.isArray(json.data)) {
      return json.data.slice(0, 12).map((item: any) => item.searchWord || item.word || '')
    }
    return []
  } catch (e) {
    console.warn('[hotSearch] 网易云热搜获取失败', e)
    return []
  }
}

// QQ音乐热搜
export async function getQQHotSearch(): Promise<string[]> {
  try {
    const body = {
      comm: { ct: '19', cv: '1803', guid: '0', uin: '0', tmeAppID: 'qqmusic' },
      hotkey: {
        method: 'GetHotkeyForQQMusicPC',
        module: 'tencent_musicsoso_hotkey.HotkeyService',
        param: { search_id: '', uin: 0 },
      },
    }
    const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Referer: 'https://y.qq.com/',
      },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    const vec = json?.hotkey?.data?.vec_hotkey
    if (Array.isArray(vec)) {
      return vec.slice(0, 12).map((item: any) => item.query || '')
    }
    return []
  } catch (e) {
    console.warn('[hotSearch] QQ音乐热搜获取失败', e)
    return []
  }
}

// 酷狗热搜
export async function getKugouHotSearch(): Promise<string[]> {
  try {
    const res = await fetch('https://searchtips.kugou.com/api/v3/search/hot?plat=0&count=12', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      },
    })
    const json = await res.json()
    if (json?.status === 1 && Array.isArray(json.data?.info)) {
      return json.data.info.slice(0, 12).map((item: any) => item.word || item.keyword || '')
    }
    return []
  } catch (e) {
    console.warn('[hotSearch] 酷狗热搜获取失败', e)
    return []
  }
}

// 酷我热搜
export async function getKuwoHotSearch(): Promise<string[]> {
  try {
    const res = await fetch('https://www.kuwo.cn/api/www/search/hotSearchList?key=kw', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
        Referer: 'https://www.kuwo.cn/',
        csrf: 'kw',
      },
    })
    const json = await res.json()
    const list = json?.data?.list || json?.data?.hotList || json?.data
    if (Array.isArray(list)) {
      return list.slice(0, 12).map((item: any) => item.name || item.word || item.keyword || '')
    }
    return []
  } catch (e) {
    console.warn('[hotSearch] 酷我热搜获取失败', e)
    return []
  }
}

// 根据平台ID获取热搜
export async function getHotSearchByPlatform(platform: string): Promise<string[]> {
  switch (platform) {
    case 'netease':
    case 'wy':
      return getNeteaseHotSearch()
    case 'qq':
    case 'tx':
      return getQQHotSearch()
    case 'kugou':
    case 'kg':
      return getKugouHotSearch()
    case 'kuwo':
    case 'kw':
      return getKuwoHotSearch()
    default:
      return []
  }
}
