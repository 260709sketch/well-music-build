/**
 * 内置兜底音源（参考 kumone unblock.rs 实现）
 * 当用户导入的所有音源都失败时，自动尝试这些内置音源
 * 两个音源按优先级：Pyncmd -> 酷狗
 */
import { logInfo, logError } from './logger'

// ========== 工具函数 ==========

const normalize = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]/g, '')
}

const encodeKeyword = (title: string, artist: string): string => {
  const keyword = `${title} ${artist}`.trim()
  return encodeURIComponent(keyword)
}

// 时长匹配：差值小于5秒
const matchDuration = (targetMs: number, candidateMs: number): boolean => {
  if (targetMs <= 0 || candidateMs <= 0) return true
  return Math.abs(targetMs - candidateMs) < 5000
}

// ========== 1. Pyncmd（直接用网易云ID获取） ==========

export const getPyncmdUrl = async (neteaseId: string): Promise<string | null> => {
  try {
    logInfo(`[unblock] Pyncmd尝试: id=${neteaseId}`)
    const url = `https://music-api.gdstudio.xyz/api.php?types=url&source=netease&id=${neteaseId}&br=320`
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const data = await resp.json()
    if (data.br && data.br > 0 && data.url && data.url !== '') {
      let playUrl = data.url
      if (playUrl.startsWith('http://')) {
        playUrl = 'https://' + playUrl.slice(7)
      }
      logInfo(`[unblock] Pyncmd成功: ${playUrl.substring(0, 60)}`)
      return playUrl
    }
    logInfo('[unblock] Pyncmd返回无效')
    return null
  } catch (e) {
    logError('[unblock] Pyncmd失败:', e)
    return null
  }
}

// ========== 2. 酷狗 ==========

