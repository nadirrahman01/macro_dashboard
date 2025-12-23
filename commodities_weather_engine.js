// commodities_weather_engine.js
// Cordoba Research Group — Weather Pricing Engine (Beta)
// Core idea: Weather features → anomaly Z-scores → commodity-specific mapping → directional price indicator
// Data: Open-Meteo Forecast / Ensemble / Seasonal + Archive baseline
// Docs: https://open-meteo.com/en/docs  (Forecast) ; /en/docs/ensemble-api ; /en/docs/seasonal-forecast-api ; /en/docs/historical-weather-api

(() => {
  "use strict";

  // -----------------------------
  // 0) Small utilities
  // -----------------------------
  const $ = (id) => document.getElementById(id);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const mean = (arr) => arr.reduce((s, v) => s + v, 0) / Math.max(1, arr.length);
  const std = (arr) => {
    const m = mean(arr);
    const v = mean(arr.map((x) => (x - m) ** 2));
    return Math.sqrt(v);
  };
  const q = (arr, p) => {
    if (!arr.length) return NaN;
    const s = [...arr].sort((a, b) => a - b);
    const idx = (s.length - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return s[lo];
    return s[lo] + (s[hi] - s[lo]) * (idx - lo);
  };

  // Lead-time decay: investors care most about near-term shocks.
  // w(t) = exp(-t / tau), tau ~ 72h (3 days) by default.
  const leadWeight = (tHours, tau = 72) => Math.exp(-tHours / tau);

  // Z-score: z = (x - mu) / sigma
  const zscore = (x, mu, sigma) => (sigma && sigma > 1e-9 ? (x - mu) / sigma : 0);

  // Robust scaling: r = (x - median) / IQR
  const robust = (x, med, iqr) => (iqr && iqr > 1e-9 ? (x - med) / iqr : 0);

  // -----------------------------
  // 1) Commodity universe (20+)
  // -----------------------------
  // “region baskets” map commodities → key production / consumption hubs.
  // You can refine these coordinates as your commodities team wants.
  const COMMODITIES = [
    { key: "WTI", name: "Crude Oil (WTI)", type: "energy", hubs: [{ label: "Permian", lat: 31.8, lon: -102.4 }, { label: "Cushing", lat: 35.99, lon: -96.76 }] },
    { key: "BRENT", name: "Crude Oil (Brent)", type: "energy", hubs: [{ label: "North Sea", lat: 57.0, lon: 2.0 }, { label: "Rotterdam", lat: 51.92, lon: 4.48 }] },
    { key: "NG", name: "Natural Gas (Henry Hub)", type: "energy", hubs: [{ label: "Henry Hub", lat: 29.9, lon: -93.9 }, { label: "NYC demand", lat: 40.71, lon: -74.01 }] },
    { key: "GASOIL", name: "Gasoil / Diesel (Europe proxy)", type: "energy", hubs: [{ label: "ARA", lat: 51.95, lon: 4.14 }, { label: "Rhine", lat: 50.94, lon: 6.96 }] },

    { key: "CORN", name: "Corn", type: "ag", hubs: [{ label: "US Corn Belt", lat: 41.9, lon: -93.5 }, { label: "Paraná", lat: -24.9, lon: -51.6 }] },
    { key: "WHEAT", name: "Wheat", type: "ag", hubs: [{ label: "Kansas", lat: 38.5, lon: -98.0 }, { label: "Black Sea", lat: 46.5, lon: 35.2 }] },
    { key: "SOY", name: "Soybeans", type: "ag", hubs: [{ label: "Iowa", lat: 42.0, lon: -93.0 }, { label: "Mato Grosso", lat: -12.7, lon: -55.4 }] },
    { key: "RICE", name: "Rice", type: "ag", hubs: [{ label: "Punjab", lat: 30.9, lon: 75.8 }, { label: "Mekong", lat: 10.0, lon: 105.8 }] },

    { key: "COFFEE", name: "Coffee (Arabica)", type: "softs", hubs: [{ label: "Minas Gerais", lat: -18.9, lon: -46.7 }, { label: "Colombia", lat: 4.7, lon: -75.6 }] },
    { key: "COCOA", name: "Cocoa", type: "softs", hubs: [{ label: "Côte d’Ivoire", lat: 7.5, lon: -5.5 }, { label: "Ghana", lat: 6.2, lon: -1.0 }] },
    { key: "SUGAR", name: "Sugar", type: "softs", hubs: [{ label: "São Paulo", lat: -22.9, lon: -47.1 }, { label: "UP India", lat: 26.8, lon: 80.9 }] },
    { key: "COTTON", name: "Cotton", type: "softs", hubs: [{ label: "Texas", lat: 33.6, lon: -101.9 }, { label: "Gujarat", lat: 22.3, lon: 71.7 }] },

    { key: "COPPER", name: "Copper", type: "metals", hubs: [{ label: "Chile (mines)", lat: -22.9, lon: -68.2 }, { label: "China (demand)", lat: 31.23, lon: 121.47 }] },
    { key: "ALUMINUM", name: "Aluminium", type: "metals", hubs: [{ label: "Yunnan hydro", lat: 25.0, lon: 102.7 }, { label: "Queensland", lat: -23.7, lon: 148.0 }] },

    { key: "GOLD", name: "Gold", type: "metals", hubs: [{ label: "South Africa", lat: -26.2, lon: 28.0 }, { label: "Nevada", lat: 38.8, lon: -116.4 }] },
    { key: "SILVER", name: "Silver", type: "metals", hubs: [{ label: "Mexico", lat: 23.6, lon: -102.5 }, { label: "Peru", lat: -12.0, lon: -77.0 }] },

    { key: "LIVECATTLE", name: "Live Cattle", type: "livestock", hubs: [{ label: "Texas Panhandle", lat: 35.2, lon: -101.8 }, { label: "Nebraska", lat: 41.5, lon: -99.7 }] },
    { key: "HOGS", name: "Lean Hogs", type: "livestock", hubs: [{ label: "Iowa", lat: 42.0, lon: -93.0 }, { label: "North Carolina", lat: 35.5, lon: -79.0 }] },

    { key: "LNG_ASIA", name: "LNG (Asia demand proxy)", type: "energy", hubs: [{ label: "Tokyo", lat: 35.68, lon: 139.76 }, { label: "Seoul", lat: 37.57, lon: 126.98 }] },
    { key: "POWER_EU", name: "Power (EU weather proxy)", type: "power", hubs: [{ label: "Germany", lat: 51.2, lon: 10.4 }, { label: "UK", lat: 52.4, lon: -1.5 }] },
  ];

  // -----------------------------
  // 2) Weather feature menu (maximise unique signal content)
  // -----------------------------
  // Forecast API supports many hourly variables; here we choose a very broad set that
  // captures thermal, moisture, wind, radiation, and “stress” mechanics. :contentReference[oaicite:5]{index=5}
  const HOURLY_VARS = [
    "temperature_2m",
    "relative_humidity_2m",
    "dew_point_2m",
    "apparent_temperature",
    "precipitation",
    "rain",
    "snowfall",
    "cloud_cover",
    "cloud_cover_low",
    "cloud_cover_mid",
    "cloud_cover_high",
    "pressure_msl",
    "surface_pressure",
    "wind_speed_10m",
    "wind_gusts_10m",
    "wind_direction_10m",
    "wind_speed_100m",
    "wind_direction_100m",
    "shortwave_radiation",
    "direct_radiation",
    "diffuse_radiation",
    "uv_index",
    "vapour_pressure_deficit",
    "et0_fao_evapotranspiration",
    "soil_temperature_0cm",
    "soil_temperature_6cm",
    "soil_temperature_18cm",
    "soil_moisture_0_1cm",
    "soil_moisture_1_3cm",
    "soil_moisture_3_9cm",
    "soil_moisture_9_27cm",
    "soil_moisture_27_81cm"
  ];

  // For “seasonal / EC46” you’ll get 6-hourly, but we can still ingest it and resample.
  // EC46 also gates some soil vars to 46 days. :contentReference[oaicite:6]{index=6}

  // -----------------------------
  // 3) Quant signal design (institutional style)
  // -----------------------------
  // We create:
  //  (A) Feature anomalies: z_i = (x_i - mu_i) / sigma_i  vs Archive baseline
  //  (B) Weighted lead aggregation: Z_i = Σ_t w(t) * z_{i,t} / Σ_t w(t)
  //  (C) Commodity impact: ImpactZ = Σ_i beta_i * Z_i
  //  (D) Scenario distribution (ensemble): ImpactZ distribution → percentiles
  //
  // beta_i are “research coefficients” you can calibrate offline using historical
  // commodity returns + weather features (ridge / elastic net / boosting).
  // This browser version *renders* the institutional workflow without heavy training.

  // Starter coefficients (directional priors, intentionally conservative).
  // Replace with your calibrated coefficients per commodity.
  const COEFS = {
    NG: { "temperature_2m": -0.55, "apparent_temperature": -0.25, "wind_speed_10m": 0.05, "cloud_cover": 0.08 },
    POWER_EU: { "temperature_2m": -0.45, "wind_speed_100m": -0.22, "shortwave_radiation": -0.10, "cloud_cover": 0.10 },
    CORN: { "precipitation": -0.18, "et0_fao_evapotranspiration": 0.22, "vapour_pressure_deficit": 0.20, "soil_moisture_9_27cm": -0.24, "temperature_2m": 0.10 },
    WHEAT: { "precipitation": -0.15, "vapour_pressure_deficit": 0.18, "wind_gusts_10m": 0.06, "soil_moisture_3_9cm": -0.20, "temperature_2m": 0.08 },
    COFFEE: { "temperature_2m": 0.18, "precipitation": -0.10, "soil_moisture_3_9cm": -0.18, "vapour_pressure_deficit": 0.20 },
    COCOA: { "precipitation": -0.20, "relative_humidity_2m": -0.10, "soil_moisture_9_27cm": -0.18, "temperature_2m": 0.10 },
    WTI: { "wind_speed_10m": 0.06, "snowfall": 0.04, "temperature_2m": 0.03 }, // (proxy for disruptions, heating demand secondary)
    BRENT: { "wind_speed_10m": 0.05, "pressure_msl": -0.03, "cloud_cover": 0.02 }
  };

  // Fallback: if commodity has no calibrated map, we still compute a broad “stress composite”.
  const DEFAULT_BETA = {
    "vapour_pressure_deficit": 0.15,
    "et0_fao_evapotranspiration": 0.12,
    "precipitation": -0.10,
    "soil_moisture_9_27cm": -0.12,
    "temperature_2m": 0.05,
    "wind_speed_100m": 0.03
  };

  // -----------------------------
  // 4) Open-Meteo endpoints
  // -----------------------------
  const ENDPOINTS = {
    forecast: "https://api.open-meteo.com/v1/forecast",                   // general forecast :contentReference[oaicite:7]{index=7}
    ecmwf: "https://api.open-meteo.com/v1/ecmwf",                         // deterministic ECMWF :contentReference[oaicite:8]{index=8}
    ensemble: "https://ensemble-api.open-meteo.com/v1/ensemble",          // ensemble API :contentReference[oaicite:9]{index=9}
    seasonal: "https://seasonal-api.open-meteo.com/v1/seasonal",          // seasonal / EC46 :contentReference[oaicite:10]{index=10}
    archive: "https://archive-api.open-meteo.com/v1/archive"              // historical baseline :contentReference[oaicite:11]{index=11}
  };

  // -----------------------------
  // 5) UI boot
  // -----------------------------
  const state = {
    commodity: COMMODITIES[0],
    horizon: 7,
    model: "best",
    dense: true
  };

  function populateCommoditySelect() {
    const sel = $("cwe-commodity");
    sel.innerHTML = "";
    for (const c of COMMODITIES) {
      const opt = document.createElement("option");
      opt.value = c.key;
      opt.textContent = `${c.name} (${c.key})`;
      sel.appendChild(opt);
    }
    sel.value = state.commodity.key;
  }

  function renderRegionTags() {
    const el = $("cwe-region-tags");
    el.innerHTML = "";
    for (const h of state.commodity.hubs) {
      const tag = document.createElement("span");
      tag.className = "inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1 text-xs text-neutral-700 shadow-subtle";
      tag.textContent = `${h.label} • ${h.lat.toFixed(2)}, ${h.lon.toFixed(2)}`;
      el.appendChild(tag);
    }
  }

  // -----------------------------
  // 6) Weather fetchers
  // -----------------------------
  async function fetchForecast(lat, lon, days, modelMode) {
    const base = modelMode === "ecmwf" ? ENDPOINTS.ecmwf : ENDPOINTS.forecast;

    // Open-Meteo supports multi-model selection; best blend is default. :contentReference[oaicite:12]{index=12}
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: HOURLY_VARS.join(","),
      forecast_days: String(days),
      timezone: "GMT",
      wind_speed_unit: "kmh",
      temperature_unit: "celsius",
      precipitation_unit: "mm"
    });

    // Optional: request the “best blend” (default) or force deterministic ECMWF by switching endpoint.
    const url = `${base}?${params.toString()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Forecast fetch failed (${r.status})`);
    return r.json();
  }

  async function fetchEnsemble(lat, lon, days) {
    // Ensemble API yields probabilistic distributions across members. :contentReference[oaicite:13]{index=13}
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      hourly: [
        "temperature_2m",
        "precipitation",
        "wind_speed_10m",
        "wind_speed_100m",
        "vapour_pressure_deficit",
        "et0_fao_evapotranspiration"
      ].join(","),
      forecast_days: String(days),
      timezone: "GMT"
    });

    const url = `${ENDPOINTS.ensemble}?${params.toString()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Ensemble fetch failed (${r.status})`);
    return r.json();
  }

  async function fetchSeasonal(lat, lon, days) {
    // Seasonal API / EC46 is 6-hourly; includes certain soil vars up to 46 days. :contentReference[oaicite:14]{index=14}
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      // Keep it broad but realistic:
      hourly: [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation",
        "cloud_cover",
        "wind_speed_10m",
        "wind_speed_100m",
        "vapour_pressure_deficit",
        "et0_fao_evapotranspiration",
        "soil_temperature_0_7cm",
        "soil_moisture_0_7cm",
        "soil_moisture_7_28cm"
      ].join(","),
      forecast_days: String(days),
      timezone: "GMT"
    });

    const url = `${ENDPOINTS.seasonal}?${params.toString()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Seasonal fetch failed (${r.status})`);
    return r.json();
  }

  async function fetchArchiveBaseline(lat, lon) {
    // Baseline: use last 10 years of same month window (simple climatology proxy).
    // Archive endpoint supplies historical data and is stable for long spans. :contentReference[oaicite:15]{index=15}
    const now = new Date();
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth() + 1;

    // Use a 31-day window around current month for each year (simple, fast).
    const start = `${y - 10}-${String(m).padStart(2, "0")}-01`;
    const end = `${y - 1}-${String(m).padStart(2, "0")}-28`;

    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      start_date: start,
      end_date: end,
      hourly: [
        "temperature_2m",
        "precipitation",
        "wind_speed_10m",
        "wind_speed_100m",
        "vapour_pressure_deficit",
        "et0_fao_evapotranspiration",
        "soil_moisture_9_27cm",
        "relative_humidity_2m",
        "cloud_cover"
      ].join(","),
      timezone: "GMT"
    });

    const url = `${ENDPOINTS.archive}?${params.toString()}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Archive fetch failed (${r.status})`);
    return r.json();
  }

  // -----------------------------
  // 7) Feature engineering
  // -----------------------------
  function extractHourly(payload) {
    if (!payload || !payload.hourly || !payload.hourly.time) return null;
    const time = payload.hourly.time;
    const out = { time };
    for (const k of Object.keys(payload.hourly)) {
      if (k === "time") continue;
      out[k] = payload.hourly[k];
    }
    return out;
  }

  // Aggregate hourly series into summary stats + “lead-weighted anomaly Z”
  function buildFeatureMatrix(hourly, baselineStats) {
    const time = hourly.time;
    const n = time.length;

    const features = [];
    for (const v of Object.keys(hourly)) {
      if (v === "time") continue;

      const series = hourly[v];
      if (!Array.isArray(series) || series.length !== n) continue;

      // Lead-weighted average:
      let num = 0, den = 0;
      for (let i = 0; i < n; i++) {
        const w = leadWeight(i, 72);
        const x = series[i];
        if (x == null || Number.isNaN(x)) continue;
        num += w * x;
        den += w;
      }
      const lwMean = den ? (num / den) : NaN;

      // Extremes (tail risk):
      const clean = series.filter((x) => x != null && !Number.isNaN(x));
      const p05 = q(clean, 0.05);
      const p50 = q(clean, 0.50);
      const p95 = q(clean, 0.95);

      // Z vs baseline:
      const b = baselineStats?.[v];
      const z = b ? zscore(lwMean, b.mu, b.sigma) : 0;

      features.push({
        name: v,
        lwMean,
        p05,
        p50,
        p95,
        z
      });
    }
    return features;
  }

  function baselineFromArchive(archiveHourly) {
    // We collapse the archive into distribution stats by variable.
    const base = {};
    for (const v of Object.keys(archiveHourly)) {
      if (v === "time") continue;
      const s = archiveHourly[v].filter((x) => x != null && !Number.isNaN(x));
      if (s.length < 50) continue;
      base[v] = { mu: mean(s), sigma: std(s), med: q(s, 0.5), iqr: q(s, 0.75) - q(s, 0.25) };
    }
    return base;
  }

  // Commodity impact decomposition:
  function computeImpact(features, commodityKey) {
    const betas = COEFS[commodityKey] || DEFAULT_BETA;

    let impact = 0;
    const contrib = [];
    for (const f of features) {
      const beta = betas[f.name];
      if (beta == null) continue;
      const c = beta * f.z;
      impact += c;
      contrib.push({ name: f.name, beta, z: f.z, contribution: c, lwMean: f.lwMean });
    }

    contrib.sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));

    // Convert to a bounded score investors can interpret quickly:
    // PriceScore = 50 + 15 * tanh(ImpactZ / 1.25)
    const priceScore = 50 + 15 * Math.tanh(impact / 1.25);

    return { impactZ: impact, priceScore, contrib };
  }

  // -----------------------------
  // 8) Heatmap rendering (canvas)
  // -----------------------------
  function drawHeatmap(canvas, features, dense) {
    const ctx = canvas.getContext("2d");
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // Layout: rows = features, cols = stats
    const cols = dense ? ["lwMean", "p05", "p50", "p95", "z"] : ["lwMean", "z"];
    const rowH = dense ? 18 : 26;
    const pad = 14;
    const colW = Math.floor((W - pad * 2) / cols.length);
    const maxRows = Math.floor((H - pad * 2) / rowH);

    const rows = features.slice(0, maxRows);

    // Determine z-range for color scaling
    const zs = rows.map((r) => r.z).filter((x) => Number.isFinite(x));
    const zMax = Math.max(1.5, ...zs.map((x) => Math.abs(x)));

    // background
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);

    // headers
    ctx.fillStyle = "#6b7280";
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";
    ctx.fillText("feature", pad, pad - 2 + 10);
    cols.forEach((c, j) => ctx.fillText(c, pad + 220 + j * colW, pad - 2 + 10));

    // rows
    ctx.font = dense ? "11px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace"
                     : "12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace";

    for (let i = 0; i < rows.length; i++) {
      const y = pad + 18 + i * rowH;

      // name
      ctx.fillStyle = "#111827";
      ctx.fillText(rows[i].name, pad, y);

      cols.forEach((c, j) => {
        const x = pad + 220 + j * colW;
        const val = rows[i][c];
        const txt = Number.isFinite(val) ? (Math.abs(val) >= 100 ? val.toFixed(0) : val.toFixed(2)) : "—";

        // color blocks on z
        if (c === "z") {
          const z = rows[i].z || 0;
          const t = clamp(z / zMax, -1, 1);

          // Red = positive (stress / bullish for many ags), Blue = negative
          // (kept simple, no custom palette dependencies)
          const r = t > 0 ? 220 : 90;
          const g = 110;
          const b = t > 0 ? 90 : 220;
          const alpha = 0.15 + 0.35 * Math.abs(t);

          ctx.fillStyle = `rgba(${r},${g},${b},${alpha})`;
          ctx.fillRect(x - 8, y - 12, colW - 6, rowH - 4);
        }

        ctx.fillStyle = "#111827";
        ctx.fillText(txt, x, y);
      });
    }
  }

  // -----------------------------
  // 9) Main compute + render
  // -----------------------------
  function noteFromScore(score) {
    if (!Number.isFinite(score)) return "—";
    if (score >= 60) return "Bullish tilt (weather tailwinds)";
    if (score <= 40) return "Bearish tilt (weather headwinds)";
    return "Neutral / mixed";
  }

  function noteFromImpact(z) {
    if (!Number.isFinite(z)) return "—";
    const a = Math.abs(z);
    if (a >= 2.0) return "Large anomaly regime";
    if (a >= 1.0) return "Meaningful anomaly regime";
    return "Low anomaly";
  }

  function modelCardText(model, horizon) {
    if (model === "ensemble") return `Ensemble model: probabilistic distribution across members; focus on P10/P50/P90 and dispersion. Horizon ${horizon}D.`;
    if (model === "seasonal") return `Seasonal/EC46: lower-frequency guidance; interpret as regime tendency rather than point forecast. Horizon ${horizon}D.`;
    if (model === "ecmwf") return `ECMWF deterministic: single best-guess path; good for coherent synoptic regimes; validate with dispersion when risk matters. Horizon ${horizon}D.`;
    return `Best-blend: Open-Meteo combines multiple national weather providers/models by location for practical forecasting. Horizon ${horizon}D.`; // :contentReference[oaicite:16]{index=16}
  }

  async function run() {
    try {
      $("cwe-tape").textContent = "Loading…";

      // UI state
      state.horizon = parseInt($("cwe-horizon").value, 10);
      state.model = $("cwe-model").value;
      state.dense = $("cwe-dense").checked;

      renderRegionTags();
      $("cwe-model-card").textContent = modelCardText(state.model, state.horizon);

      // Baselines per hub
      const hubResults = [];
      for (const hub of state.commodity.hubs) {
        // Baseline for anomalies
        const archive = await fetchArchiveBaseline(hub.lat, hub.lon);
        const archiveHourly = extractHourly(archive);
        const baselineStats = baselineFromArchive(archiveHourly || { time: [] });

        // Forecast path
        let forecastPayload;
        if (state.model === "seasonal") {
          forecastPayload = await fetchSeasonal(hub.lat, hub.lon, Math.min(state.horizon, 46));
        } else if (state.model === "ecmwf") {
          forecastPayload = await fetchForecast(hub.lat, hub.lon, Math.min(state.horizon, 16), "ecmwf");
        } else {
          forecastPayload = await fetchForecast(hub.lat, hub.lon, Math.min(state.horizon, 16), "best");
        }

        const forecastHourly = extractHourly(forecastPayload);
        const features = buildFeatureMatrix(forecastHourly, baselineStats);
        const impact = computeImpact(features, state.commodity.key);

        // Optional ensemble stats
        let ens = null;
        if (state.model === "ensemble") {
          ens = await fetchEnsemble(hub.lat, hub.lon, Math.min(state.horizon, 16));
        }

        hubResults.push({ hub, features, impact, ens });
      }

      // Combine hubs (equal weight; you can weight by production share later)
      const combined = combineHubs(hubResults);

      // Render summary
      $("cwe-impact-z").textContent = combined.impactZ.toFixed(2);
      $("cwe-impact-note").textContent = noteFromImpact(combined.impactZ);

      $("cwe-price-score").textContent = combined.priceScore.toFixed(1);
      $("cwe-price-note").textContent = noteFromScore(combined.priceScore);

      $("cwe-confidence").textContent = `${combined.confidence.toFixed(2)}x`;

      if (Number.isFinite(combined.dispersion)) {
        $("cwe-dispersion").textContent = combined.dispersion.toFixed(2);
      } else {
        $("cwe-dispersion").textContent = "—";
      }

      // Heatmap
      drawHeatmap($("cwe-heatmap"), combined.features, state.dense);

      // Top drivers
      $("cwe-top-drivers").textContent = combined.contrib.slice(0, 10).map((d, i) => {
        return `${String(i + 1).padStart(2, "0")}. ${d.name}  beta=${d.beta.toFixed(2)}  z=${d.z.toFixed(2)}  contrib=${d.contribution.toFixed(2)}  lwMean=${Number.isFinite(d.lwMean) ? d.lwMean.toFixed(2) : "—"}`;
      }).join("\n") || "—";

      // Scenarios (if ensemble)
      $("cwe-scenarios").textContent = combined.scenariosText || "—";

      // Raw tape (dense, investor-style)
      $("cwe-tape").textContent = combined.tapeText;

    } catch (err) {
      console.error(err);
      $("cwe-tape").textContent = `Error: ${err.message}`;
      $("cwe-impact-z").textContent = "—";
      $("cwe-price-score").textContent = "—";
      $("cwe-dispersion").textContent = "—";
      $("cwe-confidence").textContent = "—";
      $("cwe-top-drivers").textContent = "—";
      $("cwe-scenarios").textContent = "—";
    }
  }

  function combineHubs(hubResults) {
    // Combine feature Z’s across hubs by averaging lead-weighted Z (not raw units).
    const featureMap = new Map();

    for (const hr of hubResults) {
      for (const f of hr.features) {
        if (!featureMap.has(f.name)) featureMap.set(f.name, []);
        featureMap.get(f.name).push(f);
      }
    }

    const features = [];
    for (const [name, arr] of featureMap.entries()) {
      // combine by averaging across hubs
      const z = mean(arr.map((x) => x.z));
      const lwMean = mean(arr.map((x) => x.lwMean).filter(Number.isFinite));
      const p05 = mean(arr.map((x) => x.p05).filter(Number.isFinite));
      const p50 = mean(arr.map((x) => x.p50).filter(Number.isFinite));
      const p95 = mean(arr.map((x) => x.p95).filter(Number.isFinite));
      features.push({ name, z, lwMean, p05, p50, p95 });
    }

    // Impact using combined features:
    const impact = computeImpact(features, state.commodity.key);

    // Ensemble dispersion proxy: if ensembles exist, compute std of “temperature_2m” median path across hubs
    let dispersion = NaN;
    let scenariosText = "";
    if (state.model === "ensemble") {
      const impacts = [];

      // We approximate an ensemble distribution by mapping a few key variables into impact space.
      // Full per-member decomposition is possible once you decide which ensemble fields to prioritise.
      for (const hr of hubResults) {
        const ens = hr.ens;
        if (!ens || !ens.hourly || !ens.hourly.time) continue;

        // ensemble-api returns arrays per variable; some responses include an extra dimension (members).
        // We handle both shapes:
        const t = ens.hourly.temperature_2m;
        const p = ens.hourly.precipitation;
        if (!t) continue;

        const memberImpacts = estimateEnsembleImpactFromKeyVars(ens);
        for (const v of memberImpacts) impacts.push(v);
      }

      if (impacts.length) {
        const p10 = q(impacts, 0.10);
        const p50 = q(impacts, 0.50);
        const p90 = q(impacts, 0.90);
        dispersion = std(impacts);
        scenariosText =
          `ImpactZ P10=${p10.toFixed(2)}  P50=${p50.toFixed(2)}  P90=${p90.toFixed(2)}\n` +
          `Dispersion (std)=${dispersion.toFixed(2)}  IQR=${(q(impacts,0.75)-q(impacts,0.25)).toFixed(2)}\n` +
          `Confidence proxy = |P50| / std`;
      }
    }

    const confidence = Number.isFinite(dispersion) && dispersion > 1e-9
      ? Math.abs(impact.impactZ) / dispersion
      : 1.0;

    // Dense “tape”
    const tapeLines = [];
    tapeLines.push(`COMMODITY=${state.commodity.key}  HORIZON=${state.horizon}D  MODEL=${state.model.toUpperCase()}`);
    tapeLines.push(`IMPACT_Z=${impact.impactZ.toFixed(3)}  PRICE_SCORE=${impact.priceScore.toFixed(2)}  CONF=${confidence.toFixed(2)}x  DISP=${Number.isFinite(dispersion) ? dispersion.toFixed(3) : "NA"}`);
    tapeLines.push(`HUBS=${hubResults.map(h => h.hub.label).join(" | ")}`);
    tapeLines.push("");
    tapeLines.push("FEATURE_TAPE (lead-weighted mean | p05 p50 p95 | z):");
    const top = [...features].sort((a,b)=>Math.abs(b.z)-Math.abs(a.z)).slice(0, 28);
    for (const f of top) {
      tapeLines.push(`${f.name.padEnd(28)} lw=${fmt(f.lwMean).padStart(8)}  p05=${fmt(f.p05).padStart(8)}  p50=${fmt(f.p50).padStart(8)}  p95=${fmt(f.p95).padStart(8)}  z=${f.z.toFixed(2).padStart(6)}`);
    }

    return {
      features,
      ...impact,
      dispersion,
      confidence,
      scenariosText,
      tapeText: tapeLines.join("\n")
    };
  }

  function fmt(x) {
    if (!Number.isFinite(x)) return "—";
    const ax = Math.abs(x);
    if (ax >= 1000) return x.toFixed(0);
    if (ax >= 100) return x.toFixed(1);
    return x.toFixed(2);
  }

  function estimateEnsembleImpactFromKeyVars(ensPayload) {
    // This is intentionally “fast” and robust to shape ambiguity.
    // If Open-Meteo returns per-member arrays (e.g., temperature_2m_member_0 style),
    // you can expand this with explicit member parsing.

    const h = extractHourly(ensPayload);
    if (!h) return [];

    // Try to detect member dimension:
    // If variable is array of arrays => [member][time] or [time][member]
    const t = h.temperature_2m;
    const p = h.precipitation;
    const vpd = h.vapour_pressure_deficit;
    const et0 = h.et0_fao_evapotranspiration;

    const betas = COEFS[state.commodity.key] || DEFAULT_BETA;

    const asMemberSeries = (x) => {
      if (!Array.isArray(x)) return [];
      if (!Array.isArray(x[0])) return [x]; // single member
      // assume [member][time]
      return x;
    };

    const T = asMemberSeries(t);
    const P = asMemberSeries(p);
    const VPD = asMemberSeries(vpd);
    const ET0 = asMemberSeries(et0);

    const M = T.length || P.length || VPD.length || ET0.length;
    const impacts = [];

    for (let m = 0; m < M; m++) {
      let impact = 0;

      // We compute lead-weighted mean and then robust-normalise via within-member std as a proxy.
      // For full anomaly Z, you’d baseline each member vs archive; that’s heavier.
      const addVar = (name, seriesArr) => {
        const s = seriesArr[m];
        if (!s) return;
        const beta = betas[name];
        if (beta == null) return;

        let num = 0, den = 0;
        for (let i = 0; i < s.length; i++) {
          const w = leadWeight(i, 72);
          const x = s[i];
          if (x == null || Number.isNaN(x)) continue;
          num += w * x;
          den += w;
        }
        const lw = den ? (num / den) : NaN;
        const sigma = std(s.filter((x)=>x!=null && !Number.isNaN(x)));
        const z = sigma > 1e-9 ? (lw - mean(s)) / sigma : 0;
        impact += beta * z;
      };

      addVar("temperature_2m", T);
      addVar("precipitation", P);
      addVar("vapour_pressure_deficit", VPD);
      addVar("et0_fao_evapotranspiration", ET0);

      impacts.push(impact);
    }

    return impacts;
  }

  // -----------------------------
  // 10) Wire up events
  // -----------------------------
  function bind() {
    populateCommoditySelect();
    renderRegionTags();

    $("cwe-commodity").addEventListener("change", () => {
      const key = $("cwe-commodity").value;
      state.commodity = COMMODITIES.find((c) => c.key === key) || COMMODITIES[0];
      renderRegionTags();
      run();
    });

    $("cwe-horizon").addEventListener("change", run);
    $("cwe-model").addEventListener("change", run);
    $("cwe-dense").addEventListener("change", run);
    $("cwe-refresh").addEventListener("click", run);

    $("cwe-settings").addEventListener("click", () => {
      alert(
        "Settings (next build):\n" +
        "• Hub weights by production share\n" +
        "• Commodity-specific calibrated coefficients\n" +
        "• Full per-member ensemble decomposition\n" +
        "• Historical Forecast API backtests + stability checks"
      );
    });
  }

  // Boot
  document.addEventListener("DOMContentLoaded", () => {
    // Default commodity
    state.commodity = COMMODITIES[0];
    bind();
    run();
  });

})();
