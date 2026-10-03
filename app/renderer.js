const listEl = document.getElementById('list');
const subtitleEl = document.getElementById('subtitle');
const progressEl = document.getElementById('progress');
const barEl = document.getElementById('bar');
const inputEl = document.getElementById('newTask');
const pinBtn = document.getElementById('pinBtn');
const closeBtn = document.getElementById('closeBtn');
const settingsBtn = document.getElementById('settingsBtn');
const undoToast = document.getElementById('undoToast');
const undoText = document.getElementById('undoText');
const undoBtn = document.getElementById('undoBtn');
const updateBar = document.getElementById('updateBar');
const updateIcon = document.getElementById('updateIcon');
const updateText = document.getElementById('updateText');
const updateAction = document.getElementById('updateAction');
const updateClose = document.getElementById('updateClose');
const calSheet = document.getElementById('calSheet');
const calForm = document.getElementById('calForm');
const cal = {
  title: document.getElementById('calTitle'),
  date: document.getElementById('calDate'),
  allDay: document.getElementById('calAllDay'),
  timeRow: document.getElementById('calTimeRow'),
  time: document.getElementById('calTime'),
  length: document.getElementById('calLength'),
  location: document.getElementById('calLocation'),
  notes: document.getElementById('calNotes'),
  meet: document.getElementById('calMeet'),
  repeat: document.getElementById('calRepeat'),
  remind: document.getElementById('calRemind'),
  note: document.getElementById('calNote'),
  open: document.getElementById('calOpen'),
  cancel: document.getElementById('calCancel'),
};

const ICONS = {
  check: '<svg viewBox="0 0 12 12"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  trash: '<svg viewBox="0 0 16 16"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.5h6.6L12 4M6.8 7v4M9.2 7v4"/></svg>',
  star: '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
  bell: '<svg viewBox="0 0 12 12"><path d="M3 8.5V5.5a3 3 0 0 1 6 0v3l1 1H2zM5 10.5a1 1 0 0 0 2 0"/></svg>',
  repeat: '<svg viewBox="0 0 12 12"><path d="M2 5.5V5a2 2 0 0 1 2-2h5.5M8 1.5L9.5 3 8 4.5M10 6.5V7a2 2 0 0 1-2 2H2.5M4 10.5L2.5 9 4 7.5"/></svg>',
  empty: '<svg viewBox="0 0 40 40"><circle cx="20" cy="20" r="17"/><path d="M12.5 20.5l5 5 10-11" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  update: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.4"/><path d="M8 11V5.2M5.6 7.5 8 5.1l2.4 2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  updated: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.4"/><path d="M5.3 8.2 7.2 10l3.5-3.9" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  warn: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.4"/><path d="M8 4.8v3.8M8 11.1v.1" stroke-linecap="round"/></svg>',
  more: '<svg viewBox="0 0 16 16"><circle cx="3.5" cy="8" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="12.5" cy="8" r="1.3"/></svg>',
  calendar: '<svg viewBox="0 0 12 12"><rect x="1.5" y="2.2" width="9" height="8.3" rx="1.6"/><path d="M1.5 4.8h9M4 1.2v2M8 1.2v2"/></svg>',
};

let tasks = [];
let keepOpen = false;
let soundOn = true;
let editingId = null;
let pickerId = null;
let selectedId = null;
let reorder = null; // the task being dragged to a new place (pointer events, see "Drag to reorder")
let renderPending = false; // a re-render waits until the drag ends
let suppressClick = false; // the click that follows a drag must not tick or open anything
let undoSnapshot = null;
let undoTimer = null;
let audioCtx = null;
let knownRev = 0; // which version of the list this panel last received from the app
let platform = 'darwin';
// ⌘ on the Mac, Ctrl on Windows
const primaryKey = (e) => (platform === 'darwin' ? e.metaKey : e.ctrlKey);
let scrollToSelection = false;
let updateState = null; // what the updater reports (new version available, downloading, …)
let calendarId = null; // task shown in the "Add to Google Calendar" pop-up
let calendarDuration = 60; // default event length (minutes), from Settings
let calendarLengthPicked = false; // you changed the length yourself (then it becomes the default)

// ---------- Helpers ----------

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const findTask = (id) => tasks.find((t) => t.id === id);
const isToday = (ts) => ts && new Date(ts).toDateString() === new Date().toDateString();

function save() {
  window.taskpop.saveTasks(tasks, knownRev);
}

