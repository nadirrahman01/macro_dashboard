// Cordoba Capital – Macro Dashboard Logic
// =======================================

let ccData = null;
let ccCurrentCountry = "US";
let ccChartMode = "level";
let ccGrowthChart = null;

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await loadCountryData();
  } catch (e) {
    console.error("Failed to load country data", e);
  }

  setupCountryDropdown();
  setupLiveToggle();
  setupChartTabs();
  setupFocusCountries(); // uses JSON "focus" array if needed later

  // Initialise UI with default country once data is ready
  if (ccData) {
    applyCountry(ccCurrentCountry);
  } else {
    console.warn("No data available; using static placeholders only.");
  }
});

// ---------------------------
// Data loading
// ---------------------------
async function loadCountryData() {
  const resp = await fetch("data/countries.json");
  if (!resp.ok) {
    throw new Error("HTTP " + resp.status);
  }
  ccData = await resp.json();
}

// Helper to get country object
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
    console.warn("Country not found in data:", code);
    return;
  }
  ccCurrentCountry = code;

  // 1) Update country labels
  const labelEl = document.querySelector("[data-cc-country-label]");
  const regionEl = document.querySelector("[data-cc-country-region]");
  const signalsCountryEl = document.querySelector("[data-cc-signals-country]");
  const tsCountryEl = document.querySelector("[data-cc-timeseries-country]");
  const dot = document.getElementById("cc-country-dot");

  if (labelEl) labelEl.textContent = country.name;
  if (regionEl) regionEl.textContent = country.region;
  if (signalsCountryEl) signalsCountryEl.textContent = country.name;
  if (tsCountryEl) tsCountryEl.textContent = country.name;

  if (dot) {
    dot.classList.remove("bg-emerald-400", "bg-amber-400");
    if (country.regionType === "EM") {
      dot.classList.add("bg-amber-400");
    } else {
      dot.classList.add("bg-emerald-400");
    }
  }

  // 2) Update latest view text
  const viewEl = document.querySelector("[data-cc-latest-view]");
  if (viewEl) {
    viewEl.textContent = country.latestView || "";
  }

  // 3) Update engine cards (scores + percentiles + regimes)
  updateEngineCard(
    "growth",
    country.engines?.growth?.score,
    country.engines?.growth?.percentile,
    country.engines?.growth?.regime
  );
  updateEngineCard(
    "inflation",
    country.engines?.inflation?.score,
    country.engines?.inflation?.percentile,
    country.engines?.inflation?.regime
  );
  updateEngineCard(
    "liquidity",
    country.engines?.liquidity?.score,
    country.engines?.liquidity?.percentile,
    country.engines?.liquidity?.regime
  );
  updateEngineCard(
    "external",
    country.engines?.external?.score,
    country.engines?.external?.percentile,
    country.engines?.external?.regime
  );

  // 4) Update right-hand regime z-scores
  updateRegimeBadge(
    "growth",
    country.engines?.growth?.z,
    country.engines?.growth?.descriptor
  );
  updateRegimeBadge(
    "inflation",
    country.engines?.inflation?.z,
    country.engines?.inflation?.descriptor
  );
  updateRegimeBadge(
    "liquidity",
    country.engines?.liquidity?.z,
    country.engines?.liquidity?.descriptor
  );
  updateRegimeBadge(
    "external",
    country.engines?.external?.z,
    country.engines?.external?.descriptor
  );

  // 5) Update model stance
  updateModelStance(country);

  // 6) Update signals table
  updateSignalsTable(country);

  // 7) Update chart
  updateGrowthChart(country);

  // 8) Update last update label (use last date in timeseries)
  const lastUpdateEl = document.querySelector("[data-cc-last-update]");
  if (lastUpdateEl && country.timeseries?.dates?.length) {
    lastUpdateEl.textContent = country.timeseries.dates.slice(-1)[0];
  }
}

// ---------------------------
// Engine cards
// ---------------------------
function updateEngineCard(key, score, percentile, regime) {
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
    if (el && typeof score === "number") {
      el.textContent = Math.round(score);
    }
  }

  if (pctId) {
    const el = document.getElementById(pctId);
    if (el && typeof percentile === "number") {
      el.textContent = `${Math.round(percentile)}th percentile vs 10-year history`;
    }
  }

  if (regimeTextId) {
    const el = document.getElementById(regimeTextId);
    if (el && regime) {
      el.textContent = regime;
    }
  }
}

