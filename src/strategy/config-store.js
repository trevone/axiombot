import fs from "node:fs";
import path from "node:path";
import "dotenv/config";

function envNumber(name, fallback) {
  const number = Number(process.env[name]);
  return Number.isFinite(number) ? number : fallback;
}

function envString(name, fallback) {
  const value = process.env[name];
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function envBoolean(name, fallback) {
  const value = process.env[name];
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export const DEFAULT_STRATEGY_CONFIG = {
  MAX_OPEN_POSITIONS: envNumber("MAX_OPEN_POSITIONS", 3),
  MAX_ENTRIES_PER_PAIR: envNumber("MAX_ENTRIES_PER_PAIR", 1),
  COOLDOWN_AFTER_CLOSE_MINUTES: envNumber("COOLDOWN_AFTER_CLOSE_MINUTES", 45),

  MIN_LIQUIDITY_USD: envNumber("MIN_LIQUIDITY_USD", 10_000),
  MIN_VOLUME_M5_USD: envNumber("MIN_VOLUME_M5_USD", 500),
  MIN_BUYS_M5: envNumber("MIN_BUYS_M5", 5),
  MIN_BUY_SELL_RATIO: envNumber("MIN_BUY_SELL_RATIO", 1.2),
  MIN_PRICE_CHANGE_M5_PCT: envNumber("MIN_PRICE_CHANGE_M5_PCT", 5),
  MAX_PRICE_CHANGE_M5_PCT: envNumber("MAX_PRICE_CHANGE_M5_PCT", 60),
  MIN_SCORE_TO_ENTER: envNumber("MIN_SCORE_TO_ENTER", 70),
  MAX_PAIR_AGE_MINUTES: envNumber("MAX_PAIR_AGE_MINUTES", 180),
  REQUIRE_LIQUIDITY: envBoolean("REQUIRE_LIQUIDITY", true),
  ALLOWED_DEXES: envString("ALLOWED_DEXES", "pumpswap,raydium,meteora"),

  PAPER_STARTING_BALANCE_USD: envNumber("PAPER_STARTING_BALANCE_USD", 1_000),
  BASE_POSITION_BALANCE_PCT: envNumber("BASE_POSITION_BALANCE_PCT", 0.05),
  MIN_POSITION_USD: envNumber("MIN_POSITION_USD", 5),
  MAX_POSITION_USD: envNumber("MAX_POSITION_USD", 50),
  POSITION_MULTIPLIER_INITIAL: envNumber("POSITION_MULTIPLIER_INITIAL", 1),
  POSITION_MULTIPLIER_DRAWDOWN: envNumber("POSITION_MULTIPLIER_DRAWDOWN", 1.5),
  POSITION_MULTIPLIER_DRAWDOWN_MAX_PCT: envNumber("POSITION_MULTIPLIER_DRAWDOWN_MAX_PCT", 0.3),

  SCALE_IN_ENABLED: envBoolean("SCALE_IN_ENABLED", true),
  SCALE_IN_MAX_DOUBLES: envNumber("SCALE_IN_MAX_DOUBLES", 2),
  SCALE_IN_DROP_FROM_LAST_PCT: envNumber("SCALE_IN_DROP_FROM_LAST_PCT", 12),
  SCALE_IN_SIZE_RATIO: envNumber("SCALE_IN_SIZE_RATIO", 1),

  TAKE_PROFIT_MAX_PCT: envNumber("TAKE_PROFIT_MAX_PCT", 30),
  TAKE_PROFIT_MIN_PCT: envNumber("TAKE_PROFIT_MIN_PCT", 12),
  TAKE_PROFIT_MAP_MINUTES: envNumber("TAKE_PROFIT_MAP_MINUTES", 15),
  TAKE_PROFIT_RUNNER_ENABLED: envBoolean("TAKE_PROFIT_RUNNER_ENABLED", true),
  TAKE_PROFIT_RUNNER_MIN_SCORE: envNumber("TAKE_PROFIT_RUNNER_MIN_SCORE", 85),
  TAKE_PROFIT_RUNNER_MIN_BUY_SELL_RATIO: envNumber("TAKE_PROFIT_RUNNER_MIN_BUY_SELL_RATIO", 1.5),
  TAKE_PROFIT_RUNNER_MIN_M5_CHANGE_PCT: envNumber("TAKE_PROFIT_RUNNER_MIN_M5_CHANGE_PCT", 8),
  TAKE_PROFIT_RUNNER_LOCK_PROFIT_PCT: envNumber("TAKE_PROFIT_RUNNER_LOCK_PROFIT_PCT", 8),
  TAKE_PROFIT_RUNNER_TRAILING_STOP_PCT: envNumber("TAKE_PROFIT_RUNNER_TRAILING_STOP_PCT", 7),
  TAKE_PROFIT_RUNNER_MAX_MINUTES: envNumber("TAKE_PROFIT_RUNNER_MAX_MINUTES", 30),
  STOP_LOSS_PCT: envNumber("STOP_LOSS_PCT", 12),
  TRAILING_STOP_PCT: envNumber("TRAILING_STOP_PCT", 10),
  TRAILING_STOP_ACTIVATION_PCT: envNumber("TRAILING_STOP_ACTIVATION_PCT", 15),
  MAX_HOLD_MINUTES: envNumber("MAX_HOLD_MINUTES", 20)
};

export const NUMBER_RULES = {
  MAX_OPEN_POSITIONS: { min: 0, max: 20, integer: true },
  MAX_ENTRIES_PER_PAIR: { min: 0, max: 20, integer: true },
  COOLDOWN_AFTER_CLOSE_MINUTES: { min: 0, max: 1440, integer: true },

  MIN_LIQUIDITY_USD: { min: 0, max: 10_000_000 },
  MIN_VOLUME_M5_USD: { min: 0, max: 10_000_000 },
  MIN_BUYS_M5: { min: 0, max: 100_000, integer: true },
  MIN_BUY_SELL_RATIO: { min: 0, max: 100 },
  MIN_PRICE_CHANGE_M5_PCT: { min: -100, max: 10_000 },
  MAX_PRICE_CHANGE_M5_PCT: { min: 0, max: 10_000 },
  MIN_SCORE_TO_ENTER: { min: 0, max: 200, integer: true },
  MAX_PAIR_AGE_MINUTES: { min: 0, max: 100_000, integer: true },

  PAPER_STARTING_BALANCE_USD: { min: 0, max: 100_000_000 },
  BASE_POSITION_BALANCE_PCT: { min: 0, max: 1 },
  MIN_POSITION_USD: { min: 0, max: 1_000_000 },
  MAX_POSITION_USD: { min: 0, max: 1_000_000 },
  POSITION_MULTIPLIER_INITIAL: { min: 0, max: 20 },
  POSITION_MULTIPLIER_DRAWDOWN: { min: 0, max: 20 },
  POSITION_MULTIPLIER_DRAWDOWN_MAX_PCT: { min: 0.0001, max: 1 },

  SCALE_IN_MAX_DOUBLES: { min: 0, max: 10, integer: true },
  SCALE_IN_DROP_FROM_LAST_PCT: { min: 0, max: 99 },
  SCALE_IN_SIZE_RATIO: { min: 0, max: 10 },

  TAKE_PROFIT_MAX_PCT: { min: 0, max: 1000 },
  TAKE_PROFIT_MIN_PCT: { min: 0, max: 1000 },
  TAKE_PROFIT_MAP_MINUTES: { min: 1, max: 1440 },
  TAKE_PROFIT_RUNNER_MIN_SCORE: { min: 0, max: 200, integer: true },
  TAKE_PROFIT_RUNNER_MIN_BUY_SELL_RATIO: { min: 0, max: 100 },
  TAKE_PROFIT_RUNNER_MIN_M5_CHANGE_PCT: { min: -100, max: 10_000 },
  TAKE_PROFIT_RUNNER_LOCK_PROFIT_PCT: { min: 0, max: 1000 },
  TAKE_PROFIT_RUNNER_TRAILING_STOP_PCT: { min: 0, max: 100 },
  TAKE_PROFIT_RUNNER_MAX_MINUTES: { min: 1, max: 1440 },
  STOP_LOSS_PCT: { min: 0, max: 100 },
  TRAILING_STOP_PCT: { min: 0, max: 100 },
  TRAILING_STOP_ACTIVATION_PCT: { min: 0, max: 1000 },
  MAX_HOLD_MINUTES: { min: 1, max: 1440 }
};

export const BOOLEAN_RULES = {
  REQUIRE_LIQUIDITY: true,
  SCALE_IN_ENABLED: true,
  TAKE_PROFIT_RUNNER_ENABLED: true
};

export const STRING_RULES = {
  ALLOWED_DEXES: true
};

function configPath() {
  return process.env.STRATEGY_CONFIG_FILE || "data/strategy-config.json";
}

function normalizeNumber(key, value, fallback) {
  const rule = NUMBER_RULES[key];
  let number = Number(value);

  if (!Number.isFinite(number)) {
    number = fallback;
  }

  if (rule) {
    if (Number.isFinite(rule.min)) number = Math.max(rule.min, number);
    if (Number.isFinite(rule.max)) number = Math.min(rule.max, number);
    if (rule.integer) number = Math.floor(number);
  }

  return number;
}

function normalizeBoolean(value, fallback) {
  if (typeof value === "boolean") return value;
  if (value === undefined || value === null || value === "") return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

export function normalizeStrategyConfig(input = {}) {
  const merged = {
    ...DEFAULT_STRATEGY_CONFIG,
    ...input
  };
  const normalized = {};

  for (const [key, fallback] of Object.entries(DEFAULT_STRATEGY_CONFIG)) {
    if (NUMBER_RULES[key]) {
      normalized[key] = normalizeNumber(key, merged[key], fallback);
    } else if (BOOLEAN_RULES[key]) {
      normalized[key] = normalizeBoolean(merged[key], fallback);
    } else {
      normalized[key] = String(merged[key] ?? fallback);
    }
  }

  if (normalized.TAKE_PROFIT_MAX_PCT < normalized.TAKE_PROFIT_MIN_PCT) {
    normalized.TAKE_PROFIT_MAX_PCT = normalized.TAKE_PROFIT_MIN_PCT;
  }

  if (normalized.MAX_POSITION_USD > 0 && normalized.MIN_POSITION_USD > normalized.MAX_POSITION_USD) {
    normalized.MIN_POSITION_USD = normalized.MAX_POSITION_USD;
  }

  return normalized;
}

export function readSavedStrategyConfig() {
  try {
    const raw = fs.readFileSync(configPath(), "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
}

export function getStrategyConfig() {
  return normalizeStrategyConfig({
    ...DEFAULT_STRATEGY_CONFIG,
    ...readSavedStrategyConfig()
  });
}

export function getStrategyConfigSchema() {
  return {
    configPath: configPath(),
    defaults: DEFAULT_STRATEGY_CONFIG,
    numberRules: NUMBER_RULES,
    booleanRules: BOOLEAN_RULES,
    stringRules: STRING_RULES
  };
}

export function updateStrategyConfig(patch = {}) {
  const next = normalizeStrategyConfig({
    ...getStrategyConfig(),
    ...patch
  });

  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export function strategyConfigToRuntime(strategyConfig) {
  return {
    strategy: {
      minLiquidityUsd: strategyConfig.MIN_LIQUIDITY_USD,
      minVolumeM5Usd: strategyConfig.MIN_VOLUME_M5_USD,
      minBuysM5: strategyConfig.MIN_BUYS_M5,
      minBuySellRatio: strategyConfig.MIN_BUY_SELL_RATIO,
      minPriceChangeM5Pct: strategyConfig.MIN_PRICE_CHANGE_M5_PCT,
      maxPriceChangeM5Pct: strategyConfig.MAX_PRICE_CHANGE_M5_PCT,
      minScoreToEnter: strategyConfig.MIN_SCORE_TO_ENTER,
      maxPairAgeMinutes: strategyConfig.MAX_PAIR_AGE_MINUTES,
      allowedDexes: strategyConfig.ALLOWED_DEXES.split(",").map((item) => item.trim()).filter(Boolean),
      requireLiquidity: strategyConfig.REQUIRE_LIQUIDITY,
      maxOpenPositions: strategyConfig.MAX_OPEN_POSITIONS,
      cooldownAfterCloseMinutes: strategyConfig.COOLDOWN_AFTER_CLOSE_MINUTES,
      maxEntriesPerPair: strategyConfig.MAX_ENTRIES_PER_PAIR
    },
    paper: {
      startingBalanceUsd: strategyConfig.PAPER_STARTING_BALANCE_USD,
      basePositionBalancePct: strategyConfig.BASE_POSITION_BALANCE_PCT,
      minPositionUsd: strategyConfig.MIN_POSITION_USD,
      maxPositionUsd: strategyConfig.MAX_POSITION_USD,
      positionMultiplierInitial: strategyConfig.POSITION_MULTIPLIER_INITIAL,
      positionMultiplierDrawdown: strategyConfig.POSITION_MULTIPLIER_DRAWDOWN,
      positionMultiplierDrawdownMaxPct: strategyConfig.POSITION_MULTIPLIER_DRAWDOWN_MAX_PCT,
      scaleInEnabled: strategyConfig.SCALE_IN_ENABLED,
      scaleInMaxDoubles: strategyConfig.SCALE_IN_MAX_DOUBLES,
      scaleInDropFromLastPct: strategyConfig.SCALE_IN_DROP_FROM_LAST_PCT,
      scaleInSizeRatio: strategyConfig.SCALE_IN_SIZE_RATIO,
      takeProfitMaxPct: strategyConfig.TAKE_PROFIT_MAX_PCT,
      takeProfitMinPct: strategyConfig.TAKE_PROFIT_MIN_PCT,
      takeProfitMapMinutes: strategyConfig.TAKE_PROFIT_MAP_MINUTES,
      takeProfitRunnerEnabled: strategyConfig.TAKE_PROFIT_RUNNER_ENABLED,
      takeProfitRunnerMinScore: strategyConfig.TAKE_PROFIT_RUNNER_MIN_SCORE,
      takeProfitRunnerMinBuySellRatio: strategyConfig.TAKE_PROFIT_RUNNER_MIN_BUY_SELL_RATIO,
      takeProfitRunnerMinM5ChangePct: strategyConfig.TAKE_PROFIT_RUNNER_MIN_M5_CHANGE_PCT,
      takeProfitRunnerLockProfitPct: strategyConfig.TAKE_PROFIT_RUNNER_LOCK_PROFIT_PCT,
      takeProfitRunnerTrailingStopPct: strategyConfig.TAKE_PROFIT_RUNNER_TRAILING_STOP_PCT,
      takeProfitRunnerMaxMinutes: strategyConfig.TAKE_PROFIT_RUNNER_MAX_MINUTES,
      stopLossPct: strategyConfig.STOP_LOSS_PCT,
      trailingStopPct: strategyConfig.TRAILING_STOP_PCT,
      trailingStopActivationPct: strategyConfig.TRAILING_STOP_ACTIVATION_PCT,
      maxHoldMinutes: strategyConfig.MAX_HOLD_MINUTES
    }
  };
}
