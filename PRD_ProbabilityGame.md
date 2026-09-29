# Product Requirements Document (PRD)
## Probability Playground — Web Version

---

### 1. Product Overview

**Product Name:** Probability Playground  
**Platform:** Web (responsive, mobile-first, PWA)  
**Target Audience:** Ages 10+ (students, young investors, curious learners)  
**Core Purpose:** Teach probability, expected value, volatility, and CAGR through interactive simulation  
**Educational Goal:** Build intuition for how random returns compound over time — why "average return" ≠ "typical outcome"

---

### 2. Target Audience & Personas

| Persona | Age | Goals | Pain Points |
|---------|-----|-------|-------------|
| **Curious Kid** | 10-14 | Understand "investing" simply; see numbers move | Math anxiety; abstract formulas |
| **Student** | 15-18 | Learn CAGR, volatility, compounding for class/project | Textbooks are dry; no visual intuition |
| **Young Adult** | 19-25 | Intuition for real investing; compare strategies | Overwhelmed by jargon; fear of losses |
| **Teacher/Parent** | 30+ | Demo tool for classroom/home | Needs zero-setup, works on any device |

### 2.1 Accessibility (WCAG 2.1 AA)

| Requirement | Implementation |
|-------------|----------------|
| **Contrast** | 4.5:1 minimum for text (3:1 for large text); high-contrast mode toggle (`--contrast: high` CSS variable) |
| **Keyboard** | All interactive elements reachable via `Tab`; `ArrowUp`/`ArrowDown`/`w`/`s` for Up/Down; `Enter`/`Space` activates buttons; focus visible (`:focus-visible` outline) |
| **Screen Readers** | `role="status" aria-live="polite"` on stats bar; `aria-label` on icon-only buttons; chart has hidden `<table>` fallback with iteration/value/choice columns; `aria-describedby` links stats to explanations |
| **Motion** | `prefers-reduced-motion` respected: transitions disabled, chart animates instantly |
| **Zoom** | Layout functional at 200% zoom; no horizontal scroll; touch targets ≥ 48×48 px |
| **Language** | `lang="en"` on `<html>`; `lang` on any localized strings; simple, jargon-free copy |
| **Error Prevention** | Reset requires confirmation; seed input validates integer range; export/import validates JSON schema |

---

### 3. Core Game Mechanics

#### 3.1 State Variables

| Variable | Type | Initial | Description |
|----------|------|---------|-------------|
| `v` | float | 100.0 | Current portfolio value |
| `iteration` | int | 0 | Current year (1–25,000) |
| `history` | float[] | [100] | Full value history for graphing |
| `choices` | string[] | [] | "U" or "D" per iteration |
| `randomDraws` | float[] | [] | The `r` values drawn each year |
| `seed` | number/null | null | RNG seed for reproducibility |
| `meanReturn` | float | 0 | Average return % (configurable) |
| `volatility` | float | 25 | 95% range % (configurable) |

#### 3.2 Random Draw

- Distribution: Normal (Gaussian) with configurable μ (meanReturn) and σ (volatility / 1.96)
- Clamped: ±3σ from mean
- Seed: Optional user-provided seed for reproducibility (teaching tool)

#### 3.3 Update Rules

```
UP:    v_new = v * (1 + r/100)
DOWN:  v_new = v * (1 - r/100)
```

- Intuition: "Up" bets *with* the draw; "Down" bets *against* it.
- Expected value of each step = v (fair game), but **volatility drag** makes geometric mean < arithmetic mean.

#### 3.4 CAGR Calculation

```
n = iteration count
CAGR = (v_final / 100)^(1/n) - 1
```

- Displayed as percentage with 2 decimal places.
- Also show: **Arithmetic Mean Return** = mean(r_i * direction_i) for comparison.

#### 3.5 Termination Conditions

- User presses **Reset**
- Iteration reaches **25,000**
- Value `v` ≤ 0.01 (effectively ruined) — "Game Over" state

---

### 4. User Interface Requirements

#### 4.1 Layout (Mobile-First, Responsive)

