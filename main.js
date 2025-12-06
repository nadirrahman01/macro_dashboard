// Cordoba Capital – Macro Dashboard Logic
// =======================================

let ccData = null;
let ccCurrentCountry = "US";
let ccChartMode = "level";
let ccGrowthChart = null;
let ccRankingSortKey = "overall"; // currently only one sort, but ready for extension

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadCountryData();
  } catch (e) {
    console.error("Failed to load country data", e);
  }

  setupCountryDropdown();
  setupLiveToggle();
  setupChartTabs();
  setupFocusCountries(); // stub for future watchlist-style UI

  if (ccData) {
    applyCountry(ccCurrentCountry);
    buildRankingTable();
  } else {
    console.warn("No data available; dashboard will stay in placeholder mode.");
  }
});

// ---------------------------
// Data loading / helpers
// ---------------------------
async function loadCountryData() {
  const resp = await fetch("data/countries.json");
  if (!resp.ok) {
    throw new Error("HTTP " + resp.status);
  }
  ccData = await resp.json();
}

function getCountryByCode(code) {
  if (!ccData || !ccData.countries) return null;
  return ccData.countries.find((c) => c.code === code) || null;
}

// ---------------------------
// Core apply function
// ---------------------------
function applyCountry(code) {
  const country = getCountryByCode(code);
  if (!country) {
    console.warn("Country not found:", code);
    return;
  }
  ccCurrentCountry = code;

  // 1) Country labels
  const labelEl = document.querySelector("[data-cc-country-label]");
  const regionEl = document.querySelector("[data-cc-country-region]");
  const signalsCountryEl = document.querySelector("[data-cc-signals-country]");
  const tsCountryEl = document.querySelector("[data-cc-timeseries-country]");
  const regimeCountryEl = document.querySelector("[data-cc-regime-country]");
  const dot = document.getElementById("cc-country-dot");

  if (labelEl) labelEl.textContent = country.name;
  if (regionEl) regionEl.textContent = country.region;
  if (signalsCountryEl) signalsCountryEl.textContent = country.name;
  if (tsCountryEl) tsCountryEl.textContent = country.name;
  if (regimeCountryEl) regimeCountryEl.textContent = country.name;

  if (dot) {
    dot.classList.remove("bg-emerald-400", "bg-amber-400");
    if (country.regionType === "EM") {
      dot.classList.add("bg-amber-400");
    } else {
      dot.classList.add("bg-emerald-400");
    }
  }

  // 2) Latest view text
  const viewEl = document.querySelector("[data-cc-latest-view]");
  if (viewEl) {
    viewEl.textContent = country.latestView || "";
  }

  // 3) Regime summary card
  updateRegimeSummary(country);

  // 4) Engine cards & regime z-scores
  updateEngineCard("growth", country.engines?.growth);
  updateEngineCard("inflation", country.engines?.inflation);
  updateEngineCard("liquidity", country.engines?.liquidity);
  updateEngineCard("external", country.engines?.external);

  updateRegimeBadge("growth", country.engines?.growth);
  updateRegimeBadge("inflation", country.engines?.inflation);
  updateRegimeBadge("liquidity", country.engines?.liquidity);
  updateRegimeBadge("external", country.engines?.external);

  // 5) Systematic stance
  updateModelStance(country);

  // 6) Inflection monitor
  updateInflections(country);

  // 7) Signals table
  updateSignalsTable(country);

  // 8) Growth chart
  updateGrowthChart(country);

  // 9) Last update
  const lastUpdateEl = document.querySelector("[data-cc-last-update]");
  if (lastUpdateEl && country.timeseries?.dates?.length) {
    lastUpdateEl.textContent = country.timeseries.dates.slice(-1)[0];
  }
}

