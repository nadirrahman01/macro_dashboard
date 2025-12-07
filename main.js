// main.js – Cordoba Capital Macro Engine
// Uses World Bank API for a small live indicator set and rolls them
// into simple Growth / Inflation / Liquidity / External engine scores.

const COUNTRY_MAP = {
  US: { wb: 'USA', name: 'United States', region: 'G-20 · DM' },
  GB: { wb: 'GBR', name: 'United Kingdom', region: 'G-20 · DM' },
  DE: { wb: 'DEU', name: 'Germany', region: 'G-20 · DM' },
  CN: { wb: 'CHN', name: 'China', region: 'G-20 · EM' },
  IN: { wb: 'IND', name: 'India', region: 'G-20 · EM' }
};

document.addEventListener('DOMContentLoaded', () => {
  setupCountryMenu();
  setupLiveToggle();
  // Default to US
  loadCountryData('US');
});

/* ---------- UI WIRING ---------- */

function setupCountryMenu() {
  const toggle = document.getElementById('cc-country-toggle');
  const menu = document.getElementById('cc-country-menu');
  if (!toggle || !menu) return;

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    menu.classList.add('hidden');
  });

  menu.querySelectorAll('[data-cc-country]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const code = btn.getAttribute('data-cc-country');
      const region = btn.getAttribute('data-cc-region') || '';
      const cfg = COUNTRY_MAP[code];
      if (!cfg) return;
      // Update labels
      document.querySelectorAll('[data-cc-country-label]').forEach(el => {
        el.textContent = cfg.name;
      });
      const regionSpan = document.querySelector('[data-cc-country-region]');
      if (regionSpan) regionSpan.textContent = region;
      const signalsCountry = document.querySelector('[data-cc-signals-country]');
      if (signalsCountry) signalsCountry.textContent = cfg.name;
      menu.classList.add('hidden');
      loadCountryData(code);
    });
  });
}

function setupLiveToggle() {
  const group = document.getElementById('cc-live-toggle-group');
  if (!group) return;
  group.querySelectorAll('[data-cc-live-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      group.querySelectorAll('[data-cc-live-toggle]').forEach(b => {
        b.classList.remove('bg-cordobaGold', 'text-white');
        b.classList.add('text-cordobaMuted');
      });
      btn.classList.add('bg-cordobaGold', 'text-white');
      btn.classList.remove('text-cordobaMuted');
    });
  });
}

/* ---------- DATA FETCH HELPERS ---------- */

async function fetchWorldBankSeries(countryIso3, indicator) {
  const url = `https://api.worldbank.org/v2/country/${countryIso3}/indicator/${indicator}?format=json&per_page=60`;
  const res = await fetch(url);
  const json = await res.json();
  if (!Array.isArray(json) || !Array.isArray(json[1])) {
    throw new Error('Unexpected World Bank response');
  }
  const series = json[1];
  for (const obs of series) {
    if (obs && obs.value !== null) {
      return {
        value: obs.value,
        year: obs.date
      };
    }
  }
  return null;
}

/* ---------- CLASSIFICATION HELPERS ---------- */

function classifyGdpGrowth(g) {
  if (g == null) return { signal: 'N/A', comment: 'No recent GDP data available.' };
  if (g >= 4)
    return {
      signal: 'Expansion',
      comment: 'Growth is running firmly above trend; late-cycle dynamics matter more than stimulus.'
    };
  if (g >= 1)
    return {
      signal: 'Moderate',
      comment: 'Growth is positive but not overheating, broadly consistent with a mid-cycle backdrop.'
    };
  if (g > -1)
    return {
      signal: 'Soft patch',
      comment: 'Activity is near stall-speed; policy and credit conditions are key to avoid a recession.'
    };
  return {
    signal: 'Contraction',
    comment: 'Output is shrinking; recession dynamics and policy support dominate the macro narrative.'
  };
}

