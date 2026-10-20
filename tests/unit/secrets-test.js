// v1.10: secrets on disk (app/secrets.js): adding, changing, deleting and showing them with
// their fields encrypted (a stand-in safeStorage that scrambles, so files can be checked for
// plain text), and turning a 1.9 quick note into secrets without decrypting anything.
const path = require('path');

const APP = process.env.TP_SRC || path.resolve(__dirname, '../../app');
const { Secrets, fromQuickNote } = require(`${APP}/secrets.js`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const enc = { available: true, decrypted: 0 };
const safeStorage = {
  isEncryptionAvailable: () => enc.available,
  encryptString: (t) => Buffer.concat([Buffer.from('FAKE'), Buffer.from(t, 'utf8').map((b) => b ^ 0x5a)]),
  decryptString: (b) => { enc.decrypted += 1; return Buffer.from(b.subarray(4).map((x) => x ^ 0x5a)).toString('utf8'); },
};
const scrambled = (t) => safeStorage.encryptString(t).toString('base64');
const disk = (files = {}) => ({
  files,
  removed: [],
  read(name, fallback) { return name in this.files ? JSON.parse(this.files[name]) : fallback; },
  write(name, data) { this.files[name] = JSON.stringify(data); },
  remove(name) { this.removed.push(name); delete this.files[name]; },
});

try {
  // ---------- A 1.9 quick note becomes secrets ----------
  const hidden = { a: scrambled('saif@uni.ac.uk\nhunter2!'), b: scrambled('pass-5G'), c: scrambled('4071'), d: scrambled('xyz') };
  const note = {
    version: 1,
    segments: [
      { t: 'text', v: 'Uni pass\n' }, { t: 'secret', id: 'a' },
      { t: 'text', v: '\nWi-Fi: Home-5G\nPassword: ' }, { t: 'secret', id: 'b' },
      { t: 'text', v: '\nRouter 192.168.1.1\nDoor code - ' }, { t: 'secret', id: 'c' }, { t: 'text', v: ' (front door)' },
      { t: 'text', v: '\n' }, { t: 'secret', id: 'd' }, { t: 'secret', id: 'gone' },
    ],
    secrets: hidden,
  };
  const items = fromQuickNote(note.segments, note.secrets);
  const names = items.map((i) => i.name);
  check('the line above a hidden piece names it ("Uni pass")', names[0] === 'Uni pass' && items[0].fields.length === 1 && items[0].fields[0].enc === hidden.a, names.join(' | '));
  check('"Password: ••••••" becomes a secret called "Password"', names[1] === 'Password' && items[1].fields[0].enc === hidden.b);
  check('"Door code - ••••••" too, with the words after it kept as a note', names[2] === 'Door code' && items[2].fields[1] && items[2].fields[1].text === '(front door)');
  check('a hidden piece with nothing to name it: "Secret 4"; one that no longer exists is left out', names[3] === 'Secret 4' && items[3].fields.length === 1);
  check('the rest of the note is kept as "Notes", not hidden (it never was)', names[4] === 'Notes' && items[4].fields[0].text === 'Wi-Fi: Home-5G\nRouter 192.168.1.1', JSON.stringify(items[4]));
  check('nothing was decrypted to do it (so macOS asks nothing when TaskPop starts)', enc.decrypted === 0);

  const d = disk({ 'notes.json': JSON.stringify(note) });
  const s = new Secrets({ read: d.read.bind(d), write: d.write.bind(d), remove: d.remove.bind(d), safeStorage });
  s.load();
  check('opening 1.10 the first time: secrets.json is written from the note, and the old note deleted', !!d.files['secrets.json'] && s.migrated === 5 && d.removed.includes('notes.json') && !d.files['notes.json']);
  const again = new Secrets({ read: d.read.bind(d), write: d.write.bind(d), remove: d.remove.bind(d), safeStorage });
  again.load();
  check('…and next time they load from secrets.json', again.items.length === 5 && again.migrated === 0);
  const shown = s.reveal(s.items[0].id);
  check('a migrated secret shows as it was', shown[0].value === 'saif@uni.ac.uk\nhunter2!' && shown[0].hidden === true);

  // ---------- New, change, delete ----------
  const fresh = disk();
  const box = new Secrets({ read: fresh.read.bind(fresh), write: fresh.write.bind(fresh), remove: fresh.remove.bind(fresh), safeStorage });
  box.load();
  check('nothing yet: no secrets, nothing written', box.items.length === 0 && !fresh.files['secrets.json']);
  const id = box.add({ name: '  Uni   login ', fields: [{ label: 'Username', value: 'sam.lee@uni.example' }, { label: 'Password', value: 'm4ngo!' }] });
  const file = fresh.files['secrets.json'];
  check('a new secret is saved with its username and password encrypted, never as typed', box.items.length === 1 && box.items[0].name === 'Uni login' && !file.includes('sam.lee') && !file.includes('m4ngo'), file.slice(0, 160));
  const panel = JSON.stringify(box.forPanel());
  check('the panel gets the name and the labels only', panel === JSON.stringify([{ id, name: 'Uni login', fields: [{ label: 'Username', hidden: true }, { label: 'Password', hidden: true }] }]), panel);
  check('shown: each field with its label', JSON.stringify(box.reveal(id)) === JSON.stringify([{ label: 'Username', hidden: true, value: 'sam.lee@uni.example' }, { label: 'Password', hidden: true, value: 'm4ngo!' }]));
  box.update(id, { name: 'Uni', fields: [{ label: 'Username', value: 'sam.lee@uni.example' }, { label: 'Password', value: 'new-pass' }] });
  check('changing it: new name, new password, still encrypted', box.items[0].name === 'Uni' && box.reveal(id)[1].value === 'new-pass' && !fresh.files['secrets.json'].includes('new-pass'));
  let threw = '';
  try { box.add({ name: 'Empty', fields: [{ label: 'Password', value: '   ' }] }); } catch (err) { threw = err.message; }
  check('a secret with nothing in it isn\'t saved', /Type a username or a password/.test(threw) && box.items.length === 1, threw);
  enc.available = false;
  threw = '';
  try { box.add({ name: 'Bank', fields: [{ label: 'Password', value: '1234' }] }); } catch (err) { threw = err.message; }
  check('if the computer can\'t encrypt, it isn\'t saved, and it says so', /can’t encrypt/.test(threw) && box.items.length === 1 && !fresh.files['secrets.json'].includes('1234'), threw);
  enc.available = true;
  check('deleting it', box.delete(id) && box.items.length === 0 && JSON.parse(fresh.files['secrets.json']).items.length === 0);

  // ---------- Damaged files ----------
  const bad = disk({ 'secrets.json': JSON.stringify({ items: [{ id: 'x', name: 'A', fields: [{ label: 'P', enc: 'not base64!' }] }, { name: 'B', fields: [{ label: 'P', enc: scrambled('ok') }] }, 'junk'] }) });
  const tidy = new Secrets({ read: bad.read.bind(bad), write: bad.write.bind(bad), safeStorage });
  tidy.load();
  check('anything that isn\'t a proper secret is ignored when loading', tidy.items.length === 1 && tidy.items[0].name === 'B' && typeof tidy.items[0].id === 'string');
} catch (err) {
  console.log(`TEST ${err.stack}`);
}
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
