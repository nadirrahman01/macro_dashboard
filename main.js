// main.js
// Cordoba Capital – Global Macro Engine (Beta)
// Data source: World Bank World Development Indicators (WDI)

// ---------------------------------------------------------------------------
// Country metadata (2-letter UI code → 3-letter WB code)
// ---------------------------------------------------------------------------
const COUNTRY_META = {
  US: { name: "United States", region: "G-20 · DM", wb: "USA" },
  UK: { name: "United Kingdom", region: "G-20 · DM", wb: "GBR" },
  GB: { name: "United Kingdom", region: "G-20 · DM", wb: "GBR" },
  DE: { name: "Germany", region: "G-20 · DM", wb: "DEU" },
  FR: { name: "France", region: "G-20 · DM", wb: "FRA" },
  JP: { name: "Japan", region: "G-20 · DM", wb: "JPN" },
  CN: { name: "China", region: "G-20 · EM", wb: "CHN" },
  IN: { name: "India", region: "G-20 · EM", wb: "IND" },
  BR: { name: "Brazil", region: "G-20 · EM", wb: "BRA" }
  UZ: { name: "Uzbekistan", region: "Europe & Central Asia", wb: "UZB" }
};

// ---------------------------------------------------------------------------
// Indicator definitions (World Bank codes)
// ---------------------------------------------------------------------------
const INDICATORS = [
  {
    id: "gdp_growth",
    wb: "NY.GDP.MKTP.KD.ZG",
    label: "GDP growth (annual %)",
    engine: "Growth",
    bucket: "Coincident",
    higherIsGood: true,
    unit: "%",
    decimals: 1
  },
  {
    id: "inflation",
    wb: "FP.CPI.TOTL.ZG",
    label: "Inflation, CPI (annual %)",
    engine: "Inflation",
    bucket: "Coincident",
    higherIsGood: false,
    unit: "%",
    decimals: 1
  },
  {
    id: "unemployment",
    wb: "SL.UEM.TOTL.ZS",
    label: "Unemployment rate (% labour force)",
    engine: "Growth",
    bucket: "Lagging",
    higherIsGood: false,
    unit: "%",
    decimals: 1
  },
  {
    id: "money",
    wb: "FM.LBL.MQMY.ZG",
    label: "Broad money (M2) growth (annual %)",
    engine: "Liquidity",
    bucket: "Leading",
    higherIsGood: true,
    unit: "%",
    decimals: 1
  },
  {
    id: "current_account",
    wb: "BN.CAB.XOKA.GD.ZS",
    label: "Current account balance (% of GDP)",
    engine: "External",
    bucket: "Coincident",
    higherIsGood: true,
    unit: "% of GDP",
    decimals: 1
  }
];

