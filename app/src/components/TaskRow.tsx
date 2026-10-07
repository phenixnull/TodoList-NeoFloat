import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  Gesture,
  GestureDetector,
  type GestureType,
} from 'react-native-gesture-handler';
import Animated, {
  useFrameCallback,
  useAnimatedStyle,
  useSharedValue,
  runOnJS,
} from 'react-native-reanimated';
import { dialog, type DialogOption } from './dialog/dialogs';
import PressableScale from './PressableScale';
import TaskIcon from './TaskIcon';
import { getPulseColors } from '../domain/color';
import { formatCheckInTime } from '../domain/format';
import { getWindowPhase } from '../domain/scheduleWindow';
import { HabitStats } from '../domain/streak';
import { CheckInStatus, Task } from '../domain/types';
import { calculateTimeSegmentsDurationForDate, formatDuration, isTimerRunning } from '../domain/timeTracking';
import { resolveTheme } from '../theme/theme';

type Props = {
  task: Task;
  today: string;
  checkedInToday: boolean;
  resolvedInToday?: boolean;
  checkedInAt?: string | null;
  checkInStatus?: CheckInStatus;
  stats?: HabitStats;
  index?: number;
  isActive?: boolean;
  drag?: () => void;
  dragGesture?: GestureType;
  dragInProgress?: boolean;
  onToggle: (taskId: string) => boolean;
  onToggleTimer: (taskId: string) => void;
  onSetCheckInStatus?: (taskId: string, date: string, status: CheckInStatus) => void;
  onDelete: (taskId: string) => void;
  customGroups?: string[];
  onMoveToGroup?: (taskId: string, groups: string[]) => void;
  isLight?: boolean;
};

function TaskDuration({ task, today, isLight = false }: { task: Task; today: string; isLight?: boolean }) {
  const running = isTimerRunning(task);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const theme = resolveTheme(isLight ? 'light' : 'dark', null);

  useEffect(() => {
    if (!running) {
      return;
    }

    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, [running]);

  return (
    <View style={[styles.durationRow, running && { borderColor: `${task.color}66` }]}>
      <MaterialCommunityIcons
        name={running ? 'timer-outline' : 'timer-sand-empty'}
        size={12}
        color={running ? task.color : theme.subtleText}
      />
      <Text style={[styles.durationText, { color: theme.mutedText }, running && { color: task.color }]}>
        {formatDuration(calculateTimeSegmentsDurationForDate(task, today, nowMs))}
      </Text>
    </View>
  );
}

function ScheduleWindowRow({
  task,
  today,
  isLight,
  failed,
}: {
  task: Task;
  today: string;
  isLight: boolean;
  failed: boolean;
}) {
  const win = task.scheduleWindow;
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!win) return;
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, [win]);

  if (!win) return null;

  const phase = getWindowPhase(task, today, now.getDay(), now);
  const theme = resolveTheme(isLight ? 'light' : 'dark', null);
  const active = phase === 'active';
  const color = failed ? '#f87171' : active ? task.color : theme.subtleText;
  const suffix = active ? ' · 进行中' : phase === 'before' ? ' · 未开始' : '';

  return (
    <View style={[styles.windowRow, active && { borderColor: `${task.color}66` }]}>
      <MaterialCommunityIcons
        name={active ? 'clock-alert-outline' : 'clock-outline'}
        size={12}
        color={color}
      />
      <Text style={[styles.windowText, { color }]} numberOfLines={1}>
        {win.start}–{win.end}{suffix}
      </Text>
    </View>
  );
}

