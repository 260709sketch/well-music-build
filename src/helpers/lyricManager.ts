/**
 * 管理当前歌曲的歌词
 */

import PersistStatus from '@/store/PersistStatus'
import { isSameMediaItem } from '@/utils/mediaItem'
import { GlobalState } from '@/utils/stateMapper'
import { isRealLyricLine } from '@/utils/isRealLyricLine'
import LyricParser from '@/utils/lrcParser'
import { showToast } from '@/utils/utils'
import ReactNativeTrackPlayer, { Event } from 'react-native-track-player'
import myTrackPlayer, { nowLyricState, nowTranslationState } from './trackPlayerIndex'
import { getNeteaseLyric } from './userApi/netease-music-api'
import { fetchWordLyricFor, type WordLyricLine } from './userApi/wordLyric'
import { buildLinesFromWordLyric } from '@/utils/amllLyricAdapter'
const lyricStateStore = new GlobalState<{
	loading: boolean
	lyricParser?: LyricParser
	lyrics: ILyric.IParsedLrc
	translationLyrics?: ILyric.IParsedLrc
	meta?: Record<string, any>
	hasTranslation: boolean
}>({
	loading: true,
	lyrics: [],
	hasTranslation: false,
})

const currentLyricStore = new GlobalState<ILyric.IParsedLrcItem | null>(null)
export const durationStore = new GlobalState<number>(0)

// 逐字歌词存储（网易云 YRC / 酷狗 KRC 统一格式）
const wordLyricStore = new GlobalState<WordLyricLine[]>([])
// 播放位置（秒），逐字组件内部以 rAF 自驱，这里提供初始/兜底值
const positionStore = new GlobalState<number>(0)
const DEFAULT_LYRIC = '[00:00.00]暂无歌词'
let lastRawLyric = ''
let lastLyricDelaySeconds: number | null = null
// 当前显示行是否已切换为“逐字(YRC/QRC/KRC)权威行”。
// 为 true 时，行列表/当前行/逐字扫光全部以逐字时间为唯一来源（同源），
// 避免逐行 LRC 时间戳偏早导致“行、字不是同一段”。
let usingWordLines = false

const loadingState = {
	loading: true,
	lyrics: [],
	hasTranslation: false,
}

function setLyricLoading() {
	lyricStateStore.setValue(loadingState)
}
function resetLyricState() {
	// 切源期间不重置歌词状态
	if (isSwitchingSource) return
	lyricStateStore.setValue({
		loading: false,
		lyrics: [],
		hasTranslation: false,
	})
	currentLyricStore.setValue({
		lrc: 'MusicFree',
		time: 0,
	})
	wordLyricStore.setValue([])
	positionStore.setValue(0)
	lastRawLyric = ''
	lastLyricDelaySeconds = null
	usingWordLines = false
}

function getLyricSource(): ILyric.ILyricSource {
	return {
		rawLrc: nowLyricState.getValue() || DEFAULT_LYRIC,
		translation: nowTranslationState.getValue() || undefined,
	}
}

function updateCurrentLyricByPosition(position: number, parser?: LyricParser) {
	// 逐字权威行模式：行/字同源，直接对逐字行做二分（符号与 LyricParser 一致：position - offset）
	if (usingWordLines) {
		const ls = lyricStateStore.getValue().lyrics
		if (!ls || ls.length === 0) {
			currentLyricStore.setValue(null)
			return
		}
		const offset = PersistStatus.get('lyric.delaySeconds') ?? 0
		const eff = position - (offset || 0)
		let idx = -1
		if (eff >= (ls[0]?.time ?? Infinity)) {
			let lo = 0
			let hi = ls.length - 1
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1
				if ((ls[mid]?.time ?? -1) <= eff) lo = mid
				else hi = mid - 1
			}
			idx = lo
		}
		if (idx < 0) {
			currentLyricStore.setValue(null)
			return
		}
		let cur = ls[idx]
		if (cur && !isRealLyricLine(cur.lrc || '')) {
			for (let i = idx - 1; i >= 0; i--) {
				if (isRealLyricLine(ls[i]?.lrc || '')) {
					cur = ls[i]
					break
				}
			}
		}
		currentLyricStore.setValue(cur || null)
		return
	}

	const activeParser = parser ?? lyricStateStore.getValue().lyricParser
	if (!activeParser) {
		currentLyricStore.setValue(null)
		return
	}
	const posResult = activeParser.getPosition(position)
	let currentLyric = posResult.lrc
	// 如果当前行不是真正在唱的歌词（段落标记/间奏等），找上一条真实歌词
	if (currentLyric && !isRealLyricLine(currentLyric.lrc || '')) {
		const allLyrics = activeParser.getLyric()
		const idx = posResult.index ?? currentLyric.index ?? 0
		for (let i = idx - 1; i >= 0; i--) {
			if (isRealLyricLine(allLyrics[i]?.lrc || '')) {
				currentLyric = allLyrics[i]
				break
			}
		}
	}
	currentLyricStore.setValue(currentLyric || null)
}

