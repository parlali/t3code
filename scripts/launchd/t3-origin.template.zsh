#!/bin/zsh

# Public-safe template for running this fork as a user launchd service on macOS.
# Copy this file outside the repo, fill in the environment values for the host,
# then install it with `t3-origin install`.

set -euo pipefail

repo="${T3_ORIGIN_REPO:?Set T3_ORIGIN_REPO to the absolute path of this repository}"
label="${T3_ORIGIN_LAUNCHD_LABEL:-local.t3code.origin}"
web_port="${T3_WEB_PORT:-5733}"
host="${T3CODE_HOST:-127.0.0.1}"
t3_home="${T3CODE_HOME:-${HOME}/.t3}"
log_dir="${T3_ORIGIN_LOG_DIR:-${t3_home}/logs}"
run_dir="${T3_ORIGIN_RUN_DIR:-${t3_home}/origin}"
plist_dir="${HOME}/Library/LaunchAgents"
plist_file="${plist_dir}/${label}.plist"
uid="$(id -u)"
domain="gui/${uid}"

usage() {
  cat <<EOF
Usage:
  t3-origin install   Write and bootstrap the launchd service.
  t3-origin start     Bootstrap the existing plist.
  t3-origin stop      Boot out the service.
  t3-origin restart   Stop, rebuild, and start the service.
  t3-origin status    Show launchd status.
  t3-origin logs      Tail service logs.

Required environment:
  T3_ORIGIN_REPO      Absolute path to this repository.

Common environment:
  T3_WEB_PORT         Web port exposed by the production server. Default: 5733
  T3CODE_HOST         Bind host. Default: 127.0.0.1
  T3CODE_HOME         T3 data directory. Default: ~/.t3
  T3_ORIGIN_LAUNCHD_LABEL
                     User launchd label. Default: local.t3code.origin
EOF
}

xml_escape() {
  local value="$1"
  value="${value//&/&amp;}"
  value="${value//</&lt;}"
  value="${value//>/&gt;}"
  value="${value//\"/&quot;}"
  value="${value//\'/&apos;}"
  print -r -- "$value"
}

plist_string() {
  local key="$1"
  local value="$2"
  print -r -- "    <key>${key}</key>"
  print -r -- "    <string>$(xml_escape "$value")</string>"
}

build() {
  cd "$repo"
  bun run build:contracts
  (
    cd apps/web
    env -u VITE_DEV_SERVER_URL -u VITE_HTTP_URL -u VITE_WS_URL bun run build
  )
  (
    cd apps/server
    bun run build
  )
}

write_plist() {
  mkdir -p "$plist_dir" "$log_dir" "$run_dir"

  {
    print -r -- '<?xml version="1.0" encoding="UTF-8"?>'
    print -r -- '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    print -r -- '<plist version="1.0">'
    print -r -- '<dict>'
    plist_string "Label" "$label"
    print -r -- '  <key>ProgramArguments</key>'
    print -r -- '  <array>'
    print -r -- '    <string>/usr/bin/env</string>'
    print -r -- '    <string>node</string>'
    print -r -- "    <string>$(xml_escape "${repo}/apps/server/dist/bin.mjs")</string>"
    print -r -- '  </array>'
    plist_string "WorkingDirectory" "$repo"
    print -r -- '  <key>RunAtLoad</key>'
    print -r -- '  <true/>'
    print -r -- '  <key>KeepAlive</key>'
    print -r -- '  <true/>'
    plist_string "StandardOutPath" "${log_dir}/t3-origin.log"
    plist_string "StandardErrorPath" "${log_dir}/t3-origin.log"
    print -r -- '  <key>EnvironmentVariables</key>'
    print -r -- '  <dict>'
    plist_string "HOME" "$HOME"
    plist_string "PATH" "${PATH:-/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin}"
    plist_string "T3CODE_MODE" "web"
    plist_string "T3CODE_HOST" "$host"
    plist_string "T3CODE_PORT" "$web_port"
    plist_string "T3CODE_HOME" "$t3_home"
    plist_string "T3CODE_NO_BROWSER" "1"
    plist_string "T3CODE_UNSAFE_NO_AUTH" "${T3CODE_UNSAFE_NO_AUTH:-false}"
    print -r -- '  </dict>'
    print -r -- '</dict>'
    print -r -- '</plist>'
  } > "$plist_file"
}

stop() {
  launchctl bootout "${domain}/${label}" >/dev/null 2>&1 ||
    launchctl bootout "$domain" "$plist_file" >/dev/null 2>&1 ||
    true
}

start() {
  launchctl bootstrap "$domain" "$plist_file"
}

case "${1:-}" in
  install)
    build
    write_plist
    stop
    start
    ;;
  start)
    start
    ;;
  stop)
    stop
    ;;
  restart)
    build
    stop
    start
    ;;
  status)
    launchctl print "${domain}/${label}"
    ;;
  logs)
    tail -n 120 -f "${log_dir}/t3-origin.log"
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
