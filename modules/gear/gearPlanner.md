# gearPlanner.js

Gear plan data model and localStorage persistence for the Gear Planner page.

## GearPlan schema

```js
{
  schemaVersion: 1,
  kind: 'gearPlan',
  name: string,
  class: string,          // class id for can-equip filter
  slots: {
    [slotId]: { primary: number|null, alternatives: number[] }
  },
  ui: { collapsed: { [slotId]: boolean } }
}
```

Items only (no enchants in v1).

## Storage keys

| Key | Purpose |
|-----|---------|
| `ichacalc_gear_planner_session_v1` | Active plan + collapse while switching Character ↔ Gear Planner |
| `ichacalc_local_gear_plans_v1` | Saved named plans (guest / local) |

Cloud saves: `user.gearPlans[]` via profiles API (see `profiles.md`).

## Exports

- `GEAR_PLAN_SLOTS`, `createEmptyGearPlan`, `getGearPlanData`, `loadGearPlanData`
- `saveGearPlannerSession`, `loadGearPlannerSession`
- `loadLocalGearPlans`, `saveLocalGearPlans`
