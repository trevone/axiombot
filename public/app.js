const stateUrl = "state.json";
const controlTokenKey = "axiombot-control-token";
const refreshMs = 15_000;

const elements = {
  status: document.querySelector("#status-pill"),
  refresh: document.querySelector("#refresh-button"),
  lastScan: document.querySelector("#last-scan"),
  profilesScanned: document.querySelector("#profiles-scanned"),
  pairsFound: document.querySelector("#pairs-found"),
  openCount: document.querySelector("#open-count"),
  closedCount: document.querySelector("#closed-count"),
  candidateCount: document.querySelector("#candidate-count"),
  candidates: document.querySelector("#candidates"),
  openPositions: document.querySelector("#open-positions"),
  closedPositions: document.querySelector("#closed-positions")
};
elements.strategyControls = document.querySelector("#strategy-controls");
elements.strategyUnlock = document.querySelector("#strategy-unlock");
elements.strategySave = document.querySelector("#strategy-save");
elements.strategyMessage = document.querySelector("#strategy-message");

const strategyGroups = [
  {
    title: "Entry",
    keys: [
      "MAX_OPEN_POSITIONS",
      "MAX_ENTRIES_PER_PAIR",
      "COOLDOWN_AFTER_CLOSE_MINUTES",
      "MIN_LIQUIDITY_USD",
      "MIN_VOLUME_M5_USD",
      "MIN_BUYS_M5",
      "MIN_BUY_SELL_RATIO",
      "MIN_PRICE_CHANGE_M5_PCT",
      "MAX_PRICE_CHANGE_M5_PCT",
      "MIN_SCORE_TO_ENTER",
      "MAX_PAIR_AGE_MINUTES",
      "REQUIRE_LIQUIDITY",
      "ALLOWED_DEXES"
    ]
  },
  {
    title: "Sizing",
    keys: [
      "PAPER_STARTING_BALANCE_USD",
      "BASE_POSITION_BALANCE_PCT",
      "MIN_POSITION_USD",
      "MAX_POSITION_USD",
      "POSITION_MULTIPLIER_INITIAL",
      "POSITION_MULTIPLIER_DRAWDOWN",
      "POSITION_MULTIPLIER_DRAWDOWN_MAX_PCT"
    ]
  },
  {
    title: "Double Down",
    keys: [
      "SCALE_IN_ENABLED",
      "SCALE_IN_MAX_DOUBLES",
      "SCALE_IN_DROP_FROM_LAST_PCT",
      "SCALE_IN_SIZE_RATIO"
    ]
  },
  {
    title: "Exits",
    keys: [
      "TAKE_PROFIT_MAX_PCT",
      "TAKE_PROFIT_MIN_PCT",
      "TAKE_PROFIT_MAP_MINUTES",
      "STOP_LOSS_PCT",
      "TRAILING_STOP_PCT",
      "TRAILING_STOP_ACTIVATION_PCT",
      "MAX_HOLD_MINUTES"
    ]
  }
];

let strategyConfig = {};
let strategySchema = {};
let strategyPatch = {};

function formatCurrency(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: number >= 1 ? 2 : 8
  }).format(number);
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "-";
  return `${number.toFixed(2)}%`;
}

function formatTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value) {
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) ? url.toString() : "#";
  } catch {
    return "#";
  }
}

function setStatus(text, className = "") {
  elements.status.textContent = text;
  elements.status.className = `status-pill ${className}`.trim();
}

function apiHeaders() {
  const token = sessionStorage.getItem(controlTokenKey);
  return {
    "Content-Type": "application/json",
    ...(token ? { "X-HUD-Control-Token": token } : {})
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      ...apiHeaders(),
      ...(options.headers || {})
    }
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(body?.error || body?.reason || `HTTP ${response.status}`);
  }

  return body;
}

function empty(message) {
  const node = document.createElement("div");
  node.className = "empty";
  node.textContent = message;
  return node;
}

function detail(label, value, extraClass = "") {
  const node = document.createElement("div");
  node.className = "detail";
  node.innerHTML = `<span>${label}</span><strong class="${extraClass}">${value}</strong>`;
  return node;
}

