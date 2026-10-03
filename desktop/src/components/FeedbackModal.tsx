import { AnimatePresence, motion } from 'framer-motion';
import { Bug, ImagePlus, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayRecordImage } from '../../../app/src/domain/types';
import { useStore } from '../data/store';

type FeedbackImage = {
  meta: DayRecordImage;
  previewUrl: string;
  file: File;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

async function fileToImage(file: File): Promise<FeedbackImage> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('读取文件失败'));
    reader.readAsDataURL(file);
  });

  const size = await new Promise<{ width: number; height: number }>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve({ width: 0, height: 0 });
    image.src = dataUrl;
  });

  return {
    meta: {
      fileName: file.name || `feedback-${Date.now()}.png`,
      width: size.width,
      height: size.height,
      mimeType: file.type || 'image/png',
    },
    previewUrl: URL.createObjectURL(file),
    file,
  };
}

export default function FeedbackModal({ open, onClose }: Props) {
  const { serverUrl } = useStore();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [images, setImages] = useState<FeedbackImage[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setImages([]);
      setMessage('');
      setError('');
      setSubmitting(false);
    }
  }, [open]);

  const addFiles = useCallback(async (files: File[]) => {
    const imageFiles = files.filter((f) => f.type.startsWith('image/')).slice(0, 6);

    for (const file of imageFiles) {
      const feedbackImage = await fileToImage(file);
      setImages((current) => {
        if (current.length >= 6) return current;
        return [...current, feedbackImage];
      });
    }
  }, []);

  // Paste screenshots with Ctrl+V while the modal is open.
  useEffect(() => {
    if (!open) return undefined;

    const handlePaste = (event: ClipboardEvent) => {
      const items = Array.from(event.clipboardData?.items ?? []);
      const files = items
        .filter((item) => item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);

      if (files.length) {
        event.preventDefault();
        void addFiles(files);
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [open, addFiles]);

  const removeImage = (index: number) => {
    setImages((current) => {
      URL.revokeObjectURL(current[index]?.previewUrl ?? '');
      return current.filter((_, i) => i !== index);
    });
  };

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError('请填写问题标题');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const base64Images = await Promise.all(images.map(async (img) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('读取图片失败'));
          reader.readAsDataURL(img.file);
        });

        return {
          fileName: img.meta.fileName,
          width: img.meta.width,
          height: img.meta.height,
          mimeType: img.meta.mimeType,
          base64: dataUrl.slice(dataUrl.indexOf(',') + 1),
        };
      }));

      const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          deviceInfo: `HabitPulse Desktop (Electron)`,
          appVersion: document.title || 'desktop',
          images: base64Images,
        }),
      });

      if (!response.ok) {
        throw new Error(`提交失败 (${response.status})`);
      }

      setMessage('已提交，感谢反馈！');
      setTimeout(() => onClose(), 1_500);
    } catch (err) {
      setError(err instanceof Error ? err.message : '提交失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.94, y: 12 }}
            transition={{ type: 'spring', damping: 24, stiffness: 320 }}
            className="glass-strong w-[520px] max-h-[85vh] overflow-y-auto p-6"
            onClick={(e) => e.stopPropagation()}
            onDragEnter={(e) => {
              e.preventDefault();
              dragCounter.current += 1;
              setDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              dragCounter.current -= 1;
              if (dragCounter.current <= 0) setDragging(false);
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              dragCounter.current = 0;
              setDragging(false);
              void addFiles(Array.from(e.dataTransfer.files));
            }}
          >
            <div className="mb-5 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-extrabold text-slate-100">
                <Bug size={18} className="text-amber-400" />
                问题反馈
              </h2>
              <button
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-white/10"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-4">
              <div>
                <label className="label">问题标题</label>
                <input
                  className="input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="简要描述遇到的问题"
                  maxLength={200}
                />
              </div>

              <div>
                <label className="label">详细描述（可选）</label>
                <textarea
                  className="input min-h-[80px] resize-none"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="补充操作步骤、预期行为、实际行为等"
                  maxLength={10_000}
                />
              </div>

              <div>
                <label className="label">截图（可选，最多 6 张）</label>

                <div
                  className={`mt-1 rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                    dragging
                      ? 'border-cyan-400/60 bg-cyan-400/5'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                >
                  <ImagePlus size={24} className="mx-auto text-slate-500" />
                  <p className="mt-2 text-xs text-slate-400">
                    拖拽、粘贴或点击上传截图
                  </p>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    void addFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />

                {images.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {images.map((img, index) => (
                      <div key={img.previewUrl} className="group relative">
                        <img
                          src={img.previewUrl}
                          alt={img.meta.fileName}
                          className="h-16 w-16 rounded-lg border border-white/10 object-cover"
                        />
                        <button
                          onClick={(e) => { e.stopPropagation(); removeImage(index); }}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {message && (
                <p className="text-sm font-medium text-emerald-400">{message}</p>
              )}
              {error && (
                <p className="text-sm font-medium text-rose-400">{error}</p>
              )}

              <div className="mt-1 flex items-center justify-end gap-2">
                <button className="btn-ghost" onClick={onClose}>
                  取消
                </button>
                <button
                  className="btn-accent"
                  onClick={() => void handleSubmit()}
                  disabled={submitting || !title.trim()}
                >
                  {submitting ? '提交中...' : '提交反馈'}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
