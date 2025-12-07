const COUNTRY_MAP = {
  US: { wb: 'USA', name: 'United States', region: 'G-20 · DM' },
  GB: { wb: 'GBR', name: 'United Kingdom', region: 'G-20 · DM' },
  DE: { wb: 'DEU', name: 'Germany', region: 'G-20 · DM' },
  CN: { wb: 'CHN', name: 'China', region: 'G-20 · EM' },
  IN: { wb: 'IND', name: 'India', region: 'G-20 · EM' }
};

let currentCountryCode = 'US';

document.addEventListener('DOMContentLoaded', () => {
  setupCountryMenu();
  setupLiveToggle();
  loadCountryData('US');
});

/* ---------- UI wiring ---------- */

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

      currentCountryCode = code;

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

/* ---------- World Bank fetch ---------- */

async function fetchWorldBankSeries(countryIso3, indicator) {
  const url = `https://api.worldbank.org/v2/country/${countryIso3}/indicator/${indicator}?format=json&per_page=60`;
  const res = await fetch(url);
  const json = await res.json();
  if (!Array.isArray(json) || !Array.isArray(json[1])) {
    throw new Error('Unexpected World Bank response');
  }
  const series = json[1];
  const out = [];
  for (const obs of series) {
    if (obs && obs.value !== null) {
      out.push({ value: obs.value, year: obs.date });
    }
  }
  return out; // ordered from most recent year downwards
}

/* ---------- Indicator classifiers ---------- */

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
      comment: 'Growth is positive but not overheating; broadly consistent with a mid-cycle backdrop.'
    };
  if (g > -1)
    return {
      signal: 'Soft patch',
      comment: 'Activity is near stall-speed; growth-sensitive assets care about policy and credit conditions.'
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
      comment: 'Inflation is above target but no longer accelerating; the disinflation path shapes cut timing.'
    };
  if (infl >= 1)
    return {
      signal: 'On target',
      comment: 'Price growth is close to typical targets; policy can refocus on growth and labour-market data.'
    };
  if (infl > -1)
    return {
      signal: 'Low',
      comment: 'Inflation is subdued; prolonged weakness would eventually warrant easier policy.'
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
      comment: 'Unemployment is broadly consistent with a balanced labour market.'
    };
  if (u < 10)
    return {
      signal: 'Slack',
      comment: 'Slack is building; growth risks tilt to the downside while wage pressure fades.'
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
      comment: 'External position is in surplus; this buffers funding shocks and FX volatility.'
    };
  if (ca > -3)
    return {
      signal: 'Balanced',
      comment: 'Current account is near balance; external vulnerabilities look contained.'
    };
  if (ca > -6)
    return {
      signal: 'Deficit',
      comment: 'Moderate deficit; funding conditions and FX behaviour matter if global liquidity tightens.'
    };
  return {
    signal: 'Large deficit',
    comment: 'Large external deficit; reliant on foreign capital and more exposed to risk-off episodes.'
  };
}

function classifyMoneyGrowth(m) {
  if (m == null) return { signal: 'N/A', comment: 'No recent money-growth data available.' };
  if (m < 0)
    return {
      signal: 'Tight',
      comment: 'Broad money is contracting; liquidity is restrictive and growth-sensitive assets are vulnerable.'
    };
  if (m < 5)
    return {
      signal: 'Soft',
      comment: 'Money growth is subdued; liquidity is not a strong tailwind.'
    };
  if (m < 15)
    return {
      signal: 'Neutral',
      comment: 'Money growth is in a normal range; liquidity is supportive without being destabilising.'
    };
  return {
    signal: 'Very loose',
      comment: 'Rapid money growth; liquidity is ample but raises questions about future inflation and valuations.'
    };
}

/* ---------- Engine scoring ---------- */

function scaleTo100(x, min, max) {
  if (x == null) return null;
  const clamped = Math.max(min, Math.min(max, x));
  return ((clamped - min) / (max - min)) * 100;
}

