// Double-tap trigger: open TaskPop by tapping a modifier key twice
// (Mac: Control, Option, Command or Shift. Windows: Ctrl, Alt or Shift).
//
// Privacy: this only reads which modifier keys are held right now, plus a running count of
// key presses and clicks (to tell a lone tap apart from shortcuts like ⌘C ⌘V / Ctrl+C Ctrl+V).
// It never records which keys you type.

const KEY_MASKS = {
  shift: 0x20000, // kCGEventFlagMaskShift
  control: 0x40000, // kCGEventFlagMaskControl
  option: 0x80000, // kCGEventFlagMaskAlternate
  command: 0x100000, // kCGEventFlagMaskCommand
};
const ALL_MODIFIERS = KEY_MASKS.shift | KEY_MASKS.control | KEY_MASKS.option | KEY_MASKS.command;

const MAX_HOLD_MS = 350; // a tap is a quick press and release
const MAX_GAP_MS = 400; // time allowed between the first release and the second press

/**
 * Pure double-tap detector. Feed it samples: time (ms), modifier flags, and an activity count
 * that goes up whenever a normal key is pressed or the mouse is clicked.
 */
class DoubleTapDetector {
  constructor(key, onTrigger) {
    this.onTrigger = onTrigger;
    // For the double-tap report in Settings: counts only, never which keys
    this.stats = { taps: 0, doubleTaps: 0, withOtherKeys: 0, heldTooLong: 0, single: 0 };
    this.setKey(key);
  }

  setKey(key) {
    this.mask = KEY_MASKS[key] || 0;
    this.otherMask = ALL_MODIFIERS & ~this.mask;
    this.reset();
  }

  reset() {
    this.down = false;
    this.pressAt = 0;
    this.pressActivity = 0;
    this.dirty = false;
    this.firstTapAt = 0; // release time of a clean first tap waiting for its partner
    this.lastActivity = null;
  }

  sample(now, flags, activity) {
    if (!this.mask) return false;
    const isDown = (flags & this.mask) !== 0;
    const others = (flags & this.otherMask) !== 0;
    if (this.lastActivity === null) this.lastActivity = activity;
    const typed = activity !== this.lastActivity;
    this.lastActivity = activity;
    let fired = false;

    if (!this.down && isDown) {
      // Pressed
      this.down = true;
      this.pressAt = now;
      this.pressActivity = activity;
      this.dirty = others || typed;
      if (this.firstTapAt && (now - this.firstTapAt > MAX_GAP_MS || typed)) {
        if (!typed) this.stats.single += 1;
        this.firstTapAt = 0;
      }
    } else if (this.down && isDown) {
      // Held
      if (others || activity !== this.pressActivity) this.dirty = true;
    } else if (this.down && !isDown) {
      // Released
      this.down = false;
      const clean = !this.dirty && !others && activity === this.pressActivity && now - this.pressAt <= MAX_HOLD_MS;
      if (!clean) {
        if (now - this.pressAt > MAX_HOLD_MS) this.stats.heldTooLong += 1;
        else this.stats.withOtherKeys += 1;
        this.firstTapAt = 0;
      } else if (this.firstTapAt && this.pressAt - this.firstTapAt <= MAX_GAP_MS) {
        this.stats.taps += 1;
        this.stats.doubleTaps += 1;
        this.firstTapAt = 0;
        fired = true;
      } else {
        this.stats.taps += 1;
        this.firstTapAt = now;
      }
    } else if (this.firstTapAt && (others || typed || now - this.firstTapAt > MAX_GAP_MS)) {
      // Between taps: typing, another modifier or waiting too long cancels the first tap.
      if (!others && !typed) this.stats.single += 1;
      this.firstTapAt = 0;
    }

    if (fired && this.onTrigger) this.onTrigger();
    return fired;
  }
}

// NSActivityUserInitiatedAllowingIdleSystemSleep: user-facing work that must not be napped,
// while still letting the Mac go to sleep as usual.
const MAC_ACTIVITY_OPTIONS = 0x00ffffff & ~(1 << 20);

/**
 * macOS App Nap: TaskPop has no window on screen most of the time, so macOS may "nap" it and
 * stretch its timers from milliseconds to whole seconds. Then the key-state checks run too
 * rarely to see a quick double-tap, and it's missed until something (like switching Spaces)
 * wakes the app again. While double-tap is on, TaskPop tells macOS it is doing user-facing
 * work (as a music player does), which turns App Nap off for it. It doesn't keep the Mac awake.
 * Returns start(), which returns stop().
 */
