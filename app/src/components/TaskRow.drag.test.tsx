import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import TaskRow from './TaskRow';
import { Task } from '../domain/types';

jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: () => null,
}));

jest.mock('expo-haptics', () => ({
  default: {
    notificationAsync: jest.fn(),
    impactAsync: jest.fn(),
    NotificationFeedbackType: { Success: 'success' },
    ImpactFeedbackType: { Light: 'light' },
  },
}));

jest.mock('expo-linear-gradient', () => {
  const LinearGradient = ({ children }: { children?: React.ReactNode }) => <>{children}</>;
  return { LinearGradient };
});

jest.mock('expo-router', () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('react-native-gesture-handler', () => ({
  __esModule: true,
  Gesture: {
    Native: () => ({
      onTouchesDown: () => ({ onTouchesUp: () => ({}) }),
    }),
    Tap: () => ({
      onTouchesDown: (callback: unknown) => ({ callback, onTouchesUp: jest.fn() }),
    }),
    Simultaneous: (...gestures: unknown[]) => gestures,
  },
  GestureDetector: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
}));

jest.mock('./PressableScale', () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable } = require('react-native');
    return <Pressable {...props}>{children}</Pressable>;
  },
}));

jest.mock('./TaskIcon', () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock('react-native-reanimated', () => ({
  __esModule: true,
  View: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
  default: {
    View: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    createAnimatedComponent: (component: unknown) => component,
  },
  interpolateColor: () => 'rgba(34,211,238,0.5)',
  useAnimatedStyle: (callback: () => object) => callback(),
  useEvent: (callback: unknown) => callback,
  useFrameCallback: (callback: (frame: any) => void, active = true) => {
    if (active) {
      callback({ timestamp: 0, timeSinceFirstFrame: 0, timeSincePreviousFrame: null });
    }
  },
  useSharedValue: (initial: unknown) => ({ value: initial }),
  withRepeat: (value: unknown) => value,
  withTiming: (value: unknown) => value,
}));

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-c',
    name: 'C',
    icon: 'run',
    iconImage: null,
    color: '#22d3ee',
    description: '',
    sortOrder: 0,
    timerSegments: [],
    manualDurationMs: 0,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('TaskRow drag handle', () => {
  it('starts dragging immediately when the icon is touched', async () => {
    const drag = jest.fn();
    const onToggle = jest.fn(() => false);

    const { getByLabelText } = await render(
      <TaskRow
        task={createTask()}
        today="2026-10-02"
        checkedInToday={false}
        drag={drag}
        dragGesture={{ id: 'test-pan-gesture' } as any}
        onToggle={onToggle}
        onToggleTimer={jest.fn()}
        onDelete={jest.fn()}
      />,
    );

    await act(async () => {
      await fireEvent(getByLabelText('拖动 C'), 'startShouldSetResponder');
    });

    expect(drag).toHaveBeenCalledTimes(1);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('shows one adaptive timer action plus stats and delete only', async () => {
    const onToggleTimer = jest.fn();
    const { getByLabelText, queryByLabelText } = await render(
      <TaskRow
        task={createTask()}
        today="2026-10-02"
        checkedInToday={false}
        drag={jest.fn()}
        onToggle={jest.fn(() => false)}
        onToggleTimer={onToggleTimer}
        onDelete={jest.fn()}
      />,
    );

    await fireEvent.press(getByLabelText('开始C耗时'));

    expect(onToggleTimer).toHaveBeenCalledTimes(1);
    expect(getByLabelText('C统计')).toBeTruthy();
    expect(getByLabelText('删除C')).toBeTruthy();
    expect(queryByLabelText('编辑C')).toBeNull();
    expect(queryByLabelText('停止C耗时')).toBeNull();
  });
});
