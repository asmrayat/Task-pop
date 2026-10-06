// v1.6.5: the first-run tour, in the real main process (TP_PLATFORM=win32|darwin).
// TP_MODE: first (default) | blocked (macOS hides key state until allowed) | existing (not a
// first run) | skip | store. Buttons are clicked with real mouse input; keys come from a
// simulated keyboard, like the double-tap tests.
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'win32';
const MODE = process.env.TP_MODE || 'first';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Menu, Notification, systemPreferences, shell, nativeTheme } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const OUT = process.env.TP_SHOTS || P.TMP + '/tour-shots';
fs.mkdirSync(OUT, { recursive: true });
const tag = `${PLATFORM === 'win32' ? 'win' : 'mac'}${MODE === 'first' ? '' : `-${MODE}`}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[o:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const kb = { flags: 0, activity: 100 };
let accessRequests = 0;
const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({
  flags: () => (MODE === 'blocked' ? 0 : kb.flags), // blocked: macOS reports no keys at all
  activity: () => kb.activity,
  hasAccess: () => MODE !== 'blocked',
  requestAccess: () => { accessRequests += 1; return false; },
});
if (PLATFORM === 'win32') require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
if (MODE === 'store') process.windowsStore = true;
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
app.getVersion = () => '1.6.6';
let loginItem = false;
app.setLoginItemSettings = (s) => { loginItem = !!s.openAtLogin; };
app.getLoginItemSettings = () => ({ openAtLogin: loginItem });
let relaunched = null;
app.relaunch = (o) => { relaunched = o; };
app.quit = () => {};
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
const opened = [];
shell.openExternal = async (url) => { opened.push(url); };
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
let lastTray = null;
let trayMenu = null;
const realTip = Tray.prototype.setToolTip;
Tray.prototype.setToolTip = function (t) { lastTray = this; return realTip.call(this, t); };
Tray.prototype.popUpContextMenu = function (m) { trayMenu = m; };
systemPreferences.getAccentColor = () => (PLATFORM === 'win32' ? '0078d4ff' : '0a84ffff');
Notification.isSupported = () => true;
Notification.prototype.show = function () {};
const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.rmSync(UD, { recursive: true, force: true });
fs.mkdirSync(UD, { recursive: true });
if (MODE === 'existing') {
  fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, lastVersion: '1.6.4' }));
  fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [{ id: 'a', title: 'Old task', done: false, createdAt: Date.now() }] }));
}
app.setPath('userData', UD);
process.argv.push('--show'); // as the installers open it after installing

const K = dt.KEY_MASKS;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return true; await wait(80); }
  return false;
};
const windowFor = (file) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith(file));
const tourWin = () => windowFor('tour.html');
const panelWin = () => windowFor('index.html');
const panelOpen = () => panelWin().isVisible() && panelWin().getOpacity() > 0.5;
const json = (f) => JSON.parse(fs.readFileSync(path.join(UD, f), 'utf8'));
const shot = async (win, name) => fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());
async function tap(mask, hold = 80) { kb.flags |= mask; await wait(hold); kb.flags &= ~mask; await wait(60); }
async function doubleTap(mask) { await tap(mask); await wait(120); await tap(mask); await wait(450); }

require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  console.log(`[o:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[o:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

const state = (win = tourWin()) => win.webContents.executeJavaScript(`(() => {
  const vis = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
  const active = document.querySelector('.step.active');
  const box = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
  const btns = {};
  document.querySelectorAll('button').forEach((b) => { if (vis(b)) btns[b.id || b.dataset.key || b.textContent.trim()] = { text: b.textContent.trim(), ...box(b) }; });
  return {
    step: active && active.id, title: active && active.querySelector('h1').textContent,
    lead: active && active.querySelector('.lead') ? active.querySelector('.lead').textContent : '',
    buttons: btns,
    keys: [...document.querySelectorAll('.key-option')].map((b) => ({ key: b.dataset.key, text: b.textContent, on: b.getAttribute('aria-checked') === 'true' })),
    keycap: document.getElementById('keycapSymbol').textContent, down: document.getElementById('keycap').classList.contains('down'),
    worked: document.getElementById('keycap').classList.contains('worked'),
    dots: document.querySelectorAll('#taps i.on').length,
    tryText: document.getElementById('tryText').textContent,
    permission: vis(document.getElementById('permission')),
    shortcut: [...document.querySelectorAll('#shortcutKeys kbd')].map((k) => k.textContent).join(' '),
    tray: document.getElementById('trayHint').textContent,
    toggles: [...document.querySelectorAll('.toggle')].filter(vis).map((t) => ({ label: t.querySelector('b').textContent, on: t.querySelector('input').checked, ...box(t.querySelector('i')) })),
    storeNote: vis(document.getElementById('storeLogin')),
    howto: [...document.querySelectorAll('.howto li')].map((li) => li.textContent.trim()),
    focused: document.activeElement && document.activeElement.id,
  };
})()`, true);
async function click(win, p) {
  const send = (type) => win.webContents.sendInputEvent({ type, x: Math.round(p.x), y: Math.round(p.y), button: 'left', clickCount: 1 });
  send('mouseMove'); await wait(20); send('mouseDown'); await wait(40); send('mouseUp'); await wait(250);
}
const clickButton = async (id) => { const s = await state(); if (!s.buttons[id]) throw new Error(`no button ${id}: ${Object.keys(s.buttons)}`); await click(tourWin(), s.buttons[id]); };

async function run() {
  if (MODE === 'existing') {
    await wait(4000);
    check('someone who already uses TaskPop doesn’t get the tour after updating', !tourWin());
    check('… their panel opens as before', panelOpen());
    return;
  }
  const appeared = await until(() => tourWin() && tourWin().isVisible(), 8000);
  await wait(800);
  check('first launch after installing: the tour opens', appeared);
  check('… instead of the panel (which comes at the end)', !panelOpen());
  let s = await state();
  check('step 1 welcomes you and says what TaskPop is', s.step === 'step-welcome' && s.title === 'Welcome to TaskPop' && /slides in from the corner/.test(s.lead));
  check('… with “Get started” (focused) and “Skip tour”', s.buttons.nextBtn.text === 'Get started' && s.buttons.skipBtn && s.focused === 'nextBtn');
  await shot(tourWin(), `${tag}-1-welcome.png`);

  if (MODE === 'skip') {
    await clickButton('skipBtn');
    check('“Skip tour” closes it', await until(() => !tourWin(), 3000));
    check('… and it won’t come back by itself', json('meta.json').tourDone === true);
    return;
  }

  // Step 2: how to open it
  await clickButton('nextBtn');
  s = await state();
  const mac = PLATFORM === 'darwin';
  check('step 2: “Open it from any app”', s.step === 'step-open' && s.title === 'Open it from any app');
  check(`the key choices are this computer’s keys (${mac ? 'Control, Option, Command, Shift' : 'Ctrl, Alt, Shift'})`,
    s.keys.map((k) => k.key).join() === (mac ? 'control,option,command,shift' : 'control,option,shift') && s.keys[0].on, s.keys.map((k) => k.text).join(' / '));
  check('the big key shows the chosen key', s.keycap === (mac ? '⌃' : 'Ctrl'));
  check('it also shows the keyboard shortcut and the menu/tray icon', s.shortcut === (mac ? '⌃ ⌥ T' : 'Ctrl Alt T') && (mac ? /menu bar/.test(s.tray) : /next to the clock/.test(s.tray)), `${s.shortcut} | ${s.tray}`);
  check('… and asks you to try it', s.tryText === `Try it now: tap ${mac ? 'Control' : 'Ctrl'} twice.`, s.tryText);
  await shot(tourWin(), `${tag}-2-open.png`);

  if (MODE === 'blocked') {
    // Pressing the key in the tour window while macOS hides key state from TaskPop
    const send = (type, keyCode) => tourWin().webContents.sendInputEvent({ type, keyCode });
    tourWin().focus();
    for (let i = 0; i < 3; i += 1) { send('keyDown', 'Control'); await wait(60); send('keyUp', 'Control'); await wait(120); }
    await until(async () => (await state()).permission, 4000);
    s = await state();
    check('Mac without permission: the tour notices and explains what to allow', s.permission && /can’t see the key yet/.test(s.tryText), s.tryText);
    await shot(tourWin(), `${tag}-2-permission.png`);
    await clickButton('allowBtn');
    check('“Open System Settings” asks macOS / opens Input Monitoring', accessRequests === 1 && opened.some((u) => /Privacy_ListenEvent/.test(u)), opened.join(' '));
    return;
  }

  // Try it with the real double-tap detector
  kb.flags |= K.control; await wait(120);
  s = await state();
  check('pressing the key presses the big key on screen', s.down);
  kb.flags &= ~K.control; await wait(150);
  s = await state();
  check('… and the first tap lights the first dot', !s.down && s.dots === 1 && s.tryText === 'Once more, quickly.', s.tryText);
  await tap(K.control);
  await wait(500);
  s = await state();
  check('the second tap opens TaskPop for real', panelOpen());
  check('… and the tour says it worked', s.worked && /That’s it\. TaskPop opened in the corner/.test(s.tryText), s.tryText);
  await shot(tourWin(), `${tag}-2-worked.png`);
  await doubleTap(K.control);
  check('double-tapping again puts it away', !panelOpen());

  // Pick another key
  tourWin().focus();
  await wait(300);
  await clickButton('shift');
  await wait(300);
  s = await state();
  check('choosing Shift saves it and shows it on the key', json('settings.json').doubleTapKey === 'shift' && s.keycap === (mac ? '⇧' : 'Shift') && s.keys.find((k) => k.key === 'shift').on && !s.worked);
  await doubleTap(K.control);
  check('… Control no longer opens it', !panelOpen());
  await doubleTap(K.shift);
  check('… Shift does', panelOpen() && (await state()).worked);
  await doubleTap(K.shift);

  // Step 3: open by itself
  tourWin().focus();
  await wait(300);
  await clickButton('nextBtn');
  s = await state();
  check('step 3: “Let it open by itself”, with the computer’s own words', s.step === 'step-auto' && (mac ? /your Mac/.test(s.lead) : /your PC/.test(s.lead)), s.lead);
  const labels = s.toggles.map((t) => `${t.label}:${t.on ? 'on' : 'off'}`);
  if (MODE === 'store') {
    check('Store copy: no login switch, a note on Windows’ own Startup settings instead', labels.length === 2 && s.storeNote, labels.join(', '));
  } else {
    check('switches show the current settings (TaskPop starts at login after installing)', labels.join(', ') === (mac
      ? 'When I open the lid:on, When I unlock the screen:on, Open TaskPop when I log in:on'
      : 'When my PC wakes up:on, When I unlock the screen:on, Start TaskPop with Windows:on'), labels.join(', '));
  }
  await wait(1200); // (its little panel fades in)
  await shot(tourWin(), `${tag}-3-auto.png`);
  await click(tourWin(), s.toggles[1]);
  await wait(300);
  check('turning one off saves it', json('settings.json').showOnUnlock === false && !(await state()).toggles[1].on);
  if (MODE !== 'store') {
    await click(tourWin(), (await state()).toggles[2]);
    await wait(300);
    check('the login switch changes the real login item', loginItem === false);
    await click(tourWin(), (await state()).toggles[2]);
    await wait(300);
  }

  // Step 4: using the list
  await clickButton('nextBtn');
  s = await state();
  check('step 4: “Using your list”, eight basics (categories and moving the panel too)', s.step === 'step-use' && s.howto.length === 8 && /^WorkClick a category at the top/.test(s.howto[4]) && /Drag the top of the panel/.test(s.howto[6]) && s.howto[0].endsWith(`Type a task and press ${mac ? 'Return' : 'Enter'} to add it`), s.howto[0]);
  await shot(tourWin(), `${tag}-4-use.png`);

  // Step 5: done
  await clickButton('nextBtn');
  s = await state();
  check('step 5: “You’re all set”, with the key you picked', s.step === 'step-done' && s.lead === `Double-tap ${mac ? '⇧ Shift' : 'Shift'} any time to open TaskPop. Your tasks stay on this ${mac ? 'Mac' : 'PC'}.`, s.lead);
  check('… and Back, Open Settings, Open TaskPop', s.buttons.backBtn && s.buttons.settingsBtn && s.buttons.nextBtn.text === 'Open TaskPop');
  await shot(tourWin(), `${tag}-5-done.png`);
  nativeTheme.themeSource = 'dark';
  await wait(400);
  await shot(tourWin(), `${tag}-5-done-dark.png`);
  await clickButton('backBtn');
  check('Back goes back a step', (await state()).step === 'step-use');
  nativeTheme.themeSource = 'dark';
  await shot(tourWin(), `${tag}-4-use-dark.png`);
  await clickButton('backBtn');
  await clickButton('backBtn');
  await shot(tourWin(), `${tag}-2-open-dark.png`);
  nativeTheme.themeSource = 'system';
  await clickButton('nextBtn');
  await clickButton('nextBtn');
  await clickButton('nextBtn');
  await clickButton('nextBtn');
  await wait(700);
  check('“Open TaskPop” closes the tour and opens the panel, ready to type', !tourWin() && panelOpen()
    && (await panelWin().webContents.executeJavaScript('document.activeElement && document.activeElement.id', true)) === 'newTask');
  check('the tour is marked as seen', json('meta.json').tourDone === true);

  // Again from Settings, and from the menu
  await panelWin().webContents.executeJavaScript('window.taskpop.openSettings()', true);
  await until(() => windowFor('settings.html') && !windowFor('settings.html').webContents.isLoading(), 6000);
  await wait(1200);
  const sw = windowFor('settings.html');
  const pos = await sw.webContents.executeJavaScript(`(() => { const b = document.getElementById('tourBtn'); b.scrollIntoView({ block: 'center' }); const r = b.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, label: b.closest('.row').querySelector('span').textContent }; })()`, true);
  await wait(200);
  await click(sw, pos);
  check('Settings → Help → “Show tour” opens it again from the start', await until(() => tourWin(), 4000) && (await (async () => { await wait(800); return (await state()).step; })()) === 'step-welcome', pos.label);
  tourWin().close();
  await wait(400);
  lastTray.emit('right-click');
  if (PLATFORM === 'darwin') lastTray.emit('click');
  await wait(300);
  const items = trayMenu ? trayMenu.items.map((i) => i.label).filter(Boolean) : [];
  check('the menu has “Welcome Tour…”', items.includes('Welcome Tour…'), items.join(' / '));
}
