import { act, renderHook } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import React from 'react';
import { HabitStoreProvider, useHabitStore } from '../useHabitStore';
import { getTodayKey } from '../../domain/streak';

jest.mock('@react-native-async-storage/async-storage', () => {
  const store: Record<string, string> = {};
  return {
    __esModule: true,
    default: {
      getItem: async (key: string) => store[key] ?? null,
      setItem: async (key: string, value: string) => {
        store[key] = value;
      },
    },
  };
});

jest.mock('expo-file-system/legacy', () => ({ __esModule: true }));
jest.mock('expo-image-manipulator', () => ({ __esModule: true }));

type CheckInRow = { id: string; taskId: string; date: string; createdAt: string };

const flush = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function createDeferred() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('HabitPulse store sync race', () => {
  it('keeps a check-in committed while an older sync is in flight (no card bounce-back)', async () => {
    const today = getTodayKey();
    const task = {
      id: 't1',
      name: 'Read',
      icon: 'book',
      iconImage: null,
      color: '#ffffff',
      description: '',
      sortOrder: 0,
      timerSegments: [],
      manualDurationMs: 0,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
      deletedAt: null,
    };

    const remote: { tasks: typeof task[]; checkIns: CheckInRow[]; dayRecords: unknown[] } = {
      tasks: [task],
      checkIns: [],
      dayRecords: [],
    };
    let checkinsGate = createDeferred();
    let gateArmed = false;

    const jsonResponse = (body: unknown) => ({
      ok: true,
      status: 200,
      json: async () => body,
    });

    // @ts-expect-error controlled mock for the test
    global.fetch = jest.fn(async (url: string, init?: { method?: string; body?: string }) => {
      const method = init?.method ?? 'GET';
      const urlString = String(url);

      if (urlString.endsWith('/api/tasks') && method === 'GET') {
        return jsonResponse(remote.tasks);
      }
      if (urlString.endsWith('/api/checkins') && method === 'GET') {
        if (gateArmed) {
          await checkinsGate.promise;
        }
        return jsonResponse(remote.checkIns);
      }
      if (urlString.endsWith('/api/day-records') && method === 'GET') {
        return jsonResponse(remote.dayRecords);
      }
      if (urlString.endsWith('/api/checkins') && method === 'POST') {
        const body = JSON.parse(init?.body ?? '{}') as CheckInRow;
        if (!remote.checkIns.some((row) => row.taskId === body.taskId && row.date === body.date)) {
          remote.checkIns.push(body);
        }
        return jsonResponse(body);
      }
      if (urlString.endsWith('/api/checkins/toggle') && method === 'POST') {
        const body = JSON.parse(init?.body ?? '{}') as { taskId: string; date: string };
        let row = remote.checkIns.find((r) => r.taskId === body.taskId && r.date === body.date);
        if (!row) {
          row = { id: `c${remote.checkIns.length + 1}`, taskId: body.taskId, date: body.date, createdAt: new Date().toISOString() };
          remote.checkIns.push(row);
        }
        return jsonResponse({ checkedIn: true, checkIn: row });
      }
      if (urlString.includes('/api/checkins/') && method === 'DELETE') {
        const parts = urlString.split('/api/checkins/')[1].split('/');
        const taskId = decodeURIComponent(parts[0]);
        const date = parts[1];
        remote.checkIns = remote.checkIns.filter((r) => !(r.taskId === taskId && r.date === date));
        return jsonResponse({ ok: true });
      }
      return jsonResponse({});
    });

    const wrapper = ({ children }: { children?: React.ReactNode }) => (
      <HabitStoreProvider>{children}</HabitStoreProvider>
    );

    const { result } = await renderHook(() => useHabitStore(), { wrapper });

    // Let the launch sync complete against the un-gated remote.
    await act(async () => {
      await flush(20);
    });
    expect(result.current.loading).toBe(false);
    expect(result.current.activeTasks).toHaveLength(1);
    expect(result.current.syncState.status).toBe('ok');

    // Arm the gate, then sync A starts from the current snapshot and blocks on
    // the checkins GET.
    gateArmed = true;
    await act(async () => {
      result.current.syncNow();
      await flush(5);
    });

    // While A is blocked, the user checks in: local state updates and sync B
    // is enqueued behind A.
    await act(async () => {
      result.current.toggleCheckIn('t1');
    });
    expect(result.current.checkIns).toHaveLength(1);

    // Release A, then let A finish (reconciled) and B run (pushes the checkin).
    await act(async () => {
      checkinsGate.release();
      gateArmed = false;
      await flush(30);
    });

    expect(result.current.syncState.status).toBe('ok');
    expect(
      result.current.checkIns.filter((row) => row.taskId === 't1' && row.date === today),
    ).toHaveLength(1);
    expect(
      remote.checkIns.some((row) => row.taskId === 't1' && row.date === today),
    ).toBe(true);

    // Re-arm sanity: the gate must not be referenced again after teardown.
    checkinsGate = createDeferred();
  });
});
