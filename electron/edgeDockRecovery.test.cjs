const test = require('node:test')
const assert = require('node:assert/strict')

const { resolveUndetectedDockState } = require('./edgeDockRecovery.cjs')

const TOP_BOUNDS = { x: 100, y: 0, width: 420, height: 720 }
const LEFT_BOUNDS = { x: 0, y: 96, width: 420, height: 720 }

test('preserves the dock during recovery when detection temporarily fails', () => {
  const result = resolveUndetectedDockState({
    previousSide: 'top',
    previousExpanded: TOP_BOUNDS,
    currentExpanded: TOP_BOUNDS,
    stableSide: 'top',
    stableExpanded: TOP_BOUNDS,
    recoveryActive: true,
    missCount: 3,
    undockedMs: 260,
    minMissCount: 3,
    debounceMs: 240,
  })

  assert.equal(result.action, 'preserve-recovery')
  assert.equal(result.nextSide, 'top')
  assert.deepEqual(result.nextExpanded, TOP_BOUNDS)
  assert.equal(result.resetDebounce, true)
})

test('falls back to the last stable dock during recovery when the current dock is already missing', () => {
  const result = resolveUndetectedDockState({
    previousSide: null,
    previousExpanded: null,
    currentExpanded: null,
    stableSide: 'left',
    stableExpanded: LEFT_BOUNDS,
    recoveryActive: true,
    missCount: 1,
    undockedMs: 0,
    minMissCount: 3,
    debounceMs: 240,
  })

  assert.equal(result.action, 'preserve-recovery')
  assert.equal(result.nextSide, 'left')
  assert.deepEqual(result.nextExpanded, LEFT_BOUNDS)
  assert.equal(result.resetDebounce, true)
})

test('commits a dock clear outside recovery after debounce thresholds are exceeded', () => {
  const result = resolveUndetectedDockState({
    previousSide: 'top',
    previousExpanded: TOP_BOUNDS,
    currentExpanded: TOP_BOUNDS,
    stableSide: 'top',
    stableExpanded: TOP_BOUNDS,
    recoveryActive: false,
    missCount: 3,
    undockedMs: 260,
    minMissCount: 3,
    debounceMs: 240,
  })

  assert.equal(result.action, 'clear-commit')
  assert.equal(result.nextSide, null)
  assert.equal(result.nextExpanded, null)
  assert.equal(result.resetDebounce, true)
})

test('keeps the current dock outside recovery while clear debounce is still pending', () => {
  const result = resolveUndetectedDockState({
    previousSide: 'top',
    previousExpanded: TOP_BOUNDS,
    currentExpanded: TOP_BOUNDS,
    stableSide: 'top',
    stableExpanded: TOP_BOUNDS,
    recoveryActive: false,
    missCount: 2,
    undockedMs: 120,
    minMissCount: 3,
    debounceMs: 240,
  })

  assert.equal(result.action, 'preserve-pending')
  assert.equal(result.nextSide, 'top')
  assert.deepEqual(result.nextExpanded, TOP_BOUNDS)
  assert.equal(result.resetDebounce, false)
})
