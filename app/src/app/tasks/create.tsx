import { Stack, useLocalSearchParams } from 'expo-router';
import ScreenShell from '@/components/ScreenShell';
import TaskForm from '@/components/TaskForm';
import { getNextTaskAppearance } from '@/domain/taskAppearance';
import { useHabitStore } from '@/store/useHabitStore';

export default function CreateTaskScreen() {
  const { activeTasks, createTask } = useHabitStore();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const suggestedAppearance = getNextTaskAppearance(activeTasks);

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      <TaskForm
        title="创建任务"
        submitLabel="保存任务"
        initialName={typeof voice === 'string' ? voice : undefined}
        defaultIcon={suggestedAppearance.icon}
        defaultColor={suggestedAppearance.color}
        onSubmit={(input) => createTask({
          ...input,
          manualDurationMs: 0,
        })}
      />
    </ScreenShell>
  );
}
