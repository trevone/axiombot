#!/usr/bin/env bash

set -Eeuo pipefail

SERVICE="${SERVICE:-axiombot.service}"
BASE_URL="${BASE_URL:-https://bossbot.online/axiombot}"
WEB_DIR="${WEB_DIR:-/var/www/axiombot}"
HEALTH_FILE="${HEALTH_FILE:-$WEB_DIR/health.json}"
STATE_FILE="${STATE_FILE:-$WEB_DIR/state.json}"
MAX_HEALTH_AGE_MS="${MAX_HEALTH_AGE_MS:-180000}"

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

for command_name in curl jq systemctl; do
  need "$command_name"
done

systemctl is-active --quiet "$SERVICE" || fail "$SERVICE is not active"

[[ -s "$STATE_FILE" ]] || fail "State file is missing or empty: $STATE_FILE"
[[ -s "$HEALTH_FILE" ]] || fail "Health file is missing or empty: $HEALTH_FILE"

jq -e '.lastScan and (.openPositions | type == "object") and (.closedPositions | type == "array")' \
  "$STATE_FILE" >/dev/null || fail "State JSON shape is invalid"

jq -e '.ok == true and .status == "sane"' "$HEALTH_FILE" >/dev/null ||
  fail "Health check is not sane: $(jq -c '{ok,status,issues,warnings}' "$HEALTH_FILE")"

jq -e --argjson max_age "$MAX_HEALTH_AGE_MS" '
  (.scanner.scanAgeMs // 999999999) < $max_age and
  (.scanner.profilesScanned // 0) > 0 and
  (.scanner.pairsFound // 0) > 0 and
  (.scanner.candidates // 0) > 0
' "$HEALTH_FILE" >/dev/null || fail "Health scanner metrics are stale or empty"

for path in "/" "/api/health.json" "/api/state.json"; do
  status_code="$(curl -k -sS -o /dev/null -w '%{http_code}' --max-time 10 "${BASE_URL}${path}")"
  [[ "$status_code" == "401" ]] || fail "Expected 401 for unauthenticated ${BASE_URL}${path}, got $status_code"
done

printf 'Smoke test passed for %s\n' "$SERVICE"
jq '{ok,status,scanner,trades}' "$HEALTH_FILE"
