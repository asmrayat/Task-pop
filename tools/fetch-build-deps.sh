#!/bin/bash
# Fetches what the installer builds need into .build-tools/ (not committed). Run once.
#   tools/fetch-build-deps.sh           everything for the Mac and Windows installers
#   tools/fetch-build-deps.sh --store   also the Windows runtime for the Microsoft Store package
#
# Needs: git, npm, curl, cmake, a C/C++ compiler, and the zlib, OpenSSL and bzip2 headers
# (Ubuntu: sudo apt install build-essential cmake zlib1g-dev libssl-dev libbz2-dev).
# Every download is checked against a pinned checksum; the build stops if one doesn't match.
set -euo pipefail
cd "$(dirname "$0")/.."
T=.build-tools
mkdir -p "$T/npm" "$T/bin" "$T/src"

ELECTRON=44.4.5
KOFFI=3.3.1

fetch() { # url file sha256
  if [ ! -f "$2" ] || ! echo "$3  $2" | sha256sum -c --status; then
    echo "downloading $(basename "$2")"
    curl -fsSL --retry 3 -o "$2.part" "$1"
    echo "$3  $2.part" | sha256sum -c --status || { echo "checksum mismatch for $1" >&2; rm -f "$2.part"; exit 1; }
    mv "$2.part" "$2"
  fi
}

# koffi (TaskPop's native helper): the JavaScript package and the four binaries it ships with.
# npm checks each package against the registry's integrity hash.
( cd "$T/npm" && npm pack --silent "koffi@$KOFFI" "@koromix/koffi-darwin-arm64@$KOFFI" "@koromix/koffi-darwin-x64@$KOFFI" \
    "@koromix/koffi-win32-x64@$KOFFI" "@koromix/koffi-win32-arm64@$KOFFI" >/dev/null )

# rcedit: bundled in the Windows installer, which uses it to give TaskPop.exe its name and icon
fetch https://github.com/electron/rcedit/releases/download/v2.0.0/rcedit-x64.exe "$T/bin/rcedit-x64.exe" \
  3e7801db1a5edbec91b49a24a094aad776cb4515488ea5a4ca2289c400eade2a

# Tools to write a macOS disk image and package on Linux (pinned commits)
build_tool() { # name repo commit
  if [ ! -d "$T/src/$1/build" ]; then
    rm -rf "$T/src/$1"
    git clone --quiet "$2" "$T/src/$1"
    git -C "$T/src/$1" checkout --quiet "$3"
  fi
}
build_tool libdmg-hfsplus https://github.com/mozilla/libdmg-hfsplus.git ec23959
if [ ! -x "$T/bin/dmg" ]; then
  ( cd "$T/src/libdmg-hfsplus" && mkdir -p build && cd build && cmake .. >/dev/null && make -j"$(nproc)" >/dev/null )
  cp "$T/src/libdmg-hfsplus/build/dmg/dmg" "$T/src/libdmg-hfsplus/build/hfs/hfsplus" "$T/bin/"
fi
build_tool bomutils https://github.com/hogliux/bomutils.git c247002
if [ ! -x "$T/bin/mkbom" ]; then
  ( cd "$T/src/bomutils" && make -j"$(nproc)" >/dev/null )
  cp "$T/src/bomutils/build/bin/mkbom" "$T/bin/"
fi

# The Microsoft Store package contains the Windows runtime itself (the other installers download it)
if [ "${1:-}" = "--store" ]; then
  fetch "https://github.com/electron/electron/releases/download/v$ELECTRON/electron-v$ELECTRON-win32-x64.zip" \
    "$T/electron-win32-x64.zip" "$(sed -n "s/.*'x64' *= *'\([0-9a-f]\{64\}\)'.*/\1/p" installers/windows/setup.ps1)"
  fetch "https://github.com/electron/electron/releases/download/v$ELECTRON/electron-v$ELECTRON-win32-arm64.zip" \
    "$T/electron-win32-arm64.zip" "$(sed -n "s/.*'arm64' *= *'\([0-9a-f]\{64\}\)'.*/\1/p" installers/windows/setup.ps1)"
fi
echo "build tools ready in $T/"
