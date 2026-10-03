const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => ipcRenderer.on(channel, (_event, data) => callback(data));

contextBridge.exposeInMainWorld('taskpop', {
  getState: () => ipcRenderer.invoke('panel:get-state'),
  saveTasks: (tasks, rev) => ipcRenderer.send('tasks:save', { tasks, rev }),
  updateSetting: (key, value) => ipcRenderer.invoke('settings:update', key, value),
  hide: () => ipcRenderer.send('panel:hide'),
  drag: (phase, dx, dy) => ipcRenderer.send('panel:drag', phase, dx, dy),
  hold: (value) => ipcRenderer.send('panel:hold', value),
  openSettings: () => ipcRenderer.send('panel:open-settings'),
  showTaskMenu: (id) => ipcRenderer.send('task:context-menu', id),
  onShown: on('panel:shown'),
  onHidden: on('panel:hidden'),
  onTasksReplaced: on('tasks:replace'),
  onSettingsChanged: on('settings:changed'),
  onToggleTask: on('task:toggle'),
  onEditTask: on('task:edit'),
  onDeleteTask: on('task:delete'),
  onPickReminder: on('task:pick-reminder'),
  onCalendarTask: on('task:calendar'),
  openCalendar: (event) => ipcRenderer.invoke('calendar:open', event),
  // Updates
  onUpdateState: on('update:state'),
  installUpdate: () => ipcRenderer.send('update:install'),
  dismissUpdate: (kind) => ipcRenderer.send('update:dismiss', kind),
  openUpdates: () => ipcRenderer.send('panel:open-updates'),
});
