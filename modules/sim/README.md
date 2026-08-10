# Simulation Engine Architecture

## Overview

This folder contains the modular combat simulation engine for IchaCalc. The architecture separates concerns into independent systems that communicate through well-defined interfaces.

## Design Philosophy

1. **Stability First**: The core `engine.js` should rarely need changes
2. **Single Responsibility**: Each module handles one aspect of simulation
3. **Loose Coupling**: Systems communicate through interfaces, not direct dependencies
4. **Easy Extension**: Adding new procs, buffs, or abilities should only touch relevant modules
5. **Backward Compatibility**: Existing `shamanCombatSim.js` continues to work during migration

## Module Structure

```
sim/
├── README.md           # This file - architecture documentation
├── index.js            # Re-exports all modules for easy importing
│
│── Core Orchestration
├── engine.js           # Core simulation orchestrator (facade/coordinator)
├── eventSystem.js      # Heap-based event scheduling - INTEGRATED
│
│── Data Processing Systems
├── damageSystem.js     # Damage calculation helpers, resistance tables
├── buffSystem.js       # Buff/debuff tracking, uptime calculation
├── procSystem.js       # Proc triggers, detection, ICD tracking
├── abilitySystem.js    # Spell casting, cooldowns, GCD management
├── combatStats.js      # Statistics aggregation, breakdown tracking
│
│── Extracted Logic (v1.3.0)
├── abilityHandlers.js  # Extracted ability execution logic
├── procHandlers.js     # Extracted proc triggering patterns
├── rotationSystem.js   # Extracted rotation/priority system
├── detectHelpers.js    # Consolidated has*/is*/get* helpers
│
│── Data-Driven Proc System (v1.4.0)
├── procEngine.js       # Generic proc processor with effect handlers
├── triggerRouter.js    # Routes combat events to proc checks
│
│── Data-Driven Subsystems (v1.5.0) - NEW
├── imbueSystem.js      # Flametongue/Windfury weapon imbue handling
├── totemSystem.js      # Fire Nova, Searing, Stoneclaw totem management
├── dotSystem.js        # Flame Shock DOT ticks and snapshotting
├── lightningShieldSystem.js  # Lightning Shield and ELS processing
├── setBonusSystem.js   # Set bonus effects (T2, Stormhowl, etc.)
│
│── Infrastructure
├── simContext.js       # Context building, stat serialization for workers
└── workerPool.js       # Web worker management for parallel execution
```

## System Dependencies

```
                    ┌─────────────────┐
                    │   engine.js     │
                    │  (orchestrator) │
                    └────────┬────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│  eventSystem.js │  │ abilitySystem.js│  │  combatStats.js │
│   (scheduling)  │  │   (casting)     │  │  (aggregation)  │
└─────────────────┘  └────────┬────────┘  └─────────────────┘
                              │
              ┌───────────────┼───────────────┐
              │               │               │
              ▼               ▼               ▼
      ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
      │ procSystem  │  │ buffSystem  │  │damageSystem │
      │  (procs)    │  │  (buffs)    │  │  (damage)   │
      └─────────────┘  └─────────────┘  └─────────────┘
```

## Adding New Features

### Adding a New Proc (v1.4.0+ Data-Driven System)

With the new data-driven proc system, adding procs requires **only editing data files**:

```javascript
// procs.js - Add this, nothing else needed!
{
    id: 'new_trinket_proc',
    name: 'New Trinket',
    itemId: 99999,
    procType: 'onMeleeHit',      // Trigger type
    procChance: 15,               // 15% chance
    duration: 20,                 // 20 second buff
    effect: {
        type: 'statBuff',         // Effect type
        stats: { attackPower: 300 }
    },
    icon: 'inv_trinket_new',
    color: '#FF0000'
}
// That's it! No code changes required.
```

**Effect Types:**
- `statBuff` - Add stats for duration (Crusader, Stonebreaker)
- `stackingBuff` - Stack mechanic with max (Wrath of Cenarius)
- `chargeBuff` - Consume on actions (Flurry, Elemental Focus)
- `damageProc` - Deal instant damage (BoED, DB Chili, OBD)
- `armorPenStack` - Stack armor pen (Badge of Swarmguard)
- `onUseActivation` - Trinket/talent buff activation (Kiss of the Spider, EM, NAC)
- `onUseDamage` - On-use instant damage (Shard of the Fallen Star)
- `imbueDamage` - Weapon imbue spell damage (Flametongue)
- `imbueExtraAttacks` - Weapon imbue extra attacks (Windfury)
- `petSummon` - On-use pet summon with SP buff + scheduled damage volleys (Remains of Overwhelming Power)

