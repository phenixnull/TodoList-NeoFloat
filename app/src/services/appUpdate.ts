import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';

export type UpdateManifest = {
  versionName: string;
  versionCode: number;
  fileName: string;
  apkPath: string;
  mandatory: boolean;
  releaseNotes: string[];
  publishedAt: string;
  size?: number;
  sha256?: string;
};

const DOWNLOADED_APK_KEY = 'habitpulse.downloadedApk';
const PARTIAL_APK_KEY = 'habitpulse.partialApk';
const DOWNLOAD_CHUNK_BYTES = 1024 * 1024;
const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export type DownloadedApkInfo = {
  versionName: string;
  versionCode: number;
  localUri: string;
  size?: number;
};

type ApkResourceInfo = {
  size: number;
  etag: string | null;
  lastModified: string | null;
};

type PartialApkInfo = {
  versionName: string;
  versionCode: number;
  url: string;
  localUri: string;
  etag: string | null;
  lastModified: string | null;
  updatedAt: string;
};

export function getCurrentVersionCode(): number {
  return Number(Constants.expoConfig?.android?.versionCode ?? 0);
}

export function getCurrentVersionName(): string {
  return String(Constants.expoConfig?.version ?? '');
}

export async function fetchUpdateManifest(serverUrl: string): Promise<UpdateManifest> {
  const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/updates/manifest`, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`检查更新失败 (${response.status})`);
  }

  return (await response.json()) as UpdateManifest;
}

export function isNewer(manifest: UpdateManifest, currentVersionCode: number): boolean {
  return Number(manifest.versionCode) > currentVersionCode;
}

/** Check if the target version has already been downloaded locally. */
export async function getDownloadedApk(
  manifest: UpdateManifest,
): Promise<DownloadedApkInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(DOWNLOADED_APK_KEY);
    if (!raw) return null;

    const info = JSON.parse(raw) as DownloadedApkInfo;

    // Must match target version AND file must still exist
    if (info.versionCode !== manifest.versionCode || info.versionName !== manifest.versionName) {
      await AsyncStorage.removeItem(DOWNLOADED_APK_KEY);
      return null;
    }

    const info2 = await FileSystem.getInfoAsync(info.localUri);
    if (!info2.exists) {
      await AsyncStorage.removeItem(DOWNLOADED_APK_KEY);
      return null;
    }

    if (manifest.size && 'size' in info2 && info2.size !== manifest.size) {
      await AsyncStorage.removeItem(DOWNLOADED_APK_KEY);
      return null;
    }

    return info;
  } catch {
    return null;
  }
}

async function saveDownloadedApk(manifest: UpdateManifest, uri: string): Promise<void> {
  await AsyncStorage.setItem(
    DOWNLOADED_APK_KEY,
    JSON.stringify({
      versionName: manifest.versionName,
      versionCode: manifest.versionCode,
      localUri: uri,
      ...(manifest.size ? { size: manifest.size } : {}),
    } as DownloadedApkInfo),
  );
}

async function readPartialApk(
  manifest: UpdateManifest,
  url: string,
  localUri: string,
): Promise<PartialApkInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(PARTIAL_APK_KEY);
    if (!raw) return null;

    const info = JSON.parse(raw) as PartialApkInfo;
    const valid = info.versionCode === manifest.versionCode
      && info.versionName === manifest.versionName
      && info.url === url
      && info.localUri === localUri;
    if (!valid) {
      await AsyncStorage.removeItem(PARTIAL_APK_KEY);
      return null;
    }

    const fileInfo = await FileSystem.getInfoAsync(localUri);
    if (!fileInfo.exists || !('size' in fileInfo) || fileInfo.size <= 0) {
      await AsyncStorage.removeItem(PARTIAL_APK_KEY);
      return null;
    }

    return info;
  } catch {
    return null;
  }
}

async function savePartialApk(
  manifest: UpdateManifest,
  url: string,
  localUri: string,
  resource: ApkResourceInfo,
): Promise<void> {
  await AsyncStorage.setItem(PARTIAL_APK_KEY, JSON.stringify({
    versionName: manifest.versionName,
    versionCode: manifest.versionCode,
    url,
    localUri,
    etag: resource.etag,
    lastModified: resource.lastModified,
    updatedAt: new Date().toISOString(),
  } satisfies PartialApkInfo));
}

async function clearPartialApk(): Promise<void> {
  await AsyncStorage.removeItem(PARTIAL_APK_KEY);
}

async function inspectApkResource(url: string): Promise<ApkResourceInfo> {
  const response = await fetch(url, {
    method: 'HEAD',
    headers: { Accept: 'application/vnd.android.package-archive' },
  });

  if (!response.ok) {
    throw new Error(`检查更新包失败 (${response.status})`);
  }

  const size = Number(response.headers.get('content-length'));
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error('无法获取更新包大小');
  }

  return {
    size,
    etag: response.headers.get('etag'),
    lastModified: response.headers.get('last-modified'),
  };
}

export async function getPartialDownloadProgress(
  serverUrl: string,
  manifest: UpdateManifest,
): Promise<number> {
  const url = `${serverUrl.replace(/\/+$/, '')}${manifest.apkPath}`;
  const localUri = `${FileSystem.documentDirectory ?? ''}${manifest.fileName}`;
  const partial = await readPartialApk(manifest, url, localUri);
  if (!partial) return 0;

  const fileInfo = await FileSystem.getInfoAsync(localUri);
  let downloaded = fileInfo.exists && 'size' in fileInfo ? fileInfo.size : 0;
  let total = manifest.size ?? 0;

  if (!total) {
    try {
      total = (await inspectApkResource(url)).size;
    } catch {
      return 0;
    }
  }

  if (downloaded > total) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    await clearPartialApk();
    downloaded = 0;
  }

  return Math.max(0, Math.min(1, downloaded / total));
}

export function bytesToBase64(bytes: Uint8Array): string {
  const output: string[] = [];

  for (let index = 0; index < bytes.length; index += 3) {
    const first = bytes[index]!;
    const second = bytes[index + 1];
    const third = bytes[index + 2];

    output.push(BASE64_CHARS[first >> 2]!);
    output.push(BASE64_CHARS[((first & 0x03) << 4) | ((second ?? 0) >> 4)]!);
    if (second === undefined) {
      output.push('=');
    } else {
      output.push(BASE64_CHARS[((second & 0x0f) << 2) | ((third ?? 0) >> 6)]!);
    }

    if (third === undefined) {
      output.push('=');
    } else {
      output.push(BASE64_CHARS[third & 0x3f]!);
    }
  }

  return output.join('');
}

/** Clean up old APK files to save storage */
async function cleanupOldApks(currentFileName: string): Promise<void> {
  try {
    const dir = FileSystem.documentDirectory ?? '';
    const files = await FileSystem.readDirectoryAsync(dir);
    for (const file of files) {
      if (file.endsWith('.apk') && file !== currentFileName) {
        await FileSystem.deleteAsync(`${dir}${file}`, { idempotent: true });
      }
    }
  } catch {
    // ignore cleanup errors
  }
}

export async function downloadUpdate(
  serverUrl: string,
  manifest: UpdateManifest,
  onProgress: (ratio: number) => void,
): Promise<string> {
  const url = `${serverUrl.replace(/\/+$/, '')}${manifest.apkPath}`;
  const target = `${FileSystem.documentDirectory ?? ''}${manifest.fileName}`;
  const resource = await inspectApkResource(url);
  const totalSize = manifest.size || resource.size;
  if (manifest.size && manifest.size !== resource.size) {
    throw new Error('更新包大小校验失败');
  }

  let start = 0;
  const partial = await readPartialApk(manifest, url, target);
  const partialInfo = await FileSystem.getInfoAsync(target);
  const partialSize = partialInfo.exists && 'size' in partialInfo ? partialInfo.size : 0;
  const resourceMatches = Boolean(partial)
    && (!resource.etag || !partial?.etag || partial.etag === resource.etag)
    && (!resource.lastModified || !partial?.lastModified || partial.lastModified === resource.lastModified);

  if (!partial || !resourceMatches || partialSize <= 0 || partialSize > totalSize) {
    await FileSystem.deleteAsync(target, { idempotent: true });
    await clearPartialApk();
  } else {
    start = partialSize;
  }

  let completed = start;
  onProgress(start / totalSize);

  while (completed < totalSize) {
    const end = Math.min(completed + DOWNLOAD_CHUNK_BYTES - 1, totalSize - 1);
    const headers: Record<string, string> = {
      Accept: 'application/vnd.android.package-archive',
      Range: `bytes=${completed}-${end}`,
    };
    if (resource.etag) headers['If-Range'] = resource.etag;
    if (!resource.etag && resource.lastModified) headers['If-Range'] = resource.lastModified;

    const response = await fetch(url, { headers });
    if (response.status !== 206) {
      await clearPartialApk();
      throw new Error('服务端不支持断点续传，请重新下载');
    }

    const chunk = await response.arrayBuffer();
    if (chunk.byteLength !== end - completed + 1) {
      await clearPartialApk();
      throw new Error('更新包分段校验失败');
    }

    await FileSystem.writeAsStringAsync(target, bytesToBase64(new Uint8Array(chunk)), {
      append: completed > 0,
      encoding: 'base64',
    });

    completed += chunk.byteLength;
    await savePartialApk(manifest, url, target, resource);
    onProgress(completed / totalSize);
  }

  const resultInfo = await FileSystem.getInfoAsync(target);
  if (!resultInfo.exists || !('size' in resultInfo) || resultInfo.size !== totalSize) {
    throw new Error('更新包下载不完整');
  }

  await saveDownloadedApk(manifest, target);
  await clearPartialApk();
  await cleanupOldApks(manifest.fileName);

  return target;
}

// FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
const INSTALL_FLAGS = 1 | 268_435_456;

export async function installApk(localUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(localUri);

  try {
    await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: contentUri,
      type: 'application/vnd.android.package-archive',
      flags: INSTALL_FLAGS,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('already started')) {
      throw new Error('请先关闭之前的安装对话框，再重试');
    }
    throw error;
  }
}
