// Apple Music iOS 26 风格播放器
// WellMusic v2 Apple Music 2 播放器移植版
// 参考：package:flutter_sollin/src/player/applemusic2/
// 特色：位图流动背景、弹性滑块、跑马灯文本、嵌入式面板、弹簧动画
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import PersistStatus from '@/store/PersistStatus'
import {
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  Pressable,
  View,
  Image,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
  ActionSheetIOS,
  PanResponder,
  Animated as RNAnimated,
  Share,
} from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { BlurView } from 'expo-blur'
import LiquidGlassBackground from '@/components/LiquidGlassBackground'
import { isIOS26OrAbove } from '@/components/SystemNativeTabBar'
import * as Haptics from 'expo-haptics'
import { Ionicons, MaterialCommunityIcons, FontAwesome5 } from '@expo/vector-icons'
import SFSymbol from '@/components/SFSymbol'
import { useNeteaseScrobble } from '@/hooks/useNeteaseScrobble'
import FastImage from 'react-native-fast-image'
import ImageColors from 'react-native-image-colors'
import ReorderableQueue from '@/components/ReorderableQueue'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  Easing,
  runOnJS,
  useAnimatedGestureHandler,
  interpolate,
  Extrapolate,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useActiveTrack, usePlaybackState, useProgress } from 'react-native-track-player'
import { Slider } from 'react-native-awesome-slider'
import { VolumeManager } from 'react-native-volume-manager'
import { MenuView } from '@react-native-menu/menu'
import { ShowPlayerListToggle } from '@/components/ShowPlayerListToggle'
import { useCommentModalStore } from '@/store/commentModalStore'
import { useRouter } from 'expo-router'
import { ArtistSelectorModal } from '@/components/ArtistSelectorModal'
import { AirPlayRoutePicker } from '@/components/AirPlayRoutePicker'
import { PlaylistQueue } from '@/components/PlaylistQueue'
import { DownloadQualityModal } from '@/components/DownloadQualityModal'
import myTrackPlayer, { MusicRepeatMode, playListsStore } from '@/helpers/trackPlayerIndex'
import { setPlayList, getPlayList } from '@/store/playList'
import { unknownTrackImageUri } from '@/constants/images'
import { getSingerMidBySingerName } from '@/helpers/userApi/getMusicSource'
import { resolveTrackAlbum } from '@/helpers/userApi/resolveTrackAlbum'
import { useTrackPlayerFavorite } from '@/hooks/useTrackPlayerFavorite'
import { useSeekLock } from '@/hooks/useSeekLock'
import LyricManager from '@/helpers/lyricManager'
import { useWordLyric } from '@/helpers/lyricManager'
import KaraokeLine from '@/components/lyric/KaraokeLine'
import { matchWordsForLine } from '@/helpers/userApi/wordLyric'
import { findCurrentLineIndex, buildLinesFromWordLyric } from '@/utils/amllLyricAdapter'
import { wp, hp, rp, fs } from '@/utils/responsive'
import { showToast } from '@/utils/utils'
import { router } from 'expo-router'
import { usePlayerStyleStore } from '@/store/playerStyleStore'
import { useAMLLSettingsStore } from '@/store/amllSettingsStore'
import AMLLLyrics from '@/components/AMLLLyrics'
import { resolveAMLLArtwork } from '@/utils/resolveAMLLArtwork'
import { Video } from 'expo-av'
import { getNeteaseSongDynamicCover } from '@/helpers/userApi/netease-music-api'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { useSleepTimerStore } from '@/store/sleepTimerStore'

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window')

// 封面图片：borderRadius 需要随缩放动画（小封面要很圆，Apple Music 风），用可动画组件
const AnimatedFastImage = Animated.createAnimatedComponent(FastImage)

