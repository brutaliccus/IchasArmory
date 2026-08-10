# Set Bonus System

**Module:** `sim/setBonusSystem.js`  
**Version:** 1.0.0  
**Since:** 2026-01-26

## Overview

The Set Bonus System handles set bonus effects in a data-driven manner. Instead of hardcoded set bonus checks scattered throughout the simulator, this system provides centralized set bonus processing.

## Dependencies

```javascript
import { setBonusDefinitions, getSetBonusById, getActiveBonuses } from '../setBonuses.js';
import { shamanSpells } from '../shamanSpells.js';
import { calculateSpellDamage } from '../shamanDamageCalc.js';
```

## Supported Set Bonuses

| Set | Pieces | Effect | Stats Key |
|-----|--------|--------|-----------|
| Battlegear of the Ten Storms | 3 | -0.5s SS/LS cooldown | `battlegear_ten_storms_3pc_cooldown_reduction` |
| Battlegear of the Ten Storms | 5 | Echoed Thunder on LS hit | `battlegear_ten_storms_5pc_echoed_thunder` |
| Battlegear of the Ten Storms | 8 | 50% instant Lightning Bolt | `battlegear_ten_storms_8pc_lightning_bolt_proc` |
| Garb of the Ten Storms | 3 | +6s Flame Shock duration | `garb_ten_storms_3pc_flame_shock_dot_duration` |
| Garb of the Ten Storms | 5 | 25% shocks + 15% LB trigger LS (no charge); elemental LS priority flag | `statsKeys`: `garb_ten_storms_5pc_shock_ls_chance`, `garb_ten_storms_5pc_lightning_bolt_ls_chance`, `garb_ten_storms_5pc_caster_ls_priority` |
| Garb of the Ten Storms | 8 | 20% LB echo 50% damage, 3s ICD | `garb_ten_storms_8pc_lb_echo_*` |
| Stormhowl Battlegear | 3 | 15% melee triggers ELS (no charge) | `stormhowl_3pc_empowered_ls_chance` |
| Stormhowl Battlegear | 5 | 10% Stormwolf's Frenzy | `stormhowl_5pc_stormwolf_frenzy` |
| Stormhowl Garb | 3 | Clearcasting mana reduction → 70% | `stormhowl_garb_3pc_clearcasting` |
| Stormhowl Garb | 5 | EM grants Stormwolf's Cunning (+10% spell haste 12s, refreshes on nature crit) | `stormhowl_garb_5pc_stormwolf_cunning` |
| Towerforge Battlegear | 2 | +6 Two-Handed Maces skill (passive) | `towerforge_2pc_two_handed_maces` |
| Towerforge Battlegear | 4 | 2% melee hit → +50 STR for 10s | `towerforge_4pc_strength_proc` |
| Incendosaur | 3 | 5% Spellstrike (15-26 fire) on melee | `incendosaur_3pc_melee_fire_proc` |
| Might of the Hippogryph | 3 | **1.2 PPM** on successful melee hits: **+20% attack speed**, **2 charges**, **8s** cap (PPM = buff only). **Charges** drop on **Auto Attack**, **Windfury Attack** (**1 WF proc = 2 hits = 2 charges**), **Stormstrike**, or **Lightning Strike** (physical). **150 Nature** on **every** successful `processMeleeHit` **while charges remain** (includes **Hand of Justice** — bonus damage only, no charge). **`hippogryphMightNature`** in **`spells.js`**. **Elemental Fury** + **Stormstrike** +25%, **1.5×** crit; `fireSpellHitTriggers` **onSpellHit** only. Items `33392`–`33397`. | `hippogryph_3pc_might` |
| Earthfury Battlegear | 5 | +45% Flametongue vs Flame Shock | `earthfury_5pc_flametongue_vs_flameshock` (set key `earthfury_battlegear` in `setDatabase`) |
| Earthfury Battlegear | 8 | Earth Shock → **Earthfury Aftershock** DoT (1 tick @ +4s, 1/10 resist, no crit; flat 175–226, no SP/AP scaling; SS/EF like LS; sim: `earthfuryBattlegearAftershockDot` in `spells.js` + `combatSim`) | `earthfury_8pc_aftershock` |
| Earthshatterer's Battlegear | 2 | +15% Empowered LS AP coefficient (see `damageCalc`) | `empowered_lightning_shield_scaling_bonus` |
| Earthshatterer's Battlegear | 4 | +5% crit on Shock spells | `shock_spell_crit` |
| Earthshatterer's Battlegear | 8 | 20% on **Stormstrike** or **Lightning Strike** hit (melee portion connects) → reset shared Shock CD (`cooldowns.shocks`). Rotation uses normal priority order on the following GCD. | `earthshatter_8pc_shock_cooldown_reset_chance` (0.2); `tryEarthshatterer8pcShockCooldownReset` + `processAbilityHit` |
| Totem of Crackling Thunder | — | LB 10% / LS 15% → +8% attack & casting speed 8s | `hasCracklingThunder` |
| Totem of Thundercall | — | **Proc engine only** — `onStormstrikeHit` → `thundercallStormCloud` in `procEngine.js` (see `procs.js`) | Same as other item procs: `findActiveProcs` / `procsFromProcsJs` + `isProcAvailable` |

