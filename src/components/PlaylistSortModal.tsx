import React, { useState, useEffect } from 'react'
import {
	Modal,
	View,
	Text,
	TouchableOpacity,
	StyleSheet,
	Platform,
} from 'react-native'
import SFSymbol from '@/components/SFSymbol'
import FastImage from 'react-native-fast-image'
import ReorderableQueue from '@/components/ReorderableQueue'
import { useThemeColors } from '@/hooks/useAppTheme'
import PersistStatus from '@/store/PersistStatus'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { wellMusicIconUri, unknownTrackImageUri } from '@/constants/images'

interface PlaylistSortModalProps {
	visible: boolean
	onClose: () => void
	playlists: any[]
	onReorder: (order: string[]) => void
	onHiddenChange?: (ids: string[]) => void
}


export const PlaylistSortModal = ({ visible, onClose, playlists, onReorder, onHiddenChange }: PlaylistSortModalProps) => {
	const colors = useThemeColors()
	const { top: safeTop, bottom: safeBottom } = useSafeAreaInsets()
	const [order, setOrder] = useState<any[]>([])
	const [hiddenIds, setHiddenIds] = useState<string[]>([])

	useEffect(() => {
		if (visible) {
			setOrder([...playlists])
			const saved = PersistStatus.get('hiddenPlaylists' as any)
			setHiddenIds(Array.isArray(saved) ? saved : [])
		}
	}, [visible, playlists])

	// 拖拽排序后自动保存（父组件 onReorder 已写 PersistStatus）
	const handleReorder = (next: any[]) => {
		setOrder(next)
		onReorder(next.map(p => p.id))
	}

	// 隐藏/显示后自动保存，不提示，实时通知父组件更新
	const toggleHide = (id: string) => {
		setHiddenIds(prev => {
			const next = prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
			PersistStatus.set('hiddenPlaylists' as any, next)
			onHiddenChange?.(next)
			return next
		})
	}

	// 重置：恢复默认顺序 + 取消所有隐藏
	const handleReset = () => {
		const defaultOrder = [...playlists].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
		setOrder(defaultOrder)
		setHiddenIds([])
		PersistStatus.set('hiddenPlaylists' as any, [])
		onHiddenChange?.([])
		onReorder(defaultOrder.map(p => p.id))
	}

	const renderRow = (item: any, index: number, isActive: boolean) => {
		const isHidden = hiddenIds.includes(item.id)
		return (
			<View style={[
				styles.row,
				{ backgroundColor: colors.card },
				isActive && styles.rowActive,
			]}>
				<FastImage
					source={{ uri: (item.artwork && item.artwork !== '') || (item.coverImg && item.coverImg !== '') ? (item.artwork || item.coverImg) : ((item.songs?.length || 0) + (item.tracks?.length || 0) === 0 ? wellMusicIconUri : unknownTrackImageUri) }}
					style={[styles.cover, isHidden && { opacity: 0.4 }]}
				/>
				<View style={{ flex: 1, marginLeft: 12 }}>
					<Text
						style={[styles.name, { color: colors.text }, isHidden && { opacity: 0.4 }]}
						numberOfLines={1}
					>
						{item.title || item.name || '歌单'}
					</Text>
					<Text style={[styles.desc, { color: colors.textMuted }]} numberOfLines={1}>
						{item.platform === 'netease' ? '网易云' : item.platform === 'qq' ? 'QQ音乐' : '歌单'} · {item.songs?.length || item.tracks?.length || 0}首
						{isHidden && ' · 已隐藏'}
					</Text>
				</View>
				<TouchableOpacity onPress={() => toggleHide(item.id)} style={styles.iconBtn} hitSlop={8}>
					<SFSymbol
						systemName={isHidden ? 'eye.slash' : 'eye'}
						size={18}
						color={isHidden ? '#ff3b30' : colors.textMuted}
					/>
				</TouchableOpacity>
				<View style={styles.dragHandle}>
					<SFSymbol systemName="line.horizontal.3" size={18} color={colors.textMuted} />
				</View>
			</View>
		)
	}

	return (
		<Modal
			visible={visible}
			transparent={false}
			animationType="slide"
			presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : 'overFullScreen'}
			onRequestClose={onClose}
		>
			<View style={[styles.container, { backgroundColor: colors.background, paddingTop: safeTop }]}>
				{/* 顶部导航栏：去掉取消，右边是重置 */}
				<View style={styles.navbar}>
					<View style={{ width: 60 }} />
					<Text style={[styles.title, { color: colors.text }]}>首页歌单排序</Text>
					<TouchableOpacity onPress={handleReset} style={styles.resetBtn}>
						<Text style={[styles.resetText, { color: colors.primary }]}>重置</Text>
					</TouchableOpacity>
				</View>

				<Text style={[styles.hint, { color: colors.textMuted }]}>
					长按歌单拖拽排序，点击眼睛图标隐藏/显示歌单
				</Text>

				<ReorderableQueue
					data={order}
					keyExtractor={(item: any) => item.id || item.title || 'playlist'}
					renderContent={renderRow}
					onReorder={handleReorder}
					style={styles.list}
					contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: safeBottom + 20 }}
					itemStyle={styles.itemWrap}
					activeItemStyle={styles.itemActive}
					longPressMs={200}
					showsVerticalScrollIndicator={false}
				/>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	navbar: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingHorizontal: 16,
		height: 44,
	},
	resetBtn: {
		paddingVertical: 6,
		paddingHorizontal: 4,
		minWidth: 60,
		alignItems: 'flex-end',
	},
	resetText: {
		fontSize: 17,
		fontWeight: '500',
	},
	title: {
		fontSize: 17,
		fontWeight: '600',
	},
	hint: {
		fontSize: 13,
		paddingHorizontal: 16,
		paddingVertical: 10,
	},
	list: {
		flex: 1,
	},
	itemWrap: {
		marginBottom: 6,
	},
	itemActive: {
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 8,
		elevation: 8,
		transform: [{ scale: 1.02 }],
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 12,
		paddingVertical: 10,
		borderRadius: 12,
	},
	rowActive: {
		backgroundColor: 'transparent',
	},
	cover: {
		width: 48,
		height: 48,
		borderRadius: 10,
	},
	name: {
		fontSize: 16,
		fontWeight: '500',
	},
	desc: {
		fontSize: 13,
		marginTop: 2,
	},
	iconBtn: {
		padding: 8,
	},
	dragHandle: {
		padding: 8,
		marginLeft: 4,
	},
})

export default PlaylistSortModal
