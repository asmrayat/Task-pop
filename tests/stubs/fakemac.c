// Linux stand-ins for the macOS calls TaskPop's key-event tap makes (tests/app/eventtap-app.js).
// CFRunLoopAddSource hands the callback to the GLib main loop, which is Electron's main loop on
// Linux, the way macOS calls it from its run loop: so the real koffi callback path is exercised.
// Built by tests/run.sh:  cc -shared -fPIC -o libfakemac.so tests/stubs/fakemac.c -ldl
#include <dlfcn.h>
#include <stdint.h>
#include <stdbool.h>
#include <stdlib.h>
#include <string.h>
#include <stdio.h>
typedef unsigned int (*timeout_add_fn)(unsigned int interval, int (*fn)(void *), void *data);
static unsigned int g_timeout_add(unsigned int interval, int (*fn)(void *), void *data) {
  static timeout_add_fn add;
  if (!add) add = (timeout_add_fn)dlsym(dlopen("libglib-2.0.so.0", RTLD_NOW | RTLD_GLOBAL), "g_timeout_add");
  return add(interval, fn, data);
}
typedef void *(*tap_cb)(void *proxy, uint32_t type, void *event, void *info);
struct fake_event { uint64_t flags; };
static tap_cb g_cb;
static int g_enabled, g_enable_calls, g_removed, g_invalidated, g_released;
static char g_mode[64];
static struct { int at; uint32_t type; uint64_t flags; } script[] = {
  {200, 12, 0x20000 | 0x2}, {280, 12, 0}, {430, 12, 0x20000 | 0x2}, {510, 12, 0},     // Shift, Shift
  {1500, 12, 0x20000}, {1560, 10, 0x20000}, {1600, 12, 0},                          // a capital letter
  {1900, 0xfffffffe, 0},                                                              // macOS pauses the tap
};
static int step;
static int deliver(void *unused) {
  if (!g_cb || !g_enabled) return 0;
  struct fake_event ev = { script[step].flags };
  void *ret = g_cb(NULL, script[step].type, script[step].type >= 0xfffffffe ? NULL : &ev, NULL);
  if (ret) fprintf(stderr, "fakemac: callback returned non-NULL\n");
  step++;
  if (step < (int)(sizeof script / sizeof script[0])) g_timeout_add(script[step].at - script[step - 1].at, deliver, NULL);
  return 0;
}
void *CGEventTapCreate(uint32_t tap, uint32_t place, uint32_t options, uint64_t mask, tap_cb cb, void *info) {
  if (tap != 1 || place != 0 || options != 1 || mask != ((1ull<<1)|(1ull<<3)|(1ull<<10)|(1ull<<12)|(1ull<<25))) return NULL;
  g_cb = cb; return (void *)0x1234;
}
void CGEventTapEnable(void *tap, bool enable) { if (tap == (void *)0x1234) { g_enabled = enable; g_enable_calls++; } }
uint64_t CGEventGetFlags(void *event) { return ((struct fake_event *)event)->flags; }
void *CFMachPortCreateRunLoopSource(void *a, void *port, long order) { return port == (void *)0x1234 ? (void *)0x5678 : NULL; }
void *CFRunLoopGetMain(void) { return (void *)0x9abc; }
void *CFStringCreateWithCString(void *a, const char *text, uint32_t enc) { return strdup(text); }
void CFRunLoopAddSource(void *loop, void *source, void *mode) {
  snprintf(g_mode, sizeof g_mode, "%s", (char *)mode);
  if (loop == (void *)0x9abc && source == (void *)0x5678) { step = 0; g_timeout_add(script[0].at, deliver, NULL); }
}
void CFRunLoopRemoveSource(void *loop, void *source, void *mode) { g_removed++; }
void CFMachPortInvalidate(void *port) { g_invalidated++; }
void CFRelease(void *o) { g_released++; }
const char *fake_report(void) {
  static char buf[200];
  snprintf(buf, sizeof buf, "mode=%s enabled=%d enableCalls=%d removed=%d invalidated=%d released=%d delivered=%d", g_mode, g_enabled, g_enable_calls, g_removed, g_invalidated, g_released, step);
  return buf;
}
