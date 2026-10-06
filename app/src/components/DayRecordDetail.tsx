import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useMemo, useRef, useState } from 'react';
import {
  FlatList,
  ImageStyle,
  NativeScrollEvent,
  NativeSyntheticEvent,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import PressableScale from './PressableScale';
import { CheckIn, DayRecord, Task } from '../domain/types';
import { formatCheckInTime } from '../domain/format';
import { calculateTimeSegmentsDurationForDate, formatDuration } from '../domain/timeTracking';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

type Props = {
  task: Task;
  date: string;
  checkIn?: CheckIn;
  record?: DayRecord;
  serverUrl: string;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
};

function imageSource(uri: string | null) {
  return uri ? { uri } : require('../../assets/images/icon.png');
}

export default function DayRecordDetail({
  task,
  date,
  checkIn,
  record,
  serverUrl,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
}: Props) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);

  const listRef = useRef<FlatList<ImageListItem>>(null);
  const [scrollIndex, setScrollIndex] = useState<{ date: string; index: number }>({
    date,
    index: 0,
  });
  const { width: windowWidth } = useWindowDimensions();
  const galleryWidth = Math.min(windowWidth - 76, 420);
  const images = useMemo(() => {
    const base = Array.isArray(record?.images)
      ? record.images
      : record?.image ? [record.image] : [];

    return base.map((image, index) => ({
      key: `${image.fileName}-${index}`,
      uri: image.localUri ?? (serverUrl.trim().startsWith('http')
        ? `${serverUrl.replace(/\/+$/, '')}/api/day-records/${encodeURIComponent(task.id)}/${encodeURIComponent(date)}/images/${index}`
        : null),
    }));
  }, [date, record, serverUrl, task.id]);
  const duration = formatDuration(calculateTimeSegmentsDurationForDate(task, date));

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(event.nativeEvent.contentOffset.x / galleryWidth);
    setScrollIndex({ date, index: Math.max(0, Math.min(images.length - 1, next)) });
  };
  const activeIndex = scrollIndex.date === date ? scrollIndex.index : 0;

  return (
    <View style={styles.container}>
      <View style={styles.dateRow}>
            <PressableScale
              style={[styles.arrowButton, {
                borderColor: canGoPrevious ? theme.accentBorder : theme.surfaceBorder,
                backgroundColor: canGoPrevious ? theme.accentBackground : theme.inputBackground,
              }]}
              disabled={!canGoPrevious}
              accessibilityLabel="查看前一天"
              onPress={onPrevious}
            >
              <MaterialCommunityIcons
                name="chevron-left"
                size={19}
                color={canGoPrevious ? theme.accentText : theme.subtleText}
              />
            </PressableScale>

            <View style={styles.dateCopy}>
              <Text style={[styles.date, { color: theme.text }]}>{date}</Text>
              <Text style={[styles.status, { color: checkIn ? task.color : theme.subtleText }]}>
                {checkIn ? `已打卡${checkIn.createdAt ? ` · ${formatCheckInTime(checkIn.createdAt)}` : ''}` : '未打卡'}
              </Text>
              <Text style={[styles.duration, { color: theme.accentText }]}>
                当天耗时 {duration}
              </Text>
            </View>

            <PressableScale
              style={[styles.arrowButton, {
                borderColor: canGoNext ? theme.accentBorder : theme.surfaceBorder,
                backgroundColor: canGoNext ? theme.accentBackground : theme.inputBackground,
              }]}
              disabled={!canGoNext}
              accessibilityLabel="查看后一天"
              onPress={onNext}
            >
              <MaterialCommunityIcons
                name="chevron-right"
                size={19}
                color={canGoNext ? theme.accentText : theme.subtleText}
              />
            </PressableScale>
      </View>

          {record?.note ? (
            <Text style={[styles.note, { color: theme.mutedText }]}>{record.note}</Text>
          ) : (
            <Text style={[styles.empty, { color: theme.subtleText }]}>这一天还没有描述</Text>
          )}

          {images.length > 0 ? (
            <View style={styles.gallery}>
              <FlatList
                ref={listRef}
                key={date}
                data={images}
                keyExtractor={(item) => item.key}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                onMomentumScrollEnd={onScrollEnd}
                getItemLayout={(_, index) => ({
                  length: galleryWidth,
                  offset: galleryWidth * index,
                  index,
                })}
                renderItem={({ item }) => (
                  <Image
                    source={imageSource(item.uri)}
                    style={[styles.image as ImageStyle, {
                      width: galleryWidth,
                      borderColor: theme.surfaceBorder,
                      backgroundColor: theme.inputBackground,
                    }]}
                    contentFit="cover"
                    transition={160}
                    recyclingKey={item.key}
                  />
                )}
              />
              {images.length > 1 && (
                <View style={styles.pagination}>
                  {images.map((item, index) => (
                    <View
                      key={item.key}
                      style={[
                        styles.dot,
                        { backgroundColor: theme.isLight ? 'rgba(15,23,42,0.24)' : 'rgba(255,255,255,0.38)' },
                        index === activeIndex && [styles.activeDot, { backgroundColor: theme.accent }],
                      ]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : (
            <View style={[styles.imageEmpty, {
              borderColor: theme.surfaceBorder,
              backgroundColor: theme.inputBackground,
            }]}>
              <MaterialCommunityIcons
                name="image-off-outline"
                size={22}
                color={theme.subtleText}
              />
              <Text style={[styles.empty, { color: theme.subtleText }]}>这一天没有打卡图片</Text>
            </View>
          )}
        </View>
  );
}

type ImageListItem = {
  key: string;
  uri: string | null;
};

const styles = StyleSheet.create({
  container: {
    gap: 12,
    marginTop: 16,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  arrowButton: {
    width: 36,
    height: 36,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: 'rgba(103,232,249,0.18)',
    backgroundColor: 'rgba(34,211,238,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowDisabled: {
    borderColor: 'rgba(148,163,184,0.10)',
    backgroundColor: 'rgba(148,163,184,0.06)',
  },
  dateCopy: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  date: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  status: {
    fontSize: 12,
    fontWeight: '700',
  },
  duration: {
    color: 'rgba(103,232,249,0.82)',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  note: {
    color: 'rgba(226,232,240,0.86)',
    fontSize: 13,
    lineHeight: 20,
  },
  empty: {
    color: 'rgba(148,163,184,0.65)',
    fontSize: 12,
    textAlign: 'center',
  },
  gallery: {
    position: 'relative',
  },
  image: {
    height: 180,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.10)',
    backgroundColor: 'rgba(148,163,184,0.08)',
  },
  pagination: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 10,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.38)',
  },
  activeDot: {
    width: 16,
    backgroundColor: '#67e8f9',
  },
  imageEmpty: {
    height: 96,
    borderRadius: 18,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(148,163,184,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});
