// v1.9: confirming it's you before a secret is shown (app/verify.js; the quick note's hidden
// text until 1.10). Mac: Touch ID or the Mac password through Electron's promptTouchID (stubbed
// here). Windows: Windows Hello through the real koffi against tests/stubs/fakewin.c standing in
// for combase. (v1.10.1: without Windows Hello, TaskPop says how to set it up; its own password
// dialog, which crashed TaskPop on some PCs, is gone.)
// Needs TP_FAKEWIN: the path of the built stand-in (tests/run.sh builds it).
const path = require('path');

const APP = process.env.TP_SRC || path.resolve(__dirname, '../../app');
const koffi = require(`${APP}/node_modules/koffi`);
const v = require(`${APP}/verify.js`);

const results = [];
const check = (name, ok, detail = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

(async () => {
  try {
    // ---------- GUIDs, laid out as Windows expects ----------
    check('GUIDs are written the Windows way (little-endian first three parts)',
      v.guidBytes('00000036-0000-0000-c000-000000000046').toString('hex') === '3600000000000000c000000000000046'
      && v.guidBytes(v.IID_USER_CONSENT_VERIFIER_INTEROP).toString('hex') === 'c350e039744e1a448dc0b81104df949c');

    // ---------- Mac ----------
    const asked = [];
    let answer = () => Promise.resolve();
    const mac = v.createVerifier({ platform: 'darwin', systemPreferences: { promptTouchID: (reason) => { asked.push(reason); return answer(); } } });
    let r = await mac.verify(null, 'show', 'Uni login');
    check('Mac: Touch ID (or the Mac password) confirms it\'s you, and macOS says which secret ("TaskPop is trying to show “Uni login”")', r.ok === true && asked[0] === 'show “Uni login”', asked.join());
    answer = () => Promise.reject(new Error('Canceled by user.'));
    r = await mac.verify(null, 'edit', 'Wi-Fi\n"home"');
    check('Mac: Cancel is just a cancel (no message); the name is kept to one line without quotes', r.ok === false && r.canceled === true && asked[1] === 'change “Wi-Fi home”', asked[1]);
    answer = () => Promise.reject(new Error('Biometry is locked out.'));
    r = await mac.verify(null, 'show');
    check('Mac: any other answer is said', r.ok === false && !r.canceled && /Biometry is locked out/.test(r.message), r.message);
    r = await v.createVerifier({ platform: 'darwin', systemPreferences: {} }).verify(null, 'show');
    check('Mac without the API: a message, never a pass', r.ok === false && !!r.message);
    r = await v.createVerifier({ platform: 'linux' }).verify(null, 'show');
    check('elsewhere: never a pass', r.ok === false && !!r.message);

    // ---------- Windows ----------
    const lib = koffi.load(process.env.TP_FAKEWIN);
    const f = {
      reset: lib.func('void fake_reset(int hello, int polls, int endStatus, int factoryFails, uint64_t hwnd)'),
      text: lib.func('const char *fake_text(int which)'),
      count: lib.func('int fake_count(int which)'),
    };
    const C = { bad: 0, strings: 1, objects: 2, polls: 3, cancels: 4, closes: 5, prompts: 6, unwiped: 7, freed: 8, tokens: 9, roInit: 10, roArg: 11, err0: 12, err1: 13 };
    const T = { className: 0, helloMessage: 1, caption: 2, promptMessage: 3, user: 4, domain: 5, lastBad: 6 };
    const libs = { combase: process.env.TP_FAKEWIN, credui: process.env.TP_FAKEWIN, advapi32: process.env.TP_FAKEWIN, kernel32: process.env.TP_FAKEWIN, ole32: process.env.TP_FAKEWIN };
    const HWND = 0x1a2b3c;
    const win = { getNativeWindowHandle: () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(HWND)); return b; } };
    const windows = v.createVerifier({ platform: 'win32', getKoffi: () => koffi, winLibs: libs });
    // (the stand-in keeps only the low byte of each UTF-16 character it's given, like “ and ”)
    const narrowed = (text) => [...text].map((ch) => String.fromCharCode(ch.charCodeAt(0) & 0xff)).join('');
    const clean = () => f.count(C.bad) === 0 && f.count(C.strings) === 0 && f.count(C.objects) === 0;
    const why = () => `bad ${f.count(C.bad)} ${f.text(T.lastBad)}, strings ${f.count(C.strings)}, objects ${f.count(C.objects)}`;

    // Windows Hello says yes, after a few polls
    f.reset(0, 3, 1, 0, HWND);
    const t0 = Date.now();
    r = await windows.verify(win, 'show', 'Uni login');
    check('Windows Hello: verified', r.ok === true, JSON.stringify(r));
    check('…through UserConsentVerifier\'s Win32 interop, for TaskPop\'s window, with the right IIDs', f.text(T.className) === 'Windows.Security.Credentials.UI.UserConsentVerifier' && f.count(C.bad) === 0, why());
    check('…saying what it\'s for', f.text(T.helloMessage) === narrowed('Show “Uni login” in TaskPop'), f.text(T.helloMessage));
    check('…waiting for the answer without blocking (polling the operation\'s status)', f.count(C.polls) === 4 && Date.now() - t0 >= 400, `${f.count(C.polls)} polls`);
    check('…in the main thread\'s apartment (single-threaded), and everything released after', f.count(C.roInit) === 1 && f.count(C.roArg) === 0 && clean() && f.count(C.closes) === 1, why());
    check('…no password dialog', f.count(C.prompts) === 0);

    f.reset(6, 1, 1, 0, HWND);
    r = await windows.verify(win, 'edit', 'Bank');
    check('Windows Hello: Cancel is a cancel', r.ok === false && r.canceled === true && clean() && f.text(T.helloMessage) === narrowed('Change “Bank” in TaskPop'), why());
    f.reset(4, 0, 1, 0, HWND);
    r = await windows.verify(win, 'show');
    check('Windows Hello busy: a message, no password dialog', r.ok === false && /busy/.test(r.message) && f.count(C.prompts) === 0 && clean());
    f.reset(0, 0, 2, 0, HWND);
    r = await windows.verify(win, 'show');
    check('the operation canceled by Windows: a cancel', r.ok === false && r.canceled === true && clean());

    // No Windows Hello on this PC: never a password dialog of TaskPop's own; it says how to set Hello up
    for (const [code, what] of [[2, 'not set up for this account'], [1, 'no Windows Hello on this PC']]) {
      f.reset(code, 0, 1, 0, HWND);
      r = await windows.verify(win, 'show', 'Uni login');
      check(`(v1.10.1) ${what}: not a pass, no password dialog, and it says to set up Windows Hello (with a way to open Sign-in options)`,
        r.ok === false && r.setupHello === true && /set up Windows Hello/.test(r.message) && /Sign-in options/.test(r.message) && f.count(C.prompts) === 0 && clean(), `${JSON.stringify(r)} ${why()}`);
    }
    f.reset(3, 0, 1, 0, HWND);
    r = await windows.verify(win, 'show', 'Uni login');
    check('Windows Hello turned off by the organization: said so, nothing else', r.ok === false && !r.setupHello && /organization/.test(r.message) && f.count(C.prompts) === 0 && clean());
    f.reset(0, 0, 1, 1, HWND);
    r = await windows.verify(win, 'show', 'Uni login');
    check('Windows Hello can\'t even be reached: not a pass, and how to set it up', r.ok === false && r.setupHello === true && f.count(C.prompts) === 0 && clean(), why());
    check('TaskPop has no password dialog of its own any more', typeof v.createWinPassword === 'undefined' && v.HELLO_SETTINGS === 'ms-settings:signinoptions');

    const broken = v.createVerifier({ platform: 'win32', getKoffi: () => { throw new Error('no koffi'); } });
    r = await broken.verify(win, 'show');
    check('without the native bridge: a message, never a pass', r.ok === false && !!r.message);
  } catch (err) {
    console.log(`TEST ${err.stack}`);
  }
  console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
})();
