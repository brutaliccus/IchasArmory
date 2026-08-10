# modules/shaman/combatSim.js - Combat Simulation Engine

## Overview

`modules/shaman/combatSim.js` is the **core combat simulation engine** for Shaman DPS calculations. It provides a streamlined, event-driven simulation system that accurately models World of Warcraft combat mechanics, including ability rotations, proc handling, resource management, and threat generation.

**File Size:** 1,765 lines of code
**Type:** ES6 Module
**Primary Use:** Accurate combat simulation with full proc/rotation tracking

---

## Architecture Overview

```
combatSim.js (Combat Simulation Core)
├── RNG System
│   ├── FastRNG - Seeded Mulberry32 PRNG for reproducible results
│   ├── check() - Probability checks (proc chances, etc.)
│   ├── range() - Random value in range (damage rolls)
│   └── random() - Raw random [0,1)
│
├── Event System
│   ├── EventSystem - Priority queue for scheduled events
│   ├── scheduleEvent() - Add event to queue
│   ├── unscheduleEvent() - Remove event from queue
│   └── Event Loop - Processes events in time order
│
├── Combat Simulator Core
│   ├── ShamanCombatSimulatorCore - Main simulation class
│   ├── Constructor - Initialize sim state (calls `syncWeaponImbueFlagsFromActiveBuffs` so imbue toggles match `activeBuffs`)
│   ├── syncWeaponImbueFlagsFromActiveBuffs() - Flametongue / Windfury / Frostbrand flags from buff list
│   ├── run() - Execute simulation
│   ├── executeRotation() - Priority-based rotation logic
│   └── getResults() - Return aggregated results
│
├── Data-Driven Systems (imported from modules/sim/)
│   ├── BuffSystem - Buff/debuff tracking with uptime
│   ├── ProcEngine - Proc activation and tracking
│   ├── DotSystem - DOT application and ticking
│   ├── ImbueSystem - Weapon imbue handling
│   ├── TotemSystem - Totem dropping and management
│   ├── LightningShieldSystem - LS/ELS charge tracking
│   └── SetBonusSystem - Set bonus activation logic
│
├── Combat Mechanics
│   ├── rollDamage() - Damage rolls with hit/crit/resist
│   ├── rollForCrit() - Crit roll for abilities
│   ├── rollForResistance() - Resistance roll for spells
│   ├── performAutoAttack() - Auto-attack execution
│   └── castAbility() - Spell/ability casting
│
├── Ability Execution
│   ├── castLightningStrike() - Lightning Strike special logic
│   ├── castFireNovaTotem() - Fire Nova Totem + detonation
│   ├── procWindfury() - Windfury proc handling
│   └── applyLightningShield() - Lightning Shield application
│
├── Resource Management
│   ├── GCD tracking (gcdReadyAt)
│   ├── Cooldown tracking (cooldowns map)
│   ├── Mana tracking (via stats)
│   └── Charge tracking (Stormstrike, Lightning Shield)
│
├── Threat Calculation
│   ├── recordDamage() - Damage + threat tracking
│   ├── Threat multipliers from stats
│   └── Per-ability threat modifiers
│
├── Timeline Tracking
│   ├── damageEvents[] - All damage events with timestamps
│   ├── combatLog[] - Text log of combat actions
│   ├── buffUptime{} - Buff uptime tracking
│   └── combatStats{} - Hit/crit/miss/dodge statistics
│
└── Multi-Iteration Support
    ├── runShamanSimulation() - Multi-iteration wrapper (auto `baseSeed` for advanced multi-iter replays)
    ├── replayShamanSimulationIteration() - Replay one iteration: `seed = baseSeed + globalIndex`
    ├── Web Worker pool for parallel execution (`__simGlobalIter` on each result for correct replay after filtering)
    ├── Result aggregation and averaging
    └── Stat weight calculation support (`options.baseSeed` + `quickSim`)
```

---

## Key Components

### 1. FastRNG - Seeded Random Number Generator (Lines 84-122)

**Purpose:** Deterministic random number generation for reproducible simulations

**Algorithm:** Mulberry32 - Fast, high-quality 32-bit PRNG

**Methods:**
```javascript
class FastRNG {
    constructor(seed)       // seed=undefined uses Math.random (non-deterministic)
    check(chance)           // Returns true with probability 'chance' (0-1)
    range(min, max)         // Returns random float in [min, max)
    random()                // Returns random float in [0, 1)
}
```

**Seeded vs Non-Seeded:**
- **Seeded (seed provided):** Deterministic - same seed → same results
  - Used for stat weight calculations (paired comparisons)
  - Used for debugging/testing
- **Non-seeded (seed=undefined):** Uses Math.random()
  - Used for single-iteration advanced sims (natural variance)
  - Multi-iteration advanced sims use `runShamanSimulation`’s auto `baseSeed` + per-iter `seed` (see Multi-Iteration Support)

**Example Usage:**
```javascript
const rng = new FastRNG(12345);  // Seeded - reproducible
rng.check(0.2)  // 20% chance → true/false

const rng2 = new FastRNG();      // Non-seeded - uses Math.random
rng2.range(100, 150)  // Random damage in range
```

**Why Mulberry32?**
- Fast (3-4x faster than Math.random in loops)
- High quality (passes statistical tests)
- Small state (single 32-bit integer)
- No dependencies

---

### 2. Event System (Lines 246-261)

**Purpose:** Schedule and process simulation events in time order

**Architecture:** Priority queue (min-heap) sorted by event time

**Methods:**
```javascript
scheduleEvent(time, type, handler, eventId = null)
    // Schedules event to run at 'time'
    // Returns eventId for cancellation

unscheduleEvent(eventId)
    // Removes scheduled event before it runs
```

**Event Types:**
- `autoAttack` - Auto-attack swing
- `gcdReady` - GCD expires, rotation check
- `rotationCheck` - Ability cooldown ready
- `fireNovaDetonation` - Fire Nova Totem explodes
- `dotTick` - DOT damage tick
- `buffExpire` - Buff/proc expires
- `procActivation` - Trinket/talent cooldown ready
- `totemExpire` - Totem expires

**Event Loop (Lines 944-960):**
```javascript
while ((event = this._eventSystem.pop()) !== null) {
    if (event.time >= this.fightDuration) break;

    this.currentTime = event.time;
    event.handler();  // Execute event
}
```

**Event Ordering:**
- Events processed in strict time order
- Simultaneous events processed in schedule order
- GCD/cooldown events auto-schedule next rotation check

**Example Event Flow:**
```
Time 0.000s: scheduleEvent(0.000, 'autoAttack', performAutoAttack)
Time 0.000s: scheduleEvent(0.000, 'gcdReady', executeRotation)
Time 0.000s: executeRotation() → castAbility('stormstrike')
Time 1.500s: scheduleEvent(1.500, 'gcdReady', executeRotation)  # After GCD
Time 2.000s: performAutoAttack() → damage + procs
Time 2.000s: scheduleEvent(4.000, 'autoAttack', performAutoAttack)  # Next swing
Time 1.500s: executeRotation() → castAbility('earthShock')
...
```

---

### 3. ShamanCombatSimulatorCore Class (Lines 131-244)

**Purpose:** Main simulation engine - manages combat state and execution

**Constructor Parameters:**
```javascript
constructor(stats, fightDuration = 300, priorityConfig = null, simContext = null)
```

**State Variables:**

**Combat State:**
```javascript
currentTime: number         // Current simulation time
fightDuration: number       // Total fight duration (seconds)
gcdReadyAt: number          // When GCD expires
cooldowns: {}               // Ability cooldown map
  - stormstrike: 0
  - lightningStrike: 0
  - shocks: 0               // Shared shock CD
  - fireNovaTotem: 0
  - elementalMastery: 0
  - bloodlust: 0
```

**Auto-Attack State:**
```javascript
autoAttackSpeed: number     // Hasted swing timer
baseWeaponSpeed: number     // Base weapon speed (for PPM procs)
nextAutoAttack: number      // Next auto-attack time
baseWeaponDamageMin: number // Weapon damage range
baseWeaponDamageMax: number
```

**Lightning Shield State:**
```javascript
lightningShieldCharges: number      // Current charges (0-3)
lightningShieldICD: number          // Internal cooldown (3s or 4s with Stable Shields)
lightningShieldLastProc: number     // Last proc time
```

**Enemy Attack State (for LS procs):**
```javascript
enemySwingTimer: number     // Enemy attack speed (default 2.0s)
nextEnemyAttack: number     // Next enemy attack time
```

**Damage Tracking:**
```javascript
damageEvents: []            // All damage events: [{ time, ability, damage, threat, outcome, ... }]
totalDamage: number         // Total damage dealt
totalThreat: number         // Total threat generated
```

**Combat Statistics:**
```javascript
combatStats: {
    totalHits: 0,
    totalCrits: 0,
    totalMisses: 0,
    totalDodges: 0,
    totalParries: 0,
    totalGlancingBlows: 0,
    critDamageTotal: 0,
    hitDamageTotal: 0,
    glancingDamageTotal: 0,
    partialResists: { resist_75: 0, resist_50: 0, resist_25: 0 },
    fullResists: 0
}
```

**Per-Ability Statistics:**
```javascript
_abilityStats: {
    [abilityName]: {
        hits: 0, crits: 0, misses: 0, dodges: 0, parries: 0, glancing: 0,
        totalAttempts: 0,
        hitDamageTotal: 0, critDamageTotal: 0, glancingDamageTotal: 0,
        minHit: Infinity, maxHit: 0,
        minCrit: Infinity, maxCrit: 0,
        partialResists: { resist_75: 0, resist_50: 0, resist_25: 0 },
        fullResists: 0,
        // Partial resists split by crit/hit (for grouped breakdown UI)
        critResist75: 0, critResist50: 0, critResist25: 0,
        hitResist75: 0, hitResist50: 0, hitResist25: 0,
        critResist75DamageTotal: 0, critResist50DamageTotal: 0, critResist25DamageTotal: 0,
        hitResist75DamageTotal: 0, hitResist50DamageTotal: 0, hitResist25DamageTotal: 0,
        minCritResist: Infinity, maxCritResist: 0,
        minHitResist: Infinity, maxHitResist: 0,
        minCritResist75: Infinity, maxCritResist75: 0,
        minCritResist50: Infinity, maxCritResist50: 0,
        minCritResist25: Infinity, maxCritResist25: 0,
        minHitResist75: Infinity, maxHitResist75: 0,
        minHitResist50: Infinity, maxHitResist50: 0,
        minHitResist25: Infinity, maxHitResist25: 0
    }
}
```

**Data-Driven Systems (initialized in constructor):**
```javascript
_eventSystem: EventSystem           // Event priority queue
_buffSystem: BuffSystem             // Buff/debuff tracking
procStates: {}                      // Proc activation states (from procEngine.js)
dotStates: {}                       // DOT tracking (from dotSystem.js)
totemStates: {}                     // Totem states (from totemSystem.js)
lightningShieldState: {}            // LS/ELS state (from lightningShieldSystem.js)
setBonusStates: {}                  // Set bonus states (from setBonusSystem.js)
```

---

### 4. Rotation Execution (Lines 699-801)

**Priority-Based Rotation System**

#### `executeRotation()` (Lines 699-749)

**Purpose:** Execute next ability based on priority configuration

**Priority Configuration Format:**
```javascript
[
    { type: 'ability', name: 'stormstrike' },
    { type: 'ability', name: 'lightningStrike' },
    { type: 'ability', name: 'flameShock', condition: 'dot_missing' },
    { type: 'totem', name: 'fireNova', condition: 'cooldown_ready' },
    { type: 'ability', name: 'earthShock' }
]
```

