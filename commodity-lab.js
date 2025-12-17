/* Cordoba Capital · Commodity Lab — World Bank only
   Data:
   - World Bank "World Bank Commodities Price Data (The Pink Sheet)" historical monthly Excel:
     CMO-Historical-Data-Monthly.xlsx :contentReference[oaicite:4]{index=4}

   Investor-grade workflow (Phase 1):
   1) Market: level / spread / ratio + rolling z-score + returns
   2) Seasonality: average monthly returns + sample counts
   3) Supply–Demand: scenario engine (assumptions -> implied price move)
   4) Stress: supply shock vs demand shock map (heat-style surface)

   Note: This is not a forecast engine. It is an assumption-testing bench.
*/

const CORDOBA = {
  gold: "#9A690F",
  soft: "#FFF7F0",
  ink: "#111111",
  muted: "#666666",
  border: "#E7DED4"
};

// Official file surfaced by World Bank Pink Sheet page / related downloads. :contentReference[oaicite:5]{index=5}
const WORLD_BANK_PINK_SHEET_XLSX =
  "https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx";

const el = (id) => document.getElementById(id);

// UI elements
const loadBtn = el("loadBtn");
const reloadBtn = el("reloadBtn");
const loadStatus = el("loadStatus");

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

const kDef = el("kDef");
const kLast = el("kLast");
const kZ = el("kZ");

const chartDiv = el("chart");
const note = el("note");

// Supply–Demand controls
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
  // seriesMap: name -> [{date: Date, value: number}]
  seriesMap: new Map(),
  names: [],
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

// Events
loadBtn.addEventListener("click", async () => {
  await loadWorldBank();
});

reloadBtn.addEventListener("click", async () => {
  state.loaded = false;
  state.seriesMap.clear();
  state.names = [];
  state.built = null;
  buildBtn.disabled = true;
  exportPngBtn.disabled = true;
  exportSvgBtn.disabled = true;
  loadStatus.textContent = "Reloading…";
  await loadWorldBank();
});

searchBox.addEventListener("input", () => {
  if (!state.loaded) return;
  populateSeriesDropdowns(searchBox.value);
});

[seriesA, seriesB, viewMode, zWin, retType, smooth,
 demandYoY, supplyYoY, invChg, balanceOverride, ed, es, scenarioRange, scenarioSteps
].forEach(ctrl => {
  ctrl.addEventListener("change", () => {
    if (!state.built) return;
    // Rebuild quickly on param changes
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
    exportPngBtn.disabled = false;
    exportSvgBtn.disabled = false;
    status.textContent = "Built.";
    render();
  } catch (e) {
    status.textContent = `Build error: ${e.message}`;
  }
});

resetBtn.addEventListener("click", () => resetAll());

exportPngBtn.addEventListener("click", async () => exportChart("png"));
exportSvgBtn.addEventListener("click", async () => exportChart("svg"));

// Boot
renderEmpty();

/* ---------------------------
   Load World Bank dataset
--------------------------- */

async function loadWorldBank() {
  try {
    loadBtn.disabled = true;
    reloadBtn.disabled = true;
    loadStatus.textContent = "Downloading World Bank Pink Sheet history…";
    status.textContent = "Loading dataset…";

    const res = await fetch(WORLD_BANK_PINK_SHEET_XLSX);
    if (!res.ok) throw new Error("Download failed.");

    const buf = await res.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });

    // Choose a “Monthly Prices” style sheet if present, otherwise first.
    let sheetName =
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

    const seriesMap = new Map();
    for (let c = 0; c < headers.length; c++) {
      if (c === dateCol) continue;
      const name = headers[c];
      if (!name || name.length < 2) continue;
      seriesMap.set(name, []);
    }

    const dataRows = rows.slice(headerIdx + 1);
    for (const r of dataRows) {
      const d = parseWbDate(r[dateCol]);
      if (!d) continue;

      for (let c = 0; c < headers.length; c++) {
        if (c === dateCol) continue;
        const name = headers[c];
        if (!seriesMap.has(name)) continue;
        const v = r[c];
        const num = (v == null || v === "") ? null : Number(v);
        if (Number.isFinite(num)) seriesMap.get(name).push({ date: d, value: num });
      }
    }

    // Clean + keep “real” series
    const names = [];
    for (const [name, arr] of seriesMap.entries()) {
      arr.sort((a,b) => a.date - b.date);
      if (arr.length >= 36) names.push(name); // 3y+ monthly points
      else seriesMap.delete(name);
    }
    names.sort((a,b) => a.localeCompare(b));

    state.seriesMap = seriesMap;
    state.names = names;
    state.loaded = true;

    populateSeriesDropdowns("");

    loadStatus.textContent = `Loaded: ${names.length} series (monthly).`;
    status.textContent = "Pick series and Build.";
    buildBtn.disabled = false;
    reloadBtn.disabled = false;

  } catch (e) {
    loadStatus.textContent = `Load failed: ${e.message}`;
    status.textContent = "Could not load dataset.";
    buildBtn.disabled = true;
    loadBtn.disabled = false;
    reloadBtn.disabled = false;
  }
}

