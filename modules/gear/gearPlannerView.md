# gearPlannerView.js

Renders the Gear Planner page: class drawer, two-column expandable slot cards, save/load/share, and Shaman quick sim.

## Integration (app.js)

- `initGearPlannerView({ setAppMode, getItemById, openItemModalForGearPlan, exportGearPlanToURL })`
- Item picks from modal call `handleGearPlanItemSelected(item)` when `data-gear-plan-pick` is set on modal.

## UI elements (index.html)

- `#gear-planner-shell`, `#gp-class-sidebar`, `#gp-slots-left`, `#gp-slots-right`
- Header: `#gp-plan-name`, save/load/share, `#gp-quick-sim-wrap` (Shaman only)

## Slot cards

Paperdoll order (same as `#gear-icons-left` / `#gear-icons-right`):

- Left: head, neck, shoulder, back, chest, wrist, mainhand, offhand
- Right: hands, waist, legs, feet, ring1, ring2, trinket1, trinket2, ranged

Each card:

- Collapsed by default (`plan.ui.collapsed[slotId] !== false`); session-persisted
- Icon on the **outer** edge; name + `instance · boss` flow toward center
- Empty slot: dashed add-primary control opens the item modal
- Click card or chevron to expand alternatives (icon, name, source, remove, add)
- Hover uses `#item-tooltip` via `createItemTooltipHTML` / `positionItemTooltipAtCursor`
