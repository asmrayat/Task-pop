// v1.6.3: drag to reorder, with real mouse input sent to the panel (press, move, release),
// as Windows or macOS (TP_PLATFORM). Every drag must land where the blue line showed.
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'win32';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Notification, systemPreferences, globalShortcut } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const tag = PLATFORM === 'win32' ? 'win' : 'mac';
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[r:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
if (PLATFORM === 'win32') require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
globalShortcut.register = () => true;
globalShortcut.unregister = () => {};
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};
const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const now = new Date();
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, lastVersion: '1.6.3', lastDay: `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}` }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ keepOpen: true }));
const T = (id, title, extra = {}) => ({ id, title, done: false, important: false, createdAt: Date.now(), repeat: 'none', remindAt: null, ...extra });
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [
  T('A', 'Send the proposal', { important: true }),
  T('B', 'Pay the invoice', { important: true }),
  T('C', 'Meeting with Adam'),
  T('D', 'Call the bank'),
  T('E', 'Review the landing page'),
  T('F', 'Buy milk'),
  T('X', 'Reply to Sara', { done: true, completedAt: Date.now() }),
  T('Y', 'Book flights', { done: true, completedAt: Date.now() }),
] }));
app.setPath('userData', UD);
app.getVersion = () => '1.6.3';
process.argv.push('--show');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
require(`${SRC}/main.js`);

