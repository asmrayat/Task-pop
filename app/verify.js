// "Is it really you?" before TaskPop shows one of your secrets (v1.9; the quick note until 1.10).
//
// Mac: Touch ID, or your Mac password (systemPreferences.promptTouchID asks macOS for "user
// presence", which offers the password when Touch ID isn't there or isn't used).
// Windows: Windows Hello (PIN, fingerprint or face), shown over TaskPop's panel. Without Windows
// Hello, TaskPop says how to set it up (a PIN is enough).
//
// v1.10.1: TaskPop used to fall back to its own "Windows Security" password dialog when Windows
// Hello wasn't set up. That dialog crashed TaskPop on some PCs, so it's gone: Windows Hello is
// the one way to confirm it's you on Windows, and Windows itself handles it from start to end.
//
// verify(win, action, name) resolves to { ok: true }, { ok: false, canceled: true } or
// { ok: false, message }. It never throws. name is the secret's name, for the dialog's text.

const ffi = require('./ffi');

const REASONS = {
  // macOS shows "TaskPop is trying to <reason>."
  show: 'show your secret',
  edit: 'change your secret',
  copy: 'copy your secret',
};
const WIN_MESSAGES = {
  show: 'Show your secret in TaskPop',
  edit: 'Change your secret in TaskPop',
  copy: 'Copy your secret in TaskPop',
};

/** A secret's name, safe to put in the system's dialog: one line, no quotes, not too long. */
function shortName(name) {
  const s = String(name || '').replace(/[\s"“”]+/g, ' ').trim();
  return s.length > 40 ? `${s.slice(0, 39)}…` : s;
}
/** What the Mac's dialog says TaskPop is trying to do: "show “Uni login”". */
function macReason(action, name) {
  const n = shortName(name);
  if (!n) return REASONS[action] || REASONS.show;
  if (action === 'edit') return `change “${n}”`;
  if (action === 'copy') return `copy “${n}”`;
  return `show “${n}”`;
}
/** …and Windows': "Show “Uni login” in TaskPop". */
function winMessage(action, name) {
  const n = shortName(name);
  if (!n) return WIN_MESSAGES[action] || WIN_MESSAGES.show;
  if (action === 'edit') return `Change “${n}” in TaskPop`;
  if (action === 'copy') return `Copy “${n}” in TaskPop`;
  return `Show “${n}” in TaskPop`;
}

function createVerifier({ platform = process.platform, systemPreferences, getKoffi = ffi.getKoffi, winLibs } = {}) {
  if (platform === 'darwin') return createMacVerifier(systemPreferences);
  if (platform === 'win32') return createWinVerifier(getKoffi, winLibs);
  return { verify: async () => ({ ok: false, message: 'Hidden text can only be shown on a Mac or Windows PC.' }) };
}

// ---------- Mac ----------

function createMacVerifier(systemPreferences) {
  return {
    async verify(_win, action, name) {
      if (!systemPreferences || typeof systemPreferences.promptTouchID !== 'function') {
        return { ok: false, message: 'This Mac can’t confirm it’s you.' };
      }
      try {
        await systemPreferences.promptTouchID(macReason(action, name));
        return { ok: true };
      } catch (err) {
        const text = String((err && err.message) || '');
        if (/cancel/i.test(text)) return { ok: false, canceled: true };
        return { ok: false, message: text ? `macOS didn’t confirm it’s you: ${text}` : 'macOS didn’t confirm it’s you.' };
      }
    },
  };
}

// ---------- Windows ----------

// Windows Hello through its Win32 interop: IUserConsentVerifierInterop::RequestVerificationForWindowAsync
// (the dialog belongs to TaskPop's window, so it opens in front of it).
const IID_USER_CONSENT_VERIFIER_INTEROP = '39e050c3-4e74-441a-8dc0-b81104df949c';
// IAsyncOperation<UserConsentVerificationResult>: the WinRT IID of
// pinterface({9fc2b0bb-e446-44e2-aa61-9cab8f636af2};enum(Windows.Security.Credentials.UI.UserConsentVerificationResult;i4))
const IID_ASYNC_OPERATION_OF_RESULT = 'fd596ffd-2318-558f-9dbe-d21df43764a5';
const IID_ASYNC_INFO = '00000036-0000-0000-c000-000000000046';
const VERIFIER_CLASS = 'Windows.Security.Credentials.UI.UserConsentVerifier';
// vtable slots: IUnknown 0-2, IInspectable 3-5, then the interface's own methods
const SLOT = { queryInterface: 0, release: 2, requestForWindow: 6, getResults: 8, status: 7, cancel: 9, close: 10 };
const ASYNC = { started: 0, completed: 1, canceled: 2, error: 3 };
// UserConsentVerificationResult
const HELLO = ['verified', 'deviceNotPresent', 'notConfiguredForUser', 'disabledByPolicy', 'deviceBusy', 'retriesExhausted', 'canceled'];

const RO_INIT_SINGLETHREADED = 0; // the apartment Electron's main thread already is (so this changes nothing there)

/** A GUID's 16 bytes, as Windows lays them out. */
function guidBytes(text) {
  const hex = text.replace(/-/g, '');
  const b = Buffer.alloc(16);
  b.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0);
  b.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4);
  b.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6);
  Buffer.from(hex.slice(16), 'hex').copy(b, 8);
  return b;
}

