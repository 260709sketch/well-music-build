import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  ScrollView,
  StyleProp,
  View,
  ViewStyle,
} from 'react-native'

type RowRenderer<T> = (item: T, index: number, active: boolean) => React.ReactNode

interface Props<T> {
  /** 队列数据 */
  data: T[]
  /** 完整行距（含行内上下留白与行间距） */
  rowHeight: number
  /** 稳定 key */
  getKey: (item: T) => string
  /** 行渲染：active=true 表示当前被拖拽 */
  renderRow: RowRenderer<T>
  /** 松手落位，返回新顺序 */
  onReorder: (next: T[]) => void
  /** 轻触行（非拖拽） */
  onPressRow?: (item: T) => void
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  renderFooter?: () => React.ReactNode
  autoscrollAreaSize?: number
  longPressMs?: number
  showsVerticalScrollIndicator?: boolean
}

/**
 * 极简可靠的长按拖拽排序列表：
 * - 只用 RN 内置 PanResponder + Animated，零第三方依赖、零 Reanimated、无跨线程读取
 * - 行按下立即接管手势：轻触=点击，长按=拖拽，滑动=跟手滚动（列表滚动由本组件自管）
 * - 拖拽中：浮层跟手、目标行实时让位（弹簧动画）、边缘自动滚动（回到中间即停）
 * - 行位置由「数组顺序 × rowHeight」决定，与滚动偏移完全解耦
 */
