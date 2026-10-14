// v1.9: the quick note, on the real main process as macOS or Windows (TP_PLATFORM=darwin|win32),
// typed into with real keyboard input. The arrow opens it under the "Add a task" bar; hidden text
// is encrypted at once and shows as ••••••; showing or copying it asks the system to confirm it's
// you. Stand-ins: safeStorage (a reversible scramble, so files can be checked for plain text),
// and Touch ID (Mac: Electron's promptTouchID) or Windows Hello (Windows: app/verify.js).
const P = require('../paths');
const PLATFORM = process.env.TP_PLATFORM || 'darwin';
Object.defineProperty(process, 'platform', { value: PLATFORM });
const electron = require('electron');
if (PLATFORM === 'darwin') electron.Menu.setApplicationMenu = () => {};
const { app, Tray, BrowserWindow, Menu, Notification, systemPreferences, globalShortcut, clipboard, safeStorage, nativeTheme } = electron;
const fs = require('fs');
const path = require('path');

const SRC = process.env.TP_SRC || P.APP;
const tag = `${PLATFORM === 'win32' ? 'win' : 'mac'}${process.env.TP_DARK ? '-dark' : ''}`;
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[n:${tag}] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

require(`${SRC}/doubletap.js`).createKeySource = () => ({ flags: () => 0, activity: () => 0, hasAccess: () => true, requestAccess: () => true });
require(`${SRC}/winfocus.js`).createWinFocus = () => () => {};
require(`${SRC}/updater.js`).config.api = 'http://127.0.0.1:9/none';
require(`${SRC}/notes.js`).config.clipboardClearMs = 1500;
let shortcut = null;
globalShortcut.register = (acc, cb) => { shortcut = cb; return true; };
globalShortcut.unregister = () => {};
app.getVersion = () => '1.9.0';
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
    async verify(win, action) {
      auth.asked.push(action);
      auth.windows.push(!!win && win === BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html')));
      const a = await answerFor();
      return a === 'yes' ? { ok: true } : { ok: false, canceled: true };
    },
  });
}

