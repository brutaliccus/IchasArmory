# Threat System Module

## Overview

The `threatSystem.js` module handles threat calculation from damage for all ability sources. It applies various multipliers based on talents, buffs, imbues, and trinkets.

## Threat Formula

```
threat = damage 
    × abilityMultiplier (Earth Shock: 1.5x)
    × spiritArmorMult
    × rockbiterMult
    × calmingWindsReduction (if no Rockbiter)
    × salvationMult
    × eyeOfDiminutionReduction (if active)
    × totemicAlignmentTransfer (if totem damage)
```

## API Reference

### Constants

#### `CALMING_WINDS_ABILITIES`
Abilities affected by Calming Winds talent:
```javascript
['Auto Attack', 'Flametongue Weapon', 'Lightning Strike (Physical)', 
 'Lightning Strike (Nature)', 'Stormstrike', 'Windfury Attack']
```

#### `THREAT_MULTIPLIERS`
Abilities with bonus threat:
```javascript
{
    'Earth Shock': 1.5  // 150% threat
}
```

### Functions

#### `calculateThreat(ctx, damage, abilityName, options)`
Main threat calculation function.

**Parameters:**
- `ctx` - Simulation context
- `damage` - Damage dealt
- `abilityName` - Name of the ability
- `options.isTotem` - Whether this is totem damage (default: false)

**Returns:** Calculated threat value

```javascript
const threat = calculateThreat(ctx, 500, 'Earth Shock');
// Returns: 500 * 1.5 * multipliers
```

#### `isEyeOfDiminutionActive(ctx)`
Checks if Eye of Diminution is active (data-driven or legacy).

#### `getThreatMultiplier(ctx, abilityName, options)`
Returns combined threat multiplier for display/tooltips.

#### `getThreatFromDamage(ctx, damage, abilityName)`
Legacy compatibility wrapper for `calculateThreat()`.

## Stat Keys

The system expects these keys on `ctx.stats`:

| Key | Description | Example |
|-----|-------------|---------|
| `threatSpiritArmorMult` | Spirit Armor talent | 1.15 = +15% |
| `threatRockbiterMult` | Rockbiter imbue | 1.5 = +50% |
| `threatCalmingWindsReduction` | Calming Winds % | 25 = -25% |
| `threatSalvationMult` | Salvation buff | 0.7 = -30% |
| `totemicAlignmentThreatPercent` | Totem transfer % | 30 = 30% |

## Usage Examples

### Basic Threat Calculation

```javascript
import { calculateThreat } from './threatSystem.js';

const damage = 500;
const threat = calculateThreat(ctx, damage, 'Stormstrike');
```

### With Totem Damage

```javascript
// Totem damage uses Totemic Alignment transfer
const threat = calculateThreat(ctx, damage, 'Searing Totem', { isTotem: true });
// If totemicAlignmentThreatPercent = 30, returns 30% of calculated threat
```

### Getting Multiplier for UI

```javascript
import { getThreatMultiplier } from './threatSystem.js';

const mult = getThreatMultiplier(ctx, 'Earth Shock');
// Returns: 1.5 * all other multipliers
```

## Integration

The threat system integrates with:
- **trinketSystem.js** - Eye of Diminution active check
- **statsRecorder.js** - Threat is passed to `recordDamageEvent()`
- **shamanCombatSim.js** - `recordDamage()` calls `calculateThreat()`

## Version History

- **v1.0.0** (2026-01-27): Initial extraction from shamanCombatSim.js
  - `calculateThreat()` - Main calculation function
  - `getThreatMultiplier()` - For UI display
  - `isEyeOfDiminutionActive()` - Trinket check
  - `getThreatFromDamage()` - Legacy wrapper
