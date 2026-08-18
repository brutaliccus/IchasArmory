# modules/shaman/dps.js - Shaman DPS Simulation & Optimization

## Overview

`modules/shaman/dps.js` is the **largest file in the IchaCalc codebase** (6,453 LOC) and serves as the complete DPS simulation UI and calculation engine for Shaman characters. It provides:

- **Ability Damage Calculations** - Calculates DPS for all shaman spells and abilities
- **Combat Simulation** - Full combat simulation with rotation priorities, procs, and threat tracking
- **Stat Weight Generation** - SimC-style stat weight calculations via +delta simulations
- **Interactive UI** - Multi-tab interface for abilities, combat sim, and stat weights
- **Rotation Optimizer** - Configurable ability priorities and rotation strategies
- **Analytical & Simulation Modes** - Fast analytical math + detailed combat sims

**File Size:** 6,453 lines of code
**Type:** ES6 Module
**Primary Use:** Shaman DPS optimization and theorycrafting

---

## Architecture Overview

```
dps.js (Main DPS UI & Coordination)
├── Data Layer
│   ├── getFreshShamanStats() - Aggregates character state into ShamanStats object
│   ├── createShamanStatsFromCharacter() - Converts totals/talents/buffs to stats
│   ├── mapTalentsToStats() - Maps talent bonuses to shaman modifiers
│   ├── mapBuffsToStats() - Maps active buffs to shaman modifiers
│   └── applyResistanceDebuffs() - Applies resistance debuffs to target
│
├── Calculation Layer
│   ├── calculateAllSpells() - Calculates DPS for all abilities (analytical)
│   ├── calculateAnalyticalStatWeight() - Fast analytical stat weight calculation
│   ├── runShamanSimulation() - Full combat simulation (imported from combatSim.js)
│   └── cloneShamanStats() - Clones stats for +delta simulations
│
├── UI Layer
│   ├── initializeDPSSimulation() - Initializes DPS sim panel
│   ├── updateDPSSimulation() - Updates DPS sim when gear/talents change
│   ├── renderDPSSimulation() - Renders complete DPS UI
│   ├── generateAbilitiesTabHTML() - Abilities tab UI
│   ├── generateDpsSharedTargetStripHTML() - Target readout + settings cog (Combat Sim / Stat Weights / Gear Compare / Results)
│   ├── generateCombatSimResultsHTML() - Results tab: damage/threat sub-tabs; under Damage, **Details | Distribution** (styled sub-tabs + **Runs** / **DPS** axis labels in **`shaman-dps.css`**); Distribution shows **101 DPS bins** (height = prevalence / count per bin); **`renderSimDpsHistogram()`** adds **Y-axis run-count ticks** (nice steps from 0 to max bin count; aligned with the bar column so tick % matches bar height / max bin count) and **X-axis markers** (P25 / P50 / P75 + **Max** = highest run, linear quantiles on sorted per-iteration DPS; degenerate min=max shows one merged label); **`lastShamanSimDistributionBundle`** keeps data across seeded single-iter replays until the next full sim; timelines (hero is **`generateSimResultsHeroHTML()`** → **`#sim-global-hero-host`**, fixed to the **right** of **`#character-status-bar`** (to **`#gear-icons-right`** / viewport), **`syncGlobalSimHeroHostLayout`**). **Copy snip** (`#sim-hero-copy-snip-btn`): stacked-squares copy outline (`SIM_HERO_CLIPBOARD_SNIP_SVG`, `currentColor` orange); **no** filled/bordered button chrome—transparent hit area, keyboard **:focus-visible** ring. Dynamic **`import('html-to-image')`** → **`toPng`** on **`#sim-results-hero`** with filter excluding **`.sim-hero-run-wrap`**, **`.sim-hero-metric-arrow`** (DPS/TPS ‹ ›), and the snip control; **`copySimHeroCardImageToClipboard()`** writes PNG to **`navigator.clipboard`** (`ClipboardItem`).
│   ├── generateCombatSimTabHTML() - Combat sim tab UI (run sim row + priority)
│   └── generateStatWeightsTabHTML() - Stat weights tab UI
│
├── Combat Simulation UI
│   ├── setupCombatSimulator() - Configures combat sim controls; **`executeShamanCombatSimulation()`** runs from hero **Run Sim** + mode cog menu
│   ├── displaySimulationResults() - Shows detailed sim results; **Distribution** uses persisted bundle + delegated bar clicks → `replayShamanSimulationIteration` (re-renders **Details**; histogram unchanged until a new multi-iter sim)
│   ├── renderDamageTimeline() - Damage over time graph
│   ├── renderThreatTimeline() - Threat over time graph
│   ├── renderProcUptimeTimeline() - Proc uptime visualization
│   └── renderBuffTracking() - Buff/debuff tracking timeline
│
├── Stat Weights UI
│   ├── setupStatWeightsGenerator() - Configures stat weight generation
│   ├── updateStatWeightsTable() - Updates stat weight display
│   ├── sortStatWeightsTable() - Sorts stat weight results
│   └── setupStatWeightsSorting() - Configures sortable columns
│
└── Configuration
    ├── setupCombatConfig() - Rotation priority configuration UI
    ├── getPriorityConfig() - Exports priority config (for builds)
    ├── setPriorityConfig() - Imports priority config (from builds)
    ├── getPresetShamanDpsPriority(presetName) - Onboarding shaman presets → full `shamanDpsPriority` snapshot from `data/onboardingPresetShamanPriority.json` (regenerate: `node scripts/extract-onboarding-preset-priority.mjs`; includes **Elemental** from build **RenYjt**)
    ├── applyOnboardingPriorityPreset() / showPriorityPresetRadialMenu() (internal) - Totemic icon first in each priority row; **`openCustomRadialMenu`** from `radialMenu.js` (same wheel/animation as gear compare) applies full preset via `setPriorityConfig` + refresh
    └── getStoredStatWeights() - Retrieves cached stat weights
```

---

## Key Responsibilities

### 1. Character State Aggregation
- Pulls data from calculator (`window.getFreshCalculatorTotals()`)
- Aggregates talents, buffs, gear, set bonuses
- Converts to `ShamanStats` object for calculations/simulations
- **`mergeDpsTargetFactionBonusesIntoTotals()`** — Adds melee `apVs*` and spell `dmgHealingVs*` bonuses that match the current DPS session target faction into `attackPower`, `dmgAndHealing`, and `healing` before `createShamanStatsFromCharacter` (used by `getFreshShamanStats`, full DPS render, abilities tab refresh).

### 2. Ability Damage Calculations
- Calculates damage/DPS for all shaman spells
- Accounts for talents, buffs, resistances, crits
- Provides detailed breakdowns (crit DPS, resist %, etc.)

### 3. Combat Simulation
- Full combat simulation with rotation priorities
- Proc tracking (Flametongue, Lightning Shield, trinkets, etc.)
- Threat generation tracking (for TPS analysis)
- Timeline visualization (damage, threat, procs, buffs)

### 4. Stat Weight Generation
- SimC-style +delta stat weight calculations
- Hybrid approach: analytical for simple stats, simulation for complex stats
- Caches weights per build (persists across sessions)
- Compares DPS vs TPS stat weights

### 5. Interactive UI
- **Abilities Tab:** Shows DPS for all abilities, sortable columns
- **Combat Sim Tab:** Full combat simulation with rotation config, detailed results
- **Stat Weights Tab:** Stat weight generation and results display
- **Gear Compare (shaman DPS tab):** **Item Compare** sub-tab — slot radial, comparison list with flat bundle indent (`GC_BUNDLE_INDENT_PX`), dashed **+ Add Item** (including empty list), per-row **+ Add Bundle Item** (same slot radial as context menu; `closeRadialMenu` before open). **Build Compare** sub-tab — **`window.getShamanSavedBuildsForCompare()`** (`profiles.js`) lists **saved** shaman builds (Discord cloud + local **`ichacalc_local_builds_v1`**); two fixed-order gear icon rows per build (`BUILD_COMPARE_ROW1_SLOTS` / `BUILD_COMPARE_ROW2_SLOTS`); **`runBuildCompareSim`** snapshots **`buildManager.getBuildData()`**, runs baseline + sequential **`loadBuildData`** sims, restores in **`finally`**, then writes ranked **`displayBuildCompareResults`** (after restore so the DPS re-render does not wipe results). Sub-tab choice persisted in **`sessionStorage`** key **`dpsGearCompareSubtab`**. While item or build compare sims run, **`suppressDpsSimResultsTabAutoSwitch`** blocks **`renderDPSSimulation`** from auto-clicking the **Results** tab when a prior sim left **`#combat-sim-results`** visible; **`getLiveGearComparePanel`** re-queries **`#tab-gear-compare`** after **`await`**s so status/results target the current DOM after **`loadBuildData`** refreshes the panel.

---

## Major Sections

### 1. Character State Aggregation (Lines 1-259)

#### `getFreshShamanStats()` (Lines 18-57)
**Purpose:** Get current character state as `ShamanStats` object

**Process:**
1. Call `window.getFreshCalculatorTotals()` to get fresh stats
2. Get fresh talent bonuses from `getTalentBonuses('shaman')`
3. Get active buffs from `getActiveBuffs(talentBonuses)`
4. Get equipped gear from `getEquippedGearObjects()`
5. Calculate set bonuses from `getSetBonuses(equippedGear)`
6. Get spell strike sources from `getAllSpellStrikeSources()`
7. Add situational **AP vs Undead / Beasts / Demons** from calculator totals when **`getDpsSessionTargetFactionTag()`** matches (`getAttackPowerBonusVsCreatureType`), then call `createShamanStatsFromCharacter()` with adjusted **`attackPower`**

**Returns:** Fresh `ShamanStats` object with current gear/talents/buffs

**Export:** `getDpsSessionTargetFactionTag()` — normalized boss **`faction`** for UI/sim (used with **`getAttackPowerBonusVsCreatureType`** from **`stats.js`**).

**Used by:** All calculations and simulations (ensures fresh state)

#### `createShamanStatsFromCharacter(totals, talentBonuses, activeBuffs, setBonuses, equippedGear, spellStrikeSources)` (Lines 62-259)
**Core conversion function** - Converts calculator output to `ShamanStats` object

**Process:**

1. **Create ShamanStats instance**
   ```javascript
   const stats = new ShamanStats();
   ```

2. **Set spell strike sources** (spell damage on melee hits)
   - Incendosaur 2pc: +2 Fire spell strike

3. **Detect special items:**
   - Totem of Rage (22395) - +rage generation
   - Totem of Broken Earth (55114) - +earth shock damage
   - Totem of the Stonebreaker (61204) - 35% chance on shock for +130 AP
   - Badge of the Swarmguard (21670) - Armor reduction proc

4. **Calculate spell damage:**
   ```javascript
   // totals.dmgAndHealing already includes gear + enchants + set bonuses + buff spell damage
   stats.spellPower = totals.dmgAndHealing
   stats.natureDamage = totals.natureDamage  // Includes buffs
   stats.fireDamage = totals.fireDamage      // Includes buffs
   stats.frostDamage = totals.frostDamage    // Includes buffs (e.g. Frostbrand imbue toggle)
   ```

5. **Set offensive stats:**
   - Attack Power, Spell Crit, Melee Crit, Spell Hit, Melee Hit, Weapon Skill
   - Armor penetration and **spell penetration** from `totals` (`armorPen`, `spellPen`) so the sim matches calculator gear/enchants/talents and virtual stat-weight items
   - Glancing blow damage %, Enemy dodge chance %

6. **Set defensive stats** (for Lightning Shield procs when attacked):
   - Dodge, Parry, Block, Block Value, Defense, Armor, Physical DR, Health

