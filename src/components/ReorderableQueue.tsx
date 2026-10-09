import React, { memo, useCallback, useMemo } from 'react'
import { Pressable, StyleProp, ViewStyle } from 'react-native'
import { Gesture } from 'react-native-gesture-handler'
import ReorderableList, {
  reorderItems,
  useIsActive,
  useReorderableDrag,
} from 'react-native-reorderable-list'

interface ReorderableQueueProps<T = any> {
  data: T[]
  keyExtractor: (item: T) => string
  /** 行内容渲染（不含拖拽容器/行间距，由组件统一包裹 Pressable），第三个参数为是否处于拖拽中 */
  renderContent: (song: T, index: number, isActive: boolean) => React.ReactNode
  onPressSong?: (song: T) => void
  onReorder: (next: T[]) => void
  style?: StyleProp<ViewStyle>
  contentContainerStyle?: StyleProp<ViewStyle>
  /** 列表底部组件（空态提示等） */
  footer?: React.ReactElement | null
  /** 行外层布局样式（间距等） */
  itemStyle?: StyleProp<ViewStyle>
  /** 拖拽中的行样式（放大/阴影） */
  activeItemStyle?: StyleProp<ViewStyle>
  longPressMs?: number
  showsVerticalScrollIndicator?: boolean
}

const DraggableRow = memo(({ song, index, onPressSong, renderContent, itemStyle, activeItemStyle }: any) => {
  const drag = useReorderableDrag()
  const isActive = useIsActive()
  return (
    <Pressable
      onLongPress={drag}
      delayLongPress={200}
      onPress={() => onPressSong?.(song)}
      style={[itemStyle, isActive && activeItemStyle]}
    >
      {renderContent(song, index, isActive)}
    </Pressable>
  )
})

/**
 * 基于 react-native-reorderable-list 的播放队列拖拽列表：
 * - Apple Music 式长按拖拽：行平滑让位、边缘自动滚动、松手落位
 * - 长按 200ms 激活（pan 手势 activateAfterLongPress 220ms，平时滑动正常滚动不冲突）
 * - 拖拽行放大 + 阴影，其他行库内置 layout 动画让位
 */
export default function ReorderableQueue<T = any>({
  data,
  keyExtractor,
  renderContent,
  onPressSong,
  onReorder,
  style,
  contentContainerStyle,
  footer,
  itemStyle,
  activeItemStyle,
  longPressMs = 200,
  showsVerticalScrollIndicator = false,
}: ReorderableQueueProps<T>) {
  const gesture = useMemo(() => Gesture.Pan().activateAfterLongPress(longPressMs + 20), [longPressMs])

  const handleReorder = useCallback(
    ({ from, to }: any) => {
      onReorder(reorderItems(data, from, to))
    },
    [data, onReorder],
  )

  const renderItem = useCallback(
    ({ item, index }: any) => (
      <DraggableRow
        song={item}
        index={index}
        onPressSong={onPressSong}
        renderContent={renderContent}
        itemStyle={itemStyle}
        activeItemStyle={activeItemStyle}
      />
    ),
    [onPressSong, renderContent, itemStyle, activeItemStyle],
  )

  return (
    <ReorderableList
      data={data}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      onReorder={handleReorder}
      panGesture={gesture}
      shouldUpdateActiveItem
      autoscrollThreshold={0.15}
      autoscrollSpeedScale={1.2}
      autoscrollDelay={30}
      autoscrollActivationDelta={5}
      animationDuration={200}
      style={style}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={showsVerticalScrollIndicator}
      ListFooterComponent={footer}
    />
  )
}
