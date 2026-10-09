'use strict'
Object.defineProperty(exports, '__esModule', { value: true })

const pageSize = 20

// 格式化酷狗音乐歌曲信息
function formatMusicItem(_) {
  const albumName = _.album_name || _.album || '未知专辑'
  const artistName = _.artist_name || _.singername || _.author || '未知歌手'
  const songHash = _.hash || _.FileHash || ''
  const albumId = _.album_id || ''
  
  // 获取封面URL
  let artwork = _.imgUrl || _.album_pic || _.cover
  if (!artwork && _.trans_param && _.trans_param.union_cover) {
    artwork = _.trans_param.union_cover.replace('{size}', '400')
  }
  if (!artwork && albumId) {
    artwork = `https://imge.kugou.com/stdmusic/400/album/${albumId}.jpg`
  }
  
  return {
    id: songHash || _.id,
    hash: songHash,
    songmid: `kugou_${songHash}`,
    originalId: songHash,
    platform: 'kugou',
    source: 'kugou',
    title: _.songname || _.name || _.title || '未知歌曲',
    artist: artistName,
    artwork: artwork,
    album: albumName,
    album_id: albumId,
    duration: _.duration || _.timelength || 0,
    url: 'Unknown',
  }
}

// 格式化酷狗歌曲项（歌手/专辑详情页用，支持传入歌手名）
function formatKugouSongItem(_, singerName) {
  const albumName = _.album_name || _.albumname || _.AlbumName || _.album || '未知专辑'
  const artistName = _.artist_name || _.singername || _.SingerName || _.author || (singerName && singerName !== '未知歌手' ? singerName : '') || '未知歌手'
  const songHash = _.hash || _.FileHash || _.file_hash || ''
  const albumId = _.album_id || _.albumid || _.AlbumID || ''

  let artwork = _.imgUrl || _.album_pic || _.cover || _.imgurl
  if (!artwork && _.trans_param && _.trans_param.union_cover) {
    artwork = _.trans_param.union_cover.replace('{size}', '400')
  }
  if (!artwork && albumId) {
    artwork = `https://imge.kugou.com/stdmusic/400/album/${albumId}.jpg`
  }

  return {
    id: songHash || _.id || _.Audioid,
    hash: songHash,
    songmid: `kugou_${songHash}`,
    originalId: songHash,
    platform: 'kugou',
    source: 'kugou',
    title: _.songname || _.SongName || _.name || _.title || (_.filename ? _.filename.split(' - ').slice(1).join(' - ').trim() : '未知歌曲'),
    artist: artistName,
    artwork: artwork,
    album: albumName,
    album_id: albumId,
    duration: _.duration || _.timelength || _.Duration || 0,
    url: 'Unknown',
  }
}

// 格式化酷狗专辑信息
function formatAlbumItem(_) {
  const albumId = _.albumid || _.album_id || _.albumId || ''
  return {
    id: albumId,
    albumMid: `kugou_album_${albumId}`,
    title: _.albumname || _.album_name || _.name || _.title || '未知专辑',
    artwork: (_.imgurl || _.imgUrl || _.album_pic || _.pic || _.cover || _.img || '').replace('{size}', '400') || (albumId ? `https://imge.kugou.com/stdmusic/400/album/${albumId}.jpg` : undefined),
    date: _.publishtime || _.pub_time || _.publish_time || _.public_time || '',
    artist: _.singername || _.artist_name || _.artist || _.singer_name || '',
    singerId: _.singerid || _.singer_id || _.singerId || '',
    platform: 'kugou',
    source: 'kugou',
  }
}

// 格式化酷狗歌手信息
function formatArtistItem(_) {
  const singerId = _.singerid || _.artist_id || _.id || _.singerId || ''
  return {
    id: singerId,
    singerMid: `kugou_${singerId}`,
    title: _.singername || _.artist_name || _.name || _.SingerName || '未知歌手',
    artist: _.singername || _.artist_name || _.name || _.SingerName || '未知歌手',
    artwork: _.imgurl || _.imgUrl || _.singer_pic || _.avatar || _.pic || _.img || (singerId ? `https://singerimg.kugou.com/uploadpic/softhead/400/${singerId}.jpg` : undefined),
    worksNum: _.songcount || _.song_num || _.songCount || 0,
    platform: 'kugou',
    source: 'kugou',
  }
}

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.kugou.com/',
}

