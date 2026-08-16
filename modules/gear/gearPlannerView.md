# gearPlannerView.js

Renders the Gear Planner page: locations-needed sidebar, class drawer, two-column expandable slot cards, save/load/share, and Shaman quick sim.

## Locations sidebar

- `#gp-locations-sidebar` is **outside** `#ichacalc-scaled-root`: `position: fixed; left: 0; top: 60px` (below the unscaled nav), docked to the **screen** left. Hidden unless `body[data-app-mode="gearPlanner"]`.
- `#gear-planner-shell` is viewport-centered (`margin: 0 auto`); the locations dock overlays the left and does **not** pad the shell by sidebar width.
- Nested item names use quality classes (`span.q0`–`q5`) from `getItemById`.
- Built from the current plan’s **primary and alternative** item IDs via `getPreferredSourcesForItem` (`itemSources.js`). Unique dungeon/raid/worldboss instances (not Collections when an instance source exists). Nested indented item names under each location; click opens octowow DB. Hovering a location adds `.gp-location-hovering` on `#gear-planner-shell`, `.gp-row--location-hl` on matching primary/alt rows, and `.gp-item-name--location-hl` on the inner `.gp-item-name-text` span only (not the card).
- Dungeons follow the same high-level-first order as the item-modal instance filter (`getInstanceFilterGroups`). Other groups are alphabetical.
- `renderLocationsSidebar()` runs on every `renderGearPlanner()` so add/remove/clear updates live. Empty plan: “No locations yet”.
- Larger type in `gear-planner.css` (~1rem instance names, gold headings); independent scroll if the list is long.

## Integration (app.js)

- `initGearPlannerView({ setAppMode, getItemById, openItemModalForGearPlan, exportGearPlanToURL })`
- Item picks from modal call `handleGearPlanItemSelected(item)` when `data-gear-plan-pick` is set on modal.

## UI elements (index.html)

- `#gear-planner-shell`, `#gp-locations-sidebar`, `#gp-class-sidebar`, `#gp-slots-left`, `#gp-slots-right`
- Header: `#gp-plan-name` (left, slick fade borders); icon buttons Save / **Edit mode** / **My Gear Plans** dropdown (`#gear-plans-dropdown`, same classes as My Builds: share/delete/favorite) / Share
- `#gp-quick-sim-wrap`: dismissible info banner only (no action buttons). Dismiss X stores `ichacalc_gp_sim_hint_dismissed` in localStorage
- Class drawer: `#gp-cr-drawer-class` uses `.is-open` (same as character `#cr-drawer-class`) so `#gp-class-drawer-toggle` expands `#gp-class-drawer-panel`

## Edit mode

- New unsaved plans start with edit **on**. Saved or loaded plans start with edit **off** (session `editMode` overrides when present). Saving a plan turns edit off.
- **View (off):** hide clear/remove X; no picker or drag-reorder; cards still expand to show alts. Shell gets `.gp-view-mode`. Outside add icons stay visible but disabled.
- **Edit (on):** X buttons, outside empty-slot add icons, icon drag-and-drop, item picker.

## Slot cards

Paperdoll order (same as `#gear-icons-left` / `#gear-icons-right`):

- Left: head, neck, shoulder, back, chest, wrist, mainhand, offhand
- Right: hands, waist, legs, feet, ring1, ring2, trinket1, trinket2, ranged

Each card:

- Collapsed by default (`plan.ui.collapsed[slotId] !== false`); session-persisted
- Icon on the **outer** edge; name + `Zone: Dungeon – Boss` source line
- Middle-click icon opens `https://octowow.st/db/?item=` (same as item modal)
- Empty slot: no in-card `+`; a always-visible empty-slot icon sits **outside** the card (left of left-column cards, right of right-column cards), using character-planner `inventoryslot_*` art and a small gold `+`. Click adds primary if empty, otherwise an alternative. Druid/shaman/paladin ranged empty icon is relic.
- Click card or chevron to expand alternatives (icon, name, source; remove/add only in edit mode)
- Right-column cards reverse the **primary/alt rows** so the icon stays on the outer edge; `.gp-alts-panel` stays a column so **Add alternative** is full-width under the alt list (not beside the primary X)
- Item tooltips (`#item-tooltip` via `createItemTooltipHTML` / `positionItemTooltipOnIcon`) fire **only on the item icon** (`.gp-item-tip` on `.gp-slot-icon-frame` / `.gp-alt-icon`). Left-column cards grow left+down from the icon’s top-left; right-column cards grow right+down from top-right. They do not follow the cursor.
- Drag-and-drop from the icon only when edit mode is on (`cursor: grab`): alt → primary swaps that alt into primary (old primary becomes that alt); primary → alt swaps; alt → alt reorders. Persists through `saveGearPlannerSession` on re-render. Card click-to-expand is ignored after a drag.
