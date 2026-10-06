import { Pressable, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { getHeatmapCellStyle, HeatmapCell } from '../domain/heatmap';
import { formatDuration } from '../domain/timeTracking';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

type Props = {
  weeks: HeatmapCell[][];
  selectedDate?: string;
  onSelectDate?: (date: string) => void;
};

export default function HeatmapGrid({
  weeks,
  selectedDate,
  onSelectDate,
}: Props) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const systemColorScheme = useColorScheme();

  const getCellLabel = (cell: HeatmapCell) => {
    if (cell.status === 'complete') return '已完成';
    if (cell.status === 'failed') return '打卡失败';
    if (cell.status === 'partial') return `未完成 · 用时 ${formatDuration(cell.durationMs)}`;

    return '无记录';
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.grid}>
        {weeks.map((week, weekIndex) => (
          <View key={`week-${weekIndex}`} style={styles.column}>
            {week.map((cell) => (
              <Pressable
                key={cell.date}
                onPress={() => onSelectDate?.(cell.date)}
                hitSlop={4}
                accessibilityLabel={`${cell.date} ${getCellLabel(cell)}`}
                accessibilityState={{ selected: cell.date === selectedDate }}
                style={[
                  styles.cell,
                  getHeatmapCellStyle(cell, settings.appearance, systemColorScheme),
                  cell.date === selectedDate && [styles.selectedCell, { borderColor: theme.text }],
                ]}
              />
            ))}
          </View>
        ))}
      </View>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[
            styles.legendDot,
            styles.legendEmpty,
            { backgroundColor: theme.inputBackground, borderColor: theme.surfaceBorder },
          ]} />
          <Text style={[styles.legendText, { color: theme.subtleText }]}>无记录</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#38bdf8' }]} />
          <Text style={[styles.legendText, { color: theme.subtleText }]}>有用时未打卡</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#ef4444' }]} />
          <Text style={[styles.legendText, { color: theme.subtleText }]}>打卡失败</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#22c55e' }]} />
          <Text style={[styles.legendText, { color: theme.subtleText }]}>已完成</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 12,
  },
  grid: {
    flexDirection: 'row',
    gap: 4,
  },
  column: {
    gap: 4,
  },
  cell: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  selectedCell: {
    borderWidth: 2,
    borderColor: '#f8fafc',
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendDot: {
    width: 9,
    height: 9,
    borderRadius: 3,
  },
  legendEmpty: {
    backgroundColor: 'rgba(2,6,23,0.78)',
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.22)',
  },
  legendText: {
    color: 'rgba(148,163,184,0.72)',
    fontSize: 10,
    fontWeight: '600',
  },
});
