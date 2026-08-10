# modules/shaman/targetSchoolImmunity.js

Pure helpers for **per-school target immunity** (raid boss JSON rows and the in-memory DPS sim boss payload from `dps.js`).

## Exports

- **`defaultTargetSchoolImmune()`** — all seven flags `false`.
- **`targetSchoolImmuneFromBossPayload(boss)`** — reads `immune_physical`, `immune_nature`, `immune_fire`, `immune_frost`, `immune_shadow`, `immune_arcane`, `immune_holy` from a boss row or saved payload.
- **`isTargetSchoolImmune(stats, school, isPhysicalDamage)`** — reads `stats.targetSchoolImmune`; physical checks use `isPhysicalDamage === true` or `school === 'physical'`.

## Wiring

- **`ShamanStats.targetSchoolImmune`** — serialized in `toJSON` / workers.
- **`getFreshShamanStats()`** (in `dps.js`) calls **`applyTargetSchoolImmunitiesFromSessionBoss`** so abilities + sim see current flags (session payload or Patchwerk row).
- **Sim:** `combatSim.js` `rollDamage`, `castLightningStrike` (split phys/nature); **rotation** — `isAbilityBlockedByTargetSchoolImmunity()` / early exit in `canExecuteAbility()` so abilities whose primary `shamanSpells` school is immune are never chosen (opener steps skip the same way; `_shouldDelayForHigherPriority` ignores immune keys; `_handleOpenerPreCast` does not pre-cast them). **Lightning Strike** is skipped only when **both** physical and nature are immune. **Hand of Edward** uses `simContext.handOfEdwardSpell`’s school. `damageSystem.js` `rollDamage`, `calculateExpectedDamage`, `rollForResistanceStandalone`.
- **Analytical:** `damageCalc.js` (`applyMagicResistance`, Lightning Strike block, main spell loop, Flametongue/Frostbrand branches).

Immune hits: **0 damage**, no attack/resist rolls; imbue proc helpers treat `outcome.type === 'immune'` like non-hits for spell-hit procs.
