// TaskPop 1.6 "Add to Google Calendar", run on the real main process as Windows or macOS
// (TP_PLATFORM=win32|darwin). The browser hand-off is captured instead of opening a browser.
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'win32';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Menu, Notification, systemPreferences, shell, nativeTheme } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const OUT = P.SHOTS;
fs.mkdirSync(OUT, { recursive: true });
const tag = `${PLATFORM === 'win32' ? 'win' : 'mac'}${process.env.TP_DARK ? '-dark' : ''}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[c:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none'; // no update checks in this test
app.getVersion = () => '1.6.0';
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};
const opened = [];
shell.openExternal = async (url) => { opened.push(url); };
let lastMenu = null;
const realBuild = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = (tpl) => { const m = realBuild(tpl); m.popup = () => { lastMenu = tpl; }; return m; };

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const now = Date.now();
const task = (id, title, extra = {}) => ({ id, title, done: false, createdAt: now, important: false, repeat: 'none', remindAt: null, reminded: false, ...extra });
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, lastVersion: '1.6.0' }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [
  task('adam', 'Meeting with Adam'),
  task('bank', 'Call the bank Fri 10:30 for 30 min'),
  task('report', 'Submit report Friday'),
  task('standup', 'Standup', { repeat: 'daily' }),
  task('done', 'Old finished task', { done: true, completedAt: now }),
] }));
app.setPath('userData', UD);
process.argv.push('--show');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 8000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(80); } return false; };
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const settingsWin = () => BrowserWindow.getAllWindows().find((w) => !w.isDestroyed() && w.webContents.getURL().endsWith('settings.html'));
const clickMenu = (label) => { const item = lastMenu && lastMenu.find((i) => i.label === label); if (!item) throw new Error(`no menu item ${label}`); item.click(item); };
const readTasks = () => JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks;
const params = (url) => Object.fromEntries(new URL(url).searchParams.entries());
const two = (n) => String(n).padStart(2, '0');
const utc = (d) => `${d.getUTCFullYear()}${two(d.getUTCMonth() + 1)}${two(d.getUTCDate())}T${two(d.getUTCHours())}${two(d.getUTCMinutes())}00Z`;
const nextWeekday = (dow) => { const t = new Date(); t.setHours(0, 0, 0, 0); t.setDate(t.getDate() + ((dow - t.getDay() + 7) % 7)); return t; };

require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  if (process.env.TP_DARK) nativeTheme.themeSource = 'dark';
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  console.log(`[c:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[c:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

async function run() {
  await wait(3000);
  const panel = panelWin();
  const js = (c) => panel.webContents.executeJavaScript(c, true);
  panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
  const sheet = () => js(`({
    open: !document.getElementById('calSheet').hidden,
    title: calTitle.value, date: calDate.value, time: calTime.value, allDay: calAllDay.checked,
    timeRowHidden: document.getElementById('calTimeRow').hidden, length: calLength.value,
    repeat: calRepeat.checked, meet: calMeet.checked, remind: calRemind.checked,
    note: calNote.textContent, hold: calendarId })`);

  // ⋯ button on a task opens the task menu, which has the Google Calendar item
  check('each task has a ⋯ button', await js(`document.querySelectorAll('.row .more').length === 5`));
  await js(`document.querySelector('.row[data-id="adam"] .more').click()`);
  await wait(300);
  const labels = (lastMenu || []).map((i) => i.label).filter(Boolean);
  check('⋯ opens the task menu with "Add to Google Calendar…"', labels.includes('Add to Google Calendar…'), labels.join(' / '));
  clickMenu('Add to Google Calendar…');
  await until(async () => (await sheet()).open);
  let s = await sheet();
  const d = new Date();
  const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1);
  const expectDay = d.getHours() >= 21 ? new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, 9) : nextHour;
  check('pop-up opens with the task title', s.open && s.title === 'Meeting with Adam', s.title);
  check('with a sensible start (next full hour) and 1 hour', s.date === `${expectDay.getFullYear()}-${two(expectDay.getMonth() + 1)}-${two(expectDay.getDate())}` && s.time === `${two(expectDay.getHours())}:00` && s.length === '60' && !s.allDay, `${s.date} ${s.time} ${s.length}`);
  check('panel stays open while the pop-up is up', s.hold === 'adam');
  await wait(300);
  fs.writeFileSync(path.join(OUT, `${tag}-sheet.png`), (await panel.webContents.capturePage()).toPNG());

  // Pick a date and time the way you would, and send it
  await js(`calDate.value = '2026-10-06'; calTime.value = '15:00'; calLength.value = '45'; calLength.dispatchEvent(new Event('change')); calLocation.value = 'Café Nero, High St'; calNotes.value = 'Budget + launch'; calMeet.checked = true;`);
  await js(`calOpen.click()`);
  await until(() => opened.length === 1);
  let p = params(opened[0]);
  const start = new Date(2026, 9, 6, 15, 0);
  check('opens Google Calendar’s new-event page', opened[0].startsWith('https://calendar.google.com/calendar/render?action=TEMPLATE&'), opened[0].slice(0, 70));
  check('title, time, place, notes and Meet are filled in', p.text === 'Meeting with Adam' && p.dates === `${utc(start)}/${utc(new Date(start.getTime() + 45 * 60000))}`
    && p.location === 'Café Nero, High St' && p.details === 'Budget + launch' && p.vcon === 'meet' && !p.recur && !p.authuser, JSON.stringify(p));
  await wait(400);
  s = await sheet();
  check('pop-up closes after sending', !s.open && s.hold === null);
  let adam = readTasks().find((t) => t.id === 'adam');
  check('task remembers it went to Google Calendar', adam.calendarAt === start.getTime() && adam.calendarAllDay === false);
  const chip = await js(`(document.querySelector('.row[data-id="adam"] .chip.cal') || {}).textContent`);
  check('task shows a calendar tag', !!chip && /3:00 PM/.test(chip), chip);
  check('the length you used becomes the default', JSON.parse(fs.readFileSync(path.join(UD, 'settings.json'), 'utf8')).calendarDuration === 45);

  // Keyboard: select a task and press G. Date and time come from the task text.
  await js(`document.activeElement.blur(); selectedId = 'bank'; render();`);
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))`);
  await until(async () => (await sheet()).open);
  s = await sheet();
  const fri = nextWeekday(5);
  check('G opens it for the selected task', s.open);
  check('"Call the bank Fri 10:30 for 30 min" -> Friday 10:30, 30 min, title "Call the bank"',
    s.title === 'Call the bank' && s.date === `${fri.getFullYear()}-${two(fri.getMonth() + 1)}-${two(fri.getDate())}` && s.time === '10:30' && s.length === '30', `${s.title} ${s.date} ${s.time} ${s.length}`);
  await js(`calTitle.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await wait(300);
  s = await sheet();
  check('Esc closes the pop-up without sending', !s.open && opened.length === 1 && panel.isVisible());
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'g', bubbles: true }))`);
  await until(async () => (await sheet()).open);
  await js(`calTitle.focus(); calTitle.form.requestSubmit()`);
  await until(() => opened.length === 2);
  p = params(opened[1]);
  const friStart = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate(), 10, 30);
  check('Enter sends it with the parsed time', p.text === 'Call the bank' && p.dates === `${utc(friStart)}/${utc(new Date(friStart.getTime() + 30 * 60000))}`, p.dates);
  await wait(300);
  check('a length read from the task text doesn’t change your default', JSON.parse(fs.readFileSync(path.join(UD, 'settings.json'), 'utf8')).calendarDuration === 45);

  // All-day: "Submit report Friday"
  await js(`document.querySelector('.row[data-id="report"]').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))`);
  await wait(300);
  clickMenu('Add to Google Calendar…');
  await until(async () => (await sheet()).open);
  s = await sheet();
  check('a day without a time becomes an all-day event (time hidden)', s.allDay && s.timeRowHidden && s.title === 'Submit report', `${s.allDay} ${s.title}`);
  await js(`calOpen.click()`);
  await until(() => opened.length === 3);
  p = params(opened[2]);
  const fri2 = new Date(fri.getFullYear(), fri.getMonth(), fri.getDate() + 1);
  const ymd = (x) => `${x.getFullYear()}${two(x.getMonth() + 1)}${two(x.getDate())}`;
  check('all-day dates are Friday to the next day', p.dates === `${ymd(fri)}/${ymd(fri2)}`, p.dates);
  await wait(300);
  const repChip = await js(`(document.querySelector('.row[data-id="report"] .chip.cal') || {}).textContent`);
  check('all-day tag shows the day', !!repChip && !/AM|PM/.test(repChip), repChip);

  // Daily task: repeat is ticked; remind in TaskPop too
  await js(`document.querySelector('.row[data-id="standup"] .more').click()`);
  await wait(300);
  clickMenu('Add to Google Calendar…');
  await until(async () => (await sheet()).open);
  s = await sheet();
  check('a daily task starts with "Repeat every day" ticked, default length 45', s.repeat && s.length === '45');
  await js(`calTime.value = '09:15'; calRemind.checked = true; calOpen.click()`);
  await until(() => opened.length === 4);
  p = params(opened[3]);
  check('daily repeat goes to Google as a daily event', p.recur === 'RRULE:FREQ=DAILY');
  await wait(300);
  const standup = readTasks().find((t) => t.id === 'standup');
  check('"Also remind me here" sets a TaskPop reminder at the same time', standup.remindAt === standup.calendarAt && !standup.reminded);

  // Validation
  await js(`document.querySelector('.row[data-id="adam"] .more').click()`);
  await wait(200);
  clickMenu('Add to Google Calendar…');
  await until(async () => (await sheet()).open);
  s = await sheet();
  check('opening it again starts from what was sent', s.date === '2026-10-06' && s.time === '15:00', `${s.date} ${s.time}`);
  await js(`calTitle.value = '   '; calOpen.click()`);
  await wait(300);
  s = await sheet();
  check('an empty title is caught', s.open && /title/.test(s.note) && opened.length === 4, s.note);
  await js(`calTitle.value = 'Meeting with Adam'; calDate.value = ''; calOpen.click()`);
  await wait(300);
  s = await sheet();
  check('a missing date is caught', s.open && /date/.test(s.note) && opened.length === 4, s.note);
  await js(`document.getElementById('calCancel').click()`);
  await wait(200);

  // A bad request straight to the main process is refused (no browser opened)
  const bad = await js(`window.taskpop.openCalendar({ id: 'adam', title: 'x', start: 'soon', end: 1 })`);
  check('the main process refuses bad dates', bad && !bad.ok && opened.length === 4);

  // Settings: Google account and default length
  await js('window.taskpop.openSettings()');
  await until(() => settingsWin() && !settingsWin().webContents.isLoading());
  await wait(1200);
  const sw = settingsWin();
  const sjs = (c) => sw.webContents.executeJavaScript(c, true);
  await sjs(`(() => { const i = document.getElementById('googleAccount'); i.value = 'not-an-email'; i.dispatchEvent(new Event('change')); })()`);
  await wait(300);
  check('Settings rejects a wrong Google account', /doesn’t look like an email/.test(await sjs(`document.getElementById('googleAccountHint').textContent`)));
  await sjs(`(() => { const i = document.getElementById('googleAccount'); i.value = 'saif@example.com'; i.dispatchEvent(new Event('change')); })()`);
  await sjs(`(() => { const s = document.getElementById('calendarDuration'); s.value = '30'; s.dispatchEvent(new Event('change')); })()`);
  await wait(400);
  const saved = JSON.parse(fs.readFileSync(path.join(UD, 'settings.json'), 'utf8'));
  check('Settings saves the account and default length', saved.googleAccount === 'saif@example.com' && saved.calendarDuration === 30, JSON.stringify({ a: saved.googleAccount, d: saved.calendarDuration }));
  await sjs(`document.getElementById('calendarDuration').scrollIntoView({ block: 'center' })`);
  await wait(300);
  fs.writeFileSync(path.join(OUT, `${tag}-settings.png`), (await sw.webContents.capturePage()).toPNG());
  sw.close();
  await wait(500);

  panel.show();
  await js(`document.querySelector('.row[data-id="adam"] .more').click()`);
  await wait(200);
  clickMenu('Add to Google Calendar…');
  await until(async () => (await sheet()).open);
  await js(`calOpen.click()`);
  await until(() => opened.length === 5);
  p = params(opened[4]);
  check('the chosen Google account is used', p.authuser === 'saif@example.com');
  await wait(300);
  await js(`document.activeElement.blur(); selectedId = 'adam'; render();`);
  await wait(200);
  fs.writeFileSync(path.join(OUT, `${tag}-list.png`), (await panel.webContents.capturePage()).toPNG());
}
