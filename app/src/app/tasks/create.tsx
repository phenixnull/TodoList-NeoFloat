import { Stack } from 'expo-router';
import ScreenShell from '@/components/ScreenShell';
import TaskForm from '@/components/TaskForm';
import { getNextTaskAppearance } from '@/domain/taskAppearance';
import { useHabitStore } from '@/store/useHabitStore';

export default function CreateTaskScreen() {
  const { activeTasks, createTask } = useHabitStore();
  const suggestedAppearance = getNextTaskAppearance(activeTasks);

  return (
    <ScreenShell>
      <Stack.Screen options={{ headerShown: false }} />
      <TaskForm
        title="创建任务"
        submitLabel="保存任务"
        defaultIcon={suggestedAppearance.icon}
        defaultColor={suggestedAppearance.color}
        onSubmit={createTask}
      />
    </ScreenShell>
  );
}
