import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import type { Task } from '../../../src/types/domain'
import { summarizeTask, taskRuntimeFlag, taskStatusText, useNativeTodoBoard } from '../state/useNativeTodoBoard'

const PRESET_COLORS = ['#5ea4ff', '#8b5cf6', '#34d399', '#f59e0b', '#f97316', '#ef4444', '#14b8a6']

function two(value: number): string {
  return String(value).padStart(2, '0')
}

function formatClockText(nowMs: number): string {
  const date = new Date(nowMs)
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}  ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim()
  const normalized = raw.length === 3 ? raw.split('').map((part) => `${part}${part}`).join('') : raw
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return `rgba(94, 164, 255, ${alpha})`
  }
  const value = Number.parseInt(normalized, 16)
  const red = (value >> 16) & 255
  const green = (value >> 8) & 255
  const blue = value & 255
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function taskAccent(task: Task): string {
  if ((task.colorMode === 'custom' || task.colorMode === 'preset') && task.colorValue) return task.colorValue
  if (task.archived) return '#9aa4b8'
  if (task.status === 'finished') return '#7ea7ff'
  if (task.status === 'doing') return '#22c55e'
  if (task.status === 'paused') return '#f59e0b'
  return '#64748b'
}

function timerColors(task: Task, accent: string): [string, string] {
  if (!task.showDuration) return ['rgba(31, 41, 55, 0.92)', 'rgba(17, 24, 39, 0.92)']
  if (task.archived) return ['rgba(71, 85, 105, 0.92)', 'rgba(51, 65, 85, 0.92)']
  if (task.status === 'finished') return ['rgba(59, 130, 246, 0.92)', 'rgba(37, 99, 235, 0.92)']
  if (task.status === 'doing') return ['rgba(13, 148, 136, 0.94)', 'rgba(8, 126, 164, 0.92)']
  if (task.status === 'paused') return ['rgba(217, 119, 6, 0.94)', 'rgba(180, 83, 9, 0.92)']
  return [hexToRgba(accent, 0.82), hexToRgba(accent, 0.54)]
}

function shellColors(task: Task, accent: string): [string, string] {
  if (task.status === 'finished') return ['rgba(13, 18, 28, 0.98)', 'rgba(8, 12, 20, 0.98)']
  if (task.archived) return ['rgba(23, 29, 40, 0.98)', 'rgba(17, 22, 32, 0.98)']
  return ['rgba(39, 44, 58, 0.97)', 'rgba(23, 27, 38, 0.98)']
}

function slotColors(task: Task, accent: string): [string, string] {
  if (task.status === 'finished') return ['rgba(46, 55, 76, 0.88)', 'rgba(28, 36, 52, 0.88)']
  if (task.archived) return ['rgba(55, 65, 81, 0.82)', 'rgba(30, 41, 59, 0.8)']
  return [hexToRgba(accent, 0.56), hexToRgba(accent, 0.28)]
}

function actionRailColors(task: Task, accent: string): [string, string] {
  if (task.status === 'finished') return ['rgba(70, 82, 104, 0.88)', 'rgba(42, 50, 66, 0.92)']
  if (task.archived) return ['rgba(73, 80, 92, 0.78)', 'rgba(45, 52, 62, 0.84)']
  return [hexToRgba(accent, 0.42), hexToRgba(accent, 0.18)]
}

function numberColors(task: Task, accent: string): [string, string] {
  if (task.status === 'finished') return ['rgba(17, 24, 39, 0.96)', 'rgba(31, 41, 55, 0.96)']
  if (task.archived) return ['rgba(31, 41, 55, 0.92)', 'rgba(17, 24, 39, 0.94)']
  return ['rgba(26, 32, 45, 0.96)', hexToRgba(accent, 0.34)]
}

type FilterChipProps = {
  active: boolean
  label: string
  count: number
  onPress: () => void
}

function FilterChip({ active, label, count, onPress }: FilterChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active ? styles.filterChipActive : null]}>
      <Text style={[styles.filterChipLabel, active ? styles.filterChipLabelActive : null]}>{label}</Text>
      <Text style={styles.filterChipCount}>{count}</Text>
    </Pressable>
  )
}

type TaskStripProps = {
  task: Task
  displayOrder: number
  nowMs: number
  glowOpacity: Animated.AnimatedInterpolation<number>
  pulseScale: Animated.AnimatedInterpolation<number>
  sweepX: Animated.AnimatedInterpolation<number>
  onOpenEditor: (task: Task) => void
  onToggleTimer: (task: Task) => void
  onToggleFinished: (task: Task) => void
  onOpenMenu: (task: Task) => void
  formatDuration: (durationMs: number) => string
  calcTaskDuration: (task: Task, nowMs: number) => number
}

