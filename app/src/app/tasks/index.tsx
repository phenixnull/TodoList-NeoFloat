import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { dialog } from '@/components/dialog/dialogs';
import GlassCard from '@/components/GlassCard';
import PressableScale from '@/components/PressableScale';
import ScreenShell from '@/components/ScreenShell';
import TaskIcon from '@/components/TaskIcon';
import { computeStats } from '@/domain/streak';
import { useTodayKey } from '@/hooks/useTodayKey';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/theme';

export default function TasksScreen() {
  const today = useTodayKey();
  const { activeTasks, checkIns, deleteTask } = useHabitStore();
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.header}>
        <Text style={[styles.title, { color: theme.text }]}>任务库</Text>
        <Link href="/tasks/create" asChild>
          <PressableScale style={StyleSheet.flatten([styles.addButton, { backgroundColor: theme.accent }])}>
            <MaterialCommunityIcons name="plus" size={22} color={theme.onAccent} />
          </PressableScale>
        </Link>
      </View>

      {activeTasks.length === 0 ? (
        <GlassCard style={styles.empty}>
          <MaterialCommunityIcons name="format-list-checks" size={32} color={theme.accentText} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>还没有任务</Text>
          <Text style={[styles.emptyText, { color: theme.subtleText }]}>创建多个自定义任务，每天一键打卡。</Text>
        </GlassCard>
      ) : (
        activeTasks.map((task, index) => {
          const dates = checkIns.filter((checkIn) => checkIn.taskId === task.id).map((checkIn) => checkIn.date);
          const stats = computeStats(dates, today);

          return (
            <Animated.View key={task.id} entering={FadeInDown.delay(index * 55).springify().damping(17)}>
              <GlassCard>
                <View style={styles.taskRow}>
                  <View style={[styles.iconBox, { backgroundColor: `${task.color}26` }]}>
                    <TaskIcon task={task} color={task.color} size={29} />
                  </View>

                  <View style={styles.taskCopy}>
                    <Text style={[styles.taskName, { color: theme.text }]}>{task.name}</Text>
                    <Text style={[styles.taskMeta, { color: theme.subtleText }]}>
                      {stats.current} 天连续 · {stats.total} 次总计
                    </Text>
                  </View>

                  <Link href={`/tasks/${task.id}`} asChild>
                    <PressableScale style={StyleSheet.flatten([styles.smallButton, { borderColor: theme.surfaceBorder, backgroundColor: theme.inputBackground }])}>
                      <MaterialCommunityIcons name="chart-timeline-variant" size={19} color={theme.accentText} />
                    </PressableScale>
                  </Link>

                  <PressableScale
                    style={[styles.smallButton, { borderColor: theme.surfaceBorder, backgroundColor: theme.inputBackground }]}
                    onPress={() => dialog.confirm({
                      title: '删除任务',
                      message: `确定删除“${task.name}”吗？`,
                      confirmText: '删除',
                      danger: true,
                      onConfirm: () => deleteTask(task.id),
                    })}
                  >
                    <MaterialCommunityIcons
                      name="trash-can-outline"
                      size={19}
                      color={theme.isLight ? '#b91c1c' : '#fca5a5'}
                    />
                  </PressableScale>
                </View>
              </GlassCard>
            </Animated.View>
          );
        })
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: '#f8fafc',
    fontSize: 32,
    fontWeight: '900',
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: '#22d3ee',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22d3ee',
    shadowOpacity: 0.35,
    shadowRadius: 15,
    shadowOffset: { width: 0, height: 7 },
    elevation: 10,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 34,
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
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  iconBox: {
    width: 48,
    height: 48,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCopy: {
    flex: 1,
    gap: 4,
  },
  taskName: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
  },
  taskMeta: {
    color: 'rgba(148,163,184,0.8)',
    fontSize: 12,
  },
  smallButton: {
    width: 38,
    height: 38,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
