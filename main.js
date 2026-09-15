const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, Notification, screen, safeStorage, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const crypto = require('crypto');
const { PRICING_CATALOGUE, DeepSeekCalculator } = require('./src/js/calculator.js');

let mainWindow = null;
let tray = null;
let isPinned = true;
let currentMode = 'bar'; // 'expanded' | 'bar' | 'tray'
let isQuitting = false;
let isPeakNow = false;
let usageProxy = null;
const usageCalculator = new DeepSeekCalculator();

const isLinux = process.platform === 'linux';
const isWindows = process.platform === 'win32';
const isWayland = isLinux && process.env.XDG_SESSION_TYPE === 'wayland';
const appIconPath = path.join(__dirname, 'src', 'assets', 'icons', 'icon.png');

const SIZES = {
  expanded: { width: 430, height: 680, minWidth: 360, minHeight: 540 },
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

function getSecretPath() {
  return path.join(app.getPath('userData'), 'deepseek-api-key.bin');
}

function saveApiKey(value) {
  try {
    if (!value) return false;
    if (!safeStorage.isEncryptionAvailable()) return false;
    const secret = safeStorage.encryptString(value);
    fs.writeFileSync(getSecretPath(), secret, { mode: 0o600 });
    return true;
  } catch (error) { console.error('Could not store API key:', error); return false; }
}

function readApiKey() {
  try {
    const value = fs.readFileSync(getSecretPath());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(value) : '';
  } catch (_) { return ''; }
}

function clearApiKey() { try { if (fs.existsSync(getSecretPath())) fs.unlinkSync(getSecretPath()); return true; } catch (_) { return false; } }

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try { return await fetch(url, Object.assign({}, options, { signal: controller.signal })); } finally { clearTimeout(timeout); }
}

function classifyUsageTime(timestamp) {
  return usageCalculator.getCurrentUtcWindow(new Date(timestamp)).kind;
}

function costUsage(modelId, usage, kind) {
  const model = PRICING_CATALOGUE.models.find((item) => item.id === modelId) || PRICING_CATALOGUE.models[0];
  return ((usage.cacheHit * model.cacheHit[kind]) + (usage.cacheMiss * model.cacheMiss[kind]) + (usage.output * model.output[kind])) / 1000000;
}

function recordUsage(metadata) {
  const current = loadConfig();
  const at = metadata.at || new Date().toISOString();
  const kind = classifyUsageTime(at);
  const usage = {
    at,
    kind,
    model: metadata.model || 'deepseek-v4-flash',
    cacheHit: Number(metadata.cacheHit || 0),
    cacheMiss: Number(metadata.cacheMiss || 0),
    output: Number(metadata.output || 0)
  };
  usage.cost = costUsage(usage.model, usage, kind);
  const entries = (Array.isArray(current.usage) ? current.usage : []).concat(usage).slice(-5000);
  saveConfig({ usage: entries });
  if (mainWindow) mainWindow.webContents.send('usage-recorded', usage);
}

