// main.js
// Cordoba Capital – Global Macro Engine
// Uses World Bank WDI data (annual) to drive all numbers & labels.

// ---------------------------------------------------------------------------
// Country metadata (includes World Bank 3-letter codes)
// ---------------------------------------------------------------------------
const COUNTRY_META = {
  US: { name: "United States", region: "G-20 · DM", wb: "USA" },
  GB: { name: "United Kingdom", region: "G-20 · DM", wb: "GBR" },
  DE: { name: "Germany", region: "G-20 · DM", wb: "DEU" },
  FR: { name: "France", region: "G-20 · DM", wb: "FRA" },
  JP: { name: "Japan", region: "G-20 · DM", wb: "JPN" },
  CN: { name: "China", region: "G-20 · EM", wb: "CHN" },
  IN: { name: "India", region: "G-20 · EM", wb: "IND" },
  BR: { name: "Brazil", region: "G-20 · EM", wb: "BRA" }
};

// ---------------------------------------------------------------------------
// Core indicators used in the engine
// ---------------------------------------------------------------------------
const INDICATORS = [
  {
    id: "gdp_growth",
    wb: "NY.GDP.MKTP.KD.ZG", // GDP growth (annual %)
    label: "GDP growth (annual %)",
    engine: "Growth",
    bucket: "Coincident",
    higherIsGood: true,
    unit: "%",
    decimals: 1
  },
  {
    id: "inflation",
    wb: "FP.CPI.TOTL.ZG", // Inflation, consumer prices (annual %)
    label: "Inflation, CPI (annual %)",
    engine: "Inflation",
    bucket: "Coincident",
    higherIsGood: false,
    unit: "%",
    decimals: 1
  },
  {
    id: "unemployment",
    wb: "SL.UEM.TOTL.ZS", // Unemployment rate (% of labour force)
    label: "Unemployment rate (% labour force)",
    engine: "Growth",
    bucket: "Lagging",
    higherIsGood: false,
    unit: "%",
    decimals: 1
  },
  {
    id: "money",
    wb: "FM.LBL.MQMY.ZG", // Broad money (M2) growth (annual %)
    label: "Broad money (M2) growth (annual %)",
    engine: "Liquidity",
    bucket: "Leading",
    higherIsGood: true,
    unit: "%",
    decimals: 1
  },
  {
    id: "current_account",
    wb: "BN.CAB.XOKA.GD.ZS", // Current-account balance (% of GDP)
    label: "Current account balance (% of GDP)",
    engine: "External",
    bucket: "Coincident",
    higherIsGood: true,
    unit: "% of GDP",
    decimals: 1
  }
];

// In-memory cache for computed stats (per session)
const macroCache = {};

