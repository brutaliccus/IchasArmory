# gearPlannerView.js

Renders the Gear Planner page: class drawer, two-column expandable slot cards, save/load/share, and Shaman quick sim.

## Integration (app.js)

- `initGearPlannerView({ setAppMode, getItemById, openItemModalForGearPlan, exportGearPlanToURL })`
- Item picks from modal call `handleGearPlanItemSelected(item)` when `data-gear-plan-pick` is set on modal.

## UI elements (index.html)

- `#gear-planner-shell`, `#gp-class-sidebar`, `#gp-slots-left`, `#gp-slots-right`
- Header: `#gp-plan-name`; icon buttons Save / **Edit mode** (`#gp-edit-mode-btn`, pencil, `aria-pressed`) / Load / Share; Shaman-only **Configure Sim** and **Quick DPS Sim** (plus `#gp-quick-sim-result`) in the same header
- `#gp-quick-sim-wrap`: dismissible info banner only (no action buttons). Dismiss X stores `ichacalc_gp_sim_hint_dismissed` in localStorage
- Class drawer: `#gp-cr-drawer-class` uses `.is-open` (same as character `#cr-drawer-class`) so `#gp-class-drawer-toggle` expands `#gp-class-drawer-panel`

## Edit mode

- New unsaved plans start with edit **on**. Saved or loaded plans start with edit **off** (session `editMode` overrides when present). Saving a plan turns edit off.
- **View (off):** hide clear/remove X and Add alternative; no picker or drag-reorder; cards still expand to show alts. Shell gets `.gp-view-mode`.
- **Edit (on):** X buttons, Add alternative, icon drag-and-drop, item picker.

## Slot cards

Paperdoll order (same as `#gear-icons-left` / `#gear-icons-right`):

- Left: head, neck, shoulder, back, chest, wrist, mainhand, offhand
- Right: hands, waist, legs, feet, ring1, ring2, trinket1, trinket2, ranged

Each card:

- Collapsed by default (`plan.ui.collapsed[slotId] !== false`); session-persisted
- Icon on the **outer** edge; name + `instance · boss` flow toward center
- Empty slot: dashed add-primary control opens the item modal
- Click card or chevron to expand alternatives (icon, name, source; remove/add only in edit mode)
- Right-column cards reverse the **primary/alt rows** so the icon stays on the outer edge; `.gp-alts-panel` stays a column so **Add alternative** is full-width under the alt list (not beside the primary X)
- Item tooltips (`#item-tooltip` via `createItemTooltipHTML` / `positionItemTooltipAtCursor`) fire **only on the item icon** (`.gp-item-tip` on `.gp-slot-icon-frame` / `.gp-alt-icon`), matching character-sheet `.icon-frame` hover — not the whole card
- Drag-and-drop from the icon only when edit mode is on (`cursor: grab`): alt → primary swaps that alt into primary (old primary becomes that alt); primary → alt swaps; alt → alt reorders. Persists through `saveGearPlannerSession` on re-render. Card click-to-expand is ignored after a drag.
