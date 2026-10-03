// Unit + integration tests for app/updater.js, run inside Electron (net.fetch needs it).
// A local HTTP server plays GitHub. For the macOS chain, stand-ins for hdiutil/osascript/installer
// are installed at their real paths so the real generated admin script runs.
const P = require('../paths');
const { app } = require('electron');
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync, spawnSync } = require('child_process');

const SRC = process.env.TP_SRC || P.APP;
const U = require(`${SRC}/updater.js`);
const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`[u] ${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- fake GitHub ----------
const DMG = fs.readFileSync(P.DMG);
const EXE = fs.readFileSync(P.EXE);
const HTML = Buffer.from('<html>not an installer</html>');
let mode = 'newer';
let lastHeaders = null;
let apiHits = 0;
let port = 0;
const base = () => `http://127.0.0.1:${port}`;
const releaseJson = (over = {}) => ({
  tag_name: 'v1.6.0',
  name: 'TaskPop 1.6.0',
  draft: false,
  prerelease: false,
  html_url: 'https://github.com/asmrayat/Task-pop/releases/tag/v1.6.0',
  published_at: '2026-10-01T10:00:00Z',
  body: '## What\'s new\r\n\r\n- **Faster** panel\r\n- Fixed [a bug](https://x.y) with `reminders`\r\n<!-- hidden -->',
  assets: [
    { name: 'TaskPop-1.6.0.dmg', state: 'uploaded', size: DMG.length, digest: `sha256:${sha(DMG)}`, browser_download_url: `${base()}/releases/download/v1.6.0/TaskPop-1.6.0.dmg` },
    { name: 'TaskPop-Setup-1.6.0.exe', state: 'uploaded', size: EXE.length, digest: `sha256:${sha(EXE)}`, browser_download_url: `${base()}/releases/download/v1.6.0/TaskPop-Setup-1.6.0.exe` },
    { name: 'notes.exe', state: 'uploaded', size: 3, browser_download_url: `${base()}/releases/download/v1.6.0/notes.exe` },
  ],
  ...over,
});
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/repos/')) {
    apiHits += 1;
    lastHeaders = req.headers;
    if (mode === 'hang') return; // never answers
    if (mode === 'slow') { setTimeout(() => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(releaseJson())); }, 700); return; }
    if (mode === '404') { res.writeHead(404, { 'content-type': 'application/json' }); res.end('{"message":"Not Found"}'); return; }
    if (mode === '500') { res.writeHead(500); res.end('oops'); return; }
    if (mode === '403') { res.writeHead(403); res.end('{"message":"API rate limit exceeded"}'); return; }
    let rel = releaseJson();
    if (mode === 'same') rel = releaseJson({ tag_name: 'v1.5.0' });
    if (mode === 'no-asset') rel = releaseJson({ assets: [] });
    if (mode === 'bad-digest') rel.assets.forEach((a) => { a.digest = `sha256:${'0'.repeat(64)}`; });
    if (mode === 'foreign') rel.assets.forEach((a) => { a.browser_download_url = a.browser_download_url.replace('/releases/download/', '/elsewhere/'); });
    if (mode === 'html') rel.assets.forEach((a) => { a.browser_download_url = `${base()}/releases/download/v1.6.0/page.html`; a.size = 0; a.digest = `sha256:${sha(HTML)}`; });
    if (mode === 'short') rel.assets.forEach((a) => { a.size += 10; });
    if (mode === 'no-digest') rel.assets.forEach((a) => { delete a.digest; });
    if (mode === '1.7') rel = releaseJson({ tag_name: 'v1.7.0' });
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(rel));
    return;
  }
  // GitHub redirects release downloads to its file storage.
  const m = req.url.match(/^\/releases\/download\/v1\.6\.0\/(.+)$/);
  if (m) { res.writeHead(302, { location: `/storage/${m[1]}` }); res.end(); return; }
  const s = req.url.match(/^\/storage\/(.+)$/);
  if (s) {
    const name = decodeURIComponent(s[1]);
    const body = name.endsWith('.dmg') ? DMG : name.endsWith('.exe') ? EXE : HTML;
    res.writeHead(200, { 'content-length': body.length, 'content-type': 'application/octet-stream' });
    // send in pieces so progress is visible
    let i = 0;
    const step = () => {
      if (i >= body.length) { res.end(); return; }
      res.write(body.subarray(i, i + 65536));
      i += 65536;
      setTimeout(step, 5);
    };
    step();
    return;
  }
  res.writeHead(404); res.end();
});

