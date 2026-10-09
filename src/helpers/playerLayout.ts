import AsyncStorage from '@react-native-async-storage/async-storage'

const STORAGE_KEY = 'player_layout_settings'

// 默认值（当前改好的位置）
export const DEFAULT_LAYOUT = {
  miniArtworkTranslateX: -520,
  miniArtworkTranslateY: -620,
  miniSongInfoTranslateX: 90,
  miniSongInfoTranslateY: -400,
  bottomControlsMarginTop: 10,
  playControlsRowMarginTop: 4,
  volumeRowMarginTop: 2,
  bottomButtonsRowMarginTop: 20,
}

export type LayoutSettings = typeof DEFAULT_LAYOUT

export async function loadLayoutSettings(): Promise<LayoutSettings> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return { ...DEFAULT_LAYOUT, ...parsed }
    }
  } catch (e) {
    console.warn('加载播放器布局设置失败', e)
  }
  return { ...DEFAULT_LAYOUT }
}

export async function saveLayoutSettings(settings: Partial<LayoutSettings>): Promise<void> {
  try {
    const current = await loadLayoutSettings()
    const merged = { ...current, ...settings }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(merged))
  } catch (e) {
    console.warn('保存播放器布局设置失败', e)
  }
}

export async function resetLayoutSettings(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch (e) {
    console.warn('重置播放器布局设置失败', e)
  }
}
