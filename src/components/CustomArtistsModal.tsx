// 自定义歌手随机歌曲弹窗
import { useDailyRecommendStore } from '@/store/dailyRecommendStore'
import SFSymbol from '@/components/SFSymbol'
import { useThemeColors } from '@/hooks/useAppTheme'
import { showToast } from '@/utils/utils'
import { Ionicons } from '@expo/vector-icons'
import React, { useMemo, useState } from 'react'
import {
	Alert,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const DEFAULT_ARTISTS = [
	'The Weeknd', 'Playboi Carti', 'Osamason', 'Ken Carson', 'Kanye West',
	'Travis Scott', 'Gunna', 'Nine Vicious', 'Metro Boomin', '21 Savage',
	'Lil Uzi Vert', 'Kendrick Lamar', 'SZA', 'Future', 'Don Toliver',
	'Young Thug', 'Quavo', 'Drake', 'A$AP Rocky', 'JACKBOYS',
	'Roddy Ricch', 'Lil Tjay', 'Kelly Clarkson', 'Nettspend', 'Ye',
	'Tay Keith', 'Key Glock', 'Offset', 'Slayr', 'Lil Baby',
	'Mustard', 'Migos', 'Nav', 'Young Stoner Life', 'Destroy Lonely',
	'Rae Sremmurd', 'Ty Dolla $ign', 'Lil Durk', 'Tyler, The Creator',
	'Lil Tecca', 'J. Cole', '$LATTMONEYY', '¥$',
]

interface CustomArtistsModalProps {
	visible: boolean
	onClose: () => void
}

export const CustomArtistsModal = ({ visible, onClose }: CustomArtistsModalProps) => {
	const colors = useThemeColors()
	const insets = useSafeAreaInsets()
	const { selectedRapArtists, setSelectedRapArtists } = useDailyRecommendStore()

	const [tempSelectedArtists, setTempSelectedArtists] = useState<string[]>([])
	const [newArtistInput, setNewArtistInput] = useState('')
	const [customArtists, setCustomArtists] = useState<string[]>([])

	const allArtistsList = useMemo(() => {
		return [...new Set([...DEFAULT_ARTISTS, ...customArtists])]
	}, [customArtists])

	const openModal = () => {
		setTempSelectedArtists([...selectedRapArtists])
	}

	React.useEffect(() => {
		if (visible) openModal()
	}, [visible])

	const toggleArtist = (artist: string) => {
		if (tempSelectedArtists.includes(artist)) {
			setTempSelectedArtists(tempSelectedArtists.filter(a => a !== artist))
		} else {
			setTempSelectedArtists([...tempSelectedArtists, artist])
		}
	}

	const handleAddCustomArtist = () => {
		const artist = newArtistInput.trim()
		if (artist && !allArtistsList.includes(artist)) {
			setCustomArtists([...customArtists, artist])
			setTempSelectedArtists([...tempSelectedArtists, artist])
			setNewArtistInput('')
			showToast(`已添加歌手：${artist}`, '', 'success')
		} else if (allArtistsList.includes(artist)) {
			showToast('该歌手已存在', '', 'info')
		}
	}

	const handleSaveArtists = () => {
		setSelectedRapArtists(tempSelectedArtists)
		onClose()
		showToast(`已保存 ${tempSelectedArtists.length} 个歌手`, '', 'success')
	}

	const toggleSelectAll = () => {
		if (tempSelectedArtists.length === allArtistsList.length) {
			setTempSelectedArtists([])
		} else {
			setTempSelectedArtists([...allArtistsList])
		}
	}

	const handleDeleteCustomArtist = (artist: string) => {
		setCustomArtists(customArtists.filter(a => a !== artist))
		setTempSelectedArtists(tempSelectedArtists.filter(a => a !== artist))
		showToast(`已删除歌手：${artist}`, '', 'info')
	}

	const handleDeleteAllCustomArtists = () => {
		if (customArtists.length === 0) {
			showToast('没有自定义歌手可删除', '', 'info')
			return
		}
		Alert.alert('删除自定义歌手', `确定删除所有 ${customArtists.length} 个自定义歌手吗？`, [
			{ text: '取消', style: 'cancel' },
			{
				text: '删除', style: 'destructive', onPress: () => {
					setTempSelectedArtists(tempSelectedArtists.filter(a => !customArtists.includes(a)))
					setCustomArtists([])
					showToast('已删除所有自定义歌手', '', 'success')
				}
			},
		])
	}

	return (
		<Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
			<View style={[styles.container, { flex: 1, paddingBottom: insets.bottom + 20, backgroundColor: colors.background }]}>
				<View style={styles.handle} />
				<Text style={[styles.title, { color: colors.text }]}>自定义歌手随机歌曲</Text>
				<Text style={[styles.subtitle, { color: colors.textMuted }]}>
					选择或添加歌手，发现页会随机推荐这些歌手的歌曲
				</Text>

				<View style={{ flexDirection: 'row', marginVertical: 14, gap: 10 }}>
					<TextInput
						style={[styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
						placeholder="输入歌手名字添加..."
						placeholderTextColor={colors.textMuted}
						value={newArtistInput}
						onChangeText={setNewArtistInput}
						onSubmitEditing={handleAddCustomArtist}
					/>
					<TouchableOpacity
						style={[styles.addBtn, { backgroundColor: colors.primary }]}
						onPress={handleAddCustomArtist}
					>
						<Text style={{ color: '#fff', fontWeight: '500', fontSize: 15 }}>添加</Text>
					</TouchableOpacity>
				</View>

				<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
					<Text style={{ fontSize: 13, color: colors.textMuted, fontWeight: '500' }}>
						已选 {tempSelectedArtists.length} / {allArtistsList.length}
					</Text>
					<TouchableOpacity onPress={toggleSelectAll}>
						<Text style={{ fontSize: 14, color: colors.primary, fontWeight: '500' }}>
							{tempSelectedArtists.length === allArtistsList.length ? '取消全选' : '全选'}
						</Text>
					</TouchableOpacity>
				</View>

				<ScrollView style={{ flex: 1 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
					{allArtistsList.map((artist) => {
						const isSelected = tempSelectedArtists.includes(artist)
						const isCustom = customArtists.includes(artist)
						return (
							<View key={artist} style={{ flexDirection: 'row', alignItems: 'center' }}>
								<TouchableOpacity
									style={[styles.artistRow, { backgroundColor: colors.card, borderColor: colors.border }]}
									onPress={() => toggleArtist(artist)}
								>
									<View style={styles.artistRowIcon}>
										<SFSymbol systemName="person" size={18} color={colors.textMuted} />
									</View>
									<Text style={[styles.artistRowName, { color: colors.text }]}>{artist}</Text>
									{isSelected && <SFSymbol systemName="checkmark.circle" size={22} color={colors.primary} />}
								</TouchableOpacity>
								{isCustom && (
									<TouchableOpacity
										style={{ padding: 10, marginLeft: 4 }}
										onPress={() => handleDeleteCustomArtist(artist)}
									>
										<SFSymbol systemName="trash" size={20} color={colors.error} />
									</TouchableOpacity>
								)}
							</View>
						)
					})}
				</ScrollView>

				<View style={{ flexDirection: 'row', marginTop: 14, gap: 12 }}>
					<TouchableOpacity
						style={[styles.btnSecondary, { borderColor: colors.border }]}
						onPress={handleDeleteAllCustomArtists}
					>
						<Text style={{ color: colors.error, fontWeight: '500', fontSize: 15 }}>删除</Text>
					</TouchableOpacity>
					<TouchableOpacity
						style={[styles.btnPrimary, { backgroundColor: colors.primary, flex: 1 }]}
						onPress={handleSaveArtists}
					>
						<Text style={{ color: '#fff', fontWeight: '500', fontSize: 15 }}>确定</Text>
					</TouchableOpacity>
				</View>
			</View>
		</Modal>
	)
}

const styles = StyleSheet.create({
	container: { padding: 20 },
	handle: { width: 36, height: 5, borderRadius: 3, backgroundColor: 'rgba(120,120,128,0.32)', alignSelf: 'center', marginBottom: 12 },
	title: { fontSize: 20, fontWeight: '500' },
	subtitle: { fontSize: 13, marginTop: 6 },
	input: { flex: 1, height: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, fontSize: 15 },
	addBtn: { height: 44, paddingHorizontal: 20, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
	artistRow: { flex: 1, flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, marginVertical: 4 },
	artistRowIcon: { width: 28, marginRight: 10 },
	artistRowName: { flex: 1, fontSize: 15 },
	btnSecondary: { height: 48, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
	btnPrimary: { height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
})