const readWide = (buf) => {
  const s = buf.toString('utf16le');
  const end = s.indexOf('\0');
  return end === -1 ? s : s.slice(0, end);
};
const handleOf = (win) => {
  try {
    const h = win && win.getNativeWindowHandle();
    return h && h.length >= 8 ? h.readBigUInt64LE(0) : 0n;
  } catch (_) {
    return 0n;
  }
};

/**
 * Windows Hello. libs maps the DLLs it uses to paths (tests load stand-ins).
 * Returns check(hwnd, message) → Promise<one of HELLO, or 'unavailable'>.
 */
function createWinHello(koffi, libs = {}) {
  const combase = koffi.load(libs.combase || 'combase.dll');
  const createString = combase.func('WindowsCreateString', 'int32_t', ['const char16_t *', 'uint32_t', 'void *']);
  const deleteString = combase.func('WindowsDeleteString', 'int32_t', ['void *']);
  const getFactory = combase.func('RoGetActivationFactory', 'int32_t', ['void *', 'void *', 'void *']);
  const roInitialize = combase.func('RoInitialize', 'int32_t', ['int32_t']);
  let initialized = false;
  const P = koffi.sizeof('void *');
  const proto = {
    release: koffi.proto('uint32_t TaskPopRelease(void *self)'),
    queryInterface: koffi.proto('int32_t TaskPopQueryInterface(void *self, void *iid, void *out)'),
    request: koffi.proto('int32_t TaskPopRequestForWindow(void *self, void *hwnd, void *message, void *iid, void *out)'),
    status: koffi.proto('int32_t TaskPopAsyncStatus(void *self, void *out)'),
    noArgs: koffi.proto('int32_t TaskPopAsyncCall(void *self)'),
  };
  const method = (obj, slot) => koffi.decode(koffi.decode(obj, 'void *'), slot * P, 'void *');
  const call = (obj, slot, type, ...args) => koffi.call(method(obj, slot), type, obj, ...args);
  const pointerOut = () => Buffer.alloc(8);
  const pointerIn = (buf) => buf.readBigUInt64LE(0);
  const iids = { interop: guidBytes(IID_USER_CONSENT_VERIFIER_INTEROP), op: guidBytes(IID_ASYNC_OPERATION_OF_RESULT), info: guidBytes(IID_ASYNC_INFO) };

  const hstring = (text) => {
    const out = pointerOut();
    if (createString(text, text.length, out) < 0) throw new Error('WindowsCreateString failed');
    return pointerIn(out);
  };

  return function check(hwnd, message) {
    let interop = 0n;
    let op = 0n;
    let info = 0n;
    const cleanup = () => {
      if (info) call(info, SLOT.release, proto.release);
      if (op) call(op, SLOT.release, proto.release);
      if (interop) call(interop, SLOT.release, proto.release);
      info = 0n;
      op = 0n;
      interop = 0n;
    };
    try {
      if (!initialized) {
        roInitialize(RO_INIT_SINGLETHREADED); // S_FALSE or "changed mode" if it already was: both fine
        initialized = true;
      }
      const className = hstring(VERIFIER_CLASS);
      const factory = pointerOut();
      const hr = getFactory(className, iids.interop, factory);
      deleteString(className);
      if (hr < 0 || !pointerIn(factory)) return Promise.resolve('unavailable');
      interop = pointerIn(factory);
      const text = hstring(message);
      const opOut = pointerOut();
      const requested = call(interop, SLOT.requestForWindow, proto.request, hwnd, text, iids.op, opOut);
      deleteString(text);
      if (requested < 0 || !pointerIn(opOut)) {
        cleanup();
        return Promise.resolve('unavailable');
      }
      op = pointerIn(opOut);
      const infoOut = pointerOut();
      if (call(op, SLOT.queryInterface, proto.queryInterface, iids.info, infoOut) < 0 || !pointerIn(infoOut)) {
        cleanup();
        return Promise.resolve('unavailable');
      }
      info = pointerIn(infoOut);
    } catch (err) {
      console.error('TaskPop: Windows Hello unavailable', err);
      try {
        cleanup();
      } catch (_) {
        // nothing more to do
      }
      return Promise.resolve('unavailable');
    }

    // Wait for the answer without blocking TaskPop: look at the operation's status now and then
    return new Promise((resolve) => {
      const started = Date.now();
      const tick = () => {
        let result = null;
        try {
          const status = Buffer.alloc(4);
          call(info, SLOT.status, proto.status, status);
          const s = status.readInt32LE(0);
          if (s === ASYNC.started && Date.now() - started < 5 * 60 * 1000) {
            setTimeout(tick, 120);
            return;
          }
          if (s === ASYNC.completed) {
            const value = Buffer.alloc(4);
            result = call(op, SLOT.getResults, proto.status, value) >= 0 ? HELLO[value.readInt32LE(0)] || 'unavailable' : 'unavailable';
          } else {
            if (s === ASYNC.started) call(info, SLOT.cancel, proto.noArgs); // gave up waiting
            result = s === ASYNC.canceled ? 'canceled' : 'unavailable';
          }
          call(info, SLOT.close, proto.noArgs);
        } catch (err) {
          console.error('TaskPop: Windows Hello failed', err);
          result = 'unavailable';
        }
        try {
          cleanup();
        } catch (_) {
          // nothing more to do
        }
        resolve(result);
      };
      setTimeout(tick, 120);
    });
  };
}

