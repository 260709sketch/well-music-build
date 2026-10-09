import { internalFakeSoundKey, sortIndexSymbol, timeStampSymbol } from '@/constants/commonConst'
import { SoundAsset } from '@/constants/constant'
import Config from '@/store/config'
import delay from '@/utils/delay'
import { isSameMediaItem, mergeProps, sortByTimestampAndIndex } from '@/utils/mediaItem'
import * as FileSystem from 'expo-file-system'
import { produce } from 'immer'
import shuffle from 'lodash.shuffle'
import RNFS from 'react-native-fs'
import Toast from 'react-native-toast-message'
import ReactNativeTrackPlayer, {
	Event,
	State,
	Track,
	usePlaybackState,
	useProgress,
} from 'react-native-track-player'

import { MusicRepeatMode } from '@/helpers/types'
import PersistStatus from '@/store/PersistStatus'
import {
	getMusicIndex,
	getPlayList,
	getPlayListMusicAt,
	isInPlayList,
	isPlayListEmpty,
	setPlayList,
	usePlayList,
} from '@/store/playList'
import { createMediaIndexMap } from '@/utils/mediaIndexMap'
import { GlobalState } from '@/utils/stateMapper'
import { musicIsPaused } from '@/utils/trackUtils'
import { Alert, AppState, Image } from 'react-native'

import { myGetLyric } from '@/helpers/userApi/getMusicSource'
import { usePreloadSettingsStore } from '@/store/preloadSettingsStore'

import { fakeAudioMp3Uri } from '@/constants/images'
import { nowLanguage } from '@/utils/i18n'
import { showToast } from '@/utils/utils'
import { logError, logInfo } from './logger'
import { isLxMusicScript, reloadLxMusicScript } from './userApi/lxMusicSourceAdapter'

import {
	currentMusicStore,
	playListsStore,
	repeatModeStore,
	qualityStore,
	musicApiStore,
	musicApiSelectedStore,
	enabledMusicSourcesStore,
	nowApiState,
	autoCacheLocalStore,
	isCachedIconVisibleStore,
	songsNumsToLoadStore,
	importedLocalMusicStore,
	nowLyricState,
	nowTranslationState,
	trackSkipLoadingStore,
	trackSourceLoadingStore,
} from '@/player/PlayerStore'

import {
	isCached,
	downloadToCache,
	clearCache,
	getLocalFilePath,
	ensureCacheDirExists,
	ensureDirExists,
} from '@/player/CacheManager'

import { resolveSource, preloadSource, clearMemoryCacheForItem } from '@/player/MusicSourceResolver'
import { useAutoSourceSwitchStore } from '@/store/autoSourceSwitchStore'
import { useVolumeNormalizationStore } from '@/store/volumeNormalizationStore'
import { addToPlayHistory } from '@/helpers/playHistory'

// 启动后第一次播放绕过缓存标记
let skipCacheForFirstPlay = false
const NEXT_TRACK_PRELOAD_DELAY_MS = 8000
const createTrackSourceLoadingToken = (musicItem: IMusic.IMusicItem) =>
	`track_source_${musicItem.id}_${Date.now().toString(36)}_${Math.random()
		.toString(36)
		.slice(2, 8)}`

export {
	playListsStore,
	repeatModeStore,
	qualityStore,
	musicApiStore,
	musicApiSelectedStore,
	enabledMusicSourcesStore,
	nowApiState,
	autoCacheLocalStore,
	isCachedIconVisibleStore,
	songsNumsToLoadStore,
	importedLocalMusicStore,
	nowLyricState,
	nowTranslationState,
	trackSkipLoadingStore,
	trackSourceLoadingStore,
	playListSourceStore,
}

/** 当前播放来源描述（歌单名/专辑名/歌手名等）；单曲或混合列表时为 null */
const playListSourceStore = new GlobalState<string | null>(null)

export function setPlayListSource(title: string | null) {
	playListSourceStore.setValue(title)
}

export function getPlayListSource() {
	return playListSourceStore.getValue()
}

export const usePlayListSource = playListSourceStore.useValue

export function useCurrentQuality() {
	const currentQuality = qualityStore.useValue()
	const setCurrentQuality = (newQuality: IMusic.IQualityKey) => {
		setQuality(newQuality)
	}
	return [currentQuality, setCurrentQuality] as const
}

let currentIndex = -1

let hasSetupListener = false
let isSwitchingTrack = false
// 播放代次：每切到一首新歌 +1，用于丢弃过期的音源加载，防止快速切歌时旧音频覆盖新音频
let playGeneration = 0
// 漫游/心动续批去重（同一时间只允许一个拉取请求）
let roamRefreshPromise: Promise<void> | null = null

function migrate() {
	PersistStatus.set('music.rate', 1)
	PersistStatus.set('music.repeatMode', MusicRepeatMode.QUEUE)
	PersistStatus.set('music.progress', 0)
	Config.set('status.music', undefined)
}

