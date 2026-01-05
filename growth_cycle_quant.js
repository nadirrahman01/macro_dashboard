/* Cordoba Capital – Growth & Cycle Quant Lab
   ------------------------------------------------------------
   This file is intentionally standalone and "reads" from:
   - statsById (with stats.series added in main.js)
   - engines (growth/inflation/liquidity/external)
   It also fetches extra WB level data for output gap:
   - Real GDP level: NY.GDP.MKTP.KD
*/

(function () {
  const AUX_CACHE = {}; // per countryKey

  function $(id) { return document.getElementById(id); }

  function safeNum(x, fallback = null) {
    const v = Number(x);
    return Number.isFinite(v) ? v : fallback;
  }

  function clamp(x, lo, hi) {
    return Math.max(lo, Math.min(hi, x));
  }

  function clamp01(x) {
    return clamp(x, 0, 1);
  }

  function yearStamp(p) {
    if (!p) return -Infinity;
    const y = typeof p.year === "number" ? p.year : (p.period ? parseInt(String(p.period).slice(0, 4), 10) : NaN);
    const m = typeof p.month === "number" ? p.month : 12;
    return (Number.isFinite(y) ? y : 0) * 100 + (Number.isFinite(m) ? m : 12);
  }

  function lastPoint(series) {
    if (!Array.isArray(series) || !series.length) return null;
    return series[series.length - 1];
  }

  // ---------- minimal linear algebra (HP filter via solving banded system) ----------
  // Hodrick–Prescott filter for annual data: lambda ~ 100
  function hpFilter(y, lambda = 100) {
    // y: array of numbers
    const n = y.length;
    if (n < 6) {
      return { trend: y.slice(), cycle: y.map(() => 0) };
    }

    // Solve (I + lambda * K'K) trend = y
    // K'K is pentadiagonal. We'll build A as banded and use Gaussian elimination on dense (n<=120 fine).
    const A = Array.from({ length: n }, () => Array(n).fill(0));
    const b = y.slice();

    // Identity
    for (let i = 0; i < n; i++) A[i][i] = 1;

    // Add lambda*K'K structure:
    // Common HP matrix coefficients:
    // endpoints differ; interior:
    // i=0: [1+lambda, -2lambda, lambda]
    // i=1: [-2lambda, 1+5lambda, -4lambda, lambda]
    // i=n-2: [lambda, -4lambda, 1+5lambda, -2lambda]
    // i=n-1: [lambda, -2lambda, 1+lambda]
    // i=2..n-3: [lambda, -4lambda, 1+6lambda, -4lambda, lambda]
    const L = lambda;

    // i = 0
    A[0][0] += L;
    A[0][1] += -2 * L;
    A[0][2] += L;

    // i = 1
    A[1][0] += -2 * L;
    A[1][1] += 5 * L;
    A[1][2] += -4 * L;
    A[1][3] += L;

    // i = 2..n-3
    for (let i = 2; i <= n - 3; i++) {
      A[i][i - 2] += L;
      A[i][i - 1] += -4 * L;
      A[i][i] += 6 * L;
      A[i][i + 1] += -4 * L;
      A[i][i + 2] += L;
    }

    // i = n-2
    A[n - 2][n - 4] += L;
    A[n - 2][n - 3] += -4 * L;
    A[n - 2][n - 2] += 5 * L;
    A[n - 2][n - 1] += -2 * L;

    // i = n-1
    A[n - 1][n - 3] += L;
    A[n - 1][n - 2] += -2 * L;
    A[n - 1][n - 1] += L;

    // Solve A x = b (naive Gaussian elimination)
    const x = gaussianSolve(A, b);
    const trend = x;
    const cycle = y.map((v, i) => v - trend[i]);
    return { trend, cycle };
  }

  function gaussianSolve(A, b) {
    const n = b.length;
    // Deep copy
    const M = A.map(row => row.slice());
    const x = b.slice();

    for (let k = 0; k < n; k++) {
      // Pivot
      let maxRow = k;
      let maxVal = Math.abs(M[k][k]);
      for (let i = k + 1; i < n; i++) {
        const v = Math.abs(M[i][k]);
        if (v > maxVal) {
          maxVal = v;
          maxRow = i;
        }
      }
      if (maxVal < 1e-12) continue;
      if (maxRow !== k) {
        [M[k], M[maxRow]] = [M[maxRow], M[k]];
        [x[k], x[maxRow]] = [x[maxRow], x[k]];
      }

      // Eliminate
      for (let i = k + 1; i < n; i++) {
        const f = M[i][k] / M[k][k];
        if (!Number.isFinite(f)) continue;
        x[i] -= f * x[k];
        for (let j = k; j < n; j++) {
          M[i][j] -= f * M[k][j];
        }
      }
    }

    // Back substitute
    const sol = Array(n).fill(0);
    for (let i = n - 1; i >= 0; i--) {
      let s = x[i];
      for (let j = i + 1; j < n; j++) s -= M[i][j] * sol[j];
      sol[i] = Math.abs(M[i][i]) < 1e-12 ? 0 : s / M[i][i];
    }
    return sol;
  }

  // ---------- modelling primitives ----------
  function softmax(arr) {
    const m = Math.max(...arr);
    const exps = arr.map(v => Math.exp(v - m));
    const s = exps.reduce((a, b) => a + b, 0) || 1;
    return exps.map(v => v / s);
  }

  function mean(arr) {
    if (!arr.length) return 0;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  function stdev(arr) {
    if (arr.length < 2) return 0;
    const mu = mean(arr);
    const v = arr.reduce((s, x) => s + (x - mu) ** 2, 0) / (arr.length - 1);
    return Math.sqrt(v);
  }

  function corr(x, y) {
    const n = Math.min(x.length, y.length);
    if (n < 3) return null;
    const xx = x.slice(0, n);
    const yy = y.slice(0, n);
    const mx = mean(xx), my = mean(yy);
    const sx = stdev(xx), sy = stdev(yy);
    if (sx === 0 || sy === 0) return null;
    let c = 0;
    for (let i = 0; i < n; i++) c += (xx[i] - mx) * (yy[i] - my);
    c /= (n - 1);
    return c / (sx * sy);
  }

  function formatPct01(p) {
    const v = clamp01(p);
    return `${Math.round(v * 100)}%`;
  }

  // ---------- regime model (probabilistic) ----------
  // We model in z-space using engines:
  // g = growth.z, i = inflation.z (note: in your engine inflation z is already flipped to "good" direction),
  // l = liquidity.z, e = external.z
  // Regimes defined as centroids; then softmax over negative distance.
  function regimeProbabilities(engines) {
    const g = safeNum(engines?.growth?.z, 0);
    const i = safeNum(engines?.inflation?.z, 0);
    const l = safeNum(engines?.liquidity?.z, 0);
    const e = safeNum(engines?.external?.z, 0);

    // Centroids (tuned for interpretability, not fitted)
    const regimes = [
      { id: "goldilocks", label: "Goldilocks", c: [ 0.9,  0.6,  0.6,  0.2] },
      { id: "overheat",   label: "Overheat",   c: [ 0.6, -0.8,  0.5,  0.0] }, // inflation engine <0 means inflation pressure
      { id: "slowdown",   label: "Slowdown",   c: [-0.9,  0.5, -0.6, -0.2] },
      { id: "stress",     label: "External stress", c: [-0.4,  0.2, -0.4, -1.2] },
      { id: "stagfl",     label: "Stagflation", c: [-0.8, -0.8, -0.2, -0.2] }
    ];

    const x = [g, i, l, e];

    // distance -> score
    const scores = regimes.map(r => {
      const d2 = r.c.reduce((s, v, k) => s + (x[k] - v) ** 2, 0);
      // Add a penalty for big growth/inflation disagreement (narrative fragility)
      const frag = Math.abs(g - i);
      return -(d2 + 0.35 * frag);
    });

    const p = softmax(scores);
    const out = regimes.map((r, idx) => ({ ...r, p: p[idx] }));
    out.sort((a, b) => b.p - a.p);

    // Confidence heuristic: how separated top-1 vs top-2 is
    const conf = clamp01((out[0].p - (out[1]?.p ?? 0)) * 1.8 + 0.15);
    return { regimes: out, confidence: conf };
  }

  // ---------- turning point probability ----------
  // “Turning point” here means elevated risk of a growth downshift / recession-like phase next year.
  // We use a logit composite using:
  // - growthZ negative
  // - unemployment delta positive
  // - moneyZ negative
  // - externalZ negative
  // - inflation vs growth divergence
  function turningPointProbability(statsById, engines) {
    const gdp = statsById?.gdp_growth;
    const u = statsById?.unemployment;
    const m = statsById?.money;
    const ca = statsById?.current_account;

    const gZ = safeNum(engines?.growth?.z, 0);
    const lZ = safeNum(engines?.liquidity?.z, 0);
    const eZ = safeNum(engines?.external?.z, 0);
    const iZ = safeNum(engines?.inflation?.z, 0);

    const uDelta = safeNum(u?.delta, 0);
    const gDelta = safeNum(gdp?.delta, 0);

    // Features
    const f1 = clamp01(Math.max(0, -gZ) / 2.0);
    const f2 = clamp01(Math.max(0, uDelta) / 2.0);
    const f3 = clamp01(Math.max(0, -lZ) / 2.0);
    const f4 = clamp01(Math.max(0, -eZ) / 2.0);
    const f5 = clamp01(Math.abs(gZ - iZ) / 2.5);
    const f6 = clamp01(Math.max(0, -gDelta) / 4.0);

    // Weighted sum -> logit
    const s =
      1.35 * f1 +
      0.90 * f2 +
      1.10 * f3 +
      0.75 * f4 +
      0.65 * f5 +
      0.55 * f6;

    const p = 1 / (1 + Math.exp(-(s * 2.1 - 1.2))); // shift/scale
    return clamp01(p);
  }

  // ---------- nowcast vs forecast gap ----------
  // Nowcast = mean growth + beta * leadingComposite
  // Forecast proxy = HP-trend growth (from real GDP level) if available; else mean growth
  function buildLeadingComposite(statsById) {
    const gdp = statsById?.gdp_growth;
    const u = statsById?.unemployment;
    const m = statsById?.money;
    const ca = statsById?.current_account;
    const infl = statsById?.inflation;

    const z_m = safeNum(m?.z, 0);
    const z_ca = safeNum(ca?.z, 0);
    const z_u = safeNum(u?.z, 0);
    const z_infl = safeNum(infl?.z, 0);

    // Composite: liquidity + external - unemployment penalty - inflation tension penalty
    // (Inflation engine is already flipped in engines, but indicator z is raw; we penalise high inflation z)
    const c = 0.45 * z_m + 0.30 * z_ca - 0.35 * z_u - 0.20 * z_infl;
    return clamp(c, -2.5, 2.5);
  }

  function nowcastGrowth(statsById) {
    const gdp = statsById?.gdp_growth;
    if (!gdp) return null;

    const mu = safeNum(gdp.mean, 0);
    const sd = safeNum(gdp.stdev, 0);

    const comp = buildLeadingComposite(statsById);

    // beta ~ 0.55*sd: interpretable mapping from composite z-space to growth-space
    const beta = 0.55 * (sd || 1);
    const nc = mu + beta * (comp / 1.4);

    return {
      nowcast: nc,
      composite: comp,
      mu,
      sd
    };
  }

  // ---------- WB fetch helper for AUX series ----------
  async function fetchAuxSeries(countryKey, wbCode) {
    // relies on fetchWorldBankSeries from main.js
    if (typeof fetchWorldBankSeries !== "function") return { series: [], updatedAt: null };
    return fetchWorldBankSeries(countryKey, wbCode);
  }

  async function ensureAux(countryKey) {
    if (AUX_CACHE[countryKey]) return AUX_CACHE[countryKey];

    const out = { realGDP: null, updatedAt: null };
    try {
      // Real GDP level (constant prices) – used for output gap
      const { series, updatedAt } = await fetchAuxSeries(countryKey, "NY.GDP.MKTP.KD");
      out.realGDP = Array.isArray(series) ? series : [];
      out.updatedAt = updatedAt || null;
    } catch (e) {
      out.realGDP = [];
    }

    AUX_CACHE[countryKey] = out;
    return out;
  }

  function computeOutputGapFromRealGDP(realGDPSeries) {
    // Output gap on log GDP level:
    // gap_t = (logY - logTrend) * 100  (approx %)
    const clean = (Array.isArray(realGDPSeries) ? realGDPSeries : [])
      .filter(p => p && Number.isFinite(Number(p.value)) && Number.isFinite(Number(p.year)))
      .map(p => ({ year: p.year, value: Number(p.value) }))
      .sort((a, b) => a.year - b.year);

    if (clean.length < 10) return null;

    const years = clean.map(d => d.year);
    const logY = clean.map(d => Math.log(d.value));

    const { trend, cycle } = hpFilter(logY, 100);
    const gap = cycle.map(c => c * 100);

    // Trend growth (approx) from trend log differences
    const trendGrowth = trend.map((t, i) => {
      if (i === 0) return null;
      return (t - trend[i - 1]) * 100;
    });

    return {
      years,
      logY,
      trend,
      gap,
      trendGrowth
    };
  }

  // ---------- cross-asset proxies ----------
  // Uses Stooq daily CSV (often CORS-friendly). If blocked, we fall back gracefully.
  async function fetchStooqDaily(symbol) {
    const url = `https://stooq.com/q/d/l/?s=${encodeURIComponent(symbol)}&i=d`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`stooq failed ${res.status}`);
    const text = await res.text();
    return text;
  }

  function parseStooqCSV(text) {
    // date,open,high,low,close,volume
    const lines = String(text || "").trim().split("\n");
    if (lines.length < 5) return [];
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",");
      if (parts.length < 5) continue;
      const d = parts[0];
      const close = Number(parts[4]);
      if (!d || !Number.isFinite(close)) continue;
      const y = parseInt(d.slice(0, 4), 10);
      if (!Number.isFinite(y)) continue;
      out.push({ date: d, year: y, close });
    }
    out.sort((a, b) => (a.date < b.date ? -1 : 1));
    return out;
  }

  function annualReturnsFromDaily(rows) {
    if (!rows.length) return [];
    const byYear = new Map();
    rows.forEach(r => {
      if (!byYear.has(r.year)) byYear.set(r.year, []);
      byYear.get(r.year).push(r);
    });
    const out = [];
    Array.from(byYear.keys()).sort((a, b) => a - b).forEach(y => {
      const arr = byYear.get(y);
      if (!arr || arr.length < 5) return;
      const first = arr[0].close;
      const last = arr[arr.length - 1].close;
      if (!Number.isFinite(first) || !Number.isFinite(last) || first === 0) return;
      out.push({ year: y, ret: (last / first - 1) * 100 });
    });
    return out;
  }

  function drawLine(canvas, series, opts = {}) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!Array.isArray(series) || series.length < 2) {
      ctx.font = "12px system-ui";
      ctx.fillStyle = "rgba(15,15,15,0.55)";
      ctx.fillText("n/a", 10, 18);
      return;
    }

    const xs = series.map(d => d.x);
    const ys = series.map(d => d.y);

    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const pad = 18;

    const x0 = pad, x1 = w - pad;
    const y0 = pad, y1 = h - pad;

    const scaleX = (i) => x0 + (i / (series.length - 1)) * (x1 - x0);
    const scaleY = (v) => {
      if (maxY === minY) return (y0 + y1) / 2;
      return y1 - ((v - minY) / (maxY - minY)) * (y1 - y0);
    };

    // axes baseline
    ctx.strokeStyle = "rgba(15,15,15,0.10)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y1);
    ctx.lineTo(x1, y1);
    ctx.stroke();

    // zero line if spans 0
    if (minY < 0 && maxY > 0) {
      const yz = scaleY(0);
      ctx.strokeStyle = "rgba(15,15,15,0.14)";
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x0, yz);
      ctx.lineTo(x1, yz);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // line
    ctx.strokeStyle = "rgba(132,95,15,0.95)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    series.forEach((d, i) => {
      const X = scaleX(i);
      const Y = scaleY(d.y);
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.stroke();

    // last point marker
    const last = series[series.length - 1];
    const XL = scaleX(series.length - 1);
    const YL = scaleY(last.y);
    ctx.fillStyle = "rgba(132,95,15,1)";
    ctx.beginPath();
    ctx.arc(XL, YL, 3.2, 0, Math.PI * 2);
    ctx.fill();

    // label
    ctx.font = "12px system-ui";
    ctx.fillStyle = "rgba(15,15,15,0.70)";
    const lbl = opts.label || "";
    if (lbl) ctx.fillText(lbl, 10, 16);
  }

  function drawProbBars(root, items) {
    if (!root) return;
    root.innerHTML = "";
    items.forEach(it => {
      const row = document.createElement("div");
      row.className = "rounded-xl border border-neutral-200 bg-white px-3 py-2";

      row.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div class="text-xs font-medium text-neutral-900">${it.label}</div>
          <div class="text-[11px] text-neutral-500">${formatPct01(it.p)}</div>
        </div>
        <div class="mt-2 h-2 rounded-full bg-neutral-100 border border-neutral-200 overflow-hidden">
          <div class="h-full rounded-full bg-cordobaGold" style="width:${Math.round(clamp01(it.p) * 100)}%"></div>
        </div>
      `;
      root.appendChild(row);
    });
  }

  function renderScenarioControls(root, state, onChange) {
    if (!root) return;
    root.innerHTML = "";

    const controls = [
      { k: "growth", label: "Growth shock (z)", min: -2, max: 2, step: 0.1 },
      { k: "inflation", label: "Inflation shock (z)", min: -2, max: 2, step: 0.1 },
      { k: "liquidity", label: "Liquidity shock (z)", min: -2, max: 2, step: 0.1 },
      { k: "external", label: "External shock (z)", min: -2, max: 2, step: 0.1 }
    ];

    controls.forEach(c => {
      const wrap = document.createElement("div");
      wrap.className = "rounded-xl border border-neutral-200 bg-white px-3 py-2";

      const val = safeNum(state[c.k], 0);

      wrap.innerHTML = `
        <div class="flex items-center justify-between gap-3">
          <div class="text-xs font-medium text-neutral-900">${c.label}</div>
          <div class="text-[11px] text-neutral-500"><span data-val="${c.k}">${val.toFixed(1)}</span></div>
        </div>
        <input data-slider="${c.k}" class="mt-2 w-full" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${val}">
        <div class="mt-1 text-[11px] text-neutral-600">Use this to stress the engine and see how regime / turning risk moves.</div>
      `;

      root.appendChild(wrap);
    });

    root.querySelectorAll("input[data-slider]").forEach(inp => {
      inp.addEventListener("input", () => {
        const k = inp.getAttribute("data-slider");
        const v = safeNum(inp.value, 0);
        state[k] = v;
        const valEl = root.querySelector(`span[data-val="${k}"]`);
        if (valEl) valEl.textContent = v.toFixed(1);
        onChange && onChange();
      });
    });
  }

  function applyEngineShocks(engines, shocks) {
    const e = JSON.parse(JSON.stringify(engines || {}));
    ["growth", "inflation", "liquidity", "external"].forEach(k => {
      if (!e[k]) e[k] = { z: 0, score: 50 };
      const dz = safeNum(shocks?.[k], 0);
      e[k].z = safeNum(e[k].z, 0) + dz;

      // keep score coherent with z (same mapping style as main.js)
      const clamped = clamp(e[k].z, -2.5, 2.5);
      e[k].score = Math.round(50 + (clamped / 2.5) * 40);
    });
    return e;
  }

  async function buildCrossAssetBlock(countryKey, statsById) {
    // macro features (annual)
    const gdp = statsById?.gdp_growth;
    const infl = statsById?.inflation;
    const money = statsById?.money;
    const ca = statsById?.current_account;
    if (!gdp || !gdp.series || gdp.series.length < 8) {
      return { ok: false, reason: "Not enough macro history for correlation." };
    }

    const years = gdp.series.map(p => p.year);
    const mapByYear = (series) => {
      const m = new Map();
      (series || []).forEach(p => {
        const y = p.year;
        if (Number.isFinite(y) && Number.isFinite(Number(p.value))) m.set(y, Number(p.value));
      });
      return m;
    };

    const m_g = mapByYear(gdp.series);
    const m_i = mapByYear(infl?.series || []);
    const m_m = mapByYear(money?.series || []);
    const m_ca = mapByYear(ca?.series || []);

    // attempt Stooq proxies (if fails, we’ll return macro-only correlations)
    const proxies = [
      { id: "spy.us", label: "US equities proxy (SPY)" },
      { id: "dxy", label: "USD proxy (DXY)" },
      { id: "gold", label: "Gold proxy" }
    ];

    // These symbols are best-effort; Stooq coverage can differ.
    // We try multiple for gold.
    const goldCandidates = ["xauusd", "gc.f", "gold"];

    async function fetchProxy(symbol) {
      const csv = await fetchStooqDaily(symbol);
      const rows = parseStooqCSV(csv);
      const ann = annualReturnsFromDaily(rows);
      return ann;
    }

    const proxyData = [];
    try {
      // SPY
      const spy = await fetchProxy("spy.us");
      if (spy.length) proxyData.push({ key: "SPY", label: "SPY", ann: spy });

      // DXY often exists as "dxy" or "usdx"
      let dxy = [];
      try { dxy = await fetchProxy("dxy"); } catch (e) {}
      if (!dxy.length) {
        try { dxy = await fetchProxy("usdx"); } catch (e) {}
      }
      if (dxy.length) proxyData.push({ key: "DXY", label: "DXY", ann: dxy });

      // Gold
      let gold = [];
      for (const c of goldCandidates) {
        try {
          gold = await fetchProxy(c);
          if (gold.length) break;
        } catch (e) {}
      }
      if (gold.length) proxyData.push({ key: "GOLD", label: "GOLD", ann: gold });

    } catch (e) {
      // total failure -> macro-only
    }

    // Build aligned series for correlations
    const alignedYears = years.filter(y =>
      m_g.has(y) &&
      (m_i.size ? m_i.has(y) : true) &&
      (m_m.size ? m_m.has(y) : true) &&
      (m_ca.size ? m_ca.has(y) : true)
    );

    const G = alignedYears.map(y => m_g.get(y));
    const I = alignedYears.map(y => (m_i.has(y) ? m_i.get(y) : null)).filter(v => v != null);
    const M = alignedYears.map(y => (m_m.has(y) ? m_m.get(y) : null)).filter(v => v != null);
    const CA = alignedYears.map(y => (m_ca.has(y) ? m_ca.get(y) : null)).filter(v => v != null);

    const macroCorr = [
      { a: "GDP", b: "Inflation", r: corr(G.slice(-I.length), I) },
      { a: "GDP", b: "Money", r: corr(G.slice(-M.length), M) },
      { a: "GDP", b: "Current account", r: corr(G.slice(-CA.length), CA) }
    ].filter(x => x.r != null);

    const assetCorr = [];
    proxyData.forEach(px => {
      const pm = new Map(px.ann.map(d => [d.year, d.ret]));
      const yrs = alignedYears.filter(y => pm.has(y));
      if (yrs.length < 6) return;
      const R = yrs.map(y => pm.get(y));
      const GG = yrs.map(y => m_g.get(y));
      const II = yrs.map(y => (m_i.has(y) ? m_i.get(y) : null)).filter(v => v != null);

      const rg = corr(GG, R);
      const ri = II.length >= 6 ? corr(II.slice(-R.length), R) : null;
      assetCorr.push({ asset: px.label, r_gdp: rg, r_infl: ri });
    });

    return {
      ok: true,
      proxyCount: proxyData.length,
      macroCorr,
      assetCorr
    };
  }

  // ---------- UI render ----------
  function renderSkeleton(root) {
    root.innerHTML = `
      <div class="rounded-3xl border border-neutral-200 bg-[#FFFCF9] p-4">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div class="text-[11px] uppercase tracking-[0.22em] text-neutral-500">Growth & Cycle Lab</div>
            <div class="mt-1 text-lg font-semibold text-neutral-900">Probabilistic regime, output gap, turning risk</div>
            <div class="mt-1 text-xs text-neutral-600 max-w-[70ch]">
              This block is built to be “quant useful”: it compresses cycle state into probabilities, estimates output gap from real GDP,
              tracks nowcast-vs-forecast drift, and stress-tests the regime with scenario shocks.
            </div>
          </div>
          <div class="text-[11px] text-neutral-500">
            <div id="cc-gc-stamp">loading…</div>
          </div>
        </div>

        <div class="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div class="rounded-2xl border border-neutral-200 bg-white p-3">
            <div class="text-xs font-medium text-neutral-900">Regime probabilities</div>
            <div class="mt-2 space-y-2" id="cc-gc-regime-bars"></div>
            <div class="mt-2 text-[11px] text-neutral-600">
              <span class="font-medium">Confidence</span>: <span id="cc-gc-regime-conf">n/a</span>
            </div>
          </div>

          <div class="rounded-2xl border border-neutral-200 bg-white p-3">
            <div class="text-xs font-medium text-neutral-900">Turning point risk (next year)</div>
            <div class="mt-2 rounded-xl border border-neutral-200 bg-[#FFFCF9] px-3 py-2">
              <div class="flex items-center justify-between text-xs text-neutral-700">
                <span>probability</span>
                <span class="font-semibold text-neutral-900" id="cc-gc-turn-prob">n/a</span>
              </div>
              <div class="mt-2 h-2 rounded-full bg-neutral-100 border border-neutral-200 overflow-hidden">
                <div id="cc-gc-turn-bar" class="h-full rounded-full bg-cordobaGold" style="width:0%"></div>
              </div>
              <div class="mt-2 text-[11px] text-neutral-600 leading-relaxed" id="cc-gc-turn-note">
                n/a
              </div>
            </div>
            <div class="mt-3 text-[11px] text-neutral-600">
              Built from growth weakness, unemployment slope, liquidity rollover, external tension, and growth/inflation disagreement.
            </div>
          </div>

          <div class="rounded-2xl border border-neutral-200 bg-white p-3">
            <div class="text-xs font-medium text-neutral-900">Nowcast vs forecast gap</div>
            <div class="mt-2 grid grid-cols-2 gap-2">
              <div class="rounded-xl border border-neutral-200 bg-[#FFFCF9] px-3 py-2">
                <div class="text-[11px] text-neutral-500">nowcast</div>
                <div class="text-sm font-semibold text-neutral-900" id="cc-gc-nowcast">n/a</div>
                <div class="text-[11px] text-neutral-600 mt-1" id="cc-gc-nowcast-meta">—</div>
              </div>
              <div class="rounded-xl border border-neutral-200 bg-[#FFFCF9] px-3 py-2">
                <div class="text-[11px] text-neutral-500">forecast (trend)</div>
                <div class="text-sm font-semibold text-neutral-900" id="cc-gc-forecast">n/a</div>
                <div class="text-[11px] text-neutral-600 mt-1" id="cc-gc-gap">—</div>
              </div>
            </div>

            <div class="mt-3">
              <canvas id="cc-gc-gap-chart" class="cc-canvas" width="520" height="160"></canvas>
              <div class="mt-2 text-[11px] text-neutral-600">
                Chart shows output gap (%) when real GDP level is available; otherwise it shows composite history.
              </div>
            </div>
          </div>
        </div>

        <div class="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div class="rounded-2xl border border-neutral-200 bg-white p-3">
            <div class="text-xs font-medium text-neutral-900">Scenario shocks (stress the cycle)</div>
            <div class="mt-2 space-y-2" id="cc-gc-scenarios"></div>
          </div>

          <div class="rounded-2xl border border-neutral-200 bg-white p-3">
            <div class="text-xs font-medium text-neutral-900">Cross-asset correlations (best-effort)</div>
            <div class="mt-2 text-[11px] text-neutral-600" id="cc-gc-corr-stamp">loading…</div>
            <div class="mt-2 space-y-2" id="cc-gc-corr-body"></div>
            <div class="mt-2 text-[11px] text-neutral-500">
              If market proxies fail due to CORS/availability, the block falls back to macro-only correlations.
            </div>
          </div>
        </div>
      </div>
    `;
  }

  function renderCorrelations(root, data) {
    if (!root) return;
    root.innerHTML = "";

    if (!data || !data.ok) {
      const p = document.createElement("div");
      p.className = "text-[11px] text-neutral-500";
      p.textContent = data?.reason || "Correlation block unavailable.";
      root.appendChild(p);
      return;
    }

    if (data.macroCorr && data.macroCorr.length) {
      const box = document.createElement("div");
      box.className = "rounded-xl border border-neutral-200 bg-[#FFFCF9] px-3 py-2";
      box.innerHTML = `<div class="text-[11px] uppercase tracking-[0.2em] text-neutral-500">macro ↔ macro</div>`;
      data.macroCorr.forEach(c => {
        const row = document.createElement("div");
        row.className = "mt-2 flex items-center justify-between text-xs";
        row.innerHTML = `
          <div class="text-neutral-700">${c.a} vs ${c.b}</div>
          <div class="font-semibold text-neutral-900">${c.r.toFixed(2)}</div>
        `;
        box.appendChild(row);
      });
      root.appendChild(box);
    }

    if (data.assetCorr && data.assetCorr.length) {
      const box = document.createElement("div");
      box.className = "rounded-xl border border-neutral-200 bg-white px-3 py-2";
      box.innerHTML = `<div class="text-[11px] uppercase tracking-[0.2em] text-neutral-500">macro ↔ assets</div>`;
      data.assetCorr.forEach(c => {
        const row = document.createElement("div");
        row.className = "mt-2 text-[11px] text-neutral-700 leading-relaxed";
        const rg = c.r_gdp == null ? "n/a" : c.r_gdp.toFixed(2);
        const ri = c.r_infl == null ? "n/a" : c.r_infl.toFixed(2);
        row.textContent = `${c.asset}: corr(GDP, returns) ${rg} · corr(Inflation, returns) ${ri}`;
        box.appendChild(row);
      });
      root.appendChild(box);
    } else {
      const note = document.createElement("div");
      note.className = "text-[11px] text-neutral-500";
      note.textContent = data.proxyCount ? "Not enough overlap for asset correlations." : "Market proxies unavailable; macro-only correlations shown.";
      root.appendChild(note);
    }
  }

  function buildTurnNote(p, engines) {
    const g = safeNum(engines?.growth?.z, 0);
    const l = safeNum(engines?.liquidity?.z, 0);
    const e = safeNum(engines?.external?.z, 0);

    if (p >= 0.65) {
      return "Turning risk is elevated. If this persists, risk premia tends to move before the macro narrative catches up.";
    }
    if (p >= 0.45) {
      return "Turning risk is medium. The next step is whether liquidity/external tension worsens or stabilises.";
    }
    if (g > 0.5 && l > 0.5 && e > -0.2) {
      return "Turning risk is low. Cycle looks supported unless a shock hits liquidity or the external channel.";
    }
    return "Turning risk is low-to-mixed. Watch slope changes rather than level prints.";
  }

  function computeForecastFromOutputGap(outGap) {
    // Forecast proxy: trend growth latest (from HP trend log-diff)
    if (!outGap || !outGap.trendGrowth || outGap.trendGrowth.length < 2) return null;
    const tg = outGap.trendGrowth.filter(v => v != null);
    if (!tg.length) return null;
    return tg[tg.length - 1];
  }

  function seriesToCompositeHistory(statsById) {
    // Build a “leading composite” history from available annual series (money/CA/unemp/infl)
    // If series are missing, we still return minimal.
    const m = statsById?.money?.series || [];
    const ca = statsById?.current_account?.series || [];
    const u = statsById?.unemployment?.series || [];
    const infl = statsById?.inflation?.series || [];

    const maps = {
      m: new Map(m.map(p => [p.year, Number(p.value)])),
      ca: new Map(ca.map(p => [p.year, Number(p.value)])),
      u: new Map(u.map(p => [p.year, Number(p.value)])),
      infl: new Map(infl.map(p => [p.year, Number(p.value)]))
    };

    const years = Array.from(new Set([...maps.m.keys(), ...maps.ca.keys(), ...maps.u.keys(), ...maps.infl.keys()]))
      .filter(y => Number.isFinite(y))
      .sort((a, b) => a - b);

    if (years.length < 8) return null;

    // Z-score each component across available years (simple)
    function zMap(map) {
      const vals = years.map(y => map.has(y) ? map.get(y) : null).filter(v => v != null && Number.isFinite(v));
      const mu = mean(vals);
      const sd = stdev(vals) || 1;
      const out = new Map();
      years.forEach(y => {
        const v = map.get(y);
        if (v == null || !Number.isFinite(v)) return;
        out.set(y, (v - mu) / sd);
      });
      return out;
    }

    const zm = zMap(maps.m);
    const zca = zMap(maps.ca);
    const zu = zMap(maps.u);
    const zinf = zMap(maps.infl);

    const out = [];
    years.forEach(y => {
      const a = zm.get(y);
      const b = zca.get(y);
      const c = zu.get(y);
      const d = zinf.get(y);
      if (a == null && b == null && c == null && d == null) return;
      const comp =
        0.45 * (a ?? 0) +
        0.30 * (b ?? 0) -
        0.35 * (c ?? 0) -
        0.20 * (d ?? 0);
      out.push({ year: y, comp: clamp(comp, -2.5, 2.5) });
    });

    return out.length >= 8 ? out : null;
  }

  async function render(countryKey, statsById, engines) {
    const root = $("cc-growth-cycle-quant");
    if (!root) return;

    renderSkeleton(root);

    const stamp = $("cc-gc-stamp");
    if (stamp) stamp.textContent = "derived from annual macro + WB real GDP level (when available)";

    // scenario state
    const shockState = { growth: 0, inflation: 0, liquidity: 0, external: 0 };

    const scenarioRoot = $("cc-gc-scenarios");
    const rerenderAll = async () => {
      const shocked = applyEngineShocks(engines, shockState);

      // regime probs
      const rp = regimeProbabilities(shocked);
      drawProbBars($("cc-gc-regime-bars"), rp.regimes.slice(0, 4));
      const confEl = $("cc-gc-regime-conf");
      if (confEl) confEl.textContent = formatPct01(rp.confidence);

      // turning risk
      const tp = turningPointProbability(statsById, shocked);
      const tpEl = $("cc-gc-turn-prob");
      if (tpEl) tpEl.textContent = formatPct01(tp);
      const bar = $("cc-gc-turn-bar");
      if (bar) bar.style.width = `${Math.round(tp * 100)}%`;
      const note = $("cc-gc-turn-note");
      if (note) note.textContent = buildTurnNote(tp, shocked);

      // nowcast
      const nc = nowcastGrowth(statsById);
      const nowEl = $("cc-gc-nowcast");
      const metaEl = $("cc-gc-nowcast-meta");
      if (nc && nowEl) nowEl.textContent = `${nc.nowcast.toFixed(2)}%`;
      if (nc && metaEl) metaEl.textContent = `composite z ${nc.composite.toFixed(2)} · mean ${nc.mu.toFixed(2)}%`;

      // aux: output gap + forecast proxy
      const aux = await ensureAux(countryKey);
      const outGap = computeOutputGapFromRealGDP(aux.realGDP);
      const forecast = computeForecastFromOutputGap(outGap);

      const fcEl = $("cc-gc-forecast");
      const gapEl = $("cc-gc-gap");
      if (fcEl) fcEl.textContent = forecast == null ? "n/a" : `${forecast.toFixed(2)}%`;
      if (gapEl) {
        if (nc && forecast != null) {
          const g = nc.nowcast - forecast;
          gapEl.textContent = `gap (nowcast - trend): ${g >= 0 ? "+" : ""}${g.toFixed(2)}pp`;
        } else {
          gapEl.textContent = "gap: n/a";
        }
      }

      // chart: output gap if available; else composite history
      const canvas = $("cc-gc-gap-chart");
      if (outGap && outGap.years && outGap.gap && outGap.years.length === outGap.gap.length) {
        const pts = outGap.years.map((y, i) => ({ x: y, y: outGap.gap[i] }));
        const tail = pts.slice(-25);
        drawLine(canvas, tail.map(d => ({ x: d.x, y: d.y })), { label: "Output gap (%)" });
      } else {
        const hist = seriesToCompositeHistory(statsById);
        if (hist) {
          const tail = hist.slice(-25).map(d => ({ x: d.year, y: d.comp }));
          drawLine(canvas, tail, { label: "Leading composite (z)" });
        } else {
          drawLine(canvas, null, {});
        }
      }
    };

    renderScenarioControls(scenarioRoot, shockState, () => { rerenderAll(); });

    await rerenderAll();

    // correlations
    const corrStamp = $("cc-gc-corr-stamp");
    const corrBody = $("cc-gc-corr-body");
    if (corrStamp) corrStamp.textContent = "computing…";

    try {
      const c = await buildCrossAssetBlock(countryKey, statsById);
      if (corrStamp) {
        corrStamp.textContent = c.ok
          ? `ready · proxies loaded: ${c.proxyCount || 0}`
          : "unavailable";
      }
      renderCorrelations(corrBody, c);
    } catch (e) {
      if (corrStamp) corrStamp.textContent = "unavailable";
      renderCorrelations(corrBody, { ok: false, reason: "Could not fetch cross-asset proxies." });
    }
  }

  window.CCGrowthCycleQuant = { render };
})();
