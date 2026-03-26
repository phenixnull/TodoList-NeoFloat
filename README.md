# Neo Float Todo (Windows Floating Window)

A translucent always-on-top desktop todo window built with Electron + React.

## Features

- Frameless transparent floating window (default top-left, always-on-top)
- Per-task colorful neon bars
- Multi-line task input with live markdown + math preview (`$...$`, `$$...$$`)
- Start/Pause single toggle button with animated state icon
- Multi-segment local time tracking (start/pause timeline per task)
- Hover card tooltip shows all recorded time segments (or `空`)
- Finished tasks become gray and strikethrough
- Drag-and-drop reorder with automatic index update
- Task-level custom font family and font size
- Real-time persistence (every mutation writes immediately)
- Data storage as snapshot + daily event logs (`YYYY-MM-DD`) for behavior analysis
- Toggle always-on-top, opacity, and Windows auto-launch in settings

## Run

```bash
npm install
npm run dev
```

## Runtime Data

Stored in `./data`:

- `state.snapshot.json`: latest full state
- `events.YYYY-MM-DD.jsonl`: append-only event log by day

## Notes

- Auto-launch uses Windows current-user login item settings.
- In development mode, auto-launch path may depend on local Electron runtime.
