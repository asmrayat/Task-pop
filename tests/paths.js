// Where things are, for every test. Override with environment variables if you need to:
//   TP_SRC  the app to test (default: app/)       TP_TMP  scratch folder (default: system temp)
//   TP_DMG / TP_EXE  installers the update tests serve (default: what the build scripts write)
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const APP = process.env.TP_SRC || path.join(REPO, 'app');
const TMP = process.env.TP_TMP || path.join(os.tmpdir(), 'taskpop-tests');
process.env.TP_TMP = TMP; // the macOS command stand-ins read it too
fs.mkdirSync(path.join(TMP, 'shots'), { recursive: true });
const VERSION = JSON.parse(fs.readFileSync(path.join(APP, 'package.json'), 'utf8')).version;

module.exports = {
  REPO,
  APP,
  TMP,
  SHOTS: path.join(TMP, 'shots'),
  VERSION,
  DMG: process.env.TP_DMG || path.join(REPO, 'installers', 'mac', 'out', `TaskPop-${VERSION}.dmg`),
  EXE: process.env.TP_EXE || path.join(REPO, 'installers', 'windows', 'out', `TaskPop-Setup-${VERSION}.exe`),
  STUBS: path.join(REPO, 'tests', 'stubs'),
  BUILD_BIN: path.join(REPO, '.build-tools', 'bin'),
};
