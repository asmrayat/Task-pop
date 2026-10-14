// The quick note (v1.9): a note under the task list, opened with the arrow at the end of the
// "Add a task" bar, or ⌘J (Ctrl+J on Windows).
//
// Select text and click "Hide selected" to keep it private: the app encrypts it at once and it
// shows as •••••• with a "Show" label. Clicking it asks for Touch ID or your Mac password
// (Windows Hello or your Windows password on Windows) before it's shown. Shown text hides itself
// again after a minute, when you click its Hide button, close the note or the panel closes.
// Hidden text is never saved in plain, and this page only ever has it while it's showing.
//
// v1.9.2: while it shows, it's ordinary selectable text: select any part and press ⌘C (or use
// a line's Copy button) to copy just that, e.g. the email without the password under it. It
// no longer hides when you click it (that made selecting it impossible), and a line under the
// note says what you can do next.
//
// The note is a run of plain text and hidden pieces ({ t: 'secret', id }); this page edits it
// in a plain-text editable box in which each hidden piece is one uneditable chip.

const noteEls = {
  btn: document.getElementById('noteBtn'),
  drawer: document.getElementById('noteDrawer'),
  status: document.getElementById('noteStatus'),
  hint: document.getElementById('noteHint'),
  hide: document.getElementById('noteHideBtn'),
  add: document.getElementById('noteAddBtn'),
  addForm: document.getElementById('noteAdd'),
  addInput: document.getElementById('noteAddInput'),
  addCancel: document.getElementById('noteAddCancel'),
};
let noteEditor = document.getElementById('noteEditor');

const MASK = '••••••';
const SHOW_FOR_MS = 60 * 1000;
const NOTE_MIME = 'application/x-taskpop-note';
const NOTE_MAX = 20000;
const NOTE_ICONS = {
  locked: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="5.2" width="7.6" height="5.4" rx="1.3"/><path d="M4 5.2V3.9a2 2 0 0 1 4 0v1.3"/></svg>',
  open: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="2.2" y="5.2" width="7.6" height="5.4" rx="1.3"/><path d="M4 5.2V3.9a2 2 0 0 1 3.9-.6"/></svg>',
  copy: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="3.8" y="3.8" width="6.4" height="6.6" rx="1.3"/><path d="M8.2 3.8V2.9a1.1 1.1 0 0 0-1.1-1.1H2.9a1.1 1.1 0 0 0-1.1 1.1v4.3a1.1 1.1 0 0 0 1.1 1.1h.9"/></svg>',
};

let noteIsOpen = false;
let noteSaveTimer = null;
let noteStatusTimer = null;
let noteRange = null; // the last selection (or caret) in the note
const shownTimers = new Map(); // hidden piece showing -> its timer to hide it again
const shownTexts = new Map(); // hidden piece showing -> its text (only while it shows)
const shownUntil = new Map(); // hidden piece showing -> when it hides again
let hintTicker = null; // counts down "Hides again in …" while something shows
let menuChip = null; // the hidden piece last right-clicked (a pasted copy shares its id)
let menuSelection = ''; // …and the part of it that was selected then, if it was showing
const unlockWords = () => (platform === 'win32' ? 'Windows Hello or your Windows password' : 'Touch ID or your Mac password');
const copyKeys = () => (platform === 'darwin' ? '⌘C' : 'Ctrl+C');

function noteEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------- The note as segments ----------

function secretChip(id) {
  const chip = document.createElement('span');
  chip.className = 'secret';
  chip.contentEditable = 'false';
  chip.dataset.id = id;
  renderChip(chip);
  return chip;
}

/** A small button inside a hidden piece that's showing (Copy, Hide). */
function chipButton(act, label, title, line) {
  const b = noteEl('button', `secret-btn ${act}`);
  b.type = 'button';
  b.tabIndex = -1;
  b.dataset.act = act;
  if (line !== undefined) b.dataset.line = String(line);
  b.innerHTML = act === 'hide' ? NOTE_ICONS.locked : NOTE_ICONS.copy;
  b.append(noteEl('span', null, label));
  b.title = title;
  return b;
}

/**
 * Draw a hidden piece: "🔒 •••••• Show" while it's hidden. While it shows: its text, which you
 * can select like any text, with Copy and Hide buttons; one Copy per line when it has several
 * lines (an email over a password, say), so each can be copied on its own.
 */
