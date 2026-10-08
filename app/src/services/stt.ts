import * as FileSystem from 'expo-file-system/legacy';
import { normalizeServerUrl } from './api';

export interface SttTranscription {
  text: string;
  language?: string | null;
}

const STT_TIMEOUT_MS = 60_000;
const MAX_AUDIO_BYTES = 24_000_000;

export interface SttHealth {
  ok: boolean;
  model?: string;
}

export async function fetchSttHealth(serverUrl: string): Promise<SttHealth> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/stt/health`, {
      signal: controller.signal,
    });
    if (!response.ok) return { ok: false };
    const payload = (await response.json()) as {
      ok?: boolean;
      upstream?: { ok?: boolean; model?: string } | null;
    };
    return {
      ok: !!payload.upstream?.ok,
      model: payload.upstream?.model,
    };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timeout);
  }
}

function audioFormatFromUri(uri: string): string {
  const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(uri);
  const extension = match?.[1]?.toLowerCase();
  if (extension === 'caf') return 'wav';
  if (extension === '3gpp') return '3gp';
  return extension ?? 'm4a';
}

// Records are small (m4a), so a base64 JSON body keeps the pipeline simple and
// matches how day-record images already travel to the server.
export async function transcribeAudio(
  serverUrl: string,
  audioUri: string,
  language?: string | null,
): Promise<SttTranscription> {
  const audioBase64 = await FileSystem.readAsStringAsync(audioUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!audioBase64 || audioBase64.length < 8) {
    throw new Error('录音内容为空');
  }
  if (audioBase64.length > MAX_AUDIO_BYTES) {
    throw new Error('录音太长，请控制在 1 分钟以内');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), STT_TIMEOUT_MS);
  try {
    const response = await fetch(`${normalizeServerUrl(serverUrl)}/api/stt/transcribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioBase64,
        audioFormat: audioFormatFromUri(audioUri),
        language: language ?? null,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      if (response.status === 502 || response.status === 503) {
        throw new Error('电脑端语音识别服务未启动');
      }
      if (response.status === 400) {
        throw new Error('录音格式不受支持，请重新录音');
      }
      throw new Error(`语音识别请求失败 (${response.status})`);
    }

    const payload = (await response.json()) as Partial<SttTranscription>;
    if (typeof payload.text !== 'string') {
      throw new Error('语音识别结果为空');
    }
    return { text: payload.text, language: payload.language ?? null };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('语音识别超时，请重试');
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
