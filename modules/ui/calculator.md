# calculator.js - Stat Calculation Engine

## Overview

`calculator.js` is the core stat calculation engine for IchaCalc. It takes all character data (gear, talents, buffs, race, class) and computes all defensive and offensive stats including HP, armor, EHP, attack power, crit, hit, resistances, spell damage, and more. This is the mathematical heart of the calculator that implements World of Warcraft's stat formulas.

**File Size:** 747 lines of code
**Type:** ES6 Module
**Key Export:** `calculateEffectiveHealth(data)` function; `classShowsRangedStats(classId)` for UI that shows/hides the Ranged Modified Stats card (hidden for shaman/druid/paladin — relic slot only).

---

## Key Responsibilities

1. **Stat Aggregation** - Combine stats from all sources (base, gear, enchants, buffs, talents, racials)
2. **Stat Multipliers** - Apply percentage bonuses (Kings, talent %, racial %)
3. **Derived Stats** - Calculate HP, armor, mana, attack power from base stats
4. **Combat Stats** - Calculate crit, hit, weapon skill, avoidance (dodge/parry/block)
5. **Mitigation** - Calculate armor DR, damage reduction, EHP for all damage types
6. **Resistances** - Calculate resistance stats and magic damage reduction
7. **Offensive Stats** - Calculate AP, crit, hit, spell damage, spell crit, haste
8. **Special Mechanics** - Handle form-specific bonuses, set bonuses, dual wield, weapon skill
9. **Creature-type gear stats** - Spreads `apVs*` (melee AP vs type) and `dmgHealingVs*` (spell damage/healing vs type, e.g. Mark of the Champion) from `gearStats`/`enchantStats` into the returned totals object alongside other combat stats.

---

## Architecture Overview

```
calculateEffectiveHealth(data)
├── Input: data object
│   ├── selectedClass: "warrior" | "paladin" | ...
│   ├── selectedRace: "orc" | "dwarf" | ...
│   ├── attackerLevel: 63 (boss level)
│   ├── gearStats: { sta, agi, str, armor, ... }
│   ├── enchantStats: { sta, agi, armor, ... }
│   ├── talentBonuses: { sta_percent, armor_percent, ... }
│   ├── racialBonuses: { agi_percent, axeSkill, ... }
│   ├── activeBuffs: [{ sta, agi, armor, ... }, ...]
│   ├── setBonuses: { bear_form_health_bonus, ... }
│   ├── isDualWielding: boolean
│   ├── mainhandWeaponType: "Sword" | "Mace" | ...
│   ├── offhandWeaponType: "Sword" | ...
│   ├── offhandArmor: number (shield armor)
│   └── rangedWeaponType: "Bow" | "Gun" | ...
├── Processing Steps
│   ├── 1. Aggregate Base Stats (sta, agi, str, int, spi)
│   ├── 2. Apply Percentage Multipliers (Kings, talents, racials)
│   ├── 3. Calculate Derived Stats (HP, armor, mana, AP)
│   ├── 4. Calculate Combat Stats (crit, hit, weapon skill)
│   ├── 5. Calculate Avoidance (dodge, parry, block)
│   ├── 6. Calculate Damage Reduction (armor DR, flat DR, EHP)
│   ├── 7. Calculate Resistances (fire, frost, nature, shadow, arcane)
│   └── 8. Calculate Offensive Stats (AP, crit, spell damage)
└── Output: Comprehensive stats object (47 properties)
```

---

## Major Sections

### 1. Stat Formulas & Constants (Lines 1-24)

**Purpose:** Define class-specific formulas for stat conversions

#### Class Avoidance Stats
```javascript
const classAvoStats = {
    druid:   { dodge: 0.9, parry: 0,   block: 0,   agiPerDodge: 20.0 },
    warrior: { dodge: 0.0, parry: 5.0, block: 5.0, agiPerDodge: 20.0 },
    paladin: { dodge: 0.7, parry: 5.0, block: 5.0, agiPerDodge: 19.767 },
    shaman:  { dodge: 1.7, parry: 5.0, block: 5.0, agiPerDodge: 20.0 },
    hunter:  { dodge: 0,   parry: 5.0, block: 0,   agiPerDodge: 20.0 }
};
```

- **dodge/parry/block:** Base avoidance % at level 60
- **agiPerDodge:** Agility points needed for 1% dodge

#### Class Stat Formulas
```javascript
const classFormulas = {
    warrior: {
        apPerStr: 2,              // 1 Str = 2 AP
        apPerAgi: 0,              // Agi doesn't give AP
        rapPerAgi: 1,             // 1 Agi = 1 Ranged AP
        agiPerCrit: 20.0,         // 20 Agi = 1% crit
        intPerSpellCrit: 0,       // No spell crit from int
        baseCrit: 0.0,            // Base crit %
        baseSpellCrit: 0.0        // Base spell crit %
    },
    paladin: {
        apPerStr: 2,
        apPerAgi: 0,
        rapPerAgi: 0,
        agiPerCrit: 20.0,
        intPerSpellCrit: 29.5,    // 29.5 Int = 1% spell crit
        baseCrit: 0.7,            // 0.7% base crit
        baseSpellCrit: 2.3        // 2.3% base spell crit
    },
    // ... 9 classes total
};
```

**Key Class Differences:**
- **Warriors/Paladins:** 1 Str = 2 AP, 1 Agi = 0 AP
- **Rogues/Hunters:** 1 Str = 1 AP, 1 Agi = 1 AP
- **Druids (Cat Form):** Agi provides additional 1:1 AP bonus
- **Casters:** No melee AP from stats, only spell crit from int

---

### 2. Stat Aggregation (Lines 26-122)

