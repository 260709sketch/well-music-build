/**
 * AMLL 歌词解析适配器
 * 使用 @applemusic-like-lyrics/lyric 解析歌词，转换为应用内部格式
 * 时间单位：AMLL用毫秒，内部用秒
 */
import 'fast-text-encoding' // Hermes 缺少 TextEncoder，先 polyfill
import { parseLrc, parseYrc, type LyricLine } from '@applemusic-like-lyrics/lyric'
import type { WordLyricLine } from '@/helpers/userApi/wordLyric'

export interface AmllParsedLine {
  time: number // 秒
  lrc: string
  index: number
  words?: { start: number; end: number; text: string }[] // 逐词（秒）
  translatedLyric?: string
}

export interface AmllParseResult {
  lines: AmllParsedLine[]
  translationLines: AmllParsedLine[]
  rawAmllLines: LyricLine[]
  hasWordLevel: boolean
}

/** 判断是否为YRC格式（网易云逐词） */
function isYrcFormat(text: string): boolean {
  return /^\[\d+,\d+\]/.test(text.trim())
}

/** 将AMLL LyricLine[] 转换为内部格式 */
function convertAmllLines(amllLines: LyricLine[]): AmllParsedLine[] {
  return amllLines.map((line, idx) => {
    const fullText = line.words.map((w) => w.word).join('')
    return {
      time: line.startTime / 1000,
      lrc: fullText,
      index: idx,
      translatedLyric: line.translatedLyric || undefined,
      words:
        line.words.length > 1
          ? line.words.map((w) => ({
              start: w.startTime / 1000,
              end: w.endTime / 1000,
              text: w.word,
            }))
          : undefined,
    }
  })
}

/**
 * 用AMLL解析歌词
 * @param rawLrc 原始歌词文本（LRC或YRC）
 * @param rawTranslation 翻译歌词文本（LRC）
 */
export function parseLyricsWithAMLL(
  rawLrc: string,
  rawTranslation?: string,
): AmllParseResult {
  if (!rawLrc || !rawLrc.trim()) {
    return { lines: [], translationLines: [], rawAmllLines: [], hasWordLevel: false }
  }

  let amllLines: LyricLine[] = []
  let hasWordLevel = false

  try {
    if (isYrcFormat(rawLrc)) {
      amllLines = parseYrc(rawLrc)
      hasWordLevel = amllLines.some((l) => l.words.length > 1)
    } else {
      amllLines = parseLrc(rawLrc)
    }
  } catch (e) {
    console.warn('[AMLL] 解析失败，降级为空:', e)
    return { lines: [], translationLines: [], rawAmllLines: [], hasWordLevel: false }
  }

  // 排序并修复重叠
  amllLines.sort((a, b) => a.startTime - b.startTime)
  for (let i = 0; i < amllLines.length - 1; i++) {
    if (amllLines[i].endTime > amllLines[i + 1].startTime) {
      amllLines[i].endTime = amllLines[i + 1].startTime
    }
  }

  const lines = convertAmllLines(amllLines)

  // 解析翻译
  let translationLines: AmllParsedLine[] = []
  if (rawTranslation && rawTranslation.trim()) {
    try {
      const transAmll = parseLrc(rawTranslation)
      transAmll.sort((a, b) => a.startTime - b.startTime)
      translationLines = convertAmllLines(transAmll)
    } catch (e) {
      console.warn('[AMLL] 翻译解析失败:', e)
    }
  }

  return { lines, translationLines, rawAmllLines: amllLines, hasWordLevel }
}

/**
 * 根据当前时间获取当前歌词行索引（二分查找）
 */
export function findCurrentLineIndex(
  lines: AmllParsedLine[],
  currentTime: number,
): number {
  if (!lines || lines.length === 0) return -1
  if (currentTime < lines[0].time) return -1

  let lo = 0
  let hi = lines.length - 1
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1
    if (lines[mid].time <= currentTime) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return lo
}

/**
 * 用“逐字（YRC/QRC/KRC）行”构建歌词显示行，作为歌词列表的唯一权威。
 *
 * 为什么需要它：逐行 LRC 的行时间戳是人工/听感校准，常常比真实人声偏早
 * （实测英文说唱每句偏早 0.6~0.8s）。若高亮行按 LRC 行时间切换、逐字扫光却
 * 按 YRC 词时间点亮，就会出现“一行逐字还没扫完（尤其折行后的第二行）就被
 * 切到下一行”、以及“歌词和人声对不上”。逐字数据里行起点、行结束、行内每个
 * 词的时间彼此同源，直接用它构建显示行可保证：
 *   - 当前行严格按真实人声时间切换；
 *   - 行内逐字在本行的时间窗内完整扫完后才换行；
 *   - 顺带剔除逐行 LRC 里“歌名/专辑 + 歌词”误拼一类的脏行。
 * 没有可用逐字数据时返回 null，由调用方回退到逐行 LRC。
 */
export function buildLinesFromWordLyric(
  wordLines: WordLyricLine[] | null | undefined,
): AmllParsedLine[] | null {
  if (!Array.isArray(wordLines) || wordLines.length === 0) return null
  const lines: AmllParsedLine[] = []
  for (let i = 0; i < wordLines.length; i++) {
    const l = wordLines[i]
    if (!l || !Array.isArray(l.words) || l.words.length === 0) continue
    const joined = l.lrc || l.words.map((w) => w.text).join('')
    if (!joined || !joined.trim()) continue
    lines.push({
      time: l.time,
      lrc: joined,
      index: lines.length,
      words: l.words.map((w) => ({ start: w.start, end: w.end, text: w.text })),
    })
  }
  return lines.length > 0 ? lines : null
}
