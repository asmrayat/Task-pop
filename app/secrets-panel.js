// Secrets (v1.10): your logins, passwords and codes, under the task list. Open them with the
// lock at the end of the "Add a task" bar, or ⌘J (Ctrl+J on Windows).
//
// Each secret has a name you always see ("Uni login") and hidden fields (Username, Password).
// Click New to add one: it's encrypted as soon as you save it. Click Show to see one: TaskPop
// asks for Touch ID or your Mac password (Windows Hello on Windows)
// first. While it shows, each field has a Copy button, and any part of it can be selected and
// copied; whatever you copy comes off the clipboard after a minute. It hides itself again after
// a minute, when you click Hide, close Secrets, or the panel closes. ⋯ (or a right-click) has
// Edit and Delete.
//
// This page only ever has a secret's values while it shows (or while you edit it).
// (In 1.9 this was the "quick note": free text with pieces hidden in it. See secrets.js.)

const sec = {
  btn: document.getElementById('noteBtn'),
  drawer: document.getElementById('noteDrawer'),
  list: document.getElementById('secretsList'),
  newBtn: document.getElementById('secretNewBtn'),
  form: document.getElementById('secretForm'),
  formTitle: document.getElementById('secretFormTitle'),
  name: document.getElementById('secretName'),
  fields: document.getElementById('secretFormFields'),
  formNote: document.getElementById('secretFormNote'),
  cancel: document.getElementById('secretCancel'),
  save: document.getElementById('secretSave'),
  status: document.getElementById('noteStatus'),
  hint: document.getElementById('noteHint'),
};

const SHOW_FOR_MS = 60 * 1000;
const SECRET_ICONS = {
  locked: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="7.2" width="9.6" height="6.6" rx="1.7"/><path d="M5.4 7.2V5.3a2.6 2.6 0 0 1 5.2 0v1.9"/></svg>',
  open: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3.2" y="7.2" width="9.6" height="6.6" rx="1.7"/><path d="M5.4 7.2V5.3a2.6 2.6 0 0 1 5.1-.7"/></svg>',
  note: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="2.5" width="10" height="11" rx="1.8"/><path d="M5.6 6h4.8M5.6 8.5h4.8M5.6 11h2.8"/></svg>',
  copy: '<svg viewBox="0 0 12 12" aria-hidden="true"><rect x="3.8" y="3.8" width="6.4" height="6.6" rx="1.3"/><path d="M8.2 3.8V2.9a1.1 1.1 0 0 0-1.1-1.1H2.9a1.1 1.1 0 0 0-1.1 1.1v4.3a1.1 1.1 0 0 0 1.1 1.1h.9"/></svg>',
  eye: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.6 8s2.4-4.4 6.4-4.4S14.4 8 14.4 8s-2.4 4.4-6.4 4.4S1.6 8 1.6 8z"/><circle cx="8" cy="8" r="2"/></svg>',
  more: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="3.6" cy="8" r="1.25"/><circle cx="8" cy="8" r="1.25"/><circle cx="12.4" cy="8" r="1.25"/></svg>',
};

let secretItems = []; // as the panel gets them: { id, name, fields: [{ label, hidden } | { label, text }] }
let secretsOpen = false;
const shownSecrets = new Map(); // id -> { fields: [{ label, hidden, value }], until, timer } while it shows
const checking = new Set(); // ids waiting for Touch ID / Windows Hello
let secretForm = null; // null, or { id: null (new) | id, rows: [{ label, saveLabel, plain, input }] }
let deleting = null; // the id whose row asks "Delete it?"
let secretStatusTimer = null;
let secretHintTicker = null;

const confirmWords = () => (platform === 'win32' ? 'Windows Hello' : 'Touch ID or your Mac password');
const thisComputer = () => (platform === 'win32' ? 'this PC' : 'this Mac');
const copyKeys = () => (platform === 'darwin' ? '⌘C' : 'Ctrl+C');
const findSecret = (id) => secretItems.find((s) => s.id === id) || null;
const hasHidden = (item) => item.fields.some((f) => f.hidden);