**Purpose:** Combine stats from all sources before applying multipliers

#### Step 1: Base Stats from Race/Class
```javascript
const classBase = baseStats[selectedClass] || {};
const raceClassBase = classBase[selectedRace] || { sta: 0, agi: 0, str: 0, int: 0, spi: 0 };

let totalStamina = raceClassBase.sta || 0;
let totalAgility = raceClassBase.agi || 0;
let totalStrength = raceClassBase.str || 0;
let totalIntellect = raceClassBase.int || 0;
let totalSpirit = raceClassBase.spi || 0;
let totalHealth = classBase.baseHealth || 0;
let totalArmor = classBase.baseArmor || 0;
let totalDefense = (isPlateWearer || isMailWearer) ? 300 : 0;
```

**Base Stats Example (Orc Warrior):**
```javascript
{
    sta: 62,
    agi: 17,
    str: 123,
    int: 17,
    spi: 43,
    baseHealth: 3434,
    baseArmor: 0
}
```

#### Step 2: Handle "All Stats" Bonuses
```javascript
const allStatsBonus = (gearStats.allStats || 0) + (enchantStats.allStats || 0);
if (allStatsBonus > 0) {
    totalStamina += allStatsBonus;
    totalAgility += allStatsBonus;
    totalStrength += allStatsBonus;
    totalIntellect += allStatsBonus;
    totalSpirit += allStatsBonus;
}
```

**Example:** Blessing of Kings (+10% all stats) adds to all 5 stats

#### Step 3: Add Flat Stats from Gear/Enchants
```javascript
totalStamina += (gearStats.stamina || 0) + (enchantStats.stamina || 0);
totalAgility += (gearStats.agility || 0) + (enchantStats.agility || 0);
totalStrength += (gearStats.strength || 0) + (enchantStats.strength || 0);
totalIntellect += (gearStats.intellect || 0) + (enchantStats.intellect || 0);
totalSpirit += (gearStats.spirit || 0) + (enchantStats.spirit || 0);
totalHealth += (gearStats.health || 0) + (enchantStats.health || 0);
totalDefense += (gearStats.defense || 0) + (enchantStats.defense || 0);
```

#### Step 4: Handle Armor with Talent/Buff Multipliers
**CRITICAL ARMOR CALCULATION:**
```javascript
// Enchant armor is NOT affected by talent/buff multipliers
const enchantArmor = enchantStats.armor || 0;
const shieldArmor = offhandArmor || 0;
const nonShieldGearArmor = (gearStats.armor || 0) - shieldArmor;

// Get buff armor multiplier (e.g., Dire Bear Form +360%)
let buffArmorPercent = 0;
activeBuffs.forEach(buff => {
    buffArmorPercent += buff.armor_percent_from_gear_buff || 0;
});

// CRITICAL: Buff armor and talent armor are ADDITIVE, not multiplicative
// Formula: (gear × buff_mult) + (gear × talent_mult) + enchant
const buffBoostedArmor = (nonShieldGearArmor + shieldArmor) * buffArmorPercent;

const talentArmorPercent = (talentBonuses.armor_percent || 0) +
                          (talentBonuses.armor_percent_from_gear || 0);
const talentBoostedArmor = (nonShieldGearArmor + shieldArmor) * talentArmorPercent;

// Apply shield multiplier (e.g., Shaman Spirit Armor)
const shieldArmorMultiplier = talentBonuses.shield_armor_multiplier || 0;
const shieldBonusArmor = shieldArmor * shieldArmorMultiplier;

// Total armor = base + buff boost + talent boost + shield bonus + enchants
totalArmor += (nonShieldGearArmor + shieldArmor) + buffBoostedArmor +
              talentBoostedArmor + shieldBonusArmor + enchantArmor;
```

**Example (Dire Bear Druid with Thick Hide 3/3):**
- Base gear armor: 3000
- Dire Bear Form: +360% = +10,800 armor
- Thick Hide (3/3): +12% = +360 armor
- Total: 3000 + 10,800 + 360 = 14,160 armor

#### Step 5: Add Flat Stats from Buffs
```javascript
activeBuffs.forEach(buff => {
    totalStamina += buff.sta || 0;
    totalAgility += buff.agi || 0;
    totalStrength += buff.str || 0;
    totalIntellect += buff.int || 0;
    totalSpirit += buff.spi || 0;
    totalArmor += buff.armor || 0;

    // Health from buffs (with Dreamwalker 6-set bonus for Dire Bear)
    let healthFromBuff = buff.health || 0;
    if (buff.id === 'dire_bear_form' && setBonuses.bear_form_health_bonus) {
        healthFromBuff = healthFromBuff * (1 + setBonuses.bear_form_health_bonus);
    }
    totalHealth += healthFromBuff;

    totalDefense += buff.def || 0;
});
```

---

### 3. Percentage Multipliers (Lines 124-206)

**Purpose:** Apply percentage-based stat bonuses (floor after each application)

#### All-Stat Percentage (Blessing of Kings)
```javascript
if (talentBonuses.stat_percent_all || 0) {
    const multiplier = 1 + talentBonuses.stat_percent_all;  // e.g., 1.10 for +10%
    staminaMultiplier *= multiplier;
    totalStamina = Math.floor(totalStamina * multiplier);
    totalAgility = Math.floor(totalAgility * multiplier);
    totalStrength = Math.floor(totalStrength * multiplier);
    totalIntellect = Math.floor(totalIntellect * multiplier);
    totalSpirit = Math.floor(totalSpirit * multiplier);
}
```

**Important:** WoW uses `Math.floor()` (truncation), not rounding