function updateRegimeBadge(key, z, descriptor) {
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
    if (el && typeof z === "number") {
      const sign = z > 0 ? "+" : "";
      el.textContent = `${sign}${z.toFixed(1)}σ`;
    }
  }

  if (descId) {
    const el = document.getElementById(descId);
    if (el && descriptor) {
      el.textContent = descriptor;
    }
  }
}

// ---------------------------
// Model stance
// ---------------------------
function updateModelStance(country) {
  const eq = document.getElementById("cc-stance-equities");
  const dur = document.getElementById("cc-stance-duration");
  const fx = document.getElementById("cc-stance-fx");

  if (eq && country.modelStance?.equities) {
    eq.lastChild.textContent = " " + country.modelStance.equities;
  }
  if (dur && country.modelStance?.duration) {
    dur.lastChild.textContent = " " + country.modelStance.duration;
  }
  if (fx && country.modelStance?.fx) {
    fx.lastChild.textContent = " " + country.modelStance.fx;
  }

  // You could colour-code riskFlags here later if you add elements for them.
}

// ---------------------------
// Signals table
// ---------------------------
function updateSignalsTable(country) {
  const tbody = document.querySelector(
    "table.min-w-full tbody"
  );
  if (!tbody) return;

  // Clear existing rows
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
  const optionButtons = menu ? menu.querySelectorAll("[data-cc-country]") : [];

  if (!toggle || !menu) return;

  // Toggle menu open/close
  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    menu.classList.toggle("hidden");
  });

  // Close menu on outside click
  document.addEventListener("click", () => {
    if (!menu.classList.contains("hidden")) {
      menu.classList.add("hidden");
    }
  });

  // Selecting a country
  optionButtons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const countryCode = btn.getAttribute("data-cc-country");
      applyCountry(countryCode);
      menu.classList.add("hidden");
    });
  });
}

// ---------------------------
// Focus countries (watchlist-like)
// ---------------------------
function setupFocusCountries() {
  // If you later add a top-row of focus country buttons with data-cc-focus="US" etc,
  // you can wire them here. For now this is a stub ready to be used.
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

      // In future: freeze updates or flag historical snapshot mode
      console.log(`Live mode set to: ${mode}`);
    });
  });
}

// ---------------------------
// Chart tabs + chart rendering
// ---------------------------
function setupChartTabs() {
  const tabButtons = document.querySelectorAll("[data-cc-chart-tab]");
  const captionEl = document.querySelector("[data-cc-chart-caption]");
  if (!tabButtons.length || !captionEl) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-cc-chart-tab");
      ccChartMode = mode;

      // Reset all tabs to inactive
      tabButtons.forEach((b) => {
        b.classList.remove("border-cordobaGold", "bg-cordobaGold/80", "text-slate-950");
        b.classList.add("border-slate-700", "text-slate-400");
      });

      // Activate current
      btn.classList.add("border-cordobaGold", "bg-cordobaGold/80", "text-slate-950");
      btn.classList.remove("border-slate-700", "text-slate-400");

      // Update caption
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

      // Redraw chart for new mode
      if (ccData) {
        const country = getCountryByCode(ccCurrentCountry);
        if (country) updateGrowthChart(country);
      }

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
        borderColor: "rgba(16, 185, 129, 1)", // emerald-400
        tension: 0.25
      }
    ];
  } else if (ccChartMode === "zscore") {
    datasets = [
      {
        label: "Composite (z-Score)",
        data: ts.growthZ || [],
        borderColor: "rgba(56, 189, 248, 1)", // sky-400
        tension: 0.25
      }
    ];
  } else if (ccChartMode === "components") {
    datasets = [
      {
        label: "Leading",
        data: ts.growthLeading || [],
        borderColor: "rgba(56, 189, 248, 1)", // sky
        tension: 0.25
      },
      {
        label: "Coincident",
        data: ts.growthCoincident || [],
        borderColor: "rgba(251, 191, 36, 1)", // amber
        tension: 0.25
      },
      {
        label: "Lagging",
        data: ts.growthLagging || [],
        borderColor: "rgba(248, 113, 113, 1)", // rose
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
              color: "#e5e7eb", // slate-200
              font: { size: 10 }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              color: "#9ca3af", // slate-400
              font: { size: 9 }
            },
            grid: {
              color: "rgba(75,85,99,0.3)" // slate-600
            }
          },
          y: {
            ticks: {
              color: "#9ca3af",
              font: { size: 9 }
            },
            grid: {
              color: "rgba(31,41,55,0.8)" // dark
            }
          }
        }
      }
    });
  }
}
