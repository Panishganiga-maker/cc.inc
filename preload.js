const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Database
  dbRun: (sql, params) => ipcRenderer.invoke('db:run', sql, params),
  dbGet: (sql, params) => ipcRenderer.invoke('db:get', sql, params),
  dbAll: (sql, params) => ipcRenderer.invoke('db:all', sql, params),

  // File dialogs
  openFile: (options) => ipcRenderer.invoke('dialog:openFile', options),

  // Export
  savePDF: (buffer, name) => ipcRenderer.invoke('export:savePDF', buffer, name),
  saveCSV: (content, name) => ipcRenderer.invoke('export:saveCSV', content, name),
  exportArchive: (eventId) => ipcRenderer.invoke('export:archive', eventId),

  // USB
  scanUSB: () => ipcRenderer.invoke('usb:scan'),

  // App
  getAppPath: (name) => ipcRenderer.invoke('app:getPath', name)
});
