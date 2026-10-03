// Bridge for the "New update is here" pop-up: it can only read the update state and answer.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('taskpopUpdate', {
  get: () => ipcRenderer.invoke('prompt:get'),
  choose: (choice) => ipcRenderer.send('prompt:choose', choice),
  setHeight: (height) => ipcRenderer.send('prompt:size', height),
  openPage: () => ipcRenderer.send('prompt:open-page'),
  onState: (callback) => ipcRenderer.on('prompt:state', (_event, state) => callback(state)),
  onSnoozed: (callback) => ipcRenderer.on('prompt:snoozed', () => callback()),
});