function timeLabel(date) {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function dayLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 7) return d.toLocaleDateString('en-US', { weekday: 'long' });
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function reminderLabel(ts) {
  const d = new Date(ts);
  const now = new Date();
  const startOfDay = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(now)) / 86400000);
  if (days === 0) return `Today ${timeLabel(d)}`;
  if (days === 1) return `Tomorrow ${timeLabel(d)}`;
  if (days === -1) return `Yesterday ${timeLabel(d)}`;
  if (days > 1 && days < 7) return `${d.toLocaleDateString('en-US', { weekday: 'short' })} ${timeLabel(d)}`;
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${timeLabel(d)}`;
}

/** Display order: important first, then the rest, then completed. */
function orderedGroups() {
  const pending = tasks.filter((t) => !t.done);
  return {
    pending: [...pending.filter((t) => t.important), ...pending.filter((t) => !t.important)],
    done: tasks.filter((t) => t.done),
  };
}

const visibleOrder = () => {
  const g = orderedGroups();
  return [...g.pending, ...g.done];
};

function getAudio() {
  audioCtx = audioCtx || new AudioContext();
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function playDoneSound() {
  if (!soundOn) return;
  try {
    getAudio();
    const t0 = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, t0);
    osc.frequency.exponentialRampToValueAtTime(1320, t0 + 0.08);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(0.12, t0 + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.28);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.3);
  } catch (_) {
    // Sound is optional.
  }
}

// ---------- Actions ----------

function addTask(rawTitle) {
  let title = rawTitle.trim();
  let important = false;
  if (title.startsWith('!')) {
    important = true;
    title = title.replace(/^!+\s*/, '');
  }
  if (!title) return;
  tasks.push({
    id: newId(), title, done: false, createdAt: Date.now(), completedAt: null,
    important, repeat: 'none', remindAt: null, reminded: false,
  });
  save();
  render();
}

function toggleTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : null;
  if (task.done) playDoneSound();
  save();
  render();
}

function toggleImportant(id) {
  const task = findTask(id);
  if (!task) return;
  task.important = !task.important;
  save();
  render();
}

function renameTask(id, title) {
  const task = findTask(id);
  const trimmed = title.trim();
  if (task && trimmed) task.title = trimmed;
  editingId = null;
  save();
  render();
}

function showUndo(message) {
  undoText.textContent = message;
  undoToast.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(() => {
    undoToast.classList.remove('show');
    undoSnapshot = null;
  }, 6000);
}

function undo() {
  if (!undoSnapshot) return;
  tasks = undoSnapshot;
  undoSnapshot = null;
  undoToast.classList.remove('show');
  save();
  render();
}

function deleteTask(id) {
  const task = findTask(id);
  if (!task) return;
  const order = visibleOrder();
  const idx = order.findIndex((t) => t.id === id);
  undoSnapshot = clone(tasks);
  tasks = tasks.filter((t) => t.id !== id);
  if (selectedId === id) {
    const next = order[idx + 1] || order[idx - 1];
    selectedId = next ? next.id : null;
  }
  save();
  render();
  showUndo('Task deleted');
}

function clearCompleted() {
  const count = tasks.filter((t) => t.done).length;
  if (!count) return;
  undoSnapshot = clone(tasks);
  tasks = tasks.filter((t) => !t.done);
  save();
  render();
  showUndo(`${count} completed task${count === 1 ? '' : 's'} cleared`);
}

function moveTask(fromId, toId, after) {
  if (fromId === toId) return;
  const from = findTask(fromId);
  const to = findTask(toId);
  if (!from || !to || from.done !== to.done) return;
  if (!from.done) from.important = to.important; // dropping into the important group stars it
  tasks = tasks.filter((t) => t.id !== fromId);
  let index = tasks.findIndex((t) => t.id === toId);
  if (after) index += 1;
  tasks.splice(index, 0, from);
  save();
  render();
}

// ---------- Inline editors ----------

function startEditing(task, titleEl) {
  editingId = task.id;
  const field = document.createElement('input');
  field.className = 'title-edit';
  field.value = task.title;
  field.maxLength = 500;
  let finished = false;
  const finish = (commit) => {
    if (finished) return;
    finished = true;
    if (commit) renameTask(task.id, field.value);
    else {
      editingId = null;
      render();
    }
  };
  field.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) finish(true);
    if (e.key === 'Escape') finish(false);
  });
  field.addEventListener('blur', () => finish(true));
  field.addEventListener('click', (e) => e.stopPropagation());
  titleEl.replaceWith(field);
  field.focus();
  field.select();
}

function buildPicker(task) {
  const box = document.createElement('div');
  box.className = 'picker';

  const now = new Date();
  const initial = task.remindAt ? new Date(task.remindAt) : new Date(now.getTime() + 60 * 60 * 1000);
  if (!task.remindAt) initial.setMinutes(0, 0, 0);

  const daySelect = document.createElement('select');
  for (let i = 0; i < 14; i += 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const label = i === 0 ? 'Today' : i === 1 ? 'Tomorrow'
      : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    daySelect.add(new Option(label, String(i)));
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const initialDay = new Date(initial.getFullYear(), initial.getMonth(), initial.getDate()).getTime();
  daySelect.value = String(Math.min(13, Math.max(0, Math.round((initialDay - startOfToday) / 86400000))));

  const timeSelect = document.createElement('select');
  for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
    const d = new Date(2000, 0, 1, Math.floor(minutes / 60), minutes % 60);
    timeSelect.add(new Option(timeLabel(d), String(minutes)));
  }
  const initialMinutes = initial.getHours() * 60 + Math.round(initial.getMinutes() / 15) * 15;
  timeSelect.value = String(Math.min(initialMinutes, 24 * 60 - 15));

  const setBtn = document.createElement('button');
  setBtn.textContent = 'Set reminder';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Cancel';

  const close = () => {
    pickerId = null;
    window.taskpop.hold(false);
    render();
  };
  setBtn.addEventListener('click', () => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(daySelect.value));
    const minutes = Number(timeSelect.value);
    d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
    const current = findTask(task.id);
    if (current) {
      current.remindAt = d.getTime();
      current.reminded = false;
      save();
    }
    close();
  });
  cancelBtn.addEventListener('click', close);
  box.addEventListener('click', (e) => e.stopPropagation());
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
  });

  box.append(daySelect, timeSelect, setBtn, cancelBtn);
  return box;
}

function openPicker(id) {
  if (!findTask(id)) return;
  pickerId = id;
  window.taskpop.hold(true);
  render();
}

// ---------- Rendering ----------

/** Highlight a row without rebuilding the list (keeps double-click working). */
function selectRow(id) {
  selectedId = id;
  listEl.querySelectorAll('.row').forEach((r) => r.classList.toggle('selected', r.dataset.id === id));
}

function rowElement(task) {
  const row = document.createElement('div');
  row.className = 'row'
    + (task.done ? ' done' : '')
    + (task.important ? ' important' : '')
    + (task.id === selectedId ? ' selected' : '');
  row.dataset.id = task.id;

  const check = document.createElement('button');
  check.className = 'check';
  check.title = task.done ? 'Mark as not done' : 'Mark as done';
  check.innerHTML = ICONS.check;
  check.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleTask(task.id);
  });

  const col = document.createElement('div');
  col.className = 'content-col';

  const title = document.createElement('div');
  title.className = 'title';
  title.title = 'Double-click to edit · right-click for more';
  title.textContent = task.title;
  title.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startEditing(task, title);
  });
  col.append(title);

  const chips = [];
  if (task.remindAt && !task.done) {
    const overdue = task.remindAt <= Date.now();
    const chip = document.createElement('span');
    chip.className = 'chip' + (overdue ? ' overdue' : task.remindAt - Date.now() < 3600000 ? ' soon' : '');
    chip.innerHTML = ICONS.bell;
    chip.append(document.createTextNode(`${overdue ? 'Overdue · ' : ''}${reminderLabel(task.remindAt)}`));
    chip.title = 'Reminder — click to change';
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openPicker(task.id);
    });
    chips.push(chip);
  }
  if (task.repeat === 'daily') {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = ICONS.repeat;
    chip.append(document.createTextNode('Every day'));
    chips.push(chip);
  }
  if (task.calendarAt && !task.done) {
    const chip = document.createElement('span');
    chip.className = 'chip cal';
    chip.innerHTML = ICONS.calendar;
    chip.append(document.createTextNode(task.calendarAllDay ? dayLabel(task.calendarAt) : reminderLabel(task.calendarAt)));
    chip.title = 'Sent to Google Calendar — click to add it again';
    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      openCalendar(task.id);
    });
    chips.push(chip);
  }
  if (chips.length) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    meta.append(...chips);
    col.append(meta);
  }

  const star = document.createElement('button');
  star.className = 'star';
  star.title = task.important ? 'Remove from important' : 'Mark as important';
  star.innerHTML = ICONS.star;
  star.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleImportant(task.id);
  });

  const more = document.createElement('button');
  more.className = 'more';
  more.title = 'More: Google Calendar, reminders, repeat…';
  more.innerHTML = ICONS.more;
  more.addEventListener('click', (e) => {
    e.stopPropagation();
    selectRow(task.id);
    window.taskpop.showTaskMenu(task.id);
  });

  const del = document.createElement('button');
  del.className = 'delete';
  del.title = 'Delete';
  del.innerHTML = ICONS.trash;
  del.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteTask(task.id);
  });

  row.append(check, col, star, more, del);

  row.addEventListener('click', () => selectRow(task.id));
  row.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    selectRow(task.id);
    window.taskpop.showTaskMenu(task.id);
  });

  return row;
}

function render() {
  if (reorder && reorder.active) {
    renderPending = true;
    return;
  }
  renderPending = false;
  const { pending, done } = orderedGroups();
  const doneToday = done.filter((t) => isToday(t.completedAt)).length;

  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  let status = 'Nothing yet';
  if (tasks.length && !pending.length) status = 'All done 🎉';
  else if (pending.length) status = `${pending.length} left`;
  if (doneToday && pending.length) status += ` · ${doneToday} done today`;
  subtitleEl.textContent = `${date} · ${status}`;

  progressEl.classList.toggle('hidden', tasks.length === 0);
  barEl.style.width = tasks.length ? `${(done.length / tasks.length) * 100}%` : '0';

  pinBtn.classList.toggle('active', keepOpen);
  pinBtn.title = keepOpen ? 'Unpin (hide when clicking outside)' : 'Keep open';

  if (selectedId && !findTask(selectedId)) selectedId = null;

  listEl.replaceChildren();

  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `${ICONS.empty}<strong>No tasks yet</strong><span>Type below and press Return</span>
      <p class="tips">Start a task with <b>!</b> to mark it important.<br>Click <b>⋯</b> on a task for reminders, Google Calendar and more.</p>`;
    listEl.append(empty);
    return;
  }

  const addRow = (t) => {
    listEl.append(rowElement(t));
    if (t.id === pickerId) listEl.append(buildPicker(t));
  };

  pending.forEach(addRow);

  if (done.length) {
    const section = document.createElement('div');
    section.className = 'section' + (pending.length ? '' : ' first');
    const label = document.createElement('span');
    label.textContent = `Completed · ${done.length}`;
    const clear = document.createElement('button');
    clear.textContent = 'Clear';
    clear.addEventListener('click', clearCompleted);
    section.append(label, clear);
    listEl.append(section);
    done.forEach(addRow);
  }

  if (scrollToSelection) {
    scrollToSelection = false;
    const selectedEl = selectedId && listEl.querySelector(`.row[data-id="${CSS.escape(selectedId)}"]`);
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  }
}

// ---------- Update bar ----------

let updateMode = null;

function updateModeFor(u) {
  if (!u || !u.supported) return null;
  if (u.status === 'downloading' || u.status === 'installing') return u.status;
  if (u.latest && u.status === 'failed') return 'failed';
  if (u.latest && u.status === 'available' && !u.dismissed) return 'available';
  if (u.justUpdated) return 'done';
  return null;
}

function renderUpdate() {
  const u = updateState;
  updateMode = updateModeFor(u);
  updateBar.hidden = !updateMode;
  if (!updateMode) return;
  updateBar.className = `update-bar ${updateMode}`;
  updateIcon.innerHTML = updateMode === 'done' ? ICONS.updated : updateMode === 'failed' ? ICONS.warn : ICONS.update;

  const v = u.latest ? u.latest.version : u.justUpdated;
  const line = (strong, small) => {
    const b = document.createElement('b');
    b.textContent = strong;
    const parts = [b];
    if (small) {
      const s = document.createElement('small');
      s.textContent = small;
      parts.push(s);
    }
    return parts;
  };
  let parts;
  let action = '';
  let closable = true;
  if (updateMode === 'available') {
    parts = line(`TaskPop ${v} is available`, 'See what’s new');
    action = 'Update';
  } else if (updateMode === 'downloading') {
    const pct = Math.round((u.progress || 0) * 100);
    parts = line(`Downloading update… ${pct}%`);
    const meter = document.createElement('div');
    meter.className = 'update-meter';
    const fill = document.createElement('i');
    fill.style.width = `${pct}%`;
    meter.append(fill);
    parts.push(meter);
    closable = false;
  } else if (updateMode === 'installing') {
    parts = line('Installing update…', platform === 'darwin' ? 'Enter your Mac password if asked.' : 'TaskPop will close and reopen.');
    closable = false;
  } else if (updateMode === 'failed') {
    parts = line('Update didn’t finish', u.message || 'Please try again.');
    action = 'Try again';
  } else {
    parts = line(`Updated to TaskPop ${v}`, 'Your tasks and settings are all here.');
  }
  updateText.replaceChildren(...parts);
  updateAction.hidden = !action;
  updateAction.textContent = action;
  updateClose.hidden = !closable;
}

function applyAccent(accent) {
  if (accent) document.documentElement.style.setProperty('--accent', accent);
}

function applySettings(settings) {
  if (!settings) return;
  keepOpen = !!settings.keepOpen;
  soundOn = settings.completionSound !== false;
  if (Number.isFinite(settings.calendarDuration)) calendarDuration = settings.calendarDuration;
}

// ---------- Add to Google Calendar ----------

const pad2 = (n) => String(n).padStart(2, '0');
const LENGTHS = [15, 30, 45, 60, 90, 120, 180];
const lengthLabel = (min) => {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} hour${h === 1 ? '' : 's'}`;
};

