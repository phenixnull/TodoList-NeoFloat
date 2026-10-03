import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
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
import PressableScale from './PressableScale';
import TaskIcon from './TaskIcon';
import { getPulseColors } from '../domain/color';
import { formatCheckInTime } from '../domain/format';
import { HabitStats } from '../domain/streak';
import { Task } from '../domain/types';
import { calculateTimeSegmentsDurationForDate, formatDuration, isTimerRunning } from '../domain/timeTracking';
import { resolveTheme } from '../theme/theme';

type Props = {
  task: Task;
  today: string;
  checkedInToday: boolean;
  checkedInAt?: string | null;
  stats?: HabitStats;
  index?: number;
  isActive?: boolean;
  drag?: () => void;
  dragGesture?: GestureType;
  dragInProgress?: boolean;
  onToggle: (taskId: string) => boolean;
  onToggleTimer: (taskId: string) => void;
  onDelete: (taskId: string) => void;
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

function TaskRow({
  task,
  today,
  checkedInToday,
  checkedInAt,
  stats,
  isActive = false,
  drag,
  dragGesture,
  dragInProgress = false,
  onToggle,
  onToggleTimer,
  onDelete,
  isLight = false,
}: Props) {
  const aura = useSharedValue(0);
  const lastPulseFrameAt = useSharedValue(0);
  const running = isTimerRunning(task);
  const checkedInTime = formatCheckInTime(checkedInAt);
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
  }, !checkedInToday && !isActive && !dragInProgress);

  const pulseStyle = useAnimatedStyle(() => ({
    opacity: checkedInToday || isActive || dragInProgress
      ? 0
      : 0.20 + Math.abs(aura.value * 2 - 1) * 0.28,
  }), [aura, checkedInToday, isActive, dragInProgress]);

  const toggle = () => {
    const checkedIn = onToggle(task.id);

    if (checkedIn) {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  const confirmDelete = () => {
    Alert.alert('删除任务', `确定删除“${task.name}”吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => onDelete(task.id) },
    ]);
  };

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
          borderColor: checkedInToday ? theme.surfaceBorder : `${task.color}55`,
          backgroundColor: checkedInToday
            ? theme.inputBackground
            : theme.isLight ? 'rgba(255,255,255,0.72)' : 'rgba(2,6,23,0.38)',
        },
        handlePressed && { backgroundColor: theme.isLight ? `${task.color}33` : 'rgba(34,211,238,0.18)' },
      ]}
    >
      <TaskIcon
        task={task}
        color={checkedInToday ? theme.subtleText : task.color}
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
            borderColor: checkedInToday
              ? theme.surfaceBorder
              : theme.isLight ? 'rgba(15,23,42,0.10)' : 'rgba(103,232,249,0.34)',
            backgroundColor: checkedInToday
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
              checkedInToday
                ? { backgroundColor: theme.surface }
                : { backgroundColor: theme.isLight ? 'rgba(255,255,255,0.88)' : 'rgba(9,14,31,0.88)' },
            ]}
          />
        ) : (
          <LinearGradient
            colors={checkedInToday
              ? (theme.isLight
                ? ['rgba(15,23,42,0.05)', 'rgba(255,255,255,0.55)']
                : ['rgba(148,163,184,0.14)', 'rgba(71,85,105,0.08)'])
              : [`${task.color}38`, `${pulseColors[1]}22`, theme.isLight ? 'rgba(255,255,255,0.78)' : 'rgba(15,23,42,0.68)']}
            style={StyleSheet.absoluteFill}
          />
        )}
        {!checkedInToday && !dragInProgress && (
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
            accessibilityLabel={checkedInToday ? `${task.name}已打卡，点击取消` : `${task.name}未打卡，点击打卡`}
            accessibilityState={{ checked: checkedInToday }}
            accessibilityRole="checkbox"
            onPress={toggle}
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
              <Text style={[styles.taskName, { color: checkedInToday ? theme.mutedText : theme.text }]} numberOfLines={1}>
                {task.name}
              </Text>
              <Text style={[styles.taskMeta, { color: theme.subtleText }]} numberOfLines={1}>
                {checkedInToday ? (checkedInTime ? `已打卡 ${checkedInTime}` : '已打卡') : '未打卡'}
                {stats ? ` · ${stats.current}天 · ${stats.total}次` : ''}
              </Text>
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
                    color={checkedInToday ? theme.subtleText : theme.accentText}
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
                  color={checkedInToday
                    ? theme.subtleText
                    : theme.isLight ? '#b91c1c' : '#fca5a5'}
                />
              </PressableScale>
            </View>
          </View>
        </View>
      </View>
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
});
