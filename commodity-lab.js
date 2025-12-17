/* Cordoba Capital · Commodity Lab (Phase 1) — FRED + World Bank + CSV
   Outputs:
   - Spread (A - B) + rolling z-score
   - Seasonality (avg monthly returns)
   - Curve snapshot (CSV curve upload only, Phase 1)
   - Tests: summary stats + ADF-lite screening
   - Export PNG/SVG with Cordoba stamp

   Sources:
   - FRED API: fred/series/observations :contentReference[oaicite:7]{index=7}
   - World Bank Pink Sheet Monthly historical Excel :contentReference[oaicite:8]{index=8}
*/

const CORDOBA = {
  gold: "#9A690F",
  soft: "#FFF7F0",
  ink: "#111111",
  muted: "#666666",
  border: "#E7DED4"
};

const el = (id) => document.getElementById(id);

const state = {
  activeTab: "spread",

  // CSV mode
  tsRaw: null,      // { cols: [], rows: [{date: Date, ...}] }
  curveRaw: null,   // { maturities: [], rows: [{date: Date, ...}] }

  // Unified built data (whatever the source)
  built: null,      // computed outputs

  // World Bank cache
  wb: {
    loaded: false,
    seriesMap: new Map(), // name -> [{date, value}]
    names: []
  }
};

// UI
const dataSource = el("dataSource");
const csvBlock = el("csvBlock");
const fredBlock = el("fredBlock");
const wbBlock = el("wbBlock");

const tsFile = el("tsFile");
const curveFile = el("curveFile");
const buildBtn = el("buildBtn");
const resetBtn = el("resetBtn");
const exportPngBtn = el("exportPngBtn");
const exportSvgBtn = el("exportSvgBtn");
const status = el("status");

const freq = el("freq");
const zWin = el("zWin");
const adfLag = el("adfLag");
const retType = el("retType");

const fredKey = el("fredKey");
const fredA = el("fredA");
const fredB = el("fredB");
const fredStart = el("fredStart");
const fredEnd = el("fredEnd");

const wbA = el("wbA");
const wbB = el("wbB");
const wbSearch = el("wbSearch");

const defn = el("defn");
const latestSpread = el("latestSpread");
const latestZ = el("latestZ");

const chartDiv = el("chart");
const testsBlock = el("testsBlock");
const curveHint = el("curveHint");

// Tabs
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.activeTab = t.dataset.tab;
    render();
  });
});

// Source switch
dataSource.addEventListener("change", async () => {
  const mode = dataSource.value;
  setMode(mode);
  await ensureModeReady(mode);
  updateBuildEnabled();
});

// CSV uploads
tsFile.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    state.tsRaw = await parseCSVFile(f);
    status.textContent = `Loaded CSV with columns: ${state.tsRaw.cols.filter(c => c !== "date").join(", ")}`;
    updateBuildEnabled();
  } catch (err) {
    status.textContent = `CSV error: ${err.message}`;
    state.tsRaw = null;
    updateBuildEnabled();
  }
});

curveFile.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  try {
    state.curveRaw = await parseCurveCSVFile(f);
    status.textContent = `Loaded curve CSV with maturities: ${state.curveRaw.maturities.join(", ")}`;
  } catch (err) {
    status.textContent = `Curve CSV error: ${err.message}`;
    state.curveRaw = null;
  }
});

wbSearch.addEventListener("input", () => {
  if (!state.wb.loaded) return;
  populateWorldBankDropdowns(wbSearch.value);
});

buildBtn.addEventListener("click", async () => {
  try {
    status.textContent = "Building…";
    state.built = await buildAll();
    exportPngBtn.disabled = false;
    exportSvgBtn.disabled = false;
    status.textContent = "Built successfully.";
    render();
  } catch (err) {
    status.textContent = `Build error: ${err.message}`;
  }
});

resetBtn.addEventListener("click", () => resetAll());

exportPngBtn.addEventListener("click", async () => exportChart("png"));
exportSvgBtn.addEventListener("click", async () => exportChart("svg"));

/* ---------------------------
   Mode handling
--------------------------- */

