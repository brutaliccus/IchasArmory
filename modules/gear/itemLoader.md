# itemLoader.js

On-demand slot JSON loader for `data/items/{slot}.json` (gzip served by `server.js`). In-memory cache after first fetch.

## Exports

| Name | Purpose |
|------|---------|
| `itemLoader.loadSlot(slot)` | Fetch/cache one slot; indexes `itemsById` |
| `itemLoader.getItemById(id)` | Lookup among loaded slots (returns `null` until that slot’s JSON is loaded) |
| `itemLoader.loadAll()` | Load every slot in parallel |
| `itemLoader.scheduleIdlePreload()` | Idle-time warmup of common slots (called from `app.js` init; does not block the loading screen) |
| `itemLoader.isSlotLoaded` / `getStatus` | Debug |

Gear Planner (`ensureGearPlanItemsReady` in `gearPlannerView.js`) awaits `loadSlot` for occupied plan slots before rendering shared/loaded plans so `getItemById` is populated on first paint.

Fetches use `cache: 'force-cache'`. Ring/trinket slot names are normalized on the item object.
