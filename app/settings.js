const api = window.settingsApi;

const shortcutBtn = document.getElementById('shortcutBtn');
const shortcutHint = document.getElementById('shortcutHint');
const shortcutReset = document.getElementById('shortcutReset');
const widthRange = document.getElementById('widthRange');
const widthValue = document.getElementById('widthValue');
const hideOnBlur = document.getElementById('hideOnBlur');
const toastEl = document.getElementById('toast');

const DEFAULT_SHORTCUT = 'Control+Alt+T';
const HINT = 'Opens and closes the task panel from anywhere.';

let snapshot = null;
let recording = false;
let toastTimer = null;
let platform = null;
const isMac = () => platform !== 'win32';

// ---------- Shortcut helpers ----------

const MOD_SYMBOLS = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' };
const KEY_SYMBOLS = { Up: '↑', Down: '↓', Left: '←', Right: '→', Return: '↩', Tab: '⇥', Space: 'Space' };
const PUNCTUATION = {
  Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/',
};

const WIN_NAMES = { Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Super: 'Win', Command: 'Win' };
const WIN_KEYS = { Return: 'Enter' };

function prettyShortcut(accelerator) {
  if (!accelerator) return 'None';
  const parts = accelerator.split('+');
  const key = parts.pop();
  if (!isMac()) {
    const order = ['Control', 'Alt', 'Shift', 'Super', 'Command'];
    const mods = order.filter((m) => parts.includes(m)).map((m) => WIN_NAMES[m]);
    return [...mods, key ? WIN_KEYS[key] || key : ''].filter(Boolean).join('+') + (key ? '' : '+');
  }
  const order = ['Control', 'Alt', 'Shift', 'Command'];
  const mods = order.filter((m) => parts.includes(m)).map((m) => MOD_SYMBOLS[m]).join('');
  return mods + (KEY_SYMBOLS[key] || key);
}

function keyFromEvent(e) {
  const code = e.code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^F([1-9]|1[0-9]|20)$/.test(code)) return code;
  if (code === 'Space') return 'Space';
  if (code === 'Enter') return 'Return';
  if (code.startsWith('Arrow')) return code.slice(5);
  return PUNCTUATION[code] || null;
}

function modifiersFromEvent(e) {
  const mods = [];
  if (e.metaKey) mods.push(isMac() ? 'Command' : 'Super');
  if (e.ctrlKey) mods.push('Control');
  if (e.altKey) mods.push('Alt');
  if (e.shiftKey) mods.push('Shift');
  return mods;
}

function startRecording() {
  if (recording) return;
  recording = true;
  api.pauseShortcut();
  shortcutBtn.classList.add('recording');
  shortcutBtn.textContent = 'Press keys…';
  shortcutHint.textContent = 'Press the new shortcut, or Esc to cancel.';
  shortcutHint.classList.remove('warn');
}

function stopRecording(resume) {
  if (!recording) return;
  recording = false;
  shortcutBtn.classList.remove('recording');
  if (resume) api.resumeShortcut();
  renderShortcut();
}

async function commitShortcut(accelerator) {
  recording = false;
  shortcutBtn.classList.remove('recording');
  const result = await api.setShortcut(accelerator);
  snapshot = await api.get();
  if (result.ok) {
    shortcutHint.classList.remove('warn');
    renderShortcut();
    toast(`Shortcut set to ${prettyShortcut(accelerator)}`);
  } else {
    renderShortcut();
    shortcutHint.textContent = result.error;
    shortcutHint.classList.add('warn');
  }
}

document.addEventListener('keydown', (e) => {
  if (!recording) return;
  e.preventDefault();
  e.stopPropagation();

  if (e.key === 'Escape') {
    stopRecording(true);
    return;
  }

  const mods = modifiersFromEvent(e);
  const key = keyFromEvent(e);

  if (!key) {
    // Only modifiers so far - show them live.
    shortcutBtn.textContent = mods.length ? prettyShortcut(mods.join('+') + '+') : 'Press keys…';
    return;
  }

  const isFunctionKey = /^F\d+$/.test(key);
  if (!mods.length && !isFunctionKey) {
    shortcutHint.textContent = isMac()
      ? 'Use at least one of ⌃ ⌥ ⇧ ⌘ with a key (for example ⌃⌥T).'
      : 'Use Ctrl, Alt or Shift with a key (for example Ctrl+Alt+T).';
    shortcutHint.classList.add('warn');
    return;
  }
  if (mods.length === 1 && mods[0] === 'Shift' && !isFunctionKey) {
    shortcutHint.textContent = isMac() ? 'Shift alone is not enough — add ⌃, ⌥ or ⌘.' : 'Shift alone is not enough — add Ctrl or Alt.';
    shortcutHint.classList.add('warn');
    return;
  }

  commitShortcut([...mods, key].join('+'));
}, true);

