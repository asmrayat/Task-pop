// A local stand-in for GitHub's release API and file downloads.
const P = require('../paths');
const http = require('http');
const fs = require('fs');
const crypto = require('crypto');

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const DMG = fs.readFileSync(process.env.TP_DMG || P.DMG);
const EXE = fs.readFileSync(process.env.TP_EXE || P.EXE);

function start(state) {
  state.mode = state.mode || 'newer';
  state.hits = 0;
  const base = () => `http://127.0.0.1:${state.port}`;
  const release = (tag) => ({
    tag_name: tag, name: `TaskPop ${tag.slice(1)}`, draft: false, prerelease: false,
    html_url: `https://github.com/asmrayat/Task-pop/releases/tag/${tag}`,
    published_at: state.publishedAt || '2026-10-01T10:00:00Z',
    body: state.body || '## What\'s new in this version\r\n\r\n- **Update bar**: TaskPop tells you when a new version is out\r\n- Faster panel on older Macs\r\n- Fixed reminders that fired twice after sleep',
    assets: [
      { name: `TaskPop-${tag.slice(1)}.dmg`, state: 'uploaded', size: DMG.length, digest: `sha256:${sha(DMG)}`, browser_download_url: `${base()}/releases/download/${tag}/TaskPop-${tag.slice(1)}.dmg` },
      { name: `TaskPop-Setup-${tag.slice(1)}.exe`, state: 'uploaded', size: EXE.length, digest: `sha256:${sha(EXE)}`, browser_download_url: `${base()}/releases/download/${tag}/TaskPop-Setup-${tag.slice(1)}.exe` },
    ],
  });
  const server = http.createServer((req, res) => {
    if (req.url.startsWith('/repos/')) {
      state.hits += 1;
      if (state.mode === 'down') { req.socket.destroy(); return; }
      let rel = release(state.mode === 'same' ? (state.sameTag || 'v1.5.0') : (state.newTag || 'v1.6.0'));
      if (state.mode === 'bad-digest') rel.assets.forEach((a) => { a.digest = `sha256:${'0'.repeat(64)}`; });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(rel));
      return;
    }
    const m = req.url.match(/^\/releases\/download\/v[\d.]+\/(.+)$/);
    if (m) { res.writeHead(302, { location: `/storage/${m[1]}` }); res.end(); return; }
    const s = req.url.match(/^\/storage\/(.+)$/);
    if (s) {
      const body = s[1].endsWith('.dmg') ? DMG : EXE;
      res.writeHead(200, { 'content-length': body.length });
      let i = 0;
      const step = () => { if (i >= body.length) { res.end(); return; } res.write(body.subarray(i, i + 32768)); i += 32768; setTimeout(step, state.chunkDelay || 8); };
      step();
      return;
    }
    res.writeHead(404); res.end();
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    state.port = server.address().port;
    resolve({ server, base: base(), sha, DMG, EXE });
  }));
}

module.exports = { start, sha };