async function setupTrackPlayer() {
	migrate()
	const rate = PersistStatus.get('music.rate')
	const musicQueue = PersistStatus.get('music.play-list')
	const legacyPlayQueue = PersistStatus.get('music.playList')
	const repeatMode = PersistStatus.get('music.repeatMode')
	const progress = PersistStatus.get('music.progress')
	const track = PersistStatus.get('music.musicItem')
	const quality = PersistStatus.get('music.quality') || 'flac'
	// 一次性迁移：把旧的128k默认音质升级为flac
	if (!PersistStatus.get('music.qualityMigrated') && quality === '128k') {
		PersistStatus.set('music.quality', 'flac')
		PersistStatus.set('music.qualityMigrated', true)
		qualityStore.setValue('flac')
	} else {
		qualityStore.setValue(quality)
	}
	const playLists = PersistStatus.get('music.playLists')
	const musicApiLists = PersistStatus.get('music.musicApi')
	const selectedMusicApi = PersistStatus.get('music.selectedMusicApi')
	const importedLocalMusic = PersistStatus.get('music.importedLocalMusic')
	const autoCacheLocal = PersistStatus.get('music.autoCacheLocal') ?? true
	const language = PersistStatus.get('app.language') ?? 'zh'
	const isCachedIconVisible = PersistStatus.get('music.isCachedIconVisible') ?? true
	const songsNumsToLoad = PersistStatus.get('music.songsNumsToLoad') ?? 100
	const enabledMusicSources = PersistStatus.get('music.enabledMusicSources') ?? []
	const restoredQueue = musicQueue ?? legacyPlayQueue

	if (!musicQueue && legacyPlayQueue) {
		PersistStatus.set('music.play-list', legacyPlayQueue)
		PersistStatus.set('music.playList', undefined)
	}
	// 状态恢复
	if (rate) {
		await ReactNativeTrackPlayer.setRate(+rate)
	}
	if (repeatMode) {
		repeatModeStore.setValue(repeatMode as MusicRepeatMode)
	}

	if (quality) {
		setQuality(quality as IMusic.IQualityKey)
	}
	if (playLists) {
		// 清理之前错误导入的歌曲歌单（有songmid字段的是歌曲不是歌单）
		const cleanedPlayLists = playLists.filter((p: any) => !p.songmid)
		if (cleanedPlayLists.length !== playLists.length) {
			logInfo(`启动清理: 移除${playLists.length - cleanedPlayLists.length}个错误导入的歌曲歌单`)
			PersistStatus.set('music.playLists', cleanedPlayLists)
		}
		playListsStore.setValue(cleanedPlayLists)
	}
	if (musicApiLists) {
		// 过滤掉内置音源，只保留用户导入的音源
		const userApis = musicApiLists.filter((api: any) => api.id !== 'builtin_multi_platform' && api.scriptType !== 'builtin')
		musicApiStore.setValue(userApis)
		// 如果过滤后音源列表变化了，更新持久化存储
		if (userApis.length !== musicApiLists.length) {
			PersistStatus.set('music.musicApi', userApis)
		}
	}
	// 检查选中的音源是否还在音源列表里，不在则清除（防止删除音源后残留）
	const currentApiList = musicApiStore.getValue() || []
	const selectedStillExists = selectedMusicApi && currentApiList.some((api: any) => api.id === selectedMusicApi.id)
	if (selectedStillExists && selectedMusicApi.id !== 'builtin_multi_platform' && selectedMusicApi.scriptType !== 'builtin') {
		musicApiSelectedStore.setValue(selectedMusicApi)
		await reloadNowSelectedMusicApi()
	} else if (selectedMusicApi) {
		// 选中的音源已被删除，清除残留
		musicApiSelectedStore.setValue(null)
		PersistStatus.set('music.selectedMusicApi', undefined)
		logInfo('启动清理: 选中的音源已不存在，已清除残留')
	}
	if (importedLocalMusic) {
		importedLocalMusicStore.setValue(importedLocalMusic)
	}
	if (enabledMusicSources && Array.isArray(enabledMusicSources)) {
		enabledMusicSourcesStore.setValue(enabledMusicSources)
	}
	if (restoredQueue && Array.isArray(restoredQueue)) {
		// 读取保存的索引和位置（记忆功能）
		const savedIndex = PersistStatus.get('music.lastPlayIndex') ?? 0
		const savedPosition = PersistStatus.get('music.lastPlayPosition') ?? 0
		const autoPlayOnLaunch = PersistStatus.get('music.autoPlayOnLaunch') ?? false
		const validIndex = Math.max(0, Math.min(savedIndex, restoredQueue.length - 1))

		if (restoredQueue.length > 0) {
			// 【修复】先恢复内存中的播放队列（在任何异步操作之前），
			// 避免后续获取播放链接/native add 期间被竞态打断导致队列丢失，
			// 最终重启后只剩当前播放的一首
			setPlayList(restoredQueue)
			// 无论是否自动播放，都恢复上次歌曲到迷你播放器
			try {
				const targetSong = restoredQueue[validIndex]
				skipCacheForFirstPlay = true
			logInfo(`启动恢复: 第${validIndex + 1}首歌 ${targetSong.title || targetSong.name}, 位置: ${savedPosition}秒, 自动播放: ${autoPlayOnLaunch}`)

				// 先暂停，避免任何自动播放
				await ReactNativeTrackPlayer.pause()

				// 先更新currentMusicStore，迷你播放器才能显示歌曲
				currentMusicStore.setValue(targetSong)
				currentIndex = validIndex
				// 本次启动恢复所属的播放代次：恢复期间若用户主动播新歌（play 会 ++playGeneration），
				// 后续 reset/add/skip/seek 全部作废，避免把新歌冲回上次退出前的队列
				const restoreGen = ++playGeneration

				// 总是获取目标歌曲的最新播放链接（避免缓存过期，手动播放也能用）
				let targetFreshUrl = ''
				try {
					const { url: freshUrl } = await resolveSource(targetSong, { requestType: 'current', bypassCache: true, silent: true })
					if (freshUrl && freshUrl !== 'Unknown' && !freshUrl.includes('fake')) {
						targetFreshUrl = freshUrl
						logInfo('启动恢复: 获取到最新播放链接')
					}
				} catch (e) {
					logError('启动恢复: 获取最新链接失败，使用缓存链接', e)
				}

				if (restoreGen !== playGeneration) {
					logInfo('启动恢复: 恢复期间用户已切歌，放弃恢复旧队列')
				} else {
					// 重置并添加队列（目标歌曲用最新链接，其他用缓存链接）
					try {
						await ReactNativeTrackPlayer.reset()
					} catch (e) {}
					// reset 是异步的：期间用户若已手动播歌，绝不能再把旧队列 add 回去冲掉新歌
					if (restoreGen !== playGeneration) {
						logInfo('启动恢复: reset 期间用户已切歌，放弃重建旧队列')
					} else {
					// 先恢复内存中的播放列表（不依赖 native 队列是否成功），避免 native add 失败导致队列只剩当前一首
					setPlayList(restoredQueue)
					const trackItems = restoredQueue.map((item: any, idx: number) => ({
						...item,
						title: item.title || item.name || '未知歌曲',
						artist: item.artist || '',
						artwork: item.artwork || item.pic || unknownTrackImageUri,
						duration: item.duration || 0,
						url: (idx === validIndex && targetFreshUrl) ? targetFreshUrl : fakeAudioMp3Uri,
						[timeStampSymbol]: Date.now(),
						[sortIndexSymbol]: idx,
					}))
					try {
						await ReactNativeTrackPlayer.add(trackItems)
					} catch (e) {
						logError('启动恢复: native add 队列失败（内存队列已恢复）', e)
					}
	
					// 跳转到指定歌曲（带重试）
					let skipSuccess = false
					for (let retry = 0; retry < 5 && !skipSuccess && restoreGen === playGeneration; retry++) {
						try {
							const queue = await ReactNativeTrackPlayer.getQueue()
							if (queue.length > validIndex) {
								await ReactNativeTrackPlayer.skip(validIndex)
								skipSuccess = true
							} else {
								await new Promise(r => setTimeout(r, 200))
							}
						} catch (e) {
							logInfo(`启动恢复: skip重试${retry + 1}失败`, (e as Error).message)
							await new Promise(r => setTimeout(r, 200))
						}
						}
					}
	
					if (restoreGen !== playGeneration) {
						logInfo('启动恢复: skip 期间用户已切歌，放弃定位与播放')
					} else {
						// 跳转到保存的位置
						if (savedPosition > 0) {
							try {
								await ReactNativeTrackPlayer.seekTo(savedPosition)
								logInfo(`启动恢复: 跳转到 ${savedPosition}秒`)
							} catch (e) {
								logError('启动恢复: 跳转位置失败', e)
							}
						}
		
						// 播放
						if (autoPlayOnLaunch) {
							// 短暂延迟确保播放器状态准备好，避免 PlaybackError
							await new Promise(r => setTimeout(r, 300))
							if (targetFreshUrl) {
								// 已获取到有效链接，直接播放
								await ReactNativeTrackPlayer.play()
								logInfo('启动恢复: 开始播放（使用最新链接）')
							} else {
								// 未获取到有效链接，调用 play() 动态解析
								logInfo('启动恢复: 未获取到最新链接，动态解析后播放')
								await play(targetSong, true)
							}
						} else {
							logInfo('启动恢复: 已恢复歌曲和进度，未自动播放')
						}
		
						// 后台获取歌词（不阻塞）
						myGetLyric(targetSong).then((lyc) => {
							if (isCurrentMusic(targetSong)) {
								nowLyricState.setValue(lyc.lyric)
								nowTranslationState.setValue(lyc.tlyric || '')
							}
						}).catch((e) => logInfo('启动恢复: 获取歌词失败', (e as Error).message))
					}
				}
			} catch (e) {
				logError('启动恢复失败', e)
			}
		}
	}
	if (autoCacheLocal == true || autoCacheLocal == false) {
		autoCacheLocalStore.setValue(autoCacheLocal)
	}
	if (isCachedIconVisible == true || isCachedIconVisible == false) {
		isCachedIconVisibleStore.setValue(isCachedIconVisible)
	}
	if (language) {
		nowLanguage.setValue(language)
	}
	if (songsNumsToLoad) {
		songsNumsToLoadStore.setValue(songsNumsToLoad)
	}
	if (!hasSetupListener) {
		ReactNativeTrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async (evt) => {
			// 音量归一化：切歌时自动设置为目标音量
			try {
				const volNorm = useVolumeNormalizationStore.getState()
				if (volNorm.enabled) {
					await ReactNativeTrackPlayer.setVolume(volNorm.targetVolume)
				}
			} catch (e) {}
			// 保存当前播放索引（记忆功能）
			try {
				if (currentIndex >= 0) {
					PersistStatus.set('music.lastPlayIndex', currentIndex)
					logInfo(`保存播放索引: ${currentIndex}`)
				}

				// 私人漫游 / 心动模式：接近队列末尾时，后台提前拉取下一批并去重追加
				ensureRoamingSongs().catch(() => {})
			} catch (e) {
				// 忽略保存错误
			}
			if (!isSwitchingTrack && evt.index === 1 && evt.lastIndex === 0 && evt.track?.$ === internalFakeSoundKey) {
				logInfo('队列末尾，播放下一首')
				if (repeatModeStore.getValue() === MusicRepeatMode.SINGLE) {
					await play(null, true)
				} else {
					// 当前生效的歌曲是下一曲的标记
					await skipToNext()
				}
			}
		})

		// 播放错误连续计数：避免单次网络抖动误触发自动换源
		let consecutivePlaybackErrorCount = 0
		let lastPlaybackErrorTime = 0
		ReactNativeTrackPlayer.addEventListener(Event.PlaybackError, async (e) => {
			// WARNING: 不稳定，报错的时候有可能track已经变到下一首歌去了
			const currentTrack = await ReactNativeTrackPlayer.getActiveTrack()
			if (currentTrack?.isInit) {
				// HACK: 避免初始失败的情况

				await ReactNativeTrackPlayer.updateMetadataForTrack(0, {
					...currentTrack,
					// eslint-disable-next-line @typescript-eslint/ban-ts-comment
					// @ts-expect-error
					isInit: undefined,
				})
				return
			}

			if ((await ReactNativeTrackPlayer.getActiveTrackIndex()) === 0 && e.message) {
				// 记录本次错误所属的播放代次与歌曲：恢复旧队列/用户重新播歌后，旧错误一律作废，避免误触发自动换源
				const errGen = playGeneration
				const errSongKey = songKeyOf(currentMusicStore.getValue())
				logInfo('播放出错', {
					message: e.message,
					code: e.code,
				})
				
				// 检查当前播放进度：如果已经播放超过10秒，说明歌曲之前在正常播放，可能只是短暂网络抖动
				try {
					const currentPos = await ReactNativeTrackPlayer.getPosition()
					const now = Date.now()
					
					// 5秒内的连续错误才计数，超过5秒重置
					if (now - lastPlaybackErrorTime > 5000) {
						consecutivePlaybackErrorCount = 0
					}
					lastPlaybackErrorTime = now
					consecutivePlaybackErrorCount++
					
					logInfo('[playback-error] 当前播放进度: ' + currentPos.toFixed(1) + '秒, 连续错误次数: ' + consecutivePlaybackErrorCount)
					
					// 首次报错（5秒窗口内）先宽限，不立刻换源：冷启动/瞬时网络抖动/播放器假死可能自愈。
					// 先等1.5秒，仍不恢复就在“同一链接”原位重试一次播放，再等1.5秒确证；确证失败才换源。
					if (consecutivePlaybackErrorCount < 2) {
						logInfo('[playback-error] 首次报错，先宽限并原位重试一次，确证失败再换源（不立即换源）')
						setTimeout(async () => {
							try {
								if (errGen !== playGeneration || songKeyOf(currentMusicStore.getValue()) !== errSongKey) {
									logInfo('[playback-error] 宽限期间已切歌/重新播放，忽略本次旧错误')
									consecutivePlaybackErrorCount = 0
									return
								}
								const recovered = async () => {
									const st = await ReactNativeTrackPlayer.getPlaybackState()
									const p2 = await ReactNativeTrackPlayer.getPosition()
									return st.state === State.Playing || Math.abs(p2 - currentPos) > 0.5
								}
								if (await recovered()) {
									logInfo('[playback-error] 宽限内已自动恢复，不换源')
									consecutivePlaybackErrorCount = 0
									return
								}
								// 同一链接原位重试一次（不换源），应对冷启动/播放器假死
								try { await ReactNativeTrackPlayer.play() } catch (re) {}
								await new Promise((rr) => setTimeout(rr, 1500))
								if (await recovered()) {
									logInfo('[playback-error] 原位重试后恢复，不换源')
									consecutivePlaybackErrorCount = 0
									return
								}
								logInfo('[playback-error] 宽限+原位重试后仍失败，确证触发换源')
								if (useAutoSourceSwitchStore.getState().enabled) {
									await failToPlay()
								}
							} catch (checkErr) {
								logError('[playback-error] 恢复检查失败:', checkErr)
							}
						}, 1500)
						return
					}
				} catch (posErr) {
					logError('[playback-error] 获取播放进度失败:', posErr)
				}
				
				// 宽限确证期间用户已切歌/重新播放：旧错误作废，不换源
				if (errGen !== playGeneration || songKeyOf(currentMusicStore.getValue()) !== errSongKey) {
					consecutivePlaybackErrorCount = 0
					return
				}

				if (useAutoSourceSwitchStore.getState().enabled) {
					await failToPlay()
				}
			}
		})


		// AppState监听：应用退出时保存播放位置（记忆功能）
		const savePlayPosition = async () => {
			try {
				const position = await ReactNativeTrackPlayer.getPosition()
				if (position > 0) {
					PersistStatus.set('music.lastPlayPosition', position)
					logInfo(`保存播放位置: ${position}秒`)
				}
			} catch (e) {
				// 忽略保存错误
			}
		}

		AppState.addEventListener('change', (nextAppState) => {
			if (nextAppState === 'inactive' || nextAppState === 'background') {
				savePlayPosition()
			}
		})

	// 假播放检测：Playing状态但进度15秒不动，连续2次确认后才触发换源
	let lastPosition = 0
	let lastPositionTime = 0
	let fakePlayDetectCount = 0
	let lastBufferedPosition = 0
	// 缓冲卡死检测：Buffering/Connecting超过15秒自动重试播放
	let bufferingSince: number | null = null
	setInterval(async () => {
		try {
			const state = await ReactNativeTrackPlayer.getPlaybackState()
			// 缓冲卡死检测：卡在Buffering/Connecting超过15秒自动重试
			if (state.state === State.Buffering || state.state === State.Connecting) {
				const now = Date.now()
				if (bufferingSince === null) {
					bufferingSince = now
				} else if (now - bufferingSince > 15000) {
					logInfo('缓冲卡死检测：卡在缓冲状态超过15秒，自动重试播放')
					bufferingSince = now
					try {
						await ReactNativeTrackPlayer.play()
					} catch (retryErr) {
						logError('缓冲卡死重试播放失败:', retryErr)
					}
				}
			} else {
				bufferingSince = null
			}
			if (state.state === State.Playing) {
				const pos = await ReactNativeTrackPlayer.getPosition()
				const now = Date.now()
				// 检查 buffered 是否还在增加，如果还在增加说明只是缓冲慢，不是假播放
				let bufferedPos = 0
				try { const buffered = await ReactNativeTrackPlayer.getBufferedPosition(); bufferedPos = buffered || 0 } catch (e) {}
				const isBuffering = bufferedPos > lastBufferedPosition + 0.1
				lastBufferedPosition = bufferedPos
				if (Math.abs(pos - lastPosition) < 0.1 && now - lastPositionTime > 15000 && pos > 0 && !isBuffering) {
					fakePlayDetectCount++; logInfo('假播放检测：Playing但进度持续15秒未动（第' + fakePlayDetectCount + '次确认）')
					lastPositionTime = now
					// 连续2次确认才换源，避免网络波动导致的单次误判
					if (fakePlayDetectCount >= 2) {
						logInfo('假播放检测：连续2次确认，触发换源')
						fakePlayDetectCount = 0
						if (useAutoSourceSwitchStore.getState().enabled) {
							await failToPlay()
						}
					}
				} else if (Math.abs(pos - lastPosition) >= 0.1) {
					lastPosition = pos
					lastPositionTime = now
					fakePlayDetectCount = 0
				} else {
					// 进度没动但 buffered 还在增加，重置检测计数
					fakePlayDetectCount = 0
				}
			}
		} catch (e) {}
	}, 2000)

		hasSetupListener = true
		logInfo('播放器初始化完成')
	}
}

