# modules/gear/enchants.js - Enchant Database

## Overview

`modules/gear/enchants.js` is a comprehensive database of all available enchants for each gear slot in World of Warcraft Classic. It contains enchant names, stat bonuses, descriptions, and effect IDs for tooltip integration. This file is primarily data-driven and used by the gear system, modal system, and calculation engine.

**File Size:** 2,886 lines of code
**Type:** ES6 Module (Export-only, data definition)
**Primary Use:** Enchant definitions and stat bonuses

---

## Structure

The file exports a single object `enchantDatabase` organized by equipment slot:

```javascript
export const enchantDatabase = {
    wrist: [...],      // Bracer enchants
    hands: [...],      // Glove enchants
    feet: [...],       // Boot enchants
    chest: [...],      // Chest enchants
    legs: [...],       // Leg enchants
    head: [...],       // Head enchants (primarily leg armor patches)
    back: [...],       // Cloak enchants
    mainhand: [...],   // Weapon enchants
    offhand: [...],    // Shield/off-hand enchants
    ranged: [...],     // Ranged weapon enchants (scopes)
    shoulder: [...],   // Shoulder enchants (Zandalar, Naxxramas)
    ring1: [...],      // Ring enchants (Engineering only)
    ring2: [...]       // Ring enchants (same as ring1)
}
```

---

## Enchant Object Structure

Each enchant is defined as an object with the following properties:

```javascript
{
    name: string,           // Display name (e.g., "Enchant Bracer - Greater Agility (+7 Agi)")
    stats: object,          // Stat bonuses { agi: 7, sta: 10, ... }
    description: string,    // Enchant description from game
    effect_id: number,      // Effect ID for tooltip lookups
    spellId: number,        // Optional: Spell ID for advanced lookups
    requiresItem: string,   // Optional: Item name requirement (e.g., "Smoking Heart of the Mountain")
    requiresItemType: string, // Optional: Item type requirement ("shield", "2h", "ranged")
    classes: string[],      // Optional: lowercase class ids when restricted (e.g. ["hunter"])
    tooltip_lines_raw: string[], // Optional: consumable tooltip; "Classes:" line used for filtering
    slot: string           // Optional: Slot override for multi-slot enchants
}
```

### Stat Keys

Common stat keys used in enchant objects:

| Key | Stat |
|-----|------|
| `sta` | Stamina |
| `agi` | Agility |
| `str` | Strength |
| `int` | Intellect |
| `spi` | Spirit |
| `def` | Defense |
| `armor` | Armor |
| `blockValue` | Block Value |
| `dmg` | Spell Damage |
| `healing` | Healing |
| `fireDamage` | Fire Spell Damage |
| `natureDamage` | Nature Spell Damage |
| `shadowDamage` | Shadow Spell Damage |
| `frostDamage` | Frost Spell Damage |
| `arcaneDamage` | Arcane Spell Damage |
| `ap` | Attack Power |
| `rangedAp` | Ranged Attack Power |
| `crit` | Crit Rating |
| `hit` | Hit Rating |
| `dodge` | Dodge Rating |
| `parry` | Parry Rating |
| `haste` | Haste Rating |
| `mp5` | Mana per 5 seconds |
| `fireResist` | Fire Resistance |
| `natureResist` | Nature Resistance |
| `frostResist` | Frost Resistance |
| `shadowResist` | Shadow Resistance |
| `arcaneResist` | Arcane Resistance |
| `allResist` | All Resistances |

---

## Enchant Categories by Slot

### Wrist (Bracers)
- Agility: +5, +7, +9
- Defense: +3, +5
- Intellect: +7
- Spirit: +7
- Stamina: +7, +9
- Strength: +5, +7, +9
- Spell Damage: +15
- Healing: +24
- Mana Regen: +4 MP5

### Hands (Gloves)
- Agility: +5, +7, +15, +20 (Naxx)
- Attack Power: +15, +26, +30
- Mining: +5 (increases Mining skill)
- Herbalism: +5 (increases Herbalism skill)
- Skinning: +5 (increases Skinning skill)
- Fishing: +5 (increases Fishing skill)
- Riding: +1% (mount speed)
- Threat: -2% (Subtlety)
- Fire Power: +20 (Fire damage)
- Frost Power: +20 (Frost damage)
- Shadow Power: +20 (Shadow damage)
- Healing: +30, +35

