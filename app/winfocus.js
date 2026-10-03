// Windows only: bring TaskPop's panel to the front with keyboard focus.
// Windows normally stops a background app from taking focus, so after a double-tap the panel
// would appear but your typing would still go to the previous app. Briefly attaching to the
// foreground window's input queue is the standard, permission-free way around that.

function createWinFocus() {
  if (process.platform !== 'win32') return null;
  try {
    const koffi = require('koffi');
    const user32 = koffi.load('user32.dll');
    const kernel32 = koffi.load('kernel32.dll');
    const GetForegroundWindow = user32.func('intptr_t __stdcall GetForegroundWindow()');
    const GetWindowThreadProcessId = user32.func('uint32_t __stdcall GetWindowThreadProcessId(intptr_t hWnd, void *lpdwProcessId)');
    const AttachThreadInput = user32.func('bool __stdcall AttachThreadInput(uint32_t idAttach, uint32_t idAttachTo, bool fAttach)');
    const SetForegroundWindow = user32.func('bool __stdcall SetForegroundWindow(intptr_t hWnd)');
    const BringWindowToTop = user32.func('bool __stdcall BringWindowToTop(intptr_t hWnd)');
    const GetCurrentThreadId = kernel32.func('uint32_t __stdcall GetCurrentThreadId()');

    return (win) => {
      try {
        const handle = win.getNativeWindowHandle();
        const hwnd = handle.length >= 8 ? handle.readBigInt64LE(0) : BigInt(handle.readInt32LE(0));
        const foreground = GetForegroundWindow();
        const theirThread = foreground ? GetWindowThreadProcessId(foreground, null) : 0;
        const myThread = GetCurrentThreadId();
        const attach = theirThread && theirThread !== myThread;
        if (attach) AttachThreadInput(myThread, theirThread, true);
        SetForegroundWindow(hwnd);
        BringWindowToTop(hwnd);
        if (attach) AttachThreadInput(myThread, theirThread, false);
      } catch (_) {
        // Focus is a nicety; the panel is still shown.
      }
    };
  } catch (err) {
    console.error('TaskPop: focus helper unavailable', err);
    return null;
  }
}

module.exports = { createWinFocus };