**Trigger Types:**
- `onMeleeHit` - Auto attack, Stormstrike, Lightning Strike, Windfury
- `onMeleeCrit` - Melee critical strikes
- `onSpellHit` - Shocks, Flametongue, spell strikes
- `onSpellCrit` - Spell critical strikes
- `onShockHit` - Shock spells specifically
- `onBeingHit` - When player takes damage
- `onUse` - Manual activation

### Adding a New Proc (Legacy System)
1. Add proc definition to `procs.js` (data file)
2. Add trigger logic to `procSystem.js`
3. Add detection function to `procSystem.js`
4. No changes needed to `engine.js`

## Data-Driven Proc System Migration (v1.4.0)

### Current Status
- **Feature Flag**: `USE_DATA_DRIVEN_PROCS` is set to `true` by default
- **Data-Driven System**: ACTIVE - handles proc routing via `fireTrigger()`
- **Legacy System**: Still present for fallback, will be removed after validation

### Enabling the Data-Driven System

To test the data-driven system:
```javascript
// In the simulator, set:
sim.USE_DATA_DRIVEN_PROCS = true;
```

### Testing Procedure
1. Run simulations with same seed using legacy system (USE_DATA_DRIVEN_PROCS=false)
2. Record DPS output for several seeds
3. Enable data-driven system (USE_DATA_DRIVEN_PROCS=true)
4. Run same simulations with same seeds
5. Compare outputs - should be identical

### Cleanup Path (After Validation)
Once the data-driven system is validated to produce identical results:

1. Set `USE_DATA_DRIVEN_PROCS = true` as default
2. Remove legacy trigger* method calls from:
   - `performAutoAttack()`
   - `castAbility()`
   - `castLightningStrike()`
   - `procFlametongue()`
   - `procLightningShield()`
   - `procEmpoweredLightningShield()`
3. Remove deprecated trigger* methods (~750 lines):
   - `triggerCrusader()`
   - `triggerWrathOfCenarius()`
   - `triggerFlurry()`
   - `triggerElementalDevastation()`
   - `triggerElementalFocus()`
   - `triggerDragonbreathChili()`
   - `triggerOrnateBloodstoneDagger()`
   - `triggerBladeOfEternalDarkness()`
   - `triggerStonebreaker()`
   - `triggerBadgeOfTheSwarmguard()`
4. Remove has* detection methods now handled by procEngine (~200 lines)

### Adding a New Buff
1. Add buff definition to `buffs.js` (data file)
2. Add tracking to `buffSystem.js` if needed
3. No changes needed to `engine.js`

### Adding a New Ability
1. Add spell definition to `shamanSpells.js` (data file)
2. Add casting logic to `abilitySystem.js`
3. No changes needed to `engine.js`

## Testing

Each module can be unit tested independently:
- `eventSystem.js` - Test heap operations
- `damageSystem.js` - Test damage calculations with known inputs
- `procSystem.js` - Test proc triggers with fixed RNG seeds
- `buffSystem.js` - Test buff activation/expiration

## Migration Status

ALL PHASES COMPLETE - Full integration into ShamanCombatSimulator:

### Phase 1-9: Subsystem Integration (v1.2.0)
- [x] Phase 1: Event System (`eventSystem.js`) - INTEGRATED as `sim._eventSystem`
- [x] Phase 2: Damage System (`damageSystem.js`) - INTEGRATED via helper functions
- [x] Phase 3: Buff System (`buffSystem.js`) - INTEGRATED as `sim._buffSystem`
- [x] Phase 4: Proc System (`procSystem.js`) - INTEGRATED as `sim._procSystem`
- [x] Phase 5: Ability System (`abilitySystem.js`) - INTEGRATED as `sim._abilitySystem`
- [x] Phase 6: Core Engine (`engine.js`) - COMPLETE (orchestrator/facade)
- [x] Phase 7: Combat Stats (`combatStats.js`) - INTEGRATED as `sim._combatStats`
- [x] Phase 8: Worker Pool (`workerPool.js`) - COMPLETE
- [x] Phase 9: Sim Context (`simContext.js`) - COMPLETE

