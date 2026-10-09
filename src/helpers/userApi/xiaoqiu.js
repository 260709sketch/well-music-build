'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
const axios = require('axios')
const CryptoJs = require('crypto-js')
const pageSize = 20

// QQ音乐签名算法（参考 lx-music-desktop）
const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const SCRAMBLE_VALUES = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]
function zzcSign(text) {
  const hash = CryptoJs.SHA1(text).toString(CryptoJs.enc.Hex)
  const part1 = PART_1_INDEXES.map(idx => hash[idx]).join('')
  const part2 = PART_2_INDEXES.map(idx => hash[idx]).join('')
  const part3 = SCRAMBLE_VALUES.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))
  const part3Words = []
  for (let pi = 0; pi < part3.length; pi++) {
    part3Words[pi >> 2] = (part3Words[pi >> 2] || 0) | ((part3[pi] & 0xff) << (24 - (pi % 4) * 8))
  }
  const wordArray = CryptoJs.lib.WordArray.create(part3Words, part3.length)
  const b64Part = CryptoJs.enc.Base64.stringify(wordArray).replace(/[\/+=]/g, '')
  return `zzc${part1}${b64Part}${part2}`.toLowerCase()
}
function formatMusicItem(_) {
	var _a, _b, _c
	const albumid = _.albumid || ((_a = _.album) === null || _a === void 0 ? void 0 : _a.id)
	const albummid = _.albummid || ((_b = _.album) === null || _b === void 0 ? void 0 : _b.mid)
	const albumname = _.albumname || ((_c = _.album) === null || _c === void 0 ? void 0 : _c.title)
	// 容错处理 songmid 字段（QQ音乐播放需要 songmid，不是数字ID）
	const songMid = _.songmid || _.mid || _.SongMid || _.songMid || _.id || _.songid
	// 容错处理 singer 字段
	let artistName = '未知'
	if (Array.isArray(_.singer)) {
		artistName = _.singer.map((s) => s.name || s.singerName || '').filter(Boolean).join(', ')
	} else if (typeof _.singer === 'string') {
		artistName = _.singer
	} else if (_.artist) {
		artistName = typeof _.artist === 'string' ? _.artist : (_.artist.name || '未知')
	}
	return {
		id: songMid,
		songmid: songMid,
		platform: 'qq',
		source: 'qq',
		title: _.title || _.songname || _.name || '未知歌曲',
		artist: artistName,
		artwork: albummid
			? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${albummid}.jpg`
			: undefined,
		album: albumname,
		lrc: _.lyric || undefined,
		albumid: albumid,
		albummid: albummid,
		url: 'Unknown',
	}
}
function formatAlbumItem(_) {
	return {
		id: _.albumID || _.albumid,
		albumMID: _.albumMID || _.album_mid,
		title: _.albumName || _.album_name,
		artwork:
			_.albumPic ||
			`https://y.gtimg.cn/music/photo_new/T002R800x800M000${_.albumMID || _.album_mid}.jpg`,
		date: _.publicTime || _.pub_time,
		singerID: _.singerID || _.singer_id,
		artist: _.singerName || _.singer_name,
		singerMID: _.singerMID || _.singer_mid,
		description: _.desc,
	}
}
function formatArtistItem(_) {
	return {
		name: _.singerName,
		id: _.singerID,
		singerMID: _.singerMID,
		avatar: _.singerPic,
		worksNum: _.songNum,
	}
}
const searchTypeMap = {
	0: 'song',
	2: 'album',
	1: 'singer',
	3: 'songlist',
	7: 'song',
	12: 'mv',
}
const headers = {
	referer: 'https://y.qq.com',
	'user-agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
	Cookie: 'uin=',
}
async function searchBase(query, page, type, pageSize = 20) {
	console.warn('[QQ专辑] searchBase 入口, query=' + query + ' type=' + type + ' page=' + page)
	// BeansMusic 风格：search_for_qq_cp 接口（歌曲t=0，专辑t=8）
	const fetchSearchCp = async (searchType) => {
		const params = new URLSearchParams({
			format: 'json',
			w: query,
			n: String(pageSize),
			p: String(page),
			t: String(searchType),
		})
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 12000)
		try {
			const res = await fetch(`https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?${params.toString()}`, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQMusic/9.0.5',
					'Referer': 'https://y.qq.com/portal/player.html',
					'Cookie': 'uin=0; qqmusic_fromtag=66',
				},
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			const data = await res.json()
			console.warn('[QQ搜索] search_for_qq_cp 返回 code=' + data?.code + ' type=' + searchType + ' 数据=' + JSON.stringify(data).slice(0, 500))
			if (data && data.code === 0 && data.data) {
				if (searchType === 0) {
					const list = data.data.song?.list || []
					return { isEnd: (data.data.song?.totalnum || 0) <= page * pageSize, data: list }
				}
				if (searchType === 8) {
					const list = data.data.album?.list || []
					return {
						isEnd: (data.data.album?.totalnum || 0) <= page * pageSize,
						data: list.map(item => ({
							albumName: item.albumName || item.albumname || item.name || '',
							albumID: item.albumID || item.albumid || item.id || '',
							albumMID: item.albumMID || item.albummid || item.mid || '',
							albumPic: item.albumPic || item.albumpic || item.pic || '',
							publicTime: item.publicTime || item.pub_time || item.time_public || '',
							singerName: item.singerName || item.singername || (Array.isArray(item.singer) ? item.singer.map(s => s.name).join(', ') : '') || '',
							singerMID: item.singerMID || item.singermid || (Array.isArray(item.singer) && item.singer[0]?.mid) || '',
							singerID: item.singerID || item.singerid || (Array.isArray(item.singer) && item.singer[0]?.id) || '',
							desc: item.desc || item.description || '',
						})),
					}
				}
			}
			throw new Error('search_for_qq_cp 返回异常 code=' + (data?.code))
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// musicu.fcg 接口（歌手search_type=1，专辑search_type=2）
	const fetchMusicu = async (searchType) => {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 12000)
		try {
			const res = await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQMusic/9.0.5',
					'Referer': 'https://y.qq.com/',
					'Cookie': 'uin=0; qqmusic_fromtag=66',
				},
				body: JSON.stringify({
					comm: { ct: 19, cv: 1859, uin: '0', format: 'json' },
					req_1: {
						module: 'music.search.SearchCgiService',
						method: 'DoSearchForQQMusicDesktop',
						param: {
							query: query,
							num_per_page: pageSize,
							page_num: 1,
							search_type: searchType,
							grp: 1,
						},
					},
				}),
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			const data = await res.json()
			console.warn('[QQ搜索] musicu.fcg 返回 code=' + data?.code + ' req.code=' + data?.req_1?.code + ' type=' + searchType)
			if (data && data.req_1 && data.req_1.code === 0 && data.req_1.data && data.req_1.data.body) {
				if (searchType === 1) {
					const list = data.req_1.data.body.singer?.list || []
					return {
						isEnd: (data.req_1.data.meta?.sum || 0) <= page * pageSize,
						data: list.map(s => ({
							singerName: s.singerName || s.name || '',
							singerID: s.singerID || s.id || 0,
							singerMID: s.singerMID || s.mid || '',
							singerPic: s.singerPic || s.pic || '',
							songNum: s.songNum || 0,
						})),
					}
				}
				if (searchType === 2) {
					const list = data.req_1.data.body.album?.list || []
					console.warn('[QQ搜索] musicu专辑原始数据条数=' + list.length + ' 第一条=' + JSON.stringify(list[0] || {}).slice(0, 300))
					return {
						isEnd: (data.req_1.data.meta?.sum || 0) <= page * pageSize,
						data: list.map(item => ({
							albumName: item.albumName || item.albumname || item.name || '',
							albumID: item.albumID || item.albumid || item.id || '',
							albumMID: item.albumMID || item.albummid || item.mid || '',
							albumPic: String(item.albumPic || item.albumpic || item.pic || '').replace('http://', 'https://'),
							publicTime: item.publicTime || item.pub_time || item.time_public || '',
							singerName: item.singerName || item.singername || (Array.isArray(item.singer) ? item.singer.map(s => s.name).join(', ') : '') || '',
							singerMID: item.singerMID || item.singermid || (Array.isArray(item.singer) && item.singer[0]?.mid) || '',
							singerID: item.singerID || item.singerid || (Array.isArray(item.singer) && item.singer[0]?.id) || '',
							desc: item.desc || item.description || '',
						})),
					}
				}
			}
			throw new Error('musicu.fcg 返回异常 code=' + (data?.req_1?.code))
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// smartbox_new.fcg 兜底（歌手搜索）
	const fetchSmartbox = async () => {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 10000)
		try {
			const encoded = encodeURIComponent(query)
			const res = await fetch(`https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?format=json&s_from=pc_header&type=1&key=${encoded}`, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQMusic/9.0.5',
					'Referer': 'https://y.qq.com/',
				},
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			const data = await res.json()
			const list = data?.data?.singer?.itemlist || []
			if (list.length > 0) {
				return {
					isEnd: true,
					data: list.slice(0, pageSize).map(item => ({
						singerName: item.name || '',
						singerID: item.id || 0,
						singerMID: item.mid || '',
						singerPic: item.pic || '',
						songNum: 0,
					})),
				}
			}
			throw new Error('smartbox_new 返回空')
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// 专辑：client_search_cp(t=8) GET，与歌曲同主机(c.y.qq.com)，iOS 上最稳
	const fetchAlbumClientCp = async () => {
		const params = new URLSearchParams({
			format: 'json',
			w: query,
			n: String(pageSize),
			p: String(page),
			t: '8',
		})
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 12000)
		try {
			const res = await fetch(`https://c.y.qq.com/soso/fcgi-bin/client_search_cp?${params.toString()}`, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQMusic/9.0.5',
					'Referer': 'https://y.qq.com/',
					'Cookie': 'uin=0; qqmusic_fromtag=66',
				},
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			const data = await res.json()
			if (data && data.code === 0 && data.data && data.data.album) {
				const list = data.data.album.list || []
				return {
					isEnd: (data.data.album.totalnum || 0) <= page * pageSize,
					data: list.map(item => ({
						albumName: item.albumName || item.albumname || item.name || '',
						albumID: item.albumID || item.albumid || item.id || '',
						albumMID: item.albumMID || item.albummid || item.mid || '',
						albumPic: item.albumPic || item.albumpic || item.pic || '',
						publicTime: item.publicTime || item.pub_time || '',
						singerName: item.singerName || item.singername
							|| (Array.isArray(item.singer_list) ? item.singer_list.map(x => x.name).join(', ') : '')
							|| (Array.isArray(item.singer) ? item.singer.map(x => x.name).join(', ') : '') || '',
						singerMID: item.singerMID || item.singermid
							|| (Array.isArray(item.singer_list) && item.singer_list[0]?.mid)
							|| (Array.isArray(item.singer) && item.singer[0]?.mid) || '',
						singerID: item.singerID || item.singerid
							|| (Array.isArray(item.singer_list) && item.singer_list[0]?.id) || '',
						desc: item.desc || '',
					})),
				}
			}
			throw new Error('client_search_cp 专辑返回空 code=' + (data?.code))
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// smartbox 专辑兜底（GET，结果较少但稳定）
	const fetchAlbumSmartbox = async () => {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 10000)
		try {
			const encoded = encodeURIComponent(query)
			const res = await fetch(`https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg?format=json&s_from=pc_header&type=1&key=${encoded}`, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQMusic/9.0.5',
					'Referer': 'https://y.qq.com/',
				},
				signal: controller.signal,
			})
			clearTimeout(timeoutId)
			const data = await res.json()
			const list = data?.data?.album?.itemlist || []
			if (list.length > 0) {
				return {
					isEnd: true,
					data: list.slice(0, pageSize).map(item => ({
						albumName: item.name || '',
						albumID: item.id || '',
						albumMID: item.mid || '',
						albumPic: item.pic || '',
						publicTime: '',
						singerName: item.singer || '',
						singerMID: '',
						singerID: '',
						desc: '',
					})),
				}
			}
			throw new Error('smartbox 专辑返回空')
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// Moumusic 方案：QQ音乐安卓App签名接口 musics.fcg（DoSearchForQQMusicMobile, search_type=2），真机最稳
	const fetchAlbumMobileSigned = async () => {
		const body = {
			comm: {
				ct: '11', cv: '14090508', v: '14090508', tmeAppID: 'qqmusic',
				phonetype: 'EBG-AN10', deviceScore: '553.47', devicelevel: '50', newdevicelevel: '20',
				rom: 'HuaWei/EMOTION/EmotionUI_14.2.0', os_ver: '12',
				OpenUDID: '0', OpenUDID2: '0', QIMEI36: '0', udid: '0', chid: '0', aid: '0',
				oaid: '0', taid: '0', tid: '0', wid: '0', uid: '0', sid: '0',
				modeSwitch: '6', teenMode: '0', ui_mode: '2', nettype: '1020', v4ip: '',
			},
			req: {
				module: 'music.search.SearchCgiService',
				method: 'DoSearchForQQMusicMobile',
				param: {
					search_type: 2,
					searchid: String(Math.random()).slice(2),
					query,
					page_num: page,
					num_per_page: pageSize,
					highlight: 0, nqc_flag: 0, multi_zhida: 0, cat: 2, grp: 1, sin: 0, sem: 0,
				},
			},
		}
		const text = JSON.stringify(body)
		const sign = zzcSign(text)
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 12000)
		try {
			const res = await fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'User-Agent': 'QQMusic 14090508(android 12)' },
				body: text,
				signal: controller.signal,
			})
			const data = await res.json()
			const reqData = data && data.req && data.req.data
			const list = (reqData && reqData.body && reqData.body.item_album) || []
			console.warn('[QQ搜索] mobile签名专辑条数=' + list.length)
			if (data && data.code === 0 && data.req && data.req.code === 0 && list.length > 0) {
				const total = (reqData.meta && (reqData.meta.estimate_sum || reqData.meta.sum)) || 0
				return {
					isEnd: total ? total <= page * pageSize : list.length < pageSize,
					data: list.map(item => ({
						albumName: item.name || '',
						albumID: item.id || '',
						albumMID: item.albummid || '',
						albumPic: item.albummid ? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${item.albummid}.jpg` : '',
						publicTime: item.publish_date || item.description || '',
						singerName: (Array.isArray(item.singer_list) && item.singer_list.length)
							? item.singer_list.map(x => String(x.name || '').replace(/<\/?em>/g, '')).filter(Boolean).join(', ')
							: String(item.singer || '').replace(/<\/?em>/g, ''),
						singerMID: (Array.isArray(item.singer_list) && item.singer_list[0] && item.singer_list[0].mid) || '',
						singerID: item.singer_id || (Array.isArray(item.singer_list) && item.singer_list[0] && item.singer_list[0].id) || '',
						desc: (item.desc_detail && item.desc_detail.desc) || '',
					})),
				}
			}
			throw new Error('mobile签名专辑返回空 req.code=' + (data && data.req && data.req.code))
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// GET+JSONP 方式 musicu.fcg 专辑搜索（无需签名，与歌手主页专辑请求方式完全一致，iOS 真机最稳，专辑搜索首选）
	const fetchAlbumMusicuGet = async () => {
		const cb = 'getUCGI' + Math.floor(Math.random() * 1e10)
		const dataParam = encodeURIComponent(JSON.stringify({
			albumSearch: {
				module: 'music.search.SearchCgiService',
				method: 'DoSearchForQQMusicDesktop',
				param: { query, num_per_page: pageSize, page_num: page, search_type: 2, grp: 1 },
			},
		}))
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 10000)
		try {
			const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?callback=${cb}&g_tk=5381&jsonpCallback=${cb}&loginUin=0&hostUin=0&format=jsonp&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0&data=${dataParam}`
			const res = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQMusic/9.0.5',
					'Referer': 'https://y.qq.com/',
				},
				signal: controller.signal,
			})
			const txt = await res.text()
			let json
			try {
				json = JSON.parse(txt.slice(txt.indexOf('(') + 1, txt.lastIndexOf(')')))
			} catch (e) {
				json = JSON.parse(txt)
			}
			const node = json && json.albumSearch
			const bodyNode = node && node.data && node.data.body
			const list = (bodyNode && (((bodyNode.album && bodyNode.album.list) || bodyNode.item_album))) || []
			console.warn('[QQ搜索] musicuGET专辑条数=' + list.length)
			if (node && node.code === 0 && list.length > 0) {
				const meta = node.data.meta || {}
				const total = meta.estimate_sum || meta.sum || 0
				return {
					isEnd: total ? total <= page * pageSize : list.length < pageSize,
					data: list.map(item => ({
						albumName: item.albumName || item.albumname || item.name || '',
						albumID: item.albumID || item.albumid || item.id || '',
						albumMID: item.albumMID || item.albummid || item.mid || '',
						albumPic: String(item.albumPic || item.albumpic || item.pic || '').replace('http://', 'https://'),
						publicTime: item.publicTime || item.pub_time || item.time_public || '',
						singerName: item.singerName || item.singername
							|| (Array.isArray(item.singer_list) ? item.singer_list.map(x => x.name).join(', ') : '')
							|| (Array.isArray(item.singer) ? item.singer.map(x => x.name).join(', ') : '') || '',
						singerMID: item.singerMID || item.singermid
							|| (Array.isArray(item.singer_list) && item.singer_list[0] && item.singer_list[0].mid)
							|| (Array.isArray(item.singer) && item.singer[0] && item.singer[0].mid) || '',
						singerID: item.singerID || item.singerid
							|| (Array.isArray(item.singer_list) && item.singer_list[0] && item.singer_list[0].id) || '',
						desc: item.desc || '',
					})),
				}
			}
			throw new Error('musicuGET 专辑返回空 code=' + (node && node.code))
		} finally {
			clearTimeout(timeoutId)
		}
	}

	// 根据类型选择搜索策略
	if (type === 0) {
		// 歌曲：search_for_qq_cp t=0
		for (let attempt = 0; attempt < 3; attempt++) {
			try {
				const result = await fetchSearchCp(0)
				if (result.data.length > 0) return result
			} catch (e) { console.warn('[QQ搜索] 歌曲搜索失败:', e.message) }
			if (attempt < 2) await new Promise(r => setTimeout(r, 500 * (attempt + 1)))
		}
	}

	if (type === 1) {
		// 歌手：musicu search_type=1 -> smartbox兜底 -> 歌曲结果提取
		try {
			const result = await fetchMusicu(1)
			if (result.data.length > 0) return result
		} catch (e) { console.warn('[QQ搜索] 歌手musicu失败:', e.message) }
		try {
			const result = await fetchSmartbox()
			if (result.data.length > 0) return result
		} catch (e) { console.warn('[QQ搜索] 歌手smartbox失败:', e.message) }
	}

	if (type === 2) {
		// 专辑：朴素串行（不依赖 Promise.any），第一路即与歌曲同主机同接口的 search_for_qq_cp?t=8（手机端已验证放行）
		console.warn('[QQ专辑] >> 进入专辑搜索块, query=' + query)
		const runOne = async (fn, label) => {
			try {
				console.warn('[QQ专辑] 尝试 ' + label)
				const r = await fn()
				const n = r && r.data ? r.data.length : -1
				console.warn('[QQ专辑] ' + label + ' 完成, 条数=' + n)
				if (n > 0) return r
			} catch (e) {
				console.warn('[QQ专辑] ' + label + ' 失败: ' + (e && e.message))
			}
			return null
		}
		let r = await runOne(() => fetchSearchCp(8), 'search_for_qq_cp(t8)')
		if (r) return r
		r = await runOne(() => fetchMusicu(2), 'musicuDesktop(t2)')
		if (r) return r
		r = await runOne(fetchAlbumMobileSigned, 'mobileSigned')
		if (r) return r
		r = await runOne(fetchAlbumClientCp, 'client_cp(t8)')
		if (r) return r
		r = await runOne(fetchAlbumMusicuGet, 'musicuGet')
		if (r) return r
		r = await runOne(fetchAlbumSmartbox, 'smartbox')
		if (r) return r
		console.warn('[QQ专辑] 所有专辑接口均返回空')
	}

	return { isEnd: true, data: [] }
}

