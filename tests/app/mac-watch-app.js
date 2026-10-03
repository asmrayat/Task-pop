// v1.6.3 (Mac): the double-tap watcher keeps TaskPop out of App Nap only while it's watching,
// checks keys every 15 ms, and the panel is set to join every Space (full-screen ones too).
// Runs the real main process as macOS (or as Windows with TP_PLATFORM=win32).
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
  console.log(`[w:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const kb = { flags: 0, activity: 100 };
const awake = { begin: 0, end: 0, held: 0 };
const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({
  flags: () => kb.flags,
  activity: () => kb.activity,
  hasAccess: () => true,
  requestAccess: () => true,
  ...(PLATFORM === 'darwin' ? { keepAwake: () => { awake.begin += 1; awake.held += 1; return () => { awake.end += 1; awake.held -= 1; }; } } : {}),
});
const intervals = [];
const RealWatcher = dt.DoubleTapWatcher;
dt.DoubleTapWatcher = class extends RealWatcher {
  constructor(source, onTrigger, intervalMs) {
    super(source, onTrigger, intervalMs);
    intervals.push(intervalMs);
  }
};
if (PLATFORM === 'win32') require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
globalShortcut.register = () => true;
globalShortcut.unregister = () => {};
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};

// Record what the panel is told about Spaces
const spaceCalls = [];
BrowserWindow.prototype.setVisibleOnAllWorkspaces = function (visible, opts) {
  spaceCalls.push({ url: this.webContents.getURL(), visible, opts: opts || {}, at: Date.now() });
};

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, lastVersion: '1.6.3' }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ doubleTapKey: 'shift' }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [{ id: 'a', title: 'Meeting with Adam', done: false, createdAt: Date.now() }] }));
app.setPath('userData', UD);
app.getVersion = () => '1.6.3';

const K = dt.KEY_MASKS;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function tap(mask, hold = 80) { kb.flags |= mask; await wait(hold); kb.flags &= ~mask; }
async function doubleTapShift(hold = 80) { await tap(K.shift, hold); await wait(150); await tap(K.shift, hold); await wait(450); }
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const visible = () => panelWin().isVisible() && panelWin().getOpacity() > 0.5;

require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  console.log(`[w:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[w:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

async function run() {
  await wait(3000);
  const panel = panelWin();
  const js = (c) => panel.webContents.executeJavaScript(c, true);
  if (visible()) { await js('window.taskpop.hide()'); await wait(500); }

  if (PLATFORM === 'darwin') {
    check('checks the keys every 15 ms on the Mac', intervals[0] === 15, `interval ${intervals[0]} ms`);
    check('opts out of App Nap while double-tap is on', awake.held === 1 && awake.begin === 1);
    const atCreate = spaceCalls.filter((c) => c.visible === true && c.opts.visibleOnFullScreen === true && c.opts.skipTransformProcessType === true);
    check('the panel joins every Space, full-screen apps included (no Dock flicker)', atCreate.length >= 1, JSON.stringify(spaceCalls[0] && spaceCalls[0].opts));
  } else {
    check('Windows keeps its 25 ms checks', intervals[0] === 25, `interval ${intervals[0]} ms`);
    check('Windows: no App Nap opt-out (not a thing there)', awake.begin === 0);
    check('Windows: no Spaces calls', spaceCalls.length === 0);
  }

  // Quick taps (40 ms) still open and close it
  await doubleTapShift(40);
  check('a quick double-tap (40 ms taps) opens TaskPop', visible());
  if (PLATFORM === 'darwin') {
    const n = spaceCalls.length;
    check('showing re-applies "join every Space" first', n >= 2 && spaceCalls[n - 1].opts.visibleOnFullScreen === true);
  }
  await doubleTapShift(40);
  check('… and closes it', !visible());

  // Sleep and wake: the opt-out ends while asleep and comes back on wake
  powerMonitor.emit('suspend');
  await wait(100);
  if (PLATFORM === 'darwin') check('going to sleep ends the App Nap opt-out', awake.held === 0 && awake.end === 1);
  powerMonitor.emit('resume');
  await wait(1600);
  if (PLATFORM === 'darwin') check('waking takes it again', awake.held === 1 && awake.begin === 2);
  if (visible()) { await doubleTapShift(); }
  check('after waking, double-tap still toggles (closed now)', !visible());

  // Lock and unlock
  powerMonitor.emit('lock-screen');
  await wait(100);
  if (PLATFORM === 'darwin') check('locking the screen ends it', awake.held === 0);
  powerMonitor.emit('unlock-screen');
  await wait(1000);
  if (PLATFORM === 'darwin') check('unlocking takes it again', awake.held === 1);
  if (visible()) await doubleTapShift();

  // Turning double-tap off in Settings gives App Nap back; turning it on takes it again
  await js('window.taskpop.updateSetting("doubleTapKey", "off")');
  await wait(300);
  if (PLATFORM === 'darwin') check('turning double-tap off lets macOS nap TaskPop again', awake.held === 0);
  await doubleTapShift();
  check('with double-tap off, Shift twice does nothing', !visible());
  await js('window.taskpop.updateSetting("doubleTapKey", "shift")');
  await wait(300);
  if (PLATFORM === 'darwin') check('turning it back on opts out again (only one at a time)', awake.held === 1);
  await doubleTapShift();
  check('… and Shift twice works again', visible());
  await doubleTapShift();
}