function renderChip(chip) {
  const text = shownTexts.get(chip.dataset.id);
  chip.replaceChildren();
  chip.classList.remove('checking');
  if (text === undefined) {
    chip.classList.remove('shown', 'lines');
    chip.innerHTML = NOTE_ICONS.locked;
    chip.append(noteEl('span', 'secret-text', MASK), noteEl('span', 'secret-show', 'Show'));
    chip.title = `Hidden and encrypted. Click to show it (${unlockWords()})`;
    chip.setAttribute('role', 'button');
    chip.setAttribute('aria-label', 'Hidden text. Click to show it.');
    return;
  }
  const lines = text.split('\n');
  const many = lines.length > 1;
  chip.classList.add('shown');
  chip.classList.toggle('lines', many);
  chip.title = '';
  chip.removeAttribute('role');
  chip.setAttribute('aria-label', 'Hidden text, showing');
  lines.forEach((line, i) => {
    const row = noteEl('span', 'secret-line');
    const t = noteEl('span', 'secret-text', line);
    t.title = `Select any part to copy just that (${copyKeys()})`;
    row.append(t);
    if (many) row.append(chipButton('copy-line', 'Copy', 'Copy this line', i));
    else row.append(chipButton('copy', 'Copy', 'Copy it'), chipButton('hide', 'Hide', 'Hide it again'));
    chip.append(row);
  });
  if (many) {
    const foot = noteEl('span', 'secret-foot');
    foot.append(chipButton('copy', 'Copy all', 'Copy all of it'), chipButton('hide', 'Hide', 'Hide it again'));
    chip.append(foot);
  }
}

/** Plain text and hidden pieces, from any part of the note (a <br> or a new block is a line break). */
function segmentsOf(root) {
  const out = [];
  const text = (v) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === 'text') last.v += v;
    else out.push({ t: 'text', v });
  };
  const endsWithBreak = () => {
    const last = out[out.length - 1];
    return !last || (last.t === 'text' && last.v.endsWith('\n'));
  };
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        text(child.nodeValue.replace(/​/g, ''));
      } else if (child.nodeName === 'BR') {
        // (the <br> that only holds an empty last line open isn't a line break of its own)
        if (!(child === root.lastChild && root === noteEditor && endsWithBreak() && out.length)) text('\n');
      } else if (child.classList && child.classList.contains('secret')) {
        out.push({ t: 'secret', id: child.dataset.id });
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        if (['DIV', 'P'].includes(child.nodeName) && !endsWithBreak()) text('\n');
        walk(child);
      }
    }
  };
  walk(root);
  return out;
}

const noteSegments = () => segmentsOf(noteEditor);
const segmentLength = (segs) => segs.reduce((n, s) => n + (s.t === 'text' ? s.v.length : 1), 0);

function fillEditor(editor, segments) {
  const frag = document.createDocumentFragment();
  for (const s of segments) frag.append(s.t === 'text' ? document.createTextNode(s.v) : secretChip(s.id));
  const last = segments[segments.length - 1];
  if (last && last.t === 'text' && last.v.endsWith('\n')) frag.append(document.createElement('br')); // shows the empty last line
  editor.replaceChildren(frag);
  updateEmpty(editor);
}

function updateEmpty(editor = noteEditor) {
  editor.classList.toggle('empty', !editor.textContent && !editor.querySelector('.secret'));
}

// ---------- Caret position, in characters (a hidden piece counts as one) ----------

function caretOffset() {
  const sel = window.getSelection();
  if (!sel.rangeCount || !noteEditor.contains(sel.anchorNode)) return null;
  const range = document.createRange();
  range.selectNodeContents(noteEditor);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  return segmentLength(segmentsOf(range.cloneContents()));
}

