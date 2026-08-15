# app.js - Main Application Orchestrator

## Overview

`app.js` is the central entry point and orchestrator for the IchaCalc application. It coordinates all major subsystems including gear management, talent trees, buff selection, character stats calculation, tank simulation, and DPS simulation. This file acts as the "glue" that connects all modular components and manages the overall application state and UI.

**File Size:** 3,888 lines of code
**Type:** ES6 Module (uses import/export)
**Dependencies:** 22 imported modules

---

## Key Responsibilities

1. **Application Initialization** - Sets up all UI components, event listeners, and initializes subsystems
2. **State Management** - Manages global application state (equipped gear, talents, buffs, class/race selection)
3. **UI Coordination** - Handles all major UI events and updates across different panels
4. **Build Management** - Saves/loads character builds (gear, talents, buffs, class/race)
5. **Modal Management** - Controls item selection and enchant selection modals
6. **Calculation Coordination** - Triggers stat calculations and updates displays
7. **Tank Simulation UI** - Manages tank simulator interface and results display
8. **DPS Simulation UI** - Coordinates with shaman DPS simulation module
9. **Armory Integration** - Handles character imports from WoW Classic armory

---

## Architecture Overview

```
app.js (Main Orchestrator)
├── Module Imports (22 modules)
│   ├── Gear System (gear.js, enchants.js, gearCompare.js, etc.)
│   ├── Character System (buffs.js, races.js, talents_new.js, stats.js)
│   ├── UI System (calculator.js, modal.js, itemTooltipPosition.js, tooltips.js, bugReport.js)
│   ├── Simulation (tankSimulator.js, dps.js)
│   └── Data Management (armory.js, buildManager.js, profiles.js)
├── Global State
│   ├── elements (DOM references)
│   ├── lastSimulationStatWeights (from tank sim)
│   └── lastSelectedBoss (persisted boss selection)
├── Window Exports
│   ├── window.gearModule (for buffs.js)
│   ├── window.getFreshCalculatorTotals (for DPS sim)
│   ├── window.buildManager (for profiles.js)
│   └── window.currentCalculatorTotals (global state)
└── Core Functions
    ├── Build Management (getBuildData, loadBuildData)
    ├── UI Generators (generateClassIcons, generateRaceIcons, etc.)
    ├── Event Handlers (handleClassClick, handleBuffClick, etc.)
    ├── Modal Management (openItemModal, openEnchantModal, etc.)
    ├── Calculations (calculateEHPWithSwap, updateAllCalculations)
    ├── Tank Simulator UI (initializeTankSimulator, runSimulation, etc.)
    ├── Raid Simulator UI (initializeRaidSimulator, runRaidSimulation)
    └── Initialization (init)
```

---

## Major Sections

### 1. Imports & Configuration (Lines 1-40)

**Purpose:** Import all required modules and define static data

**Key Imports:**
- **Gear:** `gear.js`, `enchants.js`, `gearCompare.js`, `itemLoader.js`, `setBonuses.js`, `procs.js`
- **Character:** `buffs.js`, `races.js`, `talents_new.js`, `stats.js`
- **UI:** `calculator.js`, `modal.js`, `itemTooltipPosition.js`, `tooltips.js`, `bugReport.js`
- **Simulation:** `tankSimulator.js`, `dps.js`
- **Data:** `armory.js`, `buildManager.js`, `statWeightFormulas.js`

**Static Data:**
```javascript
classIconData = {
    warrior: { name: 'Warrior', icon: 'assets/icons/classicon_warrior.jpg' },
    paladin: { name: 'Paladin', icon: 'assets/icons/classicon_paladin.jpg' },
    // ... 9 classes total
}
```

---

### 2. Global State & Window Exports (Lines 36-109)

**Global Variables:**
```javascript
lastSimulationStatWeights  // Stores stat weights from last tank sim (for gear comparison)
lastSelectedBoss           // Persists selected boss across gear changes
elements                   // DOM element cache (populated during init)
```

**Window Exports:**
```javascript
window.gearModule = { getCurrentlyEquippedItem }  // For buffs.js to check equipped items
window.getFreshCalculatorTotals()                 // Returns fresh calculator totals for DPS sim
window.buildManager = { getBuildData, loadBuildData }  // For profiles.js
window.currentCalculatorTotals                    // Global state sync
window.currentEquippedGear                        // Global state sync
window.currentSetBonuses                          // Global state sync
```

**Key Function: `getFreshCalculatorTotals()`**
- Called by DPS simulation to get current character stats
- Aggregates gear stats, talent bonuses, racial bonuses, buffs, enchants, set bonuses
- Calculates weapon damage with AP contribution for auto-attacks
- Returns comprehensive `totals` object with all calculated stats

---

### 3. Build Management (Lines 111-315)

**Purpose:** Save and load complete character builds (gear, talents, buffs, class/race)

