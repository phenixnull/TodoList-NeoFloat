import { motion } from 'framer-motion';
import { AlarmClock, ArrowUpDown, Plus } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProgressRing from '../components/ProgressRing';
import TaskCard from '../components/TaskCard';
import { getTaskGroups } from '../../../app/src/domain/taskOrdering';
import { getTodayKey } from '../../../app/src/domain/streak';
import type { Task } from '../../../app/src/domain/types';
import { useStore } from '../data/store';
import type { RecordTarget } from '../components/DayRecordModal';

const GROUP_COLORS = ['#22d3ee', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#facc15', '#60a5fa', '#f87171', '#2dd4bf', '#c084fc'];

type Props = {
  onEditTask: (task: Task | null) => void;
  onOpenRecord: (target: RecordTarget, files?: File[]) => void;
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

export default function TodayPage({ onEditTask, onOpenRecord }: Props) {
  const { tasks, checkIns, now, updateTask, deleteTask, undoCheckIn, reorderTasks } = useStore();
  const today = getTodayKey(now);
  const [groupFilter, setGroupFilter] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('habitpulse.desktop.selectedGroups') ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>('all');
  const [ctxMenu, setCtxMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ group: string; x: number; y: number } | null>(null);
  const [renameModal, setRenameModal] = useState<{ group: string; name: string } | null>(null);
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
    if (groupFilter.length > 0) pool = pool.filter((t) => groupFilter.some((g) => t.customGroups?.includes(g)));
    if (statusFilter === 'active') pool = pool.filter((t) => !completedIds.has(t.id));
    if (statusFilter === 'done') pool = pool.filter((t) => completedIds.has(t.id));
    return pool;
  }, [allFlat, groupFilter, statusFilter, completedIds]);
  const filteredUnfinished = useMemo(() => filtered.filter((t) => !completedIds.has(t.id)), [filtered, completedIds]);
  const filteredFinished = useMemo(() => filtered.filter((t) => completedIds.has(t.id)), [filtered, completedIds]);
  const [sortDesc, setSortDesc] = useState(true);
  const checkInTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checkIns) {
      if (!map.has(c.taskId) || c.createdAt! > map.get(c.taskId)!) map.set(c.taskId, c.createdAt!);
    }
    return map;
  }, [checkIns]);
  const sortedUnfinished = useMemo(() => {
    return [...filteredUnfinished].sort((a, b) => {
      const ta = checkInTimeMap.get(a.id) ?? '';
      const tb = checkInTimeMap.get(b.id) ?? '';
      if (ta !== tb) return sortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }, [filteredUnfinished, checkInTimeMap, sortDesc]);
  const sortedFinished = useMemo(() => {
    return [...filteredFinished].sort((a, b) => {
      const ta = checkInTimeMap.get(a.id) ?? '';
      const tb = checkInTimeMap.get(b.id) ?? '';
      if (ta !== tb) return sortDesc ? tb.localeCompare(ta) : ta.localeCompare(tb);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    });
  }, [filteredFinished, checkInTimeMap, sortDesc]);
  const filteredCompletedCount = useMemo(() => filtered.filter((t) => completedIds.has(t.id)).length, [filtered, completedIds]);
  const filteredRatio = filtered.length ? filteredCompletedCount / filtered.length : 0;

  const renameGroup = useCallback((oldName: string, newName: string) => {
    if (!newName.trim() || customGroups.includes(newName.trim())) return;
    const next = storedGroups.map((g) => (g === oldName ? newName.trim() : g));
    setStoredGroups(next);
    localStorage.setItem('habitpulse.desktop.customGroups', JSON.stringify(next));
    void Promise.all(
      tasks
        .filter((t) => t.customGroups?.includes(oldName))
        .map((t) => updateTask(t.id, { customGroups: (t.customGroups ?? []).map((g) => (g === oldName ? newName.trim() : g)) })),
    );
    if (groupFilter.includes(oldName)) setGroupFilter((prev) => prev.map((g) => (g === oldName ? newName.trim() : g)));
  }, [storedGroups, customGroups, tasks, updateTask, groupFilter]);

  const deleteGroup = useCallback((name: string) => {
    const next = storedGroups.filter((g) => g !== name);
    setStoredGroups(next);
    localStorage.setItem('habitpulse.desktop.customGroups', JSON.stringify(next));
    void Promise.all(
      tasks
        .filter((t) => t.customGroups?.includes(name))
        .map((t) => updateTask(t.id, { customGroups: (t.customGroups ?? []).filter((g) => g !== name) })),
    );
    if (groupFilter.includes(name)) setGroupFilter((prev) => prev.filter((g) => g !== name));
  }, [storedGroups, tasks, updateTask, groupFilter]);

  const selectGroup = useCallback((g: string | null) => {
    setGroupFilter((prev) => {
      if (g === null) {
        localStorage.setItem('habitpulse.desktop.selectedGroups', '[]');
        return [];
      }
      const next = prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g];
      localStorage.setItem('habitpulse.desktop.selectedGroups', JSON.stringify(next));
      return next;
    });
  }, []);

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
  const ratio = filteredRatio;

  const dragTaskId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Ctrl+Z undo for check-in only (max 8 steps).
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        void undoCheckIn();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoCheckIn]);

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
      onDragStart={(e) => {
        dragTaskId.current = task.id;
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragEnd={() => {
        dragTaskId.current = null;
        setDragOverId(null);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (dragTaskId.current && dragTaskId.current !== task.id) {
          setDragOverId(task.id);
        }
      }}
      onDragLeave={() => {
        if (dragOverId === task.id) setDragOverId(null);
      }}
      onDrop={(e) => {
        e.preventDefault();
        const draggedId = e.dataTransfer.getData('text/plain');
        setDragOverId(null);
        dragTaskId.current = null;
        if (!draggedId || draggedId === task.id) return;
        const ids = filtered.map((t) => t.id);
        const from = ids.indexOf(draggedId);
        const to = ids.indexOf(task.id);
        if (from < 0 || to < 0 || from === to) return;
        const next = [...ids];
        const [moved] = next.splice(from, 1);
        if (moved) next.splice(to, 0, moved);
        void reorderTasks(next);
      }}
    >
      <div style={{ opacity: dragTaskId.current === task.id ? 0.35 : 1, transform: dragTaskId.current === task.id ? 'scale(0.96)' : 'scale(1)', transition: 'opacity 0.2s, transform 0.2s' }}>
        {dragOverId === task.id && <div className='absolute inset-0 rounded-2xl ring-2 ring-cyan-400/60 pointer-events-none' />}
      <TaskCard
        task={task}
        date={today}
        checked={completedIds.has(task.id)}
        onEdit={() => onEditTask(task)}
        onOpenDetail={() => onOpenRecord({ taskId: task.id, date: today })}
        onDropImages={(files) => onOpenRecord({ taskId: task.id, date: today }, files)}
      />
      </div>
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
              <span className="text-6xl font-black leading-none text-slate-50">{filteredCompletedCount}</span>
              <span className="mb-1 text-2xl font-bold text-slate-500">/ {filtered.length}</span>
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
        <TabButton active={groupFilter.length === 0} onClick={() => selectGroup(null)}>全部</TabButton>
        {customGroups.map((g) => (
          <TabButton
            key={g}
            active={groupFilter.includes(g)}
            color={GROUP_COLORS[customGroups.indexOf(g) % GROUP_COLORS.length]}
            onClick={() => selectGroup(g)}
            onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setGroupMenu({ group: g, x: e.clientX, y: e.clientY }); }}
          >
            {g}
          </TabButton>
        ))}
        <button
          onClick={() => setAddModal(true)}
          className="border-l border-white/[0.06] px-3 text-slate-500 hover:bg-white/[0.03] hover:text-cyan-300"
          title="新建分组"
        >
          <Plus size={15} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <FilterChip small active={statusFilter === 'all'} onClick={() => setStatusFilter('all')}>全部</FilterChip>
        <FilterChip small active={statusFilter === 'active'} onClick={() => setStatusFilter('active')}>进行中</FilterChip>
        <FilterChip small active={statusFilter === 'done'} onClick={() => setStatusFilter('done')}>已完成</FilterChip>
        <button
          onClick={() => setSortDesc((prev) => !prev)}
          className="ml-1 flex h-7 items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 text-[11px] font-bold text-slate-400 transition-all hover:text-slate-200"
          title={sortDesc ? '按打卡时间倒序' : '按打卡时间正序'}
        >
          <ArrowUpDown size={11} />
          {sortDesc ? '最新在上' : '最早在上'}
        </button>
      </div>

      {/* Unfinished */}
      {statusFilter !== 'done' && sortedUnfinished.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-slate-200">
              进行中 <span className="ml-1 text-slate-500">{sortedUnfinished.length}</span>
            </h3>
          <button onClick={() => onEditTask(null)} className="btn-ghost px-3 py-1.5 text-xs">
            <Plus size={13} /> 新建任务
          </button>
        </div>
          <div className="flex flex-col gap-2.5">{sortedUnfinished.map(renderCard)}</div>
        </section>
      )}

      {/* Finished */}
      {statusFilter !== 'active' && sortedFinished.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-extrabold text-slate-200">
            已完成 <span className="ml-1 text-slate-500">{sortedFinished.length}</span>
          </h3>
          <div className="flex flex-col gap-2.5">{sortedFinished.map(renderCard)}</div>
        </section>
      )}

      {filtered.length === 0 && (
        <p className="text-sm text-slate-500">没有符合条件的任务</p>
      )}

      {/* Group context menu — right-click on tab */}
      {groupMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setGroupMenu(null)} onContextMenu={(e) => { e.preventDefault(); setGroupMenu(null); }} />
          <div
            className="fixed z-50 min-w-[140px] rounded-xl border border-white/10 bg-slate-900/95 py-1 shadow-2xl backdrop-blur-sm"
            style={{ left: groupMenu.x, top: groupMenu.y }}
          >
            <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{groupMenu.group}</p>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-slate-300 hover:bg-white/[0.06]"
              onClick={() => { setRenameModal({ group: groupMenu.group, name: groupMenu.group }); setGroupMenu(null); }}
            >
              ✏️ 重命名
            </button>
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-rose-400 hover:bg-rose-500/10"
              onClick={() => { deleteGroup(groupMenu.group); setGroupMenu(null); }}
            >
              🗑 删除分组
            </button>
          </div>
        </>
      )}

      {/* Rename group modal */}
      {renameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setRenameModal(null)}>
          <div className="glass-strong w-[360px] p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-extrabold text-slate-100">重命名分组</p>
            <input
              autoFocus
              className="input w-full"
              value={renameModal.name}
              onChange={(e) => setRenameModal({ ...renameModal, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') { renameGroup(renameModal.group, renameModal.name); setRenameModal(null); } }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => setRenameModal(null)}>取消</button>
              <button className="btn-accent px-3 py-1.5 text-xs" onClick={() => { renameGroup(renameModal.group, renameModal.name); setRenameModal(null); }} disabled={!renameModal.name.trim()}>确认</button>
            </div>
          </div>
        </div>
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
            <button
              className="w-full px-3 py-1.5 text-left text-xs font-semibold text-slate-200 hover:bg-white/[0.06]"
              onClick={() => { onEditTask(ctxTask); setCtxMenu(null); }}
            >
              ✏️ 编辑
            </button>
            <div className="my-1 border-t border-white/[0.06]" />
            <button
              className="w-full px-3 py-1.5 text-left text-xs text-rose-400 hover:bg-rose-500/10"
              onClick={() => { void deleteTask(ctxTask.id); setCtxMenu(null); }}
            >
              🗑 删除
            </button>
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

function TabButton({ active, onClick, onContextMenu, color, children }: {
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  color?: string;
  children: React.ReactNode;
}) {
  const c = color ?? '#22d3ee';
  return (
    <button
      onClick={onClick}
      onContextMenu={onContextMenu}
      style={active ? { backgroundColor: c + '1a', color: c, boxShadow: 'inset 0 -3px 0 ' + c + '80' } : undefined}
      className={'flex-1 px-4 py-3.5 text-sm font-extrabold transition-all ' + (active ? '' : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200')}
    >
      {children}
    </button>
  );
}