### Phase 10-15: Logic Extraction (v1.3.0)
- [x] Phase 10: Ability Handlers (`abilityHandlers.js`) - Context factory and helpers
- [x] Phase 11: Proc Handlers (`procHandlers.js`) - Proc activation patterns
- [x] Phase 12: Rotation System (`rotationSystem.js`) - Priority and opener logic
- [x] Phase 13: Detection Helpers (`detectHelpers.js`) - Consolidated has*/is*/get*
- [x] Phase 14: Engine run() method - Simulator injection support
- [x] Phase 15: Documentation and cleanup - COMPLETE

## Documentation

Each module has its own detailed documentation file:

| File | Documentation |
|------|---------------|
| eventSystem.js | [eventSystem.md](./eventSystem.md) |
| damageSystem.js | [damageSystem.md](./damageSystem.md) |
| buffSystem.js | [buffSystem.md](./buffSystem.md) |
| procSystem.js | [procSystem.md](./procSystem.md) |
| abilitySystem.js | [abilitySystem.md](./abilitySystem.md) |
| combatStats.js | [combatStats.md](./combatStats.md) |
| simContext.js | [simContext.md](./simContext.md) |
| workerPool.js | [workerPool.md](./workerPool.md) |
| engine.js | [engine.md](./engine.md) |
| index.js | [index.md](./index.md) |

## File Descriptions

### `eventSystem.js`
**Status: INTEGRATED into shamanCombatSim.js**

Binary min-heap based event scheduling system. Provides O(log n) event scheduling and O(1) event cancellation via lazy deletion.

**Key Exports:**
- `EventSystem` - Main class for event scheduling
- Methods: `schedule()`, `unschedule()`, `unscheduleByType()`, `pop()`, `peek()`

### `damageSystem.js`
**Status: Helper functions extracted**

Damage calculation utilities including resistance tables, armor reduction, and crit multipliers.

**Key Exports:**
- `DamageSystem` - Class for damage calculations
- `RESISTANCE_TABLE` - WoW Classic resistance probability table
- `rollResistance()` - Roll for resistance outcome
- `calculateArmorReduction()` - Calculate physical damage reduction
- `getCritMultiplier()` - Get crit multiplier based on school and talents

### `buffSystem.js`
**Status: COMPLETE**

Buff and debuff tracking system. Handles activation, expiration, refresh tracking, and uptime calculation.

**Key Exports:**
- `BuffSystem` - Main class for buff tracking
- `TRACKED_BUFFS` - List of all tracked buff names
- `createBuffTracker()` - Create a new buff tracker object
- Methods: `activateBuff()`, `refreshBuff()`, `deactivateBuff()`, `calculateUptime()`

### `procSystem.js`
**Status: COMPLETE**

Proc detection, triggering, and internal cooldown tracking.

**Key Exports:**
- `ProcSystem` - Main class for proc management
- `ProcTrigger` - Enum of trigger types (onMeleeHit, onSpellCrit, etc.)
- `calculatePpmProcChance()` - Convert PPM to proc chance
- `detectEquippedProcs()` - Find active procs from gear

### `abilitySystem.js`
**Status: COMPLETE**

Spell casting, cooldown management, and GCD tracking.

**Key Exports:**
- `AbilitySystem` - Main class for ability management
- `GCD_CONFIG` - GCD constants (base, minimum)
- `calculateGcd()` - Calculate GCD with haste
- `calculateCastTime()` - Calculate cast time with haste and talents

### `combatStats.js`
**Status: COMPLETE**

Combat statistics aggregation and damage breakdown tracking.

**Key Exports:**
- `CombatStats` - Main class for statistics
- `mergeCombatStats()` - Merge stats from parallel workers
- Methods: `recordDamage()`, `getSortedBreakdown()`, `getSummary()`

### `simContext.js`
**Status: COMPLETE**

Simulation context building and serialization for Web Workers.

