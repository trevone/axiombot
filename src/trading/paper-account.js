import { clamp, mapValue, round2 } from "../math.js";

function closedPnlUsd(state) {
  return (state.closedPositions || []).reduce((total, position) => {
    const pnl = Number(position.realizedPnlUsd || 0);
    return Number.isFinite(pnl) ? total + pnl : total;
  }, 0);
}

export function updatePaperAccount(state, paperConfig) {
  const startingBalance = Number(paperConfig.startingBalanceUsd || 0);
  const currentBalance = startingBalance + closedPnlUsd(state);
  const openCount = Object.keys(state.openPositions || {}).length;
  const previousHighWater = Number(state.account?.highWaterBalanceUsd);
  let highWaterBalanceUsd =
    Number.isFinite(previousHighWater) && previousHighWater > 0
      ? previousHighWater
      : startingBalance;

  if (openCount === 0 && currentBalance > highWaterBalanceUsd) {
    highWaterBalanceUsd = currentBalance;
  }

  const drawdownUsd = Math.max(0, highWaterBalanceUsd - currentBalance);
  const drawdownPct = highWaterBalanceUsd > 0 ? drawdownUsd / highWaterBalanceUsd : 0;

  state.account = {
    mode: "paper",
    startingBalanceUsd: round2(startingBalance),
    currentBalanceUsd: round2(currentBalance),
    highWaterBalanceUsd: round2(highWaterBalanceUsd),
    drawdownUsd: round2(drawdownUsd),
    drawdownPct: Number(drawdownPct.toFixed(4)),
    openPositions: openCount,
    updatedAt: new Date().toISOString()
  };

  return state.account;
}

export function calculateBasePositionSize(state, paperConfig) {
  const account = updatePaperAccount(state, paperConfig);
  const balance = Number(account.highWaterBalanceUsd || account.currentBalanceUsd || 0);
  const drawdownPct = Number(account.drawdownPct || 0);
  const multiplier = mapValue(
    clamp(drawdownPct, 0, paperConfig.positionMultiplierDrawdownMaxPct),
    0,
    paperConfig.positionMultiplierDrawdownMaxPct,
    paperConfig.positionMultiplierInitial,
    paperConfig.positionMultiplierDrawdown
  );

  let sizeUsd = balance * paperConfig.basePositionBalancePct * multiplier;

  if (paperConfig.minPositionUsd > 0) {
    sizeUsd = Math.max(sizeUsd, paperConfig.minPositionUsd);
  }

  if (paperConfig.maxPositionUsd > 0) {
    sizeUsd = Math.min(sizeUsd, paperConfig.maxPositionUsd);
  }

  return {
    sizeUsd: round2(sizeUsd),
    baseBalanceUsd: round2(balance),
    basePositionBalancePct: paperConfig.basePositionBalancePct,
    multiplier: round2(multiplier),
    drawdownPct: account.drawdownPct,
    drawdownUsd: account.drawdownUsd,
    highWaterBalanceUsd: account.highWaterBalanceUsd
  };
}
