# DOT System

**Module:** `sim/dotSystem.js`  
**Version:** 1.0.0  
**Since:** 2026-01-26

## Overview

The DOT (Damage Over Time) System handles DOT application, tick scheduling, damage snapshotting, and expiration in a data-driven manner. Instead of hardcoded `tickFlameShockDot()` methods, this system reads DOT configuration from spell definitions.

## Dependencies

```javascript
import { shamanSpells } from '../shamanSpells.js';
import { calculateSpellDamage } from '../shamanDamageCalc.js';
```

## Key Concepts

### Snapshotting
WoW Classic DOTs "snapshot" damage multipliers at the time of application. If Elemental Mastery (+15% damage) is active when you apply Flame Shock, the entire DOT benefits from that 15% bonus even after the buff expires.

**Snapshotted Multipliers:**
- Elemental Mastery (+15%)
- Natural Alignment Crystal (+20%)
- Nightfall (+10%)
- Elemental Fury (+10%)
- Elemental Weapons (+30% with Flametongue)
- Improved Scorch (+15%)
- Curse of Elements (+10%)
- Call of Flame (+15%)
- Concussion (+5%)

### Tick Scheduling
DOTs tick at fixed intervals (default 3 seconds for Flame Shock). Each tick is scheduled as an event. DOT ticks are subject to partial resists at **1/10th** the normal rate — the boss's hidden 24 level-based resistance effectively becomes 2.4 for DOT ticks. Any additional resistance is also scaled down by 10x. DOT tick resists also fire `fireSpellResistTriggers` (e.g. can proc Droplet of Nordrassil).

## Data Configuration (shamanSpells.js)

```javascript
flameShockDot: {
    id: 29228,
    name: "Flame Shock (DoT)",
    school: "fire",
    damagePerTick: 82,        // Base damage per tick
    ticks: 5,                 // Number of ticks
    duration: 15,             // Base duration in seconds
    spCoefficient: 0.0975,    // 9.75% per tick
    apCoefficient: 0.015,     // 1.5% per tick
    canCrit: false,           // DOTs cannot crit by default
    
    // === DATA-DRIVEN DOT CONFIG (v1.5.0) ===
    dot: {
        tickInterval: 3,       // 3s between ticks
        baseDuration: 15,      // 15s base duration
        snapshots: true,       // Damage snapshots on application
        canCrit: false,        // DOT ticks cannot crit
        refreshableWithClip: false  // Cannot refresh early
    },
    
    modifiers: {
        concussion: true,
        callOfFlame: true,
        elementalFury: true,
        elementalWeapons: true,
        curseOfElements: true,
        improvedScorch: true,
        nightfall: true,
        elementalMastery: true,
        naturalAlignmentCrystal: true
    }
}
```

## State Structure

```javascript
// Per-DOT state (ctx._dotStates.flameShockDot)
{
    active: boolean,           // Whether DOT is active
    appliedAt: number,         // Time DOT was applied
    expiresAt: number,         // Expiration time
    nextTick: number,          // Time of next tick
    tickCount: number,         // Number of ticks executed
    snapshotMultiplier: number, // Snapshotted damage multiplier
    snapshotStats: Object|null  // Snapshotted stats (optional)
}
```

## Exported Functions

### `initializeDotStates(ctx)`

Initialize DOT state tracking.

**Parameters:**
- `ctx` (Object) - Simulation context

**Example:**
```javascript
initializeDotStates(ctx);
// ctx._dotStates is now initialized
```

---

### `getDotState(ctx, spellKey)`

Get the state for a specific DOT.

**Parameters:**
- `ctx` (Object) - Simulation context
- `spellKey` (string) - Spell key (e.g., `'flameShockDot'`)

**Returns:** DOT state object

---

### `isDotActive(ctx, spellKey)`

Check if a DOT is currently active.

**Parameters:**
- `ctx` (Object) - Simulation context
- `spellKey` (string) - Spell key

**Returns:** `boolean`

**Example:**
```javascript
if (isDotActive(ctx, 'flameShockDot')) {
    console.log('Flame Shock DOT is ticking');
}
```

---

### `getDotTimeRemaining(ctx, spellKey)`

Get time remaining on a DOT.

**Parameters:**
- `ctx` (Object) - Simulation context
- `spellKey` (string) - Spell key

**Returns:** `number` - Time remaining in seconds (0 if not active)

**Example:**
```javascript
const remaining = getDotTimeRemaining(ctx, 'flameShockDot');
if (remaining > 3) {
    // Don't refresh yet, still has time
}
```

---

### `applyDot(ctx, spellKey, options)`

Apply a DOT to the target.

**Parameters:**
- `ctx` (Object) - Simulation context
- `spellKey` (string) - Spell key from shamanSpells.js
- `options` (Object):
  - `durationBonus` (number) - Extra duration (e.g., from set bonus)

**Returns:**
```javascript
{
    success: boolean,
    state: Object,           // DOT state
    duration: number,        // Total duration
    snapshotMultiplier: number  // Snapshotted multiplier
}
```

**Example:**
```javascript
// Apply Flame Shock DOT with T2 3pc bonus (Garb of the Ten Storms, +6s)
const result = applyDot(ctx, 'flameShockDot', {
    durationBonus: ctx.stats.setBonuses?.garb_ten_storms_3pc_flame_shock_dot_duration || 0
});

if (result.success) {
    console.log(`DOT applied for ${result.duration}s with ${result.snapshotMultiplier.toFixed(2)}x multiplier`);
}
```

