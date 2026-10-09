import React, { useMemo, useRef, useState } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
	Alert,
	Modal,
	ScrollView,
	StyleSheet,
	Text,
	TouchableOpacity,
	View,
} from 'react-native'
import { BlurView } from 'expo-blur'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useThemeColors, useAppTheme } from '@/hooks/useAppTheme'
import { musicApiStore, musicApiSelectedStore, nowApiState, enabledMusicSourcesStore } from '@/helpers/trackPlayerIndex'
import myTrackPlayer from '@/helpers/trackPlayerIndex'
import PersistStatus from '@/store/PersistStatus'
import { showToast } from '@/utils/utils'
import { createMusicApiFromScript, fetchScriptFromUrl } from '@/helpers/userApi/importMusicSource'
import { reloadLxMusicScript } from '@/helpers/userApi/lxMusicSourceAdapter'
import { logError } from '@/helpers/logger'
import * as DocumentPicker from 'expo-document-picker'
import * as RNFS from 'react-native-fs'

type Props = {
	visible: boolean
	onClose: () => void
}

const TEST_QUALITIES = [
	{ key: '128k', label: '128k' },
	{ key: '320k', label: '320k' },
	{ key: 'flac', label: 'FLAC' },
	{ key: '24bit', label: '24bit' },
	{ key: 'hires', label: 'Hi-Res' },
	{ key: 'master', label: 'Master' },
]

const TEST_SONGS: Record<string, { title: string; artist: string; id: string }> = {
	netease: { title: '稻香', artist: '周杰伦', id: 'netease_185809' },
	qq: { title: '稻香', artist: '周杰伦', id: '004IArbh3ytHgR' },
}

