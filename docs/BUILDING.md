# Building TaskPop

How the code is laid out, how to run it, how the installers are made, how the tests work and how a release is published.

## What's where

```text
app/                  TaskPop itself (an Electron app, plain JavaScript)
  main.js             the app: windows, tray / menu bar icon, saving, reminders, settings, updates
  renderer.js         the panel: the list, editing, drag to reorder, keyboard
  index.html, styles.css
  settings.*, tour.*, update-prompt.*   the Settings window, the welcome tour, the update pop-up
  preload*.js         what each window's page may ask the app to do
  doubletap.js        reads the modifier keys (macOS: CoreGraphics, Windows: user32) via koffi
  winfocus.js         brings the panel to the front on Windows
  updater.js          finds, downloads, checks and installs new versions from GitHub releases
  calendar.js         builds Google Calendar links
  when.js             reads dates like "tomorrow at 3pm" or "Fri 10:30"
installers/
  assemble_app.py     app/ plus the koffi build for one platform, trimmed to what's loaded
  mac/                the Mac disk image and installer package (built on Linux)
  windows/            the Windows setup (NSIS)
  store/              the Microsoft Store package (.msix)
  assets/             icons used by the installers
tests/                unit tests and app tests (see Tests)
tools/
  fetch-build-deps.sh build tools, pinned and checksum-verified, into .build-tools/
docs/                 these documents, and the README images in docs/assets/readme/
website/                 the website at taskpop.asmlab.agency (see WEBSITE.md)
assets/                   icons and font used by the website
```

There's no build step for the app: what's in `app/` is what runs.

## Running from the source