#### Buff Percentage Multipliers
```javascript
activeBuffs.forEach(buff => {
    if (buff.stat_percent) {
        const multiplier = 1 + buff.stat_percent;
        staminaMultiplier *= multiplier;
        totalStamina = Math.floor(totalStamina * multiplier);
        // ... all other stats
    }
});
```

**Example:** Blessing of Kings (+10%) on 150 stamina:
```javascript
150 * 1.10 = 165.0 → Math.floor(165.0) = 165 stamina
```

#### Racial Percentage Bonuses
```javascript
if (racialBonuses.agi_percent) {
    totalAgility = Math.floor(totalAgility * (1 + racialBonuses.agi_percent));
}
if (racialBonuses.spi_percent) {
    totalSpirit = Math.floor(totalSpirit * (1 + racialBonuses.spi_percent));
}
```

**Example:** Tauren (+5% health) - applied later to final health

#### Individual Stat Percentage from Talents
```javascript
if (talentBonuses.str_percent) {
    totalStrength = Math.floor(totalStrength * (1 + talentBonuses.str_percent));
}
if (talentBonuses.agi_percent) {
    totalAgility = Math.floor(totalAgility * (1 + talentBonuses.agi_percent));
}
if (talentBonuses.sta_percent || talentBonuses.stamina_percent) {
    const staPercent = (talentBonuses.sta_percent || 0) + (talentBonuses.stamina_percent || 0);
    const multiplier = 1 + staPercent;
    staminaMultiplier *= multiplier;
    totalStamina = Math.floor(totalStamina * multiplier);
}
```

#### Form-Specific Bonuses (Heart of the Wild)
```javascript
const isInBearForm = activeBuffs.some(buff => buff.id === 'dire_bear_form');
const isInCatForm = activeBuffs.some(buff => buff.id === 'cat_form');

if (isInBearForm && talentBonuses.heart_of_wild_bear_sta_percent) {
    totalStamina = Math.floor(totalStamina * (1 + talentBonuses.heart_of_wild_bear_sta_percent));
}
if (isInCatForm && talentBonuses.heart_of_wild_cat_str_percent) {
    totalStrength = Math.floor(totalStrength * (1 + talentBonuses.heart_of_wild_cat_str_percent));
}
```

---

### 4. Health & Mana Calculation (Lines 208-238)

**Purpose:** Calculate final HP and mana from stats

#### Health Calculation
```javascript
// Base formula: HP = baseHealth + (stamina × 10)
totalHealth += totalStamina * 10;

// Apply percentage multipliers (racial + talent)
const hpPercentMultiplier = (1 + (racialBonuses.health_percent || 0)) *
                           (1 + (talentBonuses.health_percent || 0));
totalHealth = Math.floor(totalHealth * hpPercentMultiplier);

// Calculate HP per 1 stamina (for stat weights)
const hpPerStamina = staminaMultiplier * 10 * hpPercentMultiplier;
```

**Example (Tauren Druid with 200 stamina, +5% racial, +10% talent):**
```javascript
baseHealth = 2434
totalHealth = 2434 + (200 × 10) = 4434
hpPercentMultiplier = 1.05 × 1.10 = 1.155
totalHealth = Math.floor(4434 × 1.155) = 5121 HP
```

#### Mana Calculation
```javascript
let totalMana = classBase.baseMana || 0;
totalMana += totalIntellect * 15;  // 1 int = 15 mana

// Add flat mana from gear, enchants, buffs
totalMana += (gearStats.mana || 0) + (enchantStats.mana || 0);
activeBuffs.forEach(buff => {
    totalMana += buff.mana || 0;
});

totalMana = Math.floor(totalMana);
```

---

### 5. Attack Power Calculation (Lines 241-294)

**Purpose:** Calculate melee and ranged attack power

#### Base Attack Power by Class
```javascript
const playerLevel = 60;
let baseAP = 120;  // Default for Rogues, Hunters

if (selectedClass === 'warrior' || selectedClass === 'paladin') {
    baseAP = 160;
} else if (selectedClass === 'shaman') {
    baseAP = 100;
} else if (selectedClass === 'druid') {
    baseAP = -20;  // Druids have negative base AP (caster nature)
} else if (selectedClass === 'mage' || selectedClass === 'priest' || selectedClass === 'warlock') {
    baseAP = 0;    // Casters have no base melee AP
}
```

#### Attack Power from Stats
```javascript
let totalAttackPower = baseAP;

// Add AP from gear, enchants, talents
totalAttackPower += (gearStats.attackPower || 0) + (enchantStats.attackPower || 0) +
                   (talentBonuses.attackPower || 0);

// Add AP from buffs (with Stormcaller 5-piece bonus for Rockbiter)
activeBuffs.forEach(buff => {
    let apBonus = buff.ap || 0;

    if (buff.name === 'Rockbiter Weapon' && setBonuses.rockbiter_weapon_bonus) {
        apBonus = apBonus * (1 + setBonuses.rockbiter_weapon_bonus);
    }

    totalAttackPower += apBonus;
});

// Add AP from strength and agility
totalAttackPower += (formulas.apPerStr ? totalStrength * formulas.apPerStr : 0);
totalAttackPower += (formulas.apPerAgi ? totalAgility * formulas.apPerAgi : 0);
```

#### Percentage-Based AP Modifiers
```javascript
// Apply percentage-based AP modifiers (e.g. Trueshot Aura +5% AP)
let apPercentBonus = 0;
activeBuffs.forEach(buff => {
    apPercentBonus += buff.ap_percent || buff.base_stats?.ap_percent || 0;
});
apPercentBonus += talentBonuses.ap_percent || 0;
apPercentBonus += talentBonuses.predatory_strikes_ap_percent || 0;
if (apPercentBonus > 0) {
    totalAttackPower *= (1 + apPercentBonus);
}
```