function renderCandidates(candidates) {
  elements.candidates.replaceChildren();
  elements.candidateCount.textContent = `${candidates.length} tracked`;

  if (candidates.length === 0) {
    elements.candidates.append(empty("No candidates in the latest scan yet."));
    return;
  }

  for (const candidate of candidates) {
    const item = document.createElement("article");
    item.className = "item";

    const reasons = candidate.momentum.reasons
      .map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`)
      .join("");

    item.innerHTML = `
      <div class="item-head">
        <div>
          <div class="symbol">${escapeHtml(candidate.symbol || "Unknown")}</div>
          <div class="name">${escapeHtml(candidate.name || candidate.tokenAddress)}</div>
        </div>
        <div class="score">${candidate.momentum.score}</div>
      </div>
      <div class="details"></div>
      <a href="${safeUrl(candidate.url)}" target="_blank" rel="noreferrer">Open chart</a>
      <div class="reason-list">${reasons}</div>
    `;

    const details = item.querySelector(".details");
    details.append(
      detail("Price", formatCurrency(candidate.priceUsd)),
      detail("Liquidity", formatCurrency(candidate.momentum.liquidityUsd)),
      detail("5m Volume", formatCurrency(candidate.momentum.volumeM5Usd)),
      detail("5m Move", formatPercent(candidate.momentum.priceChangeM5Pct))
    );

    elements.candidates.append(item);
  }
}

function renderOpenPositions(positions) {
  elements.openPositions.replaceChildren();

  if (positions.length === 0) {
    elements.openPositions.append(empty("No open paper trades."));
    return;
  }

  for (const position of positions) {
    const pnl = Number(position.unrealizedPnlPct || 0);
    const pnlClass = pnl >= 0 ? "pnl-positive" : "pnl-negative";
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-head">
        <div>
          <div class="symbol">${escapeHtml(position.symbol || "Unknown")}</div>
          <div class="name">${escapeHtml(position.name || position.tokenAddress)}</div>
        </div>
        <div class="score">${position.score}</div>
      </div>
      <div class="details"></div>
      <a href="${safeUrl(position.url)}" target="_blank" rel="noreferrer">Open chart</a>
    `;

    const details = item.querySelector(".details");
    details.append(
      detail("Entry", formatCurrency(position.entryPriceUsd)),
      detail("Last", formatCurrency(position.lastPriceUsd || position.entryPriceUsd)),
      detail("PnL", formatPercent(pnl), pnlClass),
      detail("Size", formatCurrency(position.sizeUsd)),
      detail("TP", formatPercent(position.takeProfitPct)),
      detail("SL", formatPercent(-position.stopLossPct))
    );

    elements.openPositions.append(item);
  }
}

function renderClosedPositions(positions) {
  elements.closedPositions.replaceChildren();

  if (positions.length === 0) {
    elements.closedPositions.append(empty("No closed paper trades yet."));
    return;
  }

  for (const position of positions.slice(0, 20)) {
    const pnl = Number(position.realizedPnlPct || 0);
    const pnlClass = pnl >= 0 ? "pnl-positive" : "pnl-negative";
    const item = document.createElement("article");
    item.className = "item";
    item.innerHTML = `
      <div class="item-head">
        <div>
          <div class="symbol">${escapeHtml(position.symbol || "Unknown")}</div>
          <div class="name">${escapeHtml(position.exitReason || "closed")} at ${formatTime(position.exitAt)}</div>
        </div>
      </div>
      <div class="details"></div>
      <a href="${safeUrl(position.url)}" target="_blank" rel="noreferrer">Open chart</a>
    `;

    const details = item.querySelector(".details");
    details.append(
      detail("Entry", formatCurrency(position.entryPriceUsd)),
      detail("Exit", formatCurrency(position.exitPriceUsd)),
      detail("PnL", formatPercent(pnl), pnlClass),
      detail("USD", formatCurrency(position.realizedPnlUsd), pnlClass)
    );

    elements.closedPositions.append(item);
  }
}

