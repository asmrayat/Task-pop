const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => ipcRenderer.on(channel, (_event, data) => callback(data));

contextBridge.exposeInMainWorld('taskpop', {
  getState: () => ipcRenderer.invoke('panel:get-state'),
  saveTasks: (tasks, rev, categories) => ipcRenderer.send('tasks:save', { tasks, rev, categories }),
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
  onPickTimer: on('task:pick-timer'),
  onCalendarTask: on('task:calendar'),
  // Categories (v1.8)
  showCategoryMenu: (id) => ipcRenderer.send('category:context-menu', id),
  onMoveTask: on('task:move-to'),
  onNewCategoryFor: on('category:new-for'),
  onCategoryAction: on('category:action'),
  sortDone: () => ipcRenderer.send('categories:sort-done'),
  // Secrets (v1.10; the quick note in 1.9)
  addSecret: (item) => ipcRenderer.invoke('secrets:add', item),
  updateSecret: (id, item) => ipcRenderer.invoke('secrets:update', id, item),
  deleteSecret: (id) => ipcRenderer.invoke('secrets:delete', id),
  revealSecret: (id, action) => ipcRenderer.invoke('secrets:reveal', id, action),
  copySecret: (text) => ipcRenderer.invoke('secrets:copy', text),
  showSecretMenu: (id, shown) => ipcRenderer.send('secrets:menu', { id, shown }),
  onSecretAction: on('secrets:action'),
  openCalendar: (event) => ipcRenderer.invoke('calendar:open', event),
  // Updates
  onUpdateState: on('update:state'),
  installUpdate: () => ipcRenderer.send('update:install'),
  dismissUpdate: (kind) => ipcRenderer.send('update:dismiss', kind),
  openUpdates: () => ipcRenderer.send('panel:open-updates'),
});