#### Cat Form Bonus
```javascript
// Cat Form: Agility provides additional 1:1 AP bonus
activeBuffs.forEach(buff => {
    if (buff.agi_to_ap) {
        totalAttackPower += totalAgility * buff.agi_to_ap;
    }
});
```

#### Hunter Lightning Reflexes
```javascript
// Lightning Reflexes: +X% of Agility as melee AP (in addition to normal apPerAgi)
totalAttackPower += totalAgility * (talentBonuses.lightning_reflexes_melee_ap_from_agi_percent || 0);
```

#### Ranged Attack Power
```javascript
let totalRangedAttackPower = (formulas.rapPerAgi ? totalAgility * formulas.rapPerAgi : 0)
    + (gearStats.rangedAttackPower || 0) + (enchantStats.rangedAttackPower || 0);

activeBuffs.forEach(buff => {
    totalRangedAttackPower += (buff.rangedAttackPower || buff.rangedAP || 0);
});
```

---

### 6. Weapon Skill & Combat Stats (Lines 296-448)

**Purpose:** Calculate weapon skill, hit, crit, and weapon skill bonuses

#### Weapon Skill Calculation
```javascript
function calculateWeaponSkillForType(weaponType, isTwoHanded = false) {
    let skillValue = 300;  // Base weapon skill at level 60

    // Add weapon skill from gear, enchants, talents
    skillValue += (gearStats.weaponSkill || 0) + (enchantStats.weaponSkill || 0) +
                  (talentBonuses.weaponSkill || 0);

    // Add weapon skill from buffs (weapon masteries)
    activeBuffs.forEach(buff => {
        if (buff.weaponSkill && buff.weaponTypes) {
            if (buff.weaponTypes.includes(weaponType)) {
                skillValue += buff.weaponSkill || 0;
            }
        }
    });

    // Add racial weapon skill bonuses
    if (weaponType && racialBonuses) {
        if (!isTwoHanded) {
            // One-handed weapon skills
            if (weaponType === 'Sword' && racialBonuses.swordSkill) {
                skillValue += racialBonuses.swordSkill;
            } else if (weaponType === 'Mace' && racialBonuses.maceSkill) {
                skillValue += racialBonuses.maceSkill;
            }
            // ... etc for all weapon types
        }

        if (isTwoHanded) {
            // Two-handed weapon skills (can stack with one-handed for some races)
            if (weaponType === 'Sword' && racialBonuses.twoHandedSwordSkill) {
                skillValue += racialBonuses.twoHandedSwordSkill;
            }
            // ... etc
        }

        // Ranged weapon skills
        if (weaponType === 'Bow' && racialBonuses.bowSkill) {
            skillValue += racialBonuses.bowSkill;
        }
        // ... etc
    }

    // Set bonus weapon skill (Towerforge Battlegear 2pc: +6 Two-handed Maces)
    if (isTwoHanded && weaponTypeNormalized === 'mace' && setBonuses.towerforge_2pc_two_handed_maces) {
        skillValue += setBonuses.towerforge_2pc_two_handed_maces;
    }

    return skillValue;
}
```

**Weapon Skill for Dual Wield:**
```javascript
if (data.isDualWielding && data.mainhandWeaponType && data.offhandWeaponType) {
    mhWeaponSkill = calculateWeaponSkillForType(data.mainhandWeaponType, data.mainhandIsTwoHanded);
    ohWeaponSkill = calculateWeaponSkillForType(data.offhandWeaponType, data.offhandIsTwoHanded);
    totalWeaponSkill = mhWeaponSkill;  // Use mainhand as "total"
}
```

#### Weapon Skill Benefits (vs. Level 63 Boss)
```javascript
const weaponSkillOver300 = totalWeaponSkill - 300;
const weaponSkillHitBonus = weaponSkillOver300 * 0.2;    // 0.2% hit per skill point
const weaponSkillCritBonus = weaponSkillOver300 * 0.04;  // 0.04% crit per skill point

// Glancing blow damage: base 65%, +2% per skill, caps at 95% (15 skill)
const glancingSkillBonus = Math.min(15, weaponSkillOver300);
const glancingDamagePercent = 65 + (glancingSkillBonus * 2);

// Enemy dodge: 6.5% - (skill × 0.1%)
const enemyDodgeChance = Math.max(0, 6.5 - ((totalWeaponSkill - 300) * 0.1));
```

**Weapon Skill Benefits Table:**
```
Skill | Hit Bonus | Crit Bonus | Glancing Damage | Enemy Dodge
------|-----------|------------|-----------------|-------------
300   |    0%     |    0%      |      65%        |    6.5%
305   |   +1%     |  +0.2%     |      75%        |    6.0%
310   |   +2%     |  +0.4%     |      85%        |    5.5%
315   |   +3%     |  +0.6%     |      95%        |    5.0%
```

#### Crit Calculation
```javascript
// Base crit from gear, enchants, talents, buffs
const baseCrit = (formulas.baseCrit || 0) + (gearStats.crit || 0) +
                (enchantStats.crit || 0) + (talentBonuses.crit || 0) + buffCrit;

// Crit from agility
const agiCrit = (formulas.agiPerCrit > 0) ? totalAgility / formulas.agiPerCrit : 0;

// Total crit = base + agi + weapon skill
let totalCrit = baseCrit + agiCrit + weaponSkillCritBonus;
const mhCrit = baseCrit + agiCrit + mhWeaponSkillCritBonus;
const ohCrit = baseCrit + agiCrit + ohWeaponSkillCritBonus;
```

