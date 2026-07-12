import { LAMPORTS_PER_SOL, VersionedTransaction } from "@solana/web3.js";
import { loadWallet, SOL_MINT, walletAddress } from "./wallet.js";

const BASE_URL = "https://api.jup.ag/swap/v2";

function headers(json = false) {
  const out = {};
  if (json) out["Content-Type"] = "application/json";
  if (process.env.JUPITER_API_KEY) out["x-api-key"] = process.env.JUPITER_API_KEY;
  return out;
}

function impliedSolUsd(pair) {
  const usd = Number(pair.priceUsd);
  const native = Number(pair.priceNative);
  if (!Number.isFinite(usd) || !Number.isFinite(native) || usd <= 0 || native <= 0) {
    throw new Error("missing_price_native");
  }
  return usd / native;
}

export function usdToLamports(pair, usd) {
  return String(Math.max(1, Math.floor((Number(usd) / impliedSolUsd(pair)) * LAMPORTS_PER_SOL)));
}

export async function swap({ inputMint, outputMint, amountRaw }) {
  const signer = loadWallet();
  if (!signer) throw new Error("wallet_not_configured");

  const params = new URLSearchParams({
    inputMint,
    outputMint,
    amount: String(amountRaw),
    taker: walletAddress()
  });
  const orderRes = await fetch(`${BASE_URL}/order?${params}`, { headers: headers() });
  if (!orderRes.ok) throw new Error(`jupiter_order_http_${orderRes.status}_${await orderRes.text()}`);

  const order = await orderRes.json();
  if (!order.transaction) throw new Error(`jupiter_order_empty_${order.router || "unknown"}_${order.errorCode || "no_code"}`);

  const tx = VersionedTransaction.deserialize(Buffer.from(order.transaction, "base64"));
  tx.sign([signer]);
  const signedTransaction = Buffer.from(tx.serialize()).toString("base64");

  const executeRes = await fetch(`${BASE_URL}/execute`, {
    method: "POST",
    headers: headers(true),
    body: JSON.stringify({ signedTransaction, requestId: order.requestId })
  });
  if (!executeRes.ok) throw new Error(`jupiter_execute_http_${executeRes.status}_${await executeRes.text()}`);

  const result = await executeRes.json();
  if (result.status !== "Success") throw new Error(`jupiter_execute_failed_${result.code}_${result.error || "no_error"}`);

  return {
    signature: result.signature,
    requestId: order.requestId,
    router: order.router,
    inputMint,
    outputMint,
    inputAmountRaw: result.totalInputAmount,
    outputAmountRaw: result.totalOutputAmount
  };
}

export const MINTS = { SOL: SOL_MINT };
