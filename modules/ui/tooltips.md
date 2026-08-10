# Tooltip System Documentation

## Overview

`modules/ui/tooltips.js` generates HTML tooltips for items and enchants. It is the single source of tooltip rendering used by the item modal, equipped gear hover, gear compare, and radial menu.

## Key Exports

### `createItemTooltipHTML(item, equippedGear)`
Builds the full HTML tooltip for an item, including:
- Quality-colored name with sim-star indicator for modeled procs
- Merged tooltip lines (Equip/Use/Set lines combined with their descriptions)
- Set bonus highlighting (green for active, gray for inactive)
- Slot + armor type on one line, weapon damage + speed on one line
- **DPS score** (`~X DPS` in gold) appended at the bottom when stat weights are available

### `createEnchantTooltipHTML(enchant)`
Builds a simpler tooltip for enchants, showing name, stat bonuses (via `formatEnchantStatsHTML` from `modules/gear/enchantStatLabels.js`), and source.

### `calculateItemDpsScore(item, statWeights)`
Computes an item's estimated DPS contribution from its parsed stats and current stat weights.

**Parameters:**
- `item` — Item object with `tooltip_lines_raw`
- `statWeights` — Array from `window.getStoredStatWeights()`, each with `key` and `statDps`

**Returns:** Numeric DPS score, or `null` if weights are unavailable.

**Stat key mapping** (tooltip stat key -> stat weight key):
| Tooltip Key | Weight Key | Meaning |
|---|---|---|
| `attackPower` | `ap` | Attack Power |
| `str` | `str` | Strength |
| `agi` | `agi` | Agility |
| `int` | `int` | Intellect |
| `dmgAndHealing` | `sp` | Spell Power |
| `fireDamage` | `fireSp` | Fire Spell Power |
| `natureDamage` | `natureSp` | Nature Spell Power |
| `crit` | `physCrit` | Physical Crit % |
| `spellCrit` | `spellCrit` | Spell Crit % |
| `hit` | `physHit` | Physical Hit % |
| `spellHit` | `spellHit` | Spell Hit % |
| `haste` | `haste` | Haste % |
| `armorPen` | `arp` | Armor Penetration |

Stats not in this mapping (stamina, spirit, defense, etc.) contribute 0 DPS.

**Weapon skill handling:** Items with `weaponSkillByType` (e.g., "Increased Axes +5") only contribute the `wepSkill` weight if the equipped mainhand weapon matches the skill type. `getWeaponSubtype()` reads the mainhand tooltip to determine the weapon type (e.g., "Axe", "Two-handed Mace"). A one-hand skill like "Axe" also matches "Two-handed Axe". Generic weapon skill (rare) always counts.

## Internal Functions

### `getWeaponSubtype(weaponItem)`
Extracts the weapon subtype string (e.g., `"Axe"`, `"Two-handed Mace"`) from a weapon item's `tooltip_lines_raw`. Returns `null` for non-weapons.

### `doesWeaponSkillMatch(skillType, equippedType)`
Checks if a weapon skill bonus type matches the equipped weapon. `"Axe"` matches both `"Axe"` and `"Two-handed Axe"`; `"Two-handed Axe"` only matches `"Two-handed Axe"`.

### `extractSetInfo(item, equippedGear)`
Determines which set pieces are equipped and which set bonuses are active, used for green/gray highlighting. The ★ on `(N) Set:` lines uses `setDatabase` entries whose `displayName` or `displayNameAliases` matches the tooltip set name, and only tiers with **`modeledInSim: true`** on the bonus object (not merely having `statsKey`).

### `setGetEquippedGear(fn)`
Injects the equipped-gear getter so tooltip rendering can access current gear without circular imports. Called once from `app.js`.

## Dependencies

- `parseStatsFromTooltip` from `modules/character/stats.js` (for DPS scoring)
- `isItemProcModeled` from `modules/gear/procs.js` (sim-star indicator)
- `setDatabase` from `modules/gear/setDatabase.js` (set bonus names)
- `window.getStoredStatWeights` from `modules/shaman/dps.js` (stat weights access)