**Execution Flow:**
```
1. Check if GCD ready → return if not
2. Check if Lightning Shield needs refresh → apply if depleted
3. Iterate through priority list:
   - For each action, call canExecuteAction()
   - If executable, call executeAction() and return
4. If no ability cast:
   - Find next cooldown expiry time
   - Schedule next rotation check
```

**Default Priority (if not configured):**
```javascript
[
    { type: 'ability', name: 'stormstrike' },
    { type: 'ability', name: 'lightningStrike' },
    { type: 'ability', name: 'flameShock', condition: 'dot_missing' },
    { type: 'totem', name: 'fireNova', condition: 'cooldown_ready' },
    { type: 'ability', name: 'earthShock' }
]
```

#### `canExecuteAction(action)` (Lines 762-784)

**Purpose:** Check if action can be executed

**Checks:**
1. **Ability cooldown:** `isAbilityReady(cooldownKey)`
2. **Condition evaluation:**
   - `dot_missing`: Check if DOT is not active
   - `cooldown_ready`: Check if totem cooldown ready
3. **Resource availability:** (Future: mana checks)

**Returns:** `true` if action can be executed, `false` otherwise

#### `executeAction(action)` (Lines 786-794)

**Purpose:** Execute the action

**Action Types:**
- `ability`: Call `castAbility(action.name)`
- `totem`: Call totem-specific cast method (e.g., `castFireNovaTotem()`)

**Side Effects:**
- Triggers GCD
- Sets cooldown
- Records damage/threat
- Schedules next rotation check

---

### 5. Ability Casting (Lines 549-698)

#### `castAbility(spellKey)` (Lines 551-619)

**Purpose:** Cast any shaman ability (instant or cast time)

**Process:**
```
1. Get spell definition from shamanSpells
2. Calculate damage with calculateSpellDamage()
3. Roll for hit/crit/resist with rollDamage()
4. Record damage with recordDamage()
5. If hit:
   - Fire melee procs (if physical)
   - Fire spell procs (if spell)
   - Apply special effects (Stormstrike debuff, Flame Shock DOT, etc.)
6. Set cooldown (if applicable)
7. Trigger GCD
```

**Example: Earth Shock**
```javascript
castAbility('earthShock')
  → calculateSpellDamage(shamanSpells.earthShock, stats)
  → rollDamage(spell, damageResult, false)  // isPhysical=false
  → recordDamage('Earth Shock', damage, { type: 'ability', outcome: 'hit' })
  → fireSpellHitTriggers() // Check for procs
  → setCooldown('shocks', 6)  // Shared shock CD
  → triggerGCD()  // 1.5s GCD
```

**Special Cases:**
- **Lightning Strike:** Uses custom `castLightningStrike()` (dual physical/nature damage)
- **Flame Shock:** Applies DOT via `applyDot()`
- **Stormstrike:** Applies debuff via `stats.applyStormstrike()`

#### `castLightningStrike()` (Lines 621-697)

**Purpose:** Cast Lightning Strike with special dual-damage mechanics

**Lightning Strike Mechanics:**
- **Damage Types:** 50% physical + 50% nature damage
- **Hit Rolls:** Single physical hit roll for both portions
- **Crit Rolls:** Separate crit rolls for physical and nature
- **Physical Portion:** Affected by armor, uses melee crit
- **Nature Portion:** Affected by resistance, uses spell crit
- **Empowered Lightning Shield:** Consumes LS charge for bonus damage

**Calculation Flow:**
```
1. Get spell damage breakdown (physicalMin, physicalMax, natureMin, natureMax)
2. Check if Lightning Shield has charges (for ELS proc)
3. Roll base damage for both portions
4. Check physical hit (melee avoidance table)
5. If hit:
   a. Physical portion:
      - Apply armor reduction
      - Roll for melee crit (×2.0 multiplier)
   b. Nature portion:
      - Roll for resistance
      - Roll for spell crit (×1.5 multiplier)
6. Record damage separately (Physical and Nature)
7. If hit and had LS charges:
   - Trigger Empowered Lightning Shield (cannot miss/crit, ignores resist)
8. Fire procs:
   - Melee procs for physical portion
   - Spell procs for nature portion
9. Fire weapon imbues (Flametongue, Windfury)
10. Activate set bonus (Echoed Thunder from T0.5 5pc)
11. Set cooldown (base 6s, reduced by T0.5 3pc)
12. Trigger GCD
```

**Set Bonus Interactions:**
- **T0.5 3pc:** Reduces Lightning Strike cooldown by 1s (6s → 5s)
- **T0.5 5pc (Echoed Thunder):** Next auto-attack deals bonus nature damage
- **T0.5 8pc (Lightning Shield Enhancement):** LS charges last longer

**Example Output:**
```
Lightning Strike (Physical): 234 damage (crit)
Lightning Strike (Nature): 189 damage (hit, 25% resist)
Empowered Lightning Shield: 76 damage (cannot miss/crit)
→ Total: 499 damage
```

---

### 6. Auto-Attack System (Lines 481-547)

#### `performAutoAttack()` (Lines 482-526)

**Purpose:** Execute white damage swing with imbues and procs

**Auto-Attack Flow:**
```
1. Get auto-attack spell definition
2. Calculate weapon damage with calculateSpellDamage()
3. Roll for hit/dodge/parry/glancing/crit
4. Record damage
5. If hit:
   a. Consume one Flurry charge (this swing), then fire melee attack procs:
      - Order matters: crits refresh Flurry to 3 stacks; charge for the triggering swing must be spent first (matches `executeAutoAttack` in `abilityCasting.js`).
      - Trinket procs (Kiss of Spider, Badge, etc.)
      - Talent procs (Flurry refresh on crit, Elemental Devastation, etc.)
      - Weapon enchant procs (Crusader, etc.)
   b. Process weapon imbues:
      - Flametongue Weapon (100% chance, bonus fire damage)
      - Windfury Weapon (20% chance, 2 extra attacks)
   c. Set bonus procs:
      - Echoed Thunder (T0.5 5pc)
6. Schedule next auto-attack
```

**Physical Attack Table (Level 60 vs Level 63):**
```
1. Miss Check (9% base - hit bonuses)
2. Dodge Check (6.5% vs L63)
3. Parry Check (14% vs L63 from front)
4. Glancing Check (40% vs L63, 65% damage)
5. Crit Check (crit % from gear/talents)
6. Hit (remaining %)
```

**Weapon Damage Calculation:**
```
Base Weapon Damage = weaponDamageMin to weaponDamageMax (includes AP contribution)
× Armor Multiplier (typically 0.65-0.75 vs raid bosses)
× 2.0 if crit (physical crit)
× 0.65 if glancing blow
```

**Imbue Processing:**

**Flametongue Weapon:**
```javascript
if (isImbueActive(this, 'flametongue_weapon')) {
    const ftResult = processFlametongue(this, 'Auto Attack', icon);
    if (ftResult?.didHit) {
        fireSpellHitTriggers(this, 'Flametongue Weapon', icon, {
            didHit: true, isCrit: ftResult.isCrit, school: 'fire'
        });
    }
}
```

**Windfury Weapon:**
```javascript
if (isImbueActive(this, 'windfury_weapon') && this.rng.random() < 0.20) {
    this.procWindfury();  // 2 extra attacks
}
```

#### `procWindfury()` (Lines 529-547)

**Purpose:** Execute 2 extra Windfury attacks

**Windfury Mechanics:**
- Proc chance: 20% per swing
- Extra attacks: 2 instant attacks
- Bonus AP: +359 AP (Rank 6)
- Can crit independently
- Can proc Flametongue
- **Cannot proc Windfury again** (no chain procs)

**Windfury Attack Flow:**
```
For each of 2 attacks:
    1. Calculate damage with +359 AP bonus
    2. Roll for hit/dodge/parry/glancing/crit
    3. Record damage
    4. Fire melee attack procs
    5. Process Flametongue (if active)
    6. NO Windfury proc check
```

---

### 7. Proc System Integration (Lines 238-243, 493-518)

**Data-Driven Proc Engine:** All proc logic delegated to `modules/sim/procEngine.js`

**Proc Initialization (Line 239):**
```javascript
initializeProcStates(this);  // Initialize all active procs
```

**Proc Triggers:**

#### Melee Attack Triggers (Line 494)
```javascript
fireMeleeAttackTriggers(this, abilityName, icon, outcome);
```

**Procs Triggered:**
- Trinkets: Kiss of the Spider, Badge of the Swarmguard, Natural Alignment Crystal
- Talents: Flurry (on melee crit via trigger router; spell crits handled via `triggerFlurryFromSpellCrit()`), Elemental Devastation (on melee crit)
- Enchants: Crusader
- Weapons: Ornate Bloodstone Dagger
- Set Bonuses: Stormwolf's Frenzy (2pc haste on crit)

#### Spell Hit Triggers (Line 500)
```javascript
fireSpellHitTriggers(this, spellName, icon, { didHit, isCrit, school });
```

**Procs Triggered:**
- Trinkets: Eye of Diminution, Shard of the Fallen Star
- Talents: Elemental Focus (100% crit → 2 free spells)
- Totems: Totem of the Stonebreaker (shock hit → +130 AP)
- Weapons: Blade of Eternal Darkness (mana return)
- Food: Dragonbreath Chili (breath weapon on spell crit)
- Rings: Wrath of Cenarius (damage proc)

#### On-Use Activation (Lines 867-886)
```javascript
activateOnUseTrinket(trinketId);
```

**On-Use Trinkets:**
- Natural Alignment Crystal (84 AP for 20s, 5min CD)
- Kiss of the Spider (200 haste rating for 15s, 2min CD)
- Badge of the Swarmguard (Armor reduction stacks)
- Eye of Diminution (300 attack power for 20s, 3min CD)
- Shard of the Fallen Star (Spell crit buff)

**Auto-Activation:** On-use trinkets/talents activated at fight start and on cooldown

---

### 8. DOT System (Lines 595-604)

**Flame Shock DOT Handling**

**DOT Application (Line 596):**
```javascript
const durationBonus = getDotDurationBonus(this, 'flameShockDot');
const dotResult = applyDot(this, 'flameShockDot', { durationBonus });
```

**Earthfury Battlegear 8pc (`earthfury_8pc_aftershock`):** On a successful Earth Shock, `removeDot` + `applyDot(this, 'earthfuryBattlegearAftershockDot')` runs **before** `consumeStormstrikeCharge` so the delayed hit snapshots the same Stormstrike state as Earth Shock (the tick does not consume a charge). Spell definition: `modules/shaman/spells.js` — one DoT tick at +4s, `canCrit: false`, `rollForResistance(..., { isDot: true })` on tick. Aftershock damage is flat **175–226** only (`spCoefficient` / `apCoefficient` both **0**).

**DOT Mechanics:**
- Base duration: 15 seconds
- Duration bonuses:
  - Improved Fire Totems (2/2): +3 seconds → 18s
  - Storm, Earth, and Fire (5/5): +3 seconds → 21s (stacks with above)
- Tick interval: 3 seconds
- Snapshots multipliers at application:
  - Spell power
  - Spell crit
  - Elemental Fury bonus
  - Elemental Devastation bonus
  - Totem of Broken Earth bonus

**DOT Ticks:**
- Scheduled via event system
- Uses snapshotted multipliers (not current buffs)
- Can crit independently each tick
- Cannot miss (always hits if applied successfully)

