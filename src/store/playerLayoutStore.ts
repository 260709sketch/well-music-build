// 播放器布局参数全局store
import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

export interface LayoutSettings {
  // WellMusic - 小封面位置
  miniArtworkTranslateX: number
  miniArtworkTranslateY: number
  // WellMusic - 歌曲信息位置
  miniSongInfoTranslateX: number
  miniSongInfoTranslateY: number
  // WellMusic - 底部控制区
  bottomControlsMarginTop: number
  playControlsMarginTop: number
  volumeRowMarginTop: number
  bottomButtonsRowMarginTop: number
  qualityBadgeMarginTop: number
  qualityBadgeTranslateX: number
  // iOS26 - 底部控制区
  ios26BottomControlsMarginTop: number
  ios26PlayControlsMarginTop: number
  ios26VolumeRowMarginTop: number
  ios26QualityBadgeMarginTop: number
  // 歌词位置
  lyricAreaTop: number
  lyricTextAlign: 'left' | 'center' | 'right'
  // 当前播放歌词在可视区域的位置（百分比 0-100）
  lyricActiveOffset: number
  // 歌词顶部空白
  lyricPaddingTop: number
  // 歌词左边距
  lyricPaddingLeft: number
  // 歌词右边距
  lyricPaddingRight: number
  // 歌词底部空白
  lyricPaddingBottom: number
  // 歌词上下边距（行间距）
  lyricLineMargin: number
  // 歌词字重
  lyricFontWeight: number
  // AMLL 歌词底部位置（从屏幕底部往上计算，和 lyricAreaTop 对应）
  amllLyricBottom: number
  // AMLL 歌词字重（专门控制 AMLL WebView 内的字重）
  amllLyricFontWeight: number
  // AM风格歌词大小
  lyricFontSize: number
  // 非当前播放（未激活）歌词大小
  lyricInactiveFontSize: number
  // AM风格歌词翻译字号
  lyricTranslationFontSize: number
  // AM风格歌曲信息区域上边距
  songInfoRowMarginTop: number
  // AMV2 歌曲信息行弹性居中后的微调偏移（正值向下，默认 0 = 封面与进度条正中间）
  amv2SongInfoRowOffset: number
  // 歌词界面小封面大小
  lyricMiniArtworkSize: number
  // AM风格播放队列顶部位置
  queueContentTop: number
  // AM风格播放队列标题字号
  queueTitleFontSize: number
  // AM风格播放队列标题上下位置
  queueTitleMarginTop: number
}

export const DEFAULT_LAYOUT: LayoutSettings = {
  // WellMusic 默认值（用户调校最佳位置）
  miniArtworkTranslateX: -800,
  miniArtworkTranslateY: -900,
  miniSongInfoTranslateX: 64,
  miniSongInfoTranslateY: -395,
  bottomControlsMarginTop: 16,
  playControlsMarginTop: 16,
  volumeRowMarginTop: 16,
  bottomButtonsRowMarginTop: 30,
  qualityBadgeMarginTop: 25,
  qualityBadgeTranslateX: 0,
  // iOS26 默认值
  ios26BottomControlsMarginTop: 28,
  ios26PlayControlsMarginTop: 32,
  ios26VolumeRowMarginTop: 19,
  ios26QualityBadgeMarginTop: 0,
  // 歌词默认值（用户调校最佳位置）
  lyricAreaTop: 135,
  lyricTextAlign: 'left',
  lyricActiveOffset: 42,
  lyricPaddingTop: 25,
  lyricPaddingLeft: 0,
  lyricPaddingRight: 0,
  lyricPaddingBottom: 0,
  lyricLineMargin: 15,
  lyricFontWeight: 700,
  amllLyricBottom: 320,
  amllLyricFontWeight: 700,
  lyricFontSize: 29,
  lyricInactiveFontSize: 26,
  lyricTranslationFontSize: 15,
  songInfoRowMarginTop: 56,
  amv2SongInfoRowOffset: 16,
  lyricMiniArtworkSize: 60,
  queueContentTop: 70,
  queueTitleFontSize: 16,
  queueTitleMarginTop: 0,
}

interface LayoutState {
  settings: LayoutSettings
  updateSettings: (settings: Partial<LayoutSettings>) => void
  resetSettings: () => void
}

export const useLayoutStore = create<LayoutState>()(
  persist(
    (set) => ({
      settings: DEFAULT_LAYOUT,
      updateSettings: (newSettings) =>
        set((state) => ({
          settings: { ...state.settings, ...newSettings },
        })),
      resetSettings: () => set({ settings: DEFAULT_LAYOUT }),
    }),
    {
      name: 'player-layout-storage',
      version: 3,
      migrate: (persisted: any) => {
        // v3：AMV2 歌曲信息行居中基线整体下移，强制重置旧持久化值
        if (persisted && typeof persisted === 'object' && persisted.settings) {
          const s = { ...persisted.settings }
          s.songInfoRowMarginTop = DEFAULT_LAYOUT.songInfoRowMarginTop
          s.playControlsMarginTop = DEFAULT_LAYOUT.playControlsMarginTop
          s.volumeRowMarginTop = DEFAULT_LAYOUT.volumeRowMarginTop
          s.amv2SongInfoRowOffset = DEFAULT_LAYOUT.amv2SongInfoRowOffset
          return { ...persisted, settings: s }
        }
        return persisted
      },
      storage: createJSONStorage(() => AsyncStorage),
    },
  ),
)
