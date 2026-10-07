import { AnimatePresence, motion } from 'framer-motion';
import { ImagePlus, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  calculateTaskDurationMs,
  isTimerRunning,
  setTaskTotalDuration,
} from '../../../app/src/domain/timeTracking';
import { getAvailableTaskGroups } from '../../../app/src/domain/taskOrdering';
import { getTodayKey } from '../../../app/src/domain/streak';
import type { ScheduleRepeat, ScheduleWindow, Task } from '../../../app/src/domain/types';
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
  const storedGroups = useMemo(
    () => JSON.parse(localStorage.getItem('habitpulse.desktop.customGroups') ?? '[]') as string[],
    [task],
  );
  const availableGroups = useMemo(
    () => getAvailableTaskGroups(storedGroups, tasks),
    [storedGroups, tasks],
  );
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(PRESET_COLORS[0]);
  const [icon, setIcon] = useState('flag-variant-outline');
  const [iconImage, setIconImage] = useState<string | null>(null);
  const [targetMinutes, setTargetMinutes] = useState('');
  const [windowEnabled, setWindowEnabled] = useState(false);
  const [winStart, setWinStart] = useState('07:00');
  const [winEnd, setWinEnd] = useState('08:00');
  const [winRepeat, setWinRepeat] = useState<ScheduleRepeat>('daily');
  const [winWeekdays, setWinWeekdays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [winDate, setWinDate] = useState(() => getTodayKey());
  const [error, setError] = useState('');

  useEffect(() => {
    setName(task?.name ?? '');
    setDescription(task?.description ?? '');
    setColor(task?.color ?? PRESET_COLORS[0]);
    setIcon(task?.icon ?? 'flag-variant-outline');
    setIconImage(task?.iconImage ?? null);
    setTargetMinutes(task ? String(Math.round(calculateTaskDurationMs(task, Date.now()) / 60_000)) : '');
    setSelectedGroups(task?.customGroups ?? []);
    const existingWindow = task?.scheduleWindow ?? null;
    setWindowEnabled(Boolean(existingWindow));
    setWinStart(existingWindow?.start ?? '07:00');
    setWinEnd(existingWindow?.end ?? '08:00');
    setWinRepeat(existingWindow?.repeat ?? 'daily');
    setWinWeekdays(existingWindow?.weekdays?.length ? existingWindow.weekdays : [1, 2, 3, 4, 5]);
    setWinDate(existingWindow?.targetDate ?? getTodayKey());
    setError('');
  }, [task?.id]);

  const buildWindow = (): ScheduleWindow | null => {
    if (!windowEnabled) return null;
    if (winRepeat === 'weekly') {
      return {
        start: winStart,
        end: winEnd,
        repeat: 'weekly',
        weekdays: winWeekdays.length ? winWeekdays : [1, 2, 3, 4, 5],
      };
    }
    if (winRepeat === 'once') {
      return { start: winStart, end: winEnd, repeat: 'once', targetDate: winDate };
    }
    return { start: winStart, end: winEnd, repeat: 'daily' };
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('请填写任务名称');
      return;
    }

    if (task) {
      const targetMs = Number.parseFloat(targetMinutes);
      const calibrated = Number.isFinite(targetMs)
        ? setTaskTotalDuration(task, Math.max(0, Math.round(targetMs * 60_000)), new Date())
        : task;

      await updateTask(task.id, {
        name: name.trim(),
        description,
        color,
        icon,
        iconImage,
        customGroups: selectedGroups,
        timerSegments: calibrated.timerSegments,
        removedSegmentIds: calibrated.removedSegmentIds ?? [],
        manualDurationMs: calibrated.manualDurationMs,
        scheduleWindow: buildWindow(),
      });
    } else {
      await createTask({ name, description, color, icon, iconImage, manualDurationMs: 0, customGroups: selectedGroups, scheduleWindow: buildWindow() });
    }

    onClose();
  };

  const handleDelete = async () => {
    if (!task) return;
    await deleteTask(task.id);
    onClose();
  };

  const pickIconImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('请选择图片文件');
      return;
    }

    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('读取图片失败'));
        reader.readAsDataURL(file);
      });

      const image = await new Promise<HTMLImageElement>((resolve, reject) => {
        const element = new Image();
        element.onload = () => resolve(element);
        element.onerror = () => reject(new Error('图片解析失败'));
        element.src = dataUrl;
      });

      const max = 512;
      const scale = Math.min(1, max / Math.max(image.width || max, image.height || max));
      const width = Math.max(1, Math.round((image.width || max) * scale));
      const height = Math.max(1, Math.round((image.height || max) * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d')?.drawImage(image, 0, 0, width, height);
      setIconImage(canvas.toDataURL('image/webp', 0.9));
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : '图片处理失败');
    }
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
                <label className="label">任务图标</label>
                <div className="flex items-center gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04]">
                    {iconImage ? (
                      <img src={iconImage} alt="任务图标" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-black text-slate-300">{name.trim().slice(0, 1) || '任务'}</span>
                    )}
                  </div>
                  <label className="btn-ghost cursor-pointer px-3 py-1.5 text-xs">
                    <ImagePlus size={14} />
                    上传图标
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(event) => {
                        void pickIconImage(event.target.files?.[0]);
                        event.target.value = '';
                      }}
                    />
                  </label>
                  {iconImage && (
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setIconImage(null)}>
                      移除
                    </button>
                  )}
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

              <div>
                <label className="label flex items-center justify-between">
                  <span>计划时间段</span>
                  <button
                    type="button"
                    onClick={() => setWindowEnabled((v) => !v)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      windowEnabled ? 'bg-cyan-400' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${
                        windowEnabled ? 'left-[22px]' : 'left-0.5'
                      }`}
                    />
                  </button>
                </label>
                {windowEnabled && (
                  <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/[0.03] p-3">
                    <p className="text-[11px] text-slate-500">
                      过了结束时间仍未打卡，自动判为失败，之后仍可补卡。
                    </p>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        className="input flex-1"
                        style={{ colorScheme: 'dark' }}
                        value={winStart}
                        onChange={(e) => setWinStart(e.target.value)}
                      />
                      <span className="text-xs text-slate-400">至</span>
                      <input
                        type="time"
                        className="input flex-1"
                        style={{ colorScheme: 'dark' }}
                        value={winEnd}
                        onChange={(e) => setWinEnd(e.target.value)}
                      />
                    </div>
                    <div className="flex gap-1.5">
                      {([
                        ['daily', '每天'],
                        ['weekly', '按星期'],
                        ['once', '一次性'],
                      ] as [ScheduleRepeat, string][]).map(([v, l]) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => setWinRepeat(v)}
                          className={`flex-1 rounded-xl border px-2 py-1.5 text-xs font-bold transition-all ${
                            winRepeat === v
                              ? 'border-cyan-400/50 bg-cyan-400/10 text-cyan-300'
                              : 'border-white/10 bg-white/[0.03] text-slate-400'
                          }`}
                        >
                          {l}
                        </button>
                      ))}
                    </div>
                    {winRepeat === 'weekly' && (
                      <div className="flex justify-between">
                        {['日', '一', '二', '三', '四', '五', '六'].map((l, wd) => {
                          const on = winWeekdays.includes(wd);
                          return (
                            <button
                              key={wd}
                              type="button"
                              onClick={() =>
                                setWinWeekdays((prev) =>
                                  on
                                    ? prev.filter((x) => x !== wd)
                                    : [...prev, wd].sort(),
                                )
                              }
                              className={`h-8 w-8 rounded-lg border text-xs font-bold ${
                                on
                                  ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-300'
                                  : 'border-white/10 bg-white/[0.03] text-slate-400'
                              }`}
                            >
                              {l}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {winRepeat === 'once' && (
                      <input
                        type="date"
                        className="input"
                        style={{ colorScheme: 'dark' }}
                        value={winDate}
                        onChange={(e) => setWinDate(e.target.value)}
                      />
                    )}
                  </div>
                )}
              </div>

              {task && (
                <div>
                  <label className="label">总时长校准（分钟）</label>
                  <input
                    className="input"
                    inputMode="decimal"
                    value={targetMinutes}
                    onChange={(event) => setTargetMinutes(event.target.value)}
                    placeholder="例如：90"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">
                    保存后会自动调整额外校准值，使任务总耗时等于这个分钟数。
                  </p>
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
