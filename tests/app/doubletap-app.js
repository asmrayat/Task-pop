// Present as macOS so the Mac code paths run.
const P = require('../paths');
Object.defineProperty(process, 'platform', { value: 'darwin' });
// Electron's macOS-only menu binding doesn't exist on Linux; the menu itself isn't under test.
require('electron').Menu.setApplicationMenu = () => {};
// Runs the real TaskPop 1.4 main process on Linux with a simulated macOS key source.
const { app, Tray, BrowserWindow, systemPreferences } = require('electron');
app.commandLine.appendSwitch('use-fake-device-for-media-stream'); // a microphone exists, so only permission can stop it
const fs = require('fs');
const path = require('path');

const MODE = process.env.TP_MODE || 'normal'; // normal | blocked
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`[a] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// Simulated keyboard state that the app polls.
const kb = { flags: 0, activity: 100, accessRequested: 0 };
const dt = require(P.APP + '/doubletap.js');
dt.createKeySource = () => ({
  flags: () => (MODE === 'blocked' ? 0 : kb.flags),
  activity: () => (MODE === 'blocked' ? 0 : kb.activity),
  hasAccess: () => MODE !== 'blocked',
  requestAccess: () => { kb.accessRequested += 1; return false; },
});

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
  kb.flags |= mask; await wait(hold); kb.flags &= ~mask;
}
async function doubleTap(mask) {
  await tap(mask); await wait(150); await tap(mask); await wait(250);
}
async function shortcutCombo(mask) { // e.g. ⌘C
  kb.flags |= mask; await wait(60); kb.activity += 1; await wait(100); kb.flags &= ~mask;
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
