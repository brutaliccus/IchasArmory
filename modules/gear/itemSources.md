# itemSources.js

Lazy-loads TurtleAtlasLoot-derived loot data from `/data/loot/` for item modal instance filtering and source sublines.

## Data files

- `data/loot/instances-index.json` — dungeons, raids, world bosses, other groups
- `data/loot/item-sources.json` — `itemId → SourceEntry[]`
- Regenerate: `npm run import:loot` (requires `.tmp-turtle-atlas-loot` clone)

## Exports

| Function | Purpose |
|----------|---------|
| `ensureItemSourcesLoaded()` | Fetch loot JSON once |
| `getSourcesForItem(itemId)` | All sources for an item |
| `getPrimarySourceLabel(itemId)` | Short label for modal row subline |
| `itemMatchesInstanceFilter(itemId, selectedIds)` | OR filter; empty = no filter |
| `isOtherItem(itemId)` | No dungeon/raid/worldboss source |
| `getInstanceFilterGroups()` | UI groups: dungeons, raids, worldBosses, other |

## SourceEntry

```js
{ instanceId, instanceName, kind, tableKey, tableTitle, dropRate }
```

`kind`: `dungeon` | `raid` | `worldboss` | `other`