// ---------------------------------------------------------------------------
// Cordoba research metadata
// ---------------------------------------------------------------------------
const CORDOBA_RESEARCH = [
  {
    id: "global_volatility",
    title:
      "Navigating Volatility, Trump’s Second Term, China’s Retaliation, Global Shifts, and Emerging Opportunities",
    url: "https://cordobacapital.co.uk/navigating-volatility-trumps-second-term-chinas-retaliation-global-shifts-and-emerging-opportunities/",
    countries: ["US", "CN"],
    regions: ["Global"],
    engines: ["growth", "inflation", "external"],
    tags: ["volatility", "rates", "geopolitics"]
  },
  {
    id: "global_change",
    title:
      "Navigating Change, Europe’s Transformation, China’s Challenges, US Debt Struggles, and Emerging Opportunities",
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

// In-memory stats cache
const macroCache = {};

// ---------------------------------------------------------------------------
// WB fetch + cache (now returns {series, updatedAt})
// ---------------------------------------------------------------------------
async function fetchWorldBankSeries(countryKey, indicatorCode) {
  const meta = COUNTRY_META[countryKey];
  if (!meta) {
    console.warn("Unknown country:", countryKey);
    return { series: [], updatedAt: null };
  }
  const wbCode = meta.wb;
  const cacheKey = `wb_${wbCode}_${indicatorCode}`;

  // Try cache (7 days)
  try {
    const cachedRaw = localStorage.getItem(cacheKey);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      const maxAgeMs = 7 * 24 * 60 * 60 * 1000;
      if (cached.timestamp && Date.now() - cached.timestamp < maxAgeMs) {
        return {
          series: cached.series || [],
          updatedAt: cached.updatedAt || null
        };
      }
    }
  } catch (err) {
    console.warn("localStorage read error:", err);
  }

  const url = `https://api.worldbank.org/v2/country/${wbCode}/indicator/${indicatorCode}?format=json&per_page=200`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.error("World Bank error:", res.status, url);
      return { series: [], updatedAt: null };
    }
    const json = await res.json();
    const header = Array.isArray(json) ? json[0] : null;
    const data = Array.isArray(json) ? json[1] : null;

    const updatedAt = header && header.lastupdated ? header.lastupdated : null;

    if (!Array.isArray(data)) {
      console.warn("World Bank: no data array for", wbCode, indicatorCode);
      return { series: [], updatedAt };
    }

    const series = data
      .filter((d) => d && d.value != null)
      .map((d) => {
        const year = parseInt(d.date, 10);
        return {
          year,
          month: 12, // treat annual data as Dec-YYYY
          period: `${year}-12-31`,
          value: Number(d.value)
        };
      })
      .sort((a, b) => a.year - b.year); // oldest → newest

    try {
      localStorage.setItem(
        cacheKey,
        JSON.stringify({
          timestamp: Date.now(),
          series,
          updatedAt
        })
      );
    } catch (err) {
      console.warn("localStorage write error:", err);
    }

    return { series, updatedAt };
  } catch (err) {
    console.error("World Bank fetch failed:", err);
    return { series: [], updatedAt: null };
  }
}

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------
const MONTH_SHORT = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];
const MONTH_FULL = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function inferYearFromPoint(p) {
  if (!p) return undefined;
  if (typeof p.year === "number" && !isNaN(p.year)) return p.year;
  if (p.period) {
    const s = String(p.period);
    const m = s.match(/^(\d{4})/);
    if (m) return parseInt(m[1], 10);
  }
  return undefined;
}

function inferMonthFromPoint(p) {
  if (!p) return 12;
  if (typeof p.month === "number" && p.month >= 1 && p.month <= 12) return p.month;

  if (p.period) {
    const s = String(p.period);

    let m = s.match(/^\d{4}(\d{2})$/); // YYYYMM
    if (m) {
      const mm = parseInt(m[1], 10);
      if (mm >= 1 && mm <= 12) return mm;
    }

    m = s.match(/^\d{4}-(\d{2})/);      // YYYY-MM / YYYY-MM-DD
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
  const monthName = MONTH_FULL[d.getMonth()];
  const year = d.getFullYear();
  return `${monthName} ${year}`;
}

// ---------------------------------------------------------------------------
// Stats and helpers
// ---------------------------------------------------------------------------
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

  const zByYear = window.map((p) => {
    const y = inferYearFromPoint(p);
    return {
      year: y,
      z: stdev > 0 ? (p.value - mean) / stdev : 0
    };
  });

  const analogues = zByYear
    .filter((p) => p.year != null)
    .map((p) => ({ ...p, diff: Math.abs(p.z - z) }))
    .sort((a, b) => a.diff - b.diff)
    .slice(0, 3)
    .map((p) => p.year);

  return {
    latest,
    prev,
    mean,
    stdev,
    z,
    delta,
    analogues,
    windowYears: window.length,
    updatedAt
  };
}

function formatNumber(val, decimals = 1, unit = "", fallback = "n/a") {
  if (val == null || isNaN(val)) return fallback;
  const num = val.toFixed(decimals);
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
    return Math.round(50 + (clamped / 2.5) * 40); // 10–90
  }

  const gdp = statsById.gdp_growth;
  const infl = statsById.inflation;
  const u = statsById.unemployment;
  const m2 = statsById.money;
  const ca = statsById.current_account;

  const growthZ =
    (gdp ? (gdp.z || 0) : 0) - (u ? (u.z || 0) * 0.4 : 0);
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

