const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hpDesktop', {
  platform: process.platform,
  getMode: () => ipcRenderer.invoke('window:get-mode'),
  setMode: (mode) => ipcRenderer.send('window:set-mode', mode),
  onModeChange: (callback) => {
    const listener = (_event, mode) => callback(mode);
    ipcRenderer.on('mode-changed', listener);
    return () => ipcRenderer.removeListener('mode-changed', listener);
  },
  minimize: () => ipcRenderer.send('window:minimize'),
  toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
  isMaximized: () => ipcRenderer.invoke('window:is-maximized'),
  close: () => ipcRenderer.send('window:close'),
  hide: () => ipcRenderer.send('window:hide'),
  testCapture: () => ipcRenderer.invoke('test:capture-save'),
});
