// First-run tour: welcome → how to open TaskPop (with a live try-it) → opening by itself →
// using the list → done. Settings chosen here are saved straight away.
const api = window.taskpopTour;
const $ = (id) => document.getElementById(id);

const STEPS = ['step-welcome', 'step-open', 'step-auto', 'step-use', 'step-done'];
const MAC_KEYS = {
  control: { symbol: '⌃', name: 'Control', word: 'control' },
  option: { symbol: '⌥', name: 'Option', word: 'option' },
  command: { symbol: '⌘', name: 'Command', word: 'command' },
  shift: { symbol: '⇧', name: 'Shift', word: 'shift' },
};
const WIN_KEYS = {
  control: { symbol: 'Ctrl', name: 'Ctrl', word: 'ctrl' },
  option: { symbol: 'Alt', name: 'Alt', word: 'alt' },
  shift: { symbol: 'Shift', name: 'Shift', word: 'shift' },
};
// Which modifier a key event is (the same names TaskPop uses for the double-tap key)
const MODIFIER_KINDS = { Control: 'control', Alt: 'option', Meta: 'command', Shift: 'shift' };

let info = null;
let step = 0;
let worked = false;
let keyDown = false;
let taps = [];
let tapTimer = null;
let pollTimer = null;
let domTaps = 0; // taps this window saw itself (to notice when the system hides them from TaskPop)

const mac = () => !info || info.platform !== 'win32';
const keyInfo = (k) => (mac() ? MAC_KEYS : WIN_KEYS)[k] || (mac() ? MAC_KEYS.control : WIN_KEYS.control);
const currentKey = () => (info && info.settings.doubleTapKey !== 'off' ? info.settings.doubleTapKey : 'control');

// ---------- Shortcut text (same as Settings) ----------
const MOD_SYMBOLS = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' };
const KEY_SYMBOLS = { Up: '↑', Down: '↓', Left: '←', Right: '→', Return: '↩', Tab: '⇥', Space: 'Space' };
const WIN_NAMES = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win', Command: 'Win' };
function shortcutParts(accelerator) {
  if (!accelerator) return [];
  const parts = accelerator.split('+');
  const key = parts.pop();
  if (!mac()) {
    const order = ['Control', 'Alt', 'Shift', 'Super', 'Command'];
    return [...order.filter((m) => parts.includes(m)).map((m) => WIN_NAMES[m]), key === 'Return' ? 'Enter' : key];
  }
  const order = ['Control', 'Alt', 'Shift', 'Command'];
  return [...order.filter((m) => parts.includes(m)).map((m) => MOD_SYMBOLS[m]), KEY_SYMBOLS[key] || key];
}
const kbd = (text) => Object.assign(document.createElement('kbd'), { textContent: text });

// ---------- Rendering ----------

function renderStatic() {
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  document.querySelectorAll('[data-today]').forEach((el) => { el.textContent = today; });
  const computer = mac() ? 'Mac' : 'PC';
  $('autoLead').textContent = `TaskPop can show your list when you come back to your ${computer}, so you see what’s left before you start.`;
  $('wakeLabel').textContent = mac() ? 'When I open the lid' : 'When my PC wakes up';
  $('wakeSmall').textContent = mac() ? 'Waking your Mac from sleep' : 'Coming back from sleep';
  $('loginLabel').textContent = mac() ? 'Open TaskPop when I log in' : 'Start TaskPop with Windows';
  $('loginToggle').hidden = !!info.store;
  $('storeLogin').hidden = !info.store;
  $('storeLogin').textContent = 'TaskPop starts with Windows. You can change that in Windows Settings → Apps → Startup.';
  $('returnKey').textContent = mac() ? 'Return' : 'Enter';
  document.querySelector('#returnKey + span').textContent = `Type a task and press ${mac() ? 'Return' : 'Enter'} to add it`;
  $('trayHint').textContent = mac()
    ? 'Or click the TaskPop icon in the menu bar'
    : 'Or click the TaskPop icon next to the clock (if it isn’t there, click ^ to find it)';
  $('shortcutKeys').replaceChildren(...shortcutParts(info.settings.shortcut).map(kbd));
  if (!info.settings.shortcut) $('shortcutKeys').closest('li').hidden = true;
}

function renderPicker() {
  const picker = $('keyPicker');
  const chosen = currentKey();
  picker.style.setProperty('--cols', info.keys.length === 4 ? 2 : info.keys.length);
  picker.replaceChildren(...info.keys.map((k) => {
    const ki = keyInfo(k);
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'key-option';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(k === chosen));
    b.tabIndex = k === chosen ? 0 : -1;
    b.dataset.key = k;
    if (mac()) b.append(Object.assign(document.createElement('b'), { textContent: ki.symbol }), document.createTextNode(ki.name));
    else b.textContent = ki.name;
    b.addEventListener('click', () => chooseKey(k));
    return b;
  }));
}

function renderKeycap() {
  const ki = keyInfo(currentKey());
  for (const [s, n] of [['keycapSymbol', 'keycapName'], ['doneSymbol', 'doneName']]) {
    $(s).textContent = ki.symbol;
    $(n).textContent = mac() ? ki.word : '';
  }
  $('keycap').classList.toggle('worked', worked);
  $('keycap').classList.toggle('down', keyDown);
  const on = worked ? 2 : Math.min(2, taps.length);
  $('taps').querySelectorAll('i').forEach((dot, i) => dot.classList.toggle('on', i < on));
  $('doneLead').replaceChildren(document.createTextNode('Double-tap '), kbd(mac() ? `${ki.symbol} ${ki.name}` : ki.name), document.createTextNode(' any time to open TaskPop. Your tasks stay on this ' + (mac() ? 'Mac.' : 'PC.')));
  renderTryText();
}

