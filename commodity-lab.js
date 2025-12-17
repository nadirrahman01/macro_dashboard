/* Cordoba Capital · Commodity Lab (Phase 1)
   - CSV upload (time series + optional curve)
   - Spreads + z-score chart
   - Seasonality chart (monthly average returns)
   - Curve snapshot (if curve CSV provided)
   - Basic tests: summary stats + ADF-lite stationarity check
   - Export PNG/SVG with Cordoba branding
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
  tsRaw: null,      // { cols: [], rows: [{date: Date, ...}] }
  curveRaw: null,   // { maturities: [], rows: [{date: Date, ...}] }
  built: null,      // computed series
  activeTab: "spread"
};

const tsFile = el("tsFile");
const curveFile = el("curveFile");
const seriesA = el("seriesA");
const seriesB = el("seriesB");
const freq = el("freq");
const zWin = el("zWin");
const adfLag = el("adfLag");
const retType = el("retType");
const buildBtn = el("buildBtn");
const resetBtn = el("resetBtn");
const exportPngBtn = el("exportPngBtn");
const exportSvgBtn = el("exportSvgBtn");

const defn = el("defn");
const latestSpread = el("latestSpread");
const latestZ = el("latestZ");

const chartDiv = el("chart");
const testsBlock = el("testsBlock");
const curveHint = el("curveHint");

document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    state.activeTab = t.dataset.tab;
    render();
  });
});

tsFile.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  state.tsRaw = await parseCSVFile(f);
  populateSeriesDropdowns(state.tsRaw.cols.filter(c => c !== "date"));
  buildBtn.disabled = false;
});

curveFile.addEventListener("change", async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  state.curveRaw = await parseCurveCSVFile(f);
});

buildBtn.addEventListener("click", () => {
  if (!state.tsRaw) return;
  state.built = buildAll();
  exportPngBtn.disabled = false;
  exportSvgBtn.disabled = false;
  render();
});

resetBtn.addEventListener("click", () => {
  state.tsRaw = null;
  state.curveRaw = null;
  state.built = null;
  seriesA.innerHTML = "";
  seriesB.innerHTML = "";
  buildBtn.disabled = true;
  exportPngBtn.disabled = true;
  exportSvgBtn.disabled = true;
  defn.textContent = "—";
  latestSpread.textContent = "—";
  latestZ.textContent = "—";
  testsBlock.style.display = "none";
  curveHint.style.display = "none";
  Plotly.purge(chartDiv);
  tsFile.value = "";
  curveFile.value = "";
});

exportPngBtn.addEventListener("click", async () => {
  await exportChart("png");
});

exportSvgBtn.addEventListener("click", async () => {
  await exportChart("svg");
});

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

// Curve CSV: date + maturities columns (e.g. 1M,3M,6M,...)
async function parseCurveCSVFile(file) {
  const raw = await parseCSVFile(file);
  const maturities = raw.cols.filter(c => c !== "date");
  return { maturities, rows: raw.rows };
}

function splitCSVLine(line) {
  // Minimal CSV splitter (handles quotes)
  const out = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' ) {
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
   Builder
--------------------------- */

function populateSeriesDropdowns(cols) {
  seriesA.innerHTML = "";
  seriesB.innerHTML = "";

  cols.forEach((c, idx) => {
    const optA = document.createElement("option");
    optA.value = c;
    optA.textContent = c;
    seriesA.appendChild(optA);

    const optB = document.createElement("option");
    optB.value = c;
    optB.textContent = c;
    seriesB.appendChild(optB);
  });

  // sensible default: A=first, B=second if exists
  if (cols.length >= 2) {
    seriesA.value = cols[0];
    seriesB.value = cols[1];
  } else if (cols.length === 1) {
    seriesA.value = cols[0];
    seriesB.value = cols[0];
  }
}

