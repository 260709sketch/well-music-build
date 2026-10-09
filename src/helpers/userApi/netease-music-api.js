// 网易云音乐官方搜索 API
// 搜索接口：https://music.163.com/api/cloudsearch/pc
// LX Music 音源中网易云平台标识为 'kw'

import { weapiBody, eapiBody, buildEapiHeader } from './neteaseCrypto'
import CryptoJS from 'crypto-js'
import QRCode from 'qrcode'

// 带超时的 fetch 封装
const fetchWithTimeout = (url, options, timeout = 5000) => {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => {
			reject(new Error('Request timed out'))
		}, timeout)

		fetch(url, options)
			.then((response) => {
				clearTimeout(timer)
				resolve(response)
			})
			.catch((error) => {
				clearTimeout(timer)
				reject(error)
			})
	})
}

const PAGE_SIZE = 20

// 格式化网易云歌曲为项目 IMusicItem 格式
function formatNeteaseSong(item) {
	const artists = (item.ar || []).map((a) => a.name).join(' / ')
	const artistIds = (item.ar || []).map((a) => ({ name: a.name, id: `netease_${a.id}` }))
	const albumName = item.al?.name || item.album?.name || ''
	const albumId = item.al?.id || item.album?.id || ''
	const picUrl = item.al?.picUrl || item.album?.picUrl || ''
	// 发行时间：优先取歌曲 publishTime，其次取专辑 publishTime，转成年份
	let year = ''
	const publishTime = item.publishTime || item.al?.publishTime || item.album?.publishTime
	if (publishTime) {
		try {
			const date = new Date(publishTime)
			if (!isNaN(date.getFullYear())) {
				year = String(date.getFullYear())
			}
		} catch (e) {
			// 忽略时间解析错误
		}
	}

	return {
		// LX Music 音源需要的字段
		id: String(item.id), // 歌曲原始ID
		platform: 'netease', // 网易云平台标识
		title: item.name,
		artist: artists,
		artistIds: artistIds,
		album: albumName,
		artwork: picUrl,
		url: '', // 播放时由音源解析
		duration: item.dt ? Math.floor(item.dt / 1000) : 0,
		// 额外字段
		albumId: String(albumId),
		albumMid: albumId ? `netease_album_${albumId}` : '',
		songmid: `netease_${item.id}`, // 编码平台前缀，供内置音源判断
		originalId: item.id,
		source: 'netease',
		year: year, // 发行年份
	}
}

// eapi 请求（网易云新接口）
async function eapiRequest(apiPath, params) {
	const body = eapiBody(apiPath, params)
	const response = await fetch('https://interface.music.163.com/eapi/batch', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
			'origin': 'https://music.163.com',
		},
		body,
	})
	return response.json()
}

// 英文查询转首字母大写（网易云对小写英文搜索结果少）
function normalizeQuery(query) {
	if (/^[a-z0-9\s]+$/.test(query)) {
		return query.replace(/\b\w/g, (c) => c.toUpperCase())
	}
	return query
}

// 单次搜索请求
async function doNeteaseSearch(keyword, page, pageSize) {
	const offset = (page - 1) * pageSize
	let data = await eapiRequest('/api/search/song/list/page', {
		keyword,
		needCorrect: '1',
		channel: 'typing',
		offset,
		scene: 'normal',
		total: page === 1,
		limit: pageSize,
	})
	// 兼容 batch 包裹格式
	if (data && !data.code && !data.data) {
		const keys = Object.keys(data)
		if (keys.length === 1 && data[keys[0]]?.code) {
			data = data[keys[0]]
		}
	}
	return data
}

// 搜索歌曲（新接口 /api/search/song/list/page）
export async function searchNeteaseMusic(query, page = 1, pageSize = PAGE_SIZE) {
	const offset = (page - 1) * pageSize
	// 主接口：eapi搜索，2.5s超时；首字母大写补充搜索并发启动，不阻塞首屏结果
	const normalized0 = normalizeQuery(query)
	const secondaryPromise = (page === 1 && normalized0 !== query)
		? doNeteaseSearch(normalized0, page, pageSize).catch(() => null)
		: null
	let data = null
	try {
		data = await Promise.race([
			doNeteaseSearch(query, page, pageSize),
			new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500))
		])
	} catch (e) {
		console.log('[网易云歌曲搜索] 主接口超时/失败，走备用weapi:', e.message)
	}
	// 备用接口：weapi /weapi/search/get type=1
	if (!data || data.code !== 200 || !data.data) {
		try {
			const weapiBodyData = weapiBody({
				s: query, type: 1, offset, limit: pageSize, total: page === 1,
			})
			const weapiResp = await fetchWithTimeout('https://music.163.com/weapi/search/get?csrf_token=', {
				method: 'POST',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Referer': 'https://music.163.com/',
					'Content-Type': 'application/x-www-form-urlencoded',
					'origin': 'https://music.163.com',
				},
				body: weapiBodyData,
			}, 3000)
			const weapiData = await weapiResp.json()
			if (weapiData.code === 200 && weapiData.result) {
				const weapiSongs = weapiData.result.songs || []
				const formatted = weapiSongs.map(formatNeteaseSong)
				const total = weapiData.result.songCount || 0
				console.log('[网易云歌曲搜索] weapi备用成功，返回', formatted.length, '首')
				return { data: formatted, hasMore: offset + formatted.length < total }
			}
		} catch (e) {
			console.error('[网易云歌曲搜索] weapi备用也失败:', e.message)
		}
		return { data: [], hasMore: false }
	}

	try {
		let resources = data.data.resources || []
		let songs = resources.map((item) => item.baseInfo?.simpleSongData || item).filter(Boolean)
		let total = data.data.totalCount || 0

		// 第一页且纯英文小写时，用首字母大写再搜一次合并（小写输入也能返回更多结果）
		const normalized = normalizeQuery(query)
		if (page === 1 && normalized !== query) {
			try {
				const data2 = await secondaryPromise
				if (data2.code === 200 && data2.data) {
					const resources2 = data2.data.resources || []
					const songs2 = resources2.map((item) => item.baseInfo?.simpleSongData || item).filter(Boolean)
					// 按 songmid 去重合并
					const seen = new Set(songs.map((s) => String(s.id)))
					for (const s of songs2) {
						if (!seen.has(String(s.id))) {
							songs.push(s)
							seen.add(String(s.id))
						}
					}
					total = Math.max(total, data2.data.totalCount || songs.length)
				}
			} catch (e) {
				console.log('大写补充搜索失败:', e.message)
			}
		}

		const formattedSongs = songs.map(formatNeteaseSong)
		const hasMore = total > 0 ? offset + songs.length < total : songs.length >= pageSize

		return {
			data: formattedSongs,
			hasMore,
		}
	} catch (error) {
		console.error('网易云搜索失败:', error)
		return { data: [], hasMore: false }
	}
}

// 搜索歌手
export async function searchNeteaseArtist(query, page = 1, pageSize = PAGE_SIZE) {
	const offset = (page - 1) * pageSize
	const formatArtists = (artists) => artists.map((artist) => ({
		id: `netease_${artist.id}`,
		platform: 'netease',
		title: artist.name,
		artist: artist.name,
		artwork: artist.img1v1Url || artist.picUrl || '',
		isArtist: true,
		source: 'netease',
		singerMid: `netease_${artist.id}`,
	}))
	// 主接口：明文cloudsearch，2.5s超时
	try {
		const url = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=100&offset=${offset}&total=true&limit=${pageSize}`
		const response = await fetchWithTimeout(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				Referer: 'https://music.163.com/',
			},
		}, 2500)
		const data = await response.json()
		if (data.code === 200 && data.result) {
			const artists = data.result.artists || []
			return { data: formatArtists(artists), hasMore: artists.length === pageSize }
		}
	} catch (e) {
		console.log('[网易云歌手搜索] 主接口超时/失败，走备用eapi:', e.message)
	}
	// 备用接口：LX同款eapi cloudsearch
	try {
		const eapiData = await eapiRequest('/api/cloudsearch/pc', {
			s: query, type: 100, limit: pageSize, total: page === 1, offset,
		})
		if (eapiData && eapiData.code === 200 && eapiData.result) {
			const artists = eapiData.result.artists || []
			return { data: formatArtists(artists), hasMore: artists.length === pageSize }
		}
	} catch (e) {
		console.error('[网易云歌手搜索] 备用eapi也失败:', e.message)
	}
	return { data: [], hasMore: false }
}

// 搜索专辑
export async function searchNeteaseAlbum(query, page = 1, pageSize = PAGE_SIZE) {
	const offset = (page - 1) * pageSize
	const url = `https://music.163.com/api/cloudsearch/pc?s=${encodeURIComponent(query)}&type=10&offset=${offset}&total=true&limit=${pageSize}`

	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				'Referer': 'https://music.163.com/',
			},
		})
		const data = await response.json()

		if (data.code !== 200 || !data.result) {
			return { data: [], hasMore: false }
		}

		const albums = data.result.albums || []
		const formattedAlbums = albums.map((album) => ({
			 id: `netease_album_${album.id}`,
			 platform: 'netease',
			 title: album.name,
			 artist: (album.artist || {}).name || (album.artists || []).map(a => a.name).join(' / '),
			 artwork: album.picUrl || album.blurPicUrl || '',
			 isAlbum: true,
			 source: 'netease',
			 albumMid: `netease_album_${album.id}`,
			 public_time: album.publishTime || album.publicTime || '',
			 songCount: album.size || 0,
		}))

		return {
			 data: formattedAlbums,
			 hasMore: albums.length === pageSize,
		}
	} catch (error) {
		console.error('网易云专辑搜索失败:', error)
		return { data: [], hasMore: false }
	}
}

// 修复网易云歌词时间戳格式：[mm:ss:cc] -> [mm:ss.cc]
function fixNeteaseTimeLabel(lrc) {
	if (!lrc) return ''
	return lrc.replace(/\[(\d{2}:\d{2}):(\d{2})]/g, '[$1.$2]')
}


// 翻译时间戳对齐主歌词（LX fixTimeTag 逻辑，100ms 容差）
function alignTranslation(mainLrc, transLrc) {
	if (!mainLrc || !transLrc) return transLrc || ''
	const timeRxp = /^\[([\d:.]+)\]/
	const parseMs = (t) => {
		const parts = t.split(/[:.]/)
		while (parts.length < 3) parts.unshift('0')
		return parseInt(parts[0]) * 60000 + parseInt(parts[1]) * 1000 + parseInt((parts[2] || '0').padEnd(3, '0'))
	}
	const mainLines = mainLrc.split('\n').filter(l => timeRxp.test(l))
	const transLines = transLrc.split('\n').filter(l => timeRxp.test(l))
	const mainTimes = mainLines.map(l => parseMs(timeRxp.exec(l)[1]))
	const result = []
	for (const tLine of transLines) {
		const tMatch = timeRxp.exec(tLine)
		if (!tMatch) continue
		const tTime = parseMs(tMatch[1])
		const words = tLine.replace(timeRxp, '').trim()
		if (!words) continue
		// 找最接近的主歌词时间
		let closest = mainTimes[0]
		let minDiff = Math.abs(tTime - closest)
		for (const mt of mainTimes) {
			const diff = Math.abs(tTime - mt)
			if (diff < minDiff) { minDiff = diff; closest = mt }
		}
		const ms = closest % 1000
		const totalSec = Math.floor(closest / 1000)
		const m = Math.floor(totalSec / 60).toString().padStart(2, '0')
		const s = (totalSec % 60).toString().padStart(2, '0')
		result.push(`[${m}:${s}.${ms.toString().padStart(3, '0')}]${words}`)
	}
	return result.join('\n')
}

// 获取网易云歌词
export async function getNeteaseLyric(songId) {
	try {
		const url = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(songId)}&lv=1&kv=1&tv=-1`
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
				'Referer': 'https://music.163.com/',
			},
		})
		const data = await response.json()

		if (data.code !== 200) {
			return { lrc: '', tlyric: '' }
		}

		const lrc = data.lrc?.lyric ? fixNeteaseTimeLabel(data.lrc.lyric) : ''

		// 翻译：时间戳对齐主歌词
		let tlyric = data.tlyric?.lyric ? fixNeteaseTimeLabel(data.tlyric.lyric) : ''
		if (tlyric) {
			tlyric = tlyric.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
			tlyric = alignTranslation(lrc, tlyric)
		}

		return { lrc, tlyric }
	} catch (error) {
		console.error('网易云歌词获取失败:', error)
		return { lrc: '', tlyric: '' }
	}
}


// 获取网易云逐字歌词（YRC 原文）；无逐字时返回空字符串
export async function getNeteaseWordLyricRaw(songId) {
	try {
		const url = `https://music.163.com/api/song/lyric?id=${encodeURIComponent(songId)}&lv=1&kv=1&tv=-1&yv=1`
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
				'Referer': 'https://music.163.com/',
			},
		})
		const data = await response.json()
		if (data.code !== 200) return ''
		return (data.yrc && data.yrc.lyric) || ''
	} catch (error) {
		console.error('网易云逐字歌词获取失败:', error)
		return ''
	}
}


