import { useEffect, useRef } from 'react'
import type { GestureResponderEvent, LayoutChangeEvent, NativeSyntheticEvent, NativeTouchEvent } from 'react-native'
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { Task } from '../../../src/types/domain'
import { summarizeTask } from '../state/useNativeTodoBoard'
import {
  COLORS,
  FONTS,
  formatRelativeStamp,
  rgba,
  taskAccent,
  taskProgress,
  taskStatusLabel,
  taskStatusTone,
} from './apkTheme'

type FilterChipProps = {
  active: boolean
  count: number
  label: string
  onPress: () => void
}

export function FilterChip({ active, count, label, onPress }: FilterChipProps) {
  return (
    <Pressable onPress={onPress} style={[styles.filterChip, active ? styles.filterChipActive : null]}>
      <Text style={[styles.filterChipText, active ? styles.filterChipTextActive : null]}>{label}</Text>
      <Text style={[styles.filterChipCount, active ? styles.filterChipCountActive : null]}>{count}</Text>
    </Pressable>
  )
}

type StatTileProps = {
  label: string
  value: string
  accent: string
}

export function StatTile({ label, value, accent }: StatTileProps) {
  return (
    <View style={[styles.statTile, { borderColor: rgba(accent, 0.32), backgroundColor: rgba(accent, 0.12) }]}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: accent }]}>{value}</Text>
    </View>
  )
}

function hsla(hue: number, saturation: number, lightness: number, alpha: number): string {
  const normalizedHue = ((hue % 360) + 360) % 360
  return `hsla(${normalizedHue}, ${saturation}%, ${lightness}%, ${alpha})`
}

function gradientSeed(order: number): number {
  return ((order - 1) * 137.508) % 360
}

function orderedGradientStops(order: number, alpha: [number, number, number]): [string, string, string] {
  const baseHue = gradientSeed(order)
  return [
    hsla(baseHue, 88, 58, alpha[0]),
    hsla(baseHue + 72, 85, 54, alpha[1]),
    hsla(baseHue + 152, 90, 61, alpha[2]),
  ]
}

function touchPageY(event: GestureResponderEvent | NativeSyntheticEvent<NativeTouchEvent>): number {
  return event.nativeEvent.touches?.[0]?.pageY ?? event.nativeEvent.changedTouches?.[0]?.pageY ?? event.nativeEvent.pageY
}

type TaskCardProps = {
  dragOffsetY?: number
  isDragging?: boolean
  isDropTarget?: boolean
  index: number
  nowMs: number
  onDragEnd?: (taskId: string) => void
  onDragMove?: (taskId: string, pageY: number) => void
  onLayout?: (taskId: string, y: number, height: number) => void
  task: Task
  onOpenEditor: (task: Task) => void
  onOpenMenu: (task: Task) => void
  onStartDrag?: (taskId: string, startPageY: number) => void
  onToggleFinished: (task: Task) => void
  onToggleTimer: (task: Task) => void
  calcTaskDuration: (task: Task, nowMs: number) => number
  formatDuration: (value: number) => string
}

