import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const css = readFileSync(path.resolve('src/index.css'), 'utf8')

test('context menu drag handle shares the single-line row height token with menu buttons', () => {
  assert.match(css, /--context-menu-row-min-height:\s*36px;/)
  assert.match(css, /\.task-context-menu button \{[\s\S]*?min-height:\s*var\(--context-menu-row-min-height\);/m)
  assert.match(css, /\.task-context-menu \.context-menu-drag-handle \{[\s\S]*?min-height:\s*var\(--context-menu-row-min-height\);/m)
})
