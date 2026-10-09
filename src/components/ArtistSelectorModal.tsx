import React, { useEffect, useRef, useState } from 'react'
import {
	Modal,
	StyleSheet,
	TouchableOpacity,
	View,
	Text,
	Dimensions,
	Animated,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import FastImage from 'react-native-fast-image'
import { unknownTrackImageUri } from '@/constants/images'
import { searchNeteaseArtist } from '@/helpers/userApi/netease-music-api'
import { searchArtist as searchQQArtist } from '@/helpers/userApi/xiaoqiu'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

type ArtistItem = {
	name: string
	avatar?: string
}

type ArtistSelectorModalProps = {
	visible: boolean
	artists: ArtistItem[]
	onSelect: (artist: ArtistItem) => void
	onClose: () => void
	useLegacyStyle?: boolean // 保留旧样式但默认不启用
}

export const ArtistSelectorModal = ({ visible, artists, onSelect, onClose, useLegacyStyle = false }: ArtistSelectorModalProps) => {
	// 新样式（iOS原生菜单，从底部弹出）的动画
	const fadeAnim = useRef(new Animated.Value(0)).current
	const slideAnim = useRef(new Animated.Value(500)).current

	// 旧样式（底部弹窗）的动画
	const legacySlideAnim = useRef(new Animated.Value(300)).current
	const { bottom } = useSafeAreaInsets()

	const [artistsWithAvatar, setArtistsWithAvatar] = useState<ArtistItem[]>(artists)

	useEffect(() => {
		if (visible) {
			if (useLegacyStyle) {
				Animated.spring(legacySlideAnim, { toValue: 0, damping: 28, stiffness: 300, mass: 0.8, useNativeDriver: true }).start()
			} else {
				Animated.parallel([
					Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
					Animated.spring(slideAnim, { toValue: 0, damping: 28, stiffness: 300, mass: 0.8, useNativeDriver: true }),
				]).start()
			}
		} else {
			if (useLegacyStyle) {
				Animated.timing(legacySlideAnim, { toValue: 300, duration: 220, useNativeDriver: true }).start()
			} else {
				Animated.parallel([
					Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
					Animated.timing(slideAnim, { toValue: 500, duration: 250, useNativeDriver: true }),
				]).start()
			}
		}
	}, [visible, fadeAnim, slideAnim, legacySlideAnim, useLegacyStyle])

	// 异步获取歌手头像
	useEffect(() => {
		if (!visible || artists.length === 0) return
		setArtistsWithAvatar(artists)
		const fetchAvatars = async () => {
			const updated = [...artists]
			for (let i = 0; i < updated.length; i++) {
				if (updated[i].avatar) continue
				try {
					const neteaseResult = await searchNeteaseArtist(updated[i].name, 1, 1)
					if (neteaseResult?.data?.[0]?.artwork) {
						updated[i] = { ...updated[i], avatar: neteaseResult.data[0].artwork }
						setArtistsWithAvatar([...updated])
						continue
					}
					const qqResult = await searchQQArtist(updated[i].name, 1)
					if (qqResult?.data?.[0]?.avatar) {
						updated[i] = { ...updated[i], avatar: qqResult.data[0].avatar }
						setArtistsWithAvatar([...updated])
					}
				} catch (e) {
					// 忽略错误
				}
			}
		}
		fetchAvatars()
	}, [visible, artists])

	const handleSelect = (artist: ArtistItem) => {
		onSelect(artist)
		onClose()
	}

	// 旧样式（底部弹窗）- 保留但默认不启用
	if (useLegacyStyle) {
		return (
			<Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
				<View style={legacyStyles.container}>
					<View style={legacyStyles.backdrop}>
						<TouchableOpacity style={legacyStyles.backdropTouch} onPress={onClose} activeOpacity={1} />
					</View>
					<Animated.View
						style={[
							legacyStyles.sheet,
							{ paddingBottom: bottom + 12, transform: [{ translateY: legacySlideAnim }] },
						]}
					>
						<View style={legacyStyles.handle} />
						<Text style={legacyStyles.title}>选择歌手</Text>
						<Text style={legacyStyles.subtitle}>这首歌有多位歌手，请选择要查看的歌手</Text>
						<View style={legacyStyles.artistList}>
							{artistsWithAvatar.map((artist, index) => (
								<TouchableOpacity
									key={index}
									style={legacyStyles.artistItem}
									onPress={() => handleSelect(artist)}
									activeOpacity={0.6}
								>
									<FastImage
										source={{ uri: artist.avatar || unknownTrackImageUri }}
										style={legacyStyles.artistAvatar}
									/>
									<Text style={legacyStyles.artistName} numberOfLines={1}>{artist.name}</Text>
								</TouchableOpacity>
							))}
						</View>
						<TouchableOpacity style={legacyStyles.cancelBtn} onPress={onClose} activeOpacity={0.6}>
							<Text style={legacyStyles.cancelText}>取消</Text>
						</TouchableOpacity>
					</Animated.View>
				</View>
			</Modal>
		)
	}

	// 新样式（iOS原生菜单，从底部弹出）- 默认启用
	return (
		<Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
			<Animated.View style={[newStyles.container, { opacity: fadeAnim }]}>
				<TouchableOpacity style={newStyles.backdrop} onPress={onClose} activeOpacity={1} />
				<Animated.View
					style={[
						newStyles.sheet,
						{ paddingBottom: bottom + 12, transform: [{ translateY: slideAnim }] },
					]}
				>
					{/* 毛玻璃背景 */}
					<BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />

					{/* 歌手选项列表 */}
					<View style={newStyles.menuList}>
						{artistsWithAvatar.map((artist, index) => (
							<TouchableOpacity
								key={index}
								style={[
									newStyles.menuItem,
									index < artistsWithAvatar.length - 1 && newStyles.menuItemBorder,
								]}
								onPress={() => handleSelect(artist)}
								activeOpacity={0.4}
							>
								<Text style={newStyles.menuItemText} numberOfLines={1}>{artist.name}</Text>
								<FastImage
									source={{ uri: artist.avatar || unknownTrackImageUri }}
									style={newStyles.menuItemAvatar}
								/>
							</TouchableOpacity>
						))}
					</View>
				</Animated.View>
			</Animated.View>
		</Modal>
	)
}

// 新样式（iOS原生菜单，从底部弹出）
const newStyles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'flex-end',
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0)',
	},
	sheet: {
		marginHorizontal: 12,
		marginBottom: 12,
		borderRadius: 20,
		overflow: 'hidden',
		backgroundColor: 'rgba(40,40,40,0.85)',
	},
	header: {
		paddingVertical: 14,
		paddingHorizontal: 16,
		alignItems: 'center',
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255,255,255,0.1)',
	},
	headerTitle: {
		fontSize: 15,
		fontWeight: '500',
		color: 'rgba(255,255,255,0.6)',
	},
	menuList: {
		marginTop: 4,
	},
	menuItem: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		paddingVertical: 16,
		paddingHorizontal: 20,
		backgroundColor: 'transparent',
	},
	menuItemBorder: {
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255,255,255,0.08)',
	},
	menuItemText: {
		flex: 1,
		fontSize: 17,
		fontWeight: '500',
		color: '#fff',
	},
	menuItemAvatar: {
		width: 32,
		height: 32,
		borderRadius: 16,
		marginLeft: 12,
	},
	cancelContainer: {
		marginTop: 8,
		paddingHorizontal: 12,
	},
	cancelBtn: {
		paddingVertical: 16,
		borderRadius: 14,
		backgroundColor: 'rgba(255,255,255,0.1)',
		alignItems: 'center',
	},
	cancelText: {
		fontSize: 17,
		fontWeight: '500',
		color: '#007aff',
	},
})

