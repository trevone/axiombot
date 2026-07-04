import "dotenv/config";

const DEFAULT_API_BASE_URL = "https://lar.axiom.ai";
const DEFAULT_DEXSCREENER_BASE_URL = "https://api.dexscreener.com";
const DEFAULT_POLL_INTERVAL_MS = 10_000;
const DEFAULT_POLL_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_SCAN_INTERVAL_MS = 30_000;

function parsePositiveInt(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveFloat(value, fallback) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseChainList(value) {
  return (value || "solana")
    .split(",")
    .map((chain) => chain.trim())
    .filter(Boolean);
}

export function loadConfig() {
  return {
    axiomApiKey: process.env.AXIOM_API_KEY || process.env.AXIOM_API_TOKEN,
    automationName: process.env.AXIOM_AUTOMATION_NAME,
    apiBaseUrl: process.env.AXIOM_API_BASE_URL || DEFAULT_API_BASE_URL,
    inputDataJson: process.env.AXIOM_INPUT_DATA_JSON,
    pollIntervalMs: parsePositiveInt(process.env.AXIOM_POLL_INTERVAL_MS, DEFAULT_POLL_INTERVAL_MS),
    pollTimeoutMs: parsePositiveInt(process.env.AXIOM_POLL_TIMEOUT_MS, DEFAULT_POLL_TIMEOUT_MS),
    dexScreenerBaseUrl: process.env.DEXSCREENER_BASE_URL || DEFAULT_DEXSCREENER_BASE_URL,
    scannerChains: parseChainList(process.env.SCANNER_CHAINS),
    scanIntervalMs: parsePositiveInt(process.env.SCAN_INTERVAL_MS, DEFAULT_SCAN_INTERVAL_MS),
    maxTokensPerScan: parsePositiveInt(process.env.MAX_TOKENS_PER_SCAN, 30),
    minLiquidityUsd: parsePositiveFloat(process.env.MIN_LIQUIDITY_USD, 10_000),
    minVolumeM5Usd: parsePositiveFloat(process.env.MIN_VOLUME_M5_USD, 500),
    minBuysM5: parsePositiveInt(process.env.MIN_BUYS_M5, 5),
    minPriceChangeM5Pct: parsePositiveFloat(process.env.MIN_PRICE_CHANGE_M5_PCT, 5),
    minScoreToEnter: parsePositiveInt(process.env.MIN_SCORE_TO_ENTER, 70),
    maxPairAgeMinutes: parsePositiveInt(process.env.MAX_PAIR_AGE_MINUTES, 180),
    paperTradeUsd: parsePositiveFloat(process.env.PAPER_TRADE_USD, 50),
    takeProfitPct: parsePositiveFloat(process.env.TAKE_PROFIT_PCT, 25),
    stopLossPct: parsePositiveFloat(process.env.STOP_LOSS_PCT, 12),
    stateFile: process.env.STATE_FILE || "data/state.json"
  };
}

export function assertBaseConfig(config) {
  if (!config.axiomApiKey) {
    throw new Error(
      "Missing AXIOM_API_KEY. Copy .env.example to .env and add your Axiom API key."
    );
  }

  try {
    new URL(config.apiBaseUrl);
  } catch {
    throw new Error(`AXIOM_API_BASE_URL must be a valid URL. Received: ${config.apiBaseUrl}`);
  }
}

export function assertScannerConfig(config) {
  try {
    new URL(config.dexScreenerBaseUrl);
  } catch {
    throw new Error(`DEXSCREENER_BASE_URL must be a valid URL. Received: ${config.dexScreenerBaseUrl}`);
  }

  if (config.scannerChains.length === 0) {
    throw new Error("SCANNER_CHAINS must include at least one chain, for example solana.");
  }
}

export function assertAutomationConfig(config) {
  if (!config.automationName) {
    throw new Error("Missing AXIOM_AUTOMATION_NAME. Add the exact automation name from Axiom Dashboard.");
  }
}

export function parseInputData(config) {
  if (!config.inputDataJson) {
    return undefined;
  }

  const data = JSON.parse(config.inputDataJson);

  if (!Array.isArray(data) || data.some((row) => !Array.isArray(row))) {
    throw new Error("AXIOM_INPUT_DATA_JSON must be a 2D array, for example [[\"url\"],[\"https://example.com\"]].");
  }

  return data;
}