**Mobile (stacked):**
```
┌─────────────────────────────────────┐
│  Header: Title + Theme Toggle       │
├─────────────────────────────────────┤
│  Stats Bar: v | Iteration | CAGR    │
├─────────────────────────────────────┤
│  Chart Area (Canvas)                │
│  - X: Iteration                     │
│  - Y: Value (linear scale default)  │
│  - Line: Portfolio history          │
│  - Reference: Starting value (100)  │
├─────────────────────────────────────┤
│  History Table (Last 5 / Expand All)│
│  - Year | r (%) | Return (%) | Choice│
│  - Expand button for full history   │
├─────────────────────────────────────┤
│  Controls:                          │
│  [↑ Up]     [↓ Down]                │
│  [Reset]                            │
├─────────────────────────────────────┤
│  Seed Info Panel (collapsible)      │
│  - Seed input                       │
│  - Return params (mean, vol)        │
│  - Apply & Reset button             │
├─────────────────────────────────────┤
│  Learn Panel (collapsible)          │
├─────────────────────────────────────┤
│  Footer                             │
└─────────────────────────────────────┘
```

**Desktop (≥900px, tiled):**
```
┌─────────────────────────────────────┬──────────────────────┐
│                                     │  History Sidebar     │
│  Chart Area (main)                  │  - Last 5 entries    │
│  - Rolling 20-year window           │  - "Show All" expand │
│  - Zoom out button                  │  - Sticky positioned │
│  - Data labels at first/last point  │                      │
│  - Circles at data points           │                      │
│  - Current value marker             │                      │
│                                     │                      │
├─────────────────────────────────────┴──────────────────────┤
│  Stats Bar | Controls | Seed Info Panel                    │
└──────────────────────────────────────────────────────────────┘
```

#### 4.2 Theme System