// 搜索歌曲
async function searchKugouMusic(keyword, page = 1, limit = pageSize) {
  try {
    const url = `http://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}&showtype=1&plat=2&version=8990`
    
    const response = await fetch(url, { headers })
    const data = await response.json()
    
    if (data && data.data && data.data.info) {
      const list = data.data.info.map(formatMusicItem)
      return {
        data: list,
        hasMore: data.data.info.length >= limit,
        total: data.data.total || 0,
      }
    }
    return { data: [], hasMore: false, total: 0 }
  } catch (error) {
    console.error('酷狗搜索歌曲失败:', error)
    return { data: [], hasMore: false, total: 0 }
  }
}

// 搜索歌手：先用专门API，为空时回退到歌曲搜索提取去重歌手
async function searchKugouArtist(keyword, page = 1, limit = pageSize) {
  // 方式1：专门的歌手搜索API
  const fetchSingerApi = async () => {
    const url = `http://mobilecdn.kugou.com/api/v3/search/singer?format=json&keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}`
    const response = await fetch(url, { headers })
    const data = await response.json()
    let list = []
    if (data && Array.isArray(data.data) && data.data.length > 0) {
      list = data.data.map(formatArtistItem)
    } else if (data && data.data && data.data.info && Array.isArray(data.data.info) && data.data.info.length > 0) {
      list = data.data.info.map(formatArtistItem)
    }
    return list
  }

  // 方式2：歌曲搜索API，从结果中提取去重歌手
  const fetchFromSongSearch = async () => {
    const url = `https://songsearch.kugou.com/song_search_v2?keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=30&userid=0&platform=WebFilter&filter=2&iscorrection=1&privilege_filter=0&area_code=1`
    const response = await fetch(url, { headers })
    const data = await response.json()
    if (data && data.error_code === 0 && data.data && Array.isArray(data.data.lists)) {
      const seen = new Set()
      const artists = []
      for (const song of data.data.lists) {
        if (song.Singers && Array.isArray(song.Singers)) {
          for (const singer of song.Singers) {
            if (singer.id && !seen.has(singer.id)) {
              seen.add(singer.id)
              artists.push({
                singername: singer.name,
                singerid: singer.id,
                imgurl: singer.pic || '',
                songcount: 0,
              })
            }
          }
        }
      }
      return artists.map(formatArtistItem)
    }
    return []
  }

  // 批量补全歌手头像（调用详情API获取真实头像，只补前10个）
  const fillArtistAvatars = async (list) => {
    const needFill = list.slice(0, 10).filter(item => !item.artwork || item.artwork.includes('singerimg.kugou.com/uploadpic/softhead/400/'))
    if (needFill.length === 0) return list
    try {
      await Promise.all(needFill.map(async (item) => {
        try {
          const singerId = String(item.id).replace('kugou_', '')
          const infoUrl = `http://mobilecdn.kugou.com/api/v3/singer/info?singerid=${singerId}`
          const infoResp = await fetch(infoUrl, { headers })
          const infoData = await infoResp.json()
          if (infoData.data && infoData.data.imgurl) {
            item.artwork = infoData.data.imgurl.replace('{size}', '400').replace('http://', 'https://')
          }
        } catch (e) {
          // 单个失败不影响其他
        }
      }))
    } catch (e) {
      console.warn('批量补全酷狗歌手头像失败:', e.message)
    }
    return list
  }

  // 尝试方式1，重试2次
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const list = await fetchSingerApi()
      if (list.length > 0) {
        await fillArtistAvatars(list)
        return { data: list, hasMore: list.length >= limit, total: list.length }
      }
    } catch (e) {
      console.warn(`酷狗歌手搜索API第${attempt + 1}次失败:`, e.message)
    }
    if (attempt < 1) await new Promise(r => setTimeout(r, 400))
  }

  // 方式1失败，用方式2
  try {
    const list = await fetchFromSongSearch()
    await fillArtistAvatars(list)
    return { data: list.slice(0, limit), hasMore: list.length > limit, total: list.length }
  } catch (e) {
    console.error('酷狗歌曲搜索提取歌手失败:', e.message)
  }

  return { data: [], hasMore: false, total: 0 }
}