function TaskStrip({
  task,
  displayOrder,
  nowMs,
  glowOpacity,
  pulseScale,
  sweepX,
  onOpenEditor,
  onToggleTimer,
  onToggleFinished,
  onOpenMenu,
  formatDuration,
  calcTaskDuration,
}: TaskStripProps) {
  const accent = taskAccent(task)
  const runtimeText = taskRuntimeFlag(task)
  const previewText = task.contentRaw.trim() || '空任务'
  const durationText = task.showDuration ? `[${formatDuration(calcTaskDuration(task, nowMs))}]` : '[--:--:--]'
  const isRunning = task.status === 'doing'
  const isFinished = task.status === 'finished'
  const isArchived = task.archived
  const shellBorder = isRunning ? accent : isFinished ? 'rgba(255,255,255,0.92)' : 'rgba(255,255,255,0.78)'
  const shellShadow = isRunning ? hexToRgba(accent, 0.42) : 'rgba(0,0,0,0.46)'
  const energyWidth = isRunning ? '100%' : isFinished ? '68%' : isArchived ? '24%' : '42%'

  const leftActionLabel = isArchived ? '↺' : isFinished ? '↺' : isRunning ? '||' : '▶'
  const rightActionLabel = isArchived ? '⋯' : isFinished ? '✓' : '■'

  return (
    <View style={[styles.stripShell, { borderColor: shellBorder, shadowColor: shellShadow }]}>
      <LinearGradient colors={shellColors(task, accent)} style={StyleSheet.absoluteFillObject} />
      {isRunning ? (
        <>
          <Animated.View pointerEvents="none" style={[styles.runningGlow, { backgroundColor: hexToRgba(accent, 0.2), opacity: glowOpacity }]} />
          <Animated.View
            pointerEvents="none"
            style={[styles.runningSweep, { backgroundColor: hexToRgba('#ffffff', 0.12), opacity: glowOpacity, transform: [{ translateX: sweepX }, { rotate: '18deg' }] }]}
          />
        </>
      ) : null}

      <Pressable delayLongPress={220} onLongPress={() => onOpenMenu(task)} style={styles.stripPressable}>
        <View style={styles.stripRow}>
          <LinearGradient colors={numberColors(task, accent)} style={[styles.orderCapsule, isRunning ? { borderColor: hexToRgba(accent, 0.66) } : null]}>
            <Text style={styles.orderText}>#{displayOrder}</Text>
          </LinearGradient>

          <Pressable onPress={() => onOpenEditor(task)} style={styles.contentPressable}>
            <LinearGradient colors={slotColors(task, accent)} style={styles.contentCapsule}>
              <View style={styles.contentTextWrap}>
                <Text numberOfLines={2} style={styles.stripContentText}>{previewText}</Text>
              </View>
              <View style={styles.bottomMetaRow}>
                <Text style={styles.stripHintText}>{runtimeText ?? taskStatusText(task)}</Text>
                {task.attachments.length > 0 ? <Text style={styles.attachBadge}>{task.attachments.length} 图</Text> : null}
              </View>
            </LinearGradient>
          </Pressable>

          <LinearGradient colors={actionRailColors(task, accent)} style={styles.actionRail}>
            <View style={styles.actionButtonRow}>
              <Pressable onPress={() => (isArchived ? onOpenMenu(task) : isFinished ? onToggleFinished(task) : onToggleTimer(task))} style={[styles.iconButton, isRunning ? styles.iconButtonRunning : null]}>
                <Text style={styles.iconGlyph}>{leftActionLabel}</Text>
              </Pressable>
              <Pressable onPress={() => (isArchived ? onOpenMenu(task) : isFinished ? onOpenMenu(task) : onToggleFinished(task))} style={[styles.iconButton, !isArchived && !isFinished ? styles.iconButtonFinish : null]}>
                <Text style={styles.iconGlyph}>{rightActionLabel}</Text>
              </Pressable>
            </View>

            <Animated.View style={[styles.timerAnimatedWrap, isRunning ? { transform: [{ scale: pulseScale }] } : null]}>
              <LinearGradient colors={timerColors(task, accent)} style={[styles.timerChip, { borderColor: hexToRgba(accent, task.showDuration ? 0.36 : 0.18) }]}>
                <Text style={styles.timerChipText}>{durationText}</Text>
              </LinearGradient>
            </Animated.View>
          </LinearGradient>
        </View>

        <View style={styles.energyTrack}>
          <Animated.View style={[styles.energyFill, { width: energyWidth, backgroundColor: isRunning ? hexToRgba(accent, 0.95) : hexToRgba(accent, isFinished ? 0.48 : 0.24), opacity: isRunning ? glowOpacity : 1 }]} />
        </View>
      </Pressable>
    </View>
  )
}

