/* Cordoba Capital · Commodity Lab — World Bank only (same-origin first)
   Why your data didn’t load:
   - Cross-origin downloads from thedocs.worldbank.org often fail in-browser due to CORS.
   Institutional fix:
   - Host the Excel file in your own repo: /data/CMO-Historical-Data-Monthly.xlsx
   - Keep manual upload as fallback so the tool never breaks in front of clients.

   What this Phase 1 is for (investors):
   - Price context: level + z-score + returns
   - Relative value: spread / ratio
   - Seasonality: quickly sanity-check narratives
   - Balance: turn a view into explicit assumptions
   - Stress: map outcomes for demand/supply shocks
   - Export: Cordoba-stamped charts + “Investor Pack” (assumptions + metadata)
*/

const CORDOBA = {
  gold: "#9A690F",
  soft: "#FFF7F0",
  ink: "#111111",
  muted: "#666666",
  border: "#E7DED4"
};

// Same-origin path (recommended)
const LOCAL_XLSX_PATH = "/data/CMO-Historical-Data-Monthly.xlsx";

const el = (id) => document.getElementById(id);

// UI
const loadBtn = el("loadBtn");
const reloadBtn = el("reloadBtn");
const loadStatus = el("loadStatus");
const fileInput = el("fileInput");

const sector = el("sector");
const quickPick = el("quickPick");
const searchBox = el("searchBox");
const seriesA = el("seriesA");
const seriesB = el("seriesB");
const viewMode = el("viewMode");
const zWin = el("zWin");
const retType = el("retType");
const smooth = el("smooth");

const buildBtn = el("buildBtn");
const resetBtn = el("resetBtn");
const status = el("status");

const exportPngBtn = el("exportPngBtn");
const exportSvgBtn = el("exportSvgBtn");
const exportPackBtn = el("exportPackBtn");

const kDef = el("kDef");
const kLast = el("kLast");
const kZ = el("kZ");

const chartDiv = el("chart");
const note = el("note");

// Balance controls
const demandYoY = el("demandYoY");
const supplyYoY = el("supplyYoY");
const invChg = el("invChg");
const balanceOverride = el("balanceOverride");
const ed = el("ed");
const es = el("es");
const scenarioRange = el("scenarioRange");
const scenarioSteps = el("scenarioSteps");

// Tabs
const tabs = document.querySelectorAll(".tab");

const state = {
  loaded: false,
  // map: rawName -> { rawName, cleanName, sector, unitGuess, points:[{date,value}] }
  series: new Map(),
  list: [],
  activeTab: "market",
  built: null
};

tabs.forEach(t => {
  t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.activeTab = t.dataset.tab;
    render();
  });
});

// ---------- events ----------
loadBtn.addEventListener("click", async () => {
  await loadData();
});

reloadBtn.addEventListener("click", async () => {
  resetRuntime();
  await loadData(true);
});

fileInput.addEventListener("change", async () => {
  const f = fileInput.files && fileInput.files[0];
  if (!f) return;
  resetRuntime();
  loadStatus.textContent = "Reading uploaded file…";
  try {
    const buf = await f.arrayBuffer();
    await parseWorkbook(buf);
    loadStatus.textContent = `Loaded from upload: ${state.list.length} series.`;
    status.textContent = "Pick series and Build.";
    buildBtn.disabled = false;
    reloadBtn.disabled = false;
  } catch (e) {
    loadStatus.textContent = `Upload failed: ${e.message}`;
    status.textContent = "Could not load dataset.";
  }
});

[sector, quickPick, searchBox].forEach(x => x.addEventListener("change", () => refreshDropdowns()));
searchBox.addEventListener("input", () => refreshDropdowns());

[
  seriesA, seriesB, viewMode, zWin, retType, smooth,
  demandYoY, supplyYoY, invChg, balanceOverride, ed, es, scenarioRange, scenarioSteps
].forEach(ctrl => {
  ctrl.addEventListener("change", () => {
    if (!state.built) return;
    try {
      state.built = buildAll();
      render();
    } catch (e) {
      status.textContent = `Update error: ${e.message}`;
    }
  });
});

