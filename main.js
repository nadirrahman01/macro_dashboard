// Cordoba Capital – Global Macro Engine (Beta)
// Data source: World Bank World Development Indicators (WDI)

const COUNTRY_META = {
  US: { name: "United States", region: "G-20 · DM", wb: "USA" },
  UK: { name: "United Kingdom", region: "G-20 · DM", wb: "GBR" },
  GB: { name: "United Kingdom", region: "G-20 · DM", wb: "GBR" },
  DE: { name: "Germany", region: "G-20 · DM", wb: "DEU" },
  FR: { name: "France", region: "G-20 · DM", wb: "FRA" },
  JP: { name: "Japan", region: "G-20 · DM", wb: "JPN" },
  CN: { name: "China", region: "G-20 · EM", wb: "CHN" },
  IN: { name: "India", region: "G-20 · EM", wb: "IND" },
  BR: { name: "Brazil", region: "G-20 · EM", wb: "BRA" },
  UZ: { name: "Uzbekistan", region: "Central Asia · EM", wb: "UZB" }
};

const INDICATORS = [
  { id: "gdp_growth", wb: "NY.GDP.MKTP.KD.ZG", label: "GDP growth (annual %)", engine: "Growth", bucket: "Coincident", higherIsGood: true, unit: "%", decimals: 1 },
  { id: "inflation", wb: "FP.CPI.TOTL.ZG", label: "Inflation, CPI (annual %)", engine: "Inflation", bucket: "Coincident", higherIsGood: false, unit: "%", decimals: 1 },
  { id: "unemployment", wb: "SL.UEM.TOTL.ZS", label: "Unemployment rate (% labour force)", engine: "Growth", bucket: "Lagging", higherIsGood: false, unit: "%", decimals: 1 },
  { id: "money", wb: "FM.LBL.BMNY.ZG", label: "Broad money (M2) growth (annual %)", engine: "Liquidity", bucket: "Leading", higherIsGood: true, unit: "%", decimals: 1 },
  { id: "current_account", wb: "BN.CAB.XOKA.GD.ZS", label: "Current account balance (% of GDP)", engine: "External", bucket: "Coincident", higherIsGood: true, unit: "% of GDP", decimals: 1 }
];

const CORDOBA_RESEARCH = [
  {
    id: "global_volatility",
    title: "Navigating Volatility, Trump’s Second Term, China’s Retaliation, Global Shifts, and Emerging Opportunities",
    url: "https://cordobacapital.co.uk/navigating-volatility-trumps-second-term-chinas-retaliation-global-shifts-and-emerging-opportunities/",
    countries: ["US", "CN"],
    regions: ["Global"],
    engines: ["growth", "inflation", "external"],
    tags: ["volatility", "rates", "geopolitics"]
  },
  {
    id: "global_change",
    title: "Navigating Change, Europe’s Transformation, China’s Challenges, US Debt Struggles, and Emerging Opportunities",
    url: "https://cordobacapital.co.uk/navigating-change-europes-transformation-chinas-challenges-us-debt-struggles-and-emerging-opportunities/",
    countries: [],
    regions: ["Europe", "Global"],
    engines: ["growth", "external", "liquidity"],
    tags: ["europe", "china", "debt"]
  },
  {
    id: "malaysia_macro",
    title: "No One’s Watching Malaysia. Maybe They Should Be",
    url: "https://cordobacapital.co.uk/no-ones-watching-malaysia-maybe-they-should-be/",
    countries: [],
    regions: ["EM", "Asia"],
    engines: ["growth", "external"],
    tags: ["malaysia", "em", "bonds"]
  },
  {
    id: "malaysia_bonds",
    title: "May 2025 Malaysia Bond Market Outlook",
    url: "https://cordobacapital.co.uk/may-2025-malaysia-bond-market-outlook/",
    countries: [],
    regions: ["EM", "Asia"],
    engines: ["liquidity", "external"],
    tags: ["rates", "bonds", "malaysia"]
  }
];

const macroCache = {};

