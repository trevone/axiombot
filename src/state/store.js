import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const EMPTY_STATE = {
  seenTokens: {},
  openPositions: {},
  closedPositions: [],
  lastScan: null,
  account: null
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

export async function saveJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function tokenKey(profile) {
  return `${profile.chainId}:${profile.tokenAddress}`.toLowerCase();
}

export function pairKey(pair) {
  return `${pair.chainId}:${pair.pairAddress}`.toLowerCase();
}
