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
  // Quick note (v1.9)
  saveNote: (segments) => ipcRenderer.invoke('notes:save', segments),
  hideNoteText: (text) => ipcRenderer.invoke('notes:hide', text),
  revealNoteText: (id) => ipcRenderer.invoke('notes:reveal', id),
  copyNoteText: (id) => ipcRenderer.invoke('notes:copy', id),
  copyShownNoteText: (text) => ipcRenderer.invoke('notes:copy-shown', text),
  showNoteSecretMenu: (id, shown) => ipcRenderer.send('notes:secret-menu', { id, shown }),
  showNoteEditorMenu: (canHide) => ipcRenderer.send('notes:editor-menu', { canHide }),
  onNoteSecretAction: on('notes:secret-action'),
  onNoteEditorAction: on('notes:editor-action'),
  openCalendar: (event) => ipcRenderer.invoke('calendar:open', event),
  // Updates
  onUpdateState: on('update:state'),
  installUpdate: () => ipcRenderer.send('update:install'),
  dismissUpdate: (kind) => ipcRenderer.send('update:dismiss', kind),
  openUpdates: () => ipcRenderer.send('panel:open-updates'),
});