function shouldRebuildParser(
	musicItem: IMusic.IMusicItem,
	lyricParser: LyricParser | undefined,
	rawLrc: string,
	lyricDelaySeconds: number,
	forceRequest: boolean,
) {
	if (forceRequest || !lyricParser) {
		return true
	}

	return (
		!isSameMediaItem(lyricParser.getCurrentMusicItem(), musicItem) ||
		lastRawLyric !== rawLrc ||
		lastLyricDelaySeconds !== lyricDelaySeconds
	)
}

// 重新获取歌词
async function refreshLyric(fromStart?: boolean, forceRequest = false, positionOverride?: number) {
	// 切源期间：完全禁止刷新歌词，防止任何路径把歌词重置到开头
	// replaceCurrentTrack 过程中会触发各种事件（ActiveTrackChanged、Progress 等），
	// 但实际上是同一首歌换了个文件，歌词完全不需要动。
	if (isSwitchingSource) {
		return
	}
	const musicItem = myTrackPlayer.getCurrentMusic()
	try {
		if (!musicItem) {
			resetLyricState()
			return
		}

		const lyricDelaySeconds = PersistStatus.get('lyric.delaySeconds') ?? 0
		const lrcSource = getLyricSource()
		const rawLrc = lrcSource.rawLrc || DEFAULT_LYRIC
		const lyricParser = lyricStateStore.getValue().lyricParser

		if (!shouldRebuildParser(musicItem, lyricParser, rawLrc, lyricDelaySeconds, forceRequest)) {
			if (fromStart) {
				const cur0 = lyricStateStore.getValue().lyrics?.[0]
				currentLyricStore.setValue(cur0 || lyricParser?.getLyric()[0] || null)
				return
			}
			if (positionOverride !== undefined) {
				lastSeekPosition = positionOverride
				lastSeekTime = Date.now()
				updateCurrentLyricByPosition(positionOverride, lyricParser)
				return
			}
			const progress = await myTrackPlayer.getProgress()
			updateCurrentLyricByPosition(progress.position, lyricParser)
			return
		}

		const realtimeMusicItem = myTrackPlayer.getCurrentMusic()
		if (!realtimeMusicItem || !isSameMediaItem(musicItem, realtimeMusicItem)) {
			return
		}

		const parser = new LyricParser(lrcSource, musicItem, {
			offset: lyricDelaySeconds,
		})

		lyricStateStore.setValue({
			loading: false,
			lyricParser: parser,
			lyrics: parser.getLyric(),
			translationLyrics: lrcSource.translation ? parser.getTranslationLyric() : undefined,
			meta: parser.getMeta(),
			hasTranslation: !!lrcSource.translation,
		})
		lastRawLyric = rawLrc
		lastLyricDelaySeconds = lyricDelaySeconds
		// 重建了逐行 LRC 解析器，逐字权威行需要等逐字数据回来后再切换
		usingWordLines = false

		// 逐字歌词（已暂停开发，默认关闭，设置里手动开启）：切歌先清空；关闭时只保留稳定逐行LRC，不拉逐字、不替换权威行
		wordLyricStore.setValue([])
		if (PersistStatus.get('lyric.karaokeEnabled') === true) {
			fetchWordLyricFor(musicItem)
				.then((lines) => {
					const cur = myTrackPlayer.getCurrentMusic()
					if (lines && lines.length && cur && isSameMediaItem(cur, musicItem)) {
						wordLyricStore.setValue(lines)
						// 逐字可用时，用逐字行替换显示行，成为行/字同源的唯一权威
						const built = buildLinesFromWordLyric(lines)
						if (built && built.length) {
							const wordItems = built.map((b, i) => ({
								time: b.time,
								lrc: b.lrc,
								index: i,
								words: b.words,
							})) as unknown as ILyric.IParsedLrc
							const st = lyricStateStore.getValue()
							// 切歌竞态保护：只有仍是同一首歌才替换
							const now2 = myTrackPlayer.getCurrentMusic()
							if (now2 && isSameMediaItem(now2, musicItem)) {
								usingWordLines = true
								lyricStateStore.setValue({ ...st, lyrics: wordItems })
								myTrackPlayer
									.getProgress()
									.then((p) => updateCurrentLyricByPosition(p.position))
									.catch(() => {})
							}
						}
					}
				})
				.catch(() => {})
		}

		if (fromStart) {
			currentLyricStore.setValue(parser.getLyric()[0] || null)
			return
		}
		if (positionOverride !== undefined) {
			lastSeekPosition = positionOverride
			lastSeekTime = Date.now()
			updateCurrentLyricByPosition(positionOverride, parser)
			return
		}

		const progress = await myTrackPlayer.getProgress()
		updateCurrentLyricByPosition(progress.position, parser)
	} catch (e) {
		console.log(e, 'LRC')
		usingWordLines = false
		const realtimeMusicItem = myTrackPlayer.getCurrentMusic()
		if (musicItem && isSameMediaItem(musicItem, realtimeMusicItem)) {
			lyricStateStore.setValue({
				loading: false,
				lyrics: [],
				hasTranslation: false,
			})
		}
	}
}

