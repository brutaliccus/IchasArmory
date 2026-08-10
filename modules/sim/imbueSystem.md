# Imbue System

**Module:** `sim/imbueSystem.js`  
**Version:** 1.0.0  
**Since:** 2026-01-26

## Overview

The Imbue System handles weapon imbue effects (Flametongue Weapon, Frostbrand Weapon, Windfury Weapon) in a data-driven manner. Instead of hardcoded imbue logic scattered throughout the simulator, this module provides centralized processing (`processFlametongue`, `processFrostbrandWeapon`, `processWindfury`).

## Dependencies

```javascript
import { shamanSpells } from '../shamanSpells.js';
import { calculateSpellDamage } from '../shamanDamageCalc.js';
import { getProcById } from '../procs.js';
import { getProcState } from './procEngine.js';
```

## Imbue Types

### Flametongue Weapon (`imbueDamage`)
- **Behavior:** Deals fire spell damage on every melee hit
- **Damage:** Calculated from `shamanSpells.flametongueWeapon` via `calculateSpellDamage` (includes set/talent modifiers). **Earthfury 5pc** (+45% vs Flame Shock) is applied there through `getAllDamageModifiers` in `shamanTalents.js` — `processFlametongue` must not apply it again (would double ~1.45²).
- **Scaling:** Base proc damage scales with **base** weapon speed (clamped to `minWeaponSpeed`–`maxWeaponSpeed` on the spell). Spell power uses effective coefficient `spCoefficient + spCoefficientPerBaseWeaponSpeed × baseWeaponSpeed` (default 0.17 + 0.03×speed — e.g. 3.8s weapon → 28.4% of fire spell power). Uses `stats.baseWeaponSpeed`, not hasted swing time.
- **Triggers:** Spell hit procs (Wrath of Cenarius, OBD, BoED). If the target is **fire immune** (`outcome.type === 'immune'`), **`triggersSpellHitProcs`** is false (same as full resist).

### Frostbrand Weapon (`imbuePpmDamage`)
- **Behavior:** On each eligible melee hit (auto, Stormstrike, Lightning Strike physical, Windfury attacks, etc.), roll proc chance `min(1, baseWeaponSpeed × ppm / 60 + talentBonuses.frostbrand_proc_bonus)`. Default **9 PPM** from `procs.js` (`frostbrand_weapon`).
- **Damage:** `shamanSpells.frostbrandWeapon` via `calculateSpellDamage` (speed-scaled base + frost SP, same pattern as Flametongue).
- **Element's Grace:** Frostbrand uses **`hasElementsGraceCrit: true`** on `frostbrandWeapon` in `spells.js` — **`getElementsGraceCritBonus`** adds **+2% spell crit per rank** in `combatSim` / `damageSystem` / analytical **`damageCalc`** (crit only; no EG weapon-damage bonus, same as Flametongue proc).
- **Elemental Weapons:** `frostbrand_proc_bonus` from `talents_new.js` when Frostbrand is the active imbue (8% / 16% / 25% additive to proc chance at 1–3 EW ranks). With EW and **Frost Shock slow** active on target (`frostShockDebuffExpires`), sim forces a spell crit on the Frostbrand hit (`rollDamage` option `forceSpellCrit`).
- **Active flag:** `stats.activeModifiers.frostbrandActive` (buff id `frostbrand` / name Frostbrand Weapon). On sim start, `combatSim.js` runs `syncWeaponImbueFlagsFromActiveBuffs()` so these flags match `stats.activeBuffs` from the Consumes/Buffs tab (including worker runs).
- **Triggers:** Spell hit procs when the rolled hit deals damage (`fireSpellHitTriggers` / `triggerSpellProcs`).
- **UI icon:** `recordDamage` includes `icon` (same full URL as `shamanSpells.frostbrandWeapon` / Consumes buff) so the detailed damage breakdown matches the buff icon.

### Windfury Weapon (`imbueExtraAttacks`)
- **Behavior:** 20% chance to grant 2 extra attacks with +323 AP bonus
- **Damage:** Physical attacks using `shamanSpells.windfuryAttack`
- **Restrictions:** Cannot proc itself (no WF from WF attacks)

## Data Definitions (procs.js)

