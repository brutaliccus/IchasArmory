# Damage System

## Overview

The Damage System provides damage calculation utilities including resistance mechanics, armor reduction, and crit multipliers. This module contains helper functions extracted from the main simulator.

**Target school immunity:** If `ctx.stats.targetSchoolImmune` marks a school immune, **`rollDamage`** / **`calculateExpectedDamage`** return **0** damage (no table roll); **`rollForResistanceStandalone`** returns `{ multiplier: 0, type: 'immune' }`. Wired from `modules/shaman/targetSchoolImmunity.js`.

**Winter's Chill:** Raid debuff sets `stats.wintersChillFrostCritBonus` (decimal); **`rollForCrit`** and **`calculateExpectedDamage`** add it to spell crit when `spell.school === 'frost'` (not a damage-taken multiplier).

## File: `damageSystem.js`

## Resistance Model (royalgiraffe)

The resistance system uses the **royalgiraffe cap-ratio model** based on empirical data from WoW Classic.
Source: https://royalgiraffe.github.io/legacy-sim/#/resistances

### Key Formulas

For a level 60 player attacking a level 63 boss:

```
resistanceCap = max(5 * attackerLevel, 100) = 300
levelBasedResistance = 8 * max(0, targetLevel - attackerLevel) = 24  [non-binary spells only]
effectiveResistance = max(0, resistance - spellPen) + levelBasedResistance
ratio = min(1, effectiveResistance / resistanceCap)
avgMitigation = 0.75 * ratio - (3/16) * max(0, ratio - 2/3)
```

Level-based resistance (24 for L63 boss) cannot be reduced by spell penetration or curses.

### Outcome Table

4 reference points linearly interpolated:

| Ratio (% of cap) | 0% resist | 25% resist | 50% resist | 75% resist |
|---|---|---|---|---|
| 0/3 (0%) | 100% | 0% | 0% | 0% |
| 1/3 (33%) | 24% | 55% | 18% | 3% |
| 2/3 (67%) | 0% | 22% | 56% | 22% |
| 3/3 (100%) | 0% | 4% | 16% | 80% |

No 100% resist outcome for non-binary spells (max is 75% resist).
Below 2/3 of cap, minimum 1% chance of full damage (0% resist).

## Constants

### `RESISTANCE_TABLE`

4-point interpolation table for resist outcome probabilities.

```javascript
RESISTANCE_TABLE = [
    [100,  0,  0,  0],   // ratio = 0/3 (0% of cap)
    [ 24, 55, 18,  3],   // ratio = 1/3 (~33% of cap)
    [  0, 22, 56, 22],   // ratio = 2/3 (~67% of cap)
    [  0,  4, 16, 80]    // ratio = 3/3 (100% of cap)
]
```

### `DamageOutcome`

Enum for damage outcome types.

```javascript
DamageOutcome = {
    HIT: 'hit',
    CRIT: 'crit',
    MISS: 'miss',
    DODGE: 'dodge',
    PARRY: 'parry',
    GLANCING: 'glancing',
    FULL_RESIST: 'full_resist'
}
```

### `ResistType`

Enum for resistance result types.

```javascript
ResistType = {
    NONE: 'none',
    RESIST_25: 'resist_25',
    RESIST_50: 'resist_50',
    RESIST_75: 'resist_75',
    FULL_RESIST: 'full_resist'
}
```

## Functions

### `calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, isBinary)`

Calculate all resistance stats (ratio, avg mitigation, effective resistance, etc.).

**Parameters:**
- `resistance` (number) - Target's base resistance value
- `spellPen` (number) - Caster's spell penetration (default 0)
- `attackerLevel` (number) - Caster's level (default 60)
- `targetLevel` (number) - Target's level (default 63)
- `isBinary` (boolean) - Whether the spell is binary (default false)

**Returns:** `{ratio, avgMitigation, effectiveResistance, levelBasedResistance, resistanceCap}`

### `getResistanceTableEntry(ratio)`

Get interpolated resistance outcome probabilities from the 4-point table.

**Parameters:**
- `ratio` (number) - Resistance ratio (effectiveResistance / cap), 0-1

**Returns:** `number[]` - Array of 4 probabilities [0% resist, 25% resist, 50% resist, 75% resist]

### `calculateMitigationPercent(resistance, spellPen, attackerLevel, targetLevel, isBinary)`

Convenience wrapper returning mitigation as a 0-75 percentage (for tooltip display).

**Parameters:** Same as `calculateResistanceStats`.

**Returns:** `number` - Mitigation percentage (0-75)

### `rollResistance(ratio, rng)`

Roll for resistance outcome using the 4-point interpolation table.

**Parameters:**
- `ratio` (number) - Resistance ratio (0-1)
- `rng` (Function) - Random number generator (returns 0-1)

**Returns:** `{multiplier: number, type: string}`
- `multiplier` - Damage multiplier (0.25, 0.5, 0.75, or 1.0)
- `type` - Resist type from `ResistType` enum

### `rollForResistanceStandalone(ctx, school, options)`

Roll for resistance using simulation context (reads resistance from stats).

