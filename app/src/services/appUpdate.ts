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
};

const DOWNLOADED_APK_KEY = 'habitpulse.downloadedApk';

export type DownloadedApkInfo = {
  versionName: string;
  versionCode: number;
  localUri: string;
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
      return null;
    }

    const info2 = await FileSystem.getInfoAsync(info.localUri);
    if (!info2.exists) {
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
    } as DownloadedApkInfo),
  );
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
    await AsyncStorage.removeItem(DOWNLOADED_APK_KEY);
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

  // Remove any stale copy before re-downloading.
  try {
    await FileSystem.deleteAsync(target, { idempotent: true });
  } catch {
    // ignore missing file
  }

  const download = FileSystem.createDownloadResumable(
    url,
    target,
    { cache: false },
    (data) => {
      const total = data.totalBytesExpectedToWrite || 1;
      onProgress(Math.min(1, data.totalBytesWritten / total));
    },
  );
  const result = await download.downloadAsync();

  if (!result?.uri) {
    throw new Error('下载失败');
  }

  // Save download info for future install without re-download
  await saveDownloadedApk(manifest, result.uri);

  // Clean up old APKs
  await cleanupOldApks(manifest.fileName);

  return result.uri;
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