/* ---------------------------
   Build outputs
--------------------------- */

function buildAll() {
  if (!state.loaded) throw new Error("Dataset not loaded.");

  const AName = seriesA.value;
  const BName = seriesB.value;
  const mode = viewMode.value;

  const zw = Math.max(12, Number(zWin.value || 60));
  const rType = retType.value;
  const sm = smooth.value;

  const A = state.seriesMap.get(AName) || [];
  const B = state.seriesMap.get(BName) || [];

  if (!A.length) throw new Error("Series A has no data.");
  if ((mode !== "single") && !B.length) throw new Error("Series B has no data.");

  const aligned = (mode === "single") ? A.map(x => ({ date: x.date, a: x.value, b: null })) : alignTwoSeries(A, B);

  // Build series Y
  let y = [];
  if (mode === "single") {
    y = aligned.map(r => ({ date: r.date, y: r.a }));
  } else if (mode === "spread") {
    y = aligned.map(r => ({ date: r.date, y: r.a - r.b }));
  } else {
    y = aligned.map(r => ({ date: r.date, y: (r.b === 0 ? null : r.a / r.b) })).filter(x => x.y != null);
  }

  // Optional smoothing
  if (sm !== "none") {
    const win = sm === "ma3" ? 3 : sm === "ma6" ? 6 : 12;
    y = movingAverage(y, win);
  }

  if (y.length < zw + 10) throw new Error("Not enough data points for chosen z-window.");

  const z = rollingZ(y.map(p => p.y), zw);
  const ret = returns(y.map(p => p.y), rType);

  const series = y.map((p, i) => ({
    date: p.date,
    y: p.y,
    z: z[i],
    ret: ret[i]
  }));

  const season = seasonalityMonthly(series);

  // Supply–Demand scenario model (investor workflow)
  const sd = supplyDemandEngine();

  const definition =
    mode === "single" ? `${AName} · level`
    : mode === "spread" ? `${AName} − ${BName} · spread`
    : `${AName} / ${BName} · ratio`;

  // KPIs
  const last = [...series].reverse().find(x => x.y != null);
  const lastZ = [...series].reverse().find(x => x.z != null);

  kDef.textContent = `${definition} · z(${zw}) · monthly`;
  kLast.textContent = last ? fmt(last.y) : "—";
  kZ.textContent = lastZ ? fmt(lastZ.z) : "—";

  return { AName, BName, mode, zw, rType, sm, definition, series, season, sd };
}

/* ---------------------------
   Rendering
--------------------------- */

function render() {
  if (!state.built) {
    renderEmpty();
    return;
  }

  note.style.display = "none";

  if (state.activeTab === "market") return renderMarket();
  if (state.activeTab === "season") return renderSeasonality();
  if (state.activeTab === "sd") return renderSupplyDemand();
  if (state.activeTab === "stress") return renderStress();
}

function renderEmpty() {
  Plotly.newPlot(chartDiv, [], baseLayout("Load World Bank dataset to begin"), {
    displayModeBar: false, responsive: true
  });
  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:600;font-size:16px;margin-bottom:6px">
      What this is
    </div>
    <div class="muted">
      A World Bank-only commodity workbench for investors. Start by loading the Pink Sheet historical monthly data, then build a level, spread, or ratio.
      After that, use Supply–Demand to turn assumptions into an implied price move.
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

  const layout = baseLayout(`${state.built.definition} · World Bank monthly`);
  layout.yaxis.title = "Value";
  layout.yaxis2 = { title: "Z-score", overlaying: "y", side: "right", gridcolor: "rgba(0,0,0,0)", zeroline: false };
  layout.shapes = [
    { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y2", y0: 2, y1: 2, line: { width: 1, color: "rgba(154,105,15,0.35)" } },
    { type: "line", xref: "paper", x0: 0, x1: 1, yref: "y2", y0: -2, y1: -2, line: { width: 1, color: "rgba(154,105,15,0.35)" } }
  ];

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });
}