###Feet (Boots)
- Agility: +3, +5, +7, +9
- Spirit: +5, +7
- Stamina: +7
- Minor Speed: +8% run speed
- Defense: +7
- Surefooted: Minor run speed + reduce chance to be dazed

### Chest
- Stats: +3 All Stats, +4 All Stats
- Health: +50 HP, +100 HP, +150 HP, +200 HP
- Mana: +50 Mana, +100 Mana, +150 Mana
- Absorption: Absorb damage (varies)
- Resistance: +5 All Resistances, +7 All Resistances
- Agility: +3 Agility
- Spirit: +15 Spirit

### Legs
- Stamina: +10 Sta
- Armor Kits: +8 Def, +40 Armor, +16 Agi, etc.
- Spell Threads: +30 Dmg +10 Crit, +35 Healing +20 Sta

### Head
- Primarily leg armor patches (same as legs slot)
- Zandalar: +18 Sta +17 Agi, +16 Sta +100 Armor +8 Def
- Naxxramas: +8 All Stats +1% Dodge, etc.

### Back (Cloaks)
- Armor: +35, +50, +70
- Agility: +3, +5, +9, +12
- Defense: +3, +5, +7, +9
- Resistance: Fire/Nature/Frost/Shadow/Arcane +5, +7, +10, +15, +20
- Stealth: Subtlety (threat reduction)
- Dodge: +1% Dodge

### Shoulders
- Zandalar: Various class-specific enchants (+18 AP, +13 Agi, +18 Healing, etc.)
- Naxxramas: Various class-specific enchants (+15 Hit/Crit, +26 AP, etc.)
- Power: +5 All Resistances + +15 Spell Damage

### Mainhand/Offhand (Weapons)
- Agility: +15, +20, +25
- Strength: +9, +15, +20
- Weapon Damage: +2, +3, +4, +5, +6, +7 damage
- Weapon Skill: +5 to specific weapon types
- Crusader: Proc-based healing buff
- Fiery Weapon: Fire damage proc
- Lifestealing: Shadow damage + heal proc
- Spell Power: +22, +30 spell damage
- Healing: +55 healing
- Mongoose: Agility + haste proc (TBC)

### Ranged (Scopes)
- Damage: +3, +5, +7 damage
- Crit: +1%, +2%, +3% crit
- Hit: +1% hit
- Stamina: +3, +7 stamina
- Attack Power: +10, +28 ranged AP

---

## Special Enchants

### Shaman-Only
- **Smoking Heart of the Mountain** (requires item drop)
  - Rockbiter Weapon: +30% threat
  - All elemental resistances: +10

### Libram/Totem Head Enchants
- Class-specific head/leg enchants
- Applied in same slot as regular armor kits
- Examples: +8 All Stats, +100 Armor +8 Defense, etc.

### Engineering-Only
- Ring enchants (Engineering profession requirement)
- Special scope enchants

---

## Enchant picker categories (implemented)

The enchant modal (`modal.js` → `renderEnchants`) groups slot-filtered enchants into columns using **`modules/gear/enchantCategories.js`**. Class and item-type filtering (`filterEnchantsByClass`, `filterEnchantsByItemType`) run **before** categorization.

### Top-level columns

| Column | Sub-groups | Header color |
|--------|------------|--------------|
| **Offensive** | Phys, Spell | Red |
| **Defensive** | Phys, Spell | Blue |
| **Healing** | — | Green |
| **Utility** | — | Gold |
| **Other** | — | Gray (unclassified only; column hidden when empty) |

### Mapping rules (priority)

