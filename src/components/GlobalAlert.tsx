import React, { useEffect, useState } from 'react'
import CustomAlert, { type CustomAlertOptions } from './CustomAlert'
import { subscribeAlert, hideAlert } from '@/utils/customAlert'

/**
 * 全局自定义提示框，挂载在根布局，通过 showAlert() 调用
 */
const GlobalAlert: React.FC = () => {
	const [visible, setVisible] = useState(false)
	const [options, setOptions] = useState<CustomAlertOptions | null>(null)

	useEffect(() => {
		const unsubscribe = subscribeAlert((opts) => {
			if (opts) {
				setOptions(opts)
				setVisible(true)
			} else {
				setVisible(false)
			}
		})
		return unsubscribe
	}, [])

	return (
		<CustomAlert
			visible={visible}
			options={options}
			onClose={hideAlert}
		/>
	)
}

export default GlobalAlert
