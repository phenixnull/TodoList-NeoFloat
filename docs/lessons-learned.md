# Lessons Learned & Anti-Patterns

## 2026-10-04: Sync-enabled bounce-back (stale generations + empty JSON DELETE)

### What Happened

Turning server sync on made mobile check-in and cancel flip back; sync off stayed stable. Earlier fixes only patched UI symptoms.

### Root Causes

1. Concurrent pulls were not serialized. A DELETE-before snapshot could finish after a newer snapshot and overwrite the newer local state.
2. `applySnapshot` mutated pending check-in tombstones while merging, so protection could be consumed before the snapshot was committed.
3. `flushLocal` replayed a stale local snapshot and could POST a check-in that the user had just deleted.
4. `fetchServerData` used three independent endpoints, so it could merge tasks/check-ins/day-records from different database generations.
5. Mobile `apiRequest` always sent `Content-Type: application/json`, including bodyless DELETE requests. Fastify returned `FST_ERR_CTP_EMPTY_JSON_BODY` / API 400, so cancellation never reached the server and later pulls resurrected the card.

### The Fix

- Added a monotonic `sync_state.revision` and transactional `GET /api/snapshot`.
- Mobile/desktop prefer one consistent server snapshot and reject revisions older than the last applied generation.
- Serialized all pull/flush operations through one sync queue.
- Per check-in key, serialized operations and kept the latest operation sequence.
- Image download now happens after the snapshot is committed, instead of keeping a stale generation alive.
- `flushLocal` re-reads latest local check-ins and honors pending deletions.
- Bodyless DELETE requests no longer send an empty JSON content type.
- Removed list-level remounting on completed-count changes.

### Verification

- App/server typecheck and full app/server tests pass.
- Added regression coverage for old in-flight pull resurrection and bodyless DELETE headers.
- Emulator v1.7.2 check-in/uncheck showed no immediate visual bounce, but server logs exposed API 400 on DELETE; v1.7.3 fixes that final sync failure.
- Desktop v1.0.3 was launched against the restarted server and real UI check-in/uncheck was verified with no bounce.

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
