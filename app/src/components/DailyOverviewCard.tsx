import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ProgressRing from './ProgressRing';
import { useTheme } from '../theme/theme';

type Props = {
  today: string;
  completedCount: number;
  totalCount: number;
};

function getMsUntilMidnight(nowMs: number): number {
  const now = new Date(nowMs);
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight.getTime() - now.getTime();
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((value) => value.toString().padStart(2, '0'))
    .join(':');
}

export default function DailyOverviewCard({ today, completedCount, totalCount }: Props) {
  // Home follows the light-orange diary palette.
  const theme = useTheme('light');
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const progress = totalCount === 0 ? 0 : completedCount / totalCount;
  const percent = Math.round(progress * 100);
  const message = totalCount === 0
    ? '创建第一个打卡任务'
    : progress === 1
      ? '今天全部完成'
      : '保持节奏，继续推进';
  const remaining = getMsUntilMidnight(nowMs);
  const countdownUrgent = remaining < 60_000;

  return (
    <View style={[styles.card, { backgroundColor: '#fff6d6' }]}>
      <Text style={[styles.eyebrow, { color: '#b09355' }]}>今日进度 · {today}</Text>

      <View style={styles.mainRow}>
        <View style={styles.copyBox}>
          <Text style={styles.bigValue}>
            <Text style={{ color: '#26262a' }}>{completedCount}</Text>
            <Text style={[styles.totalValue, { color: theme.subtleText }]}> / {totalCount}</Text>
          </Text>
          <Text style={[styles.caption, { color: '#55555c' }]}>已完成任务</Text>
          <Text
            style={[styles.message, { color: '#e8890c' }]}
            numberOfLines={1}
          >
            {progress === 1 ? '🎉 ' : ''}{message}
          </Text>
        </View>

        <View style={styles.ringWrap}>
          <ProgressRing
            progress={progress}
            size={98}
            color="#f59e0b"
            trackColor="#f3e3b2"
          />
          <Text style={[styles.ringPercent, { color: '#26262a' }]}>{percent}%</Text>
        </View>
      </View>

      <View style={[styles.divider, { backgroundColor: 'rgba(160,120,20,0.18)' }]} />

      <View style={styles.countdownRow}>
        <View style={styles.countdownLabel}>
          <MaterialCommunityIcons
            name="clock-time-four-outline"
            size={13}
            color="#b09355"
          />
          <Text style={[styles.countdownText, { color: theme.subtleText }]}>
            距次日刷新
          </Text>
        </View>
        <Text
          style={[
            styles.countdownValue,
            { color: countdownUrgent ? '#e8890c' : '#26262a' },
          ]}
        >
          {formatCountdown(remaining)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    gap: 12,
    borderRadius: 18,
  },
  eyebrow: {
    fontSize: 11.5,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  mainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  copyBox: {
    flex: 1,
    gap: 2,
  },
  bigValue: {
    fontSize: 40,
    fontWeight: '900',
    letterSpacing: -1,
  },
  totalValue: {
    fontSize: 22,
    fontWeight: '700',
  },
  caption: {
    fontSize: 12,
    fontWeight: '600',
  },
  message: {
    fontSize: 12.5,
    fontWeight: '700',
    marginTop: 3,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringPercent: {
    position: 'absolute',
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  countdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countdownLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  countdownText: {
    fontSize: 12,
    fontWeight: '600',
  },
  countdownValue: {
    fontSize: 15,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: 0.5,
  },
});
