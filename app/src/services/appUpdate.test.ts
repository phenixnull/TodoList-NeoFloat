import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bytesToBase64 } from './appUpdate';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: vi.fn(async () => null),
    setItem: vi.fn(async () => {}),
    removeItem: vi.fn(async () => {}),
  },
}));

vi.mock('expo-constants', () => ({
  expoConfig: {
    version: '1.7.19',
    android: { versionCode: 54 },
  },
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///documents/',
  getInfoAsync: vi.fn(),
  deleteAsync: vi.fn(),
  writeAsStringAsync: vi.fn(),
  readDirectoryAsync: vi.fn(async () => []),
  getContentUriAsync: vi.fn(),
}));

vi.mock('expo-intent-launcher', () => ({
  startActivityAsync: vi.fn(),
}));

describe('app update downloads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('encodes downloaded byte chunks for positioned file writes', () => {
    const encoder = new TextEncoder();

    expect(bytesToBase64(new Uint8Array(0))).toBe('');
    expect(bytesToBase64(encoder.encode('abcde'))).toBe('YWJjZGU=');
    expect(bytesToBase64(encoder.encode('foobar'))).toBe('Zm9vYmFy');
    expect(bytesToBase64(new Uint8Array([0, 255, 16, 128]))).toBe('AP8QgA==');
  });
});