function createMacAppNapGuard(koffi) {
  const objc = koffi.load('/usr/lib/libobjc.A.dylib');
  const getClass = objc.func('objc_getClass', 'void *', ['const char *']);
  const selector = objc.func('sel_registerName', 'void *', ['const char *']);
  const send = objc.func('objc_msgSend', 'void *', ['void *', 'void *']);
  const sendText = objc.func('objc_msgSend', 'void *', ['void *', 'void *', 'const char *']);
  const sendBegin = objc.func('objc_msgSend', 'void *', ['void *', 'void *', 'uint64_t', 'void *']);
  const sendEnd = objc.func('objc_msgSend', 'void', ['void *', 'void *', 'void *']);
  return () => {
    const processInfoClass = getClass('NSProcessInfo');
    const stringClass = getClass('NSString');
    if (!processInfoClass || !stringClass) throw new Error('Foundation classes not found');
    const info = send(processInfoClass, selector('processInfo'));
    const reason = sendText(stringClass, selector('stringWithUTF8String:'), 'Watching for the double-tap shortcut');
    if (!info || !reason) throw new Error('NSProcessInfo unavailable');
    const activity = sendBegin(info, selector('beginActivityWithOptions:reason:'), MAC_ACTIVITY_OPTIONS, reason);
    if (!activity) throw new Error('beginActivity failed');
    const token = send(activity, selector('retain')); // keep it until double-tap is turned off
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      sendEnd(info, selector('endActivity:'), token);
      send(token, selector('release'));
    };
  };
}

// macOS event types TaskPop listens for, and the tap's own notices
const MAC_EVENT = { leftMouseDown: 1, rightMouseDown: 3, keyDown: 10, flagsChanged: 12, otherMouseDown: 25 };
const MAC_TAP_DISABLED = [0xfffffffe, 0xffffffff]; // by timeout, by user input
const MAC_TAP_MASK = Object.values(MAC_EVENT).reduce((mask, type) => mask + 2 ** type, 0);
const UTF8 = 0x08000100; // kCFStringEncodingUTF8
let macTapCallbackType = null;

/**
 * macOS (v1.6.8): hear the modifier keys as events instead of only checking them every few
 * milliseconds. Checking relies on TaskPop's timers running on time while it sits in the
 * background, and on some Macs they don't (with a video player open, for one), so a quick
 * double-tap fell between two checks and nothing happened. A listen-only event tap (it needs the
 * same Input Monitoring permission) is handed every modifier change, key press and click as it
 * happens. TaskPop reads only the modifier flags of each event and counts the rest; it never
 * looks at which key was pressed, and it can't change or block any event.
 *
 * Returns listen(onEvent): starts the tap and returns stop(), or null if macOS refused it.
 * onEvent(kind, flags): kind is 'modifiers', 'press' (a key or a click) or 'disabled'.
 */
