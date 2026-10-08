import { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { AudioModule, RecordingPresets, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { dialog } from './dialog/dialogs';
import PressableScale from './PressableScale';
import { transcribeAudio } from '../services/stt';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

type Props = {
  onTranscribed: (text: string) => void;
};

type Phase = 'idle' | 'recording' | 'transcribing';

// Hold-free voice input: tap to start, tap again to finish. The recording is
// sent to the PC-side Qwen3-ASR service through the HabitPulse server.
export default function VoiceInputButton({ onTranscribed }: Props) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>('idle');

  const startRecording = useCallback(async () => {
    if (!settings.syncEnabled || !settings.serverUrl.trim()) {
      dialog.alert('语音识别不可用', '请先在设置中配置并启用同步服务，识别是在电脑端完成的。');
      return;
    }

    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        dialog.alert('需要麦克风权限', '请在系统设置中允许 HabitPulse 使用麦克风。');
        return;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync(RecordingPresets.HIGH_QUALITY);
      recorder.record();
      setPhase('recording');
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch (error) {
      setPhase('idle');
      dialog.alert('录音启动失败', error instanceof Error ? error.message : '请重试。');
    }
  }, [recorder, settings.serverUrl, settings.syncEnabled]);

  const stopRecording = useCallback(async () => {
    setPhase('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error('录音为空，请重试');
      }

      const transcription = await transcribeAudio(settings.serverUrl, uri);
      const text = transcription.text.trim();
      if (!text) {
        dialog.alert('没有听清', '请靠近麦克风再说一次。');
        return;
      }
      onTranscribed(text);
    } catch (error) {
      dialog.alert('语音识别失败', error instanceof Error ? error.message : '请重试。');
    } finally {
      setPhase('idle');
    }
  }, [onTranscribed, recorder, settings.serverUrl]);

  const handlePress = useCallback(() => {
    if (phase === 'idle') {
      void startRecording();
    } else if (phase === 'recording') {
      void stopRecording();
    }
  }, [phase, startRecording, stopRecording]);

  const hint =
    phase === 'recording' ? '正在录音，点击结束' : phase === 'transcribing' ? '识别中…' : '语音输入';
  const active = phase !== 'idle';

  return (
    <View style={styles.container}>
      <PressableScale
        accessibilityLabel={hint}
        accessibilityRole="button"
        disabled={phase === 'transcribing'}
        onPress={handlePress}
        style={[
          styles.button,
          {
            backgroundColor: active ? 'rgba(239,68,68,0.16)' : theme.accentBackground,
            borderColor: active ? 'rgba(239,68,68,0.45)' : theme.accentBorder,
          },
        ]}
      >
        {phase === 'transcribing' ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <MaterialCommunityIcons
            name={phase === 'recording' ? 'microphone' : 'microphone-outline'}
            size={20}
            color={phase === 'recording' ? '#f87171' : theme.accent}
          />
        )}
      </PressableScale>
      <Text style={[styles.hint, { color: phase === 'recording' ? '#f87171' : theme.subtleText }]}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  button: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    fontSize: 10,
    fontWeight: '600',
  },
});
