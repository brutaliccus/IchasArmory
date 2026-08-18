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
  ui: { collapsed: { [slotId]: boolean }, stRotation?: 'enhSt'|'eleSt' },
  role: Array<'dps'|'tank'|'healer'>,  // required before save (UI uses single dropdown)
  spec: string,           // talent-tree display name (e.g. Enhancement)
  icon: string,           // vanilla icon basename (e.g. spell_nature_lightning)
  description?: string,   // short blurb max 180
  statWeights?: array,    // legacy: migrated into statWeightsByClass[plan.class]
  statWeightsAoe?: array,
  tankStatWeights?: object,
  statWeightsByClass?: {  // per-class weight buckets (preferred)
    [classId: string]: {
      statWeights?: array,      // ST DPS rows
      statWeightsAoe?: array,   // AOE rows (shaman)
      tankStatWeights?: object  // tank EHP/mit object
    }
  },
  community?: boolean,    // true for cloud/authenticated publishes
  authorName?: string,
  authorId?: string,
  sourceCommunityId?: string,
  sourceShareId?: string   // ?gp= share snapshot id (not writable)
}
```

Helpers: `normalizeGearPlanRoles`, `defaultIconForClassSpec`, `sanitizeGearPlanDescription`, `sanitizeGearPlanName`, `formatGearPlanRoleLabel`, `DEFAULT_SPEC_ICONS`, `GEAR_PLAN_ROLES`, `GEAR_PLAN_DESCRIPTION_MAX`, `GEAR_PLAN_NAME_MAX` (64).

Items and per-slot **primary enchants** (`enchant` = index into `enchantDatabase[slot]`, or `null`). Alternatives are unenchanted. Independent of Character Planner `selectedEnchants`.

## Storage keys

| Key | Purpose |
|-----|---------|
| `ichacalc_gear_planner_session_v1` | Active plan + `editMode` + collapse while switching Character ↔ Gear Planner |
| `ichacalc_gp_tankStatWeights_<class>` | Tank EHP/mit weights per class (optional cache; plan `statWeightsByClass` is canonical) |
| `ichacalc_gp_statWeights_<class>` / `_aoe_<class>` | Shaman DPS weights per class |
| `ichacalc_gp_local_weights_<planId>` | Local draft: `{ statWeightsByClass: { [class]: { statWeights, statWeightsAoe, tankStatWeights } } }` |

Cloud saves: `user.gearPlans[]` via profiles API (see `profiles.md`). Guests are not gated: Save uses `loadLocalGearPlans` / `saveLocalGearPlans` when `profileManager.user` is absent (local saves are **not** published to community). Logged-in cloud saves publish to `GET /community-gear-plans`.

## Exports

- `GEAR_PLAN_SLOTS`, `GEAR_PLAN_ROLES`, `DEFAULT_SPEC_ICONS`, `createEmptyGearPlan`, `getGearPlanData`, `loadGearPlanData`
- `getGearPlanPrimaryEquipped(plan, getItemById)` — primary-slot item snapshot for set bonuses (full item when loaded, `{ id }` stub otherwise; alts excluded)
- `normalizeGearPlanRoles`, `defaultIconForClassSpec`
- `saveGearPlannerSession`, `loadGearPlannerSession`
- `sanitizeGearPlanStatWeightsByClass`, `migrateGearPlanStatWeightsToByClass`
- `saveGearPlannerTankStatWeights` / `getGearPlannerTankStatWeights` (optional per-class localStorage cache)
- `saveGearPlannerDpsStatWeights` / `getGearPlannerDpsStatWeights` (optional per-class localStorage cache)