function createMacEventTap(koffi, cg, cf) {
  if (!macTapCallbackType) {
    macTapCallbackType = koffi.proto('void *TaskPopEventTapCallback(void *proxy, uint32_t type, void *event, void *info)');
  }
  const tapCreate = cg.func('void *CGEventTapCreate(uint32_t tap, uint32_t place, uint32_t options, uint64_t mask, TaskPopEventTapCallback *callback, void *info)');
  const tapEnable = cg.func('void CGEventTapEnable(void *tap, bool enable)');
  const eventFlags = cg.func('uint64_t CGEventGetFlags(void *event)');
  const portSource = cf.func('void *CFMachPortCreateRunLoopSource(void *allocator, void *port, intptr_t order)');
  const mainLoop = cf.func('void *CFRunLoopGetMain()');
  const addSource = cf.func('void CFRunLoopAddSource(void *loop, void *source, void *mode)');
  const removeSource = cf.func('void CFRunLoopRemoveSource(void *loop, void *source, void *mode)');
  const makeString = cf.func('void *CFStringCreateWithCString(void *allocator, const char *text, uint32_t encoding)');
  const invalidate = cf.func('void CFMachPortInvalidate(void *port)');
  const release = cf.func('void CFRelease(void *object)');
  const SESSION = 1; // kCGSessionEventTap
  const HEAD = 0; // kCGHeadInsertEventTap
  const LISTEN_ONLY = 1; // kCGEventTapOptionListenOnly

  return (onEvent) => {
    let port = null;
    const callback = koffi.register((proxy, type, event) => {
      try {
        if (MAC_TAP_DISABLED.includes(type)) {
          if (port) tapEnable(port, true); // macOS paused the tap: carry on
          onEvent('disabled', 0);
        } else if (event) {
          onEvent(type === MAC_EVENT.flagsChanged ? 'modifiers' : 'press', Number(eventFlags(event)) & ALL_MODIFIERS);
        }
      } catch (err) {
        console.error('TaskPop: key event failed', err);
      }
      return null; // a listen-only tap can't change events
    }, koffi.pointer(macTapCallbackType));
    port = tapCreate(SESSION, HEAD, LISTEN_ONLY, MAC_TAP_MASK, callback, null);
    if (!port) {
      koffi.unregister(callback);
      return null;
    }
    const source = portSource(null, port, 0);
    // The default mode only: not while a menu is open or a dialog is up, when there's nothing to open
    const mode = makeString(null, 'kCFRunLoopDefaultMode', UTF8);
    const loop = mainLoop();
    addSource(loop, source, mode);
    tapEnable(port, true);
    let stopped = false;
    return () => {
      if (stopped) return;
      stopped = true;
      tapEnable(port, false);
      removeSource(loop, source, mode);
      invalidate(port);
      release(source);
      release(port);
      release(mode);
      koffi.unregister(callback);
    };
  };
}

/** Reads modifier state from macOS. Returns null if it isn't available. */
function createMacKeySource() {
  if (process.platform !== 'darwin') return null;
  let koffi;
  try {
    koffi = require('koffi');
  } catch (err) {
    console.error('TaskPop: double-tap unavailable (native bridge failed to load)', err);
    return null;
  }
  let cg = null;
  for (const lib of [
    '/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics',
    '/System/Library/Frameworks/ApplicationServices.framework/ApplicationServices',
  ]) {
    try {
      cg = koffi.load(lib);
      break;
    } catch (_) {
      // try the next one
    }
  }
  if (!cg) return null;

  try {
    const flagsState = cg.func('uint64_t CGEventSourceFlagsState(int32_t stateID)');
    const counter = cg.func('uint32_t CGEventSourceCounterForEventType(int32_t stateID, uint32_t eventType)');
    let preflight = null;
    let request = null;
    try {
      preflight = cg.func('bool CGPreflightListenEventAccess()');
      request = cg.func('bool CGRequestListenEventAccess()');
    } catch (_) {
      // Older macOS: no Input Monitoring API
    }
    const HID = 1; // kCGEventSourceStateHIDSystemState: the physical keyboard
    const COMBINED = 0; // kCGEventSourceStateCombinedSessionState
    // keyDown, leftMouseDown, rightMouseDown, otherMouseDown
    const ACTIVITY_TYPES = [10, 1, 3, 25];
    let keepAwake = null;
    try {
      keepAwake = createMacAppNapGuard(koffi);
    } catch (err) {
      console.error('TaskPop: could not opt out of App Nap', err);
    }
    let tap = null;
    try {
      tap = createMacEventTap(koffi, cg, koffi.load('/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation'));
    } catch (err) {
      console.error('TaskPop: key events unavailable, checking the keys instead', err);
    }
    return {
      flags: () => (Number(flagsState(HID)) | Number(flagsState(COMBINED))) & ALL_MODIFIERS,
      activity: () => ACTIVITY_TYPES.reduce((sum, type) => sum + Number(counter(HID, type)), 0),
      hasAccess: () => (preflight ? !!preflight() : null),
      requestAccess: () => (request ? !!request() : false),
      keepAwake,
      // Only once Input Monitoring is allowed: asking for a tap before that would bring up the
      // macOS prompt out of nowhere (the tour and Settings ask at the right moment)
      listen: tap && ((onEvent) => (preflight && !preflight() ? null : tap(onEvent))),
    };
  } catch (err) {
    console.error('TaskPop: double-tap unavailable', err);
    return null;
  }
}

