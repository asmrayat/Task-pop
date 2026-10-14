// The quick note (v1.9): a note under the task list, opened with the arrow at the end of the
// "Add a task" bar, or ⌘J (Ctrl+J on Windows).
//
// Select text and click Hide to keep it private: the app encrypts it at once and it shows as
// ••••••. Clicking it asks for Touch ID or your Mac password (Windows Hello or your Windows
// password on Windows) before it's shown. Shown text hides itself again after a minute, when you
// close the note and whenever the panel closes. Hidden text is never saved in plain, and this
// page only ever has it while it's showing.
//
// The note is a run of plain text and hidden pieces ({ t: 'secret', id }); this page edits it
// in a plain-text editable box in which each hidden piece is one uneditable chip.

const noteEls = {
  btn: document.getElementById('noteBtn'),
  drawer: document.getElementById('noteDrawer'),
  status: document.getElementById('noteStatus'),
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
};

let noteIsOpen = false;
let noteSaveTimer = null;
let noteStatusTimer = null;
let noteRange = null; // the last selection (or caret) in the note
const shownTimers = new Map(); // hidden piece showing -> its timer to hide it again
let menuChip = null; // the hidden piece last right-clicked (a pasted copy shares its id)
const unlockWords = () => (platform === 'win32' ? 'Windows Hello or your Windows password' : 'Touch ID or your Mac password');

// ---------- The note as segments ----------

function secretChip(id) {
  const chip = document.createElement('span');
  chip.className = 'secret';
  chip.contentEditable = 'false';
  chip.dataset.id = id;
  chip.innerHTML = NOTE_ICONS.locked;
  const text = document.createElement('span');
  text.className = 'secret-text';
  text.textContent = MASK;
  chip.append(text);
  chip.title = `Hidden — click to show it (${unlockWords()})`;
  chip.setAttribute('aria-label', 'Hidden text');
  return chip;
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
  const frag = range.cloneContents();
  if (frag.querySelector && frag.querySelector('.secret')) return null;
  const text = segmentsOf(frag).map((s) => s.v).join('');
  return text.trim() ? { range, text } : null;
}

function updateHideButton() {
  noteEls.hide.disabled = !hideableRange();
}

document.addEventListener('selectionchange', () => {
  const sel = window.getSelection();
  if (sel.rangeCount && noteEditor.contains(sel.anchorNode)) noteRange = sel.getRangeAt(0).cloneRange();
  updateHideButton();
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
  sayInNote(`Hidden and encrypted. Click it to see it (${unlockWords()}).`, 7000);
}

/** "Add hidden text": typed in a password box, so it's never in the note as plain text. */
function openAddHidden() {
  if (!noteIsOpen) setNoteOpen(true);
  const caret = caretOffset();
  noteEls.addForm.dataset.caret = caret === null ? '' : String(caret);
  noteEls.addForm.hidden = false;
  noteEls.addInput.value = '';
  noteEls.addInput.focus();
}

function closeAddHidden() {
  noteEls.addInput.value = '';
  noteEls.addForm.hidden = true;
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
  sayInNote(`Added, hidden and encrypted. Click it to see it (${unlockWords()}).`, 7000);
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
  for (const chip of chipsFor(id)) {
    chip.classList.add('shown');
    chip.firstElementChild.outerHTML = NOTE_ICONS.open;
    chip.querySelector('.secret-text').textContent = text;
    chip.title = 'Showing — click to hide it again';
  }
  clearTimeout(shownTimers.get(id));
  shownTimers.set(id, setTimeout(() => maskSecret(id), SHOW_FOR_MS));
}

function maskSecret(id) {
  clearTimeout(shownTimers.get(id));
  shownTimers.delete(id);
  for (const chip of chipsFor(id)) {
    chip.classList.remove('shown');
    chip.firstElementChild.outerHTML = NOTE_ICONS.locked;
    chip.querySelector('.secret-text').textContent = MASK;
    chip.title = `Hidden — click to show it (${unlockWords()})`;
  }
}

function maskAllSecrets() {
  [...shownTimers.keys()].forEach(maskSecret);
}

async function copySecret(id) {
  const chip = chipsFor(id)[0];
  if (!chip) return;
  const result = chip.classList.contains('shown')
    ? await window.taskpop.copyShownNoteText(chip.querySelector('.secret-text').textContent)
    : await window.taskpop.copyNoteText(id);
  if (result && result.ok) sayInNote(`Copied. It comes off the clipboard in ${Math.round(result.clearsIn / 1000)} seconds.`, 6000);
  else if (result && result.message) sayInNote(result.message, 6000);
}

/** The chip a menu action is for: the one right-clicked (or the first with that id). */
const chipForMenu = (id) => (menuChip && menuChip.isConnected && menuChip.dataset.id === id ? menuChip : chipsFor(id)[0]);

/** A piece that's showing becomes ordinary text again (no longer encrypted). */
function makePlain(id) {
  const chip = chipForMenu(id);
  if (!chip || !chip.classList.contains('shown')) return;
  const text = chip.querySelector('.secret-text').textContent;
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

// Hidden pieces: click to show (or hide again); right-click for more
noteEls.drawer.addEventListener('mousedown', (e) => {
  if (e.target.closest('.secret')) e.preventDefault(); // no caret inside a chip
  if (e.target.closest('#noteHideBtn')) e.preventDefault(); // keep the selection
});
noteEls.drawer.addEventListener('click', (e) => {
  const chip = e.target.closest('.secret');
  if (!chip) return;
  if (chip.classList.contains('shown')) maskSecret(chip.dataset.id);
  else revealSecret(chip.dataset.id);
});
noteEls.drawer.addEventListener('contextmenu', (e) => {
  if (!noteEditor.contains(e.target)) return;
  e.preventDefault();
  const chip = e.target.closest('.secret');
  menuChip = chip;
  if (chip) window.taskpop.showNoteSecretMenu(chip.dataset.id, chip.classList.contains('shown'));
  else window.taskpop.showNoteEditorMenu(!!hideableRange());
});

// Copy and cut keep hidden pieces hidden (and they come back as hidden pieces when pasted here)
function copyOut(e, cut) {
  const sel = window.getSelection();
  if (!sel.rangeCount || !noteEditor.contains(sel.anchorNode)) return;
  const range = sel.getRangeAt(0);
  const frag = range.cloneContents();
  if (!frag.querySelector('.secret')) return; // plain text: the usual copy
  e.preventDefault();
  const segs = segmentsOf(frag);
  const shownText = (id) => {
    const chip = chipsFor(id)[0];
    return chip && chip.classList.contains('shown') ? chip.querySelector('.secret-text').textContent : MASK;
  };
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
  if (action === 'show') revealSecret(id);
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
});
