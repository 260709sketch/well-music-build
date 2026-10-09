import { b64DecodeUnicode, decodeName } from '@/components/utils'
import { headers } from '@/components/utils/musicSdk/options.js'
import { formatSingerName } from '@/components/utils/musicSdk/utils'
import { httpFetch } from '@/components/utils/request'
import { fakeAudioMp3Uri } from '@/constants/images'
import { getSingerInfo, getQQSingerSongs } from '@/helpers/userApi/qq-music-api'
import { getNeteaseMusicUrl, getNeteaseSingerDetail, getNeteaseSingerAlbums, getNeteaseAlbumSongs, getNeteaseLyric, getNeteaseAlbumIdBySongId, getNeteaseSingerSongs } from '@/helpers/userApi/netease-music-api'
import { getKugouSingerDetail, getKugouSingerAlbums, getKugouAlbumSongs, getKugouSingerSongs, getKugouLyric, getKugouKRCLyric } from '@/helpers/userApi/kugou-music-api'
import { getKuwoSingerDetail, getKuwoSingerAlbums, getKuwoAlbumSongs, getKuwoSingerSongs } from '@/helpers/userApi/kuwo-music-api'
import axios from 'axios'
import { Alert } from 'react-native'
import { logError, logInfo } from '../logger'
import { getQQLyric, getQQLyricBySearch } from './lx-lyric'
import { weapiBody, eapiBody, buildEapiHeader } from './neteaseCrypto'
const { DEV_URL_PREFIX, KW_URL } = {
	DEV_URL_PREFIX: 'https://dev.music.ximalaya.com/api/v1/track/url',
	KW_URL: 'https://www.kuwo.cn/api/v1/www/music/playUrl',
}

const withTimeout = (promise, ms) => {
	const timeout = new Promise((_, reject) =>
		setTimeout(() => reject(new Error('Request timed out')), ms),
	)
	return Promise.race([promise, timeout])
}

const fetchWithTimeout = (url, options, timeout = 5000) => {
	logInfo('----start----' + url)
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

const handleBackupFetch = async (songInfo, type, fakeAudioMp3Uri) => {
	try {
		const url = await getMusicFromKw(songInfo, type)
		return { type, url: url }
	} catch (error) {
		logInfo('Backup fetch error:', error)
		return { type, url: fakeAudioMp3Uri }
	}
}

export const myGetMusicUrl = (songInfo, type) => {
	const platform = songInfo.platform || songInfo.source

	// 网易云平台
	if (platform === 'netease' || platform === 'kw' || songInfo.id?.match(/^\d+$/)) {
		return getNeteaseMusicUrl(songInfo.id, type === 'flac' ? 'lossless' : 'standard')
			.then((url) => {
				if (url) {
					logInfo('获取成功（网易云）：' + url)
					return { type, url }
				}
				return handleBackupFetch(songInfo, type, fakeAudioMp3Uri)
			})
			.catch((error) => {
				logInfo('网易云获取失败:', error)
				return handleBackupFetch(songInfo, type, fakeAudioMp3Uri)
			})
	}

	// 酷狗平台
	if (platform === 'kg' || platform === 'kugou') {
		return getKugouMusicUrl(songInfo, type)
			.then((url) => {
				if (url) {
					logInfo('获取成功（酷狗）：' + url)
					return { type, url }
				}
				return handleBackupFetch(songInfo, type, fakeAudioMp3Uri)
			})
			.catch((error) => {
				logInfo('酷狗获取失败:', error)
				return handleBackupFetch(songInfo, type, fakeAudioMp3Uri)
			})
	}

	// 酷我平台
	if (platform === 'kuwo') {
		return handleBackupFetch(songInfo, type, fakeAudioMp3Uri)
	}

	// 默认：喜马拉雅 API + 酷我回退
	const url = `${DEV_URL_PREFIX}${songInfo.id}/${type}`
	const options = {
		method: 'GET',
		headers: headers,
		family: 4,
		credentials: 'include',
	}

	return handleBackupFetch(songInfo, type, fakeAudioMp3Uri)
		.then((result) => {
			if (result && !result.url.includes('fake')) {
				logInfo('获取成功（酷我）：' + result.url)
				return result
			}
			return fetchWithTimeout(url, options, 5000)
				.then((response) => parseResponse(response))
				.then((body) => {
					if (!body.data || (typeof body.data === 'string' && body.data.includes('error'))) {
						return null
					}
					logInfo('获取成功（原始）：' + body.data)
					return body.code === 0 ? { type, url: body.data } : null
				})
		})
		.catch((error) => {
			logInfo('获取失败:', error)
			return null
		})
}

// 酷狗播放地址获取
export async function getKugouMusicUrl(songInfo, quality = 'standard') {
	try {
		let hash = songInfo.originalId || songInfo.id
		if (!hash || hash.length < 8) {
			const searchUrl = `https://mobilecdn.kugou.com/api/v3/search/song?format=json&keyword=${encodeURIComponent(songInfo.title + ' ' + songInfo.artist)}&page=0&pagesize=1&showtype=1`
			const searchRes = await fetch(searchUrl, {
				headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
			})
			const searchData = await searchRes.json()
			if (searchData.data?.info?.[0]?.hash) {
				hash = searchData.data.info[0].hash
			} else {
				return null
			}
		}
		const qualityMap = {
			standard: { br: 128, fmt: 'mp3' },
			higher: { br: 192, fmt: 'mp3' },
			exhigh: { br: 320, fmt: 'mp3' },
			lossless: { br: 1000, fmt: 'flac' },
			flac: { br: 1000, fmt: 'flac' },
		}
		const q = qualityMap[quality] || qualityMap.standard
		const playUrl = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&br=${q.br}&fmt=${q.fmt}`
		const res = await fetch(playUrl, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
				Referer: 'https://www.kugou.com/',
			},
		})
		const data = await res.json()
		if (data.status === 1 && data.data?.play_url) {
			return data.data.play_url
		}
		return null
	} catch (error) {
		logError('酷狗播放地址获取失败:', error)
		return null
	}
}

const parseResponse = async (response) => {
	try {
		return await response.json()
	} catch (e) {
		try {
			if (response.status == 404) {
				return '404'
			}
			return await response.text()
		} catch (e) {
			logInfo('Failed to parse response')
		}
	}
}

export const myGetLyric = async (musicItem) => {
	try {
		// 判断平台
		const platform = musicItem.platform || (musicItem.id?.startsWith('netease_') ? 'netease' : 'qq')

		// 网易云歌曲使用网易云歌词 API
		if (platform === 'netease') {
			const neteaseId = musicItem.id?.replace('netease_', '') || musicItem.originalId || musicItem.id
			const result = await getNeteaseLyric(neteaseId)
			if (result.lrc) {
				return {
					lyric: result.lrc,
					tlyric: result.tlyric || '',
				}
			}
			throw new Error('网易云歌词为空')
		}

		// 酷狗歌曲：使用酷狗官方歌词API（LRC + KRC逐字歌词）
		if (platform === 'kugou' || platform === 'kg') {
			try {
				const kugouHash = musicItem.originalId || musicItem.id || musicItem.hash
				const kugouResult = await getKugouLyric(kugouHash, musicItem.title, musicItem.artist)
				if (kugouResult && kugouResult.lyric && kugouResult.lyric.length > 10) {
					return {
						lyric: kugouResult.lyric,
						tlyric: kugouResult.tlyric || '',
					}
				}
				throw new Error('酷狗歌词为空，尝试QQ搜索兜底')
			} catch (e) {
				// 酷狗歌词获取失败，用QQ音乐搜索兜底
				try {
					return await getQQLyricBySearch(musicItem.title, musicItem.artist, musicItem.album)
				} catch (e2) {
					throw new Error('酷狗歌词获取失败（官方API+QQ搜索均失败）')
				}
			}
		}

		// 酷我歌曲：用QQ音乐搜索获取歌词（LX同款，支持翻译）
		if (platform === 'kuwo') {
			try {
				return await getQQLyricBySearch(musicItem.title, musicItem.artist, musicItem.album)
			} catch (e) {
				throw new Error('酷我歌词获取失败')
			}
		}

		// QQ 音乐歌曲使用 LX 同款歌词 API（songmid优先，失败后用歌名+歌手搜索兜底）
		const qqSongMid = musicItem.songmid || musicItem.id?.replace('qq_', '') || musicItem.id
		try {
			const result = await getQQLyric(qqSongMid)
			if (result && result.lyric && result.lyric !== '[00:00.00]暂无歌词' && result.lyric.length > 20) {
				return result
			}
			throw new Error('QQ歌词为空，尝试搜索兜底')
		} catch (e) {
			// songmid获取失败，用歌名+歌手搜索歌词
			try {
				return await getQQLyricBySearch(musicItem.title, musicItem.artist, musicItem.album)
			} catch (e2) {
				throw new Error('QQ歌词获取失败（songmid+搜索均失败）')
			}
		}
	} catch (error) {
		logError('Error fetching lyrics:', error)
		return {
			lyric: '[00:00.00]暂无歌词',
			tlyric: '',
		}
	}
}

export async function getTopListDetail(topListItem) {
	let _a
	const res = await fetch(
		`https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&data=%7B%22detail%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetDetail%22%2C%22param%22%3A%7B%22topId%22%3A${topListItem.id}%2C%22offset%22%3A0%2C%22num%22%3A100%2C%22period%22%3A%22${(_a = topListItem.period) !== null && _a !== void 0 ? _a : ''}%22%7D%7D%2C%22comm%22%3A%7B%22ct%22%3A24%2C%22cv%22%3A0%7D%7D`,
		{
			method: 'GET',
			headers: {
				Cookie: 'uin=',
			},
			credentials: 'include',
		},
	).then((res) => res.json())

	return {
		...topListItem,
		musicList: res.detail.data.songInfoList.map(formatMusicItem),
	}
}

function formatMusicItem(_) {
	let _a, _b, _c
	const albumid = _.albumid || ((_a = _.album) === null || _a === void 0 ? void 0 : _a.id)
	const albummid = _.albummid || ((_b = _.album) === null || _b === void 0 ? void 0 : _b.mid)
	const albumname = _.albumname || ((_c = _.album) === null || _c === void 0 ? void 0 : _c.title)
	let artwork = ''
	// 处理 artwork
	if (_.album.name === '' || _.album.name === '空') {
		// 如果专辑名为空或'空'
		if (_.singer && _.singer.length > 0) {
			// 如果有歌手，使用第一个歌手的图片
			artwork = `https://y.gtimg.cn/music/photo_new/T001R500x500M000${_.singer[0].mid}.jpg`
		} else {
			// 如果没有歌手，artwork 保持为空字符串
			artwork = ''
		}
	} else {
		// 如果专辑名不为空，使用专辑图片
		artwork = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${_.album.mid}.jpg`
	}
	return {
		id: _.id || _.songid || _.mid,
		songmid: _.mid || _.songmid || '',
		originalId: _.id || _.songid || '',
		platform: 'qq',
		source: 'tx',
		title: _.title || _.songname,
		artist: _.singer.map((s) => s.name).join(', '),
		artwork: artwork ? artwork : undefined,
		album: albumname,
		lrc: _.lyric || undefined,
		albumid: albumid,
		albummid: albummid,
		url: 'Unknown',
		public_time: _.time_public || _.pub_time || _.public_time || _.time || '',
		duration: _.interval || 0,
	}
}
function formatMusicItemOfAlbum(item: any) {
	try {
		const albumid = item.albumid || item.album?.id
		const albummid = item.albummid || item.album?.mid
		const albumname = item.albumname || item.album?.title

		let artwork = ''
		if (item.album?.name === '' || item.album?.name === '空') {
			if (item.singer && item.singer.length > 0) {
				artwork = `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg`
			}
		} else {
			artwork = `https://y.gtimg.cn/music/photo_new/T002R500x500M000${albummid}.jpg`
		}

		return {
			id: item.id || item.songid || item.mid,
			songmid: item.mid || item.songmid || '',
			originalId: item.id || item.songid || '',
			platform: 'qq',
			source: 'tx',
			title: item.title || item.songname,
			artist: item.singer.map((s: any) => s.name).join(', '),
			artwork: artwork || undefined,
			album: albumname,
			lrc: item.lyric || undefined,
			albumid: albumid,
			albummid: albummid,
			url: 'Unknown',
		public_time: item.time_public || item.pub_time || item.public_time || item.time || '',
		duration: item.interval || 0,
		}
	} catch (error) {
		console.error('Error in formatMusicItem:', error, 'for item:', item)
		return null // 或者返回一个默认对象
	}
}
export async function getTopLists() {
	const list = await fetch(
		'https://u.y.qq.com/cgi-bin/musicu.fcg?_=1577086820633&data=%7B%22comm%22%3A%7B%22g_tk%22%3A5381%2C%22uin%22%3A123456%2C%22format%22%3A%22json%22%2C%22inCharset%22%3A%22utf-8%22%2C%22outCharset%22%3A%22utf-8%22%2C%22notice%22%3A0%2C%22platform%22%3A%22h5%22%2C%22needNewCode%22%3A1%2C%22ct%22%3A23%2C%22cv%22%3A0%7D%2C%22topList%22%3A%7B%22module%22%3A%22musicToplist.ToplistInfoServer%22%2C%22method%22%3A%22GetAll%22%2C%22param%22%3A%7B%7D%7D%7D',
		{
			method: 'GET',
			headers: {
				Cookie: 'uin=',
			},
			credentials: 'include',
		},
	).then((res) => res.json())

	return list.topList.data.group.map((e) => ({
		title: e.groupName,
		data: e.toplist.map((_) => ({
			id: _.topId,
			description: _.intro,
			title: _.title.replace(/腾讯/g, '').trim(),
			period: _.period,
			coverImg: _.headPicUrl || _.frontPicUrl,
		})),
	}))
}

