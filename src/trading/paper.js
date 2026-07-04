import { pairKey } from "../state/store.js";
import { mapValue, round2 } from "../math.js";
import { calculateBasePositionSize } from "./paper-account.js";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function enterPaperTrade(state, profile, pair, momentum, paperConfig) {
  const key = pairKey(pair);

  if (state.openPositions[key]) return null;

  const entryPriceUsd = numberOrZero(pair.priceUsd);
  if (entryPriceUsd <= 0) return null;

  const sizing = calculateBasePositionSize(state, paperConfig);
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
    sizeUsd: sizing.sizeUsd,
    sizing,
    entryPriceUsd,
    peakPriceUsd: entryPriceUsd,
    entryAt: new Date().toISOString(),
    takeProfitPct: paperConfig.takeProfitMaxPct,
    stopLossPct: paperConfig.stopLossPct,
    trailingStopPct: paperConfig.trailingStopPct,
    trailingStopActivationPct: paperConfig.trailingStopActivationPct,
    maxHoldMinutes: paperConfig.maxHoldMinutes,
    scaleIns: [],
    legs: [
      {
        priceUsd: entryPriceUsd,
        sizeUsd: sizing.sizeUsd,
        openedAt: new Date().toISOString(),
        reason: "initial"
      }
    ],
    score: momentum.score,
    reasons: momentum.reasons
  };

  state.openPositions[key] = position;
  return position;
}

function updateMappedTakeProfit(position, paperConfig) {
  const entryAt = new Date(position.entryAt).getTime();
  const elapsedMinutes = Number.isFinite(entryAt)
    ? Math.max(0, (Date.now() - entryAt) / 60_000)
    : 0;
  const mappedTakeProfitPct = mapValue(
    elapsedMinutes,
    0,
    paperConfig.takeProfitMapMinutes,
    paperConfig.takeProfitMaxPct,
    paperConfig.takeProfitMinPct
  );

  position.takeProfitPct = round2(mappedTakeProfitPct);
  position.takeProfitState = {
    elapsedMinutes: round2(elapsedMinutes),
    mapMinutes: paperConfig.takeProfitMapMinutes,
    maxPct: paperConfig.takeProfitMaxPct,
    minPct: paperConfig.takeProfitMinPct,
    mappedPct: position.takeProfitPct
  };
}

function maybeScaleIn(position, currentPriceUsd, paperConfig) {
  if (!paperConfig.scaleInEnabled) return null;

  const currentDoubles = position.scaleIns?.length || 0;
  if (currentDoubles >= paperConfig.scaleInMaxDoubles) return null;

  const lastLeg = position.legs?.[position.legs.length - 1];
  const lastPrice = numberOrZero(lastLeg?.priceUsd || position.entryPriceUsd);
  if (lastPrice <= 0) return null;

  const triggerPrice = lastPrice * (1 - paperConfig.scaleInDropFromLastPct / 100);
  if (currentPriceUsd > triggerPrice) return null;

  const initialSize = numberOrZero(position.legs?.[0]?.sizeUsd || position.sizeUsd);
  const legSizeUsd = initialSize * Math.pow(paperConfig.scaleInSizeRatio, currentDoubles + 1);
  const newTotalSize = position.sizeUsd + legSizeUsd;
  const weightedEntry =
    (position.entryPriceUsd * position.sizeUsd + currentPriceUsd * legSizeUsd) / newTotalSize;
  const projectedPnlPct = ((currentPriceUsd - weightedEntry) / weightedEntry) * 100;

  if (projectedPnlPct <= -position.stopLossPct) {
    position.scaleInBlocked = {
      reason: "projected_pnl_beyond_stop",
      projectedPnlPct: round2(projectedPnlPct),
      checkedAt: new Date().toISOString()
    };
    return null;
  }

  const scaleIn = {
    index: currentDoubles + 1,
    priceUsd: currentPriceUsd,
    sizeUsd: round2(legSizeUsd),
    triggerDropPct: paperConfig.scaleInDropFromLastPct,
    openedAt: new Date().toISOString()
  };

  position.scaleIns ||= [];
  position.legs ||= [];
  position.scaleIns.push(scaleIn);
  position.legs.push({
    priceUsd: currentPriceUsd,
    sizeUsd: round2(legSizeUsd),
    openedAt: scaleIn.openedAt,
    reason: "scale_in"
  });
  position.sizeUsd = round2(newTotalSize);
  position.entryPriceUsd = weightedEntry;

  return scaleIn;
}

export function updatePaperTrades(state, pairsByKey, paperConfig) {
  const closed = [];

  for (const [key, position] of Object.entries(state.openPositions)) {
    const pair = pairsByKey.get(key);
    if (!pair) continue;

    const currentPriceUsd = numberOrZero(pair.priceUsd);
    if (currentPriceUsd <= 0) continue;

    maybeScaleIn(position, currentPriceUsd, paperConfig);
    updateMappedTakeProfit(position, paperConfig);

    const pnlPct = ((currentPriceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
    position.peakPriceUsd = Math.max(numberOrZero(position.peakPriceUsd), currentPriceUsd);
    position.lastPriceUsd = currentPriceUsd;
    position.unrealizedPnlPct = Number(pnlPct.toFixed(2));

    const peakPnlPct = ((position.peakPriceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100;
    const drawdownFromPeakPct = ((currentPriceUsd - position.peakPriceUsd) / position.peakPriceUsd) * 100;
    const holdMinutes = (Date.now() - new Date(position.entryAt).getTime()) / 60_000;
    const hitTp = pnlPct >= position.takeProfitPct;
    const hitSl = pnlPct <= -position.stopLossPct;
    const hitTrailingStop =
      peakPnlPct >= position.trailingStopActivationPct &&
      drawdownFromPeakPct <= -position.trailingStopPct;
    const hitMaxHold = holdMinutes >= position.maxHoldMinutes;

    if (!hitTp && !hitSl && !hitTrailingStop && !hitMaxHold) continue;

    const exitReason =
      hitTp ? "take_profit" : hitSl ? "stop_loss" : hitTrailingStop ? "trailing_stop" : "max_hold";

    const closedPosition = {
      ...position,
      exitPriceUsd: currentPriceUsd,
      exitAt: new Date().toISOString(),
      exitReason,
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
