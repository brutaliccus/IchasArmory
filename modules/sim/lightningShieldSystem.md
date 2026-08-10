# Lightning Shield System

**Module:** `sim/lightningShieldSystem.js`  
**Version:** 1.0.0  
**Since:** 2026-01-26

## Overview

The Lightning Shield System handles Lightning Shield and Empowered Lightning Shield processing in a data-driven manner. This includes charge tracking, internal cooldowns, damage calculation, and Stormstrike interaction.

## Dependencies

```javascript
import { shamanSpells } from '../shamanSpells.js';
import { calculateSpellDamage } from '../shamanDamageCalc.js';
import { fireSpellHitTriggers, fireSpellResistTriggers } from './triggerRouter.js';
```

## Shield Types

### Lightning Shield (Reactive)
- **Trigger:** When player takes damage (being hit)
- **Behavior:** Deals nature damage to attacker, consumes 1 charge by default
- **Optional:** `triggerLightningShield(ctx, source, { consumeCharge: false })` — Garb of the Ten Storms 5pc (and similar) deal LS damage and advance ICD **without** decrementing charges; buff uptime “consumption” logging is skipped for these free procs
- **ICD:** 3 seconds base, 4 seconds with Stable Shields talent
- **Charges:** 3 charges, reapplied when depleted (if configured)
- **Cannot:** Miss or be dodged (thorns-like effect)
- **Proc triggers:** Fires `fireSpellHitTriggers` on every hit; fires `fireSpellResistTriggers` when partially/fully resisted (e.g. triggers Droplet of Nordrassil)

### Empowered Lightning Shield (Proactive)
- **Trigger:** On Lightning Strike hit (also via set bonuses like Stormhowl 3pc)
- **Behavior:** Deals nature damage, NO cooldown (procs every time Lightning Strike hits)
- **Stormstrike:** Consumes charge, benefits from +25% damage
- **Cannot:** Miss
- **Note:** The 9s cooldown is on Lightning Strike ability, NOT ELS
- **Proc triggers:** Fires `fireSpellHitTriggers` on every hit; fires `fireSpellResistTriggers` when partially/fully resisted (e.g. triggers Droplet of Nordrassil)

## Spell Definitions (shamanSpells.js)

```javascript
lightningShield: {
    id: 10432,
    name: "Lightning Shield",
    school: "nature",
    damageMin: 198,
    damageMax: 198,
    spCoefficient: 0.27,       // 27%
    apCoefficient: 0.0,
    icd: 3,                    // 3s internal cooldown
    canCrit: false,
    canMiss: false,            // Cannot miss
    canBeBuffedByStormstrike: true,
    consumesStormstrikeCharge: false,  // Does NOT consume SS
    modifiers: {
        stormstrike: true,     // Benefits but doesn't consume
        elementalFury: true,   // +10% damage only
        nightfall: true,
        elementalMastery: true,
        naturalAlignmentCrystal: true
    }
},

empoweredLightningShield: {
    id: 52422,
    name: "Empowered Lightning Shield",
    school: "nature",
    damageMin: 198,
    damageMax: 198,
    spCoefficient: 0.27,       // 27%
    apCoefficient: 0.25,       // 25% AP scaling
    // Note: ELS has NO cooldown - it procs every time LS hits while shield is active
    canCrit: false,
    canMiss: false,
    canBeBuffedByStormstrike: true,
    consumesStormstrikeCharge: true,   // Consumes SS charge
    modifiers: {
        stormstrike: true,     // Consumes charge, +25%
        elementalFury: true,
        nightfall: true,
        elementalMastery: true,
        naturalAlignmentCrystal: true
    }
}
```

## State Structures

### Lightning Shield State
```javascript
{
    active: boolean,      // Whether shield is active
    charges: number,      // Current charges (0-3)
    maxCharges: number,   // Maximum charges (3)
    lastTrigger: number,  // Time of last trigger (for ICD)
    totalDamage: number,  // Cumulative damage for stats
    triggerCount: number  // Number of times triggered
}
```

