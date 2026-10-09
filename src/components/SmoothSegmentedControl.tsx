import React, { useEffect, useRef, useState } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { BlurView } from 'expo-blur'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { useAppTheme } from '@/hooks/useAppTheme'

type Option = {
  key: string
  label: string
  icon?: React.ReactNode
}

type Props = {
  options: Option[]
  activeKey: string
  onChange: (key: string) => void
  draggable?: boolean
  showDividers?: boolean
}

const HIGHLIGHT_MARGIN = 4

// 液态玻璃背景（照抄IOS26BottomDockV2）
const LiquidGlassBg = ({
  tint,
  borderRadius,
  intensity = 30,
}: {
  tint: 'light' | 'dark'
  borderRadius: number
  intensity?: number
}) => {
  const { isDark } = useAppTheme()
  const [renderKey, setRenderKey] = useState(0)
  const [showBlur, setShowBlur] = useState(true)

  useEffect(() => {
    setShowBlur(false)
    const timer = setTimeout(() => {
      setRenderKey((k) => k + 1)
      setShowBlur(true)
    }, 50)
    return () => clearTimeout(timer)
  }, [isDark, tint, intensity])

  return (
    <View style={[StyleSheet.absoluteFillObject, { borderRadius, overflow: 'hidden' }]}>
      {showBlur && (
        <BlurView
          key={`blur1-${tint}-${intensity}-${isDark ? 'dark' : 'light'}-${renderKey}`}
          intensity={intensity}
          tint={tint}
          style={{ flex: 1 }}
        />
      )}
      {showBlur && (
        <BlurView
          key={`blur2-${tint}-${intensity}-${isDark ? 'dark' : 'light'}-${renderKey}`}
          intensity={Math.max(10, intensity - 15)}
          tint={tint}
          style={StyleSheet.absoluteFillObject}
        />
      )}
      <View
        style={{
          ...StyleSheet.absoluteFillObject,
          backgroundColor: isDark ? 'rgba(120,130,255,0.06)' : 'rgba(255,255,255,0.08)',
        }}
      />
      <LinearGradient
        colors={[isDark ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.25)', 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '15%', borderTopLeftRadius: borderRadius, borderTopRightRadius: borderRadius }}
      />
      <LinearGradient
        colors={['rgba(0,0,0,0)', isDark ? 'rgba(0,0,0,0.15)' : 'rgba(0,0,0,0.06)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '20%', borderBottomLeftRadius: borderRadius, borderBottomRightRadius: borderRadius }}
      />
    </View>
  )
}

export default function SmoothSegmentedControl({ options, activeKey, onChange, draggable = true, showDividers = false }: Props) {
  const { isDark } = useAppTheme()
  const [containerWidth, setContainerWidth] = useState(0)

  const translateX = useSharedValue(0)
  const highlightWidth = useSharedValue(0)
  const highlightScale = useSharedValue(1)
  const highlightVisible = useSharedValue(0)
  const containerWidthSV = useSharedValue(0)

  const isDragging = useRef(false)
  const startX = useSharedValue(0)
  const startTranslateX = useSharedValue(0)
  const lastValidIndex = useRef(0)
  // 拖动过程中已切换到的下标（UI 线程共享值）
  const dragIndexSV = useSharedValue(-1)

  const activeIndex = options.findIndex(o => o.key === activeKey)
  const cellWidth = containerWidth / options.length

  // 初始化位置（只在宽度首次获取时设置，后续由handlePress和snapToIndex控制）
  useEffect(() => {
    if (containerWidth > 0 && containerWidthSV.value === 0) {
      containerWidthSV.value = containerWidth
      const cw = containerWidth / options.length
      highlightWidth.value = cw - HIGHLIGHT_MARGIN * 2
      const idx = options.findIndex(o => o.key === activeKey)
      lastValidIndex.current = idx >= 0 ? idx : 0
      translateX.value = lastValidIndex.current * cw + HIGHLIGHT_MARGIN
      highlightVisible.value = withTiming(1, { duration: 120 })
    } else if (containerWidth > 0 && containerWidthSV.value !== containerWidth) {
      containerWidthSV.value = containerWidth
      const cw = containerWidth / options.length
      highlightWidth.value = cw - HIGHLIGHT_MARGIN * 2
    }
  }, [containerWidth, options, translateX, highlightWidth, highlightVisible, containerWidthSV])

  // activeKey变化时同步滑块位置（非拖拽状态）
  useEffect(() => {
    if (containerWidthSV.value > 0 && !isDragging.current) {
      const idx = options.findIndex(o => o.key === activeKey)
      if (idx >= 0 && idx !== lastValidIndex.current) {
        lastValidIndex.current = idx
        const cw = containerWidthSV.value / options.length
        translateX.value = withSpring(idx * cw + HIGHLIGHT_MARGIN, { damping: 22, stiffness: 220 })
      }
    }
  }, [activeKey, options, translateX, containerWidthSV])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: highlightScale.value }],
    width: highlightWidth.value,
    opacity: highlightVisible.value,
  }))

  const snapToIndex = (idx: number) => {
    'worklet'
    const clamped = Math.max(0, Math.min(options.length - 1, idx))
    const cw = containerWidthSV.value / options.length
    translateX.value = withSpring(clamped * cw + HIGHLIGHT_MARGIN, { damping: 22, stiffness: 220 })
    highlightScale.value = withSpring(1, { damping: 18, stiffness: 250 })
    if (options[clamped] && clamped !== lastValidIndex.current) {
      lastValidIndex.current = clamped
      runOnJS(onChange)(options[clamped].key)
    }
  }

  // 照抄dock栏拖动手势
  const panGesture = Gesture.Pan()
    .minDistance(8)
    .onStart((event) => {
      isDragging.current = true
      startX.value = event.x
      startTranslateX.value = translateX.value
      highlightScale.value = withSpring(1.35, { damping: 14, stiffness: 280 })
      highlightVisible.value = 1
    })
    .onUpdate((event) => {
      if (containerWidthSV.value <= 0) return
      const cw = containerWidthSV.value / options.length
      const minX = HIGHLIGHT_MARGIN
      const maxX = (options.length - 1) * cw + HIGHLIGHT_MARGIN
      let newX = startTranslateX.value + (event.x - startX.value)
      newX = Math.max(minX, Math.min(maxX, newX))
      translateX.value = newX
      // 拖动跨过半格即实时切换，高亮与内容同步，松手不再额外触发
      let idx = Math.round((newX - HIGHLIGHT_MARGIN) / cw)
      idx = Math.max(0, Math.min(options.length - 1, idx))
      if (idx !== dragIndexSV.value) {
        dragIndexSV.value = idx
        lastValidIndex.current = idx
        runOnJS(onChange)(options[idx].key)
      }
    })
    .onEnd(() => {
      if (containerWidthSV.value <= 0) {
        highlightScale.value = withSpring(1, { damping: 18, stiffness: 250 })
        isDragging.current = false
        dragIndexSV.value = -1
        return
      }
      const cw = containerWidthSV.value / options.length
      const idx = dragIndexSV.value >= 0 ? dragIndexSV.value : lastValidIndex.current
      const clamped = Math.max(0, Math.min(options.length - 1, idx))
      translateX.value = withSpring(clamped * cw + HIGHLIGHT_MARGIN, { damping: 22, stiffness: 220 })
      highlightScale.value = withSpring(1, { damping: 18, stiffness: 250 })
      lastValidIndex.current = clamped
      isDragging.current = false
      dragIndexSV.value = -1
    })
    .onFinalize(() => {
      highlightScale.value = withSpring(1, { damping: 18, stiffness: 250 })
      isDragging.current = false
    })

  const handlePress = (idx: number) => {
    isDragging.current = false
    lastValidIndex.current = idx
    highlightVisible.value = withTiming(1, { duration: 120 })
    highlightScale.value = withSpring(1.1, { damping: 14, stiffness: 300 })
    setTimeout(() => {
      highlightScale.value = withSpring(1, { damping: 18, stiffness: 250 })
    }, 100)
    const cw = containerWidth / options.length
    translateX.value = withSpring(idx * cw + HIGHLIGHT_MARGIN, { damping: 22, stiffness: 220 })
    if (options[idx].key !== activeKey) {
      onChange(options[idx].key)
    }
  }

  return (
    <View
      style={styles.container}
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
    >
      {/* 容器背景：浅色和深色都用纯色 */}
      <View style={[StyleSheet.absoluteFillObject, { borderRadius: 16, backgroundColor: isDark ? '#121214' : '#e9e9eb' }]} />

      {/* 滑块 - 浅色用浅灰，深色用纯液态玻璃（和dock栏一致） */}
      {containerWidth > 0 && (
        <Animated.View
          style={[
            styles.highlight,
            {
              top: HIGHLIGHT_MARGIN,
              bottom: HIGHLIGHT_MARGIN,
              left: 0,
              borderRadius: 12,
              backgroundColor: isDark ? '#434343' : '#ffffff',
              shadowColor: '#000',
              shadowOpacity: isDark ? 0 : 0.1,
              shadowRadius: 4,
              shadowOffset: { width: 0, height: 1 },
              elevation: isDark ? 0 : 2,
            },
            animatedStyle,
          ]}
        >
          <View
            style={{
              ...StyleSheet.absoluteFillObject,
              borderRadius: 12,
              borderWidth: 0,
              borderColor: 'transparent',
            }}
          />
        </Animated.View>
      )}

      {draggable ? (
        <GestureDetector gesture={panGesture}>
          <View style={styles.optionsRow}>
            {options.map((opt, idx) => {
              const isActive = opt.key === activeKey
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={styles.option}
                  onPress={() => handlePress(idx)}
                  activeOpacity={0.7}
                >
                  <View style={styles.optionContent}>
                    {opt.icon}
                    <Text
                      style={[
                        styles.optionText,
                        { color: isDark ? (isActive ? '#fff' : '#8e8e93') : (isActive ? '#000' : '#000') },
                        isActive && styles.optionTextActive,
                      ]}
                    >
                      {opt.label}
                    </Text>
                  </View>
                  {showDividers && idx < options.length - 1 && <View style={styles.divider} />}
                </TouchableOpacity>
              )
            })}
          </View>
        </GestureDetector>
      ) : (
        <View style={styles.optionsRow}>
          {options.map((opt, idx) => {
            const isActive = opt.key === activeKey
            return (
              <TouchableOpacity
                key={opt.key}
                style={styles.option}
                onPress={() => handlePress(idx)}
                activeOpacity={0.7}
              >
                <View style={styles.optionContent}>
                  {opt.icon}
                  <Text
                    style={[
                      styles.optionText,
                      { color: isDark ? (isActive ? '#fff' : '#8e8e93') : (isActive ? '#000' : '#000') },
                      isActive && styles.optionTextActive,
                    ]}
                  >
                    {opt.label}
                  </Text>
                </View>
                {showDividers && idx < options.length - 1 && <View style={styles.divider} />}
              </TouchableOpacity>
            )
          })}
        </View>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderRadius: 999,
    padding: 0,
    position: 'relative',
    marginBottom: 20,
  },
  containerDark: {
    backgroundColor: 'rgba(40,40,40,0.6)',
  },
  highlight: {
    position: 'absolute',
    zIndex: 1,
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  optionsRow: {
    flex: 1,
    flexDirection: 'row',
    zIndex: 2,
  },
  option: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  optionContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  optionText: {
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    position: 'absolute',
    right: 0,
    top: '25%',
    bottom: '25%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(120,120,128,0.3)',
  },
  divider: {
    position: 'absolute',
    right: 0,
    top: '25%',
    bottom: '25%',
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(120,120,128,0.3)',
  },
  optionTextActive: {
    fontWeight: '500',
  },
})