function startUsageProxy() {
  if (usageProxy) return { ok: true, port: usageProxy.address().port };
  const config = loadConfig();
  const key = readApiKey();
  if (!key) return { ok: false, message: 'Save a DeepSeek API key before enabling the monitor.' };
  const token = config.proxyToken || crypto.randomBytes(24).toString('base64url');
  if (!config.proxyToken) saveConfig({ proxyToken: token });
  usageProxy = http.createServer(async (request, response) => {
    if (request.method !== 'POST' || !['/chat/completions', '/v1/chat/completions'].includes(request.url)) { response.writeHead(404); response.end('DeepSeek monitor endpoint: POST /v1/chat/completions'); return; }
    if (request.headers.authorization !== 'Bearer ' + token) { response.writeHead(401); response.end('Unauthorized monitor token'); return; }
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('error', () => response.destroy());
    request.on('end', async () => {
      const body = Buffer.concat(chunks);
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch (_) { response.writeHead(400); response.end('Invalid JSON request body'); return; }
      const requestedAt = new Date().toISOString();
      try {
        const upstream = await fetch('https://api.deepseek.com/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key }, body });
        const text = await upstream.text();
        response.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
        response.end(text);
        if (upstream.ok && !payload.stream) {
          try {
            const apiResponse = JSON.parse(text); const reported = apiResponse.usage || {};
            const cacheHit = Number(reported.prompt_cache_hit_tokens || 0);
            const prompt = Number(reported.prompt_tokens || 0);
            recordUsage({ at: requestedAt, model: apiResponse.model || payload.model, cacheHit, cacheMiss: Number(reported.prompt_cache_miss_tokens || Math.max(0, prompt - cacheHit)), output: Number(reported.completion_tokens || 0) });
          } catch (_) { /* A successful completion without a parseable usage object is simply not recorded. */ }
        }
      } catch (error) { response.writeHead(502); response.end(JSON.stringify({ error: { message: 'DeepSeek upstream error: ' + error.message } })); }
    });
  });
  return new Promise((resolve) => {
    usageProxy.once('error', (error) => { usageProxy = null; resolve({ ok: false, message: error.message }); });
    usageProxy.listen(0, '127.0.0.1', () => resolve({ ok: true, port: usageProxy.address().port, token }));
  });
}

function stopUsageProxy() { if (usageProxy) { usageProxy.close(); usageProxy = null; } }

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

function setAutostart(enabled) {
  if (isLinux) return setLinuxAutostart(enabled);
  if (isWindows) {
    try { app.setLoginItemSettings({ openAtLogin: enabled, path: process.execPath, args: app.isPackaged ? [] : [app.getAppPath()] }); } catch (error) { console.error('Could not update Windows autostart:', error); }
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
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://api-docs.deepseek.com/')) shell.openExternal(url);
    return { action: 'deny' };
  });

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
    ...((isLinux || isWindows) ? [{
      label: 'Start Automatically on Login',
      type: 'checkbox',
      checked: loadConfig().autostart === true,
      click: (item) => {
        setAutostart(item.checked);
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
    ...((isLinux || isWindows) ? [{
      label: 'Start Automatically on Login',
      type: 'checkbox',
      checked: loadConfig().autostart === true,
      click: (item) => {
        setAutostart(item.checked);
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

ipcMain.handle('save-api-key', (event, value) => ({ ok: saveApiKey(String(value || '')) }));
ipcMain.handle('clear-api-key', () => ({ ok: clearApiKey() }));

ipcMain.handle('verify-pricing', async () => {
  const checkedAt = new Date().toISOString();
  try {
    const response = await fetchWithTimeout('https://api-docs.deepseek.com/quick_start/pricing/', { headers: { 'User-Agent': 'DeepSeekPriceClock/1.1' } });
    const text = await response.text();
    const expected = ['01:00 - 04:00', '06:00 - 10:00', '$0.007', '$3.96'];
    const ok = response.ok && expected.every((value) => text.includes(value));
    return { ok, checkedAt, source: 'https://api-docs.deepseek.com/quick_start/pricing/' };
  } catch (error) { return { ok: false, checkedAt, message: error.message }; }
});

ipcMain.handle('get-balance', async () => {
  const key = readApiKey();
  if (!key) return { ok: false, message: safeStorage.isEncryptionAvailable() ? 'No API key stored.' : 'Secure credential storage is unavailable on this system.' };
  try {
    const response = await fetchWithTimeout('https://api.deepseek.com/user/balance', { headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' } });
    const payload = await response.json();
    if (!response.ok) return { ok: false, message: payload.error?.message || 'Balance request failed (' + response.status + ').' };
    const infos = Array.isArray(payload.balance_infos) ? payload.balance_infos : [];
    const balance = infos.map((item) => (item.currency || 'USD') + ' ' + (item.total_balance || item.balance || '0')).join(' · ') || 'Available';
    return { ok: true, balance };
  } catch (error) { return { ok: false, message: 'Balance request failed: ' + error.message }; }
});

ipcMain.handle('start-usage-proxy', async () => startUsageProxy());
ipcMain.handle('stop-usage-proxy', () => { stopUsageProxy(); return { ok: true }; });
ipcMain.handle('get-usage-proxy-status', () => {
  const config = loadConfig();
  return usageProxy ? { running: true, port: usageProxy.address().port, token: config.proxyToken || '' } : { running: false };
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
  stopUsageProxy();
  app.quit();
});
