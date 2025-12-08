// main.js
// Cordoba Capital – Global Macro Engine (Beta)
// Live data: World Bank WDI + Proprietary Cordoba Engine

// ---------------------------------------------------------------------------
// GLOBAL SETTINGS
// ---------------------------------------------------------------------------
const CACHE_TTL = 6 * 60 * 60 * 1000; // 6 hours

// ---------------------------------------------------------------------------
// Country metadata
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
};

// ---------------------------------------------------------------------------
// Macro indicator definitions
// ---------------------------------------------------------------------------
const INDICATORS = [
  { id: "gdp_growth", wb: "NY.GDP.MKTP.KD.ZG", label: "GDP growth", engine: "Growth", bucket: "Coincident", higherIsGood: true, unit: "%", decimals: 1 },
  { id: "inflation", wb: "FP.CPI.TOTL.ZG", label: "Inflation (CPI)", engine: "Inflation", bucket: "Coincident", higherIsGood: false, unit: "%", decimals: 1 },
  { id: "unemployment", wb: "SL.UEM.TOTL.ZS", label: "Unemployment", engine: "Growth", bucket: "Lagging", higherIsGood: false, unit: "%", decimals: 1 },
  { id: "money", wb: "FM.LBL.MQMY.ZG", label: "Broad money (M2)", engine: "Liquidity", bucket: "Leading", higherIsGood: true, unit: "%", decimals: 1 },
  { id: "current_account", wb: "BN.CAB.XOKA.GD.ZS", label: "Current account / GDP", engine: "External", bucket: "Coincident", higherIsGood: true, unit: "% of GDP", decimals: 1 }
];

// ---------------------------------------------------------------------------
// CACHE ENGINE
// ---------------------------------------------------------------------------
function cacheSet(key, value) {
  localStorage.setItem(key, JSON.stringify({ timestamp: Date.now(), value }));
}

function cacheGet(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const payload = JSON.parse(raw);
  if (Date.now() - payload.timestamp > CACHE_TTL) {
    localStorage.removeItem(key);
    return null;
  }
  return payload.value;
}

// ---------------------------------------------------------------------------
// WORLD BANK FETCH (CACHED)
// ---------------------------------------------------------------------------
async function fetchWorldBankSeries(countryKey, indicatorCode) {
  const meta = COUNTRY_META[countryKey];
  if (!meta) return [];

  const cacheKey = `WB_${meta.wb}_${indicatorCode}`;
  const cached = cacheGet(cacheKey);
  if (cached) return cached;

  const url = `https://api.worldbank.org/v2/country/${meta.wb}/indicator/${indicatorCode}?format=json&per_page=200`;

  try {
    const res = await fetch(url);
    const json = await res.json();
    const data = json?.[1];
    if (!Array.isArray(data)) return [];

    const series = data
      .filter(d => d.value !== null)
      .map(d => ({ year: +d.date, value: +d.value }))
      .sort((a, b) => a.year - b.year);

    cacheSet(cacheKey, series);
    return series;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// STATISTICS + Z-SCORE ENGINE
// ---------------------------------------------------------------------------
function computeStats(series, lookback = 10) {
  if (!series.length) return null;

  const latest = series.at(-1);
  const prev = series.at(-2) || latest;
  const window = series.filter(p => p.year >= latest.year - lookback);

  const mean = window.reduce((s, v) => s + v.value, 0) / window.length;
  const variance = window.reduce((s, v) => s + (v.value - mean) ** 2, 0) / window.length;
  const stdev = Math.sqrt(variance);
  const z = stdev > 0 ? (latest.value - mean) / stdev : 0;

  return {
    latest,
    mean,
    z,
    delta: latest.value - prev.value,
    windowYears: window.length
  };
}

// ---------------------------------------------------------------------------
// PROPRIETARY ENGINE SCORING (CORDOBA IP)
// ---------------------------------------------------------------------------
function engineScoreFromIndicators(stats) {
  const clamp = z => Math.max(-2.5, Math.min(2.5, z || 0));
  const score = z => Math.round(50 + (clamp(z) / 2.5) * 40);

  const gdp = stats.gdp_growth?.z || 0;
  const u = stats.unemployment?.z || 0;
  const infl = stats.inflation?.z || 0;
  const m2 = stats.money?.z || 0;
  const ca = stats.current_account?.z || 0;

  return {
    growth: { z: gdp - 0.4 * u, score: score(gdp - 0.4 * u) },
    inflation: { z: -infl, score: score(-infl) },
    liquidity: { z: m2, score: score(m2) },
    external: { z: ca, score: score(ca) }
  };
}

// ---------------------------------------------------------------------------
// FORMATTERS
// ---------------------------------------------------------------------------
function formatNumber(v, d = 1, unit = "") {
  if (v == null) return "n/a";
  const num = v.toFixed(d);
  return `${num}${unit === "%" || unit === "% of GDP" ? "%" : ""}`;
}

// ---------------------------------------------------------------------------
// EXPORT TOOLS (PNG / PDF / CLIPBOARD)
// ---------------------------------------------------------------------------
async function exportPNG() {
  const el = document.body;
  const canvas = await html2canvas(el, { scale: 2 });
  const link = document.createElement("a");
  link.download = "cordoba_macro_snapshot.png";
  link.href = canvas.toDataURL();
  link.click();
}

async function exportPDF() {
  const el = document.body;
  const canvas = await html2canvas(el, { scale: 2 });
  const img = canvas.toDataURL("image/png");
  const pdf = new jspdf.jsPDF("landscape");
  pdf.addImage(img, "PNG", 10, 10, 280, 160);
  pdf.save("cordoba_macro_snapshot.pdf");
}

async function copyToClipboard() {
  const canvas = await html2canvas(document.body);
  canvas.toBlob(blob => navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]));
}