#### `getBuildData()` (Lines 120-177)
Returns a complete build object:
```javascript
{
    class: 'warrior',
    race: 'human',
    attackerLevel: 63,
    characterName: 'Icha',
    server: 'nordanaar',
    gear: { head: 12640, chest: 12757, ... },        // item IDs by slot
    enchants: { head: 2, chest: 0, ... },            // enchant indices by slot
    talents: { 'arms-1': 5, 'fury-2': 3, ... },      // talent points by tree-id
    buffs: [{ id: 'buff_motw', improved: true }, ...],
    shamanDpsPriority: { ... },                      // DPS rotation config (shaman only)
    combatConfig: {                                  // shaman only: HoTeO spell + Jewel forced proc (right-click menus)
        handOfEdwardSpell: 'lightningBolt',
        jewelForcedOutcome: ''
    },
    statWeights: [ ... ],                             // optional: shaman ST stat weights (from getStatWeightsForCurrentBuild)
    statWeightsAoe: [ ... ]                           // optional: shaman AOE stat weights
}
```

**Gear Collection:** Iterates all 17 gear slots, stores item IDs
**Enchant Collection:** Stores enchant indices for each enchanted slot
**Talent Collection:** Stores talent points for all talented abilities
**Buff Collection:** Stores active buffs and improved states

#### `loadBuildData(buildData)` (Lines 179-309)
**Async** - Restores character from build object

**Loading Order:**
0. **`resetDpsSimBossForNewContext()`** (`dps.js`) — DPS sim target resets to Patchwerk on the next shaman panel render (boss is not part of saved build data).
1. Set class → regenerate race icons → `handleClassChange()`
2. Set race
3. Set attacker level
4. Set character name/server → update status bar
5. **Load gear** - Pre-fetch items with `getItemsForSlot()`, then `equipItem()`
6. **Load enchants** - `applyEnchant()` for each slot
7. **Load talents** - `updateTalentPoints()` for each talent
8. **Regenerate buffs** - `generateBuffIcons()` (talent-dependent)
9. **Activate buffs** - Add 'active' and 'is-improved' classes
10. Restore shaman DPS priority config
11. Update talent visual states (`updateAllTalentStates`)
12. Persist shaman `statWeights` / `statWeightsAoe` into build-hash-scoped storage (`saveStatWeights`)
13. `updateAllCalculations()`; if `combatConfig` present for shaman, apply HoTeO/Jewel hidden inputs and run `updateAllCalculations()` again
14. Refresh stat-weight tables in the DOM when present

**Onboarding talent presets:** `applyTalentPreset` applies `PRESETS[presetName].talents` via `loadBuildData` (which calls `setPriorityConfig(null)` when `shamanDpsPriority` is omitted), then `getPresetShamanDpsPriority(presetName)` supplies the full saved sim priority/opener snapshot from `onboardingPresetShamanPriority.json` (five shaman presets including **Elemental**) and `setPriorityConfig` + `updateAllCalculations()` refresh the Combat Sim UI. **Consumable step:** `applyShamanConsumePreset` → `applyShamanConsumeBuffPreset` applies `onboardingConsumePresets.json` via `applyBuffListToDom` (`buffs.js`). **Buffs tab:** `#shaman-buffs-consume-tools` (shaman only) is a left-to-right cluster: **`#shaman-clear-consumables-btn`** → `clearAllBuffsDebuffsInDom` (`buffs.js`), then **`#shaman-consume-preset-menu-btn`** inside **`.shaman-consume-preset-anchor`** with **Presets** caption absolutely below the hamburger (same pattern as Combat Sim priority preset slot in `dps.js`). The hamburger opens the **three-column** consumable grid (Physhance / Spellhance / Elemental) with coin tier icons (`SHAMAN_CONSUME_TIERS` from `shamanConsumePresets.js`).

**Exposed via:** `window.buildManager` (for profiles.js)

**Shaman Build Compare (saved builds picker):** Implemented in **`profiles.js`** as **`ProfileManager.getShamanSavedBuildsForCompare()`** and **`window.getShamanSavedBuildsForCompare()`** (cloud profiles + **`ichacalc_local_builds_v1`** local saves). See **`profiles.md`**.

---

### 4. Modal Management (Lines 330-408)

**Purpose:** Handle item and enchant selection modals

#### `openItemModal(slotId, isCompareMode)` (Lines 332-354)
- Fetches items for slot using `getItemsForSlot()` (lazy-loaded)
- **Mainhand filter:** Excludes "Off Hand" / "Held In Off-hand" / "Shield" items
- Sets `data-compare-mode` attribute
- Delegates to `openItemModalFromModule()` from `modal.js`

#### `openItemModalForGearPlan(slotId, classId)`
- Same item fetch/filter as character planner, plus class override and `data-gear-plan-pick`
- Passes **no slot anchor** so `modal.js` centers the picker on Gear Planner

#### `openEnchantModal(slotId)` (Lines 356-359)
- Fetches enchants from `enchantDatabase[slotId]`
- Delegates to `openEnchantModalFromModule()` from `modal.js`

#### `filterModalItems()` (Lines 368-394)
- Fetches items for current slot
- Applies mainhand filter (same as `openItemModal`)
- Gets filters from `getCurrentFilters()` (modal.js)
- Renders with `filterAndRenderItems()` (modal.js)

#### `filterEnchantItems()` (Lines 396-408)
- Gets search term and slot
- **Smart filtering:** Uses `getItemType()` and `filterEnchantsByItemType()` to show only valid enchants
  - Example: Only show "shield" enchants if a shield is equipped in offhand
- Renders with `filterAndRenderEnchants()` (modal.js)

---

### 5. UI Generation (Lines 438-541)

**Purpose:** Dynamically generate class selector, race selector, gear slots, and enchant buttons