// ---------------------------
// Regime summary
// ---------------------------
function updateRegimeSummary(country) {
  const titleEl = document.querySelector("[data-cc-regime-title]");
  const summaryEl = document.querySelector("[data-cc-regime-summary]");
  const confEl = document.querySelector("[data-cc-regime-confidence]");
  const analogsContainer = document.getElementById("cc-regime-analogs");

  const meta = country.regimeMeta || {};
  if (titleEl) titleEl.textContent = meta.title || country.macroRegime || "";
  if (summaryEl) summaryEl.textContent = meta.summary || country.latestView || "";

  if (confEl && typeof meta.confidence === "number") {
    confEl.textContent = Math.round(meta.confidence * 100) + "%";
  }

  if (analogsContainer) {
    analogsContainer.innerHTML = "";
    if (Array.isArray(meta.analogs) && meta.analogs.length) {
      meta.analogs.forEach((yr) => {
        const span = document.createElement("span");
        span.className =
          "rounded-full border border-slate-700 px-2 py-0.5";
        span.textContent = yr;
        analogsContainer.appendChild(span);
      });
    }
  }

  // Risk flags
  const rf = country.riskFlags || {};
  const growthFlag = document.getElementById("cc-risk-growth");
  const inflFlag = document.getElementById("cc-risk-inflation");
  const policyFlag = document.getElementById("cc-risk-policy");
  const extFlag = document.getElementById("cc-risk-external");

  if (growthFlag) {
    growthFlag.textContent = "Growth risk: " + (rf.growth || "n/a");
  }
  if (inflFlag) {
    inflFlag.textContent = "Inflation risk: " + (rf.inflation || "n/a");
  }
  if (policyFlag) {
    policyFlag.textContent = "Policy error risk: " + (rf.policyError || "n/a");
  }
  if (extFlag) {
    extFlag.textContent = "External risk: " + (rf.external || "n/a");
  }
}

// ---------------------------
// Engine cards
// ---------------------------
function updateEngineCard(key, obj) {
  if (!obj) return;

  const scoreId = {
    growth: "cc-growth-score",
    inflation: "cc-inflation-score",
    liquidity: "cc-liquidity-score",
    external: "cc-external-score"
  }[key];

  const pctId = {
    growth: "cc-growth-percentile",
    inflation: "cc-inflation-percentile",
    liquidity: "cc-liquidity-percentile",
    external: "cc-external-percentile"
  }[key];

  const regimeTextId = {
    growth: "cc-growth-regime-text",
    inflation: "cc-inflation-regime-text",
    liquidity: "cc-liquidity-regime-text",
    external: "cc-external-regime-text"
  }[key];

  if (scoreId) {
    const el = document.getElementById(scoreId);
    if (el && typeof obj.score === "number") {
      el.textContent = Math.round(obj.score);
    }
  }

  if (pctId) {
    const el = document.getElementById(pctId);
    if (el && typeof obj.percentile === "number") {
      el.textContent = `${Math.round(
        obj.percentile
      )}th percentile vs 10-year history`;
    }
  }

  if (regimeTextId) {
    const el = document.getElementById(regimeTextId);
    if (el && obj.regime) {
      el.textContent = obj.regime;
    }
  }
}

function updateRegimeBadge(key, obj) {
  if (!obj) return;

  const zId = {
    growth: "cc-reg-growth-z",
    inflation: "cc-reg-inflation-z",
    liquidity: "cc-reg-liquidity-z",
    external: "cc-reg-external-z"
  }[key];

  const descId = {
    growth: "cc-reg-growth-desc",
    inflation: "cc-reg-inflation-desc",
    liquidity: "cc-reg-liquidity-desc",
    external: "cc-reg-external-desc"
  }[key];

  if (zId) {
    const el = document.getElementById(zId);
    if (el && typeof obj.z === "number") {
      const sign = obj.z > 0 ? "+" : "";
      el.textContent = `${sign}${obj.z.toFixed(1)}σ`;
    }
  }

  if (descId) {
    const el = document.getElementById(descId);
    if (el && obj.descriptor) {
      el.textContent = obj.descriptor;
    }
  }
}

