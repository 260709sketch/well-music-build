// helpers/searchAll.ts
import * as _xiaoqiu from '@/helpers/userApi/xiaoqiu'
const searchMusic = (_xiaoqiu as any).searchMusic
const searchArtist = (_xiaoqiu as any).searchArtist
const searchAlbum = (_xiaoqiu as any).searchAlbum
import {
	searchNeteaseMusic,
	searchNeteaseArtist,
	searchNeteaseAlbum,
} from '@/helpers/userApi/netease-music-api'
import {
	searchKugouMusic,
	searchKugouArtist,
	searchKugouAlbum,
} from '@/helpers/userApi/kugou-music-api'
import {
	searchKuwoMusic,
	searchKuwoArtist,
	searchKuwoAlbum,
} from '@/helpers/userApi/kuwo-music-api'
import { Track } from 'react-native-track-player'

const PAGE_SIZE = 20

export type SearchType = 'songs' | 'artists' | 'album'
export type SearchPlatform = 'netease' | 'qq' | 'kugou' | 'kuwo' | 'all'

const searchAll = async (
	searchText: string,
	page: number = 1,
	type: SearchType = 'songs',
	platform: SearchPlatform = 'all',
): Promise<{ data: Track[]; hasMore: boolean }> => {
	console.log('search text+++', searchText, 'page:', page, 'type:', type, 'platform:', platform)

	let result

	// 网易云音乐平台
	if (platform === 'netease') {
		if (type === 'songs') {
			result = await searchNeteaseMusic(searchText, page, PAGE_SIZE)
		} else if (type === 'album') {
			result = await searchNeteaseAlbum(searchText, page, PAGE_SIZE)
			result.data = result.data.map((item: any) => ({
				...item,
				platform: 'netease',
				source: 'netease',
				isAlbum: true,
			}))
		} else {
			result = await searchNeteaseArtist(searchText, page, PAGE_SIZE)
			result.data = result.data.map((item: any) => ({
				...item,
				platform: 'netease',
				source: 'netease',
				isArtist: true,
			}))
		}
		return {
			data: result.data as Track[],
			hasMore: result.hasMore,
		}
	}

	// 酷狗音乐平台
	if (platform === 'kugou') {
		if (type === 'songs') {
			result = await searchKugouMusic(searchText, page, PAGE_SIZE)
		} else if (type === 'album') {
			result = await searchKugouAlbum(searchText, page, PAGE_SIZE)
			result.data = result.data.map((item: any) => ({
				...item,
				platform: 'kugou',
				source: 'kugou',
				isAlbum: true,
			}))
		} else {
			result = await searchKugouArtist(searchText, page, PAGE_SIZE)
			result.data = result.data.map((item: any) => ({
				...item,
				platform: 'kugou',
				source: 'kugou',
				isArtist: true,
			}))
		}
		return {
			data: result.data as Track[],
			hasMore: result.hasMore,
		}
	}

	// 酷我音乐平台
	if (platform === 'kuwo') {
		if (type === 'songs') {
			result = await searchKuwoMusic(searchText, page, PAGE_SIZE)
		} else if (type === 'album') {
			result = await searchKuwoAlbum(searchText, page, PAGE_SIZE)
			result.data = result.data.map((item: any) => ({
				...item,
				platform: 'kuwo',
				source: 'kuwo',
				isAlbum: true,
			}))
		} else {
			result = await searchKuwoArtist(searchText, page, PAGE_SIZE)
			result.data = result.data.map((item: any) => ({
				...item,
				platform: 'kuwo',
				source: 'kuwo',
				isArtist: true,
			}))
		}
		return {
			data: result.data as Track[],
			hasMore: result.hasMore,
		}
	}

	// 默认聚合搜索（全部平台，使用 xiaoqiu API）
	if (type === 'songs') {
		console.log('search song')
		result = await searchMusic(searchText, page, PAGE_SIZE)
	} else if (type === 'album') {
		console.warn('[QQ专辑] searchAll -> searchAlbum, kw=' + searchText + ' platform=' + platform)
		try {
			result = await searchAlbum(searchText, page)
		} catch (e: any) {
			console.warn('[QQ专辑] searchAlbum 抛错: ' + (e && e.message) + ' | stack=' + (e && e.stack))
			throw e
		}
		result.data = result.data.map((album: any) => ({
			id: album.id,
			title: album.title,
			artist: album.artist,
			artwork: album.artwork,
			isAlbum: true,
			platform: 'qq',
			source: 'qq',
			albumMid: album.albumMID || album.id,
			public_time: album.date || '',
		})) as Track[]
	} else {
		console.log('search artist')
		result = await searchArtist(searchText, page)
		result.data = result.data.map((artist) => ({
			id: artist.id,
			title: artist.name,
			artist: artist.name,
			artwork: artist.avatar,
			isArtist: true,
			platform: 'qq',
			source: 'qq',
			singerMid: artist.singerMID || artist.mid || artist.id,
		})) as Track[]
	}

	const hasMore = result.data.length === PAGE_SIZE
	return {
		data: result.data as Track[],
		hasMore,
	}
}

export default searchAll