7. **Extract weapon damage:**
   ```javascript
   // Parse weapon stats from equipped mainhand
   baseWeaponSpeed = weaponStats.weaponSpeed

   // Use totals weapon damage if available (includes AP)
   if (totals.weaponDamageMin && totals.weaponDamageMax) {
       stats.weaponDamage = { min: totals.weaponDamageMin, max: totals.weaponDamageMax }
   } else {
       // Calculate: (BaseDmg + AP/14 × Speed) × Multiplier
       apContribution = (ap / 14) * baseWeaponSpeed
       stats.weaponDamage = { min: floor(...), max: ceil(...) }
   }

   // Calculate hasted weapon speed
   hastedWeaponSpeed = baseWeaponSpeed / (1 + hastePercent / 100)
   stats.baseWeaponSpeed = baseWeaponSpeed    // For PPM procs
   stats.weaponSpeed = hastedWeaponSpeed      // For swing timing
   ```

8. **Set target parameters:**
   ```javascript
   stats.targetLevel = 63          // Raid boss
   stats.playerLevel = 60
   stats.natureResist = 0          // Enemy resistances (configurable)
   stats.fireResist = 0
   // ... etc
   ```

9. **Map talents to stats:** `mapTalentsToStats(stats, talentBonuses)`

10. **Map buffs to stats:** `mapBuffsToStats(stats, activeBuffs)`

11. **Apply resistance debuffs:** `applyResistanceDebuffs(stats, activeBuffs)`

12. **Detect weapon imbues:**
    - Flametongue Weapon detection
    - Windfury Weapon detection

13. **Calculate threat multipliers:**
    ```javascript
    // Spirit Armor: +5% per rank (10% at 2/2)
    threatSpiritArmorMult = 1 + spirit_armor_threat_percent / 100

    // Rockbiter: +35% threat; T2.5 5/5 adds 25% to Rockbiter -> 43.75%
    rockbiterBonus = 0.35 * (1 + rockbiter_weapon_bonus)
    threatRockbiterMult = hasRockbiter ? (1 + rockbiterBonus) : 1

    // Calming Winds: 8/16/25% threat reduction (only when NOT Rockbiter)
    threatCalmingWindsReduction = !hasRockbiter ? calming_winds_threat_reduction : 0

    // Greater Blessing of Salvation: 25% threat reduction
    threatSalvationMult = hasSalvation ? 0.75 : 1

    // Totemic Alignment: X% of totem threat transfers to you
    totemicAlignmentThreatPercent = totemic_alignment_threat_percent || 0
    ```

14. **Store references:**
    - `stats.activeBuffs = activeBuffs`
    - `stats.talentBonuses = talentBonuses`
    - `stats.setBonuses = setBonuses`

**Returns:** Complete `ShamanStats` object ready for calculations/simulation

---

#### `mapTalentsToStats(stats, talentBonuses)` (Lines 264-346)
**Purpose:** Reverse-engineer talent ranks from aggregated talent bonuses

**Talent Mappings:**
```javascript
// Concussion: 1% per rank (max 5%)
// Elemental Fury: 5% damage per rank (max 10% at 2/2)
// Both contribute to elemental_damage_percent
concussionPercent = elemental_damage_percent - elementalFuryDamagePercent
concussionRanks = min(max(round(concussionPercent), 0), 5)

// Elemental Fury: 50% crit damage per rank (2 ranks max)
elementalFuryRanks = min(round(elemental_fury_crit_damage / 50), 2)

// Element's Grace: 2% weapon damage per rank (5 ranks max = 10%)
elementsGraceRanks = min(round(weaponDamageMultiplier * 100 / 2), 5)

// ... many more talent mappings (see code for full list)
```

**Complexity:** Requires reverse-engineering because talent system stores aggregated bonuses, not individual ranks

---

#### `mapBuffsToStats(stats, activeBuffs)` (Lines 350-375)
**Purpose:** Detect active buffs and toggle shaman modifiers