/**
 * 获取自动播放的下一个track，保持nextTrack 不变,生成nextTrack的with fake url 形式  假音频
 * 获取下一个 track 并设置其属性为假音频。这在测试或处理特殊情况时非常有用
 */
const getFakeNextTrack = () => {
	let track: Track | undefined

	const repeatMode = repeatModeStore.getValue()

	if (repeatMode === MusicRepeatMode.SINGLE) {
		// 单曲循环
		track = getPlayListMusicAt(currentIndex) as Track
	} else {
		// 下一曲
		track = getPlayListMusicAt(currentIndex + 1) as Track
	}

	try {
		const soundAssetSource = Image.resolveAssetSource(SoundAsset.fakeAudio).uri
		if (track) {
			const a = produce(track, (_) => {
				_.url = soundAssetSource
				_.$ = internalFakeSoundKey
				if (!_.artwork?.trim()?.length) {
					_.artwork = undefined
				}
			})
			return a
		} else {
			// 只有列表长度为0时才会出现的特殊情况
			return { url: soundAssetSource, $: internalFakeSoundKey } as Track
		}
	} catch (error) {
		logError('An error occurred while processing the track:', error)
	}
}

/** 播放失败时的情况：自动跳下一首 */
let consecutiveFailCount = 0

/**
 * 自动换源去重（对齐 lxmusic）：
 * - failedSourcesBySong：每首歌一个“已确证播放失败的音源 id”集合，换源时排除，
 *   同一音源对同一首歌只试一次，不在刚失败的源上反复横跳；
 * - lastResolvedSource：最近一次实际用于播放的音源（resolver 命中后回填），播放报错时据此知道是哪个源失败。
 */
const failedSourcesBySong = new Map<string, Set<string>>()
// failToPlay 并发锁：宽限定时器与连续错误可能同时触发，同一时间只允许一个换源流程
let failToPlayInFlight = false
let lastResolvedSource: { songKey: string; sourceId: string | null; sourceName: string | null } | null = null
const songKeyOf = (m?: IMusic.IMusicItem | null): string => {
	if (!m) return ''
	return `${m.platform || m.source || 'unknown'}|${m.id || m.songmid || `${m.title || ''}_${m.artist || ''}`}`
}
const getFailedSet = (m: IMusic.IMusicItem): Set<string> => {
	const k = songKeyOf(m)
	let set = failedSourcesBySong.get(k)
	if (!set) {
		set = new Set<string>()
		failedSourcesBySong.set(k, set)
	}
	return set
}

async function failToPlay() {
	const autoSwitch = useAutoSourceSwitchStore.getState()
	// 自动换源关闭时：只重置播放器和加载状态，不自动跳下一首
	if (!autoSwitch.enabled) {
		await ReactNativeTrackPlayer.reset()
		trackSourceLoadingStore.setValue(null)
		return
	}
	const curMusic = currentMusicStore.getValue()
	if (!curMusic) {
		await ReactNativeTrackPlayer.reset()
		trackSourceLoadingStore.setValue(null)
		return
	}
	// 队列只有一首歌时停止
	const playList = playListStore.getValue()
	if (playList.length <= 1) {
		logInfo('队列只有一首歌，停止自动跳过')
		await ReactNativeTrackPlayer.reset()
		trackSourceLoadingStore.setValue(null)
		return
	}

	if (failToPlayInFlight) {
		logInfo('[failToPlay] 已有换源流程在进行，跳过本次重复触发')
		return
	}
	failToPlayInFlight = true
	try {
	consecutiveFailCount++
	const fkey = songKeyOf(curMusic)
	const maxAttempts = autoSwitch.maxAttempts || 5

	// 按策略优先级顺序执行
	for (const strategy of autoSwitch.strategyPriority) {
		// 策略1：自动切换音源（只换源，不降低音质）
		if (strategy === 'switch_source') {
			if (consecutiveFailCount <= maxAttempts) {
				try {
					// 把上一次实际播放失败的音源记入失败集，本次解析排除它（每个源对同一首歌只试一次）
					if (lastResolvedSource && lastResolvedSource.songKey === fkey && lastResolvedSource.sourceId) {
						getFailedSet(curMusic).add(lastResolvedSource.sourceId)
					}
					const excludeSourceIds = Array.from(getFailedSet(curMusic))

					// 清除当前歌曲的所有缓存（内存+磁盘），避免用过期URL
					clearMemoryCacheForItem(curMusic)

					logInfo(`[failToPlay] 第${consecutiveFailCount}次换源，排除失败源=[${excludeSourceIds.join(',')}]`)

					// 只换源，不降低音质；排除已确证失败的音源，避免反复横跳
					const result = await resolveSource(curMusic as IMusic.IMusicItem, { requestType: 'current', fallbackMode: 'source_only', excludeSourceIds })
					if (result.url && !result.url.includes('fake')) {
						lastResolvedSource = { songKey: fkey, sourceId: result.sourceId ?? null, sourceName: result.sourceName ?? null }
						logInfo(`[failToPlay] 换源成功，使用「${result.sourceName || '未知音源'}」播放`)
						consecutiveFailCount = 0
						const newTrack: Track = {
							...(curMusic as any),
							url: result.url,
						}
						await setTrackSource(newTrack, true)
						return
					}
					logInfo(`[failToPlay] 换源未获取到有效URL（剩余音源可能都已试过），尝试下一策略`)
				} catch (e) {
					logError(`[failToPlay] 切换音源异常:`, e)
				}
			}
		}
		// 策略2：降低音质（只降音质，不切换音源）
		else if (strategy === 'lower_quality') {
			if (consecutiveFailCount <= maxAttempts) {
				try {
					// 进入“降低音质”维度：清空失败源记录，让各音源在低音质下重新尝试
					getFailedSet(curMusic).clear()
					clearMemoryCacheForItem(curMusic)

					logInfo(`[failToPlay] 第${consecutiveFailCount}次，降低音质重试...`)

					// 只降音质，不切换音源
					const result = await resolveSource(curMusic as IMusic.IMusicItem, { requestType: 'current', fallbackMode: 'quality_only' })
					if (result.url && !result.url.includes('fake')) {
						lastResolvedSource = { songKey: fkey, sourceId: result.sourceId ?? null, sourceName: result.sourceName ?? null }
						logInfo(`[failToPlay] 降低音质成功，使用「${result.sourceName || '未知音源'}」播放`)
						consecutiveFailCount = 0
						const newTrack: Track = {
							...(curMusic as any),
							url: result.url,
						}
						await setTrackSource(newTrack, true)
						return
					}
					logInfo(`[failToPlay] 降低音质未获取到有效URL，尝试下一策略`)
				} catch (e) {
					logError(`[failToPlay] 降低音质异常:`, e)
				}
			}
		}
		// 策略3：播放下一首
		else if (strategy === 'play_next') {
			logInfo(`[failToPlay] 执行策略=播放下一首`)
			consecutiveFailCount = 0
			showToast('自动换源', '播放失败，切换下一首', 'info')
			// 失败处理期间用户已手动切到别的歌则放弃，避免旧歌的跳歌覆盖新歌
			if (!isCurrentMusic(curMusic)) return
			await ReactNativeTrackPlayer.reset()
			await delay(500)
			await skipToNext()
			return
		}
	}

	// 兜底：所有策略执行完仍未成功，跳下一首
	logInfo(`[failToPlay] 所有策略执行完毕，兜底切换下一首`)
	if (!isCurrentMusic(curMusic)) {
		trackSourceLoadingStore.setValue(null)
		return
	}
	consecutiveFailCount = 0
	await ReactNativeTrackPlayer.reset()
	await delay(500)
	await skipToNext()
	} finally {
		failToPlayInFlight = false
	}
}