// 酷狗搜索（改用 complexsearch API，更稳定）
export async function searchKugouMusic(query, page = 1, pageSize = PAGE_SIZE) {
	const url = `https://complexsearch.kugou.com/v2/search/song?callback=callback&keyword=${encodeURIComponent(query)}&page=${page}&pagesize=${pageSize}&bitrate=0&isfuzzy=0&inputtype=0&platform=WebFilter&userid=-1&clientver=2000&iscorrection=1&privilege_filter=0&filter=10&token=&appid=1014&clienttime=${Date.now()}&mid=1&uuid=1&dfid=2&signature=`
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				'Referer': 'https://www.kugou.com/',
			},
		})
		const text = await response.text()
		// 解析 JSONP：去除 callback( 和 )
		const jsonMatch = text.match(/^callback\((.*)\)$/)
		const data = jsonMatch ? JSON.parse(jsonMatch[1]) : JSON.parse(text)

		if (data.status !== 1 || !data.data || !data.data.lists) {
			console.log('[kugou] 搜索返回异常:', data.status)
			return { data: [], hasMore: false }
		}

		const songs = data.data.lists || []
		console.log(`[kugou] 搜索到 ${songs.length} 首`)

		const formattedSongs = songs.map((item) => ({
			id: `kugou_${item.FileHash || ''}`,
			platform: 'kg',
			source: 'kugou',
			title: item.SongName || '',
			artist: (item.SingerName || '').replace(/&/g, ' / '),
			album: item.AlbumName || '',
			// 保留酷狗专辑ID：查看专辑直接跳转（getAlbumSongList 接收 kugou_album_ 前缀）
			albumId: item.AlbumID ? String(item.AlbumID) : '',
			albumMid: item.AlbumID ? `kugou_album_${item.AlbumID}` : '',
			artwork: item.AlbumID ? `https://imge.kugou.com/stdmusic/200x200/${item.AlbumID}.jpg` : '',
			duration: item.Duration || 0,
			songmid: `kugou_${item.FileHash || ''}`,
			originalId: item.ID || '',
		}))

		const hasMore = data.data.total > page * pageSize
		return { data: formattedSongs, hasMore }
	} catch (error) {
		console.error('酷狗搜索失败:', error)
		return { data: [], hasMore: false }
	}
}

// 酷我搜索
export async function searchKuwoMusic(query, page = 1, pageSize = PAGE_SIZE) {
	const url = `https://search.kuwo.cn/r.s?client=kt&all=${encodeURIComponent(query)}&pn=${page - 1}&rn=${pageSize}&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
	try {
		const response = await fetch(url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
		})
		const data = await response.json()
		if (!data.abslist || data.abslist.length === 0) {
			return { data: [], hasMore: false }
		}
		const formattedSongs = data.abslist.map((item) => {
			// 正确提取封面字段
			let artwork = item.web_albumpic_short || item.albumpic || item.pic || item.hts_PICPATH || ''
			// 如果是相对路径，补全
			if (artwork && !artwork.startsWith('http')) {
				artwork = `https://img4.kuwo.cn/star/albumcover/300/${artwork}`
			}
			return {
				id: String(item.DC_TARGETID || item.musicid || ''),
				platform: 'kw',
				title: item.SONGNAME || item.name || '',
				artist: (item.ARTIST || item.artist || '').replace(/&/g, ' / '),
				album: item.ALBUM || item.album || '',
				artwork,
				duration: item.DURATION ? parseInt(item.DURATION, 10) : 0,
				source: 'kuwo',
				songmid: `kuwo_${item.DC_TARGETID || item.musicid || ''}`,
				originalId: item.DC_TARGETID || '',
			}
		})
		const hasMore = data.total ? data.total > page * pageSize : data.abslist.length === pageSize
		return { data: formattedSongs, hasMore }
	} catch (error) {
		console.error('酷我搜索失败:', error)
		return { data: [], hasMore: false }
	}
}

// 网易云播放地址获取
export async function getNeteaseMusicUrl(songId, quality = 'standard') {
	const qualityMap = {
		standard: 128000,
		higher: 192000,
		exhigh: 320000,
		lossless: 999000,
	}
	const br = qualityMap[quality] || 128000
	const url = `https://music.163.com/api/song/enhance/player/url?id=${songId}&ids=%5B${songId}%5D&br=${br}`

	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				Referer: 'https://music.163.com/',
			},
		})
		const data = await response.json()

		if (data.code === 200 && data.data && data.data[0] && data.data[0].url) {
			return data.data[0].url
		}
		return null
	} catch (error) {
		console.error('网易云播放地址获取失败:', error)
		return null
	}
}

// ============================================================
// 网易云歌单
// ============================================================

/**
 * 从分享文本中提取第一个 URL（兼容「歌单名 + 链接 + (@网易云音乐)」的分享格式）
 */
function extractUrlFromText(text) {
	if (!text) return null
	const m = String(text).match(/https?:\/\/[^\s，。；;、（）()」】]+/i)
	if (!m) return null
	return m[0].replace(/[.,，。;；)）（(]+$/, '')
}

/**
 * 从网易云歌单链接/分享文本中提取 ID（同步版）
 * 注意：163cn.tv 等短链需要请求落地页才能拿到真实 ID，请用 resolveNeteasePlaylistId
 */
export function extractNeteasePlaylistId(url) {
	if (!url) return null
	const text = String(url).trim()
	if (/^\d+$/.test(text)) return text
	const candidate = extractUrlFromText(text) || text
	const match = candidate.match(/[?&]id=(\d+)/)
	if (match) return match[1]
	const pathMatch = candidate.match(/playlist\/(\d+)/)
	if (pathMatch) return pathMatch[1]
	return null
}

/**
 * 兼容各种网易云分享格式提取歌单 ID（异步版）
 * 支持：纯数字ID、music.163.com / y.music.163.com / m.music.163.com 各路径、
 * 163cn.tv 短链（请求落地页解析真实 ID）、以及「歌单名+链接+(@网易云音乐)」完整分享文本
 */
export async function resolveNeteasePlaylistId(input) {
	if (!input) return null
	const text = String(input).trim()
	const directId = extractNeteasePlaylistId(text)
	if (directId) return directId
	const url = extractUrlFromText(text)
	if (!url) return null
	try {
		const resp = await fetchWithTimeout(
			url,
			{
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
					'Referer': 'https://music.163.com/',
					'Accept': 'text/html',
				},
			},
			10000,
		)
		const html = await resp.text()
		const idMatch = html.match(/[?&]id=(\d+)/)
		if (idMatch) return idMatch[1]
		const pathMatch = html.match(/playlist\/(\d+)/)
		if (pathMatch) return pathMatch[1]
		const jsonMatch = html.match(/"playlistId"\s*:\s*(\d+)/)
		if (jsonMatch) return jsonMatch[1]
	} catch (e) {
		console.log('网易云短链解析失败:', e)
	}
	return null
}

/**
 * 批量获取网易云歌曲详情
 * 每批100首，避免请求过快
 */
export async function getNeteaseSongsDetail(songIds, cookie) {
	if (!songIds || songIds.length === 0) return []
	if (!cookie) cookie = ''

	var allSongs = []
	var batchSize = 100

	for (var i = 0; i < songIds.length; i += batchSize) {
		var batchIds = songIds.slice(i, i + batchSize)
		var idsStr = batchIds.join(',')
		var cParam = batchIds.map(function(id) { return '{"id":' + id + '}' }).join(',')
		var url = 'https://music.163.com/api/v3/song/detail?ids=[' + idsStr + ']&c=[' + cParam + ']&timestamp=' + Date.now()
		try {
			var headers = {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
				'Referer': 'https://music.163.com/',
				'Accept': 'application/json',
			}
			if (cookie) headers['Cookie'] = cookie
			var response = await fetch(url, { headers: headers })
			var data = await response.json()
			if (data.songs) {
				for (var j = 0; j < data.songs.length; j++) {
					allSongs.push(data.songs[j])
				}
			}
		} catch (error) {
			console.log('批量获取歌曲详情失败:', error)
		}
		if (i + batchSize < songIds.length) {
			await new Promise(function(resolve) { setTimeout(resolve, 200) })
		}
	}

	return allSongs
}

/**
 * 获取网易云歌单详情（含歌曲列表）
 * 使用 /api/v6/playlist/detail 获取歌单基本信息和 trackIds
 * 然后批量获取完整歌曲详情
 */
export async function getNeteasePlaylistMeta(playlistId, cookie) {
	if (!cookie) cookie = ''
	var id = String(playlistId || '')
	var numMatch = id.match(/\d+/)
	if (numMatch) id = numMatch[0]
	if (!id) throw new Error('无法提取歌单ID')
	const headers = {
		'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
		'Referer': 'https://music.163.com/',
		'Accept': 'application/json',
	}
	if (cookie) headers['Cookie'] = cookie
	try {
		const detailUrl = 'https://music.163.com/api/v6/playlist/detail?id=' + id + '&n=1&timestamp=' + Date.now()
		const response = await fetch(detailUrl, { headers: headers })
		const data = await response.json()
		if (data.code === 200 && data.playlist) {
			const p = data.playlist
			return {
				platform: 'netease',
				name: p.name || '',
				title: p.name || '',
				artist: p.creator ? p.creator.nickname : '',
				creatorAvatar: p.creator ? (p.creator.avatarUrl || '') : '',
				artwork: p.coverImgUrl || '',
				description: p.description || '',
				playCount: p.playCount || 0,
			}
		}
	} catch (e) {
		console.error('[网易云歌单meta] 获取失败:', e)
	}
	return {}
}

export async function getNeteasePlaylistDetail(playlistId, cookie) {
	if (!cookie) cookie = ''
	var id = String(playlistId || '')
	var numMatch = id.match(/\d+/)
	if (numMatch) id = numMatch[0]
	if (!id) throw new Error('无法提取歌单ID')

	const headers = {
		'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
		'Referer': 'https://music.163.com/',
		'Accept': 'application/json',
	}
	if (cookie) headers['Cookie'] = cookie

	// 方法1: v6 API
	try {
		const detailUrl = 'https://music.163.com/api/v6/playlist/detail?id=' + id + '&n=10000&timestamp=' + Date.now()
		const response = await fetch(detailUrl, { headers: headers })
		const data = await response.json()
		if (data.code === 200 && data.playlist) {
			const playlist = data.playlist
			const trackIds = (playlist.trackIds || []).map(function(t) { return t.id })
			let allTracks = []
			if (trackIds.length > 0) {
				allTracks = await getNeteaseSongsDetail(trackIds, cookie)
			}
			const songs = allTracks.map(function(track) {
				const artists = track.ar || track.artists || []
				const album = track.al || track.album || {}
				return {
					id: String(track.id),
					songmid: 'netease_' + track.id,
					platform: 'netease',
					source: 'netease',
					title: track.name || '',
					artist: artists.map(function(a) { return a.name }).join(' / '),
					artistIds: artists.map(function(a) { return { name: a.name, id: 'netease_' + a.id } }),
					album: album.name || '',
					albumId: album.id ? String(album.id) : '',
					albumMid: album.id ? 'netease_album_' + album.id : '',
					artwork: album.picUrl || album.pic_str || '',
					duration: track.dt ? Math.floor(track.dt / 1000) : 0,
					url: '',
					originalId: String(track.id),
				}
			})
			return {
				id: 'netease_playlist_' + id,
				platform: 'netease',
				name: playlist.name || '网易云歌单',
				title: playlist.name || '网易云歌单',
				artist: playlist.creator ? playlist.creator.nickname : '网易云',
				creatorAvatar: playlist.creator ? (playlist.creator.avatarUrl || '') : '',
				artwork: playlist.coverImgUrl || '',
				description: playlist.description || '',
				playCount: playlist.playCount || 0,
				trackCount: trackIds.length,
				songs: songs,
				tracks: songs,
				neteasePlaylistId: id,
				lastRefreshTime: Date.now(),
			}
		}
	} catch (e) {
		console.log('[netease] v6 API 失败:', e.message)
	}

	// 方法2: 旧版 API
	try {
		const oldUrl = 'https://music.163.com/api/playlist/detail?id=' + id + '&timestamp=' + Date.now()
		const response = await fetch(oldUrl, { headers: headers })
		const data = await response.json()
		if (data.code === 200 && data.result) {
			const playlist = data.result
			const allTracks = playlist.tracks || []
			const songs = allTracks.map(function(track) {
				const artists = track.ar || track.artists || []
				const album = track.al || track.album || {}
				return {
					id: String(track.id),
					songmid: 'netease_' + track.id,
					platform: 'netease',
					source: 'netease',
					title: track.name || '',
					artist: artists.map(function(a) { return a.name }).join(' / '),
					artistIds: artists.map(function(a) { return { name: a.name, id: 'netease_' + a.id } }),
					album: album.name || '',
					albumId: album.id ? String(album.id) : '',
					albumMid: album.id ? 'netease_album_' + album.id : '',
					artwork: album.picUrl || album.pic_str || '',
					duration: track.dt ? Math.floor(track.dt / 1000) : (track.duration ? Math.floor(track.duration / 1000) : 0),
					url: '',
					originalId: String(track.id),
				}
			})
			return {
				id: 'netease_playlist_' + id,
				platform: 'netease',
				name: playlist.name || '网易云歌单',
				title: playlist.name || '网易云歌单',
				artist: playlist.creator ? playlist.creator.nickname : '网易云',
				creatorAvatar: playlist.creator ? (playlist.creator.avatarUrl || '') : '',
				artwork: playlist.coverImgUrl || '',
				description: playlist.description || '',
				playCount: playlist.playCount || 0,
				trackCount: allTracks.length,
				songs: songs,
				tracks: songs,
				neteasePlaylistId: id,
				lastRefreshTime: Date.now(),
			}
		}
	} catch (e) {
		console.log('[netease] 旧版 API 失败:', e.message)
	}

	throw new Error('所有API均获取歌单失败')
}