You need [Node.js](https://nodejs.org) 22.12 or newer.

```sh
cd app
npm install
npm start
```

`npm install` gets Electron and koffi; Electron downloads its own binary the first time it starts. `npm start` uses the same data folder as an installed TaskPop and only one copy runs at a time, so quit the installed one first, or give the source copy a folder of its own:

```sh
npm start -- --user-data-dir="$HOME/taskpop-dev"
```

Useful switches: `--show` opens the panel straight away, `--show-tour` starts the welcome tour.

## The installers

The installers are small: each carries TaskPop's own files (about 1 MB) and, while installing, downloads the matching [Electron](https://www.electronjs.org) runtime from GitHub, checks it against a SHA-256 checksum written into the installer, and reuses the copy that's already installed when it can. So an update usually downloads nothing extra.

All of them are built on Linux. On Ubuntu or Debian:

```sh
sudo apt install build-essential cmake git curl zlib1g-dev libssl-dev libbz2-dev hfsprogs nsis python3
tools/fetch-build-deps.sh
```

`fetch-build-deps.sh` puts everything into `.build-tools/` (not committed): the koffi packages from npm, rcedit (bundled in the Windows setup, which uses it to give `TaskPop.exe` its name and icon), and [libdmg-hfsplus](https://github.com/mozilla/libdmg-hfsplus) and [bomutils](https://github.com/hogliux/bomutils) built from pinned commits. Every download is checked; the script stops if one doesn't match.

### Mac

```sh
python3 installers/mac/build.py      # → installers/mac/out/TaskPop-<version>.dmg
```

One disk image for Apple silicon and Intel, holding **Install TaskPop.pkg**. The package's `preinstall` script downloads the runtime for the Mac it's running on; `postinstall` puts TaskPop together in `/Applications` and opens it. Both scripts must run under macOS's bash 3.2, so the build checks them with `lint_bash32.py`. The installer's welcome and finish pages must be plain ASCII (macOS Installer shows them as Latin-1), which the build checks too.

The app isn't signed with an Apple Developer ID or notarized yet, so macOS asks people to confirm the first install in **Privacy & Security**.

### Windows

```sh
installers/windows/build-win.sh      # → installers/windows/out/TaskPop-Setup-<version>.exe
```

One setup for x64 and ARM64 PCs. It installs per user into `%LOCALAPPDATA%\Programs\TaskPop` with no administrator prompt; [`setup.ps1`](../installers/windows/setup.ps1) downloads and checks the runtime. `build-win.sh test <code>` makes a test build whose download step is a stand-in that exits with that code, to try the installer's error messages.

### Microsoft Store

The Store package contains the runtime itself (Store apps can't download parts of themselves), so it needs the Windows runtimes, plus Wine and Pillow:

```sh
sudo apt install wine64 python3-pil
tools/fetch-build-deps.sh --store
cp installers/store/identity.placeholder.json identity.json   # then fill in the values from Partner Center
python3 installers/store/build_msix.py x64   identity.json TaskPop-<version>-x64.msix
python3 installers/store/build_msix.py arm64 identity.json TaskPop-<version>-arm64.msix
python3 installers/store/verify_msix.py TaskPop-<version>-x64.msix
```

`identity.json` takes the package name, publisher (`CN=…`) and publisher display name shown in **Partner Center → Product identity**. The package is left unsigned; the Store signs it after certification. The Store copy doesn't check GitHub for updates: the Store updates it.

### Updating Electron or koffi

Both are pinned to exact versions, and the installers carry checksums for the Electron downloads, so they're updated by hand, together:

- **Electron:** `app/package.json`; `ELECTRON_VERSION`, `ELECTRON_ARM64_SHA` and `ELECTRON_X64_SHA` in `installers/mac/scripts/preinstall`; `$ElectronVersion` and `$Checksums` in `installers/windows/setup.ps1`; `ELECTRON` in `tools/fetch-build-deps.sh`; and `installers/mac/Electron-Info.plist`, copied from the new version's `Electron.app`. The checksums are in the release's `SHASUMS256.txt` on [Electron's releases page](https://github.com/electron/electron/releases).
- **koffi:** `app/package.json`, `KOFFI_VERSION` in `installers/assemble_app.py` and `KOFFI` in `tools/fetch-build-deps.sh`. If its package layout changed, update `KOFFI_KEEP` in `assemble_app.py`.

Then run every test group, including the release group, before publishing.

## Tests

```sh
sudo apt install xvfb xdotool build-essential
cd app && npm install && cd ..
tests/run.sh             # unit + app, what CI runs
tests/run.sh unit
tests/run.sh app
sudo tests/run.sh release
```

The **app tests** start the real TaskPop on Linux under a virtual screen (`xvfb`), with `process.platform` set to `darwin` or `win32` so the Mac or Windows code runs, and drive it with real mouse and keyboard input. Operating system parts Linux doesn't have (the key-state readers, notifications, the tray title) are replaced by small stand-ins inside each test.

| Group | Suite | What it checks |
| --- | --- | --- |
| unit | `when-test` | reading dates and times out of task titles |
| | `doubletap-test` | the double-tap detector against simulated keyboards: taps, holds, shortcuts, key repeat |
| | `win-source-test` | the Windows key-state reader under the detector |
| | `appnap-test` | the Mac App Nap opt-out the double-tap relies on |
| | `eventtap-test` | the Mac key-event tap: the macOS calls it makes, detecting from events alone, falling back to checks when events stop |
| app | `regress` | the app as macOS: quick-add and stars, reminders and their notifications, daily tasks and the morning summary, the keyboard, undo, saving and import |
| | `win-app` | the app as Windows: tray, panel placement and style, focus, Ctrl and Alt double-tap, Windows wording |
| | `calendar-*` | **Add to Google Calendar**: the dialog, the date reading, the links it opens |
| | `toggle-*`, `double-tap*` | the double-tap and the shortcut always open and close the panel; what happens when macOS blocks it; the key-event path; the double-tap report |
| | `event-tap` | the key-event tap through the real koffi inside Electron, with a stand-in for macOS built from `tests/stubs/fakemac.c` |
| | `double-tap-watch-*` | the Mac key watcher stays awake only while it's needed |
| | `reorder-*` | drag to reorder with real mouse input, including flicks, drops outside the panel and 60 random drags checked against a model |
| | `tour-*` | the welcome tour, including when macOS blocks the double-tap and for Store copies |
| | `move-panel-*` | dragging the panel by its top bar, snapping to edges, staying on screen, Position settings |
| | `store` | the Microsoft Store copy: no self-updates, its start-up task |
| | `timers-*` | task timers: the menu and **T**, the countdown, the highlight, orange and red, **Time's up** on time, adding time, finishing early or late, undo |
| | `categories-*` | categories after updating from 1.7: **Sort your tasks** one by one, the tags and what each shows, adding into a category and with **#name**, **Move to**, dragging onto a tag, renaming, colours, order, deleting with Undo, the sideways scroll, export and import |
| | `categories-new-*` | categories on a first install: Personal and Work, nothing to sort, **Unsorted** only when needed |
| release | `updater` | the updater against a local stand-in for GitHub: version numbers, picking the right file, release notes, errors, downloading and checking installers |
| | `update-popup*` | the **New update is here** pop-up end to end: **Update later**, asking again, then **Update now** through to the built installer starting |

The **release** group needs the built installers in `installers/*/out` and root, because it puts stand-ins for macOS's `hdiutil`, `osascript` and `installer` at their real paths (`/usr/bin/…`). Run it in a throwaway VM or container.

Logs go to `$TMPDIR/taskpop-tests/logs` (set `TP_TMP` to change it). A suite passes when it reaches its last check with every check passing and no uncaught error in the app or the test.

## Publishing a release

1. **Version and notes.** In `app/`, run `npm version X.Y.Z --no-git-tag-version` (updates `package.json` and `package-lock.json`). Add the changes to [CHANGELOG.md](../CHANGELOG.md).
2. **Build** both installers (see above) and **test**: `tests/run.sh all` (the release group as root).
3. **Commit** and push to `main`.
4. **Create the release** on GitHub (**Releases → Draft a new release**):
   - Tag: `vX.Y.Z` on `main`. Title: `TaskPop X.Y.Z`.
   - Notes: a few short lines on what's new. TaskPop shows them in the update pop-up as plain text (about the first 1,500 characters), so keep them simple.
   - Attach exactly `TaskPop-X.Y.Z.dmg` and `TaskPop-Setup-X.Y.Z.exe`.
   - Publish it as the latest release, not as a pre-release or draft. TaskPop only looks at the latest published release.

GitHub records a SHA-256 digest for each uploaded file. TaskPop's updater downloads the installer from this repository's releases only and installs it only if it matches that digest.

Within a few hours, running copies of TaskPop see the new version and ask to update; the website's download buttons point at the latest release by themselves. Don't replace files in a published release: copies that already checked would see a different digest. Publish a new version instead.
