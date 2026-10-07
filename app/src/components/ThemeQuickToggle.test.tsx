import { act, fireEvent, render } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';
import ThemeQuickToggle from './ThemeQuickToggle';

jest.mock('@expo/vector-icons', () => ({
  MaterialCommunityIcons: () => null,
}));

jest.mock('./PressableScale', () => ({
  __esModule: true,
  default: ({ children, ...props }: any) => {
    // Jest mock factories may import their mocked platform lazily.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable } = require('react-native');

    return <Pressable {...props}>{children}</Pressable>;
  },
}));

describe('ThemeQuickToggle', () => {
  it('exposes visible light and dark controls on the main screen', async () => {
    const onChange = jest.fn();
    const { getByLabelText } = await render(
      <ThemeQuickToggle value="dark" onChange={onChange} />,
    );

    await act(async () => {
      fireEvent.press(getByLabelText('切换到浅色主题'));
    });
    await act(async () => {
      fireEvent.press(getByLabelText('切换到深色主题'));
    });

    expect(onChange).toHaveBeenNthCalledWith(1, 'light');
    expect(onChange).toHaveBeenNthCalledWith(2, 'dark');
  });
});
