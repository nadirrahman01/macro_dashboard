/* Cordoba Capital · Commodity Lab
   World Bank pull (cached) + Excel upload fallback.

   Why we cache:
   - The World Bank Pink Sheet Excel is hosted on thedocs.worldbank.org and can be blocked by browsers (CORS).
   - For a client-facing institutional tool, we always load from same-origin cache.
   - A GitHub Action keeps the cache up to date by downloading from World Bank on a schedule.

   Source file (World Bank Pink Sheet historical monthly xlsx): :contentReference[oaicite:1]{index=1}
*/

const CORDOBA = { gold:"#9A690F", soft:"#FFF7F0", ink:"#111111", muted:"#6A6A6A", border:"#E7DED4" };

// This is the cached file in your repo (kept fresh by GitHub Action)
const WB_CACHE_PATH = "/data/worldbank/CMO-Historical-Data-Monthly.xlsx";

// This is the World Bank original source (used by the GitHub Action)
const WB_SOURCE_URL = "https://thedocs.worldbank.org/en/doc/5d903e848db1d1b83e0ec8f744e55570-0350012021/related/CMO-Historical-Data-Monthly.xlsx";

const el = (id) => document.getElementById(id);

// UI
const loadWbBtn = el("loadWbBtn");
const reloadBtn = el("reloadBtn");
const fileInput = el("fileInput");
const loadStatus = el("loadStatus");

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

const demandYoY = el("demandYoY");
const supplyYoY = el("supplyYoY");
const invChg = el("invChg");
const balanceOverride = el("balanceOverride");
const ed = el("ed");
const es = el("es");
const scenarioRange = el("scenarioRange");
const scenarioSteps = el("scenarioSteps");

const exportPngBtn = el("exportPngBtn");
const exportSvgBtn = el("exportSvgBtn");
const exportPackBtn = el("exportPackBtn");

const kDef = el("kDef");
const kLast = el("kLast");
const kZ = el("kZ");
const kSrc = el("kSrc");

const chartDiv = el("chart");
const note = el("note");

const tabs = document.querySelectorAll(".tab");

const state = {
  loaded: false,
  source: null, // "World Bank" or "Upload"
  // seriesMap: rawName -> {rawName, cleanName, sector, unitGuess, points:[{date,value}]}
  seriesMap: new Map(),
  seriesList: [],
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
loadWbBtn.addEventListener("click", async () => {
  await loadWorldBankCached();
});

reloadBtn.addEventListener("click", async () => {
  hardResetRuntime();
  await loadWorldBankCached(true);
});

fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (!f) return;

  hardResetRuntime();
  loadStatus.textContent = "Reading uploaded Excel…";

  try {
    const buf = await f.arrayBuffer();
    await parseWorkbook(buf);
    state.source = `Upload · ${f.name}`;
    kSrc.textContent = "Upload";
    loadStatus.textContent = `Loaded upload: ${state.seriesList.length} series.`;
    status.textContent = "Pick series and Build.";
    buildBtn.disabled = false;
    reloadBtn.disabled = false;
  } catch (e) {
    loadStatus.textContent = `Upload failed: ${e.message}`;
    status.textContent = "Could not load upload.";
  }
});

[sector, quickPick].forEach(x => x.addEventListener("change", () => refreshDropdowns()));
searchBox.addEventListener("input", () => refreshDropdowns());

