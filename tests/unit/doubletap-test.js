// Tests the double-tap detector against simulated keyboards, sampled every 15 ms like the app.
const P = require('../paths');
const { DoubleTapDetector, KEY_MASKS } = require(P.APP + '/doubletap.js');

const TICK = 15;
const K = KEY_MASKS;

/**
 * A scripted keyboard. Steps: ['down', mask] / ['up', mask] / ['key'] (a normal key press)
 * / ['click'] / ['wait', ms]. Returns the number of times the detector fired.
 */
function run(key, steps, jitter = 0) {
  let fired = 0;
  const det = new DoubleTapDetector(key, () => { fired += 1; });
  let t = 1000;
  let flags = 0;
  let activity = 500;
  // Events at exact times, then sample on a 15 ms grid (with optional random phase).
  const events = [];
  for (const [kind, arg] of steps) {
    if (kind === 'wait') t += arg + (jitter ? Math.round((Math.random() - 0.5) * jitter) : 0);
    else events.push([t, kind, arg]);
  }
  const end = t + 800;
  let e = 0;
  for (let now = 1000 + Math.floor(Math.random() * TICK); now <= end; now += TICK) {
    while (e < events.length && events[e][0] <= now) {
      const [, kind, arg] = events[e];
      if (kind === 'down') flags |= arg;
      else if (kind === 'up') flags &= ~arg;
      else activity += 1; // key or click
      e += 1;
    }
    det.sample(now, flags, activity);
  }
  return fired;
}

const tap = (mask, hold = 80) => [['down', mask], ['wait', hold], ['up', mask]];
const combo = (mask, hold = 180) => [['down', mask], ['wait', 60], ['key'], ['wait', hold - 60], ['up', mask]];

const cases = [
  // [name, key, steps, expected fires]
  ['double-tap Control', 'control', [...tap(K.control), ['wait', 150], ...tap(K.control)], 1],
  ['double-tap Option', 'option', [...tap(K.option), ['wait', 150], ...tap(K.option)], 1],
  ['double-tap Command', 'command', [...tap(K.command), ['wait', 150], ...tap(K.command)], 1],
  ['double-tap Shift', 'shift', [...tap(K.shift), ['wait', 150], ...tap(K.shift)], 1],
  ['fast taps (35 ms presses, 60 ms apart)', 'control', [...tap(K.control, 35), ['wait', 60], ...tap(K.control, 35)], 1],
  ['relaxed taps (150 ms presses, 330 ms apart)', 'control', [...tap(K.control, 150), ['wait', 330], ...tap(K.control, 150)], 1],
  ['too slow: 650 ms between taps', 'control', [...tap(K.control), ['wait', 650], ...tap(K.control)], 0],
  ['held too long (500 ms each)', 'control', [...tap(K.control, 500), ['wait', 150], ...tap(K.control, 500)], 0],
  ['single tap', 'control', [...tap(K.control)], 0],
  ['wrong key: Option tapped, Control chosen', 'control', [...tap(K.option), ['wait', 150], ...tap(K.option)], 0],
  ['Off: nothing ever fires', 'off', [...tap(K.control), ['wait', 150], ...tap(K.control)], 0],
  ['⌘C then ⌘V quickly', 'command', [...combo(K.command), ['wait', 120], ...combo(K.command)], 0],
  ['⌘Z ⌘Z (undo twice)', 'command', [...combo(K.command, 120), ['wait', 100], ...combo(K.command, 120)], 0],
  ['⌃-click twice', 'control', [['down', K.control], ['wait', 40], ['click'], ['wait', 60], ['up', K.control], ['wait', 120], ['down', K.control], ['wait', 40], ['click'], ['wait', 60], ['up', K.control]], 0],
  ['tap, type a letter, tap', 'control', [...tap(K.control), ['wait', 80], ['key'], ['wait', 80], ...tap(K.control)], 0],
  ['tap ⌃, then tap ⌘', 'control', [...tap(K.control), ['wait', 150], ...tap(K.command)], 0],
  ['⌃⇧ pressed together, twice', 'control', [['down', K.control | K.shift], ['wait', 80], ['up', K.control | K.shift], ['wait', 150], ['down', K.control | K.shift], ['wait', 80], ['up', K.control | K.shift]], 0],
  ['Shift held while ⌃ double-tapped', 'control', [['down', K.shift], ['wait', 50], ...tap(K.control), ['wait', 150], ...tap(K.control), ['wait', 50], ['up', K.shift]], 0],
  ['typing capitals: "I Am" (Shift+I, Shift+A)', 'shift', [...combo(K.shift, 110), ['wait', 90], ['key'], ['wait', 90], ...combo(K.shift, 110)], 0],
  ['key pressed at the same instant as the second tap', 'command', [...tap(K.command), ['wait', 150], ['down', K.command], ['key'], ['wait', 80], ['up', K.command]], 0],
  ['triple tap fires once', 'control', [...tap(K.control), ['wait', 150], ...tap(K.control), ['wait', 150], ...tap(K.control)], 1],
  ['two double-taps a second apart fire twice', 'control', [...tap(K.control), ['wait', 150], ...tap(K.control), ['wait', 1000], ...tap(K.control), ['wait', 150], ...tap(K.control)], 2],
];

let pass = 0;
for (const [name, key, steps, expected] of cases) {
  // Each case runs 200 times with random sampling phase and ±40 ms timing jitter.
  const results = new Set();
  for (let i = 0; i < 200; i += 1) results.add(run(key, steps, 40));
  const ok = results.size === 1 && results.has(expected);
  if (ok) pass += 1;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  (expected ${expected}, got ${[...results].join('/')})`);
}
console.log(`${pass}/${cases.length} scenarios passed (each run 200 times with random timing)`);

// Fuzz: long random sessions of typing and shortcuts, with no deliberate double-taps.
function fuzz(key, minutes) {
  const masks = Object.values(K);
  const steps = [];
  let total = 0;
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  while (total < minutes * 60000) {
    const r = Math.random();
    let s;
    if (r < 0.55) s = [['key'], ['wait', 60 + Math.random() * 200]]; // typing
    else if (r < 0.8) s = [...combo(pick(masks), 90 + Math.random() * 200), ['wait', 50 + Math.random() * 300]]; // shortcut
    else if (r < 0.9) s = [['down', pick(masks)], ['wait', 20], ['key'], ['wait', 60], ['key'], ['wait', 60], ['up', K.shift | K.control | K.option | K.command], ['wait', 100]]; // held while typing
    else if (r < 0.97) s = [['click'], ['wait', 100 + Math.random() * 400]];
    else s = [...tap(pick(masks), 40 + Math.random() * 120), ['wait', 500 + Math.random() * 800]]; // stray single tap
    for (const st of s) { steps.push(st); if (st[0] === 'wait') total += st[1]; }
  }
  return run(key, steps, 30);
}
let falses = 0;
for (const key of ['control', 'option', 'command', 'shift']) {
  const f = fuzz(key, 30);
  falses += f;
  console.log(`fuzz: 30 simulated minutes of typing + shortcuts, key=${key}: ${f} false triggers`);
}
process.exit(pass === cases.length && falses === 0 ? 0 : 1);