const LxSourceManagerModal = ({ visible, onClose }: Props) => {
	const colors = useThemeColors()
	const { isDark } = useAppTheme()
	const { bottom: safeBottom } = useSafeAreaInsets()
	const musicApis = musicApiStore.useValue()
	const selectedApi = musicApiSelectedStore.useValue()
	const apiState = nowApiState.useValue()
	const enabledSources = enabledMusicSourcesStore.useValue()

	// 音源测试状态
	const [showSourceTest, setShowSourceTest] = useState(false)
	const [testStep, setTestStep] = useState(1)
	const [selectedTestSources, setSelectedTestSources] = useState<string[]>([])
	const [testPlatforms, setTestPlatforms] = useState<string[]>([])
	const [selectedQualities, setSelectedQualities] = useState<string[]>([])
	const [testResults, setTestResults] = useState<any[]>([])
	const [isTesting, setIsTesting] = useState(false)
	const stopTestRef = useRef(false)

	const styles = useMemo(() => createStyles(colors), [colors])

	const handleSelectSource = (sourceId: string, name: string) => {
		myTrackPlayer.setMusicApiAsSelectedById(sourceId)
		showToast(`已切换到 ${name}`, '', 'success')
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
		onClose()
		setTimeout(() => {
			Alert.prompt(
				'导入音源',
				'请输入音源 URL',
				[
					{ text: '取消', style: 'cancel' },
					{
						text: '确定',
						onPress: async (url?: string) => {
							if (!url) {
								Alert.alert('错误', 'URL 不能为空')
								return
							}
							try {
								const sourceCode = await fetchScriptFromUrl(url)
								const musicApi = await createMusicApiFromScript(sourceCode)
								myTrackPlayer.addMusicApi(musicApi)
								setTimeout(async () => {
									await myTrackPlayer.setMusicApiAsSelectedById(musicApi.id)
									Alert.alert('成功', `音源 "${musicApi.name}" 已导入并设置为当前音源`)
								}, 500)
							} catch (error) {
								const errMsg = error instanceof Error ? error.message : String(error)
								Alert.alert('错误', `导入音源失败: ${errMsg}`)
							}
						},
					},
				],
				'plain-text',
			)
		}, 300)
	}

	const importMusicSourceFromFile = async () => {
		onClose()
		setTimeout(async () => {
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
					Alert.alert('成功', `音源 "${musicApi.name}" 已导入并设置为当前音源`)
				}, 500)
			} catch (err) {
				const errMsg = err instanceof Error ? err.message : String(err)
				Alert.alert('导入失败', `无法导入音源: ${errMsg}`)
			}
		}, 300)
	}

	// 音源测试函数
	const runSourceTest = async () => {
		if (selectedTestSources.length === 0 || testPlatforms.length === 0 || selectedQualities.length === 0) return
		stopTestRef.current = false
		setIsTesting(true)
		setTestResults([])

		const results: any[] = []

		for (const sourceId of selectedTestSources) {
			if (stopTestRef.current) break
			let sourceApi: any = musicApis?.find((a: any) => a.id === sourceId)
			if (!sourceApi) continue
			// 重新加载音源脚本，确保getMusicUrl方法有效
			try {
				if (sourceApi.scriptType === 'lxmusic') {
					sourceApi = await reloadLxMusicScript(sourceApi)
				}
			} catch (e) {
				logError('音源测试-重新加载脚本失败:', e)
			}
			const sourceName = sourceApi.name || sourceApi.id || '未知音源'

			for (const platform of testPlatforms) {
				if (stopTestRef.current) break
				const testSong = TEST_SONGS[platform]
				if (!testSong) continue

				for (const quality of selectedQualities) {
					if (stopTestRef.current) break
					const startTime = Date.now()
					try {
						const url = await Promise.race([
							sourceApi.getMusicUrl(testSong.title, testSong.artist, testSong.id, quality),
							new Promise((_, reject) => setTimeout(() => reject(new Error('请求超时(10秒)')), 10000)),
						])
						const duration = Date.now() - startTime
						results.push({
							sourceId,
							sourceName,
							platform,
							quality,
							success: !!url && url !== '',
							url: url || '',
							duration,
							error: null,
						})
					} catch (err: any) {
						const duration = Date.now() - startTime
						results.push({
							sourceId,
							sourceName,
							platform,
							quality,
							success: false,
							url: '',
							duration,
							error: err?.message || '未知错误',
						})
					}
					setTestResults([...results])
				}
			}
		}

		setIsTesting(false)
		setTestStep(4)
	}

	const stopSourceTest = () => {
		stopTestRef.current = true
		setIsTesting(false)
	}

	const resetSourceTest = () => {
		setTestStep(1)
		setSelectedTestSources([])
		setTestPlatforms([])
		setSelectedQualities([])
		setTestResults([])
		setIsTesting(false)
		stopTestRef.current = false
	}

	const toggleTestSource = (sourceId: string) => {
		setSelectedTestSources((prev) =>
			prev.includes(sourceId) ? prev.filter((s) => s !== sourceId) : [...prev, sourceId],
		)
	}

	const togglePlatform = (platform: string) => {
		setTestPlatforms((prev) =>
			prev.includes(platform) ? prev.filter((p) => p !== platform) : [...prev, platform],
		)
	}

	const toggleQuality = (key: string) => {
		setSelectedQualities((prev) =>
			prev.includes(key) ? prev.filter((q) => q !== key) : [...prev, key],
		)
	}

	const selectAllQualities = () => {
		if (selectedQualities.length === TEST_QUALITIES.length) {
			setSelectedQualities([])
		} else {
			setSelectedQualities(TEST_QUALITIES.map((q) => q.key))
		}
	}

	return (
		<>
			{/* LX音源管理主弹窗 */}
			<Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
				<View style={{ flex: 1, justifyContent: 'flex-end' }}>
					<TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
					<View style={[styles.modalContainer, { paddingBottom: safeBottom + 20 }]}>
						<BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
						<View style={styles.modalContent}>
							<View style={styles.modalHandle} />
							<Text style={[styles.modalTitle, { color: colors.text }]}>LX音源管理</Text>
							<Text style={[styles.modalSubtitle, { color: colors.textMuted }]}>
								当前音源：{selectedApi?.name || '无'} · 状态：{apiState} · 已启用：{enabledSources.length}个
							</Text>

							{/* 音源列表 */}
							<ScrollView style={styles.sourceList} nestedScrollEnabled>
								{(musicApis || []).map((api: any) => {
									const isEnabled = enabledSources.includes(api.id)
									const isSelected = selectedApi?.id === api.id
									return (
										<View key={api.id} style={[styles.sourceItem, { backgroundColor: colors.card + '80' }]}>
											<View style={styles.sourceInfo}>
												<TouchableOpacity
													style={[styles.switchBtn, { backgroundColor: isEnabled ? colors.primary : colors.textMuted + '40' }]}
													onPress={() => toggleSourceEnabled(api.id)}
												>
													<View style={[styles.switchDot, { marginLeft: isEnabled ? 20 : 0 }]} />
												</TouchableOpacity>
												<View style={[styles.sourceDot, { backgroundColor: isSelected ? colors.primary : colors.textMuted }]} />
												<Text style={[styles.sourceName, { color: colors.text }]}>{api.name}</Text>
												{isSelected && (
													<Text style={[styles.sourceActive, { color: colors.primary }]}>使用中</Text>
												)}
											</View>
											<View style={styles.sourceActions}>
												{!isSelected && (
													<TouchableOpacity
														style={[styles.actionBtn, { backgroundColor: colors.primary + '20' }]}
														onPress={() => handleSelectSource(api.id, api.name)}
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
									<Text style={[styles.emptyText, { color: colors.textMuted }]}>暂无音源，请导入音源脚本</Text>
								)}
							</ScrollView>

							{/* 底部按钮 */}
							<View style={styles.bottomRow}>
								<TouchableOpacity style={[styles.testBtn, { backgroundColor: colors.primary + '20' }]} onPress={() => { onClose(); setTimeout(() => { setShowSourceTest(true); setTestStep(1); }, 300); }}>
									<SFSymbol systemName="flask" size={18} color={colors.primary} />
									<Text style={[styles.testBtnText, { color: colors.primary }]}>音源测试</Text>
								</TouchableOpacity>
								<TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.primary }]} onPress={importMusicSourceFromUrl}>
									<SFSymbol systemName="link" size={18} color="#ffffff" />
									<Text style={styles.importBtnText}>URL</Text>
								</TouchableOpacity>
								<TouchableOpacity style={[styles.importBtn, { backgroundColor: colors.primary }]} onPress={importMusicSourceFromFile}>
									<SFSymbol systemName="doc.text" size={18} color="#ffffff" />
									<Text style={styles.importBtnText}>文件</Text>
								</TouchableOpacity>
							</View>
						</View>
					</View>
				</View>
			</Modal>

			{/* 音源测试弹窗 */}
			<Modal visible={showSourceTest} transparent animationType="slide" onRequestClose={() => { setShowSourceTest(false); resetSourceTest(); }}>
				<View style={{ flex: 1, justifyContent: 'flex-end' }}>
					<TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => { setShowSourceTest(false); resetSourceTest(); }} />
					<View style={[styles.testModalContainer, { paddingBottom: safeBottom + 20 }]}>
						<BlurView intensity={60} tint={isDark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
						<View style={styles.testModalContent}>
							<View style={styles.modalHandle} />

							{/* 步骤1：选择音源 */}
							{testStep === 1 && (
								<>
									<Text style={[styles.testModalTitle, { color: colors.text }]}>音源测试</Text>
									<Text style={[styles.testModalSubtitle, { color: colors.textMuted }]}>选择要测试的音源（可多选）</Text>
									<TouchableOpacity style={styles.testSelectAll} onPress={() => {
										if (selectedTestSources.length === (musicApis?.length || 0)) setSelectedTestSources([])
										else setSelectedTestSources((musicApis || []).map((a: any) => a.id))
									}}>
										<Text style={[styles.testSelectAllText, { color: colors.primary }]}>
											{selectedTestSources.length === (musicApis?.length || 0) && (musicApis?.length || 0) > 0 ? '取消全选' : '全选'}
										</Text>
									</TouchableOpacity>
									<ScrollView style={styles.testList} nestedScrollEnabled>
										{(musicApis || []).map((api: any) => (
											<TouchableOpacity key={api.id} style={[styles.testItem, selectedTestSources.includes(api.id) && { backgroundColor: colors.primary + '15', borderColor: colors.primary }]} onPress={() => toggleTestSource(api.id)}>
												<View style={[styles.testCheckbox, selectedTestSources.includes(api.id) && { backgroundColor: colors.primary }]}>
													{selectedTestSources.includes(api.id) && <SFSymbol systemName="checkmark" size={14} color="#ffffff" />}
												</View>
												<View style={{ flex: 1 }}>
													<Text style={[styles.testItemLabel, { color: colors.text }]}>{api.name || api.id || '未知音源'}</Text>
													{api.author && <Text style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>{api.author}</Text>}
												</View>
												{selectedApi?.id === api.id && <Text style={{ fontSize: 11, color: colors.primary, fontWeight: '500' }}>当前</Text>}
											</TouchableOpacity>
										))}
										{(!musicApis || musicApis.length === 0) && (
											<Text style={{ textAlign: 'center', padding: 30, color: colors.textMuted }}>暂无音源，请先导入音源</Text>
										)}
									</ScrollView>
									<TouchableOpacity style={[styles.testNextBtn, { backgroundColor: selectedTestSources.length > 0 ? colors.primary : colors.textMuted + '40' }]} disabled={selectedTestSources.length === 0} onPress={() => setTestStep(2)}>
										<Text style={styles.testNextBtnText}>下一步（已选{selectedTestSources.length}个音源）</Text>
									</TouchableOpacity>
								</>
							)}

							{/* 步骤2：选择平台 */}
							{testStep === 2 && (
								<>
									<Text style={[styles.testModalTitle, { color: colors.text }]}>选择平台</Text>
									<Text style={[styles.testModalSubtitle, { color: colors.textMuted }]}>选择要测试的音乐平台（可多选）</Text>
									<View style={styles.testPlatformList}>
										<TouchableOpacity style={[styles.testPlatformItem, testPlatforms.includes('netease') && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]} onPress={() => togglePlatform('netease')}>
											<View style={[styles.testCheckbox, testPlatforms.includes('netease') && { backgroundColor: colors.primary }]}>
												{testPlatforms.includes('netease') && <SFSymbol systemName="checkmark" size={14} color="#ffffff" />}
											</View>
											<SFSymbol systemName="music.note" size={24} color={testPlatforms.includes('netease') ? colors.primary : colors.textMuted} />
											<Text style={[styles.testPlatformText, { color: testPlatforms.includes('netease') ? colors.primary : colors.text }]}>网易云音乐</Text>
										</TouchableOpacity>
										<TouchableOpacity style={[styles.testPlatformItem, testPlatforms.includes('qq') && { backgroundColor: colors.primary + '20', borderColor: colors.primary }]} onPress={() => togglePlatform('qq')}>
											<View style={[styles.testCheckbox, testPlatforms.includes('qq') && { backgroundColor: colors.primary }]}>
												{testPlatforms.includes('qq') && <SFSymbol systemName="checkmark" size={14} color="#ffffff" />}
											</View>
											<SFSymbol systemName="headphones" size={24} color={testPlatforms.includes('qq') ? colors.primary : colors.textMuted} />
											<Text style={[styles.testPlatformText, { color: testPlatforms.includes('qq') ? colors.primary : colors.text }]}>QQ音乐</Text>
										</TouchableOpacity>
									</View>
									<TouchableOpacity style={[styles.testNextBtn, { backgroundColor: testPlatforms.length > 0 ? colors.primary : colors.textMuted + '40' }]} disabled={testPlatforms.length === 0} onPress={() => setTestStep(3)}>
										<Text style={styles.testNextBtnText}>下一步（已选{testPlatforms.length}个平台）</Text>
									</TouchableOpacity>
								</>
							)}

							{/* 步骤3：选择音质并测试 */}
							{testStep === 3 && (
								<>
									<View style={styles.testHeaderRow}>
										<TouchableOpacity onPress={() => setTestStep(2)}><SFSymbol systemName="chevron.left" size={24} color={colors.text} /></TouchableOpacity>
										<Text style={[styles.testModalTitle, { color: colors.text, flex: 1, textAlign: 'center' }]}>选择音质</Text>
										<View style={{ width: 24 }} />
									</View>
									<Text style={[styles.testModalSubtitle, { color: colors.textMuted }]}>测试歌曲：稻香 - 周杰伦（{testPlatforms.length}个平台）</Text>
									<TouchableOpacity style={styles.testSelectAll} onPress={selectAllQualities}>
										<Text style={[styles.testSelectAllText, { color: colors.primary }]}>{selectedQualities.length === TEST_QUALITIES.length ? '取消全选' : '全选'}</Text>
									</TouchableOpacity>
									<ScrollView style={styles.testList} nestedScrollEnabled>
										{TEST_QUALITIES.map((q) => (
											<TouchableOpacity key={q.key} style={[styles.testItem, selectedQualities.includes(q.key) && { backgroundColor: colors.primary + '15', borderColor: colors.primary }]} onPress={() => toggleQuality(q.key)}>
												<View style={[styles.testCheckbox, selectedQualities.includes(q.key) && { backgroundColor: colors.primary }]}>
													{selectedQualities.includes(q.key) && <SFSymbol systemName="checkmark" size={14} color="#ffffff" />}
												</View>
												<Text style={[styles.testItemLabel, { color: colors.text }]}>{q.label}</Text>
											</TouchableOpacity>
										))}
									</ScrollView>
									<View style={{ flexDirection: 'row', gap: 12 }}>
										{isTesting && (
											<TouchableOpacity style={[styles.testNextBtn, { flex: 1, backgroundColor: '#ff3b30' }]} onPress={stopSourceTest}>
												<Text style={styles.testNextBtnText}>停止测试</Text>
											</TouchableOpacity>
										)}
										<TouchableOpacity style={[styles.testNextBtn, { flex: isTesting ? 2 : 1, backgroundColor: selectedQualities.length > 0 && !isTesting ? colors.primary : colors.textMuted + '40' }]} disabled={selectedQualities.length === 0 || isTesting} onPress={runSourceTest}>
											<Text style={styles.testNextBtnText}>{isTesting ? '测试中...(' + testResults.length + '/' + (selectedTestSources.length * testPlatforms.length * selectedQualities.length) + ')' : '开始测试 (' + selectedQualities.length + '项)'}</Text>
										</TouchableOpacity>
									</View>
								</>
							)}

							{/* 步骤4：测试结果 */}
							{testStep === 4 && (
								<>
									<View style={styles.testHeaderRow}>
										<TouchableOpacity onPress={() => setTestStep(3)}><SFSymbol systemName="chevron.left" size={24} color={colors.text} /></TouchableOpacity>
										<Text style={[styles.testModalTitle, { color: colors.text, flex: 1, textAlign: 'center' }]}>测试结果</Text>
										<View style={{ width: 24 }} />
									</View>
									<Text style={[styles.testModalSubtitle, { color: colors.textMuted }]}>成功 {testResults.filter((r: any) => r.success).length}/{testResults.length}</Text>
									<ScrollView style={styles.testResultList} nestedScrollEnabled>
										{(() => {
											const grouped: Record<string, any> = {}
											testResults.forEach((r: any) => {
												if (!grouped[r.sourceId]) grouped[r.sourceId] = { name: r.sourceName, items: [] }
												grouped[r.sourceId].items.push(r)
											})
											return Object.entries(grouped).map(([sid, group]: any, gIdx) => {
												const successCount = group.items.filter((r: any) => r.success).length
												return (
													<View key={sid}>
														{gIdx > 0 && <View style={[styles.testResultDivider, { backgroundColor: colors.textMuted + '30' }]} />}
														<View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
															<Text style={{ color: colors.primary, fontSize: 16, fontWeight: '500', flex: 1 }}>{group.name || sid || '未知音源'}</Text>
															<Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '500' }}>成功 {successCount}/{group.items.length}</Text>
														</View>
														{group.items.map((result: any, idx: number) => (
															<View key={idx} style={[styles.testResultItem, { backgroundColor: colors.card + '80' }]}>
																<View style={styles.testResultHeader}>
																	<Text style={[styles.testResultQuality, { color: colors.text }]}>{result.sourceName || result.sourceId} · {result.platform === 'netease' ? '网易云' : 'QQ'} · {TEST_QUALITIES.find((q) => q.key === result.quality)?.label}</Text>
																	{result.success ? (
																		<View style={[styles.testResultBadge, { backgroundColor: '#34c75920' }]}>
																			<SFSymbol systemName="checkmark" size={14} color="#34c759" />
																			<Text style={[styles.testResultBadgeText, { color: '#34c759' }]}>成功</Text>
																		</View>
																	) : (
																		<View style={[styles.testResultBadge, { backgroundColor: '#ff3b3020' }]}>
																			<SFSymbol systemName="xmark" size={14} color="#ff3b30" />
																			<Text style={[styles.testResultBadgeText, { color: '#ff3b30' }]}>失败</Text>
																		</View>
																	)}
																</View>
																<Text style={[styles.testResultDuration, { color: colors.textMuted }]}>耗时: {result.duration}ms</Text>
																{result.success && result.url ? (
																	<Text style={[styles.testResultUrl, { color: colors.textMuted }]} numberOfLines={2}>{result.url}</Text>
																) : (
																	<Text style={[styles.testResultUrl, { color: '#ff3b30' }]}>{result.error || '返回空链接'}</Text>
																)}
															</View>
														))}
													</View>
												)
											})
										})()}
									</ScrollView>
									<View style={{ flexDirection: 'row', gap: 12 }}>
										<TouchableOpacity style={[styles.testNextBtn, { flex: 1, backgroundColor: colors.textMuted + '30' }]} onPress={resetSourceTest}>
											<Text style={[styles.testNextBtnText, { color: colors.text }]}>重新测试</Text>
										</TouchableOpacity>
										<TouchableOpacity style={[styles.testNextBtn, { flex: 1, backgroundColor: colors.primary }]} onPress={() => { setShowSourceTest(false); resetSourceTest() }}>
											<Text style={styles.testNextBtnText}>完成</Text>
										</TouchableOpacity>
									</View>
								</>
							)}
						</View>
					</View>
				</View>
			</Modal>
		</>
	)
}