// 播放模式相关
const _toggleRepeatMapping = {
	[MusicRepeatMode.SHUFFLE]: MusicRepeatMode.SINGLE,
	[MusicRepeatMode.SINGLE]: MusicRepeatMode.QUEUE,
	[MusicRepeatMode.QUEUE]: MusicRepeatMode.SHUFFLE,
}
/** 切换下一个模式 */
const toggleRepeatMode = () => {
	setRepeatMode(_toggleRepeatMapping[repeatModeStore.getValue()])
}

/**
 * 添加到播放列表
 * @param musicItems 目标歌曲
 * @param beforeIndex 在第x首歌曲前添加
 * @param shouldShuffle 随机排序
 */
const addAll = (
	musicItems: Array<IMusic.IMusicItem> = [],
	beforeIndex?: number,
	shouldShuffle?: boolean,
) => {
	const now = Date.now()
	let newPlayList: IMusic.IMusicItem[] = []
	const currentPlayList = getPlayList()
	const _musicItems = musicItems.map((item, index) => ({
		...item,
		[timeStampSymbol]: now,
		[sortIndexSymbol]: index,
	}))
	if (beforeIndex === undefined || beforeIndex < 0) {
		newPlayList = currentPlayList.concat(_musicItems.filter((item) => !isInPlayList(item)))
	} else {
		const indexMap = createMediaIndexMap(_musicItems)
		const beforeDraft = currentPlayList.slice(0, beforeIndex).filter((item) => !indexMap.has(item))
		const afterDraft = currentPlayList.slice(beforeIndex).filter((item) => !indexMap.has(item))

		newPlayList = [...beforeDraft, ..._musicItems, ...afterDraft]
	}

	if (shouldShuffle) {
		newPlayList = shuffle(newPlayList)
	}
	setPlayList(newPlayList)
	const currentMusicItem = currentMusicStore.getValue()

	if (currentMusicItem) {
		currentIndex = getMusicIndex(currentMusicItem)
	}
}

/** 追加到队尾 */
const add = (musicItem: IMusic.IMusicItem | IMusic.IMusicItem[], beforeIndex?: number) => {
	addAll(Array.isArray(musicItem) ? musicItem : [musicItem], beforeIndex)
}

/**
 * 下一首播放
 * @param musicItem
 */
const addAsNextTrack = (musicItem: IMusic.IMusicItem | IMusic.IMusicItem[]) => {
	const shouldPlay = isPlayListEmpty()
	add(musicItem, currentIndex + 1)
	const item = Array.isArray(musicItem) ? musicItem[0] : musicItem
	if (!shouldPlay) {
		showToast('已插播，下一首播放', item.title || '', 'success')
	}
	if (shouldPlay) {
		play(item)
	}
}
/**
 * 是当前正在播放的音频
 *
 */
const isCurrentMusic = (musicItem: IMusic.IMusicItem | null | undefined) => {
	return isSameMediaItem(musicItem, currentMusicStore.getValue()) ?? false
}
/**
 * 从播放列表移除IMusicItem
 *
 */
const remove = async (musicItem: IMusic.IMusicItem) => {
	const playList = getPlayList()
	let newPlayList: IMusic.IMusicItem[] = []
	let currentMusic: IMusic.IMusicItem | null = currentMusicStore.getValue()
	const targetIndex = getMusicIndex(musicItem)
	let shouldPlayCurrent: boolean | null = null
	if (targetIndex === -1) {
		// 1. 这种情况应该是出错了
		return
	}
	// 2. 移除的是当前项
	if (currentIndex === targetIndex) {
		// 2.1 停止播放，移除当前项
		newPlayList = produce(playList, (draft) => {
			draft.splice(targetIndex, 1)
		})
		// 2.2 设置新的播放列表，并更新当前音乐
		if (newPlayList.length === 0) {
			currentMusic = null
			shouldPlayCurrent = false
		} else {
			currentMusic = newPlayList[currentIndex % newPlayList.length]
			try {
				const state = (await ReactNativeTrackPlayer.getPlaybackState()).state
				if (musicIsPaused(state)) {
					shouldPlayCurrent = false
				} else {
					shouldPlayCurrent = true
				}
			} catch {
				shouldPlayCurrent = false
			}
		}
	} else {
		// 3. 删除
		newPlayList = produce(playList, (draft) => {
			draft.splice(targetIndex, 1)
		})
	}

	setPlayList(newPlayList)
	setCurrentMusic(currentMusic)
	if (shouldPlayCurrent === true) {
		await play(currentMusic, true)
	} else if (shouldPlayCurrent === false) {
		await ReactNativeTrackPlayer.reset()
	}
}

/**
 * 设置播放模式
 * @param mode 播放模式
 */
const setRepeatMode = (mode: MusicRepeatMode) => {
	const playList = getPlayList()
	let newPlayList
	const prevMode = repeatModeStore.getValue()

	if (
		(prevMode === MusicRepeatMode.SHUFFLE && mode !== MusicRepeatMode.SHUFFLE) ||
		(mode === MusicRepeatMode.SHUFFLE && prevMode !== MusicRepeatMode.SHUFFLE)
	) {
		if (mode === MusicRepeatMode.SHUFFLE) {
			newPlayList = shuffle(playList)
		} else {
			newPlayList = sortByTimestampAndIndex(playList, true)
		}
		setPlayList(newPlayList)
	}

	const currentMusicItem = currentMusicStore.getValue()
	currentIndex = getMusicIndex(currentMusicItem)
	repeatModeStore.setValue(mode)
	// 更新下一首歌的信息
	ReactNativeTrackPlayer.updateMetadataForTrack(1, getFakeNextTrack())
	// 记录
	PersistStatus.set('music.repeatMode', mode)
}

/** 清空播放列表 */
const clear = async () => {
	setPlayList([])
	setCurrentMusic(null)

	await ReactNativeTrackPlayer.reset()
	PersistStatus.set('music.musicItem', undefined)
	PersistStatus.set('music.progress', 0)
}
/** 清空待播列表 */
const clearToBePlayed = async () => {
	// 获取当前正在播放的音乐
	const currentMusic = currentMusicStore.getValue()

	if (currentMusic) {
		// 设置播放列表仅包含当前正在播放的音乐
		setPlayList([currentMusic])
		setCurrentMusic(currentMusic)

		// 重置播放器并重新设置当前音轨
		// await setTrackSource(currentMusic as Track, true);
	} else {
		// 如果没有当前播放的音乐，清空播放列表
		setPlayList([])
		setCurrentMusic(null)
		await ReactNativeTrackPlayer.reset()
	}
	}


/** 暂停 */
const pause = async () => {
	await ReactNativeTrackPlayer.pause()
}

// ===== 播放/暂停淡入淡出（对齐 Kumone PlayerService 的 fadeVolume） =====
// 淡出：暂停前把音量平滑降到 0 再真正 pause，避免声音戛然而止。
// 淡入：播放时先把音量置 0，play 后平滑升到目标音量。
let _fadeTimer: ReturnType<typeof setInterval> | null = null
let _fadeVolumeBase = 0.85 // 淡入淡出的目标基准音量
let _fading = false

const getPersistFlag = (key: string, def: boolean): boolean => {
	try {
		const v = PersistStatus.get(key as any)
		return v === undefined ? def : v === true
	} catch (e) {
		return def
	}
}

const isFadeEnabled = (): boolean => getPersistFlag('player.fadeEnabled', false)

// 淡入淡出时长（秒），可由设置页调整：快速0.2 / 标准0.35 / 缓慢0.6
const getFadeDuration = (): number => {
	try {
		const v = PersistStatus.get('player.fadeDuration' as any)
		const n = Number(v)
		if (isFinite(n) && n > 0) return Math.min(n, 3)
	} catch (e) {}
	return 0.35
}

/** 读取当前应该使用的基准音量（音量归一化开启则用其目标值，否则用上次基准） */
const resolveBaseVolume = (): number => {
	try {
		const volNorm = useVolumeNormalizationStore.getState()
		if (volNorm.enabled) {
			_fadeVolumeBase = volNorm.targetVolume
		}
	} catch (e) {}
	return _fadeVolumeBase
}

/**
 * 淡出并暂停。
 * 若开启淡入淡出：将音量从当前值在 duration 秒内渐变到 0，完成后才 pause，并把音量恢复为基准（避免下次播放被 0 卡住）。
 * 若未开启：直接 pause（与 Kumone 一致：关闭开关时直接 engine.pause，音量不动）。
 */
const fadePause = async (duration?: number) => {
	// 停止任何进行中的淡入
	clearFade()
	const fadeDuration = duration ?? getFadeDuration()
	if (!isFadeEnabled() || fadeDuration <= 0) {
		await ReactNativeTrackPlayer.pause()
		return
	}
	_fading = true
	const base = resolveBaseVolume()
	try {
		const currentVol = await ReactNativeTrackPlayer.getVolume()
		const startVol = (_fadeVolumeBase > 0 && currentVol <= 0) ? _fadeVolumeBase : (isFinite(currentVol) ? currentVol : base)
		const steps = 16
		let step = 0
		await new Promise<void>((resolvePromise) => {
			_fadeTimer = setInterval(async () => {
				step += 1
				if (step > steps) {
					clearFade()
					try { await ReactNativeTrackPlayer.pause() } catch (e) {}
					// pause 后复位为基准音量，保证下次淡入起点正确
					try { await ReactNativeTrackPlayer.setVolume(base) } catch (e) {}
					_fading = false
					resolvePromise()
					return
				}
				const v = startVol + (0 - startVol) * (step / steps)
				try { await ReactNativeTrackPlayer.setVolume(Math.max(0, Math.min(1, v))) } catch (e) {}
			}, (fadeDuration / steps) * 1000)
		})
		} catch (e) {
			clearFade()
			_fading = false
			try { await ReactNativeTrackPlayer.pause() } catch (e2) {}
		}
	}

/**
 * 淡入播放。
 * 若开启淡入淡出：先把音量置 0 再 play，然后在 duration 秒内平滑升到基准音量。
 * 若未开启：volume 归一化开启则设为基准，否则保持当前音量，直接 play。
 */