**Item ID mapping** (`setDatabase.js`): **Garb of the Ten Storms** uses classic caster T2 piece IDs `16943`–`16950` (Bindings through Raiments). **Battlegear of the Ten Storms** uses Turtle enhancement T2 IDs `47136`–`47143`. The restoration set **The Ten Storms** (`47144`–`47151`) is not registered in `setDatabase` yet (no modeled bonuses). Stormcaller’s Garb (T2.5, e.g. `21372`+) is separate and also not in `setDatabase` unless added under its own set key.

Exports: `tryGarbTenStormsLightningShieldProc`, `processGarbTenStorms8pcLightningBoltEcho` (alongside `processAbilityHit`). Totem of Thundercall is **not** handled here — see `procEngine.js` + `procs.js`.

## Data Definitions (setBonuses.js)

```javascript
export const setBonusDefinitions = {
    battlegear_ten_storms_3pc: {
        id: 'battlegear_ten_storms_3pc',
        setId: 'battlegear_ten_storms',
        pieces: 3,
        name: 'Battlegear of the Ten Storms 3pc',
        description: 'Reduces cooldown of Stormstrike and Lightning Strike by 0.5s',
        effect: {
            type: 'cooldownReduction',
            abilities: ['stormstrike', 'lightningStrike'],
            reduction: 0.5
        },
        statsKey: 'battlegear_ten_storms_3pc_cooldown_reduction',
        statsValue: 0.5
    },
    // ... more definitions
};
```

## State Structures

```javascript
ctx._setBonusStates = {
    // Echoed Thunder (T2 5pc)
    echoedThunder: {
        active: boolean,
        expires: number  // Infinity = until consumed
    },
    
    // Instant Lightning Bolt (T2 8pc)
    instantLightningBolt: {
        active: boolean,
        expires: number  // 10 second expiration
    },
    
    // Stormwolf's Frenzy (Stormhowl Battlegear 5pc)
    stormwolfFrenzy: {
        active: boolean,
        expires: number,
        strengthBonus: number
    },
    
    // Stormwolf's Cunning (Stormhowl Garb 5pc)
    stormwolfCunning: {
        active: boolean,
        expires: number
    },
    
    // Crackling Thunder (Totem of Crackling Thunder)
    cracklingThunder: {
        active: boolean,
        expires: number
    },
    
    // Towerforge Fury (Towerforge Battlegear 4pc)
    towerforgeFury: {
        active: boolean,
        expires: number
    },

    // Might of the Hippogryph 3pc
    hippogryphMight: {
        active: boolean,
        charges: number,      // attacks remaining (WF counts)
        expires: number,
        hastePercent: number  // default 20
    }
};
```

## Exported Functions

### State Management

#### `initializeSetBonusStates(ctx)`
Initialize set bonus buff states.

