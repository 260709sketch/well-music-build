/**
 * LX 风格歌词获取
 * QQ音乐：POST u.y.qq.com/cgi-bin/musicu.fcg + GetPlayLyricInfo，支持翻译
 * 酷狗：search → download 两步，KRC 解密（XOR + pako inflate），支持翻译
 */

import pako from 'pako'

// ========== 工具函数 ==========

// UTF-8 字节数组转字符串（兼容 RN 无 TextDecoder 的情况）
function utf8BytesToString(bytes) {
  try {
    if (typeof TextDecoder !== 'undefined') {
      return new TextDecoder('utf-8').decode(bytes)
    }
  } catch (e) {}
  // 手动解码 UTF-8
  let result = ''
  let i = 0
  while (i < bytes.length) {
    const byte1 = bytes[i++]
    if (byte1 < 0x80) {
      result += String.fromCharCode(byte1)
    } else if (byte1 < 0xe0) {
      const byte2 = bytes[i++]
      result += String.fromCharCode(((byte1 & 0x1f) << 6) | (byte2 & 0x3f))
    } else if (byte1 < 0xf0) {
      const byte2 = bytes[i++]
      const byte3 = bytes[i++]
      result += String.fromCharCode(((byte1 & 0x0f) << 12) | ((byte2 & 0x3f) << 6) | (byte3 & 0x3f))
    } else {
      const byte2 = bytes[i++]
      const byte3 = bytes[i++]
      const byte4 = bytes[i++]
      const codepoint = ((byte1 & 0x07) << 18) | ((byte2 & 0x3f) << 12) | ((byte3 & 0x3f) << 6) | (byte4 & 0x3f)
      const adjusted = codepoint - 0x10000
      result += String.fromCharCode(0xd800 + (adjusted >> 10)) + String.fromCharCode(0xdc00 + (adjusted & 0x3ff))
    }
  }
  return result
}

// 纯 JS base64 解码（兼容 Hermes 无 atob 的情况）
function safeAtob(str) {
  if (typeof atob === 'function') {
    try { return atob(str) } catch (e) {}
  }
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  let result = ''
  let i = 0
  const clean = str.replace(/[^A-Za-z0-9+/=]/g, '')
  while (i < clean.length) {
    const b1 = chars.indexOf(clean[i++])
    const b2 = chars.indexOf(clean[i++])
    const b3 = chars.indexOf(clean[i++])
    const b4 = chars.indexOf(clean[i++])
    const c1 = (b1 << 2) | (b2 >> 4)
    const c2 = ((b2 & 15) << 4) | (b3 >> 2)
    const c3 = ((b3 & 3) << 6) | b4
    result += String.fromCharCode(c1)
    if (b3 !== 64) result += String.fromCharCode(c2)
    if (b4 !== 64) result += String.fromCharCode(c3)
  }
  return result
}

// base64 解码为 UTF-8 字符串
function b64DecodeUnicode(str) {
  if (!str) return ''
  try {
    const binary = safeAtob(str)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return utf8BytesToString(bytes)
  } catch (e) {
    console.error('[lx-lyric] b64DecodeUnicode error:', e)
    return ''
  }
}

