# Sim Context

## Overview

The Sim Context module handles building simulation contexts and serializing data for Web Worker transfer. It ensures stats and configuration are properly prepared for parallel simulation.

## File: `simContext.js`

## Constants

### `STAT_EXTRA_KEYS`

Array of stat keys that need special handling during serialization:

```javascript
STAT_EXTRA_KEYS = [
    // Weapon stats
    'baseWeaponDamageMin',
    'baseWeaponDamageMax',
    'baseWeaponSpeed',
    'weaponDamage',
    'weaponDamageMultiplier',
    
    // Power stats
    'attackPower',
    'spellPower',
    'firePower',
    'frostPower',
    'naturePower',
    
    // Hit/crit stats
    'meleeCrit',
    'spellCrit',
    'spellHit',
    'meleeHit',
    
    // Haste
    'spellHaste',
    'meleeHaste',
    
    // Mana
    'baseMana',
    'intellect',
    'mp5',
    
    // Resistances (target)
    'natureResist',
    'fireResist',
    'frostResist',
    'shadowResist',
    'arcaneResist',
    
    // Other
    'spellPen',
    'targetArmor'
]
```

### `FEATURE_FLAGS`

Array of boolean feature flags included in context:

```javascript
FEATURE_FLAGS = [
    'hasCrusader',
    'hasWrathOfCenarius',
    'hasEyeOfDiminution',
    'hasKissOfTheSpider',
    'hasStonebreaker',
    'hasElementalMastery',
    'hasNaturalAlignmentCrystal',
    'hasBadgeOfTheSwarmguard',
    'hasOrnateBloodstoneDagger',
    'hasBladeOfEternalDarkness',
    'hasElementalFocus',
    'hasDragonbreathChili',
    'hasShardOfTheFallenStar',
    'hasStormwolfFrenzy',
    'hasBloodlust',
    'nightfallEnabled',
    'hemoEnabled',
    'hemoImproved',
    'corrosiveSpitEnabled'
]
```

### `DEFAULT_SIM_CONTEXT`

Default simulation context values:

```javascript
DEFAULT_SIM_CONTEXT = {
    fightDuration: 120,     // 2 minutes
    iterations: 1000,       // Number of iterations
    seed: null,             // RNG seed (null = random)
    quickSim: false,        // Detailed tracking
    deterministicMode: false // Use expected values
}
```

## Functions

### `serializeStats(stats)`

Serialize a stats object for Web Worker transfer.

**Parameters:**
- `stats` (Object) - Stats object from ShamanStats

**Returns:** `Object` - Serialized stats safe for postMessage

**Handles:**
- Numbers, booleans, strings (copied directly)
- Arrays (shallow copy)
- Plain objects (shallow copy)
- Functions, class instances (skipped)
- String-to-number conversion for STAT_EXTRA_KEYS

**Example:**
```javascript
const serialized = serializeStats(characterStats);
// Safe to send to worker via postMessage
worker.postMessage({ stats: serialized });
```

### `deserializeStats(serialized)`

Deserialize stats received in a worker.

**Parameters:**
- `serialized` (Object) - Serialized stats from main thread

**Returns:** `Object` - Stats object ready for use

**Ensures:**
- STAT_EXTRA_KEYS are converted to numbers
- Prevents string concatenation bugs

**Example:**
```javascript
// In worker
self.onmessage = (event) => {
    const stats = deserializeStats(event.data.stats);
    // stats.attackPower is now guaranteed to be a number
};
```

### `buildSimContext(options)`

Build a complete simulation context from options.

**Parameters:**
- `options` (Object):
  - `stats` (Object) - Character stats
  - `fightDuration` (number) - Fight duration in seconds
  - `iterations` (number) - Number of iterations
  - `quickSim` (boolean) - Use quick sim mode
  - `deterministicMode` (boolean) - Use deterministic calculations
  - `seed` (number) - RNG seed
  - `features` (Object) - Feature flags object

**Returns:** Complete simulation context

