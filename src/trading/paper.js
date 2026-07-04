import { pairKey } from "../state/store.js";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function enterPaperTrade(state, profile, pair, momentum, paperConfig) {
  const key = pairKey(pair);

  if (state.openPositions[key]) return null;

  const entryPriceUsd = numberOrZero(pair.priceUsd);
  if (entryPriceUsd <= 0) return null;

  const position = {
    id: key,
    mode: "paper",
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    tokenAddress: profile.tokenAddress,
    symbol: pair.baseToken?.symbol || "",
    name: pair.baseToken?.name || "",
    url: pair.url || profile.url,
    sizeUsd: paperConfig.tradeSizeUsd,
    entryPriceUsd,
    entryAt: new Date().toISOString(),
    takeProfitPct: paperConfig.takeProfitPct,
    stopLossPct: paperConfig.stopLossPct,
    score: momentum.score,
    reasons: momentum.reasons
  };

  state.openPositions[key] = position;
  return position;
}

export function updatePaperTrades(state, pairsByKey) {
  const closed = [];

  for (const [key, position] of Object.entries(state.openPositions)) {
    const pair = pairsByKey.get(key);
    if (!pair) continue;

    const currentPriceUsd = numberOrZero(pair.priceUsd);
    if (currentPriceUsd <= 0) continue;

    const pnlPct = ((currentPriceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
    position.lastPriceUsd = currentPriceUsd;
    position.unrealizedPnlPct = Number(pnlPct.toFixed(2));

    const hitTp = pnlPct >= position.takeProfitPct;
    const hitSl = pnlPct <= -position.stopLossPct;

    if (!hitTp && !hitSl) continue;

    const closedPosition = {
      ...position,
      exitPriceUsd: currentPriceUsd,
      exitAt: new Date().toISOString(),
      exitReason: hitTp ? "take_profit" : "stop_loss",
      realizedPnlPct: Number(pnlPct.toFixed(2)),
      realizedPnlUsd: Number(((position.sizeUsd * pnlPct) / 100).toFixed(2))
    };

    delete state.openPositions[key];
    state.closedPositions.unshift(closedPosition);
    closed.push(closedPosition);
  }

  state.closedPositions = state.closedPositions.slice(0, 500);
  return closed;
}