[
  seriesA, seriesB, viewMode, zWin, retType, smooth,
  demandYoY, supplyYoY, invChg, balanceOverride, ed, es, scenarioRange, scenarioSteps
].forEach(ctrl => {
  ctrl.addEventListener("change", () => {
    if (!state.built) return;
    try { state.built = buildAll(); render(); }
    catch(e){ status.textContent = `Update error: ${e.message}`; }
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

exportPngBtn.addEventListener("click", () => exportChart("png"));
exportSvgBtn.addEventListener("click", () => exportChart("svg"));
exportPackBtn.addEventListener("click", () => exportInvestorPack());

// boot
renderEmpty();

// ---------- world bank cached load ----------
async function loadWorldBankCached(isReload=false) {
  try {
    loadWbBtn.disabled = true;
    reloadBtn.disabled = true;
    buildBtn.disabled = true;

    loadStatus.textContent = isReload ? "Reloading World Bank cache…" : "Loading World Bank cache…";
    status.textContent = "Loading dataset…";

    const res = await fetch(WB_CACHE_PATH, { cache: "no-store" });
    if (!res.ok) {
      throw new Error(
        `Missing cache file at ${WB_CACHE_PATH}. Add the GitHub Action below (or upload Excel).`
      );
    }

    const buf = await res.arrayBuffer();
    await parseWorkbook(buf);

    state.source = "World Bank · Pink Sheet";
    kSrc.textContent = "World Bank";
    loadStatus.textContent = `Loaded World Bank: ${state.seriesList.length} series (monthly).`;
    status.textContent = "Pick series and Build.";
    buildBtn.disabled = false;
    reloadBtn.disabled = false;

  } catch (e) {
    loadStatus.textContent = e.message;
    status.textContent = "If needed, upload Excel below.";
    loadWbBtn.disabled = false;
    reloadBtn.disabled = false;
  }
}

// ---------- parse workbook (World Bank OR upload) ----------
async function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });

  // World Bank file has varying tab names over time; pick a “monthly/prices” tab if it exists.
  const sheetName =
    wb.SheetNames.find(n => /monthly/i.test(n)) ||
    wb.SheetNames.find(n => /prices/i.test(n)) ||
    wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const headerIdx = findHeaderRowIndex(rows);
  if (headerIdx === -1) throw new Error("Could not locate header row.");

  const headers = rows[headerIdx].map(h => (h == null ? "" : String(h).trim()));
  const dateCol = headers.findIndex(h => /^date$/i.test(h) || /^time$/i.test(h));
  if (dateCol === -1) throw new Error("Could not find a Date column.");

  // Build raw series arrays
  const rawSeries = new Map();
  for (let c = 0; c < headers.length; c++) {
    if (c === dateCol) continue;
    const rawName = headers[c];
    if (!rawName || rawName.length < 2) continue;
    rawSeries.set(rawName, []);
  }

  const dataRows = rows.slice(headerIdx + 1);
  for (const r of dataRows) {
    const d = parseDate(r[dateCol]);
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

  // Clean & filter to “real” commodity series
  state.seriesMap.clear();
  state.seriesList = [];

  for (const [rawName, pts] of rawSeries.entries()) {
    pts.sort((a,b)=>a.date-b.date);

    // Keep meaningful series only (avoid empty columns / short runs)
    if (pts.length < 48) continue;

    const cleanName = cleanSeriesName(rawName);
    const sec = classifySector(rawName);
    const unit = guessUnit(rawName);

    const obj = { rawName, cleanName, sector: sec, unitGuess: unit, points: pts };
    state.seriesMap.set(rawName, obj);
    state.seriesList.push(obj);
  }

  state.seriesList.sort((a,b)=>a.cleanName.localeCompare(b.cleanName));
  state.loaded = true;

  // defaults
  sector.value = "ALL";
  quickPick.value = "";
  searchBox.value = "";

  refreshDropdowns(true);
}

// ---------- dropdowns ----------
function refreshDropdowns(setDefaults=false) {
  if (!state.loaded) return;

  // quick pick nudges the search so users actually see the series list update
  const qp = quickPick.value;
  if (qp) applyQuickPick(qp);

  const sec = sector.value;
  const q = (searchBox.value || "").trim().toLowerCase();

  const filtered = state.seriesList.filter(s => {
    const okSector = (sec === "ALL") ? true : s.sector === sec;
    const okText = !q ? true :
      s.cleanName.toLowerCase().includes(q) || s.rawName.toLowerCase().includes(q);
    return okSector && okText;
  });

  seriesA.innerHTML = "";
  seriesB.innerHTML = "";

  for (const s of filtered.slice(0, 700)) {
    const label = `${s.cleanName}${s.unitGuess ? " · " + s.unitGuess : ""}`;

    const o1 = document.createElement("option");
    o1.value = s.rawName;
    o1.textContent = label;
    seriesA.appendChild(o1);

    const o2 = document.createElement("option");
    o2.value = s.rawName;
    o2.textContent = label;
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
  const map = {
    BRENT: /brent/i,
    WTI: /\bwti\b|west texas/i,
    GAS_EU: /natural gas.*europe|gas.*europe/i,
    COAL_AUS: /coal.*australia/i,
    COPPER: /copper/i,
    GOLD: /\bgold\b/i,
    WHEAT: /\bwheat\b/i,
    MAIZE: /maize|corn/i,
    SUGAR: /\bsugar\b/i
  };
  const rx = map[code];
  if (!rx) return;
  const picked = pickByRegex(rx);
  if (!picked) return;
  searchBox.value = picked.cleanName;
}

function pickByRegex(rx) {
  return state.seriesList.find(s => rx.test(s.rawName) || rx.test(s.cleanName));
}

// ---------- build ----------
function buildAll() {
  if (!state.loaded) throw new Error("No data loaded.");

  const AName = seriesA.value;
  const BName = seriesB.value;
  const mode = viewMode.value;

  const A = state.seriesMap.get(AName)?.points || [];
  const B = state.seriesMap.get(BName)?.points || [];

  if (!A.length) throw new Error("Series A has no data.");
  if (mode !== "single" && !B.length) throw new Error("Series B has no data.");

  const zw = Math.max(12, Number(zWin.value || 60));
  const rType = retType.value;
  const sm = smooth.value;

  const aligned = (mode === "single")
    ? A.map(x => ({ date: x.date, a: x.value, b: null }))
    : alignTwo(A, B);

  let y = [];
  if (mode === "single") y = aligned.map(r => ({ date: r.date, y: r.a }));
  if (mode === "spread") y = aligned.map(r => ({ date: r.date, y: r.a - r.b }));
  if (mode === "ratio")  y = aligned.map(r => ({ date: r.date, y: r.b === 0 ? null : r.a / r.b })).filter(p => p.y != null);

  if (sm !== "none") {
    const win = sm === "ma3" ? 3 : sm === "ma6" ? 6 : 12;
    y = movingAverage(y, win);
  }

  if (y.length < zw + 10) throw new Error("Not enough history for z-window.");

  const z = rollingZ(y.map(p => p.y), zw);
  const ret = returns(y.map(p => p.y), rType);

  const series = y.map((p,i)=>({ date:p.date, y:p.y, z:z[i], ret:ret[i] }));

  const season = seasonality(series);
  const balance = balanceEngine();

  const ALabel = state.seriesMap.get(AName)?.cleanName || AName;
  const BLabel = state.seriesMap.get(BName)?.cleanName || BName;

  const definition =
    mode === "single" ? `${ALabel} · level`
    : mode === "spread" ? `${ALabel} − ${BLabel} · spread`
    : `${ALabel} / ${BLabel} · ratio`;

  const last = [...series].reverse().find(x => x.y != null);
  const lastZ = [...series].reverse().find(x => x.z != null);

  kDef.textContent = `${definition} · z(${zw})`;
  kLast.textContent = last ? fmt(last.y) : "—";
  kZ.textContent = lastZ ? fmt(lastZ.z) : "—";

  return {
    meta: {
      definition,
      source: state.source,
      mode, zw, rType, sm,
      seriesA: ALabel,
      seriesB: BLabel,
      builtAt: new Date().toISOString(),
      worldBankSourceUrl: WB_SOURCE_URL
    },
    series,
    season,
    balance
  };
}

// ---------- render ----------
function render() {
  if (!state.built) return renderEmpty();

  note.style.display = "none";

  if (state.activeTab === "market") return renderMarket();
  if (state.activeTab === "season") return renderSeason();
  if (state.activeTab === "balance") return renderBalance();
  if (state.activeTab === "stress") return renderStress();
}

function renderEmpty() {
  Plotly.newPlot(chartDiv, [], baseLayout("Load data to begin"), { displayModeBar:false, responsive:true });
  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:'Times New Roman',Times,serif;font-weight:700;font-size:16px;margin-bottom:6px">
      What this is
    </div>
    <div class="muted">
      This is a client-ready commodity workbench. Load World Bank Pink Sheet data, or upload an Excel file.
      Then build levels, spreads, and scenario ranges with exportable Cordoba-stamped charts.
    </div>
  `;
}

function renderMarket() {
  const s = state.built.series;
  const x = s.map(d=>d.date);
  const y = s.map(d=>d.y);
  const z = s.map(d=>d.z);

  const traces = [
    { x, y, type:"scatter", mode:"lines", name:"Level / Spread / Ratio", line:{ width:2 } },
    { x, y:z, type:"scatter", mode:"lines", name:"Z-score", yaxis:"y2", line:{ width:2, dash:"dot" } }
  ];

  const layout = baseLayout(state.built.meta.definition);
  layout.yaxis.title = "Value";
  layout.yaxis2 = { title:"Z-score", overlaying:"y", side:"right", gridcolor:"rgba(0,0,0,0)", zeroline:false };

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar:false, responsive:true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:'Times New Roman',Times,serif;font-weight:700;font-size:16px;margin-bottom:6px">
      Investor framing
    </div>
    <div class="muted">
      This panel answers “where are we?”. Z-score keeps the call honest. If you need a big catalyst,
      you normally want the chart to look stretched. If it’s not stretched, the thesis needs more work.
    </div>
  `;
}

function renderSeason() {
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const avg = state.built.season.avg;
  const n = state.built.season.n;

  const traces = [{ x:labels, y:avg, type:"bar", name:"Avg monthly return" }];
  const layout = baseLayout("Seasonality · average monthly returns");
  layout.yaxis.title = "Average return";
  layout.annotations = [
    ...layout.annotations,
    {
      xref:"paper", yref:"paper", x:0.01, y:1.09,
      text:`<span style="color:${CORDOBA.muted};font-size:12px">Obs per month: ${n.join(", ")}</span>`,
      showarrow:false, align:"left"
    }
  ];

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar:false, responsive:true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:'Times New Roman',Times,serif;font-weight:700;font-size:16px;margin-bottom:6px">
      Why this exists
    </div>
    <div class="muted">
      It’s a quick lie detector. If your narrative depends on a seasonal swing, it should show up here.
      If it doesn’t, either widen your range or reduce size.
    </div>
  `;
}

function renderBalance() {
  const b = state.built.balance;
  const traces = [{
    x: b.scenarios.map(p=>p.balanceShock),
    y: b.scenarios.map(p=>p.impliedMove),
    type:"scatter",
    mode:"lines+markers",
    name:"Implied price move"
  }];

  const layout = baseLayout("Balance · assumptions → implied price move");
  layout.xaxis.title = "Net balance shock (% of demand, + tighter)";
  layout.yaxis.title = "Implied price move (%)";

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar:false, responsive:true });

  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:'Times New Roman',Times,serif;font-weight:700;font-size:16px;margin-bottom:6px">
      What clients pay for
    </div>
    <div class="muted">
      This turns “tight” or “loose” into numbers. You write down supply, demand, inventory assumptions,
      then you get an implied range. Export it so the view is auditable.
    </div>
  `;
}

function renderStress() {
  const g = state.built.balance.stressGrid;
  const traces = [{
    x: g.demandShocks,
    y: g.supplyShocks,
    z: g.impliedMoves,
    type:"surface",
    name:"Implied move"
  }];

  const layout = baseLayout("Stress · demand shock vs supply shock");
  layout.scene = {
    xaxis:{ title:"Demand shock (%)" },
    yaxis:{ title:"Supply shock (%)" },
    zaxis:{ title:"Implied price move (%)" }
  };
  layout.margin = { l:20, r:20, t:60, b:20 };

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar:false, responsive:true });
}

// ---------- exports ----------
function enableExports(){
  exportPngBtn.disabled = false;
  exportSvgBtn.disabled = false;
  exportPackBtn.disabled = false;
}

async function exportChart(fmt){
  if (!state.built) return;
  const base = `cordoba_commodity_${state.activeTab}_${new Date().toISOString().slice(0,10)}`;
  const url = await Plotly.toImage(chartDiv, { format:fmt, height:900, width:1600, scale:2 });
  download(url, `${base}.${fmt}`);
}

function exportInvestorPack(){
  if (!state.built) return;

  const pack = {
    cordoba: { product:"Commodity Lab", exportedAt:new Date().toISOString(), brand:{primary:CORDOBA.gold} },
    selection: state.built.meta,
    balanceInputs: state.built.balance.inputs,
    kpis: { definition:kDef.textContent, latestLevel:kLast.textContent, latestZ:kZ.textContent, source:kSrc.textContent }
  };

  const blob = new Blob([JSON.stringify(pack, null, 2)], { type:"application/json" });
  const url = URL.createObjectURL(blob);
  download(url, `cordoba_investor_pack_${new Date().toISOString().slice(0,10)}.json`);
  URL.revokeObjectURL(url);
}

function download(dataUrl, filename){
  const a=document.createElement("a");
  a.href=dataUrl; a.download=filename;
  document.body.appendChild(a); a.click(); a.remove();
}

// ---------- balance engine ----------
function balanceEngine(){
  const dYoY = Number(demandYoY.value || 0);
  const sYoY = Number(supplyYoY.value || 0);
  const inv = Number(invChg.value || 0);

  const edAbs = Math.max(0.01, Number(ed.value || 0.2));
  const esVal = Math.max(0.01, Number(es.value || 0.1));

  let baseBalance = (dYoY - sYoY - inv);
  if (String(balanceOverride.value||"").trim() !== "") baseBalance = Number(balanceOverride.value);

  const denom = edAbs + esVal;

  const rng = Math.max(0.5, Number(scenarioRange.value || 2));
  const steps = Math.max(3, Math.floor(Number(scenarioSteps.value || 9)));
  const start = baseBalance - rng;
  const end = baseBalance + rng;

  const scenarios = [];
  for (let i=0;i<steps;i++){
    const bal = start + (i*(end-start))/(steps-1);
    scenarios.push({ balanceShock: bal, impliedMove: bal/denom });
  }

  const ds = linspace(-3,3,13);
  const ss = linspace(-3,3,13);
  const impliedMoves = [];
  for (let yi=0;yi<ss.length;yi++){
    const row=[];
    for (let xi=0;xi<ds.length;xi++){
      const bal = (ds[xi] - ss[yi] - inv);
      row.push(bal/denom);
    }
    impliedMoves.push(row);
  }

  return {
    inputs: { demandYoY:dYoY, supplyYoY:sYoY, inventorySwing:inv, demandElasticityAbs:edAbs, supplyElasticity:esVal, baseBalanceShock:baseBalance },
    scenarios,
    stressGrid: { demandShocks:ds, supplyShocks:ss, impliedMoves }
  };
}

// ---------- utilities ----------
function hardResetRuntime(){
  state.loaded=false;
  state.seriesMap.clear();
  state.seriesList=[];
  state.built=null;

  buildBtn.disabled=true;
  exportPngBtn.disabled=true;
  exportSvgBtn.disabled=true;
  exportPackBtn.disabled=true;

  kDef.textContent="—";
  kLast.textContent="—";
  kZ.textContent="—";
  kSrc.textContent="—";
}

function fullReset(){
  state.built=null;
  viewMode.value="single";
  zWin.value=60;
  retType.value="log";
  smooth.value="none";

  demandYoY.value=2.0;
  supplyYoY.value=1.5;
  invChg.value=0.0;
  balanceOverride.value="";
  ed.value=0.20;
  es.value=0.10;
  scenarioRange.value=2.0;
  scenarioSteps.value=9;

  exportPngBtn.disabled=true;
  exportSvgBtn.disabled=true;
  exportPackBtn.disabled=true;

  kDef.textContent="—";
  kLast.textContent="—";
  kZ.textContent="—";

  status.textContent = state.loaded ? "Pick series and Build." : "Load data to begin.";
  renderEmpty();
}

function baseLayout(title){
  return {
    title:{ text:`<span style="font-family:'Times New Roman',Times,serif;font-weight:700">${escapeHtml(title)}</span>`, x:0.02 },
    paper_bgcolor:"#ffffff",
    plot_bgcolor:"#ffffff",
    margin:{ l:56, r:18, t:60, b:52 },
    xaxis:{ gridcolor:"rgba(0,0,0,0.06)", zeroline:false },
    yaxis:{ gridcolor:"rgba(0,0,0,0.06)", zeroline:false },
    font:{ family:"Helvetica, Arial, sans-serif", color:CORDOBA.ink },
    annotations: brandStamp(state.built?.meta)
  };
}

function brandStamp(meta){
  const d=new Date().toISOString().slice(0,10);
  const left = `${d} · Cordoba Capital`;
  const right = meta?.source ? `${meta.source} · monthly` : "monthly";
  return [
    { xref:"paper", yref:"paper", x:0.01, y:-0.18, text:`<span style="color:${CORDOBA.muted};font-size:11px">${escapeHtml(left)}</span>`, showarrow:false, align:"left" },
    { xref:"paper", yref:"paper", x:0.99, y:-0.18, text:`<span style="color:${CORDOBA.muted};font-size:11px">${escapeHtml(right)}</span>`, showarrow:false, align:"right" }
  ];
}

function escapeHtml(s){
  return String(s||"")
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#039;");
}

function findHeaderRowIndex(rows){
  for (let i=0;i<Math.min(rows.length,200);i++){
    const r=rows[i];
    if (!Array.isArray(r) || r.length<5) continue;
    const first = r[0]==null ? "" : String(r[0]).trim();
    if (/date/i.test(first) && r.filter(x=>x!=null && String(x).trim().length>0).length>=5) return i;
  }
  for (let i=0;i<Math.min(rows.length,260);i++){
    const r=rows[i];
    if (!Array.isArray(r)) continue;
    if (r.some(x=>x!=null && /^date$/i.test(String(x).trim()))) return i;
  }
  return -1;
}

function parseDate(x){
  if (x==null) return null;
  if (x instanceof Date && !Number.isNaN(+x)) return x;

  // Excel serial
  if (typeof x==="number" && x>20000 && x<60000){
    const epoch = new Date(Date.UTC(1899,11,30));
    return new Date(epoch.getTime() + x*86400000);
  }

  const s=String(x).trim();
  if (!s) return null;

  if (/^\d{4}-\d{2}(-\d{2})?$/.test(s)){
    const d = new Date(s.length===7 ? `${s}-01` : s);
    return Number.isNaN(+d) ? null : d;
  }

  const d=new Date(s);
  return Number.isNaN(+d) ? null : d;
}

function alignTwo(A,B){
  const key = (d)=> new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0,10);
  const mA=new Map(A.map(p=>[key(p.date), p.value]));
  const mB=new Map(B.map(p=>[key(p.date), p.value]));
  const out=[];
  for (const [k,va] of mA.entries()){
    if (!mB.has(k)) continue;
    const vb=mB.get(k);
    if (!Number.isFinite(va) || !Number.isFinite(vb)) continue;
    out.push({ date:new Date(k), a:va, b:vb });
  }
  out.sort((x,y)=>x.date-y.date);
  return out;
}

