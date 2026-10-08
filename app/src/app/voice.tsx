import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { dialog } from '@/components/dialog/dialogs';
import { VoiceRecord } from '@/domain/types';
import { useVoiceTranscription } from '@/hooks/useVoiceTranscription';
import { useHabitStore } from '@/store/useHabitStore';

/* Diary-style light palette (mirrors Diary/app/index.html) */
const C = {
  page: '#f2f2f4',
  bg: '#ffffff',
  ink: '#26262a',
  ink2: '#55555c',
  ink3: '#9a9aa2',
  ink4: '#c6c6cd',
  orange: '#f59e0b',
  orangeDeep: '#e8890c',
  cream: '#fff6d6',
  creamDeep: '#fbe7a6',
  creamInk: '#8a6a1c',
  creamLabel: '#b09355',
  pill: '#f5f5f6',
  dark: '#2b2b2e',
  dark2: '#48484d',
  green: '#2fa66a',
  greenBg: '#e6f6ee',
  line: '#ececef',
  pillText: '#3a3a40',
  recording: '#ff8f4d',
};

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'text', label: '文字' },
  { key: 'image', label: '图片' },
  { key: 'voice', label: '语音' },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];
type ComposerMode = 'voice' | 'text';
type PendingImage = { id: string; dataUrl: string };

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function dayParts(iso: string, now: Date): { main: string; date: string; wd: string; key: string } {
  const d = new Date(iso);
  const wd = `(${WEEKDAYS[d.getDay()]})`;
  const date = `${d.getMonth() + 1}月${d.getDate()}日`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return { main: '今天', date, wd, key: `今天${date}` };
  if (sameDay(d, yesterday)) return { main: '昨天', date, wd, key: `昨天${date}` };
  return { main: '', date, wd, key: date };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return <Text>{text}</Text>;
  const index = text.toLowerCase().indexOf(q.toLowerCase());
  if (index < 0) return <Text>{text}</Text>;
  return (
    <Text>
      {text.slice(0, index)}
      <Text style={styles.mark}>{text.slice(index, index + q.length)}</Text>
      {text.slice(index + q.length)}
    </Text>
  );
}