const fadePlay = async (duration?: number) => {
	clearFade()
	const base = resolveBaseVolume()
	const fadeDuration = duration ?? getFadeDuration()
	if (!isFadeEnabled() || fadeDuration <= 0) {
		// 未开启淡入淡出：若音量归一化开启，仍先校正音量再播放（保持既有行为）
		try {
			const volNorm = useVolumeNormalizationStore.getState()
			if (volNorm.enabled) {
				await ReactNativeTrackPlayer.setVolume(volNorm.targetVolume)
			}
		} catch (e) {}
		await ReactNativeTrackPlayer.play()
		return
	}
	_fading = true
	try {
		await ReactNativeTrackPlayer.setVolume(0)
		await ReactNativeTrackPlayer.play()
		const startVol = 0
		const steps = 16
		let step = 0
		await new Promise<void>((resolvePromise) => {
			_fadeTimer = setInterval(async () => {
				step += 1
				if (step > steps) {
					clearFade()
					try { await ReactNativeTrackPlayer.setVolume(base) } catch (e) {}
					_fading = false
					resolvePromise()
					return
				}
				const v = startVol + (base - startVol) * (step / steps)
				try { await ReactNativeTrackPlayer.setVolume(Math.max(0, Math.min(1, v))) } catch (e) {}
			}, (fadeDuration / steps) * 1000)
		})
	} catch (e) {
		clearFade()
		_fading = false
		try { await ReactNativeTrackPlayer.setVolume(base) } catch (e2) {}
	}
}

const clearFade = () => {
	if (_fadeTimer) {
		clearInterval(_fadeTimer)
		_fadeTimer = null
	}
	_fading = false
}

/** 供其他模块（如断蓝牙暂停）调用：带淡出地暂停，并给出是否真的暂停了 */
const handleExternalPause = async (): Promise<boolean> => {
	try {
		const state = (await ReactNativeTrackPlayer.getPlaybackState()).state
		const active = state === State.Playing || state === State.Buffering || state === State.Loading
		if (!active) return false
		await fadePause()
		return true
	} catch (e) {
		return false
	}
}

/** 设置音源 */
const setTrackSource = async (track: Track, autoPlay = true) => {
	if (!track.artwork?.trim()?.length) {
		track.artwork = undefined
	}

	// 捕获本次加载所属播放代次：期间若用户又切歌，本次加载的 setQueue/reset/play 全部作废
	const gen = playGeneration
	isSwitchingTrack = true
	try {
		// 2. 设置队列
		await ReactNativeTrackPlayer.setQueue([track, getFakeNextTrack()])
		if (gen !== playGeneration) {
			logInfo('[setTrackSource] setQueue后已切到其他歌曲，放弃本次加载')
			return
		}

		// 3. 强制跳到track 0（reset后可能不在0）
		try { await ReactNativeTrackPlayer.skip(0) } catch (e) {}

		// 4. 验证active track是目标歌曲
		let verifyOk = false
		for (let i = 0; i < 8; i++) {
			if (gen !== playGeneration) {
				logInfo('[setTrackSource] 验证期间已切歌，放弃本次加载')
				return
			}
			try {
				const activeTrack = await ReactNativeTrackPlayer.getActiveTrack()
				if (activeTrack && String(activeTrack.id) === String(track.id)) {
					verifyOk = true
					break
				}
			} catch (e) {}
			await new Promise(r => setTimeout(r, 50))
		}

		if (!verifyOk) {
			// 已切歌时绝不允许 reset（否则会把队列重置回旧歌、覆盖最新播放）
			if (gen !== playGeneration) {
				logInfo('[setTrackSource] 验证失败但已切歌，放弃reset重试')
				return
			}
			logInfo('[setTrackSource] 验证失败，重试reset+setQueue+skip')
			try { await ReactNativeTrackPlayer.pause() } catch (e) {}
			await ReactNativeTrackPlayer.reset()
			if (gen !== playGeneration) return
			await new Promise(r => setTimeout(r, 100))
			if (gen !== playGeneration) return
			await ReactNativeTrackPlayer.setQueue([track, getFakeNextTrack()])
			if (gen !== playGeneration) return
			try { await ReactNativeTrackPlayer.skip(0) } catch (e) {}
		}

		if (gen !== playGeneration) return

		PersistStatus.set('music.musicItem', track as IMusic.IMusicItem)
		PersistStatus.set('music.progress', 0)

		// 5. 播放
		if (autoPlay && gen === playGeneration) {
			try {
				await ReactNativeTrackPlayer.play()
			} catch (e) {
				logError('[setTrackSource] play失败:', e)
			}
		}
	} finally {
		setTimeout(() => { isSwitchingTrack = false }, 600)
	}
}

/** 无缝换源：同一首歌只替换 URL，不中断播放 */
const replaceCurrentTrackUrl = async (newUrl: string): Promise<boolean> => {
	try {
		const activeIndex = await ReactNativeTrackPlayer.getActiveTrackIndex()
		if (activeIndex === undefined || activeIndex < 0) return false
		const activeTrack = await ReactNativeTrackPlayer.getActiveTrack()
		if (!activeTrack) return false
		// 直接替换当前 track 的 URL，播放器会无缝切换到新音源
		await ReactNativeTrackPlayer.updateMetadataForTrack(activeIndex, {
			...activeTrack,
			url: newUrl,
		} as any)
		logInfo(`[replaceCurrentTrackUrl] 无缝换源成功，index=${activeIndex}`)
		return true
	} catch (e) {
		logError('[replaceCurrentTrackUrl] 无缝换源失败:', e)
		return false
	}
}
/**
 * 设置currentMusicStore，更新currentIndex
 *
 */
const setCurrentMusic = (musicItem?: IMusic.IMusicItem | null) => {
	if (!musicItem) {
		currentIndex = -1
		currentMusicStore.setValue(null)
		trackSourceLoadingStore.setValue(null)
		PersistStatus.set('music.musicItem', undefined)
		PersistStatus.set('music.progress', 0)
		return
	}
	currentIndex = getMusicIndex(musicItem)
	currentMusicStore.setValue(musicItem)
}

