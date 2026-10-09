import '../global.css';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { HabitStoreProvider, useHabitStore } from '@/store/useHabitStore';
import DialogHost from '@/components/dialog/DialogHost';
import useAppUsageTracker from '@/hooks/useAppUsageTracker';
import AppDrawerHost from '@/components/AppDrawer';

const darkTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: 'transparent',
    card: 'rgba(255,255,255,0.06)',
    primary: '#22d3ee',
  },
};

const lightTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: 'transparent',
    card: 'rgba(255,255,255,0.82)',
    primary: '#0369a1',
  },
};

function AppChrome() {
  const { settings } = useHabitStore();
  useAppUsageTracker();
  const systemColorScheme = useColorScheme();
  const appearance = settings.appearance ?? 'dark';
  const isLight = appearance === 'light'
    || (appearance === 'system' && systemColorScheme === 'light');

  return (
    <>
      <StatusBar style={isLight ? 'dark' : 'light'} />
      <ThemeProvider value={isLight ? lightTheme : darkTheme}>
        <AppDrawerHost>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: 'transparent' },
            }}
          />
        </AppDrawerHost>
        <DialogHost />
      </ThemeProvider>
    </>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <HabitStoreProvider>
        <AppChrome />
      </HabitStoreProvider>
    </GestureHandlerRootView>
  );
}
