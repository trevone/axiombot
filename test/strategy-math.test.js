import test from "node:test";
import assert from "node:assert/strict";

import { mapValue } from "../src/math.js";
import { normalizeStrategyConfig, strategyConfigToRuntime } from "../src/strategy/config-store.js";
import { calculateBasePositionSize, updatePaperAccount } from "../src/trading/paper-account.js";

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
