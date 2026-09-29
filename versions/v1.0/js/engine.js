/**
 * Probability Playground — Game Engine
 * Pure game logic: step, stats, validation
 */

import { sampleReturn } from './random.js';

const MAX_ITERATIONS = 25000;
const RUIN_THRESHOLD = 0.01;
const INITIAL_VALUE = 100;

/**
 * Computes derived statistics from state
 * @param {object} state - GameState
 * @returns {object} Statistics
 */
export function computeStats(state) {
  const { iteration, v, history, choices, randomDraws } = state;

  if (iteration === 0) {
    return {
      cagr: 0,
      arithmeticMean: 0,
      geometricMean: 0,
      maxDrawdown: 0,
      volatility: 0,
      sharpeRatio: 0,
      finalValue: v,
      totalReturn: 0,
    };
  }

  // Directional returns: +r% for Up, -r% for Down
  const returns = randomDraws.map((r, i) =>
    choices[i] === 'U' ? r / 100 : -r / 100
  );

  // Log returns for geometric calculations
  const logReturns = returns.map(r => Math.log1p(r));

  // CAGR = geometric mean - 1
  const meanLogReturn = logReturns.reduce((a, b) => a + b, 0) / iteration;
  const geometricMean = Math.exp(meanLogReturn) - 1;
  const cagr = geometricMean;

  // Arithmetic mean of directional returns
  const arithmeticMean = returns.reduce((a, b) => a + b, 0) / iteration;

  // Volatility (annualized std dev of log returns)
  const variance = logReturns.reduce((sum, r) => sum + (r - meanLogReturn) ** 2, 0) / iteration;
  const volatility = Math.sqrt(variance);

  // Sharpe ratio (risk-free = 0)
  const sharpeRatio = volatility > 0 ? geometricMean / volatility : 0;

  // Max drawdown
  let peak = INITIAL_VALUE;
  let maxDD = 0;
  for (const val of history) {
    if (val > peak) peak = val;
    const dd = (peak - val) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Total return
  const totalReturn = (v / INITIAL_VALUE) - 1;

  return {
    cagr,
    arithmeticMean,
    geometricMean,
    maxDrawdown: maxDD,
    volatility,
    sharpeRatio,
    finalValue: v,
    totalReturn,
  };
}

/**
 * Performs a single game step
 * @param {object} state - Current game state
 * @param {object} rng - RNG instance
 * @param {'U'|'D'} choice - Player choice
 * @returns {object} New state (immutable update)
 */
export function step(state, rng, choice) {
  if (state.iteration >= MAX_ITERATIONS) {
    throw new Error('Maximum iterations reached');
  }
  if (state.finishedAt) {
    throw new Error('Game already finished');
  }

  const r = sampleReturn(rng);
  const factor = choice === 'U' ? (1 + r / 100) : (1 - r / 100);
  let newV = state.v * factor;

  // Check for ruin
  const isRuined = newV <= RUIN_THRESHOLD;
  if (isRuined) newV = RUIN_THRESHOLD;

  const newIteration = state.iteration + 1;
  const isFinished = newIteration >= MAX_ITERATIONS || isRuined;

  return {
    ...state,
    v: newV,
    iteration: newIteration,
    history: [...state.history, newV],
    choices: [...state.choices, choice],
    randomDraws: [...state.randomDraws, r],
    finishedAt: isFinished ? new Date().toISOString() : null,
  };
}

/**
 * Resets game to initial state
 * @param {object} currentState - Current state (for preserving settings)
 * @param {number|null} seed - Optional new seed
 * @returns {object} New initial state
 */
export function reset(currentState, seed = null) {
  const newSeed = seed !== null ? seed : (currentState?.seed ?? null);
  return {
    ...currentState,
    seed: newSeed,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    v: INITIAL_VALUE,
    iteration: 0,
    history: [INITIAL_VALUE],
    choices: [],
    randomDraws: [],
  };
}

/**
 * Checks if game can continue
 * @param {object} state
 * @returns {boolean}
 */
export function canContinue(state) {
  return !state.finishedAt && state.iteration < MAX_ITERATIONS && state.v > RUIN_THRESHOLD;
}

/**
 * Gets game status message
 * @param {object} state
 * @returns {string|null}
 */
export function getStatusMessage(state) {
  if (state.iteration >= MAX_ITERATIONS) return 'Maximum iterations (25,000) reached';
  if (state.v <= RUIN_THRESHOLD) return 'Portfolio value reached near-zero — Game Over';
  return null;
}

/**
 * Formats a number as percentage with 2 decimal places
 * @param {number} value
 * @returns {string}
 */
export function formatPct(value) {
  return `${(value * 100).toFixed(2)}%`;
}

/**
 * Formats a number as currency-ish with 2 decimals
 * @param {number} value
 * @returns {string}
 */
export function formatValue(value) {
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Formats iteration with commas
 * @param {number} n
 * @returns {string}
 */
export function formatIteration(n) {
  return n.toLocaleString();
}