// Engine model definitions, weights and sign conventions
// Contribution = weight × adjusted z
// Adjusted z flips sign when “higher is bad” for that engine’s meaning
const ENGINE_MODEL = {
  growth: [
    { indicator: "gdp_growth", weight: 1.0, flip: false, label: "GDP growth" },
    { indicator: "unemployment", weight: 0.4, flip: true, label: "Unemployment" }
  ],
  inflation: [
    { indicator: "inflation", weight: 1.0, flip: true, label: "CPI inflation" }
  ],
  liquidity: [
    { indicator: "money", weight: 1.0, flip: false, label: "Broad money growth" }
  ],
  external: [
    { indicator: "current_account", weight: 1.0, flip: false, label: "Current account" }
  ]
};

async function fetchWorldBankSeries(countryKey, indicatorCode) {
  const meta = COUNTRY_META[countryKey];
  if (!meta) return { series: [], updatedAt: null };
  const wbCode = meta.wb;
  const cacheKey = `wb_${wbCode}_${indicatorCode}`;

  try {
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      if (cached.timestamp && Date.now() - cached.timestamp < maxAgeMs) {
        return { series: cached.series || [], updatedAt: cached.updatedAt || null };
      }
    }
  } catch (err) {}

  const url = `https://api.worldbank.org/v2/country/${wbCode}/indicator/${indicatorCode}?format=json&per_page=200`;

  try {
    const res = await fetch(url);
    if (!res.ok) return { series: [], updatedAt: null };
    const json = await res.json();
    const header = Array.isArray(json) ? json[0] : null;
    const data = Array.isArray(json) ? json[1] : null;

    const updatedAt = header && header.lastupdated ? header.lastupdated : null;

    if (!Array.isArray(data)) return { series: [], updatedAt };

    const series = data
      .filter((d) => d && d.value != null)
      .map((d) => {
        const year = parseInt(d.date, 10);
        return { year, month: 12, period: `${year}-12-31`, value: Number(d.value) };
      })
      .sort((a, b) => a.year - b.year);

    try {
      localStorage.setItem(cacheKey, JSON.stringify({ timestamp: Date.now(), series, updatedAt }));
    } catch (err) {}

    return { series, updatedAt };
  } catch (err) {
    return { series: [], updatedAt: null };
  }
}

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

