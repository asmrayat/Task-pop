// v1.6.8 (Mac): the double-tap hears the modifier keys as events (a listen-only event tap)
// instead of only checking them every few milliseconds. With a video player like VLC open,
// TaskPop's checks in the background could come too late to see a quick double-tap.
// 1. The macOS calls TaskPop makes for the tap (against a fake koffi, since this isn't a Mac).
// 2. The watcher detects from events alone, however rarely its own checks run.
// 3. If the events stop coming, it goes back to checking the keys by itself.
const P = require('../paths');
const SRC = process.env.TP_SRC || P.APP;
const dt = require(`${SRC}/doubletap.js`);
const { DoubleTapWatcher, createMacEventTap, KEY_MASKS: K, MAC_EVENT, MAC_TAP_MASK } = dt;

let pass = 0;
let total = 0;
const check = (name, ok, detail = '') => {
  total += 1;
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 1. The macOS calls ----------
function fakeMac({ refuse = false } = {}) {
  const calls = [];
  const callbacks = new Map();
  let next = 1;
  const koffi = {
    proto: (def) => ({ proto: def }),
    pointer: (t) => ({ pointer: t }),
    register: (fn, type) => { const id = `callback${next++}`; callbacks.set(id, { fn, type }); return id; },
    unregister: (id) => { calls.push(['unregister', id]); callbacks.delete(id); },
  };
  const lib = (libName) => ({
    func: (def) => {
      const name = def.match(/(\w+)\s*\(/)[1];
      return (...args) => {
        calls.push([name, ...args]);
        switch (name) {
          case 'CGEventTapCreate': return refuse ? null : 'port';
          case 'CGEventGetFlags': return BigInt(args[0].flags);
          case 'CFMachPortCreateRunLoopSource': return 'source';
          case 'CFRunLoopGetMain': return 'mainloop';
          case 'CFStringCreateWithCString': return { cfstring: args[1] };
          default: return undefined;
        }
      };
    },
    libName,
  });
  return { koffi, cg: lib('CoreGraphics'), cf: lib('CoreFoundation'), calls, callbacks };
}

{
  const m = fakeMac();
  const listen = createMacEventTap(m.koffi, m.cg, m.cf);
  const got = [];
  const stop = listen((kind, flags) => got.push([kind, flags]));
  const create = m.calls.find((c) => c[0] === 'CGEventTapCreate');
  check('a tap at the session level, at the head, listen-only', create && create[1] === 1 && create[2] === 0 && create[3] === 1, create && create.slice(1, 4).join(','));
  const types = Object.values(MAC_EVENT);
  const maskTypes = [];
  for (let t = 0; t < 32; t += 1) if (Math.floor(MAC_TAP_MASK / 2 ** t) % 2 === 1) maskTypes.push(t);
  check('it asks only for modifier changes, key presses and clicks', create && create[4] === MAC_TAP_MASK
    && maskTypes.join() === [1, 3, 10, 12, 25].join() && types.length === 5, maskTypes.join());
  const add = m.calls.find((c) => c[0] === 'CFRunLoopAddSource');
  check('its events come in on the main run loop, in the default mode', add && add[1] === 'mainloop' && add[2] === 'source' && add[3].cfstring === 'kCFRunLoopDefaultMode');
  const enableAt = m.calls.findIndex((c) => c[0] === 'CGEventTapEnable');
  check('…and it is switched on after that', enableAt > m.calls.indexOf(add) && m.calls[enableAt][2] === true);
  const declared = m.calls.map((c) => c[0]);
  check('it never reads which key was pressed (no key-code calls)', !declared.some((n) => /IntegerValueField|Keycode|UnicodeString/i.test(n)));

  const cb = [...m.callbacks.values()][0].fn;
  const r1 = cb('proxy', 12, { flags: K.shift | 0x102 }, null); // Shift, plus device bits
  const r2 = cb('proxy', 10, { flags: K.shift }, null); // a key typed with Shift
  const r3 = cb('proxy', 1, { flags: 0 }, null); // a click
  check('a modifier change is passed on with just the modifier flags', got[0] && got[0][0] === 'modifiers' && got[0][1] === K.shift, JSON.stringify(got[0]));
  check('a key press or a click is passed on as a "press"', got[1][0] === 'press' && got[1][1] === K.shift && got[2][0] === 'press');
  check('the tap never changes events (it returns nothing)', r1 === null && r2 === null && r3 === null);
  const before = m.calls.filter((c) => c[0] === 'CGEventTapEnable').length;
  cb('proxy', 0xfffffffe, null, null);
  const after = m.calls.filter((c) => c[0] === 'CGEventTapEnable');
  check('if macOS pauses the tap, it is switched straight back on', after.length === before + 1 && after[after.length - 1][1] === 'port' && after[after.length - 1][2] === true && got[3][0] === 'disabled');
  const noisy = listen(() => { throw new Error('boom'); });
  const origError = console.error;
  console.error = () => {};
  const cb2 = [...m.callbacks.values()][1].fn;
  check('a failure while handling an event doesn\'t reach macOS', cb2('proxy', 12, { flags: 0 }, null) === null);
  console.error = origError;
  noisy();
  m.calls.length = 0;
  stop();
  const names = m.calls.map((c) => c[0]);
  check('stopping switches the tap off, removes it and frees everything', names.join(',') === 'CGEventTapEnable,CFRunLoopRemoveSource,CFMachPortInvalidate,CFRelease,CFRelease,CFRelease,unregister'
    && m.calls[0][2] === false, names.join(','));
  m.calls.length = 0;
  stop();
  check('stopping twice does nothing the second time', m.calls.length === 0);

  const refused = fakeMac({ refuse: true });
  const listen2 = createMacEventTap(refused.koffi, refused.cg, refused.cf);
  check('if macOS refuses the tap (no permission), it says so and frees the callback', listen2(() => {}) === null
    && refused.calls.some((c) => c[0] === 'unregister') && !refused.calls.some((c) => c[0] === 'CFRunLoopAddSource'));
}

// ---------- 2 and 3. The watcher ----------
function eventSource({ refuse = false } = {}) {
  const s = {
    held: 0,
    listener: null,
    ended: 0,
    flags: () => s.held,
    activity: () => 0,
    hasAccess: () => true,
    requestAccess: () => true,
    listen: (fn) => {
      if (refuse) return null;
      s.listener = fn;
      return () => { s.ended += 1; s.listener = null; };
    },
    // the user presses (down) or releases a modifier: macOS sends an event, the key state changes
    key: (mask, down, { event = true } = {}) => {
      s.held = down ? s.held | mask : s.held & ~mask;
      if (event && s.listener) s.listener('modifiers', s.held);
    },
    press: () => { if (s.listener) s.listener('press', s.held); },
  };
  return s;
}
async function tapTwice(src, key, { between } = {}) {
  await wait(500); // well apart from whatever came before
  src.key(key, true); await wait(70); src.key(key, false);
  await wait(110);
  if (between) await between();
  src.key(key, true); await wait(70); src.key(key, false);
  await wait(60);
}

(async () => {
  const origError = console.error;
  console.error = () => {};

  // Checks that hardly ever run (TaskPop held back in the background): every 5 s
  let fired = 0;
  let src = eventSource();
  let w = new DoubleTapWatcher(src, () => { fired += 1; }, 5000);
  w.setKey('shift');
  check('with key events available, the watcher uses them', w.mode === 'events');
  await tapTwice(src, K.shift);
  check('a double-tap is seen from the events alone, even when the checks hardly run', fired === 1, `${fired} fired`);
  fired = 0;
  await tapTwice(src, K.shift, { between: async () => src.press() });
  check('typing between the two taps still cancels it', fired === 0);
  await tapTwice(src, K.shift, { between: async () => { src.key(K.command, true); await wait(30); src.key(K.command, false); } });
  check('another modifier between the taps cancels it', fired === 0);
  await wait(500);
  src.key(K.shift, true); src.press(); src.key(K.shift, false); await wait(100);
  src.key(K.shift, true); src.press(); src.key(K.shift, false); await wait(60);
  check('typing two capital letters isn\'t a double-tap', fired === 0);
  await wait(500);
  src.key(K.shift, true); await wait(70); src.key(K.shift, false); await wait(600);
  src.key(K.shift, true); await wait(70); src.key(K.shift, false); await wait(60);
  check('two taps too far apart aren\'t a double-tap', fired === 0);
  check('the report counts what happened (counts only)', w.detector.stats.doubleTaps === 1 && w.detector.stats.withOtherKeys >= 2, JSON.stringify(w.detector.stats));
  w.stop();
  check('stopping (sleep, lock, turning it off) ends the key events', src.ended === 1 && w.mode === 'off');

  // Checks running normally alongside the events: no double counting
  fired = 0;
  src = eventSource();
  w = new DoubleTapWatcher(src, () => { fired += 1; }, 15);
  w.setKey('shift');
  await tapTwice(src, K.shift);
  await wait(300);
  check('with both running, one double-tap opens TaskPop once', fired === 1 && w.mode === 'events', `${fired} fired, ${w.mode}`);
  await wait(1200);
  check('while the events keep coming, it stays on events', w.mode === 'events' && w.events.fallbacks === 0);

  // The events stop arriving (macOS paused or dropped the tap): back to checking by itself
  fired = 0;
  src.key(K.control, true, { event: false });
  await wait(1300);
  check('when a key changes and no event shows it, it goes back to checking the keys', w.mode === 'checks' && w.events.fallbacks === 1, w.mode);
  src.key(K.control, false, { event: false });
  await wait(50);
  await tapTwice(src, K.shift); // the listener is gone: only the checks can see this
  await wait(100);
  check('…and the double-tap works again that way', fired === 1, `${fired} fired`);
  w.stop();
  w.start();
  check('starting again (after waking, for example) tries the events again', w.mode === 'events');
  w.stop();

  // Slow checks must not be mistaken for missing events
  src = eventSource();
  w = new DoubleTapWatcher(src, () => {}, 400);
  w.setKey('shift');
  await wait(450);
  src.key(K.shift, true); // event now; the next check (a while later) sees Shift held
  await wait(1700);
  src.key(K.shift, false);
  check('slow checks don\'t switch the events off by mistake', w.mode === 'events' && w.events.fallbacks === 0, w.mode);
  w.stop();

  // No permission yet: checks, as before
  src = eventSource({ refuse: true });
  w = new DoubleTapWatcher(src, () => {}, 15);
  w.setKey('shift');
  check('without key events (no permission yet, or Windows), it checks the keys as before', w.mode === 'checks');
  w.stop();
  const plain = new DoubleTapWatcher({ flags: () => 0, activity: () => 0 }, () => {}, 25);
  plain.setKey('shift');
  check('a key source without events (Windows) works unchanged', plain.mode === 'checks' && plain.endEvents === null);
  plain.stop();

  console.error = origError;
  console.log(`${pass}/${total} checks passed`);
  process.exit(pass === total ? 0 : 1);
})();