- **Light Mode:** Clean white background, dark text, blue accent
- **Dark Mode:** Dark gray (#1e1e1e), light text, teal accent
- **Persistence:** `localStorage` key `theme` ('light'|'dark'|'system')
- **CSS Variables:** All colors via `--color-*` tokens
- **Chart auto-updates** on theme change (CSS variable resolution)

#### 4.3 Chart Requirements

- **Library:** Custom Canvas 2D (no dependencies, ~2 KB)
- **Scale:** Linear scale default (log scale removed per UX decision)
- **Rolling Window:** Shows last 20 iterations by default
- **Zoom Out:** Button to show full history
- **Annotations:**
  - Data labels at first and last visible points (top-right of point)
  - Circles at each data point
  - Current value marker (prominent ring)
  - Reference line at 100 (dashed)
  - Future preview (faint dashed) when < 20 iterations
- **Y-axis:** ±5% padding, snapped to multiples of 5, max 6 tics
- **X-axis:** 8% padding beyond data range for label clearance
- **Responsive:** ResizeObserver with debounce
- **Theme-aware:** Re-resolves CSS variables on theme change

#### 4.4 Controls

| Control | Behavior |
|---------|----------|
| **Up Button** | Large touch target (≥48px); keyboard `ArrowUp` / `w` |
| **Down Button** | Large touch target; keyboard `ArrowDown` / `s` |
| **Reset** | Confirm dialog; clears all state, preserves settings |
| **Seed Input** | Optional number field (0–4,294,967,295) |
| **Return Params** | Hidden behind "About Seed & Returns" info button: Average Return (%), Volatility (%) with Apply & Reset |

#### 4.5 History Table

- **Default View:** Last 5 iterations (most recent first)
- **Columns:** Year | r (%) | Return (%) | Choice (↑ Up / ↓ Down)
- **Color Coding:** Returns green/red; Choices green/red
- **Expand Button:** "Show All" / "Show Less" toggles full history
- **Expanded View:** All iterations with scrollable container (max-height 400px)
- **Sticky Header:** Column headers remain visible when scrolling

#### 4.6 Educational Overlay (Progressive Disclosure)

- **Tooltip "i" icons** next to CAGR, volatility
- **"Learn" panel** (collapsible): 3-slide carousel:
  1. "Why does average return ≠ your return?"
  2. "Volatility drag explained"
  3. "Try: always Up vs always Down vs random"
- **Seed Info Panel** (hidden by default, accessible via info button):
  - What is the random seed?
  - Why it matters for strategy comparison
  - Return distribution parameters (mean, volatility)

---

### 5. Technical Architecture

#### 5.1 Stack (Zero-Build, Deploy Anywhere)

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **HTML/CSS/JS** | Vanilla ES modules | No build step; works on GitHub Pages, Netlify, Vercel |
| **Charting** | Custom Canvas 2D | No deps, tiny, full control, 60fps |
| **Random** | mulberry32 + Box-Muller | Seedable, deterministic, no deps |
| **State** | Single `GameState` object | Simple, serializable, testable |
| **Persistence** | `localStorage` + export/import JSON + shareable URL | Survives refresh; portable |

#### 5.2 File Structure

```
/probability-game/
├── index.html          # Entry point
├── manifest.json       # PWA support
├── sw.js               # Service worker (v7, network-only for JS)
├── css/
│   ├── variables.css   # Theme tokens
│   ├── layout.css      # Grid/flex layout (tiled desktop)
│   ├── components.css  # Buttons, stats, chart, seed panel
│   └── themes.css      # Light/dark/high-contrast overrides
├── js/
│   ├── app.js          # Bootstraps everything (with error logging)
│   ├── random.js       # Seeded RNG + Box-Muller + return sampler
│   ├── state.js        # GameState + persistence + export/import
│   ├── engine.js       # Step logic, CAGR, statistics
│   ├── chart.js        # Canvas chart (rolling window, zoom, data labels)
│   └── ui.js           # DOM binding, events, theme, render
└── assets/
    └── favicon.svg
```

#### 5.3 PWA Features

- **Manifest:** `display: standalone`, icons 192/512
- **Service Worker (v7):** Cache-first for static assets; **network-only for JS modules** (always fresh)
- **Install Prompt:** Native browser prompt
- **Offline:** Works fully after first visit

---

### 6. Data Schema

*See DATA_SCHEMA_ProbabilityGame.md for full specification*

---

### 7. Key Algorithms

#### 7.1 Seeded RNG (mulberry32)

```javascript
function mulberry32(a) {
  return function() {
    let t = (a += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

#### 7.2 Normal Sample (Box-Muller, Clamped)

```javascript
function sampleNormal(rng, mean = 0, std = 1, min = -Infinity, max = Infinity) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(min, Math.min(max, mean + z * std));
}
```

#### 7.3 Return Sampler (Configurable)

```javascript
function createReturnSampler(meanReturn = 0, volatility = 25) {
  const std = volatility / 1.96;  // 95% range = ±1.96σ
  const clampMin = meanReturn - 3 * std;
  const clampMax = meanReturn + 3 * std;
  return (rng) => sampleNormal(rng, meanReturn, std, clampMin, clampMax);
}
```

#### 7.4 Step Function (Pure, Testable)

```javascript
function step(state, rng, choice) {
  const sampler = createReturnSampler(state.meanReturn, state.volatility);
  const r = sampler(rng);
  const factor = choice === 'U' ? (1 + r/100) : (1 - r/100);
  const newV = state.v * factor;
  return {
    ...state,
    v: Math.max(0.01, newV),
    iteration: state.iteration + 1,
    history: [...state.history, newV],
    choices: [...state.choices, choice],
    randomDraws: [...state.randomDraws, r],
  };
}
```

#### 7.5 CAGR & Stats (Pure)

```javascript
function computeStats(state) {
  if (state.iteration === 0) return { cagr: 0, arithmeticMean: 0, maxDrawdown: 0 };
  const returns = state.randomDraws.map((r, i) => 
    state.choices[i] === 'U' ? r/100 : -r/100
  );
  const logReturns = returns.map(r => Math.log1p(r));
  const meanLogReturn = logReturns.reduce((a,b) => a+b, 0) / state.iteration;
  const cagr = Math.exp(meanLogReturn) - 1;
  const arithmeticMean = returns.reduce((a,b) => a+b, 0) / state.iteration;
  // ... maxDrawdown, volatility, sharpeRatio
}
```

---

### 8. Acceptance Criteria (Definition of Done)

| ID | Criterion | Priority |
|----|-----------|----------|
| AC-1 | Game loads in < 2s on 3G; works offline after first visit | P0 |
| AC-2 | Touch/tap Up/Down updates value, chart, stats instantly | P0 |
| AC-3 | CAGR matches manual calculation for fixed seed | P0 |
| AC-4 | Theme toggle cycles light/dark/system; chart updates | P0 |
| AC-5 | Reset clears all state; confirms before destroy | P0 |
| AC-6 | Seed input reproduces identical sequence | P0 |
| AC-6 | Return params (mean, vol) apply and reset game | P0 |
| AC-7 | Keyboard accessible (Tab, Arrow keys, Enter) | P1 |
| AC-8 | Export/import JSON round-trips losslessly | P1 |
| AC-9 | Screen reader announces value changes | P2 |
| AC-10 | "Learn" panel explains volatility drag correctly | P2 |
| AC-11 | History table shows last 5 entries with correct data | P1 |
| AC-12 | Expand button toggles full history view correctly | P1 |
| AC-13 | Return/choice color coding matches value direction | P1 |
| AC-14 | Chart: rolling 20-year window, zoom out, data labels, circles | P1 |
| AC-15 | Desktop tiled layout with sticky history sidebar | P1 |

---

### 9. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Log scale confusing for kids | Medium | Medium | Removed; linear default shows absolute growth |
| "Up always wins" misconception | Medium | High | Show arithmetic vs geometric mean side-by-side |
| 25k iterations too slow on mobile | Low | Medium | Canvas chart batches draws; requestAnimationFrame |
| PWA install criteria not met | Low | Low | HTTPS, manifest, SW — all standard |
| RNG not "fair" perception | Medium | Low | Show seed; allow manual entry; open source |

---

### 10. Future Enhancements (Post-MVP)

1. **Multi-player:** Share seed → compare strategies
2. **Pre-set scenarios:** Bull market (μ=+5), Bear market (μ=-5), High vol (σ=20) — behind info panel
3. **Leaderboard:** Local high scores (CAGR, max drawdown)
4. **Curriculum Mode:** Guided lessons with locked seeds
5. **Native Port:** Capacitor/Ionic → Android/iOS with same codebase
6. **Teacher Dashboard:** Class codes, aggregate stats

---

### 11. Success Metrics (Web MVP)

| Metric | Target (Month 1) |
|--------|------------------|
| Unique visitors | 1,000 |
| Avg session duration | > 3 min |
| Return visits (7-day) | > 20% |
| Export/import usage | > 5% |
| "Learn" panel opens | > 30% |
| GitHub stars (if open) | 50+ |

---

### 12. Timeline (Completed)

| Week | Deliverable |
|------|-------------|
| 1 | Scaffold: HTML, CSS variables, theme toggle, localStorage |
| 2 | RNG, GameState, step engine |
| 3 | Canvas chart: rolling window, zoom, data labels, circles |
| 4 | UI: buttons, reset, seed input, seed panel, return params |
| 5 | PWA: manifest, SW v7 (network-only JS), offline test; accessibility audit |
| 6 | Polish: Learn panel, export/import, seed sharing URL, desktop tiled layout |

---

### Appendix A: Color Tokens (CSS Variables)

```css
:root {
  /* Light (default) */
  --bg: #ffffff;
  --bg-elevated: #f8f9fa;
  --fg: #1a1a2e;
  --fg-muted: #6c757d;
  --accent: #2563eb;
  --accent-hover: #1d4ed8;
  --accent-soft: #dbeafe;
  --border: #e2e8f0;
  --chart-line: #2563eb;
  --chart-grid: #e2e8f0;
  --chart-ref: #94a3b8;
  --up-color: #16a34a;
  --down-color: #dc2626;
  --shadow: 0 1px 3px rgba(0,0,0,0.1);
  --radius: 8px;
  --transition: 150ms ease;
}

