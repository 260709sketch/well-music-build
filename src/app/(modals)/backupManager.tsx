import { BackupManagerScreen } from '@/components/BackupManagerScreen'
import { useRouter } from 'expo-router'
import React from 'react'

const BackupManagerModalPage = () => {
	const router = useRouter()

	return (
		<BackupManagerScreen
			onClose={() => router.back()}
		/>
	)
}

export default BackupManagerModalPage
