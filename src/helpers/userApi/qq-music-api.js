// QQ 音乐 API 合集
// 作者：Copcin
// 搜索接口已对齐 LX-Y Music：移动端 SearchCgiService + zzcSign 签名

import sha1 from 'crypto-js/sha1'

// ========== zzcSign 签名（对齐 LX mobile）==========
const PART_1_INDEXES = [23, 14, 6, 36, 16, 40, 7, 19]
const PART_2_INDEXES = [16, 1, 32, 12, 19, 27, 8, 5]
const SCRAMBLE_VALUES = [89, 39, 179, 150, 218, 82, 58, 252, 177, 52, 186, 123, 120, 64, 242, 133, 143, 161, 121, 179]

function pickHashByIdx(hash, indexes) {
	return indexes.map((idx) => hash[idx]).join('')
}

function bytesToBase64(bytes) {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	let result = ''
	for (let i = 0; i < bytes.length; i += 3) {
		const b1 = bytes[i] || 0
		const b2 = bytes[i + 1] || 0
		const b3 = bytes[i + 2] || 0
		result += chars[b1 >> 2]
		result += chars[((b1 & 3) << 4) | (b2 >> 4)]
		result += i + 1 < bytes.length ? chars[((b2 & 15) << 2) | (b3 >> 6)] : '='
		result += i + 2 < bytes.length ? chars[b3 & 63] : '='
	}
	return result.replace(/[\/+=]/g, '')
}

async function zzcSign(text) {
	const hash = sha1(text).toString()
	const part1 = pickHashByIdx(hash, PART_1_INDEXES)
	const part2 = pickHashByIdx(hash, PART_2_INDEXES)
	const part3 = SCRAMBLE_VALUES.map((value, i) => value ^ parseInt(hash.slice(i * 2, i * 2 + 2), 16))
	const b64Part = bytesToBase64(part3)
	return `zzc${part1}${b64Part}${part2}`.toLowerCase()
}

function getComm() {
	return {
		ct: '11', cv: '14090508', v: '14090508', tmeAppID: 'qqmusic',
		phonetype: 'EBG-AN10', deviceScore: '553.47', devicelevel: '50', newdevicelevel: '20',
		rom: 'HuaWei/EMOTION/EmotionUI_14.2.0', os_ver: '12',
		OpenUDID: '0', OpenUDID2: '0', QIMEI36: '0', udid: '0', chid: '0', aid: '0',
		oaid: '0', taid: '0', tid: '0', wid: '0', uid: '0', sid: '0',
		modeSwitch: '6', teenMode: '0', ui_mode: '2', nettype: '1020', v4ip: '',
	}
}

async function signRequest(data) {
	const sign = await zzcSign(JSON.stringify(data))
	return fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'User-Agent': 'QQMusic 14090508(android 12)',
			'Accept': 'application/json',
		},
		body: JSON.stringify(data),
	}).then(r => r.json())
}

// 所有 API 均有 origin 选项方便调试，默认为 false
// 若 origin 为 true 则直接返回请求返回的 data

// 获取音乐 URL
// API：https://u.y.qq.com/cgi-bin/musicu.fcg
//
// songmid: 歌曲 MID（字符串）
// quality: 歌曲品质（字符串），有 m4a、128、320（默认）可选，其中 128、320 为 MP3 格式，默认为 320
// server: 默认为 0，若为 0 使用 http://ws.stream.qqmusic.qq.com 服务器，
// 若为 1 使用 http://isure.stream.qqmusic.qq.com 服务器
// 若为 2 使用 http://dl.stream.qqmusic.qq.com 服务器（非官方提供）
export let getMusicURL = async (songmid, quality = '320', server = 0, origin = false) => {
	return await fetch(
		'https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&data={%22req_0%22:{%22module%22:%22vkey.GetVkeyServer%22,%22method%22:%22CgiGetVkey%22,%22param%22:{%22filename%22:[%22PREFIXSONGMIDSONGMID.SUFFIX%22],%22guid%22:%2210000%22,%22songmid%22:[%22SONGMID%22],%22songtype%22:[0],%22uin%22:%220%22,%22loginflag%22:1,%22platform%22:%2220%22}},%22loginUin%22:%220%22,%22comm%22:{%22uin%22:%220%22,%22format%22:%22json%22,%22ct%22:24,%22cv%22:0}}'
			.replaceAll('SONGMID', songmid)
			.replaceAll(
				'PREFIX',
				quality.toLowerCase() == 'm4a' ? 'C400' : quality == '128' ? 'M500' : 'M800',
			)
			.replaceAll('SUFFIX', quality.toLowerCase() == 'm4a' ? 'm4a' : 'mp3'),
	)
		.then((res) => res.json())
		.then((data) => {
			if (origin) return data
			else {
				const purl = data.req_0.data.midurlinfo[0].purl
				if (server == 1) {
					return 'http://isure.stream.qqmusic.qq.com/' + purl
				} else if (server == 2) {
					return 'http://dl.stream.qqmusic.qq.com/' + purl
				} else {
					return 'http://ws.stream.qqmusic.qq.com/' + purl
				}
			}
		})
		.catch((err) => {
			console.log(err)
		})
}

