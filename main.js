const COUNTRY_DATA = {
  US: {
    code: "US",
    name: "United States",
    region: "G-20 · DM",
    dotClass: "bg-emerald-400",
    engines: {
      growthScore: 63,
      growthPercentile: "78th percentile vs 10-year history",
      growthZ: "+0.8σ",
      growthDesc: "Above trend",
      inflationScore: 54,
      inflationPercentile: "61st percentile vs 10-year history",
      inflationZ: "+0.3σ",
      inflationDesc: "Disinflating",
      liquidityScore: 41,
      liquidityPercentile: "32nd percentile vs 10-year history",
      liquidityZ: "−0.7σ",
      liquidityDesc: "Restrictive",
      externalScore: 58,
      externalPercentile: "67th percentile vs 10-year history",
      externalZ: "+0.1σ",
      externalDesc: "Balanced",
      overallScore: 64
    },
    regime: {
      title: "Late-cycle disinflation",
      summary:
        "Growth is still above trend but losing momentum, inflation is cooling, and policy remains tight in real terms. The curve is inverted and the risk is that cuts come into a slowdown rather than a soft landing.",
      confidence: 0.72,
      analogs: [2000, 2007, 2018],
      risks: {
        growth: "Growth risk: medium",
        inflation: "Inflation risk: low",
        policy: "Policy error risk: medium",
        external: "External risk: low"
      }
    },
    inflections: [
      {
        title: "ISM new orders",
        direction: "down",
        conviction: "medium",
        text: "New orders rolled over from expansion, pointing to softer manufacturing momentum ahead."
      },
      {
        title: "Core services CPI (3m annualised)",
        direction: "down",
        conviction: "medium",
        text: "Services disinflation is finally broadening, easing the risk of a second inflation wave."
      },
      {
        title: "Fed-dated OIS curve",
        direction: "up",
        conviction: "low",
        text: "Market is slowly adding back cuts, reducing the risk of an overtightening error."
      }
    ],
    signals: [
      {
        indicator: "OECD CLI",
        engine: "Growth",
        bucket: "Leading",
        tone: "positive",
        signalLabel: "Expansion",
        last: "100.8",
        zScore: "+0.9",
        comment: "Momentum remains positive but rolling over at the margin."
      },
      {
        indicator: "Core CPI (YoY)",
        engine: "Inflation",
        bucket: "Coincident",
        tone: "mixed",
        signalLabel: "Cooling",
        last: "2.7%",
        zScore: "+0.3",
        comment: "Still above target but trending lower; pressure shifting to services."
      },
      {
        indicator: "10s–2s UST slope",
        engine: "Liquidity",
        bucket: "Leading",
        tone: "caution",
        signalLabel: "Late-cycle",
        last: "−35 bps",
        zScore: "−1.2",
        comment: "Curve remains inverted; recession risk priced but not realised yet."
      },
      {
        indicator: "Current account / GDP",
        engine: "External",
        bucket: "Lagging",
        tone: "neutral",
        signalLabel: "Neutral",
        last: "−2.1%",
        zScore: "−0.3",
        comment: "Deficit contained; no immediate funding stress flagged by reserves."
      }
    ],
    chart: buildToyChartData(24, 0.6) // 24 obs, slightly above-trend
  },

  UK: {
    code: "UK",
    name: "United Kingdom",
    region: "G-20 · DM",
    dotClass: "bg-amber-300",
    engines: {
      growthScore: 49,
      growthPercentile: "45th percentile vs 10-year history",
      growthZ: "−0.1σ",
      growthDesc: "Near trend",
      inflationScore: 51,
      inflationPercentile: "55th percentile vs 10-year history",
      inflationZ: "+0.1σ",
      inflationDesc: "Sticky",
      liquidityScore: 44,
      liquidityPercentile: "38th percentile vs 10-year history",
      liquidityZ: "−0.4σ",
      liquidityDesc: "Tight-ish",
      externalScore: 52,
      externalPercentile: "57th percentile vs 10-year history",
      externalZ: "+0.2σ",
      externalDesc: "Stable",
      overallScore: 55
    },
    regime: {
      title: "Sluggish disinflation",
      summary:
        "Growth has stabilised around trend after a shallow slowdown. Inflation is drifting back towards target but remains sensitive to energy and wage shocks.",
      confidence: 0.63,
      analogs: [2013, 2016],
      risks: {
        growth: "Growth risk: medium",
        inflation: "Inflation risk: medium",
        policy: "Policy error risk: low",
        external: "External risk: low"
      }
    },
    inflections: [
      {
        title: "Labour market cooling",
        direction: "down",
        conviction: "medium",
        text: "Vacancy-to-unemployment ratios keep normalising, pointing to weaker wage pressure ahead."
      },
      {
        title: "Gilts term premium",
        direction: "up",
        conviction: "low",
        text: "Long-end term premia are rebuilding slowly after last year’s stress episode."
      }
    ],
    signals: [
      {
        indicator: "Composite PMI",
        engine: "Growth",
        bucket: "Coincident",
        tone: "neutral",
        signalLabel: "Sideways",
        last: "50.3",
        zScore: "0.0",
        comment: "Activity hovering around the 50 line with services offsetting weak manufacturing."
      },
      {
        indicator: "Core CPI (YoY)",
        engine: "Inflation",
        bucket: "Coincident",
        tone: "mixed",
        signalLabel: "Sticky",
        last: "2.8%",
        zScore: "+0.4",
        comment: "headline relief is there, but core still above target with broad-based services strength."
      }
    ],
    chart: buildToyChartData(24, 0.1)
  },

  DE: {
    code: "DE",
    name: "Germany",
    region: "G-20 · DM",
    dotClass: "bg-sky-400",
    engines: {
      growthScore: 42,
      growthPercentile: "28th percentile vs 10-year history",
      growthZ: "−0.6σ",
      growthDesc: "Below trend",
      inflationScore: 45,
      inflationPercentile: "39th percentile vs 10-year history",
      inflationZ: "−0.2σ",
      inflationDesc: "Cooling",
      liquidityScore: 52,
      liquidityPercentile: "59th percentile vs 10-year history",
      liquidityZ: "+0.2σ",
      liquidityDesc: "Neutral",
      externalScore: 60,
      externalPercentile: "70th percentile vs 10-year history",
      externalZ: "+0.4σ",
      externalDesc: "Resilient",
      overallScore: 53
    },
    regime: {
      title: "External-led soft patch",
      summary:
        "Weak external demand and tighter credit conditions keep growth below trend, but external balances and pricing power remain relatively resilient.",
      confidence: 0.68,
      analogs: [2012, 2019],
      risks: {
        growth: "Growth risk: high",
        inflation: "Inflation risk: low",
        policy: "Policy error risk: low",
        external: "External risk: medium"
      }
    },
    inflections: [
      {
        title: "IFO expectations",
        direction: "up",
        conviction: "low",
        text: "Sentiment has stopped deteriorating, hinting that the worst of the drag may be behind us."
      }
    ],
    signals: [
      {
        indicator: "IFO expectations",
        engine: "Growth",
        bucket: "Leading",
        tone: "positive",
        signalLabel: "Stabilising",
        last: "88.2",
        zScore: "+0.2",
        comment: "First consistent improvement after a long downturn in manufacturing-heavy sectors."
      }
    ],
    chart: buildToyChartData(24, -0.3)
  }
};