buildBtn.addEventListener("click", () => {
  try {
    status.textContent = "Building…";
    state.built = buildAll();
    enableExports();
    status.textContent = "Built.";
    render();
  } catch (e) {
    status.textContent = `Build error: ${e.message}`;
  }
});

resetBtn.addEventListener("click", () => fullReset());

exportPngBtn.addEventListener("click", async () => exportChart("png"));
exportSvgBtn.addEventListener("click", async () => exportChart("svg"));
exportPackBtn.addEventListener("click", async () => exportInvestorPack());

// boot
renderEmpty();

// ---------- load ----------
async function loadData(isReload=false) {
  try {
    loadBtn.disabled = true;
    reloadBtn.disabled = true;
    buildBtn.disabled = true;

    loadStatus.textContent = isReload ? "Reloading… (same-origin)" : "Loading… (same-origin)";
    status.textContent = "Loading dataset…";

    const res = await fetch(LOCAL_XLSX_PATH, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        "Could not find /data/CMO-Historical-Data-Monthly.xlsx. Add it to your repo or upload the file below."
      );
    }

    const buf = await res.arrayBuffer();
    await parseWorkbook(buf);

    loadStatus.textContent = `Loaded: ${state.list.length} series (monthly).`;
    status.textContent = "Pick series and Build.";
    buildBtn.disabled = false;
    reloadBtn.disabled = false;

  } catch (e) {
    loadStatus.textContent = e.message;
    status.textContent = "Use manual upload as fallback.";
    loadBtn.disabled = false;
    reloadBtn.disabled = false;
  }
}

// ---------- parse workbook ----------
async function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });

  // Prefer a sheet that looks like monthly prices (this file’s layout can change)
  const sheetName =
    wb.SheetNames.find(n => /monthly/i.test(n)) ||
    wb.SheetNames.find(n => /prices/i.test(n)) ||
    wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx === -1) throw new Error("Could not locate header row (file layout changed).");

  const headers = rows[headerIdx].map(h => (h == null ? "" : String(h).trim()));
  const dateCol = headers.findIndex(h => /^date$/i.test(h) || /^time$/i.test(h));
  if (dateCol === -1) throw new Error("Could not find Date column.");

  const rawSeries = new Map();

  for (let c = 0; c < headers.length; c++) {
    if (c === dateCol) continue;
    const rawName = headers[c];
    if (!rawName || rawName.length < 2) continue;
    rawSeries.set(rawName, []);
  }

  const dataRows = rows.slice(headerIdx + 1);
  for (const r of dataRows) {
    const d = parseWbDate(r[dateCol]);
    if (!d) continue;

    for (let c = 0; c < headers.length; c++) {
      if (c === dateCol) continue;
      const name = headers[c];
      if (!rawSeries.has(name)) continue;
      const v = r[c];
      const num = (v == null || v === "") ? null : Number(v);
      if (Number.isFinite(num)) rawSeries.get(name).push({ date: d, value: num });
    }
  }

  state.series.clear();
  state.list = [];

  for (const [rawName, pts] of rawSeries.entries()) {
    pts.sort((a,b) => a.date - b.date);

    // Keep only “real” series (enough history)
    if (pts.length < 48) continue;

    const cleanName = cleanSeriesName(rawName);
    const sec = classifySector(rawName);
    const unit = guessUnit(rawName);

    const obj = { rawName, cleanName, sector: sec, unitGuess: unit, points: pts };
    state.series.set(rawName, obj);
    state.list.push(obj);
  }

  state.list.sort((a,b) => a.cleanName.localeCompare(b.cleanName));
  state.loaded = true;

  // defaults
  sector.value = "ALL";
  quickPick.value = "";
  searchBox.value = "";

  refreshDropdowns(true);
}

