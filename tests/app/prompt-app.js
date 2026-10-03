// v1.6.4: the "New update is here" pop-up, end to end in the real main process (TP_PLATFORM).
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
  console.log(`[p:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
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
  console.log(`[p:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[p:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
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
  await wait(3000);
  check('no pop-up in the first seconds (it waits for the first check)', !promptWin() && gh.hits === 0);

  // 1. The background check finds 1.6.4 and the pop-up appears
  const appeared = await waitPrompt(35000);
  let pw = promptWin();
  check('the automatic check finds 1.6.4 and the pop-up appears on screen', appeared && gh.hits === 1);
  check('… instead of a notification (not both)', sent.length === 0, sent.join(' | '));
  check('… without taking the keyboard from what you were typing in', pw && !pw.isFocused());
  await wait(500);
  let s = await ui(pw);
  check('it says “New update is here” and which version', s.title === 'New update is here' && s.lead === 'TaskPop 1.6.4 is ready to install. You have 1.6.3.', s.lead);
  check('… with what’s new from the release notes', s.notesTitle === 'What’s new in 1.6.4' && /Update pop-up: when a new version is ready/.test(s.notes) && !/\*\*/.test(s.notes));
  check('… and two buttons: “Update later” and “Update now”', s.later === 'Update later' && s.now === 'Update now' && s.close);
  const b = pw.getBounds();
  check('the window fits the pop-up exactly (nothing cut off)', Math.abs(b.height - s.cardHeight) <= 1 && s.innerHeight >= s.cardHeight, `${b.height} vs ${s.cardHeight}`);
  check('it stays on top of other windows', pw.isAlwaysOnTop());
  await shot(pw, `${tag}-prompt-light.png`);
  nativeTheme.themeSource = 'dark';
  await wait(500);
  await shot(pw, `${tag}-prompt-dark.png`);
  nativeTheme.themeSource = 'system';
  await wait(300);

  // 2. Update later → "we'll remind you", closes, and is saved for 4 hours
  await click(pw, s.at.later);
  await wait(300);
  s = await ui(pw);
  check('“Update later” says when it will ask again', s.title === 'OK, we’ll remind you later' && /ask again in 4 hours/.test(s.lead), s.lead);
  await shot(pw, `${tag}-prompt-later.png`);
  check('… then the pop-up closes by itself', await waitClosed());
  const snooze = meta().updatePrompt;
  check('… and the reminder is saved (4 hours from now, for 1.6.4)', snooze && snooze.version === '1.6.4' && Math.abs(snooze.remindAt - (Date.now() + 4 * HOUR)) < 60000);

  // 3. Not again before its time
  powerMonitor.emit('lock-screen');
  powerMonitor.emit('unlock-screen');
  await wait(5500);
  check('it doesn’t come back before the 4 hours are up', !promptWin());

  // 4. 4 hours later it asks again (the regular 30 s check)
  offset += 4 * HOUR + 60 * 1000;
  check('4 hours later it asks again by itself', await waitPrompt(40000));
  pw = promptWin();
  await wait(400);

  // 5. × and Esc also mean "later"
  s = await ui(pw);
  await click(pw, s.at.close);
  check('× works like “Update later”', await waitClosed() && meta().updatePrompt.remindAt > Date.now() + 3.9 * HOUR);
  offset += 4 * HOUR + 60 * 1000;
  check('… and it asks again after another 4 hours', await waitPrompt(40000));
  pw = promptWin();
  await wait(400);
  pw.focus();
  pw.webContents.focus();
  await wait(200);
  await press(pw, 'Escape');
  check('Esc works like “Update later” too', await waitClosed());

  // 6. Locked screen: it waits until you're back
  offset += 4 * HOUR + 60 * 1000;
  powerMonitor.emit('lock-screen');
  await wait(32000);
  check('while the screen is locked it doesn’t pop up', !promptWin());
  powerMonitor.emit('unlock-screen');
  check('… and appears a moment after you unlock', await waitPrompt(8000));
  pw = promptWin();
  await wait(400);

  // 7. Mac: while the pop-up is up, closing the panel doesn't hide TaskPop's windows
  if (PLATFORM === 'darwin') {
    lastTray.emit('click');
    await wait(700);
    const hidesBefore = appHides;
    await panelWin().webContents.executeJavaScript('window.taskpop.hide()', true);
    await wait(700);
    check('Mac: closing the panel keeps the pop-up on screen', appHides === hidesBefore && promptWin() && promptWin().isVisible());
  }

  // 8. A download that fails its safety check → "didn't finish" + Try again
  gh.mode = 'bad-digest';
  s = await ui(pw);
  await click(pw, s.at.now);
  await until(async () => (await ui(pw)).warn, 20000);
  s = await ui(pw);
  check('a bad download: “The update didn’t finish”, with Update later / Try again', s.title === 'The update didn’t finish' && /didn’t pass its safety check/.test(s.note) && s.now === 'Try again' && s.later === 'Update later', s.note);
  await shot(pw, `${tag}-prompt-failed.png`);

  // 9. Try again → progress in the pop-up → installer
  gh.mode = 'newer';
  const seen = [];
  const watch = setInterval(async () => { try { const x = await ui(pw); if (x.progress !== null) seen.push(`${x.title}|${x.lead}|${x.progress}|${x.later}`); } catch (_) { /* closed */ } }, 40);
  await click(pw, s.at.now);
  if (PLATFORM === 'win32') await until(() => spawned.length > 0, 30000);
  else await until(() => relaunched, 40000);
  await wait(500);
  clearInterval(watch);
  const dl = seen.find((x) => /^Updating TaskPop\|Downloading version 1\.6\.4…\|\d+%\|Hide$/.test(x));
  check('“Update now” shows the download in the pop-up (with a Hide button)', !!dl, dl || seen.slice(-1)[0]);
  if (PLATFORM === 'win32') {
    check('… then Setup starts in update mode with the release’s file, and TaskPop closes', spawned.length === 1 && spawned[0].sha === fake.sha(fake.EXE) && JSON.stringify(spawned[0].args) === '["/UPDATE"]' && quitCalls === 1);
    s = await ui(pw);
    check('… the pop-up says “TaskPop will close and reopen in a moment.”', s.title === 'Installing TaskPop 1.6.4' && s.lead === 'TaskPop will close and reopen in a moment.' && s.later === null && !s.close, s.lead);
    await shot(pw, `${tag}-prompt-installing.png`);
  } else {
    check('… then the macOS password prompt installs it, and TaskPop restarts', fs.existsSync(P.TMP + '/installed-pkg.sha') && relaunched && quitCalls === 1);
    check('… with the pop-up out of the way of the password prompt', await waitClosed(3000));
  }
}
