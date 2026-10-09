import { useCacheManagerStore } from '@/store/cacheManagerStore'
import SFSymbol from '@/components/SFSymbol'
import { useAppTheme } from '@/hooks/useAppTheme'
import React, { useState } from 'react'
import {
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
	ScrollView,
	Alert,
	ActionSheetIOS,
} from 'react-native'

// 缓存上限选项（GB）
const LIMIT_OPTIONS_GB = [2, 3, 4, 5, 6, 7]

const formatLimit = (mb: number): string => {
	return `${(mb / 1024).toFixed(0)} GB`
}

interface CacheManagerScreenProps {
	onClose?: () => void
}

export const CacheManagerScreen = ({ onClose }: CacheManagerScreenProps) => {
	const { colors, isDark } = useAppTheme()
	const {
		clearAllCache,
		clearAudioCache,
		updateAudioCacheSize,
		audioCacheSizeMB,
		getImageCacheSizeMB,
		clearImageCache,
		audioCacheLimitMB,
		imageCacheLimitMB,
		setAudioCacheLimitMB,
		setImageCacheLimitMB,
	} = useCacheManagerStore()

	const [imageCacheSize, setImageCacheSize] = useState(0)

	React.useEffect(() => {
		updateAudioCacheSize()
		getImageCacheSizeMB().then(setImageCacheSize)
	}, [updateAudioCacheSize, getImageCacheSizeMB])

	// 弹出缓存上限选择
	const showLimitPicker = (type: 'audio' | 'image') => {
		const currentMB = type === 'audio' ? audioCacheLimitMB : imageCacheLimitMB
		const currentGB = currentMB / 1024
		const options = LIMIT_OPTIONS_GB.map(gb => `${gb} GB${gb === currentGB ? '  ✓' : ''}`)

		ActionSheetIOS.showActionSheetWithOptions(
			{
				options: [...options, '取消'],
				cancelButtonIndex: options.length,
				title: type === 'audio' ? '选择音频缓存上限' : '选择封面缓存上限',
			},
			(buttonIndex) => {
				if (buttonIndex < LIMIT_OPTIONS_GB.length) {
					const gb = LIMIT_OPTIONS_GB[buttonIndex]
					if (type === 'audio') {
						setAudioCacheLimitMB(gb * 1024)
					} else {
						setImageCacheLimitMB(gb * 1024)
					}
				}
			},
		)
	}

	const handleClearImageCache = () => {
		Alert.alert(
			'清理封面缓存',
			'确定要清理所有歌曲封面、专辑封面、歌手头像缓存吗？清理后重新进入页面会重新下载。',
			[
				{ text: '取消', style: 'cancel' },
				{
					text: '清理',
					style: 'destructive',
					onPress: async () => {
						await clearImageCache()
						setImageCacheSize(0)
					},
				},
			],
		)
	}

	const handleClearAudioCache = () => {
		Alert.alert(
			'清理音频缓存',
			'确定要清理所有已缓存的歌曲音频文件吗？清理后再次播放需要重新下载。已下载的歌曲不受影响。',
			[
				{ text: '取消', style: 'cancel' },
				{
					text: '清理',
					style: 'destructive',
					onPress: async () => {
						await clearAudioCache()
					},
				},
			],
		)
	}

	const handleClearAll = () => {
		Alert.alert(
			'清理全部缓存',
			'确定要清理所有缓存吗？包括音频缓存和封面图片缓存。已下载的歌曲不受影响。',
			[
				{ text: '取消', style: 'cancel' },
				{
					text: '清理',
					style: 'destructive',
					onPress: async () => {
						await clearAllCache()
						setImageCacheSize(0)
					},
				},
			],
		)
	}

	const formatSize = (mb: number): string => {
		if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`
		if (mb < 1024) return `${mb.toFixed(2)} MB`
		return `${(mb / 1024).toFixed(2)} GB`
	}

	return (
		<View style={[styles.container, { backgroundColor: colors.background }]}>
			<View style={styles.handle} />
			<Text style={[styles.title, { color: colors.text }]}>缓存管理</Text>

			<ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
				{/* 缓存统计 */}
				<View style={[styles.card, { backgroundColor: colors.card }]}>
					<View style={styles.cardRow}>
						<View style={styles.rowIcon}>
							<SFSymbol systemName="music.note" size={18} color={colors.primary} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.cardTitle, { color: colors.text }]}>音频缓存</Text>
							<Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>在线播放过的歌曲文件</Text>
						</View>
						<Text style={[styles.cardValue, { color: colors.text }]}>{formatSize(audioCacheSizeMB)}</Text>
					</View>
					<View style={[styles.divider, { backgroundColor: colors.separator }]} />
					<View style={styles.cardRow}>
						<View style={styles.rowIcon}>
							<SFSymbol systemName="photo" size={18} color={colors.primary} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.cardTitle, { color: colors.text }]}>封面缓存</Text>
							<Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>歌曲封面、专辑封面、歌手头像</Text>
						</View>
						<Text style={[styles.cardValue, { color: colors.text }]}>{formatSize(imageCacheSize)}</Text>
					</View>
				</View>

				{/* 缓存上限设置 */}
				<View style={[styles.card, { backgroundColor: colors.card }]}>
					<TouchableOpacity
						style={styles.cardRow}
						onPress={() => showLimitPicker('audio')}
						activeOpacity={0.7}
					>
						<View style={styles.rowIcon}>
							<SFSymbol systemName="internaldrive" size={18} color={colors.primary} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.cardTitle, { color: colors.text }]}>音频缓存上限</Text>
							<Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>超过后自动清理最旧缓存</Text>
						</View>
						<Text style={[styles.cardValue, { color: colors.primary }]}>{formatLimit(audioCacheLimitMB)}</Text>
						<SFSymbol systemName="chevron.right" size={14} color="#C6C6C6" style={{ marginLeft: 6 }} />
					</TouchableOpacity>
					<View style={[styles.divider, { backgroundColor: colors.separator }]} />
					<TouchableOpacity
						style={styles.cardRow}
						onPress={() => showLimitPicker('image')}
						activeOpacity={0.7}
					>
						<View style={styles.rowIcon}>
							<SFSymbol systemName="photo.on.rectangle.angled" size={18} color={colors.primary} />
						</View>
						<View style={{ flex: 1 }}>
							<Text style={[styles.cardTitle, { color: colors.text }]}>封面缓存上限</Text>
							<Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>超过后不再缓存新图片</Text>
						</View>
						<Text style={[styles.cardValue, { color: colors.primary }]}>{formatLimit(imageCacheLimitMB)}</Text>
						<SFSymbol systemName="chevron.right" size={14} color="#C6C6C6" style={{ marginLeft: 6 }} />
					</TouchableOpacity>
				</View>

				{/* 清理按钮 */}
				<TouchableOpacity
					style={[styles.actionButton, { backgroundColor: colors.card }]}
					onPress={handleClearAudioCache}
				>
					<SFSymbol systemName="trash" size={16} color="#ff453a" />
					<Text style={[styles.actionButtonText, { color: '#ff453a' }]}>清理音频缓存</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[styles.actionButton, { backgroundColor: colors.card }]}
					onPress={handleClearImageCache}
				>
					<SFSymbol systemName="photo.on.rectangle" size={16} color={colors.text} />
					<Text style={[styles.actionButtonText, { color: colors.text }]}>清理封面缓存</Text>
				</TouchableOpacity>

				<TouchableOpacity
					style={[styles.actionButton, { backgroundColor: colors.card }]}
					onPress={handleClearAll}
				>
					<SFSymbol systemName="trash.fill" size={16} color="#ff453a" />
					<Text style={[styles.actionButtonText, { color: '#ff453a' }]}>清理全部缓存</Text>
				</TouchableOpacity>

				<View style={{ height: 40 }} />
			</ScrollView>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	handle: {
		width: 36,
		height: 5,
		borderRadius: 3,
		backgroundColor: 'rgba(120,120,128,0.32)',
		alignSelf: 'center',
		marginTop: 8,
		marginBottom: 8,
	},
	title: {
		fontSize: 17,
		fontWeight: '600',
		textAlign: 'center',
		marginBottom: 16,
	},
	content: {
		flex: 1,
		paddingHorizontal: 16,
	},
	card: {
		borderRadius: 12,
		overflow: 'hidden',
		marginBottom: 16,
	},
	cardRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: 14,
		paddingVertical: 12,
	},
	rowIcon: {
		width: 32,
		height: 32,
		borderRadius: 8,
		backgroundColor: 'rgba(0,122,255,0.1)',
		alignItems: 'center',
		justifyContent: 'center',
		marginRight: 12,
	},
	cardTitle: {
		fontSize: 15,
		fontWeight: '500',
	},
	cardSubtitle: {
		fontSize: 12,
		marginTop: 2,
	},
	cardValue: {
		fontSize: 14,
		fontWeight: '500',
	},
	divider: {
		height: StyleSheet.hairlineWidth,
		marginLeft: 58,
	},
	actionButton: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		borderRadius: 12,
		paddingVertical: 14,
		marginBottom: 8,
		gap: 8,
	},
	actionButtonText: {
		fontSize: 15,
		fontWeight: '500',
	},
})
