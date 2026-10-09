/**
 * 逐字歌词获取与解析
 * 兜底顺序：
 *   网易云歌曲            -> 网易云 YRC
 *   QQ 音乐歌曲           -> QQ 原生 QRC（最准） -> 跨平台网易 YRC -> 酷狗逐字
 *   酷狗歌曲              -> 酷狗 KRC/QRC -> 跨平台网易 YRC
 *   酷我/漫游/其他平台     -> 跨平台网易 YRC -> 酷狗逐字
 * 都没有则返回 null，由调用方回退逐行 LRC。时间单位统一为秒。
 */
import 'fast-text-encoding' // Hermes 缺少 TextEncoder/TextDecoder，先 polyfill
import CryptoJS from 'crypto-js'
import { inflate, inflateRaw } from 'pako'
import { parseYrc } from '@applemusic-like-lyrics/lyric'
import { searchNeteaseMusic, getNeteaseWordLyricRaw } from './netease-music-api'
import { decryptQqQrc } from './qqQrcDecrypt'

export interface WordToken {
	start: number // 秒（绝对）
	end: number // 秒（绝对）
	text: string
}

export interface WordLyricLine {
	time: number // 行开始（秒）
	end: number // 行结束（秒）
	lrc: string
	words: WordToken[]
}

// 简单内存缓存，避免同一首歌重复请求；null 也缓存，避免反复尝试
const cache = new Map<string, WordLyricLine[] | null>()

function keyOf(item: any): string {
	return `${item.platform || item.source || 'x'}://${item.id || item.songmid || item.title}_${item.artist || ''}`
}

function decodeEntities(s: string): string {
	return (s || '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&#(\d+);/g, (_m, d) => String.fromCharCode(Number(d)))
		.replace(/&amp;/g, '&')
}

// ---------------- 网易云 YRC ----------------

function parseYrcText(yrc: string): WordLyricLine[] | null {
	if (!yrc || !yrc.trim()) return null
	try {
		const amllLines = parseYrc(yrc)
		const out: WordLyricLine[] = []
		for (const ln of amllLines as any[]) {
			const rawWords = ln.words || []
			if (rawWords.length <= 1) continue
			const tokens: WordToken[] = []
			for (const w of rawWords) {
				const text = w.word ?? ''
				const s = (w.startTime ?? 0) / 1000
				const e = (w.endTime ?? w.startTime ?? 0) / 1000
				tokens.push({ start: s, end: Math.max(e, s + 0.02), text })
			}
			const lrc = tokens.map((t) => t.text).join('')
			if (!lrc.trim()) continue
			out.push({
				time: (ln.startTime ?? 0) / 1000,
				end: (ln.endTime ?? tokens[tokens.length - 1].end * 1000) / 1000,
				lrc,
				words: tokens,
			})
		}
		return out.length ? out : null
	} catch (e) {
		console.warn('[wordLyric] YRC 解析失败', e)
		return null
	}
}

async function fetchNeteaseYrc(songId: string): Promise<WordLyricLine[] | null> {
	const raw = await getNeteaseWordLyricRaw(songId)
	return parseYrcText(raw)
}

function normText(s?: string): string {
	return (s || '').toLowerCase().replace(/[\s'"\-·.、,，()（）[\]【】]/g, '')
}

async function matchNeteaseId(title: string, artist: string, durationSec?: number): Promise<string | null> {
	let songs: any[] = []
	try {
		const res: any = await searchNeteaseMusic(artist ? `${artist} ${title}` : title, 1, 10)
		songs = res?.data || []
	} catch {
		songs = []
	}
	if (!songs.length) {
		try {
			const res2: any = await searchNeteaseMusic(title, 1, 10)
			songs = res2?.data || []
		} catch {
			songs = []
		}
	}
	if (!songs.length) return null

	const artistN = normText(artist)
	const titleN = normText(title)
	let best = songs[0]
	let bestScore = -Infinity
	for (const s of songs) {
		let score = 0
		if (artistN && normText(s.artist).includes(artistN)) score += 10
		if (titleN && normText(s.title) === titleN) score += 6
		if (durationSec && s.duration) {
			const diff = Math.abs(Number(s.duration) - Number(durationSec))
			if (diff <= 2) score += 20
			else if (diff <= 5) score += 8
			else score -= diff
		}
		if (score > bestScore) {
			bestScore = score
			best = s
		}
	}
	return best?.id ? String(best.id) : null
}

// ---------------- QQ 音乐 QRC（原生逐字，最准） ----------------

/**
 * 解析 QQ QRC 文本（解密后的 LyricContent）：
 *   [行开始ms,行时长ms]字(绝对开始ms,字时长ms)字(绝对ms,时长ms)...
 * 注意：QQ 括号里第一个数是【绝对】毫秒，不是相对行偏移。
 */
function parseQqQrcText(text: string): WordLyricLine[] | null {
	if (!text) return null
	try {
		const out: WordLyricLine[] = []
		const lineRe = /\[(-?\d+),-?\d+\]([^\r\n]*)/g
		let lm: RegExpExecArray | null
		while ((lm = lineRe.exec(text)) !== null) {
			const lineStart = Math.max(0, parseInt(lm[1], 10))
			const body = lm[2]
			const tokens: WordToken[] = []
			const wRe = /([^()\r\n]*?)\((-?\d+),(-?\d+)\)/g
			let wm: RegExpExecArray | null
			while ((wm = wRe.exec(body)) !== null) {
				const t = wm[1] ?? ''
				const abs = parseInt(wm[2], 10)
				const dur = parseInt(wm[3], 10)
				const start = Math.max(0, abs) / 1000
				const end = start + Math.max(0, dur) / 1000
				tokens.push({ start, end: Math.max(end, start + 0.02), text: t })
			}
			const lrc = tokens.map((x) => x.text).join('').trim()
			if (!lrc || tokens.length === 0) continue
			out.push({ time: lineStart / 1000, end: tokens[tokens.length - 1].end, lrc, words: tokens })
		}
		return out.length ? out : null
	} catch (e) {
		console.warn('[wordLyric] QRC 解析失败', e)
		return null
	}
}

async function fetchQqWord(musicItem: any): Promise<WordLyricLine[] | null> {
	try {
		let mid = String(musicItem.songmid || '').trim()
		if (!mid || /^netease_/i.test(mid)) {
			const id = String(musicItem.id || '').replace(/^qq_/i, '')
			if (id && /[A-Za-z]/.test(id)) mid = id
		}
		if (!mid) return null
		const param: any = { qrc: 1, qrc_t: 0, roma: 1, guoke: 1, type: -1, licenseID: '', cp: 0, cv: 0, ct: 19 }
		if (/[A-Za-z]/.test(mid)) param.songmid = mid
		else param.songID = Number(mid)
		const body = {
			comm: { uin: 0, format: 1, ct: 19, cv: 0 },
			detail: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param },
		}
		const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
			method: 'POST',
			headers: {
				'User-Agent': 'QQMusic 14090508(android 12)',
				'Content-Type': 'application/json',
				Referer: 'https://y.qq.com/',
			},
			body: JSON.stringify(body),
		})
		const json: any = await res.json()
		const d = json?.detail?.data
		if (!d || Number(d.qrc) !== 1 || !d.lyric || typeof d.lyric !== 'string') return null
		return parseQqQrcText(decryptQqQrc(d.lyric))
	} catch (e) {
		console.warn('[wordLyric] QQ逐字获取失败', e)
		return null
	}
}