// ---------------------------------------------------------------------------
// Note helper & research suggestions (unchanged logic)
// ---------------------------------------------------------------------------
function buildNoteDraft(countryKey, statsById, engines) {
  const meta = COUNTRY_META[countryKey] || { name: countryKey, region: "" };
  const gdp = statsById.gdp_growth;
  const infl = statsById.inflation;
  const unemp = statsById.unemployment;
  const money = statsById.money;
  const ca = statsById.current_account;

  const allStats = Object.values(statsById).filter(Boolean);
  const lastPoint = allStats.length
    ? allStats.reduce((acc, s) => {
        const stamp =
          (inferYearFromPoint(s.latest) || 0) * 100 +
          inferMonthFromPoint(s.latest);
        if (!acc || stamp > acc.stamp) return { stamp, point: s.latest };
        return acc;
      }, null)
    : null;
  const lastLabel = lastPoint ? formatPeriodLabel(lastPoint.point) : "n/a";

  const growthZ = engines.growth?.z || 0;
  const inflZ = engines.inflation?.z || 0;

  let growthPhrase = "near-trend growth";
  if (growthZ > 0.5) growthPhrase = "above-trend growth";
  else if (growthZ < -0.5) growthPhrase = "below-trend growth";

  let inflationPhrase = "stable inflation";
  if (inflZ > 0.5) inflationPhrase = "elevated inflation";
  else if (inflZ < -0.5) inflationPhrase = "disinflation";

  const lines = [];

  lines.push(
    `${meta.name} – Macro snapshot (${lastLabel}, World Bank annual data).`
  );
  lines.push(
    `The macro backdrop is characterised by ${growthPhrase} alongside ${inflationPhrase}.`
  );

  if (gdp && infl) {
    lines.push(
      `Real GDP growth is ${formatNumber(
        gdp.latest.value,
        1,
        "%"
      )} compared with a 10-year average of ${formatNumber(
        gdp.mean,
        1,
        "%"
      )}, while headline inflation stands at ${formatNumber(
        infl.latest.value,
        1,
        "%"
      )} versus a decade average of ${formatNumber(infl.mean, 1, "%")}.`
    );
  } else if (gdp) {
    lines.push(
      `Real GDP growth is ${formatNumber(
        gdp.latest.value,
        1,
        "%"
      )} versus a 10-year average of ${formatNumber(gdp.mean, 1, "%")}.`
    );
  } else if (infl) {
    lines.push(
      `Headline inflation is ${formatNumber(
        infl.latest.value,
        1,
        "%"
      )} versus a 10-year average of ${formatNumber(infl.mean, 1, "%")}.`
    );
  }

  if (unemp) {
    lines.push(
      `Labour market conditions are signalled by an unemployment rate of ${formatNumber(
        unemp.latest.value,
        1,
        "%"
      )} versus a 10-year average of ${formatNumber(
        unemp.mean,
        1,
        "%"
      )}, providing a read on slack vs overheating.`
    );
  }

  if (money) {
    lines.push(
      `Broad money growth is ${formatNumber(
        money.latest.value,
        1,
        "%"
      )}, compared with a 10-year average of ${formatNumber(
        money.mean,
        1,
        "%"
      )}, offering a simple proxy for domestic liquidity.`
    );
  }

  if (ca) {
    lines.push(
      `The external position shows a current-account balance of ${formatNumber(
        ca.latest.value,
        1,
        "% of GDP"
      )} against a decade average of ${formatNumber(
        ca.mean,
        1,
        "% of GDP"
      )}, flagging how far the funding side is from its usual range.`
    );
  }

  lines.push(
    `Engine scores – Growth: ${engines.growth.score}/100, Inflation: ${engines.inflation.score}/100, Liquidity: ${engines.liquidity.score}/100, External: ${engines.external.score}/100 – provide a compact view of where the country sits vs its own history.`
  );

  return lines.join("\n\n");
}