// 纯JS MD5实现（React Native的crypto.subtle不支持MD5）
const md5 = (text: string): string => {
  const input = text + 'kgcloudv2'
  function rotateLeft(lValue: number, iShiftBits: number): number {
    return (lValue << iShiftBits) | (lValue >>> (32 - iShiftBits))
  }
  function addUnsigned(lX: number, lY: number): number {
    const lX4 = (lX & 0x40000000)
    const lY4 = (lY & 0x40000000)
    const lX8 = (lX & 0x80000000)
    const lY8 = (lY & 0x80000000)
    const lResult = (lX & 0x3FFFFFFF) + (lY & 0x3FFFFFFF)
    if (lX4 & lY4) return (lResult ^ 0x80000000 ^ lX8 ^ lY8)
    if (lX4 | lY4) {
      if (lResult & 0x40000000) return (lResult ^ 0xC0000000 ^ lX8 ^ lY8)
      else return (lResult ^ 0x40000000 ^ lX8 ^ lY8)
    } else return (lResult ^ lX8 ^ lY8)
  }
  function F(x: number, y: number, z: number): number { return (x & y) | ((~x) & z) }
  function G(x: number, y: number, z: number): number { return (x & z) | (y & (~z)) }
  function H(x: number, y: number, z: number): number { return (x ^ y ^ z) }
  function I(x: number, y: number, z: number): number { return (y ^ (x | (~z))) }
  function FF(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(F(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }
  function GG(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(G(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }
  function HH(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(H(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }
  function II(a: number, b: number, c: number, d: number, x: number, s: number, ac: number): number {
    a = addUnsigned(a, addUnsigned(addUnsigned(I(b, c, d), x), ac))
    return addUnsigned(rotateLeft(a, s), b)
  }
  function convertToWordArray(str: string): number[] {
    let lWordCount
    const lMessageLength = str.length
    const lNumberOfWords_temp1 = lMessageLength + 8
    const lNumberOfWords_temp2 = (lNumberOfWords_temp1 - (lNumberOfWords_temp1 % 64)) / 64
    const lNumberOfWords = (lNumberOfWords_temp2 + 1) * 16
    const lWordArray: number[] = Array(lNumberOfWords - 1)
    let lBytePosition = 0
    let lByteCount = 0
    while (lByteCount < lMessageLength) {
      lWordCount = (lByteCount - (lByteCount % 4)) / 4
      lBytePosition = (lByteCount % 4) * 8
      lWordArray[lWordCount] = (lWordArray[lWordCount] | (str.charCodeAt(lByteCount) << lBytePosition))
      lByteCount++
    }
    lWordCount = (lByteCount - (lByteCount % 4)) / 4
    lBytePosition = (lByteCount % 4) * 8
    lWordArray[lWordCount] = lWordArray[lWordCount] | (0x80 << lBytePosition)
    lWordArray[lNumberOfWords - 2] = lMessageLength << 3
    lWordArray[lNumberOfWords - 1] = lMessageLength >>> 29
    return lWordArray
  }
  function wordToHex(lValue: number): string {
    let wordToHexValue = ''
    let wordToHexValue_temp = ''
    let lByte, lCount
    for (lCount = 0; lCount <= 3; lCount++) {
      lByte = (lValue >>> (lCount * 8)) & 255
      wordToHexValue_temp = '0' + lByte.toString(16)
      wordToHexValue = wordToHexValue + wordToHexValue_temp.substr(wordToHexValue_temp.length - 2, 2)
    }
    return wordToHexValue
  }
  function utf8Encode(str: string): string {
    str = str.replace(/\r\n/g, '\n')
    let utftext = ''
    for (let n = 0; n < str.length; n++) {
      const c = str.charCodeAt(n)
      if (c < 128) utftext += String.fromCharCode(c)
      else if ((c > 127) && (c < 2048)) {
        utftext += String.fromCharCode((c >> 6) | 192)
        utftext += String.fromCharCode((c & 63) | 128)
      } else {
        utftext += String.fromCharCode((c >> 12) | 224)
        utftext += String.fromCharCode(((c >> 6) & 63) | 128)
        utftext += String.fromCharCode((c & 63) | 128)
      }
    }
    return utftext
  }
  let x = []
  let k, AA, BB, CC, DD, a, b, c, d
  const S11 = 7, S12 = 12, S13 = 17, S14 = 22
  const S21 = 5, S22 = 9, S23 = 14, S24 = 20
  const S31 = 4, S32 = 11, S33 = 16, S34 = 23
  const S41 = 6, S42 = 10, S43 = 15, S44 = 21
  input = utf8Encode(input)
  x = convertToWordArray(input)
  a = 0x67452301; b = 0xEFCDAB89; c = 0x98BADCFE; d = 0x10325476
  for (k = 0; k < x.length; k += 16) {
    AA = a; BB = b; CC = c; DD = d
    a = FF(a, b, c, d, x[k + 0], S11, 0xD76AA478)
    d = FF(d, a, b, c, x[k + 1], S12, 0xE8C7B756)
    c = FF(c, d, a, b, x[k + 2], S13, 0x242070DB)
    b = FF(b, c, d, a, x[k + 3], S14, 0xC1BDCEEE)
    a = FF(a, b, c, d, x[k + 4], S11, 0xF57C0FAF)
    d = FF(d, a, b, c, x[k + 5], S12, 0x4787C62A)
    c = FF(c, d, a, b, x[k + 6], S13, 0xA8304613)
    b = FF(b, c, d, a, x[k + 7], S14, 0xFD469501)
    a = FF(a, b, c, d, x[k + 8], S11, 0x698098D8)
    d = FF(d, a, b, c, x[k + 9], S12, 0x8B44F7AF)
    c = FF(c, d, a, b, x[k + 10], S13, 0xFFFF5BB1)
    b = FF(b, c, d, a, x[k + 11], S14, 0x895CD7BE)
    a = FF(a, b, c, d, x[k + 12], S11, 0x6B901122)
    d = FF(d, a, b, c, x[k + 13], S12, 0xFD987193)
    c = FF(c, d, a, b, x[k + 14], S13, 0xA679438E)
    b = FF(b, c, d, a, x[k + 15], S14, 0x49B40821)
    a = GG(a, b, c, d, x[k + 1], S21, 0xF61E2562)
    d = GG(d, a, b, c, x[k + 6], S22, 0xC040B340)
    c = GG(c, d, a, b, x[k + 11], S23, 0x265E5A51)
    b = GG(b, c, d, a, x[k + 0], S24, 0xE9B6C7AA)
    a = GG(a, b, c, d, x[k + 5], S21, 0xD62F105D)
    d = GG(d, a, b, c, x[k + 10], S22, 0x2441453)
    c = GG(c, d, a, b, x[k + 15], S23, 0xD8A1E681)
    b = GG(b, c, d, a, x[k + 4], S24, 0xE7D3FBC8)
    a = GG(a, b, c, d, x[k + 9], S21, 0x21E1CDE6)
    d = GG(d, a, b, c, x[k + 14], S22, 0xC33707D6)
    c = GG(c, d, a, b, x[k + 3], S23, 0xF4D50D87)
    b = GG(b, c, d, a, x[k + 8], S24, 0x455A14ED)
    a = GG(a, b, c, d, x[k + 13], S21, 0xA9E3E905)
    d = GG(d, a, b, c, x[k + 2], S22, 0xFCEFA3F8)
    c = GG(c, d, a, b, x[k + 7], S23, 0x676F02D9)
    b = GG(b, c, d, a, x[k + 12], S24, 0x8D2A4C8A)
    a = HH(a, b, c, d, x[k + 5], S31, 0xFFFA3942)
    d = HH(d, a, b, c, x[k + 8], S32, 0x8771F681)
    c = HH(c, d, a, b, x[k + 11], S33, 0x6D9D6122)
    b = HH(b, c, d, a, x[k + 14], S34, 0xFDE5380C)
    a = HH(a, b, c, d, x[k + 1], S31, 0xA4BEEA44)
    d = HH(d, a, b, c, x[k + 4], S32, 0x4BDECFA9)
    c = HH(c, d, a, b, x[k + 7], S33, 0xF6BB4B60)
    b = HH(b, c, d, a, x[k + 10], S34, 0xBEBFBC70)
    a = HH(a, b, c, d, x[k + 13], S31, 0x289B7EC6)
    d = HH(d, a, b, c, x[k + 0], S32, 0xEAA127FA)
    c = HH(c, d, a, b, x[k + 3], S33, 0xD4EF3085)
    b = HH(b, c, d, a, x[k + 6], S34, 0x4881D05)
    a = HH(a, b, c, d, x[k + 9], S31, 0xD9D4D039)
    d = HH(d, a, b, c, x[k + 12], S32, 0xE6DB99E5)
    c = HH(c, d, a, b, x[k + 15], S33, 0x1FA27CF8)
    b = HH(b, c, d, a, x[k + 2], S34, 0xC4AC5665)
    a = II(a, b, c, d, x[k + 0], S41, 0xF4292244)
    d = II(d, a, b, c, x[k + 7], S42, 0x432AFF97)
    c = II(c, d, a, b, x[k + 14], S43, 0xAB9423A7)
    b = II(b, c, d, a, x[k + 5], S44, 0xFC93A039)
    a = II(a, b, c, d, x[k + 12], S41, 0x655B59C3)
    d = II(d, a, b, c, x[k + 3], S42, 0x8F0CCC92)
    c = II(c, d, a, b, x[k + 10], S43, 0xFFEFF47D)
    b = II(b, c, d, a, x[k + 1], S44, 0x85845DD1)
    a = II(a, b, c, d, x[k + 8], S41, 0x6FA87E4F)
    d = II(d, a, b, c, x[k + 15], S42, 0xFE2CE6E0)
    c = II(c, d, a, b, x[k + 6], S43, 0xA3014314)
    b = II(b, c, d, a, x[k + 13], S44, 0x4E0811A1)
    a = II(a, b, c, d, x[k + 4], S41, 0xF7537E82)
    d = II(d, a, b, c, x[k + 11], S42, 0xBD3AF235)
    c = II(c, d, a, b, x[k + 2], S43, 0x2AD7D2BB)
    b = II(b, c, d, a, x[k + 9], S44, 0xEB86D391)
    a = addUnsigned(a, AA)
    b = addUnsigned(b, BB)
    c = addUnsigned(c, CC)
    d = addUnsigned(d, DD)
  }
  return (wordToHex(a) + wordToHex(b) + wordToHex(c) + wordToHex(d)).toLowerCase()
}

export const getKugouUrl = async (
  title: string,
  artist: string,
  durationMs: number,
): Promise<string | null> => {
  try {
    const query = encodeKeyword(title, artist)
    logInfo(`[unblock] 酷狗搜索: "${title} - ${artist}"`)

    // 第一步：搜索
    const searchUrl = `https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${query}&page=1&pagesize=10`
    const searchResp = await fetch(searchUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const searchData = await searchResp.json()

    const info = searchData?.data?.info
    if (!info || !Array.isArray(info) || info.length === 0) {
      logInfo('[unblock] 酷狗搜索结果为空')
      return null
    }

    // 匹配时长
    let matchedHash: string | null = null
    let matchedAlbumId: string = '0'
    for (let i = 0; i < Math.min(5, info.length); i++) {
      const item = info[i]
      const hash = item?.hash || ''
      const albumId = String(item?.album_id || '0')
      const durationSec = parseInt(item?.duration || '0', 10)
      const candidateMs = durationSec * 1000
      if (matchDuration(durationMs, candidateMs)) {
        matchedHash = hash
        matchedAlbumId = albumId
        logInfo(`[unblock] 酷狗匹配: hash=${hash}, 时长=${durationSec}s`)
        break
      }
    }
    if (!matchedHash && info.length > 0) {
      matchedHash = info[0]?.hash || null
      matchedAlbumId = String(info[0]?.album_id || '0')
      logInfo(`[unblock] 酷狗无时长匹配，取第一首: hash=${matchedHash}`)
    }
    if (!matchedHash) return null

    // 第二步：MD5签名 + 获取URL
    const key = md5(matchedHash)
    const trackUrl = `https://trackercdn.kugou.com/i/v2/?key=${key}&hash=${matchedHash}&appid=1005&pid=2&cmd=25&behavior=play&album_id=${matchedAlbumId}`
    const trackResp = await fetch(trackUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
    })
    const trackData = await trackResp.json()
    const urls = trackData?.url
    if (Array.isArray(urls) && urls.length > 0 && urls[0] && urls[0] !== '') {
      logInfo(`[unblock] 酷狗成功: ${urls[0].substring(0, 60)}`)
      return urls[0]
    }
    logInfo('[unblock] 酷狗获取URL失败')
    return null
  } catch (e) {
    logError('[unblock] 酷狗失败:', e)
    return null
  }
}

// ========== 统一兜底入口 ==========

export const tryBuiltinUnblock = async (
  musicItem: IMusic.IMusicItem,
): Promise<{ url: string; source: string } | null> => {
  const title = musicItem.title || ''
  const artist = musicItem.artist || ''
  const durationMs = (musicItem.duration || 0) * 1000
  const rawId = String(musicItem.id || musicItem.songmid || '')

  // 解析网易云ID（Pyncmd只支持网易云）
  let neteaseId: string | null = null
  if (rawId.startsWith('netease_') || rawId.startsWith('wy_')) {
    neteaseId = rawId.replace(/^(netease_|wy_)/, '')
  } else if (/^\d+$/.test(rawId) && (musicItem.platform === 'netease' || musicItem.source === 'netease')) {
    neteaseId = rawId
  }

  // 1. Pyncmd（仅网易云）
  if (neteaseId) {
    const url = await getPyncmdUrl(neteaseId)
    if (url) return { url, source: 'Pyncmd内置音源' }
  }

  // 2. 酷狗
  const kugouUrl = await getKugouUrl(title, artist, durationMs)
  if (kugouUrl) return { url: kugouUrl, source: '酷狗内置音源' }

  logInfo('[unblock] 所有内置兜底音源均失败')
  return null
}
