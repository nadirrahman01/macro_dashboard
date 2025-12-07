// main.js
// Cordoba Capital – Global Macro Engine
// Uses World Bank WDI data (annual) to drive all numbers & labels.

const COUNTRY_META = {
  US: { name: "United States", region: "G-20 · DM" },
  GB: { name: "United Kingdom", region: "G-20 · DM" },
  DE: { name: "Germany", region: "G-20 · DM" },
  FR: { name: "France", region: "G-20 · DM" },
  JP: { name: "Japan", region: "G-20 · DM" },
  CN: { name: "China", region: "G-20 · EM" },
  IN: { name: "India", region: "G-20 · EM" },
  BR: { name: "Brazil", region: "G-20 · EM" }
};

// Core indicators used in the engine
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
    wb: "FM.LBL.MQMY.ZG", // Money & quasi-money (M2) growth (annual %)
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

// Cache to avoid repeated calls for same country
const macroCache = {};

// --- Utility helpers --------------------------------------------------------

function fetchWorldBankSeries(countryCode, indicatorCode) {
  const url =
    `https://api.worldbank.org/v2/country/${countryCode}/indicator/${indicatorCode}` +
    `?format=json&per_page=200`;
  return fetch(url)
    .then(res => res.json())
    .then(json => {
      const [, data] = json;
      if (!Array.isArray(data)) return [];
      return data
        .filter(d => d && d.value != null)
        .map(d => ({
          year: parseInt(d.date, 10),
          value: Number(d.value)
        }))
        .sort((a, b) => a.year - b.year);
    })
    .catch(err => {
      console.error("World Bank fetch error", countryCode, indicatorCode, err);
      return [];
    });
}

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

  // For analogue years: find 3 closest years by z-score
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
  let num = val.toFixed(decimals);
  if (unit === "%") return `${num}%`;
  if (unit === "% of GDP") return `${num}%`;
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
  const dir = delta > 0 ? "up" : delta < 0 ? "down" : "flat";

  let level;
  if (absZ < 0.5) level = "near trend";
  else if (absZ < 1.0) level = "moderate";
  else level = "extreme";

  let strength;
  if (absZ < 0.5) strength = "low";
  else if (absZ < 1.0) strength = "medium";
  else strength = "high";

  // Convert into intuitive macro words depending on whether high is good or bad
  let label;
  if (cfg.higherIsGood) {
    if (z > 0.5 && dir === "up") label = "Strengthening above trend";
    else if (z > 0.5 && dir === "down") label = "Still above trend, easing";
    else if (z < -0.5 && dir === "down") label = "Weak and deteriorating";
    else if (z < -0.5 && dir === "up") label = "Weak but stabilising";
    else label = "Close to trend";
  } else {
    if (z > 0.5 && dir === "up") label = "Elevated and rising";
    else if (z > 0.5 && dir === "down") label = "Elevated but cooling";
    else if (z < -0.5 && dir === "down") label = "Subdued and falling";
    else if (z < -0.5 && dir === "up") label = "Subdued but firming";
    else label = "Close to trend";
  }

  return { level, strength, label, direction: dir };
}