function renderTryText() {
  const ki = keyInfo(currentKey());
  const d = info.doubleTap || {};
  const text = $('tryText');
  const blocked = d.status === 'blocked';
  $('permission').hidden = !(blocked && mac());
  $('keycap').closest('.stage').classList.toggle('asking', blocked && mac());
  $('restartBtn').hidden = !(blocked && d.allowed);
  $('allowBtn').hidden = !!(blocked && d.allowed);
  if (d.status === 'unavailable') {
    text.textContent = 'Double-tap isn’t available on this computer. Use the shortcut instead.';
  } else if (blocked) {
    text.textContent = d.allowed ? 'Allowed. Restart TaskPop to finish.' : 'TaskPop can’t see the key yet.';
  } else if (worked) {
    text.replaceChildren(Object.assign(document.createElement('b'), { textContent: 'That’s it. ' }),
      document.createTextNode(`TaskPop opened in the corner. Double-tap ${ki.name} again to put it away.`));
  } else if (taps.length === 1) {
    text.textContent = 'Once more, quickly.';
  } else {
    text.textContent = `Try it now: tap ${ki.name} twice.`;
  }
}

function renderToggles() {
  document.querySelectorAll('.toggle input[data-setting]').forEach((input) => {
    const key = input.dataset.setting;
    input.checked = key === 'openAtLogin' ? !!info.openAtLogin : !!info.settings[key];
  });
}

function renderNav() {
  $('dots').replaceChildren(...STEPS.map((_, i) => {
    const li = document.createElement('li');
    if (i === step) {
      li.className = 'on';
      li.setAttribute('aria-current', 'step');
    }
    li.setAttribute('aria-label', `Step ${i + 1} of ${STEPS.length}`);
    return li;
  }));
  const last = step === STEPS.length - 1;
  $('skipBtn').hidden = step !== 0;
  $('backBtn').hidden = step === 0;
  $('settingsBtn').hidden = !last;
  $('nextBtn').textContent = step === 0 ? 'Get started' : last ? 'Open TaskPop' : 'Continue';
}

function go(n) {
  step = Math.max(0, Math.min(STEPS.length - 1, n));
  STEPS.forEach((id, i) => $(id).classList.toggle('active', i === step));
  renderNav();
  api.watchKeys(step === 1);
  clearInterval(pollTimer);
  if (step === 1) pollTimer = setInterval(refresh, 1000); // to notice the macOS permission changing
  renderKeycap();
  $('nextBtn').focus({ preventScroll: true });
}

async function refresh() {
  const next = await api.get();
  if (!next) return;
  info = next;
  renderTryText();
}

// ---------- Trying the double-tap ----------

async function chooseKey(k) {
  if (k === currentKey()) return;
  await api.updateSetting('doubleTapKey', k);
  info = await api.get();
  worked = false;
  taps = [];
  domTaps = 0;
  keyDown = false;
  renderPicker();
  renderKeycap();
  const btn = $('keyPicker').querySelector(`[data-key="${k}"]`);
  if (btn) btn.focus();
}

$('keyPicker').addEventListener('keydown', (e) => {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  const keys = info.keys;
  const i = keys.indexOf(currentKey());
  const next = keys[(i + (e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? keys.length - 1 : 1)) % keys.length];
  chooseKey(next);
});

api.onKey(({ down }) => {
  if (step !== 1) return;
  if (keyDown && !down) {
    // a release: count it as a tap (two within a moment light both dots)
    taps = taps.filter((t) => Date.now() - t < 700);
    taps.push(Date.now());
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => { taps = []; renderKeycap(); }, 750);
  }
  keyDown = down;
  renderKeycap();
});

api.onDoubleTap(() => {
  if (step !== 1) return;
  worked = true;
  taps = [];
  renderKeycap();
});

// Keys pressed while this window is in front: tell the app, so it can check that macOS
// really lets it see them (the same check Settings does).
document.addEventListener('keydown', (e) => {
  if (step !== 1 || e.repeat) return;
  const kind = MODIFIER_KINDS[e.key];
  if (kind) {
    api.probeKeys(kind);
    if (kind === currentKey()) domTaps += 1;
  } else {
    api.probeKeys('key');
  }
});
document.addEventListener('keyup', (e) => {
  if (step !== 1) return;
  if (MODIFIER_KINDS[e.key] === currentKey() && domTaps >= 2 && !worked) setTimeout(refresh, 150);
});

$('allowBtn').addEventListener('click', async () => {
  await api.allowKeys();
  refresh();
});
$('restartBtn').addEventListener('click', () => api.restart());

// ---------- Toggles ----------

document.querySelectorAll('.toggle input[data-setting]').forEach((input) => {
  input.addEventListener('change', async () => {
    await api.updateSetting(input.dataset.setting, input.checked);
    info = await api.get();
    renderToggles();
  });
});

// ---------- Navigation ----------

$('nextBtn').addEventListener('click', () => {
  if (step === STEPS.length - 1) api.finish('open');
  else go(step + 1);
});
$('backBtn').addEventListener('click', () => go(step - 1));
$('skipBtn').addEventListener('click', () => api.finish('skip'));
$('settingsBtn').addEventListener('click', () => api.finish('settings'));
api.onGo((n) => go(Number(n) || 0));

api.get().then((data) => {
  info = data;
  document.documentElement.classList.add(`platform-${info.platform}`);
  if (info.accent) document.documentElement.style.setProperty('--accent', info.accent);
  renderStatic();
  renderPicker();
  renderToggles();
  go(Number(info.step) || 0);
});