export function NativeTodoApp() {
  const board = useNativeTodoBoard()
  const [customColorDraft, setCustomColorDraft] = useState('')
  const [editorTaskId, setEditorTaskId] = useState<string | null>(null)
  const [editorDraft, setEditorDraft] = useState('')
  const pulseValue = useRef(new Animated.Value(0.94)).current
  const sweepValue = useRef(new Animated.Value(0)).current

  useEffect(() => {
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, { toValue: 1.04, duration: 920, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulseValue, { toValue: 0.94, duration: 920, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    )
    const sweepLoop = Animated.loop(
      Animated.timing(sweepValue, { toValue: 1, duration: 2200, easing: Easing.linear, useNativeDriver: true }),
    )
    pulseLoop.start()
    sweepLoop.start()
    return () => {
      pulseLoop.stop()
      sweepLoop.stop()
      pulseValue.stopAnimation()
      sweepValue.stopAnimation()
    }
  }, [pulseValue, sweepValue])

  useEffect(() => {
    setCustomColorDraft(board.selectedTask?.colorValue ?? '')
  }, [board.selectedTask?.colorValue, board.selectedTask?.id])

  const editorTask = useMemo(() => board.snapshot.tasks.find((task) => task.id === editorTaskId) ?? null, [board.snapshot.tasks, editorTaskId])

  useEffect(() => {
    setEditorDraft(editorTask?.contentRaw ?? '')
  }, [editorTask?.contentRaw, editorTask?.id])

  const canResolveAssets = Boolean(board.config.enabled && board.config.serverUrl && board.config.token)
  const archivedRangeLabel = useMemo(() => {
    const { archivedDisplayMode, archivedRangeStart, archivedRangeEnd } = board.snapshot.settings
    if (archivedDisplayMode === 'all') return '全部归档日期'
    return `${archivedRangeStart || '开始日期'} - ${archivedRangeEnd || '结束日期'}`
  }, [board.snapshot.settings])

  const pulseOpacity = pulseValue.interpolate({ inputRange: [0.94, 1.04], outputRange: [0.22, 0.54] })
  const pulseScale = pulseValue.interpolate({ inputRange: [0.94, 1.04], outputRange: [0.98, 1.03] })
  const sweepX = sweepValue.interpolate({ inputRange: [0, 1], outputRange: [-180, 360] })

  const closeTaskMenu = () => board.setTaskMenuId(null)
  const closeEditor = () => setEditorTaskId(null)

  if (!board.hydrated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <LinearGradient colors={['#060a12', '#0b111c', '#0f1624']} style={styles.fill}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color="#9bd97a" />
            <Text style={styles.loadingTitle}>正在装配任务动态条</Text>
            <Text style={styles.loadingSubtitle}>读取本地缓存并恢复移动端状态</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient colors={['#060a12', '#0b111c', '#0f1624']} style={styles.fill}>
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.windowShell}>
            <View style={styles.windowTopRow}>
              <View style={styles.titleGroup}>
                <Text style={styles.windowTitle}>Neo Float Todo</Text>
                <Text style={styles.windowTime}>{formatClockText(board.nowMs)}</Text>
              </View>

              <View style={styles.chromeGroup}>
                <Pressable onPress={() => board.runSync()} disabled={board.busy} style={styles.chromePill}>
                  <Text style={styles.chromePillText}>{board.busy ? 'SYNC' : '同步'}</Text>
                </Pressable>
                <Pressable onPress={() => board.setSettingsOpen(true)} style={[styles.chromePill, styles.chromePillWide]}>
                  <Text style={styles.chromePillText}>Settings</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.headerMetaRow}>
              <Text style={styles.syncSummaryText} numberOfLines={2}>
                {board.syncSummaryText}
              </Text>
              <View style={styles.quickStatsRow}>
                <View style={styles.quickStat}>
                  <Text style={styles.quickStatLabel}>进行</Text>
                  <Text style={styles.quickStatValue}>{board.taskCounts.active}</Text>
                </View>
                <View style={styles.quickStat}>
                  <Text style={styles.quickStatLabel}>完成</Text>
                  <Text style={styles.quickStatValue}>{board.taskCounts.finished}</Text>
                </View>
              </View>
            </View>
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
            {board.filterOptions.map((option) => (
              <FilterChip
                key={option.id}
                active={board.filter === option.id}
                label={option.label}
                count={option.count}
                onPress={() => board.setFilter(option.id)}
              />
            ))}
          </ScrollView>

          {board.visibleTasks.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>当前筛选下没有任务条</Text>
              <Text style={styles.emptyText}>可以先新建任务，或者切换筛选与归档显示范围。</Text>
            </View>
          ) : (
            <View style={styles.taskList}>
              {board.visibleTasks.map((task, index) => (
                <TaskStrip
                  key={task.id}
                  task={task}
                  displayOrder={index + 1}
                  nowMs={board.nowMs}
                  glowOpacity={pulseOpacity}
                  pulseScale={pulseScale}
                  sweepX={sweepX}
                  onOpenEditor={(item) => setEditorTaskId(item.id)}
                  onToggleTimer={(item) => board.toggleTaskTimer(item.id)}
                  onToggleFinished={(item) => board.toggleTaskFinished(item.id)}
                  onOpenMenu={(item) => board.setTaskMenuId(item.id)}
                  formatDuration={board.formatDuration}
                  calcTaskDuration={board.calcTaskDuration}
                />
              ))}
            </View>
          )}
        </ScrollView>

        <Pressable onPress={board.addTask} style={styles.addStripButton}>
          <Text style={styles.addStripPlus}>+</Text>
          <Text style={styles.addStripText}>追加任务条</Text>
        </Pressable>

        <Modal visible={Boolean(editorTask)} animationType="slide" transparent onRequestClose={closeEditor}>
          <View style={styles.overlay}>
            <View style={styles.editorSheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                {editorTask ? (
                  <>
                    <View style={styles.sheetHeader}>
                      <View>
                        <Text style={styles.sheetKicker}>任务编辑</Text>
                        <Text style={styles.sheetTitle}>{summarizeTask(editorTask)}</Text>
                      </View>
                      <View
                        style={[
                          styles.sheetStatusPill,
                          {
                            backgroundColor: hexToRgba(taskAccent(editorTask), 0.2),
                            borderColor: hexToRgba(taskAccent(editorTask), 0.42),
                          },
                        ]}
                      >
                        <Text style={styles.sheetStatusText}>{taskStatusText(editorTask)}</Text>
                      </View>
                    </View>

                    <TextInput
                      value={editorDraft}
                      onChangeText={setEditorDraft}
                      multiline
                      placeholder="输入任务内容"
                      placeholderTextColor="#70809b"
                      style={styles.editorInput}
                      textAlignVertical="top"
                    />

                    {editorTask.attachments.length > 0 ? (
                      canResolveAssets ? (
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.attachmentRow}>
                          {editorTask.attachments.map((attachment) => (
                            <Image key={attachment.id} source={{ uri: board.buildAssetUrl(attachment.storagePath) }} style={styles.attachmentImage} />
                          ))}
                        </ScrollView>
                      ) : (
                        <Text style={styles.sheetMutedText}>该任务含 {editorTask.attachments.length} 张图片，连接同步后可预览。</Text>
                      )
                    ) : null}

                    <Text style={styles.sheetMutedText}>更新于 {board.localDateTimeText(editorTask.updatedAt)}</Text>

                    <View style={styles.editorActionRow}>
                      <Pressable onPress={closeEditor} style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>取消</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          board.updateTaskContent(editorTask.id, editorDraft)
                          closeEditor()
                        }}
                        style={styles.primaryButton}
                      >
                        <Text style={styles.primaryButtonText}>保存内容</Text>
                      </Pressable>
                    </View>

                    <Pressable
                      onPress={() => {
                        setEditorTaskId(null)
                        board.setTaskMenuId(editorTask.id)
                      }}
                      style={styles.menuLinkButton}
                    >
                      <Text style={styles.menuLinkText}>打开更多任务操作</Text>
                    </Pressable>
                  </>
                ) : null}
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={board.settingsOpen} animationType="slide" transparent onRequestClose={() => board.setSettingsOpen(false)}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>移动端设置</Text>

                <View style={styles.sheetCard}>
                  <Text style={styles.sheetSectionTitle}>同步服务</Text>
                  <View style={styles.settingRow}>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingLabel}>启用同步</Text>
                      <Text style={styles.settingHint}>沿用桌面端同一套状态与接口。</Text>
                    </View>
                    <Switch
                      value={board.draftConfig.enabled}
                      onValueChange={(value) => board.setDraftConfig({ ...board.draftConfig, enabled: value })}
                      trackColor={{ false: '#253047', true: '#284a71' }}
                      thumbColor={board.draftConfig.enabled ? '#9bd97a' : '#9ca3af'}
                    />
                  </View>
                  <TextInput
                    value={board.draftConfig.serverUrl}
                    onChangeText={(value) => board.setDraftConfig({ ...board.draftConfig, serverUrl: value })}
                    placeholder="https://example.com"
                    placeholderTextColor="#62718d"
                    autoCapitalize="none"
                    style={styles.sheetField}
                  />
                  <TextInput
                    value={board.draftConfig.token}
                    onChangeText={(value) => board.setDraftConfig({ ...board.draftConfig, token: value })}
                    placeholder="输入同步 Token"
                    placeholderTextColor="#62718d"
                    autoCapitalize="none"
                    style={styles.sheetField}
                  />
                  <Pressable onPress={() => void board.saveConfig()} style={styles.primaryButton}>
                    <Text style={styles.primaryButtonText}>保存同步配置</Text>
                  </Pressable>
                </View>

                <View style={styles.sheetCard}>
                  <Text style={styles.sheetSectionTitle}>归档显示</Text>
                  <View style={styles.settingRow}>
                    <View style={styles.settingCopy}>
                      <Text style={styles.settingLabel}>显示归档任务</Text>
                      <Text style={styles.settingHint}>关闭后，移动端主列表不显示已归档条目。</Text>
                    </View>
                    <Switch
                      value={board.snapshot.settings.showArchived}
                      onValueChange={(value) => board.updateSettings({ showArchived: value })}
                      trackColor={{ false: '#253047', true: '#233f35' }}
                      thumbColor={board.snapshot.settings.showArchived ? '#34d399' : '#9ca3af'}
                    />
                  </View>
                  <View style={styles.segmentRow}>
                    <Pressable onPress={() => board.updateSettings({ archivedDisplayMode: 'all' })} style={[styles.segmentButton, board.snapshot.settings.archivedDisplayMode === 'all' ? styles.segmentButtonActive : null]}>
                      <Text style={styles.segmentButtonText}>全部</Text>
                    </Pressable>
                    <Pressable onPress={() => board.updateSettings({ archivedDisplayMode: 'range' })} style={[styles.segmentButton, board.snapshot.settings.archivedDisplayMode === 'range' ? styles.segmentButtonActive : null]}>
                      <Text style={styles.segmentButtonText}>按日期</Text>
                    </Pressable>
                  </View>
                  <View style={styles.rangeRow}>
                    <TextInput
                      value={board.snapshot.settings.archivedRangeStart}
                      onChangeText={(value) => board.updateSettings({ archivedRangeStart: value })}
                      placeholder="开始日期"
                      placeholderTextColor="#62718d"
                      style={[styles.sheetField, styles.rangeField]}
                    />
                    <TextInput
                      value={board.snapshot.settings.archivedRangeEnd}
                      onChangeText={(value) => board.updateSettings({ archivedRangeEnd: value })}
                      placeholder="结束日期"
                      placeholderTextColor="#62718d"
                      style={[styles.sheetField, styles.rangeField]}
                    />
                  </View>
                  <Text style={styles.sheetMutedText}>当前范围: {archivedRangeLabel}</Text>
                </View>

                <Pressable onPress={() => board.setSettingsOpen(false)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>完成</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={Boolean(board.selectedTask)} animationType="slide" transparent onRequestClose={closeTaskMenu}>
          <View style={styles.overlay}>
            <View style={styles.sheet}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={styles.sheetTitle}>任务操作</Text>
                {board.selectedTask ? (
                  <>
                    <View style={styles.sheetCard}>
                      <Text style={styles.sheetSectionTitle}>{summarizeTask(board.selectedTask)}</Text>
                      <Text style={styles.sheetMutedText}>状态: {taskStatusText(board.selectedTask)}</Text>
                    </View>

                    <View style={styles.sheetCard}>
                      {[
                        { label: '在下方插入任务', action: () => board.insertTaskAfter(board.selectedTask!.id) },
                        { label: '上移一位', action: () => board.moveTask(board.selectedTask!.id, -1) },
                        { label: '下移一位', action: () => board.moveTask(board.selectedTask!.id, 1) },
                        { label: board.selectedTask.showDuration ? '隐藏当前任务时长' : '显示当前任务时长', action: () => board.toggleTaskDurationVisibility(board.selectedTask!.id) },
                        { label: '显示全部任务时长', action: () => board.setAllTaskDurationVisibility(true) },
                        { label: '隐藏全部任务时长', action: () => board.setAllTaskDurationVisibility(false) },
                        { label: '当前任务切到单行时长', action: () => board.setTaskDurationLayoutMode(board.selectedTask!.id, 'inline') },
                        { label: '当前任务切到多行时长', action: () => board.setTaskDurationLayoutMode(board.selectedTask!.id, 'stacked') },
                        { label: '全部任务单行时长', action: () => board.setTasksDurationLayoutMode(board.snapshot.tasks.map((task) => task.id), 'inline') },
                        { label: '全部任务多行时长', action: () => board.setTasksDurationLayoutMode(board.snapshot.tasks.map((task) => task.id), 'stacked') },
                      ].map((item) => (
                        <Pressable key={item.label} onPress={() => { item.action(); closeTaskMenu() }} style={styles.menuButton}>
                          <Text style={styles.menuButtonText}>{item.label}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={styles.sheetCard}>
                      <Text style={styles.sheetSectionTitle}>颜色主题</Text>
                      <View style={styles.colorRow}>
                        {PRESET_COLORS.map((color) => (
                          <Pressable
                            key={color}
                            onPress={() => {
                              board.setTaskPresetColor(board.selectedTask!.id, color)
                              setCustomColorDraft(color)
                              closeTaskMenu()
                            }}
                            style={[styles.colorSwatch, { backgroundColor: color }]}
                          />
                        ))}
                      </View>
                      <TextInput
                        value={customColorDraft}
                        onChangeText={setCustomColorDraft}
                        placeholder="#5ea4ff"
                        placeholderTextColor="#62718d"
                        autoCapitalize="none"
                        style={styles.sheetField}
                      />
                      <Pressable
                        onPress={() => {
                          const nextColor = customColorDraft.trim()
                          if (!/^#?[0-9a-fA-F]{6}$/.test(nextColor)) return
                          board.setTaskCustomColor(board.selectedTask!.id, nextColor.startsWith('#') ? nextColor : `#${nextColor}`)
                          closeTaskMenu()
                        }}
                        style={styles.menuButton}
                      >
                        <Text style={styles.menuButtonText}>应用自定义颜色</Text>
                      </Pressable>
                      <Pressable onPress={() => { board.clearTaskColor(board.selectedTask!.id); closeTaskMenu() }} style={styles.menuButton}>
                        <Text style={styles.menuButtonText}>恢复默认颜色</Text>
                      </Pressable>
                    </View>

                    <View style={styles.sheetCard}>
                      {board.selectedTask.archived ? (
                        <Pressable onPress={() => { board.unarchiveTask(board.selectedTask!.id); closeTaskMenu() }} style={styles.menuButton}>
                          <Text style={styles.menuButtonText}>取消归档</Text>
                        </Pressable>
                      ) : (
                        <>
                          <Pressable onPress={() => { board.archiveTask(board.selectedTask!.id); closeTaskMenu() }} style={styles.menuButton}>
                            <Text style={styles.menuButtonText}>归档当前任务</Text>
                          </Pressable>
                          <Pressable onPress={() => { board.archiveAndHideTask(board.selectedTask!.id); closeTaskMenu() }} style={styles.menuButton}>
                            <Text style={styles.menuButtonText}>归档并立即隐藏</Text>
                          </Pressable>
                        </>
                      )}
                      <Pressable onPress={() => { board.hideArchivedTasks({ mode: 'all' }); closeTaskMenu() }} style={styles.menuButton}>
                        <Text style={styles.menuButtonText}>隐藏所有已归档任务</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          board.hideArchivedTasks({
                            mode: 'range',
                            start: board.snapshot.settings.archivedRangeStart,
                            end: board.snapshot.settings.archivedRangeEnd,
                          })
                          closeTaskMenu()
                        }}
                        style={styles.menuButton}
                      >
                        <Text style={styles.menuButtonText}>按日期范围隐藏归档</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          const taskId = board.selectedTask!.id
                          Alert.alert('删除任务', '确定要删除这条任务吗？', [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '删除',
                              style: 'destructive',
                              onPress: () => {
                                board.deleteTask(taskId)
                                closeTaskMenu()
                              },
                            },
                          ])
                        }}
                        style={[styles.menuButton, styles.menuButtonDanger]}
                      >
                        <Text style={styles.menuButtonDangerText}>删除当前任务</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
                <Pressable onPress={closeTaskMenu} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>关闭</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#060a12' },
  fill: { flex: 1 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 28 },
  loadingTitle: { color: '#f8fbff', fontSize: 22, fontWeight: '800' },
  loadingSubtitle: { color: '#91a1bb', fontSize: 14, textAlign: 'center' },
  scrollContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 108, gap: 12 },
  windowShell: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)', backgroundColor: 'rgba(13, 18, 28, 0.86)', paddingHorizontal: 12, paddingVertical: 10, gap: 10, shadowColor: '#000', shadowOpacity: 0.25, shadowOffset: { width: 0, height: 10 }, shadowRadius: 20, elevation: 8 },
  windowTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  titleGroup: { flex: 1, gap: 2 },
  windowTitle: { color: '#ffffff', fontSize: 23, fontWeight: '900' },
  windowTime: { color: '#d9e4f4', fontSize: 14, fontWeight: '700', fontVariant: ['tabular-nums'] },
  chromeGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chromePill: { minHeight: 34, paddingHorizontal: 12, borderRadius: 12, backgroundColor: 'rgba(72, 78, 96, 0.88)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  chromePillWide: { minWidth: 88 },
  chromePillText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  headerMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  syncSummaryText: { flex: 1, color: '#92a1bb', fontSize: 12, lineHeight: 17 },
  quickStatsRow: { flexDirection: 'row', gap: 8 },
  quickStat: { minWidth: 56, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: 'rgba(23, 29, 40, 0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', alignItems: 'center' },
  quickStatLabel: { color: '#92a1bb', fontSize: 10 },
  quickStatValue: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  filterRail: { gap: 8 },
  filterChip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, backgroundColor: 'rgba(18, 24, 36, 0.84)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  filterChipActive: { backgroundColor: 'rgba(110, 185, 75, 0.22)', borderColor: 'rgba(174, 237, 132, 0.42)' },
  filterChipLabel: { color: '#d7e1f1', fontSize: 13, fontWeight: '700' },
  filterChipLabelActive: { color: '#f8fbff' },
  filterChipCount: { color: '#9bd97a', fontSize: 12, fontWeight: '800' },
  taskList: { gap: 10 },
  stripShell: { position: 'relative', borderRadius: 16, borderWidth: 1.5, overflow: 'hidden', shadowOffset: { width: 0, height: 14 }, shadowRadius: 20, shadowOpacity: 0.22, elevation: 7 },
  stripPressable: { position: 'relative' },
  runningGlow: { ...StyleSheet.absoluteFillObject },
  runningSweep: { position: 'absolute', top: -20, bottom: -20, left: -160, width: 110 },
  stripRow: { flexDirection: 'row', alignItems: 'stretch', gap: 6, padding: 4 },
  orderCapsule: { width: 48, minHeight: 52, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.62)', alignItems: 'center', justifyContent: 'center' },
  orderText: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  contentPressable: { flex: 1 },
  contentCapsule: { minHeight: 52, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.34)', paddingHorizontal: 12, paddingVertical: 7 },
  contentTextWrap: { flex: 1, justifyContent: 'center' },
  bottomMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 4 },
  attachBadge: { color: '#fff7c2', fontSize: 10, fontWeight: '900' },
  stripHintText: { color: '#eef5ff', fontSize: 10, fontWeight: '800', opacity: 0.82 },
  stripContentText: { color: '#ffffff', fontSize: 15, lineHeight: 19, fontWeight: '700' },
  actionRail: { width: 94, borderRadius: 11, borderWidth: 1, borderColor: 'rgba(255,255,255,0.32)', padding: 5, gap: 5 },
  actionButtonRow: { flexDirection: 'row', gap: 6 },
  iconButton: { flex: 1, minHeight: 24, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.46)', backgroundColor: 'rgba(13, 18, 28, 0.56)', alignItems: 'center', justifyContent: 'center' },
  iconButtonRunning: { backgroundColor: 'rgba(24, 145, 114, 0.5)' },
  iconButtonFinish: { backgroundColor: 'rgba(141, 88, 22, 0.5)' },
  iconGlyph: { color: '#ffffff', fontSize: 14, fontWeight: '900' },
  timerAnimatedWrap: { minHeight: 22 },
  timerChip: { minHeight: 22, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  timerChipText: { color: '#fff7d6', fontSize: 11, fontWeight: '900', fontVariant: ['tabular-nums'] },
  energyTrack: { height: 4, backgroundColor: 'rgba(255,255,255,0.08)' },
  energyFill: { height: '100%', borderTopRightRadius: 4, borderBottomRightRadius: 4 },
  emptyState: { borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(13, 18, 28, 0.82)', padding: 18, gap: 6 },
  emptyTitle: { color: '#ffffff', fontSize: 18, fontWeight: '800' },
  emptyText: { color: '#91a1bb', fontSize: 14, lineHeight: 20 },
  addStripButton: { position: 'absolute', right: 14, bottom: 18, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, backgroundColor: '#99d46c', paddingHorizontal: 18, paddingVertical: 14, shadowColor: '#070d14', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 12 }, shadowRadius: 18, elevation: 8 },
  addStripPlus: { color: '#0a111b', fontSize: 24, fontWeight: '900', lineHeight: 24 },
  addStripText: { color: '#0a111b', fontSize: 15, fontWeight: '900' },
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(2, 5, 11, 0.74)' },
  sheet: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0d1625', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  editorSheet: { maxHeight: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0d1625', paddingHorizontal: 18, paddingTop: 18, paddingBottom: 28 },
  sheetHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14 },
  sheetKicker: { color: '#8fb3ff', fontSize: 12, fontWeight: '800', letterSpacing: 0.6 },
  sheetTitle: { color: '#ffffff', fontSize: 22, fontWeight: '900', marginBottom: 14 },
  sheetStatusPill: { minHeight: 28, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  sheetStatusText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  editorInput: { minHeight: 220, borderRadius: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.16)', backgroundColor: 'rgba(8, 12, 20, 0.82)', color: '#f8fbff', paddingHorizontal: 14, paddingVertical: 14, fontSize: 15, lineHeight: 22, marginBottom: 14 },
  attachmentRow: { gap: 10, paddingBottom: 4, marginBottom: 10 },
  attachmentImage: { width: 138, height: 104, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)' },
  editorActionRow: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 10 },
  primaryButton: { flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: '#99d46c', alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#0a111b', fontSize: 15, fontWeight: '900' },
  secondaryButton: { flex: 1, minHeight: 46, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.08)', alignItems: 'center', justifyContent: 'center' },
  secondaryButtonText: { color: '#f8fbff', fontSize: 15, fontWeight: '800' },
  menuLinkButton: { minHeight: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(91, 124, 210, 0.18)' },
  menuLinkText: { color: '#dce7ff', fontSize: 14, fontWeight: '800' },
  sheetCard: { borderRadius: 20, backgroundColor: 'rgba(14, 22, 36, 0.92)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', padding: 16, gap: 12, marginBottom: 14 },
  sheetSectionTitle: { color: '#ffffff', fontSize: 17, fontWeight: '800' },
  sheetMutedText: { color: '#91a1bb', fontSize: 13, lineHeight: 18 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  settingCopy: { flex: 1, gap: 4 },
  settingLabel: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
  settingHint: { color: '#91a1bb', fontSize: 13, lineHeight: 18 },
  sheetField: { borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', backgroundColor: 'rgba(8, 12, 20, 0.8)', color: '#f8fbff', fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  segmentRow: { flexDirection: 'row', gap: 10 },
  segmentButton: { flex: 1, minHeight: 40, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center' },
  segmentButtonActive: { backgroundColor: 'rgba(110, 185, 75, 0.22)', borderWidth: 1, borderColor: 'rgba(174, 237, 132, 0.42)' },
  segmentButtonText: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  rangeRow: { flexDirection: 'row', gap: 10 },
  rangeField: { flex: 1 },
  menuButton: { minHeight: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  menuButtonText: { color: '#f8fbff', fontSize: 14, fontWeight: '700' },
  menuButtonDanger: { backgroundColor: 'rgba(239, 68, 68, 0.14)' },
  menuButtonDangerText: { color: '#fecdd3', fontSize: 14, fontWeight: '800' },
  colorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  colorSwatch: { width: 34, height: 34, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255,255,255,0.22)' },
})
