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
  timer: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6.8" r="4.3"/><path d="M6 4.4v2.5l1.6 1M4.7 1.2h2.6M9.6 3.1l.8-.8"/></svg>',
  plus: '<svg viewBox="0 0 12 12"><path d="M6 2.2v7.6M2.2 6h7.6"/></svg>',
};

// v1.8: categories
const tagsEl = document.getElementById('tags');
const sortCard = document.getElementById('sortCard');
const sortEls = {
  count: document.getElementById('sortCount'),
  intro: document.getElementById('sortIntro'),
  task: document.getElementById('sortTask'),
  choices: document.getElementById('sortChoices'),
  skip: document.getElementById('sortSkip'),
  later: document.getElementById('sortLater'),
  meter: document.getElementById('sortMeter'),
};
const CAT_COLORS = {
  blue: '#2f7cf6', orange: '#ff9500', green: '#34c759', purple: '#af52de', pink: '#ff2d55', teal: '#30b0c7', yellow: '#f2b600', gray: '#8e8e93',
};
const MAX_CATEGORIES = 30;

let tasks = [];
let keepOpen = false;
let soundOn = true;
let editingId = null;
let pickerId = null;
let pickerKind = 'reminder'; // which picker is open under the task: 'reminder' or 'timer'
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
let categories = []; // [{ id, name, color }], in the order of the tags
let currentCat = 'all'; // the tag you're looking at: 'all', 'none' (Unsorted) or a category id
let tagEdit = null; // naming a category in the tag row: { id: 'new' or the category's id, forTask }
let sorting = null; // "Sort your tasks": { queue, pos, total, intro, back, adding }

// ---------- Helpers ----------

function newId() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now()) + Math.random().toString(16).slice(2);
}

const clone = (value) => JSON.parse(JSON.stringify(value));
const findTask = (id) => tasks.find((t) => t.id === id);
const isToday = (ts) => ts && new Date(ts).toDateString() === new Date().toDateString();

function save() {
  window.taskpop.saveTasks(tasks, knownRev, categories);
}

const snapshot = () => ({ tasks: clone(tasks), categories: clone(categories) });

// ---------- Categories (v1.8) ----------
// Tags along the top: All, your categories, Unsorted (tasks in none, when there are any) and +.
// The list shows the tag you pick; new tasks go into it.

const findCat = (id) => categories.find((c) => c.id === id);
/** The task's category, or null when it's in none (or in one that's gone). */
const catOf = (task) => (task && task.category && findCat(task.category)) || null;
/** A task still to sort: in no category, and not finished (a daily one comes back, so it counts). */
const needsSort = (t) => !catOf(t) && (!t.done || t.repeat === 'daily');
const cleanName = (s) => String(s || '').trim().replace(/\s+/g, ' ').slice(0, 30);
const squash = (s) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

function inView(task, view = currentCat) {
  if (view === 'all') return true;
  if (view === 'none') return !catOf(task);
  return task.category === view && !!findCat(view);
}

const showUnsorted = () => categories.length > 0 && (currentCat === 'none' || tasks.some(needsSort));
const views = () => ['all', ...categories.map((c) => c.id), ...(showUnsorted() ? ['none'] : [])];

/** Back to All when the tag you were on is gone (deleted, or Unsorted with nothing left in it). */
function fixView() {
  if (currentCat === 'none' && (!categories.length || !tasks.some((t) => !catOf(t)))) currentCat = 'all';
  else if (currentCat !== 'all' && currentCat !== 'none' && !findCat(currentCat)) currentCat = 'all';
}

function selectCat(view, again = false) {
  // (picking the tag you're on does nothing, so a double-click on it can rename it)
  if ((view === currentCat && !again) || !views().includes(view)) return;
  currentCat = view;
  if (selectedId && !inView(findTask(selectedId) || {})) selectedId = null;
  if (pickerId) {
    pickerId = null;
    window.taskpop.hold(false);
  }
  listEl.scrollTop = 0;
  render();
  const tag = tagsEl.querySelector(`.tag[data-cat="${CSS.escape(view)}"]`);
  if (tag) revealTag(tag);
}

/** ← / →: the tag before or after the one you're on. */
function stepCat(step) {
  const all = views();
  const next = all[all.indexOf(currentCat) + step];
  if (next) selectCat(next);
}

function nextColor() {
  const used = new Set(categories.map((c) => c.color));
  const names = Object.keys(CAT_COLORS);
  return names.find((c) => !used.has(c)) || names[categories.length % names.length];
}

/** A new category (or the one you already have with that name). */
function addCategory(rawName) {
  const name = cleanName(rawName);
  if (!name) return null;
  const same = categories.find((c) => c.name.toLowerCase() === name.toLowerCase());
  if (same) return same;
  if (categories.length >= MAX_CATEGORIES) return null;
  const cat = { id: newId(), name, color: nextColor() };
  categories.push(cat);
  return cat;
}

