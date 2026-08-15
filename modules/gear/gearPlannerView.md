# gearPlannerView.js

Renders the Gear Planner page: class drawer, slot columns, primary/alternative picks, save/load/share, and Shaman quick sim.

## Integration (app.js)

- `initGearPlannerView({ setAppMode, getItemById, openItemModalForGearPlan, exportGearPlanToURL })`
- Item picks from modal call `handleGearPlanItemSelected(item)` when `data-gear-plan-pick` is set on modal.

## UI elements (index.html)

- `#gear-planner-shell`, `#gp-class-sidebar`, `#gp-slots-left/right/center`
- Header: `#gp-plan-name`, save/load/share, `#gp-quick-sim-wrap` (Shaman only)