function placeCaret(offset) {
  let left = offset;
  const range = document.createRange();
  const walker = document.createTreeWalker(noteEditor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
    acceptNode: (n) => (n.parentElement && n.parentElement.closest('.secret') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (left <= node.nodeValue.length) {
        range.setStart(node, left);
        break;
      }
      left -= node.nodeValue.length;
    } else if (node.classList.contains('secret') || node.nodeName === 'BR') {
      if (left === 0) {
        range.setStartBefore(node);
        break;
      }
      left -= 1;
      if (left === 0) {
        range.setStartAfter(node);
        break;
      }
    }
    node = walker.nextNode();
  }
  if (!node) {
    range.selectNodeContents(noteEditor);
    range.collapse(false);
  }
  range.collapse(true);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

/**
 * Start the note over in a new editable box with the same content. The editing history (Undo)
 * belongs to the old box and goes with it: after text is hidden, Undo can't bring it back plain.
 */
function freshEditor(caret = caretOffset()) {
  const segs = noteSegments();
  const box = noteEditor.cloneNode(false);
  fillEditor(box, segs);
  const hadFocus = document.activeElement === noteEditor;
  noteEditor.replaceWith(box);
  noteEditor = box;
  if (hadFocus || caret !== null) {
    noteEditor.focus();
    placeCaret(caret === null ? segmentLength(segs) : caret);
  }
}

// ---------- Saving ----------

function saveNoteSoon() {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = setTimeout(saveNoteNow, 600);
}

function saveNoteNow() {
  clearTimeout(noteSaveTimer);
  noteSaveTimer = null;
  return window.taskpop.saveNote(noteSegments());
}

// ---------- Messages ----------

function sayInNote(message, ms = 4500) {
  noteEls.status.textContent = message;
  noteEls.status.title = message;
  clearTimeout(noteStatusTimer);
  noteStatusTimer = setTimeout(() => { noteEls.status.textContent = ''; noteEls.status.title = ''; }, ms);
}

// ---------- Selection and the Hide button ----------

/** The selection in the note, if it's text that can be hidden. */
function hideableRange() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed || !noteEditor.contains(range.commonAncestorContainer)) return null;
  if (inChip(range.startContainer) || inChip(range.endContainer)) return null;
  const frag = range.cloneContents();
  if (frag.querySelector && frag.querySelector('.secret')) return null;
  const text = segmentsOf(frag).map((s) => s.v).join('');
  return text.trim() ? { range, text } : null;
}

/** The hidden piece a node is in, if any. */
function inChip(node, shownOnly = false) {
  const elt = node && (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement);
  return (elt && elt.closest(shownOnly ? '.secret.shown' : '.secret')) || null;
}

/**
 * The selected part of a hidden piece that's showing, as text (lines joined with line breaks),
 * or null when the selection isn't all inside one.
 */
function selectedShownText() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  if (range.collapsed) return null;
  const chip = inChip(range.startContainer, true);
  if (!chip || chip !== inChip(range.endContainer, true) || !noteEditor.contains(chip)) return null;
  const parts = [];
  for (const t of chip.querySelectorAll('.secret-text')) {
    if (!range.intersectsNode(t)) continue;
    const part = document.createRange();
    part.selectNodeContents(t);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
    parts.push(part.toString());
  }
  return parts.join('\n');
}

function updateHideButton() {
  noteEls.hide.disabled = !hideableRange();
}

/** The line under the note: what you can do from here (unless a message is showing). */
function updateHint() {
  let hint;
  if (!noteEls.addForm.hidden) {
    hint = 'Type it in the box and press Return. It goes into the note already encrypted, never as plain text.';
  } else if (shownTexts.size) {
    const left = Math.max(1, Math.ceil((Math.min(...shownUntil.values()) - Date.now()) / 1000));
    hint = `Showing. Select any part and press ${copyKeys()} to copy just that, or click Copy. Hides again in ${left} s.`;
  } else if (hideableRange()) {
    hint = 'Click Hide selected to encrypt this text. It will show as ••••••.';
  } else if (noteEditor.querySelector('.secret')) {
    hint = `•••••• is encrypted text. Click Show to see it (${unlockWords()}).`;
  } else {
    hint = 'To keep a password or a code private, select it and click Hide selected, or click Add hidden.';
  }
  if (noteEls.hint.textContent !== hint) noteEls.hint.textContent = hint;
  if (shownTexts.size && !hintTicker) hintTicker = setInterval(updateHint, 1000);
  if (!shownTexts.size && hintTicker) {
    clearInterval(hintTicker);
    hintTicker = null;
  }
}

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (sel.rangeCount && noteEditor.contains(sel.anchorNode)) noteRange = sel.getRangeAt(0).cloneRange();
  // Selecting text that shows: it stays a minute from now, so it doesn't hide while you copy it
  const shown = sel.rangeCount && !sel.isCollapsed && inChip(sel.anchorNode, true);
  if (shown) keepShowing(shown.dataset.id);
  updateHideButton();
  updateHint();
});

// ---------- Hiding ----------

