# HabitPulse

A local-first habit tracker for Android, iOS, and web. Android is the primary development target.

## Features

- Multiple custom tasks with name, description, icon, and color
- Random icon/color suggestions that avoid the six most recently created task cards
- Upload a custom image icon and crop it to 1:1
- Daily note and image records for each task
- Interactive heat-map date browsing
- One-tap daily check-in
- GitHub-style 15-week heatmap
- Current streak, longest streak, and lifetime count
- Segment-based task timers and manual duration input
- Grouped task ordering with long-press drag-and-drop
- Dark glassmorphism UI with progress ring, spring animations, and task-colored pulsing gradients
- Offline-first AsyncStorage persistence
- Optional independent Fastify + SQLite server synchronization

## Structure

```text
HabitPulse/
  app/     Expo React Native client
  server/  Fastify + SQLite API
```

## Run the server

```bash
cd server
npm install
npm run dev
```

The API listens on `http://0.0.0.0:8787`.

## Run the Android client

```bash
cd app
npm install
npm run android
```

Use Expo Go or an installed Android developer build. The app is also buildable with `npm run ios` and `npm run web`.

## Server address

- Android emulator: `http://10.0.2.2:8787`
- Android phone: use your computer's LAN IP, for example `http://192.168.1.10:8787`

Open **Settings** in the app, enable **服务端同步**, enter the address, then tap **立即同步**.

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Health check |
| GET | `/api/tasks` | List active tasks |
| POST | `/api/tasks` | Create/upsert a task |
| PATCH | `/api/tasks/:id` | Update a task |
| DELETE | `/api/tasks/:id` | Soft-delete a task |
| GET | `/api/checkins` | List check-ins |
| POST | `/api/checkins` | Upsert a check-in for synchronization |
| POST | `/api/checkins/toggle` | Create today's check-in |
| DELETE | `/api/checkins/:taskId/:date` | Remove a check-in |

## Verification

```bash
cd app
npm run typecheck
npm test
npm run lint
npx expo export --platform web

cd ../server
npm run typecheck
npm test
```
