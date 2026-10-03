// TaskPop 1.6.2 running as a Microsoft Store (MSIX) app on Windows: process.windowsStore = true.
const P = require('../paths');
Object.defineProperty(process, 'platform', { value: 'win32' });
process.windowsStore = true;
const electron = require('electron');
const { app, Tray, BrowserWindow, Notification, systemPreferences, shell } = electron;
const fs = require('fs');
const path = require('path');
const http = require('http');

const SRC = process.env.TP_SRC || P.APP;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[s] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// The package's install folder name, and its private AppData folder
const UD = process.env.TP_USERDATA;
const LOCAL = path.join(UD, '..', 'store-localappdata');
const FAMILY = '12345Asmlab.TaskPop_abcd1234efgh';
const REAL_DATA = path.join(LOCAL, 'Packages', FAMILY, 'LocalCache', 'Roaming', path.basename(UD));
fs.rmSync(LOCAL, { recursive: true, force: true });
fs.mkdirSync(REAL_DATA, { recursive: true });
process.env.LOCALAPPDATA = LOCAL;
const realExec = process.execPath;
Object.defineProperty(process, 'execPath', { value: `C:\\Program Files\\WindowsApps\\12345Asmlab.TaskPop_1.6.2.0_x64__abcd1234efgh\\TaskPop.exe`.replace(/\\/g, path.sep), configurable: true });

const kb = { flags: 0, activity: 100 };
const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => kb.flags, activity: () => kb.activity, hasAccess: () => true, requestAccess: () => true });
require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
let ghHits = 0;
const gh = http.createServer((req, res) => { ghHits += 1; res.writeHead(404); res.end(); }).listen(0, '127.0.0.1', () => {
  require(`${SRC}/updater.js`).config.api = `http://127.0.0.1:${gh.address().port}/repos/x/y/releases/latest`;
});
const calls = { aumid: [], login: [], opened: [] };
app.setAppUserModelId = (id) => calls.aumid.push(id);
app.setLoginItemSettings = (s) => calls.login.push(s);
shell.openExternal = async (url) => { calls.opened.push(url); };
let trayMenu = null;
let lastTray = null;
const realTip = Tray.prototype.setToolTip;
Tray.prototype.setToolTip = function (t) { lastTray = this; return realTip.call(this, t); };
Tray.prototype.popUpContextMenu = function (m) { trayMenu = m; };
systemPreferences.getAccentColor = () => '0078d4ff';
const sent = [];
Notification.isSupported = () => true;
Notification.prototype.show = function () { sent.push(this.title); };
const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
fs.mkdirSync(UD, { recursive: true });
app.setPath('userData', UD); // first run: no meta.json

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return false; };
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const settingsWin = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith('settings.html'));
const K = dt.KEY_MASKS;
async function tap(mask) { kb.flags |= mask; await wait(80); kb.flags &= ~mask; }
async function doubleTap(mask) { await tap(mask); await wait(150); await tap(mask); await wait(400); }

require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  Object.defineProperty(process, 'execPath', { value: realExec });
  console.log(`[s] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log('[s] errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

async function run() {
  await wait(3500);
  const panel = panelWin();
  const js = (c) => panel.webContents.executeJavaScript(c, true);
  check('no custom app ID is set (the package has its own, so notifications work)', calls.aumid.length === 0, JSON.stringify(calls.aumid));
  check('first run doesn’t write a Run registry entry (the Store start-up task does it)', calls.login.length === 0, JSON.stringify(calls.login));

  lastTray.emit('right-click');
  await wait(200);
  const labels = trayMenu.items.map((i) => i.label).filter(Boolean);
  check('tray menu has no "Start with Windows" or update items', !labels.includes('Start with Windows') && !labels.some((l) => /Update/.test(l)), labels.join(' / '));

  await js('window.taskpop.openSettings()');
  await until(() => settingsWin() && !settingsWin().webContents.isLoading());
  await wait(1200);
  const sw = settingsWin();
  const sjs = (c) => sw.webContents.executeJavaScript(c, true);
  const ui = await sjs(`({
    switchHidden: document.getElementById('loginSwitch').hidden,
    button: !document.getElementById('startupSettings').hidden,
    hint: document.getElementById('loginHint').textContent,
    updTitle: document.getElementById('updateTitle').textContent,
    updDetail: document.getElementById('updateDetail').textContent,
    checkHidden: document.getElementById('updateCheck').hidden,
    autoRowHidden: [...document.querySelectorAll('#updatesSection .row')].slice(1).every((r) => r.hidden),
    dataPath: document.getElementById('dataPath').textContent,
  })`);
  check('Settings: start-up is managed in Windows Settings (button instead of switch)', ui.switchHidden && ui.button && /Windows Settings → Apps → Startup/.test(ui.hint));
  await sjs(`document.getElementById('startupSettings').click()`);
  await wait(300);
  check('… and the button opens Windows’ Startup apps page', calls.opened.includes('ms-settings:startupapps'), calls.opened.join(', '));
  check('Settings: updates come from the Microsoft Store (no Check now, no GitHub switch)', /Microsoft Store/.test(ui.updDetail) && ui.checkHidden && ui.autoRowHidden, ui.updDetail);
  check('Settings shows where the data really is (the package’s own folder)', ui.dataPath === REAL_DATA, ui.dataPath);
  sw.close();
  await wait(400);

  await doubleTap(K.control);
  const vis = panel.isVisible() && panel.getOpacity() > 0.5;
  check('double-tap still opens TaskPop', vis);
  await js(`(() => { const i = document.getElementById('newTask'); i.value = 'Meeting with Adam'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); })()`);
  await wait(400);
  check('tasks still save', JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks.some((t) => t.title === 'Meeting with Adam'));

  await wait(19000); // past the time a GitHub update check would happen
  check('never contacts GitHub for updates', ghHits === 0, `${ghHits} request(s)`);
  gh.close();
}
