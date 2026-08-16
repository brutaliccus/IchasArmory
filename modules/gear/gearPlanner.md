# gearPlanner.js

Gear plan data model and localStorage persistence for the Gear Planner page.

## GearPlan schema

```js
{
  schemaVersion: 1,
  kind: 'gearPlan',
  id?: string,            // set after local/cloud save
  name: string,
  class: string,
  race: string,           // independent of Character Planner
  talents: {},            // same `tree-talentId` → points map as character builds
  buffs: [],              // `{ id, improved? }[]` independent of Character Planner
  slots: {
    [slotId]: { primary: number|null, alternatives: number[], enchant: number|null }
  },
  ui: { collapsed: { [slotId]: boolean } }
}
```

Items and per-slot **primary enchants** (`enchant` = index into `enchantDatabase[slot]`, or `null`). Alternatives are unenchanted. Independent of Character Planner `selectedEnchants`.

## Storage keys

| Key | Purpose |
|-----|---------|
| `ichacalc_gear_planner_session_v1` | Active plan + `editMode` + collapse while switching Character ↔ Gear Planner |
| `ichacalc_gp_tankStatWeights` | Tank EHP/mit weights generated on the Gear Planner tab |
| `ichacalc_gp_statWeights` / `_aoe` | Shaman DPS/TPS weights generated on the Gear Planner tab |

Cloud saves: `user.gearPlans[]` via profiles API (see `profiles.md`). Guests are not gated: Save uses `loadLocalGearPlans` / `saveLocalGearPlans` when `profileManager.user` is absent.

## Exports

- `GEAR_PLAN_SLOTS`, `createEmptyGearPlan`, `getGearPlanData`, `loadGearPlanData`
- `saveGearPlannerSession`, `loadGearPlannerSession`
- `saveGearPlannerTankStatWeights` / `getGearPlannerTankStatWeights`
- `saveGearPlannerDpsStatWeights` / `getGearPlannerDpsStatWeights`
