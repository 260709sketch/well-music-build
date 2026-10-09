/**
 * 网易云日推歌曲存储
 * - 日推歌曲缓存（AsyncStorage）
 * - 每天早上6点自动刷新
 * - 登录 cookie 存储
 * - 风格化推荐歌单
 */

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { logError, logInfo } from '@/helpers/logger'
import { showToast } from '@/utils/utils'
import { addLog } from '@/utils/appLogger'
import {
	getNeteaseDailyRecommend,
	getNeteaseRecommendPlaylists,
	getNeteasePersonalizedPlaylists,
	getNeteaseUserPlaylists,
	getNeteasePlaylistDetail,
	searchNeteaseArtist,
	getNeteaseSingerDetail,
	getAllNeteaseFollowedArtists,
} from '@/helpers/userApi/netease-music-api'
import { getAllQQFollowedSingers } from '@/helpers/userApi/qq-music-user-api'
import { playListsStore } from '@/player/PlayerStore'
import PersistStatus from '@/store/PersistStatus'
import { weapiBody } from '@/helpers/userApi/neteaseCrypto'

export type DailyTrack = {
	id: string
	songmid: string
	platform: string
	source: string
	title: string
	artist: string
	album: string
	artwork: string
	duration: number
	url: string
	originalId: string
}

export type PersonalizedPlaylist = {
	id: number
	name: string
	coverImgUrl: string
	playCount: number
	copywriter: string
}

export type UserPlaylist = {
	id: number
	name: string
	coverImgUrl: string
	playCount: number
	trackCount: number
	creator: string
	isLoved: boolean
	imported: boolean
}

export type FollowedArtist = {
	id: string
	name: string
	avatar: string
	platform: string
	artistId?: string
	singerMid?: string
}

type DailyRecommendState = {
	tracks: DailyTrack[]
	lastRefreshTime: number // 时间戳
	personalizedPlaylists: PersonalizedPlaylist[]
	lastPersonalizedRefreshTime: number
	cookie: string
	nickname: string
	avatar: string
	userId: string
	isLoggedIn: boolean
	userPlaylists: UserPlaylist[]
	recommendByFavoriteTracks: DailyTrack[] // 根据你喜爱的歌曲推荐
	recommendRapTracks: DailyTrack[] // 自定义歌手随机歌曲
	lastRecommendRefreshTime: number
	selectedRapArtists: string[] // 用户自定义选择的说唱歌手
	dailyVersion: number // 日推API版本，升级时强制刷新缓存
	followedArtists: FollowedArtist[] // 关注歌手列表（网易云+QQ音乐合并）
	followedArtistsLoaded: boolean // 关注歌手是否已加载完成
	qqCookie: string
	qqNickname: string
	qqAvatar: string
	qqLoggedIn: boolean
	refreshDaily: () => Promise<void>
	refreshFollowedArtists: () => Promise<void>
	setQQLoginInfo: (cookie: string, nickname: string, avatar: string) => void
	qqLogout: () => void
	refreshPersonalized: () => Promise<void>
	refreshRecommend: () => Promise<void>
	refreshByFavorite: () => Promise<void>
	refreshRap: () => Promise<void>
	importUserPlaylists: (silent?: boolean) => Promise<void>
	setLoginInfo: (cookie: string, nickname: string, avatar: string, userId: string) => void
	logout: () => void
	setSelectedRapArtists: (artists: string[]) => void
}

// 判断是否需要刷新（每天凌晨0:30后刷新，避免网易云0点刷新延迟）
const shouldRefreshAtMidnight = (lastRefreshTime: number): boolean => {
	if (!lastRefreshTime) return true
	const now = new Date()
	const lastRefresh = new Date(lastRefreshTime)
	// 今天早上6点（网易云日推更新时间）
	const today0600 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 6, 0, 0, 0)
	// 如果上次刷新在今天0:30之前，需要刷新
	return lastRefresh < today0600
}