// ---------------------------------------------------------------------------
// COUNTRY LOADER
// ---------------------------------------------------------------------------
async function loadCountry(countryKey) {
  document.body.classList.add("cc-loading");

  const statsById = {};

  for (const cfg of INDICATORS) {
    const series = await fetchWorldBankSeries(countryKey, cfg.wb);
    statsById[cfg.id] = computeStats(series);
  }

  const engines = engineScoreFromIndicators(statsById);

  renderEngineCards(engines);
  renderHeadlineTiles(statsById);
  renderIndicatorGrid(statsById, countryKey);

  const lastYear = Math.max(...Object.values(statsById).map(v => v?.latest?.year || 0));
  document.getElementById("cc-data-as-of").textContent = `latest: ${lastYear}`;

  document.body.classList.remove("cc-loading");
}

// ---------------------------------------------------------------------------
// RENDER FUNCTIONS (MATCH YOUR HTML)
// ---------------------------------------------------------------------------
function renderEngineCards(engines) {
  const map = {
    growth: "Growth",
    inflation: "Inflation",
    liquidity: "Liquidity",
    external: "External"
  };

  const container = document.getElementById("cc-engine-cards");
  container.innerHTML = "";

  Object.entries(map).forEach(([k, label]) => {
    const e = engines[k];
    const div = document.createElement("div");
    div.className = "p-3 border rounded-xl bg-cordobaSoft text-center";
    div.innerHTML = `
      <div class="text-[10px] uppercase">${label}</div>
      <div class="text-xl font-semibold">${e.score}/100</div>
      <div class="text-xs text-neutral-600">z ${e.z.toFixed(2)}</div>
    `;
    container.appendChild(div);
  });
}

function renderHeadlineTiles(stats) {
  const map = {
    gdp_growth: "cc-gdp-latest",
    inflation: "cc-inflation-latest",
    unemployment: "cc-unemployment-latest",
    money: "cc-money-latest",
    current_account: "cc-ca-latest"
  };

  INDICATORS.forEach(cfg => {
    const stat = stats[cfg.id];
    if (!stat) return;
    document.getElementById(map[cfg.id]).textContent =
      `${formatNumber(stat.latest.value, cfg.decimals, cfg.unit)} (${stat.latest.year})`;
  });
}

function renderIndicatorGrid(stats, countryKey) {
  const tbody = document.getElementById("cc-indicator-rows");
  tbody.innerHTML = "";

  INDICATORS.forEach(cfg => {
    const s = stats[cfg.id];
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${cfg.label}</td>
      <td>${cfg.engine}</td>
      <td>${cfg.bucket}</td>
      <td>${formatNumber(s.latest.value, cfg.decimals, cfg.unit)}</td>
      <td>${s.z.toFixed(2)}</td>
      <td>${formatNumber(s.delta, cfg.decimals, cfg.unit)}</td>
    `;
    tbody.appendChild(tr);
  });
}

// ---------------------------------------------------------------------------
// INIT
// ---------------------------------------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  loadCountry("US");

  document.getElementById("export-png")?.addEventListener("click", exportPNG);
  document.getElementById("export-pdf")?.addEventListener("click", exportPDF);
  document.getElementById("export-copy")?.addEventListener("click", copyToClipboard);
});
