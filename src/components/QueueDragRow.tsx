import React, { useMemo } from 'react'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated'

export type QueueDragRowProps = {
  index: number
  total: number
  /** 单行高度 + 分隔高度（拖拽位移的步长） */
  step: number
  draggingIndex: SharedValue<number>
  dragY: SharedValue<number>
  /** 列表当前滚动偏移（自动滚动检测用） */
  listScrollY: SharedValue<number>
  /** 列表容器可视高度 */
  viewportH: SharedValue<number>
  /** 自动滚动方向：0 停、-1 上、1 下 */
  autoScrollDir: SharedValue<number>
  onReorder: (from: number, to: number) => void
  onAutoScroll: (dir: number) => void
  /** 拖拽激活回调：告知父组件被拖行的 index（浮层由父组件按 index 构造，避免跨线程传 React 元素） */
  onDragStart?: (index: number) => void
  /** 拖拽结束回调：移除浮层 */
  onDragEnd?: () => void
  children: React.ReactNode
}

/** 拖拽行边缘自动滚动触发区（pt） */
const EDGE = 60
/** 触发边缘滚动前必须拖离原位的距离（pt），避免长按抖动误触发 */
const DRAG_ACTIVE_THRESHOLD = 8
/** 让位弹簧参数：响应快，避免拖拽快速移动时其他行动画滞后造成行重叠 */
const YIELD_SPRING = { damping: 28, stiffness: 520, mass: 0.6 }

/**
 * 可拖拽队列行：长按 220ms 激活拖动。
 * 拖拽行内容复制到父组件渲染的浮层（绝对定位、跟随手指视口坐标移动），
 * 原行隐藏保留占位；其他行按目标槽位弹簧让位；接近容器边缘时自动滚动；
 * 松手后按视口位移换算目标下标。
 * 浮层不依赖滚动补偿，列表滚动时行钉在手指位置，不会被滚动带出、不会重叠、不会被裁剪。
 */
export const QueueDragRow = React.memo((props: QueueDragRowProps) => {
  const {
    index, total, step, draggingIndex, dragY,
    listScrollY, viewportH, autoScrollDir,
    onReorder, onAutoScroll, onDragStart, onDragEnd, children,
  } = props

  /** 长按开始时的滚动偏移，用于滚动补偿 */
  const dragStartScrollY = useSharedValue(0)
  /** 长按开始时行在视口内的位置（index*step - scrollY0），用于稳定的边缘判定 */
  const dragStartViewportY = useSharedValue(0)

  const animatedStyle = useAnimatedStyle(() => {
    const di = draggingIndex.value
    if (di === -1) {
      return { transform: [{ translateY: 0 }], opacity: 1 }
    }
    if (di === index) {
      // 拖拽行已复制到上方浮层，原行隐藏保留占位（其他行让位插队）
      return { transform: [{ translateY: 0 }], opacity: 0 }
    }
    // dragY 语义 = 拖拽行浮层当前的视口位置（clamp 在 [0, viewportH-step]），
    // 让位目标槽位 = 浮层位置换算，与浮层显示、松手落位完全一致，无累积误差
    const target = Math.max(0, Math.min(total - 1, Math.round(dragY.value / step)))
    let dy = 0
    if (index > di && index <= target) dy = -step
    else if (index < di && index >= target) dy = step
    return {
      transform: [{ translateY: withSpring(dy, YIELD_SPRING) }, { scale: 1 }],
      opacity: 1,
    }
  })

  // 手势实例必须用 useMemo 缓存：父组件重渲染（如浮层出现）会重建 renderItem，
  // 若每次渲染新建 Gesture 实例，RNGH 会重置正在拖拽的手势，导致拖动中断/不让位。
  const pan = useMemo(() => Gesture.Pan()
    .activateAfterLongPress(220)
    .onStart(() => {
      draggingIndex.value = index
      dragStartScrollY.value = listScrollY.value
      dragStartViewportY.value = index * step - listScrollY.value
      // 浮层初始位置 = 长按开始时行的视口位置；之后 onUpdate 持续更新为 clamp 后的视口位置
      dragY.value = dragStartViewportY.value
      if (onDragStart) runOnJS(onDragStart)(index)
    })
    .onUpdate((e) => {
      // 浮层钉在列表视口内（受限在可视区），配合边缘自动滚动让列表让位
      const maxViewY = Math.max(0, viewportH.value - step)
      const rawViewY = dragStartViewportY.value + e.translationY
      dragY.value = Math.max(0, Math.min(maxViewY, rawViewY))
      // 只有真正拖离原位后才响应边缘自动滚动，避免长按抖动误触发乱滚
      if (Math.abs(e.translationY) < DRAG_ACTIVE_THRESHOLD) {
        if (autoScrollDir.value !== 0) {
          autoScrollDir.value = 0
          runOnJS(onAutoScroll)(0)
        }
        return
      }
      // 用"长按起点视口位置 + 手指位移"判定边缘，滚动不干扰判定
      const fingerViewportY = dragStartViewportY.value + e.translationY
      let dir = 0
      if (fingerViewportY < EDGE) dir = -1
      else if (fingerViewportY + step > viewportH.value - EDGE) dir = 1
      if (dir !== autoScrollDir.value) {
        autoScrollDir.value = dir
        runOnJS(onAutoScroll)(dir)
      }
    })
    .onEnd(() => {
      // 落位槽位 = 浮层视口位置换算，与浮层实际显示位置、让位目标完全一致
      const to = Math.max(0, Math.min(total - 1, Math.round(dragY.value / step)))
      runOnJS(onReorder)(index, to)
    })
    .onFinalize(() => {
      draggingIndex.value = -1
      dragY.value = 0
      if (autoScrollDir.value !== 0) {
        autoScrollDir.value = 0
        runOnJS(onAutoScroll)(0)
      }
      if (onDragEnd) runOnJS(onDragEnd)()
    }), [
    index, total, step,
    draggingIndex, dragY, listScrollY, viewportH, autoScrollDir,
    onReorder, onAutoScroll, onDragStart, onDragEnd,
  ])

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={animatedStyle}>{children}</Animated.View>
    </GestureDetector>
  )
})
