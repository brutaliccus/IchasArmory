# Simulation Engine

## Overview

The Simulation Engine is the core orchestrator for combat simulations. It provides a clean API for running single or parallel simulations while coordinating all sub-systems.

## File: `engine.js`

## Status: COMPLETE (Orchestrator/Facade)

The engine serves as the main entry point for simulations. It currently wraps the existing `ShamanCombatSimulator` while providing hooks for progressive subsystem integration.

## Class: `SimulationEngine`

### Constructor

```javascript
const engine = new SimulationEngine(context, options);
```

**Parameters:**
- `context` (Object) - Simulation context:
  - `stats` (Object) - Character stats
  - `fightDuration` (number) - Fight duration in seconds (default: 120)
  - `priorityConfig` (Object) - Priority/rotation configuration
  - `quickSim` (boolean) - Quick sim mode (default: false)
  - `deterministicMode` (boolean) - Use expected values (default: false)
  - `seed` (number) - RNG seed (null for random)
- `options` (Object, optional):
  - `workerUrl` (URL) - Custom worker script URL

### Properties

| Property | Type | Description |
|----------|------|-------------|
| `context` | Object | Full simulation context |
| `fightDuration` | number | Fight duration in seconds |
| `quickSim` | boolean | Quick sim mode flag |
| `deterministicMode` | boolean | Deterministic mode flag |
| `seed` | number\|null | RNG seed |
| `events` | EventSystem | Event scheduling system |
| `buffs` | BuffSystem | Buff tracking system |
| `procs` | ProcSystem | Proc handling system |
| `abilities` | AbilitySystem | Ability management |
| `damage` | DamageSystem | Damage calculations |
| `combatStats` | CombatStats | Statistics aggregation |
| `rng` | Object | Random number generator |

### Methods

#### `runSingle(statsOverride)`

Run a single simulation iteration.

**Note:** Currently throws an error directing users to use `ShamanCombatSimulator` directly. This will be implemented once full subsystem integration is complete.

```javascript
// Not yet available - use this instead:
import { ShamanCombatSimulator } from './shamanCombatSim.js';
const sim = new ShamanCombatSimulator(stats, fightDuration, priorityConfig, simContext);
const result = sim.simulate();
```

#### `runParallel(iterations, options)`

Run multiple iterations in parallel using workers.

**Parameters:**
- `iterations` (number) - Number of iterations
- `options.maxWorkers` (number, optional) - Max workers to use
- `options.onProgress` (Function, optional) - Progress callback

**Returns:** `Promise<Object>` - Aggregated results

```javascript
const results = await engine.runParallel(5000, {
    maxWorkers: 8,
    onProgress: (completed, total) => {
        console.log(`Progress: ${completed}/${total}`);
    }
});

console.log(results.avgDps);      // Average DPS
console.log(results.iterations);  // Number of iterations
```

#### `aggregateResults(results)`

Aggregate results from multiple iterations.

**Parameters:**
- `results` (Array<Object>) - Array of iteration results

**Returns:** Aggregated result object

```javascript
{
    iterations: number,       // Count of iterations
    avgDps: number,           // Average DPS
    avgTps: number,           // Average TPS
    minDps: number,           // Minimum DPS
    maxDps: number,           // Maximum DPS
    dpsRange: number,         // DPS variance
    totalDamage: number,      // Average total damage
    damageBreakdown: Object   // Sorted breakdown by ability
}
```

#### `reset()`

Reset the engine for a new run.

```javascript
engine.reset();
// Engine is now ready for another run
```

#### `getState()`

Get current engine state for debugging.

```javascript
const state = engine.getState();
console.log(state.currentTime);
console.log(state.eventCount);
```

## Functions

### `createSimulationEngine(context, options)`

Factory function to create a configured engine.

```javascript
import { createSimulationEngine } from './sim/engine.js';

const engine = createSimulationEngine({
    stats: characterStats,
    fightDuration: 120,
    quickSim: false
});
```

### `createRng(seed)`

Create a seeded Mulberry32 RNG.

```javascript
import { createRng } from './sim/engine.js';

const rng = createRng(12345);
console.log(rng.random()); // Deterministic 0-1 value
console.log(rng.random()); // Next deterministic value
```