function setMode(mode) {
  csvBlock.classList.toggle("hide", mode !== "csv");
  fredBlock.classList.toggle("hide", mode !== "fred");
  wbBlock.classList.toggle("hide", mode !== "wb");

  // Clear built view on mode switch
  state.built = null;
  exportPngBtn.disabled = true;
  exportSvgBtn.disabled = true;

  defn.textContent = "—";
  latestSpread.textContent = "—";
  latestZ.textContent = "—";

  Plotly.purge(chartDiv);
  render();
}

async function ensureModeReady(mode) {
  if (mode === "fred") {
    populateFredDropdowns();
    status.textContent = "Select two FRED series (A and B), then Build.";
  }

  if (mode === "wb") {
    if (!state.wb.loaded) {
      status.textContent = "Loading World Bank Pink Sheet dataset…";
      await loadWorldBankPinkSheet();
      populateWorldBankDropdowns("");
      status.textContent = "Select two World Bank series (A and B), then Build.";
    } else {
      populateWorldBankDropdowns(wbSearch.value || "");
      status.textContent = "Select two World Bank series (A and B), then Build.";
    }
  }

  if (mode === "csv") {
    status.textContent = "Upload a CSV to begin (and optional curve CSV).";
  }
}

function updateBuildEnabled() {
  const mode = dataSource.value;
  if (mode === "csv") buildBtn.disabled = !state.tsRaw;
  if (mode === "fred") buildBtn.disabled = !(fredA.value && fredB.value);
  if (mode === "wb") buildBtn.disabled = !(state.wb.loaded && wbA.value && wbB.value);
}

/* ---------------------------
   FRED integration
--------------------------- */

const FRED_SERIES = [
  { id: "DCOILBRENTEU", name: "Brent crude (Europe) — DCOILBRENTEU" },              // :contentReference[oaicite:9]{index=9}
  { id: "DCOILWTICO", name: "WTI crude — DCOILWTICO" },
  { id: "DHHNGSP", name: "Henry Hub natural gas — DHHNGSP" },                       // :contentReference[oaicite:10]{index=10}
  { id: "GOLDAMGBD228NLBM", name: "Gold (LBMA AM) — GOLDAMGBD228NLBM" },
  { id: "PCOPPUSDM", name: "Copper (global price) — PCOPPUSDM" },                   // :contentReference[oaicite:11]{index=11}
  { id: "PALUMUSDM", name: "Aluminum (global price) — PALUMUSDM" },                 // :contentReference[oaicite:12]{index=12}
  // You can add more FRED commodity IDs here as you like.
];

function populateFredDropdowns() {
  fredA.innerHTML = "";
  fredB.innerHTML = "";

  for (const s of FRED_SERIES) {
    const o1 = document.createElement("option");
    o1.value = s.id;
    o1.textContent = s.name;
    fredA.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = s.id;
    o2.textContent = s.name;
    fredB.appendChild(o2);
  }

  // default: Brent vs WTI
  fredA.value = "DCOILBRENTEU";
  fredB.value = "DCOILWTICO";

  fredA.addEventListener("change", updateBuildEnabled);
  fredB.addEventListener("change", updateBuildEnabled);
}

