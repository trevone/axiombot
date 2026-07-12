import { CONFIG, summarize } from "./bot.js";
import { getSolanaPairs } from "./dex.js";
import { loadState, saveState } from "./state.js";

const STATE_FILE = "data/state.json";

const state = await loadState(STATE_FILE);
const pairs = await getSolanaPairs(CONFIG.profileLimit);
summarize(state, pairs);
await saveState(STATE_FILE, state);
console.log(JSON.stringify(state.lastScan, null, 2));