function renderNoteHelper(countryKey, statsById, engines) {
  const draftEl = document.getElementById("cc-note-draft");
  const bulletsEl = document.getElementById("cc-note-bullets");
  if (!draftEl && !bulletsEl) return;

  if (draftEl) {
    draftEl.value = buildNoteDraft(countryKey, statsById, engines);
  }

  if (bulletsEl) {
    bulletsEl.innerHTML = "";

    const gdp = statsById.gdp_growth;
    const infl = statsById.inflation;
    const money = statsById.money;
    const ca = statsById.current_account;

    const bullets = [];

    if (gdp && Math.abs(gdp.z) > 0.7) {
      bullets.push(
        `Growth is ${gdp.z > 0 ? "well above" : "well below"} its 10-year trend (z-score ${gdp.z.toFixed(
          1
        )}); think about where we are in the cycle and how that lines up with earnings and credit.`
      );
    }

    if (infl && Math.abs(infl.z) > 0.7) {
      bullets.push(
        `Inflation is ${infl.z > 0 ? "elevated" : "subdued"} vs history (z-score ${infl.z.toFixed(
          1
        )}); note whether this supports or challenges the market’s current rate path.`
      );
    }

    if (money && Math.abs(money.z) > 0.7) {
      bullets.push(
        `Broad money growth is sending a ${money.z > 0 ? "strong" : "weak"} liquidity signal; consider how this lines up with risk premia and asset valuations.`
      );
    }

    if (ca && Math.abs(ca.z) > 0.7) {
      bullets.push(
        `The current account is ${ca.z > 0 ? "stronger" : "weaker"} than usual; think about FX vulnerability, funding channels, and how this sits vs peers.`
      );
    }

    const engineList = [
      { id: "growth", label: "Growth" },
      { id: "inflation", label: "Inflation" },
      { id: "liquidity", label: "Liquidity" },
      { id: "external", label: "External" }
    ];

    const dominant = engineList
      .map((e) => ({ ...e, z: engines[e.id].z }))
      .sort((a, b) => Math.abs(b.z) - Math.abs(a.z))[0];

    if (dominant && Math.abs(dominant.z) > 0.5) {
      bullets.push(
        `${dominant.label} is the dominant engine right now (z-score ${dominant.z.toFixed(
          1
        )}); structure the note around why this matters for positioning rather than just listing indicators.`
      );
    }

    if (!bullets.length) {
      bullets.push(
        "Most indicators are close to their 10-year trends. Focus the note on what could shift the regime: policy surprises, global shocks, or structural reforms."
      );
    }

    bullets.forEach((text) => {
      const li = document.createElement("li");
      li.className = "text-xs text-neutral-700 mb-1";
      li.textContent = text;
      bulletsEl.appendChild(li);
    });
  }
}

function buildResearchReason(engines) {
  const parts = [];
  const add = (name, obj) => {
    if (!obj || obj.z == null || isNaN(obj.z)) return;
    const z = obj.z.toFixed(1);
    const tone =
      Math.abs(obj.z) < 0.5
        ? "near trend"
        : obj.z > 0
        ? "stretched high"
        : "stretched low";
    parts.push(`${name}: z ${z} (${tone})`);
  };
  add("Growth", engines.growth);
  add("Inflation", engines.inflation);
  add("Liquidity", engines.liquidity);
  add("External", engines.external);
  return parts.join(" · ");
}

