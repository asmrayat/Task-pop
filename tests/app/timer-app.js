// v1.7: task timers, on the real main process as macOS or Windows (TP_PLATFORM=darwin|win32).
// Set a time frame from the task menu or with T; the task is starred, moved to the top and
// highlighted, with a countdown beside it; "Time's up" comes as a notification right on time.
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'darwin';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Menu, Notification, systemPreferences, nativeTheme } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
fs.mkdirSync(P.SHOTS, { recursive: true });
const tag = `${PLATFORM === 'win32' ? 'win' : 'mac'}${process.env.TP_DARK ? '-dark' : ''}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[t:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
app.getVersion = () => '1.7.0';
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
const shown = [];
Notification.prototype.show = function () { shown.push({ n: this, title: this.title, body: this.body, at: Date.now() }); };
let lastMenu = null;
const realBuild = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = (tpl) => { const m = realBuild(tpl); m.popup = () => { lastMenu = tpl; }; return m; };

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const now = Date.now();
const T = (id, title, extra = {}) => ({ id, title, done: false, createdAt: now, important: false, repeat: 'none', remindAt: null, reminded: false, ...extra });
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, tourDone: true, lastVersion: '1.7.0', lastDay: null }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ keepOpen: true }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [
  T('mail', 'Reply to Sara'),
  T('pay', 'Pay the invoice', { important: true }),
  T('sci', 'Complete the science assignment'),
  T('gym', 'Gym'),
  T('old', 'Book flights', { done: true, completedAt: now }),
  // set yesterday on a task that repeats every day: today starts without it
  T('run', 'Morning run', { repeat: 'daily', done: true, completedAt: now - 86400000, timerStart: now - 86400000, timerEnd: now + 3600000, important: true, timerStarred: true }),
] }));
app.setPath('userData', UD);
process.argv.push('--show');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(60); } return false; };
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const readTasks = () => JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks;
const saved = (id) => readTasks().find((t) => t.id === id);
const menuItem = (labels) => {
  let items = lastMenu;
  let item = null;
  for (const label of labels) {
    item = items && items.find((i) => i.label === label);
    if (!item) return null;
    items = item.submenu;
  }
  return item;
};
const clickMenu = (...labels) => { const item = menuItem(labels); if (!item) throw new Error(`no menu item ${labels.join(' › ')}`); item.click(item); };
const near = (a, b, ms = 3000) => Math.abs(a - b) <= ms;

require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  if (process.env.TP_DARK) nativeTheme.themeSource = 'dark';
  try {
    await wait(3000);
    const panel = panelWin();
    panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
    const js = (c) => panel.webContents.executeJavaScript(c, true);
    const rows = () => js(`[...document.querySelectorAll('#list .row')].map((r) => ({ id: r.dataset.id, cls: r.className, count: (r.querySelector('.countdown span') || {}).textContent || '', bar: (r.querySelector('.timer-bar') || { style: {} }).style.transform || '', chips: [...r.querySelectorAll('.chip')].map((c) => c.textContent) }))`);
    const row = async (id) => (await rows()).find((r) => r.id === id) || {};
    const menuFor = async (id) => { lastMenu = null; await js(`window.taskpop.showTaskMenu(${JSON.stringify(id)})`); await until(() => lastMenu); };
    const key = (k) => { panel.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); panel.webContents.sendInputEvent({ type: 'char', keyCode: k }); panel.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); };
    panel.focus();
    await js(`document.activeElement && document.activeElement.blur()`);

    const run = saved('run');
    check('a new day clears the timer on a task that repeats every day (and the star it gave)', run && !run.timerEnd && !run.done && !run.important, JSON.stringify(run && { end: run.timerEnd, done: run.done, important: run.important }));

    // ---------- The menu ----------
    await menuFor('sci');
    const timerMenu = menuItem(['Set a timer']);
    const presets = timerMenu ? timerMenu.submenu.map((i) => i.label).filter(Boolean) : [];
    check('the task menu has "Set a timer" with quick choices and Custom…', presets.join() === '15 minutes,30 minutes,1 hour,2 hours,4 hours,1 day,Custom…', presets.join(', '));
    check('…placed right after Important', lastMenu.findIndex((i) => i.label === 'Set a timer') === lastMenu.findIndex((i) => i.label === 'Important') + 1);
    const t0 = Date.now();
    clickMenu('Set a timer', '1 hour');
    await until(async () => (await row('sci')).cls.includes('timed'));
    let s = saved('sci');
    check('1 hour: the timer is saved to finish an hour from now', s && near(s.timerEnd, t0 + 3600 * 1000) && near(s.timerStart, t0) && s.timerNotified === false, s && `${Math.round((s.timerEnd - t0) / 1000)} s`);
    check('…the task becomes important and moves to the top', s.important === true && s.timerStarred === true && readTasks()[0].id === 'sci' && (await rows())[0].id === 'sci');
    let r = await row('sci');
    check('…it is highlighted, with the countdown under its name', /\btimed\b/.test(r.cls) && /timer-running/.test(r.cls) && /^(1h|59:5\d) left$/.test(r.count), `${r.cls} | ${r.count}`);
    const first = r.count;
    await wait(2200);
    r = await row('sci');
    check('the countdown ticks down every second', /^59:[45]\d left$/.test(r.count) && r.count !== first, `${first} → ${r.count}`);
    const scale = Number((r.bar.match(/scaleX\(([\d.]+)\)/) || [])[1]);
    check('the line under it shows the time left', scale > 0.99 && scale <= 1, r.bar);
    await menuFor('old');
    check('a finished task has no timer choice', !menuItem(['Set a timer']));
    await menuFor('sci');
    const more = menuItem(['Set a timer']).submenu.map((i) => i.label).filter(Boolean);
    check('with a timer running, the menu can add time or remove it', more.includes('Add 15 minutes') && more.includes('Add 1 hour') && more.includes('Remove timer'), more.join(', '));
    clickMenu('Set a timer', 'Add 15 minutes');
    await wait(400);
    check('Add 15 minutes moves the finish time on by 15 minutes', near(saved('sci').timerEnd, s.timerEnd + 15 * 60 * 1000, 500));

    // ---------- Custom, with the keyboard ----------
    await js(`selectedId = 'mail'; render();`);
    key('T');
    const opened = await until(() => js(`!!document.querySelector('.timer-picker')`));
    const picker = opened && await js(`(() => { const p = document.querySelector('.timer-picker'); const v = (u) => p.querySelector('select[data-unit="' + u + '"]').value; return { label: p.querySelector('.picker-label').textContent, d: v('days'), h: v('hours'), m: v('minutes'), button: p.querySelector('button').textContent, focused: document.activeElement.dataset.unit, under: p.previousElementSibling.dataset.id }; })()`);
    check('T opens "Finish in" under the selected task, set to 1 hour', picker && picker.label === 'Finish in' && picker.d === '0' && picker.h === '1' && picker.m === '0' && picker.under === 'mail' && picker.button === 'Start timer' && picker.focused === 'hours', JSON.stringify(picker));
    await js(`(() => { const p = document.querySelector('.timer-picker'); const set = (u, v) => { const s = p.querySelector('select[data-unit="' + u + '"]'); s.value = v; s.dispatchEvent(new Event('change')); }; set('days', '0'); set('hours', '0'); set('minutes', '0'); })()`);
    check('a timer of nothing can\'t be started', await js(`document.querySelector('.timer-picker button').disabled`));
    const shotPicker = await panel.webContents.capturePage();
    await js(`(() => { const p = document.querySelector('.timer-picker'); const set = (u, v) => { const s = p.querySelector('select[data-unit="' + u + '"]'); s.value = v; s.dispatchEvent(new Event('change')); }; set('days', '1'); set('hours', '5'); })()`);
    const t1 = Date.now();
    await js(`document.querySelector('.timer-picker button').click()`);
    await wait(500);
    s = saved('mail');
    r = await row('mail');
    check('1 day 5 hours: saved, shown as "1d 5h left", and now first in the list', s && near(s.timerEnd, t1 + 29 * 3600 * 1000) && /^1d [45]h left$/.test(r.count) && (await rows())[0].id === 'mail', `${r.count}, first: ${(await rows())[0].id}`);
    check('the picker closes and nothing else is open', !(await js(`!!document.querySelector('.picker')`)));

    // Clicking the countdown changes it; Remove takes the timer (and the star it gave) away
    await js(`document.querySelector('.row[data-id="mail"] .countdown').click()`);
    await until(() => js(`!!document.querySelector('.timer-picker')`));
    const again = await js(`(() => { const p = document.querySelector('.timer-picker'); return { d: p.querySelector('[data-unit="days"]').value, h: p.querySelector('[data-unit="hours"]').value, buttons: [...p.querySelectorAll('button')].map((b) => b.textContent) }; })()`);
    check('clicking the countdown opens it with the time left, to change or remove', again.d === '1' && again.h === '5' && again.buttons.join() === 'Change timer,Remove,Cancel', JSON.stringify(again));
    await js(`[...document.querySelectorAll('.timer-picker button')].find((b) => b.textContent === 'Remove').click()`);
    await wait(400);
    s = saved('mail');
    r = await row('mail');
    check('Remove: no timer, no highlight, and no longer important (the timer had starred it)', !s.timerEnd && s.important === false && !/timed/.test(r.cls) && !r.count);

    // A task you'd starred yourself stays starred
    await menuFor('pay');
    clickMenu('Set a timer', '15 minutes');
    await wait(400);
    check('a task that was already important keeps its star when the timer goes', saved('pay').important && !saved('pay').timerStarred);
    await menuFor('pay');
    clickMenu('Set a timer', 'Remove timer');
    await wait(400);
    check('…also after Remove timer', saved('pay').important === true && !saved('pay').timerEnd);

    // ---------- Running out ----------
    // the last stretch turns orange
    await js(`(() => { const t = findTask('gym'); setTimer(t, 60); t.timerStart = Date.now() - 55 * 60 * 1000; t.timerEnd = Date.now() + 5 * 60 * 1000; save(); render(); })()`);
    await wait(300);
    r = await row('gym');
    const shotSoon = await panel.webContents.capturePage();
    check('in the last minutes the row turns orange', /timer-soon/.test(r.cls) && /^[45]:\d\d left$/.test(r.count), `${r.cls} | ${r.count}`);
    // time's up, right on time (not at the next 30-second check)
    shown.length = 0;
    const end = Date.now() + 2500;
    await js(`(() => { const t = findTask('gym'); t.timerStart = Date.now() - 60 * 1000; t.timerEnd = ${end}; t.timerNotified = false; save(); render(); })()`);
    await until(() => shown.length, 6000);
    const note = shown[0];
    check('when the time is up a notification says so, within a second', note && note.title === 'Time’s up' && note.body === 'Gym' && note.at - end < 1200 && note.at >= end - 50, note && `${note.title} / ${note.body} / ${note.at - end} ms`);
    await wait(500);
    r = await row('gym');
    const shotOver = await panel.webContents.capturePage();
    check('the row turns red and says "Time’s up"', /timer-over/.test(r.cls) && r.count === 'Time’s up', `${r.cls} | ${r.count}`);
    check('it\'s noted, so it isn\'t said twice', saved('gym').timerNotified === true);
    await wait(1500);
    check('…and no second notification comes', shown.length === 1);
    // the notification's "Add 15 min"
    note.n.emit('action', {}, 1);
    await wait(500);
    s = saved('gym');
    r = await row('gym');
    check('"Add 15 min" in the notification gives 15 more minutes from now', near(s.timerEnd, Date.now() + 15 * 60 * 1000, 2000) && !s.timerNotified && !/timer-over/.test(r.cls), r.count);
    // finishing it
    const doneAt = Date.now();
    await js(`toggleTask('gym')`);
    await wait(400);
    r = await row('gym');
    check('finishing a timed task shows how it went: "… early"', /done/.test(r.cls) && !/timed/.test(r.cls) && r.chips.some((c) => /^1[45]m early$/.test(c)), r.chips.join(' | '));
    check('…and keeps when it was due, for that', near(saved('gym').timerEnd, doneAt + 15 * 60 * 1000, 3000));
    await js(`toggleTask('gym')`);
    await wait(400);
    check('back on the list, the timer carries on', /timed/.test((await row('gym')).cls));

    // ---------- Undo, sound start, look ----------
    await js(`deleteTask('sci')`);
    await wait(300);
    await js(`undo()`);
    await wait(400);
    check('deleting a timed task and undoing brings its timer back', /timed/.test((await row('sci')).cls) && !!saved('sci').timerEnd);
    await js(`selectedId = null; render();`);
    await wait(300);
    const shot = await panel.webContents.capturePage();
    fs.writeFileSync(`${P.SHOTS}/timers-${tag}.png`, shot.toPNG());
    fs.writeFileSync(`${P.SHOTS}/timers-picker-${tag}.png`, shotPicker.toPNG());
    fs.writeFileSync(`${P.SHOTS}/timers-soon-${tag}.png`, shotSoon.toPNG());
    fs.writeFileSync(`${P.SHOTS}/timers-over-${tag}.png`, shotOver.toPNG());
  } catch (err) {
    errors.push('TEST ' + err.stack);
  }
  console.log(`[t:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[t:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});
