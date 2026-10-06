# Changelog

All notable changes to TaskPop are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and TaskPop uses [semantic versioning](https://semver.org).

Installers for every version are on the [releases page](https://github.com/asmrayat/Task-pop/releases).

## [1.8.0] - 2026-10-06

### Added

- **Categories.** A row of small tags along the top of the panel: **All**, your categories, and **+** to make a new one. It scrolls sideways when there are more than fit (with a mouse wheel too).
  - TaskPop starts you off with **Personal** and **Work**. Rename them, give them one of eight colours, put them in another order or delete them: double-click a tag to rename it, or right-click it for the rest.
  - Click a tag to see only its tasks; the count at the top and the progress line are for that tag. Tasks you add there go into it. Under **All** you see everything, each task with its category after its name. **←** and **→** move between tags.
  - Move a task with **⋯ → Move to**, by dragging it onto a tag, or by adding **#name** when you type it ("Buy milk #personal").
  - Tasks in no category are under **Unsorted**, which only shows up when there are some.
  - Deleting a category moves its tasks to Unsorted, with **Undo**. **Clear** under a tag clears only that tag's finished tasks.
  - Export and import carry your categories; an imported category with the same name as one of yours is the same one.
- **Sort your tasks.** The first time TaskPop 1.8 opens, the tasks you already had are in no category, so a card at the top goes through them one at a time ("3 of 13"): click a category (or press 1–9), make a new one with **New**, **Skip** it, or **Do the rest later**. Anything left waits under **Unsorted**, where **Sort them** picks up where you left off.

## [1.7.0] - 2026-10-06

### Added

- **Timers.** Give a task a time frame to finish in: **⋯ → Set a timer** (15 minutes, 30 minutes, 1, 2 or 4 hours, 1 day, or **Custom…** for any number of days, hours and minutes), or select a task and press **T**.
  - The task becomes important, moves to the top of the list and is highlighted.
  - Under its name, a countdown ("1d 5h left", "4h 12m left", "23:41 left") and a line that shrinks as the time runs out. Both turn orange in the last minutes and red when the time is up.
  - A **Time’s up** notification arrives right on time, with **Mark as done** and **Add 15 min**.
  - Click the countdown to change the timer or remove it; the menu can also add 15 minutes or an hour. Removing a timer takes away the star it gave (a task you'd starred yourself keeps it).
  - Finished tasks show how it went: "15m early", "Just in time" or "5m late".
  - A timer on a task that repeats every day is cleared each morning, when the task starts afresh.

## [1.6.8] - 2026-10-03

### Fixed

- Mac: double-tapping the key sometimes did nothing while another app such as VLC was open, even though it worked once TaskPop was in front. TaskPop used to check the keys every few milliseconds, and in the background those checks could run too late to see a quick double-tap. Now macOS tells TaskPop about every change of the modifier keys as it happens (through the same Input Monitoring permission), and TaskPop only falls back to checking if those events ever stop arriving.
- Mac: App Nap is now also turned off through the Info.plist key macOS actually reads, so TaskPop's timers keep running on time in the background.

### Added

- Mac: if macOS stops recognising TaskPop under Input Monitoring (which can happen after an update, since TaskPop isn't signed with an Apple Developer ID yet), TaskPop says so once, and **Settings → General** shows how to allow it again. As soon as it's allowed, TaskPop starts listening for key events without a restart.
- **Settings → Help → Double-tap report**: copies a short report of what the double-tap sees (counts and timings only, never which keys were pressed) to paste into a bug report.

## 1.6.7 - 2026-10-03

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

[1.8.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.8.0
[1.7.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.7.0
[1.6.8]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.8
[1.6.6]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.6
[1.6.5]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.5
[1.6.4]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.4
[1.6.3]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.3
[1.6.1]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.1
[1.6.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.6.0
[1.5.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.5.0
[1.4.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.4.0
[1.2.0]: https://github.com/asmrayat/Task-pop/releases/tag/v1.2.0