function classifyCpi(infl) {
  if (infl == null) return { signal: 'N/A', comment: 'No recent CPI data available.' };
  if (infl > 6)
    return {
      signal: 'Hot',
      comment: 'Inflation is uncomfortably high; policy is likely to stay restrictive until the trend breaks lower.'
    };
  if (infl > 3)
    return {
      signal: 'Elevated',
      comment: 'Inflation is above target but no longer accelerating; disinflation path matters for cuts timing.'
    };
  if (infl >= 1)
    return {
      signal: 'On target',
      comment: 'Price growth is close to typical central-bank targets; policy can refocus on growth and labour market.'
    };
  if (infl > -1)
    return {
      signal: 'Low',
      comment: 'Inflation is subdued; deflation risk is limited but persistent weakness would warrant easier policy.'
    };
  return {
    signal: 'Deflation risk',
    comment: 'Negative inflation points to demand weakness; easing and fiscal support usually follow.'
  };
}

function classifyUnemployment(u) {
  if (u == null) return { signal: 'N/A', comment: 'No recent labour-market data available.' };
  if (u < 4)
    return {
      signal: 'Tight',
      comment: 'Labour market is tight; wage pressure and services inflation risk remain in focus.'
    };
  if (u < 7)
    return {
      signal: 'Balanced',
      comment: 'Unemployment is consistent with a broadly balanced labour market.'
    };
  if (u < 10)
    return {
      signal: 'Slack',
      comment: 'Slack is building; growth risks are skewed to the downside but wage pressure is limited.'
    };
  return {
    signal: 'Severe slack',
    comment: 'Very high unemployment; policy and credit conditions are likely to stay supportive.'
  };
}

function classifyCurrentAccount(ca) {
  if (ca == null) return { signal: 'N/A', comment: 'No recent external-balance data available.' };
  if (ca > 3)
    return {
      signal: 'Surplus',
      comment: 'External position is in surplus; buffer against funding shocks and FX volatility.'
    };
  if (ca > -3)
    return {
      signal: 'Balanced',
      comment: 'Current account is near balance; external vulnerabilities look contained for now.'
    };
  if (ca > -6)
    return {
      signal: 'Deficit',
      comment: 'Moderate deficit; funding conditions and FX behaviour need monitoring if global liquidity tightens.'
    };
  return {
    signal: 'Large deficit',
    comment: 'Large external deficit; reliant on foreign capital and vulnerable to risk-off episodes.'
  };
}

function classifyMoneyGrowth(m) {
  if (m == null) return { signal: 'N/A', comment: 'No recent money-growth data available.' };
  if (m < 0)
    return {
      signal: 'Tight',
      comment: 'Broad money is contracting; liquidity backdrop is restrictive and growth-sensitive assets are vulnerable.'
    };
  if (m < 5)
    return {
      signal: 'Soft',
      comment: 'Money growth is subdued; liquidity is not a strong tailwind and risk assets trade on micro and carry.'
    };
  if (m < 15)
    return {
      signal: 'Neutral',
      comment: 'Money growth is in a typical range; liquidity is supportive without being destabilising.'
    };
  return {
    signal: 'Very loose',
    comment: 'Rapid money growth; liquidity is ample but raises questions about future inflation and asset valuations.'
  };
}

/* ---------- ENGINE SCORE HELPERS ---------- */

function scaleTo100(x, min, max) {
  if (x == null) return null;
  const clamped = Math.max(min, Math.min(max, x));
  return ((clamped - min) / (max - min)) * 100;
}

function scoreGrowthEngine(gdp, unemp) {
  const s1 = scaleTo100(gdp, -2, 6); // -2% -> 0, 6% -> 100
  const s2 = unemp == null ? null : 100 - scaleTo100(unemp, 3, 12); // 3% -> 100, 12% -> 0
  if (s1 == null && s2 == null) return null;
  if (s1 != null && s2 != null) return Math.round((s1 + s2) / 2);
  return Math.round((s1 || s2));
}

