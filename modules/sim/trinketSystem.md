# Trinket System Module

## Overview

The `trinketSystem.js` module handles on-use trinket activation, cooldown tracking, and buff management in a data-driven manner. It provides a centralized system for managing trinkets without requiring individual methods in the simulator class.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     trinketSystem.js                        │
├─────────────────────────────────────────────────────────────┤
│  TRINKET_DEFINITIONS                                        │
│    └─ Data definitions for each on-use trinket              │
├─────────────────────────────────────────────────────────────┤
│  State Management                                           │
│    ├─ initializeTrinketStates(ctx)                         │
│    ├─ getTrinketState(ctx, trinketId)                      │
│    └─ getTrinketDefinition(trinketId)                      │
├─────────────────────────────────────────────────────────────┤
│  Availability Checks                                        │
│    ├─ hasTrinket(ctx, trinketId)                           │
│    ├─ isTrinketReady(ctx, trinketId)                       │
│    ├─ isTrinketBuffActive(ctx, trinketId)                  │
│    └─ getTrinketCooldownRemaining(ctx, trinketId)          │
├─────────────────────────────────────────────────────────────┤
│  Activation                                                 │
│    └─ activateTrinket(ctx, trinketId, options)             │
├─────────────────────────────────────────────────────────────┤
│  Multiplier Helpers                                         │
│    ├─ getTrinketHasteMultiplier(ctx)                       │
│    ├─ getTrinketSpellDamageMultiplier(ctx)                 │
│    └─ getTrinketThreatMultiplier(ctx)                      │
└─────────────────────────────────────────────────────────────┘
```

## Supported Trinkets

| Trinket ID | Name | Effect | Duration | Cooldown |
|------------|------|--------|----------|----------|
| `natural_alignment_crystal` | Natural Alignment Crystal | +20% spell damage | 20s | 5 min |
| `shard_of_the_fallen_star` | Shard of the Fallen Star | Fire damage (400-443 + 25% SP) | Instant | 3 min |
| `eye_of_diminution` | Eye of Diminution | -35% threat | 20s | 3 min |
| `kiss_of_the_spider` | Kiss of the Spider | +20% haste | 15s | 3 min |

## Usage

### Basic Activation

```javascript
import { 
    initializeTrinketStates, 
    activateTrinket, 
    isTrinketReady 
} from './trinketSystem.js';

// Initialize at simulation start
initializeTrinketStates(ctx);

// Check if trinket is ready
if (isTrinketReady(ctx, 'natural_alignment_crystal')) {
    const result = activateTrinket(ctx, 'natural_alignment_crystal');
    if (result.success) {
        console.log('NAC activated!');
    }
}
```

### Getting Multipliers

```javascript
import { 
    getTrinketHasteMultiplier,
    getTrinketSpellDamageMultiplier 
} from './trinketSystem.js';

// Get combined haste from active trinkets (e.g., Kiss of the Spider)
const hasteMultiplier = getTrinketHasteMultiplier(ctx);
const effectiveAttackSpeed = baseAttackSpeed / hasteMultiplier;

