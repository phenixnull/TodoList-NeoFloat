import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import GlassCard from '@/components/GlassCard';
import PressableScale from '@/components/PressableScale';
import ScreenShell from '@/components/ScreenShell';
import { fetchSttHealth, type SttHealth } from '@/services/stt';
import { useVoiceTranscription, type VoicePhase } from '@/hooks/useVoiceTranscription';
import { useHabitStore } from '@/store/useHabitStore';
import { useTheme } from '@/theme/theme';

type TranscriptEntry = {
  id: number;
  text: string;
  language?: string | null;
};

const PHASE_HINT: Record<VoicePhase, string> = {
  idle: '点击麦克风开始说话',
  recording: '正在聆听，点击结束',
  transcribing: '电脑端识别中…',
};

export default function VoiceScreen() {
  const router = useRouter();
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const { phase, error, start, stop, clearError } = useVoiceTranscription();
  const serverConfigured = settings.syncEnabled && settings.serverUrl.trim().length > 0;
  const [remoteHealth, setRemoteHealth] = useState<SttHealth | null>(null);
  const [entries, setEntries] = useState<TranscriptEntry[]>([]);
  const [current, setCurrent] = useState<TranscriptEntry | null>(null);

  useEffect(() => {
    if (!serverConfigured) return;
    let alive = true;
    fetchSttHealth(settings.serverUrl).then((result) => {
      if (alive) setRemoteHealth(result);
    });
    return () => {
      alive = false;
    };
  }, [serverConfigured, settings.serverUrl]);
  const health: SttHealth = serverConfigured ? remoteHealth ?? { ok: false } : { ok: false };

  const handleMicPress = useCallback(async () => {
    if (phase === 'recording') {
      const result = await stop();
      if (result) {
        const entry: TranscriptEntry = {
          id: Date.now(),
          text: result.text.trim(),
          language: result.language,
        };
        setCurrent(entry);
        setEntries((prev) => [entry, ...prev].slice(0, 8));
      }
      return;
    }
    if (phase === 'idle') {
      clearError();
      setCurrent(null);
      await start();
    }
  }, [clearError, phase, start, stop]);

  const createTaskWith = useCallback(
    (text: string) => {
      router.push({ pathname: '/tasks/create', params: { voice: text } });
    },
    [router],
  );

  return (
    <ScreenShell style={styles.content}>
      <Stack.Screen options={{ headerShown: false }} />

      <View style={styles.header}>
        <PressableScale
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={[styles.backButton, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
        >
          <MaterialCommunityIcons name="arrow-left" size={18} color={theme.mutedText} />
        </PressableScale>
        <View style={styles.headerTextWrap}>
          <Text style={[styles.title, { color: theme.text }]}>AI 语音助手</Text>
          <Text style={[styles.subtitle, { color: theme.subtleText }]}>说话即转文字 · 中英混合</Text>
        </View>
      </View>

      <View style={[styles.statusRow, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}>
        <View
          style={[styles.statusDot, { backgroundColor: remoteHealth == null ? '#facc15' : health.ok ? '#34d399' : '#f87171' }]}
        />
        <Text style={[styles.statusText, { color: theme.mutedText }]}>
          {remoteHealth == null
            ? '检查语音服务…'
            : health.ok
              ? `语音服务在线${health.model ? ` · ${health.model}` : ''}`
              : '语音服务离线，请确认电脑端服务已启动'}
        </Text>
      </View>

      <MicOrb phase={phase} onPress={handleMicPress} disabled={phase === 'transcribing'} />
      <Text style={[styles.phaseHint, { color: phase === 'recording' ? '#f87171' : theme.subtleText }]}>
        {PHASE_HINT[phase]}
      </Text>

      {error ? (
        <GlassCard style={styles.errorCard}>
          <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#f87171" />
          <Text style={[styles.errorText, { color: '#fca5a5' }]}>{error}</Text>
        </GlassCard>
      ) : null}

      {current ? (
        <GlassCard style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <MaterialCommunityIcons name="text-recognition" size={16} color={theme.accent} />
            <Text style={[styles.resultLabel, { color: theme.accentText }]}>识别结果</Text>
            {current.language ? (
              <View style={[styles.langChip, { borderColor: theme.accentBorder }]}>
                <Text style={[styles.langChipText, { color: theme.accentText }]}>{current.language}</Text>
              </View>
            ) : null}
          </View>
          <Text style={[styles.resultText, { color: theme.text }]}>{current.text}</Text>
          <View style={styles.actionRow}>
            <PressableScale
              onPress={() => createTaskWith(current.text)}
              style={[styles.primaryAction, { backgroundColor: theme.accent }]}
            >
              <MaterialCommunityIcons name="plus-circle-outline" size={16} color={theme.onAccent} />
              <Text style={[styles.primaryActionText, { color: theme.onAccent }]}>创建任务</Text>
            </PressableScale>
            <PressableScale
              onPress={() => setCurrent(null)}
              style={[styles.subtleAction, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
            >
              <MaterialCommunityIcons name="close" size={16} color={theme.mutedText} />
              <Text style={[styles.subtleActionText, { color: theme.mutedText }]}>清除</Text>
            </PressableScale>
          </View>
        </GlassCard>
      ) : null}

      {entries.length > 0 ? (
        <View style={styles.historyWrap}>
          <Text style={[styles.historyTitle, { color: theme.subtleText }]}>本次会话记录</Text>
          {entries.map((entry) => (
            <PressableScale
              key={entry.id}
              onPress={() => setCurrent(entry)}
              style={[styles.historyRow, { borderColor: theme.surfaceBorder, backgroundColor: theme.surface }]}
            >
              <MaterialCommunityIcons name="history" size={15} color={theme.subtleText} />
              <Text numberOfLines={1} style={[styles.historyText, { color: theme.mutedText }]}>
                {entry.text}
              </Text>
            </PressableScale>
          ))}
        </View>
      ) : null}
    </ScreenShell>
  );
}

function MicOrb({
  phase,
  onPress,
  disabled,
}: {
  phase: VoicePhase;
  onPress: () => void;
  disabled: boolean;
}) {
  const pulse = useSharedValue(1);
  const ring = useSharedValue(0.4);

  useEffect(() => {
    if (phase === 'recording') {
      pulse.value = withRepeat(withSpring(1.06, { damping: 8, stiffness: 140 }), -1, true);
      ring.value = withRepeat(
        withTiming(1, { duration: 1100, easing: Easing.out(Easing.quad) }),
        -1,
        false,
      );
    } else {
      pulse.value = withSpring(1);
      ring.value = withTiming(0);
    }
  }, [phase, pulse, ring]);

  const orbStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.45 * (1 - ring.value),
    transform: [{ scale: 1 + 0.55 * ring.value }],
  }));

  const recording = phase === 'recording';
  const transcribing = phase === 'transcribing';

  return (
    <View style={styles.orbWrap}>
      {recording ? (
        <Animated.View pointerEvents="none" style={[styles.orbRing, ringStyle]} />
      ) : null}
      <Animated.View style={orbStyle}>
        <Pressable
          accessibilityLabel={PHASE_HINT[phase]}
          accessibilityRole="button"
          disabled={disabled}
          onPress={onPress}
          style={[
            styles.orb,
            {
              backgroundColor: recording ? 'rgba(239,68,68,0.18)' : 'rgba(34,211,238,0.12)',
              borderColor: recording ? 'rgba(248,113,113,0.55)' : 'rgba(103,232,249,0.35)',
            },
          ]}
        >
          <MaterialCommunityIcons
            name={transcribing ? 'text-recognition' : recording ? 'microphone' : 'microphone-outline'}
            size={46}
            color={recording ? '#f87171' : '#22d3ee'}
          />
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTextWrap: {
    gap: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 12,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  orbWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 168,
  },
  orbRing: {
    position: 'absolute',
    width: 132,
    height: 132,
    borderRadius: 66,
    borderWidth: 2,
    borderColor: 'rgba(248,113,113,0.6)',
  },
  orb: {
    width: 124,
    height: 124,
    borderRadius: 62,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phaseHint: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '600',
    marginTop: -6,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  errorText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
  },
  resultCard: {
    gap: 10,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  resultLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  langChip: {
    marginLeft: 'auto',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  langChipText: {
    fontSize: 10,
    fontWeight: '700',
  },
  resultText: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  primaryActionText: {
    fontSize: 13,
    fontWeight: '800',
  },
  subtleAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  subtleActionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  historyWrap: {
    gap: 8,
  },
  historyTitle: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginLeft: 4,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  historyText: {
    flex: 1,
    fontSize: 13,
  },
});
