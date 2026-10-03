import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import GlassCard from './GlassCard';
import PressableScale from './PressableScale';
import { Task, TimeSegment } from '../domain/types';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';
import {
  calculateTaskDurationMs,
  calculateTimeSegmentsDurationForDate,
  clearTimeSegmentsForDate,
  createTimeSegment,
  formatDuration,
  getTaskTimeSegmentsForDate,
  isTimerRunning,
  resetTaskDuration,
} from '../domain/timeTracking';

type Props = {
  task: Task;
  date: string;
  accentColor: string;
  onToggleTimer: (taskId: string) => void;
  onUpdateTask: (
    taskId: string,
    input: Partial<Pick<Task, 'timerSegments' | 'manualDurationMs'>>,
  ) => void;
};

type Draft = {
  id?: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
};

function toDateInput(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function toTimeInput(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function toShortTime(value: string): string {
  return new Date(value).toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function draftFromSegment(segment: TimeSegment): Draft {
  return {
    id: segment.id,
    startDate: toDateInput(segment.startAt),
    startTime: toTimeInput(segment.startAt),
    endDate: segment.stopAt ? toDateInput(segment.stopAt) : toDateInput(new Date().toISOString()),
    endTime: segment.stopAt ? toTimeInput(segment.stopAt) : toTimeInput(new Date().toISOString()),
  };
}

function emptyDraft(date: string): Draft {
  return {
    startDate: date,
    startTime: '09:00',
    endDate: date,
    endTime: '10:00',
  };
}

function draftToSegment(draft: Draft): TimeSegment | null {
  const segment = createTimeSegment(
    draft.startDate,
    draft.startTime,
    draft.endDate,
    draft.endTime,
  );

  return segment && draft.id ? { ...segment, id: draft.id } : segment;
}

function SegmentEditor({
  segment,
  date,
  accentColor,
  onSave,
  onDelete,
}: {
  segment: TimeSegment;
  date: string;
  accentColor: string;
  onSave: (segment: TimeSegment) => void;
  onDelete: (id: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFromSegment(segment));
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const open = !segment.stopAt;

  const save = () => {
    const next = draftToSegment(draft);

    if (!next) {
      setError('请检查日期和时间，结束必须晚于开始');
      return;
    }

    onSave(next);
    setEditing(false);
    setError('');
  };

  if (open) {
    return (
      <View style={[styles.segmentRow, {
        borderColor: theme.surfaceBorder,
        backgroundColor: theme.inputBackground,
      }]}>
        <View style={styles.segmentCopy}>
          <Text style={[styles.segmentTitle, { color: accentColor }]}>计时中</Text>
          <Text style={[styles.segmentMeta, { color: theme.subtleText }]}>
            从 {toShortTime(segment.startAt)} 开始 · 结束时会保存这段记录
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.segmentRow, {
      borderColor: theme.surfaceBorder,
      backgroundColor: theme.inputBackground,
    }]}>
      <View style={styles.segmentHeader}>
        <View style={styles.segmentCopy}>
          <Text style={[styles.segmentTitle, { color: theme.text }]}>
            {toShortTime(segment.startAt)} – {toShortTime(segment.stopAt!)}
          </Text>
          <Text style={[styles.segmentMeta, { color: theme.subtleText }]}>
            {toDateInput(segment.startAt)}{toDateInput(segment.startAt) === toDateInput(segment.stopAt!)
              ? ''
              : ` → ${toDateInput(segment.stopAt!)}`}
            {` · ${date}`}
          </Text>
        </View>

        <PressableScale
          style={[styles.miniButton, { backgroundColor: `${accentColor}1f` }]}
          accessibilityLabel="编辑这个时间段"
          onPress={() => setEditing((value) => !value)}
        >
          <MaterialCommunityIcons
            name={editing ? 'close' : 'pencil'}
            size={15}
            color={accentColor}
          />
        </PressableScale>
      </View>

      {editing ? (
        <View style={styles.editorBox}>
          <View style={styles.draftGrid}>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>开始日期</Text>
              <TextInput
                value={draft.startDate}
                onChangeText={(value) => setDraft({ ...draft, startDate: value })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>开始时间</Text>
              <TextInput
                value={draft.startTime}
                onChangeText={(value) => setDraft({ ...draft, startTime: value })}
                placeholder="HH:mm"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>结束日期</Text>
              <TextInput
                value={draft.endDate}
                onChangeText={(value) => setDraft({ ...draft, endDate: value })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>结束时间</Text>
              <TextInput
                value={draft.endTime}
                onChangeText={(value) => setDraft({ ...draft, endTime: value })}
                placeholder="HH:mm"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
          </View>

          {error ? <Text style={[styles.error, { color: theme.isLight ? '#b91c1c' : '#fca5a5' }]}>{error}</Text> : null}

          <View style={styles.segmentActions}>
            <PressableScale
              style={[styles.segmentSaveButton, {
                borderColor: `${accentColor}55`,
                backgroundColor: theme.surface,
              }]}
              onPress={save}
            >
              <Text style={[styles.segmentSaveText, { color: accentColor }]}>保存时间段</Text>
            </PressableScale>
            <PressableScale
              style={[styles.segmentDeleteButton, {
                borderColor: theme.isLight ? 'rgba(185,28,28,0.20)' : 'rgba(252,165,165,0.22)',
                backgroundColor: theme.isLight ? 'rgba(220,38,38,0.08)' : 'rgba(248,113,113,0.10)',
              }]}
              accessibilityLabel="删除这个时间段"
              onPress={() => onDelete(segment.id)}
            >
              <Text style={[styles.segmentDeleteText, { color: theme.isLight ? '#b91c1c' : '#fca5a5' }]}>
                删除
              </Text>
            </PressableScale>
          </View>
        </View>
      ) : null}
    </View>
  );
}

export default function TimeSegmentsEditor({
  task,
  date,
  accentColor,
  onToggleTimer,
  onUpdateTask,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(date));
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const [error, setError] = useState('');
  const segments = getTaskTimeSegmentsForDate(task, date);
  const dayDuration = calculateTimeSegmentsDurationForDate(task, date);
  const totalDuration = calculateTaskDurationMs(task);
  const running = isTimerRunning(task);

  const saveNewSegment = () => {
    const segment = draftToSegment(draft);

    if (!segment) {
      setError('请检查日期和时间，结束必须晚于开始');
      return;
    }

    onUpdateTask(task.id, {
      timerSegments: [...task.timerSegments, segment],
    });
    setAdding(false);
    setDraft(emptyDraft(date));
    setError('');
  };

  const replaceSegment = (segment: TimeSegment) => {
    onUpdateTask(task.id, {
      timerSegments: task.timerSegments.map((item) => (item.id === segment.id ? segment : item)),
    });
  };

  const deleteSegment = (id: string) => {
    onUpdateTask(task.id, {
      timerSegments: task.timerSegments.filter((item) => item.id !== id),
    });
  };

  return (
    <GlassCard style={styles.card}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>时间段记录</Text>
          <Text style={[styles.date, { color: theme.accentText }]}>{date}</Text>
        </View>
        <PressableScale
          style={[styles.timerButton, {
            borderColor: `${accentColor}66`,
            backgroundColor: theme.inputBackground,
          }]}
          accessibilityLabel={`${running ? '暂停' : '开始'}${task.name}耗时`}
          onPress={() => onToggleTimer(task.id)}
        >
          <MaterialCommunityIcons name={running ? 'pause' : 'play'} size={17} color={accentColor} />
          <Text style={[styles.timerText, { color: accentColor }]}>
            {running ? '暂停' : '开始'}
          </Text>
        </PressableScale>
      </View>

      <View style={styles.summaryRow}>
        <View style={[styles.summaryItem, {
          borderColor: theme.surfaceBorder,
          backgroundColor: theme.inputBackground,
        }]}>
          <Text style={[styles.summaryValue, { color: theme.text }]}>
            {formatDuration(dayDuration)}
          </Text>
          <Text style={[styles.summaryLabel, { color: theme.subtleText }]}>当天记录</Text>
        </View>
        <View style={[styles.summaryItem, {
          borderColor: theme.surfaceBorder,
          backgroundColor: theme.inputBackground,
        }]}>
          <Text style={[styles.summaryValue, { color: theme.text }]}>
            {formatDuration(totalDuration)}
          </Text>
          <Text style={[styles.summaryLabel, { color: theme.subtleText }]}>任务累计</Text>
        </View>
      </View>

      {segments.length === 0 ? (
        <Text style={[styles.empty, { color: theme.subtleText }]}>
          这一天还没有时间段，可以随时开始/暂停。
        </Text>
      ) : (
        <View style={styles.segmentList}>
          {segments.map((segment) => (
            <SegmentEditor
              key={`${segment.id}-${segment.startAt}-${segment.stopAt ?? 'live'}`}
              segment={segment}
              date={date}
              accentColor={accentColor}
              onSave={replaceSegment}
              onDelete={deleteSegment}
            />
          ))}
        </View>
      )}

      {adding ? (
        <View style={styles.editorBox}>
          <View style={styles.draftGrid}>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>开始日期</Text>
              <TextInput
                value={draft.startDate}
                onChangeText={(value) => setDraft({ ...draft, startDate: value })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>开始时间</Text>
              <TextInput
                value={draft.startTime}
                onChangeText={(value) => setDraft({ ...draft, startTime: value })}
                placeholder="HH:mm"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>结束日期</Text>
              <TextInput
                value={draft.endDate}
                onChangeText={(value) => setDraft({ ...draft, endDate: value })}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
            <View style={styles.draftField}>
              <Text style={[styles.draftLabel, { color: theme.mutedText }]}>结束时间</Text>
              <TextInput
                value={draft.endTime}
                onChangeText={(value) => setDraft({ ...draft, endTime: value })}
                placeholder="HH:mm"
                placeholderTextColor={theme.isLight ? 'rgba(71,85,105,0.55)' : 'rgba(148,163,184,0.45)'}
                style={[styles.draftInput, {
                  borderColor: theme.inputBorder,
                  backgroundColor: theme.surface,
                  color: theme.text,
                }]}
              />
            </View>
          </View>

          {error ? <Text style={[styles.error, { color: theme.isLight ? '#b91c1c' : '#fca5a5' }]}>{error}</Text> : null}

          <View style={styles.segmentActions}>
            <PressableScale
              style={[styles.segmentSaveButton, {
                borderColor: `${accentColor}55`,
                backgroundColor: theme.surface,
              }]}
              onPress={saveNewSegment}
            >
              <Text style={[styles.segmentSaveText, { color: accentColor }]}>添加</Text>
            </PressableScale>
            <PressableScale
              style={[styles.segmentDeleteButton, {
                borderColor: theme.surfaceBorder,
                backgroundColor: theme.inputBackground,
              }]}
              onPress={() => setAdding(false)}
            >
              <Text style={[styles.segmentDeleteText, { color: theme.mutedText }]}>取消</Text>
            </PressableScale>
          </View>
        </View>
      ) : (
        <View style={styles.footerActions}>
          <PressableScale
            style={[styles.secondaryButton, {
              borderColor: `${accentColor}44`,
              backgroundColor: theme.inputBackground,
            }]}
            onPress={() => {
              setDraft(emptyDraft(date));
              setError('');
              setAdding(true);
            }}
          >
            <MaterialCommunityIcons name="plus" size={16} color={accentColor} />
            <Text style={[styles.secondaryText, { color: accentColor }]}>补时间段</Text>
          </PressableScale>

          <PressableScale
            style={[styles.secondaryButton, {
              borderColor: theme.isLight ? 'rgba(180,83,9,0.22)' : 'rgba(251,191,36,0.22)',
              backgroundColor: theme.isLight ? 'rgba(245,158,11,0.08)' : 'rgba(251,191,36,0.07)',
            }]}
            onPress={() => Alert.alert(
              '清空当天时间段',
              `将删除 ${date} 这一天的计时记录，跨天记录会保留其他日期的部分。`,
              [
                { text: '取消', style: 'cancel' },
                {
                  text: '清空',
                  style: 'destructive',
                  onPress: () => onUpdateTask(task.id, {
                    timerSegments: clearTimeSegmentsForDate(task, date).timerSegments,
                  }),
                },
              ],
            )}
          >
            <MaterialCommunityIcons
              name="calendar-remove"
              size={16}
              color={theme.isLight ? '#b45309' : '#fbbf24'}
            />
            <Text style={[styles.secondaryText, { color: theme.isLight ? '#b45309' : '#fbbf24' }]}>
              清空这天
            </Text>
          </PressableScale>

          <PressableScale
            style={[styles.dangerButton, {
              borderColor: theme.isLight ? 'rgba(185,28,28,0.20)' : 'rgba(252,165,165,0.22)',
              backgroundColor: theme.isLight ? 'rgba(220,38,38,0.08)' : 'rgba(248,113,113,0.07)',
            }]}
            onPress={() => Alert.alert(
              '重置全部耗时',
              '将删除该任务所有计时时间段和额外耗时，此操作不可撤销。',
              [
                { text: '取消', style: 'cancel' },
                {
                  text: '重置',
                  style: 'destructive',
                  onPress: () => {
                    const reset = resetTaskDuration(task);
                    onUpdateTask(task.id, {
                      timerSegments: reset.timerSegments,
                      manualDurationMs: reset.manualDurationMs,
                    });
                  },
                },
              ],
            )}
          >
            <MaterialCommunityIcons
              name="restart"
              size={16}
              color={theme.isLight ? '#b91c1c' : '#fca5a5'}
            />
            <Text style={[styles.secondaryText, { color: theme.isLight ? '#b91c1c' : '#fca5a5' }]}>
              重置全部
            </Text>
          </PressableScale>
        </View>
      )}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  title: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  date: {
    color: '#67e8f9',
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  timerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
  },
  summaryRow: {
    flexDirection: 'row',
    gap: 10,
  },
  summaryItem: {
    flex: 1,
    alignItems: 'center',
    gap: 3,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    backgroundColor: 'rgba(2,6,23,0.28)',
    paddingVertical: 11,
  },
  summaryValue: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  summaryLabel: {
    color: 'rgba(148,163,184,0.75)',
    fontSize: 11,
    fontWeight: '700',
  },
  empty: {
    color: 'rgba(148,163,184,0.68)',
    fontSize: 12,
    textAlign: 'center',
    paddingVertical: 8,
  },
  segmentList: {
    gap: 8,
  },
  segmentRow: {
    gap: 9,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.14)',
    backgroundColor: 'rgba(2,6,23,0.24)',
    padding: 10,
  },
  segmentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  segmentCopy: {
    flex: 1,
    gap: 2,
  },
  segmentTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  segmentMeta: {
    color: 'rgba(148,163,184,0.72)',
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  miniButton: {
    width: 30,
    height: 30,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(167,139,250,0.12)',
  },
  editorBox: {
    gap: 9,
  },
  draftGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  draftField: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
  },
  draftLabel: {
    color: 'rgba(226,232,240,0.72)',
    fontSize: 11,
    fontWeight: '700',
  },
  draftInput: {
    borderWidth: 1,
    borderColor: 'rgba(148,163,184,0.18)',
    borderRadius: 12,
    backgroundColor: 'rgba(2,6,23,0.40)',
    color: '#f8fafc',
    fontSize: 13,
    paddingHorizontal: 9,
    paddingVertical: 8,
    fontVariant: ['tabular-nums'],
  },
  error: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '700',
  },
  segmentActions: {
    flexDirection: 'row',
    gap: 8,
  },
  segmentSaveButton: {
    flex: 1,
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 9,
  },
  segmentSaveText: {
    fontSize: 12,
    fontWeight: '800',
  },
  segmentDeleteButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.22)',
    borderRadius: 13,
    backgroundColor: 'rgba(252,165,165,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  segmentDeleteText: {
    color: '#fca5a5',
    fontSize: 12,
    fontWeight: '800',
  },
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  secondaryButton: {
    flex: 1,
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 10,
  },
  dangerButton: {
    flex: 1,
    minWidth: 92,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(252,165,165,0.22)',
    borderRadius: 14,
    backgroundColor: 'rgba(252,165,165,0.07)',
    paddingVertical: 10,
  },
  secondaryText: {
    fontSize: 12,
    fontWeight: '800',
  },
});

