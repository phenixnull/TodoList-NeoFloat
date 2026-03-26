const test = require('node:test')
const assert = require('node:assert/strict')

const { shouldAbortBlurCollapseState } = require('./edgeVisibilityGuards.cjs')

test('aborts blur collapse during startup protection', () => {
  const result = shouldAbortBlurCollapseState({
    visible: true,
    minimized: false,
    startupProtected: true,
    recoveryActive: false,
    focused: false,
    recentPointer: false,
    recentEdge: false,
    cursorInside: false,
  })

  assert.equal(result, true)
})

test('allows blur collapse when every guard is cleared', () => {
  const result = shouldAbortBlurCollapseState({
    visible: true,
    minimized: false,
    startupProtected: false,
    recoveryActive: false,
    focused: false,
    recentPointer: false,
    recentEdge: false,
    cursorInside: false,
  })

  assert.equal(result, false)
})
