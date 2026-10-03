// macOS App Nap opt-out for the double-tap watcher (v1.6.3).
// 1. Why: a napped app's timers stretch to ~1 s, and a double-tap sampled that rarely is missed.
// 2. The Objective-C calls TaskPop makes (checked against a fake koffi, since this isn't a Mac).
// 3. The watcher holds the opt-out exactly while it's watching, and lets go when it stops.
const P = require('../paths');
const SRC = process.env.TP_SRC || P.APP;
const dt = require(`${SRC}/doubletap.js`);
const { DoubleTapDetector, DoubleTapWatcher, createMacAppNapGuard, KEY_MASKS: K } = dt;

let pass = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total += 1;
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

// ---------- 1. Sampling rate vs a real double-tap ----------
function doubleTapAt(tickMs, phase) {
  let fired = 0;
  const det = new DoubleTapDetector('shift', () => { fired += 1; });
  // Shift down 1000-1080, up; down 1230-1310, up (80 ms taps, 150 ms apart)
  const held = (t) => (t >= 1000 && t < 1080) || (t >= 1230 && t < 1310);
  for (let t = 900 + phase; t < 2500; t += tickMs) det.sample(t, held(t) ? K.shift : 0, 7);
  return fired;
}
const rate = (tickMs) => {
  let hits = 0;
  for (let phase = 0; phase < tickMs; phase += 1) hits += doubleTapAt(tickMs, phase);
  return hits / tickMs;
};
const awake = rate(15);
const napped = rate(1000);
const napped250 = rate(250);
check('checked every 15 ms (TaskPop awake), a double-tap is always seen', awake === 1, `${Math.round(awake * 100)}%`);
check('checked every 250 ms (lightly napped), most double-taps are missed', napped250 < 0.5, `${Math.round(napped250 * 100)}% seen`);
check('checked every ~1 s (App Nap), double-taps are missed', napped === 0, `${Math.round(napped * 100)}% seen`);

// ---------- 2. The Objective-C calls ----------
function fakeKoffi() {
  const log = [];
  let next = 100n;
  const objects = new Map(); // pointer -> description
  const mk = (desc) => { next += 8n; objects.set(next, desc); return next; };
  const selectors = new Map();
  const koffi = {
    log,
    objects,
    load(path) {
      log.push(['load', path]);
      return {
        func(name, ret, args) {
          const sig = `${ret} ${name}(${args.join(', ')})`;
          log.push(['declare', sig]);
          if (name === 'objc_getClass') return (n) => { log.push(['class', n]); return mk(`class ${n}`); };
          if (name === 'sel_registerName') return (n) => { if (!selectors.has(n)) selectors.set(n, mk(`sel ${n}`)); return selectors.get(n); };
          if (name === 'objc_msgSend') {
            return (self, sel, ...rest) => {
              const s = objects.get(sel).slice(4);
              log.push(['send', objects.get(self), s, ...rest, sig]);
              if (s === 'processInfo') return mk('NSProcessInfo instance');
              if (s === 'stringWithUTF8String:') return mk(`NSString "${rest[0]}"`);
              if (s === 'beginActivityWithOptions:reason:') return mk('activity');
              if (s === 'retain') return self;
              return ret === 'void' ? undefined : null;
            };
          }
          throw new Error(`unexpected ${name}`);
        },
      };
    },
  };
  return koffi;
}

const k = fakeKoffi();
const begin = createMacAppNapGuard(k);
check('loads the Objective-C runtime from the system path', k.log[0][0] === 'load' && k.log[0][1] === '/usr/lib/libobjc.A.dylib');
const sigs = k.log.filter((e) => e[0] === 'declare').map((e) => e[1]);
check('declares objc_msgSend with exact (non-variadic) argument lists, as Apple silicon requires',
  sigs.includes('void * objc_msgSend(void *, void *, uint64_t, void *)') && sigs.includes('void objc_msgSend(void *, void *, void *)'), sigs.join(' | '));
k.log.length = 0;
const end = begin();
const sends = k.log.filter((e) => e[0] === 'send');
const beginCall = sends.find((e) => e[2] === 'beginActivityWithOptions:reason:');
check('asks [NSProcessInfo processInfo] for the process', sends[0] && sends[0][1] === 'class NSProcessInfo' && sends[0][2] === 'processInfo');
check('begins an activity on it with a readable reason', beginCall && beginCall[1] === 'NSProcessInfo instance' && k.objects.get(beginCall[4]) === 'NSString "Watching for the double-tap shortcut"');
check('options = NSActivityUserInitiatedAllowingIdleSystemSleep (0x00EFFFFF): no App Nap, Mac still sleeps',
  beginCall && beginCall[3] === 0x00efffff && (beginCall[3] & (1 << 20)) === 0, beginCall && `0x${beginCall[3].toString(16)}`);
check('keeps (retains) the activity token', sends.some((e) => e[2] === 'retain' && e[1] === 'activity'));
k.log.length = 0;
end();
end();
const after = k.log.filter((e) => e[0] === 'send');
check('stopping ends that activity and releases the token, once', after.length === 2
  && after[0][2] === 'endActivity:' && k.objects.get(after[0][3]) === 'activity' && after[1][2] === 'release', after.map((e) => e[2]).join(','));

// ---------- 3. The watcher holds it only while watching ----------
const counts = { begin: 0, end: 0 };
let fail = false;
const source = {
  flags: () => { if (fail) throw new Error('boom'); return 0; },
  activity: () => 0,
  hasAccess: () => true,
  requestAccess: () => true,
  keepAwake: () => { counts.begin += 1; return () => { counts.end += 1; }; },
};
const origError = console.error;
console.error = () => {};
const w = new DoubleTapWatcher(source, () => {}, 15);
w.setKey('shift');
check('turning double-tap on opts out of App Nap', counts.begin === 1 && counts.end === 0);
w.setKey('control');
check('changing the key keeps the same opt-out (no second one)', counts.begin === 1 && counts.end === 0);
w.setKey('off');
check('turning double-tap off ends it (normal App Nap again)', counts.end === 1);
w.setKey('shift');
w.stop();
check('stop() on sleep / lock ends it, start() on wake takes it again', counts.begin === 2 && counts.end === 2);
w.start();
fail = true;
setTimeout(() => {
  check('if reading keys fails, watching stops and the opt-out ends too', w.timer === null && counts.begin === 3 && counts.end === 3);
  const w2 = new DoubleTapWatcher({ ...source, flags: () => 0, keepAwake: () => { throw new Error('no objc'); } }, () => {}, 15);
  w2.setKey('shift');
  check('if macOS refuses, double-tap still runs', w2.timer !== null);
  w2.stop();
  const w3 = new DoubleTapWatcher({ flags: () => 0, activity: () => 0 }, () => {}, 25);
  w3.setKey('shift');
  check('Windows key source (no App Nap) works unchanged', w3.timer !== null && w3.endAwake === null);
  w3.stop();
  console.error = origError;
  console.log(`${pass}/${total} checks passed`);
  process.exit(pass === total ? 0 : 1);
}, 60);