function showTimeRow() {
  cal.timeRow.hidden = cal.allDay.checked;
}

function openCalendar(id) {
  const task = findTask(id);
  if (!task) return;
  if (pickerId) {
    pickerId = null;
    render();
  }
  calendarId = id;
  window.taskpop.hold(true);
  const s = window.TaskPopWhen.suggest({
    title: task.title,
    remindAt: task.calendarAt || task.remindAt,
    now: new Date(),
    defaultMinutes: calendarDuration,
    locale: navigator.language,
  });
  const allDay = task.calendarAt ? !!task.calendarAllDay : s.allDay;
  const start = new Date(s.start);
  cal.title.value = s.title;
  cal.date.value = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}-${pad2(start.getDate())}`;
  cal.allDay.checked = allDay;
  cal.time.value = allDay ? '09:00' : `${pad2(start.getHours())}:${pad2(start.getMinutes())}`;
  const lengths = LENGTHS.includes(s.durationMin) ? LENGTHS : [...LENGTHS, s.durationMin].sort((a, b) => a - b);
  cal.length.replaceChildren(...lengths.map((m) => new Option(lengthLabel(m), String(m))));
  cal.length.value = String(s.durationMin);
  calendarLengthPicked = false;
  cal.location.value = '';
  cal.notes.value = '';
  cal.meet.checked = false;
  cal.repeat.checked = task.repeat === 'daily';
  cal.remind.checked = false;
  cal.note.textContent = 'Opens Google Calendar in your browser with this filled in. Check it there and click Save.';
  cal.note.classList.remove('warn');
  cal.open.disabled = false;
  showTimeRow();
  calSheet.hidden = false;
  setTimeout(() => {
    cal.title.focus();
    cal.title.setSelectionRange(cal.title.value.length, cal.title.value.length);
  }, 30);
}

function closeCalendar() {
  if (calendarId === null) return;
  calendarId = null;
  calSheet.hidden = true;
  window.taskpop.hold(false);
}

function calendarError(message) {
  cal.note.textContent = message;
  cal.note.classList.add('warn');
}

async function submitCalendar() {
  if (calendarId === null || cal.open.disabled) return;
  const title = cal.title.value.trim();
  if (!title) {
    calendarError('Please give the event a title.');
    cal.title.focus();
    return;
  }
  const [y, mo, d] = cal.date.value.split('-').map(Number);
  if (!y || !mo || !d) {
    calendarError('Please pick a date.');
    cal.date.focus();
    return;
  }
  const allDay = cal.allDay.checked;
  let start;
  let end;
  if (allDay) {
    start = new Date(y, mo - 1, d).getTime();
    end = start;
  } else {
    const [h, mi] = (cal.time.value || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(mi)) {
      calendarError('Please pick a start time.');
      cal.time.focus();
      return;
    }
    start = new Date(y, mo - 1, d, h, mi).getTime();
    end = start + Number(cal.length.value) * 60000;
  }
  cal.open.disabled = true;
  const result = await window.taskpop.openCalendar({
    id: calendarId,
    title,
    start,
    end,
    allDay,
    location: cal.location.value,
    details: cal.notes.value,
    meet: cal.meet.checked,
    repeatDaily: cal.repeat.checked,
    remind: cal.remind.checked,
    rememberLength: calendarLengthPicked,
  });
  if (result && result.ok) {
    closeCalendar();
  } else {
    cal.open.disabled = false;
    calendarError((result && result.message) || 'Something went wrong. Please try again.');
  }
}

cal.allDay.addEventListener('change', showTimeRow);
cal.length.addEventListener('change', () => { calendarLengthPicked = true; });
cal.cancel.addEventListener('click', closeCalendar);
calForm.addEventListener('submit', (e) => {
  e.preventDefault();
  submitCalendar();
});
calForm.addEventListener('keydown', (e) => {
  e.stopPropagation();
  if (e.key === 'Escape') {
    e.preventDefault();
    closeCalendar();
  } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    submitCalendar(); // also from the Notes box
  }
});
calSheet.addEventListener('mousedown', (e) => {
  if (e.target === calSheet) closeCalendar(); // click outside the card
});

// ---------- Drag to reorder ----------
// Uses pointer events instead of HTML5 drag-and-drop. On Windows the system drag loop sends
// few hover updates and loses the drop when it lands on a gap, the "Completed" header or a
// row of the other group, so some drags did nothing. Here the panel follows the pointer
// itself: wherever you let go, the task lands at the marked spot within its own group.

const DRAG_START_PX = 5; // move this far with the button down before it counts as a drag
const EDGE_PX = 28; // dragging this close to the top or bottom of the list scrolls it

const rowById = (id) => listEl.querySelector(`.row[data-id="${CSS.escape(id)}"]`);

function clearDropMarks() {
  listEl.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
}

/** Where the dragged task would land for a pointer at height y: next to the nearest row of its own group. */
function reorderTarget(y) {
  const dragged = findTask(reorder.id);
  if (!dragged) return null;
  const rows = [...listEl.querySelectorAll('.row')].filter((r) => {
    const t = findTask(r.dataset.id);
    return t && t.done === dragged.done;
  });
  let best = null;
  let bestDistance = Infinity;
  for (const r of rows) {
    const rect = r.getBoundingClientRect();
    const distance = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    if (distance < bestDistance) {
      best = { el: r, rect };
      bestDistance = distance;
    }
  }
  if (!best || best.el.dataset.id === dragged.id) return null; // still over its own place
  return { id: best.el.dataset.id, after: y > best.rect.top + best.rect.height / 2, el: best.el };
}

function updateReorder() {
  if (!reorder || !reorder.active) return;
  const target = reorderTarget(reorder.lastY);
  clearDropMarks();
  if (target) target.el.classList.add(target.after ? 'drop-after' : 'drop-before');
  reorder.target = target && { id: target.id, after: target.after };
  showDropLine(target);
  if (reorder.ghost) reorder.ghost.style.transform = `translateY(${reorder.lastY - reorder.startY}px)`;
}

/** The blue line where the task will land, drawn above the dragged copy so it's never hidden. */
function showDropLine(target) {
  let line = reorder.line;
  if (!target) {
    if (line) line.hidden = true;
    return;
  }
  if (!line) {
    line = document.createElement('div');
    line.className = 'drop-line';
    document.body.append(line);
    reorder.line = line;
  }
  const rect = target.el.getBoundingClientRect();
  const box = listEl.getBoundingClientRect();
  const y = Math.max(box.top, Math.min(box.bottom, target.after ? rect.bottom : rect.top));
  line.hidden = false;
  Object.assign(line.style, { left: `${rect.left + 6}px`, width: `${rect.width - 12}px`, top: `${Math.round(y) - 1}px` });
}

function autoScrollTick() {
  if (!reorder || !reorder.active) return;
  const rect = listEl.getBoundingClientRect();
  let dy = 0;
  if (reorder.lastY < rect.top + EDGE_PX) dy = -Math.min(12, Math.ceil((rect.top + EDGE_PX - reorder.lastY) / 3));
  else if (reorder.lastY > rect.bottom - EDGE_PX) dy = Math.min(12, Math.ceil((reorder.lastY - rect.bottom + EDGE_PX) / 3));
  if (dy) {
    const before = listEl.scrollTop;
    listEl.scrollTop += dy;
    if (listEl.scrollTop !== before) updateReorder();
  }
  reorder.frame = requestAnimationFrame(autoScrollTick);
}

function startReorder() {
  reorder.active = true;
  try {
    listEl.setPointerCapture(reorder.pointerId); // keep getting moves and the release, wherever the pointer goes
  } catch (err) {
    // the button was already released; the next move or release ends the drag
  }
  const row = rowById(reorder.id);
  selectRow(reorder.id);
  if (row) {
    const rect = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.remove('selected');
    ghost.classList.add('drag-ghost');
    ghost.removeAttribute('data-id');
    Object.assign(ghost.style, { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px` });
    document.body.append(ghost);
    reorder.ghost = ghost;
    row.classList.add('dragging');
  }
  document.body.classList.add('reordering');
  reorder.frame = requestAnimationFrame(autoScrollTick);
}

