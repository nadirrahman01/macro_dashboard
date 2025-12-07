// main.js – Cordoba Capital Macro Engine
// Uses World Bank API to pull real GDP growth & CPI inflation data

// ---------------------------
// Basic World Bank helpers
// ---------------------------

const WB_BASE = 'https://api.worldbank.org/v2/country';

// Get latest non-null observation for (country, indicator)
async function fetchWorldBankLatest(countryIso2, indicatorCode) {
  const url = `${WB_BASE}/${countryIso2}/indicator/${indicatorCode}?format=json&per_page=60`;
  const res = await fetch(url);
  const json = await res.json();
  const data = json[1];
  if (!data) return null;

  const latest = data.find(d => d.value !== null);
  if (!latest) return null;

  return {
    value: latest.value,
    year: latest.date
  };
}

// Crude classification rules for GDP growth (%)
function classifyGdpGrowth(value) {
  if (value == null || isNaN(value)) return { label: 'N/A', comment: 'No recent GDP data available.', tone: 'neutral' };

  if (value >= 4) {
    return {
      label: 'Expansion',
      comment: 'Growth is running well above trend; late-cycle dynamics and overheating risk are in play.',
      tone: 'positive'
    };
  }
  if (value >= 1) {
    return {
      label: 'Moderate',
      comment: 'Growth is positive but not overheating, broadly consistent with a mid-cycle backdrop.',
      tone: 'neutral'
    };
  }
  if (value >= -1) {
    return {
      label: 'Soft patch',
      comment: 'Growth is hovering around stall speed; macro risks are skewed to the downside.',
      tone: 'neutral'
    };
  }
  return {
    label: 'Contraction',
    comment: 'GDP is contracting; conditions are consistent with recession-type dynamics.',
    tone: 'negative'
  };
}

// Crude classification rules for CPI inflation (%)
function classifyCpi(value) {
  if (value == null || isNaN(value)) return { label: 'N/A', comment: 'No recent CPI data available.', tone: 'neutral' };

  if (value > 6) {
    return {
      label: 'Hot',
      comment: 'Inflation is running very hot; policy risk is skewed toward tighter settings and higher real rates.',
      tone: 'negative'
    };
  }
  if (value >= 3) {
    return {
      label: 'Elevated',
      comment: 'Inflation is above target but no longer accelerating; disinflation path matters for cuts timing.',
      tone: 'negative'
    };
  }
  if (value >= 1) {
    return {
      label: 'On target',
      comment: 'Inflation is roughly in line with typical targets; the policy stance drives real rate dynamics.',
      tone: 'positive'
    };
  }
  if (value > -1) {
    return {
      label: 'Low',
      comment: 'Inflation is very low; the central bank has room to ease if growth weakens.',
      tone: 'neutral'
    };
  }
  return {
    label: 'Deflation risk',
    comment: 'Negative inflation raises deflation and debt-dynamic concerns; policy may need to lean more aggressive.',
    tone: 'negative'
  };
}

// ---------------------------
// UI helpers
// ---------------------------

// Update GDP row in the Indicator Grid
function updateGdpRow(data) {
  const lastEl = document.getElementById('cc-gdp-last');
  const yearEl = document.getElementById('cc-gdp-year');
  const signalTextEl = document.getElementById('cc-gdp-signal-text');
  const commentEl = document.getElementById('cc-gdp-comment');

  const value = data ? data.value : null;
  const year = data ? data.year : null;
  const classObj = classifyGdpGrowth(value);

  if (lastEl) lastEl.textContent = value != null && !isNaN(value) ? value.toFixed(1) : '–';
  if (yearEl) yearEl.textContent = year || '–';
  if (signalTextEl) signalTextEl.textContent = classObj.label;
  if (commentEl) commentEl.textContent = classObj.comment;
}