export function TaskCard({
  dragOffsetY = 0,
  isDragging = false,
  isDropTarget = false,
  index,
  nowMs,
  onDragEnd,
  onDragMove,
  onLayout,
  task,
  onOpenEditor,
  onOpenMenu,
  onStartDrag,
  onToggleFinished,
  onToggleTimer,
  calcTaskDuration,
  formatDuration,
}: TaskCardProps) {
  const displayOrder = index + 1
  const accent = taskAccent(task)
  const statusTone = taskStatusTone(task)
  const progress = taskProgress(task)
  const durationMs = calcTaskDuration(task, nowMs)
  const summary = summarizeTask(task)
  const tagText = task.meta?.tagText?.trim() || null
  const tagBackground = task.meta?.tagBackgroundColor ?? rgba(accent, 0.2)
  const tagTextColor = task.meta?.textColor ?? COLORS.textPrimary
  const isRunning = task.status === 'doing'
  const isFinished = task.status === 'finished'
  const isArchived = task.archived
  const actionDisabled = isFinished || isArchived
  const durationText = task.showDuration ? `[${formatDuration(durationMs)}]` : '[--:--:--]'
  const primaryActionLabel = isRunning ? '暂停' : '开始'
  const finishActionLabel = isFinished ? '已完成' : '完成'
  const updatedText = `更新 ${formatRelativeStamp(task.updatedAt)}`
  const attachmentText = task.attachments.length > 0 ? `${task.attachments.length} 图` : '轻触编辑'
  const pulseValue = useRef(new Animated.Value(0.92)).current
  const sweepValue = useRef(new Animated.Value(0)).current
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const touchStartPageYRef = useRef<number | null>(null)
  const touchMovedRef = useRef(false)
  const dragSessionRef = useRef(false)

  useEffect(() => {
    let pulseLoop: Animated.CompositeAnimation | null = null
    let sweepLoop: Animated.CompositeAnimation | null = null

    if (isRunning) {
      pulseValue.setValue(0.92)
      sweepValue.setValue(0)
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseValue, {
            toValue: 1.04,
            duration: 720,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(pulseValue, {
            toValue: 0.92,
            duration: 720,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      )
      sweepLoop = Animated.loop(
        Animated.timing(sweepValue, {
          toValue: 1,
          duration: 1500,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      )
      pulseLoop.start()
      sweepLoop.start()
    } else {
      pulseValue.stopAnimation()
      sweepValue.stopAnimation()
      pulseValue.setValue(0.92)
      sweepValue.setValue(0)
    }

    return () => {
      pulseLoop?.stop()
      sweepLoop?.stop()
    }
  }, [isRunning, pulseValue, sweepValue])

  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current)
      }
    }
  }, [])

  function clearLongPressTimer() {
    if (!longPressTimerRef.current) {
      return
    }

    clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = null
  }

  function handleContentTouchStart(event: GestureResponderEvent) {
    clearLongPressTimer()
    dragSessionRef.current = false
    touchMovedRef.current = false
    touchStartPageYRef.current = touchPageY(event)

    if (!onStartDrag) {
      return
    }

    longPressTimerRef.current = setTimeout(() => {
      const startPageY = touchStartPageYRef.current
      if (touchMovedRef.current || startPageY == null) {
        return
      }

      dragSessionRef.current = true
      onStartDrag(task.id, startPageY)
    }, 240)
  }

  function handleContentTouchMove(event: GestureResponderEvent) {
    const startPageY = touchStartPageYRef.current
    if (startPageY == null) {
      return
    }

    const pageY = touchPageY(event)
    if (dragSessionRef.current) {
      onDragMove?.(task.id, pageY)
      return
    }

    if (Math.abs(pageY - startPageY) > 8) {
      touchMovedRef.current = true
      clearLongPressTimer()
    }
  }

  function handleContentTouchEnd() {
    clearLongPressTimer()
    touchStartPageYRef.current = null

    if (dragSessionRef.current) {
      dragSessionRef.current = false
      onDragEnd?.(task.id)
      return
    }

    if (!touchMovedRef.current) {
      onOpenEditor(task)
    }
  }

  function handleContentTouchCancel() {
    clearLongPressTimer()
    touchStartPageYRef.current = null

    if (dragSessionRef.current) {
      dragSessionRef.current = false
      onDragEnd?.(task.id)
    }
  }

  const glowOpacity = pulseValue.interpolate({
    inputRange: [0.92, 1.04],
    outputRange: [0.24, 0.72],
  })
  const chromaOpacity = pulseValue.interpolate({
    inputRange: [0.92, 1.04],
    outputRange: [0.04, 0.12],
  })
  const innerGlowOpacity = pulseValue.interpolate({
    inputRange: [0.92, 1.04],
    outputRange: [0.03, 0.08],
  })
  const buttonScale = pulseValue.interpolate({
    inputRange: [0.92, 1.04],
    outputRange: [1, 1.04],
  })
  const sweepTranslateX = sweepValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-220, 280],
  })
  const borderTranslateX = sweepValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-180, 180],
  })
  const borderTranslateXReverse = sweepValue.interpolate({
    inputRange: [0, 1],
    outputRange: [180, -180],
  })
  const borderTranslateY = sweepValue.interpolate({
    inputRange: [0, 1],
    outputRange: [-120, 120],
  })
  const borderTranslateYReverse = sweepValue.interpolate({
    inputRange: [0, 1],
    outputRange: [120, -120],
  })
  const panelStops = orderedGradientStops(displayOrder, isRunning ? [0.28, 0.22, 0.18] : [0.2, 0.16, 0.12])
  const actionStops = orderedGradientStops(displayOrder, isRunning ? [0.18, 0.15, 0.12] : [0.12, 0.1, 0.08])
  const shellStops = orderedGradientStops(displayOrder, [0.1, 0.06, 0.05])
  const flowStops: [string, string, string, string, string] = [
    hsla(gradientSeed(displayOrder) - 28, 92, 61, 0),
    hsla(gradientSeed(displayOrder), 92, 62, 0.08),
    hsla(gradientSeed(displayOrder) + 72, 90, 60, 0.14),
    hsla(gradientSeed(displayOrder) + 152, 92, 66, 0.1),
    hsla(gradientSeed(displayOrder) + 208, 88, 62, 0),
  ]
  const rainbowBorderStops: [string, string, string, string, string, string] = [
    '#22d3ee',
    '#34d399',
    '#f59e0b',
    '#ef4444',
    '#a78bfa',
    '#22d3ee',
  ]
  const rainbowBorderStopsReverse: [string, string, string, string, string, string] = [
    '#22d3ee',
    '#a78bfa',
    '#ef4444',
    '#f59e0b',
    '#34d399',
    '#22d3ee',
  ]
  const shellBorder = isRunning ? 'transparent' : rgba(accent, isFinished ? 0.44 : 0.28)
  const shellShadow = isRunning ? rgba(accent, 0.62) : rgba(accent, 0.3)
  const contentGradientColors: [string, string, string, string] = [
    panelStops[0],
    panelStops[1],
    panelStops[2],
    'rgba(9, 16, 28, 0.9)',
  ]
  const actionGradientColors: [string, string, string, string] = [
    actionStops[0],
    actionStops[1],
    actionStops[2],
    'rgba(13, 21, 35, 0.94)',
  ]
  const energyWidth: `${number}%` = progress.label
    ? `${progress.invalid ? 100 : Math.max(progress.ratio * 100, 6)}%`
    : isRunning
      ? '100%'
      : isFinished
        ? '72%'
        : isArchived
          ? '24%'
          : durationMs > 0
            ? '56%'
            : '34%'

  return (
    <Animated.View
      onLayout={(event: LayoutChangeEvent) => {
        onLayout?.(task.id, event.nativeEvent.layout.y, event.nativeEvent.layout.height)
      }}
      style={[
        styles.taskCardFrame,
        isDropTarget ? styles.taskCardFrameDropTarget : null,
        isDragging ? { transform: [{ translateY: dragOffsetY }], zIndex: 40, elevation: 30 } : null,
      ]}
    >
      <LinearGradient
        colors={[shellStops[0], shellStops[1], shellStops[2], 'rgba(4, 10, 18, 0.99)']}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={[
          styles.taskCard,
          isDragging ? styles.taskCardDragging : null,
          isDropTarget ? styles.taskCardDropTarget : null,
          { borderColor: shellBorder, shadowColor: shellShadow },
        ]}
      >
        {isRunning ? (
          <>
            <Animated.View pointerEvents="none" style={[styles.runningGlow, { backgroundColor: rgba(accent, 0.2), opacity: glowOpacity }]} />
            <Animated.View pointerEvents="none" style={[styles.runningBorderTrackHorizontal, styles.runningBorderTopTrack, { opacity: glowOpacity, transform: [{ translateX: borderTranslateX }] }]}>
              <LinearGradient colors={rainbowBorderStops} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.runningBorderGradientFill} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.runningBorderTrackHorizontal, styles.runningBorderBottomTrack, { opacity: glowOpacity, transform: [{ translateX: borderTranslateXReverse }] }]}>
              <LinearGradient colors={rainbowBorderStopsReverse} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.runningBorderGradientFill} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.runningBorderTrackVertical, styles.runningBorderLeftTrack, { opacity: glowOpacity, transform: [{ translateY: borderTranslateY }] }]}>
              <LinearGradient colors={rainbowBorderStops} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.runningBorderGradientFill} />
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.runningBorderTrackVertical, styles.runningBorderRightTrack, { opacity: glowOpacity, transform: [{ translateY: borderTranslateYReverse }] }]}>
              <LinearGradient colors={rainbowBorderStopsReverse} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={styles.runningBorderGradientFill} />
            </Animated.View>
            <Animated.View
              pointerEvents="none"
              style={[
                styles.runningSweep,
                {
                  opacity: innerGlowOpacity,
                  transform: [{ translateX: sweepTranslateX }, { rotate: '18deg' }],
                },
              ]}
            >
              <LinearGradient colors={[rgba('#ffffff', 0), rgba('#ffffff', 0.18), rgba('#ffffff', 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
            </Animated.View>
          </>
        ) : null}

        <Animated.View pointerEvents="none" style={[styles.cardSpectrumVeil, { opacity: innerGlowOpacity }]}>
          <LinearGradient
            colors={[shellStops[0], shellStops[1], shellStops[2], 'rgba(4, 10, 18, 0.08)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFillObject}
          />
        </Animated.View>
        {isRunning ? (
          <Animated.View
            pointerEvents="none"
            style={[styles.cardFlowLayer, { opacity: chromaOpacity, transform: [{ translateX: sweepTranslateX }] }]}
          >
            <LinearGradient colors={flowStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
          </Animated.View>
        ) : null}

        <View style={styles.coreRow}>
          <Pressable onPress={() => onOpenMenu(task)}>
            <LinearGradient colors={['rgba(17, 24, 39, 0.98)', rgba(accent, 0.26)]} style={[styles.orderChip, isRunning ? { borderColor: rgba(accent, 0.62) } : null]}>
              <Text style={styles.orderChipText}>#{index + 1}</Text>
            </LinearGradient>
          </Pressable>

          <Pressable
            onTouchCancel={handleContentTouchCancel}
            onTouchEnd={handleContentTouchEnd}
            onTouchMove={handleContentTouchMove}
            onTouchStart={handleContentTouchStart}
            style={styles.contentPressable}
          >
            <LinearGradient colors={contentGradientColors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={[styles.contentPanel, isDragging ? styles.contentPanelDragging : null]}>
              <LinearGradient
                colors={[rgba('#ffffff', 0.06), shellStops[0], shellStops[1], shellStops[2]]}
                start={{ x: 0, y: 0.5 }}
                end={{ x: 1, y: 0.5 }}
                style={styles.contentPrismOverlay}
              />
              <View pointerEvents="none" style={styles.contentDarkOverlay} />
              {isRunning ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.contentFlowLayer, { opacity: chromaOpacity, transform: [{ translateX: sweepTranslateX }] }]}
                >
                  <LinearGradient colors={flowStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
                </Animated.View>
              ) : null}
              {isRunning ? (
                <>
                  <LinearGradient colors={[rgba('#ffffff', 0.08), rgba('#7dd3fc', 0.04), rgba('#ffffff', 0)]} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.runningContentAura} />
                  <Animated.View pointerEvents="none" style={[styles.runningContentSweep, { opacity: glowOpacity, transform: [{ translateX: sweepTranslateX }, { rotate: '14deg' }] }]}>
                    <LinearGradient colors={[rgba('#ffffff', 0), rgba('#ffffff', 0.2), rgba('#ffffff', 0)]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={StyleSheet.absoluteFillObject} />
                  </Animated.View>
                </>
              ) : null}

              <View style={styles.contentTopRow}>
                <View style={[styles.inlineStatus, { backgroundColor: rgba(statusTone, 0.16), borderColor: rgba(statusTone, 0.34) }]}>
                  <Text style={styles.inlineStatusText}>{taskStatusLabel(task)}</Text>
                </View>
                <Text style={styles.updatedText}>{updatedText}</Text>
              </View>

              <View style={styles.contentTextWrap}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {summary}
                </Text>
              </View>

              <View style={styles.bottomMetaRow}>
                <View style={styles.metaBadgeRow}>
                  {tagText ? (
                    <View style={[styles.metaPill, { backgroundColor: tagBackground, borderColor: rgba(accent, 0.26) }]}>
                      <Text numberOfLines={1} style={[styles.metaPillText, { color: tagTextColor }]}>
                        {tagText}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.metaGhostPill}>
                    <Text style={styles.metaGhostText}>{attachmentText}</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </Pressable>

          <LinearGradient colors={actionGradientColors} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={styles.actionRail}>
            <LinearGradient
              colors={[rgba('#ffffff', 0.04), shellStops[0], shellStops[1], shellStops[2]]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={styles.actionPrismOverlay}
            />
            <View pointerEvents="none" style={styles.actionDarkOverlay} />
            {isRunning ? (
              <Animated.View
                pointerEvents="none"
                style={[styles.actionFlowLayer, { opacity: innerGlowOpacity, transform: [{ translateX: sweepTranslateX }] }]}
              >
                <LinearGradient colors={flowStops} start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }} style={StyleSheet.absoluteFillObject} />
              </Animated.View>
            ) : null}
            <View style={styles.actionButtonRow}>
              <Animated.View style={[styles.actionButtonCell, isRunning ? { transform: [{ scale: buttonScale }] } : null]}>
                <Pressable
                  style={[styles.actionTextButton, styles.primaryActionButton, actionDisabled ? styles.actionTextButtonDisabled : null]}
                  onPress={() => onToggleTimer(task)}
                  disabled={actionDisabled}
                >
                  <Text style={styles.actionTextButtonLabel}>{primaryActionLabel}</Text>
                </Pressable>
              </Animated.View>

              <View style={styles.actionButtonCell}>
                <Pressable
                  style={[
                    styles.actionTextButton,
                    styles.finishActionButton,
                    isFinished ? styles.finishActionButtonDone : null,
                    actionDisabled ? styles.actionTextButtonDisabled : null,
                  ]}
                  onPress={() => onToggleFinished(task)}
                  disabled={actionDisabled}
                >
                  <Text style={styles.actionTextButtonLabel}>{finishActionLabel}</Text>
                </Pressable>
              </View>
            </View>

            <Animated.View style={[styles.timerAnimatedWrap, isRunning ? { transform: [{ scale: buttonScale }] } : null]}>
              <LinearGradient
                colors={
                  isRunning
                    ? [panelStops[0], panelStops[1], panelStops[2]]
                    : [actionStops[1], 'rgba(16, 24, 37, 0.96)']
                }
                style={[styles.durationChip, { borderColor: rgba(accent, task.showDuration ? 0.4 : 0.18) }]}
              >
                <Text style={styles.durationChipText}>{durationText}</Text>
              </LinearGradient>
            </Animated.View>

            <Pressable
              style={[
                styles.progressCounter,
                { borderColor: progress.invalid ? rgba(COLORS.red, 0.42) : rgba(accent, 0.24) },
                progress.invalid ? styles.progressCounterInvalid : null,
              ]}
              onPress={() => onOpenMenu(task)}
            >
              <Text style={[styles.progressCounterText, progress.invalid ? styles.progressCounterTextInvalid : null]}>
                {progress.label ?? '--/--'}
              </Text>
            </Pressable>
          </LinearGradient>
        </View>

        <View style={styles.energyTrack}>
          <Animated.View
            style={[
              styles.energyFill,
              {
                width: energyWidth,
                backgroundColor: progress.invalid
                  ? COLORS.red
                  : progress.label
                    ? panelStops[1]
                    : isRunning
                      ? panelStops[1]
                      : durationMs > 0
                        ? hsla(gradientSeed(displayOrder) + 72, 85, 54, isFinished ? 0.56 : 0.42)
                        : 'rgba(255,255,255,0.14)',
                opacity: isRunning ? glowOpacity : 1,
              },
            ]}
          />
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: 'rgba(18, 24, 36, 0.84)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  filterChipActive: {
    backgroundColor: rgba(COLORS.cyan, 0.16),
    borderColor: rgba(COLORS.cyan, 0.3),
  },
  filterChipText: {
    color: COLORS.textSecondary,
    fontSize: 13,
    fontFamily: FONTS.bodyMedium,
  },
  filterChipTextActive: {
    color: COLORS.textPrimary,
  },
  filterChipCount: {
    color: COLORS.textMuted,
    fontSize: 12,
    fontFamily: FONTS.monoSemibold,
  },
  filterChipCountActive: {
    color: COLORS.lime,
  },
  statTile: {
    flexGrow: 1,
    minWidth: '22%',
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 4,
  },
  statLabel: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontFamily: FONTS.bodyMedium,
  },
  statValue: {
    fontSize: 22,
    lineHeight: 26,
    fontFamily: FONTS.displayBold,
  },
  taskCardFrame: {
    borderRadius: 18,
    overflow: 'visible',
  },
  taskCardFrameDropTarget: {
    transform: [{ scale: 0.992 }],
  },
  taskCard: {
    position: 'relative',
    borderRadius: 18,
    borderWidth: 1.8,
    padding: 4,
    shadowOpacity: 0.34,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 18 },
    elevation: 12,
    overflow: 'hidden',
  },
  taskCardDragging: {
    shadowOpacity: 0.48,
    shadowRadius: 34,
  },
  taskCardDropTarget: {
    borderColor: rgba(COLORS.cyan, 0.42),
  },
  cardSpectrumVeil: {
    ...StyleSheet.absoluteFillObject,
  },
  cardFlowLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -120,
    right: -120,
  },
  runningGlow: {
    ...StyleSheet.absoluteFillObject,
  },
  runningBorderTrackHorizontal: {
    position: 'absolute',
    left: -180,
    right: -180,
    height: 4,
  },
  runningBorderTopTrack: {
    position: 'absolute',
    top: 0,
  },
  runningBorderBottomTrack: {
    position: 'absolute',
    bottom: 0,
  },
  runningBorderTrackVertical: {
    position: 'absolute',
    top: -120,
    bottom: -120,
    width: 4,
  },
  runningBorderLeftTrack: {
    position: 'absolute',
    left: 0,
  },
  runningBorderRightTrack: {
    position: 'absolute',
    right: 0,
  },
  runningBorderGradientFill: {
    ...StyleSheet.absoluteFillObject,
  },
  runningSweep: {
    position: 'absolute',
    top: -28,
    bottom: -28,
    left: -220,
    width: 160,
  },
  coreRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 6,
    paddingTop: 2,
    paddingBottom: 6,
  },
  orderChip: {
    width: 50,
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderChipText: {
    color: COLORS.textPrimary,
    fontSize: 14,
    fontFamily: FONTS.monoSemibold,
  },
  contentPressable: {
    flex: 1,
  },
  contentPanel: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.32)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    overflow: 'hidden',
    gap: 8,
  },
  contentPanelDragging: {
    borderColor: rgba(COLORS.cyan, 0.48),
    backgroundColor: 'rgba(8, 16, 29, 0.96)',
  },
  contentPrismOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  contentDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 8, 16, 0.42)',
  },
  contentFlowLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -120,
    right: -120,
  },
  runningContentAura: {
    ...StyleSheet.absoluteFillObject,
  },
  runningContentSweep: {
    position: 'absolute',
    top: -12,
    bottom: -12,
    left: -120,
    width: 92,
  },
  contentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  inlineStatus: {
    minHeight: 24,
    paddingHorizontal: 9,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineStatusText: {
    color: '#f7fbff',
    fontSize: 11,
    fontFamily: FONTS.bodySemibold,
  },
  updatedText: {
    flex: 1,
    textAlign: 'right',
    color: 'rgba(235, 241, 252, 0.72)',
    fontSize: 10,
    fontFamily: FONTS.body,
  },
  contentTextWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTitle: {
    color: COLORS.textPrimary,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FONTS.displayMedium,
    textShadowColor: 'rgba(0,0,0,0.58)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 10,
  },
  bottomMetaRow: {
    marginTop: 2,
  },
  metaBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  metaPill: {
    minHeight: 24,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaPillText: {
    fontSize: 10,
    fontFamily: FONTS.bodySemibold,
  },
  metaGhostPill: {
    minHeight: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metaGhostText: {
    color: COLORS.textSecondary,
    fontSize: 10,
    fontFamily: FONTS.bodyMedium,
  },
  actionRail: {
    width: 112,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: 6,
    gap: 6,
    overflow: 'hidden',
  },
  actionPrismOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  actionDarkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 10, 18, 0.46)',
  },
  actionFlowLayer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -100,
    right: -100,
  },
  actionButtonRow: {
    flexDirection: 'row',
    gap: 6,
  },
  actionButtonCell: {
    flex: 1,
  },
  actionTextButton: {
    minHeight: 30,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(13, 18, 28, 0.42)',
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: '#7c3aed',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryActionButton: {
    backgroundColor: 'rgba(59, 130, 246, 0.18)',
    borderColor: 'rgba(125, 211, 252, 0.34)',
  },
  finishActionButton: {
    backgroundColor: 'rgba(139, 92, 246, 0.16)',
    borderColor: 'rgba(196, 181, 253, 0.28)',
  },
  finishActionButtonDone: {
    backgroundColor: rgba(COLORS.green, 0.18),
    borderColor: rgba(COLORS.green, 0.3),
  },
  actionTextButtonDisabled: {
    opacity: 0.46,
  },
  actionTextButtonLabel: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontFamily: FONTS.bodySemibold,
  },
  timerAnimatedWrap: {
    minHeight: 28,
  },
  durationChip: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  durationChipText: {
    color: '#fff7d6',
    fontSize: 11,
    fontFamily: FONTS.monoSemibold,
  },
  progressCounter: {
    minHeight: 28,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(8, 14, 24, 0.42)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  progressCounterInvalid: {
    borderColor: rgba(COLORS.red, 0.42),
    backgroundColor: rgba(COLORS.red, 0.16),
  },
  progressCounterText: {
    color: COLORS.textPrimary,
    fontSize: 11,
    fontFamily: FONTS.monoSemibold,
  },
  progressCounterTextInvalid: {
    color: '#ffd4cc',
  },
  energyTrack: {
    position: 'absolute',
    left: 4,
    right: 4,
    bottom: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  energyFill: {
    height: '100%',
    borderRadius: 999,
  },
})