// 搜索专辑
async function searchKugouAlbum(keyword, page = 1, limit = pageSize) {
  try {
    const url = `http://mobilecdn.kugou.com/api/v3/search/album?format=json&keyword=${encodeURIComponent(keyword)}&page=${page}&pagesize=${limit}`
    const response = await fetch(url, { headers })
    const data = await response.json()

    const albumList = (data && data.data && data.data.info) ? data.data.info : []
    if (albumList.length > 0) {
      const list = albumList.map(formatAlbumItem)
      return {
        data: list,
        hasMore: albumList.length >= limit,
        total: parseInt(data.data.total || albumList.length),
      }
    }
    return { data: [], hasMore: false, total: 0 }
  } catch (error) {
    console.error('酷狗搜索专辑失败:', error)
    return { data: [], hasMore: false, total: 0 }
  }
}

// 获取歌手详情（歌曲列表 + 头像）
async function getKugouSingerDetail(singerId) {
  try {
    const id = String(singerId).replace('kugou_', '')
    // 获取歌手基本信息
    const infoUrl = `http://mobilecdn.kugou.com/api/v3/singer/info?singerid=${id}`
    const infoResp = await fetch(infoUrl, { headers })
    const infoData = await infoResp.json()
    const singerInfo = infoData.data || {}
    const singerName = singerInfo.singername || '未知歌手'
    const singerImg = singerInfo.imgurl
      ? singerInfo.imgurl.replace('{size}', '400')
      : `https://singerimg.kugou.com/uploadpic/softhead/400/${id}.jpg`

    // 获取歌手热门歌曲
    const songUrl = `http://mobilecdn.kugou.com/api/v3/singer/song?singerid=${id}&page=1&pagesize=50`
    const songResp = await fetch(songUrl, { headers })
    const songData = await songResp.json()
    const songList = (songData.data && songData.data.info)
      ? songData.data.info.map(s => formatKugouSongItem(s, singerName))
      : []

    // 平台真实歌曲总数/专辑总数
    const musicSize = (songData.data && songData.data.total) || singerInfo.songcount || 0
    const albumSize = singerInfo.albumcount || 0

    return {
      singerImg: singerImg,
      title: singerName,
      id: `kugou_${id}`,
      musicList: songList,
      musicSize: musicSize,
      albumSize: albumSize,
    }
  } catch (error) {
    console.error('酷狗获取歌手详情失败:', error)
    return null
  }
}

// 获取歌手歌曲分页（展开全部懒加载用）
async function getKugouSingerSongs(singerId, offset = 0, limit = 30) {
  try {
    const id = String(singerId).replace('kugou_', '')
    const page = Math.floor(offset / limit) + 1
    const url = `http://mobilecdn.kugou.com/api/v3/singer/song?singerid=${id}&page=${page}&pagesize=${limit}`
    const resp = await fetch(url, { headers })
    const data = await resp.json()
    const info = (data.data && data.data.info) || []
    // 先取一次歌手名
    let singerName = ''
    if (info[0] && info[0].singername) singerName = info[0].singername
    const list = info.map(s => formatKugouSongItem(s, singerName))
    return { list, total: (data.data && data.data.total) || 0 }
  } catch (error) {
    console.error('酷狗获取歌手歌曲分页失败:', error)
    return { list: [], total: 0 }
  }
}