// ---------------------------
// Model stance (rule-based)
// ---------------------------
function computeStanceFromEngines(country) {
  const g = country.engines?.growth?.z ?? 0;
  const i = country.engines?.inflation?.z ?? 0;
  const l = country.engines?.liquidity?.z ?? 0;

  // Very simple but explicit rule set
  let equities, duration, fx;
  let explanationBits = [];

  // Equities
  if (g > 0.7 && l > -0.2) {
    equities = "OW Equities";
    explanationBits.push("growth is well above trend and liquidity is not deeply restrictive");
  } else if (g < -0.3) {
    equities = "UW Equities";
    explanationBits.push("growth is below trend");
  } else {
    equities = "Neutral Equities";
    explanationBits.push("growth sits near trend with mixed liquidity");
  }

  // Duration
  if (g < 0 && i < 0) {
    duration = "OW Duration";
    explanationBits.push("growth and inflation are both softening vs history");
  } else if (g > 0.5 && i > 0.3) {
    duration = "UW Duration";
    explanationBits.push("growth and inflation are elevated");
  } else {
    duration = "Neutral Duration";
    explanationBits.push("signals on the growth/inflation mix are balanced");
  }

  // FX – very rough DM bias logic
  if (country.code === "US" && (g > 0 || l < 0)) {
    fx = "Long USD";
    explanationBits.push("US offers strong growth or tighter real policy vs peers");
  } else if (country.regionType === "EM" && g > 0.8 && i <= 0.3) {
    fx = "Mildly Long FX";
    explanationBits.push("high growth with contained inflation supports local FX carry");
  } else {
    fx = "Neutral FX";
    explanationBits.push("no clear FX risk premium edge from the macro scores alone");
  }

  return {
    equities,
    duration,
    fx,
    explanation: explanationBits.join("; ") + "."
  };
}

function updateModelStance(country) {
  const stance = computeStanceFromEngines(country);

  const eq = document.getElementById("cc-stance-equities");
  const dur = document.getElementById("cc-stance-duration");
  const fx = document.getElementById("cc-stance-fx");
  const expl = document.getElementById("cc-stance-explainer");

  if (eq && stance.equities) {
    const textNode = eq.querySelector("span:last-child");
    if (textNode) textNode.textContent = " " + stance.equities;
  }
  if (dur && stance.duration) {
    const textNode = dur.querySelector("span:last-child");
    if (textNode) textNode.textContent = " " + stance.duration;
  }
  if (fx && stance.fx) {
    const textNode = fx.querySelector("span:last-child");
    if (textNode) textNode.textContent = " " + stance.fx;
  }
  if (expl && stance.explanation) {
    expl.textContent =
      "Stance is derived from growth, inflation and liquidity scores vs history: " +
      stance.explanation;
  }
}