function secEl(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function secButton(className, html, title) {
  const b = secEl('button', className);
  b.type = 'button';
  b.innerHTML = html;
  if (title) b.title = title;
  return b;
}

// ---------- Messages, and the line that says what you can do ----------

function sayInSecrets(message, ms = 5000, action = null) {
  sec.status.textContent = message;
  if (action) {
    // (v1.10.1) e.g. "Open Sign-in options" when Windows Hello isn't set up
    const b = secButton('secrets-status-btn', action.label, action.title);
    b.addEventListener('click', action.run);
    sec.status.append(' ', b);
  }
  clearTimeout(secretStatusTimer);
  secretStatusTimer = setTimeout(() => {
    sec.status.textContent = '';
  }, ms);
}

function updateSecretsHint() {
  let hint = '';
  if (secretForm) {
    hint = `It’s encrypted on ${thisComputer()} as soon as you save it. Only you can show it.`;
  } else if (shownSecrets.size) {
    const left = Math.max(1, Math.ceil((Math.min(...[...shownSecrets.values()].map((s) => s.until)) - Date.now()) / 1000));
    hint = `Click Copy, or select part of it and press ${copyKeys()}. Hides again in ${left} s.`;
  } else if (secretItems.some(hasHidden)) {
    hint = `Click Show to see a secret. You’ll confirm with ${confirmWords()}.`;
  } else if (secretItems.length) {
    hint = 'Click New to keep a login, a password or a code.';
  }
  if (sec.hint.textContent !== hint) sec.hint.textContent = hint;
  if (shownSecrets.size && !secretHintTicker) secretHintTicker = setInterval(updateSecretsHint, 1000);
  if (!shownSecrets.size && secretHintTicker) {
    clearInterval(secretHintTicker);
    secretHintTicker = null;
  }
}

// ---------- The list ----------

function fieldSummary(item) {
  const labels = item.fields.filter((f) => f.hidden).map((f) => f.label || 'Hidden');
  return [...new Set(labels)].join(' · ');
}

/** One field that shows: its label, its value (selectable) and Copy. A field without a label
 *  that has several lines (from an old quick note) shows each line on its own, to copy each. */
function fieldRows(field) {
  const lines = !field.label && field.value.includes('\n') ? field.value.split('\n').filter((l) => l.trim()) : [field.value];
  return lines.map((value, i) => {
    const row = secEl('div', `secret-field${field.hidden ? '' : ' plain'}`);
    const text = secEl('div', 'secret-field-text');
    if (field.label && i === 0) text.append(secEl('span', 'secret-label', field.label));
    const v = secEl('span', 'secret-value', value);
    v.title = `Select any part to copy just that (${copyKeys()})`;
    text.append(v);
    row.append(text);
    if (field.hidden) {
      const copy = secButton('secret-copy', `${SECRET_ICONS.copy}<span>Copy</span>`, `Copy ${field.label ? field.label.toLowerCase() : 'it'}`);
      copy.dataset.value = String(i);
      row.append(copy);
      row.copyValue = value; // (kept on the element, not in its attributes)
    }
    return row;
  });
}

function secretRow(item) {
  const row = secEl('div', 'secret-item');
  row.dataset.id = item.id;
  row.setAttribute('role', 'listitem');
  const showing = shownSecrets.get(item.id);
  const hidden = hasHidden(item);
  row.classList.toggle('shown', !!showing);
  row.classList.toggle('plain', !hidden);

  const head = secEl('div', 'secret-head');
  const icon = secEl('span', 'secret-icon');
  icon.innerHTML = !hidden ? SECRET_ICONS.note : showing ? SECRET_ICONS.open : SECRET_ICONS.locked;
  const name = secEl('span', 'secret-name');
  name.append(secEl('span', 'secret-title', item.name));
  if (hidden && !showing) name.append(secEl('small', 'secret-summary', fieldSummary(item)));
  head.append(icon, name);

  if (deleting === item.id) {
    head.append(secEl('span', 'secret-ask', 'Delete it?'),
      secButton('secret-btn quiet', 'Cancel', 'Keep it'),
      secButton('secret-btn danger', 'Delete', `Delete “${item.name}”`));
    head.children[3].dataset.act = 'keep';
    head.children[4].dataset.act = 'delete-now';
  } else {
    if (hidden) {
      const busy = checking.has(item.id);
      const toggle = secButton(`secret-btn ${showing ? 'quiet' : 'show'}`, showing ? 'Hide' : `${SECRET_ICONS.eye}<span>${busy ? 'Checking…' : 'Show'}</span>`,
        showing ? 'Hide it again' : `Show it (${confirmWords()})`);
      toggle.dataset.act = showing ? 'hide' : 'show';
      toggle.disabled = busy;
      head.append(toggle);
    }
    const more = secButton('secret-more', SECRET_ICONS.more, 'Edit or delete');
    more.dataset.act = 'more';
    more.setAttribute('aria-label', `More for ${item.name}`);
    head.append(more);
  }
  row.append(head);

  // The fields: while it shows; plain ones (an old quick note's other text) always
  const fields = showing ? showing.fields : hidden ? [] : item.fields.map((f) => ({ label: f.label, hidden: false, value: f.text || '' }));
  if (fields.length) {
    const box = secEl('div', 'secret-fields');
    for (const f of fields) box.append(...fieldRows(f));
    row.append(box);
  }
  return row;
}

function renderSecrets() {
  const frag = document.createDocumentFragment();
  if (!secretItems.length) {
    const empty = secEl('div', 'secrets-empty');
    const p = secEl('p');
    p.append(secEl('b', null, 'Keep your passwords here. '),
      document.createTextNode(`Logins, PINs, Wi-Fi codes: encrypted on ${thisComputer()}, and shown only after ${confirmWords()}.`));
    const first = secButton('secrets-first', `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9"/></svg><span>Add a secret</span>`);
    first.dataset.act = 'new';
    empty.append(p, first);
    frag.append(empty);
  }
  for (const item of secretItems) frag.append(secretRow(item));
  sec.list.replaceChildren(frag);
  sec.list.hidden = !!secretForm;
  sec.newBtn.hidden = !!secretForm || !secretItems.length;
  updateSecretsHint();
}

// ---------- Showing and hiding ----------

async function showSecret(id) {
  const item = findSecret(id);
  if (!item || checking.has(id)) return;
  deleting = null;
  checking.add(id);
  renderSecrets();
  const result = await window.taskpop.revealSecret(id, 'show');
  checking.delete(id);
  if (result && result.ok) {
    shownSecrets.set(id, { fields: result.fields, until: 0, timer: null });
    keepShowing(id);
  } else if (result && result.message) {
    sayFailure(result);
  }
  renderSecrets();
}

/** Why a secret couldn't be shown; on a PC without Windows Hello, with a way to set it up. */
function sayFailure(result) {
  if (result.setupHello) {
    sayInSecrets(result.message, 20000, {
      label: 'Open Sign-in options',
      title: 'Windows Settings → Accounts → Sign-in options',
      run: () => window.taskpop.openHelloSettings(),
    });
  } else {
    sayInSecrets(result.message, 7000);
  }
}

/** It shows for another minute from now. */
function keepShowing(id) {
  const s = shownSecrets.get(id);
  if (!s) return;
  clearTimeout(s.timer);
  s.until = Date.now() + SHOW_FOR_MS;
  s.timer = setTimeout(() => hideSecret(id), SHOW_FOR_MS);
}

function hideSecret(id) {
  const s = shownSecrets.get(id);
  if (!s) return;
  clearTimeout(s.timer);
  shownSecrets.delete(id);
  const sel = window.getSelection();
  if (sel.rangeCount && sec.list.contains(sel.anchorNode)) sel.removeAllRanges();
  renderSecrets();
}

function hideAllSecrets() {
  [...shownSecrets.keys()].forEach(hideSecret);
}

async function copySecretText(id, text, what = 'Copied') {
  if (!text) return;
  keepShowing(id);
  const result = await window.taskpop.copySecret(text);
  if (result && result.ok) sayInSecrets(`${what}. It comes off the clipboard in ${Math.round(result.clearsIn / 1000)} seconds.`, 6000);
}

/** The part of a showing secret that's selected, if the selection is all inside one. */
function selectedSecretText() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const range = sel.getRangeAt(0);
  const itemOf = (n) => {
    const e = n && (n.nodeType === Node.ELEMENT_NODE ? n : n.parentElement);
    return e && e.closest('.secret-item.shown');
  };
  const item = itemOf(range.startContainer);
  if (!item || item !== itemOf(range.endContainer) || !sec.list.contains(item)) return null;
  const parts = [];
  for (const v of item.querySelectorAll('.secret-value')) {
    if (!range.intersectsNode(v)) continue;
    const part = document.createRange();
    part.selectNodeContents(v);
    if (range.compareBoundaryPoints(Range.START_TO_START, part) > 0) part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(Range.END_TO_END, part) < 0) part.setEnd(range.endContainer, range.endOffset);
    if (part.toString()) parts.push(part.toString());
  }
  return { id: item.dataset.id, text: parts.join('\n') };
}

