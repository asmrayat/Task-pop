// v1.8: categories, on the real main process as macOS or Windows (TP_PLATFORM=darwin|win32).
// The tags along the top (All, Personal, Work, Unsorted, +) and what they show, adding into a
// category, moving tasks (menu, drag onto a tag, #name), renaming, colours, deleting with Undo,
// and "Sort your tasks", the one-by-one card for the tasks you had before updating.
// TP_MODE=fresh: a first install instead (no tasks yet, nothing to sort).
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'darwin';
const MODE = process.env.TP_MODE || 'update';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Menu, Notification, systemPreferences, nativeTheme, dialog, globalShortcut } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
fs.mkdirSync(P.SHOTS, { recursive: true });
const tag = `${PLATFORM === 'win32' ? 'win' : 'mac'}${MODE === 'fresh' ? '-fresh' : ''}${process.env.TP_DARK ? '-dark' : ''}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[c:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const dt = require(`${SRC}/doubletap.js`);
dt.createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
globalShortcut.register = () => true;
globalShortcut.unregister = () => {};
app.getVersion = () => '1.8.0';
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};
let lastMenu = null;
const realBuild = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = (tpl) => { const m = realBuild(tpl); m.popup = () => { lastMenu = tpl; }; return m; };
let importFile = null;
let exportFile = null;
dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [importFile] });
dialog.showSaveDialog = async () => ({ canceled: false, filePath: exportFile });

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const now = Date.now();
const today = new Date();
const T = (id, title, extra = {}) => ({ id, title, done: false, createdAt: now, important: false, repeat: 'none', remindAt: null, reminded: false, ...extra });
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({
  firstRunDone: true, tourDone: true, lastVersion: '1.7.0', lastDay: `${today.getFullYear()}-${today.getMonth() + 1}-${today.getDate()}`,
}));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ keepOpen: true }));
if (MODE !== 'fresh') {
  // Saved by TaskPop 1.7: no categories yet
  fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, tasks: [
    T('mail', 'Reply to Sara'),
    T('deck', 'Finish the Q3 deck', { important: true }),
    T('sci', 'Complete the science assignment'),
    T('milk', 'Buy milk'),
    T('dent', 'Call the dentist'),
    T('old', 'Book flights', { done: true, completedAt: now }),
    T('run', 'Morning run', { repeat: 'daily', done: true, completedAt: now }),
  ] }));
}
app.setPath('userData', UD);
process.argv.push('--show');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 6000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return false; };
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const readFile = () => JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8'));
const saved = (id) => readFile().tasks.find((t) => t.id === id);
const savedCats = () => readFile().categories || [];
const readMeta = () => JSON.parse(fs.readFileSync(path.join(UD, 'meta.json'), 'utf8'));
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

require(`${SRC}/main.js`);

let panel;
let js;
const send = (ev) => panel.webContents.sendInputEvent(ev);
const key = (k, modifiers = []) => { send({ type: 'keyDown', keyCode: k, modifiers }); send({ type: 'char', keyCode: k, modifiers }); send({ type: 'keyUp', keyCode: k, modifiers }); };
const type = async (text) => { for (const ch of text) { send({ type: 'char', keyCode: ch }); await wait(8); } };
async function mouse(type_, x, y, extra = {}) {
  send({ type: type_, x: Math.round(x), y: Math.round(y), button: 'left', clickCount: 1, ...extra });
  await wait(14);
}
const click = async (x, y, count = 1) => {
  for (let c = 1; c <= count; c += 1) {
    await mouse('mouseDown', x, y, { clickCount: c });
    await mouse('mouseUp', x, y, { clickCount: c });
  }
};
const ui = () => js(`(() => {
  const rect = (el) => { const r = el.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom }; };
  return {
    tags: [...document.querySelectorAll('#tags > *')].map((t) => ({ cat: t.dataset.cat || (t.classList.contains('add') ? '+' : t.tagName === 'INPUT' ? 'input' : ''), name: (t.querySelector('span') || {}).textContent || '', count: (t.querySelector('small') || {}).textContent || '', on: t.classList.contains('on'), ...rect(t) })),
    rows: [...document.querySelectorAll('#list .row')].map((r) => ({ id: r.dataset.id, title: r.querySelector('.title').firstChild.textContent, label: (r.querySelector('.cat-label') || {}).textContent || '', cls: r.className, ...rect(r) })),
    view: currentCat,
    card: !document.getElementById('sortCard').hidden && {
      count: document.getElementById('sortCount').textContent,
      intro: !document.getElementById('sortIntro').hidden,
      task: document.getElementById('sortTask').textContent,
      choices: [...document.querySelectorAll('#sortChoices > *')].map((c) => c.textContent || c.tagName),
    },
    hint: (document.querySelector('.sort-hint span') || {}).textContent || '',
    empty: (document.querySelector('#list .empty strong') || {}).textContent || '',
    placeholder: document.getElementById('newTask').placeholder,
    subtitle: document.getElementById('subtitle').textContent,
    toast: document.getElementById('undoToast').classList.contains('show') ? document.getElementById('undoText').textContent : '',
    undoShown: !document.getElementById('undoBtn').hidden,
    focus: document.activeElement.id || document.activeElement.className,
  };
})()`);
const tagAt = async (cat) => (await ui()).tags.find((t) => t.cat === cat);
/** Scroll the tags (as you would with the wheel) so that one is in view. */
const showTag = async (cat) => {
  await js(`(() => { const t = [...tagsEl.children].find((x) => (x.dataset.cat || (x.classList.contains('add') ? '+' : '')) === ${JSON.stringify(cat)}); if (t && (t.offsetLeft < tagsEl.scrollLeft || t.offsetLeft + t.offsetWidth > tagsEl.scrollLeft + tagsEl.clientWidth)) tagsEl.scrollLeft = Math.max(0, t.offsetLeft - 40); })()`);
  await wait(60);
};
const clickTag = async (cat) => { await showTag(cat); const t = await tagAt(cat); if (!t) throw new Error(`no tag ${cat}`); await click(t.x, t.y); await wait(250); };
const menuFor = async (id) => { lastMenu = null; await js(`window.taskpop.showTaskMenu(${JSON.stringify(id)})`); await until(() => lastMenu); };
const catMenu = async (cat) => { lastMenu = null; await showTag(cat); const t = await tagAt(cat); send({ type: 'mouseDown', x: Math.round(t.x), y: Math.round(t.y), button: 'right', clickCount: 1 }); send({ type: 'mouseUp', x: Math.round(t.x), y: Math.round(t.y), button: 'right', clickCount: 1 }); await until(() => lastMenu); };
const shot = async (name) => fs.writeFileSync(`${P.SHOTS}/${name}-${tag}.png`, (await panel.webContents.capturePage()).toPNG());
const tagNames = (u) => u.tags.map((t) => (t.cat === '+' ? '+' : t.cat === 'input' ? '[input]' : t.name)).join(' · ');

app.whenReady().then(async () => {
  if (process.env.TP_DARK) nativeTheme.themeSource = 'dark';
  try {
    await wait(2500);
    panel = panelWin();
    panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
    js = (c) => panel.webContents.executeJavaScript(c, true);
    panel.focus();
    if (MODE === 'fresh') await fresh();
    else await updated();
  } catch (err) {
    errors.push('TEST ' + err.stack);
  }
  console.log(`[c:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[c:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});

