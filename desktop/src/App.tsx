import { AlarmClock } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { StoreProvider } from './data/store';
import DayRecordModal, { type RecordTarget } from './components/DayRecordModal';
import FeedbackModal from './components/FeedbackModal';
import ProgressRing from './components/ProgressRing';
import Sidebar from './components/Sidebar';
import TaskCard from './components/TaskCard';
import TaskEditorModal from './components/TaskEditorModal';
import TitleBar from './components/TitleBar';
import { useStore } from './data/store';
import { getTodayKey } from '../../app/src/domain/streak';
import { getTaskGroups } from '../../app/src/domain/taskOrdering';
import type { Task } from '../../app/src/domain/types';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';
import StatsPage from './pages/StatsPage';
import TasksPage from './pages/TasksPage';
import TodayPage from './pages/TodayPage';

export type PageKey = 'today' | 'tasks' | 'stats' | 'history' | 'settings';

const PAGE_TITLES: Record<PageKey, string> = {
  today: '今日打卡',
  tasks: '任务管理',
  stats: '数据统计',
  history: '历史记录',
  settings: '设置',
};

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function readTestHash(): { page?: PageKey; mode?: 'full' | 'compact' } {
  const raw = window.location.hash.replace(/^#/, '');
  if (!raw) return {};
  const params = new URLSearchParams(raw);
  const page = params.get('page') as PageKey | null;
  const mode = params.get('mode') as 'full' | 'compact' | null;
  return { page: page ?? undefined, mode: mode ?? undefined };
}

function Shell() {
  const store = useStore();
  const testHash = readTestHash();
  const [mode, setMode] = useState<'full' | 'compact'>(testHash.mode ?? 'full');
  const [page, setPage] = useState<PageKey>(testHash.page ?? 'today');
  const [editorTask, setEditorTask] = useState<Task | null | undefined>(undefined);
  const [recordTarget, setRecordTarget] = useState<RecordTarget | null>(null);
  const [recordFiles, setRecordFiles] = useState<File[]>([]);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  useEffect(() => {
    const api = window.hpDesktop;
    if (!api) return undefined;
    void api.getMode().then(setMode);
    const off = api.onModeChange(setMode);
    return off;
  }, []);

  // Automated visual test: capture after data settles, then the main process quits.
  useEffect(() => {
    if (!testHash.page || !window.hpDesktop?.testCapture) return undefined;
    const timer = window.setTimeout(() => {
      void window.hpDesktop?.testCapture();
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [testHash.page]);

  const openEditor = (task: Task | null) => setEditorTask(task);
  const openRecord = (target: RecordTarget, files: File[] = []) => {
    setRecordTarget(target);
    setRecordFiles(files);
  };

  const today = getTodayKey(store.now);
  const completedIds = useMemo(
    () => new Set(store.checkIns.filter((c) => c.date === today).map((c) => c.taskId)),
    [store.checkIns, today],
  );
  const groups = useMemo(
    () => getTaskGroups(store.tasks, completedIds),
    [store.tasks, completedIds],
  );
  const ratio = store.tasks.length ? completedIds.size / store.tasks.length : 0;

  const midnight = new Date(store.now);
  midnight.setHours(24, 0, 0, 0);
  const remaining = midnight.getTime() - store.now.getTime();
  const countdown = `${pad2(Math.floor(remaining / 3_600_000))}:${pad2(
    Math.floor((remaining % 3_600_000) / 60_000),
  )}:${pad2(Math.floor((remaining % 60_000) / 1000))}`;

  const modals = (
    <>
      <TaskEditorModal task={editorTask} onClose={() => setEditorTask(undefined)} />
      <FeedbackModal open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      <DayRecordModal
        target={recordTarget}
        initialFiles={recordFiles}
        onClose={() => {
          setRecordTarget(null);
          setRecordFiles([]);
        }}
      />
    </>
  );

  if (mode === 'compact') {
    return (
      <div className="flex h-full flex-col">
        <TitleBar title="悬浮窗" mode={mode} />
        <div className="flex min-h-0 flex-1 gap-3 px-3 pb-3">
          <div className="glass flex w-[150px] shrink-0 flex-col items-center justify-center gap-1.5 px-2 py-2">
            <ProgressRing size={92} stroke={9} ratio={ratio}>
              <span className="text-base font-black text-slate-100">{Math.round(ratio * 100)}%</span>
            </ProgressRing>
            <span className="text-[11px] font-bold text-slate-300">
              {completedIds.size}/{store.tasks.length} 已完成
            </span>
            <span className="flex items-center gap-1 font-mono text-[10px] text-cyan-300">
              <AlarmClock size={10} />
              {countdown}
            </span>
          </div>

          <div className="flex flex-1 gap-2.5 overflow-x-auto overflow-y-hidden">
            {[...groups.unfinished, ...groups.finished].map((task) => (
              <div key={task.id} className="w-[250px] shrink-0">
                <TaskCard
                  task={task}
                  date={today}
                  compact
                  checked={completedIds.has(task.id)}
                  onEdit={() => openEditor(task)}
                  onOpenDetail={() => openRecord({ taskId: task.id, date: today })}
                  onDropImages={(files) => openRecord({ taskId: task.id, date: today }, files)}
                />
              </div>
            ))}
          </div>
        </div>
        {modals}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TitleBar title={PAGE_TITLES[page]} mode={mode} />
      <div className="flex min-h-0 flex-1">
        <Sidebar current={page} online={store.online} onNavigate={setPage} onOpenFeedback={() => setFeedbackOpen(true)} />
        <main className="flex-1 overflow-y-auto px-7 py-6">
          {page === 'today' && <TodayPage onEditTask={openEditor} onOpenRecord={openRecord} />}
          {page === 'tasks' && <TasksPage onEditTask={openEditor} />}
          {page === 'stats' && <StatsPage />}
          {page === 'history' && <HistoryPage onOpenRecord={openRecord} />}
          {page === 'settings' && <SettingsPage />}
        </main>
      </div>
      {modals}
    </div>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
