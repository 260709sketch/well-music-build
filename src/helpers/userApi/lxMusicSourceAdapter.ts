/**
 * lx-music 音源脚本适配器
 *
 * 使用 Well Music 已有的 UserApiModule 原生模块（QuickJS 引擎）执行 lx-music 脚本，
 * 将其事件通信机制包装为 Well Music 的 getMusicUrl 函数。
 */

import type {
	RequestParams,
	ResponseParams,
} from '@/components/utils/nativeModules/userApi'
import {
	loadScript,
	onScriptAction,
	sendAction,
	destroy
} from '@/components/utils/nativeModules/userApi'
import { Buffer } from 'buffer'
import { logError, logInfo } from '../logger'

// ============================================================
// 格式检测
// ============================================================

export const isLxMusicScript = (script: string): boolean => {
	const hasHeader = /^\/\*[\s\S]+?\*\//.test(script.trim())
	if (!hasHeader) return false
	const hasLxApi =
		/\bEVENT_NAMES\b/.test(script) ||
		/\blx\s*\.\s*(on|send)\b/.test(script) ||
		/\blxu?\s*\.\s*(on|send|request|EVENT_NAMES)\b/.test(script) ||
		/\bglobalThis\s*\.\s*lx/.test(script)
	const isWellFormat = /module\s*\.\s*exports\s*\.\s*getMusicUrl/.test(script)
	return hasLxApi && !isWellFormat
}

// ============================================================
// 元信息解析
// ============================================================

const INFO_NAMES = {
	name: 24,
	description: 256,
	author: 56,
	homepage: 1024,
	version: 36,
} as const

type InfoKeys = keyof typeof INFO_NAMES

export const parseLxMusicScriptInfo = (
	script: string,
): Record<InfoKeys, string> => {
	const headerMatch = /^\/\*[\s\S]+?\*\//.exec(script.trim())
	const infos: Partial<Record<InfoKeys, string>> = {}

	if (headerMatch) {
		const lines = headerMatch[0].split(/\r?\n/)
		const rxp = /^\s?\*\s?@(\w+)\s(.+)$/
		for (const line of lines) {
			const result = rxp.exec(line)
			if (!result) continue
			const key = result[1] as InfoKeys
			if (INFO_NAMES[key] == null) continue
			infos[key] = result[2].trim()
		}
	}

	for (const [key, maxLen] of Object.entries(INFO_NAMES) as Array<
		[InfoKeys, number]
	>) {
		infos[key] ||= ''
		if (infos[key]!.length > maxLen)
			infos[key] = infos[key]!.substring(0, maxLen) + '...'
	}

	return infos as Record<InfoKeys, string>
}