window.addEventListener('blur', () => stopRecording(true));

shortcutBtn.addEventListener('click', () => {
  if (recording) stopRecording(true);
  else startRecording();
});

shortcutReset.addEventListener('click', () => commitShortcut(DEFAULT_SHORTCUT));

// ---------- Rendering ----------

function renderShortcut() {
  if (!snapshot || recording) return;
  shortcutBtn.textContent = prettyShortcut(snapshot.settings.shortcut);
  if (!snapshot.shortcutActive) {
    shortcutHint.textContent = 'This shortcut is not working (another app may use it). Pick a different one.';
    shortcutHint.classList.add('warn');
  } else if (!shortcutHint.classList.contains('warn')) {
    shortcutHint.textContent = HINT;
  }
}

const MAC_KEY_LABELS = { control: '⌃ Control', option: '⌥ Option', command: '⌘ Command', shift: '⇧ Shift' };
const WIN_KEY_LABELS = { control: 'Ctrl', option: 'Alt', shift: 'Shift' };
const keyLabels = () => (isMac() ? MAC_KEY_LABELS : WIN_KEY_LABELS);

/** Windows wording and keys (the page is written for the Mac). Runs once. */
function applyPlatform(p, keys) {
  platform = p;
  document.documentElement.classList.add(`platform-${p}`);
  const select = document.getElementById('doubleTapKey');
  select.replaceChildren(...[...keys, 'off'].map((k) => new Option(k === 'off' ? 'Off' : keyLabels()[k], k)));
  if (isMac()) return;
  const text = (id, value) => { const el = document.getElementById(id); if (el) el.textContent = value; };
  text('loginLabel', 'Start with Windows');
  text('loginHint', 'Keeps TaskPop running so it can pop up when your PC wakes.');
  text('countLabel', 'Show task count on the tray icon');
  text('wakeHint', 'Shows your tasks when your PC wakes from sleep.');
  text('showData', 'Show in File Explorer');
  text('savedLabel', 'Saved on this PC');
  text('backupHint', 'Export your tasks to a file, or import them on another computer.');
  text('remindHint', 'Right-click a task → Remind me. You’ll get a Windows notification.');
  text('testNotifyHint', 'If nothing appears, check Windows Settings → System → Notifications.');
  const tipSiri = document.getElementById('tipSiri');
  if (tipSiri) tipSiri.remove();
  const kbd = (id, keysText) => { const el = document.getElementById(id); if (el) el.replaceChildren(...keysText.map((k) => Object.assign(document.createElement('kbd'), { textContent: k }))); };
  kbd('tipDoubleTapKey', ['Ctrl']);
  kbd('tipReturnKey', ['Enter']);
  kbd('tipDeleteKey', ['Delete']);
  kbd('tipUndoKeys', ['Ctrl', 'Z']);
  kbd('tipMoveKeys', ['Alt', '↑', '↓']);
}

