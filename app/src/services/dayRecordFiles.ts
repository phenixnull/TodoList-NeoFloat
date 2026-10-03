import * as FileSystem from 'expo-file-system/legacy';
import * as ImageManipulator from 'expo-image-manipulator';
import { DayRecord, DayRecordImage } from '../domain/types';

const maxImageWidth = 1600;

function safeToken(value: string): string {
  const token = value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
  return token.length > 0 ? token.slice(-80) : 'task';
}

export function getDayRecordDirectory(documentDirectory: string, taskId: string): string {
  return `${documentDirectory}HabitPulse/day-records/${safeToken(taskId)}/`;
}

export async function prepareDayRecordImage(
  taskId: string,
  date: string,
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<DayRecordImage> {
  if (!FileSystem.documentDirectory) {
    throw new Error('Document storage is unavailable');
  }

  const scale = Math.min(1, maxImageWidth / Math.max(sourceWidth, sourceHeight));
  const actions: ImageManipulator.Action[] = [];

  if (scale < 1) {
    actions.push({
      resize: {
        width: Math.max(1, Math.round(sourceWidth * scale)),
        height: Math.max(1, Math.round(sourceHeight * scale)),
      },
    });
  }

  const manipulated = await ImageManipulator.manipulateAsync(
    sourceUri,
    actions,
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.78 },
  );
  const directory = getDayRecordDirectory(FileSystem.documentDirectory, taskId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const token = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${date}-${token}.jpg`;
  const localUri = `${directory}${safeToken(fileName)}`;

  await FileSystem.copyAsync({ from: manipulated.uri, to: localUri });
  await FileSystem.deleteAsync(manipulated.uri, { idempotent: true });

  return {
    fileName,
    width: manipulated.width,
    height: manipulated.height,
    mimeType: 'image/jpeg',
    localUri,
  };
}

export async function readDayRecordImageBase64(image: DayRecordImage): Promise<string | null> {
  if (!image.localUri) return null;

  try {
    return await FileSystem.readAsStringAsync(image.localUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    return null;
  }
}

export async function deleteDayRecordImageFile(image: DayRecordImage | null): Promise<void> {
  if (!image?.localUri) return;
  await FileSystem.deleteAsync(image.localUri, { idempotent: true });
}

export async function deleteDayRecordImageFiles(images: DayRecordImage[]): Promise<void> {
  await Promise.all(images.map((image) => deleteDayRecordImageFile(image)));
}

export function dayRecordImageEndpoint(
  record: Pick<DayRecord, 'taskId' | 'date'>,
  index: number,
): string {
  return `/api/day-records/${encodeURIComponent(record.taskId)}/${encodeURIComponent(record.date)}/images/${index}`;
}

export async function downloadDayRecordImages(
  serverUrl: string,
  input: DayRecord,
): Promise<DayRecord | null> {
  if (!FileSystem.documentDirectory) return null;

  const images = Array.isArray(input.images)
    ? input.images
    : input.image ? [input.image] : [];

  if (images.every((image) => image.localUri)) return null;

  const directory = getDayRecordDirectory(FileSystem.documentDirectory, input.taskId);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  let changed = false;
  const nextImages: DayRecordImage[] = [];

  for (const [index, image] of images.entries()) {
    if (image.localUri) {
      nextImages.push(image);
      continue;
    }

    const localUri = `${directory}${safeToken(image.fileName)}`;
    const endpoint = dayRecordImageEndpoint(input, index);
    const result = await FileSystem.downloadAsync(
      `${serverUrl.replace(/\/+$/, '')}${endpoint}`,
      localUri,
    );

    if (result.status >= 400) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      nextImages.push(image);
      continue;
    }

    changed = true;
    nextImages.push({ ...image, localUri });
  }

  return changed
    ? { ...input, images: nextImages, image: nextImages[0] ?? null }
    : null;
}