// 统一的网易云歌曲对象映射（首屏/分批加载复用）
function mapNeteaseTracks(tracks) {
	return (tracks || []).map(function (track) {
		const artists = track.ar || track.artists || []
		const album = track.al || track.album || {}
		const albumId = album.id ? String(album.id) : ''
		return {
			id: String(track.id),
			songmid: 'netease_' + track.id,
			platform: 'netease',
			source: 'netease',
			title: track.name || '',
			artist: artists.map(function (a) { return a.name }).join(' / '),
			artistIds: artists.map(function (a) { return { name: a.name, id: 'netease_' + a.id } }),
			album: album.name || '',
			// 保留专辑ID：查看专辑直接跳转（对齐 Kumone 结构化 album.id 方案），无需反查
			albumId: albumId,
			albumMid: albumId ? 'netease_album_' + albumId : '',
			artwork: album.picUrl || album.pic_str || '',
			duration: track.dt ? Math.floor(track.dt / 1000) : (track.duration ? Math.floor(track.duration / 1000) : 0),
			url: '',
			originalId: String(track.id),
		}
	})
}

// 首屏快载：只取前面 limit 首（用 v6 内嵌的完整歌曲对象），几秒返回，方便秒开
export async function getNeteasePlaylistFirstSongs(playlistId, cookie, limit) {
	if (!cookie) cookie = ''
	var id = String(playlistId || '')
	var numMatch = id.match(/\d+/)
	if (numMatch) id = numMatch[0]
	if (!id) throw new Error('无法提取歌单ID')
	if (!limit || limit <= 0) limit = 30
	const headers = {
		'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
		'Referer': 'https://music.163.com/',
		'Accept': 'application/json',
	}
	if (cookie) headers['Cookie'] = cookie
	try {
		const url = 'https://music.163.com/api/v6/playlist/detail?id=' + id + '&n=' + limit + '&timestamp=' + Date.now()
		const response = await fetch(url, { headers: headers })
		const data = await response.json()
		if (data.code === 200 && data.playlist) {
			const p = data.playlist
			const tracks = p.tracks || []
			const trackIds = (p.trackIds || []).map(function (t) { return t.id })
			return {
				songs: mapNeteaseTracks(tracks),
				trackIds: trackIds,
				trackCount: trackIds.length || p.trackCount || tracks.length,
				name: p.name || '',
				title: p.name || '',
				artist: p.creator ? p.creator.nickname : '',
				creatorAvatar: p.creator ? (p.creator.avatarUrl || '') : '',
				artwork: p.coverImgUrl || '',
				description: p.description || '',
			}
		}
	} catch (e) {
		console.error('[网易云歌单首屏] 失败:', e)
	}
	throw new Error('首屏加载失败')
}

// 分页加载更多：从 offset 开始取 count 首
export async function getNeteasePlaylistMoreSongs(playlistId, trackIds, offset, count, cookie) {
	if (!count || count <= 0) count = 60
	if (!cookie) cookie = ''
	if (!Array.isArray(trackIds) || !trackIds.length) return []
	const batch = trackIds.slice(offset, offset + count)
	if (!batch.length) return []
	const raw = await getNeteaseSongsDetail(batch, cookie)
	if (Array.isArray(raw)) return mapNeteaseTracks(raw)
	if (raw && raw.songs) return mapNeteaseTracks(raw.songs)
	return mapNeteaseTracks(raw && raw.items || [])
}
export async function refreshNeteasePlaylist(playlistId, cookie) {
	return getNeteasePlaylistDetail(playlistId, cookie)
}

// ============================================================
// 网易云登录（二维码）
// ============================================================

const NETEASE_BASE = 'https://music.163.com'
// 对齐 Kumone 的 User-Agent（Mac Chrome 125），减少风控特征差异
const KUMONE_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
// 公共 NeteaseCloudMusicApi 服务（用于二维码登录等需要加密的接口）
const NETEASE_API_BASE = 'https://netease-cloud-music-api-five-roan-88.vercel.app'

// 存储网易云 cookie
let neteaseCookie = ''

/**
 * 从当前 cookie 中提取 __csrf token
 */
function getCsrfToken() {
	try {
		const m = neteaseCookie.match(/__csrf\s*=\s*([^;]+)/)
		return m ? m[1].trim() : ''
	} catch (e) {
		return ''
	}
}

/**
 * 构造带 csrf_token 的 weapi 请求体（对齐 Kumone）。
 * 关键：csrf_token 必须在加密 payload 内部，网易云解密后会校验；
 * 只在 URL 上加 csrf_token 不够，会导致二维码确认后一直返回 802。
 */
function weapiBodyWithCsrf(params) {
	const csrf = getCsrfToken()
	return weapiBody({ ...params, csrf_token: csrf })
}

/**
 * 构造带 os/appver 的完整 Cookie 头（对齐 Kumone）。
 */
function buildCookieHeader() {
	const extra = 'os=pc; appver=3.1.17'
	return neteaseCookie ? `${neteaseCookie}; ${extra}` : extra
}

/**
 * 先访问网易云首页获取 cookie
 */
async function getNeteaseCookie() {
	try {
		const response = await fetch(`${NETEASE_BASE}/`, {
			headers: {
				'User-Agent': KUMONE_UA,
				Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
				'Accept-Language': 'zh-CN,zh;q=0.9',
			},
		})
		// 用完整提取函数拿所有 Set-Cookie（NMTID、__csrf 等），二维码登录必须带全
		const full = extractFullCookieFromResponse(response)
		if (full) {
			neteaseCookie = full
			console.log('[网易云二维码] 获取到cookie:', neteaseCookie.substring(0, 80))
		}
		return neteaseCookie
	} catch (error) {
		console.error('[网易云二维码] 获取cookie失败:', error)
		return ''
	}
}

/**
 * 生成二维码登录 key
 */
export async function generateLoginKey() {
	try {
		// 对齐 Kumone：每次生成新二维码前重置 cookie，第一次请求时 cookie 为空（只有 os=pc; appver=3.1.17），
		// 网易云在 unikey 响应头里返回 Set-Cookie（NMTID、__csrf 等），后续轮询携带此会话 cookie。
		// 不要预先访问首页获取 cookie，那会导致会话特征与 Kumone 不一致，触发风控拦截。
		neteaseCookie = ''
		// 使用 kumone 同款 weapi 加密接口，csrf_token 必须在加密 payload 内（此时 csrf 为空）
		const weapiBodyData = weapiBodyWithCsrf({ type: 1 })
		const url = `${NETEASE_BASE}/weapi/login/qrcode/unikey`
		const response = await fetch(url, {
			method: 'POST',
			credentials: 'omit',
			headers: {
				'User-Agent': KUMONE_UA,
				Referer: `${NETEASE_BASE}`,
				'Content-Type': 'application/x-www-form-urlencoded',
				Cookie: buildCookieHeader(),
			},
			body: weapiBodyData,
		})
		// 从 unikey 响应中提取 Set-Cookie（NMTID、__csrf 等），保存为会话 cookie
		const respCookie = extractFullCookieFromResponse(response)
		if (respCookie) {
			neteaseCookie = respCookie
			console.log('[网易云二维码] 从unikey响应获取cookie:', neteaseCookie.substring(0, 100))
		}
		const data = await response.json()
		console.log('[网易云二维码] key API返回:', JSON.stringify(data).substring(0, 300))
		if (data.code === 200 && data.unikey) {
			return data.unikey
		}
		console.log('[网易云二维码] key失败')
		return null
	} catch (error) {
		console.error('生成登录key失败:', error)
		return null
	}
}

/**
 * 生成二维码图片（返回 base64 data URL）
 */
export async function getQRCodeImage(key) {
	try {
		// 对齐 Kumone：二维码内容是这个 URL，本地用 qrcode 库生成（M 级容错，和 CIFilter 一致）
		const qrUrl = `https://music.163.com/login?codekey=${key}`
		const dataUrl = await QRCode.toDataURL(qrUrl, {
			errorCorrectionLevel: 'M',
			margin: 4,
			width: 240,
		})
		console.log('[网易云二维码] 本地生成二维码成功')
		return dataUrl
	} catch (error) {
		console.error('生成二维码图片失败:', error)
		return null
	}
}

/**
 * 从 fetch 响应中提取所有 Set-Cookie 并拼接为完整 cookie 字符串
 * React Native 的 response.headers.get('set-cookie') 只能拿到第一个，
 * 必须遍历 entries 收集全部，否则扫码登录后 MUSIC_U 丢失导致登录无效。
 */
function extractFullCookieFromResponse(response) {
	const cookies = []
	try {
		// 遍历所有响应头，收集每一个 set-cookie
		for (const [key, value] of response.headers.entries()) {
			if (key.toLowerCase() === 'set-cookie' && value) {
				// Set-Cookie 格式: name=value; expires=...; path=/; ...
				// 只取第一个分号前的 name=value
				const firstPart = value.split(';')[0].trim()
				if (firstPart && firstPart.includes('=')) {
					cookies.push(firstPart)
				}
			}
		}
	} catch (e) {
		console.error('[网易云登录] 遍历响应头失败:', e)
	}
	// 如果遍历没拿到，回退到 get
	if (cookies.length === 0) {
		try {
			const raw = response.headers.get('set-cookie') || response.headers.get('Set-Cookie') || ''
			if (raw) {
				// 可能是多个用逗号拼接的（注意 expires 里也有逗号，只提取 name=value）
				const matches = raw.match(/([A-Za-z0-9_\-]+=[^;,\s]+)/g)
				if (matches) {
					for (const m of matches) {
						if (!m.toLowerCase().startsWith('expires=') &&
							!m.toLowerCase().startsWith('path=') &&
							!m.toLowerCase().startsWith('domain=') &&
							!m.toLowerCase().startsWith('max-age=') &&
							!m.toLowerCase().startsWith('samesite=')) {
							cookies.push(m)
						}
					}
				} else {
					cookies.push(raw.split(';')[0].trim())
				}
			}
		} catch (e) {
			console.error('[网易云登录] 回退提取 cookie 失败:', e)
		}
	}
	return cookies.join('; ')
}

/**
 * 检查登录状态
 * 返回：{ code: 800/801/802/803, cookie, message }
 * 800: 二维码不存在或已过期
 * 801: 等待扫码
 * 802: 扫码成功，等待确认
 * 803: 登录成功
 */
