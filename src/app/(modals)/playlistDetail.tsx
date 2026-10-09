import React, { useEffect } from 'react'
import SFSymbol from '@/components/SFSymbol'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useRouter, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import PlaylistScreen from '../(tabs)/favorites/[name]'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import { useDockHideStore } from '@/store/dockHideStore'

const PlaylistDetailModal = () => {
	const router = useRouter()
	const { isDark } = useAppTheme()
	const colors = useThemeColors()
	const { name } = useLocalSearchParams<{ name: string }>()
	const insets = useSafeAreaInsets()
	const headerHeight = insets.top + 44

	// 进入时隐藏dock栏，离开时恢复
	useEffect(() => {
		useDockHideStore.getState().setHidden(true)
		return () => {
			useDockHideStore.getState().setHidden(false)
		}
	}, [])

	return (
		<View style={[styles.container, { paddingTop: headerHeight, backgroundColor: colors.background }]}>
			<PlaylistScreen />
			{/* 返回按钮 */}
			<TouchableOpacity
				style={[styles.closeButton, { top: insets.top + 6, backgroundColor: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.07)' }]}
				onPress={() => router.back()}
				activeOpacity={0.7}
			>
				<SFSymbol systemName="chevron.left" size={24} color={colors.text} />
			</TouchableOpacity>
		</View>
	)
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	closeButton: {
		position: 'absolute',
		left: 16,
		width: 36,
		height: 36,
		borderRadius: 18,
		alignItems: 'center',
		justifyContent: 'center',
		zIndex: 100,
	},
})

export default PlaylistDetailModal
