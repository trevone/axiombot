import { pairId } from "./dex.js";

const n = (value) => Number(value);
const good = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(n(value));
const read = (value) => good(value) ? n(value) : null;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function median(values) {
  const sorted = values.filter((value) => good(value)).map(Number).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ratio(buys, sells) {
  if (!good(buys) || !good(sells) || buys + sells <= 0) return null;
  return buys / (buys + sells);
}

function pct(current, previous) {
  if (!good(current) || !good(previous) || Number(previous) <= 0) return null;
  return ((Number(current) / Number(previous)) - 1) * 100;
}

function observation(pair, now) {
  const buysM5 = read(pair.txns?.m5?.buys);
  const sellsM5 = read(pair.txns?.m5?.sells);
  const buysH1 = read(pair.txns?.h1?.buys);
  const sellsH1 = read(pair.txns?.h1?.sells);
  return {
    at: now,
    id: pairId(pair),
    chainId: pair.chainId,
    tokenMint: pair.baseToken?.address || null,
    symbol: pair.baseToken?.symbol || "",
    name: pair.baseToken?.name || "",
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    pairCreatedAt: pair.pairCreatedAt || null,
    priceUsd: read(pair.priceUsd),
    liquidityUsd: read(pair.liquidity?.usd),
    marketCap: read(pair.marketCap),
    fdv: read(pair.fdv),
    priceChangeM5: read(pair.priceChange?.m5),
    priceChangeH1: read(pair.priceChange?.h1),
    priceChangeH6: read(pair.priceChange?.h6),
    priceChangeH24: read(pair.priceChange?.h24),
    volumeM5Usd: read(pair.volume?.m5),
    volumeH1Usd: read(pair.volume?.h1),
    volumeH6Usd: read(pair.volume?.h6),
    volumeH24Usd: read(pair.volume?.h24),
    buysM5,
    sellsM5,
    buysH1,
    sellsH1,
    m5Txns: good(buysM5) && good(sellsM5) ? buysM5 + sellsM5 : null,
    h1Txns: good(buysH1) && good(sellsH1) ? buysH1 + sellsH1 : null,
    m5BuyRatio: ratio(buysM5, sellsM5),
    activeBoosts: read(pair.boosts?.active),
    raw: pair
  };
}

export function observeMomentum(state, pairs, cfg, now = Date.now()) {
  if (!state.observations) state.observations = {};
  for (const pair of pairs) {
    const obs = observation(pair, now);
    const existing = Array.isArray(state.observations[obs.id]) ? state.observations[obs.id] : [];
    state.observations[obs.id] = [...existing, obs].filter((item) => now - item.at <= cfg.momentumHistoryMs);
  }
}

function scoreMomentum(current, facts, cfg) {
  const components = {
    m5Price: good(current.priceChangeM5) ? clamp((current.priceChangeM5 / 12) * 15, 0, 15) : 0,
    h1Price: good(current.priceChangeH1) ? clamp((current.priceChangeH1 / 40) * 15, 0, 15) : 0,
    turnover: good(facts.m5Turnover) ? clamp((facts.m5Turnover / 0.5) * 15, 0, 15) : 0,
    volumeAccel: good(facts.volumeAcceleration) ? clamp((facts.volumeAcceleration / 2) * 15, 0, 15) : 0,
    txnAccel: good(facts.transactionAcceleration) ? clamp((facts.transactionAcceleration / 2) * 10, 0, 10) : 0,
    buyRatio: good(current.m5BuyRatio) ? clamp(((current.m5BuyRatio - 0.5) / 0.25) * 10, 0, 10) : 0,
    liquidity: good(current.liquidityUsd) ? clamp((current.liquidityUsd / cfg.pumpMinLiquidityUsd) * 8, 0, 10) : 0,
    nearHigh: good(facts.drawdownFrom15mHigh) ? clamp(((facts.drawdownFrom15mHigh + 15) / 15) * 10, 0, 10) : 0
  };
  const penalties = {
    h1Extended: good(current.priceChangeH1) && current.priceChangeH1 > cfg.pumpExtendedH1Pct ? -15 : 0,
    m5Extended: good(current.priceChangeM5) && current.priceChangeM5 > cfg.pumpExtendedM5Pct ? -20 : 0,
    valuationLiquidity: good(facts.valuationLiquidityRatio) && facts.valuationLiquidityRatio > 20 ? -10 : 0,
    liquidityLoss: good(facts.liquidityChangePct) && facts.liquidityChangePct < -5 ? -15 : 0,
    volumeFading: current.priceChangeM5 > 0 && good(facts.volumeAcceleration) && facts.volumeAcceleration < 1 ? -10 : 0,
    txnFading: current.priceChangeM5 > 0 && good(facts.transactionAcceleration) && facts.transactionAcceleration < 1 ? -10 : 0
  };
  const raw = Object.values(components).reduce((sum, value) => sum + value, 0) + Object.values(penalties).reduce((sum, value) => sum + value, 0);
  const capped = facts.hasEnoughHistory ? raw : Math.min(raw, 49);
  return { score: Math.round(clamp(capped, 0, 100)), components, penalties };
}

export function classifyMomentum(pair, state, cfg) {
  const id = pairId(pair);
  const history = Array.isArray(state.observations?.[id]) ? state.observations[id] : [];
  const current = history.at(-1) || observation(pair, Date.now());
  const previous = history.slice(0, -1);
  const recent15 = history.filter((item) => current.at - item.at <= 15 * 60_000);
  const prevM5VolMedian = median(previous.map((item) => item.volumeM5Usd));
  const prevM5TxnMedian = median(previous.map((item) => item.m5Txns));
  const previousLiquidity = previous.at(-1)?.liquidityUsd;
  const high15 = Math.max(...recent15.map((item) => item.priceUsd).filter((value) => good(value)));
  const lowObserved = Math.min(...history.map((item) => item.priceUsd).filter((value) => good(value)));
  const valuation = current.marketCap || current.fdv;
  const facts = {
    hasEnoughHistory: previous.length >= cfg.momentumMinHistorySamples,
    volumeAcceleration: good(prevM5VolMedian) && prevM5VolMedian > 0 ? current.volumeM5Usd / prevM5VolMedian : null,
    transactionAcceleration: good(prevM5TxnMedian) && prevM5TxnMedian > 0 ? current.m5Txns / prevM5TxnMedian : null,
    liquidityChangePct: pct(current.liquidityUsd, previousLiquidity),
    drawdownFrom15mHigh: good(high15) ? pct(current.priceUsd, high15) : null,
    observedMultiple: good(lowObserved) && lowObserved > 0 ? current.priceUsd / lowObserved : null,
    m5Turnover: good(current.volumeM5Usd) && good(current.liquidityUsd) && current.liquidityUsd > 0 ? current.volumeM5Usd / current.liquidityUsd : null,
    valuationLiquidityRatio: good(valuation) && good(current.liquidityUsd) && current.liquidityUsd > 0 ? valuation / current.liquidityUsd : null
  };
  const score = scoreMomentum(current, facts, cfg);
  const reasons = [];
  const warnings = [];

  if (!good(current.priceUsd) || current.priceUsd <= 0) reasons.push("missing_price");
  if (!good(current.liquidityUsd) || current.liquidityUsd < cfg.pumpMinLiquidityUsd) reasons.push("low_liquidity");
  if (current.activeBoosts > 0) warnings.push("BOOSTED");
  if (!facts.hasEnoughHistory) reasons.push("insufficient_history");

  let classification = "WATCHING";
  if (reasons.includes("missing_price") || reasons.includes("low_liquidity")) {
    classification = "REJECTED_RISK";
  } else if (facts.hasEnoughHistory) {
    const eligible =
      current.volumeM5Usd >= cfg.pumpMinM5VolumeUsd &&
      current.m5Txns >= cfg.pumpMinM5Txns &&
      current.h1Txns >= cfg.pumpMinH1Txns &&
      current.priceChangeM5 >= cfg.pumpMinM5PricePct &&
      current.priceChangeH1 >= cfg.pumpMinH1PricePct &&
      current.m5BuyRatio >= cfg.pumpMinBuyRatio &&
      facts.m5Turnover >= cfg.pumpMinM5Turnover;
    const extended =
      current.priceChangeH1 > cfg.pumpExtendedH1Pct ||
      current.priceChangeM5 > cfg.pumpExtendedM5Pct ||
      facts.observedMultiple >= cfg.pumpExtendedObservedMultiple ||
      facts.m5Turnover > cfg.pumpExtendedTurnover ||
      (current.priceChangeM5 > 0 && facts.volumeAcceleration !== null && facts.volumeAcceleration < 1) ||
      (current.priceChangeM5 > 0 && facts.transactionAcceleration !== null && facts.transactionAcceleration < 1);
    const cooling =
      current.priceChangeM5 <= 0 ||
      current.m5BuyRatio < cfg.pumpCoolingBuyRatio ||
      facts.volumeAcceleration <= cfg.pumpCoolingAcceleration ||
      facts.transactionAcceleration <= cfg.pumpCoolingAcceleration ||
      facts.drawdownFrom15mHigh < cfg.pumpCoolingDrawdownPct;

    if (extended && current.priceChangeH1 >= cfg.pumpMinH1PricePct) classification = "EXTENDED";
    else if (cooling && current.priceChangeH1 >= 5) classification = "COOLING";
    else if (eligible && facts.volumeAcceleration >= cfg.pumpActiveVolumeAcceleration && facts.transactionAcceleration >= cfg.pumpActiveTxnAcceleration && facts.drawdownFrom15mHigh >= cfg.pumpActiveMaxDrawdownPct) classification = "ACTIVE_PUMP";
    else if (current.priceChangeH1 < 5 || current.priceChangeM5 <= 0 || facts.m5Turnover < cfg.pumpMinM5Turnover) classification = "NOT_PUMPING";
  }

  return { classification, score: score.score, components: score.components, penalties: score.penalties, facts, reasons, warnings };
}