export async function checkLoginStatus(key) {
	try {
		// 使用 kumone 同款 weapi 加密接口
		// csrf_token 必须在加密 payload 内（对齐 Kumone），否则确认后一直返回 802
		const weapiBodyData = weapiBodyWithCsrf({ key, type: 1 })
		const csrf = getCsrfToken()
		// 对齐 Kumone：有 csrf 才在 URL 后加 ?csrf_token=，没有就不加
		const url = csrf ? `${NETEASE_BASE}/weapi/login/qrcode/client/login?csrf_token=${csrf}` : `${NETEASE_BASE}/weapi/login/qrcode/client/login`
		const response = await fetch(url, {
			method: 'POST',
			credentials: 'omit',
			headers: {
				'User-Agent': KUMONE_UA,
				Referer: `${NETEASE_BASE}`,
				'Content-Type': 'application/x-www-form-urlencoded',
				Cookie: buildCookieHeader(),
			},
			body: weapiBodyData,
		})
		// 从响应头获取**所有** Set-Cookie（登录成功时通过 Set-Cookie 返回 MUSIC_U 等凭证）
		const fullCookie = extractFullCookieFromResponse(response)
		// 每次轮询后更新全局 cookie：802 时服务端可能刷新 __csrf/NMTID，
		// 不更新会导致后续轮询 cookie 过期，一直停在 802
		if (fullCookie) {
			// 合并：新 cookie 中的字段覆盖旧的
			const oldParts = neteaseCookie ? neteaseCookie.split(';').map(s => s.trim()).filter(Boolean) : []
			const newParts = fullCookie.split(';').map(s => s.trim()).filter(Boolean)
			const cookieMap = {}
			for (const p of oldParts) {
				const eq = p.indexOf('=')
				if (eq > 0) cookieMap[p.substring(0, eq)] = p.substring(eq + 1)
			}
			for (const p of newParts) {
				const eq = p.indexOf('=')
				if (eq > 0) cookieMap[p.substring(0, eq)] = p.substring(eq + 1)
			}
			neteaseCookie = Object.entries(cookieMap).map(([k, v]) => `${k}=${v}`).join('; ')
		}
		console.log('[网易云登录] 提取到的完整 cookie:', fullCookie ? fullCookie.substring(0, 150) + '...' : '空')
		const data = await response.json()
		return {
			code: data.code,
			cookie: fullCookie || data.cookie || '',
			message: data.message || '',
			nickname: data.nickname || '',
			avatarUrl: data.avatarUrl || '',
			profile: data.profile || null,
			account: data.account || null,
		}
	} catch (error) {
		console.error('检查登录状态失败:', error)
		return { code: 800, cookie: '', message: '网络错误' }
	}
}

// ============================================================
// 网易云手机号码登录
// ============================================================

/**
 * 发送验证码
 */
export async function sendCaptcha(phone) {
	try {
		const body = weapiBody({ cellphone: phone, ctcode: '86', secrete: 'music_middleuser_pclogin' })
		const response = await fetch(`${NETEASE_BASE}/weapi/sms/captcha/sent`, {
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Referer: `${NETEASE_BASE}/`,
				Origin: `${NETEASE_BASE}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body,
		})
		const data = await response.json()
		console.log('[网易云登录] 发送验证码返回:', JSON.stringify(data))
		return { success: data.code === 200, data }
	} catch (error) {
		console.error('发送验证码失败:', error)
		return { success: false, error: error?.message || String(error) }
	}
}

/**
 * 手机号码验证码登录
 */
export async function loginByPhone(phone, captcha) {
	try {
		const body = weapiBody({
			type: '1',
			https: 'true',
			phone: phone,
			countrycode: '86',
			captcha: captcha,
			remember: 'true',
			secureCaptcha: '',
		})
		const response = await fetch(`${NETEASE_BASE}/weapi/w/login/cellphone`, {
			method: 'POST',
			headers: {
				'User-Agent': KUMONE_UA,
				Referer: `${NETEASE_BASE}/`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body,
		})
		// 登录成功时 cookie 通过 Set-Cookie 响应头返回（MUSIC_U 等），必须完整提取
		const headerCookie = extractFullCookieFromResponse(response)
		const data = await response.json()
		console.log('[网易云登录] 手机号登录返回:', JSON.stringify(data).substring(0, 300))
		if (data.code === 200) {
			// 优先用响应头 Set-Cookie，回退到响应体 cookie
			let cookie = headerCookie || data.cookie || ''
			console.log('[网易云登录] 提取到的cookie:', cookie ? cookie.substring(0, 100) : '空')
			// 确保cookie包含MUSIC_U
			if (!cookie.includes('MUSIC_U=') && data.token) {
				cookie = cookie ? `${cookie}; MUSIC_U=${data.token}` : `MUSIC_U=${data.token}`
			}
			// 确保 os/appver
			if (!cookie.includes('os=')) {
				cookie = `${cookie}; os=pc; appver=3.1.17`
			}
			console.log('[网易云登录] 最终cookie:', cookie.substring(0, 150))
			return { success: true, cookie, data }
		}
		return { success: false, data, message: data.message || '登录失败' }
	} catch (error) {
		console.error('手机号登录失败:', error)
		return { success: false, error: error?.message || String(error) }
	}
}

// ============================================================
// 网易云日推
// ============================================================

/**
 * 获取网易云日推（需要登录 cookie）
 */
export async function getNeteaseDailyRecommend(cookie) {
	try {
		const csrf = cookie ? ((cookie.match(/__?csrf\s*=\s*([^;\s]+)/) || [])[1] || '') : ''
		const weapiBodyData = weapiBody({ csrf_token: csrf })
		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Referer: `${NETEASE_BASE}/`,
			Origin: `${NETEASE_BASE}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		}
		if (cookie) headers.Cookie = cookie

		let data = null
		// 优先 weapi 加密 POST（和网易云官网一致，返回真正的个性化日推）
		try {
			console.log('[daily] 尝试 weapi 日推接口')
			const response = await fetch(`${NETEASE_BASE}/weapi/v3/discovery/recommend/songs?csrf_token=${csrf}`, {
				method: 'POST',
				headers,
				body: weapiBodyData,
			})
			data = await response.json()
			if (data.code === 200 && data.data?.dailySongs && data.data.dailySongs.length > 0) {
				console.log('[daily] weapi 日推接口成功, 共', data.data.dailySongs.length, '首')
			} else {
				console.log('[daily] weapi 日推返回异常 code=', data.code, 'dailySongs=', data.data?.dailySongs?.length)
				data = null
			}
		} catch (e) {
			console.log('[daily] weapi 日推接口失败:', e.message)
		}

		// fallback: GET 接口（可能返回非个性化数据或已失效）
		if (!data) {
			const urls = [
				`${NETEASE_BASE}/api/v3/discovery/recommend/songs?timestamp=${Date.now()}`,
				`${NETEASE_BASE}/api/v1/discovery/recommend/songs?timestamp=${Date.now()}`,
				`${NETEASE_BASE}/api/recommend/songs?timestamp=${Date.now()}`,
			]
			for (const url of urls) {
				try {
					console.log('[daily] fallback 尝试 GET 日推接口:', url)
					const response = await fetch(url, {
						headers: {
							'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
							Referer: `${NETEASE_BASE}/`,
							Cookie: cookie,
						},
					})
					data = await response.json()
					if (data.code === 200 && (data.data?.dailySongs || data.recommend?.length > 0)) {
						console.log('[daily] GET 日推接口成功:', url)
						break
					}
					console.log('[daily] GET 日推接口返回异常:', data.code, url)
					data = null
				} catch (e) {
					console.log('[daily] GET 日推接口失败:', url, e.message)
				}
			}
		}

		if (!data || (data.code !== 200 && !data.data?.dailySongs && !data.recommend)) {
			throw new Error('所有日推接口都失败')
		}

		// 兼容不同返回格式
		const dailySongs = data.data?.dailySongs || data.recommend || []

		const tracks = dailySongs.map((song) => {
			const artists = song.ar || song.artists || []
			const album = song.al || song.album || {}
			return {
				id: `netease_${song.id}`,
				songmid: `netease_${song.id}`,
				platform: 'netease',
				source: 'netease',
				title: song.name || '',
				artist: artists.map((a) => a.name).join(' / '),
				album: album.name || '',
				albumId: album.id ? String(album.id) : '',
				albumMid: album.id ? 'netease_album_' + album.id : '',
				artwork: album.picUrl || '',
				duration: song.dt ? Math.floor(song.dt / 1000) : 0,
				url: '',
				originalId: String(song.id),
			}
		})

		return tracks
	} catch (error) {
		console.error('获取网易云日推失败:', error)
		throw error
	}
}

/**
 * 心动模式/智能播放列表
 * 基于歌单中的某首歌生成推荐播放队列
 */
export async function getNeteaseIntelligenceList(songId, playlistId) {
	try {
		const { useDailyRecommendStore } = await import('@/store/dailyRecommendStore')
		const cookie = useDailyRecommendStore.getState().cookie
		if (!cookie) throw new Error('未登录网易云')

		const cleanSongId = String(songId).replace(/^(netease_|wy_)/, '')
		const cleanPlaylistId = String(playlistId).replace(/^(netease_|wy_)/, '')
		const csrf = (cookie.match(/_csrf=([^;]+)/) || cookie.match(/__csrf=([^;]+)/) || [])[1] || ''

		// 使用 weapi 加密接口
		const weapiBodyData = weapiBody({
			songId: cleanSongId,
			type: 'fromPlayOne',
			playlistId: cleanPlaylistId,
			startMusicId: cleanSongId,
			count: '1',
			csrf_token: csrf,
		})

		const response = await fetch(`${NETEASE_BASE}/weapi/playmode/intelligence/list?csrf_token=${csrf}`, {
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				Referer: `${NETEASE_BASE}/`,
				Origin: `${NETEASE_BASE}`,
				Cookie: cookie,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: weapiBodyData,
		})
		const data = await response.json()

		if (data.code !== 200 || !data.data) {
			throw new Error(`心动模式API返回异常: ${data.code}`)
		}

		const tracks = (data.data || [])
			.filter((item) => item.songInfo)
			.map((item) => {
				const song = item.songInfo
				const artists = song.ar || song.artists || []
				const album = song.al || song.album || {}
				return {
					id: `netease_${song.id}`,
					songmid: `netease_${song.id}`,
					platform: 'netease',
					source: 'netease',
					title: song.name || '',
					artist: artists.map((a) => a.name).join(' / '),
					album: album.name || '',
					albumId: album.id ? String(album.id) : '',
					albumMid: album.id ? 'netease_album_' + album.id : '',
					artwork: album.picUrl || '',
					duration: song.dt ? Math.floor(song.dt / 1000) : 0,
					url: '',
					originalId: String(song.id),
					_roamMode: 'intelligence',
					_roamPlaylistId: cleanPlaylistId,
				}
			})

		console.log(`[netease] 心动模式获取 ${tracks.length} 首歌曲`)
		return tracks
	} catch (error) {
		console.error('获取心动模式列表失败:', error)
		throw error
	}
}

/**
 * 私人FM（私人漫游）
 */
export async function getNeteasePersonalFM(batches = 3) {
	try {
		const { useDailyRecommendStore } = await import('@/store/dailyRecommendStore')
		const cookie = useDailyRecommendStore.getState().cookie
		if (!cookie) throw new Error('未登录网易云')

		const url = `${NETEASE_BASE}/api/v1/radio/get`
		const headers = {
			'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
			Referer: `${NETEASE_BASE}/`,
			Cookie: cookie,
			'Content-Type': 'application/x-www-form-urlencoded',
		}

		// 私人FM每次只返回3首，默认拉3批共9首去重；首次快速开播可传 batches=1
		const times = Math.max(1, Math.min(6, Number(batches) || 3))
		const allSongs = []
		const seenIds = new Set()
		for (let i = 0; i < times; i++) {
			try {
				const response = await fetch(url, { method: 'POST', headers })
				const data = await response.json()
				if (data.code === 200 && data.data) {
					for (const song of data.data) {
						if (!seenIds.has(song.id)) {
							seenIds.add(song.id)
							allSongs.push(song)
						}
					}
				}
			} catch (e) {
				console.log(`[netease] 私人FM第${i + 1}次获取失败:`, e.message)
			}
			// 每次请求间隔500ms避免限流
			if (i < times - 1) await new Promise((r) => setTimeout(r, 500))
		}

		const tracks = allSongs.map((song) => {
			const artists = song.ar || song.artists || []
			const album = song.al || song.album || {}
			return {
				id: `netease_${song.id}`,
				songmid: `netease_${song.id}`,
				platform: 'netease',
				source: 'netease',
				title: song.name || '',
				artist: artists.map((a) => a.name).join(' / '),
				album: album.name || '',
				albumId: album.id ? String(album.id) : '',
				albumMid: album.id ? 'netease_album_' + album.id : '',
				artwork: album.picUrl || '',
				duration: song.dt ? Math.floor(song.dt / 1000) : 0,
				url: '',
				originalId: String(song.id),
				_fmRoaming: true,

				_roamMode: 'fm',
			}
		})

		console.log(`[netease] 私人FM获取 ${tracks.length} 首歌曲（去重后）`)
		return tracks
	} catch (error) {
		console.error('获取私人FM失败:', error)
		throw error
	}
}

/**
 * 保存网易云 Cookie（供日推等需要登录的 API 使用）
 */
export async function saveNeteaseCookie(cookie) {
	try {
		const { useDailyRecommendStore } = await import('@/store/dailyRecommendStore')
		const store = useDailyRecommendStore.getState()
		store.setLoginInfo(cookie, '网易云用户', '', '')
		console.log('[netease] Cookie 已保存')
		return true
	} catch (error) {
		console.error('保存 Cookie 失败:', error)
		return false
	}
}

/**
 * 获取随机推荐歌单详情（每次刷新获取不同歌单）
 */
export async function getRandomRecommendPlaylist(cookie = '') {
	try {
		// 获取个性化推荐歌单列表
		const playlists = await getNeteasePersonalizedPlaylists(cookie)
		if (playlists.length === 0) {
			// 如果个性化推荐为空，获取热门歌单
			const url = `${NETEASE_BASE}/api/top/playlist?limit=20&order=hot&timestamp=${Date.now()}`
			const response = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
					Referer: `${NETEASE_BASE}/`,
				},
			})
			const data = await response.json()
			if (data.code === 200 && data.playlists && data.playlists.length > 0) {
				const randomIndex = Math.floor(Math.random() * data.playlists.length)
				const playlistId = data.playlists[randomIndex].id
				const detail = await getNeteasePlaylistDetail(playlistId)
				return {
					id: playlistId,
					name: data.playlists[randomIndex].name,
					coverImgUrl: data.playlists[randomIndex].coverImgUrl,
					songs: detail.songs || [],
				}
			}
			return null
		}
		// 随机选择一个推荐歌单
		const randomIndex = Math.floor(Math.random() * playlists.length)
		const selected = playlists[randomIndex]
		const detail = await getNeteasePlaylistDetail(selected.id)
		return {
			id: selected.id,
			name: selected.name,
			coverImgUrl: selected.coverImgUrl,
			songs: detail.songs || [],
		}
	} catch (error) {
		console.error('获取随机推荐歌单失败:', error)
		return null
	}
}

