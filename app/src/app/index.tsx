import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, startTransition, useState } from 'react';
import { FlatList, Platform, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { NestableDraggableFlatList } from 'react-native-draggable-flatlist';
import { dialog } from '@/components/dialog/dialogs';
import { openAppDrawer } from '@/components/AppDrawer';
import DailyOverviewCard from '@/components/DailyOverviewCard';
import GlassCard from '@/components/GlassCard';
import GroupSelect from '@/components/GroupSelect';
import PressableScale from '@/components/PressableScale';
import ScreenShell from '@/components/ScreenShell';
import TaskRow from '@/components/TaskRow';
import ThemeQuickToggle from '@/components/ThemeQuickToggle';
import { computeStats } from '@/domain/streak';
import { getTaskGroups, matchesGroupFilter, mergeVisibleReorder } from '@/domain/taskOrdering';
import { DRAG_SNAP_SPRING } from '@/domain/dropInteraction';
import { useTodayKey } from '@/hooks/useTodayKey';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/theme';
import type { RenderItemParams } from 'react-native-draggable-flatlist';
import type { Task } from '@/domain/types';

export default function HomeScreen() {
  const today = useTodayKey();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');
  const [sortDesc, setSortDesc] = useState(true);
  const {
    activeTasks,
    checkIns,
    loading,
    syncState,
    toggleCheckIn,
    setCheckInStatus,
    toggleTimer,
    deleteTask,
    updateTask,
    reorderTasks,
    updateSettings,
  } = useHabitStore();
  const { settings } = useHabitStore();
  // Home follows the light-orange diary style regardless of app theme.
  const theme = useTheme('light');
  const [groupFilter, setGroupFilter] = useState<string[] | null>(() => {
    const persisted = settings.selectedGroups ?? (settings.selectedGroup ? [settings.selectedGroup] : null);
    return persisted?.length ? persisted : null;
  });

  // The list swap on filter change is expensive (dozens of gradient cards).
  // Chip selection persists + highlights immediately; the heavy list swap is
  // rendered as a low-priority transition so taps never stall.
  const applyGroupFilter = useCallback((next: string[] | null) => {
    startTransition(() => setGroupFilter(next));
  }, []);
  const selectGroup = useCallback((g: string | null) => {
    const prev = groupFilter ?? [];
    const next = g === null
      ? []
      : prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
    updateSettings({
      selectedGroups: next,
      selectedGroup: next.length === 1 ? next[0] : null,
    });
    applyGroupFilter(next.length ? next : null);
  }, [applyGroupFilter, groupFilter, updateSettings]);
  const customGroups = useMemo(() => settings.customGroups ?? [], [settings.customGroups]);
  const todayCheckIns = useMemo(
    () => checkIns.filter((checkIn) => checkIn.date === today),
    [checkIns, today],
  );
  const successIds = useMemo(
    () => new Set(todayCheckIns.filter((checkIn) => checkIn.status !== 'failed').map((checkIn) => checkIn.taskId)),
    [todayCheckIns],
  );
  const resolvedIds = useMemo(
    () => new Set(todayCheckIns.map((checkIn) => checkIn.taskId)),
    [todayCheckIns],
  );
  const completedIds = resolvedIds;
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
    const pool = groupFilter === null
      ? allTasksFlat
      : allTasksFlat.filter((t) => matchesGroupFilter(t, groupFilter));

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
  // The overview answers "how is this drawer doing today"; status filtering is
  // for the list below and must not turn the denominator into a tautology.
  const groupFilteredTasks = useMemo(
    () => (groupFilter === null
      ? allTasksFlat
      : allTasksFlat.filter((task) => matchesGroupFilter(task, groupFilter))),
    [allTasksFlat, groupFilter],
  );
  const overviewStats = useMemo(() => {
    const completedCount = groupFilteredTasks.filter((task) => successIds.has(task.id)).length;
    const totalCount = groupFilteredTasks.length;

    return {
      completedCount: Math.min(completedCount, totalCount),
      totalCount,
      progress: totalCount === 0 ? 0 : Math.min(completedCount / totalCount, 1),
    };
  }, [groupFilteredTasks, successIds]);
  useEffect(() => {
    if (loading) return;

    const persisted = settings.selectedGroups
      ?? (settings.selectedGroup ? [settings.selectedGroup] : null);
    const valid = (persisted ?? []).filter((group) => availableGroups.includes(group));
    const timer = setTimeout(() => {
      setGroupFilter((prev) => {
        const p = prev ?? [];
        if (p.length === valid.length && p.every((g, i) => g === valid[i])) return prev;
        return valid.length ? valid : null;
      });
    }, 0);
    return () => clearTimeout(timer);
  }, [availableGroups, loading, settings.selectedGroup, settings.selectedGroups]);
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

  const changeGroupFilter = useCallback((next: string[]) => {
    applyGroupFilter(next.length ? next : null);
    updateSettings({
      selectedGroups: next,
      selectedGroup: next.length === 1 ? next[0] : null,
    });
  }, [applyGroupFilter, updateSettings]);

  const createGroup = useCallback((rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    if (customGroups.includes(name)) {
      changeGroupFilter([...new Set([...(groupFilter ?? []), name])]);
      return;
    }
    updateSettings({ customGroups: [...customGroups, name] });
    selectGroup(name);
  }, [changeGroupFilter, customGroups, groupFilter, selectGroup, updateSettings]);

  const deleteGroup = useCallback((group: string) => {
    dialog.confirm({
      title: '删除分组',
      message: `确定删除"${group}"？任务不会删除。`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => {
        // Deleting a drawer removes its bindings; otherwise every task that
        // still carries the group would resurrect it on the next render.
        for (const task of activeTasks) {
          if (!task.customGroups?.includes(group)) continue;
          updateTask(task.id, { customGroups: task.customGroups.filter((g) => g !== group) });
        }
        updateSettings({ customGroups: customGroups.filter((g) => g !== group) });
        if (groupFilter?.includes(group)) changeGroupFilter(groupFilter.filter((g) => g !== group));
      },
    });
  }, [activeTasks, changeGroupFilter, customGroups, groupFilter, updateTask, updateSettings]);

  const renameGroup = useCallback((oldName: string, rawNewName: string) => {
    const newName = rawNewName.trim();
    if (!oldName || !newName || oldName === newName || customGroups.includes(newName)) return;

    updateSettings({ customGroups: customGroups.map((group) => (group === oldName ? newName : group)) });
    for (const task of activeTasks) {
      if (!task.customGroups?.includes(oldName)) continue;
      updateTask(task.id, {
        customGroups: task.customGroups.map((group) => (group === oldName ? newName : group)),
      });
    }
    if (groupFilter?.includes(oldName)) {
      changeGroupFilter(groupFilter.map((group) => (group === oldName ? newName : group)));
    }
  }, [activeTasks, changeGroupFilter, customGroups, groupFilter, updateTask, updateSettings]);

  const moveToGroup = useCallback((taskId: string, groups: string[]) => {
    updateTask(taskId, { customGroups: groups });
  }, [updateTask]);

  const successCheckInDatesByTask = useMemo(() => {
    const dates = new Map<string, string[]>();
    for (const checkIn of checkIns) {
      if (checkIn.status === 'failed') continue;
      const list = dates.get(checkIn.taskId) ?? [];
      list.push(checkIn.date);
      dates.set(checkIn.taskId, list);
    }
    return dates;
  }, [checkIns]);

  const statsByTaskId = useMemo(() => new Map(
    activeTasks.map((task) => [
      task.id,
      computeStats(successCheckInDatesByTask.get(task.id) ?? [], today),
    ]),
  ), [activeTasks, successCheckInDatesByTask, today]);

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
      resolvedInToday={resolvedIds.has(item.id)}
      checkedInAt={todayCheckInsByTask.get(item.id)?.createdAt}
      checkInStatus={todayCheckInsByTask.get(item.id)?.status ?? 'success'}
      stats={statsByTaskId.get(item.id)}
      onToggle={toggleCheckIn}
      onToggleTimer={toggleTimer}
      onSetCheckInStatus={setCheckInStatus}
      onDelete={deleteTask}
      customGroups={availableGroups}
      onMoveToGroup={moveToGroup}
      isLight={theme.isLight}
    />
  ), [availableGroups, today, completedIds, resolvedIds, theme.isLight, todayCheckInsByTask, statsByTaskId, setCheckInStatus, toggleCheckIn, toggleTimer, deleteTask, moveToGroup]);

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
  // Remount DraggableFlatList after each reorder to clear stale pan
  // transforms that can block parent scroll and button taps.
  const handleReorder = useCallback((
    ids: string[],
    from: number,
    to: number,
    group: 'unfinished' | 'finished',
  ) => {
    const fullTasks = group === 'unfinished' ? taskGroups.unfinished : taskGroups.finished;
    reorderTasks(mergeVisibleReorder(fullTasks.map((task) => task.id), ids, from, to), group);
    // No forced remount: rebuilding every gradient card after each drop is
    // what froze the UI mid/post drag. Data updates drive the list directly.
  }, [reorderTasks, taskGroups]);

  return (
    <ScreenShell style={styles.homeContent} forceLight>
        <Stack.Screen options={{ headerShown: false }} />
        <Animated.View entering={FadeInUp.springify().damping(16)} style={styles.header}>
          <View style={styles.headerLeading}>
            <PressableScale
              accessibilityLabel="打开侧边栏"
              accessibilityRole="button"
              onPress={openAppDrawer}
              style={StyleSheet.flatten([styles.menuButton, {
                borderColor: theme.surfaceBorder,
                backgroundColor: theme.surface,
              }])}
            >
              <MaterialCommunityIcons name="menu" size={19} color={theme.mutedText} />
            </PressableScale>
            <View>
              <Text style={[styles.eyebrow, { color: theme.subtleText }]}>
                {new Date(`${today}T00:00:00`).toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })}
              </Text>
              <View style={styles.titleWrap}>
                <Text style={[styles.title, { color: theme.text }]}>打卡主页</Text>
                <View style={styles.titleUnderline} />
              </View>
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
          completedCount={overviewStats.completedCount}
          totalCount={overviewStats.totalCount}
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
        <GlassCard light>
          <Text style={[styles.emptyText, { color: theme.subtleText }]}>正在载入...</Text>
        </GlassCard>
      ) : activeTasks.length === 0 ? (
        <GlassCard light style={styles.emptyCard}>
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
          <GroupSelect
            light
            label="分组"
            groups={availableGroups}
            selected={groupFilter ?? []}
            allLabel="全部"
            onChange={changeGroupFilter}
            onCreateGroup={createGroup}
            onRenameGroup={renameGroup}
            onDeleteGroup={deleteGroup}
          />

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
                  key={`uf-${groupFilter?.join('\u0000') ?? 'all'}-${statusFilter}`}
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
                <NestableDraggableFlatList
                  key={`fin-${groupFilter?.join('\u0000') ?? 'all'}-${statusFilter}`}
                  data={sortedFinished}
                  keyExtractor={(item) => item.id}
                  renderItem={renderTask}
                  dragGestureDetector="item"
                  onDragEnd={({ from, to }) => handleReorder(
                    sortedFinished.map((item) => item.id),
                    from,
                    to,
                    'finished',
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

          {filteredTasks.length === 0 && (
            <Text style={[styles.groupEmpty, { color: theme.subtleText }]}>没有符合条件的任务</Text>
          )}
        </>
      )}

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
  headerLeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  titleWrap: {
    position: 'relative',
    paddingHorizontal: 4,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  titleUnderline: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 2,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#f59e0b',
    opacity: 0.85,
  },
  menuButton: {
    width: 36,
    height: 36,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 20,
    fontWeight: '800',
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
