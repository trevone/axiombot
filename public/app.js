const $ = (id) => document.querySelector(`#${id}`);
const money = (v) => Number.isFinite(Number(v)) ? `$${Number(v).toFixed(Number(v) >= 1 ? 2 : 8)}` : "-";
const pct = (v) => Number.isFinite(Number(v)) ? `${Number(v).toFixed(2)}%` : "-";
const profit = (p) => Number.isFinite(Number(p.pnlPct)) && Number.isFinite(Number(p.size)) ? (Number(p.size) * Number(p.pnlPct)) / 100 : 0;
const isTrim = (p) => p.reason === "let_run_trim" || p.reason === "let_run_time_trim";
const ago = (iso) => {
  if (!iso) return "-";
  const seconds = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.round(seconds / 60)}m`;
};

function card(html) {
  const div = document.createElement("article");
  div.className = "card";
  div.innerHTML = html;
  return div;
}

function renderList(id, items, render, empty) {
  const node = $(id);
  node.replaceChildren();
  if (!items.length) node.append(card(`<p>${empty}</p>`));
  for (const item of items) node.append(card(render(item)));
}

async function load() {
  const res = await fetch(`api/status?t=${Date.now()}`, { cache: "no-store" });
  const { state, config, wallet } = await res.json();
  const open = Object.values(state.open || {});
  const activeOpen = open.filter((p) => !p.letRun).length;
  const closed = state.closed || [];
  const trimProfit = closed.filter(isTrim).reduce((sum, p) => sum + profit(p), 0);
  const candidates = state.lastScan?.candidates || [];

  $("summary").innerHTML = `
    <div class="metric"><span>Scan Age</span><strong>${ago(state.lastScan?.at)}</strong></div>
    <div class="metric"><span>Pairs</span><strong>${state.lastScan?.pairs ?? 0}</strong></div>
    <div class="metric"><span>Open</span><strong>${open.length}</strong></div>
    <div class="metric"><span>Slots</span><strong>${activeOpen}/${config.maxOpen}</strong></div>
    <div class="metric"><span>Closed</span><strong>${closed.length}</strong></div>
    <div class="metric"><span>Partial</span><strong>${money(trimProfit)}</strong></div>
    <div class="metric"><span>Mode</span><strong>${config.tradingMode}</strong></div>
    <div class="metric"><span>Wallet</span><strong>${wallet?.address ? `${wallet.address.slice(0, 4)}...${wallet.address.slice(-4)}` : "-"}</strong></div>
    <div class="metric"><span>SOL</span><strong>${wallet?.sol === null ? "-" : Number(wallet?.sol || 0).toFixed(4)}</strong></div>
  `;

  renderList("open", open, (p) => {
    const realized = closed.filter((c) => isTrim(c) && c.id === p.id).reduce((sum, c) => sum + profit(c), 0);
    return `
    <h3>${p.symbol}</h3>
    <p>${p.name || ""}</p>
    <dl>
      <dt>Entry</dt><dd>${money(p.entry)}</dd>
      <dt>Last</dt><dd>${money(p.last)}</dd>
      <dt>PnL</dt><dd>${pct(((p.last - p.entry) / p.entry) * 100)}</dd>
      <dt>Size</dt><dd>${money(p.size)}</dd>
      <dt>Realized</dt><dd>${money(realized)}</dd>
      <dt>Scales</dt><dd>${p.scales}</dd>
      <dt>Trims</dt><dd>${p.letRunTrims || 0}</dd>
      <dt>Let Run</dt><dd>${p.letRun ? "yes" : "no"}</dd>
    </dl>
    <a href="${p.url}" target="_blank" rel="noreferrer">Chart</a>
  `;
  }, "No open positions.");

  renderList("candidates", candidates.slice(0, 10), (c) => `
    <h3>${c.symbol}</h3>
    <p>${c.accepted ? "accepted" : c.reasons.join(", ")}</p>
    <dl>
      <dt>Score</dt><dd>${c.metrics.score}</dd>
      <dt>Price</dt><dd>${money(c.price)}</dd>
      <dt>5m Move</dt><dd>${pct(c.metrics.moveM5Pct)}</dd>
      <dt>5m Volume</dt><dd>${money(c.metrics.volumeM5Usd)}</dd>
    </dl>
    <a href="${c.url}" target="_blank" rel="noreferrer">Chart</a>
  `, "No candidates.");

  renderList("decisions", state.decisions?.slice(0, 30) || [], (d) => `
    <h3>${d.action} ${d.symbol || ""}</h3>
    <p>${d.reason || d.reasons?.join(", ") || ""}</p>
    <small>${new Date(d.at).toLocaleString()}</small>
  `, "No decisions.");

  renderList("closed", closed.slice(0, 20), (p) => `
    <h3>${p.symbol}</h3>
    <p>${p.reason}</p>
    <dl><dt>PnL</dt><dd>${pct(p.pnlPct)}</dd><dt>Profit</dt><dd>${money(profit(p))}</dd><dt>Size</dt><dd>${money(p.size)}</dd><dt>Exit</dt><dd>${money(p.exit)}</dd></dl>
  `, "No closed positions.");
}

$("refresh").addEventListener("click", load);
load();
setInterval(load, 15_000);
