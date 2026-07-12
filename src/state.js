import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export function emptyState() {
  return {
    open: {},
    closed: [],
    decisions: [],
    lastScan: null
  };
}

export async function loadState(filePath) {
  try {
    return { ...emptyState(), ...JSON.parse(await readFile(filePath, "utf8")) };
  } catch (error) {
    if (error.code === "ENOENT") return emptyState();
    throw error;
  }
}

export async function saveState(filePath, state) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(state, null, 2)}\n`);
}

export function logDecision(state, event) {
  state.decisions.unshift({ at: new Date().toISOString(), ...event });
  state.decisions = state.decisions.slice(0, 300);
}
