/**
 * Probability Playground — UI Controller
 * Handles DOM binding, events, rendering, toasts, modals
 */

import { createShareURL, parseShareURL, createRNG } from './random.js';
import { loadState, saveState, exportState, importState, recordEvent, clearState } from './state.js';
import { step, reset, computeStats, formatPct, formatValue, formatIteration, canContinue, getStatusMessage } from './engine.js';
import { initChart, updateChart, resizeChart, destroyChart, refreshChartTheme } from './chart.js';

let state = null;
let rng = null;

// DOM Elements (cached after init)
let els = {};

/**
 * Creates RNG from state
 */
function createRNGFromState(s) {
  return createRNG(s.seed);
}

/**
 * Initializes UI, binds events, loads state
 */
export function initUI() {
  cacheElements();
  bindEvents();

  // Load state from localStorage or URL
  const urlParams = parseShareURL();
  const savedState = loadState();

  // URL params take precedence over saved state for seed/log/theme/mean/vol
  state = {
    ...savedState,
    seed: urlParams.seed !== null ? urlParams.seed : savedState.seed,
    theme: urlParams.theme !== undefined ? urlParams.theme : savedState.theme,
    meanReturn: urlParams.meanReturn !== undefined ? urlParams.meanReturn : savedState.meanReturn,
    volatility: urlParams.volatility !== undefined ? urlParams.volatility : savedState.volatility,
  };

  // If URL had a seed, regenerate RNG with it
  rng = createRNGFromState(state);

  // Apply theme from state
  document.documentElement.dataset.theme = state.theme;
  applyTheme();

  // Initialize chart
  initChart(els.chart);

  // Initial render
  render();

  // Handle visibility change
  document.addEventListener('visibilitychange', () => {
    // No auto-play to pause
  });

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
    if (state.theme === 'system') {
      refreshChartTheme();
    }
  });
}

/**
 * Caches DOM element references
 */
function cacheElements() {
  els = {
    // Stats
    statV: document.getElementById('statV'),
    statIter: document.getElementById('statIter'),
    statCagr: document.getElementById('statCagr'),

    // Chart
    chart: document.getElementById('chart'),

    // History
    historyBody: document.getElementById('historyBody'),
    historyExpand: document.getElementById('historyExpand'),
    historyContainer: document.getElementById('historyTable'),

    // Controls
    btnUp: document.getElementById('btnUp'),
    btnDown: document.getElementById('btnDown'),
    btnReset: document.getElementById('btnReset'),
    seedInput: document.getElementById('seedInput'),
    btnExport: document.getElementById('btnExport'),
    btnImport: document.getElementById('btnImport'),
    importFile: document.getElementById('importFile'),

    // Theme
    themeToggle: document.getElementById('themeToggle'),

    // Learn panel
    learnPanel: document.querySelector('.learn-panel'),
    learnContent: document.querySelector('.learn-content'),
    learnNavPrev: document.querySelector('.learn-nav button:first-child'),
    learnNavNext: document.querySelector('.learn-nav button:last-child'),

    // Toast container
    toastContainer: document.querySelector('.toast-container') || createToastContainer(),

    // Seed info
    seedInfoBtn: document.getElementById('seedInfoBtn'),
    seedInfoPanel: document.getElementById('seedInfoPanel'),

    // Return parameters
    meanReturnInput: document.getElementById('meanReturnInput'),
    volatilityInput: document.getElementById('volatilityInput'),
    btnApplyParams: document.getElementById('btnApplyParams'),
  };
}

function createToastContainer() {
  const container = document.createElement('div');
  container.className = 'toast-container';
  document.body.appendChild(container);
  return container;
}

/**
 * Binds all event listeners
 */
function bindEvents() {
  // Game controls
  els.btnUp.addEventListener('click', () => handleChoice('U'));
  els.btnDown.addEventListener('click', () => handleChoice('D'));
  els.btnReset.addEventListener('click', handleReset);
  els.seedInput.addEventListener('change', (e) => handleSeedChange(e.target.value));

  // Export/Import
  els.btnExport.addEventListener('click', handleExport);
  els.btnImport.addEventListener('click', () => els.importFile.click());
  els.importFile.addEventListener('change', handleImport);

  // Theme
  els.themeToggle.addEventListener('click', toggleTheme);

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeydown);

  // Window resize
  window.addEventListener('resize', debounce(resizeChart, 100));

  // Learn panel navigation
  if (els.learnNavPrev) els.learnNavPrev.addEventListener('click', () => navigateLearn(-1));
  if (els.learnNavNext) els.learnNavNext.addEventListener('click', () => navigateLearn(1));

  // History expand
  if (els.historyExpand) {
    els.historyExpand.addEventListener('click', toggleHistoryExpand);
  }

  // Seed info panel toggle
  if (els.seedInfoBtn) {
    els.seedInfoBtn.addEventListener('click', toggleSeedInfo);
  }

  // Return parameters apply
  if (els.btnApplyParams) {
    els.btnApplyParams.addEventListener('click', handleApplyParams);
  }