// ---------------- 酷狗 KRC / QRC 文本 ----------------

function base64ToBytes(b64: string): Uint8Array {
	const wa = CryptoJS.enc.Base64.parse(b64)
	const words = wa.words
	const sig = wa.sigBytes
	const u8 = new Uint8Array(sig)
	for (let i = 0; i < sig; i++) {
		u8[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff
	}
	return u8
}

// 酷狗官方（flash 反编译）16 字节异或密钥，含两个 >127 的字节
const KUGOU_KEY = [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69]

function decryptKugou(b64: string): string | null {
	try {
		let bytes = base64ToBytes(b64)
		if (bytes.length >= 4 && bytes[0] === 0x6b && bytes[1] === 0x72 && bytes[2] === 0x63 && bytes[3] === 0x31) {
			bytes = bytes.slice(4)
		}
		for (let i = 0; i < bytes.length; i++) {
			bytes[i] ^= KUGOU_KEY[i % 16]
		}
		try {
			return new TextDecoder('utf-8').decode(inflate(bytes) as any)
		} catch {
			return new TextDecoder('utf-8').decode(inflateRaw(bytes) as any)
		}
	} catch (e) {
		console.warn('[wordLyric] 酷狗逐字解密失败', e)
		return null
	}
}

function parseKrcXml(xml: string): WordLyricLine[] | null {
	if (!xml || xml.indexOf('<line') < 0) return null
	try {
		const out: WordLyricLine[] = []
		const lineRe = /<line\b[^>]*\bstartTime="(-?\d+)"[^>]*>([\s\S]*?)<\/line>/g
		let lm: RegExpExecArray | null
		while ((lm = lineRe.exec(xml)) !== null) {
			const lineStart = Math.max(0, parseInt(lm[1], 10))
			const inner = lm[2]
			const tokens: WordToken[] = []
			let cursor = lineStart
			const wordRe = /<word\b[^>]*?\/?>/g
			let wm: RegExpExecArray | null
			while ((wm = wordRe.exec(inner)) !== null) {
				const tag = wm[0]
				const cMatch = /\bcontent="([^"]*)"/.exec(tag)
				const dMatch = /\bduration="(\d+)"/.exec(tag)
				const content = decodeEntities(cMatch ? cMatch[1] : '')
				const dur = dMatch ? parseInt(dMatch[1], 10) : 0
				const start = cursor
				const end = cursor + (dur > 0 ? dur : 200)
				tokens.push({ start: start / 1000, end: end / 1000, text: content })
				cursor = end
			}
			const lrc = tokens.map((t) => t.text).join('').trim()
			if (!lrc || tokens.length === 0) continue
			out.push({ time: lineStart / 1000, end: cursor / 1000, lrc, words: tokens })
		}
		return out.length ? out : null
	} catch (e) {
		console.warn('[wordLyric] KRC XML 解析失败', e)
		return null
	}
}