**Key Exports:**
- `STAT_EXTRA_KEYS` - Stats that need special serialization
- `FEATURE_FLAGS` - Boolean flags for features
- `buildSimContext()` - Build complete sim context
- `serializeStats()` / `deserializeStats()` - Worker serialization

### `workerPool.js`
**Status: COMPLETE**

Web Worker pool management for parallel simulation execution.

**Key Exports:**
- `WorkerPool` - Main class for managing workers
- `WORKER_POOL_CONFIG` - Default configuration constants
- `calculateWorkerCount()` - Optimal worker count calculation
- `distributeIterations()` - Distribute work across workers
- `runParallelSimulations()` - Convenience function for parallel sims

### `engine.js`
**Status: COMPLETE (orchestrator/facade)**

Core simulation orchestrator. Provides a clean API for running single or parallel simulations while coordinating all sub-systems.

**Key Exports:**
- `SimulationEngine` - Main orchestrator class
- `createSimulationEngine()` - Factory function
- `createRng()` - Seeded Mulberry32 RNG creator
- Methods: `run()`, `runSingle()`, `runParallel()`, `aggregateResults()`, `reset()`, `getState()`

### `abilityHandlers.js`
**Status: NEW (v1.3.0)**

Extracted ability execution logic with context-based helper functions.

**Key Exports:**
- `createSimContextFromSimulator()` - Bridge between class and functional handlers
- `handleCommonProcs()` - Common proc triggers after ability hits
- `handleWeaponProcs()` - Flametongue/Windfury handling
- `handleStormhowl3pc()` / `handleStormhowl5pc()` - Set bonus handlers
- `calculateShockCooldown()` - Shock CD with Reverberation
- `calculateBattlegear3pcCooldown()` - Battlegear CD reduction

### `procHandlers.js`
**Status: NEW (v1.3.0)**

Extracted proc triggering patterns and constants.

**Key Exports:**
- `activateOrRefreshBuff()` - Generic buff activation/refresh pattern
- `scheduleBuffExpiration()` - Expiration event scheduling
- `rollPpmProc()` / `rollFlatProc()` - Proc chance rolls
- `calculateCrusaderApBonus()` - Crusader stat calculation
- `getFlurryHaste()` / `getElementalDevastationCrit()` - Talent rank values
- `createProcHandler()` - Factory for standardized proc handlers
- Constants: `WRATH_OF_CENARIUS`, `CRUSADER`, `ELEMENTAL_FOCUS`

### `rotationSystem.js`
**Status: NEW (v1.3.0)**

Extracted rotation execution and priority system logic.

**Key Exports:**
- `NO_GCD_ABILITIES` - Abilities that don't trigger GCD
- `COOLDOWN_MAP` - Ability to cooldown name mapping
- `DEFAULT_ROTATION_PRIORITY` - Hardcoded rotation priority list
- `OPENER_HANDLERS` - Map of opener item handlers
- `abilityUsesGCD()` - Check if ability triggers GCD
- `getAbilityCooldownRemaining()` - Get CD remaining for ability
- `shouldDelayForHigherPriority()` - Check delay rules
- `getSortedAbilities()` - Sort by priority
- `checkAbilityConditions()` / `checkLightningShieldConditions()` / `checkFlameShockStatus()`
- `openerItemUsesGCD()` / `tryExecuteOpenerItem()`

### `detectHelpers.js`
**Status: NEW (v1.3.0)**

Consolidated equipment, talent, and state detection helpers.

**Key Exports (Talent Detection):**
- `hasElementalMasteryTalent()` / `hasBloodlustTalent()` / `hasElementalFocus()`

**Key Exports (Equipment Detection):**
- `hasCrusaderEnchant()` / `hasNaturalAlignmentCrystal()` / `hasShardOfTheFallenStar()`
- `hasEyeOfDiminution()` / `hasKissOfTheSpider()` / `hasBadgeOfTheSwarmguard()`
- `hasOrnateBloodstoneDagger()` / `hasBladeOfEternalDarkness()` / `hasDragonbreathChili()`

**Key Exports (State Detection):**
- `isGCDReady()` / `isAbilityReady()` / `isNightfallActive()` / `isHemorrhageActive()`
- `getHasteMultiplier()` / `getSpellHitBonus()` / `getCrusaderProcChance()`
- `getMainhandIcon()`

