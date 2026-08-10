# Ability Casting System

**Module:** `sim/abilityCasting.js`  
**Version:** 1.0.0  
**Since:** 2026-01-27

## Overview

The Ability Casting System centralizes all ability execution logic. Its key design principle is that **all proc triggering goes through the data-driven system** - no ability-specific trigger calls are needed in the simulator.

## Key Design Principle

Adding new procs only requires updating `procs.js`. No changes to `shamanCombatSim.js` are needed.

## Architecture

```
Ability Execution
       │
       ▼
┌──────────────────┐
│ executeAbility() │ ◄── Entry point for all abilities
└────────┬─────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐ ┌──────────┐
│ Melee  │ │  Spell   │
│ Procs  │ │  Procs   │
└───┬────┘ └────┬─────┘
    │           │
    ▼           ▼
┌────────────────────────┐
│   fireTrigger() from   │
│   triggerRouter.js     │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│  processProcTrigger()  │
│   from procEngine.js   │
└───────────┬────────────┘
            │
            ▼
┌────────────────────────┐
│   Effect Handlers:     │
│   - handleStatBuff     │
│   - handleDamageProc   │
│   - handleStackingBuff │
│   - handleChargeBuff   │
└────────────────────────┘
```

## Exported Functions

### Proc Triggering

#### `triggerMeleeProcs(ctx, source, icon, outcome)`
Fire all melee attack procs. This is the ONLY function that should be called for melee proc triggers.

**Parameters:**
- `ctx` - Simulation context
- `source` - Ability name (e.g., "Auto Attack", "Stormstrike")
- `icon` - Ability icon
- `outcome` - `{ didHit, isCrit, damage }`

**What it triggers:**
- Crusader (PPM on melee hit)
- Dragonbreath Chili (5% on melee hit)
- Badge of the Swarmguard (while active)
- Flurry (on melee crit, plus spell crits from: Shocks, Molten Blast, Lightning Bolt, Chain Lightning, Earthquake, Totem of Tides)
- Elemental Devastation (on melee crit)
- All other procs with `procType: 'onMeleeHit'` or `'onMeleeCrit'`

#### `triggerSpellProcs(ctx, source, icon, outcome)`
Fire all spell hit procs. This is the ONLY function that should be called for spell proc triggers.

**Parameters:**
- `ctx` - Simulation context
- `source` - Spell name
- `icon` - Spell icon
- `outcome` - `{ didHit, isCrit, damage, school }`

**What it triggers:**
- Wrath of Cenarius (5% on spell hit)
- Ornate Bloodstone Dagger (20% on spell hit)
- Blade of Eternal Darkness (chance on spell hit)
- Elemental Focus (on spell crit)
- All other procs with `procType: 'onSpellHit'` or `'onSpellCrit'`

---

### Weapon Imbue Handling

#### `processWeaponImbues(ctx, source, icon, outcome, options)`
Process weapon imbues on melee hit.

**Parameters:**
- `ctx` - Simulation context
- `source` - Ability name
- `icon` - Ability icon
- `outcome` - `{ didHit, isCrit, damage }`
- `options`:
  - `canProcWindfury` - Whether Windfury can proc (default `true`)
  - `windfuryChance` - Windfury proc chance (default `0.20`)

**Behavior:**
1. If Flametongue is active, deals fire damage and triggers spell procs
2. If Windfury is active and rolls proc, performs 2 extra attacks
3. Windfury attacks can trigger melee procs (except more Windfury)
4. Windfury attacks can proc Flametongue

---

### Set Bonus Handling

**Melee Hit Set Bonuses** (Stormhowl 3pc/5pc, Incendosaur 3pc) are handled by `processMeleeHit()` 
from `setBonusSystem.js`. This function is called automatically during melee ability execution.

The following functions handle **non-melee specific** set bonuses:

#### `processGarb5pc(ctx, source, outcome)`
Process Garb 5pc - 25% chance for shocks to trigger Lightning Shield without consuming charge.

#### `processBattlegear5pc(ctx, outcome)`
Process Battlegear 5pc - Activates Echoed Thunder on Lightning Strike hit.

#### `processBattlegear8pc(ctx, outcome)`
Process Battlegear 8pc - 50% chance for instant Lightning Bolt on Stormstrike/Lightning Strike.

---

### Ability Execution

#### `executeAbility(ctx, spellKey, options)`
Generic ability execution with automatic proc handling.

**Returns:** `{ success, outcome, damage, didHit, isCrit }`

#### `executeStormstrike(ctx)`
Execute Stormstrike with debuff application.

#### `executeLightningStrike(ctx)`
Execute Lightning Strike with physical/nature split.

#### `executeShock(ctx, spellKey)`
Execute a shock spell (earthShock, flameShock, frostShock).

#### `executeAutoAttack(ctx)`
Execute an auto attack with all proc handling.

---

## Adding New Procs

To add a new proc, only update `procs.js`:

```javascript
// In procs.js
{
    id: 'new_item_proc',
    name: 'New Item Proc',
    itemId: 12345,
    procType: 'onMeleeHit',  // or 'onSpellHit', 'onMeleeCrit', etc.
    procChance: 10,          // 10% chance
    effect: {
        type: 'damageProc',  // or 'statBuff', 'stackingBuff', etc.
        baseDamage: 100,
        damageSchool: 'fire',
        spCoefficient: 0.3
    },
    duration: null,  // instant damage
    icon: 'spell_fire_fireball'
}
```

The proc engine will automatically:
1. Detect the proc when the item is equipped
2. Roll for the proc on matching triggers
3. Execute the effect via the appropriate handler

No changes to `shamanCombatSim.js` are required.

---

## Integration with Simulator

To use this system in the simulator:

```javascript
// Instead of inline proc calls:
// this.triggerCrusader('Auto Attack', icon);
// this.triggerDragonbreathChili('Auto Attack', icon);
// this.triggerWrathOfCenarius('Flametongue Weapon', ftIcon);

// Use the data-driven system:
import { triggerMeleeProcs, triggerSpellProcs, processWeaponImbues } from './sim/index.js';

// On melee hit:
triggerMeleeProcs(this, 'Auto Attack', icon, outcome);
processWeaponImbues(this, 'Auto Attack', icon, outcome);

// When Flametongue deals damage (handled inside processWeaponImbues):
// triggerSpellProcs is called automatically
```

---

## Effect Types

The proc engine supports these effect types:

| Type | Description | Example |
|------|-------------|---------|
| `statBuff` | Add stats for duration | Crusader (+100 str for 15s) |
| `stackingBuff` | Stack to max, refresh duration | Wrath of Cenarius (+132 SP) |
| `chargeBuff` | N charges consumed on actions | Flurry (3 charges of haste) |
| `damageProc` | Deal instant damage | Dragonbreath Chili, OBD |
| `armorPenStack` | Stack armor pen | Badge of the Swarmguard |
| `onUseActivation` | Manual activation | NAC, Kiss of the Spider |
| `imbueDamage` | Weapon imbue damage | Flametongue (via imbueSystem) |
| `imbueExtraAttacks` | Extra attacks | Windfury (via imbueSystem) |
