import { musicApiStore } from '@/helpers/trackPlayerIndex'
import { parseLxMusicScriptInfo, adaptLxMusicScript } from '@/helpers/userApi/lxMusicSourceAdapter'
import { showToast } from '@/utils/utils'
import { logInfo, logError } from '@/helpers/logger'
import { Alert } from 'react-native'
import PersistStatus from '@/store/PersistStatus'

/**
 * 从脚本内容中提取 srcUrl（更新地址）
 */
export const extractSrcUrl = (script: string): string => {
	if (!script) return ''
	const patterns = [
		/srcUrl\s*[:=]\s*['"`]([^'"`]+)['"`]/,
		/srcUrl\s*[:=]\s*([^\s,;}\]]+)/,
	]
	for (const pattern of patterns) {
		const match = script.match(pattern)
		if (match && match[1] && /^https?:\/\//.test(match[1].trim())) {
			return match[1].trim()
		}
	}
	const headerMatch = script.match(/@srcUrl\s+(\S+)/)
	if (headerMatch && headerMatch[1] && /^https?:\/\//.test(headerMatch[1])) {
		return headerMatch[1].trim()
	}
	return ''
}

/**
 * 检查单个音源是否有更新
 */
export const checkSingleSourceUpdate = async (
	musicApi: any,
): Promise<{ hasUpdate: boolean; remoteVersion: string; localVersion: string; srcUrl: string; remoteScript?: string } | null> => {
	try {
		if (musicApi.scriptType === 'builtin' || musicApi.id === 'builtin_multi_platform') return null

		const srcUrl = extractSrcUrl(musicApi.script || '') || musicApi.srcUrl || ''
		const localVersion = musicApi.version || parseLxMusicScriptInfo(musicApi.script || '').version || ''

		logInfo(`[sourceUpdate] 检查音源: ${musicApi.name}, 本地版本: ${localVersion}, 更新地址: ${srcUrl || '无'}`)

		if (!srcUrl || !/^https?:\/\//.test(srcUrl)) {
			logInfo(`[sourceUpdate] ${musicApi.name}: 无有效更新地址，跳过`)
			return null
		}

		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 10000)
		let resp: Response
		try {
			resp = await fetch(srcUrl, {
				signal: controller.signal,
				headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
			})
		} finally {
			clearTimeout(timeout)
		}

		if (!resp.ok) {
			logInfo(`[sourceUpdate] ${musicApi.name}: 拉取失败 HTTP ${resp.status}`)
			return null
		}
		const remoteScript = await resp.text()
		if (!remoteScript || remoteScript.length < 50) {
			logInfo(`[sourceUpdate] ${musicApi.name}: 远程脚本内容太短，无效`)
			return null
		}

		const remoteInfo = parseLxMusicScriptInfo(remoteScript)
		const remoteVersion = remoteInfo.version || ''

		logInfo(`[sourceUpdate] ${musicApi.name}: 远程版本: ${remoteVersion}, 本地版本: ${localVersion}`)

		if (!remoteVersion) {
			logInfo(`[sourceUpdate] ${musicApi.name}: 远程脚本无版本号，无法比较`)
			return null
		}

		const hasUpdate = remoteVersion !== localVersion
		return { hasUpdate, remoteVersion, localVersion, srcUrl, remoteScript }
	} catch (e: any) {
		logError(`[sourceUpdate] ${musicApi?.name || 'unknown'}: 检查失败 - ${e.message || e}`)
		return null
	}
}

/**
 * 检查所有音源的更新
 */
export const checkAllSourceUpdates = async (): Promise<
	Array<{ api: any; remoteVersion: string; localVersion: string; remoteScript?: string }>
> => {
	const allApis = musicApiStore.getValue() || []
	logInfo(`[sourceUpdate] 开始检查 ${allApis.length} 个音源更新`)
	const updatable: Array<{ api: any; remoteVersion: string; localVersion: string; remoteScript?: string }> = []

	for (const api of allApis) {
		const result = await checkSingleSourceUpdate(api)
		if (result && result.hasUpdate) {
			updatable.push({ api, remoteVersion: result.remoteVersion, localVersion: result.localVersion, remoteScript: result.remoteScript })
		}
	}

	logInfo(`[sourceUpdate] 检查完成，发现 ${updatable.length} 个可更新音源`)
	return updatable
}

/**
 * 自动更新单个音源（下载远程脚本并替换）
 */
export const updateSingleSource = async (api: any, remoteScript: string): Promise<boolean> => {
	try {
		const newApi = await adaptLxMusicScript(remoteScript)
		// 保留原ID和选中状态
		const allApis = musicApiStore.getValue() || []
		const idx = allApis.findIndex((a: any) => a.id === api.id)
		if (idx === -1) return false

		const updated = [...allApis]
		updated[idx] = {
			...newApi,
			id: api.id,
			isSelected: allApis[idx].isSelected,
		}
		musicApiStore.setValue(updated)
		PersistStatus.set('music.musicApi', updated)
		logInfo(`[sourceUpdate] 音源更新成功: ${api.name} -> ${newApi.version}`)
		return true
	} catch (e) {
		logError(`[sourceUpdate] 音源更新失败 ${api?.name}:`, e)
		return false
	}
}

/**
 * 一键更新所有可更新音源
 */
export const autoUpdateAllSources = async (updatable: Array<{ api: any; remoteScript?: string }>): Promise<{ success: number; failed: number }> => {
	let success = 0
	let failed = 0
	for (const item of updatable) {
		if (!item.remoteScript) {
			failed++
			continue
		}
		const ok = await updateSingleSource(item.api, item.remoteScript)
		if (ok) success++
		else failed++
	}
	return { success, failed }
}

/**
 * 启动时检查音源更新，有更新则弹窗提示
 */
export const checkSourceUpdatesOnLaunch = async (router?: any): Promise<void> => {
	try {
		// 永久关闭了启动更新弹窗则不再提示（仍可在音源中心手动检查）
		if (PersistStatus.get('music.sourceUpdateAlertDisabled') === 'true') {
			logInfo('[sourceUpdate] 启动更新弹窗已被永久关闭，跳过')
			return
		}
		const updatable = await checkAllSourceUpdates()
		if (updatable.length === 0) return

		const names = updatable.map((u) => `${u.api.name} (${u.localVersion || '未知'} → ${u.remoteVersion})`).join('\n')
		Alert.alert(
			'音源更新可用',
			`发现 ${updatable.length} 个音源有更新：\n\n${names}`,
			[
				{ text: '稍后', style: 'cancel' },
				{
					text: '永久关闭提醒',
					style: 'destructive',
					onPress: () => {
						PersistStatus.set('music.sourceUpdateAlertDisabled', 'true')
						showToast('已关闭音源更新弹窗，可在音源中心重新开启', '', 'info')
					},
				},
				{
					text: '一键更新',
					onPress: async () => {
						showToast('正在更新音源...', '', 'info')
						const { success, failed } = await autoUpdateAllSources(updatable)
						if (failed === 0) {
							showToast(`全部更新成功（${success}个）`, '', 'success')
						} else {
							showToast(`更新完成：成功${success}个，失败${failed}个`, '', 'info')
						}
					},
				},
			],
		)
	} catch (e) {
		logError(`[sourceUpdate] 启动检查失败: ${e}`)
	}
}