function deleteCategory(id) {
  const cat = findCat(id);
  if (!cat) return;
  undoSnapshot = snapshot();
  const moved = tasks.filter((t) => t.category === id);
  moved.forEach((t) => { t.category = null; });
  categories = categories.filter((c) => c.id !== id);
  save();
  render();
  showUndo(moved.length
    ? `Deleted “${cat.name}”. Its ${moved.length === 1 ? 'task is' : `${moved.length} tasks are`} in Unsorted.`
    : `Deleted “${cat.name}”`);
}

function moveCategory(id, step) {
  const i = categories.findIndex((c) => c.id === id);
  const j = i + step;
  if (i === -1 || j < 0 || j >= categories.length) return;
  [categories[i], categories[j]] = [categories[j], categories[i]];
  save();
  render();
}

/** Put a task into a category (null: Unsorted), with Undo. */
function moveTaskTo(id, catId) {
  const task = findTask(id);
  const cat = catId ? findCat(catId) : null;
  if (!task || (catId && !cat)) return;
  const was = catOf(task);
  if ((was ? was.id : null) === (cat ? cat.id : null)) return;
  undoSnapshot = snapshot();
  task.category = cat ? cat.id : null;
  if (selectedId === id && !inView(task)) selectedId = null; // it left the tag you're on
  save();
  render();
  showUndo(`Moved to ${cat ? cat.name : 'Unsorted'}`);
}

/** "Buy milk #personal": the category named after the #, and the title without it. */
function hashCategory(title) {
  const re = /(^|\s)#([^\s#]+)/g;
  let m;
  while ((m = re.exec(title))) {
    const word = squash(m[2]);
    const cat = word && categories.find((c) => squash(c.name) === word);
    if (cat) {
      const at = m.index + m[1].length;
      return { cat, title: `${title.slice(0, at)}${title.slice(at + 1 + m[2].length)}`.replace(/\s{2,}/g, ' ').trim() };
    }
  }
  return null;
}

function revealTag(tag) {
  const pad = 28; // clear of the faded edge
  const left = tag.offsetLeft - pad;
  const right = tag.offsetLeft + tag.offsetWidth + pad;
  let to = null;
  if (left < tagsEl.scrollLeft) to = Math.max(0, left);
  else if (right > tagsEl.scrollLeft + tagsEl.clientWidth) to = right - tagsEl.clientWidth;
  if (to !== null) tagsEl.scrollTo({ left: to, behavior: 'smooth' });
}

function updateTagFades() {
  const max = tagsEl.scrollWidth - tagsEl.clientWidth;
  tagsEl.classList.toggle('fade-left', tagsEl.scrollLeft > 1);
  tagsEl.classList.toggle('fade-right', tagsEl.scrollLeft < max - 1);
}

function dotEl(color) {
  const dot = document.createElement('i');
  dot.className = 'dot';
  dot.style.setProperty('--c', CAT_COLORS[color] || CAT_COLORS.gray);
  return dot;
}

function tagButton(view, name, color) {
  const tag = document.createElement('button');
  tag.className = 'tag' + (view === currentCat ? ' on' : '') + (view === 'none' ? ' unsorted' : '');
  tag.dataset.cat = view;
  if (color) tag.append(dotEl(color));
  const label = document.createElement('span');
  label.textContent = name;
  tag.append(label);
  const pending = tasks.filter((t) => !t.done && inView(t, view)).length;
  if (pending) {
    const count = document.createElement('small');
    count.textContent = String(pending);
    tag.append(count);
  }
  if (view === 'none') tag.title = 'Tasks in no category — right-click to sort them';
  else if (view !== 'all') tag.title = `${name} — double-click to rename, right-click for more`;
  return tag;
}

/** The box for naming a new category, or renaming one, in place of its tag. */
function tagInput(cat) {
  const field = document.createElement('input');
  field.className = 'tag-input';
  field.maxLength = 30;
  field.placeholder = 'New category';
  field.spellcheck = false;
  field.value = cat ? cat.name : '';
  const fit = () => { field.style.width = `${Math.max(9, Math.min(22, field.value.length + 2))}ch`; };
  fit();
  let finished = false;
  const finish = (keep) => {
    if (finished) return;
    const edit = tagEdit;
    const name = cleanName(field.value);
    if (keep && name && cat && categories.some((c) => c.id !== cat.id && c.name.toLowerCase() === name.toLowerCase())) {
      field.classList.remove('taken');
      void field.offsetWidth; // restart the shake
      field.classList.add('taken'); // another category has that name
      field.title = 'You already have a category with that name';
      return;
    }
    finished = true;
    tagEdit = null;
    const renamed = keep && name && cat && findCat(cat.id);
    if (renamed) {
      renamed.name = name;
      save();
      render();
    } else if (keep && name && !cat) {
      const made = addCategory(name);
      if (made) save();
      if (made && edit.forTask) {
        render();
        moveTaskTo(edit.forTask, made.id); // from the task's Move to › New category…
      } else if (made) {
        selectCat(made.id, true); // a new, empty category: type its first task
        inputEl.focus();
      } else render();
    } else render();
  };
  field.addEventListener('input', () => {
    field.classList.remove('taken');
    fit();
  });
  field.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter' && !e.isComposing) finish(true);
    if (e.key === 'Escape') finish(false);
  });
  field.addEventListener('blur', () => finish(true));
  field.addEventListener('click', (e) => e.stopPropagation());
  return field;
}

