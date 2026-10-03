# Changelog

All notable changes to TaskPop are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and TaskPop uses [semantic versioning](https://semver.org).

Installers for every version are on the [releases page](https://github.com/asmrayat/Task-pop/releases).

## [1.6.7] - 2026-10-03

### Fixed

- Dragging a task to reorder it no longer does nothing when you flick it quickly up past the top of the list or down past the bottom of the panel. The drag used to start only once the pointer had moved far enough while still over the list, so a fast flick that left the list in a single movement was ignored.

## [1.6.6] - 2026-10-02

### Added

- Move the panel anywhere: drag it by its top bar and it opens in that spot from then on, on the screen you left it on. It lines up with nearby screen edges and always stays fully on screen.
- **Settings → Position** now offers Left, Right or Custom (wherever you last dragged it).

## [1.6.5] - 2026-10-02

### Added

- A one-minute welcome tour the first time TaskPop runs: pick your double-tap key and try it on a big on-screen key, or record a shortcut. On a Mac it says when macOS needs your permission and opens the right page in System Settings.
- Take the tour again from **Settings → Help → Show tour**, or **Welcome Tour…** in the menu.

### Changed

- **Updates** moved to the General section of Settings, near the top.
- Plainer wording in Settings, without technical terms.

## [1.6.4] - 2026-10-02

### Added

- A small **New update is here** pop-up when a new version is out, with what's new and two buttons: **Update now**, or **Update later** to be asked again in a few hours.

### Fixed

- The Mac installer's welcome and finish pages showed garbled characters instead of quotes and dashes.

## [1.6.3] - 2026-10-02

### Added

- Move the selected task up or down with ⌥↑ / ⌥↓ on a Mac, or Alt+↑ / Alt+↓ on Windows.

### Fixed

- Mac: the double-tap sometimes stopped working after TaskPop had been in the background for a while, because macOS put the app to sleep (App Nap). TaskPop now stays responsive, checks the keys more often and works on every desktop (Space).
- Windows: dragging a task to reorder it sometimes did nothing, depending on where you let go. Drags now always land where the blue line shows, including over the "Completed" header, in the gap below the last task and outside the panel.
- The tips in the panel name the double-tap key you chose instead of always saying Control.

## 1.6.2 - 2026-09-28

A Microsoft Store build only, so there is no release for it here; nothing changed in the Mac or Windows installers.

## [1.6.1] - 2026-09-28

### Fixed

- The double-tap and the keyboard shortcut now always close the panel when it's open, even when another app has the focus.

## [1.6.0] - 2026-09-28

### Added

- **Add to Google Calendar** on any task: TaskPop reads dates like "tomorrow at 3pm" from the task, lets you set the time, length, location, notes, a daily repeat and a Google Meet link, and opens Google Calendar in your browser with the event filled in. Nothing is connected to your Google account.

### Fixed

- The Mac installer could stop partway on some Macs.

## [1.5.0] - 2026-09-28

### Added

- Updates: TaskPop checks this repository's releases for a new version, downloads it, checks it against its published SHA-256 checksum, installs it and reopens, with your tasks and settings kept. Checking can be turned off in Settings.

## [1.4.0] - 2026-09-27

### Added

- Double-tap a key (Control, Option, Command or Shift on a Mac; Ctrl, Alt or Shift on Windows) to open and close the panel from any app.
- A Windows version: a tray app with its panel next to the clock, installed per user with no administrator prompt, for x64 and ARM64 PCs.

### Changed

- One Mac installer for both Apple silicon and Intel Macs.

## [1.2.0] - 2026-09-24

The first public release.

### Added

- A to-do panel in the Mac menu bar that slides in from the corner of the screen, and pops up when you open the lid, wake the Mac or unlock it.
- Open it from anywhere with ⌃⌥T, or a shortcut you record.
- Start a task with **!** to star it; starred tasks stay at the top.
- Reminders in an hour, this evening, tomorrow morning or at any time, with **Done** and **Snooze** in the notification.
- Daily tasks that un-tick themselves each morning, and a morning summary of what's left.
- Reorder by dragging, undo, and full keyboard control.
- Light and dark appearance, panel position and width.
- Export and import your tasks, and delete completed ones automatically after a day or a week.
- Tasks saved locally the moment they change, with a backup of the previous save.

[1.6.7]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.7
[1.6.6]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.6
[1.6.5]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.5
[1.6.4]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.4
[1.6.3]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.3
[1.6.1]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.1
[1.6.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.0
[1.5.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.5.0
[1.4.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.4.0
[1.2.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.2.0