#### Class / race UI (`#class-race-sidebar`, `topnav.css`)
- **Outside the gear card**: `#class-selector` and `#race-selector` live in **drawers** on `aside.class-race-sidebar`, **grid column 1** of **`.app-scroll-layout`** (full-width **CSS grid**: sidebar `auto`, **`<main>`** `minmax(0,1fr)` with **`max-width: 1850px`** centered in the second column — far left vs sheet). **`position: static`**; **`syncClassRaceSidebarVerticalAlign`** (`app.js`) nudges **`margin-top`** by the pixel error between **`#character-status-bar`** and the sidebar (**`getBoundingClientRect`**, no margin clear — avoids a one-frame jump when **`ResizeObserver`** on **`#gear-card`** fires from layout-only changes e.g. DPS sim sub-tabs). Same triggers as **`scheduleClassRaceSidebarTopSync`** (**`syncGlobalSimHeroHostLayout`** + vertical align). **Selection** is stored on the sidebar as `data-selected-class` and `data-selected-race` (defaults in `index.html`). Each drawer list **omits** the current class/race from the DOM (the toggle shows the pick), so there is no duplicate row and no re-insert animation when closing. Icon order is **stable A→Z** from `generateClassIcons` / `generateRaceIcons` only (no DOM reorder on open/close).
- `getCurrentClass()` / `getCurrentRace()` read those dataset attributes first (with fallbacks for legacy `.active` nodes).
- `setupClassRaceDrawers()` wires toggle + outside-click close; `closeClassRaceDrawers()` / `syncClassRaceDrawerToggles()` keep toggle images in sync from `classIconData` / `raceIconData` after picks, builds, and armory import.

#### `generateClassIcons()`
- Fills `#class-selector` with every class **except** the selected one (sorted A→Z); none of the rows use `.active`.
- Normalizes `data-selected-class` on the sidebar, then calls `syncClassRaceDrawerToggles()`.

#### `generateRaceIcons(className)`
- Race icons for the class via `baseStats` / `raceIconData`, **excluding** the selected race (sorted A→Z). If the stored race is invalid for the class, it falls back to the first available race and updates the dataset.
- Calls `syncClassRaceDrawerToggles()` after render.

#### `getClassPickerEntries()` / `getRacePickerEntries(className)`
- Return sorted `{ id, name, icon }[]` for the full class list and for all races of a class (used by onboarding so the wizard does not depend on cloning main `#class-selector` / `#race-selector` nodes).

#### `generatePlaceholderIcons()` (Lines 474-483)
- Adds placeholder icons to all `.icon-image-container` elements
- Uses `slotIconMap` from `gear.js` to get correct icon file

#### `addEnchantButtons()` (Lines 485-524)
- Adds enchant UI to enchantable slots
- Creates `.enchant-container` with:
  - `.enchant-details` (text display + connector line)
  - `.enchant-button` (clickable button to open enchant modal)

#### `updateRangedEnchantVisibility()` (Lines 526-540)
- Shows/hides ranged enchant button based on equipped ranged weapon type
- Only shows if weapon is enchantable (uses `isRangedWeaponEnchantable()`)

---

### 6. Event Handlers (Lines 542-663)

**Purpose:** Handle all major UI interactions

#### `handleClassClick(event)`
- Sets `data-selected-class`, `generateRaceIcons`, `handleClassChange`, then closes drawers. **`generateClassIcons()` is deferred** until the class drawer panel’s `max-height` transition finishes (`scheduleGenerateClassIconsAfterClassDrawerClose`) so replacing the list does not fight the close animation (avoids jitter). Opening the class drawer runs `generateClassIcons()` first so the list stays correct if the user reopens before the deferred run.

#### `handleRaceClick(event)`
- Sets `data-selected-race`, `generateRaceIcons(getCurrentClass())`, `updateAllCalculations()`

#### `handleTalentClick(event)` (Lines 571-601)
- Delegates to talent system
- Updates buffs (talent-dependent)
- Updates calculations

#### `handleBuffClick(event)` (Lines 603-629)
- Toggles buff active state
- Handles buff exclusivity (e.g., Battle Shout vs. Commanding Shout)
- Updates calculations

#### `handleClassChange(update)` (Lines 631-662)
**Async** - Major state change handler

**Shaman DPS sim:** When the selected class is **not** shaman, hides the DPS Sim tab, runs **`teardownGlobalSimHeroHost`**, **`clearShamanDpsPersistedSimResults`**, and **`resetDpsSimBossForNewContext()`** so the next shaman session defaults the sim target to Patchwerk.

**Process:**
1. Clear all equipped items
2. Clear all talents
3. Generate new talent inputs for selected class
4. Generate new buff icons for selected class
5. Update ranged enchant visibility
6. Clear set bonuses display
7. Update calculations (if `update = true`)

---

### 7. Calculations & Display (Lines 666-1759)

**Purpose:** Calculate character stats and update all UI displays

#### `calculateEHPWithSwap(newItem, oldItem, newEnchantIndex, oldEnchantIndex)` (Lines 666-797)
**Core Calculation Function**

**Purpose:** Calculate stats with temporary gear/enchant swaps (for comparison)

**Process:**
1. **Build character data object:**
   - Selected class/race, attacker level
   - Gear stats (with item swap if provided)
   - Talent bonuses, racial bonuses, active buffs
   - Enchant stats (with enchant swap if provided)
   - Offhand armor, set bonuses
   - Dual-wield status, weapon types

