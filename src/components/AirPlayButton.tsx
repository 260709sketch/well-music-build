import React from 'react'
import { Share, StyleSheet, TouchableOpacity, View } from 'react-native'
import SFSymbol from '@/components/SFSymbol'

type Props = {
  size?: number
  color?: string
  trackUrl?: string
  trackTitle?: string
  trackArtist?: string
}

export const AirPlayButton: React.FC<Props> = ({
  size = 22,
  color = '#d9d9d9',
  trackUrl,
  trackTitle,
  trackArtist,
}) => {
  const handleShare = async () => {
    try {
      const url = trackUrl || ''
      const title = trackTitle || '正在播放'
      const artist = trackArtist || ''
      await Share.share({
        url: url || undefined,
        title: title,
        message: artist ? `${title} - ${artist}` : title,
      })
    } catch (e) {
      // ignore
    }
  }

  return (
    <TouchableOpacity onPress={handleShare} style={styles.container} activeOpacity={0.7}>
      <SFSymbol systemName="square.and.arrow.up" size={size} color={color} weight="regular" />
    </TouchableOpacity>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
})
