/* Latest GitHub release. The page asks GitHub which file is the
   Mac installer and which is the Windows installer, so a new
   release is offered without editing this site. */
const RELEASES_LATEST = 'https://github.com/asmrayat/Task-pop/releases/latest';
const RELEASES_API = 'https://api.github.com/repos/asmrayat/Task-pop/releases/latest';

(() => {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- Header border on scroll ---------- */
  const header = document.querySelector('.site-header');
  const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  document.getElementById('year').textContent = String(new Date().getFullYear());

  /* ---------- Live TaskPop demo ---------- */
  const ICONS = {
    check: '<svg viewBox="0 0 12 12"><path d="M2.5 6.3l2.3 2.3 4.7-5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    star: '<svg viewBox="0 0 16 16"><path d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
    bell: '<svg viewBox="0 0 12 12"><path d="M3 8.5V5.5a3 3 0 0 1 6 0v3l1 1H2zM5 10.5a1 1 0 0 0 2 0"/></svg>',
    repeat: '<svg viewBox="0 0 12 12"><path d="M2 5.5V5a2 2 0 0 1 2-2h5.5M8 1.5L9.5 3 8 4.5M10 6.5V7a2 2 0 0 1-2 2H2.5M4 10.5L2.5 9 4 7.5"/></svg>',
    sliders: '<svg viewBox="0 0 16 16"><path d="M2 4.5h7M12.6 4.5H14M2 11.5h1.6M7.4 11.5H14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><circle cx="10.8" cy="4.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/><circle cx="5.5" cy="11.5" r="1.8" fill="none" stroke="currentColor" stroke-width="1.7"/></svg>',
    close: '<svg viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"/></svg>',
    plus: '<svg class="tp-plus" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="#2459e0"/><path d="M10 5.5v9M5.5 10h9" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>',
  };

  let nextId = 10;
  let tasks = [
    { id: 1, title: 'Pay the electricity bill', done: false, important: true },
    { id: 2, title: 'Send the weekly report', done: false, remind: 'Today 4:00 PM' },
    { id: 3, title: 'Book a dentist appointment', done: false },
    { id: 4, title: 'Morning workout', done: true, repeat: true },
  ];

  const panels = [document.getElementById('devicePanel'), document.getElementById('mobilePanel')];
  const trayCount = document.getElementById('trayCount');

  const el = (tag, cls, html) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html) node.innerHTML = html;
    return node;
  };

  function buildShell(panel) {
    panel.innerHTML = '';
    const head = el('div', 'tp-head');
    const titles = el('div');
    titles.append(el('h4', null, 'Tasks'), el('p', 'tp-sub'));
    const actions = el('div', 'tp-actions');
    const settings = el('button', 'tp-icon', ICONS.sliders);
    settings.type = 'button';
    settings.tabIndex = -1;
    settings.setAttribute('aria-hidden', 'true');
    const close = el('button', 'tp-icon', ICONS.close);
    close.type = 'button';
    close.setAttribute('aria-label', 'Hide panel');
    close.addEventListener('click', () => {
      if (panel.classList.contains('in-device')) setPanelShown(false);
    });
    actions.append(settings, close);
    head.append(titles, actions);

    const progress = el('div', 'tp-progress');
    progress.append(el('div', 'tp-bar'));

    const list = el('div', 'tp-list');
    list.setAttribute('role', 'list');

    const inputBar = el('div', 'tp-input', ICONS.plus);
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Add a task…';
    input.maxLength = 80;
    input.setAttribute('aria-label', 'Add a task (start with ! to mark it important)');
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      let title = input.value.trim();
      let important = false;
      if (title.startsWith('!')) {
        important = true;
        title = title.replace(/^!+\s*/, '');
      }
      if (!title) return;
      tasks.push({ id: nextId++, title, done: false, important });
      input.value = '';
      renderAll();
    });
    inputBar.append(input);

    panel.append(head, progress, el('div', 'tp-divider'), list, el('div', 'tp-divider'), inputBar);
  }

  function row(task) {
    const r = el('div', `tp-row${task.done ? ' done' : ''}${task.important ? ' important' : ''}`);
    r.setAttribute('role', 'listitem');

    const check = el('button', 'tp-check', ICONS.check);
    check.type = 'button';
    check.setAttribute('aria-label', `${task.done ? 'Mark as not done' : 'Mark as done'}: ${task.title}`);
    check.addEventListener('click', () => {
      task.done = !task.done;
      renderAll();
    });

    const col = el('div', 'tp-col');
    const title = el('span', 'tp-title');
    title.textContent = task.title;
    col.append(title);
    const chips = [];
    if (task.remind && !task.done) chips.push(el('span', 'tp-chip soon', `${ICONS.bell}${task.remind}`));
    if (task.repeat) chips.push(el('span', 'tp-chip', `${ICONS.repeat}Every day`));
    if (chips.length) {
      const meta = el('div', 'tp-meta');
      meta.append(...chips);
      col.append(meta);
    }

    const star = el('button', 'tp-star', ICONS.star);
    star.type = 'button';
    star.setAttribute('aria-label', `${task.important ? 'Remove from important' : 'Mark as important'}: ${task.title}`);
    star.addEventListener('click', () => {
      task.important = !task.important;
      renderAll();
    });

    r.append(check, col, star);
    return r;
  }

  function renderPanel(panel) {
    const pending = tasks.filter((t) => !t.done);
    const ordered = [...pending.filter((t) => t.important), ...pending.filter((t) => !t.important)];
    const done = tasks.filter((t) => t.done);
    const date = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

    panel.querySelector('.tp-sub').textContent = pending.length
      ? `${date} · ${pending.length} left`
      : `${date} · All done 🎉`;
    panel.querySelector('.tp-bar').style.width = tasks.length ? `${(done.length / tasks.length) * 100}%` : '0';

    const list = panel.querySelector('.tp-list');
    list.replaceChildren(...ordered.map(row));
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

  // Try the real shortcut: Control + Option + T
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey && e.altKey && e.code === 'KeyT')) return;
    e.preventDefault();
    if (device.classList.contains('closed')) return;
    const show = !devicePanel.classList.contains('shown');
    setPanelShown(show);
    if (show) {
      const input = devicePanel.querySelector('input');
      if (stage.offsetParent !== null) setTimeout(() => input.focus({ preventScroll: true }), 150);
    }
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
      downloadSub.textContent = `Version ${version}. One Mac installer for Apple Silicon and Intel, plus a Windows installer.`;
    }
    if (dmg && macDmgName) macDmgName.textContent = dmg.name;
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

  const recommend = (build) => {
    const card = document.getElementById(`build-${build}`);
    if (!card) return;
    card.classList.add('recommended');
    const badge = card.querySelector('.build-badge');
    if (badge) badge.hidden = false;
  };
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) recommend('windows');
  else if (/Macintosh|Mac OS X/i.test(ua)) recommend('macos');
})();