// 网易云听歌上报状态
let lastProgressPosition = -1
// seek保护：seek后短时间内忽略位置回退的旧事件
let lastSeekPosition = -1
let lastSeekTime = 0
// pending 机制（完全参考 Moumusic pendingSeekPosition 思路）：
// seek/切源期间，歌词基于目标位置+时间差虚拟往前走，不等待播放器实际到达。
// 关键区别：之前的实现把歌词钉死在目标位置不动，音乐在走歌词不走→不同步。
// 现在的实现：歌词以正常播放速率虚拟前进，和真实播放完全对齐，用户无感知。
// 播放器真实位置追上后自动解除 pending，无缝衔接。
let pendingPosition: number | null = null
let pendingStartTime = 0
const PENDING_DURATION_MS = 8000 // 最多 8 秒，之后回归真实位置

// 切源保护：FLAC 本地文件切换期间，禁止 PlaybackActiveTrackChanged 重置歌词
// 因为 replaceCurrentTrack 内部会触发 track change 事件，会误判为切歌
let isSwitchingSource = false

ReactNativeTrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (data) => {
	durationStore.setValue(data.duration)

	const musicItem = myTrackPlayer.getCurrentMusic()
	if (!musicItem) {
		return
	}

	const lyricParser = lyricStateStore.getValue().lyricParser
	const rawLrc = nowLyricState.getValue() || DEFAULT_LYRIC
	const lyricDelaySeconds = PersistStatus.get('lyric.delaySeconds') ?? 0
	const parserReady =
		!!lyricParser &&
		isSameMediaItem(lyricParser.getCurrentMusicItem(), musicItem) &&
		lastRawLyric === rawLrc &&
		lastLyricDelaySeconds === lyricDelaySeconds

	// Pending 机制：seek/切源期间，歌词虚拟前进，不等待播放器实际到达。
	// 计算虚拟位置 = 目标位置 + 已过时间（假设播放速率 1.0）
	// 这样歌词和人声完全同步，用户感觉不到切换过程。
	const now = Date.now()
	if (pendingPosition !== null && now - pendingStartTime < PENDING_DURATION_MS) {
		const elapsedSec = (now - pendingStartTime) / 1000
		const virtualPos = pendingPosition + elapsedSec
		positionStore.setValue(virtualPos)
		if (parserReady) {
			updateCurrentLyricByPosition(virtualPos, lyricParser)
		}
		// 播放器真实位置已接近虚拟位置（误差 0.3s 内），解除 pending
		// 用 abs 处理两种情况：播放器从前面追上 / seek 过头从后面接近
		if (Math.abs(data.position - virtualPos) < 0.3) {
			pendingPosition = null
		}
		lastProgressPosition = data.position
		return
	}
	if (pendingPosition !== null && now - pendingStartTime >= PENDING_DURATION_MS) {
		// 超时，解除 pending
		pendingPosition = null
	}

	positionStore.setValue(data.position)

	if (parserReady) {
		// seek保护：seek后事件位置没追上seek位置前，忽略旧位置事件（缓冲期间会发旧位置）
		if (lastSeekPosition >= 0 && data.position < lastSeekPosition - 0.5) {
			return
		}
		// 位置追上seek点了，解除保护
		if (lastSeekPosition >= 0 && data.position >= lastSeekPosition - 0.5) {
			lastSeekPosition = -1
		}
		lastProgressPosition = data.position
		updateCurrentLyricByPosition(data.position, lyricParser)
		return
	}

	lastProgressPosition = data.position
	refreshLyric(false, true, data.position).catch((e) => {
		console.log(e, 'LRC_PROGRESS')
	})
})

