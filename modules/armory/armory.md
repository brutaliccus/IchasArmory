# modules/armory/armory.js - Character Planner Armory UI

## Overview

Character Planner armory import UI: status bar, imported-state chrome, and `importFromArmoryAPI` wired from `app.js`.

## Data flow

1. User enters name + Chronicle realm → `importFromArmoryAPI` in this file.
2. Fetch + equip delegated to **`armoryImport.js`** (`fetchArmoryData`, `applyArmoryEquipment`, `applyArmoryTalents`).
3. Class/race applied to `#class-race-sidebar`; gear via `gear.js` `equipItem` / `applyEnchant`; talents via `applyArmoryTalents` on `#talents-list`.

Gear Planner uses the same `armoryImport.js` pipeline with GP plan-slot hooks (see `gearPlannerView.js`).

## Realms

Character Planner `#serverSelect` and onboarding use Chronicle realms (`nzoth`, `cthun`, `yshaarj`). Turtle realms remain available when `ARMORY_UPSTREAM=turtle` on the proxy.

## Related

- `armoryImport.js` / `armoryImport.md` — shared fetch + apply
- `armory_proxy.py` — server adapter (never called from browser)
- `buildManager.js` — saved build import/export