// Get spell damage multiplier (e.g., Natural Alignment Crystal)
const spellDamageMultiplier = getTrinketSpellDamageMultiplier(ctx);
const boostedDamage = baseDamage * spellDamageMultiplier;
```

## API Reference

### State Management

#### `initializeTrinketStates(ctx)`
Initializes trinket state storage on the simulation context. Called automatically by `initializeAllSystems()`.

#### `getTrinketState(ctx, trinketId)`
Returns the current state for a specific trinket.

**Returns:**
```javascript
{
    cooldownReady: 0,      // Time when cooldown ends
    buffExpires: 0,        // Time when buff expires  
    isActive: false,       // Whether buff is currently active
    activationCount: 0     // Number of times activated
}
```

#### `getTrinketDefinition(trinketId)`
Returns the trinket definition merged with procs.js overrides.

### Availability Checks

#### `hasTrinket(ctx, trinketId)`
Checks if the trinket is equipped. Checks `simContext` flags and `stats` object.

#### `isTrinketReady(ctx, trinketId)`
Returns `true` if trinket is equipped AND off cooldown.

#### `isTrinketBuffActive(ctx, trinketId)`
Returns `true` if the trinket's buff is currently active.

#### `getTrinketCooldownRemaining(ctx, trinketId)`
Returns seconds until trinket is ready (0 if ready).

### Activation

#### `activateTrinket(ctx, trinketId, options)`
Activates a trinket, applying its effect and setting cooldown.

**Parameters:**
- `ctx` - Simulation context
- `trinketId` - Trinket identifier string
- `options.scheduleReactivation` - Whether to auto-reactivate on cooldown (default: true)

**Returns:**
```javascript
{
    success: true,
    // Additional fields based on effect type:
    damage: 500  // For damage trinkets
}
```

**Failure reasons:** `'not_equipped'`, `'on_cooldown'`, `'unknown_trinket'`

### Multiplier Helpers

#### `getTrinketHasteMultiplier(ctx)`
Returns combined haste multiplier from active trinkets. 1.0 = no bonus.

#### `getTrinketSpellDamageMultiplier(ctx)`
Returns combined spell damage multiplier. 1.0 = no bonus.

#### `getTrinketThreatMultiplier(ctx)`
Returns threat multiplier (for threat reduction). 1.0 = no reduction.

## Trinket Definition Schema

```javascript
{
    id: 'trinket_id',
    name: 'Display Name',
    itemId: 12345,
    duration: 20,           // Buff duration in seconds (0 for instant)
    cooldown: 180,          // Cooldown in seconds
    effect: {
        type: 'spellDamagePercent',  // Effect type
        value: 0.20                   // Effect value
    },
    triggersGCD: false,     // Whether activation triggers GCD
    autoReactivate: true    // Whether to auto-use on cooldown
}
```

**Effect Types:**
- `spellDamagePercent` - Increases spell damage by percentage
- `hastePercent` - Increases attack speed by percentage
- `threatReduction` - Reduces threat by percentage
- `damage` - Deals instant damage

## Legacy Compatibility

The trinket system maintains backward compatibility by setting legacy fields:

```javascript
// When NAC is activated:
ctx.naturalAlignmentCrystalExpires = buffExpires;

// When Shard is activated:
ctx.shardOfTheFallenStarCooldown = cooldownReady;

// When Eye is activated:
ctx.eyeOfDiminutionExpires = buffExpires;
ctx.eyeOfDiminutionCooldown = cooldownReady;

// When Kiss is activated:
ctx.kissOfTheSpiderExpires = buffExpires;
ctx.kissOfTheSpiderCooldown = cooldownReady;
```

## Integration with Other Systems

### Event System
Trinket expirations are scheduled via `ctx.scheduleEvent()` for automatic buff removal.

### Buff Tracking
Trinket activations are recorded in `ctx.buffUptime` for timeline display.

### Proc System
Damage trinkets (Shard) trigger `ctx.fireSpellHitTriggers()` for proc cascades.

## Adding New Trinkets

1. Add definition to `TRINKET_DEFINITIONS`:

```javascript
new_trinket: {
    id: 'new_trinket',
    name: 'New Trinket',
    itemId: 99999,
    duration: 15,
    cooldown: 120,
    effect: {
        type: 'spellDamagePercent',
        value: 0.10
    },
    triggersGCD: false,
    autoReactivate: true
}
```

2. Add detection in `hasTrinket()`:

```javascript
case 'new_trinket':
    if ('hasNewTrinket' in ctx.simContext) {
        return !!ctx.simContext.hasNewTrinket;
    }
    break;
```

3. Add activation handler if effect type is new (in `activateTrinket()` switch).

## Version History

- **v1.0.0** (2026-01-26): Initial implementation
  - Support for NAC, Shard, Eye, Kiss trinkets
  - State management and cooldown tracking
  - Multiplier helper functions
  - Legacy field compatibility
