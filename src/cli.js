import { assertConfig, loadConfig } from "./config.js";
import { scanOnce } from "./scanner.js";
import { loadState } from "./state/store.js";

const COMMANDS = new Set(["scan", "daemon", "positions"]);

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
