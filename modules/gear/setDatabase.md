# setDatabase.js

Single source of truth for set bonus definitions (item ID → set → bonus tiers).

## Architecture

- **Core sets** (`coreSets` in `setDatabase.js`): Shaman/Turtle modeled bonuses with `effect`, `statsKey`, and/or sim hooks.
- **Sheet-stat sets** (`setDatabaseSheetStats.generated.js`): Auto-generated pure stat tiers for all classes. Regenerate with `npm run generate:set-sheet-stats`.
- **Runtime merge**: `setDatabase.sets = mergeSetDefinitions(coreSets, sheetStatSets)`.

## Bonus fields

| Field | Purpose |
|-------|---------|
| `bonusId` | Unique numeric ID |
| `pieces` | Pieces required to activate |
| `description` | Tooltip text |
| `modeledInSim` | `true` → ★ on `(N) Set:` lines in `tooltips.js` |
| `sheetStats` | Flat stats merged into calculator via `getSetBonuses().sheetStats` |
| `statsKey` / `statsKeys` | Mechanic flags for sim / special calculator paths |
| `effect` | Structured effect metadata for `setBonusSystem.js` |

## Related modules

- `setBonuses.js` — `getSetBonuses(equippedGear)` detects pieces by item ID and activates bonuses.
- `setBonusSystem.js` — proc/effect/mechanic execution in combat sim.
- `calculator.js` — applies `sheetStats` to character sheet totals.
- `stats.js` — `parseSetBonusSheetStats()` parses stat-only set bonus text when generating sheet tiers.
