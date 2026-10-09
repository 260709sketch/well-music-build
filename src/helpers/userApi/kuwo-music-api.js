'use strict'
Object.defineProperty(exports, '__esModule', { value: true })

const pageSize = 30

const headers = {
  'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
  'Accept': 'application/json',
}

// 酷我 web 反爬：Secret 头（由 Hm_Iuvt cookie 值与固定 cookie 名计算；cookie 值可本地随机生成）
const KUWO_HM_COOKIE = 'Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324'
function kuwoRandCookie() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length))
  return out
}
function kuwoGetSecret(t, e = KUWO_HM_COOKIE) {
  let n = ''
  for (let i = 0; i < e.length; i++) n += e.charCodeAt(i).toString()
  const o = Math.floor(n.length / 5)
  const r = parseInt(n.charAt(o) + n.charAt(2 * o) + n.charAt(3 * o) + n.charAt(4 * o) + n.charAt(5 * o))
  const c = Math.ceil(e.length / 2)
  const l = Math.pow(2, 31) - 1
  if (r < 2) return ''
  let d = Math.round(1e9 * Math.random()) % 1e8
  n += d
  while (n.length > 10) n = (parseInt(n.substring(0, 10)) + parseInt(n.substring(10, n.length))).toString()
  n = (r * n + c) % l
  let sf = 0
  let h = ''
  for (let i = 0; i < t.length; i++) {
    sf = parseInt(t.charCodeAt(i) ^ Math.floor((n / l) * 255))
    h += sf < 16 ? '0' + sf.toString(16) : sf.toString(16)
    n = (r * n + c) % l
  }
  let ds = d.toString(16)
  while (ds.length < 8) ds = '0' + ds
  return h + ds
}

// 酷我搜索API返回单引号字典格式，需要转成JSON
function parseKuwoResponse(text) {
  try {
    return JSON.parse(text)
  } catch (e) {
    // 单引号字典 -> JSON
    const jsonText = text.replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false')
    return JSON.parse(jsonText)
  }
}

// 去除HTML实体
function cleanHtml(str) {
  if (!str) return ''
  return String(str)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\\u0026/g, '&')
    .trim()
}

