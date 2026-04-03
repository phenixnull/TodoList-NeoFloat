import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve('.')

test('live task editor shows the textarea text while editing so caret and glyphs share one layer', () => {
  const cssPath = path.join(repoRoot, 'src', 'index.css')
  const taskCardPath = path.join(repoRoot, 'src', 'components', 'TaskCard.tsx')
  const css = readFileSync(cssPath, 'utf8')
  const taskCard = readFileSync(taskCardPath, 'utf8')

  assert.match(taskCard, /placeholder=\{LABEL_EMPTY_TASK\}/)
  assert.match(css, /\.live-editor\.is-editing \.live-input \{[\s\S]*color:\s*var\(--text-main\)/)
  assert.match(css, /\.live-editor\.is-editing \.live-preview \{[\s\S]*opacity:\s*0/)
})
