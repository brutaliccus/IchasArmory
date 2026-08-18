# gpMobile.js

Shared Gear Planner mobile chrome: viewport detection, `body.gp-mobile`, nav offset, and Gear / Locations / Stats panes.

## Detection

- **Phone / narrow tablet:** `max-width: 900px`
- **Coarse tablet:** `max-width: 1199px` and `pointer: coarse`
- Active only when `body[data-app-mode="gearPlanner"]`

## Exports

| Function | Purpose |
|---|---|
| `isGpMobileViewport()` | Media-query only |
| `isGpMobileLayout()` | GP mode + viewport |
| `isFinePointerHover()` | `(hover: hover) and (pointer: fine)` |
| `applyGpMobileClass()` | Toggles `body.gp-mobile` / `html.gp-mobile` |
| `syncGpNavOffset()` | Sets `--gp-nav-offset` and `--gp-tabbar-height` |
| `syncGpMobileChrome()` | Class + pane visibility + offsets |
| `getGpMobilePane()` / `setGpMobilePane(pane)` | `gear` \| `locations` \| `stats` |
| `initGpMobile({ initialPane, onLayoutChange })` | Tab bar, ResizeObserver, matchMedia |

Layout auto-fit is **skipped** on GP mobile (responsive CSS); **manual UI scale** still applies via `uiScale.js`. Text scale still applies.

## Top nav (`.gp-mobile`)

Single **40px** row in `topnav.css` — circular `ichabaddie_portrait` + site title left-aligned; planner actions center-right; Discord login / profile avatar + logout on the **far right** (`top-nav-left` order 4). Icons are 28px, Discord login is icon-only, and `#mode-character-btn` (Character / build planner) is hidden so the bar does not wrap. `syncGpNavOffset()` measures that height into `--gp-nav-offset`.

See [`docs/GEAR_PLANNER_MOBILE_PLAN.md`](../../docs/GEAR_PLANNER_MOBILE_PLAN.md).
