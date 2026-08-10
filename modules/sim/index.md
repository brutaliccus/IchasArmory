# Simulation Module Index

## Overview

The `sim/` folder contains the modular combat simulation engine. This file documents `index.js` which re-exports all modules for convenient importing.

## File: `index.js`

## Quick Start

```javascript
// Import specific modules
import { EventSystem, BuffSystem, CombatStats } from './sim/index.js';

// Or import everything
import * as Sim from './sim/index.js';
```

## Available Exports

### Event System (Phase 1 - INTEGRATED)

```javascript
import { EventSystem } from './sim/index.js';
```

**Provides:**
- `EventSystem` - Heap-based event scheduling class

**See:** [eventSystem.md](./eventSystem.md)

### Damage System (Phase 2)

```javascript
import { 
    DamageSystem,
    RESISTANCE_TABLE,
    getResistanceTableEntry,
    calculateExpectedResistanceMultiplier,
    calculateMitigationPercent,
    rollResistance,
    calculateArmorReduction,
    getCritMultiplier,
    DamageOutcome,
    ResistType
} from './sim/index.js';
```

**Provides:**
- `DamageSystem` - Damage calculation class
- Resistance calculation functions
- Armor reduction calculation
- Crit multiplier lookup
- Enums for outcomes and resist types

**See:** [damageSystem.md](./damageSystem.md)

### Buff System (Phase 3)

```javascript
import { 
    BuffSystem,
    TRACKED_BUFFS,
    createBuffTracker,
    createMinimalBuffTracker,
    createAllBuffTrackers,
    DEFAULT_BUFF_CONFIG
} from './sim/index.js';
```

**Provides:**
- `BuffSystem` - Buff tracking class
- Helper functions for creating trackers
- List of tracked buffs
- Default configuration

**See:** [buffSystem.md](./buffSystem.md)

### Proc System (Phase 4)

```javascript
import { 
    ProcSystem,
    ProcTrigger,
    calculatePpmProcChance,
    rollProcChance,
    detectEquippedProcs
} from './sim/index.js';
```

**Provides:**
- `ProcSystem` - Proc management class
- Trigger type enum
- PPM calculation
- Proc detection helpers

**See:** [procSystem.md](./procSystem.md)

### Ability System (Phase 5)

```javascript
import { 
    AbilitySystem,
    AbilityState,
    GCD_CONFIG,
    calculateGcd,
    calculateCastTime
} from './sim/index.js';
```

**Provides:**
- `AbilitySystem` - Ability/cooldown management class
- State enum
- GCD constants and calculation
- Cast time calculation

**See:** [abilitySystem.md](./abilitySystem.md)

### Simulation Engine (Phase 6)

```javascript
import { 
    SimulationEngine, 
    createSimulationEngine,
    createRng
} from './sim/index.js';
```

**Provides:**
- `SimulationEngine` - Core orchestrator class
- Factory function
- Seeded RNG creator
- Methods: `runParallel()`, `aggregateResults()`, `reset()`

**See:** [engine.md](./engine.md)

### Combat Stats (Phase 7)

```javascript
import { 
    CombatStats,
    DEFAULT_COMBAT_STATS,
    DEFAULT_RESIST_TRACKING,
    mergeCombatStats
} from './sim/index.js';
```

**Provides:**
- `CombatStats` - Statistics aggregation class
- Default structures
- Merge function for parallel workers

**See:** [combatStats.md](./combatStats.md)

### Worker Pool (Phase 8)

```javascript
import { 
    WorkerPool,
    WORKER_POOL_CONFIG,
    calculateWorkerCount,
    calculateWorkerTimeout,
    distributeIterations,
    runParallelSimulations
} from './sim/index.js';
```

**Provides:**
- `WorkerPool` - Worker management class
- Configuration constants
- Worker count calculation
- Iteration distribution
- Convenience function for parallel sims

**See:** [workerPool.md](./workerPool.md)

### Sim Context (Phase 9)

```javascript
import { 
    STAT_EXTRA_KEYS,
    FEATURE_FLAGS,
    DEFAULT_SIM_CONTEXT,
    serializeStats,
    deserializeStats,
    buildSimContext,
    validateSimContext,
    createQuickSimContext
} from './sim/index.js';
```

**Provides:**
- Serialization utilities for workers
- Context building functions
- Validation
- Quick sim context creation

**See:** [simContext.md](./simContext.md)

## Module Status

| Module | Status | Integration |
|--------|--------|-------------|
| eventSystem.js | Complete | Integrated into shamanCombatSim.js |
| damageSystem.js | Complete | Helper functions, not fully integrated |
| buffSystem.js | Complete | Available for use |
| procSystem.js | Complete | Available for use |
| abilitySystem.js | Complete | Available for use |
| engine.js | Complete | Orchestrator/facade |
| combatStats.js | Complete | Available for use |
| workerPool.js | Complete | Available for use |
| simContext.js | Complete | Available for use |

## Adding to Index

When creating a new module:

1. Create the module file (e.g., `newModule.js`)
2. Add exports to `index.js`:

```javascript
// In index.js
export { 
    NewClass,
    helperFunction,
    CONSTANT
} from './newModule.js';
```

3. Create documentation (e.g., `newModule.md`)
4. Update this file with the new exports

## Import Patterns

### Import Everything

```javascript
import * as Sim from './sim/index.js';

const events = new Sim.EventSystem();
const gcd = Sim.calculateGcd(0.1);
```

### Import Specific Items

```javascript
import { EventSystem, calculateGcd } from './sim/index.js';

const events = new EventSystem();
const gcd = calculateGcd(0.1);
```

### Import from Specific Files

```javascript
import { EventSystem } from './sim/eventSystem.js';
import { BuffSystem } from './sim/buffSystem.js';
```

## Documentation Files

Each module has accompanying documentation:

- [eventSystem.md](./eventSystem.md) - Event scheduling
- [damageSystem.md](./damageSystem.md) - Damage calculations
- [buffSystem.md](./buffSystem.md) - Buff tracking
- [procSystem.md](./procSystem.md) - Proc handling
- [abilitySystem.md](./abilitySystem.md) - Ability management
- [combatStats.md](./combatStats.md) - Statistics
- [workerPool.md](./workerPool.md) - Worker management
- [simContext.md](./simContext.md) - Context/serialization
- [engine.md](./engine.md) - Core engine (stub)
- [README.md](./README.md) - Architecture overview