/**
 * 获取个性化推荐歌单（根据用户喜好推荐）
 */
export async function getNeteasePersonalizedPlaylists(cookie = '') {
	try {
		const csrf = cookie ? ((cookie.match(/__?csrf\s*=\s*([^;\s]+)/) || [])[1] || '') : ''
		const weapiBodyData = weapiBody({ limit: 6, csrf_token: csrf })
		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Referer: `${NETEASE_BASE}/`,
			Origin: `${NETEASE_BASE}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		}
		if (cookie) headers.Cookie = cookie
		const response = await fetch(`${NETEASE_BASE}/weapi/personalized?csrf_token=${csrf}`, {
			method: 'POST',
			headers,
			body: weapiBodyData,
		})
		const data = await response.json()
		if (data.code === 200 && data.result && data.result.length > 0) {
			return data.result.map((item) => ({
				id: item.id,
				name: item.name,
				coverImgUrl: item.picUrl || item.coverImgUrl,
				playCount: item.playCount,
				copywriter: item.copywriter || '',
			}))
		}
		return []
	} catch (error) {
		console.error('获取个性化推荐歌单失败:', error)
		return []
	}
}

/**
 * 获取登录用户的每日推荐歌单（/v1/discovery/recommend/resource）
 */
export async function getNeteaseRecommendResource(cookie = '') {
	try {
		const csrf = cookie ? ((cookie.match(/__?csrf\s*=\s*([^;\s]+)/) || [])[1] || '') : ''
		const weapiBodyData = weapiBody({ csrf_token: csrf })
		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Referer: `${NETEASE_BASE}/`,
			Origin: `${NETEASE_BASE}`,
			'Content-Type': 'application/x-www-form-urlencoded',
		}
		if (cookie) headers.Cookie = cookie
		const response = await fetch(`${NETEASE_BASE}/weapi/v1/discovery/recommend/resource?csrf_token=${csrf}`, {
			method: 'POST',
			headers,
			body: weapiBodyData,
		})
		const data = await response.json()
		if (data.code === 200 && data.recommend && data.recommend.length > 0) {
			return data.recommend.map((item) => ({
				id: item.id,
				name: item.name,
				coverImgUrl: item.picUrl || item.coverImgUrl,
				playCount: item.playcount || item.playCount || 0,
				copywriter: item.copywriter || '',
			}))
		}
		return []
	} catch (error) {
		console.error('获取每日推荐歌单失败:', error)
		return []
	}
}

/**
 * 获取雷达歌单（4个固定ID，名称和封面按账号生成）
 */
const RADAR_PLAYLIST_IDS = [
	{ id: 3136952023, label: '私人雷达' },
	{ id: 2829883282, label: '华语私人雷达' },
	{ id: 2829816518, label: '欧美私人雷达' },
	{ id: 2829896389, label: '日系私人雷达' },
]

export async function getNeteaseRadarPlaylists(cookie = '') {
	try {
		const results = await Promise.all(
			RADAR_PLAYLIST_IDS.map(async (radar) => {
				try {
					const url = `${NETEASE_BASE}/api/v6/playlist/detail?id=${radar.id}&n=1&timestamp=${Date.now()}`
					const headers = {
						'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
						Referer: `${NETEASE_BASE}/`,
					}
					if (cookie) headers.Cookie = cookie
					const response = await fetch(url, { headers })
					const data = await response.json()
					if (data.code === 200 && data.playlist) {
						const pl = data.playlist
						const rawName = pl.name || radar.label
						const parts = rawName.split('|')
						const title = parts.length > 1 ? parts[parts.length - 1].trim() : rawName
						const subtitle = parts.length > 1 ? parts.slice(0, -1).join('|').trim() : ''
						return {
							id: radar.id,
							title: title,
							subtitle: subtitle,
							coverImgUrl: pl.coverImgUrl || '',
						}
					}
					return null
				} catch (e) {
					return null
				}
			})
		)
		return results.filter(Boolean)
	} catch (error) {
		console.error('获取雷达歌单失败:', error)
		return []
	}
}

/**
 * 获取排行榜列表（kumone toplists）
 */
export async function getNeteaseToplists(cookie = '') {
	try {
		const url = `${NETEASE_BASE}/api/toplist?timestamp=`
		const headers = {
			'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
			Referer: `${NETEASE_BASE}/,`
		}
		if (cookie) headers.Cookie = cookie
		const response = await fetch(url, { headers })
		const data = await response.json()
		if (data.code === 200 && data.list) {
			// 只保留指定榜单：飙升榜、新歌榜、原创榜、热歌榜、欧美新歌榜、说唱榜
			const KEEP_NAMES = ['飙升榜', '新歌榜', '原创榜', '热歌榜', '欧美新歌榜', '欧美热歌榜', '说唱榜', '全球说唱榜', '热度榜', 'VIP热歌榜', 'VIP新歌榜', 'BEAT']
			return data.list.filter((t) => KEEP_NAMES.some((name) => t.name && t.name.includes(name))).map((t) => ({
				id: t.id,
				name: t.name,
				coverImgUrl: t.coverImgUrl || t.picUrl || '',
				updateFrequency: t.updateFrequency || '',
			}))
		}
		return []
	} catch (error) {
		console.error('获取排行榜失败:', error)
		return []
	}
}


/**
 * 获取推荐歌单（未登录替代方案）
 * 改用 /api/top/playlist API（更稳定）
 */
export async function getNeteaseRecommendPlaylists() {
	try {
		// 旧的/api/top/playlist已404，直接使用热歌榜（ID=3778678）作为日推替代
		const HOT_PLAYLIST_ID = '3778678'
		console.log('[daily] 使用热歌榜作为日推替代, id=', HOT_PLAYLIST_ID)
		const playlist = await getNeteasePlaylistDetail(HOT_PLAYLIST_ID)
		return playlist.songs || []
	} catch (error) {
		console.error('获取推荐歌单失败:', error)
		throw error
	}
}

// ============================================================
// 网易云风格化推荐
// ============================================================

/**
 * 保存风格化推荐标签
 * @param {string} cookie - 网易云登录 Cookie
 * @param {number} categoryId - 分类ID（1000曲风 2000语种 3000情感 4000主题 5000场景）
 * @param {number[]} tagIds - 标签ID数组
 */
export async function saveNeteaseStylizedTag(cookie, categoryId, tagIds) {
	try {
		const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''
		const tagsStr = JSON.stringify({ categoryId, tagIds })
		const body = weapiBody({
			tags: tagsStr,
			csrf_token: csrfToken,
		})
		const response = await fetch(
			`https://music.163.com/weapi/homepage/daily/song/tag/save?csrf_token=${csrfToken}`,
			{
				method: 'POST',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
					'Content-Type': 'application/x-www-form-urlencoded',
					origin: 'https://music.163.com',
					Referer: 'https://music.163.com',
					Cookie: cookie,
				},
				body,
			},
		)
		const data = await response.json()
		if (data.code !== 200) throw new Error('保存风格化标签失败')
		return true
	} catch (error) {
		console.error('保存风格化标签失败:', error)
		throw error
	}
}

/**
 * 获取风格化推荐歌曲列表
 * @param {string} cookie - 网易云登录 Cookie
 * @returns {Promise<Array>} 推荐歌曲列表
 */
export async function getNeteaseStylizedList(cookie) {
	try {
		const csrfToken = (cookie.match(/_csrf=([^(;|$)]+)/) || [])[1] || ''
		const body = weapiBody({
			csrf_token: csrfToken,
		})
		const response = await fetch(
			`https://music.163.com/weapi/homepage/category/daily/song/list?csrf_token=${csrfToken}`,
			{
				method: 'POST',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
					'Content-Type': 'application/x-www-form-urlencoded',
					origin: 'https://music.163.com',
					Referer: 'https://music.163.com',
					Cookie: cookie,
				},
				body,
			},
		)
		const data = await response.json()
		if (data.code !== 200 || !data.data) throw new Error('获取风格化推荐失败')
		const dailySongs = data.data.dailySongs || []
		return dailySongs.map((song) => {
			const artists = song.ar || song.artists || []
			const album = song.al || song.album || {}
			return {
				id: `netease_${song.id}`,
				songmid: `netease_${song.id}`,
				platform: 'netease',
				source: 'netease',
				title: song.name || '',
				artist: artists.map((a) => a.name).join(' / '),
				album: album.name || '',
				albumId: album.id ? String(album.id) : '',
				albumMid: album.id ? 'netease_album_' + album.id : '',
				artwork: album.picUrl || '',
				duration: song.dt ? Math.floor(song.dt / 1000) : 0,
				url: '',
				originalId: String(song.id),
			}
		})
	} catch (error) {
		console.error('获取风格化推荐失败:', error)
		throw error
	}
}


// ============================================================
// 网易云歌手详情
// ============================================================

export async function getNeteaseSingerDetail(artistId) {
	try {
		const cleanId = String(artistId).replace(/^(netease_|wy_)/, '')

		// 方式1：weapi加密歌手详情（主接口，和官网一致）
		try {
			const weapiBodyData = weapiBody({ id: cleanId })
			const weapiResp = await fetchWithTimeout(`https://music.163.com/weapi/v1/artist/${cleanId}?csrf_token=`, {
				method: 'POST',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Referer': 'https://music.163.com/',
					'Content-Type': 'application/x-www-form-urlencoded',
					'origin': 'https://music.163.com',
				},
				body: weapiBodyData,
			}, 3000)
			const weapiData = await weapiResp.json()
			if (weapiData.code === 200 && weapiData.artist) {
				const artist = weapiData.artist
				const singerName = artist.name || '未知歌手'
				const singerImg = artist.img1v1Url || artist.picUrl || ''
				const songs = weapiData.hotSongs || []
				const musicList = songs.map(formatNeteaseSong)
				const briefDesc = artist.briefDesc || artist.description || ''
				const musicSize = artist.musicSize || 0
				const albumSize = artist.albumSize || 0
				console.log('[网易云歌手详情] weapi主接口成功, musicSize:', musicSize, 'albumSize:', albumSize)
				return { singerImg, title: singerName, id: `netease_${cleanId}`, musicList, description: briefDesc, musicSize, albumSize }
			}
		} catch (e) {
			console.warn('weapi主接口失败，走备用明文:', e.message || e)
		}

		// 方式1.5（备用）：明文API，3秒超时
		const timeoutPromise = new Promise((_, reject) =>
			setTimeout(() => reject(new Error('timeout')), 5000)
		)
		try {
			const response = await Promise.race([
				fetch(`https://music.163.com/api/v1/artist?id=${cleanId}`, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
						Referer: 'https://music.163.com/',
					},
				}),
				timeoutPromise,
			])
			const data = await response.json()
			if (data.code === 200 && data.artist) {
				const artist = data.artist
				const singerName = artist.name || '未知歌手'
				const singerImg = artist.img1v1Url || artist.picUrl || ''
				const songs = data.hotSongs || []
				const musicList = songs.map(formatNeteaseSong)
				const musicSize = artist.musicSize || 0
				const albumSize = artist.albumSize || 0
				return { singerImg, title: singerName, id: `netease_${cleanId}`, musicList, musicSize, albumSize }
			}
		} catch (e) {
			console.warn('明文备用也失败，走热门歌曲兜底:', e.message || e)
		}

		// 方式2（兜底）：热门歌曲 + 搜索歌手名拿头像
		const songsResponse = await fetch(
			`https://music.163.com/api/artist/top/song?id=${cleanId}`,
			{
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
					Referer: 'https://music.163.com/',
				},
			},
		)
		const songsData = await songsResponse.json()
		if (songsData.code !== 200) throw new Error('获取歌手热门歌曲失败')
		const songs = songsData.songs || []

		let singerName = '未知歌手'
		let singerImg = ''
		if (songs.length > 0) {
			const artists = songs[0].ar || songs[0].artists || []
			const matchedArtist = artists.find((a) => String(a.id) === cleanId) || artists[0]
			if (matchedArtist) {
				singerName = matchedArtist.name || '未知歌手'
				try {
					const searchUrl = `https://music.163.com/api/search/get?s=${encodeURIComponent(singerName)}&type=100&offset=0&limit=1`
					const searchResp = await fetch(searchUrl, {
						headers: {
							'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
							'Referer': 'https://music.163.com/',
						},
					})
					const searchData = await searchResp.json()
					if (searchData.code === 200 && searchData.result && searchData.result.artists && searchData.result.artists.length > 0) {
						const searchedArtist = searchData.result.artists.find((a) => String(a.id) === cleanId) || searchData.result.artists[0]
						singerImg = searchedArtist.picUrl || searchedArtist.img1v1Url || ''
					}
				} catch (e) {
					console.warn('获取歌手头像失败:', e)
				}
			}
		}

		const musicList = songs.map(formatNeteaseSong)
		return { singerImg, title: singerName, id: `netease_${cleanId}`, musicList }
	} catch (error) {
		console.error('获取网易云歌手详情失败:', error)
		return null
	}
}