// 获取歌单歌曲信息
// API：https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg
//
// categoryID：歌单 ID
export let getSongList = async (categoryID, origin = false) => {
	return await fetch(
		'https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&nosign=1&disstid=CATEGORYID&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=GB2312&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0'.replaceAll(
			'CATEGORYID',
			categoryID,
		),
	)
		.then((res) => res.json())
		.then((data) => {
			if (origin) return data
			else return data.cdlist[0].songlist
		})
		.catch((err) => {
			console.log(err)
		})
}

// 获取歌单名称
// API：https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg
//
// categoryID：歌单 ID
export let getSongListName = async (categoryID, origin = false) => {
	return await getSongList(categoryID, true).then((data) => {
		if (origin) return data
		else return data.cdlist[0].dissname
	})
}

// 用关键词搜索歌曲（LX-Y Music 移动端签名版）
// API: https://u.y.qq.com/cgi-bin/musics.fcg?sign=xxx (POST)
//
// keyword: 关键词（字符串）
// searchType: 搜索结果类型（默认为 0），0 为歌曲，1 为歌手，2 为专辑，3 为歌单，4 为 MV，7 为歌词，8 为用户
// resultNum: （每页）结果数量（默认为 50）
// pageNum: 页面序号（默认为 1）
export let searchWithKeyword = async (
	keyword,
	searchType = 0,
	resultNum = 50,
	pageNum = 1,
	origin = false,
) => {
	const postData = {
		comm: getComm(),
		req: {
			module: 'music.search.SearchCgiService',
			method: 'DoSearchForQQMusicMobile',
			param: {
				search_type: searchType,
				searchid: Math.random().toString().slice(2),
				query: keyword,
				page_num: pageNum,
				num_per_page: resultNum,
				highlight: 0,
				nqc_flag: 0,
				multi_zhida: 0,
				cat: 2,
				grp: 1,
				sin: 0,
				sem: 0,
			},
		},
	}

	const sign = await zzcSign(JSON.stringify(postData))

	return await fetch(`https://u.y.qq.com/cgi-bin/musics.fcg?sign=${sign}`, {
		method: 'POST',
		headers: {
			'User-Agent': 'QQMusic 14090508(android 12)',
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(postData),
	})
		.then((res) => res.json())
		.then((data) => {
			if (origin) return data
			// 移动端 SearchCgiService 的列表在 req.data.body.item_song（兼容旧结构 req.data.item_song）
			const resultData = data.req?.data?.body || data.req?.data
			if (!resultData) return []

			switch (searchType) {
				case 0:
				case 7: {
					const list = resultData.item_song || []
					return list.map((item) => ({
						...item,
						songname: item.title,
						songmid: item.mid,
						albumname: item.album?.name || '',
						albummid: item.album?.mid || '',
						strMediaMid: item.file?.media_mid || '',
						singer: item.singer?.map((s) => ({ name: s.name, mid: s.mid, id: s.id })) || [],
					}))
				}
				case 1: {
					const list = resultData.item_singer || resultData.singer || []
					return list.map((item) => ({
						...item,
						singername: item.name || item.singer_name,
						singermid: item.mid,
					}))
				}
				case 2: {
					const list = resultData.item_album || []
					return list.map((item) => ({
						...item,
						albumname: item.name,
						albummid: item.mid,
					}))
				}
				case 3:
					return resultData.item_songlist || resultData.body?.songlist?.list || []
				case 4:
					return resultData.item_mv || []
				case 8:
					return resultData.item_user || []
				default:
					return resultData
			}
		})
		.catch((err) => {
			console.log('QQ音乐搜索失败:', err)
			return []
		})
}

// 获取歌曲歌词
// API: https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg
//
// songmid: 歌曲 MID（字符串）
// parse: 是否需要解析歌词（默认为 false)，若为 true 则调用 parseLyric 函数对请求到的歌词字符串进行解析。
// 解析效果见 parseLyric 的注释。
export let getSongLyric = async (songmid, parse = false, origin = false) => {
	return await fetch(
		'https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?songmid=SONGMID&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1'.replaceAll(
			'SONGMID',
			songmid,
		),
	)
		.then((res) => res.json())
		.then((data) => {
			if (origin) return data
			else {
				if (!parse) {
					return data.lyric + '\n' + data.trans
				} else return parseLyric(data)
			}
		})
		.catch((err) => {
			console.log(err)
		})
}

// 获取专辑歌曲信息
// API: https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg
//
// albummid: 专辑的 MID
export let getAlbumSongList = async (albummid, origin = false) => {
	return await fetch(
		'https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?platform=h5page&albummid=ALBUMMID&g_tk=938407465&uin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=h5&needNewCode=1&_=1459961045571'.replaceAll(
			'ALBUMMID',
			albummid,
		),
	)
		.then((res) => res.json())
		.then((data) => {
			if (origin) return data
			else return data.data.list
		})
		.catch((err) => {
			console.log(err)
		})
}

// 获取专辑名称
// API: https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg
//
// albummid: 专辑的 MID
export let getAlbumName = async (albummid, origin = false) => {
	return await getAlbumSongList(albummid, true).then((data) => {
		if (origin) return data
		else return data.data.name
	})
}

// 获取 MV 信息
// API: https://u.y.qq.com/cgi-bin/musicu.fcg
//
// vid: MV 的 VID
// 本 API 返回的 Data 已是最简的 JSON，所以无论 origin 是否为 true 都直接返回 data。
export let getMVInfo = async (vid, origin = true) => {
	return await fetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
		credentials: 'include',
		headers: {
			'User-Agent':
				'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0',
			Accept: '*/*',
			'Accept-Language': 'zh-CN,zh;q=0.8,zh-TW;q=0.7,zh-HK;q=0.5,en-US;q=0.3,en;q=0.2',
			'Content-type': 'application/x-www-form-urlencoded',
			'Sec-Fetch-Dest': 'empty',
			'Sec-Fetch-Mode': 'cors',
			'Sec-Fetch-Site': 'same-site',
		},
		referrer: 'https://y.qq.com/',
		body: '{"comm":{"ct":6,"cv":0,"g_tk":1646675364,"uin":0,"format":"json","platform":"yqq"},"mvInfo":{"module":"music.video.VideoData","method":"get_video_info_batch","param":{"vidlist":["VID"],"required":["vid","type","sid","cover_pic","duration","singers","new_switch_str","video_pay","hint","code","msg","name","desc","playcnt","pubdate","isfav","fileid","filesize_v2","switch_pay_type","pay","pay_info","uploader_headurl","uploader_nick","uploader_uin","uploader_encuin","play_forbid_reason"]}},"mvUrl":{"module":"music.stream.MvUrlProxy","method":"GetMvUrls","param":{"vids":["VID"],"request_type":10003,"addrtype":3,"format":264,"maxFiletype":60}}}'.replaceAll(
			'VID',
			vid,
		),
		method: 'POST',
		mode: 'cors',
	})
		.then((res) => res.json())
		.then((data) => data)
		.catch((err) => {
			console.log(err)
		})
}