---

## Modular System Initialization (v1.6.0)

### `initializeAllSystems(ctx, options)`

Initialize all data-driven subsystems on a simulation context. This is the recommended way to prepare a context for simulation.

**Parameters:**
- `ctx` (Object) - Simulation context to initialize
- `options.quickSim` (boolean, default: false) - Minimal tracking for performance

**Returns:** The context with all systems initialized

**Initializes:**
- Proc engine states
- Trinket system states  
- Talent buff states
- DOT system states
- Totem system states
- Lightning Shield system states
- Set bonus system states
- Stats recorder for UI reporting
- Buff trackers (unless quickSim)

```javascript
import { initializeAllSystems } from './sim/engine.js';

// Create minimal context
const ctx = {
    stats: characterStats,
    currentTime: 0,
    fightDuration: 120,
    rng: createRng(12345)
};

// Initialize all systems
initializeAllSystems(ctx, { quickSim: false });

// Now ctx has all system states:
// ctx._procStates, ctx._trinketStates, ctx._talentBuffStates,
// ctx._dotStates, ctx._totemStates, ctx._lightningShieldState,
// ctx._setBonusStates, ctx._statsRecorder, ctx.buffUptime
```

### `createSimulationContext(stats, fightDuration, options)`

Factory function that creates a fully-initialized simulation context ready for simulation.

**Parameters:**
- `stats` (Object) - Character stats
- `fightDuration` (number) - Fight duration in seconds
- `options.priorityConfig` (Object) - Priority/rotation configuration
- `options.simContext` (Object) - Additional sim context flags
- `options.quickSim` (boolean, default: false) - Minimal tracking mode
- `options.seed` (number) - RNG seed (null for random)

**Returns:** Fully-initialized simulation context

```javascript
import { createSimulationContext } from './sim/engine.js';

const ctx = createSimulationContext(characterStats, 120, {
    priorityConfig: myRotationConfig,
    simContext: {
        hasWrathOfCenarius: true,
        hasCrusader: true
    },
    quickSim: false,
    seed: 12345
});

// ctx is ready for simulation with:
// - All subsystems initialized
// - RNG created
// - GCD tracking set up
// - Cooldowns initialized
// - All feature flags set to data-driven mode
```

**Context Structure:**
```javascript
{
    // Core state
    stats,
    fightDuration,
    currentTime: 0,
    priorityConfig,
    simContext: { quickSim, seed, ...flags },
    
    // RNG
    rng: { random: Function, seed: number },
    
    // GCD
    GCD: 1.5,
    gcdReadyAt: 0,
    
    // Cooldowns
    cooldowns: {
        stormstrike: 0,
        lightningStrike: 0,
        shocks: 0,
        fireNovaTotem: 0,
        stoneclawTotem: 0,
        elementalMastery: 0,
        bloodlust: 0
    },
    
    // Feature flags (all true for data-driven)
    USE_DATA_DRIVEN_PROCS: true,
    USE_DATA_DRIVEN_DOTS: true,
    USE_DATA_DRIVEN_IMBUES: true,
    USE_DATA_DRIVEN_TOTEMS: true,
    USE_DATA_DRIVEN_LIGHTNING_SHIELD: true,
    USE_DATA_DRIVEN_SET_BONUSES: true,
    
    // Subsystem states (initialized by initializeAllSystems)
    _procStates: {},
    _trinketStates: {},
    _talentBuffStates: {},
    _dotStates: {},
    _totemStates: {},
    _lightningShieldState: {},
    _empoweredLightningShieldState: {},
    _setBonusStates: {},
    _statsRecorder: {},
    buffUptime: {}
}
```

## Sub-System Integration

The engine initializes all sub-systems on construction:

```javascript
// These are available on the engine instance:
engine.events      // EventSystem
engine.buffs       // BuffSystem
engine.procs       // ProcSystem
engine.abilities   // AbilitySystem
engine.damage      // DamageSystem
engine.combatStats // CombatStats
```

### Current Integration Status