#### Spell Crit Calculation
```javascript
let totalSpellCrit = (formulas.baseSpellCrit || 0) + (gearStats.spellCrit || 0) +
                    (enchantStats.spellCrit || 0) + (talentBonuses.spellCrit || 0) + buffSpellCrit;

if (formulas.intPerSpellCrit > 0) {
    totalSpellCrit += totalIntellect / formulas.intPerSpellCrit;
}
```

#### Hit Calculation
```javascript
const baseHit = (gearStats.hit || 0) + (enchantStats.hit || 0) + (talentBonuses.hit || 0);
const totalHit = baseHit + weaponSkillHitBonus - dualWieldMissPenalty;
const mhHit = baseHit + mhWeaponSkillHitBonus - dualWieldMissPenalty;
const ohHit = baseHit + ohWeaponSkillHitBonus - dualWieldMissPenalty;
const rangedHit = baseHit + rangedWeaponSkillHitBonus;
```

**Note:** Dual wield miss penalty is set to 0 (not shown on character sheet)

---

### 7. Avoidance Calculation (Lines 450-493)

**Purpose:** Calculate dodge, parry, block, miss chance

#### Miss Chance (from Defense)
```javascript
const attackerWeaponSkill = attackerLevel * 5;  // 315 for level 63 boss
const defenseDifference = totalDefense - attackerWeaponSkill;
const defenseSkillModifier = defenseDifference * 0.04;  // 0.04% per point
const baseMissChance = 5.0;
const missChance = Math.max(0, baseMissChance + defenseSkillModifier);
```

**Example (300 defense vs. level 63 boss):**
```javascript
defenseDiff = 300 - 315 = -15
modifier = -15 × 0.04 = -0.6%
missChance = 5.0 - 0.6 = 4.4%
```

#### Dodge Calculation
```javascript
const avo = classAvoStats[selectedClass] || { dodge: 0, agiPerDodge: 20 };

let buffDodge = 0;
activeBuffs.forEach(buff => {
    buffDodge += buff.dodge || 0;
});

let totalDodge = (avo.dodge || 0) +                     // Base dodge
                (totalAgility / avo.agiPerDodge) +      // Agi dodge
                (gearStats.dodge || 0) +                // Gear dodge
                (enchantStats.dodge || 0) +             // Enchant dodge
                (talentBonuses.dodge || 0) +            // Talent dodge
                buffDodge +                              // Buff dodge
                (setBonuses.dodge || 0) +               // Set bonus dodge
                defenseSkillModifier;                    // Defense dodge

// Improved Primal Aspects (Hunter): +X% dodge when Aspect of the Monkey is active
if (selectedClass === 'hunter' && talentBonuses.improved_primal_aspects_dodge &&
    activeBuffs.some(b => b.id === 'aspectOfTheMonkey')) {
    totalDodge += talentBonuses.improved_primal_aspects_dodge;
}
```

#### Parry & Block
```javascript
let totalParry = (avo.parry || 0) + (gearStats.parry || 0) +
                (enchantStats.parry || 0) + (talentBonuses.parry || 0) +
                defenseSkillModifier;

let totalBlock = (avo.block || 0) + (gearStats.blockChance || 0) +
                (enchantStats.blockChance || 0) + (talentBonuses.blockChance || 0) +
                (setBonuses.blockChance || 0) + defenseSkillModifier;

// Add blockChance from buffs (e.g., Holy Shield)
activeBuffs.forEach(buff => {
    totalBlock += buff.blockChance || 0;
});

// Class restrictions
if (selectedClass === 'druid') {
    totalParry = 0;  // Druids cannot parry or block
    totalBlock = 0;
}
if (selectedClass === 'hunter') {
    totalBlock = 0;  // Hunters cannot block
}
// No shield equipped: block is 0% for all classes
if ((offhandArmor || 0) <= 0) {
    totalBlock = 0;
}
```

#### Total Mitigation (Avoidance)
```javascript
const totalMitigation = missChance + totalDodge + totalParry + totalBlock;
```

`missChance` is exported on the return object as **Chance to be Missed** in UI (nested under **Avoidance**). `totalMitigation` is shown as **Avoidance** (dodge + parry + block + miss).

---

### 8. Armor Damage Reduction & EHP (Lines 495-556)

**Purpose:** Calculate armor damage reduction and effective HP

#### Armor Damage Reduction (No Cap in Turtle WoW)
```javascript
// Turtle WoW: Armor cap removed, uses diminishing returns above 75%
// Formula: DR = armor / (armor + 400 + 85 × attackerLevel)
const armorDR = totalArmor / (totalArmor + 400 + 85 * attackerLevel);
const isArmorCapped = false;  // No longer capped
const cappedArmorDR = armorDR;  // Use uncapped value
```

**Example (10,000 armor vs. level 63 boss):**
```javascript
armorDR = 10000 / (10000 + 400 + 85 × 63)
        = 10000 / 15755
        = 0.6347 (63.47% DR)
```

#### Flat Damage Reduction
```javascript
// Elemental Weapons talent: -X% damage when Rockbiter is active
const hasRockbiter = activeBuffs.some(buff => buff.name === 'Rockbiter Weapon');
let elementalWeaponsDR = 0;

if (hasRockbiter) {
    elementalWeaponsDR = talentBonuses.elemental_weapons_rockbiter_dr || 0;

    // Apply Stormcaller 5-piece bonus multiplier
    if (setBonuses.rockbiter_weapon_bonus) {
        elementalWeaponsDR = elementalWeaponsDR * (1 + setBonuses.rockbiter_weapon_bonus);
    }
}

// Base set bonus DR (5% from Stormcaller 5-piece if Rockbiter active)
const baseSetDR = (setBonuses.all_damage_reduction_rockbiter && hasRockbiter)
    ? setBonuses.all_damage_reduction_rockbiter : 0;

// Buff DR (e.g., Righteous Fury + Righteous Defense)
let buffDR = 0;
activeBuffs.forEach(buff => {
    buffDR += buff.damageReduction_percent || 0;
});

// Flat damage reduction from buffs (applied BEFORE armor/DR)
let flatDamageReduction = 0;
activeBuffs.forEach(buff => {
    flatDamageReduction += buff.flatDamageReduction || 0;
});
```