/** Finish a drag: drop the task at the marked spot (apply) or put everything back (cancel). */
function endReorder(apply) {
  const r = reorder;
  if (!r) return;
  reorder = null;
  if (!r.active) return;
  cancelAnimationFrame(r.frame);
  try {
    if (listEl.hasPointerCapture(r.pointerId)) listEl.releasePointerCapture(r.pointerId);
  } catch (err) {
    // already released
  }
  if (r.ghost) r.ghost.remove();
  if (r.line) r.line.remove();
  clearDropMarks();
  listEl.querySelectorAll('.row.dragging').forEach((row) => row.classList.remove('dragging'));
  document.body.classList.remove('reordering');
  suppressClick = true; // the click that ends a drag isn't a click on a task
  setTimeout(() => { suppressClick = false; }, 0);
  if (apply && r.target && findTask(r.id)) {
    selectedId = r.id;
    moveTask(r.id, r.target.id, r.target.after);
  }
  if (renderPending) render();
}

listEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.pointerType === 'touch') return; // touch keeps scrolling the list
  if (reorder) endReorder(false);
  if (editingId || pickerId || calendarId !== null) return;
  const row = e.target.closest('.row');
  if (!row || !listEl.contains(row) || e.target.closest('input, textarea, select')) return;
  reorder = { id: row.dataset.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastY: e.clientY, active: false, target: null };
});