function refreshDropdowns(setDefaults=false) {
  if (!state.loaded) return;

  // Quick pick forces Series A (and sometimes B)
  const qp = quickPick.value;
  if (qp) applyQuickPick(qp);

  const sec = sector.value;
  const q = (searchBox.value || "").trim().toLowerCase();

  const filtered = state.list.filter(s => {
    const okSector = sec === "ALL" ? true : s.sector === sec;
    const okText = !q ? true : s.cleanName.toLowerCase().includes(q) || s.rawName.toLowerCase().includes(q);
    return okSector && okText;
  });

  const cap = 600;

  seriesA.innerHTML = "";
  seriesB.innerHTML = "";

  for (const s of filtered.slice(0, cap)) {
    const o1 = document.createElement("option");
    o1.value = s.rawName;
    o1.textContent = `${s.cleanName}${s.unitGuess ? " · " + s.unitGuess : ""}`;
    seriesA.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = s.rawName;
    o2.textContent = `${s.cleanName}${s.unitGuess ? " · " + s.unitGuess : ""}`;
    seriesB.appendChild(o2);
  }

  if (setDefaults) {
    const brent = pickByRegex(/brent/i);
    const wti = pickByRegex(/\bwti\b|west texas/i);
    if (brent) seriesA.value = brent.rawName;
    if (wti) seriesB.value = wti.rawName;
  }
}

function applyQuickPick(code) {
  // sets Series A (and in a couple cases suggests a Series B pair)
  const map = {
    BRENT: /brent/i,
    WTI: /\bwti\b|west texas/i,
    GAS_EU: /natural gas.*europe|gas.*europe/i,
    COAL_AUS: /coal.*australia/i,
    COPPER: /copper/i,
    ALUMINUM: /aluminum|aluminium/i,
    GOLD: /\bgold\b/i,
    WHEAT: /\bwheat\b/i,
    MAIZE: /maize|corn/i,
    RICE: /\brice\b/i,
    SUGAR: /\bsugar\b/i
  };

  const rx = map[code];
  if (!rx) return;

  const picked = pickByRegex(rx);
  if (!picked) return;

  // set search to the pick so it’s visible
  searchBox.value = picked.cleanName.split("·")[0].trim();
}

function pickByRegex(rx) {
  return state.list.find(s => rx.test(s.rawName) || rx.test(s.cleanName));
}

// ---------- build ----------
function buildAll() {
  if (!state.loaded) throw new Error("Dataset not loaded.");

  const AName = seriesA.value;
  const BName = seriesB.value;
  const mode = viewMode.value;

  const zw = Math.max(12, Number(zWin.value || 60));
  const rType = retType.value;
  const sm = smooth.value;

  const A = state.series.get(AName)?.points || [];
  const B = state.series.get(BName)?.points || [];

  if (!A.length) throw new Error("Series A has no data.");
  if (mode !== "single" && !B.length) throw new Error("Series B has no data.");

  const aligned = (mode === "single")
    ? A.map(x => ({ date: x.date, a: x.value, b: null }))
    : alignTwoSeries(A, B);

  let y = [];
  if (mode === "single") {
    y = aligned.map(r => ({ date: r.date, y: r.a }));
  } else if (mode === "spread") {
    y = aligned.map(r => ({ date: r.date, y: r.a - r.b }));
  } else {
    y = aligned
      .map(r => ({ date: r.date, y: (r.b === 0 ? null : r.a / r.b) }))
      .filter(x => x.y != null);
  }

  if (sm !== "none") {
    const win = sm === "ma3" ? 3 : sm === "ma6" ? 6 : 12;
    y = movingAverage(y, win);
  }

  if (y.length < zw + 10) throw new Error("Not enough history for chosen z-window.");

  const z = rollingZ(y.map(p => p.y), zw);
  const ret = returns(y.map(p => p.y), rType);

  const series = y.map((p, i) => ({
    date: p.date,
    y: p.y,
    z: z[i],
    ret: ret[i]
  }));

  const season = seasonalityMonthly(series);
  const balance = balanceEngine();

  const ALabel = labelFor(AName);
  const BLabel = labelFor(BName);

  const definition =
    mode === "single" ? `${ALabel} · level`
    : mode === "spread" ? `${ALabel} − ${BLabel} · spread`
    : `${ALabel} / ${BLabel} · ratio`;

  const last = [...series].reverse().find(x => x.y != null);
  const lastZ = [...series].reverse().find(x => x.z != null);

  kDef.textContent = `${definition} · z(${zw}) · monthly`;
  kLast.textContent = last ? fmt(last.y) : "—";
  kZ.textContent = lastZ ? fmt(lastZ.z) : "—";

  return {
    meta: {
      A: AName, B: BName,
      ALabel, BLabel,
      mode, zw, rType, sm,
      definition,
      builtAt: new Date().toISOString()
    },
    series,
    season,
    balance
  };
}

