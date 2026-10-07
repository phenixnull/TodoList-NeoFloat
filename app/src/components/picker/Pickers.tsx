import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import PressableScale from '../PressableScale';
import { useHabitStore } from '../../store/useHabitStore';
import { useTheme } from '../../theme/theme';

export type WheelItem<T> = { label: string; value: T };

const ITEM_H = 44;
const VISIBLE = 5;
const CONTAINER_H = ITEM_H * VISIBLE;
const SIDE_PAD = Math.floor(VISIBLE / 2) * ITEM_H;

function WheelPicker<T>({
  data,
  value,
  onChange,
  width,
  activeColor,
  inactiveColor,
  fadeColor,
}: {
  data: WheelItem<T>[];
  value: T;
  onChange: (value: T) => void;
  width: number;
  activeColor: string;
  inactiveColor: string;
  fadeColor: string;
}) {
  const listRef = useRef<FlatList<WheelItem<T>>>(null);
  const baseIndex = Math.max(
    0,
    data.findIndex((item) => item.value === value),
  );
  const [activeIndex, setActiveIndex] = useState(baseIndex);
  const activeIndexRef = useRef(baseIndex);

  useEffect(() => {
    const idx = Math.max(0, data.findIndex((item) => item.value === value));
    listRef.current?.scrollToIndex({ index: idx, animated: false, viewPosition: 0.5 });
    setActiveIndex(idx);
    activeIndexRef.current = idx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  const settle = useCallback(
    (offsetY: number) => {
      const idx = Math.min(data.length - 1, Math.max(0, Math.round(offsetY / ITEM_H)));
      listRef.current?.scrollToOffset({ offset: idx * ITEM_H, animated: true });
      if (idx !== activeIndexRef.current) {
        activeIndexRef.current = idx;
        setActiveIndex(idx);
        onChange(data[idx]!.value);
        void Haptics.selectionAsync();
      }
    },
    [data, onChange],
  );

  return (
    <View style={[styles.wheelWrap, { width, height: CONTAINER_H }]}>
      <FlatList
        ref={listRef}
        data={data}
        keyExtractor={(item, index) => `${item.label}-${index}`}
        getItemLayout={(_, index) => ({
          length: ITEM_H,
          offset: ITEM_H * index,
          index,
        })}
        contentContainerStyle={{
          paddingTop: SIDE_PAD,
          paddingBottom: SIDE_PAD,
        }}
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_H}
        snapToAlignment="center"
        decelerationRate="fast"
        onScroll={(event) => {
          const idx = Math.min(
            data.length - 1,
            Math.max(0, Math.round(event.nativeEvent.contentOffset.y / ITEM_H)),
          );
          if (idx !== activeIndexRef.current) {
            activeIndexRef.current = idx;
            setActiveIndex(idx);
          }
        }}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(event) => settle(event.nativeEvent.contentOffset.y)}
        renderItem={({ item, index }) => {
          const selected = index === activeIndex;
          return (
            <View style={styles.itemRow}>
              <Text
                numberOfLines={1}
                style={[
                  styles.itemText,
                  {
                    color: selected ? activeColor : inactiveColor,
                    fontSize: selected ? 21 : 17,
                    fontWeight: selected ? '800' : '500',
                  },
                ]}
              >
                {item.label}
              </Text>
            </View>
          );
        }}
      />
      <View style={[styles.centerBar, { borderColor: activeColor }]} pointerEvents="none" />
      <LinearGradient
        pointerEvents="none"
        colors={[fadeColor, `${fadeColor}00`]}
        style={[styles.fade, { top: 0 }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[`${fadeColor}00`, fadeColor]}
        style={[styles.fade, { bottom: 0 }]}
      />
    </View>
  );
}

function SheetShell({
  visible,
  title,
  onClose,
  children,
  onConfirm,
  confirmLabel = '确定',
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()} style={styles.sheetAnchor}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.card,
              {
                backgroundColor: theme.isLight ? 'rgba(241,245,249,0.97)' : 'rgba(15,23,42,0.96)',
                borderColor: theme.surfaceBorder,
              },
            ]}
          >
            <View style={[styles.handle, { backgroundColor: theme.surfaceBorder }]} />
            <View style={styles.headerRow}>
              <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
              <PressableScale style={styles.closeBtn} onPress={onClose}>
                <Ionicons name="close" size={18} color={theme.mutedText} />
              </PressableScale>
            </View>
            {children}
            <View style={styles.actions}>
              <PressableScale
                style={[styles.ghostBtn, { borderColor: theme.surfaceBorder }]}
                onPress={onClose}
              >
                <Text style={[styles.ghostText, { color: theme.mutedText }]}>取消</Text>
              </PressableScale>
              <PressableScale
                style={[styles.confirmBtn, { backgroundColor: theme.accent }]}
                onPress={() => {
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  onConfirm();
                }}
              >
                <Text style={[styles.confirmText, { color: theme.onAccent }]}>{confirmLabel}</Text>
              </PressableScale>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function pad2(value: number): string {
  return value.toString().padStart(2, '0');
}