### `index.js`
Re-exports all modules for convenient importing:
```javascript
// Core systems
import { EventSystem, BuffSystem, CombatStats } from './sim/index.js';

// Extracted logic (v1.3.0)
import { handleCommonProcs, createProcHandler, getSortedAbilities } from './sim/index.js';

// Detection helpers
import { hasElementalMasteryTalent, isGCDReady, getHasteMultiplier } from './sim/index.js';

// Data-driven systems (v1.5.0)
import { 
    processImbuesOnMeleeHit,
    dropTotem, 
    applyDot, 
    triggerLightningShield,
    processSetBonusAbilityHit 
} from './sim/index.js';
```

### `imbueSystem.js`
**Status: NEW (v1.5.0)**

Data-driven weapon imbue handling for Flametongue and Windfury.

**Key Exports:**
- `isImbueActive()` - Check if an imbue is active
- `processFlametongue()` - Process Flametongue fire damage on hit
- `processWindfury()` - Process Windfury extra attacks
- `processImbuesOnMeleeHit()` - Process all active imbues on melee hit

### `totemSystem.js`
**Status: NEW (v1.5.0)**

Data-driven totem lifecycle management.

**Key Exports:**
- `initializeTotemStates()` - Initialize totem slot states
- `dropTotem()` - Drop a totem, replacing same-slot totems
- `isTotemActive()` - Check if a totem is active in a slot
- `getActiveTotem()` - Get active totem definition for a slot
- `removeTotem()` - Remove totem from a slot

**Totem Behaviors:**
- `detonate` - Fire Nova Totem (explodes after delay)
- `autoAttack` - Searing Totem (attacks periodically)
- `pulse` - Stoneclaw/Magma (periodic effects)
- `aura` - Windfury/Grace of Air (passive buffs)

### `dotSystem.js`
**Status: NEW (v1.5.0)**

Data-driven DOT application and tick scheduling.

**Key Exports:**
- `initializeDotStates()` - Initialize DOT state tracking
- `applyDot()` - Apply a DOT with snapshotting
- `isDotActive()` - Check if a DOT is active
- `getDotTimeRemaining()` - Get time remaining on a DOT
- `processDotTick()` - Process a DOT tick
- `removeDot()` - Remove/cancel a DOT

### `lightningShieldSystem.js`
**Status: NEW (v1.5.0)**

Data-driven Lightning Shield and Empowered Lightning Shield handling.

**Key Exports:**
- `initializeLightningShieldStates()` - Initialize shield states
- `applyLightningShield()` - Apply Lightning Shield with charges
- `isLightningShieldReady()` - Check if LS is off ICD
- `triggerLightningShield()` - Trigger LS on being hit
- `isEmpoweredLightningShieldReady()` - Check if ELS is off cooldown
- `triggerEmpoweredLightningShield()` - Trigger ELS on Lightning Strike hit
- `getEmpoweredLightningShieldCooldown()` - Get ELS cooldown remaining

### `setBonusSystem.js`
**Status: NEW (v1.5.0)**

Data-driven set bonus effect handling.

**Key Exports:**
- `initializeSetBonusStates()` - Initialize set bonus buff states
- `getCooldownReduction()` - Get cooldown reduction for an ability
- `activateEchoedThunder()` - Activate T2 5pc buff
- `consumeEchoedThunder()` - Consume buff and deal nature damage
- `activateInstantLightningBolt()` - Activate T2 8pc proc
- `consumeInstantLightningBolt()` - Consume instant LB proc
- `activateStormwolfFrenzy()` - Activate Stormhowl 5pc buff
- `getStormwolfFrenzyHaste()` - Get haste multiplier from Stormwolf's Frenzy
- `processSetBonusAbilityHit()` - Process set bonus effects on ability hit
- `processSetBonusMeleeHit()` - Process set bonus effects on melee hit
- `getDotDurationBonus()` - Get DOT duration bonus from set bonuses

## Version History

