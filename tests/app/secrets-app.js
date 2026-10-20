// v1.10: Secrets, on the real main process as macOS or Windows (TP_PLATFORM=darwin|win32), used
// with real mouse and keyboard input. The lock at the end of the "Add a task" bar opens them;
// New saves a name with a username and password, encrypted at once; Show asks the system to
// confirm it's you; Copy (or selecting part and Ctrl+C) copies, and the clipboard is cleared.
// TP_MODE=migrate: starts from a 1.9 quick note instead, which becomes secrets.
// Stand-ins: safeStorage (a reversible scramble, so files can be checked for plain text), and
// Touch ID (Mac: Electron's promptTouchID) or Windows Hello (Windows: app/verify.js).
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'darwin';
const MODE = process.env.TP_MODE || 'new';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Menu, Notification, systemPreferences, globalShortcut, clipboard, safeStorage, nativeTheme, shell } = electron;
const opened = [];
shell.openExternal = async (url) => { opened.push(url); };
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const tag = `${PLATFORM === 'win32' ? 'win' : 'mac'}${MODE === 'migrate' ? '-migrate' : ''}${process.env.TP_DARK ? '-dark' : ''}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[s:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

require(`${SRC}/doubletap.js`).createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
require(`${SRC}/secrets.js`).config.clipboardClearMs = 1500;
let shortcut = null;
globalShortcut.register = (acc, cb) => { shortcut = cb; return true; };
globalShortcut.unregister = () => {};
app.getVersion = () => '1.10.0';
if (!app.hide) app.hide = () => {};
if (!app.show) app.show = () => {};
Tray.prototype.setTitle = Tray.prototype.setTitle || function () {};
systemPreferences.getAccentColor = () => '0a84ffff';
Notification.isSupported = () => true;
Notification.prototype.show = function () {};
let lastMenu = null;
const realBuild = Menu.buildFromTemplate.bind(Menu);
Menu.buildFromTemplate = (tpl) => { const m = realBuild(tpl); m.popup = () => { lastMenu = tpl; }; return m; };

// safeStorage: a scramble (not encryption, but nothing readable in the files) that we can undo
const enc = { available: true, encrypted: [], decrypted: 0 };
safeStorage.isEncryptionAvailable = () => enc.available;
safeStorage.encryptString = (text) => { enc.encrypted.push(text); return Buffer.concat([Buffer.from('FAKE'), Buffer.from(text, 'utf8').map((b) => b ^ 0x5a)]); };
safeStorage.decryptString = (buf) => { enc.decrypted += 1; return Buffer.from(buf.subarray(4).map((b) => b ^ 0x5a)).toString('utf8'); };
const scramble = (t) => Buffer.concat([Buffer.from('FAKE'), Buffer.from(t, 'utf8').map((b) => b ^ 0x5a)]).toString('base64');

// Confirming it's you: the answer comes when the test says
const auth = { asked: [], next: 'yes', release: null, windows: [] };
const answerFor = () => new Promise((resolve) => { auth.release = () => resolve(auth.next); });
if (PLATFORM === 'darwin') {
  systemPreferences.promptTouchID = async (reason) => {
    auth.asked.push(reason);
    const a = await answerFor();
    if (a === 'no') throw new Error('Canceled by user.');
  };
} else {
  require(`${SRC}/verify.js`).createVerifier = () => ({
    async verify(win, action, name) {
      auth.asked.push(`${action} ${name}`);
      auth.windows.push(!!win && win === BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html')));
      const a = await answerFor();
      if (a === 'nohello') return { ok: false, setupHello: true, message: 'To show secrets, set up Windows Hello first: a PIN is enough. It’s in Windows Settings → Accounts → Sign-in options.' };
      return a === 'yes' ? { ok: true } : { ok: false, canceled: true };
    },
  });
}
const askedFor = (action, name) => (PLATFORM === 'darwin' ? `${action === 'edit' ? 'change' : 'show'} “${name}”` : `${action} ${name}`);

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const d = new Date();
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, tourDone: true, lastVersion: '1.10.0', lastDay: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ keepOpen: false, noteOpen: MODE === 'migrate' }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, categories: [], tasks: [
  { id: 'a', title: 'Reply to Sara', createdAt: Date.now() },
  { id: 'b', title: 'Book flights', createdAt: Date.now() },
] }));
if (MODE === 'migrate') {
  // A note as TaskPop 1.9 saved it
  const note = { version: 1, segments: [
    { t: 'text', v: 'Uni pass\n' }, { t: 'secret', id: 's1' },
    { t: 'text', v: '\nWi-Fi: Home-5G\nDoor code: ' }, { t: 'secret', id: 's2' },
  ], secrets: { s1: scramble('sam.lee@uni.example\nm4ngoTree-81'), s2: scramble('4071') } };
  fs.writeFileSync(path.join(UD, 'notes.json'), JSON.stringify(note));
  fs.writeFileSync(path.join(UD, 'notes.json.bak'), JSON.stringify(note));
}
app.setPath('userData', UD);
process.argv.push('--show');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return false; };
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const secretsFile = () => (fs.existsSync(path.join(UD, 'secrets.json')) ? fs.readFileSync(path.join(UD, 'secrets.json'), 'utf8') : '');
const secretsBak = () => (fs.existsSync(path.join(UD, 'secrets.json.bak')) ? fs.readFileSync(path.join(UD, 'secrets.json.bak'), 'utf8') : '');
const saved = () => JSON.parse(secretsFile() || '{"items":[]}').items;
const savedSettings = () => JSON.parse(fs.readFileSync(path.join(UD, 'settings.json'), 'utf8'));
const savedTasks = () => JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks;
const menuLabels = () => (lastMenu || []).filter((i) => i.label).map((i) => i.label).join();
const menuItem = (label) => (lastMenu || []).find((i) => i.label === label);

require(`${SRC}/main.js`);

let panel;
let js;
const send = (ev) => panel.webContents.sendInputEvent(ev);
const MOD = PLATFORM === 'darwin' ? 'meta' : 'control';
const key = (k, modifiers = []) => { send({ type: 'keyDown', keyCode: k, modifiers }); if (!modifiers.length || k.length > 1) send({ type: 'char', keyCode: k, modifiers }); send({ type: 'keyUp', keyCode: k, modifiers }); };
const type = async (text) => { for (const ch of text) { send({ type: 'char', keyCode: ch }); await wait(6); } };
const click = async (x, y, button = 'left') => {
  send({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button, clickCount: 1 });
  await wait(15);
  send({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button, clickCount: 1 });
  await wait(80);
};
const box = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width, h: r.height, bottom: r.bottom, top: r.top }; })()`);
const clickOn = async (sel, button = 'left') => {
  const b = await box(sel);
  if (!b) throw new Error(`nothing to click: ${sel}`);
  await click(b.x, b.y, button);
};
const state = () => js(`({
  open: !document.getElementById('noteDrawer').hidden,
  lock: document.getElementById('noteBtn').className,
  title: document.getElementById('secretsTitle').textContent,
  empty: !!document.querySelector('.secrets-empty'),
  form: !document.getElementById('secretForm').hidden,
  formTitle: document.getElementById('secretFormTitle').textContent,
  formLabels: [...document.querySelectorAll('#secretForm .secret-input > span:first-child')].map((s) => s.textContent),
  formNote: document.getElementById('secretFormNote').textContent,
  items: [...document.querySelectorAll('.secret-item')].map((r) => ({
    id: r.dataset.id,
    name: r.querySelector('.secret-title').textContent,
    summary: (r.querySelector('.secret-summary') || {}).textContent || '',
    shown: r.classList.contains('shown'),
    button: (r.querySelector('.secret-head .secret-btn') || {}).textContent || '',
    fields: [...r.querySelectorAll('.secret-field')].map((f) => ({ label: (f.querySelector('.secret-label') || {}).textContent || '', value: f.querySelector('.secret-value').textContent, copy: !!f.querySelector('.secret-copy') })),
    asking: !!r.querySelector('.secret-ask'),
  })),
  focus: document.activeElement.id || document.activeElement.className,
  status: document.getElementById('noteStatus').textContent,
  hint: document.getElementById('noteHint').textContent,
  selection: getSelection().toString(),
  text: document.body.innerText,
})`);
/** Drag the mouse across characters [from, to) of the shown value that contains needle. */
const dragAcross = async (needle, from, to) => {
  const r = await js(`(() => {
    for (const v of document.querySelectorAll('.secret-item.shown .secret-value')) {
      if (!v.firstChild || !v.textContent.includes(${JSON.stringify(needle)})) continue;
      const rg = document.createRange(); rg.setStart(v.firstChild, ${from}); rg.setEnd(v.firstChild, ${to});
      const a = rg.getClientRects()[0];
      return { x1: a.left + 0.5, x2: a.right - 0.5, y: (a.top + a.bottom) / 2 };
    }
    return null;
  })()`);
  if (!r) return false;
  send({ type: 'mouseDown', x: Math.round(r.x1), y: Math.round(r.y), button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i += 1) {
    send({ type: 'mouseMove', x: Math.round(r.x1 + ((r.x2 - r.x1) * i) / 8), y: Math.round(r.y), button: 'left', modifiers: ['leftButtonDown'] });
    await wait(15);
  }
  send({ type: 'mouseUp', x: Math.round(r.x2), y: Math.round(r.y), button: 'left', clickCount: 1 });
  await wait(150);
  return true;
};
const shot = async (name) => fs.writeFileSync(`${P.SHOTS}/${name}-${tag}.png`, (await panel.webContents.capturePage()).toPNG());
const confirmWords = PLATFORM === 'darwin' ? /Touch ID or your Mac password/ : /Windows Hello/;

async function newSecretFlow() {
  // ---------- Opening it ----------
  let s = await state();
  const bar = await box('.input-bar');
  const lock = await box('#noteBtn');
  check('a lock sits at the end of the "Add a task" bar; Secrets starts closed', !s.open && lock && Math.abs(lock.y - bar.y) < 3 && lock.x > bar.x);
  await click(lock.x, lock.y);
  await wait(250);
  s = await state();
  const drawer = await box('#noteDrawer');
  const barNow = await box('.input-bar');
  check('clicking it opens "Secrets" under the bar', s.open && /open/.test(s.lock) && s.title === 'Secrets' && drawer.top >= barNow.bottom - 1);
  check('…which says what it\'s for when there\'s nothing in it yet, with "Add a secret"', s.empty && /Keep your passwords here/.test(s.text) && confirmWords.test(s.text) && !!(await box('.secrets-first')));
  await until(() => savedSettings().noteOpen === true);
  check('…and it stays open next time', savedSettings().noteOpen === true);

  // ---------- New ----------
  await js(`selectedId = 'a'; render();`);
  await clickOn('.secrets-first');
  await wait(150);
  s = await state();
  check('"Add a secret" opens a form: Name, Username or email, Password', s.form && s.formTitle === 'New secret' && s.formLabels.join() === 'Name,Username or email,Password' && s.focus === 'secretName' && (await js(`secretForm.rows[1].input.type`)) === 'password', `${s.formTitle} / ${s.formLabels.join()} / ${s.focus}`);
  await type('Uni login');
  key('Tab');
  await type('sam.lee@uni.example');
  key('Tab');
  await type('m4ngo Tree-81');
  key('Backspace');
  await type('1');
  await wait(100);
  check('typing in the form never acts on the tasks (Space, Backspace)', savedTasks().length === 2 && !savedTasks().some((t) => t.done));
  await clickOn('.secret-eye');
  check('the eye shows what you typed in the password box', (await js(`secretForm.rows[1].input.type`)) === 'text' && (await js(`secretForm.rows[1].input.value`)) === 'm4ngo Tree-81');
  s = await state();
  check('…and the line under it says it\'s encrypted as soon as it\'s saved', /encrypted on this (Mac|PC) as soon as you save it/.test(s.hint), s.hint);
  key('Return');
  await until(async () => (await state()).items.length === 1);
  await wait(300);
  s = await state();
  check('Return saves it: "Uni login", hidden, showing what it holds', !s.form && s.items[0].name === 'Uni login' && s.items[0].summary === 'Username · Password' && !s.items[0].shown && s.items[0].button === 'Show' && /Saved “Uni login”/.test(s.status), JSON.stringify(s.items));
  const file = secretsFile();
  check('…encrypted the moment it was saved: neither secrets.json nor its backup has the username or password in it', enc.encrypted.includes('m4ngo Tree-81') && enc.encrypted.includes('sam.lee@uni.example') && !file.includes('m4ngo') && !file.includes('sam.lee') && !secretsBak().includes('m4ngo') && saved().length === 1, file.slice(0, 200));
  check('…and the page itself no longer has them', !s.text.includes('sam.lee') && !(await js('document.documentElement.innerHTML')).includes('m4ngo'));
  check('the line under the list says how to see it', /Click Show to see a secret/.test(s.hint) && confirmWords.test(s.hint), s.hint);

  // Esc closes the form, not the panel, and keeps nothing
  await clickOn('#secretNewBtn');
  await type('Half typed');
  key('Escape');
  await wait(200);
  s = await state();
  check('Esc in the form closes the form (the panel stays), and keeps nothing', !s.form && panel.isVisible() && s.items.length === 1 && saved().length === 1);

  // ---------- Show ----------
  const id = s.items[0].id;
  await clickOn('.secret-item .secret-btn');
  await until(() => auth.asked.length === 1);
  check(PLATFORM === 'darwin' ? 'Show asks for Touch ID or the Mac password first, naming the secret' : 'Show asks Windows Hello first, over the panel, naming the secret',
    auth.asked[0] === askedFor('show', 'Uni login') && (PLATFORM === 'darwin' || auth.windows[0] === true), auth.asked.join());
  panel.emit('blur'); // the system's dialog took the focus
  await wait(300);
  s = await state();
  check('…the panel stays open while the system asks, and nothing shows before the answer', panel.isVisible() && /Checking/.test(s.items[0].button) && !s.text.includes('sam.lee') && enc.decrypted === 0);
  auth.next = 'yes';
  auth.release();
  await until(async () => (await state()).items[0].shown);
  s = await state();
  check('confirmed: it shows its username and password, each with Copy', s.items[0].fields.length === 2 && s.items[0].fields[0].label === 'Username' && s.items[0].fields[0].value === 'sam.lee@uni.example'
    && s.items[0].fields[1].label === 'Password' && s.items[0].fields[1].value === 'm4ngo Tree-81' && s.items[0].fields.every((f) => f.copy) && s.items[0].button === 'Hide', JSON.stringify(s.items[0]));
  panel.emit('blur'); // (as on a real Mac: the dialog closes just after it answers)
  await wait(400);
  check('when the system\'s dialog closes, the panel stays open, showing it', panel.isVisible() && (await state()).items[0].shown);
  check('…the line under it says how to copy it and when it hides again', /Click Copy, or select part of it and press/.test((await state()).hint) && /Hides again in \d+ s/.test((await state()).hint));
  await shot('secrets-shown');

  // ---------- Copy ----------
  await clipboard.writeText('before');
  await js(`(() => { const b = [...document.querySelectorAll('.secret-item.shown .secret-copy')][0]; b.scrollIntoView({ block: 'nearest' }); })()`);
  const copyUser = await js(`(() => { const r = document.querySelectorAll('.secret-item.shown .secret-copy')[0].getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);
  await click(copyUser.x, copyUser.y);
  await until(async () => (await clipboard.readText()) === 'sam.lee@uni.example');
  s = await state();
  check('the username\'s Copy copies just the username', (await clipboard.readText()) === 'sam.lee@uni.example' && /Username copied/.test(s.status), s.status);
  await wait(1900);
  check('…and it comes off the clipboard after a while', (await clipboard.readText()) === '');
  const copyPass = await js(`(() => { const r = document.querySelectorAll('.secret-item.shown .secret-copy')[1].getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);
  await click(copyPass.x, copyPass.y);
  await until(async () => (await clipboard.readText()) === 'm4ngo Tree-81');
  check('the password\'s Copy, just the password', (await clipboard.readText()) === 'm4ngo Tree-81');
  await dragAcross('m4ngo', 0, 5);
  s = await state();
  check('part of it can be selected with the mouse', s.selection === 'm4ngo' && s.items[0].shown, JSON.stringify(s.selection));
  await clipboard.writeText('before');
  key('c', ['control']); // (the editing keys are the real system's: Ctrl on this Linux test machine)
  await until(async () => (await clipboard.readText()) === 'm4ngo');
  check(`…and ${PLATFORM === 'darwin' ? '⌘C' : 'Ctrl+C'} copies only that part`, (await clipboard.readText()) === 'm4ngo');
  key('Backspace');
  key(' ');
  await wait(150);
  check('keys pressed in Secrets never act on the tasks', savedTasks().length === 2 && !savedTasks().some((t) => t.done));
  await clickOn('.secret-item.shown .secret-btn');
  await wait(150);
  s = await state();
  check('Hide hides it again, and its values are gone from the page', !s.items[0].shown && s.items[0].button === 'Show' && !s.text.includes('sam.lee') && !(await js('document.documentElement.innerHTML')).includes('m4ngo'));

  // Cancel in the system's dialog
  await clickOn('.secret-item .secret-title'); // (clicking its name shows it too)
  await until(() => auth.asked.length === 2);
  auth.next = 'no';
  auth.release();
  await wait(300);
  s = await state();
  check('clicking its name asks too; Cancel in the system\'s dialog: it stays hidden, nothing said', !s.items[0].shown && enc.decrypted === 2 && !/didn/.test(s.status) && s.items[0].button === 'Show', `${enc.decrypted}`);

  // (v1.10.1) Windows without Windows Hello: how to set it up, with a button to the right page
  if (PLATFORM === 'win32') {
    await clickOn('.secret-item .secret-btn');
    await until(() => auth.asked.length === 3);
    auth.next = 'nohello';
    auth.release();
    await until(async () => /set up Windows Hello/.test((await state()).status));
    s = await state();
    check('Windows without Windows Hello: it stays hidden and says to set up Windows Hello, with "Open Sign-in options"', !s.items[0].shown && /a PIN is enough/.test(s.status) && !!(await box('.secrets-status-btn')), s.status);
    await clickOn('.secrets-status-btn');
    await until(() => opened.length === 1);
    check('…which opens Windows Settings at Sign-in options', opened[0] === 'ms-settings:signinoptions', opened.join());
    auth.asked.push('(Windows Hello set-up)'); // (keeps the counts below the same on both systems)
  } else {
    auth.asked.push('(Mac)', '(Mac)'); // (keeps the counts below the same on both systems)
  }

  // Shown, then the panel closes
  await clickOn('.secret-item .secret-btn');
  await until(() => auth.asked.length === 5);
  auth.next = 'yes';
  auth.release();
  await until(async () => (await state()).items[0].shown);
  panel.emit('blur'); // the dialog closing
  await wait(1700);
  panel.emit('blur'); // and now you click somewhere else
  await until(() => !panel.isVisible());
  s = await state();
  check('clicking somewhere else afterwards still closes the panel, as always, and hides it', !panel.isVisible() && !s.items[0].shown && !s.text.includes('sam.lee'));
  await js(`window.taskpop.updateSetting('keepOpen', true)`);
  shortcut();
  await until(() => panel.isVisible() && panel.getOpacity() > 0.9);
  await wait(200);

  // ---------- ⋯: Edit, Delete ----------
  lastMenu = null;
  await clickOn('.secret-item .secret-more');
  await until(() => lastMenu);
  check('⋯ (or a right-click): Show…, Edit…, Delete…', menuLabels() === 'Show…,Edit…,Delete…', menuLabels());
  menuItem('Edit…').click();
  await until(() => auth.asked.length === 6);
  check('Edit… asks first too', auth.asked[5] === askedFor('edit', 'Uni login'), auth.asked[5]);
  auth.next = 'yes';
  auth.release();
  await until(async () => (await state()).form);
  s = await state();
  check('…then opens the form with what\'s in it', s.formTitle === 'Edit “Uni login”' && s.formLabels.join() === 'Name,Username,Password'
    && (await js(`secretForm.rows.map((r) => r.input.value).join('|')`)) === 'sam.lee@uni.example|m4ngo Tree-81', `${s.formTitle} / ${s.formLabels.join()} / ${await js(`secretForm.rows.map((r) => r.input.value).join('|')`)}`);
  await js(`secretForm.rows[1].input.focus(); secretForm.rows[1].input.select()`);
  await type('new-pass!');
  await clickOn('#secretSave');
  await until(async () => !(await state()).form);
  await wait(200);
  check('Save changes it, still encrypted', JSON.stringify(saved()[0].fields.map((f) => f.label)) === '["Username","Password"]' && !secretsFile().includes('new-pass') && enc.encrypted.includes('new-pass!') && /Changed “Uni login”/.test((await state()).status), `${(await state()).formNote} | ${(await state()).status} | ${JSON.stringify(saved()[0].fields.map((f) => f.label))}`);
  const tooLate = await js(`window.taskpop.updateSecret(${JSON.stringify(id)}, { name: 'X', fields: [{ label: 'Password', value: 'sneaky' }] })`);
  check('changing it again needs a new confirmation', tooLate && tooLate.ok === false && !enc.encrypted.includes('sneaky'));

  // A second one, then delete the first
  await clickOn('#secretNewBtn');
  await type('Home Wi-Fi');
  key('Tab');
  key('Tab');
  await type('pass-5G');
  key('Return');
  await until(async () => (await state()).items.length === 2);
  s = await state();
  check('a secret with only a password: "Home Wi-Fi", Password', s.items[1].name === 'Home Wi-Fi' && s.items[1].summary === 'Password' && saved()[1].fields.length === 1);
  lastMenu = null;
  await clickOn('.secret-item .secret-title', 'right');
  await until(() => lastMenu);
  menuItem('Delete…').click();
  await wait(200);
  s = await state();
  check('Delete… asks in the list first ("Delete it?")', s.items[0].asking && s.items.length === 2);
  await clickOn('.secret-item .secret-btn.danger');
  await until(async () => (await state()).items.length === 1);
  s = await state();
  check('…and Delete takes it away, from the file too', s.items[0].name === 'Home Wi-Fi' && saved().length === 1 && /Deleted “Uni login”/.test(s.status) && !secretsFile().includes(id));

  // ---------- When it can't be encrypted ----------
  enc.available = false;
  await clickOn('#secretNewBtn');
  await type('Bank');
  key('Tab');
  key('Tab');
  await type('1234');
  key('Return');
  await wait(400);
  s = await state();
  check('if the computer can\'t encrypt it, it isn\'t saved, and the form says so', s.form && /can’t encrypt/.test(s.formNote) && saved().length === 1 && !secretsFile().includes('1234'), s.formNote);
  enc.available = true;
  key('Escape');

  // ---------- After a restart (a reload of the panel) ----------
  panel.webContents.reload();
  await until(() => js('typeof renderSecrets === "function" && !!document.querySelector(".secret-item")'), 6000);
  await wait(400);
  s = await state();
  check('opening again: Secrets is open, with "Home Wi-Fi" hidden', s.open && s.items.length === 1 && !s.items[0].shown && s.items[0].name === 'Home Wi-Fi');

  // ---------- ⌘J / Ctrl+J ----------
  await js('inputEl.focus()');
  key('j', [MOD]);
  await wait(200);
  check(`${PLATFORM === 'darwin' ? '⌘J' : 'Ctrl+J'} closes Secrets…`, !(await state()).open);
  key('j', [MOD]);
  await wait(200);
  check('…and opens it', (await state()).open);

  // ---------- Look ----------
  await js(`(async () => {
    secretItems = [{ id: 'l1', name: 'Uni login', fields: [{ label: 'Username', hidden: true }, { label: 'Password', hidden: true }] },
      { id: 'l2', name: 'Home Wi-Fi', fields: [{ label: 'Password', hidden: true }] }, { id: 'l3', name: 'Bank PIN', fields: [{ label: 'PIN', hidden: true }] }];
    document.activeElement.blur(); selectedId = null; render(); renderSecrets(); sec.status.textContent = '';
  })()`);
  await wait(300);
  await shot('secrets-list');
  await js(`openSecretForm(); sec.name.value = 'Netflix'; secretForm.rows[0].input.value = 'saif@example.com'; secretForm.rows[1].input.value = 'hunter2'`);
  await wait(200);
  await shot('secrets-form');
  await js(`closeSecretForm()`);
}

async function migrateFlow() {
  let s = await state();
  const items = saved();
  check('a 1.9 quick note becomes secrets: "Uni pass", "Door code", and the rest as "Notes"', s.open && JSON.stringify(s.items.map((i) => i.name)) === '["Uni pass","Door code","Notes"]' && items.length === 3, JSON.stringify(s.items.map((i) => i.name)));
  check('…the old note and its backup are gone, and nothing was decrypted to do it', !fs.existsSync(path.join(UD, 'notes.json')) && !fs.existsSync(path.join(UD, 'notes.json.bak')) && enc.decrypted === 0);
  check('…and it says what happened', /Your quick note is now Secrets/.test(s.status), s.status);
  check('"Notes" shows its text straight away (it was never hidden), with no Show', JSON.stringify(s.items[2].fields.map((f) => f.value)) === '["Wi-Fi: Home-5G"]' && s.items[2].button === '');
  await clickOn('.secret-item .secret-btn');
  await until(() => auth.asked.length === 1);
  auth.next = 'yes';
  auth.release();
  await until(async () => (await state()).items[0].shown);
  s = await state();
  check('"Uni pass" shows its two lines one by one, each with Copy (the email and the password under it)', JSON.stringify(s.items[0].fields.map((f) => f.value)) === '["sam.lee@uni.example","m4ngoTree-81"]' && s.items[0].fields.every((f) => f.copy));
  await clipboard.writeText('before');
  const second = await js(`(() => { const r = document.querySelectorAll('.secret-item.shown .secret-copy')[1].getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);
  await click(second.x, second.y);
  await until(async () => (await clipboard.readText()) === 'm4ngoTree-81');
  check('…so the password can be copied on its own', (await clipboard.readText()) === 'm4ngoTree-81');
  await shot('secrets-migrated');
  // Edit splits the two lines into two fields
  await js(`hideSecret(${JSON.stringify(s.items[0].id)})`);
  lastMenu = null;
  await clickOn('.secret-item .secret-more');
  await until(() => lastMenu);
  menuItem('Edit…').click();
  await until(() => auth.asked.length === 2);
  auth.next = 'yes';
  auth.release();
  await until(async () => (await state()).form);
  s = await state();
  check('editing it: one box for each line', s.formLabels.join() === 'Name,Line 1,Line 2', s.formLabels.join());
  key('Escape');
}

app.whenReady().then(async () => {
  if (process.env.TP_DARK) nativeTheme.themeSource = 'dark';
  try {
    await wait(2500);
    panel = panelWin();
    panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
    js = (c) => panel.webContents.executeJavaScript(c, true);
    panel.focus();
    await until(() => panel.isVisible());
    if (MODE === 'migrate') await migrateFlow();
    else await newSecretFlow();
  } catch (err) {
    errors.push('TEST ' + err.stack);
  }
  console.log(`[s:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[s:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});
