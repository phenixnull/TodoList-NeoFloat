import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useMemo } from 'react';
import HeatmapBlock from '../components/HeatmapBlock';
import {
  calculateTaskDurationMs,
  formatDuration,
} from '../../../app/src/domain/timeTracking';
import { computeStats, getTodayKey, toLocalDateKey } from '../../../app/src/domain/streak';
import { useStore } from '../data/store';

export default function StatsPage() {
  const { tasks, checkIns, now } = useStore();
  const today = getTodayKey(now);
  const activeTasks = useMemo(() => tasks.filter((t) => !t.deletedAt), [tasks]);
  const successCheckIns = useMemo(() => checkIns.filter((c) => c.status !== 'failed'), [checkIns]);

  const unionDates = useMemo(
    () => new Set(successCheckIns.map((c) => c.date)),
    [successCheckIns],
  );

  const totalDuration = useMemo(
    () =>
      activeTasks.reduce((sum, task) => sum + calculateTaskDurationMs(task, now.getTime()), 0),
    [activeTasks, now],
  );

  const todayCount = successCheckIns.filter((c) => c.date === today).length;

  const topCards = [
    { label: '今日完成', value: `${todayCount}/${activeTasks.length}`, accent: true },
    { label: '累计打卡天数', value: String(unionDates.size) },
    { label: '任务总数', value: String(activeTasks.length) },
    { label: '累计投入时长', value: formatDuration(totalDuration) },
  ];

  const perTask = activeTasks
    .map((task) => {
      const dates = successCheckIns.filter((c) => c.taskId === task.id).map((c) => c.date);
      const stats = computeStats(dates, today);
      return { task, ...stats };
    })
    .sort((a, b) => b.longest - a.longest);

  // Last 14 days bar data.
  const barData = useMemo(() => {
    const data: { date: string; count: number }[] = [];
    const cursor = new Date(`${today}T00:00:00`);
    cursor.setDate(cursor.getDate() - 13);

    for (let i = 0; i < 14; i += 1) {
      const key = toLocalDateKey(cursor);
      data.push({
        date: key.slice(5),
        count: successCheckIns.filter((c) => c.date === key).length,
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    return data;
  }, [successCheckIns, today]);

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-xl font-black text-slate-100">数据统计</h2>

      <div className="grid grid-cols-4 gap-4">
        {topCards.map((card) => (
          <div
            key={card.label}
            className={`glass p-5 ${card.accent ? 'border-cyan-400/25 bg-cyan-400/[0.07]' : ''}`}
          >
            <p className="text-xs font-semibold text-slate-400">{card.label}</p>
            <p
            className={`mt-2 text-2xl font-black ${card.accent ? 'text-cyan-300' : 'text-slate-100'}`}
            >
              {card.value}
            </p>
          </div>
        ))}
      </div>

      <div className="glass p-5">
        <h3 className="mb-4 text-sm font-extrabold text-slate-100">近 14 天打卡数量</h3>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={barData} barCategoryGap="22%">
              <XAxis
                dataKey="date"
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(148,163,184,0.2)' }}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
                width={28}
              />
              <Tooltip
                cursor={{ fill: 'rgba(148,163,184,0.08)' }}
                contentStyle={{
                  backgroundColor: '#0b1025',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 12,
                  fontSize: 12,
                  color: '#f8fafc',
                }}
                labelStyle={{ color: '#cbd5e1' }}
              />
              <Bar dataKey="count" fill="#22d3ee" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <HeatmapBlock />

      <div className="glass overflow-hidden">
        <div className="grid grid-cols-[1fr_100px_100px_100px] gap-3 border-b border-white/[0.07] px-5 py-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          <span>任务</span>
          <span>当前连续</span>
          <span>最长连续</span>
          <span>累计天数</span>
        </div>
        {perTask.map(({ task, current, longest, total }) => (
          <div
            key={task.id}
            className="grid grid-cols-[1fr_100px_100px_100px] items-center gap-3 border-b border-white/[0.05] px-5 py-3 last:border-0 hover:bg-white/[0.03]"
          >
            <div className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: task.color }}
              />
              <span className="truncate text-sm font-semibold text-slate-200">{task.name}</span>
            </div>
            <span className={`font-mono text-sm ${current > 0 ? 'text-cyan-300' : 'text-slate-500'}`}>
              {current} 天
            </span>
            <span className="font-mono text-sm text-slate-300">{longest} 天</span>
            <span className="font-mono text-sm text-slate-400">{total} 天</span>
          </div>
        ))}
      </div>
    </div>
  );
}
