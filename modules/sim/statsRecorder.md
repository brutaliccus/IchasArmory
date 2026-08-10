# Stats Recorder Module

## Overview

The `statsRecorder.js` module handles UI reporting data collection, completely decoupled from simulation logic. It provides a clean separation between "what happens in the simulation" and "what gets displayed in the UI".

## Design Philosophy

```
┌────────────────────────┐     ┌─────────────────────────┐
│   Simulation Logic     │     │      UI Display         │
│  (damage, procs, etc.) │     │  (timelines, charts)    │
└──────────┬─────────────┘     └────────────▲────────────┘
           │                                │
           │  recordDamageEvent()           │  buildSimulationResults()
           ▼                                │
    ┌──────────────────────────────────────────────────┐
    │              statsRecorder.js                    │
    │  - Collects events during simulation             │
    │  - Formats data for UI consumption               │
    │  - Can be disabled in quickSim mode              │
    └──────────────────────────────────────────────────┘
```

**Key Benefits:**
- Simulation modules don't need to know about UI format requirements
- UI can be updated without touching simulation code
- Quick sim mode can skip recording entirely for performance
- Single source of truth for result formatting

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     statsRecorder.js                        │
├─────────────────────────────────────────────────────────────┤
│  State Management                                           │
│    ├─ initializeStatsRecorder(ctx, options)                │
│    ├─ getStatsRecorderState(ctx)                           │
│    ├─ shouldTrackDetails(ctx)                              │
│    └─ resetStatsRecorder(ctx)                              │
├─────────────────────────────────────────────────────────────┤
│  Event Recording                                            │
│    ├─ recordDamageEvent(ctx, ability, damage, data)        │
│    ├─ recordThreatEvent(ctx, ability, threat, data)        │
│    └─ logCombat(ctx, message)                              │
├─────────────────────────────────────────────────────────────┤
│  Result Building                                            │
│    └─ buildSimulationResults(ctx, fightDuration)           │
├─────────────────────────────────────────────────────────────┤
│  Utility Getters                                            │
│    ├─ getTotalDamage(ctx)                                  │
│    ├─ getTotalThreat(ctx)                                  │
│    ├─ getDamageEvents(ctx)                                 │
│    └─ getCombatStats(ctx)                                  │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Basic Recording

```javascript
import { 
    initializeStatsRecorder, 
    recordDamageEvent,
    buildSimulationResults 
} from './statsRecorder.js';

// Initialize at simulation start
initializeStatsRecorder(ctx, { quickSim: false });

// Record events during simulation
recordDamageEvent(ctx, 'Stormstrike', 500, {
    type: 'melee',
    outcome: 'crit',
    school: 'physical'
});

recordDamageEvent(ctx, 'Flame Shock DoT', 150, {
    type: 'dot',
    outcome: 'hit',
    school: 'fire'
});

// Build results at end
const results = buildSimulationResults(ctx, fightDuration);
// results.damageEvents, results.damageBreakdown, etc.
```

### Quick Sim Mode

```javascript
// In quick sim mode, detailed events are NOT recorded
initializeStatsRecorder(ctx, { quickSim: true });

// Totals are still tracked, but damageEvents array stays empty
recordDamageEvent(ctx, 'Stormstrike', 500, { type: 'melee' });

// getTotalDamage still works
const total = getTotalDamage(ctx); // 500

// But damageEvents is empty for performance
const events = getDamageEvents(ctx); // []
```

## API Reference

### State Management

#### `initializeStatsRecorder(ctx, options)`
Initializes the stats recorder on the context.

**Options:**
- `quickSim` (boolean, default: false) - Skip detailed event tracking

#### `getStatsRecorderState(ctx)`
Returns the internal state object.

#### `shouldTrackDetails(ctx)`
Returns `true` if detailed tracking is enabled (not quickSim).

#### `resetStatsRecorder(ctx)`
Resets all stats for a new simulation while preserving quickSim setting.

### Event Recording

#### `recordDamageEvent(ctx, abilityName, damage, eventData)`
Records a damage event.

**Parameters:**
- `abilityName` (string) - Name of the ability
- `damage` (number) - Damage dealt
- `eventData` (object):
  - `type` - Event type: `'melee'`, `'spell'`, `'proc'`, `'dot'`
  - `outcome` - Hit outcome: `'hit'`, `'crit'`, `'miss'`, `'dodge'`, `'parry'`, `'glancing'`, `'full_resist'`
  - `resistType` - Resist type: `'none'`, `'resist_25'`, `'resist_50'`, `'resist_75'`, `'full_resist'`
  - `school` - Damage school: `'physical'`, `'fire'`, `'nature'`, `'shadow'`, etc.
  - `threat` - Threat generated (defaults to damage)

