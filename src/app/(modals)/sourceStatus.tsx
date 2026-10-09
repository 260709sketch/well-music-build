import React from 'react'
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native'
import { useSourceRequestLogStore, formatDuration, formatFileSize } from '@/store/sourceRequestLogStore'
import { musicApiSelectedStore, musicApiStore } from '@/player/PlayerStore'
import { useNavigation } from 'expo-router'
import { useAppTheme, useThemeColors } from '@/hooks/useAppTheme'

// 音源状态页面（完整移植 Kumone LXSourceStatusView）
export default function SourceStatusScreen() {
  const navigation = useNavigation()
  const { logs, clearLogs } = useSourceRequestLogStore()
  const colors = useThemeColors()
  const { isDark } = useAppTheme()

  // 当前音源信息
  const currentApi = musicApiSelectedStore.getValue()
  const allApis = musicApiStore.getValue() || []
  const activeSource = currentApi || allApis.find((a: any) => a.isSelected)

  // 请求统计
  const total = logs.length
  const success = logs.filter((l) => l.success).length
  const failed = total - success
  const avgDuration = total > 0
    ? (logs.reduce((sum, l) => sum + l.duration, 0) / total).toFixed(1) + 's'
    : '-'

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部导航 */}
      <View style={[styles.header, { backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>‹ 设置</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>音源状态</Text>
        <View style={{ width: 80 }} />
      </View>

      <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
        {/* 当前音源 */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>当前音源</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            {activeSource ? (
              <>
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>音源名称</Text>
                  <Text style={[styles.rowValue, { color: colors.textMuted, flex: 1, textAlign: 'right' }]} numberOfLines={2}>{activeSource.name || '未知'}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>版本</Text>
                  <Text style={[styles.rowValue, { color: colors.textMuted }]}>{activeSource.version || '-'}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />
                <View style={styles.row}>
                  <Text style={[styles.rowLabel, { color: colors.text }]}>作者</Text>
                  <Text style={[styles.rowValue, { color: colors.textMuted }]}>{activeSource.author || '-'}</Text>
                </View>
                <View style={[styles.divider, { backgroundColor: colors.separator }]} />
                <View style={[styles.row, { alignItems: 'flex-start', paddingVertical: 14 }]}>
                  <Text style={[styles.rowLabel, { color: colors.text, marginTop: 1 }]}>描述</Text>
                  <Text style={[styles.rowValue, { color: colors.textMuted, flex: 1, textAlign: 'right' }]} numberOfLines={3}>{activeSource.sourceDescription || activeSource.description || '-'}</Text>
                </View>
              </>
            ) : (
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>未激活任何音源</Text>
            )}
          </View>
        </View>

        {/* 请求统计 */}
        <View style={styles.section}>
          <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>请求统计</Text>
          <View style={[styles.card, { backgroundColor: colors.card }]}>
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>总请求数</Text>
              <Text style={[styles.rowValue, { color: colors.textMuted }]}>{total}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>成功</Text>
              <Text style={[styles.rowValue, { color: '#34c759' }]}>{success}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>失败</Text>
              <Text style={[styles.rowValue, { color: '#ff3b30' }]}>{failed}</Text>
            </View>
            <View style={[styles.divider, { backgroundColor: colors.separator }]} />
            <View style={styles.row}>
              <Text style={[styles.rowLabel, { color: colors.text }]}>平均耗时</Text>
              <Text style={[styles.rowValue, { color: colors.textMuted }]}>{avgDuration}</Text>
            </View>
          </View>
        </View>

        {/* 最近请求 */}
        <View style={styles.section}>
          <View style={styles.sectionHeaderRow}>
            <Text style={[styles.sectionHeader, { color: colors.textMuted }]}>最近请求</Text>
            {logs.length > 0 && (
              <TouchableOpacity onPress={clearLogs}>
                <Text style={styles.clearButton}>清空</Text>
              </TouchableOpacity>
            )}
          </View>
          {logs.length === 0 ? (
            <View style={[styles.card, { backgroundColor: colors.card }]}>
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>暂无请求记录，播放一首歌曲后自动记录</Text>
            </View>
          ) : (
            <View style={styles.logList}>
              {logs.map((log) => (
                <View key={log.id} style={[styles.logCard, { backgroundColor: colors.card }]}>
                  {/* 第一行：状态图标 + 歌曲名 + 耗时 */}
                  <View style={styles.logHeader}>
                    <View style={[styles.statusIcon, { backgroundColor: log.success ? '#34c759' : '#ff3b30' }]}>
                      <Text style={styles.statusIconText}>{log.success ? '✓' : '✕'}</Text>
                    </View>
                    <Text style={[styles.logTitle, { color: colors.text }]} numberOfLines={1}>{log.trackName}</Text>
                    <Text style={[styles.logDuration, { color: colors.textMuted }]}>{formatDuration(log.duration)}</Text>
                  </View>
                  {/* 第二行：歌手 */}
                  <Text style={[styles.logArtist, { color: colors.textMuted }]} numberOfLines={1}>{log.trackArtist}</Text>
                  {/* 第三行：平台 + 请求音质 + 文件大小 + 实际音质（Kumone 风格图标布局） */}
                  <View style={styles.logMetaRow}>
                    {log.platform && (
                      <View style={styles.metaItem}>
                        <Text style={[styles.metaIcon, { color: colors.textMuted }]}>🎵</Text>
                        <Text style={[styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>{log.platform}</Text>
                      </View>
                    )}
                    <View style={styles.metaItem}>
                      <Text style={[styles.metaIcon, { color: colors.textMuted }]}>🔊</Text>
                      <Text style={[styles.metaText, { color: colors.textMuted }]}>{log.requestedQuality}</Text>
                    </View>
                    {log.fileSize && (
                      <View style={styles.metaItem}>
                        <Text style={[styles.metaIcon, { color: colors.textMuted }]}>📄</Text>
                        <Text style={[styles.metaText, { color: colors.textMuted }]}>{formatFileSize(log.fileSize)}</Text>
                      </View>
                    )}
                    {log.actualQuality && (
                      <View style={styles.metaItem}>
                        <Text style={[styles.metaIcon, { color: colors.textMuted }]}>⬇️</Text>
                        <Text style={[styles.metaText, { color: colors.textMuted }]}>{log.actualQuality}</Text>
                      </View>
                    )}
                  </View>
                  {/* 第四行：URL */}
                  {log.url && (
                    <Text style={[styles.logUrl, { color: colors.textMuted }]} numberOfLines={1}>{log.url}</Text>
                  )}
                  {/* 错误信息 */}
                  {log.errorMessage && (
                    <Text style={styles.logError} numberOfLines={2}>{log.errorMessage}</Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 60,
    paddingBottom: 12,
  },
  backButton: {
    width: 80,
    height: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  backText: {
    color: '#ff3b30',
    fontSize: 17,
    fontWeight: '400',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '600',
    flex: 1,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 16,
  },
  section: {
    marginBottom: 28,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '400',
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  clearButton: {
    color: '#ff3b30',
    fontSize: 15,
    fontWeight: '400',
    marginRight: 4,
  },
  card: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginRight: 12,
  },
  rowValue: {
    fontSize: 16,
    fontWeight: '400',
  },
  divider: {
    height: 0.5,
    marginLeft: 16,
  },
  emptyText: {
    fontSize: 15,
    padding: 20,
    textAlign: 'center',
  },
  logList: {
    gap: 12,
  },
  logCard: {
    borderRadius: 12,
    padding: 14,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  statusIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  statusIconText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  logTitle: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
  },
  logDuration: {
    fontSize: 15,
    fontWeight: '400',
    marginLeft: 8,
  },
  logArtist: {
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 8,
    marginLeft: 32,
  },
  logMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginLeft: 32,
    marginBottom: 6,
    gap: 16,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaIcon: {
    fontSize: 14,
    marginRight: 5,
  },
  metaText: {
    fontSize: 14,
    fontWeight: '400',
  },
  logUrl: {
    fontSize: 12,
    fontWeight: '400',
    marginLeft: 32,
    opacity: 0.6,
  },
  logError: {
    color: '#ff453a',
    fontSize: 13,
    marginLeft: 32,
    marginTop: 4,
  },
})