**Legacy Sync (Lines 599-603):**
```javascript
this.flameShockDotExpires = this.currentTime + baseDuration + durationBonus;
this.flameShockDotSnapshotMultiplier = dotResult.snapshotMultiplier || 1.0;
```
- Required for rotation logic (dot_missing condition)

---

### 9. Totem System (Lines 803-843)

**Totem Types:**
- **Searing Totem:** Auto-attacks every 2.2s
- **Fire Nova Totem:** Delayed AoE (4s delay, then explodes)

#### `castFireNovaTotem()` (Lines 803-823)

**Purpose:** Drop Fire Nova Totem and schedule detonation

**Fire Nova Mechanics:**
- Cast time: Instant (triggers GCD)
- Cooldown: 15 seconds
- Delay: 4 seconds (until detonation)
- Damage: Fire AoE (affected by spell power)
- Can crit
- Cannot miss (guaranteed hit)

**Execution Flow:**
```
1. Drop totem with dropTotem(this, 'fireNova')
2. Schedule detonation event after 4s delay
3. Set 15s cooldown
4. Trigger GCD
```

#### `detonateFireNova()` (Lines 825-843)

**Purpose:** Deal Fire Nova damage

**Detonation Flow:**
```
1. Get spell definition (shamanSpells.fireNovaTotem)
2. Calculate damage with calculateSpellDamage()
3. Roll for crit/resist
4. Record damage
5. Fire spell hit triggers (for procs)
```

---

### 10. Lightning Shield System (Lines 467-478)

**Lightning Shield Mechanics:**
- Charges: 3 (base) or more with talents
- Charge consumption: On melee hit taken
- Internal cooldown: 3 seconds (4s with Stable Shields talent)
- Proc damage: Cannot miss or crit (guaranteed hit)
- Duration: 10 minutes (effectively permanent in combat)

**Lightning Shield Application (Line 475):**
```javascript
applyLightningShield(this, {});
```

**Charge Tracking:**
```javascript
this.lightningShieldCharges = this.getLightningShieldCharges();
```

**Empowered Lightning Shield (T0.5 8pc):**
- Consumed by Lightning Strike (if charges > 0)
- Bonus damage: Cannot miss, cannot crit, ignores resistance
- Triggered via `triggerEmpoweredLightningShield()`

**Refresh Logic:**
- If charges depleted (0 charges) and GCD ready:
  - Reapply Lightning Shield (restores 3 charges)
  - Triggers GCD (delays next ability by 1.5s)

---

### 11. Damage Rolling & Combat Mechanics (Lines 352-418)

#### `rollDamage(spell, damageResult, isPhysical)` (Lines 353-407)

**Purpose:** Roll damage for ability with hit/crit/resist checks

**Target school immunity:** When `stats.targetSchoolImmune` marks **physical** (melee rolls) or the spell’s **school** immune, returns **0** damage with `type: 'immune'` and **no** attack or resist rolls (`targetSchoolImmunity.js`). **`castLightningStrike`** splits physical vs nature immunity (nature can still apply if only physical is immune).

**Parameters:**
- `spell`: Spell definition from `shamanSpells`
- `damageResult`: Pre-calculated damage from `calculateSpellDamage()`
- `isPhysical`: true for melee/physical, false for spells

**Process:**

**1. Roll Base Damage:**
```javascript
const minDmg = damageResult.min || damageResult.average || 0;
const maxDmg = damageResult.max || damageResult.average || minDmg;
let damage = this.rng.range(minDmg, maxDmg);
```

**2. Check Hit (if spell can miss):**
```javascript
const canMiss = spell.canMiss !== false;  // Default: true
if (canMiss) {
    const hitChance = isPhysical ?
        (1 - meleeAvoidance.miss) :
        (0.83 + stats.spellHit);  // 17% base miss vs L63

    if (this.rng.random() > hitChance) {
        return { damage: 0, type: 'miss', didHit: false, isCrit: false };
    }
}
```

**3. Apply Armor (physical only):**
```javascript
if (isPhysical) {
    damage *= stats.getArmorDamageMultiplier();  // Typically 0.65-0.75
}
```

**4. Check Crit (if spell can crit):**
```javascript
const canCrit = spell.canCrit !== false;  // Default: true
if (canCrit) {
    const critChance = isPhysical ? stats.meleeCrit : stats.spellCrit;
    const isCrit = this.rng.random() < critChance;

    if (isCrit) {
        const critMult = isPhysical ? 2.0 : 1.5;
        damage *= critMult;
        return { damage, type: 'crit', didHit: true, isCrit: true };
    }
}
```

**5. Check Resistance (spells only):**
```javascript
if (!isPhysical && spell.school && spell.school !== 'physical') {
    const resistResult = rollForResistance(spell.school);
    damage *= resistResult.multiplier;

    if (resistResult.type === 'full_resist') {
        return { damage: 0, type: 'full_resist', didHit: false, isCrit: false };
    }
}
```

**6. Return Hit:**
```javascript
return { damage, type: 'hit', didHit: true, isCrit: false };
```

**Special Flags:**
- `spell.canMiss = false`: Ability cannot miss (e.g., Empowered Lightning Shield)
- `spell.canCrit = false`: Ability cannot crit (e.g., Lightning Shield proc)

#### `rollForResistance(school)` (Lines 417-418)

**Purpose:** Roll for partial/full resistance

**Resistance Mechanics:**
- Base resist chance: `targetResist / (targetResist + 510)` (simplified)
- Partial resists: 25%, 50%, 75% damage reduction
- Full resist: 0 damage (counts as miss)

**Resistance Table (vs 0 resist with +16% hit):**
```
Full Resist:  ~0%
75% Resist:   ~2%
50% Resist:   ~4%
25% Resist:   ~6%
Hit:          ~88%
```

**Spell Penetration:**
- Reduces target resistance (e.g., +20 spell pen → -20 target resist)

---

### 12. Cooldown & GCD Management (Lines 443-465)

#### Global Cooldown (GCD)

**GCD Duration:** 1.5 seconds (base, cannot be reduced by haste in vanilla)

**Trigger GCD (Lines 444-453):**
```javascript
triggerGCD() {
    this.gcdReadyAt = this.currentTime + this.GCD;

    // Schedule next rotation check when GCD expires
    if (this.gcdReadyAt < this.fightDuration) {
        this.scheduleEvent(this.gcdReadyAt, 'gcdReady', () => {
            this.executeRotation();
        });
    }
}
```

**Check GCD Ready (Line 455):**
```javascript
isGCDReady() {
    return this.currentTime >= this.gcdReadyAt;
}
```

#### Ability Cooldowns

**Cooldown Map:**
```javascript
cooldowns: {
    stormstrike: 0,         // 8s cooldown
    lightningStrike: 0,     // 6s cooldown (5s with T0.5 3pc)
    shocks: 0,              // 6s cooldown (shared by all shocks)
    fireNovaTotem: 0,       // 15s cooldown
    stoneclawTotem: 0,      // 30s cooldown
    elementalMastery: 0,    // 180s cooldown
    bloodlust: 0            // 360s cooldown
}
```

**Check Cooldown Ready (Line 459):**
```javascript
isAbilityReady(abilityName) {
    return this.currentTime >= (this.cooldowns[abilityName] || 0);
}
```

**Set Cooldown (Line 463):**
```javascript
setCooldown(abilityName, cooldown) {
    this.cooldowns[abilityName] = this.currentTime + cooldown;
}
```

**Shared Cooldowns:**
- **Shocks:** Earth Shock, Flame Shock, Frost Shock all share 6s cooldown
  - Mapped via `getCooldownKey()` (Line 796)

---

### 13. Stormstrike Charge System (Lines 420-440)

**Stormstrike Debuff Mechanics:**
- Duration: 12 seconds
- Charges: 4 nature spell hits consumed
- Effect: +20% nature damage per charge consumed
- Applied by Stormstrike ability (melee hit)

**Charge Consumption (Line 422):**
```javascript
consumeStormstrikeCharge() {
    // Consume from stats
    this.stats.consumeStormstrikeCharge?.();

    // Update buffUptime tracker when charges deplete
    const charges = this.stats.activeModifiers?.stormstrikeCharges || 0;
    if (charges === 0 && this.buffUptime?.stormstrike) {
        // Mark debuff as faded
        const activations = this.buffUptime.stormstrike.activationTimes;
        if (activations.length > 0) {
            const last = activations[activations.length - 1];
            if (last && last.end === null) {
                last.end = this.currentTime;
                last.duration = last.end - last.start;
                last.chargesDepleted = true;
            }
        }
    }
}
```

**Charge Consumer:** Lightning Bolt, Chain Lightning (nature spells)

---

### 14. Damage & Threat Recording (Lines 271-349)

#### `recordDamage(abilityName, damage, extra)` (Lines 273-349)

**Purpose:** Record damage event with threat calculation and statistics

**Threat Calculation:**
```javascript
const threat = damage * 1.0;  // Base threat multiplier
// Modified by:
//   - threatSpiritArmorMult (Spirit Armor: +10%)
//   - threatRockbiterMult (Rockbiter: +43.75%)
//   - threatCalmingWindsReduction (Calming Winds: -25%)
//   - threatSalvationMult (Salvation: ×0.75)
```

**Damage Event Structure:**
```javascript
{
    time: number,               // Event timestamp
    ability: string,            // Ability name
    damage: number,             // Damage dealt
    threat: number,             // Threat generated
    outcome: string,            // 'hit', 'crit', 'miss', 'dodge', 'parry', 'glancing'
    resistType: string,         // 'none', 'resist_25', 'resist_50', 'resist_75', 'full_resist'
    isCrit: boolean,            // Was crit
    ...extra                    // Additional data (type, school, etc.)
}
```

**Per-Ability Statistics:**
- Tracks hits, crits, misses, dodges, parries, glancing blows
- Tracks min/max hit/crit/glancing damage
- Tracks partial resist distribution
- Calculates hit rates, crit rates, etc.

**Combat Statistics Aggregation:**
- Global totals (totalHits, totalCrits, etc.)
- Per-ability breakdowns (abilityStats map)

---

### 15. Simulation Execution (Lines 921-970)

#### `run()` - Main Simulation Loop (Lines 923-970)

**Purpose:** Execute complete combat simulation from time 0 to fightDuration

**Simulation Flow:**

**1. Initialization:**
```javascript
this.log('=== Combat Simulation Started ===');

// Apply Lightning Shield
this.applyLightningShield();

// Drop Searing Totem
dropTotem(this, 'searing');

// Schedule initial auto-attack
this.scheduleEvent(this.nextAutoAttack, 'autoAttack', () => this.performAutoAttack());

// Activate on-use trinkets
this.activateOnUseTrinkets();

// Activate talent cooldowns (Elemental Mastery, Bloodlust)
this.activateTalentCooldowns();

// Initial rotation check
this.executeRotation();
```

**2. Event Loop:**
```javascript
this._processingEvents = true;
let iterations = 0;
const maxIterations = this.fightDuration * 500;  // Safety limit

let event;
while ((event = this._eventSystem.pop()) !== null) {
    if (event.time >= this.fightDuration) break;

    this.currentTime = event.time;
    event.handler();  // Execute event

    if (++iterations > maxIterations) {
        console.error('Max iterations exceeded');
        break;
    }
}
```

**3. Finalization:**
```javascript
this._processingEvents = false;
this.currentTime = this.fightDuration;

this.log('=== Combat Simulation Ended ===');
this.log(`Total damage: ${this.totalDamage.toFixed(2)}`);
this.log(`DPS: ${(this.totalDamage / this.fightDuration).toFixed(2)}`);

return this.getResults();
```