/** Where Windows lets you set up Windows Hello (Settings → Accounts → Sign-in options). */
const HELLO_SETTINGS = 'ms-settings:signinoptions';

function createWinVerifier(getKoffi, libs) {
  let hello = null;
  return {
    async verify(win, action, name) {
      try {
        if (!hello) hello = createWinHello(getKoffi(), libs);
      } catch (err) {
        console.error('TaskPop: Windows Hello unavailable', err);
        return { ok: false, message: 'Windows couldn’t be asked to confirm it’s you.' };
      }
      const result = await hello(handleOf(win), winMessage(action, name));
      if (result === 'verified') return { ok: true };
      if (result === 'canceled') return { ok: false, canceled: true };
      if (result === 'deviceBusy') return { ok: false, message: 'Windows Hello is busy. Please try again.' };
      if (result === 'retriesExhausted') return { ok: false, message: 'Too many tries. Please try again later.' };
      if (result === 'disabledByPolicy') {
        return { ok: false, message: 'Windows Hello is turned off on this PC by your organization, so secrets can’t be shown here.' };
      }
      if (result === 'deviceNotPresent' || result === 'notConfiguredForUser' || result === 'unavailable') {
        return {
          ok: false,
          setupHello: true,
          message: 'To show secrets, set up Windows Hello first: a PIN is enough. It’s in Windows Settings → Accounts → Sign-in options.',
        };
      }
      return { ok: false, message: 'Windows didn’t confirm it’s you.' };
    },
  };
}

module.exports = {
  createVerifier, createWinHello, guidBytes, macReason, winMessage, HELLO_SETTINGS,
  IID_USER_CONSENT_VERIFIER_INTEROP, IID_ASYNC_OPERATION_OF_RESULT, IID_ASYNC_INFO, REASONS, WIN_MESSAGES,
};
