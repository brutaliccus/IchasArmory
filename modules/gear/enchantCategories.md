# modules/gear/enchantCategories.js

## Overview

Maps each enchant in `enchants.js` to a picker bucket for the categorized enchant modal. Pure classification logic (no UI).

## Exports

| Export | Purpose |
|--------|---------|
| `ENCHANT_MAIN_CATEGORIES` | Top-level column labels + CSS modifier classes |
| `ENCHANT_SUBCATEGORIES` | Bucket id → `{ main, sub }` (`offensive.phys`, `healing`, etc.) |
| `ENCHANT_CATEGORY_ORDER` | Column order: offensive → defensive → healing → utility → other |
| `ENCHANT_SUBCATEGORY_ORDER` | Phys before Spell within Offensive/Defensive |
| `getEnchantCategoryId(enchant)` | Returns bucket id string |
| `getEnchantCategory(enchant)` | Returns `{ main, sub, bucketId }` |
| `getEnchantQualityClass(enchant)` | Inferred `q0`–`q4` class for picker name color |
| `getEnchantQualityRank(enchant)` | Numeric rank `4`–`0` (same order as quality class) for sorting |
| `getEnchantDominantStatValue(enchant, bucketId)` | Max abs stat value for bucket-relevant keys |
| `sortEnchantsInBucket(enchants, bucketId)` | Sort by quality desc, then dominant stat desc |
| `groupEnchantsByCategory(enchants)` | `{ groups: Map<bucketId, enchant[]>, none }` — sorted buckets; `None` separate |

## Sorting

Within each bucket/subcategory, enchants are sorted by:

1. **Quality** (best first): `q4` → `q3` → `q2` → `q1` → `q0` (same inference as `getEnchantQualityClass`)
2. **Dominant stat** (highest first): max absolute value from bucket-relevant `enchant.stats` keys (`other` uses all numeric stats)

## Other column / None

- **`None`** is not placed in the Other bucket; the modal renders it in a dedicated top row (`.enchant-picker-none-row`).
- The **Other** column is omitted when no real enchants classify as `other` (only `None` would have appeared there).

## Consumers

- **`modules/ui/modal.js`** — `renderEnchants`, `filterAndRenderEnchants`

## Rules

See **Enchant picker categories** in `enchants.md` for the full stat/name mapping table.
