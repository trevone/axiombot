import { AxiomApiClient } from "./axiom-api.js";
import {
  assertAutomationConfig,
  assertBaseConfig,
  assertScannerConfig,
  loadConfig,
  parseInputData
} from "./config.js";
import { runScannerDaemon, scanOnce } from "./scanner.js";
import { loadState } from "./state.js";

const VALID_COMMANDS = new Set([
  "scan",
  "daemon",
  "positions",
  "axiom:list",
  "axiom:trigger",
  "axiom:status",
  "axiom:run"
]);

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function main() {
  const command = process.argv[2] || "scan";

  if (!VALID_COMMANDS.has(command)) {
    throw new Error(`Unknown command "${command}". Use one of: ${Array.from(VALID_COMMANDS).join(", ")}`);
  }

  const config = loadConfig();

  if (command === "scan") {
    assertScannerConfig(config);
    printJson(await scanOnce(config));
    return;
  }

  if (command === "daemon") {
    assertScannerConfig(config);
    await runScannerDaemon(config);
    return;
  }

  if (command === "positions") {
    const state = await loadState(config.stateFile);
    printJson({
      open: Object.values(state.positions),
      closed: state.closedPositions
    });
    return;
  }

  assertBaseConfig(config);

  const axiom = new AxiomApiClient({
    apiKey: config.axiomApiKey,
    baseUrl: config.apiBaseUrl
  });

  if (command === "axiom:list") {
    printJson(await axiom.listAutomations());
    return;
  }

  assertAutomationConfig(config);

  if (command === "axiom:status") {
    printJson(await axiom.getRunData(config.automationName));
    return;
  }

  const inputData = parseInputData(config);
  const triggerResult = await axiom.triggerAutomation(config.automationName, inputData);
  printJson(triggerResult);

  if (command === "axiom:run") {
    const runResult = await axiom.waitForRun(config.automationName, {
      pollIntervalMs: config.pollIntervalMs,
      timeoutMs: config.pollTimeoutMs
    });

    printJson(runResult);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
