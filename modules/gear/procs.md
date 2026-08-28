# Proc System Documentation

## Table of Contents
1. [Overview](#overview)
2. [Proc Definition Structure](#proc-definition-structure)
3. [Proc Categories](#proc-categories)
4. [Proc Types and Triggers](#proc-types-and-triggers)
5. [Proc Mechanics](#proc-mechanics)
6. [Data-Driven Effects System](#data-driven-effects-system)
7. [Integration with Simulation](#integration-with-simulation)
8. [Adding New Procs](#adding-new-procs)
9. [API Reference](#api-reference)
10. [Examples](#examples)

---

## Overview

The proc system in IchaCalc manages all temporary effects that can activate during gameplay, including:
- **Trinket procs** - Equipment effects like Kiss of the Spider, Natural Alignment Crystal
- **Enchant procs** - Weapon enchants like Crusader
- **Set bonuses** - Multi-piece set bonuses like Incendosaur 3pc
- **Talent procs** - Talent-based effects like Redoubt, Flurry, Elemental Devastation
- **Weapon imbues** - Shaman weapon imbues like Flametongue Weapon, Windfury Weapon
- **Consumable procs** - Consumables like Dragonbreath Chili, Greater Stoneshield Potion, Potion of Quickness, Juju Flurry
- **Ability buffs** - Ability-based buffs like Stormstrike, Bloodlust, Holy Shield

The proc system handles:
- Proc detection based on equipped items, active buffs, talents, and enchants
- Activation conditions (chance-on-hit, on-use, PPM-based, talent-triggered)
- Cooldown and Internal Cooldown (ICD) management
- Duration tracking and expiration
- Charge/stack-based mechanics
- Stat modification and multiplier application
- Integration with combat simulation engines

---

## Proc Definition Structure

Each proc is defined as an object in the `procDefinitions` array with the following properties:

### Core Properties

| Property | Type | Required | Description |
|----------|------|----------|-------------|
| `id` | string | Yes | Unique identifier for the proc |
| `name` | string | Yes | Display name for UI |
| `itemName` | string | Conditional | Item/buff name for detection (required unless talent-based) |
| `itemId` | number | No | Item ID for precise item matching |
| `cooldown` | number | Yes | Cooldown in seconds (0 for no cooldown) |
| `duration` | number | Conditional | Duration in seconds (null for instant effects) |
| `statModifiers` | object | Yes | Stat changes applied when active `{ blockValue: 235, haste: 20 }` |
| `procType` | string | Usually | Trigger type (see Proc Types section). Omit if `procTypes` is set. |
| `procTypes` | string[] | No | Register the same proc under multiple triggers (e.g. Loop of Unceasing Frost: `['onMeleeHit','onSpellHit']`). Built by `triggerRouter.buildTriggerMap`. |
| `modifiesStats` | function | Yes | Function to apply multipliers/talents to stat modifiers |

### Proc Type-Specific Properties

**For chance-based procs (`chanceOnHit`, `onMeleeHit`, `onSpellHit`):**
- `procChance` - Chance to proc (0-100 percentage)
- `ppm` - Procs Per Minute (alternative to procChance for PPM-based procs)
- `internalCooldown` - ICD in seconds between procs

**For charge/stack-based procs:**
- `maxBlocks` - Max blocks before expiration (Holy Shield, Redoubt)
- `maxAttacks` - Max attacks before expiration (Flurry)
- `maxCharges` - Max charges (Elemental Focus)
- `charges` - Base charges (Lightning Shield)
- `maxStacks` - Max stacks (Badge of the Swarmguard, Wrath of Cenarius)

**For talent-based procs:**
- `fromTalent` - Boolean flag indicating talent requirement
- `spellIds` - Array of spell IDs for tooltip lookup
- `getTalentRank()` - Function to get current talent rank
- `getTalentStats()` - Function to get stat modifiers based on talent rank

**For damage-dealing procs:**
- `damageMin` / `damageMax` - Damage range
- `baseDamage` - Fixed damage amount
- `damageSchool` - Damage type ('fire', 'frost', 'nature', 'shadow')
- `spCoefficient` - Spell power scaling coefficient
- `canCrit` - Whether damage can crit
- `canResist` - Whether damage can be resisted

### Visual Properties

| Property | Type | Description |
|----------|------|-------------|
| `color` | string | Hex color for UI display |
| `icon` | string | URL to icon image |
| `buffIcon` | string | Alternate icon for buff display |

### Metadata Properties

| Property | Type | Description |
|----------|------|-------------|
| `slot` | string | Equipment slot (e.g., 'ranged', 'mainhand') |
| `enchantName` | string | Enchant name for enchant detection |
| `enchantId` | number | Enchant effect ID |
| `setId` | string | Set bonus identifier |
| `setPieces` | number | Number of pieces required |
| `fromSetBonus` | boolean | Flag for set bonus procs |
| `fromSpell` | boolean | Flag for spell-based buffs |
| `fromEnchant` | boolean | Flag for enchant procs |
| `imbue` | boolean | Flag for weapon imbues |
| `noGlobalCooldown` | boolean | Whether proc triggers GCD |

---

## Proc Categories

### 1. Trinket Procs

Trinkets that grant temporary buffs or deal damage.

**On-Use Trinkets:**
- **Kiss of the Spider** - 20% haste for 15s, 3min CD
- **Natural Alignment Crystal** - 20% magic damage for 20s, 5min CD
- **Shard of the Fallen Star** - Instant fire damage, 3min CD
- **Eye of Diminution** - 35% threat reduction for 20s, 3min CD

**Chance-on-Hit Trinkets:**
- **Badge of the Swarmguard** - Stacking armor penetration (6 stacks max)
- **Totem of the Stonebreaker** - 130 AP on shock hit (35% chance)
- **Totem of Thundercall** (item 33089) - `procType: 'onStormstrikeHit'`, **70%** chance in `procs.js` (temporary: item DB says 35% but behaves like double rate in-game; revert proc to 35 when aligned); `effect.type: 'thundercallStormCloud'` — handled entirely by **`procEngine.js`** (`EFFECT_HANDLERS.thundercallStormCloud`): `fireMeleeAttackTriggers` → `onStormstrikeHit` → `processProcTrigger` → `rollProcChance` (uses `procsFromProcsJs` + Fortune like other item procs). Effect sets `skipScheduleExpiration` / `skipUptimeTracking` (scheduled ticks only, no fake buff expiry). `findActiveProcs` matches equipped items by **item id** even when `name` is missing. Storm cloud ticks use **`resistanceProfile: 'dot'`** so `rollForResistance('nature', { isDot: true })` runs. UI icon: `https://database.ravencraft.io/images/icons/large/spell_nature_callstorm.png` (proc definition + `getAbilityIconUrl('Storm Cloud (Totem of Thundercall)')` in `dps.js`). Tooltip sim star: `isItemProcModeled` uses normalized item ids + `getProcByItemId` fallback.
- **Wrath of Cenarius** - 132 spell damage on spell hit (5% chance)
- **Loop of Unceasing Frost** (ring **55503**) — `procTypes: ['onMeleeHit','onSpellHit']`, `effect.type: 'targetFireDamageTakenDebuff'`: **4%** on allowed melee only (`Auto Attack`, `Stormstrike`, `Lightning Strike (Physical)`; excludes Windfury and other melee). **Lightning Strike** does **not** use the 10% spell path on the nature hit—only the physical swing (`fireMeleeAttackTriggers` with source `Lightning Strike (Physical)`). **10%** on other `onSpellHit` sources (`denySpellHitSubstrings`: **Flametongue**, **Spell Strike** — weapon/enchant `Spell Strike (Fire)` etc. from `abilityCasting.processSpellStrikeHits`). Applies **×1.05** to `ctx.stats.fireDamageMultiplier` for **10s** (CoE-style fire taken); refresh extends duration without stacking the multiplier. Sim display: debuff **`name` `Freezing Cold`**, icon `spell_frost_frostshock.png` (`itemName` remains **Loop of Unceasing Frost** for gear matching). Per-trigger odds use `effect.procChanceByTrigger`; Fortune scales both rates without using the single-value `procsFromProcsJs` override.

**`onDirectDamageSpellHit` (same eligibility as Sigil / Spellpower Goggles):** Fired when `fireSpellHitTriggers` is called with `alsoFireDirectDamageSpell: true` — **Lightning Bolt**, **Chain Lightning (every bounce)**, **Earthquake** (primary, each AoE splash, aftershock, each aftershock splash — every hit that calls `fireEqTriggers`), **Molten Blast**, **Flame/Earth/Frost Shock** via `castAbility` / dedicated cast paths; **Lightning Shield** and **Empowered Lightning Shield** procs in `lightningShieldSystem.js`. Not used for Flametongue melee procs, Frostbrand, DoT ticks, totem pulses, etc.

**ICD + multi-hit spells:** `processProcTrigger` runs **per hit**. Order: **ICD check** → **proc chance roll** → handler (on success, handler sets `lastProc` and starts ICD). Failed rolls do **not** set ICD, so **every eligible hit keeps rolling until one procs**, then ICD blocks further attempts until elapsed (e.g. Sigil **1s**: one proc per window across CL bounces / EQ hits in that second). `checkICD` treats `lastProc < 0` as ready so long ICDs (e.g. bracers **18s**) are not blocked at **t = 0**.

**Sigil of Ancient Accord** (trinket **58244**): **8%**, **1s ICD**, arcane **damageProc** with AoE split in `procEngine.js`. **Spellpower Goggles Xtreme Plus+** (head **33095**): **8%**, **no ICD**, **6s** `statBuff` **+200** spell power and **`spellCastSlowPercent: 10`**.

**Bindings of Contained Magic** (wrist **55106**): **`onSpellHit`**, **10%** proc chance (tooltip omits exact rate — tune when known), **18s ICD**, **6s** `statBuff` **+100** spell power only (no cast-speed penalty on the item).

Item procs use `findActiveProcs` / `procsFromProcsJs`; Fortune scales chance when `itemId` is set (unless `noFortune`).

### 2. Enchant Procs

**Crusader:**
- +100 Strength for 15 seconds
- 1 PPM (Procs Per Minute)
- Scales with weapon speed for proc chance
- Strength affected by Kings, talent multipliers

### 3. Set Bonuses

**Incendosaur 3pc:**
- 5% chance on melee hit to trigger spellstrike (15-26 fire damage)
- Triggers spell hit procs (Wrath of Cenarius, OBD)

**Ten Storms 4pc:**
- 25% chance on Lightning Strike to grant instant Lightning Bolt

**Stormhowl 5pc:**
- 10% chance on auto attack for Stormwolf's Frenzy (10% haste, 5% strength, 12s)

**Towerforge Battlegear 2pc:** +6 Two-Handed Maces weapon skill (passive, applied in calculator)  
**Towerforge Battlegear 4pc:** 2% chance on melee hit for Towerforge Fury (+50 Strength / +100 AP, 10s). Procs from auto attacks, Stormstrike, Lightning Strike (physical), and Windfury. Handled in `setBonusSystem.js`.

**Black Dragon Mail 2pc:** +1% melee hit chance  
**Black Dragon Mail 3pc:** +2% melee crit chance

### 4. Talent Procs

**Redoubt (Protection Paladin):**
- Procs on being hit (2/4/6/8/10% chance based on rank)
- Grants 3/6/9/12/15% block chance for 10s or 5 blocks

**Holy Shield (Protection Paladin):**
- On-use ability (10.2s CD with reaction delay)
- +45% block chance for 10s or 4 blocks

**Flurry (Enhancement Shaman):**
- 100% proc chance on melee crit + specific spell crits (Shocks, Molten Blast, Lightning Bolt, Chain Lightning, Earthquake, Totem of Tides)
- 8/11/14/17/20% haste based on rank
- Lasts for 3 auto attacks or 15 seconds
- Does NOT proc from: Flametongue, Spellstrike, totems (Searing/Magma/Fire Nova), trinket procs

**Elemental Devastation (Enhancement Shaman):**
- 100% proc chance on melee crit
- +3/6/9% spell hit for 10 seconds based on rank

**Elemental Focus (Elemental Shaman):**
- 100% proc chance on spell crit
- 2 charges of 60% mana cost reduction
- Lasts 15 seconds or until consumed

**Elemental Mastery (Elemental Shaman):**
- On-use ability, 3min CD
- +15% Fire/Frost/Nature damage for 15 seconds

### 5. Weapon Imbues

**Flametongue Weapon:**
- Procs on every melee hit (100% chance)
- Deals fire damage based on weapon DPS
- Triggers spell hit procs

**Windfury Weapon:**
- 20% chance on melee hit
- Grants 2 extra attacks with +323 AP
- Cannot proc itself

### 6. Weapon Procs

**Ornate Bloodstone Dagger:**
- 20% chance on spell hit, 1s ICD
- 250 fire damage + 42.85% spell power
- Cannot crit or be resisted

**Blade of Eternal Darkness:**
- 10% chance on spell hit
- 100 shadow damage + 100 mana return
- Cannot crit, can be resisted

### 7. Consumable Procs

**Dragonbreath Chili:**
- 5% chance on melee hit
- 61-68 fire damage + 33% spell power
- Can crit (150% multiplier, not Elemental Fury's 200%)
- Has `itemId` for detection/reference and **`noFortune: true`** so the sim does **not** multiply its proc chance by the Fortune stat (food buff, not an equipped gear proc). Equipped items use `itemId` without `noFortune` to receive Fortune in `buildSimContext`.

**Greater Stoneshield Potion:**
- On-use consumable
- +2000 armor for 2 minutes

**Potion of Quickness:**
- On-use consumable (acts like a trinket in the sim)
- +5% haste for 30 seconds, 2-minute cooldown
- Uses `onUseActivation` effect type with `hastePercent: 5`
- Detected via `activeBuffs` (buff toggle in Consumables tab)
- Appears in priority sequencer and opener when buff is active

**Juju Flurry:**
- On-use consumable (acts like a trinket in the sim)
- +3% attack AND casting speed for 20 seconds, 1-minute cooldown
- Uses `onUseActivation` effect type with `hastePercent: 3`
- Detected via `activeBuffs` (buff toggle in Consumables tab)
- Appears in both `getHasteMultiplier` and `getSpellHasteMultiplier`

### 8. Ability Buffs

**Stormstrike:**
- Applied via ability use
- +20% nature damage taken by target for 12s

**Bloodlust:**
- On-use ability, 6min CD
- +20% attack speed for 30s

**Lightning Shield:**
- Spell-based buff
- 3 base charges (+2/4/6 with Stable Shields talent)
- 2s ICD (3s with talent)
- Deals damage when hit

### 9. External Debuffs

**Nightfall:**
- Applied by another player's Nightfall weapon
- +10% spell damage taken by target for 7s
- 35-55% average uptime

**Hemorrhage:**
- Applied by rogue
- +2% physical damage taken (+4% if improved)
- 40-50% average uptime

---

## Proc Types and Triggers

### Proc Type Values

| Proc Type | Description | Trigger Condition |
|-----------|-------------|-------------------|
| `onUse` | Manual activation | Player clicks the proc button |
| `chanceOnHit` | Chance when hit by enemy | Enemy hits player, rolls proc chance |
| `onMeleeHit` | Chance on melee hit | Player lands melee attack |
| `onSpellHit` | Chance on spell hit | Player's spell hits target |
| `onShockHit` | Chance on shock spell hit | Shock spells hit target |
| `onMeleeCrit` | Triggers on melee crit | Player's melee attack crits |
| `onSpellCrit` | Triggers on spell crit | Player's spell crits |
| `onBeingHit` | Triggers when hit | Player takes damage |
| `onAutoAttack` | Triggers on auto attack | Auto attack hits |
| `onLightningStrike` | Triggers on Lightning Strike | Lightning Strike hits |
| `onAbilityUse` | Triggers when ability used | Specific ability is cast |
| `external` | Applied by external source | Another player applies debuff |
| `talent` | Always active if talented | Passive talent effect |

### Trigger Mechanics

**PPM (Procs Per Minute) System:**
- Used for enchants like Crusader
- Proc chance calculated as: `(baseWeaponSpeed × PPM) / 60 × 100`
- Haste increases procs by increasing attacks per minute, not per-hit chance
- Example: 2.5 speed weapon with 1 PPM = 4.17% chance per hit

**Chance-on-Hit System:**
- Fixed percentage chance per trigger event
- Independent rolls for each hit
- Example: 5% chance means 5 out of 100 hits will proc on average

**Internal Cooldown (ICD):**
- Minimum time between proc activations
- Prevents excessive proc rates
- Example: Ornate Bloodstone Dagger has 1s ICD

---

## Proc Mechanics

### 1. Cooldown Management

**Global Cooldowns (GCD):**
- Most on-use abilities trigger GCD (1.5s default)
- Trinkets typically do NOT trigger GCD (`noGlobalCooldown: true`)
- Bloodlust uses GCD

**Cooldown Types:**
- **Fixed Cooldowns** - Standard CD (Kiss of the Spider: 180s)
- **No Cooldown** - Chance-based limitation only (Wrath of Cenarius)
- **Internal Cooldown** - Minimum time between procs (OBD: 1s ICD)

### 2. Duration and Expiration

**Time-Based Duration:**
- Expires after fixed duration (Kiss of the Spider: 15s)
- Can be refreshed if proc triggers again

**Charge-Based Duration:**
- Expires after X charges consumed OR time limit
- **Flurry** - 3 attacks or 15 seconds, whichever first
- **Holy Shield** - 4 blocks or 10 seconds, whichever first
- **Redoubt** - 5 blocks or 10 seconds, whichever first
- **Elemental Focus** - 2 spell casts or 15 seconds

**Stack-Based Duration:**
- Badge of the Swarmguard - Builds 6 stacks, consumed on attacks
- Wrath of Cenarius - 1 stack (refreshable), 10s duration

### 3. PPM Calculation

Formula: `procChancePercent = (baseWeaponSpeed × ppm) / 60 × 100`

Example for Crusader (1 PPM):
- 2.0 speed weapon: `(2.0 × 1) / 60 × 100 = 3.33%` per hit
- 2.5 speed weapon: `(2.5 × 1) / 60 × 100 = 4.17%` per hit
- 3.0 speed weapon: `(3.0 × 1) / 60 × 100 = 5.00%` per hit

**Important:** Haste does NOT change per-hit chance. A 2.5 speed weapon always has 4.17% chance per hit regardless of haste. Haste increases total procs by increasing attacks per minute.

### 4. Stat Modification

**Flat Stat Bonuses:**
```javascript
statModifiers: {
    blockValue: 235,
    armor: 2000,
    attackPower: 130
}
```

**Percentage Bonuses:**
```javascript
statModifiers: {
    haste: 20, // 20% attack speed
    blockChance: 45, // +45% block chance
    magicDamagePercent: 20 // +20% magic damage
}
```

**Multiplier Application:**

The `modifiesStats` function applies talent/buff multipliers:

```javascript
modifiesStats: (baseStats, characterData) => {
    const modifiedStats = { ...baseStats };

    // Apply talent bonuses (multiplicative)
    const talentBonuses = characterData.talentBonuses || {};
    let multiplier = 1 + (talentBonuses.blockValue_percent || 0);

    // Apply buff multipliers
    const activeBuffs = characterData.activeBuffs || [];
    activeBuffs.forEach(buff => {
        if (buff.blockValueMultiplier_percent) {
            multiplier *= (1 + buff.blockValueMultiplier_percent);
        }
    });

    modifiedStats.blockValue = Math.floor(modifiedStats.blockValue * multiplier);

    return modifiedStats;
}
```

**Common Multipliers:**
- **Blessing of Kings** - 10% to all stats
- **Ancestral Knowledge** - % Strength/Agility/Intellect
- **Shield Specialization** - % Block Value
- **Elemental Weapons** - % Weapon imbue damage

### 5. Stacking Mechanics

**Non-Stacking (Refreshable):**
- Most procs don't stack, they refresh duration
- Example: Wrath of Cenarius refreshes 10s duration on each proc

**Stacking Procs:**
- Badge of the Swarmguard: Builds up to 6 stacks
  - Each stack: +200 armor penetration
  - Stacks consumed on attacks
  - 30s duration or until consumed

**Charge Mechanics:**
- Lightning Shield: 3 base charges (+2/4/6 with talent)
  - Each hit consumes 1 charge
  - 2s ICD between procs (3s with talent)
  - Lasts until charges depleted

---

## Data-Driven Effects System

Version 1.4.0+ introduced a data-driven effect system for cleaner simulation integration.

### Effect Types

#### 1. `statBuff` - Temporary stat increase

```javascript
effect: {
    type: 'statBuff',
    duration: 6, // optional; falls back to proc.duration for expiry scheduling
    stats: { attackPower: 130 },
    // Optional: stat conversion
    convertsTo: { strength: { attackPower: 2 } },
    applyMultipliers: ['kings', 'ancestralKnowledge'],
    // Optional: slower spell casts (Spellpower Goggles Xtreme Plus+ only). Negative haste feel: getSpellHasteMultiplier *= (1 - pct/100) (e.g. 10 → ×0.9).
    spellCastSlowPercent: 10
}
```

**Used by:** Totem of Stonebreaker, Crusader, Elemental Devastation, Spellpower Goggles Xtreme Plus+ (head **33095**, optional `spellCastSlowPercent`), Bindings of Contained Magic (wrist **55106**, SP only)

#### 2. `stackingBuff` - Stacking stat buff

```javascript
effect: {
    type: 'stackingBuff',
    modifierKey: 'wrathOfCenarius',
    value: 132,
    maxStacks: 1 // Refreshable, doesn't stack
}
```

**Used by:** Wrath of Cenarius

#### 3. `chargeBuff` - Charge-based buff

```javascript
effect: {
    type: 'chargeBuff',
    charges: 3,
    duration: 15,
    hasteFromTalent: true,
    talentHasteValues: [0, 8, 11, 14, 17, 20],
    consumedBy: ['autoAttack']
}
```

**Used by:** Flurry, Elemental Focus

#### 4. `armorPenStack` - Armor penetration stacking

```javascript
effect: {
    type: 'armorPenStack',
    maxStacks: 6,
    armorPenPerStack: 200,
    stackTrigger: 'onMeleeHit'
}
```

**Used by:** Badge of the Swarmguard

#### 5. `onUseActivation` - On-use activation with modifiers

```javascript
effect: {
    type: 'onUseActivation',
    modifier: 'kissOfTheSpider',
    duration: 15,
    cooldown: 180,
    noGCD: true,
    hastePercent: 20
}
```

**Used by:** Kiss of the Spider, Natural Alignment Crystal, Elemental Mastery, Eye of Diminution, Bloodlust

#### 6. `onUseDamage` - Instant damage on use

```javascript
effect: {
    type: 'onUseDamage',
    damageMin: 400,
    damageMax: 443,
    damageSchool: 'fire',
    spCoefficient: 0.25,
    cooldown: 180,
    noGCD: true,
    triggersSpellHitProcs: true
}
```

**Used by:** Shard of the Fallen Star

#### 7. `damageProc` - Damage-dealing proc

```javascript
effect: {
    type: 'damageProc',
    baseDamage: 250,
    damageSchool: 'fire',
    spCoefficient: 0.4285,
    canCrit: false,
    canResist: false,
    applyMultipliers: ['elementalFury', 'elementalWeapons']
}
```

**Used by:** Ornate Bloodstone Dagger, Blade of Eternal Darkness, Dragonbreath Chili

**Physical flat damage (`physicalMeleeProc`):** Set `effect.physicalMeleeProc: true` (and matching fields on the proc root for `inferEffect`). `procEngine` routes to `handlePhysicalMeleeDamageProc`: rolls `damageMin`–`damageMax` with no spell power, multiplies by **Hemorrhage** when active, then resolves through **`combatSim.rollDamage`** as physical with **`hasGlancingBlows: false`** (same idea as Stormstrike). Optional **`fightExecuteAfterPct`** (default `0.7`) and **`fightExecuteDamageMult`** (default `1.25`) apply the bonus for the last portion of **`ctx.fightDuration`** (boss timeline proxy for sub-30% HP). **`procPhysicalCanMiss`** defaults to `true`: **miss, dodge, and parry** roll on the same single-table physical path as Stormstrike and other melee abilities (boss avoidance caps via `getTotalMeleeAvoidance`). Set to `false` only if the proc should skip the **miss** check (dodge/parry still apply in `rollDamage`).

**Used by:** Elementium Reaper (item **33094**), **1.2 PPM** (`getProcChance`)

#### 7a. `damagePlusStatBuff` - Instant damage + temporary stat buff

```javascript
effect: {
    type: 'damagePlusStatBuff',
    damage: {
        damageMin: 175,
        damageMax: 249,
        damageSchool: 'holy',
        spCoefficient: 0.25, // Holy uses max(spellPower, holyDamage) in procEngine
        canCrit: true,
        canResist: true,
        critMultiplier: 1.5,
        triggersSpellHitProcs: true
    },
    buff: {
        stats: { strength: 50 },
        convertsTo: { strength: { attackPower: 2 } },
        applyMultipliers: ['kings', 'ancestralKnowledge']
    }
}
```

Handled by **`procEngine.js`** `handleDamagePlusStatBuff`: runs **`handleDamageProc`** on a clone of the proc with **`duration: 0`** (so the buff’s duration is not treated as a DoT refresh window), then **`handleStatBuff`** with the real proc for uptime.

**Used by:** Fist of the Forgotten Order (item **61277**), 1.2 PPM melee

#### 8. `imbueDamage` - Weapon imbue damage

```javascript
effect: {
    type: 'imbueDamage',
    spell: 'flametongueWeapon',
    triggersSpellHitProcs: true
}
```

**Used by:** Flametongue Weapon

#### 8b. `imbuePpmDamage` - PPM weapon imbue (Frostbrand)

```javascript
effect: {
    type: 'imbuePpmDamage',
    spell: 'frostbrandWeapon',
    ppm: 9,
    triggersSpellHitProcs: true
}
```

Per-hit chance is computed in `imbueSystem.getFrostbrandProcChance` (weapon speed × PPM / 60 plus Elemental Weapons additive bonus). `procEngine` registers `imbuePpmDamage` as delegated to the imbue system.

**Used by:** Frostbrand Weapon (`frostbrand_weapon`)

#### 9. `imbueExtraAttacks` - Extra attacks from imbue

```javascript
effect: {
    type: 'imbueExtraAttacks',
    count: 2,
    apBonus: 323,
    spell: 'windfuryAttack',
    cannotProcSelf: true,
    consumesFlurryCharges: false
}
```

**Used by:** Windfury Weapon

---

## Integration with Simulation

### Proc Detection: `findActiveProcs()`

Detects active procs based on equipped items, buffs, talents, and enchants.

```javascript
export function findActiveProcs(equippedItems, activeBuffs = [], characterData = null)
```

**Detection Sources:**
1. **Equipped Items** - Matches by `itemId` or `itemName`
2. **Active Buffs** - Matches consumables and spell-based buffs
3. **Talents** - Checks talent rank via `getTalentRank()`
4. **Enchants** - Matches by `enchantName` or `enchantId`
5. **Set Bonuses** - Detected via equipped items

**Returns:** Array of active proc definitions with source metadata

### Proc State Management

**State Object Structure:**
```javascript
{
    isActive: false,        // Currently active?
    expiresAt: 0,          // Expiration timestamp
    lastUsed: -cooldown,   // Last activation time
    procs: 0,              // Total proc count
    uptime: 0,             // Total uptime
    // Optional based on proc type:
    blocksRemaining: 5,    // For maxBlocks procs
    attacksRemaining: 3,   // For maxAttacks procs
    chargesRemaining: 2,   // For charge-based procs
    stacks: 0,             // For stacking procs
    statModifiers: {}      // Stored stat mods (for Redoubt)
}
```

### SimProcManager Class

Main interface for combat simulations.

```javascript
class SimProcManager {
    constructor(sim)
    initialize(stats)              // Initialize procs from stats
    getProc(procId)                // Get proc definition
    getState(procId)               // Get proc state
    isActive(procId)               // Check if active
    isOffCooldown(procId)          // Check if CD ready
    activateOnUse(procId)          // Activate on-use proc
    tryTrigger(procId, triggerType) // Try to trigger chance-based proc
    applyStatModifiers(proc)       // Apply stat changes
    removeStatModifiers(proc)      // Remove stat changes
    update()                       // Update states (check expirations)
    getUptime(procId)              // Get uptime percentage
}
```

**Usage Example:**
```javascript
// Initialize
const procManager = new SimProcManager(sim);
procManager.initialize(stats);

// Check and activate on-use procs
if (procManager.isOffCooldown('kiss_of_the_spider')) {
    procManager.activateOnUse('kiss_of_the_spider');
}

// Try to trigger chance-based proc
const didProc = procManager.tryTrigger('wrath_of_cenarius', 'onSpellHit');

// Update each time step
procManager.update();

// Get uptime at end
const uptimePercent = procManager.getUptime('natural_alignment_crystal');
```

### Helper Functions

**`calculateProcActivation()`** - Determine optimal activation timing
```javascript
export function calculateProcActivation(proc, currentTime, simulationDuration, procState)
```

**`checkProcChance()`** - Roll for proc trigger
```javascript
export function checkProcChance(proc)
```

**`getActiveProcStats()`** - Get combined stat modifiers from active procs
```javascript
export function getActiveProcStats(activeProcs, currentTime, procStates, characterData)
```

**`updateProcStates()`** - Update all proc states for time step
```javascript
export function updateProcStates(activeProcs, currentTime, procStates = {}, characterData = null)
```

**`getProcById()`** / **`getProcByItemId()`** - Lookup functions
```javascript
export function getProcById(procId)
export function getProcByItemId(itemId)
```

---

## Adding New Procs

### Step-by-Step Guide

#### 1. Define the Proc Object

Add to `procDefinitions` array:

```javascript
{
    id: 'my_new_trinket',
    name: 'My New Trinket',
    itemName: 'My New Trinket',
    itemId: 12345,
    cooldown: 120,
    duration: 15,
    statModifiers: {
        attackPower: 200
    },
    procType: 'onUse',
    noGlobalCooldown: true,
    color: '#FF5733',
    icon: 'https://example.com/icon.png',
    modifiesStats: (baseStats, characterData) => {
        // Apply any multipliers here
        return baseStats;
    }
}
```

#### 2. Choose the Appropriate Proc Type

- **On-Use Trinket** → `procType: 'onUse'`
- **Chance-on-Hit** → `procType: 'chanceOnHit'`, add `procChance`
- **Melee Proc** → `procType: 'onMeleeHit'`, add `procChance`
- **Spell Proc** → `procType: 'onSpellHit'`, add `procChance`
- **PPM Enchant** → `procType: 'onMeleeHit'`, add `ppm`, implement `getProcChance()`
- **Talent Proc** → Add `fromTalent: true`, implement `getTalentRank()` and `getTalentStats()`

#### 3. Add Data-Driven Effect (Optional but Recommended)

For v1.4.0+ simulations:

```javascript
effect: {
    type: 'statBuff', // or other type
    stats: { attackPower: 200 },
    applyMultipliers: ['kings']
}
```

#### 4. Implement Stat Modifiers Function

```javascript
modifiesStats: (baseStats, characterData) => {
    const modifiedStats = { ...baseStats };

    // Apply multipliers
    const activeBuffs = characterData?.activeBuffs || [];
    const hasKings = activeBuffs.some(buff => buff.id === 'blessingOfKings');

    if (hasKings && modifiedStats.attackPower) {
        modifiedStats.attackPower = Math.floor(modifiedStats.attackPower * 1.10);
    }

    return modifiedStats;
}
```

#### 5. Add Talent Detection (For Talent Procs)

```javascript
// Get talent rank
getTalentRank: function(characterData) {
    // Check characterData first
    if (characterData?.talentBonuses?.my_talent_rank) {
        return characterData.talentBonuses.my_talent_rank;
    }

    // Fallback to DOM
    try {
        const talentEl = document.getElementById('tree-id');
        if (talentEl) {
            return parseInt(talentEl.dataset.points, 10) || 0;
        }
    } catch (e) {
        // DOM access failed
    }

    return 0;
},

// Get stat modifiers based on rank
getTalentStats: function(characterData) {
    const rank = this.getTalentRank(characterData);
    if (rank === 0) return null; // Not learned

    // Calculate stats based on rank
    const bonusValues = [0, 50, 100, 150];
    return {
        attackPower: bonusValues[rank]
    };
}
```

#### 6. Add Item Detection Flag (For Simulations)

In the simulation stats initialization, add a detection flag:

```javascript
// In buildCharacterStats() or similar
stats.hasMyNewTrinket = equippedItems.some(item => item.id === 12345);
```

Then in SimProcManager.initialize():

```javascript
if (proc.id === 'my_new_trinket' && stats.hasMyNewTrinket) {
    hasProc = true;
}
```

#### 7. Handle Special Mechanics (If Needed)

**For charge-based procs:**
```javascript
maxCharges: 2,
effect: {
    type: 'chargeBuff',
    charges: 2,
    duration: 15,
    consumedBy: ['spell']
}
```

**For stacking procs:**
```javascript
maxStacks: 6,
effect: {
    type: 'stackingBuff',
    maxStacks: 6,
    value: 50
}
```

**For damage procs:**
```javascript
baseDamage: 250,
damageSchool: 'fire',
spCoefficient: 0.4,
canCrit: true,
canResist: true,
effect: {
    type: 'damageProc',
    baseDamage: 250,
    damageSchool: 'fire',
    spCoefficient: 0.4,
    canCrit: true,
    canResist: true
}
```

#### 8. Test the Proc

1. Equip the item/talent
2. Verify detection: Check that `findActiveProcs()` returns the proc
3. Test activation: Trigger the proc and verify stat changes
4. Test cooldown: Verify cooldown prevents early re-activation
5. Test duration: Verify proc expires correctly
6. Run simulations: Verify DPS/TPS calculations are correct

---

## API Reference

### Core Functions

#### `findActiveProcs(equippedItems, activeBuffs, characterData)`

Detects and returns all active procs based on equipped items, buffs, talents, and enchants.

**Parameters:**
- `equippedItems` (Array) - Equipped item objects
- `activeBuffs` (Array) - Active buff objects
- `characterData` (Object) - Character data including talents

**Returns:** Array of proc definitions with source metadata

**Example:**
```javascript
const activeProcs = findActiveProcs(
    equippedItems,
    activeBuffs,
    { talentBonuses: { redoubt_rank: 5 }, selectedEnchants: enchants }
);
```

---

#### `calculateProcActivation(proc, currentTime, simulationDuration, procState)`

Determines optimal activation timing for on-use procs.

**Parameters:**
- `proc` (Object) - Proc definition
- `currentTime` (number) - Current simulation time
- `simulationDuration` (number) - Total duration
- `procState` (Object) - Current proc state

**Returns:** `{ shouldActivate: boolean, activationTime: number }`

---

#### `checkProcChance(proc)`

Rolls for proc trigger based on proc chance.

**Parameters:**
- `proc` (Object) - Proc definition with `procChance`

**Returns:** boolean - Whether proc triggered

---

#### `getActiveProcStats(activeProcs, currentTime, procStates, characterData)`

Calculates combined stat modifiers from all currently active procs.

**Parameters:**
- `activeProcs` (Array) - Active proc definitions
- `currentTime` (number) - Current time
- `procStates` (Object) - Map of proc states
- `characterData` (Object) - Character data

**Returns:** Object with combined stat modifiers

---

#### `updateProcStates(activeProcs, currentTime, procStates, characterData)`

Updates all proc states for a simulation time step.

**Parameters:**
- `activeProcs` (Array) - Active proc definitions
- `currentTime` (number) - Current time
- `procStates` (Object) - Map of proc states
- `characterData` (Object) - Character data

**Returns:** Updated proc states object

---

#### `getProcById(procId)`

Retrieves a proc definition by ID.

**Parameters:**
- `procId` (string) - Proc identifier

**Returns:** Proc definition object or undefined

---

#### `getProcByItemId(itemId)`

Retrieves a proc definition by item ID.

**Parameters:**
- `itemId` (number) - Item identifier

**Returns:** Proc definition object or undefined

---

### SimProcManager Class

Main interface for combat simulations.

#### Constructor

```javascript
const procManager = new SimProcManager(sim);
```

**Parameters:**
- `sim` (Object) - Reference to combat simulator

---

#### `initialize(stats)`

Initializes procs based on character stats and equipped items.

**Parameters:**
- `stats` (Object) - Character stats with item detection flags

**Example:**
```javascript
procManager.initialize({
    hasKissOfTheSpider: true,
    hasNaturalAlignmentCrystal: true,
    hasCrusader: true
});
```

---

#### `getProc(procId)`

Retrieves an active proc definition.

**Returns:** Proc definition or undefined

---

#### `getState(procId)`

Retrieves current state for a proc.

**Returns:** Proc state object or undefined

---

#### `isActive(procId)`

Checks if a proc is currently active.

**Returns:** boolean

---

#### `isOffCooldown(procId)`

Checks if a proc's cooldown is ready.

**Returns:** boolean

---

#### `activateOnUse(procId)`

Activates an on-use proc.

**Returns:** boolean - Success status

**Example:**
```javascript
if (procManager.isOffCooldown('kiss_of_the_spider')) {
    procManager.activateOnUse('kiss_of_the_spider');
}
```

---

#### `tryTrigger(procId, triggerType)`

Attempts to trigger a chance-based proc.

**Parameters:**
- `procId` (string) - Proc identifier
- `triggerType` (string) - Trigger type ('onMeleeHit', 'onSpellHit', etc.)

**Returns:** boolean - Whether proc triggered

**Example:**
```javascript
// On melee hit
const crusaderProc = procManager.tryTrigger('crusader', 'onMeleeHit');

// On spell hit
const wrathProc = procManager.tryTrigger('wrath_of_cenarius', 'onSpellHit');
```

---

#### `update()`

Updates all proc states, checking for expirations.

**Example:**
```javascript
// Call each simulation step
procManager.update();
```

---

#### `getUptime(procId)`

Calculates uptime percentage for a proc.

**Returns:** number (0-1 representing percentage)

**Example:**
```javascript
const uptimePercent = procManager.getUptime('natural_alignment_crystal') * 100;
console.log(`NAC uptime: ${uptimePercent.toFixed(1)}%`);
```

---

## Examples

### Example 1: Simple On-Use Trinket

```javascript
{
    id: 'earthstrike',
    name: 'Earthstrike',
    itemName: 'Earthstrike',
    itemId: 21180,
    cooldown: 120,
    duration: 20,
    statModifiers: {
        attackPower: 280
    },
    procType: 'onUse',
    noGlobalCooldown: true,
    color: '#8B4513',
    icon: 'https://database.ravencraft.io/images/icons/large/inv_trinket_naxxramas01.png',
    effect: {
        type: 'statBuff',
        stats: { attackPower: 280 }
    },
    modifiesStats: (baseStats, characterData) => {
        const modifiedStats = { ...baseStats };

        // Apply Kings if present
        const activeBuffs = characterData?.activeBuffs || [];
        const hasKings = activeBuffs.some(buff => buff.id === 'blessingOfKings');
        if (hasKings && modifiedStats.attackPower) {
            modifiedStats.attackPower = Math.floor(modifiedStats.attackPower * 1.10);
        }

        return modifiedStats;
    }
}
```

---

### Example 2: Chance-on-Hit Proc with ICD

```javascript
{
    id: 'drake_fang_talisman',
    name: 'Drake Fang Talisman',
    itemName: 'Drake Fang Talisman',
    itemId: 19406,
    cooldown: 0,
    internalCooldown: 50, // 50 second ICD
    duration: 20,
    statModifiers: {
        attackPower: 200,
        defenseRating: 300
    },
    procType: 'chanceOnHit',
    procChance: 2.0, // 2% chance
    color: '#4169E1',
    icon: 'https://database.ravencraft.io/images/icons/large/inv_misc_bone_dragonskull_01.png',
    effect: {
        type: 'statBuff',
        stats: { attackPower: 200, defenseRating: 300 }
    },
    modifiesStats: (baseStats) => baseStats
}
```

---

### Example 3: PPM-Based Enchant

```javascript
{
    id: 'crusader',
    name: 'Crusader',
    enchantName: 'Enchant Weapon - Crusader',
    enchantId: 1900,
    cooldown: 0,
    duration: 15,
    statModifiers: {
        str: 100
    },
    procType: 'onMeleeHit',
    ppm: 1.0,
    spellIds: [20034],
    effect: {
        type: 'statBuff',
        stats: { strength: 100 },
        convertsTo: { strength: { attackPower: 2 } },
        applyMultipliers: ['kings', 'ancestralKnowledge']
    },
    // Dynamic proc chance based on weapon speed
    getProcChance: function(characterData) {
        const baseWeaponSpeed = characterData?.baseWeaponSpeed ?? 2.5;
        return (baseWeaponSpeed * this.ppm) / 60 * 100;
    },
    modifiesStats: (baseStats, characterData) => {
        const modifiedStats = { ...baseStats };

        if (modifiedStats.str) {
            let strMultiplier = 1.0;

            // Kings
            const activeBuffs = characterData?.activeBuffs || [];
            const hasKings = activeBuffs.some(buff => buff.id === 'blessingOfKings');
            if (hasKings) strMultiplier *= 1.10;

            // Talent multipliers
            const talentBonuses = characterData?.talentBonuses || {};
            if (talentBonuses.str_percent) {
                strMultiplier *= (1 + talentBonuses.str_percent);
            }

            modifiedStats.str = Math.floor(modifiedStats.str * strMultiplier);
        }

        return modifiedStats;
    },
    color: '#FFD700',
    icon: 'https://database.ravencraft.io/images/icons/large/spell_holy_blessingofstrength.png'
}
```

---

### Example 4: Talent-Based Proc with Variable Stats

```javascript
{
    id: 'flurry',
    name: 'Flurry',
    itemName: 'Flurry',
    cooldown: 0,
    duration: 15,
    maxAttacks: 3,
    maxCharges: 3,
    statModifiers: {},
    procType: 'onMeleeCrit',
    procChance: 100,
    fromTalent: true,
    effect: {
        type: 'chargeBuff',
        charges: 3,
        duration: 15,
        hasteFromTalent: true,
        talentHasteValues: [0, 8, 11, 14, 17, 20],
        consumedBy: ['autoAttack']
    },
    color: '#4CAF50',
    icon: 'https://database.ravencraft.io/images/icons/large/ability_ghoulfrenzy.png',
    getTalentRank: function(characterData) {
        if (characterData?.talentBonuses?.flurry) {
            return characterData.talentBonuses.flurry;
        }
        return 0;
    },
    getTalentStats: function(characterData) {
        const rank = this.getTalentRank(characterData);
        if (rank === 0) return null;

        const hasteValues = [0, 8, 11, 14, 17, 20];
        return {
            haste: hasteValues[rank]
        };
    }
}
```

---

### Example 5: Damage-Dealing Proc

```javascript
{
    id: 'ornate_bloodstone_dagger',
    name: 'Ornate Bloodstone Dagger',
    itemName: 'Ornate Bloodstone Dagger',
    itemId: 65004,
    slot: 'mainhand',
    cooldown: 0,
    internalCooldown: 1,
    duration: null,
    statModifiers: {},
    procType: 'onSpellHit',
    procChance: 20,
    baseDamage: 250,
    damageSchool: 'fire',
    spCoefficient: 0.4285,
    canCrit: false,
    canResist: false,
    effect: {
        type: 'damageProc',
        baseDamage: 250,
        damageSchool: 'fire',
        spCoefficient: 0.4285,
        canCrit: false,
        canResist: false,
        applyMultipliers: ['elementalFury', 'elementalWeapons']
    },
    color: '#FF4500',
    icon: 'https://database.ravencraft.io/images/icons/large/spell_fire_lavaspawn.png',
    modifiesStats: (baseStats) => baseStats
}
```

---

### Example 6: Stacking Proc (Badge of the Swarmguard)

```javascript
{
    id: 'badge_of_the_swarmguard',
    name: 'Badge of the Swarmguard',
    itemName: 'Badge of the Swarmguard',
    itemId: 21670,
    cooldown: 180,
    duration: 30,
    statModifiers: {},
    procType: 'onUse',
    noGlobalCooldown: true,
    maxStacks: 6,
    armorPenPerStack: 200,
    effect: {
        type: 'armorPenStack',
        maxStacks: 6,
        armorPenPerStack: 200,
        stackTrigger: 'onMeleeHit'
    },
    color: '#8B4513',
    icon: 'https://database.ravencraft.io/images/icons/large/inv_trinket_naxxramas05.png',
    modifiesStats: (baseStats) => baseStats
}
```

**Usage in Simulation:**
```javascript
// Activate Badge
if (procManager.isOffCooldown('badge_of_the_swarmguard')) {
    procManager.activateOnUse('badge_of_the_swarmguard');
}

// On melee hit, add stacks
const state = procManager.getState('badge_of_the_swarmguard');
if (state.isActive && state.stacks < state.maxStacks) {
    state.stacks++;
    state.armorPen = state.stacks * 200;
}
```

---

### Example 7: Charge-Based Proc (Elemental Focus)

```javascript
{
    id: 'elemental_focus',
    name: 'Elemental Focus',
    itemName: 'Elemental Focus',
    color: '#00CED1',
    icon: 'https://database.ravencraft.io/images/icons/large/spell_shadow_manaburn.png',
    cooldown: 0,
    duration: 15,
    maxCharges: 2,
    statModifiers: {
        manaCostReduction: 60
    },
    procType: 'onSpellCrit',
    procChance: 100,
    fromTalent: true,
    spellIds: [45541],
    effect: {
        type: 'chargeBuff',
        charges: 2,
        duration: 15,
        manaCostReduction: 60,
        consumedBy: ['spell']
    },
    getTalentRank: function(characterData) {
        return characterData?.talentBonuses?.elemental_focus || 0;
    },
    getTalentStats: function(characterData) {
        const rank = this.getTalentRank(characterData);
        if (rank === 0) return null;
        return {
            manaCostReduction: 60,
            maxCharges: 2
        };
    }
}
```

---

## Best Practices

### 1. Always Use Unique IDs
- Use descriptive, lowercase IDs with underscores
- Never duplicate IDs

### 2. Implement modifiesStats Properly
- Always return a modified stats object
- Apply multipliers in correct order (talents, then buffs)
- Use `Math.floor()` for final values

### 3. Set Appropriate procType
- Use the most specific trigger type available
- For PPM-based procs, implement `getProcChance()`

### 4. Include Data-Driven Effects
- Use v1.4.0+ effect system for new procs
- Choose the correct effect type for mechanics

### 5. Document Complex Mechanics
- Add comments explaining non-obvious behavior
- Reference game mechanics (ICD, PPM, etc.)

### 6. Test Thoroughly
- Test detection, activation, expiration
- Verify stat calculations
- Run simulations to validate DPS/TPS

### 7. Handle Edge Cases
- Check for null/undefined characterData
- Fallback to defaults when DOM access fails
- Handle missing talents gracefully

### 8. Use Consistent Formatting
- Follow existing code style
- Align properties for readability
- Group related properties together

---

## Version History

**v1.7.5** - **Shieldrender Talisman:** **1.5 PPM** (was 2.0); **`procChance`** display default **6.25** (~2.5s base weapon).
**v1.7.4** - **`findActiveProcs` (equipped items):** reverse name match **`proc.itemName.includes(item.name)`** now requires **`item.name.length >= 12`** so short substrings of long proc names (e.g. “Hand”, “Justice”, “Talisman”) no longer activate unrelated item procs / inflate **`procsFromProcsJs`**. **`isProcAvailable`:** **`STRICT_SIMCONTEXT_FLAG_PROC_IDS`** (**`shieldrender_talisman`**) uses only **`!!simContext[hasCamelFlag]`** (no **`in`** / no procs list fallback). **`getHasteMultiplier`** (**`damageSystem.js`**): restored **Flurry** as **`if` / `else if`** (data-driven vs legacy); **Might of the Hippogryph** is a **separate** multiplicative block so Hippogryph no longer replaces legacy Flurry when the set buff is inactive.
**v1.7.3** - **Shieldrender Talisman** (`shieldrender_talisman`, item **55131**): **`statModifiers.attackPower: 84`**; **`onMeleeHit`**, PPM-based proc (same formula as Crusader; see **v1.7.5** for rate). **`effect.type: physicalArmorIgnoreChargeBuff`** — **`procEngine.handlePhysicalArmorIgnoreChargeBuff`**: **4** charges, **10 s** duration (scheduled expiry + charge depletion clears **`shieldrender_talisman_expire`**). **`resolveShieldrenderPhysicalArmor`** runs during physical **`rollDamage`** ( **`combatSim`**, **`damageSystem`**, **`abilityCasting` Lightning Strike physical** ): consumes one charge on **`spell.isAutoAttack || spell.usesMeleeHit`** hits that connect, sets armor multiplier to **1** and skips **Corrosive Spit** armor bonus on that hit (proc applies after the triggering swing via **`fireMeleeAttackTriggers`** order). **Sim availability:** **`buildSimContext`** sets **`hasShieldrenderTalisman`** from trinket slots by **item id / name** (like Hand of Justice) so **`isProcAvailable`** does not rely on **`findActiveProcs`**’s reverse name substring rule **`proc.itemName.includes(item.name)`**, which can false-match short names contained in “Shieldrender Talisman”.
**v1.7.2** - **Sulfuras, Hand of Ragnaros** (`sulfuras_hand_of_ragnaros`, item **17182**): **`canResist: false`** on proc root and **`effect`** — initial fireball hit and DoT ticks skip **`rollForResistance`** in **`procEngine.handleDamageProc`** (no partial or full spell resist on proc damage).
**v1.7.1** - Elementium Reaper (item **33094**): **`elementium_reaper_decapitate`**, `onMeleeHit` **1.2 PPM**, **`effect.physicalMeleeProc`** — `procEngine` **`handlePhysicalMeleeDamageProc`** (flat physical via **`rollDamage`**, Hemorrhage, no glancing; **×1.25** when **t ≥ 0.7 × fightDuration**).
**v1.7.0** - Added Remains of Overwhelming Power (item 55093): new `petSummon` effect type in procEngine. On-use (5 min CD, 60s duration) grants +55 SP and summons a pet that casts Arcane Missiles (5 missiles/volley, 4 volleys at 15s intervals, 97-103 arcane per missile, 4% fixed crit). Affected by CoE and Nightfall; uses normal spell resist rules.
**v1.6.1** - Updated Totem of Crackling Thunder timeline icon to `spell_nature_invisibilty.png`. Nordrassil icon already correct (`spell_nature_healingtouch.png`) but was being overridden by the item DB icon in `dps.js` — fixed `getDisplayInfoFromProcsJs` to respect explicit full-URL proc icons over item DB icons.
**v1.6.0** - Added Droplet of Nordrassil (item 33294): `onSpellResist` proc type granting +80 SP and +3% spell hit for 10s via data-driven `statBuff` effect. New `onSpellResist` trigger type added to `triggerRouter.js` and fired from `combatSim.js` whenever a non-binary spell is partially resisted.
**v1.5.1** - Fixed Crusader double-AP bug: `handleStatBuff` in procEngine now skips the manual strength→AP fallback when `convertsTo` already handled the conversion, preventing permanent AP leakage each proc cycle
**v1.5.0** - Added weapon imbue system and additional on-use damage procs
**v1.4.0** - Introduced data-driven effect system for cleaner simulation integration
**v1.3.0** - Added charge-based buff system for Flurry and Elemental Focus
**v1.2.0** - Added talent proc system (Redoubt, Holy Shield, Elemental Devastation)
**v1.1.0** - Added PPM-based enchant system (Crusader)
**v1.0.0** - Initial proc system with trinket support

---

## Troubleshooting

### Proc Not Detecting

**Check:**
1. Is `itemName` or `itemId` correct?
2. Is item actually equipped?
3. For talents: Is `getTalentRank()` returning > 0?
4. For enchants: Is enchant in `characterData.selectedEnchants`?

### Proc Not Activating

**Check:**
1. Is cooldown ready? (`isOffCooldown()`)
2. Is proc type correct for trigger?
3. For chance-based: Is procChance set?
4. For PPM: Is `getProcChance()` implemented?

### Stats Not Applying

**Check:**
1. Is `modifiesStats()` implemented?
2. Are stat keys correct? (e.g., `attackPower` not `ap`)
3. Is `applyStatModifiers()` being called?
4. Are multipliers being applied correctly?

### Proc Not Expiring

**Check:**
1. Is duration set correctly?
2. Is `update()` being called each step?
3. For charge-based: Are charges being decremented?
4. For block-based: Are blocks being tracked?

### PPM Proc Rate Wrong

**Check:**
1. Is `baseWeaponSpeed` correct (not hasted speed)?
2. Is `getProcChance()` using correct formula?
3. Is `ppm` value correct?

---

## Future Enhancements

Potential improvements for future versions:

1. **Auto-Detection System** - Automatically scan equipped items for procs
2. **Proc Priority System** - AI-driven optimal proc usage
3. **Proc Synergy Detection** - Identify and optimize proc combinations
4. **Visual Timeline** - Show proc uptimes on timeline graph
5. **Proc Import/Export** - Share proc configurations
6. **Custom Procs** - User-defined proc system
7. **Proc Analytics** - Detailed proc performance metrics
8. **Multi-Target Procs** - AoE proc mechanics

---

## Additional Resources

- **shamanCombatSim.js** - Combat simulation implementation
- **shamanSpells.js** - Spell definitions and damage calculations
- **talents.js** - Talent system and bonus calculations
- **enchants.js** - Enchant definitions and stat bonuses
- **buffs.js** - Buff system and external effects

---

**Last Updated:** 2024
**File:** `C:\dev\IchaCalc\modules\gear\procs.js`
**Version:** 1.5.0