// Moves and the release are heard on the whole page, not just the list: until the drag starts
// (and the list captures the pointer) a quick flick can put the first move that counts above
// or below the list, and the drag would never start.
document.addEventListener('pointermove', (e) => {
  if (!reorder || e.pointerId !== reorder.pointerId) return;
  if (!(e.buttons & 1)) {
    endReorder(true); // the release happened somewhere we didn't hear about
    return;
  }
  reorder.lastY = e.clientY;
  if (!reorder.active) {
    if (Math.hypot(e.clientX - reorder.startX, e.clientY - reorder.startY) < DRAG_START_PX) return;
    if (editingId || pickerId || calendarId !== null) {
      reorder = null;
      return;
    }
    startReorder();
  }
  e.preventDefault();
  updateReorder();
});

document.addEventListener('pointerup', (e) => {
  if (!reorder || e.pointerId !== reorder.pointerId) return;
  if (reorder.active) reorder.lastY = e.clientY;
  updateReorder();
  endReorder(true);
});
document.addEventListener('pointercancel', (e) => {
  if (reorder && e.pointerId === reorder.pointerId) endReorder(false);
});
listEl.addEventListener('lostpointercapture', (e) => {
  if (reorder && reorder.active && e.pointerId === reorder.pointerId) endReorder(false);
});
listEl.addEventListener('dragstart', (e) => e.preventDefault()); // no native drag of text or icons
window.addEventListener('blur', () => {
  endReorder(false);
  if (move) endMove('end');
});
document.addEventListener('click', (e) => {
  if (!suppressClick) return;
  suppressClick = false;
  e.preventDefault();
  e.stopPropagation();
}, true);

