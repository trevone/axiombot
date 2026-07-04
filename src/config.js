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
    websocket: {
      provider: process.env.WS_PROVIDER || "helius",
      url: process.env.SOLANA_WS_URL,
      heliusApiKey: process.env.HELIUS_API_KEY,
      testNotifications: parsePositiveInt(process.env.WS_TEST_NOTIFICATIONS, 3),
      testTimeoutMs: parsePositiveInt(process.env.WS_TEST_TIMEOUT_MS, 30_000),
      pingIntervalMs: parsePositiveInt(process.env.WS_PING_INTERVAL_MS, 60_000)
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
      file: process.env.STATE_FILE || "data/state.json",
      healthFile: process.env.HEALTH_FILE || "data/health.json"
    },
    health: {
      staleScanMs: parsePositiveInt(process.env.HEALTH_STALE_SCAN_MS, 120_000),
      maxOpenPositions: parsePositiveInt(process.env.HEALTH_MAX_OPEN_POSITIONS, 20)
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

export function assertWebSocketConfig(config) {
  if (config.websocket.url) {
    try {
      new URL(config.websocket.url);
    } catch {
      throw new Error(`SOLANA_WS_URL is invalid: ${config.websocket.url}`);
    }

    return;
  }

  if (config.websocket.provider === "helius" && !config.websocket.heliusApiKey) {
    throw new Error("Missing HELIUS_API_KEY or SOLANA_WS_URL for WebSocket commands.");
  }
}

export function buildSolanaWebSocketUrl(config) {
  if (config.websocket.url) {
    return config.websocket.url;
  }

  if (config.websocket.provider === "helius") {
    const url = new URL("wss://mainnet.helius-rpc.com/");
    url.searchParams.set("api-key", config.websocket.heliusApiKey);
    return url.toString();
  }

  throw new Error(`Unsupported WS_PROVIDER: ${config.websocket.provider}`);
}
