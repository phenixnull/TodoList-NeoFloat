import { StyleSheet, View, ViewStyle } from 'react-native';
import { ReactNode } from 'react';
import { useHabitStore } from '../store/useHabitStore';
import { useTheme } from '../theme/theme';

type Props = {
  children: ReactNode;
  style?: ViewStyle;
};

export default function GlassCard({ children, style }: Props) {
  const { settings } = useHabitStore();
  const theme = useTheme(settings.appearance);

  return (
    <View
      style={[styles.card, {
        backgroundColor: theme.surface,
        borderColor: theme.surfaceBorder,
        shadowOpacity: theme.isLight ? 0.08 : 0.35,
        elevation: theme.isLight ? 5 : 12,
      }, style]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    shadowColor: '#000',
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
});