const setQuality = (quality: IMusic.IQualityKey) => {
	qualityStore.setValue(quality)
	PersistStatus.set('music.quality', quality)
}
//添加歌曲到指定歌单
const addSongToStoredPlayList = (playlist: IMusic.PlayList, track: IMusic.IMusicItem) => {
	try {
		const nowPlayLists = playListsStore.getValue() || []
		const updatedPlayLists = nowPlayLists.map((existingPlaylist) => {
			if (existingPlaylist.id === playlist.id) {
				// 检查歌曲是否已经存在于播放列表中
				// console.log('track', JSON.stringify(track))
				// console.log('existingPlaylist.songs', JSON.stringify(existingPlaylist.songs))
				const songExists = existingPlaylist.songs.some((song) => song.id == track.id)
				// console.log('songExists', songExists)

				if (!songExists) {
					// 只有当歌曲不存在时才添加
					// 自建歌单且无封面时，自动使用第一首歌的封面
					const isCustomPlaylist = existingPlaylist.platform === 'custom' || existingPlaylist.platform === 'local' || existingPlaylist.id?.startsWith('custom_') || existingPlaylist.id?.startsWith('local_')
					const hasCover = !!(existingPlaylist.artwork?.trim()?.length || existingPlaylist.coverImg?.trim()?.length)
					const newCover = isCustomPlaylist && !hasCover ? (track.artwork || track.pic || track.coverImg || '') : (existingPlaylist.artwork || '')
					return {
						...existingPlaylist,
						songs: [...existingPlaylist.songs, track],
						artwork: newCover || existingPlaylist.artwork,
						coverImg: newCover || existingPlaylist.coverImg,
					}
					logInfo('歌曲已存在')
				}
			}
			return existingPlaylist
		})

		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('歌曲成功添加到歌单')
	} catch (error) {
		logError('添加歌曲到歌单时出错:', error)
		// 可以在这里添加一些错误处理逻辑，比如显示一个错误提示给用户
	}
}
//从歌单删除指定歌曲
//添加歌曲到指定歌单
const deleteSongFromStoredPlayList = (playlist: IMusic.PlayList, trackId: string) => {
	try {
		const nowPlayLists = playListsStore.getValue() || []
		const updatedPlayLists = nowPlayLists.map((existingPlaylist) => {
			if (existingPlaylist.id === playlist.id) {
				// 检查歌曲是否已经存在于播放列表中
				const songExists = existingPlaylist.songs.some((song) => song.id == trackId)

				if (songExists) {
					// 只有当歌曲存在时才删除
					return {
						...existingPlaylist,
						songs: existingPlaylist.songs.filter((song) => song.id !== trackId),
					}
				} else {
					logInfo('歌曲不存在')
				}
			}
			return existingPlaylist
		})

		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('歌曲成功删除')
	} catch (error) {
		logError('删除歌曲到歌单时出错:', error)
		// 可以在这里添加一些错误处理逻辑，比如显示一个错误提示给用户
	}
}
const addPlayLists = (playlist: IMusic.PlayList) => {
	try {
		const nowPlayLists = playListsStore.getValue() || []

		// 检查播放列表是否已存在
		const playlistExists = nowPlayLists.some(
			(existingPlaylist) => existingPlaylist.id == playlist.id,
		)

		if (playlistExists) {
			// logInfo(`Playlist already exists, not adding duplicate. Current playlists: ${JSON.stringify(nowPlayLists, null, 2)}`);
			return // 如果播放列表已存在，直接返回，不进行任何操作
		}

		// 如果播放列表不存在，则添加它
		const updatedPlayLists = [...nowPlayLists, playlist]
		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('Playlist added successfully')
	} catch (error) {
		logError('Error adding playlist:', error)
		// 可以在这里添加一些错误处理逻辑，比如显示一个错误提示给用户
	}
}
const deletePlayLists = (playlistId: string) => {
	try {
		if (playlistId == 'favorites') {
			return '不能删除收藏歌单'
		}
		const nowPlayLists = playListsStore.getValue() || []

		// 检查播放列表是否已存在
		const playlistFiltered = nowPlayLists.filter(
			(existingPlaylist) => existingPlaylist.id !== playlistId,
		)

		// 如果播放列表不存在，则添加它
		const updatedPlayLists = [...playlistFiltered]
		playListsStore.setValue(updatedPlayLists)
		PersistStatus.set('music.playLists', updatedPlayLists)
		logInfo('Playlist deleted successfully')
		return 'success'
	} catch (error) {
		logError('Error deleted playlist:', error)
	}
}
const getPlayListById = (playlistId: string) => {
	try {
		// logInfo(playlistId + 'playlistId')
		const nowPlayLists = playListsStore.getValue() || []
		const playlistFiltered = nowPlayLists.filter(
			(existingPlaylist) => existingPlaylist.id === playlistId,
		)
		return playlistFiltered
	} catch (error) {
		logError('Error find playlist:', error)
	}
}
const addMusicApi = (musicApi: IMusic.MusicApi) => {
	try {
		const nowMusicApiList = musicApiStore.getValue() || []

		// 检查是否已存在
		const existingApiIndex = nowMusicApiList.findIndex(
			(existingApi) => existingApi.id === musicApi.id,
		)

		if (existingApiIndex !== -1) {
			Alert.alert('是否覆盖', `已经存在该音源，是否覆盖？`, [
				{
					text: '确定',
					onPress: () => {
						const updatedMusicApiList = [...nowMusicApiList]
						// 保留原有的 isSelected 状态
						updatedMusicApiList[existingApiIndex] = {
							...musicApi,
							isSelected: updatedMusicApiList[existingApiIndex].isSelected,
						}
						musicApiStore.setValue(updatedMusicApiList)
						PersistStatus.set('music.musicApi', updatedMusicApiList)
						logInfo('Music API updated successfully')
						Alert.alert('成功', '音源更新成功', [
							{ text: '确定', onPress: () => logInfo('Update alert closed') },
						])
					},
				},
				{ text: '取消', onPress: () => {}, style: 'cancel' },
			])
		} else {
			// 如果是新添加的音源，默认设置 isSelected 为 false 。如果音源为空，则自动选择
			const newMusicApi = musicApi
			console.log('nowMusicApiList', nowMusicApiList)
			const updatedMusicApiList = [...nowMusicApiList, newMusicApi]
			if (!nowMusicApiList.length) {
				logInfo('音源为空，自动选择')
				musicApiStore.setValue(updatedMusicApiList)
				PersistStatus.set('music.musicApi', updatedMusicApiList)
				setMusicApiAsSelectedById(newMusicApi.id)
			} else {
				musicApiStore.setValue(updatedMusicApiList)
				PersistStatus.set('music.musicApi', updatedMusicApiList)
				// 导入音源时，将所有已导入的音源都设为启用
				const allEnabledIds = updatedMusicApiList.map((api: any) => api.id)
				enabledMusicSourcesStore.setValue(allEnabledIds)
				PersistStatus.set('music.enabledMusicSources', allEnabledIds)
				logInfo('导入音源后已启用全部 ' + allEnabledIds.length + ' 个音源')
			}
			logInfo('音源导入成功')
			Toast.show({
				type: 'success',
				text1: '音源导入成功',
				text2: '音源已导入并可在设置中选择使用',
				visibilityTime: 3000,
				autoHide: true,
				topOffset: 100,
			})
		}
	} catch (error) {
		logError('Error adding/updating music API:', error)
		Toast.show({
			type: 'error',
			text1: '音源导入失败',
			text2: '音源导入/更新失败，请检查音源脚本是否正确',
			visibilityTime: 3000,
			autoHide: true,
			topOffset: 100,
		})
	}
}
const reloadNowSelectedMusicApi = async () => {
	try {
		// 获取当前存储的所有音源脚本
		const musicApis = musicApiStore.getValue() || []

		// 找到被选中的音源脚本
		const selectedApi = musicApiSelectedStore.getValue()

		if (selectedApi === null) {
			logInfo('No music API is currently selected.')
			return null
		}
		// 重新加载选中的脚本
		const reloadedApi = await reloadMusicApi(selectedApi)

		// 更新 musicApiStore 中的脚本
		musicApiSelectedStore.setValue(reloadedApi)

		// 更新 store 和持久化存储
		PersistStatus.set('music.selectedMusicApi', reloadedApi)

		logInfo(`Selected music API "${reloadedApi.name}" reloaded successfully`)

		return reloadedApi
	} catch (error) {
		logError('Error reloading selected music API:', error)
		throw error
	}
}
const reloadMusicApi = async (musicApi: IMusic.MusicApi, isTest: boolean = false): Promise<IMusic.MusicApi> => {
	if (!musicApi.isSelected && !isTest) {
		return musicApi // 如果没有被选中，直接返回原始对象
	}

	try {
		// 检测是否为 lx-music 格式脚本
		if (musicApi.scriptType === 'lxmusic' || isLxMusicScript(musicApi.script)) {
			return await reloadLxMusicScript(musicApi)
		}

		// Well Music 原有 CommonJS 格式
		const context: any = {
			module: { exports: {} },
			exports: {},
			require: () => {},
		}

		const scriptFunction = new Function('module', 'exports', 'require', musicApi.script)
		scriptFunction.call(context, context.module, context.exports, context.require)

		return {
			...musicApi,
			getMusicUrl: context.module.exports.getMusicUrl || musicApi.getMusicUrl,
		}
	} catch (error) {
		logError(`Error reloading script for API "${musicApi.name}":`, error)
		return musicApi
	}
}
const setMusicApiAsSelectedById = async (musicApiId: string) => {
	try {
		// 获取当前存储的所有音源脚本
		let musicApis: IMusic.MusicApi[] = musicApiStore.getValue() || []

		// 检查指定的音源是否存在
		const targetApiIndex = musicApis.findIndex((api) => api.id === musicApiId)

		if (targetApiIndex === -1) {
			logError(`Music API with id ${musicApiId} not found`)
			Toast.show({
				type: 'error',
				text1: '音源切换失败',
				text2: '未找到指定的音源，请重新选择',
				visibilityTime: 3000,
				autoHide: true,
				topOffset: 100,
			})
			return
		}

		// 更新选中状态
		musicApis = musicApis.map((api) => ({
			...api,
			isSelected: api.id === musicApiId,
		}))

		// 获取新选中的音源
		const selectedApi = musicApis[targetApiIndex]

		// 重新加载选中的音源脚本
		const reloadedApi = await reloadMusicApi(selectedApi)

		// 更新音源列表的选中状态
		musicApiStore.setValue(musicApis)
		PersistStatus.set('music.musicApi', musicApis)
		// 更新重新加载后的音源
		musicApiSelectedStore.setValue(reloadedApi)
		// 更新 store 和持久化存储
		PersistStatus.set('music.selectedMusicApi', reloadedApi)

		logInfo(`Music API "${reloadedApi.name}" set as selected and reloaded successfully`)
		Toast.show({
			type: 'info',
			text1: '音源切换成功',
			text2: `已切换至「${reloadedApi.name}」并重新加载`,
			visibilityTime: 3000,
			autoHide: true,
			topOffset: 100,
		})
	} catch (error) {
		logError('Error setting music API as selected:', error)
		Toast.show({
			type: 'error',
			text1: '音源切换失败',
			text2: '设置选中音源时发生错误，请重试',
			visibilityTime: 3000,
			autoHide: true,
			topOffset: 100,
		})
	}
}

