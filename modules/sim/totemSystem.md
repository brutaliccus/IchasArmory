# Totem System

**Module:** `sim/totemSystem.js`  
**Version:** 1.1.0  
**Since:** 2026-01-26

### Changelog
- **v1.1.0:** Magma Totem changed to `usesGCD: false` (off-GCD, matching Searing Totem). Pre-fight fire totem drop now places Magma in AoE mode, Searing in ST.

## Overview

The Totem System handles totem lifecycle, attacks, detonations, and pulses in a data-driven manner. Instead of hardcoded `dropFireNovaTotem()`, `dropSearingTotem()` methods, this system reads from `totems.js` data file.

## Dependencies

```javascript
import { totemDefinitions, getTotemById, getTotemByKey, totemsConflict } from '../totems.js';
import { shamanSpells } from '../shamanSpells.js';
import { calculateSpellDamage } from '../shamanDamageCalc.js';
```

## Totem Slots

Shamans can have one totem of each element active at a time:

| Slot | Totems |
|------|--------|
| **Fire** | Fire Nova, Searing, Magma |
| **Earth** | Stoneclaw, Tremor, Stoneskin |
| **Water** | Mana Spring, Healing Stream |
| **Air** | Windfury Totem, Grace of Air |

Dropping a totem replaces any existing totem in the same slot.

## Behavior Types

### `detonate`
Totem explodes after a delay, dealing AoE damage.
- **Example:** Fire Nova Totem (4s base delay, 2s with Improved Fire Totems)
- **Behavior:** Schedule detonation, deal damage, remove totem, auto-drop replacement

### `autoAttack`
Totem attacks a target periodically.
- **Example:** Searing Totem (2.2s attack rate)
- **Behavior:** Schedule attacks, deal single-target damage, continue until expiration

### `pulse`
Totem pulses an effect periodically.
- **Example:** Stoneclaw (threat pulse), Magma (AoE damage pulse)
- **Behavior:** Initial effect on drop, periodic pulses, limited or unlimited

### `aura`
Passive buff effect while active.
- **Example:** Windfury Totem, Grace of Air
- **Behavior:** No scheduled actions, effect applied while totem exists

## Data Definitions (totems.js)

```javascript
export const totemDefinitions = {
    fireNova: {
        id: 'fire_nova_totem',
        name: 'Fire Nova Totem',
        slot: 'fire',
        spell: 'fireNovaTotem',      // Reference to shamanSpells.js
        behavior: 'detonate',
        duration: 5,
        cooldown: 15,
        usesGCD: true,
        behaviorConfig: {
            detonationDelay: 4,
            talentReduction: {
                talent: 'improvedFireTotems',
                reductionPerRank: 1
            }
        },
        icon: '...',
        color: '#FF4500'
    },
    
    searing: {
        id: 'searing_totem',
        name: 'Searing Totem',
        slot: 'fire',
        spell: 'searingTotem',
        behavior: 'autoAttack',
        duration: 55,
        cooldown: 0,
        usesGCD: false,              // Searing doesn't use GCD
        behaviorConfig: {
            baseAttackRate: 2.2,
            castDelay: 0.07,
            talentHaste: {
                talent: 'improvedFireTotems',
                hastePerRank: 0.10
            }
        }
    },
    
    stoneclaw: {
        id: 'stoneclaw_totem',
        slot: 'earth',
        spell: 'stoneclawTotem',
        behavior: 'pulse',
        duration: 15,
        cooldown: 30,
        usesGCD: false,
        behaviorConfig: {
            pulseInterval: 2.0,
            threatPerPulse: 136,
            initialThreat: 136,
            totalPulses: 8
        }
    }
};
```

## State Structure

```javascript
// Per-slot state (ctx._totemStates.fire, .earth, .water, .air)
{
    totemId: string|null,    // Active totem ID
    totemKey: string|null,   // Totem key in definitions
    droppedAt: number,       // Time dropped
    expiresAt: number,       // Expiration time
    nextAction: number,      // Next attack/pulse/detonate time
    actionCount: number      // Number of actions performed
}
```