// 格式化酷我音乐歌曲信息（兼容LX-Y Music返回格式）
function formatMusicItem(_) {
  // 歌曲ID: MUSICRID 格式 "MUSIC_123456" 或 DC_TARGETID 或 rid
  let songId = ''
  if (_.MUSICRID) {
    songId = String(_.MUSICRID).replace('MUSIC_', '')
  } else {
    songId = _.DC_TARGETID || _.rid || _.musicrid || _.id || ''
  }

  const artistName = cleanHtml(_.ARTIST || _.AARTIST || _.artist || _.artistName || '未知歌手')
  const albumName = cleanHtml(_.ALBUM || _.album || _.albumName || '未知专辑')
  const songName = cleanHtml(_.SONGNAME || _.NAME || _.name || _.songName || _.title || '未知歌曲')

  // 封面: web_albumpic_short 格式 "120/xxx.jpg" -> 拼接完整URL 500x500
  let artwork = ''
  if (_.web_albumpic_short) {
    artwork = 'https://img1.kuwo.cn/star/albumcover/' + String(_.web_albumpic_short).replace('120/', '500/')
  } else if (_.PICPATH) {
    artwork = 'https://img1.kuwo.cn/star/albumcover/500/' + String(_.PICPATH).replace(/^\d+\//, '')
  } else if (_.hts_PICPATH) {
    artwork = _.hts_PICPATH
  } else if (_.albumpic) {
    artwork = _.albumpic
  } else if (songId) {
    artwork = `https://img1.kuwo.cn/star/albumcover/500/${songId}.jpg`
  }

  // 解析音质信息 N_MINFO: "level:xxx,bitrate:xxx,format:xxx,size:xxx;..."
  const types = []
  if (_.N_MINFO) {
    const infoArr = String(_.N_MINFO).split(';')
    for (const info of infoArr) {
      const m = info.match(/level:(\w+),bitrate:(\d+),format:(\w+),size:([\w.]+)/)
      if (m) {
        const size = m[4] ? m[4].toUpperCase() : null
        switch (m[3]) {
          case '20900': types.push({ type: 'master', size }); break
          case '20501': types.push({ type: 'atmos_plus', size }); break
          case '20201': types.push({ type: 'atmos', size }); break
          case '4000': types.push({ type: 'hires', size }); break
          case '2000': types.push({ type: 'flac', size }); break
          case '320': types.push({ type: '320k', size }); break
          case '128': types.push({ type: '128k', size }); break
        }
      }
    }
    types.reverse()
  }

  return {
    id: songId,
    rid: songId,
    songmid: `kuwo_${songId}`,
    platform: 'kuwo',
    source: 'kuwo',
    title: songName,
    artist: artistName,
    artwork: artwork,
    album: albumName,
    albumid: _.ALBUMID || _.albumid || _.albumId,
    duration: parseInt(_.DURATION || _.duration || _.songTimeMinutes || 0),
    url: 'Unknown',
    types: types,
  }
}

// 格式化酷我专辑信息
function formatAlbumItem(_) {
  const albumId = _.albumid || _.ALBUMID || _.albumId || _.id || _.DC_TARGETID || ''
  const albumName = cleanHtml(_.name || _.albumname || _.album || _.ALBUM || _.album_name || _.title || '未知专辑')
  const artistName = cleanHtml(_.artist || _.ARTIST || _.AARTIST || _.artistName || '')

  let artwork = ''
  if (_.hts_img) {
    artwork = _.hts_img
  } else if (_.pic) {
    if (String(_.pic).indexOf('http') === 0) {
      artwork = String(_.pic).replace('/albumcover/300/', '/albumcover/500/').replace('/albumcover/120/', '/albumcover/500/')
    } else {
      artwork = 'https://img1.kuwo.cn/star/albumcover/500/' + String(_.pic).replace(/^\d+\//, '')
    }
  } else if (_.web_albumpic_short) {
    artwork = 'https://img1.kuwo.cn/star/albumcover/' + String(_.web_albumpic_short).replace('120/', '500/')
  } else if (_.PICPATH) {
    artwork = 'https://img1.kuwo.cn/star/albumcover/500/' + String(_.PICPATH).replace(/^\d+\//, '')
  }

  return {
    id: albumId,
    albumMid: `kuwo_album_${albumId}::${encodeURIComponent(albumName)}`,
    title: albumName,
    artwork: artwork,
    date: _.releaseDate || _.pub || _.showtime || _.publishtime || _.pub_time || '',
    artist: artistName,
    artistId: _.artistid || _.ARTISTID || _.artistId || '',
    songCount: parseInt(_.musiccnt || _.songcount || 0),
    platform: 'kuwo',
    source: 'kuwo',
  }
}

// 格式化酷我歌手信息
function formatArtistItem(_) {
  const artistId = _.ARTISTID || _.DC_TARGETID || _.artistid || _.id || _.rid || ''
  const artistName = cleanHtml(_.ARTIST || _.AARTIST || _.name || _.artistName || _.artist || '未知歌手')

  let artwork = ''
  if (_.hts_PICPATH) {
    artwork = _.hts_PICPATH
  } else if (_.PICPATH) {
    artwork = 'https://img1.kuwo.cn/star/starheads/400/' + String(_.PICPATH).replace(/^\d+\//, '')
  }

  return {
    id: artistId,
    singerMid: `kuwo_${artistId}::${encodeURIComponent(artistName)}`,
    title: artistName,
    artist: artistName,
    artwork: artwork,
    worksNum: parseInt(_.SONGNUM || _.songcount || _.song_num || 0),
    platform: 'kuwo',
    source: 'kuwo',
  }
}

// LX-Y Music同款搜索API（伪装安卓9.2.2.1客户端，返回新歌）
async function searchKuwoMusic(keyword, page = 1, limit = pageSize) {
  try {
    const url = `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
    const response = await fetch(url, { headers })
    const text = await response.text()
    const data = parseKuwoResponse(text)

    if (data && data.abslist) {
      const list = data.abslist.map(formatMusicItem)
      return {
        data: list,
        hasMore: data.abslist.length >= limit,
        total: parseInt(data.TOTAL || data.total || 0),
      }
    }
    return { data: [], hasMore: false, total: 0 }
  } catch (error) {
    console.error('酷我搜索歌曲失败:', error)
    return { data: [], hasMore: false, total: 0 }
  }
}

// 搜索歌手
async function searchKuwoArtist(keyword, page = 1, limit = pageSize) {
  try {
    const url = `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(keyword)}&pn=${page - 1}&rn=${limit}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=artist&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
    const response = await fetch(url, { headers })
    const text = await response.text()
    const data = parseKuwoResponse(text)

    if (data && data.abslist) {
      const list = data.abslist.map(formatArtistItem)
      return {
        data: list,
        hasMore: data.abslist.length >= limit,
        total: parseInt(data.TOTAL || data.total || 0),
      }
    }
    return { data: [], hasMore: false, total: 0 }
  } catch (error) {
    console.error('酷我搜索歌手失败:', error)
    return { data: [], hasMore: false, total: 0 }
  }
}

// 搜索专辑（新版 web 接口 searchAlbumBykeyWord + Secret 反爬，替代已失效的 r.s?ft=album）
async function searchKuwoAlbum(keyword, page = 1, limit = pageSize) {
  try {
    const ck = kuwoRandCookie()
    const secret = kuwoGetSecret(ck)
    const url = `https://www.kuwo.cn/api/www/search/searchAlbumBykeyWord?key=${encodeURIComponent(keyword)}&pn=${page}&rn=${limit}&httpsStatus=1`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)
    let data
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': headers['User-Agent'],
          'Accept': 'application/json, text/plain, */*',
          'Referer': 'https://www.kuwo.cn/',
          'Secret': secret,
          'Cookie': `${KUWO_HM_COOKIE}=${ck}`,
        },
        signal: controller.signal,
      })
      data = await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
    const albumList = (data && data.data && data.data.albumList) || []
    if (albumList.length > 0) {
      return {
        data: albumList.map(formatAlbumItem),
        hasMore: albumList.length >= limit,
        total: parseInt((data.data && data.data.total) || 0),
      }
    }
    return { data: [], hasMore: false, total: 0 }
  } catch (error) {
    console.error('酷我搜索专辑失败:', error)
    return { data: [], hasMore: false, total: 0 }
  }
}
// 解析 kuwo_ 格式的 singerMid: kuwo_${artistId}::${singerName}
function parseKuwoSingerMid(singerMid) {
  const raw = String(singerMid).replace('kuwo_', '')
  const parts = raw.split('::')
  return {
    artistId: parts[0],
    singerName: parts[1] ? decodeURIComponent(parts[1]) : '',
  }
}

