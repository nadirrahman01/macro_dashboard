// Cordoba Capital – Macro Dashboard UI Logic
// =========================================

document.addEventListener("DOMContentLoaded", () => {
  setupCountryDropdown();
  setupLiveToggle();
  setupChartTabs();
});

// ---------------------------
// Country dropdown behaviour
// ---------------------------
function setupCountryDropdown() {
  const toggle = document.getElementById("cc-country-toggle");
  const menu = document.getElementById("cc-country-menu");
  const dot = document.getElementById("cc-country-dot");
  const labelEl = document.querySelector("[data-cc-country-label]");
  const regionEl = document.querySelector("[data-cc-country-region]");
  const signalsCountryEl = document.querySelector("[data-cc-signals-country]");
  const optionButtons = menu ? menu.querySelectorAll("[data-cc-country]") : [];

  if (!toggle || !menu || !labelEl || !regionEl || !signalsCountryEl) return;

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
      const regionText = btn.getAttribute("data-cc-region") || "";
      const countryName = btn.textContent.trim();

      // Update labels
      labelEl.textContent = countryName;
      regionEl.textContent = regionText;
      signalsCountryEl.textContent = countryName;

      // Simple DM/EM colouring for the status dot
      if (regionText.includes("EM")) {
        dot.classList.remove("bg-emerald-400");
        dot.classList.add("bg-amber-400");
      } else {
        dot.classList.remove("bg-amber-400");
        dot.classList.add("bg-emerald-400");
      }

      // In future we can hook here to update engine scores / signals based on countryCode
      // e.g. fetch(`/data/${countryCode}.json`).then(...)

      menu.classList.add("hidden");
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

      // Later: adjust behaviour depending on mode (e.g. freeze values for snapshot)
      // For now this is just a visual toggle.
      console.log(`Live mode set to: ${mode}`);
    });
  });
}

// ---------------------------
// Chart tab switching
// ---------------------------
function setupChartTabs() {
  const tabButtons = document.querySelectorAll("[data-cc-chart-tab]");
  const placeholder = document.getElementById("cc-chart-placeholder");

  if (!tabButtons.length || !placeholder) return;

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = btn.getAttribute("data-cc-chart-tab");

      // Reset all tabs to "inactive"
      tabButtons.forEach((b) => {
        b.classList.remove("border-cordobaGold", "bg-cordobaGold/80", "text-slate-950");
        b.classList.add("border-slate-700", "text-slate-400");
      });

      // Activate current
      btn.classList.add("border-cordobaGold", "bg-cordobaGold/80", "text-slate-950");
      btn.classList.remove("border-slate-700", "text-slate-400");

      // Update placeholder text to reflect selected mode
      const span = placeholder.querySelector("span") || placeholder;
      if (mode === "level") {
        span.textContent = "Chart placeholder – showing Level view. Plug in growth composite level series here.";
      } else if (mode === "zscore") {
        span.textContent = "Chart placeholder – showing z-Score view. Plug in standardised growth cycle signal here.";
      } else if (mode === "components") {
        span.textContent = "Chart placeholder – showing Components view. Plug in leading / coincident / lagging contributions here.";
      }

      // Later: switch actual chart dataset based on `mode`
      console.log(`Chart mode set to: ${mode}`);
    });
  });
}