- **v1.5.0** (2026-01-26) - Full System Decoupling
  - Created 5 new data-driven subsystems:
    - `imbueSystem.js` - Flametongue and Windfury weapon imbue handling
    - `totemSystem.js` - Fire Nova, Searing, Stoneclaw, Magma totem management
    - `dotSystem.js` - Flame Shock DOT with snapshotting support
    - `lightningShieldSystem.js` - Lightning Shield and Empowered LS
    - `setBonusSystem.js` - All 8 set bonus effects (T2 Battlegear/Garb, Stormhowl, Incendosaur)
  - Created 2 new data files:
    - `totems.js` - Totem definitions with behavior types (detonate, autoAttack, pulse, aura)
    - `setBonuses.js` - Set bonus definitions with effect types and stat keys
  - Extended `procEngine.js` with 2 new effect handlers:
    - `onUseActivation` - Trinket/talent activations (Kiss of the Spider, EM, NAC, etc.)
    - `onUseDamage` - Instant damage trinkets (Shard of the Fallen Star)
  - Added weapon imbue definitions to `procs.js`:
    - `flametongue_weapon` (imbueDamage effect type)
    - `windfury_weapon` (imbueExtraAttacks effect type)
  - Added DOT configuration to `shamanSpells.js`:
    - `flameShockDot.dot` config with tickInterval, baseDuration, snapshots, canCrit
  - New functions exported from index.js:
    - Imbue: `isImbueActive`, `processFlametongue`, `processWindfury`, `processImbuesOnMeleeHit`
    - Totem: `initializeTotemStates`, `dropTotem`, `isTotemActive`, `removeTotem`
    - DOT: `applyDot`, `isDotActive`, `processDotTick`, `getDotTimeRemaining`
    - LS: `triggerLightningShield`, `triggerEmpoweredLightningShield`, `isLightningShieldReady`
    - Set: `activateEchoedThunder`, `activateStormwolfFrenzy`, `processSetBonusAbilityHit`
  - Adding new totems, set bonuses, or imbues now requires ONLY editing data files

- **v1.4.0** (2026-01-26) - Data-Driven Proc System
  - Created `procEngine.js` with generic proc processor and 5 effect handlers:
    - `statBuff`, `stackingBuff`, `chargeBuff`, `damageProc`, `armorPenStack`
  - Created `triggerRouter.js` that routes combat events to proc checks
  - Added standardized `effect` objects to 10 key procs in `procs.js`:
    - Crusader, Wrath of Cenarius, Flurry, Elemental Devastation
    - Ornate Bloodstone Dagger, Blade of Eternal Darkness, Dragonbreath Chili
    - Totem of Stonebreaker, Elemental Focus, Badge of the Swarmguard
  - Added `fireTrigger()` and `fireSpellHitTriggers()` methods to simulator
  - Feature flag `USE_DATA_DRIVEN_PROCS` controls system activation (default: false)
  - Legacy `trigger*` methods remain for backward compatibility
  - Adding new procs now requires ONLY editing `procs.js` (no code changes)

- **v1.3.0** (2026-01-26) - Full engine migration and logic extraction
  - Created `abilityHandlers.js` with context factory and ability helpers
  - Created `procHandlers.js` with proc activation patterns and constants
  - Created `rotationSystem.js` with priority system and opener handlers
  - Created `detectHelpers.js` consolidating all has*/is*/get* helpers
  - Updated `engine.js` with `run()` method and simulator injection support
  - Full documentation for all new modules
  - shamanCombatSim.js now uses all modular subsystems as primary implementation

- **v1.2.0** (2026-01-26) - Complete subsystem integration
  - Integrated ALL subsystems into ShamanCombatSimulator:
    - `_eventSystem` (EventSystem)
    - `_buffSystem` (BuffSystem)
    - `_procSystem` (ProcSystem)
    - `_abilitySystem` (AbilitySystem)
    - `_combatStats` (CombatStats)
    - DamageSystem helper functions
  - Maintained backward compatibility with legacy properties
  - All simulation now uses modular subsystems

- **v1.1.0** (2026-01-26) - Full module completion
  - Completed WorkerPool for parallel simulation management
  - Completed SimulationEngine orchestrator/facade
  - All 9 phases complete (event, damage, buff, proc, ability, engine, stats, workers, context)
  - Full documentation for all modules

- **v1.0.0** (2026-01-25) - Initial modular architecture
  - Extracted Event System and integrated into shamanCombatSim.js
  - Created helper modules for damage, buffs, procs, abilities, stats
  - Created simContext for worker serialization
  - Documented architecture and migration plan