### Empowered Lightning Shield State
```javascript
{
    lastTrigger: number,  // Time of last trigger (for stats only, no cooldown)
    totalDamage: number,  // Cumulative damage
    triggerCount: number  // Number of times triggered
}
```

## Exported Functions

### `initializeLightningShieldStates(ctx)`

Initialize both LS and ELS state tracking.

**Parameters:**
- `ctx` (Object) - Simulation context

---

### `getLightningShieldState(ctx)`

Get Lightning Shield state.

**Returns:** Lightning Shield state object

---

### `getEmpoweredLightningShieldState(ctx)`

Get Empowered Lightning Shield state.

**Returns:** ELS state object

---

### `applyLightningShield(ctx, options)`

Apply Lightning Shield (give charges).

**Parameters:**
- `ctx` (Object) - Simulation context
- `options` (Object):
  - `charges` (number, default 3) - Number of charges

**Returns:**
```javascript
{ success: boolean, charges: number }
```

**Example:**
```javascript
// Apply 3 charges of Lightning Shield
applyLightningShield(ctx);
```

---

### `isLightningShieldReady(ctx)`

Check if Lightning Shield can trigger (has charges and off ICD).

**Returns:** `boolean`

**Example:**
```javascript
if (isLightningShieldReady(ctx)) {
    // LS will proc on next hit taken
}
```

---

### `triggerLightningShield(ctx, triggerSource)`

Trigger Lightning Shield when player takes damage.

**Parameters:**
- `ctx` (Object) - Simulation context
- `triggerSource` (string, default `'Being Hit'`) - What triggered this

**Returns:**
```javascript
{
    damage: number,           // Damage dealt
    isCrit: boolean,          // Always false
    resistType: string,       // Resistance result
    chargesRemaining: number  // Charges left after trigger
}
```
Or `null` if not ready.

**Example:**
```javascript
// In onBeingHit handler
const lsResult = triggerLightningShield(ctx, 'Boss Melee');
if (lsResult) {
    console.log(`LS dealt ${lsResult.damage}, ${lsResult.chargesRemaining} charges left`);
}
```

---

### `isEmpoweredLightningShieldReady(ctx)`

Check if Empowered Lightning Shield can trigger (always returns true - ELS has no cooldown).

**Returns:** `boolean` (always true)

---

### `triggerEmpoweredLightningShield(ctx, triggerSource)`

Trigger Empowered Lightning Shield on Lightning Strike hit.

**Parameters:**
- `ctx` (Object) - Simulation context
- `triggerSource` (string, default `'Lightning Strike'`) - What triggered this

**Returns:**
```javascript
{
    damage: number,      // Damage dealt
    isCrit: boolean,     // Always false
    resistType: string   // Resistance result
}
```
Note: Always returns a result when called (ELS has no cooldown). Returns null only if spell data is missing.

**Example:**
```javascript
// After Lightning Strike hits
if (isEmpoweredLightningShieldReady(ctx)) {
    const elsResult = triggerEmpoweredLightningShield(ctx, 'Lightning Strike');
    if (elsResult) {
        console.log(`ELS dealt ${elsResult.damage}`);
    }
}
```

---

### `getEmpoweredLightningShieldCooldown(ctx)`

Get remaining cooldown on Empowered Lightning Shield. (Kept for API compatibility)

**Returns:** `number` - Always returns 0 (ELS has no cooldown)

## ICD and Cooldown Details

### Lightning Shield ICD

```javascript
// Base ICD: 3 seconds
// With Stable Shields talent: 4 seconds (3 + 1)

function isLightningShieldReady(ctx) {
    const state = getLightningShieldState(ctx);
    if (!state.active || state.charges <= 0) return false;
    
    const spell = shamanSpells.lightningShield;
    const baseICD = spell.icd || 3;
    
    // Stable Shields adds 1s to ICD
    const stableShieldsRank = ctx.stats?.talentBonuses?.stableShields || 0;
    const actualICD = baseICD + stableShieldsRank;
    
    return ctx.currentTime >= state.lastTrigger + actualICD;
}
```