// 获取歌手信息
// API: https://u.y.qq.com/cgi-bin/musicu.fcg
//
// singermid: 歌手 MID
export let getSingerInfo = async (singermid, origin = false) => {
	try {
		// 1. 获取歌手歌曲列表（用 GetSingerSongList，歌曲能正常显示）
		const songsData = {
			comm: getComm(),
			req: {
				module: 'musichall.song_list_server',
				method: 'GetSingerSongList',
				param: {
					singerMid: singermid,
					begin: 0,
					num: 50,
					order: 1,
				},
			},
		}
		const songsRes = await signRequest(songsData)
		const songList = songsRes?.req?.data?.songList || []

		// 2. 从歌曲列表中提取歌手名（遍历每首歌的singer数组，按mid精确匹配）
		let singerName = ''
		try {
			for (const item of songList) {
				const song = item.songInfo || item
				const singers = song.singer || []
				const matched = singers.find(s => s && s.mid === singermid)
				if (matched && matched.name) {
					singerName = matched.name
					console.warn('[QQ歌手] 从歌曲列表按mid匹配到歌手名=' + singerName)
					break
				}
			}
		} catch (e) {
			console.warn('[QQ歌手] 从歌曲列表提取歌手名失败:', e.message)
		}

		// 3. 如果仍未获取到歌手名，用singermid作为关键词去酷狗搜索兜底
		if (!singerName) {
			try {
				const searchKeyword = singermid
				console.warn('[QQ歌手] 酷狗搜索关键词=' + searchKeyword)
				const kugouUrl = `http://mobilecdn.kugou.com/api/v3/search/singer?format=json&keyword=${encodeURIComponent(searchKeyword)}&page=1&pagesize=5`
				const kugouRes = await fetch(kugouUrl, {
					headers: {
						'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
						'Referer': 'https://www.kugou.com/',
					},
				})
				const kugouData = await kugouRes.json()
				console.warn('[QQ歌手] 酷狗返回完整数据=' + JSON.stringify(kugouData).slice(0, 1500))
				
				// 递归搜索歌手名
				const findSingerName = (obj) => {
					if (!obj || typeof obj !== 'object') return null
					if (obj.singername && typeof obj.singername === 'string' && obj.singername.length > 0) return obj.singername
					if (obj.name && typeof obj.name === 'string' && obj.name.length > 0 && obj.name !== '未知歌手') return obj.name
					if (obj.singer_name && typeof obj.singer_name === 'string') return obj.singer_name
					for (const key in obj) {
						const result = findSingerName(obj[key])
						if (result) return result
					}
					return null
				}
				
				const kugouSingerName = findSingerName(kugouData)
				if (kugouSingerName) {
					singerName = kugouSingerName
					console.warn('[QQ歌手] 从酷狗递归获取的歌手名=' + singerName)
				}
			} catch (e) {
				console.warn('[QQ歌手] 酷狗获取歌手名失败:', e.message)
			}
		}

		// 歌曲总数
		const songTotal = songsRes?.req?.data?.totalNum || 0
		// 格式化为旧接口的数据结构
		const result = {
			singer: {
				data: {
					singer_info: {
						name: singerName || '',
						mid: singermid,
					},
					song_total: songTotal,
					songlist: songList.map((item) => {
						const song = item.songInfo || item
						const albumMid = song.album?.mid || song.albummid || ''
						return {
							...song,
							title: song.title || song.songname || song.name || '未知歌曲',
							songname: song.songname || song.title || '',
							songmid: song.mid || song.songmid || '',
							strMediaMid: song.file?.media_mid || song.strMediaMid || '',
							singer: song.singer?.map(s => ({ name: s.name, mid: s.mid, id: s.id })) || [],
							album: {
								name: song.album?.name || song.albumname || '',
								mid: albumMid,
								id: song.album?.id || song.albumid || '',
								title: song.album?.name || song.albumname || '',
							},
							albummid: albumMid,
							albumname: song.album?.name || song.albumname || '',
							albumid: song.album?.id || song.albumid || '',
							interval: song.interval || 0,
							duration: song.interval || 0,
							artwork: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
							platform: 'qq',
							source: 'qq',
						}
					}),
				},
			},
		}

		if (origin) return { songs: songsRes, singerName }
		return result
	} catch (err) {
		console.warn('[QQ歌手] 获取歌手信息失败:', err.message)
		return {
			singer: {
				data: {
					singer_info: { name: singermid, mid: singermid },
					songlist: [],
				},
			},
		}
	}
}


