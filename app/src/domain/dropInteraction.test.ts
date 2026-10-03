import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDropFollowUpScheduler,
  cancelTimeout,
  DROP_PERSIST_DELAY_MS,
  DROP_SYNC_DELAY_MS,
} from './dropInteraction';

describe('drop interaction scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the drop frame render-only, then persists and syncs later', () => {
    const persist = vi.fn();
    const sync = vi.fn();
    const scheduler = createDropFollowUpScheduler(
      (callback, delay) => setTimeout(callback, delay),
      cancelTimeout,
    );

    scheduler.schedule(persist, sync);

    expect(persist).not.toHaveBeenCalled();
    expect(sync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DROP_PERSIST_DELAY_MS - 1);
    expect(persist).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(sync).not.toHaveBeenCalled();

    vi.advanceTimersByTime(DROP_SYNC_DELAY_MS - DROP_PERSIST_DELAY_MS);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('collapses rapid consecutive drops into one follow-up', () => {
    const firstPersist = vi.fn();
    const firstSync = vi.fn();
    const secondPersist = vi.fn();
    const secondSync = vi.fn();
    const scheduler = createDropFollowUpScheduler(
      (callback, delay) => setTimeout(callback, delay),
      cancelTimeout,
    );

    scheduler.schedule(firstPersist, firstSync);
    vi.advanceTimersByTime(DROP_PERSIST_DELAY_MS - 1);
    scheduler.schedule(secondPersist, secondSync);
    vi.advanceTimersByTime(DROP_SYNC_DELAY_MS);

    expect(firstPersist).not.toHaveBeenCalled();
    expect(firstSync).not.toHaveBeenCalled();
    expect(secondPersist).toHaveBeenCalledTimes(1);
    expect(secondSync).toHaveBeenCalledTimes(1);
  });
});