export async function getNeteaseSingerAlbums(artistId, offset = 0, limit = 30) {
	try {
		const cleanId = String(artistId).replace(/^(netease_|wy_)/, '')
		const allAlbums = []

		// 只取第一页30张，UI层有懒加载
		const response = await fetch(
			`https://music.163.com/api/artist/albums/${cleanId}?limit=${limit}&offset=${offset}`,
			{
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
					'Referer': 'https://music.163.com/',
				},
			},
		)
		const data = await response.json()
		if (data.code === 200 && data.hotAlbums) {
			allAlbums.push(...data.hotAlbums)
		}

		console.log(`[netease-album] 歌手${cleanId}获取${allAlbums.length}张专辑(第一页)`)
		
		return allAlbums.map((album) => {
			let subType = album.subType || album.type || ''
			if (!subType) {
				const size = album.size || album.songCount || album.trackCount || album.count || 0
				if (size === 1) subType = '单曲'
				else if (size > 1 && size <= 5) subType = 'EP'
				else subType = '专辑'
			}
			return {
				album_mid: `netease_album_${album.id}`,
				album_name: album.name || '',
				singer_mid: `netease_${cleanId}`,
				singer_name: album.artist?.name || '',
				artwork: album.picUrl || '',
				songCount: album.size || album.songCount || album.trackCount || album.count || 0,
				public_time: album.publishTime ? String(album.publishTime) : '',
				subType,
			}
		})
	} catch (error) {
		console.error('获取网易云歌手专辑失败:', error)
		return []
	}
}

export async function getNeteaseAlbumSongs(albumId) {
	try {
		const cleanId = String(albumId).replace(/^(netease_album_|netease_)/, '')
		// 方式1：weapi 主接口（kumone 同款，带时长）
		let album = null
		let songs = []
		let musicList = []
		try {
			const weapiBodyData = weapiBody({})
			const weapiResp = await fetchWithTimeout(`https://music.163.com/weapi/v1/album/${cleanId}?csrf_token=`, {
				method: 'POST',
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
					Referer: 'https://music.163.com/',
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: weapiBodyData,
				timeout: 5000,
			})
			const weapiData = await weapiResp.json()
			if (weapiData.code === 200 && weapiData.album) {
				album = weapiData.album
				songs = weapiData.songs || []
				console.log('[网易云专辑详情] weapi主接口歌曲数:', songs.length)
				musicList = songs.map(formatNeteaseSong)
			}
		} catch (e) {
			console.warn('[网易云专辑详情] weapi主接口失败，走旧接口:', e.message || e)
		}

		// 方式2：旧接口备用
		if (!album) {
			const response = await fetch(
				`https://music.163.com/api/album/${cleanId}`,
				{
					headers: {
						'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
						Referer: 'https://music.163.com/',
					},
				},
			)
			const data = await response.json()
			if (data.code !== 200 || !data.album) return null
			album = data.album
			songs = album.songs || []
			console.log('[网易云专辑详情] 旧接口歌曲数:', songs.length)
			musicList = songs.map((song) => {
				const artists = song.ar || song.artists || []
				const al = song.al || song.album || {}
				return {
					id: `netease_${song.id}`,
					songmid: `netease_${song.id}`,
					platform: 'netease',
					source: 'netease',
					title: song.name || '',
					artist: artists.map((a) => a.name).join(' / '),
					album: album.name || '',
					albumId: al.id ? String(al.id) : '',
					albumMid: al.id ? 'netease_album_' + al.id : '',
					artwork: al.picUrl || album.picUrl || '',
					duration: song.dt ? Math.floor(song.dt / 1000) : 0,
					url: '',
					originalId: String(song.id),
				}
			})
		}

		// 同时用 weapi 接口加载简介（异步，失败不影响歌曲）
		let albumDesc = ''
		try {
			const weapiBodyData = weapiBody({ id: cleanId })
			const weapiResp = await fetchWithTimeout(`https://music.163.com/weapi/v1/album/${cleanId}?csrf_token=`, {
				method: 'POST',
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
					Referer: 'https://music.163.com/',
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: weapiBodyData,
				timeout: 5000,
			})
			const weapiData = await weapiResp.json()
			if (weapiData.code === 200 && weapiData.album) {
				const raw = weapiData.album.description || weapiData.album.briefDesc || weapiData.album.info
				if (typeof raw === 'string') {
					albumDesc = raw
				} else if (typeof raw === 'object' && raw) {
					albumDesc = raw.desc || raw.text || raw.content || ''
				}
				console.log('[网易云专辑简介] weapi 成功:', albumDesc ? '有简介' : '无简介')
			}
		} catch (e) {
			console.warn('[网易云专辑简介] weapi 加载失败:', e.message || e)
		}

		// 如果 weapi 没拿到简介，用旧接口的简介
		if (!albumDesc) {
			const raw = album.description || album.briefDesc || album.info || album.desc || album.albumInfo
			if (typeof raw === 'string') {
				albumDesc = raw
			} else if (typeof raw === 'object' && raw) {
				albumDesc = raw.desc || raw.text || raw.content || ''
			}
		}

		return {
			singerImg: album.picUrl || '',
			title: album.name || '未知专辑',
			id: `netease_album_${cleanId}`,
			musicList,
			description: albumDesc,
		}
	} catch (error) {
		console.error('获取网易云专辑歌曲失败:', error)
		return null
	}
}

// 获取歌手的所有歌曲
export async function getNeteaseSingerSongs(artistId, offset = 0, limit = 100) {
	try {
		const cleanId = String(artistId).replace(/^(netease_|wy_)/, '')
		const weapiBodyData = weapiBody({
			id: cleanId,
			private_cloud: 'true',
			work_type: 1,
			order: 'hot',
			offset,
			limit,
		})
		const resp = await fetchWithTimeout('https://music.163.com/weapi/v1/artist/songs?csrf_token=', {
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				'Referer': 'https://music.163.com/',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: weapiBodyData,
		}, 5000)
		const data = await resp.json()
		if (data.code === 200) {
			const songs = data.songs || []
			const list = songs.map(formatNeteaseSong)
			return { list, total: data.total || 0, hasMore: data.more || false }
		}
		return { list: [], total: 0, hasMore: false }
	} catch (error) {
		console.error('getNeteaseSingerSongs error:', error)
		return { list: [], total: 0, hasMore: false }
	}
}

// 用歌曲ID获取专辑ID
export async function getNeteaseAlbumIdBySongId(songId) {
	try {
		if (!songId) return ''
		const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
		// 用 weapi 接口获取歌曲详情
		const weapiBodyData = weapiBody({ ids: [cleanId] })
		const resp = await fetchWithTimeout('https://music.163.com/weapi/v3/song/detail?csrf_token=', {
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				'Referer': 'https://music.163.com/',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: weapiBodyData,
		}, 5000)
		const data = await resp.json()
		if (data.code === 200 && data.songs?.[0]) {
			const song = data.songs[0]
			return song.al?.id || ''
		}
		return ''
	} catch (error) {
		console.error('getNeteaseAlbumIdBySongId error:', error)
		return ''
	}
}

/**
 * 获取用户歌单列表
 */
export async function getNeteaseUserPlaylists(uid, cookie = '') {
	try {
		let actualUid = uid
		// 如果没有传uid，通过cookie获取用户信息
		if (!actualUid && cookie) {
			try {
				const userInfoRes = await fetch('https://music.163.com/api/nuser/account/get', {
					headers: {
						Cookie: cookie,
						'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
						Referer: 'https://music.163.com/',
					},
				})
				const userInfo = await userInfoRes.json()
				if (userInfo.code === 200 && userInfo.profile) {
					actualUid = userInfo.profile.userId
				}
			} catch (e) {
				console.error('通过cookie获取用户信息失败:', e)
			}
		}

		if (!actualUid) {
			console.error('无法获取用户ID')
			return []
		}

		const url = `https://music.163.com/api/user/playlist?uid=${actualUid}&limit=1000&offset=0&timestamp=${Date.now()}`
		const headers = {
			'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
			Referer: 'https://music.163.com/',
		}
		if (cookie) headers['Cookie'] = cookie
		const response = await fetch(url, { headers })
		const data = await response.json()
		if (data.code !== 200 || !data.playlist) return []
		console.log('[user-playlists] 共获取', data.playlist.length, '个歌单（含收藏）')
		return data.playlist.map((pl) => ({
			id: pl.id,
			name: pl.name || '',
			coverImgUrl: pl.coverImgUrl || '',
			playCount: pl.playCount || 0,
			trackCount: pl.trackCount || 0,
			creator: pl.creator?.nickname || '',
			// 网易云「我喜欢的音乐」特征：specialType===5（用户改名后也能匹配）
			isLoved: pl.name === '我喜欢的音乐' || pl.specialType === 5,
		}))
	} catch (error) {
		console.error('获取用户歌单失败:', error)
		return []
	}
}

/**
 * 收藏/取消收藏歌曲到网易云"我喜欢的音乐"
 * like=true 收藏，like=false 取消收藏
 */
