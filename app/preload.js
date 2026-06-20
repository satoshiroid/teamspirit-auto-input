const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('config:get'),
  saveConfig: (cfg) => ipcRenderer.invoke('config:save', cfg),
  getDefault: () => ipcRenderer.invoke('config:default'),
  launchBrowser: () => ipcRenderer.invoke('browser:launch'),
  browserStatus: () => ipcRenderer.invoke('browser:status'),
  fetchSettings: () => ipcRenderer.invoke('settings:fetch'),
  pickImage: () => ipcRenderer.invoke('ocr:pick-image'),
  runOcr: (imagePath) => ipcRenderer.invoke('ocr:run', imagePath),
  startRun: (days) => ipcRenderer.invoke('run:start', days),
  onLog: (cb) => ipcRenderer.on('run:log', (e, msg) => cb(msg)),
  onOcrProgress: (cb) => ipcRenderer.on('ocr:progress', (e, msg) => cb(msg)),
});
