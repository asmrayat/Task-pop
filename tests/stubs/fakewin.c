// Linux stand-ins for the Windows calls TaskPop makes to confirm it's you before showing hidden
// text (app/verify.js, tested by tests/unit/verify-test.js): WinRT strings and activation, Windows
// Hello's IUserConsentVerifierInterop with its async operation (polled), the "Windows Security"
// password dialog, and LogonUser. Each COM object counts its references, each string and buffer
// is tracked, and the password buffer must come back wiped.
// Built by tests/run.sh:  cc -shared -fPIC -o libfakewin.so tests/stubs/fakewin.c
#include <stdint.h>
#include <stdlib.h>
#include <string.h>

typedef int32_t HRESULT;
#define S_OK 0
#define E_NOINTERFACE ((HRESULT)0x80004002)
#define E_POINTER ((HRESULT)0x80004003)

static const uint8_t IID_INTEROP[16] = {0xc3,0x50,0xe0,0x39, 0x74,0x4e, 0x1a,0x44, 0x8d,0xc0,0xb8,0x11,0x04,0xdf,0x94,0x9c};
static const uint8_t IID_OP[16] = {0xfd,0x6f,0x59,0xfd, 0x18,0x23, 0x8f,0x55, 0x9d,0xbe,0xd2,0x1d,0xf4,0x37,0x64,0xa5};
static const uint8_t IID_INFO[16] = {0x36,0,0,0, 0,0, 0,0, 0xc0,0,0,0,0,0,0,0x46};

// ---------- what the test sets and reads ----------
static int g_hello_result = 0;     // UserConsentVerificationResult when the operation completes
static int g_polls_before_done = 2; // "started" this many times first
static int g_end_status = 1;       // 1 completed, 2 canceled, 3 error
static int g_factory_fails = 0;
static uint64_t g_expect_hwnd;
static int g_bad;                  // anything TaskPop passed that Windows wouldn't accept
static char g_last_bad[200];
static char g_class[128], g_hello_message[256], g_caption[64], g_prompt_message[256], g_logon_user[128], g_logon_domain[128];
static int g_ro_init_calls, g_ro_init_arg = -1, g_strings_live, g_objects_live, g_polls, g_cancels, g_closes;
static int g_prompts, g_prompt_cancel_at = -1, g_last_errors[8], g_unwiped, g_freed, g_tokens_closed;
static const char *g_passwords[8];
static int g_n_passwords;

static void bad(const char *what) { g_bad++; strncpy(g_last_bad, what, sizeof g_last_bad - 1); }
static void narrow(const uint16_t *w, char *out, int max) {
  int i = 0;
  if (w) for (; w[i] && i < max - 1; i++) out[i] = (char)w[i];
  out[i] = 0;
}

// ---------- HSTRING ----------
struct hstring { uint32_t magic; uint32_t len; uint16_t text[]; };
HRESULT WindowsCreateString(const uint16_t *src, uint32_t len, void **out) {
  if (!out) return E_POINTER;
  struct hstring *h = malloc(sizeof *h + (len + 1) * 2);
  h->magic = 0x48535452; h->len = len;
  memcpy(h->text, src, len * 2); h->text[len] = 0;
  g_strings_live++; *out = h; return S_OK;
}
HRESULT WindowsDeleteString(void *p) {
  struct hstring *h = p;
  if (!h) return S_OK;
  if (h->magic != 0x48535452) { bad("WindowsDeleteString: not a string"); return S_OK; }
  h->magic = 0; free(h); g_strings_live--; return S_OK;
}
static void hstring_text(void *p, char *out, int max) {
  struct hstring *h = p;
  if (!h || h->magic != 0x48535452) { bad("expected an HSTRING"); out[0] = 0; return; }
  narrow(h->text, out, max);
}
HRESULT RoInitialize(int32_t kind) { g_ro_init_calls++; g_ro_init_arg = kind; return 1; /* S_FALSE: already */ }

// ---------- COM objects ----------
struct obj { void **vtbl; int refs; int kind; struct obj *op; };
static struct obj *new_obj(void **vtbl, int kind) { struct obj *o = calloc(1, sizeof *o); o->vtbl = vtbl; o->refs = 1; o->kind = kind; g_objects_live++; return o; }
static uint32_t AddRef(struct obj *o) { return ++o->refs; }
static uint32_t Release(struct obj *o) {
  if (--o->refs > 0) return o->refs;
  if (o->op) Release(o->op);
  free(o); g_objects_live--; return 0;
}
static HRESULT NotUsed(void) { bad("unexpected method"); return S_OK; }

