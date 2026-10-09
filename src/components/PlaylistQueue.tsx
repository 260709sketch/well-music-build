import { unknownTrackImageUri } from '@/constants/images'
import SFSymbol from '@/components/SFSymbol'
import myTrackPlayer, { MusicRepeatMode, usePlayListSource } from '@/helpers/trackPlayerIndex'
import { setPlayList } from '@/store/playList'
import ReorderableQueue from '@/components/ReorderableQueue'
import React, { useCallback, useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import FastImage from 'react-native-fast-image'

export type PlaylistQueueProps = {
  playList: any[] | null
  currentMusic: any
  repeatMode: MusicRepeatMode
  onPlaySong?: (song: any) => void
  /** 点击顶部当前播放卡片回退到大封面（Apple Music 行为） */
  onBackToPlayer?: () => void
  titleFontSize?: number
  titleMarginTop?: number
  /** Apple Music 风格队列（AM v2 使用）：顶部当前播放卡片 + 待播清单紧凑列表 */
  amStyle?: boolean
}

export const PlaylistQueue = React.memo(({ playList, currentMusic, repeatMode, onPlaySong, onBackToPlayer, titleFontSize = 16, titleMarginTop = 0, amStyle = false }: PlaylistQueueProps) => {
  // 当前队列来源（歌单名/专辑名/歌手名）；独立单曲时为 null
  const playListSource = usePlayListSource()
  // 歌曲行内容（ReorderableQueue renderContent：行内 TouchableOpacity 只在自身区域接管触摸，长按行其余区域由 Pressable 激活拖拽）
  const renderContent = useCallback((song: any, _index: number) => {
    if (!song) return null
    return (
      <View
        style={[
          styles.queueItem,
          amStyle && styles.queueItemAm,
          currentMusic?.id === song.id && (amStyle ? styles.queueItemAmActive : styles.queueItemActive),
        ]}
      >
        <FastImage
          source={{ uri: song.artwork ?? unknownTrackImageUri, cache: 'immutable' }}
          style={[styles.queueItemArtwork, amStyle && styles.queueItemArtworkAm]}
          resizeMode="cover"
        />
        <View style={styles.queueItemInfo}>
          <Text
            style={[
              styles.queueItemTitle,
              amStyle && styles.queueItemTitleAm,
              currentMusic?.id === song.id && styles.queueItemTitleActive,
            ]}
            numberOfLines={1}
          >
            {song.title}
          </Text>
          <Text style={[styles.queueItemArtist, amStyle && styles.queueItemArtistAm]} numberOfLines={1}>
            {song.artist}
            {song.platform ? ` · ${song.platform}` : ''}
          </Text>
        </View>
        {currentMusic?.id === song.id && (
          <SFSymbol systemName="speaker.wave.3" size={amStyle ? 18 : 19} color="rgba(255,255,255,0.8)" />
        )}
        {!amStyle && (
          <TouchableOpacity
            onPress={(event) => { event.stopPropagation(); myTrackPlayer.remove(song) }}
            style={styles.queueTrailingButton}
          >
            <SFSymbol systemName="trash" size={25} color="rgba(255,255,255,0.68)" />
          </TouchableOpacity>
        )}
        {/* 拖拽手柄：纯视觉提示，拖拽由整行长按触发 */}
        <View style={[styles.queueTrailingButton, amStyle && styles.queueTrailingButtonAm]}>
          <SFSymbol systemName="line.3.horizontal" size={amStyle ? 22 : 24} color={amStyle ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.68)'} />
        </View>
      </View>
    )
  }, [currentMusic, onPlaySong, amStyle])

  // 点击行播放（ReorderableQueue onPressSong 直接给行数据）
  const handlePressRow = useCallback((song: any) => {
    if (!song) return
    if (onPlaySong) onPlaySong(song)
    else myTrackPlayer.play(song, true)
  }, [onPlaySong])

  // 松手落位：按新顺序写回队列
  const handleReorder = useCallback((next: any[]) => {
    if (next.length === (playList?.length || 0)) setPlayList(next)
  }, [playList])

  // 行间距（稳定引用，避免拖拽行每次重渲染）
  const queueItemMargin = useMemo(() => ({ marginBottom: amStyle ? 3 : 10 }), [amStyle])

  const renderFooter = useCallback(() => {
    const count = playList?.length || 0
    if (!count) return <Text style={styles.queueEmpty}>队列为空</Text>
    if (amStyle) {
      return (
        <View style={styles.amQueueFooter}>
          <Text style={styles.amQueueFooterText}>剩余 {Math.max(0, count - 1)} 首待播</Text>
        </View>
      )
    }
    return null
  }, [playList, amStyle])

  return (
    <View style={{ flex: 1 }}>
      {/* Apple Music 风格：仅保留"待播清单"标题行（右侧模式图标），去掉重复的当前播放卡片 */}
      {amStyle ? (
        <View style={styles.amSectionHeader}>
          <View style={styles.amSectionLeft}>
            <Text style={styles.amSectionTitle}>待播清单</Text>
            {playListSource ? (
              <Text style={styles.amSectionSource} numberOfLines={1}>来自 {playListSource}</Text>
            ) : (playList?.length ?? 0) > 1 ? (
              <Text style={styles.amSectionSource} numberOfLines={1}>共 {playList?.length ?? 0} 首</Text>
            ) : null}
          </View>
          <View style={styles.amModeIcons}>
            <TouchableOpacity
              style={[styles.amModeIcon, repeatMode === MusicRepeatMode.SHUFFLE && styles.amModeIconActive]}
              onPress={() => myTrackPlayer.setRepeatMode(repeatMode === MusicRepeatMode.SHUFFLE ? MusicRepeatMode.QUEUE : MusicRepeatMode.SHUFFLE)}
            >
              <SFSymbol systemName="shuffle" size={22} color={repeatMode === MusicRepeatMode.SHUFFLE ? '#ffffff' : 'rgba(255,255,255,0.5)'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.amModeIcon, (repeatMode === MusicRepeatMode.QUEUE) && styles.amModeIconActive]}
              onPress={() => myTrackPlayer.setRepeatMode(repeatMode === MusicRepeatMode.QUEUE ? MusicRepeatMode.SINGLE : MusicRepeatMode.QUEUE)}
            >
              <SFSymbol systemName="repeat" size={22} color={(repeatMode === MusicRepeatMode.QUEUE) ? '#ffffff' : 'rgba(255,255,255,0.5)'} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.amModeIcon, repeatMode === MusicRepeatMode.SINGLE && styles.amModeIconActive]}
              onPress={() => myTrackPlayer.setRepeatMode(repeatMode === MusicRepeatMode.SINGLE ? MusicRepeatMode.QUEUE : MusicRepeatMode.SINGLE)}
            >
              <SFSymbol systemName="repeat.1" size={22} color={repeatMode === MusicRepeatMode.SINGLE ? '#ffffff' : 'rgba(255,255,255,0.5)'} />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.queueTitleRow, { marginTop: titleMarginTop }]}>
          <Text style={[styles.queueScreenTitle, { fontSize: titleFontSize }]}>
            播放队列 · {playList?.length || 0}
          </Text>
        </View>
      )}

      {!amStyle && (
        <View style={styles.queueModeSegment}>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.QUEUE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.QUEUE)}
          >
            <SFSymbol systemName="repeat" size={19} color={repeatMode === MusicRepeatMode.QUEUE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
            <Text style={styles.queueModeText}>顺序</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SHUFFLE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SHUFFLE)}
          >
            <SFSymbol systemName="shuffle" size={20} color={repeatMode === MusicRepeatMode.SHUFFLE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
            <Text style={styles.queueModeText}>随机</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SINGLE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SINGLE)}
          >
            <SFSymbol systemName="repeat.1" size={19} color={repeatMode === MusicRepeatMode.SINGLE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
            <Text style={styles.queueModeText}>单曲</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* 待播清单列表：ReorderableQueue（reorderable-list）长按拖拽，Apple Music 式让位 + 边缘自动滚动 */}
      <View style={{ flex: 1 }}>
        <ReorderableQueue
          data={playList || []}
          keyExtractor={(s: any) => String(s?.id ?? s?.url ?? s?.title)}
          renderContent={renderContent}
          onPressSong={handlePressRow}
          onReorder={handleReorder}
          style={styles.queueList}
          contentContainerStyle={amStyle ? styles.queueListContentAm : styles.queueListContent}
          footer={renderFooter()}
          itemStyle={queueItemMargin}
          activeItemStyle={styles.queueItemDragging}
        />
      </View>

      {/* 底部播放模式按钮（仅非 AM 风格保留） */}
      {!amStyle && (
        <View style={styles.queueModeSegment}>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.QUEUE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.QUEUE)}
          >
            <SFSymbol systemName="repeat" size={19} color={repeatMode === MusicRepeatMode.QUEUE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
            <Text style={styles.queueModeText}>顺序</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SHUFFLE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SHUFFLE)}
          >
            <SFSymbol systemName="shuffle" size={20} color={repeatMode === MusicRepeatMode.SHUFFLE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
            <Text style={styles.queueModeText}>随机</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.queueModeItem, repeatMode === MusicRepeatMode.SINGLE && styles.queueModeItemActive]}
            onPress={() => myTrackPlayer.setRepeatMode(MusicRepeatMode.SINGLE)}
          >
            <SFSymbol systemName="repeat.1" size={19} color={repeatMode === MusicRepeatMode.SINGLE ? '#ffffff' : 'rgba(255,255,255,0.7)'} />
            <Text style={styles.queueModeText}>单曲</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  // "待播清单"标题行 + 右侧模式图标
  amSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  amSectionLeft: {
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  amSectionTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#fff',
  },
  amSectionSource: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  amModeIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  amModeIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  amModeIconActive: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  // 队列底部剩余歌曲数
  amQueueFooter: {
    paddingVertical: 14,
    alignItems: 'center',
  },
  amQueueFooterText: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  queueTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  queueScreenTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#fff',
    letterSpacing: -0.25,
  },
  queueModeSegment: {
    flexDirection: 'row',
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.055)',
    marginBottom: 16,
  },
  queueModeItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.10)',
  },
  queueModeItemActive: {
    backgroundColor: 'rgba(255,255,255,0.13)',
  },
  queueModeText: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
  },
  queueList: {
    flex: 1,
  },
  queueListContent: {
    paddingBottom: 210,
  },
  queueListContentAm: {
    paddingBottom: 200,
  },
  queueEmpty: {
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginTop: 60,
    fontSize: 15,
  },
  queueItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 14,
    paddingHorizontal: 4,
    paddingVertical: 10,
    gap: 10,
  },
  queueItemAm: {
    backgroundColor: 'transparent',
    borderRadius: 0,
    paddingVertical: 6,
    gap: 12,
  },
  queueItemActive: {
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  queueItemAmActive: {
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  // 拖拽中的行：浮起高亮（SimpleDragSortList 浮层自带位移，这里加阴影）
  queueItemDragging: {
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  queueItemArtwork: {
    width: 48,
    height: 48,
    borderRadius: 10,
  },
  queueItemArtworkAm: {
    width: 52,
    height: 52,
    borderRadius: 10,
  },
  queueItemInfo: {
    flex: 1,
    flexShrink: 3,
    alignItems: 'flex-start',
  },
  queueItemTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.9)',
    marginBottom: 3,
  },
  queueItemTitleAm: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 3,
  },
  queueItemTitleActive: {
    color: '#fff',
  },
  queueItemArtist: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.6)',
  },
  queueItemArtistAm: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
  },
  queueTrailingButton: {
    width: 30,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  queueTrailingButtonAm: {
    width: 30,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
})