/**
 * Windows version of the key-state reader: GetAsyncKeyState from user32 (no permission needed).
 * `activity` counts presses of normal keys and mouse buttons, detected as up→down changes.
 */
function createWinKeySource(user32Override) {
  if (process.platform !== 'win32' && !user32Override) return null;
  let getKey;
  try {
    if (user32Override) {
      getKey = user32Override;
    } else {
      const koffi = require('koffi');
      const user32 = koffi.load('user32.dll');
      getKey = user32.func('int16_t __stdcall GetAsyncKeyState(int32_t vKey)');
    }
  } catch (err) {
    console.error('TaskPop: double-tap unavailable', err);
    return null;
  }
  const down = (vk) => (getKey(vk) & 0x8000) !== 0;
  // Everything except the modifiers: mouse buttons, editing keys, arrows, digits, letters,
  // numpad, F1–F24 and punctuation.
  const WATCH = [0x01, 0x02, 0x04, 0x05, 0x06, 0x08, 0x09, 0x0d, 0x13, 0x14, 0x1b, 0x20];
  const range = (a, b) => { for (let v = a; v <= b; v += 1) WATCH.push(v); };
  range(0x21, 0x28); range(0x2c, 0x2e); range(0x30, 0x39); range(0x41, 0x5a); range(0x5d, 0x5d);
  range(0x60, 0x6f); range(0x70, 0x87); range(0xba, 0xc0); range(0xdb, 0xdf); range(0xe2, 0xe2);
  const wasDown = new Uint8Array(256);
  let presses = 0;
  return {
    flags: () => (down(0x11) ? KEY_MASKS.control : 0) // VK_CONTROL
      | (down(0x12) ? KEY_MASKS.option : 0) // VK_MENU (Alt)
      | (down(0x10) ? KEY_MASKS.shift : 0) // VK_SHIFT
      | (down(0x5b) || down(0x5c) ? KEY_MASKS.command : 0), // Windows keys
    activity: () => {
      for (const vk of WATCH) {
        const d = down(vk);
        if (d && !wasDown[vk]) presses += 1;
        wasDown[vk] = d ? 1 : 0;
      }
      return presses;
    },
    hasAccess: () => true,
    requestAccess: () => true,
  };
}

function createKeySource() {
  if (process.platform === 'darwin') return createMacKeySource();
  if (process.platform === 'win32') return createWinKeySource();
  return null;
}

/**
 * Polls a key source and runs the detector. Also keeps a short history so the app can check
 * that macOS is really letting it read key state (see verify()).
 */
class DoubleTapWatcher {
  constructor(source, onTrigger, intervalMs = 25) {
    this.source = source;
    this.intervalMs = intervalMs;
    this.detector = new DoubleTapDetector('off', onTrigger);
    this.timer = null;
    this.endAwake = null; // ends the macOS App Nap opt-out
    this.endEvents = null; // stops the macOS key events (see createMacEventTap)
    this.events = { received: 0, lastAt: 0, presses: 0, pauses: 0, fallbacks: 0 };
    this.history = []; // [time, activity] for the last ~2 s
    this.lastFlags = null;
    this.changedAt = 0; // when the checks saw a key change that no event has shown yet
    this.failures = 0;
    this.slowest = { gap: 0, at: 0 }; // the longest wait between two checks in the last minute
  }

  /** 'events' (macOS hands TaskPop every key change), 'checks' (TaskPop looks every few ms) or 'off'. */
  get mode() {
    if (!this.timer) return 'off';
    return this.endEvents ? 'events' : 'checks';
  }

  setKey(key) {
    this.detector.setKey(key);
    if (KEY_MASKS[key]) this.start();
    else this.stop();
  }

  start() {
    if (this.timer || !this.source) return;
    this.detector.reset();
    this.lastFlags = null;
    this.lastTickAt = 0;
    this.changedAt = 0;
    this.failures = 0;
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.startEvents();
    // macOS: no App Nap while watching, or the checks slow to a crawl (see createMacAppNapGuard)
    if (!this.endAwake && typeof this.source.keepAwake === 'function') {
      try {
        this.endAwake = this.source.keepAwake() || null;
      } catch (err) {
        console.error('TaskPop: could not opt out of App Nap', err);
      }
    }
  }

