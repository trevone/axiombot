function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function pairAgeMinutes(pair, now = Date.now()) {
  if (!pair?.pairCreatedAt) return null;
  return Math.max(0, Math.floor((now - pair.pairCreatedAt) / 60_000));
}

export function scoreMomentum(pair, strategyConfig) {
  const liquidityUsd = numberOrZero(pair.liquidity?.usd);
  const volumeM5Usd = numberOrZero(pair.volume?.m5);
  const buysM5 = numberOrZero(pair.txns?.m5?.buys);
  const sellsM5 = numberOrZero(pair.txns?.m5?.sells);
  const buySellRatio = sellsM5 > 0 ? buysM5 / sellsM5 : buysM5;
  const priceChangeM5Pct = numberOrZero(pair.priceChange?.m5);
  const ageMinutes = pairAgeMinutes(pair);

  const reasons = [];
  let score = 0;

  if (liquidityUsd >= strategyConfig.minLiquidityUsd) {
    score += clamp((liquidityUsd / strategyConfig.minLiquidityUsd) * 20, 0, 25);
    reasons.push(`liquidity $${Math.round(liquidityUsd).toLocaleString()}`);
  }

  if (volumeM5Usd >= strategyConfig.minVolumeM5Usd) {
    score += clamp((volumeM5Usd / strategyConfig.minVolumeM5Usd) * 20, 0, 25);
    reasons.push(`5m volume $${Math.round(volumeM5Usd).toLocaleString()}`);
  }

  if (buysM5 >= strategyConfig.minBuysM5) {
    score += clamp((buysM5 / strategyConfig.minBuysM5) * 15, 0, 20);
    reasons.push(`${buysM5} buys in 5m`);
  }

  if (buysM5 > sellsM5) {
    score += clamp(((buysM5 - sellsM5) / Math.max(1, buysM5 + sellsM5)) * 20, 0, 15);
    reasons.push("buy pressure");
  }

  if (priceChangeM5Pct >= strategyConfig.minPriceChangeM5Pct) {
    score += clamp(priceChangeM5Pct, 0, 15);
    reasons.push(`5m change ${priceChangeM5Pct}%`);
  }

  if (ageMinutes !== null && ageMinutes <= strategyConfig.maxPairAgeMinutes) {
    score += 10;
    reasons.push(`${ageMinutes}m old`);
  }

  return {
    score: Math.round(score),
    liquidityUsd,
    volumeM5Usd,
    buysM5,
    sellsM5,
    buySellRatio: Number(buySellRatio.toFixed(2)),
    priceChangeM5Pct,
    ageMinutes,
    reasons
  };
}

export function evaluateMomentumEntry(pair, momentum, strategyConfig) {
  const skipReasons = [];

  if (!pair?.priceUsd || Number(pair.priceUsd) <= 0) skipReasons.push("missing_price");
  if (!strategyConfig.allowedDexes.includes(pair.dexId)) skipReasons.push("dex_not_allowed");
  if (strategyConfig.requireLiquidity && momentum.liquidityUsd <= 0) skipReasons.push("zero_liquidity");
  if (momentum.liquidityUsd < strategyConfig.minLiquidityUsd) skipReasons.push("low_liquidity");
  if (momentum.volumeM5Usd < strategyConfig.minVolumeM5Usd) skipReasons.push("low_5m_volume");
  if (momentum.buysM5 < strategyConfig.minBuysM5) skipReasons.push("low_5m_buys");
  if (momentum.buySellRatio < strategyConfig.minBuySellRatio) skipReasons.push("weak_buy_sell_ratio");
  if (momentum.priceChangeM5Pct < strategyConfig.minPriceChangeM5Pct) skipReasons.push("weak_5m_move");
  if (momentum.priceChangeM5Pct > strategyConfig.maxPriceChangeM5Pct) skipReasons.push("overextended_5m_move");
  if (momentum.ageMinutes !== null && momentum.ageMinutes > strategyConfig.maxPairAgeMinutes) {
    skipReasons.push("pair_too_old");
  }
  if (momentum.score < strategyConfig.minScoreToEnter) skipReasons.push("score_below_entry");

  return {
    allowed: skipReasons.length === 0,
    skipReasons
  };
}
