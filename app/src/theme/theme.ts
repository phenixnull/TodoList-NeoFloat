import { useColorScheme } from 'react-native';
import { useMemo } from 'react';
import { HabitSettings } from '../domain/types';

export type ThemeMode = NonNullable<HabitSettings['appearance']>;

export type ThemePalette = {
  isLight: boolean;
  background: [string, string, string];
  surface: string;
  surfaceBorder: string;
  inputBackground: string;
  inputBorder: string;
  text: string;
  mutedText: string;
  subtleText: string;
  accentText: string;
  accent: string;
  accentBackground: string;
  accentBorder: string;
  onAccent: string;
};

const palettes: Record<Exclude<ThemeMode, 'system'>, ThemePalette> = {
  dark: {
    isLight: false,
    background: ['#05060f', '#0b1025', '#110c25'],
    surface: 'rgba(255,255,255,0.06)',
    surfaceBorder: 'rgba(255,255,255,0.10)',
    inputBackground: 'rgba(2,6,23,0.35)',
    inputBorder: 'rgba(255,255,255,0.12)',
    text: '#f8fafc',
    mutedText: '#cbd5e1',
    subtleText: 'rgba(148,163,184,0.78)',
    accentText: '#67e8f9',
    accent: '#22d3ee',
    accentBackground: 'rgba(34,211,238,0.10)',
    accentBorder: 'rgba(103,232,249,0.20)',
    onAccent: '#020617',
  },
  light: {
    isLight: true,
    background: ['#f8fbff', '#eef4ff', '#f7f2fb'],
    surface: 'rgba(255,255,255,0.82)',
    surfaceBorder: 'rgba(15,23,42,0.08)',
    inputBackground: 'rgba(241,245,249,0.86)',
    inputBorder: 'rgba(15,23,42,0.10)',
    text: '#0f172a',
    mutedText: '#334155',
    subtleText: 'rgba(71,85,105,0.78)',
    accentText: '#0369a1',
    accent: '#0284c7',
    accentBackground: 'rgba(14,165,233,0.10)',
    accentBorder: 'rgba(14,165,233,0.20)',
    onAccent: '#ffffff',
  },
};

export function resolveTheme(mode: ThemeMode | undefined, systemColorScheme: string | null | undefined): ThemePalette {
  if (mode === 'light' || mode === 'dark') {
    return palettes[mode];
  }

  return palettes[systemColorScheme === 'light' ? 'light' : 'dark'];
}

export function useTheme(mode: ThemeMode | undefined): ThemePalette {
  const systemColorScheme = useColorScheme();

  return useMemo(
    () => resolveTheme(mode, systemColorScheme),
    [mode, systemColorScheme],
  );
}
