import "dotenv/config";
import express from "express";
import path from "node:path";
import { CONFIG, summarize } from "./bot.js";
import { getSolanaPairs } from "./dex.js";
import { loadState, saveState } from "./state.js";
import { walletSummary } from "./wallet.js";

const STATE_FILE = "data/state.json";
const PORT = 8795;
let state = await loadState(STATE_FILE);
let running = false;

async function tick() {
  if (running) return;
  running = true;
  try {
    const pairs = await getSolanaPairs(CONFIG.profileLimit);
    await summarize(state, pairs);
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
app.use(express.static(path.resolve("public")));
app.get("/api/status", async (_req, res) => {
  let wallet = { configured: false, address: null, sol: null };
  try {
    wallet = await walletSummary();
  } catch (error) {
    wallet = { configured: true, address: null, sol: null, error: error.message };
  }
  res.json({
    config: CONFIG,
    wallet,
    state: {
      open: state.open || {},
      closed: (state.closed || []).slice(0, 300),
      decisions: (state.decisions || []).slice(0, 300),
      lastScan: state.lastScan || null,
      lastError: state.lastError || null
    }
  });
});

tick();
setInterval(tick, CONFIG.scanMs);
app.listen(PORT, "127.0.0.1", () => console.log(`axiombot ${PORT}`));