export default function VoiceScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { voiceRecords, createVoiceRecord, deleteVoiceRecord } = useHabitStore();
  const { phase, error, start, stop, clearError } = useVoiceTranscription();

  const [mode, setMode] = useState<ComposerMode>('voice');
  const [draft, setDraft] = useState('');
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const searchInputRef = useRef<TextInput>(null);

  const recording = phase === 'recording';
  const composing = mode === 'text' && (draft.trim().length > 0 || pendingImages.length > 0);

  const now = useMemo(() => new Date(), []);
  const filteredRecords = useMemo(() => {
    return (voiceRecords ?? []).filter((record) => {
      if (filter === 'text') return record.source !== 'voice' && record.images.length === 0;
      if (filter === 'image') return record.images.length > 0;
      if (filter === 'voice') return record.source === 'voice';
      return true;
    }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [filter, voiceRecords]);

  const dayGroups = useMemo(() => {
    const buckets: { key: string; main: string; date: string; wd: string; records: VoiceRecord[] }[] = [];
    for (const record of filteredRecords) {
      const parts = dayParts(record.createdAt, now);
      let bucket = buckets.find((b) => b.key === parts.key);
      if (!bucket) {
        bucket = { key: parts.key, main: parts.main, date: parts.date, wd: parts.wd, records: [] };
        buckets.push(bucket);
      }
      bucket.records.push(record);
    }
    return buckets;
  }, [filteredRecords, now]);

  const searchResults = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filteredRecords;
    return filteredRecords.filter((record) => record.text.toLowerCase().includes(q));
  }, [filteredRecords, query]);

  const summary = useMemo(() => {
    const monthRecords = (voiceRecords ?? []).filter((record) => {
      const d = new Date(record.createdAt);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    });
    const chars = monthRecords.reduce((sum, record) => sum + record.text.length, 0);
    const activeDays = new Set(monthRecords.map((record) => new Date(record.createdAt).toDateString()));
    let streak = 0;
    for (let i = 0; i < 400; i += 1) {
      const day = new Date(now);
      day.setDate(now.getDate() - i);
      if (activeDays.has(day.toDateString())) streak += 1;
      else if (i > 0) break;
    }
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const pct = Math.min(100, Math.round((activeDays.size / daysInMonth) * 100));
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const week = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + i);
      return WEEKDAYS[day.getDay()];
    });
    return {
      monthLabel: `${now.getFullYear()}年${now.getMonth() + 1}月`,
      count: monthRecords.length,
      chars,
      streak,
      pct,
      week,
      todayIndex: now.getDay(),
    };
  }, [now, voiceRecords]);

  const submitText = useCallback(() => {
    const text = draft.trim();
    if (!text && pendingImages.length === 0) {
      dialog.alert('记录', '先写点什么吧');
      return;
    }
    createVoiceRecord({
      text: text || '[图片]',
      source: 'keyboard',
      images: pendingImages.map((image) => image.dataUrl),
    });
    setDraft('');
    setPendingImages([]);
  }, [createVoiceRecord, draft, pendingImages]);

  const finishRecording = useCallback(async () => {
    const result = await stop();
    if (!result) {
      if (error) dialog.alert('语音记录', error);
      return;
    }
    createVoiceRecord({ text: result.text, language: result.language, source: 'voice' });
  }, [createVoiceRecord, error, stop]);

  const handleCenterPressIn = useCallback(() => {
    if (mode !== 'voice' || recording) return;
    clearError();
    void start();
  }, [clearError, mode, recording, start]);

  const handleCenterPressOut = useCallback(() => {
    if (recording) void finishRecording();
  }, [finishRecording, recording]);

  const pickImages = useCallback(async () => {
    const remaining = 3 - pendingImages.length;
    if (remaining <= 0) {
      dialog.alert('图片数量已达上限', '每条记录最多附带 3 张图片。');
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: remaining,
      quality: 0.8,
      exif: false,
    });
    if (picked.canceled) return;
    const next: PendingImage[] = [];
    for (const asset of picked.assets) {
      try {
        const manipulated = await ImageManipulator.manipulateAsync(
          asset.uri,
          [{ resize: { width: 1080 } }],
          { compress: 0.72, format: ImageManipulator.SaveFormat.JPEG, base64: true },
        );
        if (manipulated.base64) {
          next.push({
            id: `${asset.assetId ?? asset.uri}-${Date.now()}-${next.length}`,
            dataUrl: `data:image/jpeg;base64,${manipulated.base64}`,
          });
        }
      } catch {
        dialog.alert('图片处理失败', '请换一张图片再试。');
      }
    }
    setPendingImages((prev) => [...prev, ...next].slice(0, 3));
  }, [pendingImages.length]);

  const confirmDelete = useCallback((record: VoiceRecord) => {
    dialog.confirm({
      title: '删除这条记录?',
      message: record.text,
      confirmText: '删除',
      danger: true,
      onConfirm: () => {
        void deleteVoiceRecord(record.id);
      },
    });
  }, [deleteVoiceRecord]);

  const renderEntry = useCallback((record: VoiceRecord, showRail: boolean, searchQ: string) => {
    const expanded = expandedId === record.id;
    const chars = record.text.length;
    return (
      <Pressable
        key={record.id}
        onLongPress={() => confirmDelete(record)}
        delayLongPress={450}
        onPress={() => setExpandedId((prev) => (prev === record.id ? null : record.id))}
        style={styles.entry}
      >
        <Text style={styles.entryTime}>{formatTime(record.createdAt)}</Text>
        <View style={styles.entryBody}>
          <View style={styles.titlePill}>
            <Text numberOfLines={expanded ? undefined : 1} style={styles.titlePillText}>
              {highlight(record.text, searchQ)}
            </Text>
          </View>
          {record.images.length > 0 ? (
            <View style={styles.entryImgs}>
              {record.images.map((image, index) => (
                <Image
                  key={`${record.id}-${index}`}
                  source={{ uri: image }}
                  style={expanded ? styles.entryImgLarge : styles.entryImg}
                  contentFit="cover"
                />
              ))}
            </View>
          ) : null}
        </View>
        <View style={styles.entryMeta}>
          {record.source === 'voice' ? (
            <MaterialCommunityIcons name="microphone" size={12} color={C.ink4} />
          ) : null}
          <Text style={styles.entryMetaText}>{chars}字</Text>
        </View>
        {showRail ? <View style={styles.rail} /> : null}
      </Pressable>
    );
  }, [confirmDelete, expandedId]);

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          accessibilityLabel="返回"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.headerIconBtn}
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color={C.ink} />
        </Pressable>
        <View style={styles.appTitle}>
          <View style={styles.appTitleUnderline} />
          <Text style={styles.appTitleText}>记录</Text>
        </View>
      </View>

      <ScrollView style={styles.main} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.monthLabel}>{summary.monthLabel}</Text>
            <View style={styles.monthPill}>
              <Text style={styles.monthPillText}>本月 {summary.count} 篇</Text>
            </View>
          </View>
          <View style={styles.cardMid}>
            <View style={styles.statCol}>
              <Text style={styles.statLabel}>本月记录</Text>
              <Text style={styles.statNum}>
                {summary.count}
                <Text style={styles.statUnit}>篇</Text>
              </Text>
              <View style={styles.statSub}>
                <View style={styles.tagGreen}>
                  <Text style={styles.tagGreenText}>连续 {summary.streak} 天</Text>
                </View>
                <Text style={styles.charTotal}>共 {summary.chars} 字</Text>
              </View>
            </View>
            <View style={styles.ringWrap}>
              <Svg width={86} height={86}>
                <Circle cx={43} cy={43} r={36} fill="#fff" />
                <Circle cx={43} cy={43} r={33} fill="none" stroke="#f3e3b2" strokeWidth={5} />
                <Circle
                  cx={43}
                  cy={43}
                  r={33}
                  fill="none"
                  stroke={C.orange}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 33}`}
                  strokeDashoffset={`${2 * Math.PI * 33 * (1 - summary.pct / 100)}`}
                  transform="rotate(-90 43 43)"
                />
              </Svg>
              <View style={styles.ringLabel}>
                <Text style={styles.ringLabelText}>本月{'\n'}{summary.pct}%</Text>
              </View>
            </View>
          </View>
          <View style={styles.weekStrip}>
            {summary.week.map((day, index) => (
              <View key={`${day}-${index}`} style={styles.weekCell}>
                <Text style={[styles.weekText, index === summary.todayIndex ? styles.weekToday : null]}>{day}</Text>
                {index === summary.todayIndex ? <View style={styles.weekUnderline} /> : null}
              </View>
            ))}
          </View>
        </View>

        {dayGroups.length === 0 ? (
          <Text style={styles.empty}>{query.trim() ? '未找到相关记录' : '还没有记录,点下面记一笔吧'}</Text>
        ) : (
          dayGroups.map((group) => (
            <View key={group.key}>
              <View style={styles.dayHead}>
                <Text style={styles.dayHeadText}>
                  {group.main ? <Text style={styles.dayHeadMain}>{group.main} </Text> : null}
                  {group.date}
                  <Text style={styles.dayHeadWd}> {group.wd}</Text>
                </Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setFilter((prev) => FILTERS[(FILTERS.findIndex((f) => f.key === prev) + 1) % FILTERS.length].key)}
                  style={styles.filterBtn}
                >
                  <Text style={styles.filterBtnText}>{FILTERS.find((f) => f.key === filter)?.label}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={12} color={C.ink2} />
                </Pressable>
              </View>
              {group.records.map((record, index) => renderEntry(record, index < group.records.length - 1, ''))}
            </View>
          ))
        )}
      </ScrollView>

      <View style={[styles.composer, { paddingBottom: insets.bottom + 14 }]}>
        {pendingImages.length > 0 ? (
          <View style={styles.attachRow}>
            {pendingImages.map((image) => (
              <View key={image.id} style={styles.attachWrap}>
                <Image source={{ uri: image.dataUrl }} style={styles.attachThumb} contentFit="cover" />
                <Pressable
                  accessibilityLabel="移除图片"
                  onPress={() => setPendingImages((prev) => prev.filter((item) => item.id !== image.id))}
                  style={styles.attachRemove}
                >
                  <Text style={styles.attachRemoveText}>×</Text>
                </Pressable>
              </View>
            ))}
          </View>
        ) : null}
        {error ? (
          <Text style={styles.composerError}>{error}</Text>
        ) : null}

        <View style={styles.barRow}>
          <Pressable
            accessibilityLabel="搜索记录"
            accessibilityRole="button"
            onPress={() => {
              setSearchOpen(true);
              setTimeout(() => searchInputRef.current?.focus(), 60);
            }}
            style={styles.searchBtn}
          >
            <MaterialCommunityIcons name="magnify" size={22} color={C.ink} />
          </Pressable>

          <View style={[styles.pillBar, recording ? styles.pillRecording : null]}>
            {recording ? (
              <View style={styles.recTip}>
                <Text style={styles.recTipText}>松开 发送</Text>
              </View>
            ) : null}
            <Pressable
              accessibilityLabel="添加图片"
              accessibilityRole="button"
              onPress={() => void pickImages()}
              style={styles.addBtn}
            >
              <MaterialCommunityIcons name="plus" size={22} color="#fff" />
            </Pressable>

            {mode === 'voice' ? (
              <Pressable
                accessibilityLabel={recording ? '松开发送' : '长按说话'}
                accessibilityRole="button"
                delayLongPress={200}
                disabled={phase === 'transcribing'}
                onPressIn={() => void handleCenterPressIn()}
                onPressOut={handleCenterPressOut}
                style={styles.center}
              >
                {recording ? (
                  <WaveBars active />
                ) : phase === 'transcribing' ? (
                  <Text style={styles.placeholder}>识别中…</Text>
                ) : (
                  <WaveBars active={false} />
                )}
              </Pressable>
            ) : (
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder="记一笔…"
                placeholderTextColor="#a9a9b0"
                returnKeyType="send"
                onSubmitEditing={submitText}
                style={styles.textInput}
              />
            )}

            {composing ? (
              <Pressable accessibilityLabel="发送" accessibilityRole="button" onPress={submitText} style={styles.sendBtn}>
                <MaterialCommunityIcons name="send" size={20} color="#fff" />
              </Pressable>
            ) : (
              <Pressable
                accessibilityLabel={mode === 'voice' ? '切换键盘输入' : '切换语音输入'}
                accessibilityRole="button"
                onPress={() => {
                  setMode((prev) => (prev === 'voice' ? 'text' : 'voice'));
                  setDraft('');
                }}
                style={[styles.micBtn, mode === 'voice' ? styles.micActive : null]}
              >
                <MaterialCommunityIcons
                  name={mode === 'voice' ? 'microphone' : 'microphone-off'}
                  size={20}
                  color="#fff"
                />
              </Pressable>
            )}
          </View>
        </View>
      </View>

      {searchOpen ? (
        <View style={styles.searchOverlay}>
          <View style={styles.searchHead}>
            <Pressable
              accessibilityLabel="关闭搜索"
              accessibilityRole="button"
              onPress={() => {
                setSearchOpen(false);
                setQuery('');
              }}
              style={styles.searchBack}
            >
              <MaterialCommunityIcons name="chevron-left" size={24} color={C.ink} />
            </Pressable>
            <TextInput
              ref={searchInputRef}
              value={query}
              onChangeText={setQuery}
              placeholder="搜索记录…"
              placeholderTextColor={C.ink4}
              style={styles.searchInput}
            />
          </View>
          <ScrollView style={styles.searchResults} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {searchResults.length === 0 ? (
              <Text style={styles.empty}>{query.trim() ? '未找到相关记录' : '输入关键词搜索'}</Text>
            ) : (
              searchResults.map((record) => renderEntry(record, false, query))
            )}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const BAR_COUNT = 14;
const BAR_SPECS: { delay: number; envelope: number }[] = Array.from({ length: BAR_COUNT }, (_, index) => ({
  delay: index * 45,
  envelope: Math.sin((Math.PI * (index + 0.5)) / BAR_COUNT),
}));

function WaveBars({ active }: { active: boolean }) {
  return (
    <View style={styles.waveRow}>
      {BAR_SPECS.map((spec, index) => (
        <WaveBar key={index} index={index} active={active} envelope={spec.envelope} />
      ))}
    </View>
  );
}

function WaveBar({ index, active, envelope }: { index: number; active: boolean; envelope: number }) {
  const height = useSharedValue(4);

  useEffect(() => {
    const base = active ? 10 : 5;
    const peak = active ? 30 * envelope + 8 : 12 * envelope + 5;
    height.value = base;
    height.value = withDelay(
      index * 40,
      withRepeat(
        withTiming(peak, { duration: active ? 320 : 640, easing: Easing.inOut(Easing.quad) }),
        -1,
        true,
      ),
    );
  }, [active, envelope, height, index]);

  const style = useAnimatedStyle(() => ({ height: height.value }));
  return <Animated.View style={[styles.waveBar, style, { backgroundColor: active ? C.recording : '#8e8e96' }]} />;
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: C.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: C.bg,
  },
  headerIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  appTitle: {
    position: 'relative',
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  appTitleUnderline: {
    position: 'absolute',
    left: 2,
    right: 2,
    bottom: 2,
    height: 9,
    borderRadius: 5,
    backgroundColor: C.orange,
    opacity: 0.85,
  },
  appTitleText: {
    fontSize: 21,
    fontWeight: '800',
    letterSpacing: 2,
    color: C.ink,
  },
  main: {
    flex: 1,
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: C.cream,
    borderRadius: 18,
    overflow: 'hidden',
    marginTop: 2,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  monthLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: C.ink,
  },
  monthPill: {
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  monthPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: C.creamInk,
  },
  cardMid: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
  },
  statCol: {
    gap: 6,
  },
  statLabel: {
    fontSize: 12,
    color: C.creamLabel,
  },
  statNum: {
    fontSize: 30,
    fontWeight: '900',
    color: C.ink,
  },
  statUnit: {
    fontSize: 13,
    fontWeight: '700',
    color: '#7c6420',
    marginLeft: 2,
  },
  statSub: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  tagGreen: {
    backgroundColor: C.greenBg,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  tagGreenText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.green,
  },
  charTotal: {
    fontSize: 12,
    color: C.creamLabel,
  },
  ringWrap: {
    width: 86,
    height: 86,
  },
  ringLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringLabelText: {
    fontSize: 11,
    fontWeight: '700',
    color: C.orangeDeep,
    textAlign: 'center',
    lineHeight: 15,
  },
  weekStrip: {
    flexDirection: 'row',
    backgroundColor: C.creamDeep,
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  weekCell: {
    flex: 1,
    alignItems: 'center',
  },
  weekText: {
    fontSize: 13,
    color: '#6d5a20',
  },
  weekToday: {
    color: C.orangeDeep,
    fontWeight: '800',
  },
  weekUnderline: {
    width: 14,
    height: 3,
    borderRadius: 2,
    backgroundColor: C.orange,
    marginTop: 4,
  },
  dayHead: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  dayHeadText: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  dayHeadMain: {
    fontWeight: '800',
  },
  dayHeadWd: {
    fontSize: 13,
    color: C.ink4,
    fontWeight: '600',
  },
  filterBtn: {
    marginLeft: 'auto',
    backgroundColor: C.pill,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  filterBtnText: {
    fontSize: 12,
    color: C.ink2,
  },
  entry: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    paddingBottom: 14,
    position: 'relative',
  },
  entryTime: {
    width: 46,
    fontSize: 12,
    color: C.ink4,
    paddingTop: 8,
  },
  entryBody: {
    flex: 1,
    minWidth: 0,
  },
  titlePill: {
    alignSelf: 'flex-start',
    backgroundColor: C.pill,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    maxWidth: '100%',
  },
  titlePillText: {
    fontSize: 14.5,
    fontWeight: '600',
    color: C.pillText,
  },
  entryImgs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  entryImg: {
    width: 72,
    height: 72,
    borderRadius: 12,
  },
  entryImgLarge: {
    width: 120,
    height: 120,
    borderRadius: 12,
  },
  entryMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingTop: 10,
  },
  entryMetaText: {
    fontSize: 12,
    color: C.ink4,
  },
  rail: {
    position: 'absolute',
    left: 52,
    top: 36,
    bottom: -2,
    width: 1,
    backgroundColor: C.line,
  },
  empty: {
    color: C.ink4,
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 48,
  },
  composer: {
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: '#f1f1f2',
    paddingHorizontal: 14,
    paddingTop: 10,
  },
  composerError: {
    color: '#d0453c',
    fontSize: 11.5,
    fontWeight: '600',
    textAlign: 'center',
    paddingBottom: 6,
  },
  attachRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 4,
    paddingBottom: 10,
  },
  attachWrap: {
    position: 'relative',
  },
  attachThumb: {
    width: 52,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.line,
  },
  attachRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(0,0,0,0.63)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachRemoveText: {
    color: '#fff',
    fontSize: 11,
    lineHeight: 14,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  searchBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: C.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBar: {
    flex: 1,
    height: 58,
    backgroundColor: C.dark,
    borderRadius: 999,
    alignItems: 'center',
    flexDirection: 'row',
    padding: 5,
    position: 'relative',
  },
  pillRecording: {
    shadowColor: C.recording,
    shadowOpacity: 0.4,
    shadowRadius: 6,
    elevation: 0,
  },
  recTip: {
    position: 'absolute',
    top: -34,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  recTipText: {
    color: '#fff',
    fontSize: 12,
  },
  addBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.dark2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 0,
  },
  placeholder: {
    fontSize: 15,
    color: '#a9a9b0',
    letterSpacing: 1,
  },
  textInput: {
    flex: 1,
    fontSize: 15,
    color: '#eeeeef',
    paddingHorizontal: 6,
    paddingVertical: 0,
  },
  micBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.dark2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  micActive: {
    backgroundColor: C.orange,
  },
  sendBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    height: 34,
  },
  waveBar: {
    width: 3,
    borderRadius: 2,
  },
  searchOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.bg,
    zIndex: 30,
  },
  searchHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  searchBack: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: C.pill,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 11,
    fontSize: 14,
    color: C.ink,
  },
  searchResults: {
    flex: 1,
    paddingHorizontal: 16,
  },
  mark: {
    backgroundColor: 'transparent',
    color: C.orangeDeep,
    fontWeight: '800',
    textDecorationLine: 'underline',
    textDecorationColor: '#ffd66b',
  },
});
