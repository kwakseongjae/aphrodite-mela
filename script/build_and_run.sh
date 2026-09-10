#!/usr/bin/env bash
set -euo pipefail
MODE="${1:-run}"
case "$MODE" in run|--debug|--logs|--telemetry|--verify) ;; *) echo "Usage: $0 [--debug|--logs|--telemetry|--verify]" >&2; exit 2;; esac
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_DIR"
APP_BUNDLE="$PROJECT_DIR/src-tauri/target/release/bundle/macos/Aphrodite.app"
APP_BINARY="$APP_BUNDLE/Contents/MacOS/aphrodite-mela"
# Only terminate this workspace's release executable, not unrelated Tauri projects.
while read -r app_pid; do
  if [[ "$(ps -p "$app_pid" -o comm=)" == "$APP_BINARY" ]]; then kill "$app_pid"; fi
done < <(pgrep -x aphrodite-mela || true)
npm run desktop:build
if [[ "$MODE" == --debug ]]; then exec lldb -- "$APP_BINARY"; fi
/usr/bin/open -n "$APP_BUNDLE"
case "$MODE" in
  --verify) sleep 2; pgrep -x aphrodite-mela >/dev/null ;;
  --logs) /usr/bin/log stream --info --style compact --predicate 'process == "aphrodite-mela"' ;;
  --telemetry) /usr/bin/log stream --info --style compact --predicate 'subsystem == "studio.aphrodite.mela"' ;;
esac
