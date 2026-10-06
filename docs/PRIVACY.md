# Privacy

TaskPop is a to-do list that keeps your tasks on your computer. It has no account, no server of its own, no analytics, no ads and no tracking. This page lists every time it goes online and every file it writes, so you can check that for yourself in the [source code](../app).

## What TaskPop never does

- It never sends your tasks, notes or settings anywhere.
- It never records what you type. The double-tap only reads whether the modifier keys (Control, Option or Alt, Command or the Windows key, Shift) are held down, plus a running count of other key presses and mouse clicks so that shortcuts like ⌘C don't count as taps. Which keys you pressed is never read or kept.
- It never signs in to Google or any other service.
- It has no crash reporting, usage statistics or "phone home" of any kind. The double-tap report in **Settings → Help** is only made when you click **Copy report**, and only goes to your clipboard.

## When it goes online

| What | Where it connects | When | Can you turn it off? |
| --- | --- | --- | --- |
| Checking for a new version | `api.github.com`, this repository's latest release | About 20 seconds after it starts, then at most every 4 hours, and shortly after the computer wakes | Yes: **Settings → Updates → Check for updates automatically** |
| Downloading an update | `github.com` and GitHub's download servers | Only when you choose **Update now** | It only happens when you ask |
| Opening the release notes | `github.com`, in your browser | When you click **Read the full release notes** | It only happens when you ask |
| Installing for the first time | `github.com`, to download the [Electron](https://www.electronjs.org) runtime TaskPop runs on (about 130 MB) | While the installer runs | No; it's needed to install. Every download is checked against a SHA-256 checksum built into the installer |
| Google Calendar | `calendar.google.com`, in your browser | When you choose **Add to Google Calendar** | It only happens when you ask |

The copy from the Microsoft Store doesn't check GitHub at all: the Store keeps it up to date.

The update check is a plain request for public information about the latest release. It sends what any web request sends (your IP address and a `User-Agent` of `TaskPop/<version>`), and nothing about you or your tasks. GitHub's handling of that request is covered by the [GitHub privacy statement](https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement).

When you send a task to Google Calendar, TaskPop builds a link with the event's title, time, length, location, notes and repeat and opens it in your browser; nothing is saved until you click **Save** in Google Calendar. If you picked a Google account in TaskPop's Settings, its address is added to the link so the right account opens. From then on, the event is handled by Google under [Google's privacy policy](https://policies.google.com/privacy).

## What it stores, and where

Everything is saved in one folder on your computer:

| | Folder |
| --- | --- |
| Mac | `~/Library/Application Support/TaskPop` |
| Windows (installer) | `%APPDATA%\TaskPop` |
| Windows (Microsoft Store) | `%LOCALAPPDATA%\Packages\<TaskPop package>\LocalCache\Roaming\TaskPop` |

| File | What's in it |
| --- | --- |
| `tasks.json` | Your tasks: title, star, done, reminder, timer, repeat and when you created and completed them |
| `settings.json` | Your choices in Settings |
| `meta.json` | Small bits of bookkeeping: whether the tour has run, the last version you used, the last update check |
| `*.bak` | A copy of the previous good save of each file, used if a save is ever damaged |

The app's own cache files (the kind every Electron app keeps) are in the same folder. While an update is being installed, the downloaded installer sits in your temporary folder and is deleted afterwards.

**Export** writes your tasks to a file you choose, and **Import** reads one back. Nothing else leaves the folder.

To delete everything, quit TaskPop and delete the folder. On Windows the uninstaller offers to do it for you.

## Notifications

Reminders and the morning summary are shown by your operating system's notification system. Their text is your task titles, shown on your screen only.

## Questions

Open a [question on GitHub](https://github.com/asmrayat/Task-pop/issues/new/choose). If you think you've found a privacy or security problem, please report it privately as described in [SECURITY.md](../SECURITY.md).
