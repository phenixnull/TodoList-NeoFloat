import { motion } from 'framer-motion';
import { AlarmClock, Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
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
  const { tasks, checkIns, now, updateTask } = useStore();
  const today = getTodayKey(now);
  const [groupFilter, setGroupFilter] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');
  const [ctxMenu, setCtxMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const completedIds = useMemo(
    () => new Set(checkIns.filter((c) => c.date === today).map((c) => c.taskId)),
    [checkIns, today],
  );
  const groups = useMemo(() => getTaskGroups(tasks, completedIds), [tasks, completedIds]);
  const [storedGroups, setStoredGroups] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('habitpulse.desktop.customGroups') ?? '[]') as string[];
    } catch {
      return [];
    }
  });
  const customGroups = useMemo(
    () => [...new Set([...storedGroups, ...tasks.flatMap((t) => t.customGroups ?? []).filter((g): g is string => Boolean(g))])],
    [storedGroups, tasks],
  );
  const allFlat = useMemo(() => [...groups.unfinished, ...groups.finished], [groups]);
  const filtered = useMemo(() => {
    let pool = allFlat;
    if (groupFilter !== null) pool = pool.filter((t) => t.customGroups?.includes(groupFilter));
    if (statusFilter === 'active') pool = pool.filter((t) => !completedIds.has(t.id));
    if (statusFilter === 'done') pool = pool.filter((t) => completedIds.has(t.id));
    return pool;
  }, [allFlat, groupFilter, statusFilter, completedIds]);
  const filteredUnfinished = useMemo(() => filtered.filter((t) => !completedIds.has(t.id)), [filtered, completedIds]);
  const filteredFinished = useMemo(() => filtered.filter((t) => completedIds.has(t.id)), [filtered, completedIds]);

  const moveToGroup = useCallback((taskId: string, groups: string[]) => {
    void updateTask(taskId, { customGroups: groups });
  }, [updateTask]);

  const confirmAddGroup = useCallback(() => {
    const trimmed = newGroupName.trim();
    if (!trimmed || customGroups.includes(trimmed)) return;
    const next = [...storedGroups, trimmed];
    setStoredGroups(next);
    localStorage.setItem('habitpulse.desktop.customGroups', JSON.stringify(next));
    setNewGroupName('');
    setAddModal(false);
  }, [newGroupName, customGroups, storedGroups]);

  const ctxTask = ctxMenu ? tasks.find((t) => t.id === ctxMenu.taskId) : undefined;
  const ratio = tasks.length ? completedIds.size / tasks.length : 0;

  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const remaining = midnight.getTime() - now.getTime();
  const hh = Math.floor(remaining / 3_600_000);
  const mm = Math.floor((remaining % 3_600_000) / 60_000);
  const ss = Math.floor((remaining % 60_000) / 1000);

  const renderCard = (task: Task) => (
    <div
      key={task.id}
      onContextMenu={(e) => {
        e.preventDefault();
        setCtxMenu({ taskId: task.id, x: e.clientX, y: e.clientY });
      }}
    >
      <TaskCard
        task={task}
        date={today}
        checked={completedIds.has(task.id)}
        onEdit={() => onEditTask(task)}
        onOpenDetail={() => onOpenRecord({ taskId: task.id, date: today })}
        onDropImages={(files) => onOpenRecord({ taskId: task.id, date: today }, files)}
      />
    </div>
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

      {/* Group tabs — full-width horizontal drawer */}
      <div className="glass flex items-stretch overflow-hidden rounded-2xl">
        <TabButton active={groupFilter === null} onClick={() => setGroupFilter(null)}>全部</TabButton>
        {customGroups.map((g) => (
          <TabButton key={g} active={groupFilter === g} onClick={() => setGroupFilter(g)}>{g}</TabButton>
        ))}
        <button
          onClick={() => setAddModal(true)}
          className="border-l border-white/[0.06] px-3 text-slate-500 hover:bg-white/[0.03] hover:text-cyan-300"
          title="新建分组"
        >
          <Plus size={15} />
        </button>
      </div>

      {/* Status sub-filter */}
      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip small active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>全部</FilterChip>
        <FilterChip small active={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>进行中</FilterChip>
        <FilterChip small active={statusFilter === 'done'} onClick={() => setStatusFilter('done')}>已完成</FilterChip>
      </div>

      {/* Unfinished */}
      {statusFilter !== 'done' && filteredUnfinished.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-200">
              进行中 <span className="ml-1 text-slate-500">{filteredUnfinished.length}</span>
            </h3>
          <button onClick={() => onEditTask(null)} className="btn-ghost px-3 py-1.5 text-xs">
            <Plus size={13} /> 新建任务
          </button>
        </div>
          <div className="flex flex-col gap-2.5">{filteredUnfinished.map(renderCard)}</div>
        </section>
      )}

      {/* Finished */}
      {statusFilter !== 'active' && filteredFinished.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-extrabold text-slate-200">
            已完成 <span className="ml-1 text-slate-500">{filteredFinished.length}</span>
          </h3>
          <div className="flex flex-col gap-2.5">{filteredFinished.map(renderCard)}</div>
        </section>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500">没有符合条件的任务</p>
      )}

      {/* Add group modal */}
      {addModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setAddModal(false)}>
          <div className="glass-strong w-[360px] p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-extrabold text-slate-100">新建分组</p>
            <input
              autoFocus
              className="input w-full"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmAddGroup(); }}
              placeholder="输入分组名称"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setAddModal(false)}>取消</button>
              <button className="btn-accent px-3 py-1.5 text-xs" onClick={confirmAddGroup} disabled={!newGroupName.trim()}>创建</button>
            </div>
          </div>
        </div>
      )}

      {/* Global context menu — rendered once at page level */}
      {ctxMenu && ctxTask && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-50 min-w-[160px] rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur-sm"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              移动到分组 · {ctxTask.name}
            </p>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/[0.06]"
              onClick={() => { moveToGroup(ctxTask.id, []); setCtxMenu(null); }}
            >
              {(ctxTask.customGroups ?? []).length === 0 ? '✓ ' : ''}未分组
            </button>
            {customGroups.map((g) => (
              <button
                key={g}
                className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/[0.06]"
                onClick={() => { moveToGroup(ctxTask.id, (ctxTask.customGroups ?? []).includes(g) ? (ctxTask.customGroups ?? []).filter((x) => x !== g) : [...(ctxTask.customGroups ?? []), g]); setCtxMenu(null); }}
              >
                {(ctxTask.customGroups ?? []).includes(g) ? '✓ ' : ''}{g}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FilterChip({ active, small, onClick, children }: {
  active: boolean;
  small?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border transition-all ${
        small ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1.5 text-xs'
      } font-bold ${
        active
          ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
          : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}

function TabButton({ active, onClick, children }: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 px-4 py-3.5 text-sm font-extrabold transition-all ${
        active
          ? 'bg-cyan-400/15 text-cyan-300 shadow-[inset_0_-3px_0_rgba(34,211,238,0.5)]'
          : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
      }`}
    >
      {children}
    </button>
  );
}