export async function getKwId(songInfo) {
	const encodedSongInfo = encodeURIComponent(songInfo.title + ' ' + songInfo.artist)
	const searchUrl = `https://search.kuwo.cn/r.s?client=kt&all=${encodedSongInfo}&pn=0&rn=25&uid=794762570&ver=kwplayer_ar_9.2.2.1&vipver=1&show_copyright_off=1&newver=1&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&vermerge=1&mobi=1&issubtitle=1`
	try {
		const response = await fetch(searchUrl)
		const data = await response.json()
		if (data.abslist && data.abslist.length > 0) {
			return data.abslist[0].DC_TARGETID
		}
		throw new Error('No results found')
	} catch (error) {
		logError('请求出错:', error)
	}
}

export async function getUrlFromKw(kwId: string, quality: string) {
	switch (quality) {
		case 'flac': quality = '2000k' + quality; break
		case '128k': quality = quality + 'mp3'; break
		case '320k': quality = quality + 'mp3'; break
		default: quality = '128kmp3'
	}
	const sourceUrl = `${KW_URL}${kwId}&br=${quality}`
	try {
		const response = await fetch(sourceUrl)
		const responseText = await response.text()
		const urlMatch = responseText.match(/url=(https?:\/\/\S+)/)
		if (urlMatch && urlMatch[1]) {
			return urlMatch[1].trim()
		}
		throw new Error('URL not found')
	} catch (error) {
		logError('请求出错:', error)
		return null
	}
}

export async function getMusicFromKw(songInfo, quality: string) {
	const id = await getKwId(songInfo)
	const url = await getUrlFromKw(id, quality)
	return url
}

