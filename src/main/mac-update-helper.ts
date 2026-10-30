// Runs outside the app bundle, so replacing the bundle cannot remove this worker.
// All paths are positional arguments, never interpolated into shell source.
export const MAC_UPDATE_HELPER = `#!/bin/sh
set -u
[ "$#" -eq 7 ] || exit 64
target=$1
work=$2
old_pid=$3
token=$4
identity=$5
executable=$6
profile=$7
parent=$(/usr/bin/dirname "$target")
case "$target" in /*.app) ;; *) exit 64 ;; esac
case "$token" in ''|*[!a-f0-9-]*) exit 64 ;; esac
case "$token" in ????????-????-????-????-????????????) ;; *) exit 64 ;; esac
[ "$work" = "$parent/.stealth-reader-update-$token" ] || exit 64
case "$old_pid" in ''|*[!0-9]*) exit 64 ;; esac
[ "$old_pid" -gt 1 ] || exit 64
case "$executable" in ''|*/*|.*) exit 64 ;; esac
case "$profile" in /*) ;; *) exit 64 ;; esac
[ -d "$work" ] && [ ! -L "$work" ] || exit 64
next="$work/next.app"
previous="$work/previous.app"
failed="$work/failed.app"
[ -d "$next" ] && [ ! -L "$next" ] || exit 64
[ ! -e "$previous" ] && [ ! -L "$previous" ] || exit 64
[ ! -e "$failed" ] && [ ! -L "$failed" ] || exit 64
printf '%s' "$token" > "$work/helper-ready"

old_moved=0
new_installed=0
new_identity=''
rollback() {
  reason=$1
  # Terminate only the new instance recorded in this private transaction.
  if [ -f "$work/new.pid" ]; then
    new_pid=$(/bin/cat "$work/new.pid")
    case "$new_pid" in ''|*[!0-9]*) new_pid=0 ;; esac
    if [ "$new_pid" -gt 1 ] && [ "$new_pid" != "$old_pid" ]; then
      command=$(/bin/ps -p "$new_pid" -o command= 2>/dev/null || true)
      case "$command" in "$target/Contents/MacOS/$executable"|"$target/Contents/MacOS/$executable "*)
        /bin/kill -TERM "$new_pid" 2>/dev/null || true
        attempts=20
        while /bin/kill -0 "$new_pid" 2>/dev/null && [ "$attempts" -gt 0 ]; do
          /bin/sleep 0.2
          attempts=$((attempts - 1))
        done
        command=$(/bin/ps -p "$new_pid" -o command= 2>/dev/null || true)
        case "$command" in "$target/Contents/MacOS/$executable"|"$target/Contents/MacOS/$executable "*)
          /bin/kill -KILL "$new_pid" 2>/dev/null || true ;; esac
        ;; esac
    fi
  fi
  if [ "$new_installed" -eq 1 ]; then
    current=$(/usr/bin/stat -f '%d:%i' "$target" 2>/dev/null || true)
    # Never move another updater's or the user's replacement.
    if [ "$current" != "$new_identity" ] || [ -L "$target" ]; then
      printf 'failed:target-changed' > "$work/result"
      exit 1
    fi
    /bin/mv "$target" "$failed" || exit 1
  fi
  if [ "$old_moved" -eq 1 ]; then
    [ ! -e "$target" ] && [ ! -L "$target" ] || exit 1
    /bin/mv "$previous" "$target" || exit 1
  fi
  printf 'failed:%s' "$reason" > "$work/result"
  if [ "$old_moved" -eq 1 ]; then
    /usr/bin/open -n "$target" --args "--user-data-dir=$profile" "--stealth-update-failed=$token" || true
  fi
  exit 1
}

attempts=300
while /bin/kill -0 "$old_pid" 2>/dev/null; do
  [ "$attempts" -gt 0 ] || rollback old-process-still-running
  /bin/sleep 0.2
  attempts=$((attempts - 1))
done
[ -d "$target" ] && [ ! -L "$target" ] || rollback invalid-target
[ "$(/usr/bin/stat -f '%d:%i' "$target")" = "$identity" ] || rollback target-changed
/usr/bin/codesign --verify --deep --strict "$next" || rollback invalid-signature
/bin/mv "$target" "$previous" || rollback backup-failed
old_moved=1
/bin/mv "$next" "$target" || rollback replacement-failed
new_installed=1
new_identity=$(/usr/bin/stat -f '%d:%i' "$target")
/usr/bin/codesign --verify --deep --strict "$target" || rollback installed-signature-invalid
# LaunchServices remains in control: do not remove quarantine or bypass Gatekeeper.
/usr/bin/open -n "$target" --stdout "$work/new.stdout.log" --stderr "$work/new.stderr.log" --args "--user-data-dir=$profile" "--stealth-update-token=$token" || rollback launch-failed
startup_attempts=225
while [ "$startup_attempts" -gt 0 ]; do
  if [ -f "$work/app-ready" ] && [ "$(/bin/cat "$work/app-ready")" = "$token" ]; then
    printf 'installed' > "$work/result"
    # Only the precise previous bundle in the validated private workspace is cleaned.
    /bin/rm -rf -- "$previous" || true
    exit 0
  fi
  /bin/sleep 0.2
  startup_attempts=$((startup_attempts - 1))
done
rollback startup-not-confirmed
`