function startTagEdit(id, forTask = null) {
  if (id === 'new' && categories.length >= MAX_CATEGORIES) return;
  if (id !== 'new' && !findCat(id)) return;
  tagEdit = { id, forTask };
  renderTags(true);
  const field = tagsEl.querySelector('.tag-input');
  if (field) {
    revealTag(field);
    field.focus();
    field.select();
  }
}

function renderTags(force = false) {
  if (!force && tagEdit && tagsEl.querySelector('.tag-input')) return; // don't disturb the name you're typing
  const scroll = tagsEl.scrollLeft;
  const items = [tagButton('all', 'All')];
  for (const c of categories) items.push(tagEdit && tagEdit.id === c.id ? tagInput(c) : tagButton(c.id, c.name, c.color));
  if (showUnsorted()) items.push(tagButton('none', 'Unsorted'));
  if (tagEdit && tagEdit.id === 'new') {
    items.push(tagInput(null));
  } else if (categories.length < MAX_CATEGORIES) {
    const add = document.createElement('button');
    add.className = 'tag add';
    add.title = 'New category';
    add.innerHTML = ICONS.plus;
    items.push(add);
  }
  tagsEl.replaceChildren(...items);
  tagsEl.scrollLeft = scroll;
  updateTagFades();
}

tagsEl.addEventListener('click', (e) => {
  const tag = e.target.closest('.tag');
  if (!tag) return;
  if (tag.classList.contains('add')) startTagEdit('new');
  else selectCat(tag.dataset.cat);
});
tagsEl.addEventListener('dblclick', (e) => {
  const tag = e.target.closest('.tag[data-cat]');
  if (tag && findCat(tag.dataset.cat)) startTagEdit(tag.dataset.cat);
});
tagsEl.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  const tag = e.target.closest('.tag[data-cat]');
  if (tag && tag.dataset.cat !== 'all') window.taskpop.showCategoryMenu(tag.dataset.cat);
});
// A mouse wheel scrolls the tags sideways
tagsEl.addEventListener('wheel', (e) => {
  if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
  tagsEl.scrollLeft += e.deltaY;
  e.preventDefault();
}, { passive: false });
tagsEl.addEventListener('scroll', updateTagFades);
// Clicking a tag doesn't take the keyboard focus (from "Add a task", or from the list's keys)
tagsEl.addEventListener('mousedown', (e) => {
  if (e.target.closest('.tag')) e.preventDefault();
});
sortCard.addEventListener('mousedown', (e) => {
  if (e.target.closest('button')) e.preventDefault();
});
window.addEventListener('resize', updateTagFades);

// ---------- Sort your tasks (v1.8) ----------
// After updating, the tasks you already had are in no category. This card goes through them one
// at a time: pick a category, Skip, or "Do the rest later" (they wait under Unsorted).

/** Unsorted tasks in the order the list shows them. */
function sortQueue() {
  const need = tasks.filter(needsSort);
  const open = need.filter((t) => !t.done);
  return [...open.filter((t) => t.important), ...open.filter((t) => !t.important), ...need.filter((t) => t.done)].map((t) => t.id);
}

function startSorting(intro = false) {
  const queue = sortQueue();
  if (!queue.length || !categories.length) {
    if (intro) window.taskpop.sortDone();
    return;
  }
  sorting = { queue, pos: 0, total: queue.length, intro, back: currentCat === 'none' ? 'all' : currentCat, adding: false };
  if (!intro && document.activeElement === inputEl && !inputEl.value) inputEl.blur(); // so 1–9 pick
  currentCat = 'none';
  selectedId = null;
  listEl.scrollTop = 0;
  render();
  const tag = tagsEl.querySelector('.tag.on');
  if (tag) revealTag(tag);
}

/** The task the card asks about (passing over any finished, sorted or deleted meanwhile). */
function sortingTask() {
  while (sorting && sorting.pos < sorting.queue.length) {
    const t = findTask(sorting.queue[sorting.pos]);
    if (t && needsSort(t)) return t;
    sorting.pos += 1;
  }
  return null;
}

