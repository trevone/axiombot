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
npm.cmd run check      # syntax check
```

## HUD

The HUD is a static dashboard in `public/`. It expects Nginx to serve:

```text
/axiombot/             -> public/index.html
/axiombot/state.json   -> /var/www/axiombot/state.json
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
