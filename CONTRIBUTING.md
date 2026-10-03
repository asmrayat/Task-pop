# Contributing to TaskPop

TaskPop aims to stay small, quick and easy to read: plain JavaScript on [Electron](https://www.electronjs.org), no framework, no build step and one native helper ([koffi](https://koffi.dev)). Contributions are welcome and are accepted under the [MIT license](LICENSE).

## Getting started

You need [Node.js](https://nodejs.org) 22.12 or newer and Git. TaskPop runs on macOS 13+ and Windows 10/11, so try your changes on one of those; the tests and the installer builds run on Linux too.

```sh
git clone https://github.com/asmrayat/Task-pop.git
cd Task-pop/app
npm install
npm start
```

`npm start` runs TaskPop straight from the source. It uses the same data folder as an installed TaskPop, and only one copy runs at a time, so quit the installed one first. To keep your real tasks out of the way while you work, give it a folder of its own:

```sh
npm start -- --user-data-dir="$HOME/taskpop-dev"
```

[Building TaskPop](docs/BUILDING.md) explains the code, the installers and the tests.

## Before you start

For anything bigger than a small fix, please [open an issue](https://github.com/asmrayat/Task-pop/issues/new/choose) first and describe what you'd like to change and why. That way nobody spends an evening on something that can't be merged.

Things that fit TaskPop:

- making the list quicker to reach, read or tidy
- fixes for a particular Mac, Windows version, keyboard or screen setup
- clearer wording, accessibility, and keyboard support

Things that probably don't:

- accounts, sync servers, analytics or anything else that sends your tasks somewhere
- features that run in the background all the time (TaskPop never listens to the microphone, for example)
- large new dependencies; check first whether Electron or the operating system already does it

## Code

- **`app/main.js`**: the app: windows, tray and menu bar icon, saving, reminders, settings.
- **`app/renderer.js`**: the panel itself: the list, editing, drag to reorder, the keyboard.
- **`app/doubletap.js`**, **`app/winfocus.js`**: the native parts (through koffi).
- **`app/updater.js`**, **`app/calendar.js`**, **`app/when.js`**: updates, Google Calendar links, reading dates like "tomorrow at 3pm".
- Every window has a small `preload*.js` that lists exactly what its page may ask the app to do. Keep windows sandboxed, with context isolation and no Node.js.

Style: two-space indents, semicolons, single quotes, `const` by default, and a short comment where the *why* isn't obvious. Match what's around your change.

Wording in the app matters as much as code: short, plain words, no technical terms in anything a user sees.

## Tests

```sh
tests/run.sh          # unit and app tests, as CI runs them
tests/run.sh unit     # just the quick ones
```

The app tests start the real app on Linux (under `xvfb`), make it act as macOS and as Windows, and drive it with real mouse and keyboard input. On Ubuntu they need `sudo apt install xvfb xdotool`. A bug fix should come with a check that fails without the fix. [Building TaskPop](docs/BUILDING.md#tests) lists the suites.

Behaviour that only a real computer can show (permissions, notifications, several screens, full-screen apps) can't be fully tested here. Say in your pull request what you tried, on which Mac or PC and system version, and what you couldn't test.

## Pull requests

- One change per pull request, with a title that says what it does ("Fix reminders after the Mac wakes", not "Update main.js").
- Describe the behaviour before and after, and how you checked it. The [template](.github/PULL_REQUEST_TEMPLATE.md) is a guide, not a form.
- Leave the version number and `CHANGELOG.md` to the maintainer; describe the user-visible change in the pull request so it can go into the release notes with your name.
- If there's an issue, mention it with `Refs #123`.

## Releases (maintainers)

Releases are made by hand from `main`; see [publishing a release](docs/BUILDING.md#publishing-a-release).

## Code of conduct

Be kind and assume good intent. Harassment or personal attacks aren't welcome in issues, pull requests or anywhere else in this project.