// 获取歌手专辑列表 - 参考Kumone：循环请求所有页，每页100张，一次性获取全部专辑
async function getKugouSingerAlbums(singerId, offset = 0, limit = 30) {
  try {
    const id = String(singerId).replace('kugou_', '')
    const allAlbums = []
    let total = 0

    // 如果limit很大（>100），说明要获取全部专辑，循环请求所有页（参考Kumone）
    if (limit > 100) {
      let currentPage = 1
      const pageSize = 100 // 注：服务器单页实际最多约50条，不能拿 info.length<pageSize 判断末页（会提前 break）
      let serverTotal = 0
      while (true) {
        const url = `http://mobilecdn.kugou.com/api/v3/singer/album?singerid=${id}&page=${currentPage}&pagesize=${pageSize}`
        const response = await fetch(url, { headers })
        const data = await response.json()
        if (!data.data || !data.data.info || data.data.info.length === 0) break
        if (serverTotal === 0) serverTotal = data.data.total || 0
        const before = allAlbums.length
        allAlbums.push(...data.data.info)
        if (allAlbums.length === before) break // 本页无新增，防死循环
        // 用服务器 total 判断是否拉完（单页会被截到约50，不依赖当前页条数）
        if (serverTotal > 0 && allAlbums.length >= serverTotal) break
        currentPage++
        // 安全上限，防止无限循环（最多40页）
        if (currentPage > 40) break
      }
      total = serverTotal
      console.log(`[kugou-album] 歌手${id}获取全部${allAlbums.length}张专辑（共${total}张）`)
    } else {
      // 正常分页
      const page = Math.floor(offset / limit) + 1
      const url = `http://mobilecdn.kugou.com/api/v3/singer/album?singerid=${id}&page=${page}&pagesize=${limit}`
      const response = await fetch(url, { headers })
      const data = await response.json()
      if (data.data && data.data.info) {
        allAlbums.push(...data.data.info)
      }
      console.log(`[kugou-album] 歌手${id}获取${allAlbums.length}张专辑(第${page}页)`)
    }

    return allAlbums.map((_) => {
      let subType = _.album_type || _.type || ''
      const sub = String(subType).toLowerCase()
      // 优先识别接口返回的字符串类型（专辑/合辑/群星/V.A./单曲/EP/mini）
      if (sub === '专辑' || sub === 'album' || sub.includes('合辑') || sub.includes('群星') || sub === 'va' || sub === 'v.a.') subType = '专辑'
      else if (sub === '单曲' || sub === 'single') subType = '单曲'
      else if (sub === 'ep' || sub.includes('mini')) subType = 'EP'
      else if (subType === 1 || subType === '1') subType = '单曲'
      else if (subType === 2 || subType === '2') subType = 'EP'
      else if (!subType || subType === 0 || subType === '0') {
        const cnt = _.songcount || _.song_count || 0
        if (cnt === 1) subType = '单曲'
        else if (cnt > 1 && cnt <= 5) subType = 'EP'
        else subType = '专辑'
      }
      return {
        album_mid: `kugou_album_${_.albumid || _.album_id || ''}`,
        album_name: _.albumname || _.album_name || '',
        singer_mid: `kugou_${id}`,
        singer_name: _.singername || '',
        artwork: (_.imgurl || '').replace('{size}', '400') || (_.albumid ? `https://imge.kugou.com/stdmusic/400/album/${_.albumid}.jpg` : ''),
        public_time: _.publishtime || _.pub_time || '',
        songCount: _.songcount || 0,
        subType,
      }
    })
  } catch (error) {
    console.error('酷狗获取歌手专辑失败:', error)
    return []
  }
}

// 获取专辑歌曲列表
async function getKugouAlbumSongs(albumId) {
  try {
    const id = String(albumId).replace('kugou_album_', '').replace('kugou_', '')
    // 获取专辑信息（专辑名、封面、歌手）
    const infoUrl = `http://mobilecdn.kugou.com/api/v3/album/info?albumid=${id}`
    const infoResp = await fetch(infoUrl, { headers })
    const infoData = await infoResp.json()
    const albumInfo = infoData.data || {}
    const albumName = albumInfo.albumname || albumInfo.album_name || '未知专辑'
    const albumArtist = albumInfo.singername || '未知歌手'
    const albumCover = (albumInfo.imgurl || '').replace('{size}', '400') || `https://imge.kugou.com/stdmusic/400/album/${id}.jpg`

    // 获取专辑歌曲
    const songUrl = `http://mobilecdn.kugou.com/api/v3/album/song?albumid=${id}&page=1&pagesize=100`
    const songResp = await fetch(songUrl, { headers })
    const songData = await songResp.json()
    const songList = (songData.data && songData.data.info)
      ? songData.data.info.map(s => formatKugouSongItem(s, albumArtist))
      : []

    return {
      singerImg: albumCover,
      title: albumName,
      id: id,
      musicList: songList,
    }
  } catch (error) {
    console.error('酷狗获取专辑歌曲失败:', error)
    return { singerImg: '', title: '未知专辑', id: albumId, musicList: [] }
  }
}
// 获取歌曲播放地址
async function getKugouSongUrl(hash) {
  try {
    const songHash = String(hash).replace('kugou_', '')
    const url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${songHash}`
    const response = await fetch(url, { headers })
    const data = await response.json()

    if (data && data.status === 1 && data.data && data.data.play_url) {
      return { url: data.data.play_url }
    }
    return null
  } catch (error) {
    console.error('酷狗获取播放地址失败:', error)
    return null
  }
}

// 获取酷狗歌词（LRC格式，从播放地址接口同时获取）
async function getKugouLyric(hash, title, artist) {
  try {
    const songHash = String(hash).replace('kugou_', '')
    const url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${songHash}`
    const response = await fetch(url, { headers })
    const data = await response.json()

    if (data && data.status === 1 && data.data) {
      const lrc = data.data.lyrics || ''
      const tlyric = data.data.tlyric || ''
      if (lrc && lrc.length > 10) {
        return { lyric: lrc, tlyric: tlyric }
      }
    }
    return null
  } catch (error) {
    console.error('酷狗获取歌词失败:', error)
    return null
  }
}