ReactNativeTrackPlayer.addEventListener(Event.PlaybackActiveTrackChanged, async () => {
	// FLAC 切源期间：完全跳过，不重置歌词
	// 原生 replaceCurrentTrack 会触发 ActiveTrackChanged 事件，
	// 但实际上是同一首歌换了个文件，歌词不应该动。
	if (isSwitchingSource) {
		return
	}
	// 切源时（同一首歌只换URL）不重置歌词；只有真的切到另一首歌时才从头开始
	const musicItem = myTrackPlayer.getCurrentMusic()
	if (!musicItem) {
		refreshLyric(true, true, 0).catch((e) => {
			console.log(e, 'LRC_ACTIVE_TRACK')
		})
		return
	}
	const lyricParser = lyricStateStore.getValue().lyricParser
	const sameSong = !!lyricParser && isSameMediaItem(lyricParser.getCurrentMusicItem(), musicItem)
	if (!sameSong) {
		// 真·切歌：从头开始
		refreshLyric(true, true, 0).catch((e) => {
			console.log(e, 'LRC_ACTIVE_TRACK')
		})
	}
	// 同歌换源：什么都不做，让 PlaybackProgressUpdated 自然驱动歌词更新
})

// seek后从Buffering/Connecting回到Playing时，检查是否需要校准
// 重要：如果处于 pending 状态（seek/切源进行中），不要用真实位置校准，
// 因为此时播放器位置可能还没追上目标位置，会把歌词拉偏。
let lastStateWasBuffering = false
ReactNativeTrackPlayer.addEventListener(Event.PlaybackState, async (data) => {
	try {
		const isBuffering = data.state === ReactNativeTrackPlayer.State.Buffering || data.state === ReactNativeTrackPlayer.State.Connecting
		if (isBuffering) {
			lastStateWasBuffering = true
			return
		}
		if (lastStateWasBuffering && data.state === ReactNativeTrackPlayer.State.Playing) {
			lastStateWasBuffering = false
			// 如果 pending 还在有效期内，不做校准，让 pending 机制继续控制歌词位置
			// 避免 seek 未完成时真实位置还在目标位置之前，把歌词拉偏
			const now = Date.now()
			if (pendingPosition !== null && now - pendingStartTime < PENDING_DURATION_MS) {
				return
			}
			setTimeout(async () => {
				try {
					const musicItem = myTrackPlayer.getCurrentMusic()
					if (!musicItem) return
					const lyricParser = lyricStateStore.getValue().lyricParser
					const parserReady = !!lyricParser && isSameMediaItem(lyricParser.getCurrentMusicItem(), musicItem)
					if (parserReady) {
						const progress = await myTrackPlayer.getProgress()
						updateCurrentLyricByPosition(progress.position, lyricParser)
					}
				} catch (e) {
					// 静默失败
				}
			}, 150)
		}
	} catch (e) {
		// 静默失败
	}
})

// 已移除 setInterval 兜底：PlaybackProgressUpdated 事件每 100ms 触发一次，是唯一时钟源，避免竞态