function movingAverage(series, win){
  const out=[]; let sum=0; const q=[];
  for (let i=0;i<series.length;i++){
    const v=series[i].y;
    q.push(v); sum+=v;
    if (q.length>win) sum-=q.shift();
    if (q.length===win) out.push({ date:series[i].date, y:sum/win });
  }
  return out;
}

function rollingZ(vals, win){
  const z=new Array(vals.length).fill(null);
  let sum=0,sumsq=0; const q=[];
  for (let i=0;i<vals.length;i++){
    const v=vals[i];
    q.push(v); sum+=v; sumsq+=v*v;
    if (q.length>win){
      const old=q.shift();
      sum-=old; sumsq-=old*old;
    }
    if (q.length===win){
      const mean=sum/win;
      const varr=(sumsq/win) - mean*mean;
      const sd=Math.sqrt(Math.max(varr, 1e-12));
      z[i]=(v-mean)/sd;
    }
  }
  return z;
}

function returns(levels, type="log"){
  const r=new Array(levels.length).fill(null);
  for (let i=1;i<levels.length;i++){
    const a=levels[i-1], b=levels[i];
    if (a==null || b==null) { r[i]=null; continue; }
    r[i] = (type==="log") ? Math.log(b/a) : (b/a)-1;
  }
  return r;
}