/**
 * 解析酷狗「krc转qrc」文本：
 *   [行开始ms,行时长ms]<相对偏移ms,字时长ms,0>字<偏移,时长,0>字...
 * 注意：酷狗尖括号里第一个数是【相对行】的偏移（与 QQ 不同）。
 */
function parseWordedQrcText(text: string): WordLyricLine[] | null {
	if (!text) return null
	try {
		const out: WordLyricLine[] = []
		const lineRe = /\[(-?\d+),-?\d+\]([^\r\n]*)/g
		let lm: RegExpExecArray | null
		while ((lm = lineRe.exec(text)) !== null) {
			const lineStart = Math.max(0, parseInt(lm[1], 10))
			const body = lm[2]
			const tokens: WordToken[] = []
			const wRe = /<(-?\d+),(-?\d+)(?:,-?\d+)?>([^<]*)/g
			let wm: RegExpExecArray | null
			while ((wm = wRe.exec(body)) !== null) {
				const off = parseInt(wm[1], 10)
				const dur = parseInt(wm[2], 10)
				const t = decodeEntities(wm[3] ?? '')
				const start = (lineStart + Math.max(0, off)) / 1000
				const end = start + Math.max(0, dur) / 1000
				tokens.push({ start, end: Math.max(end, start + 0.02), text: t })
			}
			const lrc = tokens.map((t) => t.text).join('').trim()
			if (!lrc || tokens.length === 0) continue
			out.push({ time: lineStart / 1000, end: tokens[tokens.length - 1].end, lrc, words: tokens })
		}
		return out.length ? out : null
	} catch (e) {
		console.warn('[wordLyric] 酷狗 QRC 文本解析失败', e)
		return null
	}
}

function parseKugouContent(content: string): WordLyricLine[] | null {
	return parseKrcXml(content) || parseWordedQrcText(content)
}

async function fetchKugouWord(title: string, artist: string, durationSec?: number): Promise<WordLyricLine[] | null> {
	try {
		const keyword = artist ? `${artist} - ${title}` : title
		const durMs = durationSec ? Math.round(Number(durationSec) * 1000) : 0
		const headers = {
			'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
			Referer: 'https://www.kugou.com/',
		}
		const searchUrl =
			`https://krcs.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(keyword)}` +
			`&duration=${durMs}&hash=&album_audio_id=&track=${encodeURIComponent(title)}` +
			`&singer=${encodeURIComponent(artist || '')}&lossless=1&correct=1`
		let sjson: any
		try {
			sjson = await (await fetch(searchUrl, { headers })).json()
		} catch {
			sjson = null
		}
		let candidates: any[] = sjson?.candidates || []
		if (!candidates.length) {
			const u2 = `https://krcs.kugou.com/search?ver=1&man=yes&client=pc&keyword=${encodeURIComponent(
				title,
			)}&duration=${durMs}&hash=&album_audio_id=&lossless=1`
			sjson = await (await fetch(u2, { headers })).json()
			candidates = sjson?.candidates || []
		}
		if (!candidates.length) return null

		let cand = candidates[0]
		if (durMs) {
			let bestDiff = Infinity
			for (const c of candidates) {
				const diff = Math.abs(Number(c.duration || 0) - durMs)
				if (diff < bestDiff) {
					bestDiff = diff
					cand = c
				}
			}
		}
		const dlUrl = `https://lyrics.kugou.com/download?ver=1&client=pc&id=${cand.id}&accesskey=${encodeURIComponent(
			cand.accesskey,
		)}&fmt=krc&charset=utf8`
		const djson: any = await (await fetch(dlUrl, { headers })).json()
		if (djson?.status !== 200 || !djson.content) return null
		if (djson.fmt && djson.fmt !== 'krc') return null
		const content = decryptKugou(djson.content)
		if (!content) return null
		return parseKugouContent(content)
	} catch (e) {
		console.warn('[wordLyric] 酷狗逐字获取失败', e)
		return null
	}
}

