import React, { useRef, useState } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
	Animated,
	Dimensions,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'

const { width: SCREEN_WIDTH } = Dimensions.get('window')

const AddPlayListButton = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { bottom } = useSafeAreaInsets()
	const [visible, setVisible] = useState(false)
	const translateY = useRef(new Animated.Value(400)).current
	const opacity = useRef(new Animated.Value(0)).current

	const showModal = () => {
		setVisible(true)
		Animated.parallel([
			Animated.timing(opacity, {
				toValue: 1,
				duration: 250,
				useNativeDriver: true,
			}),
			Animated.spring(translateY, {
				toValue: 0,
				friction: 9,
				tension: 60,
				useNativeDriver: true,
			}),
		]).start()
	}

	const hideModal = () => {
		Animated.parallel([
			Animated.timing(opacity, {
				toValue: 0,
				duration: 200,
				useNativeDriver: true,
			}),
			Animated.timing(translateY, {
				toValue: 400,
				duration: 250,
				useNativeDriver: true,
			}),
		]).start(() => setVisible(false))
	}

	const handleCreatePlaylist = () => {
		hideModal()
	}

	const handleImportNetease = () => {
		hideModal()
		router.push('/(modals)/importPlayList')
	}

	const handleImportQQ = () => {
		hideModal()
		router.push('/(modals)/importPlayList')
	}

	const options = [
		{
			id: 'create',
			icon: 'add',
			iconType: 'ionicons',
			title: '新建歌单',
			onPress: handleCreatePlaylist,
			iconColor: colors.text,
		},
		{
			id: 'netease',
			icon: 'musical-notes',
			iconType: 'ionicons',
			title: '导入网易云歌单',
			onPress: handleImportNetease,
			iconColor: '#fa233b',
		},
		{
			id: 'qq',
			icon: 'music-circle',
			iconType: 'material',
			title: '导入QQ音乐歌单',
			onPress: handleImportQQ,
			iconColor: '#1db954',
		},
	]

	const renderIcon = (icon: string, iconType: string, color: string) => {
		if (iconType === 'material') {
			return <MaterialCommunityIcons name={icon as any} size={22} color={color} />
		}
		return <SFSymbol systemName={icon as any} size={22} color={color} />
	}

	return (
		<>
			<TouchableOpacity onPress={showModal} activeOpacity={0.7}>
				<MaterialCommunityIcons
					name="plus"
					size={27}
					color={colors.icon}
					style={{ marginRight: 6 }}
				/>
			</TouchableOpacity>

			{visible && (
				<View style={styles.overlay} pointerEvents="box-none">
					{/* 半透明背景 */}
					<Animated.View
						style={[styles.backdrop, { opacity }]}
						pointerEvents="auto"
					>
						<TouchableOpacity
							style={styles.backdropTouchable}
							onPress={hideModal}
							activeOpacity={1}
						/>
					</Animated.View>

					{/* 弹窗内容 */}
					<Animated.View
						style={[
							styles.modalContainer,
							{
								transform: [{ translateY }],
								paddingBottom: bottom + 10,
							},
						]}
					>
						{/* 选项列表 */}
						<View style={[styles.optionsList, { backgroundColor: isDark ? '#2c2c2e' : '#ffffff' }]}>
							{options.map((option, index) => (
								<TouchableOpacity
									key={option.id}
									style={[
										styles.optionItem,
										index < options.length - 1 && [styles.optionItemBorder, { borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }],
									]}
									onPress={option.onPress}
									activeOpacity={0.7}
								>
									<View style={styles.optionIcon}>
										{renderIcon(option.icon, option.iconType, option.iconColor)}
									</View>
									<Text style={[styles.optionTitle, { color: colors.text }]}>
										{option.title}
									</Text>
								</TouchableOpacity>
							))}
						</View>

						{/* 取消按钮 */}
						<TouchableOpacity
							style={[styles.cancelButton, { backgroundColor: isDark ? '#2c2c2e' : '#ffffff' }]}
							onPress={hideModal}
							activeOpacity={0.7}
						>
							<Text style={[styles.cancelText, { color: '#fa233b' }]}>取消</Text>
						</TouchableOpacity>
					</Animated.View>
				</View>
			)}
		</>
	)
}

const styles = StyleSheet.create({
	overlay: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
		zIndex: 1000,
	},
	backdrop: {
		...StyleSheet.absoluteFillObject,
		backgroundColor: 'rgba(0,0,0,0.5)',
	},
	backdropTouchable: {
		flex: 1,
	},
	modalContainer: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		paddingHorizontal: 12,
	},
	optionsList: {
		borderRadius: 14,
		overflow: 'hidden',
		marginBottom: 10,
	},
	optionItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 16,
		paddingHorizontal: 20,
	},
	optionItemBorder: {
		borderBottomWidth: 0.5,
	},
	optionIcon: {
		width: 30,
		alignItems: 'center',
		marginRight: 16,
	},
	optionTitle: {
		flex: 1,
		fontSize: 17,
		fontWeight: '500',
		textAlign: 'center',
	},
	cancelButton: {
		height: 56,
		borderRadius: 14,
		alignItems: 'center',
		justifyContent: 'center',
	},
	cancelText: {
		fontSize: 17,
		fontWeight: '500',
	},
})

export default AddPlayListButton
