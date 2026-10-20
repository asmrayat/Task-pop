// Secrets (v1.10): the logins, passwords and codes you keep under the task list.
//
// Each secret has a name you can always see ("Uni login") and one or more hidden fields
// (Username, Password). Hidden fields are encrypted with Electron's safeStorage (macOS: a key
// kept in your keychain; Windows: DPAPI, tied to your Windows account) the moment they're
// saved, and only that encrypted form is ever saved or kept: secrets.json, and its backup, never
// hold them as you typed them. They're decrypted only to be shown, right after you've confirmed
// it's you (see verify.js). The panel gets names and field labels only.
//
// Until 1.10 this was the "quick note": free text with pieces of it hidden. The first time 1.10
// runs, that note becomes secrets (see fromQuickNote): each hidden piece becomes a secret, named
// after the words before it, keeping its encrypted form as it is (nothing is decrypted, so
// macOS asks nothing at start-up), and the note's other text becomes a secret called "Notes"
// with a plain, unhidden field. Then the old note is deleted.

const crypto = require('crypto');

const MAX_ITEMS = 200;
const MAX_FIELDS = 6;
const MAX_NAME = 60;
const MAX_LABEL = 30;
const MAX_VALUE = 2000; // characters in one hidden field
const MAX_TEXT = 20000; // characters of plain text (only from an old quick note)
const config = { clipboardClearMs: 60 * 1000 }; // (tests shorten it)

const isEnc = (v) => typeof v === 'string' && v.length > 0 && v.length < 20000 && /^[A-Za-z0-9+/=]+$/.test(v);
const oneLine = (v, max) => String(v || '').replace(/\s+/g, ' ').trim().slice(0, max);

/** A field as saved: { label, enc } (hidden) or { label, text } (plain). Null if it's neither. */
function cleanField(f) {
  if (!f || typeof f !== 'object') return null;
  const label = oneLine(f.label, MAX_LABEL);
  if (isEnc(f.enc)) return { label, enc: f.enc };
  if (typeof f.text === 'string' && f.text.trim()) return { label, text: f.text.slice(0, MAX_TEXT) };
  return null;
}

function cleanItems(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (const it of list) {
    if (!it || typeof it !== 'object' || out.length >= MAX_ITEMS) continue;
    const fields = (Array.isArray(it.fields) ? it.fields : []).map(cleanField).filter(Boolean).slice(0, MAX_FIELDS);
    if (!fields.length) continue;
    let id = typeof it.id === 'string' && /^[\w-]{1,64}$/.test(it.id) ? it.id : crypto.randomUUID();
    if (ids.has(id)) id = crypto.randomUUID();
    ids.add(id);
    out.push({ id, name: oneLine(it.name, MAX_NAME) || 'Secret', fields });
  }
  return out;
}

/**
 * The 1.9 quick note as secrets. segments: [{ t: 'text', v } | { t: 'secret', id }];
 * hidden: id -> encrypted text (base64).
 *
 * "Uni pass" on one line and the hidden piece on the next: one secret, "Uni pass". "Password:
 * ••••••" on one line: a secret called "Password". Anything left over: a secret called "Notes".
 */
function fromQuickNote(segments, hidden) {
  const lines = [[]];
  for (const s of Array.isArray(segments) ? segments : []) {
    if (s && s.t === 'secret' && typeof s.id === 'string' && isEnc(hidden[s.id])) {
      lines[lines.length - 1].push({ secret: s.id });
    } else if (s && s.t === 'text' && typeof s.v === 'string') {
      const parts = s.v.split('\n');
      parts.forEach((p, i) => {
        if (i) lines.push([]);
        if (p) lines[lines.length - 1].push({ text: p });
      });
    }
  }
  const items = [];
  const plain = []; // lines of ordinary text not used as a name
  let above = false; // the last of those is just above (no hidden piece since)
  const nameOf = (text) => text.replace(/\s*[:=\-–—]+\s*$/, '').trim();
  for (const line of lines) {
    const firstSecret = line.findIndex((p) => p.secret);
    if (firstSecret === -1) {
      const text = line.map((p) => p.text).join('');
      if (text.trim()) {
        plain.push(text);
        above = true;
      }
      continue;
    }
    const before = nameOf(line.slice(0, firstSecret).map((p) => p.text || '').join(''));
    let name = before;
    if (!name && above && plain.length) name = nameOf(plain.pop()); // the line above names it
    above = false;
    const fields = [];
    let after = '';
    for (const p of line.slice(firstSecret)) {
      if (p.secret) fields.push({ label: '', enc: hidden[p.secret] });
      else after += p.text;
    }
    if (after.trim()) fields.push({ label: 'Note', text: after.trim() });
    items.push({ id: crypto.randomUUID(), name: oneLine(name, MAX_NAME) || `Secret ${items.length + 1}`, fields: fields.slice(0, MAX_FIELDS) });
  }
  if (plain.length) items.push({ id: crypto.randomUUID(), name: 'Notes', fields: [{ label: '', text: plain.join('\n').slice(0, MAX_TEXT) }] });
  return items;
}