// 旧样式（底部弹窗）- 保留但默认不启用
const legacyStyles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'flex-end',
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'transparent',
	},
	backdropTouch: {
		flex: 1,
	},
	sheet: {
		backgroundColor: '#1c1c1e',
		borderTopLeftRadius: 24,
		borderTopRightRadius: 24,
		paddingHorizontal: 20,
		paddingTop: 8,
	},
	handle: {
		width: 36,
		height: 5,
		borderRadius: 3,
		backgroundColor: 'rgba(255,255,255,0.2)',
		alignSelf: 'center',
		marginBottom: 16,
	},
	title: {
		fontSize: 17,
		fontWeight: '500',
		color: '#fff',
		textAlign: 'center',
		marginBottom: 4,
	},
	subtitle: {
		fontSize: 13,
		color: 'rgba(255,255,255,0.5)',
		textAlign: 'center',
		marginBottom: 20,
	},
	artistList: {
		marginBottom: 12,
	},
	artistItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 12,
		paddingHorizontal: 8,
		borderBottomWidth: 0.5,
		borderBottomColor: 'rgba(255,255,255,0.08)',
	},
	artistAvatar: {
		width: 44,
		height: 44,
		borderRadius: 22,
		marginRight: 14,
	},
	artistName: {
		flex: 1,
		fontSize: 16,
		fontWeight: '500',
		color: '#fff',
	},
	cancelBtn: {
		marginTop: 8,
		paddingVertical: 14,
		borderRadius: 14,
		backgroundColor: 'rgba(255,255,255,0.08)',
		alignItems: 'center',
	},
	cancelText: {
		fontSize: 16,
		fontWeight: '500',
		color: '#ff453a',
	},
})
