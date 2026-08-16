# onboarding.js — First-time and returning-user flow

## Overview

`runOnboarding(deps)` runs during `app.js` init (unless URL has `?b=` / `?build=` / `?gp=`, or the path is `/gear-planner` or `/gp`). It returns `true` when a build was applied so init skips `handleClassChange` and does not wipe loaded state. Gear Planner is usable as a guest (local plan save); Discord login is not required.

## Flow summary

1. **Share link / Gear Planner** — `?b=`, `?build=`, `?gp=`, `/gear-planner`, or `/gp`: return `false` (no overlay). Welcome step includes **Take me to Gear Planner** (`#onboarding-gear-planner-btn`), which navigates to `/gear-planner` and therefore skips the rest of onboarding.
2. **Discord + default build** — after `await profileManager.init()` in `app.js`, **`await profileManager.loadProfiles()`** runs again here so the default is chosen from a fresh `GET /profiles` (avoids stale SW/cache lists), then `loadProfile(defaultId, { silent: true })`, return `true`.
3. **Guest + local builds** — if not logged in and `profileManager.localBuilds` is non-empty, the **most recently updated** local build is loaded with `loadProfile(id, { silent: true })` and the function returns `true` (skips the welcome overlay, same high-level outcome as step 2).
4. **Discord + saved builds, no default** — **build picker** (not the welcome onboarding): waits up to ~5s for `profileManager` + `buildManager`, shows a compact overlay (`onboarding-overlay--build-picker`). Choosing a save loads silently and enters the app (`true`). **New character setup…** opens the full welcome wizard only if needed. Default-build auto-load (step 2 above) is unchanged.
5. **Everyone else** — welcome step → import or custom → class (if custom) → race (if custom) → **shaman talent preset** (horizontal icon row: `SHAMAN_PRESET_SPEC_ICONS` from `shamanConsumePresets.js`, question mark for “No Preset”, labels under icons, class/race-sized tiles — no card boxes) → **shaman consumable tier** (same layout: Budget / Standard / End Game coin icons, labels below) when a preset ≠ No Preset → `applyTalentPreset` then `applyShamanConsumePreset` → optional auto-save default when logged in.

End-of-flow **auto-save default** (`POST /profiles` with `isDefault: true`) parses the JSON body and checks `resp.ok && data.success` before treating the save as successful; failures are logged with `[Onboarding] Auto-save default profile failed`. `profileManager.loadProfiles()` still runs afterward so the UI can sync with whatever is on the server.

## HTML

- `index.html`: `#onboarding-step-pick-build`, `#onboarding-saved-builds-list`, `#onboarding-pick-build-error`, `#onboarding-new-build-btn`, `#onboarding-pick-build-user`, `#onboarding-step-1` (`#onboarding-gear-planner-btn`), `#onboarding-step-consumables`, `#onboarding-consume-tier-cards`.
- Styles: `style.css` — `#onboarding-overlay` uses `inset: 0` and `min-height: 100dvh` (with `100vh` / `-webkit-fill-available` fallbacks) so the splash fills the viewport across browsers; `#onboarding-card` has `max-height` + `overflow-y: auto` on short screens. `.onboarding-saved-builds-list`, `.onboarding-saved-build-row`, `.onboarding-new-build-fullwidth`. Preset / consumable steps: `.onboarding-preset-grid`, `.onboarding-preset-option` (+ `-icon`, `-label`); `.onboarding-consume-tier-grid`, `.onboarding-consume-tier-option` (+ `-icon`, `-label`) — flex wrap, ~72px icons, no background panels.

## Dependencies

`deps`: `getCurrentClass`, `getClassPickerEntries`, `getRacePickerEntries`, `setClass`, `setRace`, `triggerImport`, `applyTalentPreset`, `applyShamanConsumePreset`, `updateAllCalculations`. Class/race steps build grids from the picker entry helpers (main drawer lists omit the current selection). Uses `window.profileManager` and `window.buildManager` for pick-build and default load.

**Talent presets and DPS priority:** `getPresetShamanDpsPriority()` (`modules/shaman/dps.js`) loads full saved priority + opener from `modules/shaman/data/onboardingPresetShamanPriority.json`, generated from shared builds **Jd3iBv** (DPS Physhance), **pzPXR6** (Tank Physhance), **EeHfDM** (DPS Spellhance), **vlmQ8E** (Tank Spellhance), **RenYjt** (Elemental). Regenerate: `node scripts/extract-onboarding-preset-priority.mjs`. `applyTalentPreset` runs `loadBuildData` (talents only) then `setPriorityConfig` with that snapshot.

**Consumable presets:** `applyShamanConsumePreset(spec, tier)` in `app.js` applies `buffs[]` from `modules/shaman/data/onboardingConsumePresets.json` via `applyBuffListToDom` (`buffs.js`). Regenerate from `builds/*.json`: `node scripts/extract-onboarding-consume-presets.mjs`. Tier keys: `budget`, `standard`, `max` (UI label “Max” / End Game).
