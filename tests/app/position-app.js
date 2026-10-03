// v1.6.6: drag the panel anywhere by its top bar; it opens there next time. Real main process,
// real mouse input on the panel (TP_PLATFORM=win32|darwin). Run with a 1600x1000 screen.
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'win32';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Notification, systemPreferences, screen } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const OUT = P.TMP + '/position-shots';
fs.mkdirSync(OUT, { recursive: true });
const tag = PLATFORM === 'win32' ? 'win' : 'mac';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[m:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const kb = { flags: 0, activity: 100 };
const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => kb.flags, activity: () => kb.activity, hasAccess: () => true, requestAccess: () => true });
if (PLATFORM === 'win32') require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
app.getVersion = () => '1.6.6';
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};
const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.rmSync(UD, { recursive: true, force: true });
fs.mkdirSync(UD, { recursive: true });
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, tourDone: true, lastVersion: '1.6.6' }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ keepOpen: true }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [{ id: 'a', title: 'Send the proposal', done: false, createdAt: Date.now() }] }));
app.setPath('userData', UD);
process.argv.push('--show');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(60); } return false; };
const windowFor = (file) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith(file));
const json = (f) => JSON.parse(fs.readFileSync(path.join(UD, f), 'utf8'));
let panel;
let js;

require(`${SRC}/main.js`);
app.whenReady().then(async () => {
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  console.log(`[m:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[m:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

// Real mouse input through the X server (xdotool): real button state, real pointer position.
const { execFileSync } = require('child_process');
const xdo = (...args) => execFileSync('xdotool', args.map(String));
function mouseAt(type, gx, gy) {
  xdo('mousemove', Math.round(gx), Math.round(gy));
  if (type === 'mouseDown') xdo('mousedown', 1);
  if (type === 'mouseUp') xdo('mouseup', 1);
}
/** Press on the top bar (title area), move by (dx, dy) in steps, release. */
async function dragBy(dx, dy, { steps = 16, beforeRelease } = {}) {
  const b = panel.getBounds();
  const gx = b.x + 60;
  const gy = b.y + 26; // on "Tasks"
  mouseAt('mouseMove', gx, gy); await wait(40);
  mouseAt('mouseDown', gx, gy); await wait(40);
  const mid = [];
  for (let i = 1; i <= steps; i += 1) {
    mouseAt('mouseMove', gx + (dx * i) / steps, gy + (dy * i) / steps);
    await wait(24);
    if (i === Math.floor(steps / 2)) { await wait(40); mid.push(panel.getBounds()); }
  }
  await wait(80);
  if (beforeRelease) await beforeRelease();
  mouseAt('mouseUp', gx + dx, gy + dy);
  await wait(PLATFORM === 'darwin' ? 500 : 300);
  return { start: b, mid: mid[0], end: panel.getBounds() };
}
const visible = () => panel.isVisible() && panel.getOpacity() > 0.5;
async function reopen() {
  await js('window.taskpop.hide()');
  await until(() => !panel.isVisible(), 3000);
  await wait(200);
  kb.flags |= dt.KEY_MASKS.control; await wait(80); kb.flags &= ~dt.KEY_MASKS.control; await wait(120);
  kb.flags |= dt.KEY_MASKS.control; await wait(80); kb.flags &= ~dt.KEY_MASKS.control;
  await until(visible, 3000);
  await wait(500); // the slide-in
  return panel.getBounds();
}

async function run() {
  await wait(3500);
  panel = windowFor('index.html');
  js = (c) => panel.webContents.executeJavaScript(c, true);
  const wa = screen.getPrimaryDisplay().workArea;
  let b = panel.getBounds();
  const cornerX = wa.x + wa.width - b.width - 10;
  check(`starts in its usual corner (${PLATFORM === 'darwin' ? 'top' : 'bottom'} right)`, b.x === cornerX && (PLATFORM === 'darwin' ? b.y === wa.y + 10 : b.y + b.height === wa.y + wa.height - 10), JSON.stringify(b));
  const cursors = await js(`({ header: getComputedStyle(document.querySelector('header')).cursor, button: getComputedStyle(document.getElementById('pinBtn')).cursor })`);
  check('the top bar shows a grab cursor (its buttons don’t)', cursors.header === 'grab' && cursors.button === 'default', JSON.stringify(cursors));

  // 1. Drag it somewhere
  const r = await dragBy(-600, 120);
  check('dragging the top bar moves the panel along with the pointer', r.mid && Math.abs((r.mid.x - r.start.x) - -300) <= 40 && Math.abs((r.mid.y - r.start.y) - 60) <= 40, `half-way moved ${r.mid && r.mid.x - r.start.x}, ${r.mid && r.mid.y - r.start.y}`);
  check('… and it stays where you let go', Math.abs(r.end.x - (r.start.x - 600)) <= 2 && Math.abs(r.end.y - (r.start.y + 120)) <= 2, JSON.stringify(r.end));
  let st = json('settings.json');
  check('the spot is saved (position: custom)', st.position === 'custom' && st.customSpot && Math.abs(st.customSpot.dx - (r.end.x - wa.x)) <= 2, JSON.stringify(st.customSpot));
  fs.writeFileSync(path.join(OUT, `${tag}-moved.png`), (await panel.webContents.capturePage()).toPNG());

  // 2. Next time it opens there
  b = await reopen();
  check('closed and opened again (double-tap): it opens in the same spot', Math.abs(b.x - r.end.x) <= 2 && Math.abs(b.y - r.end.y) <= 2, JSON.stringify(b));

  // 3. Snap to an edge
  const toLeft = await dragBy(-(b.x - wa.x) + 12, 0);
  check('dropped near the left edge, it lines up with the edge', toLeft.end.x === wa.x + 10, `x ${toLeft.end.x}`);
  // 4. Off the screen: pulled back
  const off = await dragBy(wa.width, 0);
  check('dragged past the right edge, it comes back fully on screen', off.end.x + off.end.width <= wa.x + wa.width && off.end.x >= wa.x + wa.width - off.end.width - 10, JSON.stringify(off.end));
  // 5. Low down: shorter, still on screen
  const top = panel.getBounds();
  const low = await dragBy(-300, wa.y + wa.height - top.y - 420);
  check('moved low down, it gets shorter so it still fits (not below 360 px)', low.end.y + low.end.height <= wa.y + wa.height && low.end.height >= 360 && low.end.height < top.height, `h ${low.end.height} at y ${low.end.y}`);
  const lower = await dragBy(0, 400);
  check('… and can’t be pushed off the bottom', lower.end.y + lower.end.height <= wa.y + wa.height && lower.end.height >= 360, `h ${lower.end.height} at y ${lower.end.y}`);
  fs.writeFileSync(path.join(OUT, `${tag}-low.png`), (await panel.webContents.capturePage()).toPNG());

  // 6. Clicks on the top bar
  const before = panel.getBounds();
  const pin = await js(`(() => { const r = document.getElementById('pinBtn').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
  const keep = json('settings.json').keepOpen;
  mouseAt('mouseMove', before.x + pin.x, before.y + pin.y); await wait(40); mouseAt('mouseDown', before.x + pin.x, before.y + pin.y); await wait(40); mouseAt('mouseUp', before.x + pin.x, before.y + pin.y); await wait(300);
  check('the buttons in the top bar still work (pin)', json('settings.json').keepOpen === !keep && JSON.stringify(panel.getBounds()) === JSON.stringify(before));
  mouseAt('mouseDown', before.x + pin.x, before.y + pin.y); await wait(40); mouseAt('mouseUp', before.x + pin.x, before.y + pin.y); await wait(300); // pin it again
  mouseAt('mouseMove', before.x + 60, before.y + 26); await wait(40); mouseAt('mouseDown', before.x + 60, before.y + 26); await wait(40); mouseAt('mouseMove', before.x + 61, before.y + 27); mouseAt('mouseUp', before.x + 61, before.y + 27); await wait(300);
  check('a click on the title without dragging doesn’t move it', JSON.stringify(panel.getBounds()) === JSON.stringify(before));

  // 7. Esc while dragging puts it back
  const spot = json('settings.json').customSpot;
  await dragBy(-200, -100, { beforeRelease: async () => { panel.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); await wait(150); } });
  check('Esc while dragging puts it back where it was', JSON.stringify(panel.getBounds()) === JSON.stringify(before) && JSON.stringify(json('settings.json').customSpot) === JSON.stringify(spot));
  check('… and the panel stays open', visible());

  // 8. Settings: Left / Right / Custom
  await js('window.taskpop.openSettings()');
  await until(() => windowFor('settings.html') && !windowFor('settings.html').webContents.isLoading(), 6000);
  await wait(1500);
  const sw = windowFor('settings.html');
  const seg = () => sw.webContents.executeJavaScript(`({ active: [...document.querySelectorAll('[data-setting="position"] button')].filter((b) => b.classList.contains('active')).map((b) => b.textContent).join(), custom: !document.getElementById('positionCustom').disabled, hint: document.getElementById('positionHint').textContent })`, true);
  let s = await seg();
  check('Settings → Position shows “Custom”', s.active === 'Custom' && s.custom && /Where you put it/.test(s.hint), `${s.active} | ${s.hint}`);
  await sw.webContents.executeJavaScript(`document.querySelector('[data-setting="position"] [data-value="right"]').click()`, true);
  await wait(PLATFORM === 'darwin' ? 600 : 300);
  b = panel.getBounds();
  check('choosing Right puts it back in the corner', b.x === wa.x + wa.width - b.width - 10 && (await seg()).active === 'Right');
  await sw.webContents.executeJavaScript(`document.querySelector('[data-setting="position"] [data-value="custom"]').click()`, true);
  await wait(PLATFORM === 'darwin' ? 600 : 300);
  b = panel.getBounds();
  check('choosing Custom brings it back to your spot', Math.abs(b.x - before.x) <= 2 && Math.abs(b.y - before.y) <= 2, JSON.stringify(b));
  sw.webContents.executeJavaScript(`(() => { const r = document.getElementById('widthRange'); r.scrollIntoView({ block: 'center' }); })()`, true);
  await wait(300);
  fs.writeFileSync(path.join(OUT, `${tag}-settings.png`), (await sw.webContents.capturePage()).toPNG());

  // 9. Wider panel near the right edge stays on screen
  await dragBy(wa.width, 0);
  await js('window.taskpop.updateSetting("width", 480)');
  await wait(PLATFORM === 'darwin' ? 600 : 300);
  b = panel.getBounds();
  check('making it wider near the right edge keeps it on screen', b.width === 480 && b.x + b.width <= wa.x + wa.width, JSON.stringify(b));

  // 10. The screen it was on is gone (unplugged monitor): it opens on this one, on screen
  await js(`window.taskpop.updateSetting("customSpot", { displayId: 987654, dx: 5000, dy: 3000 })`);
  b = await reopen();
  check('if its screen was unplugged, it opens on this screen, fully visible', b.x >= wa.x && b.x + b.width <= wa.x + wa.width && b.y >= wa.y && b.y + b.height <= wa.y + wa.height, JSON.stringify(b));
}
