# Lessons Learned & Anti-Patterns

## 2026-10-03: Check-in Bounce-Back (useEffect re-runs overwriting state)

### What Happened

Task cards bounced back to their previous section after check-in/uncheck.

### Root Cause

The `loadData` useEffect in `useHabitStore.ts` had `[commit, schedulePull]` as dependencies. `schedulePull` changed reference whenever `pullFromServer` was recreated, causing the effect to re-run. Each re-run loaded stale AsyncStorage data via `commit(stored, false)`, overwriting in-memory optimistic updates.

### The Fix

Change the dependency array to `[]` (run only on mount). Use `useRef` for any function that must call the latest version.

### Rules to Prevent Recurrence

1. NEVER put `schedulePull` or `pullFromServer` in useEffect deps for the initial loadData.
2. When 3+ fixes fail, STOP and check useEffect dependency chains.
3. Test on actual platform (emulator/device), not just unit tests.
4. Use useRef pattern for stable function references in effects.
5. Every bug fix must be tested on BOTH mobile and PC before release.

### Pipeline

Every bug fix MUST go through:
1. Code change
2. Run: app typecheck + test
3. Run: desktop build
4. Run: server typecheck + test
5. Check both platforms have same logic
6. Build new APK
7. Install on Android emulator
8. Test on emulator (screenshot before/after)
9. Verify: no bounce for 20+ seconds
10. Deploy APK + update manifest
11. Restart Electron
12. Push to GitHub
13. Cc-Notify