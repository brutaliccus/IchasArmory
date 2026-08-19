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
- **DPS score** (`~X DPS` in gold) appended at the bottom when stat weights are available (Gear Planner mode uses GP-generated weights via `getActiveItemScoreWeights()`)

### `getActiveItemScoreWeights()`
Returns `{ dps, tank }` for tooltip/modal scores. In Gear Planner mode, reads `getGearPlannerDpsStatWeights` / `getGearPlannerTankStatWeights` only (does not fall back to Character Planner weights).

### `createEnchantTooltipHTML(enchant)`
Builds a simpler tooltip for enchants, showing name, stat bonuses (via `formatEnchantStatsHTML` from `modules/gear/enchantStatLabels.js`), and source.

### `calculateItemDpsScore(item, statWeights, equippedGear?, targetSlot?)`
Computes an item's estimated DPS contribution from its parsed stats and current stat weights.

**Parameters:**
- `item` — Item object with `tooltip_lines_raw`
- `statWeights` — Array from `window.getStoredStatWeights()`, each with `key` and `statDps`
- `equippedGear` — Optional `{slot: item}` snapshot for weapon-skill matching and weapon swap baseline (Gear Planner passes its plan snapshot)
- `targetSlot` — Optional picker slot (`mainhand` / `offhand`); defaults to mainhand for one-hand weapons, always mainhand for two-hand

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

**Weapon physical-output delta (not listed tooltip DPS):** For weapons with damage/speed lines, the score adds the **change in physical output** when equipping that weapon vs the current weapon in the target slot — not the item's listed `(X damage per second)` line.

- **Shaman:** Uses `damageCalc.js` `calculateSpellDPS` for weapon-scaling abilities: Auto Attack, Stormstrike, Lightning Strike, and Windfury Attack (when Windfury is active). Weapon effective damage follows the same `(base + AP/14 × speed) × talent multiplier` model as the character sheet and sim (`getEffectiveWeaponDamage` in `damageCalc.js`). Delta = sum of those ability DPS with the candidate weapon − sum with the current weapon. If no weapon is equipped in that slot, delta = full output of the new weapon.
- **Other classes:** Uses the character-sheet white-hit formula from `app.js` `displayMainResults`: `((min+max)/2) / hastedSpeed` where `min/max = floor/ceil((weapon base + AP/14 × speed) × weaponDamageMultiplier)`. Off-hand picks apply the 50% off-hand penalty (plus Savage Strikes when talented).

Weapon base damage/speed are **never** multiplied by stat weights directly (avoids double-counting with AP and naïve listed DPS).

### `calculateItemTankScore(item, tankWeights)`
Returns `{ ehp, mitScore, tankScore }` where `tankScore = ehp + mitScore` (stamina/armor vs mitigation stats).

### `formatItemTankScoreBadge(tank)`
Compact label for GP slot cards: `Tank score: X (EHP Y · MIT Z)`.

**Weapon skill handling:** Items with `weaponSkillByType` (e.g., "Increased Two-handed Maces +5") contribute `skillValue × wepSkill` when the skill type strictly matches the scored item's weapon subtype and/or the equipped mainhand (`getWeaponSkillMatchTypes()`). Matching uses `canonicalWeaponSkillType()` so plural tooltip lines (`Maces`) align with equipped subtypes (`Two-handed Mace`). Weapons in the item picker count their own type even when not equipped yet. Armor uses the equipped mainhand from the passed `equippedGear` snapshot, `setGetEquippedGear` callback, or `getCurrentlyEquippedItem` (Gear Planner passes its plan snapshot). One-handed and two-handed skills are separate in Classic (e.g. "Axe" does not match "Two-handed Axe"). Generic `Two-handed Weapon` skill matches any equipped two-handed subtype. Generic weapon skill (rare) always counts.

## Internal Functions

### `getWeaponSubtype(weaponItem)`
Extracts the weapon subtype string (e.g., `"Axe"`, `"Two-handed Mace"`) from a weapon item's `tooltip_lines_raw`. Returns `null` for non-weapons.

### `getWeaponSkillMatchTypes(item)`
Returns a `Set` of weapon subtypes for typed weapon-skill scoring: the item's own subtype when it is a weapon, plus the equipped mainhand subtype when present.

### `computeWeaponPhysicalOutputDelta(item, equippedGear, targetSlot?)`
Core weapon swap delta used by `calculateItemDpsScore`. See weapon section above.

### `computeSheetWeaponDps(weaponItem, context)`
Character-sheet white DPS for one weapon (`app.js` formula).

### `doesWeaponSkillMatch(skillType, weaponType)`
Checks if a weapon skill bonus type matches a weapon subtype via `canonicalWeaponSkillType()`. Strict 1H≠2H; `"Two-handed Weapon"` matches any `"Two-handed …"` equipped subtype.

### `extractSetInfo(item, equippedGear)`
Determines which set pieces are equipped and which set bonuses are active, used for green/gray highlighting. The ★ on `(N) Set:` lines uses `setDatabase` entries whose `displayName` or `displayNameAliases` matches the tooltip set name, and only tiers with **`modeledInSim: true`** on the bonus object (not merely having `statsKey`).

### `setGetEquippedGear(fn)`
Injects the equipped-gear getter so tooltip rendering can access current gear without circular imports. Called once from `app.js`.

## Dependencies

- `parseStatsFromTooltip` from `modules/character/stats.js` (for DPS scoring)
- `calculateEffectiveHealth` from `modules/ui/calculator.js` (weapon-swap baseline totals)
- `calculateSpellDPS` from `modules/shaman/damageCalc.js` (Shaman weapon-scaling ability DPS)
- `shamanSpells` from `modules/shaman/spells.js`
- `isItemProcModeled` from `modules/gear/procs.js` (sim-star indicator)
- `setDatabase` from `modules/gear/setDatabase.js` (set bonus names)
- `window.getStoredStatWeights` from `modules/shaman/dps.js` (stat weights access)
- `window.getFreshCalculatorTotals` from `app.js` (Character Planner totals for weapon context)
