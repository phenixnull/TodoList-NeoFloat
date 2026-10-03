import { AnimatePresence, motion } from 'framer-motion';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  ImagePlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  clearTimeSegmentsForDate,
  createTimeSegment,
  getTaskTimeSegmentsForDate,
} from '../../../app/src/domain/timeTracking';
import type { DayRecordImage, TimeSegment } from '../../../app/src/domain/types';
import {
  readClipboardImages,
  usePasteImages,
  useWindowImageDrop,
} from '../hooks/useImageCapture';
import { useStore } from '../data/store';

export type RecordTarget = { taskId: string; date: string };

type Props = {
  target: RecordTarget | null;
  initialFiles: File[];
  onClose: () => void;
};

type ImageItem =
  | { kind: 'existing'; index: number; meta: DayRecordImage; url: string }
  | { kind: 'new'; file: File; url: string };

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(
    d.getHours(),
  )}:${pad2(d.getMinutes())}`;
}

function shiftDate(dateKey: string, amount: number): string {
  const d = new Date(`${dateKey}T00:00:00`);
  d.setDate(d.getDate() + amount);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function segmentDuration(segment: TimeSegment): number {
  const start = new Date(segment.startAt).getTime();
  const stop = segment.stopAt ? new Date(segment.stopAt).getTime() : start;
  return Math.max(0, stop - start);
}

function formatMs(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${pad2(Math.floor(total / 3600))}:${pad2(Math.floor((total % 3600) / 60))}:${pad2(
    total % 60,
  )}`;
}

