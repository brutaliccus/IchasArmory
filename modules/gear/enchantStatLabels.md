# modules/gear/enchantStatLabels.js

Shared **enchant stat display names** and **formatting** for:
- **Tooltips** — full stat names via `formatEnchantStatsHTML()` (used by `tooltips.js` → `createEnchantTooltipHTML`)
- **Gear strip** — short labels via `getEnchantCompactLabel()` (used by `gear.js` → `updateEnchantDisplay`)

## Exports

| Export | Role |
|--------|------|
| `ENCHANT_STAT_NAME_MAP` | Internal key → human-readable name for tooltip lines |
| `formatEnchantStatsHTML(stats)` | `<br/>`-joined `+N Stat` / `+N% Stat` lines |
| `getEnchantCompactLabel(enchant)` | Gear page: comma-separated compact segments, or mechanic short name |
| `getEnchantCompactStatSegments(stats)` | Array of compact segments (dedupes e.g. triple `+14 AP`) |
| `mechanicShortNameFromFullName(fullName)` | Strips `Enchant … - ` prefix for proc-only enchants |
| `splitEnchantPickerLabel(fullName)` | `{ prefix, suffix, full }` — keeps parenthetical effect visible in picker |

## Compact label rules

1. If any **non-zero** entry in `enchant.stats` → build segments from stats (`+7 Agi`, `+30 SP`, `+14 AP`, etc.); **dedupe** identical segments (handles `ap` + `attackPower` + `rangedAttackPower` on the same value).
2. **`rangedAttackPower` vs `rap`**: if `rap === value`, both format as `+N RAP` and dedupe; otherwise `rangedAttackPower` alone uses `AP` (belt buckle style).
3. If **no** modeled stats → `enchant.shortName` if set, else `mechanicShortNameFromFullName(enchant.name)` (e.g. Crusader).

## Related

- `enchants.js` — data; optional `shortName` on entries for edge cases
- `modal.js` — still lists full `enchant.name` in the picker
- `scripts/audit-enchant-titles.mjs` — regression check for stats-without-numeric-paren in `name`
