/* Cordoba Capital · Commodity Lab
   World Bank LIVE (Indicators API) + Excel upload override

   We use:
   - World Bank Indicators API (v2)
   - GEM source (id=15) which is available through /v2/sources :contentReference[oaicite:1]{index=1}
   - API docs for paging, frequency, MRV etc :contentReference[oaicite:2]{index=2}
*/

const CORDOBA = { gold:"#9A690F", soft:"#FFF7F0", ink:"#111111", muted:"#6A6A6A", border:"#E7DED4" };
const WB_API = "https://api.worldbank.org/v2";
const WB_SOURCE_ID = 15; // Global Economic Monitor (GEM) :contentReference[oaicite:3]{index=3}

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
  source: null, // "World Bank (GEM API)" or "Upload"
  indicatorList: [], // [{id,name,unit,sourceNote}]
  indicatorMap: new Map(), // id -> metadata
  seriesMap: new Map(), // id -> {id, cleanName, sector, unit, points:[{date,value}]}
  seriesList: [],
  activeTab: "market",
  built: null
};

// ---------- Tabs ----------
tabs.forEach(t => {
  t.addEventListener("click", () => {
    tabs.forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.activeTab = t.dataset.tab;
    render();
  });
});

// ---------- Buttons ----------
loadWbBtn.addEventListener("click", async () => {
  await loadWorldBankAPI();
});
reloadBtn.addEventListener("click", async () => {
  hardResetRuntime();
  await loadWorldBankAPI(true);
});

// Upload Excel override
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

// =======================================================
// 1) WORLD BANK API LOAD (like your country snapshot)
// =======================================================