function buildAll() {
  const A = seriesA.value;
  const B = seriesB.value;
  const f = freq.value;
  const zw = Math.max(20, Number(zWin.value || 252));
  const lag = Math.max(0, Number(adfLag.value || 1));
  const rType = retType.value;

  // 1) pull raw series + align
  const aligned = alignSeries(state.tsRaw.rows, A, B);

  // 2) resample if needed
  const res = resample(aligned, f);

  // 3) compute spread
  const spread = res.map(r => ({
    date: r.date,
    A: r.A,
    B: r.B,
    spread: (r.A == null || r.B == null) ? null : (r.A - r.B)
  })).filter(r => r.spread != null);

  // 4) z-score
  const zs = rollingZ(spread.map(x => x.spread), zw);
  const spreadZ = spread.map((x, i) => ({ ...x, z: zs[i] }));

  // 5) returns for seasonality + tests (use spread returns)
  const rets = returns(spreadZ.map(x => x.spread), rType);
  const retSeries = spreadZ.map((x, i) => ({
    date: x.date,
    spread: x.spread,
    z: x.z,
    ret: rets[i]
  }));

  // 6) seasonality (monthly avg of returns)
  const season = seasonalityMonthly(retSeries);

  // 7) tests: summary stats + ADF-lite on spread levels and returns
  const spreadLevels = retSeries.map(x => x.spread).filter(v => v != null);
  const spreadReturns = retSeries.map(x => x.ret).filter(v => v != null);
  const tests = {
    summary: summaryStats(spreadReturns),
    adfSpread: adfLite(spreadLevels, lag),
    adfReturns: adfLite(spreadReturns, lag)
  };

  const definition = `${A} minus ${B} · ${f === "D" ? "Daily" : f === "W" ? "Weekly" : "Monthly"} · z(${zw})`;

  // update KPI text
  defn.textContent = definition;

  // latest
  const last = [...retSeries].reverse().find(x => x.spread != null);
  const lastZ = [...retSeries].reverse().find(x => x.z != null);

  latestSpread.textContent = last ? fmt(last.spread) : "—";
  latestZ.textContent = lastZ ? fmt(lastZ.z) : "—";

  return {
    A, B, f, zw, lag, rType,
    definition,
    series: retSeries,
    season,
    tests
  };
}

function alignSeries(rows, colA, colB) {
  // map date -> values then inner join
  const out = [];
  for (const r of rows) {
    const a = r[colA];
    const b = r[colB];
    if (r.date && (a != null || b != null)) {
      out.push({ date: r.date, A: a, B: b });
    }
  }
  // keep rows where both exist (cleaner for spread)
  return out.filter(x => x.A != null && x.B != null);
}

/* ---------------------------
   Resampling
--------------------------- */

function resample(data, f) {
  if (f === "D") return data;

  // group by week (Fri close) or month end
  const buckets = new Map();

  for (const r of data) {
    const d = r.date;
    let key;
    if (f === "W") {
      // bucket by ISO week-year-week
      const iso = isoWeekKey(d);
      key = iso.key;
    } else {
      // month bucket
      key = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
    }

    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(r);
  }

  const out = [];
  for (const [key, arr] of buckets.entries()) {
    // take last observation in bucket (end of period)
    arr.sort((a,b) => a.date - b.date);
    const last = arr[arr.length - 1];
    out.push(last);
  }

  out.sort((a,b) => a.date - b.date);
  return out;
}