const deleteMusicApiById = (musicApiId: string) => {
	const selectedMusicApi = musicApiSelectedStore.getValue()
	const musicApis = musicApiStore.getValue() || []
	if (selectedMusicApi?.id === musicApiId) {
		musicApiSelectedStore.setValue(null)
		PersistStatus.set('music.selectedMusicApi', undefined)
	}
	const musicApisFiltered = musicApis.filter((musicApi) => musicApi.id !== musicApiId)
	musicApiStore.setValue(musicApisFiltered)
	PersistStatus.set('music.musicApi', musicApisFiltered)
	logInfo('Music API deleted successfully')
	Toast.show({
		type: 'success',
		text1: '音源删除成功',
		text2: '音源已从列表中移除',
		visibilityTime: 3000,
		autoHide: true,
		topOffset: 100,
	})
}
const play = async (musicItem?: IMusic.IMusicItem | null, forcePlay?: boolean) => {
	let trackSourceLoadingToken: string | null = null
	try {
		if (!musicItem) {
			musicItem = currentMusicStore.getValue()
		}
		if (!musicItem) {
			throw new Error(PlayFailReason.PLAY_LIST_IS_EMPTY)
		}

		// 1. If already playing this track (forcePlay 时跳过快速路径，强制重新加载URL，用于音质切换)
		if (isCurrentMusic(musicItem) && !forcePlay) {
			let currentTrack: any = null
			try {
				currentTrack = await ReactNativeTrackPlayer.getTrack(0)
			} catch (e) {
				logInfo('[play] getTrack(0)失败，队列可能为空，走正常播放流程')
			}
			if (currentTrack?.url && currentTrack.url !== fakeAudioMp3Uri && !String(currentTrack.url).includes('fake') && isSameMediaItem(musicItem, currentTrack as IMusic.IMusicItem)) {
				// 检查active track是否真的是目标歌曲（防止队列里有新歌但还在播旧歌）
				let activeMatch = false
				try {
					const activeTrack = await ReactNativeTrackPlayer.getActiveTrack()
					activeMatch = !!(activeTrack && String(activeTrack.id) === String(musicItem.id))
				} catch (e) {}
				if (!activeMatch) {
					await setTrackSource(currentTrack)
					return
				}
				const currentActiveIndex = await ReactNativeTrackPlayer.getActiveTrackIndex()
				if (currentActiveIndex !== 0) {
					await ReactNativeTrackPlayer.skip(0)
				}
				if (forcePlay) {
					await ReactNativeTrackPlayer.seekTo(0)
				}
				const currentState = (await ReactNativeTrackPlayer.getPlaybackState()).state
				if (currentState === State.Stopped) {
					await setTrackSource(currentTrack)
				}
				if (currentState !== State.Playing) {
					await ReactNativeTrackPlayer.play()
				}
				return
			}
		}

		// 2. Add to playlist if not present
		if (!isInPlayList(musicItem)) {
			add(musicItem)
			// 独立单曲播放（非来自歌单/专辑页）：清空来源描述，待播清单回退显示歌曲数
			playListSourceStore.setValue(null)
		}

		trackSourceLoadingToken = createTrackSourceLoadingToken(musicItem)
		trackSourceLoadingStore.setValue(trackSourceLoadingToken)

		// 新播放代次：让任何在途的旧歌加载立即失效（修复快速切歌旧音频覆盖新音频）
		const gen = ++playGeneration

		// 3. Update current music state immediately (UI updates instantly)
		setCurrentMusic(musicItem)
		// 切到新歌：重置自动换源计数与失败音源记录（每首歌独立尝试，不带上一首歌的状态）
		consecutiveFailCount = 0
		consecutivePlaybackErrorCount = 0
		failedSourcesBySong.clear()
		lastResolvedSource = null
		// 切歌瞬间立即暂停旧音频，避免封面/歌名已换成新歌却仍在播旧歌、进度继续走
		try { await ReactNativeTrackPlayer.pause() } catch (e) {}
		// 高音质歌词同步：切歌时删除上一首歌的本地高音质文件，释放空间
		try {
			const { removeLocalFLAC, isPreciseFLACEnabled } = require('@/player/FLACPreciseSync')
			if (isPreciseFLACEnabled()) {
				removeLocalFLAC('切换新歌')
			}
		} catch (e) {
			logInfo('[高音质歌词同步] 切歌清理本地文件时出现异常（不影响播放）')
		}
		// 添加到播放历史
		try {
			addToPlayHistory(musicItem)
		} catch (e) {
			console.error('添加播放历史失败:', e)
		}

		// 4. Resolve source (cache check + network if needed)
		const useBypassCache = skipCacheForFirstPlay
		if (useBypassCache) {
			skipCacheForFirstPlay = false
			logInfo('[play] 启动后首次播放，绕过缓存获取新链接')
		}
		const sourceResult = await resolveSource(musicItem, {
			requestType: 'current',
			bypassCache: useBypassCache,
		})
		const { url: sourceUrl, wasCached } = sourceResult

		// 5. Race condition guard（代次+当前歌曲双重校验，过期直接放弃，不覆盖最新播放）
		if (gen !== playGeneration || !isCurrentMusic(musicItem)) {
			logInfo('[play] 音源返回时已切到其他歌曲，放弃本次加载')
			return
		}

		// 5.1 未拿到有效音源（全部音源失败/超时，resolver 返回静音占位）→ 自动换源/降音质/跳下一首，绝不加载静音卡住
		if (!sourceUrl || sourceUrl === fakeAudioMp3Uri || sourceUrl.includes('fake')) {
			logInfo('[play] 未获取到有效音源，转入失败处理（自动换源/下一首）')
			await failToPlay()
			return
		}

		// 拿到真实可播地址，重置连续失败计数，并记录本次实际命中的音源（供播放失败去重）
		consecutiveFailCount = 0
		lastResolvedSource = { songKey: songKeyOf(musicItem), sourceId: sourceResult.sourceId ?? null, sourceName: sourceResult.sourceName ?? null }

		// 6. Build track and set source
		const track = mergeProps(musicItem, { url: sourceUrl }) as IMusic.IMusicItem
		logInfo('获取音源成功：', track)
		await setTrackSource(track as Track)

		// 7. Fetch lyrics in background (non-blocking)
		myGetLyric(musicItem)
			.then((lyc) => {
				if (isCurrentMusic(musicItem)) {
					nowLyricState.setValue(lyc.lyric)
						nowTranslationState.setValue(lyc.tlyric || '')
				}
			})
			.catch((err) => logError('获取歌词失败:', err))

		// 8. Auto-cache in background
		if (
			sourceUrl !== fakeAudioMp3Uri &&
			!sourceUrl.includes('fake') &&
			!wasCached &&
			autoCacheLocalStore.getValue() &&
			!sourceUrl.startsWith('file://')
		) {
			setTimeout(() => {
				downloadToCache(track)
					.then((localUri) => {
						logInfo('音乐已缓存到本地:', localUri)
						const newTrack = { ...track, url: localUri }
						addImportedLocalMusic([newTrack], false)
					})
					.catch((error) => {
						logError('缓存音乐时出错:', error)
					})
			}, 5000)
		}

		// 9. 预加载后面的歌曲（可配置数量和延迟）
		const shouldPreloadNextTrack =
			sourceUrl !== fakeAudioMp3Uri &&
			!sourceUrl.includes('fake') &&
			!sourceUrl.startsWith('file://')
		if (shouldPreloadNextTrack) {
			const preloadSettings = usePreloadSettingsStore.getState()
			if (preloadSettings.preloadEnabled && preloadSettings.preloadCount > 0) {
				const delayMs = preloadSettings.preloadDelaySeconds * 1000
				setTimeout(() => {
					for (let i = 1; i <= preloadSettings.preloadCount; i++) {
						const nextTrack = getPlayListMusicAt(currentIndex + i)
						if (nextTrack && !isSameMediaItem(nextTrack, musicItem)) {
							preloadSource(nextTrack).catch(() => {})
						}
					}
				}, delayMs)
			}
		}
	} catch (e: any) {
		const message = e?.message
		if (message === 'The player is not initialized. Call setupPlayer first.') {
			try {
				await ReactNativeTrackPlayer.setupPlayer()
				// 避免无限递归：只重试一次
				if (!forcePlay) {
					await play(musicItem, true)
				}
			} catch (setupError) {
				logError('播放器初始化失败:', setupError)
				showToast('错误', '播放器初始化失败，请重启应用', 'error')
			}
		} else if (message === PlayFailReason.FORBID_CELLUAR_NETWORK_PLAY) {
			logInfo('移动网络')
		} else if (message === PlayFailReason.INVALID_SOURCE) {
			logError('音源为空，播放失败')
			Toast.show({ type: 'error', text1: '加载失败', text2: '这首歌无法播放，正在尝试下一首', visibilityTime: 2000, autoHide: true, topOffset: 80 })
			await failToPlay()
		} else if (message && message.includes('音源无法获取播放地址')) {
			logError('音源获取失败，自动跳过:', message)
			Toast.show({ type: 'error', text1: '加载失败', text2: '这首歌无法播放，正在尝试下一首', visibilityTime: 2000, autoHide: true, topOffset: 80 })
			await failToPlay()
		} else if (message === PlayFailReason.PLAY_LIST_IS_EMPTY) {
			// empty queue
		} else {
			logError('播放失败:', e)
		}
	} finally {
		if (
			trackSourceLoadingToken &&
			trackSourceLoadingStore.getValue() === trackSourceLoadingToken
		) {
			trackSourceLoadingStore.setValue(null)
		}
	}
}
const cacheAndImportMusic = async (track: IMusic.IMusicItem) => {
	try {
		await ensureCacheDirExists()
		const localPath = getLocalFilePath(track)
		console.log('localPath:', localPath)
		const isCacheExist = await RNFS.exists(localPath)
		if (isCacheExist) {
			logInfo('音乐已缓存到本地:', localPath)
			const newTrack = { ...track, url: `file://${localPath}` }
			await addImportedLocalMusic([newTrack], false)
		} else {
			logInfo('开始下载音乐:', track.url)
			const downloadResult = await RNFS.downloadFile({
				fromUrl: track.url,
				toFile: localPath,
				progressDivider: 1,
				progress: (res) => {
					const progress = res.bytesWritten / res.contentLength
					logInfo(`下载进度: ${(progress * 100).toFixed(2)}%`)
				},
			}).promise

			if (downloadResult.statusCode === 200) {
				logInfo('音乐已缓存到本地:', `${localPath}`)
				const newTrack = { ...track, url: `${localPath}` }
				await addImportedLocalMusic([newTrack], false)
			} else {
				throw new Error(`下载失败，状态码: ${downloadResult.statusCode}`)
			}
		}

		Alert.alert('成功', '音乐已缓存到本地', [{ text: '确定', onPress: () => {} }])
	} catch (error) {
		logError('缓存音乐时出错:', error)
		// await addImportedLocalMusic([track], false)
	}
}

/**
 * 播放音乐，同时替换播放队列
 * @param musicItem 音乐
 * @param newPlayList 替代列表
 * @param sourceTitle 播放来源描述（歌单名/专辑名等），用于待播清单显示；不传则为 null
 */
const playWithReplacePlayList = async (
	musicItem: IMusic.IMusicItem,
	newPlayList: IMusic.IMusicItem[],
	sourceTitle?: string | null,
) => {
	playListSourceStore.setValue(sourceTitle ?? null)
	if (newPlayList.length !== 0) {
		const now = Date.now()
		const playListItems = newPlayList.map((item, index) => ({
			...item,
			[timeStampSymbol]: now,
			[sortIndexSymbol]: index,
		}))
		setPlayList(
			repeatModeStore.getValue() === MusicRepeatMode.SHUFFLE
				? shuffle(playListItems)
				: playListItems,
			true,
			true, // lazy index build - defer to first query
		)
		await play(musicItem, true)
	}
}

const runWithTrackSkipLoading = async (
	direction: 'next' | 'previous',
	action: () => Promise<void>,
) => {
	if (trackSkipLoadingStore.getValue()) {
		// 已有切歌在进行中，等300ms如果还没完成就强制接管（防止锁死）
		await new Promise((r) => setTimeout(r, 300))
		if (trackSkipLoadingStore.getValue()) {
			trackSkipLoadingStore.setValue(null)
		}
	}

	trackSkipLoadingStore.setValue(direction)
	// 16秒超时强制释放锁（需覆盖当前音源解析10s+内置兜底）；用户主动切歌仍会在300ms后强制接管
	const timeoutId = setTimeout(() => {
		if (trackSkipLoadingStore.getValue() === direction) {
			console.warn('[trackPlayer] 切歌锁超时16秒，强制释放')
			trackSkipLoadingStore.setValue(null)
		}
	}, 16000)
	try {
		await action()
	} finally {
		clearTimeout(timeoutId)
		if (trackSkipLoadingStore.getValue() === direction) {
			trackSkipLoadingStore.setValue(null)
		}
	}
}

// ===================== 私人漫游 / 心动模式 无限续批 =====================
const ROAM_PRELOAD_THRESHOLD = 3

function getRoamModeOf(item: any): string | null {
	if (!item) return null
	return item._roamMode || (item._fmRoaming ? 'fm' : null)
}

async function fetchNextRoamBatch(mode: string, lastItem: any, playlistId?: string): Promise<any[]> {
	if (mode === 'fm') {
		const { getNeteasePersonalFM } = await import('@/helpers/userApi/netease-music-api')
		return await getNeteasePersonalFM(2)
	}
	if (mode === 'intelligence') {
		const { getNeteaseIntelligenceList } = await import('@/helpers/userApi/netease-music-api')
		const rawId = lastItem?.originalId || String(lastItem?.id || '').replace(/^(netease_|wy_)/, '')
		const pid = playlistId || rawId
		return await getNeteaseIntelligenceList(rawId, pid)
	}
	return []
}

// 去重追加到当前播放队列，返回新增数量
function appendTracksDedup(newTracks: any[]): number {
	if (!Array.isArray(newTracks) || newTracks.length === 0) return 0
	const list = getPlayList()
	const exist = new Set(list.map((t: any) => `${t.platform}://${t.id}`))
	const fresh: any[] = []
	for (const t of newTracks) {
		const key = `${t.platform}://${t.id}`
		if (!exist.has(key)) {
			exist.add(key)
			fresh.push(t)
		}
	}
	if (fresh.length === 0) return 0
	setPlayList([...list, ...fresh] as any)
	logInfo(`[roam] 队列追加 ${fresh.length} 首，共 ${list.length + fresh.length} 首`)
	return fresh.length
}

