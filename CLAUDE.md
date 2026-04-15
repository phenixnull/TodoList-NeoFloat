# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Electron-based floating todo list desktop app ("Neo Float Todo") with a transparent, always-on-top window that docks to screen edges with auto-hide. Features time tracking, markdown with LaTeX math, image attachments, customizable task colors, and cross-device sync via a companion sync server and mobile web/native clients.

## Technology Stack

- **Frontend**: React 19 + TypeScript + Vite 7
- **State Management**: Zustand 5
- **Desktop Framework**: Electron 40
- **UI**: Drag-and-drop (@dnd-kit), markdown (react-markdown + KaTeX)
- **Build/Package**: Vite with electron-builder (NSIS installer for Windows)
- **Sync Server**: Node.js `http` module, token-based auth
- **Mobile**: Web client (`src/mobile/`) + Expo-based Android app (`native-app/`)

## Development Commands

```bash
npm install               # Install dependencies
npm run dev               # Dev mode (Vite renderer + Electron concurrently)
npm run dev:renderer      # Renderer only (port 5173)
npm run build             # TypeScript check + Vite build
npm run dist              # Build + electron-builder package
npm run dist:win          # Build + Windows NSIS installer (x64)
npm run lint              # ESLint (flat config)
npm test                  # Run all tests (Node.js native test runner)
npm start                 # Start Electron with built files
npm run server:sync       # Start sync server (requires TODO_SYNC_TOKEN env var)
```

### Running a single test

Tests use Node.js native test runner with `node:test` and `node:assert/strict`, importing `.ts` files directly:

```bash
node --test tests/math.test.ts                    # Single renderer-side test
node --test electron/runtimePaths.test.cjs         # Single electron-side test
```

## Architecture

### Three-Tier System

1. **Desktop Electron App** — Main product. Renderer (React) + main process (Electron).
2. **Sync Server** (`server/`) — Lightweight HTTP API that stores state and serves the mobile web client. Requires `TODO_SYNC_TOKEN`. Env vars: `TODO_SYNC_PORT` (default 8787), `TODO_SYNC_HOST`, `TODO_SYNC_DATA_DIR`, `TODO_SYNC_DIST_DIR`.
3. **Mobile Clients** — Web (`src/mobile/`, built as `mobile.html` entry point in Vite) and Expo native Android app (`native-app/`).

### State Management (Zustand Store — `src/store/useTaskStore.ts`)

Single store managing tasks, settings, and persistence. Key patterns:
- All mutations enqueue a persist operation → writes both `state.snapshot.json` (full snapshot) and `events.YYYY-MM-DD.jsonl` (append-only event log) via IPC.
- Content updates are debounced (200ms via `contentPersistScheduler`); structural operations (start/pause, archive, delete) persist immediately.
- State hydration uses `normalize*` functions (`normalizeTaskMeta`, `normalizeContextMenuOrder`, etc.) to ensure integrity.

### Electron Main Process (`electron/main.cjs`)

- Window management with custom edge-docking (left/right/top screen edges)
- **Edge Auto-Hide**: State machine — detects edge docking, collapses to thin strip on blur/mouse-leave, expands on hover/focus. Supports manual collapse mode with visible badge.
- Edge docking has recovery (`edgeDockRecovery.cjs`) and visibility guards (`edgeVisibilityGuards.cjs`) as separate modules.
- Sync runtime (`electron/syncRuntime.cjs`) handles background sync between local app and remote server.
- Task asset cleanup (`electron/taskAssetCleanup.cjs`) manages orphaned image files.

### IPC Communication (preload.cjs → `window.todoAPI`)

**Invoke methods** (request/response):
- `getState()` / `persistState(payload)` — State hydration and persistence
- `getEventDateRange()` — Date range of available event logs
- `saveTaskImage(payload)` / `readTaskImageDataUrl(storagePath)` / `openTaskImage(storagePath)` — Image handling
- `setWindowOptions(options)` / `windowControl(action)` — Window settings and minimize/close
- `getWindowBounds()` / `setWindowBounds(bounds)` — Window size/position
- `getWindowPosition()` / `setWindowPosition(position)` — Window position only
- `getEdgeState()` / `toggleEdgeCollapse()` — Edge auto-hide control
- `getSyncConfig()` / `setSyncConfig(config)` / `getSyncStatus()` / `syncNow()` — Remote sync
- `setAutoLaunch(enabled)` — System startup setting

**Event listeners** (push from main process, return unsubscribe function):
- `onPersistError(cb)` / `onEdgeState(cb)` / `onBeforeCloseFlush(cb)` / `onSyncStatus(cb)` / `onStateRefreshed(cb)`

### Data Persistence

- **Dev**: `.runtime/electron/` for userData, `data/` for state files
- **Production**: `userData/data/` for state files
- **Sync Server**: `server-data/` (or `TODO_SYNC_DATA_DIR`)
- **Files**: `state.snapshot.json`, `events.YYYY-MM-DD.jsonl`, `task-assets/<taskId>/`

### Vite Build

Two entry points configured in `vite.config.ts`:
- `index.html` → desktop Electron renderer
- `mobile.html` → mobile web client (served by sync server)

### Key Business Logic (`src/lib/`)

- `time.ts` — Time tracking segment arithmetic
- `math.ts` — Detect math/markdown tokens for rich preview toggle
- `taskArchive.ts` / `taskVisibility.ts` — Archive and visibility filtering
- `taskDurationLayout.ts` — Stacked vs inline duration display modes
- `contextMenuLabels.ts` / `contextMenuOrder.ts` — Customizable context menu with drag-and-drop reordering
- `taskMeta.ts` — Task metadata normalization
- `taskCardLayout.ts` — Card display mode logic
- `sync.ts` — Sync utility functions
- `contentPersistScheduler.ts` — Debounced persistence for content edits

### Key Features

**Time Tracking**: Tasks have segments (start/pause timestamps). Active segments are closed when pausing/finishing. Duration = sum of closed segments + elapsed time of open segment.

**Task Colors**: Three modes — auto (content hash), preset (predefined gradients), custom (user-defined).

**Markdown**: react-markdown with remark-math + rehype-katex. Local images use `![](task-image://ID)` syntax.

**Context Menu**: Labels and order are customizable; order persists in settings as `contextMenuOrder`.

## Types

- `src/types/domain.ts` — Core domain types (Task, Settings, etc.)
- `src/types/electron.d.ts` — Type declarations for `window.todoAPI`
- `src/types/sync.ts` — Sync-related types

## Testing

Tests use **Node.js native test runner** (`node:test` + `node:assert/strict`). Two categories:
- **Renderer-side tests** in `tests/` — Import from `src/lib/` and `src/store/` directly via `.ts` extension
- **Electron-side tests** in `electron/` — CommonJS (`.test.cjs`), test modules like `runtimePaths`, `syncRuntime`, `edgeDockRecovery`, `edgeVisibilityGuards`, `taskAssetCleanup`

## Build Configuration

- `electron-builder` config in `package.json` under `build` key
- NSIS installer for Windows with icons in `build/icons/`
- Output directory: `release/`
- ESLint uses flat config (`eslint.config.js`)