// ---------- New and Edit ----------

function formRow({ label, saveLabel, value = '', hiddenValue, plain }) {
  const wrap = secEl('label', `secret-input${plain ? ' plain' : ''}`);
  wrap.append(secEl('span', null, label));
  let input;
  if (plain) {
    input = secEl('textarea');
    input.rows = 3;
  } else {
    input = secEl('input');
    input.type = hiddenValue ? 'password' : 'text';
  }
  input.value = value;
  input.maxLength = plain ? 20000 : 2000;
  input.spellcheck = false;
  input.autocomplete = 'off';
  if (!plain && hiddenValue) {
    const box = secEl('span', 'secret-input-box');
    const eye = secButton('secret-eye', SECRET_ICONS.eye, 'Show what you typed');
    eye.addEventListener('mousedown', (e) => e.preventDefault());
    eye.addEventListener('click', (e) => {
      e.preventDefault();
      input.type = input.type === 'password' ? 'text' : 'password';
      eye.classList.toggle('on', input.type === 'text');
    });
    box.append(input, eye);
    wrap.append(box);
  } else {
    wrap.append(input);
  }
  return { label, saveLabel, plain: !!plain, input, wrap };
}

function openSecretForm(id = null, fields = null) {
  hideAllSecrets();
  deleting = null;
  const item = id ? findSecret(id) : null;
  const rows = [];
  if (!item) {
    rows.push(formRow({ label: 'Username or email', saveLabel: 'Username', placeholder: '' }));
    rows.push(formRow({ label: 'Password', saveLabel: 'Password', hiddenValue: true }));
    rows[0].input.placeholder = 'Optional';
  } else {
    for (const f of fields) {
      if (!f.hidden) {
        rows.push(formRow({ label: f.label || 'Notes', saveLabel: f.label, value: f.value, plain: true }));
      } else if (!f.label && f.value.includes('\n')) {
        f.value.split('\n').filter((l) => l.trim()).forEach((line, i) => rows.push(formRow({ label: `Line ${i + 1}`, saveLabel: '', value: line, hiddenValue: true })));
      } else {
        const isUser = /^user|e-?mail|login/i.test(f.label);
        rows.push(formRow({ label: f.label || 'Hidden', saveLabel: f.label, value: f.value, hiddenValue: !isUser }));
      }
    }
  }
  secretForm = { id: item ? item.id : null, rows };
  clearTimeout(secretStatusTimer); // (an earlier message would only take the form's room)
  sec.status.textContent = '';
  sec.formTitle.textContent = item ? `Edit “${item.name}”` : 'New secret';
  sec.name.value = item ? item.name : '';
  sec.fields.replaceChildren(...rows.map((r) => r.wrap));
  sec.formNote.textContent = '';
  sec.save.disabled = false;
  sec.form.hidden = false;
  renderSecrets();
  sec.name.focus();
  if (item) sec.name.select();
}