// 解析 kuwo_album_ 格式: kuwo_album_${albumId}::${albumName}
function parseKuwoAlbumMid(albumMid) {
  const raw = String(albumMid).replace('kuwo_album_', '').replace('kuwo_', '')
  const parts = raw.split('::')
  return {
    albumId: parts[0],
    albumName: parts[1] ? decodeURIComponent(parts[1]) : '',
  }
}

// 获取歌手详情（用搜索API模拟）
async function getKuwoSingerDetail(singerMid) {
  try {
    const { artistId, singerName } = parseKuwoSingerMid(singerMid)
    if (!singerName) return null

    const url = `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(singerName)}&pn=0&rn=50&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
    const response = await fetch(url, { headers })
    const text = await response.text()
    const data = parseKuwoResponse(text)

    const songList = (data && data.abslist) ? data.abslist.map(formatMusicItem) : []

    // 头像
    let singerImg = ''
    try {
      const artistUrl = `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(singerName)}&pn=0&rn=1&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=artist&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
      const artistResp = await fetch(artistUrl, { headers })
      const artistText = await artistResp.text()
      const artistData = parseKuwoResponse(artistText)
      if (artistData && artistData.abslist && artistData.abslist.length > 0) {
        const a = artistData.abslist[0]
        if (a.hts_PICPATH) {
          singerImg = a.hts_PICPATH
        } else if (a.PICPATH) {
          singerImg = 'https://img1.kuwo.cn/star/starheads/400/' + String(a.PICPATH).replace(/^\d+\//, '')
        }
      }
    } catch (e) {
      console.error('酷我获取歌手头像失败:', e)
    }

    // 平台真实歌曲总数/专辑总数（artistMusic / artistAlbum 接口）
    let musicSize = 0
    let albumSize = 0
    if (artistId) {
      try {
        const ck1 = kuwoRandCookie()
        const sec1 = kuwoGetSecret(ck1)
        const songCntUrl = `https://www.kuwo.cn/api/www/artist/artistMusic?artistid=${artistId}&pn=1&rn=1&httpsStatus=1`
        const songCntRes = await fetch(songCntUrl, {
          headers: { 'User-Agent': headers['User-Agent'], 'Accept': 'application/json, text/plain, */*',
            'Referer': `https://www.kuwo.cn/singer_detail/${artistId}`, 'Secret': sec1, 'Cookie': `${KUWO_HM_COOKIE}=${ck1}` },
        })
        const songCntData = await songCntRes.json()
        musicSize = (songCntData.data && songCntData.data.total) || 0

        const ck2 = kuwoRandCookie()
        const sec2 = kuwoGetSecret(ck2)
        const albCntUrl = `https://www.kuwo.cn/api/www/artist/artistAlbum?artistid=${artistId}&pn=1&rn=1&httpsStatus=1`
        const albCntRes = await fetch(albCntUrl, {
          headers: { 'User-Agent': headers['User-Agent'], 'Accept': 'application/json, text/plain, */*',
            'Referer': `https://www.kuwo.cn/singer_detail/${artistId}`, 'Secret': sec2, 'Cookie': `${KUWO_HM_COOKIE}=${ck2}` },
        })
        const albCntData = await albCntRes.json()
        albumSize = (albCntData.data && albCntData.data.total) || 0
      } catch (e) {
        console.error('酷我获取歌曲/专辑总数失败:', e)
      }
    }

    return {
      singerImg: singerImg,
      title: singerName,
      id: `kuwo_${artistId}`,
      musicList: songList,
      musicSize: musicSize,
      albumSize: albumSize,
    }
  } catch (error) {
    console.error('酷我获取歌手详情失败:', error)
    return null
  }
}

