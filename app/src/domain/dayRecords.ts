import { DayRecord, DayRecordImage } from './types';

export function getDayRecordKey(record: Pick<DayRecord, 'taskId' | 'date'>): string {
  return `${record.taskId}:${record.date}`;
}

export function normalizeDayRecord(record: DayRecord): DayRecord {
  const images = (Array.isArray(record.images) && record.images.length > 0 ? record.images : record.image ? [record.image] : []).filter(Boolean);

  return {
    ...record,
    images,
    image: images[0] ?? null,
  };
}

function sameImage(a: DayRecordImage, b: DayRecordImage): boolean {
  return a.fileName === b.fileName
    && a.width === b.width
    && a.height === b.height
    && a.mimeType === b.mimeType;
}

function mergeImages(newer: DayRecord, other: DayRecord): DayRecordImage[] {
  return newer.images.map((image) => {
    const local = other.images.find((candidate) => sameImage(candidate, image));

    return local?.localUri && !image.localUri
      ? { ...image, localUri: local.localUri }
      : image;
  });
}

export function mergeDayRecord(local: DayRecord, remote: DayRecord): DayRecord {
  const normalizedLocal = normalizeDayRecord(local);
  const normalizedRemote = normalizeDayRecord(remote);
  const newer = new Date(normalizedRemote.updatedAt) > new Date(normalizedLocal.updatedAt)
    ? normalizedRemote
    : normalizedLocal;
  const other = newer === normalizedRemote ? normalizedLocal : normalizedRemote;
  const images = mergeImages(newer, other);

  return { ...newer, images, image: images[0] ?? null };
}

export function mergeDayRecords(local: DayRecord[], remote: DayRecord[]): DayRecord[] {
  const byKey = new Map<string, DayRecord>();

  for (const record of [...local, ...remote].map(normalizeDayRecord)) {
    const key = getDayRecordKey(record);
    const existing = byKey.get(key);
    byKey.set(key, existing ? mergeDayRecord(existing, record) : record);
  }

  return [...byKey.values()].sort((a, b) => b.date.localeCompare(a.date));
}