function closeSecretForm() {
  if (!secretForm) return;
  for (const r of secretForm.rows) r.input.value = ''; // (don't leave it in the page)
  secretForm = null;
  sec.fields.replaceChildren();
  sec.name.value = '';
  sec.form.hidden = true;
  renderSecrets();
}

async function editSecret(id) {
  const item = findSecret(id);
  if (!item) return;
  checking.add(id);
  renderSecrets();
  const result = await window.taskpop.revealSecret(id, 'edit');
  checking.delete(id);
  if (result && result.ok) openSecretForm(id, result.fields);
  else {
    if (result && result.message) sayFailure(result);
    renderSecrets();
  }
}

async function saveSecretForm() {
  if (!secretForm) return;
  const name = sec.name.value.trim();
  const fields = secretForm.rows.map((r) => ({ label: r.saveLabel, value: r.input.value, plain: r.plain }));
  if (!fields.some((f) => f.value.trim())) {
    sec.formNote.textContent = secretForm.id ? 'Type something to keep, or delete this secret instead.' : 'Type a username or a password first.';
    secretForm.rows[secretForm.rows.length - 1].input.focus();
    return;
  }
  const finalName = name || 'Secret';
  sec.save.disabled = true;
  const id = secretForm.id;
  const result = id
    ? await window.taskpop.updateSecret(id, { name: finalName, fields })
    : await window.taskpop.addSecret({ name: finalName, fields });
  sec.save.disabled = false;
  if (!result || !result.ok) {
    sec.formNote.textContent = (result && result.message) || 'That couldn’t be saved.';
    return;
  }
  secretItems = result.items;
  closeSecretForm();
  sayInSecrets(`${id ? 'Changed' : 'Saved'} “${finalName}”. It’s encrypted on ${thisComputer()}.`, 6000);
}

