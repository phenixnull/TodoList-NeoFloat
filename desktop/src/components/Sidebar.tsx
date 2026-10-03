import {
  CalendarCheck2,
  ChartNoAxesCombined,
  History,
  ListTodo,
  Settings,
} from 'lucide-react';
import type { PageKey } from '../App';

const NAV: { key: PageKey; label: string; icon: typeof ListTodo }[] = [
  { key: 'today', label: '今日打卡', icon: CalendarCheck2 },
  { key: 'tasks', label: '任务管理', icon: ListTodo },
  { key: 'stats', label: '数据统计', icon: ChartNoAxesCombined },
  { key: 'history', label: '历史记录', icon: History },
  { key: 'settings', label: '设置', icon: Settings },
];

type Props = {
  current: PageKey;
  online: boolean;
  onNavigate: (page: PageKey) => void;
};

export default function Sidebar({ current, online, onNavigate }: Props) {
  return (
    <aside className="flex w-56 shrink-0 flex-col border-r border-white/[0.07] bg-white/[0.02] px-3 py-3">
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const selected = current === item.key;
          const Icon = item.icon;

          return (
            <button
              key={item.key}
              onClick={() => onNavigate(item.key)}
              className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all ${
                selected
                  ? 'bg-cyan-400/10 text-cyan-300'
                  : 'text-slate-400 hover:bg-white/[0.05] hover:text-slate-200'
              }`}
            >
              {selected && (
                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-cyan-400 shadow-glow" />
              )}
              <Icon size={18} strokeWidth={selected ? 2.4 : 2} />
              {item.label}
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2.5">
        <span
          className={`h-2 w-2 rounded-full ${
            online ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-rose-400'
          }`}
        />
        <span className="text-xs font-medium text-slate-400">
          {online ? '服务已连接' : '离线 · 使用缓存'}
        </span>
      </div>
    </aside>
  );
}