// 附赠小工具

// 获取专辑封面图
//
// albummid: 专辑的 MID
// 歌手歌曲分页（展开全部懒加载用）
export let getQQSingerSongs = async (singermid, begin = 0, num = 30) => {
	try {
		const songsData = {
			comm: getComm(),
			req: {
				module: 'musichall.song_list_server',
				method: 'GetSingerSongList',
				param: { singerMid: singermid, begin, num, order: 1 },
			},
		}
		const songsRes = await signRequest(songsData)
		const songList = songsRes?.req?.data?.songList || []
		const total = songsRes?.req?.data?.totalNum || 0
		// 与 getSingerInfo 相同的格式化
		const formatted = songList.map((item) => {
			const song = item.songInfo || item
			const albumMid = song.album?.mid || song.albummid || ''
			return {
				...song,
				title: song.title || song.songname || song.name || '未知歌曲',
				songname: song.songname || song.title || '',
				songmid: song.mid || song.songmid || '',
				strMediaMid: song.file?.media_mid || song.strMediaMid || '',
				singer: song.singer?.map(s => ({ name: s.name, mid: s.mid, id: s.id })) || [],
				album: {
					name: song.album?.name || song.albumname || '',
					mid: albumMid,
					id: song.album?.id || song.albumid || '',
					title: song.album?.name || song.albumname || '',
				},
				albummid: albumMid,
				albumname: song.album?.name || song.albumname || '',
				albumid: song.album?.id || song.albumid || '',
				interval: song.interval || 0,
				duration: song.interval || 0,
				artwork: albumMid ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg` : '',
				platform: 'qq',
				source: 'qq',
			}
		})
		return { list: formatted, total, hasMore: begin + formatted.length < total }
	} catch (err) {
		console.warn('[QQ歌手] 分页获取歌曲失败:', err.message)
		return { list: [], total: 0, hasMore: false }
	}
}

export let getAlbumCoverImage = (albummid) => {
	return 'https://y.gtimg.cn/music/photo_new/T002R300x300M000ALBUMMID.jpg'.replaceAll(
		'ALBUMMID',
		albummid,
	)
}

// 解析歌词
//
// data：从 QQ 音乐申请来的数据
//
// 解析格式：对象。ti、ar、al、by、offset 的有无取决于 QQ 音乐
// ti: (title) 标题
// ar：(artist) 创作者
// al: (album) 专辑
// by: 没看过有内容的
// offset: 偏移量，没看过不为 0 的，应该是针对歌词时间而言的。
// count：歌词数量，为整型
// haveTrans: 是否有翻译，为布尔值
// lyric：列表。列表内容为对象，每个对象由 time、lyric 和 trans 三个键构成。
// time 为时间，lyric 为歌词，trans 为翻译。
export let parseLyric = (data) => {
	let parsed = {
		ti: '',
		ar: '',
		al: '',
		by: '',
		offset: '',
		count: 0,
		haveTrans: false,
		lyric: [],
	}
	let lyric = data.lyric.split('\n')
	let trans = data.trans.split('\n')
	parsed.haveTrans = !(trans == '')

	let substr = (str) => str.substring(str.indexOf(':') + 1, str.indexOf(']'))
	if (!lyric[0].startsWith('[0')) {
		parsed.ti = substr(lyric[0])
		parsed.ar = substr(lyric[1])
		parsed.al = substr(lyric[2])
		parsed.by = substr(lyric[3])
		parsed.offset = substr(lyric[4])
		lyric = lyric.slice(5)
		if (parsed.haveTrans) trans = trans.slice(5)
	}

	parsed.count = lyric.length
	for (let i = 0; i < parsed.count; i++) {
		let ele = { time: '', lyric: '', trans: '' }
		ele.time = lyric[i].substring(1, lyric[i].indexOf(']'))
		ele.lyric = lyric[i].substring(lyric[i].indexOf(']') + 1)
		if (parsed.haveTrans) ele.trans = trans[i].substring(trans[i].indexOf(']') + 1)
		parsed.lyric.push(ele)
	}

	return parsed
}
