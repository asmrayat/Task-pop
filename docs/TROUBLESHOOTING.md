# Troubleshooting

The common problems and their fixes. If yours isn't here, see [SUPPORT.md](../SUPPORT.md).

**Which version do I have?** Open **Settings → Updates**: the version is at the top.

## The double-tap doesn't open TaskPop

- **Tap, don't hold.** Press and release the key quickly, twice in a row, with nothing else in between. A press longer than about a third of a second, a gap longer than about 0.4 seconds, or any other key pressed with it (as in ⌘C or Ctrl+C) doesn't count, on purpose.
- **Check the key.** **Settings → General → Double-tap to open** shows which key you chose, or **Off**. The welcome tour lets you try it on a big on-screen key: **Settings → Help → Show tour**.
- **Mac: check the status line under the setting.**
  - **macOS is blocking the double-tap** means TaskPop isn't allowed under **System Settings → Privacy & Security → Input Monitoring**. Click **Allow**, turn on **TaskPop** in the list, then click **Restart TaskPop**.
  - If TaskPop is switched on in that list and it still says it's blocked, select TaskPop there, remove it with **−**, then click **Allow** in TaskPop again and switch it back on. This clears a stale entry left by an older copy.
  - **Allow TaskPop again to hear every double-tap** (an orange dot) means macOS no longer recognises TaskPop under Input Monitoring, which can happen after an update. The double-tap still works most of the time, but can be missed while another app is busy. Click **Allow**, switch **TaskPop** off and on in that list, then click **Restart TaskPop**.
  - **Double-tap isn't available on this Mac** means macOS didn't let TaskPop read the keys at all. Use the keyboard shortcut instead.
- **It only fails while another app is open (a video player, for example):** update to TaskPop 1.6.8 or newer, which hears the keys as macOS reports them instead of only checking them, so a busy or background TaskPop doesn't miss a quick double-tap.
- **Still not working?** Open **Settings → Help → Double-tap report**, click **Copy report**, and paste it into a [bug report](https://github.com/asmrayat/Task-pop/issues/new?template=bug_report.yml). It has only counts and timings, never what you typed.
- **The keyboard shortcut and the menu bar or tray icon always work**, even when the double-tap doesn't.

## The keyboard shortcut does nothing

Another app is probably using the same shortcut. Open **Settings → General → Keyboard shortcut**, click it and press a different combination, or click **Reset** to go back to ⌃⌥T (Ctrl+Alt+T on Windows).

## Reminders don't pop up

- Click **Send test** in **Settings → Reminders → Test notifications**.
- **Mac:** open **System Settings → Notifications → TaskPop** and turn on **Allow notifications**. A Focus mode (such as Do Not Disturb) also hides them.
- **Windows:** open **Settings → System → Notifications**, make sure notifications are on for TaskPop and that **Do not disturb** (Focus assist on Windows 10) is off.
- Reminders only fire while TaskPop is running. Turn on **Open at Login** (Mac) or **Start with Windows** so it's always there.

## The panel opens in the wrong place

Drag it by its top bar to where you want it, or choose **Left** or **Right** in **Settings → Panel → Position** to put it back in a corner. If the screen you put it on is unplugged, it opens on the screen you're using instead, in the same spot.

## Installing on a Mac

- **"Apple could not verify…" or "can't be opened":** TaskPop isn't notarized by Apple yet. Open **System Settings → Privacy & Security**, scroll down, click **Open Anyway** next to the message about TaskPop and confirm with your password. You only need to do this once.
- **The installer says it couldn't download TaskPop:** a first install downloads the rest of the app (about 130 MB) from GitHub, so it needs a working internet connection. Check your connection, or turn off a VPN or filter that blocks `github.com`, and run the installer again.
- **The installer stopped with an error:** run it once more. If it fails again, open **Console** (or run `grep -i taskpop /var/log/install.log` in Terminal) and attach what it says to a [bug report](https://github.com/asmrayat/Task-pop/issues/new?template=bug_report.yml).

## Installing on Windows

- **"Windows protected your PC":** choose **More info**, then **Run anyway**. This SmartScreen warning appears for apps that aren't yet widely downloaded or signed.
- **"TaskPop couldn't download the rest of the app":** the installer downloads the app's runtime from GitHub. Check your internet connection and run the installer again.
- **"The installer couldn't start Windows PowerShell":** the installer uses PowerShell to download and check the app. Some work computers block it; ask your IT team, or wait for the Microsoft Store version.
- **"A downloaded file didn't pass its safety check":** the download was damaged or changed on the way, so nothing was installed. Run the installer again.

## Updating

- **"Couldn't check for updates":** check your internet connection and click **Check now** in **Settings → Updates**. "The update service is busy" means GitHub is limiting requests for a while; it clears up by itself.
- **An update failed to install:** click **Update now** again. If it keeps failing, download the latest installer from the [releases page](https://github.com/asmrayat/Task-pop/releases/latest) and run it. Installing over the top keeps your tasks and settings.
- **You don't want to be asked:** turn off **Check for updates automatically** in **Settings → Updates**, or choose **Update later** to be asked again in a few hours.
- **Microsoft Store copy:** the Store installs updates for you, so TaskPop doesn't check by itself.

## My tasks are missing or look wrong

If `tasks.json` is ever damaged, TaskPop loads its backup (`tasks.json.bak`, the save before the last one) by itself. If the list opens but looks wrong, you can go back to that backup by hand; it helps most right after something went wrong.

1. Quit TaskPop.
2. Open its folder: **Settings → Tasks & data → Show in Finder** (Show in File Explorer on Windows), or see [where TaskPop keeps your data](PRIVACY.md#what-it-stores-and-where).
3. Make a copy of the whole folder somewhere safe.
4. Rename `tasks.json` to `tasks.broken.json`, then rename `tasks.json.bak` to `tasks.json`.
5. Open TaskPop again.

If you exported your tasks earlier, **Settings → Tasks & data → Import…** brings them back too.

## Start over

Quit TaskPop and delete its folder (see [where TaskPop keeps your data](PRIVACY.md#what-it-stores-and-where)). The next time it opens it starts fresh, with the welcome tour.

## Still stuck?

[Open a bug report](https://github.com/asmrayat/Task-pop/issues/new?template=bug_report.yml) with your TaskPop version, your macOS or Windows version, and what you tried.