function sortPick(catId) {
  const task = sortingTask();
  if (!task || !findCat(catId)) return;
  task.category = catId;
  sorting.pos += 1;
  sorting.adding = false;
  save();
  render();
}

function sortSkip() {
  if (!sortingTask()) return;
  sorting.pos += 1;
  sorting.adding = false;
  render();
}

function finishSorting(later = false) {
  const s = sorting;
  if (!s) return;
  sorting = null;
  if (s.intro) window.taskpop.sortDone();
  const left = tasks.filter(needsSort).length;
  currentCat = later || !left ? s.back : 'none';
  fixView();
  render();
  if (later) hideToast();
  else showUndo(left ? `${left} task${left === 1 ? '' : 's'} left in Unsorted` : 'All sorted 🎉', false);
}

function renderSort() {
  const task = sorting && sortingTask();
  sortCard.hidden = !task;
  if (!task) return;
  const naming = sortEls.choices.querySelector('.sort-new');
  if (sorting.adding && naming && document.activeElement === naming) return; // you're naming a new category
  sortEls.intro.hidden = !sorting.intro;
  sortEls.count.textContent = `${Math.min(sorting.pos + 1, sorting.total)} of ${sorting.total}`;
  sortEls.task.textContent = task.title;
  sortEls.task.classList.toggle('important', !!task.important);
  sortEls.meter.style.width = `${(sorting.pos / sorting.total) * 100}%`;
  const choices = categories.map((c, i) => {
    const b = document.createElement('button');
    b.className = 'tag sort-choice';
    b.dataset.cat = c.id;
    b.append(dotEl(c.color), Object.assign(document.createElement('span'), { textContent: c.name }));
    if (i < 9) b.title = `${c.name} (${i + 1})`;
    b.addEventListener('click', () => sortPick(c.id));
    return b;
  });
  if (sorting.adding) {
    const field = document.createElement('input');
    field.className = 'tag-input sort-new';
    field.maxLength = 30;
    field.placeholder = 'New category';
    field.spellcheck = false;
    const done = (keep) => {
      if (!sorting || !sorting.adding) return;
      sorting.adding = false;
      const made = keep && cleanName(field.value) ? addCategory(field.value) : null;
      if (made) sortPick(made.id); // saves
      else render();
    };
    field.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter' && !e.isComposing) done(true);
      if (e.key === 'Escape') done(false);
    });
    field.addEventListener('blur', () => done(true));
    choices.push(field);
  } else if (categories.length < MAX_CATEGORIES) {
    const add = document.createElement('button');
    add.className = 'tag add sort-add';
    add.innerHTML = `${ICONS.plus}<span>New</span>`;
    add.title = 'Put it in a new category';
    add.addEventListener('click', () => {
      sorting.adding = true;
      render();
      const field = sortEls.choices.querySelector('.sort-new');
      if (field) field.focus();
    });
    choices.push(add);
  }
  sortEls.choices.replaceChildren(...choices);
}

sortEls.skip.addEventListener('click', sortSkip);
sortEls.later.addEventListener('click', () => finishSorting(true));

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

// ---------- Timers (v1.7) ----------
// A time frame to finish a task in: it counts down beside the task, which is highlighted and
// moved to the top as important. The app shows "Time's up" when it runs out.

/** "2d", "1d 5h", "4h 12m", "1h", or "23:41" under an hour (minutes:seconds). */
function durationLabel(ms, withSeconds = true) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const sec = total % 60;
  if (d) return h ? `${d}d ${h}h` : `${d}d`;
  if (h) return m ? `${h}h ${m}m` : `${h}h`;
  if (withSeconds) return `${m}:${String(sec).padStart(2, '0')}`;
  return `${Math.max(1, m)}m`;
}

/** 'running', 'soon' (the last 10 minutes, or the last fifth of a short timer) or 'over'. */
function timerState(task, now) {
  const left = task.timerEnd - now;
  if (left <= 0) return 'over';
  const total = Math.max(1, task.timerEnd - task.timerStart);
  return left <= Math.min(10 * 60 * 1000, total * 0.2) ? 'soon' : 'running';
}

function countdownText(task, now) {
  const left = task.timerEnd - now;
  if (left > 0) return `${durationLabel(left)} left`;
  const over = now - task.timerEnd;
  return over < 60 * 1000 ? 'Time’s up' : `${durationLabel(over, false)} over`;
}

/** Bring a row's countdown, colour and progress line up to date (every second while open). */
function paintTimer(row, task, now) {
  const state = timerState(task, now);
  for (const s of ['running', 'soon', 'over']) row.classList.toggle(`timer-${s}`, s === state);
  const label = row.querySelector('.countdown span');
  if (label) label.textContent = countdownText(task, now);
  const bar = row.querySelector('.timer-bar');
  if (bar) {
    const total = Math.max(1, task.timerEnd - task.timerStart);
    bar.style.transform = `scaleX(${Math.min(1, Math.max(0, (task.timerEnd - now) / total)).toFixed(4)})`;
  }
}

