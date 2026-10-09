import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, ViewStyle } from 'react-native';
import { NestableScrollContainer } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ReactNode } from 'react';
import { useTheme } from '../theme/theme';
import { useHabitStore } from '../store/useHabitStore';

type Props = {
  children: ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  forceLight?: boolean;
};

export default function ScreenShell({ children, scroll = true, style, forceLight = false }: Props) {
  const insets = useSafeAreaInsets();
  const { settings } = useHabitStore();
  const theme = useTheme(forceLight ? 'light' : settings.appearance);

  return (
    <LinearGradient
      colors={theme.background}
      style={[styles.gradient, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 24 }]}
    >
      {scroll ? (
        <NestableScrollContainer
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content, style]}
          style={styles.fill}
        >
          {children}
        </NestableScrollContainer>
      ) : (
        <>{children}</>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  fill: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    gap: 18,
  },
});
