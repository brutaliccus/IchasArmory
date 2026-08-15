# itemTooltipPosition.js

Shared **icon-anchored** placement for the global `#item-tooltip` element (`position: fixed` in `style.css`).

## Purpose

Tooltips **do not follow the cursor**. They originate at the item icon’s **outer top corner** and grow **away from the paperdoll/center** and **down**.

- **Left-side icons** (left gear column / left Gear Planner cards): origin at the icon’s **top-left** (outer) corner; tooltip expands **left and down** (`transform-origin: top right`).
- **Right-side icons**: origin at **top-right**; expand **right and down** (`transform-origin: top left`).
- **Modal / list / radial**: `auto` side — grow down and toward whichever side fits the viewport; still anchored to the icon rect.
- If there is not enough room below, **flip up** while keeping the same outer-corner origin. Positions are clamped so the tooltip stays on-screen.

## API

- **`getItemTooltipAnchorEl(fromEl)`** — Resolves `.icon-image-container`, Gear Planner `.gp-item-tip` img, modal row icon, enchant button, or radial icon frame.
- **`inferTooltipGrowSide(anchorEl)`** — `'left'` | `'right'` | `'auto'` from paperdoll slot / `#gp-slots-left|right`.
- **`positionItemTooltipOnIcon(tooltip, anchorEl, options?)`** — Sets `left` / `top` / `transform-origin`.
- **`positionItemTooltipAtCursor(tooltip, event)`** — Compat wrapper: uses `event.target` as the icon (ignores cursor coords).

## Consumers

- `app.js` — equipped gear / enchant hover (no document `mousemove` follow)
- `modules/ui/modal.js` — item and enchant modal rows
- `modules/gear/gearPlannerView.js` — `.gp-item-tip`
- `modules/ui/radialMenu.js` — radial item hover
- `modules/shaman/dps.js` — gear-compare `attachItemTooltip`
