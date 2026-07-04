# AxiomBot

A Solana new-token scanner with paper trading. The first checkpoint is simple on purpose: one market data source, one chain, momentum scoring, and simulated TP/SL before any live wallet work.

There is no Axiom.trade API dependency in this version. Axiom.trade can still be useful as a manual trading dashboard, but this bot does its own scanning.

## How It Works

```text
DexScreener latest token profiles
  -> fetch pair/liquidity data
  -> score momentum
  -> apply risk filters
  -> open paper position
  -> monitor take-profit / stop-loss
  -> save state locally
```

The bot persists state in `data/state.json`, which is ignored by git.

## Setup

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run scan
```

## Commands

```powershell
npm.cmd run scan       # run one scan
npm.cmd run daemon     # run forever for VPS/pm2/systemd
npm.cmd run positions  # inspect paper positions
npm.cmd run ws:test    # verify Solana WebSocket connectivity
npm.cmd run check      # syntax check
```

## Helius WebSockets

Create a Helius API key, then set:

```dotenv
WS_PROVIDER=helius
HELIUS_API_KEY=your-key
SOLANA_WS_URL=
WS_TEST_NOTIFICATIONS=3
WS_TEST_TIMEOUT_MS=30000
WS_PING_INTERVAL_MS=60000
```

Run:

```bash
npm run ws:test
```

The test uses standard Solana `slotSubscribe`, which Helius supports on all plans. It exits successfully after receiving live slot notifications.

## HUD

The HUD is a static dashboard in `public/`. It expects Nginx to serve:

```text
/axiombot/             -> public/index.html
/axiombot/state.json   -> /var/www/axiombot/state.json
/axiombot/api/state.json
/axiombot/api/health.json
```

An example Nginx location snippet is included at `deploy/nginx-axiombot.conf`.

On the VPS, include the snippet inside the existing `bossbot.online` server block:

```bash
sudo cp deploy/nginx-axiombot.conf /etc/nginx/snippets/axiombot.conf
# Add this inside the HTTPS server block:
# include /etc/nginx/snippets/axiombot.conf;
sudo nginx -t
sudo systemctl reload nginx
```

Set this in the VPS `.env` so the scanner writes state where Nginx can read it:

```dotenv
STATE_FILE=/var/www/axiombot/state.json
HEALTH_FILE=/var/www/axiombot/health.json
```

## Read API

The Nginx HUD exposes authenticated JSON endpoints:

```bash
curl -u USER:PASS https://bossbot.online/axiombot/api/health.json
curl -u USER:PASS https://bossbot.online/axiombot/api/state.json
```

`health.json` is the quick sanity check. It returns `ok: true` and `status: "sane"` when scans are fresh, candidate data is present, trades are paper-only, and open positions pass basic TP/SL/price checks.

## Deployment Checks

The VPS update script runs `scripts/smoke-vps.sh` after restart. It fails the deployment if:

- `axiombot.service` is not active.
- `state.json` or `health.json` is missing or malformed.
- `health.json` is not `ok`.
- scanner metrics are stale or empty.
- HUD/API routes are not protected by basic auth.

Run it manually on the VPS with:

```bash
cd ~/axiombot
bash scripts/smoke-vps.sh
```

The HUD auto-refreshes every 15 seconds and displays latest candidates, open paper trades, and recently closed paper trades.

## Config

Edit `.env`:

```dotenv
DEXSCREENER_BASE_URL=https://api.dexscreener.com
CHAINS=solana
SCAN_INTERVAL_MS=30000
MAX_TOKENS_PER_SCAN=30

MIN_LIQUIDITY_USD=10000
MIN_VOLUME_M5_USD=500
MIN_BUYS_M5=5
MIN_PRICE_CHANGE_M5_PCT=5
MIN_SCORE_TO_ENTER=70
MAX_PAIR_AGE_MINUTES=180
ALLOWED_DEXES=pumpswap,raydium,meteora

PAPER_TRADE_USD=50
TAKE_PROFIT_PCT=25
STOP_LOSS_PCT=12
STATE_FILE=data/state.json
HEALTH_FILE=data/health.json
HEALTH_STALE_SCAN_MS=120000
HEALTH_MAX_OPEN_POSITIONS=20
```

## Project Shape

```text
src/
  sources/dexscreener.js
  strategy/momentum.js
  risk/filters.js
  trading/paper.js
  state/store.js
  scanner.js
  cli.js
public/
  index.html
  styles.css
  app.js
deploy/
  nginx-axiombot.conf
scripts/
  update-vps.sh
  smoke-vps.sh
```

## VPS Start

On Ubuntu:

```bash
git clone <repo-url>
cd axiombot
npm install --omit=dev
cp .env.example .env
npm run daemon
```

Run it under `pm2` or `systemd` once the config looks right.

## Roadmap

1. Tune paper filters using real scan output.
2. Add alerts for new candidates and TP/SL closes.
3. Add rug/liquidity/safety checks.
4. Add Jupiter execution behind an explicit live-mode gate.
5. Test with tiny size before scaling anything.

This is trading infrastructure, not financial advice. New-token markets are extremely adversarial; assume most candidates are bad until proven otherwise.
