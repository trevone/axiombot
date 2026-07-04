import { pairKey } from "./state.js";

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function updateOpenPositions(state, pairsByKey, config) {
  const closed = [];

  for (const [key, position] of Object.entries(state.positions)) {
    const pair = pairsByKey.get(key);

    if (!pair) {
      continue;
    }

    const currentPrice = toNumber(pair.priceUsd);

    if (currentPrice <= 0) {
      continue;
    }

    const pnlPct = ((currentPrice - position.entryPriceUsd) / position.entryPriceUsd) * 100;
    const shouldTakeProfit = pnlPct >= config.takeProfitPct;
    const shouldStopLoss = pnlPct <= -config.stopLossPct;

    if (!shouldTakeProfit && !shouldStopLoss) {
      position.lastPriceUsd = currentPrice;
      position.unrealizedPnlPct = Number(pnlPct.toFixed(2));
      continue;
    }

    const closedPosition = {
      ...position,
      exitPriceUsd: currentPrice,
      exitAt: new Date().toISOString(),
      exitReason: shouldTakeProfit ? "take_profit" : "stop_loss",
      realizedPnlPct: Number(pnlPct.toFixed(2)),
      realizedPnlUsd: Number(((position.sizeUsd * pnlPct) / 100).toFixed(2))
    };

    delete state.positions[key];
    state.closedPositions.unshift(closedPosition);
    closed.push(closedPosition);
  }

  state.closedPositions = state.closedPositions.slice(0, 200);
  return closed;
}

export function enterPaperPosition(state, pair, token, score, config) {
  const key = pairKey(pair);

  if (state.positions[key]) {
    return null;
  }

  const entryPriceUsd = toNumber(pair.priceUsd);

  if (entryPriceUsd <= 0) {
    return null;
  }

  const position = {
    pairKey: key,
    chainId: pair.chainId,
    dexId: pair.dexId,
    pairAddress: pair.pairAddress,
    tokenAddress: token.tokenAddress,
    symbol: pair.baseToken?.symbol || token.tokenAddress,
    name: pair.baseToken?.name || "",
    url: pair.url || token.url,
    sizeUsd: config.paperTradeUsd,
    entryPriceUsd,
    entryAt: new Date().toISOString(),
    takeProfitPct: config.takeProfitPct,
    stopLossPct: config.stopLossPct,
    score: score.score,
    reasons: score.reasons
  };

  state.positions[key] = position;
  return position;
}
