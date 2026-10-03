const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const path = require('node:path');

const MODES = {
  full: { width: 1280, height: 820, minWidth: 1080, minHeight: 660, alwaysOnTop: false },
  compact: { width: 720, height: 360, minWidth: 560, minHeight: 300, alwaysOnTop: true },
};

/** @type {BrowserWindow | null} */
let mainWindow = null;
let currentMode = 'full';
let tray = null;

const isDev = !app.isPackaged && process.env.HP_DEV === '1';
const appIconPath = path.join(__dirname, '..', 'build', 'icon-256.png');

function createWindow() {
  if (process.env.HP_TEST_HASH) {
    const testMode = new URLSearchParams(process.env.HP_TEST_HASH).get('mode');
    if (testMode === 'compact' || testMode === 'full') {
      currentMode = testMode;
    }
  }

  const preset = MODES[currentMode];

  mainWindow = new BrowserWindow({
    width: preset.width,
    height: preset.height,
    minWidth: preset.minWidth,
    minHeight: preset.minHeight,
    frame: false,
    show: false,
    backgroundColor: '#05060f',
    alwaysOnTop: preset.alwaysOnTop,
    title: 'HabitPulse Desktop',
    icon: appIconPath,
    ...(process.env.HP_TEST_OFFSCREEN === '1' ? { x: -2400, y: -1600 } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  const testHash = process.env.HP_TEST_HASH;

  if (isDev) {
    mainWindow.loadURL('http://localhost:5217');
  } else if (testHash) {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), {
      hash: testHash,
    });
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Hide to tray instead of quitting when the close button is clicked.
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const icon = nativeImage.createFromPath(iconPath);

  tray = new Tray(icon);
  tray.setToolTip('HabitPulse');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示 HabitPulse',
      click: () => {
        if (!mainWindow) {
          createWindow();
          return;
        }
        mainWindow.show();
        mainWindow.focus();
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('double-click', () => {
    if (!mainWindow) {
      createWindow();
      return;
    }
    mainWindow.show();
    mainWindow.focus();
  });
}

const gotLock =
  process.env.HP_ALLOW_SECOND === '1' ? true : app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    createTray();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    // Keep running in tray; user must explicitly quit from tray menu.
  });
}

ipcMain.handle('window:get-mode', () => currentMode);

ipcMain.on('window:set-mode', (_event, mode) => {
  if (!mainWindow || !MODES[mode] || mode === currentMode) return;

  currentMode = mode;
  const preset = MODES[mode];

  mainWindow.setAlwaysOnTop(preset.alwaysOnTop);
  mainWindow.setMinimumSize(preset.minWidth, preset.minHeight);
  mainWindow.setSize(preset.width, preset.height, true);
  mainWindow.center();
  mainWindow.webContents.send('mode-changed', mode);
});

ipcMain.on('window:minimize', () => {
  mainWindow?.minimize();
});

ipcMain.on('window:toggle-maximize', () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle('window:is-maximized', () => Boolean(mainWindow?.isMaximized()));

ipcMain.on('window:close', () => {
  mainWindow?.close();
});

ipcMain.on('window:hide', () => {
  mainWindow?.hide();
});

ipcMain.handle('test:capture-save', async () => {
  if (!mainWindow) return false;
  const image = await mainWindow.webContents.capturePage();
  const target = process.env.HP_TEST_SHOT;
  if (target) {
    require('node:fs').writeFileSync(target, image.toPNG());
  }
  setTimeout(() => app.quit(), 200);
  return true;
});