2. **Call `calculateEffectiveHealth(characterData)`** from `calculator.js`
   - Returns comprehensive `totals` object with all calculated stats

3. **Add weapon damage calculations:**
   - Parse weapon stats from tooltip
   - Calculate weapon damage with AP contribution: `(BaseDmg + AP/14 × Speed) × Multiplier`
   - Store `baseWeaponSpeed` (for PPM procs) and `weaponSpeed` (hasted, for swing timing)

4. **Return totals object**

**Used by:**
- `updateAllCalculations()` - Main calculation trigger
- Gear comparison system (for delta calculations)

#### `updateAllCalculations()` (Lines 799-855)
**Main calculation trigger** - Called on any gear/talent/buff/class/race change

**Process:**
1. Call `calculateEHPWithSwap()` to get fresh totals
2. Store in `window.currentCalculatorTotals` (global state)
3. Store equipped gear in `window.currentEquippedGear`
4. Store set bonuses in `window.currentSetBonuses`
5. Call `displayMainResults(totals)` to update UI
6. Call `updateMitigationScore()` to update mitigation score
7. Call `updateSetBonusesDisplay()` to update set bonus UI
8. Call `updateDPSSimulation()` (if shaman class selected)

**Debounced:** Not directly, but called frequently - consider adding debounce if performance issues arise

#### `displayMainResults(totals)` (Lines 931-1546)
**LARGE FUNCTION** - Updates all stat displays in the calculator panel

**Sections:**
1. **Basic Stats:** Stamina, Strength, Agility, Intellect, Spirit
2. **Resistances:** Fire, Nature, Frost, Shadow, Arcane
3. **Defense Stats:** Armor, Defense, Dodge, Parry, Block, Miss, Crit (melee/spell)
4. **Offensive Stats:** Attack Power, Hit, Crit, Expertise, Haste, Armor Penetration
5. **Spell Stats:** Spell Damage, Healing, Spell Hit, Spell Crit, MP5 — adds `getSpellDamageHealingBonusVsCreatureType(totals, getDpsSessionTargetFactionTag())` to displayed spell damage (all schools) and healing when the DPS target matches equipped `dmgHealingVs*` gear; `renderAdvancedSpellDmgHealVsBonusRows()` fills `#advancedSpellDmgHealVsBonusRows` (non-zero bonuses only).
6. **Misc Effects (Stats tab):** Fortune (`totals.fortune` from `calculateEffectiveHealth`) as `+N%` in `#totalFortune`; row is always visible. Spell strike source list/count.
7. **Effective Health:** Shows breakdown formula
8. **Stat Weight Tooltips:** If `lastSimulationStatWeights` exists, adds tooltips showing value of each stat

**Complexity:** Many conditionals for class-specific stats (e.g., block for warriors/paladins only)

**Helper Functions:**
- `escapeHtml(text)` - Sanitizes text for HTML display
- `renderAdvancedMeleeApVsBonusRows` / `renderAdvancedSpellDmgHealVsBonusRows` — optional rows for equipped `apVs*` / `dmgHealingVs*` bonuses
- Uses `displayStatWeightFormula()` from `statWeightFormulas.js`

#### `updateSetBonusesDisplay()` (Lines 1550-1759)
**Updates set bonus UI** - Shows active set bonuses and progress toward next tier

**Process:**
1. Get `currentSetBonuses` from `getSetBonuses()`
2. Build HTML for each set:
   - Set name (tier, raid, etc.)
   - Progress icons (filled/empty slots)
   - Active bonuses (highlighted)
   - Inactive bonuses (greyed out)
3. Update `#set-bonuses-display` with generated HTML

**Visual Design:** Shows 2/8, 4/8, 6/8, 8/8 tiers with progress bars

---

### 8. Build Export/Import (Lines 1761-1808)

**Purpose:** URL-based build sharing (delegates to `buildManager.js`)

#### `exportBuildToURL()` (Lines 1763-1765)
- Gets build data with `getBuildData()`
- Calls `exportBuildModule()` to generate shareable URL
- Copies URL to clipboard

#### `importBuildFromURL()` (Lines 1767-1775)
- Prompts user for build URL
- Calls `importBuildModule()` to parse URL
- Calls `loadBuildData()` to restore build

#### `updateStatusBarValuesWrapper()` (Lines 1779-1781)
- Wrapper for `updateStatusBarValues()` from `armory.js`

---

### 9. Armory Import (Lines 1783-1808)

**Purpose:** Import character from WoW Classic armory

#### `importFromArmoryAPI()` (Lines 1785-1794)
- Delegates to `importFromArmoryModule()` from `armory.js`
- Passes `elements` for DOM manipulation
- Handles errors

#### `setImportedState(isImported)` (Lines 1796-1798)
- Wrapper for `setImportedStateArmory()` from `armory.js`

#### `toggleEditMode()` (Lines 1800-1808)
- Toggles between display mode (imported) and edit mode
- Clears character name/status bar when returning to edit mode

---

### 10. Tank Simulator UI (Lines 1810-2975)

**Purpose:** Single-boss tank simulation interface

#### `initializeTankSimulator()` (Lines 1812-1878)
**Setup function** - Initializes tank sim UI with boss database