## Exported Functions

### `initializeTotemStates(ctx)`

Initialize totem state tracking for all 4 element slots.

**Parameters:**
- `ctx` (Object) - Simulation context

**Example:**
```javascript
initializeTotemStates(ctx);
// ctx._totemStates now has fire, earth, water, air slots
```

---

### `getTotemState(ctx, slot)`

Get the state for a totem slot.

**Parameters:**
- `ctx` (Object) - Simulation context
- `slot` (string) - Element slot (`'fire'`, `'earth'`, `'water'`, `'air'`)

**Returns:** `TotemState` object

---

### `isTotemActive(ctx, slot)`

Check if a totem is active in a slot.

**Parameters:**
- `ctx` (Object) - Simulation context
- `slot` (string) - Element slot

**Returns:** `boolean`

**Example:**
```javascript
if (isTotemActive(ctx, 'fire')) {
    console.log('A fire totem is active');
}
```

---

### `getActiveTotem(ctx, slot)`

Get the active totem definition for a slot.

**Parameters:**
- `ctx` (Object) - Simulation context
- `slot` (string) - Element slot

**Returns:** Totem definition object or `null`

**Example:**
```javascript
const fireTotem = getActiveTotem(ctx, 'fire');
if (fireTotem?.behavior === 'autoAttack') {
    // Searing Totem is active
}
```

---

### `dropTotem(ctx, totemKey, options)`

Drop a totem, replacing any existing totem in the same slot. For persistent fire totems
(Searing, Magma — `autoAttack`/`pulse` behavior with no cooldown), an auto-redrop event
is scheduled at `expiresAt` so the totem stays active for the full fight.

**Parameters:**
- `ctx` (Object) - Simulation context
- `totemKey` (string) - Totem key from definitions (`'fireNova'`, `'searing'`, `'stoneclaw'`, etc.)
- `options` (Object) - Optional settings

**Returns:**
```javascript
{
    success: boolean,
    totem: Object,      // Totem definition
    state: Object,      // New totem state
    reason?: string     // If success is false
}
```

**Example:**
```javascript
// Drop Fire Nova Totem
const result = dropTotem(ctx, 'fireNova');
if (result.success) {
    console.log(`${result.totem.name} dropped, expires at ${result.state.expiresAt}`);
}
```

---

### `removeTotem(ctx, slot)`

Remove a totem from a slot (cancel it early).

**Parameters:**
- `ctx` (Object) - Simulation context
- `slot` (string) - Element slot

**Example:**
```javascript
// Remove fire totem before expiration
removeTotem(ctx, 'fire');
```

## Behavior Details

### Detonation (Fire Nova)

1. **Drop:** Schedule detonation event based on delay (affected by talents)
2. **Detonate:** 
   - Calculate damage from spell definition
   - Roll damage outcome
   - Record damage
   - Remove totem
   - Auto-drop fire totem as replacement: **Magma** when `stats.combatConfig.aoeEnabled`, else **Searing** — unless **`stats.combatConfig.searingTotemEnabled === false`**, in which case the ST Searing redrop is skipped (no fire totem replace after detonation in that case).

```javascript
// Internal flow
scheduleDetonation(ctx, 'fireNova', totem);
// After delay...
executeDetonation(ctx, 'fireNova');
// -> Calculates damage, records, removes, drops Magma or Searing per combatConfig
```

### Auto-Attack (Searing)

1. **Drop:** Schedule first attack
2. **Attack:** 
   - Calculate damage
   - Roll outcome
   - Record damage
   - Schedule next attack (if within duration)

```javascript
// Attack rate calculation
let attackRate = 2.2;  // Base
attackRate += 0.07;    // Cast delay
// With Improved Fire Totems (2 ranks)
attackRate *= (1 - 0.20);  // 20% faster = 1.81s
```

