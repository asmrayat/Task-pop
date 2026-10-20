// koffi, the bridge TaskPop uses to call macOS and Windows directly, set up once for the app.
//
// koffi runs each native call on a stack of its own, 1 MiB by default for calls from the main
// thread and 128 KiB for calls on worker threads. Some of the system code TaskPop calls (Windows
// Hello's activation, for one) is deep, so every module gets koffi from here, with roomier
// stacks set before the first call (koffi only takes a new size before the calls that use it).
// Untouched stack memory costs next to nothing.

const MiB = 1024 * 1024;
const STACKS = {
  sync_stack_size: 4 * MiB,
  async_stack_size: 4 * MiB,
};

const prepared = new WeakSet();

/** Give this koffi the bigger stacks (once). Never throws. */
function prepare(koffi) {
  if (!koffi || prepared.has(koffi)) return koffi;
  prepared.add(koffi);
  try {
    const now = koffi.config();
    const next = {};
    for (const [key, size] of Object.entries(STACKS)) {
      if (!(now[key] >= size)) next[key] = size;
    }
    if (Object.keys(next).length) koffi.config(next);
  } catch (err) {
    console.error('TaskPop: could not give native calls more stack', err);
  }
  return koffi;
}

/** The app's koffi, ready to use. Throws if koffi can't be loaded. */
function getKoffi() {
  return prepare(require('koffi'));
}

module.exports = { getKoffi, prepare, STACKS };