**Process:**
1. Get DOM elements (`#boss-select`, `#boss-search`, `#boss-results`)
2. **Build boss dropdown** from `getBossDatabase()`
   - Groups bosses by raid instance
   - Shows boss level in dropdown
3. **Attach event listeners:**
   - Boss dropdown change → load boss, run simulation
   - Search input → debounced search (300ms)
   - Run button → run simulation
   - "Use These Weights" button → apply stat weights to gear comparison

#### `searchBosses(query)` (Lines 1880-1943)
**Async** - Fuzzy search across boss database

**Search Criteria:**
- Boss name (case-insensitive)
- Raid name (case-insensitive)
- Returns max 10 results

**Display:** Shows boss cards with icon, name, level, raid

#### `loadBossFromSearch(bossId, bossName)` (Lines 1945-2000)
**Async** - Loads boss from search result

**Process:**
1. Find boss in database
2. Update dropdown selection
3. Store in `lastSelectedBoss`
4. Hide search results
5. Run simulation automatically

#### `runSimulation()` (Lines 2002-2094)
**Async** - Main tank simulation trigger

**Process:**
1. Get selected boss from dropdown
2. Get current character stats from `calculateEHPWithSwap()`
3. Build simulation config:
   ```javascript
   {
       targetLevel: boss.level,
       targetAttackPower: boss.attack_power,
       targetWeaponDamageMin: boss.weapon_damage_min,
       targetWeaponDamageMax: boss.weapon_damage_max,
       targetAttackSpeed: boss.attack_speed,
       numHits: 10000,
       includeRushingCharges: checkbox.checked  // T2.5 set bonus
   }
   ```
4. Call `runTankSimulation(totals, config, boss)` from `tankSimulator.js`
5. Store stat weights in `lastSimulationStatWeights`
6. Re-run `updateAllCalculations()` to apply stat weights to tooltips
7. Call `displaySimulationResults()` to show results

**Input Validation:** Shows error if no boss selected or no stats available

#### `displaySimulationResults(results, numHits, boss)` (Lines 2096-2320)
**Updates tank sim results UI** - Shows comprehensive simulation output

**Sections:**
1. **Boss Info:** Name, level, attack speed, weapon damage
2. **Summary Stats:**
   - Effective Health (EH)
   - Damage per Hit (DPH)
   - Time to Die (TTD) = EH / DPH
   - Damage Taken Over Time (DTPS)
3. **Damage Distribution:**
   - Pie chart (hit %, crit %, miss %, dodge %, parry %, block %)
   - Damage graph (damage over time, rolling average)
4. **Detailed Stats:**
   - Avoidance breakdown (miss, dodge, parry, block)
   - Damage taken breakdown (unmitigated, after armor, absorbed, healed)
   - Crit stats (crit %, crit damage, crush %)
5. **Proc Uptime:** Visual timeline and uptime % for all procs
6. **Stat Weights:** Shows value of each stat point (for gear comparison)

**Helper Functions:**
- `renderProcUptime()` - Creates uptime bars
- `renderProcUptimeTimeline()` - Creates visual timeline with color-coded proc windows
- `renderPieChart()` - Creates SVG pie chart
- `renderDamageGraph()` - Creates line graph with attack markers

#### `renderProcUptimeTimeline(procStats, duration)` (Lines 2409-2600)
**Complex visualization** - Shows proc windows over time

**Design:**
- Horizontal timeline (0 to duration)
- Each proc gets a row with color-coded uptime windows
- Tooltip on hover shows uptime window duration
- Color-coded by proc type (procs, abilities, buffs, debuffs)

#### `renderDamageGraph(damageSequence, timeInSeconds, attackTimestamps)` (Lines 2727-2974)
**Line graph with attack markers**

**Features:**
- Red line: Cumulative damage taken
- Blue line: 10-hit rolling average
- Yellow markers: Attack timestamps (hit, crit, crush, miss, dodge, parry, block)
- X-axis: Time (seconds)
- Y-axis: Damage

**Uses SVG for rendering**

---

### 11. Tank Sim Subtabs (Lines 2976-3019)

#### `setupTankSimSubtabs()` (Lines 2978-3019)
**Manages subtabs within tank simulator**

**Tabs:**
- Single Boss (main simulation)
- Raid (multi-boss comparison)

**Event Handling:** Click subtab button → hide all, show selected

---

### 12. Raid Simulator UI (Lines 3021-3279)

**Purpose:** Multi-boss tank simulation (compares survivability across raid bosses)

#### `initializeRaidSimulator()` (Lines 3023-3054)
**Setup function** - Populates raid dropdown

**Process:**
1. Get `#raid-select` element
2. Populate with raids from `getAvailableRaids()`
3. Add event listener → `loadRaidBosses(raidName)`

#### `loadRaidBosses(raidName)` (Lines 3056-3136)
**Async** - Loads boss table for selected raid

**Process:**
1. Call `getRaidBosses(raidName)` to get boss list
2. Build table with columns:
   - Boss Name (with icon)
   - Level
   - Attack Speed
   - Weapon Damage
   - Attack Power
3. Populate `#raid-bosses-table`

#### `runRaidSimulation()` (Lines 3145-3279)
**Async** - Run simulation against all bosses in raid

**Process:**
1. Get current character stats
2. Get selected raid bosses
3. For each boss:
   - Build simulation config
   - Run `runTankSimulation()`
   - Calculate key metrics (EH, DPH, TTD, DTPS, avoidance %, damage reduction %)
