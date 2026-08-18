const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isPinned = true;
let currentMode = 'bar'; // 'expanded' | 'bar' | 'tray'
let isQuitting = false;
let isPeakNow = false;

const SIZES = {
  expanded: { width: 360, height: 590, minWidth: 320, minHeight: 480 },
  bar: { width: 230, height: 60, minWidth: 200, minHeight: 60 }
};

const configPath = path.join(app.getPath('userData'), 'widget-config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const saved = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      if (saved.mode === 'dot') saved.mode = 'bar';
      return saved;
    }
  } catch (e) {}
  return {
    mode: 'bar',
    pinned: true,
    zone: 'local',
    lastBounds: null
  };
}

function saveConfig(updates) {
  try {
    const current = loadConfig();
    const merged = Object.assign({}, current, updates);
    fs.writeFileSync(configPath, JSON.stringify(merged, null, 2), 'utf8');
  } catch (e) {}
}

function getTrayIcon(isPeak) {
  const icoName = isPeak ? 'tray-red.ico' : 'tray-green.ico';
  const pngName = isPeak ? 'tray-red.png' : 'tray-green.png';
  const icoPath = path.join(__dirname, 'src', 'assets', 'icons', icoName);
  const pngPath = path.join(__dirname, 'src', 'assets', 'icons', pngName);
  
  if (fs.existsSync(icoPath)) {
    return nativeImage.createFromPath(icoPath);
  }
  if (fs.existsSync(pngPath)) {
    return nativeImage.createFromPath(pngPath);
  }
  return nativeImage.createEmpty();
}

function createWindow() {
  const config = loadConfig();
  isPinned = config.pinned !== undefined ? config.pinned : true;
  currentMode = config.mode || 'bar';
  if (currentMode === 'tray' || currentMode === 'dot') currentMode = 'bar';

  const size = SIZES[currentMode] || SIZES.bar;
  const primaryDisplay = screen.getPrimaryDisplay();
  const { workArea } = primaryDisplay;

  let x = workArea.x + workArea.width - size.width - 24;
  let y = workArea.y + workArea.height - size.height - 24;

  if (config.lastBounds) {
    x = Math.max(workArea.x, Math.min(config.lastBounds.x, workArea.x + workArea.width - size.width));
    y = Math.max(workArea.y, Math.min(config.lastBounds.y, workArea.y + workArea.height - size.height));
  }

  mainWindow = new BrowserWindow({
    width: size.width,
    height: size.height,
    x: x,
    y: y,
    frame: false,
    transparent: true,
    alwaysOnTop: isPinned,
    skipTaskbar: false,
    resizable: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (isPinned) {
    mainWindow.setAlwaysOnTop(true, 'screen-saver');
  }

  mainWindow.on('moved', () => {
    if (mainWindow && mainWindow.isVisible() && currentMode === 'expanded') {
      const bounds = mainWindow.getBounds();
      saveConfig({ lastBounds: { x: bounds.x, y: bounds.y } });
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  createTray();
}

function updateTrayMenu() {
  if (!tray) return;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'DeepSeek Price Clock (' + (isPeakNow ? 'Peak 🔴' : 'Off-Peak 🟢') + ')',
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Floating Mini Bar',
      type: 'radio',
      checked: currentMode === 'bar' && mainWindow && mainWindow.isVisible(),
      click: () => setWindowMode('bar')
    },
    {
      label: 'Expanded Dashboard',
      type: 'radio',
      checked: currentMode === 'expanded' && mainWindow && mainWindow.isVisible(),
      click: () => setWindowMode('expanded')
    },
    {
      label: 'Hide to System Tray',
      type: 'radio',
      checked: currentMode === 'tray' || (mainWindow && !mainWindow.isVisible()),
      click: () => setWindowMode('tray')
    },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: isPinned,
      click: (item) => {
        isPinned = item.checked;
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(isPinned, 'screen-saver');
          mainWindow.webContents.send('state-changed', { pinned: isPinned });
        }
        saveConfig({ pinned: isPinned });
      }
    },
    { type: 'separator' },
    {
      label: 'Exit (Close Completely)',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(contextMenu);
}

function createTray() {
  const defaultIcon = getTrayIcon(false);
  tray = new Tray(defaultIcon);
  tray.setToolTip('DeepSeek Price Clock: Off-Peak (50% OFF)');

  updateTrayMenu();

  tray.on('click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      if (currentMode === 'bar') {
        setWindowMode('expanded');
      } else {
        mainWindow.focus();
      }
    } else {
      setWindowMode('bar');
    }
  });

  tray.on('double-click', () => {
    if (!mainWindow) return;
    if (mainWindow.isVisible()) {
      setWindowMode('tray');
    } else {
      setWindowMode('bar');
    }
  });
}