#### `getSetBonusState(ctx, buffId)`
Get state for a specific buff (`'echoedThunder'`, `'instantLightningBolt'`, `'stormwolfFrenzy'`, `'towerforgeFury'`).

---

### Cooldown Reduction

#### `getCooldownReduction(ctx, abilityKey)`
Get cooldown reduction for an ability from set bonuses.

**Returns:** `number` - Reduction in seconds

**Example:**
```javascript
const reduction = getCooldownReduction(ctx, 'stormstrike');
// Returns 0.5 if T2 3pc is active
```

#### `getReducedCooldown(ctx, abilityKey, baseCooldown)`
Apply cooldown reduction to a base cooldown.

**Returns:** `number` - Reduced cooldown

**Example:**
```javascript
const cooldown = getReducedCooldown(ctx, 'lightningStrike', 6);
// Returns 5.5 if T2 3pc is active
```

---

### Echoed Thunder (T2 5pc)

#### `activateEchoedThunder(ctx)`
Activate the Echoed Thunder buff.

**Returns:** `{ success: boolean }`

#### `isEchoedThunderActive(ctx)`
Check if Echoed Thunder is active.

**Returns:** `boolean`

#### `consumeEchoedThunder(ctx, autoAttackDamage)`
Consume Echoed Thunder and deal 10% nature damage.

**Parameters:**
- `autoAttackDamage` (number) - The auto attack damage to base the 10% on

**Returns:**
```javascript
{
    damage: number,      // Nature damage dealt
    resistType: string   // Resistance result
}
```
Or `null` if not active.

**Example:**
```javascript
// After auto attack deals damage
if (isEchoedThunderActive(ctx)) {
    const etResult = consumeEchoedThunder(ctx, autoAttackDamage);
    // etResult.damage = autoAttackDamage * 0.10 * modifiers
}
```

---

### Instant Lightning Bolt (T2 8pc)

#### `activateInstantLightningBolt(ctx)`
Activate the instant LB proc.

**Returns:** `{ success: boolean, expires: number }`

#### `isInstantLightningBoltActive(ctx)`
Check if instant LB proc is available.

**Returns:** `boolean`

#### `consumeInstantLightningBolt(ctx)`
Consume the instant LB proc.

**Returns:**
```javascript
{
    instantCast: true,
    noManaCost: true,
    hitBonus: 0.99  // 99% hit chance
}
```
Or `null` if not active.

**Example:**
```javascript
// Before casting Lightning Bolt
if (isInstantLightningBoltActive(ctx)) {
    const mods = consumeInstantLightningBolt(ctx);
    // mods.instantCast = true, mods.noManaCost = true
}
```

---

### Stormwolf's Frenzy (Stormhowl 5pc)

#### `activateStormwolfFrenzy(ctx)`
Activate Stormwolf's Frenzy buff (+10% haste, +5% strength for 7s).

**Returns:**
```javascript
{
    success: boolean,
    strengthBonus: number,  // 5% of current strength
    apBonus: number,        // strengthBonus * 2
    expires: number
}
```

#### `isStormwolfFrenzyActive(ctx)`
Check if Stormwolf's Frenzy is active.

**Returns:** `boolean`

#### `getStormwolfFrenzyHaste(ctx)`
Get haste multiplier from Stormwolf's Frenzy.

**Returns:** `number` - 1.10 if active, 1.0 otherwise

---

### Stormwolf's Cunning (Stormhowl Garb 5pc)

#### `activateStormwolfCunning(ctx)`
Activate Stormwolf's Cunning buff (+10% spell haste for 12s). Triggered when Elemental Mastery is activated and `stormhowl_garb_5pc_stormwolf_cunning` is active.

**Returns:**
```javascript
{
    success: boolean,
    expires: number
}
```

#### `refreshStormwolfCunning(ctx, source)`
Refresh Stormwolf's Cunning duration back to 12s. Called when any nature spell critically hits (Earth Shock, Lightning Bolt, Chain Lightning, Lightning Strike, Earthquake).

#### `isStormwolfCunningActive(ctx)`
Check if Stormwolf's Cunning is active.

