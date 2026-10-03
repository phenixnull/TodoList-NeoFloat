import { motion } from 'framer-motion';
import { AlarmClock, Plus } from 'lucide-react';
import { useMemo } from 'react';
import ProgressRing from '../components/ProgressRing';
import TaskCard from '../components/TaskCard';
import { getTaskGroups } from '../../../app/src/domain/taskOrdering';
import { getTodayKey } from '../../../app/src/domain/streak';
import type { Task } from '../../../app/src/domain/types';
import { useStore } from '../data/store';
import type { RecordTarget } from '../components/DayRecordModal';

type Props = {
  onEditTask: (task: Task | null) => void;
  onOpenRecord: (target: RecordTarget, files?: File[]) => void;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export default function TodayPage({ onEditTask, onOpenRecord }: Props) {
  const { tasks, checkIns, now } = useStore();
  const today = getTodayKey(now);
  const completedIds = useMemo(
    () => new Set(checkIns.filter((c) => c.date === today).map((c) => c.taskId)),
    [checkIns, today],
  );
  const groups = useMemo(() => getTaskGroups(tasks, completedIds), [tasks, completedIds]);
  const ratio = tasks.length ? completedIds.size / tasks.length : 0;

  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const remaining = midnight.getTime() - now.getTime();
  const hh = Math.floor(remaining / 3_600_000);
  const mm = Math.floor((remaining % 3_600_000) / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);

  const renderCard = (task: Task) => (
    <TaskCard
      key={task.id}
      task={task}
      date={today}
      checked={completedIds.has(task.id)}
      onEdit={() => onEditTask(task)}
      onOpenDetail={() => onOpenRecord({ taskId: task.id, date: today })}
      onDropImages={(files) => onOpenRecord({ taskId: task.id, date: today }, files)}
    />
  );

  return (
    <div className="flex flex-col gap-5">
      {/* Overview */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass relative overflow-hidden p-6"
      >
        <div
          className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-400/10 blur-3xl"
        />
        <div className="flex items-center gap-8">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-300/90">
              今日进度 · {today}
            </p>
            <div className="mt-3 flex items-end gap-2">
              <span className="text-6xl font-black leading-none text-slate-50">{completedIds.size}</span>
              <span className="mb-1 text-2xl font-bold text-slate-500">/ {tasks.length}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-400">
              {ratio === 1 ? '今日全部完成，状态拉满' : '保持节奏，继续推进'}
            </p>
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.06] px-3.5 py-2 w-fit">
              <AlarmClock size={14} className="text-cyan-300" />
              <span className="text-xs font-semibold text-slate-400">距次日刷新</span>
              <span className="font-mono text-sm font-bold tracking-wider text-cyan-300">
                {pad2(hh)}:{pad2(mm)}:{pad2(ss)}
              </span>
            </div>
          </div>

          <ProgressRing ratio={ratio} size={148} stroke={12}>
            <span className="text-2xl font-black text-slate-100">{Math.round(ratio * 100)}%</span>
            <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              完成率
            </span>
          </ProgressRing>
        </div>
      </motion.div>

      {/* Unfinished */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-extrabold text-slate-200">
            进行中 <span className="ml-1 text-slate-500">{groups.unfinished.length}</span>
          </h3>
          <button onClick={() => onEditTask(null)} className="btn-ghost px-3 py-1.5 text-xs">
            <Plus size={13} /> 新建任务
          </button>
        </div>
        <div className="flex flex-col gap-2.5">{groups.unfinished.map(renderCard)}</div>
      </section>

      {/* Finished */}
      <section>
        <h3 className="mb-3 text-sm font-extrabold text-slate-200">
          已完成 <span className="ml-1 text-slate-500">{groups.finished.length}</span>
        </h3>
        <div className="flex flex-col gap-2.5">{groups.finished.map(renderCard)}</div>
      </section>
    </div>
  );
}
