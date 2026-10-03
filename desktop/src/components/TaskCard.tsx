import { Check, Pencil, Play, Square, StickyNote } from 'lucide-react';
import {
  calculateTimeSegmentsDurationForDate,
  formatDuration,
  isTimerRunning,
} from '../../../app/src/domain/timeTracking';
import type { Task } from '../../../app/src/domain/types';
import { extractImageFiles } from '../hooks/useImageCapture';
import { useStore } from '../data/store';
import TaskIcon from './TaskIcon';

type Props = {
  task: Task;
  date: string;
  checked: boolean;
  onEdit: () => void;
  onOpenDetail: () => void;
  onDropImages?: (files: File[]) => void;
  compact?: boolean;
};

export default function TaskCard({
  task,
  date,
  checked,
  onEdit,
  onOpenDetail,
  onDropImages,
  compact = false,
}: Props) {
  const { now, toggleCheckIn, toggleTimer, busy } = useStore();
  const total = calculateTimeSegmentsDurationForDate(task, date, now.getTime());
  const running = isTimerRunning(task);

  return (
    <div
      onDragOver={
        onDropImages
          ? (event) => {
              if (event.dataTransfer.types?.includes('Files')) event.preventDefault();
            }
          : undefined
      }
      onDrop={
        onDropImages
          ? (event) => {
              const files = extractImageFiles(event.dataTransfer);
              if (files.length) {
                event.preventDefault();
                onDropImages(files);
              }
            }
          : undefined
      }
      className={`glass relative flex items-center gap-3 ${compact ? 'px-3 py-2.5' : 'px-4 py-3.5'} ${
        checked ? 'border-emerald-400/25 bg-emerald-400/[0.06]' : ''
      }`}
    >
      <div
        className="flex shrink-0 items-center justify-center rounded-xl font-black"
        style={{
          width: compact ? 32 : 42,
          height: compact ? 32 : 42,
          backgroundColor: `${task.color}22`,
          overflow: 'hidden',
        }}
      >
        <TaskIcon task={task} color={task.color} size={compact ? 28 : 38} />
      </div>

      <div
        className="min-w-0 flex-1 cursor-pointer select-none"
        onClick={() => void toggleCheckIn(task.id, date)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', task.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
      >
        <div className="flex items-center gap-2">
          <span className={`truncate font-bold ${compact ? 'text-[13px]' : 'text-sm'} text-slate-100`}>
            {task.name}
          </span>
          {running && (
            <span className="flex items-center gap-1 rounded-full bg-cyan-400/10 px-2 py-0.5 text-[10px] font-bold text-cyan-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-300" />
              计时中
            </span>
          )}
        </div>
        <div className={`mt-0.5 font-mono ${compact ? 'text-[11px]' : 'text-xs'} text-slate-400`}>
          {formatDuration(total)}
        </div>
        {!compact && (task.customGroups?.length ?? 0) > 0 && (
          <div className="mt-1 flex items-center gap-1 overflow-hidden" style={{ maxHeight: 22 }}>
            {(task.customGroups ?? []).map((g) => (
              <span
                key={g}
                className="inline-flex shrink-0 items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-1.5 py-0 text-[10px] font-semibold text-slate-400"
              >
                {g}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          title={running ? '停止计时' : '开始计时'}
          disabled={busy}
          onClick={() => void toggleTimer(task.id)}
          className={`flex h-8 w-8 items-center justify-center rounded-lg border transition-all disabled:opacity-50 ${
            running
              ? 'border-cyan-400/40 bg-cyan-400/15 text-cyan-300'
              : 'border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/10'
          }`}
        >
          {running ? <Square size={14} fill="currentColor" /> : <Play size={14} />}
        </button>

        <button
          title="当日记录"
          onClick={onOpenDetail}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition-all hover:bg-white/10"
        >
          <StickyNote size={14} />
        </button>

        {!compact && (
          <button
            title="编辑任务"
            onClick={onEdit}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-300 transition-all hover:bg-white/10"
          >
            <Pencil size={14} />
          </button>
        )}

        <button
          title={checked ? '取消打卡' : '完成打卡'}
          disabled={busy}
          onClick={() => void toggleCheckIn(task.id, date)}
          className={`flex items-center justify-center rounded-full transition-all disabled:opacity-50 ${
            checked
              ? 'bg-emerald-400 text-slate-950 shadow-[0_0_14px_rgba(52,211,153,0.5)]'
              : 'border-2 border-white/20 text-transparent hover:border-emerald-400/70'
          }`}
          style={{ width: compact ? 28 : 34, height: compact ? 28 : 34 }}
        >
          <Check size={compact ? 15 : 18} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
}
