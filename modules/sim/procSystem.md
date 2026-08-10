# Proc System

## Overview

The Proc System handles proc detection, triggering, internal cooldown (ICD) tracking, and PPM (procs per minute) normalization. It provides a centralized way to manage proc-based effects.

## File: `procSystem.js`

## Constants

### `ProcTrigger`

Enum for proc trigger types:

```javascript
ProcTrigger = {
    ON_MELEE_HIT: 'onMeleeHit',       // Triggers on any melee hit
    ON_MELEE_CRIT: 'onMeleeCrit',     // Triggers on melee crits only
    ON_SPELL_HIT: 'onSpellHit',       // Triggers on spell damage
    ON_SPELL_CRIT: 'onSpellCrit',     // Triggers on spell crits
    ON_SPELL_RESIST: 'onSpellResist', // Triggers when spell is partially/fully resisted
    ON_SPELL_CAST: 'onSpellCast',     // Triggers when casting
    ON_DAMAGE_TAKEN: 'onDamageTaken', // Triggers when taking damage
    ON_USE: 'onUse'                   // Active use (trinkets)
}
```

## Functions

### `calculatePpmProcChance(ppm, weaponSpeed)`

Calculate proc chance from PPM (procs per minute) and weapon speed.

**Parameters:**
- `ppm` (number) - Procs per minute value
- `weaponSpeed` (number) - Weapon speed in seconds

**Returns:** `number` - Proc chance as percentage (0-100)

**Formula:**
```
procChance = (ppm * weaponSpeed / 60) * 100
```

**Example:**
```javascript
// 2 PPM with 2.5 speed weapon
const chance = calculatePpmProcChance(2, 2.5);
// Returns: 8.33 (8.33% chance per hit)
```

### `rollProcChance(procChance, rng)`

Roll to determine if a proc triggers.

**Parameters:**
- `procChance` (number) - Proc chance as percentage (0-100)
- `rng` (Function) - Random number generator (returns 0-1)

**Returns:** `boolean` - True if proc triggers

### `detectEquippedProcs(gear, procDefinitions)`

Detect which procs are active based on equipped gear.

**Parameters:**
- `gear` (Object) - Equipped gear object (slot -> item)
- `procDefinitions` (Object) - Proc definitions from procs.js

**Returns:** `Array<Object>` - Array of active proc configurations

**Example:**
```javascript
const activeProcs = detectEquippedProcs(equippedGear, procDefinitions);
// Returns: [{ id: 'crusader', itemId: 12345, ... }, ...]
```

## Class: `ProcSystem`

### Constructor

```javascript
const procSystem = new ProcSystem({
    rng: Math.random,               // Random number generator
    getCurrentTime: () => time,     // Time provider function
    procDefinitions: procDefs       // Proc definitions object
});
```

### Methods

#### `registerProc(procId, procConfig)`

Register a proc for tracking.

**Parameters:**
- `procId` (string) - Unique identifier for the proc
- `procConfig` (Object) - Proc configuration:
  - `procChance` (number) - Proc chance percentage
  - `procType` (string) - Trigger type (from ProcTrigger)
  - `icd` (number) - Internal cooldown in seconds
  - `ppm` (number, optional) - Procs per minute (overrides procChance)

**Example:**
```javascript
procSystem.registerProc('crusader', {
    procChance: 5,
    procType: 'onMeleeHit',
    icd: 0
});
```

#### `unregisterProc(procId)`

Remove a proc from tracking.

**Parameters:**
- `procId` (string) - Proc identifier

#### `isOnCooldown(procId)`

Check if a proc is on internal cooldown.

**Parameters:**
- `procId` (string) - Proc identifier

**Returns:** `boolean`

#### `setInternalCooldown(procId, duration)`

Set internal cooldown for a proc.

**Parameters:**
- `procId` (string) - Proc identifier
- `duration` (number) - Cooldown duration in seconds

#### `attemptProc(procId, context = {})`

Attempt to trigger a proc.

**Parameters:**
- `procId` (string) - Proc identifier
- `context` (Object):
  - `triggerType` (string) - Type of trigger event
  - `weaponSpeed` (number) - Weapon speed (for PPM procs)

**Returns:** `boolean` - True if proc triggered

**Example:**
```javascript
// On melee hit
if (procSystem.attemptProc('crusader', { 
    triggerType: ProcTrigger.ON_MELEE_HIT,
    weaponSpeed: 2.5 
})) {
    // Apply Crusader effect
    applyStrengthBuff(100);
}
```