async function fetchFredSeries(seriesId, apiKey, start, end) {
  // Official endpoint supports file_type=json. :contentReference[oaicite:13]{index=13}
  const params = new URLSearchParams();
  params.set("series_id", seriesId);
  params.set("file_type", "json");

  if (apiKey && apiKey.trim()) params.set("api_key", apiKey.trim());
  if (start && start.trim()) params.set("observation_start", start.trim());
  if (end && end.trim()) params.set("observation_end", end.trim());

  const url = `https://api.stlouisfed.org/fred/series/observations?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`FRED fetch failed (${seriesId})`);

  const json = await res.json();
  if (!json || !Array.isArray(json.observations)) {
    throw new Error(`FRED response unexpected (${seriesId})`);
  }

  return json.observations
    .filter(o => o.value !== "." && o.value != null)
    .map(o => ({ date: new Date(o.date), value: Number(o.value) }))
    .filter(x => Number.isFinite(x.value))
    .sort((a,b) => a.date - b.date);
}

/* ---------------------------
   World Bank Pink Sheet integration (Monthly Excel)
--------------------------- */

const WORLD_BANK_PINK_SHEET_XLSX =
  "https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx"; // :contentReference[oaicite:14]{index=14}

async function loadWorldBankPinkSheet() {
  // Downloads the official historical monthly file and parses it in the browser. :contentReference[oaicite:15]{index=15}
  const res = await fetch(WORLD_BANK_PINK_SHEET_XLSX);
  if (!res.ok) throw new Error("World Bank Pink Sheet download failed.");

  const buf = await res.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });

  // Try to choose a sensible sheet (many versions have "Monthly Prices" or similar)
  let sheetName = wb.SheetNames.find(n => /monthly/i.test(n)) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];

  // Convert to rows (array-of-arrays)
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  // Find header row by scanning for a "Date" first column and many text columns
  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx === -1) {
    throw new Error("Could not locate a header row in the World Bank file (format may have changed).");
  }

  const headers = rows[headerIdx].map(h => (h == null ? "" : String(h).trim()));
  const dataRows = rows.slice(headerIdx + 1);

  // Identify date column (first header that looks like "Date" or "Time")
  const dateCol = headers.findIndex(h => /^date$/i.test(h) || /^time$/i.test(h));
  if (dateCol === -1) throw new Error("World Bank file: could not find a Date column.");

  // Build series for every numeric column
  const seriesMap = new Map();

  for (let c = 0; c < headers.length; c++) {
    if (c === dateCol) continue;
    const name = headers[c];
    if (!name || name.length < 2) continue;
    seriesMap.set(name, []);
  }

  for (const r of dataRows) {
    const rawDate = r[dateCol];
    const d = parseWbDate(rawDate);
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

  // Cleanup: sort and drop series with too few points
  const names = [];
  for (const [name, arr] of seriesMap.entries()) {
    arr.sort((a,b) => a.date - b.date);
    if (arr.length >= 24) { // keep series with 2y+ monthly points
      names.push(name);
    } else {
      seriesMap.delete(name);
    }
  }

  names.sort((a,b) => a.localeCompare(b));

  state.wb.seriesMap = seriesMap;
  state.wb.names = names;
  state.wb.loaded = true;
}

function findHeaderRowIndex(rows) {
  // Heuristic: row where first cell is "Date" (or contains "Date") and it has many columns.
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const r = rows[i];
    if (!Array.isArray(r) || r.length < 5) continue;
    const first = r[0] == null ? "" : String(r[0]).trim();
    if (/date/i.test(first) && r.filter(x => x != null && String(x).trim().length > 0).length >= 5) {
      return i;
    }
  }

  // fallback: search anywhere for a cell equal to "Date" and treat that row as header
  for (let i = 0; i < Math.min(rows.length, 120); i++) {
    const r = rows[i];
    if (!Array.isArray(r)) continue;
    if (r.some(x => x != null && /^date$/i.test(String(x).trim()))) return i;
  }

  return -1;
}

function parseWbDate(x) {
  // World Bank sheet often uses Excel dates or YYYY-MM formats or Date objects
  if (x == null) return null;

  // If it's already a Date
  if (x instanceof Date && !Number.isNaN(+x)) return x;

  // Excel serial date
  if (typeof x === "number" && x > 20000 && x < 60000) {
    // Excel date to JS (Excel epoch 1899-12-30)
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const d = new Date(epoch.getTime() + x * 86400000);
    return d;
  }

  // String date
  const s = String(x).trim();
  if (!s) return null;

  // Accept YYYY-MM or YYYY-MM-DD
  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)) {
    const d = new Date(s.length === 7 ? `${s}-01` : s);
    return Number.isNaN(+d) ? null : d;
  }

  // Try Date parse
  const d = new Date(s);
  return Number.isNaN(+d) ? null : d;
}

function populateWorldBankDropdowns(filterText) {
  const q = (filterText || "").trim().toLowerCase();
  const names = q
    ? state.wb.names.filter(n => n.toLowerCase().includes(q))
    : state.wb.names;

  wbA.innerHTML = "";
  wbB.innerHTML = "";

  for (const name of names.slice(0, 500)) { // UI cap
    const o1 = document.createElement("option");
    o1.value = name;
    o1.textContent = name;
    wbA.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = name;
    o2.textContent = name;
    wbB.appendChild(o2);
  }

  // Try to default to “Crude oil, UK Brent” if it exists, else first two.
  const guessBrent = names.find(n => /brent/i.test(n)) || names[0];
  const guessWti = names.find(n => /west texas|wti/i.test(n)) || names[1] || names[0];

  if (guessBrent) wbA.value = guessBrent;
  if (guessWti) wbB.value = guessWti;

  wbA.addEventListener("change", updateBuildEnabled);
  wbB.addEventListener("change", updateBuildEnabled);
  updateBuildEnabled();
}

/* ---------------------------
   CSV parsing
--------------------------- */

async function parseCSVFile(file) {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) throw new Error("CSV appears empty.");

  const headers = splitCSVLine(lines[0]).map(h => h.trim());
  if (!headers[0] || headers[0].toLowerCase() !== "date") {
    throw new Error("First column must be 'date'.");
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = splitCSVLine(lines[i]);
    if (parts.length === 0) continue;
    const d = new Date(parts[0]);
    if (Number.isNaN(+d)) continue;

    const row = { date: d };
    for (let j = 1; j < headers.length; j++) {
      const v = parts[j] === undefined ? "" : String(parts[j]).trim();
      const num = v === "" ? null : Number(v);
      row[headers[j]] = Number.isFinite(num) ? num : null;
    }
    rows.push(row);
  }

  rows.sort((a, b) => a.date - b.date);
  return { cols: headers.map(h => (h === "Date" ? "date" : h)), rows };
}

async function parseCurveCSVFile(file) {
  const raw = await parseCSVFile(file);
  const maturities = raw.cols.filter(c => c !== "date");
  return { maturities, rows: raw.rows };
}

function splitCSVLine(line) {
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/* ---------------------------
   Build (unified)
--------------------------- */

async function buildAll() {
  const mode = dataSource.value;
  const f = freq.value;
  const zw = Math.max(20, Number(zWin.value || 252));
  const lag = Math.max(0, Number(adfLag.value || 1));
  const rType = retType.value;

  // Pull A/B data as {date, value} arrays
  let AName, BName, seriesAData, seriesBData;
  let curveForThisBuild = null;

  if (mode === "csv") {
    if (!state.tsRaw) throw new Error("Upload a CSV first.");
    const cols = state.tsRaw.cols.filter(c => c !== "date");
    if (cols.length < 1) throw new Error("CSV needs at least one numeric column.");

    // Use first two columns by default if present
    AName = cols[0];
    BName = cols[1] || cols[0];

    seriesAData = state.tsRaw.rows.map(r => ({ date: r.date, value: r[AName] })).filter(x => x.value != null);
    seriesBData = state.tsRaw.rows.map(r => ({ date: r.date, value: r[BName] })).filter(x => x.value != null);

    // Curve (optional, only in CSV mode in Phase 1)
    curveForThisBuild = state.curveRaw;

    // If you want dropdowns for CSV columns later, we can add them—kept simple for now.
  }

  if (mode === "fred") {
    AName = fredA.value;
    BName = fredB.value;

    const key = fredKey.value || "";
    const s = fredStart.value || "";
    const e = fredEnd.value || "";

    const a = await fetchFredSeries(AName, key, s, e);
    const b = await fetchFredSeries(BName, key, s, e);

    seriesAData = a;
    seriesBData = b;
  }

  if (mode === "wb") {
    if (!state.wb.loaded) throw new Error("World Bank dataset not loaded.");
    AName = wbA.value;
    BName = wbB.value;

    seriesAData = state.wb.seriesMap.get(AName) || [];
    seriesBData = state.wb.seriesMap.get(BName) || [];
  }

  // Align + resample + spread + z + returns
  const aligned = alignTwoSeries(seriesAData, seriesBData);
  const res = resample(aligned, f);

  const spread = res.map(r => ({
    date: r.date,
    A: r.A,
    B: r.B,
    spread: (r.A == null || r.B == null) ? null : (r.A - r.B)
  })).filter(r => r.spread != null);

  if (spread.length < 40) throw new Error("Not enough overlapping data points after alignment.");

  const zs = rollingZ(spread.map(x => x.spread), zw);
  const spreadZ = spread.map((x, i) => ({ ...x, z: zs[i] }));

  const rets = returns(spreadZ.map(x => x.spread), rType);
  const retSeries = spreadZ.map((x, i) => ({
    date: x.date,
    spread: x.spread,
    z: x.z,
    ret: rets[i]
  }));

  const season = seasonalityMonthly(retSeries);

  const spreadLevels = retSeries.map(x => x.spread).filter(v => v != null);
  const spreadReturns = retSeries.map(x => x.ret).filter(v => v != null);
  const tests = {
    summary: summaryStats(spreadReturns),
    adfSpread: adfLite(spreadLevels, lag),
    adfReturns: adfLite(spreadReturns, lag)
  };

  const definition = `${AName} minus ${BName} · ${mode.toUpperCase()} · ${f === "D" ? "Daily" : f === "W" ? "Weekly" : "Monthly"} · z(${zw})`;

  // KPI updates
  defn.textContent = definition;
  const last = [...retSeries].reverse().find(x => x.spread != null);
  const lastZ = [...retSeries].reverse().find(x => x.z != null);
  latestSpread.textContent = last ? fmt(last.spread) : "—";
  latestZ.textContent = lastZ ? fmt(lastZ.z) : "—";

  return {
    mode, AName, BName, f, zw, lag, rType,
    definition,
    series: retSeries,
    season,
    tests,
    curve: curveForThisBuild
  };
}

function alignTwoSeries(a, b) {
  // Inner join on exact date string (YYYY-MM-DD) after normalising to UTC date.
  const key = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString().slice(0,10);

  const mapA = new Map(a.map(x => [key(x.date), x.value]));
  const mapB = new Map(b.map(x => [key(x.date), x.value]));

  const out = [];
  for (const [k, va] of mapA.entries()) {
    if (!mapB.has(k)) continue;
    const vb = mapB.get(k);
    const d = new Date(k);
    if (Number.isFinite(va) && Number.isFinite(vb)) out.push({ date: d, A: va, B: vb });
  }

  out.sort((x,y) => x.date - y.date);
  return out;
}

/* ---------------------------
   Resampling
--------------------------- */

function resample(data, f) {
  if (f === "D") return data;

  const buckets = new Map();
  for (const r of data) {
    const d = r.date;
    let k;
    if (f === "W") k = isoWeekKey(d).key;
    else k = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;

    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(r);
  }

  const out = [];
  for (const arr of buckets.values()) {
    arr.sort((a,b) => a.date - b.date);
    out.push(arr[arr.length - 1]); // last obs in period
  }

  out.sort((a,b) => a.date - b.date);
  return out;
}

function isoWeekKey(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
  const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  const yr = d.getUTCFullYear();
  return { key: `${yr}-W${String(weekNo).padStart(2,"0")}` };
}

/* ---------------------------
   Math helpers
--------------------------- */

function rollingZ(vals, win) {
  const z = new Array(vals.length).fill(null);
  let sum = 0, sumsq = 0;
  const q = [];

  for (let i = 0; i < vals.length; i++) {
    const v = vals[i];
    q.push(v);
    sum += v;
    sumsq += v*v;

    if (q.length > win) {
      const old = q.shift();
      sum -= old;
      sumsq -= old*old;
    }

    if (q.length === win) {
      const mean = sum / win;
      const varr = (sumsq / win) - mean*mean;
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

function seasonalityMonthly(retSeries) {
  const buckets = Array.from({ length: 12 }, () => []);
  for (const x of retSeries) {
    if (x.ret == null) continue;
    const m = x.date.getUTCMonth();
    buckets[m].push(x.ret);
  }
  const avg = buckets.map(arr => arr.length ? mean(arr) : null);
  const n = buckets.map(arr => arr.length);
  return { avg, n };
}

function summaryStats(arr) {
  const clean = arr.filter(v => v != null && Number.isFinite(v));
  if (clean.length < 5) return { n: clean.length };

  const m = mean(clean);
  const sd = stdev(clean);
  const sk = skew(clean, m, sd);
  const ku = kurt(clean, m, sd);
  const minv = Math.min(...clean);
  const maxv = Math.max(...clean);

  return {
    n: clean.length,
    mean: m,
    stdev: sd,
    annVol: sd * Math.sqrt(252),
    skew: sk,
    kurt: ku,
    min: minv,
    max: maxv
  };
}

function mean(a) { let s = 0; for (const v of a) s += v; return s / a.length; }
function stdev(a) {
  const m = mean(a);
  let s2 = 0;
  for (const v of a) s2 += (v - m) * (v - m);
  return Math.sqrt(s2 / (a.length - 1));
}
function skew(a, m, sd) {
  if (!sd || sd === 0) return 0;
  let s3 = 0;
  for (const v of a) s3 += Math.pow((v - m) / sd, 3);
  return s3 / a.length;
}
function kurt(a, m, sd) {
  if (!sd || sd === 0) return 0;
  let s4 = 0;
  for (const v of a) s4 += Math.pow((v - m) / sd, 4);
  return s4 / a.length;
}

function fmt(x) {
  if (x == null || !Number.isFinite(x)) return "—";
  const ax = Math.abs(x);
  const dp = ax >= 100 ? 1 : ax >= 10 ? 2 : 3;
  return x.toFixed(dp);
}

/* ---------------------------
   ADF-lite + OLS
--------------------------- */

function adfLite(series, p=1) {
  const y = series.filter(v => v != null && Number.isFinite(v));
  const n = y.length;
  if (n < 40) return { ok: false, reason: "Not enough data (need ~40+ points)." };

  const dy = [];
  for (let i = 1; i < n; i++) dy.push(y[i] - y[i-1]);

  const X = [];
  const Y = [];

  for (let t = p + 1; t < n; t++) {
    const row = [1, y[t-1]];
    for (let i = 1; i <= p; i++) row.push(dy[t - i - 1]);
    X.push(row);
    Y.push(dy[t-1]);
  }

  const ols = OLS(X, Y);
  if (!ols.ok) return { ok: false, reason: ols.reason };

  const b = ols.beta[1];
  const tstat = ols.t[1];
  const crit5 = -2.86;

  return {
    ok: true,
    nObs: Y.length,
    lag: p,
    b,
    tstat,
    crit5,
    rejectUnitRootAt5: (tstat < crit5),
    note: "ADF-lite uses a rough 5% critical value (intercept only). Treat as a screening check."
  };
}

function OLS(X, Y) {
  const n = X.length;
  const k = X[0].length;
  if (n <= k + 5) return { ok: false, reason: "Not enough observations for regression." };

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtY = matVecMul(Xt, Y);

  const inv = matInv(XtX);
  if (!inv) return { ok: false, reason: "Matrix inversion failed (collinearity?)." };

  const beta = matVecMul(inv, XtY);

  const yhat = X.map(r => dot(r, beta));
  const resid = Y.map((y, i) => y - yhat[i]);

  const dof = n - k;
  const s2 = resid.reduce((a,b) => a + b*b, 0) / dof;

  const varB = inv.map(row => row.map(v => v * s2));
  const se = [];
  for (let i = 0; i < k; i++) se.push(Math.sqrt(Math.max(varB[i][i], 1e-12)));
  const t = beta.map((b,i) => b / se[i]);

  return { ok: true, beta, se, t };
}

function transpose(A) {
  const r = A.length, c = A[0].length;
  const out = Array.from({ length: c }, () => Array(r).fill(0));
  for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) out[j][i] = A[i][j];
  return out;
}
function matMul(A, B) {
  const r = A.length, c = B[0].length, mid = B.length;
  const out = Array.from({ length: r }, () => Array(c).fill(0));
  for (let i = 0; i < r; i++) {
    for (let k = 0; k < mid; k++) {
      for (let j = 0; j < c; j++) out[i][j] += A[i][k] * B[k][j];
    }
  }
  return out;
}
function matVecMul(A, v) {
  const r = A.length, c = A[0].length;
  const out = Array(r).fill(0);
  for (let i = 0; i < r; i++) {
    let s = 0;
    for (let j = 0; j < c; j++) s += A[i][j] * v[j];
    out[i] = s;
  }
  return out;
}
function matInv(M) {
  const n = M.length;
  const A = M.map(row => row.slice());
  const I = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let i = 0; i < n; i++) {
    let pivot = A[i][i];
    let pivotRow = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(A[r][i]) > Math.abs(pivot)) {
        pivot = A[r][i];
        pivotRow = r;
      }
    }
    if (Math.abs(pivot) < 1e-12) return null;

    if (pivotRow !== i) {
      [A[i], A[pivotRow]] = [A[pivotRow], A[i]];
      [I[i], I[pivotRow]] = [I[pivotRow], I[i]];
    }

    const div = A[i][i];
    for (let j = 0; j < n; j++) { A[i][j] /= div; I[i][j] /= div; }

    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const factor = A[r][i];
      for (let j = 0; j < n; j++) {
        A[r][j] -= factor * A[i][j];
        I[r][j] -= factor * I[i][j];
      }
    }
  }
  return I;
}
function dot(a, b) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }

/* ---------------------------
   Rendering
--------------------------- */

function render() {
  if (!state.built) {
    Plotly.newPlot(chartDiv, [], baseLayout("Choose a source and Build"), { displayModeBar: false, responsive: true });
    testsBlock.style.display = "none";
    curveHint.style.display = "none";
    return;
  }

  testsBlock.style.display = "none";
  curveHint.style.display = "none";

  if (state.activeTab === "spread") renderSpread();
  if (state.activeTab === "season") renderSeasonality();
  if (state.activeTab === "curve") renderCurve();
  if (state.activeTab === "tests") renderTests();
}

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
      showarrow: false,
      align: "left"
    },
    {
      xref: "paper", yref: "paper",
      x: 0.99, y: -0.18,
      text: `<span style="color:${CORDOBA.muted};font-size:11px">Beta · Testing only</span>`,
      showarrow: false,
      align: "right"
    }
  ];
}

function renderSpread() {
  const s = state.built.series;
  const x = s.map(d => d.date);
  const y = s.map(d => d.spread);
  const z = s.map(d => d.z);

  const traces = [
    { x, y, type: "scatter", mode: "lines", name: "Spread", line: { width: 2 } },
    { x, y: z, type: "scatter", mode: "lines", name: "Z-score", yaxis: "y2", line: { width: 2, dash: "dot" } }
  ];

  const layout = baseLayout(state.built.definition);
  layout.yaxis.title = "Spread (A - B)";
  layout.yaxis2 = {
    title: "Z-score",
    overlaying: "y",
    side: "right",
    gridcolor: "rgba(0,0,0,0)",
    zeroline: false
  };

  layout.shapes = [
    {
      type: "line",
      xref: "paper", x0: 0, x1: 1,
      yref: "y2", y0: 2, y1: 2,
      line: { width: 1, color: "rgba(154,105,15,0.35)" }
    },
    {
      type: "line",
      xref: "paper", x0: 0, x1: 1,
      yref: "y2", y0: -2, y1: -2,
      line: { width: 1, color: "rgba(154,105,15,0.35)" }
    }
  ];

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });
}

function renderSeasonality() {
  const m = state.built.season.avg;
  const n = state.built.season.n;
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const traces = [{ x: labels, y: m, type: "bar", name: "Avg monthly return" }];

  const layout = baseLayout("Seasonality · average monthly returns (spread)");
  layout.yaxis.title = "Average return";
  layout.annotations = [
    ...brandStamp(),
    {
      xref: "paper", yref: "paper",
      x: 0.01, y: 1.09,
      text: `<span style="color:${CORDOBA.muted};font-size:12px">Obs per month: ${n.join(", ")}</span>`,
      showarrow: false,
      align: "left"
    }
  ];

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });
}

function renderCurve() {
  // Only available in CSV mode in Phase 1 (because WB/FRED don’t provide full curves for free in a stable way).
  if (!state.built.curve) {
    Plotly.newPlot(chartDiv, [], baseLayout("Curve · upload a curve CSV (Phase 1)"), { displayModeBar: false, responsive: true });
    curveHint.style.display = "block";
    curveHint.innerHTML = `
      <div style="font-family:Times New Roman,Times,serif;font-weight:600;font-size:16px;margin-bottom:6px">Curve not available</div>
      <div class="muted">
        Phase 1 supports curve snapshots via CSV upload only. In Phase 2 we can add curve feeds where available.
      </div>
    `;
    return;
  }

  const rows = state.built.curve.rows;
  if (!rows || !rows.length) return;

  const maturities = state.built.curve.maturities;
  const last = rows[rows.length - 1];

  const x = maturities;
  const y = maturities.map(m => last[m]).map(v => (v == null ? null : v));

  const traces = [{ x, y, type: "scatter", mode: "lines+markers", name: "Curve" }];

  const layout = baseLayout(`Curve snapshot · ${last.date.toISOString().slice(0,10)}`);
  layout.yaxis.title = "Level";
  layout.xaxis.title = "Maturity";

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar: false, responsive: true });
}

function renderTests() {
  testsBlock.style.display = "block";

  const t = state.built.tests;
  const s = t.summary;

  const adf1 = t.adfSpread;
  const adf2 = t.adfReturns;

  const fmtBool = (b) => (b ? "Yes" : "No");

  testsBlock.innerHTML = `
    <div style="font-family:Times New Roman,Times,serif;font-weight:600;font-size:18px;margin-bottom:10px">
      Tests (Phase 1)
    </div>

    <div class="muted" style="margin-bottom:12px">
      Screening checks for discipline. If the series is structurally trending, z-scores can lie.
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="border:1px solid ${CORDOBA.border};border-radius:14px;padding:12px">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${CORDOBA.muted};margin-bottom:6px">Return summary (spread)</div>
        <div style="font-size:13px;line-height:1.5">
          n: <span class="mono">${s.n ?? "—"}</span><br/>
          mean: <span class="mono">${s.mean != null ? s.mean.toFixed(6) : "—"}</span><br/>
          stdev: <span class="mono">${s.stdev != null ? s.stdev.toFixed(6) : "—"}</span><br/>
          ann vol (252): <span class="mono">${s.annVol != null ? s.annVol.toFixed(4) : "—"}</span><br/>
          skew: <span class="mono">${s.skew != null ? s.skew.toFixed(3) : "—"}</span><br/>
          kurt: <span class="mono">${s.kurt != null ? s.kurt.toFixed(3) : "—"}</span><br/>
          min: <span class="mono">${s.min != null ? s.min.toFixed(6) : "—"}</span><br/>
          max: <span class="mono">${s.max != null ? s.max.toFixed(6) : "—"}</span>
        </div>
      </div>

      <div style="border:1px solid ${CORDOBA.border};border-radius:14px;padding:12px">
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${CORDOBA.muted};margin-bottom:6px">ADF-lite (spread levels)</div>
        ${adfCard(adf1)}
        <div style="height:10px"></div>
        <div style="font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:${CORDOBA.muted};margin-bottom:6px">ADF-lite (spread returns)</div>
        ${adfCard(adf2)}
      </div>
    </div>
  `;

  const layout = baseLayout("Tests view · charts come from other tabs");
  Plotly.newPlot(chartDiv, [], layout, { displayModeBar: false, responsive: true });

  function adfCard(adf) {
    if (!adf.ok) return `<div class="muted">Not available: ${adf.reason}</div>`;
    return `
      <div style="font-size:13px;line-height:1.5">
        n obs: <span class="mono">${adf.nObs}</span><br/>
        lag p: <span class="mono">${adf.lag}</span><br/>
        b (y_{t-1}): <span class="mono">${adf.b.toFixed(6)}</span><br/>
        t-stat: <span class="mono">${adf.tstat.toFixed(3)}</span><br/>
        5% crit (rough): <span class="mono">${adf.crit5.toFixed(2)}</span><br/>
        reject unit root at 5%: <span class="mono">${fmtBool(adf.rejectUnitRootAt5)}</span>
        <div class="muted" style="margin-top:6px">${adf.note}</div>
      </div>
    `;
  }
}

/* ---------------------------
   Export
--------------------------- */

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
   Reset
--------------------------- */

function resetAll() {
  state.tsRaw = null;
  state.curveRaw = null;
  state.built = null;

  tsFile.value = "";
  curveFile.value = "";
  fredKey.value = "";
  fredStart.value = "";
  fredEnd.value = "";
  wbSearch.value = "";

  buildBtn.disabled = true;
  exportPngBtn.disabled = true;
  exportSvgBtn.disabled = true;

  defn.textContent = "—";
  latestSpread.textContent = "—";
  latestZ.textContent = "—";

  testsBlock.style.display = "none";
  curveHint.style.display = "none";
  Plotly.purge(chartDiv);

  status.textContent = "Reset done.";
  render();
}

/* ---------------------------
   Initial boot
--------------------------- */

(function boot() {
  setMode(dataSource.value);
  populateFredDropdowns();
  updateBuildEnabled();
  render();
})();

function renderEmpty() {
  Plotly.newPlot(chartDiv, [], baseLayout("Choose a source and Build"), { displayModeBar: false, responsive: true });
}

function render() {
  if (!state.built) {
    renderEmpty();
    testsBlock.style.display = "none";
    curveHint.style.display = "none";
    return;
  }

  testsBlock.style.display = "none";
  curveHint.style.display = "none";

  if (state.activeTab === "spread") renderSpread();
  if (state.activeTab === "season") renderSeasonality();
  if (state.activeTab === "curve") renderCurve();
  if (state.activeTab === "tests") renderTests();
}