const createStyles = (colors: any) =>
	StyleSheet.create({
		modalContainer: {
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			overflow: 'hidden',
			maxHeight: '88%',
		},
		modalContent: {
			padding: 20,
		},
		modalHandle: {
			width: 40,
			height: 5,
			borderRadius: 3,
			backgroundColor: colors.textMuted + '60',
			alignSelf: 'center',
			marginBottom: 16,
		},
		modalTitle: {
			fontSize: 20,
			fontWeight: '500',
			marginBottom: 4,
		},
		modalSubtitle: {
			fontSize: 13,
			marginBottom: 16,
		},
		sourceList: {
			maxHeight: 280,
		},
		sourceItem: {
			borderRadius: 12,
			padding: 14,
			marginBottom: 10,
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
			marginRight: 10,
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
			flex: 1,
			fontSize: 15,
			fontWeight: '500',
		},
		sourceActive: {
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
		emptyText: {
			textAlign: 'center',
			padding: 30,
			fontSize: 14,
		},
		bottomRow: {
			flexDirection: 'row',
			gap: 10,
			marginTop: 16,
		},
		testBtn: {
			flex: 1,
			flexDirection: 'row',
			justifyContent: 'center',
			alignItems: 'center',
			paddingVertical: 12,
			borderRadius: 12,
			gap: 6,
		},
		testBtnText: {
			fontSize: 15,
			fontWeight: '500',
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
		// 测试弹窗样式
		testModalContainer: {
			borderTopLeftRadius: 24,
			borderTopRightRadius: 24,
			overflow: 'hidden',
			maxHeight: '85%',
		},
		testModalContent: {
			padding: 20,
		},
		testModalTitle: {
			fontSize: 20,
			fontWeight: '500',
			marginBottom: 4,
		},
		testModalSubtitle: {
			fontSize: 13,
			marginBottom: 12,
		},
		testSelectAll: {
			alignSelf: 'flex-end',
			paddingVertical: 6,
			paddingHorizontal: 12,
		},
		testSelectAllText: {
			fontSize: 14,
			fontWeight: '500',
		},
		testList: {
			maxHeight: 300,
			marginBottom: 16,
		},
		testItem: {
			flexDirection: 'row',
			alignItems: 'center',
			padding: 14,
			borderRadius: 12,
			borderWidth: 1,
			borderColor: 'transparent',
			marginBottom: 8,
			backgroundColor: colors.card + '60',
		},
		testCheckbox: {
			width: 22,
			height: 22,
			borderRadius: 6,
			borderWidth: 2,
			borderColor: colors.textMuted + '40',
			justifyContent: 'center',
			alignItems: 'center',
			marginRight: 12,
		},
		testItemLabel: {
			fontSize: 15,
			fontWeight: '500',
		},
		testPlatformList: {
			flexDirection: 'row',
			gap: 12,
			marginBottom: 16,
		},
		testPlatformItem: {
			flex: 1,
			flexDirection: 'row',
			alignItems: 'center',
			padding: 16,
			borderRadius: 12,
			borderWidth: 1,
			borderColor: 'transparent',
			backgroundColor: colors.card + '60',
			gap: 10,
		},
		testPlatformText: {
			fontSize: 14,
			fontWeight: '500',
		},
		testNextBtn: {
			paddingVertical: 14,
			borderRadius: 12,
			alignItems: 'center',
		},
		testNextBtnText: {
			color: '#fff',
			fontSize: 15,
			fontWeight: '500',
		},
		testHeaderRow: {
			flexDirection: 'row',
			alignItems: 'center',
			marginBottom: 8,
		},
		testResultList: {
			maxHeight: 350,
			marginBottom: 16,
		},
		testResultDivider: {
			height: 1,
			marginVertical: 12,
		},
		testResultSourceName: {
			fontSize: 14,
			fontWeight: '500',
			marginBottom: 8,
		},
		testResultItem: {
			borderRadius: 10,
			padding: 12,
			marginBottom: 8,
		},
		testResultHeader: {
			flexDirection: 'row',
			justifyContent: 'space-between',
			alignItems: 'center',
			marginBottom: 4,
		},
		testResultQuality: {
			fontSize: 14,
			fontWeight: '500',
		},
		testResultBadge: {
			flexDirection: 'row',
			alignItems: 'center',
			paddingHorizontal: 8,
			paddingVertical: 4,
			borderRadius: 6,
			gap: 4,
		},
		testResultBadgeText: {
			fontSize: 12,
			fontWeight: '500',
		},
		testResultDuration: {
			fontSize: 12,
			marginBottom: 2,
		},
		testResultUrl: {
			fontSize: 11,
		},
	})

export default LxSourceManagerModal
