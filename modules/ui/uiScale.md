# uiScale.js Documentation

## Overview

`modules/ui/uiScale.js` manages **automatic viewport fitting** and an optional **manual UI scale** multiplier, independent of browser zoom. Auto-fit targets the character planner / gear planner two-column chrome at **1920×1200** usable area below the **60px** fixed nav.

## Auto-scale formula

```
availW = innerWidth
availH = max(1, innerHeight - NAV_CHROME_HEIGHT)
auto = clamp(min(availW / DESIGN_WIDTH, availH / DESIGN_HEIGHT), 0.5, 2.0)
effective = auto × userManual
```

Constants: `DESIGN_WIDTH = 1920`, `DESIGN_HEIGHT = 1200`, `NAV_CHROME_HEIGHT = 60`.

Unlike the older 2560×1440 cap-at-1 formula, auto can **scale up** on 4K/ultrawide so content is not tiny; 1080p/1440p land closer to “fits the viewport” without manual adjustment.

## Exports

| Function | Purpose |
|----------|---------|
| `computeAutoScale()` | Viewport fit per formula above (range **0.5–2.0**) |
| `getUserScale()` | Manual multiplier from `localStorage` (default `1` when unset, range **0.5–2.0**) |
| `hasUserScalePreference()` | Whether the user has stored a manual scale |
| `setUserScale(value)` | Persist manual scale and re-apply |
| `clearUserScalePreference()` | Remove stored manual scale (reset to auto-only) |
| `getEffectiveScale()` | `auto × user` |
| `applyUiScale()` | Sets CSS vars `--ui-auto-scale`, `--ui-user-scale`, `--ui-scale` and `zoom` on `#ichacalc-scaled-root` |
| `initUiScale()` | Apply scale, bind resize listener, wire settings panel |
| `applyUiScaleEarly()` | Early boot helper (inline script in `index.html` duplicates this) |

## Storage

- Key: `ichacalc_uiUserScale`
- **Unset:** manual multiplier is `1` (effective = auto only).
- **Set:** slider value is persisted and multiplied with auto until reset clears the key.

## UI

- **Settings control** in the top nav: bold white **UI** label in a gold-bordered `dropdown-btn` (after inbox when logged in; guest copy before login when logged out)
- Panel is **`position: fixed`** at `top: 68px; right: 16px` — **not zoomed** and **not repositioned** when scale changes
- Slider range **50%–200%** (`min="0.5"` `max="2"`)
- Zoom applies only to `#ichacalc-scaled-root` (main app content), not `html`/`body`/nav/panel
- Effective / auto / manual scale shown in a fixed-height grid (no layout jump from text reflow)
- Dispatches `uiScaleChanged` on apply; `app.js` repositions the item picker when scale changes

## CSS

`style.css` sets `.ichacalc-scaled-root { zoom: var(--ui-scale); }`. Top nav and settings panel stay at `zoom: 1`.

## Consumers

- `app.js` — `initUiScale()` on startup; `repositionItemPickerIfOpen` on `uiScaleChanged`
- `index.html` — inline head script applies scale before first paint; settings markup in top nav
- `topnav.css` — settings panel styles