function isoWeekKey(date) {
  // ISO week number in UTC
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
  // monthly average of returns
  const buckets = Array.from({ length: 12 }, () => []);
  for (const x of retSeries) {
    if (x.ret == null) continue;
    const m = x.date.getUTCMonth(); // 0-11
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

function mean(a) {
  let s = 0;
  for (const v of a) s += v;
  return s / a.length;
}

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

/* ---------------------------
   ADF-lite (no p-values)
   Δy_t = a + b*y_{t-1} + Σ c_i Δy_{t-i} + e_t
   We report b t-stat and compare to rough 5% critical values.
--------------------------- */

function adfLite(series, p=1) {
  const y = series.filter(v => v != null && Number.isFinite(v));
  const n = y.length;
  if (n < 40) return { ok: false, reason: "Not enough data (need ~40+ points)." };

  // build Δy
  const dy = [];
  for (let i = 1; i < n; i++) dy.push(y[i] - y[i-1]);

  // regression rows index t from (p+1) to (n-1)
  // dependent: dy[t]
  // regressors: [1, y[t-1], dy[t-1], ... dy[t-p]]
  const X = [];
  const Y = [];

  for (let t = p + 1; t < n; t++) {
    const row = [1, y[t-1]];
    for (let i = 1; i <= p; i++) row.push(dy[t - i - 1]); // dy aligned
    X.push(row);
    Y.push(dy[t-1]);
  }

  const ols = OLS(X, Y);
  if (!ols.ok) return { ok: false, reason: ols.reason };

  const b = ols.beta[1];
  const tstat = ols.t[1];

  // Rough 5% critical values for ADF with intercept only:
  // Large-sample approx: around -2.86 (no trend). We flag if tstat < crit.
  const crit5 = -2.86;

  return {
    ok: true,
    nObs: Y.length,
    lag: p,
    b,
    tstat,
    crit5,
    rejectUnitRootAt5: (tstat < crit5),
    note: "ADF-lite uses rough 5% critical value (no p-value). Treat as a screening check, not gospel."
  };
}

function OLS(X, Y) {
  // beta = (X'X)^-1 X'Y
  const n = X.length;
  const k = X[0].length;
  if (n <= k + 5) return { ok: false, reason: "Not enough observations for regression." };

  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const XtY = matVecMul(Xt, Y);

  const inv = matInv(XtX);
  if (!inv) return { ok: false, reason: "Matrix inversion failed (collinearity?)." };

  const beta = matVecMul(inv, XtY);

  // residuals
  const yhat = X.map(r => dot(r, beta));
  const resid = Y.map((y, i) => y - yhat[i]);

  // variance estimate
  const dof = n - k;
  const s2 = resid.reduce((a,b) => a + b*b, 0) / dof;

  // var(beta) = s2 * (X'X)^-1
  const varB = inv.map(row => row.map(v => v * s2));
  const se = [];
  for (let i = 0; i < k; i++) se.push(Math.sqrt(Math.max(varB[i][i], 1e-12)));
  const t = beta.map((b,i) => b / se[i]);

  return { ok: true, beta, se, t, s2, dof };
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
  // Gauss-Jordan inversion
  const n = M.length;
  const A = M.map(row => row.slice());
  const I = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))
  );

  for (let i = 0; i < n; i++) {
    // pivot
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

    // normalize
    const div = A[i][i];
    for (let j = 0; j < n; j++) {
      A[i][j] /= div;
      I[i][j] /= div;
    }

    // eliminate
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
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function fmt(x) {
  if (x == null || !Number.isFinite(x)) return "—";
  const ax = Math.abs(x);
  const dp = ax >= 100 ? 1 : ax >= 10 ? 2 : 3;
  return x.toFixed(dp);
}

/* ---------------------------
   Rendering
--------------------------- */

function render() {
  if (!state.built) {
    Plotly.newPlot(chartDiv, [], baseLayout("Upload a CSV to begin"), { displayModeBar: false, responsive: true });
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
    xaxis: {
      gridcolor: "rgba(0,0,0,0.06)",
      zeroline: false
    },
    yaxis: {
      gridcolor: "rgba(0,0,0,0.06)",
      zeroline: false
    },
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
    {
      x, y,
      type: "scatter",
      mode: "lines",
      name: "Spread",
      line: { width: 2 }
    },
    {
      x, y: z,
      type: "scatter",
      mode: "lines",
      name: "Z-score",
      yaxis: "y2",
      line: { width: 2, dash: "dot" }
    }
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

  // z bands at ±2
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

  const traces = [
    {
      x: labels,
      y: m,
      type: "bar",
      name: "Avg monthly return"
    }
  ];

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
  if (!state.curveRaw) {
    Plotly.newPlot(chartDiv, [], baseLayout("Curve · upload a curve CSV to view"), { displayModeBar: false, responsive: true });
    curveHint.style.display = "block";
    curveHint.innerHTML = `
      <div style="font-family:Times New Roman,Times,serif;font-weight:600;font-size:16px;margin-bottom:6px">Curve input not found</div>
      <div class="muted">
        Upload a curve CSV (date + maturities columns). Then this tab will plot a curve snapshot (latest date)
        and a simple history heatmap (Phase 2).
      </div>
    `;
    return;
  }

  const rows = state.curveRaw.rows;
  if (!rows.length) return;

  const maturities = state.curveRaw.maturities;
  const last = rows[rows.length - 1];

  const x = maturities;
  const y = maturities.map(m => last[m]).map(v => (v == null ? null : v));

  const traces = [
    { x, y, type: "scatter", mode: "lines+markers", name: "Curve" }
  ];

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
      These are screening checks designed for fast decision-making. For publishable work, you’d typically confirm with fuller specifications, multiple lags,
      and robustness checks.
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

  // Keep a simple chart placeholder here (so export still works from Tests tab too)
  const layout = baseLayout("Tests view · charts come from other tabs");
  Plotly.newPlot(chartDiv, [], layout, { displayModeBar: false, responsive: true });
}

function adfCard(adf) {
  if (!adf.ok) {
    return `<div class="muted">Not available: ${adf.reason}</div>`;
  }
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

/* ---------------------------
   Export (Plotly image export)
--------------------------- */

async function exportChart(fmt) {
  if (!state.built) return;

  const baseName = `cordoba_commodity_lab_${state.activeTab}_${new Date().toISOString().slice(0,10)}`;

  // Plotly.toImage respects current layout; we already stamp annotations.
  const url = await Plotly.toImage(chartDiv, {
    format: fmt,
    height: 900,
    width: 1600,
    scale: 2
  });

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

/* initial render */
render();