/**
 * Handles Up/Down choice
 */
function handleChoice(choice) {
  if (!canContinue(state)) return;

  const newState = step(state, rng, choice);
  state = newState;
  saveState(state);
  recordEvent({ type: 'step', iteration: state.iteration, payload: { choice, r: state.randomDraws[state.randomDraws.length - 1], newV: state.v } });
  render();

  // Check for game end
  const status = getStatusMessage(state);
  if (status) {
    showToast(status);
  }
}

/**
 * Handles reset with confirmation
 */
async function handleReset() {
  const confirmed = await confirm('Reset game? This will clear all history.');
  if (!confirmed) return;

  state = reset(state);
  rng = createRNGFromState(state);
  saveState(state, true);
  recordEvent({ type: 'reset', iteration: 0 });
  render();
  showToast('Game reset');
}

/**
 * Handles seed change
 */
async function handleSeedChange(value) {
  const seed = value ? parseInt(value, 10) : null;
  if (seed !== null && (isNaN(seed) || seed < 0 || seed > 0xFFFFFFFF)) {
    showToast('Invalid seed (0 to 4,294,967,295)');
    return;
  }

  state.seed = seed;
  rng = createRNGFromState(state);
  saveState(state);
  recordEvent({ type: 'seed_set', iteration: state.iteration, payload: { seed } });

  // If game hasn't started, just update; if started, offer reset
  if (state.iteration > 0) {
    const confirmed = await confirm('Change seed? This will reset the game.');
    if (confirmed) {
      state = reset(state, seed);
      rng = createRNGFromState(state);
      saveState(state, true);
      render();
    } else {
      els.seedInput.value = state.seed ?? '';
    }
  }
}

/**
 * Handles applying return parameters (mean & volatility) and resets game
 */
async function handleApplyParams() {
  const meanReturn = els.meanReturnInput?.value !== '' ? parseFloat(els.meanReturnInput.value) : 0;
  const volatility = els.volatilityInput?.value !== '' ? parseFloat(els.volatilityInput.value) : 25;

  // Validate
  if (isNaN(meanReturn) || meanReturn < -50 || meanReturn > 50) {
    showToast('Average Return must be between -50% and +50%');
    return;
  }
  if (isNaN(volatility) || volatility < 1 || volatility > 100) {
    showToast('Volatility must be between 1% and 100%');
    return;
  }

  // Confirm if game in progress
  if (state.iteration > 0) {
    const confirmed = await confirm('Change return parameters? This will reset the game.');
    if (!confirmed) return;
  }

  // Apply new parameters and reset
  state.meanReturn = meanReturn;
  state.volatility = volatility;
  state = reset(state, state.seed);
  rng = createRNGFromState(state);
  saveState(state, true);
  recordEvent({ type: 'params_change', iteration: 0, payload: { meanReturn, volatility } });
  render();
  showToast(`Parameters applied: Mean ${meanReturn}%, Vol ${volatility}% — Game reset`);
}

/**
 * Handles export
 */