function scoreGrowthEngine(gdp, unemp) {
  const s1 = scaleTo100(gdp, -2, 6);          // -2% -> 0, 6% -> 100
  const s2 = unemp == null ? null : 100 - scaleTo100(unemp, 3, 12); // 3% -> 100, 12% -> 0
  if (s1 == null && s2 == null) return null;
  if (s1 != null && s2 != null) return Math.round((s1 + s2) / 2);
  return Math.round(s1 != null ? s1 : s2);
}

function scoreInflationEngine(cpi) {
  if (cpi == null) return null;
  const penalty = Math.min(100, Math.abs(cpi - 2) * 12); // distance from 2% target
  return Math.max(0, Math.round(100 - penalty));
}

function scoreLiquidityEngine(money) {
  if (money == null) return null;
  const distance = Math.abs(money - 8); // around 8% feels "healthy"
  const score = Math.max(20, 100 - distance * 8);
  return Math.round(score);
}

function scoreExternalEngine(ca) {
  if (ca == null) return null;
  const penalty = Math.min(100, Math.abs(ca) * 10); // big deficits or surpluses move away from neutral
  return Math.max(0, Math.round(100 - penalty));
}

function describeGrowthRegime(score) {
  if (score == null) return 'No growth signal – data incomplete.';
  if (score >= 70) return 'Above-trend growth backdrop.';
  if (score >= 50) return 'Growth roughly in line with trend.';
  if (score >= 30) return 'Soft patch; growth is fragile.';
  return 'Recession risk dominates the growth narrative.';
}

function describeInflationRegime(score) {
  if (score == null) return 'No inflation signal – data incomplete.';
  if (score >= 70) return 'Inflation is close to a comfortable range.';
  if (score >= 50) return 'Inflation is somewhat away from target but manageable.';
  if (score >= 30) return 'Inflation is a clear policy constraint.';
  return 'Inflation dynamics are highly problematic.';
}

function describeLiquidityRegime(score) {
  if (score == null) return 'No liquidity signal – data incomplete.';
  if (score >= 70) return 'Liquidity backdrop is broadly supportive.';
  if (score >= 50) return 'Liquidity is neutral; not a major driver.';
  if (score >= 30) return 'Liquidity is a headwind for risk assets.';
  return 'Liquidity is very tight and growth-negative.';
}

function describeExternalRegime(score) {
  if (score == null) return 'No external signal – data incomplete.';
  if (score >= 70) return 'External position provides a buffer to shocks.';
  if (score >= 50) return 'External risks are contained but worth monitoring.';
  if (score >= 30) return 'External vulnerabilities are building.';
  return 'External position is a key macro fragility.';
}

/* ---------- Regime summary + risk flags ---------- */

function riskLabelFromScore(score) {
  if (score == null) return 'unknown';
  if (score >= 70) return 'low';
  if (score >= 40) return 'medium';
  return 'high';
}

function generateRegimeLabel(growthScore, inflScore, liqScore) {
  if (growthScore == null || inflScore == null) return 'Macro regime overview';

  if (growthScore >= 65 && inflScore >= 65) return 'Late-cycle expansion';
  if (growthScore >= 60 && inflScore < 60) return 'Growth-friendly disinflation';
  if (growthScore < 45 && inflScore > 60) return 'Stagflation risk';
  if (growthScore < 40 && inflScore < 55) return 'Growth slowdown';
  if (liqScore != null && liqScore < 40 && growthScore >= 55) return 'Tight-liquidity expansion';

  return 'Mixed macro signals';
}