**Buff Detections:**
- Flametongue Weapon
- Frostbrand Weapon (`frostbrandActive`; Frostbrand proc damage uses `spells.js` frost modifiers including Elemental Fury and Element's Grace **spell crit** via `hasElementsGraceCrit`, same idea as Flametongue)
- Windfury Weapon
- Rockbiter Weapon (for threat)
- Greater Blessing of Salvation (threat reduction)

**Sets modifiers:** `stats.toggleModifier('flametongueActive', true)`

---

#### `applyResistanceDebuffs(stats, activeBuffs)` (Lines 379-428)
**Purpose:** Reduce target resistances based on active debuffs

**Debuff Detections:**
```javascript
// Curse of Elements (improved): -88 resist all
// Curse of Shadows (improved): -75 shadow/arcane
// Faerie Fire (improved): -5% armor

if (curseOfElementsImproved) {
    stats.natureResist -= 88
    stats.fireResist -= 88
    stats.frostResist -= 88
}

if (curseOfShadowsImproved) {
    stats.shadowResist -= 75
    stats.arcaneResist -= 75
}

if (faerieFireImproved) {
    stats.armorReductionPercent += 5  // 5% armor reduction
}
```

---

### 2. Ability Damage Calculations (Lines 432-712)

#### `calculateAllSpells(stats)` (Lines 432-453)
**Purpose:** Calculate DPS for all shaman abilities (analytical)

**Process:**
1. For each spell in `shamanSpells`:
   - Call `calculateSpellDPS(spell, stats)` from `damageCalc.js`
2. Returns map of spell results:
   ```javascript
   {
       'Lightning Bolt': { dps, avgDamage, castTime, crit, resist, ... },
       'Chain Lightning': { ... },
       // ... all spells
   }
   ```

**Used by:** Abilities tab UI

#### `generateAbilityTooltip(spell, result, stats)` (Lines 457-711)
**Complex tooltip generator** - Shows detailed breakdown for each ability

**Tooltip Sections:**
1. **Spell Name & Icon**
2. **Base Stats:** Cast time, mana cost, cooldown
3. **Damage Breakdown:**
   - Base damage (min-max)
   - Spell power coefficient
   - Crit chance, crit damage
   - Resist chance, resist damage
   - Average hit damage, average total damage
4. **DPS:** Total DPS with uptime
5. **Talent Modifiers:** Lists all active talents affecting this ability
6. **Set Bonuses:** Lists active set bonuses
7. **Proc Info:** If ability can proc (e.g., Flametongue)

**Example Tooltip:**
```
Lightning Bolt
━━━━━━━━━━━━
Cast Time: 2.0s
Mana: 265
Cooldown: None

Damage: 380 - 433
+ 71.4% Spell Power (128)
= 508 - 561 damage

Crit: 15.2% (× 200% dmg)
Resist: 2.0% (× 25% dmg)

Avg Hit: 534
Avg Total: 562
DPS: 247.6

Talents:
  Convection 5/5: -10% mana
  Concussion 5/5: +5% damage
  Call of Thunder 5/5: +5% crit
```

---

### 3. DPS Simulation UI (Lines 716-1366)

#### `renderDPSSimulation(containerElement, totals, talentBonuses, activeBuffs, config, setBonuses, equippedGear)` (Lines 716-945)
**Main UI rendering function** - Builds complete DPS sim interface

- **Sim target default** — Boss is **in-memory** (**`dpsSimSessionBossPayload`**); **not** saved to **`localStorage`**. **Gear/talent redraws** preserve the current target by copying modal boss fields from the pre-**`innerHTML`** DOM (**`generateSimConfigModalHTML(container, stats, forceDefaultBoss)`**). **Patchwerk** (**16028**) is forced when **`resetDpsSimBossForNewContext()`** runs (build load, URL build import, armory import, leaving shaman) or on first paint (no existing **`#sim-duration`**). After mount, **`applyLoadedDpsBossFromPayload(Patchwerk)`** runs only when not preserving across render. Full page refresh clears module state → Patchwerk. Session payload includes **`faction`** (creature tag, normalized) for the current target; **`getFreshShamanStats`** sets **`stats.targetFaction`** from session or the default boss JSON row (**`applyTargetFactionFromSessionBoss`**).
- **No top title bar** — the container opens with **`.dps-sim-stats`** (no decorative **`h3.dps-sim-title`**).
- **`.dps-sim-stats`** (above tabs): **`generateDpsSimStatsSummaryHTML(displayStats)`** — one horizontal row (spell chips **`|`** melee chips), **`font-size: 1.3em`** in **`shaman-dps.css`**, slightly wider chip gaps on **`.dps-sim-stats-line--combined`**. Attack speed **`title`** when passive haste applies.

**UI Structure:**
```html
<div class="dps-sim-container">
    <!-- Tabs: Abilities | Combat Sim | Stat Weights -->
    <div class="dps-tabs">
        <button>Abilities</button>
        <button>Combat Sim</button>
        <button>Stat Weights</button>
    </div>

    <!-- Abilities Tab -->
    <div id="abilities-content">
        <!-- Ability table with sortable columns -->
    </div>

    <!-- Combat Sim Tab -->
    <div id="combat-sim-content">
        <!-- Combat config + Run Sim button -->
        <!-- Sim results (damage timeline, threat, procs, etc.) -->
    </div>

    <!-- Stat Weights Tab -->
    <div id="stat-weights-content">
        <!-- Stat weight generation controls -->
        <!-- Stat weight results table -->
    </div>
</div>
```

**Process:**
1. Call `getPreservedValues(containerElement)` **before** replacing `innerHTML` and keep the snapshot as `preservedSimValues` (restoration must not re-read the DOM after the wipe, or tables read as empty).
2. Create `ShamanStats` from character state
3. Calculate all spells with `calculateAllSpells()`
4. Generate HTML for all tabs
5. Set up event listeners (tabs, tooltips, config, sorting)
6. Restore sim summary/breakdown from `preservedSimValues` when results were visible; restore stat-weight rows whenever scraped weights exist (even if the sim summary was collapsed). After restoring weights from DOM text, `persistLastStatWeightsFromDisplayRows()` refreshes `ichacalc_statWeights_last` so item search / tooltips still have numeric `statDps` after a gear change changes `getBuildHash()`.

#### `initializeDPSSimulation()` (Lines 1307-1321)
**Initialization function** - Called once on app startup

**Process:**
1. Get `#dps-sim-content` container
2. If shaman class selected, call `updateDPSSimulation()`

#### `updateDPSSimulation(totals, talentBonuses, activeBuffs, setBonuses, equippedGear)` (Lines 1326-1365)
**Update function** - Called whenever gear/talents/buffs change

**Process:**
1. Get `#dps-sim-content` container
2. Get fresh stats with `getFreshShamanStats()`
3. Get priority config from UI (if exists)
4. Call `renderDPSSimulation()` to rebuild UI

**Called by:** `app.js` in `updateAllCalculations()`

---

### 4. Abilities Tab (Lines 2010-2191)

#### `generateAbilitiesTabHTML(spellResults, stats)` (Lines 2010-2083)
**Generates abilities tab UI**

**Table Structure:**
```
| Ability           | DPS    | Avg Dmg | Cast | Mana | DPET | DPM   | Crit % |
|-------------------|--------|---------|------|------|------|-------|--------|
| Lightning Bolt    | 247.6  | 534     | 2.0s | 265  | 267  | 2.01  | 15.2%  |
| Chain Lightning   | 198.3  | 791     | 2.5s | 565  | 316  | 1.40  | 15.2%  |
| ...               |        |         |      |      |      |       |        |
```

**Features:**
- Sortable columns (click header to sort)
- Color-coded rows (spells vs shocks vs totems)
- Tooltips on hover (detailed breakdowns)
- Includes all abilities: spells, shocks, totems, weapon imbues, auto-attacks

#### `generateAbilityRowHTML(key, result, spellResults, stats)` (Lines 2088-2190)
**Generates single ability row**

**Calculations:**
- DPS (damage per second)
- Avg Dmg (average damage per cast)
- Cast (cast time)
- Mana (mana cost)
- DPET (damage per execute time)
- DPM (damage per mana)
- Crit % (crit chance)

**Special Handling:**
- Auto-attacks show swing timer instead of cast time
- **Flametongue Weapon** and **Frostbrand Weapon** (when the matching imbue buff is active) render as **sub-abilities** under **Auto Attack** with the same hover tooltip pipeline (`generateAbilityTooltip`); **Frostbrand** uses **`spellResults.frostbrandWeapon`** and is omitted from the main sorted list (`frostbrandWeapon` key skipped like **`flametongueWeapon`**)
- Totems show duration instead of cast time
- Instant casts show "Instant"

---

### 5. Combat Sim Tab (Lines 1370-1575, 3696-3948, 4053-5349)

#### Shared target strip (`generateDpsSharedTargetStripHTML`) + Combat tab (`generateCombatSimTabHTML`)

- **`#dps-sim-sidebar-column`**: Fixed width **~202px** (`+30px` vs legacy), **`align-self: stretch`** on **Combat Sim** only via **`dps-sim-body-main-row--combat-sim`** so **`.dps-shared-target-strip`** **`flex`-grows** to match the **Priority System** panel height (top/bottom align); other sim sub-tabs keep **`align-items: flex-start`**. **`.dps-sim-body`** **`padding-top: 14px`** offsets the boss card and sim panels from the DPS tab bar border. **`.dps-combat-priority-column .priority-system-section`**: **`margin-top: 0`** so tops line up with the sidebar. **`.dps-shared-target-strip`**: **`border: 1px solid var(--border-color)`**. **`#dps-summary-*`**: vertical list (Armor / Nature / Fire / Frost / Swing / **Duration** / **Iterations**). **`syncDpsCombatTargetSummaryPanels`**: **Swing** shows effective seconds from **`#config-enemy-swing-timer`** whenever a value or **`data-base-enemy-swing`** exists (not gated on tanking). **Duration** / **Iterations** as above. The strip shows **target name + summary stats only** (no settings cog); open **Simulation settings** from the **hero** cog next to **Run Sim**.
- **`dps-combat-main-layout`:** **Combat Sim** tab is **priority column only**; **Run Sim** + **simulation settings** cog (**`.dps-sim-config-open-btn`**) live in **`generateSimResultsHeroHTML()`** (global hero host). The cog opens **`#dps-sim-config-modal`**, which is **appended to `document.body`** after each **`renderDPSSimulation`** so it stays visible when the **DPS Sim** character-card tab (`#dpssim-tab`) is hidden (Stats/Talents/etc.); **`teardownGlobalSimHeroHost`** removes the portaled modal when leaving Shaman.
- **Live values:** Summary numbers mirror **`#target-armor`**, **`#target-nature-resist`**, **`#target-fire-resist`**, **`#target-frost-resist`**, **`#config-enemy-swing-timer`** (when tanking), **`#sim-duration-min`** / **`#sim-duration-sec`**, **`#sim-iterations`**, and **`#dps-boss-search`** (modal). **`updateBossStatsDisplay()`** recomputes effective armor/resists and **boss swing** from debuffs: **`attack_speed_reduction`** on active buffs (e.g. Thunderfury, Thunderclap) scales swing like the tank sim — **`effectiveSwing = baseSwing × (1 + Σ reduction)`**; base swing is pinned on **`#config-enemy-swing-timer`** as **`data-base-enemy-swing`** (boss load / manual edit). Modal **`#boss-stats-content`** shows base vs effective swing when tanking. **`syncDpsCombatTargetSummaryPanels()`** refreshes the strip. **`setupCombatSimulator`** listens for **`input`/`change`** on the modal target fields, swing timer, duration, iterations, and boss search so the strip stays in sync while on any sim sub-tab; opening the sim settings modal calls **`updateBossStatsDisplay()`** again. Modal regeneration preserves swing via **`generateSimConfigModalHTML`** (`lastDPSBoss.attackSpeed` / prior **`data-base-enemy-swing`**).
- **Gear Planner quick sim:** **`runGearPlanQuickSim(gearPlan)`** uses **`withGearPlanCharacterContext`** (same fork as **`runGearPlanStatWeightSimulations`**) so **`getFreshShamanStats()`** reads GP class/race/talents/buffs/gear/enchants instead of Character Planner DOM. Combat target, duration, iterations, and threat options come from **`captureShamanStatWeightSimOptions`** (sim settings modal DOM). **`gearPlannerView.runQuickSim`** calls **`flushGpOverlayStateToPlan()`** first so open GP talent/buff overlays sync into the plan snapshot.
- **Sim settings modal:** **`generateSimConfigModalHTML()`** builds **`#dps-sim-config-modal`** (then moved to **`document.body`** with **`data-ichacalc-sim-config-ready="1"`**; **`isDpsSimConfigModalReady()`** verifies body portal + handlers). **`ensureDpsSimConfigModalExists()`** removes stale modals (e.g. left inside hidden DPS tab without handlers) before **`bootstrapDpsSimConfigModalStandalone()`**, which uses **`resolveBootstrapStatsForSimConfigModal()`** / **`getDefaultDpsCombatConfig()`** so Gear Planner can open the modal without a **`ShamanStats`** instance (no **`beingAttacked`** throw). **`resolveDpsCombatConfigForModal()`** merges defaults + **`stats.combatConfig`** and preserves toggle state from existing modal DOM on re-render. **`prepareDpsSimConfigForGearPlanner()`** eager-bootstraps for GP; **`#gp-sim-settings-btn`** uses **direct click** → **`openGpSimConfigModal()`** → **`openDpsSimConfigModal()`**. Modal **`z-index: 10050`**; dialog **max-width ~820px**): **three-column** top grid **`.dps-sim-config-top-grid`** — **`grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) minmax(124px, 140px)`**, **`align-items: stretch`** so **`.dps-sim-config-top-col--boss`**, **`--timing`**, and **`--icons`** share the same row height. **Column 1 (boss):** search + armor/resists. **Column 2 (timing, centered vertically):** **`.dps-sim-config-timing-row`** — **column flex** (`flex-direction: column`, `gap: 12px`): **Duration** then **Iterations** bordered cards (**`simBoxStyle`**, **`min-height: 118px`** each), full width within the column (duration inputs slightly narrower; iterations **`max-width ~132px`**). **Column 3 (combat):** **tank / threat** label, compact **2×2** combat icons (**~52px** tiles), **`#aoe-config-container`**, then **`#dps-sim-run-mode-wrap`**: hidden **`#sim-run-mode`** (`advanced` \| `quick` \| `safe`) and a **dropdown** (**`#config-sim-run-mode-trigger`** + **`#config-sim-run-mode-menu`**) for **Advanced Sim** / **Quick Sim** / **Safe mode**; **`setupSimRunModePicker()`** wires it; **`applyHeroSimModeChrome()`** syncs hero split styling, hidden value, modal label, and hero cog tooltip. Below (**`#combat-config-section`**): modal boss picker (**`.dps-boss-picker--modal`**) — **`.dps-raid-tabs--modal`**: padded bordered tab bar, **~15px** tab labels, **min-height ~48px** buttons; **flex** boss grid (`justify-content: center`, `flex-wrap`) with tiles **`flex: 0 1 calc((100% - 42px) / 4)`** (four per row at modal width); **no inner scroll** (`max-height: none`); tall raids use **modal** `overflow: auto`. Sidebar picker uses the same **`generateDpsBossPickerHTML(false)`** pattern with a smaller but still readable tab bar (**~13px**). **Boss swing** full-width centered in **`.dps-sim-config-swing-row`**. When there is no saved target name and **`dpsRaidBossStats['16028']`** exists, the modal seeds **Patchwerk** and **`lastDPSBoss`** (`DPS_DEFAULT_BOSS_NPC_ID`); user-chosen bosses persist as before. **`setupSimConfigModal()`** wires every **`.dps-sim-config-open-btn`** via **`document.querySelectorAll`** (hero cog, etc.). **`openDpsSimConfigModal()`** is exported for Gear Planner (builds DPS sim DOM once if needed). Portrait URLs: **`dpsBossPortraits.js`**. **Boss load:** **`dpsRaidBossStats.json`** first (`getPreloadedDpsBossRecord`) with per-boss armor/resists/swing, optional **`iconUrl`**, and **`immune_*`** school flags; then **`applyLoadedDpsBossFromPayload`** (persists immunities on **`lastDPSBoss`**), else **`/bosses/scrape`**. Tiles use **`getDpsBossConfigIconUrl`** (JSON **`iconUrl`** overrides **`dpsBossPortraits`**; zamimg journal URLs pass through without **`resolveIconUrl`**).

#### `setupCombatSimulator(container, stats)` (Lines 1370-1575)
**Sets up combat sim controls and event listeners**

**Controls:**
1. **Fight Duration:** 60s default, configurable
2. **Target Level:** 60-63, default 63 (raid boss)
3. **Boss Armor:** Configurable, affects physical DPS
4. **Rotation Priority:** Drag-and-drop ability rows; each Enhancement (ST/AoE) list is prefixed by a **fixed Totemic** control (`data-priority-preset-slot`, not draggable) and a **fixed Searing Totem** tile (`data-searing-totem-slot`, not draggable, no priority index). Searing is click to enable/disable only; it is stored as **`searingTotemAuto.enabled`** on the root priority config and synced to **`stats.combatConfig.searingTotemEnabled`** for the sim (pre-fight ST drop and post–Fire Nova redrop skip Searing when disabled; Magma/AoE unchanged). Auto-generated **on-use trinket** rows use **`resolveOnUseTrinketIconForPriority`**: when the proc has an **`itemId`** and that trinket is equipped, the icon comes from the **item** (URL or Turtle basename), not **`proc.icon`**. The Totemic control opens a radial menu of onboarding presets (`onboardingPresetShamanPriority.json` keys). A subdued **“Presets”** caption sits just under the Totemic tile (`position: absolute`, out of flex flow so the row layout is unchanged). Wedge icons: **`ONBOARDING_PRIORITY_PRESET_ICONS`** (Turtle DB: Spellhance DPS `spell_fire_flametounge`, Spellhance Tank `spell_nature_earthshock`, Physhance DPS `spell_nature_cyclone`, Physhance Tank `earthshaker_slam_11`; unknown keys fall back to `inv_misc_questionmark`). Choosing one calls **`getPresetShamanDpsPriority` → `setPriorityConfig`** and refreshes all four priority lists plus the opener for the active tab. Drop handler re-inserts the preset slot first and keeps the Searing tile immediately after it. **Smart Priority** (star button + `calculateSmartPriority`) is commented out / disabled.
5. **Sim Iterations:** Number of simulation runs (default: 100)
6. **Run Simulation Button:** Triggers `runShamanSimulation()`
7. **Quick Sim Button:** Single fast sim (1 iteration)

**Event Listeners:**
- Run Sim → Run full simulation (100 iterations)
- Quick Sim → Run single simulation (fast preview)
- Update boss stats → Recalculate displayed values
- Priority config changes → Save to local storage

#### `setupCombatConfig(container, totals, talentBonuses, activeBuffs, setBonuses)` (Lines 1115-1272)
**Configures rotation priority UI**

- **Combat icon hover tooltips** (tank / shield / in front / threat hold): **`setupConfigTooltip`** appends **`.combat-config-tooltip`** to **`document.body`** with **`z-index: 10100`** so it appears above **`#dps-sim-config-modal`** when the sim settings dialog is open.

**Priority List:**
- Lightning Strike (if talented)
- Stormstrike (if talented)
- Earth Shock
- Flame Shock
- Lightning Bolt
- Chain Lightning
- Searing Totem (if talented)
- Fire Nova Totem (if talented)
- Auto-attacks (always on)

