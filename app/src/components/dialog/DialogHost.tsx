import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHabitStore } from '../../store/useHabitStore';
import { useTheme } from '../../theme/theme';
import {
  __registerDialogSink,
  type DialogOption,
  type DialogRequest,
} from './dialogs';

const { height: SCREEN_H } = Dimensions.get('window');
const DIM = 'rgba(2,6,23,0.72)';
const DANGER = '#f87171';

export default function DialogHost() {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);
  const insets = useSafeAreaInsets();

  const [current, setCurrent] = useState<DialogRequest | null>(null);
  const currentRef = useRef<DialogRequest | null>(null);
  const buffer = useRef<DialogRequest[]>([]);
  const progress = useSharedValue(0);
  const dragY = useSharedValue(0);

  const finishClose = useCallback(() => {
    currentRef.current = null;
    const next = buffer.current.shift() ?? null;
    if (next) currentRef.current = next;
    dragY.set(0);
    setCurrent(next);
  }, [dragY]);

  useEffect(() => {
    const sink = (request: DialogRequest) => {
      if (currentRef.current) buffer.current.push(request);
      else {
        currentRef.current = request;
        setCurrent(request);
      }
    };
    __registerDialogSink(sink);
    return () => __registerDialogSink(null);
  }, []);

  useEffect(() => {
    if (current) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      progress.set(withTiming(1, { duration: 240 }));
    }
  }, [current, progress]);

  const animateClosed = useCallback(() => {
    progress.set(
      withTiming(0, { duration: 180 }, (finished) => {
        if (finished) runOnJS(finishClose)();
      }),
    );
  }, [finishClose, progress]);

  const close = useCallback(
    (after?: () => void) => {
      after?.();
      animateClosed();
    },
    [animateClosed],
  );

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { scale: 0.9 + progress.value * 0.1 },
      { translateY: (1 - progress.value) * 22 },
    ],
  }));
  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * SCREEN_H + dragY.value }],
  }));

  const handlePanEnd = useCallback(
    (distance: number) => {
      if (distance > 120) animateClosed();
      else dragY.set(withSpring(0, { damping: 26, stiffness: 280, mass: 0.9 }));
    },
    [animateClosed, dragY],
  );

  const pan = Gesture.Pan()
    .onUpdate((event) => {
      'worklet';
      dragY.set(Math.max(0, event.translationY));
    })
    // RNGH gesture callbacks run as reanimated worklets on the UI thread, not
    // during render; the refs rule only fails to recognize this chained form.
    // eslint-disable-next-line react-hooks/refs
    .onEnd((event) => {
      'worklet';
      runOnJS(handlePanEnd)(Math.max(0, event.translationY));
    });

  if (!current) return null;

  const cardSurface = theme.isLight ? 'rgba(255,255,255,0.97)' : 'rgba(17,22,40,0.99)';
  const sheetSurface = theme.isLight ? 'rgba(252,253,255,0.99)' : 'rgba(15,19,35,0.99)';

  const renderOption = (option: DialogOption, index: number) => (
    <Pressable
      key={`${option.text}-${index}`}
      style={({ pressed }) => [styles.option, pressed && { backgroundColor: theme.surface }]}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        close(option.onPress);
      }}
    >
      <View style={styles.sideSlot}>
        {option.icon ? (
          <Ionicons
            name={option.icon as never}
            size={21}
            color={option.iconColor ?? (option.danger ? DANGER : theme.mutedText)}
          />
        ) : null}
      </View>
      <Text numberOfLines={1} style={[styles.optionText, { color: option.danger ? DANGER : theme.text }]}>
        {option.text}
      </Text>
      <View style={styles.sideSlot}>
        {option.selected ? <Ionicons name="checkmark" size={23} color={theme.accent} /> : null}
      </View>
    </Pressable>
  );

  let body: React.ReactNode = null;

  if (current.kind === 'alert') {
    body = (
      <Animated.View style={[styles.card, { backgroundColor: cardSurface, borderColor: theme.surfaceBorder }, cardStyle]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{current.title}</Text>
        {current.message ? (
          <Text style={[styles.cardMessage, { color: theme.mutedText }]}>{current.message}</Text>
        ) : null}
        <Pressable style={[styles.singleButton, { backgroundColor: theme.accent }]} onPress={() => close()}>
          <Text style={[styles.singleButtonText, { color: theme.onAccent }]}>
            {current.confirmText ?? '知道了'}
          </Text>
        </Pressable>
      </Animated.View>
    );
  } else if (current.kind === 'confirm') {
    const confirmBg = current.danger ? '#ef4444' : theme.accent;
    const confirmFg = current.danger ? '#ffffff' : theme.onAccent;
    body = (
      <Animated.View style={[styles.card, { backgroundColor: cardSurface, borderColor: theme.surfaceBorder }, cardStyle]}>
        <Text style={[styles.cardTitle, { color: theme.text }]}>{current.title}</Text>
        {current.message ? (
          <Text style={[styles.cardMessage, { color: theme.mutedText }]}>{current.message}</Text>
        ) : null}
        <View style={styles.buttonRow}>
          <Pressable
            style={[styles.ghostButton, { borderColor: theme.surfaceBorder }]}
            onPress={() => close(current.onCancel)}
          >
            <Text style={[styles.ghostButtonText, { color: theme.mutedText }]}>
              {current.cancelText ?? '取消'}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.filledButton, { backgroundColor: confirmBg }]}
            onPress={() => {
              if (current.danger) {
                void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
              close(current.onConfirm);
            }}
          >
            <Text style={[styles.filledButtonText, { color: confirmFg }]}>
              {current.confirmText ?? (current.danger ? '删除' : '确定')}
            </Text>
          </Pressable>
        </View>
      </Animated.View>
    );
  } else {
    body = (
      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.sheet,
            { backgroundColor: sheetSurface, borderColor: theme.surfaceBorder, paddingBottom: insets.bottom + 12 },
            sheetStyle,
          ]}
        >
          <View style={[styles.handle, { backgroundColor: theme.subtleText }]} />
          <Text style={[styles.sheetTitle, { color: theme.text }]}>{current.title}</Text>
          {current.message ? (
            <Text style={[styles.sheetMessage, { color: theme.mutedText }]}>{current.message}</Text>
          ) : null}
          {current.options.map(renderOption)}
          <Pressable
            style={({ pressed }) => [
              styles.sheetCancel,
              { borderColor: theme.surfaceBorder, backgroundColor: theme.surface },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => close()}
          >
            <Text style={[styles.sheetCancelText, { color: theme.mutedText }]}>
              {current.cancelText ?? '取消'}
            </Text>
          </Pressable>
        </Animated.View>
      </GestureDetector>
    );
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: DIM }, backdropStyle]}
      />
      {current.kind === 'sheet' ? (
        <View style={styles.sheetLayout} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => close()} />
          {body}
        </View>
      ) : (
        <View style={styles.centerLayout} pointerEvents="box-none">
          <Pressable style={StyleSheet.absoluteFill} onPress={() => {
            if (current.kind === 'confirm') close(current.onCancel);
            else close();
          }} />
          <Pressable onPress={() => {}}>{body}</Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  centerLayout: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  sheetLayout: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 26,
    borderWidth: 1,
    padding: 22,
  },
  cardTitle: {
    fontSize: 19,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 8,
  },
  cardMessage: {
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
  },
  singleButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 22,
  },
  singleButtonText: {
    fontSize: 16,
    fontWeight: '900',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 22,
  },
  ghostButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostButtonText: {
    fontSize: 16,
    fontWeight: '800',
  },
  filledButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filledButtonText: {
    fontSize: 16,
    fontWeight: '900',
  },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: 16,
    paddingTop: 6,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
    marginTop: 4,
    opacity: 0.5,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '900',
    textAlign: 'center',
    marginBottom: 4,
  },
  sheetMessage: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
  option: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    paddingHorizontal: 12,
  },
  sideSlot: {
    width: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
  },
  sheetCancel: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  sheetCancelText: {
    fontSize: 16,
    fontWeight: '800',
  },
});