function updateCountdowns() {
  const now = Date.now();
  listEl.querySelectorAll('.row.timed').forEach((row) => {
    const task = findTask(row.dataset.id);
    if (task && task.timerEnd && !task.done) paintTimer(row, task, now);
  });
}

function setTimer(task, minutes) {
  const now = Date.now();
  task.timerStart = now;
  task.timerEnd = now + minutes * 60 * 1000;
  task.timerNotified = false;
  if (!task.important) {
    task.important = true;
    task.timerStarred = true;
  }
  tasks = [task, ...tasks.filter((t) => t !== task)]; // to the top of the list
}

function removeTimer(task) {
  Object.assign(task, { timerStart: null, timerEnd: null, timerNotified: false });
  if (task.timerStarred) task.important = false;
  task.timerStarred = false;
}

/** Display order for the tag you're on: important first, then the rest, then completed. */
function orderedGroups() {
  const shown = tasks.filter((t) => inView(t));
  const pending = shown.filter((t) => !t.done);
  return {
    pending: [...pending.filter((t) => t.important), ...pending.filter((t) => !t.important)],
    done: shown.filter((t) => t.done),
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
  // Into the category you're looking at, or the one named with # ("Buy milk #personal")
  let category = findCat(currentCat) ? currentCat : null;
  const tagged = hashCategory(title);
  if (tagged && tagged.title) {
    category = tagged.cat.id;
    title = tagged.title;
  }
  if (!title) return;
  const task = {
    id: newId(), title, done: false, createdAt: Date.now(), completedAt: null,
    important, repeat: 'none', remindAt: null, reminded: false,
    timerStart: null, timerEnd: null, timerNotified: false, timerStarred: false, category,
  };
  tasks.push(task);
  save();
  render();
  if (!inView(task)) showUndo(`Added to ${tagged.cat.name}`, false);
}

function toggleTask(id) {
  const task = findTask(id);
  if (!task) return;
  task.done = !task.done;
  task.completedAt = task.done ? Date.now() : null;
  // Back on the list: a timer that has already run out doesn't say so again
  if (!task.done && task.timerEnd) task.timerNotified = task.timerEnd <= Date.now();
  if (task.done) playDoneSound();
  save();
  render();
}

function toggleImportant(id) {
  const task = findTask(id);
  if (!task) return;
  task.important = !task.important;
  task.timerStarred = false; // your choice now, whatever the timer does
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

/** The message at the bottom, with Undo (or, with canUndo false, just the message). */
function showUndo(message, canUndo = true) {
  undoText.textContent = message;
  undoBtn.hidden = !canUndo;
  if (!canUndo) undoSnapshot = null;
  undoToast.classList.add('show');
  clearTimeout(undoTimer);
  undoTimer = setTimeout(hideToast, canUndo ? 6000 : 3500);
}

function hideToast() {
  clearTimeout(undoTimer);
  undoToast.classList.remove('show');
  undoSnapshot = null;
}

function undo() {
  if (!undoSnapshot) return;
  tasks = undoSnapshot.tasks;
  categories = undoSnapshot.categories;
  hideToast();
  save();
  render();
}

function deleteTask(id) {
  const task = findTask(id);
  if (!task) return;
  const order = visibleOrder();
  const idx = order.findIndex((t) => t.id === id);
  undoSnapshot = snapshot();
  tasks = tasks.filter((t) => t.id !== id);
  if (selectedId === id) {
    const next = order[idx + 1] || order[idx - 1];
    selectedId = next ? next.id : null;
  }
  save();
  render();
  showUndo('Task deleted');
}

/** "Clear" on the Completed list: the finished tasks you can see (under the tag you're on). */
function clearCompleted() {
  const cleared = new Set(orderedGroups().done.map((t) => t.id));
  const count = cleared.size;
  if (!count) return;
  undoSnapshot = snapshot();
  tasks = tasks.filter((t) => !cleared.has(t.id));
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

function openPicker(id, kind = 'reminder') {
  const task = findTask(id);
  if (!task || (kind === 'timer' && task.done)) return;
  pickerId = id;
  pickerKind = kind;
  window.taskpop.hold(true);
  render();
  if (kind === 'timer') {
    const field = listEl.querySelector('.timer-picker select[data-unit="hours"]');
    if (field) field.focus();
  }
}

/** "Finish in [days] [hours] [minutes]": a custom timer, or a change to the running one. */
function buildTimerPicker(task) {
  const box = document.createElement('div');
  box.className = 'picker timer-picker';
  const label = document.createElement('span');
  label.className = 'picker-label';
  label.textContent = 'Finish in';

  const now = Date.now();
  const running = task.timerEnd && task.timerEnd > now;
  // Starts at what's left (rounded up to 5 minutes), or 1 hour
  const start = running ? Math.ceil((task.timerEnd - now) / (5 * 60 * 1000)) * 5 : 60;
  const select = (unit, values, text, value) => {
    const field = document.createElement('select');
    field.dataset.unit = unit;
    for (const v of values) field.add(new Option(text(v), String(v)));
    field.value = String(value);
    return field;
  };
  const range = (from, to, step = 1) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const days = select('days', range(0, 30), (v) => `${v} day${v === 1 ? '' : 's'}`, Math.min(30, Math.floor(start / 1440)));
  const hours = select('hours', range(0, 23), (v) => `${v} hr`, Math.floor((start % 1440) / 60));
  const minutes = select('minutes', range(0, 55, 5), (v) => `${v} min`, start % 60);
  const chosen = () => Number(days.value) * 1440 + Number(hours.value) * 60 + Number(minutes.value);

  const setBtn = document.createElement('button');
  setBtn.textContent = task.timerEnd ? 'Change timer' : 'Start timer';
  const refresh = () => { setBtn.disabled = chosen() === 0; };
  [days, hours, minutes].forEach((field) => field.addEventListener('change', refresh));
  refresh();
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'secondary';
  cancelBtn.textContent = 'Cancel';

  const close = () => {
    pickerId = null;
    window.taskpop.hold(false);
    render();
  };
  const apply = () => {
    const current = findTask(task.id);
    if (current && !current.done && chosen() > 0) {
      setTimer(current, chosen());
      selectedId = current.id;
      scrollToSelection = true;
      save();
    }
    close();
  };
  setBtn.addEventListener('click', apply);
  cancelBtn.addEventListener('click', close);
  box.addEventListener('click', (e) => e.stopPropagation());
  box.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && e.target.tagName === 'SELECT') {
      e.preventDefault();
      apply();
    }
  });

  box.append(label, days, hours, minutes, setBtn);
  if (task.timerEnd) {
    const removeBtn = document.createElement('button');
    removeBtn.className = 'secondary';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      const current = findTask(task.id);
      if (current) {
        removeTimer(current);
        save();
      }
      close();
    });
    box.append(removeBtn);
  }
  box.append(cancelBtn);
  return box;
}