function scoreInflationEngine(cpi) {
  if (cpi == null) return null;
  // Penalise distance from 2% target
  const penalty = Math.min(100, Math.abs(cpi - 2) * 12);
  return Math.max(0, Math.round(100 - penalty));
}

function scoreLiquidityEngine(money) {
  if (money == null) return null;
  // Ideal around 8%; symmetric penalty
  const distance = Math.abs(money - 8);
  const score = Math.max(20, 100 - distance * 8);
  return Math.round(score);
}

function scoreExternalEngine(ca) {
  if (ca == null) return null;
  // Balanced near 0, large deficits bad
  const penalty = Math.min(100, Math.abs(ca) * 10);
  return Math.max(0, Math.round(100 - penalty));
}

function describeGrowthRegime(score) {
  if (score == null) return 'N/A';
  if (score >= 70) return 'Above-trend growth backdrop.';
  if (score >= 50) return 'Growth roughly in line with trend.';
  if (score >= 30) return 'Soft patch; growth is fragile.';
  return 'Recession risk dominates the growth narrative.';
}

function describeInflationRegime(score) {
  if (score == null) return 'N/A';
  if (score >= 70) return 'Inflation close to a “comfortable” range.';
  if (score >= 50) return 'Inflation somewhat away from target but manageable.';
  if (score >= 30) return 'Inflation is a clear policy constraint.';
  return 'Inflation dynamics are highly problematic.';
}

function describeLiquidityRegime(score) {
  if (score == null) return 'N/A';
  if (score >= 70) return 'Liquidity backdrop is broadly supportive.';
  if (score >= 50) return 'Liquidity is neutral; not a major driver.';
  if (score >= 30) return 'Liquidity is a headwind for risk assets.';
  return 'Liquidity is very tight and growth-negative.';
}

function describeExternalRegime(score) {
  if (score == null) return 'N/A';
  if (score >= 70) return 'External position provides a buffer to shocks.';
  if (score >= 50) return 'External risks are contained but worth monitoring.';
  if (score >= 30) return 'External vulnerabilities are building.';
  return 'External position is a key macro fragility.';
}

/* ---------- MAIN COUNTRY LOAD ---------- */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setPillSignal(idText, idPill, label) {
  const txt = document.getElementById(idText);
  if (txt) txt.textContent = label;
  // You could add colour changes on idPill here later if you want.
}

