// Linux stand-in for the Objective-C runtime calls TaskPop's desktop (Spaces) handling makes
// (app/spaces.js, tested by tests/unit/spaces-test.js). One window, one content view, a few
// desktops. fake_order_front() plays macOS ordering the window in: "move to the active Space"
// brings it to the desktop you're on; "join all Spaces" does too only in the "works" mode. In the
// "stuck" mode nothing moves it, as on the Macs where the panel stayed on Desktop 1.
// Setting "join all Spaces" and "move to the active Space" together is counted as a violation:
// real AppKit throws an exception, which would bring TaskPop down.
// Built by tests/run.sh:  cc -shared -fPIC -o libfakeobjc.so tests/stubs/fakeobjc.c
#include <stdint.h>
#include <string.h>
#include <stdlib.h>

#define JOIN_ALL 0x1ull
#define MOVE_TO_ACTIVE 0x2ull

static char cls_nswindow, cls_other, view_obj, other_view_obj, window_obj, not_a_window_obj;
static uint64_t g_behavior = 0x101; // join all Spaces + full-screen auxiliary, as Electron's panel
static int g_active = 1, g_space = 1; // the desktop you're on; the window's (-1: all of them)
static int g_mode = 0; // 0: join-all broken (macOS as reported), 1: join-all works, 2: stuck
static int g_violations, g_wrong_super, g_super_calls, g_order_fronts;
static uint64_t g_behavior_at_order_front;

static const char *names[64];
static int n_names;
void *sel_registerName(const char *name) {
  for (int i = 0; i < n_names; i++) if (!strcmp(names[i], name)) return (void *)names[i];
  if (n_names == 64) return NULL;
  names[n_names] = strdup(name);
  return (void *)names[n_names++];
}
void *objc_getClass(const char *name) {
  if (!strcmp(name, "NSWindow")) return &cls_nswindow;
  if (!strcmp(name, "NSObject")) return &cls_other;
  return NULL;
}
static int on_active(void) { return g_space == -1 || g_space == g_active; }

// One body for every prototype TaskPop declares: (self, sel) and (self, sel, arg)
uintptr_t objc_msgSend(void *self, void *sel, void *arg) {
  const char *s = (const char *)sel;
  if (self == &view_obj && !strcmp(s, "window")) return (uintptr_t)&window_obj;
  if (self == &other_view_obj && !strcmp(s, "window")) return (uintptr_t)&not_a_window_obj;
  if (!strcmp(s, "isKindOfClass:")) return self == &window_obj && arg == &cls_nswindow;
  if (self != &window_obj) return 0;
  if (!strcmp(s, "collectionBehavior")) return (uintptr_t)g_behavior;
  if (!strcmp(s, "isOnActiveSpace")) return on_active();
  return 0;
}

struct objc_super { void *receiver; void *super_class; };
void objc_msgSendSuper(struct objc_super *sup, void *sel, uint64_t value) {
  g_super_calls++;
  if (!sup || sup->receiver != &window_obj || sup->super_class != &cls_nswindow || strcmp((const char *)sel, "setCollectionBehavior:")) {
    g_wrong_super++;
    return;
  }
  if ((value & JOIN_ALL) && (value & MOVE_TO_ACTIVE)) {
    g_violations++; // AppKit: NSInternalInconsistencyException
    return;
  }
  g_behavior = value;
}

// The test's side
void *fake_view(void) { return &view_obj; }
void *fake_other_view(void) { return &other_view_obj; }
void fake_order_front(void) {
  g_order_fronts++;
  g_behavior_at_order_front = g_behavior;
  if (g_mode == 2) return;
  if (g_behavior & MOVE_TO_ACTIVE) g_space = g_active;
  else if ((g_behavior & JOIN_ALL) && g_mode == 1) g_space = -1;
}
void fake_reset(int mode, int window_space, int active) {
  g_mode = mode; g_space = window_space; g_active = active; g_behavior = 0x101;
  g_violations = g_wrong_super = g_super_calls = g_order_fronts = 0; g_behavior_at_order_front = 0;
}
void fake_switch_to(int space) { g_active = space; }
int fake_window_space(void) { return g_space; }
uint64_t fake_behavior(void) { return g_behavior; }
uint64_t fake_behavior_at_order_front(void) { return g_behavior_at_order_front; }
int fake_violations(void) { return g_violations; }
int fake_wrong_super(void) { return g_wrong_super; }
int fake_super_calls(void) { return g_super_calls; }
int fake_order_fronts(void) { return g_order_fronts; }