```javascript
// Flametongue Weapon
{
    id: 'flametongue_weapon',
    name: 'Flametongue Weapon',
    imbue: true,
    procType: 'onMeleeHit',
    procChance: 100,
    effect: {
        type: 'imbueDamage',
        spell: 'flametongueWeapon',
        triggersSpellHitProcs: true
    }
}

// Windfury Weapon
{
    id: 'windfury_weapon',
    name: 'Windfury Weapon',
    imbue: true,
    procType: 'onMeleeHit',
    procChance: 20,
    effect: {
        type: 'imbueExtraAttacks',
        count: 2,
        apBonus: 323,
        spell: 'windfuryAttack',
        cannotProcSelf: true,
        consumesFlurryCharges: false
    }
}
```

## Exported Functions

### `isImbueActive(ctx, imbueId)`

Check if a weapon imbue is active.

**Parameters:**
- `ctx` (Object) - Simulation context
- `imbueId` (string) - Imbue ID (`'flametongue_weapon'` or `'windfury_weapon'`)

**Returns:** `boolean`

**Example:**
```javascript
if (isImbueActive(ctx, 'flametongue_weapon')) {
    // Flametongue is active
}
```

---

### `processFlametongue(ctx, triggerSource, triggerIcon)`

Process Flametongue Weapon fire damage on melee hit.

**Parameters:**
- `ctx` (Object) - Simulation context
- `triggerSource` (string) - What triggered this (e.g., 'Auto Attack')
- `triggerIcon` (string) - Icon for logging

**Returns:**
```javascript
{
    damage: number,          // Damage dealt
    isCrit: boolean,         // Whether it crit
    resistType: string,      // 'none', 'partial_25', 'partial_50', 'partial_75', 'full_resist'
    didHit: boolean,         // Whether it hit
    triggersSpellHitProcs: boolean  // Whether to trigger spell hit procs
}
```

**Example:**
```javascript
const result = processFlametongue(ctx, 'Auto Attack', 'ability_melee');
if (result && result.triggersSpellHitProcs) {
    fireSpellHitTriggers(ctx, 'Flametongue Weapon', result.icon);
}
```

---

### `processWindfuryAttack(ctx, attackIndex, options)`

Process a single Windfury Weapon attack. This is the recommended function when you need per-attack trigger logic (Crusader, Flurry, etc. after each attack).

**Parameters:**
- `ctx` (Object) - Simulation context
- `attackIndex` (number) - Which attack (0 or 1) for logging
- `options` (Object, optional):
  - `skipRecord` (boolean) - If true, don't record damage
  - `skipLog` (boolean) - If true, don't log

**Returns:**
```javascript
{
    damage: number,           // Damage dealt
    isCrit: boolean,          // Whether it crit
    type: string,             // 'hit', 'crit', 'miss', 'dodge', 'parry'
    didHit: boolean,          // Whether the attack landed
    bonusDamage: number,      // Bonus from +323 AP
    attackIndex: number       // Which attack (0 or 1)
}
```

**Example:**
```javascript
// Process both Windfury attacks with per-attack triggers
for (let i = 0; i < 2; i++) {
    const result = processWindfuryAttack(ctx, i);
    if (!result) continue;
    
    // Fire triggers after each attack
    if (result.didHit) {
        if (result.isCrit) {
            triggerFlurry('Windfury Attack');
            triggerElementalDevastation('Windfury Attack');
        }
        triggerCrusader('Windfury Attack');
        // ... other per-attack triggers
    }
}
```

---

### `processWindfury(ctx, triggerSource, triggerIcon)`

Convenience wrapper that calls `processWindfuryAttack` twice and returns aggregate results. Use `processWindfuryAttack` directly when you need per-attack trigger handling.

**Parameters:**
- `ctx` (Object) - Simulation context
- `triggerSource` (string) - What triggered this
- `triggerIcon` (string) - Icon for logging

**Returns:**
```javascript
{
    attacks: [                // Array of 2 attack results
        { damage, isCrit, type, didHit, bonusDamage }
    ],
    totalDamage: number,      // Sum of both attacks
    crits: number,            // Number of crits (0-2)
    hits: number              // Number of hits (0-2)
}
```

---

### `WINDFURY_AP_BONUS`

Constant for Windfury's attack power bonus: `323`

```javascript
import { WINDFURY_AP_BONUS } from './sim/index.js';
// WINDFURY_AP_BONUS === 323
```

---

### `processImbue(ctx, imbueId, triggerSource, triggerIcon)`

Generic imbue processor - routes to appropriate handler based on effect type.

