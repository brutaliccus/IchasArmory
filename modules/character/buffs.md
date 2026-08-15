# Buffs System Documentation

This document provides comprehensive documentation for the buff system in IchaCalc (`C:\dev\IchaCalc\modules\character\buffs.js`).

## Table of Contents
- [Overview](#overview)
- [Buff Categories](#buff-categories)
- [Buff Structure](#buff-structure)
- [Buff Stats and Effects](#buff-stats-and-effects)
- [Exclusivity Rules](#exclusivity-rules)
- [Improved Buffs](#improved-buffs)
- [Talent-Based Buffs](#talent-based-buffs)
- [Class-Specific Buffs](#class-specific-buffs)
- [UI Rendering](#ui-rendering)
- [Tooltip System](#tooltip-system)
- [Active Buff Retrieval](#active-buff-retrieval)
- [Adding New Buffs](#adding-new-buffs)
- [Modifying Existing Buffs](#modifying-existing-buffs)

## Overview

The buffs system manages all character buffs, raid buffs, consumables, and boss debuffs in IchaCalc. It handles:
- Buff data storage and organization
- UI rendering with categorized buff icons
- Tooltip generation with dynamic content
- Buff exclusivity rules (e.g., only one flask at a time)
- Improved buff detection (talent-based upgrades)
- Class-specific buff filtering
- Stat calculation from active buffs

## Buff Categories

Buffs are organized into several main categories:

### Personal Buffs
Character-specific buffs that only affect the player.

#### Weapon Imbues (`weaponImbues`)
Shaman weapon enchantments. Only one can be active at a time.
- **Exclusivity Group**: `weapon_imbue`
- **Class**: Shaman
- Examples: Rockbiter Weapon (+653 AP), Windfury Weapon (+333 AP), Flametongue Weapon, Frostbrand Weapon

#### Shields (`shields`)
Shaman elemental shields. Only one can be active at a time.
- **Exclusivity Group**: `shield`
- **Class**: Shaman
- Examples: Water Shield (+50 MP5), Lightning Shield (Nature damage)

#### Paladin Auras & Abilities (`paladinAuras`)
Paladin-specific auras and abilities.
- **Class**: Paladin
- Examples: Righteous Fury (threat + damage reduction via talent)

#### Shaman Totems (`shamanTotems`)
Personal shaman totems with unique effects.
- **Class**: Shaman
- Examples: Stoneskin Totem (flat damage reduction), Stoneclaw Totem (threat)

#### Hunter Aspects (`hunterAspects`)
Hunter aspect buffs. Only one can be active at a time.
- **Exclusivity Group**: `hunter_aspect`
- **Class**: Hunter
- Examples: Aspect of the Monkey (+8% dodge, improved by talents)

#### Warrior Stances (`warriorStances`)
Warrior stance buffs. Only one can be active at a time.
- **Exclusivity Group**: `warrior_stance`
- **Class**: Warrior
- Examples:
  - Battle Stance (no stats)
  - Defensive Stance (-10% damage taken, 0.9x damage dealt)
  - Berserker Stance (+10% damage taken, +3% crit)

#### Druid Forms (`druidForms`)
Druid shapeshifting forms. Only one can be active at a time.
- **Exclusivity Group**: `druid_form`
- **Class**: Druid
- Examples:
  - Cat Form (+120 AP, +1 AP per Agility)
  - Dire Bear Form (+180 AP, +360% armor from gear, +1240 health)
  - Moonkin Form (+360% armor from gear, +3% spell crit)

#### Druid Talent Buffs (`druidTalentBuffs`)
Talent-based druid buffs that require specific talents.
- **Class**: Druid
- Examples: Leader of the Pack (+3% crit, requires Feral Combat talent)

#### Mage Armor (`mageArmorBuffs`)
Mage armor spells. Only one can be active at a time.
- **Exclusivity Group**: `mage_armor`
- **Class**: Mage
- Examples: Ice Armor (+30% armor from gear, improved by Frost Warding talent)

#### Warlock Armor (`warlockArmorBuffs`)
Warlock armor spells. Only one can be active at a time.
- **Exclusivity Group**: `warlock_armor`
- **Class**: Warlock
- Examples: Demon Armor (+30% armor from gear, improved by Demonic Aegis talent)

#### Weapon Skill Books (`weaponMasteries`)
Permanent weapon skill increases from consumable books.
- **Effect**: +5 weapon skill for specific weapon type
- **Conditional**: Only applies when using the matching weapon type
- Examples: Mastery of Axes, Mastery of Swords, Mastery of Daggers

### Raid Buffs

#### Stat Buffs (`raidStatBuffs`)
Raid-wide buffs that increase primary stats, stamina, or intellect.
- Mark of the Wild (all stats, armor, resistances)
- Power Word: Fortitude (stamina)
- Grace of Air Totem (agility)
- Strength of Earth Totem (strength)
- Arcane Brilliance (intellect)
- Blessing of Kings (+10% all stats)
- Imp's Blood Pact (stamina)

#### Defensive Buffs (`raidDefensiveBuffs`)
Raid-wide defensive buffs.
- Devotion Aura (armor)
- Ancestral Healing (+25% armor for 15 sec)
- Proclaim Champion (-5% damage, +60 all resistances)
- Fire/Frost/Nature/Shadow Resistance Totems (+60 resistance)

#### Offensive Buffs (`raidOffensiveBuffs`)
Raid-wide offensive buffs.
- Battle Shout (attack power)
- Greater Blessing of Might (attack power)
- Leader of the Pack (+3% crit)
- Trueshot Aura (+5% AP + 55 flat AP)
- Emerald Blessing (+1% spell hit, +10% movement, +5% mana regen while casting)
- Moonkin Aura (+3% spell crit)
- Power of the Guardian (Spell Crit) (+2% spell crit, exclusive with other PotG)
- Power of the Guardian (Spell Damage) (+33 spell damage, exclusive with other PotG)
- Power of the Guardian (Haste) (+2% haste, exclusive with other PotG)
- Greater Blessing of Salvation (-25% threat)

### Consumables

#### Flasks (`flasks`)
Flask consumables. Only one can be active at a time.
- **Exclusivity Group**: `flask`
- Examples: Flask of the Titans (+1200 health), Flask of Supreme Power (+150 spell damage)

#### Battle Elixirs (`battleElixirs`)
Offensive elixir consumables. Multiple can be active.
- Examples: Elixir of the Mongoose (+25 agi, +2% crit), Greater Arcane Elixir (+35 spell damage), Elixir of Greater Frost Power (+40 frost spell damage, item id 55046)

#### Guardian Elixirs (`guardianElixirs`)
Defensive elixir consumables. Multiple can be active.
- Examples: Elixir of Fortitude (+120 health), Elixir of Superior Defense (+450 armor)

#### Concoctions (`concoctions`)
Special Turtle WoW consumables that combine multiple elixir effects.
- **Exclusivity**: When active, deactivates component elixirs
- Examples:
  - Emerald Mongoose: Combines Mongoose + Dreamshard (+25 agi, +2% crit, +2% spell crit, +15 spell damage)
  - Arcane Giant: Combines Giants + Greater Arcane (+25 str, +35 spell damage)
  - Dreamwater: Combines Winterfall Firewater + Dreamtonic (+35 AP, +35 spell damage)

#### Juju Buffs (`jujuBuffs`)
Zul'Gurub consumables.
- Examples: Juju Power (+30 str), Juju Might (+40 AP), Juju Flurry (+3% attack/casting speed for 20s, on-use via procs.js)

#### Blasted Lands Buffs (`blastedLandsBuffs`)
Blasted Lands NPC buffs. Only one can be active at a time.
- **Exclusivity Group**: `blasted_lands`
- Examples: R.O.I.D.S. (+25 str), Ground Scorpok Assay (+25 agi)

#### Food Buffs (`foodBuffs`)
Food consumables. Only one can be active at a time.
- **Exclusivity Group**: `food`
- Examples: Le Fishe Au Chocolat (+1% dodge, +4 defense), Dirge's Kickin' Chimaerok Chops (+25 sta)

#### Drinks (`drinks`)
Drink consumables with various exclusivity rules.
- Examples: Rumsey Rum Black Label (+15 sta), Medivh's Merlot (+25 sta), Winterfall Firewater (+35 AP)

#### Potions (`potions`)
Potion consumables.
- Examples: Greater Stoneshield Potion (handled via procs), Spirit of Zanza (+50 sta, +50 spi), Potion of Quickness (+5% haste for 30s, on-use via procs.js)
- Note: Consumable on-use haste effects (Potion of Quickness, Juju Flurry) use `base_stats: {}` with empty stats since the actual effect is handled by the proc system in the sim

#### Weapon Enhancements (`weaponEnhancements`)
Temporary weapon enhancements. Only one can be active at a time.
- **Exclusivity Group**: `weapon_enhancement`
- Examples: Elemental Sharpening Stone (+2% crit), Brilliant Wizard Oil (+36 spell damage, +1% spell crit)

### Boss Debuffs

#### Defensive Debuffs (`defensiveDebuffs`)
Debuffs that reduce boss damage output.
- Thunderfury (-20% attack speed, -25 nature resist)
- Thunderclap (-10% attack speed)
- Demoralizing Shout (reduces boss attack power)
- Demoralizing Roar (reduces boss attack power)

#### Offensive Debuffs (`offensiveDebuffs`)
Debuffs that increase player damage.
- Curse of the Elements (-75 fire/frost/arcane/shadow resist, +10% fire/frost damage)
- Sunder Armor (-2250 armor at 5 stacks)
- Expose Armor (-1700 armor, -2550 improved)
- Fire Vulnerability (+15% fire damage at 5 stacks)
- Winter's Chill (+10% crit chance for Frost spells vs the target via `enemyFrostSpellCritBonus`, applied as `stats.wintersChillFrostCritBonus` in DPS/sim)
- Nightfall (handled in simulation)
- Hemorrhage (handled in simulation)
- Faerie Fire (-505 armor)
- Curse of Recklessness (-640 armor)
- Armor Shatter (-300 armor from Annihilator)
- Shattered Armor (-250 armor)

## Buff Structure

Each buff object has the following structure:

```javascript
{
    id: 'unique_buff_id',              // Required: Unique identifier
    name: 'Display Name',               // Optional if spellId provided
    icon: 'url/to/icon.jpg',           // Optional if spellId provided
    spellId: 12345,                     // Optional: Spell ID for tooltip lookup
    itemId: 12345,                      // Optional: Item ID for tooltip lookup
    base_stats: { },                    // Required: Base stats object
    improved_stats: { },                // Optional: Improved stats (talent/rank upgrade)
    classes: ['warrior', 'shaman'],     // Optional: Class restrictions
    exclusiveGroup: 'group_name',       // Optional: Exclusivity group
    weaponTypes: ['Axe', 'Sword'],      // Optional: Weapon type restriction
    requiresTalent: {                   // Optional: Talent requirement
        tree: 'feralCombat',
        talentId: 25,
        minRanks: 1
    },
    tooltip: 'Custom tooltip text',     // Optional: Override tooltip
    getTalentBonus: (talentBonuses) => {}, // Optional: Dynamic talent bonus function
    getTooltip: (isImproved, talentBonuses) => {} // Optional: Dynamic tooltip function
}
```

### Key Properties

- **id**: Unique identifier used in HTML element IDs
- **name**: Display name shown in tooltips
- **icon**: URL to buff icon image
- **spellId**: Spell ID for looking up data in `spells.json`
- **itemId**: Item ID for looking up data in `no_slot.json`
- **base_stats**: Object containing base stat bonuses
- **improved_stats**: Object containing improved stat bonuses (when talent is taken)
- **classes**: Array of class names that can use this buff
- **exclusiveGroup**: String identifier for mutual exclusivity
- **weaponTypes**: Array of weapon types this buff applies to
- **requiresTalent**: Object specifying talent requirements
- **tooltip**: Custom tooltip text (overrides spell data)
- **getTalentBonus**: Function returning additional stats based on talents
- **getTooltip**: Function returning custom tooltip HTML

## Buff Stats and Effects

Buffs can provide a wide variety of stat bonuses. Here are the available stat keys:

### Primary Stats
- `sta` - Stamina
- `agi` - Agility
- `str` - Strength
- `int` - Intellect
- `spi` - Spirit
- `stat_percent` - Percentage increase to all stats (e.g., 0.10 for 10%)

### Secondary Stats
- `armor` - Flat armor bonus
- `armor_percent` - Percentage armor increase
- `armor_percent_from_gear_buff` - Percentage armor increase from gear only (Dire Bear, Moonkin, Ice Armor)
- `ap` - Attack Power
- `ap_percent` - Percentage attack power increase
- `rangedAP` - Ranged Attack Power
- `crit` - Melee/Ranged Crit Chance (percentage points)
- `spellCrit` - Spell Crit Chance (percentage points)
- `spellHit` - Spell Hit Chance (percentage points)
- `spellDamage` - Spell Damage
- `fireSpellDamage` - Fire Spell Damage
- `frostSpellDamage` - Frost Spell Damage
- `natureSpellDamage` - Nature Spell Damage
- `healing` - Healing Power
- `haste` - Haste (percentage points)
- `dodge` - Dodge Chance (percentage points)
- `def` - Defense Rating
- `blockChance` - Block Chance (percentage points)

### Resistances
- `fireResist` / `fireResistance` - Fire Resistance
- `frostResist` / `frostResistance` - Frost Resistance
- `natureResist` / `natureResistance` - Nature Resistance
- `shadowResist` / `shadowResistance` - Shadow Resistance
- `arcaneResist` / `arcaneResistance` - Arcane Resistance

### Special Stats
- `health` - Flat health bonus
- `mana` - Flat mana bonus
- `mp5` - Mana per 5 seconds
- `weaponSkill` - Weapon Skill
- `agi_to_ap` - Agility to Attack Power conversion ratio (Cat Form)
- `healthRegen` - Health Regeneration
- `fire_damage` - Fire damage on hit
- `frost_damage` - Frost damage on hit
- `nature_damage` - Nature damage when struck
- `flatDamageReduction` - Flat damage reduction before armor
- `damageReduction_percent` - Percentage damage reduction
- `damageIncrease_percent` - Percentage damage increase taken
- `damageModifier` - Damage dealt multiplier
- `threatReduction_percent` - Threat reduction percentage
- `blockValueMultiplier_percent` - Block value multiplier

### Boss Debuff Stats
- `enemyArmorReduction` - Armor reduction on target (negative value)
- `enemyFireResistReduction` - Fire resist reduction on target (negative value)
- `enemyFrostResistReduction` - Frost resist reduction on target (negative value)
- `enemyNatureResistReduction` - Nature resist reduction on target (negative value)
- `enemyShadowResistReduction` - Shadow resist reduction on target (negative value)
- `enemyArcaneResistReduction` - Arcane resist reduction on target (negative value)
- `enemyFireDamageIncrease` - Fire damage increase on target (percentage)
- `enemyFrostDamageIncrease` - Frost damage increase on target (percentage)
- `bossAttackPowerReduction` - Boss attack power reduction
- `attack_speed_reduction` - Attack speed slow (percentage)

### Stat Normalization

The system automatically normalizes resistance stat names:
- `fireResistance` → `fireResist`
- `stamina` → `sta`
- `agility` → `agi`
- `strength` → `str`
- `intellect` → `int`
- `spirit` → `spi`

This ensures consistency when retrieving active buffs.

## Exclusivity Rules

Many buffs belong to exclusivity groups, ensuring only one buff from that group can be active at a time.

### Standard Exclusivity Groups

When a buff is activated, all other buffs in the same `exclusiveGroup` are automatically deactivated.

Example groups:
- `weapon_imbue` - Shaman weapon imbues (Rockbiter, Windfury, Flametongue, Frostbrand)
- `shield` - Shaman shields (Water Shield, Lightning Shield)
- `flask` - Flasks (only one flask at a time)
- `food` - Food buffs (only one food at a time)
- `stamina_drink` - Stamina drinks (Rumsey Rum, Medivh's Merlot)
- `int_drink` - Intellect drinks
- `ap_buff` - Attack power buffs
- `str_buff` - Strength buffs
- `weapon_enhancement` - Weapon enhancements (sharpening stones, oils)
- `blasted_lands` - Blasted Lands buffs
- `druid_form` - Druid forms (Cat, Dire Bear, Moonkin)
- `hunter_aspect` - Hunter aspects
- `warrior_stance` - Warrior stances
- `mage_armor` - Mage armor spells
- `warlock_armor` - Warlock armor spells
- `resistance_aura` - Resistance totems/auras
- `armor_debuff` - Armor debuffs (Sunder Armor, Expose Armor)
- `armor_shatter_debuff` - Armor shatter debuffs (Annihilator, Shattered Armor)
- `attack_speed_debuff` - Attack speed debuffs (Thunderfury, Thunderclap)
- `demoralizing_debuff` - Demoralizing debuffs (Shout, Roar)

### Concoction Exclusivity

Concoctions have special exclusivity logic that deactivates their component elixirs:

```javascript
const concoctionRelationships = {
    'emerald_mongoose': ['mongoose', 'dreamshard'],
    'arcane_giant': ['giants', 'greater_arcane'],
    'dreamwater': ['winterfall_firewater', 'dreamtonic']
};
```

**Behavior**:
- Activating a concoction deactivates its component elixirs
- Activating a component elixir deactivates its matching concoction

Example: Activating "Emerald Mongoose" will deactivate "Elixir of the Mongoose" and "Dreamshard Elixir".

### Implementing Exclusivity

Exclusivity is handled automatically by the `handleBuffExclusivity(buffId)` function, which is called when a buff is activated.

## Improved Buffs

Many buffs have "improved" versions that provide better stats when the player has certain talents.

### Structure

```javascript
{
    id: 'motw',
    name: 'Mark of the Wild',
    base_stats: {
        sta: 12,
        agi: 12,
        // ...
    },
    improved_stats: {
        sta: 16,   // 12 + floor(12 * 0.35) = 16
        agi: 16,   // 35% talent bonus
        // ...
    }
}
```

### UI Indication

Buffs with `improved_stats` display a "+" toggle button in the UI. Clicking it:
1. Toggles the `is-improved` CSS class on the buff icon
2. Updates the tooltip to show improved values
3. Recalculates stats using `improved_stats` instead of `base_stats`

### Examples

- **Mark of the Wild**: Base +12 stats, Improved +16 stats (+35% from talent)
- **Power Word: Fortitude**: Base +54 sta, Improved +70 sta (+30% from talent)
- **Battle Shout**: Base +232 AP, Improved +290 AP (+25% from talent)
- **Grace of Air Totem**: Base +77 agi, Improved +96 agi (+25% from talent)
- **Expose Armor**: Base -1700 armor, Improved -2550 armor (+50% from talent)
- **Hemorrhage**: Base +2% physical damage, Improved +4% physical damage

## Talent-Based Buffs

Some buffs have dynamic stat bonuses based on talent points. These use the `getTalentBonus` function.

### Structure

```javascript
{
    id: 'stoneskinTotem',
    name: 'Stoneskin Totem',
    base_stats: {
        flatDamageReduction: 30
    },
    getTalentBonus: (talentBonuses) => {
        // Check talent points
        let enhancingTotemsRank = talentBonuses.enhancing_totems_rank || 0;

        if (enhancingTotemsRank === 0) {
            return {}; // No bonus
        }

        // Return additional stats
        const flatDRBonus = enhancingTotemsRank === 1 ? 15 : 30;
        const blockValueMultiplier = enhancingTotemsRank === 1 ? 0.15 : 0.30;

        return {
            flatDamageReduction: flatDRBonus,
            blockValueMultiplier_percent: blockValueMultiplier
        };
    }
}
```

### How It Works

1. The `getActiveBuffs()` function calls `getTalentBonus(talentBonuses)` for each active buff
2. The returned stats are merged with `base_stats` (or `improved_stats`)
3. Stat keys are normalized before being returned to the calculator

### Examples

**Stoneskin Totem**:
- Base: -30 flat damage reduction
- With Enhancing Totems Rank 1: -45 flat DR, +15% block value
- With Enhancing Totems Rank 2: -60 flat DR, +30% block value

**Ice Armor**:
- Base: +30% armor from gear
- With Frost Warding Rank 1: +45% armor from gear (+15% additional)
- With Frost Warding Rank 2: +60% armor from gear (+30% additional)

**Demon Armor**:
- Base: +30% armor from gear
- With Demonic Aegis Rank 1: +50% armor from gear (+20% additional)
- With Demonic Aegis Rank 2: +70% armor from gear (+40% additional)
- With Demonic Aegis Rank 3: +90% armor from gear (+60% additional)

**Righteous Fury**:
- Base: +60% threat from holy attacks
- With Righteous Defense talent: +60% threat and -3/6/10% damage taken (based on talent rank)

## Class-Specific Buffs

Buffs can be restricted to specific classes using the `classes` property.

### Structure

```javascript
{
    id: 'rockbiter',
    name: 'Rockbiter Weapon',
    classes: ['shaman'],
    base_stats: { ap: 653 }
}
```

### Filtering by Class

The `generateBuffIcons()` function filters buffs by class when rendering the UI:

```javascript
const filterByClass = (buffs) => buffs.filter(buff => {
    if (!buff.classes) return true; // No restriction
    if (!currentClass) return false; // No class selected
    return buff.classes.includes(currentClass);
});
```

### Examples

- **Shaman-only**: Weapon Imbues, Shields, Totems
- **Paladin-only**: Auras, Righteous Fury
- **Druid-only**: Forms, Leader of the Pack
- **Hunter-only**: Aspects
- **Warrior-only**: Stances
- **Mage-only**: Ice Armor
- **Warlock-only**: Demon Armor

## UI Rendering

The `generateBuffIcons(container, currentClass)` function renders all buff icons organized by category.

### Layout Structure

```
Buff Categories Container
├── Personal Buffs (Main Category)
│   ├── Weapon Imbues (Subcategory)
│   ├── Shields (Subcategory)
│   ├── Paladin Auras & Abilities (Subcategory)
│   ├── Shaman Totems (Subcategory)
│   ├── Hunter Aspects (Subcategory)
│   ├── Warrior Stances (Subcategory)
│   ├── Druid Forms (Subcategory)
│   ├── Druid Talent Abilities (Subcategory)
│   ├── Weapon Skill Books (Subcategory)
│   ├── Mage Armor (Subcategory)
│   └── Warlock Armor (Subcategory)
├── Raid Buffs (Main Category)
│   ├── Stat Buffs (Subcategory)
│   ├── Defensive Buffs (Subcategory)
│   └── Offensive Buffs (Subcategory)
├── Boss Debuffs (Main Category)
│   ├── Defensive Debuffs (Subcategory)
│   └── Offensive Debuffs (Subcategory)
└── Consumables (Main Category, 2-column layout)
    ├── Column 1
    │   ├── Flasks
    │   ├── Battle Elixirs
    │   ├── Guardian Elixirs
    │   ├── Concoctions
    │   └── Juju Buffs
    └── Column 2
        ├── Blasted Lands Buffs
        ├── Food
        ├── Drinks
        ├── Potions
        └── Weapon Enhancements
```

### Buff Icon HTML

Each buff icon is rendered with the following structure:

```html
<div class="buff-icon" id="buffId" data-buff-name="Buff Name">
    <img src="icon-url.jpg" alt="Buff Name">
    <div class="buff-upgrade-toggle">+</div> <!-- Only if improved_stats exists -->
</div>
```

### CSS Classes

- `.buff-icon` - Base buff icon container
- `.buff-icon.active` - Active buff (selected by user)
- `.buff-icon.is-improved` - Improved version of buff (toggled by "+" button)
- `.buff-category` - Buff subcategory container
- `.buff-category-header` - Subcategory title
- `.buff-main-category` - Main category container
- `.buff-main-header` - Main category title
- `.buff-upgrade-toggle` - "+" button for improved buffs

### Icon Loading

Icons are loaded from three sources:

1. **Direct URL**: If `icon` property is set, use it directly
2. **Spell ID**: If `spellId` is set, look up the spell in `spells.json` and construct icon URL
3. **Fallback**: Use a question mark placeholder icon

Example spell ID lookup:

```javascript
if (buff.spellId) {
    const spell = findSpellById(buff.spellId);
    if (spell && spell.icon) {
        iconUrl = `https://octowow.st/db/images/icons/large/${spell.icon.toLowerCase()}.png`;
    }
}
```

## Tooltip System

Tooltips are generated dynamically using multiple data sources.

### Tooltip Generation Priority

The `createBuffTooltipHTML(buff, isImproved)` function attempts to generate tooltips in this order:

1. **Custom `getTooltip` function** (for dynamic tooltips like Stoneskin Totem)
2. **Custom `tooltip` property** (for hardcoded text)
3. **Item data from `no_slot.json`** (for consumables)
4. **Custom tooltip from `customTooltips` object** (with placeholder replacement)
5. **Spell data from `spells.json`** (by spellId or name)
6. **Manual stat generation** (fallback)

### Custom Tooltips

Custom tooltips are defined in the `customTooltips` object and support placeholders:

```javascript
const customTooltips = {
    'Mark of the Wild': 'Increases armor by {armor}, all attributes by {sta} and resistances by {resist}.',
    'Battle Shout': 'The warrior shouts, increasing melee AP by {ap}. Lasts 120 sec.',
    // ...
};
```

**Placeholder Replacement**:
- `{armor}` → `stats.armor` value
- `{sta}` → `stats.sta` value
- `{ap}` → `stats.ap` value
- `{resist}` → `stats.fireResist` value (for Mark of the Wild)
- etc.

### Spell Data Tooltips

For buffs with `spellId`, the system:
1. Loads spell data from `spells.json`
2. Extracts `tooltip_html` from the spell
3. Cleans the HTML (removes reagent requirements, cast times, etc.)
4. Displays the cleaned tooltip

**Cleaning Process** (via `cleanTooltipHTML`):
- Remove the first table (rank, mana, cast time, etc.)
- Remove "Reagents:" lines
- Remove "Requires:" lines
- Remove tool requirement text

### Item Data Tooltips

For consumables, the system:
1. Loads item data from `no_slot.json`
2. Extracts `tooltip_lines_raw` from the item
3. Filters out unnecessary lines (Binds when picked up, Unique, Requires Level, etc.)
4. Converts time formats (e.g., "7200 sec" → "2 hours")
5. Displays the filtered lines

### Dynamic Tooltips

Some buffs have dynamic tooltips that change based on talents. These use the `getTooltip` function:

```javascript
{
    id: 'stoneskinTotem',
    getTooltip: (isImproved, talentBonuses) => {
        // Calculate damage reduction based on talent rank
        const totalDR = /* ... calculation ... */;

        // Return custom HTML
        return createGenericTooltip('Stoneskin Totem', [
            `Reduces damage taken by ${totalDR}`,
            'Lasts 2 min.'
        ], 2);
    }
}
```

### Tooltip Positioning

Buff icon tooltips use their own positioning relative to the icon. When a buff uses the shared **`#item-tooltip`** (item-style spell data), **`left` / `top`** are set in **viewport pixels** only, matching **`position: fixed`** on that element (same convention as `positionItemTooltipOnIcon` in `modules/ui/itemTooltipPosition.js`).

Tooltips are positioned dynamically to stay on screen:
- Default: Centered above the buff icon
- If no room above: Show below the icon
- If no room on left/right: Adjust horizontally
- If no room anywhere: Position at viewport edge

```javascript
// Position tooltip
let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
let top = rect.top - tooltipRect.height - offset;

// Keep on screen
if (left < offset) left = offset;
if (left + tooltipRect.width > window.innerWidth - offset) {
    left = window.innerWidth - tooltipRect.width - offset;
}
if (top < offset) {
    top = rect.bottom + offset; // Show below instead
}
```

## Bulk apply (presets)

### `applyBuffListToDom(buffList)`

Calls **`clearAllBuffsDebuffsInDom()`**, then for each `{ id, improved? }` enables the matching element and calls **`handleBuffExclusivity(id)`** so flasks, concoctions, and weapon imbues stay consistent. Used by shaman onboarding consume step and the Buffs tab hamburger menu (`app.js` + `shamanConsumePresets.js`).

### `clearAllBuffsDebuffsInDom()`

Removes `active` / `is-improved` from **every** `.buff-icon` in **`#buffs-list`** (consumables, raid buffs, personal class buffs, boss debuffs, weapon imbues, etc.). Wired to **`#shaman-clear-consumables-btn`** (“Clear all”) on the Buffs tab (shaman only). **`applyBuffListToDom`** calls this before applying a preset list.

## Active Buff Retrieval

The `getActiveBuffs(talentBonuses)` function retrieves all active buffs and their stats.

### Process

1. **Find Active Icons**: Query all `.buff-icon.active` elements
2. **Load Buff Data**: Find corresponding buff object by ID
3. **Weapon Mastery Check**: For weapon masteries, check if player has a matching weapon equipped
4. **Determine Stats**: Use `improved_stats` if `.is-improved` class is present, otherwise `base_stats`
5. **Apply Talent Bonuses**: Call `getTalentBonus(talentBonuses)` if defined
6. **Normalize Stats**: Convert resistance names (e.g., `fireResistance` → `fireResist`)
7. **Return Objects**: Return array of buff objects with name, id, and stats

### Return Format

```javascript
[
    {
        name: 'Mark of the Wild',
        id: 'motw',
        isImproved: true,
        sta: 16,
        agi: 16,
        str: 16,
        int: 16,
        spi: 16,
        armor: 384,
        fireResist: 27,
        // ...
    },
    {
        name: 'Battle Shout',
        id: 'battleShout',
        isImproved: false,
        ap: 232
    },
    // ...
]
```

### Weapon Mastery Logic

Weapon masteries only apply when the player has a matching weapon equipped:

```javascript
if (buff.weaponTypes) {
    const mainhand = getEquippedWeapon('mainhand');
    const offhand = getEquippedWeapon('offhand');
    const ranged = getEquippedWeapon('ranged');

    const hasMatchingWeapon = [mainhand?.weaponType, offhand?.weaponType, ranged?.weaponType]
        .some(weaponType => buff.weaponTypes.includes(weaponType));

    if (!hasMatchingWeapon) {
        return; // Skip this buff
    }
}
```

### Stat Normalization

The function normalizes stat names to ensure consistency:

```javascript
const resistanceNormalization = {
    fireResistance: 'fireResist',
    natureResistance: 'natureResist',
    frostResistance: 'frostResist',
    shadowResistance: 'shadowResist',
    arcaneResistance: 'arcaneResist',
    stamina: 'sta',
    agility: 'agi',
    strength: 'str',
    intellect: 'int',
    spirit: 'spi'
};
```

## Adding New Buffs

To add a new buff to the system:

### Step 1: Choose the Appropriate Category

Determine which category your buff belongs to:
- Personal Buffs: `weaponImbues`, `shields`, `paladinAuras`, `shamanTotems`, `hunterAspects`, `warriorStances`, `druidForms`, `druidTalentBuffs`, `mageArmorBuffs`, `warlockArmorBuffs`, `weaponMasteries`
- Raid Buffs: `raidStatBuffs`, `raidDefensiveBuffs`, `raidOffensiveBuffs`
- Consumables: `flasks`, `battleElixirs`, `guardianElixirs`, `concoctions`, `jujuBuffs`, `blastedLandsBuffs`, `foodBuffs`, `drinks`, `potions`, `weaponEnhancements`
- Boss Debuffs: `defensiveDebuffs`, `offensiveDebuffs`

### Step 2: Create the Buff Object

```javascript
export const yourCategory = [
    // ... existing buffs ...
    {
        id: 'uniqueId',                     // Required: Unique identifier
        name: 'Buff Name',                  // Optional if using spellId
        icon: 'path/to/icon.jpg',          // Optional if using spellId
        spellId: 12345,                     // Optional: For spell data lookup
        base_stats: {                       // Required: Base stats
            sta: 50,
            armor: 500
        },
        improved_stats: {                   // Optional: Improved stats
            sta: 65,
            armor: 625
        },
        classes: ['warrior', 'paladin'],    // Optional: Class restriction
        exclusiveGroup: 'group_name',       // Optional: Exclusivity group
        weaponTypes: ['Axe', 'Sword'],      // Optional: Weapon type restriction
        requiresTalent: {                   // Optional: Talent requirement
            tree: 'protection',
            talentId: 10,
            minRanks: 1
        },
        tooltip: 'Custom tooltip text',     // Optional: Override tooltip
        getTalentBonus: (talentBonuses) => {  // Optional: Talent bonus function
            // Return additional stats based on talents
            return {};
        }
    }
];
```

### Step 3: Add Custom Tooltip (Optional)

If you want a custom tooltip with placeholders:

```javascript
const customTooltips = {
    // ... existing tooltips ...
    'Your Buff Name': 'Increases armor by {armor} and stamina by {sta} for 30 min.'
};
```

### Step 4: Test the Buff

1. Reload the page
2. Select the appropriate class (if class-restricted)
3. Find your buff in the UI
4. Click to activate it
5. Verify the tooltip displays correctly
6. Check that stats are applied correctly in the calculator

### Example: Adding a New Food Buff

```javascript
export const foodBuffs = [
    // ... existing food buffs ...
    {
        id: 'spicy_stew',
        name: 'Spicy Dragon Stew',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_food_70.png',
        base_stats: {
            sta: 30,
            armor: 200
        },
        exclusiveGroup: 'food'  // Only one food buff at a time
    }
];
```

## Modifying Existing Buffs

To modify an existing buff:

### Step 1: Locate the Buff

Find the buff in the appropriate category array. Use the buff's `id` or `name` to search:

```javascript
// Example: Modifying Mark of the Wild
export const raidStatBuffs = [
    {
        id: 'motw',
        name: 'Mark of the Wild',
        // ...
    },
    // ...
];
```

### Step 2: Update Properties

Modify the properties you want to change:

```javascript
{
    id: 'motw',
    name: 'Mark of the Wild',
    icon: 'assets/icons/motw.jpg',
    base_stats: {
        sta: 15,        // Changed from 12
        agi: 15,        // Changed from 12
        str: 15,        // Changed from 12
        int: 15,        // Changed from 12
        spi: 15,        // Changed from 12
        armor: 300,     // Changed from 285
        // ... rest of stats ...
    },
    improved_stats: {
        sta: 20,        // Update accordingly
        // ... rest of improved stats ...
    }
}
```

### Step 3: Update Tooltip (If Needed)

If you changed stat values and have a custom tooltip:

```javascript
const customTooltips = {
    'Mark of the Wild': 'Increases armor by {armor}, all attributes by {sta} and resistances by {resist} for 30 min.'
    // Placeholders will automatically use new stat values
};
```

### Step 4: Test the Changes

1. Reload the page
2. Activate the buff
3. Verify the tooltip shows updated values
4. Check that the calculator applies the new stats correctly

### Common Modifications

**Change Stat Values**:
```javascript
base_stats: {
    sta: 60  // Changed from 54
}
```

**Add New Stats**:
```javascript
base_stats: {
    sta: 54,
    armor: 500  // New stat
}
```

**Change Exclusivity Group**:
```javascript
exclusiveGroup: 'new_group_name'
```

**Add Improved Version**:
```javascript
improved_stats: {
    sta: 70  // 54 + 30% talent bonus
}
```

**Add Class Restriction**:
```javascript
classes: ['warrior', 'paladin']
```

**Add Talent Bonus Function**:
```javascript
getTalentBonus: (talentBonuses) => {
    const talentRank = talentBonuses.your_talent_rank || 0;
    if (talentRank === 0) return {};

    return {
        armor: talentRank * 100  // +100 armor per talent rank
    };
}
```

## Best Practices

1. **Use Spell IDs**: When possible, use `spellId` to automatically load icons and tooltips from `spells.json`
2. **Consistent Naming**: Use lowercase IDs with underscores (e.g., `battle_shout`, `motw`)
3. **Stat Keys**: Use standardized stat keys documented in the "Buff Stats and Effects" section
4. **Exclusivity**: Always define `exclusiveGroup` for mutually exclusive buffs
5. **Class Restrictions**: Always specify `classes` array for class-specific buffs
6. **Improved Versions**: Calculate improved stats correctly based on talent bonuses (e.g., +35% = base × 1.35)
7. **Tooltips**: Prefer spell data or item data over custom tooltips when possible
8. **Testing**: Always test new buffs with different talent configurations
9. **Documentation**: Update this documentation when adding new stat keys or features

## Data Loading

The buff system loads external data from two sources:

### spells.json
- **Location**: `/assets/spells.json`
- **Purpose**: Spell data for tooltips and icons
- **Loaded by**: `loadSpells()` function
- **Cached**: Yes (in `spellsData` variable)

### no_slot.json
- **Location**: `/data/items/no_slot.json`
- **Purpose**: Consumable item data for tooltips
- **Loaded by**: `loadNoSlotItems()` function
- **Cached**: Yes (in `noSlotData` variable)

Both data sources are loaded asynchronously when `generateBuffIcons()` is called.

## Event Handling

The buff system attaches event listeners for:

### Tooltip Events
- `mouseenter` - Show tooltip
- `mouseleave` - Hide tooltip
- Positioning is calculated dynamically to keep tooltip on screen

### Click Events
- Activate/deactivate buff
- Toggle improved state (for buffs with `improved_stats`)
- Handle exclusivity (deactivate conflicting buffs)
- Update tooltip when improved state changes

### Custom Events
Buffs can trigger custom events for integration with other systems (e.g., recalculate stats when a buff is toggled).

## Conclusion

The buff system is a comprehensive and flexible system for managing all types of buffs, consumables, and debuffs in IchaCalc. By following this documentation, you can easily add new buffs, modify existing ones, and understand how the system works internally.

For questions or issues, refer to the inline comments in `C:\dev\IchaCalc\modules\character\buffs.js`.
