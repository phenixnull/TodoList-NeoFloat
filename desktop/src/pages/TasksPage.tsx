import { motion } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  calculateTaskDurationMs,
  formatDuration,
} from '../../../app/src/domain/timeTracking';
import type { Task } from '../../../app/src/domain/types';
import { useStore } from '../data/store';

type Props = {
  onEditTask: (task: Task | null) => void;
};

export default function TasksPage({ onEditTask }: Props) {
  const { tasks, now, reorderTasks, deleteTask } = useStore();
  const active = useMemo(
    () => tasks.filter((t) => !t.deletedAt).sort((a, b) => a.sortOrder - b.sortOrder),
    [tasks],
  );

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= active.length) return;
    const ids = active.map((t) => t.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    void reorderTasks(ids);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-100">任务管理</h2>
          <p className="mt-1 text-xs text-slate-500">共 {active.length} 个任务，可调整顺序、编辑资料或删除</p>
        </div>
        <button className="btn-accent" onClick={() => onEditTask(null)}>
          <Plus size={15} /> 新建任务
        </button>
      </div>

      <div className="glass overflow-hidden">
        <div className="grid grid-cols-[1fr_120px_120px_90px_110px] gap-3 border-b border-white/[0.07] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>任务</span>
          <span>累计时长</span>
          <span>计时分段</span>
          <span className="text-right">排序</span>
          <span className="text-right">操作</span>
        </div>

        {active.map((task, index) => (
          <motion.div
            layout
            key={task.id}
            className="grid grid-cols-[1fr_120px_120px_90px_110px] items-center gap-3 border-b border-white/[0.05] px-5 py-3 last:border-0 hover:bg-white/[0.03]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-black"
                style={{ backgroundColor: `${task.color}22`, color: task.color }}
              >
                {task.name.slice(0, 1)}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-200">{task.name}</p>
                {task.description ? (
                  <p className="truncate text-xs text-slate-500">{task.description}</p>
                ) : null}
              </div>
            </div>

            <span className="font-mono text-xs text-slate-300">
              {formatDuration(calculateTaskDurationMs(task, now.getTime()))}
            </span>
            <span className="text-xs text-slate-400">{task.timerSegments.length} 段</span>

            <div className="flex items-center justify-end gap-1">
              <button
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 disabled:opacity-30"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <ChevronUp size={15} />
              </button>
              <button
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 disabled:opacity-30"
                disabled={index === active.length - 1}
                onClick={() => move(index, 1)}
              >
                <ChevronDown size={15} />
              </button>
            </div>

            <div className="flex items-center justify-end gap-1">
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-slate-200"
                onClick={() => onEditTask(task)}
              >
                <Pencil size={14} />
              </button>
              <button
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-500/20 hover:text-rose-300"
                onClick={() => void deleteTask(task.id)}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
