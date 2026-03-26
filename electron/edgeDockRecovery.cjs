function cloneBounds(bounds) {
  if (!bounds) {
    return null
  }

  return {
    x: Math.round(bounds.x),
    y: Math.round(bounds.y),
    width: Math.round(bounds.width),
    height: Math.round(bounds.height),
  }
}

function pickBounds(...candidates) {
  for (const candidate of candidates) {
    if (candidate) {
      return cloneBounds(candidate)
    }
  }
  return null
}

function resolveUndetectedDockState({
  previousSide = null,
  previousExpanded = null,
  currentExpanded = null,
  stableSide = null,
  stableExpanded = null,
  recoveryActive = false,
  missCount = 0,
  undockedMs = 0,
  minMissCount = 0,
  debounceMs = 0,
} = {}) {
  const fallbackSide = previousSide || stableSide || null
  const fallbackExpanded = pickBounds(previousExpanded, currentExpanded, stableExpanded)

  if (recoveryActive && fallbackSide && fallbackExpanded) {
    return {
      action: 'preserve-recovery',
      nextSide: fallbackSide,
      nextExpanded: fallbackExpanded,
      resetDebounce: true,
    }
  }

  if (!previousSide) {
    return {
      action: 'clear-idle',
      nextSide: null,
      nextExpanded: null,
      resetDebounce: true,
    }
  }

  if (missCount >= minMissCount && undockedMs >= debounceMs) {
    return {
      action: 'clear-commit',
      nextSide: null,
      nextExpanded: null,
      resetDebounce: true,
    }
  }

  return {
    action: 'preserve-pending',
    nextSide: previousSide,
    nextExpanded: fallbackExpanded,
    resetDebounce: false,
  }
}

module.exports = {
  resolveUndetectedDockState,
}