const errors = [];
process.on('uncaughtException', (e) => errors.push('MAIN ' + e.stack));
const UD = process.env.TP_USERDATA;
fs.mkdirSync(UD, { recursive: true });
const d = new Date();
fs.writeFileSync(path.join(UD, 'meta.json'), JSON.stringify({ firstRunDone: true, tourDone: true, lastVersion: '1.9.0', lastDay: `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }));
fs.writeFileSync(path.join(UD, 'settings.json'), JSON.stringify({ keepOpen: false }));
fs.writeFileSync(path.join(UD, 'tasks.json'), JSON.stringify({ version: 1, categories: [], tasks: [
  { id: 'a', title: 'Reply to Sara', createdAt: Date.now() },
  { id: 'b', title: 'Book flights', createdAt: Date.now() },
] }));
app.setPath('userData', UD);
process.argv.push('--show');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, ms = 5000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await wait(50); } return false; };
const panelWin = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().endsWith('index.html'));
const noteFile = () => fs.readFileSync(path.join(UD, 'notes.json'), 'utf8');
const noteBak = () => (fs.existsSync(path.join(UD, 'notes.json.bak')) ? fs.readFileSync(path.join(UD, 'notes.json.bak'), 'utf8') : '');
const savedNote = () => JSON.parse(noteFile());
const savedSettings = () => JSON.parse(fs.readFileSync(path.join(UD, 'settings.json'), 'utf8'));
const savedTasks = () => JSON.parse(fs.readFileSync(path.join(UD, 'tasks.json'), 'utf8')).tasks;
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

require(`${SRC}/main.js`);

let panel;
let js;
const send = (ev) => panel.webContents.sendInputEvent(ev);
const MOD = PLATFORM === 'darwin' ? 'meta' : 'control';
const key = (k, modifiers = []) => { send({ type: 'keyDown', keyCode: k, modifiers }); if (!modifiers.length || k.length > 1) send({ type: 'char', keyCode: k, modifiers }); send({ type: 'keyUp', keyCode: k, modifiers }); };
const type = async (text) => { for (const ch of text) { if (ch === '\n') key('Return'); else send({ type: 'char', keyCode: ch }); await wait(6); } };
const click = async (x, y, button = 'left') => {
  send({ type: 'mouseDown', x: Math.round(x), y: Math.round(y), button, clickCount: 1 });
  await wait(15);
  send({ type: 'mouseUp', x: Math.round(x), y: Math.round(y), button, clickCount: 1 });
  await wait(60);
};
const box = (sel) => js(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width, h: r.height, bottom: r.bottom, top: r.top }; })()`);
const state = () => js(`({
  open: !document.getElementById('noteDrawer').hidden,
  arrow: document.getElementById('noteBtn').className,
  text: noteEditor.textContent,
  chips: [...noteEditor.querySelectorAll('.secret')].map((c) => ({ id: c.dataset.id, shown: c.classList.contains('shown'), text: [...c.querySelectorAll('.secret-text')].map((t) => t.textContent).join('\\n') })),
  segs: noteSegments(),
  focus: document.activeElement === noteEditor ? 'editor' : (document.activeElement.id || document.activeElement.className),
  hideEnabled: !document.getElementById('noteHideBtn').disabled,
  status: document.getElementById('noteStatus').textContent,
  hint: document.getElementById('noteHint').textContent,
  selection: getSelection().toString(),
  addOpen: !document.getElementById('noteAdd').hidden,
})`);
/** Select a piece of the note's text, as a drag with the mouse would. */
const select = (needle) => js(`(() => {
  const walker = document.createTreeWalker(noteEditor, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = walker.nextNode())) {
    const i = n.nodeValue.indexOf(${JSON.stringify(needle)});
    if (i !== -1) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + ${needle.length}); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; }
  }
  return false;
})()`);
/** Drag the mouse across characters [from, to) of the first text containing `needle` inside a hidden piece that shows. */
const dragAcross = async (needle, from, to) => {
  const r = await js(`(() => {
    for (const t of document.querySelectorAll('.secret.shown .secret-text')) {
      if (!t.firstChild || !t.textContent.includes(${JSON.stringify(needle)})) continue;
      const rg = document.createRange(); rg.setStart(t.firstChild, ${from}); rg.setEnd(t.firstChild, ${to});
      const rects = rg.getClientRects(); const a = rects[0]; const b = rects[rects.length - 1];
      return { x1: a.left + 0.5, y1: (a.top + a.bottom) / 2, x2: b.right - 0.5, y2: (b.top + b.bottom) / 2 };
    }
    return null;
  })()`);
  if (!r) return false;
  send({ type: 'mouseDown', x: Math.round(r.x1), y: Math.round(r.y1), button: 'left', clickCount: 1 });
  for (let i = 1; i <= 8; i += 1) {
    send({ type: 'mouseMove', x: Math.round(r.x1 + ((r.x2 - r.x1) * i) / 8), y: Math.round(r.y1 + ((r.y2 - r.y1) * i) / 8), button: 'left', modifiers: ['leftButtonDown'] });
    await wait(15);
  }
  send({ type: 'mouseUp', x: Math.round(r.x2), y: Math.round(r.y2), button: 'left', clickCount: 1 });
  await wait(150);
  return true;
};
const shot = async (name) => fs.writeFileSync(`${P.SHOTS}/${name}-${tag}.png`, (await panel.webContents.capturePage()).toPNG());

app.whenReady().then(async () => {
  if (process.env.TP_DARK) nativeTheme.themeSource = 'dark';
  try {
    await wait(2500);
    panel = panelWin();
    panel.webContents.on('console-message', (e) => { if (e.level === 'error') errors.push('panel: ' + e.message); });
    js = (c) => panel.webContents.executeJavaScript(c, true);
    panel.focus();
    await until(() => panel.isVisible());

    // ---------- Opening it ----------
    let s = await state();
    const bar = await box('.input-bar');
    const arrow = await box('#noteBtn');
    check('a small arrow sits at the end of the "Add a task" bar; the note starts closed', !s.open && arrow && Math.abs(arrow.y - bar.y) < 3 && arrow.x > bar.x, JSON.stringify(arrow));
    await click(arrow.x, arrow.y);
    await wait(250);
    s = await state();
    const drawer = await box('#noteDrawer');
    const barNow = await box('.input-bar');
    check('clicking it opens the quick note under the bar, ready to type', s.open && /open/.test(s.arrow) && drawer.top >= barNow.bottom - 1 && s.focus === 'editor', `${drawer.top} vs ${barNow.bottom}, ${s.focus}`);
    await until(() => savedSettings().noteOpen === true);
    check('…and it stays open next time', savedSettings().noteOpen === true);

    // ---------- Typing ----------
    await js(`selectedId = 'a'; render(); noteEditor.focus()`);
    await type('Email: saif@example.com\nPassword: hunter2 ');
    await wait(900);
    s = await state();
    check('typing goes into the note (Space and Return included), and it\'s saved', fs.existsSync(path.join(UD, 'notes.json')) && savedNote().segments.map((x) => x.v).join('') === 'Email: saif@example.com\nPassword: hunter2 ', JSON.stringify(savedNote().segments));
    key('Backspace');
    await wait(100);
    check('task keys don\'t act while you type in the note (Space, Backspace)', savedTasks().length === 2 && !savedTasks().some((t) => t.done), JSON.stringify(savedTasks().map((t) => [t.id, t.done])));
    await type(' ');

    // ---------- Hiding ----------
    check('Hide is off until text is selected', !s.hideEnabled);
    await select('hunter2');
    await wait(100);
    s = await state();
    check('select "hunter2": Hide turns on', s.hideEnabled);
    const hideBtn = await box('#noteHideBtn');
    await click(hideBtn.x, hideBtn.y);
    await until(async () => (await state()).chips.length === 1);
    await wait(300);
    s = await state();
    const id = s.chips[0] && s.chips[0].id;
    check('Hide: it shows as ••••••', s.chips.length === 1 && s.chips[0].text === '••••••' && !s.text.includes('hunter2'), s.text);
    check('…encrypted the moment it was hidden', enc.encrypted.includes('hunter2'));
    const file = noteFile();
    check('…saved encrypted only: neither the note nor its backup has "hunter2" in it', !file.includes('hunter2') && !noteBak().includes('hunter2') && !!savedNote().secrets[id] && savedNote().segments.some((x) => x.t === 'secret' && x.id === id), file.slice(0, 200));
    check('…and it says how to see it', /Hidden and encrypted/.test(s.status) && /Click Show/.test(s.status) && (PLATFORM === 'darwin' ? /Touch ID/.test(s.status) : /Windows Hello/.test(s.status)), s.status);
    check('(v1.9.2) it reads "•••••• Show", and the line under the note says what that is', (await js(`document.querySelector('.secret').textContent`)) === '••••••Show' && /encrypted text\. Click Show to see it/.test(s.hint), `${await js(`document.querySelector('.secret').textContent`)} / ${s.hint}`);
    // Undo can't bring the plain text back
    await js('noteEditor.focus()');
    for (let i = 0; i < 6; i += 1) { key('z', [PLATFORM === 'darwin' ? 'meta' : 'control']); await wait(60); }
    key('z', ['control']);
    await wait(200);
    s = await state();
    check('Undo can\'t bring the hidden text back as plain text', !s.text.includes('hunter2') && !(await js('document.body.innerText')).includes('hunter2'), s.text);
    await js(`(() => { const r = document.createRange(); r.selectNodeContents(noteEditor); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    if ((await state()).chips.length !== 1) {
      // put the note back the way it was for the rest (Undo may have taken typing out)
      await js(`fillEditor(noteEditor, [{ t: 'text', v: 'Email: saif@example.com\\nPassword: ' }, { t: 'secret', id: ${JSON.stringify(id)} }, { t: 'text', v: ' ' }]); saveNoteNow()`);
    }

    // ---------- Showing it ----------
    let chip = await box('.secret');
    await click(chip.x, chip.y);
    await until(() => auth.asked.length === 1);
    check(PLATFORM === 'darwin' ? 'clicking it asks for Touch ID or the Mac password first' : 'clicking it asks Windows Hello (or the Windows password) first, over the panel',
      PLATFORM === 'darwin' ? auth.asked[0] === 'show your hidden text' : auth.asked[0] === 'show' && auth.windows[0] === true, auth.asked.join());
    panel.emit('blur'); // the system's dialog took the focus
    await wait(300);
    check('…the panel stays open while the system asks', panel.isVisible() && (await js('document.querySelector(".secret").classList.contains("checking")')));
    s = await state();
    check('…and nothing is shown before the answer', !s.text.includes('hunter2') && enc.decrypted === 0);
    auth.next = 'yes';
    auth.release();
    await until(async () => (await state()).chips[0].shown);
    s = await state();
    check('confirmed: it shows "hunter2"', s.chips[0].shown && s.chips[0].text === 'hunter2' && enc.decrypted === 1, JSON.stringify(s.chips));
    // (v1.9.1) as on a real Mac: the system's dialog closes just after it answers, and the panel hears it lost the focus
    panel.emit('blur');
    await wait(400);
    s = await state();
    check('when the system\'s dialog closes after Touch ID or the password, the panel stays open, showing it', panel.isVisible() && s.chips[0].shown && s.chips[0].text === 'hunter2');
    await shot('note-shown');
    await wait(700);
    check('…it isn\'t saved as plain text even while it shows', !noteFile().includes('hunter2'));
    // ---------- (v1.9.2) Selecting it while it shows ----------
    s = await state();
    check('while it shows, the line under the note says how to copy it and when it hides again', /Select any part/.test(s.hint) && /Hides again in \d+ s/.test(s.hint), s.hint);
    chip = await box('.secret .secret-text');
    await click(chip.x, chip.y);
    await wait(150);
    s = await state();
    check('clicking the text that shows leaves it showing (it used to hide it, so it couldn\'t be selected)', s.chips[0].shown && s.chips[0].text === 'hunter2');
    await dragAcross('hunter2', 0, 4);
    s = await state();
    check('dragging across part of it selects just that part', s.selection === 'hunt' && s.chips[0].shown, JSON.stringify(s.selection));
    check('…and "Hide selected" stays off (it\'s hidden text already)', !s.hideEnabled);
    await clipboard.writeText('before');
    key('c', ['control']); // (the editing keys are the real system's: Ctrl on this Linux test machine)
    await until(async () => (await clipboard.readText()) === 'hunt');
    s = await state();
    check(`${PLATFORM === 'darwin' ? '⌘C' : 'Ctrl+C'} copies only the selected part`, (await clipboard.readText()) === 'hunt' && /Copied/.test(s.status), `${JSON.stringify(await clipboard.readText())} ${s.status}`);
    await wait(1900);
    check('…and it comes off the clipboard after a while, like any copied hidden text', (await clipboard.readText()) === '');
    key('x');
    key('Backspace');
    await wait(200);
    s = await state();
    check('typing while part of it is selected changes nothing', s.chips.length === 1 && s.chips[0].shown && s.chips[0].text === 'hunter2' && JSON.stringify(s.segs.map((x) => x.t)) === '["text","secret","text"]', JSON.stringify(s.segs));
    const copyBtn = await box('.secret.shown .secret-btn.copy');
    await click(copyBtn.x, copyBtn.y);
    await until(async () => (await clipboard.readText()) === 'hunter2');
    check('its Copy button copies all of it', (await clipboard.readText()) === 'hunter2' && (await state()).chips[0].shown);
    const hideIt = await box('.secret.shown .secret-btn.hide');
    await click(hideIt.x, hideIt.y);
    await wait(150);
    s = await state();
    check('its Hide button hides it again', !s.chips[0].shown && s.chips[0].text === '••••••' && !(await js('document.body.innerText')).includes('hunter2'));
    chip = await box('.secret');
    // canceled
    await click(chip.x, chip.y);
    await until(() => auth.asked.length === 2);
    auth.next = 'no';
    auth.release();
    await wait(300);
    s = await state();
    check('Cancel in the system\'s dialog: it stays hidden, nothing said', !s.chips[0].shown && enc.decrypted === 1 && !/didn/.test(s.status));

    // ---------- Shown text hides itself ----------
    await click(chip.x, chip.y);
    await until(() => auth.asked.length === 3);
    auth.next = 'yes';
    auth.release();
    await until(async () => (await state()).chips[0].shown);
    panel.emit('blur'); // the dialog closing
    await wait(1700);
    check('…also after the password', panel.isVisible() && (await state()).chips[0].shown);
    panel.emit('blur'); // and now you click somewhere else
    await until(() => !panel.isVisible());
    s = await state();
    check('clicking somewhere else afterwards still closes the panel, as always, and hides it again', !panel.isVisible() && !s.chips[0].shown && !s.text.includes('hunter2'));
    await js(`window.taskpop.updateSetting('keepOpen', true)`);
    shortcut(); // open it again, as the keyboard shortcut does
    await until(() => panel.isVisible() && panel.getOpacity() > 0.9);
    await wait(200);

    // ---------- Copying ----------
    lastMenu = null;
    chip = await box('.secret');
    await click(chip.x, chip.y, 'right');
    await until(() => lastMenu);
    check('right-click on hidden text: Show…, Copy…, Delete', lastMenu.filter((i) => i.label).map((i) => i.label).join() === 'Show…,Copy…,Delete');
    await clipboard.writeText('before');
    menuItem(['Copy…']).click();
    await until(() => auth.asked.length === 4);
    check('Copy… asks first too', PLATFORM === 'darwin' ? auth.asked[3] === 'copy your hidden text' : auth.asked[3] === 'copy');
    auth.next = 'yes';
    auth.release();
    await until(async () => (await clipboard.readText()) === 'hunter2');
    s = await state();
    check('…then copies it without showing it', (await clipboard.readText()) === 'hunter2' && !s.chips[0].shown && /Copied/.test(s.status), s.status);
    await wait(1900);
    check('…and takes it off the clipboard after a while', (await clipboard.readText()) === '');

    // Copy and paste inside the note keep it hidden
    await js(`(() => { const r = document.createRange(); r.selectNodeContents(noteEditor); getSelection().removeAllRanges(); getSelection().addRange(r); noteEditor.focus(); })()`);
    key('c', ['control']); // (the editing keys are the real system's: Ctrl on this Linux test machine)
    await wait(200);
    const copied = await clipboard.readText();
    check('copying the note copies hidden text as ••••••, not as itself', copied.includes('••••••') && !copied.includes('hunter2'), JSON.stringify(copied));
    await js(`(() => { const r = document.createRange(); r.selectNodeContents(noteEditor); r.collapse(false); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    key('v', ['control']);
    await wait(400);
    s = await state();
    check('…and pasting it back into the note brings it back hidden (the same piece)', s.chips.length === 2 && s.chips.every((c) => c.id === id && !c.shown), JSON.stringify(s.chips));

    // ---------- Add hidden text, typed out of sight ----------
    const add = await box('#noteAddBtn');
    await click(add.x, add.y);
    await wait(150);
    s = await state();
    check('"Add hidden text" opens a password box', s.addOpen && s.focus === 'noteAddInput' && (await js('document.getElementById("noteAddInput").type')) === 'password');
    await type('s3cret!');
    key('Return');
    await until(async () => (await state()).chips.length === 3);
    await wait(300);
    s = await state();
    check('…Return adds it hidden, and it was never in the note as text', !s.addOpen && s.chips.length === 3 && !noteFile().includes('s3cret') && enc.encrypted.includes('s3cret!') && !s.text.includes('s3cret'));

    // ---------- Making it plain, deleting ----------
    const third = s.chips[2].id;
    await js(`showSecret(${JSON.stringify(third)}, 's3cret!')`); // (as after a confirmed Show)
    lastMenu = null;
    const shownChip = (await js(`(() => { const c = [...document.querySelectorAll('.secret')][2]; const r = c.getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`));
    await click(shownChip.x, shownChip.y, 'right');
    await until(() => lastMenu);
    check('right-click on text that shows: Hide, Copy, Make it ordinary text, Delete', lastMenu.filter((i) => i.label).map((i) => i.label).join() === 'Hide,Copy,Make it ordinary text,Delete');
    menuItem(['Make it ordinary text']).click();
    await wait(800);
    s = await state();
    check('Make it ordinary text: it\'s plain text again, and no longer kept encrypted', s.chips.length === 2 && s.text.includes('s3cret!') && !savedNote().secrets[third] && noteFile().includes('s3cret!'));
    lastMenu = null;
    chip = await box('.secret');
    await click(chip.x, chip.y, 'right');
    await until(() => lastMenu);
    menuItem(['Delete']).click();
    await wait(700);
    s = await state();
    check('Delete takes it out of the note', s.chips.length === 1);

    // ---------- After a restart (a reload of the panel) ----------
    const before = JSON.stringify(savedNote().segments);
    panel.webContents.reload();
    await until(() => js('typeof noteSegments === "function" && !!document.querySelector(".secret")'), 6000);
    await wait(500);
    s = await state();
    check('opening again: the note is back, open, with its hidden text hidden', s.open && s.chips.length === 1 && !s.chips[0].shown && JSON.stringify(s.segs) === before, `${JSON.stringify(s.segs)} vs ${before}`);

    // ---------- When it can't be encrypted ----------
    enc.available = false;
    await js('noteEditor.focus()');
    await select('saif@example.com');
    await js(`hideSelection()`);
    await wait(300);
    s = await state();
    check('if the computer can\'t encrypt it, it isn\'t hidden, and it says so', s.chips.length === 1 && s.text.includes('saif@example.com') && /can’t encrypt/.test(s.status), s.status);
    enc.available = true;

    // ---------- ⌘J / Ctrl+J ----------
    await js('inputEl.focus()');
    key('j', [MOD]);
    await wait(200);
    s = await state();
    check(`${PLATFORM === 'darwin' ? '⌘J' : 'Ctrl+J'} closes the note…`, !s.open);
    key('j', [MOD]);
    await wait(200);
    s = await state();
    check('…and opens it, ready to type', s.open && s.focus === 'editor');

    // ---------- (v1.9.2) An email over a password: each line on its own ----------
    await js(`noteEditor.focus(); fillEditor(noteEditor, [{ t: 'text', v: 'Shop login\\nsaif@example.com\\nhunter2!\\n' }]); saveNoteNow()`);
    await wait(200);
    await js(`(() => { const t = noteEditor.firstChild; const r = document.createRange(); r.setStart(t, 11); r.setEnd(t, 11 + 'saif@example.com\\nhunter2!'.length); getSelection().removeAllRanges(); getSelection().addRange(r); })()`);
    await wait(100);
    s = await state();
    check('select an email and the password under it: the line under the note says Hide selected encrypts it', s.hideEnabled && /Click Hide selected/.test(s.hint), s.hint);
    await click((await box('#noteHideBtn')).x, (await box('#noteHideBtn')).y);
    await until(async () => (await state()).chips.length === 1);
    const pair = (await state()).chips[0].id;
    let asked = auth.asked.length;
    chip = await box('.secret');
    await click(chip.x, chip.y);
    await until(() => auth.asked.length === asked + 1);
    auth.next = 'yes';
    auth.release();
    await until(async () => (await state()).chips[0].shown);
    s = await state();
    const lineBtns = await js(`document.querySelectorAll('.secret.shown .secret-btn.copy-line').length`);
    check('shown, it has a Copy button for each line, then Copy all and Hide', s.chips[0].text === 'saif@example.com\nhunter2!' && lineBtns === 2 && (await js(`[...document.querySelectorAll('.secret.shown .secret-foot .secret-btn')].map((b) => b.textContent).join()`)) === 'Copy all,Hide', s.chips[0].text);
    const firstLine = await js(`(() => { const r = document.querySelectorAll('.secret.shown .secret-btn.copy-line')[0].getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);
    await click(firstLine.x, firstLine.y);
    await until(async () => (await clipboard.readText()) === 'saif@example.com');
    check('the first line\'s Copy copies just the email', (await clipboard.readText()) === 'saif@example.com' && /Line 1 copied/.test((await state()).status));
    const secondLine = await js(`(() => { const r = document.querySelectorAll('.secret.shown .secret-btn.copy-line')[1].getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);
    await click(secondLine.x, secondLine.y);
    await until(async () => (await clipboard.readText()) === 'hunter2!');
    check('…and the second line\'s, just the password', (await clipboard.readText()) === 'hunter2!');
    await dragAcross('example', 5, 16);
    s = await state();
    check('a part of one line can be selected too', s.selection === 'example.com', JSON.stringify(s.selection));
    lastMenu = null;
    const sel = await js(`(() => { const r = getSelection().getRangeAt(0).getBoundingClientRect(); return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2 }; })()`);
    await click(sel.x, sel.y, 'right');
    await until(() => lastMenu);
    check('right-click on the selected part: Copy Selection first', lastMenu.filter((i) => i.label).map((i) => i.label).join() === 'Copy Selection,Hide,Copy All,Make it ordinary text,Delete', lastMenu.filter((i) => i.label).map((i) => i.label).join());
    await clipboard.writeText('before');
    menuItem(['Copy Selection']).click();
    await until(async () => (await clipboard.readText()) === 'example.com');
    check('…which copies just "example.com"', (await clipboard.readText()) === 'example.com');
    check('nothing of it was ever saved as plain text', !noteFile().includes('hunter2!') && !noteFile().includes('saif@example.com') && !noteBak().includes('hunter2!'));
    await shot('note-lines');
    await js(`maskSecret(${JSON.stringify(pair)})`);
    await wait(100);
    s = await state();
    check('hidden again, the selection inside it goes too', !s.chips[0].shown && s.selection === '' && !(await js('document.body.innerText')).includes('saif@example.com'));

    // ---------- Look ----------
    await js(`noteEditor.blur(); fillEditor(noteEditor, [{ t: 'text', v: 'Wi-Fi: Home-5G\\nPassword: ' }, { t: 'secret', id: ${JSON.stringify(id)} }, { t: 'text', v: '\\nBank PIN: ' }, { t: 'secret', id: ${JSON.stringify(pair)} }]); showSecret(${JSON.stringify(id)}, 'hunter2'); maskSecret(${JSON.stringify(id)}); document.getElementById('noteStatus').textContent = ''; getSelection().removeAllRanges(); updateHint()`);
    await wait(300);
    await until(() => panel.getOpacity() > 0.99);
    await shot('note');
  } catch (err) {
    errors.push('TEST ' + err.stack);
  }
  console.log(`[n:${tag}] ${results.filter(Boolean).length}/${results.length} checks passed`);
  console.log(`[n:${tag}] errors:`, errors.length ? '\n' + errors.join('\n') : 'none');
  app.exit(0);
});