export async function getPlayListFromQ(playListID: string) {
	// QQ音乐歌单详情API（c.y.qq.com接口，直接返回完整歌曲列表）
	const url = `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${encodeURIComponent(playListID)}&format=json`

	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				Referer: 'https://y.qq.com/',
			},
		})
		const json = await response.json()
		if (response.status != 200) {
			throw new Error('请求失败')
		}
		if (json.code !== 0) {
			throw new Error(`QQ音乐返回错误: code=${json.code}`)
		}

		const cdlist = json?.cdlist
		if (!cdlist || !Array.isArray(cdlist) || cdlist.length === 0) {
			throw new Error('歌单不存在或为空')
		}

		const cd = cdlist[0]
		const songList = cd.songlist || []
		const artwork = cd.logo ? cd.logo.replace(/http:/, 'https:') : ''

		const formattedSongs = songList.map((item: any) => ({
			artist: formatSingerName(item.singer, 'name') || 'Unknown Artist',
			title: item.songname || item.title || 'Untitled Song',
			album: item.albumname || item.album?.name || 'Unknown Album',
			id: item.songid || item.songmid || 'default_songmid',
			songmid: item.songmid || item.mid || '',
			originalId: item.songid || item.id || '',
			artwork: item.albummid
				? `https://y.gtimg.cn/music/photo_new/T002R500x500M000${item.albummid}.jpg`
				: item.singer?.length
					? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg`
					: '',
			singerImg: item.singer?.length
				? `https://y.gtimg.cn/music/photo_new/T001R500x500M000${item.singer[0].mid}.jpg`
				: '',
			duration: item.interval || 0,
		}))

		return {
			success: true,
			id: playListID,
			platform: 'QQ',
			artist: cd.nickname || cd.creator?.name || 'QQ音乐',
			name: cd.dissname || cd.title || '未知歌单',
			artwork: artwork,
			title: cd.desc || '',
			songs: formattedSongs,
			musicList: formattedSongs,
		}
	} catch (error) {
		logError('Error fetching QQ playlist:', error)
		return {
			success: false,
			error: error.message,
		}
	}
}
interface Album {
	album_mid: string
	album_name: string
	singer_mid: string
	singer_name: string
	public_time?: string
}

interface Song {
	songname: string
	songmid: string
}

// 获取专辑列表
export async function getAlbumList(singerMid: string, offset: number = 0, limit: number = 30): Promise<Album[]> {
	const mid = String(singerMid)

	// 网易云歌手专辑
	if (mid.startsWith('netease_') || mid.startsWith('wy_') || /^\d+$/.test(mid)) {
		try {
			const albums = await getNeteaseSingerAlbums(mid, offset, limit)
			return albums as any
		} catch (error) {
			logError('Error fetching netease album list:', error)
			return []
		}
	}

	// 酷狗歌手专辑
	if (mid.startsWith('kugou_') || mid.startsWith('kg_')) {
		try {
			const albums = await getKugouSingerAlbums(mid, offset, limit)
			return albums as any
		} catch (error) {
			logError('Error fetching kugou album list:', error)
			return []
		}
	}

	// 酷我歌手专辑
	if (mid.startsWith('kuwo_') || mid.startsWith('kw_')) {
		try {
			const albums = await getKuwoSingerAlbums(mid, offset, limit)
			return albums as any
		} catch (error) {
			logError('Error fetching kuwo album list:', error)
			return []
		}
	}

	// 默认 QQ 音乐 - 分页获取所有专辑
	const headers = {
		Referer: `https://y.qq.com/n/yqq/singer/${singerMid}.html`,
	}
	const coverJpgUrlPre = 'https://y.gtimg.cn/music/photo_new/T002R800x800M000'
	try {
		const num = limit
		const begin = offset
		let allAlbums: any[] = []

		// 只取第一页30张，UI层有懒加载
		const dataParam = encodeURIComponent(JSON.stringify({
			singerAlbum: {
				method: 'get_singer_album',
				param: {
					singermid: singerMid,
					order: 'time',
					begin: begin,
					num: num,
					exstatus: 1,
				},
				module: 'music.web_singer_info_svr',
			},
		}))
		const url = `https://u.y.qq.com/cgi-bin/musicu.fcg?callback=getUCGI2613146679247198&g_tk=5381&jsonpCallback=getUCGI2613146679247198&loginUin=0&hostUin=0&format=jsonp&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0&data=${dataParam}`

		const response = await axios.get(url, { headers })
		const data = JSON.parse(response.data.slice(24, -1))
		allAlbums = data.singerAlbum?.data?.list || []

		console.log(`[qq-album] 歌手${singerMid}获取${allAlbums.length}张专辑(第一页)`)

		return allAlbums.map((item: any) => {
			const albumType = item.albumtype || item.album_type || item.albumType || ""
			const cnt = item.latest_song?.song_count || item.song_count || item.songCount || item.songcount || item.total || item.count || item.size || 0
			let subType = ""
			if (albumType.includes("EP") || albumType.includes("单曲") || item.ftype === "10" || item.ftype === 10) {
				subType = cnt <= 1 ? "单曲" : "EP"
			} else if (cnt === 1) {
				subType = "单曲"
			} else if (cnt > 1 && cnt <= 5) {
				subType = "EP"
			} else {
				subType = "专辑"
			}
			return {
				album_mid: item.album_mid,
				album_name: item.album_name,
				singer_mid: item.singer_mid,
				singer_name: item.singer_name,
				artwork: `${coverJpgUrlPre}${item.album_mid}.jpg?max_age=2592000`,
				public_time: item.pub_time || item.public_time || item.time || "",
				songCount: cnt,
				subType,
			}
		})
	} catch (error) {
		logError('Error fetching album list:', error)
		return []
	}
}