// 从脚本内容提取 srcUrl（更新地址）
export const extractSrcUrlFromScript = (script: string): string => {
	if (!script) return ''
	const match = script.match(/srcUrl\s*[:=]\s*['"`]([^'"`]+)['"`]/)
	if (match && match[1]) return match[1].trim()
	return ''
}

// ============================================================
// QuickJS 原生模块桥接
// ============================================================

type LxRequestType = 'current' | 'preload'

type LxRequestContext = {
	requestKey?: string
	requestType?: LxRequestType
	timeoutMs?: number
}

// 待处理的 getMusicUrl 请求映射
let pendingRequests: Map<
	string,
	{
		resolve: (result: any) => void
		reject: (err: Error) => void
		requestType: LxRequestType
	}
> = new Map()
let settledRequestTypes: Map<string, LxRequestType> = new Map()

// HTTP 请求映射（QuickJS 脚本发起的 HTTP 请求通过事件转发到 JS-land）
let pendingHttpRequests: Map<string, AbortController> = new Map()

// 脚本是否已初始化
let scriptInited = false
let scriptInitPromise: {
	resolve: () => void
	reject: (err: Error) => void
} | null = null

// 事件监听清理函数
let removeListener: (() => void) | null = null

const getLxRequestLogPrefix = (
	requestType: LxRequestType | 'unknown',
	requestKey: string,
) => `[lxMusicAdapter][${requestType}][requestKey=${requestKey}]`

const rememberSettledRequestType = (
	requestKey: string,
	requestType: LxRequestType,
) => {
	settledRequestTypes.set(requestKey, requestType)
	setTimeout(() => {
		if (settledRequestTypes.get(requestKey) === requestType) {
			settledRequestTypes.delete(requestKey)
		}
	}, 30000)
}

const shouldLogScriptAction = (event: any) => {
	if (event.action !== 'response') return true
	const data = event.data as ResponseParams
	const pending = pendingRequests.get(data.requestKey)
	const requestType = pending?.requestType ?? settledRequestTypes.get(data.requestKey)
	return !(requestType === 'preload' && (!data.status || !pending))
}

const formatScriptActionLog = (event: any) => {
	switch (event.action) {
		case 'request': {
			const data = event.data as RequestParams
			const parentPending = data.parentRequestKey
				? pendingRequests.get(data.parentRequestKey)
				: null
			const requestType = data.requestType ?? parentPending?.requestType
			const requestTypeLabel = requestType ? `[${requestType}]` : ''
			const parentRequestKeyLabel = data.parentRequestKey
				? `[parentRequestKey=${data.parentRequestKey}]`
				: ''
			const httpRequestKeyLabel = data.requestKey
				? `[httpRequestKey=${data.requestKey}]`
				: ''
			return `[lxMusicAdapter] Script action: request${requestTypeLabel}${parentRequestKeyLabel}${httpRequestKeyLabel}`
		}
		case 'response': {
			const data = event.data as ResponseParams
			const pending = pendingRequests.get(data.requestKey)
			const requestType = pending?.requestType ?? settledRequestTypes.get(data.requestKey)
			const requestTypeLabel = requestType
				? `[${requestType}]`
				: ''
			const requestKeyLabel = data.requestKey
				? `[requestKey=${data.requestKey}]`
				: ''
			return `[lxMusicAdapter] Script action: response${requestTypeLabel}${requestKeyLabel}`
		}
		default:
			return `[lxMusicAdapter] Script action: ${event.action}`
	}
}

/**
 * 处理来自 QuickJS 脚本的事件
 */
const handleScriptAction = (event: any) => {
	if (shouldLogScriptAction(event)) {
		logInfo(formatScriptActionLog(event))
	}

	switch (event.action) {
		case 'init': {
			// 脚本初始化完成
			const data = event.data
			if (data?.status) {
				logInfo('[lxMusicAdapter] Script initialized successfully')
				scriptInited = true
				scriptInitPromise?.resolve()
			} else {
				logError(
					`[lxMusicAdapter] Script init failed: ${data?.errorMessage || 'unknown'}`,
				)
				scriptInitPromise?.reject(
					new Error(data?.errorMessage || 'Script init failed'),
				)
			}
			scriptInitPromise = null
			break
		}

		case 'request': {
			// 脚本发起 HTTP 请求 — 我们在 JS-land 代理执行
			const reqData = event.data as RequestParams
			handleHttpRequest(reqData)
			break
		}

		case 'cancelRequest': {
			// 脚本取消 HTTP 请求
			const requestKey = event.data as string
			const controller = pendingHttpRequests.get(requestKey)
			if (controller) {
				controller.abort()
				pendingHttpRequests.delete(requestKey)
			}
			break
		}

		case 'response': {
			// 脚本返回 musicUrl/lyric/pic 响应
			const respData = event.data as ResponseParams
			const pending = pendingRequests.get(respData.requestKey)
			if (pending) {
				const logPrefix = getLxRequestLogPrefix(
					pending.requestType,
					respData.requestKey,
				)
				if (respData.status) {
					const result = respData.result as any
					if (result?.action === 'musicUrl') {
						// 宽容处理多种返回格式：result.data.url / result.url / result.data(字符串)
						let url: string | undefined
						if (typeof result?.data?.url === 'string') url = result.data.url
						else if (typeof result?.url === 'string') url = result.url
						else if (typeof result?.data === 'string') url = result.data
						else if (typeof result === 'string') url = result
						if (url && /^https?:/.test(url)) {
							logInfo(`${logPrefix} musicUrl resolved: ${url}`)
							pending.resolve(url)
						} else if (url) {
							// 非http开头的URL（如相对路径），尝试补全
							logInfo(`${logPrefix} musicUrl returned non-http url: ${url}, trying anyway`)
							pending.resolve(url)
						} else {
							logError(`${logPrefix} Script returned no valid url, result=${JSON.stringify(result).substring(0, 200)}`)
							pending.reject(new Error('Script returned no valid musicUrl'))
						}
					} else {
						pending.resolve(result)
					}
				} else {
					if (pending.requestType === 'current') {
						logError(
							`${logPrefix} Script response error: ${respData.errorMessage || 'unknown'}`,
						)
					}
					pending.reject(
						new Error(respData.errorMessage || 'Script returned error'),
					)
				}
				pendingRequests.delete(respData.requestKey)
				settledRequestTypes.delete(respData.requestKey)
			}
			break
		}

		case 'log': {
			logInfo(`[lxMusicScript] ${event.data}`)
			break
		}

		default:
			logInfo(
				`[lxMusicAdapter] Unhandled action: ${event.action}`,
			)
	}
}

/**
 * 代理执行 HTTP 请求（脚本在 QuickJS 中发起，由 JS-land fetch 执行）
 */
const handleHttpRequest = async (reqData: RequestParams) => {
	const { requestKey, url, options } = reqData
	const controller = new AbortController()
	pendingHttpRequests.set(requestKey, controller)
	const timeout = options.timeout > 0
		? setTimeout(() => controller.abort(), Math.min(options.timeout, 60000))
		: null

	try {
		const fetchOptions: RequestInit = {
			method: options.method || 'GET',
			headers: options.headers || {},
			signal: controller.signal,
		}

		const headers = (fetchOptions.headers || {}) as Record<string, string>
		const method = String(fetchOptions.method || 'GET').toUpperCase()
		const optionsAny = options as any
		const data = optionsAny.body ?? optionsAny.data
		if (method != 'GET' && method != 'HEAD') {
			if (optionsAny.form && typeof optionsAny.form == 'object') {
				const params = new URLSearchParams()
				for (const [key, value] of Object.entries(optionsAny.form)) {
					params.append(key, String(value))
				}
				fetchOptions.body = params.toString()
				if (!headers['Content-Type'] && !headers['content-type']) {
					headers['Content-Type'] = 'application/x-www-form-urlencoded'
				}
			} else if (optionsAny.formData != null) {
				fetchOptions.body = optionsAny.formData
			} else if (data != null) {
				fetchOptions.body = typeof data == 'string' ? data : JSON.stringify(data)
			}
		}

		const response = await fetch(url, fetchOptions)

		let body: any
		const contentType = response.headers.get('content-type') || ''
		if (options.binary) {
			// 二进制响应 — 转为 base64
			const buffer = await response.arrayBuffer()
			body = Buffer.from(buffer).toString('base64')
		} else {
			const text = await response.text()
			if (contentType.includes('json')) {
				try {
					body = JSON.parse(text)
				} catch {
					body = text
				}
			} else {
				body = text
			}
		}

		const headerObj: Record<string, string> = {}
		response.headers.forEach((value: string, key: string) => {
			headerObj[key] = value
		})

		sendAction('response', {
			requestKey,
			error: null,
			response: {
				statusCode: response.status,
				statusMessage: response.statusText,
				headers: headerObj,
				body,
			},
		})
	} catch (err) {
		sendAction('response', {
			requestKey,
			error: err instanceof Error ? err.message : String(err),
			response: null,
		})
	} finally {
		if (timeout) clearTimeout(timeout)
		pendingHttpRequests.delete(requestKey)
	}
}

// ============================================================
// 公开 API
// ============================================================

/**
 * 初始化 lx-music 脚本到 QuickJS 引擎
 */
const initLxMusicScript = (
	scriptId: string,
	info: Record<string, string>,
	script: string,
): Promise<void> => {
	return new Promise((resolve, reject) => {
		// 先销毁 QuickJS 里的旧脚本，避免多脚本冲突
		try {
			destroy()
		} catch (e) {
			console.log('[lxMusicAdapter] destroy old script:', e)
		}
		// 清理旧的监听
		if (removeListener) {
			removeListener()
			removeListener = null
		}
		scriptInited = false

		// 设置事件监听
		removeListener = onScriptAction(handleScriptAction)

		// 设置超时
		const timeout = setTimeout(() => {
			if (!scriptInited) {
				reject(new Error('脚本初始化超时'))
				scriptInitPromise = null
			}
		}, 10000)

		scriptInitPromise = {
			resolve: () => {
				clearTimeout(timeout)
				resolve()
			},
			reject: (err) => {
				clearTimeout(timeout)
				reject(err)
			},
		}

		// 加载脚本到 QuickJS
		loadScript({
			id: scriptId,
			name: info.name || 'lx-music 音源',
			description: info.description || '',
			version: info.version || '',
			author: info.author || '',
			homepage: info.homepage || '',
			script,
			allowShowUpdateAlert: false,
		})
	})
}

/**
 * 从 songmid 解析 lx-music 平台标识和纯ID
 */
const parseLxPlatform = (songmid: string): { source: string; cleanId: string } => {
	const raw = String(songmid || '')
	// 网易云
	if (raw.startsWith('netease_') || raw.startsWith('wy_')) {
		const prefix = raw.startsWith('netease_') ? 'netease_' : 'wy_'
		return { source: 'wy', cleanId: raw.slice(prefix.length) }
	}
	// 酷狗
	if (raw.startsWith('kugou_') || raw.startsWith('kg_')) {
		const prefix = raw.startsWith('kugou_') ? 'kugou_' : 'kg_'
		return { source: 'kg', cleanId: raw.slice(prefix.length) }
	}
	// 酷我
	if (raw.startsWith('kuwo_') || raw.startsWith('kw_')) {
		const prefix = raw.startsWith('kuwo_') ? 'kuwo_' : 'kw_'
		return { source: 'kw', cleanId: raw.slice(prefix.length) }
	}
	// 咪咕
	if (raw.startsWith('migu_') || raw.startsWith('mg_')) {
		const prefix = raw.startsWith('migu_') ? 'migu_' : 'mg_'
		return { source: 'mg', cleanId: raw.slice(prefix.length) }
	}
	// QQ音乐（默认）- 没有前缀的 songmid 都视为 QQ 音乐
	return { source: 'tx', cleanId: raw }
}

/**
 * 通过 QuickJS 脚本获取音乐 URL
 */
const getMusicUrlViaScript = (
	title: string,
	artist: string,
	songmid: string,
	quality: string,
	requestContext?: LxRequestContext,
): Promise<string> => {
	return new Promise((resolve, reject) => {
		const requestType = requestContext?.requestType ?? 'current'
		const requestKey =
			requestContext?.requestKey ??
			`req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
		const logPrefix = getLxRequestLogPrefix(requestType, requestKey)
		const timeoutMs = requestContext?.timeoutMs ?? 15000

		// 超时处理
		const timeout = setTimeout(() => {
			pendingRequests.delete(requestKey)
			rememberSettledRequestType(requestKey, requestType)
			reject(new Error('获取音乐 URL 超时'))
		}, timeoutMs)

		pendingRequests.set(requestKey, {
			resolve: (url: any) => {
				clearTimeout(timeout)
				resolve(url)
			},
			reject: (err: Error) => {
				clearTimeout(timeout)
				reject(err)
			},
			requestType,
		})

		logInfo(`${logPrefix} Sending musicUrl request: ${title} - ${artist}`)

		// 解析平台和纯ID
		const { source, cleanId } = parseLxPlatform(songmid)
		logInfo(`${logPrefix} 平台解析: songmid=${songmid} -> source=${source}, cleanId=${cleanId}`)

		// 向 QuickJS 脚本发送 musicUrl 请求
		// 注意：lx音源脚本期望 quality 字段，同时保留 type 兼容旧脚本
		sendAction('request', {
			requestKey,
			data: {
				action: 'musicUrl',
				source,
				info: {
					musicInfo: {
						id: cleanId,
						songmid: cleanId,
						title,
						name: title,
						singer: artist,
						artist,
						source,
						hash: cleanId,
						albumName: '',
						albumId: '',
						interval: null,
						types: [],
						typeUrl: {},
						_quality: quality || '128k',
					},
					requestContext: {
						requestKey,
						requestType,
					},
					quality: quality || '128k',
					type: quality || '128k',
				},
			},
		} as any)
	})
}

