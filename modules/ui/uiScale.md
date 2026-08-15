# uiScale.js Documentation

## Overview

`modules/ui/uiScale.js` manages **automatic viewport fitting** and an optional **manual UI scale** multiplier, independent of browser zoom. The layout is designed for a **2560×1440** baseline; smaller viewports scale down proportionally using both width and height.

## Exports

| Function | Purpose |
|----------|---------|
| `computeAutoScale()` | `min(innerWidth/2560, innerHeight/1440, 1)` |
| `getUserScale()` | Manual multiplier from `localStorage` (default `1`, range `0.7`–`1.3`) |
| `setUserScale(value)` | Persist manual scale and re-apply |
| `getEffectiveScale()` | `auto × user` |
| `applyUiScale()` | Sets CSS vars `--ui-auto-scale`, `--ui-user-scale`, `--ui-scale` and `zoom` on `html`/`body` |
| `initUiScale()` | Apply scale, bind resize listener, wire settings panel |
| `applyUiScaleEarly()` | Optional early boot helper (inline script in `index.html` duplicates this) |

## Storage

- Key: `ichacalc_uiUserScale`
- Manual scale only; auto scale is always computed from the current viewport.

## UI

- **Settings control** in the top nav: bold white **UI** label in a gold-bordered `dropdown-btn` (after inbox when logged in; guest copy before login when logged out)
- Panel is **`position: fixed`** at `top: 68px; right: 16px` — **not zoomed** and **not repositioned** when scale changes
- Zoom applies only to `#ichacalc-scaled-root` (main app content), not `html`/`body`/nav/panel
- Effective / auto / manual scale shown in a fixed-height grid (no layout jump from text reflow)
- Dispatches `uiScaleChanged` on apply; `app.js` repositions the item picker when scale changes

## CSS

`style.css` sets `.ichacalc-scaled-root { zoom: var(--ui-scale); }`. Top nav and settings panel stay at `zoom: 1`.

## Consumers

- `app.js` — `initUiScale()` on startup; `repositionItemPickerIfOpen` on `uiScaleChanged`
- `index.html` — inline head script applies scale before first paint; settings markup in top nav
- `topnav.css` — settings panel styles
