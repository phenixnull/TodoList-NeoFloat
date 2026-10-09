import { MaterialCommunityIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';
import PressableScale from './PressableScale';
import { ThemeMode, useTheme } from '../theme/theme';

type Props = {
  value: ThemeMode | undefined;
  onChange: (value: 'light' | 'dark') => void;
};

export default function ThemeQuickToggle({ value, onChange }: Props) {
  // Home header follows the light diary palette.
  const theme = useTheme('light');
  const isLight = theme.isLight;

  const options = [
    {
      key: 'light' as const,
      label: '切换到浅色主题',
      icon: 'weather-sunny' as const,
    },
    {
      key: 'dark' as const,
      label: '切换到深色主题',
      icon: 'weather-night' as const,
    },
  ];

  return (
    <View
      style={[styles.group, { borderColor: theme.surfaceBorder }]}
      accessibilityRole="radiogroup"
      accessibilityLabel="主题快速切换"
    >
      {options.map((option) => {
        const selected = option.key === 'light' ? isLight : !isLight;

        return (
          <PressableScale
            key={option.key}
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            accessibilityRole="radio"
            onPress={() => onChange(option.key)}
            style={[
              styles.button,
              {
                backgroundColor: selected ? theme.accentBackground : 'transparent',
                borderColor: selected ? theme.accentBorder : theme.surfaceBorder,
              },
            ]}
          >
            <MaterialCommunityIcons
              name={option.icon}
              size={15}
              color={selected ? theme.accentText : theme.subtleText}
            />
          </PressableScale>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderRadius: 15,
    padding: 3,
  },
  button: {
    width: 30,
    height: 29,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
