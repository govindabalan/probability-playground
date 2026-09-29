/**
 * Probability Playground — Game State Management
 * Handles state, persistence, serialization
 */

import { parseSeed, generateSeed } from './random.js';

const STORAGE_KEY = 'probability-game-state';
const STORAGE_VERSION = 2; // Bumped for new parameters
const EVENTS_KEY = 'probability-game-events';
const MAX_EVENTS = 500;

/**
 * Default game state
 */
export const DEFAULT_STATE = {
  version: STORAGE_VERSION,
  seed: null,
  startedAt: null,
  finishedAt: null,
  v: 100,
  iteration: 0,
  history: [100],
  choices: [],
  randomDraws: [],
  autoPlay: false,
  speedMs: 500,
  logScale: false,
  theme: 'system',
  // New: Return distribution parameters
  meanReturn: 0,     // Average return in percent (e.g., 2 for 2%)
  volatility: 25,    // 95% range in percent (e.g., 25 for ±25%)
};

/**
 * Creates a fresh game state
 * @param {object} overrides - Optional initial values
 * @returns {object} New game state
 */
export function createState(overrides = {}) {
  const seed = overrides.seed !== undefined ? overrides.seed : generateSeed();
  return {
    ...DEFAULT_STATE,
    seed,
    startedAt: new Date().toISOString(),
    ...overrides,
    seed,
  };
}

/**
 * Validates and migrates stored state
 * @param {object} stored - Raw stored state
 * @returns {object} Validated state
 */
export function validateState(stored) {
  if (!stored || typeof stored !== 'object') return createState();

  const state = { ...DEFAULT_STATE, ...stored };

  // Version migration
  if (state.version !== STORAGE_VERSION) {
    state.version = STORAGE_VERSION;
    // Future migrations go here
  }

  // Ensure arrays
  state.history = Array.isArray(state.history) ? state.history : [100];
  state.choices = Array.isArray(state.choices) ? state.choices : [];
  state.randomDraws = Array.isArray(state.randomDraws) ? state.randomDraws : [];

  // Clamp values
  state.v = Math.max(0.01, Number(state.v) || 100);
  state.iteration = Math.max(0, Math.min(25000, Number(state.iteration) || 0));
  state.speedMs = [100, 250, 500, 1000, 2000].includes(state.speedMs) ? state.speedMs : 500;
  state.logScale = Boolean(state.logScale);
  state.autoPlay = Boolean(state.autoPlay);
  state.theme = ['light', 'dark', 'system'].includes(state.theme) ? state.theme : 'system';

  // Validate new parameters
  state.meanReturn = typeof state.meanReturn === 'number' && !isNaN(state.meanReturn) 
    ? Math.max(-100, Math.min(100, state.meanReturn)) 
    : 0;
  state.volatility = typeof state.volatility === 'number' && !isNaN(state.volatility)
    ? Math.max(1, Math.min(100, state.volatility))
    : 25;

  // Validate seed
  state.seed = parseSeed(state.seed);

  // Ensure history length matches iteration
  if (state.history.length !== state.iteration + 1) {
    // Rebuild from start if corrupted
    return createState({ 
      seed: state.seed, 
      theme: state.theme, 
      logScale: state.logScale, 
      speedMs: state.speedMs,
      meanReturn: state.meanReturn,
      volatility: state.volatility,
    });
  }

  // Validate choices and draws length
  if (state.choices.length !== state.iteration || state.randomDraws.length !== state.iteration) {
    return createState({ 
      seed: state.seed, 
      theme: state.theme, 
      logScale: state.logScale, 
      speedMs: state.speedMs,
      meanReturn: state.meanReturn,
      volatility: state.volatility,
    });
  }

  // Validate choices values
  state.choices = state.choices.map(c => (c === 'U' || c === 'D' ? c : 'U'));

  // Clamp random draws based on volatility (default to 25 for backward compatibility)
  const vol = state.volatility || 25;
  const clampMax = vol * 1.5; // 1.5x the 95% range as hard clamp
  state.randomDraws = state.randomDraws.map(r => Math.max(-clampMax, Math.min(clampMax, Number(r) || 0)));

  // Ensure history[0] === 100
  state.history[0] = 100;

  return state;
}

/**
 * Loads state from localStorage
 * @returns {object} Validated game state
 */
export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createState();
    const parsed = JSON.parse(raw);
    return validateState(parsed.state || parsed);
  } catch {
    return createState();
  }
}

/**
 * Saves state to localStorage (debounced)
 */
let saveTimeout = null;
export function saveState(state, immediate = false) {
  const payload = {
    version: STORAGE_VERSION,
    state: { ...state },
    savedAt: new Date().toISOString(),
  };

  const doSave = () => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (e) {
      console.warn('Failed to save state:', e);
    }
    saveTimeout = null;
  };

  if (immediate) {
    if (saveTimeout) clearTimeout(saveTimeout);
    doSave();
  } else {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(doSave, 500);
  }
}

/**
 * Clears saved state
 */
export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
  if (saveTimeout) clearTimeout(saveTimeout);
}

/**
 * Exports state as JSON string
 * @param {object} state
 * @param {object} metadata - Optional metadata
 * @returns {string} JSON string
 */
export function exportState(state, metadata = {}) {
  const payload = {
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    gameState: { ...state },
    metadata: {
      totalIterations: 25000,
      seed: state.seed,
      meanReturn: state.meanReturn,
      volatility: state.volatility,
      ...metadata,
    },
  };
  return JSON.stringify(payload, null, 2);
}

/**
 * Imports state from JSON string
 * @param {string} json
 * @returns {object} Validated state
 */
export function importState(json) {
  try {
    const parsed = JSON.parse(json);
    if (parsed.exportVersion !== 1) throw new Error('Unsupported export version');
    const state = validateState(parsed.gameState);
    // Preserve seed from export if present
    if (parsed.metadata?.seed !== undefined) {
      state.seed = parseSeed(parsed.metadata.seed);
    }
    return state;
  } catch (e) {
    throw new Error(`Import failed: ${e.message}`);
  }
}

/**
 * Records a game event (optional, for teacher review)
 * @param {object} event
 */
export function recordEvent(event) {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    const events = raw ? JSON.parse(raw) : [];
    events.push({ ...event, timestamp: new Date().toISOString() });
    if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events));
  } catch {
    // Ignore storage errors
  }
}

/**
 * Gets recorded events
 * @returns {Array}
 */
export function getEvents() {
  try {
    const raw = localStorage.getItem(EVENTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

/**
 * Clears events
 */
export function clearEvents() {
  localStorage.removeItem(EVENTS_KEY);
}