**Returns:** `boolean`

#### `getStormwolfCunningSpellHaste(ctx)`
Get spell haste multiplier from Stormwolf's Cunning.

**Returns:** `number` - 1.10 if active, 1.0 otherwise

---

### Crackling Thunder (Totem of Crackling Thunder)

#### `activateCracklingThunder(ctx, source)`
Activate Crackling Thunder buff (+8% attack & casting speed for 8s). Triggered on Lightning Bolt hit (10% chance) or Lightning Strike hit (15% chance) when the totem is equipped.

**Returns:**
```javascript
{
    success: boolean,
    expires: number
}
```

#### `isCracklingThunderActive(ctx)`
Check if Crackling Thunder is active.

**Returns:** `boolean`

#### `getCracklingThunderHaste(ctx)`
Get haste multiplier from Crackling Thunder (applies to both melee and spell).

**Returns:** `number` - 1.08 if active, 1.0 otherwise

---

### Towerforge Fury (Towerforge Battlegear 4pc)

#### `activateTowerforgeFury(ctx)`
Activate Towerforge Fury buff (+50 Strength / +100 AP for 10s). Refreshes on re-proc.

**Returns:**
```javascript
{
    success: boolean,
    expires: number
}
```

#### `isTowerforgeFuryActive(ctx)`
Check if Towerforge Fury is active.

**Returns:** `boolean`

---

### Proc Triggers

#### `processAbilityHit(ctx, abilityKey, outcome)`
Process set bonus effects when an ability hits.

**Parameters:**
- `abilityKey` (string) - Ability that hit
- `outcome` (Object) - `{ didHit: boolean, ... }`

**Returns:**
```javascript
{
    echoedThunder?: boolean,           // T2 5pc activated
    instantLightningBolt?: boolean,    // T2 8pc procced
    triggerEmpoweredLightningShield?: { consumeCharge: boolean }  // T2 5pc (Garb)
}
```

**Triggers:**
- Lightning Strike hit → Echoed Thunder (T2 5pc)
- Lightning Strike hit → 50% Instant LB (T2 8pc)
- Shock hit → 25% ELS without charge (T2 Garb 5pc)

**Example:**
```javascript
// After Lightning Strike hits
const results = processAbilityHit(ctx, 'lightningStrike', { didHit: true });
if (results.echoedThunder) {
    // Next auto attack will deal bonus nature damage
}
```

#### `processMeleeHit(ctx, outcome)`
Process set bonus effects on melee hit.

**Parameters:**
- `outcome` (Object) - `{ didHit: boolean, ... }`

**Returns:**
```javascript
{
    triggerEmpoweredLightningShield?: { consumeCharge: boolean },  // Stormhowl 3pc
    stormwolfFrenzy?: boolean,    // Stormhowl 5pc
    incendosaurProc?: { damage, resistType },  // Incendosaur 3pc
    towerforgeFury?: boolean      // Towerforge 4pc
}
```

**Triggers:**
- Melee hit → 15% ELS without charge (Stormhowl 3pc)
- Melee hit → 10% Stormwolf's Frenzy (Stormhowl 5pc)
- Melee hit → 5% fire damage (Incendosaur 3pc)
- Melee hit → 2% +50 STR for 10s (Towerforge 4pc)

---

### DOT Duration

#### `getDotDurationBonus(ctx, dotKey)`
Get DOT duration bonus from set bonuses.

**Parameters:**
- `dotKey` (string) - DOT spell key (e.g., `'flameShockDot'`)

**Returns:** `number` - Duration bonus in seconds

**Example:**
```javascript
const bonus = getDotDurationBonus(ctx, 'flameShockDot');
// Returns 6 if T2 Garb 3pc is active
```

## Integration with Simulator

### Current State (v1.5.0)
The simulator's set bonus methods are wired to use the data-driven system when `USE_DATA_DRIVEN_SET_BONUSES = true`.

**Echoed Thunder (T2 5pc):**
- `activateEchoedThunder()` delegates to `activateEchoedThunderDataDriven()`
- `isEchoedThunderActive()` helper checks data-driven state when flag enabled
- Consumption syncs both legacy and data-driven states

