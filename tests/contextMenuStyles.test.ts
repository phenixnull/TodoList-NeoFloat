import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const css = readFileSync(path.resolve('src/index.css'), 'utf8')
const appSource = readFileSync(path.resolve('src/App.tsx'), 'utf8')
const taskCardSource = readFileSync(path.resolve('src/components/TaskCard.tsx'), 'utf8')

test('context menu drag handle shares the single-line row height token with menu buttons', () => {
  assert.match(css, /--context-menu-row-min-height:\s*36px;/)
  assert.match(css, /\.task-context-menu button \{[\s\S]*?min-height:\s*var\(--context-menu-row-min-height\);/m)
  assert.match(css, /\.task-context-menu \.context-menu-drag-handle \{[\s\S]*?min-height:\s*var\(--context-menu-row-min-height\);/m)
})

test('meta submenu supports tag background color directly and no longer redirects that choice to task gradients', () => {
  assert.match(appSource, /metaTagBackgroundColorInput/)
  assert.match(appSource, /tagBackgroundColor:\s*metaTagBackgroundColorInput/)
  assert.doesNotMatch(appSource, /task gradient/i)
  assert.match(taskCardSource, /--task-tag-background/)
  assert.match(css, /\.task-tag-pill \{[\s\S]*background:\s*var\(--task-tag-background/)
  assert.match(appSource, /className="meta-color-grid"/)
  assert.match(appSource, /className="meta-color-swatch-trigger"/)
  assert.match(appSource, /className="meta-color-code"/)
  assert.doesNotMatch(appSource, /label className="meta-field meta-color-field"/)
  assert.match(css, /\.task-context-menu \.meta-color-grid \{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/)
  assert.match(css, /\.task-context-menu \.meta-color-swatch-trigger \{[\s\S]*width:\s*34px[\s\S]*height:\s*30px/)
})

test('context menu closes from outside pointerdown with the shared closeContextMenu path', () => {
  assert.match(appSource, /document\.addEventListener\('pointerdown', onPointerDown, true\)/)
  assert.match(appSource, /document\.removeEventListener\('pointerdown', onPointerDown, true\)/)
  assert.match(appSource, /if \(menuEl && target instanceof Node && menuEl\.contains\(target\)\) \{/)
  assert.match(appSource, /closeContextMenu\(\)/)
})

test('meta submenu keeps fields inside the panel and supports inline custom tag creation from the plus chip', () => {
  assert.match(appSource, /metaCustomTagDraft/)
  assert.match(appSource, /metaCustomTagEditing/)
  assert.match(appSource, /className="meta-preset-add-btn"/)
  assert.match(appSource, /className="meta-preset-input"/)
  assert.match(appSource, /meta-preset-custom/)
  assert.match(appSource, /Array\.from\(metaCustomTagDraft\.trim\(\)\)\.slice\(0,\s*2\)\.join\(''\)/)
  assert.match(appSource, /onBlur=\{commitCustomTagDraft\}/)
  assert.match(css, /\.task-context-menu \.meta-preset-grid \{[\s\S]*grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(54px,\s*1fr\)\)/)
  assert.match(css, /\.task-context-menu \.meta-field \{[\s\S]*min-width:\s*0/)
  assert.match(css, /\.task-context-menu \.meta-field input\[type='number'\] \{[\s\S]*width:\s*100%[\s\S]*min-width:\s*0/)
  assert.match(css, /\.task-context-menu \.meta-color-code \{[\s\S]*min-width:\s*0[\s\S]*font-size:\s*10px[\s\S]*overflow:\s*hidden/)
})

test('archive menu always exposes independent archive-tag and archive-hide actions', () => {
  assert.match(appSource, /case 'toggle-archive':[\s\S]*archiveTask\(contextTask\.id\)/)
  assert.match(appSource, /case 'toggle-archive':[\s\S]*unarchiveTask\(contextTask\.id\)/)
  assert.match(appSource, /case 'toggle-archive':[\s\S]*archiveAndHideTask\(contextTask\.id\)/)
  assert.doesNotMatch(appSource, /case 'toggle-archive':[\s\S]*return !contextTask\.archived/)
})

test('show hidden menu restores hidden flags instead of flipping a global visibility switch', () => {
  assert.match(appSource, /const showHiddenTasks = useTaskStore\(\(state\) => state\.showHiddenTasks\)/)
  assert.match(appSource, /showHiddenTasks\(\{ mode: 'all' \}\)/)
  assert.match(appSource, /showHiddenTasks\(\{ mode: 'range', start, end, basis: archiveDateBasis \}\)/)
  assert.doesNotMatch(appSource, /showArchived:\s*true/)
  assert.doesNotMatch(appSource, /关闭隐藏任务显示/)
})

test('show hidden menu defaults to today and archived time while exposing four date bases', () => {
  assert.match(appSource, /const \[archiveDateBasis, setArchiveDateBasis\] = useState<[^>]+>\('archived'\)/)
  assert.match(appSource, /setArchiveDateBasis\('archived'\)/)
  assert.match(appSource, /value=\{archiveDateBasis\}/)
  assert.match(appSource, /<option value="created">创建时间<\/option>/)
  assert.match(appSource, /<option value="finished">完成时间<\/option>/)
  assert.match(appSource, /<option value="hidden">隐藏时间<\/option>/)
  assert.match(appSource, /<option value="archived">归档时间<\/option>/)
})
