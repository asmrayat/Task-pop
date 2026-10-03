// Double-tap (and the keyboard shortcut) must close an open panel every time, whether or not
// the panel has keyboard focus. Runs the real main process as Windows or macOS (TP_PLATFORM).
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'darwin';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Notification, systemPreferences, powerMonitor, globalShortcut } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const tag = PLATFORM === 'win32' ? 'win' : 'mac';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[t:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// Simulated keyboard: Shift is the double-tap key
const kb = { flags: 0, activity: 100 };
const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => kb.flags, activity: () => kb.activity, hasAccess: () => true, requestAccess: () => true });
if (PLATFORM === 'win32') require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
let shortcutCallback = null;
globalShortcut.register = (acc, cb) => { shortcutCallback = cb; return true; };
globalShortcut.unregister = () => {};
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};
const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, lastVersion: '1.6.1' }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ doubleTapKey: 'shift' }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [{ id: 'a', title: 'Meeting with Adam', done: false, createdAt: Date.now() }] }));
app.setPath('userData', UD);

const K = dt.KEY_MASKS;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function tap(mask) { kb.flags |= mask; await wait(80); kb.flags &= ~mask; }
async function doubleTapShift() { await tap(K.shift); await wait(150); await tap(K.shift); await wait(450); }
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const visible = () => panelWin().isVisible() && panelWin().getOpacity() > 0.5;
// The shortcut fires while its keys are held (Ctrl+Alt+T): hold them, as a real press would.
async function pressShortcut() {
  kb.flags |= K.control | K.option;
  kb.activity += 1;
  await wait(60);
  shortcutCallback();
  await wait(60);
  kb.flags &= ~(K.control | K.option);
}

require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  console.log(`[t:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[t:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

async function run() {
  await wait(3000);
  const panel = panelWin();
  const js = (c) => panel.webContents.executeJavaScript(c, true);
  if (visible()) { await js('window.taskpop.hide()'); await wait(500); }

  // 1. The usual case: open with double-tap, close with double-tap
  await doubleTapShift();
  check('double-tap Shift opens TaskPop', visible());
  await doubleTapShift();
  check('double-tap Shift closes it again', !visible());

  // 2. It popped up by itself when the lid was opened (so it has no keyboard focus)
  // Another app has focus, and the system shows TaskPop without giving it focus (as Windows does).
  const elsewhere = new BrowserWindow({ width: 300, height: 200, show: true });
  elsewhere.focus();
  await wait(400);
  const realShow = panel.show;
  panel.show = () => panel.showInactive();
  powerMonitor.emit('resume');
  await wait(1600);
  panel.show = realShow;
  check('opening the lid shows TaskPop, without keyboard focus', visible() && !panel.isFocused());
  await doubleTapShift();
  check('double-tap Shift closes the panel that popped up on wake', !visible());
  elsewhere.destroy();
  await wait(300);

  // 3. Unlocking the screen, same thing
  powerMonitor.emit('unlock-screen');
  await wait(1000);
  await doubleTapShift();
  check('double-tap Shift closes the panel that popped up on unlock', !visible());

  // 4. Pinned open while working in another window
  await doubleTapShift();
  await js('window.taskpop.updateSetting("keepOpen", true)');
  const other = new BrowserWindow({ width: 300, height: 200, show: true });
  other.focus();
  await wait(600);
  check('pinned panel stays open when another window has focus', visible() && !panel.isFocused());
  await doubleTapShift();
  check('double-tap Shift closes a pinned panel too', !visible());
  await doubleTapShift();
  check('... and the next double-tap opens it again, ready to type', visible() && (await js('document.activeElement && document.activeElement.id')) === 'newTask');
  other.destroy();
  await js('window.taskpop.updateSetting("keepOpen", false)');

  // 5. The keyboard shortcut toggles the same way
  await doubleTapShift();
  if (!visible()) await doubleTapShift();
  powerMonitor.emit('resume');
  await wait(1600);
  await pressShortcut();
  await wait(500);
  check('the keyboard shortcut also closes the panel', !visible());
  await pressShortcut();
  await wait(500);
  check('the keyboard shortcut opens it again', visible());

  // 6. Quick repeated toggles stay in step (open, close, open, close)
  const seen = [];
  for (let i = 0; i < 4; i += 1) {
    await doubleTapShift();
    seen.push(visible() ? 'open' : 'closed');
  }
  check('four double-taps in a row: closed, open, closed, open', seen.join(',') === 'closed,open,closed,open', seen.join(','));

  // 7. Typing capitals with Shift in the panel never toggles it
  if (!visible()) await doubleTapShift();
  for (let i = 0; i < 6; i += 1) {
    kb.flags |= K.shift; await wait(40); kb.activity += 1; await wait(40); kb.flags &= ~K.shift; await wait(90);
  }
  await wait(400);
  check('typing capital letters (Shift + a key) doesn’t close it', visible());
}