### Pulse (Stoneclaw)

1. **Drop:** Apply initial effect (threat)
2. **Pulse:** 
   - Apply effect (threat or damage)
   - Schedule next pulse (up to max pulses)

## Integration with Simulator

### Current State (v1.5.0)
The simulator's totem methods are wired to use the data-driven totem system when `USE_DATA_DRIVEN_TOTEMS = true`.

**Fire Nova Totem:**
- `dropFireNovaTotem()` delegates to `dropTotem(ctx, 'fireNova')`
- Detonation scheduled and executed by totem system
- After detonation, redrops **Magma** (AoE) or **Searing** (ST), respecting **`searingTotemEnabled`** for ST Searing

**Searing Totem:**
- `dropSearingTotem()` delegates to `dropTotem(ctx, 'searing')`
- Attacks scheduled and executed by totem system
- Auto-redrops when 55s duration expires (GCD suppressed)

**Stoneclaw Totem:**
- `dropStoneclawTotem()` delegates to `dropTotem(ctx, 'stoneclaw')`
- Threat pulses scheduled and executed by totem system

### Feature Flag
```javascript
this.USE_DATA_DRIVEN_TOTEMS = true;  // Enable data-driven totem system
```

### Legacy State Sync
Legacy state variables are synced for compatibility:
- `this.activeFireTotem` - 'searing', 'fireNova', or null
- `this.fireNovaDetonationTime` - detonation time
- `this.searingTotemNextAttack` - next attack time
- `this.stoneclawTotemNextPulse` - next pulse time

### Context Requirements

The totem system expects these on `ctx`:

```javascript
{
    currentTime: number,
    fightDuration: number,
    stats: {
        activeModifiers: { improvedFireTotems: number }
    },
    rng: { random: () => number },
    scheduleEvent: (time, type, callback, id) => void,
    unscheduleEvent: (id) => void,
    recordDamage: (name, damage, options) => void,
    triggerGCD: () => void,
    log: (message) => void
}
```

## Adding New Totems

1. **Add totem definition** to `totems.js`:
```javascript
export const totemDefinitions = {
    // ...existing totems...
    
    newTotem: {
        id: 'new_totem',
        name: 'New Totem',
        slot: 'earth',           // fire, earth, water, air
        spell: 'newTotemSpell',  // Reference to shamanSpells.js
        behavior: 'pulse',       // detonate, autoAttack, pulse, aura
        duration: 30,
        cooldown: 60,
        usesGCD: true,
        behaviorConfig: {
            pulseInterval: 3.0,
            // ... behavior-specific config
        },
        icon: 'spell_...',
        color: '#FFFFFF'
    }
};
```

2. **Add spell definition** to `shamanSpells.js` (if damage-dealing):
```javascript
newTotemSpell: {
    id: 99999,
    name: "New Totem",
    school: "nature",
    damageMin: 100,
    damageMax: 150,
    spCoefficient: 0.10,
    canCrit: true,
    modifiers: { /* ... */ }
}
```

## Testing

```javascript
import { initializeTotemStates, dropTotem, isTotemActive, getActiveTotem } from './sim/index.js';

const ctx = {
    currentTime: 0,
    fightDuration: 60,
    stats: { activeModifiers: {} },
    scheduleEvent: (t, type, cb, id) => console.log(`Scheduled ${id} at ${t}`),
    unscheduleEvent: (id) => console.log(`Unscheduled ${id}`),
    triggerGCD: () => console.log('GCD triggered'),
    log: (msg) => console.log(msg)
};

initializeTotemStates(ctx);

// Drop Fire Nova
const result = dropTotem(ctx, 'fireNova');
console.log('Drop result:', result);
console.log('Fire slot active:', isTotemActive(ctx, 'fire'));
console.log('Active totem:', getActiveTotem(ctx, 'fire')?.name);
```