**Parameters:**
- `ctx` (Object) - Simulation context with stats, rng
- `school` (string) - Spell school
- `options` (Object|boolean) - Options object, or legacy boolean for `isBinary`
  - `isBinary` (boolean) - Whether the spell is binary (default false)
  - `isDot` (boolean) - Whether this is a DOT tick; uses 1/10th effective resistance (default false)

**DOT resistance:** DOTs are subject to partial resists at 1/10th the normal rate. The resistance ratio is divided by 10 before rolling, so the boss's hidden 24 level-based resistance effectively becomes 2.4 for DOT ticks. Any additional resistance is also scaled down by 10x.

**Returns:** `{multiplier: number, type: string}`

### `calculateExpectedResistanceMultiplier(ratio)`

Calculate expected (average) damage multiplier from resistance ratio.

**Parameters:**
- `ratio` (number) - Resistance ratio (0-1)

**Returns:** `number` - Expected damage multiplier (0-1)

### `calculateArmorReduction(armor, attackerLevel = 60)`

Calculate armor damage reduction multiplier.

**Parameters:**
- `armor` (number) - Target armor value
- `attackerLevel` (number) - Attacker's level (default 60)

**Returns:** `number` - Damage multiplier (1 - reduction)

**Formula:**
```
reduction = armor / (armor + 400 + 85 * attackerLevel)
multiplier = 1 - reduction
```

### `getCritMultiplier(school, elementalFuryRank = 0, isEchoedThunder = false)`

Get crit damage multiplier for a spell school.

**Parameters:**
- `school` (string) - Spell school ('physical', 'fire', 'frost', 'nature', etc.)
- `elementalFuryRank` (number) - Rank of Elemental Fury talent (0-2)
- `isEchoedThunder` (boolean) - Special case for Echoed Thunder

**Returns:** `number` - Crit damage multiplier

**Logic:**
- Physical: Always 2.0x
- Echoed Thunder: Always 1.5x
- Fire/Frost/Nature: 1.5x + 0.25x per Elemental Fury rank (max 2.0x)
- Other schools: 1.5x

## Class: `DamageSystem`

A helper class that combines resistance calculations with stats.

### Constructor

```javascript
const damageSystem = new DamageSystem({
    stats: characterStats,    // Stats object with resistance values
    rng: Math.random,         // RNG function
    combatStats: combatStats  // Combat stats tracker
});
```

### Methods

#### `rollForResistance(school)`

Roll for resistance based on stats and spell school.

**Parameters:**
- `school` (string) - Spell school

**Returns:** `{multiplier: number, type: string}`

#### `getExpectedResistanceMultiplier(school)`

Get expected resistance multiplier for deterministic mode.

**Parameters:**
- `school` (string) - Spell school

**Returns:** `number`

#### `reset()`

Reset damage tracking.

#### `getResults()`

Get damage results.

**Returns:** `{damageEvents: Array, totalDamage: number, totalThreat: number}`

## Usage Example

```javascript
import { 
    calculateResistanceStats,
    rollResistance, 
    calculateExpectedResistanceMultiplier,
    getCritMultiplier 
} from './sim/damageSystem.js';

// Calculate resistance stats for L60 player vs L63 boss
const resistStats = calculateResistanceStats(75, 15, 60, 63, false);
// resistStats.ratio = effective resist / cap
// resistStats.avgMitigation = expected damage reduction
// resistStats.levelBasedResistance = 24

// Roll for resistance outcome in sim
const resistResult = rollResistance(resistStats.ratio, Math.random);
let damage = baseDamage * resistResult.multiplier;

// Or get expected multiplier for deterministic calc
const expectedMult = calculateExpectedResistanceMultiplier(resistStats.ratio);

// Apply crit if applicable
if (isCrit) {
    const critMult = getCritMultiplier('fire', 2);
    damage *= critMult;
}
```

## Haste Sources in `getHasteMultiplier()`

Provides **dynamic buff haste only** for auto-attack scheduling. Gear/passive haste is NOT included here — it's already baked into `autoAttackSpeed` (= `stats.weaponSpeed`) by `createShamanStatsFromCharacter`.

| Source | Amount | Detection |
|--------|--------|-----------|
| Flurry | Talent-rank % | `_procStates.flurry` (charge-based), else legacy `activeProcs.flurry.attacksRemaining` |
| Might of the Hippogryph (3pc) | 20% | `_setBonusStates.hippogryphMight` while `charges > 0` and not expired; charges removed on Auto / Windfury / Stormstrike / Lightning Strike in `consumeHippogryphMightCharge`; **separate `if` after Flurry** |
| Stormwolf's Frenzy | 10% | Set bonus state |
| Bloodlust | 20% | `_procStates.bloodlust` |
| Kiss of the Spider | 20% | `_procStates.kiss_of_the_spider` |
| Potion of Quickness | 5% | `_procStates.potion_of_quickness` |
| Juju Flurry | 3% | `_procStates.juju_flurry` |
| Elemental Weapons WF haste | 1% per stack (max 2/4/6) | `ewWindfuryHasteStacks` + `ewWindfuryHasteExpires` |

`getSpellHasteMultiplier()` **does** include gear haste (via `meleeHaste`) since spell cast times don't use `weaponSpeed`. Juju Flurry and Bloodlust also appear there. **Flurry (talent)** is intentionally **excluded** — it only grants melee attack speed haste, not spell/cast haste.