async function hideSelection() {
  const pick = hideableRange();
  if (!pick) {
    sayInNote('Select some text in the note first.');
    return;
  }
  noteEls.hide.disabled = true;
  const result = await window.taskpop.hideNoteText(pick.text);
  if (!result || !result.ok) {
    sayInNote((result && result.message) || 'That couldn’t be hidden.', 6000);
    updateHideButton();
    return;
  }
  const at = segmentLength(segmentsOf((() => {
    const r = document.createRange();
    r.selectNodeContents(noteEditor);
    r.setEnd(pick.range.startContainer, pick.range.startOffset);
    return r.cloneContents();
  })()));
  pick.range.deleteContents();
  pick.range.insertNode(secretChip(result.id));
  freshEditor(at + 1);
  await saveNoteNow();
  sayInNote(`Hidden and encrypted. Click Show to see it (${unlockWords()}).`, 7000);
}

/** "Add hidden text": typed in a password box, so it's never in the note as plain text. */
function openAddHidden() {
  if (!noteIsOpen) setNoteOpen(true);
  const caret = caretOffset();
  noteEls.addForm.dataset.caret = caret === null ? '' : String(caret);
  noteEls.addForm.hidden = false;
  noteEls.addInput.value = '';
  noteEls.addInput.focus();
  updateHint();
}

function closeAddHidden() {
  noteEls.addInput.value = '';
  noteEls.addForm.hidden = true;
  updateHint();
}

async function addHidden() {
  const text = noteEls.addInput.value;
  if (!text.trim()) {
    closeAddHidden();
    return;
  }
  const result = await window.taskpop.hideNoteText(text);
  noteEls.addInput.value = '';
  if (!result || !result.ok) {
    sayInNote((result && result.message) || 'That couldn’t be hidden.', 6000);
    return;
  }
  const caret = noteEls.addForm.dataset.caret === '' ? segmentLength(noteSegments()) : Number(noteEls.addForm.dataset.caret);
  closeAddHidden();
  noteEditor.focus();
  placeCaret(caret);
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);
  const chip = secretChip(result.id);
  range.insertNode(chip);
  if (!chip.nextSibling) chip.after(document.createTextNode(' ')); // somewhere to type after it
  freshEditor(caret + 1);
  await saveNoteNow();
  sayInNote(`Added, hidden and encrypted. Click Show to see it (${unlockWords()}).`, 7000);
}

// ---------- Showing, copying, making it plain ----------

const chipsFor = (id) => [...noteEditor.querySelectorAll(`.secret[data-id="${CSS.escape(id)}"]`)];

async function revealSecret(id) {
  const chips = chipsFor(id);
  if (!chips.length || chips[0].classList.contains('checking')) return;
  chips.forEach((c) => c.classList.add('checking'));
  const result = await window.taskpop.revealNoteText(id);
  chipsFor(id).forEach((c) => c.classList.remove('checking'));
  if (result && result.ok) showSecret(id, result.text);
  else if (result && result.message) sayInNote(result.message, 6000);
}

function showSecret(id, text) {
  shownTexts.set(id, String(text));
  chipsFor(id).forEach(renderChip);
  keepShowing(id);
  updateHideButton();
  updateHint();
}

/** It shows for another minute from now. */
function keepShowing(id) {
  if (!shownTexts.has(id)) return;
  clearTimeout(shownTimers.get(id));
  shownTimers.set(id, setTimeout(() => maskSecret(id), SHOW_FOR_MS));
  shownUntil.set(id, Date.now() + SHOW_FOR_MS);
}

function maskSecret(id) {
  clearTimeout(shownTimers.get(id));
  shownTimers.delete(id);
  shownUntil.delete(id);
  const wasShown = shownTexts.delete(id);
  if (wasShown) {
    // (a selection inside it would be left pointing at text that's gone)
    const sel = window.getSelection();
    if (sel.rangeCount && chipsFor(id).some((c) => c.contains(sel.anchorNode) || c.contains(sel.focusNode))) sel.removeAllRanges();
  }
  chipsFor(id).forEach(renderChip);
  updateHideButton();
  updateHint();
}

function maskAllSecrets() {
  [...new Set([...shownTimers.keys(), ...shownTexts.keys()])].forEach(maskSecret);
}

/** Copy text that shows (all of it, a line or a selected part); off the clipboard in a minute. */
async function copyShown(id, text, what = 'Copied') {
  if (!text) return;
  keepShowing(id);
  const result = await window.taskpop.copyShownNoteText(text);
  if (result && result.ok) sayInNote(`${what}. It comes off the clipboard in ${Math.round(result.clearsIn / 1000)} seconds.`, 6000);
}

