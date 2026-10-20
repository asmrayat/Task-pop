// v1.9: confirming it's you before a secret is shown (app/verify.js; the quick note's hidden
// text until 1.10). Mac: Touch ID or the Mac password through Electron's promptTouchID (stubbed
// here). Windows: Windows Hello, else the Windows password, through the real koffi against
// tests/stubs/fakewin.c standing in for combase, credui, advapi32, kernel32 and ole32.
// Needs TP_FAKEWIN: the path of the built stand-in (tests/run.sh builds it).
const path = require('path');
const { spawnSync } = require('child_process');

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
      passwords: lib.func('void fake_passwords(const char *a, const char *b, int cancelAt)'),
      text: lib.func('const char *fake_text(int which)'),
      count: lib.func('int fake_count(int which)'),
      promptStack: lib.func('void fake_prompt_stack(int kib)'),
    };
    const C = { bad: 0, strings: 1, objects: 2, polls: 3, cancels: 4, closes: 5, prompts: 6, unwiped: 7, freed: 8, tokens: 9, roInit: 10, roArg: 11, err0: 12, err1: 13 };
    const T = { className: 0, helloMessage: 1, caption: 2, promptMessage: 3, user: 4, domain: 5, lastBad: 6 };
    const libs = { combase: process.env.TP_FAKEWIN, credui: process.env.TP_FAKEWIN, advapi32: process.env.TP_FAKEWIN, kernel32: process.env.TP_FAKEWIN, ole32: process.env.TP_FAKEWIN };
    const HWND = 0x1a2b3c;
    const win = { getNativeWindowHandle: () => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(HWND)); return b; } };
    const windows = v.createVerifier({ platform: 'win32', getKoffi: () => koffi, winLibs: libs });
    f.promptStack(2048); // the stand-in Windows Security prompt needs 2 MiB of stack from here on
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

    // No Windows Hello on this PC: the Windows password (wrong, then right)
    f.reset(2, 0, 1, 0, HWND);
    f.passwords('wrong', 'right', -1);
    r = await windows.verify(win, 'show', 'Uni login');
    check('no Windows Hello: the Windows password instead, and the right one confirms it', r.ok === true && f.count(C.prompts) === 2, `${JSON.stringify(r)} ${f.count(C.prompts)} prompts`);
    check('(v1.10) …the prompt gets a big stack: it ran here needing 2 MiB, where 1.9 gave it 128 KiB and crashed', r.ok === true && koffi.config().async_stack_size >= 4 * 1024 * 1024, String(koffi.config().async_stack_size));
    check('…in "Windows Security" for the current user, over TaskPop\'s window', f.text(T.caption) === 'TaskPop' && f.text(T.promptMessage) === narrowed('Show “Uni login” in TaskPop: enter your Windows password.') && f.count(C.bad) === 0, `${f.text(T.caption)} / ${f.text(T.promptMessage)} / ${f.text(T.lastBad)}`);
    check('…a wrong password asks again, saying it was wrong', f.count(C.err0) === 0 && f.count(C.err1) === 1326);
    check('…checked by Windows as that account (Microsoft account split into name and domain)', f.text(T.user) === 'saif@example.com' && f.text(T.domain) === 'MicrosoftAccount');
    check('…the typed passwords are wiped before their buffers go back, and the logon token is closed', f.count(C.freed) === 2 && f.count(C.unwiped) === 0 && f.count(C.tokens) === 1);
    check('…Windows Hello\'s objects were released too', clean(), why());

    f.reset(1, 0, 1, 0, HWND);
    f.passwords('right', null, 0);
    r = await windows.verify(win, 'show');
    check('no Windows Hello, and Cancel in the password dialog: a cancel', r.ok === false && r.canceled === true && f.count(C.freed) === 0);

    f.reset(0, 0, 1, 1, HWND);
    f.passwords('right', null, -1);
    r = await windows.verify(win, 'show');
    check('Windows Hello can\'t even be reached: the password still works', r.ok === true && f.count(C.prompts) === 1 && clean(), why());

    f.reset(2, 0, 1, 0, HWND);
    f.passwords('nope', 'still no', -1);
    r = await windows.verify(win, 'show');
    check('wrong passwords never confirm it (here: two wrong ones, then Cancel)', r.ok === false && r.canceled === true && f.count(C.prompts) === 3 && f.count(C.err1) === 1326 && f.count(C.unwiped) === 0);

    // The 1.9 crash itself: the same prompt, called the same way on koffi's default stacks, takes
    // the whole process down (on Windows: "TaskPop closed" while the password dialog opened)
    const proof = spawnSync(process.execPath, ['-e', `
      const koffi = require(${JSON.stringify(`${APP}/node_modules/koffi`)});
      const lib = koffi.load(process.env.TP_FAKEWIN);
      lib.func('void fake_prompt_stack(int kib)')(2048);
      lib.func('void fake_reset(int hello, int polls, int endStatus, int factoryFails, uint64_t hwnd)')(2, 0, 1, 0, 0n);
      lib.func('void fake_passwords(const char *a, const char *b, int cancelAt)')('right', null, -1);
      const prompt = lib.func('CredUIPromptForWindowsCredentialsW', 'uint32_t', ['void *', 'uint32_t', 'void *', 'void *', 'uint32_t', 'void *', 'void *', 'void *', 'uint32_t']);
      const info = Buffer.alloc(40); info.writeUInt32LE(40, 0);
      prompt.async(info, 0, Buffer.alloc(4), null, 0, Buffer.alloc(8), Buffer.alloc(4), Buffer.alloc(4), 0x200, () => console.log('survived'));
    `], { env: process.env, encoding: 'utf8', timeout: 20000 });
    check('…on koffi\'s default stacks (TaskPop 1.9), the same prompt crashes the app', proof.status !== 0 && !/survived/.test(proof.stdout), `status ${proof.status} signal ${proof.signal}`);
    const tight = require(`${APP}/ffi.js`).hasPromptStack({ config: () => ({ async_stack_size: 128 * 1024 }) });
    check('…and if the bigger stack ever couldn\'t be set, TaskPop says so instead of showing the prompt', tight === false);

    const broken = v.createVerifier({ platform: 'win32', getKoffi: () => { throw new Error('no koffi'); } });
    r = await broken.verify(win, 'show');
    check('without the native bridge: a message, never a pass', r.ok === false && !!r.message);
  } catch (err) {
    console.log(`TEST ${err.stack}`);
  }
  console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
})();
