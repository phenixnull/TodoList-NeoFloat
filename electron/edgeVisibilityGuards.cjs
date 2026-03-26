function shouldAbortBlurCollapseState({
  visible = true,
  minimized = false,
  startupProtected = false,
  recoveryActive = false,
  focused = false,
  recentPointer = false,
  recentEdge = false,
  cursorInside = false,
} = {}) {
  if (!visible || minimized) {
    return true
  }
  if (startupProtected || recoveryActive) {
    return true
  }
  if (focused || recentPointer || recentEdge || cursorInside) {
    return true
  }
  return false
}

module.exports = {
  shouldAbortBlurCollapseState,
}
