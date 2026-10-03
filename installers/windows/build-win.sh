#!/bin/bash
# Builds TaskPop's Windows installer (one small setup file for x64 and ARM64 PCs).
#   installers/windows/build-win.sh          -> installers/windows/out/TaskPop-Setup-<version>.exe
#   installers/windows/build-win.sh test N   -> out/test/TaskPop-Setup-test-N.exe (a test build whose
#                                               setup step is a stand-in that exits with code N)
# The installer carries TaskPop's own files; setup.ps1 downloads the matching Electron runtime
# from GitHub (checked against pinned checksums) or reuses the installed one.
# Needs NSIS (Ubuntu: sudo apt install nsis) and tools/fetch-build-deps.sh.
set -euo pipefail
cd "$(dirname "$0")"
REPO=$(cd ../.. && pwd)
TOOLS="$REPO/.build-tools"
VERSION=$(python3 -c "import json; print(json.load(open('$REPO/app/package.json'))['version'])")
[ -f "$TOOLS/bin/rcedit-x64.exe" ] || { echo "missing build tools: run tools/fetch-build-deps.sh first" >&2; exit 1; }
rm -rf stage && mkdir -p stage
python3 ../assemble_app.py windows stage/app >/dev/null
cp setup.ps1 stage/setup.ps1
cp "$TOOLS/bin/rcedit-x64.exe" stage/rcedit.exe
cp "$REPO/app/assets/TaskPop.ico" stage/TaskPop.ico
mkdir -p out
if [ "${1:-}" = "test" ]; then
  mkdir -p out/test
  (cd test && makensis -V2 fakeapp.nsi)
  makensis -V2 -DVERSION="$VERSION" -DTEST_AMD64 -DTEST_CODE="$2" TaskPop.nsi
else
  makensis -V2 -DVERSION="$VERSION" TaskPop.nsi
  echo "installers/windows/out/TaskPop-Setup-$VERSION.exe"
fi