**Configuration:**
- **Preset reset:** Totemic atlas URL (`talents-heroclass-shaman-totemic.webp`) → **`showPriorityPresetRadialMenu`** → **`openCustomRadialMenu`** (shared `#radial-menu-container`, backdrop fade, **`radialItemFadeIn`** stagger); **`applyOnboardingPriorityPreset`** refreshes lists + opener.
- Drag-and-drop reordering (ability cards only; preset slot excluded)
- Enable/disable individual abilities
- Min/max mana thresholds per ability
- Conditional logic (e.g., "only if dot not active")

**Saved to:** Local storage (persists across sessions)

#### `displaySimulationResults(results, duration)` (Lines 4053-4191)
**Shows detailed simulation results**

- **`switchDpsSimTabToResults()`** runs at the **start** of **`displaySimulationResults`** and **`displayQuickSimResults`** (same for Advanced and Quick sim), so the UI switches to the **Results** tab no matter which DPS tab was active; placing it first avoids losing the switch if later breakdown / timeline / buff rendering throws.

**Results Display:**

1. **Summary Stats:**
   ```
   Total Damage:     245,832
   DPS:              4,097.2  (3,812 – 4,389)    ← 10th–90th percentile
   Total Threat:     312,456
   TPS:              5,207.6  (4,890 – 5,520)    ← 10th–90th percentile
   ```

2. **Average Effective Stats (mode-dependent, below summary):**
   - **Enhancement:** Avg Speed, Avg AP, Avg Fire Power, Avg Nature Power
   - **Elemental:** Avg Haste %, Avg Fire Power, Avg Nature Power
   - Sampled per damage event during sim, aggregated across iterations

3. **Damage Breakdown Table:**
   ```
   | Ability           | Count | Total Dmg | % of Total | DPS    | Avg Hit | Crit % |
   |-------------------|-------|-----------|------------|--------|---------|--------|
   | Lightning Bolt    | 45    | 89,234    | 36.3%      | 1,487  | 1,983   | 15.2%  |
   | Auto Attack       | 120   | 67,890    | 27.6%      | 1,131  | 566     | 12.4%  |
   | ...               |       |           |            |        |         |        |
   ```

3. **Threat Breakdown Table:** Same format as damage, shows threat generation

4. **Detailed Stats Modal (click any ability row):**

   Both the **Damage** and **Threat** modals share the same layout logic:

   - **Physical/melee attacks:** Flat table — Crit, Glancing, Hit, Miss, Dodge, Parry (with Resist/Block/Absorb columns)
   - **Binary spells (Earth Shock):** Flat table — Crit, Hit, Miss, Full Resist
   - **Non-binary spells with partial resists:** Single table with collapsible rows:
     - **Crit** row (aggregate: all crits including partial-resisted crits) — click caret to expand sub-rows: No Resist, 25%/50%/75% Resist
     - **Hit** row (aggregate: all hits including partial-resisted hits) — click caret to expand sub-rows: No Resist, 25%/50%/75% Resist
     - **Miss** / **Full Resist** — flat rows, no expansion
     - Uses 9-column layout (Type, Count, %, Amount/Threat, %, Min, Max, Average, Resisted)
     - **Resisted** column shows damage/threat lost to partial resists (derived: `dealt * resistFrac / (1 - resistFrac)`); parent rows total all child values
   - Damage modal sources counts from `combatStats.critResist*` / `hitResist*` fields; Threat modal derives the same split by filtering `damageEvents` by outcome + resistType

5. **Resource Usage:**
   - Total mana spent
   - Mana per second
   - Mana efficiency (DPS per mana)

5. **Proc Stats:**
   - Proc name, count, uptime %, avg uptime duration

6. **Timeline Graphs:**
   - Damage over time (cumulative + per-ability)
   - Threat over time (cumulative + per-ability)
   - Proc uptime timeline (visual bars)
   - Buff tracking timeline

#### `renderDamageTimeline(results, duration)` (Lines 4270-4320)
**SVG line graph showing damage over time**

**Features:**
- X-axis: Time (seconds)
- Y-axis: Cumulative damage
- Multiple lines: Total damage + per-ability breakdown
- Legend with color coding
- Tooltips on hover

#### `renderThreatTimeline(results, duration)` (Lines 4325-4378)
**SVG line graph showing threat over time**

**Same as damage timeline but for threat generation**

#### `renderProcUptimeTimeline(procStats, duration)` (Lines 4600-4864)
**Visual proc uptime timeline** (similar to tank sim)

**Design:**
- `procIdMapping` / reverse map must use the same keys as `ctx.buffUptime` in the sim (e.g. Totem of Crackling Thunder → `cracklingThunder` from `setBonusSystem.js`, not `totemOfCracklingThunder`; Fist of the Forgotten Order → `fistOfTheForgottenOrder`), or the row falls back to “?” icon/name. `ITEM_ICON_BY_ID` can supply icons for item-based rows (e.g. **61277**).
- Horizontal timeline (0 to duration)
- Each proc gets a row with color-coded uptime windows
- Tooltip on hover shows uptime window details
- Shows proc overlap (multiple procs active simultaneously)

#### `renderBuffTracking(results, duration, containerId)` (Lines 4869-4887)
**Buff/debuff tracking timeline**

- **`timelineDuration`**: if the passed **`duration`** is missing or non-positive, uses **`results.fightDuration`** so **`renderProcUptimeTimeline`** / **`computeTimelineRowUptime`** get a valid fight length (histogram single-iter replay used to show **0s / 0%** when duration was wrong).
- **`computeTimelineRowUptime`**: multi-iteration results keep **averaged** **`totalUptime` / `uptimePercent`**; single-iteration replay often leaves **`totalUptime` = 0** while **`activationTimes`** is filled — in that case seconds and % are **summed from windows** (not only when both stored fields were exactly null/0).

**Tracks:**
- Player buffs (Flametongue, Windfury, trinket procs, etc.)
- Debuffs on target (Flame Shock, etc.)
- Cooldown availability (shows when abilities come off CD)

---

### 6. Stat Weights Tab (Lines 1579-1728, 2197-3577)

#### `setupStatWeightsGenerator(container, stats)` (Lines 1579-1673)
**Sets up stat weight generation controls**

**Controls:**
1. **Stat Weight Type:**
   - DPS Weights (maximize damage)
   - TPS Weights (maximize threat)
2. **Fight Duration:** 60s default
3. **Iterations:** 50 default (per stat delta)
4. **Generate Button:** Runs stat weight simulations
5. **Results Table:** Shows stat weights sorted by value

**Event Listeners:**
- Generate → Run stat weight simulations
- Sort columns → Re-sort table
- Switch DPS/TPS → Show different weights

#### Stat Weight Calculation Process

**Hybrid approach: virtual items for flat stats, legacy clone-and-apply for percentage/RNG stats.**

Stats are split into two systems by volatility:

