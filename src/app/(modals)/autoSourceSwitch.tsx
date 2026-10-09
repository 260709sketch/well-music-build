import React from 'react'
import SFSymbol from '@/components/SFSymbol'
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Switch,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAutoSourceSwitchStore, STRATEGY_LABELS, DEFAULT_STRATEGY_ORDER } from '@/store/autoSourceSwitchStore'
import { useThemeColors } from '@/hooks/useAppTheme'
import { ThemeColors } from '@/constants/tokens'

const AutoSourceSwitchSettings = () => {
  const colors = useThemeColors()
  const styles = createStyles(colors)
  const {
    enabled,
    maxAttempts,
    priorityRetry,
    strategyPriority,
    setEnabled,
    setMaxAttempts,
    setPriorityRetry,
    moveStrategy,
    setStrategyPriority,
  } = useAutoSourceSwitchStore()

  const moveUp = (index: number) => {
    if (index > 0) moveStrategy(index, index - 1)
  }

  const moveDown = (index: number) => {
    if (index < strategyPriority.length - 1) moveStrategy(index, index + 1)
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>自动换音源</Text>
        </View>
        <ScrollView style={styles.scroll}>
          {/* 启用开关 */}
          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <SFSymbol systemName="arrow.left.arrow.right" size={20} color={colors.text} style={styles.rowIcon} />
                <Text style={styles.rowText}>启用自动换音源</Text>
              </View>
              <Switch value={enabled} onValueChange={setEnabled} trackColor={{ false: colors.border, true: '#1DB954' }} />
            </View>
          </View>

          {/* 最大尝试次数 */}
          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <SFSymbol systemName="repeat" size={20} color={colors.text} style={styles.rowIcon} />
                <Text style={styles.rowText}>最大换源尝试次数</Text>
              </View>
              <View style={styles.counter}>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setMaxAttempts(maxAttempts - 1)}
                  disabled={!enabled || maxAttempts <= 1}
                >
                  <Text style={[styles.counterBtnText, (!enabled || maxAttempts <= 1) && styles.disabled]}>-</Text>
                </TouchableOpacity>
                <Text style={styles.counterValue}>{maxAttempts}</Text>
                <TouchableOpacity
                  style={styles.counterBtn}
                  onPress={() => setMaxAttempts(maxAttempts + 1)}
                  disabled={!enabled || maxAttempts >= 20}
                >
                  <Text style={[styles.counterBtnText, (!enabled || maxAttempts >= 20) && styles.disabled]}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* 优先重试 */}
          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowLeft}>
                <SFSymbol systemName="arrow.clockwise" size={20} color={colors.text} style={styles.rowIcon} />
                <View>
                  <Text style={styles.rowText}>优先重试3次</Text>
                  <Text style={styles.rowSubText}>当前音源失败后先重试3次再换源</Text>
                </View>
              </View>
              <Switch
                value={priorityRetry}
                onValueChange={setPriorityRetry}
                disabled={!enabled}
                trackColor={{ false: colors.border, true: '#1DB954' }}
              />
            </View>
          </View>

          {/* 策略优先级 */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>播放失败策略优先级</Text>
            <Text style={styles.sectionSub}>按顺序尝试，上一个策略全部失败后执行下一个</Text>
            {strategyPriority.map((strategy, index) => (
              <View key={strategy} style={[styles.strategyRow, !enabled && styles.disabledRow]}>
                <View style={styles.strategyIndex}>
                  <Text style={styles.strategyIndexText}>{index + 1}</Text>
                </View>
                <Text style={styles.strategyText}>{STRATEGY_LABELS[strategy]}</Text>
                <View style={styles.strategyButtons}>
                  <TouchableOpacity
                    onPress={() => moveUp(index)}
                    disabled={!enabled || index === 0}
                    style={styles.moveBtn}
                  >
                    <SFSymbol systemName="chevron.up" size={16} color={index === 0 || !enabled ? colors.textMuted : colors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => moveDown(index)}
                    disabled={!enabled || index === strategyPriority.length - 1}
                    style={styles.moveBtn}
                  >
                    <SFSymbol systemName="chevron.down" size={16} color={index === strategyPriority.length - 1 || !enabled ? colors.textMuted : colors.text} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
            <TouchableOpacity
              style={styles.resetBtn}
              onPress={() => setStrategyPriority([...DEFAULT_STRATEGY_ORDER])}
              disabled={!enabled}
            >
              <Text style={[styles.resetBtnText, !enabled && styles.disabled]}>恢复默认顺序</Text>
            </TouchableOpacity>
          </View>

          {/* 说明 */}
          <View style={styles.infoSection}>
            <SFSymbol systemName="info.circle" size={16} color={colors.textMuted} />
            <Text style={styles.infoText}>
              自动切换音源：尝试其他已启用的音源
              {'\n'}降低音质：当前音源内从高音质逐级降级
              {'\n'}播放下一首：全部失败后自动切下一首
            </Text>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

const createStyles = (colors: ThemeColors) =>
  StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    container: { flex: 1 },
    header: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 12,
    },
    title: { fontSize: 22, fontWeight: '500', color: colors.text },
    scroll: { flex: 1 },
    section: {
      marginHorizontal: 16,
      marginBottom: 12,
      backgroundColor: colors.card,
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 4,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
    },
    rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    rowIcon: { marginRight: 12 },
    rowText: { fontSize: 15, fontWeight: '500', color: colors.text },
    rowSubText: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
    counter: { flexDirection: 'row', alignItems: 'center' },
    counterBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    counterBtnText: { fontSize: 20, fontWeight: '500', color: colors.text },
    counterValue: { fontSize: 16, fontWeight: '500', color: colors.text, minWidth: 32, textAlign: 'center' },
    disabled: { opacity: 0.3 },
    disabledRow: { opacity: 0.5 },
    sectionTitle: { fontSize: 15, fontWeight: '500', color: colors.text, marginTop: 12, marginBottom: 2 },
    sectionSub: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
    strategyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 0.5,
      borderBottomColor: colors.border,
    },
    strategyIndex: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: '#1DB954',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    strategyIndexText: { fontSize: 13, fontWeight: '500', color: '#fff' },
    strategyText: { flex: 1, fontSize: 15, fontWeight: '500', color: colors.text },
    strategyButtons: { flexDirection: 'row', gap: 4 },
    moveBtn: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resetBtn: { paddingVertical: 12, alignItems: 'center' },
    resetBtnText: { fontSize: 14, fontWeight: '500', color: '#1DB954' },
    infoSection: {
      marginHorizontal: 16,
      marginBottom: 24,
      flexDirection: 'row',
      gap: 8,
    },
    infoText: { fontSize: 12, color: colors.textMuted, lineHeight: 20, flex: 1 },
  })

export default AutoSourceSwitchSettings
