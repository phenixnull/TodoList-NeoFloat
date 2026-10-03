import { AnimatePresence, motion } from 'framer-motion';
import { Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { isTimerRunning } from '../../../app/src/domain/timeTracking';
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
  const { createTask, updateTask, deleteTask, tasks } = useStore();
  const availableGroups = useMemo(
    () => [...new Set([...(JSON.parse(localStorage.getItem('habitpulse.desktop.customGroups') ?? '[]') as string[]), ...tasks.flatMap((t) => t.customGroups ?? [])])],
    [tasks],
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState('flag-variant-outline');
  const [error, setError] = useState('');

  useEffect(() => {
    setName(task?.name ?? '');
    setDescription(task?.description ?? '');
    setColor(task?.color ?? PRESET_COLORS[0]);
    setIcon(task?.icon ?? 'flag-variant-outline');
    setSelectedGroups(task?.customGroups ?? []);
    setError('');
  }, [task]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请填写任务名称');
      return;
    }

    if (task) {
      await updateTask(task.id, {
        name: name.trim(),
        description,
        color,
        icon,
        customGroups: selectedGroups,
        manualDurationMs: 0,
      });
    } else {
      await createTask({ name, description, color, icon, manualDurationMs: 0, customGroups: selectedGroups });
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

              {availableGroups.length > 0 && (
                <div>
                  <label className="label">分组</label>
                  <div className="flex flex-wrap gap-1.5">
                    {availableGroups.map((g) => (
                      <button
                        key={g}
                        onClick={() => setSelectedGroups((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
                        className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-all ${
                          selectedGroups.includes(g)
                            ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
                            : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
