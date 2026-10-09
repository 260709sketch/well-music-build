import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import AsyncStorage from '@react-native-async-storage/async-storage'

// AMLL 背景模式：
//   flowing       = 流动背景（默认，原生叠加层保留）
//   static        = 静态背景（渲染一帧后暂停）
//   appleMusicDynamic = 照搬 Apple Music V2 播放器背景的动态预设：隐藏原生叠加层，
//                   只显示 AMLL 引擎自带 #bg，并把内部参数调到该预设档（fps18 / renderScale0.36 / flowSpeed0.72）
//   appleMusicStatic  = 同上的 Apple Music 预设静态背景（AMLL #bg 渲染一帧后暂停）
export type AMLLBackgroundMode = 'flowing' | 'static' | 'appleMusicDynamic' | 'appleMusicStatic'
// Apple Music 预设档：隐藏原生叠加层，只留 AMLL #bg
export const isAppleMusicBackground = (m: AMLLBackgroundMode) => m === 'appleMusicDynamic' || m === 'appleMusicStatic'
// 静态档（含 Apple Music 预设静态）
export const isStaticBackground = (m: AMLLBackgroundMode) => m === 'static' || m === 'appleMusicStatic'
// AMLL 歌词字体：default=默认字体，heiti=黑体
export type AMLLLyricFont = 'default' | 'heiti'

// AMLL 歌词渲染性能选项（用于调节换句/滚动流畅度，官方建议降合成层压力）
export interface AMLLLyricPerf {
	// 歌词渲染帧率：80=锁死80FPS；0=跟随屏幕刷新（引擎不限帧）
	fps: number
	// 非活跃行模糊（最重的合成层压力源）
	blur: boolean
	// 非活跃行缩放动画
	scale: boolean
	// 滚动弹性动画（spring）
	spring: boolean
	// 隐藏已播放行
	hidePassed: boolean
}
// 默认=现状（引擎默认开 blur/scale/spring，帧率按此前设定锁 80）
export const DEFAULT_LYRIC_PERF: AMLLLyricPerf = {
	fps: 80,
	blur: true,
	scale: true,
	spring: true,
	hidePassed: false,
}

interface AMLLSettingsState {
	backgroundMode: AMLLBackgroundMode
	setBackgroundMode: (mode: AMLLBackgroundMode) => void
	lyricFont: AMLLLyricFont
	setLyricFont: (font: AMLLLyricFont) => void
	heitiFontWeight: number
	setHeitiFontWeight: (weight: number) => void
	// 歌词字重（设置里可调）：400=细体 / 600=中等（默认） / 700=加粗
	lyricFontWeight: number
	setLyricFontWeight: (weight: number) => void
	dynamicCover: boolean
	setDynamicCover: (enabled: boolean) => void
	lyricPerf: AMLLLyricPerf
	setLyricPerf: (perf: Partial<AMLLLyricPerf>) => void
}

export const useAMLLSettingsStore = create<AMLLSettingsState>()(
	persist(
		(set) => ({
			backgroundMode: 'flowing',
			setBackgroundMode: (mode) => set({ backgroundMode: mode }),
			lyricFont: 'default',
			setLyricFont: (font) => set({ lyricFont: font }),
			heitiFontWeight: 700,
			setHeitiFontWeight: (weight) => set({ heitiFontWeight: weight }),
			lyricFontWeight: 600,
			setLyricFontWeight: (weight) => set({ lyricFontWeight: weight }),
			dynamicCover: true,
			setDynamicCover: (enabled) => set({ dynamicCover: enabled }),
			lyricPerf: DEFAULT_LYRIC_PERF,
			setLyricPerf: (perf) => set((s) => ({ lyricPerf: { ...s.lyricPerf, ...perf } })),
		}),
		{
			name: 'amll-settings-storage',
			storage: createJSONStorage(() => AsyncStorage),
			migrate: (persistedState: any) => {
				if (persistedState && persistedState.backgroundMode) {
					const map: Record<string, AMLLBackgroundMode> = {
						'sollinDynamic': 'appleMusicDynamic',
						'sollinStatic': 'appleMusicStatic',
					}
					if (map[persistedState.backgroundMode]) {
						return { ...persistedState, backgroundMode: map[persistedState.backgroundMode] }
					}
				}
				return persistedState
			},
		},
	),
)