**Example:**
```javascript
const context = buildSimContext({
    stats: characterStats,
    fightDuration: 120,
    iterations: 5000,
    quickSim: false,
    features: {
        hasCrusader: true,
        nightfallEnabled: true
    }
});
```

**Context structure:**
```javascript
{
    stats: {...},           // Serialized stats
    fightDuration: 120,
    iterations: 5000,
    quickSim: false,
    deterministicMode: false,
    seed: null,
    timestamp: 1706200000000,
    
    // Feature flags
    hasCrusader: true,
    nightfallEnabled: true,
    // ... other feature flags
}
```

### `validateSimContext(context)`

Validate a simulation context.

**Parameters:**
- `context` (Object) - Context to validate

**Returns:** `{valid: boolean, errors: string[]}`

**Checks:**
- Context is not null/undefined
- fightDuration is positive number
- iterations is at least 1
- stats object exists

**Example:**
```javascript
const { valid, errors } = validateSimContext(context);
if (!valid) {
    console.error('Invalid context:', errors);
    return;
}
```

### `createQuickSimContext(stats, fightDuration = 120)`

Create a minimal context for quick stat weight calculations.

**Parameters:**
- `stats` (Object) - Character stats
- `fightDuration` (number) - Fight duration

**Returns:** Minimal sim context

**Configuration:**
- `iterations: 1`
- `quickSim: true`
- `deterministicMode: true`

**Example:**
```javascript
// For stat weight calculations
const quickContext = createQuickSimContext(stats);
const baseResult = runQuickSim(quickContext);

// Modify one stat
stats.spellPower += 10;
const modifiedContext = createQuickSimContext(stats);
const modifiedResult = runQuickSim(modifiedContext);

// Calculate stat weight
const weight = (modifiedResult.dps - baseResult.dps) / 10;
```

## Adding a New Feature Flag

### Step 1: Add to FEATURE_FLAGS Array

```javascript
export const FEATURE_FLAGS = [
    // ... existing flags
    'hasMyNewFeature'
];
```

### Step 2: Detection in Main Code

```javascript
// In buildSimContext call
const context = buildSimContext({
    stats,
    features: {
        hasMyNewFeature: checkIfHasMyNewFeature()
    }
});
```

### Step 3: Use in Simulator

```javascript
// In ShamanCombatSim constructor
if (simContext.hasMyNewFeature) {
    this.initializeMyNewFeature();
}
```

## Adding a New Stat Key

### Step 1: Add to STAT_EXTRA_KEYS

```javascript
export const STAT_EXTRA_KEYS = [
    // ... existing keys
    'myNewStat'
];
```

This ensures:
- The stat is included in serialization
- It's converted to a number on deserialization
- No string concatenation bugs

## Worker Communication Pattern

### Main Thread

```javascript
import { buildSimContext, validateSimContext } from './sim/simContext.js';

// Build context
const context = buildSimContext({
    stats: characterStats,
    fightDuration: 120,
    iterations: 1000
});

// Validate
const { valid, errors } = validateSimContext(context);
if (!valid) throw new Error(errors.join(', '));

// Send to worker
worker.postMessage(context);
```

### Worker Thread

```javascript
import { deserializeStats } from './sim/simContext.js';

self.onmessage = (event) => {
    const context = event.data;
    
    // Deserialize stats (ensures numbers are numbers)
    context.stats = deserializeStats(context.stats);
    
    // Run simulation
    const sim = new ShamanCombatSim(context);
    const result = sim.run();
    
    // Send results back
    self.postMessage(result);
};
```

## Common Issues

### String Concatenation Bug

**Problem:** Stats arrive as strings from JSON, causing `"100" + 50 = "10050"` instead of `150`.

**Solution:** `deserializeStats()` converts STAT_EXTRA_KEYS to numbers.

### Missing Feature Flags

**Problem:** New feature added but not included in context.

**Solution:** Add to FEATURE_FLAGS array and include in features object.

### Serialization Failure

**Problem:** Functions or class instances can't be serialized.

**Solution:** `serializeStats()` only copies serializable types.