#### Final Damage Taken & EHP
```javascript
// Combine all DR sources (multiplicative)
const finalDamageTaken = (1 - cappedArmorDR) * (1 - flatDRFromTalents) *
                        (1 - baseSetDR) * (1 - buffDR);
const totalDR = 1 - finalDamageTaken;

// Berserker Stance: +10% damage taken
const berserkerStance = activeBuffs.find(buff => buff.id === 'berserker_stance');
const damageTakenMultiplier = berserkerStance?.damageIncrease_percent
    ? (1 + berserkerStance.damageIncrease_percent) : 1.0;

// Effective HP
const effectiveHP = (totalHealth / (1 - totalDR)) / damageTakenMultiplier;
```

**Example (10,000 HP, 50% armor DR, 10% flat DR, no Berserker):**
```javascript
finalDamageTaken = (1 - 0.50) × (1 - 0.10) = 0.45
totalDR = 1 - 0.45 = 0.55 (55% total DR)
effectiveHP = 10000 / (1 - 0.55) / 1.0 = 10000 / 0.45 = 22,222 EHP
```

---

### 9. Resistances & Magic EHP (Lines 558-675)

**Purpose:** Calculate resistance stats and magic damage reduction

#### Resistance Aggregation
```javascript
let totalFireResist = (gearStats.fireResist || 0) + (enchantStats.fireResist || 0);
let totalNatureResist = (gearStats.natureResist || 0) + (enchantStats.natureResist || 0);
let totalFrostResist = (gearStats.frostResist || 0) + (enchantStats.frostResist || 0);
let totalShadowResist = (gearStats.shadowResist || 0) + (enchantStats.shadowResist || 0);
let totalArcaneResist = (gearStats.arcaneResist || 0) + (enchantStats.arcaneResist || 0);

// Add resistances from buffs
activeBuffs.forEach(buff => {
    totalFireResist += buff.fireResist || 0;
    totalNatureResist += buff.natureResist || 0;
    totalFrostResist += buff.frostResist || 0;
    totalShadowResist += buff.shadowResist || 0;
    totalArcaneResist += buff.arcaneResist || 0;
});

// Add all-resist bonus
const allResistBonus = (gearStats.allResist || 0) + (enchantStats.allResist || 0) +
                      (talentBonuses.allResist || 0);
if (allResistBonus > 0) {
    totalFireResist += allResistBonus;
    totalNatureResist += allResistBonus;
    totalFrostResist += allResistBonus;
    totalShadowResist += allResistBonus;
    totalArcaneResist += allResistBonus;
}
```

#### Resistance Damage Reduction
```javascript
// Resistance provides 0.238% DR per point, capped at 75% (315 resistance)
// Formula: DR = min(resistance × 0.00238, 0.75)
const resistanceDRMultiplier = 0.00238;
const maxResistanceDR = 0.75;

const fireDRFromResist = Math.min(totalFireResist * resistanceDRMultiplier, maxResistanceDR);
const natureDRFromResist = Math.min(totalNatureResist * resistanceDRMultiplier, maxResistanceDR);
const frostDRFromResist = Math.min(totalFrostResist * resistanceDRMultiplier, maxResistanceDR);
const shadowDRFromResist = Math.min(totalShadowResist * resistanceDRMultiplier, maxResistanceDR);
const arcaneDRFromResist = Math.min(totalArcaneResist * resistanceDRMultiplier, maxResistanceDR);
```

**Resistance DR Table:**
```
Resistance | DR %
-----------|------
0          |  0%
50         | 11.9%
100        | 23.8%
150        | 35.7%
200        | 47.6%
250        | 59.5%
300        | 71.4%
315        | 75.0% (cap)
```

#### Talent-Based Damage Reduction
```javascript
const fireDRFromTalents = talentBonuses.fire_dr || 0;
const natureDRFromTalents = talentBonuses.nature_dr || 0;
const frostDRFromTalents = talentBonuses.frost_dr || 0;
const shadowDRFromTalents = talentBonuses.shadow_dr || 0;
const arcaneDRFromTalents = talentBonuses.arcane_dr || 0;
const holyDRFromTalents = talentBonuses.holy_dr || 0;
const physicalDRFromTalents = talentBonuses.physical_dr || 0;
```

#### Total School DR (Multiplicative)
```javascript
// Total DR by school = resist DR × talent DR × flat DR × set DR × buff DR
const totalFireDR = 1 - ((1 - fireDRFromResist) × (1 - fireDRFromTalents) ×
                         (1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));

const totalNatureDR = 1 - ((1 - natureDRFromResist) × (1 - natureDRFromTalents) ×
                           (1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));

const totalFrostDR = 1 - ((1 - frostDRFromResist) × (1 - frostDRFromTalents) ×
                          (1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));

const totalShadowDR = 1 - ((1 - shadowDRFromResist) × (1 - shadowDRFromTalents) ×
                           (1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));

const totalArcaneDR = 1 - ((1 - arcaneDRFromResist) × (1 - arcaneDRFromTalents) ×
                           (1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));

const totalHolyDR = 1 - ((1 - 0) × (1 - holyDRFromTalents) ×
                         (1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));

// Baseline magic DR: shared modifiers only (no school resist or school-specific talent DR)
const magicDR = 1 - ((1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));

// Physical uses armor DR instead of resistance DR
const totalPhysicalDR = 1 - ((1 - cappedArmorDR) × (1 - physicalDRFromTalents) ×
                             (1 - flatDRFromTalents) × (1 - baseSetDR) × (1 - buffDR));
```

