// TaskPop updates.
// Checks the latest release on TaskPop's GitHub page (asmrayat/Task-pop). When a newer version
// has a file for this computer, TaskPop says so, and "Update now" downloads that file, checks it
// and installs it:
//   macOS   - the .dmg from the release; its installer runs after one password prompt.
//   Windows - the Setup .exe from the release; it runs in update mode and reopens TaskPop.
//
// What's sent: one request to GitHub's public API for the latest release. Nothing about you or
// your tasks, and no account is needed.

const { app, net } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { EventEmitter } = require('events');

const REPO = 'asmrayat/Task-pop';

const config = {
  repo: REPO,
  api: `https://api.github.com/repos/${REPO}/releases/latest`,
  // Update files must come from this repo's releases (GitHub then redirects to its file storage).
  downloadPrefix: `https://github.com/${REPO}/releases/download/`,
  pagePrefix: `https://github.com/${REPO}/`,
  releasesPage: `https://github.com/${REPO}/releases/latest`,
  checkTimeoutMs: 20 * 1000,
  downloadTimeoutMs: 10 * 60 * 1000,
  maxDownloadBytes: 400 * 1024 * 1024,
};

class UpdateError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

// ---------- Versions, release parsing ----------

/** "v1.6.0" -> [1, 6, 0]; null if it isn't a version. */
function parseVersion(value) {
  const m = String(value || '').trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/i);
  return m ? [Number(m[1]), Number(m[2] || 0), Number(m[3] || 0)] : null;
}

function compareVersions(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (x[i] !== y[i]) return x[i] > y[i] ? 1 : -1;
  }
  return 0;
}

/** Release notes are Markdown; show them as plain text. */
function cleanNotes(body) {
  if (typeof body !== 'string') return '';
  let text = body
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length > 1500) text = `${text.slice(0, 1500).trimEnd()}…`;
  return text;
}

/** The file in the release that updates this kind of computer. */
function pickAsset(assets, platform) {
  const ext = platform === 'darwin' ? /\.dmg$/i : platform === 'win32' ? /\.exe$/i : null;
  if (!ext || !Array.isArray(assets)) return null;
  const score = (a) => (/taskpop/i.test(a.name) ? 2 : 0) + (platform === 'win32' && /setup/i.test(a.name) ? 1 : 0);
  const found = assets
    .filter((a) => a && typeof a.name === 'string' && typeof a.browser_download_url === 'string'
      && (!a.state || a.state === 'uploaded') && ext.test(a.name))
    .sort((a, b) => score(b) - score(a))[0];
  if (!found) return null;
  const digest = typeof found.digest === 'string' && found.digest.match(/^sha256:([0-9a-f]{64})$/i);
  return {
    name: found.name,
    url: found.browser_download_url,
    size: Number(found.size) || 0,
    sha256: digest ? digest[1].toLowerCase() : null,
  };
}

/** True if `url`, once parsed (so "../" is resolved), is inside `prefix` on the same host. */
function urlWithin(url, prefix) {
  if (typeof url !== 'string') return false;
  let u;
  let p;
  try {
    u = new URL(url);
    p = new URL(prefix);
  } catch (_) {
    return false;
  }
  return u.protocol === p.protocol && u.host.toLowerCase() === p.host.toLowerCase()
    && !u.username && !u.password
    && u.pathname.toLowerCase().startsWith(p.pathname.toLowerCase());
}

const isAllowedDownload = (url) => urlWithin(url, config.downloadPrefix);
const isAllowedPage = (url) => urlWithin(url, config.pagePrefix);

function parseRelease(json, platform) {
  if (!json || typeof json !== 'object' || json.draft || json.prerelease) return null;
  const parsed = parseVersion(json.tag_name) || parseVersion(json.name);
  if (!parsed) return null;
  const page = isAllowedPage(json.html_url) ? json.html_url : null;
  return {
    version: parsed.join('.'),
    notes: cleanNotes(json.body),
    page,
    publishedAt: Date.parse(json.published_at) || null,
    asset: pickAsset(json.assets, platform),
  };
}

