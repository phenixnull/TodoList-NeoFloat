import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  calculateTaskDurationMs,
  formatDuration,
  formatManualDuration,
  isTimerRunning,
  parseDurationInput,
} from '../../../app/src/domain/timeTracking';
import type { Task } from '../../../app/src/domain/types';
import { useStore } from '../data/store';

const PRESET_COLORS = [
  '#22d3ee',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#34d399',
  '#facc15',
  '#f87171',
  '#60a5fa',
];

type Props = {
  // undefined = closed, null = create new task, Task = edit existing.
  task: Task | null | undefined;
  onClose: () => void;
};

export default function TaskEditorModal({ task, onClose }: Props) {
  const { createTask, updateTask, deleteTask } = useStore();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState('flag-variant-outline');
  const [durationText, setDurationText] = useState('00:00:00');
  const [error, setError] = useState('');

  useEffect(() => {
    setName(task?.name ?? '');
    setDescription(task?.description ?? '');
    setColor(task?.color ?? PRESET_COLORS[0]);
    setIcon(task?.icon ?? 'flag-variant-outline');
    setDurationText(task ? formatManualDuration(task.manualDurationMs) : '00:00:00');
    setError('');
  }, [task]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请填写任务名称');
      return;
    }

    const manualMs = parseDurationInput(durationText);
    if (manualMs === null) {
      setError('手动时长格式不正确；负向校准示例：-00:30:00 或 -25m');
      return;
    }

    if (task) {
      await updateTask(task.id, {
        name: name.trim(),
        description,
        color,
        icon,
        manualDurationMs: manualMs,
      });
    } else {
      await createTask({ name, description, color, icon, manualDurationMs: manualMs });
    }

    onClose();
  };

  const handleDelete = async () => {
    if (!task) return;
    await deleteTask(task.id);
    onClose();
  };

  return (
    <AnimatePresence>
      {task !== undefined && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className="glass-strong w-[460px] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-lg font-extrabold text-slate-100">
                {task ? '编辑任务' : '新建任务'}
              </h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="label">任务名称</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="例如：读论文 30 分钟"
                  autoFocus
                />
              </div>

              <div>
                <label className="label">主题色</label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_COLORS.map((c) => (
                    <button
                      key={c}
                      onClick={() => setColor(c)}
                      className={`h-8 w-8 rounded-full transition-transform ${
                        color === c ? 'scale-110 ring-2 ring-white/70 ring-offset-2 ring-offset-slate-900' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div>
                <label className="label">描述（可选）</label>
                <textarea
                  className="input min-h-[72px] resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="任务说明、目标或备注"
                />
              </div>

              <div>
                <label className="label">手动时长 / 校准</label>
                <div className="flex items-center gap-2">
                  <input
                    className="input font-mono"
                    value={durationText}
                    onChange={(e) => setDurationText(e.target.value)}
                    placeholder="00:00:00；-00:20:00 为扣除"
                  />
                  <button
                    type="button"
                    title="重置手动时长为 00:00:00"
                    onClick={() => setDurationText('00:00:00')}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-slate-300 transition-all hover:rotate-[-40deg] hover:border-cyan-400/50 hover:text-cyan-300"
                  >
                    <RotateCcw size={16} />
                  </button>
                </div>
                <p className="mt-2 text-xs text-slate-400">
                  手动值独立保存，不会删除时间段。当前总耗时 {task ? formatDuration(calculateTaskDurationMs(task)) : '00:00:00'}。
                </p>
                {task && isTimerRunning(task) ? (
                  <p className="mt-2 text-xs text-slate-400">
                    计时中：时间段合计持续增加，总耗时实时相加。
                  </p>
                ) : null}
              </div>

              {error && <p className="text-sm font-medium text-rose-400">{error}</p>}

              <div className="mt-1 flex items-center gap-2">
                {task && (
                  <button className="btn-danger" onClick={handleDelete}>
                    <Trash2 size={15} />
                    删除
                  </button>
                )}
                <div className="flex-1" />
                <button className="btn-ghost" onClick={onClose}>
                  取消
                </button>
                <button className="btn-accent" onClick={handleSave}>
                  保存
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
