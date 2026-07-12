#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-$HOME/axiombot}"
BRANCH="${BRANCH:-main}"
SERVICE="${SERVICE:-axiombot.service}"
WEB_DIR="${WEB_DIR:-/var/www/axiombot}"

cd "$APP_DIR"
git fetch origin "$BRANCH"
git pull --ff-only origin "$BRANCH"
npm ci
npm run check
npm test

sudo mkdir -p "$WEB_DIR/public"
sudo cp -R public/. "$WEB_DIR/public/"
sudo chown -R www-data:www-data "$WEB_DIR/public"
sudo cp deploy/nginx-axiombot.conf /etc/nginx/snippets/axiombot.conf
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl restart "$SERVICE"
sleep 35
bash scripts/smoke-vps.sh