function renderSeasonality() {
  const m = state.built.season.avg;
  const n = state.built.season.n;
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const traces = [{ x: labels, y: m, type: "bar", name: "Avg monthly return" }];

  const layout = baseLayout("Seasonality · average monthly returns");
  layout.yaxis.title = "Average return";
  layout.annotations = [
    ...brandStamp(),
    {
      xref: "paper", yref: "paper", x: 0.01, y: 1.09,
      text: `<span style="color:${CORDOBA.muted};font-size:12px">Obs per month: ${n.join(", ")}</span>`,
      showarrow: false, align: "left"
    }
  ];

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });
}

function renderSupplyDemand() {
  const sd = state.built.sd;

  const traces = [
    { x: sd.scenarios.map(p => p.balanceShock), y: sd.scenarios.map(p => p.impliedPriceMove),
      type: "scatter", mode: "lines+markers", name: "Implied price move" }
  ];

  const layout = baseLayout("Supply–Demand · assumptions → implied price move");
  layout.xaxis.title = "Net balance shock (% of demand, + tighter)";
  layout.yaxis.title = "Implied price move (%)";

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:600;font-size:16px;margin-bottom:6px">
      How investors use this
    </div>
    <div class="muted">
      This is where the tool becomes sellable. You can show your work.
      You write down assumptions (demand growth, supply growth, inventory draw/build), then you see what price move is implied under elasticities.
      It stops “feel” trades and forces a discipline around balance.
      <br/><br/>
      <span class="mono">Balance shock</span> is your tightness input. Positive means tighter (demand > supply, or inventories drawing).
      The model then solves for the price move that would reconcile the balance, given elasticities.
    </div>
    <div class="muted" style="margin-top:10px">
      This is a scenario engine, not a forecast engine.
    </div>
  `;
}

function renderStress() {
  const sd = state.built.sd;
  const grid = sd.stressGrid;

  const traces = [{
    x: grid.demandShocks,
    y: grid.supplyShocks,
    z: grid.impliedMoves,
    type: "surface",
    name: "Implied move"
  }];

  const layout = baseLayout("Stress map · demand shock vs supply shock");
  layout.scene = {
    xaxis: { title: "Demand shock (%)" },
    yaxis: { title: "Supply shock (%)" },
    zaxis: { title: "Implied price move (%)" }
  };
  layout.margin = { l: 20, r: 20, t: 60, b: 20 };

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:600;font-size:16px;margin-bottom:6px">
      Why this matters
    </div>
    <div class="muted">
      Investors pay for tools that turn headlines into ranges.
      This stress map lets you translate “China demand is weaker” or “OPEC cuts are real” into an implied distribution of outcomes.
      It is simple enough to explain, but structured enough to defend.
    </div>
  `;
}

/* ---------------------------
   Supply–Demand Engine (simple partial-equilibrium)
--------------------------- */

function supplyDemandEngine() {
  const dYoY = Number(demandYoY.value || 0);
  const sYoY = Number(supplyYoY.value || 0);
  const inv = Number(invChg.value || 0);

  const edAbs = Math.max(0.01, Number(ed.value || 0.2)); // |εd|
  const esVal = Math.max(0.01, Number(es.value || 0.1)); // εs

  // Net balance shock (% of demand): positive = tighter
  // Default: demand growth - supply growth - inventory build (inventory draw is negative inv -> tighter)
  let baseBalance = (dYoY - sYoY - inv);

  // Optional override
  if (String(balanceOverride.value || "").trim() !== "") {
    baseBalance = Number(balanceOverride.value);
  }

  // Solve implied % price move using elasticities:
  // Approx: balanceShock ≈ (|ed| + es) * ΔP
  // so ΔP ≈ balanceShock / (|ed| + es)
  const denom = edAbs + esVal;
  const impliedBase = baseBalance / denom;

  // Scenario line around base
  const rng = Math.max(0.5, Number(scenarioRange.value || 2));
  const steps = Math.max(3, Math.floor(Number(scenarioSteps.value || 9)));
  const start = baseBalance - rng;
  const end = baseBalance + rng;

  const scenarios = [];
  for (let i = 0; i < steps; i++) {
    const b = start + (i * (end - start)) / (steps - 1);
    scenarios.push({ balanceShock: b, impliedPriceMove: b / denom });
  }

  // Stress grid (demand vs supply shocks)
  // demandShock and supplyShock are in %, net balance = demandShock - supplyShock - inv
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
    inputs: { dYoY, sYoY, inv, edAbs, esVal, baseBalance, impliedBase },
    scenarios,
    stressGrid: { demandShocks: ds, supplyShocks: ss, impliedMoves }
  };
}

