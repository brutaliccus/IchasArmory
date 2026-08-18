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
| `groupEnchantsByCategory(enchants)` | `Map<bucketId, enchant[]>` preserving input order |

## Consumers

- **`modules/ui/modal.js`** — `renderEnchants`, `filterAndRenderEnchants`

## Rules

See **Enchant picker categories** in `enchants.md` for the full stat/name mapping table.