// 获取歌词
async function setup() {
	// DeviceEventEmitter.addListener(EDeviceEvents.REFRESH_LYRIC, refreshLyric)

	refreshLyric()
}

const LyricManager = {
	setup,
	useLyricState: lyricStateStore.useValue,
	getLyricState: lyricStateStore.getValue,
	useCurrentLyric: currentLyricStore.useValue,
	getCurrentLyric: currentLyricStore.getValue,
	setCurrentLyric: currentLyricStore.setValue,
	useWordLyric: wordLyricStore.useValue,
	getWordLyric: wordLyricStore.getValue,
	refreshLyric,
	setLyricLoading,
	/**
	 * 设置 pending 位置（参考 Moumusic pendingSeekPosition）
	 * 在 seek/切源前调用，歌词立即跟随目标位置，避免中间位置跳跃导致的闪烁
	 * 播放器真实位置追上后自动解除 pending
	 */
	setPendingPosition(position: number) {
		if (position < 0) position = 0
		pendingPosition = position
		pendingStartTime = Date.now()
		const parser = lyricStateStore.getValue().lyricParser
		if (parser) {
			positionStore.setValue(position)
			updateCurrentLyricByPosition(position, parser)
		}
	},
	/**
	 * 清除 pending 状态
	 */
	clearPendingPosition() {
		pendingPosition = null
	},
	/**
	 * 强制把歌词校准到指定位置（用于 FLAC 精准同步切源后、手动 seek 后等场景）
	 * 会同时更新当前行、逐字 positionStore、seek 保护，并设置 pending
	 */
	forceSyncPosition(position: number) {
		if (position < 0) position = 0
		const parser = lyricStateStore.getValue().lyricParser
		if (!parser) return
		lastSeekPosition = position
		lastSeekTime = Date.now()
		lastProgressPosition = position
		pendingPosition = position
		pendingStartTime = Date.now()
		positionStore.setValue(position)
		updateCurrentLyricByPosition(position, parser)
	},
	/**
	 * 开始 FLAC 切源（替换为本地文件）
	 * 设置后，PlaybackActiveTrackChanged 事件不会重置歌词，
	 * 防止 replaceCurrentTrack 触发的 track change 误判为切歌
	 * 同时设置 pending 位置，歌词无缝衔接
	 */
	beginSourceSwitch(targetPosition: number) {
		isSwitchingSource = true
		pendingPosition = targetPosition
		pendingStartTime = Date.now()
		const parser = lyricStateStore.getValue().lyricParser
		if (parser) {
			positionStore.setValue(targetPosition)
			updateCurrentLyricByPosition(targetPosition, parser)
		}
	},
	/**
	 * 查询是否正在切源（FLAC 本地文件切换进行中）
	 * UI 层（AMLLLyrics 等）用它跳过切换期间的强制重锚，防止歌词被拉到第 0 句
	 */
	isSourceSwitching() {
		return isSwitchingSource
	},
	/**
	 * 结束 FLAC 切源
	 * 解除切源保护，保留 pending（歌词继续虚拟前进直到播放器追上）
	 */
	endSourceSwitch() {
		// 延迟清除切源标记，等所有事件（ActiveTrackChanged、PlaybackState 等）都处理完
		// 这些事件是异步的，可能在 replaceCurrentTrack resolve 之后才到达
		setTimeout(() => {
			isSwitchingSource = false
		}, 800)
	},
}

export const useWordLyric = wordLyricStore.useValue
export const getWordLyric = wordLyricStore.getValue
export const usePosition = positionStore.useValue
export const getPosition = positionStore.getValue

// 逐字歌词（已暂停开发，默认关闭）开关：供 App 内各个设置页统一调用
// 说明文案（各设置页开关下方统一展示）
export const KARAOKE_LYRIC_NOTE =
	'AMLL逐字歌词，开启可能造成性能损失'
export const isKaraokeLyricEnabled = () => PersistStatus.get('lyric.karaokeEnabled') === true
export const setKaraokeLyricEnabled = (next: boolean) => {
	PersistStatus.set('lyric.karaokeEnabled', next === true)
	// 立即按新开关重建当前歌词：开启则拉取逐字，关闭则回退稳定逐行 LRC
	try { refreshLyric(false, true) } catch (e) {}
}

export default LyricManager
