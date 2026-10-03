import { WithSpringConfig } from 'react-native-reanimated';

export const DROP_PERSIST_DELAY_MS = 120;
export const DROP_SYNC_DELAY_MS = 600;

export const DRAG_SNAP_SPRING: WithSpringConfig = {
  damping: 30,
  mass: 0.14,
  stiffness: 320,
  overshootClamping: true,
  energyThreshold: 0.001,
};

type Schedule = (callback: () => void, delayMs: number) => unknown;
type Cancel = (handle: unknown) => void;

export function cancelTimeout(handle: unknown) {
  clearTimeout(handle as ReturnType<typeof setTimeout>);
}

export function createDropFollowUpScheduler(schedule: Schedule, cancel: Cancel) {
  let persistHandle: unknown;
  let syncHandle: unknown;

  const clear = () => {
    if (persistHandle !== undefined) {
      cancel(persistHandle);
      persistHandle = undefined;
    }

    if (syncHandle !== undefined) {
      cancel(syncHandle);
      syncHandle = undefined;
    }
  };

  return {
    schedule(onPersist: () => void, onSync?: () => void) {
      clear();
      persistHandle = schedule(onPersist, DROP_PERSIST_DELAY_MS);

      if (onSync) {
        syncHandle = schedule(onSync, DROP_SYNC_DELAY_MS);
      }
    },
    cancel: clear,
  };
}