function controlLabel(key) {
  return key
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function renderStrategyControls() {
  elements.strategyControls.replaceChildren();

  const numberRules = strategySchema.numberRules || {};
  const booleanRules = strategySchema.booleanRules || {};

  for (const group of strategyGroups) {
    const groupNode = document.createElement("section");
    groupNode.className = "settings-group";
    groupNode.innerHTML = `<h3>${escapeHtml(group.title)}</h3>`;

    for (const key of group.keys) {
      const setting = document.createElement("div");
      setting.className = "setting";
      const currentValue = strategyPatch[key] ?? strategyConfig[key];
      const label = document.createElement("label");
      label.textContent = controlLabel(key);
      label.htmlFor = `strategy-${key}`;
      setting.append(label);

      let input;

      if (booleanRules[key]) {
        input = document.createElement("select");
        input.innerHTML = `
          <option value="true">true</option>
          <option value="false">false</option>
        `;
        input.value = String(Boolean(currentValue));
      } else {
        input = document.createElement("input");
        input.type = numberRules[key] ? "number" : "text";
        input.value = currentValue ?? "";

        if (numberRules[key]) {
          const rule = numberRules[key];
          if (Number.isFinite(rule.min)) input.min = rule.min;
          if (Number.isFinite(rule.max)) input.max = rule.max;
          input.step = rule.integer ? "1" : "0.0001";
          input.inputMode = "decimal";
        }
      }

      input.id = `strategy-${key}`;
      input.dataset.key = key;
      input.disabled = !sessionStorage.getItem(controlTokenKey);
      input.addEventListener("change", () => {
        const value = booleanRules[key]
          ? input.value === "true"
          : numberRules[key]
            ? Number(input.value)
            : input.value;
        strategyPatch[key] = value;
        elements.strategySave.disabled = !sessionStorage.getItem(controlTokenKey);
      });

      setting.append(input);

      if (numberRules[key]) {
        const hint = document.createElement("small");
        const rule = numberRules[key];
        hint.textContent = `min ${rule.min} / max ${rule.max}`;
        setting.append(hint);
      }

      groupNode.append(setting);
    }

    elements.strategyControls.append(groupNode);
  }
}

async function loadStrategyConfig() {
  try {
    const result = await api("api/strategy-config");
    strategyConfig = result.config || {};
    strategySchema = result.schema || {};
    strategyPatch = {};
    elements.strategyMessage.textContent = sessionStorage.getItem(controlTokenKey)
      ? "Unlocked"
      : "Locked";
    elements.strategySave.disabled = true;
    renderStrategyControls();
  } catch (error) {
    elements.strategyMessage.textContent = `Strategy unavailable: ${error.message}`;
  }
}

async function unlockStrategy() {
  const pin = window.prompt("Strategy PIN");
  if (!pin) return;

  try {
    const result = await api("api/hud-control/unlock", {
      method: "POST",
      body: JSON.stringify({ pin })
    });
    sessionStorage.setItem(controlTokenKey, result.token);
    elements.strategyMessage.textContent = "Unlocked";
    await loadStrategyConfig();
  } catch (error) {
    elements.strategyMessage.textContent = `Unlock failed: ${error.message}`;
  }
}

async function saveStrategy() {
  try {
    const result = await api("api/strategy-config", {
      method: "POST",
      body: JSON.stringify(strategyPatch)
    });
    strategyConfig = result.config || {};
    strategySchema = result.schema || {};
    strategyPatch = {};
    elements.strategySave.disabled = true;
    elements.strategyMessage.textContent = "Saved";
    renderStrategyControls();
  } catch (error) {
    elements.strategyMessage.textContent = `Save failed: ${error.message}`;
  }
}

function renderState(state) {
  const lastScan = state.lastScan || {};
  const openPositions = Object.values(state.openPositions || {});
  const closedPositions = state.closedPositions || [];

  elements.lastScan.textContent = formatTime(lastScan.scannedAt);
  elements.profilesScanned.textContent = lastScan.profilesScanned ?? "-";
  elements.pairsFound.textContent = lastScan.pairsFound ?? "-";
  elements.openCount.textContent = openPositions.length;
  elements.closedCount.textContent = closedPositions.length;

  renderCandidates(lastScan.topCandidates || []);
  renderOpenPositions(openPositions);
  renderClosedPositions(closedPositions);
}

async function loadState() {
  try {
    setStatus("Refreshing");
    const response = await fetch(`${stateUrl}?t=${Date.now()}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    renderState(await response.json());
    setStatus("Live", "ok");
  } catch (error) {
    setStatus("State unavailable", "error");
    console.error(error);
  }
}

elements.refresh.addEventListener("click", loadState);
elements.strategyUnlock.addEventListener("click", unlockStrategy);
elements.strategySave.addEventListener("click", saveStrategy);
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
    document.querySelectorAll(".tab-panel").forEach((item) => item.classList.remove("active"));
    tab.classList.add("active");
    document.querySelector(`[data-panel="${tab.dataset.tab}"]`)?.classList.add("active");

    if (tab.dataset.tab === "strategy") {
      loadStrategyConfig();
    }
  });
});
loadState();
loadStrategyConfig();
setInterval(loadState, refreshMs);
