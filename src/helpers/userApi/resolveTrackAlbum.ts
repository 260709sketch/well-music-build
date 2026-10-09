import { getNeteaseAlbumIdBySongId, searchNeteaseMusic } from '@/helpers/userApi/netease-music-api'
import { searchKugouMusic } from '@/helpers/userApi/kugou-music-api'
import { searchKuwoMusic } from '@/helpers/userApi/kuwo-music-api'
import { searchWithKeyword } from '@/helpers/userApi/qq-music-api'
import { detectTrackPlatform } from '@/helpers/userApi/resolveTrackBySearch'

type Plat = 'netease' | 'kugou' | 'kuwo' | 'qq'

const pickAlbumMid = (t: any): string =>
	t.albumMid || t.albummid || t.albumId || t.album_mid || t.album_id || t.albumid || ''

// 校验专辑路由 mid 是否真实可用（排除空 / undefined / 0 / nan 等假 ID）
const validAlbumMid = (s: string): boolean => {
	if (!s) return false
	const body = String(s).replace(/^(netease_album_|kugou_album_|kuwo_album_)/, '')
	const lastSeg = body.split('::')[0].split('_').pop() || ''
	if (!lastSeg || /^(undefined|null|nan|0)$/i.test(lastSeg)) return false
	if (/^\d+$/.test(lastSeg) && Number(lastSeg) <= 0) return false
	return true
}

// 自带专辑 ID 只接受「前缀与本平台匹配」或「QQ 裸 albummid」
const validForPlat = (s: string, plat: Plat): boolean => {
	if (!validAlbumMid(s)) return false
	if (!/^(netease_album_|kugou_album_|kuwo_album_)/.test(s)) return plat === 'qq'
	if (plat === 'netease') return s.startsWith('netease_album_')
	if (plat === 'kugou') return s.startsWith('kugou_album_')
	if (plat === 'kuwo') return s.startsWith('kuwo_album_')
	return false
}

const pickup = (o: any, keys: string[]): any => {
	for (const k of keys) {
		const v = o?.[k]
		if (v !== undefined && v !== null && String(v) !== '') return v
	}
	return ''
}

const keywordOf = (t: any): string | null => {
	const name = String(t.title || t.name || '').trim()
	if (!name) return null
	const artist = String(t.artist || t.singer || '').split(/[/、;&·-]/)[0]?.trim() || ''
	return artist ? `${name} ${artist}` : name
}

/**
 * 根据歌曲对象解析「本平台」可跳转的专辑路由 mid。
 * 各平台严格分开：优先歌曲自带本平台专辑ID，其次本平台搜索命中；
 * 绝不跨平台兜底（避免 QQ 歌跳到 netease_0 等错乱页）。
 * 返回 null 表示无法定位（调用方提示「暂无专辑信息」）。
 */
export async function resolveTrackAlbum(track: any): Promise<string | null> {
	const t = track || {}
	const plat: Plat = (detectTrackPlatform(t) as Plat) || 'qq'

	// 1. 歌曲自带本平台专辑 ID（假 ID / 错平台一律跳过）
	const own = pickAlbumMid(t)
	if (own && validForPlat(own, plat)) return own

	const keyword = keywordOf(t)
	if (!keyword) return null

	// 2. 本平台搜索命中的专辑（各平台分开）
	try {
		if (plat === 'netease') {
			const songId = String(t.id || t.songmid || '').replace(/^(netease_|wy_)/, '')
			if (songId) {
				const albumId = await getNeteaseAlbumIdBySongId(songId)
				if (albumId && validAlbumMid('netease_album_' + albumId)) return 'netease_album_' + albumId
			}
			const res: any = await searchNeteaseMusic(keyword)
			const list: any[] = (res && res.data) || []
			const artistL = String(t.artist || t.singer || '').toLowerCase()
			const hit =
				list.find((s: any) => s.albumId && validAlbumMid('netease_album_' + s.albumId) &&
					(!artistL || String(s.artist || '').toLowerCase().includes(artistL))) ||
				list.find((s: any) => s.albumId && validAlbumMid('netease_album_' + s.albumId))
			if (hit) return 'netease_album_' + hit.albumId
		} else if (plat === 'kugou') {
			const res: any = await searchKugouMusic(keyword)
			const list: any[] = (res && res.data) || []
			const hit = list.find((s: any) => validAlbumMid('kugou_album_' + pickup(s, ['album_id', 'albumid'])))
			if (hit) return 'kugou_album_' + pickup(hit, ['album_id', 'albumid'])
		} else if (plat === 'kuwo') {
			const res: any = await searchKuwoMusic(keyword)
			const list: any[] = (res && res.data) || []
			const hit = list.find((s: any) => validAlbumMid('kuwo_album_' + pickup(s, ['albumid', 'album_id'])))
			if (hit) {
				const albumId = pickup(hit, ['albumid', 'album_id'])
				return `kuwo_album_${albumId}::${encodeURIComponent(hit.album || hit.albumname || '')}`
			}
		} else {
			const list: any[] = (await searchWithKeyword(keyword, 0, 30)) || []
			const hit = list.find((s: any) => validAlbumMid('qq_' + pickup(s, ['albummid'])))
			if (hit) return String(pickup(hit, ['albummid']))
		}
	} catch (e) {
		// 搜索失败 → 无法定位，交由调用方提示
	}
	return null
}