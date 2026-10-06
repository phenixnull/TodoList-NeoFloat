import { useMemo, useState } from 'react';
import {
  calculateTimeSegmentsDurationForDate,
} from '../../../app/src/domain/timeTracking';
import { buildHeatmap, type HeatmapDay } from '../../../app/src/domain/heatmap';
import { getTodayKey, toLocalDateKey } from '../../../app/src/domain/streak';
import { useStore } from '../data/store';

const WEEKS = 24;

export default function HeatmapBlock() {
  const { tasks, checkIns, now } = useStore();
  const activeTasks = useMemo(() => tasks.filter((t) => !t.deletedAt), [tasks]);
  // '' means "all tasks".
  const [selectedId, setSelectedId] = useState('');
  const task = selectedId ? activeTasks.find((t) => t.id === selectedId) : undefined;
  const today = getTodayKey(now);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const grid = useMemo(() => {
    if (!activeTasks.length) return [];

    // Build the date window.
    const end = new Date(`${today}T00:00:00`);
    const start = new Date(end);
    start.setDate(start.getDate() - (WEEKS * 7 - 1));

    const days: HeatmapDay[] = [];
    const cursor = new Date(start);

    while (cursor <= end) {
      const dateKey = toLocalDateKey(cursor);

      let completed: boolean;
      let failed: boolean;
      let durationMs: number;

      if (task) {
        completed = checkIns.some((c) => c.taskId === task.id && c.date === dateKey);
        failed = checkIns.some((c) => c.taskId === task.id && c.date === dateKey && c.status === 'failed');
        durationMs = calculateTimeSegmentsDurationForDate(task, dateKey, now.getTime());
      } else {
        // Aggregate across every active task.
        const dayCheckins = checkIns.filter((c) => c.date === dateKey);
        failed = dayCheckins.length > 0 && dayCheckins.every((c) => c.status === 'failed');
        completed = dayCheckins.length > 0;
        durationMs = activeTasks.reduce(
          (sum, t) => sum + calculateTimeSegmentsDurationForDate(t, dateKey, now.getTime()),
          0,
        );
      }

      days.push({ date: dateKey, completed, failed, durationMs });
      cursor.setDate(cursor.getDate() + 1);
    }

    return buildHeatmap(days, WEEKS, today);
  }, [task, activeTasks, checkIns, today, now]);

  const monthLabels = useMemo(() => {
    const labels: { index: number; text: string }[] = [];
    let lastMonth = '';
    grid.forEach((week, index) => {
      const month = week[0].date.slice(0, 7);
      if (month !== lastMonth) {
        labels.push({ index, text: `${week[0].date.slice(2, 4)}/${week[0].date.slice(5, 7)}` });
        lastMonth = month;
      }
    });
    return labels;
  }, [grid]);

  const detail = useMemo(() => {
    if (!selectedDate) return null;
    const cell = grid.flat().find((c) => c.date === selectedDate);
    if (!cell) return null;

    const dayCheckins = task
      ? checkIns.filter((c) => c.taskId === task.id && c.date === selectedDate)
      : checkIns.filter((c) => c.date === selectedDate);

    const checkinTasks = dayCheckins
      .map((c) => {
        const t = activeTasks.find((at) => at.id === c.taskId);
        return {
          name: t?.name ?? '未知',
          color: t?.color ?? '#22d3ee',
          time: c.createdAt ? new Date(c.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
        };
      });

    return {
      date: selectedDate,
      weekday: new Date(`${selectedDate}T00:00:00`).toLocaleDateString('zh-CN', { weekday: 'long' }),
      completed: cell.status === 'complete',
      partial: cell.status === 'partial',
      failed: cell.status === 'failed',
      durationMs: cell.durationMs,
      checkinTasks,
      taskName: task?.name,
    };
  }, [selectedDate, grid, checkIns, task, activeTasks]);

  return (
    <div className="glass p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-extrabold text-slate-100">坚持热力图 · 近 24 周</h3>
        <select
          className="input w-52 py-2 text-xs"
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          <option value="">全部任务</option>
          {activeTasks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[640px]">
          <div className="relative ml-0 h-5">
            {monthLabels.map((label) => (
              <span
                key={label.index}
                className="absolute text-[10px] font-semibold text-slate-500"
                style={{ left: label.index * 17 }}
              >
                {label.text}
              </span>
            ))}
          </div>
          <div className="flex gap-[3px]">
            {grid.map((week, weekIndex) => (
              <div key={weekIndex} className="flex flex-col gap-[3px]">
                {week.map((cell) => {
                  const style = cellStyle(cell.level, cell.status);
                  return (
                    <div
                      key={cell.date}
                      onClick={() => setSelectedDate((prev) => (prev === cell.date ? null : cell.date))}
                      className={`h-[14px] w-[14px] cursor-pointer rounded-[3px] transition-all hover:scale-125 ${
                        selectedDate === cell.date ? 'ring-2 ring-cyan-400 ring-offset-1 ring-offset-slate-900' : ''
                      }`}
                      style={style}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

          <div className="mt-3 flex items-center justify-end gap-1.5 text-[10px] text-slate-500">
        <span>少</span>
        {[0, 1, 2, 3, 4].map((level) => (
          <span
            key={level}
            className="h-[12px] w-[12px] rounded-[3px]"
            style={cellStyle(level as 0 | 1 | 2 | 3 | 4, level === 0 ? 'empty' : 'complete')}
          />
        ))}
        <span>多</span>
      </div>

      {detail && (
        <div className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-extrabold text-slate-100">
              {detail.date} {detail.weekday}
              {detail.taskName && <span className="ml-2 text-xs font-semibold text-cyan-300">{detail.taskName}</span>}
            </p>
            <button onClick={() => setSelectedDate(null)} className="text-xs text-slate-500 hover:text-slate-300">✕</button>
          </div>
          <div className="mt-3 flex items-start justify-between gap-6">
            <div>
              <p className={`text-sm font-bold ${detail.completed ? 'text-emerald-400' : detail.failed ? 'text-red-400' : detail.partial ? 'text-cyan-400' : 'text-slate-500'}`}>
                {detail.completed ? '✅ 已完成打卡' : detail.failed ? '❌ 打卡失败' : detail.partial ? '⏱ 有计时记录' : '无记录'}
              </p>
              {detail.durationMs > 0 && (
                <p className="mt-1 font-mono text-sm text-emerald-300">⏱ {formatMs(detail.durationMs)}</p>
              )}
            </div>
            {detail.checkinTasks.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {detail.checkinTasks.map((ct, i) => (
                  <span key={i} className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] text-slate-300">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ct.color }} />
                    {ct.name}
                    {ct.time && <span className="text-slate-500">{ct.time}</span>}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function cellStyle(
  level: 0 | 1 | 2 | 3 | 4,
  status: 'empty' | 'partial' | 'complete' | 'failed',
): React.CSSProperties {
  if (status === 'empty') {
    return { backgroundColor: 'rgba(2,6,23,0.78)' };
  }

  if (status === 'failed') {
    return { backgroundColor: 'rgba(239,68,68,0.88)' };
  }

  const rgb = status === 'complete' ? '34,197,94' : '56,189,248';
  const alphas = [0.24, 0.4, 0.58, 0.76, 0.95];
  return { backgroundColor: `rgba(${rgb},${alphas[level]})` };
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}
