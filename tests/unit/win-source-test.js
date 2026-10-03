// Drives the Windows key-state reader with a simulated keyboard and checks the detector on top of it.
const P = require('../paths');
const { createWinKeySource, DoubleTapDetector, KEY_MASKS } = require(P.APP + '/doubletap.js');
const held = new Set();
const fakeUser32 = (vk) => (held.has(vk) ? -32768 : 0); // int16 with the high bit set = key down
const src = createWinKeySource(fakeUser32);
let fired = 0;
const det = new DoubleTapDetector('control', () => { fired += 1; });
let t = 0;
const step = (ms) => { for (let i = 0; i < ms; i += 25) { t += 25; det.sample(t, src.flags(), src.activity()); } };
const tap = (vk) => { held.add(vk); step(75); held.delete(vk); };
const results = [];
const check = (name, ok) => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); };

step(200); tap(0x11); step(150); tap(0x11); step(300);
check('double-tap Ctrl fires', fired === 1);
fired = 0; held.add(0x11); step(50); held.add(0x43); step(50); held.delete(0x43); held.delete(0x11); step(100);
held.add(0x11); step(50); held.add(0x56); step(50); held.delete(0x56); held.delete(0x11); step(400);
check('Ctrl+C then Ctrl+V does not fire', fired === 0);
fired = 0; held.add(0x11); step(50); held.add(0x01); step(50); held.delete(0x01); held.delete(0x11); step(100);
held.add(0x11); step(50); held.add(0x01); step(50); held.delete(0x01); held.delete(0x11); step(400);
check('Ctrl+click twice does not fire', fired === 0);
fired = 0; tap(0x11); step(100); held.add(0x5b); step(75); held.delete(0x5b); step(100); tap(0x11); step(300);
check('Windows key between taps cancels it', fired === 0);
const a0 = src.activity(); held.add(0x41); src.activity(); held.delete(0x41); src.activity(); held.add(0x41); src.activity();
check('activity counts each key press once', src.activity() === a0 + 2);
check('Alt maps to the Option bit, Shift to Shift', (() => { held.clear(); held.add(0x12); const a = src.flags() === KEY_MASKS.option; held.clear(); held.add(0x10); const b = src.flags() === KEY_MASKS.shift; held.clear(); return a && b; })());
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
