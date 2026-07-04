export function buildCandidate(profile, pair, momentum) {
  return {
    id: `${profile.chainId}:${profile.tokenAddress}`.toLowerCase(),
    chainId: profile.chainId,
    tokenAddress: profile.tokenAddress,
    pairAddress: pair.pairAddress,
    dexId: pair.dexId,
    symbol: pair.baseToken?.symbol || "",
    name: pair.baseToken?.name || "",
    priceUsd: Number(pair.priceUsd),
    url: pair.url || profile.url,
    momentum
  };
}

export function sortCandidates(candidates) {
  return [...candidates].sort((a, b) => b.momentum.score - a.momentum.score);
}