static void *info_vtbl[11];
static HRESULT OpQI(struct obj *o, const uint8_t *iid, void **out) {
  if (!memcmp(iid, IID_INFO, 16)) {
    struct obj *info = new_obj(info_vtbl, 3); info->op = o; AddRef(o);
    *out = info; return S_OK;
  }
  *out = NULL; return E_NOINTERFACE;
}
static HRESULT OpGetResults(struct obj *o, int32_t *out) {
  if (g_polls <= g_polls_before_done) bad("GetResults before the operation completed");
  *out = g_hello_result; return S_OK;
}
static void *op_vtbl[9] = { (void *)OpQI, (void *)AddRef, (void *)Release, (void *)NotUsed, (void *)NotUsed, (void *)NotUsed, (void *)NotUsed, (void *)NotUsed, (void *)OpGetResults };
static HRESULT InfoId(struct obj *o, uint32_t *out) { *out = 1; return S_OK; }
static HRESULT InfoStatus(struct obj *o, int32_t *out) { g_polls++; *out = g_polls <= g_polls_before_done ? 0 : g_end_status; return S_OK; }
static HRESULT InfoError(struct obj *o, int32_t *out) { *out = 0; return S_OK; }
static HRESULT InfoCancel(struct obj *o) { g_cancels++; return S_OK; }
static HRESULT InfoClose(struct obj *o) { g_closes++; return S_OK; }
static HRESULT InfoQI(struct obj *o, const uint8_t *iid, void **out) { *out = NULL; return E_NOINTERFACE; }
static void *info_vtbl[11] = { (void *)InfoQI, (void *)AddRef, (void *)Release, (void *)NotUsed, (void *)NotUsed, (void *)NotUsed, (void *)InfoId, (void *)InfoStatus, (void *)InfoError, (void *)InfoCancel, (void *)InfoClose };

static HRESULT InteropRequest(struct obj *o, uint64_t hwnd, void *message, const uint8_t *riid, void **out) {
  if (hwnd != g_expect_hwnd) bad("RequestVerificationForWindowAsync: wrong window");
  if (memcmp(riid, IID_OP, 16)) bad("RequestVerificationForWindowAsync: wrong IID for IAsyncOperation<UserConsentVerificationResult>");
  hstring_text(message, g_hello_message, sizeof g_hello_message);
  *out = new_obj(op_vtbl, 2); return S_OK;
}
static HRESULT InteropQI(struct obj *o, const uint8_t *iid, void **out) { *out = NULL; return E_NOINTERFACE; }
static void *interop_vtbl[7] = { (void *)InteropQI, (void *)AddRef, (void *)Release, (void *)NotUsed, (void *)NotUsed, (void *)NotUsed, (void *)InteropRequest };

HRESULT RoGetActivationFactory(void *class_id, const uint8_t *iid, void **out) {
  hstring_text(class_id, g_class, sizeof g_class);
  if (memcmp(iid, IID_INTEROP, 16)) bad("RoGetActivationFactory: wrong IID for IUserConsentVerifierInterop");
  if (g_factory_fails) { *out = NULL; return E_NOINTERFACE; }
  *out = new_obj(interop_vtbl, 1); return S_OK;
}

