# Axiom Token Bot

Checkpoint one: scan for new tokens from one reliable source, score possible pumps, and manage paper entries with take-profit and stop-loss rules.

The scanner starts with DexScreener because its public API exposes latest token profiles plus pair data for liquidity, volume, txns, price changes, and pair age. Axiom API support stays in the project for triggering saved Axiom automations when we need browser/no-code workflows.

## Current Mode

This project is paper-trading only. It does not hold wallet keys and cannot place live orders yet.

The loop:

1. Fetch latest DexScreener token profiles.
2. Keep configured chains, default `solana`.
3. Enrich tokens with pair data.
4. Score pump potential using liquidity, 5m volume, 5m buys, buy pressure, 5m price change, and pair age.
5. Open a paper position when score and filters pass.
6. Close paper positions on configured TP/SL.
7. Persist seen tokens and positions in `data/state.json`.

## Setup

```powershell
npm.cmd install
Copy-Item .env.example .env
```

The scanner can run without an Axiom key. Add `AXIOM_API_KEY` later when you want to trigger saved Axiom automations.

## Scanner Commands

```powershell
npm.cmd run scan
npm.cmd run daemon
npm.cmd run positions
npm.cmd run check
```

`scan` runs once. `daemon` loops forever, which is the command to run under `systemd` or `pm2` on an Ubuntu VPS.

## Scanner Config

Edit `.env`:

```dotenv
DEXSCREENER_BASE_URL=https://api.dexscreener.com
SCANNER_CHAINS=solana
SCAN_INTERVAL_MS=30000
MAX_TOKENS_PER_SCAN=30
MIN_LIQUIDITY_USD=10000
MIN_VOLUME_M5_USD=500
MIN_BUYS_M5=5
MIN_PRICE_CHANGE_M5_PCT=5
MIN_SCORE_TO_ENTER=70
MAX_PAIR_AGE_MINUTES=180
PAPER_TRADE_USD=50
TAKE_PROFIT_PCT=25
STOP_LOSS_PCT=12
STATE_FILE=data/state.json
```

Start conservatively, then loosen filters after looking at real scan output. New-token trading is noisy and adversarial; most “pumping” tokens are not worth buying.

## Axiom API Commands

```powershell
npm.cmd run axiom:list
npm.cmd run axiom:trigger
npm.cmd run axiom:status
npm.cmd run axiom:run
```

Axiom config:

```dotenv
AXIOM_API_KEY=your-token
AXIOM_AUTOMATION_NAME=My First Automation
AXIOM_API_BASE_URL=https://lar.axiom.ai
AXIOM_INPUT_DATA_JSON=[["url"],["https://example.com/product/1"]]
AXIOM_POLL_INTERVAL_MS=10000
AXIOM_POLL_TIMEOUT_MS=600000
```

`AXIOM_INPUT_DATA_JSON` is optional. When present, it must be a 2D array where the first row is usually the header row.

## VPS Notes

On Ubuntu:

```bash
git clone <repo-url>
cd axiombot
npm install --omit=dev
cp .env.example .env
npm run daemon
```

For production, run `npm run daemon` with `pm2` or a `systemd` service so it restarts after crashes or reboots.

## Next Checkpoints

1. Tune filters against real scan output.
2. Add alerts for candidates and TP/SL events.
3. Add a real trade executor behind `TRADING_MODE=live`.
4. Add wallet, slippage, max-loss, blacklist, and rug/liquidity checks before any live buys.
