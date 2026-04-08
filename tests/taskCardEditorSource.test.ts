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

test('plain text preview bypasses markdown rendering so preview and textarea share the same text flow', () => {
  const taskCardPath = path.join(repoRoot, 'src', 'components', 'TaskCard.tsx')
  const taskCard = readFileSync(taskCardPath, 'utf8')

  assert.match(taskCard, /hasRichPreviewToken/)
  assert.match(taskCard, /const useMarkdownPreview = hasRichPreviewToken\(task\.contentRaw\)/)
  assert.match(taskCard, /<div className="live-preview-text">\{previewText\}<\/div>/)
})

test('task progress counter is directly editable and invalid drafts turn the whole progress bar red', () => {
  const cssPath = path.join(repoRoot, 'src', 'index.css')
  const taskCardPath = path.join(repoRoot, 'src', 'components', 'TaskCard.tsx')
  const css = readFileSync(cssPath, 'utf8')
  const taskCard = readFileSync(taskCardPath, 'utf8')

  assert.match(taskCard, /task-progress-counter-input/)
  assert.match(taskCard, /onChange=\{\(event\) => setProgressCurrentDraft\(event\.target\.value\)\}/)
  assert.match(taskCard, /onChange=\{\(event\) => setProgressTotalDraft\(event\.target\.value\)\}/)
  assert.match(taskCard, /task-progress-track', \{ invalid: progressDraft\.isInvalid, draggable: canDragProgress, dragging: isDraggingProgress \}/)
  assert.match(css, /\.task-progress-track\.invalid::before \{[\s\S]*background:\s*rgba\(127,\s*29,\s*29,\s*0\.72\)/)
  assert.match(css, /\.task-progress-track\.invalid \.task-progress-fill \{[\s\S]*width:\s*100%/)
})

test('task progress display text stays centered when not editing', () => {
  const cssPath = path.join(repoRoot, 'src', 'index.css')
  const css = readFileSync(cssPath, 'utf8')

  assert.match(css, /\.task-progress-counter-text \{[\s\S]*grid-column:\s*1\s*\/\s*-1/)
  assert.match(css, /\.task-progress-counter-text \{[\s\S]*justify-content:\s*center/)
})

test('valid progress bars expose drag handlers and draggable styling', () => {
  const cssPath = path.join(repoRoot, 'src', 'index.css')
  const taskCardPath = path.join(repoRoot, 'src', 'components', 'TaskCard.tsx')
  const css = readFileSync(cssPath, 'utf8')
  const taskCard = readFileSync(taskCardPath, 'utf8')

  assert.match(taskCard, /onPointerDown=\{handleProgressTrackPointerDown\}/)
  assert.match(taskCard, /onPointerMove=\{handleProgressTrackPointerMove\}/)
  assert.match(taskCard, /onPointerUp=\{handleProgressTrackPointerUp\}/)
  assert.match(taskCard, /task-progress-track', \{ invalid: progressDraft\.isInvalid, draggable: canDragProgress, dragging: isDraggingProgress \}/)
  assert.match(css, /\.task-progress-track\.draggable \{[^}]*cursor:\s*pointer/)
  assert.doesNotMatch(css, /\.task-progress-track\.draggable \{[^}]*cursor:\s*ew-resize/)
  assert.match(css, /\.task-progress-track\.dragging \{[\s\S]*transform:\s*scaleY\(1\.05\)/)
})

test('progress row shows a larger circular thumb on hover and shields nearby pointer input from card dragging', () => {
  const cssPath = path.join(repoRoot, 'src', 'index.css')
  const taskCardPath = path.join(repoRoot, 'src', 'components', 'TaskCard.tsx')
  const css = readFileSync(cssPath, 'utf8')
  const taskCard = readFileSync(taskCardPath, 'utf8')

  assert.match(taskCard, /className="task-progress-row"/)
  assert.match(taskCard, /className="task-progress-thumb"/)
  assert.match(taskCard, /<div className="task-progress-row"[\s\S]*onPointerDown=\{stopDragPropagation\}/)
  assert.match(css, /\.task-progress-track \{[\s\S]*height:\s*20px/)
  assert.match(css, /\.task-progress-track::before \{[\s\S]*height:\s*6px/)
  assert.match(css, /\.task-progress-thumb \{[\s\S]*width:\s*18px[\s\S]*height:\s*18px[\s\S]*border-radius:\s*999px/)
  assert.match(css, /\.task-progress-row:hover \.task-progress-track\.draggable \.task-progress-thumb,[\s\S]*opacity:\s*1/)
  assert.match(css, /\.task-progress-row:hover \.task-progress-track\.draggable \.task-progress-thumb,[\s\S]*transform:\s*translate\(-50%,\s*-50%\) scale\(1\)/)
})