function setWindowMode(mode) {
  if (!mainWindow) return;

  if (mode === 'tray') {
    currentMode = 'tray';
    mainWindow.hide();
    updateTrayMenu();
    return;
  }

  currentMode = mode;
  const targetSize = SIZES[mode] || SIZES.bar;
  const currentBounds = mainWindow.getBounds();
  const primaryDisplay = screen.getDisplayMatching(currentBounds);
  const { workArea } = primaryDisplay;

  let newX = currentBounds.x;
  let newY = currentBounds.y;

  if (mode === 'bar') {
    newX = Math.min(newX, workArea.x + workArea.width - targetSize.width - 10);
    newY = Math.min(newY, workArea.y + workArea.height - targetSize.height - 10);
  }

  mainWindow.setMinimumSize(targetSize.minWidth, targetSize.minHeight);
  mainWindow.setSize(targetSize.width, targetSize.height, true);
  mainWindow.setPosition(newX, newY, true);

  if (!mainWindow.isVisible()) {
    mainWindow.show();
  }
  mainWindow.focus();

  mainWindow.webContents.send('mode-changed', { mode: currentMode });
  saveConfig({ mode: currentMode });
  updateTrayMenu();
}

ipcMain.on('show-context-menu', () => {
  const menu = Menu.buildFromTemplate([
    {
      label: 'Floating Mini Bar (with Timer)',
      type: 'radio',
      checked: currentMode === 'bar',
      click: () => setWindowMode('bar')
    },
    {
      label: 'Expanded Dashboard',
      type: 'radio',
      checked: currentMode === 'expanded',
      click: () => setWindowMode('expanded')
    },
    {
      label: 'Hide to System Tray',
      click: () => setWindowMode('tray')
    },
    { type: 'separator' },
    {
      label: 'Always on Top',
      type: 'checkbox',
      checked: isPinned,
      click: (item) => {
        isPinned = item.checked;
        if (mainWindow) {
          mainWindow.setAlwaysOnTop(isPinned, 'screen-saver');
          mainWindow.webContents.send('state-changed', { pinned: isPinned });
        }
        saveConfig({ pinned: isPinned });
      }
    },
    { type: 'separator' },
    {
      label: 'Exit DeepSeek Clock',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);
  menu.popup({ window: mainWindow });
});

ipcMain.handle('get-config', () => {
  return loadConfig();
});

ipcMain.on('save-config', (event, updates) => {
  saveConfig(updates);
});

ipcMain.on('set-mode', (event, mode) => {
  setWindowMode(mode);
});

ipcMain.on('toggle-pin', (event) => {
  isPinned = !isPinned;
  if (mainWindow) {
    mainWindow.setAlwaysOnTop(isPinned, 'screen-saver');
  }
  saveConfig({ pinned: isPinned });
  event.reply('state-changed', { pinned: isPinned });
  updateTrayMenu();
});

ipcMain.on('minimize-app', () => {
  setWindowMode('bar');
});

ipcMain.on('close-app', () => {
  isQuitting = true;
  app.quit();
});

ipcMain.on('update-tray-status', (event, { isPeak, tooltip }) => {
  isPeakNow = isPeak;
  if (!tray) return;
  const icon = getTrayIcon(isPeak);
  tray.setImage(icon);
  tray.setToolTip(tooltip || (isPeak ? 'DeepSeek: Peak Pricing 🔴' : 'DeepSeek: Off-Peak (50% OFF) 🟢'));
  updateTrayMenu();
});

ipcMain.on('send-notification', (event, { title, body }) => {
  if (Notification.isSupported()) {
    new Notification({
      title: title || 'DeepSeek Price Clock',
      body: body,
      icon: getTrayIcon(isPeakNow)
    }).show();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
