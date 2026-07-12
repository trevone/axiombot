import { MINTS, swap, usdToLamports } from "./jupiter.js";

export function tradingMode() {
  return process.env.TRADING_MODE === "live" ? "live" : "paper";
}

export function tokenMint(pair) {
  const mint = pair.baseToken?.address;
  if (!mint) throw new Error("missing_token_mint");
  return mint;
}

export function createTrader() {
  const mode = tradingMode();
  return {
    mode,
    async buy(pair, usd) {
      if (mode !== "live") return null;
      const mint = tokenMint(pair);
      return swap({
        inputMint: MINTS.SOL,
        outputMint: mint,
        amountRaw: usdToLamports(pair, usd)
      });
    },
    async sell(pos, amountRaw) {
      if (mode !== "live") return null;
      if (!pos.tokenMint) throw new Error("missing_position_token_mint");
      return swap({
        inputMint: pos.tokenMint,
        outputMint: MINTS.SOL,
        amountRaw
      });
    }
  };
}

export function rawPercent(raw, pct) {
  return String((BigInt(raw) * BigInt(Math.floor(pct * 100))) / 10_000n);
}
