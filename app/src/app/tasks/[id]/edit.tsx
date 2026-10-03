import { Stack, useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text } from 'react-native';
import GlassCard from '@/components/GlassCard';
import ScreenShell from '@/components/ScreenShell';
import TaskForm from '@/components/TaskForm';
import DayRecordEditor from '@/components/DayRecordEditor';
import { useTodayKey } from '@/hooks/useTodayKey';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/theme';
import { setTaskTotalDuration } from '@/domain/timeTracking';

export default function EditTaskScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const today = useTodayKey();
  const { activeTasks, updateTask, dayRecords, saveDayRecord } = useHabitStore();
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const task = activeTasks.find((item) => item.id === params.id);

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      {task ? (
        <TaskForm
          title="编辑任务"
          submitLabel="保存修改"
          initialTask={task}
          onSubmit={({ totalDurationMs, ...input }) => {
            const durationUpdate = setTaskTotalDuration(task, totalDurationMs);
            updateTask(task.id, {
              ...input,
              timerSegments: durationUpdate.timerSegments,
              removedSegmentIds: durationUpdate.removedSegmentIds,
              manualDurationMs: durationUpdate.manualDurationMs,
            });
          }}
          footer={(
            <DayRecordEditor
              taskId={task.id}
              date={today}
              record={dayRecords.find((record) => record.taskId === task.id && record.date === today)}
              accentColor={task.color}
              onSave={saveDayRecord}
            />
          )}
        />
      ) : (
        <GlassCard>
          <Text style={[styles.missing, { color: theme.text }]}>任务不存在</Text>
        </GlassCard>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  missing: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
  },
});