export async function likeNeteaseSong(songId, like = true, cookie = '') {
	try {
		const cleanId = String(songId).replace(/^(netease_|wy_)/, '')

		// 从 cookie 中提取 csrf_token
		let csrfToken = ''
		if (cookie) {
			const csrfMatch = cookie.match(/__csrf=([^;]+)/)
			if (csrfMatch) {
				csrfToken = csrfMatch[1]
			}
		}
		// 如果没有csrf，先访问网易云首页获取
		if (!csrfToken) {
			try {
				const homeRes = await fetch('https://music.163.com/', {
					headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
				})
				const setCookie = homeRes.headers.get('set-cookie') || ''
				const csrfMatch = setCookie.match(/__csrf=([^;]+)/)
				if (csrfMatch) {
					csrfToken = csrfMatch[1]
				}
			} catch (e) {
				console.log('获取csrf失败:', e)
			}
		}

		console.log(`[网易云收藏] cleanId=${cleanId}, like=${like}, csrfToken=${csrfToken ? '有' : '无'}, cookie长度=${cookie?.length || 0}`)

		// 参考Beans Music实现：使用/api/song/like接口，参数alg/trackId/like/time
		const params = {
			alg: 'itembased',
			trackId: parseInt(cleanId) || cleanId,
			like: like,
			time: '3',
		}
		const body = weapiBody(params)

		const url = `https://music.163.com/weapi/song/like?csrf_token=${csrfToken}`
		const headers = {
			'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Referer: 'https://music.163.com/',
			Origin: 'https://music.163.com',
			'Content-Type': 'application/x-www-form-urlencoded',
			Accept: 'application/json, text/plain, */*',
		}
		if (cookie) headers['Cookie'] = cookie

		const response = await fetch(url, {
			method: 'POST',
			headers,
			body,
		})

		const contentType = response.headers.get('content-type') || ''
		const responseText = await response.text()
		console.log(`[网易云收藏] 响应状态: ${response.status}, content-type: ${contentType}, 响应内容前200字符: ${responseText.substring(0, 200)}`)

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}: ${responseText.substring(0, 100)}` }
		}

		if (!contentType.includes('json') && !responseText.trim().startsWith('{')) {
			return { success: false, error: `接口返回非JSON内容: ${responseText.substring(0, 100)}` }
		}

		const data = JSON.parse(responseText)
		console.log(`[网易云收藏] API返回:`, JSON.stringify(data))
		return { success: data.code === 200, data }
	} catch (error) {
		console.error('网易云收藏歌曲失败:', error)
		return { success: false, error: error?.message || String(error) }
	}
}

/**
 * 上报播放开始到网易云（写入最近播放列表）
 * 必须在播放开始时调用，与 scrobbleNeteaseSong(play) 配合使用
 * @param {string} songId - 歌曲ID
 * @param {string} cookie - 登录cookie
 */
export async function scrobbleStartNeteaseSong(songId, cookie = '') {
	try {
		const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
		const hasMusicU = cookie.includes('MUSIC_U=')
		console.log(`[网易云最近播放上报] songId=${cleanId}, cookie有MUSIC_U=${hasMusicU}, cookie长度=${cookie.length}`)

		const log = {
			action: 'startplay',
			json: {
				id: parseInt(cleanId) || cleanId,
				type: 'song',
				mainsite: '1',
				mainsiteWeb: '1',
				content: 'id=0',
			},
		}
		const eapiHeader = buildEapiHeader(cookie)
		const body = eapiBody('/api/feedback/weblog', { logs: JSON.stringify([log]), header: eapiHeader })

		const url = 'https://interface.music.163.com/eapi/feedback/weblog'
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Referer: 'https://music.163.com/',
		}
		if (cookie) {
			// 对齐 Kumone：cookie 统一为 os=osx + appver=3.1.17（桌面网页客户端会话特征）
			let cookieWithOsx = cookie.replace(/os=[^;]+/gi, 'os=osx')
			if (!cookieWithOsx.includes('os=osx')) cookieWithOsx += '; os=osx'
			cookieWithOsx = cookieWithOsx.replace(/appver=[^;]+/gi, 'appver=3.1.17')
			if (!cookieWithOsx.includes('appver=')) cookieWithOsx += '; appver=3.1.17'
			headers['Cookie'] = cookieWithOsx
		}

		const response = await fetch(url, { method: 'POST', headers, body })
		const responseText = await response.text()
		console.log(`[网易云最近播放上报] 响应: ${response.status}, ${responseText.substring(0, 100)}`)

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}` }
		}

		const data = JSON.parse(responseText)
		return { success: data.code === 200, data }
	} catch (error) {
		console.error('网易云最近播放上报失败:', error)
		return { success: false, error: error?.message || String(error) }
	}
}

/**
 * 上报播放历史到网易云（听歌排行）
 * @param {string} songId - 歌曲ID
 * @param {number} playedSeconds - 已播放秒数
 * @param {string} cookie - 登录cookie
 */
export async function scrobbleNeteaseSong(songId, playedSeconds, cookie = '', sourceId = 0) {
	try {
		const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
		const hasMusicU = cookie.includes('MUSIC_U=')
		const hasCsrf = cookie.includes('__csrf=')
		console.log(`[网易云听歌上报] songId=${cleanId}, sourceId=${sourceId}, played=${playedSeconds}s, cookie有MUSIC_U=${hasMusicU}, 有__csrf=${hasCsrf}, cookie长度=${cookie.length}`)

		// weblog 是 eapi 接口：必须用 eapi 加密 + /eapi/feedback/weblog，
		// 与"最近播放(startplay)"上报走同一条已验证通路（weapi 端点网易云不认，听歌排行不会涨）
		const realSourceId = String(sourceId || 0)
		const log = {
			action: 'play',
			json: {
				download: 0,
				end: 'playend',
				id: parseInt(cleanId) || cleanId,
				sourceId: realSourceId,
				time: Math.floor(playedSeconds),
				type: 'song',
				wifi: 0,
				source: 'list',
				mainsite: '1',
				mainsiteWeb: '1',
				content: `id=${realSourceId}`,
			},
		}
		const eapiHeader = buildEapiHeader(cookie)
		console.log(`[网易云听歌上报] eapi header里MUSIC_U=${!!eapiHeader.MUSIC_U}, os=${eapiHeader.os}`)
		const body = eapiBody('/api/feedback/weblog', { logs: JSON.stringify([log]), header: eapiHeader })

		// eapi 接口必须走 interface.music.163.com（与 Kumone 一致），
		// 走 music.163.com 会被忽略导致听歌排行不涨
		const url = 'https://interface.music.163.com/eapi/feedback/weblog'
		const headers = {
			'Content-Type': 'application/x-www-form-urlencoded',
			'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
			Referer: 'https://music.163.com/',
		}
		if (cookie) {
			// 对齐 Kumone：cookie 统一为 os=osx + appver=3.1.17（桌面网页客户端会话特征）
			let cookieWithOsx = cookie.replace(/os=[^;]+/gi, 'os=osx')
			if (!cookieWithOsx.includes('os=osx')) cookieWithOsx += '; os=osx'
			cookieWithOsx = cookieWithOsx.replace(/appver=[^;]+/gi, 'appver=3.1.17')
			if (!cookieWithOsx.includes('appver=')) cookieWithOsx += '; appver=3.1.17'
			headers['Cookie'] = cookieWithOsx
		}

		const response = await fetch(url, { method: 'POST', headers, body })
		const responseText = await response.text()
		console.log(`[网易云听歌上报] 响应: ${response.status}, ${responseText.substring(0, 100)}`)

		if (!response.ok) {
			return { success: false, error: `HTTP ${response.status}` }
		}

		const data = JSON.parse(responseText)
		return { success: data.code === 200, data }
	} catch (error) {
		console.error('网易云听歌上报失败:', error)
		return { success: false, error: error?.message || String(error) }
	}
}

/**
 * 批量收藏歌曲到网易云歌单
 */
export async function addSongsToNeteasePlaylist(playlistId, songIds, cookie = '') {
	try {
		const ids = songIds.map((id) => String(id).replace(/^(netease_|wy_)/, '')).join(',')
		const url = `https://music.163.com/api/playlist/manipulate/tracks?op=add&pid=${playlistId}&trackIds=${ids}&imme=true&timestamp=${Date.now()}`
		const headers = {
			'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
			Referer: 'https://music.163.com/',
			'Content-Type': 'application/x-www-form-urlencoded',
		}
		if (cookie) headers['Cookie'] = cookie
		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: '',
		})
		const data = await response.json()
		return data.code === 200
	} catch (error) {
		console.error('添加歌曲到网易云歌单失败:', error)
		return false
	}
}

export async function removeSongsFromNeteasePlaylist(playlistId, songIds, cookie = '') {
	try {
		const ids = '[' + songIds.map((id) => String(id).replace(/^(netease_|wy_)/, '')).join(',') + ']'
		const url = `https://music.163.com/api/playlist/manipulate/tracks?op=del&pid=${playlistId}&trackIds=${ids}&imme=true&timestamp=${Date.now()}`
		const headers = {
			'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
			Referer: 'https://music.163.com/',
			'Content-Type': 'application/x-www-form-urlencoded',
		}
		if (cookie) headers['Cookie'] = cookie
		const response = await fetch(url, {
			method: 'POST',
			headers,
			body: '',
		})
		const data = await response.json()
		return { success: data.code === 200, error: data.message || '' }
	} catch (error) {
		console.error('从网易云歌单移除歌曲失败:', error)
		return { success: false, error: error.message }
	}
}





// ============================================================
// 网易云关注歌手（参考 LX-Y-Music-IOS wy/user.js getSublist）
// ============================================================

/**
 * 获取网易云关注歌手列表
 * LX 实现：POST /weapi/artist/sublist，weapi 加密，不传 csrf_token
 * 返回 body.data 直接是歌手数组
 */
export async function getNeteaseFollowedArtists(cookie, limit = 100, offset = 0) {
  try {
    const body = weapiBody({ limit, offset, total: true })
    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36 Edg/108.0.1462.54',
      'Content-Type': 'application/x-www-form-urlencoded',
      origin: 'https://music.163.com',
      Referer: 'https://music.163.com',
    }
    if (cookie) headers['Cookie'] = cookie
    const res = await fetch('https://music.163.com/weapi/artist/sublist', {
      method: 'POST',
      headers,
      body,
    })
    const data = await res.json()
    if (data.code !== 200) {
      console.log('网易云关注歌手返回 code:', data.code)
      return []
    }
    // LX 返回 body.data 直接是数组，兼容可能的包装格式
    let artists = []
    if (Array.isArray(data.data)) {
      artists = data.data
    } else if (data.data) {
      artists = data.data.artistList || data.data.artists || []
    }
    console.log('网易云关注歌手数量:', artists.length)
    return artists.map((a) => ({
      id: 'netease_' + a.id,
      name: a.name || '',
      avatar: a.img1v1Url || a.picUrl || '',
      platform: 'netease',
      artistId: String(a.id),
    }))
  } catch (error) {
    console.error('获取网易云关注歌手失败:', error)
    return []
  }
}

/**
 * 获取全部网易云关注歌手（自动分页）
 */
export async function getAllNeteaseFollowedArtists(cookie) {
  let all = []
  let offset = 0
  const limit = 100
  while (true) {
    const batch = await getNeteaseFollowedArtists(cookie, limit, offset)
    all = all.concat(batch)
    if (batch.length < limit) break
    offset += limit
    if (all.length >= 500) break
    await new Promise((r) => setTimeout(r, 150))
  }
  return all
}


/**
 * 获取网易云相似歌曲
 */
export async function getNeteaseSimilarSongs(songId, limit = 30, offset = 0) {
  try {
    const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
    const url = `https://music.163.com/api/v1/discovery/simiSong?songid=${cleanId}&offset=${offset}&limit=${limit}`
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
        'Referer': 'http://music.163.com/',
      },
    })
    const data = await response.json()
    if (data.code !== 200 || !data.songs) {
      console.log('[netease-similar] API返回错误, code:', data.code)
      return []
    }

    return data.songs.map((s) => ({
      id: s.id ? String(s.id) : String(Math.random()),
      songmid: s.id ? `netease_${s.id}` : '',
      platform: 'netease',
      source: 'netease',
      title: s.name || '',
      name: s.name || '',
      artist: (s.artists || []).map((a) => a.name).join(' / '),
      artists: (s.artists || []).map((a) => ({ name: a.name, id: a.id ? `netease_${a.id}` : '' })),
      album: s.album?.name || '',
      albumId: s.album?.id ? String(s.album.id) : '',
      artwork: s.album?.picUrl || s.album?.blurPicUrl || '',
      duration: s.duration ? Math.round(s.duration / 1000) : 0,
      url: '',
    }))
  } catch (e) {
    console.error('[netease-similar] 获取相似歌曲失败:', e)
    return []
  }
}

/**
 * 获取网易云听歌排行（用户播放记录）
 * type=1 最近一周（weekData），type=0 所有时间（allData）
 * 需登录 cookie；uid 不传时用 cookie 换取；每条含 playCount 播放次数
 */
