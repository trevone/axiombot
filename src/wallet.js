import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { readFileSync } from "node:fs";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

let keypair;

export function loadWallet() {
  if (keypair) return keypair;
  if (process.env.BS58_PRIVATE_KEY) {
    keypair = Keypair.fromSecretKey(bs58.decode(process.env.BS58_PRIVATE_KEY));
    return keypair;
  }
  if (process.env.SOLANA_KEYPAIR_FILE) {
    const bytes = JSON.parse(readFileSync(process.env.SOLANA_KEYPAIR_FILE, "utf8"));
    keypair = Keypair.fromSecretKey(new Uint8Array(bytes));
    return keypair;
  }
  return null;
}

export function walletAddress() {
  return loadWallet()?.publicKey.toBase58() || null;
}

export function connection() {
  return new Connection(process.env.SOLANA_RPC_URL || "https://api.mainnet-beta.solana.com", "confirmed");
}

export async function walletSummary() {
  const wallet = loadWallet();
  if (!wallet) return { configured: false, address: null, sol: null };
  const lamports = await connection().getBalance(wallet.publicKey);
  return { configured: true, address: wallet.publicKey.toBase58(), sol: lamports / LAMPORTS_PER_SOL };
}
