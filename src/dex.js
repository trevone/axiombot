const BASE = "https://api.dexscreener.com";

export function pairId(pair) {
  if (!pair?.chainId || !pair?.pairAddress) throw new Error("pair_missing_id");
  return `${pair.chainId}:${pair.pairAddress}`.toLowerCase();
}

export async function getSolanaPairs(limit) {
  const profilesRes = await fetch(`${BASE}/token-profiles/latest/v1`);
  if (!profilesRes.ok) throw new Error(`profiles_http_${profilesRes.status}`);

  const profiles = (await profilesRes.json())
    .filter((profile) => profile.chainId === "solana" && profile.tokenAddress)
    .slice(0, limit);

  const pairs = [];
  for (const profile of profiles) {
    const pairRes = await fetch(`${BASE}/latest/dex/tokens/${profile.tokenAddress}`);
    if (!pairRes.ok) throw new Error(`pairs_http_${pairRes.status}`);
    const body = await pairRes.json();
    if (!Array.isArray(body.pairs)) throw new Error("pairs_missing");
    for (const pair of body.pairs) {
      if (pair.chainId === "solana" && pair.pairAddress) pairs.push(pair);
    }
  }

  return pairs;
}
