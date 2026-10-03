// TaskPop - a tiny side-panel task list for macOS and Windows.
// Data lives on this computer (macOS: ~/Library/Application Support/TaskPop/, Windows: %APPDATA%\\TaskPop\\)
//   tasks.json     - your tasks
//   settings.json  - your preferences
//   *.bak          - automatic backup of the previous good save

const {
  app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, powerMonitor, screen, ipcMain,
  systemPreferences, nativeTheme, shell, dialog, Notification, clipboard, session,
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { DoubleTapWatcher, createKeySource, acceleratorMask, KEY_MASKS } = require('./doubletap');
const { createWinFocus } = require('./winfocus');
const { createUpdater, Updater, compareVersions } = require('./updater');
const calendar = require('./calendar');

const isMac = process.platform === 'darwin';
const isWin = process.platform === 'win32';
// Installed from the Microsoft Store (MSIX package): the Store handles updates and start-up.
const isStore = isWin && !!process.windowsStore;
const APP_ID = 'com.pixmint.taskpop';
// Keys that can be double-tapped. On Windows a lone tap of the Windows key opens Start, so it isn't offered.
const DOUBLE_TAP_KEYS = isWin ? ['control', 'option', 'shift'] : ['control', 'option', 'command', 'shift'];

const DEFAULT_SETTINGS = {
  shortcut: 'Control+Alt+T',
  showOnWake: true,
  showOnUnlock: true,
  keepOpen: false,
  position: 'right', // 'left' | 'right' | 'custom' (where you dragged it)
  customSpot: null, // { displayId, dx, dy }: the panel's top-left corner on that screen
  width: 340,
  theme: 'system',
  showCountInMenuBar: true,
  autoClearCompleted: 'never',
  notifications: true,
  dailySummary: false,
  dailySummaryTime: '09:00',
  completionSound: true,
  doubleTapKey: 'control', // 'off' | 'control' | 'option' | 'command' | 'shift'
  autoCheckUpdates: true,
  calendarDuration: 60, // minutes, default length of a Google Calendar event
  googleAccount: '', // optional: which Google account opens (for people signed in to several)
};

const AUTO_CLEAR_MS = { never: 0, '1d': 24 * 3600 * 1000, '7d': 7 * 24 * 3600 * 1000 };
const isBool = (v) => typeof v === 'boolean';
const isSpot = (v) => !!v && typeof v === 'object' && Number.isFinite(v.dx) && Number.isFinite(v.dy)
  && Math.abs(v.dx) < 100000 && Math.abs(v.dy) < 100000 && (v.displayId === null || Number.isFinite(v.displayId));

const VALIDATORS = {
  showOnWake: isBool,
  showOnUnlock: isBool,
  keepOpen: isBool,
  showCountInMenuBar: isBool,
  position: (v) => v === 'left' || v === 'right' || v === 'custom',
  customSpot: (v) => v === null || isSpot(v),
  width: (v) => Number.isFinite(v) && v >= 280 && v <= 480,
  theme: (v) => ['system', 'light', 'dark'].includes(v),
  autoClearCompleted: (v) => Object.prototype.hasOwnProperty.call(AUTO_CLEAR_MS, v),
  notifications: isBool,
  dailySummary: isBool,
  dailySummaryTime: (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v),
  completionSound: isBool,
  doubleTapKey: (v) => v === 'off' || DOUBLE_TAP_KEYS.includes(v),
  autoCheckUpdates: isBool,
  calendarDuration: (v) => calendar.LENGTHS.includes(v),
  googleAccount: (v) => v === '' || calendar.isEmail(v),
};

const PANEL_MAX_HEIGHT = 640;
const PANEL_MIN_HEIGHT = 360; // a panel moved low down gets shorter, but not shorter than this
const SCREEN_MARGIN = 10;
const SNAP_PX = 24; // dropped this close to a screen edge, it lines up with the edge

let panel = null;
let settingsWin = null;
let promptWin = null; // the "New update is here" pop-up
let tourWin = null; // the first-run tour
let tourKeyTimer = null;
let screenLocked = false; // no update pop-up while the screen is locked or asleep
const startedAt = Date.now();
let tray = null;
let isShown = false;
let fadeTimer = null;
let appHidden = false;
let quitting = false;
let registeredShortcut = null;
let holdPanel = false; // true while the reminder picker is open in the panel
const liveNotifications = new Set();

let settings = { ...DEFAULT_SETTINGS };
let tasks = [];
let meta = { firstRunDone: false, lastDay: null, lastSummaryDay: null };

// Revision tracking: the panel keeps its own copy of the list. When it saves on top of an older
// copy, changes the app made in the meantime (reminders, snoozes, clean-up, imports) are kept.
let rev = 0;
const changedAt = new Map(); // task id -> rev when the app changed it
const addedAt = new Map(); // task id -> rev when the app added it
const removedAt = new Map(); // task id -> rev when the app removed it

// Double-tap trigger state
let keySource = null;
let doubleTap = null;
let doubleTapCheck = { flags: null, activity: null, flagMisses: 0 }; // is macOS letting us read key state?
let doubleTapWorked = false;
let readyAt = 0;
let lastBlurHideAt = 0;
let launchedAfterUpdate = false; // this launch is the first one of a newer version
let winFocus = null; // Windows: helper that gives the panel keyboard focus
let updater = null;
const UPDATE_EVERY_MS = 4 * 3600 * 1000; // background check for a new version at most this often

// ---------- Local storage (atomic writes + backup) ----------

const dataDir = () => app.getPath('userData');

/**
 * Where the data really is on disk. Store (MSIX) apps have their AppData writes kept in the
 * package's own folder: %LOCALAPPDATA%\\Packages\\<family>\\LocalCache\\Roaming\\TaskPop.
 */
function realDataDir() {
  if (!isStore) return dataDir();
  try {
    // The install folder is named after the package: Name_Version_Arch_ResourceId_PublisherId
    const parts = path.basename(path.dirname(process.execPath)).split('_');
    if (parts.length >= 5) {
      const family = `${parts[0]}_${parts[parts.length - 1]}`;
      const dir = path.join(process.env.LOCALAPPDATA || '', 'Packages', family, 'LocalCache', 'Roaming', path.basename(dataDir()));
      if (fs.existsSync(dir)) return dir;
    }
  } catch (_) {
    // fall back to the usual path
  }
  return dataDir();
}
const dataFile = (name) => path.join(dataDir(), name);

function tryParse(file) {
  try {
    return { ok: true, value: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (err) {
    return { ok: false, missing: err.code === 'ENOENT' };
  }
}

function readJSON(name, fallback) {
  const main = tryParse(dataFile(name));
  if (main.ok) return main.value;
  const backup = tryParse(dataFile(`${name}.bak`));
  if (!main.missing) {
    // Keep the unreadable file so nothing is ever silently thrown away.
    try {
      fs.copyFileSync(dataFile(name), dataFile(`${name}.damaged-${Date.now()}`));
    } catch (_) {
      // nothing to keep
    }
  }
  return backup.ok ? backup.value : fallback;
}

function writeJSON(name, data) {
  try {
    fs.mkdirSync(dataDir(), { recursive: true });
    const target = dataFile(name);
    const tmp = `${target}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    // Only a readable file becomes the backup, so a damaged file never replaces a good backup.
    if (tryParse(target).ok) fs.copyFileSync(target, `${target}.bak`);
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error(`TaskPop: failed to write ${name}`, err);
  }
}

function sanitizeTasks(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  return list
    .filter((t) => t && typeof t.title === 'string' && t.title.trim())
    .map((t) => ({
      id: String(t.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      title: t.title.trim().slice(0, 500),
      done: !!t.done,
      createdAt: Number(t.createdAt) || Date.now(),
      completedAt: t.done ? Number(t.completedAt) || Date.now() : null,
      important: !!t.important,
      repeat: t.repeat === 'daily' ? 'daily' : 'none',
      remindAt: t.remindAt ? Number(t.remindAt) || null : null,
      reminded: !!t.reminded,
      calendarAt: t.calendarAt ? Number(t.calendarAt) || null : null, // sent to Google Calendar for this time
      calendarAllDay: !!t.calendarAllDay,
    }))
    .filter((t) => (seen.has(t.id) ? false : seen.add(t.id)));
}

function sanitizeSettings(raw) {
  const clean = { ...DEFAULT_SETTINGS };
  if (raw && typeof raw === 'object') {
    for (const [key, check] of Object.entries(VALIDATORS)) {
      if (check(raw[key])) clean[key] = raw[key];
    }
    if (typeof raw.shortcut === 'string' || raw.shortcut === null) clean.shortcut = raw.shortcut;
  }
  if (clean.position === 'custom' && !clean.customSpot) clean.position = 'right';
  return clean;
}

const saveTasks = () => writeJSON('tasks.json', { version: 1, updatedAt: new Date().toISOString(), tasks });
const saveSettings = () => writeJSON('settings.json', settings);
const saveMeta = () => writeJSON('meta.json', meta);

function loadAll() {
  const rawSettings = readJSON('settings.json', {});
  settings = sanitizeSettings(rawSettings);
  // Drop options from older versions (e.g. 1.3's voice settings) from the file.
  if (rawSettings && typeof rawSettings === 'object' && Object.keys(rawSettings).some((k) => !(k in DEFAULT_SETTINGS))) saveSettings();
  meta = { firstRunDone: false, lastDay: null, lastSummaryDay: null, ...readJSON('meta.json', {}) };

  const stored = readJSON('tasks.json', null);
  if (stored && Array.isArray(stored.tasks)) {
    tasks = sanitizeTasks(stored.tasks);
    return;
  }

  // Migrate data from TaskPop 1.0 (store.json)
  const old = readJSON('store.json', null);
  if (old) {
    tasks = sanitizeTasks(old.tasks);
    settings.keepOpen = !!old.pinned;
    if (old.firstRunDone) meta.firstRunDone = true;
    saveTasks();
    saveSettings();
    saveMeta();
  }
}

// ---------- Helpers ----------

function accentColor() {
  try {
    return `#${systemPreferences.getAccentColor().slice(0, 6)}`;
  } catch (_) {
    return '#0a84ff';
  }
}

function getOpenAtLogin() {
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (_) {
    return false;
  }
}

function setOpenAtLogin(value) {
  try {
    app.setLoginItemSettings({ openAtLogin: !!value });
  } catch (err) {
    console.error('TaskPop: could not change open-at-login', err);
  }
}

const alive = (win) => !!win && !win.isDestroyed();

// macOS: hide the whole app so focus returns to the previous app. Windows does this by itself.
function hideApp() {
  if (alive(promptWin) && promptWin.isVisible()) return; // that would hide the update pop-up too
  if (alive(tourWin) && tourWin.isVisible()) return; // …or the tour
  if (isMac && typeof app.hide === 'function') {
    app.hide();
    appHidden = true;
  }
}

function unhideApp() {
  if (appHidden && typeof app.show === 'function') app.show();
  appHidden = false;
}

const panelBackground = () => (nativeTheme.shouldUseDarkColors ? '#262628' : '#f6f6f8');

function send(win, channel, payload) {
  if (alive(win)) win.webContents.send(channel, payload);
}

function settingsSnapshot() {
  return {
    settings,
    openAtLogin: getOpenAtLogin(),
    shortcutActive: !!registeredShortcut,
    stats: { total: tasks.length, done: tasks.filter((t) => t.done).length },
    dataPath: realDataDir(),
    store: isStore,
    version: app.getVersion(),
    doubleTap: doubleTapStatus(),
    platform: process.platform,
    doubleTapKeys: DOUBLE_TAP_KEYS,
    update: updater ? updater.publicState() : null,
  };
}

function broadcastSettings() {
  send(panel, 'settings:changed', settings);
  send(settingsWin, 'settings:changed', settingsSnapshot());
  refreshTray();
}

function pushTasks() {
  send(panel, 'tasks:replace', { tasks, rev });
  send(settingsWin, 'settings:changed', settingsSnapshot());
  refreshTray();
}

/** Record a change the app itself made, save it and send the new list to the panel. */
function commit({ changed = [], added = [], removed = [] } = {}) {
  rev += 1;
  changed.forEach((id) => changedAt.set(id, rev));
  added.forEach((id) => addedAt.set(id, rev));
  removed.forEach((id) => removedAt.set(id, rev));
  if (changedAt.size + addedAt.size + removedAt.size > 3000) {
    for (const m of [changedAt, addedAt, removedAt]) {
      for (const [id, r] of m) if (r < rev - 500) m.delete(id);
    }
  }
  saveTasks();
  pushTasks();
}

function autoClearCompleted() {
  const maxAge = AUTO_CLEAR_MS[settings.autoClearCompleted] || 0;
  if (!maxAge) return;
  const now = Date.now();
  const removed = tasks.filter((t) => t.done && t.repeat !== 'daily' && t.completedAt && now - t.completedAt > maxAge);
  if (!removed.length) return;
  const ids = new Set(removed.map((t) => t.id));
  tasks = tasks.filter((t) => !ids.has(t.id));
  commit({ removed: [...ids] });
}

// ---------- Notifications, reminders, daily routines ----------

const dayKey = (d = new Date()) => `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

function notify({ title, body, actions, onClick, onAction }) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body, actions: actions || [] });
  liveNotifications.add(n); // keep a reference so click handlers survive
  const forget = () => liveNotifications.delete(n);
  n.on('click', () => {
    forget();
    if (onClick) onClick();
  });
  n.on('action', (_event, index) => {
    forget();
    if (onAction) onAction(index);
  });
  n.on('close', forget);
  n.show();
}

function notifyTask(task) {
  notify({
    title: 'TaskPop reminder',
    body: task.title,
    actions: [{ type: 'button', text: 'Mark as done' }, { type: 'button', text: 'Snooze 15 min' }],
    onClick: () => showPanel(true),
    onAction: (index) => {
      const current = tasks.find((t) => t.id === task.id);
      if (!current) return;
      if (index === 0) {
        current.done = true;
        current.completedAt = Date.now();
      } else {
        current.remindAt = Date.now() + 15 * 60 * 1000;
        current.reminded = false;
      }
      commit({ changed: [current.id] });
    },
  });
}

function summaryTimeToday(now) {
  const [h, m] = settings.dailySummaryTime.split(':').map(Number);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, m).getTime();
}

// Runs every 30 seconds (and on wake/show): daily resets, reminders, daily summary, clean-up.
function tick() {
  const now = new Date();
  const today = dayKey(now);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const changed = new Set();

  // New day: un-tick "repeat every day" tasks and bring yesterday's reminders forward to today.
  if (meta.lastDay !== today) {
    for (const t of tasks) {
      if (t.repeat !== 'daily') continue;
      if (t.done) {
        t.done = false;
        t.completedAt = null;
        changed.add(t.id);
      }
      if (t.remindAt && t.remindAt < startOfToday) {
        const r = new Date(t.remindAt);
        t.remindAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), r.getHours(), r.getMinutes()).getTime();
        t.reminded = false;
        changed.add(t.id);
      }
    }
    meta.lastDay = today;
    saveMeta();
  }

  // Due reminders
  for (const t of tasks) {
    if (t.remindAt && !t.reminded && !t.done && t.remindAt <= now.getTime()) {
      t.reminded = true;
      changed.add(t.id);
      if (settings.notifications) notifyTask(t);
    }
  }

  // Morning summary
  if (settings.dailySummary && meta.lastSummaryDay !== today && now.getTime() >= summaryTimeToday(now)) {
    meta.lastSummaryDay = today;
    saveMeta();
    const pending = tasks.filter((t) => !t.done);
    if (pending.length) {
      const names = pending.slice(0, 3).map((t) => t.title).join(', ');
      notify({
        title: `You have ${pending.length} task${pending.length === 1 ? '' : 's'} today`,
        body: pending.length > 3 ? `${names} and ${pending.length - 3} more` : names,
        onClick: () => showPanel(true),
      });
    }
  }

  if (changed.size) commit({ changed: [...changed] });
  autoClearCompleted();
}

// ---------- Global shortcut ----------

function registerShortcut(accelerator) {
  if (registeredShortcut) {
    globalShortcut.unregister(registeredShortcut);
    registeredShortcut = null;
  }
  if (!accelerator) return true;
  let ok = false;
  try {
    ok = globalShortcut.register(accelerator, () => {
      verifyKeyAccessWith(accelerator);
      togglePanel();
    });
  } catch (_) {
    ok = false;
  }
  if (ok) registeredShortcut = accelerator;
  return ok;
}

function changeShortcut(accelerator) {
  const previous = settings.shortcut;
  if (registerShortcut(accelerator)) {
    settings.shortcut = accelerator;
    saveSettings();
    broadcastSettings();
    return { ok: true };
  }
  registerShortcut(previous);
  return {
    ok: false,
    error: 'That shortcut is already taken by the system or another app. Please try a different one.',
  };
}

// ---------- Panel window ----------

function createPanel() {
  panel = new BrowserWindow({
    width: settings.width,
    height: 500,
    show: false,
    frame: false,
    ...(isMac ? { type: 'panel' } : {}),
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    // macOS: translucent popover material. Windows: a solid panel (Windows 11 rounds its corners).
    ...(isMac
      ? { vibrancy: 'popover', visualEffectState: 'active', backgroundColor: '#00000000' }
      : { backgroundColor: panelBackground(), icon: appIconPath() }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      spellcheck: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  panel.setAlwaysOnTop(true, 'floating');
  joinAllSpaces();
  panel.loadFile(path.join(__dirname, 'index.html'));
  lockDown(panel);

  panel.on('blur', () => {
    if (isShown && !settings.keepOpen && !holdPanel) {
      lastBlurHideAt = Date.now();
      hidePanel();
    }
  });

  // Cmd+W should hide the panel, never destroy it.
  panel.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      hidePanel();
    }
  });
}

/**
 * macOS: a full-screen app (Chrome, Safari, a video…) lives in its own Space. Mark the panel to
 * join every Space, full-screen ones included, so it opens where you are instead of on the
 * desktop you left. (TaskPop has no Dock icon, so this needs no app-type switch.)
 */
function joinAllSpaces() {
  if (!isMac || !alive(panel) || typeof panel.setVisibleOnAllWorkspaces !== 'function') return;
  try {
    panel.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  } catch (err) {
    console.error('TaskPop: could not show on all Spaces', err);
  }
}

/** Windows only ever show TaskPop's own pages. */
function lockDown(win) {
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (event) => event.preventDefault());
}

const fullHeight = (workArea) => Math.round(Math.min(workArea.height - SCREEN_MARGIN * 2, PANEL_MAX_HEIGHT));
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** The screen the panel was dragged to (or, if it's gone, the one you're using now). */
function spotDisplay(spot) {
  return screen.getAllDisplays().find((d) => d.id === spot.displayId)
    || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

/** Where the panel goes when you've put it somewhere yourself: there, kept fully on screen. */
function customBounds(spot) {
  const { workArea } = spotDisplay(spot);
  const width = Math.min(settings.width, workArea.width);
  const full = fullHeight(workArea);
  let y = workArea.y + spot.dy;
  const bottom = workArea.y + workArea.height;
  // Lower down there's less room: it gets shorter, down to PANEL_MIN_HEIGHT, then moves up.
  let height = Math.min(full, bottom - y);
  if (height < Math.min(full, PANEL_MIN_HEIGHT)) {
    height = Math.min(full, PANEL_MIN_HEIGHT);
    y = bottom - height;
  }
  y = clamp(y, workArea.y, bottom - height);
  const x = clamp(workArea.x + spot.dx, workArea.x, workArea.x + workArea.width - width);
  return { x: Math.round(x), y: Math.round(y), width, height: Math.round(height) };
}

function targetBounds() {
  if (settings.position === 'custom' && settings.customSpot) return customBounds(settings.customSpot);
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const width = settings.width;
  const height = fullHeight(workArea);
  const x = settings.position === 'left'
    ? workArea.x + SCREEN_MARGIN
    : workArea.x + workArea.width - width - SCREEN_MARGIN;
  // Mac: under the menu bar. Windows: just above the taskbar, next to the notification area.
  const y = isWin ? workArea.y + workArea.height - height - SCREEN_MARGIN : workArea.y + SCREEN_MARGIN;
  return { x: Math.round(x), y: Math.round(y), width, height };
}

/** Which way the panel slides in and out: from the nearer side of the screen. */
function slideOffset() {
  if (settings.position === 'custom' && settings.customSpot) {
    const b = customBounds(settings.customSpot);
    const { workArea } = spotDisplay(settings.customSpot);
    return b.x + b.width / 2 < workArea.x + workArea.width / 2 ? -24 : 24;
  }
  return settings.position === 'left' ? -24 : 24;
}

// ---------- Moving the panel (drag its top bar) ----------
// The panel follows the pointer itself, so it works the same on macOS and Windows, and TaskPop
// knows exactly when a drag starts and ends. Where you let go is remembered.

let panelDrag = null; // { x, y, cx, cy, timer }: the panel and the pointer when the drag started
let panelPress = null; // the same, noted when the top bar was pressed

function followPointer() {
  if (!panelDrag || !alive(panel)) return;
  const c = screen.getCursorScreenPoint();
  const x = Math.round(panelDrag.x + c.x - panelDrag.cx);
  const y = Math.round(panelDrag.y + c.y - panelDrag.cy);
  if (x !== panelDrag.lastX || y !== panelDrag.lastY) {
    panelDrag.lastX = x;
    panelDrag.lastY = y;
    panel.setPosition(x, y);
  }
}

function stopFollowing() {
  if (!panelDrag) return null;
  clearInterval(panelDrag.timer);
  const d = panelDrag;
  panelDrag = null;
  return d;
}

function snapSpot(bounds) {
  const display = screen.getDisplayMatching(bounds);
  const wa = display.workArea;
  let { x, y } = bounds;
  const right = wa.x + wa.width;
  const bottom = wa.y + wa.height;
  // Near an edge: line up with it (with the same gap as the corner positions)
  if (Math.abs(x - wa.x) < SNAP_PX) x = wa.x + SCREEN_MARGIN;
  else if (Math.abs(right - (x + bounds.width)) < SNAP_PX) x = right - bounds.width - SCREEN_MARGIN;
  if (Math.abs(y - wa.y) < SNAP_PX) y = wa.y + SCREEN_MARGIN;
  else if (Math.abs(bottom - (y + bounds.height)) < SNAP_PX) y = bottom - bounds.height - SCREEN_MARGIN;
  // Keep it on this screen
  x = clamp(x, wa.x, right - bounds.width);
  y = clamp(y, wa.y, bottom - Math.min(bounds.height, PANEL_MIN_HEIGHT));
  return { displayId: display.id, dx: Math.round(x - wa.x), dy: Math.round(y - wa.y) };
}

ipcMain.on('panel:drag', (event, phase) => {
  if (!fromPanel(event) || !alive(panel) || !isShown) return;
  if (phase === 'press') {
    // Measured from the press, so the first few pixels of the drag aren't lost
    const b = panel.getBounds();
    const c = screen.getCursorScreenPoint();
    panelPress = { x: b.x, y: b.y, cx: c.x, cy: c.y, at: Date.now() };
  } else if (phase === 'start') {
    stopFollowing();
    let from = panelPress && Date.now() - panelPress.at < 10000 ? panelPress : null;
    if (!from) {
      const b = panel.getBounds();
      const c = screen.getCursorScreenPoint();
      from = { x: b.x, y: b.y, cx: c.x, cy: c.y };
    }
    panelPress = null;
    panelDrag = { ...from, lastX: null, lastY: null, timer: setInterval(followPointer, 16) };
    followPointer();
  } else if (phase === 'end' && panelDrag) {
    followPointer(); // to where you let go
    stopFollowing();
    settings.customSpot = snapSpot(panel.getBounds());
    settings.position = 'custom';
    saveSettings();
    broadcastSettings();
    panel.setBounds(targetBounds(), isMac); // settle: snapped, on screen, a height that fits
  } else if (phase === 'cancel' && panelDrag) {
    const d = stopFollowing();
    panel.setPosition(d.x, d.y); // back where it was
  }
});

function fade(from, to, ms, done) {
  clearInterval(fadeTimer);
  const steps = Math.max(1, Math.round(ms / 16));
  let i = 0;
  if (!alive(panel)) return;
  panel.setOpacity(from);
  fadeTimer = setInterval(() => {
    if (!alive(panel)) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      return;
    }
    i += 1;
    panel.setOpacity(from + (to - from) * (i / steps));
    if (i >= steps) {
      clearInterval(fadeTimer);
      fadeTimer = null;
      if (done) done();
    }
  }, 16);
}

// focusInput = true  -> shortcut / double-tap / menu: cursor goes straight into "Add a task"
// focusInput = false -> wake / unlock: panel just appears
function showPanel(focusInput) {
  if (!alive(panel)) return;
  tick();
  const payload = { focusInput, accent: accentColor() };

  if (isShown) {
    panel.show();
    if (focusInput) focusPanel();
    send(panel, 'panel:shown', payload);
    return;
  }

  isShown = true;
  joinAllSpaces(); // (again, in case macOS reset it while the app was hidden)
  unhideApp();
  const target = targetBounds();
  panel.setBounds({ ...target, x: target.x + slideOffset() });
  panel.setOpacity(0);
  panel.show();
  if (focusInput) focusPanel();
  send(panel, 'panel:shown', payload);
  panel.setBounds(target, true);
  fade(0, 1, 200);
}

function focusPanel() {
  panel.focus();
  if (winFocus) winFocus(panel);
}

function hidePanel() {
  if (!alive(panel) || !isShown) return;
  stopFollowing();
  isShown = false;
  holdPanel = false;
  if (updater) updater.clearJustUpdated(); // the "Updated to …" note has been seen
  send(panel, 'panel:hidden');
  const b = panel.getBounds();
  panel.setBounds({ ...b, x: b.x + slideOffset() }, true);
  fade(1, 0, 150, () => {
    if (isShown || !alive(panel)) return;
    panel.hide();
    // Hand focus back to the app you were using (unless Settings is open).
    if (!(alive(settingsWin) && settingsWin.isVisible())) hideApp();
  });
}

// Double-tap, the keyboard shortcut and the Windows tray icon all toggle: an open panel closes,
// whether or not it has keyboard focus. (It may have popped up by itself when the lid opened,
// be pinned while you work in another app, or the system may not have given it focus.)
function togglePanel() {
  if (isShown) hidePanel();
  else showPanel(true);
}

// Keep the panel on screen when displays are added, removed or rearranged.
function refitPanel() {
  if (isShown && alive(panel)) panel.setBounds(targetBounds());
}

// ---------- Settings window ----------

function openSettings(section) {
  unhideApp();
  const focusSection = () => {
    if (typeof section === 'string') send(settingsWin, 'settings:focus', section);
  };
  if (alive(settingsWin)) {
    if (settingsWin.isMinimized()) settingsWin.restore();
    settingsWin.show();
    settingsWin.focus();
    if (winFocus) winFocus(settingsWin);
    app.focus({ steal: true });
    focusSection();
    return;
  }

  settingsWin = new BrowserWindow({
    width: 560,
    height: 720,
    minHeight: 480,
    show: false,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    title: 'TaskPop Settings',
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true, icon: appIconPath() }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1c1e' : '#f2f2f7',
    webPreferences: {
      preload: path.join(__dirname, 'preload-settings.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });

  if (!isMac) settingsWin.setMenu(null);
  settingsWin.loadFile(path.join(__dirname, 'settings.html'));
  lockDown(settingsWin);
  settingsWin.once('ready-to-show', () => {
    settingsWin.show();
    app.focus({ steal: true });
    focusSection();
  });
  // Coming back to Settings after allowing TaskPop in System Settings.
  settingsWin.on('focus', () => send(settingsWin, 'settings:changed', settingsSnapshot()));
  settingsWin.on('closed', () => {
    settingsWin = null;
    registerShortcut(settings.shortcut); // in case a recording was interrupted
    if (!isShown) hideApp();
  });
}

// ---------- First-run tour ----------
// Shown the first time TaskPop runs: how to open it (with a live double-tap test), opening by
// itself, and how the list works. It can be taken again from Settings or the menu.

function openTour(step = 0) {
  if (alive(tourWin)) {
    tourWin.show();
    tourWin.focus();
    send(tourWin, 'tour:go', step);
    return;
  }
  unhideApp();
  tourWin = new BrowserWindow({
    width: 760,
    height: 520,
    show: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    center: true,
    title: 'Welcome to TaskPop',
    ...(isMac ? { titleBarStyle: 'hiddenInset' } : { autoHideMenuBar: true, icon: appIconPath() }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1e1f21' : '#ffffff',
    webPreferences: {
      preload: path.join(__dirname, 'preload-tour.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  const win = tourWin;
  win.tourStep = step;
  if (!isMac) win.setMenu(null);
  win.loadFile(path.join(__dirname, 'tour.html'));
  lockDown(win);
  win.once('ready-to-show', () => {
    win.show();
    app.focus({ steal: true });
    if (winFocus) winFocus(win);
  });
  win.on('closed', () => {
    if (tourWin === win) tourWin = null;
    stopTourKeys();
    if (!meta.tourDone) {
      meta.tourDone = true; // closed with the window button: don't show it again by itself
      saveMeta();
    }
    if (!isShown && !(alive(settingsWin) && settingsWin.isVisible())) hideApp();
  });
}

function tourPayload() {
  return {
    step: alive(tourWin) ? tourWin.tourStep || 0 : 0,
    platform: process.platform,
    keys: DOUBLE_TAP_KEYS,
    settings: {
      doubleTapKey: settings.doubleTapKey,
      shortcut: registeredShortcut ? settings.shortcut : null,
      showOnWake: settings.showOnWake,
      showOnUnlock: settings.showOnUnlock,
    },
    openAtLogin: getOpenAtLogin(),
    store: isStore,
    doubleTap: doubleTapStatus(),
    accent: accentColor(),
  };
}

/** While the tour shows the try-it step: tell it when the chosen key goes down and up. */
function startTourKeys() {
  stopTourKeys();
  if (!keySource) return;
  let last = null;
  tourKeyTimer = setInterval(() => {
    if (!alive(tourWin)) {
      stopTourKeys();
      return;
    }
    let flags = 0;
    try {
      flags = keySource.flags();
    } catch (_) {
      return;
    }
    const mask = KEY_MASKS[settings.doubleTapKey] || 0;
    const down = !!(mask && (flags & mask));
    if (down !== last) {
      last = down;
      send(tourWin, 'tour:key', { down });
    }
  }, 20);
}

function stopTourKeys() {
  clearInterval(tourKeyTimer);
  tourKeyTimer = null;
}

ipcMain.on('settings:show-tour', (event) => {
  if (alive(settingsWin) && event.sender === settingsWin.webContents) openTour(0);
});
ipcMain.handle('tour:get', (event) => (fromTour(event) ? tourPayload() : null));
ipcMain.on('tour:watch-keys', (event, watch) => {
  if (!fromTour(event)) return;
  if (watch) startTourKeys();
  else stopTourKeys();
});
ipcMain.on('tour:restart', (event) => {
  if (!fromTour(event)) return;
  app.relaunch({ args: ['--show-tour=1'] }); // back to the double-tap step after the restart
  app.quit();
});
ipcMain.on('tour:finish', (event, action) => {
  if (!fromTour(event)) return;
  meta.tourDone = true;
  saveMeta();
  const win = tourWin;
  if (action === 'open') showPanel(true);
  else if (action === 'settings') openSettings();
  if (alive(win)) win.close();
});

// ---------- Double-tap trigger ----------

function startDoubleTap() {
  keySource = createKeySource();
  // Mac checks are nearly free, so look more often there: even a very quick tap is never missed.
  doubleTap = new DoubleTapWatcher(keySource, onDoubleTap, isMac ? 15 : 25);
  applyDoubleTapKey();
  if (keySource && keySource.listen) setInterval(retryKeyEvents, 5000);
}

/** Mac: once Input Monitoring is allowed (in the tour or Settings), start listening for key events. */
function retryKeyEvents() {
  if (!doubleTap || !doubleTap.timer || doubleTap.endEvents || doubleTap.events.fallbacks > 0) return;
  if (macAccess() !== true) return;
  doubleTap.startEvents();
  if (doubleTap.endEvents) send(settingsWin, 'settings:changed', settingsSnapshot());
}

function applyDoubleTapKey() {
  if (!doubleTap) return;
  doubleTap.setKey(keySource ? settings.doubleTapKey : 'off');
}

function onDoubleTap() {
  // If macOS is hiding key state, a double-tap can't be detected reliably, so don't act on one.
  if (doubleTapCheck.activity === false) return;
  if (!doubleTapWorked) {
    doubleTapWorked = true;
    doubleTapCheck.flags = true;
    send(settingsWin, 'settings:changed', settingsSnapshot());
  }
  if (!meta.doubleTapUsed) {
    meta.doubleTapUsed = true; // remembered, so a lost Input Monitoring OK can be pointed out later
    saveMeta();
  }
  togglePanel();
  send(tourWin, 'tour:double-tap', { shown: isShown });
}

/**
 * macOS may not let TaskPop read key state until it's allowed under Input Monitoring. The global
 * shortcut is a free test: while it fires, its modifier keys are being held and a key was just pressed.
 */
function verifyKeyAccessWith(accelerator) {
  if (!keySource || !doubleTap || !doubleTap.timer) return;
  const mask = acceleratorMask(accelerator);
  if (!mask) return;
  let flags;
  let activity;
  try {
    flags = keySource.flags();
    activity = keySource.activity();
  } catch (_) {
    return;
  }
  recordFlagCheck((flags & mask) !== 0);
  const before = doubleTap.activityAgo(1500);
  if (before !== null) recordActivityCheck(activity !== before);
}

function recordFlagCheck(ok) {
  const was = doubleTapStatus().status;
  if (ok) {
    doubleTapCheck.flags = true;
    doubleTapCheck.flagMisses = 0;
  } else {
    doubleTapCheck.flagMisses += 1;
    if (doubleTapCheck.flagMisses >= 2) doubleTapCheck.flags = false;
  }
  if (doubleTapStatus().status !== was) send(settingsWin, 'settings:changed', settingsSnapshot());
}

function recordActivityCheck(ok) {
  const was = doubleTapStatus().status;
  if (ok) doubleTapCheck.activity = true;
  else if (doubleTapCheck.activity !== true) doubleTapCheck.activity = false;
  if (doubleTapStatus().status !== was) send(settingsWin, 'settings:changed', settingsSnapshot());
}

function doubleTapStatus() {
  const key = settings.doubleTapKey;
  if (key === 'off') return { key, status: 'off' };
  if (!keySource) return { key, status: 'unavailable' };
  if (doubleTapCheck.flags === false || doubleTapCheck.activity === false) {
    let allowed = null;
    try {
      allowed = keySource.hasAccess();
    } catch (_) {
      // unknown
    }
    return { key, status: 'blocked', allowed };
  }
  // Mac (v1.6.8): the keys can be read, but macOS doesn't recognise TaskPop under Input Monitoring
  // (an update gives it a new signature, and macOS may forget the earlier OK). Then it can't
  // listen for key events and has to fall back on checking, which can miss double-taps.
  if (isMac && keySource.listen && macAccess() === false) return { key, status: 'limited', allowed: false };
  if (doubleTapWorked || (doubleTapCheck.flags && doubleTapCheck.activity)) return { key, status: 'working' };
  return { key, status: 'ready' };
}

function macAccess() {
  try {
    return keySource ? keySource.hasAccess() : null;
  } catch (_) {
    return null;
  }
}

/**
 * Mac: if you've used the double-tap before and macOS no longer recognises TaskPop under Input
 * Monitoring (typically right after an update), say so once for this version, with the way back.
 */
function maybeAskForKeysAgain() {
  if (!isMac || !(meta.doubleTapUsed || launchedAfterUpdate) || settings.doubleTapKey === 'off') return;
  if (doubleTapStatus().status !== 'limited' || meta.keysNoticeFor === app.getVersion()) return;
  if (alive(tourWin) && tourWin.isVisible()) return;
  meta.keysNoticeFor = app.getVersion();
  saveMeta();
  notify({
    title: 'Allow TaskPop again for the double-tap',
    body: 'After the update, macOS needs your OK under Input Monitoring again. Click to see how.',
    onClick: () => openSettings('general'),
  });
}

// Settings sends a probe when you press keys there, to confirm macOS lets TaskPop see them.
ipcMain.on('doubletap:probe', (event, kind) => {
  const fromSettings = alive(settingsWin) && event.sender === settingsWin.webContents;
  if (!(fromSettings || fromTour(event)) || !keySource || !doubleTap || !doubleTap.timer) return;
  try {
    if (Object.prototype.hasOwnProperty.call(KEY_MASKS, kind)) {
      recordFlagCheck((keySource.flags() & KEY_MASKS[kind]) !== 0);
    } else if (kind === 'key') {
      const before = doubleTap.activityAgo(1500);
      if (before !== null) recordActivityCheck(keySource.activity() !== before);
    }
  } catch (_) {
    // ignore
  }
});

/** A short report for bug reports: what the double-tap watcher sees. Counts and timings only. */
function doubleTapReport() {
  const w = doubleTap;
  const status = doubleTapStatus();
  const stats = w ? w.detector.stats : {};
  const ev = w ? w.events : {};
  const ago = (t) => (t ? `${Math.max(0, Math.round((Date.now() - t) / 1000))} s ago` : 'never');
  let access = 'unknown';
  try {
    const allowed = keySource ? keySource.hasAccess() : null;
    if (allowed === true) access = 'yes';
    else if (allowed === false) access = 'no';
  } catch (_) {
    // unknown
  }
  const system = isMac ? `macOS ${process.getSystemVersion()}` : isWin ? `Windows ${os.release()}` : `${process.platform} ${os.release()}`;
  return [
    `TaskPop ${app.getVersion()} double-tap report`,
    `${system} (${process.arch})`,
    `Key: ${settings.doubleTapKey} · status: ${status.status} · listening by: ${w ? w.mode : 'off'}`,
    isMac ? `Input Monitoring allowed: ${access}` : null,
    isMac ? `Key events: ${ev.received || 0} received, last ${ago(ev.lastAt)}, paused ${ev.pauses || 0} times, back to checks ${ev.fallbacks || 0} times` : null,
    `Checks: every ${w ? w.intervalMs : 0} ms, slowest gap in the last minute ${w ? w.slowest.gap : 0} ms`,
    `Taps: ${stats.taps || 0} seen, ${stats.doubleTaps || 0} double-taps, ${stats.withOtherKeys || 0} with another key or click, ${stats.heldTooLong || 0} held too long, ${stats.single || 0} with no second tap in time`,
    `App Nap opt-out: ${w && w.endAwake ? 'on' : 'off'} · screen locked: ${screenLocked ? 'yes' : 'no'}`,
    'Only counts and timings, never which keys were pressed.',
  ].filter(Boolean).join('\n');
}

ipcMain.handle('doubletap:report', async (event) => {
  if (!(alive(settingsWin) && event.sender === settingsWin.webContents)) return null;
  const text = doubleTapReport();
  try {
    await clipboard.writeText(text); // a promise in Electron 44
  } catch (err) {
    console.error('TaskPop: could not copy the report', err);
    return null;
  }
  return text;
});

ipcMain.handle('doubletap:allow', (event) => {
  const fromSettings = alive(settingsWin) && event.sender === settingsWin.webContents;
  if (!(fromSettings || fromTour(event)) || !keySource) return false;
  let granted = false;
  try {
    granted = keySource.requestAccess(); // shows the macOS prompt the first time
  } catch (_) {
    granted = false;
  }
  if (!granted) shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent');
  return granted;
});

ipcMain.on('app:restart', (event) => {
  if (alive(settingsWin) && event.sender === settingsWin.webContents) {
    app.relaunch({ args: ['--show-settings'] });
    app.quit();
  }
});

// ---------- Updates (from TaskPop's GitHub releases) ----------

function startUpdater() {
  Updater.cleanUp(); // files left over from the last update
  const current = app.getVersion();
  updater = createUpdater({
    platform: process.platform,
    managedBy: isStore ? 'store' : null, // Store copies are updated by the Microsoft Store
    currentVersion: current,
    saved: meta.update && typeof meta.update === 'object' ? meta.update : {},
    persist: (data) => {
      meta.update = data;
      saveMeta();
    },
    quit: () => app.quit(),
    relaunch: () => {
      app.relaunch({ args: ['--show'] });
      app.quit();
    },
  });

  // First launch after an update: the panel says so. (1.4 didn't record its version.)
  const previous = meta.lastVersion || (meta.firstRunDone ? '1.4.0' : null);
  if (previous && compareVersions(current, previous) > 0) {
    updater.justUpdated = current;
    launchedAfterUpdate = true;
  }
  if (meta.lastVersion !== current) {
    meta.lastVersion = current;
    saveMeta();
  }

  updater.on('change', (state) => {
    send(panel, 'update:state', state);
    send(settingsWin, 'settings:changed', settingsSnapshot());
    updatePromptFollow(state);
  });
  updater.on('available', ({ version, manual }) => {
    if (manual) return; // you're already looking at it in Settings
    if (maybePromptUpdate()) return;
    if (screenLocked || updatePromptSnoozed(version)) return; // it asks when you're back / when it's time
    notify({
      title: `TaskPop ${version} is available`,
      body: 'Click to see what’s new and update. Your tasks and settings stay as they are.',
      onClick: () => openSettings('updates'),
    });
  });

  if (!updater.supported) return;
  setTimeout(maybeCheckForUpdates, 20 * 1000);
  setInterval(maybeCheckForUpdates, 30 * 60 * 1000);
  setInterval(maybePromptUpdate, PROMPT_TICK_MS); // "Update later" asks again when its time comes
}

// ---------- "New update is here" pop-up ----------
// Shown when a background check finds a new version, and again REMIND_LATER_MS after
// "Update later". It shows the download and install too, so you can follow along.

const REMIND_LATER_MS = 4 * 3600 * 1000;
const PROMPT_TICK_MS = 30 * 1000;
const PROMPT_WIDTH = 420;

/** "Update later" was chosen for this version and its time hasn't come yet. */
function updatePromptSnoozed(version, now = Date.now()) {
  const p = meta.updatePrompt;
  return !!(p && typeof p === 'object' && p.version === version && Number(p.remindAt) > now);
}

function snoozeUpdatePrompt(version) {
  meta.updatePrompt = { version, remindAt: Date.now() + REMIND_LATER_MS };
  saveMeta();
}

/** Shows the pop-up if there's an update you haven't put off. Returns true if it's showing now. */
function maybePromptUpdate() {
  if (!updater || !updater.supported || !settings.autoCheckUpdates) return false;
  if (alive(promptWin)) return true;
  if (screenLocked) return false;
  // Just after start, wait for this session's first check (the saved release may be gone).
  if (updater.checkedAt < startedAt && Date.now() - startedAt < 60 * 1000) return false;
  const u = updater.publicState();
  if (!u.latest || (u.status !== 'available' && u.status !== 'failed')) return false;
  if (updatePromptSnoozed(u.latest.version)) return false;
  try {
    showUpdatePrompt();
    return true;
  } catch (err) {
    console.error('TaskPop: could not show the update pop-up', err);
    return false;
  }
}

function promptPayload() {
  return {
    update: updater ? updater.publicState() : null,
    platform: process.platform,
    accent: accentColor(),
    remindHours: REMIND_LATER_MS / 3600000,
  };
}

function promptPosition(height) {
  const { workArea } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const h = Math.min(height, workArea.height - 40);
  return {
    x: Math.round(workArea.x + (workArea.width - PROMPT_WIDTH) / 2),
    y: Math.round(workArea.y + Math.max(20, (workArea.height - h) * 0.32)),
    width: PROMPT_WIDTH,
    height: h,
  };
}

function showUpdatePrompt() {
  promptWin = new BrowserWindow({
    ...promptPosition(300),
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    hasShadow: true,
    roundedCorners: true,
    title: 'TaskPop update',
    // Mac: a panel shows over full-screen apps and on every desktop, and doesn't take over the
    // app you're in; its buttons work on the first click.
    ...(isMac ? { type: 'panel', acceptFirstMouse: true } : { icon: appIconPath() }),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#2a2a2d' : '#fbfbfd',
    webPreferences: {
      preload: path.join(__dirname, 'preload-update.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  const win = promptWin;
  if (isMac) {
    win.setAlwaysOnTop(true, 'floating');
    try {
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    } catch (_) {
      // older macOS: the panel type covers it
    }
  }
  if (!isMac) win.setMenu(null);
  lockDown(win);
  win.loadFile(path.join(__dirname, 'update-prompt.html'));
  // Show it once it knows its height (or after a moment), without taking the keyboard
  // from what you're typing in.
  let shown = false;
  win.revealPrompt = () => {
    if (shown || !alive(win)) return;
    shown = true;
    win.showInactive();
  };
  setTimeout(() => win.revealPrompt(), 1500);
  win.on('closed', () => {
    if (promptWin === win) promptWin = null;
  });
}

function closeUpdatePrompt(delay = 0) {
  const win = promptWin;
  if (!alive(win)) return;
  const close = () => { if (alive(win)) win.close(); };
  if (delay) setTimeout(close, delay);
  else close();
}

/** Keep the pop-up in step with the updater (download progress, installing, errors). */
function updatePromptFollow(state) {
  if (!alive(promptWin)) return;
  send(promptWin, 'prompt:state', state);
  if (!state.latest || state.status === 'up-to-date') {
    closeUpdatePrompt(); // nothing to install any more
  } else if (state.status === 'installing' && isMac) {
    closeUpdatePrompt(900); // out of the way of the macOS password prompt
  }
}

const fromPrompt = (event) => alive(promptWin) && event.sender === promptWin.webContents;

ipcMain.handle('prompt:get', (event) => (fromPrompt(event) ? promptPayload() : null));
ipcMain.on('prompt:size', (event, height) => {
  if (!fromPrompt(event) || !Number.isFinite(height)) return;
  const h = Math.max(140, Math.min(640, Math.round(height)));
  const b = promptWin.getBounds();
  const target = promptPosition(h);
  // First size: place it. Later sizes: keep it where it is (it may have been dragged).
  promptWin.setBounds(promptWin.isVisible() ? { ...b, height: target.height } : target);
  promptWin.revealPrompt();
});
ipcMain.on('prompt:choose', (event, choice) => {
  if (!fromPrompt(event) || !updater) return;
  const u = updater.publicState();
  if (choice === 'now') {
    updater.install();
  } else if (choice === 'later') {
    if (u.latest) snoozeUpdatePrompt(u.latest.version);
    send(promptWin, 'prompt:snoozed');
    closeUpdatePrompt(2200);
  } else if (choice === 'hide') {
    closeUpdatePrompt(); // the download carries on; the panel and Settings show it
  }
});
ipcMain.on('prompt:open-page', (event) => {
  if (fromPrompt(event) && updater) shell.openExternal(updater.pageUrl());
});

function maybeCheckForUpdates() {
  if (updater && settings.autoCheckUpdates) updater.maybeCheck(UPDATE_EVERY_MS);
}

function checkForUpdatesFromMenu() {
  openSettings('updates');
  if (updater) updater.check({ manual: true });
}

function updateMenuItems() {
  const u = updater ? updater.publicState() : null;
  if (!u || !u.supported) return [];
  if (u.status === 'downloading' || u.status === 'installing') return [{ label: 'Updating TaskPop…', enabled: false }];
  if (u.latest) return [{ label: `Update to ${u.latest.version}…`, click: () => updater.install() }];
  return [{ label: 'Check for Updates…', click: checkForUpdatesFromMenu }];
}

ipcMain.handle('update:check', async (event) => {
  if (!fromUi(event) || !updater) return null;
  return updater.check({ manual: true });
});
ipcMain.on('update:install', (event) => {
  if (fromUi(event) && updater) updater.install();
});
ipcMain.on('update:dismiss', (event, kind) => {
  if (!fromUi(event) || !updater) return;
  const u = updater.publicState();
  if ((kind === 'available' || kind === 'failed') && u.latest) {
    snoozeUpdatePrompt(u.latest.version); // × on the bar = "Update later"
    closeUpdatePrompt();
  }
  updater.dismiss(typeof kind === 'string' ? kind : '');
});
ipcMain.on('update:open-page', (event) => {
  if (fromUi(event) && updater) shell.openExternal(updater.pageUrl());
});

// ---------- Menus ----------

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    {
      label: 'Show Tasks',
      accelerator: registeredShortcut || undefined,
      registerAccelerator: false,
      click: () => showPanel(true),
    },
    { label: 'Settings…', accelerator: 'CommandOrControl+,', registerAccelerator: false, click: () => openSettings() },
    { label: 'Welcome Tour…', click: () => openTour(0) },
    ...updateMenuItems(),
    { type: 'separator' },
    // Store copies start with Windows through a Windows start-up task (Settings > Apps > Startup).
    ...(isStore ? [] : [{
      label: isWin ? 'Start with Windows' : 'Open at Login',
      type: 'checkbox',
      checked: getOpenAtLogin(),
      click: (item) => {
        setOpenAtLogin(item.checked);
        broadcastSettings();
      },
    }, { type: 'separator' }]),
    { label: 'Quit TaskPop', ...(isMac ? { accelerator: 'Command+Q' } : {}), click: () => app.quit() },
  ]);
}

function appIconPath() {
  return path.join(__dirname, 'assets', 'TaskPop.ico');
}

function createTray() {
  let icon;
  if (isMac) {
    icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'trayTemplate.png'));
    icon.setTemplateImage(true);
  } else {
    icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.ico'));
  }
  tray = new Tray(icon);
  tray.setToolTip('TaskPop');
  const openMenu = () => tray.popUpContextMenu(buildTrayMenu());
  if (isMac) {
    tray.on('click', openMenu);
  } else {
    // Windows convention: click the icon to open the app, right-click for the menu.
    tray.on('click', () => {
      // A click on the icon first closes an open panel (it loses focus); don't reopen it.
      if (Date.now() - lastBlurHideAt < 400) return;
      togglePanel();
    });
  }
  tray.on('right-click', openMenu);
  refreshTray();
}

function refreshTray() {
  if (!tray) return;
  const pending = tasks.filter((t) => !t.done).length;
  if (isMac) {
    const title = settings.showCountInMenuBar && pending > 0 ? ` ${pending}` : '';
    tray.setTitle(title, { fontType: 'monospacedDigit' });
  } else {
    const left = pending === 1 ? '1 task left' : `${pending} tasks left`;
    tray.setToolTip(settings.showCountInMenuBar && pending > 0 ? `TaskPop · ${left}` : 'TaskPop');
  }
}

function setAppMenu() {
  if (!isMac) {
    Menu.setApplicationMenu(null); // Windows: no menu bar on TaskPop's windows
    return;
  }
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: 'TaskPop',
      submenu: [
        { role: 'about' },
        { label: 'Check for Updates…', click: checkForUpdatesFromMenu },
        { type: 'separator' },
        { label: 'Settings…', accelerator: 'Command+,', click: () => openSettings() },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    { label: 'Window', submenu: [{ role: 'close' }, { role: 'minimize' }] },
  ]));
}

// ---------- IPC: panel ----------

const fromPanel = (event) => alive(panel) && event.sender === panel.webContents;

ipcMain.handle('panel:get-state', () => ({
  tasks, rev, settings, accent: accentColor(), platform: process.platform, update: updater ? updater.publicState() : null,
}));

ipcMain.on('tasks:save', (event, payload) => {
  if (!fromPanel(event) || !payload) return;
  const incoming = sanitizeTasks(payload.tasks);
  const baseRev = Number(payload.rev) || 0;

  if (baseRev >= rev) {
    tasks = incoming;
    saveTasks();
    refreshTray();
    send(settingsWin, 'settings:changed', settingsSnapshot());
    return;
  }

  // The panel saved on top of an older list. Keep what the app changed since then.
  const current = new Map(tasks.map((t) => [t.id, t]));
  const merged = [];
  const seen = new Set();
  for (const t of incoming) {
    seen.add(t.id);
    if ((removedAt.get(t.id) || 0) > baseRev) continue;
    const mine = current.get(t.id);
    merged.push(mine && (changedAt.get(t.id) || 0) > baseRev ? mine : t);
  }
  for (const t of tasks) {
    if (!seen.has(t.id) && (addedAt.get(t.id) || 0) > baseRev) merged.push(t);
  }
  tasks = merged;
  saveTasks();
  pushTasks();
});

ipcMain.on('panel:hide', (event) => {
  if (fromPanel(event)) hidePanel();
});
ipcMain.on('panel:hold', (event, value) => {
  if (fromPanel(event)) holdPanel = !!value;
});

// Right-click menu on a task
ipcMain.on('task:context-menu', (event, id) => {
  if (!fromPanel(event)) return;
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  const update = (fn) => () => {
    const current = tasks.find((t) => t.id === id);
    if (!current) return;
    fn(current);
    commit({ changed: [id] });
  };
  const at = (daysAhead, hour) => {
    const d = new Date();
    d.setDate(d.getDate() + daysAhead);
    d.setHours(hour, 0, 0, 0);
    return d.getTime();
  };
  const remindAt = (time) => update((t) => {
    t.remindAt = time;
    t.reminded = false;
  });

  const remindItems = [{ label: 'In 1 hour', click: remindAt(Date.now() + 60 * 60 * 1000) }];
  if (new Date().getHours() < 18) remindItems.push({ label: 'This evening (6:00 PM)', click: remindAt(at(0, 18)) });
  remindItems.push({ label: 'Tomorrow morning (9:00 AM)', click: remindAt(at(1, 9)) });
  remindItems.push({ label: 'Pick date & time…', click: () => send(panel, 'task:pick-reminder', id) });
  if (task.remindAt) {
    remindItems.push({ type: 'separator' }, {
      label: 'Remove reminder',
      click: update((t) => {
        t.remindAt = null;
        t.reminded = false;
      }),
    });
  }

  Menu.buildFromTemplate([
    { label: task.done ? 'Mark as not done' : 'Mark as done', click: () => send(panel, 'task:toggle', id) },
    { label: 'Edit', click: () => send(panel, 'task:edit', id) },
    { type: 'separator' },
    { label: 'Important', type: 'checkbox', checked: task.important, click: update((t) => { t.important = !t.important; }) },
    { label: 'Remind me', submenu: remindItems },
    { label: 'Add to Google Calendar…', click: () => send(panel, 'task:calendar', id) },
    {
      label: 'Repeat every day',
      type: 'checkbox',
      checked: task.repeat === 'daily',
      click: update((t) => { t.repeat = t.repeat === 'daily' ? 'none' : 'daily'; }),
    },
    { type: 'separator' },
    { label: 'Copy text', click: () => clipboard.writeText(task.title) },
    { label: 'Delete', click: () => send(panel, 'task:delete', id) },
  ]).popup({ window: panel });
});
ipcMain.on('panel:open-settings', (event) => {
  if (fromPanel(event)) openSettings();
});

// Google Calendar: open the filled-in event page in the browser, and note it on the task.
ipcMain.handle('calendar:open', async (event, raw) => {
  if (!fromPanel(event)) return { ok: false };
  const ev = calendar.cleanEvent(raw);
  if (!ev) return { ok: false, message: 'Please check the date and time.' };
  try {
    await shell.openExternal(calendar.googleCalendarUrl(ev, settings.googleAccount));
  } catch (err) {
    console.error('TaskPop: could not open the browser', err);
    return { ok: false, message: 'Your browser couldn’t be opened.' };
  }
  const task = tasks.find((t) => t.id === raw.id);
  if (task) {
    task.calendarAt = ev.start;
    task.calendarAllDay = ev.allDay;
    if (ev.remind) {
      task.remindAt = ev.allDay ? ev.start + 9 * 3600 * 1000 : ev.start; // all-day: 9 AM that day
      task.reminded = false;
    }
    commit({ changed: [task.id] });
  }
  const minutes = Math.round((ev.end - ev.start) / 60000);
  if (raw.rememberLength === true && !ev.allDay && calendar.LENGTHS.includes(minutes) && settings.calendarDuration !== minutes) {
    settings.calendarDuration = minutes; // the length you picked becomes the default
    saveSettings();
    broadcastSettings();
  }
  return { ok: true };
});
// The panel's settings button stays the way in; this also works from the update bar.
ipcMain.on('panel:open-updates', (event) => {
  if (fromPanel(event)) openSettings('updates');
});

// ---------- IPC: settings ----------

const fromTour = (event) => alive(tourWin) && event.sender === tourWin.webContents;
const fromUi = (event) => fromPanel(event) || (alive(settingsWin) && event.sender === settingsWin.webContents) || fromTour(event);

ipcMain.handle('settings:get', () => settingsSnapshot());

ipcMain.handle('settings:update', async (event, key, value) => {
  if (!fromUi(event)) return settingsSnapshot();
  if (key === 'openAtLogin') {
    setOpenAtLogin(value);
  } else if (key === 'position' && value === 'custom' && !settings.customSpot) {
    // nothing to go back to yet: you put the panel somewhere by dragging its top bar
  } else if (VALIDATORS[key] && VALIDATORS[key](value)) {
    settings[key] = value;
    saveSettings();
    if (key === 'theme') nativeTheme.themeSource = value;
    if (key === 'autoClearCompleted') autoClearCompleted();
    if (key === 'dailySummary' || key === 'dailySummaryTime') {
      // Don't fire immediately if today's summary time has already passed.
      const now = new Date();
      if (now.getTime() >= summaryTimeToday(now)) {
        meta.lastSummaryDay = dayKey(now);
        saveMeta();
      }
    }
    if ((key === 'width' || key === 'position') && isShown) panel.setBounds(targetBounds(), true);
    if (key === 'doubleTapKey') applyDoubleTapKey();
    if (key === 'autoCheckUpdates' && value) maybeCheckForUpdates();
  }
  broadcastSettings();
  return settingsSnapshot();
});

ipcMain.handle('settings:set-shortcut', (event, accelerator) => {
  if (!fromUi(event)) return { ok: false, error: 'Not allowed.' };
  return changeShortcut(accelerator);
});
ipcMain.on('settings:shortcut-pause', (event) => {
  if (fromUi(event)) registerShortcut(null);
});
ipcMain.on('settings:shortcut-resume', (event) => {
  if (fromUi(event)) registerShortcut(settings.shortcut);
});

ipcMain.on('startup:open-settings', (event) => {
  if (fromUi(event)) shell.openExternal('ms-settings:startupapps');
});

ipcMain.on('data:show', (event) => {
  if (fromUi(event)) shell.openPath(realDataDir());
});

ipcMain.handle('notify:test', (event) => {
  if (!fromUi(event)) return { ok: false };
  if (!Notification.isSupported()) return { ok: false, message: 'Notifications are not supported on this computer.' };
  notify({ title: 'TaskPop', body: 'Notifications are working 🎉', onClick: () => showPanel(true) });
  const where = isWin ? 'Windows Settings → System → Notifications' : 'System Settings → Notifications';
  return { ok: true, message: `Test notification sent. If nothing appeared, allow TaskPop in ${where}.` };
});

ipcMain.handle('data:export', async (event) => {
  if (!fromUi(event)) return { canceled: true };
  const stamp = new Date().toISOString().slice(0, 10);
  const { canceled, filePath } = await dialog.showSaveDialog(settingsWin, {
    title: 'Export tasks',
    defaultPath: path.join(app.getPath('documents'), `TaskPop-tasks-${stamp}.json`),
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePath) return { canceled: true };
  try {
    fs.writeFileSync(filePath, JSON.stringify({
      app: 'TaskPop', version: app.getVersion(), exportedAt: new Date().toISOString(), tasks,
    }, null, 2));
    return { ok: true, message: `Exported ${tasks.length} task${tasks.length === 1 ? '' : 's'}.` };
  } catch (err) {
    return { ok: false, message: `Export failed: ${err.message}` };
  }
});

ipcMain.handle('data:import', async (event) => {
  if (!fromUi(event)) return { canceled: true };
  const { canceled, filePaths } = await dialog.showOpenDialog(settingsWin, {
    title: 'Import tasks',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  });
  if (canceled || !filePaths.length) return { canceled: true };
  try {
    const raw = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    const incoming = sanitizeTasks(Array.isArray(raw) ? raw : raw.tasks);
    const existing = new Set(tasks.map((t) => t.id));
    const added = incoming.filter((t) => !existing.has(t.id));
    tasks = tasks.concat(added);
    commit({ added: added.map((t) => t.id) });
    return { ok: true, message: `Imported ${added.length} new task${added.length === 1 ? '' : 's'}.` };
  } catch (err) {
    return { ok: false, message: 'That file is not a valid TaskPop export.' };
  }
});

async function confirm(message, detail, button) {
  const { response } = await dialog.showMessageBox(settingsWin, {
    type: 'warning',
    message,
    detail,
    buttons: [button, 'Cancel'],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
}

ipcMain.handle('data:clear-completed', async (event) => {
  if (!fromUi(event)) return { canceled: true };
  const count = tasks.filter((t) => t.done).length;
  if (!count) return { ok: true, message: 'There are no completed tasks.' };
  if (!(await confirm(`Delete ${count} completed task${count === 1 ? '' : 's'}?`, 'This cannot be undone.', 'Delete'))) {
    return { canceled: true };
  }
  const removed = tasks.filter((t) => t.done).map((t) => t.id);
  tasks = tasks.filter((t) => !t.done);
  commit({ removed });
  return { ok: true, message: `Deleted ${removed.length} completed task${removed.length === 1 ? '' : 's'}.` };
});

ipcMain.handle('data:clear-all', async (event) => {
  if (!fromUi(event)) return { canceled: true };
  if (!tasks.length) return { ok: true, message: 'Your task list is already empty.' };
  if (!(await confirm('Delete all tasks?', 'Tip: export your tasks first if you might need them later. This cannot be undone.', 'Delete All'))) {
    return { canceled: true };
  }
  const removed = tasks.map((t) => t.id);
  tasks = [];
  commit({ removed });
  return { ok: true, message: 'All tasks deleted.' };
});

// ---------- App lifecycle ----------

// Windows: notifications and the Start menu entry are tied to this app ID.
// (Store copies already have an app ID from their package; setting another would break notifications.)
if (isWin && !isStore && typeof app.setAppUserModelId === 'function') app.setAppUserModelId(APP_ID);

/** Windows: make sure the Start menu shortcut carries TaskPop's app ID, so reminders show up. */
function updateStartMenuShortcut() {
  if (!isWin || isStore || !app.isPackaged || typeof shell.writeShortcutLink !== 'function') return;
  const link = path.join(app.getPath('appData'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'TaskPop.lnk');
  if (!fs.existsSync(link)) return; // respect it if you removed it
  try {
    shell.writeShortcutLink(link, 'update', {
      target: process.execPath,
      appUserModelId: APP_ID,
      icon: path.join(path.dirname(process.execPath), 'TaskPop.ico'),
      iconIndex: 0,
      description: 'TaskPop',
    });
  } catch (err) {
    console.error('TaskPop: could not update the Start menu shortcut', err);
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showPanel(true));

  // macOS re-opens a running app when you launch it again: "Hey Siri, open TaskPop", Spotlight,
  // Launchpad or double-clicking it in Applications. Show the tasks when that happens.
  app.on('activate', () => {
    if (readyAt && Date.now() - readyAt > 3000) showPanel(true);
  });

  app.on('before-quit', () => {
    quitting = true;
  });

  app.whenReady().then(() => {
    readyAt = Date.now();
    winFocus = createWinFocus();
    updateStartMenuShortcut();
    if (app.dock) app.dock.hide();
    app.setAboutPanelOptions({
      applicationName: 'TaskPop',
      applicationVersion: app.getVersion(),
      copyright: '© 2026 asmlab',
      credits: 'Developed by asmlab',
    });

    // TaskPop never needs the camera, microphone, location or any other web permission.
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);

    loadAll();
    nativeTheme.themeSource = settings.theme;
    // Windows panel is solid, so it follows light/dark mode itself.
    nativeTheme.on('updated', () => {
      if (!isMac && alive(panel)) panel.setBackgroundColor(panelBackground());
    });
    setAppMenu();
    createPanel();
    createTray();

    if (!registerShortcut(settings.shortcut)) {
      console.error(`TaskPop: could not register ${settings.shortcut}`);
    }
    startDoubleTap();
    startUpdater();
    setTimeout(maybeAskForKeysAgain, 6000);

    powerMonitor.on('suspend', () => {
      screenLocked = true;
      if (doubleTap) doubleTap.stop();
    });
    powerMonitor.on('resume', () => {
      screenLocked = false;
      setTimeout(maybePromptUpdate, 25 * 1000); // after the panel, and after the check below
      applyDoubleTapKey();
      tick();
      if (settings.showOnWake) setTimeout(() => showPanel(false), 1000);
      setTimeout(maybeCheckForUpdates, 15 * 1000); // give the network a moment after waking
    });
    powerMonitor.on('lock-screen', () => {
      screenLocked = true;
      if (doubleTap) doubleTap.stop();
    });
    powerMonitor.on('unlock-screen', () => {
      screenLocked = false;
      setTimeout(maybePromptUpdate, 4000); // a moment after you're back
      applyDoubleTapKey();
      tick();
      if (settings.showOnUnlock) setTimeout(() => showPanel(false), 400);
    });

    screen.on('display-added', refitPanel);
    screen.on('display-removed', refitPanel);
    screen.on('display-metrics-changed', refitPanel);

    tick();
    setInterval(tick, 30 * 1000);

    const firstRun = !meta.firstRunDone;
    if (firstRun) {
      meta.firstRunDone = true;
      saveMeta();
      // Start at login so TaskPop is always running to catch lid-open events.
      if (!isStore) setOpenAtLogin(true); // the Store copy's start-up task is on already
    }

    const tourArg = process.argv.find((a) => a.startsWith('--show-tour'));
    if (process.argv.includes('--show-settings')) {
      openSettings();
    } else if (firstRun || tourArg) {
      // First run: the tour explains how to open TaskPop (it opens the panel at the end).
      const step = tourArg ? Number(tourArg.split('=')[1]) || 0 : 0;
      panel.webContents.once('did-finish-load', () => setTimeout(() => openTour(step), 300));
    } else {
      // Show the panel on first run, after install, or when opened by hand (not right after login).
      const openedByHand = os.uptime() > 300;
      if (firstRun || openedByHand || process.argv.includes('--show')) {
        panel.webContents.once('did-finish-load', () => setTimeout(() => showPanel(true), 300));
      }
    }
  });

  app.on('window-all-closed', () => {
    // Keep running in the menu bar.
  });

  app.on('will-quit', () => {
    if (doubleTap) doubleTap.stop();
    globalShortcut.unregisterAll();
  });
}