// 根据专辑ID
export async function getMusicByAlbumId(albumMid: string, singerName: string): Promise<void> {
	const url = `https://c.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?albummid=${albumMid}&g_tk=5381&jsonpCallback=albuminfoCallback&loginUin=0&hostUin=0&format=jsonp&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0`
	const coverJpgUrlPre = 'https://y.gtimg.cn/music/photo_new/T002R800x800M000'
	const headers = {
		Referer: 'https://y.qq.com/portal/player.html',
	}
	try {
		const response = await axios.get(url, { headers })
		const data = JSON.parse(response.data.slice(19, -1))
		const songList: Song[] = data.data.list
		data.data.list.flatMap((item: any) => ({
			artist: singerName,
			title: item.songname,
			album: data.data.albumname,
			id: item.songmid,
			artwork: `${coverJpgUrlPre}${albumMid}.jpg?max_age=2592000`,
			singerImg: `https://y.gtimg.cn/music/photo_new/T001R500x500M000${albumMid}.jpg?max_age=2592000`,
			url: 'Unknown',
			genre: 'Unknown Genre',
			date: 'Unknown Release Date',
			duration: 0,
		}))
	} catch (error) {
		logError('Error get music by album ID:', error)
	}
}
async function _getSingerMidBySingerNameInternal(singerName: string, platform?: string) {
	// 网易云歌手：使用网易云搜索 API
	if (platform === 'netease' || platform === 'wy') {
		try {
			const url = `https://music.163.com/api/search/get?s=${encodeURIComponent(singerName)}&type=100&offset=0&limit=1`
			console.log("[netease-comment] url:", url)
		const response = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
				'Accept': 'application/json, text/plain, */*',
				'Cookie': 'os=ios; appver=8.9.50; channel=AppStore',
					'Referer': 'https://music.163.com/',
				},
			})
			const data = await response.json()
			if (data.code === 200 && data.result && data.result.artists && data.result.artists.length > 0) {
				const artist = data.result.artists[0]
				if (artist && artist.id) {
					logInfo(`[singer] 网易云歌手匹配: ${artist.name} (id=${artist.id})`)
					return `netease_${artist.id}`
				}
				logError('[singer] 网易云歌手无有效 id，放弃')
				return null
			}
			logInfo(`[singer] 网易云未找到歌手 ${singerName}，不回退到其他平台`)
			return null
		} catch (error) {
			logError('[singer] 网易云歌手搜索失败:', error)
			return null
		}
	}

	// 酷狗歌手：使用酷狗 mobilecdn 搜索 API
	if (platform === 'kugou' || platform === 'kg') {
		try {
			const url = `http://mobilecdn.kugou.com/api/v3/search/singer?format=json&keyword=${encodeURIComponent(singerName)}&page=1&pagesize=1`
			const response = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					'Referer': 'https://www.kugou.com/',
				},
			})
			const data = await response.json()
			if (data.status === 1 && Array.isArray(data.data) && data.data.length > 0) {
				const singer = data.data[0]
				logInfo(`[singer] 酷狗歌手匹配: ${singer.singername} (id=${singer.singerid})`)
				return `kugou_${singer.singerid}`
			}
			logInfo(`[singer] 酷狗未找到歌手 ${singerName}，不回退到其他平台`)
			return null
		} catch (error) {
			logError('[singer] 酷狗歌手搜索失败:', error)
			return null
		}
	}

	// 酷我歌手：使用酷我搜索 API
	if (platform === 'kuwo' || platform === 'kw') {
		try {
			const url = `https://search.kuwo.cn/r.s?all=${encodeURIComponent(singerName)}&ft=artist&itemset=web_2013&client=kt&pn=0&rn=1&rformat=json&encoding=utf8`
			const response = await fetch(url, {
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
					'Referer': 'https://www.kuwo.cn/',
				},
			})
			const text = await response.text()
			// 酷我返回单引号字典格式
			const jsonText = text.replace(/'/g, '"').replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false')
			const data = JSON.parse(jsonText)
			if (data.abslist && data.abslist.length > 0) {
				const singer = data.abslist[0]
				const singerId = singer.ARTISTID || singer.DC_TARGETID || singer.id || ''
				const foundName = singer.ARTIST || singer.AARTIST || singer.NAME || singer.name || singerName
				const cleanName = String(foundName).replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\\u0026/g, '&').trim()
				logInfo(`[singer] 酷我歌手匹配: ${cleanName} (id=${singerId})`)
				return `kuwo_${singerId}::${encodeURIComponent(cleanName)}`
			}
			logInfo(`[singer] 酷我未找到歌手 ${singerName}，不回退到其他平台`)
			return null
		} catch (error) {
			logError('[singer] 酷我歌手搜索失败:', error)
			return null
		}
	}

	// 默认：QQ 音乐搜索（用 BeansMusic 的 search_for_qq_cp 接口）
	const url = `https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?format=json&w=${encodeURIComponent(singerName)}&n=5&p=1&t=0`
	try {
		const response = await fetch(url, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 QQMusic/9.0.5',
				'Referer': 'https://y.qq.com/portal/player.html',
				'Cookie': 'uin=0; qqmusic_fromtag=66',
			},
		})
		if (!response.ok) {
			throw new Error('Network response was not ok')
		}
		const results = await response.json()
		if (results.code !== 0 || !results.data || !results.data.song || !results.data.song.list) {
			throw new Error('Invalid response structure')
		}

		const songList = results.data.song.list

		for (const song of songList) {
			if (!song.singer || !Array.isArray(song.singer) || song.singer.length === 0) {
				continue
			}
			const exactMatch = song.singer.find((s) => s && s.name && s.name.toLowerCase() === singerName.toLowerCase())
			if (exactMatch) {
				return exactMatch.mid
			}
			const matchingSinger = song.singer.find(
				(s) => s && s.name && similarity(s.name, singerName) > 0.3,
			)
			if (matchingSinger) {
				logInfo('模糊匹配歌手:', matchingSinger.name)
				return matchingSinger.mid
			}
		}

		logInfo(`没有找到歌手 ${singerName} `)
		return null
	} catch (error) {
		logError('请求出错 of getSingerMidBySongName:', error)
		return null
	}
}


export async function getSingerMidBySingerName(singerName: string, platform?: string) {
	// 第一次：带platform解析
	let result = await _getSingerMidBySingerNameInternal(singerName, platform)
	// 兜底：第一次失败后，不传platform再试一次（让函数自动尝试所有平台）
	if (!result && platform) {
		result = await _getSingerMidBySingerNameInternal(singerName, undefined)
	}
	return result
}
export async function searchMusicInfoByName(songName: string, singerName?: string) {
	const url = `https://c.y.qq.com/soso/fcgi-bin/music_search_new_platform?searchid=53806572956004615&t=1&aggr=1&cr=1&catZhida=1&lossless=0&flag_qc=0&p=1&n=20&w=${encodeURIComponent(songName)}`
	const url1 = `https://c.y.qq.com/soso/fcgi-bin/client_search_cp?p=1&n=5&w=${encodeURIComponent(songName)}&format=json`
	try {
		const response = await fetch(url1)
		if (!response.ok) {
			throw new Error('Network response was not ok')
		}
		const jsonData = await response.json()
		// console.log('data::::::' + JSON.stringify(jsonData.data.song.list))
		if (jsonData.code !== 0 || !jsonData.data || !jsonData.data.song || !jsonData.data.song.list) {
			throw new Error('Invalid response structure')
		}

		let filteredList = jsonData.data.song.list

		if (singerName) {
			// QQ 用分号分隔歌手，而应用内歌手用 " / " 分隔，需拆分逐个匹配
			const artistParts = String(singerName)
				.split(/[/、;&]/)
				.map((s) => s.trim().toLowerCase())
				.filter(Boolean)
			filteredList = filteredList.filter((item: any) => {
				if (item.songmid == '') {
					return false
				}
				if (artistParts.length === 0) return true
				const json = JSON.stringify(item).toLowerCase()
				return artistParts.some((p) => json.includes(p))
			})
			if (filteredList.length === 0) {
				// 歌手过滤后无结果：退化为不过滤歌手，避免误杀
				filteredList = jsonData.data.song.list.filter((item: any) => item.songmid !== '')
			}
			if (!filteredList.length) return null

			return {
				songmid: filteredList[0].songmid,
				singerName:
					formatSingerName(filteredList[0].singer.replace(/;/g, '、'), 'name') || 'Unknown Artist',
				songName: filteredList[0].songname,
				albummid: filteredList[0].albummid,
				albumName: filteredList[0].albumname,
				artwork: `https://y.gtimg.cn/music/photo_new/T002R800x800M000${filteredList[0].albummid}.jpg`,
			}
		} else {
			filteredList = filteredList.filter((item: any) => {
				if (item.songmid == '') {
					return false
				}
				return true
			})
			if (!filteredList.length) return null

			return {
				songmid: filteredList[0].songmid,
				singerName: formatSingerName(filteredList[0].singer, 'name') || 'Unknown Artist',
				songName: filteredList[0].songname,
				albummid: filteredList[0].albummid,
				albumName: filteredList[0].albumname,
				artwork: `https://y.gtimg.cn/music/photo_new/T002R800x800M000${filteredList[0].albummid}.jpg?max_age=2592000`,
			}
		}
	} catch (error) {
		logError('请求url1出错 of searchMusicInfoByName:', error)
		try {
			console.log('url::::::' + url)
			const response = await fetch(url)
			if (!response.ok) {
				throw new Error('Network response was not ok')
			}

			const rawData = await response.text()
			const jsonData = JSON.parse(rawData.replace(/^callback\(|\)$/g, ''))

			if (
				jsonData.code !== 0 ||
				!jsonData.data ||
				!jsonData.data.song ||
				!jsonData.data.song.list
			) {
				throw new Error('Invalid response structure')
			}

			let filteredList = jsonData.data.song.list

			if (singerName) {
				const artistParts = String(singerName)
					.split(/[/、;&]/)
					.map((s) => s.trim().toLowerCase())
					.filter(Boolean)
				filteredList = filteredList.filter((item: any) => {
					if (!item || !item.f) return false
					if (artistParts.length === 0) return true
					const json = JSON.stringify(item).toLowerCase()
					return artistParts.some((p) => json.includes(p))
				})
				if (filteredList.length === 0) {
					filteredList = jsonData.data.song.list.filter((item: any) => item && item.f)
				}
				if (!filteredList.length) return null
				const matchedTrack = filteredList[0]
				const fields = matchedTrack.f.split('|')
				return {
					songmid: fields[20] || undefined,
					singerName: fields[3]?.replace(/;/g, '、') || 'Unknown Artist',
					songName: songName,
					albummid: fields[22],
					albumName: filteredList[0].albumName_hilight,
					artwork:
						fields[22] != undefined
							? `https://y.gtimg.cn/music/photo_new/T002R800x800M000${fields[22]}.jpg?max_age=2592000`
							: undefined,
				}
			} else {
				filteredList = filteredList.filter((item: any) => item && item.songmid !== '')
				if (!filteredList.length) return null
				return {
					songmid: filteredList[0].songmid,
					singerName: formatSingerName(filteredList[0].singer, 'name') || 'Unknown Artist',
					songName: filteredList[0].songname,
					albummid: filteredList[0].albummid,
					albumName: filteredList[0].albumname,
					artwork: `https://y.gtimg.cn/music/photo_new/T002R800x800M000${filteredList[0].albummid}.jpg?max_age=2592000`,
				}
			}
		} catch (error) {
			logError('请求url出错 of searchMusicInfoByName:', error)
			return null
		}
	}
}

