import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_TASK_TAG_BACKGROUND_COLOR,
  DEFAULT_TASK_TAG,
  DEFAULT_TASK_TEXT_COLOR,
  formatTaskProgressText,
  normalizeTaskMeta,
  resolveTaskProgressCurrentFromRatio,
  resolveTaskProgressDraft,
  resolveTaskProgressPercent,
} from '../src/lib/taskMeta.ts'

test('normalizeTaskMeta applies safe defaults and trims invalid values', () => {
  assert.deepEqual(normalizeTaskMeta(undefined), {
    tagText: DEFAULT_TASK_TAG,
    progressCurrent: null,
    progressTotal: null,
    tagBackgroundColor: null,
    textColor: null,
  })

  assert.deepEqual(
    normalizeTaskMeta({
      tagText: '科研冲刺',
      progressCurrent: '16.2',
      progressTotal: '-4',
      tagBackgroundColor: DEFAULT_TASK_TAG_BACKGROUND_COLOR,
      textColor: DEFAULT_TASK_TEXT_COLOR,
    }),
    {
      tagText: '科研',
      progressCurrent: 16,
      progressTotal: 0,
      tagBackgroundColor: null,
      textColor: null,
    },
  )
})

test('task progress helpers format placeholders and clamp percent to 0-100', () => {
  assert.equal(
    formatTaskProgressText(
      normalizeTaskMeta({
        tagText: '日常',
      }),
    ),
    '-- / --',
  )

  assert.equal(
    resolveTaskProgressPercent(
      normalizeTaskMeta({
        tagText: '工作',
        progressCurrent: 16,
        progressTotal: 130,
      }),
    ),
    16 / 130 * 100,
  )

  assert.equal(
    resolveTaskProgressPercent(
      normalizeTaskMeta({
        tagText: '工作',
        progressCurrent: 300,
        progressTotal: 130,
      }),
    ),
    100,
  )
})

test('resolveTaskProgressDraft accepts blank or integer text for inline editing', () => {
  assert.deepEqual(resolveTaskProgressDraft('16', '130'), {
    progressCurrent: 16,
    progressTotal: 130,
    isInvalid: false,
    progressPercent: 16 / 130 * 100,
  })

  assert.deepEqual(resolveTaskProgressDraft('', ''), {
    progressCurrent: null,
    progressTotal: null,
    isInvalid: false,
    progressPercent: 0,
  })
})

test('resolveTaskProgressDraft marks illegal inline input as invalid', () => {
  assert.equal(resolveTaskProgressDraft('3.5', '10').isInvalid, true)
  assert.equal(resolveTaskProgressDraft('-1', '10').isInvalid, true)
  assert.equal(resolveTaskProgressDraft('16', '0').isInvalid, true)
  assert.equal(resolveTaskProgressDraft('16', 'abc').isInvalid, true)
  assert.equal(resolveTaskProgressDraft('16', '10').isInvalid, true)
  assert.equal(resolveTaskProgressDraft('16', '10').progressPercent, 100)
})

test('resolveTaskProgressCurrentFromRatio maps drag positions back to integer progress values', () => {
  assert.equal(resolveTaskProgressCurrentFromRatio(100, 0), 0)
  assert.equal(resolveTaskProgressCurrentFromRatio(100, 0.56), 56)
  assert.equal(resolveTaskProgressCurrentFromRatio(100, 1), 100)
  assert.equal(resolveTaskProgressCurrentFromRatio(100, 2), 100)
  assert.equal(resolveTaskProgressCurrentFromRatio(7, 0.5), 4)
})