function seasonality(series){
  const buckets=Array.from({length:12},()=>[]);
  for (const x of series){
    if (x.ret==null || !Number.isFinite(x.ret)) continue;
    buckets[x.date.getUTCMonth()].push(x.ret);
  }
  return {
    avg: buckets.map(a=>a.length? (a.reduce((s,v)=>s+v,0)/a.length) : null),
    n: buckets.map(a=>a.length)
  };
}

function fmt(x){
  if (x==null || !Number.isFinite(x)) return "—";
  const ax=Math.abs(x);
  const dp=ax>=100?1:ax>=10?2:3;
  return x.toFixed(dp);
}

function linspace(a,b,n){
  const out=[];
  for (let i=0;i<n;i++) out.push(a + (i*(b-a))/(n-1));
  return out;
}

// ---------- naming / classification ----------
function cleanSeriesName(raw){
  return String(raw).trim().replace(/\s+/g," ");
}

function classifySector(name){
  const s=String(name).toLowerCase();
  if (/\bindex\b|indices|non-energy|energy price index|metals and minerals index|agriculture index/.test(s)) return "INDEX";
  if (/crude|brent|wti|dubai|oil|gasoline|diesel|fuel|natural gas|lng|coal|propane|naphtha/.test(s)) return "ENERGY";
  if (/urea|dap|phosphate|potash|fertili/.test(s)) return "FERTS";
  if (/gold|silver|platinum|palladium|copper|aluminum|aluminium|zinc|nickel|lead|tin|iron ore|steel/.test(s)) return "METALS";
  if (/wheat|maize|corn|rice|soy|beans|coffee|cocoa|tea|sugar|cotton|beef|pork|poultry|banana|orange|palm oil|palmoil/.test(s)) return "AGRI";
  return "ALL";
}

function guessUnit(name){
  const s=String(name).toLowerCase();
  if (/crude|brent|wti|oil/.test(s)) return "$/bbl";
  if (/gold|silver|platinum|palladium/.test(s)) return "$/oz";
  if (/copper|aluminum|aluminium|zinc|nickel|lead|tin/.test(s)) return "$/mt";
  if (/coal|iron ore/.test(s)) return "$/mt";
  if (/wheat|maize|corn|rice|soy/.test(s)) return "$/mt";
  if (/\bindex\b|indices|price index/.test(s)) return "index";
  return "";
}
