// koffi, the bridge TaskPop uses to call macOS and Windows directly, set up once for the app.
//
// v1.10: koffi runs each native call on a stack of its own: 1 MiB for calls from the main
// thread, and only 128 KiB for calls it runs on a worker thread ("async" calls). Windows'
// "Windows Security" password prompt (CredUIPromptForWindowsCredentialsW, see verify.js) runs
// on a worker thread, so TaskPop keeps drawing while it's open, and it needs far more than
// 128 KiB: it ran off the end of its stack and Windows closed TaskPop. So the stacks are made
// bigger here, before the first call that uses them (koffi only allows that before its first
// async call, and a new size for main-thread calls only counts before the first of those).
// Untouched stack memory costs next to nothing; only one async call runs at a time.

const MiB = 1024 * 1024;
const STACKS = {
  sync_stack_size: 4 * MiB,
  async_stack_size: 8 * MiB,
  async_heap_size: 1 * MiB,
};
/** The least a worker-thread stack must have for the Windows Security prompt. */
const PROMPT_STACK = 4 * MiB;

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

/** Can a worker-thread call on this koffi show the Windows Security prompt safely? */
function hasPromptStack(koffi) {
  try {
    return koffi.config().async_stack_size >= PROMPT_STACK;
  } catch (_) {
    return false;
  }
}

module.exports = { getKoffi, prepare, hasPromptStack, STACKS, PROMPT_STACK };
