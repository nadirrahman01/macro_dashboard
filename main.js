<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Cordoba Capital – Global Macro Engine</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />

  <!-- Tailwind (CDN for prototype) -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          colors: {
            cordobaGold: '#9A690F',
            cordobaAccent: '#FFF7F0',
            cordobaSoft: '#FFFCF9'
          },
          fontFamily: {
            heading: ['"Times New Roman"', 'serif'],
            body: ['"Helvetica Neue"', 'system-ui', 'sans-serif']
          }
        }
      }
    }
  </script>

  <link rel="stylesheet" href="assets/style.css">
</head>
<body class="bg-cordobaSoft text-neutral-900 font-body">

  <div class="min-h-screen flex flex-col">

    <!-- Header -->
    <header class="border-b border-neutral-200 bg-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
        <div class="flex items-center gap-3">
          <div class="flex flex-col">
            <span class="font-heading text-2xl sm:text-3xl leading-tight">Cordoba Capital</span>
            <span class="tracking-[0.2em] text-xs text-neutral-500 uppercase">Macro Engine</span>
          </div>
        </div>

        <div class="hidden md:flex items-center gap-4 text-xs text-neutral-500">
          <span class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-300 bg-emerald-50">
            <span class="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            Live signals
          </span>
          <span class="text-neutral-400">
            Prototype – values from World Bank database (annual, latest available)
          </span>
        </div>
      </div>
    </header>

    <!-- Main layout -->
    <div class="flex-1 flex">

      <!-- Sidebar -->
      <aside class="hidden md:flex flex-col w-56 border-r border-neutral-200 bg-white">
        <div class="px-4 py-4">
          <div class="text-xs font-semibold tracking-[0.25em] uppercase text-neutral-500 mb-3">
            Dashboard
          </div>
          <nav class="space-y-1 text-sm">
            <button class="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-neutral-900 text-white">
              <span>Overview</span>
              <span class="text-[10px] uppercase text-neutral-300">Live</span>
            </button>
            <button class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-neutral-600 hover:bg-cordobaSoft">
              <span>Growth Cycle</span>
            </button>
            <button class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-neutral-600 hover:bg-cordobaSoft">
              <span>Inflation &amp; Prices</span>
            </button>
            <button class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-neutral-600 hover:bg-cordobaSoft">
              <span>Liquidity &amp; Credit</span>
            </button>
            <button class="w-full flex items-center justify-between px-3 py-2 rounded-lg text-neutral-600 hover:bg-cordobaSoft">
              <span>External Balance</span>
            </button>
          </nav>
        </div>

        <div class="mt-auto px-4 py-4 border-t border-neutral-200 text-[11px] text-neutral-500">
          <div class="flex items-center justify-between mb-1">
            <span>Data as of</span>
            <span id="cc-data-as-of" class="text-neutral-800">–</span>
          </div>
          <p class="leading-snug">
            World Bank World Development Indicators. Internal research tool for educational use by Cordoba Capital.
          </p>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 bg-cordobaSoft">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

          <!-- Top controls -->
          <section class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <!-- Country selection -->
            <div class="flex flex-wrap items-center gap-4">
              <div>
                <div class="text-[11px] tracking-[0.25em] uppercase text-neutral-500">
                  Country Selection
                </div>
                <div class="mt-1 flex items-center gap-2">
                  <div class="relative">
                    <button
                      id="cc-country-toggle"
                      type="button"
                      class="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-neutral-300 bg-white hover:border-cordobaGold text-sm"
                    >
                      <span class="h-2 w-2 rounded-full bg-emerald-500" id="cc-country-dot"></span>
                      <span id="cc-country-label" class="font-medium">United States</span>
                      <span id="cc-country-region" class="text-xs text-neutral-500">G-20 · DM</span>
                      <span class="text-[10px] text-neutral-400">▼</span>
                    </button>

                    <!-- Dropdown -->
                    <div
                      id="cc-country-menu"
                      class="hidden absolute z-20 mt-1 w-56 rounded-xl border border-neutral-200 bg-white shadow-lg text-sm"
                    >
                      <div class="px-3 py-2 text-[10px] uppercase tracking-[0.22em] text-neutral-500">
                        G-20 countries
                      </div>
                      <div class="max-h-64 overflow-y-auto">
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="US" data-cc-region="G-20 · DM">
                          United States
                        </button>
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="GB" data-cc-region="G-20 · DM">
                          United Kingdom
                        </button>
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="DE" data-cc-region="G-20 · DM">
                          Germany
                        </button>
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="FR" data-cc-region="G-20 · DM">
                          France
                        </button>
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="JP" data-cc-region="G-20 · DM">
                          Japan
                        </button>
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="CN" data-cc-region="G-20 · EM">
                          China
                        </button>
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="IN" data-cc-region="G-20 · EM">
                          India
                        </button>
                        <button class="w-full px-3 py-1.5 text-left hover:bg-cordobaSoft" data-cc-country="BR" data-cc-region="G-20 · EM">
                          Brazil
                        </button>
                      </div>
                    </div>
                  </div>

                  <div class="hidden sm:flex items-center text-xs text-neutral-500 gap-2">
                    <span>Benchmark:</span>
                    <span class="px-2 py-0.5 rounded-full border border-neutral-300 text-neutral-700">World</span>
                    <span class="px-2 py-0.5 rounded-full border border-neutral-300 text-neutral-700">DM</span>
                    <span class="px-2 py-0.5 rounded-full border border-neutral-300 text-neutral-700">EM</span>
                  </div>
                </div>
              </div>

              <!-- Live / snapshot toggle -->
              <div class="flex items-center gap-2 text-xs">
                <div id="cc-live-toggle-group" class="inline-flex items-center rounded-full border border-neutral-300 bg-white p-0.5">
                  <button
                    data-cc-live-toggle="live"
                    type="button"
                    class="px-3 py-1 rounded-full bg-cordobaGold text-white font-medium"
                  >
                    Live
                  </button>
                  <button
                    data-cc-live-toggle="snapshot"
                    type="button"
                    class="px-3 py-1 rounded-full text-neutral-500 hover:text-neutral-900"
                  >
                    Snapshot
                  </button>
                </div>
              </div>
            </div>

            <!-- Search stub -->
            <div class="flex items-center gap-3 text-xs">
              <div class="relative w-64 max-w-full">
                <input
                  class="w-full rounded-full border border-neutral-300 bg-white px-8 py-1.5 text-xs placeholder:text-neutral-400 focus:outline-none focus:border-cordobaGold"
                  placeholder="Search country, indicator, or note (UI only for now)…"
                  type="text"
                />
                <span class="absolute left-3 top-1.5 text-neutral-400">⌕</span>
              </div>
            </div>
          </section>

          <!-- Macro regime + key inflections -->
          <section class="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <!-- Regime summary -->
            <article class="bg-white border border-neutral-200 rounded-3xl px-5 sm:px-6 py-5 shadow-sm">
              <div class="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div class="text-[11px] tracking-[0.25em] uppercase text-neutral-500 mb-2">
                    Macro Regime Summary
                  </div>
                  <h2 id="cc-regime-title" class="font-heading text-2xl sm:text-3xl leading-snug">
                    Loading…
                  </h2>
                </div>
                <div class="text-right text-xs text-neutral-500">
                  <div>Confidence:</div>
                  <div id="cc-regime-confidence" class="text-cordobaGold font-semibold">–</div>
                </div>
              </div>

              <p id="cc-regime-body" class="text-sm leading-relaxed text-neutral-700">
                Loading macro description…
              </p>

              <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <div class="mb-1 font-semibold tracking-[0.18em] uppercase text-neutral-500">
                    Historical analogues
                  </div>
                  <div id="cc-analogue-years" class="flex flex-wrap gap-2">
                    <!-- Filled by JS -->
                  </div>
                </div>
                <div>
                  <div class="mb-1 font-semibold tracking-[0.18em] uppercase text-neutral-500">
                    Risk flags
                  </div>
                  <div id="cc-risk-flags" class="flex flex-wrap gap-2">
                    <!-- Filled by JS -->
                  </div>
                </div>
              </div>
            </article>

            <!-- Key inflection signals -->
            <article class="bg-white border border-neutral-200 rounded-3xl px-5 sm:px-6 py-5 shadow-sm">
              <div class="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div class="text-[11px] tracking-[0.25em] uppercase text-neutral-500 mb-1">
                    What changed in latest data
                  </div>
                  <h3 class="font-heading text-xl leading-snug">
                    Key inflection signals
                  </h3>
                </div>
              </div>

              <div id="cc-inflection-list" class="space-y-3 text-sm">
                <!-- Filled by JS -->
                <p class="text-neutral-500 text-xs">Loading signals from latest releases…</p>
              </div>
            </article>
          </section>

          <!-- Engine snapshot row -->
          <section class="bg-white border border-neutral-200 rounded-3xl px-4 sm:px-5 py-4 shadow-sm">
            <div class="flex items-center justify-between mb-3">
              <div>
                <div class="text-[11px] tracking-[0.25em] uppercase text-neutral-500">
                  Macro snapshot
                </div>
                <p class="text-xs text-neutral-500">
                  Scores are based on z-scores vs the country’s own 10-year history.
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3" id="cc-engine-cards">
              <!-- Cards filled by JS -->
            </div>
          </section>

          <!-- Indicator grid -->
          <section class="bg-white border border-neutral-200 rounded-3xl px-4 sm:px-5 py-4 shadow-sm">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
              <div>
                <div class="text-[11px] tracking-[0.25em] uppercase text-neutral-500">
                  Indicator grid
                </div>
                <div class="text-sm">
                  Key signals – <span id="cc-signals-country">United States</span>
                </div>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <button
                  id="cc-filter-all"
                  class="px-2.5 py-1 rounded-full border border-neutral-300 bg-cordobaSoft text-neutral-900"
                >
                  All engines
                </button>
                <button
                  id="cc-filter-top"
                  class="px-2.5 py-1 rounded-full border border-neutral-200 bg-white text-neutral-600 hover:border-cordobaGold"
                >
                  Only strongest signals
                </button>
              </div>
            </div>

            <div class="overflow-x-auto text-xs">
              <table class="min-w-full border-t border-neutral-200">
                <thead class="bg-cordobaSoft">
                  <tr class="text-[11px] tracking-[0.18em] uppercase text-neutral-500">
                    <th class="py-2 pr-3 text-left font-normal">Indicator</th>
                    <th class="py-2 pr-3 text-left font-normal">Engine</th>
                    <th class="py-2 pr-3 text-left font-normal">Bucket</th>
                    <th class="py-2 pr-3 text-left font-normal">Signal</th>
                    <th class="py-2 pr-3 text-right font-normal">Last</th>
                    <th class="py-2 pr-3 text-right font-normal">z-score</th>
                    <th class="py-2 pr-3 text-left font-normal">Comment</th>
                  </tr>
                </thead>
                <tbody id="cc-indicator-rows" class="divide-y divide-neutral-100">
                  <!-- JS rows -->
                  <tr>
                    <td colspan="7" class="py-3 text-center text-neutral-400">
                      Loading indicators…
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <!-- Latest Cordoba research row -->
          <section class="bg-white border border-neutral-200 rounded-3xl px-4 sm:px-5 py-4 shadow-sm">
            <div class="flex items-center justify-between mb-4">
              <div>
                <div class="text-[11px] tracking-[0.25em] uppercase text-neutral-500">
                  Cordoba Capital – latest notes
                </div>
                <div class="text-sm text-neutral-600">
                  Recent research from the main site (static links for now).
                </div>
              </div>
              <a
                href="https://cordobacapital.co.uk/"
                target="_blank"
                class="text-xs text-cordobaGold underline underline-offset-2 hover:text-neutral-900"
              >
                View all research
              </a>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <article class="border border-neutral-200 rounded-2xl overflow-hidden bg-cordobaSoft">
                <div class="aspect-[4/3] bg-neutral-200">
                  <!-- image left blank; this is just a frame -->
                </div>
                <div class="px-4 py-3 space-y-2">
                  <span class="inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] rounded-full bg-cordobaGold text-white">
                    Macro research
                  </span>
                  <h3 class="font-heading text-lg leading-snug">
                    Will Morocco Be at the Forefront of North Africa’s Green Industrial Take-Off?
                  </h3>
                  <p class="text-xs text-neutral-500">
                    Jibraan Manuel Mohammed · 4 Dec 2025
                  </p>
                  <a
                    href="https://cordobacapital.co.uk/will-morocco-be-at-the-forefront-of-north-africas-green-industrial-take-off/"
                    target="_blank"
                    class="inline-flex mt-1 text-xs px-3 py-1 rounded-full border border-cordobaGold text-cordobaGold hover:bg-cordobaGold hover:text-white"
                  >
                    Read note
                  </a>
                </div>
              </article>

              <article class="border border-neutral-200 rounded-2xl overflow-hidden bg-cordobaSoft">
                <div class="aspect-[4/3] bg-neutral-200"></div>
                <div class="px-4 py-3 space-y-2">
                  <span class="inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] rounded-full bg-cordobaGold text-white">
                    Equity research
                  </span>
                  <h3 class="font-heading text-lg leading-snug">
                    The Next Frontier of Global BPO: The Philippines
                  </h3>
                  <p class="text-xs text-neutral-500">
                    Alessandra Bianchi · 2 Dec 2025
                  </p>
                  <a
                    href="https://cordobacapital.co.uk/the-next-frontier-of-global-bpo-the-philippines/"
                    target="_blank"
                    class="inline-flex mt-1 text-xs px-3 py-1 rounded-full border border-cordobaGold text-cordobaGold hover:bg-cordobaGold hover:text-white"
                  >
                    Read note
                  </a>
                </div>
              </article>

              <article class="border border-neutral-200 rounded-2xl overflow-hidden bg-cordobaSoft">
                <div class="aspect-[4/3] bg-neutral-200"></div>
                <div class="px-4 py-3 space-y-2">
                  <span class="inline-flex px-2 py-0.5 text-[11px] uppercase tracking-[0.18em] rounded-full bg-cordobaGold text-white">
                    Macro research
                  </span>
                  <h3 class="font-heading text-lg leading-snug">
                    Central Asian Labour Market: Long-Term Outlook
                  </h3>
                  <p class="text-xs text-neutral-500">
                    Tim Safin · 25 Nov 2025
                  </p>
                  <a
                    href="https://cordobacapital.co.uk/central-asian-labour-market-long-term-outlook/"
                    target="_blank"
                    class="inline-flex mt-1 text-xs px-3 py-1 rounded-full border border-cordobaGold text-cordobaGold hover:bg-cordobaGold hover:text-white"
                  >
                    Read note
                  </a>
                </div>
              </article>
            </div>
          </section>

        </div>
      </main>
    </div>
  </div>

  <script src="main.js"></script>
</body>
</html>