**Safety Limits:**
- Max iterations: `fightDuration × 500` (e.g., 150,000 for 300s fight)
- Prevents infinite loops from scheduling bugs

---

### 16. Result Aggregation (Lines 972-1039)

#### `getResults()` - Compile Simulation Results (Lines 972-1039)

**Purpose:** Aggregate all damage, threat, and statistics into result object

**Result Structure:**
```javascript
{
    totalDamage: number,
    dps: number,
    totalThreat: number,
    tps: number,

    damageBreakdown: {
        [abilityName]: {
            total: number,          // Total damage
            count: number,          // Number of casts
            percent: number,        // % of total damage
            average: number,        // Average damage per cast
            threat: number,         // Total threat
            icon?: string,          // Optional URL from first damageEvent.extra (proc-driven rows, e.g. Totem of Thundercall)
            combatStats: {
                hits: number,
                crits: number,
                misses: number,
                dodges: number,
                parries: number,
                glancing: number,
                totalAttempts: number,
                hitDamageTotal: number,
                critDamageTotal: number,
                glancingDamageTotal: number,
                avgHitDamage: number,
                avgCritDamage: number,
                avgGlancingDamage: number,
                minHit: number,
                maxHit: number,
                minCrit: number,
                maxCrit: number,
                minGlancing: number,
                maxGlancing: number,
                hitRate: number,        // % of attempts
                critRate: number,
                missRate: number,
                dodgeRate: number,
                parryRate: number,
                glancingRate: number,
                partialResists: { resist_75, resist_50, resist_25 },
                fullResists: number,
                // Partial resists split by crit vs hit
                critResist75, critResist50, critResist25,
                hitResist75, hitResist50, hitResist25,
                critResist75DamageTotal, critResist50DamageTotal, critResist25DamageTotal,
                hitResist75DamageTotal, hitResist50DamageTotal, hitResist25DamageTotal,
                minCritResist, maxCritResist,
                minHitResist, maxHitResist,
                minCritResist75, maxCritResist75,
                minCritResist50, maxCritResist50,
                minCritResist25, maxCritResist25,
                minHitResist75, maxHitResist75,
                minHitResist50, maxHitResist50,
                minHitResist25, maxHitResist25
            }
        }
    },

    damageEvents: [],           // All damage events (single iteration only)
    combatLog: [],              // Text log (single iteration only)
    buffUptime: {},             // Buff uptime tracking
    combatStats: {}             // Global combat statistics
}
```

**Damage Breakdown Calculation:**
```
For each damageEvent:
    1. Add to ability's total damage
    2. Increment ability's count
    3. Add to ability's threat total
    4. If event.icon is set, copy once onto damageBreakdown[ability].icon (UI prefers this over name-based icon map)

For each ability:
    percent = (ability.total / totalDamage) * 100
    average = ability.total / ability.count
```

**Combat Stats From Per-Ability Tracking:**
- Detailed hit/crit/miss/dodge/parry/glancing statistics
- Min/max damage tracking (actual observed values)
- Partial resist distribution
- Average damage per outcome type

---

### 17. Multi-Iteration Support (Lines 1250-1762)

#### `runShamanSimulation()` - Multi-Iteration Wrapper (Lines 1262-1762)

**Purpose:** Run multiple simulation iterations for statistical averaging

**Parameters:**
```javascript
runShamanSimulation(
    stats,                  // ShamanStats object
    fightDuration = 300,    // Fight duration in seconds
    iterations = 2500,      // Number of iterations
    progressCallback = null,// Progress callback function
    priorityConfig = null,  // Rotation priority config
    options = {}            // Additional options
)
```

**Options:**
```javascript
{
    nightfallEnabled: boolean,  // Nightfall debuff (3% spell crit)
    hemoEnabled: boolean,       // Hemorrhage debuff (+phys damage taken)
    hemoImproved: boolean,      // Improved Hemo (4% instead of 2%)
    quickSim: boolean,          // Skip detailed uptime tracking
    baseSeed: number,           // Base seed for paired seeding (stat weights)
    maxWorkers: number          // Max worker threads to use
}
```

**Execution Modes:**

**1. Web Worker Pool (Multi-Core):**
- Enabled if: `iterations >= 100` and `numWorkers > 1`
- Worker count: `min(hardwareConcurrency, 16)`
- Minimum iterations per worker: 15 (prevents overhead issues)
- Each worker runs subset of iterations
- Results aggregated from all workers
- Workers terminated after completion

**2. Main Thread (Single-Core):**
- Fallback if workers unavailable or low iteration count
- Batched execution (200 iterations per batch)
- Yields to UI thread between batches

**Seeding (iteration RNG):**

**Advanced sim, multiple iterations (`!quickSim`, `iterations > 1`):**
- If `options.baseSeed` is omitted, `runShamanSimulation` assigns a random 32-bit `baseSeed` and threads it through workers / main loop so iteration *i* uses `seed = baseSeed + i`.
- Aggregated results may include `iterationReplayBaseSeed`, `perIterationDps`, and `perIterationSeedIndex` (for replay after worker filtering). The DPS UI builds a **101-bin DPS histogram** (equal-width bins from min–max DPS; bar height = iteration count in bin) from `perIterationDps`.
- Each raw iteration result may carry `__simGlobalIter` (global index *i*) so replay stays correct if worker outlier filtering drops some runs.

**Single iteration or Quick Sim:**
- No auto `baseSeed` (single advanced iter: unseeded `Math.random` path; Quick Sim: unchanged).

**Explicit `options.baseSeed` (stat weights):**
- Same scheme: iteration *i* uses `baseSeed + i`. Quick Sim does not expose `perIterationDps` / replay metadata on the aggregate.

**`replayShamanSimulationIteration(stats, duration, priorityConfig, options, globalIterationIndex, replayBaseSeed)`**
- Runs one full-detail sim on the main thread with `seed = replayBaseSeed + globalIterationIndex` (same as batch index *i*).

**Result Aggregation:**
```javascript
// Average damage breakdown across iterations
for (const result of allResults) {
    for (const [ability, data] of Object.entries(result.damageBreakdown)) {
        averagedBreakdown[ability].total += data.total;
        averagedBreakdown[ability].count += data.count;
        // ... accumulate all stats
    }
}

// Divide by iterations to get averages
for (const [ability, data] of Object.entries(averagedBreakdown)) {
    data.total /= iterations;
    data.count /= iterations;
    data.average = data.count > 0 ? data.total / data.count : 0;
    data.percent = totalAveragedDamage > 0 ? (data.total / totalAveragedDamage) * 100 : 0;
}
```

**DPS Statistics:**
```javascript
dpsStats: {
    mean: avgDps,                   // Average DPS
    stdDev: dpsStdDev,              // Standard deviation
    variance: dpsVariance,          // Variance
    min: dpsMin,                    // Minimum DPS
    max: dpsMax,                    // Maximum DPS
    range: dpsMax - dpsMin,         // DPS range
    p10: dps10,                     // 10th percentile DPS
    p90: dps90                      // 90th percentile DPS
}
```

**TPS Statistics:**
```javascript
tpsStats: {
    p10: tps10,                     // 10th percentile TPS
    p90: tps90                      // 90th percentile TPS
}
```

**Average Effective Stats (sampled during combat):**
```javascript
avgStats: {
    attackPower: number,            // Average AP including buff uptimes
    spellPower: number,             // Average arcane/general spell power used for sampled hits
    firePower: number,              // Average effective fire SP (max(spellPower, fireDamage) + Wrath of Cenarius)
    naturePower: number,            // Average effective nature SP (max(spellPower, natureDamage) + WoC)
    frostPower: number,             // Average effective frost SP for frost-school samples
    attackSpeed: number,            // Average effective melee swing speed (seconds)
    hastePercent: number            // Average spell haste % from buffs
}
```

**Performance:**
- **1 iteration:** ~50-100ms
- **100 iterations (main thread):** ~5-10 seconds
- **2500 iterations (16 workers):** ~15-30 seconds
- **Stat weights (15 stats × 50 iterations):** ~10-20 seconds

---

### 18. Sim Context Builder (Lines 1064-1244)

#### `buildSimContext()` - Serialize Character State (Lines 1077-1244)

**Purpose:** Build serializable context for Web Workers

**Problem:** Workers cannot access DOM or main-thread modules (gear.js, talents_new.js)

**Solution:** Pre-serialize all character state into plain object

**Context Structure:**
```javascript
{
    // Trinkets (on-use detection)
    hasNaturalAlignmentCrystal: boolean,
    hasShardOfTheFallenStar: boolean,
    hasEyeOfDiminution: boolean,
    hasKissOfTheSpider: boolean,
    hasBadgeOfTheSwarmguard: boolean,

    // Weapons
    hasOrnateBloodstoneDagger: boolean,
    hasBladeOfEternalDarkness: boolean,
    mainhandIcon: string,

    // Enchants
    hasCrusaderEnchant: boolean,
    hasCrusader: boolean,           // Alias for proc engine

    // Talents
    hasElementalFocus: boolean,
    hasBloodlustTalent: boolean,
    hasElementalMasteryTalent: boolean,

    // Food Buffs
    hasDragonbreathChili: boolean,

    // Gear
    hasWrathOfCenarius: boolean,
    hasTotemOfStonebreaker: boolean,
    hasStormwolfFrenzy: boolean,    // Stormwolf 2pc

    // Procs (from procs.js)
    procsFromProcsJs: [
        { id: 'proc_id', name: 'Proc Name', procChance: 0.15 }
    ],

    // Raid Debuffs
    nightfallEnabled: boolean,
    hemoEnabled: boolean,
    hemoImproved: boolean,

    // Simulation Config
    quickSim: boolean,              // Skip detailed uptime tracking
    seed: number,                   // RNG seed (if deterministic)
    baseSeed: number,               // Base seed for paired seeding
    quiet: boolean                  // Suppress logging (batch runs)
}
```

`procChance` in `procsFromProcsJs` includes the **Fortune** multiplier when the proc has **`itemId`** and not **`noFortune: true`** (e.g. Dragonbreath Chili opts out). `rollProcChance` in `procEngine.js` uses the same values via `procsFromProcsJs.find(p => p.id === proc.id)` for equipped item procs (including Totem of Thundercall).

**Item Detection Example:**
```javascript
const nacProc = getProcById('natural_alignment_crystal');
const hasNaturalAlignmentCrystal =
    (trinket1?.id === nacProc.itemId || trinket1?.name?.includes(nacProc.itemName)) ||
    (trinket2?.id === nacProc.itemId || trinket2?.name?.includes(nacProc.itemName));
```

**Talent Detection Example:**
```javascript
const talentEl = document.getElementById('enhancement-25');  // Bloodlust
if (talentEl) {
    const points = parseInt(talentEl.dataset.points, 10) || 0;
    hasBloodlustTalent = points > 0;
}
```

