# modules/gear/enchantEffectIds.js - Enchant Effect ID Map

## Overview

Maps armory **effect_id** values (Chronicle `enchant_id`, Turtle `enchantments`) to enchant display names for `findEnchantIndexByEffectId`.

**Do not auto-regenerate this file** — add entries manually when new enchants are added to `enchants.js`.

## Key exports

- `enchantEffectIdMap` — `{ [effectId: string]: enchantName }`
- `getEnchantNameByEffectId(effectId)`
- `findEnchantIndexByEffectId(slot, effectId, enchantDatabase)` — used by armory import and build load

## Chronicle cutover notes

| Effect ID | Notes |
|-----------|--------|
| 464 | Chronicle Riding — **not** in map; remapped to **930** in `armoryImport.js` only |
| 931 | Minor Haste gloves — map entry (enchant in `enchants.js`) |
| 3004 | Gift of Ferocity (Druid head) — map entry |
| 3026 | Rockbiter weapon imbue — **removed** from map; import skips |
| 911, 856, 884, 908, 943, 463, 1704, 2463, 3057 | Vanilla enchants added to both `enchants.js` and this map |

`enchantSpellIds.js` is unused for armory import.

## Slot restrictions

`EFFECT_ID_SLOT_MAP` and `isEnchantValidForSlot` disambiguate shared effect IDs (armor kits, belt buckles vs gems, etc.).
