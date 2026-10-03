// v1.6.8 (Mac): the double-tap's key-event tap, end to end through the real koffi inside Electron.
// tests/stubs/fakemac.c stands in for macOS: CGEventTapCreate keeps the callback, and adding the
// tap to the run loop makes Electron's own main loop deliver a script of events to it: a Shift
// double-tap, a capital letter typed with Shift, and macOS pausing the tap.
// Needs TP_FAKEMAC: the path of the built stand-in (tests/run.sh builds it).
const P = require('../paths');
const { app } = require('electron');

const SRC = process.env.TP_SRC || P.APP;
const koffi = require(`${SRC}/node_modules/koffi`);
const dt = require(`${SRC}/doubletap.js`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[e] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  try {
    const lib = koffi.load(process.env.TP_FAKEMAC);
    const report = lib.func('const char *fake_report(void)');
    const listen = dt.createMacEventTap(koffi, lib, lib);
    check('the tap\'s macOS functions and callback type are accepted by koffi', typeof listen === 'function');
    let fired = 0;
    const kinds = [];
    const source = {
      flags: () => 0,
      activity: () => 0,
      listen: (fn) => listen((kind, flags) => { kinds.push(`${kind}:${flags}`); fn(kind, flags); }),
    };
    const w = new dt.DoubleTapWatcher(source, () => { fired += 1; }, 5000); // its own checks hardly ever run
    w.setKey('shift');
    check('with the tap in place, the watcher listens to key events', w.mode === 'events', w.mode);
    await wait(2300);
    const during = report();
    check('the main loop delivered every event to TaskPop\'s callback', /delivered=8/.test(during) && kinds.length === 8, `${kinds.length} events`);
    check('…in the default run loop mode', /mode=kCFRunLoopDefaultMode/.test(during), during);
    check('each event carries only the modifier flags (device bits dropped)', kinds[0] === `modifiers:${dt.KEY_MASKS.shift}` && kinds[5] === `press:${dt.KEY_MASKS.shift}`, kinds.slice(0, 6).join(' '));
    check('the Shift double-tap opened TaskPop, once; the capital letter didn\'t', fired === 1, `${fired} fired`);
    check('when macOS paused the tap, TaskPop switched it back on', w.events.pauses === 1 && /enableCalls=2/.test(during), during);
    w.stop();
    const after = report();
    check('stopping switches the tap off and frees it (source, port, mode string)', /enabled=0/.test(after) && /removed=1/.test(after) && /invalidated=1/.test(after) && /released=3/.test(after), after);
    check('stopping leaves the watcher off', w.mode === 'off');
  } catch (err) {
    console.log(`TEST ${err.stack}`);
  }
  console.log(`[e] ${results.filter(Boolean).length}/${results.length} checks passed`);
  app.exit(0);
});
