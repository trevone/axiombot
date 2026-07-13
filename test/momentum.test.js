import test from "node:test";
import assert from "node:assert/strict";

import { CONFIG } from "../src/bot.js";
import { classifyMomentum, observeMomentum } from "../src/momentum.js";

function pair(overrides = {}) {
  return {
    chainId: "solana",
    pairAddress: "pair1",
    dexId: "pumpswap",
    priceUsd: 1,
    baseToken: { address: "mint1", symbol: "AAA", name: "AAA" },
    liquidity: { usd: 60_000 },
    volume: { m5: 10_000, h1: 100_000 },
    txns: { m5: { buys: 70, sells: 30 }, h1: { buys: 400, sells: 250 } },
    priceChange: { m5: 5, h1: 25, h6: 40, h24: 80 },
    marketCap: 600_000,
    fdv: 700_000,
    url: "https://example.com",
    ...overrides
  };
}

function seed(state, samples) {
  const start = Date.parse("2026-01-01T00:00:00Z");
  for (const [i, sample] of samples.entries()) {
    observeMomentum(state, [pair(sample)], CONFIG, start + i * 60_000);
  }
}

test("classifies accelerating token as active pump", () => {
  const state = {};
  seed(state, [
    { priceUsd: 0.9, volume: { m5: 4_000, h1: 80_000 }, txns: { m5: { buys: 30, sells: 20 }, h1: { buys: 300, sells: 220 } } },
    { priceUsd: 0.95, volume: { m5: 5_000, h1: 85_000 }, txns: { m5: { buys: 35, sells: 20 }, h1: { buys: 320, sells: 220 } } },
    { priceUsd: 0.98, volume: { m5: 6_000, h1: 90_000 }, txns: { m5: { buys: 40, sells: 22 }, h1: { buys: 340, sells: 230 } } },
    { priceUsd: 1.05, volume: { m5: 11_000, h1: 110_000 }, txns: { m5: { buys: 80, sells: 35 }, h1: { buys: 430, sells: 260 } } }
  ]);
  const result = classifyMomentum(pair({ priceUsd: 1.05, volume: { m5: 11_000, h1: 110_000 }, txns: { m5: { buys: 80, sells: 35 }, h1: { buys: 430, sells: 260 } } }), state, CONFIG);
  assert.equal(result.classification, "ACTIVE_PUMP");
  assert.equal(result.reasons.includes("insufficient_history"), false);
});

test("classifies vertical move as extended", () => {
  const state = {};
  seed(state, [
    { priceUsd: 0.3, volume: { m5: 5_000, h1: 80_000 }, txns: { m5: { buys: 40, sells: 20 }, h1: { buys: 300, sells: 200 } } },
    { priceUsd: 0.5, volume: { m5: 7_000, h1: 90_000 }, txns: { m5: { buys: 50, sells: 22 }, h1: { buys: 330, sells: 210 } } },
    { priceUsd: 0.8, volume: { m5: 9_000, h1: 100_000 }, txns: { m5: { buys: 60, sells: 24 }, h1: { buys: 360, sells: 220 } } },
    { priceUsd: 1.1, priceChange: { m5: 30, h1: 130, h6: 180, h24: 220 }, volume: { m5: 20_000, h1: 200_000 } }
  ]);
  const result = classifyMomentum(pair({ priceUsd: 1.1, priceChange: { m5: 30, h1: 130, h6: 180, h24: 220 }, volume: { m5: 20_000, h1: 200_000 } }), state, CONFIG);
  assert.equal(result.classification, "EXTENDED");
});

test("positive daily token with flat current action is not pumping", () => {
  const state = {};
  seed(state, [
    { priceUsd: 1, priceChange: { m5: 0, h1: 2, h6: 10, h24: 80 }, volume: { m5: 1_000, h1: 20_000 }, txns: { m5: { buys: 8, sells: 9 }, h1: { buys: 40, sells: 50 } } },
    { priceUsd: 1.01, priceChange: { m5: 0, h1: 2, h6: 10, h24: 80 }, volume: { m5: 1_000, h1: 20_000 }, txns: { m5: { buys: 8, sells: 9 }, h1: { buys: 40, sells: 50 } } },
    { priceUsd: 1, priceChange: { m5: -1, h1: 2, h6: 10, h24: 80 }, volume: { m5: 900, h1: 20_000 }, txns: { m5: { buys: 7, sells: 10 }, h1: { buys: 40, sells: 50 } } },
    { priceUsd: 1, priceChange: { m5: -0.5, h1: 2, h6: 10, h24: 80 }, volume: { m5: 900, h1: 20_000 }, txns: { m5: { buys: 7, sells: 10 }, h1: { buys: 40, sells: 50 } } }
  ]);
  const result = classifyMomentum(pair({ priceUsd: 1, priceChange: { m5: -0.5, h1: 2, h6: 10, h24: 80 }, volume: { m5: 900, h1: 20_000 }, txns: { m5: { buys: 7, sells: 10 }, h1: { buys: 40, sells: 50 } } }), state, CONFIG);
  assert.equal(result.classification, "NOT_PUMPING");
});