// 获取歌手歌曲分页（展开全部懒加载用，artistMusic 接口）
async function getKuwoSingerSongs(singerMid, offset = 0, limit = 30) {
  try {
    const { artistId } = parseKuwoSingerMid(singerMid)
    if (!artistId) return { list: [], total: 0 }
    const rn = limit || 30
    const pn = Math.floor((offset || 0) / rn) + 1
    const ck = kuwoRandCookie()
    const secret = kuwoGetSecret(ck)
    const url = `https://www.kuwo.cn/api/www/artist/artistMusic?artistid=${artistId}&pn=${pn}&rn=${rn}&httpsStatus=1`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)
    let data
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': headers['User-Agent'],
          'Accept': 'application/json, text/plain, */*',
          'Referer': `https://www.kuwo.cn/singer_detail/${artistId}`,
          'Secret': secret,
          'Cookie': `${KUWO_HM_COOKIE}=${ck}`,
        },
        signal: controller.signal,
      })
      data = await response.json()
    } finally {
      clearTimeout(timeoutId)
    }
    const list = (data && data.data && data.data.list) ? data.data.list.map(formatMusicItem) : []
    return { list, total: (data && data.data && data.data.total) || 0 }
  } catch (error) {
    console.error('酷我获取歌手歌曲分页失败:', error)
    return { list: [], total: 0 }
  }
}

