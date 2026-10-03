import { FileText, Image as ImageIcon } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { RecordTarget } from '../components/DayRecordModal';
import { useStore } from '../data/store';

type Props = {
  onOpenRecord: (target: RecordTarget) => void;
};

export default function HistoryPage({ onOpenRecord }: Props) {
  const { tasks, dayRecords, imageUrl } = useStore();
  const [query, setQuery] = useState('');

  const rows = useMemo(() => {
    const nameById = new Map(tasks.map((task) => [task.id, task]));

    return dayRecords
      .map((record) => ({
        record,
        task: nameById.get(record.taskId),
      }))
      .filter(({ record, task }) => {
        if (!query.trim()) return true;
        const q = query.trim().toLowerCase();
        return (
          record.date.includes(q) ||
          task?.name.toLowerCase().includes(q) ||
          record.note.toLowerCase().includes(q)
        );
      })
      .sort((a, b) =>
        b.record.date.localeCompare(a.record.date) ||
        (b.record.updatedAt ?? '').localeCompare(a.record.updatedAt ?? ''),
      );
  }, [dayRecords, tasks, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = map.get(row.record.date) ?? [];
      list.push(row);
      map.set(row.record.date, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-slate-100">历史记录</h2>
          <p className="mt-1 text-xs text-slate-500">共 {rows.length} 条当日记录，点击可查看与编辑</p>
        </div>
        <input
          className="input w-64"
          placeholder="搜索日期 / 任务 / 备注"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {grouped.map(([date, items]) => (
        <div key={date} className="glass p-4">
          <p className="mb-3 font-mono text-xs font-bold text-cyan-300">{date}</p>
          <div className="flex flex-col gap-2">
            {items.map(({ record, task }) => (
              <button
                key={`${record.taskId}:${record.date}`}
                onClick={() => onOpenRecord({ taskId: record.taskId, date: record.date })}
                className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5 text-left transition-all hover:border-cyan-400/30 hover:bg-cyan-400/[0.05]"
              >
                {record.images[0] ? (
                  <img
                    src={imageUrl(record.taskId, record.date, 0)}
                    className="h-10 w-10 rounded-lg border border-white/10 object-cover"
                    alt=""
                  />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-slate-500">
                    <FileText size={16} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-slate-200">{task?.name ?? record.taskId}</p>
                  <p className="truncate text-xs text-slate-500">
                    {record.note || '（无备注）'}
                  </p>
                </div>

                {record.images.length > 0 && (
                  <span className="chip">
                    <ImageIcon size={11} />
                    {record.images.length}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      ))}

      {grouped.length === 0 && (
        <div className="glass p-10 text-center text-sm text-slate-500">暂无匹配的历史记录</div>
      )}
    </div>
  );
}