async function loadWorldBankAPI(isReload=false) {
  try {
    loadWbBtn.disabled = true;
    reloadBtn.disabled = true;
    buildBtn.disabled = true;

    loadStatus.textContent = isReload ? "Reloading World Bank (GEM) indicators…" : "Loading World Bank (GEM) indicators…";
    status.textContent = "Pulling indicator list…";

    // Pull all indicators from the GEM source (15).
    // We page until done. Paging is standard WB API behaviour. :contentReference[oaicite:4]{index=4}
    const indicators = await fetchAllIndicatorsForSource(WB_SOURCE_ID);

    // Filter to commodity-looking indicators (investor-facing default universe)
    const filtered = indicators
      .map(x => ({
        id: x.id,
        name: (x.name || "").trim(),
        unit: (x.unit || "").trim(),
        sourceNote: (x.sourceNote || "").trim()
      }))
      .filter(isCommodityIndicator);

    if (!filtered.length) {
      throw new Error("No commodity-style indicators returned from GEM. Try upload Excel instead.");
    }

    // Save indicator universe
    state.indicatorList = filtered;
    state.indicatorMap = new Map(filtered.map(x => [x.id, x]));

    // Build series list (metadata only for now; we fetch data when user builds)
    state.seriesMap.clear();
    state.seriesList = filtered.map(m => ({
      rawName: m.id,
      cleanName: cleanSeriesName(m.name || m.id),
      sector: classifySector(m.name),
      unitGuess: guessUnit(m.name) || m.unit || "",
      points: [] // fetched on demand
    }));

    state.seriesList.sort((a,b)=>a.cleanName.localeCompare(b.cleanName));
    state.loaded = true;
    state.source = "World Bank (GEM API)";
    kSrc.textContent = "World Bank (API)";

    refreshDropdowns(true);

    loadStatus.textContent = `Loaded World Bank (GEM): ${state.seriesList.length} commodity indicators.`;
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

async function fetchAllIndicatorsForSource(sourceId) {
  let page = 1;
  const perPage = 200; // WB default is 50, but higher is fine; paging is documented :contentReference[oaicite:5]{index=5}
  let all = [];

  while (true) {
    const url = `${WB_API}/source/${sourceId}/indicators?format=json&page=${page}&per_page=${perPage}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`World Bank API error (indicators): ${res.status}`);
    const json = await res.json();

    const meta = json?.[0];
    const rows = json?.[1] || [];
    all = all.concat(rows);

    const pages = Number(meta?.pages || 1);
    if (page >= pages) break;
    page += 1;
  }
  return all;
}

// Decide what is “commodity data” in WB GEM indicator list
function isCommodityIndicator(m) {
  const s = `${m.name} ${m.unit} ${m.sourceNote}`.toLowerCase();

  // Strong commodity keywords (covers energy, metals, agri, fertilisers)
  const kw = [
    "crude", "oil", "brent", "wti", "natural gas", "lng", "coal",
    "copper", "aluminum", "aluminium", "nickel", "zinc", "lead", "tin", "iron ore", "steel",
    "gold", "silver", "platinum", "palladium",
    "wheat", "maize", "corn", "rice", "soy", "beans", "barley",
    "sugar", "coffee", "cocoa", "tea", "cotton", "palm",
    "fertil", "urea", "potash", "phosphate", "dap",
    "commodity", "beverages", "raw materials", "non-energy", "energy price", "metals and minerals",
    "index"
  ];

  // If it looks like a price/index series, keep it.
  const looksLikePrice = s.includes("price") || s.includes("index") || s.includes("$/") || s.includes("usd");
  const hits = kw.some(k => s.includes(k));

  return hits || looksLikePrice;
}

// =======================================================
// 2) FETCH DATA FOR INDICATOR (on build)
// =======================================================

async function ensureSeriesLoaded(indicatorId) {
  const existing = state.seriesMap.get(indicatorId);
  if (existing && existing.points && existing.points.length) return;

  const meta = state.indicatorMap.get(indicatorId);
  const name = meta?.name || indicatorId;

  // For commodity prices/indices in GEM, “World” aggregates are typically what you want.
  // WLD is a common aggregate code used by WB endpoints. :contentReference[oaicite:6]{index=6}
  const country = "WLD";

  // Use frequency=M to try to pull monthly values where available. :contentReference[oaicite:7]{index=7}
  const url = `${WB_API}/country/${country}/indicator/${indicatorId}?source=${WB_SOURCE_ID}&format=json&per_page=20000&frequency=M`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`World Bank API error (data): ${res.status}`);

  const json = await res.json();
  const rows = json?.[1] || [];

  const pts = rows
    .map(r => {
      const date = parseWBDate(r.date);
      const value = (r.value == null) ? null : Number(r.value);
      if (!date || !Number.isFinite(value)) return null;
      return { date, value };
    })
    .filter(Boolean)
    .sort((a,b)=>a.date-b.date);

  // Store
  const obj = {
    rawName: indicatorId,
    cleanName: cleanSeriesName(name),
    sector: classifySector(name),
    unitGuess: guessUnit(name) || meta?.unit || "",
    points: pts
  };

  state.seriesMap.set(indicatorId, obj);
}

function parseWBDate(d) {
  // WB often returns "YYYY" or "YYYYMM" depending on frequency
  const s = String(d || "").trim();
  if (!s) return null;

  if (/^\d{4}$/.test(s)) return new Date(Date.UTC(Number(s), 0, 1));
  if (/^\d{6}$/.test(s)) {
    const y = Number(s.slice(0,4));
    const m = Number(s.slice(4,6)) - 1;
    return new Date(Date.UTC(y, m, 1));
  }
  if (/^\d{4}-\d{2}$/.test(s)) {
    const y = Number(s.slice(0,4));
    const m = Number(s.slice(5,7)) - 1;
    return new Date(Date.UTC(y, m, 1));
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s);

  const dt = new Date(s);
  return Number.isNaN(+dt) ? null : dt;
}

// =======================================================
// 3) BUILD + RENDER (same logic as before)
// =======================================================

function buildAll() {
  if (!state.loaded) throw new Error("No data loaded.");

  const AId = seriesA.value;
  const BId = seriesB.value;
  const mode = viewMode.value;

  return buildAllAsyncWrapper(AId, BId, mode);
}

// Build wrapper to support async series fetch
function buildAllAsyncWrapper(AId, BId, mode) {
  // NOTE: we must block until series loaded. We do it by using a simple “sync gate”
  // because your current UI is built around sync build().
  // In practice this is instant after first load; still, we’ll show status text.
  throwIfAsyncNotReady(AId, BId, mode);
  return buildFromLoadedSeries(AId, BId, mode);
}

function throwIfAsyncNotReady(AId, BId, mode) {
  // If data not fetched yet, fetch now (async) then re-run build.
  // We do this by temporarily disabling build button and re-triggering on completion.
  const needsA = !state.seriesMap.get(AId)?.points?.length;
  const needsB = (mode !== "single") && !state.seriesMap.get(BId)?.points?.length;

  if (needsA || needsB) {
    buildBtn.disabled = true;
    status.textContent = "Pulling series from World Bank…";

    Promise.all([
      ensureSeriesLoaded(AId),
      (mode !== "single") ? ensureSeriesLoaded(BId) : Promise.resolve()
    ]).then(() => {
      buildBtn.disabled = false;
      status.textContent = "Series loaded. Building…";
      state.built = buildFromLoadedSeries(AId, BId, mode);
      enableExports();
      status.textContent = "Built.";
      render();
    }).catch(e => {
      buildBtn.disabled = false;
      status.textContent = `Build error: ${e.message}`;
    });

    // Stop the sync build path
    throw new Error("Loading series…");
  }
}

function buildFromLoadedSeries(AId, BId, mode) {
  const A = state.seriesMap.get(AId)?.points || [];
  const B = state.seriesMap.get(BId)?.points || [];

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

  const ALabel = state.seriesMap.get(AId)?.cleanName || AId;
  const BLabel = state.seriesMap.get(BId)?.cleanName || BId;

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
      wb: { api: WB_API, sourceId: WB_SOURCE_ID, country: "WLD" }
    },
    series,
    season,
    balance
  };
}

// =======================================================
// 4) DROPDOWNS (based on indicator universe)
// =======================================================

function refreshDropdowns(setDefaults=false) {
  if (!state.loaded) return;

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
    seriesB.appendChild(o2);
  }

  if (setDefaults) {
    const oil = pickByRegex(/oil|crude|brent|wti/i);
    const nonEnergy = pickByRegex(/non-energy|non energy|metals and minerals|agriculture|food/i);
    if (oil) seriesA.value = oil.rawName;
    if (nonEnergy) seriesB.value = nonEnergy.rawName;
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

// =======================================================
// 5) RENDER + EXPORT (same as earlier version)
// =======================================================

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

// =======================================================
// 6) BALANCE ENGINE (unchanged)
// =======================================================

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

// =======================================================
// 7) CHART RENDERING (keep your existing functions)
// =======================================================

function render() {
  if (!state.built) return renderEmpty();
  note.style.display = "none";
  if (state.activeTab === "market") return renderMarket();
  if (state.activeTab === "season") return renderSeason();
  if (state.activeTab === "balance") return renderBalance();
  if (state.activeTab === "stress") return renderStress();
}

function renderEmpty() {
  Plotly.newPlot(chartDiv, [], baseLayout("Load World Bank data or upload Excel"), { displayModeBar:false, responsive:true });
  note.style.display = "block";
  note.innerHTML = `
    <div style="font-family:'Times New Roman',Times,serif;font-weight:700;font-size:16px;margin-bottom:6px">
      Commodity Lab
    </div>
    <div class="muted">
      This pulls commodity-related series from the World Bank API (GEM source). Or upload Excel and run the same analysis.
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
}

function renderSeason() {
  const labels = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const avg = state.built.season.avg;

  const traces = [{ x:labels, y:avg, type:"bar", name:"Avg monthly return" }];
  const layout = baseLayout("Seasonality · average monthly returns");
  layout.yaxis.title = "Average return";

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar:false, responsive:true });
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

  const layout = baseLayout("Stress · demand vs supply shock");
  layout.scene = {
    xaxis:{ title:"Demand shock (%)" },
    yaxis:{ title:"Supply shock (%)" },
    zaxis:{ title:"Implied price move (%)" }
  };
  layout.margin = { l:20, r:20, t:60, b:20 };

  Plotly.newPlot(chartDiv, traces, layout, { displayModeBar:false, responsive:true });
}

// =======================================================
// 8) UTILITIES (same as before, plus WB date parse above)
// =======================================================

function hardResetRuntime(){
  state.loaded=false;
  state.indicatorList=[];
  state.indicatorMap.clear();
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
  const right = meta?.source ? `${meta.source}` : "World Bank";
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

// Alignment + stats
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

// Naming / classification
function cleanSeriesName(raw){ return String(raw).trim().replace(/\s+/g," "); }

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

// =======================================================
// 9) EXCEL PARSER (same as your existing upload code)
// =======================================================
// Keep your existing parseWorkbook() for Excel uploads here.
// If you want, I’ll merge in your exact current parser so it accepts both wide and long formats.
async function parseWorkbook(arrayBuffer) {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });

  const header = rows[0].map(x => String(x||"").trim());
  const dateCol = header.findIndex(h => /^date$/i.test(h) || /^time$/i.test(h));
  if (dateCol === -1) throw new Error("Upload needs a Date column named 'Date' or 'Time'.");

  state.seriesMap.clear();
  state.seriesList = [];

  for (let c=0;c<header.length;c++){
    if (c===dateCol) continue;
    const name = header[c];
    if (!name) continue;

    const pts=[];
    for (let r=1;r<rows.length;r++){
      const d=parseWBDate(rows[r][dateCol]);
      const v=Number(rows[r][c]);
      if (!d || !Number.isFinite(v)) continue;
      pts.push({ date:d, value:v });
    }
    if (pts.length < 24) continue;

    const obj = {
      rawName: name,
      cleanName: cleanSeriesName(name),
      sector: classifySector(name),
      unitGuess: guessUnit(name),
      points: pts.sort((a,b)=>a.date-b.date)
    };
    state.seriesMap.set(name, obj);
    state.seriesList.push(obj);
  }

  state.loaded=true;
  state.seriesList.sort((a,b)=>a.cleanName.localeCompare(b.cleanName));
  refreshDropdowns(true);
}
