import React, { useEffect, useMemo, useRef, useState } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
	Alert,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import { musicApiStore, musicApiSelectedStore, nowApiState, enabledMusicSourcesStore } from '@/helpers/trackPlayerIndex'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import PersistStatus from '@/store/PersistStatus'
import { showToast } from '@/utils/utils'
import { createMusicApiFromScript, fetchScriptFromUrl } from '@/helpers/userApi/importMusicSource'
import * as DocumentPicker from 'expo-document-picker'
import * as RNFS from 'react-native-fs'
import { logInfo, logError } from '@/helpers/logger'

const LxSourceManager = () => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const musicApis = musicApiStore.useValue()
	const selectedApi = musicApiSelectedStore.useValue()
	const apiState = nowApiState.useValue()
	const enabledSources = enabledMusicSourcesStore.useValue()

	const styles = useMemo(() => createStyles(colors), [colors])

	const handleSelectSource = (sourceId: string) => {
		myTrackPlayer.setMusicApiAsSelectedById(sourceId)
		showToast('已切换音源', '', 'success')
	}

	const handleDeleteSource = (sourceId: string, name: string) => {
		Alert.alert('删除音源', `确定删除音源 "${name}" 吗？`, [
			{ text: '取消', style: 'cancel' },
			{
				text: '删除',
				style: 'destructive',
				onPress: () => {
					myTrackPlayer.deleteMusicApiById(sourceId)
					showToast('音源已删除', '', 'success')
				},
			},
		])
	}

	const toggleSourceEnabled = (apiId: string) => {
		const isEnabled = enabledSources.includes(apiId)
		const next = isEnabled ? enabledSources.filter((id: string) => id !== apiId) : [...enabledSources, apiId]
		enabledMusicSourcesStore.setValue(next)
		PersistStatus.set('music.enabledMusicSources', next)
	}

	const importMusicSourceFromUrl = async () => {
		Alert.prompt(
			'导入音源',
			'请输入音源 URL',
			[
				{ text: '取消', style: 'cancel' },
				{
					text: '确定',
					onPress: async (url?: string) => {
						if (!url) {
							showToast('导入失败', 'URL 不能为空，请输入有效的音源链接', 'error')
							return
						}
						try {
							const sourceCode = await fetchScriptFromUrl(url)
							const musicApi = await createMusicApiFromScript(sourceCode)
							myTrackPlayer.addMusicApi(musicApi)
							setTimeout(async () => {
								await myTrackPlayer.setMusicApiAsSelectedById(musicApi.id)
								showToast('音源导入成功', `音源「${musicApi.name}」已导入并设置为当前音源`, 'success')
							}, 500)
						} catch (error) {
							const errMsg = error instanceof Error ? error.message : String(error)
							showToast('导入失败', `无法导入音源: ${errMsg}`, 'error')
						}
					},
				},
			],
			'plain-text',
		)
	}

	const importMusicSourceFromFile = async () => {
		try {
			const result = await DocumentPicker.getDocumentAsync({
				type: 'text/javascript',
				copyToCacheDirectory: false,
			})
			if (result.canceled === true) return
			const fileUri = decodeURIComponent(result.assets[0].uri)
			const fileContents = await RNFS.readFile(fileUri, 'utf8')
			const musicApi = await createMusicApiFromScript(fileContents)
			myTrackPlayer.addMusicApi(musicApi)
			setTimeout(async () => {
				await myTrackPlayer.setMusicApiAsSelectedById(musicApi.id)
				showToast('音源导入成功', `音源「${musicApi.name}」已导入并设置为当前音源`, 'success')
			}, 500)
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : String(err)
			showToast('导入失败', `无法导入音源: ${errMsg}`, 'error')
		}
	}

	return (
		<SafeAreaView style={styles.container} edges={['top']}>
			{/* 导航栏 */}
			<View style={styles.header}>
				<TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
					<SFSymbol systemName="chevron.left" size={24} color={colors.text} />
				</TouchableOpacity>
			</View>

			{/* 当前音源状态 */}
			<View style={styles.statusCard}>
				<BlurView intensity={40} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
				<View style={styles.statusContent}>
					<View style={styles.statusRow}>
						<Text style={styles.statusLabel}>当前音源</Text>
						<Text style={[styles.statusValue, { color: colors.primary }]}>
							{selectedApi?.name || '无'}
						</Text>
					</View>
					<View style={styles.statusRow}>
						<Text style={styles.statusLabel}>状态</Text>
						<Text style={styles.statusValue}>{apiState || '未知'}</Text>
					</View>
					<View style={styles.statusRow}>
						<Text style={styles.statusLabel}>已启用</Text>
						<Text style={styles.statusValue}>{enabledSources.length} 个音源</Text>
					</View>
				</View>
			</View>

			{/* 音源列表 */}
			<Text style={styles.sectionTitle}>音源列表</Text>
			<ScrollView style={styles.sourceList} contentContainerStyle={{ paddingBottom: 100 }}>
				{(musicApis || []).map((api: any) => {
					const isEnabled = enabledSources.includes(api.id)
					const isSelected = selectedApi?.id === api.id
					return (
						<View key={api.id} style={[styles.sourceItem, isSelected && styles.sourceItemSelected, { backgroundColor: isSelected ? colors.primary + '12' : colors.card }]}>
							{/* 选中指示器 */}
							{isSelected && <View style={[styles.selectedIndicator, { backgroundColor: colors.primary }]} />}
							<View style={styles.sourceInfo}>
								{/* 启用开关 */}
								<TouchableOpacity
									style={[styles.switchBtn, { backgroundColor: isEnabled ? colors.primary : colors.textMuted + '40' }]}
									onPress={() => toggleSourceEnabled(api.id)}
								>
									<View style={[styles.switchDot, { marginLeft: isEnabled ? 20 : 0 }]} />
								</TouchableOpacity>
								<View style={{ flex: 1 }}>
									<Text style={[styles.sourceName, { color: colors.text }]} numberOfLines={1}>
										{api.name}
									</Text>
									{api.author && (
										<Text style={[styles.sourceAuthor, { color: colors.textMuted }]} numberOfLines={1}>
											{api.author} {api.version ? `v${api.version}` : ''}
										</Text>
									)}
								</View>
								{isSelected && (
									<View style={[styles.activeBadge, { backgroundColor: colors.primary + '20' }]}>
										<Text style={[styles.activeText, { color: colors.primary }]}>使用中</Text>
									</View>
								)}
							</View>
							<View style={styles.sourceActions}>
								{!isSelected && (
									<TouchableOpacity
										style={[styles.actionBtn, { backgroundColor: colors.primary + '20' }]}
										onPress={() => handleSelectSource(api.id)}
									>
										<Text style={[styles.actionBtnText, { color: colors.primary }]}>切换</Text>
									</TouchableOpacity>
								)}
								<TouchableOpacity
									style={[styles.actionBtn, { backgroundColor: '#ff3b3020' }]}
									onPress={() => handleDeleteSource(api.id, api.name)}
								>
									<Text style={[styles.actionBtnText, { color: '#ff3b30' }]}>删除</Text>
								</TouchableOpacity>
							</View>
						</View>
					)
				})}
				{(!musicApis || musicApis.length === 0) && (
					<View style={styles.emptyContainer}>
						<SFSymbol systemName="cloud" size={48} color={colors.textMuted} />
						<Text style={[styles.emptyText, { color: colors.textMuted }]}>暂无音源，请导入音源脚本</Text>
					</View>
				)}
			</ScrollView>

			{/* 底部导入按钮 */}
			<View style={styles.bottomBar}>
				<BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
				<View style={styles.bottomContent}>
					<TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.primary }]} onPress={importMusicSourceFromUrl}>
						<SFSymbol systemName="link" size={18} color="#ffffff" />
						<Text style={styles.importBtnText}>URL导入</Text>
					</TouchableOpacity>
					<TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.primary }]} onPress={importMusicSourceFromFile}>
						<SFSymbol systemName="doc.text" size={18} color="#ffffff" />
						<Text style={styles.importBtnText}>文件导入</Text>
					</TouchableOpacity>
				</View>
			</View>
		</SafeAreaView>
	)
}

