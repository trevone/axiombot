const stateUrl = "/state.json";
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
loadState();
setInterval(loadState, refreshMs);
