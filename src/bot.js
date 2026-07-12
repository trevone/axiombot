import { pairId } from "./dex.js";
import { logDecision } from "./state.js";

export const CONFIG = {
  scanMs: 30_000,
  profileLimit: 30,
  maxOpen: 3,
  breakoutSamples: 10,
  maxHoldMs: 20 * 60_000,
  letRunWindowMs: 15 * 60_000,
  letRunMaxMs: 6 * 60 * 60_000,
  tradeUsd: 50,
  allowedDexes: ["pumpswap", "raydium", "meteora"],
  minLiquidityUsd: 10_000,
  minVolumeM5Usd: 500,
  minBuysM5: 5,
  minBuySellRatio: 1.2,
  minMoveM5Pct: 5,
  maxMoveM5Pct: 60,
  minScore: 70,
  stopLossPct: 70,
  scaleDropPct: 7,
  maxScales: 5,
  scaleRatio: 1.3,
  takeProfitPct: 10
};

const n = (value) => Number(value);
const good = (value) => value !== null && value !== undefined && value !== "" && Number.isFinite(n(value));
const pct = (price, entry) => ((price - entry) / entry) * 100;
const read = (value) => good(value) ? n(value) : null;

function metric(pair) {
  const buys = read(pair.txns?.m5?.buys);
  const sells = read(pair.txns?.m5?.sells);
  return {
    liquidityUsd: read(pair.liquidity?.usd),
    volumeM5Usd: read(pair.volume?.m5),
    buysM5: buys,
    sellsM5: sells,
    buySellRatio: sells > 0 ? buys / sells : buys,
    moveM5Pct: read(pair.priceChange?.m5),
    ageMin: pair.pairCreatedAt ? Math.max(0, Math.floor((Date.now() - pair.pairCreatedAt) / 60_000)) : null
  };
}

export function score(pair, cfg = CONFIG) {
  const m = metric(pair);
  let score = 0;
  if (good(m.liquidityUsd) && m.liquidityUsd >= cfg.minLiquidityUsd) score += Math.min(25, (m.liquidityUsd / cfg.minLiquidityUsd) * 20);
  if (good(m.volumeM5Usd) && m.volumeM5Usd >= cfg.minVolumeM5Usd) score += Math.min(25, (m.volumeM5Usd / cfg.minVolumeM5Usd) * 20);
  if (good(m.buysM5) && m.buysM5 >= cfg.minBuysM5) score += Math.min(20, (m.buysM5 / cfg.minBuysM5) * 15);
  if (good(m.buysM5) && good(m.sellsM5) && m.buysM5 > m.sellsM5) score += Math.min(15, ((m.buysM5 - m.sellsM5) / Math.max(1, m.buysM5 + m.sellsM5)) * 20);
  if (good(m.moveM5Pct) && m.moveM5Pct >= cfg.minMoveM5Pct) score += Math.min(15, m.moveM5Pct);
  return { ...m, score: Math.round(score) };
}

export function rejectReasons(pair, m, state, cfg = CONFIG) {
  const reasons = [];
  const samples = state.prices?.[pairId(pair)];
  const previousHigh = Array.isArray(samples) && samples.length > 0 ? Math.max(...samples) : null;
  if (!good(pair.priceUsd) || n(pair.priceUsd) <= 0) reasons.push("missing_price");
  if (previousHigh === null) reasons.push("missing_price_history");
  else if (n(pair.priceUsd) <= previousHigh) reasons.push("not_breaking_recent_high");
  if (!pair.baseToken?.symbol) reasons.push("missing_symbol");
  if (!cfg.allowedDexes.includes(pair.dexId)) reasons.push("dex_not_allowed");
  if (!good(m.liquidityUsd) || m.liquidityUsd < cfg.minLiquidityUsd) reasons.push("low_liquidity");
  if (!good(m.volumeM5Usd) || m.volumeM5Usd < cfg.minVolumeM5Usd) reasons.push("low_5m_volume");
  if (!good(m.buysM5) || m.buysM5 < cfg.minBuysM5) reasons.push("low_5m_buys");
  if (!good(m.buySellRatio) || m.buySellRatio < cfg.minBuySellRatio) reasons.push("weak_buy_sell_ratio");
  if (!good(m.moveM5Pct) || m.moveM5Pct < cfg.minMoveM5Pct) reasons.push("weak_5m_move");
  if (good(m.moveM5Pct) && m.moveM5Pct > cfg.maxMoveM5Pct) reasons.push("overextended_5m_move");
  if (m.score < cfg.minScore) reasons.push("score_below_entry");
  if (Object.keys(state.open).length >= cfg.maxOpen) reasons.push("max_open");
  if (state.open[pairId(pair)]) reasons.push("already_open");
  return reasons;
}

function recordPrices(state, pairs, cfg) {
  if (!state.prices) state.prices = {};
  for (const pair of pairs) {
    const price = read(pair.priceUsd);
    if (price === null || price <= 0) continue;
    const id = pairId(pair);
    const samples = Array.isArray(state.prices[id]) ? state.prices[id] : [];
    state.prices[id] = [...samples, price].slice(-cfg.breakoutSamples);
  }
}

