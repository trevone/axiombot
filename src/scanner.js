import { DexScreenerClient, selectBestPairForToken } from "./dexscreener.js";
import { enterPaperPosition, updateOpenPositions } from "./paper-trader.js";
import { isCandidateAllowed, scorePair } from "./scoring.js";
import { loadState, pairKey, saveState, tokenKey } from "./state.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toPairsByKey(pairs) {
  const pairsByKey = new Map();

  for (const pair of pairs) {
    if (pair?.chainId && pair?.pairAddress) {
      pairsByKey.set(pairKey(pair), pair);
    }
  }

  return pairsByKey;
}

function summarizePosition(position) {
  return {
    symbol: position.symbol,
    chainId: position.chainId,
    entryPriceUsd: position.entryPriceUsd,
    sizeUsd: position.sizeUsd,
    score: position.score,
    url: position.url
  };
}

export async function scanOnce(config) {
  const client = new DexScreenerClient({ baseUrl: config.dexScreenerBaseUrl });
  const state = await loadState(config.stateFile);

  const latestProfiles = await client.getLatestTokenProfiles();
  const scopedProfiles = latestProfiles
    .filter((token) => config.scannerChains.includes(token.chainId))
    .slice(0, config.maxTokensPerScan);

  const pairs = await client.getPairsForTokens(scopedProfiles);
  const pairsByKey = toPairsByKey(pairs);
  const closedPositions = updateOpenPositions(state, pairsByKey, config);
  const candidates = [];
  const openedPositions = [];

  for (const token of scopedProfiles) {
    const key = tokenKey(token);
    const bestPair = selectBestPairForToken(token, pairs);

    state.seenTokens[key] = state.seenTokens[key] || {
      firstSeenAt: new Date().toISOString(),
      chainId: token.chainId,
      tokenAddress: token.tokenAddress,
      url: token.url
    };

    if (!bestPair) {
      continue;
    }

    const score = scorePair(bestPair, config);
    const candidate = {
      key,
      chainId: token.chainId,
      tokenAddress: token.tokenAddress,
      pairAddress: bestPair.pairAddress,
      dexId: bestPair.dexId,
      symbol: bestPair.baseToken?.symbol,
      name: bestPair.baseToken?.name,
      priceUsd: Number(bestPair.priceUsd),
      url: bestPair.url || token.url,
      score
    };

    candidates.push(candidate);

    if (isCandidateAllowed(bestPair, score, config)) {
      const position = enterPaperPosition(state, bestPair, token, score, config);

      if (position) {
        openedPositions.push(position);
      }
    }
  }

  candidates.sort((a, b) => b.score.score - a.score.score);

  await saveState(config.stateFile, state);

  return {
    scannedAt: new Date().toISOString(),
    source: "dexscreener",
    profilesScanned: scopedProfiles.length,
    pairsFound: pairs.length,
    topCandidates: candidates.slice(0, 10),
    openedPositions: openedPositions.map(summarizePosition),
    closedPositions
  };
}

export async function runScannerDaemon(config) {
  while (true) {
    const result = await scanOnce(config);
    console.log(JSON.stringify(result, null, 2));
    await sleep(config.scanIntervalMs);
  }
}
