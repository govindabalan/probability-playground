/**
 * Probability Playground — UI Controller
 * Handles DOM binding, events, rendering, toasts, modals
 */

import { createShareURL, parseShareURL, createRNG } from './random.js';
import { loadState, saveState, exportState, importState, recordEvent, clearState } from './state.js';
import { step, reset, computeStats, formatPct, formatValue, formatIteration, canContinue, getStatusMessage } from './engine.js';
import { initChart, updateChart, setLogScale, resizeChart, destroyChart, updateAccessibleTable } from './chart.js';

let state = null;
let rng = null;

// Auto-play state
let autoPlayTimer = null;
let lastAutoStep = 0;

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

  // URL params take precedence over saved state for seed/speed/log/theme/auto
  state = {
    ...savedState,
    seed: urlParams.seed !== null ? urlParams.seed : savedState.seed,
    speedMs: urlParams.speedMs !== null ? urlParams.speedMs : savedState.speedMs,
    logScale: urlParams.logScale !== undefined ? urlParams.logScale : savedState.logScale,
    theme: urlParams.theme !== undefined ? urlParams.theme : savedState.theme,
    autoPlay: urlParams.autoPlay !== undefined ? urlParams.autoPlay : savedState.autoPlay,
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

  // Start auto-play if enabled
  if (state.autoPlay) {
    startAutoPlay();
  }

  // Handle visibility change
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state.autoPlay) {
      pauseAutoPlay();
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
    logScale: document.getElementById('logScale'),

    // Controls
    btnUp: document.getElementById('btnUp'),
    btnDown: document.getElementById('btnDown'),
    btnAuto: document.getElementById('btnAuto'),
    speedSelect: document.getElementById('speedSelect'),
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
  els.btnAuto.addEventListener('click', toggleAutoPlay);
  els.speedSelect.addEventListener('change', (e) => handleSpeedChange(parseInt(e.target.value, 10)));
  els.btnReset.addEventListener('click', handleReset);
  els.seedInput.addEventListener('change', (e) => handleSeedChange(e.target.value));
  els.logScale.addEventListener('change', (e) => handleLogScaleChange(e.target.checked));

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
 * Toggles auto-play
 */
function toggleAutoPlay() {
  state.autoPlay = !state.autoPlay;
  saveState(state);
  recordEvent({ type: 'auto_toggle', iteration: state.iteration, payload: { autoPlay: state.autoPlay } });

  if (state.autoPlay) {
    startAutoPlay();
  } else {
    pauseAutoPlay();
  }
  render();
}

/**
 * Starts auto-play loop
 */
function startAutoPlay() {
  if (autoPlayTimer) return;
  lastAutoStep = performance.now();
  autoPlayLoop();
}

/**
 * Pauses auto-play
 */
function pauseAutoPlay() {
  if (autoPlayTimer) {
    cancelAnimationFrame(autoPlayTimer);
    autoPlayTimer = null;
  }
}

/**
 * Auto-play loop using requestAnimationFrame
 */
function autoPlayLoop() {
  if (!state.autoPlay || !canContinue(state)) {
    pauseAutoPlay();
    // Update button state
    if (els.btnAuto) {
      els.btnAuto.textContent = 'Auto: Off';
      els.btnAuto.classList.remove('btn-danger');
      els.btnAuto.classList.add('btn-secondary');
    }
    return;
  }

  const now = performance.now();
  if (now - lastAutoStep >= state.speedMs) {
    handleChoice(Math.random() < 0.5 ? 'U' : 'D');
    lastAutoStep = now;
  }

  autoPlayTimer = requestAnimationFrame(autoPlayLoop);
}

/**
 * Handles speed change
 */
function handleSpeedChange(ms) {
  state.speedMs = ms;
  saveState(state);
  recordEvent({ type: 'speed_change', iteration: state.iteration, payload: { speedMs: ms } });
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
 * Handles log scale toggle
 */
function handleLogScaleChange(enabled) {
  state.logScale = enabled;
  saveState(state);
  recordEvent({ type: 'log_toggle', iteration: state.iteration, payload: { logScale: enabled } });
  setLogScale(enabled);
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
    case ' ':
      e.preventDefault();
      toggleAutoPlay();
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

  // Log scale
  els.logScale.checked = state.logScale;

  // Auto-play button
  els.btnAuto.textContent = state.autoPlay ? 'Auto: On' : 'Auto: Off';
  els.btnAuto.classList.toggle('btn-danger', state.autoPlay);
  els.btnAuto.classList.toggle('btn-secondary', !state.autoPlay);
  els.speedSelect.value = state.speedMs;
  els.speedSelect.disabled = state.autoPlay;

  // Disable controls if finished
  const finished = !canContinue(state);
  els.btnUp.disabled = finished || state.autoPlay;
  els.btnDown.disabled = finished || state.autoPlay;
  els.seedInput.disabled = finished;
  els.btnAuto.disabled = finished;
  els.speedSelect.disabled = finished || !state.autoPlay;

  // Chart - pass history, choices, and logScale
  updateChart(state.history, state.choices, state.logScale);
  updateAccessibleTable(state.history, state.choices);
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
  return str.replace(/[&<>"']/g, c => map[c]);
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