4. **Update table with results:**
   - Add columns for EH, DPH, TTD, DTPS, Avoidance %, DR %
   - Color-code cells (green = good, red = bad)
   - Add tooltips with details

**Visual Design:** Green/yellow/red gradient based on performance

---

### 13. Tab Management (Lines 3281-3337)

#### `setupTabs()` (Lines 3283-3337)
**Main tab navigation** - Calculator, Tank Sim, DPS Sim, Bug Reports

**Event Handling:**
- Click tab button → hide all panels, show selected panel
- Applies 'active' class to selected tab button

**Tabs:**
- `#calculator-content` (default)
- `#tank-sim-content`
- `#dps-sim-content`
- `#bug-reports-content`

---

### 14. Loading Screen & Initialization (Lines 3339-3888)

#### `hideLoadingScreen()` (Lines 3341-3351)
**Fade out loading screen** - Called when initialization is complete

**Animation:** Opacity 1 → 0 over 500ms, then `display: none`

#### `checkInitComplete()` (Lines 3359-3366)
**Checks if all init tasks are complete**

**Init Tasks:**
```javascript
initStatus = {
    lazyLoad: false,     // Item lazy-loader ready
    bugReports: false,   // Bug report system ready
    buffs: false,        // Buff icons generated
    talents: false       // Talent trees generated
}
```

**When all true:** Call `hideLoadingScreen()`

#### `init()` (Lines 3368-3888)
**MAIN INITIALIZATION FUNCTION** - Called on DOMContentLoaded

**Process:**

1. **Cache DOM elements** (Lines 3369-3423)
   - All major UI elements stored in `elements` object
   - Includes gear slots, modals, inputs, buttons, panels

2. **Initialize item lazy-loader** (Lines 3425-3430)
   - `itemLoader.loadAll()` → background slot JSON preload (does not gate the loading screen)

3. **Generate UI elements** (Lines 3432-3441)
   - `generateClassIcons()`
   - `generateRaceIcons('warrior')`
   - `generateGearSlots()` (from gear.js)
   - `generatePlaceholderIcons()`
   - `addEnchantButtons()`

4. **Initialize subsystems** (Lines 3443-3471)
   - `generateTalentInputs('warrior')` → marks `initStatus.talents = true`
   - `generateBuffIcons()` → marks `initStatus.buffs = true`
   - `initializeGearCompare()`
   - `initializeTankSimulator()`
   - `setupTankSimSubtabs()`
   - `initializeRaidSimulator()`
   - `initializeDPSSimulation()`
   - `initBugReport()` → marks `initStatus.bugReports = true`
   - `initBugReportsViewer()`
   - `initializeStatusBar()`

5. **Set up callbacks** (Lines 3473-3477)
   - `setGetEquippedGear()` (for tooltips.js)
   - `setEHPCalculator()` (for gearCompare.js)
   - `setGetCurrentClass()` (for gearCompare.js)
   - `setCharacterDataCallbacks()` (for gearCompare.js)

6. **Attach event listeners** (Lines 3479-3888)
   - **Class/Race selection** → `handleClassClick`, `handleRaceClick`
   - **Gear slots** → `openItemModal` (click), context menu for comparison
   - **Enchant buttons** → `openEnchantModal`
   - **Clear buttons** → `clearItem`
   - **Modal close buttons** → `closeModal`
   - **Modal item clicks** → equip item, close modal
   - **Modal enchant clicks** → apply enchant, close modal
   - **Search/filter inputs** → debounced filtering (300ms)
   - **Quality filters** → filter items by quality
   - **Talent clicks** → `handleTalentClick`
   - **Buff clicks** → `handleBuffClick`
   - **Attacker level** → update calculations
   - **Export/Import buttons** → `exportBuildToURL`, `importBuildFromURL`
   - **Armory import** → `importFromArmoryAPI`
   - **Toggle edit mode** → `toggleEditMode`
   - **Tab navigation** → `setupTabs()`
   - **Loading screen check** → `checkInitComplete()`

7. **Initial calculations** (Line 3888)
   - `updateAllCalculations()`

**Boot order:** `init()` awaits `profileManager.init()` before `runOnboarding()` so cloud profiles load first.

**`pageshow` (bfcache):** When the user returns via the back-forward cache (`event.persisted`), `profileManager.loadProfiles()` runs so the builds dropdown / My Builds list are not left stale.

---

## Key Data Structures

### Build Data Object
```javascript
{
    class: string,              // 'warrior', 'paladin', etc.
    race: string,               // 'human', 'orc', etc.
    attackerLevel: number,      // 60-63
    characterName: string,      // Character name from armory
    server: string,             // Server name
    gear: {                     // Item IDs by slot
        head: number,
        neck: number,
        // ... 17 slots total
    },
    enchants: {                 // Enchant indices by slot
        head: number,
        chest: number,
        // ... enchantable slots
    },
    talents: {                  // Talent points by tree-id
        'arms-1': number,
        'fury-2': number,
        // ... all talented abilities
    },
    buffs: [                    // Active buffs
        { id: string, improved?: boolean },
        // ...
    ],
    shamanDpsPriority: object   // DPS rotation config (shaman only)
}
```