// ---------------------------
// Inflection Monitor
// ---------------------------
function updateInflections(country) {
  const container = document.getElementById("cc-inflection-list");
  if (!container) return;

  const list = country.inflections || [];
  container.innerHTML = "";

  if (!list.length) {
    const p = document.createElement("p");
    p.className = "text-xs text-slate-500";
    p.textContent = "No recent inflection signals recorded for this country yet.";
    container.appendChild(p);
    return;
  }

  list.forEach((inf) => {
    const row = document.createElement("div");
    row.className =
      "border border-slate-800 rounded-lg px-3 py-2 bg-slate-950/70";

    const sevColour =
      inf.severity === "high"
        ? "text-rose-300"
        : inf.severity === "medium"
        ? "text-amber-300"
        : "text-emerald-300";

    const dirLabel = inf.direction === "up" ? "↑" : "↓";

    row.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          <span class="text-[11px] uppercase tracking-[0.16em] text-slate-500">${inf.indicator}</span>
        </div>
        <div class="text-[11px] ${sevColour}">
          ${dirLabel} · ${inf.severity || "n/a"}
        </div>
      </div>
      <div class="text-[11px] text-slate-300 leading-snug">
        ${inf.comment || ""}
      </div>
    `;
    container.appendChild(row);
  });
}

// ---------------------------
// Signals table
// ---------------------------
function updateSignalsTable(country) {
  const tbody = document.getElementById("cc-signals-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  const indicators = country.indicators || [];
  if (!indicators.length) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="7" class="py-3 text-center text-xs text-slate-500">No indicator detail loaded for this country yet.</td>';
    tbody.appendChild(tr);
    return;
  }

  indicators.forEach((ind) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-900/70";

    const zColourClass =
      ind.zColour === "positive"
        ? "text-emerald-300"
        : ind.zColour === "negative"
        ? "text-rose-300"
        : "text-slate-200";

    tr.innerHTML = `
      <td class="py-2 pr-3 text-slate-100">${ind.name}</td>
      <td class="py-2 pr-3 text-slate-300">${ind.engine}</td>
      <td class="py-2 pr-3 text-slate-300">${ind.bucket}</td>
      <td class="py-2 pr-3">
        <span class="inline-flex items-center gap-1 rounded-full bg-slate-800/70 border border-slate-600 px-2 py-0.5 text-[11px] text-slate-100">
          ${ind.signal}
        </span>
      </td>
      <td class="py-2 pr-3 text-right text-slate-100">${ind.last}</td>
      <td class="py-2 pr-3 text-right ${zColourClass}">${formatZ(ind.z)}</td>
      <td class="py-2 text-slate-400">${ind.comment || ""}</td>
    `;
    tbody.appendChild(tr);
  });
}

function formatZ(z) {
  if (typeof z !== "number") return "";
  const sign = z > 0 ? "+" : "";
  return sign + z.toFixed(1);
}

// ---------------------------
// Country dropdown behaviour
// ---------------------------
function setupCountryDropdown() {
  const toggle = document.getElementById("cc-country-toggle");
  const menu = document.getElementById("cc-country-menu");
  if (!toggle || !menu) return;

  const optionButtons = menu.querySelectorAll("[data-cc-country]");

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });

  document.addEventListener("click", () => {
    if (!menu.classList.contains("hidden")) {
      menu.classList.add("hidden");
    }
  });

  optionButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const code = btn.getAttribute("data-cc-country");
      applyCountry(code);
      menu.classList.add("hidden");
    });
  });
}

// ---------------------------
// Focus countries (stub for future UI)
// ---------------------------
function setupFocusCountries() {
  const focusButtons = document.querySelectorAll("[data-cc-focus]");
  focusButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const code = btn.getAttribute("data-cc-focus");
      applyCountry(code);
    });
  });
}

// ---------------------------
// Live / Snapshot toggle
// ---------------------------
function setupLiveToggle() {
  const group = document.getElementById("cc-live-toggle-group");
  if (!group) return;

  const buttons = group.querySelectorAll("[data-cc-live-toggle]");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-cc-live-toggle");

      buttons.forEach((b) => {
        b.classList.remove("bg-cordobaGold", "text-slate-900", "font-medium");
        b.classList.add("text-slate-400");
      });

      btn.classList.add("bg-cordobaGold", "text-slate-900", "font-medium");
      btn.classList.remove("text-slate-400");

      console.log(`Live mode set to: ${mode}`);
    });
  });
}

// ---------------------------
// Chart tabs + chart
// ---------------------------
function setupChartTabs() {
  const tabButtons = document.querySelectorAll("[data-cc-chart-tab]");
  const captionEl = document.querySelector("[data-cc-chart-caption]");
  if (!tabButtons.length || !captionEl) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-cc-chart-tab");
      ccChartMode = mode;

      tabButtons.forEach((b) => {
        b.classList.remove("border-cordobaGold", "bg-cordobaGold/80", "text-slate-950");
        b.classList.add("border-slate-700", "text-slate-400");
      });

      btn.classList.add("border-cordobaGold", "bg-cordobaGold/80", "text-slate-950");
      btn.classList.remove("border-slate-700", "text-slate-400");

      if (mode === "level") {
        captionEl.textContent =
          "Chart – Level view of the growth composite. Higher values signal stronger growth vs history.";
      } else if (mode === "zscore") {
        captionEl.textContent =
          "Chart – z-Score view of the growth engine. Standardised vs the country’s own history.";
      } else if (mode === "components") {
        captionEl.textContent =
          "Chart – Components view. Leading, coincident, and lagging contributions to the growth engine.";
      }

      const country = getCountryByCode(ccCurrentCountry);
      if (country) updateGrowthChart(country);

      console.log(`Chart mode set to: ${mode}`);
    });
  });
}

function updateGrowthChart(country) {
  const ctx = document.getElementById("cc-growth-chart");
  if (!ctx || !country.timeseries) return;

  const ts = country.timeseries;
  const labels = ts.dates || [];
  let datasets = [];

  if (ccChartMode === "level") {
    datasets = [
      {
        label: "Composite (Level)",
        data: ts.growthLevel || [],
        borderColor: "rgba(16, 185, 129, 1)",
        tension: 0.25
      }
    ];
  } else if (ccChartMode === "zscore") {
    datasets = [
      {
        label: "Composite (z-Score)",
        data: ts.growthZ || [],
        borderColor: "rgba(56, 189, 248, 1)",
        tension: 0.25
      }
    ];
  } else if (ccChartMode === "components") {
    datasets = [
      {
        label: "Leading",
        data: ts.growthLeading || [],
        borderColor: "rgba(56, 189, 248, 1)",
        tension: 0.25
      },
      {
        label: "Coincident",
        data: ts.growthCoincident || [],
        borderColor: "rgba(251, 191, 36, 1)",
        tension: 0.25
      },
      {
        label: "Lagging",
        data: ts.growthLagging || [],
        borderColor: "rgba(248, 113, 113, 1)",
        tension: 0.25
      }
    ];
  }

  if (ccGrowthChart) {
    ccGrowthChart.data.labels = labels;
    ccGrowthChart.data.datasets = datasets;
    ccGrowthChart.update();
  } else {
    ccGrowthChart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            labels: {
              color: "#e5e7eb",
              font: { size: 10 }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#9ca3af",
              font: { size: 9 }
            },
            grid: {
              color: "rgba(75,85,99,0.3)"
            }
          },
          y: {
            ticks: {
              color: "#9ca3af",
              font: { size: 9 }
            },
            grid: {
              color: "rgba(31,41,55,0.8)"
            }
          }
        }
      }
    });
  }
}

// ---------------------------
// Rankings
// ---------------------------
function buildRankingTable() {
  const tbody = document.getElementById("cc-ranking-tbody");
  if (!tbody || !ccData || !ccData.countries) return;

  const rows = ccData.countries.map((c) => {
    const g = c.engines?.growth?.score ?? 50;
    const inf = c.engines?.inflation?.score ?? 50;
    const liq = c.engines?.liquidity?.score ?? 50;
    const ext = c.engines?.external?.score ?? 50;
    const overall = (g + (100 - Math.abs(inf - 50)) + liq + ext) / 4; // light penalty for extreme inflation
    return {
      country: c,
      growth: g,
      inflation: inf,
      liquidity: liq,
      external: ext,
      overall
    };
  });

  rows.sort((a, b) => b.overall - a.overall);

  tbody.innerHTML = "";

  rows.forEach((r, idx) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-900/70 cursor-pointer";

    tr.addEventListener("click", () => {
      applyCountry(r.country.code);
    });

    tr.innerHTML = `
      <td class="py-2 pr-3 text-slate-400">${idx + 1}</td>
      <td class="py-2 pr-3 text-slate-100">${r.country.name}</td>
      <td class="py-2 pr-3 text-slate-300">${r.country.macroRegime || ""}</td>
      <td class="py-2 pr-3 text-right text-slate-100">${Math.round(r.growth)}</td>
      <td class="py-2 pr-3 text-right text-slate-100">${Math.round(r.inflation)}</td>
      <td class="py-2 pr-3 text-right text-slate-100">${Math.round(r.liquidity)}</td>
      <td class="py-2 pr-3 text-right text-slate-100">${Math.round(r.external)}</td>
      <td class="py-2 pr-3 text-right text-cordobaGold font-medium">${Math.round(r.overall)}</td>
    `;
    tbody.appendChild(tr);
  });
}