async function deleteSecretNow(id) {
  const item = findSecret(id);
  deleting = null;
  shownSecrets.delete(id);
  const result = await window.taskpop.deleteSecret(id);
  if (result && result.ok) secretItems = result.items;
  renderSecrets();
  if (item) sayInSecrets(`Deleted “${item.name}”.`);
}

// ---------- Opening and closing ----------

function setNoteOpen(open, { remember = true, focus = false } = {}) {
  secretsOpen = !!open;
  sec.drawer.hidden = !secretsOpen;
  sec.btn.classList.toggle('open', secretsOpen);
  sec.btn.setAttribute('aria-expanded', String(secretsOpen));
  const keys = platform === 'darwin' ? '⌘J' : 'Ctrl+J';
  sec.btn.title = secretsOpen ? `Close Secrets (${keys})` : `Secrets: your passwords and codes (${keys})`;
  if (!secretsOpen) {
    hideAllSecrets();
    closeSecretForm();
    deleting = null;
    if (sec.drawer.contains(document.activeElement)) inputEl.focus();
  } else if (focus) {
    const first = sec.list.querySelector('.secret-btn.show, .secrets-first, .secret-more');
    (first || sec.newBtn).focus();
  }
  renderSecrets();
  if (remember) window.taskpop.updateSetting('noteOpen', secretsOpen);
}

