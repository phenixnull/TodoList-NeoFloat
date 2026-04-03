import assert from 'node:assert/strict'
import test from 'node:test'
import { DEFAULT_APP_SETTINGS } from '../src/lib/defaultSettings.ts'
import {
  DEFAULT_CONTEXT_MENU_ORDER,
  normalizeContextMenuOrder,
  reorderContextMenuOrder,
  shiftContextMenuOrderItem,
} from '../src/lib/contextMenuOrder.ts'

test('normalizeContextMenuOrder removes duplicates and appends missing entries', () => {
  assert.deepEqual(
    normalizeContextMenuOrder([
      'delete',
      'stats',
      'delete',
      'unknown',
      'toggle-duration',
    ]),
    [
      'delete',
      'stats',
      'toggle-duration',
      ...DEFAULT_CONTEXT_MENU_ORDER.filter((id) => !['delete', 'stats', 'toggle-duration'].includes(id)),
    ],
  )
})

test('reorderContextMenuOrder moves the active entry before the target using normalized order', () => {
  assert.deepEqual(
    reorderContextMenuOrder({
      order: ['delete', 'stats', 'toggle-duration'],
      activeId: 'delete',
      overId: 'toggle-duration',
    }).slice(0, 4),
    ['stats', 'toggle-duration', 'delete', DEFAULT_CONTEXT_MENU_ORDER[2]],
  )
})

test('DEFAULT_APP_SETTINGS includes the full default context menu order', () => {
  assert.deepEqual(DEFAULT_APP_SETTINGS.contextMenuOrder, [...DEFAULT_CONTEXT_MENU_ORDER])
})

test('shiftContextMenuOrderItem moves one slot at a time and stops at boundaries', () => {
  const movedUp = shiftContextMenuOrderItem({
    order: DEFAULT_CONTEXT_MENU_ORDER,
    itemId: 'toggle-all-durations',
    direction: -1,
  })

  assert.deepEqual(movedUp.slice(0, 4), ['stats', 'toggle-all-durations', 'toggle-duration', 'toggle-duration-layout'])

  const stillFirst = shiftContextMenuOrderItem({
    order: movedUp,
    itemId: 'stats',
    direction: -1,
  })

  assert.deepEqual(stillFirst, movedUp)
})
