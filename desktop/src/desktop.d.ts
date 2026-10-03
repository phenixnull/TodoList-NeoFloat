export type DesktopMode = 'full' | 'compact';

type HpDesktopApi = {
  platform: string;
  getMode: () => Promise<DesktopMode>;
  setMode: (mode: DesktopMode) => void;
  onModeChange: (callback: (mode: DesktopMode) => void) => () => void;
  minimize: () => void;
  toggleMaximize: () => void;
  isMaximized: () => Promise<boolean>;
  close: () => void;
  testCapture: () => Promise<boolean>;
};

declare global {
  interface Window {
    hpDesktop?: HpDesktopApi;
  }
}

export {};
