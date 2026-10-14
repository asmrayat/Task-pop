// The quick note under the task list (v1.9).
//
// The note is a run of segments: plain text, and hidden text. Hidden text is encrypted with
// Electron's safeStorage (macOS: a key kept in your keychain; Windows: DPAPI, tied to your
// Windows account) the moment you hide it, and only that encrypted form is ever saved or kept:
// notes.json, and its backup, never hold hidden text as you typed it. It's decrypted only to be
// shown or copied, right after you've confirmed it's you (see verify.js).
//
// The panel gets the note with hidden text as ids only.

const crypto = require('crypto');

const MAX_TEXT = 20000; // characters of plain text in the note
const MAX_SECRET = 2000; // characters in one piece of hidden text
const MAX_SECRETS = 200;
const config = { clipboardClearMs: 60 * 1000 }; // (tests shorten it)

/** Plain text and hidden-text ids only; anything else is dropped. */
function cleanSegments(list, known) {
  if (!Array.isArray(list)) return [];
  const out = [];
  let chars = 0;
  for (const s of list) {
    if (!s || typeof s !== 'object') continue;
    if (s.t === 'text' && typeof s.v === 'string' && s.v) {
      const v = s.v.slice(0, Math.max(0, MAX_TEXT - chars));
      chars += v.length;
      if (!v) continue;
      const last = out[out.length - 1];
      if (last && last.t === 'text') last.v += v;
      else out.push({ t: 'text', v });
    } else if (s.t === 'secret' && typeof s.id === 'string' && known(s.id)) {
      out.push({ t: 'secret', id: s.id });
    }
  }
  return out;
}

class QuickNote {
  /**
   * read(name, fallback) and write(name, data) store JSON files (the app's own, with backups);
   * safeStorage is Electron's.
   */
  constructor({ read, write, safeStorage }) {
    this.read = read;
    this.write = write;
    this.safeStorage = safeStorage;
    this.segments = [];
    this.secrets = new Map(); // id -> base64 of the encrypted text (this session's, saved or not)
    this.updatedAt = null;
  }

  load() {
    const raw = this.read('notes.json', null);
    this.secrets.clear();
    if (raw && raw.secrets && typeof raw.secrets === 'object') {
      for (const [id, enc] of Object.entries(raw.secrets)) {
        if (typeof enc === 'string' && /^[A-Za-z0-9+/=]+$/.test(enc) && this.secrets.size < MAX_SECRETS) this.secrets.set(id, enc);
      }
    }
    this.segments = cleanSegments(raw && raw.segments, (id) => this.secrets.has(id));
    this.updatedAt = raw && raw.updatedAt;
  }

  /** What the panel gets: hidden text as ids only. */
  forPanel() {
    return { segments: this.segments.map((s) => ({ ...s })) };
  }

  save(segments) {
    this.segments = cleanSegments(segments, (id) => this.secrets.has(id));
    this.updatedAt = new Date().toISOString();
    const used = new Set(this.segments.filter((s) => s.t === 'secret').map((s) => s.id));
    const secrets = {};
    for (const id of used) secrets[id] = this.secrets.get(id);
    // (pieces taken out stay known for this session, so Undo or pasting them back still works)
    this.write('notes.json', { version: 1, updatedAt: this.updatedAt, segments: this.segments, secrets });
  }

  canHide() {
    try {
      return !!this.safeStorage && this.safeStorage.isEncryptionAvailable();
    } catch (_) {
      return false;
    }
  }

  /** Encrypt a piece of text; returns its id. Throws if it can't be encrypted. */
  hide(text) {
    if (typeof text !== 'string' || !text.trim()) throw new Error('Nothing to hide.');
    if (text.length > MAX_SECRET) throw new Error(`That’s too long to hide (up to ${MAX_SECRET} characters).`);
    if (this.secrets.size >= MAX_SECRETS) throw new Error('That’s as much hidden text as the note can hold.');
    if (!this.canHide()) throw new Error('This computer can’t encrypt hidden text right now.');
    const enc = this.safeStorage.encryptString(text).toString('base64');
    const id = crypto.randomUUID();
    this.secrets.set(id, enc);
    return id;
  }

  has(id) {
    return this.secrets.has(id);
  }

  /** The text behind an id (call only after you've confirmed it's the user). */
  reveal(id) {
    const enc = this.secrets.get(id);
    if (!enc) throw new Error('That hidden text is no longer there.');
    return this.safeStorage.decryptString(Buffer.from(enc, 'base64'));
  }
}

module.exports = { QuickNote, cleanSegments, config, MAX_SECRET, MAX_TEXT };