**Extra Stat Fields (worker payload):**
```javascript
// Spell pen + target resists: included on ShamanStats.toJSON() (see shamanTalents.js); also listed here so plain stats objects and worker merge never drop them.
const STAT_EXTRA_KEYS = [
    'spellPen',
    'natureResist', 'fireResist', 'frostResist', 'shadowResist', 'arcaneResist',
    'targetArmor',
    'spellStrikeSources',       // Spell damage on melee hits
    'activeBuffs',              // Active buff objects
    'totemOfRage',              // Special totem flags
    'totemOfBrokenEarth',
    'totemOfStonebreaker',
    'weaponSpeed',              // Hasted weapon speed
    'baseWeaponSpeed',          // Base weapon speed
    'spellDamageMultiplier',    // Global spell damage multiplier
    'threatSpiritArmorMult',    // Threat multipliers
    'threatRockbiterMult',
    'threatCalmingWindsReduction',
    'threatSalvationMult',
    'totemicAlignmentThreatPercent',
    'talentBonuses',            // Raw talent bonuses
    'fireDamageMultiplier',     // School-specific multipliers
    'frostDamageMultiplier',
    'baseWeaponDamageMin',      // Base weapon damage (no AP)
    'baseWeaponDamageMax'
];
```

---

## How to Modify the Sim

### Adding a New Ability to Rotation

**Files to update:**
1. `modules/shaman/spells.js` - Add spell definition
2. `modules/shaman/damageCalc.js` - Add damage calculation (if custom)
3. `combatSim.js` - No changes needed (auto-handled)
4. `modules/shaman/dps.js` - Add to priority config UI

**Steps:**

1. **Add spell to spells.js:**
```javascript
newAbility: {
    name: 'New Ability',
    baseDamage: { min: 100, max: 150 },
    spCoefficient: 0.714,
    castTime: 1.5,
    manaCost: 200,
    cooldown: 8,
    school: 'nature'
}
```

2. **Add to default priority (Line 752):**
```javascript
getDefaultPriority() {
    return [
        { type: 'ability', name: 'stormstrike' },
        { type: 'ability', name: 'lightningStrike' },
        { type: 'ability', name: 'newAbility' },  // Add here
        { type: 'ability', name: 'flameShock', condition: 'dot_missing' },
        { type: 'ability', name: 'earthShock' }
    ];
}
```

3. **Test:** Run simulation - ability should auto-cast based on priority

---

### Adding a New Proc

**Files to update:**
1. `modules/gear/procs.js` - Add proc definition
2. `modules/sim/procEngine.js` - Add proc logic
3. `combatSim.js` - No changes needed (auto-handled)

**Steps:**

1. **Add proc definition to procs.js:**
```javascript
{
    id: 'new_trinket_proc',
    name: 'New Trinket Proc',
    itemId: 12345,
    itemName: 'New Trinket',
    triggerType: 'melee_hit',
    procChance: 0.10,  // 10% proc chance
    effect: { attackPower: 200 },
    duration: 15,
    cooldown: 0  // No ICD
}
```

2. **Add proc logic to procEngine.js:**
```javascript
if (procDef.id === 'new_trinket_proc') {
    // Activate buff
    activateBuff(sim, 'new_trinket_proc', {
        attackPower: 200,
        duration: 15
    });
}
```

3. **Add to buildSimContext (Line 1077):**
```javascript
const newTrinketProc = getProcById('new_trinket_proc');
const hasNewTrinket = hasTrinketProc(trinket1, newTrinketProc) ||
                       hasTrinketProc(trinket2, newTrinketProc);

return {
    // ... existing flags
    hasNewTrinket,
    // ...
};
```

4. **Test:** Equip trinket, run simulation - proc should fire and track uptime

---

### Adding a New Rotation Condition

**Files to update:**
1. `combatSim.js` - Add condition check to `canExecuteAction()`

**Steps:**

1. **Add condition to canExecuteAction (Line 762):**
```javascript
canExecuteAction(action) {
    // ... existing checks

    // Add new condition
    if (action.condition === 'new_condition') {
        // Check custom logic
        return this.customConditionCheck();
    }

    return false;
}
```

2. **Add helper method:**
```javascript
customConditionCheck() {
    // Example: Only cast if target health < 35%
    return this.targetHealth < 0.35;
}
```

3. **Use in priority config:**
```javascript
{
    type: 'ability',
    name: 'execute',
    condition: 'new_condition'
}
```

---

### Adding a New Resource Type

**Example:** Adding rage tracking (for druids/warriors)

**Files to update:**
1. `combatSim.js` - Add resource state to constructor
2. `combatSim.js` - Add resource generation/consumption to abilities
3. `modules/shaman/damageCalc.js` - Add resource cost checks

**Steps:**

1. **Add resource state (Line 132):**
```javascript
constructor(stats, fightDuration, priorityConfig, simContext) {
    // ... existing state

    // Rage tracking
    this.currentRage = 0;
    this.maxRage = 100;
    this.rageEvents = [];
}
```

2. **Add resource generation:**
```javascript
recordRageGain(amount, source) {
    this.currentRage = Math.min(this.currentRage + amount, this.maxRage);
    this.rageEvents.push({ time: this.currentTime, amount, source, type: 'gain' });
}
```

3. **Add resource consumption:**
```javascript
canAffordAbility(spell) {
    return this.currentRage >= spell.rageCost;
}

consumeRage(amount) {
    this.currentRage -= amount;
    this.rageEvents.push({ time: this.currentTime, amount, type: 'spend' });
}
```

4. **Update ability casting:**
```javascript
castAbility(spellKey) {
    const spell = shamanSpells[spellKey];

    if (!this.canAffordAbility(spell)) return;  // Check resource

    this.consumeRage(spell.rageCost);  // Consume resource

    // ... rest of casting logic
}
```

---

### Modifying Damage Formulas

**Files to update:**
1. `modules/shaman/damageCalc.js` - Update damage calculation
2. `combatSim.js` - No changes needed (uses calculateSpellDamage)

**Example:** Adding a new damage multiplier

**Steps:**

1. **Add multiplier to ShamanStats:**
```javascript
// In modules/character/shamanTalents.js
this.newDamageMultiplier = 1.0;
```

2. **Update damage calculation:**
```javascript
// In modules/shaman/damageCalc.js
export function calculateSpellDamage(spell, stats) {
    // ... existing damage calc

    // Apply new multiplier
    finalDamage *= stats.newDamageMultiplier;

    return { min: finalDamage, max: finalDamage };
}
```

3. **Set multiplier from talents/buffs:**
```javascript
// In modules/shaman/dps.js - mapTalentsToStats()
if (talentBonuses.new_damage_talent) {
    stats.newDamageMultiplier = 1 + talentBonuses.new_damage_talent;
}
```

---

### Adding Set Bonus Effects

**Files to update:**
1. `modules/gear/setBonuses.js` - Add set bonus detection
2. `modules/sim/setBonusSystem.js` - Add set bonus logic
3. `combatSim.js` - No changes needed (auto-handled)

**Steps:**

1. **Add set bonus to setBonuses.js:**
```javascript
if (itemCount >= 2) {
    bonuses.new_set_2pc = true;
}
```

2. **Add set bonus logic to setBonusSystem.js:**
```javascript
if (sim.stats.setBonuses?.new_set_2pc) {
    // Apply effect (e.g., cooldown reduction)
    spell.cooldown -= 1;
}
```

3. **Test:** Equip set items, run simulation - bonus should apply

---

### Debugging Simulations

**Enable Debug Logging:**
```javascript
// In constructor (Line 132)
this.simContext = { ...simContext, quiet: false };  // Enable logging
```

**Inspect Simulation State:**
```javascript
// After run()
console.log('Damage Events:', sim.damageEvents);
console.log('Buff Uptime:', sim.buffUptime);
console.log('Cooldowns:', sim.cooldowns);
```

**Common Issues:**

**Issue:** Wrong DPS
- **Check:** Spell coefficients in `spells.js`
- **Check:** Talent bonuses in `mapTalentsToStats()`
- **Check:** Buff detection in `mapBuffsToStats()`

**Issue:** Ability not casting
- **Check:** Priority config includes ability
- **Check:** Cooldown tracking (check `cooldowns` map)
- **Check:** GCD tracking (check `gcdReadyAt`)

**Issue:** Proc not firing
- **Check:** Proc definition in `procs.js`
- **Check:** Proc trigger type (melee_hit, spell_hit, etc.)
- **Check:** Sim context includes `hasProc` flag

**Issue:** Timeline missing events
- **Check:** Events scheduled correctly (`scheduleEvent()`)
- **Check:** Event handler executes without errors
- **Check:** Event time < fightDuration

---

## Performance Optimization

### Simulation Speed

**Current Performance:**
- **Single iteration:** ~50-100ms (300s fight)
- **100 iterations (main thread):** ~5-10 seconds
- **2500 iterations (16 workers):** ~15-30 seconds

**Bottlenecks:**
1. **RNG calls:** ~40% of CPU time
   - Use FastRNG (3-4x faster than Math.random)
   - Minimize RNG calls per event
2. **Event scheduling:** ~20% of CPU time
   - Use efficient priority queue (min-heap)
   - Batch schedule similar events
3. **Damage calculation:** ~15% of CPU time
   - Cache spell damage results (same stats)
   - Avoid redundant calculations
4. **Proc checking:** ~10% of CPU time
   - Early-exit for inactive procs
   - Batch proc checks per event type

**Optimization Tips:**

**1. Reduce Iterations for Testing:**
```javascript
runShamanSimulation(stats, 300, 10);  // 10 iterations instead of 2500
```

**2. Enable quickSim Mode:**
```javascript
runShamanSimulation(stats, 300, 100, null, null, { quickSim: true });
// Skips detailed uptime tracking - 2x faster
```

**3. Use Workers for Large Batches:**
```javascript
// Automatically uses workers for iterations >= 100
// Scales to available CPU cores (up to 16)
```

**4. Cache Stat Weights:**
```javascript
// Stat weights cached per build hash in localStorage
// Instant on subsequent loads (no recalculation)
```

**5. Profile with Chrome DevTools:**
```javascript
// Performance tab → Record → Run simulation
// Identify hot paths in flamegraph
```

---

## Related Files

**Core Simulation:**
- `combatSim.js` (this file) - Combat simulation engine
- `modules/shaman/damageCalc.js` - Damage calculation formulas
- `modules/shaman/spells.js` - Spell definitions database

**Data-Driven Systems (modules/sim/):**
- `modules/sim/index.js` - System aggregator
- `modules/sim/procEngine.js` - Proc activation logic
- `modules/sim/dotSystem.js` - DOT tracking
- `modules/sim/imbueSystem.js` - Weapon imbue handling
- `modules/sim/totemSystem.js` - Totem management
- `modules/sim/lightningShieldSystem.js` - LS/ELS charge tracking
- `modules/sim/setBonusSystem.js` - Set bonus activation

**Character State:**
- `modules/character/shamanTalents.js` - ShamanStats class
- `modules/shaman/dps.js` - Character state aggregation

**Gear & Procs:**
- `modules/gear/procs.js` - Proc definitions
- `modules/gear/gear.js` - Equipped gear access
- `modules/gear/setBonuses.js` - Set bonus detection

**UI:**
- `modules/shaman/dps.js` - DPS simulation UI
- `app.js` - Main app orchestrator

---

## Known Issues / TODOs

1. **No mana tracking** - Mana costs not enforced (assumes infinite mana)
   - TODO: Add mana state tracking
   - TODO: Add out-of-mana handling

2. **No enemy attacks** - Lightning Shield procs on enemy attacks not simulated
   - TODO: Add enemy attack events
   - TODO: Add LS proc on hit taken

3. **No movement** - Assumes target in range 100% of fight
   - TODO: Add movement mechanics
   - TODO: Add range checks

4. **No target switching** - Single-target only
   - TODO: Add multi-target support
   - TODO: Add target switching logic

5. **No boss mechanics** - Assumes tank-and-spank fight
   - TODO: Add boss ability phases
   - TODO: Add damage taken/healing events