// ---------- the password dialog and LogonUser ----------
struct credui_info { uint32_t cbSize; uint64_t hwndParent; const uint16_t *message; const uint16_t *caption; void *banner; };
uint32_t CredUIPromptForWindowsCredentialsW(struct credui_info *info, uint32_t auth_error, uint32_t *pkg, const void *in, uint32_t in_size,
                                            void **out, uint32_t *out_size, int32_t *save, uint32_t flags) {
  if (!info || info->cbSize != sizeof *info) bad("CREDUI_INFOW: wrong cbSize");
  if (info && info->hwndParent != g_expect_hwnd) bad("CREDUI_INFOW: wrong parent window");
  if (flags != 0x200) bad("CredUIPromptForWindowsCredentialsW: not CREDUIWIN_ENUMERATE_CURRENT_USER");
  if (!pkg || !out || !out_size) bad("CredUIPromptForWindowsCredentialsW: missing out parameter");
  if (info) { narrow(info->caption, g_caption, sizeof g_caption); narrow(info->message, g_prompt_message, sizeof g_prompt_message); }
  if (g_prompts < 8) g_last_errors[g_prompts] = (int)auth_error;
  int n = g_prompts++;
  if (n == g_prompt_cancel_at || n >= g_n_passwords) return 1223; // ERROR_CANCELLED
  char *buf = calloc(1, 64);
  strncpy(buf, g_passwords[n], 63);
  *out = buf; *out_size = 64; return 0;
}
int32_t CredUnPackAuthenticationBufferW(uint32_t flags, void *buf, uint32_t size, uint16_t *user, uint32_t *ulen, uint16_t *domain, uint32_t *dlen, uint16_t *pass, uint32_t *plen) {
  if (flags != 1) bad("CredUnPackAuthenticationBufferW: not CRED_PACK_PROTECTED_CREDENTIALS");
  if (*ulen < 64 || *dlen < 64 || *plen < 64) bad("CredUnPackAuthenticationBufferW: buffers too small");
  const char *u = "MicrosoftAccount\\saif@example.com";
  int i = 0;
  for (; u[i]; i++) user[i] = (uint16_t)u[i];
  user[i] = 0; *ulen = i + 1;
  domain[0] = 0; *dlen = 1;
  const char *p = buf;
  for (i = 0; p[i] && i < 60; i++) pass[i] = (uint16_t)p[i];
  pass[i] = 0; *plen = i + 1;
  return 1;
}
uint32_t CredUIParseUserNameW(const uint16_t *full, uint16_t *user, uint32_t ulen, uint16_t *domain, uint32_t dlen) {
  int slash = -1, n = 0;
  for (; full[n]; n++) if (full[n] == '\\' && slash < 0) slash = n;
  if (slash < 0) return 1315;
  for (int i = 0; i < slash; i++) domain[i] = full[i];
  domain[slash] = 0;
  for (int i = slash + 1; i <= n; i++) user[i - slash - 1] = full[i];
  return 0;
}
int32_t LogonUserW(const uint16_t *user, const uint16_t *domain, const uint16_t *pass, uint32_t type, uint32_t provider, void **token) {
  if (type != 2 || provider != 0) bad("LogonUserW: not an interactive logon with the default provider");
  char p[64];
  narrow(user, g_logon_user, sizeof g_logon_user);
  narrow(domain, g_logon_domain, sizeof g_logon_domain);
  narrow(pass, p, sizeof p);
  if (strcmp(g_logon_user, "saif@example.com") || strcmp(g_logon_domain, "MicrosoftAccount") || strcmp(p, "right")) return 0;
  *token = (void *)0x77; return 1;
}
int32_t CloseHandle(void *h) { if (h == (void *)0x77) g_tokens_closed++; else bad("CloseHandle: not the logon token"); return 1; }
void CoTaskMemFree(void *p) {
  if (!p) return;
  const unsigned char *b = p;
  for (int i = 0; i < 64; i++) if (b[i]) { g_unwiped++; break; }
  g_freed++; free(p);
}

// ---------- the test's side ----------
void fake_reset(int hello_result, int polls_before_done, int end_status, int factory_fails, uint64_t hwnd) {
  g_hello_result = hello_result; g_polls_before_done = polls_before_done; g_end_status = end_status; g_factory_fails = factory_fails;
  g_expect_hwnd = hwnd; g_bad = 0; g_last_bad[0] = 0; g_class[0] = g_hello_message[0] = g_caption[0] = g_prompt_message[0] = 0;
  g_logon_user[0] = g_logon_domain[0] = 0; g_ro_init_calls = 0; g_ro_init_arg = -1; g_polls = g_cancels = g_closes = 0;
  g_prompts = 0; g_prompt_cancel_at = -1; g_unwiped = g_freed = g_tokens_closed = 0; g_n_passwords = 0;
  memset(g_last_errors, 0, sizeof g_last_errors);
}
void fake_passwords(const char *a, const char *b, int cancel_at) {
  g_n_passwords = 0;
  if (a) g_passwords[g_n_passwords++] = strdup(a);
  if (b) g_passwords[g_n_passwords++] = strdup(b);
  g_prompt_cancel_at = cancel_at;
}
const char *fake_text(int which) {
  switch (which) {
    case 0: return g_class; case 1: return g_hello_message; case 2: return g_caption; case 3: return g_prompt_message;
    case 4: return g_logon_user; case 5: return g_logon_domain; default: return g_last_bad;
  }
}
int fake_count(int which) {
  switch (which) {
    case 0: return g_bad; case 1: return g_strings_live; case 2: return g_objects_live; case 3: return g_polls; case 4: return g_cancels;
    case 5: return g_closes; case 6: return g_prompts; case 7: return g_unwiped; case 8: return g_freed; case 9: return g_tokens_closed;
    case 10: return g_ro_init_calls; case 11: return g_ro_init_arg; case 12: return g_last_errors[0]; case 13: return g_last_errors[1];
    default: return -1;
  }
}
