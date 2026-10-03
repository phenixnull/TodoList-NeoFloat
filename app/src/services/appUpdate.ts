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

  return result.uri;
}

// FLAG_GRANT_READ_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK
const INSTALL_FLAGS = 1 | 268_435_456;

export async function installApk(localUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(localUri);

  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: INSTALL_FLAGS,
  });
}
