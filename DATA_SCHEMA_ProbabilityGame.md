# Data Schema Specification
## Probability Playground — Web Game

Version: 1.0
Last Updated: 2026-09-28

---

## 1. Core State (`GameState`)

```typescript
interface GameState {
  // ── Identity & Meta ──────────────────────────────────────────────
  version: number;                    // Schema version (current: 2)
  seed: number | null;                // RNG seed; null = crypto-random
  startedAt: string;                  // ISO 8601 UTC
  finishedAt: string | null;          // ISO 8601 UTC; null if running

  // ── Runtime State ────────────────────────────────────────────────
  v: number;                          // Current portfolio value (≥ 0)
  iteration: number;                  // Completed iterations (0–25000)
  history: number[];                  // [v₀, v₁, …, vₙ]; length = iteration + 1
  choices: Choice[];                  // 'U' | 'D'; length = iteration
  randomDraws: number[];              // r values; length = iteration

  // ── Settings (persisted) ─────────────────────────────────────────
  autoPlay: boolean;                  // Legacy field (always false)
  speedMs: SpeedPreset;               // 100 | 250 | 500 | 1000 | 2000
  logScale: boolean;                  // Legacy field (always false)
  theme: ThemeMode;                   // 'light' | 'dark' | 'system'
  historyViewMode: HistoryViewMode;   // 'compact' | 'expanded'

  // ── Return Distribution Parameters (NEW) ─────────────────────────
  meanReturn: number;                 // Average return % (default: 0)
  volatility: number;                 // 95% range % (default: 25)
}

type Choice = 'U' | 'D';
type SpeedPreset = 100 | 250 | 500 | 1000 | 2000;
type ThemeMode = 'light' | 'dark' | 'system';
type HistoryViewMode = 'compact' | 'expanded';
```

### Invariants

| Rule | Enforcement |
|------|-------------|
| `history.length === iteration + 1` | Assert in `step()` |
| `choices.length === iteration` | Assert in `step()` |
| `randomDraws.length === iteration` | Assert in `step()` |
| `v > 0` (or ≤ 0.01 → ruined) | Clamp in `step()` |
| `iteration ≤ 25000` | Guard in `step()` |
| `history[0] === 100` | Set in `reset()` |
| `meanReturn ∈ [-50, 50]` | Validate on input |
| `volatility ∈ [1, 100]` | Validate on input |

---

## 2. Derived Statistics (Computed, Not Stored)

```typescript
interface GameStats {
  cagr: number;                       // Compound Annual Growth Rate
  arithmeticMean: number;             // Mean of directional returns
  geometricMean: number;              // = (1 + cagr) - 1
  maxDrawdown: number;                // Peak-to-trough % (0–1)
  volatility: number;                 // Std dev of log returns
  sharpeRatio: number;                // (geometricMean) / volatility
  finalValue: number;                 // = v
  totalReturn: number;                // (v / 100) - 1
}
```

### Formulas

```
n = iteration
returns[i] = choices[i] === 'U' ? randomDraws[i]/100 : -randomDraws[i]/100
logReturns[i] = ln(1 + returns[i])

cagr = exp(mean(logReturns)) - 1
arithmeticMean = mean(returns)
geometricMean = cagr
volatility = std(logReturns) * sqrt(252)  // annualized if needed
maxDrawdown = max_t (peak_t - v_t) / peak_t
sharpeRatio = geometricMean / volatility   // risk-free = 0
```

---

## 3. Persistence Schemas

### 3.1 LocalStorage Key: `probability-game-state`

```json
{
  "version": 2,
  "state": { /* GameState */ },
  "savedAt": "2026-09-28T10:30:00.000Z"
}
```
- **Load:** Merge with defaults; migrate if `version` differs.
- **Save:** Debounced (500 ms) + on `beforeunload`.

### 3.2 Export/Import File (`probability-game-export.json`)

```json
{
  "exportVersion": 1,
  "exportedAt": "2026-09-28T10:30:00.000Z",
  "gameState": { /* GameState */ },
  "metadata": {
    "totalIterations": 25000,
    "seed": 12345,
    "meanReturn": 0,
    "volatility": 25,
    "note": "Optional user note"
  }
}
```
- **Import:** Validate `exportVersion`; discard `metadata` except `seed`, `meanReturn`, `volatility`.

### 3.3 Shareable URL Format

```
https://domain.com/?seed=12345&speed=500&log=0&theme=dark&mean=0&vol=25
```

| Param | Type | Default |
|-------|------|---------|
| `seed` | int32 | random |
| `speed` | SpeedPreset | 500 |
| `log` | 0|1 | 0 (ignored) |
| `theme` | ThemeMode | system |
| `auto` | 0|1 | 0 (ignored) |
| `mean` | float | 0 |
| `vol` | float | 25 |

---

## 4. Event Log (Optional, Local-Only)

Key: `probability-game-events` (max 500 entries, FIFO)

```typescript
interface GameEvent {
  type: 'step' | 'reset' | 'auto_toggle' | 'speed_change' 
       | 'theme_change' | 'log_toggle' | 'seed_set' | 'export' | 'import'
       | 'history_expand' | 'history_collapse' | 'params_change';
  iteration: number;
  timestamp: string;                  // ISO 8601
  payload?: {
    choice?: Choice;
    r?: number;
    newV?: number;
    speedMs?: SpeedPreset;
    theme?: ThemeMode;
    seed?: number;
    meanReturn?: number;
    volatility?: number;
  };
}
```