6. **Simplified resist mechanics** - Uses approximation formulas
   - TODO: Use exact WoW resist tables
   - TODO: Add spell penetration cap handling

---

## Testing Strategy

### Unit Tests (Recommended)

**Test RNG Reproducibility:**
```javascript
const rng1 = new FastRNG(12345);
const rng2 = new FastRNG(12345);

const rolls1 = [rng1.random(), rng1.random(), rng1.random()];
const rolls2 = [rng2.random(), rng2.random(), rng2.random()];

assert.deepEqual(rolls1, rolls2);  // Should match exactly
```

**Test Event Ordering:**
```javascript
const sim = new ShamanCombatSimulatorCore(stats, 10);

sim.scheduleEvent(5.0, 'test1', () => events.push('A'));
sim.scheduleEvent(3.0, 'test2', () => events.push('B'));
sim.scheduleEvent(5.0, 'test3', () => events.push('C'));

sim.run();

assert.deepEqual(events, ['B', 'A', 'C']);  // Time order, then schedule order
```

**Test Damage Rolling:**
```javascript
const sim = new ShamanCombatSimulatorCore(stats, 10, null, { seed: 12345 });

const spell = { name: 'Test', canMiss: false, canCrit: false };
const damageResult = { min: 100, max: 100 };

const result = sim.rollDamage(spell, damageResult, false);

assert.equal(result.damage, 100);  // Exact match (no variance)
assert.equal(result.type, 'hit');
assert.equal(result.didHit, true);
```

**Test Stat Weight Reproducibility:**
```javascript
// Run twice with same seed
const results1 = await runShamanSimulation(stats, 60, 50, null, null, { baseSeed: 12345 });
const results2 = await runShamanSimulation(stats, 60, 50, null, null, { baseSeed: 12345 });

assert.equal(results1.dps, results2.dps);  // Should match exactly
```

### Integration Tests

**Test Full Simulation:**
```javascript
const stats = getFreshShamanStats();
const results = await runShamanSimulation(stats, 60, 100);

assert(results.dps > 0, 'DPS should be positive');
assert(results.totalDamage > 0, 'Total damage should be positive');
assert(Object.keys(results.damageBreakdown).length > 0, 'Should have damage breakdown');
```

**Test Worker Pool:**
```javascript
const results = await runShamanSimulation(stats, 60, 500);

// Check that workers were used
assert(results.iterations === 500, 'Should complete all iterations');
assert(results.dpsStats.mean > 0, 'Should have mean DPS');
assert(results.dpsStats.stdDev > 0, 'Should have DPS variance');
```

---

## Version History