export async function getSingerDetail(singerMid: string) {
	try {
		// 根据 singerMid 前缀判断平台
		const mid = String(singerMid)
		if (mid.startsWith('netease_') || mid.startsWith('wy_') || /^\d+$/.test(mid)) {
			const result = await getNeteaseSingerDetail(mid)
			if (result) return result
		}
		if (mid.startsWith('kugou_') || mid.startsWith('kg_')) {
			const result = await getKugouSingerDetail(mid)
			if (result) return result
		}
		if (mid.startsWith('kuwo_') || mid.startsWith('kw_')) {
			const result = await getKuwoSingerDetail(mid)
			if (result) return result
		}

		// 默认使用 QQ 音乐
		const response = await getSingerInfo(singerMid)
		const jsonData = await response

		if (!jsonData.singer || !jsonData.singer.data || !jsonData.singer.data.songlist) {
			throw new Error('Invalid response structure')
		}

		// QQ 专辑总数（请求专辑接口第一页拿 total）
		let qqAlbumSize = 0
		try {
			const albumDataParam = encodeURIComponent(JSON.stringify({
				singerAlbum: {
					method: 'get_singer_album',
					param: { singermid: singerMid, order: 'time', begin: 0, num: 1, exstatus: 1 },
					module: 'music.web_singer_info_svr',
				},
			}))
			const albumUrl = `https://u.y.qq.com/cgi-bin/musicu.fcg?g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0&data=${albumDataParam}`
			const albumResp = await axios.get(albumUrl, { headers: { Referer: `https://y.qq.com/n/yqq/singer/${singerMid}.html` } })
			qqAlbumSize = albumResp.data?.singerAlbum?.data?.total || 0
		} catch (e) {
			console.warn('[QQ歌手] 获取专辑总数失败:', e?.message)
		}

		return {
			singerImg: `https://y.gtimg.cn/music/photo_new/T001R500x500M000${singerMid}.jpg`,
			title: jsonData.singer.data.singer_info.name,
			id: singerMid,
			musicList: jsonData.singer.data.songlist.map(formatMusicItem),
			musicSize: jsonData.singer.data.song_total || 0,
			albumSize: qqAlbumSize,
		}
	} catch (error) {
		logError('请求出错 of getSingerDetail:', error)
		return null
	}
}

// 获取歌手简介（用网易云 weapi 接口）
export async function getSingerBio(singerName: string, platform?: string): Promise<string> {
	try {
		if (!singerName || singerName === '未知歌手') return ''
		
		// 先搜索歌手，获取歌手 ID
		const searchResp = await fetch(`https://music.163.com/api/search/get/web?s=${encodeURIComponent(singerName)}&type=100&limit=1`, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				'Referer': 'https://music.163.com/',
			},
		})
		const searchData = await searchResp.json()
		const artistId = searchData?.result?.artists?.[0]?.id
		if (!artistId) return ''

		// 用 weapi 接口获取歌手详情（返回 briefDesc）
		const detailResp = await fetch(`https://music.163.com/api/artist/head/info/get?id=${artistId}`, {
			headers: {
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
				'Referer': 'https://music.163.com/',
			},
		})
		const detailData = await detailResp.json()
		if (detailData.code === 200) {
			const briefDesc = detailData?.data?.artist?.briefDesc || ''
			return String(briefDesc)
		}

		return ''
	} catch (error) {
		console.error('getSingerBio error:', error)
		return ''
	}
}

// 获取歌手的所有歌曲（分页，按平台分发），统一返回 { list, total, hasMore }
export async function getSingerAllSongs(artistId: string, offset: number = 0, limit: number = 100) {
	const mid = String(artistId)
	try {
		if (mid.startsWith('kugou_') || mid.startsWith('kg_')) {
			const res = await getKugouSingerSongs(mid, offset, limit)
			return { list: res.list || [], total: res.total || 0, hasMore: offset + (res.list?.length || 0) < (res.total || 0) }
		}
		if (mid.startsWith('kuwo_') || mid.startsWith('kw_')) {
			const res = await getKuwoSingerSongs(mid, offset, limit)
			return { list: res.list || [], total: res.total || 0, hasMore: offset + (res.list?.length || 0) < (res.total || 0) }
		}
		if (mid.startsWith('netease_') || mid.startsWith('wy_') || /^\d+$/.test(mid)) {
			return await getNeteaseSingerSongs(mid, offset, limit)
		}
		// 默认 QQ 音乐
		const res = await getQQSingerSongs(mid, offset, limit)
		return { list: (res.list || []).map(formatMusicItem), total: res.total || 0, hasMore: !!res.hasMore }
	} catch (error) {
		logError('getSingerAllSongs error:', error)
		return { list: [], total: 0, hasMore: false }
	}
}

// 获取专辑歌曲信息
// API: https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg
//
// albummid: 专辑的 MID
export const getAlbumSongList = async (albummid, origin = false) => {
	try {
		// 网易云专辑
		const mid = String(albummid)
		if (mid.startsWith('netease_album_') || mid.startsWith('netease_')) {
			const result = await getNeteaseAlbumSongs(mid)
			if (result) return result
		}

		// 酷狗专辑
		if (mid.startsWith('kugou_album_') || mid.startsWith('kugou_')) {
			const result = await getKugouAlbumSongs(mid)
			if (result) return result
		}

		// 酷我专辑
		if (mid.startsWith('kuwo_album_') || mid.startsWith('kuwo_')) {
			const result = await getKuwoAlbumSongs(mid)
			if (result) return result
		}

		const response = await fetch(
			'https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg?platform=h5page&albummid=ALBUMMID&g_tk=938407465&uin=0&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=h5&needNewCode=1&_=1459961045571'.replaceAll(
				'ALBUMMID',
				albummid,
			),
		)
		const jsonData = await response.json()
		// console.log('Raw jsonData:', JSON.stringify(jsonData, null, 2))

		if (origin) return jsonData

		// console.log('jsonData.data:', jsonData.data)
		// console.log('jsonData.data.name:', jsonData.data?.name)

		if (jsonData && jsonData.data) {
			const result = {
				singerImg: `https://y.gtimg.cn/music/photo_new/T002R800x800M000${albummid}.jpg`,
				title: jsonData.data.name || '未知专辑',
				id: albummid,
				musicList: (jsonData.data.list || []).map(formatMusicItemOfAlbum),
				description: jsonData.data.desc || jsonData.data.description || jsonData.data.info || '',
			}
			// console.log('Returning result:', result)
			return result
		} else {
			console.error('Invalid data structure:', jsonData)
			return {
				singerImg: '',
				title: '未知专辑',
				id: albummid,
				musicList: [],
			}
		}
	} catch (err) {
		console.error('Error in getAlbumSongList:', err)
		return {
			singerImg: '',
			title: '未知专辑',
			id: albummid,
			musicList: [],
		}
	}
}

function similarity(s1, s2) {
	let longer = s1
	let shorter = s2
	if (s1.length < s2.length) {
		longer = s2
		shorter = s1
	}
	const longerLength = longer.length
	if (longerLength === 0) {
		return 1.0
	}
	return (longerLength - editDistance(longer, shorter)) / parseFloat(longerLength)
}

