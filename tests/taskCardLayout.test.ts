import assert from 'node:assert/strict'
import test from 'node:test'
import {
  normalizeReportedEditorWidth,
  resolveLiveEditorMeasuredHeight,
  resolveTaskActionRowHeight,
  resolveTaskLayoutMetrics,
  shouldInlineDuration,
  shouldInlineVisibleDurationRow,
} from '../src/lib/taskCardLayout.ts'

test('shouldInlineDuration allows short one-line tasks in a wide viewport', () => {
  assert.equal(
    shouldInlineDuration({
      showDuration: true,
      hasAttachments: false,
      viewportWidth: 1080,
      editorWidth: 820,
      text: 'Ship the task duration row',
      fontSize: 13,
      durationText: '[01:36:00]',
    }),
    true,
  )
})

test('shouldInlineDuration blocks multiline content and widths that still cannot fit', () => {
  assert.equal(
    shouldInlineDuration({
      showDuration: true,
      hasAttachments: false,
      viewportWidth: 1080,
      editorWidth: 820,
      text: 'line one\nline two',
      fontSize: 13,
      durationText: '[01:36:00]',
    }),
    false,
  )

  assert.equal(
    shouldInlineDuration({
      showDuration: true,
      hasAttachments: false,
      viewportWidth: 620,
      editorWidth: 420,
      text: 'Rework the API prompt pipeline before the GT extractor ships',
      fontSize: 13,
      durationText: '[01:36:00]',
    }),
    false,
  )
})

test('resolveTaskActionRowHeight tightens compact rows', () => {
  assert.equal(resolveTaskActionRowHeight({ isCollapsed: true, compact: true }), 20)
  assert.equal(resolveTaskActionRowHeight({ isCollapsed: true, compact: false }), 22)
  assert.equal(resolveTaskActionRowHeight({ isCollapsed: false, compact: true }), 22)
  assert.equal(resolveTaskActionRowHeight({ isCollapsed: false, compact: false }), 24)
})

test('resolveTaskLayoutMetrics collapses single-line and hidden-duration cards to one row', () => {
  assert.deepEqual(
    resolveTaskLayoutMetrics({
      isCollapsed: true,
      showDuration: true,
      inlineDuration: true,
    }),
    {
      compact: true,
      rowHeight: 20,
      rowCount: 1,
      gapCount: 0,
      minHeight: 20,
    },
  )

  assert.deepEqual(
    resolveTaskLayoutMetrics({
      isCollapsed: true,
      showDuration: false,
      inlineDuration: false,
    }),
    {
      compact: true,
      rowHeight: 20,
      rowCount: 1,
      gapCount: 0,
      minHeight: 20,
    },
  )

  assert.deepEqual(
    resolveTaskLayoutMetrics({
      isCollapsed: true,
      showDuration: true,
      inlineDuration: false,
    }),
    {
      compact: false,
      rowHeight: 22,
      rowCount: 2,
      gapCount: 1,
      minHeight: 48,
    },
  )
})

test('normalizeReportedEditorWidth removes inline-mode feedback loops', () => {
  const durationText = '[08:45:24]'
  const stackedWidth = 420
  const inlineWidth = normalizeReportedEditorWidth({
    contentWidth: 340,
    inlineDuration: true,
    durationText,
  })

  assert.equal(inlineWidth, stackedWidth)

  assert.equal(
    shouldInlineVisibleDurationRow({
      editorWidth: inlineWidth,
      tasks: [
        {
          showDuration: true,
          hasAttachments: false,
          text: 'Optimize the todo card threshold',
          fontSize: 13,
          durationText,
        },
      ],
    }),
    true,
  )
})

test('shouldInlineVisibleDurationRow enables inline mode when all shown tasks fit on one line', () => {
  assert.equal(
    shouldInlineVisibleDurationRow({
      editorWidth: 520,
      tasks: [
        {
          showDuration: true,
          hasAttachments: false,
          text: 'Finalize the duration chip layout',
          fontSize: 13,
          durationText: '[01:55:29]',
        },
        {
          showDuration: true,
          hasAttachments: false,
          text: 'Trim the task row padding',
          fontSize: 13,
          durationText: '[08:15:54]',
        },
      ],
    }),
    true,
  )
})

test('shouldInlineVisibleDurationRow stays off when any shown task is multiline or too wide', () => {
  assert.equal(
    shouldInlineVisibleDurationRow({
      editorWidth: 520,
      tasks: [
        {
          showDuration: true,
          hasAttachments: false,
          text: 'line one\nline two',
          fontSize: 13,
          durationText: '[01:55:29]',
        },
        {
          showDuration: true,
          hasAttachments: false,
          text: 'Trim the task row padding',
          fontSize: 13,
          durationText: '[08:15:54]',
        },
      ],
    }),
    false,
  )

  assert.equal(
    shouldInlineVisibleDurationRow({
      editorWidth: 360,
      tasks: [
        {
          showDuration: true,
          hasAttachments: false,
          text: 'Finalize the duration chip layout',
          fontSize: 13,
          durationText: '[01:55:29]',
        },
        {
          showDuration: true,
          hasAttachments: false,
          text: 'Rework the API prompt pipeline before the GT extractor ships',
          fontSize: 13,
          durationText: '[08:54:55]',
        },
      ],
    }),
    false,
  )
})

test('resolveLiveEditorMeasuredHeight prefers the visible textarea height while editing', () => {
  assert.equal(
    resolveLiveEditorMeasuredHeight({
      previewHeight: 38,
      inputHeight: 62,
      isEditing: true,
    }),
    62,
  )

  assert.equal(
    resolveLiveEditorMeasuredHeight({
      previewHeight: 84,
      inputHeight: 62,
      isEditing: true,
    }),
    62,
  )

  assert.equal(
    resolveLiveEditorMeasuredHeight({
      previewHeight: 52,
      inputHeight: 36,
      isEditing: false,
    }),
    52,
  )
})

test('resolveLiveEditorMeasuredHeight can prefer textarea height for plain-text preview mode', () => {
  assert.equal(
    resolveLiveEditorMeasuredHeight({
      previewHeight: 84,
      inputHeight: 62,
      isEditing: false,
      preferInputHeight: true,
    }),
    62,
  )

  assert.equal(
    resolveLiveEditorMeasuredHeight({
      previewHeight: 84,
      inputHeight: 62,
      isEditing: false,
      preferInputHeight: false,
    }),
    84,
  )
})
