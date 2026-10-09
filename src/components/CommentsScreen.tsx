import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import SFSymbol from '@/components/SFSymbol'
import { getCommentsByPlatform, sendNeteaseComment, replyNeteaseComment, deleteNeteaseComment, likeNeteaseComment } from '@/helpers/userApi/getMusicSource'
import { unknownTrackImageUri } from '@/constants/images'
import * as Haptics from 'expo-haptics'
import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
	ActivityIndicator,
	FlatList,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	Alert,
} from 'react-native'
import FastImage from 'react-native-fast-image'
import { Ionicons } from '@expo/vector-icons'
import { Keyboard, Platform } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withTiming } from 'react-native-reanimated'
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import { showToast } from '@/utils/utils'

type Comment = {
	id: string
	nickname: string
	avatar: string
	content: string
	time: number
	likeCount: number
	liked?: boolean
	userId?: string
}

type CommentsScreenProps = {
	onClose?: () => void
	songId: string
	songTitle: string
	songArtist?: string
	songCover?: string
	platform?: string
}

type TabType = 'hot' | 'new'

export const CommentsScreen = ({
	onClose,
	songId,
	songTitle,
	songArtist,
	songCover,
	platform,
}: CommentsModalProps) => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const [activeTab, setActiveTab] = useState<TabType>('hot')
	const [hotComments, setHotComments] = useState<Comment[]>([])
	const [newComments, setNewComments] = useState<Comment[]>([])
	const [page, setPage] = useState(1)
	const [loading, setLoading] = useState(false)
	const [refreshing, setRefreshing] = useState(false)
	const [hasMore, setHasMore] = useState(true)
	const [total, setTotal] = useState(0)
	const [errorMsg, setErrorMsg] = useState<string>('')
	const [commentText, setCommentText] = useState('')
	const [replyTo, setReplyTo] = useState<Comment | null>(null)
	const keyboardHeight = useSharedValue(0)
	const [sending, setSending] = useState(false)
	const [likedIds, setLikedIds] = useState<Set<string>>(new Set())
	const inputRef = useRef<TextInput>(null)

	const isNetease = String(songId).startsWith('netease_') || String(songId).startsWith('wy_') || platform === 'netease'
	const wyCookie = useDailyRecommendStore((s) => s.cookie)
	const isLoggedIn = !!wyCookie

	// 下滑关闭手势
	useEffect(() => {
		setActiveTab('hot')
		setCommentText('')
		setReplyTo(null)
	}, [])

	const fetchComments = useCallback(
		async (pageNum: number, isRefresh: boolean = false) => {
			if (isRefresh) {
				setRefreshing(true)
			} else {
				setLoading(true)
			}
			try {
				if (!songId) {
					setHotComments([])
					setNewComments([])
					setTotal(0)
					setHasMore(false)
					return
				}
				let actualPlatform = platform || 'qq'
				const idStr = String(songId)
				if (idStr.startsWith('netease_') || idStr.startsWith('wy_')) {
					actualPlatform = 'netease'
				} else if (idStr.startsWith('kugou_') || idStr.startsWith('kg_')) {
					actualPlatform = 'kugou'
				} else if (idStr.startsWith('kuwo_') || idStr.startsWith('kw_')) {
					actualPlatform = 'kuwo'
				}
				const result = await getCommentsByPlatform(actualPlatform, songId, pageNum, 20)
				const newList = result.comments || []
				const hotList = (result as any).hotComments || []

				if (isRefresh || pageNum === 1) {
					setNewComments(newList)
					setHotComments(hotList)
					setLikedIds(new Set([...hotList.filter(c => c.liked).map(c => c.id), ...newList.filter(c => c.liked).map(c => c.id)]))
				} else {
					setNewComments((prev) => [...prev, ...newList])
				}
				setTotal(result.total || 0)
				setHasMore(result.hasMore || false)
				setPage(pageNum)
			} catch (error) {
				console.error('获取评论失败:', error)
				setErrorMsg(error instanceof Error ? error.message : String(error))
				if (isRefresh) {
					setHotComments([])
					setNewComments([])
				}
				setTotal(0)
				setHasMore(false)
			} finally {
				setLoading(false)
				setRefreshing(false)
			}
		},
		[songId, platform],
	)

	const handleRefresh = useCallback(() => {
		Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
		setPage(1)
		setHasMore(true)
		setErrorMsg('')
		fetchComments(1, true)
	}, [fetchComments])

	useEffect(() => {
		if (songId) {
			setHotComments([])
			setNewComments([])
			setPage(1)
			setHasMore(true)
			setErrorMsg('')
			setLikedIds(new Set())
			fetchComments(1, false)
		}
	}, [songId, fetchComments])

	useEffect(() => {
		const showSub = Keyboard.addListener('keyboardWillShow', (e) => {
			keyboardHeight.value = withTiming(e.endCoordinates.height, { duration: e.duration || 250 })
		})
		const hideSub = Keyboard.addListener('keyboardWillHide', (e) => {
			keyboardHeight.value = withTiming(0, { duration: e?.duration || 250 })
		})
	
	

	return () => {
			showSub.remove()
			hideSub.remove()
		}
	}, [])


	const formatTime = (timestamp: number) => {
		const date = new Date(timestamp * 1000)
		const y = date.getFullYear()
		const m = String(date.getMonth() + 1).padStart(2, '0')
		const d = String(date.getDate()).padStart(2, '0')
		const h = String(date.getHours()).padStart(2, '0')
		const min = String(date.getMinutes()).padStart(2, '0')
		const s = String(date.getSeconds()).padStart(2, '0')
		return `${y}-${m}-${d} ${h}:${min}:${s}`
	}

	const handleLike = useCallback(async (comment: Comment) => {
		if (!isNetease || !isLoggedIn) {
			showToast('登录网易云后可点赞', '', 'info')
			return
		}
		const isLiked = likedIds.has(comment.id)
		const newCount = isLiked ? (comment.likeCount - 1) : (comment.likeCount + 1)

		// 乐观更新
		setLikedIds((prev) => {
			const next = new Set(prev)
			if (isLiked) next.delete(comment.id)
			else next.add(comment.id)
			return next
		})
		const updateList = (list: Comment[]) => list.map((c) => c.id === comment.id ? { ...c, likeCount: newCount, liked: !isLiked } : c)
		setHotComments((prev) => updateList(prev))
		setNewComments((prev) => updateList(prev))

		try {
			await likeNeteaseComment(songId, comment.id, isLiked ? 0 : 1)
		} catch (e) {
			// 回滚
			setLikedIds((prev) => {
				const next = new Set(prev)
				if (isLiked) next.add(comment.id)
				else next.delete(comment.id)
				return next
			})
			const rollback = (list: Comment[]) => list.map((c) => c.id === comment.id ? { ...c, likeCount: comment.likeCount, liked: isLiked } : c)
			setHotComments((prev) => rollback(prev))
			setNewComments((prev) => rollback(prev))
			showToast('点赞失败', '', 'error')
		}
	}, [isNetease, isLoggedIn, likedIds, songId])

	const handleReply = useCallback((comment: Comment) => {
		if (!isNetease || !isLoggedIn) {
			showToast('登录网易云后可回复', '', 'info')
			return
		}
		setReplyTo(comment)
		inputRef.current?.focus()
	}, [isNetease, isLoggedIn])

	const handleSend = useCallback(async () => {
		const text = commentText.trim()
		if (!text) return
		if (!isNetease || !isLoggedIn) {
			showToast('登录网易云后可发评论', '', 'info')
			return
		}
		setSending(true)
		try {
			if (replyTo) {
				await replyNeteaseComment(songId, text, replyTo.id)
				showToast('回复成功', '', 'success')
			} else {
				await sendNeteaseComment(songId, text)
				showToast('评论成功', '', 'success')
			}
			setCommentText('')
			setReplyTo(null)
			// 延迟刷新
			setTimeout(() => fetchComments(1, true), 3000)
		} catch (e: any) {
			showToast(e.message || '发送失败', '', 'error')
		} finally {
			setSending(false)
		}
	}, [commentText, isNetease, isLoggedIn, replyTo, songId, fetchComments])

	const handleDelete = useCallback((comment: Comment) => {
		Alert.alert('删除评论', '确定删除这条评论吗？', [
			{ text: '取消', style: 'cancel' },
			{
				text: '删除',
				style: 'destructive',
				onPress: async () => {
					try {
						await deleteNeteaseComment(songId, comment.id)
						showToast('删除成功', '', 'success')
						setHotComments((prev) => prev.filter((c) => c.id !== comment.id))
						setNewComments((prev) => prev.filter((c) => c.id !== comment.id))
					} catch (e: any) {
						showToast(e.message || '删除失败', '', 'error')
					}
				},
			},
		])
	}, [songId])

	const currentUserId = (() => {
		try {
			const match = wyCookie.match(/MUSIC_U=([^;]+)/)
			return match ? match[1] : ''
		} catch { return '' }
	})()

	const renderCommentItem = ({ item }: { item: Comment }) => {
		const isLiked = likedIds.has(item.id)
		const isOwn = isLoggedIn && currentUserId && item.userId === currentUserId
		return (
			<View style={styles.commentItem}>
				<FastImage
					source={{ uri: item.avatar || 'https://y.gtimg.cn/music/photo_new/T001R100x100M0000000000000000.jpg' }}
					style={styles.commentAvatar}
				/>
				<View style={styles.commentContent}>
					<View style={styles.commentHeader}>
						<Text style={[styles.commentNickname, { color: colors.text }]} numberOfLines={1}>
							{item.nickname}
						</Text>
						<TouchableOpacity
							style={styles.likeBtn}
							onPress={() => {}}
							hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
						>
							<SFSymbol systemName={isLiked ? 'heart' : 'heart'} size={16} color={isLiked ? colors.primary : colors.textMuted} />
							<Text style={[styles.likeCount, { color: isLiked ? colors.primary : colors.textMuted }]}>
								{item.likeCount || 0}
							</Text>
						</TouchableOpacity>
					</View>
					<Text style={[styles.commentTime, { color: colors.textMuted }]}>
						{formatTime(item.time)}
					</Text>
					<Text style={[styles.commentText, { color: colors.text }]}>{item.content}</Text>
					<View style={styles.actionRow}>
						<TouchableOpacity onPress={() => handleReply(item)} hitSlop={{ top: 5, bottom: 5, left: 5, right: 15 }}>
							<Text style={[styles.replyText, { color: colors.textMuted }]}>回复</Text>
						</TouchableOpacity>
						{isOwn ? (
							<TouchableOpacity onPress={() => handleDelete(item)} hitSlop={{ top: 5, bottom: 5, left: 15, right: 5 }}>
								<Text style={[styles.replyText, { color: '#ff4444' }]}>删除</Text>
							</TouchableOpacity>
						) : null}
					</View>
				</View>
			</View>
		)
	}

	const currentList = activeTab === 'hot' ? hotComments : newComments

	return (
		<Animated.View
			style={[{ flex: 1, backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }, useAnimatedStyle(() => ({ paddingBottom: keyboardHeight.value }))]}
		>
			<View style={styles.pageSheetContainer}>
					<View style={styles.grabber} />

					{/* 头部：封面 + 标题 */}
					<View style={styles.header}>
						<FastImage source={{ uri: songCover || unknownTrackImageUri }} style={styles.songCover} />
						<View style={styles.headerText}>
							<Text style={[styles.songTitle, { color: colors.text }]} numberOfLines={1}>
								{songTitle} 的评论{total > 0 ? ` (${total})` : ''}
							</Text>
							{songArtist ? (
								<Text style={[styles.songArtist, { color: colors.textMuted }]} numberOfLines={1}>
									{songArtist}
								</Text>
							) : null}
						</View>
					</View>

					{/* 标签栏 */}
					<View style={[styles.tabBar, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
						<View style={styles.tabLeft}>
							<TouchableOpacity
								style={styles.tabBtn}
								onPress={() => setActiveTab('hot')}
							>
								<Text style={[styles.tabText, { color: activeTab === 'hot' ? colors.primary : colors.textMuted, fontWeight: activeTab === 'hot' ? '700' : '400' }]}>
									热门
								</Text>
							</TouchableOpacity>
							<TouchableOpacity
								style={styles.tabBtn}
								onPress={() => setActiveTab('new')}
							>
								<Text style={[styles.tabText, { color: activeTab === 'new' ? colors.primary : colors.textMuted, fontWeight: activeTab === 'new' ? '700' : '400' }]}>
									最新
								</Text>
							</TouchableOpacity>
						</View>
						<TouchableOpacity onPress={handleRefresh} style={styles.refreshBtn} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
							<SFSymbol systemName="arrow.clockwise" size={20} color={colors.textMuted} />
						</TouchableOpacity>
					</View>

					{/* 评论列表 */}
					{loading && currentList.length === 0 ? (
						<View style={styles.loadingContainer}>
							<ActivityIndicator size="large" color={colors.primary} />
							<Text style={[styles.loadingText, { color: colors.textMuted }]}>加载评论中...</Text>
						</View>
					) : errorMsg && currentList.length === 0 ? (
						<View style={styles.emptyContainer}>
							<SFSymbol systemName="questionmark.circle" size={40} color={colors.textMuted} />
							<Text style={[styles.emptyText, { color: colors.textMuted }]}>加载失败</Text>
							<TouchableOpacity onPress={handleRefresh} style={styles.retryButton}>
								<Text style={{ color: colors.primary, fontWeight: '500' }}>重试</Text>
							</TouchableOpacity>
						</View>
					) : currentList.length === 0 ? (
						<View style={styles.emptyContainer}>
							<SFSymbol systemName="questionmark.circle" size={40} color={colors.textMuted} />
							<Text style={[styles.emptyText, { color: colors.textMuted }]}>暂无评论</Text>
						</View>
					) : (
						<FlatList
							data={currentList}
							renderItem={renderCommentItem}
							keyExtractor={(item) => item.id}
							style={styles.commentList}
							contentContainerStyle={styles.commentListContent}
							showsVerticalScrollIndicator={false}
							onEndReached={() => {
								if (activeTab === 'new' && hasMore && !loading) {
									fetchComments(page + 1, false)
								}
							}}
							onEndReachedThreshold={0.5}
							ListFooterComponent={
								loading && currentList.length > 0 ? (
									<View style={styles.loadMoreContainer}>
										<ActivityIndicator size="small" color={colors.primary} />
										<Text style={[styles.loadMoreText, { color: colors.textMuted }]}>加载更多...</Text>
									</View>
								) : !hasMore && currentList.length > 0 && activeTab === 'new' ? (
									<Text style={[styles.noMoreText, { color: colors.textMuted }]}>没有更多评论了</Text>
								) : null
							}
						/>
					)}

					{/* 评论输入框（仅网易云且登录后显示） */}
					{isNetease && isLoggedIn ? (
						<View style={[styles.inputBar, { backgroundColor: isDark ? '#2c2c2e' : '#fff', borderTopColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)' }]}>
							{replyTo ? (
								<View style={styles.replyHint}>
									<Text style={[styles.replyHintText, { color: colors.textMuted }]}>
										回复 @{replyTo.nickname}
									</Text>
									<TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 5, bottom: 5, left: 10, right: 5 }}>
										<SFSymbol systemName="xmark" size={16} color={colors.textMuted} />
									</TouchableOpacity>
								</View>
							) : null}
							<View style={styles.inputRow}>
								<TextInput
									ref={inputRef}
									style={[styles.input, { color: colors.text, backgroundColor: isDark ? '#3a3a3c' : '#f2f2f7' }]}
									placeholder={replyTo ? `回复 @${replyTo.nickname}...` : '写一条评论...'}
									placeholderTextColor={colors.textMuted}
									value={commentText}
									onChangeText={setCommentText}
									multiline
									maxLength={500}
								/>
								<TouchableOpacity
									style={[styles.sendBtn, { opacity: commentText.trim() && !sending ? 1 : 0.4 }]}
									onPress={handleSend}
									disabled={!commentText.trim() || sending}
								>
									{sending ? (
										<ActivityIndicator size="small" color="#fff" />
									) : (
										<SFSymbol systemName="paperplane" size={18} color="#ffffff" />
									)}
								</TouchableOpacity>
							</View>
						</View>
					) : null}
				</View>
		</Animated.View>
	)
}

const styles = StyleSheet.create({
	pageSheetContainer: {
		flex: 1,
		paddingTop: 8,
	},
	grabber: {
		width: 36,
		height: 5,
		borderRadius: 3,
		backgroundColor: 'rgba(128,128,128,0.3)',
		alignSelf: 'center',
		marginBottom: 8,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		paddingVertical: 8,
	},
	songCover: {
		width: 44,
		height: 44,
		borderRadius: 8,
		marginRight: 10,
	},
	headerText: {
		flex: 1,
		justifyContent: 'center',
	},
	songTitle: {
		fontSize: 16,
		fontWeight: '500',
	},
	songArtist: {
		fontSize: 12,
		marginTop: 2,
	},
	tabBar: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 16,
		borderBottomWidth: 0.5,
		height: 40,
	},
	tabLeft: {
		flex: 1,
		flexDirection: 'row',
	},
	tabBtn: {
		paddingRight: 20,
		height: 40,
		justifyContent: 'center',
	},
	tabText: {
		fontSize: 16,
	},
	refreshBtn: {
		width: 32,
		height: 32,
		alignItems: 'center',
		justifyContent: 'center',
	},
	commentList: {
		flex: 1,
	},
	commentListContent: {
		paddingHorizontal: 16,
		paddingBottom: 20,
	},
	commentItem: {
		flexDirection: 'row',
		paddingVertical: 12,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(128,128,128,0.15)',
	},
	commentAvatar: {
		width: 38,
		height: 38,
		borderRadius: 19,
		marginRight: 10,
	},
	commentContent: {
		flex: 1,
	},
	commentHeader: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	commentNickname: {
		fontSize: 14,
		fontWeight: '500',
		flex: 1,
	},
	likeBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 4,
	},
	likeCount: {
		fontSize: 13,
	},
	commentTime: {
		fontSize: 11,
		marginTop: 2,
	},
	commentText: {
		fontSize: 15,
		lineHeight: 22,
		marginTop: 4,
	},
	actionRow: {
		flexDirection: 'row',
		marginTop: 6,
		gap: 16,
	},
	replyText: {
		fontSize: 12,
	},
	loadingContainer: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 12,
	},
	loadingText: {
		fontSize: 14,
	},
	emptyContainer: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		gap: 12,
	},
	emptyText: {
		fontSize: 14,
	},
	retryButton: {
		marginTop: 8,
		paddingHorizontal: 20,
		paddingVertical: 8,
		borderRadius: 16,
		backgroundColor: 'rgba(128,128,128,0.15)',
	},
	loadMoreContainer: {
		alignItems: 'center',
		paddingVertical: 16,
		flexDirection: 'row',
		justifyContent: 'center',
		gap: 8,
	},
	loadMoreText: {
		fontSize: 12,
	},
	noMoreText: {
		textAlign: 'center',
		fontSize: 12,
		paddingVertical: 16,
	},
	inputBar: {
		borderTopWidth: 0.5,
		paddingHorizontal: 12,
		paddingTop: 8,
		paddingBottom: 12,
	},
	replyHint: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingBottom: 6,
	},
	replyHintText: {
		fontSize: 12,
	},
	inputRow: {
		flexDirection: 'row',
		alignItems: 'flex-end',
		gap: 8,
	},
	input: {
		flex: 1,
		minHeight: 36,
		maxHeight: 100,
		borderRadius: 18,
		paddingHorizontal: 14,
		paddingVertical: 8,
		fontSize: 14,
	},
	sendBtn: {
		width: 36,
		height: 36,
		borderRadius: 18,
		backgroundColor: '#007aff',
		alignItems: 'center',
		justifyContent: 'center',
	},
})