/** ⌥↑ / ⌥↓ (Alt on Windows): move the selected task one place up or down in its group. */
function moveSelectedBy(step) {
  const task = selectedId && findTask(selectedId);
  if (!task) return;
  const group = visibleOrder().filter((t) => t.done === task.done);
  const next = group[group.findIndex((t) => t.id === task.id) + step];
  if (!next) return;
  scrollToSelection = true;
  moveTask(task.id, next.id, step > 0);
}

// ---------- Moving the panel ----------
// Drag the top bar (not its buttons) to put the panel anywhere. This page only says when a drag
// starts and ends; while it lasts, the app moves the window to follow the mouse pointer itself
// (so stray mouse events while the window moves can't make it jump or stop), and remembers
// where you let go.

const MOVE_START_PX = 3;
let move = null; // { pointerId, x, y, active }
const headerEl = document.querySelector('header');

function endMove(phase) {
  const m = move;
  move = null;
  document.body.classList.remove('moving');
  if (!m) return;
  try {
    if (headerEl.hasPointerCapture(m.pointerId)) headerEl.releasePointerCapture(m.pointerId);
  } catch (err) {
    // already released
  }
  if (m.active) window.taskpop.drag(phase);
}

headerEl.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button')) return;
  move = { pointerId: e.pointerId, x: e.screenX, y: e.screenY, active: false };
  window.taskpop.drag('press'); // the app notes where the panel and the pointer are now
  try {
    headerEl.setPointerCapture(e.pointerId);
  } catch (err) {
    // fine: the window follows the pointer, so its events still arrive
  }
});
document.addEventListener('pointermove', (e) => {
  if (!move || move.active || e.pointerId !== move.pointerId || !(e.buttons & 1)) return;
  if (Math.hypot(e.screenX - move.x, e.screenY - move.y) < MOVE_START_PX) return; // still a click
  move.active = true;
  document.body.classList.add('moving');
  window.taskpop.drag('start');
}, true);
document.addEventListener('pointerup', (e) => {
  if (move && e.pointerId === move.pointerId) endMove('end');
}, true);
document.addEventListener('pointercancel', () => { if (move) endMove('end'); }, true);

