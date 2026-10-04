import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { Alert } from 'react-native';
import { NestableDraggableFlatList } from 'react-native-draggable-flatlist';
import DailyOverviewCard from '@/components/DailyOverviewCard';
import GlassCard from '@/components/GlassCard';
import PressableScale from '@/components/PressableScale';
import ScreenShell from '@/components/ScreenShell';
import TaskRow from '@/components/TaskRow';
import ThemeQuickToggle from '@/components/ThemeQuickToggle';
import { computeStats } from '@/domain/streak';
import { getTaskGroups } from '@/domain/taskOrdering';
import { DRAG_SNAP_SPRING } from '@/domain/dropInteraction';
import { useTodayKey } from '@/hooks/useTodayKey';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/theme';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import type { Task } from '@/domain/types';

export default function HomeScreen() {
  const today = useTodayKey();
  const [dragListKey, setDragListKey] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');
  const [sortDesc, setSortDesc] = useState(true);
  const [groupEditorVisible, setGroupEditorVisible] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const {
    activeTasks,
    checkIns,
    loading,
    syncState,
    toggleCheckIn,
    toggleTimer,
    deleteTask,
    updateTask,
    reorderTasks,
    updateSettings,
  } = useHabitStore();
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const { width: winWidth } = useWindowDimensions();
  const [groupFilter, setGroupFilter] = useState<string[] | null>(() => {
    const persisted = settings.selectedGroups ?? (settings.selectedGroup ? [settings.selectedGroup] : null);
    return persisted?.length ? persisted : null;
  });
  const selectGroup = useCallback((g: string | null) => {
    setGroupFilter((prev) => {
      if (g === null) {
        updateSettings({ selectedGroup: null });
        return null;
      }
      const base = prev ?? [];
      const next = base.includes(g) ? base.filter((x) => x !== g) : [...base, g];
      updateSettings({
        selectedGroups: next.length ? next : [],
        selectedGroup: next.length === 1 ? next[0] : null,
      });
      return next.length ? next : null;
    });
  }, [updateSettings]);
  const customGroups = useMemo(() => settings.customGroups ?? [], [settings.customGroups]);
  const todayCheckIns = useMemo(
    () => checkIns.filter((checkIn) => checkIn.date === today),
    [checkIns, today],
  );
  const completedIds = useMemo(
    () => new Set(todayCheckIns.map((checkIn) => checkIn.taskId)),
    [todayCheckIns],
  );
  const todayCheckInsByTask = useMemo(
    () => new Map(todayCheckIns.map((checkIn) => [checkIn.taskId, checkIn])),
    [todayCheckIns],
  );
  const taskGroups = useMemo(
    () => getTaskGroups(activeTasks, completedIds),
    [activeTasks, completedIds],
  );

  const allTasksFlat = useMemo(
    () => [...taskGroups.unfinished, ...taskGroups.finished],
    [taskGroups],
  );
  const availableGroups = useMemo(() => {
    const groups = new Set(customGroups);
    for (const task of allTasksFlat) {
      for (const group of task.customGroups ?? []) groups.add(group);
    }
    return Array.from(groups);
  }, [allTasksFlat, customGroups]);

  const filteredTasks = useMemo(() => {
    let pool: Task[];

    if (groupFilter === null) {
      pool = allTasksFlat;
    } else {
      pool = allTasksFlat.filter((t) => groupFilter.some((g) => t.customGroups?.includes(g)));
    }

    if (statusFilter === 'active') {
      return pool.filter((t) => !completedIds.has(t.id));
    }
    if (statusFilter === 'done') {
      return pool.filter((t) => completedIds.has(t.id));
    }
    return pool;
  }, [allTasksFlat, groupFilter, statusFilter, completedIds]);

  const filteredUnfinished = useMemo(
    () => filteredTasks.filter((t) => !completedIds.has(t.id)),
    [filteredTasks, completedIds],
  );
  const filteredFinished = useMemo(
    () => filteredTasks.filter((t) => completedIds.has(t.id)),
    [filteredTasks, completedIds],
  );
  const checkInTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checkIns) {
      if (!map.has(c.taskId) || c.createdAt! > map.get(c.taskId)!) map.set(c.taskId, c.createdAt!);
    }
    return map;
  }, [checkIns]);
  // Manual order is authoritative: dragging updates sortOrder and must stick.
  const sortedUnfinished = useMemo(
    () => [...filteredUnfinished].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
    [filteredUnfinished],
  );
  const sortedFinished = useMemo(
    () => [...filteredFinished].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
        || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    ),
    [filteredFinished],
  );

  // Recency ordering used only when the user taps the sort button; it is then
  // persisted into sortOrder so it survives reload and syncs to other devices.
  const recencyIds = useCallback((list: Task[], desc: boolean) =>
    [...list].sort((a, b) => {
      const ta = checkInTimeMap.get(a.id) ?? '';
      const tb = checkInTimeMap.get(b.id) ?? '';
      if (ta !== tb) return desc ? tb.localeCompare(ta) : ta.localeCompare(tb);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }).map((t) => t.id), [checkInTimeMap]);
  const onSortPress = useCallback(() => {
    const next = !sortDesc;
    setSortDesc(next);
    reorderTasks(recencyIds(taskGroups.unfinished, next), 'unfinished');
    reorderTasks(recencyIds(taskGroups.finished, next), 'finished');
  }, [sortDesc, recencyIds, taskGroups, reorderTasks]);

  const addGroup = useCallback(() => {
    setNewGroupName('');
    setGroupEditorVisible(true);
  }, []);

  const submitNewGroup = useCallback(() => {
    const name = newGroupName.trim();
    if (!name) {
      setGroupEditorVisible(false);
      return;
    }
    if (!customGroups.includes(name)) {
      updateSettings({ customGroups: [...customGroups, name] });
    }
    setGroupEditorVisible(false);
    setNewGroupName('');
    selectGroup(name);
  }, [customGroups, newGroupName, selectGroup, updateSettings]);

  const moveToGroup = useCallback((taskId: string, groups: string[]) => {
    updateTask(taskId, { customGroups: groups });
  }, [updateTask]);

  const checkInDatesByTask = useMemo(() => {
    const dates = new Map<string, string[]>();

    for (const checkIn of checkIns) {
      const list = dates.get(checkIn.taskId) ?? [];
      list.push(checkIn.date);
      dates.set(checkIn.taskId, list);
    }

    return dates;
  }, [checkIns]);
  const statsByTaskId = useMemo(() => new Map(
    activeTasks.map((task) => [
      task.id,
      computeStats(checkInDatesByTask.get(task.id) ?? [], today),
    ]),
  ), [activeTasks, checkInDatesByTask, today]);

  const renderTask = useCallback(({ item, drag, dragGesture, getIndex, isActive, isDragging }: RenderItemParams<Task>) => (
    <TaskRow
      task={item}
      today={today}
      index={getIndex() ?? 0}
      drag={drag}
      dragGesture={dragGesture}
      isActive={isActive}
      dragInProgress={isDragging}
      checkedInToday={completedIds.has(item.id)}
      checkedInAt={todayCheckInsByTask.get(item.id)?.createdAt}
      stats={statsByTaskId.get(item.id)}
      onToggle={toggleCheckIn}
      onToggleTimer={toggleTimer}
      onDelete={deleteTask}
      customGroups={customGroups}
      onMoveToGroup={moveToGroup}
      isLight={theme.isLight}
    />
  ), [today, completedIds, theme.isLight, todayCheckInsByTask, statsByTaskId, toggleCheckIn, toggleTimer, deleteTask, customGroups, moveToGroup]);

  // Web build: react-native-draggable-flatlist is not web-compatible (it calls
  // findNodeHandle on layout, which throws on react-native-web). Render the same
  // rows through a plain FlatList; drag stays a native-only capability.
  const renderTaskWeb = useCallback(({ item, index }: { item: Task; index: number }) => renderTask({
    item,
    index,
    drag: undefined,
    dragGesture: undefined,
    getIndex: () => index,
    isActive: false,
    isDragging: false,
  } as unknown as RenderItemParams<Task>), [renderTask]);
  const moveId = useCallback((ids: string[], from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) {
      return ids;
    }

    const next = [...ids];
    const [moved] = next.splice(from, 1);

    if (moved) {
      next.splice(to, 0, moved);
    }

    return next;
  }, []);

  // Remount DraggableFlatList after each reorder to clear stale pan
  // transforms that can block parent scroll and button taps.
  const handleReorder = useCallback((
    ids: string[],
    from: number,
    to: number,
    group: 'unfinished' | 'finished',
  ) => {
    reorderTasks(moveId(ids, from, to), group);
    setDragListKey((prev) => prev + 1);
  }, [reorderTasks, moveId]);

  return (
    <ScreenShell style={styles.homeContent}>
      <Stack.Screen options={{ headerShown: false }} />
      <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.subtleText }]}>
            {new Date(`${today}T00:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>HabitPulse</Text>
          <View style={styles.syncRow}>
            <View
              style={[
                styles.syncDot,
                { backgroundColor: syncState.status === 'error' ? '#f87171' : theme.accent },
              ]}
            />
            <Text style={[styles.syncCaption, { color: theme.subtleText }]}>
              {syncState.status === 'syncing'
                ? '同步中'
                : syncState.status === 'ok'
                  ? '已同步'
                  : syncState.status === 'error'
                    ? '同步失败'
                    : settings.syncEnabled
                      ? '等待同步'
                      : '本地模式'}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <ThemeQuickToggle
            value={settings.appearance}
            onChange={(appearance) => updateSettings({ appearance })}
          />
          <Link href="/settings" asChild>
          <PressableScale style={StyleSheet.flatten([styles.settingsButton, {
            borderColor: theme.surfaceBorder,
            backgroundColor: theme.surface,
          }])}>
            <MaterialCommunityIcons
              name="cog-outline"
              size={17}
              color={theme.mutedText}
            />
          </PressableScale>
          </Link>
        </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.springify().damping(17)}>
        <DailyOverviewCard
          today={today}
          completedCount={Math.min(completedIds.size, activeTasks.length)}
          totalCount={activeTasks.length}
        />
      </Animated.View>

      <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>任务库</Text>
        <Link href="/tasks/create" asChild>
          <PressableScale style={StyleSheet.flatten([styles.addButton, { backgroundColor: theme.accent }])}>
            <MaterialCommunityIcons name="plus" size={21} color={theme.onAccent} />
          </PressableScale>
        </Link>
      </View>

      {loading ? (
        <GlassCard>
          <Text style={[styles.emptyText, { color: theme.subtleText }]}>正在载入...</Text>
        </GlassCard>
      ) : activeTasks.length === 0 ? (
        <GlassCard style={styles.emptyCard}>
          <MaterialCommunityIcons name="rocket-launch-outline" size={34} color={theme.accentText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>开始你的第一条记录</Text>
          <Text style={[styles.emptyText, { color: theme.subtleText }]}>运动、阅读、写作或任何想坚持的事情。</Text>
          <Link href="/tasks/create" asChild>
            <PressableScale style={StyleSheet.flatten([styles.primaryButton, { backgroundColor: theme.accent }])}>
              <Text style={[styles.primaryButtonText, { color: theme.onAccent }]}>创建任务</Text>
            </PressableScale>
          </Link>
        </GlassCard>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.groupDrawer}
            contentContainerStyle={[styles.groupDrawerContent, { minWidth: winWidth }]}
          >
            <PressableScale
              style={[styles.groupTab, !groupFilter && styles.groupTabActive, { borderColor: theme.surfaceBorder }]}
              onPress={() => selectGroup(null)}
            >
              <Text style={[styles.groupTabText, !groupFilter && { color: theme.accentText }]}>全部</Text>
            </PressableScale>
            {availableGroups.map((group) => (
              <PressableScale
                key={group}
                style={[styles.groupTab, groupFilter?.includes(group) && styles.groupTabActive, { borderColor: theme.surfaceBorder }]}
                onPress={() => selectGroup(group)}
                onLongPress={() => {
                  Alert.alert('删除分组', `确定删除"${group}"？任务不会删除。`, [
                    { text: '取消', style: 'cancel' },
                    { text: '删除', style: 'destructive', onPress: () => {
                      updateSettings({ customGroups: customGroups.filter((g) => g !== group) });
                      if (groupFilter?.includes(group)) selectGroup(null);
                    }},
                  ]);
                }}
              >
                <Text style={[styles.groupTabText, groupFilter?.includes(group) && { color: theme.accentText }]}>{group}</Text>
              </PressableScale>
            ))}
            <PressableScale
              style={[styles.groupTab, styles.groupTabAdd, { borderColor: theme.surfaceBorder }]}
              onPress={addGroup}
            >
              <MaterialCommunityIcons name="plus" size={20} color={theme.mutedText} />
            </PressableScale>
          </ScrollView>

          <View style={styles.controlRow}>
            <PressableScale
              style={[
                styles.controlButton,
                statusFilter !== 'all' && styles.filterChipActive,
                { borderColor: theme.surfaceBorder },
              ]}
              onPress={() => setStatusFilter((prev) => (prev === 'all' ? 'active' : prev === 'active' ? 'done' : 'all'))}
            >
                <MaterialCommunityIcons
                  name={statusFilter === 'all' ? 'filter-variant' : statusFilter === 'active' ? 'progress-clock' : 'check-circle-outline'}
                  size={18}
                  color={statusFilter === 'all' ? theme.mutedText : theme.accent}
                />
              <Text
                style={[
                  styles.controlButtonText,
                  { color: statusFilter === 'all' ? theme.mutedText : theme.accentText },
                ]}
              >
                {statusFilter === 'all' ? '全部' : statusFilter === 'active' ? '进行中' : '已完成'}
              </Text>
            </PressableScale>
            <PressableScale
              style={[
                styles.controlButton,
                { borderColor: theme.surfaceBorder },
              ]}
              onPress={onSortPress}
            >
              <MaterialCommunityIcons name="arrow-up-down" size={18} color={theme.mutedText} />
              <Text style={[styles.controlButtonText, { color: theme.mutedText }]}>
                {sortDesc ? '最新在上' : '最早在上'}
              </Text>
            </PressableScale>
          </View>

          {statusFilter !== 'done' && sortedUnfinished.length > 0 && (
            <>
              <Text style={[styles.groupTitle, { color: theme.subtleText }]}>进行中 · 点住图标拖动</Text>
              {Platform.OS === 'web' ? (
                <FlatList
                  data={sortedUnfinished}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTaskWeb}
                  scrollEnabled={false}
                  windowSize={5}
                  contentContainerStyle={styles.taskList}
                />
              ) : (
                <NestableDraggableFlatList
                  key={`uf-${dragListKey}-${groupFilter?.join('\u0000') ?? 'all'}-${statusFilter}`}
                  data={sortedUnfinished}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTask}
                  dragGestureDetector="item"
                  onDragEnd={({ from, to }) => handleReorder(
                    sortedUnfinished.map((item) => item.id),
                    from,
                    to,
                    'unfinished',
                  )}
                  scrollEnabled={false}
                  activationDistance={8}
                  autoscrollEnabled={false}
                  dropAnimationConfig={DRAG_SNAP_SPRING}
                  dropAnimationMode="instant"
                  dragItemOverflow
                  windowSize={5}
                  contentContainerStyle={styles.taskList}
                />
              )}
            </>
          )}

          {statusFilter !== 'active' && sortedFinished.length > 0 && (
            <>
              <Text style={[styles.groupTitle, { color: theme.subtleText }]}>已完成 · 点住图标拖动</Text>
              {Platform.OS === 'web' ? (
                <FlatList
                  data={sortedFinished}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTaskWeb}
                  scrollEnabled={false}
                  windowSize={5}
                  contentContainerStyle={styles.taskList}
                />
              ) : (
                <View style={styles.taskList}>
                  {sortedFinished.map((item) => (
                    <TaskRow
                      key={item.id}
                      task={item}
                      today={today}
                      checkedInToday={completedIds.has(item.id)}
                      checkedInAt={todayCheckInsByTask.get(item.id)?.createdAt}
                      stats={statsByTaskId.get(item.id)}
                      onToggle={toggleCheckIn}
                      onToggleTimer={toggleTimer}
                      onDelete={deleteTask}
                      customGroups={customGroups}
                      onMoveToGroup={moveToGroup}
                      isLight={theme.isLight}
                    />
                  ))}
                </View>
              )}
            </>
          )}

          {filteredTasks.length === 0 && (
            <Text style={[styles.groupEmpty, { color: theme.subtleText }]}>没有符合条件的任务</Text>
          )}
        </>
      )}

      <Modal
        visible={groupEditorVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setGroupEditorVisible(false)}
      >
        <Pressable style={styles.groupModalBackdrop} onPress={() => setGroupEditorVisible(false)}>
          <Pressable style={[styles.groupModalCard, { backgroundColor: theme.surface, borderColor: theme.surfaceBorder }]}>
            <Text style={[styles.groupModalTitle, { color: theme.text }]}>新建分组</Text>
            <TextInput
              autoFocus
              value={newGroupName}
              onChangeText={setNewGroupName}
              onSubmitEditing={submitNewGroup}
              placeholder="输入分组名称"
              placeholderTextColor={theme.mutedText}
              style={[styles.groupModalInput, {
                borderColor: theme.inputBorder,
                backgroundColor: theme.inputBackground,
                color: theme.text,
              }]}
            />
            <View style={styles.groupModalActions}>
              <Pressable
                style={[styles.groupModalButton, { borderColor: theme.surfaceBorder }]}
                onPress={() => setGroupEditorVisible(false)}
              >
                <Text style={[styles.groupModalButtonText, { color: theme.mutedText }]}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.groupModalButton, styles.groupModalButtonPrimary, { backgroundColor: theme.accent }]}
                onPress={submitNewGroup}
              >
                <Text style={[styles.groupModalButtonText, { color: theme.onAccent }]}>保存</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  settingsButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 5,
  },
  syncDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  syncCaption: {
    fontSize: 11,
    fontWeight: '700',
  },
  eyebrow: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 13,
    marginBottom: 4,
  },
  title: {
    color: '#f8fafc',
    fontSize: 34,
    fontWeight: '900',
    letterSpacing: -1,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  sectionTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  groupDrawer: {
    flexGrow: 0,
    marginHorizontal: -20,
    marginTop: 4,
  },
  groupDrawerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 4,
  },
  groupTab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 42,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 18,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexShrink: 0,
  },
  groupTabActive: {
    backgroundColor: 'rgba(34,211,238,0.14)',
    borderColor: 'rgba(34,211,238,0.45)',
  },
  groupTabAdd: {
    minWidth: 42,
    paddingHorizontal: 10,
  },
  groupTabText: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(148,163,184,0.78)',
  },
  controlRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  controlButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 48,
    borderRadius: 18,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  controlButtonText: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(148,163,184,0.82)',
  },
  groupModalBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(2,6,23,0.68)',
    paddingHorizontal: 24,
  },
  groupModalCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 22,
    borderWidth: 1,
    padding: 20,
  },
  groupModalTitle: {
    fontSize: 20,
    fontWeight: '900',
    marginBottom: 14,
  },
  groupModalInput: {
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
  },
  groupModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 16,
  },
  groupModalButton: {
    minWidth: 86,
    minHeight: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  groupModalButtonPrimary: {
    borderColor: 'transparent',
  },
  groupModalButtonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  filterChipActive: {
    backgroundColor: 'rgba(34,211,238,0.12)',
    borderColor: 'rgba(34,211,238,0.4)',
  },
  filterChipAdd: {
    paddingHorizontal: 8,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.7)',
  },
  filterChipSm: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  filterChipTextSm: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(148,163,184,0.6)',
  },
  // Landscape: two big square-ish buttons split evenly, half width each.
  filterRowLandscape: {
    flexWrap: 'nowrap',
    gap: 12,
  },
  filterBtnLandscape: {
    flex: 1,
    minHeight: 56,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
  },
  filterBtnLandscapeText: {
    fontSize: 15,
    fontWeight: '800',
    color: 'rgba(148,163,184,0.85)',
  },
  groupTitle: {
    color: 'rgba(148,163,184,0.85)',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
    marginTop: 2,
  },
  groupEmpty: {
    color: 'rgba(148,163,184,0.55)',
    fontSize: 12,
    paddingVertical: 8,
    textAlign: 'center',
  },
  taskList: {
    gap: 9,
    paddingBottom: 4,
  },
  homeContent: {
    paddingBottom: 132,
  },
  sectionAction: {
    color: '#67e8f9',
    fontWeight: '700',
  },
  addButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22d3ee',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  emptyCard: {
    alignItems: 'center',
    gap: 10,
    paddingVertical: 32,
  },
  emptyTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
  emptyText: {
    color: 'rgba(226,232,240,0.65)',
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    borderRadius: 18,
    backgroundColor: '#22d3ee',
    paddingHorizontal: 22,
    paddingVertical: 13,
    marginTop: 8,
    shadowColor: '#22d3ee',
    shadowOpacity: 0.35,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  primaryButtonText: {
    color: '#04121a',
    fontSize: 15,
    fontWeight: '800',
  },
});
