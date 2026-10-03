// Present as macOS so the Mac code paths run.
const P = require('../paths');
Object.defineProperty(process, 'platform', { value: 'darwin' });
// Electron's macOS-only menu binding doesn't exist on Linux; the menu itself isn't under test.
require('electron').Menu.setApplicationMenu = () => {};
// Runs the real TaskPop 1.4 main process on Linux with a simulated macOS key source.
const { app, Tray, BrowserWindow, systemPreferences, clipboard } = require('electron');
app.commandLine.appendSwitch('use-fake-device-for-media-stream'); // a microphone exists, so only permission can stop it
const fs = require('fs');
const path = require('path');

// normal | blocked | events (v1.6.8: key events, checks see nothing)
// | stale (v1.6.8: the keys can be read but macOS no longer recognises TaskPop, e.g. after an update)
const MODE = process.env.TP_MODE || 'normal';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`[a] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// Simulated keyboard state that the app polls.
const kb = { flags: 0, activity: 100, accessRequested: 0, listener: null, allowed: MODE !== 'stale' };
const dt = require(P.APP + '/doubletap.js');
dt.createKeySource = () => ({
  flags: () => (MODE === 'normal' || MODE === 'stale' ? kb.flags : 0),
  activity: () => (MODE === 'normal' || MODE === 'stale' ? kb.activity : 0),
  hasAccess: () => MODE !== 'blocked' && kb.allowed,
  requestAccess: () => { kb.accessRequested += 1; if (MODE === 'stale') kb.allowed = true; return MODE === 'stale'; },
  // events / stale: macOS hands TaskPop each key change (createMacEventTap), once it's allowed to
  listen: MODE === 'events' || MODE === 'stale'
    ? (fn) => { if (!kb.allowed) return null; kb.listener = fn; return () => { kb.listener = null; }; }
    : undefined,
});
const shownNotices = [];
if (MODE === 'stale') {
  const { Notification } = require('electron');
  Notification.isSupported = () => true;
  Notification.prototype.show = function () { shownNotices.push(this.title); };
  // an earlier version was in use before this launch: this is the first start after an update
  fs.mkdirSync(process.env.TP_USERDATA, { recursive: true });
  fs.writeFileSync(path.join(process.env.TP_USERDATA, 'meta.json'), JSON.stringify({ firstRunDone: true, tourDone: true, lastVersion: '1.6.7' }));
}
const setFlags = (flags) => {
  kb.flags = flags;
  if (kb.listener) kb.listener('modifiers', flags);
};
const press = () => {
  kb.activity += 1;
  if (kb.listener) kb.listener('press', kb.flags);
};

if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
Tray.prototype.popUpContextMenu = Tray.prototype.popUpContextMenu || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
app.setPath('userData', process.env.TP_USERDATA);
require(P.APP + '/main.js');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const K = dt.KEY_MASKS;
async function tap(mask, hold = 80) {
  setFlags(kb.flags | mask); await wait(hold); setFlags(kb.flags & ~mask);
}
async function doubleTap(mask) {
  await tap(mask); await wait(150); await tap(mask); await wait(250);
}
async function shortcutCombo(mask) { // e.g. ⌘C
  setFlags(kb.flags | mask); await wait(60); press(); await wait(100); setFlags(kb.flags & ~mask);
}
async function copyReport(sw) {
  await sw.webContents.executeJavaScript(`document.getElementById('reportBtn').click()`, true);
  await wait(400);
  return { text: String(await clipboard.readText()), button: await sw.webContents.executeJavaScript(`document.getElementById('reportBtn').textContent`, true) };
}
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const settingsWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('settings.html'));
const visible = () => panelWin().isVisible() && panelWin().getOpacity() > 0.5;

app.whenReady().then(async () => {
  await wait(3500);
  const panel = panelWin();
  panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });

  if (MODE === 'normal') {
    // Opened by hand, TaskPop shows itself once at start; close it before testing.
    if (visible()) { await panel.webContents.executeJavaScript(`window.taskpop.hide()`, true); await wait(500); }
    check('panel is closed before the test', !visible());
    await doubleTap(K.control);
    check('double-tap ⌃ Control opens TaskPop', visible());
    check('cursor is in "Add a task"', await panel.webContents.executeJavaScript(`document.activeElement && document.activeElement.id === 'newTask'`, true));
    panel.focus();
    await doubleTap(K.control);
    await wait(300);
    check('double-tap again closes it', !visible());

    await shortcutCombo(K.control); await wait(120); await shortcutCombo(K.control); await wait(400);
    check('⌃C ⌃V does not open it', !visible());
    await tap(K.control); await wait(700); await tap(K.control); await wait(400);
    check('two taps 0.7 s apart do not open it', !visible());

    // Switch the key in Settings
    await panel.webContents.executeJavaScript(`document.getElementById('settingsBtn').click()`, true);
    await wait(2000);
    const sw = settingsWin();
    sw.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('settings: ' + e.message); });
    const sjs = (c) => sw.webContents.executeJavaScript(c, true);
    check('Settings shows the Control choice', (await sjs(`document.getElementById('doubleTapKey').value`)) === 'control');
    await sjs(`(() => { const s = document.getElementById('doubleTapKey'); s.value = 'command'; s.dispatchEvent(new Event('change')); })()`);
    await wait(400);
    await doubleTap(K.control);
    check('after choosing ⌘ Command, ⌃ Control no longer opens it', !visible());
    await doubleTap(K.command);
    check('double-tap ⌘ Command opens it', visible());
    await sjs(`(() => { const s = document.getElementById('doubleTapKey'); s.value = 'off'; s.dispatchEvent(new Event('change')); })()`);
    await wait(300);
    panel.webContents.executeJavaScript(`window.taskpop.hide()`, true);
    await wait(500);
    await doubleTap(K.command);
    check('Off: double-tap does nothing', !visible());
    const saved = JSON.parse(fs.readFileSync(path.join(process.env.TP_USERDATA, 'settings.json'), 'utf8'));
    check('choice is saved', saved.doubleTapKey === 'off');
    await sjs(`(() => { const s = document.getElementById('doubleTapKey'); s.value = 'control'; s.dispatchEvent(new Event('change')); })()`);
    await wait(300);

    // Self-check through key presses in the Settings window
    kb.flags |= K.control;
    sw.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Control' });
    await wait(80);
    sw.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Control' });
    kb.flags &= ~K.control;
    kb.activity += 1;
    sw.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A' });
    sw.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A' });
    await wait(500);
    const status = await sjs(`document.getElementById('doubleTapStatus').textContent`);
    check('Settings confirms double-tap is working', status === 'Working', status);
    await sjs(`document.querySelector('.content').scrollTop = 0`);
    await wait(200);
    fs.writeFileSync(P.SHOTS + '/dt-settings-working.png', (await sw.webContents.capturePage()).toPNG());

    // "Hey Siri, open TaskPop" (macOS re-opens the running app)
    panel.webContents.executeJavaScript(`window.taskpop.hide()`, true);
    await wait(500);
    app.emit('activate');
    await wait(500);
    check('re-opening the app (Siri / Spotlight) shows the tasks', visible());

    const mic = await panel.webContents.executeJavaScript(`navigator.mediaDevices.getUserMedia({ audio: true }).then(s => { s.getTracks().forEach(t => t.stop()); return 'granted'; }, e => e.name)`, true);
    check('TaskPop cannot use the microphone at all', mic === 'NotAllowedError', mic);
    check('no voice window exists', BrowserWindow.getAllWindows().every((w) => !w.webContents.getURL().startsWith('taskpop://')));

    // v1.6.8: Settings → Help → Double-tap report
    const r = await copyReport(sw);
    check('Help → Copy report puts the double-tap report on the clipboard', /^TaskPop [\d.]+ double-tap report/.test(r.text) && r.button === 'Copied', r.text.split('\n')[0]);
    check('…saying what it listens by, the key and the status', /Key: control · status: working · listening by: checks/.test(r.text), r.text.split('\n')[2]);
    check('…and the tap counts and check timings', /Taps: \d+ seen, [1-9]\d* double-taps/.test(r.text) && /slowest gap in the last minute \d+ ms/.test(r.text) && /App Nap opt-out: off/.test(r.text));
    check('the report says it holds no keys, and has no key names in it', /never which keys were pressed/.test(r.text) && !/\b[A-Z]\b|keyCode/.test(r.text.replace(/TaskPop|macOS|App Nap|Input Monitoring|Key|Checks|Taps|Only/g, '')));
    console.log('[a] report:\n' + r.text.split('\n').map((l) => '      ' + l).join('\n'));
    await sjs(`document.getElementById('reportBtn').scrollIntoView({ block: 'center' })`);
    await wait(300);
    fs.writeFileSync(P.SHOTS + '/dt-settings-report.png', (await sw.webContents.capturePage()).toPNG());
  } else if (MODE === 'stale') {
    if (visible()) { await panel.webContents.executeJavaScript(`window.taskpop.hide()`, true); await wait(500); }
    await doubleTap(K.control);
    check('without the Input Monitoring OK the double-tap still works by checking the keys', visible());
    panel.focus();
    await doubleTap(K.control);
    await wait(3500); // past the 6 s after start
    check('after an update, TaskPop says once that macOS needs the OK again', shownNotices.length === 1 && /Allow TaskPop again/.test(shownNotices[0]), shownNotices.join(' | '));
    await panel.webContents.executeJavaScript(`document.getElementById('settingsBtn').click()`, true);
    await wait(2000);
    const sw = settingsWin();
    const sjs = (c) => sw.webContents.executeJavaScript(c, true);
    const status = await sjs(`document.getElementById('doubleTapStatus').textContent`);
    check('Settings explains it, with Allow and Restart', /Allow TaskPop again/.test(status)
      && await sjs(`!document.getElementById('doubleTapAllow').hidden && !document.getElementById('doubleTapRestart').hidden`)
      && await sjs(`document.getElementById('doubleTapDot').className.includes('amber')`), status);
    let r = await copyReport(sw);
    check('the report shows it: not allowed, listening by checks', /Input Monitoring allowed: no/.test(r.text) && /listening by: checks/.test(r.text) && /status: limited/.test(r.text));
    await sjs(`document.querySelector('.content').scrollTop = 0`);
    await wait(200);
    fs.writeFileSync(P.SHOTS + '/dt-settings-limited.png', (await sw.webContents.capturePage()).toPNG());
    await sjs(`document.getElementById('doubleTapAllow').click()`);
    await wait(5800); // TaskPop looks again every 5 s
    r = await copyReport(sw);
    check('once allowed, TaskPop starts listening for key events by itself', /listening by: events/.test(r.text) && /Input Monitoring allowed: yes/.test(r.text), r.text.split('\n')[2]);
    check('…and Settings shows the double-tap working', (await sjs(`document.getElementById('doubleTapStatus').textContent`)) === 'Working');
    check('the notice isn\'t shown again', shownNotices.length === 1);
  } else if (MODE === 'events') {
    // v1.6.8: the key-event path through the whole app. The checks see no keys at all here, so
    // only the events can open TaskPop (as when its checks run late in the background).
    if (visible()) { await panel.webContents.executeJavaScript(`window.taskpop.hide()`, true); await wait(500); }
    check('panel is closed before the test', !visible());
    await doubleTap(K.control);
    check('a double-tap delivered as key events opens TaskPop', visible());
    panel.focus();
    await doubleTap(K.control);
    await wait(300);
    check('…and the next one closes it', !visible());
    await shortcutCombo(K.control); await wait(120); await shortcutCombo(K.control); await wait(400);
    check('⌃C ⌃V as key events does not open it', !visible());
    await tap(K.control); await wait(700); await tap(K.control); await wait(400);
    check('two taps 0.7 s apart do not open it', !visible());
    await panel.webContents.executeJavaScript(`document.getElementById('settingsBtn').click()`, true);
    await wait(2000);
    const sw = settingsWin();
    const r = await copyReport(sw);
    check('the report says TaskPop listens by key events', /listening by: events/.test(r.text), r.text.split('\n')[2]);
    check('…and counts the events and taps', /Key events: [1-9]\d* received, last \d+ s ago, paused 0 times, back to checks 0 times/.test(r.text) && /2 double-taps/.test(r.text), r.text);
    console.log('[a] report:\n' + r.text.split('\n').map((l) => '      ' + l).join('\n'));
  } else {
    // macOS hides key state (Input Monitoring not allowed)
    await panel.webContents.executeJavaScript(`document.getElementById('settingsBtn').click()`, true);
    await wait(2000);
    const sw = settingsWin();
    const sjs = (c) => sw.webContents.executeJavaScript(c, true);
    for (let i = 0; i < 2; i += 1) {
      sw.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Control' });
      await wait(80);
      sw.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Control' });
      await wait(150);
    }
    sw.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A' });
    sw.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A' });
    await wait(500);
    const status = await sjs(`document.getElementById('doubleTapStatus').textContent`);
    check('blocked state is detected and shown', status === 'macOS is blocking the double-tap', status);
    check('Allow and Restart buttons shown', await sjs(`!document.getElementById('doubleTapAllow').hidden && !document.getElementById('doubleTapRestart').hidden`));
    await sjs(`document.getElementById('doubleTapAllow').click()`);
    await wait(300);
    check('Allow asks macOS for permission', kb.accessRequested === 1);
    await sjs(`document.querySelector('.content').scrollTop = 0`);
    await wait(200);
    fs.writeFileSync(P.SHOTS + '/dt-settings-blocked.png', (await sw.webContents.capturePage()).toPNG());
  }

  console.log(`[a] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log('[a] errors:', errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});
