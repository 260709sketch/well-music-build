import { unknownTrackImageUri } from '@/constants/images'
import SFSymbol from '@/components/SFSymbol'
import { ThemeColors, screenPadding } from '@/constants/tokens'
import { logError } from '@/helpers/logger'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import { getPlayListFromQ } from '@/helpers/userApi/getMusicSource'
import { resolveNeteasePlaylistId, getNeteasePlaylistDetail } from '@/helpers/userApi/netease-music-api'
import { useThemeColors } from '@/hooks/useAppTheme'
import { useDefaultStyles } from '@/styles'
import { showToast } from '@/utils/utils'
import { Ionicons } from '@expo/vector-icons'
import { useHeaderHeight } from '@react-navigation/elements'
import * as ImagePicker from 'expo-image-picker'
import { router } from 'expo-router'
import React, { useMemo, useRef, useState } from 'react'
import {
	ActivityIndicator,
	Image,
	KeyboardAvoidingView,
	Platform,
	ScrollView,
	StyleSheet,
	Text,
	TextInput,
	TouchableOpacity,
	View,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'

const ImportPlayList = () => {
	const colors = useThemeColors()
	const defaultStyles = useDefaultStyles()
	const styles = useMemo(() => createStyles(colors, defaultStyles), [colors, defaultStyles])
	const [playlistUrl, setPlaylistUrl] = useState('')
	const [neteaseUrl, setNeteaseUrl] = useState('')
	const [playlistData, setPlaylistData] = useState(null)
	const [isLoading, setIsLoading] = useState(false)
	const [isNeteaseLoading, setIsNeteaseLoading] = useState(false)
	const [error, setError] = useState(null)
	const [customName, setCustomName] = useState('')
	const [coverImage, setCoverImage] = useState(null)

	const nameInputRef = useRef(null)
	const urlInputRef = useRef(null)
	const neteaseInputRef = useRef(null)

	const headerHeight = useHeaderHeight()
	const { top } = useSafeAreaInsets()

	const pickImage = async () => {
		const result = await ImagePicker.launchImageLibraryAsync({
			mediaTypes: ImagePicker.MediaTypeOptions.Images,
			allowsEditing: true,
			aspect: [1, 1],
			quality: 1,
		})

		if (!result.canceled) {
			setCoverImage(result.assets[0].uri)
		}
	}

	const handleCreatePlaylist = async () => {
		if (!customName.trim()) {
			setError('请输入歌单名称')
			return
		}
		setIsLoading(true)
		setError(null)
		console.log('coverImage', coverImage)
		try {
			const newPlaylist = {
				id: Date.now().toString(),
				platform: 'QQ',
				artist: '未知歌手',
				name: customName.trim(),
				title: customName.trim(),
				songs: [],
				artwork: coverImage || unknownTrackImageUri,
				tracks: [],
			}
			await myTrackPlayer.addPlayLists(newPlaylist as IMusic.PlayList)
			router.dismiss()
		} catch (err) {
			setError('创建失败，请重试')
			logError('创建错误:', err)
		} finally {
			setIsLoading(false)
		}
	}

	const handleImportQQ = async () => {
		setIsLoading(true)
		setError(null)
		try {
			if (!playlistUrl) throw new Error('链接不能为空')
			const url = playlistUrl.trim()
			if (!url.includes('id=')) throw new Error('链接格式不正确')
			const match = url.match(/[?&]id=(\d+)/)
			const response = await getPlayListFromQ(match ? match[1] : null)
			if (!response || !response.success) throw new Error(response?.error || '获取歌单失败')
			// 每首歌添加 platform/source/songmid，与搜索结果格式一致
			const standardSongs = (response.songs || response.musicList || []).map((song: any) => ({
				...song,
				platform: 'qq',
				source: 'tx',
				songmid: song.songmid || song.mid || String(song.id || ''),
				originalId: song.originalId || song.id || '',
			}))
			const qqId = match ? match[1] : ''
			const processedResponse: any = {
				...response,
				id: 'qq_' + (response.id || qqId || Date.now()),
				qqPlaylistId: response.id || qqId,
				platform: 'qq',
				source: 'qq',
				title: response.title || response.name || '未知歌单',
				name: response.name || '未知歌单',
				songs: standardSongs,
				musicList: standardSongs,
				tracks: standardSongs,
			}
			setPlaylistData(processedResponse)
			myTrackPlayer.addPlayLists(processedResponse as IMusic.PlayList)
			showToast('歌单导入成功', `已导入 ${processedResponse.musicList?.length || 0} 首歌曲`, 'success')
			router.dismiss()
		} catch (err) {
			setError('QQ音乐导入失败，请检查链接是否正确')
			showToast('歌单导入失败', '请检查QQ音乐歌单链接是否正确', 'error')
			logError('QQ音乐导入错误:', err)
		} finally {
			setIsLoading(false)
		}
	}

	const handleImportNetease = async () => {
		setIsNeteaseLoading(true)
		setError(null)
		try {
			if (!neteaseUrl) throw new Error('链接不能为空')
			const url = neteaseUrl.trim()
			const neteaseId = await resolveNeteasePlaylistId(url)
			if (!neteaseId) throw new Error('无法提取网易云歌单ID')
			const processedResponse = await getNeteasePlaylistDetail(neteaseId)
			setPlaylistData(processedResponse)
			myTrackPlayer.addPlayLists(processedResponse as IMusic.PlayList)
			showToast('歌单导入成功', `已导入 ${processedResponse.musicList?.length || 0} 首歌曲`, 'success')
			router.dismiss()
		} catch (err) {
			setError('网易云导入失败，请检查链接是否正确')
			showToast('歌单导入失败', '请检查网易云歌单链接是否正确', 'error')
			logError('网易云导入错误:', err)
		} finally {
			setIsNeteaseLoading(false)
		}
	}

	const DismissPlayerSymbol = () => (
		<View style={[styles.dismissSymbol, { top: top - 25 }]}>
			<View style={styles.dismissBar} />
		</View>
	)

	return (
		<SafeAreaView style={[styles.modalContainer, { paddingTop: headerHeight }]}>
			<DismissPlayerSymbol />
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
				style={{ flex: 1 }}
			>
				<ScrollView
					showsVerticalScrollIndicator={false}
					contentContainerStyle={{ flexGrow: 1 }}
					keyboardShouldPersistTaps="handled"
				>
					<Text style={styles.header}>导入/创建歌单</Text>

					<View style={styles.section}>
						<Text style={styles.sectionTitle}>创建新歌单</Text>
						<View style={styles.createPlaylistCard}>
							<View style={styles.createPlaylistContainer}>
								<View style={styles.coverContainer}>
									<TouchableOpacity onPress={pickImage} style={styles.coverPicker}>
										{coverImage ? (
											<Image source={{ uri: coverImage }} style={styles.coverImage} />
										) : (
											<View style={styles.coverPlaceholder}>
												<SFSymbol systemName="photo" size={24} color={colors.primary} />
												<Text style={styles.coverText}>选择封面</Text>
											</View>
										)}
									</TouchableOpacity>
								</View>

								<View style={styles.playlistInfoContainer}>
									<View style={[styles.inputContainer, { marginBottom: 0 }]}>
										<TextInput
											ref={nameInputRef}
											style={styles.input}
											value={customName}
											onChangeText={setCustomName}
											placeholder="输入歌单名称"
											placeholderTextColor={colors.placeholder}
											autoCapitalize="none"
											autoCorrect={false}
											keyboardType="default"
											returnKeyType="done"
											blurOnSubmit={true}
											onSubmitEditing={() => nameInputRef.current?.blur()}
											enablesReturnKeyAutomatically={true}
											clearButtonMode="while-editing"
										/>
									</View>
								</View>
							</View>

							<TouchableOpacity
								onPress={handleCreatePlaylist}
								activeOpacity={0.8}
								style={styles.button}
								disabled={isLoading}
							>
								{isLoading ? (
									<ActivityIndicator color={colors.loading} />
								) : (
									<>
										<SFSymbol systemName="plus.circle" size={24} color={colors.primary} />
										<Text style={styles.buttonText}>创建歌单</Text>
									</>
								)}
							</TouchableOpacity>
						</View>
					</View>

					<View style={styles.divider} />

					{/* QQ音乐歌单导入 */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>QQ音乐歌单</Text>
						<View style={styles.createPlaylistCard}>
							<View style={styles.importContainer}>
								<TextInput
									ref={urlInputRef}
									style={styles.input}
									value={playlistUrl}
									onChangeText={setPlaylistUrl}
									placeholder='🔗输入QQ音乐歌单链接（含id=）'
									placeholderTextColor={colors.placeholder}
									autoCapitalize="none"
									autoCorrect={false}
									keyboardType="url"
									returnKeyType="done"
									blurOnSubmit={true}
									onSubmitEditing={() => urlInputRef.current?.blur()}
									enablesReturnKeyAutomatically={true}
									clearButtonMode="while-editing"
								/>
							</View>

							<TouchableOpacity
								onPress={handleImportQQ}
								activeOpacity={0.8}
								style={styles.button}
								disabled={isLoading}
							>
								{isLoading ? (
									<ActivityIndicator color={colors.loading} />
								) : (
									<>
										<SFSymbol systemName="cloud.and.arrow.down" size={24} color={colors.primary} />
										<Text style={styles.buttonText}>导入QQ音乐歌单</Text>
									</>
								)}
							</TouchableOpacity>
						</View>
					</View>

					{/* 网易云歌单导入 */}
					<View style={styles.section}>
						<Text style={styles.sectionTitle}>网易云歌单</Text>
						<View style={styles.createPlaylistCard}>
							<View style={styles.importContainer}>
								<TextInput
										ref={neteaseInputRef}
										style={styles.input}
										value={neteaseUrl}
										onChangeText={setNeteaseUrl}
										placeholder='🔗输入网易云歌单链接、短链或完整分享文本'
										placeholderTextColor={colors.placeholder}
										autoCapitalize="none"
										autoCorrect={false}
										keyboardType="url"
										returnKeyType="done"
										blurOnSubmit={true}
										onSubmitEditing={() => neteaseInputRef.current?.blur()}
										enablesReturnKeyAutomatically={true}
										clearButtonMode="while-editing"
									/>
									<Text style={styles.hintText}>
										支持：163cn.tv 短链、music.163.com/#/playlist?id=xxx、y.music.163.com/m/playlist?id=xxx、纯数字ID，或直接粘贴完整分享文本
									</Text>
							</View>

							<TouchableOpacity
								onPress={handleImportNetease}
								activeOpacity={0.8}
								style={styles.button}
								disabled={isNeteaseLoading}
							>
								{isNeteaseLoading ? (
									<ActivityIndicator color={colors.loading} />
								) : (
									<>
										<SFSymbol systemName="cloud.and.arrow.down" size={24} color={colors.primary} />
										<Text style={styles.buttonText}>导入网易云歌单</Text>
									</>
								)}
							</TouchableOpacity>
						</View>
					</View>

					{error && <Text style={styles.error}>{error}</Text>}
					{playlistData && (
						<Text style={styles.successText}>导入成功! 歌单名称: {playlistData.name}</Text>
					)}
				</ScrollView>
			</KeyboardAvoidingView>
		</SafeAreaView>
	)
}

const createStyles = (
	colors: ThemeColors,
	defaultStyles: ReturnType<typeof useDefaultStyles>,
) =>
	StyleSheet.create({
	modalContainer: {
		...defaultStyles.container,
		paddingHorizontal: screenPadding.horizontal,
	},
	section: {
		marginBottom: 24,
	},
	sectionTitle: {
		fontSize: 20,
		fontWeight: '500',
		color: colors.text,
		marginBottom: 16,
	},
	divider: {
		height: 1,
		backgroundColor: colors.separator,
		marginVertical: 24,
	},
	buttonContainer: {
		marginTop: 0,
	},
	dismissSymbol: {
		position: 'absolute',
		left: 0,
		right: 0,
		flexDirection: 'row',
		justifyContent: 'center',
		zIndex: 1,
	},
	dismissBar: {
		width: 50,
		height: 5,
		borderRadius: 2.5,
		backgroundColor: colors.dismissBar,
	},
	inputContainer: {
		width: '100%',
	},
	inputLabel: {
		fontSize: 16,
		fontWeight: '500',
		color: colors.text,
		marginBottom: 8,
	},
	header: {
		fontSize: 31,
		fontWeight: '500',
		padding: 0,
		paddingTop: 5,
		marginBottom: 24,
		color: colors.text,
	},
	input: {
		height: 44,
		backgroundColor: colors.surfaceMuted,
		borderRadius: 8,
		paddingHorizontal: 16,
		fontSize: 16,
		color: colors.text,
		width: '100%',
	},
	coverContainer: {
		width: 100,
	},
	coverPicker: {
		width: 100,
		height: 100,
		borderRadius: 8,
		overflow: 'hidden',
		backgroundColor: colors.surfaceMuted,
		justifyContent: 'center',
		alignItems: 'center',
	},
	coverImage: {
		width: '100%',
		height: '100%',
		resizeMode: 'cover',
	},
	coverPlaceholder: {
		width: '100%',
		height: '100%',
		justifyContent: 'center',
		alignItems: 'center',
	},
	coverText: {
		color: colors.primary,
		marginTop: 8,
		fontSize: 14,
	},
	error: {
		color: colors.error,
		marginTop: 10,
	},
	successText: {
		color: colors.success,
		marginTop: 10,
	},
	button: {
		padding: 12,
		backgroundColor: colors.surfaceMuted,
		borderRadius: 8,
		flexDirection: 'row',
		justifyContent: 'center',
		alignItems: 'center',
		columnGap: 8,
		width: '100%',
	},
	buttonText: {
		...defaultStyles.text,
		color: colors.primary,
		fontWeight: '500',
		fontSize: 18,
		textAlign: 'center',
	},
	createPlaylistCard: {
		backgroundColor: colors.surface,
		borderRadius: 12,
		padding: 16,
		gap: 16,
	},
	createPlaylistContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		columnGap: 16,
	},
	playlistInfoContainer: {
		flex: 1,
		height: 100,
		justifyContent: 'center',
	},
	importContainer: {
		width: '100%',
	},
	hintText: {
		fontSize: 12,
		color: '#999',
		marginTop: 6,
	},
	})

export default ImportPlayList