// 当前处于漫游/心动且队列剩余不足时，拉取下一批追加；同一时间只跑一个请求
async function ensureRoamingSongs(): Promise<void> {
	const cur = currentMusicStore.getValue() as any
	const mode = getRoamModeOf(cur)
	if (!mode) return
	if (roamRefreshPromise) {
		await roamRefreshPromise
		return
	}
	const list = getPlayList()
	const remain = list.length - currentIndex
	if (currentIndex >= 0 && remain > ROAM_PRELOAD_THRESHOLD) return
	roamRefreshPromise = (async () => {
		try {
			const last = list[list.length - 1]
			const batch = await fetchNextRoamBatch(mode, last, cur?._roamPlaylistId)
			appendTracksDedup(batch)
		} catch (e) {
			console.warn('[roam] 自动续批失败:', e)
		} finally {
			roamRefreshPromise = null
		}
	})()
	return roamRefreshPromise
}

// 供界面首次快速开播后在后台补全队列（去重追加）
const appendToCurrentPlayList = (tracks: any[]): number => appendTracksDedup(tracks)

const skipToNext = async () => {
  await runWithTrackSkipLoading('next', async () => {
    if (isPlayListEmpty()) {
      setCurrentMusic(null)
      return
    }

    // 实时计算当前播放歌曲在最新队列中的下标：拖拽换序后缓存 currentIndex 会过期，
    // 导致"下一首"仍取旧队列的下一位
    const currentItem = currentMusicStore.getValue()
    const realIndex = currentItem ? getMusicIndex(currentItem) : -1
    const baseIndex = realIndex >= 0 ? realIndex : currentIndex
    let targetIndex = baseIndex + 1
    // 私人漫游 / 心动模式：到达队列末尾时先拉取下一批，避免循环回到第一首
    const roamMode = getRoamModeOf(currentMusicStore.getValue())
    if (roamMode && targetIndex >= getPlayList().length) {
      await ensureRoamingSongs()
    }
    await play(getPlayListMusicAt(targetIndex), true)
  })
}

const skipToPrevious = async () => {
  await runWithTrackSkipLoading('previous', async () => {
    if (isPlayListEmpty()) {
      setCurrentMusic(null)
      return
    }

    const currentItem = currentMusicStore.getValue()
    const realIndex = currentItem ? getMusicIndex(currentItem) : -1
    const baseIndex = realIndex >= 0 ? realIndex : currentIndex
    await play(getPlayListMusicAt(baseIndex === -1 ? 0 : baseIndex - 1), true)
  })
}

/** 修改当前播放的音质 */
const changeQuality = async (newQuality: IMusic.IQualityKey) => {
	// 获取当前的音乐和进度
	if (newQuality === qualityStore.getValue()) {
		return true
	}

	// 获取当前歌曲
	const musicItem = currentMusicStore.getValue()
	if (!musicItem) {
		return false
	}
	try {
		setQuality(newQuality)
		return true
	} catch {
		// 修改失败
		return false
	}
}

enum PlayFailReason {
	/** 禁止移动网络播放 */
	FORBID_CELLUAR_NETWORK_PLAY = 'FORBID_CELLUAR_NETWORK_PLAY',
	/** 播放列表为空 */
	PLAY_LIST_IS_EMPTY = 'PLAY_LIST_IS_EMPTY',
	/** 无效源 */
	INVALID_SOURCE = 'INVALID_SOURCE',
	/** 非当前音乐 */
}

function useMusicState() {
	const playbackState = usePlaybackState()

	return playbackState.state
}

function getPreviousMusic() {
  const currentMusicItem = currentMusicStore.getValue()
  if (!currentMusicItem) {
    return null
  }

  const realIndex = getMusicIndex(currentMusicItem)
  return getPlayListMusicAt((realIndex >= 0 ? realIndex : currentIndex) - 1)
}

function getNextMusic() {
  const currentMusicItem = currentMusicStore.getValue()
  if (!currentMusicItem) {
    return null
  }

  const realIndex = getMusicIndex(currentMusicItem)
  return getPlayListMusicAt((realIndex >= 0 ? realIndex : currentIndex) + 1)
}
const addImportedLocalMusic = async (musicItem: IMusic.IMusicItem[], isAlert: boolean = true) => {
	try {
		console.log('addImportedLocalMusic', musicItem[0])
		const importedLocalMusic = importedLocalMusicStore.getValue() || []
		const newMusicItems = musicItem.filter(
			(newItem) => !importedLocalMusic.some((existingItem) => existingItem.id == newItem.id),
		)
		if (newMusicItems.length === 0) {
			// Alert.alert('提示', '所有选择的音乐已经存在，没有新的音乐被导入。')
			return
		}
		// 确保目标目录存在 isAlert只有导入本地音乐为true。所有自动缓存为false.,不需要移动文件
		if (isAlert) {
			const targetDir = `${RNFS.DocumentDirectoryPath}/importedLocalMusic`
			await ensureDirExists(targetDir)

			// 移动文件并更新musicItem的url
			for (const item of newMusicItems) {
				if (item.url.startsWith('file://')) {
					const originalExtension = item.url.split('.').pop() || 'mp3'

					// 创建一个安全的文件名（移除或替换不允许的字符）
					const safeTitle = item.title.replace(/[/\\?%*:|"<>]/g, '-')
					const safeArtist = item.artist.replace(/[/\\?%*:|"<>]/g, '-')
					const fileName = `${safeTitle}-${safeArtist}.${originalExtension}`
					const newPath = `${targetDir}/${fileName}`
					await FileSystem.moveAsync({
						from: item.url,
						to: newPath,
					})
					item.url = newPath
				}
			}
		}
		const updatedImportedLocalMusic = [...importedLocalMusic, ...newMusicItems]
		importedLocalMusicStore.setValue(updatedImportedLocalMusic)
		PersistStatus.set('music.importedLocalMusic', updatedImportedLocalMusic)
		if (isAlert) {
			Alert.alert('成功', '音乐导入成功,请手动选择', [
				{ text: '确定', onPress: () => logInfo('Add alert closed') },
			])
		}
	} catch (error) {
		logError('本地音乐保存时出错:', error)
	}
}
const deleteImportedLocalMusic = (musicItemsIdToDelete: string) => {
	try {
		const importedLocalMusic = importedLocalMusicStore.getValue() || []
		let fileUri = ''
		const updatedImportedLocalMusic = importedLocalMusic.filter((item) => {
			if (musicItemsIdToDelete === item.id) {
				fileUri = item.url
			}
			return musicItemsIdToDelete !== item.id
		})
		importedLocalMusicStore.setValue(updatedImportedLocalMusic)
		PersistStatus.set('music.importedLocalMusic', updatedImportedLocalMusic)
		//同时删除本地文
		FileSystem.deleteAsync(fileUri)
		// Alert.alert('成功', '音乐删除成功', [{ text: '确定', onPress: () => {} }])
	} catch (error) {
		logError('删除本地音乐时出错:', error)
	}
}
const isExistImportedLocalMusic = (musicItemName: string) => {
	// todo 检查文件存在？
	const importedLocalMusic = importedLocalMusicStore.getValue() || []
	return importedLocalMusic.some((item) => item.genre === musicItemName)
}
const toggleAutoCacheLocal = (bool: boolean) => {
	PersistStatus.set('music.autoCacheLocal', bool)
	autoCacheLocalStore.setValue(bool)
}
const toggleIsCachedIconVisible = (bool: boolean) => {
	PersistStatus.set('music.isCachedIconVisible', bool)
	isCachedIconVisibleStore.setValue(bool)
}
const showErrorMessage = (message: string) => {
	// 只在应用在前台时显示 Alert
	if (AppState.currentState === 'active') {
		showToast('错误', message, 'error')
		// Alert.alert('错误', message, [{ text: '确定', onPress: () => {} }])
	}
}
// 全局定时关闭
let sleepTimerId: ReturnType<typeof setTimeout> | null = null
const sleepTimerStore = new GlobalState<number | null>(null)

function setSleepTimer(minutes: number) {
	if (sleepTimerId) {
		clearTimeout(sleepTimerId)
	}
	sleepTimerStore.setValue(minutes)
	sleepTimerId = setTimeout(() => {
		ReactNativeTrackPlayer.pause()
		sleepTimerStore.setValue(null)
		sleepTimerId = null
	}, minutes * 60 * 1000)
}

function clearSleepTimer() {
	if (sleepTimerId) {
		clearTimeout(sleepTimerId)
		sleepTimerId = null
	}
	sleepTimerStore.setValue(null)
}

const myTrackPlayer = {
	setupTrackPlayer,
	usePlayList,
	getPlayList,
	addAll,
	add,
	appendToCurrentPlayList,
	addAsNextTrack,
	skipToNext,
	skipToPrevious,
	play,
	playWithReplacePlayList,
	pause,
	fadePause,
	fadePlay,
	handleExternalPause,
	remove,
	clear,
	clearToBePlayed,
	useCurrentMusic: currentMusicStore.useValue,
	getCurrentMusic: currentMusicStore.getValue,
	useRepeatMode: repeatModeStore.useValue,
	getRepeatMode: repeatModeStore.getValue,
	toggleRepeatMode,
	usePlaybackState,
	setRepeatMode,
	setQuality,
	getProgress: ReactNativeTrackPlayer.getProgress,
	useProgress: useProgress,
	seekTo: ReactNativeTrackPlayer.seekTo,
	changeQuality,
	addPlayLists,
	deletePlayLists,
	getPlayListById,
	addMusicApi,
	setMusicApiAsSelectedById,
	deleteMusicApiById,
	addSongToStoredPlayList,
	deleteSongFromStoredPlayList,
	addImportedLocalMusic,
	deleteImportedLocalMusic,
	isExistImportedLocalMusic,
	useCurrentQuality: qualityStore.useValue,
	getCurrentQuality: qualityStore.getValue,
	getRate: ReactNativeTrackPlayer.getRate,
	setRate: ReactNativeTrackPlayer.setRate,
	useMusicState,
	reset: ReactNativeTrackPlayer.reset,
	getPreviousMusic,
	getNextMusic,
	clearCache,
	toggleAutoCacheLocal,
	cacheAndImportMusic,
	isCached,
	toggleIsCachedIconVisible,
	reloadMusicApi,
	setSleepTimer,
	clearSleepTimer,
	useSleepTimer: sleepTimerStore.useValue,
	getSleepTimerMinutes: sleepTimerStore.getValue,
}

export default myTrackPlayer
export { MusicRepeatMode, State as MusicState }