const createStyles = (colors: any) =>
	StyleSheet.create({
		container: {
			flex: 1,
			backgroundColor: colors.background,
		},
		header: {
			flexDirection: 'row',
			alignItems: 'center',
			justifyContent: 'space-between',
			paddingHorizontal: 16,
			height: 50,
		},
		backBtn: {
			width: 40,
			height: 40,
			justifyContent: 'center',
			alignItems: 'center',
		},
		headerTitle: {
			fontSize: 18,
			fontWeight: '500',
			color: colors.text,
		},
		statusCard: {
			marginHorizontal: 16,
			marginBottom: 16,
			borderRadius: 16,
			overflow: 'hidden',
			borderWidth: 1,
			borderColor: colors.border,
		},
		statusContent: {
			padding: 16,
		},
		statusRow: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'center',
			paddingVertical: 6,
		},
		statusLabel: {
			fontSize: 14,
			color: colors.textMuted,
		},
		statusValue: {
			fontSize: 14,
			fontWeight: '500',
			color: colors.text,
		},
		sectionTitle: {
			fontSize: 16,
			fontWeight: '500',
			color: colors.text,
			paddingHorizontal: 16,
			marginBottom: 12,
		},
		sourceList: {
			flex: 1,
			paddingHorizontal: 16,
		},
		sourceItem: {
			borderRadius: 12,
			padding: 14,
			marginBottom: 10,
			overflow: 'hidden',
		},
		sourceItemSelected: {
			borderWidth: 0,
		},
		selectedIndicator: {
			position: 'absolute',
			left: 0,
			top: 0,
			bottom: 0,
			width: 3,
		},
		sourceInfo: {
			flexDirection: 'row',
			alignItems: 'center',
			marginBottom: 10,
		},
		switchBtn: {
			width: 44,
			height: 24,
			borderRadius: 12,
			justifyContent: 'center',
			padding: 2,
			marginRight: 12,
		},
		switchDot: {
			width: 20,
			height: 20,
			borderRadius: 10,
			backgroundColor: '#fff',
		},
		sourceDot: {
			width: 8,
			height: 8,
			borderRadius: 4,
			marginRight: 10,
		},
		sourceName: {
			fontSize: 15,
			fontWeight: '500',
		},
		sourceAuthor: {
			fontSize: 12,
			marginTop: 2,
		},
		activeBadge: {
			paddingHorizontal: 8,
			paddingVertical: 4,
			borderRadius: 6,
			marginLeft: 8,
		},
		activeText: {
			fontSize: 12,
			fontWeight: '500',
		},
		sourceActions: {
			flexDirection: 'row',
			justifyContent: 'flex-end',
			gap: 10,
		},
		actionBtn: {
			paddingHorizontal: 16,
			paddingVertical: 6,
			borderRadius: 8,
		},
		actionBtnText: {
			fontSize: 13,
			fontWeight: '500',
		},
		emptyContainer: {
			alignItems: 'center',
			paddingVertical: 60,
		},
		emptyText: {
			fontSize: 14,
			marginTop: 12,
		},
		bottomBar: {
			position: 'absolute',
			bottom: 0,
			left: 0,
			right: 0,
			borderTopWidth: 1,
			borderTopColor: colors.border,
		},
		bottomContent: {
			flexDirection: 'row',
			padding: 16,
			gap: 12,
		},
		importBtn: {
			flex: 1,
			flexDirection: 'row',
			justifyContent: 'center',
			alignItems: 'center',
			paddingVertical: 12,
			borderRadius: 12,
			gap: 6,
		},
		importBtnText: {
			color: '#fff',
			fontSize: 15,
			fontWeight: '500',
		},
	})

export default LxSourceManager