1. **`None`** — dedicated first row in the picker (not an Other-column item).
2. **Healing** — `stats.healing` or healing-focused name. Skipped when spell-damage keys dominate. **Hybrid healing + defense** (e.g. Syncretist's Sigil: `healing` + `sta`/`def`) → **Healing** when `healing` is present and no spell-damage keys.
3. **Offensive Phys** — `ap`, `attackPower`, `rap`, `rangedAttackPower`, `rangedDmg`, `str`, `agi`, `crit`, `hit`, `hitPercent`, `weaponDamage`, `armorPen`, `haste`, `vampirism`; proc names (Crusader, Fiery, Lifestealing, Demonslaying, etc.).
4. **Offensive Spell** — `dmgAndHealing`, school spell damage keys, `spellCrit`, `spellHit`, `spellPen`, `int`; names with spell power / fire-frost-shadow power.
5. **Defensive Phys** — `sta`, `armor`, `def`, `dodge`, `parry`, `blockValue`, `blockChance`, `health`; defense/stamina/block names.
6. **Defensive Spell** — `allResist`, school resist keys, `mana`, `mp5`, `manaRegen`; resistance/mana names.
7. **Utility** — `spi`; run/mount speed, riding, threat, subtlety, stealth, profession skills (mining, herbalism, fishing, skinning), belt buckles/spikes; lone `allStats`.
8. **Other** — no matching stats or name patterns.

Ties: highest score among buckets wins. Description text is **not** used for healing/offensive/defensive name patterns (avoids ZG leg/head flavor text false positives); utility patterns may use name + description.

### Sorting (within each bucket)

1. **Quality** — `q4` (legendary-tier names) down through `q0` (`getEnchantQualityClass`).
2. **Dominant stat** — highest absolute value among bucket-relevant keys in `enchant.stats` (e.g. `ap`, `dmgAndHealing`, `sta`).

### Other column visibility

- **Other** column renders only when at least one non-`None` enchant lands in `other`.
- When every enchant is classified elsewhere, **Other** is hidden and **`None`** stays in the top dedicated row.

### Related files

- **`enchantCategories.js`** — `getEnchantCategoryId`, `groupEnchantsByCategory`, column metadata
- **`enchantCategories.md`** — module API
- **`modal.js`** — picker UI
- **`style.css`** — `.enchant-picker-*` styles

---

## How the Data is Used

### 1. Modal System (modal.js)
**Enchant Selection Modal:**
```javascript
import { enchantDatabase } from './modules/gear/enchants.js';

function openEnchantModal(slotId) {
    const enchants = enchantDatabase[slotId] || [];
    // Display enchants in modal, filter by item type
}
```

### 2. Gear System (gear.js)
**Apply Enchant:**
```javascript
function applyEnchant(slotId, enchantIndex) {
    const enchant = enchantDatabase[slotId][enchantIndex];
    // Store selected enchant
    selectedEnchants[slotId] = enchant;
}
```

**Get Enchant Stats:**
```javascript
function getEnchantStats() {
    let totalStats = {};
    for (const [slot, enchant] of Object.entries(selectedEnchants)) {
        for (const [stat, value] of Object.entries(enchant.stats)) {
            totalStats[stat] = (totalStats[stat] || 0) + value;
        }
    }
    return totalStats;
}
```

### 3. Calculator (calculator.js)
**Stat Aggregation:**
```javascript
const enchantStats = getEnchantStats();
totalAgility += enchantStats.agi || 0;
totalStamina += enchantStats.sta || 0;
// ... etc
```

### 4. Comparison System (gearCompare.js)
**Enchant Dropdown Population:**
```javascript
function populateEnchantDropdown(dropdownId, slot, item) {
    const enchants = enchantDatabase[slot] || [];
    // Filter by item type (shield enchants only for shields, etc.)
    const filtered = filterEnchantsByItemType(enchants, item.type);
}
```

---

## Smart Filtering

Enchants are filtered based on equipped item type:

**Shield Enchants:**
- Only shown when shield is equipped
- Examples: +12 Block Value, +7 Stamina, +9 Defense

**2H Weapon Enchants:**
- Only shown for 2-handed weapons
- Higher stat bonuses than 1H enchants

**Ranged Weapon Enchants:**
- Only shown for bows/guns/crossbows
- Scopes with damage/crit/hit bonuses

**Item Type Detection:**
```javascript
// In stats.js
export function getItemType(item) {
    if (!item || !item.tooltip_lines_raw) return 'unknown';

    const lines = item.tooltip_lines_raw.map(l => l.toLowerCase());

    if (lines.includes('shield')) return 'shield';
    if (lines.includes('two-hand')) return '2h';
    if (lines.some(l => l.includes('bow') || l.includes('gun') || l.includes('crossbow'))) return 'ranged';

    return 'weapon'; // Default for 1H weapons
}
```

---

## How to Make Updates/Changes

### Adding a New Enchant

**Steps:**

1. **Find the appropriate slot** in `enchantDatabase`
2. **Add enchant object:**
   ```javascript
   {
       name: "Enchant Gloves - Superior Agility (+20 Agi)",
       stats: {
           agi: 20
       },
       description: "Permanently enchant gloves to give +20 Agility.",
       effect_id: 12345
   }
   ```
3. **Place in correct order** (typically by power level)
4. **Test in-game:** Equip item, open enchant modal, apply enchant

### Modifying Existing Enchant

**Example:** Change "Enchant Bracer - Greater Agility" from +7 to +9

1. Find enchant in `wrist` array
2. Change `stats: { agi: 7 }` to `stats: { agi: 9 }`
3. Update name: `"Enchant Bracer - Greater Agility (+9 Agi)"`
4. Test calculations

### Adding Item Type Restrictions

**Example:** Restrict enchant to shields only

```javascript
{
    name: "Enchant Shield - Greater Block (+12 Block Value)",
    stats: {
        blockValue: 12
    },
    description: "Permanently enchant a shield to give +12 Block Value.",
    effect_id: 9999,
    requiresItemType: "shield" // Only shown for shields
}
```

**Supported `requiresItemType` values:**
- `"shield"` - Shields only
- `"2h"` - Two-handed weapons only
- `"ranged"` - Ranged weapons only
- `"weapon"` - Any weapon (1H or 2H)

---

## Data Statistics

**Total Enchants:** ~200+

**Breakdown by Slot:**
- Wrist: ~15 enchants
- Hands: ~20 enchants
- Feet: ~12 enchants
- Chest: ~15 enchants
- Legs: ~10 enchants (armor kits + spell threads)
- Head: ~10 enchants
- Back: ~25 enchants
- Mainhand/Offhand: ~50 enchants
- Ranged: ~10 enchants
- Shoulders: ~15 enchants
- Rings: ~3 enchants (Engineering only)

---

## Related Files

- **`modules/gear/gear.js`** - Gear management, applies enchants; strip label via `enchantStatLabels.js`
- **`modules/ui/modal.js`** - Enchant selection modal UI
- **`modules/ui/calculator.js`** - Aggregates enchant stats for calculations
- **`modules/gear/gearCompare.js`** - Enchant comparison in gear comparison tool
- **`modules/character/stats.js`** - Item type detection and enchant filtering

---

## Known Issues / TODOs

1. **No validation** - Enchant data not validated at runtime
2. **Inconsistent naming** - Some enchants use "+X Stat" format, others don't
3. **Missing descriptions** - Some enchants lack descriptions
4. **No profession requirements** - Engineering ring enchants not enforced
5. **Duplicate entries** - Some enchants appear multiple times (ring1/ring2)

---

## Enchant labels (gear strip vs modal) — implemented

**Behavior:** The enchant picker **modal** (`modal.js`) shows the full **`enchant.name`**. The main **gear strip** (`gear.js` → `updateEnchantDisplay`) shows **`getEnchantCompactLabel(enchant)`** from **`enchantStatLabels.js`**: compact stat segments when `stats` has modeled non-zero values, else `shortName` or a stripped mechanic name (e.g. Crusader). Enchant **tooltips** use **`formatEnchantStatsHTML()`** from the same module so stat lines stay aligned with the data model.

See **`enchantStatLabels.md`** for exports and rules.

### Title audit: stats in `name` but missing numeric parenthetical

Automated check: `node scripts/audit-enchant-titles.mjs` — flags enchants with **non-empty modeled `stats`** whose `name` has **no digit inside `(...)`**. After shoulder fixes (Chromatic Mantle, Zandalar Mojo), expect **0** rows.

**Optional deeper pass:** Compare each enchant’s `stats` totals to the parenthetical in `name` (detect typos / wrong numbers) — not automated yet.

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Each enchant appears in correct slot modal
- [ ] Enchant stats apply correctly to totals
- [ ] Smart filtering works (shield enchants only for shields)
- [ ] Enchant tooltips display correctly
- [ ] Enchant selection persists across sessions
- [ ] Gear comparison shows enchant differences

---

## Architecture Philosophy

**enchants.js should:**
- ✅ Be a single source of truth for enchant data
- ✅ Use consistent stat key names
- ✅ Provide complete enchant information (name, stats, description, ID)
- ❌ NOT contain logic (pure data only)
- ❌ NOT contain UI code (delegate to modal.js)

**Future Refactoring Goals:**
1. Add JSON schema validation
2. Standardize enchant naming format
3. Add profession requirements
4. Remove duplicate entries (consolidate ring1/ring2)
5. Add enchant categories/tags
6. Extract to separate JSON file for easier editing
