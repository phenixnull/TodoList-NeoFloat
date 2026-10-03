import { useEffect, useRef, useState } from 'react';

function isImageFileLike(dataTransfer: DataTransfer | null | undefined): boolean {
  if (!dataTransfer) return false;

  if (dataTransfer.types?.includes('Files')) {
    return true;
  }

  return Array.from(dataTransfer.items ?? []).some(
    (item) => item.kind === 'file' && item.type.startsWith('image/'),
  );
}

export function extractImageFiles(dataTransfer: DataTransfer): File[] {
  const files: File[] = [];

  for (const file of Array.from(dataTransfer.files ?? [])) {
    if (file.type.startsWith('image/')) files.push(file);
  }

  if (files.length === 0) {
    for (const item of Array.from(dataTransfer.items ?? [])) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }

  return files;
}

function extractClipboardImageFiles(dataTransfer: DataTransfer | null | undefined): File[] {
  const files: File[] = [];

  for (const item of Array.from(dataTransfer?.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  return files;
}

/**
 * Global drag-and-drop image capture while `active`.
 * Returns whether files are currently dragged over the window.
 */
export function useWindowImageDrop(
  active: boolean,
  onFiles: (files: File[]) => void,
): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const depthRef = useRef(0);

  useEffect(() => {
    if (!active) return undefined;

    const onDragEnter = (event: DragEvent) => {
      if (!isImageFileLike(event.dataTransfer)) return;
      event.preventDefault();
      depthRef.current += 1;
      setDragging(true);
    };

    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer || !isImageFileLike(event.dataTransfer)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    };

    const onDragLeave = (event: DragEvent) => {
      if (!event.dataTransfer || !isImageFileLike(event.dataTransfer)) return;
      depthRef.current = Math.max(0, depthRef.current - 1);
      if (depthRef.current === 0) setDragging(false);
    };

    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer || !isImageFileLike(event.dataTransfer)) return;
      event.preventDefault();
      const files = extractImageFiles(event.dataTransfer);
      depthRef.current = 0;
      setDragging(false);
      if (files.length) onFiles(files);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
      depthRef.current = 0;
      setDragging(false);
    };
  }, [active, onFiles]);

  return { dragging };
}

/** Paste (Ctrl+V) image capture while `active`. */
export function usePasteImages(active: boolean, onFiles: (files: File[]) => void) {
  useEffect(() => {
    if (!active) return undefined;

    const handler = (event: ClipboardEvent) => {
      const files = extractClipboardImageFiles(event.clipboardData);
      if (!files.length) return;
      event.preventDefault();
      onFiles(files);
    };

    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [active, onFiles]);
}

/** Read images straight from the system clipboard via async Clipboard API. */
export async function readClipboardImages(): Promise<File[]> {
  if (!navigator.clipboard?.read) {
    throw new Error('当前环境不支持读取剪贴板，请用 Ctrl+V 粘贴');
  }

  const items = await navigator.clipboard.read();
  const files: File[] = [];

  for (const item of items) {
    const imageType = item.types.find((type) => type.startsWith('image/'));
    if (!imageType) continue;
    const blob = await item.getType(imageType);
    const ext = imageType.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png';
    files.push(new File([blob], `clipboard-${Date.now()}.${ext}`, { type: imageType }));
  }

  return files;
}