#### `recordThreatEvent(ctx, abilityName, threat, eventData)`
Records a threat-only event (no damage).

#### `logCombat(ctx, message)`
Adds an entry to the combat log.

### Result Building

#### `buildSimulationResults(ctx, fightDuration)`
Builds the final results object for UI consumption.

**Returns:**
```javascript
{
    // Summary
    totalDamage: 150000,
    dps: 1250,
    totalThreat: 120000,
    tps: 1000,
    
    // Timeline data
    damageEvents: [
        { time: 0.5, ability: 'Stormstrike', damage: 500, ... },
        { time: 1.2, ability: 'Flame Shock', damage: 300, ... },
        ...
    ],
    
    // Breakdown by ability
    damageBreakdown: {
        'Stormstrike': {
            total: 25000,
            count: 50,
            percent: 16.67,
            threat: 25000,
            hits: 35,
            crits: 15,
            avgHit: 400,
            avgCrit: 800,
            ...
        },
        ...
    },
    
    // Combat statistics
    combatStats: {
        totalHits: 200,
        totalCrits: 50,
        totalMisses: 10,
        critRate: 20,
        missRate: 3.85,
        ...
    },
    
    // Buff uptime
    buffUptime: {
        flurry: {
            totalUptime: 45,
            uptimePercent: 37.5,
            procs: 20,
            activationTimes: [...]
        },
        ...
    },
    
    // Combat log
    combatLog: [
        { time: 0, message: 'Combat started' },
        ...
    ]
}
```

### Utility Getters

#### `getTotalDamage(ctx)`
Returns total damage dealt so far.

#### `getTotalThreat(ctx)`
Returns total threat generated so far.

#### `getDamageEvents(ctx)`
Returns the array of damage events.

#### `getCombatStats(ctx)`
Returns the raw combat statistics object.

## Internal State Schema

```javascript
{
    quickSim: false,
    
    // Timeline events
    damageEvents: [
        {
            time: 1.5,
            ability: 'Stormstrike',
            damage: 500,
            threat: 500,
            type: 'melee',
            outcome: 'crit',
            resistType: 'none',
            school: 'physical'
        }
    ],
    
    // Running totals
    totalDamage: 0,
    totalThreat: 0,
    
    // Combat statistics
    combatStats: {
        totalHits: 0,
        totalCrits: 0,
        totalMisses: 0,
        totalDodges: 0,
        totalParries: 0,
        totalGlancingBlows: 0,
        totalResists: 0,
        hitDamageTotal: 0,
        critDamageTotal: 0,
        glancingDamageTotal: 0,
        partialResists: {
            resist_75: 0,
            resist_50: 0,
            resist_25: 0
        },
        fullResists: 0
    },
    
    // Combat log
    combatLog: []
}
```

## Damage Breakdown Calculation

The breakdown is calculated from `damageEvents` array:

1. **Group by ability** - Sum damage, count events
2. **Calculate percentages** - Each ability's share of total
3. **Track per-ability stats** - Hits, crits, min/max values
4. **Sort by damage** - Descending order

```javascript
// Example breakdown entry
{
    total: 25000,      // Total damage from this ability
    count: 50,         // Number of casts/procs
    percent: 16.67,    // Percentage of total damage
    threat: 25000,     // Total threat generated
    hits: 35,          // Normal hits
    crits: 15,         // Critical hits
    misses: 0,         // Misses
    avgHit: 400,       // Average normal hit damage
    avgCrit: 800,      // Average crit damage
    minHit: 350,       // Minimum hit
    maxHit: 450,       // Maximum hit
    minCrit: 700,      // Minimum crit
    maxCrit: 900       // Maximum crit
}
```

## Integration with UI

The results object is consumed by `modules/shamanDPS.js`:

```javascript
// In shamanDPS.js
const results = buildSimulationResults(ctx, duration);

// Render timeline graph
renderDamageTimeline(results);

// Render damage breakdown table
renderDamageBreakdown(results.damageBreakdown);

// Render buff uptime bars
renderBuffTracking(results.buffUptime);

// Render proc timeline
renderProcUptimeTimeline(results.buffUptime, duration);
```

## Performance Considerations

### Quick Sim Mode
In quick sim mode (`quickSim: true`):
- `damageEvents` array stays empty
- `combatLog` stays empty  
- Only totals and combatStats are updated
- Result building is faster (no breakdown calculation)

This is used for running thousands of iterations where individual event tracking would be too slow.

### Memory Usage
- Each damage event is ~100 bytes
- A 2-minute fight might have 500-1000 events
- Total: ~100KB per iteration
- In quick sim: ~1KB per iteration

## Version History

- **v1.0.0** (2026-01-26): Initial implementation
  - Damage/threat event recording
  - Combat statistics tracking
  - Result building with breakdown
  - Quick sim mode support
  - Buff uptime integration
