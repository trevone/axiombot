import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG, evaluateEntries, managePositions, score } from "../src/bot.js";

function pair(overrides = {}) {
  return {
    chainId: "solana",
    pairAddress: "pair1",
    dexId: "pumpswap",
    priceUsd: 1,
    baseToken: { symbol: "AAA", name: "AAA" },
    liquidity: { usd: 20_000 },
    volume: { m5: 5_000 },
    txns: { m5: { buys: 20, sells: 5 } },
    priceChange: { m5: 10 },
    url: "https://example.com",
    ...overrides
  };
}

function openPosition(symbol, letRun = false) {
  return {
    id: `solana:${symbol}`,
    symbol,
    entry: 1,
    last: 1,
    peak: 1,
    size: 50,
    opened: Date.now(),
    scales: 0,
    lastScalePrice: 1,
    letRun
  };
}

test("scores and enters a valid candidate", () => {
  const state = { open: {}, closed: [], decisions: [], prices: { "solana:pair1": [0.9, 0.95] } };
  const candidates = evaluateEntries(state, [pair()]);
  assert.equal(candidates[0].accepted, true);
  assert.equal(Object.keys(state.open).length, 1);
});

test("rejects candidate that is not breaking recent high", () => {
  const state = { open: {}, closed: [], decisions: [], prices: { "solana:pair1": [1, 1.05] } };
  const candidates = evaluateEntries(state, [pair()]);
  assert.equal(candidates[0].accepted, false);
  assert.equal(candidates[0].reasons.includes("not_breaking_recent_high"), true);
});

test("let-run positions do not use entry slots", () => {
  const state = {
    open: {
      "solana:a": openPosition("A", true),
      "solana:b": openPosition("B", true),
      "solana:c": openPosition("C", true)
    },
    closed: [],
    decisions: [],
    prices: { "solana:pair1": [0.9] }
  };
  const candidates = evaluateEntries(state, [pair()]);
  assert.equal(candidates[0].accepted, true);
  assert.equal(candidates[0].reasons.includes("max_open"), false);
});

test("normal positions still use entry slots", () => {
  const state = {
    open: {
      "solana:a": openPosition("A"),
      "solana:b": openPosition("B"),
      "solana:c": openPosition("C")
    },
    closed: [],
    decisions: [],
    prices: { "solana:pair1": [0.9] }
  };
  const candidates = evaluateEntries(state, [pair()]);
  assert.equal(candidates[0].accepted, false);
  assert.equal(candidates[0].reasons.includes("max_open"), true);
});

test("rejects overextended candidate", () => {
  const state = { open: {}, closed: [], decisions: [], prices: { "solana:pair1": [0.9] } };
  const candidates = evaluateEntries(state, [pair({ priceChange: { m5: 200 } })]);
  assert.equal(candidates[0].accepted, false);
  assert.deepEqual(candidates[0].reasons, ["overextended_5m_move"]);
});

test("scales before stopping averaged position", () => {
  const state = { open: {}, closed: [], decisions: [], prices: { "solana:pair1": [0.9] } };
  evaluateEntries(state, [pair()]);
  managePositions(state, [pair({ priceUsd: 0.88 })]);
  const pos = Object.values(state.open)[0];
  assert.equal(pos.scales, 1);
  assert.equal(state.closed.length, 0);
});

test("closes stale no quote without inventing exit price", () => {
  const state = {
    open: {
      "solana:pair1": {
        id: "solana:pair1",
        symbol: "AAA",
        entry: 1,
        last: 1,
        peak: 1,
        size: 50,
        opened: Date.now() - CONFIG.maxHoldMs - 1,
        scales: 0,
        lastScalePrice: 1
      }
    },
    closed: [],
    decisions: []
  };
  managePositions(state, []);
  assert.equal(Object.keys(state.open).length, 0);
  assert.equal(state.closed[0].reason, "stale_no_quote");
  assert.equal(state.closed[0].exit, null);
  assert.equal(state.closed[0].pnlPct, null);
});

test("take profit inside window enables let run and breakeven stop", () => {
  const state = { open: {}, closed: [], decisions: [], prices: { "solana:pair1": [0.9] } };
  evaluateEntries(state, [pair()]);
  managePositions(state, [pair({ priceUsd: 1.1 })]);
  const pos = Object.values(state.open)[0];
  assert.equal(pos.letRun, true);

  managePositions(state, [pair({ priceUsd: 1 })]);
  assert.equal(Object.keys(state.open).length, 0);
  assert.equal(state.closed[0].reason, "breakeven_stop");
});

test("let run trims remaining size at new highs", () => {
  const state = { open: {}, closed: [], decisions: [], prices: { "solana:pair1": [0.9] } };
  evaluateEntries(state, [pair()]);
  managePositions(state, [pair({ priceUsd: 1.1 })]);
  managePositions(state, [pair({ priceUsd: 1.25 })]);
  const pos = Object.values(state.open)[0];
  assert.equal(pos.letRun, true);
  assert.equal(pos.letRunTrims, 1);
  assert.equal(pos.size, 40);
  assert.equal(pos.lastTrimPrice, 1.25);
  assert.equal(state.closed[0].reason, "let_run_trim");
  assert.equal(state.closed[0].size, 10);
  assert.equal(Math.round(state.closed[0].pnlPct), 25);
});

test("let run trims by time if still profitable without a new high", () => {
  const state = {
    open: {
      "solana:pair1": {
        id: "solana:pair1",
        symbol: "AAA",
        entry: 1,
        last: 1,
        peak: 1.2,
        size: 50,
        opened: Date.now() - CONFIG.letRunWindowMs,
        scales: 0,
        lastScalePrice: 1,
        letRun: true,
        lastTrimPrice: 1.2,
        lastTrimAt: Date.now() - CONFIG.letRunTrimMaxWaitMs - 1,
        letRunTrims: 0
      }
    },
    closed: [],
    decisions: []
  };
  managePositions(state, [pair({ priceUsd: 1.1 })]);
  const pos = Object.values(state.open)[0];
  assert.equal(pos.size, 40);
  assert.equal(pos.lastTrimPrice, 1.1);
  assert.equal(pos.letRunTrims, 1);
  assert.equal(state.closed[0].reason, "let_run_time_trim");
  assert.equal(state.closed[0].size, 10);
});

test("take profit after window closes without let run", () => {
  const state = {
    open: {
      "solana:pair1": {
        id: "solana:pair1",
        symbol: "AAA",
        entry: 1,
        last: 1,
        peak: 1,
        size: 50,
        opened: Date.now() - CONFIG.letRunWindowMs - 1,
        scales: 0,
        lastScalePrice: 1,
        letRun: false
      }
    },
    closed: [],
    decisions: []
  };
  managePositions(state, [pair({ priceUsd: 1.1 })]);
  assert.equal(Object.keys(state.open).length, 0);
  assert.equal(state.closed[0].reason, "take_profit");
});
