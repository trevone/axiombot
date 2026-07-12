import express from "express";
import { CONFIG, summarize } from "./bot.js";
import { getSolanaPairs } from "./dex.js";
import { loadState, saveState } from "./state.js";

const STATE_FILE = "data/state.json";
const PORT = 8795;
let state = await loadState(STATE_FILE);
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const pairs = await getSolanaPairs(CONFIG.profileLimit);
    summarize(state, pairs);
    await saveState(STATE_FILE, state);
    console.log(JSON.stringify(state.lastScan));
  } catch (error) {
    state.lastError = { at: new Date().toISOString(), message: error.message };
    console.error(error);
  } finally {
    running = false;
  }
}

const app = express();
app.get("/api/status", (_req, res) => res.json({ config: CONFIG, state }));

tick();
setInterval(tick, CONFIG.scanMs);
app.listen(PORT, "127.0.0.1", () => console.log(`axiombot ${PORT}`));
