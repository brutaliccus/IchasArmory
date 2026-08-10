# modules/shaman/shamanConsumePresets.js

Shaman-only **buff/consumable preset** data for onboarding and the **Buffs & Consumables** tab hamburger menu.

## Data

- **`modules/shaman/data/onboardingConsumePresets.json`** — nested `specKey` → `budget` | `standard` | `max` → `buffs[]` (same shape as saved build `buffs`: `{ id, improved? }`).
- Regenerate from `builds/<shortId>.json`:  
  `node scripts/extract-onboarding-consume-presets.mjs`

## Exports

- **`SHAMAN_CONSUME_SPEC_ORDER`** — linear spec order (still used for scripts / parity with JSON keys).
- **`SHAMAN_CONSUME_GRID_COLUMNS`** — three UI columns: Physhance (DPS+Tank), Spellhance (DPS+Tank), Elemental.
- **`SHAMAN_PRESET_SPEC_ICONS`** — Turtle `large` icon URL per spec (same URLs as Combat Sim priority preset radial); used for the Buffs tab grid and sourced by **`dps.js`** for the radial menu.
- **`SHAMAN_CONSUME_ICON_LARGE`** — base URL for those icons.
- **`SHAMAN_CONSUME_TIERS`** — `{ key, label, icon }` for budget / standard / max (copper / silver / gold **`inv_misc_coin_19|18|17`**); Buffs tab tier buttons and **`onboarding.js`** consume step (onboarding still labels max tier **Max** in UI).
- **`getShamanConsumeBuffs(specKey, tierKey)`** — returns buff array or `null`.

## Consumers

- **`app.js`** — `applyShamanConsumeBuffPreset`, `setupShamanConsumePresetMenu` (3-column grid + coin tier buttons), `handleClassChange` (show hamburger only for shaman).
- **`onboarding.js`** — after talent preset, user picks tier; calls `deps.applyShamanConsumePreset(spec, tier)`; tier icons from **`SHAMAN_CONSUME_TIERS`**.
