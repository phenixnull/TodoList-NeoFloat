import { useCallback, useState } from 'react';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { transcribeAudio, type SttTranscription } from '../services/stt';
import { useHabitStore } from '../store/useHabitStore';

export type VoicePhase = 'idle' | 'recording' | 'transcribing';

// Shared recording + PC-side ASR pipeline used by the dedicated AI voice
// screen. Tap to start, tap again to finish; recognition runs on the PC.
export function useVoiceTranscription() {
  const { settings } = useHabitStore();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => setError(null), []);

  const start = useCallback(async (): Promise<boolean> => {
    setError(null);
    if (!settings.syncEnabled || !settings.serverUrl.trim()) {
      setError('请先在设置中配置并启用同步服务，识别是在电脑端完成的。');
      return false;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        setError('需要麦克风权限，请在系统设置中允许 HabitPulse 使用麦克风。');
        return false;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      recorder.record();
      setPhase('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '录音启动失败，请重试。');
      return false;
    }
  }, [recorder, settings.serverUrl, settings.syncEnabled]);

  const stop = useCallback(async (): Promise<SttTranscription | null> => {
    setPhase('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error('录音为空，请重试');
      }

      const transcription = await transcribeAudio(settings.serverUrl, uri);
      if (!transcription.text.trim()) {
        setError('没有听清，请靠近麦克风再说一次。');
        return null;
      }
      return transcription;
    } catch (e) {
      setError(e instanceof Error ? e.message : '语音识别失败，请重试。');
      return null;
    } finally {
      setPhase('idle');
    }
  }, [recorder, settings.serverUrl]);

  return { phase, error, start, stop, clearError };
}
