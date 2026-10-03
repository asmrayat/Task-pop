// v1.6.4 pop-up, more cases: automatic checks off, a newer release, the panel's ×, Hide, Store copies.
// TaskPop 1.6.3 runs against a fake GitHub that has v1.6.4; buttons are clicked with real mouse
// input; the clock is moved forward to check "Update later" reminders.
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'win32';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Notification, systemPreferences, powerMonitor, nativeTheme } = electron;
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const SRC = process.env.TP_SRC || P.APP;
const OUT = process.env.TP_SHOTS || P.TMP + '/prompt-shots';
fs.mkdirSync(OUT, { recursive: true });
const tag = PLATFORM === 'win32' ? 'win' : 'mac';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[x:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
process.env.TP_DMG = process.env.TP_DMG || P.DMG;
process.env.TP_EXE = process.env.TP_EXE || P.EXE;

// A clock we can move forward (timers keep real time)
const realNow = Date.now;
let offset = 0;
Date.now = () => realNow() + offset;
const HOUR = 3600 * 1000;

// Windows: catch the hand-off to Setup
const cp = require('child_process');
const spawned = [];
const realSpawn = cp.spawn;
cp.spawn = (file, args, opts) => {
  if (!/Setup/i.test(String(file))) return realSpawn(file, args, opts);
  spawned.push({ file, args, sha: sha(fs.readFileSync(file)) });
  const child = new EventEmitter();
  child.unref = () => {};
  setTimeout(() => child.emit('spawn'), 10);
  return child;
};
// macOS: stand-ins for hdiutil / osascript / installer so the real admin script runs
const macPaths = { '/usr/bin/hdiutil': 'hdiutil', '/usr/bin/osascript': 'osascript', '/usr/sbin/installer': 'installer' };
const cleanStubs = () => { for (const d of Object.keys(macPaths)) fs.rmSync(d, { force: true }); fs.rmSync('/private', { recursive: true, force: true }); };
if (PLATFORM === 'darwin') {
  for (const [dest, name] of Object.entries(macPaths)) { fs.rmSync(dest, { force: true }); fs.symlinkSync(path.join(P.STUBS, name), dest); }
  fs.mkdirSync('/private/var/tmp', { recursive: true });
  for (const f of ['stub-cancel', 'stub-install-fail', 'installed-pkg.sha']) fs.rmSync(`${P.TMP}/${f}`, { force: true });
}

const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
if (PLATFORM === 'win32') require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
const U = require(`${SRC}/updater.js`);
app.getVersion = () => '1.6.3';
let quitCalls = 0;
let relaunched = null;
let appHides = 0;
app.quit = () => { quitCalls += 1; };
app.relaunch = (opts) => { relaunched = opts; };
app.hide = () => { appHides += 1; };
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
let lastTray = null;
const realTip = Tray.prototype.setToolTip;
Tray.prototype.setToolTip = function (t) { lastTray = this; return realTip.call(this, t); };
Tray.prototype.popUpContextMenu = function () {};
systemPreferences.getAccentColor = () => (PLATFORM === 'win32' ? '0078d4ff' : '0a84ffff');
const sent = [];
Notification.isSupported = () => true;
Notification.prototype.show = function () { sent.push(this.title); };

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const now = new Date();
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, lastVersion: '1.6.3', lastDay: `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}` }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ autoCheckUpdates: false }));
if (process.env.TP_STORE) process.windowsStore = true;
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [{ id: 'a', title: 'Send the proposal', done: false, createdAt: Date.now() }] }));
app.setPath('userData', UD);

const NOTES = [
  '- **Update pop-up**: when a new version is ready, TaskPop asks you: update now, or later.',
  '- Fixed: the Mac installer showed odd characters instead of quotes and symbols.',
].join('\r\n');
const gh = { mode: 'newer', newTag: 'v1.6.4', sameTag: 'v1.6.3', body: NOTES, publishedAt: '2026-10-02T12:00:00Z' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 10000) => {
  const end = realNow() + ms;
  while (realNow() < end) { if (await fn()) return true; await wait(100); }
  return false;
};
const windowFor = (file) => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith(file));
const promptWin = () => windowFor('update-prompt.html');
const panelWin = () => windowFor('index.html');
const meta = () => JSON.parse(fs.readFileSync(path.join(UD, 'meta.json'), 'utf8'));
const shot = async (win, name) => fs.writeFileSync(path.join(OUT, name), (await win.webContents.capturePage()).toPNG());

