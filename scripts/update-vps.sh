#!/usr/bin/env bash

set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/axiombot}"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-axiombot.service}"
WEB_DIR="${WEB_DIR:-/var/www/axiombot}"

say() {
  printf '\n==> %s\n' "$*"
}

fail() {
  printf '\nERROR: %s\n' "$*" >&2
  exit 1
}

need() {
  command -v "$1" >/dev/null 2>&1 || fail "Missing required command: $1"
}

for command_name in git npm sudo; do
  need "$command_name"
done

[[ -d "$APP_DIR/.git" ]] || fail "Git checkout not found: $APP_DIR"
cd "$APP_DIR"

[[ -z "$(git status --porcelain --untracked-files=no)" ]] ||
  fail "Tracked files have local changes. Commit or discard them before deploying."

current_branch="$(git branch --show-current)"
[[ "$current_branch" == "$BRANCH" ]] ||
  fail "Expected branch $BRANCH, found ${current_branch:-detached HEAD}"

say "Fetching origin/$BRANCH"
git fetch origin "$BRANCH"

current_commit="$(git rev-parse HEAD)"
target_commit="$(git rev-parse "origin/$BRANCH")"

if [[ "$current_commit" == "$target_commit" ]]; then
  echo "Already current at $(git rev-parse --short HEAD)."
else
  git merge-base --is-ancestor "$current_commit" "$target_commit" ||
    fail "Update is not fast-forward. Resolve the branch manually."

  say "Updating to origin/$BRANCH"
  git pull --ff-only origin "$BRANCH"

  say "Installing locked dependencies"
  npm ci

  say "Running checks"
  npm run check
fi

say "Publishing HUD assets"
sudo mkdir -p "$WEB_DIR/public"
sudo cp -R public/. "$WEB_DIR/public/"
sudo chown -R www-data:www-data "$WEB_DIR/public"
sudo touch "$WEB_DIR/state.json" "$WEB_DIR/health.json"
sudo chown trevor:www-data "$WEB_DIR/state.json" "$WEB_DIR/health.json"
sudo chmod 664 "$WEB_DIR/state.json" "$WEB_DIR/health.json"

say "Updating Nginx HUD snippet"
sudo cp deploy/nginx-axiombot.conf /etc/nginx/snippets/axiombot.conf
sudo nginx -t
sudo systemctl reload nginx

say "Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

say "Service status"
systemctl --no-pager --full status "$SERVICE" | sed -n '1,18p'
