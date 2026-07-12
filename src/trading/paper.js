import { pairKey } from "../state/store.js";
import { mapValue, round2 } from "../math.js";
import { calculateBasePositionSize } from "./paper-account.js";

function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function holdMinutes(position) {
  const entryAt = new Date(position.entryAt).getTime();
  return Number.isFinite(entryAt)
    ? Math.max(0, (Date.now() - entryAt) / 60_000)
    : 0;
}

function maxHoldMinutes(position, paperConfig) {
  const positionMaxHold = Number(position.maxHoldMinutes);
  if (Number.isFinite(positionMaxHold) && positionMaxHold > 0) return positionMaxHold;
  return paperConfig.maxHoldMinutes;
}

function closePaperPosition(state, key, position, exitPriceUsd, exitReason, extra = {}) {
  const pnlPct = position.entryPriceUsd > 0
    ? ((exitPriceUsd - position.entryPriceUsd) / position.entryPriceUsd) * 100
    : 0;
  const closedPosition = {
    ...position,
    ...extra,
    exitPriceUsd,
    exitAt: new Date().toISOString(),
    exitReason,
    realizedPnlPct: Number(pnlPct.toFixed(2)),
    realizedPnlUsd: Number(((position.sizeUsd * pnlPct) / 100).toFixed(2))
  };

  delete state.openPositions[key];
  state.closedPositions.unshift(closedPosition);
  return closedPosition;
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

function currentBuySellRatio(pair) {
  const buysM5 = numberOrZero(pair?.txns?.m5?.buys);
  const sellsM5 = numberOrZero(pair?.txns?.m5?.sells);
  return sellsM5 > 0 ? buysM5 / sellsM5 : buysM5;
}

function shouldLetTakeProfitRun(position, pair, pnlPct, paperConfig) {
  if (!paperConfig.takeProfitRunnerEnabled) return false;
  if (position.takeProfitRunner?.active || position.takeProfitRunner?.decidedAt) return false;
  if (numberOrZero(position.score) < paperConfig.takeProfitRunnerMinScore) return false;
  if (pnlPct < paperConfig.takeProfitRunnerLockProfitPct) return false;

  const buySellRatio = currentBuySellRatio(pair);
  const priceChangeM5Pct = numberOrZero(pair?.priceChange?.m5);
  if (buySellRatio < paperConfig.takeProfitRunnerMinBuySellRatio) return false;
  if (priceChangeM5Pct < paperConfig.takeProfitRunnerMinM5ChangePct) return false;

  return true;
}

function armTakeProfitRunner(position, pair, pnlPct, currentPriceUsd, paperConfig) {
  position.takeProfitRunner = {
    active: true,
    startedAt: new Date().toISOString(),
    triggerPriceUsd: currentPriceUsd,
    triggerPnlPct: round2(pnlPct),
    lockProfitPct: paperConfig.takeProfitRunnerLockProfitPct,
    trailingStopPct: paperConfig.takeProfitRunnerTrailingStopPct,
    maxMinutes: paperConfig.takeProfitRunnerMaxMinutes,
    decision: "let_run",
    decisionInputs: {
      score: position.score,
      buySellRatio: round2(currentBuySellRatio(pair)),
      priceChangeM5Pct: numberOrZero(pair?.priceChange?.m5)
    }
  };
}

function rejectTakeProfitRunner(position, pair, pnlPct) {
  position.takeProfitRunner = {
    active: false,
    decidedAt: new Date().toISOString(),
    decision: "take_profit",
    decisionInputs: {
      score: position.score,
      buySellRatio: round2(currentBuySellRatio(pair)),
      priceChangeM5Pct: numberOrZero(pair?.priceChange?.m5),
      pnlPct: round2(pnlPct)
    }
  };
}

export function updatePaperTrades(state, pairsByKey, paperConfig) {
  const closed = [];

  for (const [key, position] of Object.entries(state.openPositions)) {
    const pair = pairsByKey.get(key);
    const positionHoldMinutes = holdMinutes(position);
    const positionMaxHoldMinutes = maxHoldMinutes(position, paperConfig);

    if (!pair) {
      const staleExitPriceUsd = numberOrZero(position.lastPriceUsd || position.entryPriceUsd);
      if (positionHoldMinutes >= positionMaxHoldMinutes && staleExitPriceUsd > 0) {
        closed.push(
          closePaperPosition(state, key, position, staleExitPriceUsd, "stale_no_quote", {
            staleSinceMinutes: round2(positionHoldMinutes)
          })
        );
      }
      continue;
    }

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
    const hitTp = pnlPct >= position.takeProfitPct;
    const hitSl = pnlPct <= -position.stopLossPct;
    const runner = position.takeProfitRunner;
    const runnerActive = Boolean(runner?.active);
    const runnerStartedAt = runnerActive ? new Date(runner.startedAt).getTime() : null;
    const runnerMinutes = Number.isFinite(runnerStartedAt)
      ? Math.max(0, (Date.now() - runnerStartedAt) / 60_000)
      : 0;
    const hitRunnerProfitFloor =
      runnerActive && pnlPct <= numberOrZero(runner.lockProfitPct);
    const hitRunnerTrailingStop =
      runnerActive && drawdownFromPeakPct <= -numberOrZero(runner.trailingStopPct);
    const hitRunnerMaxMinutes =
      runnerActive && runnerMinutes >= numberOrZero(runner.maxMinutes);
    const hitTrailingStop =
      !runnerActive &&
      peakPnlPct >= position.trailingStopActivationPct &&
      drawdownFromPeakPct <= -position.trailingStopPct;
    const hitMaxHold = positionHoldMinutes >= positionMaxHoldMinutes;

    if (hitTp && !runnerActive) {
      if (shouldLetTakeProfitRun(position, pair, pnlPct, paperConfig)) {
        armTakeProfitRunner(position, pair, pnlPct, currentPriceUsd, paperConfig);
        continue;
      }

      rejectTakeProfitRunner(position, pair, pnlPct);
    }

    if (
      !(hitTp && !runnerActive) &&
      !hitSl &&
      !hitTrailingStop &&
      !hitRunnerProfitFloor &&
      !hitRunnerTrailingStop &&
      !hitRunnerMaxMinutes &&
      !hitMaxHold
    ) {
      continue;
    }

    const exitReason =
      hitTp && !runnerActive
        ? "take_profit"
        : hitSl
          ? "stop_loss"
          : hitRunnerProfitFloor
            ? "runner_profit_floor"
            : hitRunnerTrailingStop
              ? "runner_trailing_stop"
              : hitRunnerMaxMinutes
                ? "runner_timeout"
                : hitTrailingStop
                  ? "trailing_stop"
                  : "max_hold";

    const closedPosition = closePaperPosition(state, key, position, currentPriceUsd, exitReason);
    closed.push(closedPosition);
  }

  state.closedPositions = state.closedPositions.slice(0, 500);
  return closed;
}