function loadCountryData(countryIso2) {
  const cfg = COUNTRY_MAP[countryIso2];
  if (!cfg) return;
  const iso3 = cfg.wb;

  // Reset basic labels
  const signalsCountry = document.querySelector('[data-cc-signals-country]');
  if (signalsCountry) signalsCountry.textContent = cfg.name;

  // Show placeholders while loading
  ['cc-gdp-last','cc-gdp-year','cc-cpi-last','cc-cpi-year',
   'cc-unemp-last','cc-unemp-year','cc-ca-last','cc-ca-year',
   'cc-money-last','cc-money-year'].forEach(id => setText(id, '–'));

  // GDP
  const gdpPromise = fetchWorldBankSeries(iso3, 'NY.GDP.MKTP.KD.ZG')
    .then(data => {
      if (!data) return null;
      const v = Number(data.value.toFixed(1));
      setText('cc-gdp-last', v.toString());
      setText('cc-gdp-year', data.year);
      const { signal, comment } = classifyGdpGrowth(v);
      setPillSignal('cc-gdp-signal-text', 'cc-gdp-signal-pill', signal);
      setText('cc-gdp-comment', comment);
      return { value: v, year: data.year };
    })
    .catch(() => {
      setText('cc-gdp-comment', 'Unable to load GDP data from World Bank.');
      return null;
    });

  // CPI
  const cpiPromise = fetchWorldBankSeries(iso3, 'FP.CPI.TOTL.ZG')
    .then(data => {
      if (!data) return null;
      const v = Number(data.value.toFixed(1));
      setText('cc-cpi-last', v.toString());
      setText('cc-cpi-year', data.year);
      const { signal, comment } = classifyCpi(v);
      setPillSignal('cc-cpi-signal-text', 'cc-cpi-signal-pill', signal);
      setText('cc-cpi-comment', comment);
      return { value: v, year: data.year };
    })
    .catch(() => {
      setText('cc-cpi-comment', 'Unable to load CPI data from World Bank.');
      return null;
    });

  // Unemployment
  const unempPromise = fetchWorldBankSeries(iso3, 'SL.UEM.TOTL.ZS')
    .then(data => {
      if (!data) return null;
      const v = Number(data.value.toFixed(1));
      setText('cc-unemp-last', v.toString());
      setText('cc-unemp-year', data.year);
      const { signal, comment } = classifyUnemployment(v);
      setPillSignal('cc-unemp-signal-text', 'cc-unemp-signal-pill', signal);
      setText('cc-unemp-comment', comment);
      return { value: v, year: data.year };
    })
    .catch(() => {
      setText('cc-unemp-comment', 'Unable to load unemployment data from World Bank.');
      return null;
    });

  // Current account balance
  const caPromise = fetchWorldBankSeries(iso3, 'BN.CAB.XOKA.GD.ZS')
    .then(data => {
      if (!data) return null;
      const v = Number(data.value.toFixed(1));
      setText('cc-ca-last', v.toString());
      setText('cc-ca-year', data.year);
      const { signal, comment } = classifyCurrentAccount(v);
      setPillSignal('cc-ca-signal-text', 'cc-ca-signal-pill', signal);
      setText('cc-ca-comment', comment);
      return { value: v, year: data.year };
    })
    .catch(() => {
      setText('cc-ca-comment', 'Unable to load current-account data from World Bank.');
      return null;
    });

  // Broad money growth
  const moneyPromise = fetchWorldBankSeries(iso3, 'FM.LBL.BMNY.ZG')
    .then(data => {
      if (!data) return null;
      const v = Number(data.value.toFixed(1));
      setText('cc-money-last', v.toString());
      setText('cc-money-year', data.year);
      const { signal, comment } = classifyMoneyGrowth(v);
      setPillSignal('cc-money-signal-text', 'cc-money-signal-pill', signal);
      setText('cc-money-comment', comment);
      return { value: v, year: data.year };
    })
    .catch(() => {
      setText('cc-money-comment', 'Unable to load money-growth data from World Bank.');
      return null;
    });

  // Once all are in, update the 4 engine scorecards
  Promise.all([gdpPromise, cpiPromise, unempPromise, caPromise, moneyPromise])
    .then(([gdp, cpi, unemp, ca, money]) => {
      const gdpVal = gdp && gdp.value;
      const cpiVal = cpi && cpi.value;
      const unempVal = unemp && unemp.value;
      const caVal = ca && ca.value;
      const moneyVal = money && money.value;

      const growthScore = scoreGrowthEngine(gdpVal, unempVal);
      const inflScore = scoreInflationEngine(cpiVal);
      const liqScore = scoreLiquidityEngine(moneyVal);
      const extScore = scoreExternalEngine(caVal);

      if (growthScore != null) setText('cc-growth-score', growthScore.toString());
      else setText('cc-growth-score', '--');
      setText('cc-growth-regime', describeGrowthRegime(growthScore));

      if (inflScore != null) setText('cc-inflation-score', inflScore.toString());
      else setText('cc-inflation-score', '--');
      setText('cc-inflation-regime', describeInflationRegime(inflScore));

      if (liqScore != null) setText('cc-liquidity-score', liqScore.toString());
      else setText('cc-liquidity-score', '--');
      setText('cc-liquidity-regime', describeLiquidityRegime(liqScore));

      if (extScore != null) setText('cc-external-score', extScore.toString());
      else setText('cc-external-score', '--');
      setText('cc-external-regime', describeExternalRegime(extScore));
    })
    .catch(err => {
      console.error('Error computing engine scores', err);
    });
}