### Empowered Lightning Shield (No Cooldown)

```javascript
// ELS has NO cooldown - it procs every time Lightning Strike hits
// The 9s cooldown is on Lightning Strike ability itself, not ELS
// T2 3pc reduces Lightning Strike cooldown by 0.5s (8.5s total)

function isEmpoweredLightningShieldReady(ctx) {
    // Always ready - ELS has no cooldown
    return true;
}
```

## Stormstrike Interaction

### Lightning Shield
- Benefits from Stormstrike debuff (+25% nature damage)
- Does NOT consume Stormstrike charge

### Empowered Lightning Shield
- Benefits from Stormstrike debuff (+25% nature damage)
- DOES consume Stormstrike charge

```javascript
// In triggerEmpoweredLightningShield
if (spell.consumesStormstrikeCharge && ctx.consumeStormstrikeCharge) {
    ctx.consumeStormstrikeCharge();
}
```

## Integration with Simulator

### Current State (v1.5.0)
The simulator's Lightning Shield methods are wired to use the data-driven system when `USE_DATA_DRIVEN_LIGHTNING_SHIELD = true`.

**Lightning Shield:**
- `procLightningShield()` delegates to `triggerLightningShield()` for damage calculation
- Combat stats and proc triggers handled by simulator
- Charge state synced between systems

**Empowered Lightning Shield:**
- `procEmpoweredLightningShield()` delegates to `triggerEmpoweredLightningShield()` for damage calculation
- Combat stats and Stormstrike tracking handled by simulator

**Rotation:**
- `getLightningShieldCharges()` helper checks data-driven state when flag enabled
- All rotation charge checks use this helper

### Feature Flag
```javascript
this.USE_DATA_DRIVEN_LIGHTNING_SHIELD = true;  // Enable data-driven lightning shield system
```

### Helper Methods
```javascript
// Get charges from correct system
getLightningShieldCharges() {
    if (this.USE_DATA_DRIVEN_LIGHTNING_SHIELD) {
        const state = getLightningShieldState(this);
        return state.charges;
    }
    return this.lightningShieldCharges;
}
```

### Context Requirements

```javascript
{
    currentTime: number,
    stats: {
        talentBonuses: { stableShields: number },
        activeModifiers: { t2_3pc: boolean },
        spellPower: number,
        attackPower: number
    },
    rng: { random: () => number },
    recordDamage: (name, damage, options) => void,
    rollForResistance: (school) => { multiplier, type },
    consumeStormstrikeCharge: () => void,  // For ELS
    log: (message) => void
    // Note: Reapplication is handled by the rotation priority system (costs GCD)
}
```

## Testing

```javascript
import { 
    initializeLightningShieldStates, 
    applyLightningShield,
    isLightningShieldReady,
    triggerLightningShield,
    triggerEmpoweredLightningShield
} from './sim/index.js';

const ctx = {
    currentTime: 0,
    stats: {
        talentBonuses: { stableShields: 0 },
        activeModifiers: {},
        spellPower: 500,
        attackPower: 1000
    },
    recordDamage: (name, dmg, opts) => console.log(`${name}: ${dmg.toFixed(2)}`),
    rollForResistance: (school) => ({ multiplier: 1.0, type: 'none' }),
    consumeStormstrikeCharge: () => console.log('SS charge consumed'),
    log: (msg) => console.log(msg)
};

initializeLightningShieldStates(ctx);
applyLightningShield(ctx);

console.log('LS Ready:', isLightningShieldReady(ctx));  // true

// Trigger LS
const lsResult = triggerLightningShield(ctx, 'Test Hit');
console.log('LS Result:', lsResult);

// LS should be on ICD now
console.log('LS Ready after trigger:', isLightningShieldReady(ctx));  // false

// Advance time past ICD
ctx.currentTime = 3.5;
console.log('LS Ready after 3.5s:', isLightningShieldReady(ctx));  // true

// Test ELS
const elsResult = triggerEmpoweredLightningShield(ctx, 'Lightning Strike');
console.log('ELS Result:', elsResult);
```