/**
 * 通过 QuickJS 脚本搜索音乐（返回歌曲列表，用于源测试获取 songId）
 */
export const searchMusicViaScript = (
	keyword: string,
	source: string = 'tx',
	requestContext?: LxRequestContext,
): Promise<any> => {
	return new Promise((resolve, reject) => {
		const requestKey =
			requestContext?.requestKey ??
			`search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
		const timeoutMs = requestContext?.timeoutMs ?? 15000

		const timeout = setTimeout(() => {
			pendingRequests.delete(requestKey)
			reject(new Error('搜索超时'))
		}, timeoutMs)

		pendingRequests.set(requestKey, {
			resolve: (result: any) => {
				clearTimeout(timeout)
				resolve(result)
			},
			reject: (err: Error) => {
				clearTimeout(timeout)
				reject(err)
			},
			requestType: 'current',
		})

		logInfo(`[lxMusicAdapter][search][${source}] Sending musicSearch request: ${keyword}`)

		sendAction('request', {
			requestKey,
			data: {
				action: 'musicSearch',
				source,
				data: {
					key: keyword,
					page: 1,
					pageSize: 5,
					type: 'song',
				},
			},
		} as any)
	})
}

/**
 * 将 lx-music 格式脚本适配为 Well Music 的 MusicApi 对象
 */
export const adaptLxMusicScript = async (
	script: string,
): Promise<IMusic.MusicApi> => {
	const info = parseLxMusicScriptInfo(script)

	const scriptId = info.name
		? `lx_${info.name.replace(/\s+/g, '_')}_${Date.now()}`
		: `lx_api_${Date.now()}`

	// 初始化脚本到 QuickJS
	await initLxMusicScript(scriptId, info, script)

	logInfo(`[lxMusicAdapter] Script loaded successfully: ${info.name}`)

	const musicApi: IMusic.MusicApi = {
		id: scriptId,
		platform: 'tx',
		author: info.author || '',
		name: info.name || 'lx-music 音源',
		version: info.version || '',
		srcUrl: extractSrcUrlFromScript(script) || info.homepage || '',
		script: script,
		scriptType: 'lxmusic' as const,
		isSelected: false,
		getMusicUrl: (
			title: string,
			artist: string,
			songmid: string,
			quality: string,
			requestContext?: LxRequestContext,
		) => getMusicUrlViaScript(title, artist, songmid, quality, requestContext),
	searchMusic: (keyword: string, source: string = 'tx', requestContext?: LxRequestContext) =>
		searchMusicViaScript(keyword, source, requestContext),
	}

	return musicApi
}

/**
 * 重新加载 lx-music 脚本（从保存的 script 重建）
 * 失败时抛出错误，由调用方决定如何处理（播放时跳过该音源，测试时显示错误详情）。
 */
export const reloadLxMusicScript = async (
	musicApi: IMusic.MusicApi,
): Promise<IMusic.MusicApi> => {
	const info = parseLxMusicScriptInfo(musicApi.script)
	await initLxMusicScript(musicApi.id, info, musicApi.script)

	return {
		...musicApi,
		getMusicUrl: (
			title: string,
			artist: string,
			songmid: string,
			quality: string,
			requestContext?: LxRequestContext,
		) => getMusicUrlViaScript(title, artist, songmid, quality, requestContext),
		searchMusic: (keyword: string, source: string = 'tx', requestContext?: LxRequestContext) =>
			searchMusicViaScript(keyword, source, requestContext),
	}
}