// ---------- macOS stand-ins ----------
const STUB = P.STUBS;
const macPaths = { '/usr/bin/hdiutil': 'hdiutil', '/usr/bin/osascript': 'osascript', '/usr/sbin/installer': 'installer' };
function installStubs() {
  for (const [dest, name] of Object.entries(macPaths)) {
    if (fs.existsSync(dest) && !fs.lstatSync(dest).isSymbolicLink()) throw new Error(`${dest} exists`);
    fs.rmSync(dest, { force: true });
    fs.symlinkSync(path.join(STUB, name), dest);
  }
  fs.mkdirSync('/private/var/tmp', { recursive: true });
}
function removeStubs() {
  for (const dest of Object.keys(macPaths)) fs.rmSync(dest, { force: true });
  fs.rmSync('/private', { recursive: true, force: true });
}

function makeUpdater(platform, saved = {}) {
  const calls = { persist: [], quit: 0, relaunch: 0, available: [] };
  const u = U.createUpdater({
    platform,
    currentVersion: '1.5.0',
    saved,
    persist: (d) => calls.persist.push(JSON.parse(JSON.stringify(d))),
    quit: () => { calls.quit += 1; },
    relaunch: () => { calls.relaunch += 1; },
  });
  u.on('available', (e) => calls.available.push(e));
  const progress = [];
  u.on('change', (s) => { if (s.status === 'downloading') progress.push(s.progress); });
  return { u, calls, progress };
}

app.whenReady().then(async () => {
  try {
    await run();
  } catch (err) {
    console.log('[u] CRASH', err.stack);
    results.push(false);
  }
  removeStubs();
  console.log(`[u] ${results.filter(Boolean).length}/${results.length} checks passed`);
  app.exit(0);
});