// Fallback for other codes (CN, IN etc.) – reuse US template with slight tweaks
["CN", "IN"].forEach((code) => {
  if (!COUNTRY_DATA[code]) {
    const base = JSON.parse(JSON.stringify(COUNTRY_DATA.US));
    base.code = code;
    base.name = code === "CN" ? "China" : "India";
    base.region = "G-20 · EM";
    base.engines.overallScore = code === "CN" ? 59 : 66;
    base.chart = buildToyChartData(24, code === "CN" ? 0.2 : 0.7);
    COUNTRY_DATA[code] = base;
  }
});

// -----------------------------
// 2. Helpers / toy chart data
// -----------------------------

function buildToyChartData(n, bias) {
  const dates = [];
  const composite = [];
  const leading = [];
  const coincident = [];
  const lagging = [];
  let level = 0;

  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
      2,
      "0"
    )}`;
    dates.push(label);

    // simple random walk with bias
    const shock = (Math.random() - 0.5) * 0.4;
    level = level * 0.7 + bias * 0.3 + shock;

    composite.push((level + 0.2).toFixed(2));
    leading.push((level + 0.4).toFixed(2));
    coincident.push(level.toFixed(2));
    lagging.push((level - 0.2).toFixed(2));
  }

  return { dates, composite, leading, coincident, lagging };
}

// Basic stance logic from engine scores
function computeStanceFromEngines(countryCode) {
  const d = COUNTRY_DATA[countryCode] || COUNTRY_DATA.US;
  const g = d.engines.growthScore;
  const i = d.engines.inflationScore;
  const l = d.engines.liquidityScore;

  let equities, duration, fx, explanation;

  if (g >= 60 && l > 35) {
    equities = "OW Equities";
  } else if (g <= 45) {
    equities = "UW Equities";
  } else {
    equities = "Neutral Equities";
  }

  if (l <= 40 && i <= 50) {
    duration = "Long Duration";
  } else if (l >= 55) {
    duration = "Short Duration";
  } else {
    duration = "Duration Neutral";
  }

  if (countryCode === "US") {
    fx = "Long USD vs basket";
  } else if (countryCode === "UK" || countryCode === "DE") {
    fx = "Mild USD OW";
  } else {
    fx = "FX Neutral";
  }

  explanation =
    "high growth scores " +
    (g >= 60 ? "and above-median liquidity " : "with mixed liquidity ") +
    "feed into the equity stance; duration leans off the liquidity and inflation mix, " +
    "while FX takes into account the relative growth/inflation profile vs the US.";

  return { equities, duration, fx, explanation };
}

// ----------------------------------
// 3. DOM update functions
// ----------------------------------

function setCountry(countryCode) {
  const data = COUNTRY_DATA[countryCode] || COUNTRY_DATA.US;

  // Country labels
  const labelEl = document.querySelector("[data-cc-country-label]");
  const regionEl = document.querySelector("[data-cc-country-region]");
  const dotEl = document.getElementById("cc-country-dot");

  if (labelEl) labelEl.textContent = data.name;
  if (regionEl) regionEl.textContent = data.region;
  if (dotEl) {
    dotEl.className =
      "h-2 w-2 rounded-full " + (data.dotClass || "bg-emerald-400");
  }

  // Copy name across the page
  const regimeCountryEls = document.querySelectorAll(
    "[data-cc-regime-country], [data-cc-signals-country], [data-cc-timeseries-country]"
  );
  regimeCountryEls.forEach((el) => {
    el.textContent = data.name;
  });

  // Engines & regime tiles
  updateEngines(data);
  updateRegimeSummary(data);
  updateInflections(data);
  updateSignalsTable(data);
  updateRankingsTable();
  updateModelStance(countryCode);
  updateChart(countryCode);
}

function updateEngines(data) {
  const e = data.engines;

  // Growth
  setText("cc-growth-score", e.growthScore);
  setText("cc-growth-percentile", e.growthPercentile);
  setText("cc-reg-growth-z", e.growthZ);
  setText("cc-reg-growth-desc", e.growthDesc);
  setText("cc-growth-regime-text", e.growthDesc);

  // Inflation
  setText("cc-inflation-score", e.inflationScore);
  setText("cc-inflation-percentile", e.inflationPercentile);
  setText("cc-reg-inflation-z", e.inflationZ);
  setText("cc-reg-inflation-desc", e.inflationDesc);
  setText("cc-inflation-regime-text", e.inflationDesc);

  // Liquidity
  setText("cc-liquidity-score", e.liquidityScore);
  setText("cc-liquidity-percentile", e.liquidityPercentile);
  setText("cc-reg-liquidity-z", e.liquidityZ);
  setText("cc-reg-liquidity-desc", e.liquidityDesc);
  setText("cc-liquidity-regime-text", e.liquidityDesc);

  // External
  setText("cc-external-score", e.externalScore);
  setText("cc-external-percentile", e.externalPercentile);
  setText("cc-reg-external-z", e.externalZ);
  setText("cc-reg-external-desc", e.externalDesc);
  setText("cc-external-regime-text", e.externalDesc);

  // Latest view explainer
  const latestView = document.querySelector("[data-cc-latest-view]");
  if (latestView) {
    latestView.textContent =
      "Composite engine output for " +
      data.name +
      ". Growth sits at " +
      e.growthZ +
      ", inflation at " +
      e.inflationZ +
      ", liquidity at " +
      e.liquidityZ +
      " and external balance at " +
      e.externalZ +
      ".";
  }
}

function updateRegimeSummary(data) {
  const r = data.regime;

  const titleEl = document.querySelector("[data-cc-regime-title]");
  const countryEl = document.querySelector("[data-cc-regime-country]");
  const confEl = document.querySelector("[data-cc-regime-confidence]");
  const summaryEl = document.querySelector("[data-cc-regime-summary]");
  const analogsEl = document.getElementById("cc-regime-analogs");

  if (titleEl) titleEl.textContent = r.title;
  if (countryEl) countryEl.textContent = data.name;
  if (confEl) confEl.textContent = Math.round(r.confidence * 100) + "%";
  if (summaryEl) summaryEl.textContent = r.summary;

  if (analogsEl) {
    analogsEl.innerHTML = "";
    (r.analogs || []).forEach((year) => {
      const span = document.createElement("span");
      span.className =
        "rounded-full border border-slate-700 px-2 py-0.5 mr-1 mb-1";
      span.textContent = year;
      analogsEl.appendChild(span);
    });
  }

  // Risk flags
  setText("cc-risk-growth", r.risks.growth);
  setText("cc-risk-inflation", r.risks.inflation);
  setText("cc-risk-policy", r.risks.policy);
  setText("cc-risk-external", r.risks.external);
}

function updateInflections(data) {
  const container = document.getElementById("cc-inflection-list");
  if (!container) return;

  container.innerHTML = "";

  (data.inflections || []).forEach((item) => {
    const row = document.createElement("div");
    row.className =
      "border border-slate-800 rounded-xl px-3 py-2 bg-slate-900/60";

    const arrow =
      item.direction === "up" ? "↑" : item.direction === "down" ? "↓" : "•";
    const arrowColor =
      item.direction === "up"
        ? "text-emerald-400"
        : item.direction === "down"
        ? "text-amber-300"
        : "text-slate-400";

    const convColor =
      item.conviction === "high"
        ? "border-emerald-500/60 text-emerald-200"
        : item.conviction === "medium"
        ? "border-amber-500/60 text-amber-200"
        : "border-slate-600 text-slate-300";

    row.innerHTML = `
      <div class="flex items-center justify-between mb-1">
        <div class="flex items-center gap-2">
          <span class="${arrowColor} text-xs">${arrow}</span>
          <span class="text-[11px] font-medium text-slate-200">${item.title}</span>
        </div>
        <span class="text-[10px] uppercase tracking-[0.16em] rounded-full px-2 py-0.5 border ${convColor}">
          ${item.conviction || "low"}
        </span>
      </div>
      <div class="text-[11px] text-slate-400 leading-snug">
        ${item.text}
      </div>
    `;
    container.appendChild(row);
  });

  if (!data.inflections || data.inflections.length === 0) {
    container.innerHTML =
      '<div class="text-[11px] text-slate-500">No major inflection signals flagged this month.</div>';
  }
}

function updateSignalsTable(data) {
  const tbody = document.getElementById("cc-signals-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  (data.signals || []).forEach((s) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-900/70";

    const pill = buildSignalPillHTML(s.tone, s.signalLabel);

    tr.innerHTML = `
      <td class="py-2 pr-3 text-slate-100">${s.indicator}</td>
      <td class="py-2 pr-3 text-slate-300">${s.engine}</td>
      <td class="py-2 pr-3 text-slate-300">${s.bucket}</td>
      <td class="py-2 pr-3">${pill}</td>
      <td class="py-2 pr-3 text-right text-slate-100">${s.last}</td>
      <td class="py-2 pr-3 text-right text-slate-200">${s.zScore}</td>
      <td class="py-2 text-slate-400">${s.comment}</td>
    `;
    tbody.appendChild(tr);
  });

  if (!data.signals || data.signals.length === 0) {
    const tr = document.createElement("tr");
    tr.innerHTML =
      '<td colspan="7" class="py-3 text-center text-[11px] text-slate-500">No indicator set wired yet for this country.</td>';
    tbody.appendChild(tr);
  }
}

function buildSignalPillHTML(tone, label) {
  let baseColor =
    "bg-slate-700/40 border border-slate-500 text-slate-200"; // neutral

  if (tone === "positive") {
    baseColor =
      "bg-emerald-500/10 border border-emerald-500/40 text-emerald-200";
  } else if (tone === "negative") {
    baseColor = "bg-rose-500/10 border border-rose-500/40 text-rose-200";
  } else if (tone === "mixed" || tone === "caution") {
    baseColor = "bg-amber-500/10 border border-amber-500/40 text-amber-100";
  }

  return `
    <span class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] ${baseColor}">
      ${label}
    </span>
  `;
}

function updateRankingsTable() {
  const tbody = document.getElementById("cc-ranking-tbody");
  if (!tbody) return;

  const entries = Object.values(COUNTRY_DATA).slice();

  entries.sort((a, b) => b.engines.overallScore - a.engines.overallScore);

  tbody.innerHTML = "";

  entries.forEach((d, idx) => {
    const tr = document.createElement("tr");
    tr.className = "hover:bg-slate-900/70";

    tr.innerHTML = `
      <td class="py-1.5 pr-3 text-slate-400">${idx + 1}</td>
      <td class="py-1.5 pr-3 text-slate-100">${d.name}</td>
      <td class="py-1.5 pr-3 text-slate-300 text-[11px]">${d.regime.title}</td>
      <td class="py-1.5 pr-3 text-right text-slate-200">${d.engines.growthScore}</td>
      <td class="py-1.5 pr-3 text-right text-slate-200">${d.engines.inflationScore}</td>
      <td class="py-1.5 pr-3 text-right text-slate-200">${d.engines.liquidityScore}</td>
      <td class="py-1.5 pr-3 text-right text-slate-200">${d.engines.externalScore}</td>
      <td class="py-1.5 pr-3 text-right text-cordobaGold font-medium">${d.engines.overallScore}</td>
    `;
    tbody.appendChild(tr);
  });

  const sortLabel = document.getElementById("cc-ranking-sort-label");
  if (sortLabel) sortLabel.textContent = "Overall Macro Score";
}

// Model stance – fixed to avoid layout breakage
function updateModelStance(country) {
  const stance = computeStanceFromEngines(country);

  const eq = document.getElementById("cc-stance-equities");
  const dur = document.getElementById("cc-stance-duration");
  const fx = document.getElementById("cc-stance-fx");
  const expl = document.getElementById("cc-stance-explainer");

  const setPillLabel = (pillEl, label) => {
    if (!pillEl) return;
    const labelSpan = pillEl.querySelector(".cc-stance-label");
    if (labelSpan) labelSpan.textContent = label;
  };

  setPillLabel(eq, stance.equities || "Equities");
  setPillLabel(dur, stance.duration || "Duration");
  setPillLabel(fx, stance.fx || "FX");

  if (expl && stance.explanation) {
    expl.textContent =
      "Stance is derived from growth, inflation and liquidity scores vs history: " +
      stance.explanation;
  }
}

// -------------------------------
// 4. Chart.js integration
// -------------------------------

let growthChart = null;
let currentChartTab = "level";

function initChart() {
  const ctx = document.getElementById("cc-growth-chart");
  if (!ctx) return;

  const baseData = COUNTRY_DATA.US.chart;

  growthChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: baseData.dates,
      datasets: [
        {
          label: "Composite",
          data: baseData.composite,
          borderWidth: 1.5,
          tension: 0.3
        },
        {
          label: "Leading",
          data: baseData.leading,
          borderWidth: 1,
          borderDash: [4, 3],
          tension: 0.3
        },
        {
          label: "Coincident",
          data: baseData.coincident,
          borderWidth: 1,
          borderDash: [2, 3],
          tension: 0.3
        },
        {
          label: "Lagging",
          data: baseData.lagging,
          borderWidth: 1,
          borderDash: [6, 3],
          tension: 0.3
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          callbacks: {
            label: function (ctx) {
              return `${ctx.dataset.label}: ${ctx.parsed.y}`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            maxTicksLimit: 6,
            color: "#64748b",
            font: { size: 10 }
          },
          grid: {
            display: false
          }
        },
        y: {
          ticks: {
            color: "#64748b",
            font: { size: 10 }
          },
          grid: {
            color: "#1e293b"
          }
        }
      }
    }
  });
}

function updateChart(countryCode) {
  if (!growthChart) return;
  const data = COUNTRY_DATA[countryCode] || COUNTRY_DATA.US;
  const chartData = data.chart || COUNTRY_DATA.US.chart;

  growthChart.data.labels = chartData.dates.slice();

  // simple interpretation by tab:
  if (currentChartTab === "level") {
    growthChart.data.datasets[0].data = chartData.composite;
    growthChart.data.datasets[1].data = chartData.leading;
    growthChart.data.datasets[2].data = chartData.coincident;
    growthChart.data.datasets[3].data = chartData.lagging;
  } else if (currentChartTab === "zscore") {
    // treat the same data as z-scores for now
    growthChart.data.datasets[0].data = chartData.composite;
    growthChart.data.datasets[1].data = chartData.leading;
    growthChart.data.datasets[2].data = chartData.coincident;
    growthChart.data.datasets[3].data = chartData.lagging;
  } else {
    // components view – same underlying, just a different caption
    growthChart.data.datasets[0].data = chartData.composite;
    growthChart.data.datasets[1].data = chartData.leading;
    growthChart.data.datasets[2].data = chartData.coincident;
    growthChart.data.datasets[3].data = chartData.lagging;
  }

  growthChart.update();

  const caption = document.querySelector("[data-cc-chart-caption]");
  if (caption) {
    if (currentChartTab === "level") {
      caption.textContent =
        "Chart – Level view: growth composite vs time, scaled around zero.";
    } else if (currentChartTab === "zscore") {
      caption.textContent =
        "Chart – z-Score view: composite and components vs own history.";
    } else {
      caption.textContent =
        "Chart – Components view: leading, coincident and lagging contribution lines.";
    }
  }
}

// -------------------------------
// 5. UI interaction wiring
// -------------------------------

function initLiveToggle() {
  const group = document.getElementById("cc-live-toggle-group");
  if (!group) return;

  group.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cc-live-toggle]");
    if (!btn) return;

    const mode = btn.getAttribute("data-cc-live-toggle");
    const buttons = group.querySelectorAll("[data-cc-live-toggle]");

    buttons.forEach((b) => {
      const isActive = b === btn;
      b.className =
        "px-3 py-1 rounded-full text-xs " +
        (isActive
          ? "bg-cordobaGold text-slate-900 font-medium"
          : "text-slate-400 hover:text-slate-100");
    });

    const info = document.querySelector("[data-cc-last-update]");
    if (info) {
      info.textContent =
        mode === "live" ? "T-1 close (mocked)" : "Static snapshot (mocked)";
    }
  });
}

function initCountryDropdown() {
  const toggle = document.getElementById("cc-country-toggle");
  const menu = document.getElementById("cc-country-menu");
  if (!toggle || !menu) return;

  toggle.addEventListener("click", () => {
    menu.classList.toggle("hidden");
  });

  menu.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-cc-country]");
    if (!btn) return;
    const code = btn.getAttribute("data-cc-country");
    setCountry(code);
    menu.classList.add("hidden");
  });

  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target) && !toggle.contains(e.target)) {
      menu.classList.add("hidden");
    }
  });
}

function initChartTabs() {
  const buttons = document.querySelectorAll("[data-cc-chart-tab]");
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tab = btn.getAttribute("data-cc-chart-tab");
      currentChartTab = tab;

      buttons.forEach((b) => {
        const active = b === btn;
        b.className =
          "px-2.5 py-0.5 rounded-full border text-[11px] " +
          (active
            ? "border-cordobaGold bg-cordobaGold/80 text-slate-950"
            : "border-slate-700 text-slate-400 hover:border-cordobaGold/70");
      });

      const activeCountry =
        document
          .querySelector("[data-cc-country-label]")
          ?.textContent?.trim() || "United States";

      const code =
        Object.values(COUNTRY_DATA).find((c) => c.name === activeCountry)
          ?.code || "US";

      updateChart(code);
    });
  });
}

// -------------------------------
// 6. Utilities & init
// -------------------------------

function setText(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) {
    el.textContent = value;
  }
}

function init() {
  initLiveToggle();
  initCountryDropdown();
  initChartTabs();
  initChart();

  // Default country
  setCountry("US");
  updateRankingsTable();
}

document.addEventListener("DOMContentLoaded", init);
