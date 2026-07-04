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
    priceChangeM5Pct,
    ageMinutes,
    reasons
  };
}

export function shouldEnter(pair, momentum, strategyConfig) {
  if (!pair?.priceUsd || Number(pair.priceUsd) <= 0) return false;
  if (!strategyConfig.allowedDexes.includes(pair.dexId)) return false;
  if (momentum.liquidityUsd < strategyConfig.minLiquidityUsd) return false;
  if (momentum.volumeM5Usd < strategyConfig.minVolumeM5Usd) return false;
  if (momentum.buysM5 < strategyConfig.minBuysM5) return false;
  if (momentum.priceChangeM5Pct < strategyConfig.minPriceChangeM5Pct) return false;
  if (momentum.ageMinutes !== null && momentum.ageMinutes > strategyConfig.maxPairAgeMinutes) return false;
  return momentum.score >= strategyConfig.minScoreToEnter;
}
