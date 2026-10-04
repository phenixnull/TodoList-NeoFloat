import { Check, Play, Square } from 'lucide-react';
import {
  calculateTimeSegmentsDurationForDate,
  formatDuration,
  isTimerRunning,
} from '../../../app/src/domain/timeTracking';
import type { Task } from '../../../app/src/domain/types';
import { extractImageFiles } from '../hooks/useImageCapture';
import { useStore } from '../data/store';
import TaskIcon from './TaskIcon';
import { useRef } from 'react';

const GROUP_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#facc15', '#60a5fa', '#f87171', '#2dd4bf', '#c084fc'];

function getGroupColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return GROUP_COLORS[Math.abs(hash) % GROUP_COLORS.length];
}

type Props = {
  task: Task;
  date: string;
  checked: boolean;
  checkedAt?: string | null;
  onEdit: () => void;
  onOpenDetail: () => void;
  onDropImages?: (files: File[]) => void;
  compact?: boolean;
};

export default function TaskCard({
  task,
  date,
  checked,
  checkedAt,
  onEdit,
  onOpenDetail,
  onDropImages,
  compact = false,
}: Props) {
  const { now, toggleCheckIn, toggleTimer, busy } = useStore();
  const total = calculateTimeSegmentsDurationForDate(task, date, now.getTime());
  const running = isTimerRunning(task);
  const bodyRef = useRef<HTMLDivElement>(null);

  // A reorder drag and the toggle click share the same element. Some browsers
  // synthesize a click on the source right after a native drag ends, which would
  // flip the check-in unexpectedly. Swallow only that immediate click; a genuine
  // later click is a separate gesture and is left intact.
  const suppressNextClick = () => {
    const el = bodyRef.current;
    if (!el) return;
    const swallow = (ce: MouseEvent) => {
      ce.preventDefault();
      ce.stopPropagation();
    };
    el.addEventListener('click', swallow, { capture: true, once: true });
    window.setTimeout(() => el.removeEventListener('click', swallow), 120);
  };

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
        ref={bodyRef}
        className="min-w-0 flex-1 cursor-pointer select-none"
        onClick={() => void toggleCheckIn(task.id, date)}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', task.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => suppressNextClick()}
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
        {!compact && (
          <div className={`text-[11px] font-semibold ${checked ? 'text-emerald-400' : 'text-slate-500'}`}>
            {checked
              ? `已打卡 ${checkedAt ? new Date(checkedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : ''}`
              : '未打卡'}
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