function renderDoubleTap() {
  const row = document.getElementById('doubleTapStatusRow');
  const hint = document.getElementById('doubleTapHint');
  const d = snapshot.doubleTap || { status: 'off' };
  const label = keyLabels()[d.key] || '';
  // The tips list shows the key you chose (it used to always show the default)
  const tipKey = document.getElementById('tipDoubleTapKey');
  const tipLabel = (isMac() ? { control: '⌃', option: '⌥', command: '⌘', shift: '⇧' } : WIN_KEY_LABELS)[d.key] || (isMac() ? '⌃' : 'Ctrl');
  if (tipKey) tipKey.replaceChildren(Object.assign(document.createElement('kbd'), { textContent: tipLabel }));
  hint.textContent = d.status === 'off'
    ? 'Tap a modifier key twice quickly to open TaskPop from any app.'
    : `Tap ${label} twice quickly, from any app. TaskPop only notices that the key was tapped; it never sees what you type.`;

  const allow = document.getElementById('doubleTapAllow');
  const restart = document.getElementById('doubleTapRestart');
  allow.hidden = true;
  restart.hidden = true;
  let dot = 'grey';
  let title = '';
  let detail = '';
  if (d.status === 'working') {
    dot = 'green';
    title = 'Working';
  } else if (d.status === 'blocked') {
    dot = 'red';
    title = 'macOS is blocking the double-tap';
    if (d.allowed) {
      detail = 'TaskPop is allowed now. Restart it to finish.';
      restart.hidden = false;
    } else {
      detail = 'Allow TaskPop under System Settings → Privacy & Security → Input Monitoring, then restart TaskPop. It only reads whether Control, Option, Command or Shift is held.';
      allow.hidden = false;
      restart.hidden = false;
    }
  } else if (d.status === 'limited') {
    // v1.6.8: the keys can be read, but macOS doesn't recognise TaskPop under Input Monitoring
    dot = 'amber';
    title = 'Allow TaskPop again to hear every double-tap';
    detail = 'After an update, macOS may stop recognising TaskPop under Input Monitoring, and then a double-tap can be missed while another app is busy. Click Allow, switch TaskPop off and on in that list, then restart TaskPop.';
    allow.hidden = false;
    restart.hidden = false;
  } else if (d.status === 'unavailable') {
    dot = 'red';
    title = 'Double-tap isn’t available on this Mac';
    detail = 'Use the keyboard shortcut instead.';
  }
  row.hidden = !title;
  document.getElementById('doubleTapDot').className = `dot ${dot}`;
  document.getElementById('doubleTapStatus').textContent = title;
  document.getElementById('doubleTapDetail').textContent = detail;
}

// ---------- Updates ----------

