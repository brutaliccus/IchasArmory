# modules/armory/armoryImport.js - Shared Armory Import Pipeline

## Overview

Single client-side pipeline for Chronicle (and Turtle rollback) armory imports. **Character Planner** and **Gear Planner** both call this module; only the apply hooks differ.

## Exports

| Export | Purpose |
|--------|---------|
| `getArmoryProxyURL()` | Resolves `/api/armory` proxy base URL |
| `fetchArmoryData(name, server)` | `GET /api/armory` → parsed JSON |
| `applyArmoryEquipment(equipment, hooks)` | Equip items + enchants via callbacks |
| `resolveArmoryEquipmentSlot(item, dbItem, state)` | Slot resolution (server `slot` hint or legacy inventory type) |
| `remapArmoryEnchantEffectId(id)` | Chronicle alias `464→930`; skip Rockbiter `3026` |
| `CHRONICLE_ENCHANT_ALIASES` | Armory-only effect ID remap table |
| `CHRONICLE_REALM_OPTIONS` | Realm dropdown values for Chronicle |
| `decodeChronicleTalents(class, payload)` | Chronicle `talents.trees[].ranks` → `{ "treeKey-id": points }` |
| `applyArmoryTalents(class, payload, root, opts)` | Reset tree, apply spec, `updateAllTalentStates`; optional buff regen |
| `CHRONICLE_ONLY_TALENT_IDS` | Deprecated empty map; rank strings align 1:1 with IchaCalc tree-local ids |

## Enchant handling

1. Chronicle `gear[].enchant_id` is an **effect_id** (same as Turtle `enchantments`).
2. `remapArmoryEnchantEffectId` runs **before** `findEnchantIndexByEffectId` (preserves existing lookup behavior).
3. Effect `3026` (Rockbiter weapon imbue) is skipped with a console warning — not mapped to boots.

## Apply hooks

**Character Planner** (`armory.js`):

- `onEquip` → `equipItem(itemId, slot)` (gear strip)
- `onEnchant` → `applyEnchant(slot, index)`

**Gear Planner** (`gearPlannerView.js`):

- `onEquip` → `currentPlan.slots[slot].primary = itemId`
- `onEnchant` → `currentPlan.slots[slot].enchant = index`

Both preload item JSON via `itemLoader` before applying rows.

## Talent handling

Chronicle returns:

```json
"talents": { "trees": [{ "points_spent": 37, "ranks": "305322105233311201" }, ...] }
```

1. Tree array order = `Object.keys(classTalents[class])` (class lowercase).
2. One digit per talent in **tree array order** (Chronicle `tabIndex`); when rank-string length equals talent count, zip 1:1 by index.
3. `decodeChronicleTalents` → spec `{ "treeKey-talentId": points }`.
4. Length / `points_spent` mismatches log warnings without throwing.

Source of truth for tree definitions: Chronicle `GET https://octo.chronicleclassic.com/api/v1/wowdb/talent-trees` (`Origin: https://chronicleclassic.com`). IchaCalc mirrors this in `modules/talents/*.js` (Aug 2026 audit). Sinister Pursuit is **Demonology** t1 (not Affliction).

**Character Planner** (`armory.js`): after class change + gear, `applyArmoryTalents` on `#talents-list` and regenerates buffs.

**Gear Planner** (`gearPlannerView.js`): `decodeChronicleTalents` → `currentPlan.talents`; `applyLoadedPlanToLiveUi` refreshes `#gp-talents-host` when the talents overlay is open.

## Server contract

`GET /api/armory?character=&server=` returns:

```json
{
  "success": true,
  "equipment": [{ "itemId", "enchantId", "slot", "inventoryType", "name" }],
  "class", "race", "character", "server",
  "talents": { "trees": [{ "points_spent", "ranks" }] }
}
```

Implemented in `armory_proxy.py` (Chronicle default, `ARMORY_UPSTREAM=turtle` for Turtle scraper rollback).
