import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native'
import { StatusBar } from 'expo-status-bar'
import { LinearGradient } from 'expo-linear-gradient'
import { useFonts } from 'expo-font'
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans'
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from '@expo-google-fonts/space-grotesk'
import { JetBrainsMono_500Medium, JetBrainsMono_600SemiBold } from '@expo-google-fonts/jetbrains-mono'
import type { Task } from '../../../src/types/domain'
import { useNativeTodoBoard } from '../state/useNativeTodoBoard'
import { FilterChip, TaskCard } from './apkCards'
import { moveDraggedTaskIds, resolveDraggedTaskIndex } from './apkTaskDrag'
import { COLORS, PRESET_COLORS, formatClockText, formatRelativeStamp, rgba, taskStatusLabel, taskStatusTone } from './apkTheme'
import { happyApkStyles as styles } from './happyApkStyles'

type FilterId = 'active' | 'finished' | 'archived' | 'all'
type ActiveDrag = {
  taskId: string
  startPageY: number
  initialTop: number
  height: number
  offsetY: number
  targetIndex: number
}

function renderSyncSummary(params: {
  enabled: boolean
  phase: 'idle' | 'syncing' | 'error'
  dirty: boolean
  lastSyncAt: string | null
  lastError: string | null
  localDateTimeText: (value: string) => string
}): string {
  if (!params.enabled) return '当前只保留本地记录，尚未连接同步服务'
  if (params.phase === 'error') return params.lastError ?? '同步失败，请检查服务器地址和 Token'
  if (params.phase === 'syncing') return '正在和桌面端同步状态'
  if (params.dirty) return '本地修改已记录，等待自动同步'
  if (!params.lastSyncAt) return '同步已启用，等待首次连接'
  return `最近同步 ${params.localDateTimeText(params.lastSyncAt)}`
}