export default function DayRecordModal({ target, initialFiles, onClose }: Props) {
  const store = useStore();
  const { tasks, dayRecords, imageUrl, updateTask, saveDayRecord } = store;
  const [date, setDate] = useState(target?.date ?? '');
  const [note, setNote] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [segments, setSegments] = useState<TimeSegment[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [hint, setHint] = useState('');
  const [saving, setSaving] = useState(false);

  const task = useMemo(
    () => tasks.find((t) => t.id === target?.taskId) ?? null,
    [tasks, target?.taskId],
  );

  const record = useMemo(
    () => dayRecords.find((r) => r.taskId === target?.taskId && r.date === date) ?? null,
    [dayRecords, target?.taskId, date],
  );

  // (Re)initialize whenever target/date changes.
  useEffect(() => {
    if (!target) return;
    setDate(target.date);
  }, [target]);

  useEffect(() => {
    if (!task) return;
    setNote(record?.note ?? '');
    setSegments(getTaskTimeSegmentsForDate(task, date));
    setImages(
      (record?.images ?? []).map((meta, index) => ({
        kind: 'existing',
        index,
        meta,
        url: imageUrl(task.id, date, index),
      })),
    );
    setHint('');
  }, [task, record, date, imageUrl]);

  const addFiles = useCallback((filesToAdd: File[]) => {
    setImages((current) => [
      ...current,
      ...filesToAdd.map((file) => ({
        kind: 'new' as const,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
  }, []);

  // Initial files supplied from a card drop.
  useEffect(() => {
    if (initialFiles.length) addFiles(initialFiles);
  }, [initialFiles, addFiles]);

  const { dragging } = useWindowImageDrop(Boolean(target), addFiles);
  usePasteImages(Boolean(target), addFiles);

  const handlePasteButton = async () => {
    try {
      const files = await readClipboardImages();
      if (!files.length) {
        setHint('剪贴板中没有图片，可先用截图工具复制');
        return;
      }
      addFiles(files);
    } catch (error) {
      setHint(error instanceof Error ? error.message : '读取剪贴板失败');
    }
  };

  const removeImage = (item: ImageItem) => {
    if (item.kind === 'new') URL.revokeObjectURL(item.url);
    setImages((current) => current.filter((candidate) => candidate !== item));
  };

  const updateSegmentField = (
    id: string,
    field: 'startAt' | 'stopAt',
    value: string,
  ) => {
    setSegments((current) =>
      current.map((segment) =>
        segment.id === id ? { ...segment, [field]: new Date(value).toISOString() } : segment,
      ),
    );
  };

  const addSegment = () => {
    const start = new Date();
    const stop = new Date(start.getTime() + 10 * 60_000);
    const segment = createTimeSegment(
      date,
      `${pad2(start.getHours())}:${pad2(start.getMinutes())}`,
      date,
      `${pad2(stop.getHours())}:${pad2(stop.getMinutes())}`,
    );
    if (segment) setSegments((current) => [...current, segment]);
  };

  const removeSegment = (id: string) => {
    setSegments((current) => current.filter((segment) => segment.id !== id));
  };

  const handleSave = async () => {
    if (!task) return;
    setSaving(true);
    try {
      // 1. Replace time segments for this date.
      const outside = clearTimeSegmentsForDate(task, date).timerSegments;
      const validSegments = segments.filter(
        (segment) => segment.stopAt && new Date(segment.stopAt) > new Date(segment.startAt),
      );
      await updateTask(task.id, { timerSegments: [...outside, ...validSegments] });

      // 2. Save note + images.
      const kept = images
        .filter((item): item is Extract<ImageItem, { kind: 'existing' }> => item.kind === 'existing')
        .map((item) => item.meta);
      const newFiles = images
        .filter((item): item is Extract<ImageItem, { kind: 'new' }> => item.kind === 'new')
        .map((item) => item.file);

      await saveDayRecord({
        taskId: task.id,
        date,
        note,
        keptImages: kept,
        newFiles,
      });

      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {target && task && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, y: 14 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: 14 }}
            transition={{ type: 'spring', damping: 26, stiffness: 320 }}
            className="glass-strong flex max-h-[86vh] w-[720px] flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-9 w-9 items-center justify-center rounded-xl font-black"
                  style={{ backgroundColor: `${task.color}22`, color: task.color }}
                >
                  {task.name.slice(0, 1)}
                </div>
                <div>
                  <h2 className="text-base font-extrabold text-slate-100">{task.name}</h2>
                  <div className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                    <CalendarDays size={12} />
                    <button onClick={() => setDate(shiftDate(date, -1))} className="rounded p-0.5 hover:bg-white/10">
                      <ChevronLeft size={13} />
                    </button>
                    <span className="min-w-[88px] text-center font-mono">{date}</span>
                    <button onClick={() => setDate(shiftDate(date, 1))} className="rounded p-0.5 hover:bg-white/10">
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Time segments */}
              <div className="mb-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    分段计时明细
                  </span>
                  <button
                    onClick={addSegment}
                    className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
                  >
                    <Plus size={12} /> 添加分段
                  </button>
                </div>

                <div className="flex flex-col gap-2">
                  {segments.length === 0 && (
                    <p className="rounded-xl border border-dashed border-white/10 px-3 py-3 text-center text-xs text-slate-500">
                      当天暂无计时记录
                    </p>
                  )}
                  {segments.map((segment) => (
                    <div
                      key={segment.id}
                      className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.03] px-3 py-2"
                    >
                      <input
                        type="datetime-local"
                        className="input flex-1 px-2 py-1.5 text-xs"
                        value={toDatetimeLocal(segment.startAt)}
                        onChange={(e) => updateSegmentField(segment.id, 'startAt', e.target.value)}
                      />
                      <span className="text-xs text-slate-500">→</span>
                      <input
                        type="datetime-local"
                        className="input flex-1 px-2 py-1.5 text-xs"
                        value={segment.stopAt ? toDatetimeLocal(segment.stopAt) : ''}
                        onChange={(e) => updateSegmentField(segment.id, 'stopAt', e.target.value)}
                      />
                      <span className="w-20 shrink-0 text-right font-mono text-xs text-cyan-300">
                        {formatMs(segmentDuration(segment))}
                      </span>
                      <button
                        onClick={() => removeSegment(segment.id)}
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-rose-500/20 hover:text-rose-300"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Note */}
              <div className="mb-5">
                <label className="label">当日备注</label>
                <textarea
                  className="input min-h-[84px] resize-none"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="记录今天的情况、感受或说明"
                />
              </div>

              {/* Images */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    打卡图片（{images.length}）
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void handlePasteButton()}
                      className="flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
                    >
                      <ClipboardPaste size={12} /> 剪贴板
                    </button>
                    <label className="flex cursor-pointer items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-xs text-slate-300 hover:bg-white/10">
                      <ImagePlus size={12} /> 添加图片
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={(e) => {
                          if (e.target.files?.length) addFiles(Array.from(e.target.files));
                          e.target.value = '';
                        }}
                      />
                    </label>
                  </div>
                </div>

                <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] p-3">
                  {images.length === 0 ? (
                    <p className="py-3 text-center text-xs text-slate-500">
                      可直接拖入图片、从 QQ / 微信聊天框拖图，或 Ctrl+V 粘贴截图
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2.5">
                      {images.map((item) => (
                        <div key={item.url} className="group relative">
                          <img
                            src={item.url}
                            className="h-20 w-20 cursor-zoom-in rounded-lg border border-white/10 object-cover"
                            onClick={() => setLightbox(item.url)}
                            alt="打卡图"
                          />
                          <button
                            onClick={() => removeImage(item)}
                            className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                          >
                            <X size={11} strokeWidth={3} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {hint && <p className="mt-2 text-xs text-amber-300">{hint}</p>}
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-white/[0.07] px-5 py-3.5">
              <button className="btn-ghost" onClick={onClose}>
                取消
              </button>
              <button className="btn-accent" disabled={saving} onClick={handleSave}>
                {saving ? '保存中...' : '保存记录'}
              </button>
            </div>
          </motion.div>

          {/* Drag overlay */}
          <AnimatePresence>
            {dragging && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="pointer-events-none fixed inset-6 z-50 flex items-center justify-center rounded-3xl border-2 border-dashed border-cyan-400/70 bg-cyan-400/10 backdrop-blur-sm"
              >
                <div className="text-center">
                  <ImagePlus className="mx-auto mb-2 text-cyan-300" size={44} />
                  <p className="text-lg font-extrabold text-cyan-200">松开鼠标，添加打卡图片</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Lightbox */}
          <AnimatePresence>
            {lightbox && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-10"
                onClick={() => setLightbox(null)}
              >
                <img src={lightbox} className="max-h-full max-w-full rounded-xl object-contain" alt="" />
                <button className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20">
                  <X size={20} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
