import { searchNeteaseMusic } from '@/helpers/userApi/netease-music-api'
import { searchKugouMusic } from '@/helpers/userApi/kugou-music-api'
import { searchKuwoMusic } from '@/helpers/userApi/kuwo-music-api'
import { searchWithKeyword } from '@/helpers/userApi/qq-music-api'

export interface ResolvedSinger {
	name: string
	// 可用于导航的歌手 mid（酷狗/酷我为 null，需按名字再查歌手）
	mid: string | null
}

export interface ResolvedTrackResult {
	// 平台前缀化的专辑路由 mid，可直接用于跳转；null 表示未定位到
	albumMid: string | null
	singers: ResolvedSinger[]
}

interface Candidate {
	title: string
	artist: string
	albumMid: string | null
	singers: ResolvedSinger[]
}

// 归一化：只保留字母数字与中文，用于宽松匹配
const norm = (s: any) => String(s || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase()

// 校验平台 ID 是否真实可用（排除空值、0、undefined 等假 ID / 假 mid）
const isValidId = (id: any): boolean => {
	const m = String(id || '').trim()
	if (!m) return false
	const lastSeg = m.split(/::/)[0].split('_').pop() || ''
	if (!lastSeg || /^(undefined|null|nan|0)$/i.test(lastSeg)) return false
	return true
}

export const detectTrackPlatform = (t: any): string => {
	const platform = String(t?.platform || t?.source || 'qq').toLowerCase()
	const idStr = String(t?.songmid || t?.id || '')
	if (platform.includes('netease') || platform === 'wy' || idStr.startsWith('netease_') || idStr.startsWith('wy_')) return 'netease'
	if (platform.includes('kugou') || platform === 'kg' || idStr.startsWith('kugou_') || idStr.startsWith('kg_')) return 'kugou'
	if (platform.includes('kuwo') || platform === 'kw' || idStr.startsWith('kuwo_') || idStr.startsWith('kw_')) return 'kuwo'
	return 'qq'
}

const extractPrimaryArtist = (t: any): string => {
	const raw = String(t?.artist || t?.singer || t?.artistName || '')
	const primary = raw.split(/[/、;&·-]/)[0]?.trim() || ''
	return primary && !primary.includes('未知') ? primary : ''
}

const pickBest = (items: Candidate[], titleNorm: string, artistNorm: string): Candidate | null => {
	let best: Candidate | null = null
	let bestScore = -1
	for (const it of items) {
		let score = 0
		const tNorm = norm(it.title)
		if (titleNorm) {
			if (tNorm === titleNorm) score += 10
			else if (tNorm && tNorm.includes(titleNorm)) score += 4
		}
		if (artistNorm) {
			const aNorm = norm(it.artist)
			if (aNorm === artistNorm) score += 8
			else if (aNorm && aNorm.includes(artistNorm)) score += 3
		}
		if (score > bestScore) {
			bestScore = score
			best = it
		}
	}
	return bestScore > 0 ? best : null
}

/**
 * 在歌曲所属平台用「歌名 + 主歌手」后台搜索，取最匹配的一条，
 * 返回可跳转的专辑 mid 与歌手信息（比依赖歌曲自带的不完整 ID 更准确）。
 * 无法定位返回 null。
 */
export async function resolveTrackBySearch(track: any): Promise<ResolvedTrackResult | null> {
	const t = track || {}
	const platform = detectTrackPlatform(t)
	const title = String(t.title || t.name || '').trim()
	if (!title) return null
	const primaryArtist = extractPrimaryArtist(t)
	const keyword = primaryArtist ? `${title} ${primaryArtist}` : title
	const titleNorm = norm(title)
	const artistNorm = primaryArtist ? norm(primaryArtist) : ''

	let candidates: Candidate[] = []
	try {
		if (platform === 'netease') {
			const res: any = await searchNeteaseMusic(keyword)
			const list: any[] = (res && res.data) || []
			candidates = list.map((s) => ({
				title: s.title || s.name || '',
				artist: s.artist || '',
				albumMid: s.albumId && isValidId(s.albumId) ? `netease_album_${s.albumId}` : null,
				singers: Array.isArray(s.artistIds)
					? s.artistIds
						.filter((a: any) => a && isValidId(a.id))
						.map((a: any) => ({ name: a.name || '', mid: a.id }))
					: [],
			}))
		} else if (platform === 'kugou') {
			const res: any = await searchKugouMusic(keyword)
			const list: any[] = (res && res.data) || []
			candidates = list.map((s) => ({
				title: s.title || '',
				artist: s.artist || '',
				albumMid: isValidId(s.album_id) ? `kugou_album_${s.album_id}` : null,
				singers: s.artist ? [{ name: s.artist, mid: null }] : [],
			}))
		} else if (platform === 'kuwo') {
			const res: any = await searchKuwoMusic(keyword)
			const list: any[] = (res && res.data) || []
			candidates = list.map((s) => ({
				title: s.title || '',
				artist: s.artist || '',
				albumMid: s.albumid && isValidId(s.albumid) ? `kuwo_album_${s.albumid}::${encodeURIComponent(s.album || '')}` : null,
				singers: s.artist ? [{ name: s.artist, mid: null }] : [],
			}))
		} else {
			const list: any[] = (await searchWithKeyword(keyword, 0, 30)) || []
			candidates = list.map((s) => ({
				title: s.songname || s.title || '',
				artist: Array.isArray(s.singer) ? s.singer.map((x: any) => x.name || '').join(' / ') : '',
				albumMid: isValidId(s.albummid) ? s.albummid : null,
				singers: Array.isArray(s.singer)
					? s.singer
						.filter((x: any) => x && isValidId(x.mid || x.id))
						.map((x: any) => ({ name: x.name || '', mid: x.mid || x.id }))
					: [],
			}))
		}
	} catch (e) {
		// 搜索失败，交由调用方兜底
		return null
	}

	const best = pickBest(candidates, titleNorm, artistNorm)
	if (!best) return null
	if (!titleNorm || norm(best.title) === titleNorm) {
		return {
			albumMid: best.albumMid || null,
			singers: best.singers || [],
		}
	}
	return null
}