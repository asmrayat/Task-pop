// Present as macOS so the Mac code paths run.
const P = require('../paths');
Object.defineProperty(process, 'platform', { value: 'darwin' });
// Electron's macOS-only menu binding doesn't exist on Linux; the menu itself isn't under test.
require('electron').Menu.setApplicationMenu = () => {};
// Regression + bug-fix tests for TaskPop 1.3, run against the real main process on Linux.
const electron = require('electron');
const { app, Tray, BrowserWindow, systemPreferences, Menu, Notification, dialog, net, ipcMain } = electron;
const fs = require('fs');
const path = require('path');

const UD = process.env.TP_USERDATA;

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`[r] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const errors = [];
const sent = [];
let lastMenu = null;

if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
Tray.prototype.popUpContextMenu = Tray.prototype.popUpContextMenu || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () { sent.push({ title: this.title, body: this.body, n: this }); };
const realBuild = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = (tpl) => { const m = realBuild(tpl); m.popup = () => { lastMenu = tpl; }; return m; };
dialog.showMessageBox = async () => ({ response: 0 });
let importFile = null;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [importFile] });
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));

app.setPath('userData', UD);
process.argv.push('--show');
require(P.APP + '/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const clickMenu = (tpl, ...labels) => {
  let items = tpl; let item;
  for (const l of labels) { item = items.find((i) => i.label && i.label.startsWith(l)); items = item && item.submenu; }
  if (!item) throw new Error('menu item not found: ' + labels.join(' > '));
  item.click(item);
};
const readTasks = () => JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks;
const byTitle = (list, t) => list.find((x) => x.title === t);

app.whenReady().then(async () => {
  await wait(2500);
  const panel = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
  const js = (c) => panel.webContents.executeJavaScript(c, true);
  panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
  const rows = () => js(`[...document.querySelectorAll('.row')].map(r => (r.classList.contains('done')?'[x]':'[ ]') + (r.classList.contains('important')?'★':'') + ' ' + r.querySelector('.title').textContent)`);

  // ---------- 1.2 features ----------
  let r = await rows();
  check('daily task un-ticks on a new day', r.some((x) => x.startsWith('[ ]') && x.includes('Morning workout')));
  check('morning summary notification', sent.some((s) => /task/.test(s.title)), sent.map((s) => s.title).join(' | '));
  const future = byTitle(readTasks(), 'Weekly review');
  check('future reminder on a daily task is NOT pulled to today (fix 8)', future && future.remindAt === Number(process.env.TP_FUTURE), new Date(future.remindAt).toString().slice(0, 21));

  await js(`(() => { const i=document.getElementById('newTask'); i.value='!Call the bank before 5'; i.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})); })()`);
  r = await rows();
  check('"!" quick-add goes to the top as important', r[0] === '[ ]★ Call the bank before 5', r[0]);

  await js(`document.querySelector('.row[data-id="t1"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))`);
  await wait(300);
  clickMenu(lastMenu, 'Remind me', 'In 1 hour');
  await wait(300);
  await js(`document.querySelector('.row[data-id="t2"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))`);
  await wait(300);
  clickMenu(lastMenu, 'Repeat every day');
  await wait(300);
  r = await rows();
  check('right-click reminder + repeat show as chips', (await js(`document.querySelector('.row[data-id="t1"] .chip') !== null && document.querySelector('.row[data-id="t2"] .chip').textContent`)) === 'Every day');

  await js(`document.querySelector('.row[data-id="t2"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))`);
  await wait(300);
  clickMenu(lastMenu, 'Remind me', 'Pick date');
  await wait(400);
  check('date & time picker opens', await js(`!!document.querySelector('.picker')`));
  // fix 6: an update from the app must not wipe the open picker
  sent.length = 0;
  await js(`(() => { const t = tasks.find(x => x.id==='t3'); t.remindAt = Date.now() - 1000; t.reminded = false; save(); })()`);
  await wait(300);
  app.emit('second-instance');
  await wait(600);
  check('reminder notification fires', sent.some((s) => s.title === 'TaskPop reminder'), sent.map((s) => s.body).join(' | '));
  check('picker survives a background update (fix 6)', await js(`!!document.querySelector('.picker')`));
  await js(`(() => { const [d,t]=document.querySelectorAll('.picker select'); d.value='1'; t.value=String(9*60+30); document.querySelector('.picker button').click(); })()`);
  await wait(300);
  const t2 = byTitle(readTasks(), 'Update website banner');
  check('picked reminder saved', t2 && new Date(t2.remindAt).getHours() === 9 && new Date(t2.remindAt).getMinutes() === 30);

  // fix 1: reminder must not re-fire after a stale panel save
  sent.length = 0;
  await wait(200);
  app.emit('second-instance');
  await wait(500);
  check('reminder fires only once (fix 1)', !sent.some((s) => s.title === 'TaskPop reminder'), `${sent.length} notifications`);

  // fix 1 (race): the app changes a task while the panel saves an older copy
  const stale = await js(`({ list: JSON.parse(JSON.stringify(tasks)), rev: knownRev })`);
  const snoozeTarget = sent.find(() => false);
  // app-side change: snooze via notification action on t3
  const t3Before = byTitle(readTasks(), 'Old finished task') || readTasks().find((t) => t.id === 't3');
  sent.length = 0;
  await js(`(() => { const t = tasks.find(x => x.id==='t4'); t.remindAt = Date.now() - 1000; t.reminded = false; save(); })()`);
  await wait(300);
  const staleBeforeFire = await js(`({ list: JSON.parse(JSON.stringify(tasks)), rev: knownRev })`);
  app.emit('second-instance'); // fires t4's reminder -> app marks it reminded
  await wait(500);
  const n = sent.find((s) => s.title === 'TaskPop reminder');
  if (n) n.n.emit('action', {}, 1); // "Snooze 15 min" -> app moves the reminder
  await wait(300);
  // Panel (still on the older copy) ticks t1 and saves
  await js(`(() => { const list = ${JSON.stringify(staleBeforeFire.list)}; list.find(x => x.id==='t1').done = true; window.taskpop.saveTasks(list, ${staleBeforeFire.rev}); })()`);
  await wait(400);
  let disk = readTasks();
  const t4 = disk.find((t) => t.id === 't4');
  check('stale panel save keeps the app\'s snooze (fix 1)', t4 && !t4.reminded && t4.remindAt > Date.now() + 10 * 60 * 1000, t4 && new Date(t4.remindAt).toTimeString().slice(0, 5));
  check('...and still applies the panel\'s own change', disk.find((t) => t.id === 't1').done === true);
  check('panel list re-synced after the merge', await js(`tasks.find(t => t.id==='t4').remindAt > Date.now() + 600000 && tasks.find(t => t.id==='t1').done`));

  // Undo
  await js(`document.querySelector('.row[data-id="t2"] .delete').click()`);
  const toast = await js(`document.getElementById('undoToast').classList.contains('show')`);
  await js(`document.getElementById('undoBtn').click()`);
  check('delete shows Undo and Undo restores', toast && (await js(`!!tasks.find(x=>x.id==='t2')`)));

  // Keyboard
  await js(`document.activeElement.blur(); selectedId = null; render();`);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}))`);
  const sel = await js(`selectedId && tasks.find(t=>t.id===selectedId).title`);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}))`);
  const ticked = await js(`tasks.find(t=>t.title===${JSON.stringify(sel)}).done`);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Backspace',bubbles:true}))`);
  const afterDel = await js(`tasks.length`);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'z',metaKey:true,bubbles:true}))`);
  check('keyboard: ↓ selects, Space ticks, ⌫ deletes, ⌘Z restores', !!sel && ticked && (await js(`tasks.length`)) === afterDel + 1);

  // fix 5: Space on a focused tick button toggles exactly one task
  await js(`selectedId = 't2'; render();`);
  const before = await js(`({ t1: tasks.find(t=>t.id==='t1').done, t2: tasks.find(t=>t.id==='t2').done })`);
  await js(`document.querySelector('.row[data-id="t1"] .check').focus()`);
  panel.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
  panel.webContents.sendInputEvent({ type: 'char', keyCode: ' ' });
  panel.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
  await wait(400);
  const afterSpace = await js(`({ t1: tasks.find(t=>t.id==='t1').done, t2: tasks.find(t=>t.id==='t2').done })`);
  check('Space on a focused tick circle toggles only that task (fix 5)', afterSpace.t1 !== before.t1 && afterSpace.t2 === before.t2, JSON.stringify({ before, afterSpace }));

  // fix 6: an update from the app must not wipe an edit in progress
  await js(`document.querySelector('.row[data-id="t2"] .title').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  await js(`document.querySelector('.title-edit').value = 'Update website banner (hero image)'`);
  await js(`document.querySelector('.row[data-id="t1"]').dispatchEvent(new MouseEvent('contextmenu',{bubbles:true}))`);
  await wait(200);
  clickMenu(lastMenu, 'Important'); // app-side change pushes a new list
  await wait(400);
  const editAlive = await js(`document.querySelector('.title-edit') && document.querySelector('.title-edit').value`);
  await js(`document.querySelector('.title-edit').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`);
  await wait(300);
  disk = readTasks();
  check('edit in progress survives a background update (fix 6)', editAlive === 'Update website banner (hero image)');
  check('...and both changes are saved', !!byTitle(disk, 'Update website banner (hero image)') && disk.find((t) => t.id === 't1').important === true);

  // Reorder
  const orderBefore = await js(`tasks.filter(t => !t.done && !t.important).map(t => t.id)`);
  await js(`moveTask('t4','t3',false)`);
  r = await js(`tasks.filter(t => !t.done && !t.important).map(t => t.id)`);
  check('drag reorder', r.indexOf('t4') !== -1 && r.indexOf('t4') === r.indexOf('t3') - 1, `${JSON.stringify(orderBefore)} -> ${JSON.stringify(r)}`);

  // fix 4: hiding the panel with the picker open resets it
  await js(`openPicker('t2')`);
  await wait(200);
  await js(`document.getElementById('closeBtn').click()`);
  await wait(600);
  check('hiding the panel closes the picker and releases auto-hide (fix 4)', (await js(`pickerId === null && !document.querySelector('.picker')`)));
  app.emit('second-instance');
  await wait(600);

  // ---------- Settings ----------
  await js(`document.getElementById('settingsBtn').click()`);
  await wait(2000);
  const sw = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('settings.html'));
  const sjs = (c) => sw.webContents.executeJavaScript(c, true);
  sw.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('settings: ' + e.message); });
  check('Settings footer credits asmlab', /Developed by asmlab/.test(await sjs(`document.getElementById('footer').textContent`)));
  check('no Voice section in Settings', !(await sjs(`document.body.textContent.includes('Hey Task')`)));

  // fix 2: tasks deleted in Settings don't come back from a stale panel save
  await js(`tasks.find(t=>t.id==='t2').done = true; save();`);
  await wait(200);
  const beforeClear = await js(`({ list: JSON.parse(JSON.stringify(tasks)), rev: knownRev })`);
  await sjs(`document.getElementById('clearCompletedBtn').click()`);
  await wait(500);
  await js(`window.taskpop.saveTasks(${JSON.stringify(beforeClear.list)}, ${beforeClear.rev})`);
  await wait(400);
  disk = readTasks();
  check('completed tasks deleted in Settings stay deleted (fix 2)', !disk.some((t) => t.done), `${disk.filter((t) => t.done).length} completed on disk`);

  // imports survive a stale save
  importFile = path.join(UD, 'import.json');
  fs.writeFileSync(importFile, JSON.stringify({ tasks: [{ id: 'imp1', title: 'Imported task' }] }));
  const beforeImport = await js(`({ list: JSON.parse(JSON.stringify(tasks)), rev: knownRev })`);
  await sjs(`document.getElementById('importBtn').click()`);
  await wait(500);
  await js(`window.taskpop.saveTasks(${JSON.stringify(beforeImport.list)}, ${beforeImport.rev})`);
  await wait(400);
  check('imported tasks survive a stale panel save (fix 2)', !!readTasks().find((t) => t.id === 'imp1'));

  await sjs(`document.querySelector('.content').scrollTop = 0`);
  await wait(200);
  fs.writeFileSync(P.SHOTS + '/regress-settings-top.png', (await sw.webContents.capturePage()).toPNG());

  console.log(`[r] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log('[r] errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});
