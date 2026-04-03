const INLINE_BUTTON_WIDTH = 84
const INLINE_ACTION_GAP = 4
const INLINE_CONTENT_PADDING = 16
const INLINE_VIEWPORT_FRAME = 150
const FALLBACK_FONT_FAMILY = "'Segoe UI', 'Microsoft YaHei', sans-serif"

let inlineMeasureContext: CanvasRenderingContext2D | null | undefined

function getInlineMeasureContext(): CanvasRenderingContext2D | null {
  if (inlineMeasureContext !== undefined) {
    return inlineMeasureContext
  }

  if (typeof document === 'undefined') {
    inlineMeasureContext = null
    return inlineMeasureContext
  }

  const canvas = document.createElement('canvas')
  inlineMeasureContext = canvas.getContext('2d')
  return inlineMeasureContext
}

function resolveInlineActionWidth(durationText: string): number {
  const durationWidth = Math.max(76, durationText.length * 6 + 16)
  return INLINE_BUTTON_WIDTH + INLINE_ACTION_GAP + durationWidth
}

function resolveCurrentActionColumnWidth(durationText: string): number {
  const durationWidth = Math.max(76, durationText.length * 6 + 16)
  return Math.max(INLINE_BUTTON_WIDTH, durationWidth)
}

export function resolveInlineExtraWidth(durationText: string): number {
  return Math.max(0, resolveInlineActionWidth(durationText) - resolveCurrentActionColumnWidth(durationText))
}

export function normalizeReportedEditorWidth(input: {
  contentWidth: number
  inlineDuration: boolean
  durationText: string
}): number {
  return Math.max(0, input.contentWidth) + (input.inlineDuration ? resolveInlineExtraWidth(input.durationText) : 0)
}

export function estimateInlineTextWidth(text: string, fontSize: number): number {
  let units = 0

  for (const char of text) {
    if (/\s/.test(char)) {
      units += 0.35
      continue
    }

    if (/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/.test(char)) {
      units += 1
      continue
    }

    if (/[A-Z0-9]/.test(char)) {
      units += 0.68
      continue
    }

    units += 0.56
  }

  return units * fontSize
}

export function measureInlineTextWidth(text: string, fontSize: number, fontFamily?: string): number {
  const context = getInlineMeasureContext()
  if (!context) {
    return estimateInlineTextWidth(text, fontSize)
  }

  context.font = `${fontSize}px ${fontFamily?.trim() || FALLBACK_FONT_FAMILY}`
  return context.measureText(text).width
}

export function shouldInlineDuration(input: {
  showDuration: boolean
  hasAttachments: boolean
  viewportWidth: number
  editorWidth: number
  text: string
  fontSize: number
  fontFamily?: string
  durationText: string
}): boolean {
  const text = input.text.trim()
  if (!input.showDuration || input.hasAttachments || !text || text.includes('\n')) {
    return false
  }

  const estimatedTextWidth = measureInlineTextWidth(text, input.fontSize, input.fontFamily)
  const inlineContainerWidth = Math.max(input.editorWidth, input.viewportWidth - INLINE_VIEWPORT_FRAME)
  return estimatedTextWidth + INLINE_CONTENT_PADDING + resolveInlineExtraWidth(input.durationText) <= Math.max(0, inlineContainerWidth)
}

export function shouldInlineVisibleDurationRow(input: {
  editorWidth: number
  tasks: Array<{
    showDuration: boolean
    hasAttachments: boolean
    text: string
    fontSize: number
    fontFamily?: string
    durationText: string
  }>
}): boolean {
  const shownTasks = input.tasks.filter((task) => task.showDuration)
  if (shownTasks.length === 0) {
    return false
  }

  if (
    shownTasks.some((task) => {
      const text = task.text.trim()
      return !text || task.hasAttachments || text.includes('\n')
    })
  ) {
    return false
  }

  const requiredWidth = Math.max(
    ...shownTasks.map((task) => measureInlineTextWidth(task.text.trim(), task.fontSize, task.fontFamily) + INLINE_CONTENT_PADDING + resolveInlineExtraWidth(task.durationText)),
  )

  return requiredWidth <= Math.max(0, input.editorWidth)
}

export function resolveTaskActionRowHeight(input: { isCollapsed: boolean; compact: boolean }): number {
  if (input.isCollapsed) {
    return input.compact ? 20 : 22
  }

  return input.compact ? 22 : 24
}

export function resolveTaskLayoutMetrics(input: {
  isCollapsed: boolean
  showDuration: boolean
  inlineDuration: boolean
}): {
  compact: boolean
  rowHeight: number
  rowCount: number
  gapCount: number
  minHeight: number
} {
  const compact = !input.showDuration || input.inlineDuration
  const rowCount = compact ? 1 : 2
  const gapCount = compact ? 0 : 1
  const rowHeight = resolveTaskActionRowHeight({
    isCollapsed: input.isCollapsed,
    compact,
  })

  return {
    compact,
    rowHeight,
    rowCount,
    gapCount,
    minHeight: rowHeight * rowCount + 4 * gapCount,
  }
}