// 获取歌手专辑列表（新版 web artistAlbum + Secret，分页；offset 从 0 开始）
async function getKuwoSingerAlbums(singerMid, offset = 0, limit = 30) {
  try {
    const { artistId, singerName } = parseKuwoSingerMid(singerMid)
    if (!artistId) return []

    const ck = kuwoRandCookie()
    const secret = kuwoGetSecret(ck)
    const rn = limit || 30
    const pn = Math.floor((offset || 0) / rn) + 1
    const url = `https://www.kuwo.cn/api/www/artist/artistAlbum?artistid=${artistId}&pn=${pn}&rn=${rn}&httpsStatus=1`
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000)
    let data
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent': headers['User-Agent'],
          'Accept': 'application/json, text/plain, */*',
          'Referer': `https://www.kuwo.cn/singer_detail/${artistId}`,
          'Secret': secret,
          'Cookie': `${KUWO_HM_COOKIE}=${ck}`,
        },
        signal: controller.signal,
      })
      data = await response.json()
    } finally {
      clearTimeout(timeoutId)
    }

    const albumList = (data && data.data && data.data.albumList) || []
    return albumList.map((_) => {
      const id = _.albumid || _.id || ''
      const name = cleanHtml(_.album || _.name || '')
      let artwork = ''
      if (_.pic) {
        artwork = String(_.pic).indexOf('http') === 0
          ? String(_.pic).replace('/albumcover/300/', '/albumcover/500/').replace('/albumcover/120/', '/albumcover/500/')
          : 'https://img1.kuwo.cn/star/albumcover/500/' + String(_.pic).replace(/^\d+\//, '')
      }
      let subType = '专辑'
      if (/single|单曲/i.test(name)) subType = '单曲'
      else if (/(^|[^a-z])EP([^a-z]|$)/i.test(name)) subType = 'EP'
      return {
        album_mid: `kuwo_album_${id}::${encodeURIComponent(name)}`,
        album_name: name,
        singer_mid: singerMid,
        singer_name: singerName || cleanHtml(_.artist || ''),
        artwork,
        public_time: _.releaseDate || '',
        songCount: 0,
        subType,
      }
    })
  } catch (error) {
    console.error('酷我获取歌手专辑失败:', error)
    return []
  }
}
// 获取专辑歌曲列表
async function getKuwoAlbumSongs(albumMid) {
  try {
    const { albumId, albumName } = parseKuwoAlbumMid(albumMid)
    if (!albumName) return { singerImg: '', title: '未知专辑', id: albumId, musicList: [] }

    const url = `http://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(albumName)}&pn=0&rn=100&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
    const response = await fetch(url, { headers })
    const text = await response.text()
    const data = parseKuwoResponse(text)

    const songList = (data && data.abslist) ? data.abslist.map(formatMusicItem) : []

    let albumCover = ''
    if (songList.length > 0 && songList[0].artwork) {
      albumCover = songList[0].artwork
    }

    return {
      singerImg: albumCover,
      title: albumName,
      id: albumId,
      musicList: songList,
    }
  } catch (error) {
    console.error('酷我获取专辑歌曲失败:', error)
    return { singerImg: '', title: '未知专辑', id: albumMid, musicList: [] }
  }
}

// 获取歌曲播放地址
async function getKuwoSongUrl(rid) {
  try {
    const url = `https://www.kuwo.cn/api/v1/www/music/playUrl?mid=${rid}&type=music&httpsStatus=1`
    const response = await fetch(url, { headers })
    const data = await response.json()

    if (data && data.code === 200 && data.data && data.data.url) {
      return {
        url: data.data.url,
      }
    }
    return null
  } catch (error) {
    console.error('酷我获取播放地址失败:', error)
    return null
  }
}

exports.searchKuwoMusic = searchKuwoMusic
exports.searchKuwoArtist = searchKuwoArtist
exports.searchKuwoAlbum = searchKuwoAlbum
exports.getKuwoSongUrl = getKuwoSongUrl
exports.formatMusicItem = formatMusicItem
exports.getKuwoSingerDetail = getKuwoSingerDetail
exports.getKuwoSingerAlbums = getKuwoSingerAlbums
exports.getKuwoSingerSongs = getKuwoSingerSongs
exports.getKuwoAlbumSongs = getKuwoAlbumSongs
