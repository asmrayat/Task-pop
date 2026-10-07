// macOS desktops (Spaces), v1.8.1.
//
// The panel is meant to open on whichever desktop you're on. Electron marks it to "join all
// Spaces", but on recent macOS a window marked like that, once hidden and shown again, can stay
// on the desktop where it was first shown: you double-tap on Desktop 2 and the panel opens on
// Desktop 1, out of sight (or under a full-screen app such as VLC).
//
// So for the moment it's shown, the window is marked "move to the active Space" instead, which
// is AppKit's own way of saying "come to me, don't take me to you", and afterwards its usual
// marking is put back. The two markings can't be set together (AppKit throws), so the switch
// goes straight to NSWindow, past Electron's panel class, which would add "join all Spaces"
// back on top of anything it's given.
//
// Nothing here is needed on Windows, which has no per-desktop windows for the tray panel.

// NSWindowCollectionBehavior
const CAN_JOIN_ALL_SPACES = 1 << 0;
const MOVE_TO_ACTIVE_SPACE = 1 << 1;
const STATIONARY = 1 << 4;

/** The marking to use while showing: "move to the active Space", never with "join all Spaces". */
function movingBehavior(behavior) {
  return (behavior & ~(CAN_JOIN_ALL_SPACES | STATIONARY)) | MOVE_TO_ACTIVE_SPACE;
}

let ObjcSuper = null; // koffi struct type, made once per process

/**
 * Returns { showHere(win, show), onActiveSpace(win), behavior(win) }, or throws if the
 * Objective-C runtime can't be reached. libPath is for tests (a stand-in runtime).
 */
function createMacSpaces(koffi, libPath = '/usr/lib/libobjc.A.dylib') {
  const objc = koffi.load(libPath);
  const getClass = objc.func('objc_getClass', 'void *', ['const char *']);
  const selector = objc.func('sel_registerName', 'void *', ['const char *']);
  const sendPointer = objc.func('objc_msgSend', 'void *', ['void *', 'void *']);
  const sendNumber = objc.func('objc_msgSend', 'uint64_t', ['void *', 'void *']);
  const sendFlag = objc.func('objc_msgSend', 'bool', ['void *', 'void *']);
  const sendFlagWith = objc.func('objc_msgSend', 'bool', ['void *', 'void *', 'void *']);
  if (!ObjcSuper) ObjcSuper = koffi.struct('TaskPopObjcSuper', { receiver: 'void *', super_class: 'void *' });
  const sendSuperNumber = objc.func('objc_msgSendSuper', 'void', [koffi.pointer(ObjcSuper), 'void *', 'uint64_t']);

  const windowClass = getClass('NSWindow');
  if (!windowClass) throw new Error('NSWindow not found');
  const sel = {
    window: selector('window'),
    isKindOfClass: selector('isKindOfClass:'),
    collectionBehavior: selector('collectionBehavior'),
    setCollectionBehavior: selector('setCollectionBehavior:'),
    isOnActiveSpace: selector('isOnActiveSpace'),
  };

  /** The NSWindow behind an Electron BrowserWindow (its handle is the content NSView). */
  function nsWindow(win) {
    const handle = win.getNativeWindowHandle();
    if (!handle || handle.length < 8) return null;
    const view = handle.readBigUInt64LE(0);
    if (!view) return null;
    const window = sendPointer(view, sel.window);
    if (!window || !sendFlagWith(window, sel.isKindOfClass, windowClass)) return null;
    return window;
  }
  const readBehavior = (window) => Number(sendNumber(window, sel.collectionBehavior));
  // NSWindow's own setter, not the panel's (which would add "join all Spaces" again)
  const writeBehavior = (window, value) => sendSuperNumber({ receiver: window, super_class: windowClass }, sel.setCollectionBehavior, value);

  return {
    /** Show the window on the desktop you're on: show() runs while it's marked to move there. */
    showHere(win, show) {
      let window = null;
      let before = null;
      try {
        window = nsWindow(win);
        if (window) {
          before = readBehavior(window);
          writeBehavior(window, movingBehavior(before));
        }
      } catch (err) {
        console.error('TaskPop: could not bring the window to this desktop', err);
        before = null;
      }
      try {
        show();
      } finally {
        if (window && before !== null) {
          try {
            writeBehavior(window, before & ~MOVE_TO_ACTIVE_SPACE);
          } catch (err) {
            console.error('TaskPop: could not restore how the window joins desktops', err);
          }
        }
      }
    },
    /** Whether the window is on the desktop you're looking at (null if that can't be told). */
    onActiveSpace(win) {
      try {
        const window = nsWindow(win);
        return window ? !!sendFlag(window, sel.isOnActiveSpace) : null;
      } catch (_) {
        return null;
      }
    },
    behavior(win) {
      try {
        const window = nsWindow(win);
        return window ? readBehavior(window) : null;
      } catch (_) {
        return null;
      }
    },
  };
}

/** For the app: macOS only; null (and the panel just shows the old way) if it isn't available. */
function createSpaces() {
  if (process.platform !== 'darwin') return null;
  try {
    return createMacSpaces(require('koffi'));
  } catch (err) {
    console.error('TaskPop: desktop handling unavailable', err);
    return null;
  }
}

module.exports = { createSpaces, createMacSpaces, movingBehavior, CAN_JOIN_ALL_SPACES, MOVE_TO_ACTIVE_SPACE, STATIONARY };