// ---------- Rendering ----------

/** Highlight a row without rebuilding the list (keeps double-click working). */
function selectRow(id) {
  selectedId = id;
  listEl.querySelectorAll('.row').forEach((r) => r.classList.toggle('selected', r.dataset.id === id));
}

function rowElement(task) {
  const row = document.createElement('div');
  const timed = !!task.timerEnd && !task.done;
  row.className = 'row'
    + (task.done ? ' done' : '')
    + (task.important ? ' important' : '')
    + (timed ? ' timed' : '')
    + (task.id === selectedId ? ' selected' : '')
    + (sorting && sorting.queue[sorting.pos] === task.id ? ' sorting-now' : '');
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
  const cat = currentCat === 'all' && catOf(task);
  if (cat) {
    // Under All, which category it's in, after the title (click to go there)
    const label = document.createElement('span');
    label.className = 'cat-label';
    label.append(dotEl(cat.color), document.createTextNode(cat.name));
    label.title = `In ${cat.name} — click to show only ${cat.name}`;
    label.addEventListener('click', (e) => {
      e.stopPropagation();
      selectCat(cat.id);
    });
    label.addEventListener('dblclick', (e) => e.stopPropagation());
    title.append(label);
  }
  title.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    startEditing(task, title);
  });
  col.append(title);

  if (timed) {
    // Under the title: the countdown, and a line that shrinks as the time runs out
    const line = document.createElement('div');
    line.className = 'timer-line';
    const countdown = document.createElement('button');
    countdown.className = 'countdown';
    countdown.innerHTML = ICONS.timer;
    countdown.append(document.createElement('span'));
    countdown.title = `Finish by ${reminderLabel(task.timerEnd)} — click to change`;
    countdown.addEventListener('click', (e) => {
      e.stopPropagation();
      selectRow(task.id);
      openPicker(task.id, 'timer');
    });
    const track = document.createElement('span');
    track.className = 'timer-track';
    const bar = document.createElement('i');
    bar.className = 'timer-bar';
    track.append(bar);
    line.append(countdown, track);
    col.append(line);
  }

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
  if (task.done && task.timerEnd && task.completedAt) {
    // How it went against the timer
    const spare = task.timerEnd - task.completedAt;
    const chip = document.createElement('span');
    chip.className = 'chip' + (spare >= 0 ? ' timer-done' : '');
    chip.innerHTML = ICONS.timer;
    chip.append(document.createTextNode(spare >= 60 * 1000 ? `${durationLabel(spare, false)} early`
      : spare >= 0 ? 'Just in time' : `${durationLabel(-spare, false)} late`));
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
  more.title = 'More: move to a category, timer, reminders, Google Calendar…';
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
  if (timed) paintTimer(row, task, Date.now());

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
  if (sorting && !sortingTask()) {
    finishSorting(); // that was the last one; it renders again
    return;
  }
  fixView();
  const { pending, done } = orderedGroups();
  const shown = pending.length + done.length;
  const doneToday = done.filter((t) => isToday(t.completedAt)).length;

  // The date, and how many are left (under the tag you're on)
  const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  let status = 'Nothing yet';
  if (shown && !pending.length) status = 'All done 🎉';
  else if (pending.length) status = `${pending.length} left`;
  if (doneToday && pending.length) status += ` · ${doneToday} done today`;
  subtitleEl.textContent = `${date} · ${status}`;

  progressEl.classList.toggle('hidden', shown === 0);
  barEl.style.width = shown ? `${(done.length / shown) * 100}%` : '0';

  pinBtn.classList.toggle('active', keepOpen);
  pinBtn.title = keepOpen ? 'Unpin (hide when clicking outside)' : 'Keep open';

  const cat = findCat(currentCat);
  inputEl.placeholder = cat ? `Add to ${cat.name}…` : 'Add a task…';
  renderTags();
  renderSort();

  if (selectedId && !findTask(selectedId)) selectedId = null;

  listEl.replaceChildren();

  if (!tasks.length) {
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `${ICONS.empty}<strong>No tasks yet</strong><span>Type below and press Return</span>
      <p class="tips">Start a task with <b>!</b> to mark it important.<br>Click <b>⋯</b> on a task for a timer, reminders, Google Calendar and more.</p>`;
    listEl.append(empty);
    return;
  }

  if (!shown) {
    // A category with nothing in it yet
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.innerHTML = `${ICONS.empty}<strong></strong><span>Type below and press Return to add one</span>`;
    empty.querySelector('strong').textContent = `Nothing in ${cat ? cat.name : 'here'} yet`;
    listEl.append(empty);
    return;
  }

  if (currentCat === 'none' && !sorting && tasks.some(needsSort)) {
    // Unsorted: offer to go through them one by one
    const hint = document.createElement('div');
    hint.className = 'sort-hint';
    const text = document.createElement('span');
    text.textContent = 'These tasks aren’t in a category yet.';
    const go = document.createElement('button');
    go.textContent = 'Sort them';
    go.addEventListener('click', () => startSorting());
    hint.append(text, go);
    listEl.append(hint);
  }

  const addRow = (t) => {
    listEl.append(rowElement(t));
    if (t.id === pickerId) listEl.append(pickerKind === 'timer' ? buildTimerPicker(t) : buildPicker(t));
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
  const sortingEl = sorting && listEl.querySelector('.row.sorting-now');
  if (sortingEl) sortingEl.scrollIntoView({ block: 'nearest' });
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

/** v1.8: a category tag under the pointer that the dragged task could go into. */
function tagUnder(x, y) {
  const el = Number.isFinite(x) && document.elementFromPoint(x, y);
  const tag = el && el.closest('#tags .tag[data-cat]');
  if (!tag || tag.dataset.cat === 'all') return null;
  const task = findTask(reorder.id);
  const now = catOf(task);
  return tag.dataset.cat === (now ? now.id : 'none') ? null : tag; // already in it
}

function updateReorder() {
  if (!reorder || !reorder.active) return;
  // Over a category tag: drop it in there
  const tag = tagUnder(reorder.lastX, reorder.lastY);
  tagsEl.querySelectorAll('.drop-into').forEach((t) => { if (t !== tag) t.classList.remove('drop-into'); });
  reorder.dropCat = tag ? tag.dataset.cat : null;
  if (reorder.ghost) reorder.ghost.classList.toggle('over-tag', !!tag);
  if (tag) {
    tag.classList.add('drop-into');
    clearDropMarks();
    reorder.target = null;
    showDropLine(null);
    // the dragged copy waits just under the tags, so you can see which one lights up
    if (reorder.ghost) reorder.ghost.style.transform = `translateY(${tagsEl.getBoundingClientRect().bottom + 4 - parseFloat(reorder.ghost.style.top)}px) scale(0.94)`;
    return;
  }
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
  const tags = tagsEl.getBoundingClientRect();
  if (reorder.lastY >= tags.top && reorder.lastY <= tags.bottom) {
    // Over the tags: near either end, they scroll sideways to show more
    const dx = reorder.lastX < tags.left + EDGE_PX ? -8 : reorder.lastX > tags.right - EDGE_PX ? 8 : 0;
    const before = tagsEl.scrollLeft;
    if (dx) tagsEl.scrollLeft += dx;
    if (tagsEl.scrollLeft !== before) updateReorder();
  } else if (reorder.lastY < rect.top + EDGE_PX) dy = -Math.min(12, Math.ceil((rect.top + EDGE_PX - reorder.lastY) / 3));
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
  tagsEl.querySelectorAll('.drop-into').forEach((t) => t.classList.remove('drop-into'));
  listEl.querySelectorAll('.row.dragging').forEach((row) => row.classList.remove('dragging'));
  document.body.classList.remove('reordering');
  suppressClick = true; // the click that ends a drag isn't a click on a task
  setTimeout(() => { suppressClick = false; }, 0);
  if (apply && r.dropCat && findTask(r.id)) {
    selectedId = r.id;
    moveTaskTo(r.id, r.dropCat === 'none' ? null : r.dropCat); // dropped on a category tag
  } else if (apply && r.target && findTask(r.id)) {
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
  reorder = {
    id: row.dataset.id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, lastX: e.clientX, lastY: e.clientY, active: false, target: null, dropCat: null,
  };
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
  reorder.lastX = e.clientX;
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
  if (reorder.active) {
    reorder.lastX = e.clientX;
    reorder.lastY = e.clientY;
  }
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

  // Sorting: 1–9 picks a category for the task on the card
  if (sorting && /^[1-9]$/.test(e.key)) {
    const cat = categories[Number(e.key) - 1];
    if (cat) {
      e.preventDefault();
      sortPick(cat.id);
    }
    return;
  }

  switch (e.key) {
    case 'ArrowLeft':
    case 'ArrowRight':
      e.preventDefault();
      stepCat(e.key === 'ArrowRight' ? 1 : -1);
      break;
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
    case 't':
      if (selectedId) {
        e.preventDefault();
        openPicker(selectedId, 'timer');
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
  const tag = tagsEl.querySelector('.tag.on');
  if (tag && !tagEdit) tagsEl.scrollLeft = Math.max(0, Math.min(tagsEl.scrollLeft, tag.offsetLeft - 28), tag.offsetLeft + tag.offsetWidth + 28 - tagsEl.clientWidth);
  if (focusInput) setTimeout(() => inputEl.focus(), 30);
  else inputEl.blur();
});

window.taskpop.onTasksReplaced((payload) => {
  tasks = Array.isArray(payload && payload.tasks) ? payload.tasks : [];
  if (payload && Array.isArray(payload.categories)) categories = payload.categories;
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
window.taskpop.onPickReminder((id) => openPicker(id, 'reminder'));
window.taskpop.onPickTimer((id) => openPicker(id, 'timer'));
window.taskpop.onCalendarTask((id) => openCalendar(id));
window.taskpop.onMoveTask(({ id, category }) => moveTaskTo(id, category));
window.taskpop.onNewCategoryFor((id) => {
  if (findTask(id)) startTagEdit('new', id);
});
window.taskpop.onCategoryAction(({ id, action, value }) => {
  if (action === 'sort') startSorting();
  else if (action === 'rename') startTagEdit(id);
  else if (action === 'delete') deleteCategory(id);
  else if (action === 'move') moveCategory(id, Number(value) < 0 ? -1 : 1);
  else if (action === 'color' && findCat(id) && CAT_COLORS[value]) {
    findCat(id).color = value;
    save();
    render();
  }
});
window.taskpop.onEditTask((id) => {
  const titleEl = listEl.querySelector(`.row[data-id="${CSS.escape(id)}"] .title`);
  const task = findTask(id);
  if (titleEl && task) startEditing(task, titleEl);
});

// Timers count down every second while the panel is open (just the numbers, not the whole list).
setInterval(() => {
  if (document.visibilityState === 'visible') updateCountdowns();
}, 1000);

// Keep reminder labels ("Overdue", "Today 6:00 PM") fresh while the panel is open.
setInterval(() => {
  if (!editingId && !pickerId && !reorder && document.visibilityState === 'visible') render();
}, 60 * 1000);

window.taskpop.getState().then((state) => {
  platform = state.platform || 'darwin';
  document.documentElement.classList.add(`platform-${platform}`);
  if (platform !== 'darwin') settingsBtn.title = 'Settings (Ctrl+,)';
  tasks = Array.isArray(state.tasks) ? state.tasks : [];
  categories = Array.isArray(state.categories) ? state.categories : [];
  knownRev = Number(state.rev) || 0;
  applySettings(state.settings);
  applyAccent(state.accent);
  updateState = state.update || null;
  renderUpdate();
  render();
  if (state.sortPrompt) startSorting(true); // just updated to 1.8: sort the tasks you had
});