export function HappyApkTodoApp() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    JetBrainsMono_500Medium,
    JetBrainsMono_600SemiBold,
  })
  const board = useNativeTodoBoard()
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [editorDraft, setEditorDraft] = useState('')
  const [customColorDraft, setCustomColorDraft] = useState('')
  const [activeDrag, setActiveDrag] = useState<ActiveDrag | null>(null)
  const taskLayoutsRef = useRef<Record<string, { y: number; height: number }>>({})
  const activeDragRef = useRef<ActiveDrag | null>(null)

  const editorTask = useMemo(
    () => board.snapshot.tasks.find((task) => task.id === editingTaskId) ?? null,
    [board.snapshot.tasks, editingTaskId],
  )
  const syncSummaryText = useMemo(
    () =>
      renderSyncSummary({
        enabled: board.config.enabled,
        phase: board.syncState.phase,
        dirty: board.syncState.dirty,
        lastSyncAt: board.syncState.lastSyncAt,
        lastError: board.syncState.lastError,
        localDateTimeText: board.localDateTimeText,
      }),
    [
      board.config.enabled,
      board.localDateTimeText,
      board.syncState.dirty,
      board.syncState.lastError,
      board.syncState.lastSyncAt,
      board.syncState.phase,
    ],
  )
  const archivedRangeLabel = useMemo(
    () => `${board.snapshot.settings.archivedRangeStart.trim() || '未设置'} 至 ${board.snapshot.settings.archivedRangeEnd.trim() || '未设置'}`,
    [board.snapshot.settings.archivedRangeEnd, board.snapshot.settings.archivedRangeStart],
  )
  const filterOptions = useMemo(
    () => [
      { id: 'active' as FilterId, label: '进行中', count: board.taskCounts.active },
      { id: 'finished' as FilterId, label: '已完成', count: board.taskCounts.finished },
      { id: 'archived' as FilterId, label: '已归档', count: board.taskCounts.archived },
      { id: 'all' as FilterId, label: '全部', count: board.taskCounts.all },
    ],
    [board.taskCounts.active, board.taskCounts.all, board.taskCounts.archived, board.taskCounts.finished],
  )
  const visibleTaskIds = useMemo(() => board.visibleTasks.map((task) => task.id), [board.visibleTasks])
  const dropTargetTaskId = activeDrag ? visibleTaskIds[activeDrag.targetIndex] ?? null : null

  useEffect(() => {
    setEditorDraft(editorTask ? editorTask.contentRaw : '')
  }, [editorTask?.contentRaw, editorTask?.id])

  useEffect(() => {
    setCustomColorDraft(board.selectedTask?.colorValue ?? '')
  }, [board.selectedTask?.colorValue, board.selectedTask?.id])

  useEffect(() => {
    activeDragRef.current = activeDrag
  }, [activeDrag])

  useEffect(() => {
    if (!activeDrag) return
    if (visibleTaskIds.includes(activeDrag.taskId)) return
    setActiveDrag(null)
  }, [activeDrag, visibleTaskIds])

  const handleTaskLayout = useCallback((taskId: string, y: number, height: number) => {
    taskLayoutsRef.current[taskId] = { y, height }
  }, [])

  const handleStartDrag = useCallback((taskId: string, startPageY: number) => {
    if (visibleTaskIds.length <= 1) return

    const layout = taskLayoutsRef.current[taskId]
    if (!layout) return

    setActiveDrag({
      taskId,
      startPageY,
      initialTop: layout.y,
      height: layout.height,
      offsetY: 0,
      targetIndex: visibleTaskIds.indexOf(taskId),
    })
  }, [visibleTaskIds])

  const handleDragMove = useCallback((taskId: string, pageY: number) => {
    setActiveDrag((current) => {
      if (!current || current.taskId !== taskId) {
        return current
      }

      const offsetY = pageY - current.startPageY
      const draggedCenterY = current.initialTop + offsetY + current.height / 2
      const layouts = visibleTaskIds
        .map((id) => {
          const layout = taskLayoutsRef.current[id]
          return layout ? { id, y: layout.y, height: layout.height } : null
        })
        .filter((item): item is { id: string; y: number; height: number } => Boolean(item))
      const targetIndex = resolveDraggedTaskIndex(layouts, taskId, draggedCenterY)

      if (offsetY === current.offsetY && targetIndex === current.targetIndex) {
        return current
      }

      return {
        ...current,
        offsetY,
        targetIndex: targetIndex < 0 ? current.targetIndex : targetIndex,
      }
    })
  }, [visibleTaskIds])

  const handleEndDrag = useCallback((taskId: string) => {
    const currentDrag = activeDragRef.current
    if (!currentDrag || currentDrag.taskId !== taskId) {
      return
    }

    const reorderedTaskIds = moveDraggedTaskIds(visibleTaskIds, taskId, currentDrag.targetIndex)
    if (reorderedTaskIds.join('|') !== visibleTaskIds.join('|')) {
      board.reorderVisibleTasks(reorderedTaskIds)
    }

    setActiveDrag(null)
  }, [board, visibleTaskIds])

  function openEditor(task: Task) {
    setEditingTaskId(task.id)
    setEditorDraft(task.contentRaw)
  }

  function closeEditor() {
    setEditingTaskId(null)
    setEditorDraft('')
  }

  function saveEditor() {
    if (!editorTask) return
    board.updateTaskContent(editorTask.id, editorDraft)
    closeEditor()
  }

  function closeTaskSheet() {
    board.setTaskMenuId(null)
  }

  if (!fontsLoaded || !board.hydrated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <LinearGradient colors={[COLORS.canvas, COLORS.canvasAlt, '#0d1828']} style={styles.fill}>
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={COLORS.cyan} size="large" />
            <Text style={styles.loadingTitle}>正在准备 APK 同步端</Text>
            <Text style={styles.loadingBody}>加载本地状态、同步配置和视觉资源</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient colors={[COLORS.canvas, COLORS.canvasAlt, '#11192a']} style={styles.fill}>
        <View style={[styles.backgroundOrb, styles.backgroundOrbTop]} />
        <View style={[styles.backgroundOrb, styles.backgroundOrbBottom]} />

        <ScrollView contentContainerStyle={styles.scrollContent} scrollEnabled={!activeDrag} showsVerticalScrollIndicator={false}>
          <View style={styles.windowShell}>
            <View style={styles.windowTopRow}>
              <View style={styles.titleGroup}>
                <Text style={styles.windowTitle}>Neo Float Todo</Text>
                <Text style={styles.windowTime}>{formatClockText(board.nowMs)}</Text>
              </View>

              <View style={styles.chromeGroup}>
                <Pressable onPress={() => void board.runSync()} disabled={board.busy} style={styles.chromePill}>
                  <Text style={styles.chromePillText}>{board.busy ? 'SYNC' : '同步'}</Text>
                </Pressable>
                <Pressable onPress={() => board.setSettingsOpen(true)} style={[styles.chromePill, styles.chromePillWide]}>
                  <Text style={styles.chromePillText}>Settings</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.headerMetaRow}>
              <Text style={styles.syncSummaryText} numberOfLines={2}>
                {syncSummaryText}
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
                <View style={styles.quickStat}>
                  <Text style={styles.quickStatLabel}>归档</Text>
                  <Text style={styles.quickStatValue}>{board.taskCounts.archived}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.filterPanel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>筛选</Text>
              <Text style={styles.panelCaption}>切换当前任务流</Text>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRail}>
              {filterOptions.map((item) => (
                <FilterChip
                  key={item.id}
                  active={board.filter === item.id}
                  count={item.count}
                  label={item.label}
                  onPress={() => board.setFilter(item.id)}
                />
              ))}
            </ScrollView>
          </View>

          <View style={styles.sectionHeadingRow}>
            <View>
              <Text style={styles.sectionHeading}>任务条</Text>
              <Text style={styles.sectionCaption}>
                {activeDrag ? '松手即可完成重排' : '长按任务条即可拖动排序，右侧按钮保持直点'}
              </Text>
            </View>
            <Text style={styles.sectionCount}>{board.visibleTasks.length}</Text>
          </View>

          {board.visibleTasks.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>这个筛选下还没有任务</Text>
              <Text style={styles.emptyBody}>可以直接新建一条，或者切换到其他筛选查看已完成与已归档任务。</Text>
            </View>
          ) : (
            board.visibleTasks.map((task, index) => (
              <TaskCard
                key={task.id}
                index={index}
                nowMs={board.nowMs}
                task={task}
                dragOffsetY={activeDrag?.taskId === task.id ? activeDrag.offsetY : 0}
                isDragging={activeDrag?.taskId === task.id}
                isDropTarget={activeDrag ? activeDrag.taskId !== task.id && dropTargetTaskId === task.id : false}
                onDragEnd={handleEndDrag}
                onDragMove={handleDragMove}
                onLayout={handleTaskLayout}
                onOpenEditor={openEditor}
                onOpenMenu={(item) => board.setTaskMenuId(item.id)}
                onStartDrag={handleStartDrag}
                onToggleFinished={(item) => board.toggleTaskFinished(item.id)}
                onToggleTimer={(item) => board.toggleTaskTimer(item.id)}
                calcTaskDuration={board.calcTaskDuration}
                formatDuration={board.formatDuration}
              />
            ))
          )}
        </ScrollView>

        <Pressable style={styles.floatingComposer} onPress={() => board.addTask()}>
          <Text style={styles.floatingComposerPlus}>+</Text>
          <Text style={styles.floatingComposerText}>新建</Text>
        </Pressable>

        <Modal visible={board.settingsOpen} animationType="slide" transparent onRequestClose={() => board.setSettingsOpen(false)}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={() => board.setSettingsOpen(false)} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetKicker}>Settings</Text>
                    <Text style={styles.sheetTitle}>移动端同步设置</Text>
                  </View>
                  <Pressable style={styles.sheetCloseButton} onPress={() => board.setSettingsOpen(false)}>
                    <Text style={styles.sheetCloseText}>关闭</Text>
                  </Pressable>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScrollContent}>
                  <View style={styles.sheetCard}>
                    <Text style={styles.sheetCardTitle}>同步服务</Text>
                    <Text style={styles.sheetCardBody}>沿用桌面端同一套服务地址和 Token，移动端只做状态同步与轻量编辑。</Text>
                    <View style={styles.switchRow}>
                      <View style={styles.switchCopy}>
                        <Text style={styles.switchLabel}>启用同步</Text>
                        <Text style={styles.switchHint}>关闭后只保留本地记录</Text>
                      </View>
                      <Switch
                        value={board.draftConfig.enabled}
                        onValueChange={(value) => board.setDraftConfig({ ...board.draftConfig, enabled: value })}
                        trackColor={{ false: '#223045', true: '#1f5246' }}
                        thumbColor={board.draftConfig.enabled ? COLORS.cyan : '#9aa5b1'}
                      />
                    </View>
                    <TextInput
                      value={board.draftConfig.serverUrl}
                      onChangeText={(value) => board.setDraftConfig({ ...board.draftConfig, serverUrl: value })}
                      placeholder="https://example.com"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="none"
                      style={styles.textField}
                    />
                    <TextInput
                      value={board.draftConfig.token}
                      onChangeText={(value) => board.setDraftConfig({ ...board.draftConfig, token: value })}
                      placeholder="输入同步 Token"
                      placeholderTextColor={COLORS.textMuted}
                      autoCapitalize="none"
                      style={styles.textField}
                    />
                    <View style={styles.sheetButtonRow}>
                      <Pressable onPress={() => void board.saveConfig()} style={styles.primarySheetButton}>
                        <Text style={styles.primarySheetButtonText}>保存配置</Text>
                      </Pressable>
                      <Pressable onPress={() => void board.runSync()} style={styles.secondarySheetButton}>
                        <Text style={styles.secondarySheetButtonText}>手动同步</Text>
                      </Pressable>
                    </View>
                  </View>

                  <View style={styles.sheetCard}>
                    <Text style={styles.sheetCardTitle}>归档显示</Text>
                    <Text style={styles.sheetCardBody}>显示隐藏和归档范围保持独立，但在这里统一管理可见范围。</Text>
                    <View style={styles.switchRow}>
                      <View style={styles.switchCopy}>
                        <Text style={styles.switchLabel}>显示归档任务</Text>
                        <Text style={styles.switchHint}>关闭后主列表里不再显示归档项</Text>
                      </View>
                      <Switch
                        value={board.snapshot.settings.showArchived}
                        onValueChange={(value) => board.updateSettings({ showArchived: value })}
                        trackColor={{ false: '#223045', true: '#415f33' }}
                        thumbColor={board.snapshot.settings.showArchived ? COLORS.lime : '#9aa5b1'}
                      />
                    </View>
                    <View style={styles.segmentRow}>
                      <Pressable
                        onPress={() => board.updateSettings({ archivedDisplayMode: 'all' })}
                        style={[styles.segmentButton, board.snapshot.settings.archivedDisplayMode === 'all' ? styles.segmentButtonActive : null]}
                      >
                        <Text style={styles.segmentButtonText}>全部归档</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => board.updateSettings({ archivedDisplayMode: 'range' })}
                        style={[styles.segmentButton, board.snapshot.settings.archivedDisplayMode === 'range' ? styles.segmentButtonActive : null]}
                      >
                        <Text style={styles.segmentButtonText}>按归档日期</Text>
                      </Pressable>
                    </View>
                    <View style={styles.rangeRow}>
                      <TextInput
                        value={board.snapshot.settings.archivedRangeStart}
                        onChangeText={(value) => board.updateSettings({ archivedRangeStart: value })}
                        placeholder="开始日期"
                        placeholderTextColor={COLORS.textMuted}
                        style={[styles.textField, styles.rangeField]}
                      />
                      <TextInput
                        value={board.snapshot.settings.archivedRangeEnd}
                        onChangeText={(value) => board.updateSettings({ archivedRangeEnd: value })}
                        placeholder="结束日期"
                        placeholderTextColor={COLORS.textMuted}
                        style={[styles.textField, styles.rangeField]}
                      />
                    </View>
                    <Text style={styles.rangeSummary}>当前范围：{archivedRangeLabel}</Text>
                  </View>
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal visible={Boolean(editorTask)} animationType="slide" transparent onRequestClose={closeEditor}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={closeEditor} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.editorSheet}>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetKicker}>Editor</Text>
                    <Text style={styles.sheetTitle}>编辑任务内容</Text>
                  </View>
                  <Pressable style={styles.sheetCloseButton} onPress={closeEditor}>
                    <Text style={styles.sheetCloseText}>关闭</Text>
                  </Pressable>
                </View>

                {editorTask ? (
                  <>
                    <View style={styles.editorMeta}>
                      <View style={[styles.statusBadge, { backgroundColor: rgba(taskStatusTone(editorTask), 0.18), borderColor: rgba(taskStatusTone(editorTask), 0.42) }]}>
                        <Text style={[styles.statusBadgeText, { color: taskStatusTone(editorTask) }]}>{taskStatusLabel(editorTask)}</Text>
                      </View>
                      <Text style={styles.editorMetaText}>
                        附件 {editorTask.attachments.length} · 更新于 {formatRelativeStamp(editorTask.updatedAt)}
                      </Text>
                    </View>
                    <TextInput
                      value={editorDraft}
                      onChangeText={setEditorDraft}
                      placeholder="输入任务内容"
                      placeholderTextColor={COLORS.textMuted}
                      multiline
                      textAlignVertical="top"
                      style={styles.editorInput}
                    />
                    <View style={styles.sheetButtonRow}>
                      <Pressable onPress={saveEditor} style={styles.primarySheetButton}>
                        <Text style={styles.primarySheetButtonText}>保存任务</Text>
                      </Pressable>
                      <Pressable onPress={closeEditor} style={styles.secondarySheetButton}>
                        <Text style={styles.secondarySheetButtonText}>取消</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Modal visible={Boolean(board.selectedTask)} animationType="slide" transparent onRequestClose={closeTaskSheet}>
          <View style={styles.modalRoot}>
            <Pressable style={styles.modalBackdrop} onPress={closeTaskSheet} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <View style={styles.sheet}>
                <View style={styles.sheetHeader}>
                  <View>
                    <Text style={styles.sheetKicker}>Task Actions</Text>
                    <Text style={styles.sheetTitle}>任务操作</Text>
                  </View>
                  <Pressable style={styles.sheetCloseButton} onPress={closeTaskSheet}>
                    <Text style={styles.sheetCloseText}>关闭</Text>
                  </Pressable>
                </View>

                {board.selectedTask ? (
                  <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.sheetScrollContent}>
                    <View style={styles.sheetCard}>
                      <Text style={styles.sheetCardTitle}>{board.selectedTask.contentRaw.trim() || '空任务'}</Text>
                      <Text style={styles.sheetCardBody}>
                        {taskStatusLabel(board.selectedTask)} · 更新于 {formatRelativeStamp(board.selectedTask.updatedAt)}
                      </Text>
                    </View>

                    <View style={styles.sheetCard}>
                      <Text style={styles.sheetCardTitle}>快速操作</Text>
                      <View style={styles.actionGrid}>
                        <Pressable
                          onPress={() => {
                            const selected = board.selectedTask
                            closeTaskSheet()
                            if (selected) openEditor(selected)
                          }}
                          style={styles.actionGridButton}
                        >
                          <Text style={styles.actionGridButtonText}>编辑正文</Text>
                        </Pressable>
                        <Pressable onPress={() => { board.insertTaskAfter(board.selectedTask!.id); closeTaskSheet() }} style={styles.actionGridButton}>
                          <Text style={styles.actionGridButtonText}>插入下一条</Text>
                        </Pressable>
                        <Pressable onPress={() => { board.moveTask(board.selectedTask!.id, -1); closeTaskSheet() }} style={styles.actionGridButton}>
                          <Text style={styles.actionGridButtonText}>上移一位</Text>
                        </Pressable>
                        <Pressable onPress={() => { board.moveTask(board.selectedTask!.id, 1); closeTaskSheet() }} style={styles.actionGridButton}>
                          <Text style={styles.actionGridButtonText}>下移一位</Text>
                        </Pressable>
                        <Pressable onPress={() => { board.toggleTaskDurationVisibility(board.selectedTask!.id); closeTaskSheet() }} style={styles.actionGridButton}>
                          <Text style={styles.actionGridButtonText}>{board.selectedTask!.showDuration ? '隐藏当前时长' : '显示当前时长'}</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.sheetCard}>
                      <Text style={styles.sheetCardTitle}>颜色主题</Text>
                      <View style={styles.swatchRow}>
                        {PRESET_COLORS.map((color) => (
                          <Pressable
                            key={color}
                            onPress={() => {
                              board.setTaskPresetColor(board.selectedTask!.id, color)
                              setCustomColorDraft(color)
                              closeTaskSheet()
                            }}
                            style={[styles.swatch, { backgroundColor: color }]}
                          />
                        ))}
                      </View>
                      <TextInput
                        value={customColorDraft}
                        onChangeText={setCustomColorDraft}
                        placeholder="#7cc6fe"
                        placeholderTextColor={COLORS.textMuted}
                        autoCapitalize="none"
                        style={styles.textField}
                      />
                      <View style={styles.sheetButtonRow}>
                        <Pressable
                          onPress={() => {
                            const normalized = customColorDraft.trim()
                            if (!/^#?[0-9a-fA-F]{6}$/.test(normalized)) return
                            board.setTaskCustomColor(board.selectedTask!.id, normalized.startsWith('#') ? normalized : `#${normalized}`)
                            closeTaskSheet()
                          }}
                          style={styles.primarySheetButton}
                        >
                          <Text style={styles.primarySheetButtonText}>应用自定义颜色</Text>
                        </Pressable>
                        <Pressable onPress={() => { board.clearTaskColor(board.selectedTask!.id); closeTaskSheet() }} style={styles.secondarySheetButton}>
                          <Text style={styles.secondarySheetButtonText}>恢复默认</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.sheetCard}>
                      <Text style={styles.sheetCardTitle}>归档与隐藏</Text>
                      <View style={styles.actionGrid}>
                        {board.selectedTask!.archived ? (
                          <Pressable onPress={() => { board.unarchiveTask(board.selectedTask!.id); closeTaskSheet() }} style={styles.actionGridButton}>
                            <Text style={styles.actionGridButtonText}>取消归档</Text>
                          </Pressable>
                        ) : (
                          <>
                            <Pressable onPress={() => { board.archiveTask(board.selectedTask!.id); closeTaskSheet() }} style={styles.actionGridButton}>
                              <Text style={styles.actionGridButtonText}>归档当前任务</Text>
                            </Pressable>
                            <Pressable onPress={() => { board.archiveAndHideTask(board.selectedTask!.id); closeTaskSheet() }} style={styles.actionGridButton}>
                              <Text style={styles.actionGridButtonText}>归档并隐藏</Text>
                            </Pressable>
                          </>
                        )}
                        <Pressable onPress={() => { board.hideArchivedTasks({ mode: 'all' }); closeTaskSheet() }} style={styles.actionGridButton}>
                          <Text style={styles.actionGridButtonText}>隐藏全部归档</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            board.hideArchivedTasks({
                              mode: 'range',
                              start: board.snapshot.settings.archivedRangeStart,
                              end: board.snapshot.settings.archivedRangeEnd,
                            })
                            closeTaskSheet()
                          }}
                          style={styles.actionGridButton}
                        >
                          <Text style={styles.actionGridButtonText}>按归档时间隐藏</Text>
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.sheetCard}>
                      <Pressable
                        onPress={() => {
                          const selectedId = board.selectedTask?.id
                          if (!selectedId) return
                          Alert.alert('删除任务', '确定删除这条任务吗？', [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '删除',
                              style: 'destructive',
                              onPress: () => {
                                board.deleteTask(selectedId)
                                closeTaskSheet()
                              },
                            },
                          ])
                        }}
                        style={styles.dangerButton}
                      >
                        <Text style={styles.dangerButtonText}>删除当前任务</Text>
                      </Pressable>
                    </View>
                  </ScrollView>
                ) : null}
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>
      </LinearGradient>
    </SafeAreaView>
  )
}
