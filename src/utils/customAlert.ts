import type { CustomAlertOptions, CustomAlertButton } from '@/components/CustomAlert'

type Listener = (options: CustomAlertOptions | null) => void

let currentOptions: CustomAlertOptions | null = null
const listeners = new Set<Listener>()

function notify() {
	listeners.forEach((l) => l(currentOptions))
}

/**
 * 全局自定义提示框，API 兼容 Alert.alert
 * @param title 标题
 * @param message 内容
 * @param buttons 按钮数组 [{ text, onPress, style }]
 * @param options 额外选项（兼容 Alert.alert 的第4个参数，暂忽略）
 */
export function showAlert(
	title: string,
	message?: string,
	buttons?: CustomAlertButton[],
	_options?: Record<string, unknown>,
) {
	currentOptions = {
		title,
		message,
		buttons: buttons?.length
			? buttons.map((b) => ({
					text: b.text,
					onPress: b.onPress,
					style: b.style,
				}))
			: undefined,
	}
	notify()
}

/** 关闭提示框 */
export function hideAlert() {
	currentOptions = null
	notify()
}

/**
 * 全局自定义输入提示框，API 兼容 Alert.prompt
 * @param title 标题
 * @param message 内容
 * @param buttons 按钮数组 [{ text, onPress(inputText), style }]
 * @param type 输入类型（兼容 Alert.prompt 第4参数，暂忽略）
 * @param defaultValue 默认值
 * @param keyboardType 键盘类型
 */
export function showPrompt(
	title: string,
	message?: string,
	buttons?: CustomAlertButton[],
	_type?: string,
	defaultValue?: string,
	keyboardType?: 'default' | 'number-pad' | 'numeric' | 'email-address',
) {
	currentOptions = {
		title,
		message,
		isPrompt: true,
		defaultValue,
		keyboardType,
		buttons: buttons?.length
			? buttons.map((b) => ({
					text: b.text,
					onPress: b.onPress,
					style: b.style,
				}))
			: undefined,
	}
	notify()
}

/** 订阅提示框状态变化（供 CustomAlert 组件使用） */
export function subscribeAlert(listener: Listener) {
	listeners.add(listener)
	listener(currentOptions)
	return () => listeners.delete(listener)
}

/** 获取当前提示框配置 */
export function getCurrentAlert() {
	return currentOptions
}