async function run() {
  // ---------- pure helpers ----------
  check('versions: v1.6.0 > 1.5.0', U.compareVersions('v1.6.0', '1.5.0') === 1);
  check('versions: 1.10.0 > 1.9.9', U.compareVersions('1.10.0', '1.9.9') === 1);
  check('versions: 1.5 == 1.5.0', U.compareVersions('1.5', '1.5.0') === 0);
  check('versions: v2 > 1.99.99', U.compareVersions('v2', '1.99.99') === 1);
  check('versions: 1.4.9 < 1.5.0', U.compareVersions('1.4.9', '1.5.0') === -1);
  check('versions: junk is never newer', U.compareVersions('latest', '1.5.0') === 0 && U.parseVersion('beta') === null);
  const notes = U.cleanNotes(releaseJson().body);
  check('release notes become plain text', notes === "What's new\n\n• Faster panel\n• Fixed a bug with reminders", JSON.stringify(notes));
  check('long notes are shortened', U.cleanNotes('x'.repeat(5000)).length === 1501);
  const winAsset = U.pickAsset(releaseJson().assets, 'win32');
  check('Windows picks the Setup .exe (not another .exe)', winAsset && winAsset.name === 'TaskPop-Setup-1.6.0.exe' && winAsset.sha256 === sha(EXE));
  const macAsset = U.pickAsset(releaseJson().assets, 'darwin');
  check('Mac picks the .dmg', macAsset && macAsset.name === 'TaskPop-1.6.0.dmg');
  check('no file for Linux', U.pickAsset(releaseJson().assets, 'linux') === null);
  check('half-uploaded files are ignored', U.pickAsset([{ name: 'TaskPop.dmg', state: 'starter', browser_download_url: 'x' }], 'darwin') === null);
  check('drafts and pre-releases are ignored', U.parseRelease(releaseJson({ draft: true }), 'darwin') === null && U.parseRelease(releaseJson({ prerelease: true }), 'darwin') === null);
  check('release page link only if it is on the repo', U.parseRelease(releaseJson({ html_url: 'https://evil.example/x' }), 'darwin').page === null
    && U.parseRelease(releaseJson(), 'darwin').page === 'https://github.com/asmrayat/Task-pop/releases/tag/v1.6.0');
  check('real repo is built in', U.config.api === 'https://api.github.com/repos/asmrayat/Task-pop/releases/latest'
    && U.config.downloadPrefix === 'https://github.com/asmrayat/Task-pop/releases/download/');

  // AppleScript quoting round trip, with awkward characters in the path
  const tricky = "/tmp/it's a \"test\" \\ dir/TaskPop-update.pkg";
  const script = U.macInstallScript(tricky, 'abc');
  const lit = U.appleString(script);
  const unq = lit.slice(1, -1).replace(/\\(.)/g, '$1');
  check('AppleScript string round-trips the admin script', unq === script);

  // ---------- against the fake GitHub ----------
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  port = server.address().port;
  U.config.api = `${base()}/repos/asmrayat/Task-pop/releases/latest`;
  U.config.downloadPrefix = `${base()}/releases/download/`;
  U.config.pagePrefix = 'https://github.com/asmrayat/Task-pop/';
  U.config.checkTimeoutMs = 1500;

  let t = makeUpdater('win32');
  mode = 'newer';
  let st = await t.u.check();
  check('finds 1.6.0 and says it is available', st.status === 'available' && st.latest.version === '1.6.0', st.status);
  check('asks GitHub properly (JSON + User-Agent)', lastHeaders && /github\+json/.test(lastHeaders.accept) && /^TaskPop\/1\.5\.0/.test(lastHeaders['user-agent']), lastHeaders && lastHeaders['user-agent']);
  check('"available" is announced once', t.calls.available.length === 1 && t.calls.available[0].version === '1.6.0');
  await t.u.check();
  check('... and not again for the same version', t.calls.available.length === 1);
  check('state is saved for next launch', t.calls.persist.length >= 1 && t.calls.persist.at(-1).latest.version === '1.6.0');
  check('no background check again within 4 hours', t.u.maybeCheck(4 * 3600 * 1000) === false);
  mode = '1.7';
  await t.u.check();
  check('a newer release is announced again', t.calls.available.length === 2 && t.calls.available[1].version === '1.7.0');
  mode = 'newer';
  await t.u.check();

  // restore from saved state
  const saved = t.calls.persist.at(-1);
  const t2 = makeUpdater('win32', saved);
  check('after a restart it still knows about 1.6.0', t2.u.publicState().status === 'available');
  const t3 = makeUpdater('win32', { ...saved, latest: { ...saved.latest, version: '1.5.0' } });
  check('once installed, the saved version is not offered again', t3.u.publicState().status !== 'available');
  const t4 = makeUpdater('win32', { checkedAt: 1 });
  check('background check runs when the last one is old', t4.u.maybeCheck(4 * 3600 * 1000) === true);
  await wait(300);

  // up to date, 404, errors
  mode = 'same';
  t = makeUpdater('win32');
  st = await t.u.check({ manual: true });
  check('same version -> up to date', st.status === 'up-to-date' && !st.latest);
  mode = 'no-asset';
  st = await makeUpdater('win32').u.check({ manual: true });
  check('release without a file for this computer -> up to date', st.status === 'up-to-date');
  mode = '404';
  st = await makeUpdater('win32').u.check({ manual: true });
  check('no releases yet (404) -> up to date', st.status === 'up-to-date');
  mode = '500';
  t = makeUpdater('win32');
  st = await t.u.check({ manual: true });
  check('server error on "Check now" -> friendly message', st.status === 'error' && /Couldn’t check/.test(st.message), st.message);
  st = await makeUpdater('win32').u.check();
  check('server error in the background -> nothing shown', st.status === 'idle' && !st.message);
  mode = '403';
  st = await makeUpdater('win32').u.check({ manual: true });
  check('rate limit -> "GitHub is busy"', /busy/.test(st.message));
  mode = 'hang';
  const t0 = Date.now();
  st = await makeUpdater('win32').u.check({ manual: true });
  check('no answer -> gives up after the timeout', st.status === 'error' && Date.now() - t0 < 5000 && /Couldn’t check for updates/.test(st.message), `${Date.now() - t0} ms`);
  const deadPort = port;
  U.config.api = 'http://127.0.0.1:9/nothing';
  st = await makeUpdater('win32').u.check({ manual: true });
  check('offline -> "Couldn’t check for updates"', /Couldn’t check for updates/.test(st.message), st.message);
  U.config.api = `http://127.0.0.1:${deadPort}/repos/asmrayat/Task-pop/releases/latest`;

  // ---------- Windows install ----------
  let handed = null;
  const realWin = U.installers.win32;
  U.installers.win32 = async (file) => { handed = { file, sha: sha(fs.readFileSync(file)) }; return { quit: true }; };
  mode = 'newer';
  t = makeUpdater('win32');
  await t.u.check();
  const ok = await t.u.install();
  await wait(400);
  check('Windows: downloads, checks and hands the Setup to Windows', ok && handed && handed.sha === sha(EXE) && handed.file.endsWith('TaskPop-Setup-1.6.0.exe'), handed && handed.file);
  check('Windows: download progress goes up to 100%', t.progress.length >= 3 && t.progress.at(-1) >= 0.99 && t.progress.every((p, i) => i === 0 || p >= t.progress[i - 1]), t.progress.length + ' steps');
  check('Windows: TaskPop closes so Setup can replace it', t.calls.quit === 1);

  for (const [m, re, label] of [
    ['bad-digest', /safety check/, 'wrong checksum -> refused'],
    ['foreign', /isn’t from TaskPop/, 'file from somewhere else -> refused'],
    ['html', /isn’t a TaskPop installer/, 'a web page instead of an installer -> refused'],
    ['short', /incomplete/, 'incomplete download -> refused'],
  ]) {
    handed = null;
    mode = m;
    t = makeUpdater('win32');
    await t.u.check();
    const r = await t.u.install();
    const s2 = t.u.publicState();
    check(`Windows: ${label}`, !r && !handed && s2.status === 'failed' && re.test(s2.message) && t.calls.quit === 0, s2.message);
  }
  const leftovers = fs.readdirSync(U.Updater.updateDir());
  check('a refused file is deleted', leftovers.length === 0, leftovers.join(','));

  // real Windows installer launcher: spawn failure is reported (no Windows here)
  U.installers.win32 = realWin;
  mode = 'newer';
  t = makeUpdater('win32');
  await t.u.check();
  await t.u.install();
  const ws = t.u.publicState();
  check('Windows: if Setup can’t start, it says so (and TaskPop stays open)', ws.status === 'failed' && /couldn’t be started/.test(ws.message) && t.calls.quit === 0, ws.message);

  // ---------- macOS install, through the real admin script ----------
  installStubs();
  fs.writeFileSync(P.TMP + '/mac-stub.log', '');
  for (const f of ['stub-cancel', 'stub-install-fail', 'installed-pkg.sha']) fs.rmSync(`${P.TMP}/${f}`, { force: true });
  execFileSync(P.BUILD_BIN + '/dmg', ['extract', P.DMG, P.TMP + '/ref.img'], { stdio: 'ignore' });
  execFileSync(P.BUILD_BIN + '/hfsplus', [P.TMP + '/ref.img', 'extract', '/Install TaskPop.pkg', P.TMP + '/ref.pkg'], { stdio: 'ignore' });
  const refPkgSha = sha(fs.readFileSync(P.TMP + '/ref.pkg'));

  mode = 'newer';
  t = makeUpdater('darwin');
  await t.u.check();
  const mok = await t.u.install();
  await wait(400);
  const installedSha = fs.existsSync(P.TMP + '/installed-pkg.sha') ? fs.readFileSync(P.TMP + '/installed-pkg.sha', 'utf8').trim() : null;
  const installedPath = fs.existsSync(P.TMP + '/installed-pkg.path') ? fs.readFileSync(P.TMP + '/installed-pkg.path', 'utf8').trim() : '';
  check('Mac: the installer inside the DMG is what gets installed', mok && installedSha === refPkgSha, `${installedSha && installedSha.slice(0, 12)} vs ${refPkgSha.slice(0, 12)}`);
  check('Mac: it runs from a system-only folder, not the download folder', installedPath.startsWith('/private/var/tmp/taskpop-update.'), installedPath);
  check('Mac: that folder is removed afterwards', fs.readdirSync('/private/var/tmp').filter((n) => n.startsWith('taskpop-update.')).length === 0);
  check('Mac: the password prompt names the version', fs.readFileSync(P.TMP + '/mac-prompt.txt', 'utf8') === 'TaskPop wants to install version 1.6.0.');
  check('Mac: the disk image is detached again', /hdiutil detach/.test(fs.readFileSync(P.TMP + '/mac-stub.log', 'utf8')));
  check('Mac: restarts TaskPop if the installer didn’t', t.calls.relaunch === 1 && t.calls.quit === 0);

  fs.writeFileSync(P.TMP + '/stub-cancel', '');
  t = makeUpdater('darwin');
  await t.u.check();
  await t.u.install();
  let ms = t.u.publicState();
  check('Mac: cancel at the password prompt -> back to "available"', ms.status === 'available' && ms.message === 'Update canceled.' && t.calls.relaunch === 0, ms.status);
  fs.rmSync(P.TMP + '/stub-cancel');

  fs.writeFileSync(P.TMP + '/stub-install-fail', '');
  t = makeUpdater('darwin');
  await t.u.check();
  await t.u.install();
  ms = t.u.publicState();
  check('Mac: installer failure -> "couldn’t be installed"', ms.status === 'failed' && /couldn’t be installed/.test(ms.message), ms.message);
  fs.rmSync(P.TMP + '/stub-install-fail');

  // Swapping the downloaded disk image before the admin step runs is caught there.
  const script2 = fs.readFileSync(P.TMP + '/mac-script.txt', 'utf8');
  const dmgPath = script2.match(/\/bin\/cp '([^']+)' "\$d\/update\.dmg"/)[1];
  fs.writeFileSync(dmgPath, 'tampered');
  fs.rmSync(P.TMP + '/installed-pkg.sha', { force: true });
  const r2 = spawnSync('/bin/sh', ['-c', script2]);
  check('Mac: a swapped disk image is refused by the admin step (exit 3), nothing installed', r2.status === 3 && !fs.existsSync(P.TMP + '/installed-pkg.sha'), `exit ${r2.status}`);
  check('Mac: the checksum the admin step uses is the one GitHub published', script2.includes(`= '${sha(DMG)}' ]`));
  check('Mac: the admin script is one line (safe for AppleScript)', !script2.includes('\n'));

  // DMG without an installer inside
  mode = 'html';
  t = makeUpdater('darwin');
  await t.u.check();
  await t.u.install();
  ms = t.u.publicState();
  check('Mac: a non-DMG download is refused before anything runs', ms.status === 'failed' && /isn’t a TaskPop installer/.test(ms.message), ms.message);

  // ---------- fixes from the review ----------
  U.installers.win32 = async (file) => { handed = { file, sha: sha(fs.readFileSync(file)) }; return { quit: true }; };
  mode = 'no-digest';
  t = makeUpdater('win32');
  await t.u.check();
  handed = null;
  await t.u.install();
  st = t.u.publicState();
  check('a release file without a GitHub checksum is not installed', !handed && st.status === 'failed' && /no checksum/.test(st.message), st.message);

  check('download links can’t escape the repo with ../', !U.isAllowedDownload(`${base()}/releases/download/../../evil/x.exe`)
    && !U.isAllowedDownload(`http://127.0.0.2:${port}/releases/download/x.exe`) && U.isAllowedDownload(`${base()}/releases/download/v1/x.exe`));
  U.config.downloadPrefix = 'https://github.com/asmrayat/Task-pop/releases/download/';
  check('real prefix: another repo via ../ is refused', !U.isAllowedDownload('https://github.com/asmrayat/Task-pop/releases/download/../../../evil/repo/releases/download/v1/x.exe')
    && !U.isAllowedDownload('https://github.com.evil.example/asmrayat/Task-pop/releases/download/v1/x.exe')
    && !U.isAllowedDownload('https://user@github.com/asmrayat/Task-pop/releases/download/v1/x.exe')
    && U.isAllowedDownload('https://github.com/asmrayat/Task-pop/releases/download/v1.6.0/TaskPop-Setup-1.6.0.exe'));
  U.config.downloadPrefix = `${base()}/releases/download/`;

  // Tampered saved state is never used to download
  mode = 'newer';
  t = makeUpdater('win32', { latest: { version: '1.6.0', page: 'https://evil.example/', asset: { url: 'https://evil.example/x.exe', sha256: '0'.repeat(64), size: 3 } } });
  check('saved state: a foreign page link is dropped when loading', t.u.pageUrl() === U.config.releasesPage);
  handed = null;
  await t.u.install();
  check('saved state: install asks GitHub again and ignores the saved file link', handed && handed.sha === sha(EXE), handed && handed.file);

  // Release withdrawn since it was found
  mode = 'same';
  t = makeUpdater('win32', { latest: { version: '1.6.0', asset: { size: 1 } } });
  handed = null;
  const w = await t.u.install();
  check('a release that was taken down is not installed (back to up to date)', !w && !handed && t.u.publicState().status === 'up-to-date');

  // Update clicked while a check is running: waits for it, installs once
  mode = 'slow';
  t = makeUpdater('win32', { latest: { version: '1.6.0', asset: { size: 1 } } });
  let installs = 0;
  U.installers.win32 = async (file) => { installs += 1; handed = { file, sha: sha(fs.readFileSync(file)) }; return { quit: true }; };
  const pc = t.u.check({ manual: true });
  const [i1, i2] = await Promise.all([t.u.install(), t.u.install(), pc]);
  check('Update during a check: waits for the check, installs exactly once', installs === 1 && i1 === true && i2 === false && handed.sha === sha(EXE), `${installs} install(s)`);
  mode = 'newer';

  // × on the bar dismisses what it shows
  t = makeUpdater('win32');
  await t.u.check();
  t.u.justUpdated = '1.5.0';
  t.u.dismiss('available');
  st = t.u.publicState();
  check('× on "available" hides that, keeps the "Updated" note state', st.dismissed && st.justUpdated === '1.5.0');
  t.u.dismiss('done');
  check('× on "Updated to" clears only that', !t.u.publicState().justUpdated);
  t.u.status = 'failed';
  t.u.message = 'x';
  t.u.dismiss('failed');
  check('× on a failed update hides it (back to available)', t.u.publicState().status === 'available' && !t.u.publicState().message);

  // A saved check time in the future (clock was wrong) doesn't block checks
  t = makeUpdater('win32', { checkedAt: Date.now() + 10 * 86400000 });
  check('a check time in the future doesn’t block background checks', t.u.maybeCheck(4 * 3600 * 1000) === true);
  await wait(300);

  // Linux: not supported, never checks
  const lin = makeUpdater('linux');
  const hitsBefore = apiHits;
  await lin.u.check({ manual: true });
  check('unsupported systems never contact GitHub', apiHits === hitsBefore && !lin.u.publicState().supported);
  server.close();
}