#### Magic Effective HP
```javascript
const fireEHP = (totalHealth / (1 - totalFireDR || 0.0001)) / damageTakenMultiplier;
const frostEHP = (totalHealth / (1 - totalFrostDR || 0.0001)) / damageTakenMultiplier;
const natureEHP = (totalHealth / (1 - totalNatureDR || 0.0001)) / damageTakenMultiplier;
const shadowEHP = (totalHealth / (1 - totalShadowDR || 0.0001)) / damageTakenMultiplier;
const arcaneEHP = (totalHealth / (1 - totalArcaneDR || 0.0001)) / damageTakenMultiplier;
const holyEHP = (totalHealth / (1 - totalHolyDR || 0.0001)) / damageTakenMultiplier;
```

---

### 10. Spell Damage & Other Offensive Stats (Lines 630-659, 677-745)

**Purpose:** Calculate spell damage, spell penetration, block value

#### Spell Damage by School
```javascript
// Add spell damage from buffs
let buffSpellDamage = 0;
let buffFireSpellDamage = 0;
let buffFrostSpellDamage = 0;
let buffNatureSpellDamage = 0;

activeBuffs.forEach(buff => {
    buffSpellDamage += buff.spellDamage || 0;
    buffFireSpellDamage += buff.fireSpellDamage || 0;
    buffFrostSpellDamage += buff.frostSpellDamage || 0;
    buffNatureSpellDamage += buff.natureSpellDamage || 0;
});

// Each school gets base spell damage + school-specific bonus
const baseSpellDamage = (gearStats.dmgAndHealing || 0) + (enchantStats.dmgAndHealing || 0) +
                       buffSpellDamage;

const fireDamage = baseSpellDamage + (gearStats.fireDamage || 0) +
                  (enchantStats.fireDamage || 0) + buffFireSpellDamage;

const frostDamage = baseSpellDamage + (gearStats.frostDamage || 0) +
                   (enchantStats.frostDamage || 0) + buffFrostSpellDamage;

const natureDamage = baseSpellDamage + (gearStats.natureDamage || 0) +
                    (enchantStats.natureDamage || 0) + buffNatureSpellDamage;

const shadowDamage = baseSpellDamage + (gearStats.shadowDamage || 0) +
                    (enchantStats.shadowDamage || 0);

const arcaneDamage = baseSpellDamage + (gearStats.arcaneDamage || 0) +
                    (enchantStats.arcaneDamage || 0);

const holyDamage = baseSpellDamage + (gearStats.holyDamage || 0) +
                  (enchantStats.holyDamage || 0);
```

#### Spell Penetration
```javascript
const spellPen = (gearStats.spellPen || 0) + (enchantStats.spellPen || 0) +
                (talentBonuses.spellPen || 0);
```

#### Block Value
```javascript
const blockValue = (selectedClass === 'druid' || selectedClass === 'hunter' ||
                   (offhandArmor || 0) <= 0) ? 0 : (() => {
    // Base block value = gear + enchants + set bonus + (strength / 20)
    const baseBlockValue = Math.floor((gearStats.blockValue || 0) +
                                     (enchantStats.blockValue || 0) +
                                     (setBonuses.blockValue || 0) +
                                     Math.floor(totalStrength / 20));

    // Apply talent multiplier
    let blockValueMultiplier = 1 + (talentBonuses.blockValue_percent || 0);

    // Apply buff multipliers (e.g., Stoneskin Totem with Enhancing Totems)
    activeBuffs.forEach(buff => {
        if (buff.blockValueMultiplier_percent) {
            blockValueMultiplier *= (1 + buff.blockValueMultiplier_percent);
        }
    });

    return Math.floor(baseBlockValue * blockValueMultiplier);
})();
```

**Example (200 strength, 50 gear block value, 30% talent, 30% buff):**
```javascript
baseBlockValue = 50 + 0 + 0 + Math.floor(200 / 20) = 50 + 10 = 60
blockValueMultiplier = (1 + 0.30) × (1 + 0.30) = 1.3 × 1.3 = 1.69
blockValue = Math.floor(60 × 1.69) = 101
```

---

## Return Object Structure

The `calculateEffectiveHealth()` function returns a comprehensive stats object with 48 properties:

