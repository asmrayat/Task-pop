// Bridge for the first-run tour.
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => ipcRenderer.on(channel, (_event, data) => callback(data));

contextBridge.exposeInMainWorld('taskpopTour', {
  get: () => ipcRenderer.invoke('tour:get'),
  updateSetting: (key, value) => ipcRenderer.invoke('settings:update', key, value),
  watchKeys: (watch) => ipcRenderer.send('tour:watch-keys', !!watch),
  probeKeys: (kind) => ipcRenderer.send('doubletap:probe', kind),
  allowKeys: () => ipcRenderer.invoke('doubletap:allow'),
  restart: () => ipcRenderer.send('tour:restart'),
  finish: (action) => ipcRenderer.send('tour:finish', action),
  onKey: on('tour:key'),
  onDoubleTap: on('tour:double-tap'),
  onGo: on('tour:go'),
});