/** 主入口：为任意平台歌曲获取逐字歌词；拿不到返回 null（调用方回退逐行 LRC） */
export async function fetchWordLyricFor(musicItem: any): Promise<WordLyricLine[] | null> {
	if (!musicItem || !musicItem.title) return null
	const ck = keyOf(musicItem)
	if (cache.has(ck)) return cache.get(ck) || null

	const title: string = musicItem.title || ''
	const artist: string = musicItem.artist || ''
	const durationSec: number | undefined = musicItem.duration || undefined
	const platform = musicItem.platform || musicItem.source || ''

	let result: WordLyricLine[] | null = null
	try {
		if (platform === 'netease' || platform === 'wy') {
			const neteaseId =
				String(musicItem.id || '').replace('netease_', '') || String(musicItem.originalId || '')
			if (neteaseId && neteaseId !== 'undefined') result = await fetchNeteaseYrc(neteaseId)
		} else {
			// 1) 平台原生逐字（最准）
			if (platform === 'qq') result = await fetchQqWord(musicItem)
			if (!result && platform === 'kugou') result = await fetchKugouWord(title, artist, durationSec)
			// 2) 跨平台借网易云 YRC（曲库全、稳定）
			if (!result) {
				const nid = await matchNeteaseId(title, artist, durationSec)
				if (nid) result = await fetchNeteaseYrc(nid)
			}
			// 3) 再借酷狗逐字
			if (!result && platform !== 'kugou') result = await fetchKugouWord(title, artist, durationSec)
		}
	} catch (e) {
		console.warn('[wordLyric] 获取逐字歌词失败', e)
		result = null
	}

	cache.set(ck, result)
	return result
}

/** 去掉空白，用于按字数判断逐字段是否已经覆盖整句 */
function normLyricText(s?: string): string {
	return (s || '').replace(/\s/g, '')
}

/**
 * 为某一条“逐行 LRC”聚合匹配逐字（YRC/QRC/KRC）字符。
 *
 * 背景：逐字数据里一句很长的歌词经常被拆成多段（每段一个行起点），而逐行
 * LRC 仍是一句完整的话。旧逻辑只取“时间最近的一段”，于是长句在高亮切换成
 * 逐字渲染时只剩几个字（换行前显示十几个字、换行后只剩几个字）。
 *
 * 做法：取当前行时间窗 [lineTime, nextLineTime) 内的所有逐字段，按时间排序
 * 后把它们的字（时间是绝对的，直接拼接）合并；并用逐行文本字数做保护，
 * 累计覆盖整句后即停止，避免把下一句开头的段误并进来。窗口内拿不到时回退
 * “时间最近的一段”，兼容逐字行与逐行行一一对应的歌曲。
 */
export function matchWordsForLine(
	wordLines: WordLyricLine[] | null | undefined,
	lineTime: number,
	nextLineTime?: number,
	lineText?: string,
): WordToken[] | undefined {
	if (!Array.isArray(wordLines) || wordLines.length === 0) return undefined
	const targetLen = lineText ? normLyricText(lineText).length : 0

	if (
		typeof nextLineTime === 'number' &&
		isFinite(nextLineTime) &&
		nextLineTime > lineTime
	) {
		const inWindow = wordLines
			.filter(
				(wl) =>
					wl &&
					typeof wl.time === 'number' &&
					wl.time >= lineTime - 0.4 &&
					wl.time < nextLineTime,
			)
			.sort((a, b) => a.time - b.time)

		if (inWindow.length > 0) {
			const picked: WordLyricLine[] = []
			let accLen = 0
			for (const wl of inWindow) {
				picked.push(wl)
				if (targetLen > 0) {
					accLen += normLyricText(wl.lrc).length
					if (accLen >= targetLen) break
				}
			}
			const merged: WordToken[] = []
			for (const wl of picked) {
				if (Array.isArray(wl.words)) merged.push(...wl.words)
			}
			if (merged.length > 0) return merged
		}
	}

	// 兜底：时间最近的一段
	let best = wordLines[0]
	let minDiff = Math.abs(lineTime - (best.time ?? 0))
	for (const wl of wordLines) {
		const d = Math.abs(lineTime - (wl.time ?? 0))
		if (d < minDiff) {
			minDiff = d
			best = wl
		}
	}
	return minDiff < 1.5 && best.words && best.words.length > 0 ? best.words : undefined
}