---

## 5. RNG Specification

### 5.1 Algorithm
- **Primary:** `mulberry32` (32-bit, period 2³², fast, seedable)
- **Fallback (no seed):** `crypto.getRandomValues` → seed `mulberry32`

### 5.2 Normal Sampling
- **Method:** Box-Muller transform
- **Parameters:** Configurable μ (meanReturn), σ (volatility / 1.96)
- **Clamping:** ±3σ from mean (99.7% coverage)
- **Determinism:** Same seed → identical sequence across sessions/browsers

### 5.3 Seed Encoding
- User input: unsigned 32-bit integer (`0` to `4294967295`)
- Internal: `seed >>> 0` (uint32)
- URL: base10 string

---

## 6. API Contracts (Internal Module Interfaces)

### 6.1 `RandomEngine`

```typescript
interface RandomEngine {
  next(): number;                     // [0, 1)
  nextNormal(mean?: number, std?: number, min?: number, max?: number): number;
  nextInt(min: number, max: number): number;
  getSeed(): number;
  setSeed(seed: number): void;
  clone(): RandomEngine;              // For Monte Carlo simulation
}
```

### 6.2 `ReturnSampler`

```typescript
interface ReturnSampler {
  (rng: RandomEngine): number;        // Returns r value in percent
}

// Factory
function createReturnSampler(meanReturn: number, volatility: number): ReturnSampler
```

### 6.3 `GameEngine`

```typescript
interface GameEngine {
  getState(): Readonly<GameState>;
  getStats(): GameStats;
  step(choice: Choice): GameState;    // Throws if iteration ≥ 25000 or finished
  reset(seed?: number): GameState;    // Preserves settings
  setMeanReturn(mean: number): void;  // Requires reset to take effect
  setVolatility(vol: number): void;   // Requires reset to take effect
  export(): string;                   // JSON string
  import(json: string): GameState;    // Throws on invalid
}
```

### 6.4 `ChartController`

```typescript
interface ChartController {
  mount(container: HTMLElement): void;
  update(history: number[]): void;
  resize(): void;
  destroy(): void;
}
```

### 6.5 `UIController`

```typescript
interface UIController {
  init(): void;
  render(state: GameState, stats: GameStats): void;
  showToast(message: string, duration?: number): void;
  confirm(message: string): Promise<boolean>;
}
```

---

## 7. Validation Rules (Runtime)

| Check | When | Failure Action |
|-------|------|----------------|
| `history[0] === 100` | Load/Reset | Force reset |
| `v > 0` | Each step | Clamp to 0.01; set `finishedAt` |
| `iteration ≤ 25000` | Each step | Disable buttons; set `finishedAt` |
| `choices[i] ∈ {'U','D'}` | Load/Import | Drop invalid; warn |
| `randomDraws[i] ∈ [-25,25]` | Load/Import | Clamp; warn |
| `speedMs ∈ presets` | Load/Settings | Default to 500 |
| `theme ∈ {'light','dark','system'}` | Load/Settings | Default to 'system' |
| `meanReturn ∈ [-50, 50]` | Input/Apply | Reject; toast |
| `volatility ∈ [1, 100]` | Input/Apply | Reject; toast |

---

## 8. Migration Guide (Version → Version)

### v1 → v2 (Added Return Distribution Parameters)

```javascript
function migrateV1ToV2(old) {
  return {
    ...old,
    version: 2,
    state: {
      ...old.state,
      meanReturn: old.state.meanReturn ?? 0,
      volatility: old.state.volatility ?? 25,
    },
  };
}
```

---

## 9. TypeScript Definitions (Reference)

```typescript
// types/game.ts
export type Choice = 'U' | 'D';
export type SpeedPreset = 100 | 250 | 500 | 1000 | 2000;
export type ThemeMode = 'light' | 'dark' | 'system';
export type HistoryViewMode = 'compact' | 'expanded';

export interface GameState {
  version: number;
  seed: number | null;
  startedAt: string;
  finishedAt: string | null;
  v: number;
  iteration: number;
  history: number[];
  choices: Choice[];
  randomDraws: number[];
  autoPlay: boolean;
  speedMs: SpeedPreset;
  logScale: boolean;
  theme: ThemeMode;
  historyViewMode: HistoryViewMode;
  meanReturn: number;
  volatility: number;
}

export interface GameStats {
  cagr: number;
  arithmeticMean: number;
  geometricMean: number;
  maxDrawdown: number;
  volatility: number;
  sharpeRatio: number;
  finalValue: number;
  totalReturn: number;
}

export interface GameEvent {
  type: 'step' | 'reset' | 'auto_toggle' | 'speed_change' 
       | 'theme_change' | 'log_toggle' | 'seed_set' | 'export' | 'import'
       | 'history_expand' | 'history_collapse' | 'params_change';
  iteration: number;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface PersistedState {
  version: number;
  state: GameState;
  savedAt: string;
}

export interface ExportFile {
  exportVersion: number;
  exportedAt: string;
  gameState: GameState;
  metadata: {
    totalIterations: number;
    seed: number | null;
    meanReturn: number;
    volatility: number;
    note?: string;
  };
}
```

---

*End of Data Schema — Current as of v1.0 (Schema v2)*