sec.btn.addEventListener('click', () => setNoteOpen(!secretsOpen, { focus: true }));
document.addEventListener('keydown', (e) => {
  if (primaryKey(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'j') {
    e.preventDefault();
    e.stopPropagation();
    setNoteOpen(!secretsOpen, { focus: true });
  }
}, true);

// ---------- Clicks, keys, copying ----------

sec.newBtn.addEventListener('click', () => openSecretForm());
sec.cancel.addEventListener('click', closeSecretForm);
sec.form.addEventListener('submit', (e) => {
  e.preventDefault();
  saveSecretForm();
});
sec.form.addEventListener('keydown', (e) => {
  e.stopPropagation(); // (typing here never acts on tasks, and Esc closes the form, not the panel)
  if (e.key === 'Escape') {
    e.preventDefault();
    closeSecretForm();
    sec.newBtn.focus();
  }
});

sec.list.addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) e.preventDefault(); // keep a selection while clicking Copy
});
sec.list.addEventListener('click', (e) => {
  const btn = e.target.closest('button');
  const row = e.target.closest('.secret-item');
  if (!btn) {
    // Clicking the name of a hidden secret shows it too
    if (row && !row.classList.contains('shown') && !row.classList.contains('plain') && e.target.closest('.secret-head') && !window.getSelection().toString()) showSecret(row.dataset.id);
    return;
  }
  if (btn.dataset.act === 'new') {
    openSecretForm();
    return;
  }
  if (!row) return;
  const id = row.dataset.id;
  if (btn.classList.contains('secret-copy')) {
    const field = btn.closest('.secret-field');
    const label = field.querySelector('.secret-label');
    copySecretText(id, field.copyValue, label ? `${label.textContent} copied` : 'Copied');
  } else if (btn.dataset.act === 'show') {
    showSecret(id);
  } else if (btn.dataset.act === 'hide') {
    hideSecret(id);
  } else if (btn.dataset.act === 'more') {
    window.taskpop.showSecretMenu(id, shownSecrets.has(id));
  } else if (btn.dataset.act === 'keep') {
    deleting = null;
    renderSecrets();
  } else if (btn.dataset.act === 'delete-now') {
    deleteSecretNow(id);
  }
});
sec.list.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.secret-item');
  if (!row) return;
  e.preventDefault();
  window.taskpop.showSecretMenu(row.dataset.id, shownSecrets.has(row.dataset.id));
});
// Arrows, Space, Delete and the like never act on the task list while you're in Secrets: after
// a click in it (selecting a password, say) until you click somewhere else
let inSecrets = false;
document.addEventListener('mousedown', (e) => {
  inSecrets = sec.drawer.contains(e.target);
}, true);
document.addEventListener('focusin', (e) => {
  inSecrets = sec.drawer.contains(e.target);
});
document.addEventListener('keydown', (e) => {
  if (!secretsOpen || (!inSecrets && !sec.drawer.contains(document.activeElement))) return;
  if (e.key === 'Escape' || e.key === 'Tab' || (primaryKey(e) && e.key.toLowerCase() === 'j')) return;
  if (sec.form.contains(e.target)) return; // (the form handles its own keys)
  e.stopPropagation(); // (the panel's own keys are heard on the document, after this)
}, true);

// Part of a secret that shows: just that part, and off the clipboard in a minute
document.addEventListener('copy', (e) => {
  const part = selectedSecretText();
  if (!part) return;
  e.preventDefault();
  copySecretText(part.id, part.text);
});
document.addEventListener('selectionchange', () => {
  const part = selectedSecretText();
  if (part) keepShowing(part.id); // (it doesn't hide while you're copying it)
});

window.taskpop.onSecretAction(({ id, action }) => {
  if (action === 'show') showSecret(id);
  else if (action === 'hide') hideSecret(id);
  else if (action === 'edit') editSecret(id);
  else if (action === 'delete') {
    deleting = id;
    renderSecrets();
  }
});

// Shown secrets never outlast the panel, and a half-typed one isn't kept
window.taskpop.onHidden(() => {
  hideAllSecrets();
  closeSecretForm();
  deleting = null;
  renderSecrets();
});

window.taskpop.getState().then((state) => {
  secretItems = Array.isArray(state.secrets) ? state.secrets : [];
  setNoteOpen(!!(state.settings && state.settings.noteOpen), { remember: false });
  if (state.secretsMigrated) {
    sayInSecrets('Your quick note is now Secrets: each hidden piece is a secret of its own, and the rest of the note is under “Notes”.', 20000);
  }
});
