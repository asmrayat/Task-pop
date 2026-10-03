// The "New update is here" pop-up. It shows what the updater is doing right now:
// a new version → Update now / Update later; then download progress; then installing.
const $ = (id) => document.getElementById(id);
const card = $('card');
const els = {
  title: $('title'),
  lead: $('lead'),
  notesBox: $('notesBox'),
  notesTitle: $('notesTitle'),
  notes: $('notes'),
  pageBtn: $('pageBtn'),
  progressBox: $('progressBox'),
  meterFill: $('meterFill'),
  progressText: $('progressText'),
  note: $('note'),
  buttons: $('buttons'),
  later: $('laterBtn'),
  now: $('nowBtn'),
  close: $('closeBtn'),
};

let platform = 'darwin';
let remindHours = 4;
let update = null;
let snoozed = false;
let laterAction = 'later'; // what Update later / × / Esc mean right now ('later' or, while downloading, 'hide')

const mac = () => platform === 'darwin';
const hoursText = (h) => (h === 1 ? 'an hour' : `${h} hours`);

function render() {
  const u = update;
  if (snoozed || !u || !u.latest) return;
  const v = u.latest.version;
  const status = u.status;
  let view = 'available';
  if (status === 'downloading') view = 'downloading';
  else if (status === 'installing') view = 'installing';
  else if (status === 'failed') view = 'failed';

  els.notesBox.hidden = true;
  els.progressBox.hidden = true;
  els.progressBox.classList.remove('busy');
  els.note.textContent = '';
  els.note.classList.remove('warn');
  els.buttons.hidden = false;
  els.now.hidden = false;
  els.now.disabled = false; // (it's disabled for a moment after a click, until the state moves on)
  els.close.hidden = false;
  laterAction = 'later';

  if (view === 'available') {
    els.title.textContent = 'New update is here';
    els.lead.textContent = `TaskPop ${v} is ready to install. You have ${u.current}.`;
    if (u.latest.notes) {
      els.notesBox.hidden = false;
      els.notesTitle.textContent = `What’s new in ${v}`;
      els.notes.textContent = u.latest.notes;
    }
    els.pageBtn.hidden = !u.latest.page;
    if (u.message) {
      els.note.textContent = u.message; // e.g. "Update canceled."
    } else {
      els.note.textContent = mac()
        ? 'Takes about a minute. You may be asked for your Mac password. Your tasks and settings stay as they are.'
        : 'Takes about a minute. TaskPop closes and reopens by itself. Your tasks and settings stay as they are.';
    }
    els.later.textContent = 'Update later';
    els.now.textContent = 'Update now';
  } else if (view === 'downloading') {
    const pct = Math.round((u.progress || 0) * 100);
    els.title.textContent = 'Updating TaskPop';
    els.lead.textContent = `Downloading version ${v}…`;
    els.progressBox.hidden = false;
    els.meterFill.style.width = `${pct}%`;
    els.progressText.textContent = `${pct}%`;
    els.note.textContent = 'You can keep working. Hiding this doesn’t stop the update.';
    els.later.textContent = 'Hide';
    els.now.hidden = true;
    els.close.title = 'Hide';
    laterAction = 'hide';
  } else if (view === 'installing') {
    els.title.textContent = `Installing TaskPop ${v}`;
    els.lead.textContent = mac()
      ? 'Enter your Mac password if asked. TaskPop reopens by itself.'
      : 'TaskPop will close and reopen in a moment.';
    els.progressBox.hidden = false;
    els.progressBox.classList.add('busy');
    els.progressText.textContent = '';
    els.buttons.hidden = true;
    els.close.hidden = true;
  } else {
    els.title.textContent = 'The update didn’t finish';
    els.lead.textContent = `TaskPop ${u.current} is still installed and works as before.`;
    els.note.textContent = u.message || 'Please try again.';
    els.note.classList.add('warn');
    els.later.textContent = 'Update later';
    els.now.textContent = 'Try again';
  }
  if (laterAction === 'later') els.close.title = 'Update later';
  reportSize();
}

function showSnoozed() {
  snoozed = true;
  card.classList.add('snoozed');
  els.title.textContent = 'OK, we’ll remind you later';
  els.lead.textContent = `TaskPop will ask again in ${hoursText(remindHours)}. You can also update any time from Settings.`;
  reportSize();
}

let lastHeight = 0;
function reportSize() {
  requestAnimationFrame(() => {
    const h = Math.ceil(card.getBoundingClientRect().height);
    if (h && h !== lastHeight) {
      lastHeight = h;
      window.taskpopUpdate.setHeight(h);
    }
  });
}

function later() {
  if (snoozed) return;
  window.taskpopUpdate.choose(laterAction);
}

els.later.addEventListener('click', later);
els.close.addEventListener('click', later);
els.now.addEventListener('click', () => {
  if (snoozed) return;
  els.now.disabled = true; // no double click; the next state (downloading, or an error) re-enables it
  setTimeout(() => { els.now.disabled = false; }, 4000);
  window.taskpopUpdate.choose('now');
});
els.pageBtn.addEventListener('click', () => window.taskpopUpdate.openPage());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    e.preventDefault();
    if (!els.close.hidden) later();
  }
});

window.taskpopUpdate.onState((u) => {
  update = u;
  render();
});
window.taskpopUpdate.onSnoozed(() => showSnoozed());

window.taskpopUpdate.get().then((info) => {
  if (!info) return;
  platform = info.platform || 'darwin';
  remindHours = info.remindHours || 4;
  document.documentElement.classList.add(`platform-${platform}`);
  if (info.accent) document.documentElement.style.setProperty('--accent', info.accent);
  update = info.update;
  render();
});