let fake;
const ready = require('./fake-github').start(gh).then((f) => {
  fake = f;
  U.config.api = `${f.base}/repos/asmrayat/Task-pop/releases/latest`;
  U.config.downloadPrefix = `${f.base}/releases/download/`;
});
require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  await ready;
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  if (PLATFORM === 'darwin') cleanStubs();
  console.log(`[x:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[x:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

async function ui(win = promptWin()) {
  return win.webContents.executeJavaScript(`(() => {
    const t = (id) => document.getElementById(id);
    const vis = (el) => !!el && el.offsetParent !== null && getComputedStyle(el).display !== 'none'; // what's really on screen
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; };
    return {
      title: t('title').textContent, lead: t('lead').textContent,
      notesTitle: vis(t('notesBox')) ? t('notesTitle').textContent : null, notes: t('notes').textContent,
      note: vis(t('note')) ? t('note').textContent : '', warn: t('note').classList.contains('warn'),
      later: vis(t('laterBtn')) ? t('laterBtn').textContent : null, now: vis(t('nowBtn')) ? t('nowBtn').textContent : null,
      close: vis(t('closeBtn')), progress: vis(t('progressBox')) ? t('progressText').textContent : null,
      cardHeight: Math.ceil(t('card').getBoundingClientRect().height), innerHeight,
      at: { later: r(t('laterBtn')), now: r(t('nowBtn')), close: r(t('closeBtn')) },
    };
  })()`, true);
}
async function click(win, point) {
  const send = (type) => win.webContents.sendInputEvent({ type, x: Math.round(point.x), y: Math.round(point.y), button: 'left', clickCount: 1 });
  send('mouseMove'); await wait(20); send('mouseDown'); await wait(40); send('mouseUp'); await wait(60);
}
async function press(win, keyCode) {
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode });
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode });
  await wait(80);
}
const waitPrompt = (ms = 10000) => until(() => promptWin() && promptWin().isVisible(), ms);
const waitClosed = (ms = 6000) => until(() => !promptWin(), ms);

async function run() {
  if (process.env.TP_STORE) {
    await wait(3000);
    await panelWin().webContents.executeJavaScript('window.taskpop.updateSetting("autoCheckUpdates", true)', true);
    await wait(40000);
    check('Microsoft Store copy: never asks GitHub and never shows the pop-up (the Store updates it)', !promptWin() && gh.hits === 0);
    return;
  }
  await wait(3000);
  // 1. Automatic checks off: no check, no pop-up
  await wait(30000);
  check('with “Check for updates automatically” off: no check and no pop-up', !promptWin() && gh.hits === 0);
  // 2. Turning it on checks right away and asks
  await panelWin().webContents.executeJavaScript('window.taskpop.updateSetting("autoCheckUpdates", true)', true);
  check('turning it on checks right away, and the pop-up appears', await waitPrompt(10000) && gh.hits === 1);
  let pw = promptWin();
  await wait(400);
  let s = await ui(pw);
  await click(pw, s.at.later);
  await waitClosed();

  // 3. A newer release while 1.6.4 is put off: asks about it straight away
  gh.newTag = 'v1.6.5';
  offset += 4 * HOUR + 10 * 60 * 1000; // the next background check is due
  powerMonitor.emit('suspend');
  powerMonitor.emit('resume'); // (TaskPop checks 15 s after waking)
  const asked = await waitPrompt(30000);
  pw = promptWin();
  await wait(400);
  s = pw ? await ui(pw) : {};
  check('a newer release (1.6.5) is announced right away, even though 1.6.4 was put off', asked && s.lead === 'TaskPop 1.6.5 is ready to install. You have 1.6.3.', s.lead);

  // 4. × on the panel's update bar = "Update later" (and the pop-up goes)
  lastTray.emit('click');
  await wait(800);
  const panel = panelWin();
  if (!panel.isVisible()) { lastTray.emit('click'); await wait(800); }
  await panel.webContents.executeJavaScript(`document.getElementById('updateClose').click()`, true);
  const closed = await waitClosed(3000);
  const p = meta().updatePrompt;
  check('× on the panel’s update bar also means “later” (pop-up closes, asks again in 4 hours)', closed && p.version === '1.6.5' && Math.abs(p.remindAt - (Date.now() + 4 * HOUR)) < 60000);
  await panel.webContents.executeJavaScript('window.taskpop.hide()', true);

  // 5. Update now → Hide: the pop-up goes, the update carries on
  gh.chunkDelay = 80; // a slower download, so there's time to press Hide
  offset += 4 * HOUR + 60 * 1000;
  check('… and does ask again 4 hours later', await waitPrompt(40000));
  pw = promptWin();
  await wait(400);
  s = await ui(pw);
  await click(pw, s.at.now);
  await until(async () => { try { return (await ui(pw)).later === 'Hide'; } catch (_) { return false; } }, 10000);
  s = await ui(pw);
  await click(pw, s.at.later);
  const hid = await waitClosed(3000);
  if (PLATFORM === 'win32') await until(() => spawned.length > 0, 30000);
  else await until(() => relaunched, 40000);
  await wait(700); // (TaskPop closes 0.3 s after handing over to Setup)
  check('“Hide” during the download closes the pop-up and the update still finishes', hid && (PLATFORM === 'win32' ? spawned.length === 1 && quitCalls === 1 : !!relaunched), `hid ${hid}, spawned ${spawned.length}, quit ${quitCalls}, ui ${JSON.stringify(s && { t: s.title, l: s.later, p: s.progress })}`);
  check('… and hiding it isn’t “later” (no reminder saved for 1.6.5 after that)', meta().updatePrompt.remindAt < Date.now());
}
