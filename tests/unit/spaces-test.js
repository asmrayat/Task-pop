// v1.8.1 (Mac): opening windows on the desktop (Space) you're on. app/spaces.js through the real
// koffi, against tests/stubs/fakeobjc.c standing in for the Objective-C runtime and macOS.
// Needs TP_FAKEOBJC: the path of the built stand-in (tests/run.sh builds it).
const path = require('path');

const APP = process.env.TP_SRC || path.resolve(__dirname, '../../app');
const koffi = require(`${APP}/node_modules/koffi`);
const sp = require(`${APP}/spaces.js`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

try {
  const JOIN = sp.CAN_JOIN_ALL_SPACES;
  const MOVE = sp.MOVE_TO_ACTIVE_SPACE;
  const STILL = sp.STATIONARY;
  const AUX = 1 << 8;
  check('while showing: "move to the active Space", never with "join all Spaces" (AppKit throws on both)',
    sp.movingBehavior(JOIN | AUX) === (MOVE | AUX) && sp.movingBehavior(JOIN | STILL | AUX) === (MOVE | AUX) && sp.movingBehavior(0) === MOVE);
  const realPlatform = process.platform;
  Object.defineProperty(process, 'platform', { value: 'win32' });
  check('on Windows there is nothing to do', sp.createSpaces() === null);
  Object.defineProperty(process, 'platform', { value: realPlatform });

  const lib = koffi.load(process.env.TP_FAKEOBJC);
  const f = {
    view: lib.func('void *fake_view(void)'),
    otherView: lib.func('void *fake_other_view(void)'),
    orderFront: lib.func('void fake_order_front(void)'),
    reset: lib.func('void fake_reset(int mode, int window_space, int active)'),
    switchTo: lib.func('void fake_switch_to(int space)'),
    space: lib.func('int fake_window_space(void)'),
    behavior: lib.func('uint64_t fake_behavior(void)'),
    atOrderFront: lib.func('uint64_t fake_behavior_at_order_front(void)'),
    violations: lib.func('int fake_violations(void)'),
    wrongSuper: lib.func('int fake_wrong_super(void)'),
    superCalls: lib.func('int fake_super_calls(void)'),
    orderFronts: lib.func('int fake_order_fronts(void)'),
  };
  const handle = (ptr) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(ptr)); return b; };
  const win = { getNativeWindowHandle: () => handle(f.view()) };

  const spaces = sp.createMacSpaces(koffi, process.env.TP_FAKEOBJC);
  check('the runtime calls and their types are accepted by koffi', typeof spaces.showHere === 'function');

  // As reported: the panel was shown on Desktop 1, you're on Desktop 2, "join all Spaces" doesn't bring it
  f.reset(0, 1, 2);
  check('before: the panel wouldn\'t open on the desktop you\'re on', spaces.onActiveSpace(win) === false);
  spaces.showHere(win, () => f.orderFront());
  check('showing it brings it to your desktop (2)', f.space() === 2 && spaces.onActiveSpace(win) === true, `on ${f.space()}`);
  check('…because while it was shown it was marked "move to the active Space", without "join all Spaces"', Number(f.atOrderFront()) === (MOVE | AUX), `0x${Number(f.atOrderFront()).toString(16)}`);
  check('…and afterwards it\'s marked as before (join all Spaces, over full-screen apps too)', Number(f.behavior()) === (JOIN | AUX), `0x${Number(f.behavior()).toString(16)}`);
  check('the marking goes to NSWindow itself (past Electron\'s panel class), and never both at once', f.superCalls() === 2 && f.wrongSuper() === 0 && f.violations() === 0, `${f.superCalls()} calls, ${f.wrongSuper()} wrong, ${f.violations()} both`);
  f.switchTo(3);
  check('on another desktop again, it can tell the panel isn\'t there', spaces.onActiveSpace(win) === false);
  spaces.showHere(win, () => f.orderFront());
  check('…and the next opening brings it there (3)', f.space() === 3 && f.violations() === 0);

  // Full-screen apps (like VLC) are a desktop of their own
  f.reset(0, 1, 7);
  spaces.showHere(win, () => f.orderFront());
  check('over a full-screen app\'s own desktop too, it keeps "full-screen auxiliary"', f.space() === 7 && (Number(f.atOrderFront()) & AUX) !== 0);

  // On a Mac where "join all Spaces" works, nothing changes for the worse
  f.reset(1, 1, 4);
  spaces.showHere(win, () => f.orderFront());
  check('where "join all Spaces" works, the panel still opens where you are', spaces.onActiveSpace(win) === true && Number(f.behavior()) === (JOIN | AUX));

  // Stuck: it can tell (the app then makes a new panel window)
  f.reset(2, 1, 2);
  spaces.showHere(win, () => f.orderFront());
  check('if macOS keeps it on the other desktop even so, onActiveSpace says so', spaces.onActiveSpace(win) === false && Number(f.behavior()) === (JOIN | AUX));

  // Errors never stop the window from showing
  f.reset(0, 1, 2);
  let threw = null;
  try {
    spaces.showHere(win, () => { f.orderFront(); throw new Error('show failed'); });
  } catch (err) {
    threw = err.message;
  }
  check('if showing throws, the marking is still put back (and the error comes through)', threw === 'show failed' && Number(f.behavior()) === (JOIN | AUX));
  f.reset(0, 1, 2);
  let shown = 0;
  spaces.showHere({ getNativeWindowHandle: () => handle(f.otherView()) }, () => { shown += 1; });
  check('a view that isn\'t in an NSWindow: shown as usual, nothing touched', shown === 1 && f.superCalls() === 0);
  spaces.showHere({ getNativeWindowHandle: () => { throw new Error('gone'); } }, () => { shown += 1; });
  spaces.showHere({ getNativeWindowHandle: () => Buffer.alloc(8) }, () => { shown += 1; });
  check('a window that\'s gone, or has no handle: still shown, nothing touched', shown === 3 && f.superCalls() === 0 && spaces.onActiveSpace({ getNativeWindowHandle: () => Buffer.alloc(8) }) === null);
  check('its marking can be read for the double-tap report', spaces.behavior(win) === (JOIN | AUX));
  check('a second copy (the struct type is made once per process)', typeof sp.createMacSpaces(koffi, process.env.TP_FAKEOBJC).showHere === 'function');
} catch (err) {
  console.log(`TEST ${err.stack}`);
}
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
