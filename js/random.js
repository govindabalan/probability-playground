/**
 * Probability Playground — Seeded Random Number Generator
 * Uses mulberry32 (32-bit, period 2^32) + Box-Muller for normal distribution
 */

/**
 * Creates a seeded RNG using mulberry32 algorithm
 * @param {number} seed - 32-bit unsigned integer seed
 * @returns {function(): number} RNG returning [0, 1)
 */
export function createRNG(seed = null) {
  let state = seed !== null ? (seed >>> 0) : (cryptoRandomUint32() >>> 0);

  function nextUint32() {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t = (t + Math.imul(t ^ (t >>> 7), t | 61)) >>> 0;
    return (t ^ (t >>> 14)) >>> 0;
  }

  function next() {
    return nextUint32() / 0x100000000; // 2^32
  }

  function nextInt(min, max) {
    return Math.floor(next() * (max - min + 1)) + min;
  }

  function nextNormal(mean = 0, std = 1, min = -Infinity, max = Infinity) {
    // Box-Muller transform
    let u = 0, v = 0;
    while (u === 0) u = next();
    while (v === 0) v = next();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return Math.max(min, Math.min(max, mean + z * std));
  }

  function getSeed() {
    return state;
  }

  function setSeed(newSeed) {
    state = newSeed >>> 0;
  }

  function clone() {
    return createRNG(state);
  }

  return { next, nextInt, nextNormal, getSeed, setSeed, clone };
}

/**
 * Generates a random 32-bit unsigned integer using crypto API
 * @returns {number}
 */
function cryptoRandomUint32() {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0];
}

/**
 * Samples a normal distribution with configurable mean and volatility
 * μ = meanReturn, σ = volatility / 1.96 (so ~95% within ±volatility)
 * @param {object} rng - RNG object with nextNormal method
 * @param {number} meanReturn - Average return in percent (default 0)
 * @param {number} volatility - 95% range in percent (default 25)
 * @returns {number} Clamped normal sample
 */
export function sampleReturn(rng, meanReturn = 0, volatility = 25) {
  const std = volatility / 1.96;
  const min = meanReturn - 3 * std;
  const max = meanReturn + 3 * std;
  return rng.nextNormal(meanReturn, std, min, max);
}

/**
 * Parses seed from various input formats
 * @param {string|number|null} input
 * @returns {number|null} Valid 32-bit seed or null
 */
export function parseSeed(input) {
  if (input === null || input === '' || input === undefined) return null;
  const num = Number(input);
  if (!Number.isInteger(num)) return null;
  // Clamp to 32-bit unsigned
  return num >>> 0;
}

/**
 * Generates a random seed for sharing
 * @returns {number}
 */
export function generateSeed() {
  return cryptoRandomUint32();
}

/**
 * Creates a shareable URL with current settings
 * @param {object} params - { seed, speedMs, logScale, theme, autoPlay, meanReturn, volatility }
 * @returns {string}
 */
export function createShareURL(params) {
  const url = new URL(window.location.href);
  if (params.seed !== null && params.seed !== undefined) url.searchParams.set('seed', String(params.seed));
  if (params.speedMs) url.searchParams.set('speed', String(params.speedMs));
  if (params.logScale !== undefined) url.searchParams.set('log', params.logScale ? '1' : '0');
  if (params.theme && params.theme !== 'system') url.searchParams.set('theme', params.theme);
  if (params.autoPlay) url.searchParams.set('auto', '1');
  if (params.meanReturn !== undefined) url.searchParams.set('mean', String(params.meanReturn));
  if (params.volatility !== undefined) url.searchParams.set('vol', String(params.volatility));
  return url.toString();
}

/**
 * Parses shareable URL parameters
 * @returns {object} Parsed parameters with defaults
 */
export function parseShareURL() {
  const params = new URLSearchParams(window.location.search);
  return {
    seed: params.has('seed') ? parseSeed(params.get('seed')) : null,
    speedMs: params.has('speed') ? parseInt(params.get('speed'), 10) : 500,
    logScale: params.has('log') ? params.get('log') === '1' : false,
    theme: params.has('theme') ? params.get('theme') : 'system',
    autoPlay: params.has('auto') ? params.get('auto') === '1' : false,
    meanReturn: params.has('mean') ? parseFloat(params.get('mean')) : 0,
    volatility: params.has('vol') ? parseFloat(params.get('vol')) : 25,
  };
}