// 从歌曲对象中稳健提取歌手名列表（每名歌手一项），供各长按菜单生成「查看歌手」项
export const extractSingerNames = (item: any): string[] => {
	const t = item || {}
	const seen = new Set<string>()
	const push = (v: any): string | null => {
		const n = String(v || '').trim()
		if (n && !n.includes('未知') && !seen.has(n)) {
			seen.add(n)
			return n
		}
		return null
	}
	const out: string[] = []
	// 1) 数组字段：singers/singer/artists/ar/artistList/singerList/artistIds
	const arrFields = [t?.singers, t?.singer, t?.artists, t?.ar, t?.artistList, t?.singerList, t?.artistIds]
	for (const field of arrFields) {
		if (!Array.isArray(field)) continue
		let got = false
		for (const it of field) {
			if (it === null || it === undefined) continue
			if (typeof it === 'object') {
				const n = push(it?.name || it?.title || it?.artist || it?.singerName || it?.singer_name || it?.artistName)
				if (n) { out.push(n); got = true }
			} else {
				const n = push(it)
				if (n) { out.push(n); got = true }
			}
		}
		if (got) break
	}
	// 2) 字符串字段兜底：artist / singer / singerName / artistName / singer_name
	if (out.length === 0) {
		for (const sf of [t?.artist, t?.singer, t?.singerName, t?.artistName, t?.singer_name]) {
			if (typeof sf === 'string' && sf.trim()) {
				const parts = String(sf).split(/\s*[\/、,，&;；]\s*/).map((x) => x.trim()).filter(Boolean)
				for (const p of parts) {
					const n = push(p)
					if (n) out.push(n)
				}
				break
			}
		}
	}
	return out.slice(0, 3)
}

import { resolveTrackBySearch, detectTrackPlatform } from '@/helpers/userApi/resolveTrackBySearch'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'

const _norm = (s: any) => String(s || '').replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '').toLowerCase()

// 校验歌手 mid 是否真实可用（排除 netease_0 / kugou_0 / netease_undefined 等假 ID）
export const isValidSingerMid = (mid: any): boolean => {
	const m = String(mid || '').trim()
	if (!m) return false
	if (/(_0|_undefined|null|_nan)$/i.test(m)) return false
	const idPart = m.split(/::/)[0].split('_').pop() || ''
	if (!idPart) return false
	// 若 ID 部分整体是纯数字，须 > 0
	if (/^\d+$/.test(idPart) && Number(idPart) <= 0) return false
	return true
}

// 查看歌手：优先同平台搜歌精确定位该歌曲 -> 拿到准确歌手ID；回退按歌手名查；再兜底按名字跳
export async function navigateToSinger(router: any, track: any, singerName: string): Promise<void> {
	const platform = detectTrackPlatform(track)
	const doNav = (mid: string | null, nm: string) => {
		try {
			if (mid) router.navigate('/(modals)/' + mid)
			else router.navigate('/(modals)/' + encodeURIComponent(nm) + '?platform=' + platform)
		} catch (e) {
			console.error('导航到歌手页面失败:', e)
		}
	}
	try {
		const resolved: any = await resolveTrackBySearch(track)
		const singers: any[] = (resolved?.singers || []).filter((s: any) => s && s.name && isValidSingerMid(s.mid))
		const matched = singers.find((s) => _norm(s.name) === _norm(singerName))
		if (matched?.mid) {
			doNav(matched.mid, matched.name || singerName)
			return
		}
		const mid = await getSingerMidBySingerName(singerName, platform).catch(() => null)
		doNav(isValidSingerMid(mid) ? mid : null, singerName)
		return
	} catch (e) {
		const mid = await getSingerMidBySingerName(singerName, platform).catch(() => null)
		doNav(isValidSingerMid(mid) ? mid : null, singerName)
		return
	}
}