function requiredPositionOk(pos) {
  return pos?.id && good(pos.entry) && good(pos.last) && good(pos.peak) && good(pos.size) && good(pos.opened);
}

function close(state, id, price, reason) {
  const pos = state.open[id];
  delete state.open[id];
  const pnlPct = good(price) ? pct(n(price), pos.entry) : null;
  const closed = { ...pos, exit: good(price) ? n(price) : null, reason, pnlPct, closed: Date.now() };
  state.closed.unshift(closed);
  state.closed = state.closed.slice(0, 300);
  logDecision(state, { action: "close", symbol: pos.symbol, reason, pnlPct });
}

function enter(state, pair, m, cfg) {
  const id = pairId(pair);
  const price = n(pair.priceUsd);
  state.open[id] = {
    id,
    symbol: pair.baseToken.symbol,
    name: pair.baseToken?.name ? pair.baseToken.name : "",
    url: pair.url,
    entry: price,
    last: price,
    peak: price,
    size: cfg.tradeUsd,
    opened: Date.now(),
    scales: 0,
    lastScalePrice: price,
    letRun: false,
    score: m.score
  };
  logDecision(state, { action: "enter", symbol: state.open[id].symbol, score: m.score, price });
}

export function managePositions(state, pairs, cfg = CONFIG) {
  const byId = new Map(pairs.map((pair) => [pairId(pair), pair]));
  for (const [id, pos] of Object.entries(state.open)) {
    if (!requiredPositionOk(pos)) {
      delete state.open[id];
      state.closed.unshift({ ...pos, reason: "invalid_position_state", closed: Date.now() });
      logDecision(state, { action: "invalid", symbol: pos?.symbol, reason: "invalid_position_state" });
      continue;
    }

    const pair = byId.get(id);
    if (!pair) {
      if (Date.now() - pos.opened >= cfg.maxHoldMs) close(state, id, null, "stale_no_quote");
      continue;
    }

    const price = n(pair.priceUsd);
    if (!good(price) || price <= 0) {
      logDecision(state, { action: "skip_manage", symbol: pos.symbol, reason: "missing_price" });
      continue;
    }

    pos.last = price;
    pos.peak = Math.max(pos.peak, price);
    const pnl = pct(price, pos.entry);
    const ageMs = Date.now() - pos.opened;
    const dropFromLastBuy = pct(price, pos.lastScalePrice);

    if (dropFromLastBuy <= -cfg.scaleDropPct && pos.scales < cfg.maxScales) {
      const add = cfg.tradeUsd * Math.pow(cfg.scaleRatio, pos.scales + 1);
      pos.entry = ((pos.entry * pos.size) + (price * add)) / (pos.size + add);
      pos.size += add;
      pos.scales += 1;
      pos.lastScalePrice = price;
      logDecision(state, { action: "scale", symbol: pos.symbol, price, scales: pos.scales });
      continue;
    }

    if (!pos.letRun && pnl >= cfg.takeProfitPct && ageMs <= cfg.letRunWindowMs) {
      pos.letRun = true;
      logDecision(state, { action: "let_run", symbol: pos.symbol, pnlPct: pnl });
    } else if (!pos.letRun && pnl >= cfg.takeProfitPct) {
      close(state, id, price, "take_profit");
    } else if (pos.letRun && pnl <= 0) {
      close(state, id, price, "breakeven_stop");
    } else if (!pos.letRun && pnl <= -cfg.stopLossPct) {
      close(state, id, price, "stop_loss");
    } else if (ageMs >= (pos.letRun ? cfg.letRunMaxMs : cfg.maxHoldMs)) {
      close(state, id, price, "max_hold");
    }
  }
}

export function evaluateEntries(state, pairs, cfg = CONFIG) {
  const ranked = pairs
    .map((pair) => ({ pair, metrics: score(pair, cfg) }))
    .sort((a, b) => b.metrics.score - a.metrics.score);

  const candidates = [];
  for (const item of ranked) {
    const reasons = rejectReasons(item.pair, item.metrics, state, cfg);
    const candidate = {
      id: pairId(item.pair),
      symbol: item.pair.baseToken?.symbol ? item.pair.baseToken.symbol : "",
      name: item.pair.baseToken?.name ? item.pair.baseToken.name : "",
      url: item.pair.url,
      price: good(item.pair.priceUsd) ? n(item.pair.priceUsd) : null,
      metrics: item.metrics,
      accepted: reasons.length === 0,
      reasons
    };
    candidates.push(candidate);
    logDecision(state, { action: candidate.accepted ? "accept" : "reject", symbol: candidate.symbol, score: item.metrics.score, reasons });
    if (candidate.accepted) enter(state, item.pair, item.metrics, cfg);
  }
  return candidates.slice(0, 20);
}

export function summarize(state, pairs, cfg = CONFIG) {
  managePositions(state, pairs, cfg);
  const candidates = evaluateEntries(state, pairs, cfg);
  recordPrices(state, pairs, cfg);
  state.lastScan = {
    at: new Date().toISOString(),
    pairs: pairs.length,
    open: Object.keys(state.open).length,
    closed: state.closed.length,
    candidates
  };
  return state;
}
