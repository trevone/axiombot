import express from "express";
import { assertConfig, loadConfig } from "./config.js";
import { lockControl, requireControl, unlockControl, controlStatus } from "./control-lock.js";
import { scanOnce } from "./scanner.js";
import { loadState } from "./state/store.js";
import {
  getStrategyConfig,
  getStrategyConfigSchema,
  updateStrategyConfig
} from "./strategy/config-store.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scannerLoop() {
  while (true) {
    const config = loadConfig();
    assertConfig(config);
    const result = await scanOnce(config);
    console.log(JSON.stringify(result));
    await sleep(config.scanner.intervalMs);
  }
}

function startScannerLoop() {
  scannerLoop().catch((error) => {
    console.error(error);
    setTimeout(startScannerLoop, 5_000);
  });
}

export function createServer() {
  const app = express();
  app.use(express.json({ limit: "64kb" }));

  app.get("/api/status", async (_req, res, next) => {
    try {
      const config = loadConfig();
      const state = await loadState(config.state.file);
      res.json({
        ok: true,
        state,
        health: state.health || null,
        strategyConfig: getStrategyConfig(),
        strategySchema: getStrategyConfigSchema()
      });
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/strategy-config", (_req, res) => {
    res.json({
      config: getStrategyConfig(),
      schema: getStrategyConfigSchema()
    });
  });

  app.post("/api/strategy-config", requireControl, (req, res) => {
    res.json({
      config: updateStrategyConfig(req.body || {}),
      schema: getStrategyConfigSchema()
    });
  });

  app.get("/api/hud-control/status", (_req, res) => {
    res.json(controlStatus());
  });

  app.post("/api/hud-control/unlock", (req, res) => {
    const result = unlockControl(req.body?.pin);
    res.status(result.ok ? 200 : 401).json(result);
  });

  app.post("/api/hud-control/lock", (req, res) => {
    res.json(lockControl(req.get("X-HUD-Control-Token")));
  });

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: error.message || "server_error" });
  });

  return app;
}

export function startServer() {
  const port = Number(process.env.PORT || 8795);
  startScannerLoop();
  createServer().listen(port, "127.0.0.1", () => {
    console.log(`AxiomBot API listening on 127.0.0.1:${port}`);
  });
}

if (process.argv[1] && process.argv[1].endsWith("server.js")) {
  startServer();
}
