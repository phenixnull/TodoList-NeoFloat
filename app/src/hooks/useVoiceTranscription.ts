import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { useSharedValue } from 'react-native-reanimated';
import { transcribeAudio } from '../services/stt';
import { useHabitStore } from '../store/useHabitStore';

/*
 * The streaming session box must stay mutable across the async segment loop
 * (started from an event handler, finishing after unmount). The compiler
 * purity rules cannot model that, so they are relaxed for this file only.
 */
/* eslint-disable react-hooks/immutability, react-hooks/refs */

// How long one streaming segment records before it is flushed to the PC for
// transcription. The next segment starts immediately, so dictation feels
// continuous while partial text accumulates.
const SEGMENT_MS = 4000;

export type VoicePhase = 'idle' | 'streaming' | 'finalizing';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// Mic toggle + streaming recognition: while voice mode is on, audio is cut
// into segments that stream to the PC-side ASR; partial text accumulates live.
// `metering` (0..1) drives the wave animation; ~0 when silent.
export function useVoiceTranscription() {
  const { settings } = useHabitStore();
  const metering = useSharedValue(0);
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [partialText, setPartialText] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Plain mutable session box (not a ref) so segment bookkeeping stays outside
  // React state and the compiler lint rules stay happy.
  const session = useMemo(
    () => ({
      active: false,
      token: 0,
      segIndex: 0,
      texts: new Map<number, string>(),
      promises: [] as Promise<void>[],
      loop: Promise.resolve(),
    }),
    [],
  );

  const recOptions = useMemo(
    () => ({ ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }),
    [],
  );

  const clearError = useCallback(() => setError(null), []);
  const recorder = useAudioRecorder(recOptions);
  // Polling state carries the live `metering` (dB) when metering is enabled.
  const recorderState = useAudioRecorderState(recorder, 120);

  useEffect(() => {
    if (typeof recorderState.metering === 'number') {
      // metering is dB (roughly -60..0); normalize into 0..1.
      metering.value = Math.min(1, Math.max(0, (recorderState.metering + 50) / 50));
    }
  }, [metering, recorderState.metering]);

  const transcribeSegment = useCallback(
    async (index: number, uri: string) => {
      let text = '';
      try {
        const result = await transcribeAudio(settings.serverUrl, uri);
        text = result.text.trim();
      } catch {
        text = '';
      }
      session.texts.set(index, text);
      const joined = [...session.texts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, value]) => value)
        .join('')
        .trim();
      setPartialText(joined);
    },
    [session, settings.serverUrl],
  );

  const segmentLoop = useCallback(
    async (token: number) => {
      while (session.active && session.token === token) {
        const index = session.segIndex;
        session.segIndex += 1;

        try {
          await recorder.prepareToRecordAsync(recOptions);
          recorder.record();
        } catch {
          setError('录音启动失败，请重试。');
          session.active = false;
          break;
        }

        const endAt = Date.now() + SEGMENT_MS;
        while (Date.now() < endAt && session.active && session.token === token) {
          await sleep(100);
        }

        try {
          await recorder.stop();
        } catch {
          // Another stop already finalized this segment.
        }
        const uri = recorder.uri;
        if (uri) {
          const pending = transcribeSegment(index, uri);
          session.promises.push(pending);
          await pending;
        }
      }
    },
    [recorder, recOptions, session, transcribeSegment],
  );

  const beginVoice = useCallback(async (): Promise<boolean> => {
    setError(null);
    setPartialText('');
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
      session.active = true;
      session.segIndex = 0;
      session.texts.clear();
      session.promises = [];
      session.token += 1;
      metering.value = 0;
      setPhase('streaming');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      session.loop = segmentLoop(session.token);
      return true;
    } catch (e) {
      session.active = false;
      setError(e instanceof Error ? e.message : '录音启动失败，请重试。');
      return false;
    }
  }, [metering, recorder, segmentLoop, session, settings.serverUrl, settings.syncEnabled]);

  // Finish streaming: flush the trailing segment, wait for all partials, and
  // return the combined text (null when nothing usable was recognized).
  const endVoice = useCallback(async (): Promise<string | null> => {
    session.active = false;
    setPhase('finalizing');
    try {
      await recorder.stop();
    } catch {
      // The segment loop may have stopped it already.
    }
    await session.loop.catch(() => {});
    await Promise.all(session.promises);

    const text = [...session.texts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, value]) => value)
      .join('')
      .trim();
    session.texts.clear();
    session.promises = [];
    setPartialText('');
    metering.value = 0;
    setPhase('idle');
    if (!text) {
      setError('没有听清，请靠近麦克风再说一次。');
      return null;
    }
    return text;
  }, [metering, recorder, session]);

  return { phase, error, metering, partialText, beginVoice, endVoice, clearError };
}
