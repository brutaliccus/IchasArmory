# modules/ui/radialMenu.js

Shared **gear-style radial wheel** (`#radial-menu-container` / `#radial-menu-wheel` in `index.html`) with backdrop fade and **`radialItemFadeIn`** stagger (see `style.css`).

## Exports

- **`openRadialMenu(anchorElement, onSelect, options?)`** — Equipped slots in fixed **`SLOT_ORDER`**; **`onSelect(slotId, item)`**.
- **`openCustomRadialMenu(anchorElement, items, onSelect, options?)`** — Arbitrary wedges: **`items`** = `{ id, title, iconUrl }[]`; **`onSelect(id)`**. Reuses the same DOM/CSS animations as gear compare.
  - **`options.radius`** — Distance from center (px); defaults from item count.
  - **`options.toggle`** — If true, opening again on the **same anchor** while a custom menu is open closes it (Totemic preset picker).
  - **`options.anchorX` / `options.anchorY`** — Center when anchor has no box (same as gear).
- **`closeRadialMenu()`** — Hides wheel and clears mode.

## Internal mode

**`menuMode`** is **`'gear'`** | **`'custom'`** | **`null`** so custom vs gear state is tracked for toggle and teardown.

## Consumers

- **`modules/gear/gearCompare.js`** — `openRadialMenu` on equipped icon.
- **`modules/shaman/dps.js`** — `openRadialMenu` (stat weights compare slot picker); **`openCustomRadialMenu`** for onboarding priority presets (Totemic slot).