  /** macOS: have every key change delivered as it happens, when the system allows it. */
  startEvents() {
    if (this.endEvents || typeof this.source.listen !== 'function') return;
    try {
      this.endEvents = this.source.listen((kind, flags) => this.onEvent(kind, flags)) || null;
    } catch (err) {
      console.error('TaskPop: key events unavailable, checking the keys instead', err);
      this.endEvents = null;
    }
    if (this.endEvents) this.detector.reset();
  }

  stopEvents() {
    const end = this.endEvents;
    this.endEvents = null;
    this.changedAt = 0;
    if (!end) return;
    try {
      end();
    } catch (err) {
      console.error('TaskPop: could not stop the key events', err);
    }
    this.detector.reset();
  }

  onEvent(kind, flags) {
    if (!this.endEvents) return;
    if (kind === 'disabled') {
      this.events.pauses += 1; // macOS paused the tap for a moment; it's been switched back on
      return;
    }
    const now = Date.now();
    this.events.received += 1;
    this.events.lastAt = now;
    if (kind === 'press') this.events.presses += 1; // a key or a click (which one isn't looked at)
    this.detector.sample(now, flags, this.events.presses);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = null;
    this.history = [];
    this.stopEvents();
    if (this.endAwake) {
      try {
        this.endAwake();
      } catch (err) {
        console.error('TaskPop: could not end the App Nap opt-out', err);
      }
      this.endAwake = null;
    }
  }

  tick() {
    let flags;
    let activity;
    try {
      flags = this.source.flags();
      activity = this.source.activity();
      this.failures = 0;
    } catch (err) {
      // One failed read isn't a reason to stop for good; many in a row are
      this.failures += 1;
      if (this.failures === 1) console.error('TaskPop: reading key state failed', err);
      if (this.failures >= 40) this.stop();
      return;
    }
    const now = Date.now();
    if (this.lastTickAt) {
      const gap = now - this.lastTickAt;
      if (gap >= this.slowest.gap || now - this.slowest.at > 60000) this.slowest = { gap, at: now };
    }
    this.history.push([now, activity]);
    while (this.history.length && this.history[0][0] < now - 2000) this.history.shift();
    const changed = this.lastFlags !== null && flags !== this.lastFlags;
    const previousTick = this.lastTickAt || now;
    this.lastFlags = flags;
    this.lastTickAt = now;

    if (this.endEvents) {
      // The events do the detecting; these checks only make sure they keep coming. If a key
      // changes and no event shows it within a second, go back to checking the keys. (The change
      // happened some time since the previous check, which may have been a while ago.)
      if (changed && !this.changedAt) this.changedAt = previousTick;
      if (this.changedAt && this.events.lastAt >= this.changedAt - 150) {
        this.changedAt = 0;
      } else if (this.changedAt && now - this.changedAt > 1000) {
        console.error('TaskPop: key events stopped arriving; checking the keys instead');
        this.events.fallbacks += 1;
        this.stopEvents();
      }
      return;
    }
    this.detector.sample(now, flags, activity);
  }

  /** Activity count about `ms` ago (from the history), or null if unknown. */
  activityAgo(ms) {
    const target = Date.now() - ms;
    const entry = this.history.find(([t]) => t >= target);
    return entry ? entry[1] : null;
  }
}

/** Which modifier masks an Electron accelerator like "Control+Alt+T" uses. */
function acceleratorMask(accelerator) {
  if (!accelerator) return 0;
  let mask = 0;
  for (const part of accelerator.split('+')) {
    const p = part.toLowerCase();
    if (p === 'control' || p === 'ctrl') mask |= KEY_MASKS.control;
    else if (p === 'alt' || p === 'option') mask |= KEY_MASKS.option;
    else if (p === 'command' || p === 'cmd' || p === 'commandorcontrol' || p === 'cmdorctrl' || p === 'super' || p === 'meta') mask |= KEY_MASKS.command;
    else if (p === 'shift') mask |= KEY_MASKS.shift;
  }
  return mask;
}

module.exports = {
  KEY_MASKS, DoubleTapDetector, DoubleTapWatcher, createKeySource, createMacKeySource, createWinKeySource, createMacAppNapGuard, createMacEventTap, acceleratorMask, MAX_HOLD_MS, MAX_GAP_MS, MAC_ACTIVITY_OPTIONS, MAC_EVENT, MAC_TAP_MASK,
};
