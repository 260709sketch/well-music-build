import React from 'react'
import { requireNativeComponent, ViewProps, NativeSyntheticEvent } from 'react-native'

interface LyricsViewProps extends ViewProps {
  lyrics: Array<{ lrc: string; time: number }>
  currentTime: number
  isPlaying: boolean
  onSeek?: (event: NativeSyntheticEvent<{ time: number }>) => void
}

const NativeLyricsView = requireNativeComponent<LyricsViewProps>('LyricsView')

export default function LyricsView(props: LyricsViewProps) {
  return <NativeLyricsView {...props} />
}
