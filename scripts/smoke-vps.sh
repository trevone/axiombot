#!/usr/bin/env bash
set -Eeuo pipefail

SERVICE="${SERVICE:-axiombot.service}"
API="${API:-http://127.0.0.1:8795/api/status}"
MAX_SCAN_AGE_MS="${MAX_SCAN_AGE_MS:-120000}"

fail() {
  printf 'ERROR: %s\n' "$*" >&2
  exit 1
}

command -v curl >/dev/null || fail "missing curl"
command -v jq >/dev/null || fail "missing jq"
systemctl is-active --quiet "$SERVICE" || fail "$SERVICE is not active"

body="$(curl -fsS --max-time 10 "$API")"
scan_at="$(jq -r '.state.lastScan.at // empty' <<<"$body")"
[[ -n "$scan_at" ]] || fail "missing last scan"

scan_ms="$(date -d "$scan_at" +%s%3N)"
now_ms="$(date +%s%3N)"
age_ms="$((now_ms - scan_ms))"
[[ "$age_ms" -lt "$MAX_SCAN_AGE_MS" ]] || fail "stale scan: ${age_ms}ms"

jq -e '.state.open | type == "object"' <<<"$body" >/dev/null || fail "bad open shape"
jq -e '.state.closed | type == "array"' <<<"$body" >/dev/null || fail "bad closed shape"
jq -e '.state.decisions | type == "array"' <<<"$body" >/dev/null || fail "bad decisions shape"

printf 'Smoke passed: scan_age_ms=%s open=%s closed=%s decisions=%s\n' \
  "$age_ms" \
  "$(jq '.state.open | length' <<<"$body")" \
  "$(jq '.state.closed | length' <<<"$body")" \
  "$(jq '.state.decisions | length' <<<"$body")"
