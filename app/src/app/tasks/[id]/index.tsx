import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';
import GlassCard from '@/components/GlassCard';
import HeatmapGrid from '@/components/HeatmapGrid';
import PressableScale from '@/components/PressableScale';
import ScreenShell from '@/components/ScreenShell';
import TaskIcon from '@/components/TaskIcon';
import DayRecordDetail from '@/components/DayRecordDetail';
import DayRecordEditor from '@/components/DayRecordEditor';
import TaskForm from '@/components/TaskForm';
import TimeSegmentsEditor from '@/components/TimeSegmentsEditor';
import { buildHeatmap } from '@/domain/heatmap';
import { formatCheckInTime } from '@/domain/format';
import {
  calculateTimeSegmentsDurationForDate,
  isTimerRunning,
} from '@/domain/timeTracking';
import { computeStats, toLocalDateKey } from '@/domain/streak';
import { useTodayKey } from '@/hooks/useTodayKey';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/theme';

export default function TaskDetailScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const today = useTodayKey();
  const [selectedDate, setSelectedDate] = useState(today);
  const [mode, setMode] = useState<'stats' | 'edit'>('stats');
  const [heatmapNowMs, setHeatmapNowMs] = useState(() => Date.now());
  const heatmapScrollRef = useRef<ScrollView>(null);
  const {
    activeTasks,
    checkIns,
    dayRecords,
    settings,
    toggleCheckIn,
    toggleTimer,
    updateTask,
    saveDayRecord,
    deleteTask,
  } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const taskId = params.id;
  const task = activeTasks.find((item) => item.id === taskId);
  const running = useMemo(() => (task ? isTimerRunning(task) : false), [task]);
  const taskCheckIns = useMemo(
    () => checkIns.filter((checkIn) => checkIn.taskId === taskId),
    [checkIns, taskId],
  );
  const taskDates = useMemo(
    () => taskCheckIns.map((checkIn) => checkIn.date),
    [taskCheckIns],
  );
  const completedDates = useMemo(() => new Set(taskDates), [taskDates]);
  const heatmapInput = useMemo(() => {
    const currentTask = activeTasks.find((item) => item.id === taskId);

    if (!currentTask) {
      return [];
    }

    const dates = new Set<string>(taskDates);

    for (const segment of currentTask.timerSegments) {
      dates.add(toLocalDateKey(new Date(segment.startAt)));
    }

    return [...dates].map((date) => ({
      date,
      completed: completedDates.has(date),
      durationMs: calculateTimeSegmentsDurationForDate(
        currentTask,
        date,
        heatmapNowMs,
      ),
    }));
  }, [
    activeTasks,
    completedDates,
    heatmapNowMs,
    taskDates,
    taskId,
  ]);

  useEffect(() => {
    if (!running) return;
    const immediate = setTimeout(() => setHeatmapNowMs(Date.now()), 0);
    const timer = setInterval(() => setHeatmapNowMs(Date.now()), 1000);
    return () => { clearTimeout(immediate); clearInterval(timer); };
  }, [running]);

  if (!task) {
    return (
      <ScreenShell>
        <Stack.Screen options={{ headerShown: false }} />
        <GlassCard>
          <Text style={[styles.title, { color: theme.text }]}>任务不存在</Text>
        </GlassCard>
      </ScreenShell>
    );
  }

  const stats = computeStats(taskDates, today);
  const todayCheckIn = checkIns.find((checkIn) => checkIn.taskId === task.id && checkIn.date === today);
  const checkedInToday = Boolean(todayCheckIn);
  const checkedInTime = formatCheckInTime(todayCheckIn?.createdAt);
  const weeks = buildHeatmap(heatmapInput, 15, today);
  const heatmapDays = weeks.flat();
  const firstDay = heatmapDays[0]?.date ?? today;
  const selectedCheckIn = checkIns.find(
    (checkIn) => checkIn.taskId === task.id && checkIn.date === selectedDate,
  );
  const selectedRecord = dayRecords.find(
    (record) => record.taskId === task.id && record.date === selectedDate,
  );
  const shiftSelectedDate = (amount: number) => {
    const date = new Date(`${selectedDate}T00:00:00`);
    date.setDate(date.getDate() + amount);
    const year = date.getFullYear().toString().padStart(4, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    setSelectedDate(`${year}-${month}-${day}`);
  };

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <View style={[styles.iconBox, { backgroundColor: `${task.color}26` }]}>
          <TaskIcon task={task} color={task.color} size={34} />
        </View>
        <View style={styles.titleBox}>
          <Text style={[styles.title, { color: theme.text }]}>{task.name}</Text>
          <Text style={[styles.subtitle, { color: theme.subtleText }]}>
            {task.description || '坚持就是节奏'}
          </Text>
        </View>
      </View>

      <View style={[styles.modeTabs, {
        borderColor: theme.surfaceBorder,
        backgroundColor: theme.inputBackground,
      }]}>
        <PressableScale
          style={[
            styles.modeTab,
            mode === 'stats' && [styles.modeTabActive, { backgroundColor: theme.accent }],
          ]}
          onPress={() => setMode('stats')}
        >
          <MaterialCommunityIcons
            name="chart-timeline-variant"
            size={16}
            color={mode === 'stats' ? theme.onAccent : theme.subtleText}
          />
            <Text style={[
              styles.modeText,
              { color: theme.subtleText },
              mode === 'stats' && { color: theme.onAccent },
            ]}>
              统计
            </Text>
        </PressableScale>
        <PressableScale
          style={[
            styles.modeTab,
            mode === 'edit' && [styles.modeTabActive, { backgroundColor: theme.accent }],
          ]}
          onPress={() => setMode('edit')}
        >
          <MaterialCommunityIcons
            name="pencil"
            size={16}
            color={mode === 'edit' ? theme.onAccent : theme.subtleText}
          />
            <Text style={[
              styles.modeText,
              { color: theme.subtleText },
              mode === 'edit' && { color: theme.onAccent },
            ]}>
              编辑
            </Text>
        </PressableScale>
      </View>

      {mode === 'stats' ? (
        <>
          <Animated.View entering={FadeInDown.springify().damping(17)}>
            <GlassCard>
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: theme.text }]}>{stats.current}</Text>
                  <Text style={[styles.statLabel, { color: theme.subtleText }]}>连续天数</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: theme.text }]}>{stats.longest}</Text>
                  <Text style={[styles.statLabel, { color: theme.subtleText }]}>最长记录</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={[styles.statValue, { color: theme.text }]}>{stats.total}</Text>
                  <Text style={[styles.statLabel, { color: theme.subtleText }]}>累计次数</Text>
                </View>
              </View>
            </GlassCard>
          </Animated.View>

          <Animated.View entering={FadeInDown.delay(60).springify().damping(17)}>
            <GlassCard>
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, { color: theme.text }]}>坚持热图</Text>
                <Text style={[styles.cardMeta, { color: theme.subtleText }]}>近 15 周</Text>
              </View>
              <ScrollView
                ref={heatmapScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                onContentSizeChange={() => heatmapScrollRef.current?.scrollToEnd({ animated: false })}
              >
                <HeatmapGrid
                  weeks={weeks}
                  selectedDate={selectedDate}
                  onSelectDate={setSelectedDate}
                />
              </ScrollView>
              <DayRecordDetail
                task={task}
                date={selectedDate}
                checkIn={selectedCheckIn}
                record={selectedRecord}
                serverUrl={settings.syncEnabled ? settings.serverUrl : ''}
                canGoPrevious={selectedDate > firstDay}
                canGoNext={selectedDate < today}
                onPrevious={() => shiftSelectedDate(-1)}
                onNext={() => shiftSelectedDate(1)}
              />
            </GlassCard>
          </Animated.View>

          <PressableScale
            style={[
              styles.checkButton,
              {
                borderColor: checkedInToday ? theme.surfaceBorder : `${task.color}66`,
                backgroundColor: checkedInToday ? theme.inputBackground : `${task.color}14`,
              },
            ]}
            onPress={() => {
              const checkedIn = toggleCheckIn(task.id);

              void (checkedIn
                ? Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
                : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
            }}
          >
            <MaterialCommunityIcons
              name={checkedInToday ? 'check-bold' : 'calendar-check'}
              size={24}
              color={checkedInToday ? theme.subtleText : task.color}
            />
            <Text style={[styles.checkText, { color: checkedInToday ? theme.mutedText : theme.text }]}>
              {checkedInToday
                ? `${checkedInTime ? `已打卡 ${checkedInTime}` : '今日已打卡'} · 点击取消`
                : '今日未打卡 · 点击打卡'}
            </Text>
          </PressableScale>
        </>
      ) : (
        <TaskForm
          key={task.id}
          title="编辑任务"
          submitLabel="保存任务"
          initialTask={task}
          navigateBackOnSubmit={false}
          onSubmit={(input) => updateTask(task.id, {
            ...input,
          })}
          footer={(
            <>
              <TimeSegmentsEditor
                task={task}
                date={selectedDate}
                accentColor={task.color}
                onToggleTimer={toggleTimer}
                onUpdateTask={updateTask}
              />
              <DayRecordEditor
                key={selectedDate}
                taskId={task.id}
                date={selectedDate}
                record={selectedRecord}
                accentColor={task.color}
                title="当天打卡记录"
                onSave={saveDayRecord}
              />
            </>
          )}
        />
      )}

      {mode === 'stats' ? (
        <PressableScale
          style={styles.deleteButton}
          onPress={() => Alert.alert('删除任务', `确定删除“${task.name}”吗？`, [
            { text: '取消', style: 'cancel' },
            {
              text: '删除',
              style: 'destructive',
              onPress: () => {
                deleteTask(task.id);
                router.back();
              },
            },
          ])}
        >
          <Text style={[styles.deleteText, { color: theme.isLight ? '#b91c1c' : '#fca5a5' }]}>
            删除任务
          </Text>
        </PressableScale>
      ) : null}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  iconBox: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: {
    flex: 1,
    gap: 5,
  },
  title: {
    color: '#f8fafc',
    fontSize: 26,
    fontWeight: '900',
  },
  subtitle: {
    color: 'rgba(148,163,184,0.8)',
    lineHeight: 19,
  },
  modeTabs: {
    flexDirection: 'row',
    gap: 8,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    backgroundColor: 'rgba(2,6,23,0.32)',
    padding: 4,
  },
  modeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    borderRadius: 15,
    paddingVertical: 11,
  },
  modeTabActive: {
    backgroundColor: '#22d3ee',
  },
  modeText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '800',
  },
  modeTextActive: {
    color: '#04121a',
  },
  statsRow: {
    flexDirection: 'row',
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  statValue: {
    color: '#f8fafc',
    fontSize: 28,
    fontWeight: '900',
  },
  statLabel: {
    color: 'rgba(148,163,184,0.75)',
    fontSize: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  cardMeta: {
    color: 'rgba(148,163,184,0.7)',
    fontSize: 12,
  },
  checkButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 18,
  },
  checkText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '800',
  },
  checkedButton: {
    borderColor: 'rgba(148,163,184,0.24)',
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  deleteButton: {
    alignItems: 'center',
    paddingVertical: 12,
  },
  deleteText: {
    color: '#fca5a5',
    fontWeight: '700',
  },
});