// base64 解码为 Uint8Array
function base64ToBytes(str) {
  const binary = safeAtob(str)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// 解码 HTML 实体和 unicode 转义
function decodeName(str) {
  if (!str) return ''
  return str
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

// LRC 时间戳转毫秒（xx是百分之一秒，需要×10）
function parseTimeToMs(match) {
  const min = parseInt(match[1])
  const sec = parseInt(match[2])
  const msStr = match[3] || '0'
  const ms = parseInt(msStr.padEnd(3, '0').substring(0, 3))
  return min * 60000 + sec * 1000 + ms
}

// ========== QQ音乐歌词 ==========

export async function getQQLyric(songmid) {
  console.log('[lx-lyric] getQQLyric songmid:', songmid)

  // 方式1：旧接口 fcg_query_lyric_new（主歌词，保证时间轴同步）
  let oldLyric = ''
  let oldTrans = ''
  try {
    console.log('[lx-lyric] QQ try old endpoint first')
    const resp = await fetch(
      `https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${encodeURIComponent(songmid)}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&platform=yqq&nobase64=1`,
      {
        headers: { Referer: 'https://y.qq.com/portal/player.html' },
      },
    )
    const text = await resp.text()
    let body
    try {
      body = JSON.parse(text)
    } catch {
      const match = text.match(/\{.*\}/)
      if (match) body = JSON.parse(match[0])
    }
    if (body && body.code === 0 && body.lyric) {
      oldLyric = body.lyric
      oldTrans = body.trans || ''
      console.log('[lx-lyric] QQ old endpoint success, trans:', oldTrans ? 'yes' : 'no')
      // 旧接口有翻译，直接返回
      if (oldTrans && oldTrans.trim()) {
        return { lyric: oldLyric, tlyric: oldTrans }
      }
    }
  } catch (e) {
    console.error('[lx-lyric] QQ old endpoint error:', e)
  }

  // 方式2：旧接口无翻译，用新接口 musicu.fcg 补翻译
  if (oldLyric) {
    try {
      console.log('[lx-lyric] QQ old endpoint has lyric but no trans, try new endpoint for trans')
      const trans = await fetchQQTransOnly(songmid)
      if (trans) {
        return { lyric: oldLyric, tlyric: trans }
      }
      return { lyric: oldLyric, tlyric: '' }
    } catch (e) {
      console.error('[lx-lyric] QQ new endpoint trans fetch error:', e)
      return { lyric: oldLyric, tlyric: '' }
    }
  }

  // 方式3：旧接口失败，用新接口获取全部
  try {
    console.log('[lx-lyric] QQ old endpoint failed, try new endpoint for both')
    const result = await fetchQQLyricNew(songmid)
    if (result && result.lyric) {
      return result
    }
  } catch (e) {
    console.error('[lx-lyric] QQ new endpoint error:', e)
  }

  throw new Error('QQ音乐歌词获取失败')
}

// 从新接口仅获取翻译
async function fetchQQTransOnly(songmid) {
  const payload = {
    comm: { ct: 24, cv: 1800 },
    req_0: {
      module: 'music.musichallSong.PlayLyricInfo',
      method: 'GetPlayLyricInfo',
      param: {
        crypt: 0, lrc_t: 0, qrc: 0, qrc_t: 0,
        roma: 0, roma_t: 0, trans: 1, trans_t: 0,
        type: 1, songMid: songmid,
      },
    },
  }
  const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381', {
    method: 'POST',
    headers: {
      'User-Agent': 'QQMusic 14090508(android 12)',
      Referer: 'https://y.qq.com/',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await resp.json()
  const data = body?.req_0?.data
  if (data && data.trans) {
    const rawTlyric = decodeName(b64DecodeUnicode(data.trans))
    const rawLyric = decodeName(b64DecodeUnicode(data.lyric))
    if (!rawTlyric || !rawTlyric.trim()) return ''

    // 用新接口的主歌词时间戳对齐翻译
    const mainLinesMap = {}
    const mainTimestamps = []
    for (const line of (rawLyric || '').split('\n')) {
      const match = line.match(/^\[(\d+):(\d+)\.(\d+)\]/)
      if (match) {
        const timeMs = parseTimeToMs(match)
        mainLinesMap[timeMs] = line
        mainTimestamps.push(timeMs)
      }
    }

    const alignedLines = []
    for (const line of rawTlyric.split('\n')) {
      if (line.match(/^\[(ti|ar|al|by|offset):/i)) {
        alignedLines.push(line)
        continue
      }
      const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/)
      if (match) {
        const timeMs = parseTimeToMs(match)
        const content = match[4].trim()
        if (!content || content === '//') continue
        let closestTime = mainTimestamps[0]
        let minDiff = Math.abs(timeMs - closestTime)
        for (const t of mainTimestamps) {
          const diff = Math.abs(timeMs - t)
          if (diff < minDiff) { minDiff = diff; closestTime = t }
        }
        const mainLine = mainLinesMap[closestTime]
        if (mainLine) {
          const timeMatch = mainLine.match(/^\[(\d+:\d+\.\d+)\]/)
          if (timeMatch) {
            alignedLines.push(`[${timeMatch[1]}]${content}`)
          }
        }
      }
    }
    return alignedLines.join('\n')
  }
  return ''
}

// 从新接口获取全部歌词+翻译（旧接口完全失败时用）
async function fetchQQLyricNew(songmid) {
  const payload = {
    comm: { ct: 24, cv: 1800 },
    req_0: {
      module: 'music.musichallSong.PlayLyricInfo',
      method: 'GetPlayLyricInfo',
      param: {
        crypt: 0, lrc_t: 0, qrc: 0, qrc_t: 0,
        roma: 0, roma_t: 0, trans: 1, trans_t: 0,
        type: 1, songMid: songmid,
      },
    },
  }
  const resp = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381', {
    method: 'POST',
    headers: {
      'User-Agent': 'QQMusic 14090508(android 12)',
      Referer: 'https://y.qq.com/',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await resp.json()
  const data = body?.req_0?.data
  if (data && data.lyric) {
    const rawLyric = decodeName(b64DecodeUnicode(data.lyric))
    const rawTlyric = decodeName(b64DecodeUnicode(data.trans))
    const filteredLyric = (rawLyric || '').split('\n')
      .filter((line) => line.trim() !== '' && line.trim() !== '//')
      .join('\n')
    if (!filteredLyric.trim()) return null

    const filteredTlyric = (rawTlyric || '').split('\n')
      .filter((line) => {
        if (line.trim() === '' || line.trim() === '//') return false
        if (line.includes('[kana:')) return false
        if (line.match(/^\[(ti|ar|al|by|offset):/i)) return true
        if (line.match(/^\[\d+:\d+/)) return true
        return false
      })
      .join('\n')

    // 翻译时间戳对齐
    const mainLinesMap = {}
    const mainTimestamps = []
    for (const line of filteredLyric.split('\n')) {
      const match = line.match(/^\[(\d+):(\d+)\.(\d+)\]/)
      if (match) {
        const timeMs = parseTimeToMs(match)
        mainLinesMap[timeMs] = line
        mainTimestamps.push(timeMs)
      }
    }
    const alignedLines = []
    for (const line of filteredTlyric.split('\n')) {
      if (line.match(/^\[(ti|ar|al|by|offset):/i)) {
        alignedLines.push(line)
        continue
      }
      const match = line.match(/^\[(\d+):(\d+)\.(\d+)\](.*)$/)
      if (match) {
        const timeMs = parseTimeToMs(match)
        const content = match[4].trim()
        if (!content || content === '//') continue
        let closestTime = mainTimestamps[0]
        let minDiff = Math.abs(timeMs - closestTime)
        for (const t of mainTimestamps) {
          const diff = Math.abs(timeMs - t)
          if (diff < minDiff) { minDiff = diff; closestTime = t }
        }
        const mainLine = mainLinesMap[closestTime]
        if (mainLine) {
          const timeMatch = mainLine.match(/^\[(\d+:\d+\.\d+)\]/)
          if (timeMatch) {
            alignedLines.push(`[${timeMatch[1]}]${content}`)
          }
        }
      }
    }
    return { lyric: filteredLyric, tlyric: alignedLines.join('\n') }
  }
  return null
}

// QQ音乐搜索匹配歌词（用于 songmid 无效或 LX 音源歌曲）
export async function getQQLyricBySearch(title, artist, album) {
  const keyword = `${title} ${artist || ''}`.trim()
  console.log('[lx-lyric] QQ search lyric keyword:', keyword)
  try {
    const resp = await fetch(
      `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?w=${encodeURIComponent(keyword)}&format=json&n=10&p=1`,
      { headers: { Referer: 'https://y.qq.com/portal/player.html' } },
    )
    const body = await resp.json()
    const songList = body?.data?.song?.list || []
    console.log('[lx-lyric] QQ search results:', songList.length)
    if (songList.length > 0) {
      // 找最匹配的（同名同专辑同歌手优先，其次同名同歌手，最后同名）
      let bestMatch = null
      let bestScore = 0
      for (const song of songList) {
        const songName = (song.title || song.songname || '').toLowerCase()
        const singerName = (song.singer || []).map((s) => s.name).join('').toLowerCase()
        const albumName = (song.albumname || song.album?.name || song.album_name || '').toLowerCase()
        let score = 0
        // 标题匹配（前6个字相同得高分）
        if (songName.includes(title.toLowerCase().slice(0, 6))) score += 3
        else if (songName.includes(title.toLowerCase().slice(0, 4))) score += 2
        else if (songName.includes(title.toLowerCase().slice(0, 2))) score += 1
        // 歌手匹配
        if (artist && singerName.includes(artist.toLowerCase().slice(0, 4))) score += 3
        else if (artist && singerName.includes(artist.toLowerCase().slice(0, 2))) score += 1
        // 专辑匹配（同名同专辑同歌手得最高分）
        if (album && albumName && albumName.includes(album.toLowerCase().slice(0, 4))) score += 4
        else if (album && albumName && albumName.includes(album.toLowerCase().slice(0, 2))) score += 2
        if (score > bestScore) {
          bestScore = score
          bestMatch = song
        }
      }
      if (!bestMatch) bestMatch = songList[0]
      const songmid = bestMatch.mid || bestMatch.songmid || bestMatch.songMid
      if (songmid) {
        console.log('[lx-lyric] QQ search matched songmid:', songmid, 'title:', bestMatch.title || bestMatch.songname, 'album:', bestMatch.albumname || bestMatch.album?.name || '', 'score:', bestScore)
        return getQQLyric(songmid)
      }
    }
  } catch (e) {
    console.error('[lx-lyric] QQ search error:', e)
  }
  throw new Error('QQ音乐搜索歌词为空')
}

// ========== 酷狗歌词 ==========

const KG_HEADERS = {
  'KG-RC': '1',
  'KG-THash': 'expand_search_manager.cpp:852736169:451',
  'User-Agent': 'KuGou2012-9020-ExpandSearchManager',
}

const KG_ENC_KEY = new Uint8Array([
  0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47,
  0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69,
])

// KRC 解密
function decodeKRC(str) {
  if (!str || !str.length) return ''
  const buf = base64ToBytes(str).slice(4)
  for (let i = 0; i < buf.length; i++) {
    buf[i] = buf[i] ^ KG_ENC_KEY[i % 16]
  }
  // pako inflate 到 Uint8Array，再手动转字符串（避免 to:'string' 在 RN 不兼容）
  const inflated = pako.inflate(buf)
  return utf8BytesToString(inflated)
}

const KG_HEAD_EXP = /^.*\[id:\$\w+\]\n/

function parseKRC(str) {
  str = str.replace(/\r/g, '')
  if (KG_HEAD_EXP.test(str)) str = str.replace(KG_HEAD_EXP, '')

  let trans = str.match(/\[language:([\w=\\/+]+)\]/)
  let lyric
  let rlyric
  let tlyric

  if (trans) {
    str = str.replace(/\[language:[\w=\\/+]+\]\n/, '')
    try {
      const json = JSON.parse(b64DecodeUnicode(trans[1]))
      for (const item of json.content) {
        switch (item.type) {
          case 0:
            rlyric = item.lyricContent
            break
          case 1:
            tlyric = item.lyricContent
            break
        }
      }
    } catch (e) {
      console.error('[lx-lyric] KRC language parse error:', e)
    }
  }

  let i = 0
  let lxlyric = str.replace(/\[((\d+),\d+)\].*/g, (matched) => {
    const result = matched.match(/\[((\d+),\d+)\].*/)
    if (!result) return matched
    let time = parseInt(result[2])
    const ms = time % 1000
    time = Math.floor(time / 1000)
    const m = Math.floor(time / 60).toString().padStart(2, '0')
    time %= 60
    const s = parseInt(time).toString().padStart(2, '0')
    const timeStr = `${m}:${s}.${ms}`
    if (rlyric && rlyric[i] !== undefined) rlyric[i] = `[${timeStr}]${(rlyric[i] || []).join('')}`
    if (tlyric && tlyric[i] !== undefined) tlyric[i] = `[${timeStr}]${(tlyric[i] || []).join('')}`
    i++
    return matched.replace(result[1], timeStr)
  })

  rlyric = rlyric ? rlyric.join('\n') : ''
  tlyric = tlyric ? tlyric.join('\n') : ''
  lxlyric = lxlyric.replace(/<(\d+,\d+),\d+>/g, '<$1>')
  lxlyric = decodeName(lxlyric)
  lyric = lxlyric.replace(/<\d+,\d+>/g, '')
  rlyric = decodeName(rlyric)
  tlyric = decodeName(tlyric)

  return { lyric, tlyric, rlyric, lxlyric }
}

async function searchKugouLyric(name, hash, time) {
  const url = `http://lyrics.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(name)}&hash=${hash}&timelength=${time}&lrctxt=1`
  console.log('[lx-lyric] KuGou search:', name, 'hash:', hash, 'time:', time)
  const resp = await fetch(url, { headers: KG_HEADERS })
  const body = await resp.json()
  console.log('[lx-lyric] KuGou search status:', resp.status, 'candidates:', body?.candidates?.length)
  if (resp.status !== 200 || !body.candidates || !body.candidates.length) {
    return null
  }
  const info = body.candidates[0]
  return {
    id: info.id,
    accessKey: info.accesskey,
    fmt: info.krctype == 1 && info.contenttype != 1 ? 'krc' : 'lrc',
  }
}

async function downloadKugouLyric(id, accessKey, fmt) {
  const url = `http://lyrics.kugou.com/download?ver=1&client=pc&id=${id}&accesskey=${accessKey}&fmt=${fmt}&charset=utf8`
  console.log('[lx-lyric] KuGou download fmt:', fmt, 'id:', id)
  const resp = await fetch(url, { headers: KG_HEADERS })
  const body = await resp.json()
  console.log('[lx-lyric] KuGou download status:', resp.status, 'fmt:', body?.fmt)
  if (resp.status !== 200) {
    throw new Error('酷狗歌词下载失败 status:' + resp.status)
  }
  if (body.fmt === 'krc') {
    const decoded = decodeKRC(body.content)
    console.log('[lx-lyric] KRC decoded length:', decoded.length)
    return parseKRC(decoded)
  } else if (body.fmt === 'lrc') {
    return {
      lyric: b64DecodeUnicode(body.content),
      tlyric: '',
      rlyric: '',
      lxlyric: '',
    }
  }
  throw new Error(`未知歌词格式: ${body.fmt}`)
}

export async function getKugouLyric(musicItem) {
  const name = musicItem.title || ''
  const hash = musicItem.hash || musicItem.originalId || (musicItem.id && musicItem.id.replace('kugou_', '')) || ''
  let duration = musicItem.duration || 0
  if (duration > 0 && duration < 10000) duration = duration * 1000

  console.log('[lx-lyric] getKugouLyric name:', name, 'hash:', hash, 'duration:', duration)

  const searchResult = await searchKugouLyric(name, hash, duration)
  if (!searchResult) {
    throw new Error('酷狗歌词搜索为空')
  }
  return downloadKugouLyric(searchResult.id, searchResult.accessKey, searchResult.fmt)
}
