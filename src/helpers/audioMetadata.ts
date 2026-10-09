import { Buffer } from 'buffer'
import RNFS from 'react-native-fs'
import { myGetLyric } from '@/helpers/userApi/getMusicSource'
import { fetchWordLyricFor } from '@/helpers/userApi/wordLyric'
import type { WordLyricLine } from '@/helpers/userApi/wordLyric'

// 写入音频元数据（自动检测MP3/FLAC）
export async function writeAudioMetadata(
  filePath: string,
  metadata: {
    title: string
    artist: string
    album?: string
    coverUrl?: string
    lyrics?: string
  },
): Promise<boolean> {
  const ext = filePath.split('.').pop()?.toLowerCase()
  if (ext === 'flac') {
    return writeFlacMetadata(filePath, metadata)
  }
  return writeMp3Metadata(filePath, metadata)
}

// 写入FLAC的Vorbis评论 + PICTURE块
// 流式实现：只解析文件头部元数据块，音频数据按块定位读取并追加，
// 不把整文件读入内存，母带/Hi-Res/24bit 等大 FLAC 也能正常内嵌封面与歌词。
export async function writeFlacMetadata(
  filePath: string,
  metadata: {
    title: string
    artist: string
    album?: string
    coverUrl?: string
    lyrics?: string
  },
): Promise<boolean> {
  let tmpPath: string | undefined
  try {
    const statRes: any = await RNFS.stat(filePath).catch(() => null)
    const fileSize = statRes ? parseInt(statRes.size, 10) || 0 : 0
    if (!fileSize) {
      console.log('[metadata] FLAC stat failed, size=0')
      return false
    }

    // 1) 解析头部元数据块，定位音频数据起点；剔除旧的 VORBIS_COMMENT(4)/PICTURE(6)
    const keptBlocks: { type: number; data: Buffer }[] = []
    let pos = 4
    let isLast = false
    while (!isLast && pos + 4 <= fileSize) {
      const hdrB64 = await RNFS.read(filePath, 4, pos, 'base64')
      const hdr = Buffer.from(hdrB64, 'base64')
      if (hdr.length < 4) break
      const flags = hdr[0]
      isLast = (flags & 0x80) !== 0
      const blockType = flags & 0x7f
      const blockLength = (hdr[1] << 16) | (hdr[2] << 8) | hdr[3]
      if (blockType !== 4 && blockType !== 6) {
        const dataB64 = blockLength > 0 ? await RNFS.read(filePath, blockLength, pos + 4, 'base64') : ''
        keptBlocks.push({ type: blockType, data: Buffer.from(dataB64, 'base64') })
      }
      pos += 4 + blockLength
      if (blockLength <= 0 && blockType !== 0) break // 防御异常长度
    }
    const audioStart = pos

    // 2) 构建 VORBIS_COMMENT 块
    const comments: string[] = []
    comments.push(`TITLE=${metadata.title}`)
    comments.push(`ARTIST=${metadata.artist}`)
    if (metadata.album) comments.push(`ALBUM=${metadata.album}`)
    if (metadata.lyrics) comments.push(`LYRICS=${metadata.lyrics}`)

    const vendor = Buffer.from('WellMusic', 'utf8')
    const commentBuffers = comments.map(c => {
      const len = Buffer.alloc(4)
      len.writeUInt32LE(Buffer.byteLength(c, 'utf8'), 0)
      return Buffer.concat([len, Buffer.from(c, 'utf8')])
    })
    const vendorLen = Buffer.alloc(4)
    vendorLen.writeUInt32LE(vendor.length, 0)
    const commentCount = Buffer.alloc(4)
    commentCount.writeUInt32LE(comments.length, 0)
    const vorbisData = Buffer.concat([vendorLen, vendor, commentCount, ...commentBuffers])

    // 3) 构建 PICTURE 块（封面）
    let pictureBlock: Buffer | null = null
    if (metadata.coverUrl) {
      try {
        const cover = await downloadCover(metadata.coverUrl)
        if (cover) {
          const coverBuffer = Buffer.from(cover.base64, 'base64')
          const picType = Buffer.alloc(4)
          picType.writeUInt32BE(3, 0) // front cover
          const mimeLen = Buffer.alloc(4)
          mimeLen.writeUInt32BE(cover.mime.length, 0)
          const mime = Buffer.from(cover.mime, 'ascii')
          const descLen = Buffer.alloc(4)
          descLen.writeUInt32BE(0, 0)
          const width = Buffer.alloc(4); width.writeUInt32BE(0, 0)
          const height = Buffer.alloc(4); height.writeUInt32BE(0, 0)
          const depth = Buffer.alloc(4); depth.writeUInt32BE(24, 0)
          const colors = Buffer.alloc(4); colors.writeUInt32BE(0, 0)
          const picDataLen = Buffer.alloc(4)
          picDataLen.writeUInt32BE(coverBuffer.length, 0)
          pictureBlock = Buffer.concat([
            picType, mimeLen, mime, descLen, width, height, depth, colors, picDataLen, coverBuffer
          ])
        }
      } catch (e) {
        console.log('[metadata] FLAC cover failed:', e)
      }
    }

    // 4) 组装块（仅最后一块置 last-metadata-block 标记）
    const allBlocks: { type: number; data: Buffer }[] = [...keptBlocks]
    allBlocks.push({ type: 4, data: vorbisData })
    if (pictureBlock) allBlocks.push({ type: 6, data: pictureBlock })

    const headParts: Buffer[] = [Buffer.from('fLaC', 'ascii')]
    allBlocks.forEach((block, i) => {
      const header = Buffer.alloc(4)
      const isLastBlock = i === allBlocks.length - 1
      header[0] = (isLastBlock ? 0x80 : 0x00) | block.type
      header[1] = (block.data.length >> 16) & 0xff
      header[2] = (block.data.length >> 8) & 0xff
      header[3] = block.data.length & 0xff
      headParts.push(header, block.data)
    })
    const head = Buffer.concat(headParts)

    // 5) 写临时文件：新头部 + 分块追加原始音频（不全量载入）
    tmpPath = `${filePath}.tagtmp`
    try { await RNFS.unlink(tmpPath) } catch {}
    await RNFS.writeFile(tmpPath, head.toString('base64'), 'base64')
    const CHUNK = 4 * 1024 * 1024
    let rp = audioStart
    while (rp < fileSize) {
      const n = Math.min(CHUNK, fileSize - rp)
      const b64 = await RNFS.read(filePath, n, rp, 'base64')
      if (!b64) break
      await RNFS.appendFile(tmpPath, b64, 'base64')
      rp += n
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    // 6) 用临时文件替换原文件
    await RNFS.unlink(filePath)
    await RNFS.moveFile(tmpPath, filePath)
    tmpPath = undefined
    console.log(`[metadata] FLAC(stream) written: ${comments.length} comments, cover=${!!pictureBlock}, audioStart=${audioStart}`)
    return true
  } catch (e) {
    if (tmpPath) { try { await RNFS.unlink(tmpPath) } catch {} }
    console.error('[metadata] writeFlacMetadata failed:', e)
    return false
  }
}

// 写入MP3的ID3v2.3标签（歌名、歌手、专辑、封面、歌词）
export async function writeMp3Metadata(
  filePath: string,
  metadata: {
    title: string
    artist: string
    album?: string
    coverUrl?: string
    lyrics?: string
  },
): Promise<boolean> {
  try {
    // 1. 读取原文件
    const fileBase64 = await RNFS.readFile(filePath, 'base64')
    const fileBuffer = Buffer.from(fileBase64, 'base64')

    // 2. 移除已有ID3v2标签（如果有）
    let audioData = fileBuffer
    if (fileBuffer.length >= 3 && fileBuffer.toString('utf8', 0, 3) === 'ID3') {
      const tagSize = syncsafeToInt(fileBuffer.slice(6, 10))
      audioData = fileBuffer.slice(10 + tagSize)
    }

    // 3. 构建ID3v2.3帧
    const frames: Buffer[] = []

    // TIT2 - 标题
    frames.push(buildTextFrame('TIT2', metadata.title))
    // TPE1 - 艺术家
    frames.push(buildTextFrame('TPE1', metadata.artist))
    // TALB - 专辑
    if (metadata.album) {
      frames.push(buildTextFrame('TALB', metadata.album))
    }
    // USLT - 歌词
    if (metadata.lyrics) {
      frames.push(buildLyricsFrame(metadata.lyrics))
    }
    // APIC - 封面
    if (metadata.coverUrl) {
      try {
        const cover = await downloadCover(metadata.coverUrl)
        if (cover) {
          frames.push(buildCoverFrame(cover.base64, cover.mime))
        }
      } catch (e) {
        console.log('[metadata] cover embed failed:', e)
      }
    }

    // 4. 组合ID3标签
    const framesBuffer = Buffer.concat(frames)
    const id3Size = framesBuffer.length
    const header = Buffer.alloc(10)
    header.write('ID3', 0, 'utf8')
    header.writeUInt8(0x03, 3) // version 2.3
    header.writeUInt8(0x00, 4)
    header.writeUInt8(0x00, 5)
    const sizeBytes = intToSyncsafe(id3Size)
    header.set(sizeBytes, 6)

    const newFileBuffer = Buffer.concat([header, framesBuffer, audioData])

    // 5. 写回文件
    await RNFS.writeFile(filePath, newFileBuffer.toString('base64'), 'base64')
    return true
  } catch (e) {
    console.error('[metadata] writeMp3Metadata failed:', e)
    return false
  }
}

// 构建文本帧
function buildTextFrame(frameId: string, text: string): Buffer {
  const textBuffer = Buffer.from(text, 'utf16le')
  const bom = Buffer.from([0xff, 0xfe]) // UTF-16 LE BOM
  const encoding = Buffer.from([0x01]) // UTF-16
  const data = Buffer.concat([encoding, bom, textBuffer, Buffer.from([0x00, 0x00])])
  return buildFrame(frameId, data)
}

// 构建歌词帧 (USLT)
function buildLyricsFrame(lyrics: string): Buffer {
  const encoding = Buffer.from([0x01]) // UTF-16
  const language = Buffer.from('eng', 'ascii')
  const bom = Buffer.from([0xff, 0xfe])
  const desc = Buffer.from([0x00, 0x00]) // empty description (null-terminated UTF-16)
  const lyricsBuffer = Buffer.from(lyrics, 'utf16le')
  const nullTerm = Buffer.from([0x00, 0x00])
  const data = Buffer.concat([encoding, language, bom, desc, lyricsBuffer, nullTerm])
  return buildFrame('USLT', data)
}

// 构建封面帧 (APIC)
function buildCoverFrame(coverBase64: string, mimeType: string = 'image/jpeg'): Buffer {
  const coverBuffer = Buffer.from(coverBase64, 'base64')
  const encoding = Buffer.from([0x00]) // ISO-8859-1
  const mime = Buffer.from(mimeType, 'ascii')
  const mimeNull = Buffer.from([0x00])
  const picType = Buffer.from([0x03]) // 0x03 = front cover
  const descNull = Buffer.from([0x00]) // empty description
  const data = Buffer.concat([encoding, mime, mimeNull, picType, descNull, coverBuffer])
  return buildFrame('APIC', data)
}

// 构建帧
function buildFrame(frameId: string, data: Buffer): Buffer {
  const header = Buffer.alloc(10)
  header.write(frameId, 0, 'ascii')
  header.writeUInt32BE(data.length, 4)
  header.writeUInt16BE(0x0000, 8) // flags
  return Buffer.concat([header, data])
}

// 下载封面到base64，返回 {base64, mimeType}
async function downloadCover(url: string): Promise<{ base64: string; mime: string } | null> {
  try {
    const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || 'jpg'
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const tempPath = `${RNFS.TemporaryDirectoryPath}/cover_${Date.now()}.${ext}`
    const download = RNFS.downloadFile({ fromUrl: url, toFile: tempPath })
    const result = await download.promise
    if (result.statusCode === 200 || result.statusCode === 206) {
      const base64 = await RNFS.readFile(tempPath, 'base64')
      RNFS.unlink(tempPath).catch(() => {})
      console.log(`[metadata] cover downloaded: ${base64.length} bytes, mime=${mime}`)
      return { base64, mime }
    }
    console.log(`[metadata] cover download failed: status=${result.statusCode}`)
    return null
  } catch (e) {
    console.log('[metadata] cover download error:', e)
    return null
  }
}

// syncsafe整数转换
function syncsafeToInt(buffer: Buffer): number {
  return (
    (buffer[0] << 21) |
    (buffer[1] << 14) |
    (buffer[2] << 7) |
    buffer[3]
  )
}

function intToSyncsafe(num: number): Buffer {
  const bytes = Buffer.alloc(4)
  bytes[0] = (num >> 21) & 0x7f
  bytes[1] = (num >> 14) & 0x7f
  bytes[2] = (num >> 7) & 0x7f
  bytes[3] = num & 0x7f
  return bytes
}

// 秒 -> mm:ss.xx（增强LRC词时间戳，百分之一秒）
function fmtEnhancedTime(t: number): string {
  let v = Number(t)
  if (!isFinite(v) || v < 0) v = 0
  const m = Math.floor(v / 60)
  const sec = Math.floor(v % 60)
  const cs = Math.floor((v - Math.floor(v)) * 100)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(m)}:${pad(sec)}.${pad(cs)}`
}

// 逐字歌词转“增强LRC”：行时间戳 + 每词 <mm:ss.xx> 时间戳；不支持逐字的播放器会按普通LRC显示
export function buildEnhancedLrc(lines: WordLyricLine[]): string {
  const out: string[] = []
  for (const ln of lines) {
    const head = `[${fmtEnhancedTime(ln.time)}]`
    let body = Array.isArray(ln.words) && ln.words.length
      ? ln.words.map((w) => `<${fmtEnhancedTime(w.start)}>${w.text || ''}`).join('')
      : ''
    if (!body.trim()) body = ln.lrc || ''
    if (body.trim()) out.push(head + body)
  }
  return out.join('\n')
}

// 获取用于内嵌的歌词：优先逐字（增强LRC），该歌曲没有逐字时回退普通LRC
export async function fetchLyrics(
  song: IMusic.IMusicItem,
): Promise<string | null> {
  // 1) 优先逐字歌词（网易云YRC / QQ的QRC / 酷狗KRC）
  try {
    const wordLines = await fetchWordLyricFor(song as any)
    if (wordLines && wordLines.length > 0) {
      const enhanced = buildEnhancedLrc(wordLines)
      if (enhanced.trim()) {
        console.log(`[metadata] word-by-word lyrics embedded: ${wordLines.length} lines`)
        return enhanced
      }
    }
  } catch (e) {
    console.log('[metadata] word lyric unavailable, fallback to lrc:', e)
  }
  // 2) 回退普通歌词
  try {
    const result = await myGetLyric(song as any)
    const lrc = result?.lyric
    if (lrc && lrc.trim() && !lrc.includes('暂无歌词')) {
      console.log(`[metadata] normal lyrics embedded: ${lrc.length} chars`)
      return lrc
    }
    return null
  } catch (e) {
    console.log('[metadata] fetchLyrics failed:', e)
    return null
  }
}