function handleExport() {
  const json = exportState(state, { note: 'Exported from Probability Playground' });
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `probability-game-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
  recordEvent({ type: 'export', iteration: state.iteration });
  showToast('Game exported');
}

/**
 * Handles import
 */
function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    try {
      const newState = importState(event.target.result);
      state = newState;
      rng = createRNGFromState(state);
      saveState(state, true);
      recordEvent({ type: 'import', iteration: state.iteration });
      render();
      showToast('Game imported');
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    }
    els.importFile.value = '';
  };
  reader.readAsText(file);
}

/**
 * Toggles theme
 */
function toggleTheme() {
  const themes = ['system', 'light', 'dark'];
  const current = state.theme;
  const next = themes[(themes.indexOf(current) + 1) % themes.length];
  state.theme = next;
  saveState(state);
  recordEvent({ type: 'theme_change', iteration: state.iteration, payload: { theme: next } });
  document.documentElement.dataset.theme = next;
  applyTheme();
  updateThemeIcon();
  refreshChartTheme();
}

/**
 * Applies theme to document
 */
function applyTheme() {
  const theme = state.theme;
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.dataset.theme = theme;
  }
  updateThemeIcon();
  // Refresh chart when theme changes (including system theme changes)
  refreshChartTheme();
}

function updateThemeIcon() {
  const icons = { system: '🖥️', light: '☀️', dark: '🌙' };
  els.themeToggle.textContent = icons[state.theme] || '🌓';
  els.themeToggle.setAttribute('aria-label', `Theme: ${state.theme}`);
}

/**
 * Handles keyboard shortcuts
 */
function handleKeydown(e) {
  // Don't interfere with input fields
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;

  switch (e.key) {
    case 'ArrowUp':
    case 'w':
    case 'W':
      e.preventDefault();
      handleChoice('U');
      break;
    case 'ArrowDown':
    case 's':
    case 'S':
      e.preventDefault();
      handleChoice('D');
      break;
    case 'r':
    case 'R':
      if (e.ctrlKey || e.metaKey) return; // Allow browser reload
      handleReset();
      break;
  }
}

/**
 * Renders current state to DOM
 */
function render() {
  // Stats
  els.statV.textContent = formatValue(state.v);
  els.statV.dataset.positive = state.v > 100;
  els.statV.dataset.negative = state.v < 100;
  els.statIter.textContent = formatIteration(state.iteration);

  const stats = computeStats(state);
  els.statCagr.textContent = formatPct(stats.cagr);
  els.statCagr.dataset.positive = stats.cagr > 0;
  els.statCagr.dataset.negative = stats.cagr < 0;

  // Seed input
  els.seedInput.value = state.seed ?? '';
  els.seedInput.placeholder = state.seed ? '' : 'e.g. 42';

  // Return parameter inputs
  if (els.meanReturnInput) {
    els.meanReturnInput.value = state.meanReturn ?? 0;
    els.meanReturnInput.placeholder = '0';
  }
  if (els.volatilityInput) {
    els.volatilityInput.value = state.volatility ?? 25;
    els.volatilityInput.placeholder = '25';
  }

  // Disable controls if finished
  const finished = !canContinue(state);
  els.btnUp.disabled = finished;
  els.btnDown.disabled = finished;
  els.seedInput.disabled = finished;
  if (els.meanReturnInput) els.meanReturnInput.disabled = finished;
  if (els.volatilityInput) els.volatilityInput.disabled = finished;
  if (els.btnApplyParams) els.btnApplyParams.disabled = finished;

  // Chart
  updateChart(state.history);

  // History table
  renderHistoryTable();
}

/**
 * Renders the history table (last 5 or all entries)
 */
function renderHistoryTable() {
  if (!els.historyBody) return;

  const { history, choices, randomDraws, iteration } = state;
  const isExpanded = els.historyContainer?.classList.contains('expanded') ?? false;

  // Determine how many entries to show
  const entriesToShow = isExpanded ? iteration : Math.min(5, iteration);
  const startIdx = isExpanded ? 1 : Math.max(1, iteration - entriesToShow + 1);
  const endIdx = iteration;

  if (iteration === 0) {
    els.historyBody.innerHTML = '<tr class="history-empty"><td colspan="4">No history yet</td></tr>';
    if (els.historyExpand) {
      els.historyExpand.style.display = 'none';
    }
    return;
  }

  if (els.historyExpand) {
    els.historyExpand.style.display = 'inline-flex';
    els.historyExpand.innerHTML = `<span class="expand-icon">${isExpanded ? '▲' : '▼'}</span> ${isExpanded ? 'Show Less' : 'Show All'}`;
    els.historyExpand.setAttribute('aria-expanded', isExpanded);
  }

  // Build rows (most recent first)
  const rows = [];
  for (let i = endIdx; i >= startIdx; i--) {
    const r = randomDraws[i - 1];
    const choice = choices[i - 1];
    const prevValue = history[i - 1];
    const currValue = history[i];
    const returnPct = ((currValue - prevValue) / prevValue) * 100;

    const returnClass = returnPct >= 0 ? 'return-positive' : 'return-negative';
    const choiceClass = choice === 'U' ? 'choice-up' : 'choice-down';
    const choiceLabel = choice === 'U' ? '↑ Up' : '↓ Down';

    rows.push(`
      <tr>
        <td>${formatIteration(i)}</td>
        <td>${r.toFixed(2)}</td>
        <td class="${returnClass}">${returnPct >= 0 ? '+' : ''}${returnPct.toFixed(2)}%</td>
        <td class="${choiceClass}">${choiceLabel}</td>
      </tr>
    `);
  }

  els.historyBody.innerHTML = rows.join('');
}

/**
 * Toggles history table expand/collapse
 */
function toggleHistoryExpand() {
  if (!els.historyContainer) return;
  const isExpanded = els.historyContainer.classList.toggle('expanded');
  renderHistoryTable();
}

/**
 * Toggles seed info panel
 */
function toggleSeedInfo() {
  if (!els.seedInfoPanel) return;
  const isHidden = els.seedInfoPanel.classList.toggle('hidden');
  els.seedInfoBtn.setAttribute('aria-expanded', !isHidden);
}

/**
 * Shows a toast notification
 */
export function showToast(message, duration = 3000) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  els.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

/**
 * Shows a confirmation dialog
 */
export function confirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal confirm-dialog">
        <p>${escapeHtml(message)}</p>
        <div class="modal-actions">
          <button class="btn ghost" data-result="false">Cancel</button>
          <button class="btn danger" data-result="true" autofocus>Confirm</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    // Force reflow for animation
    overlay.offsetHeight;
    overlay.classList.add('open');

    const cleanup = (result) => {
      overlay.classList.remove('open');
      setTimeout(() => overlay.remove(), 200);
      resolve(result);
    };

    overlay.querySelectorAll('[data-result]').forEach(btn => {
      btn.addEventListener('click', () => cleanup(btn.dataset.result === 'true'));
    });

    // Close on overlay click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    // Escape key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        document.removeEventListener('keydown', escHandler);
        cleanup(false);
      }
    };
    document.addEventListener('keydown', escHandler);
  });
}

/**
 * Simple debounce
 */
function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Escapes HTML
 */
function escapeHtml(str) {
  const map = {
    '&': '&',
    '<': '<',
    '>': '>',
    '"': '"',
    "'": '&apos;'
  };
  return str.replace(/[&<>\"']/g, c => map[c]);
}

/**
 * Learn panel navigation
 */
let learnSlide = 0;
const learnSlides = [
  { title: 'Why Average ≠ Your Return', content: 'The arithmetic average of yearly returns ignores compounding. If you gain 50% then lose 50%, the average is 0% but you\'re down 25%.' },
  { title: 'Volatility Drag', content: 'Geometric mean (CAGR) is always ≤ arithmetic mean. The gap grows with volatility. This is "volatility drag" — it\'s why stable returns compound better.' },
  { title: 'Try It Yourself', content: 'Play with always Up, always Down, or random choices. Compare CAGR to arithmetic mean. Notice how the path matters, not just the average.' },
];

function navigateLearn(dir) {
  learnSlide = Math.max(0, Math.min(learnSlides.length - 1, learnSlide + dir));
  renderLearnPanel();
}

function renderLearnPanel() {
  if (!els.learnContent) return;
  els.learnContent.innerHTML = learnSlides.map((slide, i) => `
    <div class="slide ${i === learnSlide ? 'active' : ''}">
      <h3>${escapeHtml(slide.title)}</h3>
      <p>${escapeHtml(slide.content)}</p>
    </div>
  `).join('') + `
    <div class="learn-nav">
      <button ${learnSlide === 0 ? 'disabled' : ''}>Previous</button>
      <span>${learnSlide + 1} / ${learnSlides.length}</span>
      <button ${learnSlide === learnSlides.length - 1 ? 'disabled' : ''}>Next</button>
    </div>
  `;

  // Re-bind nav buttons
  els.learnContent.querySelectorAll('.learn-nav button').forEach((btn, i) => {
    btn.addEventListener('click', () => navigateLearn(i === 0 ? -1 : 1));
  });
}

// Initialize learn panel on first open
let learnInitialized = false;
const learnObserver = new MutationObserver(() => {
  if (els.learnPanel?.open && !learnInitialized) {
    renderLearnPanel();
    learnInitialized = true;
  }
});
learnObserver.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ['open'] });