**Parameters:**
- `ctx` (Object) - Simulation context
- `imbueId` (string) - Imbue ID from procs.js
- `triggerSource` (string) - What triggered this
- `triggerIcon` (string) - Icon

**Returns:** Result from specific handler or `null`

---

### `processImbuesOnMeleeHit(ctx, triggerSource, triggerIcon, options)`

Process all active imbues on a melee hit. This is the main entry point.

**Parameters:**
- `ctx` (Object) - Simulation context
- `triggerSource` (string) - What triggered this
- `triggerIcon` (string) - Icon
- `options` (Object):
  - `canProcWindfury` (boolean, default `true`) - Whether Windfury can proc (set to false for WF attacks)
  - `windfuryChance` (number, default `0.20`) - Windfury proc chance

**Returns:**
```javascript
{
    flametongue: Object|null,  // Flametongue result if active
    windfury: Object|null      // Windfury result if procced
}
```

**Example:**
```javascript
// On auto attack hit
const imbueResults = processImbuesOnMeleeHit(ctx, 'Auto Attack', icon, {
    canProcWindfury: true
});

if (imbueResults.flametongue?.triggersSpellHitProcs) {
    fireSpellHitTriggers(ctx, 'Flametongue Weapon', ftIcon);
}

if (imbueResults.windfury) {
    // Process the 2 extra WF attacks
    for (const attack of imbueResults.windfury.attacks) {
        // Each WF attack can proc Flametongue but NOT Windfury
        processImbuesOnMeleeHit(ctx, 'Windfury Attack', wfIcon, {
            canProcWindfury: false  // WF cannot proc itself
        });
    }
}
```

## Integration with Simulator

### Current State (v1.5.0)
The simulator's `procFlametongue()` and `procWindfury()` methods are wired to use the data-driven imbue system when `USE_DATA_DRIVEN_IMBUES = true`.

**Flametongue Integration:**
- Uses `processFlametongue()` for damage calculation and recording
- Keeps all existing proc trigger logic in the simulator

**Windfury Integration:**
- Uses `processWindfuryAttack()` for per-attack damage calculation
- Loops twice, firing triggers after each attack (Crusader, Flurry, etc.)
- Keeps all existing per-attack trigger logic in the simulator

### Feature Flag
```javascript
this.USE_DATA_DRIVEN_IMBUES = true;  // Enable data-driven imbue system
```

### Integration Points
- `performAutoAttack()` - Auto attack melee hits
- `castLightningStrike()` - Physical portion of Lightning Strike
- `castStormstrike()` - Stormstrike melee hits
- Windfury attack processing (recursive, but with `canProcWindfury: false`)

## Adding New Imbues

To add a new weapon imbue:

1. **Add spell definition** to `shamanSpells.js`:
```javascript
newImbueEffect: {
    id: 99999,
    name: "New Imbue Effect",
    school: "nature",
    damageMin: 50,
    damageMax: 100,
    spCoefficient: 0.15,
    // ... other properties
}
```

2. **Add proc definition** to `procs.js`:
```javascript
{
    id: 'new_imbue',
    name: 'New Imbue',
    imbue: true,
    procType: 'onMeleeHit',
    procChance: 100,  // or percentage for proc-based
    effect: {
        type: 'imbueDamage',  // or 'imbueExtraAttacks'
        spell: 'newImbueEffect',
        triggersSpellHitProcs: true
    }
}
```

3. **Add active check** to `isImbueActive()` if using a different modifier:
```javascript
if (imbueId === 'new_imbue') {
    return !!ctx.stats?.activeModifiers?.newImbueActive;
}
```

## Testing

```javascript
import { isImbueActive, processFlametongue, processImbuesOnMeleeHit } from './sim/index.js';

// Create mock context
const ctx = {
    currentTime: 10.5,
    stats: {
        activeModifiers: { flametongueActive: true, windfuryActive: true },
        spellPower: 500,
        fireDamage: 100
    },
    rng: { random: () => 0.1 },  // Will proc WF (0.1 < 0.2)
    recordDamage: (name, dmg, opts) => console.log(name, dmg),
    log: (msg) => console.log(msg)
};

// Test
console.log('FT Active:', isImbueActive(ctx, 'flametongue_weapon'));
const results = processImbuesOnMeleeHit(ctx, 'Test', 'icon');
console.log('Results:', results);
```