export async function getNeteaseListenRank(cookie, uid, type = 1) {
  try {
    if (!cookie) throw new Error('未登录网易云')
    let actualUid = uid
    if (!actualUid) {
      try {
        const userRes = await fetch(`${NETEASE_BASE}/api/nuser/account/get`, {
          headers: {
            Cookie: cookie,
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
            Referer: `${NETEASE_BASE}/`,
          },
        })
        const userInfo = await userRes.json()
        if (userInfo.code === 200 && userInfo.profile) actualUid = userInfo.profile.userId
      } catch (e) {
        console.error('[听歌排行] 获取uid失败:', e)
      }
    }
    if (!actualUid) throw new Error('无法获取用户ID')

    const csrf = (cookie.match(/_csrf=([^;]+)/) || cookie.match(/__csrf=([^;]+)/) || [])[1] || ''
    const bodyData = weapiBody({
      uid: String(actualUid),
      type: type,
      total: 'true',
      csrf_token: csrf,
    })
    const resp = await fetch(`${NETEASE_BASE}/weapi/v1/play/record?csrf_token=${csrf}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: `${NETEASE_BASE}/`,
        Origin: NETEASE_BASE,
        Cookie: cookie,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: bodyData,
    })
    const data = await resp.json()
    if (data.code !== 200) throw new Error('听歌排行返回异常: ' + data.code)

    const list = type === 1
      ? (data.weekData || (data.data && data.data.weekData) || [])
      : (data.allData || (data.data && data.data.allData) || [])
    const tracks = list.map((item) => {
      const song = item.song || item
      const artists = song.ar || song.artists || []
      const album = song.al || song.album || {}
      return {
        id: `netease_${song.id}`,
        songmid: `netease_${song.id}`,
        platform: 'netease',
        source: 'netease',
        title: song.name || '',
        artist: artists.map((a) => a.name).join(' / '),
        album: album.name || '',
        albumId: album.id ? String(album.id) : '',
        albumMid: album.id ? 'netease_album_' + album.id : '',
        artwork: album.picUrl || '',
        duration: song.dt ? Math.floor(song.dt / 1000) : 0,
        url: '',
        originalId: String(song.id),
        playCount: item.playCount != null ? item.playCount : (song.playCount || 0),
      }
    })
    console.log('[听歌排行] type=' + type + ' 返回', tracks.length, '首')
    return tracks
  } catch (error) {
    console.error('获取网易云听歌排行失败:', error)
    throw error
  }
}

/**
 * 网易云听歌足迹（listen data）系列接口 - 官方实时数据
 * 接口来源：NeteaseCloudMusicApi Enhanced（github.com/neteasecloudmusicapienhanced/api-enhanced）
 * - /api/content/activity/listen/data/realtime/report  本周/本月收听时长
 * - /api/content/activity/listen/data/total            总收听数据（含连续收听天数）
 * 均走 eapi 加密（interface.music.163.com/eapi/...），默认返回明文 JSON
 */

const EAPI_DOMAIN = 'https://interface.music.163.com'

// 从对象中按候选字段名取第一个有效数字（容错解析未知返回结构）
function pickFirstNumber(obj, keys, fallback = -1) {
  if (!obj || typeof obj !== 'object') return fallback
  for (const k of keys) {
    const v = obj[k]
    if (v != null && Number(v) > 0) return Number(v)
  }
  return fallback
}

// 服务端开启 encryptResponse 时返回的是 eapi 加密 hex，这里兜底解密
function tryEapiResDecrypt(text) {
  try {
    const key = CryptoJS.enc.Utf8.parse('e82ckenh8dichen8')
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: CryptoJS.enc.Hex.parse(text) },
      key,
      { mode: CryptoJS.mode.ECB },
    )
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8))
  } catch (e) {
    return null
  }
}

// 标准 eapi 请求（对齐 NeteaseCloudMusicApi：body 内携带客户端 header + Cookie 头）
async function eapiListenRequest(apiPath, params, cookie = '') {
  const header = buildEapiHeader(cookie)
  const body = eapiBody(apiPath, { ...params, header })
  const resp = await fetch(`${EAPI_DOMAIN}/eapi/${apiPath.replace(/^\/api\//, '')}`, {
    method: 'POST',
    headers: {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
      Referer: 'https://music.163.com/',
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookie || '',
    },
    body,
  })
  const text = await resp.text()
  let data = null
  try {
    data = JSON.parse(text)
  } catch (e) {
    data = null
  }
  if (!data && /^[0-9A-F]+$/i.test(text)) {
    data = tryEapiResDecrypt(text)
  }
  return data
}

/**
 * 官方 - 本周/本月收听数据（实时同步网易云）
 * @param {string} cookie 登录 cookie
 * @param {'week'|'month'} type 维度
 * @returns {object|null} 原始 data；失败返回 null
 */
export async function getNeteaseListenRealtimeReport(cookie, type = 'week') {
  try {
    if (!cookie) return null
    const data = await eapiListenRequest(
      '/api/content/activity/listen/data/realtime/report',
      { type },
      cookie,
    )
    if (!data || data.code !== 200 || !data.data) {
      console.error('[听歌足迹-实时报告] 返回异常:', data && data.code)
      return null
    }
    console.log('[听歌足迹-实时报告]', type, JSON.stringify(data.data).slice(0, 400))
    return data.data
  } catch (error) {
    console.error('[听歌足迹-实时报告] 请求失败:', error.message)
    return null
  }
}

/**
 * 官方 - 总收听数据（含连续收听天数）
 * @param {string} cookie 登录 cookie
 * @returns {object|null} 原始 data；失败返回 null
 */
export async function getNeteaseListenDataTotal(cookie) {
  try {
    if (!cookie) return null
    const data = await eapiListenRequest('/api/content/activity/listen/data/total', {}, cookie)
    if (!data || data.code !== 200 || !data.data) {
      console.error('[听歌足迹-总数据] 返回异常:', data && data.code)
      return null
    }
    console.log('[听歌足迹-总数据]', JSON.stringify(data.data).slice(0, 400))
    return data.data
  } catch (error) {
    console.error('[听歌足迹-总数据] 请求失败:', error.message)
    return null
  }
}

/**
 * 获取网易云每周听歌时长（分钟，实时同步网易云）
 * 优先官方听歌足迹接口 /listen/data/realtime/report；失败回退听歌排行近似统计
 * 需登录 cookie；失败返回 -1
 */
export async function getNeteaseWeeklyListenMinutes(cookie, uid) {
  try {
    const report = await getNeteaseListenRealtimeReport(cookie, 'week')
    if (report) {
      // 候选字段：时长（秒或分钟）；>10000 视为秒换算成分钟
      const raw = pickFirstNumber(report, [
        'totalListenTime', 'listenTime', 'playTime', 'totalPlayTime',
        'time', 'listenMinutes', 'totalMinutes', 'duration',
      ])
      if (raw > 0) return raw > 10000 ? Math.floor(raw / 60) : Math.floor(raw)
    }
  } catch (e) {
    console.error('官方每周听歌时长解析失败:', e.message)
  }
  // 回退：听歌排行近似计算
  try {
    const tracks = await getNeteaseListenRank(cookie, uid, 1)
    let totalSeconds = 0
    tracks.forEach((t) => {
      totalSeconds += (Number(t.playCount) || 0) * (Number(t.duration) || 0)
    })
    return Math.floor(totalSeconds / 60)
  } catch (error) {
    console.error('获取网易云每周听歌时长失败:', error)
    return -1
  }
}

/**
 * 获取网易云连续收听天数（官方听歌足迹 total 接口）
 * 返回结构字段名未知，做多候选容错解析；失败返回 -1（由本地 streak 兜底）
 */
export async function getNeteaseContinuousListenDays(cookie) {
  try {
    const data = await getNeteaseListenDataTotal(cookie)
    if (!data) return -1
    const days = pickFirstNumber(data, [
      'continuousListenDays', 'continuousListenDay', 'continuousDay',
      'listenDays', 'listenDay', 'continueListenDays', 'continueListenDay',
      'listenContinuousDays', 'totalListenDays', 'streakDays',
    ])
    return days > 0 ? Math.floor(days) : -1
  } catch (error) {
    console.error('获取网易云连续收听天数失败:', error)
    return -1
  }
}

/**
 * 获取网易云最近播放歌曲（官方 /api/play-record/song/list，需登录）
 * 返回格式化歌曲数组（含 playTime 播放时间戳）；失败返回 []
 */
export async function getNeteaseRecentSongs(cookie, limit = 50) {
  try {
    if (!cookie) return []
    const csrf = (cookie.match(/_csrf=([^;]+)/) || cookie.match(/__csrf=([^;]+)/) || [])[1] || ''
    const bodyData = weapiBody({ limit, csrf_token: csrf })
    const resp = await fetchWithTimeout(`${NETEASE_BASE}/api/play-record/song/list?csrf_token=${csrf}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: `${NETEASE_BASE}/`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: bodyData,
      timeout: 8000,
    })
    const data = await resp.json()
    if (data.code !== 200) throw new Error('最近播放返回异常: ' + data.code)
    const list = (data.data && (data.data.list || data.data)) || data.list || []
    const tracks = (Array.isArray(list) ? list : []).map((item) => {
      // play-record/song/list 的每条记录歌曲在 item.data 字段（非 item.song）
      const song = item.data || item.song || item
      const artists = song.ar || song.artists || []
      const album = song.al || song.album || {}
      return {
        id: `netease_${song.id}`,
        songmid: `netease_${song.id}`,
        platform: 'netease',
        source: 'netease',
        title: song.name || '',
        artist: artists.map((a) => a.name).join(' / '),
        album: album.name || '',
        albumId: album.id ? String(album.id) : '',
        artwork: album.picUrl || album.blurPicUrl || '',
        duration: song.dt ? Math.floor(song.dt / 1000) : 0,
        url: '',
        originalId: String(song.id),
        playTime: item.playTime || 0,
      }
    })
    console.log('[网易云最近播放] 返回', tracks.length, '首')
    return tracks
  } catch (error) {
    console.error('获取网易云最近播放失败:', error)
    return []
  }
}

/**
 * 获取网易云收藏专辑列表（官方 /api/album/sublist，需登录）
 * 返回专辑列表（含名称/封面/歌手/曲目数）；失败返回 []
 */
export async function getNeteaseAlbumSublist(cookie, offset = 0, limit = 30) {
  try {
    if (!cookie) return []
    const csrf = (cookie.match(/_csrf=([^;]+)/) || cookie.match(/__csrf=([^;]+)/) || [])[1] || ''
    const bodyData = weapiBody({ limit, offset, total: true, csrf_token: csrf })
    const resp = await fetchWithTimeout(`${NETEASE_BASE}/api/album/sublist?csrf_token=${csrf}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: `${NETEASE_BASE}/`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: bodyData,
      timeout: 8000,
    })
    const data = await resp.json()
    if (data.code !== 200) throw new Error('收藏专辑返回异常: ' + data.code)
    const raw = (data.data && (data.data.data || data.data.list || data.data)) || data.list || []
    const list = Array.isArray(raw) ? raw : []
    return list.map((album) => ({
      id: `netease_album_${album.id}`,
      albumId: String(album.id),
      name: album.name || '',
      artist: (album.artist && album.artist.name) || (album.artists || []).map((a) => a.name).join(' / ') || '未知歌手',
      artwork: album.picUrl || album.coverImgUrl || '',
      songCount: album.size || 0,
      publishTime: album.publishTime || 0,
    }))
  } catch (error) {
    console.error('获取网易云收藏专辑失败:', error)
    return []
  }
}

/**
 * 获取网易云收藏歌手列表（官方 /api/artist/sublist，需登录）
 * 返回歌手列表（含名称/头像）；失败返回 []
 */
export async function getNeteaseArtistSublist(cookie, offset = 0, limit = 30) {
  try {
    if (!cookie) return []
    const csrf = (cookie.match(/_csrf=([^;]+)/) || cookie.match(/__csrf=([^;]+)/) || [])[1] || ''
    const bodyData = weapiBody({ limit, offset, total: true, csrf_token: csrf })
    const resp = await fetchWithTimeout(`${NETEASE_BASE}/api/artist/sublist?csrf_token=${csrf}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: `${NETEASE_BASE}/`,
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookie,
      },
      body: bodyData,
      timeout: 8000,
    })
    const data = await resp.json()
    if (data.code !== 200) throw new Error('收藏歌手返回异常: ' + data.code)
    const raw = (data.data && (data.data.data || data.data.list || data.data)) || data.list || []
    const list = Array.isArray(raw) ? raw : []
    return list.map((artist) => ({
      id: `netease_artist_${artist.id}`,
      artistId: String(artist.id),
      name: artist.name || '',
      alias: (artist.alias || []).join(' / '),
      artwork: artist.picUrl || artist.img1v1Url || '',
    }))
  } catch (error) {
    console.error('获取网易云收藏歌手失败:', error)
    return []
  }
}

/**
 * 获取歌曲动态封面（网易云 eapi /api/songplay/dynamic-cover）。
 * 实测 weapi 方式该接口恒返回 code 500，必须用 eapi 才能拿到 videoPlayUrl。
 * 返回 { videoPlayUrl, ... } 或 null（无动态封面/失败）。
 */
export async function getNeteaseSongDynamicCover(songId, cookie = '') {
  try {
    if (!songId) return null
    if (!cookie) cookie = neteaseCookie
    const csrf = (cookie.match(/_csrf=([^;]+)/) || cookie.match(/__csrf=([^;]+)/) || [])[1] || ''
    const apiPath = '/api/songplay/dynamic-cover'
    const bodyData = eapiBody(apiPath, {
      songId: String(songId),
      csrf_token: csrf,
      header: buildEapiHeader(cookie),
    })
    const resp = await fetchWithTimeout(`https://interface.music.163.com/eapi${apiPath}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        Referer: 'https://music.163.com/',
        'Content-Type': 'application/x-www-form-urlencoded',
        origin: 'https://music.163.com',
        Cookie: cookie,
      },
      body: bodyData,
      timeout: 8000,
    })
    const data = await resp.json()
    if (data.code !== 200 || !data.data || !data.data.videoPlayUrl) return null
    return data.data
  } catch (error) {
    console.error('获取歌曲动态封面失败:', error)
    return null
  }
}