function TaskRow({
  task,
  today,
  checkedInToday,
  resolvedInToday,
  checkedInAt,
  checkInStatus = 'success',
  stats,
  isActive = false,
  drag,
  dragGesture,
  dragInProgress = false,
  onToggle,
  onToggleTimer,
  onSetCheckInStatus,
  onDelete,
  customGroups = [],
  onMoveToGroup,
  isLight = false,
}: Props) {
  const aura = useSharedValue(0);
  const lastPulseFrameAt = useSharedValue(0);
  const running = isTimerRunning(task);
  const checkedInTime = formatCheckInTime(checkedInAt);
  const failed = checkInStatus === 'failed';
  const resolved = resolvedInToday ?? checkedInToday;
  const [actionMenuVisible, setActionMenuVisible] = useState(false);
  const pulseColors = useMemo(() => getPulseColors(task.color), [task.color]);
  const theme = resolveTheme(isLight ? 'light' : 'dark', null);

  useFrameCallback(({ timeSinceFirstFrame }) => {
    'worklet';

    const nowMs = Math.round(timeSinceFirstFrame);
    if (nowMs - lastPulseFrameAt.value < 50) {
      return;
    }

    lastPulseFrameAt.value = nowMs;
    const phase = (nowMs % 2600) / 2600;
    aura.value = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
  }, !resolved && !isActive && !dragInProgress);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: resolved || isActive || dragInProgress
      ? 0
      : 0.20 + Math.abs(aura.value * 2 - 1) * 0.28,
  }), [aura, resolved, isActive, dragInProgress]);

  const toggle = () => {
    if (failed) {
      onSetCheckInStatus?.(task.id, today, 'success');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      return;
    }

    const checkedIn = onToggle(task.id);

    if (checkedIn) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const showGroupMenu = () => {
    if (!onMoveToGroup) return;
    const currentGroups = task.customGroups ?? [];
    const options: DialogOption[] = [{
      text: '未分组',
      icon: 'close-circle-outline',
      selected: currentGroups.length === 0,
      onPress: () => onMoveToGroup(task.id, []),
    }];
    for (const g of customGroups) {
      const has = currentGroups.includes(g);
      options.push({
        text: g,
        selected: has,
        onPress: () => onMoveToGroup(task.id, has
          ? currentGroups.filter((x) => x !== g)
          : [...currentGroups, g]),
      });
    }

    dialog.sheet({
      title: `移动「${task.name}」到分组`,
      message: `当前：${currentGroups.join(', ') || '未分组'}`,
      options,
    });
  };

  const confirmDelete = () => {
    dialog.confirm({
      title: '删除任务',
      message: `确定删除“${task.name}”吗？`,
      confirmText: '删除',
      danger: true,
      onConfirm: () => onDelete(task.id),
    });
  };

  const showActionMenu = () => setActionMenuVisible(true);

  const [handlePressed, setHandlePressed] = useState(false);
  const activateDrag = useCallback(() => {
    setHandlePressed(true);
    drag?.();
  }, [drag]);
  const deactivateDragHandle = useCallback(() => {
    setHandlePressed(false);
  }, []);
  const handleGesture = useMemo(() => {
    if (!dragGesture) {
      return undefined;
    }

    return Gesture.Simultaneous(
      dragGesture,
      Gesture.Native()
        .onTouchesDown(() => {
          runOnJS(activateDrag)();
        })
        .onTouchesUp(() => {
          runOnJS(deactivateDragHandle)();
        }),
    );
  }, [dragGesture, activateDrag, deactivateDragHandle]);

  const dragHandle = (
    <View
      accessibilityLabel={`拖动 ${task.name}`}
      accessibilityHint="按住图标上下移动即可调整位置"
      accessibilityRole="button"
      onStartShouldSetResponder={() => {
        activateDrag();
        return false;
      }}
      onResponderRelease={deactivateDragHandle}
      style={[
        styles.iconBox,
        {
          borderColor: resolved ? theme.surfaceBorder : `${task.color}55`,
          backgroundColor: resolved
            ? theme.inputBackground
            : theme.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(2,6,23,0.38)',
        },
        handlePressed && { backgroundColor: theme.isLight ? `${task.color}33` : 'rgba(34,211,238,0.18)' },
      ]}
    >
      <TaskIcon
        task={task}
        color={failed ? '#fca5a5' : resolved ? theme.subtleText : task.color}
        size={28}
      />
    </View>
  );

  return (
    <View style={styles.dragContainer}>
      <View
        style={[
          styles.card,
          {
            borderColor: failed
              ? 'rgba(239,68,68,0.48)'
              : resolved
              ? theme.surfaceBorder
              : theme.isLight ? 'rgba(15,23,42,0.10)' : 'rgba(103,232,249,0.34)',
            backgroundColor: failed
              ? '#010208'
              : resolved
              ? theme.surface
              : theme.isLight ? 'rgba(255,255,255,0.74)' : 'rgba(15,23,42,0.58)',
          },
          isActive ? styles.draggingCard : undefined,
          dragInProgress && !isActive ? styles.quietDuringDragCard : undefined,
        ]}
      >
        {dragInProgress ? (
          <View
            style={[
              StyleSheet.absoluteFill,
              failed
                ? { backgroundColor: '#010208' }
                : resolved
                ? { backgroundColor: theme.surface }
                : { backgroundColor: theme.isLight ? 'rgba(255,255,255,0.88)' : 'rgba(9,14,31,0.88)' },
            ]}
          />
        ) : (
          <LinearGradient
            colors={failed
              ? ['rgba(127,29,29,0.22)', 'rgba(2,6,23,0.96)']
              : resolved
              ? (theme.isLight
                ? ['rgba(15,23,42,0.05)', 'rgba(255,255,255,0.55)']
                : ['rgba(148,163,184,0.14)', 'rgba(71,85,105,0.08)'])
              : [`${task.color}38`, `${pulseColors[1]}22`, theme.isLight ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.68)']}
            style={StyleSheet.absoluteFill}
          />
        )}
        {!failed && !resolved && !dragInProgress && (
          <Animated.View style={[StyleSheet.absoluteFill, pulseStyle]} pointerEvents="none">
            <LinearGradient
              colors={[`${pulseColors[0]}50`, `${pulseColors[1]}40`, `${pulseColors[2]}50`]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        )}

        <View style={styles.cardPress}>
          <PressableScale
            accessibilityLabel={failed ? `${task.name}打卡失败，点击补卡` : resolved ? `${task.name}已打卡，点击取消` : `${task.name}未打卡，点击打卡`}
            accessibilityState={{ checked: resolved && !failed }}
            accessibilityRole="checkbox"
            onPress={toggle}
            onLongPress={showActionMenu}
            style={styles.mainRow}
          >
            {handleGesture ? (
              <GestureDetector gesture={handleGesture}>
                {dragHandle}
              </GestureDetector>
            ) : (
              dragHandle
            )}

            <View style={styles.taskBody}>
              <Text style={[styles.taskName, { color: failed ? '#fca5a5' : resolved ? theme.mutedText : theme.text }]} numberOfLines={1}>
                {task.name}
              </Text>
              <Text style={[styles.taskMeta, { color: failed ? '#f87171' : theme.subtleText }]} numberOfLines={1}>
                {failed ? '打卡失败' : resolved ? (checkedInTime ? `已打卡 ${checkedInTime}` : '已打卡') : '未打卡'}
                {stats ? ` · ${stats.current}天 · ${stats.total}次` : ''}
              </Text>
              <ScheduleWindowRow task={task} today={today} isLight={isLight} failed={failed} />
              <TaskDuration task={task} today={today} isLight={isLight} />
            </View>
          </PressableScale>

          <View style={styles.sideColumn}>
            <View style={styles.actions}>
              <PressableScale
                style={[styles.actionButton, { borderColor: `${task.color}66`, backgroundColor: theme.inputBackground }]}
                accessibilityLabel={`${running ? '暂停' : '开始'}${task.name}耗时`}
                onPress={() => onToggleTimer(task.id)}
              >
                <MaterialCommunityIcons
                  name={running ? 'pause' : 'play'}
                  size={15}
                  color={task.color}
                />
              </PressableScale>

              <Link href={`/tasks/${task.id}`} asChild>
                <PressableScale
                  style={StyleSheet.flatten([styles.actionButton, { borderColor: theme.surfaceBorder, backgroundColor: theme.inputBackground }])}
                  accessibilityLabel={`${task.name}统计`}
                >
                  <MaterialCommunityIcons
                    name="chart-timeline-variant"
                    size={15}
                    color={failed ? '#fca5a5' : resolved ? theme.subtleText : theme.accentText}
                  />
                </PressableScale>
              </Link>

              <PressableScale
                style={[styles.actionButton, { borderColor: theme.surfaceBorder, backgroundColor: theme.inputBackground }]}
                accessibilityLabel={`删除${task.name}`}
                onPress={confirmDelete}
              >
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={15}
                  color={failed
                    ? '#fca5a5'
                    : resolved
                    ? theme.subtleText
                    : theme.isLight ? '#b91c1c' : '#fca5a5'}
                />
              </PressableScale>
            </View>
          </View>
        </View>

        {resolved && (
          <View pointerEvents="none" style={styles.stamp}>
            <Text style={[styles.stampText, failed ? styles.stampFailed : styles.stampSuccess]}>
              {failed ? '失败' : '完成'}
            </Text>
          </View>
        )}
      </View>

      <Modal transparent visible={actionMenuVisible} animationType="fade" onRequestClose={() => setActionMenuVisible(false)}>
        <Pressable style={styles.menuBackdrop} onPress={() => setActionMenuVisible(false)}>
          <Pressable
            style={[styles.menuCard, {
              backgroundColor: theme.isLight ? 'rgba(255,255,255,0.98)' : 'rgba(8,13,30,0.98)',
              borderColor: theme.surfaceBorder,
            }]}
            onPress={() => {}}
          >
            <View style={styles.menuHeader}>
              <Text numberOfLines={1} style={[styles.menuTitle, { color: theme.text }]}>{task.name}</Text>
              <Text style={[styles.menuSubtitle, { color: theme.subtleText }]}>
                {failed ? '状态：打卡失败' : resolved ? '状态：已完成' : '状态：未打卡'}
              </Text>
            </View>

            <PressableScale
              style={styles.menuItem}
              onPress={() => {
                onSetCheckInStatus?.(task.id, today, failed ? 'success' : 'failed');
                setActionMenuVisible(false);
              }}
            >
              <MaterialCommunityIcons
                name={failed ? 'check-circle-outline' : 'close-circle-outline'}
                size={19}
                color={failed ? '#22c55e' : '#f87171'}
              />
              <Text style={[styles.menuItemText, { color: failed ? '#22c55e' : '#f87171' }]}>
                {failed ? '标记为已打卡成功' : '标记为打卡失败'}
              </Text>
            </PressableScale>

            {onMoveToGroup && (
              <PressableScale style={styles.menuItem} onPress={showGroupMenu}>
                <MaterialCommunityIcons name="shape" size={19} color={theme.mutedText} />
                <Text style={[styles.menuItemText, { color: theme.text }]}>移动 / 分组</Text>
              </PressableScale>
            )}

            <PressableScale style={styles.menuItem} onPress={confirmDelete}>
              <MaterialCommunityIcons name="trash-can-outline" size={19} color="#f87171" />
              <Text style={[styles.menuItemText, styles.menuDanger]}>删除任务</Text>
            </PressableScale>

            <PressableScale style={[styles.menuItem, styles.menuCancel]} onPress={() => setActionMenuVisible(false)}>
              <Text style={[styles.menuItemText, { color: theme.mutedText }]}>取消</Text>
            </PressableScale>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export default memo(TaskRow);

const styles = StyleSheet.create({
  dragContainer: {
    borderRadius: 21,
  },
  card: {
    borderRadius: 21,
    borderWidth: 1.2,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.16,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  activeCard: {
    borderColor: 'rgba(103,232,249,0.34)',
    backgroundColor: 'rgba(15,23,42,0.58)',
  },
  completedCard: {
    borderColor: 'rgba(148,163,184,0.20)',
    backgroundColor: 'rgba(148,163,184,0.13)',
  },
  quietDuringDragCard: {
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 1,
  },
  draggingCard: {
    shadowColor: '#22d3ee',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  activeDragBackground: {
    backgroundColor: 'rgba(9,14,31,0.88)',
  },
  completedDragBackground: {
    backgroundColor: 'rgba(78,91,112,0.20)',
  },
  cardPress: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 9,
  },
  mainRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 16,
    paddingVertical: 2,
  },
  iconBox: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragIconBox: {
    borderColor: 'rgba(255,255,255,0.16)',
    backgroundColor: 'rgba(2,6,23,0.38)',
  },
  completedIconBox: {
    borderColor: 'rgba(148,163,184,0.20)',
    backgroundColor: 'rgba(148,163,184,0.20)',
  },
  iconBoxPressed: {
    backgroundColor: 'rgba(34,211,238,0.18)',
  },
  taskBody: {
    flex: 1,
    gap: 2,
  },
  taskName: {
    color: '#f8fafc',
    fontSize: 15.5,
    fontWeight: '700',
    lineHeight: 20,
  },
  completedText: {
    color: '#cbd5e1',
  },
  groupChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 3,
    overflow: 'hidden',
  },
  groupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 99,
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  groupDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  groupChipText: {
    fontSize: 9,
    fontWeight: '600',
  },
  taskMeta: {
    color: 'rgba(226,232,240,0.62)',
    fontSize: 10.5,
    lineHeight: 14,
  },
  completedMeta: {
    color: 'rgba(148,163,184,0.72)',
  },
  durationRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  windowRow: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  windowText: {
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  durationText: {
    color: '#cbd5e1',
    fontSize: 10,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  sideColumn: {
    width: '34%',
    maxWidth: 104,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  actionButton: {
    flex: 1,
    height: 29,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(2,6,23,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stamp: {
    position: 'absolute',
    right: '18%',
    top: '50%',
    zIndex: 20,
    transform: [{ translateY: -15 }, { rotate: '-45deg' }],
    borderRadius: 7,
    borderWidth: 2.5,
    paddingHorizontal: 9,
    paddingVertical: 3,
  },
  stampText: {
    fontSize: 17,
    fontStyle: 'italic',
    fontWeight: '900',
    letterSpacing: 1,
  },
  stampFailed: {
    borderColor: '#ef4444',
    color: '#ef4444',
    textShadowColor: 'rgba(0,0,0,0.55)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  stampSuccess: {
    borderColor: '#22c55e',
    color: '#22c55e',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.68)',
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  menuCard: {
    borderRadius: 24,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    shadowColor: '#020617',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 18 },
    elevation: 20,
  },
  menuHeader: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(148,163,184,0.18)',
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: '900',
  },
  menuSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '600',
  },
  menuItem: {
    minHeight: 48,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  menuItemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '700',
  },
  menuDanger: {
    color: '#f87171',
  },
  menuCancel: {
    justifyContent: 'center',
    marginTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(148,163,184,0.18)',
  },
});
