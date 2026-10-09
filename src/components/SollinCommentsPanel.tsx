// Sollin AM V2 评论区：外壳完全复刻待播清单 PlaylistQueue 的 amStyle UI
// 标题行「歌曲评论 + 共N条」 / 合并列表（顶上「人们」热门评论 + 下方「最新评论」）/ 扁平评论列表（头像+昵称+日期·地区+内容+点赞）/ 底部加载更多
import React, { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import FastImage from 'react-native-fast-image'
import SFSymbol from '@/components/SFSymbol'
import { getCommentsByPlatform, likeNeteaseComment } from '@/helpers/userApi/getMusicSource'
import { useThemeColors } from '@/hooks/useAppTheme'
import { showToast } from '@/utils/utils'

type SollinComment = {
  id: string
  nickname?: string
  avatar?: string
  time?: number
  content?: string
  likeCount?: number
  liked?: boolean
  [key: string]: any
}

type Props = {
  songId: string
  songTitle: string
  platform?: string
}

const defaultAvatar = 'https://y.gtimg.cn/music/photo_new/T001R100x100M0000000000000000.jpg'

const formatTime = (timestamp?: number) => {
  if (!timestamp) return ''
  const date = new Date(timestamp * 1000)
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export const SollinCommentsPanel = React.memo(({ songId, songTitle, platform }: Props) => {
  const colors = useThemeColors()
  const [hotComments, setHotComments] = useState<SollinComment[]>([])
  const [newComments, setNewComments] = useState<SollinComment[]>([])
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [total, setTotal] = useState(0)
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
  const pageRef = useRef(1)

  const fetchComments = useCallback(async (pageNum: number, isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      let actualPlatform = platform || 'qq'
      const idStr = String(songId)
      if (idStr.startsWith('netease_') || idStr.startsWith('wy_')) actualPlatform = 'netease'
      else if (idStr.startsWith('kugou_') || idStr.startsWith('kg_')) actualPlatform = 'kugou'
      else if (idStr.startsWith('kuwo_') || idStr.startsWith('kw_')) actualPlatform = 'kuwo'
      const result = await getCommentsByPlatform(actualPlatform, songId, pageNum, 20)
      const newList = result.comments || []
      const hotList = (result as any).hotComments || []
      if (isRefresh || pageNum === 1) {
        setNewComments(newList)
        setHotComments(hotList)
        setLikedIds(new Set([...hotList.filter((c: any) => c.liked).map((c: any) => c.id), ...newList.filter((c: any) => c.liked).map((c: any) => c.id)]))
      } else {
        setNewComments((prev) => [...prev, ...newList])
      }
      setTotal(result.total || 0)
      setHasMore(result.hasMore || false)
      setPage(pageNum)
      pageRef.current = pageNum
    } catch (e) {
      console.error('获取评论失败:', e)
      if (isRefresh) {
        setHotComments([])
        setNewComments([])
      }
      setHasMore(false)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [songId, platform])

  useEffect(() => {
    fetchComments(1, true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId, platform])

  // 合并列表：顶部展示「热门评论」，下方为「最新评论」
  const data: any[] = []
  if (hotComments.length > 0) {
    data.push({ type: 'header', key: 'sec-hot', title: '热门评论' })
    hotComments.forEach((c) => data.push({ type: 'item', key: `hot-${c.id}`, ...c }))
  }
  if (newComments.length > 0) {
    data.push({ type: 'header', key: 'sec-new', title: '最新评论' })
    newComments.forEach((c) => data.push({ type: 'item', key: `new-${c.id}`, ...c }))
  }

  // 网易云评论才支持点赞（点赞接口 only 针对 netease weapi）
  const isNeteaseSong = /^(netease_|wy_)/.test(String(songId)) || platform === 'netease'

  const patchCount = (list: SollinComment[], item: SollinComment, liked: boolean) =>
    list.map((c) =>
      c.id === item.id
        ? { ...c, likeCount: Math.max(0, (c.likeCount || 0) + (liked ? 1 : -1)), liked }
        : c
    )

  const handleLike = useCallback(async (item: SollinComment) => {
    if (!isNeteaseSong) return
    const track = String(songId)
    const wasLiked = likedIds.has(item.id)
    const targetLiked = !wasLiked
    // 乐观更新
    setLikedIds((prev) => {
      const s = new Set(prev)
      if (targetLiked) s.add(item.id)
      else s.delete(item.id)
      return s
    })
    setHotComments((prev) => patchCount(prev, item, targetLiked))
    setNewComments((prev) => patchCount(prev, item, targetLiked))
    try {
      await likeNeteaseComment(track, String(item.id), targetLiked ? 1 : 0)
    } catch (e) {
      // 失败回滚
      setLikedIds((prev) => {
        const s = new Set(prev)
        if (wasLiked) s.add(item.id)
        else s.delete(item.id)
        return s
      })
      setHotComments((prev) => patchCount(prev, item, wasLiked))
      setNewComments((prev) => patchCount(prev, item, wasLiked))
      showToast('点赞失败', (e instanceof Error ? e.message : String(e)) || '请先在设置中登录网易云', 'error')
    }
  }, [isNeteaseSong, likedIds, songId])

  const renderItem = ({ item }: { item: any }) => {
    if (item.type === 'header') {
      return <Text style={styles.sectionHeader}>{item.title}</Text>
    }
    const isLiked = likedIds.has(item.id)
    return (
      <View style={styles.commentItem}>
        <FastImage source={{ uri: item.avatar || defaultAvatar }} style={styles.commentAvatar} />
        <View style={styles.commentBody}>
          <View style={styles.commentTop}>
            <Text style={styles.commentNickname} numberOfLines={1}>{item.nickname || '匿名用户'}</Text>
            <TouchableOpacity
              style={styles.likeWrap}
              onPress={() => handleLike(item)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <SFSymbol systemName={isLiked ? 'heart.fill' : 'heart'} size={13} color={isLiked ? '#FA243C' : 'rgba(255,255,255,0.4)'} />
              <Text style={[styles.likeCount, { color: isLiked ? '#FA243C' : 'rgba(255,255,255,0.4)' }]}>{item.likeCount || 0}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.commentTime}>{formatTime(item.time)}</Text>
          <Text style={styles.commentContent}>{item.content}</Text>
        </View>
      </View>
    )
  }

  const renderFooter = () => {
    if (loading && data.length > 0) {
      return <ActivityIndicator size="small" color="#fff" style={styles.footer} />
    }
    if (!hasMore && data.length > 0) {
      return <Text style={styles.footerNoMore}>没有更多评论了</Text>
    }
    return null
  }

  return (
    <View style={styles.container}>
      {/* 标题行：歌曲评论 + 共N条；右侧刷新 */}
      <View style={styles.headerRow}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>歌曲评论</Text>
          <Text style={styles.headerSource} numberOfLines={1}>
            {total > 0 ? `共 ${total} 条` : songTitle}
          </Text>
        </View>
        <TouchableOpacity onPress={() => fetchComments(1, true)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} style={styles.refreshBtn}>
          {refreshing ? <ActivityIndicator size="small" color="rgba(255,255,255,0.6)" /> : <SFSymbol systemName="arrow.clockwise" size={18} color="rgba(255,255,255,0.6)" />}
        </TouchableOpacity>
      </View>

      {/* 评论列表：顶部「人们」热门评论 + 下方「最新评论」 */}
      {loading && data.length === 0 ? (
        <View style={styles.emptyWrap}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      ) : data.length === 0 ? (
        <View style={styles.emptyWrap}>
          <SFSymbol systemName="bubble.left.and.bubble.right" size={34} color="rgba(255,255,255,0.3)" />
          <Text style={styles.emptyText}>暂无评论</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={(item) => String(item.key)}
          style={styles.list}
          showsVerticalScrollIndicator={false}
          onEndReached={() => {
            if (hasMore && !loading) fetchComments(pageRef.current + 1, false)
          }}
          onEndReachedThreshold={0.4}
          ListFooterComponent={renderFooter}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  headerLeft: {
    flexShrink: 1,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '600',
    color: '#fff',
  },
  headerSource: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 1,
  },
  refreshBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.55)',
    paddingTop: 8,
    paddingBottom: 2,
    letterSpacing: 0.3,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 120,
  },
  commentItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    gap: 12,
  },
  commentAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  commentBody: {
    flex: 1,
  },
  commentTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  commentNickname: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
    marginRight: 8,
  },
  likeWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeCount: {
    fontSize: 12,
    fontWeight: '500',
  },
  commentTime: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.45)',
    marginTop: 2,
  },
  commentContent: {
    fontSize: 14,
    fontWeight: '400',
    color: 'rgba(255,255,255,0.92)',
    lineHeight: 21,
    marginTop: 4,
  },
  footer: {
    paddingVertical: 16,
  },
  footerNoMore: {
    textAlign: 'center',
    paddingVertical: 16,
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.45)',
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingBottom: 80,
  },
  emptyText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.4)',
  },
})