**Virtual-item path (flat stats) — single run, large delta:**
Synthetic items are equipped into a virtual gear slot in `gear.js`, causing their raw stats
to flow through the entire pipeline: `getGearStats()` → `calculateEffectiveHealth()` →
`createShamanStatsFromCharacter()` → full combat sim. This automatically captures all
multipliers (Kings, Trueshot Aura, talents, procs like Stormwolf's Frenzy), stat conversions
(AGI→crit, INT→spell crit, STR→AP), and proc interactions.
- AP (+200/200), STR (+100/100), AGI (+100/100), INT (+100/100)
- Armor Penetration (+100/100), Spell Power (+100/100), Nature SP (+100/100), Fire SP (+100/100), Spell Penetration (+5/5; small delta so weight matches marginal resist remaining on bosses)

**Legacy clone-and-apply path (percentage/RNG stats) — cap-aware, two-point method:**
Uses `cloneShamanStats()` to clone baseline, then applies deltas directly to the clone.
Has cap-aware logic (melee hit 8%, spell hit 16%), two-point method for crit/hit, and
multi-seed averaging for haste. Proven stable for these volatile stats.
- Physical Crit (+2%, two-point), Spell Crit (+2%, two-point)
- Physical Hit (+1-2%, cap-aware), Spell Hit (+1-3%, cap-aware, single-point)
- Haste (+5%, 3-seed averaged), Weapon Skill (+1, with glancing/dodge/hit/crit breakdown)

**Sim Flow:**
1. 1 baseline from `getFreshShamanStats()` with paired seed
2. Virtual-item deltas: 1 sim per flat stat (10 sims)
3. Legacy deltas: clone-and-apply with cap-aware logic (6+ sims for percentage stats)

Total sim count: ~1 baseline + 10 virtual + ~12 legacy = **~23 sims**.

#### `calculateAnalyticalStatWeight(baseResults, statDelta, statType, statKey, divisor, stats)`
**Fast analytical stat weight calculation** (legacy, used for fireSp/natureSp only; spell pen uses virtual-item + full sim)

#### Legacy clone-and-apply simulation
**Full combat simulation for percentage/RNG stats** (physCrit, spellCrit, physHit, spellHit, haste, wepSkill)

Old derived-stat code (AGI from physCrit, INT from spellCrit, SP from fireSp+natureSp) is
preserved as comments in `runStatWeightSimulations` for reference.

**Time:** ~8-20 seconds for full stat weight generation

**Caching:** Results cached per build hash (persists across sessions)

#### `getStoredStatWeights(isAoe)`
**Retrieves cached stat weights from localStorage**

**Lookup order:** `statWeights[_aoe]_<buildHash>` → `ichacalc_statWeights_last[_aoe]` → `statWeights[_aoe]_discord_<userId>`.

Build-hash keys miss after any gear/talent/buff change that alters `getBuildHash()`; the **last** keys keep the most recent run on this browser so item search / `calculateItemDpsScore` still see `statDps` until the user regenerates weights.

**Returns:** Array of row objects (including `statDps`, `statTps`, display strings) or `null` if nothing is cached.

#### `saveStatWeights(weights, isAoe)`
**Saves stat weights to localStorage**

Writes per-hash keys, **`ichacalc_statWeights_last` / `ichacalc_statWeights_last_aoe`**, and Discord user keys when applicable.

**Typical row shape (array element):**
```javascript
{
    key: 'spellCrit',
    stat: 'Spell Crit %',
    statDps: 18.5,
    statTps: 12.3,
    dps: '18.50',
    ap: '...',
    sp: '...'
}
```

#### `updateStatWeightsTable(weights, type)` (Lines 3400-3422)
**Updates stat weights table display**

**Table Format:**
```
| Stat                    | DPS Weight | TPS Weight | Difference |
|-------------------------|------------|------------|------------|
| Spell Crit %            | 18.5       | 12.3       | +6.2       |
| Physical Crit %         | 15.2       | 18.1       | -2.9       |
| Attack Power (per 100)  | 150.0      | 180.0      | -30.0      |
| ...                     |            |            |            |
```

**Sortable by:** Any column (click header)

**Color Coding:**
- Green: High value stat
- Yellow: Medium value stat
- Red: Low value stat

---

### 7. Configuration & Persistence (Lines 1921-2006, 2248-2342, 2346-2373)

#### `getPriorityConfig()` - Exported (used by app.js)
**Returns current rotation priority configuration**

**Format:**
```javascript
{
    priorities: [
        { ability: 'Lightning Strike', enabled: true, minMana: 0, maxMana: 100 },
        { ability: 'Stormstrike', enabled: true, minMana: 0, maxMana: 100 },
        { ability: 'Earth Shock', enabled: true, minMana: 30, maxMana: 100 },
        // ...
    ],
    fightDuration: 60,
    targetLevel: 63,
    bossArmor: 3731,
    iterations: 100
}
```

**Used by:** `app.js` → `getBuildData()` (saved with builds)

#### `setPriorityConfig(config)` - Exported (used by app.js)
**Restores rotation priority configuration**

**Used by:** `app.js` → `loadBuildData()` (loaded from builds)

#### `getBuildHash()` (Lines 2305-2342)
**Generates unique hash for current build**

**Hash Inputs:**
- Equipped gear (item IDs)
- Applied enchants
- Talent allocation
- Active buffs
- Class/race
- Target level

**Used for:** Stat weight caching (different builds get different weights)

#### `getDiscordUserId()` (Lines 2346-2352)
**Gets Discord user ID from localStorage** (if user logged in via Discord)

**Used for:** Per-user caching of stat weights

---

## Key Data Structures

### ShamanStats Object
```javascript
{
    // Spell stats
    spellPower: number,           // Base spell damage
    natureDamage: number,         // +Nature spell damage
    fireDamage: number,           // +Fire spell damage
    frostDamage: number,          // +Frost spell damage
    spellCrit: number,            // Spell crit % (as decimal)
    spellHit: number,             // Spell hit % (as decimal)

    // Physical stats
    attackPower: number,          // Total AP
    meleeCrit: number,            // Melee crit % (as decimal)
    meleeHit: number,             // Melee hit % (as decimal)
    weaponSkill: number,          // Weapon skill (300 + bonuses)
    glancingDamagePercent: number,// Glancing blow damage % (65 for L63)
    enemyDodgeChancePercent: number, // Enemy dodge % (6.5 for L63)

    // Weapon
    weaponDamage: { min, max },   // Weapon damage (includes AP)
    baseWeaponSpeed: number,      // Base speed (for PPM procs)
    weaponSpeed: number,          // Hasted speed (for swing timing)
    baseWeaponDamageMin: number,  // Base damage (no AP)
    baseWeaponDamageMax: number,  // Base damage (no AP)

    // Defensive (for Lightning Shield procs)
    dodge: number,                // Dodge % (as decimal)
    parry: number,                // Parry % (as decimal)
    block: number,                // Block % (as decimal)
    blockValue: number,           // Block value
    defense: number,              // Defense skill
    armor: number,                // Armor value
    physicalDR: number,           // Physical DR % (as decimal)
    health: number,               // Total health

    // Target
    targetLevel: number,          // 60-63
    playerLevel: number,          // 60
    natureResist: number,         // Enemy nature resistance
    fireResist: number,           // Enemy fire resistance
    // ... other resistances

    // Threat
    threatSpiritArmorMult: number,     // Spirit Armor threat mult
    threatRockbiterMult: number,       // Rockbiter threat mult
    threatCalmingWindsReduction: number, // Calming Winds threat reduction %
    threatSalvationMult: number,       // Salvation threat mult
    totemicAlignmentThreatPercent: number, // Totem threat transfer %

    // Special items
    totemOfRage: boolean,         // Has Totem of Rage
    totemOfBrokenEarth: boolean,  // Has Totem of Broken Earth
    totemOfStonebreaker: boolean, // Has Totem of Stonebreaker
    hasBadgeOfTheSwarmguard: boolean, // Has Badge trinket

    // Set bonuses
    setBonuses: object,           // Active set bonuses

    // Buffs/talents
    activeBuffs: array,           // Active buff objects
    talentBonuses: object,        // Talent bonus object
    spellStrikeSources: array,    // Spell strike sources

    // Modifiers (toggled via talents/buffs)
    activeModifiers: {
        flametongueActive: boolean,
        windfuryActive: boolean,
        // ... many more
    },

    // Talent ranks (reverse-engineered from bonuses)
    talents: {
        concussion: number,       // 0-5
        elementalFury: number,    // 0-2
        elementsGrace: number,    // 0-5
        // ... all shaman talents
    }
}
```

### Spell Result Object
```javascript
{
    dps: number,              // Total DPS
    avgDamage: number,        // Average damage per cast
    castTime: number,         // Cast time (seconds)
    manaCost: number,         // Mana cost
    dpet: number,             // Damage per execute time
    dpm: number,              // Damage per mana
    critChance: number,       // Crit chance %
    critDamage: number,       // Crit damage multiplier (200% base)
    resistChance: number,     // Resist chance %
    minDamage: number,        // Min hit damage
    maxDamage: number,        // Max hit damage
    avgHitDamage: number,     // Average hit damage (before crit/resist)
    avgTotalDamage: number,   // Average total damage (after crit/resist)
    spCoefficient: number,    // Spell power coefficient
    modifiers: array,         // Active modifiers affecting this spell
    procInfo: object          // Proc information (if applicable)
}
```

### Simulation Results Object
```javascript
{
    totalDamage: number,      // Total damage dealt
    dps: number,              // Average DPS
    totalThreat: number,      // Total threat generated
    tps: number,              // Average TPS
    duration: number,         // Fight duration (seconds)

    abilityBreakdown: {
        [abilityName]: {
            count: number,        // Number of casts
            totalDamage: number,  // Total damage
            percentOfTotal: number, // % of total damage
            dps: number,          // DPS contribution
            avgHit: number,       // Average hit damage
            critChance: number,   // Crit %
            critCount: number,    // Number of crits
            hitCount: number,     // Number of hits
            missCount: number,    // Number of misses
            dodgeCount: number,   // Number of dodges
            // ... etc
        }
    },

    threatBreakdown: {
        [abilityName]: {
            count: number,
            totalThreat: number,
            percentOfTotal: number,
            tps: number,
            avgThreat: number
        }
    },

    resourceUsage: {
        totalManaSpent: number,
        manaPerSecond: number,
        dpsPerMana: number
    },

    procStats: {
        [procName]: {
            count: number,        // Number of procs
            uptime: number,       // Total uptime (seconds)
            uptimePercent: number, // Uptime %
            avgDuration: number,  // Average proc duration
            uptimeWindows: [{ start, end }, ...] // Uptime timeline
        }
    },

    timeline: {
        damage: [{ time, ability, damage }, ...],
        threat: [{ time, ability, threat }, ...],
        buffs: [{ time, buff, active }, ...],
        casts: [{ time, ability, success }, ...]
    }
}
```

---

## How to Make Updates/Changes

### Adding a New Ability

**Files to update:**
1. **`modules/shaman/spells.js`** - Add spell definition
2. **`modules/shaman/damageCalc.js`** - Add damage calculation logic (if custom)
3. **`modules/shaman/combatSim.js`** - Add to rotation system (if active ability)

**Steps:**
1. Add spell to `shamanSpells` array in `spells.js`:
   ```javascript
   {
       name: 'New Spell',
       baseDamage: { min: 100, max: 150 },
       spCoefficient: 0.714,
       castTime: 2.0,
       manaCost: 200,
       cooldown: 0,
       school: 'nature'  // or 'fire', 'frost', etc.
   }
   ```

2. If custom damage logic needed, add handler in `damageCalc.js`

3. Add to priority config UI in `setupCombatConfig()` (line 1115)

4. Test in Abilities tab (should auto-appear)

### Adding a New Talent

**Files to update:**
1. **`modules/character/shamanTalents.js`** - Add talent to ShamanStats class
2. **`modules/talents_new.js`** - Add talent to talent tree UI
3. **`modules/shaman/dps.js`** - Add talent mapping in `mapTalentsToStats()`

**Steps:**
1. Add talent to `ShamanStats` modifiers:
   ```javascript
   // In shamanTalents.js
   initializeModifiers() {
       this.modifiers.newTalent = { max: 5, current: 0, effect: 'description' };
   }
   ```

2. Add talent to UI in `talents_new.js`

3. Add mapping in `mapTalentsToStats()`:
   ```javascript
   if (talentBonuses.new_talent_bonus) {
       const ranks = Math.round(talentBonuses.new_talent_bonus / bonusPerRank);
       stats.setTalent('newTalent', ranks);
   }
   ```

4. Update damage calculations in `damageCalc.js` to use new talent

### Adding a New Set Bonus

**Files to update:**
1. **`modules/gear/setBonuses.js`** - Add set bonus definition
2. **`modules/shaman/dps.js`** - Add set bonus logic in `createShamanStatsFromCharacter()`

**Steps:**
1. Add set bonus to `setBonuses.js`:
   ```javascript
   if (itemCount >= 2) {
       bonuses.new_set_2pc = true;
   }
   ```

2. Add detection in `createShamanStatsFromCharacter()`:
   ```javascript
   if (setBonuses.new_set_2pc) {
       stats.newSetBonus = true;
   }
   ```

3. Update damage calculations to check `stats.newSetBonus`

### Adding a New Stat Weight

**Files to update:**
1. **`modules/shaman/dps.js`** - Add to `STAT_WEIGHT_DELTAS` array

**Steps:**
1. Determine stat type (simple, complex, or derived)

2. Add to `STAT_WEIGHT_DELTAS`:
   ```javascript
   {
       key: 'newStat',
       stat: 'New Stat Name',
       delta: 10,          // Amount to add for test
       divisor: 1          // For % stats, use 100
   }
   ```

3. If **simple stat**, add to `SIMPLE_STATS` set and implement in `calculateAnalyticalStatWeight()`

4. If **complex stat**, add to `COMPLEX_STATS` set (will use simulation automatically)

5. If **derived stat**, add to `DERIVED_STATS` set and add conversion logic

### Modifying Rotation Priority

**UI Location:** Combat Sim tab → Priority Configuration

**Persistence:** Saved to `localStorage` and build exports

**Programmatic Access:**
```javascript
const config = getPriorityConfig();
config.priorities[0].enabled = false;  // Disable first priority
setPriorityConfig(config);
```

**Drag & Drop Notes:**
- `getDragAfterElement()` uses 2D positioning (both X and Y) for correct behavior in multi-row wrapped icon layouts. Hidden items (`display:none`) are filtered out via `offsetParent !== null` for visual positioning only.
- Priority drop handlers iterate ALL cards (including hidden) in DOM order to assign sequential, conflict-free priorities. Hidden cards keep their DOM positions during drag, so their relative order is preserved. This ensures toggling visibility doesn't scramble the ordering.
- Container-level dragover/drop handlers on the priority list catch drops in the flex gaps between icon cards. They store context (`_isAoePriority`, `_isCasterMode`, `_stats`, etc.) on the DOM element to avoid stale closures.
- `persistAndUpdate()` in the opener sequencer reloads the CURRENT session config (`loadPriorityConfig()`) before saving, to avoid overwriting priority changes made since the opener panel was initialized.
- `showOpenerSequencerInline()` does NOT save the config at init time. Only user actions (reorder, enable/disable, etc.) trigger saves. This prevents the entire priority config from being overwritten on every re-render (gear change, buff toggle, tab switch).

**Caster Mode Defaults:**
- `DEFAULT_PRIORITY_CONFIG.casterPriority` includes all caster spells AND all trinkets/on-use items with `enabled: true`.
- A one-time migration (`_casterDefaultsApplied` flag) resets core caster abilities to their default enabled state, fixing stale data from previous bugs that could leave them disabled.

### Debugging Simulations

**Enable debug logging:**
```javascript
// In combatSim.js
const DEBUG = true;  // Enables detailed logging
```

**Inspect simulation state:**
```javascript
// After running simulation
console.log('Sim results:', results);
console.log('Ability breakdown:', results.abilityBreakdown);
console.log('Proc stats:', results.procStats);
```

**Common Issues:**
- **Wrong DPS:** Check spell coefficients in `spells.js`
- **Missing procs:** Check proc definitions in `procs.js`
- **Wrong threat:** Check threat multipliers in `createShamanStatsFromCharacter()`
- **Rotation not working:** Check priority config in `setupCombatConfig()`

---

## Performance Considerations

### Stat Weight Generation
- **Full generation:** ~10-20 seconds (15 stats × 100 iterations each)
- **Caching:** Results cached per build hash (instant on re-load)
- **Hybrid approach:** Analytical for simple stats (instant), simulation for complex stats (slow)

### Simulation Speed
- **Single sim:** ~50-100ms (60s fight, detailed tracking)
- **100 iterations:** ~5-10 seconds
- **Timeline rendering:** ~100-200ms (SVG generation)

### UI Rendering
- **Abilities tab:** ~50ms (calculate all spells)
- **Combat sim tab:** ~100ms (render config UI)
- **Stat weights tab:** ~50ms (render controls)

### Optimization Tips
1. **Reduce iterations** for testing (use 10 instead of 100)
2. **Disable timeline rendering** for faster results
3. **Use Quick Sim** (single iteration) for rapid testing
4. **Cache stat weights** per build (automatically done)

---

## Related Files

- **`modules/shaman/combatSim.js`** - Combat simulation engine (1,351 LOC)
- **`modules/shaman/damageCalc.js`** - Damage calculation formulas (805 LOC)
- **`modules/shaman/spells.js`** - Spell definitions database
- **`modules/shaman/totems.js`** - Totem definitions database
- **`modules/character/shamanTalents.js`** - ShamanStats class definition
- **`modules/gear/procs.js`** - Proc definitions (1,591 LOC)
- **`modules/ui/calculator.js`** - Stat calculation engine (746 LOC)
- **`app.js`** - Main app orchestrator (calls `updateDPSSimulation()`)

---

## Known Issues / TODOs

1. **File size** (6,453 LOC) - Consider splitting into:
   - `dps-ui.js` (UI rendering)
   - `dps-calc.js` (ability calculations)
   - `dps-statweights.js` (stat weight generation)

2. **Talent mapping complexity** - Reverse-engineering talent ranks from aggregated bonuses is fragile

3. **Hardcoded constants** - Many magic numbers should be in config (e.g., boss armor, resist values)

4. **No error boundaries** - Simulation errors don't gracefully fail

5. **Mixed responsibilities** - UI + calculation + simulation in one file

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Abilities tab shows all spells with correct DPS
- [ ] Ability tooltips show detailed breakdowns
- [ ] Sortable columns work correctly
- [ ] Combat sim runs without errors
- [ ] Combat sim results match expected DPS
- [ ] Rotation priority is respected
- [ ] Proc tracking works correctly
- [ ] Timeline graphs render correctly
- [ ] Stat weights generate without errors
- [ ] Stat weights match SimC values (if available)
- [ ] Stat weights cache per build
- [ ] Priority config persists across sessions
- [ ] Build export/import preserves priority config

### Unit Testing (Recommended)
- Test `createShamanStatsFromCharacter()` with various gear/talents
- Test `mapTalentsToStats()` with edge cases
- Test `calculateAnalyticalStatWeight()` with known deltas
- Test stat weight caching (store/retrieve)
- Test build hash generation (same builds → same hash)

---

## Architecture Philosophy

**dps.js should:**
- ✅ Aggregate character state into simulation-ready format
- ✅ Provide UI for DPS optimization
- ✅ Calculate stat weights
- ✅ Coordinate with combat simulation engine
- ❌ NOT contain simulation logic (delegate to combatSim.js)
- ❌ NOT contain spell definitions (use spells.js)
- ❌ NOT contain damage formulas (use damageCalc.js)

**Refactoring Priority:**
1. Split UI rendering into separate file (reduce to <2000 LOC)
2. Extract stat weight generation to separate module
3. Simplify talent mapping (use direct talent → stat mappings)
4. Add error handling throughout

---

## Version History

- **v1.0:** Basic ability DPS calculations
- **v2.0:** Added combat simulation integration
- **v3.0:** Added stat weight generation (SimC-style)
- **v4.0:** Added rotation priority configuration
- **v5.0:** Added proc tracking and timeline visualization
- **v5.1:** Fixed haste stat weight running 6 sims in parallel (96 concurrent workers) causing worker timeouts on machines with fewer cores — now runs 3 pairs sequentially (max 2 concurrent sims at a time). Also added `baseWeaponDamageMin/Max` to `cloneShamanStats` for correct dynamic weapon damage in stat weight sims.
- **v5.2:** Added Potion of Quickness and Juju Flurry support — new `buff:` requirement type for priority/opener filtering, priority config entries, opener sequencer items, icon mappings, and `isTrinketOrCooldown` inclusion for "use after fight time" configuration.
- **v5.3:** Image element caching in `refreshPriorityList` and opener `updatePanelDisplay` — existing `<img>` elements are collected before rebuild and reused in new cards/wrappers, preserving decoded pixel data and eliminating the re-fetch/re-decode flash on every drag-and-drop reorder.
- **v5.4:** **Hard casts** — `lightningBoltCast`, `chainLightningCast`, `moltenBlastCast` are always-visible priority entries (requirement `null`, `enabled: false` by default, priorities 12–14). No config-area toggles; enabling/disabling is done entirely through the priority system, same as Magma Totem or any other ability. Opener support is also present. **Smart priority** — star control next to the hide-disabled toggle calls `calculateSmartPriority()` in `damageCalc.js` to sort enabled rotation abilities by expected DPS per time cost (cast time, DoT/Rekindle/Stormstrike value). **Talents** — `lightningMastery` on `activeModifiers` and `lightning_cast_time_reduction` from `mapTalentsToStats` feed the sim (cast-time logic lives in `combatSim.js`).
- **v5.5:** **Molten Blast (Cast) config** — priority config modal for `moltenBlastCast` includes an "Only use to refresh Flame Shock" toggle (`rules.onlyRefreshFlameShock`). When enabled, the sim only casts Molten Blast when Flame Shock has 2.5–4.5s remaining. **Dedup Chain Lightning** — removed `chainLightningCast` (was identical to existing `chainLightning` which already handles both instant/HotEO and hard-cast paths). Only `chainLightning` exists now in priority system, opener, and sim.
- **v5.6:** **Caster Mode (Elemental)** — Third priority tab "Caster Mode" alongside "Single-Target Enh" and "AOE". Has its own priority list (LB, CL, Flame Shock, Molten Blast, Earth Shock) and opener sequence, stored in `casterPriority`/`casterOpener` within the priority config. A `Caster Mode` checkbox in the combat config area enables caster mode in the sim: no auto-attacks, all spells are hard-cast (LB/CL/MB). The sim's `buildPriorityList`, opener selection, and `executeAbilityByKey` all respect the caster mode flag from `stats.combatConfig.casterMode`.
- **v5.7:** **Totem of the Storm** (item 23199) — adds +33 flat base damage to Lightning Bolt and Chain Lightning. Detected from ranged slot (`stats.totemOfTheStorm`), applied in `damageCalc.js`, shown in ability tooltips, and carried through `STAT_EXTRA_KEYS` / `cloneShamanStats` for sim/stat weights.
- **v5.8:** **Caster mode defaults fix** — `loadPriorityConfig` now backfills individual missing keys within `casterPriority` from `DEFAULT_PRIORITY_CONFIG.casterPriority` (same pattern as AOE backfill) AND removes stale Enhancement-only keys (e.g. `stormstrike`, `lightningStrike`) that leaked in from an older save bug. All fallback references in `refreshPriorityList`, drag-reorder handler, `showPriorityConfigModal`, `saveModalState`, and the smart-priority handler now use `DEFAULT_PRIORITY_CONFIG.casterPriority[key]` instead of the Enhancement top-level default when in caster mode. The sim's `buildPriorityList` now uses a caster-specific `validPriorityKeys` set when in caster mode, preventing melee abilities from ever entering the caster rotation.
- **v5.9:** **Black Dragon Mail set bonus** — Added Black Dragon Mail (items 16984, 15050, 15052, 15051) to `setDatabase.js`. 2pc grants +1% melee hit, 3pc grants +2% melee crit. Applied in `calculator.js` as `baseHit`/`baseCrit` additions so they flow through to both the character sheet UI and the sim via `totals.hit`/`totals.crit`.
- **v6.0:** **Earthquake (elemental capstone)** — New spell added to `shamanSpells` as a 2.5s hard-cast nature spell with 16s cooldown, 71.43% SP coefficient (587–634 base). Mechanics: primary hit + 35% AoE splash (nearby targets in AOE mode) + 30% aftershock at +4s (recalculated independently). Talent-gated behind `elemental-25` (capstone). Shows in Abilities tab (Spells column) when talented, with sub-ability rows for AoE Splash and Aftershock. Added to caster mode priority defaults at priority 3, caster mode `validPriorityKeys`, fallback caster default list, opener items, and excluded from Enhancement priority/opener via `ENH_EXCLUDE_KEYS`/`ENH_OPENER_EXCLUDE`. Sim handles via `castEarthquake()` with delayed aftershock event scheduling. Pre-cast opener support included.
- **v6.1:** **Collapsible spell damage & threat breakdown** — Both the damage and threat detailed stats modals now show Crit/Hit/Miss as top-level rows for non-binary spells, where Crit and Hit are collapsible with a dropdown caret. Expanding reveals sub-rows (No Resist, 25%/50%/75% Resist) split by whether the underlying event was a crit or hit. A **Resisted** column shows damage/threat lost to partial resists (derived from dealt values). Damage modal uses `combatSim.js` fields (`critResist25/50/75`, `hitResist25/50/75`); threat modal filters `damageEvents` by outcome + resistType. Binary spells and physical attacks retain the original flat layout.
- **v6.2:** **Single Thread (compatibility mode)** — (Removed — caused inflated numbers when enabled; main-thread execution path is not reliable.)
- **v6.6:** **Safe Mode in sim dropdown + worker diagnostic banner** — Safe Mode is now a third option in the sim mode dropdown (alongside Advanced Sim and Quick Sim) instead of a separate checkbox. When selected, `safeMode: true` is passed to the sim engine via `simOptions`, where `combatSim.js` uses `max(2, floor(hw/4))` workers (always uses workers, never main-thread). Removed the old `#config-safe-mode` checkbox, `window.ICHACALC_SAFE_MODE`, and `localStorage('ichacalc_safe_mode')` persistence. Also includes `renderWorkerDiagnosticBanner()` — an orange info banner shown in sim results when the worker system retried with fewer workers or fell back, suggesting users select Safe Mode from the dropdown.
- **v6.3:** **Badge of the Swarmguard in opener** — Added Badge of the Swarmguard to `getOpenerItems`, its filter check (`hasTrinketEquippedForOpener(21670)`), and `executeAbilityByKey`. Previously missing, so the trinket couldn't be sequenced in the opener and was auto-activated by `activateOnUseTrinkets()`, causing its 30s shared CD to delay other trinkets uncontrollably.
- **v6.4:** **Ability/trinket cooldown independence** — Added `bloodlust` and `elemental_mastery` to `SHARED_TRINKET_CD_EXEMPT` in `procEngine.js` so they never participate in the on-use trinket shared cooldown system.
- **v6.5:** **Data-driven on-use trinkets** — `getOpenerItems()`, `refreshPriorityList` `allAbilities`, `isTrinketOrCooldown`, `CONFIGURABLE_ITEM_ABILITIES`, `nonGcdKeysForMerge`, and priority-skip key sets now auto-generate from `getOnUseTrinketProcs()` in `procs.js`. Priority panel detects trinkets via equipped slot and consumables via buff toggle (same multi-fallback as opener). Adding a new on-use trinket only requires a `procs.js` entry with `procType: 'onUse'` and `itemId` — no manual UI wiring needed.
- **v6.7:** **Priority tab-driven sim mode** — Replaced the AOE checkbox and Caster Mode checkbox with four priority tabs: "Enhance - ST", "Enhance - AoE", "Elemental - ST", "Elemental - AoE". The sim auto-detects `casterMode` and `aoeEnabled` from the active tab via `getSimModeFromTab()`. New `activePriorityTabMode` module variable persists the active tab across UI redraws (buffs/items/enchants changes no longer reset you to the first tab). Added `casterAoePriority` and `casterAoeOpener` to `DEFAULT_PRIORITY_CONFIG`, `loadPriorityConfig`, and `savePriorityConfig`. `refreshPriorityList` and `showOpenerSequencerInline` accept `isCasterAoe` parameter for the fourth tab. `showPriorityConfigModal` also propagates `isCasterAoe`.
- **v6.8:** **Fire Nova + Magma Totem in Elemental AoE** — Added `fireNovaTotem` (priority 3) and `magmaTotem` (priority 4) to `casterAoePriority` defaults. Split `CASTER_EXCLUDE_KEYS` into separate sets for Elemental ST (excludes totems) and Elemental AoE (keeps totems). `getOpenerItems` now accepts `isCasterAoe` parameter with its own `CASTER_AOE_OPENER_EXCLUDE` set.
- **v6.8.1:** **Lightning Shield priority tiles** — Removed redundant Enhancement-only priority key `lightningShield` (overlapped with Critical / Low / Proactive). `lightningShieldCritical` uses `/assets/images/lightning shield emergency.png`; `lightningShieldProactive` uses `/assets/images/lightning shield proactive.png`. Priority cards treat root-relative `/assets/...` URLs as final icon paths. `stripLegacyEnhancementLightningShield()` removes stale `lightningShield` from loaded/saved config (main + `aoePriority`). Elemental Garb 5pc caster merge still injects sim key `lightningShield` with its own rules.
- **v6.9:** **Spell hit stat weight uses single-point method** — Switched spell hit from two-point (`+delta`/`-delta` average) to single-point (`+delta` only) for stat weight calculation. Two-point was inflating the weight near dynamic hit soft caps (Droplet of Nordrassil +3% hit proc, Elemental Devastation) because removing hit below the soft cap causes disproportionately more DPS loss than adding hit above it provides gain. Removed the post-hoc ED uptime adjustment since single-point naturally captures all dynamic hit interactions via the sim.
- **v7.0:** **Virtual-item stat weights for all stats** — New `STAT_WEIGHT_VIRTUAL_ITEMS` array defines synthetic gear items (one per stat). Items are equipped into a virtual slot in `gear.js` (`setVirtualStatWeightItem`/`clearVirtualStatWeightItem`), causing their raw stats to flow through the full calculator pipeline (`getGearStats` → `calculateEffectiveHealth` → `createShamanStatsFromCharacter` → full sim). This automatically captures all multipliers (Kings, Trueshot Aura, talents, Stormwolf's Frenzy), stat conversions (AGI→crit, INT→spell crit, STR→AP), and proc interactions (Flurry, ED, set bonuses). All 15 stats use this approach. Old code (analytical, clone-and-apply, derived-stat derivation, intrinsic-hit-value sim) is commented out but preserved for revert.
- **v7.1:** **Hybrid virtual-item + legacy stat weights** — Reverted percentage/RNG stats (physCrit, spellCrit, physHit, spellHit, haste, wepSkill) back to the legacy clone-and-apply system which has proven cap-aware logic, two-point methods, and multi-seed haste averaging. Flat stats (AP, STR, AGI, INT, ArP, SP, natureSP, fireSP, spellPen) remain on the virtual-item full-pipeline path. Moved `wepSkill` from `DERIVED_STATS` to `COMPLEX_STATS` so it runs through the legacy sim. Simplified back to 1 baseline + ~23 total sims. Also skipped sanity check and stats reconstruction diagnostic in `combatSim.js` for `quickSim` mode, and excluded `/modules/` from service worker fetch interception to eliminate per-sim overhead.
- **v7.2:** **Percentile DPS/TPS + average effective stats** — Results summary now shows 10th–90th percentile ranges inline with DPS and TPS values. A new mode-dependent stats row appears below the summary: Enhancement shows Avg Speed / AP / Fire Power / Nature Power; Elemental shows Avg Haste % / Fire Power / Nature Power. Both `displaySimulationResults` and `displayQuickSimResults` populate these. Preserved values updated to persist percentiles and avg stats across UI redraws.
- **v7.3:** **Stat weights + item search after gear redraw** — `renderDPSSimulation` restores sim/stat-weight state from the pre-`innerHTML` snapshot only (fixes empty restore). Stat-weight table restore runs even when the combat sim results block was collapsed. `saveStatWeights` also writes `ichacalc_statWeights_last` / `_aoe`; `getStoredStatWeights` falls back to those when the build hash changes so item modal ~DPS stays available after equipping items.
- **v7.4:** **Weapon skill stat weights with low AP + stronger sub-cap signal** — `runStatWeightSimulations` no longer treats `attackPower === 0` as invalid for baseline or clone-and-apply deltas (truthy check was skipping sims and recording 0 DPS for affected stats). For total weapon skill below 315, the wepSkill sim applies up to five stacked +1 skill steps (capped by distance to 315) and divides by that count so the displayed weight remains per 1 weapon skill but quickSim variance is reduced.
- **v7.5:** **Build-scoped stat weight display + profile/URL JSON** — `getStatWeightsForCurrentBuild` reads only `localStorage` keys keyed by `getBuildHash()` (no fallback to last-run for the stat-weight UI). `getStoredStatWeights` still falls back to `ichacalc_statWeights_last` for item modal ~DPS. Saved profiles (`getBuildData` / `loadBuildData` in `app.js`) and share-URL JSON (`exportBuildToURL` / `importBuildFromURL` in `buildManager.js`) include `statWeights` and `statWeightsAoe` when present. Discord-scoped stat weight keys were removed.
- **v7.6:** **Sim breakdown icons** — Damage/threat breakdown rows, advanced damage/threat modals, and damage/threat timeline filter buttons use `damageBreakdown[ability].icon` when present (from sim `recordDamage` extras), else `getAbilityIconUrl`. Frostbrand Weapon uses the same database icon URL as the Consumes/Buffs imbue (`getAbilityIconUrl` + `imbueSystem` `recordDamage` `icon`). Bar colors treat `"Storm Cloud"` like nature (green).
- **v7.7:** **Stat weights ST vs AOE storage + template merge** — `runStatWeightSimulations` saves with `saveStatWeights(runs, options.isAoe)` so AOE Generate no longer writes into the single-target `statWeights_${hash}` key (was overwriting ST cache). AOE passes `isAoe: true` in sim options. `mergeStatWeightsToTemplate()` rebuilds rows from `STAT_WEIGHT_DELTAS` order/labels and merges saved values by key so new stats (e.g. Fortune) get table rows even when localStorage predates them. `getDPSStatWeights` / `getStoredStatWeights` use the merge.
- **v7.8:** **Spell pen into sim stats** — `createShamanStatsFromCharacter` now assigns `stats.spellPen` from `totals.spellPen` (was always 0 in the worker path). Stat-weight virtual item uses **+5 spell pen** (divisor 5): +100 wiped typical remaining boss resist and skewed the per-point weight by an order of magnitude. Removed spell pen from `SIMPLE_STATS` / dead early-exit in the delta loop (virtual-item path only).
- **v7.9:** **Sim settings modal layout + Patchwerk default** — Top row is **2 columns**: **Duration** / **Iterations** live **under** boss details (equal cards, centered titles); **tank / threat** is a **2×2** icon grid + AoE on the right. Lower block: modal boss picker **4-column** centered tile grid, no inner scrollbar (modal scrolls if needed). **`generateSimConfigModalHTML`** defaults the target to **Patchwerk** (npc **16028**) when no saved boss name exists, seeds **`lastDPSBoss`** with id/attackSpeed from **`dpsRaidBossStats`**, and merges **`id`/`attackSpeed`** when syncing storage after edits.
- **v7.10:** **Raid tab bar legibility** — **`generateDpsBossPickerHTML`**: modal gets **`.dps-raid-tabs--modal`** (large padded panel, gold border, **15px** bold tabs, **3px** bottom accent); sidebar tabs use the same structure at **13px**. **`setupDpsBossPicker`** syncs active/inactive backgrounds and **3px** borders for modal vs sidebar.
- **v7.11:** **Sim settings icon** — Replaced the sunburst-style control with **`DPS_SIM_SETTINGS_COG_SVG`** (Heroicons-style **gear/cog**). Cog placement was unified on **`#dps-shared-target-strip`** in **v7.12**.
- **v7.12:** **Shared target strip** — **`generateDpsSharedTargetStripHTML`** renders **`#dps-shared-target-strip`** (boss name, resist summary, one settings cog) in a **left column** inside **`dps-sim-body-main-row`** flex row beside **`dps-sim-tab-panels`**, so priority / stat weights / gear compare stay **beside** the target card (not below a full-width strip). Shown for **Combat Sim**, **Stat Weights**, and **Gear Compare**; **Generate** / **Run Compare** stay in their panels. Removed **`.dps-sim-config-open--tabs`** / **`--combat`** split and the tab-bar cog. *(Later: sidebar Advanced Sim removed; sim mode moved to hero cog — see v7.24.)*
- **v7.13:** **Preloaded raid boss stats** — **`dpsRaidBossStats.json`** is regenerated from Turtle DB via **`scripts/export-dps-raid-boss-stats.py`** (`npm run gen:dps-boss-stats`): real armor, elemental resists, level, and **`creature_attack_speeds`** swing per npcId. Raid tiles no longer share placeholder 3731 / 2.0s / 0 resists. **`gen:dps-boss-stats:defaults`** keeps the old uniform Node generator for offline use only.
- **v7.14:** **Boss `iconUrl` + per-school immunity** — JSON rows include **`iconUrl`** (optional tile image) and **`immune_physical` / `immune_nature` / … / `immune_holy`** (default false). **`getFreshShamanStats`** applies flags from **`lastDPSBoss`**; immune schools deal **0** in **`damageCalc`** and sim (**`combatSim.rollDamage`**, **`damageSystem`**, Lightning Strike split). **`targetSchoolImmunity.js`** centralizes checks.
- **v7.15:** **Priority presets + UI polish** — **`.dps-sim-stats`** at **1.4em** with slightly wider combined-line gaps. Target strip uses **`var(--border-color)`** border. **Smart Priority** UI/handler commented out (no `calculateSmartPriority` import). **`refreshPriorityList`** prepends a static Totemic **`img`** (`PRIORITY_PRESET_MENU_ICON_URL`); preset radial uses **`openCustomRadialMenu`** (`radialMenu.js`) so it matches gear-compare animations; onboarding order **`ONBOARDING_PRIORITY_PRESET_ORDER`**; drop saves reorder with preset anchor forced to first child.
- **v7.16:** **Boss picker journal URLs + Four Horsemen** — ZAM tiles for Hakkar (**`hakar`**), Jin’do (**`jindo-the-godbreaker`**), and bug trio (Lord Kri / Yauj / Vem share **`buru-the-gorger`**). **`raidDefinitions`** Naxx lists a single **The Four Horsemen** (npc **16062**, former Mograine stats / swing). **`dpsRaidBossStats`** row **16062** uses that name + **`four-horseman`** art; **`loadDPSBoss`** / **`lastDPSBoss`** treat **16063–16065** as **16062** (**`normalizeLegacyFourHorsemenLastBossPayload`**).
- **v7.17:** **DPS sim stats bar** — **`.dps-sim-stats`** **`font-size`** **1.3em** in **`shaman-dps.css`** (down from 1.4em).
- **v7.20:** **Results tab + hero strip** — Sim output lives in **`#tab-results`**. The **target sidebar column** is hidden on Results so charts use full width. A stylized **`.sim-results-hero`** shows avg spell/fire/nature/frost power, centered **DPS** / **TPS** with **‹ ›**, totals on the right, and percentile band. Breakdown + timelines follow the hero metric (**`syncSimResultsPanelsToHeroMetric`**). **`buildSimHeroSnapshot` / `updateSimResultsHero`**, **`#sim-hero-state-json`** on redraw.
- **v7.20b (layout):** **Hero strip** mounts into **`#sim-global-hero-host`** inside **`.center-top-row`** next to **`#character-status-bar`**. It **scrolls with the gear card** (not `position: fixed`). **`syncGlobalSimHeroHostLayout`** only **clears legacy inline geometry**. **Class/race** **`#class-race-sidebar`** sits in **`.app-scroll-layout`** beside **`<main>`**, **`position: static`**, and scrolls away with the page — **not** inside **`.gear-center`**. **`topnav.css`**: **`app-scroll-layout`** grid + **`main-content`** centered in col 2; global hero **`.sim-results-hero__center-card`** fixed **`min-width` / `max-width: 275px`** (content no longer drives width). **`teardownGlobalSimHeroHost`** clears inline geometry when leaving shaman. **`#dps-sim-stats`** stays visible on Results.
- **v7.21:** **Results survive refresh (shaman)** — After Advanced or Quick sim, **`tryPersistShamanDpsSimResults`** saves **`ichacalc_shamanDpsLastSimResults`** (`v:1`: cloned **`results`**, **`duration`**, **`heroStateJson`**). If **`activeDPSSimTab`** is **`results`** but the payload is missing or corrupt, **`renderDPSSimulation`** resets the sim tab to **`combat-sim`** and updates **`localStorage`**. On load, **`_restoreFullResults`** triggers **`displaySimulationResults`** to rebuild UI (including handlers). If **`JSON.stringify`** hits quota, retry omits **`damageEvents`** (timelines empty until next run). **`clearShamanDpsPersistedSimResults`** and **`teardownGlobalSimHeroHost`** run when the user selects a non-shaman class (**`app.js`** **`handleClassChange`**).
- **v7.18:** **Sim settings modal top row** — **three equal-height columns**: boss target → duration/iterations → tank/threat + AoE (**`generateSimConfigModalHTML`**). **Duration** and **Iterations** cards stack **vertically** in the middle column (**`align-items: stretch`** on the top grid keeps column heights matched).
- **v7.19:** **Modal boss picker tiles** — **`dps-boss-picker--modal`**: **`dps-boss-tile`** uses **transparent** background and **no** border; portrait **`img`** has no frame. Hover: light gold tint only (**`setupDpsBossPicker`**). Sidebar picker tiles unchanged.
- **v7.22:** **Boss armor mismatch after load / redraw** — Preserved modal armor used **`savedArmor || '3731'`**, so the string **`"0"`** was treated as valid and **`parseInt(...) || 0`** in the sim used **0** armor while the name still showed (e.g.) Patchwerk. **`generateSimConfigModalHTML`** now trims preserved values and only seeds **`#target-armor`** / **`data-base-armor`** when the parsed effective armor is **> 0**, otherwise falls back to default Patchwerk base from **`dpsRaidBossStats`**. Merging **`lastDPSBoss`** now overwrites preserved armor/base when the parsed value is missing or **≤ 0** (previously **`"0"`** blocked the merge). **`reconcileDpsTargetBossAfterRender()`** runs after **`updateBossStatsDisplay()`** on full **`renderDPSSimulation`**: if armor is missing or **0** but the boss name matches **`lastDPSBoss`** or a row in **`dpsRaidBossStats`**, **`applyLoadedDpsBossFromPayload`** reapplies canonical stats (then debuff math runs again).
- **v7.23:** **Hero Resim** — **`#sim-hero-resim-btn`** in the center hero card (below **`#sim-hero-metric-percentiles`**) re-runs the sim with current gear/buffs and the same mode as the Combat Sim run control (Advanced / Quick / Safe). **`executeShamanCombatSimulation(container, simMode, progressButton)`** factors the run path out of **`setupCombatSimulator`**; main run and Resim disable each other while busy. Styles: **`shaman-dps.css`** **`.sim-hero-resim-btn`** (green accent; purple tint when hero shows TPS).
- **v7.24:** **Hero Run Sim + mode cog** — Label **Run Sim**; **`#sim-hero-mode-cog`** opens **`#sim-hero-mode-dropdown`** (Advanced / Quick / Safe). **`applyHeroSimModeChrome`** sets **`.sim-hero-run-split--*`** for border/gradient. Sidebar **`#dps-combat-sim-sidebar-run`** / **`generateCombatSimRunControlsHTML`** removed. Boss column **+30px** wide; **Combat Sim** row uses **`dps-sim-body-main-row--combat-sim`** so target strip height matches priority panel.
- **v7.25:** **Sim mode menu layer** — **`showSimHeroModeMenu` / `hideSimHeroModeMenu`** reparent **`#sim-hero-mode-dropdown`** to **`document.body`** with **`position: fixed`** and **`z-index: 15000`** (aligned to **`.sim-hero-run-wrap`** via **`getBoundingClientRect`**). Avoids clipping and extra scrollbars from **`.sim-global-hero-host`** **`overflow-x: auto`**. **`detachSimHeroModeMenuListeners`** + **`removeStraySimHeroModeDropdownFromBody`** on **`mountGlobalSimHeroHost`** / **`teardownGlobalSimHeroHost`**; scroll/resize closes the menu.
- **v7.24:** **Hero DPS/TPS arrows** — **`#sim-hero-metric-prev` / `#sim-hero-metric-next`** click delegation moved from **`setupCombatSimulator`**’s tab **`container`** to **`#sim-global-hero-host`** in **`mountGlobalSimHeroHost`** (one listener, **`host._simHeroMetricDelegation`**) so toggles work while the hero is fixed outside the tab subtree. Still calls **`applySimHeroMetricMode`** (no-op until **`window.__lastSimHeroSnapshot`** exists).
- **v7.26:** **Frostbrand + Elemental Fury** — Frostbrand Weapon (`frostbrandWeapon` in **`spells.js`**) is treated as frost spell damage for Elemental Fury: **`getModifierValue`** applies the talent’s +5%/rank damage to the imbue proc even if modifier flags were incomplete; **`damageCalc`** / **`dps.js`** tooltips / **`combatSim`** spell crit use numeric EF ranks (1.75x / 2.0x crit multipliers). **`procEngine`** `handleDamageProc` self-buff multiplier now includes **frost** with fire/nature for EF’s damage bonus. **`ShamanStats`** defines **`frostDamage`** and serializes it in **`toJSON`** (worker baseline matches main thread).
- **v7.27:** **Frostbrand + Element's Grace** — `frostbrandWeapon` sets **`hasElementsGraceCrit: true`** so **`ShamanStats.getElementsGraceCritBonus`** applies (+2% spell crit per rank) in sim and expected DPS; no change to EG **damage** (still LS/Stormstrike only via **`hasElementsGraceDamage`**).
- **v7.25:** **Non-shaman hero slot** — **`#sim-global-hero-host`** is never empty/hidden for other classes: **`generateSimHeroPlaceholderHTML()`** + **`topnav.css`** **`.sim-hero-placeholder`** use layered **`anniversary.webp`** / **`anomalus.webp`** from the Turtle talent calculator **`/bgs/`** URLs with a large **“Shaman DPS sim”** title + subtitle. **`teardownGlobalSimHeroHost`** restores the placeholder; **`index.html`** seeds it for the default class.
- **v7.26:** **Patchwerk default every full DPS render; boss not persisted** — *(superseded by v7.27 for gear redraw behavior.)* **`applyLoadedDpsBossFromPayload`** updates in-memory session only (no boss **`localStorage`**). **`getFreshShamanStats`** uses **`applyTargetSchoolImmunitiesFromSessionBoss`**. **`reconcileDpsTargetBossAfterRender`** / swing fallbacks use session or Patchwerk row.
- **v7.27:** **Preserve boss across gear redraws** — **`renderDPSSimulation`** only forces Patchwerk when **`dpsSimForcePatchwerkNextRender`** (set by **`resetDpsSimBossForNewContext()`**: **`loadBuildData`**, URL import in **`buildManager`**, armory import, leaving shaman in **`handleClassChange`**) or when there was no prior sim DOM (**`#sim-duration`**). Otherwise **`generateSimConfigModalHTML`** restores boss search, armor/resists (incl. **`data-base-*`**), and swing from the live modal before **`innerHTML`**, and skips post-mount **`applyLoadedDpsBossFromPayload`** so the picked boss stays while tinkering. Full refresh still starts at Patchwerk (null session).
- **v7.28:** **Advanced damage/threat modals — physical weapon procs** — **`showAdvancedDamageStats`** / **`showAdvancedThreatStats`** no longer rely on ability name substrings alone. Rows use the **melee** layout (Miss / Dodge / Parry / Glancing) when **`damageEvents`** include **`school: 'physical'`** (e.g. Elementium Reaper proc), when **`combatStats`** has **`dodges` / `parries` / `glancing`** or averaged **`totalDodges` / `totalParries` / `totalGlancingBlows`**, or when the name matches the existing physical abilities. Partial-resist grouped layout is skipped for those (**`useGroupedLayout`** requires not physical-melee). Fixes “missing” dodge/parry and count % not summing to 100% for physical procs.
- **v7.29:** **Elementium Reaper + on-use priority icons** — **`getAbilityIconUrl`** maps **Elementium Reaper** to equipped mainhand **33094** / **`getItemById`** / Turtle **`inv_axe_09`** large icon. **`resolveOnUseTrinketIconForPriority`** returns a **full** Turtle large URL (equipped trinket → item DB → **`proc.icon`**), avoiding basename + double **`ICON_BASE`** prefixes that broke priority-row **`img`** URLs. **`procEngine`** **`handlePhysicalMeleeDamageProc`** passes **`icon: proc.icon`** into **`recordDamage`** so breakdown/timeline can use **`damageBreakdown[ability].icon`**. **`isAbsoluteIconUrl`** treats **`//…`** as absolute; **`refreshPriorityList`** and opener **`updatePanelDisplay`** always sync reused cached **`<img>`** **`src`** to the current URL (stale **`src`** had kept broken icons after resolver fixes). **`showPriorityConfigModal`** resolves icons for auto-generated on-use keys via **`resolveOnUseTrinketIconForPriority`** instead of defaulting to Lightning Shield.
- **v7.30:** **Buff timeline uptime labels + Echoed Thunder + Elementium tooltip** — **`computeTimelineRowUptime`** derives **seconds / %** from **`activationTimes`** when **`totalUptime` / `uptimePercent`** are missing (proc **`trackUptime`** path). **`combatSim.performAutoAttack`** no longer **`recordDamage`**’s Echoed Thunder twice (**`consumeEchoedThunder`** already records). **`parseStatsFromTooltip`** skips **`haste`** on kill/slay/decapitate-style lines so Elementium Reaper’s on-kill speed buff is not scraped as passive **+5% haste**.
- **v7.31:** **Distribution histogram drill-down — timeline uptime column** — Single-iteration **`replayShamanSimulationIteration`** left BuffSystem **`totalUptime`** at **0** while **`activationTimes`** was populated; the old recompute guard treated **`totalUptime === 0`** as “needs sum” but **`uptimePercent === 0`** could block or **`duration`** could be invalid. **`computeTimelineRowUptime`** now prefers **meaningful stored** averages when present, otherwise **always** sums **`activationTimes`**; **`renderBuffTracking`** falls back to **`results.fightDuration`** for timeline width and percentages.
- **v7.32:** **Bonus AP vs Undead / Beasts / Demons** — **`parseStatsFromTooltip`** + **`STAT_TEMPLATE`** aggregate **`apVsUndead` / `apVsBeast` / `apVsDemon`**; **`calculateEffectiveHealth`** passes them through. Main stat sheet **Advanced Melee** shows totals; **Attack Power** and weapon DPS use the bonus when DPS sim target **`faction`** matches. **`getFreshShamanStats`** / **`renderDPSSimulation`** / **`updateAbilitiesTab`** add the same bonus to sim **`attackPower`**. **`applyLoadedDpsBossFromPayload`** dispatches **`ichacalc-dps-boss-applied`** so **`app.js`** refreshes stats when the boss changes.
- **Current:** Full-featured DPS optimization suite with Enhancement and Elemental Caster modes