function inferYearFromPoint(p) {
  if (!p) return undefined;
  if (typeof p.year === "number" && !isNaN(p.year)) return p.year;
  if (p.period) {
    const m = String(p.period).match(/^(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

function inferMonthFromPoint(p) {
  if (!p) return 12;
  if (typeof p.month === "number" && p.month >= 1 && p.month <= 12) return p.month;
  if (p.period) {
    const s = String(p.period);
    let m = s.match(/^\d{4}(\d{2})$/);
    if (m) {
      const mm = parseInt(m[1], 10);
      if (mm >= 1 && mm <= 12) return mm;
    }
    m = s.match(/^\d{4}-(\d{2})/);
    if (m) {
      const mm = parseInt(m[1], 10);
      if (mm >= 1 && mm <= 12) return mm;
    }
  }
  return 12;
}

function formatPeriodLabel(p) {
  const year = inferYearFromPoint(p);
  if (!year) return "n/a";
  const month = inferMonthFromPoint(p);
  const idx = Math.min(Math.max(month - 1, 0), 11);
  return `${MONTH_SHORT[idx]}-${year}`;
}

function formatUpdatedAt(dateStr) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return `${MONTH_FULL[d.getMonth()]} ${d.getFullYear()}`;
}

function computeStats(series, lookbackYears = 10, updatedAt = null) {
  if (!series.length) return null;

  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;

  const latestYear = inferYearFromPoint(latest);
  const cutoffYear = latestYear ? latestYear - lookbackYears + 1 : null;

  const window = cutoffYear
    ? series.filter((p) => (inferYearFromPoint(p) || 0) >= cutoffYear)
    : series.slice();

  const values = window.map((p) => p.value);
  const mean = values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : latest.value;

  const variance =
    values.length > 1
      ? values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1)
      : 0;

  const stdev = Math.sqrt(variance);
  const z = stdev > 0 ? (latest.value - mean) / stdev : 0;
  const delta = prev ? latest.value - prev.value : 0;

  const zByYear = window.map((p) => {
    const y = inferYearFromPoint(p);
    return { year: y, z: stdev > 0 ? (p.value - mean) / stdev : 0 };
  });

  const analogues = zByYear
    .filter((p) => p.year != null)
    .map((p) => ({ ...p, diff: Math.abs(p.z - z) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3)
    .map((p) => p.year);

  return { latest, prev, mean, stdev, z, delta, analogues, windowYears: window.length, updatedAt };
}

function formatNumber(val, decimals = 1, unit = "", fallback = "n/a") {
  if (val == null || isNaN(val)) return fallback;
  const num = Number(val).toFixed(decimals);
  if (unit === "%" || unit === "% of GDP") return `${num}%`;
  return num;
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function capitaliseFirst(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function engineScoreFromIndicators(statsById) {
  function scoreFromZ(z) {
    const clamped = Math.max(-2.5, Math.min(2.5, z || 0));
    return Math.round(50 + (clamped / 2.5) * 40);
  }

  const gdp = statsById.gdp_growth;
  const infl = statsById.inflation;
  const u = statsById.unemployment;
  const m2 = statsById.money;
  const ca = statsById.current_account;

  const growthZ = (gdp ? (gdp.z || 0) : 0) - (u ? (u.z || 0) * 0.4 : 0);
  const inflationZ = infl ? -infl.z : 0;
  const liquidityZ = m2 ? m2.z : 0;
  const externalZ = ca ? ca.z : 0;

  return {
    growth: { z: growthZ, score: scoreFromZ(growthZ) },
    inflation: { z: inflationZ, score: scoreFromZ(inflationZ) },
    liquidity: { z: liquidityZ, score: scoreFromZ(liquidityZ) },
    external: { z: externalZ, score: scoreFromZ(externalZ) }
  };
}

function riskLevelFromZ(z) {
  if (z == null || isNaN(z)) return "n/a";
  const absZ = Math.abs(z);
  if (absZ < 0.5) return "low";
  if (absZ < 1.0) return "medium";
  return "high";
}

// Heatmap styles for z and contribution cells
function heatStyle(value) {
  if (value == null || isNaN(value)) {
    return { backgroundColor: "transparent", color: "#111827" };
  }

  const v = Math.max(-2.5, Math.min(2.5, value));
  const abs = Math.abs(v);

  let alpha = 0.08;
  if (abs >= 0.5) alpha = 0.14;
  if (abs >= 1.0) alpha = 0.22;
  if (abs >= 1.5) alpha = 0.30;

  const pos = v >= 0;
  const rgb = pos ? "16,185,129" : "244,63,94"; // emerald, rose
  return {
    backgroundColor: `rgba(${rgb},${alpha})`,
    color: "#111827"
  };
}

function buildEngineInterpretation(engineId, engineZ) {
  if (engineZ == null || isNaN(engineZ)) return "Insufficient data for this engine.";
  const abs = Math.abs(engineZ);
  const side = engineZ > 0 ? "above" : "below";
  if (abs < 0.5) return "Near its own history, likely low signal for repricing unless the slope changes.";
  if (abs < 1.0) return `Moderately ${side} history, watch whether this persists into next prints.`;
  return `Meaningfully ${side} history, this is where markets tend to reprice narratives and risk premia.`;
}

function renderEngineBreakdown(statsById, engines) {
  const tbody = document.getElementById("cc-engine-breakdown");
  if (!tbody) return;

  const engineRows = ["growth", "inflation", "liquidity", "external"];
  tbody.innerHTML = "";

  engineRows.forEach((engineId) => {
    const components = ENGINE_MODEL[engineId] || [];
    const engineZ = engines?.[engineId]?.z;
    const engineScore = engines?.[engineId]?.score;

    let engineContribTotal = 0;
    const contribs = components.map((c) => {
      const stat = statsById[c.indicator];
      const zRaw = stat ? (stat.z || 0) : null;
      const zAdj = zRaw == null ? null : (c.flip ? -zRaw : zRaw);
      const contrib = zAdj == null ? null : (c.weight * zAdj);
      if (contrib != null) engineContribTotal += contrib;
      return { ...c, zRaw, zAdj, contrib };
    });

    const interpretation = buildEngineInterpretation(engineId, engineZ);

    contribs.forEach((row, idx) => {
      const tr = document.createElement("tr");
      tr.className = "hover:bg-cordobaSoft";

      const w = row.weight != null ? row.weight.toFixed(2) : "n/a";
      const z = row.zAdj != null ? row.zAdj.toFixed(2) : "n/a";
      const cVal = row.contrib != null ? row.contrib.toFixed(2) : "n/a";

      const zStyle = heatStyle(row.zAdj);
      const cStyle = heatStyle(row.contrib);
      const eZStyle = heatStyle(engineZ);
      const eScoreStyle = heatStyle((engineScore != null ? (engineScore - 50) / 10 : null)); // score centred proxy

      const engineLabel = capitaliseFirst(engineId);
      const indicatorCfg = INDICATORS.find((i) => i.id === row.indicator);
      const compLabel = indicatorCfg ? indicatorCfg.label : row.label;

      tr.innerHTML = `
        <td class="py-2 pr-3 text-neutral-900 font-medium">${idx === 0 ? engineLabel : ""}</td>
        <td class="py-2 pr-3 text-neutral-700">${compLabel}</td>
        <td class="py-2 pr-3 text-right text-neutral-700">${w}</td>
        <td class="py-2 pr-3 text-right text-neutral-900" style="background:${zStyle.backgroundColor};">${z}</td>
        <td class="py-2 pr-3 text-right text-neutral-900" style="background:${cStyle.backgroundColor};">${cVal}</td>
        <td class="py-2 pr-3 text-right text-neutral-900" style="background:${eZStyle.backgroundColor};">${engineZ != null && !isNaN(engineZ) ? engineZ.toFixed(2) : "n/a"}</td>
        <td class="py-2 pr-3 text-right text-neutral-900" style="background:${eScoreStyle.backgroundColor};">${engineScore != null ? engineScore : "n/a"}</td>
        <td class="py-2 pr-3 text-neutral-600">${idx === 0 ? interpretation : ""}</td>
      `;

      tbody.appendChild(tr);
    });

    if (!contribs.length) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="8" class="py-3 text-center text-neutral-400">No model definition for ${engineId}.</td>`;
      tbody.appendChild(tr);
    }
  });
}

function buildMarketLens(engines) {
  const g = engines?.growth?.z ?? 0;
  const i = engines?.inflation?.z ?? 0;
  const l = engines?.liquidity?.z ?? 0;
  const e = engines?.external?.z ?? 0;

  const pills = [];

  let rates = "Rates: balanced";
  if (i > 0.7) rates = "Rates: higher for longer risk";
  else if (i < -0.7) rates = "Rates: easing window";
  pills.push(rates);

  let fx = "FX: broadly steady";
  if (e < -0.7) fx = "FX: funding stress risk";
  else if (e > 0.7) fx = "FX: supported by balance";
  pills.push(fx);

  let risk = "Risk: mixed conditions";
  if (g > 0.5 && l > 0.5) risk = "Risk: supportive impulse";
  else if (g < -0.5 && l < -0.5) risk = "Risk: tightening impulse";
  pills.push(risk);

  const divergence = Math.abs(i - g);
  let duration = "Duration stress: low";
  if (i > 0.7 && divergence > 0.9) duration = "Duration stress: latent";
  if (i > 1.2 && divergence > 1.2) duration = "Duration stress: elevated";
  pills.push(duration);

  const note =
    "This is a proxy read from the engine, not market ticks. When inflation pressure is high while growth is not, duration tends to carry more hidden convexity risk, and the external engine is usually the first place to watch for cracks.";

  return { pills, note };
}

function renderMarketLens(engines) {
  const wrap = document.getElementById("cc-market-lens");
  const noteEl = document.getElementById("cc-market-lens-note");
  const stampEl = document.getElementById("cc-market-lens-stamp");
  if (!wrap || !noteEl) return;

  const { pills, note } = buildMarketLens(engines);

  wrap.innerHTML = "";
  pills.forEach((t) => {
    const span = document.createElement("span");
    span.className = "inline-flex items-center px-2.5 py-0.5 rounded-full border border-neutral-300 bg-white text-xs text-neutral-700";
    span.textContent = t;
    wrap.appendChild(span);
  });

  noteEl.textContent = note;
  if (stampEl) stampEl.textContent = "derived from current engine scores";
}

function renderRegimeSummary(countryKey, statsById, engines) {
  const meta = COUNTRY_META[countryKey] || { name: countryKey, region: "" };
  const titleEl = document.getElementById("cc-regime-title");
  const bodyEl = document.getElementById("cc-regime-body");
  const confEl = document.getElementById("cc-regime-confidence");
  const analogEl = document.getElementById("cc-analogue-years");
  const riskEl = document.getElementById("cc-risk-flags");

  const gdp = statsById.gdp_growth;
  const infl = statsById.inflation;
  const unemp = statsById.unemployment;
  const ca = statsById.current_account;

  const growthZ = gdp ? gdp.z : 0;
  const inflZ = infl ? infl.z : 0;

  let growthPhrase = "near-trend growth";
  if (growthZ > 0.5) growthPhrase = "above-trend growth";
  else if (growthZ < -0.5) growthPhrase = "below-trend growth";

  let inflationPhrase = "stable inflation";
  if (inflZ > 0.5) inflationPhrase = "elevated inflation";
  else if (inflZ < -0.5) inflationPhrase = "disinflation";

  const title = `${capitaliseFirst(growthPhrase)} with ${inflationPhrase} – ${meta.name}`;
  if (titleEl) titleEl.textContent = title;

  const parts = [];
  if (gdp) parts.push(`Real GDP growth is ${formatNumber(gdp.latest.value, 1, "%")} compared with a history average of ${formatNumber(gdp.mean, 1, "%")}.`);
  if (infl) parts.push(`Headline inflation is ${formatNumber(infl.latest.value, 1, "%")} versus a history average of ${formatNumber(infl.mean, 1, "%")}.`);
  if (unemp) parts.push(`Unemployment stands at ${formatNumber(unemp.latest.value, 1, "%")}, relative to an historical average of ${formatNumber(unemp.mean, 1, "%")}.`);
  if (ca) parts.push(`The current-account balance is ${formatNumber(ca.latest.value, 1, "% of GDP")} versus a history average of ${formatNumber(ca.mean, 1, "% of GDP")}.`);

  if (bodyEl) bodyEl.textContent = parts.join(" ") || "Insufficient historical data to build a macro summary for this country.";

  const indicatorsWithData = Object.values(statsById).filter(Boolean).length;
  const avgWindow = average(Object.values(statsById).filter(Boolean).map((s) => s.windowYears || 0));
  let confidence = 0.4 * (indicatorsWithData / INDICATORS.length) + 0.6 * Math.min(avgWindow / 10, 1);
  confidence = Math.round(confidence * 100);
  if (confEl) confEl.textContent = `${confidence}%`;

  if (analogEl) {
    analogEl.innerHTML = "";
    const analogueYears = gdp ? gdp.analogues : [];
    if (analogueYears && analogueYears.length) {
      analogueYears.forEach((year) => {
        const pill = document.createElement("span");
        pill.className = "inline-flex items-center px-2.5 py-0.5 rounded-full border border-neutral-300 bg-cordobaSoft text-xs";
        pill.textContent = year;
        analogEl.appendChild(pill);
      });
    } else {
      analogEl.innerHTML = '<span class="text-xs text-neutral-400">Not enough history for analogues.</span>';
    }
  }

  if (riskEl) {
    riskEl.innerHTML = "";

    const growthRisk = riskLevelFromZ(engines.growth.z);
    const inflationRisk = riskLevelFromZ(engines.inflation.z);
    const externalRisk = riskLevelFromZ(engines.external.z);

    [
      { label: "Growth risk", level: growthRisk },
      { label: "Inflation risk", level: inflationRisk },
      { label: "External risk", level: externalRisk }
    ].forEach((r) => {
      const span = document.createElement("span");
      span.className = "inline-flex items-center px-2.5 py-0.5 rounded-full border bg-cordobaSoft text-xs border-neutral-300 mr-1 mb-1";
      span.textContent = `${r.label}: ${r.level}`;
      riskEl.appendChild(span);
    });
  }

  renderMarketLens(engines);
}

function renderEngineCards(engines) {
  const container = document.getElementById("cc-engine-cards");
  if (!container) return;
  container.innerHTML = "";

  const meta = [
    { id: "growth", title: "Growth", color: "border-emerald-300", text: "text-emerald-700" },
    { id: "inflation", title: "Inflation", color: "border-amber-300", text: "text-amber-700" },
    { id: "liquidity", title: "Liquidity", color: "border-sky-300", text: "text-sky-700" },
    { id: "external", title: "External", color: "border-rose-300", text: "text-rose-700" }
  ];

  meta.forEach((m) => {
    const engine = engines[m.id];
    const z = engine ? engine.z : 0;
    const score = engine ? engine.score : 50;

    const card = document.createElement("div");
    card.className = "rounded-2xl border bg-cordobaSoft px-3 py-2 flex flex-col justify-between " + m.color;

    const header = document.createElement("div");
    header.className = "flex items-baseline justify-between text-[10px] tracking-[0.18em] uppercase text-neutral-500";
    header.innerHTML = `<span>${m.title}</span><span>z ${z ? z.toFixed(1) : "0.0"}</span>`;
    card.appendChild(header);

    const main = document.createElement("div");
    main.className = "mt-3 flex flex-col gap-2";

    const scoreEl = document.createElement("div");
    scoreEl.innerHTML = `<div class="text-lg font-semibold">${score}<span class="text-xs text-neutral-400">/100</span></div><div class="text-[10px] text-neutral-500 mt-0.5">vs recent history</div>`;
    main.appendChild(scoreEl);

    const qualitative = Math.abs(z) < 0.5 ? "Near trend" : z > 0 ? "Above trend" : "Below trend";
    const labelEl = document.createElement("span");
    labelEl.className = "inline-flex items-center justify-center whitespace-nowrap px-3 py-1 rounded-full border text-[11px] font-medium border-neutral-300 bg-white " + m.text;
    labelEl.textContent = qualitative;
    main.appendChild(labelEl);

    card.appendChild(main);
    container.appendChild(card);
  });
}

// The rest of your functions stay as they are in your current file.
// You already have renderHeadlineTiles, renderInflectionSignals, renderIndicatorGrid, renderMeta, renderNoteHelper, renderNextQuestions, renderResearchSuggestions, setupCountryDropdown, setupMethodologyModal, setupFilters.
// Keep them unchanged.

// You only need this loader change, so the new section updates whenever country changes.
async function loadCountry(countryKey) {
  const meta = COUNTRY_META[countryKey] || { name: countryKey, region: "" };

  const labelEl = document.getElementById("cc-country-current-label");
  const regionEl = document.getElementById("cc-country-current-region");
  if (labelEl) labelEl.textContent = meta.name;
  if (regionEl) regionEl.textContent = meta.region || "";

  if (macroCache[countryKey]) {
    const statsById = macroCache[countryKey];
    const engines = engineScoreFromIndicators(statsById);

    renderRegimeSummary(countryKey, statsById, engines);
    renderEngineCards(engines);
    renderEngineBreakdown(statsById, engines);

    renderHeadlineTiles(statsById);
    renderInflectionSignals(statsById);
    renderIndicatorGrid(statsById, countryKey);
    renderMeta(statsById);
    renderNoteHelper(countryKey, statsById, engines);
    renderNextQuestions(statsById, engines);
    renderResearchSuggestions(countryKey, statsById, engines);
    return;
  }

  document.body.classList.add("cc-loading");

  try {
    const requests = INDICATORS.map((cfg) =>
      fetchWorldBankSeries(countryKey, cfg.wb).then(({ series, updatedAt }) => ({ cfg, series, updatedAt }))
    );

    const results = await Promise.all(requests);

    const statsById = {};
    results.forEach(({ cfg, series, updatedAt }) => {
      const stats = series && series.length ? computeStats(series, 10, updatedAt) : null;
      statsById[cfg.id] = stats;
    });

    macroCache[countryKey] = statsById;

    const engines = engineScoreFromIndicators(statsById);

    renderRegimeSummary(countryKey, statsById, engines);
    renderEngineCards(engines);
    renderEngineBreakdown(statsById, engines);

    renderHeadlineTiles(statsById);
    renderInflectionSignals(statsById);
    renderIndicatorGrid(statsById, countryKey);
    renderMeta(statsById);
    renderNoteHelper(countryKey, statsById, engines);
    renderNextQuestions(statsById, engines);
    renderResearchSuggestions(countryKey, statsById, engines);
  } catch (err) {
    console.error("Failed to load country data:", err);
  } finally {
    document.body.classList.remove("cc-loading");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  setupCountryDropdown();
  setupMethodologyModal();
  setupFilters();
  loadCountry("US");
});
