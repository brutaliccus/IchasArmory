# Combat Stats

## Overview

The Combat Stats module aggregates damage statistics, tracks ability breakdowns, and provides summary information for simulation results. It supports both detailed tracking for result display and minimal tracking for performance.

## File: `combatStats.js`

## Constants

### `DEFAULT_COMBAT_STATS`

Default structure for combat statistics:

```javascript
DEFAULT_COMBAT_STATS = {
    totalHits: 0,
    totalCrits: 0,
    totalMisses: 0,
    totalDodges: 0,
    totalParries: 0,
    totalGlancingBlows: 0,
    totalResists: 0,
    hitDamageTotal: 0,
    critDamageTotal: 0,
    glancingDamageTotal: 0
}
```

### `DEFAULT_RESIST_TRACKING`

Default structure for resistance tracking:

```javascript
DEFAULT_RESIST_TRACKING = {
    totalChecks: 0,     // Total resistance checks made
    resist_75: 0,       // 75% resists
    resist_50: 0,       // 50% resists  
    resist_25: 0,       // 25% resists
    fullResists: 0      // 100% resists
}
```

## Class: `CombatStats`

### Constructor

```javascript
const combatStats = new CombatStats({
    quickSim: false    // Use detailed tracking
});
```

### Properties

- `totalDamage` - Total damage dealt
- `totalThreat` - Total threat generated
- `fightDuration` - Fight duration in seconds
- `totalHits` - Number of hits
- `totalCrits` - Number of crits
- `totalMisses` - Number of misses
- `totalDodges` - Number of dodges
- `totalParries` - Number of parries
- `totalGlancingBlows` - Number of glancing blows
- `totalResists` - Number of full resists
- `damageBreakdown` - Map of ability -> breakdown
- `timelineEvents` - Array of damage events
- `resistTracking` - Resistance statistics

### Methods

#### `recordDamage(event)`

Record a damage event.

**Parameters:**
- `event` (Object):
  - `ability` (string) - Ability name
  - `damage` (number) - Damage dealt
  - `threat` (number) - Threat generated
  - `outcome` (string) - 'hit', 'crit', 'miss', etc.
  - `time` (number) - Time of event
  - `extra` (Object) - Additional data (school, resistType, etc.)

**Example:**
```javascript
combatStats.recordDamage({
    ability: 'Lightning Bolt',
    damage: 1500,
    threat: 1800,
    outcome: 'crit',
    time: 5.5,
    extra: { school: 'nature', resistType: 'resist_25' }
});
```

#### `updateBreakdown(ability, damage, outcome, extra)`

Update damage breakdown for an ability (called by recordDamage).

**Parameters:**
- `ability` (string) - Ability name
- `damage` (number) - Damage dealt
- `outcome` (string) - Outcome type
- `extra` (Object) - Additional data

**Breakdown structure:**
```javascript
{
    totalDamage: number,    // Total damage from this ability
    hits: number,           // Number of hits
    crits: number,          // Number of crits
    misses: number,         // Number of misses
    dodges: number,         // Number of dodges
    parries: number,        // Number of parries
    glancingBlows: number,  // Number of glancing blows
    resists: number,        // Number of full resists
    minHit: number,         // Minimum hit damage
    maxHit: number,         // Maximum hit damage
    minCrit: number,        // Minimum crit damage
    maxCrit: number,        // Maximum crit damage
    casts: number,          // Total casts
    school: string          // Damage school
}
```

#### `setFightDuration(duration)`

Set the fight duration for DPS calculations.

**Parameters:**
- `duration` (number) - Duration in seconds

#### `getDps()`

Calculate DPS.

**Returns:** `number` - Damage per second

#### `getTps()`

Calculate TPS (Threat per second).

**Returns:** `number` - Threat per second

#### `getSortedBreakdown()`

Get damage breakdown sorted by damage (highest first).

**Returns:** Array of breakdown entries with calculated stats

```javascript
[
    {
        ability: 'Lightning Bolt',
        totalDamage: 50000,
        hits: 30,
        crits: 15,
        // ... other breakdown fields
        dps: 416.67,           // Calculated DPS contribution
        percentOfTotal: 45.2,  // % of total damage
        avgHit: 1111.11,       // Average hit damage
        critPercent: 33.33     // Crit rate percentage
    },
    // ... more abilities
]
```

#### `getSummary()`

Get complete summary statistics.

**Returns:**
```javascript
{
    totalDamage: number,
    totalThreat: number,
    fightDuration: number,
    dps: number,
    tps: number,
    
    // Attack outcomes
    totalAttacks: number,
    hitRate: number,      // % of attacks that hit
    critRate: number,     // % of hits that crit
    missRate: number,     // % of attacks that miss
    
    // Resistance info
    resistTracking: {...},
    
    // Breakdown
    breakdown: [...]
}
```

#### `getTimelineEvents(startTime = 0, endTime = Infinity)`

Get timeline events within a time range.

**Parameters:**
- `startTime` (number) - Start time
- `endTime` (number) - End time

**Returns:** Array of timeline events

#### `reset()`

Reset all statistics for a new simulation.

## Function: `mergeCombatStats(statsArray)`

Merge multiple CombatStats instances (for parallel simulation).

**Parameters:**
- `statsArray` (Array<CombatStats>) - Array of stats to merge

**Returns:** `CombatStats` - Merged statistics

**Usage:**
```javascript
// Run simulations in parallel workers
const results = await Promise.all(
    workers.map(w => w.runSimulation())
);

// Merge results
const mergedStats = mergeCombatStats(results.map(r => r.combatStats));
```

## Adding a New Tracking Metric

### Step 1: Add Property to Constructor

```javascript
constructor(config = {}) {
    // ... existing properties
    this.myNewMetric = 0;
}
```

### Step 2: Update in recordDamage

```javascript
recordDamage(event) {
    // ... existing logic
    
    if (event.extra.myCondition) {
        this.myNewMetric += event.damage;
    }
}
```

### Step 3: Include in Summary

```javascript
getSummary() {
    return {
        // ... existing fields
        myNewMetric: this.myNewMetric
    };
}
```

### Step 4: Handle in mergeCombatStats

```javascript
for (const stats of statsArray) {
    // ... existing merges
    merged.myNewMetric += stats.myNewMetric;
}
```

### Step 5: Include in reset

```javascript
reset() {
    // ... existing resets
    this.myNewMetric = 0;
}
```

## Usage Example

```javascript
import { CombatStats, mergeCombatStats } from './sim/combatStats.js';

const combatStats = new CombatStats({ quickSim: false });

// During simulation
function dealDamage(ability, baseDamage, isCrit) {
    const damage = isCrit ? baseDamage * 2 : baseDamage;
    const threat = damage * 1.2; // Example threat modifier
    
    combatStats.recordDamage({
        ability: ability.name,
        damage,
        threat,
        outcome: isCrit ? 'crit' : 'hit',
        time: currentTime,
        extra: { school: ability.school }
    });
}

// At end of simulation
combatStats.setFightDuration(fightDuration);

const summary = combatStats.getSummary();
console.log(`DPS: ${summary.dps.toFixed(2)}`);
console.log(`Crit Rate: ${summary.critRate.toFixed(1)}%`);

// Display breakdown
for (const entry of summary.breakdown) {
    console.log(`${entry.ability}: ${entry.percentOfTotal.toFixed(1)}% of damage`);
}
```

## Performance Considerations

- In `quickSim` mode, timeline events are not recorded
- Use `quickSim: true` for stat weight calculations
- `damageBreakdown` uses Map for O(1) lookup by ability
- `getSortedBreakdown()` creates a new sorted array each call
