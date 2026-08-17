# modules/gear/gear.js

Gear management module — handles equipping/unequipping items, computing aggregate gear stats, enchants, and the virtual stat weight item slot.

## Key Exports

| Function | Description |
|---|---|
| `equipItem(itemId, slotId)` | Equip an item by ID into a slot. Updates `equippedGear`, DOM icon, and fires `gearChanged` event. Requires DOM element `icon_frame_{slotId}`. |
| `clearItem(slotId)` | Remove item from slot. Clears `equippedGear` entry, enchant, and DOM. |
| `clearAllItems()` | Clear all equipped gear slots. |
| `getCurrentlyEquippedItem(slotId)` | Returns the full item object for a slot (via `itemLoader.getItemById`), with stats parsed from tooltip if missing. |
| `getItemsForSlot(slotId)` | Lazy-loads slot JSON via `itemLoader`. For **`offhand`**, merges **`offhand.json`** with **One-hand** (non-2H, non-ranged, non-relic) weapons from **`mainhand.json`** so the picker lists shields/frills and true 1H weapons. **Main Hand**–only DB rows stay mainhand-only. |
| `getGearStats()` | Aggregate raw stats from all equipped items (+ virtual stat weight item if set). Returns a `STAT_TEMPLATE`-shaped object. |
| `getEnchantStats()` | Aggregate raw stats from all applied enchants. |
| `getEquippedGear()` | Returns shallow copy of `equippedGear` map (`{ slotId: itemId }`). |
| `getEquippedGearObjects()` | Returns `{ slotId: itemObject }` for all equipped items. |
| `setEquippedGear(gear)` | Bulk-set `equippedGear` (used by profile load). |
| `setVirtualStatWeightItem(item)` | Set a virtual item whose stats are included in `getGearStats()`. Used by stat weight sims. |
| `clearVirtualStatWeightItem()` | Remove the virtual item. Always call after sim to avoid stale stats. |
| `getAllSpellStrikeSources()` | Scan equipped gear + enchants for "Adds X damage to weapon attacks" sources. |
| `getEmptySlotPlaceholderUrl(slotId, classId)` | Empty paperdoll icon URL. Ranged uses relic for druid/shaman/paladin; otherwise `inventoryslot_{slotIconMap}`. |
| `refreshEmptySlotPlaceholders(classId)` | Rewrites empty character-planner slot imgs; skips slots with equipped items. |
| `getItemById(itemId)` | Passthrough to `itemLoader.getItemById`. |
| `buildLocalWowIconPackUrl(iconRef)` | Local save-picker URL under `/assets/wow-icons/large/`. |
| `resolveGearPlanIconUrl(iconRef, size?)` | Gear plan stored icons: local pack; passes through assets/ and legacy URLs. |
| `buildChronicleIconUrl(iconRef)` | Builds `https://icons.chronicleclassic.com/turtle/{basename}.webp` from a basename or legacy URL. |
| `buildOctowowIconUrl(iconRef, size?)` | Fallback: `https://octowow.st/db/images/icons/{large\|medium}/{basename}.png`. |
| `resolveIconUrl(iconRef, size?)` | Preferred icon URL for items/UI: Chronicle turtle webp for game icons; passes through `assets/` paths. |
| `EMPTY_ENCHANT_ICON_URL` | Hardcoded zamimg URL for the **unequipped** enchant scroll (`.enchant-btn` default in `style.css`). Not passed through `resolveIconUrl`. Applied enchants use the gold scroll via `.is-enchanted` CSS (Chronicle/octowow `inv_scroll_05`). |
| `createIconImage(iconName, altText)` | Creates `<img>` using `resolveIconUrl` (fallback chain via `installIconLoadFallbacks`). |
| `installIconLoadFallbacks()` | Global capture-phase `error` listener: failed icons retry Chronicle → octowow → zamimg (last resort). |
| `applyEnchant(slotId, enchantIndex)` | Apply an enchant to a slot. |
| `getAppliedEnchant(slotId)` | Get the enchant currently applied to a slot. |

## Virtual Stat Weight Item

A module-scoped `_virtualStatWeightItem` variable allows the stat weight sim in `dps.js` to inject synthetic items whose stats flow through the full calculator pipeline:

1. `setVirtualStatWeightItem({ stats: { strength: 100 } })` — sets the virtual item.
2. `getGearStats()` includes the virtual item's stats alongside real gear.
3. `getFreshCalculatorTotals()` → `calculateEffectiveHealth()` applies all multipliers (Kings, Trueshot Aura, talents, etc.).
4. `createShamanStatsFromCharacter()` maps the totals into a `ShamanStats` object for the sim.
5. `clearVirtualStatWeightItem()` — removes the item after the sim.

The virtual item is **not** added to `equippedGear`, `getEquippedGearObjects()`, or the DOM. It does not trigger set bonuses, enchants, or UI updates.

## State

- `equippedGear` — `{ slotId: itemId }` map of currently equipped items.
- `selectedEnchants` — `{ slotId: enchantObj }` map of applied enchants.
- `_virtualStatWeightItem` — Temporary synthetic item for stat weight sims (null when inactive).

## Dependencies

- `itemLoader.js` — On-demand item loading from the database.
- `enchants.js` — Enchant database.
- `enchantStatLabels.js` — `getEnchantCompactLabel()` for `.enchant-name-display` and connector width in `updateEnchantDisplay`.
- `stats.js` — `STAT_TEMPLATE`, `KEY_MAP`, `parseStatsFromTooltip`, `parseSpellStrikeSourcesFromItem`.
