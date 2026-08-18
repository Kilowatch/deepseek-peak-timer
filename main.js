const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let tray = null;
let isPinned = true;
let currentMode = 'bar'; // 'expanded' | 'bar' | 'tray'
let isQuitting = false;
let isPeakNow = false;

const isLinux = process.platform === 'linux';
const isWayland = isLinux && process.env.XDG_SESSION_TYPE === 'wayland';
const appIconPath = path.join(__dirname, 'src', 'assets', 'icons', 'icon.png');

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
    lastBounds: null,
    autostart: false
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
  
  // KDE and other Linux desktops handle PNG tray images more consistently than
  // Windows ICO files, especially on high-DPI panels.
  if (isLinux && fs.existsSync(pngPath)) {
    return nativeImage.createFromPath(pngPath);
  }
  if (fs.existsSync(icoPath)) return nativeImage.createFromPath(icoPath);
  if (fs.existsSync(pngPath)) return nativeImage.createFromPath(pngPath);
  return nativeImage.createEmpty();
}

function applyAlwaysOnTop(window, enabled) {
  if (!window) return;
  if (isLinux) {
    window.setAlwaysOnTop(enabled);
  } else {
    window.setAlwaysOnTop(enabled, 'screen-saver');
  }
}

function getAutostartPath() {
  const configHome = process.env.XDG_CONFIG_HOME || path.join(app.getPath('home'), '.config');
  return path.join(configHome, 'autostart', 'za.kilowatch.deepseekpriceclock.desktop');
}

function quoteDesktopArgument(value) {
  return `"${String(value).replace(/([\\"`$])/g, '\\$1')}"`;
}

function setLinuxAutostart(enabled) {
  if (!isLinux) return;

  const autostartPath = getAutostartPath();
  try {
    if (!enabled) {
      if (fs.existsSync(autostartPath)) fs.unlinkSync(autostartPath);
      return;
    }

    fs.mkdirSync(path.dirname(autostartPath), { recursive: true });
    // APPIMAGE is the stable path to a portable AppImage. process.execPath
    // points into its temporary mount, which disappears after the app exits.
    const executable = process.env.APPIMAGE || process.execPath;
    const command = [quoteDesktopArgument(executable)];
    if (!app.isPackaged) command.push(quoteDesktopArgument(app.getAppPath()));
    const desktopEntry = [
      '[Desktop Entry]',
      'Type=Application',
      'Version=1.0',
      'Name=DeepSeek Price Clock',
      'Comment=DeepSeek API peak/off-peak price timer',
      `Exec=${command.join(' ')}`,
      `Icon=${appIconPath}`,
      'Terminal=false',
      'X-GNOME-Autostart-enabled=true',
      'X-KDE-autostart-after=panel',
      ''
    ].join('\n');
    fs.writeFileSync(autostartPath, desktopEntry, 'utf8');
  } catch (error) {
    console.error('Could not update Linux autostart entry:', error);
  }
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

  const windowOptions = {
    width: size.width,
    height: size.height,
    frame: false,
    transparent: true,
    alwaysOnTop: isPinned,
    skipTaskbar: false,
    resizable: true,
    hasShadow: true,
    icon: appIconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      backgroundThrottling: false
    }
  };

  // Wayland compositors own global placement. Supplying coordinates or moving
  // the window later is unsupported, so let KDE choose its initial position.
  if (!isWayland) {
    windowOptions.x = x;
    windowOptions.y = y;
  }

  mainWindow = new BrowserWindow(windowOptions);

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  if (isPinned) {
    applyAlwaysOnTop(mainWindow, true);
  }

  mainWindow.on('moved', () => {
    if (!isWayland && mainWindow && mainWindow.isVisible() && currentMode === 'expanded') {
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
          applyAlwaysOnTop(mainWindow, isPinned);
          mainWindow.webContents.send('state-changed', { pinned: isPinned });
        }
        saveConfig({ pinned: isPinned });
      }
    },
    ...(isLinux ? [{
      label: 'Start Automatically on Login',
      type: 'checkbox',
      checked: loadConfig().autostart === true,
      click: (item) => {
        setLinuxAutostart(item.checked);
        saveConfig({ autostart: item.checked });
      }
    }] : []),
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
  mainWindow.setSize(targetSize.width, targetSize.height);
  if (!isWayland) {
    mainWindow.setPosition(newX, newY);
  }

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
          applyAlwaysOnTop(mainWindow, isPinned);
          mainWindow.webContents.send('state-changed', { pinned: isPinned });
        }
        saveConfig({ pinned: isPinned });
      }
    },
    ...(isLinux ? [{
      label: 'Start Automatically on Login',
      type: 'checkbox',
      checked: loadConfig().autostart === true,
      click: (item) => {
        setLinuxAutostart(item.checked);
        saveConfig({ autostart: item.checked });
      }
    }] : []),
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
    applyAlwaysOnTop(mainWindow, isPinned);
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
