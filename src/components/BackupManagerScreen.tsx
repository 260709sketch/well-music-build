import React, { useState, useEffect } from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  Alert,
  ActivityIndicator,
  Share,
} from 'react-native'
import { useAppTheme } from '@/hooks/useAppTheme'
import {
  exportBackupData,
  listBackupFiles,
  deleteBackupFile,
  importBackupData,
  restoreBackupData,
  getBackupStats,
  formatFileSize,
  BackupData,
} from '@/helpers/backupManager'
import * as DocumentPicker from 'expo-document-picker'


interface BackupManagerScreenProps {
  onClose?: () => void
}

export const BackupManagerScreen = ({ onClose }: BackupManagerScreenProps) => {
  const { colors, isDark } = useAppTheme()
  const [backups, setBackups] = useState<{name: string, path: string, size: number, mtime: string}[]>([])
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)

  const bgColor = isDark ? '#1c1c1e' : '#fff'
  const textColor = isDark ? '#fff' : '#000'
  const subTextColor = isDark ? '#888' : '#666'
  const cardBg = isDark ? '#2c2c2e' : '#f5f5f5'
  const accentColor = isDark ? '#fff' : '#000'
  const accentBg = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)'
  const dangerColor = '#ff3b30'

  // 加载备份列表
  const loadBackups = async () => {
    setLoading(true)
    try {
      const files = await listBackupFiles()
      setBackups(files)
    } catch (error) {
      console.error('加载备份列表失败:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadBackups()
  }, [])

  // 导出备份
  const handleExport = async () => {
    setExporting(true)
    try {
      const filePath = await exportBackupData()
      await loadBackups()
      // 使用系统分享面板，让用户选择保存位置
      try {
        await Share.share({
          url: filePath,
          title: 'WellMusic 数据备份',
          message: 'WellMusic 数据备份文件',
        })
      } catch (shareError) {
        // 如果分享失败，至少文件已经保存到本地
        console.log('分享取消或失败:', shareError)
      }
    } catch (error) {
      Alert.alert('备份失败', '导出备份数据时出错，请重试。')
    } finally {
      setExporting(false)
    }
  }

  // 导入备份
  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      })
      
      if (result.canceled) return
      
      const fileUri = result.assets[0].uri
      const data = await importBackupData(fileUri)
      const stats = getBackupStats(data)
      
      Alert.alert(
        '确认恢复备份',
        `备份时间：${stats.backupDate}\n\n音乐数据：收藏 ${stats.favoritesCount} 首 · 歌单 ${stats.playListsCount} 个\n播放队列 ${stats.playQueueCount} 首 · 历史 ${stats.playHistoryCount} 首\n音源：${stats.musicApiCount} 个${stats.hasNeteaseCookie ? ' · 网易云已登录' : ''}\n听歌统计：${stats.playCount} 次播放 · ${formatListenTime(stats.listenSeconds)}\n\n恢复后将覆盖当前数据，确定继续吗？`,
        [
          { text: '取消', style: 'cancel' },
          {
            text: '恢复',
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackupData(data)
                Alert.alert('恢复成功', '备份数据已恢复，重启应用后生效。')
                onClose()
              } catch (error: any) {
                console.error('[Backup] 恢复失败详情:', error)
                Alert.alert('恢复失败', error?.message || '恢复备份数据时出错，请重试。')
              }
            },
          },
        ]
      )
    } catch (error) {
      Alert.alert('导入失败', '无法读取备份文件，请确认文件格式正确。')
    }
  }

  // 删除备份
  const handleDelete = (filePath: string, fileName: string) => {
    Alert.alert(
      '删除备份',
      `确定要删除备份文件「${fileName}」吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteBackupFile(filePath)
              await loadBackups()
            } catch (error) {
              Alert.alert('删除失败', '删除备份文件时出错。')
            }
          },
        },
      ]
    )
  }


  return (
    <View style={[styles.fullScreenContainer, { backgroundColor: bgColor }]}>
          {/* 顶部手柄 */}
          <View style={styles.handle} />

          {/* 标题 */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: textColor }]}>数据备份</Text>
          </View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            {/* 备份内容简说明 */}
            <Text style={[styles.backupHint, { color: subTextColor }]}>
              备份收藏、歌单、音源、设置、听歌记录等全部数据
            </Text>

            {/* 操作按钮 */}
            <View style={styles.actionButtons}>
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: accentColor }]}
                onPress={handleExport}
                disabled={exporting}
              >
                {exporting ? (
                  <ActivityIndicator size="small" color={bgColor} />
                ) : (
                  <>
                    <SFSymbol systemName="arrow.down.doc" size={20} color={bgColor} />
                    <Text style={[styles.actionButtonText, { color: bgColor }]}>立即备份</Text>
                  </>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: cardBg }]}
                onPress={handleImport}
              >
                <SFSymbol systemName="square.and.arrow.up" size={20} color={accentColor} />
                <Text style={[styles.actionButtonText, { color: accentColor }]}>从文件恢复</Text>
              </TouchableOpacity>
            </View>

            {/* 本地备份列表 */}
            <View style={[styles.card, { backgroundColor: cardBg, marginTop: 8 }]}>
              <Text style={[styles.cardTitle, { color: textColor, marginBottom: 4 }]}>本地备份</Text>
              {loading ? (
                <ActivityIndicator size="small" color={accentColor} style={{ padding: 20 }} />
              ) : backups.length === 0 ? (
                <Text style={[styles.emptyText, { color: subTextColor }]}>暂无备份文件</Text>
              ) : (
                backups.map((backup, index) => (
                  <View key={index} style={styles.backupFileItem}>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.backupFileName, { color: textColor }]}>{backup.name}</Text>
                      <Text style={[styles.backupFileInfo, { color: subTextColor }]}>
                        {formatFileSize(backup.size)} · {backup.mtime}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteButton}
                      onPress={() => handleDelete(backup.path, backup.name)}
                    >
                      <SFSymbol systemName="trash" size={18} color={dangerColor} />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  fullScreenContainer: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'transparent',
  },
  modalContainer: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 34,
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: '#ccc',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  title: {
    fontSize: 20,
    fontWeight: '500',
  },
  closeButton: {
    padding: 4,
  },
  content: {
    paddingHorizontal: 20,
  },
  backupHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 16,
    marginTop: 4,
    lineHeight: 18,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 14,
    lineHeight: 20,
  },
  backupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  backupItemText: {
    fontSize: 14,
    marginLeft: 10,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginVertical: 8,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
  },
  actionButtonText: {
    fontSize: 16,
    fontWeight: '500',
  },
  backupFileItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.1)',
  },
  backupFileName: {
    fontSize: 14,
    fontWeight: '500',
  },
  backupFileInfo: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteButton: {
    padding: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    padding: 20,
  },
  footerTip: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 20,
    lineHeight: 18,
  },
})

function formatListenTime(sec: number) {
  if (!sec || sec <= 0) return '0 分钟'
  const mins = Math.floor(sec / 60)
  if (mins < 60) return `${mins} 分钟`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h} 小时 ${m} 分` : `${h} 小时`
}