function engineScoreFromIndicators(statsById) {
  // Simple composite scoring: scale z-scores to 0–100 blend.
  function scoreFromZ(z) {
    // Clamp z between -2.5 and +2.5, map to 0–100
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
  const inflationZ = infl ? -infl.z : 0; // lower inflation is "better"
  const liquidityZ = m2 ? m2.z : 0;
  const externalZ = ca ? ca.z : 0;

  return {
    growth: {
      z: growthZ,
      score: scoreFromZ(growthZ)
    },
    inflation: {
      z: inflationZ,
      score: scoreFromZ(inflationZ)
    },
    liquidity: {
      z: liquidityZ,
      score: scoreFromZ(liquidityZ)
    },
    external: {
      z: externalZ,
      score: scoreFromZ(externalZ)
    }
  };
}

function riskLevelFromZ(z, higherIsGood) {
  if (z == null || isNaN(z)) return "n/a";

  const absZ = Math.abs(z);
  if (absZ < 0.5) return "low";
  if (absZ < 1.0) return "medium";
  return "high";
}

// --- Rendering helpers ------------------------------------------------------

function renderRegimeSummary(countryCode, statsById, engines) {
  const meta = COUNTRY_META[countryCode];
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

  // Growth regime text
  let growthPhrase = "near-trend growth";
  if (growthZ > 0.5) growthPhrase = "above-trend growth";
  else if (growthZ < -0.5) growthPhrase = "below-trend growth";

  // Inflation regime
  let inflationPhrase = "stable inflation";
  if (inflZ > 0.5) inflationPhrase = "elevated inflation";
  else if (inflZ < -0.5) inflationPhrase = "disinflation";

  const title = `${capitaliseFirst(growthPhrase)} with ${inflationPhrase} – ${
    meta.name
  }`;
  titleEl.textContent = title;

  // Confidence: simple function of how many indicators we have and window length
  const indicatorsWithData = Object.values(statsById).filter(Boolean).length;
  const avgWindow = average(
    Object.values(statsById)
      .filter(Boolean)
      .map(s => s.windowYears || 0)
  );
  let confidence = 0.4 * (indicatorsWithData / INDICATORS.length) +
    0.6 * Math.min(avgWindow / 10, 1);
  confidence = Math.round(confidence * 100);
  confEl.textContent = `${confidence}%`;

  // Main body paragraph built from real numbers
  const parts = [];

  if (gdp) {
    parts.push(
      `Real GDP growth is ${formatNumber(
        gdp.latest.value,
        1,
        "%"
      )} compared with a 10-year average of ${formatNumber(
        gdp.mean,
        1,
        "%"
      )}.`
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
      )}, relative to its 10-year average of ${formatNumber(
        unemp.mean,
        1,
        "%"
      )}.`
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

  bodyEl.textContent =
    parts.join(" ") ||
    "Insufficient historical data to build a macro summary for this country.";

  // Historical analogues: take the GDP growth analogue years as the main reference
  analogEl.innerHTML = "";
  const analogueYears = gdp ? gdp.analogues : [];
  analogueYears.forEach(year => {
    const pill = document.createElement("span");
    pill.className =
      "inline-flex items-center px-2.5 py-0.5 rounded-full border border-neutral-300 bg-cordobaSoft text-xs";
    pill.textContent = year;
    analogEl.appendChild(pill);
  });
  if (!analogueYears.length) {
    analogEl.innerHTML =
      '<span class="text-xs text-neutral-400">Not enough history for analogues.</span>';
  }

  // Risk flags from engine z-scores
  riskEl.innerHTML = "";
  const growthRisk = riskLevelFromZ(engines.growth.z, true);
  const inflationRisk = riskLevelFromZ(engines.inflation.z, false);
  const externalRisk = riskLevelFromZ(engines.external.z, true);

  [
    { label: "Growth risk", level: growthRisk },
    { label: "Inflation risk", level: inflationRisk },
    { label: "External risk", level: externalRisk }
  ].forEach(r => {
    const span = document.createElement("span");
    span.className =
      "inline-flex items-center px-2.5 py-0.5 rounded-full border bg-cordobaSoft text-xs border-neutral-300";
    span.textContent = `${r.label}: ${r.level}`;
    riskEl.appendChild(span);
  });

  // Policy error risk: look at growth vs inflation z
  let policyRiskLevel = "medium";
  if (Math.abs(growthZ) < 0.3 && Math.abs(inflZ) < 0.3) policyRiskLevel = "low";
  else if (growthZ < -0.7 && inflZ > 0.7) policyRiskLevel = "high";
  const policySpan = document.createElement("span");
  policySpan.className =
    "inline-flex items-center px-2.5 py-0.5 rounded-full border bg-cordobaSoft text-xs border-neutral-300";
  policySpan.textContent = `Policy error risk: ${policyRiskLevel}`;
  riskEl.appendChild(policySpan);
}

function renderEngineCards(engines, statsById) {
  const container = document.getElementById("cc-engine-cards");
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

    const labelEl = document.createElement("span");
    labelEl.className =
      "inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] " +
      m.text +
      " border-neutral-300 bg-white";
    const qualitative =
      Math.abs(z) < 0.5 ? "Near trend" : z > 0 ? "Above trend" : "Below trend";
    labelEl.textContent = qualitative;
    main.appendChild(labelEl);

    card.appendChild(main);
    container.appendChild(card);
  });
}

function renderInflectionSignals(statsById) {
  const container = document.getElementById("cc-inflection-list");
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
    const prev = stat.prev;
    const delta = stat.delta;
    const directionText =
      delta > 0
        ? "higher than"
        : delta < 0
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

function renderIndicatorGrid(statsById, countryCode) {
  const tbody = document.getElementById("cc-indicator-rows");
  const countryLabel = document.getElementById("cc-signals-country");

  const meta = COUNTRY_META[countryCode];
  countryLabel.textContent = meta ? meta.name : countryCode;

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

    const signalBadge = document.createElement("span");
    signalBadge.className =
      "inline-flex items-center px-2 py-0.5 rounded-full border bg-white text-[11px] border-neutral-300";
    signalBadge.textContent = signal.label;

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

function renderMeta(countryCode, statsById) {
  const dataAsOf = document.getElementById("cc-data-as-of");

  const allStats = Object.values(statsById).filter(Boolean);
  if (!allStats.length) {
    dataAsOf.textContent = "no data";
    return;
  }
  const lastYear = Math.max(...allStats.map(s => s.latest.year));
  dataAsOf.textContent = `latest: ${lastYear}`;
}

function capitaliseFirst(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// --- Country loading --------------------------------------------------------

async function loadCountry(countryCode) {
  const meta = COUNTRY_META[countryCode] || {
    name: countryCode,
    region: ""
  };

  // Update country label in UI
  const labelSpan = document.getElementById("cc-country-label");
  const regionSpan = document.getElementById("cc-country-region");
  const countryDot = document.getElementById("cc-country-dot");

  if (labelSpan) labelSpan.textContent = meta.name;
  if (regionSpan) regionSpan.textContent = meta.region || "";
  if (countryDot) countryDot.classList.add("bg-emerald-500");

  if (!macroCache[countryCode]) {
    const statsById = {};
    for (const cfg of INDICATORS) {
      const series = await fetchWorldBankSeries(countryCode, cfg.wb);
      const stats = series.length ? computeStats(series) : null;
      statsById[cfg.id] = stats;
    }
    macroCache[countryCode] = statsById;
  }

  const statsById = macroCache[countryCode];
  const engines = engineScoreFromIndicators(statsById);

  renderRegimeSummary(countryCode, statsById, engines);
  renderEngineCards(engines, statsById);
  renderInflectionSignals(statsById);
  renderIndicatorGrid(statsById, countryCode);
  renderMeta(countryCode, statsById);
}

// --- UI wiring --------------------------------------------------------------

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
    const region = btn.getAttribute("data-cc-region");
    menu.classList.add("hidden");

    const meta = COUNTRY_META[code];
    if (meta) {
      document.getElementById("cc-country-label").textContent = meta.name;
      document.getElementById("cc-country-region").textContent = region;
    }
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

    const mode = btn.getAttribute("data-cc-live-toggle");
    Array.from(group.querySelectorAll("button")).forEach(b => {
      b.classList.remove("bg-cordobaGold", "text-white");
      b.classList.add("text-neutral-500");
    });
    btn.classList.add("bg-cordobaGold", "text-white");
    btn.classList.remove("text-neutral-500");

    // For now the toggle is purely cosmetic – World Bank provides annual data only.
    console.log("Mode switched to", mode);
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
    // Only keep rows where |z| >= 0.7
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

// --- Init -------------------------------------------------------------------

document.addEventListener("DOMContentLoaded", () => {
  setupCountryDropdown();
  setupLiveToggle();
  setupFilters();
  loadCountry("US"); // default
});