function renderResearchSuggestions(countryKey, statsById, engines) {
  const container = document.getElementById("cc-research-list");
  if (!container) return;

  const meta = COUNTRY_META[countryKey] || { name: countryKey, region: "" };
  const countryName = meta.name || countryKey;

  container.innerHTML = "";

  const engineArray = [
    { id: "growth", z: engines.growth?.z || 0 },
    { id: "inflation", z: engines.inflation?.z || 0 },
    { id: "liquidity", z: engines.liquidity?.z || 0 },
    { id: "external", z: engines.external?.z || 0 }
  ];

  const dominant = engineArray.sort(
    (a, b) => Math.abs(b.z) - Math.abs(a.z)
  )[0];

  const domEngineId = dominant ? dominant.id : null;

  const scored = CORDOBA_RESEARCH.map((article) => {
    let score = 0;

    if (domEngineId && article.engines.includes(domEngineId)) {
      score += 3;
    }

    if (article.countries.includes(countryKey)) {
      score += 3;
    }

    const nameLower = countryName.toLowerCase();
    if (
      article.regions.some((r) =>
        nameLower.includes(r.toLowerCase())
      )
    ) {
      score += 2;
    }

    if (meta.region && article.regions.includes("Global")) {
      score += 1;
    }

    if (Math.abs(dominant?.z || 0) > 0.7) score += 1;

    return { article, score };
  }).sort((a, b) => b.score - a.score);

  const top = scored.filter((x) => x.score > 0).slice(0, 3);

  if (!top.length) {
    container.innerHTML =
      '<p class="text-xs text-neutral-500">No specific Cordoba notes mapped to this regime yet. Use the macro snapshot above as your starting point.</p>';
    return;
  }

  top.forEach(({ article }) => {
    const card = document.createElement("a");
    card.href = article.url;
    card.target = "_blank";
    card.rel = "noopener noreferrer";
    card.className =
      "block rounded-2xl border border-neutral-200 bg-white px-3 py-2 mb-2 hover:border-cordobaGold hover:bg-cordobaSoft transition-colors text-xs";

    const title = document.createElement("div");
    title.className = "font-medium text-neutral-900 mb-1";
    title.textContent = article.title;
    card.appendChild(title);

    const metaLine = document.createElement("div");
    metaLine.className = "text-[11px] text-neutral-600";
    metaLine.textContent = `Theme: ${article.engines
      .map((e) => capitaliseFirst(e))
      .join(", ")}`;
    card.appendChild(metaLine);

    const reason = document.createElement("div");
    reason.className = "text-[11px] text-neutral-500 mt-1";
    reason.textContent =
      "Suggested because of the current engine configuration: " +
      buildResearchReason(engines);
    card.appendChild(reason);

    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Rendering – Regime summary
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
      )} compared with a history average of ${formatNumber(gdp.mean, 1, "%")}.`
    );
  }
  if (infl) {
    parts.push(
      `Headline inflation is ${formatNumber(
        infl.latest.value,
        1,
        "%"
      )} versus a history average of ${formatNumber(infl.mean, 1, "%")}.`
    );
  }
  if (unemp) {
    parts.push(
      `Unemployment stands at ${formatNumber(
        unemp.latest.value,
        1,
        "%"
      )}, relative to an historical average of ${formatNumber(unemp.mean, 1, "%")}.`
    );
  }
  if (ca) {
    parts.push(
      `The current-account balance is ${formatNumber(
        ca.latest.value,
        1,
        "% of GDP"
      )} versus a history average of ${formatNumber(
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
      .map((s) => s.windowYears || 0)
  );
  let confidence =
    0.4 * (indicatorsWithData / INDICATORS.length) +
    0.6 * Math.min(avgWindow / 10, 1);
  confidence = Math.round(confidence * 100);
  if (confEl) confEl.textContent = `${confidence}%`;

  if (analogEl) {
    analogEl.innerHTML = "";
    const analogueYears = gdp ? gdp.analogues : [];
    if (analogueYears && analogueYears.length) {
      analogueYears.forEach((year) => {
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
    ].forEach((r) => {
      const span = document.createElement("span");
      span.className =
        "inline-flex items-center px-2.5 py-0.5 rounded-full border bg-cordobaSoft text-xs border-neutral-300 mr-1 mb-1";
      span.textContent = `${r.label}: ${r.level}`;
      riskEl.appendChild(span);
    });
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

  meta.forEach((m) => {
    const engine = engines[m.id];
    const z = engine ? engine.z : 0;
    const score = engine ? engine.score : 50;

    const card = document.createElement("div");
    card.className =
      "rounded-2xl border bg-cordobaSoft px-3 py-2 flex flex-col justify-between " +
      m.color;

    const header = document.createElement("div");
    header.className =
      "flex items-baseline justify-between text-[10px] tracking-[0.18em] uppercase text-neutral-500";
    header.innerHTML = `<span>${m.title}</span><span>z ${
      z ? z.toFixed(1) : "0.0"
    }</span>`;
    card.appendChild(header);

    const main = document.createElement("div");
    main.className = "mt-3 flex flex-col gap-2";

    const scoreEl = document.createElement("div");
    scoreEl.innerHTML = `
      <div class="text-lg font-semibold">${score}<span class="text-xs text-neutral-400">/100</span></div>
      <div class="text-[10px] text-neutral-500 mt-0.5">vs recent history</div>
    `;
    main.appendChild(scoreEl);

    const qualitative =
      Math.abs(z) < 0.5 ? "Near trend" : z > 0 ? "Above trend" : "Below trend";
    const labelEl = document.createElement("span");
    labelEl.className =
      "inline-flex items-center justify-center whitespace-nowrap " +
      "px-3 py-1 rounded-full border text-[11px] font-medium " +
      "border-neutral-300 bg-white " +
      m.text;
    labelEl.textContent = qualitative;
    main.appendChild(labelEl);
    card.appendChild(main);
    container.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// Rendering – Headline tiles & inflection signals
// ---------------------------------------------------------------------------
function renderHeadlineTiles(statsById) {
  const gdp = statsById.gdp_growth;
  const infl = statsById.inflation;
  const unemp = statsById.unemployment;
  const money = statsById.money;
  const ca = statsById.current_account;

  const setText = (id, text) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  };

  if (gdp) {
    setText(
      "cc-gdp-latest",
      `${formatNumber(gdp.latest.value, 1, "%")}`
    );
    setText(
      "cc-gdp-extra",
      `History avg ${formatNumber(
        gdp.mean,
        1,
        "%"
      )}; change vs prior observation ${formatNumber(gdp.delta, 1, "%")}.`
    );
  }

  if (infl) {
    setText(
      "cc-inflation-latest",
      `${formatNumber(infl.latest.value, 1, "%")}`
    );
    setText(
      "cc-inflation-extra",
      `History avg ${formatNumber(
        infl.mean,
        1,
        "%"
      )}; latest vs target depends on central bank regime.`
    );
  }

  if (unemp) {
    setText(
      "cc-unemployment-latest",
      `${formatNumber(unemp.latest.value, 1, "%")}`
    );
    setText(
      "cc-unemployment-extra",
      `History avg ${formatNumber(
        unemp.mean,
        1,
        "%"
      )}; a proxy for slack vs overheating.`
    );
  }

  if (money) {
    setText(
      "cc-money-latest",
      `${formatNumber(money.latest.value, 1, "%")}`
    );
    setText(
      "cc-money-extra",
      `History avg ${formatNumber(
        money.mean,
        1,
        "%"
      )}; a rough liquidity pulse.`
    );
  }

  if (ca) {
    setText(
      "cc-ca-latest",
      `${formatNumber(ca.latest.value, 1, "% of GDP")}`
    );
    setText(
      "cc-ca-extra",
      `History avg ${formatNumber(
        ca.mean,
        1,
        "% of GDP"
      )}; sign and size flag external pressure.`
    );
  }
}

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

  ordered.forEach((id) => {
    const cfg = INDICATORS.find((i) => i.id === id);
    const stat = statsById[id];
    if (!cfg || !stat) return;

    const signal = classifySignal(stat, cfg);

    const row = document.createElement("div");
    row.className =
      "flex items-start justify-between gap-3 rounded-2xl border border-neutral-200 bg-cordobaSoft px-3 py-2";

    const left = document.createElement("div");
    left.className = "flex-1";

    const title = document.createElement("div");
    title.className = "font-medium text-xs";
    title.textContent = cfg.label;
    left.appendChild(title);

    const small = document.createElement("div");
    small.className = "text-[11px] text-neutral-600";
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
    )} (${formatPeriodLabel(latest)}), ${directionText} the prior observation and ${
      signal.label
    } vs the history average of ${formatNumber(
      stat.mean,
      cfg.decimals,
      cfg.unit
    )}.`;
    left.appendChild(small);

    row.appendChild(left);

    const right = document.createElement("div");
    right.className =
      "text-right text-[11px] text-neutral-500 whitespace-nowrap";
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
// Rendering – Indicator grid
// ---------------------------------------------------------------------------
function renderIndicatorGrid(statsById, countryKey) {
  const tbody = document.getElementById("cc-indicator-rows");
  const countryLabel = document.getElementById("cc-signals-country");
  if (!tbody) return;

  const meta = COUNTRY_META[countryKey] || { name: countryKey };
  if (countryLabel) countryLabel.textContent = meta.name;

  tbody.innerHTML = "";

  INDICATORS.forEach((cfg) => {
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

    const commentText = `Latest reading is ${lastVal} (${formatPeriodLabel(
      stat.latest
    )}) vs history average ${formatNumber(
      stat.mean,
      cfg.decimals,
      cfg.unit
    )}; change vs prior observation ${formatNumber(
      stat.delta,
      cfg.decimals,
      cfg.unit
    )}.`;

    tr.innerHTML = `
      <td class="py-2 pr-3 text-neutral-900">${cfg.label}</td>
      <td class="py-2 pr-3 text-neutral-600">${cfg.engine}</td>
      <td class="py-2 pr-3 text-neutral-600">${cfg.bucket}</td>
      <td class="py-2 pr-3"></td>
      <td class="py-2 pr-3 text-left text-neutral-600">${formatPeriodLabel(
        stat.latest
      )}</td>
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
      '<td colspan="8" class="py-3 text-center text-neutral-400">No indicators available for this country.</td>';
    tbody.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// Meta – "latest: Month YYYY" using WB lastupdated
// ---------------------------------------------------------------------------
function renderMeta(statsById) {
  const dataAsOf = document.getElementById("cc-data-as-of");
  if (!dataAsOf) return;

  const allStats = Object.values(statsById).filter(Boolean);
  if (!allStats.length) {
    dataAsOf.textContent = "latest: n/a";
    return;
  }

  const dates = allStats
    .map((s) => s.updatedAt)
    .filter(Boolean);

  if (!dates.length) {
    dataAsOf.textContent = "latest: n/a";
    return;
  }

  let latest = dates[0];
  dates.forEach((d) => {
    if (new Date(d) > new Date(latest)) latest = d;
  });

  const label = formatUpdatedAt(latest) || "n/a";
  dataAsOf.textContent = `latest: ${label}`;
}

// ---------------------------------------------------------------------------
// Next questions
// ---------------------------------------------------------------------------
function renderNextQuestions(statsById, engines) {
  const list = document.getElementById("cc-question-list");
  if (!list) return;
  list.innerHTML = "";

  const gdp = statsById.gdp_growth;
  const infl = statsById.inflation;
  const ca = statsById.current_account;

  const qs = [];

  if (ca && Math.abs(ca.z) > 0.7) {
    qs.push(
      "Why has the current-account balance moved away from its 10-year norm, and is this cyclical or structural?"
    );
  }

  if (gdp && infl && Math.sign(gdp.z) !== Math.sign(infl.z)) {
    qs.push(
      "What is driving the divergence between growth and inflation signals, and how might that affect policy and risk premia?"
    );
  }

  if (engines.liquidity && engines.external) {
    qs.push(
      "Is domestic liquidity easing enough to offset any external funding pressure picked up in the external engine?"
    );
  }

  if (!qs.length) {
    qs.push(
      "Most engines are close to trend. What catalysts could realistically shift this regime over the next 12–18 months?"
    );
  }

  qs.slice(0, 3).forEach((q) => {
    const li = document.createElement("li");
    li.className = "text-xs text-neutral-700 mb-1";
    li.textContent = q;
    list.appendChild(li);
  });
}

// ---------------------------------------------------------------------------
// Country loader
// ---------------------------------------------------------------------------
async function loadCountry(countryKey) {
  const meta = COUNTRY_META[countryKey] || { name: countryKey, region: "" };

  const labelEl = document.getElementById("cc-country-current-label");
  const regionEl = document.getElementById("cc-country-current-region");
  if (labelEl) labelEl.textContent = meta.name;
  if (regionEl) regionEl.textContent = meta.region || "";

  // Cached?
  if (macroCache[countryKey]) {
    const statsById = macroCache[countryKey];
    const engines = engineScoreFromIndicators(statsById);
    renderRegimeSummary(countryKey, statsById, engines);
    renderEngineCards(engines);
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
      fetchWorldBankSeries(countryKey, cfg.wb).then(
        ({ series, updatedAt }) => ({
          cfg,
          series,
          updatedAt
        })
      )
    );

    const results = await Promise.all(requests);

    const statsById = {};
    results.forEach(({ cfg, series, updatedAt }) => {
      const stats =
        series && series.length
          ? computeStats(series, 10, updatedAt)
          : null;
      statsById[cfg.id] = stats;
    });

    macroCache[countryKey] = statsById;

    const engines = engineScoreFromIndicators(statsById);
    renderRegimeSummary(countryKey, statsById, engines);
    renderEngineCards(engines);
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

  menu.addEventListener("click", (evt) => {
    const btn = evt.target.closest("[data-cc-country]");
    if (!btn) return;
    const code = btn.getAttribute("data-cc-country");
    const region = btn.getAttribute("data-cc-region") || "";
    menu.classList.add("hidden");

    const meta = COUNTRY_META[code] || { name: code, region };
    const labelSpan =
      document.querySelector("[data-cc-country-label]") ||
      document.getElementById("cc-country-current-label");
    const regionSpan =
      document.querySelector("[data-cc-country-region]") ||
      document.getElementById("cc-country-current-region");

    if (labelSpan) labelSpan.textContent = meta.name;
    if (regionSpan) regionSpan.textContent = meta.region || region;

    loadCountry(code);
  });

  document.addEventListener("click", (evt) => {
    if (!menu.contains(evt.target) && evt.target !== toggle) {
      menu.classList.add("hidden");
    }
  });
}

function setupMethodologyModal() {
  const openBtn = document.getElementById("cc-methodology-open");
  const closeBtn = document.getElementById("cc-methodology-close");
  const modal = document.getElementById("cc-methodology-modal");
  const overlay = modal
    ? modal.querySelector("[data-cc-methodology-overlay]")
    : null;

  if (!modal || !openBtn || !closeBtn || !overlay) return;

  const open = () => modal.classList.remove("hidden");
  const close = () => modal.classList.add("hidden");

  openBtn.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);
}

function setupFilters() {
  const allBtn = document.getElementById("cc-filter-all");
  const topBtn = document.getElementById("cc-filter-top");
  const tbody = document.getElementById("cc-indicator-rows");
  if (!allBtn || !topBtn || !tbody) return;

  allBtn.addEventListener("click", () => {
    Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
      tr.classList.remove("hidden");
    });
    allBtn.classList.add("bg-cordobaSoft");
    topBtn.classList.remove("bg-cordobaSoft");
  });

  topBtn.addEventListener("click", () => {
    Array.from(tbody.querySelectorAll("tr")).forEach((tr) => {
      const zCell = tr.children[6];
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
  setupMethodologyModal();
  setupFilters();
  loadCountry("US"); // default
});
