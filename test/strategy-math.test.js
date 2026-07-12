import test from "node:test";
import assert from "node:assert/strict";

import { mapValue } from "../src/math.js";
import { normalizeStrategyConfig, strategyConfigToRuntime } from "../src/strategy/config-store.js";
import { calculateBasePositionSize, updatePaperAccount } from "../src/trading/paper-account.js";
import { updatePaperTrades } from "../src/trading/paper.js";

test("mapValue interpolates and clamps reversed destinations", () => {
  assert.equal(mapValue(0.15, 0, 0.3, 1, 2), 1.5);
  assert.equal(mapValue(0.3, 0, 0.3, 30, 12), 12);
  assert.equal(mapValue(0.6, 0, 0.3, 30, 12), 12);
});

test("paper account tracks high water only when flat", () => {
  const config = strategyConfigToRuntime(normalizeStrategyConfig()).paper;
  const state = {
    openPositions: {},
    closedPositions: [{ realizedPnlUsd: 25 }],
    account: null
  };

  const account = updatePaperAccount(state, config);
  assert.equal(account.currentBalanceUsd, 1025);
  assert.equal(account.highWaterBalanceUsd, 1025);

  state.openPositions.foo = { id: "foo" };
  state.closedPositions.push({ realizedPnlUsd: 25 });

  const withOpen = updatePaperAccount(state, config);
  assert.equal(withOpen.currentBalanceUsd, 1050);
  assert.equal(withOpen.highWaterBalanceUsd, 1025);
});

test("position size maps upward during drawdown", () => {
  const config = strategyConfigToRuntime(
    normalizeStrategyConfig({
      PAPER_STARTING_BALANCE_USD: 1000,
      BASE_POSITION_BALANCE_PCT: 0.05,
      MIN_POSITION_USD: 0,
      MAX_POSITION_USD: 0,
      POSITION_MULTIPLIER_INITIAL: 1,
      POSITION_MULTIPLIER_DRAWDOWN: 2,
      POSITION_MULTIPLIER_DRAWDOWN_MAX_PCT: 0.2
    })
  ).paper;

  const state = {
    openPositions: {},
    closedPositions: [{ realizedPnlUsd: -100 }],
    account: { highWaterBalanceUsd: 1000 }
  };

  const sizing = calculateBasePositionSize(state, config);
  assert.equal(sizing.highWaterBalanceUsd, 1000);
  assert.equal(sizing.drawdownPct, 0.1);
  assert.equal(sizing.multiplier, 1.5);
  assert.equal(sizing.sizeUsd, 75);
});

test("take profit runner closes immediately when momentum is weak", () => {
  const config = strategyConfigToRuntime(
    normalizeStrategyConfig({
      TAKE_PROFIT_MAX_PCT: 10,
      TAKE_PROFIT_MIN_PCT: 10,
      TAKE_PROFIT_RUNNER_ENABLED: true,
      TAKE_PROFIT_RUNNER_MIN_SCORE: 90,
      TAKE_PROFIT_RUNNER_MIN_BUY_SELL_RATIO: 2,
      TAKE_PROFIT_RUNNER_MIN_M5_CHANGE_PCT: 20
    })
  ).paper;
  const state = {
    openPositions: {
      "solana:pair1": {
        id: "solana:pair1",
        entryPriceUsd: 1,
        peakPriceUsd: 1,
        entryAt: new Date().toISOString(),
        sizeUsd: 10,
        score: 80,
        scaleIns: [],
        legs: [{ priceUsd: 1, sizeUsd: 10 }]
      }
    },
    closedPositions: []
  };
  const pair = {
    chainId: "solana",
    pairAddress: "pair1",
    priceUsd: 1.12,
    txns: { m5: { buys: 10, sells: 10 } },
    priceChange: { m5: 10 }
  };

  const closed = updatePaperTrades(state, new Map([["solana:pair1", pair]]), config);

  assert.equal(closed.length, 1);
  assert.equal(closed[0].exitReason, "take_profit");
  assert.equal(closed[0].takeProfitRunner.decision, "take_profit");
});

test("take profit runner lets strong trades run and exits on runner trail", () => {
  const config = strategyConfigToRuntime(
    normalizeStrategyConfig({
      TAKE_PROFIT_MAX_PCT: 10,
      TAKE_PROFIT_MIN_PCT: 10,
      TAKE_PROFIT_RUNNER_ENABLED: true,
      TAKE_PROFIT_RUNNER_MIN_SCORE: 80,
      TAKE_PROFIT_RUNNER_MIN_BUY_SELL_RATIO: 1.5,
      TAKE_PROFIT_RUNNER_MIN_M5_CHANGE_PCT: 8,
      TAKE_PROFIT_RUNNER_LOCK_PROFIT_PCT: 6,
      TAKE_PROFIT_RUNNER_TRAILING_STOP_PCT: 5
    })
  ).paper;
  const position = {
    id: "solana:pair1",
    entryPriceUsd: 1,
    peakPriceUsd: 1,
    entryAt: new Date().toISOString(),
    sizeUsd: 10,
    score: 90,
    scaleIns: [],
    legs: [{ priceUsd: 1, sizeUsd: 10 }]
  };
  const state = {
    openPositions: { "solana:pair1": position },
    closedPositions: []
  };
  const strongPair = {
    chainId: "solana",
    pairAddress: "pair1",
    priceUsd: 1.12,
    txns: { m5: { buys: 30, sells: 10 } },
    priceChange: { m5: 15 }
  };

  const firstClosed = updatePaperTrades(state, new Map([["solana:pair1", strongPair]]), config);

  assert.equal(firstClosed.length, 0);
  assert.equal(state.openPositions["solana:pair1"].takeProfitRunner.active, true);

  const pullbackPair = {
    ...strongPair,
    priceUsd: 1.06
  };
  const secondClosed = updatePaperTrades(state, new Map([["solana:pair1", pullbackPair]]), config);

  assert.equal(secondClosed.length, 1);
  assert.equal(secondClosed[0].exitReason, "runner_trailing_stop");
});

test("paper trades close stale positions missing from latest scan after max hold", () => {
  const config = strategyConfigToRuntime(
    normalizeStrategyConfig({
      MAX_HOLD_MINUTES: 20
    })
  ).paper;
  const state = {
    openPositions: {
      "solana:stale": {
        id: "solana:stale",
        entryPriceUsd: 1,
        lastPriceUsd: 0.8,
        peakPriceUsd: 1,
        entryAt: new Date(Date.now() - 30 * 60_000).toISOString(),
        sizeUsd: 10,
        score: 90,
        maxHoldMinutes: 20,
        scaleIns: [],
        legs: [{ priceUsd: 1, sizeUsd: 10 }]
      }
    },
    closedPositions: []
  };

  const closed = updatePaperTrades(state, new Map(), config);

  assert.equal(closed.length, 1);
  assert.equal(closed[0].exitReason, "stale_no_quote");
  assert.equal(closed[0].realizedPnlPct, -20);
  assert.deepEqual(Object.keys(state.openPositions), []);
});