function updateRegimeSummary(countryName, scores, values) {
  const { growth, inflation, liquidity, external } = scores;
  const { gdp, cpi, unemp, ca, money } = values;

  const titleEl = document.getElementById('cc-regime-title');
  const summaryEl = document.getElementById('cc-regime-summary');
  const confidenceEl = document.getElementById('cc-confidence');
  const riskContainer = document.getElementById('cc-risk-flags');

  const label = generateRegimeLabel(growth, inflation, liquidity);
  if (titleEl) titleEl.textContent = `${label} – ${countryName}`;

  const parts = [];

  if (growth != null && gdp != null && unemp != null) {
    parts.push(
      `Real GDP growth is around ${gdp.toFixed(1)}% with unemployment near ${unemp.toFixed(1)}%, ` +
      `giving a growth engine score of ${growth}/100.`
    );
  } else if (growth != null) {
    parts.push(`The growth engine score is ${growth}/100.`);
  }

  if (inflation != null && cpi != null) {
    parts.push(
      `Headline CPI is roughly ${cpi.toFixed(1)}% and the inflation engine scores ${inflation}/100.`
    );
  }

  if (liquidity != null && money != null) {
    parts.push(
      `Broad money growth is about ${money.toFixed(1)}%, translating into a liquidity score of ${liquidity}/100.`
    );
  }

  if (external != null && ca != null) {
    parts.push(
      `The current account stands near ${ca.toFixed(1)}% of GDP, giving an external score of ${external}/100.`
    );
  }

  if (summaryEl) {
    summaryEl.textContent =
      parts.length > 0
        ? parts.join(' ')
        : 'Not enough data yet to form a view – World Bank series are incomplete for this country.';
  }

  // Confidence = simple average of available engine scores
  const available = [growth, inflation, liquidity, external].filter(v => v != null);
  let confidence = '--';
  if (available.length > 0) {
    confidence = Math.round(
      available.reduce((a, b) => a + b, 0) / available.length
    );
  }
  if (confidenceEl) confidenceEl.textContent = confidence === '--' ? '--' : `${confidence}%`;

  // Risk flags
  if (riskContainer) {
    riskContainer.innerHTML = '';

    const flags = [];

    if (growth != null) {
      flags.push({ label: `Growth risk: ${riskLabelFromScore(growth)}` });
    }
    if (inflation != null) {
      flags.push({ label: `Inflation risk: ${riskLabelFromScore(inflation)}` });
    }
    if (liquidity != null) {
      flags.push({ label: `Liquidity risk: ${riskLabelFromScore(liquidity)}` });
    }
    if (external != null) {
      flags.push({ label: `External risk: ${riskLabelFromScore(external)}` });
    }

    if (flags.length === 0) {
      const span = document.createElement('span');
      span.className =
        'px-3 py-1 rounded-full border border-cordobaBorder bg-[#FFFCF9] text-cordobaInk text-xs';
      span.textContent = 'Not enough data to score risks yet.';
      riskContainer.appendChild(span);
    } else {
      flags.forEach(f => {
        const span = document.createElement('span');
        span.className =
          'px-3 py-1 rounded-full border border-cordobaBorder bg-[#FFFCF9] text-cordobaInk text-xs';
        span.textContent = f.label;
        riskContainer.appendChild(span);
      });
    }
  }
}

/* ---------- Utility ---------- */

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function setPillSignal(idText, label) {
  const txt = document.getElementById(idText);
  if (txt) txt.textContent = label;
}

/* ---------- Main loader ---------- */

