import { pairKey } from "../state/store.js";

function minutesSince(value, now = Date.now()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, (now - time) / 60_000) : null;
}

function countEntriesForPair(state, key) {
  const closedEntries = (state.closedPositions || []).filter((position) => position.id === key).length;
  return closedEntries + (state.openPositions?.[key] ? 1 : 0);
}

function lastClosedForPair(state, key) {
  return (state.closedPositions || []).find((position) => position.id === key) || null;
}

export function evaluatePortfolioEntry(state, pair, strategyConfig, now = Date.now()) {
  const key = pairKey(pair);
  const skipReasons = [];
  const openCount = Object.keys(state.openPositions || {}).length;
  const entryCount = countEntriesForPair(state, key);
  const lastClosed = lastClosedForPair(state, key);
  const minutesSinceClose = minutesSince(lastClosed?.exitAt, now);

  if (state.openPositions?.[key]) skipReasons.push("already_open");
  if (openCount >= strategyConfig.maxOpenPositions) skipReasons.push("max_open_positions");
  if (entryCount >= strategyConfig.maxEntriesPerPair) skipReasons.push("max_entries_for_pair");
  if (minutesSinceClose !== null && minutesSinceClose < strategyConfig.cooldownAfterCloseMinutes) {
    skipReasons.push("pair_cooldown");
  }

  return {
    allowed: skipReasons.length === 0,
    skipReasons,
    openCount,
    entryCount,
    minutesSinceClose
  };
}
