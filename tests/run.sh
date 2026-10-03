#!/bin/bash
# Runs TaskPop's tests.
#
#   tests/run.sh               unit + app (what CI runs)
#   tests/run.sh unit          plain Node tests: date parsing, the double-tap detector, App Nap
#   tests/run.sh app           the real app on Linux, made to act as macOS and as Windows, driven
#                              with real mouse and keyboard input (needs xvfb-run and xdotool)
#   tests/run.sh release       the update flows end to end: needs built installers
#                              (installers/*/out) and root, because stand-ins for macOS's
#                              hdiutil, osascript and installer are put at their real paths
#   tests/run.sh all
#
# First: cd app && npm install   (gets Electron for the tests)
set -u
cd "$(dirname "$0")/.."
ELECTRON=${ELECTRON:-}
need_electron() { # npm's electron package downloads its binary the first time it's asked for it
  [ -n "$ELECTRON" ] && return
  if [ -f app/node_modules/electron/index.js ] && (cd app && node -e "require('electron')" >&2); then
    ELECTRON=$(cd app && node -p "require('electron')")
  fi
  [ -n "$ELECTRON" ] && [ -x "$ELECTRON" ] || { echo "Electron not found: run  cd app && npm install" >&2; exit 2; }
}
TMP=${TP_TMP:-${TMPDIR:-/tmp}/taskpop-tests}
export TP_TMP=$TMP
mkdir -p "$TMP"
LOG="$TMP/logs"; mkdir -p "$LOG"
GROUPS_TO_RUN=${*:-unit app}
[ "$GROUPS_TO_RUN" = "all" ] && GROUPS_TO_RUN="unit app release"

failed=0; ran=0; summary=()
result() { # name logfile
  local line fails ok=1
  line=$(grep -Eo '[0-9]+/[0-9]+ (checks |scenarios )?passed' "$2" | tail -1)
  fails=$(grep -cE '(^|\] )FAIL ' "$2")
  [ -n "$line" ] || ok=0                                    # it didn't get to the end
  [ "$fails" -eq 0 ] || ok=0                                # a check failed
  grep -qE '^(MAIN|TEST|panel:|settings:) ' "$2" && ok=0    # an uncaught error in the app or the test
  [ -n "$line" ] && [ "${line%%/*}" != "$(echo "$line" | sed -E 's#^[0-9]+/([0-9]+).*#\1#')" ] && ok=0
  ran=$((ran + 1))
  if [ "$ok" = 1 ]; then
    summary+=("ok    $1  $line")
  else
    failed=$((failed + 1)); summary+=("FAIL  $1  ${line:-no result} (log: $2)")
  fi
  echo "${summary[-1]}"
  [ "$ok" = 1 ] || grep -E '(^|\] )FAIL |^(MAIN|TEST|panel:|settings:) ' "$2" | head -5 | sed 's/^/        /'
}
node_test() { local name=$1; shift; node "tests/unit/$name.js" >"$LOG/$name.log" 2>&1; result "$name" "$LOG/$name.log"; }
app_test() { # name file platform [VAR=value ...]
  local name=$1 file=$2 platform=$3; shift 3
  local ud="$TMP/userdata/$name"
  rm -rf "$ud"
  env TP_PLATFORM="$platform" TP_USERDATA="$ud" "$@" timeout 400 xvfb-run -a -s "-screen 0 1600x1000x24" \
    "$ELECTRON" --no-sandbox "tests/app/$file.js" >"$LOG/$name.log" 2>&1
  result "$name" "$LOG/$name.log"
}

for group in $GROUPS_TO_RUN; do
  case $group in
    unit)
      for t in when-test doubletap-test win-source-test appnap-test; do node_test "$t"; done ;;
    app)
      need_electron
      future=$(python3 tests/app/seed.py regress "$TMP/userdata/regress")
      env TP_USERDATA="$TMP/userdata/regress" TP_FUTURE="$future" timeout 400 xvfb-run -a "$ELECTRON" --no-sandbox tests/app/regress-app.js >"$LOG/regress.log" 2>&1
      result regress "$LOG/regress.log"
      python3 tests/app/seed.py win "$TMP/userdata/win-app" >/dev/null
      env TP_USERDATA="$TMP/userdata/win-app" timeout 400 xvfb-run -a "$ELECTRON" --no-sandbox tests/app/win-app.js >"$LOG/win-app.log" 2>&1
      result win-app "$LOG/win-app.log"
      for p in darwin win32; do
        app_test "calendar-$p" cal-app $p
        app_test "toggle-$p" toggle-app $p
        app_test "double-tap-watch-$p" mac-watch-app $p
        app_test "reorder-$p" reorder-app $p
        app_test "tour-$p" tour-app $p
        app_test "move-panel-$p" position-app $p
      done
      for m in blocked existing skip; do app_test "tour-mac-$m" tour-app darwin TP_MODE=$m; done
      app_test tour-store tour-app win32 TP_MODE=store
      app_test double-tap doubletap-app darwin
      app_test double-tap-blocked doubletap-app darwin TP_MODE=blocked
      app_test store store-app win32 ;;
    release)
      [ "$(id -u)" = 0 ] || { echo "the release tests need root (they put stand-ins at /usr/bin/hdiutil etc.)" >&2; exit 2; }
      need_electron
      app_test updater updater-app linux
      for p in darwin win32; do
        app_test "update-popup-$p" prompt-app $p
        app_test "update-popup-more-$p" prompt-extra-app $p
      done ;;
    *) echo "unknown group: $group" >&2; exit 2 ;;
  esac
done

echo
echo "$((ran - failed))/$ran suites passed"
[ "$failed" = 0 ]