### Calculator Totals Object
```javascript
{
    // Basic stats
    stamina: number,
    strength: number,
    agility: number,
    intellect: number,
    spirit: number,

    // Defense
    armor: number,
    defense: number,
    dodge: number,
    parry: number,
    block: number,
    blockValue: number,
    missChance: number,

    // Offense
    attackPower: number,
    hitChance: number,
    critChance: number,
    expertise: number,
    haste: number,
    armorPen: number,

    // Spell
    spellDamage: number,
    healing: number,
    spellHit: number,
    spellCrit: number,
    mp5: number,

    // Resistances
    fireResist: number,
    natureResist: number,
    frostResist: number,
    shadowResist: number,
    arcaneResist: number,

    // Derived stats
    effectiveHealth: number,
    damageReduction: number,

    // Weapon stats (for DPS sim)
    weaponDamageMin: number,
    weaponDamageMax: number,
    baseWeaponSpeed: number,
    weaponSpeed: number
}
```

### Tank Simulation Results Object
```javascript
{
    // Summary
    effectiveHealth: number,
    damagePerHit: number,
    timeToDie: number,
    damageTakenPerSecond: number,

    // Avoidance
    missCount: number,
    dodgeCount: number,
    parryCount: number,
    blockCount: number,

    // Damage
    hitCount: number,
    critCount: number,
    crushCount: number,
    totalDamageTaken: number,

    // Stat weights
    statWeights: {
        stamina: number,
        armor: number,
        defense: number,
        dodge: number,
        // ... all defensive stats
    },

    // Proc tracking
    procStats: {
        [procName]: {
            uptime: number,
            uptimePercentage: number,
            triggerCount: number,
            uptimeWindows: [{ start, end }, ...]
        }
    },

    // Damage sequence (for graphing)
    damageSequence: [number, ...],
    attackTimestamps: [{ time, type, damage }, ...]
}
```

---

## How to Make Updates/Changes

### Adding a New Stat Display

**File:** `displayMainResults()` (Line 931)

**Steps:**
1. **Add stat to calculator totals** (in `calculator.js`)
2. **Add HTML element** to `index.html` (e.g., `<div id="new-stat-value"></div>`)
3. **Update `displayMainResults()`:**
   ```javascript
   if (elements.newStatValue) {
       elements.newStatValue.textContent = totals.newStat || 0;
   }
   ```
4. **Add to stat weights** (if applicable) in `tankSimulator.js`

### Adding a New Gear Slot

**Files:** `gear.js`, `app.js`

**Steps:**
1. **Add slot to `slotIconMap`** in `gear.js`
2. **Add HTML element** to `index.html` (use existing `.icon-frame` structure)
3. **Update `getBuildData()` and `loadBuildData()`** to include new slot in gear loop
4. **Update `generateGearSlots()`** in `gear.js`
5. **Add to item database** (if needed)

### Adding a New Class

**Files:** `app.js`, `races.js`, `talents_new.js`, `buffs.js`

**Steps:**
1. **Add class icon** to `classIconData` (Line 24)
2. **Add race options** in `baseStats` (`races.js`)
3. **Add talent tree** in `talents_new.js`
4. **Add class-specific buffs** in `buffs.js`
5. **Update class-specific logic** in `displayMainResults()` (e.g., block for warriors/paladins)
6. **Test** class switching, talent allocation, buff generation

### Adding a New Boss

**Files:** `raidDefinitions.js`, boss database

**Steps:**
1. **Add boss to `raidDefinitions`:**
   ```javascript
   {
       id: 'new_boss',
       name: 'New Boss',
       level: 63,
       raid: 'Naxxramas',
       attack_power: 420,
       weapon_damage_min: 2000,
       weapon_damage_max: 3000,
       attack_speed: 2.0,
       iconUrl: 'https://...'
   }
   ```
2. **Boss auto-populates** in tank sim dropdown via `initializeTankSimulator()`

### Modifying Build Save/Load

**Files:** `getBuildData()`, `loadBuildData()`

**Steps:**
1. **Add new property to `getBuildData()`** (Line 120)
2. **Add loading logic to `loadBuildData()`** (Line 179)
3. **Test** with export/import and profiles.js

### Adding a New Tab

**Files:** `index.html`, `setupTabs()` (Line 3283)

**Steps:**
1. **Add HTML** for tab button and panel
2. **Add event listener** in `setupTabs()`:
   ```javascript
   elements.newTabBtn.addEventListener('click', () => {
       hideAllPanels();
       elements.newTabContent.style.display = 'block';
       setActiveTab(elements.newTabBtn);
   });
   ```

### Debugging Calculations

**Key Functions:**
- `calculateEHPWithSwap()` (Line 666) - Add console.logs to inspect `characterData` and `totals`
- `updateAllCalculations()` (Line 799) - Add console.logs to trace calculation flow
- `displayMainResults()` (Line 931) - Add console.logs to see what's being displayed

**Inspect Global State:**
```javascript
console.log(window.currentCalculatorTotals);
console.log(window.currentEquippedGear);
console.log(window.currentSetBonuses);
```

---

## Common Patterns

### Debounced Search/Filter
```javascript
const debouncedFilter = debounce(filterModalItems, 300);
elements.searchInput.addEventListener('input', debouncedFilter);
```

### Async Item Loading
```javascript
const items = await getItemsForSlot(slotId);  // Lazy-loads from JSON
```

### Modal Open/Close
```javascript
openItemModal('head');  // Opens modal for head slot
closeModal();           // Closes all modals
```

