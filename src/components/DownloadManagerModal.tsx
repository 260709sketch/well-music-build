import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'
import SFSymbol from '@/components/SFSymbol'
import { Ionicons } from '@expo/vector-icons'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActionSheetIOS,
  Alert,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import RNFS from 'react-native-fs'
import {
  ActiveDownload,
  clearCompletedDownloads,
  deleteDownloadedFile,
  formatFileSize,
  getActiveDownloads,
  getDownloadPath,
  getDownloadedFiles,
  setDownloadPath,
  subscribeDownloads,
} from '@/helpers/downloadManager'
import { showToast } from '@/utils/utils'

type DownloadManagerModalProps = {
  visible: boolean
  onClose: () => void
}

export const DownloadManagerModal = ({ visible, onClose }: DownloadManagerModalProps) => {
  const colors = useThemeColors()
  const { isDark } = useAppTheme()
  const [files, setFiles] = useState<{ name: string; size: number; path: string }[]>([])
  const [downloadPath, setPath] = useState('')
  const [totalSize, setTotalSize] = useState(0)
  const [activeDownloads, setActiveDownloads] = useState<ActiveDownload[]>([])

  const loadFiles = useCallback(async () => {
    const path = getDownloadPath()
    setPath(path)
    const list = await getDownloadedFiles()
    setFiles(list)
    setTotalSize(list.reduce((sum, f) => sum + f.size, 0))
  }, [])

  const formatSize = (bytes?: number) => {
    if (!bytes || bytes <= 0) return '0 MB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }
  const formatSpeed = (bytesPerSec?: number) => {
    if (!bytesPerSec || bytesPerSec <= 0) return '0 KB/s'
    if (bytesPerSec >= 1024 * 1024) return (bytesPerSec / 1024 / 1024).toFixed(1) + ' MB/s'
    return (bytesPerSec / 1024).toFixed(0) + ' KB/s'
  }

  useEffect(() => {
    if (visible) {
      loadFiles()
      setActiveDownloads(getActiveDownloads())
      const unsubscribe = subscribeDownloads(() => {
        setActiveDownloads(getActiveDownloads())
        const active = getActiveDownloads()
        if (active.length === 0) {
          loadFiles()
        }
      })
      return unsubscribe
    }
  }, [visible, loadFiles])

  const handlePickFolder = () => {
    const systemDownloads = '/var/mobile/Media/Downloads'
    const docsDir = RNFS.DocumentDirectoryPath
    const options = [
      { label: '系统下载目录 (我的iPhone/下载)', path: systemDownloads },
      { label: '应用下载文件夹 (Downloads)', path: docsDir + '/downloads' },
      { label: '应用文档根目录', path: docsDir },
    ]
    const labels = options.map((o) => o.label)
    labels.push('取消')
    ActionSheetIOS.showActionSheetWithOptions(
      {
        options: labels,
        cancelButtonIndex: labels.length - 1,
        title: '选择下载保存位置',
        message: '选择后下载的歌曲将保存到对应文件夹',
      },
      (buttonIndex) => {
        if (buttonIndex < options.length) {
          const selected = options[buttonIndex]
          setDownloadPath(selected.path)
          setPath(selected.path)
          showToast('下载路径已更新', selected.label, 'success')
          loadFiles()
        }
      },
    )
  }

  const handleDelete = (file: { name: string; path: string }) => {
    Alert.alert('删除文件', `确定要删除 "${file.name}" 吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteDownloadedFile(file.path)
          loadFiles()
        },
      },
    ])
  }

  const handleClearAll = () => {
    if (files.length === 0) return
    Alert.alert('清空下载', `确定要删除全部 ${files.length} 个下载文件吗？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '全部删除',
        style: 'destructive',
        onPress: async () => {
          for (const f of files) {
            await deleteDownloadedFile(f.path)
          }
          loadFiles()
        },
      },
    ])
  }

  const handleOpenFile = async (file: { name: string; path: string }) => {
    try {
      const url = 'shareddocuments://' + file.path
      const canOpen = await Linking.canOpenURL(url)
      if (canOpen) {
        await Linking.openURL(url)
      } else {
        await Linking.openURL('file://' + file.path)
      }
    } catch (e) {
      showToast('无法打开文件', file.name, 'error')
    }
  }

  const cardBg = isDark ? '#2c2c2e' : '#f2f2f7'
  const dividerColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.modal, { backgroundColor: isDark ? '#1c1c1e' : '#f2f2f7' }]}>
        <View style={styles.handleBar} />

        {/* 标题 */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>下载管理</Text>
          {files.length > 0 && (
            <TouchableOpacity onPress={handleClearAll} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearAllText}>全部删除</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* 统计卡片 */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.statsRow}>
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: colors.text }]}>{files.length}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>首歌曲</Text>
              </View>
              <View style={[styles.statDivider, { backgroundColor: dividerColor }]} />
              <View style={styles.statItem}>
                <Text style={[styles.statNum, { color: colors.text }]}>{formatFileSize(totalSize)}</Text>
                <Text style={[styles.statLabel, { color: colors.textMuted }]}>已用空间</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.pathRow} onPress={handlePickFolder} activeOpacity={0.7}>
              <SFSymbol systemName="questionmark.circle" size={15} color={colors.textMuted} />
              <Text style={[styles.pathText, { color: colors.textMuted }]} numberOfLines={1}>
                {downloadPath}
              </Text>
              <SFSymbol systemName="chevron.right" size={14} color="#C6C6C6" />
            </TouchableOpacity>
          </View>

          {/* 正在下载 */}
          {activeDownloads.length > 0 && (
            <View style={[styles.card, { backgroundColor: cardBg }]}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.text }]}>正在下载</Text>
                <TouchableOpacity
                  onPress={() => { clearCompletedDownloads(); setActiveDownloads(getActiveDownloads()) }}
                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                >
                  <Text style={[styles.sectionAction, { color: colors.textMuted }]}>清除记录</Text>
                </TouchableOpacity>
              </View>

              {activeDownloads.map((dl) => (
                <View key={dl.id} style={styles.downloadItem}>
                  <View style={styles.downloadHeader}>
                    <Text style={[styles.downloadName, { color: colors.text }]} numberOfLines={1}>
                      {dl.name}
                    </Text>
                    {dl.status === 'failed' ? (
                      <SFSymbol systemName="xmark.circle" size={18} color="#ff453a" />
                    ) : dl.status === 'done' ? (
                      <SFSymbol systemName="checkmark.circle" size={18} color="#34c759" />
                    ) : (
                      <Text style={[styles.downloadPercent, { color: colors.primary }]}>
                        {dl.status === 'resolving' ? '...' : `${dl.percent.toFixed(0)}%`}
                      </Text>
                    )}
                  </View>

                  <Text style={[styles.downloadMeta, { color: colors.textMuted }]}>
                    {dl.quality}
                    {dl.status === 'resolving' ? ' · 解析音源中...' :
                      dl.status === 'done' ? ' · 已完成' :
                      dl.status === 'failed' ? ` · ${dl.error || '下载失败'}` :
                      ` · ${formatSpeed(dl.speed)} · ${formatSize(dl.bytesWritten)}/${formatSize(dl.contentLength)}`}
                  </Text>

                  <View style={styles.progressBar}>
                    <View
                      style={[
                        styles.progressFill,
                        {
                          width: `${dl.status === 'resolving' ? 5 : dl.status === 'done' ? 100 : dl.percent}%`,
                          backgroundColor: dl.status === 'failed' ? '#ff453a' : dl.status === 'done' ? '#34c759' : colors.primary,
                        },
                      ]}
                    />
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* 已下载列表 */}
          <View style={[styles.card, { backgroundColor: cardBg }]}>
            <View style={styles.sectionHeader}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>已下载</Text>
            </View>

            {files.length === 0 ? (
              <View style={styles.emptyState}>
                <SFSymbol systemName="questionmark.circle" size={40} color={colors.textMuted} />
                <Text style={[styles.emptyText, { color: colors.textMuted }]}>暂无下载歌曲</Text>
                <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>在歌曲菜单中点击"下载"即可保存</Text>
              </View>
            ) : (
              files.map((file, index) => (
                <TouchableOpacity
                  key={file.path}
                  style={[
                    styles.fileItem,
                    index < files.length - 1 && { borderBottomColor: dividerColor, borderBottomWidth: StyleSheet.hairlineWidth },
                  ]}
                  onPress={() => handleOpenFile(file)}
                  activeOpacity={0.7}
                >
                  <View style={styles.fileIconWrap}>
                    <SFSymbol systemName="music.note" size={16} color={colors.primary} />
                  </View>
                  <View style={styles.fileInfo}>
                    <Text style={[styles.fileName, { color: colors.text }]} numberOfLines={1}>
                      {file.name.replace(/\.(mp3|flac|wav|m4a)$/i, '')}
                    </Text>
                    <Text style={[styles.fileSize, { color: colors.textMuted }]}>{formatFileSize(file.size)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDelete(file)}
                    style={styles.deleteBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <SFSymbol systemName="trash" size={17} color="#ff453a" />
                  </TouchableOpacity>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modal: {
    flex: 1,
  },
  handleBar: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.3)',
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: '500',
  },
  clearAllText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#ff453a',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    gap: 12,
  },
  card: {
    borderRadius: 14,
    padding: 16,
  },
  // 统计
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statNum: {
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 12,
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
  pathRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(128,128,128,0.15)',
  },
  pathText: {
    fontSize: 12,
    flex: 1,
  },
  // 区块标题
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '500',
  },
  sectionAction: {
    fontSize: 13,
  },
  // 正在下载
  downloadItem: {
    marginBottom: 14,
  },
  downloadHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  downloadName: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  downloadPercent: {
    fontSize: 14,
    fontWeight: '500',
  },
  downloadMeta: {
    fontSize: 12,
    marginBottom: 8,
  },
  progressBar: {
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(128,128,128,0.2)',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  // 已下载列表
  fileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  fileIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: 'rgba(128,128,128,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  fileInfo: {
    flex: 1,
  },
  fileName: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 2,
  },
  fileSize: {
    fontSize: 12,
  },
  deleteBtn: {
    padding: 4,
  },
  // 空状态
  emptyState: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyText: {
    fontSize: 15,
    fontWeight: '500',
    marginTop: 4,
  },
  emptySubtext: {
    fontSize: 12,
  },
})