export const useDailyRecommendStore = create<DailyRecommendState>()(
	persist(
		(set, get) => ({
			tracks: [],
			lastRefreshTime: 0,
			personalizedPlaylists: [],
			lastPersonalizedRefreshTime: 0,
			cookie: '',
			nickname: '',
			avatar: '',
			userId: '',
			isLoggedIn: false,
			userPlaylists: [],
			recommendByFavoriteTracks: [],
			recommendRapTracks: [],
			lastRecommendRefreshTime: 0,
			selectedRapArtists: [],
			dailyVersion: 2,
			followedArtists: [],
			followedArtistsLoaded: false,
			qqCookie: '',
			qqNickname: '',
			qqAvatar: '',
			qqLoggedIn: false,
			banners: [],
			lastBannerRefreshTime: 0,
			bannerVersion: 3,

			refreshDaily: async () => {
				const { lastRefreshTime, cookie, tracks } = get()

				// 如果今天6点后已经刷新过，跳过
				const { dailyVersion } = get()
				if (!shouldRefreshAtMidnight(lastRefreshTime) && tracks.length > 0 && dailyVersion === 2) {
					logInfo('[daily] 今日6点后已刷新，跳过')
					return
				}
				if (dailyVersion !== 2) {
					logInfo('[daily] 日推API版本升级，强制刷新')
				}

				try {
					logInfo('[daily] 开始刷新日推')
					let newTracks: DailyTrack[] = []

					if (cookie) {
						// 已登录：使用日推 API
						try {
							const result = await getNeteaseDailyRecommend(cookie)
							newTracks = result
							logInfo(`[daily] 日推 API 获取 ${newTracks.length} 首`)
						} catch (err) {
							logError('[daily] 日推 API 失败，尝试推荐歌单:', err)
						}
					}

					// 未登录或日推 API 失败：使用推荐歌单替代
					if (newTracks.length === 0) {
						try {
							const result = await getNeteaseRecommendPlaylists()
							newTracks = result
							logInfo(`[daily] 推荐歌单获取 ${newTracks.length} 首`)
						} catch (err) {
							logError('[daily] 推荐歌单也失败:', err)
						}
					}

					if (newTracks.length > 0) {
						set({ tracks: newTracks, lastRefreshTime: Date.now(), dailyVersion: 2 })
						logInfo(`[daily] 日推刷新完成，共 ${newTracks.length} 首`)
					}
				} catch (error) {
					logError('[daily] 刷新日推失败:', error)
				}
			},

			refreshPersonalized: async () => {
				const { lastPersonalizedRefreshTime, cookie, personalizedPlaylists } = get()

				// 如果今天6点后已经刷新过，跳过
				if (!shouldRefreshAtMidnight(lastPersonalizedRefreshTime) && personalizedPlaylists.length > 0) {
					logInfo('[personalized] 今日6点后已刷新，跳过')
					return
				}

				try {
					logInfo('[personalized] 开始刷新风格化推荐')
					const playlists = await getNeteasePersonalizedPlaylists(cookie)
					if (playlists.length > 0) {
						set({ personalizedPlaylists: playlists, lastPersonalizedRefreshTime: Date.now() })
						logInfo(`[personalized] 风格化推荐刷新完成，共 ${playlists.length} 个歌单`)
					}
				} catch (error) {
					logError('[personalized] 刷新风格化推荐失败:', error)
				}
			},

			refreshBanners: async () => {
				const { cookie, banners, lastBannerRefreshTime, bannerVersion } = get()

				// 版本不匹配或旧版缓存，强制刷新
				if (bannerVersion !== 3) {
					logInfo('[banner] 旧版缓存，强制刷新')
					set({ banners: [], lastBannerRefreshTime: 0, bannerVersion: 3 })
				}

				// 如果1小时内已经刷新过，跳过
				if (banners.length > 0 && Date.now() - lastBannerRefreshTime < 3600000 && bannerVersion === 3) {
					logInfo('[banner] 1小时内已刷新，跳过')
					return
				}

				try {
					logInfo('[banner] 开始获取Banner（网易云weapi PC端优先）')
					// 优先用网易云weapi加密PC端Banner（和官网一致）
					try {
						const bannerBody = weapiBody({ clientType: 'pc' })
						const bannerRes = await fetch('https://music.163.com/weapi/v2/banner/get?csrf_token=', {
							method: 'POST',
							headers: {
								'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
								'Referer': 'https://music.163.com/',
								'Content-Type': 'application/x-www-form-urlencoded',
							},
							body: bannerBody,
						})
						const bannerData = await bannerRes.json()
						if (bannerData.code === 200 && bannerData.banners && bannerData.banners.length > 0) {
							const bannersFormatted = bannerData.banners
								.filter((b: any) => {
									// 过滤广告：监测字段 / 外链(targetType 3000) / “广告”标签 / 广告跳转字段
									const label = String(b.typeTitle || b.title || '')
									const hasMonitor =
										(Array.isArray(b.monitorImpress) && b.monitorImpress.length > 0) ||
										(Array.isArray(b.monitorClick) && b.monitorClick.length > 0) ||
										(Array.isArray(b.monitorBlack) && b.monitorBlack.length > 0) ||
										(b.monitor && (b.monitor.impress || b.monitor.click || b.monitor.black))
									const isAd =
										hasMonitor ||
										b.targetType === 3000 ||
										label.includes('广告') ||
										!!b.adurl ||
										!!b.adUrl
									if (isAd) {
										logInfo('[banner] 过滤广告: ' + (label || b.bannerId || ''))
										return false
									}
									return true
								})
								.map((b: any) => ({
									...b,
									imageUrl: (b.pic || b.imageUrl || b.coverUrl || '').replace('http://', 'https://'),
									name: b.typeTitle || b.name || '',
								})).filter((b: any) => b.imageUrl)
							if (bannersFormatted.length > 0) {
								set({ banners: bannersFormatted, lastBannerRefreshTime: Date.now() })
								logInfo(`[banner] 网易云weapi PC端成功获取 ${bannersFormatted.length} 个Banner`)
								return
							}
						}
					} catch (e) {
						logError('[banner] 网易云weapi Banner失败:', e)
					}

					// 备用：QQ音乐Banner
					logInfo('[banner] 网易云Banner获取失败，尝试QQ音乐')
					const qqUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg?data=' + encodeURIComponent(JSON.stringify({
						comm: { ct: 24, cv: 0 },
						focus: {
							module: 'music.musicHall.MusicHallPlatform',
							method: 'GetFocus',
							param: { type: 1 }
						}
					}))
					const res = await fetch(qqUrl, {
						headers: {
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
							'Referer': 'https://y.qq.com/',
						},
					})
					const data = await res.json()
					const qqBanners = data?.focus?.data?.shelf?.v_niche?.[0]?.v_card
					if (qqBanners && qqBanners.length > 0) {
						let bannersFormatted = qqBanners.map((b: any) => ({
							...b,
							imageUrl: b.cover || b.pic || '',
							name: b.title || '',
						})).filter((b: any) => b.imageUrl)
						// 用用户自定义图片替换第1-4个和第7个Banner
						const customImages = [
							'https://aka.doubaocdn.com/s/9OTcwlqWvP',
							'https://aka.doubaocdn.com/s/MzYr4x6LG8',
							'https://aka.doubaocdn.com/s/Hdx6mY7OKc',
							'https://aka.doubaocdn.com/s/11omgdGyUf',
						]
						const customImage7 = 'https://aka.doubaocdn.com/s/c03gWvEHxy'
						for (let i = 0; i < 4 && i < bannersFormatted.length; i++) {
							bannersFormatted[i] = { ...bannersFormatted[i], imageUrl: customImages[i], name: '' }
						}
						if (bannersFormatted.length >= 7) {
							bannersFormatted[6] = { ...bannersFormatted[6], imageUrl: customImage7, name: '' }
						}
						if (bannersFormatted.length > 0) {
							set({ banners: bannersFormatted, lastBannerRefreshTime: Date.now() })
							logInfo(`[banner] QQ音乐获取 ${bannersFormatted.length} 个Banner`)
						}
					}
				} catch (error) {
					logError('[banner] 获取Banner失败:', error)
				}
			},

			refreshRecommend: async () => {
				const { cookie, tracks } = get()

				addLog('recommend', '开始刷新推荐模块', 'info')

				if (!cookie) {
					addLog('recommend', '未登录网易云，跳过推荐模块', 'warn')
					return
				}

				try {
					let byFavoriteTracks: DailyTrack[] = []
					let rapTracks: DailyTrack[] = []

					// 生成随机偏移量，确保每次刷新不一样
					const randomOffset = Math.floor(Math.random() * 20)

					// 方法1: 获取热门歌单（带随机偏移量）
					try {
						addLog('recommend', `获取热门歌单，偏移量=${randomOffset}`, 'info')
						const hotPlaylists = await fetch(`https://music.163.com/api/top/playlist?limit=30&order=hot&offset=${randomOffset}&timestamp=${Date.now()}`, {
							headers: {
								'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
								Referer: 'https://music.163.com/',
								Cookie: cookie,
							},
						}).then(r => r.json())

						addLog('recommend', `热门歌单接口返回 code=${hotPlaylists.code}, playlists数量=${hotPlaylists.playlists?.length || 0}`, 'info')

						if (hotPlaylists.code === 200 && hotPlaylists.playlists?.length > 0) {
							const playlists = hotPlaylists.playlists

							// 随机选择一个歌单作为"根据你喜爱的歌曲推荐"
							const favoriteIndex = Math.floor(Math.random() * playlists.length)
							const favoritePlaylist = playlists[favoriteIndex]
							addLog('recommend', `随机选择喜爱推荐歌单: ${favoritePlaylist.name} (id=${favoritePlaylist.id})`, 'info')

							if (favoritePlaylist) {
								const detail = await getNeteasePlaylistDetail(favoritePlaylist.id, cookie)
								const songs = detail?.songs || detail?.tracks || []
								addLog('recommend', `喜爱推荐歌单详情返回 ${songs.length} 首歌曲`, 'info')
								if (songs.length > 0) {
									// 随机选择16首
									const shuffled = [...songs].sort(() => Math.random() - 0.5)
									byFavoriteTracks = shuffled.slice(0, 16)
								}
							}

							// 筛选说唱歌单，如果没有则随机选择
							const rapPlaylists = playlists.filter((p: any) =>
								p.name.includes('说唱') || p.name.includes('rap') || p.name.includes('Rap') || p.name.includes('hiphop') || p.name.includes('HipHop')
							)
							const rapPlaylist = rapPlaylists.length > 0
								? rapPlaylists[Math.floor(Math.random() * rapPlaylists.length)]
								: playlists[Math.floor(Math.random() * playlists.length)]

							addLog('recommend', `选择说唱推荐歌单: ${rapPlaylist.name} (id=${rapPlaylist.id})`, 'info')

							if (rapPlaylist) {
								const detail = await getNeteasePlaylistDetail(rapPlaylist.id, cookie)
								const songs = detail?.songs || detail?.tracks || []
								if (songs.length > 0) {
									// 随机选择10首
									const shuffled = [...songs].sort(() => Math.random() - 0.5)
									rapTracks = shuffled.slice(0, 16)
								}
							}
						}
					} catch (err) {
						addLog('recommend', `热门歌单获取失败: ${err}`, 'error')
					}

					// 方法2: 如果热门歌单失败，使用 getNeteaseRecommendPlaylists
					if (byFavoriteTracks.length === 0) {
						try {
							addLog('recommend', '使用 getNeteaseRecommendPlaylists 作为备选', 'info')
							const recommendSongs = await getNeteaseRecommendPlaylists()
							addLog('recommend', `getNeteaseRecommendPlaylists 返回 ${recommendSongs.length} 首歌曲`, 'info')
							if (recommendSongs.length > 0) {
								const shuffled = [...recommendSongs].sort(() => Math.random() - 0.5)
								byFavoriteTracks = shuffled.slice(0, 16)
							}
						} catch (err) {
							addLog('recommend', `getNeteaseRecommendPlaylists 失败: ${err}`, 'error')
						}
					}

					// 方法3: 最后的备选，使用每日推荐的歌曲
					if (byFavoriteTracks.length === 0 && tracks.length > 0) {
						addLog('recommend', '使用每日推荐歌曲作为最后备选', 'info')
						const shuffled = [...tracks].sort(() => Math.random() - 0.5)
						byFavoriteTracks = shuffled.slice(0, 16)
					}
					if (rapTracks.length === 0 && tracks.length > 0) {
						const shuffled = [...tracks].sort(() => Math.random() - 0.5)
						rapTracks = shuffled.slice(0, 16)
					}

					addLog('recommend', `最终结果: 喜爱推荐 ${byFavoriteTracks.length} 首, 说唱推荐 ${rapTracks.length} 首`, 'info')

					set({
						recommendByFavoriteTracks: byFavoriteTracks,
						recommendRapTracks: rapTracks,
						lastRecommendRefreshTime: Date.now(),
					})

					if (byFavoriteTracks.length > 0 || rapTracks.length > 0) {
						addLog('recommend', '推荐模块刷新完成', 'success')
					} else {
						addLog('recommend', '所有方法都失败，未获取到推荐歌曲', 'error')
					}
				} catch (error) {
					addLog('recommend', `刷新推荐模块失败: ${error}`, 'error')
				}
			},

			// 只刷新"根据你喜爱的歌曲推荐"
			refreshByFavorite: async () => {
				const { cookie, tracks, userId } = get()
				addLog('recommend', '开始刷新喜爱推荐', 'info')

				if (!cookie) {
					addLog('recommend', '未登录网易云', 'warn')
					return
				}

				try {
					let recommendTracks: DailyTrack[] = []
					let lovedTracks: DailyTrack[] = []
					const randomOffset = Math.floor(Math.random() * 30)

					// 1. 获取热门歌单作为推荐歌曲
					try {
						const hotPlaylists = await fetch(`https://music.163.com/api/top/playlist?limit=30&order=hot&offset=${randomOffset}&timestamp=${Date.now()}`, {
							headers: {
								'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
								Referer: 'https://music.163.com/',
								Cookie: cookie,
							},
						}).then(r => r.json())

						if (hotPlaylists.code === 200 && hotPlaylists.playlists?.length > 0) {
							const playlists = hotPlaylists.playlists
							const favoriteIndex = Math.floor(Math.random() * playlists.length)
							const favoritePlaylist = playlists[favoriteIndex]
							addLog('recommend', `喜爱推荐选择歌单: ${favoritePlaylist.name}`, 'info')

							const detail = await getNeteasePlaylistDetail(favoritePlaylist.id, cookie)
							const songs = detail?.songs || detail?.tracks || []
							if (songs.length > 0) {
								const shuffled = [...songs].sort(() => Math.random() - 0.5)
								recommendTracks = shuffled.slice(0, 16)
							}
						}
					} catch (err) {
						addLog('recommend', `热门歌单获取失败: ${err}`, 'error')
					}

					// 2. 获取用户"我喜欢的音乐"歌单
					try {
						if (userId) {
							const userPlaylists = await getNeteaseUserPlaylists(userId, cookie)
							// 找到"我喜欢的音乐"歌单
							const lovedPlaylist = userPlaylists.find((p: any) =>
								p.name.includes('我喜欢') || p.name.includes('喜欢的音乐') || p.name.includes('喜欢')
							)
							if (lovedPlaylist) {
								addLog('recommend', `找到喜欢的歌单: ${lovedPlaylist.name} (id=${lovedPlaylist.id})`, 'info')
								const detail = await getNeteasePlaylistDetail(lovedPlaylist.id, cookie)
								const songs = detail?.songs || detail?.tracks || []
								if (songs.length > 0) {
									const shuffled = [...songs].sort(() => Math.random() - 0.5)
									lovedTracks = shuffled.slice(0, 16)
									addLog('recommend', `喜欢的歌单获取 ${lovedTracks.length} 首歌曲`, 'info')
								}
							} else {
								addLog('recommend', '未找到喜欢的歌单', 'warn')
							}
						}
					} catch (err) {
						addLog('recommend', `获取喜欢的歌单失败: ${err}`, 'error')
					}

					// 3. 55开混合：50%推荐 + 50%喜欢的歌单
					let byFavoriteTracks: DailyTrack[] = []
					if (recommendTracks.length > 0 && lovedTracks.length > 0) {
						// 各取8首，交替混合
						const recHalf = recommendTracks.slice(0, 8)
						const lovedHalf = lovedTracks.slice(0, 8)
						for (let i = 0; i < Math.max(recHalf.length, lovedHalf.length); i++) {
							if (i < recHalf.length) byFavoriteTracks.push(recHalf[i])
							if (i < lovedHalf.length) byFavoriteTracks.push(lovedHalf[i])
						}
						// 随机打乱
						byFavoriteTracks = byFavoriteTracks.sort(() => Math.random() - 0.5)
						addLog('recommend', `55开混合完成: 推荐${recHalf.length}首 + 喜欢${lovedHalf.length}首 = ${byFavoriteTracks.length}首`, 'info')
					} else if (recommendTracks.length > 0) {
						byFavoriteTracks = recommendTracks
						addLog('recommend', '只有推荐歌曲，使用全部推荐', 'info')
					} else if (lovedTracks.length > 0) {
						byFavoriteTracks = lovedTracks
						addLog('recommend', '只有喜欢的歌曲，使用全部喜欢', 'info')
					}

					// 备选方案
					if (byFavoriteTracks.length === 0) {
						try {
							const recommendSongs = await getNeteaseRecommendPlaylists()
							if (recommendSongs.length > 0) {
								const shuffled = [...recommendSongs].sort(() => Math.random() - 0.5)
								byFavoriteTracks = shuffled.slice(0, 16)
							}
						} catch (e) {
							addLog('recommend', `备选方案失败: ${e}`, 'error')
						}
					}

					if (byFavoriteTracks.length === 0 && tracks.length > 0) {
						const shuffled = [...tracks].sort(() => Math.random() - 0.5)
						byFavoriteTracks = shuffled.slice(0, 16)
					}

					set({ recommendByFavoriteTracks: byFavoriteTracks })
					addLog('recommend', `喜爱推荐刷新完成，共 ${byFavoriteTracks.length} 首`, 'success')
				} catch (error) {
					addLog('recommend', `刷新喜爱推荐失败: ${error}`, 'error')
				}
			},

			// 只刷新"根本停不下来的说唱"
			refreshRap: async () => {
				const { cookie, tracks, selectedRapArtists } = get()
				addLog('recommend', '开始刷新说唱推荐', 'info')

				if (!cookie) {
					addLog('recommend', '未登录网易云', 'warn')
					return
				}

				try {
					// 默认说唱歌手列表
					const DEFAULT_RAP_ARTISTS = [
						'The Weeknd',
						'Playboi Carti',
						'OsamaSon',
						'Ken Carson',
						'Kanye West',
						'Travis Scott',
						'Gunna',
						'Nine Vicious',
						'Metro Boomin',
						'21 Savage',
						'Lil Uzi Vert',
						'Kendrick Lamar',
						'SZA',
						'Future',
						'Don Toliver',
						'Young Thug',
						'Quavo',
						'Drake',
						'A$AP Rocky',
						'JACKBOYS',
						'Roddy Ricch',
						'Lil Tjay',
						'Kelly Clarkson',
						'Nettspend',
						'Ye',
						'Tay Keith',
						'Key Glock',
						'Offset',
						'slayr',
						'Lil Baby',
						'Mustard',
						'Migos',
						'Nav',
						'Young Stoner Life',
						'Destroy Lonely',
						'Rae Sremmurd',
						'Ty Dolla $ign',
						'Lil Durk',
						'Tyler, The Creator',
						'Lil Tecca',
						'J. Cole',
						'$LATTMONEYY',
						'¥$',
					]
					// 使用用户选择的歌手，如果没有选择则使用默认列表
					const RAP_ARTISTS = selectedRapArtists && selectedRapArtists.length > 0 ? selectedRapArtists : DEFAULT_RAP_ARTISTS

					// 随机选择 10-14 个歌手，确保凑够16首
					const shuffledArtists = [...RAP_ARTISTS].sort(() => Math.random() - 0.5)
					const selectedCount = 10 + Math.floor(Math.random() * 5) // 10-14个
					const selectedArtists = shuffledArtists.slice(0, selectedCount)
					addLog('recommend', `选择歌手: ${selectedArtists.join(', ')}`, 'info')

					// 并行获取所有歌手的歌曲
					const results = await Promise.all(
						selectedArtists.map(async (artistName) => {
							try {
								// 搜索歌手
								const searchResult = await searchNeteaseArtist(artistName, 1, 3)
								if (searchResult.data && searchResult.data.length > 0) {
									const artist = searchResult.data[0]
									// 获取歌手热门歌曲
									const singerDetail = await getNeteaseSingerDetail(artist.id)
									if (singerDetail && singerDetail.musicList && singerDetail.musicList.length > 0) {
										// 每个歌手最多3首，随机选择
										const artistSongs = [...singerDetail.musicList].sort(() => Math.random() - 0.5).slice(0, 3)
										addLog('recommend', `${artist.title} 获取 ${artistSongs.length} 首歌曲`, 'info')
										return artistSongs
									}
								}
								return []
							} catch (err) {
								addLog('recommend', `获取 ${artistName} 歌曲失败: ${err}`, 'error')
								return []
							}
						})
					)

					// 合并所有歌曲
					let rapTracks: DailyTrack[] = []
					results.forEach(songs => {
						rapTracks = rapTracks.concat(songs)
					})

					// 如果不够16首，继续从剩下的歌手获取
					if (rapTracks.length < 16) {
						const remainingArtists = shuffledArtists.slice(selectedCount)
						addLog('recommend', `当前只有 ${rapTracks.length} 首，继续从剩余歌手获取`, 'info')
						for (const artistName of remainingArtists) {
							if (rapTracks.length >= 16) break
							try {
								const searchResult = await searchNeteaseArtist(artistName, 1, 3)
								if (searchResult.data && searchResult.data.length > 0) {
									const artist = searchResult.data[0]
									const singerDetail = await getNeteaseSingerDetail(artist.id)
									if (singerDetail && singerDetail.musicList && singerDetail.musicList.length > 0) {
										const artistSongs = [...singerDetail.musicList].sort(() => Math.random() - 0.5).slice(0, 3)
										rapTracks = rapTracks.concat(artistSongs)
										addLog('recommend', `${artist.title} 补充 ${artistSongs.length} 首歌曲`, 'info')
									}
								}
							} catch (err) {
								addLog('recommend', `补充 ${artistName} 失败: ${err}`, 'error')
							}
							await new Promise(resolve => setTimeout(resolve, 100))
						}
					}

					// 随机打乱所有歌曲，取前16首
					rapTracks = rapTracks.sort(() => Math.random() - 0.5).slice(0, 16)
					addLog('recommend', `说唱推荐共获取 ${rapTracks.length} 首歌曲`, 'info')

					set({ recommendRapTracks: rapTracks })
					addLog('recommend', `说唱推荐刷新完成，共 ${rapTracks.length} 首`, 'success')
				} catch (error) {
					addLog('recommend', `刷新说唱推荐失败: ${error}`, 'error')
				}
			},

			importUserPlaylists: async (silent = false) => {
				const { cookie, userId, userPlaylists } = get()
				if (!cookie || !userId) {
					logInfo('[user-playlists] 未登录，跳过')
					return
				}

				try {
					logInfo('[user-playlists] 开始获取用户歌单, userId:', userId)
					if (!silent) showToast('正在同步网易云歌单...', '', 'info')
					const playlists = await getNeteaseUserPlaylists(userId, cookie)
					logInfo(`[user-playlists] API返回 ${playlists.length} 个歌单`)
					
					if (playlists.length === 0) {
						logInfo('[user-playlists] 没有歌单')
						if (!silent) showToast('未找到网易云歌单', '', 'info')
						return
					}

					// 标记已导入的歌单
					const importedIds = new Set(userPlaylists.filter((p) => p.imported).map((p) => String(p.id)))
					const newPlaylists = playlists.map((p) => ({
						...p,
						imported: importedIds.has(String(p.id)),
					}))
					set({ userPlaylists: newPlaylists })

					// 获取当前歌单列表
					const currentPlaylists = playListsStore.getValue() || []
					const existingIds = new Set(
						currentPlaylists.map((p: any) => String(p.neteasePlaylistId || '').replace('netease_playlist_', ''))
					)
					logInfo(`[user-playlists] 当前已有 ${currentPlaylists.length} 个歌单，已导入ID:`, Array.from(existingIds))

					// 清理之前误导入的收藏歌单（不在用户自己创建的列表里）
					// 注意：跳过发现页预加载/点开的推荐歌单（isRecommendPlaylist/isToplist），
					// 否则清理会把用户从发现页打开的推荐歌单一并删掉，导致详情页重定向回音乐库
					const ownIds = new Set(playlists.map((p: any) => String(p.id)))
					const toRemove = currentPlaylists.filter((p: any) => {
						if (p.isRecommendPlaylist || p.isToplist) return false
						if (!p.neteasePlaylistId) return false
						const pid = String(p.neteasePlaylistId).replace('netease_playlist_', '')
						return !ownIds.has(pid)
					})
					if (toRemove.length > 0) {
						logInfo(`[user-playlists] 清理 ${toRemove.length} 个误导入的收藏歌单:`, toRemove.map((p: any) => p.name))
						const remaining = currentPlaylists.filter((p: any) => !toRemove.includes(p))
						playListsStore.setValue(remaining)
						PersistStatus.set('music.playLists', remaining)
					}

					let importedCount = 0
					let skippedCount = 0
					let failedCount = 0
					const failedNames: string[] = []

					for (const pl of newPlaylists) {
						const plIdStr = String(pl.id)
						if (existingIds.has(plIdStr)) {
							logInfo(`[user-playlists] 跳过已导入: ${pl.name}`)
							skippedCount++
							continue
						}

						try {
							logInfo(`[user-playlists] 正在获取歌单详情: ${pl.name} (id: ${pl.id})`)
							const detail = await getNeteasePlaylistDetail(pl.id, cookie)
							if (detail) {
								const songs = detail.songs || detail.tracks || []
								const newPlaylist = {
									id: `netease_playlist_${pl.id}`,
									name: pl.name,
									title: pl.name,
									artwork: pl.coverImgUrl || detail.artwork || '',
									platform: 'netease',
									neteasePlaylistId: plIdStr,
									songs: songs,
									tracks: songs,
									description: `来自网易云：${pl.name}`,
									createdAt: Date.now(),
								}
								currentPlaylists.push(newPlaylist as any)
								importedCount++
								existingIds.add(plIdStr)
								logInfo(`[user-playlists] 导入成功: ${pl.name} (${songs.length}首)`)
							} else {
								failedCount++
								failedNames.push(pl.name)
								logError(`[user-playlists] 歌单详情为空: ${pl.name}`)
							}
						} catch (err) {
							failedCount++
							const errMsg = err instanceof Error ? err.message : String(err)
							failedNames.push(`${pl.name}(${errMsg})`)
							logError(`[user-playlists] 导入歌单 ${pl.name} 失败:`, errMsg)
						}
					}

					if (importedCount > 0) {
						playListsStore.setValue(currentPlaylists as any)
						PersistStatus.set('music.playLists', currentPlaylists)
						logInfo(`[user-playlists] 共导入 ${importedCount} 个新歌单，跳过 ${skippedCount} 个，失败 ${failedCount} 个`)
						if (!silent) {
							if (failedCount > 0) {
								showToast(`已同步${importedCount}个，${failedCount}个失败: ${failedNames.join('、')}`, '', 'info')
							} else {
								showToast(`已同步 ${importedCount} 个网易云歌单`, '', 'success')
							}
						}
					} else {
						logInfo(`[user-playlists] 没有新歌单需要导入，跳过 ${skippedCount} 个，失败 ${failedCount} 个`)
						if (!silent && failedCount > 0) {
							showToast(`同步失败: ${failedNames.join('、')}`, '', 'error')
						}
					}

					// 更新导入状态
					const updatedPlaylists = newPlaylists.map((p) => ({
						...p,
						imported: true,
					}))
					set({ userPlaylists: updatedPlaylists })
				} catch (error) {
					logError('[user-playlists] 获取用户歌单失败:', error)
					showToast('同步网易云歌单失败', '', 'error')
				}
			},

			setLoginInfo: (cookie, nickname, avatar, userId) => {
				set({ cookie, nickname, avatar, userId, isLoggedIn: true, lastRefreshTime: 0 })
				logInfo(`[daily] 登录成功: ${nickname}，重置日推刷新时间`)
				// 登录后立即刷新日推（不需要重启）
				setTimeout(() => {
					get().refreshDaily()
					get().refreshPersonalized()
				}, 500)
				// 登录后自动导入用户歌单
				setTimeout(() => {
					get().importUserPlaylists()
				}, 1500)
				// 登录后刷新关注歌手
				setTimeout(() => {
					get().refreshFollowedArtists()
				}, 2000)
			},

			logout: () => {
				set({
					cookie: '',
					nickname: '',
					avatar: '',
					userId: '',
					isLoggedIn: false,
					tracks: [],
					lastRefreshTime: 0,
					personalizedPlaylists: [],
					lastPersonalizedRefreshTime: 0,
				})
				logInfo('[daily] 退出登录')
			},

			refreshFollowedArtists: async () => {
				const { cookie, qqCookie } = get()
				addLog('followed-artists', '开始刷新关注歌手, wy=' + !!cookie + ' qq=' + !!qqCookie, 'info')
				try {
					let artists: FollowedArtist[] = []
					// 网易云关注歌手
					if (cookie) {
						try {
							const wyArtists = await getAllNeteaseFollowedArtists(cookie)
							artists = artists.concat(wyArtists)
							addLog('followed-artists', `网易云关注歌手: ${wyArtists.length} 个`, 'info')
						} catch (e) {
							addLog('followed-artists', `网易云关注歌手获取失败: ${e}`, 'error')
						}
					}
					// QQ音乐关注歌手
					if (qqCookie) {
						try {
							const qqArtists = await getAllQQFollowedSingers(qqCookie)
							artists = artists.concat(qqArtists)
							addLog('followed-artists', `QQ音乐关注歌手: ${qqArtists.length} 个`, 'info')
						} catch (e) {
							addLog('followed-artists', `QQ音乐关注歌手获取失败: ${e}`, 'error')
						}
					}
					// 去重（按名字）
					const seen = new Set()
					artists = artists.filter((a) => {
						const key = a.name.toLowerCase()
						if (seen.has(key)) return false
						seen.add(key)
						return true
					})
					set({ followedArtists: artists, followedArtistsLoaded: true })
					addLog('followed-artists', `关注歌手刷新完成，共 ${artists.length} 个`, 'success')
				} catch (error) {
					addLog('followed-artists', `刷新关注歌手失败: ${error}`, 'error')
									set({ followedArtistsLoaded: true })
				}
			},

			setQQLoginInfo: (cookie, nickname, avatar) => {
				set({ qqCookie: cookie, qqNickname: nickname, qqAvatar: avatar, qqLoggedIn: true })
				logInfo(`[daily] QQ音乐登录成功: ${nickname}`)
				// 登录后刷新关注歌手
				setTimeout(() => {
					get().refreshFollowedArtists()
				}, 1000)
			},

			qqLogout: () => {
				set({ qqCookie: '', qqNickname: '', qqAvatar: '', qqLoggedIn: false })
				logInfo('[daily] QQ音乐退出登录')
			},

			setSelectedRapArtists: (artists: string[]) => {
				set({ selectedRapArtists: artists })
				logInfo(`[daily] 更新说唱歌手选择: ${artists.length} 个`)
			},
		}),
		{
			name: 'daily-recommend-storage',
			storage: createJSONStorage(() => AsyncStorage),
		},
	),
)
