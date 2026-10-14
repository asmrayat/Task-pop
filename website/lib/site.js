/* Latest GitHub release. The page asks GitHub which file is the
   Mac installer and which is the Windows installer, so a new
   release is offered without editing this site. */
const RELEASES_LATEST = 'https://github.com/asmrayat/Task-pop/releases/latest';
const RELEASES_API = 'https://api.github.com/repos/asmrayat/Task-pop/releases/latest';

export function startSite() {
  if (document.documentElement.dataset.siteReady === '1') return;
  document.documentElement.dataset.siteReady = '1';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header border on scroll ---------- */
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  const year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());
  if (!document.getElementById('devicePanel')) return;

  /* ---------- Live TaskPop demo ---------- */
  const isWindows = document.documentElement.dataset.os === 'windows';
  const ICONS = {
    check: '<svg viewBox="0 0 12 12"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
    bell: '<svg viewBox="0 0 12 12"><path d="M3 8.5V5.5a3 3 0 0 1 6 0v3l1 1H2zM5 10.5a1 1 0 0 0 2 0"/></svg>',
    repeat: '<svg viewBox="0 0 12 12"><path d="M2 5.5V5a2 2 0 0 1 2-2h5.5M8 1.5L9.5 3 8 4.5M10 6.5V7a2 2 0 0 1-2 2H2.5M4 10.5L2.5 9 4 7.5"/></svg>',
    timer: '<svg viewBox="0 0 12 12"><circle cx="6" cy="6.8" r="4.3"/><path d="M6 4.4v2.5l1.6 1M4.7 1.2h2.6M9.6 3.1l.8-.8"/></svg>',
    sliders: '<svg viewBox="0 0 16 16"><path d="M2 4.5h7M12.6 4.5H14M2 11.5h1.6M7.4 11.5H14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10.8" cy="4.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="5.5" cy="11.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    plus: '<svg class="tp-plus" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#2459e0"/><path d="M10 5.5v9M5.5 10h9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
    chevron: '<svg viewBox="0 0 16 16"><path d="M4 6.2l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    hide: '<svg viewBox="0 0 16 16"><rect x="3.4" y="7" width="9.2" height="6.6" rx="1.6"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" stroke-linecap="round"/></svg>',
    locked: '<svg viewBox="0 0 12 12"><rect x="2.2" y="5.2" width="7.6" height="5.4" rx="1.3"/><path d="M4 5.2V3.9a2 2 0 0 1 4 0v1.3"/></svg>',
    unlocked: '<svg viewBox="0 0 12 12"><rect x="2.2" y="5.2" width="7.6" height="5.4" rx="1.3"/><path d="M4 5.2V3.9a2 2 0 0 1 3.9-.6"/></svg>',
    finger: '<svg viewBox="0 0 24 24"><path d="M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"/><path d="M14 13.12c0 2.38 0 6.38-1 8.88"/><path d="M17.29 21.02c.12-.6.43-2.3.5-3.02"/><path d="M2 12a10 10 0 0 1 18-6"/><path d="M2 16h.01"/><path d="M21.8 16c.2-2 .131-5.354 0-6"/><path d="M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"/><path d="M8.65 22c.21-.66.45-1.32.57-2"/><path d="M9 6.8a6 6 0 0 1 9 5.2v2"/></svg>',
  };

  const CATS = [
    { id: 'personal', name: 'Personal', color: '#2f7cf6' },
    { id: 'work', name: 'Work', color: '#ff9500' },
  ];
  const catOf = (task) => CATS.find((c) => c.id === task.cat) || null;

  const MASK = '••••••';
  const SHOW_FOR_MS = 15000; // the app hides it again after a minute; the demo is quicker
  const startedAt = Date.now();
  let nextId = 10;
  let view = 'all';
  let noteOpen = false;
  let tasks = [
    { id: 1, title: 'Submit the expense report', done: false, important: true, cat: 'work',
      timer: { start: startedAt - 7 * 60 * 1000, end: startedAt + 18 * 60 * 1000 + 20 * 1000 } },
    { id: 2, title: 'Pay the electricity bill', done: false, important: true, cat: 'personal' },
    { id: 3, title: 'Send the weekly report', done: false, cat: 'work', remind: 'Today 4:00 PM' },
    { id: 4, title: 'Book a dentist appointment', done: false, cat: 'personal' },
    { id: 5, title: 'Morning workout', done: true, repeat: true, cat: 'personal' },
  ];

  // Hidden text in the demo note. In TaskPop it's encrypted the moment you hide it.
  let nextSecret = 3;
  const secrets = new Map([['s1', 'sunflower-42'], ['s2', '4071']]);
  const shownUntil = new Map();

  const panels = [document.getElementById('devicePanel'), document.getElementById('mobilePanel')];
  const trayCount = document.getElementById('trayCount');

  const el = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  };
  const button = (cls, html, label) => {
    const b = el('button', cls, html);
    b.type = 'button';
    if (label) b.setAttribute('aria-label', label);
    return b;
  };

  /* Timers: "1h 5m left", or minutes:seconds under an hour, as in the app */
  function durationLabel(ms, withSeconds = true) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    if (h) return m ? `${h}h ${m}m` : `${h}h`;
    if (withSeconds) return `${m}:${String(sec).padStart(2, '0')}`;
    return `${Math.max(1, m)}m`;
  }
  function timerState(task, now) {
    const left = task.timer.end - now;
    if (left <= 0) return 'over';
    const total = task.timer.end - task.timer.start;
    return left <= Math.min(10 * 60 * 1000, total * 0.2) ? 'soon' : 'running';
  }
  function countdownText(task, now) {
    const left = task.timer.end - now;
    if (left > 0) return `${durationLabel(left)} left`;
    const over = now - task.timer.end;
    return over < 60 * 1000 ? 'Time’s up' : `${durationLabel(over, false)} over`;
  }
  function finishedText(task) {
    const diff = task.timer.end - task.doneAt;
    if (Math.abs(diff) < 60 * 1000) return 'Just in time';
    return diff > 0 ? `${durationLabel(diff, false)} early` : `${durationLabel(-diff, false)} late`;
  }

  /* ----- The panel ----- */
  function buildShell(panel) {
    panel.innerHTML = '';
    const head = el('div', 'tp-head');
    const titles = el('div');
    titles.append(el('h4', null, 'Tasks'), el('p', 'tp-sub'));
    const actions = el('div', 'tp-actions');
    const settings = button('tp-icon', ICONS.sliders);
    settings.tabIndex = -1;
    settings.setAttribute('aria-hidden', 'true');
    const close = button('tp-icon', ICONS.close, 'Hide panel');
    close.addEventListener('click', () => {
      if (panel.classList.contains('in-device')) setPanelShown(false);
    });
    actions.append(settings, close);
    head.append(titles, actions);

    const progress = el('div', 'tp-progress');
    progress.append(el('div', 'tp-bar'));

    const tags = el('div', 'tp-tags');
    tags.setAttribute('role', 'tablist');
    tags.setAttribute('aria-label', 'Categories');
    tags.addEventListener('click', (e) => {
      const tag = e.target.closest('.tp-tag');
      if (!tag) return;
      view = tag.dataset.view;
      renderAll();
    });

    const list = el('div', 'tp-list');
    list.setAttribute('role', 'list');

    const inputBar = el('div', 'tp-input', ICONS.plus);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add a task…';
    input.maxLength = 80;
    input.setAttribute('aria-label', 'Add a task (start with ! to star it, add #work or #personal to file it)');
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      addTask(input.value);
      input.value = '';
    });
    const noteBtn = button('tp-note-btn', ICONS.chevron, 'Quick note');
    noteBtn.title = 'Quick note';
    noteBtn.setAttribute('aria-expanded', 'false');
    noteBtn.addEventListener('click', () => setNoteOpen(!noteOpen));
    inputBar.append(input, noteBtn);

    panel.append(head, progress, tags, el('div', 'tp-divider'), list, el('div', 'tp-divider'), inputBar, buildNote(panel));
  }

  function addTask(text) {
    let title = text.trim();
    let important = false;
    if (title.startsWith('!')) {
      important = true;
      title = title.replace(/^!+\s*/, '');
    }
    // "#work" files it in Work, as in the app
    let cat = view === 'all' || view === 'none' ? null : view;
    title = title.replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, (all, space, name) => {
      const match = CATS.find((c) => c.name.toLowerCase() === name.toLowerCase());
      if (!match) return all;
      cat = match.id;
      return space;
    }).replace(/\s{2,}/g, ' ').trim();
    if (!title) return;
    tasks.push({ id: nextId++, title, done: false, important, cat });
    renderAll();
  }

  const inView = (task, v = view) => v === 'all' || (v === 'none' ? !task.cat : task.cat === v);

  function tag(v, name, color) {
    const t = button(`tp-tag${v === view ? ' on' : ''}${v === 'none' ? ' unsorted' : ''}`);
    t.dataset.view = v;
    t.setAttribute('role', 'tab');
    t.setAttribute('aria-selected', String(v === view));
    if (color) {
      const dot = el('i', 'tp-dot');
      dot.style.setProperty('--c', color);
      t.append(dot);
    }
    t.append(document.createTextNode(name));
    const pending = tasks.filter((task) => !task.done && inView(task, v)).length;
    if (pending) t.append(el('small', null, String(pending)));
    return t;
  }

  function row(task) {
    const now = Date.now();
    const timed = task.timer && !task.done;
    const state = timed ? timerState(task, now) : '';
    const r = el('div', `tp-row${task.done ? ' done' : ''}${task.important ? ' important' : ''}${timed ? ` timed timer-${state}` : ''}`);
    r.setAttribute('role', 'listitem');
    r.dataset.id = String(task.id);

    const check = button('tp-check', ICONS.check, `${task.done ? 'Mark as not done' : 'Mark as done'}: ${task.title}`);
    check.addEventListener('click', () => {
      task.done = !task.done;
      task.doneAt = task.done ? Date.now() : null;
      renderAll();
    });

    const col = el('div', 'tp-col');
    const title = el('span', 'tp-title');
    title.textContent = task.title;
    const cat = view === 'all' && catOf(task);
    if (cat) {
      const label = el('span', 'tp-cat');
      const dot = el('i', 'tp-dot');
      dot.style.setProperty('--c', cat.color);
      label.append(dot, document.createTextNode(cat.name));
      title.append(label);
    }
    col.append(title);

    if (timed) {
      const line = el('div', 'tp-timer');
      const countdown = el('span', 'tp-countdown', ICONS.timer);
      countdown.append(el('span', 'tp-left', countdownText(task, now)));
      const track = el('span', 'tp-track');
      const bar = el('i', 'tp-track-bar');
      track.append(bar);
      line.append(countdown, track);
      col.append(line);
      paintBar(bar, task, now);
    }

    const chips = [];
    if (task.timer && task.done && task.doneAt) chips.push(el('span', 'tp-chip ontime', finishedText(task)));
    if (task.remind && !task.done) chips.push(el('span', 'tp-chip soon', `${ICONS.bell}${task.remind}`));
    if (task.repeat) chips.push(el('span', 'tp-chip', `${ICONS.repeat}Every day`));
    if (chips.length) {
      const meta = el('div', 'tp-meta');
      meta.append(...chips);
      col.append(meta);
    }

    const star = button('tp-star', ICONS.star, `${task.important ? 'Remove from important' : 'Mark as important'}: ${task.title}`);
    star.addEventListener('click', () => {
      task.important = !task.important;
      renderAll();
    });

    r.append(check, col, star);
    return r;
  }

  function paintBar(bar, task, now) {
    const total = task.timer.end - task.timer.start;
    const left = Math.max(0, task.timer.end - now);
    bar.style.transform = `scaleX(${(left / total).toFixed(4)})`;
  }

  function renderPanel(panel) {
    const inThisView = tasks.filter((t) => inView(t));
    const pending = inThisView.filter((t) => !t.done);
    const rank = (t) => (t.timer ? 0 : t.important ? 1 : 2);
    const ordered = [...pending].sort((a, b) => rank(a) - rank(b));
    const done = inThisView.filter((t) => t.done);
    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    panel.querySelector('.tp-sub').textContent = pending.length
      ? `${date} · ${pending.length} left`
      : `${date} · All done 🎉`;
    panel.querySelector('.tp-bar').style.width = inThisView.length ? `${(done.length / inThisView.length) * 100}%` : '0';

    const tags = panel.querySelector('.tp-tags');
    const items = [tag('all', 'All'), ...CATS.map((c) => tag(c.id, c.name, c.color))];
    if (tasks.some((t) => !t.cat)) items.push(tag('none', 'Unsorted'));
    tags.replaceChildren(...items);

    const list = panel.querySelector('.tp-list');
    list.replaceChildren(...ordered.map(row));
    if (!inThisView.length) list.append(el('p', 'tp-empty', 'Nothing here yet. Add a task below.'));
    if (done.length) {
      const section = el('div', 'tp-section');
      section.append(el('span', null, `Completed · ${done.length}`));
      list.append(section, ...done.map(row));
    }
  }

  function renderAll() {
    panels.forEach(renderPanel);
    trayCount.textContent = String(tasks.filter((t) => !t.done).length || '');
  }

  // The countdowns tick every second, in place
  setInterval(() => {
    const now = Date.now();
    panels.forEach((panel) => {
      panel.querySelectorAll('.tp-row.timed').forEach((r) => {
        const task = tasks.find((t) => String(t.id) === r.dataset.id);
        if (!task || !task.timer) return;
        const state = timerState(task, now);
        r.classList.remove('timer-running', 'timer-soon', 'timer-over');
        r.classList.add(`timer-${state}`);
        r.querySelector('.tp-left').textContent = countdownText(task, now);
        paintBar(r.querySelector('.tp-track-bar'), task, now);
      });
    });
  }, 1000);

  /* ----- The quick note, with hidden text ----- */
  function secretChip(id) {
    const chip = el('span', 'tp-secret');
    chip.contentEditable = 'false';
    chip.dataset.id = id;
    chip.tabIndex = 0;
    chip.setAttribute('role', 'button');
    paintSecret(chip);
    return chip;
  }

  // Hidden: "🔒 •••••• Show". Showing: the text, which can be selected, with Copy and Hide.
  function paintSecret(chip) {
    const shown = (shownUntil.get(chip.dataset.id) || 0) > Date.now();
    chip.classList.toggle('shown', shown);
    if (!shown) {
      chip.innerHTML = ICONS.locked;
      chip.append(el('span', 'tp-secret-text', MASK), el('span', 'tp-secret-show', 'Show'));
      chip.setAttribute('role', 'button');
      chip.tabIndex = 0;
      chip.setAttribute('aria-label', 'Hidden text. Click to show it.');
      return;
    }
    chip.replaceChildren(el('span', 'tp-secret-text', secrets.get(chip.dataset.id)));
    const copy = button('tp-secret-btn', 'Copy', 'Copy it');
    copy.dataset.act = 'copy';
    copy.tabIndex = -1;
    const hide = button('tp-secret-btn hide', `${ICONS.locked}Hide`, 'Hide it again');
    hide.dataset.act = 'hide';
    hide.tabIndex = -1;
    chip.append(copy, hide);
    chip.removeAttribute('role');
    chip.removeAttribute('tabindex');
    chip.setAttribute('aria-label', 'Hidden text, showing');
  }

  function paintAllSecrets() {
    panels.forEach((panel) => panel.querySelectorAll('.tp-secret').forEach(paintSecret));
  }

  function buildNote(panel) {
    const drawer = el('section', 'tp-note');
    drawer.hidden = true;
    drawer.setAttribute('aria-label', 'Quick note');
    const head = el('div', 'tp-note-head');
    const hide = button('tp-note-hide', `${ICONS.hide}<span>Hide selected</span>`);
    hide.disabled = true;
    hide.title = 'Select text in the note, then click to encrypt it';
    hide.addEventListener('mousedown', (e) => e.preventDefault()); // keep the selection
    hide.addEventListener('click', () => hideSelection(panel));
    head.append(el('span', 'tp-note-title', 'Quick note'), hide);

    const editor = el('div', 'tp-note-editor');
    editor.contentEditable = 'true';
    editor.spellcheck = false;
    editor.setAttribute('role', 'textbox');
    editor.setAttribute('aria-multiline', 'true');
    editor.setAttribute('aria-label', 'Quick note');
    editor.append(
      document.createTextNode('Wi-Fi: Home-5G'), el('br'),
      document.createTextNode('Password: '), secretChip('s1'), el('br'),
      document.createTextNode('Door code: '), secretChip('s2'),
    );
    editor.addEventListener('mousedown', (e) => {
      // (buttons keep the selection; a hidden piece takes no caret; text that shows can be selected)
      if (e.target.closest('.tp-secret-btn') || e.target.closest('.tp-secret:not(.shown)')) e.preventDefault();
    });
    editor.addEventListener('click', (e) => {
      const btn = e.target.closest('.tp-secret-btn');
      const chip = e.target.closest('.tp-secret');
      if (btn && chip) secretAction(panel, chip, btn.dataset.act);
      else if (chip && !chip.classList.contains('shown')) askToShow(panel, chip);
    });
    editor.addEventListener('keydown', (e) => {
      const chip = e.target.closest && e.target.closest('.tp-secret:not(.shown)');
      if (chip && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        askToShow(panel, chip);
      }
    });
    // Paste as plain text only
    editor.addEventListener('paste', (e) => {
      e.preventDefault();
      const text = (e.clipboardData && e.clipboardData.getData('text/plain')) || '';
      document.execCommand('insertText', false, text);
    });

    const status = el('p', 'tp-note-status', '•••••• is encrypted text. Click Show to see it. To hide more, select text and click Hide selected.');
    status.setAttribute('aria-live', 'polite');
    drawer.append(head, editor, status, buildAuth(panel));
    return drawer;
  }

  function setNoteOpen(open) {
    noteOpen = open;
    panels.forEach((panel) => {
      panel.querySelector('.tp-note').hidden = !open;
      const btn = panel.querySelector('.tp-note-btn');
      btn.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
    });
    if (!open) {
      shownUntil.clear(); // closing the note hides everything again, as in the app
      paintAllSecrets();
      panels.forEach((panel) => closeAuth(panel));
    }
  }

  function setStatus(panel, text) {
    panel.querySelector('.tp-note-status').textContent = text;
  }

  function hideSelection(panel) {
    const editor = panel.querySelector('.tp-note-editor');
    const sel = window.getSelection();
    if (!sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed || !editor.contains(range.commonAncestorContainer)) return;
    const inSecret = (n) => (n.nodeType === 1 ? n : n.parentElement).closest('.tp-secret');
    if (inSecret(range.startContainer) || inSecret(range.endContainer) || range.cloneContents().querySelector('.tp-secret')) {
      setStatus(panel, 'Select only ordinary text to hide it.');
      return;
    }
    const text = range.toString();
    if (!text.trim()) return;
    const id = `s${nextSecret++}`;
    secrets.set(id, text);
    const chip = secretChip(id);
    range.deleteContents();
    range.insertNode(chip);
    sel.removeAllRanges();
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    sel.addRange(after);
    updateHideButtons();
    setStatus(panel, 'Hidden. In TaskPop it’s encrypted the moment you hide it.');
  }

  function updateHideButtons() {
    const sel = window.getSelection();
    panels.forEach((panel) => {
      const editor = panel.querySelector('.tp-note-editor');
      const hide = panel.querySelector('.tp-note-hide');
      const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
      const inSecret = (n) => (n.nodeType === 1 ? n : n.parentElement).closest('.tp-secret');
      hide.disabled = !(range && !range.collapsed && editor.contains(range.commonAncestorContainer) && range.toString().trim()
        && !inSecret(range.startContainer) && !inSecret(range.endContainer));
    });
  }
  document.addEventListener('selectionchange', updateHideButtons);

  // Showing hidden text asks for Touch ID (or Windows Hello) first
  let pendingChip = null;
  function buildAuth(panel) {
    const sheet = el('div', 'tp-auth');
    sheet.hidden = true;
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-label', 'Confirm it’s you');
    const card = el('div', 'tp-auth-card');
    const icon = el('img');
    icon.src = '/assets/taskpop-icon.png';
    icon.alt = '';
    icon.width = 38;
    icon.height = 38;
    const what = el('strong', null, isWindows ? 'Windows Security' : 'TaskPop is trying to show your hidden text.');
    const how = el('p', null, isWindows ? 'Show your hidden text in TaskPop. Use Windows Hello or your PIN.' : 'Touch ID or enter your password to allow this.');
    const finger = button('tp-finger', ICONS.finger, isWindows ? 'Confirm with Windows Hello' : 'Confirm with Touch ID');
    finger.addEventListener('click', () => {
      finger.classList.add('ok');
      setTimeout(() => {
        finger.classList.remove('ok');
        const chip = pendingChip;
        closeAuth(panel);
        if (!chip) return;
        const id = chip.dataset.id;
        shownUntil.set(id, Date.now() + SHOW_FOR_MS);
        paintAllSecrets();
        setStatus(panel, 'Showing. Select any part of it to copy just that, or click Copy. It hides again by itself.');
        setTimeout(() => {
          if ((shownUntil.get(id) || 0) <= Date.now()) {
            paintAllSecrets();
            setStatus(panel, 'Hidden again. In TaskPop that happens after a minute, or when the panel closes.');
          }
        }, SHOW_FOR_MS + 50);
      }, reduceMotion ? 0 : 420);
    });
    const touch = window.matchMedia('(hover: none)').matches;
    const tip = el('span', 'tp-auth-tip', `${touch ? 'Tap' : 'Click'} the sensor to try it`);
    const cancel = button('tp-auth-cancel', 'Cancel');
    cancel.addEventListener('click', () => {
      closeAuth(panel);
      setStatus(panel, 'Canceled. The text stays hidden.');
    });
    card.append(icon, what, how, finger, tip, cancel);
    sheet.append(card);
    return sheet;
  }

  function closeAuth(panel) {
    const sheet = panel.querySelector('.tp-auth');
    if (sheet) sheet.hidden = true;
    pendingChip = null;
  }

  function secretAction(panel, chip, act) {
    const id = chip.dataset.id;
    if (act === 'hide') {
      shownUntil.delete(id);
      paintAllSecrets();
      setStatus(panel, 'Hidden again.');
    } else if (act === 'copy') {
      const done = () => setStatus(panel, 'Copied. In TaskPop it comes off the clipboard after a minute.');
      if (navigator.clipboard) navigator.clipboard.writeText(secrets.get(id)).then(done, () => setStatus(panel, 'Your browser didn’t allow copying here.'));
    }
  }

  function askToShow(panel, chip) {
    pendingChip = chip;
    const sheet = panel.querySelector('.tp-auth');
    sheet.hidden = false;
    sheet.querySelector('.tp-finger').focus({ preventScroll: true });
  }

  panels.forEach(buildShell);
  renderAll();

  // Menu bar clock
  const clock = document.getElementById('clock');
  const tickClock = () => {
    const now = new Date();
    clock.textContent = `${now.toLocaleDateString('en-US', { weekday: 'short' })} ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  };
  tickClock();
  setInterval(tickClock, 30 * 1000);

  /* ---------- Device scaling ---------- */
  const stage = document.getElementById('deviceStage');
  const device = document.getElementById('device');
  const DEVICE_WIDTH = 820;
  const DEVICE_HEIGHT = 560;
  const fit = () => {
    const scale = Math.min(1, stage.clientWidth / (DEVICE_WIDTH * 1.04));
    stage.style.setProperty('--scale', scale.toFixed(4));
    device.style.setProperty('--scale', scale.toFixed(4));
    stage.style.height = `${Math.round(DEVICE_HEIGHT * scale)}px`;
  };
  new ResizeObserver(fit).observe(stage);
  fit();

  /* ---------- Lid choreography ---------- */
  const devicePanel = document.getElementById('devicePanel');
  let busy = false;

  function setPanelShown(shown) {
    devicePanel.classList.toggle('shown', shown);
    if (!shown) {
      // Hidden text hides itself again whenever the panel closes, as in the app
      shownUntil.clear();
      paintAllSecrets();
      closeAuth(devicePanel);
    }
  }

  function openLid() {
    return new Promise((resolve) => {
      if (reduceMotion) {
        device.classList.remove('closed');
        setPanelShown(true);
        resolve();
        return;
      }
      device.classList.add('animate');
      requestAnimationFrame(() => {
        device.classList.remove('closed');
        setTimeout(() => {
          setPanelShown(true);
          setTimeout(() => {
            device.classList.remove('animate');
            resolve();
          }, 400);
        }, 1250);
      });
    });
  }

  function closeLid() {
    return new Promise((resolve) => {
      setPanelShown(false);
      if (reduceMotion) {
        setTimeout(resolve, 200);
        return;
      }
      setTimeout(() => {
        device.classList.add('closing', 'closed');
        setTimeout(() => {
          device.classList.remove('closing');
          resolve();
        }, 650);
      }, 250);
    });
  }

  // Page-load moment: the lid opens, the screen wakes, TaskPop slides in.
  setTimeout(openLid, reduceMotion ? 0 : 500);

  document.getElementById('replayBtn').addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    await closeLid();
    await new Promise((r) => setTimeout(r, 450));
    await openLid();
    busy = false;
  });

  function togglePanel() {
    if (device.classList.contains('closed') || stage.offsetParent === null) return;
    const show = !devicePanel.classList.contains('shown');
    setPanelShown(show);
    if (show) setTimeout(() => devicePanel.querySelector('.tp-input input').focus({ preventScroll: true }), 150);
  }

  // Try the real shortcut: Control + Option + T
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.altKey && e.code === 'KeyT')) return;
    e.preventDefault();
    togglePanel();
  });

  // ...or the double-tap: Control twice, quickly, with nothing else in between
  const tapHint = document.getElementById('tapKeyHint');
  if (tapHint && isWindows) tapHint.textContent = 'ctrl';
  let tapDownAt = 0;
  let lastTapAt = 0;
  let spoiled = false;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Control') {
      if (e.repeat) spoiled = true; // held down, not tapped
      else {
        tapDownAt = performance.now();
        spoiled = false;
      }
      return;
    }
    spoiled = true;
    lastTapAt = 0;
  }, true);
  window.addEventListener('keyup', (e) => {
    if (e.key !== 'Control') return;
    const t = performance.now();
    if (spoiled || t - tapDownAt > 350) {
      lastTapAt = 0;
      return;
    }
    if (lastTapAt && t - lastTapAt < 450) {
      lastTapAt = 0;
      if (tapHint) {
        tapHint.classList.add('pressed');
        setTimeout(() => tapHint.classList.remove('pressed'), 300);
      }
      togglePanel();
    } else {
      lastTapAt = t;
    }
  }, true);
  window.addEventListener('mousedown', () => {
    spoiled = true;
    lastTapAt = 0;
  }, true);
  window.addEventListener('blur', () => {
    lastTapAt = 0;
  });

  /* ---------- Downloads ---------- */
  const note = document.getElementById('downloadNote');
  const macSetup = document.getElementById('macSetup');
  const downloadSub = document.getElementById('downloadSub');
  const macDmgName = document.getElementById('macDmgName');

  const isInstaller = (url) => /\.(dmg|exe)(\?|$)/i.test(url);

  const setDownloadUrl = (link, url) => {
    if (!url) return;
    link.href = url;
    if (isInstaller(url)) link.setAttribute('download', '');
  };

  const openMacSetup = () => {
    if (!macSetup || typeof macSetup.showModal !== 'function') return;
    if (macSetup.open) return;
    macSetup.showModal();
  };

  document.querySelectorAll('[data-build], .mac-download, .win-download').forEach((link) => {
    if (!link.getAttribute('href')) link.href = RELEASES_LATEST;
  });

  document.querySelectorAll('.mac-download').forEach((link) => {
    link.addEventListener('click', () => {
      if (!/\.dmg(\?|$)/i.test(link.href)) return;
      window.setTimeout(openMacSetup, 80);
    });
  });

  const installerAsset = (assets, extension) => (assets || []).find((asset) => (
    asset
    && asset.state !== 'starter'
    && typeof asset.name === 'string'
    && asset.name.toLowerCase().endsWith(extension)
    && typeof asset.browser_download_url === 'string'
  ));

  const applyLatestRelease = (release) => {
    if (!release || release.draft || release.prerelease) return;
    const dmg = installerAsset(release.assets, '.dmg');
    const exe = installerAsset(release.assets, '.exe');
    document.querySelectorAll('.mac-download').forEach((link) => {
      if (dmg) setDownloadUrl(link, dmg.browser_download_url);
    });
    document.querySelectorAll('.win-download').forEach((link) => {
      if (exe) setDownloadUrl(link, exe.browser_download_url);
    });
    const version = String(release.tag_name || release.name || '').replace(/^v/i, '');
    if (version && downloadSub) {
      downloadSub.textContent = `Version ${version}. Free. One Mac installer for Apple Silicon and Intel, plus a Windows installer for x64 and ARM64 PCs.`;
    }
    if (dmg && macDmgName) macDmgName.textContent = dmg.name;
    const updateVersion = document.getElementById('updateVersion');
    if (version && updateVersion) updateVersion.textContent = version;
  };

  fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    .then((response) => (response.ok ? response.json() : null))
    .then(applyLatestRelease)
    .catch(() => {
      if (note && !note.textContent) {
        note.textContent = 'Couldn’t check GitHub just now. The buttons still open the latest release.';
      }
    });

  if (macSetup) {
    macSetup.addEventListener('click', (e) => {
      if (e.target === macSetup) macSetup.close();
    });
  }

  const os = document.documentElement.dataset.os;
  if (os === 'windows' || os === 'macos') {
    const hero = document.querySelector('.hero-actions');
    const primaryBtn = hero.querySelector(os === 'windows' ? '.win-download' : '.mac-download');
    const secondaryBtn = hero.querySelector(os === 'windows' ? '.mac-download' : '.win-download');
    primaryBtn.classList.add('btn-primary');
    primaryBtn.classList.remove('btn-quiet');
    secondaryBtn.classList.add('btn-quiet');
    secondaryBtn.classList.remove('btn-primary');
    hero.insertBefore(primaryBtn, hero.firstElementChild);
    primaryBtn.after(secondaryBtn);

    const builds = document.querySelector('.builds');
    const primaryCard = document.getElementById(os === 'windows' ? 'build-windows' : 'build-macos');
    const secondaryCard = document.getElementById(os === 'windows' ? 'build-macos' : 'build-windows');
    primaryCard.classList.add('recommended');
    secondaryCard.classList.remove('recommended');
    builds.insertBefore(primaryCard, builds.firstElementChild);
    primaryCard.after(secondaryCard);
  }

}