@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1e1e1e;
    --bg-elevated: #252526;
    --fg: #e4e4e7;
    --fg-muted: #a1a1aa;
    --accent: #22d3ee;
    --accent-hover: #06b6d4;
    --accent-soft: #164e63;
    --border: #3f3f46;
    --chart-line: #22d3ee;
    --chart-grid: #3f3f46;
    --chart-ref: #71717a;
    --up-color: #4ade80;
    --down-color: #f87171;
    --shadow: 0 1px 3px rgba(0,0,0,0.3);
  }
}

[data-theme="light"] { /* force light */ }
[data-theme="dark"]  { /* force dark  */ }
```

---

### Appendix B: Minimal `index.html` Skeleton

```html
<!DOCTYPE html>
<html lang="en" data-theme="system">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Learn probability, compounding, and CAGR through play">
  <title>Probability Playground</title>
  <link rel="manifest" href="manifest.json">
  <link rel="icon" href="assets/favicon.svg">
  <link rel="stylesheet" href="css/variables.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/components.css">
  <link rel="stylesheet" href="css/themes.css">
</head>
<body>
  <header class="header">
    <h1>Probability Playground</h1>
    <button id="themeToggle" aria-label="Toggle theme">🌓</button>
  </header>

  <main class="main">
    <div class="stats-bar" role="status" aria-live="polite">
      <div class="stat"><span class="label">Value</span><span id="statV" class="value">100.00</span></div>
      <div class="stat"><span class="label">Year</span><span id="statIter" class="value">0</span></div>
      <div class="stat"><span class="label">CAGR</span><span id="statCagr" class="value">0.00%</span></div>
    </div>

    <div class="chart-history-grid">
      <section class="chart-section" aria-label="Portfolio history chart">
        <div id="chart" class="chart"></div>
      </section>

      <section class="history-section" aria-label="Recent history">
        <div class="history-toolbar">
          <h3>Recent History</h3>
          <button id="historyExpand" class="btn ghost btn-sm" aria-expanded="false">
            <span class="expand-icon">▼</span> Show All
          </button>
        </div>
        <div id="historyTable" class="history-table-container">
          <table class="history-table">
            <thead>
              <tr><th>Year</th><th>r (%)</th><th>Return (%)</th><th>Choice</th></tr>
            </thead>
            <tbody id="historyBody">
              <tr class="history-empty"><td colspan="4">No history yet</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <div class="controls">
      <div class="control-row">
        <button id="btnUp" class="btn primary btn-lg" aria-label="Bet Up (ArrowUp or W)">↑ Up</button>
        <button id="btnDown" class="btn danger btn-lg" aria-label="Bet Down (ArrowDown or S)">↓ Down</button>
      </div>
      <div class="control-row">
        <button id="btnReset" class="btn ghost">Reset</button>
      </div>
      <div class="seed-row">
        <button id="btnExport" class="btn ghost">Export</button>
        <input type="file" id="importFile" class="file-input" accept=".json" hidden>
        <button id="btnImport" class="btn ghost">Import</button>
      </div>
    </div>

    <details class="learn-panel">
      <summary>Learn: Why CAGR ≠ Average Return</summary>
      <div class="learn-content"></div>
    </details>

    <div class="seed-info-section">
      <button id="seedInfoBtn" class="info-btn" aria-label="About random seed and return parameters">
        <span class="info-icon">ℹ️</span><span>About Seed & Returns</span>
      </button>
      <div id="seedInfoPanel" class="info-panel hidden">
        <h4>What is the Random Seed?</h4>
        <p>The seed controls the random number generator. Same seed = same sequence.</p>
        <p><strong>Why it matters:</strong> Share a seed to compare strategies on identical conditions.</p>
        <div class="seed-controls">
          <label for="seedInput">Seed:</label>
          <input type="number" id="seedInput" class="seed-input" placeholder="e.g. 42" min="0" max="4294967295">
        </div>
        <hr class="info-divider">
        <h4>Return Distribution Parameters</h4>
        <p>Defaults: Average Return <strong>0%</strong>, Volatility <strong>25%</strong> (95% range ±25%)</p>
        <div class="param-controls">
          <div class="param-group">
            <label for="meanReturnInput">Average Return (%):</label>
            <input type="number" id="meanReturnInput" class="param-input" placeholder="0" step="0.1" min="-50" max="50">
          </div>
          <div class="param-group">
            <label for="volatilityInput">Volatility (%):</label>
            <input type="number" id="volatilityInput" class="param-input" placeholder="25" step="0.1" min="1" max="100">
          </div>
          <button id="btnApplyParams" class="btn primary">Apply & Reset</button>
        </div>
      </div>
    </div>
  </main>

  <footer class="footer">
    <p>Built to teach investing intuition. <a href="https://github.com/" target="_blank" rel="noopener">Source</a> • <a href="#privacy">Privacy</a></p>
  </footer>

  <script type="module" src="js/app.js"></script>
</body>
</html>
```

---

*End of PRD — Current as of v1.0*