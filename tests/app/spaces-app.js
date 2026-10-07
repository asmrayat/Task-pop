// v1.8.1 (Mac): the panel opens on the desktop (Space) you're on. The real main process as macOS,
// with a stand-in for app/spaces.js that plays a Mac where the panel was stuck on Desktop 1
// (as in the bug report): each opening goes through showHere, a panel left open on another
// desktop comes to you instead of closing, and if macOS still keeps it elsewhere, a new panel
// window is made (once). The native side is tested by tests/unit/spaces-test.js.
const P = require('../paths');
Object.defineProperty(process, 'platform', { value: 'darwin' });
const electron = require('electron');
electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Notification, systemPreferences, globalShortcut, clipboard } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[s] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

require(`${SRC}/doubletap.js`).createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
let shortcut = null;
globalShortcut.register = (acc, cb) => { shortcut = cb; return true; };
globalShortcut.unregister = () => {};
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};

// A Mac with desktops: which one you're on, and which one each window is on (by webContents id)
const desk = { active: 1, where: new Map(), mode: 'moves', calls: [] };
const idOf = (win) => win.webContents.id;
require(`${SRC}/spaces.js`).createSpaces = () => ({
  showHere(win, show) {
    desk.calls.push(win.webContents.getURL().split('/').pop());
    show();
    if (desk.mode === 'moves') desk.where.set(idOf(win), desk.active);
    else if (!desk.where.has(idOf(win))) desk.where.set(idOf(win), desk.mode === 'nothing-helps' ? 1 : desk.active); // a new window opens where you are
  },
  onActiveSpace(win) {
    if (!desk.where.has(idOf(win))) return null;
    return desk.where.get(idOf(win)) === desk.active;
  },
  behavior: () => 0x101,
});

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const d = new Date();
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, tourDone: true, lastVersion: '1.8.1', lastDay: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ keepOpen: false }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, categories: [{ id: 'work', name: 'Work', color: 'orange' }], tasks: [
  { id: 'a', title: 'Make a WordPress login for Fardin', category: 'work', createdAt: Date.now() },
] }));
app.setPath('userData', UD);
app.getVersion = () => '1.8.1';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return false; };
const panels = () => BrowserWindow.getAllWindows().filter((w) => w.webContents.getURL().endsWith('index.html'));
const panel = () => panels()[0];
const visible = () => { const p = panel(); return !!p && p.isVisible() && p.getOpacity() > 0.5; };
require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  try {
    await until(visible, 6000);
    await wait(300);
    check('opening TaskPop shows its one panel window, through showHere', panels().length === 1 && visible() && desk.calls.join() === 'index.html', desk.calls.join());

    // Desktop 1: close and open, as before
    shortcut();
    await until(() => !panel().isVisible());
    check('on Desktop 1 the shortcut closes it…', !panel().isVisible());
    shortcut();
    await until(visible);
    check('…and opens it', visible() && desk.calls.length === 2);
    shortcut();
    await until(() => !panel().isVisible());

    // Desktop 2: it opens here (showHere moves it)
    desk.active = 2;
    shortcut();
    await until(visible);
    await wait(300);
    check('on Desktop 2 it opens on Desktop 2', visible() && desk.where.get(idOf(panel())) === 2 && panels().length === 1);

    // Left open on Desktop 2 (say you pinned it), then you go to Desktop 3: the shortcut brings it, not closes it
    const id = idOf(panel());
    desk.active = 3;
    const before = desk.calls.length;
    shortcut();
    await wait(400);
    check('open on another desktop: the shortcut brings it to you instead of closing it', visible() && desk.where.get(id) === 3 && desk.calls.length === before + 1);
    shortcut();
    await until(() => !panel().isVisible());
    check('…and the next one closes it', !panel().isVisible());

    // A Mac that keeps it stuck where it was: a new panel window, made where you are
    desk.mode = 'stuck';
    desk.active = 4;
    shortcut();
    await until(() => panels().length === 1 && idOf(panel()) !== id && visible(), 6000);
    await wait(400);
    const fresh = panel();
    check('when macOS keeps it on another desktop, a new panel window opens on yours instead', panels().length === 1 && idOf(fresh) !== id && desk.where.get(idOf(fresh)) === 4 && visible(), `${panels().length} panels`);
    const rows = await fresh.webContents.executeJavaScript(`[...document.querySelectorAll('#list .row .title')].map((t) => t.firstChild.textContent)`, true);
    check('…with your tasks in it, ready to type', rows.join() === 'Make a WordPress login for Fardin' && (await fresh.webContents.executeJavaScript('document.activeElement.id', true)) === 'newTask', rows.join());
    fresh.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
    await fresh.webContents.executeJavaScript(`inputEl.value = 'Call the bank'; inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))`, true);
    await wait(400);
    const saved = JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks.map((t) => t.title);
    check('…and it saves like the old one', saved.includes('Call the bank') && saved.includes('Make a WordPress login for Fardin'), saved.join(' | '));
    shortcut();
    await until(() => !panel().isVisible());
    check('the new panel closes with the shortcut too', !panel().isVisible() && panels().length === 1);

    // A Mac where nothing brings it (not even a new window): one new window is tried, then no more
    desk.mode = 'nothing-helps';
    desk.active = 5;
    const ids = new Set([idOf(panel())]);
    shortcut();
    await wait(1500);
    ids.add(idOf(panel()));
    check('where nothing brings it here, one new window is tried', ids.size === 2 && panels().length === 1, `${ids.size} windows`);
    shortcut();
    await wait(400);
    check('…then the shortcut closes it again (no trying to bring it back over and over)', !panel().isVisible());
    shortcut();
    await wait(1200);
    ids.add(idOf(panel()));
    shortcut();
    await wait(400);
    check('…and no more new windows are made', ids.size === 2 && panels().length === 1, `${ids.size} windows`);

    // The report says how it went
    let report = '';
    const sw = await (async () => {
      await panel().webContents.executeJavaScript('window.taskpop.openSettings()', true);
      let w = null;
      await until(() => (w = BrowserWindow.getAllWindows().find((x) => x.webContents.getURL().endsWith('settings.html'))) && !w.webContents.isLoading());
      await wait(500);
      return w;
    })();
    await sw.webContents.executeJavaScript(`document.getElementById('reportBtn').click()`, true);
    await until(async () => /Desktops:/.test(await clipboard.readText()));
    report = (await clipboard.readText()).split('\n').find((l) => l.startsWith('Desktops:')) || '';
    check('the double-tap report says whether the panel opens on this desktop, and how often it didn\'t', /^Desktops: panel (opens|doesn’t open) on this one \(0x101\) · opened \d+ times, elsewhere [1-9]\d*, new panel window 2 \(didn’t help\)$/.test(report), report);

    // Settings comes to you too
    sw.hide();
    desk.calls.length = 0;
    await panel().webContents.executeJavaScript('window.taskpop.openSettings()', true);
    await wait(400);
    check('reopening Settings brings it to your desktop', desk.calls.includes('settings.html'), desk.calls.join());
  } catch (err) {
    errors.push('TEST ' + err.stack);
  }
  console.log(`[s] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log('[s] errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});
