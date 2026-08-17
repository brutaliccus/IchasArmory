# setBonuses.js

Numeric set bonus detection and activation. Consumes `setDatabase.js`.

## Main API

- **`getSetBonuses(equippedGear, debug?)`** — Counts equipped item IDs per set, activates tiers where `count >= pieces`, returns mechanic keys plus **`sheetStats`** (flat stat object for calculator).
- **`getSetBonusById(bonusId)`** — Lookup single bonus definition.
- **`getActiveBonuses(setCounts)`** / **`bonusesToStats(activeBonuses)`** — Helpers for sim integration.

## Sheet stats

Bonuses with `sheetStats: { stamina: 10, fireResist: 18, … }` are summed into `setBonuses.sheetStats` and flattened onto matching `STAT_TEMPLATE` keys for backward compatibility. Calculator reads `setBonuses.sheetStats` in `calculateEffectiveHealth()`.

Mechanic-only bonuses (procs, cooldown resets, imbue modifiers) use `statsKey` / `statsKeys` without `sheetStats`.
