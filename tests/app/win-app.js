// Runs TaskPop's main process with process.platform = 'win32' so the Windows code paths execute.
const P = require('../paths');
Object.defineProperty(process, 'platform', { value: 'win32' });
const { app, Tray, BrowserWindow, Menu, screen, systemPreferences } = require('electron');
const fs = require('fs');
const path = require('path');

const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`[w] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const SRC = process.env.TP_SRC || P.APP;

// Simulated Windows keyboard + focus helper
const kb = { flags: 0, activity: 100 };
const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => kb.flags, activity: () => kb.activity, hasAccess: () => true, requestAccess: () => true });
let focusCalls = 0;
require(`${SRC}/winfocus.js`).createWinFocus = () => () => { focusCalls += 1; };

let appHideCalls = 0;
app.hide = () => { appHideCalls += 1; };
app.show = () => {};
let lastTray = null;
let lastTooltip = '';
const realTip = Tray.prototype.setToolTip;
Tray.prototype.setToolTip = function (t) { lastTray = this; lastTooltip = t; return realTip.call(this, t); };
Tray.prototype.setTitle = function () { throw new Error('setTitle is macOS-only and must not be called on Windows'); };
systemPreferences.getAccentColor = () => '0078d4ff';
const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
app.setPath('userData', process.env.TP_USERDATA);
require(`${SRC}/main.js`);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const K = dt.KEY_MASKS;
async function tap(mask) { kb.flags |= mask; await wait(80); kb.flags &= ~mask; }
async function doubleTap(mask) { await tap(mask); await wait(150); await tap(mask); await wait(300); }
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const settingsWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('settings.html'));
const visible = () => panelWin().isVisible() && panelWin().getOpacity() > 0.5;

app.whenReady().then(async () => {
  await wait(3500);
  const panel = panelWin();
  const js = (c) => panel.webContents.executeJavaScript(c, true);
  panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
  if (visible()) { await js('window.taskpop.hide()'); await wait(500); }

  check('no menu bar on Windows windows', Menu.getApplicationMenu() === null);
  check('tray tooltip shows the task count', /^TaskPop · \d+ tasks? left$/.test(lastTooltip), lastTooltip);

  await doubleTap(K.control);
  check('double-tap Ctrl opens TaskPop', visible());
  check('Windows focus helper runs so typing goes into the panel', focusCalls > 0, `${focusCalls} call(s)`);
  const b = panel.getBounds();
  const wa = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea;
  check('panel sits bottom-right, above the taskbar', b.y + b.height === wa.y + wa.height - 10 && b.x + b.width === wa.x + wa.width - 10, JSON.stringify(b));
  check('panel uses the Windows style', await js(`document.documentElement.classList.contains('platform-win32') && getComputedStyle(document.body).backgroundColor !== 'rgba(0, 0, 0, 0)'`));
  check('settings button says Ctrl+,', (await js(`document.getElementById('settingsBtn').title`)) === 'Settings (Ctrl+,)');
  fs.writeFileSync(P.SHOTS + '/win-app-panel.png', (await panel.webContents.capturePage()).toPNG());

  // Ctrl+Z undo in the panel
  await js(`document.activeElement.blur(); document.querySelector('.row .delete').click()`);
  const afterDelete = await js('tasks.length');
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))`);
  check('Ctrl+Z undoes a delete', (await js('tasks.length')) === afterDelete + 1);

  // Tray click toggles; a click right after the panel closed by losing focus doesn't reopen it
  panel.focus();
  lastTray.emit('click');
  await wait(400);
  check('clicking the tray icon closes the open panel', !visible());
  lastTray.emit('click');
  await wait(400);
  check('clicking it again opens the panel', visible());

  // Settings, Windows wording
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: ',', ctrlKey: true, bubbles: true }))`);
  await wait(2000);
  const sw = settingsWin();
  check('Ctrl+, opens Settings', !!sw);
  const sjs = (c) => sw.webContents.executeJavaScript(c, true);
  sw.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('settings: ' + e.message); });
  const ui = await sjs(`({
    options: [...document.getElementById('doubleTapKey').options].map(o => o.textContent),
    login: document.getElementById('loginLabel').textContent,
    explorer: document.getElementById('showData').textContent,
    count: document.getElementById('countLabel').textContent,
    titlebarHidden: getComputedStyle(document.querySelector('.titlebar')).display === 'none',
    siriTip: !!document.getElementById('tipSiri'),
    shortcut: document.getElementById('shortcutBtn').textContent,
    undoTip: document.getElementById('tipUndoKeys').textContent,
  })`);
  check('double-tap choices are Ctrl, Alt, Shift, Off', JSON.stringify(ui.options) === '["Ctrl","Alt","Shift","Off"]', ui.options.join(', '));
  check('Windows wording (Start with Windows, File Explorer, tray)', ui.login === 'Start with Windows' && ui.explorer === 'Show in File Explorer' && ui.count === 'Show task count on the tray icon');
  check('Mac-only bits hidden (title strip, Siri tip)', ui.titlebarHidden && !ui.siriTip);
  check('shortcut shown as Ctrl+Alt+T', ui.shortcut === 'Ctrl+Alt+T', ui.shortcut);
  check('undo tip shows Ctrl Z', ui.undoTip === 'CtrlZ', ui.undoTip);
  const snap = await sjs(`window.settingsApi.update('doubleTapKey', 'command')`);
  check('the Windows key cannot be chosen for double-tap', snap.settings.doubleTapKey === 'control', snap.settings.doubleTapKey);
  await sjs(`(() => { const s = document.getElementById('doubleTapKey'); s.value = 'option'; s.dispatchEvent(new Event('change')); })()`);
  await wait(300);
  await js('window.taskpop.hide()');
  await wait(500);
  await doubleTap(K.option);
  check('double-tap Alt works after choosing it', visible());

  // Shortcut recorder on Windows
  await sjs(`document.getElementById('shortcutBtn').click()`);
  await sjs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'y', code: 'KeyY', ctrlKey: true, shiftKey: true, bubbles: true }))`);
  await wait(500);
  check('recording a new shortcut shows Ctrl+Shift+Y', (await sjs(`document.getElementById('shortcutBtn').textContent`)) === 'Ctrl+Shift+Y');
  await sjs(`document.querySelector('.content').scrollTop = 0`);
  await wait(200);
  fs.writeFileSync(P.SHOTS + '/win-app-settings.png', (await sw.webContents.capturePage()).toPNG());
  await sjs(`document.querySelector('.content').scrollTop = 99999`);
  await wait(200);
  fs.writeFileSync(P.SHOTS + '/win-app-settings-bottom.png', (await sw.webContents.capturePage()).toPNG());

  check('the Mac-only app hide was never used', appHideCalls === 0, `${appHideCalls} calls`);
  console.log(`[w] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log('[w] errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});
