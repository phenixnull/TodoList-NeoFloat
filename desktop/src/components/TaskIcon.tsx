import type { Task } from '../../../app/src/domain/types';

type Props = {
  task: Task;
  color: string;
  size?: number;
};

export default function TaskIcon({ task, color, size = 32 }: Props) {
  if (task.iconImage) {
    return (
      <img
        src={task.iconImage}
        alt={task.name}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.28,
          objectFit: 'cover',
          border: '1px solid rgba(255,255,255,0.1)',
        }}
      />
    );
  }

  return (
    <span
      style={{
        fontSize: size * 0.55,
        fontWeight: 800,
        color,
        lineHeight: 1,
      }}
    >
      {task.name.slice(0, 1)}
    </span>
  );
}
