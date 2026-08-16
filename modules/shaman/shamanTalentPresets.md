# shamanTalentPresets.js

Shaman talent point allocations for onboarding presets, Character Planner `applyTalentPreset`, and Gear Planner talent hamburger.

## Exports

- `SHAMAN_TALENT_PRESET_NAMES` — display order (5 presets)
- `SHAMAN_TALENT_PRESETS` — map of preset label → `{ talents: Record<string, number> }`

Talent keys match `talents_new.js` (`tree-talentId`).

## Consumers

- `app.js` — `applyTalentPreset` in onboarding deps
- `gearPlannerView.js` — GP talents view hamburger (`applyGpShamanTalentPreset`)