// Update CPI row in the Indicator Grid
function updateCpiRow(data) {
  const lastEl = document.getElementById('cc-cpi-last');
  const yearEl = document.getElementById('cc-cpi-year');
  const signalTextEl = document.getElementById('cc-cpi-signal-text');
  const commentEl = document.getElementById('cc-cpi-comment');

  const value = data ? data.value : null;
  const year = data ? data.year : null;
  const classObj = classifyCpi(value);

  if (lastEl) lastEl.textContent = value != null && !isNaN(value) ? value.toFixed(1) : '–';
  if (yearEl) yearEl.textContent = year || '–';
  if (signalTextEl) signalTextEl.textContent = classObj.label;
  if (commentEl) commentEl.textContent = classObj.comment;
}

// Update all bits of text that show the country name
function updateCountryNameInUi(countryLabel) {
  const labelEls = document.querySelectorAll('[data-cc-country-label]');
  labelEls.forEach(el => (el.textContent = countryLabel));

  const regionEl = document.querySelector('[data-cc-country-region]');
  // region text is updated separately in initCountryMenu

  const signalsCountryEl = document.querySelector('[data-cc-signals-country]');
  if (signalsCountryEl) signalsCountryEl.textContent = countryLabel;
}

// ---------------------------
// Load data for one country
// ---------------------------

async function loadCountryData(countryIso2) {
  // GDP growth – NY.GDP.MKTP.KD.ZG
  try {
    const gdp = await fetchWorldBankLatest(countryIso2, 'NY.GDP.MKTP.KD.ZG');
    updateGdpRow(gdp);
  } catch (err) {
    console.error('Error fetching GDP data', err);
  }

  // CPI inflation – FP.CPI.TOTL.ZG
  try {
    const cpi = await fetchWorldBankLatest(countryIso2, 'FP.CPI.TOTL.ZG');
    updateCpiRow(cpi);
  } catch (err) {
    console.error('Error fetching CPI data', err);
  }
}

// ---------------------------
// Country dropdown + toggles
// ---------------------------

function initCountryMenu() {
  const toggleBtn = document.getElementById('cc-country-toggle');
  const menu = document.getElementById('cc-country-menu');
  if (!toggleBtn || !menu) return;

  const countryLabelSpan = toggleBtn.querySelector('[data-cc-country-label]');
  const regionSpan = toggleBtn.querySelector('[data-cc-country-region]');

  function closeMenu() {
    menu.classList.add('hidden');
  }

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    menu.classList.toggle('hidden');
  });

  // When user clicks on a country in the list
  menu.querySelectorAll('[data-cc-country]').forEach(btn => {
    btn.addEventListener('click', () => {
      const iso2 = btn.getAttribute('data-cc-country');
      const label = btn.textContent.trim();
      const region = btn.getAttribute('data-cc-region') || '';

      if (countryLabelSpan) countryLabelSpan.textContent = label;
      if (regionSpan) regionSpan.textContent = region;
      updateCountryNameInUi(label);

      closeMenu();
      loadCountryData(iso2);
    });
  });

  // Close when clicking outside
  document.addEventListener('click', () => {
    if (!menu.classList.contains('hidden')) closeMenu();
  });
}

function initLiveToggle() {
  const group = document.getElementById('cc-live-toggle-group');
  if (!group) return;

  const buttons = group.querySelectorAll('button[data-cc-live-toggle]');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-cc-live-toggle');

      buttons.forEach(b => {
        b.classList.remove('bg-cordobaGold', 'text-white');
        b.classList.add('text-cordobaMuted');
      });

      btn.classList.add('bg-cordobaGold', 'text-white');
      btn.classList.remove('text-cordobaMuted');

      // For now we don’t change data for live/snapshot – just the styling.
      console.log('Mode set to:', mode);
    });
  });
}

// ---------------------------
// Init on page load
// ---------------------------

document.addEventListener('DOMContentLoaded', () => {
  initCountryMenu();
  initLiveToggle();

  // Default: United States
  updateCountryNameInUi('United States');
  loadCountryData('US');
});