---

### `removeDot(ctx, spellKey)`

Remove/cancel a DOT early.

**Parameters:**
- `ctx` (Object) - Simulation context
- `spellKey` (string) - Spell key

**Example:**
```javascript
// Cancel Flame Shock DOT (e.g., target died)
removeDot(ctx, 'flameShockDot');
```

---

### `processDotTick(ctx, spellKey)`

Process a single DOT tick. Usually called by scheduled events.

**Parameters:**
- `ctx` (Object) - Simulation context
- `spellKey` (string) - Spell key

**Returns:**
```javascript
{
    damage: number,      // Damage dealt
    resistType: string,  // Resistance result
    isCrit: boolean,     // Whether it crit (usually false for DOTs)
    tickNumber: number   // Which tick this was
}
```

## Snapshot Calculation

The snapshot multiplier is calculated at application time:

```javascript
function calculateSnapshotMultiplier(ctx, spell) {
    let multiplier = 1.0;
    const modifiers = spell.modifiers || {};
    
    // Elemental Mastery (+15%)
    if (modifiers.elementalMastery && ctx.stats?.activeModifiers?.elementalMastery) {
        multiplier *= 1.15;
    }
    
    // Natural Alignment Crystal (+20%)
    if (modifiers.naturalAlignmentCrystal && ctx.stats?.activeModifiers?.naturalAlignmentCrystal) {
        multiplier *= 1.20;
    }
    
    // Nightfall (+10%)
    if (modifiers.nightfall && ctx.nightfallEnabled && ctx.isNightfallActive?.()) {
        multiplier *= 1.10;
    }
    
    // Fire damage multipliers (for fire DOTs)
    if (spell.school === 'fire') {
        if (modifiers.elementalFury && ctx.stats?.activeModifiers?.elementalFury) {
            multiplier *= 1.10;
        }
        if (modifiers.elementalWeapons && ctx.stats?.activeModifiers?.flametongueActive) {
            multiplier *= 1.30;
        }
        if (modifiers.improvedScorch && ctx.stats?.activeModifiers?.improvedScorch) {
            multiplier *= 1.15;
        }
        if (modifiers.curseOfElements && ctx.stats?.activeModifiers?.curseOfElements) {
            multiplier *= 1.10;
        }
        if (modifiers.callOfFlame && ctx.stats?.activeModifiers?.callOfFlame) {
            multiplier *= 1.15;
        }
        if (modifiers.concussion && ctx.stats?.activeModifiers?.concussion) {
            multiplier *= 1.05;
        }
    }
    
    return multiplier;
}
```

## Integration with Simulator

### Current State (Legacy)
Simulator has inline Flame Shock DOT tick logic in `castAbility()` and `tickFlameShockDot()`.

### Migration Path
1. Import DOT system functions
2. Replace inline DOT application with `applyDot(ctx, 'flameShockDot', options)`
3. Replace tick handler with `processDotTick(ctx, 'flameShockDot')`
4. Remove legacy code once validated

### Context Requirements

```javascript
{
    currentTime: number,
    fightDuration: number,
    stats: {
        activeModifiers: { elementalMastery, naturalAlignmentCrystal, ... },
        spellPower: number,
        fireDamage: number
    },
    rng: { random: () => number },
    scheduleEvent: (time, type, callback, id) => void,
    unscheduleEvent: (id) => void,
    recordDamage: (name, damage, options) => void,
    rollForResistance: (school, options) => { multiplier, type },
    rollForCrit: (spell, isPhysical) => boolean,
    log: (message) => void
}
```

## Adding New DOTs

1. **Add spell definition** to `shamanSpells.js`:
```javascript
newDot: {
    id: 99999,
    name: "New DOT",
    school: "nature",
    damagePerTick: 50,
    ticks: 4,
    duration: 12,
    spCoefficient: 0.05,
    canCrit: false,
    
    dot: {
        tickInterval: 3,
        baseDuration: 12,
        snapshots: true,
        canCrit: false
    },
    
    modifiers: {
        stormstrike: true,
        nightfall: true,
        // ... other applicable modifiers
    }
}
```

2. **Apply the DOT** in spell casting logic:
```javascript
if (spellKey === 'newSpell') {
    applyDot(ctx, 'newDot', { durationBonus: 0 });
}
```

## Testing

```javascript
import { initializeDotStates, applyDot, isDotActive, processDotTick } from './sim/index.js';

const ctx = {
    currentTime: 0,
    fightDuration: 60,
    stats: {
        activeModifiers: { elementalMastery: true },
        spellPower: 500,
        fireDamage: 100
    },
    scheduleEvent: (t, type, cb, id) => console.log(`Scheduled ${id} at ${t}`),
    unscheduleEvent: (id) => console.log(`Unscheduled ${id}`),
    recordDamage: (name, dmg, opts) => console.log(`${name}: ${dmg.toFixed(2)}`),
    rollForResistance: (school) => ({ multiplier: 1.0, type: 'none' }),
    log: (msg) => console.log(msg)
};

initializeDotStates(ctx);

// Apply DOT with EM active (should snapshot 1.15x)
const result = applyDot(ctx, 'flameShockDot');
console.log('Applied:', result);
console.log('Snapshot multiplier:', result.snapshotMultiplier);  // Should be 1.15

// Simulate a tick
ctx.currentTime = 3;
const tickResult = processDotTick(ctx, 'flameShockDot');
console.log('Tick result:', tickResult);
```