**Instant Lightning Bolt (T2 8pc):**
- `isInstantLightningBoltActive()` helper checks data-driven state when flag enabled
- Activation/consumption sync both systems

**Stormwolf's Frenzy (Stormhowl 5pc):**
- `activateStormwolfFrenzy()` delegates to `activateStormwolfFrenzyDataDriven()`
- `isStormwolfFrenzyActive()` helper checks data-driven state when flag enabled
- Haste calculation uses helper method

### Feature Flag
```javascript
this.USE_DATA_DRIVEN_SET_BONUSES = true;  // Enable data-driven set bonus system
```

### Helper Methods
```javascript
// Check set bonus buff states from correct system
isEchoedThunderActive() {
    if (this.USE_DATA_DRIVEN_SET_BONUSES) {
        return isEchoedThunderActiveDataDriven(this);
    }
    return this.echoedThunderActive && this.currentTime < this.echoedThunderExpires;
}

isInstantLightningBoltActive() {
    if (this.USE_DATA_DRIVEN_SET_BONUSES) {
        return isInstantLightningBoltActiveDataDriven(this);
    }
    return this.instantLightningBoltActive && this.currentTime < this.instantLightningBoltExpires;
}

isStormwolfFrenzyActive() {
    if (this.USE_DATA_DRIVEN_SET_BONUSES) {
        return isStormwolfFrenzyActiveDataDriven(this);
    }
    return this.stormwolfFrenzyActive && this.currentTime < this.stormwolfFrenzyExpires;
}
```

### Remaining Migration
- Replace inline `processAbilityHit()` calls for centralized ability hit processing
- Replace inline `processMeleeHit()` calls for centralized melee hit processing  
- Use `getReducedCooldown()` for cooldown calculations (T2 3pc)
- Remove legacy set bonus code once validated

### Context Requirements

```javascript
{
    currentTime: number,
    stats: {
        setBonuses: {
            battlegear_ten_storms_3pc_cooldown_reduction: number,
            battlegear_ten_storms_5pc_echoed_thunder: boolean,
            // ... other set bonus keys
        },
        strength: number,
        attackPower: number
    },
    rng: { random: () => number },
    scheduleEvent: (time, type, callback, id) => void,
    unscheduleEvent: (id) => void,
    recordDamage: (name, damage, options) => void,
    rollForResistance: (school) => { multiplier, type },
    recalculateWeaponDamage: () => void,
    log: (message) => void
}
```

## Testing

```javascript
import { 
    initializeSetBonusStates,
    getReducedCooldown,
    activateEchoedThunder,
    consumeEchoedThunder,
    processAbilityHit,
    processMeleeHit
} from './sim/index.js';

const ctx = {
    currentTime: 0,
    stats: {
        setBonuses: {
            battlegear_ten_storms_3pc_cooldown_reduction: 0.5,
            battlegear_ten_storms_5pc_echoed_thunder: true,
            stormhowl_5pc_stormwolf_frenzy: true
        },
        strength: 200,
        attackPower: 1000
    },
    rng: { random: () => 0.05 },  // Will proc 10% chance
    scheduleEvent: (t, type, cb, id) => {},
    recordDamage: (name, dmg, opts) => console.log(`${name}: ${dmg.toFixed(2)}`),
    rollForResistance: (school) => ({ multiplier: 1.0, type: 'none' }),
    recalculateWeaponDamage: () => {},
    log: (msg) => console.log(msg)
};

initializeSetBonusStates(ctx);

// Test cooldown reduction
const cd = getReducedCooldown(ctx, 'stormstrike', 6);
console.log('Stormstrike CD:', cd);  // 5.5

// Test Echoed Thunder
const abilityResults = processAbilityHit(ctx, 'lightningStrike', { didHit: true });
console.log('Ability hit results:', abilityResults);

// Test melee hit
const meleeResults = processMeleeHit(ctx, { didHit: true });
console.log('Melee hit results:', meleeResults);
```