function editDistance(s1, s2) {
	s1 = s1.toLowerCase()
	s2 = s2.toLowerCase()

	const costs = []
	for (let i = 0; i <= s1.length; i++) {
		let lastValue = i
		for (let j = 0; j <= s2.length; j++) {
			if (i === 0) {
				costs[j] = j
			} else {
				if (j > 0) {
					let newValue = costs[j - 1]
					if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
						newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1
					}
					costs[j - 1] = lastValue
					lastValue = newValue
				}
			}
		}
		if (i > 0) {
			costs[s2.length] = lastValue
		}
	}
	return costs[s2.length]
}
const searchTypeMap = {
	0: 'song',
	2: 'album',
	1: 'singer',
	3: 'songlist',
	7: 'song',
	12: 'mv',
}

const searchHeaders = {
	referer: 'https://y.qq.com',
	'user-agent':
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36',
	Cookie: 'uin=',
}

interface ArtistItem {
	singerName: string
	singerID: string
	singerMID: string
	singerPic: string
	songNum: number
}

function formatArtistItem(item: ArtistItem) {
	return {
		name: item.singerName,
		id: item.singerID,
		singerMID: item.singerMID,
		avatar: item.singerPic,
		worksNum: item.songNum,
	}
}

async function searchBase(query: string, page: number, type: number, pageSize?: number) {
	const res = (
		await axios({
			url: 'https://u.y.qq.com/cgi-bin/musicu.fcg',
			method: 'POST',
			data: {
				req_1: {
					method: 'DoSearchForQQMusicDesktop',
					module: 'music.search.SearchCgiService',
					param: {
						num_per_page: pageSize,
						page_num: page,
						query: query,
						search_type: type,
					},
				},
			},
			headers: headers,
			xsrfCookieName: 'XSRF-TOKEN',
			withCredentials: true,
		})
	).data

	return {
		isEnd: res.req_1.data.meta.sum <= page * (pageSize || 20),
		data: res.req_1.data.body[searchTypeMap[type]].list,
	}
}

export async function searchArtist(query: string, page: number) {
	const artists = await searchBase(query, page, 1)
	return {
		isEnd: artists.isEnd,
		data: artists.data.map(formatArtistItem),
	}
}

// 获取QQ音乐评论
export async function getQQMusicComments(songId: string, page: number = 1, pageSize: number = 20) {
	try {
		console.log('获取QQ音乐评论, songId:', songId, 'page:', page)
		
		// 处理 songId：去掉前缀，如果是 songmid（含字母）需要先转成数字 songId
		let cleanId = String(songId || '').replace(/^(qq_|tx_)/, '')
		let topId = cleanId
		
		// 如果是字母数字混合（songmid），需要先获取数字 songId
		if (!/^\d+$/.test(cleanId)) {
			try {
				console.log('QQ音乐评论: songmid 转 songId, mid:', cleanId)
				const infoUrl = `https://u.y.qq.com/cgi-bin/musicu.fcg?data={"comm":{"ct":24,"cv":0},"songInfo":{"module":"music.pf_song_detail_svr","method":"get_song_detail_yqq","param":{"song_mid":"${cleanId}"}}}`
				const infoResp = await fetch(infoUrl, {
					headers: {
						Referer: 'https://y.qq.com/',
						'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15',
					},
				})
				const infoData = await infoResp.json()
				const trackInfo = infoData?.songInfo?.data?.track_info
				if (trackInfo?.id) {
					topId = String(trackInfo.id)
					console.log('QQ音乐评论: 转换成功, songId:', topId)
				}
			} catch (e) {
				console.log('QQ音乐评论: songmid 转换失败:', (e as Error).message)
			}
		}
		
		const url = `https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg?g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq&needNewCode=0&cid=205360772&reqtype=2&biztype=1&topid=${topId}&cmd=8&needmusiccrit=0&pagenum=${page}&pagesize=${pageSize}&lasthotcommentid=&domain=qq.com&ct=24&cv=10101010`
		const response = await fetch(url, {
			headers: {
				Referer: 'https://y.qq.com/',
				'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
			},
		})
		const data = await response.json()
		console.log('QQ音乐评论API返回:', JSON.stringify(data).substring(0, 500))
		
		// 尝试不同的返回格式
		let commentList = []
		let total = 0
		if (data?.comment?.commentlist) {
			commentList = data.comment.commentlist
			total = data.comment.commenttotal || data.comment.total || data.comment.comment_num || data.comment.totalnum || 0
		} else if (data?.data?.comment?.commentlist) {
			commentList = data.data.comment.commentlist
			total = data.data.comment.commenttotal || data.data.comment.total || data.data.comment.comment_num || data.data.comment.totalnum || 0
		} else if (data?.commentlist) {
			commentList = data.commentlist
			total = data.total || data.comment_num || data.totalnum || 0
		} else if (Array.isArray(data)) {
			commentList = data
			total = data.length
		}

		console.log('评论列表数量:', commentList.length, '总数:', total)
		if (commentList.length > 0) {
			console.log('第一条评论字段:', Object.keys(commentList[0]))
			console.log('第一条评论头像相关:', JSON.stringify({
				avatarurl: commentList[0].avatarurl,
				avatar: commentList[0].avatar,
				avatarUrl: commentList[0].avatarUrl,
				headurl: commentList[0].headurl,
				headUrl: commentList[0].headUrl,
				pic: commentList[0].pic,
			}))
		}

		return {
			comments: commentList.map((item: any) => {
				// 尝试多种头像字段
				let avatarUrl = ''
				if (item.avatarurl) {
					avatarUrl = item.avatarurl.startsWith('http') ? item.avatarurl : `https://y.gtimg.cn/music/photo_new/T001R100x100M000${item.avatarurl}.jpg`
				} else if (item.avatar) {
					avatarUrl = item.avatar.startsWith('http') ? item.avatar : `https://y.gtimg.cn/music/photo_new/T001R100x100M000${item.avatar}.jpg`
				} else if (item.avatarUrl) {
					avatarUrl = item.avatarUrl
				} else if (item.headurl) {
					avatarUrl = item.headurl.startsWith('http') ? item.headurl : `https://y.gtimg.cn/music/photo_new/T001R100x100M000${item.headurl}.jpg`
				} else if (item.headUrl) {
					avatarUrl = item.headUrl
				} else if (item.pic) {
					avatarUrl = item.pic.startsWith('http') ? item.pic : `https://y.gtimg.cn/music/photo_new/T001R100x100M000${item.pic}.jpg`
				}
				return {
					id: item.commentid || item.id || String(Math.random()),
					nickname: item.nick || item.nickname || '匿名用户',
					avatar: avatarUrl,
					content: item.rootcommentcontent || item.commentcontent || item.content || '',
					time: item.time || Date.now() / 1000,
					likeCount: item.praisenum || item.likeCount || 0,
				}
			}),
			total,
			hasMore: page * pageSize < total,
		}
	} catch (error) {
		console.error('获取QQ音乐评论失败:', error)
		return {
			comments: [],
			total: 0,
			hasMore: false,
		}
	}
}

// 网易云评论
// 网易云评论游标缓存（和LX一致）
const commentCursorCache: Record<string, { cursor: number; prevCursor: number; orderType: number; offset: number; page: number }> = {}

function getCommentCursor(songmid: string, page: number, limit: number) {
	let cacheData = commentCursorCache[songmid]
	if (!cacheData) cacheData = commentCursorCache[songmid] = { cursor: 0, prevCursor: 0, orderType: 1, offset: 0, page: 0 }
	let orderType: number, cursor: number, offset: number
	if (page === 1) {
		cacheData.page = 1
		cursor = cacheData.cursor = cacheData.prevCursor = Date.now()
		orderType = 1
		offset = 0
	} else if (cacheData.page) {
		cursor = cacheData.cursor
		if (page > cacheData.page) {
			orderType = 1
			offset = (page - cacheData.page - 1) * limit
		} else if (page < cacheData.page) {
			orderType = 0
			offset = (cacheData.page - page - 1) * limit
		} else {
			cursor = cacheData.cursor = cacheData.prevCursor
			offset = cacheData.offset
			orderType = cacheData.orderType
		}
	} else {
		cursor = Date.now()
		orderType = 1
		offset = (page - 1) * limit
	}
	return { orderType, cursor, offset }
}