// ---------- A first install ----------
async function fresh() {
  let u = await ui();
  check('a first install starts with All, Personal, Work and +, on All', tagNames(u) === 'All · Personal · Work · +' && u.tags[0].on, tagNames(u));
  check('…and has nothing to sort', !u.card && !readMeta().sortPrompt);
  await js(`inputEl.focus()`);
  await type('Water the plants');
  key('Return');
  await wait(300);
  u = await ui();
  const added = (await js(`tasks.find((t) => t.title === 'Water the plants')`)) || {};
  check('a task added under All is in no category, and Unsorted appears', added.category === null && tagNames(u) === 'All · Personal · Work · Unsorted · +' && (await tagAt('none')).count === '1', tagNames(u));
  check('…with no "Sort your tasks" card (that\'s only for tasks from before 1.8)', !u.card);
  await clickTag('personal');
  u = await ui();
  check('Personal: empty, saying so, and "Add to Personal…"', u.empty === 'Nothing in Personal yet' && u.placeholder === 'Add to Personal…' && u.view === 'personal', `${u.empty} | ${u.placeholder}`);
  check('clicking a tag leaves the keyboard where it was', u.focus === 'newTask', u.focus);
  await type('Call mum');
  key('Return');
  await wait(300);
  const mum = (await js(`tasks.find((t) => t.title === 'Call mum')`)) || {};
  u = await ui();
  check('a task added there goes into Personal and shows', mum.category === 'personal' && u.rows.length === 1 && u.rows[0].title === 'Call mum');
  await until(() => saved(mum.id));
  check('…and is saved with its category, and the categories with it', saved(mum.id).category === 'personal' && savedCats().map((c) => c.name).join() === 'Personal,Work');
  await shot('categories-fresh');
}