app.whenReady().then(async () => {
  try {
    await run();
  } catch (e) {
    errors.push('TEST ' + e.stack);
  }
  console.log(`[r:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[r:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

let panel;
let js;
const send = (ev) => panel.webContents.sendInputEvent(ev);
async function mouse(type, x, y, extra = {}) {
  send({ type, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
  await wait(12);
}
const layout = () => js(`(() => {
  const box = (el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; };
  return {
    rows: [...listEl.querySelectorAll('.row')].map((r) => ({ id: r.dataset.id, ...box(r), check: box(r.querySelector('.check')) })),
    list: box(listEl),
    section: listEl.querySelector('.section') && box(listEl.querySelector('.section')),
    height: innerHeight,
  };
})()`);
const state = () => js('({ tasks: tasks.map((t) => ({ id: t.id, important: !!t.important, done: !!t.done })), order: [...listEl.querySelectorAll(".row")].map((r) => r.dataset.id), selected: selectedId })');
const marks = () => js(`({
  before: [...listEl.querySelectorAll('.drop-before')].map((r) => r.dataset.id),
  after: [...listEl.querySelectorAll('.drop-after')].map((r) => r.dataset.id),
  ghost: !!document.querySelector('.drag-ghost'),
  line: [...document.querySelectorAll('.drop-line')].filter((l) => !l.hidden).length,
  dragging: [...listEl.querySelectorAll('.row.dragging')].map((r) => r.dataset.id),
  reordering: document.body.classList.contains('reordering'),
})`);

// Independent model of where a drop lands: next to the nearest row of the same group.
function expectedDrop(lay, tasks, id, y) {
  const dragged = tasks.find((t) => t.id === id);
  const rows = lay.rows.filter((r) => tasks.find((t) => t.id === r.id).done === dragged.done);
  let best = null;
  let dist = Infinity;
  for (const r of rows) {
    const d = y < r.top ? r.top - y : y > r.bottom ? y - r.bottom : 0;
    if (d < dist) { best = r; dist = d; }
  }
  if (!best || best.id === id) return null;
  return { id: best.id, after: y > (best.top + best.bottom) / 2 };
}
function applyModel(tasks, id, drop) {
  const list = tasks.map((t) => ({ ...t }));
  if (!drop) return list;
  const from = list.find((t) => t.id === id);
  const to = list.find((t) => t.id === drop.id);
  if (!from.done) from.important = to.important;
  const rest = list.filter((t) => t.id !== id);
  let i = rest.findIndex((t) => t.id === drop.id);
  if (drop.after) i += 1;
  rest.splice(i, 0, from);
  return rest;
}
const visual = (tasks) => {
  const p = tasks.filter((t) => !t.done);
  return [...p.filter((t) => t.important), ...p.filter((t) => !t.important), ...tasks.filter((t) => t.done)].map((t) => t.id);
};

/** Press on a task, move to height toY in `steps` moves, release. Returns what was marked just before release. */
async function drag(id, toY, { steps = 10, at = 'title', toX, beforeRelease } = {}) {
  const lay = await layout();
  const r = lay.rows.find((row) => row.id === id);
  const x = at === 'check' ? (r.check.left + r.check.right) / 2 : r.left + 70;
  const y0 = at === 'check' ? (r.check.top + r.check.bottom) / 2 : (r.top + r.bottom) / 2;
  const x1 = toX === undefined ? x : toX;
  await mouse('mouseDown', x, y0);
  for (let i = 1; i <= steps; i += 1) {
    await mouse('mouseMove', x + (x1 - x) * (i / steps), y0 + (toY - y0) * (i / steps), { modifiers: ['leftButtonDown'] });
  }
  await wait(30);
  const shown = await marks();
  if (beforeRelease) await beforeRelease();
  await mouse('mouseUp', x1, toY);
  await wait(260); // let the rows' 0.18 s slide-in finish before measuring again
  return { lay, shown };
}

async function dragAndCheck(name, id, yOf, opts = {}) {
  const before = await state();
  const lay = await layout();
  const y = Math.round(typeof yOf === 'function' ? yOf(lay) : yOf); // mouse events use whole pixels
  const drop = expectedDrop(lay, before.tasks, id, y);
  const { shown } = await drag(id, y, opts);
  const after = await state();
  const want = applyModel(before.tasks, id, drop);
  const markedOk = drop
    ? (drop.after ? shown.after : shown.before).join() === drop.id && (drop.after ? shown.before : shown.after).length === 0 && shown.line === 1
    : shown.before.length === 0 && shown.after.length === 0 && shown.line === 0;
  const ok = after.order.join('') === visual(want).join('') && JSON.stringify(after.tasks) === JSON.stringify(want) && markedOk;
  const detail = `${before.order.join('')} → ${after.order.join('')}${ok ? '' : ` want ${visual(want).join('')}, marked ${JSON.stringify(shown)}, drop ${JSON.stringify(drop)}, id ${id}, y ${Math.round(y)}`}`;
  if (name) check(name, ok, detail);
  else if (!ok) console.log(`[r:${tag}] miss: ${detail}`);
  return ok;
}
const mid = (lay, id) => { const r = lay.rows.find((row) => row.id === id); return (r.top + r.bottom) / 2; };
const lowerHalf = (lay, id) => { const r = lay.rows.find((row) => row.id === id); return r.bottom - 4; };
const upperHalf = (lay, id) => { const r = lay.rows.find((row) => row.id === id); return r.top + 4; };

async function run() {
  await wait(3500);
  panel = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
  js = (c) => panel.webContents.executeJavaScript(c, true);
  panel.focus();
  panel.webContents.focus();
  await js('document.activeElement && document.activeElement.blur()');
  await wait(300);
  check('panel open with 6 to-dos and 2 completed', (await state()).order.join('') === 'ABCDEFXY');

  // Basic moves
  await dragAndCheck('drag a task down, drop on the lower half of another: lands after it', 'C', (l) => lowerHalf(l, 'E'));
  await dragAndCheck('drag a task up, drop on the upper half of another: lands before it', 'C', (l) => upperHalf(l, 'D'));
  await dragAndCheck('drag a plain task into the starred group: it lands there and gets starred', 'F', (l) => upperHalf(l, 'A'));
  const s1 = await state();
  check('… and is saved as important', s1.tasks.find((t) => t.id === 'F').important === true);
  await dragAndCheck('drag a starred task down among the plain ones: un-starred', 'F', (l) => lowerHalf(l, 'D'));

  // The cases HTML5 drag-and-drop dropped on Windows
  await dragAndCheck('let go over the "Completed" header: lands at the end of the to-dos', 'A', (l) => (l.section.top + l.section.bottom) / 2);
  await dragAndCheck('let go over a completed task: still lands at the end of the to-dos', 'B', (l) => mid(l, 'Y'));
  await dragAndCheck('let go in the gap below the last task: lands at the end of its group', 'C', (l) => Math.min(l.list.bottom - 10, l.rows[l.rows.length - 1].bottom + 30));
  await dragAndCheck('let go outside the panel (below it): still lands, at the end of its group', 'D', (l) => l.height + 60);
  await dragAndCheck('let go above the panel: lands at the top of its group', 'E', () => -40);
  await dragAndCheck('a fast flick (2 mouse moves in total) still lands', 'F', (l) => upperHalf(l, l.rows[0].id), { steps: 2 });
  await dragAndCheck('a slow drag (40 moves) lands the same way', 'C', (l) => lowerHalf(l, l.rows[2].id), { steps: 40 });
  // v1.6.7: the first move that counts lands outside the list (a quick flick, or moves merged under load)
  await dragAndCheck('a flick that leaves the list in one move (up, over the top bar) still lands', 'D', (l) => l.list.top - 14, { steps: 1 });
  await dragAndCheck('a flick that leaves the panel in one move (down, below it) still lands', 'A', (l) => l.height + 40, { steps: 1 });
  await dragAndCheck('completed tasks reorder among themselves', 'Y', (l) => upperHalf(l, 'X'));
  await dragAndCheck('a completed task dragged into the to-dos stays completed (top of its group)', 'X', (l) => mid(l, l.rows[1].id));
  const s2 = await state();
  check('… and it is still ticked', s2.tasks.find((t) => t.id === 'X').done === true);

  // Clicks are still clicks
  let lay = await layout();
  let r = lay.rows.find((row) => row.id === 'D');
  const beforeClick = (await state()).order.join('');
  await mouse('mouseDown', r.left + 70, mid(lay, 'D'));
  await mouse('mouseUp', r.left + 70, mid(lay, 'D'));
  await wait(150);
  let s = await state();
  check('a click (no movement) selects the task and moves nothing', s.selected === 'D' && s.order.join('') === beforeClick);
  await mouse('mouseDown', r.left + 70, mid(lay, 'D'));
  await mouse('mouseMove', r.left + 72, mid(lay, 'D') + 3, { modifiers: ['leftButtonDown'] });
  await mouse('mouseUp', r.left + 72, mid(lay, 'D') + 3);
  await wait(150);
  s = await state();
  check('a wobbly click (3 px) is still a click, not a drag', s.order.join('') === beforeClick && !(await marks()).reordering);
  await mouse('mouseDown', (r.check.left + r.check.right) / 2, (r.check.top + r.check.bottom) / 2);
  await mouse('mouseUp', (r.check.left + r.check.right) / 2, (r.check.top + r.check.bottom) / 2);
  await wait(250);
  s = await state();
  check('clicking the circle still ticks the task', s.tasks.find((t) => t.id === 'D').done === true);
  await js('toggleTask("D")'); // untick it again
  await wait(250);

  // Grab by the circle, drop on another task's circle: moves, ticks nothing
  lay = await layout();
  const pending = (await state()).order.filter((id) => !(['X', 'Y'].includes(id)));
  const target = lay.rows.find((row) => row.id === pending[pending.length - 1]);
  const ok = await dragAndCheck('', pending[0], target.bottom - 4, { at: 'check', toX: (target.check.left + target.check.right) / 2 });
  s = await state();
  check('grab a task by its circle and let go on another circle: it moves and nothing gets ticked', ok && s.tasks.filter((t) => t.done).length === 2, s.order.join(''));

  // Esc cancels
  const beforeEsc = (await state()).order.join('');
  lay = await layout();
  const { shown: escShown } = await drag(lay.rows[0].id, lowerHalf(lay, lay.rows[3].id), {
    beforeRelease: async () => {
      send({ type: 'keyDown', keyCode: 'Escape' });
      send({ type: 'keyUp', keyCode: 'Escape' });
      await wait(80);
    },
  });
  s = await state();
  const m = await marks();
  check('Esc during a drag cancels it (nothing moves) and keeps the panel open', s.order.join('') === beforeEsc && panel.isVisible() && escShown.ghost, s.order.join(''));
  check('after a drag nothing is left behind (no ghost, no line, no dimmed row)', !m.ghost && !m.line && !m.reordering && !m.dragging.length && !m.before.length && !m.after.length);

  // The list refreshing in the middle of a drag (a reminder firing, a sync from another window)
  await dragAndCheck('the list refreshing mid-drag doesn\'t lose the drop', 'C', (l) => upperHalf(l, l.rows[0].id), {
    beforeRelease: async () => { await js('render()'); await js('window.taskpop.getState()'); await wait(50); },
  });

  // Keyboard: Alt (⌥) + arrows
  s = await state();
  const firstPlain = s.order.find((id) => !s.tasks.find((t) => t.id === id).important && !s.tasks.find((t) => t.id === id).done);
  await js(`selectedId = ${JSON.stringify(firstPlain)}; render();`);
  const keyOrder = (await state()).order;
  send({ type: 'keyDown', keyCode: 'Down', modifiers: ['alt'] });
  send({ type: 'keyUp', keyCode: 'Down', modifiers: ['alt'] });
  await wait(200);
  s = await state();
  const i0 = keyOrder.indexOf(firstPlain);
  check(`${PLATFORM === 'darwin' ? '⌥' : 'Alt'}+↓ moves the selected task down one place`, s.order.indexOf(firstPlain) === i0 + 1 && s.selected === firstPlain, s.order.join(''));
  send({ type: 'keyDown', keyCode: 'Up', modifiers: ['alt'] });
  send({ type: 'keyUp', keyCode: 'Up', modifiers: ['alt'] });
  await wait(200);
  s = await state();
  check(`${PLATFORM === 'darwin' ? '⌥' : 'Alt'}+↑ moves it back up`, s.order.join('') === keyOrder.join(''));
  const lastDone = s.order[s.order.length - 1];
  await js(`selectedId = ${JSON.stringify(lastDone)}; render();`);
  send({ type: 'keyDown', keyCode: 'Down', modifiers: ['alt'] });
  send({ type: 'keyUp', keyCode: 'Down', modifiers: ['alt'] });
  await wait(200);
  check('at the end of its group it stays put', (await state()).order.join('') === s.order.join(''));

  // Many random drags against the model
  let misses = 0;
  const N = 60;
  for (let i = 0; i < N; i += 1) {
    const l = await layout();
    const st = await state();
    const id = st.order[Math.floor(Math.random() * st.order.length)];
    const y = l.list.top - 30 + Math.random() * (l.list.bottom - l.list.top + 60);
    const steps = 1 + Math.floor(Math.random() * 15);
    if (!(await dragAndCheck('', id, y, { steps }))) misses += 1;
  }
  check(`${N} random drags (random task, spot and speed): every one lands where the line showed`, misses === 0, `${misses} missed`);

  // Saved to disk
  await wait(1500);
  const onDisk = JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks.map((t) => t.id).join('');
  s = await state();
  check('the new order is saved', onDisk === s.tasks.map((t) => t.id).join(''), onDisk);
  fs.writeFileSync(`${P.TMP}/reorder-${tag}.png`, (await (async () => {
    lay = await layout();
    const rows = lay.rows;
    await mouse('mouseDown', rows[1].left + 70, mid(lay, rows[1].id));
    for (let i = 1; i <= 8; i += 1) await mouse('mouseMove', rows[1].left + 70, mid(lay, rows[1].id) + i * 9, { modifiers: ['leftButtonDown'] });
    await wait(100);
    const img = await panel.webContents.capturePage();
    send({ type: 'keyDown', keyCode: 'Escape' });
    await mouse('mouseUp', rows[1].left + 70, mid(lay, rows[1].id) + 72);
    return img;
  })()).toPNG());
}
