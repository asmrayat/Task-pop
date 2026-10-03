# Security

## Supported versions

Only the [latest release](https://github.com/asmrayat/Task-pop/releases/latest) gets security fixes. TaskPop updates itself (or asks to), so please update before reporting.

| Version | Supported |
| --- | --- |
| Latest 1.x release | ✅ |
| Older releases | ❌ |

## Reporting a vulnerability

Please **don't** open a public issue for a security problem.

Report it privately through GitHub instead: go to the repository's **Security** tab and choose **Report a vulnerability**, or use [this link](https://github.com/asmrayat/Task-pop/security/advisories/new). Only the maintainers can see the report.

Please include:

- what the problem is and what someone could do with it
- the TaskPop version and your macOS or Windows version
- the steps to reproduce it, or a proof of concept
- whether you'd like to be credited, and how

Reports are answered as soon as possible. Once the problem is confirmed, a fix is released as soon as it's ready, and the advisory is published after people have had a chance to update. With your permission, you'll be credited in the advisory and the changelog.

## Where to look

TaskPop is small, and these are the parts where security matters most:

- **The updater** ([`app/updater.js`](app/updater.js)): finds the latest release, downloads its installer and checks it against the SHA-256 digest GitHub publishes before installing it. On a Mac the install runs with administrator rights.
- **The installers** ([`installers/`](installers)): they download the Electron runtime from GitHub and check it against checksums built into the installer.
- **The double-tap** ([`app/doubletap.js`](app/doubletap.js)): reads the state of the modifier keys through the operating system's own functions.
- **The windows' bridges** (`app/preload*.js`): what each window's page is allowed to ask the app to do. Every window runs sandboxed, with context isolation and without Node.js.
- **Imported files and saved data**: tasks are cleaned and checked before they're used, whether they come from disk or from **Import…**.

Out of scope: problems that need someone who already controls your user account or computer, and the warnings macOS and Windows show for apps that aren't yet notarized or signed.