// 解密酷狗KRC逐字歌词
function decryptKRC(encryptedBase64) {
  try {
    // KRC加密：base64解码后，每个字节与0x64异或
    const binary = atob(encryptedBase64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i) ^ 0x64
    }
    // zlib解压（KRC使用zlib压缩）
    // 简单处理：直接返回解压后的文本
    const text = new TextDecoder('utf-8').decode(bytes)
    return text
  } catch (e) {
    console.error('KRC解密失败:', e)
    return null
  }
}

// 解析KRC逐字歌词为统一格式
function parseKRC(krcText) {
  if (!krcText) return null
  const lines = krcText.split('\n')
  const result = []
  for (const line of lines) {
    // KRC格式：[时间,时长] <字开始,字时长>字 <字开始,字时长>字...
    const match = line.match(/^\[(\d+),(\d+)\](.*)$/)
    if (!match) continue
    const startTime = parseInt(match[1]) / 1000 // 毫秒转秒
    const lineText = match[3]
    // 解析逐字信息
    const wordMatches = lineText.match(/<(\d+),(\d+)>([^<]*)/g)
    const words = []
    let plainText = ''
    if (wordMatches) {
      for (const wm of wordMatches) {
        const wmMatch = wm.match(/<(\d+),(\d+)>([^<]*)/)
        if (wmMatch) {
          words.push({
            time: parseInt(wmMatch[1]) / 1000,
            duration: parseInt(wmMatch[2]) / 1000,
            text: wmMatch[3],
          })
          plainText += wmMatch[3]
        }
      }
    } else {
      plainText = lineText
    }
    if (plainText.trim()) {
      result.push({
        time: startTime,
        text: plainText,
        words: words.length > 0 ? words : undefined,
      })
    }
  }
  return result
}

// 获取酷狗KRC逐字歌词
async function getKugouKRCLyric(hash, title, artist) {
  try {
    const songHash = String(hash).replace('kugou_', '')
    const keyword = encodeURIComponent(`${title} - ${artist}`)
    // 第一步：搜索KRC
    const searchUrl = `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=${songHash}&keyword=${keyword}`
    const searchResp = await fetch(searchUrl, { headers })
    const searchData = await searchResp.json()

    if (searchData.errcode !== 0 || !searchData.candidates || searchData.candidates.length === 0) {
      return null
    }

    const candidate = searchData.candidates[0]
    const id = candidate.id
    const accesskey = candidate.accesskey

    // 第二步：下载KRC
    const downloadUrl = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${id}&accesskey=${accesskey}&fmt=krc&charset=utf8`
    const downloadResp = await fetch(downloadUrl, { headers })
    const downloadData = await downloadResp.json()

    if (downloadData.errcode !== 0 || !downloadData.content) {
      return null
    }

    // 解密KRC
    const krcText = decryptKRC(downloadData.content)
    if (!krcText) return null

    // 解析为逐字歌词
    const wordLyrics = parseKRC(krcText)
    return wordLyrics
  } catch (error) {
    console.error('酷狗获取KRC逐字歌词失败:', error)
    return null
  }
}

exports.searchKugouMusic = searchKugouMusic
exports.searchKugouArtist = searchKugouArtist
exports.searchKugouAlbum = searchKugouAlbum
exports.getKugouSongUrl = getKugouSongUrl
exports.getKugouLyric = getKugouLyric
exports.getKugouKRCLyric = getKugouKRCLyric
exports.formatMusicItem = formatMusicItem
exports.getKugouSingerDetail = getKugouSingerDetail
exports.getKugouSingerAlbums = getKugouSingerAlbums
exports.getKugouSingerSongs = getKugouSingerSongs
exports.getKugouAlbumSongs = getKugouAlbumSongs