// ---------- Keyboard ----------

function moveSelection(step) {
  const order = visibleOrder();
  if (!order.length) return;
  let idx = order.findIndex((t) => t.id === selectedId);
  if (idx === -1) idx = step > 0 ? -1 : order.length;
  idx += step;
  if (idx >= order.length) {
    selectedId = null;
    render();
    inputEl.focus();
    return;
  }
  selectedId = order[Math.max(0, idx)].id;
  scrollToSelection = true;
  render();
}

inputEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.isComposing) {
    addTask(inputEl.value);
    inputEl.value = '';
  } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !inputEl.value) {
    e.preventDefault();
    inputEl.blur();
    const order = visibleOrder();
    if (order.length) {
      selectedId = (e.key === 'ArrowUp' ? order[order.length - 1] : order[0]).id;
      scrollToSelection = true;
      render();
    }
  }
});

document.addEventListener('keydown', (e) => {
  if (move && move.active) {
    if (e.key === 'Escape') endMove('cancel'); // put it back where it was
    e.preventDefault();
    return;
  }
  if (reorder && reorder.active) {
    if (e.key === 'Escape') endReorder(false);
    e.preventDefault();
    return;
  }
  if (primaryKey(e) && e.key === ',') {
    e.preventDefault();
    window.taskpop.openSettings();
    return;
  }
  const active = document.activeElement;
  const typing = ['INPUT', 'SELECT', 'TEXTAREA'].includes(active.tagName);
  // Space and Return on a focused button press that button; don't also act on the selected task.
  if (active.tagName === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
  if (calendarId !== null) return; // the calendar pop-up handles its own keys
  if (e.key === 'Escape' && !editingId && !pickerId) {
    window.taskpop.hide();
    return;
  }
  if (typing) return;

  if (primaryKey(e) && e.key.toLowerCase() === 'z') {
    e.preventDefault();
    undo();
    return;
  }
  if (e.altKey && !e.metaKey && !e.ctrlKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    e.preventDefault();
    moveSelectedBy(e.key === 'ArrowUp' ? -1 : 1);
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault();
      moveSelection(1);
      break;
    case 'ArrowUp':
      e.preventDefault();
      moveSelection(-1);
      break;
    case ' ':
      if (selectedId) {
        e.preventDefault();
        toggleTask(selectedId);
      }
      break;
    case 'Enter':
      if (selectedId) {
        e.preventDefault();
        const titleEl = listEl.querySelector(`.row[data-id="${CSS.escape(selectedId)}"] .title`);
        if (titleEl) startEditing(findTask(selectedId), titleEl);
      }
      break;
    case 'Backspace':
    case 'Delete':
      if (selectedId) {
        e.preventDefault();
        deleteTask(selectedId);
      }
      break;
    case 'i':
      if (selectedId) toggleImportant(selectedId);
      break;
    case 'g':
      if (selectedId) {
        e.preventDefault();
        openCalendar(selectedId);
      }
      break;
    case 'n':
    case '/':
      e.preventDefault();
      selectedId = null;
      render();
      inputEl.focus();
      break;
    default:
  }
});

// ---------- Buttons & main-process events ----------

undoBtn.addEventListener('click', undo);

pinBtn.addEventListener('click', () => {
  keepOpen = !keepOpen;
  window.taskpop.updateSetting('keepOpen', keepOpen);
  render();
});

settingsBtn.addEventListener('click', () => window.taskpop.openSettings());
updateAction.addEventListener('click', () => {
  if (updateMode === 'available' || updateMode === 'failed') window.taskpop.installUpdate();
});
updateClose.addEventListener('click', () => window.taskpop.dismissUpdate(updateMode));
updateText.addEventListener('click', () => {
  if (updateMode !== 'done') window.taskpop.openUpdates();
});
window.taskpop.onUpdateState((state) => {
  updateState = state;
  renderUpdate();
});
closeBtn.addEventListener('click', () => window.taskpop.hide());

window.taskpop.onShown(({ focusInput, accent }) => {
  applyAccent(accent);
  if (!editingId && !pickerId) render(); // refreshes the date and reminder labels
  if (focusInput) setTimeout(() => inputEl.focus(), 30);
  else inputEl.blur();
});

window.taskpop.onTasksReplaced((payload) => {
  tasks = Array.isArray(payload && payload.tasks) ? payload.tasks : [];
  knownRev = Number(payload && payload.rev) || knownRev;
  if (pickerId && !findTask(pickerId)) {
    pickerId = null;
    window.taskpop.hold(false);
  }
  if (calendarId !== null && !findTask(calendarId)) closeCalendar();
  // Keep an edit or the reminder picker open; the list refreshes when you finish.
  if (!editingId && !pickerId) render();
});

window.taskpop.onHidden(() => {
  endReorder(false);
  closeCalendar();
  if (pickerId) {
    pickerId = null;
    window.taskpop.hold(false);
    render();
  }
});

window.taskpop.onSettingsChanged((settings) => {
  applySettings(settings);
  if (!editingId && !pickerId) render();
});

window.taskpop.onToggleTask((id) => toggleTask(id));
window.taskpop.onDeleteTask((id) => deleteTask(id));
window.taskpop.onPickReminder((id) => openPicker(id));
window.taskpop.onCalendarTask((id) => openCalendar(id));
window.taskpop.onEditTask((id) => {
  const titleEl = listEl.querySelector(`.row[data-id="${CSS.escape(id)}"] .title`);
  const task = findTask(id);
  if (titleEl && task) startEditing(task, titleEl);
});

// Keep reminder labels ("Overdue", "Today 6:00 PM") fresh while the panel is open.
setInterval(() => {
  if (!editingId && !pickerId && !reorder && document.visibilityState === 'visible') render();
}, 60 * 1000);

window.taskpop.getState().then((state) => {
  platform = state.platform || 'darwin';
  document.documentElement.classList.add(`platform-${platform}`);
  if (platform !== 'darwin') settingsBtn.title = 'Settings (Ctrl+,)';
  tasks = Array.isArray(state.tasks) ? state.tasks : [];
  knownRev = Number(state.rev) || 0;
  applySettings(state.settings);
  applyAccent(state.accent);
  updateState = state.update || null;
  renderUpdate();
  render();
});
