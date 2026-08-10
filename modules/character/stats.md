# modules/character/stats.js

Central stat definitions (`STAT_TEMPLATE`), tooltip parsing (`parseStatsFromTooltip`), and target-type bonuses.

## Creature-type bonuses

- **Melee:** `apVs*` keys — parsed from “Increases attack power when fighting …” / “+Attack Power when fighting …”. Resolved vs current DPS target via `getAttackPowerBonusVsCreatureType(totals, factionTag)`.
- **Spell:** `dmgHealingVs*` keys — parsed from effects like **Mark of the Champion**: “Increases damage done to Undead and Demons by magical spells and effects by up to 85”, plus alternate “spell damage and healing when fighting …” / “+Spell Damage and Healing when fighting …” lines. Resolved via `getSpellDamageHealingBonusVsCreatureType(totals, factionTag)`.

Multi-type clauses (e.g. “Undead and Demons”) split on “and” and apply the full value to each mapped type.

## Exports (selection)

- `STAT_TEMPLATE`, `AP_VS_GEAR_STAT_KEYS`, `DMG_HEALING_VS_GEAR_STAT_KEYS`
- `FACTION_TAG_TO_AP_VS_KEY`, `FACTION_TAG_TO_DMG_HEALING_VS_KEY`
- `AP_VS_DISPLAY_ORDER`, `DMG_HEALING_VS_DISPLAY_ORDER`
- `getApVsRowLabel`, `getDmgHealingVsRowLabel` (UI: “SP vs …”), `mapCreatureLabelToApVsStatKey`, `mapCreatureLabelToDmgHealingVsStatKey`
- `getAttackPowerBonusVsCreatureType`, `getSpellDamageHealingBonusVsCreatureType`
- `parseStatsFromTooltip`, `createEmptyStats`, enchant helpers

Calculator output spreads both `apVs*` and `dmgHealingVs*` from gear/enchants (see `modules/ui/calculator.js`). Shaman DPS merges target-matching bonuses into totals before `createShamanStatsFromCharacter` (`mergeDpsTargetFactionBonusesIntoTotals` in `dps.js`).
