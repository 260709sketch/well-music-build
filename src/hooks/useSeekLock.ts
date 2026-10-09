import { useState, useCallback, useRef } from 'react'
import TrackPlayer from 'react-native-track-player'

/**
 * SPlayer 式 seek 锁：
 * - seek 开始立即把显示时间锁定为目标时间（歌词/进度条立即跟手，不跳回旧位置）
 * - 底层 seek 完成后轮询播放器真实位置，确认真正追上目标后再保持一个
 *   progress 更新周期，然后释放锁平滑切回真实时间
 * - 最多锁 3.5s 超时强制释放，避免异常卡死
 */
export function useSeekLock(realPosition: number) {
  const [lockedPosition, setLockedPosition] = useState<number | null>(null)
  const lockingRef = useRef(false)

  const seek = useCallback(async (targetTime: number) => {
    if (!Number.isFinite(targetTime) || targetTime < 0) return
    // 如果已有锁，先释放再重新锁定（连续 seek）
    lockingRef.current = true
    setLockedPosition(targetTime)

    try {
      await TrackPlayer.seekTo(targetTime)
    } catch {}

    // 轮询等待真实位置追上目标（原生 seek 真正生效）
    const start = Date.now()
    while (Date.now() - start < 3000) {
      await new Promise((r) => setTimeout(r, 100))
      try {
        const real = await TrackPlayer.getPosition()
        // 向前 seek：real 跳到 target 后继续前进（real >= target-1）
        // 向后 seek：real ≈ target（abs < 1）
        if (real >= targetTime - 1 || Math.abs(real - targetTime) < 1) {
          // 再等一个 progress 更新周期(200ms)+余量，确保 useProgress hook 值也同步，
          // 避免释放锁瞬间切回旧值造成跳回
          await new Promise((r) => setTimeout(r, 280))
          lockingRef.current = false
          setLockedPosition(null)
          return
        }
      } catch {}
    }
    // 超时强制释放
    lockingRef.current = false
    setLockedPosition(null)
  }, [])

  const displayPosition = lockedPosition !== null ? lockedPosition : realPosition

  // 拖动时只更新显示位置，不触发原生 seek（避免频繁 seek）
  const setDisplayPosition = useCallback((time: number) => {
    if (!Number.isFinite(time) || time < 0) return
    lockingRef.current = true
    setLockedPosition(time)
  }, [])

  // 拖动结束后释放显示锁，让真实位置接管（原生 seek 由调用方处理）
  const releaseDisplay = useCallback(() => {
    lockingRef.current = false
    setLockedPosition(null)
  }, [])

  // 响应式锁定状态：拖动/seek 期间为 true，供歌词层判断「推送锁定目标」还是「推送真实位置」
  const locked = lockedPosition !== null

  return { displayPosition, seek, setDisplayPosition, releaseDisplay, locked, isLocked: () => lockingRef.current }
}