const formatTime = (seconds: number): string => {
  const total = Math.max(0, Math.round(seconds || 0))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

import { useLayoutStore } from '@/store/playerLayoutStore'
import { useScaledLayout } from '@/hooks/useScaledLayout'
import KumoneScrubber from './KumoneScrubber'

// 睡眠定时剩余时间格式化：>1小时显示 H:MM:SS，否则 MM:SS
const formatSleepRemaining = (sec: number) => {
	const s = Math.max(0, Math.floor(sec))
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	const ss = s % 60
	const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
	return `${h > 0 ? h + ':' : ''}${mm}:${String(ss).padStart(2, '0')}`
}

export const WellMusicAMPlayer = () => {
	const router = useRouter()
	const { setParams: setCommentParams } = useCommentModalStore()
	// 屏幕适配：以iPhone 14 Pro (393x852)为基准，其他设备自动缩放
	// wp=宽度适配, hp=高度适配, rp=等比缩放, fs=字体适配
	// console.log('[适配] 当前设备缩放:', { wp: wp(1), hp: hp(1), rp: rp(1) })
  const { top, bottom } = useSafeAreaInsets()
  const activeTrack = useActiveTrack()
  const currentMusic = myTrackPlayer.useCurrentMusic()
  // QQ 音乐封面有防盗链，自动搜酷狗封面渲染 AMLL 动态背景
  const [amllAlbumArt, setAmllAlbumArt] = useState<string | undefined>(undefined)
  useEffect(() => {
    let cancelled = false
    const track = currentMusic || activeTrack
    if (!track) { setAmllAlbumArt(undefined); return }
    resolveAMLLArtwork({
      title: (track as any)?.title,
      artist: (track as any)?.artist,
      album: (track as any)?.album,
      artwork: (track as any)?.artwork,
      id: (track as any)?.id,
      platform: (track as any)?.platform,
      source: (track as any)?.source,
    }).then((url) => {
      if (!cancelled) setAmllAlbumArt(url)
    })
    return () => { cancelled = true }
  }, [activeTrack?.id, currentMusic?.id])

  // ===== 网易云动态封面（eapi /api/songplay/dynamic-cover，weapi 恒返回 500） =====
  const { isLoggedIn: neteaseLoggedIn, cookie: neteaseCookieStr } = useDailyRecommendStore()
  const { dynamicCover: dynamicCoverEnabled } = useAMLLSettingsStore()
  const [dynamicCoverUrl, setDynamicCoverUrl] = useState<string | null>(null)
  const [dynamicCoverReady, setDynamicCoverReady] = useState(false)
  const dynamicCoverOpacity = useSharedValue(0)
  const isNeteaseTrack = (track: any) => {
    const p = track?.platform || track?.source || ''
    return p === 'netease' || p === 'wy' || String(track?.id || '').startsWith('netease_')
  }
  useEffect(() => {
    let cancelled = false
    const track = currentMusic || activeTrack
    setDynamicCoverUrl(null)
    setDynamicCoverReady(false)
    dynamicCoverOpacity.value = 0
    if (!dynamicCoverEnabled) return
    if (!track || !isNeteaseTrack(track)) return
    const songId = String(track.id || '').replace(/^netease_/, '')
    if (!songId || !neteaseLoggedIn || !neteaseCookieStr) return
    getNeteaseSongDynamicCover(songId, neteaseCookieStr).then((data: any) => {
      if (cancelled) return
      const url = data?.videoPlayUrl
      if (url) setDynamicCoverUrl(url)
    })
    return () => { cancelled = true }
  }, [activeTrack?.id, currentMusic?.id, neteaseLoggedIn, neteaseCookieStr, dynamicCoverEnabled])
  // 视频就绪后淡入覆盖静态封面
  useEffect(() => {
    if (dynamicCoverUrl && dynamicCoverReady) {
      dynamicCoverOpacity.value = withTiming(1, { duration: 500 })
    } else {
      dynamicCoverOpacity.value = 0
    }
  }, [dynamicCoverUrl, dynamicCoverReady, dynamicCoverOpacity])
  const dynamicCoverAnimStyle = useAnimatedStyle(() => ({ opacity: dynamicCoverOpacity.value }))

  // ===== 睡眠定时器：本曲播放完模式监听切歌触发暂停 =====
  const sleepTimer = useSleepTimerStore()
  const [currentRate, setCurrentRate] = useState<number>(() => Number(PersistStatus.get('music.rate')) || 1)
  useEffect(() => {
    if (!sleepTimer.active || sleepTimer.endBehavior !== 'endOfSong') return
    const currentId = String(activeTrack?.id || currentMusic?.id || '')
    if (sleepTimer.endOfSongTrackId && currentId && currentId !== sleepTimer.endOfSongTrackId) {
      myTrackPlayer.pause()
      sleepTimer.cancel()
      showToast('睡眠定时', '本曲播放结束，已暂停播放', 'info')
    }
  }, [activeTrack?.id, currentMusic?.id, sleepTimer.active, sleepTimer.endBehavior, sleepTimer.endOfSongTrackId])

  const playbackState = usePlaybackState()
  const isPlaying = playbackState.state === 'playing'
  const { isFavorite, toggleFavorite } = useTrackPlayerFavorite()
  const { playerStyle, setPlayerStyle } = usePlayerStyleStore()
  const backgroundMode = useAMLLSettingsStore((s) => s.backgroundMode)

  const layoutSettings = useScaledLayout()
  const updateSettings = useLayoutStore((state) => state.updateSettings)
  const [showLyrics, setShowLyrics] = useState(false)
  const [showComments, setShowComments] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const storedPlayLists = playListsStore.useValue() as any[] | null
  const [showQueue, setShowQueue] = useState(false)
  // 歌词/队列模式下歌曲信息行的绝对定位开关（进入 true，退出 false 回到原位）
  const [compactSongInfo, setCompactSongInfo] = useState(false)
  const repeatMode = myTrackPlayer.useRepeatMode()
  const [showArtistSelector, setShowArtistSelector] = useState(false)
  const [artistOptions, setArtistOptions] = useState<{name: string; avatar?: string}[]>([])

  // WellMusic v2 特色：嵌入式面板（0=无, 1=歌词, 2=评论, 3=队列）
  const [activePanel, setActivePanel] = useState(0)
  const panelTranslateX = useSharedValue(0)
  const panelIndex = useSharedValue(0)

  // WellMusic v2 特色：跑马灯动画
  const marqueeAnim = useSharedValue(0)
  // Apple Music 风格歌词滚动
  const lyricScrollY = useSharedValue(0)
  const LYRIC_LINE_HEIGHT = 80 // 每行歌词高度（含margin）
  const LYRIC_FIXED_POSITION = 200 // 当前行固定位置（从歌词区域顶部往下）

  // WellMusic v2 特色：背景流动动画
  const bgScale = useSharedValue(1.1)
  const bgTranslateX = useSharedValue(0)
  const bgTranslateY = useSharedValue(0)

  // WellMusic v2 特色：队列面板滑入动画
  const queueSlideAnim = useSharedValue(500)

  // 队列歌曲行（ReorderableQueue renderContent：行内 TouchableOpacity 只在自身区域接管触摸，长按行其余区域由 Pressable 激活拖拽）
  const queueRenderContent = useCallback((song: any, _index: number, isActive: boolean) => {
    if (!song) return null
    return (
      <View
        style={[
          styles.queueItem,
          currentMusic?.id === song.id && styles.queueItemActive,
          isActive && styles.queueItemDragging,
          { marginBottom: 10 },
        ]}
      >
        <FastImage
          source={{
            uri: song.artwork ?? unknownTrackImageUri,
            cache: 'immutable',
          }}
          style={styles.queueItemArtwork}
          resizeMode="cover"
        />
        <View style={styles.queueItemInfo}>
          <Text
            style={[
              styles.queueItemTitle,
              currentMusic?.id === song.id && styles.queueItemTitleActive,
            ]}
            numberOfLines={1}
          >
            {song.title}
          </Text>
          <Text
            style={styles.queueItemArtist}
            numberOfLines={1}
          >
            {song.artist}
            {song.platform ? ` · ${song.platform}` : ''}
          </Text>
        </View>
        {currentMusic?.id === song.id && (
          <SFSymbol
            systemName="speaker.wave.3"
            size={19}
            color="rgba(255,255,255,0.8)"
          />
        )}
        <TouchableOpacity
          onPress={(event) => {
            event.stopPropagation()
            myTrackPlayer.remove(song)
          }}
          style={styles.queueTrailingButton}
        >
          <SFSymbol
            systemName="trash"
            size={25}
            color="rgba(255,255,255,0.68)"
          />
        </TouchableOpacity>
        {/* 拖拽手柄：纯视觉提示，拖拽由整行长按触发 */}
        <View style={styles.queueTrailingButton}>
          <SFSymbol
            systemName="line.3.horizontal"
            size={24}
            color="rgba(255,255,255,0.68)"
          />
        </View>
      </View>
    )
  }, [currentMusic])

  // 点击行播放（ReorderableQueue onPressSong 直接给行数据）
  const queueHandlePressRow = useCallback((song: any) => {
    if (!song) return
    myTrackPlayer.play(song, true)
  }, [])

  // 松手落位：按新顺序写回队列
  const queueHandleReorder = useCallback((next: any[]) => {
    if (next.length === (getPlayList()?.length || 0)) setPlayList(next)
  }, [])

  const queueRenderFooter = useCallback(() => {
    if (!getPlayList().length) {
      return <Text style={styles.queueEmpty}>队列为空</Text>
    }
    return null
  }, [])

  // Apple Music 风格：播放/暂停按钮圆形按压过渡 + 图标切换过渡
  const playPressAnim = useSharedValue(0)
  const isPlayingSV = useSharedValue(isPlaying)
  useEffect(() => {
    isPlayingSV.value = isPlaying
  }, [isPlaying])
  const playPressStyle = useAnimatedStyle(() => ({
    opacity: playPressAnim.value,
  }))
  const pauseIconStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isPlayingSV.value ? 1 : 0, { duration: 180 }),
    transform: [{ scale: withTiming(isPlayingSV.value ? 1 : 0.6, { duration: 180 }) }],
  }))
  const playIconStyle = useAnimatedStyle(() => ({
    opacity: withTiming(isPlayingSV.value ? 0 : 1, { duration: 180 }),
    transform: [{ scale: withTiming(isPlayingSV.value ? 0.6 : 1, { duration: 180 }) }],
  }))
  const triggerPlayPress = useCallback(() => {
    playPressAnim.value = 1
    playPressAnim.value = withTiming(0, { duration: 350, easing: Easing.out(Easing.quad) })
  }, [playPressAnim])

  // WellMusic v2 特色：封面动画（缩小到左上角）
  const coverScaleAnim = useSharedValue(1)
  const coverTranslateX = useSharedValue(0)
  const coverTranslateY = useSharedValue(0)
  // WellMusic v2 特色：歌曲信息动画（移到封面右边）
  const songInfoTranslateX = useSharedValue(0)
  const songInfoTranslateY = useSharedValue(0)
  const songInfoOpacity = useSharedValue(1)
  // WellMusic v2 特色：歌词弹出动画（从进度条上方弹出）
  const lyricsOpacity = useSharedValue(0)
  const lyricsTranslateY = useSharedValue(100)
  // 视频版布局：歌词/播放队列与主播放页共用同一套底部控制，内容在上方原位切换
  const modeOpacity = useSharedValue(0)
  const modeTranslateY = useSharedValue(24)

  // 实时进度（使用 track-player 的 useProgress）
  const { position: progressPosition, duration: rawDuration } = useProgress(200)
  // SPlayer 式 seek 锁：seek 期间显示目标时间，不跳回旧位置
  const { displayPosition: currentTime, seek: lockedSeek, setDisplayPosition, locked: syncLocked } = useSeekLock(progressPosition)
  // 总时长：优先用播放器返回的实际duration（从音频文件解析），播放器返回0时才用歌曲元数据
  const trackDuration = (activeTrack as any)?.duration || (currentMusic as any)?.duration || 0
  const duration = rawDuration > 0 ? rawDuration : trackDuration
  // 老版本听歌上报：播放过10秒/10%上报一次 play（听歌排行），startplay 由全局 hook 处理
  useNeteaseScrobble({ track: currentMusic || activeTrack, isPlaying, currentTime, duration })
  // 进度条显示用的进度（到100%停住，不往回退）
  const displayProgress = duration > 0 ? Math.min(Math.max(currentTime / duration, 0), 1) : 0

  // kumone 式 seek 同步：拖动结束/点击跳转时下发 seekCommand 给 AMLLLyrics，
  // 立即硬校准 AMLL 时钟到目标时间。拖动过程中不下发（避免高频注入挤掉最终校准，
  // 导致松手后歌词与歌声脱节各跑各的），歌词跟手由 500ms 进度校准自然驱动
  const [seekCommand, setSeekCommand] = useState<{ seq: number; time: number }>({ seq: 0, time: 0 })
  const seekSeqRef = useRef(0)
  const emitSeek = useCallback((time: number) => {
    seekSeqRef.current += 1
    setSeekCommand({ seq: seekSeqRef.current, time })
  }, [])

  // 进度条 shared value
  const progressValue = useSharedValue(0)
  const progressMin = useSharedValue(0)
  const progressMax = useSharedValue(1)
  const isProgressSliding = useSharedValue(false)
  // Kumone 式：拖拽圆点平时隐藏，拖拽时显示并放大
  const sliderScale = useSharedValue(1)
  const sliderOpacity = useSharedValue(0)
  const thumbAnimatedStyle = useAnimatedStyle(() => ({
    opacity: sliderOpacity.value,
    transform: [{ scale: sliderScale.value }],
  }))
  // Apple Music 式：拖动时轨道变粗（高度动画，圆角恒定全圆）
  const progressTrackH = useSharedValue(7)
  const progressTrackStyle = useAnimatedStyle(() => ({
    height: progressTrackH.value,
  }))

  // 音量 shared value
  const volumeValue = useSharedValue(0)
  const volumeMin = useSharedValue(0)
  const volumeMax = useSharedValue(1)
  const isVolumeSliding = useSharedValue(false)
  const volumeThumbOpacity = useSharedValue(0)
  const volumeThumbScale = useSharedValue(1)
  const volumeThumbAnimatedStyle = useAnimatedStyle(() => ({
    opacity: volumeThumbOpacity.value,
    transform: [{ scale: volumeThumbScale.value }],
  }))
  const volumeTrackH = useSharedValue(7)
  const volumeTrackStyle = useAnimatedStyle(() => ({
    height: volumeTrackH.value,
  }))

  // 同步进度到 shared value
  useEffect(() => {
    if (!isProgressSliding.value && duration > 0) {
      progressValue.value = Math.min(currentTime / duration, 1)
    }
  }, [currentTime, duration, isProgressSliding, progressValue])

  // 初始化音量
  useEffect(() => {
    const initVolume = async () => {
      try {
        await VolumeManager.showNativeVolumeUI({ enabled: true })
        const vol = await VolumeManager.getVolume()
        volumeValue.value = vol.volume
      } catch (e) {
        // ignore
      }
    }
    initVolume()
    const listener = VolumeManager.addVolumeListener((result) => {
      if (!isVolumeSliding.value) {
        volumeValue.value = result.volume
      }
    })
    return () => listener.remove()
  }, [isVolumeSliding, volumeValue])

  // WellMusic v2 特色：位图流动背景动画（缓慢缩放+平移）
  useEffect(() => {
    bgScale.value = withRepeat(
      withSequence(
        withTiming(1.15, { duration: 20000, easing: Easing.inOut(Easing.ease) }),
        withTiming(1.1, { duration: 20000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    )
    bgTranslateX.value = withRepeat(
      withSequence(
        withTiming(-20, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
        withTiming(20, { duration: 15000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    )
    bgTranslateY.value = withRepeat(
      withSequence(
        withTiming(-15, { duration: 18000, easing: Easing.inOut(Easing.ease) }),
        withTiming(15, { duration: 18000, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    )
  }, [bgScale, bgTranslateX, bgTranslateY])



  // WellMusic v2 特色：面板切换动画
  useEffect(() => {
    panelIndex.value = withSpring(activePanel, { damping: 20, stiffness: 200 })
    panelTranslateX.value = withSpring(-activePanel * SCREEN_WIDTH, { damping: 20, stiffness: 200 })
  }, [activePanel, panelIndex, panelTranslateX])

  // WellMusic v2 特色：队列面板滑入滑出动画
  useEffect(() => {
    if (showQueue) {
      queueSlideAnim.value = withSpring(0, { damping: 25, stiffness: 300 })
    } else {
      queueSlideAnim.value = withSpring(500, { damping: 25, stiffness: 300 })
    }
  }, [showQueue])

  // WellMusic v2 特色：队列面板滑入动画样式
  const queueSlideStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: queueSlideAnim.value }],
  }))

  // WellMusic v2 特色：封面动画样式

  // WellMusic v2 特色：歌曲信息动画样式（歌词模式用绝对定位切换位置，不用 translate 避免按钮错乱）
  const songInfoAnimStyle = useAnimatedStyle(() => ({
    opacity: songInfoOpacity.value,
  }))
  const songInfoLeftAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: songInfoTranslateX.value }],
  }))

  // WellMusic v2 特色：歌词弹出动画样式
  const lyricsAnimStyle = useAnimatedStyle(() => ({
    opacity: lyricsOpacity.value,
    transform: [{ translateY: lyricsTranslateY.value }],
  }))

  // Apple Music 风格：歌词列表滚动动画
  const lyricListAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: lyricScrollY.value }],
  }))

  // AMLL 歌词：与 V1 播放器一致，统一用 LyricManager（避免 V2 自行解析导致偶发无歌词）
  const { lyrics: lmLyrics, translationLyrics, hasTranslation } = LyricManager.useLyricState()
  const wordLyric = useWordLyric()
  const karaokeEnabled = PersistStatus.useValue('lyric.karaokeEnabled', false)
  // 逐字(YRC)可用时，以"逐字行"作为歌词显示/高亮/滚动的唯一权威
  const karaokeLines = useMemo(() => (karaokeEnabled ? buildLinesFromWordLyric(wordLyric) : null), [wordLyric, karaokeEnabled])
  const lyrics = karaokeLines ?? lmLyrics

  // AMLL 歌词数据：优先逐字歌词，回退普通歌词（与 V1 播放器一致）
  const amllLyricData = useMemo(() => {
    const source = wordLyric && wordLyric.length > 0 ? wordLyric : lyrics;
    if (!source || source.length === 0) return [];
    return source.map((l: any, i: number) => ({
      time: l.time,
      end: l.end,
      lrc: l.lrc,
      index: i,
      words: l.words?.map((w: any) => ({
        start: w.start,
        end: w.end,
        text: w.text,
      })),
      translatedLyric:
        hasTranslation && translationLyrics
          ? translationLyrics.find(
              (t: any) => Math.abs(t.time - l.time) < 0.5
            )?.lrc
          : undefined,
    }));
  }, [wordLyric, lyrics, translationLyrics, hasTranslation]);

  // AMLL 组件状态：歌词界面才显示歌词，队列/大封面隐藏（背景保留）
  const amllShowLyrics = showLyrics && !showQueue

  // 打开播放器 1 秒内即见背景：AMLL WebView 首次初始化（约3秒）期间显示当前歌曲封面的
  // 模糊静态背景兜底，AMLL 流动背景就绪后 500ms 淡出过渡，用户感觉不到等待
  const [amllReady, setAmllReady] = useState(false)
  const [showFallbackBg, setShowFallbackBg] = useState(true)
  const fallbackBgOpacity = useSharedValue(1)
  const fallbackBgStyle = useAnimatedStyle(() => ({ opacity: fallbackBgOpacity.value }))
  useEffect(() => {
    if (amllReady && showFallbackBg) {
      // 就绪后稍作停留再淡出：兜底有存在感，AMLL 流动背景淡入过渡自然
      const t1 = setTimeout(() => {
        fallbackBgOpacity.value = withTiming(0, { duration: 600 })
      }, 400)
      const t2 = setTimeout(() => setShowFallbackBg(false), 400 + 620)
      return () => {
        clearTimeout(t1)
        clearTimeout(t2)
      }
    }
  }, [amllReady, showFallbackBg, fallbackBgOpacity])
  // 兜底超时：极端情况下页面未发送 ready 消息，3 秒后也强制淡出，避免一直停在模糊背景
  useEffect(() => {
    if (!amllReady) {
      const t = setTimeout(() => setAmllReady(true), 3000)
      return () => clearTimeout(t)
    }
  }, [amllReady])


  // 按歌曲记忆歌词延迟
  const [songLyricDelay, setSongLyricDelayState] = useState(0)
  const skipNextScroll = useRef(false)
  const setSongLyricDelay = useCallback((delay: number) => {
    if (!activeTrack?.id) return
    skipNextScroll.current = true
    setSongLyricDelayState(delay)
    try {
      const raw = PersistStatus.get('lyric.delayBySong') || '{}'
      const map = JSON.parse(raw)
      map[activeTrack.id] = delay
      PersistStatus.set('lyric.delayBySong', JSON.stringify(map))
    } catch (e) {}
  }, [activeTrack?.id])

  useEffect(() => {
    if (!activeTrack?.id) { setSongLyricDelayState(0); return }
    try {
      const raw = PersistStatus.get('lyric.delayBySong') || '{}'
      const map = JSON.parse(raw)
      const d = map[activeTrack.id]
      setSongLyricDelayState(typeof d === 'number' ? d : 0)
    } catch (e) { setSongLyricDelayState(0) }
  }, [activeTrack?.id])

  // 当前歌词索引：用AMLL解析结果 + currentTime 实时计算
  const currentDelay = songLyricDelay !== 0 ? songLyricDelay : (parseFloat(PersistStatus.get('lyric.delaySeconds') ?? '0') || 0)
  // 音质：歌词微调仅对无损及以上（flac/24bit/hires/master）生效，极高(320k)/标准(128k)不受影响
  const currentQuality = myTrackPlayer.useCurrentQuality()
  const losslessQualitySet = new Set(['flac', '24bit', 'hires', 'master'])
  const qualityAllowsLyricDelay = losslessQualitySet.has(currentQuality)
  const handleLyricDelay = useCallback((seconds: number) => {
    if (!qualityAllowsLyricDelay) {
      showToast('歌词微调仅对无损及以上音质生效', 'netease')
      return
    }
    setSongLyricDelay(seconds)
    const abs = Math.abs(seconds)
    const dir = seconds < 0 ? '后' : seconds > 0 ? '前' : ''
    showToast(abs === 0 ? '歌词时间已复位' : `歌词移到 ${abs} 秒${dir}`, 'netease')
  }, [qualityAllowsLyricDelay, setSongLyricDelay])
  // 当前歌词索引：统一与进度条同源（displayPosition:currentTime）。无损音质下 seek 后
  // 播放器真实位置 getPosition 上报滞后，原独立 rAF 直读真实位置的时钟会让人声与
  // 面板歌词脱节"各跑各的"；用 currentTime 即与进度条一致、跟手不脱节。
  const progressLyricIndex = findCurrentLineIndex(lyrics, currentTime + currentDelay)
  const currentLyricIndex = progressLyricIndex

  // 基于 currentTime 实时计算的歌词索引（高亮和滚动统一用这个源，避免和歌曲不同步）
  const computedLyricIndex = currentLyricIndex >= 0 ? currentLyricIndex : 0

  const lyricScrollRef = useRef<FlatList>(null)
  const isUserScrolling = useRef(false)
  const scrollResumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 用户滚动时暂停自动滚动 4 秒
  const handleLyricScrollBegin = () => {
    isUserScrolling.current = true
    if (scrollResumeTimer.current) clearTimeout(scrollResumeTimer.current)
  }
  const handleLyricScrollEnd = () => {
    if (scrollResumeTimer.current) clearTimeout(scrollResumeTimer.current)
    scrollResumeTimer.current = setTimeout(() => {
      isUserScrolling.current = false
    }, 3000)
  }

  // 动画值
  const artworkScale = useSharedValue(1)

  // 从专辑封面提取颜色
  // 歌词自动滚动（统一用 computedLyricIndex，和高亮同源）
  const lastScrollIndex = useRef(-1)
  useEffect(() => {
    if (!showLyrics || !lyricScrollRef.current || !lyrics || lyrics.length === 0) {
      return
    }
    // 用户手动滚动歌词时暂停自动滚动
    if (isUserScrolling.current) {
      return
    }

    if (computedLyricIndex === lastScrollIndex.current) {
      return
    }
    lastScrollIndex.current = computedLyricIndex

    try {
      if (skipNextScroll.current) {
        skipNextScroll.current = false
        return
      }
      lyricScrollRef.current.scrollToIndex({
        index: Math.max(0, Math.min(computedLyricIndex, lyrics.length - 1)),
        viewPosition: (layoutSettings.lyricActiveOffset ?? 50) / 100,
        animated: true,
      })
    } catch (e) {}
  }, [computedLyricIndex, showLyrics, lyrics, layoutSettings.lyricActiveOffset])


  // 换歌后重新滚动到顶部
  useEffect(() => {
    if (showLyrics && lyricScrollRef.current) {
      lyricScrollRef.current.scrollToOffset({
        offset: 0,
        animated: false,
      })
    }
  }, [activeTrack?.id, showLyrics])

  // 播放状态动画：播放 1 / 暂停 0.85（Apple Music 效果），歌词/队列小封面同样生效
  useEffect(() => {
    artworkScale.value = withSpring(isPlaying ? 1 : 0.85, {
      damping: 15,
      stiffness: 100,
    })
  }, [isPlaying, artworkScale])

  // transform 顺序：translate 在前、scale 在后 —— scale 最后施加，translate 是绝对像素位移，
  // 不被缩放比例折算；这样传入的 tx/ty（屏幕像素）能让封面中心精确移到目标位。
  const coverAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: coverTranslateX.value },
      { translateY: coverTranslateY.value },
      { scale: coverScaleAnim.value * artworkScale.value },
    ],
    // 动态圆角：缩放时保持视觉圆角一致
    borderRadius: 24 / Math.max(coverScaleAnim.value, 0.1),
  }))

  const handleTogglePlay = useCallback(() => {
		if (isPlaying) {
			myTrackPlayer.fadePause()
		} else {
			myTrackPlayer.fadePlay()
		}
	}, [isPlaying])

  const handlePrevious = useCallback(() => {
    myTrackPlayer.skipToPrevious()
  }, [])

  const handleNext = useCallback(() => {
    myTrackPlayer.skipToNext()
  }, [])

  const handleSeek = useCallback((value: number) => {
    // SPlayer 式：lockedSeek 立即锁定显示时间到目标，seek 完成后平滑释放
    lockedSeek(value)
    // 立即校准 AMLL WebView 内部时钟到目标位置
    emitSeek(value)
    // 拖动进度条后立即计算当前歌词索引，不用等 LyricManager 回调
    if (lyrics && lyrics.length > 0) {
      // 应用歌词延迟：lyrics 里的 time 已包含延迟，value 是实际播放时间，需要加上延迟再比较
      const delay = parseFloat(PersistStatus.get('lyric.delaySeconds') ?? '0') || 0
      const adjustedTime = value + delay
      let computedIndex = 0
      for (let i = lyrics.length - 1; i >= 0; i--) {
        if (adjustedTime >= (lyrics[i]?.time || 0)) {
          computedIndex = i
          break
        }
      }
      // 立即滚动到该行
      if (lyricScrollRef.current) {
        try {
          lastScrollIndex.current = computedIndex
          isUserScrolling.current = false
          if (scrollResumeTimer.current) clearTimeout(scrollResumeTimer.current)
          lyricScrollRef.current.scrollToIndex({
            index: computedIndex,
            viewPosition: (layoutSettings.lyricActiveOffset ?? 50) / 100,
            animated: true,
          })
        } catch (e) {}
      }
    }
    // 重置用户滚动状态
    isUserScrolling.current = false
    if (scrollResumeTimer.current) clearTimeout(scrollResumeTimer.current)
  }, [lyrics, layoutSettings.lyricActiveOffset])

  const navigateToArtist = useCallback((artistName: string, platform: string) => {
    getSingerMidBySingerName(artistName, platform).then((singerMid) => {
      try {
        if (singerMid) {
          router.navigate(`/(modals)/${singerMid}`)
        } else {
          // fallback：直接用歌手名字导航，确保一定能跳转
          router.navigate(`/(modals)/${encodeURIComponent(artistName)}?platform=${platform}`)
        }
      } catch (navError) {
        console.error('导航到歌手页面失败:', navError)
      }
    }).catch((error) => {
      console.error('获取歌手ID失败:', error)
      // fallback：直接用歌手名字导航
      try {
        router.navigate(`/(modals)/${encodeURIComponent(artistName)}?platform=${platform}`)
      } catch (navError) {
        console.error('fallback导航失败:', navError)
      }
    })
  }, [router])

  const handleArtistPress = useCallback((artist?: string) => {
    const targetArtist = artist ?? activeTrack?.artist
    if (targetArtist && !targetArtist.includes('未知')) {
      // 根据 songId 前缀自动判断平台
      const songId = currentMusic?.songmid || currentMusic?.id || activeTrack?.songmid || activeTrack?.id || ''
      let songPlatform = currentMusic?.platform || currentMusic?.source || activeTrack?.platform || activeTrack?.source || 'qq'
      const idStr = String(songId)
      if (idStr.startsWith('netease_') || idStr.startsWith('wy_')) {
        songPlatform = 'netease'
      } else if (idStr.startsWith('kugou_') || idStr.startsWith('kg_')) {
        songPlatform = 'kugou'
      } else if (idStr.startsWith('kuwo_') || idStr.startsWith('kw_')) {
        songPlatform = 'kuwo'
      }
      console.log('[artist] platform:', songPlatform, 'songId:', songId)

      // 如果传入了artist参数（从MenuView选择），直接跳转
      if (artist) {
        navigateToArtist(artist, songPlatform)
        return
      }

      // 分割多歌手（支持 / 、 、 , 、& 等分隔符）
      const artistList = targetArtist.split(/\s*[\/、,&]\s*/).filter(a => a.trim())
      if (artistList.length > 1) {
        // 多个歌手，底部弹出选择器（保留备用）
        setArtistOptions(artistList.map(name => ({ name })))
        setShowArtistSelector(true)
      } else {
        // 单个歌手，直接跳转
        navigateToArtist(targetArtist, songPlatform)
      }
    }
  }, [activeTrack?.artist, currentMusic?.platform, currentMusic?.source, currentMusic?.id, currentMusic?.songmid, navigateToArtist])

  // 判断是否为真实歌词行（排除段落标记[xxx]、制作人员信息行）
  const isRealLyricLine = (text: string): boolean => {
    if (!text || !text.trim()) return false
    const t = text.trim()
    if (/^\[.*\]$/.test(t)) return false
    if (/^(作词|作曲|编曲|制作|监制|混音|录音|吉他|贝斯|鼓|钢琴|和声|编写|配唱|制作人|出品|发行|OP|SP|演唱|歌手|专辑|词曲|原唱|翻唱|和声编写|录音师|混音师|母带)/.test(t)) return false
    if (/^[A-Z][a-z]+ [A-Z][a-z]+\/[A-Z]/.test(t) && t.includes('/')) return false
    return true
  }

  // 当前歌词索引：如果指向段落标记等非真实行，找到最近的真实歌词行
  const effectiveLyricIndex = (() => {
    if (!lyrics || lyrics.length === 0) return 0
    if (isRealLyricLine(lyrics[computedLyricIndex]?.lrc || '')) return computedLyricIndex
    for (let i = computedLyricIndex - 1; i >= 0; i--) {
      if (isRealLyricLine(lyrics[i]?.lrc || '')) return i
    }
    for (let i = computedLyricIndex + 1; i < lyrics.length; i++) {
      if (isRealLyricLine(lyrics[i]?.lrc || '')) return i
    }
    return computedLyricIndex
  })()

  // 按时间戳获取对应的翻译（要求时间差在0.8秒内，避免翻译错位到非歌词行）
  const getTranslationForTime = (time: number) => {
    if (!translationLyrics || translationLyrics.length === 0) return null
    let best = null
    let bestDiff = 1.1
    for (let i = 0; i < translationLyrics.length; i++) {
      const diff = Math.abs(translationLyrics[i].time - time)
      if (diff < bestDiff) {
        bestDiff = diff
        best = translationLyrics[i]
      }
    }
    return best
  }

  const handleLyricLinePress = useCallback(
    (index: number) => {
      if (lyrics && lyrics[index]) {
        handleSeek(lyrics[index].time)
        // 立即更新手动歌词索引，高亮立即切换
          // 立即重置用户滚动状态
        isUserScrolling.current = false
        if (scrollResumeTimer.current) clearTimeout(scrollResumeTimer.current)
        // 立即滚动到点击的行，无延迟
        if (lyricScrollRef.current) {
          try {
            lyricScrollRef.current.scrollToIndex({
              index: index,
              viewPosition: (layoutSettings.lyricActiveOffset ?? 50) / 100,
              animated: true,
            })
          } catch (e) {}
        }
      }
    },
    [lyrics, handleSeek, layoutSettings.lyricActiveOffset],
  )

  // 大封面 -> 左上角 小封面。落点完全按参考图动态定位：
  // 封面落在屏幕左上角迷你位：左 16、顶 top+8，与 Apple Music 参考图一致。
  // 歌曲信息同步移动到封面右侧、垂直居中。落点全部用确定性常量，不依赖运行时测量。
  const mainArtworkSize = SCREEN_WIDTH * 0.86
  const miniArtworkSize = layoutSettings.lyricMiniArtworkSize ?? 80
  const miniArtworkScale = miniArtworkSize / mainArtworkSize

  // 封面圆角：borderRadius 会被 transform scale 折算，反向补偿使视觉圆角恒定
  // （大封面 24 → 小封面 12，Apple Music 小封面很圆）
  const albumArtRoundStyle = useAnimatedStyle(() => {
    const sc = Math.max(coverScaleAnim.value, 0.1)
    const target = 24 - (1 - sc) / (1 - miniArtworkScale) * 12
    return { borderRadius: target / sc }
  })

  const enterCompactMode = useCallback(() => {
    setShowComments(false)
    // Apple Music 封面过渡：spring（弹簧物理动画），自然回弹、丝滑无跳变。
    // 落点用写死的确定性常量：封面缩到屏幕左上角迷你位（左 16、顶 top+8，参考图一致），
    // 歌曲信息同步移动到封面右侧、垂直居中 —— 不依赖运行时测量，任何设备都一样精确。
    const spring = { damping: 30, stiffness: 220, mass: 1 }
    const S = miniArtworkSize
    // 封面初始中心：内容区水平居中、垂直 = content(paddingTop top+16) + wrapper marginTop 40 + 封面一半(0.43W)
    const coverInitX = SCREEN_WIDTH / 2
    const coverInitY = top + 16 + 40 + SCREEN_WIDTH * 0.43
    // 封面目标：左上角迷你位（左 24、顶 top+14，贴近状态栏下方）
    const destLeft = 24
    const destTop = top + 14
    const tx = destLeft + S / 2 - coverInitX
    const ty = destTop + S / 2 - coverInitY
    coverScaleAnim.value = withSpring(miniArtworkScale, spring)
    coverTranslateX.value = withSpring(tx, spring)
    coverTranslateY.value = withSpring(ty, spring)
    // 歌曲信息：淡出 → 整行切到绝对定位（封面右侧、垂直居中）→ 淡入（absolute 由 compactSongInfo 切换）
    songInfoTranslateX.value = 0
    songInfoTranslateY.value = 0
    songInfoOpacity.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) })
    setTimeout(() => {
      setCompactSongInfo(true)
      songInfoOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) })
    }, 120)
    // 歌词/队列容器淡入 + 上移
    modeOpacity.value = 0
    modeTranslateY.value = 22
    requestAnimationFrame(() => {
      modeOpacity.value = withTiming(1, { duration: 320, easing: Easing.inOut(Easing.ease) })
      modeTranslateY.value = withTiming(0, { duration: 320, easing: Easing.inOut(Easing.ease) })
    })
  }, [
    coverScaleAnim,
    coverTranslateX,
    coverTranslateY,
    songInfoTranslateX,
    songInfoTranslateY,
    songInfoOpacity,
    modeOpacity,
    modeTranslateY,
    miniArtworkScale,
    miniArtworkSize,
    top,
  ])

  const handleShowLyrics = useCallback(() => {
    // 已处于任意 compact 面板时切换只换内容，不重跑封面/歌曲信息动画，避免顶部信息闪烁
    if (!(showLyrics || showQueue || showComments)) enterCompactMode()
    setShowQueue(false)
    setShowLyrics(true)
    // 显示歌词后立即滚动到当前播放位置
    setTimeout(() => {
      if (!lyricScrollRef.current || !lyrics || lyrics.length === 0) return
      try {
        lyricScrollRef.current.scrollToIndex({
          index: Math.max(0, Math.min(currentLyricIndex, lyrics.length - 1)),
          viewPosition: (layoutSettings.lyricActiveOffset ?? 50) / 100,
          animated: false,
        })
      } catch (e) {}
    }, 100)
  }, [enterCompactMode, showLyrics, showQueue, showComments, lyrics, currentLyricIndex, layoutSettings.lyricActiveOffset])

  // 播放列表排序处理
  const handleReorderSong = useCallback((song: any, action: 'top' | 'up' | 'down' | 'bottom') => {
    const list = getPlayList()
    const index = list.findIndex((s: any) => s.id === song.id && s.platform === song.platform)
    if (index === -1) return

    const newList = [...list]
    const [item] = newList.splice(index, 1)

    switch (action) {
      case 'top':
        newList.unshift(item)
        break
      case 'up':
        if (index > 0) newList.splice(index - 1, 0, item)
        else newList.unshift(item)
        break
      case 'down':
        if (index < newList.length) newList.splice(index + 1, 0, item)
        else newList.push(item)
        break
      case 'bottom':
        newList.push(item)
        break
    }
    setPlayList(newList)
  }, [])

  // 长按排序图标弹出菜单
  const handleLongPressReorder = useCallback((song: any) => {
    Alert.alert('调整播放顺序', '', [
      { text: '置顶', onPress: () => handleReorderSong(song, 'top') },
      { text: '上移', onPress: () => handleReorderSong(song, 'up') },
      { text: '下移', onPress: () => handleReorderSong(song, 'down') },
      { text: '置底', onPress: () => handleReorderSong(song, 'bottom') },
      { text: '取消', style: 'cancel' },
    ])
  }, [handleReorderSong])

  const handleShowQueue = useCallback(() => {
    if (!(showLyrics || showQueue || showComments)) enterCompactMode()
    setShowLyrics(false)
    setShowQueue(true)
  }, [enterCompactMode, showLyrics, showQueue, showComments])

  const handleHideCompactMode = useCallback(() => {
    // 与进入对称：封面 spring 回放大，自然回弹丝滑
    const spring = { damping: 30, stiffness: 220, mass: 1 }
    coverScaleAnim.value = withSpring(1, spring)
    coverTranslateX.value = withSpring(0, spring)
    coverTranslateY.value = withSpring(0, spring)
    // 歌词/队列立即隐藏，避免封面放大过程中与下方面板叠加闪烁
    setShowLyrics(false)
    setShowQueue(false)
    // 歌曲信息：淡出 → 切回原位 → 淡入（absolute→原位切换）
    songInfoTranslateX.value = 0
    songInfoTranslateY.value = 0
    songInfoOpacity.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) })
    setTimeout(() => {
      setCompactSongInfo(false)
      songInfoOpacity.value = withTiming(1, { duration: 180, easing: Easing.out(Easing.quad) })
    }, 120)
    modeOpacity.value = withSpring(0, spring)
    modeTranslateY.value = withSpring(14, spring)
  }, [
    coverScaleAnim,
    coverTranslateX,
    coverTranslateY,
    songInfoTranslateX,
    songInfoTranslateY,
    songInfoOpacity,
    modeOpacity,
    modeTranslateY,
  ])

  const handleHideLyrics = handleHideCompactMode

  const compactContentAnimStyle = useAnimatedStyle(() => ({
    opacity: modeOpacity.value,
    transform: [{ translateY: modeTranslateY.value }],
  }))

  // 更多菜单选项
  const menuActions = useMemo(() => [
    // { id: 'artist', title: '歌手主页', image: 'person' },
    { id: 'album', title: '查看专辑', image: 'square.stack' },
    { id: 'comments', title: '评论', image: 'text.bubble' },
    { id: 'share', title: '分享', image: 'square.and.arrow.up' },
    { id: 'download', title: '下载', image: 'arrow.down.circle' },
    { id: 'add-to-custom-playlist', title: '添加至自建歌单', image: 'folder.badge.plus' },
    {
      id: 'playerStyle',
      title: '播放器样式',
      image: 'paintpalette',
      // 与 AM 播放器一致：点击展开选择。睡眠定时进行中标题每 5 秒刷新会触发 menuActions
      // 重建收起展开中的子菜单，此时退化为内联平铺；其余时间保持点击展开式与 AM 一致
      displayInline: sleepTimer.active && sleepTimer.endBehavior === 'minutes' && sleepTimer.remainingSeconds > 0,
      subactions: [
        { id: 'style_wellmusic_am', title: (playerStyle === 'wellmusic-am' ? '✓ ' : '') + 'AM' },
        { id: 'style_applemusic_v2', title: (playerStyle === 'apple-music-v2' ? '✓ ' : '') + 'Apple Music V2' },
      ],
    },
    {
      id: 'lyricFontSize',
      title: '歌词大小',
      image: 'textformat.size',
      subactions: [
        { id: 'font_decrease', title: '减小' },
        { id: 'font_increase', title: '增大' },
        { id: 'font_reset', title: '重置默认' },
      ],
    },
    {
      id: 'lyricDelay',
      title: currentDelay !== 0
        ? `歌词时间微调（当前${currentDelay > 0 ? '+' : ''}${currentDelay % 1 !== 0 ? currentDelay.toFixed(1) : currentDelay.toFixed(0)}秒${currentDelay > 0 ? '提前' : currentDelay < 0 ? '推迟' : ''}）`
        : '歌词时间微调',
      image: 'clock',
      subactions: [
        { id: 'delay_-3000', title: '-3.0秒（歌词推迟）' },
        { id: 'delay_-2000', title: '-2.0秒' },
        { id: 'delay_-1000', title: '-1.0秒' },
        { id: 'delay_-500', title: '-0.5秒' },
        { id: 'delay_-200', title: '-0.2秒' },
        { id: 'delay_0', title: '复位（0.0秒）' },
        { id: 'delay_200', title: '+0.2秒' },
        { id: 'delay_500', title: '+0.5秒' },
        { id: 'delay_1000', title: '+1.0秒' },
        { id: 'delay_2000', title: '+2.0秒' },
        { id: 'delay_3000', title: '+3.0秒（歌词提前）' },
      ],
    },
    {
      id: 'timing',
      title: sleepTimer.active
        ? sleepTimer.endBehavior === 'minutes' && sleepTimer.remainingSeconds > 0
          ? `睡眠定时（剩余 ${formatSleepRemaining(sleepTimer.remainingSeconds)}）`
          : sleepTimer.endBehavior === 'endOfSong'
            ? '睡眠定时（当前歌曲播完）'
            : '睡眠定时（进行中）'
        : '睡眠定时',
      image: 'timer',
      subactions: [
        { id: 'timing_15', title: '15分钟' },
        { id: 'timing_30', title: '30分钟' },
        { id: 'timing_45', title: '45分钟' },
        { id: 'timing_60', title: '60分钟' },
        { id: 'timing_90', title: '90分钟' },
        { id: 'timing_custom', title: '自定义...' },
        { id: 'timing_endsong', title: '当前歌曲播放完' },
        ...(sleepTimer.active
          ? [{ id: 'timing_cancel', title: '关闭定时器', attributes: ['destructive'] as any }]
          : []),
      ],
    },
    {
      id: 'playbackRate',
      title: '播放速度',
      image: 'speedometer',
      subactions: [0.5, 0.75, 1, 1.25, 1.5, 2].map((r) => ({
        id: `rate_${r}`,
        title: (Math.abs(currentRate - r) < 0.001 ? '✓ ' : '') + `${r}x`,
      })),
    },
  ], [playerStyle, sleepTimer.active, sleepTimer.remainingSeconds, currentRate, currentDelay])

    const handleMenuPress = useCallback(async (event: string) => {
    switch (event) {
      // case 'artist':
      //   handleArtistPress()
      //   break
      case 'album': {
        const t = (activeTrack || currentMusic) as any
        if (!t) break
        const hasAlbumId = !!(t.albumMid || t.albummid || t.albumId || t.album_mid || t.album_id || t.albumid)
        if (!hasAlbumId) showToast('正在查找专辑…', '', 'info')
        try {
          const albumMid = await resolveTrackAlbum(t)
          if (albumMid) {
            router.push('/(modals)/' + albumMid + '?album=1')
            break
          }
        } catch (e) {
          // 解析失败兜底提示
        }
        Alert.alert('提示', '暂无专辑信息')
        break
      }
      case 'comments':
        setShowComments(true)
        break
      case 'download':
        setShowDownloadModal(true)
        break
      case 'add-to-custom-playlist': {
        const customPlaylists = (storedPlayLists || []).filter((p: any) => p.platform === 'custom' || p.platform === 'local' || p.id?.startsWith('custom_') || p.id?.startsWith('local_'))
        if (customPlaylists.length === 0) {
          Alert.alert('提示', '还没有自建歌单，请先创建一个')
          break
        }
        const options = customPlaylists.map((p: any) => p.name || p.title || '未命名歌单')
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options: ['取消', ...options],
            cancelButtonIndex: 0,
            title: '添加至自建歌单',
          },
          (buttonIndex) => {
            if (buttonIndex === 0) return
            const selectedPlaylist = customPlaylists[buttonIndex - 1]
            if (selectedPlaylist) {
              const track = (currentMusic || activeTrack) as IMusic.IMusicItem
              if (track) {
                myTrackPlayer.addSongToStoredPlayList(selectedPlaylist, track)
                showToast('已添加到 ' + (selectedPlaylist.name || selectedPlaylist.title), '', 'success')
              }
            }
          },
        )
        break
      }
      case 'share':
        handleShareSong()
        break
      case 'font_decrease':
        updateSettings({ lyricFontSize: Math.max(20, (layoutSettings.lyricFontSize ?? 38) - 4) })
        break
      case 'font_increase':
        updateSettings({ lyricFontSize: Math.min(60, (layoutSettings.lyricFontSize ?? 38) + 4) })
        break
      case 'font_reset':
        updateSettings({ lyricFontSize: 38 })
        break
      case 'delay_-3000':
        handleLyricDelay(-3)
        break
      case 'delay_-2000':
        handleLyricDelay(-2)
        break
      case 'delay_-1000':
        handleLyricDelay(-1)
        break
      case 'delay_-500':
        handleLyricDelay(-0.5)
        break
      case 'delay_-200':
        handleLyricDelay(-0.2)
        break
      case 'delay_0':
        handleLyricDelay(0)
        break
      case 'delay_200':
        handleLyricDelay(0.2)
        break
      case 'delay_500':
        handleLyricDelay(0.5)
        break
      case 'delay_1000':
        handleLyricDelay(1)
        break
      case 'delay_2000':
        handleLyricDelay(2)
        break
      case 'delay_3000':
        handleLyricDelay(3)
        break
      case 'style_wellmusic_am':
        // AM风格提醒（最多3次）
        const amRemindCount = parseInt(PersistStatus.get('am_style_remind_count') ?? '0')
        if (amRemindCount < 3) {
          PersistStatus.set('am_style_remind_count', String(amRemindCount + 1))
          
        }
        setPlayerStyle('wellmusic-am')
        break
      case 'style_applemusic_v2':
        setPlayerStyle('apple-music-v2')
        break
      case 'timing_15':
      case 'timing_30':
      case 'timing_45':
      case 'timing_60':
      case 'timing_90': {
        const mins = Number(event.split('_')[1])
        sleepTimer.setTimerMinutes(mins)
        showToast('睡眠定时', `${mins} 分钟后将自动暂停播放`, 'info')
        break
      }
      case 'timing_custom': {
        Alert.prompt(
          '睡眠定时',
          '输入要定时关闭的分钟数（可输入小数，如 0.5 = 30 秒）',
          [
            { text: '取消', style: 'cancel' },
            {
              text: '确定',
              onPress: (minsText) => {
                const mins = parseFloat(String(minsText))
                if (!isNaN(mins) && mins > 0) {
                  const clamped = Math.min(mins, 1440)
                  sleepTimer.setTimerMinutes(clamped)
                  showToast('睡眠定时', `${clamped} 分钟后将自动暂停播放`, 'info')
                }
              },
            },
          ],
          'plain-text',
        )
        break
      }
      case 'timing_endsong': {
        const trackId = String(activeTrack?.id || currentMusic?.id || '')
        if (trackId) {
          sleepTimer.setEndOfSong(trackId)
          showToast('睡眠定时', '当前歌曲播放完将自动暂停', 'info')
        }
        break
      }
      case 'timing_cancel':
        sleepTimer.cancel()
        showToast('睡眠定时', '已关闭定时器', 'info')
        break
      case 'rate_0.5':
      case 'rate_0.75':
      case 'rate_1':
      case 'rate_1.25':
      case 'rate_1.5':
      case 'rate_2': {
        const rate = Number(event.split('_')[1])
        myTrackPlayer.setRate(rate)
        PersistStatus.set('music.rate', rate)
        setCurrentRate(rate)
        showToast('播放速度', `${rate}x 倍速`, 'info')
        break
      }
    }
  }, [handleShowLyrics, setPlayerStyle, activeTrack?.album, activeTrack?.id, currentMusic?.id, sleepTimer, handleArtistPress, handleLyricDelay])

  // 音质显示与切换
  // 音质中文显示开关（设置-播放与音效），默认关闭=英文
  const qualityZh = PersistStatus.useValue('music.qualityZh' as any, false) === true
  const qualityDisplayName: Record<string, string> = {
    '128k': qualityZh ? '标准' : '128k',
    '320k': qualityZh ? '极高' : '320k',
    'flac': qualityZh ? '无损' : 'FLAC',
    '24bit': qualityZh ? '高解析无损' : '24bit',
    'hires': qualityZh ? '高解析度' : 'Hi-Res',
    'master': qualityZh ? '母带' : 'Master',
  }
  const qualityTech: Record<string, { zh: string; en: string }> = {
    '128k': { zh: '128 kbps', en: '128 kbps' },
    '320k': { zh: '320 kbps', en: '320 kbps' },
    'flac': { zh: '无损 · FLAC', en: 'Lossless · FLAC' },
    '24bit': { zh: '24 位/48 kHz FLAC', en: '24-bit/48 kHz FLAC' },
    'hires': { zh: '24 位/96 kHz FLAC', en: '24-bit/96 kHz FLAC' },
    'master': { zh: '24 位/192 kHz FLAC', en: '24-bit/192 kHz FLAC' },
  }
  const handleQualityChange = useCallback(async (newQuality: string) => {
    if (newQuality === currentQuality) return
    try {
      const currentMusic = myTrackPlayer.getCurrentMusic()
      const prog = await myTrackPlayer.getProgress()
      myTrackPlayer.changeQuality(newQuality as any)
      if (currentMusic) {
        await myTrackPlayer.play(currentMusic, true)
        setTimeout(() => {
          myTrackPlayer.seekTo(prog.position)
        }, 600)
      }
    } catch (e) {
      console.error('change quality error', e)
    }
  }, [currentQuality])
  const handleQualityPress = useCallback(() => {
    // 已改为 MenuView 原生弹窗
  }, [])

  const handleShareSong = useCallback(async () => {
    try {
      const track = activeTrack
      if (!track) return
      const songId = track.songmid || track.id || ''
      let platform = track.platform || track.source || 'qq'
      const idStr = String(songId)
      if (idStr.startsWith('netease_') || idStr.startsWith('wy_')) platform = 'netease'
      if (idStr.startsWith('qq_')) platform = 'qq'

      let url = ''
      if (platform === 'netease' || platform === 'wy') {
        const pureId = idStr.replace(/^(netease_|wy_)/, '')
        url = `https://music.163.com/#/song?id=${pureId}`
      } else if (platform === 'qq') {
        const pureId = idStr.replace(/^qq_/, '')
        url = `https://y.qq.com/n/ryqq/songDetail/${pureId}`
      }

      const title = `${track.title || '歌曲'} - ${track.artist || '未知歌手'}`
      if (url) {
        await Share.share({ message: `${title}\n${url}`, url })
      } else {
        await Share.share({ message: title })
      }
    } catch (e) {
      console.error('share error', e)
    }
  }, [activeTrack])

  const qualityActions = ['128k', '320k', 'flac', '24bit', 'hires', 'master'].map(q => ({
    id: q,
    title: qualityDisplayName[q] || q,
    state: q === currentQuality ? 'off' : 'off',
    image: q === currentQuality ? 'checkmark' : undefined,
  }))

  const progress = duration > 0 ? currentTime / duration : 0

  const artworkAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: artworkScale.value }],
  }))

  // WellMusic v2 特色：位图流动背景动画样式
  const bgAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: bgScale.value },
      { translateX: bgTranslateX.value },
      { translateY: bgTranslateY.value },
    ],
  }))

  // WellMusic v2 特色：面板滑动样式
  const panelAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: panelTranslateX.value }],
  }))

  // 底部控制组件（主界面和歌词界面共用）
  const BottomControls = () => (
    <View style={[styles.bottomControls, { marginTop: 0 }]}>
      {/* 进度条（原样式 + Kumone 式圆点隐藏） */}
      <View style={styles.progressSection}>
        <Slider
          progress={progressValue}
          minimumValue={progressMin}
          maximumValue={progressMax}
          disableTapEvent={false}
          containerStyle={styles.sliderContainer}
          renderContainer={({ style, seekStyle }) => (
            <Animated.View style={[style, progressTrackStyle, { borderRadius: 8 }]}>
              <Animated.View style={[seekStyle, { borderRadius: 8 }]} />
            </Animated.View>
          )}
          renderThumb={() => <Animated.View style={[styles.sliderThumb, thumbAnimatedStyle]} />}
          renderBubble={() => null}
          theme={{
            minimumTrackTintColor: 'rgba(255,255,255,0.55)',
            maximumTrackTintColor: 'rgba(255,255,255,0.18)',
          }}
          sliderHeight={7}
          thumbWidth={12}
          onSlidingStart={() => {
            isProgressSliding.value = true
            sliderOpacity.value = 1
            sliderScale.value = withSpring(2, { damping: 10, stiffness: 200 })
            progressTrackH.value = withTiming(15, { duration: 160, easing: Easing.out(Easing.cubic) })
          }}
          onValueChange={(value) => {
            progressValue.value = value
            setDisplayPosition(value * duration)
          }}
          onSlidingComplete={async (value) => {
            isProgressSliding.value = false
            sliderOpacity.value = 0
            sliderScale.value = 1
            progressTrackH.value = withTiming(7, { duration: 220, easing: Easing.out(Easing.cubic) })
            handleSeek(value * duration)
          }}
        />
        <View style={styles.progressTimeRow}>
          <View style={styles.progressTimeCol}>
            <Text style={styles.progressTimeText}>{formatTime(currentTime)}</Text>
          </View>
          <View style={[styles.progressTimeCol, styles.progressTimeCenter]}>
            <MenuView
              title="选择播放音质"
              actions={qualityActions}
              onPressAction={({ nativeEvent }) => handleQualityChange(nativeEvent.event)}
            >
              <View style={styles.qualityBadge}>
                <SFSymbol systemName="waveform" size={12} color="rgba(255,255,255,0.7)" />
                <Text style={styles.qualityBadgeText}>{qualityDisplayName[currentQuality] || currentQuality}</Text>
              </View>
            </MenuView>
          </View>
          <View style={[styles.progressTimeCol, styles.progressTimeRight]}>
            <Text style={styles.progressTimeText}>
              -{formatTime(duration > 0 && currentTime < duration ? Math.max(1, duration - currentTime) : 0)}
            </Text>
          </View>
        </View>
      </View>

      {/* 播放控制 */}
      <View style={[styles.playControlsRow, { marginTop: 26 }]}>
        <TouchableOpacity onPress={handlePrevious} style={styles.controlButton}>
          <SFSymbol systemName="backward.fill" size={38} color="#ffffff" weight="semibold" />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            triggerPlayPress()
            handleTogglePlay()
          }}
          style={styles.playButton}
        >
          {/* 圆形按压高亮：点击时淡入并过渡消失 */}
          <Animated.View style={[styles.playPressCircle, playPressStyle]} />
          {/* 播放/暂停图标交叉过渡 */}
          <Animated.View style={[styles.playIconStack, pauseIconStyle]}>
            <SFSymbol systemName="pause.fill" size={38} color="#ffffff" weight="bold" />
          </Animated.View>
          <Animated.View style={[styles.playIconStack, playIconStyle]}>
            <SFSymbol systemName="play.fill" size={38} color="#ffffff" weight="bold" />
          </Animated.View>
        </TouchableOpacity>
        <TouchableOpacity onPress={handleNext} style={styles.controlButton}>
          <SFSymbol systemName="forward.fill" size={38} color="#ffffff" weight="semibold" />
        </TouchableOpacity>
      </View>

      {/* 音量条（可交互，控制系统音量） */}
      <View style={[styles.volumeRow, { marginTop: 20 }]}>
        <SFSymbol systemName="speaker.fill" size={12} color="#a6a6a6" />
        <View style={styles.volumeSliderWrapper}>
          <Slider
            progress={volumeValue}
            minimumValue={volumeMin}
            maximumValue={volumeMax}
            disableTapEvent={false}
            containerStyle={styles.sliderContainer}
            renderContainer={({ style, seekStyle }) => (
              <Animated.View style={[style, volumeTrackStyle, { borderRadius: 8 }]}>
                <Animated.View style={[seekStyle, { borderRadius: 8 }]} />
              </Animated.View>
            )}
            renderThumb={() => <Animated.View style={[styles.sliderThumb, volumeThumbAnimatedStyle]} />}
            renderBubble={() => null}
            theme={{
              minimumTrackTintColor: 'rgba(255,255,255,0.55)',
              maximumTrackTintColor: 'rgba(255,255,255,0.18)',
            }}
            sliderHeight={7}
            thumbWidth={12}
            onSlidingStart={() => {
              isVolumeSliding.value = true
              volumeThumbOpacity.value = 1
              volumeThumbScale.value = withSpring(2, { damping: 10, stiffness: 200 })
              volumeTrackH.value = withTiming(15, { duration: 160, easing: Easing.out(Easing.cubic) })
            }}
            onValueChange={(value) => { volumeValue.value = value }}
            onSlidingComplete={async (value) => {
              isVolumeSliding.value = false
              volumeThumbOpacity.value = 0
              volumeThumbScale.value = 1
              volumeTrackH.value = withTiming(7, { duration: 220, easing: Easing.out(Easing.cubic) })
              try {
                await VolumeManager.setVolume(value, {
                  type: 'system',
                  showUI: true,
                  playSound: false,
                })
              } catch (e) {
                // ignore
              }
            }}
          />
        </View>
        <SFSymbol systemName="speaker.wave.3.fill" size={18} color="rgba(255,255,255,0.6)" />
      </View>

      {/* 底部三按钮：歌词、AirPlay、播放列表（分享已移入右上角更多菜单；Apple Music 方形点击高亮） */}
      <View style={[styles.bottomButtonsRow, { marginTop: 22 }]}>
        <Pressable
          onPress={() => {
            showLyrics ? handleHideCompactMode() : handleShowLyrics()
          }}
          style={({ pressed }) => [styles.bottomButton, (showLyrics || pressed) && styles.bottomButtonPressed]}
        >
          <SFSymbol systemName={showLyrics ? 'quote.bubble.fill' : 'quote.bubble'} size={26} color={showLyrics ? '#ffffff' : '#d9d9d9'} weight="medium" />
        </Pressable>
        {/* AirPlay 路由按钮：原生 MPVolumeView，点击弹出系统 AirPlay 设备选择面板 */}
        <View style={styles.bottomButton}>
          <AirPlayRoutePicker color="#d9d9d9" size={26} />
        </View>
        <Pressable
          style={({ pressed }) => [styles.bottomButton, showQueue && styles.bottomButtonActive, pressed && styles.bottomButtonPressed]}
          onPress={() => { showQueue ? handleHideCompactMode() : handleShowQueue() }}
        >
          <SFSymbol systemName="list.bullet" size={26} color={showQueue ? '#ffffff' : '#d9d9d9'} weight="medium" />
          {/* 右上角播放模式角标：与悬浮胶囊 Dock 同款半透明毛玻璃（半透明白霜感 + 白色描边，无黑底无光圈） */}
          <View style={styles.queueModeBadge} pointerEvents="none">
            {isIOS26OrAbove() ? (
              <LiquidGlassBackground style={[StyleSheet.absoluteFill]} />
            ) : (
              <>
                <BlurView intensity={35} tint="light" style={StyleSheet.absoluteFill} />
                <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.25)' }]} />
              </>
            )}
            <SFSymbol
              systemName={repeatMode === MusicRepeatMode.SHUFFLE ? 'shuffle' : repeatMode === MusicRepeatMode.SINGLE ? 'repeat.1' : 'repeat'}
              size={11}
              color="#ffffff"
              weight="medium"
            />
          </View>
        </Pressable>
        {/* 睡眠定时器入口在右上角三点菜单内（本曲结束/分钟倒计时），底部不再单独放置图标 */}
      </View>
    </View>
  )

  // WellMusic v2 特色：嵌入式面板（歌词/评论/队列）
  const playList = myTrackPlayer.usePlayList()
  const EmbeddedPanels = () => (
    <Animated.View style={[styles.embeddedPanelsContainer, panelAnimatedStyle]}>
      {/* 面板1：歌词 */}
      <View style={styles.embeddedPanel}>
        <ScrollView
          style={styles.embeddedLyricScroll}
          contentContainerStyle={styles.embeddedLyricContent}
          showsVerticalScrollIndicator={false}
        >
          {lyrics && lyrics.length > 0 ? (
            lyrics.map((l: any, idx: number) => (
              <Text
                key={idx}
                style={[
                  styles.embeddedLyricLine,
                  idx === currentLyricIndex && styles.embeddedLyricLineActive,
                ]}
              >
                {l.lrc}
              </Text>
            ))
          ) : (
            <Text style={[styles.embeddedLyricLine, { color: 'rgba(255,255,255,0.5)' }]}>
              暂无歌词
            </Text>
          )}
        </ScrollView>
      </View>
      {/* 面板2：评论（WellMusic v2 AppleMusic2CommentsPanel 风格） */}
      <View style={styles.embeddedPanel}>
        <View style={styles.embeddedPanelHeader}>
          <SFSymbol systemName="quote.bubble" size={18} color="rgba(255,255,255,0.7)" />
          <Text style={styles.embeddedPanelTitle}>评论</Text>
        </View>
        <ScrollView style={styles.embeddedListScroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity
            style={styles.embeddedCommentInput}
            onPress={() => setShowComments(true)}
          >
            <SFSymbol systemName="square.and.pencil" size={16} color="rgba(255,255,255,0.5)" />
            <Text style={styles.embeddedCommentInputText}>说点什么...</Text>
          </TouchableOpacity>
          <Text style={styles.embeddedPanelHint}>点击查看全部评论</Text>
        </ScrollView>
      </View>
      {/* 面板3：队列（AM 播放器风格） */}
      <View style={styles.embeddedPanel}>
        <Text style={styles.queueScreenTitle}>播放队列 · {playList?.length || 0}</Text>
        <View style={styles.queueModeSegment}>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.QUEUE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.QUEUE)}
          >
            <SFSymbol
              systemName="repeat"
              size={19}
              color={repeatMode === MusicRepeatMode.QUEUE ? '#ffffff' : 'rgba(255,255,255,0.7)'}
            />
            <Text style={styles.queueModeText}>顺序</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SHUFFLE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SHUFFLE)}
          >
            <SFSymbol
              systemName="shuffle"
              size={20}
              color={repeatMode === MusicRepeatMode.SHUFFLE ? '#ffffff' : 'rgba(255,255,255,0.7)'}
            />
            <Text style={styles.queueModeText}>随机</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SINGLE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SINGLE)}
          >
            <SFSymbol
              systemName="repeat.1"
              size={19}
              color={repeatMode === MusicRepeatMode.SINGLE ? '#ffffff' : 'rgba(255,255,255,0.7)'}
            />
            <Text style={styles.queueModeText}>单曲</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1 }}>
          <ReorderableQueue
            data={playList || []}
            keyExtractor={(s: any) => String(s?.id ?? s?.url ?? s?.title)}
            renderContent={queueRenderContent}
            onPressSong={queueHandlePressRow}
            onReorder={queueHandleReorder}
            style={styles.queueList}
            contentContainerStyle={styles.queueListContent}
            footer={queueRenderFooter()}
          />
        </View>
      </View>
    </Animated.View>
    )

  // 主播放界面：严格按视频中的三个状态组织
  // 1. 主播放页：大封面 + 歌曲信息
  // 2. 歌词页：左上角小封面 + 横向歌曲信息 + 大歌词
  // 3. 播放队列：左上角小封面 + 队列卡片
  return (
    <View style={styles.container}>
      {/* 顶部小横条 */}
      <View pointerEvents="none" style={styles.topHomeIndicator} />
      {/* AMLL 歌词+动态背景（单 WebView，amll.html 内置背景渲染，替换原 LinearGradient 渐变背景） */}
      <AMLLLyrics
        lyrics={amllLyricData}
        currentTime={currentTime}
        isPlaying={isPlaying}
        albumArt={amllAlbumArt}
        alignPosition={(layoutSettings.lyricActiveOffset ?? 50) / 100}
        fontSize={layoutSettings.lyricFontSize ?? 22}
        inactiveFontSize={layoutSettings.lyricInactiveFontSize ?? 16}
        lineMargin={layoutSettings.lyricLineMargin ?? 16}
        lyricAreaTop={layoutSettings.lyricAreaTop ?? 236}
        lyricBottom={layoutSettings.amllLyricBottom ?? 280}
        lyricPaddingTop={layoutSettings.lyricPaddingTop ?? 0}
        lyricPaddingLeft={layoutSettings.lyricPaddingLeft ?? 0}
        lyricPaddingRight={layoutSettings.lyricPaddingRight ?? 0}
        lyricPaddingBottom={layoutSettings.lyricPaddingBottom ?? 0}
        lyricTextAlign={layoutSettings.lyricTextAlign ?? 'left'}
        backgroundMode={backgroundMode}
        fontWeight={layoutSettings.amllLyricFontWeight ?? layoutSettings.lyricFontWeight ?? 700}
        showLyrics={amllShowLyrics}
        onSeek={(time) => lockedSeek(time)}
        seekCommand={seekCommand}
        syncLocked={syncLocked}
        syncTime={syncLocked ? currentTime : undefined}
        lyricDelay={qualityAllowsLyricDelay && songLyricDelay !== 0 ? songLyricDelay : undefined}
        onReady={() => setAmllReady(true)}
      />
      {/* 左上白色柔光（对应 kumone RadialGradient white 0.12） */}
      {/* AMLL 背景已含动态效果，无需叠加渐变压暗层 */}
      {/* 静态模糊封面兜底：渲染在 AMLL WebView 之上盖住其黑屏/loading 期；
          AMLL 引擎就绪（ready 消息）后 500ms 淡出露出流动背景，全程无黑屏 */}
      {showFallbackBg && (
        <Animated.View style={[StyleSheet.absoluteFill, fallbackBgStyle]} pointerEvents="none">
          <FastImage
            source={{ uri: amllAlbumArt ?? activeTrack?.artwork ?? unknownTrackImageUri }}
            style={StyleSheet.absoluteFill}
            resizeMode={FastImage.resizeMode.cover}
          />
          <BlurView intensity={100} style={StyleSheet.absoluteFill} />
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.45)' }]} />
        </Animated.View>
      )}

      <View
        style={[
          styles.content,
          { paddingTop: top + 16, paddingBottom: bottom + 8 },
        ]}
        pointerEvents="box-none"
      >
        <View style={styles.upperArea} pointerEvents="box-none">
          {/* 大封面：视频中约 84% 屏宽，顶部约 117px */}
          <View style={styles.artworkWrapper} pointerEvents="box-none">
            <Animated.View style={coverAnimStyle} pointerEvents="box-none">
              <TouchableOpacity
                activeOpacity={0.92}
                onPress={() =>
                  showLyrics || showQueue
                    ? handleHideCompactMode()
                    : handleShowLyrics()
                }
              >
                <AnimatedFastImage
                  key={activeTrack?.artwork ?? 'placeholder'}
                  source={{
                    uri: activeTrack?.artwork ?? unknownTrackImageUri,
                  }}
                  style={[styles.albumArtwork, albumArtRoundStyle]}
                  resizeMode={FastImage.resizeMode.cover}
                />
                {/* 网易云动态封面：有 videoPlayUrl 时静音循环播放覆盖静态封面（对齐 SPlayer；歌词界面小封面同样叠加） */}
                {!showQueue && dynamicCoverUrl ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.albumArtwork,
                      albumArtRoundStyle,
                      dynamicCoverAnimStyle,
                      { position: 'absolute', top: 0, left: 0, zIndex: 2, overflow: 'hidden', backgroundColor: '#000' },
                    ]}
                  >
                    <Video
                      key={dynamicCoverUrl}
                      source={{ uri: dynamicCoverUrl }}
                      style={{ width: '100%', height: '100%' }}
                      resizeMode={Video.RESIZE_MODE_COVER}
                      shouldPlay
                      isLooping
                      isMuted
                      onLoad={() => setDynamicCoverReady(true)}
                      onError={() => setDynamicCoverReady(false)}
                    />
                  </Animated.View>
                ) : null}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {/* 弹性占位：歌曲信息行在大封面与进度条之间自动垂直居中（任意机型不叠加） */}
          <View style={styles.songInfoRowSpacer} pointerEvents="none" />
          {/* 歌曲信息：主页面居中歌名；进入歌词/队列后整行移到小封面右侧、垂直对齐小封面（Apple Music 顶部迷你条） */}
          <Animated.View
            pointerEvents="box-none"
            style={[
              styles.songInfoRow,
              compactSongInfo
                ? {
                    position: 'absolute',
                    // left 是相对 upperArea（content paddingHorizontal:24 内侧）定位，
                    // 需减去 24 才能与封面 transform 的屏幕绝对坐标（左 24）对齐，避免 24pt 空档
                    left: miniArtworkSize + 8,  // 文字与封面贴近，往左收（视觉约 8pt）
                    right: 2,                   // 星/三点靠屏幕右缘，保留安全边距
                    top: miniArtworkSize / 2 - 18,  // 歌曲信息相对封面中心上移 8pt（歌词/队列界面共用）
                    marginTop: 0,
                    justifyContent: 'space-between', // 歌名/歌手靠左紧贴封面，收藏+三点靠右端
                    zIndex: 10,
                  }
                : { marginTop: layoutSettings.amv2SongInfoRowOffset ?? 0 },
              songInfoAnimStyle,
            ]}
          >
            <Animated.View
              style={[
                styles.songInfoLeft,
                styles.songInfoLeftAnimated,
                compactSongInfo ? { maxWidth: '68%' } : showLyrics ? { maxWidth: '58%' } : { maxWidth: '72%' },
              songInfoLeftAnimStyle,
              ]}
            >
              <View style={styles.songTitleClip}>
                <Text style={[styles.songTitle, compactSongInfo && styles.songTitleCompact]} numberOfLines={1}>
                  {activeTrack?.title ?? '未知歌曲'}
                </Text>
              </View>
              <View style={styles.songMetaRow}>
                {(() => {
                  const rawArtist = activeTrack?.artist ?? '未知歌手'
                  // 大封面状态最多24字，歌词界面最多17字，超出裁切成..
                  const maxLen = showLyrics ? 17 : 24
                  const artistText = rawArtist.length > maxLen ? rawArtist.slice(0, maxLen) + '..' : rawArtist
                  const artistList = rawArtist.split(/\s*[\/、,&]\s*/).filter(a => a.trim())
                  if (artistList.length <= 1) {
                    return (
                      <TouchableOpacity onPress={() => handleArtistPress()} activeOpacity={0.6} style={{ flexShrink: 0, minWidth: 0 }}>
                        <Text style={[styles.songArtist, compactSongInfo && styles.songArtistCompact]} numberOfLines={1}>
                          {artistText}
                        </Text>
                      </TouchableOpacity>
                    )
                  }
                  const artistActions = artistList.map(name => ({
                    id: name,
                    title: name,
                    image: 'person.crop.circle',
                  }))
                  return (
                    <MenuView
                      title="选择歌手"
                      onPressAction={({ nativeEvent }) => handleArtistPress(nativeEvent.event)}
                      actions={artistActions}
                    >
                      <Text style={[styles.songArtist, { flexShrink: 0, minWidth: 0 }, compactSongInfo && styles.songArtistCompact]} numberOfLines={1}>
                        {artistText}
                      </Text>
                    </MenuView>
                  )
                })()}
                <Text style={[styles.songAlbumSeparator, compactSongInfo && styles.songAlbumSeparatorCompact]}> — </Text>
                <Text style={[styles.songAlbum, compactSongInfo && styles.songAlbumCompact]} numberOfLines={1}>
                  {activeTrack?.album || (currentMusic as any)?.album || '未知专辑'}
                </Text>
              </View>
            </Animated.View>

            <View style={styles.songInfoRight}>
              <TouchableOpacity
                onPress={toggleFavorite}
                style={[styles.headerIconButton, { backgroundColor: 'transparent' }]}
                activeOpacity={1}
              >
                <SFSymbol
                  systemName={isFavorite ? 'star.fill' : 'star'}
                  size={24}
                  color="#ffffff"
                />
              </TouchableOpacity>
              <MenuView
                title="歌曲选项"
                onPressAction={({ nativeEvent }) =>
                  handleMenuPress(nativeEvent.event)
                }
                actions={menuActions}
              >
                <TouchableOpacity style={[styles.headerIconButton, { backgroundColor: 'transparent' }]} activeOpacity={1}>
                  <SFSymbol
                    systemName="ellipsis"
                    size={24}
                    color="#ffffff"
                  />
                </TouchableOpacity>
              </MenuView>
            </View>
          </Animated.View>
          <View style={styles.songInfoRowSpacer} pointerEvents="none" />

          {/* 歌词：直接占据上半部内容，不再做旧版“从进度条上方弹出”的错误定位 */}
          {/* 歌词：已由 AMLL WebView 渲染（动态背景+歌词一体，见上方 AMLLLyrics） */}
          {/* 原 FlatList / KaraokeLine 原生歌词移除，避免与 AMLL 歌词重叠 */}
          {showLyrics && (
            <Animated.View
              style={[styles.lyricsArea, { top: layoutSettings.lyricAreaTop }, compactContentAnimStyle]}
              pointerEvents="none"
            >
            </Animated.View>
          )}

          {/* 播放队列：共享组件，和AM播放器完全一致 */}
          {showQueue && (
            <Animated.View
              style={[styles.queueContent, compactContentAnimStyle]}
            >
              <PlaylistQueue
                playList={playList}
                currentMusic={currentMusic}
                repeatMode={repeatMode}
                titleFontSize={layoutSettings.queueTitleFontSize ?? 16}
                titleMarginTop={layoutSettings.queueTitleMarginTop ?? 0}
                amStyle
                onBackToPlayer={handleHideCompactMode}
                onPlaySong={(song: any) => {
                  myTrackPlayer.play(song, true)
                  handleHideCompactMode()
                }}
              />
            </Animated.View>
          )}
        </View>

        {BottomControls()}
      </View>

      {showComments && (() => {
                        setCommentParams({
                            songId: currentMusic?.id || currentMusic?.songmid || activeTrack?.id || '',
                            songTitle: currentMusic?.title || activeTrack?.title || '',
                            songArtist: currentMusic?.artist || activeTrack?.artist || '',
                            songCover: currentMusic?.artwork || activeTrack?.artwork || '',
                            platform: currentMusic?.platform || currentMusic?.source || activeTrack?.platform || activeTrack?.source || 'qq',
                        })
                        router.push('/(modals)/comments')
                        setShowComments(false)
                        return null
                    })()}
      <DownloadQualityModal
        visible={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
        song={(currentMusic || activeTrack) as any}
      />
      <ArtistSelectorModal
        visible={showArtistSelector}
        artists={artistOptions}
        onSelect={(artist) => {
          const songId = currentMusic?.songmid || currentMusic?.id || activeTrack?.songmid || activeTrack?.id || ''
          let songPlatform = currentMusic?.platform || currentMusic?.source || activeTrack?.platform || activeTrack?.source || 'qq'
          const idStr = String(songId)
          if (idStr.startsWith('netease_') || idStr.startsWith('wy_')) songPlatform = 'netease'
          else if (idStr.startsWith('kugou_') || idStr.startsWith('kg_')) songPlatform = 'kugou'
          else if (idStr.startsWith('kuwo_') || idStr.startsWith('kw_')) songPlatform = 'kuwo'
          navigateToArtist(artist.name, songPlatform)
        }}
        onClose={() => setShowArtistSelector(false)}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
  },
  // WellMusic v2 特色：上方可动画区域
  upperArea: {
    flex: 1,
  },
  // WellMusic v2 特色：歌词区域
  lyricsArea: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 236,
    bottom: 0,
    zIndex: 3,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
  // 大专辑封面（居中，更宽）
  artworkWrapper: {
    alignItems: 'center',
    marginTop: 40,
  },
  albumArtwork: {
    width: SCREEN_WIDTH * 0.86,
    height: SCREEN_WIDTH * 0.86,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.5,
    shadowRadius: 32,
    elevation: 16,
  },
  topHomeIndicator: {
    position: 'absolute',
    top: 60,
    alignSelf: 'center',
    width: 45,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
    zIndex: 10,
  },
  coverBottomBar: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    width: 64,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
  // 歌曲信息行上下弹性占位：让信息行在大封面与进度条之间自动垂直居中
  songInfoRowSpacer: {
    flex: 1,
  },
  // 歌曲信息行：左歌名+歌手，右收藏+更多
  songInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  songInfoLeft: {
    flex: 1,
    minWidth: 0,
    maxWidth: '70%',
    paddingRight: 8,
  },
  songInfoLeftAnimated: {
    minWidth: 0,
  },
  songTitleClip: {
    overflow: 'hidden',
    width: '100%',
    maxWidth: '100%',
  },

  songInfoRight: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12, // 与文字保持固定间距，不顶到屏幕右缘
  },
  headerIconButton: {
    padding: 4,
    marginLeft: 2,
    backgroundColor: 'transparent',
    shadowColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  songTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
    textAlign: 'left',
  },
  songMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    flexWrap: 'nowrap',
    minWidth: 0,
    overflow: 'hidden',
  },
  songArtist: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
    flexShrink: 1,
    minWidth: 0,
  },
  songAlbumSeparator: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.4)',
  },
  songAlbum: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.5)',
    flexShrink: 3,
    minWidth: 0,
  },
  // 歌词/队列模式下文字与封面同步：与大封面状态字号一致
  songTitleCompact: {
    fontSize: 18,
    fontWeight: '600',
  },
  songArtistCompact: {
    fontSize: 14,
  },
  songAlbumSeparatorCompact: {
    fontSize: 14,
  },
  songAlbumCompact: {
    fontSize: 14,
  },
  // 底部控制
  bottomControls: {
    marginTop: 10,
  },
  progressSection: {
    marginBottom: 12,
  },
  sliderContainer: {
    height: 7,
    borderRadius: 8,
  },
  sliderThumb: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  progressTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  progressTimeCol: {
    flex: 1,
  },
  progressTimeCenter: {
    alignItems: 'center',
  },
  progressTimeRight: {
    alignItems: 'flex-end',
  },
  progressTimeText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 8,
    marginTop: 8,
    gap: 5,
  },
  qualityBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.9)',
  },
  playControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 44,
    marginTop: 4,
  },
  controlButton: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playPressCircle: {
    position: 'absolute',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.32)',
  },
  playIconStack: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  volumeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
  },
  volumeSliderWrapper: {
    flex: 1,
    marginHorizontal: 12,
  },
  volumeSliderThumb: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'transparent',
  },
  bottomButtonsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 20,
  },
  bottomButton: {
    padding: 10,
    borderRadius: 12,
    position: 'relative',
  },
  /* 待播清单按钮右上角播放模式角标：半透明毛玻璃（白色半透明描边，无黑底无光圈） */
  queueModeBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 18,
    height: 18,
    borderRadius: 9,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  bottomButtonPressed: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  bottomButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  // 视频版播放队列：内容直接嵌入播放器上半区
  queueContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 70,
    bottom: 0,
    zIndex: 4,
  },
  queueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  queueScreenTitle: {
    fontSize: 24,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.25,
  },
  queueSendButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueModeSegment: {
    flexDirection: 'row',
    height: 60,
    borderRadius: 30,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    marginBottom: 16,
  },
  queueModeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.10)',
  },
  queueModeItemActive: {
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  queueModeText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
  },
  queueListContent: {
    paddingBottom: 210,
    gap: 12,
  },
  queueTrailingButton: {
    width: 34,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 歌词界面
  lyricsContainer: {
    flex: 1,
  },
  lyricsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  lyricsHeaderArtwork: {
    width: 52,
    height: 52,
    borderRadius: 10,
    overflow: 'hidden',
  },
  headerArtworkImage: {
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  lyricsHeaderCenter: {
    flex: 1,
    alignItems: 'flex-start',
    marginHorizontal: 14,
  },
  lyricsHeaderTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#fff',
  },
  headerMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  lyricsHeaderArtist: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  headerMetaSeparator: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  lyricsHeaderAlbum: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.55)',
  },
  lyricsHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerIconButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lyricsScrollContent: {
    alignItems: 'flex-start',
  },
  lyricLine: {
    fontWeight: '500',
    marginVertical: 20,
    lineHeight: 40,
    textAlign: 'left',
    letterSpacing: -0.45,
  },
  lyricLineActive: {
    fontSize: 41,
    fontWeight: '500',
    lineHeight: 50,
    marginVertical: 20,
    textAlign: 'left',
    letterSpacing: -0.65,
    color: '#fff',
  },
  // WellMusic v2 特色：翻译歌词
  translationLine: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 20,
    fontWeight: '500',
    marginTop: -12,
    marginBottom: 20,
    lineHeight: 28,
  },
  // WellMusic v2 特色：嵌入式面板
  embeddedPanelsWrapper: {
    height: 200,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  embeddedPanelsContainer: {
    flexDirection: 'row',
    width: SCREEN_WIDTH * 3 - 80,
    height: '100%',
  },
  embeddedPanel: {
    width: SCREEN_WIDTH - 80,
    height: '100%',
    padding: 16,
  },
  embeddedLyricScroll: {
    flex: 1,
  },
  embeddedLyricContent: {
    paddingBottom: 20,
  },
  embeddedLyricLine: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.5)',
    marginVertical: 8,
    lineHeight: 24,
  },
  embeddedLyricLineActive: {
    color: '#fff',
    fontWeight: '500',
    fontSize: 18,
  },
  embeddedPanelPlaceholder: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 80,
    fontSize: 16,
  },
  // WellMusic v2 特色：评论/队列面板头部
  embeddedPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  embeddedPanelTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 16,
    fontWeight: '500',
  },
  embeddedListScroll: {
    flex: 1,
  },
  // WellMusic v2 特色：评论输入框
  embeddedCommentInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  embeddedCommentInputText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 14,
  },
  embeddedPanelHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 20,
  },
  // WellMusic v2 特色：队列项
  embeddedQueueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  embeddedQueueIndex: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 14,
    width: 24,
    textAlign: 'center',
  },
  embeddedQueueInfo: {
    flex: 1,
  },
  embeddedQueueTitle: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    fontWeight: '500',
  },
  embeddedQueueTitleActive: {
    color: '#ff453a',
  },
  embeddedQueueArtist: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    marginTop: 2,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 10,
    gap: 10,
  },
  queueItemActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  queueItemArtwork: {
    width: 44,
    height: 44,
    borderRadius: 10,
  },
  queueItemInfo: {
    flex: 1,
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  queueItemTitle: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 2,
  },
  queueItemTitleActive: {
    color: '#fff',
  },
  queueItemArtist: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  queueEmpty: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 16,
  },
  sfCtrlIcon: {
    fontFamily: 'system',
    fontSize: 34,
    color: '#fff',
  },
  sfPlayIcon: {
    fontFamily: 'system',
    fontSize: 44,
    color: '#fff',
  },
  sfVolumeIcon: {
    fontFamily: 'system',
    fontSize: 17,
    color: 'rgba(255,255,255,0.6)',
  },
  queueScreenTitle: {
    fontSize: 22,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.25,
  },
  queueModeSegment: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    marginBottom: 16,
  },
  queueModeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.10)',
  },
  queueModeItemActive: {
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  queueModeText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
  },
  queueList: {
    flex: 1,
  },
  queueListContent: {
    paddingBottom: 210,
  },
  queueEmpty: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 15,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 10,
    gap: 10,
  },
  queueItemActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  queueItemDragging: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  queueItemArtwork: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  queueItemInfo: {
    flex: 1,
    flexShrink: 3,
    alignItems: 'flex-start',
  },
  queueItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 3,
  },
  queueItemTitleActive: {
    color: '#fff',
  },
  queueItemArtist: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  queueTrailingButton: {
    width: 30,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
