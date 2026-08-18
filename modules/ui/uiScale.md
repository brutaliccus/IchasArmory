# uiScale.js Documentation

## Overview

`modules/ui/uiScale.js` manages **automatic viewport fitting** and an optional **manual UI scale** multiplier, independent of browser zoom. Auto-fit targets the character planner / gear planner two-column chrome at **1920×1200** usable area below the **60px** fixed nav.

A separate **text scale** multiplier enlarges readable text in both planners without changing nav chrome, settings panel, or layout/icon sizing from UI scale.

## Auto-scale formula

```
availW = innerWidth
availH = max(1, innerHeight - NAV_CHROME_HEIGHT)
auto = clamp(min(availW / DESIGN_WIDTH, availH / DESIGN_HEIGHT), 0.5, 2.0)
effective = auto × userManual
```

Constants: `DESIGN_WIDTH = 1920`, `DESIGN_HEIGHT = 1200`, `NAV_CHROME_HEIGHT = 60`.

Unlike the older 2560×1440 cap-at-1 formula, auto can **scale up** on 4K/ultrawide so content is not tiny; 1080p/1440p land closer to “fits the viewport” without manual adjustment.

## Text scale composition

- **UI scale** (`--ui-scale` + `zoom` on `#ichacalc-scaled-root`): scales layout, icons, and all pixels inside the scaled root.
- **Text scale** (`--text-scale` on `html`, consumed as `--ts` on planner roots): multiplies user-visible text in Character Planner and Gear Planner.
- **Mechanism:** planner CSS uses `font-size: calc(<base> * var(--ts, 1))` for explicit `px`/`rem` sizes. `em`-based rules inherit from a scaled parent (`font-size: calc(1rem * var(--text-scale))` on `#ichacalc-scaled-root`). Nav and the settings panel keep `--ts: 1` (default on `html`).
- **Visual text size:** `base × textScale × uiScale` for px/rem rules inside the UI-scaled root; GP fixed sidebars get text scale only (they use `zoom: 1 !important`).

## Planner coverage

| Region | UI zoom | Text scale (`--ts`) |
|--------|---------|---------------------|
| Character Planner (`#ichacalc-scaled-root`) | yes | yes |
| Gear Planner shell (`#gear-planner-shell`, inside scaled root) | yes | yes |
| GP locations/stats sidebars (fixed, outside scaled root) | no | yes |
| GP save/community dialogs (outside scaled root) | no | yes |
| Top nav + UI settings panel | no | no (`--ts: 1`) |

## Exports

| Function | Purpose |
|----------|---------|
| `computeAutoScale()` | Viewport fit per formula above (range **0.5–2.0**) |
| `getUserScale()` | Manual multiplier from `localStorage` (default `1` when unset, range **0.5–2.0**) |
| `hasUserScalePreference()` | Whether the user has stored a manual scale |
| `setUserScale(value)` | Persist manual scale and re-apply |
| `clearUserScalePreference()` | Remove stored manual + text scale (reset to defaults) |
| `getEffectiveScale()` | `auto × user` |
| `getTextScale()` | Text multiplier from `localStorage` (default `1`, range **0.5–2.0**) |
| `hasTextScalePreference()` | Whether the user has stored a text scale |
| `setTextScale(value)` | Persist text scale and re-apply |
| `clearTextScalePreference()` | Remove stored text scale only |
| `applyUiScale()` | Sets CSS vars `--ui-auto-scale`, `--ui-user-scale`, `--ui-scale` and `zoom` on `#ichacalc-scaled-root` |
| `applyTextScale()` | Sets `--text-scale` on `document.documentElement` |
| `initUiScale()` | Apply scale, bind resize listener, wire settings panel |
| `applyUiScaleEarly()` | Early boot helper (inline script in `index.html` duplicates this) |

## Storage

- UI key: `ichacalc_uiUserScale`
- Text key: `ichacalc_textUserScale`
- **Unset:** manual multiplier is `1` (effective = auto only for UI; text = 100%).
- **Set:** slider value is persisted until reset clears the key(s).

## UI

- **Settings control** in the top nav: bold white **UI** label in a gold-bordered `dropdown-btn` (after inbox when logged in; guest copy before login when logged out)
- Panel is **`position: fixed`** at `top: 68px; right: 16px` — **not zoomed** and **not repositioned** when scale changes
- **Manual scale** slider range **50%–200%** (`min="0.5"` `max="2"`)
- **Text scaling** slider below manual scale, same **50%–200%** range
- Zoom applies only to `#ichacalc-scaled-root` (main app content), not `html`/`body`/nav/panel
- Effective / auto / manual scale shown in a fixed-height grid (no layout jump from text reflow)
- **Reset to 100%** clears both UI and text scale preferences
- Dispatches `uiScaleChanged` on UI apply (detail includes `text`); `textScaleChanged` on text apply; `app.js` repositions the item picker when scale changes

## CSS

- `style.css`: `html { --text-scale: 1; --ts: 1; }`, `.ichacalc-scaled-root { --ts: var(--text-scale); zoom: var(--ui-scale); font-size: calc(1rem * var(--text-scale)); }`, planner `font-size` rules use `calc(... * var(--ts, 1))`.
- `gear-planner.css`: `--ts` on `#gear-planner-shell`, GP sidebars, and GP dialogs; all GP text rules use `--ts`.
- `shaman-dps.css`: stat weights and DPS panel px/rem sizes use `--ts` (inherits from scaled root in CP).

## Consumers

- `app.js` — `initUiScale()` on startup; `repositionItemPickerIfOpen` on `uiScaleChanged`
- `index.html` — inline head script applies scale before first paint; settings markup in top nav
- `topnav.css` — settings panel styles (unscaled text)
- `style.css`, `gear-planner.css`, `shaman-dps.css` — text scale via `--ts`
