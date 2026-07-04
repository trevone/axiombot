import { buildHealth } from "./health.js";
import { buildCandidate, sortCandidates } from "./risk/filters.js";
import { DexScreenerSource, bestPairForProfile } from "./sources/dexscreener.js";
import { loadState, pairKey, saveJson, saveState, tokenKey } from "./state/store.js";
import { scoreMomentum, shouldEnter } from "./strategy/momentum.js";
import { enterPaperTrade, updatePaperTrades } from "./trading/paper.js";

function mapPairsByKey(pairs) {
  const pairsByKey = new Map();

  for (const pair of pairs) {
    if (pair?.chainId && pair?.pairAddress) {
      pairsByKey.set(pairKey(pair), pair);
    }
  }

  return pairsByKey;
}

export async function scanOnce(config) {
  const state = await loadState(config.state.file);
  const source = new DexScreenerSource({
    baseUrl: config.source.dexScreenerBaseUrl
  });

  const profiles = (await source.getLatestProfiles())
    .filter((profile) => config.source.chains.includes(profile.chainId))
    .slice(0, config.source.maxTokensPerScan);

  const pairs = await source.getPairsForProfiles(profiles);
  const pairsByKey = mapPairsByKey(pairs);
  const closedPositions = updatePaperTrades(state, pairsByKey);

  const candidates = [];
  const openedPositions = [];

  for (const profile of profiles) {
    const key = tokenKey(profile);
    state.seenTokens[key] ||= {
      firstSeenAt: new Date().toISOString(),
      chainId: profile.chainId,
      tokenAddress: profile.tokenAddress,
      url: profile.url
    };

    const pair = bestPairForProfile(profile, pairs);
    if (!pair) continue;

    const momentum = scoreMomentum(pair, config.strategy);
    const candidate = buildCandidate(profile, pair, momentum);
    candidates.push(candidate);

    if (shouldEnter(pair, momentum, config.strategy)) {
      const position = enterPaperTrade(state, profile, pair, momentum, config.paper);
      if (position) openedPositions.push(position);
    }
  }

  const result = {
    scannedAt: new Date().toISOString(),
    mode: "paper",
    source: "dexscreener",
    profilesScanned: profiles.length,
    pairsFound: pairs.length,
    topCandidates: sortCandidates(candidates).slice(0, 10),
    openedPositions,
    closedPositions
  };

  state.lastScan = {
    scannedAt: result.scannedAt,
    mode: result.mode,
    source: result.source,
    profilesScanned: result.profilesScanned,
    pairsFound: result.pairsFound,
    topCandidates: result.topCandidates,
    openedPositions: result.openedPositions,
    closedPositions: result.closedPositions
  };

  state.health = buildHealth(state, config);

  await saveState(config.state.file, state);
  await saveJson(config.state.healthFile, state.health);

  return result;
}
