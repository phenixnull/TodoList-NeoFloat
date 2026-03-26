const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('todoAPI', {
  getState: () => ipcRenderer.invoke('todo:get-state'),
  getEventDateRange: () => ipcRenderer.invoke('todo:get-event-date-range'),
  persistState: (payload) => ipcRenderer.invoke('todo:persist-state', payload),
  saveTaskImage: (payload) => ipcRenderer.invoke('todo:save-task-image', payload),
  readTaskImageDataUrl: (storagePath) => ipcRenderer.invoke('todo:read-task-image-data-url', storagePath),
  openTaskImage: (storagePath) => ipcRenderer.invoke('todo:open-task-image', storagePath),
  setWindowOptions: (options) => ipcRenderer.invoke('todo:set-window-options', options),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('todo:set-auto-launch', enabled),
  windowControl: (action) => ipcRenderer.invoke('todo:window-control', action),
  getEdgeState: () => ipcRenderer.invoke('todo:get-edge-state'),
  toggleEdgeCollapse: () => ipcRenderer.invoke('todo:toggle-edge-collapse'),
  getWindowPosition: () => ipcRenderer.invoke('todo:get-window-position'),
  setWindowPosition: (position) => ipcRenderer.invoke('todo:set-window-position', position),
  getWindowBounds: () => ipcRenderer.invoke('todo:get-window-bounds'),
  setWindowBounds: (bounds) => ipcRenderer.invoke('todo:set-window-bounds', bounds),
  getSyncConfig: () => ipcRenderer.invoke('todo:get-sync-config'),
  setSyncConfig: (config) => ipcRenderer.invoke('todo:set-sync-config', config),
  getSyncStatus: () => ipcRenderer.invoke('todo:get-sync-status'),
  syncNow: () => ipcRenderer.invoke('todo:sync-now'),
  onPersistError: (callback) => {
    const listener = (_event, message) => callback(message)
    ipcRenderer.on('todo:persist-error', listener)
    return () => ipcRenderer.removeListener('todo:persist-error', listener)
  },
  onEdgeState: (callback) => {
    const listener = (_event, state) => callback(state)
    ipcRenderer.on('todo:edge-state', listener)
    return () => ipcRenderer.removeListener('todo:edge-state', listener)
  },
  onBeforeCloseFlush: (callback) => {
    const listener = async (_event, requestId) => {
      try {
        await callback()
        ipcRenderer.send('todo:before-close-flush-result', { requestId, ok: true })
      } catch (error) {
        ipcRenderer.send('todo:before-close-flush-result', {
          requestId,
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    ipcRenderer.on('todo:before-close-flush', listener)
    return () => ipcRenderer.removeListener('todo:before-close-flush', listener)
  },
  onSyncStatus: (callback) => {
    const listener = (_event, status) => callback(status)
    ipcRenderer.on('todo:sync-status', listener)
    return () => ipcRenderer.removeListener('todo:sync-status', listener)
  },
  onStateRefreshed: (callback) => {
    const listener = () => callback()
    ipcRenderer.on('todo:state-refreshed', listener)
    return () => ipcRenderer.removeListener('todo:state-refreshed', listener)
  },
})
