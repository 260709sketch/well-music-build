import { toOldMusicInfo } from '@/components/utils'
import { requestMsg } from '@/components/utils/message'
import musicSdk from '@/components/utils/musicSdk'
import Toast from 'react-native-toast-message'
import { Alert } from 'react-native'

export const getOnlineOtherSourceMusicUrl = async ({
	musicInfos,
	quality,
	onToggleSource,
	isRefresh,
	retryedSource = [],
}: {
	musicInfos: LX.Music.MusicInfoOnline[]
	quality?: LX.Quality
	onToggleSource: (musicInfo?: LX.Music.MusicInfoOnline) => void
	isRefresh: boolean
	retryedSource?: LX.OnlineSource[]
}): Promise<{
	url: string
	musicInfo: LX.Music.MusicInfoOnline
	quality: LX.Quality
	isFromCache: boolean
}> => {
	if (!(await global.lx.apiInitPromise[0])) throw new Error('source init failed')

	let musicInfo: LX.Music.MusicInfoOnline | null = null
	let itemQuality: LX.Quality | null = null
	// eslint-disable-next-line no-cond-assign
	while ((musicInfo = musicInfos.shift()!)) {
		if (retryedSource.includes(musicInfo.source)) continue
		retryedSource.push(musicInfo.source)
		//if (!assertApiSupport(musicInfo.source)) continue
		//  itemQuality = quality ?? 'getPlayQuality(settingState.setting['player.isPlayHighQuality'], musicInfo)'
		itemQuality = quality ?? '128k'
		if (!musicInfo.meta._qualitys[itemQuality]) continue

		console.log(
			'try toggle to: ',
			musicInfo.source,
			musicInfo.name,
			musicInfo.singer,
			musicInfo.interval,
		)
		onToggleSource(musicInfo)
		break
	}
	if (!musicInfo || !itemQuality) throw new Error(global.i18n.t('toggle_source_failed'))
	//todo cache
	// const cachedUrl = await getStoreMusicUrl(musicInfo, itemQuality)
	// if (cachedUrl && !isRefresh) return { url: cachedUrl, musicInfo, quality: itemQuality, isFromCache: true }

	let reqPromise
	try {
		reqPromise = musicSdk[musicInfo.source].getMusicUrl(
			toOldMusicInfo(musicInfo),
			itemQuality,
		).promise
	} catch (err: any) {
		reqPromise = Promise.reject(err)
	}
	// retryedSource.includes(musicInfo.source)
	// eslint-disable-next-line @typescript-eslint/promise-function-async
	return reqPromise
		.then(({ url, type }: { url: string; type: LX.Quality }) => {
			return { musicInfo, url, quality: type, isFromCache: false }
			// eslint-disable-next-line @typescript-eslint/promise-function-async
		})
		.catch((err: any) => {
			if (err.message == requestMsg.tooManyRequests) throw err
			console.log(err)
			return getOnlineOtherSourceMusicUrl({
				musicInfos,
				quality,
				onToggleSource,
				isRefresh,
				retryedSource,
			})
		})
}
export const showToast = (
	message1: string,
	message2OrType?: string,
	type?: 'success' | 'error' | 'info',
) => {
	// 兼容两种调用：showToast(msg, type) 或 showToast(msg, msg2, type)
	const typeValues = ['success', 'error', 'info']
	let msg2: string | undefined
	let toastType: 'success' | 'error' | 'info' = 'success'
	if (message2OrType && typeValues.includes(message2OrType)) {
		toastType = message2OrType as 'success' | 'error' | 'info'
	} else {
		msg2 = message2OrType
		if (type) toastType = type
	}
	// success统一用info样式（和自动换源提示一致）
	const finalType = toastType === 'success' ? 'info' : toastType
	Toast.show({
		type: finalType,
		text1: message1,
		...(msg2 ? { text2: msg2 } : {}),
		visibilityTime: 3000,
		autoHide: true,
	})
}
