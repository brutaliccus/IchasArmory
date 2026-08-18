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
- `parseStatsFromEnchantDescription`, `getEffectiveEnchantStats` — fill enchant `stats` from description when keys are missing (e.g. Sigil of Leeching)
- `formatSmartPercent` — UI percent formatting (`3%`, not `3.00%`)
- `parseSetBonusSheetStats` — includes **vampirism/leeching** (`+N% Vampirism`, `N% of damage dealt as healing`, etc.) before skip patterns that would reject "healing" lines
- `filterEnchantsByItemType`, `filterEnchantsByClass`, `getEnchantRestrictedClasses`, `getEnchantBaseName`

### Enchant class filter

`filterEnchantsByClass(enchants, playerClass)` hides enchants restricted to other classes. Restriction sources (first match):

1. `enchant.classes` array (lowercase ids)
2. `tooltip_lines_raw` line `Classes: Shaman` / `Classes: Warrior, Paladin`
3. `description` — same `Classes:` line, or “only usable by …” / “requires …” class text
4. Name suffix `(Druid)` etc.
5. `effect_id` map (`ENCHANT_EFFECT_CLASS_MAP`) — ZG head/leg IDs 2583–2591, Gift of Ferocity 3004
6. Known base names (`ENCHANT_BASE_CLASS_MAP`) with apostrophe normalization (`'` / `'`)

**ZG head/leg (Turtle/Octo):** Animist's Caress → druid; Falcon's Call → hunter; Presence of Sight → mage; Syncretist's Sigil → paladin; Prophetic Aura → priest; Death's Embrace → rogue; Vodouisant's Vigilant Embrace → shaman; Hoodoo Hex → warlock; Presence of Might → warrior; Gift of Ferocity → druid.

Used by `openEnchantModal` / `filterEnchantItems` with `getPlayerClassForItemFilters()` — GP mode prefers `#gp-class-sidebar` / `setItemModalPlayerClassOverride`; CP uses `#class-race-sidebar`. Also used in `gearCompare.js` and `gearPlannerView.js` `pruneSlotEnchant`.

Calculator output spreads both `apVs*` and `dmgHealingVs*` from gear/enchants (see `modules/ui/calculator.js`). Shaman DPS merges target-matching bonuses into totals before `createShamanStatsFromCharacter` (`mergeDpsTargetFactionBonusesIntoTotals` in `dps.js`).