function timeAgo(ts) {
  const minutes = Math.round((Date.now() - ts) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days} days ago`;
}

const shortDate = (ts) => new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function renderUpdates() {
  const u = snapshot.update;
  const store = !!(u && u.managedBy === 'store');
  const show = !!(u && (u.supported || store));
  document.getElementById('updatesHeading').hidden = !show;
  document.getElementById('updatesSection').hidden = !show;
  if (!show) return;
  // Installed from the Microsoft Store: it keeps TaskPop up to date.
  const section = document.getElementById('updatesSection');
  section.querySelectorAll('.row').forEach((row, i) => { if (i > 0) row.hidden = store; });
  if (store) {
    document.getElementById('updateTitle').textContent = `TaskPop ${u.current}`;
    document.getElementById('updateDetail').textContent = 'Updates come automatically from the Microsoft Store.';
    document.getElementById('updateDetail').classList.remove('warn');
    document.getElementById('updateCheck').hidden = true;
    document.getElementById('updateInstall').hidden = true;
    return;
  }

  const detail = document.getElementById('updateDetail');
  const checkBtn = document.getElementById('updateCheck');
  const installBtn = document.getElementById('updateInstall');
  const meterRow = document.getElementById('updateMeterRow');
  const notesRow = document.getElementById('updateNotesRow');
  const v = u.latest ? u.latest.version : null;

  document.getElementById('updateTitle').textContent = `TaskPop ${u.current}`;
  let text = '';
  let warn = false;
  if (u.status === 'downloading') {
    text = `Downloading version ${v}… ${Math.round((u.progress || 0) * 100)}%`;
  } else if (u.status === 'installing') {
    text = isMac()
      ? 'Installing… Enter your Mac password if asked. TaskPop reopens by itself.'
      : 'Installing… TaskPop will close and reopen in a moment.';
  } else if (u.checking) {
    text = 'Checking for updates…';
  } else if (u.status === 'failed' || u.status === 'error') {
    text = u.message || 'Something went wrong. Please try again.';
    warn = true;
  } else if (u.latest) {
    text = `Version ${v} is available${u.latest.publishedAt ? ` (released ${shortDate(u.latest.publishedAt)})` : ''}.`;
    if (u.message) text += ` ${u.message}`;
  } else if (u.status === 'up-to-date') {
    text = `You’re up to date. Checked ${timeAgo(u.checkedAt)}.`;
  } else {
    text = 'Click Check now to see if there’s a newer version.';
  }
  detail.textContent = text;
  detail.classList.toggle('warn', warn);

  const busy = u.status === 'downloading' || u.status === 'installing';
  checkBtn.hidden = busy;
  checkBtn.disabled = !!u.checking;
  checkBtn.textContent = u.checking ? 'Checking…' : 'Check now';
  installBtn.hidden = busy || !u.latest;
  installBtn.textContent = u.status === 'failed' ? 'Try again' : 'Update now';

  meterRow.hidden = u.status !== 'downloading';
  document.getElementById('updateMeter').style.width = `${Math.round((u.progress || 0) * 100)}%`;

  notesRow.hidden = !u.latest;
  if (u.latest) {
    document.getElementById('updateNotesTitle').textContent = `What’s new in ${v}`;
    const notes = document.getElementById('updateNotes');
    notes.textContent = u.latest.notes || 'No notes for this version.';
    notes.classList.toggle('empty', !u.latest.notes);
  }
}

let pendingFocus = null;

function applyFocus() {
  if (pendingFocus !== 'updates' || !snapshot) return;
  const section = document.getElementById('updatesSection');
  if (section.hidden) return;
  pendingFocus = null;
  document.getElementById('updatesHeading').scrollIntoView({ block: 'start' });
  section.classList.remove('flash');
  void section.offsetWidth; // restart the highlight
  section.classList.add('flash');
}

function render() {
  if (!snapshot) return;
  if (!platform) applyPlatform(snapshot.platform || 'darwin', snapshot.doubleTapKeys || ['control', 'option', 'command', 'shift']);
  if (snapshot.store) {
    // Store copy: Windows runs its start-up task; you turn it on or off in Windows Settings.
    document.getElementById('loginSwitch').hidden = true;
    document.getElementById('startupSettings').hidden = false;
    document.getElementById('loginHint').textContent = 'TaskPop starts with Windows so it can pop up when your PC wakes. Turn this on or off in Windows Settings → Apps → Startup.';
  }
  renderDoubleTap();
  renderUpdates();
  const s = snapshot.settings;

  renderShortcut();

  document.querySelectorAll('input[type="checkbox"][data-setting]').forEach((box) => {
    const key = box.dataset.setting;
    box.checked = key === 'openAtLogin' ? snapshot.openAtLogin : !!s[key];
  });
  hideOnBlur.checked = !s.keepOpen;

  document.querySelectorAll('.segmented[data-setting]').forEach((group) => {
    const value = s[group.dataset.setting];
    group.querySelectorAll('button').forEach((b) => b.classList.toggle('active', b.dataset.value === value));
  });
  // "Custom" is where you dragged the panel; until you have, there's nothing to choose.
  document.getElementById('positionCustom').disabled = !s.customSpot;
  document.getElementById('positionHint').textContent = s.position === 'custom'
    ? 'Where you put it. Drag the panel by its top bar to move it again.'
    : 'Or drag the panel by its top bar to put it anywhere.';

  document.querySelectorAll('select[data-setting]').forEach((sel) => {
    sel.value = s[sel.dataset.setting];
  });

  if (document.activeElement !== widthRange) widthRange.value = s.width;
  document.getElementById('calendarDuration').value = String(s.calendarDuration);
  const account = document.getElementById('googleAccount');
  if (document.activeElement !== account) account.value = s.googleAccount || '';
  widthValue.textContent = `${widthRange.value} px`;

  document.getElementById('dataPath').textContent = snapshot.dataPath;
  const { total, done } = snapshot.stats;
  document.getElementById('stats').textContent =
    `${total} task${total === 1 ? '' : 's'} · ${done} completed · saved automatically`;
  const footer = document.getElementById('footer');
  footer.replaceChildren(`TaskPop ${snapshot.version} · Developed by `);
  const brand = document.createElement('b');
  brand.textContent = 'asmlab';
  footer.append(brand);
  applyFocus();
}

function toast(message) {
  if (!message) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2400);
}

async function update(key, value) {
  snapshot = await api.update(key, value);
  render();
}

// ---------- Controls ----------

document.querySelectorAll('input[type="checkbox"][data-setting]').forEach((box) => {
  box.addEventListener('change', () => update(box.dataset.setting, box.checked));
});

hideOnBlur.addEventListener('change', () => update('keepOpen', !hideOnBlur.checked));

document.querySelectorAll('.segmented[data-setting]').forEach((group) => {
  group.querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => update(group.dataset.setting, b.dataset.value));
  });
});

document.querySelectorAll('select[data-setting]').forEach((sel) => {
  sel.addEventListener('change', () => update(sel.dataset.setting, sel.value));
});

widthRange.addEventListener('input', () => {
  widthValue.textContent = `${widthRange.value} px`;
});
widthRange.addEventListener('change', () => update('width', Number(widthRange.value)));

async function runAction(action) {
  const result = await action();
  if (result && !result.canceled) toast(result.message);
  snapshot = await api.get();
  render();
}

document.getElementById('showData').addEventListener('click', () => api.showData());
document.getElementById('startupSettings').addEventListener('click', () => api.openStartupSettings());
document.getElementById('calendarDuration').addEventListener('change', (e) => update('calendarDuration', Number(e.target.value)));
(() => {
  const account = document.getElementById('googleAccount');
  const hint = document.getElementById('googleAccountHint');
  const HINT_TEXT = hint.textContent;
  const commitAccount = async () => {
    const value = account.value.trim();
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      hint.textContent = 'That doesn’t look like an email address.';
      hint.classList.add('warn');
      return;
    }
    hint.textContent = HINT_TEXT;
    hint.classList.remove('warn');
    if (value !== (snapshot.settings.googleAccount || '')) {
      await update('googleAccount', value);
      toast(value ? `Google Calendar will open as ${value}` : 'Google Calendar will open with your main account');
    }
  };
  account.addEventListener('change', commitAccount);
  account.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') account.blur();
  });
})();
document.getElementById('doubleTapAllow').addEventListener('click', () => api.allowKeys());
document.getElementById('tourBtn').addEventListener('click', () => api.showTour());
document.getElementById('reportBtn').addEventListener('click', async () => {
  const btn = document.getElementById('reportBtn');
  const text = await api.copyDoubleTapReport();
  btn.textContent = text ? 'Copied' : 'Couldn’t copy';
  setTimeout(() => { btn.textContent = 'Copy report'; }, 2000);
});
document.getElementById('doubleTapRestart').addEventListener('click', () => api.restart());

// Pressing keys in this window lets TaskPop confirm that macOS shows it the key state.
const MODIFIER_KINDS = { Control: 'control', Alt: 'option', Meta: 'command', Shift: 'shift' };
document.addEventListener('keydown', (e) => {
  if (recording || e.repeat) return;
  api.probeKeys(MODIFIER_KINDS[e.key] || 'key');
});
document.getElementById('testNotify').addEventListener('click', () => runAction(api.testNotification));
document.getElementById('updateCheck').addEventListener('click', async () => {
  const state = await api.checkUpdates();
  if (state && !state.latest && state.status === 'up-to-date') toast('You’re up to date.');
});
document.getElementById('updateInstall').addEventListener('click', () => api.installUpdate());
document.getElementById('updatePage').addEventListener('click', () => api.openUpdatePage());

// Morning summary time options (every 30 minutes)
(() => {
  const sel = document.getElementById('summaryTime');
  for (let minutes = 0; minutes < 24 * 60; minutes += 30) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    const value = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const label = new Date(2000, 0, 1, h, m).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    sel.add(new Option(label, value));
  }
})();
document.getElementById('exportBtn').addEventListener('click', () => runAction(api.exportTasks));
document.getElementById('importBtn').addEventListener('click', () => runAction(api.importTasks));
document.getElementById('clearCompletedBtn').addEventListener('click', () => runAction(api.clearCompleted));
document.getElementById('clearAllBtn').addEventListener('click', () => runAction(api.clearAll));

api.onFocus((section) => {
  pendingFocus = section;
  applyFocus();
});

api.onChanged((next) => {
  snapshot = next;
  render();
});

api.get().then((s) => {
  snapshot = s;
  render();
});