export function TimePickerSheet({
  visible,
  title,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onConfirm: (hhmm: string) => void;
}) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const initial = useMemo(() => {
    const m = /^(\d{2}):(\d{2})$/.exec(value);
    return { h: Number(m?.[1] ?? 8), min: Number(m?.[2] ?? 0) };
  }, [value]);
  const [hour, setHour] = useState(initial.h);
  const [minute, setMinute] = useState(initial.min);

  useEffect(() => {
    if (visible) {
      setHour(initial.h);
      setMinute(initial.min);
    }
  }, [visible, initial]);

  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => ({ label: pad2(i), value: i })),
    [],
  );
  const minutes = useMemo(
    () => Array.from({ length: 60 }, (_, i) => ({ label: pad2(i), value: i })),
    [],
  );
  const fadeColor = theme.isLight ? '#f1f5f9' : '#0f172a';

  return (
    <SheetShell
      visible={visible}
      title={title}
      onClose={onClose}
      onConfirm={() => onConfirm(`${pad2(hour)}:${pad2(minute)}`)}
    >
      <View style={styles.pickerRow}>
        <WheelPicker
          data={hours}
          value={hour}
          onChange={setHour}
          width={104}
          activeColor={theme.accent}
          inactiveColor={theme.subtleText}
          fadeColor={fadeColor}
        />
        <Text style={[styles.colon, { color: theme.text }]}>:</Text>
        <WheelPicker
          data={minutes}
          value={minute}
          onChange={setMinute}
          width={104}
          activeColor={theme.accent}
          inactiveColor={theme.subtleText}
          fadeColor={fadeColor}
        />
      </View>
    </SheetShell>
  );
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export function DatePickerSheet({
  visible,
  title,
  value,
  onClose,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  value: string;
  onClose: () => void;
  onConfirm: (dateKey: string) => void;
}) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const now = new Date();
  const currentYear = now.getFullYear();

  const initial = useMemo(() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    return {
      y: Number(m?.[1] ?? currentYear),
      mo: Number(m?.[2] ?? now.getMonth() + 1),
      d: Number(m?.[3] ?? now.getDate()),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const [year, setYear] = useState(initial.y);
  const [month, setMonth] = useState(initial.mo);
  const [day, setDay] = useState(initial.d);

  useEffect(() => {
    if (visible) {
      setYear(initial.y);
      setMonth(initial.mo);
      setDay(initial.d);
    }
  }, [visible, initial]);

  const years = useMemo(
    () =>
      Array.from({ length: 5 }, (_, i) => {
        const y = currentYear - 2 + i;
        return { label: `${y}年`, value: y };
      }),
    [currentYear],
  );
  const months = useMemo(
    () => Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}月`, value: i + 1 })),
    [],
  );
  const dayCount = daysInMonth(year, month);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => ({ label: `${i + 1}日`, value: i + 1 })),
    [dayCount],
  );

  useEffect(() => {
    if (day > dayCount) setDay(dayCount);
  }, [dayCount, day]);

  const fadeColor = theme.isLight ? '#f1f5f9' : '#0f172a';

  return (
    <SheetShell
      visible={visible}
      title={title}
      onClose={onClose}
      onConfirm={() => onConfirm(`${year}-${pad2(month)}-${pad2(Math.min(day, dayCount))}`)}
    >
      <View style={styles.pickerRow}>
        <WheelPicker
          data={years}
          value={year}
          onChange={setYear}
          width={92}
          activeColor={theme.accent}
          inactiveColor={theme.subtleText}
          fadeColor={fadeColor}
        />
        <WheelPicker
          data={months}
          value={month}
          onChange={setMonth}
          width={82}
          activeColor={theme.accent}
          inactiveColor={theme.subtleText}
          fadeColor={fadeColor}
        />
        <WheelPicker
          data={days}
          value={Math.min(day, dayCount)}
          onChange={setDay}
          width={82}
          activeColor={theme.accent}
          inactiveColor={theme.subtleText}
          fadeColor={fadeColor}
        />
      </View>
    </SheetShell>
  );
}

const styles = StyleSheet.create({
  wheelWrap: {
    position: 'relative',
  },
  itemRow: {
    height: ITEM_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    letterSpacing: 0.3,
  },
  centerBar: {
    position: 'absolute',
    top: SIDE_PAD,
    left: 6,
    right: 6,
    height: ITEM_H,
    borderRadius: 14,
    borderWidth: 1,
    backgroundColor: 'rgba(148,163,184,0.10)',
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: SIDE_PAD,
  },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.62)',
    justifyContent: 'flex-end',
  },
  sheetAnchor: {
    justifyContent: 'flex-end',
  },
  card: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 26,
  },
  handle: {
    width: 42,
    height: 5,
    borderRadius: 3,
    alignSelf: 'center',
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(148,163,184,0.14)',
  },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  colon: {
    fontSize: 22,
    fontWeight: '800',
    marginHorizontal: 2,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 14,
  },
  ghostBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
  },
  ghostText: {
    fontSize: 15,
    fontWeight: '700',
  },
  confirmBtn: {
    flex: 1,
    borderRadius: 16,
    alignItems: 'center',
    paddingVertical: 14,
  },
  confirmText: {
    fontSize: 15,
    fontWeight: '800',
  },
});