// ---------- After updating from 1.7 ----------
async function updated() {
  // ---- what the update did ----
  const cats = savedCats();
  check('the update adds Personal and Work, and saves them with the tasks', cats.map((c) => `${c.id}:${c.name}:${c.color}`).join() === 'personal:Personal:blue,work:Work:orange', JSON.stringify(cats));
  check('…the tasks you had are in no category yet', readFile().tasks.every((t) => t.category === null));
  check('…and it notes to ask you to sort them', readMeta().sortPrompt === true);

  // ---- Sort your tasks ----
  let u = await ui();
  check('"Sort your tasks" is waiting when the panel opens, with a word on what\'s new', u.card && u.card.intro && u.card.count === '1 of 6', JSON.stringify(u.card));
  check('…it starts with the important one, and lists the categories, plus New', u.card.task === 'Finish the Q3 deck' && u.card.choices.join() === 'Personal,Work,New', u.card.choices.join());
  check('…while it\'s open the list shows Unsorted, with that task marked', u.view === 'none' && (await tagAt('none')).on && u.rows[0].id === 'deck' && /sorting-now/.test(u.rows[0].cls));
  await shot('categories-sort');
  await js(`[...document.querySelectorAll('#sortChoices .sort-choice')].find((b) => b.textContent === 'Work').click()`);
  await wait(300);
  u = await ui();
  check('picking Work puts it in Work and goes on to the next: 2 of 6', saved('deck').category === 'work' && u.card.count === '2 of 6' && u.card.task === 'Reply to Sara', `${saved('deck').category} ${u.card.count} ${u.card.task}`);
  check('…and it leaves the Unsorted list', !u.rows.some((r) => r.id === 'deck'));
  check('the "Add a task" box keeps the keyboard', u.focus === 'newTask', u.focus);
  await js(`document.activeElement.blur()`);
  key('2');
  await wait(300);
  u = await ui();
  check('number keys pick too: 2 is Work', saved('mail').category === 'work' && u.card.count === '3 of 6' && u.card.task === 'Complete the science assignment', u.card.count);
  // New category, from the card
  await js(`document.querySelector('#sortChoices .sort-add').click()`);
  await wait(200);
  check('New asks for a name, in place', await js(`document.activeElement.classList.contains('sort-new')`));
  await type('Study');
  key('Return');
  await wait(300);
  u = await ui();
  const study = savedCats().find((c) => c.name === 'Study');
  check('…Return makes "Study" (with the next colour), puts the task in it and goes on', study && study.color === 'green' && saved('sci').category === study.id && u.card.count === '4 of 6' && u.card.task === 'Buy milk', `${JSON.stringify(study)} ${saved('sci').category} ${JSON.stringify(u.card)}`);
  check('…and Study joins the tags and the choices', tagNames(u) === 'All · Personal · Work · Study · Unsorted · +' && u.card.choices.join() === 'Personal,Work,Study,New', tagNames(u));
  await js(`document.getElementById('sortSkip').click()`);
  await wait(300);
  u = await ui();
  check('Skip leaves it in Unsorted and goes on', saved('milk').category === null && u.card.count === '5 of 6' && u.card.task === 'Call the dentist');
  await js(`document.getElementById('sortLater').click()`);
  await wait(300);
  u = await ui();
  check('"Do the rest later" closes the card and goes back to All', !u.card && u.view === 'all' && (await tagAt('all')).on);
  await until(() => readMeta().sortPrompt === false);
  check('…and it won\'t ask again by itself', readMeta().sortPrompt === false);
  check('…the rest wait under Unsorted, counted', (await tagAt('none')).count === '2' && saved('dent').category === null && saved('run').category === null, (await tagAt('none')).count);

  // ---- All, and each tag ----
  u = await ui();
  const label = (id) => (u.rows.find((r) => r.id === id) || {}).label;
  check('under All every task shows, each with its category after the title', u.rows.length === 7 && label('deck') === 'Work' && label('sci') === 'Study' && label('milk') === '', u.rows.map((r) => `${r.id}:${r.label}`).join(' '));
  check('the tags count what\'s left in each', (await tagAt('all')).count === '5' && (await tagAt('work')).count === '2' && (await tagAt(study.id)).count === '1' && (await tagAt('personal')).count === '', (await ui()).tags.map((t) => `${t.name}${t.count}`).join(' '));
  await shot('categories-all');
  await clickTag('work');
  u = await ui();
  check('Work shows only its tasks, without the label (you know where you are)', u.rows.map((r) => r.id).join() === 'deck,mail' && u.rows.every((r) => !r.label) && (await tagAt('work')).on, u.rows.map((r) => r.id).join());
  check('…the count above is for Work, and new tasks go there', /· 2 left$/.test(u.subtitle) && u.placeholder === 'Add to Work…', `${u.subtitle} | ${u.placeholder}`);
  await js(`inputEl.focus()`);
  await type('Send the invoice');
  key('Return');
  await wait(300);
  const inv = await js(`tasks.find((t) => t.title === 'Send the invoice')`);
  check('adding under Work puts it in Work', inv && inv.category === 'work' && (await ui()).rows.some((r) => r.id === inv.id));
  await type('Pick up the cake #personal');
  key('Return');
  await wait(300);
  const cake = await js(`tasks.find((t) => t.title === 'Pick up the cake')`);
  u = await ui();
  check('"#personal" puts it in Personal instead, and takes the tag out of the title', cake && cake.category === 'personal' && !u.rows.some((r) => r.id === cake.id), JSON.stringify(cake && cake.title));
  check('…saying so, since it isn\'t under the tag you\'re on', u.toast === 'Added to Personal' && !u.undoShown, u.toast);
  await type('Fix the #2 bug');
  key('Return');
  await wait(300);
  check('a # that isn\'t a category stays in the title', !!(await js(`tasks.find((t) => t.title === 'Fix the #2 bug' && t.category === 'work')`)));
  await js(`document.activeElement.blur()`);

  // ←/→
  key('Right');
  await wait(250);
  check('→ goes to the next tag', (await ui()).view === study.id);
  key('Left');
  key('Left');
  await wait(250);
  check('← goes back', (await ui()).view === 'personal');
  key('Left');
  key('Left');
  await wait(250);
  check('…and stops at All', (await ui()).view === 'all');

  // ---- Move to (the task's menu) ----
  await menuFor('milk');
  const moveTo = menuItem(['Move to']);
  const items = moveTo ? moveTo.submenu.filter((i) => i.label).map((i) => `${i.label}${i.checked ? '*' : ''}`) : [];
  check('the task menu has Move to › your categories, Unsorted (ticked) and New category…', items.join() === 'Personal,Work,Study,Unsorted*,New category…', items.join());
  check('…right after Edit', lastMenu.findIndex((i) => i.label === 'Move to') === lastMenu.findIndex((i) => i.label === 'Edit') + 1);
  clickMenu('Move to', 'Personal');
  await wait(300);
  u = await ui();
  check('Move to › Personal moves it, with Undo', saved('milk').category === 'personal' && u.rows.find((r) => r.id === 'milk').label === 'Personal' && u.toast === 'Moved to Personal' && u.undoShown, u.toast);
  key('z', [PLATFORM === 'darwin' ? 'meta' : 'control']);
  await wait(300);
  check('…and Undo puts it back', saved('milk').category === null && (await ui()).rows.find((r) => r.id === 'milk').label === '');
  await menuFor('milk');
  clickMenu('Move to', 'New category…');
  await wait(250);
  check('Move to › New category… asks for a name in the tag row', await js(`document.activeElement.classList.contains('tag-input')`));
  await type('Home');
  key('Return');
  await wait(300);
  const home = savedCats().find((c) => c.name === 'Home');
  u = await ui();
  check('…and puts the task in it, staying where you are', home && saved('milk').category === home.id && u.view === 'all' && u.toast === 'Moved to Home', JSON.stringify(home));

  // ---- Reordering inside a tag ----
  await clickTag('work');
  const order = async () => (await ui()).rows.filter((r) => !/\bdone\b/.test(r.cls)).map((r) => r.id);
  const others = () => js(`tasks.filter((t) => t.category !== 'work').map((t) => t.id).join()`);
  const before = await order();
  const othersBefore = await others();
  await js(`selectedId = ${JSON.stringify((await ui()).rows.find((r) => r.title === 'Send the invoice').id)}; render(); document.activeElement.blur()`);
  key('Up', ['alt']);
  await wait(300);
  const after = await order();
  const n = before.length;
  check('under a tag, ⌥↑ moves a task up past the one above it in that tag', n >= 3 && after.join() === [...before.slice(0, n - 3), before[n - 2], before[n - 3], before[n - 1]].join(), `${before.join()} → ${after.join()}`);
  check('…and the tasks in other categories keep their order', (await others()) === othersBefore);

  // ---- Drag a task onto a tag ----
  await clickTag('work');
  u = await ui();
  const row = u.rows.find((r) => r.id === 'mail');
  await js(`tagsEl.scrollLeft = tagsEl.scrollWidth`); // Personal is out of sight, to the left
  await wait(60);
  const hidden = await tagAt('personal');
  const edge = (await js(`(() => { const r = tagsEl.getBoundingClientRect(); return { left: r.left, y: (r.top + r.bottom) / 2 }; })()`));
  await mouse('mouseDown', row.left + 60, row.y);
  for (let i = 1; i <= 12; i += 1) {
    await mouse('mouseMove', row.left + 60 + (edge.left + 8 - row.left - 60) * (i / 12), row.y + (edge.y - row.y) * (i / 12), { modifiers: ['leftButtonDown'] });
  }
  await until(() => js(`tagsEl.scrollLeft === 0`), 3000);
  check('dragging to the end of the tag row scrolls it, to bring more tags in', hidden.right < 0 && (await js(`tagsEl.scrollLeft`)) === 0, `${hidden.right}`);
  const target = await tagAt('personal');
  for (let i = 1; i <= 6; i += 1) {
    await mouse('mouseMove', edge.left + 8 + (target.x - edge.left - 8) * (i / 6), edge.y + (target.y - edge.y) * (i / 6), { modifiers: ['leftButtonDown'] });
  }
  await wait(60);
  await wait(150);
  const over = await js(`({ into: [...document.querySelectorAll('#tags .drop-into')].map((t) => t.dataset.cat), line: [...document.querySelectorAll('.drop-line')].filter((l) => !l.hidden).length, scroll: listEl.scrollTop, ghost: Math.round(document.querySelector('.drag-ghost').getBoundingClientRect().top), tags: Math.round(tagsEl.getBoundingClientRect().bottom) })`);
  check('dragging a task over a tag lights the tag up (and no drop line)', over.into.join() === 'personal' && over.line === 0, JSON.stringify(over));
  check('…with the dragged task just under the tags, not covering them', over.ghost >= over.tags && over.ghost <= over.tags + 8, `${over.ghost} vs ${over.tags}`);
  await shot('categories-drag');
  await mouse('mouseUp', target.x, target.y);
  await wait(350);
  u = await ui();
  check('dropping it there moves it into that category', saved('mail').category === 'personal' && !u.rows.some((r) => r.id === 'mail') && u.toast === 'Moved to Personal', u.toast);
  check('…and nothing else moved', u.rows.map((r) => r.id).join() === (await js(`orderedGroups().pending.concat(orderedGroups().done).map((t) => t.id).join()`)) && !(await js(`document.querySelector('.drop-into, .drag-ghost')`)));

  // ---- Renaming, colours, order ----
  const work = await tagAt('work');
  await click(work.x, work.y, 2);
  await wait(250);
  check('double-clicking a tag renames it in place', await js(`document.activeElement.classList.contains('tag-input') && document.activeElement.value === 'Work'`));
  await js(`document.activeElement.select()`);
  await type('personal');
  key('Return');
  await wait(250);
  check('a name you already have isn\'t taken (it shakes and waits)', await js(`document.activeElement.classList.contains('taken')`) && savedCats().find((c) => c.id === 'work').name === 'Work');
  await js(`document.activeElement.select()`);
  await type('Office');
  key('Return');
  await wait(300);
  u = await ui();
  check('…a new one is', savedCats().find((c) => c.id === 'work').name === 'Office' && (await tagAt('work')).name === 'Office' && u.placeholder === 'Add to Office…', tagNames(u));
  await catMenu('work');
  const labels = lastMenu.filter((i) => i.label).map((i) => `${i.label}${i.enabled === false ? '(off)' : ''}`);
  check('right-click on a tag: Rename…, Colour, Move left, Move right, Delete', labels.join() === 'Rename…,Colour,Move left,Move right,Delete “Office”', labels.join());
  check('…Colour has eight, with the current one ticked', menuItem(['Colour']).submenu.map((i) => `${i.label}${i.checked ? '*' : ''}`).join() === 'Blue,Orange*,Green,Purple,Pink,Teal,Yellow,Gray');
  clickMenu('Colour', 'Purple');
  await wait(300);
  check('picking a colour saves it', savedCats().find((c) => c.id === 'work').color === 'purple');
  await catMenu('work');
  clickMenu('Move left');
  await wait(300);
  u = await ui();
  check('Move left puts it before Personal', savedCats().map((c) => c.name).join() === 'Office,Personal,Study,Home' && tagNames(u).startsWith('All · Office · Personal'), tagNames(u));
  await catMenu('work');
  check('…where Move left is off', menuItem(['Move left']).enabled === false);
  clickMenu('Rename…');
  await wait(250);
  key('Escape');
  await wait(250);
  check('Rename… then Esc changes nothing (and doesn\'t hide the panel)', savedCats().find((c) => c.id === 'work').name === 'Office' && panel.isVisible() && !(await js(`document.querySelector('.tag-input')`)));

  // ---- A new category with + ----
  await clickTag('+');
  check('+ asks for a name', await js(`document.activeElement.classList.contains('tag-input') && document.activeElement.placeholder === 'New category'`));
  await type('Errands');
  key('Return');
  await wait(300);
  u = await ui();
  const errands = savedCats().find((c) => c.name === 'Errands');
  check('…Return makes it, opens it, and you can type its first task', errands && u.view === errands.id && u.empty === 'Nothing in Errands yet' && u.focus === 'newTask' && u.placeholder === 'Add to Errands…', `${u.view} ${u.empty} ${u.focus}`);

  // ---- Lots of categories: the row scrolls sideways ----
  await js(`for (const n of ['Garden', 'Health', 'Reading', 'Travel', 'Side project']) addCategory(n); save(); render();`);
  await wait(300);
  const sizes = await js(`({ sw: tagsEl.scrollWidth, cw: tagsEl.clientWidth, left: tagsEl.scrollLeft, fade: tagsEl.className, pageScroll: document.scrollingElement.scrollLeft, bodyW: document.body.scrollWidth, winW: innerWidth })`);
  check('with more tags than fit, the row scrolls sideways (the panel doesn\'t)', sizes.sw > sizes.cw + 100 && sizes.bodyW <= sizes.winW && sizes.pageScroll === 0 && /fade-right/.test(sizes.fade), JSON.stringify(sizes));
  await clickTag('all');
  const t0 = await tagAt('all');
  send({ type: 'mouseWheel', x: Math.round(t0.x), y: Math.round(t0.y), deltaX: 0, deltaY: -240, wheelTicksY: -2, canScroll: true });
  await until(() => js(`tagsEl.scrollLeft > 0`), 2000);
  const wheel = await js(`({ left: tagsEl.scrollLeft, fade: tagsEl.className })`);
  check('a mouse wheel scrolls the tags sideways, and the left edge fades', wheel.left > 0 && /fade-left/.test(wheel.fade), JSON.stringify(wheel));
  await js(`tagsEl.scrollLeft = 0; document.activeElement.blur()`);
  await wait(100);
  for (let i = 0; i < 10; i += 1) key('Right');
  await until(() => js(`(() => { const t = tagsEl.querySelector('.tag.on'); return t && t.offsetLeft + t.offsetWidth <= tagsEl.scrollLeft + tagsEl.clientWidth; })()`), 3000);
  const reveal = await js(`(() => { const t = tagsEl.querySelector('.tag.on'); return { name: t.textContent, left: t.offsetLeft, right: t.offsetLeft + t.offsetWidth, sl: tagsEl.scrollLeft, cw: tagsEl.clientWidth }; })()`);
  check('the tag you go to is scrolled into view', reveal.sl > 0 && reveal.right <= reveal.sl + reveal.cw, JSON.stringify(reveal));
  await shot('categories-many');
  await js(`for (const n of ['Garden', 'Health', 'Reading', 'Travel', 'Side project']) categories = categories.filter((c) => c.name !== n); save(); selectCat('all');`);
  await wait(300);

  // ---- Deleting a category ----
  await catMenu(study.id);
  clickMenu('Delete “Study”');
  await wait(300);
  u = await ui();
  check('deleting a category moves its tasks to Unsorted', !savedCats().some((c) => c.id === study.id) && saved('sci').category === null && !u.tags.some((t) => t.cat === study.id), tagNames(u));
  check('…saying so, with Undo', u.toast === 'Deleted “Study”. Its task is in Unsorted.' && u.undoShown, u.toast);
  await js(`document.getElementById('undoBtn').click()`);
  await wait(300);
  check('Undo brings the category back, with its task', savedCats().some((c) => c.id === study.id && c.name === 'Study') && saved('sci').category === study.id && !!(await tagAt(study.id)));

  // ---- Clear (completed) clears what you see ----
  await js(`(() => { findTask('deck').done = true; findTask('deck').completedAt = Date.now(); save(); render(); })()`);
  await clickTag('work');
  await js(`[...document.querySelectorAll('.section button')].find((b) => b.textContent === 'Clear').click()`);
  await wait(300);
  check('"Clear" under Office clears only Office\'s finished tasks', !saved('deck') && !!saved('old'), readFile().tasks.filter((t) => t.done).map((t) => t.id).join());
  await js(`undo()`);
  await wait(200);

  // ---- Unsorted: sort them ----
  await clickTag('none');
  u = await ui();
  check('Unsorted shows the tasks in no category and offers to sort them', u.hint === 'These tasks aren’t in a category yet.' && u.rows.map((r) => r.id).join() === 'dent,old,run', u.rows.map((r) => r.id).join());
  await js(`document.querySelector('.sort-hint button').click()`);
  await wait(300);
  u = await ui();
  check('"Sort them" opens the card (without the intro this time)', u.card && !u.card.intro && u.card.count === '1 of 2' && u.card.task === 'Call the dentist', JSON.stringify(u.card));
  check('…and the number keys work straight away', u.focus !== 'newTask', u.focus);
  check('…the completed one isn\'t asked about (but the daily one is, it comes back)', !(await js(`sortQueue().includes('old')`)) && (await js(`sortQueue().includes('run')`)));
  key('2');
  await wait(300);
  key('3');
  await wait(400);
  u = await ui();
  check('the last pick closes the card: "All sorted 🎉", back to All', !u.card && u.toast === 'All sorted 🎉' && u.view === 'all', `${u.toast} ${u.view}`);
  check('…and Unsorted is gone (only the finished one is left in no category)', !u.tags.some((t) => t.cat === 'none') && saved('dent').category === 'personal' && saved('run').category === study.id, tagNames(u));

  // ---- Export and import ----
  exportFile = path.join(UD, 'export.json');
  importFile = path.join(UD, 'import.json');
  await js(`window.taskpop.updateSetting('keepOpen', true)`);
  const sw = await openSettings();
  await sw.webContents.executeJavaScript(`document.getElementById('exportBtn').click()`, true);
  await until(() => fs.existsSync(exportFile));
  const out = JSON.parse(fs.readFileSync(exportFile, 'utf8'));
  check('Export includes your categories', (out.categories || []).map((c) => c.name).join() === 'Office,Personal,Study,Home,Errands' && out.tasks.find((t) => t.id === 'deck').category === 'work');
  fs.writeFileSync(importFile, JSON.stringify({ categories: [{ id: 'x1', name: 'office', color: 'teal' }, { id: 'personal', name: 'Garden', color: 'green' }], tasks: [
    { id: 'i1', title: 'Weekly report', category: 'x1' },
    { id: 'i2', title: 'Plant the tulips', category: 'personal' },
    { id: 'i3', title: 'Old idea' },
  ] }));
  await sw.webContents.executeJavaScript(`document.getElementById('importBtn').click()`, true);
  await until(() => saved('i3'));
  const garden = savedCats().find((c) => c.name === 'Garden');
  check('Import: a category with the same name as yours is yours', saved('i1').category === 'work' && !savedCats().some((c) => c.name === 'office'));
  check('…a new one is added (with a new id if its id is taken)', garden && garden.id !== 'personal' && saved('i2').category === garden.id && saved('mail').category === 'personal', JSON.stringify(garden));
  check('…and a task without one is Unsorted', saved('i3').category === null);
  await until(() => js(`categories.some((c) => c.name === 'Garden')`));
  check('the panel gets the new category too', !!(await tagAt(garden.id)));
  // a stale save from the panel keeps the imported category
  await js(`window.taskpop.saveTasks(tasks, knownRev - 1, categories.filter((c) => c.name !== 'Garden'))`);
  await wait(400);
  check('…and a save from an older copy of the list doesn\'t lose it', savedCats().some((c) => c.name === 'Garden') && saved('i2').category === garden.id);
  sw.close();

  // ---- Look ----
  await js(`selectCat('all'); hideToast(); selectedId = null; updateState = null; renderUpdate(); render(); tagsEl.scrollLeft = 0;`);
  await wait(300);
  await shot('categories');
}

async function openSettings() {
  await js(`window.taskpop.openSettings()`);
  let sw = null;
  await until(() => (sw = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('settings.html'))) && !sw.webContents.isLoading());
  await wait(600);
  return sw;
}