#### `getProcsForTrigger(triggerType)`

Get all procs that can trigger on a specific event.

**Parameters:**
- `triggerType` (string) - Type of trigger event

**Returns:** `Array<{id: string, config: Object}>`

#### `processTriggersForEvent(triggerType, context = {})`

Process all procs for a trigger event and return which ones triggered.

**Parameters:**
- `triggerType` (string) - Type of trigger event
- `context` (Object) - Trigger context

**Returns:** `Array<string>` - Array of proc IDs that triggered

**Example:**
```javascript
// Process all melee hit procs
const triggered = procSystem.processTriggersForEvent(
    ProcTrigger.ON_MELEE_HIT,
    { weaponSpeed: 2.5 }
);

for (const procId of triggered) {
    applyProcEffect(procId);
}
```

#### `recordProcDamage(procId, damage)`

Record damage dealt by a proc (for statistics).

**Parameters:**
- `procId` (string) - Proc identifier
- `damage` (number) - Damage dealt

#### `getStats()`

Get statistics for all registered procs.

**Returns:** Object with proc stats

```javascript
{
    'crusader': {
        attempts: 150,      // Times proc was attempted
        procs: 8,           // Times it actually procced
        totalDamage: 0      // Damage dealt (for damaging procs)
    }
}
```

#### `reset()`

Reset proc system for new simulation (clears ICDs and stats).

## Adding a New Proc

### Step 1: Define the Proc (in procs.js)

```javascript
export const procDefinitions = {
    // ... existing procs
    myNewProc: {
        id: 'myNewProc',
        itemId: 12345,           // Item ID that provides this proc
        procChance: 10,          // 10% chance
        procType: 'onMeleeHit',  // When it triggers
        icd: 2,                  // 2 second internal cooldown
        baseDamage: 100,         // If it deals damage
        effect: {
            // Effect details
        }
    }
};
```

### Step 2: Register in Simulator

```javascript
// During initialization
if (hasMyNewProcItem) {
    procSystem.registerProc('myNewProc', procDefinitions.myNewProc);
}
```

### Step 3: Handle the Trigger

```javascript
// When appropriate event occurs
if (procSystem.attemptProc('myNewProc', { triggerType: ProcTrigger.ON_MELEE_HIT })) {
    // Apply effect
    this.triggerMyNewProc();
}
```

### Step 4: Implement the Effect

```javascript
triggerMyNewProc() {
    const procDef = getProcById('myNewProc');
    const damage = procDef.baseDamage;
    
    // Deal damage
    this.recordDamage('My New Proc', damage, { type: 'proc' });
    
    // Track in proc system
    this.procSystem.recordProcDamage('myNewProc', damage);
}
```

## PPM vs Flat Chance

### Flat Proc Chance
- Same chance per hit regardless of weapon speed
- Fast weapons proc more often than slow weapons
- Use `procChance` in config

### PPM (Procs Per Minute)
- Normalizes proc rate based on weapon speed
- Fast and slow weapons proc at same rate per minute
- Use `ppm` in config (overrides `procChance`)

**Example:**
```javascript
// Flat 5% chance
{ procChance: 5 }

// 2 PPM (normalized)
{ ppm: 2 }
// With 2.0 speed: 6.67% chance
// With 3.0 speed: 10% chance
```

## Usage Example

```javascript
import { ProcSystem, ProcTrigger, detectEquippedProcs } from './sim/procSystem.js';
import { procDefinitions } from '../procs.js';

// Initialize
const procSystem = new ProcSystem({
    rng: this.rng.random,
    getCurrentTime: () => this.currentTime,
    procDefinitions
});

// Register equipped procs
const activeProcs = detectEquippedProcs(gear, procDefinitions);
for (const proc of activeProcs) {
    procSystem.registerProc(proc.id, proc);
}

// On melee hit
function onMeleeHit(weaponSpeed) {
    const triggered = procSystem.processTriggersForEvent(
        ProcTrigger.ON_MELEE_HIT,
        { weaponSpeed }
    );
    
    for (const procId of triggered) {
        handleProcEffect(procId);
    }
}
```

## Changelog

- **v1.1:** Fixed Crusader double-AP bug in `handleStatBuff` — when a proc uses `convertsTo` (e.g. strength→AP), the manual strength→AP fallback in the stat application block is now skipped. Previously both paths ran, applying AP twice per proc but only tracking half for removal on expiry, causing permanent AP leakage each proc cycle.
