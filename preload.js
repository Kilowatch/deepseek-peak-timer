const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (updates) => ipcRenderer.send('save-config', updates),
  setMode: (mode) => ipcRenderer.send('set-mode', mode),
  togglePin: () => ipcRenderer.send('toggle-pin'),
  minimizeApp: () => ipcRenderer.send('minimize-app'),
  closeApp: () => ipcRenderer.send('close-app'),
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  updateTrayStatus: (data) => ipcRenderer.send('update-tray-status', data),
  sendNotification: (data) => ipcRenderer.send('send-notification', data),
  verifyPricing: () => ipcRenderer.invoke('verify-pricing'),
  saveApiKey: (value) => ipcRenderer.invoke('save-api-key', value),
  clearApiKey: () => ipcRenderer.invoke('clear-api-key'),
  getBalance: () => ipcRenderer.invoke('get-balance'),
  startUsageProxy: () => ipcRenderer.invoke('start-usage-proxy'),
  stopUsageProxy: () => ipcRenderer.invoke('stop-usage-proxy'),
  getUsageProxyStatus: () => ipcRenderer.invoke('get-usage-proxy-status'),
  onUsageRecorded: (callback) => ipcRenderer.on('usage-recorded', (_event, value) => callback(value)),
  onModeChanged: (callback) => ipcRenderer.on('mode-changed', (_event, value) => callback(value)),
  onStateChanged: (callback) => ipcRenderer.on('state-changed', (_event, value) => callback(value))
});
