function ageMs(value, now = Date.now()) {
  if (!value) return null;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? Math.max(0, now - time) : null;
}

function isPositiveNumber(value) {
  return Number.isFinite(Number(value)) && Number(value) > 0;
}

export function buildHealth(state, config, now = Date.now()) {
  const issues = [];
  const warnings = [];
  const lastScan = state.lastScan || null;
  const openPositions = Object.values(state.openPositions || {});
  const closedPositions = state.closedPositions || [];
  const scanAgeMs = ageMs(lastScan?.scannedAt, now);

  if (!lastScan) {
    issues.push("missing_last_scan");
  } else {
    if (lastScan.mode !== "paper") issues.push("unexpected_mode");
    if (lastScan.source !== "dexscreener") issues.push("unexpected_source");
    if (!Number.isFinite(lastScan.profilesScanned) || lastScan.profilesScanned <= 0) {
      issues.push("no_profiles_scanned");
    }
    if (!Number.isFinite(lastScan.pairsFound) || lastScan.pairsFound <= 0) {
      issues.push("no_pairs_found");
    }
    if (!Array.isArray(lastScan.topCandidates) || lastScan.topCandidates.length === 0) {
      warnings.push("no_candidates");
    }
    if (scanAgeMs !== null && scanAgeMs > config.health.staleScanMs) {
      issues.push("stale_scan");
    }
  }

  if (openPositions.length > config.health.maxOpenPositions) {
    issues.push("too_many_open_positions");
  }

  for (const position of openPositions) {
    if (position.mode !== "paper") issues.push("non_paper_position");
    if (!position.id || !position.pairAddress || !position.tokenAddress) issues.push("malformed_position");
    if (!isPositiveNumber(position.entryPriceUsd)) issues.push("invalid_entry_price");
    if (!isPositiveNumber(position.sizeUsd)) issues.push("invalid_position_size");
    if (!isPositiveNumber(position.takeProfitPct)) issues.push("invalid_take_profit");
    if (!isPositiveNumber(position.stopLossPct)) issues.push("invalid_stop_loss");
    if (!isPositiveNumber(position.lastPriceUsd || position.entryPriceUsd)) issues.push("missing_last_price");
  }

  const closedPnlUsd = closedPositions.reduce((total, position) => {
    const pnl = Number(position.realizedPnlUsd || 0);
    return Number.isFinite(pnl) ? total + pnl : total;
  }, 0);

  return {
    ok: issues.length === 0,
    status: issues.length === 0 ? "sane" : "attention",
    checkedAt: new Date(now).toISOString(),
    issues: Array.from(new Set(issues)),
    warnings: Array.from(new Set(warnings)),
    scanner: {
      mode: lastScan?.mode || null,
      source: lastScan?.source || null,
      lastScanAt: lastScan?.scannedAt || null,
      scanAgeMs,
      staleScanMs: config.health.staleScanMs,
      profilesScanned: lastScan?.profilesScanned ?? null,
      pairsFound: lastScan?.pairsFound ?? null,
      candidates: lastScan?.topCandidates?.length ?? 0
    },
    trades: {
      open: openPositions.length,
      closed: closedPositions.length,
      openedLastScan: lastScan?.openedPositions?.length ?? 0,
      closedLastScan: lastScan?.closedPositions?.length ?? 0,
      maxOpenPositions: config.health.maxOpenPositions,
      closedPnlUsd: Number(closedPnlUsd.toFixed(2))
    }
  };
}
