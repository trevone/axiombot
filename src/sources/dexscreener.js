function chunk(values, size) {
  const chunks = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}

async function getJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`DexScreener request failed (${response.status}): ${body}`);
  }

  return response.json();
}

export class DexScreenerSource {
  constructor({ baseUrl }) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getLatestProfiles() {
    return getJson(`${this.baseUrl}/token-profiles/latest/v1`);
  }

  async getPairsForProfiles(profiles) {
    const profilesByChain = new Map();

    for (const profile of profiles) {
      if (!profile.chainId || !profile.tokenAddress) continue;

      const chainProfiles = profilesByChain.get(profile.chainId) || [];
      chainProfiles.push(profile.tokenAddress);
      profilesByChain.set(profile.chainId, chainProfiles);
    }

    const pairs = [];

    for (const [chainId, addresses] of profilesByChain.entries()) {
      const uniqueAddresses = Array.from(new Set(addresses));

      for (const addressChunk of chunk(uniqueAddresses, 30)) {
        const url = `${this.baseUrl}/tokens/v1/${encodeURIComponent(chainId)}/${addressChunk
          .map(encodeURIComponent)
          .join(",")}`;
        const result = await getJson(url);

        if (Array.isArray(result)) {
          pairs.push(...result);
        }
      }
    }

    return pairs;
  }
}

export function bestPairForProfile(profile, pairs) {
  const tokenAddress = profile.tokenAddress.toLowerCase();

  return pairs
    .filter((pair) => {
      const base = pair.baseToken?.address?.toLowerCase();
      const quote = pair.quoteToken?.address?.toLowerCase();
      return base === tokenAddress || quote === tokenAddress;
    })
    .sort((a, b) => {
      const liquidityDelta = Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0);
      if (liquidityDelta !== 0) return liquidityDelta;
      return Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0);
    })[0];
}