function loadCountryData(countryIso2) {
  const cfg = COUNTRY_MAP[countryIso2];
  if (!cfg) return;
  const iso3 = cfg.wb;
  const countryName = cfg.name;

  const signalsCountry = document.querySelector('[data-cc-signals-country]');
  if (signalsCountry) signalsCountry.textContent = countryName;

  // Reset visible fields
  [
    'cc-gdp-last','cc-gdp-year','cc-cpi-last','cc-cpi-year',
    'cc-unemp-last','cc-unemp-year','cc-ca-last','cc-ca-year',
    'cc-money-last','cc-money-year'
  ].forEach(id => setText(id, '–'));

  setText('cc-gdp-comment', 'Loading from World Bank…');
  setText('cc-cpi-comment', 'Loading from World Bank…');
  setText('cc-unemp-comment', 'Loading from World Bank…');
  setText('cc-ca-comment', 'Loading from World Bank…');
  setText('cc-money-comment', 'Loading from World Bank…');

  // GDP
  const gdpPromise = fetchWorldBankSeries(iso3, 'NY.GDP.MKTP.KD.ZG')
    .then(series => {
      if (!series || series.length === 0) return null;
      const latest = series[0];
      const v = Number(latest.value.toFixed(1));
      setText('cc-gdp-last', v.toString());
      setText('cc-gdp-year', latest.year);
      const { signal, comment } = classifyGdpGrowth(v);
      setPillSignal('cc-gdp-signal-text', signal);
      setText('cc-gdp-comment', comment);
      return v;
    })
    .catch(() => {
      setText('cc-gdp-comment', 'Unable to load GDP data from World Bank.');
      return null;
    });

  // CPI
  const cpiPromise = fetchWorldBankSeries(iso3, 'FP.CPI.TOTL.ZG')
    .then(series => {
      if (!series || series.length === 0) return null;
      const latest = series[0];
      const v = Number(latest.value.toFixed(1));
      setText('cc-cpi-last', v.toString());
      setText('cc-cpi-year', latest.year);
      const { signal, comment } = classifyCpi(v);
      setPillSignal('cc-cpi-signal-text', signal);
      setText('cc-cpi-comment', comment);
      return v;
    })
    .catch(() => {
      setText('cc-cpi-comment', 'Unable to load CPI data from World Bank.');
      return null;
    });

  // Unemployment
  const unempPromise = fetchWorldBankSeries(iso3, 'SL.UEM.TOTL.ZS')
    .then(series => {
      if (!series || series.length === 0) return null;
      const latest = series[0];
      const v = Number(latest.value.toFixed(1));
      setText('cc-unemp-last', v.toString());
      setText('cc-unemp-year', latest.year);
      const { signal, comment } = classifyUnemployment(v);
      setPillSignal('cc-unemp-signal-text', signal);
      setText('cc-unemp-comment', comment);
      return v;
    })
    .catch(() => {
      setText('cc-unemp-comment', 'Unable to load unemployment data from World Bank.');
      return null;
    });

  // Current account
  const caPromise = fetchWorldBankSeries(iso3, 'BN.CAB.XOKA.GD.ZS')
    .then(series => {
      if (!series || series.length === 0) return null;
      const latest = series[0];
      const v = Number(latest.value.toFixed(1));
      setText('cc-ca-last', v.toString());
      setText('cc-ca-year', latest.year);
      const { signal, comment } = classifyCurrentAccount(v);
      setPillSignal('cc-ca-signal-text', signal);
      setText('cc-ca-comment', comment);
      return v;
    })
    .catch(() => {
      setText('cc-ca-comment', 'Unable to load current-account data from World Bank.');
      return null;
    });

  // Broad money
  const moneyPromise = fetchWorldBankSeries(iso3, 'FM.LBL.BMNY.ZG')
    .then(series => {
      if (!series || series.length === 0) return null;
      const latest = series[0];
      const v = Number(latest.value.toFixed(1));
      setText('cc-money-last', v.toString());
      setText('cc-money-year', latest.year);
      const { signal, comment } = classifyMoneyGrowth(v);
      setPillSignal('cc-money-signal-text', signal);
      setText('cc-money-comment', comment);
      return v;
    })
    .catch(() => {
      setText('cc-money-comment', 'Unable to load money-growth data from World Bank.');
      return null;
    });

  // Once all are loaded, compute engine scores + regime
  Promise.all([gdpPromise, cpiPromise, unempPromise, caPromise, moneyPromise])
    .then(([gdp, cpi, unemp, ca, money]) => {
      const growthScore = scoreGrowthEngine(gdp, unemp);
      const inflScore = scoreInflationEngine(cpi);
      const liqScore = scoreLiquidityEngine(money);
      const extScore = scoreExternalEngine(ca);

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

      updateRegimeSummary(countryName,
        {
          growth: growthScore,
          inflation: inflScore,
          liquidity: liqScore,
          external: extScore
        },
        {
          gdp, cpi, unemp, ca, money
        }
      );
    })
    .catch(err => {
      console.error('Error computing engine scores', err);
    });
}
