function numberOrZero(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function pairAgeMinutes(pair, now = Date.now()) {
  if (!pair?.pairCreatedAt) {
    return null;
  }

  return Math.max(0, Math.floor((now - pair.pairCreatedAt) / 60_000));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function scorePair(pair, config) {
  const liquidityUsd = numberOrZero(pair.liquidity?.usd);
  const volumeM5 = numberOrZero(pair.volume?.m5);
  const buysM5 = numberOrZero(pair.txns?.m5?.buys);
  const sellsM5 = numberOrZero(pair.txns?.m5?.sells);
  const priceChangeM5 = numberOrZero(pair.priceChange?.m5);
  const ageMinutes = pairAgeMinutes(pair);

  const reasons = [];
  let score = 0;

  if (liquidityUsd >= config.minLiquidityUsd) {
    score += clamp((liquidityUsd / config.minLiquidityUsd) * 20, 0, 25);
    reasons.push(`liquidity $${Math.round(liquidityUsd).toLocaleString()}`);
  }

  if (volumeM5 >= config.minVolumeM5Usd) {
    score += clamp((volumeM5 / config.minVolumeM5Usd) * 20, 0, 25);
    reasons.push(`5m volume $${Math.round(volumeM5).toLocaleString()}`);
  }

  if (buysM5 >= config.minBuysM5) {
    score += clamp((buysM5 / config.minBuysM5) * 15, 0, 20);
    reasons.push(`${buysM5} buys in 5m`);
  }

  if (buysM5 > sellsM5) {
    score += clamp(((buysM5 - sellsM5) / Math.max(1, buysM5 + sellsM5)) * 20, 0, 15);
    reasons.push("buy pressure");
  }

  if (priceChangeM5 > 0) {
    score += clamp(priceChangeM5, 0, 15);
    reasons.push(`5m change ${priceChangeM5}%`);
  }

  if (ageMinutes !== null && ageMinutes <= config.maxPairAgeMinutes) {
    score += 10;
    reasons.push(`${ageMinutes}m old`);
  }

  return {
    score: Math.round(score),
    ageMinutes,
    liquidityUsd,
    volumeM5,
    buysM5,
    sellsM5,
    priceChangeM5,
    reasons
  };
}

export function isCandidateAllowed(pair, score, config) {
  if (!pair?.priceUsd || Number(pair.priceUsd) <= 0) {
    return false;
  }

  if (score.liquidityUsd < config.minLiquidityUsd) {
    return false;
  }

  if (score.volumeM5 < config.minVolumeM5Usd) {
    return false;
  }

  if (score.buysM5 < config.minBuysM5) {
    return false;
  }

  if (score.priceChangeM5 < config.minPriceChangeM5Pct) {
    return false;
  }

  if (score.ageMinutes !== null && score.ageMinutes > config.maxPairAgeMinutes) {
    return false;
  }

  return score.score >= config.minScoreToEnter;
}
