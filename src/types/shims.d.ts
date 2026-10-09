
declare module 'crypto' {
  import crypto from 'react-native-quick-crypto'
  export default crypto
}

declare module 'react-native-sortable-list' {
  import React from 'react'
  import { ViewStyle, StyleProp } from 'react-native'

  export interface SortableListRowProps {
    key: any
    index: number
    data: any
    disabled: boolean
    active: boolean
    toggleRowActive?: (e?: any, gestureState?: any) => void
  }

  export interface SortableListProps {
    data: any[] | Record<string, any>
    order?: any[]
    style?: StyleProp<ViewStyle>
    contentContainerStyle?: StyleProp<ViewStyle>
    innerContainerStyle?: StyleProp<ViewStyle>
    sortingEnabled?: boolean
    scrollEnabled?: boolean
    horizontal?: boolean
    showsVerticalScrollIndicator?: boolean
    showsHorizontalScrollIndicator?: boolean
    autoscrollAreaSize?: number
    rowActivationTime?: number
    manuallyActivateRows?: boolean
    renderRow: (props: SortableListRowProps) => React.ReactElement | null
    renderHeader?: () => React.ReactElement | null
    renderFooter?: () => React.ReactElement | null
    onChangeOrder?: (nextOrder: any[]) => void
    onActivateRow?: (key: any) => void
    onReleaseRow?: (key: any, currentOrder: any[]) => void
    onPressRow?: (key: any) => void
  }

  export default class SortableList extends React.Component<SortableListProps> {
    scrollBy(...args: any[]): void
    scrollTo(...args: any[]): void
    scrollToRowKey(...args: any[]): void
  }
}
