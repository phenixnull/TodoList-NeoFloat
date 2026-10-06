import { motion } from 'framer-motion';
import { AlarmClock, ArrowUpDown, CircleCheck, CircleX, Pencil, Plus, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ProgressRing from '../components/ProgressRing';
import TaskCard from '../components/TaskCard';
import { getTaskGroups, matchesGroupFilter, mergeVisibleReorder } from '../../../app/src/domain/taskOrdering';
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
  const { tasks, checkIns, now, updateTask, deleteTask, undoCheckIn, reorderTasks, setCheckInStatus, loading } = useStore();
  const today = getTodayKey(now);
  const [groupFilter, setGroupFilter] = useState<string[]>(() => {
    try { const v = JSON.parse(localStorage.getItem('habitpulse.desktop.selectedGroups') ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'done'>(() => {
    try { return (localStorage.getItem('habitpulse.desktop.statusFilter') as 'all' | 'active' | 'done') ?? 'all'; } catch { return 'all'; }
  });
  const [ctxMenu, setCtxMenu] = useState<{ taskId: string; x: number; y: number } | null>(null);
  const [groupMenu, setGroupMenu] = useState<{ group: string; x: number; y: number } | null>(null);
  const [renameModal, setRenameModal] = useState<{ group: string; name: string } | null>(null);
  const [addModal, setAddModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const completedIds = useMemo(
    () => new Set(checkIns.filter((c) => c.date === today).map((c) => c.taskId)),
    [checkIns, today],
  );
  const successIds = useMemo(
    () => new Set(checkIns.filter((c) => c.date === today && c.status !== 'failed').map((c) => c.taskId)),
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
    const groupPool = groupFilter.length === 0
      ? allFlat
      : allFlat.filter((t) => matchesGroupFilter(t, groupFilter));
    let pool = groupPool;
    if (statusFilter === 'active') pool = pool.filter((t) => !completedIds.has(t.id));
    if (statusFilter === 'done') pool = pool.filter((t) => completedIds.has(t.id));
    return pool;
  }, [allFlat, groupFilter, statusFilter, completedIds]);
  const filteredUnfinished = useMemo(() => filtered.filter((t) => !completedIds.has(t.id)), [filtered, completedIds]);
  const filteredFinished = useMemo(() => filtered.filter((t) => completedIds.has(t.id)), [filtered, completedIds]);
  const groupFiltered = useMemo(() => (groupFilter.length === 0
    ? allFlat
    : allFlat.filter((t) => matchesGroupFilter(t, groupFilter))), [allFlat, groupFilter]);
  const [sortDesc, setSortDesc] = useState(true);
  const checkInTimeMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of checkIns) {
      if (!map.has(c.taskId) || c.createdAt! > map.get(c.taskId)!) map.set(c.taskId, c.createdAt!);
    }
    return map;
  }, [checkIns]);
  // Manual order is authoritative: dragging updates sortOrder and must stick.
  const byManualOrder = useCallback((a: Task, b: Task) =>
    (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    || new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(), []);
  const sortedUnfinished = useMemo(
    () => [...filteredUnfinished].sort(byManualOrder),
    [filteredUnfinished, byManualOrder],
  );
  const sortedFinished = useMemo(
    () => [...filteredFinished].sort(byManualOrder),
    [filteredFinished, byManualOrder],
  );
  // Recency ordering used only when the user taps the sort button; it is then
  // persisted into sortOrder so it survives refresh and syncs to other devices.
  const recencyIds = useCallback((list: Task[], desc: boolean) =>
    [...list].sort((a, b) => {
      const ta = checkInTimeMap.get(a.id) ?? '';
      const tb = checkInTimeMap.get(b.id) ?? '';
      if (ta !== tb) return desc ? tb.localeCompare(ta) : ta.localeCompare(tb);
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
    }).map((t) => t.id), [checkInTimeMap]);
  const onSortPress = useCallback(() => {
    const next = !sortDesc;
    setSortDesc(next);
    void reorderTasks([
      ...recencyIds(groups.unfinished, next),
      ...recencyIds(groups.finished, next),
    ]);
  }, [sortDesc, recencyIds, groups, reorderTasks]);
  const groupFilteredCompletedCount = useMemo(() => groupFiltered.filter((t) => successIds.has(t.id)).length, [groupFiltered, successIds]);
  const filteredRatio = groupFiltered.length ? groupFilteredCompletedCount / groupFiltered.length : 0;

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

  const reorderGroups = useCallback((draggedGroup: string, targetGroup: string) => {
    if (draggedGroup === targetGroup) return;
    const order = [...customGroups];
    const from = order.indexOf(draggedGroup);
    const to = order.indexOf(targetGroup);
    if (from < 0 || to < 0) return;

    const [moved] = order.splice(from, 1);
    if (!moved) return;
    order.splice(to, 0, moved);

    setStoredGroups(order);
    localStorage.setItem('habitpulse.desktop.customGroups', JSON.stringify(order));
  }, [customGroups]);

  const ctxTask = ctxMenu ? tasks.find((t) => t.id === ctxMenu.taskId) : undefined;
  const ctxStatus = ctxTask ? checkIns.find((c) => c.taskId === ctxTask.id && c.date === today)?.status ?? 'success' : 'success';
  const ratio = filteredRatio;

  const dragTaskId = useRef<string | null>(null);
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [tabDragGroup, setTabDragGroup] = useState<string | null>(null);
  const [tabOverGroup, setTabOverGroup] = useState<string | null>(null);
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
        const group = completedIds.has(draggedId) ? 'finished' : 'unfinished';
        const visibleIds = filtered.filter((t) => (completedIds.has(t.id) ? group === 'finished' : group === 'unfinished')).map((t) => t.id);
        const from = visibleIds.indexOf(draggedId);
        const to = visibleIds.indexOf(task.id);
        if (from < 0 || to < 0 || from === to) return;
        const fullIds = (group === 'finished' ? groups.finished : groups.unfinished).map((t) => t.id);
        void reorderTasks(mergeVisibleReorder(fullIds, visibleIds, from, to));
      }}
    >
      <div style={{ opacity: dragTaskId.current === task.id ? 0.35 : 1, transform: dragTaskId.current === task.id ? 'scale(0.96)' : 'scale(1)', transition: 'opacity 0.2s, transform 0.2s' }}>
        {dragOverId === task.id && <div className='absolute inset-0 rounded-2xl ring-2 ring-cyan-400/60 pointer-events-none' />}
      <TaskCard
        task={task}
        date={today}
        checked={completedIds.has(task.id)}
        checkInStatus={checkIns.find((c) => c.taskId === task.id && c.date === today)?.status ?? 'success'}
        onSetCheckInStatus={setCheckInStatus}
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
              <span className="text-6xl font-black leading-none text-slate-50">{Math.min(groupFilteredCompletedCount, groupFiltered.length)}</span>
              <span className="mb-1 text-2xl font-bold text-slate-500">/ {groupFiltered.length}</span>
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

      {/* Group tabs — full-width horizontal drawer with mouse drag-to-scroll */}
      <div
        ref={tabBarRef}
        className="glass flex items-stretch overflow-x-auto overflow-y-hidden rounded-2xl"
        style={{ scrollbarWidth: 'none' }}
        onMouseDown={(e) => {
          const el = tabBarRef.current;
          if (!el) return;
          // Native tab dragging has its own reorder gesture. Keep container
          // drag-to-scroll for empty space, the fixed "全部" tab and overflow.
          if ((e.target as HTMLElement).closest('[data-group-tab="draggable"]')) return;
          const startX = e.clientX;
          const startScroll = el.scrollLeft;
          let moved = false;
          const onMove = (ev: MouseEvent) => {
            if (Math.abs(ev.clientX - startX) > 5) moved = true;
            el.scrollLeft = startScroll - (ev.clientX - startX);
          };
          const onUp = () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
            // A drag must not also select the tab under the cursor.
            if (moved) {
              const swallow = (ce: MouseEvent) => {
                ce.preventDefault();
                ce.stopPropagation();
              };
              el.addEventListener('click', swallow, { capture: true, once: true });
              window.setTimeout(() => el.removeEventListener('click', swallow), 120);
            }
          };
          window.addEventListener('mousemove', onMove);
          window.addEventListener('mouseup', onUp);
        }}
      >
        <TabButton active={groupFilter.length === 0} onClick={() => selectGroup(null)}>全部</TabButton>
        {customGroups.map((g) => (
          <TabButton
            key={g}
            active={groupFilter.includes(g)}
            color={GROUP_COLORS[customGroups.indexOf(g) % GROUP_COLORS.length]}
            onClick={() => selectGroup(g)}
            onContextMenu={(e: React.MouseEvent) => { e.preventDefault(); setGroupMenu({ group: g, x: e.clientX, y: e.clientY }); }}
            draggable
            dragging={tabDragGroup === g}
            dropTarget={tabOverGroup === g && tabDragGroup !== g}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', g);
              setTabDragGroup(g);
            }}
            onDragEnter={() => { if (tabDragGroup && tabDragGroup !== g) setTabOverGroup(g); }}
            onDragOver={(event) => {
              if (tabDragGroup && tabDragGroup !== g) {
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setTabOverGroup(g);
              }
            }}
            onDragLeave={() => { setTabOverGroup((current) => (current === g ? null : current)); }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              const dragged = event.dataTransfer.getData('text/plain') || tabDragGroup;
              if (dragged && dragged !== g) reorderGroups(dragged, g);
              setTabDragGroup(null);
              setTabOverGroup(null);
            }}
            onDragEnd={() => {
              setTabDragGroup(null);
              setTabOverGroup(null);
            }}
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

      <div className="flex items-stretch gap-2.5">
        <button
          type="button"
          onClick={() => setStatusFilter((prev) => (prev === 'all' ? 'active' : prev === 'active' ? 'done' : 'all'))}
          className={`inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border text-sm font-extrabold transition-all ${
            statusFilter !== 'all'
              ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300'
              : 'border-white/10 bg-white/[0.03] text-slate-400 hover:text-slate-200'
          }`}
        >
          {statusFilter === 'all' ? '全部' : statusFilter === 'active' ? '进行中' : '已完成'}
        </button>
        <button
          type="button"
          onClick={onSortPress}
          title={sortDesc ? '按打卡时间倒序' : '按打卡时间正序'}
          className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.03] text-sm font-extrabold text-slate-400 transition-all hover:text-slate-200"
        >
          <ArrowUpDown size={16} />
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

      {loading && <p className="text-sm text-slate-500">正在载入...</p>}
      {!loading && filtered.length === 0 && (
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
          <div className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[2px]" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null); }} />
          <div
            className="fixed z-50 min-w-[220px] overflow-hidden rounded-2xl border border-white/10 bg-slate-900/98 py-2 shadow-2xl backdrop-blur-xl"
            style={{
              left: Math.min(ctxMenu.x, window.innerWidth - 236),
              top: Math.min(ctxMenu.y, window.innerHeight - 260),
            }}
          >
            <div className="border-b border-white/[0.07] px-3 pb-2">
              <p className="truncate text-sm font-black text-slate-100">{ctxTask.name}</p>
              <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                状态：{ctxStatus === 'failed' ? '打卡失败' : ctxStatus === 'success' ? '已完成' : '未打卡'}
              </p>
            </div>
            <button
              className="mx-2 mt-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-bold text-slate-200 transition-colors hover:bg-white/[0.07]"
              onClick={() => { onEditTask(ctxTask); setCtxMenu(null); }}
            >
              <Pencil size={16} className="text-cyan-300" />
              编辑任务
            </button>
            <button
              className={`mx-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-bold transition-colors ${
                ctxStatus === 'failed' ? 'text-emerald-300 hover:bg-emerald-400/10' : 'text-red-300 hover:bg-red-400/10'
              }`}
              onClick={() => { setCheckInStatus(ctxTask.id, today, ctxStatus === 'failed' ? 'success' : 'failed'); setCtxMenu(null); }}
            >
              {ctxStatus === 'failed' ? <CircleCheck size={16} /> : <CircleX size={16} />}
              {ctxStatus === 'failed' ? '标记为打卡成功' : '标记为打卡失败'}
            </button>
            <button
              className="mx-2 flex w-[calc(100%-16px)] items-center gap-2.5 rounded-xl px-3 py-2 text-left text-[13px] font-bold text-slate-200 transition-colors hover:bg-white/[0.07]"
              onClick={() => { void deleteTask(ctxTask.id); setCtxMenu(null); }}
            >
              <Trash2 size={16} className="text-red-400" />
              删除任务
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function TabButton({ active, onClick, onContextMenu, color, children, draggable, dragging, dropTarget, onDragStart, onDragEnter, onDragOver, onDragLeave, onDrop, onDragEnd }: {
  active: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  color?: string;
  children: React.ReactNode;
  draggable?: boolean;
  dragging?: boolean;
  dropTarget?: boolean;
  onDragStart?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnter?: () => void;
  onDragOver?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragLeave?: () => void;
  onDrop?: (event: React.DragEvent<HTMLButtonElement>) => void;
  onDragEnd?: () => void;
}) {
  const c = color ?? '#22d3ee';
  return (
    <motion.button
      layout
      type="button"
      draggable={draggable}
      onDragStartCapture={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onClick={onClick}
      onContextMenu={onContextMenu}
      animate={{
        scale: dragging ? 0.93 : dropTarget ? 1.05 : 1,
        opacity: dragging ? 0.38 : 1,
      }}
      transition={{ type: 'spring', stiffness: 520, damping: 34 }}
      style={{
        backgroundColor: active ? c + '1a' : dropTarget ? 'rgba(34,211,238,0.10)' : undefined,
        color: active ? c : dropTarget ? '#67e8f9' : undefined,
        boxShadow: active
          ? `inset 0 -3px 0 ${c}80`
          : dropTarget
            ? 'inset 0 0 0 2px rgba(34,211,238,0.55), 0 12px 30px rgba(34,211,238,0.16)'
            : undefined,
      }}
      data-group-tab={draggable ? 'draggable' : undefined}
      className={`relative z-0 flex-1 min-w-max cursor-grab px-4 py-3.5 text-sm font-extrabold transition-colors duration-300 ${
        active || dropTarget ? '' : 'text-slate-400 hover:bg-white/[0.03] hover:text-slate-200'
      } ${dragging ? 'z-20' : dropTarget ? 'z-10' : ''}`}
    >
      <span className="relative z-10">{children}</span>
    </motion.button>
  );
}