- **v1.0:** Basic combat simulation with rotation priorities
- **v2.0:** Added proc system integration
- **v3.0:** Added DOT/totem/imbue systems (data-driven)
- **v4.0:** Added seeded RNG for stat weight calculations
- **v5.0:** Added Web Worker support for parallel execution
- **v5.1:** Fixed AP proc recalculation fallback so on-use AP trinkets (e.g. Molten Emberstone) correctly update melee weapon damage when base weapon fields are stored on simulator instance instead of serialized stats.
- **v5.2:** Added base-weapon inference fallback at sim init (derive base weapon damage from current weapon damage + AP) so AP-changing effects work even when tooltip-derived base damage fields are absent.
- **v5.3:** Added AP-delta fallback in `recalculateWeaponDamage()` so on-use AP buffs still modify `weaponDamage` even when base weapon damage cannot be reconstructed.
- **v5.4:** Moved weapon damage computation to `damageCalc.js` via `getEffectiveWeaponDamage()` — weapon damage is now dynamically computed from base weapon damage + current `attackPower` at every damage calculation, instead of relying on `recalculateWeaponDamage()` to pre-update `stats.weaponDamage`. This guarantees AP on-use trinkets (Earthstrike, Slayer's Crest, Molten Emberstone) are always reflected in melee damage.
- **v5.5:** Added Potion of Quickness and Juju Flurry as consumables that act like on-use trinkets — detected from `activeBuffs`, activate via the same `activateOnUseTrinket` pipeline. Potion of Quickness: 5% melee haste for 30s (2-min CD). Juju Flurry: 3% attack+casting haste for 20s (1-min CD). Both added to `TRINKET_KEY_TO_PROC_ID`, `executeAbilityByKey`, `nonGcdKeys`, `activateOnUseTrinkets`, and `buildSimContext`.
- **v5.6:** Fixed on-use items ignoring priority config — `activateOnUseTrinkets()`, `activateOnUseTrinket()`, `activateTalentCooldowns()`, `activateTalentCooldown()`, and `canExecuteAbility()` now all respect the `enabled` flag. `activateOnUseTrinkets()` and `activateTalentCooldowns()` now also respect `useAfterFightTime` by scheduling delayed first activation instead of firing immediately at t=0.
- **v5.7:** **Hard-cast spells** — `lightningBoltCast`, `chainLightningCast`, and `moltenBlastCast` execute when enabled via priority config (no separate config toggles — gating is done entirely by the priority system's `enabled` flag, same as any other ability). `executeAbilityByKey` prefers HotEO instant buff when applicable, otherwise `startSpellCast`; `completeCast` finishes Lightning Bolt / Molten Blast / Chain Lightning. **`triggerGCD()` suppression** — `_completingCast` flag during `completeCast` avoids double GCD from cast completion. **Lightning Mastery** — flat lightning cast-time reduction applied in `startSpellCast()` before haste division. **Swing timer** — after a spell cast finishes, the next auto-attack is scheduled at cast end + full hasted swing (not an immediate resume).
- **v5.8:** **Molten Blast (Cast) refresh-only mode** — `canExecuteAbility` checks `rules.onlyRefreshFlameShock` for `moltenBlastCast`; when true, skips unless Flame Shock DoT is active with 2.5–4.5 seconds remaining. **Opener pre-cast** — `_handleOpenerPreCast()` in `run()` detects if the first opener ability is a hard-cast spell (`lightningBoltCast`, `chainLightning`, `moltenBlastCast`), calculates effective cast time (Lightning Mastery + haste), and executes the spell immediately at `currentTime` (t=0 or threat hold end) as if it was started pre-pull. GCD is suppressed via `_completingCast`, auto-attack starts a full swing after landing, and the opener index advances past the pre-cast spell. **Dedup** — removed `chainLightningCast` key entirely; the existing `chainLightning` key already handles both instant (HotEO) and hard-cast paths identically.
- **v5.9:** **Caster Mode (Elemental Shaman)** — When `stats.combatConfig.casterMode` is true: (1) auto-attacks are completely suppressed (no scheduling in `run()`, early return in `performAutoAttack()`, skipped in `startSpellCast()` and `completeCast()`); (2) `buildPriorityList()` uses `priorityConfig.casterPriority` (LB, CL, FS, MB, ES); (3) opener uses `priorityConfig.casterOpener`; (4) `executeAbilityByKey` for `lightningBolt` and `moltenBlast` hard-casts them (via `startSpellCast`) instead of instant-casting; (5) `canExecuteAbility` blocks casting while already casting for these keys in caster mode. Pre-cast opener also checks caster opener sequence.
- **v5.10:** **Caster mode key filtering** — `buildPriorityList()` now uses a caster-specific `validPriorityKeys` whitelist (`lightningBoltCast`, `chainLightning`, `flameShock`, `moltenBlastCast`, `earthShock`, `frostShock`) when caster mode is active, preventing melee abilities (`stormstrike`, `lightningStrike`, etc.) from ever entering the caster rotation even if they exist as stale keys in `casterPriority`.
- **v5.11:** **Worker sanity check (hardened)** — Runs 3 main-thread sanity iterations (averaged) before spawning workers. After workers return: (1) individual results >10x or <0.1x the sanity reference are filtered out; (2) the average worker DPS is compared against the sanity reference with a 3x threshold (tightened from 5x). If the sanity sim itself throws, workers are discarded and the sim falls back to main thread (previously the error was silently eaten). Worker cap now also limits hyperthreaded CPUs (`hw <= 8` → `floor(hw/2)`) to prevent CPU overwhelm on machines like i7-6700K where saturating all 8 logical cores causes corrupt results. Users can force single-threaded mode via `window.ICHACALC_FORCE_MAIN_THREAD = true`.
- **v5.12:** **Earthquake** — New elemental capstone spell. `castEarthquake()` method handles primary hit (587–634 nature, 71.43% SP coeff), 35% AoE splash to nearby targets (AOE mode only), and a delayed 30% aftershock event at +4s (independently recalculated). Added to `validPriorityKeys` for caster mode, `executeAbilityByKey` (with HotEO instant support), `completeCast`, and `_handleOpenerPreCast` HARD_CAST_KEYS. Uses standard `setCooldown('earthquake', 16)` for its 16s cooldown. Consumes Stormstrike charges and Elemental Focus on hit.
- **v5.13:** **Elemental Weapons rework** — Flametongue fire damage bonus changed from permanent passive to a timed proc (identical pattern to Stormstrike debuff but without charges). `refreshEWFlametongueBuff()` activates the buff on melee hit (auto attack, Stormstrike, Lightning Strike, Windfury), sets `ewFlametongueBuffActive`/`ewFlametongueBuffExpires` on the sim and syncs `stats.activeModifiers.ewFlametongueDamageBuffActive` so `getAllDamageModifiers` gates the bonus at damage-time — same data-driven path as all other talent modifiers. `procEngine.js`/`trinketSystem.js` check `ctx.ewFlametongueBuffActive` for their independent damage paths. Windfury now grants stacking haste (1% per stack, max 2/4/6 by talent rank, 5s duration) via `addEWWindfuryHasteStack()`. FT proc damage no longer benefits from Call of Flame (matching old behavior).
- **v5.14:** **Data-driven on-use trinkets** — All on-use trinkets/consumables are now auto-detected from `procs.js` proc definitions (filter: `procType === 'onUse' && itemId && !fromTalent`). Replaced hardcoded lists in `TRINKET_KEY_TO_PROC_ID`, `activateOnUseTrinkets()`, `executeAbilityByKey()` (dynamic default case), `nonGcdKeys`, `buildSimContext()`, and `applySharedTrinketCooldown()`. New trinkets only need a `procs.js` entry with `procType: 'onUse'` and `itemId` to appear everywhere automatically. **Molten Blast Flame Shock refresh** — changed from full DoT reset (`applyDot`) to duration extension: adds `maxDuration - remaining` to `expiresAt` without resetting `nextTick` or `tickCount`, preserving current tick progress.
- **v5.15:** **delayIfHigherPriorityReadyIn** — Implemented the previously UI-only rule in the GCD priority rotation loop. `_shouldDelayForHigherPriority()` scans all higher-priority abilities in the sorted priority list; if any will come off cooldown within the configured delay window (seconds), the current ability is skipped and a rotation re-check is scheduled for the earliest cooldown. Prevents wasting a GCD on a low-priority filler when a higher-priority ability is about to become available.
- **v5.16:** **Stormhowl Garb 5pc (Stormwolf's Cunning)** — When Elemental Mastery is activated with `stormhowl_garb_5pc_stormwolf_cunning` set bonus active, grants +10% spell haste for 12s via `activateStormwolfCunning()`. Nature spell crits (Earth Shock, Lightning Bolt, Chain Lightning, Lightning Strike, Earthquake) refresh the buff duration via `refreshStormwolfCunning()` in `processAbilityHit()`. Spell haste applied in `getSpellHasteMultiplier()` (damageSystem.js). Elemental item IDs (47186–47191) split into separate `stormhowl_garb` set in setDatabase.js. Added missing `processSetBonusAbilityHit` call to `castLightningBolt()` to ensure LB crits trigger set bonus hooks.
- **v5.17:** **Totem of Crackling Thunder** — Relic (ranged slot, item 61292). Lightning Bolt hits have a 10% chance and Lightning Strike hits have a 15% chance to grant +8% attack and casting speed for 8 seconds. Proc handled in `processAbilityHit()` (setBonusSystem.js) with per-ability roll. Buff state tracked in `_setBonusStates.cracklingThunder`. Haste applied to both `getHasteMultiplier()` and `getSpellHasteMultiplier()` in damageSystem.js. Detection via `buildSimContext()` with `hasCracklingThunder` flag from ranged slot check. Added `processSetBonusAbilityHit` call to `castLightningStrike()` to ensure LS hits trigger the hook.
- **v5.18:** **Stormwolf's Cunning refresh expansion** — Nature damage proc crits (Insomnius' Retribution) now refresh Stormwolf's Cunning via a hook in `handleDamageProc()` (procEngine.js). Earthquake aftershock crits also refresh via `processSetBonusAbilityHit` call added to the aftershock scheduled event.
- **v5.19:** **EM / Bloodlust obey priority config** — Elemental Mastery and Bloodlust now fully participate in the opener sequence and respect all priority config (enabled/disabled, useAfterFightTime). Previously they were hardcoded to fire at fight start via `activateTalentCooldowns()` and the opener/rotation unconditionally skipped them. Changes: (1) `canExecuteAbility()` checks talent learned + enabled + off-cooldown instead of returning `false`; (2) `executeAbilityByKey()` calls `activateTalentCooldown()` instead of no-op `break`; (3) `activateTalentCooldowns()` detects the active opener sequence and skips abilities that appear in it (lets the opener handle their initial activation with correct positioning). Re-activation on cooldown continues to be handled by `activateTalentCooldown()`'s scheduled callback.
- **v5.20:** **Searing Totem auto-redrop** — Fire totems with `autoAttack` or `pulse` behavior and no cooldown (Searing, Magma) now auto-redrop when their duration expires. `dropTotem()` in totemSystem.js schedules a `totemRedrop` event at `expiresAt` that verifies the totem is still the active one in its slot before re-dropping. GCD from the auto-redrop is suppressed (it's an automatic maintenance action). Fixes Searing Totem going silent after its 55s duration with no re-drop mechanism.
- **v5.21:** **Flame Shock DoT zombie fix** — Fixed Flame Shock DoT becoming a zombie (active state but no ticks) after Molten Blast extension. When MB extended the DoT, if the last tick had already fired at the same timestamp and cleared `nextTick` to 0 (checking against the old `expiresAt` before the extension), no new ticks were scheduled. The DoT state reported active (blocking recast via `canExecuteAbility`) while producing no damage (appearing to "wear off" on the timeline). Fix: `_handleMoltenBlastFlameShockRefresh()` now re-schedules ticks after extension when `nextTick` is 0 or in the past. Additionally, `canExecuteAbility('flameShock')` now syncs `flameShockDotExpires` from the authoritative `getDotState()` to prevent any desync between the cached field and the DoT system state.
- **v5.22:** **Rekindle rework — actual tick tracking + tick grid preservation** — Rekindle now counts the real number of FS DoT ticks that have fired since the last FS application or last Rekindle (whichever is more recent), then multiplies that accumulated tick damage by `rekindlePercent`. Previously it estimated ticks from time remaining, which was both inaccurate and produced 0 damage in many cases. New tracking: `_rekindleTickBaseline` is set to 0 on FS application and advanced to `dotState.tickCount` after each Rekindle. The difference `dotState.tickCount - _rekindleTickBaseline` gives the exact ticks to account for. Also fixed MB extension tick re-scheduling to resume on the original tick grid (`appliedAt + tickCount * tickInterval + tickInterval`) instead of starting a fresh timer from `currentTime + tickInterval`, which was causing ticks to space out after Rekindle instead of maintaining the consistent 3s interval.
- **v5.23:** **Earthquake talent gate** — `canExecuteAbility('earthquake')` now checks `activeModifiers.earthquake` and returns false when the talent isn't learned. Previously Earthquake was included in the caster mode rotation unconditionally, causing it to be cast even without the talent (and since it wasn't in the priority UI without the talent, it couldn't be disabled). Fallback default caster priority list also conditionally includes Earthquake only when talented.
- **v5.24:** **Call of Thunder / Tidal Mastery crit in sim** — The sim's `rollDamage()` (spell crit path) and `rollForCrit()` now apply Call of Thunder (+1-5% crit for lightning spells) and Tidal Mastery (+1-5% crit for lightning spells only, not Earthquake) bonuses. Previously these talent crit bonuses only appeared in `damageCalc.js` tooltip calculations but were missing from actual sim combat rolls. Also corrected all files (`damageCalc.js`, `dps.js`, `combatSim.js`) to remove the incorrect `hasTidalMasteryCrit` path — Tidal Mastery only applies to `isLightningSpell` (Lightning Bolt, Chain Lightning).
- **v5.26:** **Priority tab-driven sim mode + Elemental AoE** — `buildPriorityList` now checks `casterMode && aoeEnabled` for the new `casterAoePriority` config slice, before falling through to `casterPriority` / `aoePriority` / main. All four opener selection points updated to prefer `casterAoeOpener` when both flags are active. `nonGcdKeys` updated to include `casterAoePriority` and `casterAoeOpener`.
- **v5.25:** **Smarter worker system for result accuracy** — Overhauled `runShamanSimulation` worker orchestration to address inflated DPS results on certain hardware/browser combos (2 affected users, both Chromium-based). Changes:
  - **Hardware-aware worker caps**: Extended conservative capping to all hardware tiers (was only hw<=8). Machines with >8 logical cores now cap at 60% of `hardwareConcurrency`; Chromium browsers get an additional tighter 50% cap due to V8 JIT + thread contention pattern.
  - **Tightened sanity thresholds**: Per-result outlier filter reduced from 10x to 2x; bulk sanity check reduced from 3x to 1.5x. Catches moderate inflation that previously slipped through.
  - **Per-worker validation**: Instead of only checking aggregate DPS, each worker's average is compared against the sanity reference independently. A single corrupted worker is discarded without losing all other workers' valid results.
  - **Adaptive retry**: When all worker results are discarded, retries once with half the workers before falling back to the slow main-thread path. Catches "too many workers for this machine" without punishing users with single-threaded mode unnecessarily.
  - **Diagnostic banner**: When retry or main-thread fallback occurs, an orange info banner appears in the sim results suggesting users select Safe Mode from the dropdown.
  - **Safe Mode**: Available as a dropdown option in the sim mode selector. When `options.safeMode` is true, forces `max(2, floor(hw/4))` workers — very conservative but always uses workers (main-thread path is known to produce inflated results). No longer uses `window.ICHACALC_SAFE_MODE` or localStorage.
  - **`workerDiagnostics` in result object**: Return value now includes fallback/retry metadata for programmatic inspection.
- **v5.27:** **Droplet of Nordrassil + onSpellResist trigger** — Added `fireSpellResistTriggers` import and binding. All spell outcome sites (generic spells, HotEO, Lightning Bolt, Chain Lightning, Earthquake, Flametongue) now fire `onSpellResist` on partial resists and full spell misses. Added `hasDropletOfNordrassil` to `buildSimContext` and worker defaults.
- **v5.28:** **Earthquake proc triggers + independent AoE rolls** — Rewrote `castEarthquake()` so every hit (primary, AoE splash, aftershock, aftershock AoE) fires `fireSpellHitTriggers` and `fireSpellResistTriggers`. AoE splash targets now get independent `rollDamage` calls instead of reusing the primary outcome. This means procs like Insomnius' Retribution can trigger from any Earthquake hit (2 chances ST, up to 2×targetCount on AoE).
- **v5.29:** **Chain Lightning bounces now fire proc triggers** — Removed `if (bounce === 0)` guard that was limiting `fireSpellHitTriggers` to the primary target only. All Chain Lightning bounces (2nd at 70%, 3rd at 49%) now fire `onSpellHit` and `onSpellResist` triggers, allowing procs like Insomnius' Retribution to trigger from every bounce. Stormstrike/Elemental Focus consumption remain primary-only.
- **v5.41:** **`onDirectDamageSpellHit` matches harmful spell coverage** — `alsoFireDirectDamageSpell` is now **true for every Chain Lightning bounce** (not only the first). `castAbility` uses `SPELL_KEYS_THAT_FIRE_ON_DIRECT_DAMAGE_SPELL_HIT` so **chainLightning** and **earthquake** keys also fire the direct-hit proc tier alongside LB, shocks, and Molten Blast. Sigil of Ancient Accord and Spellpower Goggles Xtreme Plus+ align with **onSpellHit** coverage for the listed spells (LS/ELS already passed the direct flag in `lightningShieldSystem.js`).
- **v5.42:** **ICD for procs with `internalCooldown > 1`** — `checkICD` now treats `lastProc < 0` (never proc’d) as eligible. Previously `lastProc === -1` made `lastProc + ICD` block the entire early fight for long ICDs (e.g. **18s** bracers). Comments document multi-hit behavior: each hit calls `processProcTrigger`; failed rolls do not advance ICD; first success starts ICD (Sigil: one proc per ICD window across CL bounces / EQ hits in that window).
- **v5.30:** **AoE fire totem + off-GCD Magma Totem** — Pre-fight totem drop now places Magma Totem (instead of Searing) when AoE is enabled. Magma Totem is now off-GCD (`usesGCD: false` in totems.js) matching Searing Totem behavior, but remains in the priority system for user control. Priority rotation loop updated to handle off-GCD abilities correctly: continues to lower-priority abilities instead of blocking the rotation until the next scheduled check.
- **v5.48:** **Searing Totem enable/disable** — `combatConfig.searingTotemEnabled` (default `true` on `ShamanStats`). When `false`, the pre-fight single-target Searing drop and the Fire Nova detonation redrop to Searing are skipped (Magma / AoE unchanged). The Enhancement priority UI exposes **`searingTotemAuto.enabled`**; `dps.js` syncs it before sims (main sim, stat weights, gear compare).
- **v5.31:** **Set bonus procs on all AoE hits + caster totem fix** — `processSetBonusAbilityHit` now fires for every Chain Lightning bounce (was primary-only) and every Earthquake hit including AoE splashes and aftershock splashes (was primary + aftershock only). Stormhowl 5pc haste refresh can now proc from any crit on any bounce/splash target. Added `fireNovaTotem` and `magmaTotem` to caster mode `validPriorityKeys` so they actually execute in Elemental AoE sim.
- **v5.32:** **Flurry talent gate + caster mode exclusion** — Flurry now correctly requires the talent to be learned before proccing. Added `hasFlurry` / `hasFlurryTalent` flags to `buildSimContext` (DOM check for `enhancement-13` with `talentBonuses` fallback). `triggerFlurryFromSpellCrit()` now early-returns in caster mode (Flurry is melee haste only — no auto attacks to consume charges) and when the talent isn't learned. `isProcAvailable` now short-circuits via the `hasFlurry` simContext flag, preventing `procsFromProcsJs` fallback from incorrectly enabling untalented Flurry. `getSpellHasteMultiplier` confirmed to NOT include Flurry (melee-only haste).
- **v5.33:** **AP trinket diagnostic tracking** — Added `combatStats._apDiag` object that records baseline AP at fight start, counts auto-attacks that occurred while AP was elevated above baseline, tracks max AP observed, and total auto-attacks. `performAutoAttack()` checks current `stats.attackPower` against baseline each swing. First-iteration console output (`[AP-DIAG]`) logs AP before/after trinket activation, base weapon damage info, and end-of-fight summary. This data is embedded in the sim result (not just console) to diagnose on-use AP trinkets (Slayer's Crest, Earthstrike, Molten Emberstone) showing on the timeline but contributing zero DPS.
- **v5.34:** **Juju Flurry + Potion of Quickness shared cooldown exempt** — Added `potion_of_quickness` and `juju_flurry` to `SHARED_TRINKET_CD_EXEMPT` in `procEngine.js`. These consumables have no GCD and don't share a cooldown with on-use trinkets (or each other). Previously they were treated as regular on-use trinkets and would trigger the shared duration-based cooldown, blocking other trinkets (and being blocked by them). Now matches in-game behavior: only actual on-use trinkets share the duration-based cooldown; BL, EM, Juju Flurry, Potion of Quickness, Jewel, and Shard are all exempt.
- **v5.35:** **Percentile DPS/TPS + average effective stats** — Aggregation now computes 10th/90th percentile DPS and TPS from sorted per-iteration arrays. Per-iteration results include `avgStats` (attack power, fire/nature power, attack speed, spell haste %) sampled at every `recordDamage` call. These are aggregated across iterations and returned as `dpsStats.p10/p90`, `tpsStats`, and `avgStats` on the final result object.
- **v5.43:** **avgStats fire/nature power vs damage** — `recordDamage` sampling now uses `getEffectiveSchoolSpellPower` from `damageCalc.js` so averages include **Wrath of Cenarius** (`activeModifiers.wrathOfCenarius`), matching the SP used in `calculateBaseDamage` (WoC is not added to raw `stats.spellPower`).
- **v5.44:** **`avgStats.spellPower` / `frostPower`** — Per-hit accumulation includes average arcane/general spell power and frost-school power (for UI Results hero and theorycraft), aggregated like fire/nature in multi-iteration runs.
- **v5.36:** **Fortune is data-driven** — `procGetsFortune`: `itemId` present and **`noFortune` not true** on the proc definition. Dragonbreath Chili sets **`noFortune: true`** (food buff).
- **v5.37:** **Garb / Earthfury / tooltip stars** — Elemental priority list gains optional Lightning Shield rows when `garb_ten_storms_5pc_caster_ls_priority` is active (`mergeGarbCasterLightningShieldPriority`). Caster `validPriorityKeys` includes Lightning Shield keys so saved configs can use them. Enhancement `validPriorityKeys` lists `lightningShieldCritical`, `lightningShieldLow`, and `lightningShieldProactive` only (the old Enh-only `lightningShield` priority row was removed as redundant); Garb 5pc merge still injects sim key `lightningShield` for caster. Earthfury split into `earthfury_the_earthfury`, `earthfury_battlegear` (5pc FT+FS), and `earthfury_garb` in `setDatabase.js`. **`garb_ten_storms` must use item IDs `16943`–`16950`** (actual Garb set in item data); `battlegear_ten_storms` uses `47136`–`47143` only—see `setBonusSystem.md` / `setDatabase.js`.
- **v5.38:** **Totem of Thundercall — proc engine only** — Removed `hasTotemOfThundercall`, `thundercallProcChance`, `thundercallEffect` from `buildSimContext` and removed `processTotemOfThundercallAfterStormstrike` from `setBonusSystem`. Thundercall runs only through `onStormstrikeHit` → `processProcTrigger` → `EFFECT_HANDLERS.thundercallStormCloud` in `procEngine.js`; chance uses `rollProcChance` / `procsFromProcsJs` like other item procs.
- **v5.39:** **Breakdown row icons from damage events** — `getResults()` copies the first `icon` seen on `damageEvents` for each ability into `damageBreakdown[ability].icon`. Multi-iteration aggregation preserves `icon` on averaged rows. Proc ticks (e.g. storm cloud) pass `icon` via `recordDamage` extras from `procEngine.js` (effect snapshot merges `proc.icon`).
- **v5.40:** **Loop of Unceasing Frost + Lightning Strike** — The ring procs from Lightning Strike **only** on the **physical** component via `fireMeleeAttackTriggers(..., 'Lightning Strike (Physical)', ...)` (**4%** `onMeleeHit`, gated by `requireMeleeHitSources` in `procEngine.js`). The nature portion of Lightning Strike does **not** roll the ring’s **10%** `onSpellHit` path (matches in-game: landing attacks vs harmful spells).
- **v5.44:** **Flurry charge before refresh on auto attack** — `performAutoAttack()` now calls `consumeFlurryCharge` **before** `fireMeleeAttackTriggers`. A crit that refreshes Flurry to 3 stacks was incorrectly leaving 2 stacks because the refresh ran first and the same swing then consumed a charge.
- **v5.45:** **Spell penetration in sim** — `spellPen` is serialized on `ShamanStats.toJSON()` (was omitted, so worker runs always saw 0 pen vs target resist). `STAT_EXTRA_KEYS` also lists `spellPen` and target resist/armor fields. `rollDamage()` spell miss path now matches `damageSystem.rollDamage`: binary spells apply resist hit penalty after subtracting spell pen, plus Elemental Devastation spell hit via `getSpellHitBonus`. `damageCalc.js` binary expected-hit paths subtract spell pen from resistance.
- **v5.46:** **Enhancement AoE vs ST — Elemental Mastery config** — `activateTalentCooldowns`, `activateTalentCooldown`, opener ability config, on-use trinket activation, and `activateOnUseTrinket` now read ability rows from **`getEffectivePriorityConfigSlice()`** (same as `buildPriorityList`: `aoePriority` when AoE, else full config / caster slices). Previously AoE sim always used root `priorityConfig.elementalMastery` (ST tab), so disabling EM on the AoE tab had no effect and pull EM ignored AoE rules. **Enhancement:** when `useBeforeFlameShock` is not `false` (default), pull EM is skipped; **Flame Shock** in `castAbility()` pops EM when ready (matches `rotationSystem` FS + EM). **Caster:** pull EM unchanged unless `useBeforeFlameShock: true` on the EM row.
- **v5.49:** **Elementium Reaper (33094) — physical `damageProc`** — `procs.js` defines **`elementium_reaper_decapitate`** (`onMeleeHit`, **1.2 PPM**). `procEngine.handleDamageProc` detects **`physicalMeleeProc`** and routes to **`handlePhysicalMeleeDamageProc`**: flat **550–750** (no AP/SP), **Hemorrhage** multiplier when active, then **`rollDamage`** as physical with **`hasGlancingBlows: false`** (armor + Corrosive Spit + melee crit / avoidance). **×1.25** when `currentTime ≥ 0.7 × fightDuration` (timeline proxy for sub-30% HP execute bonus).
- **v5.50:** **Earthshatterer's Battlegear 8pc** — With **`earthshatter_8pc_shock_cooldown_reset_chance`** (0.2) from **`setDatabase.js`** / **`getSetBonuses`**, **`processAbilityHit`** calls **`tryEarthshatterer8pcShockCooldownReset`**: on a **successful** **Stormstrike** or **Lightning Strike** melee hit (`outcome.didHit`), **20%** roll clears **`cooldowns.shocks`** (shared Earth / Frost / Flame Shock CD, same key as **`castAbility`** shock cooldown). No ICD; next cast order follows **`buildPriorityList`** / **`canExecuteAbility`** only (no set-specific priority override).
- **v5.51:** **Might of the Hippogryph 3pc** — **`setDatabase.might_of_the_hippogryph`** (items **33392**–**33397**). **`processMeleeHit`**: if Might has **charges** and time left → **`dealHippogryphMightBonusNatureDamage`** (150 Nature on **that** hit, any source). **Consume** one charge for **`Auto Attack`**, **`Windfury Attack`**, **`Stormstrike`**, or **`Lightning Strike`** (`consumeHippogryphMightCharge` / **`hippogryphMightSourceConsumesCharge`**). **1.2 PPM** → **`activateHippogryphMightBuff`** only. **`abilityCasting.processWeaponImbues`** calls **`processMeleeHit`** for WF hits. Haste in **`getHasteMultiplier`**. **`damageCalc`** hippogryph row uses rough **×3** for sheet DPS.
- **v5.52:** **Shieldrender Talisman (55131)** — Physical **`rollDamage`** calls **`resolveShieldrenderPhysicalArmor`** from **`procEngine.js`** before armor and **Feast of Hakkar** (Corrosive Spit) bonuses. When the buff has charges and the swing is **`isAutoAttack` or `usesMeleeHit`**, one charge is consumed and that hit uses **×1** armor (full ignore); glancing order unchanged (**armor → glancing mult → corrosive**). Proc still rolls on **`onMeleeHit`** after the swing (**`fireMeleeAttackTriggers`**), so the swing that procs does not consume a charge.
- **v5.52b:** **Shieldrender — equip gate** — **`buildSimContext`** always sets **`hasShieldrenderTalisman`** from **trinket1/trinket2** only (same **`hasTrinketProc`** pattern as Hand of Justice). **`isProcAvailable`** reads this flag first; without it, **`findActiveProcs`** could match other gear via **`proc.itemName.includes(item.name)`** (substring false positives on “Shieldrender Talisman”).
- **v5.53:** **Target school immunity + rotation** — When **`stats.targetSchoolImmune`** marks a school (from boss **`immune_*`** payload), **`canExecuteAbility()`** returns false for rotation keys mapped to that school via **`shamanSpells`** (and **`ROTATION_KEY_TO_SPELL_KEY`** for aliases like **`lightningBoltCast`** / Lightning Shield variants). Abilities are omitted from opener and priority sequencing (not only 0 damage). **`_shouldDelayForHigherPriority`** skips immune higher-priority keys so they do not delay fillers. **`_handleOpenerPreCast`** bails out if the first hard-cast opener step is immune. **Lightning Strike** requires **both** physical and nature immune before it is skipped; **`handOfEdwardTheOdd`** uses **`handOfEdwardSpell`**’s school.
- **v5.54:** **Totem of Tides + Lightning Strike** — With **Water Shield** active, **`castLightningStrike()`** calls **`triggerTotemOfTides()`** after **`triggerEmpoweredWaterShield()`** on a successful physical hit (same **`TOTEM_OF_TIDES_ICD`** / **`_totemOfTidesLastProc`** as **`enemyAttackSystem`**). Previously Tidal Wave only ran on enemy swings, not on LS.
- **Current (v2.0.0):** Streamlined data-driven architecture with Enhancement and Elemental Caster modes

---

## Architecture Philosophy

**combatSim.js should:**
- ✅ Provide event-driven simulation engine
- ✅ Delegate to modular systems (procs, dots, totems, etc.)
- ✅ Support both seeded (deterministic) and non-seeded (stochastic) RNG
- ✅ Track detailed combat statistics and timelines
- ✅ Support multi-iteration execution with worker pool
- ❌ NOT contain spell definitions (use spells.js)
- ❌ NOT contain damage formulas (use damageCalc.js)
- ❌ NOT contain UI code (delegate to dps.js)

**Design Principles:**
1. **Event-Driven:** All actions scheduled as events in priority queue
2. **Data-Driven:** Spell/proc/totem definitions in separate files
3. **Modular:** Systems (procs, dots, etc.) in separate modules
4. **Deterministic:** Seeded RNG for reproducible results
5. **Parallel:** Worker pool for multi-core execution
