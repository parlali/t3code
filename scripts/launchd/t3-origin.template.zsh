#!/bin/zsh

# Public-safe template for running this fork as a user launchd service on macOS.
# Copy this file outside the repo, fill in the environment values for the host,
# then install it with `t3-origin install`.

set -euo pipefail

script_path="${0:A}"
repo="${T3_ORIGIN_REPO:?Set T3_ORIGIN_REPO to the absolute path of this repository}"
label="${T3_ORIGIN_LAUNCHD_LABEL:-local.t3code.origin}"
web_port="${T3_WEB_PORT:-5733}"
redirect_port="${T3_REDIRECT_PORT:-5734}"
host="${T3CODE_HOST:-127.0.0.1}"
t3_home="${T3CODE_HOME:-${HOME}/.t3}"
log_dir="${T3_ORIGIN_LOG_DIR:-${t3_home}/logs}"
run_dir="${T3_ORIGIN_RUN_DIR:-${t3_home}/origin}"
pid_file="${run_dir}/pid"
children_file="${run_dir}/children"
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
  t3-origin expose    Route Tailnet HTTP through an HTTPS redirect and HTTPS to T3.
  t3-origin expose-status
                    Show Tailscale Serve status.

Required environment:
  T3_ORIGIN_REPO      Absolute path to this repository.

Common environment:
  T3_WEB_PORT         Web port exposed by the production server. Default: 5733
  T3_REDIRECT_PORT    Local HTTP-to-HTTPS redirect shim port. Default: 5734
  T3CODE_HOST         Bind host. Default: 127.0.0.1
  T3CODE_HOME         T3 data directory. Default: ~/.t3
  T3_TAILSCALE_HTTPS_HOST
                     Optional MagicDNS host for redirects. Defaults to Tailscale Self.DNSName.
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

tailscale_magic_dns_name() {
  command -v tailscale >/dev/null 2>&1 || return 1
  command -v node >/dev/null 2>&1 || return 1
  tailscale status --json 2>/dev/null | node -e '
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  input += chunk;
});
process.stdin.on("end", () => {
  try {
    const parsed = JSON.parse(input);
    const dnsName = parsed?.Self?.DNSName;
    if (typeof dnsName === "string" && dnsName.trim()) {
      process.stdout.write(dnsName.trim().replace(/\.$/u, ""));
    }
  } catch {}
});
'
}

tailscale_https_url() {
  local dns_name="${T3_TAILSCALE_HTTPS_HOST:-}"
  if [[ -z "$dns_name" ]]; then
    dns_name="$(tailscale_magic_dns_name 2>/dev/null || true)"
  fi
  [[ -n "$dns_name" ]] || return 1
  print -r -- "https://${dns_name}"
}

pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null
}

descendant_pids() {
  local parent="$1"
  local child
  pgrep -P "$parent" 2>/dev/null | while IFS= read -r child; do
    descendant_pids "$child"
    print -r -- "$child"
  done
}

kill_process_tree() {
  local root="$1"
  local signal="${2:-TERM}"
  local descendants=("${(@f)$(descendant_pids "$root")}")
  local target_pid

  for target_pid in "${descendants[@]}"; do
    if [[ "$target_pid" == <-> && "$target_pid" != "$$" ]] && pid_alive "$target_pid"; then
      kill "-${signal}" "$target_pid" 2>/dev/null || true
    fi
  done

  if [[ "$root" == <-> && "$root" != "$$" ]] && pid_alive "$root"; then
    kill "-${signal}" "$root" 2>/dev/null || true
  fi
}

pids=()

write_children_file() {
  : > "$children_file"
  local child_pid
  for child_pid in "$@"; do
    print -r -- "$child_pid" >> "$children_file"
  done
}

cleanup_service() {
  local child_pid
  for child_pid in "${pids[@]}"; do
    if pid_alive "$child_pid"; then
      kill_process_tree "$child_pid" TERM
    fi
  done
  rm -f "$pid_file" "$children_file"
}

run_service() {
  mkdir -p "$log_dir" "$run_dir"
  print -r -- "$$" > "$pid_file"
  trap 'cleanup_service; exit 130' INT
  trap 'cleanup_service; exit 143' TERM
  trap 'cleanup_service' EXIT

  cd "$repo"

  (
    exec env -u VITE_DEV_SERVER_URL -u VITE_HTTP_URL -u VITE_WS_URL \
      T3CODE_MODE=web \
      T3CODE_HOST="$host" \
      T3CODE_PORT="$web_port" \
      T3CODE_HOME="$t3_home" \
      T3CODE_NO_BROWSER=1 \
      T3CODE_UNSAFE_NO_AUTH="${T3CODE_UNSAFE_NO_AUTH:-false}" \
      node apps/server/dist/bin.mjs
  ) &
  pids+=("$!")
  write_children_file "${pids[@]}"

  local redirect_target="$(tailscale_https_url 2>/dev/null || true)"
  if [[ -n "$redirect_target" ]]; then
    (
      T3_REDIRECT_PORT="$redirect_port" \
        T3_REDIRECT_TARGET="$redirect_target" \
        exec node -e '
const http = require("node:http");
const port = Number(process.env.T3_REDIRECT_PORT || "5734");
const target = new URL(process.env.T3_REDIRECT_TARGET);
http
  .createServer((request, response) => {
    const location = new URL(request.url || "/", target);
    response.writeHead(308, {
      "cache-control": "no-store",
      "content-length": "0",
      "location": location.toString(),
    });
    response.end();
  })
  .listen(port, "127.0.0.1");
'
    ) &
    pids+=("$!")
    write_children_file "${pids[@]}"
  else
    print -r -- "warn: could not resolve Tailscale MagicDNS name; HTTP redirect shim not started" >&2
  fi

  local child_pid exit_status
  while true; do
    for child_pid in "${pids[@]}"; do
      if ! pid_alive "$child_pid"; then
        wait "$child_pid"
        exit_status="$?"
        exit "$exit_status"
      fi
    done
    sleep 1
  done
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
    print -r -- "    <string>$(xml_escape "$script_path")</string>"
    print -r -- '    <string>__run</string>'
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
    plist_string "T3_ORIGIN_REPO" "$repo"
    plist_string "T3CODE_HOST" "$host"
    plist_string "T3CODE_HOME" "$t3_home"
    plist_string "T3_WEB_PORT" "$web_port"
    plist_string "T3_REDIRECT_PORT" "$redirect_port"
    plist_string "T3CODE_NO_BROWSER" "1"
    plist_string "T3CODE_UNSAFE_NO_AUTH" "${T3CODE_UNSAFE_NO_AUTH:-false}"
    if [[ -n "${T3_TAILSCALE_HTTPS_HOST:-}" ]]; then
      plist_string "T3_TAILSCALE_HTTPS_HOST" "$T3_TAILSCALE_HTTPS_HOST"
    fi
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

configure_tailscale_serve() {
  command -v tailscale >/dev/null 2>&1 || {
    print -r -- "tailscale is not on PATH" >&2
    exit 1
  }
  tailscale serve --http=80 --bg --yes "localhost:${redirect_port}"
  tailscale serve --https=443 --bg --yes "localhost:${web_port}"
}

case "${1:-}" in
  __run)
    run_service
    ;;
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
  expose)
    configure_tailscale_serve
    ;;
  expose-status)
    tailscale serve status
    ;;
  -h|--help|help|"")
    usage
    ;;
  *)
    usage >&2
    exit 1
    ;;
esac