export default function SimpleDragSortList<T = any>({
  data,
  rowHeight,
  getKey,
  renderRow,
  onReorder,
  onPressRow,
  style,
  contentContainerStyle,
  renderFooter,
  autoscrollAreaSize = 60,
  longPressMs = 200,
  showsVerticalScrollIndicator = false,
}: Props<T>) {
  const scrollRef = useRef<ScrollView>(null)
  const [order, setOrder] = useState<T[]>(data)
  const [activeIndex, setActiveIndex] = useState(-1)
  const orderRef = useRef<T[]>(data)
  const dragIndexRef = useRef(-1) // 按下时所在行 index
  const dragModeRef = useRef(false) // 长按已激活，等待 PanResponder 接管
  const grantedRef = useRef(false) // 已真正进入拖拽
  const scrollingRef = useRef(false) // 跟手滚动中
  const touchLocY = useRef(0) // 按下时手指在行内的 y
  const dragBaseTop = useRef(0) // 激活拖拽时浮层顶部（内容坐标），此后 +dy
  const floatTopRef = useRef(0) // 浮层顶部（内容坐标）
  const scrollStartPageY = useRef(0) // 跟手滚动起点（屏幕 y）
  const scrollStartOffset = useRef(0) // 跟手滚动起点 offset
  const scrollOffset = useRef(0)
  const viewportH = useRef(0)
  const contentH = useRef(0)
  const lastIndexMap = useRef(new Map<string, number>())
  const transMap = useRef(new Map<string, Animated.Value>())
  const longPressTimer = useRef<any>(null)
  const scrollTimer = useRef<any>(null)
  const floatY = useRef(new Animated.Value(0)).current

  // 外部数据变化（非拖拽时）同步到本地顺序
  useEffect(() => {
    if (!dragModeRef.current) {
      orderRef.current = data
      setOrder(data)
    }
  }, [data])

  const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v))

  const clearLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }

  const stopAutoScroll = () => {
    if (scrollTimer.current) {
      clearInterval(scrollTimer.current)
      scrollTimer.current = null
    }
  }

  const swapToTarget = useCallback((contentY: number) => {
    const arr = orderRef.current
    const src = dragIndexRef.current
    const tgt = clamp(Math.floor((contentY + rowHeight / 2) / rowHeight), 0, arr.length - 1)
    if (src < 0 || tgt >= arr.length || tgt === src) return
    const next = arr.slice()
    const tmp = next[tgt]
    next[tgt] = next[src]
    next[src] = tmp
    orderRef.current = next
    dragIndexRef.current = tgt
    setOrder(next)
  }, [rowHeight])

  const endDrag = useCallback((commit: boolean) => {
    stopAutoScroll()
    clearLongPress()
    const hadDrag = dragModeRef.current || grantedRef.current
    dragModeRef.current = false
    grantedRef.current = false
    scrollingRef.current = false
    dragIndexRef.current = -1
    setActiveIndex(-1)
    if (commit && hadDrag) {
      const next = orderRef.current.slice()
      if (next.length === data.length) onReorder(next)
    }
  }, [data.length, onReorder])

  // 拖拽中边缘自动滚动：每 tick 重新判定，回到中间即停
  const tickAutoScroll = useCallback(() => {
    if (!dragModeRef.current || !grantedRef.current) return
    const vpTop = floatTopRef.current - scrollOffset.current
    let delta = 0
    if (vpTop < autoscrollAreaSize) {
      delta = vpTop - autoscrollAreaSize
    } else if (vpTop + rowHeight > viewportH.current - autoscrollAreaSize) {
      delta = vpTop + rowHeight - (viewportH.current - autoscrollAreaSize)
    }
    if (delta === 0) {
      stopAutoScroll()
      return
    }
    delta *= 0.5
    const maxOff = Math.max(0, contentH.current - viewportH.current)
    const newOff = clamp(scrollOffset.current + delta, 0, maxOff)
    const applied = newOff - scrollOffset.current
    if (applied === 0) {
      stopAutoScroll()
      return
    }
    scrollOffset.current = newOff
    floatTopRef.current += applied // 保持浮层相对屏幕不动
    floatY.setValue(floatTopRef.current)
    scrollRef.current?.scrollTo({ y: newOff, animated: false })
    swapToTarget(floatTopRef.current + rowHeight / 2)
  }, [autoscrollAreaSize, rowHeight, swapToTarget])

  const startAutoScroll = () => {
    if (!scrollTimer.current) scrollTimer.current = setInterval(tickAutoScroll, 16)
  }

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => dragModeRef.current,
        onPanResponderGrant: (_e, g) => {
          // 按下即接管：轻触=点击、滑动=跟手滚动、长按=拖拽
          scrollStartPageY.current = g.y0
          scrollStartOffset.current = scrollOffset.current
          dragModeRef.current = false
          grantedRef.current = false
          clearLongPress()
          longPressTimer.current = setTimeout(() => {
            if (scrollingRef.current || dragModeRef.current) return
            const idx = dragIndexRef.current
            if (idx < 0 || idx >= orderRef.current.length) return
            dragModeRef.current = true
            dragBaseTop.current = idx * rowHeight + touchLocY.current - rowHeight / 2
            floatTopRef.current = dragBaseTop.current
            floatY.setValue(floatTopRef.current)
            setActiveIndex(idx)
          }, longPressMs)
        },
        onPanResponderMove: (_e, g) => {
          if (dragModeRef.current) {
            if (!grantedRef.current) grantedRef.current = true
            floatTopRef.current = dragBaseTop.current + g.dy
            floatY.setValue(floatTopRef.current)
            swapToTarget(floatTopRef.current + rowHeight / 2)
            startAutoScroll()
            return
          }
          // 未激活：滑动超过 8pt 进入跟手滚动，否则继续等待长按
          if (!scrollingRef.current && (Math.abs(g.dx) > 8 || Math.abs(g.dy) > 8)) {
            clearLongPress()
            scrollingRef.current = true
            scrollStartPageY.current = g.moveY
            scrollStartOffset.current = scrollOffset.current
          }
          if (scrollingRef.current) {
            const maxOff = Math.max(0, contentH.current - viewportH.current)
            const target = clamp(scrollStartOffset.current + (scrollStartPageY.current - g.moveY), 0, maxOff)
            scrollOffset.current = target
            scrollRef.current?.scrollTo({ y: target, animated: false })
          }
        },
        onPanResponderRelease: (_e, g) => {
          if (dragModeRef.current) {
            endDrag(true)
            return
          }
          if (scrollingRef.current) {
            scrollingRef.current = false
            return
          }
          clearLongPress()
          const idx = dragIndexRef.current
          dragIndexRef.current = -1
          if (onPressRow && idx >= 0 && idx < orderRef.current.length) {
            onPressRow(orderRef.current[idx])
          }
        },
        onPanResponderTerminate: () => {
          if (dragModeRef.current) endDrag(false)
          else {
            clearLongPress()
            scrollingRef.current = false
          }
        },
        onPanResponderTerminationRequest: () => false,
      }),
    [rowHeight, longPressMs, onPressRow, endDrag, swapToTarget, tickAutoScroll],
  )

  const getTrans = (key: string, idx: number) => {
    let v = transMap.current.get(key)
    if (!v) {
      v = new Animated.Value(0)
      transMap.current.set(key, v)
      lastIndexMap.current.set(key, idx)
    }
    return v
  }

  const renderRows = () => {
    const rows: React.ReactNode[] = []
    const n = order.length
    for (let i = 0; i < n; i++) {
      const item = order[i]
      const key = getKey(item)
      const trans = getTrans(key, i)
      const last = lastIndexMap.current.get(key)
      if (last !== undefined && last !== i) {
        trans.setValue((last - i) * rowHeight)
        Animated.spring(trans, {
          toValue: 0,
          useNativeDriver: true,
          damping: 28,
          stiffness: 260,
        }).start()
        lastIndexMap.current.set(key, i)
      }
      const isActive = i === activeIndex
      rows.push(
        <Animated.View
          key={key}
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: i * rowHeight,
            height: rowHeight,
            transform: [{ translateY: trans }],
            opacity: isActive ? 0 : 1,
            zIndex: 1,
          }}
          {...panResponder.panHandlers}
          onTouchStart={(e) => {
            dragIndexRef.current = i
            touchLocY.current = e.nativeEvent.locationY
          }}
        >
          {renderRow(item, i, false)}
        </Animated.View>,
      )
    }
    return rows
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={style}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      scrollEnabled={false}
      onScroll={(e) => {
        scrollOffset.current = e.nativeEvent.contentOffset.y
      }}
      scrollEventThrottle={16}
      onLayout={(e) => {
        viewportH.current = e.nativeEvent.layout.height
      }}
    >
      <View
        style={{ position: 'relative', minHeight: order.length * rowHeight }}
        onLayout={(e) => {
          contentH.current = e.nativeEvent.layout.height
        }}
      >
        {renderRows()}
        {activeIndex >= 0 && (
          <Animated.View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: rowHeight,
              transform: [{ translateY: floatY }],
              zIndex: 10,
              elevation: 10,
            }}
          >
            <View style={{ transform: [{ scale: 1.06 }] }}>
              {order[activeIndex] ? renderRow(order[activeIndex], activeIndex, true) : null}
            </View>
          </Animated.View>
        )}
      </View>
      {renderFooter ? renderFooter() : null}
    </ScrollView>
  )
}
