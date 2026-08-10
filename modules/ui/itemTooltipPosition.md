# itemTooltipPosition.js

Shared cursor positioning for the global `#item-tooltip` element.

## Purpose

- **`positionItemTooltipAtCursor(tooltip, event, offset?)`** — Sets `left` / `top` from **`event.clientX` / `event.clientY`** (viewport space), clamps using **`getBoundingClientRect()`** width/height and **`window.innerWidth` / `innerHeight`**.

## Why

`#item-tooltip` is **`position: fixed`** (see `style.css`). Using **`pageX` / `pageY`** with viewport clamping, or adding **`scrollX` / `scrollY`** to fixed positioning, skews placement when the page is scrolled or when **`body { zoom }`** is used; Edge can disagree with other Chromium browsers on that mapping.

## Consumers

- `app.js` — main gear hover `positionTooltip`
- `modules/ui/modal.js` — item/enchant rows in modals
- `modules/ui/radialMenu.js` — radial item hover

Related: `modules/shaman/dps.js` already used `clientX`/`clientY` for its attach path; it stays consistent with fixed tooltips.
