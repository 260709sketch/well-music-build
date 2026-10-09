import React, { useEffect } from 'react'
import { ActionSheetIOS } from 'react-native'
import {
  DOWNLOAD_QUALITIES,
  DownloadQuality,
  downloadSong,
} from '@/helpers/downloadManager'
import { showToast } from '@/utils/utils'

type DownloadQualityModalProps = {
  visible: boolean
  onClose: () => void
  song: IMusic.IMusicItem | null
}

export const DownloadQualityModal = ({ visible, onClose, song }: DownloadQualityModalProps) => {
  useEffect(() => {
    if (visible && song) {
      const options = DOWNLOAD_QUALITIES.map((q) => q.label)
      options.push('取消')
      ActionSheetIOS.showActionSheetWithOptions(
        {
          options,
          cancelButtonIndex: options.length - 1,
          title: '选择下载音质',
          message: `${song.artist || ''} - ${song.title || ''}`,
        },
        (buttonIndex) => {
          if (buttonIndex < DOWNLOAD_QUALITIES.length) {
            handleSelectQuality(DOWNLOAD_QUALITIES[buttonIndex].id)
          } else {
            onClose()
          }
        },
      )
    }
  }, [visible])

  const handleSelectQuality = async (quality: DownloadQuality) => {
    if (!song) return
    const songName = `${song.artist || '未知'} - ${song.title || '未知'}`
    onClose()

    showToast('开始下载', songName, 'info')

    const result = await downloadSong(song, quality)

    if (result.success) {
      if (result.error) {
        showToast('已存在', songName, 'info')
      } else {
        showToast('下载完成', songName, 'success')
      }
    } else {
      const err = result.error || '下载失败'
      if (err.includes('无法下载此音质')) {
        showToast('无法下载此音质', `${songName}，请选择其他音质或换源`, 'error')
      } else {
        showToast('下载失败', `${songName} - ${err}`, 'error')
      }
    }
  }

  return null
}