### Update Calculations After Change
```javascript
// Any gear/talent/buff/class/race change should call:
updateAllCalculations();
```

### Get Current Character State
```javascript
const characterData = {
    selectedClass: getCurrentClass(),
    selectedRace: getCurrentRace(),
    gearStats: getGearStats(),
    talentBonuses: getTalentBonuses(currentClass),
    activeBuffs: getActiveBuffs(talentBonuses),
    // ...
};
```

---

## Dependencies

### External Modules (22 imports)
- **gear.js** - Gear slot management, item equipping, stat aggregation
- **enchants.js** - Enchant database
- **enchantEffectIds.js** - Enchant ID mappings
- **buffs.js** - Buff system, buff exclusivity
- **races.js** - Racial bonuses, base stats
- **talents_new.js** - Talent tree system
- **calculator.js** - Stat calculation engine
- **tooltips.js** - Item/enchant tooltips
- **setBonuses.js** - Set bonus definitions
- **stats.js** - Stat parsing from tooltips
- **gearCompare.js** - Gear comparison system
- **modal.js** - Item/enchant selection modals
- **itemTooltipPosition.js** - Icon-anchored placement for `#item-tooltip`
- **itemLoader.js** - Lazy-loading item database
- **armory.js** - WoW armory integration
- **statWeightFormulas.js** - Stat weight display
- **buildManager.js** - URL-based build export/import
- **tankSimulator.js** - Tank simulation engine
- **raidDefinitions.js** - Boss/raid database
- **dps.js** - Shaman DPS simulation
- **bugReport.js** - Bug reporting system

### Window Exports (consumed by other modules)
- `window.gearModule` - Used by buffs.js
- `window.getFreshCalculatorTotals` - Used by DPS simulation
- `window.buildManager` - Used by profiles.js
- `window.currentCalculatorTotals` - Global state
- `window.currentEquippedGear` - Global state
- `window.currentSetBonuses` - Global state

---

## Performance Considerations

### Debouncing
- Search/filter inputs are debounced (300ms) to reduce computation
- Consider debouncing `updateAllCalculations()` if called too frequently

### Lazy Loading
- Items are lazy-loaded per slot (reduces initial load time)
- `itemLoader.loadAll()` preloads all slot JSON from `/data/items/` in the background after UI init (gzip, memory cache)

### Calculation Caching
- `window.currentCalculatorTotals` caches last calculation result
- `lastSimulationStatWeights` caches stat weights from last tank sim

### DOM Caching
- All DOM elements cached in `elements` object during init
- Reduces repeated `getElementById()` calls

---

## Known Issues / TODOs

1. **Large file size** (3,888 LOC) - Consider splitting into smaller modules
2. **`displayMainResults()` complexity** (615 LOC) - Could be refactored into smaller display functions
3. **Global state pollution** - Multiple `window` exports, consider using a single namespace
4. **Mixed responsibilities** - App orchestration + UI rendering + event handling + calculation coordination
5. **No error boundaries** - Many async functions don't handle errors gracefully
6. **Hardcoded class list** - Class data should come from a config file

---

## Related Files

- **`profiles.js`** - Character profile management (uses `window.buildManager`)
- **`modules/ui/calculator.js`** - Stat calculation engine
- **`modules/gear/gear.js`** - Gear management system
- **`modules/talents_new.js`** - Talent tree system
- **`modules/character/buffs.js`** - Buff system
- **`modules/tank/tankSimulator.js`** - Tank simulation engine
- **`modules/shaman/dps.js`** - DPS simulation engine
- **`modules/ui/modal.js`** - Item/enchant selection UI
- **`modules/armory/armory.js`** - Armory import system
- **`modules/armory/buildManager.js`** - URL build export/import

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Class switching clears gear/talents correctly
- [ ] Race switching preserves gear/talents
- [ ] Talent allocation updates buffs
- [ ] Buff toggling updates calculations
- [ ] Item equipping updates stats
- [ ] Enchant application updates stats
- [ ] Tank simulation runs without errors
- [ ] DPS simulation runs without errors (shaman only)
- [ ] Build export/import preserves all data
- [ ] Armory import populates character correctly
- [ ] Gear comparison shows correct deltas
- [ ] Set bonus display updates correctly
- [ ] Stat weight tooltips appear after tank sim

### Unit Testing (Recommended)
- Test `getBuildData()` / `loadBuildData()` round-trip
- Test `calculateEHPWithSwap()` with various gear combinations
- Test modal filtering with various search terms
- Test buff exclusivity logic
- Test stat weight application

---

## Version History

- **Original:** Monolithic file with all logic inline
- **Refactored:** Modular architecture with imports from `modules/` directory
- **Current:** Main orchestrator that delegates to specialized modules

---

## Architecture Philosophy

**app.js serves as the "glue" layer** - it should:
- ✅ Coordinate between modules
- ✅ Manage global application state
- ✅ Handle high-level user interactions
- ✅ Initialize subsystems
- ❌ NOT contain complex calculation logic (delegate to calculator.js)
- ❌ NOT contain data structures (delegate to database modules)
- ❌ NOT contain UI rendering logic (delegate to modal.js, tooltips.js, etc.)

**Future Refactoring Goals:**
- Extract build management to separate module
- Extract UI generation to separate module
- Extract event handlers to separate controller module
- Reduce file size to < 1000 LOC
