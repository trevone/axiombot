import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_STATE = {
  seenTokens: {},
  positions: {},
  closedPositions: []
};

export async function loadState(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    return {
      ...EMPTY_STATE,
      ...JSON.parse(raw)
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return structuredClone(EMPTY_STATE);
    }

    throw error;
  }
}

export async function saveState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

export function tokenKey(token) {
  return `${token.chainId}:${token.tokenAddress}`.toLowerCase();
}

export function pairKey(pair) {
  return `${pair.chainId}:${pair.pairAddress}`.toLowerCase();
}