async function copySecret(id) {
  if (!chipsFor(id).length) return;
  if (shownTexts.has(id)) {
    copyShown(id, shownTexts.get(id));
    return;
  }
  const result = await window.taskpop.copyNoteText(id);
  if (result && result.ok) sayInNote(`Copied. It comes off the clipboard in ${Math.round(result.clearsIn / 1000)} seconds.`, 6000);
  else if (result && result.message) sayInNote(result.message, 6000);
}

/** The Copy and Hide buttons on a hidden piece that's showing. */
function chipAction(chip, act, line) {
  const id = chip.dataset.id;
  const text = shownTexts.get(id);
  if (text === undefined) return;
  if (act === 'hide') maskSecret(id);
  else if (act === 'copy') copyShown(id, text);
  else if (act === 'copy-line') copyShown(id, text.split('\n')[line] || '', `Line ${line + 1} copied`);
}

/** The chip a menu action is for: the one right-clicked (or the first with that id). */
const chipForMenu = (id) => (menuChip && menuChip.isConnected && menuChip.dataset.id === id ? menuChip : chipsFor(id)[0]);

/** A piece that's showing becomes ordinary text again (no longer encrypted). */
function makePlain(id) {
  const chip = chipForMenu(id);
  if (!chip || !shownTexts.has(id)) return;
  const text = shownTexts.get(id);
  chip.replaceWith(document.createTextNode(text));
  if (!chipsFor(id).length) maskSecret(id);
  freshEditor();
  saveNoteNow();
  sayInNote('It’s ordinary text again.');
}

function deleteSecret(id) {
  const chip = chipForMenu(id);
  if (!chip) return;
  chip.remove();
  if (!chipsFor(id).length) maskSecret(id);
  freshEditor();
  saveNoteNow();
  sayInNote('Hidden text deleted.');
}

// ---------- Opening and closing ----------

function setNoteOpen(open, { remember = true, focus = false } = {}) {
  noteIsOpen = !!open;
  noteEls.drawer.hidden = !noteIsOpen;
  noteEls.btn.classList.toggle('open', noteIsOpen);
  noteEls.btn.setAttribute('aria-expanded', String(noteIsOpen));
  noteEls.btn.title = noteIsOpen ? `Close the quick note (${platform === 'darwin' ? '⌘J' : 'Ctrl+J'})` : `Quick note (${platform === 'darwin' ? '⌘J' : 'Ctrl+J'})`;
  updateHint();
  if (!noteIsOpen) {
    maskAllSecrets();
    closeAddHidden();
    if (noteSaveTimer) saveNoteNow();
    if (noteEls.drawer.contains(document.activeElement)) inputEl.focus();
  } else if (focus) {
    noteEditor.focus();
    placeCaret(segmentLength(noteSegments()));
  }
  if (remember) window.taskpop.updateSetting('noteOpen', noteIsOpen);
}

