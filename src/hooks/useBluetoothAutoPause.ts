// 断蓝牙/拔耳机自动暂停（对齐 Kumone PlayerService 的 routeChange 处理）
// 原生模块 BluetoothAutoPause 监听 AVAudioSession.routeChange（reason = oldDeviceUnavailable），
// 把事件以 "BluetoothAutoPause.onRouteChange" 发给 JS；这里用 NativeEventEmitter 接收，
// 若当前播放器在播放中则带淡出地暂停。
import { useEffect } from 'react'
import { NativeEventEmitter, NativeModules } from 'react-native'
import PersistStatus from '@/store/PersistStatus'
import myTrackPlayer from '@/helpers/trackPlayerIndex'

// 功能总开关（与设置页开关同 key）
export const isBluetoothAutoPauseEnabled = (): boolean => {
	try {
		const v = PersistStatus.get('player.bluetoothAutoPause' as any)
		return v === undefined ? false : v === true
	} catch (e) {
		return false
	}
}

const BluetoothAutoPauseModule = NativeModules.BluetoothAutoPause

// 原生 setEnabled：始终开启监听（仅限 iOS），实际要不要暂停由 isEnabled 决定（对齐 Kumone 设置开关）
const ensureNativeObserving = () => {
	if (BluetoothAutoPauseModule?.setEnabled) {
		try {
			BluetoothAutoPauseModule.setEnabled(true)
		} catch (e) {}
	}
}

/**
 * 挂载到 App 根：开启原生监听，并在收到断设备事件时自动暂停。
 */
export function useBluetoothAutoPause() {
	useEffect(() => {
		if (!BluetoothAutoPauseModule?.supportedEvents) return
		ensureNativeObserving()
		const emitter = new NativeEventEmitter(BluetoothAutoPauseModule)
		const sub = emitter.addListener('onRouteChange', async (data: any) => {
			if (!isBluetoothAutoPauseEnabled()) return
			// 仅 oldDeviceUnavailable 由原生端筛选；JS 端兜底再次校验
			if (data?.reason && data.reason !== 'oldDeviceUnavailable') return
			try {
				await myTrackPlayer.handleExternalPause()
			} catch (e) {}
		})
		return () => {
			sub.remove()
		}
	}, [])
}