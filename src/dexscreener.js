const DEFAULT_BASE_URL = "https://api.dexscreener.com";

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

export class DexScreenerClient {
  constructor({ baseUrl = DEFAULT_BASE_URL } = {}) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async getLatestTokenProfiles() {
    return getJson(`${this.baseUrl}/token-profiles/latest/v1`);
  }

  async getPairsForTokens(tokens) {
    const pairs = [];
    const tokensByChain = new Map();

    for (const token of tokens) {
      if (!token.chainId || !token.tokenAddress) {
        continue;
      }

      const chainTokens = tokensByChain.get(token.chainId) || [];
      chainTokens.push(token.tokenAddress);
      tokensByChain.set(token.chainId, chainTokens);
    }

    for (const [chainId, addresses] of tokensByChain.entries()) {
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

export function selectBestPairForToken(token, pairs) {
  const tokenAddress = token.tokenAddress.toLowerCase();
  const matchingPairs = pairs.filter((pair) => {
    const base = pair.baseToken?.address?.toLowerCase();
    const quote = pair.quoteToken?.address?.toLowerCase();
    return base === tokenAddress || quote === tokenAddress;
  });

  return matchingPairs.sort((a, b) => {
    const liquidityDelta = Number(b.liquidity?.usd || 0) - Number(a.liquidity?.usd || 0);

    if (liquidityDelta !== 0) {
      return liquidityDelta;
    }

    return Number(b.volume?.h24 || 0) - Number(a.volume?.h24 || 0);
  })[0];
}