| System | Status | Notes |
|--------|--------|-------|
| EventSystem | Integrated | Used in ShamanCombatSim |
| BuffSystem | Available | Can be used via engine.buffs |
| ProcSystem | Available | Can be used via engine.procs |
| AbilitySystem | Available | Can be used via engine.abilities |
| DamageSystem | Available | Can be used via engine.damage |
| CombatStats | Available | Can be used via engine.combatStats |
| WorkerPool | Integrated | Used by runParallel() |

## Usage Examples

### Running Parallel Simulations

```javascript
import { createSimulationEngine } from './sim/engine.js';
import { buildSimContext } from './sim/simContext.js';

// Build context
const context = buildSimContext({
    stats: characterStats,
    fightDuration: 120,
    features: { hasCrusader: true }
});

// Create engine
const engine = createSimulationEngine(context);

// Run parallel
const results = await engine.runParallel(10000, {
    maxWorkers: 8,
    onProgress: (done, total) => updateUI(done / total)
});

// Display results
console.log(`Avg DPS: ${results.avgDps.toFixed(1)}`);
console.log(`DPS Range: ${results.minDps.toFixed(1)} - ${results.maxDps.toFixed(1)}`);
```

### Using Sub-Systems Directly

```javascript
const engine = createSimulationEngine(context);

// Use buff system
engine.buffs.activateBuff('flurry', 15);
engine.buffs.refreshBuff('flurry', 15);

// Use proc system
engine.procs.registerProc('crusader', { icd: 0, ppm: null, chance: 1 });
if (engine.procs.attemptProc('crusader', 'melee')) {
    console.log('Crusader procced!');
}

// Use ability system
const gcd = engine.abilities.getGcd();
engine.abilities.startCooldown('stormstrike', 6);
```

## Migration Path

The engine is designed for progressive migration:

1. **Phase 1** (Complete): Use EventSystem in ShamanCombatSim
2. **Phase 2** (In Progress): Use other sub-systems as helpers
3. **Phase 3** (Future): Move simulation loop into engine
4. **Phase 4** (Future): Full engine-based simulation

### Recommended Current Usage

```javascript
// For now, use the existing entry point:
import { runShamanSimulation } from './shamanCombatSim.js';

const results = await runShamanSimulation(
    stats,
    fightDuration,
    iterations,
    progressCallback,
    priorityConfig,
    options
);

// The engine's runParallel works but requires worker support
// Use runShamanSimulation for production use
```

## Adding New Features

### Adding to the Engine

1. Import the new sub-system module
2. Initialize it in `_initializeSystems()`
3. Expose it as a property
4. Update documentation

```javascript
// In engine.js
import { MyNewSystem } from './myNewSystem.js';

_initializeSystems() {
    // ... existing systems ...
    this.mySystem = new MyNewSystem({
        getCurrentTime: () => this.currentTime
    });
}
```

### Creating Engine Hooks

```javascript
// Define hook points for subsystem calls
onBeforeEvent(event) {
    // Called before processing each event
}

onAfterEvent(event) {
    // Called after processing each event
}

onDamageDealt(damage, ability, target) {
    // Called when damage is recorded
    this.combatStats.recordDamage(ability, damage);
}
```

## Error Handling

The engine throws descriptive errors for unsupported operations:

```javascript
try {
    engine.runSingle();
} catch (error) {
    // Error: runSingle() requires ShamanCombatSimulator...
    console.log(error.message);
}
```

## Performance Considerations

1. **Worker Pool**: Uses optimal worker count based on hardware
2. **Quick Sim**: Set `quickSim: true` for stat weight calculations
3. **Deterministic Mode**: Faster but less realistic variance
4. **Reset**: Call `reset()` between runs to clear state

## Version History

- **v1.0.0**: Initial SimulationEngine with sub-system scaffolding
- **v1.1.0** (2026-01-26): Full subsystem integration, worker pool
- **v1.6.0** (2026-01-26): Modular system initialization
  - `initializeAllSystems(ctx, options)` - Initialize all subsystems on context
  - `createSimulationContext(stats, duration, options)` - Factory for ready-to-use context
  - Integration with trinketSystem, statsRecorder, buffSystem talent buffs
  - All data-driven feature flags enabled by default