function setCommentCursor(songmid: string, cursor: number, orderType: number, offset: number, page: number) {
	let cacheData = commentCursorCache[songmid]
	if (!cacheData) cacheData = commentCursorCache[songmid] = { cursor: 0, prevCursor: 0, orderType: 1, offset: 0, page: 0 }
	cacheData.prevCursor = cacheData.cursor
	cacheData.cursor = cursor
	cacheData.orderType = orderType
	cacheData.offset = offset
	cacheData.page = page
}

export async function getNeteaseComments(songId: string, page: number = 1, pageSize: number = 20) {
	try {
		// 去除 netease_/wy_ 前缀
		const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
		const rid = `R_SO_4_${cleanId}`
		const cursorInfo = getCommentCursor(cleanId, page, pageSize)

		// LX同款新接口
		const body = weapiBody({
			cursor: cursorInfo.cursor,
			offset: cursorInfo.offset,
			orderType: cursorInfo.orderType,
			pageNo: page,
			pageSize: pageSize,
			rid: rid,
			threadId: rid,
		})
		const response = await fetch('https://music.163.com/weapi/comment/resource/comments/get', {
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
				'origin': 'https://music.163.com',
				'Referer': 'http://music.163.com/',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body,
		})
		const data = await response.json()
		if (data.code !== 200 || !data.data) {
			console.log('[netease-comment] 新接口返回错误, code:', data.code)
			return { comments: [], total: 0, hasMore: false }
		}

		const commentList = data.data.comments || []
		const hotCommentList = data.data.hotComments || []
		const total = data.data.totalCount || 0
		setCommentCursor(cleanId, data.data.cursor || cursorInfo.cursor, cursorInfo.orderType, cursorInfo.offset, page)

		const mapComment = (item: any) => ({
			id: String(item.commentId || item.time || Math.random()),
			nickname: item.user?.nickname || '匿名用户',
			avatar: item.user?.avatarUrl || '',
			content: item.content || '',
			time: item.time ? item.time / 1000 : Date.now() / 1000,
			likeCount: item.likedCount || 0,
			liked: item.liked || false,
			userId: item.user?.userId ? String(item.user.userId) : '',
		})

		return {
			comments: commentList.map(mapComment),
			hotComments: hotCommentList.map(mapComment),
			total,
			hasMore: (page * pageSize) < total,
		}
	} catch (error) {
		console.error('获取网易云评论失败:', error)
		return { comments: [], total: 0, hasMore: false }
	}
}

// 获取网易云登录cookie
function getNeteaseCookieForComment(): string {
	try {
		// eslint-disable-next-line @typescript-eslint/no-var-requires
		const { useDailyRecommendStore } = require('@/store/dailyRecommendStore')
		return useDailyRecommendStore.getState().cookie || ''
	} catch {
		return ''
	}
}

function getCsrfToken(cookie: string): string {
	if (!cookie) return ''
	const m = cookie.match(/__?csrf\s*=\s*([^;\s]+)/)
	if (!m) return ''
	try { return m[1] }
	catch { return '' }
}

// 发评论
export async function sendNeteaseComment(songId: string, content: string) {
	const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
	const cookie = getNeteaseCookieForComment()
	if (!cookie) throw new Error('未登录网易云')
	const csrf = getCsrfToken(cookie)
	const threadId = 'R_SO_4_' + cleanId
	const body = weapiBody({ threadId, content, csrf_token: csrf || '' })
	const resp = await fetchWithTimeout('https://music.163.com/weapi/resource/comments/add', {
		method: 'POST',
		headers: {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
			'origin': 'https://music.163.com',
			'Referer': 'https://music.163.com/',
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': cookie,
		},
		body,
	}, 8000)
	const data = await resp.json()
	if (data.code !== 200) throw new Error(`发评论失败(code=${data.code}): ${data.message || '未知错误'}`)
	return data
}

// 回复评论
export async function replyNeteaseComment(songId: string, content: string, commentId: string) {
	const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
	const cookie = getNeteaseCookieForComment()
	if (!cookie) throw new Error('未登录网易云')
	const csrf = getCsrfToken(cookie)
	const threadId = 'R_SO_4_' + cleanId
	const body = weapiBody({ threadId, content, commentId, csrf_token: csrf || '' })
	const resp = await fetchWithTimeout('https://music.163.com/weapi/resource/comments/reply', {
		method: 'POST',
		headers: {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
			'origin': 'https://music.163.com',
			'Referer': 'https://music.163.com/',
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': cookie,
		},
		body,
	}, 8000)
	const data = await resp.json()
	if (data.code !== 200) throw new Error(`回复失败(code=${data.code}): ${data.message || '未知错误'}`)
	return data
}

// 删除评论
export async function deleteNeteaseComment(songId: string, commentId: string) {
	const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
	const cookie = getNeteaseCookieForComment()
	if (!cookie) throw new Error('未登录网易云')
	const csrf = getCsrfToken(cookie)
	const threadId = 'R_SO_4_' + cleanId
	const body = weapiBody({ threadId, commentId, csrf_token: csrf || '' })
	const resp = await fetchWithTimeout('https://music.163.com/weapi/resource/comments/delete', {
		method: 'POST',
		headers: {
			'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
			'origin': 'https://music.163.com',
			'Referer': 'https://music.163.com/',
			'Content-Type': 'application/x-www-form-urlencoded',
			'Cookie': cookie,
		},
		body,
	}, 8000)
	const data = await resp.json()
	if (data.code !== 200) throw new Error(`删除失败(code=${data.code}): ${data.message || '未知错误'}`)
	return data
}

