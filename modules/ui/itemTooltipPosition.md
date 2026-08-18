# itemTooltipPosition.js

Shared **icon-anchored** placement for the global `#item-tooltip` element (`position: fixed` in `style.css`).

## Purpose

Tooltips **do not follow the cursor**. They originate at the item icon’s **outer top corner** and grow **away from the paperdoll/center** and **down**. They are **not** centered on the icon (`translateX(-50%)` is cleared).

- **Left-side icons** (left gear column / left Gear Planner cards): origin at the icon’s **top-left** (outer) corner; tooltip expands **left and down** (`transform-origin: top right`).
- **Right-side icons**: origin at **top-right**; expand **right and down** (`transform-origin: top left`). Call sites may pass `side: 'right'` or `'east'`.
- **Item/enchant modal lists**: `side: 'west'` / `'list-left'` — origin at the row icon’s **top-left**, grow **left and down** so the tooltip does not cover the list. Viewport clamp still applies.
- **Radial / other**: `auto` — grow toward whichever side fits.
- If there is not enough room below, **flip up** while keeping the same outer-corner origin.

## Zoom

`#item-tooltip` lives inside `#ichacalc-scaled-root` (`zoom: var(--ui-scale)`). `getBoundingClientRect()` is in **viewport** pixels; `style.left` / `style.top` are **pre-zoom** layout pixels. Placement divides visual coordinates by `--ui-scale`. Skipping that made right-column tooltips land over the icon (left column still looked roughly correct because values stayed near the left edge).

## API

- **`getItemTooltipAnchorEl(fromEl)`** — Resolves `.icon-image-container`, Gear Planner `.gp-item-tip` img, modal row icon, enchant button, or radial icon frame.
- **`normalizeTooltipGrowSide(side)`** — Maps `east`/`right` → `'right'`, `west`/`list-left`/`left` → `'left'`.
- **`inferTooltipGrowSide(anchorEl)`** — `'left'` | `'right'` | `'auto'` from paperdoll slot, `#gear-icons-left|right`, `#gp-slots-left|right`, or modal rows (left).
- **`positionItemTooltipOnIcon(tooltip, anchorEl, options?)`** — Sets `left` / `top` / `transform-origin`. `options.side` may be `'left'|'right'|'auto'|'east'|'west'|'list-left'`. On `body.gp-mobile`, clamps into a readable card (`max-width` ~360px, recenters if taller than 70vh).
- **`hideItemTooltip()`** — Hides `#item-tooltip` and clears pin state.
- **`positionItemTooltipAtCursor(tooltip, event)`** — Compat wrapper: uses `event.target` as the icon (ignores cursor coords).

## Consumers

- `app.js` — equipped gear / enchant hover (no document `mousemove` follow)
- `modules/ui/modal.js` — item and enchant modal rows
- `modules/gear/gearPlannerView.js` — `.gp-item-tip`
- `modules/ui/radialMenu.js` — radial item hover
- `modules/shaman/dps.js` — gear-compare `attachItemTooltip`
