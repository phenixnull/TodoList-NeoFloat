import { useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
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
  if (task.archived) return '#f59e0b'
  if (task.status === 'finished') return '#34d399'
  if (task.status === 'doing') return '#5ea4ff'
  if (task.status === 'paused') return '#fb923c'
  return '#a78bfa'
}

export function NativeTodoApp() {
  const board = useNativeTodoBoard()
  const [customColorDraft, setCustomColorDraft] = useState('')

  useEffect(() => {
    setCustomColorDraft(board.selectedTask?.colorValue ?? '')
  }, [board.selectedTask?.colorValue, board.selectedTask?.id])

  const canResolveAssets = Boolean(board.config.enabled && board.config.serverUrl && board.config.token)
  const archivedRangeLabel = useMemo(() => {
    const { archivedDisplayMode, archivedRangeStart, archivedRangeEnd } = board.snapshot.settings
    if (archivedDisplayMode === 'all') return '全部归档日期'
    return `${archivedRangeStart || '开始日期'} - ${archivedRangeEnd || '结束日期'}`
  }, [board.snapshot.settings])

  const selectedTask = board.selectedTask
  const closeTaskMenu = () => board.setTaskMenuId(null)

  if (!board.hydrated) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
        <LinearGradient colors={['#07101c', '#0b1220', '#10182a']} style={styles.flex}>
          <View style={styles.center}>
            <ActivityIndicator size="large" color="#5ea4ff" />
            <Text style={styles.title}>正在加载移动任务面板</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <LinearGradient colors={['#07101c', '#0b1220', '#10182a']} style={styles.flex}>
        <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 124, gap: 16 }} showsVerticalScrollIndicator={false}>
          <View style={{ gap: 6 }}>
            <Text style={{ color: '#7fb4ff', fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>NEO FLOAT TODO MOBILE</Text>
            <Text style={styles.title}>任务连续性面板</Text>
            <Text style={styles.subtitle}>桌面端任务模型与同步协议直接复用到移动端，界面改为 Happy 风格单栏卡片。</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Pressable onPress={() => board.runSync()} disabled={board.busy} style={{ flex: 1, borderRadius: 18, paddingVertical: 12, backgroundColor: board.busy ? 'rgba(94, 164, 255, 0.16)' : '#5ea4ff', alignItems: 'center' }}>
              <Text style={{ color: board.busy ? '#dce8fb' : '#08111e', fontWeight: '800' }}>{board.busy ? '同步中' : '立即同步'}</Text>
            </Pressable>
            <Pressable onPress={() => board.setSettingsOpen(true)} style={{ flex: 1, borderRadius: 18, paddingVertical: 12, backgroundColor: 'rgba(255, 255, 255, 0.08)', alignItems: 'center' }}>
              <Text style={{ color: '#f8fbff', fontWeight: '700' }}>设置</Text>
            </Pressable>
          </View>

          <View style={{ borderRadius: 24, padding: 16, backgroundColor: 'rgba(12, 19, 33, 0.88)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.24)', gap: 10 }}>
            <Text style={{ color: '#f8fbff', fontWeight: '700', fontSize: 16 }}>{board.syncState.message}</Text>
            <Text style={styles.subtitle}>{board.syncSummaryText}</Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            {[
              ['进行中', board.taskCounts.active, '#5ea4ff'],
              ['已完成', board.taskCounts.finished, '#34d399'],
              ['已归档', board.taskCounts.archived, '#f59e0b'],
            ].map(([label, value, color]) => (
              <View key={String(label)} style={{ flex: 1, borderRadius: 20, padding: 14, backgroundColor: hexToRgba(String(color), 0.12), borderWidth: 1, borderColor: hexToRgba(String(color), 0.28), gap: 4 }}>
                <Text style={{ color: '#9fb0cb', fontSize: 12 }}>{label}</Text>
                <Text style={{ color: '#f8fbff', fontSize: 24, fontWeight: '800' }}>{value}</Text>
              </View>
            ))}
          </View>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {board.filterOptions.map((option) => (
              <Pressable
                key={option.id}
                onPress={() => board.setFilter(option.id)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 999,
                  backgroundColor: board.filter === option.id ? 'rgba(94, 164, 255, 0.16)' : 'rgba(12, 19, 33, 0.84)',
                  borderWidth: 1,
                  borderColor: board.filter === option.id ? 'rgba(94, 164, 255, 0.36)' : 'rgba(110, 134, 176, 0.2)',
                }}
              >
                <Text style={{ color: '#f8fbff', fontWeight: '700' }}>{option.label}</Text>
                <Text style={{ color: '#cfe0fb', fontSize: 12 }}>{option.count}</Text>
              </Pressable>
            ))}
          </ScrollView>

          {board.visibleTasks.length === 0 ? (
            <View style={{ borderRadius: 24, padding: 22, backgroundColor: 'rgba(12, 19, 33, 0.86)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.2)', gap: 8 }}>
              <Text style={{ color: '#f8fbff', fontSize: 18, fontWeight: '700' }}>当前筛选下没有任务</Text>
              <Text style={styles.subtitle}>你可以先新建任务，或在设置里调整归档显示和同步配置。</Text>
            </View>
          ) : (
            <View style={{ gap: 14 }}>
              {board.visibleTasks.map((task) => {
                const accent = taskAccent(task)
                const durationText = board.formatDuration(board.calcTaskDuration(task, board.nowMs))
                const runtimeText = taskRuntimeFlag(task)
                return (
                  <LinearGradient key={task.id} colors={[hexToRgba(accent, 0.18), 'rgba(14, 20, 34, 0.96)']} style={{ borderRadius: 26, padding: 16, borderWidth: 1, borderColor: hexToRgba(accent, 0.4), gap: 12 }}>
                    <Pressable onLongPress={() => board.setTaskMenuId(task.id)} delayLongPress={220} style={{ gap: 12 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                        <View style={{ flex: 1, gap: 10 }}>
                          <View style={{ alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: hexToRgba(accent, 0.4), backgroundColor: hexToRgba(accent, 0.18) }}>
                            <Text style={{ color: accent, fontSize: 12, fontWeight: '700' }}>{taskStatusText(task)}</Text>
                          </View>
                          <Text style={{ color: '#f8fbff', fontSize: 18, fontWeight: '700' }}>{summarizeTask(task)}</Text>
                        </View>
                        <Pressable onPress={() => board.setTaskMenuId(task.id)} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255, 255, 255, 0.08)' }}>
                          <Text style={{ color: '#f8fbff', fontWeight: '700', fontSize: 12 }}>操作</Text>
                        </Pressable>
                      </View>

                      <Text style={{ color: '#7f90ac', fontSize: 12 }}>更新于 {board.localDateTimeText(task.updatedAt)}</Text>

                      <TextInput
                        value={task.contentRaw}
                        onChangeText={(value) => board.updateTaskContent(task.id, value)}
                        multiline
                        placeholder="写下任务内容、公式或备注"
                        placeholderTextColor="#6b7894"
                        style={{ minHeight: 112, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 14, backgroundColor: 'rgba(6, 12, 22, 0.54)', color: '#f8fbff', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.16)', fontSize: 15, lineHeight: 22 }}
                        textAlignVertical="top"
                      />

                      {task.attachments.length > 0 ? (
                        canResolveAssets ? (
                          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                            {task.attachments.map((attachment) => (
                              <Image key={attachment.id} source={{ uri: board.buildAssetUrl(attachment.storagePath) }} style={{ width: 148, height: 108, borderRadius: 16, backgroundColor: 'rgba(255, 255, 255, 0.08)' }} />
                            ))}
                          </ScrollView>
                        ) : (
                          <Text style={styles.subtitle}>已存在 {task.attachments.length} 张图片，连接同步服务后可预览。</Text>
                        )
                      ) : null}

                      {task.showDuration ? (
                        <View style={{ flexDirection: task.durationLayoutMode === 'inline' ? 'row' : 'column', gap: 10 }}>
                          {[
                            ['累计时长', durationText],
                            ['片段数', String(task.segments.length)],
                            ...(runtimeText ? [['运行状态', runtimeText]] : []),
                          ].map(([label, value]) => (
                            <View key={String(label)} style={{ flex: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: 'rgba(6, 12, 22, 0.44)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.14)', gap: 4 }}>
                              <Text style={{ color: '#7f90ac', fontSize: 12 }}>{label}</Text>
                              <Text style={{ color: '#f8fbff', fontSize: 15, fontWeight: '700' }}>{value}</Text>
                            </View>
                          ))}
                        </View>
                      ) : null}

                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        <Pressable onPress={() => board.toggleTaskTimer(task.id)} style={{ flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(94, 164, 255, 0.16)' }}>
                          <Text style={{ color: '#f8fbff', fontWeight: '700' }}>{task.status === 'doing' ? '暂停' : '开始'}</Text>
                        </Pressable>
                        <Pressable onPress={() => board.toggleTaskFinished(task.id)} style={{ flex: 1, borderRadius: 16, paddingVertical: 12, alignItems: 'center', backgroundColor: 'rgba(52, 211, 153, 0.16)' }}>
                          <Text style={{ color: '#f8fbff', fontWeight: '700' }}>{task.status === 'finished' ? '恢复' : '完成'}</Text>
                        </Pressable>
                      </View>
                    </Pressable>
                  </LinearGradient>
                )
              })}
            </View>
          )}
        </ScrollView>

        <Pressable onPress={board.addTask} style={{ position: 'absolute', right: 18, bottom: 24, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#5ea4ff' }}>
          <Text style={{ color: '#08111e', fontSize: 24, fontWeight: '900', lineHeight: 24 }}>+</Text>
          <Text style={{ color: '#08111e', fontSize: 15, fontWeight: '800' }}>新建任务</Text>
        </Pressable>

        <Modal visible={board.settingsOpen} animationType="slide" transparent onRequestClose={() => board.setSettingsOpen(false)}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3, 9, 18, 0.7)' }}>
            <View style={{ maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, backgroundColor: '#0d1625', gap: 14 }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ color: '#f8fbff', fontSize: 22, fontWeight: '800', marginBottom: 14 }}>移动端设置</Text>
                <View style={{ borderRadius: 22, padding: 16, backgroundColor: 'rgba(13, 22, 37, 0.92)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.16)', gap: 12, marginBottom: 14 }}>
                  <Text style={{ color: '#f8fbff', fontSize: 17, fontWeight: '700' }}>同步服务</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: '#f8fbff', fontSize: 15, fontWeight: '600' }}>启用同步</Text>
                      <Text style={{ color: '#8ea0bc', fontSize: 13, lineHeight: 18 }}>移动端直接连接桌面端已有的同步后端。</Text>
                    </View>
                    <Switch
                      value={board.draftConfig.enabled}
                      onValueChange={(value) => board.setDraftConfig({ ...board.draftConfig, enabled: value })}
                      trackColor={{ false: '#253047', true: '#1e3a5f' }}
                      thumbColor={board.draftConfig.enabled ? '#5ea4ff' : '#9ca3af'}
                    />
                  </View>
                  <TextInput
                    value={board.draftConfig.serverUrl}
                    onChangeText={(value) => board.setDraftConfig({ ...board.draftConfig, serverUrl: value })}
                    placeholder="https://example.com"
                    placeholderTextColor="#62718d"
                    autoCapitalize="none"
                    style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(5, 11, 20, 0.75)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.18)', color: '#f8fbff', fontSize: 14 }}
                  />
                  <TextInput
                    value={board.draftConfig.token}
                    onChangeText={(value) => board.setDraftConfig({ ...board.draftConfig, token: value })}
                    placeholder="输入同步 Token"
                    placeholderTextColor="#62718d"
                    autoCapitalize="none"
                    style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(5, 11, 20, 0.75)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.18)', color: '#f8fbff', fontSize: 14 }}
                  />
                  <Pressable onPress={() => void board.saveConfig()} style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', backgroundColor: '#5ea4ff' }}>
                    <Text style={{ color: '#08111e', fontSize: 15, fontWeight: '800' }}>保存同步配置</Text>
                  </Pressable>
                </View>

                <View style={{ borderRadius: 22, padding: 16, backgroundColor: 'rgba(13, 22, 37, 0.92)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.16)', gap: 12, marginBottom: 14 }}>
                  <Text style={{ color: '#f8fbff', fontSize: 17, fontWeight: '700' }}>显示与归档</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={{ color: '#f8fbff', fontSize: 15, fontWeight: '600' }}>显示归档任务</Text>
                      <Text style={{ color: '#8ea0bc', fontSize: 13, lineHeight: 18 }}>关闭后，归档任务仍保留在数据中，但不会出现在移动列表。</Text>
                    </View>
                    <Switch
                      value={board.snapshot.settings.showArchived}
                      onValueChange={(value) => board.updateSettings({ showArchived: value })}
                      trackColor={{ false: '#253047', true: '#233f35' }}
                      thumbColor={board.snapshot.settings.showArchived ? '#34d399' : '#9ca3af'}
                    />
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Pressable
                      onPress={() => board.updateSettings({ archivedDisplayMode: 'all' })}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16, backgroundColor: board.snapshot.settings.archivedDisplayMode === 'all' ? 'rgba(94, 164, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)' }}
                    >
                      <Text style={{ color: '#f8fbff', fontWeight: '700' }}>全部</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => board.updateSettings({ archivedDisplayMode: 'range' })}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 16, backgroundColor: board.snapshot.settings.archivedDisplayMode === 'range' ? 'rgba(94, 164, 255, 0.2)' : 'rgba(255, 255, 255, 0.06)' }}
                    >
                      <Text style={{ color: '#f8fbff', fontWeight: '700' }}>按日期</Text>
                    </Pressable>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TextInput
                      value={board.snapshot.settings.archivedRangeStart}
                      onChangeText={(value) => board.updateSettings({ archivedRangeStart: value })}
                      placeholder="开始日期 2026-04-01"
                      placeholderTextColor="#62718d"
                      style={{ flex: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(5, 11, 20, 0.75)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.18)', color: '#f8fbff', fontSize: 14 }}
                    />
                    <TextInput
                      value={board.snapshot.settings.archivedRangeEnd}
                      onChangeText={(value) => board.updateSettings({ archivedRangeEnd: value })}
                      placeholder="结束日期 2026-04-30"
                      placeholderTextColor="#62718d"
                      style={{ flex: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(5, 11, 20, 0.75)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.18)', color: '#f8fbff', fontSize: 14 }}
                    />
                  </View>
                  <Text style={{ color: '#7f90ac', fontSize: 12 }}>当前隐藏范围: {archivedRangeLabel}</Text>
                </View>

                <Pressable onPress={() => board.setSettingsOpen(false)} style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)' }}>
                  <Text style={{ color: '#f8fbff', fontSize: 15, fontWeight: '700' }}>完成</Text>
                </Pressable>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <Modal visible={Boolean(selectedTask)} animationType="slide" transparent onRequestClose={closeTaskMenu}>
          <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(3, 9, 18, 0.7)' }}>
            <View style={{ maxHeight: '86%', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 18, backgroundColor: '#0d1625', gap: 14 }}>
              <ScrollView showsVerticalScrollIndicator={false}>
                <Text style={{ color: '#f8fbff', fontSize: 22, fontWeight: '800', marginBottom: 14 }}>任务操作</Text>
                {selectedTask ? (
                  <>
                    <View style={{ borderRadius: 22, padding: 16, backgroundColor: 'rgba(13, 22, 37, 0.92)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.16)', gap: 8, marginBottom: 14 }}>
                      <Text style={{ color: '#f8fbff', fontSize: 17, fontWeight: '700' }}>{summarizeTask(selectedTask)}</Text>
                      <Text style={{ color: '#8ea0bc', fontSize: 13 }}>状态: {taskStatusText(selectedTask)}</Text>
                    </View>

                    <View style={{ borderRadius: 22, padding: 16, backgroundColor: 'rgba(13, 22, 37, 0.92)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.16)', gap: 10, marginBottom: 14 }}>
                      {[
                        { label: '在下方插入任务', action: () => board.insertTaskAfter(selectedTask.id) },
                        { label: '上移一位', action: () => board.moveTask(selectedTask.id, -1) },
                        { label: '下移一位', action: () => board.moveTask(selectedTask.id, 1) },
                        { label: selectedTask.showDuration ? '隐藏当前任务时长' : '显示当前任务时长', action: () => board.toggleTaskDurationVisibility(selectedTask.id) },
                        { label: '显示全部任务时长', action: () => board.setAllTaskDurationVisibility(true) },
                        { label: '隐藏全部任务时长', action: () => board.setAllTaskDurationVisibility(false) },
                        { label: '当前任务切到单行时长', action: () => board.setTaskDurationLayoutMode(selectedTask.id, 'inline') },
                        { label: '当前任务切到多行时长', action: () => board.setTaskDurationLayoutMode(selectedTask.id, 'stacked') },
                        { label: '全部任务单行时长', action: () => board.setTasksDurationLayoutMode(board.snapshot.tasks.map((task) => task.id), 'inline') },
                        { label: '全部任务多行时长', action: () => board.setTasksDurationLayoutMode(board.snapshot.tasks.map((task) => task.id), 'stacked') },
                      ].map((item) => (
                        <Pressable key={item.label} onPress={() => { item.action(); closeTaskMenu() }} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
                          <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>{item.label}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <View style={{ borderRadius: 22, padding: 16, backgroundColor: 'rgba(13, 22, 37, 0.92)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.16)', gap: 12, marginBottom: 14 }}>
                      <Text style={{ color: '#c8d7ee', fontSize: 13, fontWeight: '700' }}>颜色主题</Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                        {PRESET_COLORS.map((color) => (
                          <Pressable
                            key={color}
                            onPress={() => {
                              board.setTaskPresetColor(selectedTask.id, color)
                              setCustomColorDraft(color)
                              closeTaskMenu()
                            }}
                            style={{ width: 34, height: 34, borderRadius: 999, borderWidth: 2, borderColor: 'rgba(255, 255, 255, 0.2)', backgroundColor: color }}
                          />
                        ))}
                      </View>
                      <TextInput
                        value={customColorDraft}
                        onChangeText={setCustomColorDraft}
                        placeholder="#5ea4ff"
                        placeholderTextColor="#62718d"
                        autoCapitalize="none"
                        style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: 'rgba(5, 11, 20, 0.75)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.18)', color: '#f8fbff', fontSize: 14 }}
                      />
                      <Pressable
                        onPress={() => {
                          const nextColor = customColorDraft.trim()
                          if (!/^#?[0-9a-fA-F]{6}$/.test(nextColor)) return
                          board.setTaskCustomColor(selectedTask.id, nextColor.startsWith('#') ? nextColor : `#${nextColor}`)
                          closeTaskMenu()
                        }}
                        style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
                      >
                        <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>应用自定义颜色</Text>
                      </Pressable>
                      <Pressable onPress={() => { board.clearTaskColor(selectedTask.id); closeTaskMenu() }} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
                        <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>恢复默认颜色</Text>
                      </Pressable>
                    </View>

                    <View style={{ borderRadius: 22, padding: 16, backgroundColor: 'rgba(13, 22, 37, 0.92)', borderWidth: 1, borderColor: 'rgba(110, 134, 176, 0.16)', gap: 10, marginBottom: 14 }}>
                      {selectedTask.archived ? (
                        <Pressable onPress={() => { board.unarchiveTask(selectedTask.id); closeTaskMenu() }} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
                          <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>取消归档</Text>
                        </Pressable>
                      ) : (
                        <>
                          <Pressable onPress={() => { board.archiveTask(selectedTask.id); closeTaskMenu() }} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
                            <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>归档当前任务</Text>
                          </Pressable>
                          <Pressable onPress={() => { board.archiveAndHideTask(selectedTask.id); closeTaskMenu() }} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
                            <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>归档并立即隐藏</Text>
                          </Pressable>
                        </>
                      )}
                      <Pressable onPress={() => { board.hideArchivedTasks({ mode: 'all' }); closeTaskMenu() }} style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
                        <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>隐藏所有已归档任务</Text>
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
                        style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(255, 255, 255, 0.06)' }}
                      >
                        <Text style={{ color: '#f1f6ff', fontSize: 14, fontWeight: '600' }}>按日期范围隐藏归档</Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          Alert.alert('删除任务', '确定要删除这条任务吗？', [
                            { text: '取消', style: 'cancel' },
                            {
                              text: '删除',
                              style: 'destructive',
                              onPress: () => {
                                board.deleteTask(selectedTask.id)
                                closeTaskMenu()
                              },
                            },
                          ])
                        }}
                        style={{ borderRadius: 16, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: 'rgba(239, 68, 68, 0.12)' }}
                      >
                        <Text style={{ color: '#fda4af', fontSize: 14, fontWeight: '600' }}>删除当前任务</Text>
                      </Pressable>
                    </View>
                  </>
                ) : null}
                <Pressable onPress={closeTaskMenu} style={{ borderRadius: 18, paddingVertical: 14, alignItems: 'center', backgroundColor: 'rgba(255, 255, 255, 0.08)' }}>
                  <Text style={{ color: '#f8fbff', fontSize: 15, fontWeight: '700' }}>关闭</Text>
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
  safeArea: { flex: 1, backgroundColor: '#07101c' },
  flex: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { color: '#f8fbff', fontSize: 24, fontWeight: '800' },
  subtitle: { color: '#9fb0cb', fontSize: 14, textAlign: 'center' },
})