// 点赞/取消点赞评论
export async function likeNeteaseComment(songId: string, commentId: string, action: 1 | 0) {
	const cleanId = String(songId).replace(/^(netease_|wy_)/, '')
	const cookie = getNeteaseCookieForComment()
	if (!cookie) throw new Error('未登录网易云')
	// 对齐已验证的收藏接口(likeNeteaseSong)：cookie 里没有 __csrf 就先访问首页抓取，
	// 否则评论点赞会因缺失 csrf 校验而失败
	let csrf = getCsrfToken(cookie)
	if (!csrf) {
		try {
			const homeRes: any = await fetchWithTimeout('https://music.163.com/', {
				headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
			}, 5000)
			const setCookie = homeRes.headers.get('set-cookie') || ''
			csrf = setCookie.match(/__csrf\s*=\s*([^;]+)/)?.[1]?.trim() || ''
		} catch {
			csrf = ''
		}
	}
	const cleanCommentId = String(commentId).replace(/[^0-9]/g, '')
	console.log(`[评论点赞] 开始: songId=${cleanId}, commentId=${cleanCommentId}, action=${action}, csrf=${csrf ? '有' : '无'}`)
	const threadId = `R_SO_4_${cleanId}`
	const endpoint = action === 1 ? 'like' : 'unlike'
	// 逆向 Sollin 手机端（flutter_sollin，App.framework 已核验）：桌面会话 cookie 模板固定为
	// "MUSIC_U=; os=pc; appver=2.10.13; channel=netease;"——即 os=pc、桌面 PC 会话特征，
	// 不存在 os=osx。之前此处用 "os=osx" + Mac Chrome UA，却与 body 内置 header(os:'pc') 矛盾，
	// 网易风控比对 Cookie/UA/body header 三处指纹不一致，直接返回 code:250 设备安全风险。
	// 修复：统一三处为 os=pc + Windows Chrome（与下方 weapi 兜底和已验证的红心收藏一致）。
	const eapiEndpoint = `/api/v1/comment/${endpoint}`
	const eapiCookie = cookie + (cookie.includes('os=') ? '' : '; os=pc; ')
	const first = await (async () => {
		try {
			const body = eapiBody(eapiEndpoint, {
				threadId,
				commentId: Number(cleanCommentId) || 0,
				header: buildEapiHeader(cookie),
			})
			const resp = await fetchWithTimeout(`https://interface.music.163.com/eapi/v1/comment/${endpoint}`, {
				method: 'POST',
				headers: {
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
					'Referer': 'https://music.163.com/',
					'Origin': 'https://music.163.com',
					'Content-Type': 'application/x-www-form-urlencoded',
					'Accept': 'application/json, text/plain, */*',
					'Cookie': eapiCookie,
				},
				body,
			}, 8000)
			const data = await resp.json()
			console.log(`[评论点赞] eapi 返回: code=${data.code}, message=${data.message || '无'}`)
			if (data.code === 200) return { ok: true }
			return { ok: false, code: data.code, detail: data }
		} catch (e: any) {
			console.log(`[评论点赞] eapi 异常，降级 weapi:`, e?.message || String(e))
			return { ok: false, code: 'eapi-error', detail: e }
		}
	})()
	if (first.ok) {
		console.log(`[评论点赞] eapi 成功`)
		return
	}

	// weapi 兜底：对齐 Binaryify/NeteaseCloudMusicApi 的开源实现（已归档前的主流赞评接口）：
	//   1) 点赞/取消走不同 URL：/weapi/v1/comment/like 与 /weapi/v1/comment/unlike
	//   2) body 只传 threadId + commentId，绝不传 action 字段（action 由 URL 端点区分，
	//      带 action 会被网易视为非标准请求）
	//   3) cookie 用原始登录态（镜像已验证的红心收藏 likeNeteaseSong，不追加 os/NMTID）
	// 旧 type/cid/rid 格式已废弃返回 400；带 action 字段也无法生效。
	const body = weapiBody({ threadId, commentId: cleanCommentId, csrf_token: csrf || '' })
	// 完全镜像已验证可用的红心收藏(likeNeteaseSong)：用原始登录 cookie、不追加 os/NMTID、
	// Windows Chrome UA。追加 os=pc 会破坏该账号登录时建立的设备指纹，触发网易风控 code:250。
	const commentCookie = cookie
	try {
		const resp = await fetchWithTimeout(`https://music.163.com/weapi/v1/comment/${endpoint}?csrf_token=${csrf || ''}`, {
			method: 'POST',
			headers: {
				'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
				'origin': 'https://music.163.com',
				'Referer': 'https://music.163.com/',
				'Content-Type': 'application/x-www-form-urlencoded',
				'Accept': 'application/json, text/plain, */*',
				'Cookie': commentCookie,
			},
			body,
		}, 8000)
		const data = await resp.json()
		console.log(`[评论点赞] weapi 返回: code=${data.code}, message=${data.message || '无'}`)
		if (data.code !== 200) {
			const errMsg = `点赞失败(code:${data.code})`
			console.error(`[评论点赞] weapi 失败: ${errMsg}, detail=${JSON.stringify(data)}`)
			throw new Error(errMsg)
		}
		console.log(`[评论点赞] weapi 成功`)
		return data
	} catch (e) {
		console.error(`[评论点赞] 异常: ${e instanceof Error ? e.message : String(e)}`)
		throw e
	}
}

// 酷狗评论（参考 lx-music: mcomment.kugou.com）
export async function getKugouComments(songId: string, page: number = 1, pageSize: number = 20) {
	try {
		const cleanId = String(songId).replace(/^(kugou_|kg_)/, '')
		const url = `https://mcomment.kugou.com/index.php?r=commentsv2/getCommentWithLike&code=fc4be23b4e972707f36b8a828a93ba8a&extdata=${cleanId}&p=${page}&pagesize=${pageSize}`
		const response = await fetch(url, {
			headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' },
		})
		const data = await response.json()
		if (data.err_code !== 0) {
			console.error('酷狗评论API错误:', data.msg)
			return { comments: [], total: 0, hasMore: false }
		}
		const commentList = data.list || []
		const total = data.count || commentList.length
		return {
			comments: commentList.map((item: any) => ({
				id: String(item.id || Math.random()),
				nickname: item.user_name || '匿名用户',
				avatar: item.user_pic || '',
				content: item.content || '',
				time: item.addtime ? (() => { const m = String(item.addtime).match(/(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})/); return m ? new Date(+m[1], +m[2]-1, +m[3], +m[4], +m[5], +m[6]).getTime()/1000 : Date.now()/1000; })() : Date.now() / 1000,
				likeCount: item.like?.likenum || item.like_count || 0,
			})),
			total,
			hasMore: commentList.length >= pageSize,
		}
	} catch (error) {
		console.error('获取酷狗评论失败:', error)
		return { comments: [], total: 0, hasMore: false }
	}
}

// 酷我评论（参考 lx-music: ncomment.kuwo.cn 移动端API，无需CSRF）
export async function getKuwoComments(songId: string, page: number = 1, pageSize: number = 20) {
	try {
		const cleanId = String(songId).replace(/^(kuwo_|kw_)/, '')
		const start = pageSize * (page - 1)
		const url = `http://ncomment.kuwo.cn/com.s?f=web&type=get_comment&aapiver=1&prod=kwplayer_ar_10.5.2.0&digest=15&sid=${cleanId}&start=${start}&msgflag=1&count=${pageSize}&newver=3&uid=0`
		const response = await fetch(url, {
			headers: { 'User-Agent': 'Dalvik/2.1.0 (Linux; U; Android 9;)' },
		})
		const data = await response.json()
		if (String(data.code) !== '200') {
			console.error('酷我评论API错误:', data)
			return { comments: [], total: 0, hasMore: false }
		}
		const commentList = data.comments || []
		const total = data.comments_counts || 0
		return {
			comments: commentList.map((item: any) => ({
				id: String(item.id || Math.random()),
				nickname: item.u_name || '匿名用户',
				avatar: item.u_pic || '',
				content: item.msg || '',
				time: item.time || Date.now() / 1000,
				likeCount: item.like_num || 0,
			})),
			total,
			hasMore: (start + commentList.length) < total,
		}
	} catch (error) {
		console.error('获取酷我评论失败:', error)
		return { comments: [], total: 0, hasMore: false }
	}
}

// 根据平台选择评论接口
export async function getCommentsByPlatform(
	platform: string,
	songId: string,
	page: number = 1,
	pageSize: number = 20,
) {
	const idStr = String(songId || '')
	console.log('[getCommentsByPlatform] platform:', platform, 'songId:', idStr)

	// 根据 songId 前缀判断真实平台
	let actualPlatform = platform || 'qq'
	if (idStr.startsWith('netease_') || idStr.startsWith('wy_')) {
		actualPlatform = 'netease'
	} else if (idStr.startsWith('qq_') || idStr.startsWith('tx_')) {
		actualPlatform = 'qq'
	} else if (idStr.startsWith('kugou_') || idStr.startsWith('kg_')) {
		actualPlatform = 'kugou'
	} else if (idStr.startsWith('kuwo_') || idStr.startsWith('kw_')) {
		actualPlatform = 'kuwo'
	}

	// 定义平台尝试顺序
	const platformOrder = ['netease', 'qq', 'kugou', 'kuwo']
	const startIndex = platformOrder.indexOf(actualPlatform)
	const orderedPlatforms = startIndex >= 0
		? [platformOrder[startIndex], ...platformOrder.filter((_, i) => i !== startIndex)]
		: platformOrder

	// 逐个平台尝试，返回第一个有评论的结果
	for (const p of orderedPlatforms) {
		try {
			console.log('[getCommentsByPlatform] 尝试平台:', p)
			let result
			switch (p) {
				case 'netease':
				case 'wy':
					result = await getNeteaseComments(songId, page, pageSize)
					break
				case 'kugou':
				case 'kg':
					result = await getKugouComments(songId, page, pageSize)
					break
				case 'kuwo':
				case 'kw':
					result = await getKuwoComments(songId, page, pageSize)
					break
				default:
					result = await getQQMusicComments(songId, page, pageSize)
			}
			if (result && result.comments && result.comments.length > 0) {
				console.log('[getCommentsByPlatform] 平台', p, '返回', result.comments.length, '条评论')
				return result
			}
			console.log('[getCommentsByPlatform] 平台', p, '返回0条，继续尝试')
		} catch (e) {
			console.log('[getCommentsByPlatform] 平台', p, '失败:', (e as Error).message)
		}
	}

	// 所有平台都没有评论，返回空
	console.log('[getCommentsByPlatform] 所有平台均无评论')
	return { comments: [], total: 0, hasMore: false }
}