function friendlyCheckError(err) {
  if (err && (err.status === 403 || err.status === 429)) return 'The update service is busy right now. Please try again in a little while.';
  if (err && err.status) return 'Couldn’t check for updates right now. Please try again later.';
  return 'Couldn’t check for updates. Check your internet connection and try again.';
}

// ---------- Small helpers ----------

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { timeout: 30 * 60 * 1000, ...options }, (err, stdout, stderr) => {
      if (err) {
        err.stdout = String(stdout || '');
        err.stderr = String(stderr || '');
        reject(err);
      } else {
        resolve(String(stdout || ''));
      }
    });
  });
}

/** A quick look at the file's first/last bytes, so a web page saved by mistake is never run. */
function looksLikeInstaller(file, platform) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(4);
    if (platform === 'win32') {
      fs.readSync(fd, buf, 0, 2, 0);
      return buf[0] === 0x4d && buf[1] === 0x5a; // "MZ"
    }
    if (platform === 'darwin') {
      if (size < 512) return false;
      fs.readSync(fd, buf, 0, 4, size - 512);
      return buf.toString('latin1') === 'koly'; // disk image trailer
    }
    return false;
  } finally {
    fs.closeSync(fd);
  }
}

const shellQuote = (s) => `'${String(s).replace(/'/g, "'\\''")}'`;
const appleString = (s) => `"${String(s).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;

/**
 * The command macOS runs as administrator. It copies the downloaded disk image into a new folder
 * only the system can write to, checks it there against the checksum GitHub published for it,
 * and only then opens it and runs the installer inside. So nothing on this Mac can swap the
 * file between the download and the install.
 * Exit codes: 3 = checksum mismatch, 4 = installer failed, 5 = disk image unusable.
 */
function macInstallScript(dmg, sha) {
  return [
    'd=$(/usr/bin/mktemp -d /private/var/tmp/taskpop-update.XXXXXX) || exit 1',
    'trap \'/usr/bin/hdiutil detach "$d/volume" -force >/dev/null 2>&1; /bin/rm -rf "$d"\' EXIT',
    `/bin/cp ${shellQuote(dmg)} "$d/update.dmg" || exit 1`,
    `[ "$(/usr/bin/shasum -a 256 "$d/update.dmg" | /usr/bin/awk '{print $1}')" = ${shellQuote(sha)} ] || exit 3`,
    '/bin/mkdir "$d/volume" || exit 1',
    '/usr/bin/hdiutil attach "$d/update.dmg" -nobrowse -readonly -noautoopen -noverify -mountpoint "$d/volume" >/dev/null 2>&1 || exit 5',
    'p=$(/usr/bin/find "$d/volume" -maxdepth 1 -type f -name "*.pkg" | /usr/bin/head -n 1)',
    '[ -n "$p" ] || exit 5',
    '/bin/cp "$p" "$d/update.pkg" || exit 1',
    '/usr/bin/hdiutil detach "$d/volume" -force >/dev/null 2>&1',
    '/usr/sbin/installer -pkg "$d/update.pkg" -target / >/dev/null 2>&1 || exit 4',
  ].join('; ');
}

// ---------- Installing ----------

const installers = {
  /** macOS: after one password prompt, the admin step checks the disk image and runs its installer. */
  async darwin(file, release) {
    const prompt = `TaskPop wants to install version ${release.version}.`;
    try {
      // The installer closes TaskPop, puts the new version in Applications and opens it again.
      await run('/usr/bin/osascript', ['-e',
        `do shell script ${appleString(macInstallScript(file, release.asset.sha256))} with prompt ${appleString(prompt)} with administrator privileges`]);
    } catch (err) {
      if (/-128/.test(err.stderr)) throw new UpdateError('Update canceled.', 'canceled');
      if (/\(3\)/.test(err.stderr)) throw new UpdateError('The update didn’t pass its safety check.', 'checksum');
      if (/\(5\)/.test(err.stderr)) throw new UpdateError('The downloaded update couldn’t be opened.', 'open');
      throw new UpdateError('The update couldn’t be installed.', 'install');
    }
    // Normally the installer has already closed this copy and opened the new one.
    return { relaunch: true };
  },

  /** Windows: run the new Setup in update mode. It closes TaskPop, installs, and reopens it. */
  async win32(file) {
    await new Promise((resolve, reject) => {
      let child;
      try {
        child = spawn(file, ['/UPDATE'], { detached: true, stdio: 'ignore' });
      } catch (_) {
        reject(new UpdateError('The installer couldn’t be started.', 'spawn'));
        return;
      }
      child.once('error', () => reject(new UpdateError('The installer couldn’t be started.', 'spawn')));
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
    });
    return { quit: true };
  },
};

// ---------- The updater ----------

class Updater extends EventEmitter {
  /**
   * saved:   what persist() stored last time ({ checkedAt, latest, notified, dismissed })
   * persist: called with the data to keep between launches
   * quit:    closes TaskPop (Windows, so Setup can replace it)
   * relaunch: restarts TaskPop (macOS, if the installer finished without restarting it)
   */
  constructor({ platform, currentVersion, saved = {}, persist = () => {}, quit = () => {}, relaunch = () => {}, managedBy = null }) {
    super();
    this.platform = platform;
    this.managedBy = managedBy; // 'store': the Microsoft Store updates this copy, not TaskPop
    this.current = currentVersion;
    this.persistFn = persist;
    this.quitFn = quit;
    this.relaunchFn = relaunch;
    this.supported = !managedBy && (platform === 'darwin' || platform === 'win32');
    this.status = 'idle'; // idle | up-to-date | available | downloading | installing | failed | error
    this.checking = false;
    this.progress = 0;
    this.message = '';
    this.checkedAt = Number(saved.checkedAt) || 0;
    this.notified = typeof saved.notified === 'string' ? saved.notified : null;
    this.dismissed = typeof saved.dismissed === 'string' ? saved.dismissed : null;
    this.justUpdated = null;
    this.lastAttemptAt = 0;
    this.checkPromise = null;
    this.installBusy = false;
    this.latest = null;
    // What was found last time is only used to show it; installing always asks GitHub again.
    const latest = saved.latest;
    if (latest && typeof latest === 'object' && parseVersion(latest.version) && compareVersions(latest.version, currentVersion) > 0) {
      this.latest = {
        version: parseVersion(latest.version).join('.'),
        notes: typeof latest.notes === 'string' ? latest.notes.slice(0, 1600) : '',
        page: isAllowedPage(latest.page) ? latest.page : null,
        publishedAt: Number(latest.publishedAt) || null,
        asset: latest.asset && typeof latest.asset === 'object' ? { size: Number(latest.asset.size) || 0 } : null,
      };
      this.status = 'available';
    } else if (this.checkedAt) {
      this.status = 'up-to-date';
    }
  }

  publicState() {
    const l = this.latest;
    return {
      supported: this.supported,
      managedBy: this.managedBy,
      status: this.status,
      checking: this.checking,
      current: this.current,
      latest: l ? { version: l.version, notes: l.notes, page: !!l.page, publishedAt: l.publishedAt, size: l.asset ? l.asset.size : 0 } : null,
      progress: this.progress,
      message: this.message,
      checkedAt: this.checkedAt,
      dismissed: !!l && this.dismissed === l.version,
      justUpdated: this.justUpdated,
    };
  }

  pageUrl() {
    return this.latest && isAllowedPage(this.latest.page) ? this.latest.page : config.releasesPage;
  }

  changed() {
    this.emit('change', this.publicState());
  }

  persist() {
    this.persistFn({
      checkedAt: this.checkedAt,
      latest: this.latest,
      notified: this.notified,
      dismissed: this.dismissed,
    });
  }

  busy() {
    return this.checking || this.installBusy || this.status === 'downloading' || this.status === 'installing';
  }

  /** Background check: at most every `everyMs`, and retry failures after 15 minutes. */
  maybeCheck(everyMs) {
    if (!this.supported || this.busy()) return false;
    const now = Date.now();
    const since = now - this.checkedAt; // a time in the future (clock changed) counts as old
    const sinceAttempt = now - this.lastAttemptAt;
    if ((since >= 0 && since < everyMs) || (sinceAttempt >= 0 && sinceAttempt < 15 * 60 * 1000)) return false;
    this.check();
    return true;
  }

  check(options) {
    if (!this.supported || this.busy()) return Promise.resolve(this.publicState());
    this.checkPromise = this.runCheck(options).finally(() => {
      this.checkPromise = null;
    });
    return this.checkPromise;
  }

  async runCheck({ manual = false } = {}) {
    this.checking = true;
    this.lastAttemptAt = Date.now();
    if (manual && (this.status === 'error' || this.status === 'failed')) {
      this.status = this.latest ? 'available' : 'idle';
    }
    if (manual) this.message = '';
    this.changed();
    try {
      const release = await this.fetchLatest();
      this.checkedAt = Date.now();
      if (release && release.asset && compareVersions(release.version, this.current) > 0) {
        const isNew = !this.latest || this.latest.version !== release.version;
        this.latest = release;
        if (this.status !== 'failed' || isNew) this.status = 'available';
        if (isNew) this.message = '';
        if (this.notified !== release.version) {
          this.notified = release.version;
          this.emit('available', { version: release.version, manual });
        }
      } else {
        this.latest = null;
        this.status = 'up-to-date';
        this.message = '';
      }
      this.persist();
    } catch (err) {
      console.error('TaskPop: update check failed', err && err.message);
      if (manual) {
        this.status = this.latest ? 'available' : 'error';
        this.message = friendlyCheckError(err);
      }
    } finally {
      this.checking = false;
      this.changed();
    }
    return this.publicState();
  }

  async fetchLatest() {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.checkTimeoutMs);
    try {
      const res = await net.fetch(config.api, {
        signal: controller.signal,
        headers: {
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': `TaskPop/${this.current}`,
        },
      });
      if (res.status === 404) return null; // no release published yet
      if (!res.ok) {
        const err = new Error(`GitHub answered ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return parseRelease(await res.json(), this.platform);
    } finally {
      clearTimeout(timer);
    }
  }

  /** The panel's × button. `kind` is what the bar was showing. */
  dismiss(kind) {
    if (kind === 'done') {
      this.justUpdated = null;
    } else if ((kind === 'available' || kind === 'failed') && this.latest) {
      this.dismissed = this.latest.version;
      if (this.status === 'failed') {
        this.status = 'available';
        this.message = '';
      }
      this.persist();
    }
    this.changed();
  }

  clearJustUpdated() {
    if (!this.justUpdated) return;
    this.justUpdated = null;
    this.changed();
  }

  setProgress(value) {
    const p = Math.max(0, Math.min(1, value));
    if (Math.floor(p * 100) === Math.floor(this.progress * 100)) return;
    this.progress = p;
    this.changed();
  }

  async install() {
    if (!this.supported || !this.latest || this.installBusy) return false;
    if (this.status === 'downloading' || this.status === 'installing') return false;
    this.installBusy = true;
    try {
      // If a check is running, let it finish first (so the two never overlap).
      if (this.checkPromise) await this.checkPromise.catch(() => {});
      return await this.runInstall();
    } finally {
      this.installBusy = false;
    }
  }

  async runInstall() {
    this.status = 'downloading';
    this.progress = 0;
    this.message = '';
    this.changed();
    try {
      // Always install what GitHub lists right now, never what was saved on this computer.
      let release;
      try {
        release = await this.fetchLatest();
      } catch (_) {
        throw new UpdateError('Couldn’t check for updates. Check your internet connection and try again.', 'offline');
      }
      if (!release || !release.asset || compareVersions(release.version, this.current) <= 0) {
        this.latest = null;
        this.status = 'up-to-date';
        this.checkedAt = Date.now();
        this.persist();
        this.changed();
        return false;
      }
      this.latest = release;
      this.persist();
      if (!release.asset.sha256) {
        throw new UpdateError('This update has no checksum to check it against, so TaskPop won’t install it. You can download it from the TaskPop website instead.', 'unverified');
      }
      const file = await this.download(release.asset);
      this.status = 'installing';
      this.progress = 1;
      this.changed();
      const result = await installers[this.platform].call(this, file, release);
      if (result && result.quit) setTimeout(() => this.quitFn(), 300);
      if (result && result.relaunch) setTimeout(() => this.relaunchFn(), 300);
      return true;
    } catch (err) {
      console.error('TaskPop: update failed', err);
      if (err instanceof UpdateError && err.code === 'canceled') {
        this.status = 'available';
        this.message = 'Update canceled.';
      } else {
        this.status = 'failed';
        this.message = err instanceof UpdateError ? err.message : 'The update couldn’t be downloaded. Check your internet connection and try again.';
      }
      this.progress = 0;
      this.changed();
      return false;
    }
  }

  static updateDir() {
    return path.join(app.getPath('temp'), 'TaskPop-update');
  }

  /** Removes files left over from an earlier update. */
  static cleanUp() {
    try {
      fs.rmSync(Updater.updateDir(), { recursive: true, force: true });
    } catch (_) {
      // a Setup that's still running keeps its file; it's removed next time
    }
  }

  async download(asset) {
    if (!isAllowedDownload(asset.url)) throw new UpdateError('The update file isn’t from TaskPop, so it wasn’t installed.', 'untrusted');
    const dir = Updater.updateDir();
    Updater.cleanUp();
    fs.mkdirSync(dir, { recursive: true });
    const safeName = asset.name.replace(/[^A-Za-z0-9._ -]/g, '_').replace(/^\.+/, '') || 'update';
    const file = path.join(dir, safeName);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.downloadTimeoutMs);
    const hash = crypto.createHash('sha256');
    let received = 0;
    let fd = null;
    try {
      const res = await net.fetch(asset.url, {
        signal: controller.signal,
        headers: { Accept: 'application/octet-stream', 'User-Agent': `TaskPop/${this.current}` },
      });
      if (!res.ok || !res.body) throw new UpdateError('The update couldn’t be downloaded. Please try again later.', 'download');
      const total = asset.size || Number(res.headers.get('content-length')) || 0;
      fd = fs.openSync(file, 'w');
      const reader = res.body.getReader();
      for (;;) {
        // eslint-disable-next-line no-await-in-loop
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
        received += chunk.length;
        if (received > config.maxDownloadBytes) throw new UpdateError('The update file is too large.', 'size');
        fs.writeSync(fd, chunk);
        hash.update(chunk);
        if (total) this.setProgress(received / total);
      }
    } catch (err) {
      if (err instanceof UpdateError) throw err;
      throw new UpdateError('The update couldn’t be downloaded. Check your internet connection and try again.', 'download');
    } finally {
      clearTimeout(timer);
      if (fd !== null) fs.closeSync(fd);
    }

    const bad = (message, code) => {
      fs.rmSync(file, { force: true });
      return new UpdateError(message, code);
    };
    if (asset.size && received !== asset.size) throw bad('The download was incomplete. Please try again.', 'incomplete');
    if (asset.sha256 && hash.digest('hex') !== asset.sha256) throw bad('The downloaded update didn’t pass its safety check.', 'checksum');
    if (!looksLikeInstaller(file, this.platform)) throw bad('The downloaded file isn’t a TaskPop installer.', 'type');
    return file;
  }
}

function createUpdater(options) {
  return new Updater(options);
}

module.exports = {
  createUpdater, Updater, UpdateError, config, installers,
  parseVersion, compareVersions, cleanNotes, pickAsset, parseRelease, macInstallScript, appleString, shellQuote,
  isAllowedDownload, isAllowedPage,
};