/* ---------------------------
   Utilities
--------------------------- */

function alignTwoSeries(A, B) {
  const key = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
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

    if (q.length === win) {
      out.push({ date: series[i].date, y: sum / win });
    }
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

/* ---------------------------
   Excel parsing helpers
--------------------------- */

function findHeaderRowIndex(rows) {
  for (let i = 0; i < Math.min(rows.length, 120); i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 5) continue;
    const first = r[0] == null ? "" : String(r[0]).trim();
    if (/date/i.test(first) && r.filter(x => x != null && String(x).trim().length > 0).length >= 5) return i;
  }
  for (let i = 0; i < Math.min(rows.length, 200); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    if (r.some(x => x != null && /^date$/i.test(String(x).trim()))) return i;
  }
  return -1;
}

function parseWbDate(x) {
  if (x == null) return null;
  if (x instanceof Date && !Number.isNaN(+x)) return x;

  if (typeof x === "number" && x > 20000 && x < 60000) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + x * 86400000);
  }

  const s = String(x).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
    const d = new Date(s.length === 7 ? `${s}-01` : s);
    return Number.isNaN(+d) ? null : d;
  }

  const d = new Date(s);
  return Number.isNaN(+d) ? null : d;
}

/* ---------------------------
   Layout + Export
--------------------------- */

function baseLayout(title) {
  return {
    title: {
      text: `<span style="font-family:Times New Roman,Times,serif;font-weight:600">${title}</span>`,
      x: 0.02
    },
    paper_bgcolor: "#ffffff",
    plot_bgcolor: "#ffffff",
    margin: { l: 56, r: 18, t: 60, b: 52 },
    xaxis: { gridcolor: "rgba(0,0,0,0.06)", zeroline: false },
    yaxis: { gridcolor: "rgba(0,0,0,0.06)", zeroline: false },
    font: { family: "Helvetica, Arial, sans-serif", color: CORDOBA.ink },
    annotations: brandStamp()
  };
}

function brandStamp() {
  const now = new Date();
  const stamp = `${now.toISOString().slice(0,10)} · Cordoba Capital · Commodity Lab`;
  return [
    {
      xref: "paper", yref: "paper",
      x: 0.01, y: -0.18,
      text: `<span style="color:${CORDOBA.muted};font-size:11px">${stamp}</span>`,
      showarrow: false, align: "left"
    },
    {
      xref: "paper", yref: "paper",
      x: 0.99, y: -0.18,
      text: `<span style="color:${CORDOBA.muted};font-size:11px">World Bank Pink Sheet · Monthly</span>`,
      showarrow: false, align: "right"
    }
  ];
}

async function exportChart(fmt) {
  if (!state.built) return;
  const baseName = `cordoba_commodity_lab_${state.activeTab}_${new Date().toISOString().slice(0,10)}`;
  const url = await Plotly.toImage(chartDiv, { format: fmt, height: 900, width: 1600, scale: 2 });
  downloadDataUrl(url, `${baseName}.${fmt}`);
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------------------------
   Dropdown population + reset
--------------------------- */

function populateSeriesDropdowns(filterText) {
  const q = (filterText || "").trim().toLowerCase();
  const names = q ? state.names.filter(n => n.toLowerCase().includes(q)) : state.names;

  seriesA.innerHTML = "";
  seriesB.innerHTML = "";

  const cap = 700;
  for (const name of names.slice(0, cap)) {
    const o1 = document.createElement("option");
    o1.value = name;
    o1.textContent = name;
    seriesA.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = name;
    o2.textContent = name;
    seriesB.appendChild(o2);
  }

  // Reasonable defaults if present
  const defA = names.find(n => /brent/i.test(n)) || names[0];
  const defB = names.find(n => /west texas|wti/i.test(n)) || names[1] || names[0];

  if (defA) seriesA.value = defA;
  if (defB) seriesB.value = defB;
}

function resetAll() {
  state.built = null;
  searchBox.value = "";
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

  kDef.textContent = "—";
  kLast.textContent = "—";
  kZ.textContent = "—";

  status.textContent = state.loaded ? "Pick series and Build." : "Load the dataset to begin.";
  renderEmpty();
}
