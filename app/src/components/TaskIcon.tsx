import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';
import { Task } from '../domain/types';

type Props = {
  task: Task;
  color: string;
  size?: number;
};

export default function TaskIcon({ task, color, size = 24 }: Props) {
  const iconSize = Math.round(size * 0.66);
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);

  if (task.iconImage) {
    return (
      <Image
        source={{ uri: task.iconImage }}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.32,
          borderWidth: 1,
          borderColor: theme.surfaceBorder,
        }}
        contentFit="cover"
        transition={120}
        accessibilityLabel={`${task.name} custom icon`}
      />
    );
  }

  return (
    <MaterialCommunityIcons
      name={task.icon as any}
      size={iconSize}
      color={color}
      accessibilityLabel={`${task.name} icon`}
    />
  );
}