noteEls.btn.addEventListener('click', () => setNoteOpen(!noteIsOpen, { focus: true }));
document.addEventListener('keydown', (e) => {
  if (primaryKey(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    e.stopPropagation();
    setNoteOpen(!noteIsOpen, { focus: true });
  }
}, true);

// ---------- The editor ----------
// (events are heard on the drawer, so a new editable box needs nothing of its own)

noteEls.drawer.addEventListener('input', (e) => {
  if (e.target !== noteEditor) return;
  updateEmpty();
  saveNoteSoon();
  updateHint();
});

noteEls.drawer.addEventListener('beforeinput', (e) => {
  if (e.target !== noteEditor) return;
  const adding = e.data || (e.dataTransfer && e.dataTransfer.getData('text/plain')) || '';
  if (adding && segmentLength(noteSegments()) + adding.length > NOTE_MAX) {
    e.preventDefault();
    sayInNote('The note is full.');
  }
});

noteEls.drawer.addEventListener('focusout', (e) => {
  if (e.target === noteEditor && noteSaveTimer) saveNoteNow();
});

// Hidden pieces: click one to show it; while it shows, select any of it, or use its buttons.
// Right-click for more.
noteEls.drawer.addEventListener('mousedown', (e) => {
  if (e.target.closest('.secret-btn')) e.preventDefault(); // a button: keep the selection
  else if (e.target.closest('.secret:not(.shown)')) e.preventDefault(); // no caret inside a hidden piece
  if (e.target.closest('#noteHideBtn')) e.preventDefault(); // keep the selection
});
noteEls.drawer.addEventListener('click', (e) => {
  const btn = e.target.closest('.secret-btn');
  if (btn) {
    chipAction(btn.closest('.secret'), btn.dataset.act, Number(btn.dataset.line));
    return;
  }
  const chip = e.target.closest('.secret');
  if (chip && !chip.classList.contains('shown')) revealSecret(chip.dataset.id);
  // (one that shows stays put when clicked, so it can be selected)
});
noteEls.drawer.addEventListener('contextmenu', (e) => {
  if (!noteEditor.contains(e.target)) return;
  e.preventDefault();
  const chip = e.target.closest('.secret');
  menuChip = chip;
  const part = chip ? selectedShownText() : null;
  menuSelection = part && inChip(window.getSelection().anchorNode) === chip ? part : '';
  if (chip) window.taskpop.showNoteSecretMenu(chip.dataset.id, shownTexts.has(chip.dataset.id), !!menuSelection);
  else window.taskpop.showNoteEditorMenu(!!hideableRange());
});

// Copy and cut keep hidden pieces hidden (and they come back as hidden pieces when pasted here)
function copyOut(e, cut) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !noteEditor.contains(sel.anchorNode)) return;
  // Part of a hidden piece that shows: just that part, and off the clipboard in a minute
  const part = selectedShownText();
  if (part !== null) {
    e.preventDefault();
    copyShown(inChip(sel.anchorNode, true).dataset.id, part);
    return;
  }
  const range = sel.getRangeAt(0);
  const frag = range.cloneContents();
  if (!frag.querySelector('.secret')) return; // plain text: the usual copy
  e.preventDefault();
  const segs = segmentsOf(frag);
  const shownText = (id) => (shownTexts.has(id) ? shownTexts.get(id) : MASK);
  e.clipboardData.setData('text/plain', segs.map((s) => (s.t === 'text' ? s.v : shownText(s.id))).join(''));
  e.clipboardData.setData(NOTE_MIME, JSON.stringify(segs));
  if (cut) {
    const at = caretOffset();
    range.deleteContents();
    freshEditor(at);
    saveNoteNow();
  }
}
noteEls.drawer.addEventListener('copy', (e) => copyOut(e, false));
noteEls.drawer.addEventListener('cut', (e) => copyOut(e, true));
noteEls.drawer.addEventListener('paste', (e) => {
  if (e.target !== noteEditor && !noteEditor.contains(e.target)) return;
  let segs = null;
  try {
    segs = JSON.parse(e.clipboardData.getData(NOTE_MIME) || 'null');
  } catch (_) {
    segs = null;
  }
  if (!Array.isArray(segs)) return; // plain text: the usual paste
  e.preventDefault();
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const start = caretOffset();
  range.deleteContents();
  const frag = document.createDocumentFragment();
  for (const s of segs) {
    if (s && s.t === 'text' && typeof s.v === 'string') frag.append(document.createTextNode(s.v));
    else if (s && s.t === 'secret' && typeof s.id === 'string') frag.append(secretChip(s.id));
  }
  range.insertNode(frag);
  freshEditor((start || 0) + segmentLength(segs));
  saveNoteNow();
});

// The buttons and the "Add hidden text" box
noteEls.hide.addEventListener('click', hideSelection);
noteEls.add.addEventListener('click', openAddHidden);
noteEls.addCancel.addEventListener('click', closeAddHidden);
noteEls.addForm.addEventListener('submit', (e) => {
  e.preventDefault();
  addHidden();
});
noteEls.addForm.addEventListener('keydown', (e) => {
  e.stopPropagation(); // (Esc closes this box, not the panel)
  if (e.key === 'Escape') {
    e.preventDefault();
    closeAddHidden();
    noteEditor.focus();
  }
});

window.taskpop.onNoteSecretAction(({ id, action }) => {
  if (action === 'copy-selection') copyShown(id, menuSelection);
  else if (action === 'show') revealSecret(id);
  else if (action === 'hide') maskSecret(id);
  else if (action === 'copy') copySecret(id);
  else if (action === 'plain') makePlain(id);
  else if (action === 'delete') deleteSecret(id);
});
window.taskpop.onNoteEditorAction((action) => {
  if (action === 'hide') hideSelection();
  else if (action === 'add') openAddHidden();
});

// Shown text never outlasts the panel
window.taskpop.onHidden(() => {
  maskAllSecrets();
  closeAddHidden();
  if (noteSaveTimer) saveNoteNow();
});

window.taskpop.getState().then((state) => {
  fillEditor(noteEditor, (state.note && state.note.segments) || []);
  setNoteOpen(!!(state.settings && state.settings.noteOpen), { remember: false });
  updateHint();
});
