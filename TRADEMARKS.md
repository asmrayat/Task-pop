# Trademarks

The source code in this repository is licensed under the [MIT license](LICENSE). That license covers copyright in the code only.

It doesn't grant permission to use the TaskPop name, logo or icon, the asmlab name, or the look of the official website and store listings in a way that suggests your version is TaskPop or is made or endorsed by asmlab.

Official TaskPop builds are published only by the project maintainer, on this repository's [releases page](https://github.com/asmrayat/Task-pop/releases), at [taskpop.asmlab.agency](https://taskpop.asmlab.agency) and, once it is listed there, in the Microsoft Store.

You're welcome to fork, change and share TaskPop under the MIT license. If you distribute a modified build, please give it:

- a different name and icon
- different app identifiers: the Mac bundle identifier (`CFBundleIdentifier` in `installers/mac/build.py`), the Windows `APP_ID` in `app/main.js` and the Microsoft Store identity
- its own update source (`REPO` in `app/updater.js`), so that it doesn't install official TaskPop updates over your changes, or yours over official copies

Saying that your app is "based on TaskPop" is fine. Presenting a modified build as TaskPop, or as an official release, needs the maintainer's permission.