// ---------------------------------------------------------------------------
// World Bank fetch with localStorage cache
// ---------------------------------------------------------------------------
async function fetchWorldBankSeries(countryKey, indicatorCode) {
  // Map our country key (US, GB, etc.) to World Bank code (USA, GBR, etc.)
  const meta = COUNTRY_META[countryKey] || {};
  const wbCode = meta.wb || countryKey; // fallback: use key directly

  const cacheKey = `wb_${wbCode}_${indicatorCode}`;

  // 1) Try localStorage cache first
  try {
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000; // 7 days
      if (cached.timestamp && Date.now() - cached.timestamp < maxAgeMs) {
        return cached.series || [];
      }
    }
  } catch (e) {
    console.warn("LocalStorage read error:", e);
  }

  // 2) Live call to World Bank (HTTPS is essential for GitHub Pages)
  const url = `https://api.worldbank.org/v2/country/${wbCode}/indicator/${indicatorCode}?format=json&per_page=200`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("World Bank request failed:", res.status, url);
      return [];
    }
    const json = await res.json();
    const data = Array.isArray(json) ? json[1] : null;
    if (!Array.isArray(data)) return [];

    const series = data
      .filter(d => d && d.value != null)
      .map(d => ({
        year: parseInt(d.date, 10),
        value: Number(d.value)
      }))
      .sort((a, b) => a.year - b.year);

    // 3) Write to cache
    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          series
        })
      );
    } catch (e) {
      console.warn("LocalStorage write error:", e);
    }

    return series;
  } catch (err) {
    console.error("World Bank fetch error:", countryKey, indicatorCode, err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Stats & helpers
// ---------------------------------------------------------------------------
function computeStats(series, lookbackYears = 10) {
  if (!series.length) return null;

  const latest = series[series.length - 1];
  const prev = series.length >= 2 ? series[series.length - 2] : null;

  const cutoffYear = latest.year - lookbackYears + 1;
  const window = series.filter(p => p.year >= cutoffYear);

  const values = window.map(p => p.value);
  const mean =
    values.length > 0
      ? values.reduce((sum, v) => sum + v, 0) / values.length
      : latest.value;

  const variance =
    values.length > 1
      ? values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
        (values.length - 1)
      : 0;

  const stdev = Math.sqrt(variance);
  const z = stdev > 0 ? (latest.value - mean) / stdev : 0;
  const delta = prev ? latest.value - prev.value : 0;

  // For analogue years: closest years by z-score within the window
  const zByYear = window.map(p => ({
    year: p.year,
    z: stdev > 0 ? (p.value - mean) / stdev : 0
  }));
  const analogues = zByYear
    .map(p => ({ ...p, diff: Math.abs(p.z - z) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3)
    .map(p => p.year);

  return {
    latest,
    prev,
    mean,
    stdev,
    z,
    delta,
    analogues,
    windowYears: window.length
  };
}

function formatNumber(val, decimals = 1, unit = "", fallback = "n/a") {
  if (val == null || isNaN(val)) return fallback;
  const num = val.toFixed(decimals);
  if (unit === "%" || unit === "% of GDP") return `${num}%`;
  return num;
}

function classifySignal(stat, cfg) {
  if (!stat) {
    return {
      level: "n/a",
      strength: "none",
      label: "No recent data",
      direction: "flat"
    };
  }

  const { z, delta } = stat;
  const absZ = Math.abs(z);
  const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  let level;
  if (absZ < 0.5) level = "near trend";
  else if (absZ < 1.0) level = "moderate";
  else level = "extreme";

  let strength;
  if (absZ < 0.5) strength = "low";
  else if (absZ < 1.0) strength = "medium";
  else strength = "high";

  let label;
  if (cfg.higherIsGood) {
    if (z > 0.5 && direction === "up") label = "Strengthening above trend";
    else if (z > 0.5 && direction === "down") label = "Above trend, easing";
    else if (z < -0.5 && direction === "down") label = "Weak and deteriorating";
    else if (z < -0.5 && direction === "up") label = "Weak but stabilising";
    else label = "Close to trend";
  } else {
    if (z > 0.5 && direction === "up") label = "Elevated and rising";
    else if (z > 0.5 && direction === "down") label = "Elevated but cooling";
    else if (z < -0.5 && direction === "down") label = "Subdued and falling";
    else if (z < -0.5 && direction === "up") label = "Subdued but firming";
    else label = "Close to trend";
  }

  return { level, strength, label, direction };
}

function engineScoreFromIndicators(statsById) {
  function scoreFromZ(z) {
    const clamped = Math.max(-2.5, Math.min(2.5, z || 0));
    return Math.round(50 + (clamped / 2.5) * 40); // 10–90 range
  }

  const gdp = statsById.gdp_growth;
  const infl = statsById.inflation;
  const u = statsById.unemployment;
  const m2 = statsById.money;
  const ca = statsById.current_account;

  const growthZ =
    (gdp ? (gdp.z || 0) : 0) - (u ? (u.z || 0) * 0.4 : 0);
  const inflationZ = infl ? -infl.z : 0; // lower inflation = "better"
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

function capitaliseFirst(str) {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : "";
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ---------------------------------------------------------------------------
// Rendering – Macro regime
// ---------------------------------------------------------------------------
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
  if (gdp) {
    parts.push(
      `Real GDP growth is ${formatNumber(
        gdp.latest.value,
        1,
        "%"
      )} compared with a 10-year average of ${formatNumber(gdp.mean, 1, "%")}.`
    );
  }
  if (infl) {
    parts.push(
      `Headline inflation is ${formatNumber(
        infl.latest.value,
        1,
        "%"
      )} versus a 10-year average of ${formatNumber(infl.mean, 1, "%")}.`
    );
  }
  if (unemp) {
    parts.push(
      `Unemployment stands at ${formatNumber(
        unemp.latest.value,
        1,
        "%"
      )}, relative to a 10-year average of ${formatNumber(unemp.mean, 1, "%")}.`
    );
  }
  if (ca) {
    parts.push(
      `The current-account balance is ${formatNumber(
        ca.latest.value,
        1,
        "% of GDP"
      )} versus a 10-year average of ${formatNumber(
        ca.mean,
        1,
        "% of GDP"
      )}.`
    );
  }

  if (bodyEl) {
    bodyEl.textContent =
      parts.join(" ") ||
      "Insufficient historical data to build a macro summary for this country.";
  }

  const indicatorsWithData = Object.values(statsById).filter(Boolean).length;
  const avgWindow = average(
    Object.values(statsById)
      .filter(Boolean)
      .map(s => s.windowYears || 0)
  );
  let confidence =
    0.4 * (indicatorsWithData / INDICATORS.length) +
    0.6 * Math.min(avgWindow / 10, 1);
  confidence = Math.round(confidence * 100);
  if (confEl) confEl.textContent = `${confidence}%`;

  // Analogues: use GDP growth years
  if (analogEl) {
    analogEl.innerHTML = "";
    const analogueYears = gdp ? gdp.analogues : [];
    if (analogueYears && analogueYears.length) {
      analogueYears.forEach(year => {
        const pill = document.createElement("span");
        pill.className =
          "inline-flex items-center px-2.5 py-0.5 rounded-full border border-neutral-300 bg-cordobaSoft text-xs";
        pill.textContent = year;
        analogEl.appendChild(pill);
      });
    } else {
      analogEl.innerHTML =
        '<span class="text-xs text-neutral-400">Not enough history for analogues.</span>';
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
    ].forEach(r => {
      const span = document.createElement("span");
      span.className =
        "inline-flex items-center px-2.5 py-0.5 rounded-full border bg-cordobaSoft text-xs border-neutral-300 mr-1 mb-1";
      span.textContent = `${r.label}: ${r.level}`;
      riskEl.appendChild(span);
    });

    // Policy error risk based on growth vs inflation signals
    let policyRisk = "medium";
    if (Math.abs(growthZ) < 0.3 && Math.abs(inflZ) < 0.3) policyRisk = "low";
    else if (growthZ < -0.7 && inflZ > 0.7) policyRisk = "high";

    const policySpan = document.createElement("span");
    policySpan.className =
      "inline-flex items-center px-2.5 py-0.5 rounded-full border bg-cordobaSoft text-xs border-neutral-300 mr-1 mb-1";
    policySpan.textContent = `Policy error risk: ${policyRisk}`;
    riskEl.appendChild(policySpan);
  }
}

// ---------------------------------------------------------------------------
// Rendering – Engine cards
// ---------------------------------------------------------------------------
function renderEngineCards(engines) {
  const container = document.getElementById("cc-engine-cards");
  if (!container) return;
  container.innerHTML = "";

  const meta = [
    {
      id: "growth",
      title: "Growth",
      color: "border-emerald-300",
      text: "text-emerald-700"
    },
    {
      id: "inflation",
      title: "Inflation",
      color: "border-amber-300",
      text: "text-amber-700"
    },
    {
      id: "liquidity",
      title: "Liquidity",
      color: "border-sky-300",
      text: "text-sky-700"
    },
    {
      id: "external",
      title: "External",
      color: "border-rose-300",
      text: "text-rose-700"
    }
  ];

  meta.forEach(m => {
    const engine = engines[m.id];
    const z = engine ? engine.z : 0;
    const score = engine ? engine.score : 50;

    const card = document.createElement("div");
    card.className =
      "rounded-2xl border bg-cordobaSoft px-4 py-3 flex flex-col justify-between " +
      m.color;

    const header = document.createElement("div");
    header.className =
      "flex items-baseline justify-between text-[11px] tracking-[0.18em] uppercase text-neutral-500";
    header.innerHTML = `<span>${m.title}</span><span>z-score ${
      z ? z.toFixed(1) : "0.0"
    }</span>`;
    card.appendChild(header);

    const main = document.createElement("div");
    main.className = "mt-2 flex items-end justify-between gap-2";

    const scoreEl = document.createElement("div");
    scoreEl.innerHTML = `
      <div class="text-2xl font-semibold">${score}<span class="text-sm text-neutral-400">/100</span></div>
      <div class="text-[11px] text-neutral-500 mt-1">vs own 10-year history</div>
    `;
    main.appendChild(scoreEl);

    const qualitative =
      Math.abs(z) < 0.5 ? "Near trend" : z > 0 ? "Above trend" : "Below trend";
    const labelEl = document.createElement("span");
    labelEl.className =
      "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] " +
      m.text +
      " border-neutral-300 bg-white";
    labelEl.textContent = qualitative;
    main.appendChild(labelEl);

    card.appendChild(main);
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Rendering – Key inflection signals
// ---------------------------------------------------------------------------
function renderInflectionSignals(statsById) {
  const container = document.getElementById("cc-inflection-list");
  if (!container) return;
  container.innerHTML = "";

  const ordered = [
    "gdp_growth",
    "inflation",
    "unemployment",
    "money",
    "current_account"
  ];

  ordered.forEach(id => {
    const cfg = INDICATORS.find(i => i.id === id);
    const stat = statsById[id];
    if (!cfg || !stat) return;

    const signal = classifySignal(stat, cfg);

    const row = document.createElement("div");
    row.className =
      "flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-cordobaSoft px-3 py-2";

    const left = document.createElement("div");
    left.className = "flex-1";

    const title = document.createElement("div");
    title.className = "font-medium text-sm";
    title.textContent = cfg.label;
    left.appendChild(title);

    const small = document.createElement("div");
    small.className = "text-xs text-neutral-600";
    const latest = stat.latest;
    const directionText =
      stat.delta > 0
        ? "higher than"
        : stat.delta < 0
        ? "lower than"
        : "similar to";

    small.textContent = `Latest reading is ${formatNumber(
      latest.value,
      cfg.decimals,
      cfg.unit
    )} (${latest.year}), ${directionText} the prior year and ${
      signal.label
    } vs the 10-year average of ${formatNumber(
      stat.mean,
      cfg.decimals,
      cfg.unit
    )}.`;
    left.appendChild(small);

    row.appendChild(left);

    const right = document.createElement("div");
    right.className = "text-right text-xs text-neutral-500 whitespace-nowrap";
    const dirArrow =
      signal.direction === "up"
        ? "↑"
        : signal.direction === "down"
        ? "↓"
        : "→";
    right.innerHTML = `<div>${dirArrow} ${signal.level}</div><div>${signal.strength} signal</div>`;
    row.appendChild(right);

    container.appendChild(row);
  });

  if (!container.children.length) {
    container.innerHTML =
      '<p class="text-xs text-neutral-500">Not enough data to compute signals for this country.</p>';
  }
}

// ---------------------------------------------------------------------------
// Rendering – Indicator table
// ---------------------------------------------------------------------------
function renderIndicatorGrid(statsById, countryKey) {
  const tbody = document.getElementById("cc-indicator-rows");
  const countryLabel = document.getElementById("cc-signals-country");
  if (!tbody) return;

  const meta = COUNTRY_META[countryKey] || { name: countryKey };
  if (countryLabel) countryLabel.textContent = meta.name;

  tbody.innerHTML = "";

  INDICATORS.forEach(cfg => {
    const stat = statsById[cfg.id];
    if (!stat) return;

    const signal = classifySignal(stat, cfg);
    const tr = document.createElement("tr");
    tr.className = "hover:bg-cordobaSoft";

    const lastVal = formatNumber(
      stat.latest.value,
      cfg.decimals,
      cfg.unit,
      "n/a"
    );
    const zFormatted =
      stat.z != null && !isNaN(stat.z) ? stat.z.toFixed(1) : "0.0";

    const commentText = `Latest ${stat.latest.year} reading of ${lastVal} vs 10-year average ${formatNumber(
      stat.mean,
      cfg.decimals,
      cfg.unit
    )}; change vs prior year ${formatNumber(
      stat.delta,
      cfg.decimals,
      cfg.unit
    )}.`;

    tr.innerHTML = `
      <td class="py-2 pr-3 text-neutral-900">${cfg.label}</td>
      <td class="py-2 pr-3 text-neutral-600">${cfg.engine}</td>
      <td class="py-2 pr-3 text-neutral-600">${cfg.bucket}</td>
      <td class="py-2 pr-3"></td>
      <td class="py-2 pr-3 text-right text-neutral-900">${lastVal}</td>
      <td class="py-2 pr-3 text-right text-neutral-700">${zFormatted}</td>
      <td class="py-2 pr-3 text-neutral-600">${commentText}</td>
    `;

    const signalCell = tr.children[3];
    const signalBadge = document.createElement("span");
    signalBadge.className =
      "inline-flex items-center px-2 py-0.5 rounded-full border bg-white text-[11px] border-neutral-300";
    signalBadge.textContent = signal.label;
    signalCell.appendChild(signalBadge);

    tbody.appendChild(tr);
  });

  if (!tbody.children.length) {
    const row = document.createElement("tr");
    row.innerHTML =
      '<td colspan="7" class="py-3 text-center text-neutral-400">No indicators available for this country.</td>';
    tbody.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Rendering – Meta
// ---------------------------------------------------------------------------
function renderMeta(statsById) {
  const dataAsOf = document.getElementById("cc-data-as-of");
  if (!dataAsOf) return;

  const allStats = Object.values(statsById).filter(Boolean);
  if (!allStats.length) {
    dataAsOf.textContent = "latest: n/a";
    return;
  }

  const lastYear = Math.max(...allStats.map(s => s.latest.year));
  dataAsOf.textContent = `latest: ${lastYear}`;
}

// ---------------------------------------------------------------------------
// Country loader (parallel + cached)
// ---------------------------------------------------------------------------
async function loadCountry(countryKey) {
  // Use computed cache if we already have stats this session
  if (macroCache[countryKey]) {
    const statsById = macroCache[countryKey];
    const engines = engineScoreFromIndicators(statsById);
    renderRegimeSummary(countryKey, statsById, engines);
    renderEngineCards(engines);
    renderInflectionSignals(statsById);
    renderIndicatorGrid(statsById, countryKey);
    renderMeta(statsById);
    return;
  }

  document.body.classList.add("cc-loading");

  try {
    // Fetch all indicator series in parallel
    const requests = INDICATORS.map(cfg =>
      fetchWorldBankSeries(countryKey, cfg.wb).then(series => ({
        cfg,
        series
      }))
    );

    const results = await Promise.all(requests);

    const statsById = {};
    results.forEach(({ cfg, series }) => {
      const stats = series && series.length ? computeStats(series) : null;
      statsById[cfg.id] = stats;
    });

    macroCache[countryKey] = statsById;

    const engines = engineScoreFromIndicators(statsById);
    renderRegimeSummary(countryKey, statsById, engines);
    renderEngineCards(engines);
    renderInflectionSignals(statsById);
    renderIndicatorGrid(statsById, countryKey);
    renderMeta(statsById);
  } catch (err) {
    console.error("Failed to load country data", err);
  } finally {
    document.body.classList.remove("cc-loading");
  }
}

// ---------------------------------------------------------------------------
// UI wiring
// ---------------------------------------------------------------------------
function setupCountryDropdown() {
  const toggle = document.getElementById("cc-country-toggle");
  const menu = document.getElementById("cc-country-menu");
  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  menu.addEventListener("click", evt => {
    const btn = evt.target.closest("[data-cc-country]");
    if (!btn) return;
    const code = btn.getAttribute("data-cc-country");
    const region = btn.getAttribute("data-cc-region") || "";
    menu.classList.add("hidden");

    const meta = COUNTRY_META[code] || { name: code, region };
    const labelSpan = document.getElementById("cc-country-label");
    const regionSpan = document.getElementById("cc-country-region");
    if (labelSpan) labelSpan.textContent = meta.name;
    if (regionSpan) regionSpan.textContent = meta.region || region;

    loadCountry(code);
  });

  document.addEventListener("click", evt => {
    if (!menu.contains(evt.target) && evt.target !== toggle) {
      menu.classList.add("hidden");
    }
  });
}

function setupLiveToggle() {
  const group = document.getElementById("cc-live-toggle-group");
  if (!group) return;

  group.addEventListener("click", evt => {
    const btn = evt.target.closest("[data-cc-live-toggle]");
    if (!btn) return;

    Array.from(group.querySelectorAll("button")).forEach(b => {
      b.classList.remove("bg-cordobaGold", "text-white");
      b.classList.add("text-neutral-500");
    });

    btn.classList.add("bg-cordobaGold", "text-white");
    btn.classList.remove("text-neutral-500");

    const mode = btn.getAttribute("data-cc-live-toggle");
    console.log("Mode switched to:", mode);
  });
}

function setupFilters() {
  const allBtn = document.getElementById("cc-filter-all");
  const topBtn = document.getElementById("cc-filter-top");
  const tbody = document.getElementById("cc-indicator-rows");
  if (!allBtn || !topBtn || !tbody) return;

  allBtn.addEventListener("click", () => {
    Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
      tr.classList.remove("hidden");
    });
    allBtn.classList.add("bg-cordobaSoft");
    topBtn.classList.remove("bg-cordobaSoft");
  });

  topBtn.addEventListener("click", () => {
    Array.from(tbody.querySelectorAll("tr")).forEach(tr => {
      const zCell = tr.children[5];
      if (!zCell) return;
      const z = parseFloat(zCell.textContent);
      if (isNaN(z)) return;
      const strong = Math.abs(z) >= 0.7;
      tr.classList.toggle("hidden", !strong);
    });
    topBtn.classList.add("bg-cordobaSoft");
    allBtn.classList.remove("bg-cordobaSoft");
  });
}

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  setupCountryDropdown();
  setupLiveToggle();
  setupFilters();
  loadCountry("US"); // default on load (maps to USA via wb code)
});