class Secrets {
  /**
   * read(name, fallback) and write(name, data) store JSON files (the app's own, with backups);
   * remove(name) deletes one with its backup; safeStorage is Electron's.
   */
  constructor({ read, write, remove, safeStorage }) {
    this.read = read;
    this.write = write;
    this.remove = remove || (() => {});
    this.safeStorage = safeStorage;
    this.items = [];
    this.migrated = 0; // secrets made from an old quick note at this start
  }

  load() {
    const raw = this.read('secrets.json', null);
    if (raw) {
      this.items = cleanItems(raw.items);
      return;
    }
    this.items = [];
    const old = this.read('notes.json', null);
    if (!old || !Array.isArray(old.segments)) return;
    const hidden = old.secrets && typeof old.secrets === 'object' ? old.secrets : {};
    this.items = cleanItems(fromQuickNote(old.segments, hidden));
    this.migrated = this.items.length;
    this.persist();
    // The note is now in secrets.json; the old file (and its backup) would only keep a copy
    // of what you later change or delete
    if (this.read('secrets.json', null)) this.remove('notes.json');
  }

  persist() {
    this.write('secrets.json', { version: 1, updatedAt: new Date().toISOString(), items: this.items });
  }

  /** What the panel gets: names and labels, the plain text of plain fields, never hidden values. */
  forPanel() {
    return this.items.map((it) => ({
      id: it.id,
      name: it.name,
      fields: it.fields.map((f) => (f.enc ? { label: f.label, hidden: true } : { label: f.label, text: f.text })),
    }));
  }

  canEncrypt() {
    try {
      return !!this.safeStorage && this.safeStorage.isEncryptionAvailable();
    } catch (_) {
      return false;
    }
  }

  has(id) {
    return this.items.some((it) => it.id === id);
  }

  get(id) {
    return this.items.find((it) => it.id === id) || null;
  }

  /**
   * The fields of a new or changed secret, hidden ones encrypted. [{ label, value, plain }]:
   * plain is only for the unhidden text an old quick note left ("Notes"). Throws with a message.
   */
  encryptFields(fields, allowPlain = false) {
    if (!Array.isArray(fields)) throw new Error('Nothing to save.');
    const out = [];
    for (const f of fields.slice(0, MAX_FIELDS)) {
      if (!f || typeof f !== 'object') continue;
      const value = typeof f.value === 'string' ? f.value : '';
      if (!value.trim()) continue;
      const plain = allowPlain && f.plain === true;
      if (value.length > (plain ? MAX_TEXT : MAX_VALUE)) throw new Error(`That’s too long to keep (up to ${MAX_VALUE} characters).`);
      out.push({ label: oneLine(f.label, MAX_LABEL), value, plain });
    }
    if (!out.length) throw new Error('Type a username or a password first.');
    if (out.some((f) => !f.plain) && !this.canEncrypt()) throw new Error('This computer can’t encrypt secrets right now, so it wasn’t saved.');
    return out.map((f) => (f.plain
      ? { label: f.label, text: f.value }
      : { label: f.label, enc: this.safeStorage.encryptString(f.value).toString('base64') }));
  }

  /** Add a secret: { name, fields: [{ label, value }] }. Returns it as the panel sees it. */
  add({ name, fields } = {}) {
    if (this.items.length >= MAX_ITEMS) throw new Error('That’s as many secrets as TaskPop can keep.');
    const item = { id: crypto.randomUUID(), name: oneLine(name, MAX_NAME) || 'Secret', fields: this.encryptFields(fields) };
    this.items.push(item);
    this.persist();
    return item.id;
  }

  /** Change a secret's name and fields (all of them, as the edit form has them). */
  update(id, { name, fields } = {}) {
    const item = this.get(id);
    if (!item) throw new Error('That secret is no longer there.');
    // (a plain field can only stay plain where there was one: you can't un-hide by editing)
    const plainAllowed = item.fields.some((f) => !f.enc);
    item.fields = this.encryptFields(fields, plainAllowed).slice(0, MAX_FIELDS);
    item.name = oneLine(name, MAX_NAME) || item.name;
    this.persist();
  }

  delete(id) {
    const before = this.items.length;
    this.items = this.items.filter((it) => it.id !== id);
    if (this.items.length !== before) this.persist();
    return this.items.length !== before;
  }

  /** Every field of a secret as text (call only after you've confirmed it's the user). */
  reveal(id) {
    const item = this.get(id);
    if (!item) throw new Error('That secret is no longer there.');
    return item.fields.map((f) => ({
      label: f.label,
      hidden: !!f.enc,
      value: f.enc ? this.safeStorage.decryptString(Buffer.from(f.enc, 'base64')) : f.text,
    }));
  }
}

module.exports = { Secrets, fromQuickNote, cleanItems, config, MAX_VALUE, MAX_NAME, MAX_FIELDS };
