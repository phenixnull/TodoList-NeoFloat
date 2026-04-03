import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CONTEXT_MENU_FINISH_TEXT,
  CONTEXT_MENU_INSERT_AFTER_TEXT,
  CONTEXT_MENU_UNFINISH_TEXT,
} from '../src/lib/contextMenuLabels.ts'

test('context menu uses the requested insert and unfinish emoji labels', () => {
  assert.equal(CONTEXT_MENU_INSERT_AFTER_TEXT, '➕ 在下方插入任务')
  assert.equal(CONTEXT_MENU_UNFINISH_TEXT, '❌ 取消完成状态')
  assert.equal(CONTEXT_MENU_FINISH_TEXT, '✅ 设为完成状态')
})
