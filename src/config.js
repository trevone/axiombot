import "dotenv/config";

function parsePositiveInt(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(value, fallback) {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseList(value, fallback) {
  return (value || fallback)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig() {
  return {
    source: {
      dexScreenerBaseUrl: process.env.DEXSCREENER_BASE_URL || "https://api.dexscreener.com",
      chains: parseList(process.env.CHAINS, "solana"),
      maxTokensPerScan: parsePositiveInt(process.env.MAX_TOKENS_PER_SCAN, 30)
    },
    scanner: {
      intervalMs: parsePositiveInt(process.env.SCAN_INTERVAL_MS, 30_000)
    },
    strategy: {
      minLiquidityUsd: parsePositiveFloat(process.env.MIN_LIQUIDITY_USD, 10_000),
      minVolumeM5Usd: parsePositiveFloat(process.env.MIN_VOLUME_M5_USD, 500),
      minBuysM5: parsePositiveInt(process.env.MIN_BUYS_M5, 5),
      minPriceChangeM5Pct: parsePositiveFloat(process.env.MIN_PRICE_CHANGE_M5_PCT, 5),
      minScoreToEnter: parsePositiveInt(process.env.MIN_SCORE_TO_ENTER, 70),
      maxPairAgeMinutes: parsePositiveInt(process.env.MAX_PAIR_AGE_MINUTES, 180),
      allowedDexes: parseList(process.env.ALLOWED_DEXES, "pumpswap,raydium,meteora")
    },
    paper: {
      tradeSizeUsd: parsePositiveFloat(process.env.PAPER_TRADE_USD, 50),
      takeProfitPct: parsePositiveFloat(process.env.TAKE_PROFIT_PCT, 25),
      stopLossPct: parsePositiveFloat(process.env.STOP_LOSS_PCT, 12)
    },
    state: {
      file: process.env.STATE_FILE || "data/state.json"
    }
  };
}

export function assertConfig(config) {
  try {
    new URL(config.source.dexScreenerBaseUrl);
  } catch {
    throw new Error(`DEXSCREENER_BASE_URL is invalid: ${config.source.dexScreenerBaseUrl}`);
  }

  if (config.source.chains.length === 0) {
    throw new Error("CHAINS must include at least one chain, for example solana.");
  }
}
