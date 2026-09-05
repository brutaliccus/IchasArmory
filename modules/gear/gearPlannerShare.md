# gearPlannerShare.js

Pure helpers for Gear Planner share URLs. Encodes the current first-class page in `?view=` next to `?gp=<id>`.

## URL shape

- Gear (default): `{origin}/gear-planner?gp=<id>`
- Other pages: `{origin}/gear-planner?gp=<id>&view=<page>`

`view` values: `gear` (omit), `talents`, `buffs`, `weights`, `locations`, `stats`. Unknown values normalize to `gear`.

## Exports

| Function | Purpose |
|---|---|
| `normalizeGpShareView(raw)` | Allowed page or `gear` |
| `buildGearPlannerShareUrl(origin, planId, view)` | Share clipboard URL |
| `applyGpShareViewToUrlString(href, view)` | `pathname+search+hash` with `view` updated (`gear` deletes the param) |
| `readGpShareViewFromSearch(search)` | Normalized view, or `null` if param missing |

Character Planner `?b=` links are unchanged. Browse-card share stays gear-only (no current-page view).
