import { useAppTheme } from '@/hooks/useAppTheme'
import SFSymbol from '@/components/SFSymbol'
import React, { useState } from 'react'
import {
	ActivityIndicator,
	Alert,
	KeyboardAvoidingView,
	Modal,
	Platform,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
	Clipboard,
} from 'react-native'
import { playListsStore } from '@/player/PlayerStore'
import PersistStatus from '@/store/PersistStatus'
import { showToast } from '@/utils/utils'
import { getPlayListFromQ } from '@/helpers/userApi/getMusicSource'
import { resolveNeteasePlaylistId, getNeteasePlaylistDetail } from '@/helpers/userApi/netease-music-api'

interface AddPlaylistModalProps {
	visible: boolean
	onClose: () => void
}

type PlatformType = 'netease' | 'qq' | 'local'

export const AddPlaylistModal = ({ visible, onClose }: AddPlaylistModalProps) => {
	const { isDark } = useAppTheme()
	const [platform, setPlatform] = useState<PlatformType>('netease')
	const [importUrl, setImportUrl] = useState('')
	const [loading, setLoading] = useState(false)
	const [showPlatformPicker, setShowPlatformPicker] = useState(false)

	React.useEffect(() => {
		if (visible) {
			setImportUrl('')
			setLoading(false)
			setPlatform('netease')
		}
	}, [visible])

	const platformLabel = platform === 'netease' ? '网易云' : platform === 'qq' ? 'QQ音乐' : '本地歌单'
	const platformColor = platform === 'netease' ? '#fa233b' : platform === 'qq' ? '#12b7f5' : '#8e8e93'

	const handlePaste = async () => {
		try {
			const text = await Clipboard.getString()
			if (text) {
				setImportUrl(text)
				showToast('已粘贴', '', 'success')
			} else {
				showToast('剪贴板为空', '', 'info')
			}
		} catch (e) {
			showToast('粘贴失败', '', 'error')
		}
	}

	const handleImportNetease = async () => {
		const url = importUrl.trim()
		if (!url) {
			showToast('请输入网易云歌单链接', '', 'info')
			return
		}
		setLoading(true)
		try {
			const playlistId = await resolveNeteasePlaylistId(url)
			if (!playlistId) throw new Error('无法识别歌单链接')
			const detail = await getNeteasePlaylistDetail(playlistId)
			if (!detail) throw new Error('获取歌单失败')
			const standardPlaylist = {
				id: 'netease_' + (detail.id || playlistId || Date.now()),
				platform: 'netease',
				source: 'netease',
				name: detail.name || detail.title || '网易云歌单',
				title: detail.name || detail.title || '网易云歌单',
				artwork: detail.artwork || detail.coverImgUrl || detail.coverImg || '',
				artist: detail.creator?.nickname || detail.artist || '',
				description: detail.description || detail.title || '',
				songs: detail.songs || detail.tracks || [],
				tracks: detail.tracks || detail.songs || [],
				createdAt: Date.now(),
			}
			const currentPlaylists = playListsStore.getValue() || []
			const updated = [...currentPlaylists, standardPlaylist]
			playListsStore.setValue(updated as any)
			PersistStatus.set('music.playLists', updated)
			showToast('网易云歌单导入成功', '', 'success')
			onClose()
		} catch (e: any) {
			showToast('导入失败: ' + (e?.message || '未知错误'), '', 'error')
		} finally {
			setLoading(false)
		}
	}

	const handleImportQQ = async () => {
		const url = importUrl.trim()
		if (!url) {
			showToast('请输入QQ音乐歌单链接', '', 'info')
			return
		}
		setLoading(true)
		try {
			let playListID = ''
			const idMatch = url.match(/[?&]id=(\d+)/)
			if (idMatch) playListID = idMatch[1]
			if (!playListID) {
				const playlistMatch = url.match(/\/playlist\/(\d+)/)
				if (playlistMatch) playListID = playlistMatch[1]
			}
			if (!playListID) {
				const dissMatch = url.match(/\/diss\/(\d+)/)
				if (dissMatch) playListID = dissMatch[1]
			}
			if (!playListID) {
				const numMatch = url.match(/\/(\d{6,})(?:[?/&]|$)/)
				if (numMatch) playListID = numMatch[1]
			}
			if (!playListID) {
				const pureNum = url.match(/^\d+$/)
				if (pureNum) playListID = url
			}
			if (!playListID) throw new Error('无法从链接中提取歌单ID，请输入QQ音乐歌单链接或纯数字ID')

			const detail = await getPlayListFromQ(playListID)
			if (!detail || !detail.success) throw new Error(detail?.error || '获取歌单失败')
			const standardSongs = (detail.songs || []).map((song: any) => ({
				...song,
				platform: 'qq',
				source: 'tx',
				songmid: song.songmid || song.mid || String(song.id || ''),
				originalId: song.originalId || song.id || '',
			}))
			const standardPlaylist = {
				id: 'qq_' + (detail.id || playListID || Date.now()),
				qqPlaylistId: detail.id || playListID,
				platform: 'qq',
				source: 'qq',
				name: detail.name || 'QQ音乐歌单',
				title: detail.name || 'QQ音乐歌单',
				artwork: detail.artwork || '',
				artist: detail.artist || '',
				description: detail.title || '',
				songs: standardSongs,
				tracks: standardSongs,
				createdAt: Date.now(),
			}
			const currentPlaylists = playListsStore.getValue() || []
			const updated = [...currentPlaylists, standardPlaylist]
			playListsStore.setValue(updated as any)
			PersistStatus.set('music.playLists', updated)
			showToast('QQ音乐歌单导入成功', '', 'success')
			onClose()
		} catch (e: any) {
			showToast('导入失败: ' + (e?.message || '未知错误'), '', 'error')
		} finally {
			setLoading(false)
		}
	}

	const handleImport = () => {
		if (platform === 'netease') handleImportNetease()
		else if (platform === 'qq') handleImportQQ()
		else {
			showToast('本地歌单无需导入', '', 'info')
			onClose()
		}
	}

	const selectPlatform = (p: PlatformType) => {
		setPlatform(p)
		setShowPlatformPicker(false)
		setImportUrl('')
	}

	const bgColor = isDark ? '#1c1c1e' : '#ffffff'
	const textColor = isDark ? '#fff' : '#000'
	const subTextColor = isDark ? '#888' : '#8e8e93'
	const inputBg = isDark ? '#2c2c2e' : '#f2f2f7'

	return (
		<Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				style={styles.overlay}
			>
				<TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={onClose} />

				<View style={[styles.dialog, { backgroundColor: bgColor }]}>
					{/* 标题 */}
					<Text style={[styles.title, { color: textColor }]}>导入外部歌单</Text>

					{/* 平台选择 */}
					<Text style={[styles.label, { color: subTextColor }]}>平台</Text>
					<TouchableOpacity
						style={[styles.platformSelect, { backgroundColor: inputBg }]}
						onPress={() => setShowPlatformPicker(true)}
						activeOpacity={0.7}
					>
						<Text style={[styles.platformText, { color: textColor }]}>{platformLabel}</Text>
						<SFSymbol systemName="chevron.down" size={16} color={subTextColor} />
					</TouchableOpacity>

					{/* 链接输入 */}
					{platform !== 'local' && (
						<>
							<Text style={[styles.label, { color: platformColor, marginTop: 16 }]}>歌单链接或 ID</Text>
							<View style={styles.inputWrap}>
								<TextInput
									style={[styles.input, { color: textColor }]}
									placeholder="粘贴歌单分享文案、链接或歌单 ID"
									placeholderTextColor={subTextColor}
									value={importUrl}
									onChangeText={setImportUrl}
									multiline={false}
								/>
								<View style={[styles.inputUnderline, { backgroundColor: platformColor }]} />
							</View>
							<Text style={[styles.hint, { color: subTextColor }]}>
								{platform === 'netease'
									? '支持分享链接、短链接(163.cn)、分享文本、纯数字ID'
									: '支持分享链接(y.qq.com)、diss链接、纯数字ID'}
							</Text>
						</>
					)}

					{platform === 'local' && (
						<Text style={[styles.hint, { color: subTextColor, marginTop: 20 }]}>
							本地歌单已在应用内，无需导入
						</Text>
					)}

					{/* 按钮组 */}
					<View style={styles.btnRow}>
						<TouchableOpacity onPress={onClose} style={styles.textBtn} disabled={loading}>
							<Text style={[styles.textBtnText, { color: textColor }]}>取消</Text>
						</TouchableOpacity>
						<TouchableOpacity onPress={handlePaste} style={styles.textBtn} disabled={loading || platform === 'local'}>
							<View style={{ flexDirection: 'row', alignItems: 'center' }}>
								<SFSymbol systemName="doc.on.clipboard" size={16} color={platformColor} />
								<Text style={[styles.textBtnText, { color: platformColor, marginLeft: 6 }]}>粘贴</Text>
							</View>
						</TouchableOpacity>
						<TouchableOpacity
							onPress={handleImport}
							style={[styles.importBtn, { backgroundColor: platformColor, opacity: loading ? 0.6 : 1 }]}
							disabled={loading}
						>
							{loading ? (
								<ActivityIndicator color="#fff" size="small" />
							) : (
								<Text style={styles.importBtnText}>导入</Text>
							)}
						</TouchableOpacity>
					</View>
				</View>

				{/* 平台选择 ActionSheet */}
				{showPlatformPicker && (
					<>
						<TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setShowPlatformPicker(false)} />
						<View style={[styles.pickerSheet, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
							<View style={[styles.pickerGroup, { backgroundColor: isDark ? '#2c2c2e' : '#fff' }]}>
								{(['netease', 'qq', 'local'] as PlatformType[]).map((p) => {
									const label = p === 'netease' ? '网易云' : p === 'qq' ? 'QQ音乐' : '本地歌单'
									const color = p === 'netease' ? '#fa233b' : p === 'qq' ? '#12b7f5' : '#8e8e93'
									return (
										<TouchableOpacity
											key={p}
											style={[styles.pickerOption, p !== 'local' && { borderBottomWidth: 0.5, borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)' }]}
											onPress={() => selectPlatform(p)}
											activeOpacity={0.7}
										>
											<Text style={[styles.pickerText, { color: textColor }]}>{label}</Text>
											{platform === p && <SFSymbol systemName="checkmark" size={18} color={color} />}
										</TouchableOpacity>
									)
								})}
							</View>
							<TouchableOpacity
								style={[styles.pickerCancel, { backgroundColor: isDark ? '#2c2c2e' : '#fff' }]}
								onPress={() => setShowPlatformPicker(false)}
								activeOpacity={0.7}
							>
								<Text style={[styles.pickerText, { color: '#fa233b', fontWeight: '600' }]}>取消</Text>
							</TouchableOpacity>
						</View>
					</>
				)}
			</KeyboardAvoidingView>
		</Modal>
	)
}

const styles = StyleSheet.create({
	overlay: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0.4)',
	},
	dialog: {
		width: '82%',
		borderRadius: 20,
		paddingHorizontal: 20,
		paddingTop: 24,
		paddingBottom: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.2,
		shadowRadius: 12,
		elevation: 8,
	},
	title: {
		fontSize: 20,
		fontWeight: '600',
		textAlign: 'center',
		marginBottom: 20,
	},
	label: {
		fontSize: 14,
		fontWeight: '500',
		marginBottom: 6,
	},
	platformSelect: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		height: 48,
		borderRadius: 10,
		paddingHorizontal: 14,
	},
	platformText: {
		fontSize: 17,
		fontWeight: '500',
	},
	inputWrap: {
		marginTop: 4,
	},
	input: {
		height: 40,
		fontSize: 17,
		paddingHorizontal: 2,
	},
	inputUnderline: {
		height: 2,
		borderRadius: 1,
		marginTop: 0,
	},
	hint: {
		fontSize: 11,
		marginTop: 6,
		lineHeight: 16,
	},
	btnRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		marginTop: 20,
	},
	textBtn: {
		paddingVertical: 8,
		paddingHorizontal: 4,
	},
	textBtnText: {
		fontSize: 16,
		fontWeight: '500',
	},
	importBtn: {
		paddingHorizontal: 28,
		paddingVertical: 10,
		borderRadius: 20,
		minWidth: 80,
		alignItems: 'center',
		justifyContent: 'center',
	},
	importBtnText: {
		fontSize: 16,
		fontWeight: '600',
		color: '#fff',
	},
	pickerSheet: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 12,
		paddingBottom: 34,
		paddingTop: 10,
		borderTopLeftRadius: 14,
		borderTopRightRadius: 14,
	},
	pickerGroup: {
		borderRadius: 14,
		overflow: 'hidden',
		marginBottom: 10,
	},
	pickerOption: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 14,
		paddingHorizontal: 16,
	},
	pickerText: {
		fontSize: 17,
		fontWeight: '500',
	},
	pickerCancel: {
		borderRadius: 14,
		paddingVertical: 14,
		alignItems: 'center',
	},
})

export default AddPlaylistModal
