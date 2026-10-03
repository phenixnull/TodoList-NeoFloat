import { Minus, MonitorSmartphone, PictureInPicture2, Square, X } from 'lucide-react';

type Props = {
  title: string;
  mode: 'full' | 'compact';
};

export default function TitleBar({ title, mode }: Props) {
  const api = window.hpDesktop;

  return (
    <div className="app-drag flex h-11 shrink-0 items-center justify-between pl-4 pr-2">
      <div className="flex items-center gap-2.5">
        <img src="../../../build/icon-256.png" alt="HabitPulse" className="h-6 w-6 rounded-lg" />
        <span className="text-sm font-bold tracking-wide text-slate-100">HabitPulse</span>
        <span className="text-xs font-medium text-slate-500">· {title}</span>
      </div>

      <div className="app-no-drag flex items-center gap-1">
        <button
          className="flex h-8 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
          title={mode === 'full' ? '切换为悬浮窗' : '切换为完整窗口'}
          onClick={() => api?.setMode(mode === 'full' ? 'compact' : 'full')}
        >
          {mode === 'full' ? <PictureInPicture2 size={15} /> : <MonitorSmartphone size={16} />}
        </button>
        <button
          className="flex h-8 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
          title="最小化"
          onClick={() => api?.minimize()}
        >
          <Minus size={15} />
        </button>
        {mode === 'full' && (
          <button
            className="flex h-8 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100"
            title="最大化"
            onClick={() => api?.toggleMaximize()}
          >
            <Square size={12} />
          </button>
        )}
        <button
          className="flex h-8 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-rose-500 hover:text-white"
          title="关闭"
          onClick={() => api?.close()}
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}
