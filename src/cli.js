import {
  assertConfig,
  assertWebSocketConfig,
  buildSolanaWebSocketUrl,
  loadConfig
} from "./config.js";
import { scanOnce } from "./scanner.js";
import { loadState } from "./state/store.js";
import { testSolanaWebSocket } from "./ws/solana-ws.js";

const COMMANDS = new Set(["scan", "daemon", "positions", "ws:test"]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export async function runCli(argv = process.argv) {
  const command = argv[2] || "scan";

  if (!COMMANDS.has(command)) {
    throw new Error(`Unknown command "${command}". Use one of: ${Array.from(COMMANDS).join(", ")}`);
  }

  const config = loadConfig();

  if (command === "ws:test") {
    assertWebSocketConfig(config);
    printJson(
      await testSolanaWebSocket({
        url: buildSolanaWebSocketUrl(config),
        notificationsToReceive: config.websocket.testNotifications,
        timeoutMs: config.websocket.testTimeoutMs,
        pingIntervalMs: config.websocket.pingIntervalMs
      })
    );
    return;
  }

  assertConfig(config);

  if (command === "positions") {
    const state = await loadState(config.state.file);
    printJson({
      open: Object.values(state.openPositions),
      closed: state.closedPositions
    });
    return;
  }

  if (command === "scan") {
    printJson(await scanOnce(config));
    return;
  }

  while (true) {
    printJson(await scanOnce(config));
    await sleep(config.scanner.intervalMs);
  }
}
