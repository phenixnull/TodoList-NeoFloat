import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { getTodayKey } from '../domain/streak';

export function useTodayKey() {
  const [today, setToday] = useState(() => getTodayKey());

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const scheduleNextRollover = () => {
      const now = new Date();
      const nextMidnight = new Date(now);
      nextMidnight.setDate(nextMidnight.getDate() + 1);
      nextMidnight.setHours(0, 0, 0, 0);

      timeout = setTimeout(() => {
        setToday(getTodayKey());
        scheduleNextRollover();
      }, Math.max(1000, nextMidnight.getTime() - now.getTime()));
    };

    const refreshIfActive = (state: string) => {
      if (state === 'active') {
        setToday(getTodayKey());
      }
    };

    scheduleNextRollover();
    const subscription = AppState.addEventListener('change', refreshIfActive);

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
      subscription.remove();
    };
  }, []);

  return today;
}