export async function searchMusic(query, page, pageSize) {
	const songs = await searchBase(query, page, 0, pageSize)
	return {
		isEnd: songs.isEnd,
		data: songs.data.map(formatMusicItem),
	}
}
export async function searchAlbum(query, page) {
	console.warn('[QQ专辑] searchAlbum 函数体开始, query=' + query + ' typeof searchBase=' + typeof searchBase)
	let albums
	try {
		albums = await searchBase(query, page, 2)
	} catch (e) {
		console.warn('[QQ专辑] searchBase(...,2) reject: ' + (e && e.message))
		throw e
	}
	console.warn('[QQ专辑] searchBase(...,2) 返回, isEnd=' + albums.isEnd + ' isArr=' + Array.isArray(albums.data) + ' len=' + (albums.data ? albums.data.length : 'undefined'))
	const list = Array.isArray(albums.data) ? albums.data : []
	return {
		isEnd: albums.isEnd,
		data: list.map((item) => {
			try { return formatAlbumItem(item) } catch (e) {
				console.warn('[QQ专辑] formatAlbumItem 失败: ' + (e && e.message))
				return { title: item.albumname || item.name || '未知专辑', artist: item.singername || item.singer || '', artwork: '' }
			}
		}),
	}
}
export async function searchArtist(query, page) {
	const artists = await searchBase(query, page, 1)
	return {
		isEnd: artists.isEnd,
		data: artists.data.map(formatArtistItem),
	}
}
async function searchMusicSheet(query, page) {
	const musicSheet = await searchBase(query, page, 3)
	return {
		isEnd: musicSheet.isEnd,
		data: musicSheet.data.map((item) => ({
			title: item.dissname,
			createAt: item.createtime,
			description: item.introduction,
			playCount: item.listennum,
			worksNums: item.song_count,
			artwork: item.imgurl,
			id: item.dissid,
			artist: item.creator.name,
		})),
	}
}
export async function searchLyric(query, page) {
	const songs = await searchBase(query, page, 7)
	return {
		isEnd: songs.isEnd,
		data: songs.data.map((it) =>
			Object.assign(Object.assign({}, formatMusicItem(it)), { rawLrcTxt: it.content }),
		),
	}
}
function getQueryFromUrl(key, search) {
	try {
		const sArr = search.split('?')
		let s = ''
		if (sArr.length > 1) {
			s = sArr[1]
		} else {
			return key ? undefined : {}
		}
		const querys = s.split('&')
		const result = {}
		querys.forEach((item) => {
			const temp = item.split('=')
			result[temp[0]] = decodeURIComponent(temp[1])
		})
		return key ? result[key] : result
	} catch (err) {
		return key ? '' : {}
	}
}
function changeUrlQuery(obj, baseUrl) {
	const query = getQueryFromUrl(null, baseUrl)
	let url = baseUrl.split('?')[0]
	const newQuery = Object.assign(Object.assign({}, query), obj)
	let queryArr = []
	Object.keys(newQuery).forEach((key) => {
		if (newQuery[key] !== undefined && newQuery[key] !== '') {
			queryArr.push(`${key}=${encodeURIComponent(newQuery[key])}`)
		}
	})
	return `${url}?${queryArr.join('&')}`.replace(/\?$/, '')
}
const typeMap = {
	m4a: {
		s: 'C400',
		e: '.m4a',
	},
	128: {
		s: 'M500',
		e: '.mp3',
	},
	320: {
		s: 'M800',
		e: '.mp3',
	},
	ape: {
		s: 'A000',
		e: '.ape',
	},
	flac: {
		s: 'F000',
		e: '.flac',
	},
}
async function getAlbumInfo(albumItem) {
	const url = changeUrlQuery(
		{
			data: JSON.stringify({
				comm: {
					ct: 24,
					cv: 10000,
				},
				albumSonglist: {
					method: 'GetAlbumSongList',
					param: {
						albumMid: albumItem.albumMID,
						albumID: 0,
						begin: 0,
						num: 999,
						order: 2,
					},
					module: 'music.musichallAlbum.AlbumSongList',
				},
			}),
		},
		'https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8',
	)
	const res = (
		await (0, axios_1.default)({
			url: url,
			headers: headers,
			xsrfCookieName: 'XSRF-TOKEN',
			withCredentials: true,
		})
	).data
	return {
		musicList: res.albumSonglist.data.songList.map((item) => {
			const _ = item.songInfo
			return formatMusicItem(_)
		}),
	}
}
async function getArtistSongs(artistItem, page) {
	const url = changeUrlQuery(
		{
			data: JSON.stringify({
				comm: {
					ct: 24,
					cv: 0,
				},
				singer: {
					method: 'get_singer_detail_info',
					param: {
						sort: 5,
						singermid: artistItem.singerMID,
						sin: (page - 1) * pageSize,
						num: pageSize,
					},
					module: 'music.web_singer_info_svr',
				},
			}),
		},
		'http://u.y.qq.com/cgi-bin/musicu.fcg',
	)
	const res = (
		await (0, axios_1.default)({
			url: url,
			method: 'get',
			headers: headers,
			xsrfCookieName: 'XSRF-TOKEN',
			withCredentials: true,
		})
	).data
	return {
		isEnd: res.singer.data.total_song <= page * pageSize,
		data: res.singer.data.songlist.map(formatMusicItem),
	}
}
async function getArtistAlbums(artistItem, page) {
	const url = changeUrlQuery(
		{
			data: JSON.stringify({
				comm: {
					ct: 24,
					cv: 0,
				},
				singerAlbum: {
					method: 'get_singer_album',
					param: {
						singermid: artistItem.singerMID,
						order: 'time',
						begin: (page - 1) * pageSize,
						num: pageSize / 1,
						exstatus: 1,
					},
					module: 'music.web_singer_info_svr',
				},
			}),
		},
		'http://u.y.qq.com/cgi-bin/musicu.fcg',
	)
	const res = (
		await (0, axios_1.default)({
			url,
			method: 'get',
			headers: headers,
			xsrfCookieName: 'XSRF-TOKEN',
			withCredentials: true,
		})
	).data
	return {
		isEnd: res.singerAlbum.data.total <= page * pageSize,
		data: res.singerAlbum.data.list.map(formatAlbumItem),
	}
}
async function getArtistWorks(artistItem, page, type) {
	if (type === 'music') {
		return getArtistSongs(artistItem, page)
	}
	if (type === 'album') {
		return getArtistAlbums(artistItem, page)
	}
}
async function getLyric(musicItem) {
	const result = (
		await (0, axios_1.default)({
			url: `http://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=${musicItem.songmid}&pcachetime=${new Date().getTime()}&g_tk=5381&loginUin=0&hostUin=0&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`,
			headers: { Referer: 'https://y.qq.com', Cookie: 'uin=' },
			method: 'get',
			xsrfCookieName: 'XSRF-TOKEN',
			withCredentials: true,
		})
	).data
	const res = JSON.parse(result.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, ''))
	let translation
	if (res.trans) {
		translation = he.decode(CryptoJs.enc.Base64.parse(res.trans).toString(CryptoJs.enc.Utf8))
	}
	return {
		rawLrc: he.decode(CryptoJs.enc.Base64.parse(res.lyric).toString(CryptoJs.enc.Utf8)),
		translation,
	}
}
async function importMusicSheet(urlLike) {
	let id
	if (!id) {
		id = (urlLike.match(
			/https?:\/\/i\.y\.qq\.com\/n2\/m\/share\/details\/taoge\.html\?.*id=([0-9]+)/,
		) || [])[1]
	}
	if (!id) {
		id = (urlLike.match(/https?:\/\/y\.qq\.com\/n\/ryqq\/playlist\/([0-9]+)/) || [])[1]
	}
	if (!id) {
		id = (urlLike.match(/^(\d+)$/) || [])[1]
	}
	if (!id) {
		return
	}
	const result = (
		await (0, axios_1.default)({
			url: `http://i.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&utf8=1&disstid=${id}&loginUin=0`,
			headers: { Referer: 'https://y.qq.com/n/yqq/playlist', Cookie: 'uin=' },
			method: 'get',
			xsrfCookieName: 'XSRF-TOKEN',
			withCredentials: true,
		})
	).data
	const res = JSON.parse(result.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, ''))
	return res.cdlist[0].songlist.map(formatMusicItem)
}
async function getTopLists() {
	const list = await (0, axios_1.default)({
		url: 'https://u.y.qq.com/cgi-bin/musicu.fcg?_=1577086820633&data=%7B%22comm%22%3A%7B%22g_tk%22%3A5381%2C%22uin%22%3A123456%2C%22format%22%3A%22json%22%2C%22inCharset%22%3A%22utf-8%22%2C%22outCharset%22%3A%22utf-8%22%2C%22notice%22%3A0%2C%22platform%22%3A%22h5%22%2C%22needNewCode%22%3A1%2C%22ct%22%3A23%2C%22cv%22%3A0%7D%2C%22topList%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetAll%22%2C%22param%22%3A%7B%7D%7D%7D',
		method: 'get',
		headers: {
			Cookie: 'uin=',
		},
		xsrfCookieName: 'XSRF-TOKEN',
		withCredentials: true,
	})
	return list.data.topList.data.group.map((e) => ({
		title: e.groupName,
		data: e.toplist.map((_) => ({
			id: _.topId,
			description: _.intro,
			title: _.title,
			period: _.period,
			coverImg: _.headPicUrl || _.frontPicUrl,
		})),
	}))
}
async function getTopListDetail(topListItem) {
	var _a
	const res = await (0, axios_1.default)({
		url: `https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&data=%7B%22detail%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetDetail%22%2C%22param%22%3A%7B%22topId%22%3A${topListItem.id}%2C%22offset%22%3A0%2C%22num%22%3A100%2C%22period%22%3A%22${(_a = topListItem.period) !== null && _a !== void 0 ? _a : ''}%22%7D%7D%2C%22comm%22%3A%7B%22ct%22%3A24%2C%22cv%22%3A0%7D%7D`,
		method: 'get',
		headers: {
			Cookie: 'uin=',
		},
		xsrfCookieName: 'XSRF-TOKEN',
		withCredentials: true,
	})
	return Object.assign(Object.assign({}, topListItem), {
		musicList: res.data.detail.data.songInfoList.map(formatMusicItem),
	})
}
async function getRecommendSheetTags() {
	const res = (
		await axios_1.default.get(
			'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_tag_conf.fcg?format=json&inCharset=utf8&outCharset=utf-8',
			{
				headers: {
					referer: 'https://y.qq.com/',
				},
			},
		)
	).data.data.categories
	const data = res.slice(1).map((_) => ({
		title: _.categoryGroupName,
		data: _.items.map((tag) => ({
			id: tag.categoryId,
			title: tag.categoryName,
		})),
	}))
	const pinned = []
	for (let d of data) {
		if (d.data.length) {
			pinned.push(d.data[0])
		}
	}
	return {
		pinned,
		data,
	}
}
async function getRecommendSheetsByTag(tag, page) {
	const pageSize = 20
	const rawRes = (
		await axios_1.default.get('https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg', {
			headers: {
				referer: 'https://y.qq.com/',
			},
			params: {
				inCharset: 'utf8',
				outCharset: 'utf-8',
				sortId: 5,
				categoryId: (tag === null || tag === void 0 ? void 0 : tag.id) || '10000000',
				sin: pageSize * (page - 1),
				ein: page * pageSize - 1,
			},
		})
	).data
	const res = JSON.parse(
		rawRes.replace(/callback\(|MusicJsonCallback\(|jsonCallback\(|\)$/g, ''),
	).data
	const isEnd = res.sum <= page * pageSize
	const data = res.list.map((item) => {
		var _a, _b
		return {
			id: item.dissid,
			createTime: item.createTime,
			title: item.dissname,
			artwork: item.imgurl,
			description: item.introduction,
			playCount: item.listennum,
			artist:
				(_b = (_a = item.creator) === null || _a === void 0 ? void 0 : _a.name) !== null &&
				_b !== void 0
					? _b
					: '',
		}
	})
	return {
		isEnd,
		data,
	}
}
async function getMusicSheetInfo(sheet, page) {
	const data = await importMusicSheet(sheet.id)
	return {
		isEnd: true,
		musicList: data,
	}
}
const qualityLevels = {
	low: '128k',
	standard: '320k',
	high: '320k',
	super: '320k',
}
export async function getMediaSource(musicItem, quality) {
	console.log(`https://render.niuma666bet.buzz/url/tx/${musicItem.id}/${quality}`)
	const res = (
		await axios.default.get(`https://render.niuma666bet.buzz/url/tx/${musicItem.id}/${quality}`, {
			headers: {
				'X-Request-Key': 'share-v2',
			},
		})
	).data
	console.log(res)
	return {
		url: res.url,
	}
}
module.exports = {
	platform: '小秋音乐',
	author: 'Huibq',
	version: '0.2.0',
	srcUrl: 'https://raw.niuma666bet.buzz/Huibq/keep-alive/master/Music_Free/xiaoqiu.js',
	cacheControl: 'no-cache',
	hints: {
		importMusicSheet: [
			'QQ音乐APP：自建歌单-分享-分享到微信好友/QQ好友；然后点开并复制链接，直接粘贴即可',
			'H5：复制URL并粘贴，或者直接输入纯数字歌单ID即可',
			'导入时间和歌单大小有关，请耐心等待',
		],
	},
	primaryKey: ['id', 'songmid'],
	supportedSearchType: ['music', 'album', 'sheet', 'artist', 'lyric'],
	async search(query, page, type) {
		if (type === 'music') {
			return await searchMusic(query, page)
		}
		if (type === 'album') {
			return await searchAlbum(query, page)
		}
		if (type === 'artist') {
			return await searchArtist(query, page)
		}
		if (type === 'sheet') {
			return await searchMusicSheet(query, page)
		}
		if (type === 'lyric') {
			return await searchLyric(query, page)
		}
	},
	getMediaSource,
	searchMusic,
	searchArtist,
	searchAlbum,
	searchLyric,
	getAlbumInfo,
	getArtistWorks,
	importMusicSheet,
	getTopLists,
	getTopListDetail,
	getRecommendSheetTags,
	getRecommendSheetsByTag,
	getMusicSheetInfo,
	getQQMusicUrl,
}

// QQ音乐播放地址获取（内置快速回退）
async function getQQMusicUrl(songmid, quality = 'standard') {
	try {
		const qualityMap = {
			standard: { br: 128000, prefix: 'M500' },
			higher: { br: 192000, prefix: 'M500' },
			exhigh: { br: 320000, prefix: 'M800' },
			lossless: { br: 999000, prefix: 'A000' },
		}
		const q = qualityMap[quality] || qualityMap.standard
		const guid = String(Math.floor(Math.random() * 10000000000))
		const res = await (0, axios.default)({
			url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
			method: 'POST',
			data: {
				req_0: {
					module: 'vkey.GetVkeyServer',
					method: 'CgiGetVkey',
					param: {
						guid: guid,
						songmid: [songmid],
						songtype: [0],
						uin: '0',
						loginflag: 1,
						platform: '20',
					},
				},
				comm: {
					uin: 0,
					format: 'json',
					ct: 24,
					cv: 0,
				},
			},
			headers: {
				referer: 'https://y.qq.com',
				'user-agent':
					'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
			},
			timeout: 5000,
		})
		const data = res.data
		if (data && data.req_0 && data.req_0.data && data.req_0.data.midurlinfo && data.req_0.data.midurlinfo[0]) {
			const purl = data.req_0.data.midurlinfo[0].purl
			const sip = data.req_0.data.sip || []
			if (purl && sip.length > 0) {
				return sip[0] + purl
			}
		}
		return null
	} catch (error) {
		console.error('QQ音乐内置播放地址获取失败:', error.message)
		return null
	}
}