```javascript
return {
    // Core Stats
    health: Math.floor(totalHealth),
    mana: totalMana,
    stamina: totalStamina,
    agility: totalAgility,
    strength: totalStrength,
    intellect: totalIntellect,
    spirit: totalSpirit,
    hpPerStamina: hpPerStamina,

    // Defensive Stats
    armor: Math.floor(totalArmor),
    dr: totalDR,
    ehp: Math.floor(effectiveHP),
    drCapped: isArmorCapped,
    defense: Math.floor(totalDefense),
    dodge: totalDodge,
    parry: totalParry,
    block: totalBlock,
    missChance: missChance,
    blockValue: blockValue,
    totalMitigation: totalMitigation,  // dodge + parry + block + miss

    // Resistances
    fireResist: totalFireResist,
    natureResist: totalNatureResist,
    frostResist: totalFrostResist,
    shadowResist: totalShadowResist,
    arcaneResist: totalArcaneResist,

    // School Damage Reduction
    magicDR,
    fireDR: totalFireDR,
    natureDR: totalNatureDR,
    frostDR: totalFrostDR,
    shadowDR: totalShadowDR,
    arcaneDR: totalArcaneDR,
    holyDR: totalHolyDR,
    physicalDR: totalPhysicalDR,

    // School EHP
    fireEHP: Math.floor(fireEHP),
    frostEHP: Math.floor(frostEHP),
    natureEHP: Math.floor(natureEHP),
    shadowEHP: Math.floor(shadowEHP),
    arcaneEHP: Math.floor(arcaneEHP),
    holyEHP: Math.floor(holyEHP),

    // Offensive Stats
    attackPower: Math.floor(totalAttackPower),
    druidAP: (gearStats.druidAP || 0) + (enchantStats.druidAP || 0),
    crit: totalCrit,
    hit: totalHit,
    haste: baseHaste,
    meleeHaste: baseHaste + (talentBonuses.swift_reflexes_melee_haste || 0),
    meleeHastePassive,  // gear + enchant + talent + UI buff haste (used by sim baseline)
    rangedCrit: totalCrit + (talentBonuses.rangedCrit || 0),
    rangedAttackPower: Math.floor(totalRangedAttackPower),
    rangedHit: rangedHit,
    ranged_weapon_damage_percent: talentBonuses.ranged_weapon_damage_percent || 0,

    // Weapon Skill
    weaponSkill: totalWeaponSkill,
    enemyDodgeChance: enemyDodgeChance,
    glancingDamage: glancingDamagePercent,
    mhWeaponSkill: mhWeaponSkill,
    ohWeaponSkill: ohWeaponSkill,
    mhCrit: mhCrit,
    ohCrit: ohCrit,
    mhHit: mhHit,
    ohHit: ohHit,
    mhEnemyDodgeChance: mhEnemyDodgeChance,
    ohEnemyDodgeChance: ohEnemyDodgeChance,

    // Spell Stats
    spellCrit: totalSpellCrit,
    spellHit: (gearStats.spellHit || 0) + (enchantStats.spellHit || 0) +
             (talentBonuses.spellHit || 0) + buffSpellHit,
    healing: (gearStats.healing || 0) + (enchantStats.healing || 0) +
            (activeBuffs.reduce((sum, buff) => sum + (buff.healing || 0), 0)),
    dmgAndHealing: (gearStats.dmgAndHealing || 0) + (enchantStats.dmgAndHealing || 0) +
                  (setBonuses.dmgAndHealing || 0),
    mp5: (gearStats.mp5 || 0) + (enchantStats.mp5 || 0) +
        (activeBuffs.reduce((sum, buff) => sum + (buff.mp5 || 0), 0)),
    fireDamage: fireDamage,
    frostDamage: frostDamage,
    natureDamage: natureDamage,
    shadowDamage: shadowDamage,
    arcaneDamage: arcaneDamage,
    holyDamage: holyDamage,
    spellPen: spellPen,

    // Misc Stats
    vampirism: (gearStats.vampirism || 0) + (enchantStats.vampirism || 0) + (setSheet.vampirism || 0),
    critDmgReduction: (gearStats.critDmgReduction || 0) + (enchantStats.critDmgReduction || 0),
    armorPen: (gearStats.armorPen || 0) + (enchantStats.armorPen || 0),
    // All `apVs*` keys from `AP_VS_GEAR_STAT_KEYS` (gear + enchant per key)
    ...apVsFromGear,
    fortune: (gearStats.fortune || 0) + (enchantStats.fortune || 0) + (talentBonuses.fortune || 0)
};
```

Situational melee AP (Sanctified, Beastslaying-style) is **not** folded into `attackPower` here; `app.js` and the shaman sim add the matching bonus when the DPS target boss `faction` matches (`getAttackPowerBonusVsCreatureType`, `getDpsSessionTargetFactionTag`). The stat sheet **Advanced Melee** block only shows `apVs*` rows when that bonus is **&gt; 0** on current gear.

---

## Usage Example

```javascript
import { calculateEffectiveHealth } from './modules/ui/calculator.js';

const data = {
    selectedClass: 'warrior',
    selectedRace: 'orc',
    attackerLevel: 63,
    gearStats: { sta: 100, agi: 50, armor: 5000, ... },
    enchantStats: { sta: 20, armor: 300, ... },
    talentBonuses: { sta_percent: 0.10, armor_percent: 0.12, ... },
    racialBonuses: { axeSkill: 5, ... },
    activeBuffs: [
        { name: 'Mark of the Wild', sta: 16, agi: 16, ... },
        { name: 'Battle Shout', ap: 290 }
    ],
    setBonuses: {},
    isDualWielding: false,
    mainhandWeaponType: 'Sword',
    offhandArmor: 2500,
    rangedWeaponType: null
};

const stats = calculateEffectiveHealth(data);

console.log('Health:', stats.health);
console.log('Armor:', stats.armor);
console.log('EHP:', stats.ehp);
console.log('Total DR:', (stats.dr * 100).toFixed(2) + '%');
console.log('Attack Power:', stats.attackPower);
console.log('Crit:', stats.crit.toFixed(2) + '%');
```

---

## Related Files

- **app.js** - Calls `calculateEffectiveHealth()` and displays results
- **races.js** - Provides `baseStats` for each class/race combo
- **talents_new.js** - Generates `talentBonuses` object
- **buffs.js** - Generates `activeBuffs` array
- **gear.js** - Aggregates `gearStats` from equipped items
- **enchants.js** - Aggregates `enchantStats` from enchants
- **setBonuses.js** - Generates `setBonuses` object
- **tankSimulator.js** - Uses stat totals for simulation
- **dps.js** - Uses stat totals for DPS simulation
