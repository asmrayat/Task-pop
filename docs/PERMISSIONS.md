# Permissions

TaskPop asks for as little as it can. Here is everything it may ask for, why, and what happens if you say no.

## Mac

### Input Monitoring: only for the double-tap

**Where:** System Settings → Privacy & Security → Input Monitoring

**Why:** to notice a quick double-tap of Control, Option, Command or Shift while you're in another app, macOS has to let TaskPop see whether those keys are held down. TaskPop reads exactly two things: which of those modifier keys are down, and a running count of other key presses and clicks (so that ⌘C or ⌃A isn't mistaken for a tap). macOS tells TaskPop each time a modifier key changes, through a listen-only event tap that can't change or block anything, and TaskPop also checks the keys every few milliseconds in case those events stop. It never reads which other keys you press, and nothing is recorded or sent anywhere. The [code that does this](../app/doubletap.js) is short and commented.

**When it asks:** the welcome tour asks when you choose a double-tap key, and opens the right page in System Settings. Turn on **TaskPop** there. If macOS asks you to quit and reopen TaskPop, choose **Quit & Reopen**.

**After an update:** TaskPop isn't signed with an Apple Developer ID yet, so each version looks new to macOS, and macOS may stop recognising the earlier OK. TaskPop notices, tells you once, and **Settings → General** shows an orange dot with an **Allow** button: switch TaskPop off and on in the Input Monitoring list, then restart it.

**If you say no:** everything else works. Open TaskPop with the keyboard shortcut (⌃⌥T unless you changed it) or the menu bar icon instead, or set **Settings → General → Double-tap to open** to **Off**.

### Notifications: for reminders

**Where:** System Settings → Notifications → TaskPop

**Why:** reminders and the morning summary are notifications, with **Done** and **Snooze** buttons on reminders.

**When it asks:** the first time TaskPop has something to show. **Settings → Reminders → Test notifications → Send test** shows one straight away.

**If you say no:** reminders still appear in the panel next to their tasks, but nothing pops up when they're due.

### Your password: for installing and updating

**Why:** TaskPop lives in your Applications folder, which only an administrator can change. The installer asks once, like any other Mac installer. Updating asks again, in a standard macOS password prompt that says it's TaskPop, and the update is checked against the SHA-256 checksum GitHub publishes for it before it's installed.

### Open at Login

**Where:** **Open at Login** in TaskPop's menu or Settings; macOS lists it in System Settings → General → Login Items.

TaskPop turns this on the first time it runs, so it's ready when you open the lid or log in. Turn it off there any time; TaskPop doesn't turn it back on.

## Windows

TaskPop needs no special permission on Windows.

- **Installing:** the installer puts TaskPop in your own user folder (`%LOCALAPPDATA%\Programs\TaskPop`), so it never asks for administrator rights.
- **The double-tap:** Windows lets any app check whether Ctrl, Alt, Shift or the Windows key is held down, so there's nothing to allow. As on the Mac, other keys are only checked to count presses: TaskPop keeps the count and nothing about which keys they were.
- **Notifications:** shown by Windows. If they don't appear, check **Settings → System → Notifications** and that **Do not disturb** (Focus assist on Windows 10) is off.
- **Start with Windows:** TaskPop turns this on the first time it runs. Turn it off any time from its tray menu or Settings, or in **Settings → Apps → Startup**, where Windows lists it.
- **SmartScreen:** until TaskPop is signed and in the Microsoft Store, Windows may warn before the first run. Choose **More info**, then **Run anyway**. You can check the installer first: its SHA-256 checksum is listed with each release.

## What TaskPop never asks for

No access to your files, contacts, calendar, location, camera, microphone or screen. No accessibility access. No account.