function labelFor(rawName) {
  const s = state.series.get(rawName);
  if (!s) return rawName;
  return s.cleanName;
}

// ---------- rendering ----------
function render() {
  if (!state.built) {
    renderEmpty();
    return;
  }

  note.style.display = "none";

  if (state.activeTab === "market") return renderMarket();
  if (state.activeTab === "season") return renderSeasonality();
  if (state.activeTab === "sd") return renderBalance();
  if (state.activeTab === "stress") return renderStress();
}

function renderEmpty() {
  Plotly.newPlot(chartDiv, [], baseLayout("Load the dataset to begin"), {
    displayModeBar: false, responsive: true
  });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:650;font-size:16px;margin-bottom:6px">
      What this is
    </div>
    <div class="muted">
      A commodity workbench for investors. It’s designed to pressure-test a view:
      level and z-score, spreads and ratios, seasonality, and a simple balance engine that turns assumptions into ranges.
      Export charts with Cordoba branding so they’re ready for a note or a client deck.
    </div>
  `;
}

function renderMarket() {
  const s = state.built.series;
  const x = s.map(d => d.date);
  const y = s.map(d => d.y);
  const z = s.map(d => d.z);

  const traces = [
    { x, y, type: "scatter", mode: "lines", name: "Level / Spread / Ratio", line: { width: 2 } },
    { x, y: z, type: "scatter", mode: "lines", name: "Z-score", yaxis: "y2", line: { width: 2, dash: "dot" } }
  ];

  const layout = baseLayout(`${state.built.meta.definition}`);
  layout.yaxis.title = "Value";
  layout.yaxis2 = { title: "Z-score", overlaying: "y", side: "right", gridcolor: "rgba(0,0,0,0)", zeroline: false };
  layout.shapes = [
    { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y2", y0: 2, y1: 2, line: { width: 1, color: "rgba(154,105,15,0.35)" } },
    { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y2", y0: -2, y1: -2, line: { width: 1, color: "rgba(154,105,15,0.35)" } }
  ];

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:650;font-size:16px;margin-bottom:6px">
      How to read this
    </div>
    <div class="muted">
      This is the “where are we” panel. Z-score is there to keep the conversation honest.
      If the trade needs a big catalyst, the chart should look stretched. If it doesn’t, the thesis is usually missing something.
    </div>
  `;
}

function renderSeasonality() {
  const m = state.built.season.avg;
  const n = state.built.season.n;
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const traces = [{ x: labels, y: m, type: "bar", name: "Avg monthly return" }];

  const layout = baseLayout("Seasonality · average monthly returns");
  layout.yaxis.title = "Average return";
  layout.annotations = [
    ...brandStamp(state.built.meta),
    {
      xref: "paper", yref: "paper", x: 0.01, y: 1.09,
      text: `<span style="color:${CORDOBA.muted};font-size:12px">Obs per month: ${n.join(", ")}</span>`,
      showarrow: false, align: "left"
    }
  ];

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:650;font-size:16px;margin-bottom:6px">
      What this is for
    </div>
    <div class="muted">
      It’s not “seasonality makes money”. It’s a quick lie detector.
      If your narrative depends on a seasonal swing, you should see it here. If you don’t, trade smaller or widen the range.
    </div>
  `;
}

function renderBalance() {
  const b = state.built.balance;

  const traces = [
    {
      x: b.scenarios.map(p => p.balanceShock),
      y: b.scenarios.map(p => p.impliedMove),
      type: "scatter",
      mode: "lines+markers",
      name: "Implied price move"
    }
  ];

  const layout = baseLayout("Balance · assumptions → implied price move");
  layout.xaxis.title = "Net balance shock (% of demand, + tighter)";
  layout.yaxis.title = "Implied price move (%)";

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:650;font-size:16px;margin-bottom:6px">
      Investor use case
    </div>
    <div class="muted">
      This is the part clients actually pay for. It turns “supply is tight” into a number, then into a range.
      You can export the chart with the assumptions attached, so the thesis is auditable.
      <br/><br/>
      Mechanics: net balance shock is demand growth minus supply growth minus inventory build.
      Positive means tighter. The implied move solves the price adjustment needed to clear, given elasticities.
    </div>
  `;
}

