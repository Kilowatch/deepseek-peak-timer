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
  onModeChanged: (callback) => ipcRenderer.on('mode-changed', (_event, value) => callback(value)),
  onStateChanged: (callback) => ipcRenderer.on('state-changed', (_event, value) => callback(value))
});