function renderStress() {
  const g = state.built.balance.stressGrid;

  const traces = [{
    x: g.demandShocks,
    y: g.supplyShocks,
    z: g.impliedMoves,
    type: "surface",
    name: "Implied move"
  }];

  const layout = baseLayout("Stress · demand shock vs supply shock");
  layout.scene = {
    xaxis: { title: "Demand shock (%)" },
    yaxis: { title: "Supply shock (%)" },
    zaxis: { title: "Implied price move (%)" }
  };
  layout.margin = { l: 20, r: 20, t: 60, b: 20 };

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:650;font-size:16px;margin-bottom:6px">
      What this adds
    </div>
    <div class="muted">
      This is how you communicate risk like a real desk.
      Instead of a single target, you show a surface of outcomes driven by the two forces that matter: demand and supply.
      It’s simple, but it’s defensible.
    </div>
  `;
}

// ---------- balance engine ----------
function balanceEngine() {
  const dYoY = Number(demandYoY.value || 0);
  const sYoY = Number(supplyYoY.value || 0);
  const inv = Number(invChg.value || 0);

  const edAbs = Math.max(0.01, Number(ed.value || 0.2)); // |εd|
  const esVal = Math.max(0.01, Number(es.value || 0.1)); // εs

  let baseBalance = (dYoY - sYoY - inv);

  if (String(balanceOverride.value || "").trim() !== "") {
    baseBalance = Number(balanceOverride.value);
  }

  const denom = edAbs + esVal;

  const rng = Math.max(0.5, Number(scenarioRange.value || 2));
  const steps = Math.max(3, Math.floor(Number(scenarioSteps.value || 9)));
  const start = baseBalance - rng;
  const end = baseBalance + rng;

  const scenarios = [];
  for (let i = 0; i < steps; i++) {
    const bal = start + (i * (end - start)) / (steps - 1);
    scenarios.push({ balanceShock: bal, impliedMove: bal / denom });
  }

  const ds = linspace(-3, 3, 13);
  const ss = linspace(-3, 3, 13);
  const impliedMoves = [];

  for (let yi = 0; yi < ss.length; yi++) {
    const row = [];
    for (let xi = 0; xi < ds.length; xi++) {
      const bal = (ds[xi] - ss[yi] - inv);
      row.push(bal / denom);
    }
    impliedMoves.push(row);
  }

  return {
    inputs: {
      demandYoY: dYoY,
      supplyYoY: sYoY,
      inventorySwing: inv,
      demandElasticityAbs: edAbs,
      supplyElasticity: esVal,
      baseBalanceShock: baseBalance
    },
    scenarios,
    stressGrid: { demandShocks: ds, supplyShocks: ss, impliedMoves }
  };
}

// ---------- export ----------
function enableExports() {
  exportPngBtn.disabled = false;
  exportSvgBtn.disabled = false;
  exportPackBtn.disabled = false;
}

async function exportChart(fmt) {
  if (!state.built) return;
  const baseName = `cordoba_commodity_${state.activeTab}_${new Date().toISOString().slice(0,10)}`;
  const url = await Plotly.toImage(chartDiv, { format: fmt, height: 900, width: 1600, scale: 2 });
  downloadDataUrl(url, `${baseName}.${fmt}`);
}

async function exportInvestorPack() {
  if (!state.built) return;

  // pack includes:
  // - metadata
  // - balance assumptions
  // - last values
  // - series name mapping
  const pack = {
    cordoba: {
      product: "Commodity Lab",
      exportedAt: new Date().toISOString(),
      brand: { primary: CORDOBA.gold }
    },
    selection: state.built.meta,
    balance: state.built.balance.inputs,
    kpis: {
      definition: kDef.textContent,
      latestLevel: kLast.textContent,
      latestZ: kZ.textContent
    }
  };

  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  downloadDataUrl(url, `cordoba_investor_pack_${new Date().toISOString().slice(0,10)}.json`);
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// ---------- helpers ----------
function resetRuntime() {
  state.loaded = false;
  state.series.clear();
  state.list = [];
  state.built = null;

  buildBtn.disabled = true;
  exportPngBtn.disabled = true;
  exportSvgBtn.disabled = true;
  exportPackBtn.disabled = true;

  kDef.textContent = "—";
  kLast.textContent = "—";
  kZ.textContent = "—";
}

function fullReset() {
  state.built = null;

  viewMode.value = "single";
  smooth.value = "none";
  zWin.value = 60;
  retType.value = "log";

  demandYoY.value = 2.0;
  supplyYoY.value = 1.5;
  invChg.value = 0.0;
  balanceOverride.value = "";
  ed.value = 0.20;
  es.value = 0.10;
  scenarioRange.value = 2.0;
  scenarioSteps.value = 9;

  exportPngBtn.disabled = true;
  exportSvgBtn.disabled = true;
  exportPackBtn.disabled = true;

  kDef.textContent = "—";
  kLast.textContent = "—";
  kZ.textContent = "—";

  status.textContent = state.loaded ? "Pick series and Build." : "Load the dataset to begin.";
  renderEmpty();
}

function baseLayout(title) {
  return {
    title: {
      text: `<span style="font-family:Times New Roman,Times,serif;font-weight:650">${escapeHtml(title)}</span>`,
      x: 0.02
    },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    margin: { l: 56, r: 18, t: 60, b: 52 },
    xaxis: { gridcolor: "rgba(0,0,0,0.06)", zeroline: false },
    yaxis: { gridcolor: "rgba(0,0,0,0.06)", zeroline: false },
    font: { family: "Helvetica, Arial, sans-serif", color: CORDOBA.ink },
    annotations: brandStamp(state.built?.meta)
  };
}

function brandStamp(meta) {
  const now = new Date();
  const stampLeft = `${now.toISOString().slice(0,10)} · Cordoba Capital`;
  const stampRight = meta ? `${meta.definition} · World Bank monthly` : "World Bank monthly";

  return [
    {
      xref: "paper", yref: "paper",
      x: 0.01, y: -0.18,
      text: `<span style="color:${CORDOBA.muted};font-size:11px">${escapeHtml(stampLeft)}</span>`,
      showarrow: false, align: "left"
    },
    {
      xref: "paper", yref: "paper",
      x: 0.99, y: -0.18,
      text: `<span style="color:${CORDOBA.muted};font-size:11px">${escapeHtml(stampRight)}</span>`,
      showarrow: false, align: "right"
    }
  ];
}

function escapeHtml(s) {
  return String(s || "")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function alignTwoSeries(A, B) {
  const key = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString().slice(0, 10);

  const mapA = new Map(A.map(x => [key(x.date), x.value]));
  const mapB = new Map(B.map(x => [key(x.date), x.value]));

  const out = [];
  for (const [k, va] of mapA.entries()) {
    if (!mapB.has(k)) continue;
    const vb = mapB.get(k);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    out.push({ date: new Date(k), a: va, b: vb });
  }
  out.sort((x,y) => x.date - y.date);
  return out;
}

function movingAverage(series, win) {
  const out = [];
  let sum = 0;
  const q = [];

  for (let i = 0; i < series.length; i++) {
    const v = series[i].y;
    q.push(v);
    sum += v;

    if (q.length > win) sum -= q.shift();
    if (q.length === win) out.push({ date: series[i].date, y: sum / win });
  }
  return out;
}

function rollingZ(vals, win) {
  const z = new Array(vals.length).fill(null);
  let sum = 0, sumsq = 0;
  const q = [];

  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    q.push(v);
    sum += v;
    sumsq += v * v;

    if (q.length > win) {
      const old = q.shift();
      sum -= old;
      sumsq -= old * old;
    }

    if (q.length === win) {
      const mean = sum / win;
      const varr = (sumsq / win) - mean * mean;
      const sd = Math.sqrt(Math.max(varr, 1e-12));
      z[i] = (v - mean) / sd;
    }
  }
  return z;
}

function returns(levels, type="log") {
  const r = new Array(levels.length).fill(null);
  for (let i = 1; i < levels.length; i++) {
    const a = levels[i-1], b = levels[i];
    if (a == null || b == null) { r[i] = null; continue; }
    if (type === "log") r[i] = Math.log(b / a);
    else r[i] = (b / a) - 1;
  }
  return r;
}

function seasonalityMonthly(series) {
  const buckets = Array.from({ length: 12 }, () => []);
  for (const x of series) {
    if (x.ret == null || !Number.isFinite(x.ret)) continue;
    buckets[x.date.getUTCMonth()].push(x.ret);
  }
  const avg = buckets.map(arr => arr.length ? mean(arr) : null);
  const n = buckets.map(arr => arr.length);
  return { avg, n };
}

function mean(a) { return a.reduce((s,v) => s + v, 0) / a.length; }

function fmt(x) {
  if (x == null || !Number.isFinite(x)) return "—";
  const ax = Math.abs(x);
  const dp = ax >= 100 ? 1 : ax >= 10 ? 2 : 3;
  return x.toFixed(dp);
}

function linspace(a, b, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(a + (i * (b - a)) / (n - 1));
  return out;
}

function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 160); i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 5) continue;
    const first = r[0] == null ? "" : String(r[0]).trim();
    if (/date/i.test(first) && r.filter(x => x != null && String(x).trim().length > 0).length >= 5) return i;
  }
  for (let i = 0; i < Math.min(rows.length, 240); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    if (r.some(x => x != null && /^date$/i.test(String(x).trim()))) return i;
  }
  return -1;
}

function parseWbDate(x) {
  if (x == null) return null;
  if (x instanceof Date && !Number.isNaN(+x)) return x;

  // Excel serial date
  if (typeof x === "number" && x > 20000 && x < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + x * 86400000);
  }

  const s = String(x).trim();
  if (!s) return null;

  // YYYY-MM or YYYY-MM-DD
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
    const d = new Date(s.length === 7 ? `${s}-01` : s);
    return Number.isNaN(+d) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(+d) ? null : d;
}

// ---------- cleaning / classification ----------
function cleanSeriesName(raw) {
  let s = String(raw).trim();

  // Remove repeated “(US$)” clutter etc if present
  s = s.replace(/\s+/g, " ");

  // Small quality tweaks
  s = s.replace(/\bU\.S\.\b/g, "US");
  s = s.replace(/\bU\.K\.\b/g, "UK");

  return s;
}

function classifySector(name) {
  const s = String(name).toLowerCase();

  // indexes
  if (/\bindex\b|indices|non-energy|energy price index|metals and minerals index|agriculture index/.test(s)) {
    return "INDEX";
  }

  // energy
  if (/crude|brent|wti|dubai|oil|gasoline|diesel|fuel|natural gas|lng|coal|propane|naphtha/.test(s)) {
    return "ENERGY";
  }

  // fertilisers
  if (/urea|dap|phosphate|potash|fertili/.test(s)) {
    return "FERTS";
  }

  // metals
  if (/gold|silver|platinum|palladium|copper|aluminum|aluminium|zinc|nickel|lead|tin|iron ore|steel/.test(s)) {
    return "METALS";
  }

  // agriculture
  if (/wheat|maize|corn|rice|soy|beans|coffee|cocoa|tea|sugar|cotton|beef|pork|poultry|banana|orange|palmoil|palm oil/.test(s)) {
    return "AGRI";
  }

  return "ALL";
}

function guessUnit(name) {
  const s = String(name).toLowerCase();
  if (/\$\/bbl|\bbbl\b/.test(s) || /crude|brent|wti|oil/.test(s)) return "$/bbl";
  if (/natural gas|lng/.test(s)) return "unit varies";
  if (/coal|iron ore/.test(s)) return "$/mt";
  if (/gold|silver|platinum|palladium/.test(s)) return "$/oz";
  if (/copper|aluminum|aluminium|zinc|nickel|lead|tin/.test(s)) return "$/mt";
  if (/wheat|maize|corn|rice|soy/.test(s)) return "$/mt";
  if (/coffee|cocoa|tea|sugar|cotton/.test(s)) return "unit varies";
  if (/\bindex\b|indices|price index/.test(s)) return "index";
  return "";
}
