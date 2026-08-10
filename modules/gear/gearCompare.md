# modules/gear/gearCompare.js - Gear Comparison & Tank Score System

## Overview

`modules/gear/gearCompare.js` provides the gear comparison interface and Tank Score calculation system. It allows users to compare two items side-by-side with detailed stat differences, run tank simulations for both items, and calculate Tank Score (a weighted metric for tank gear value based on stat weights from boss simulations).

**File Size:** 1,229 lines of code
**Type:** ES6 Module
**Primary Use:** Gear optimization for tanks

---

## Key Features

1. **Side-by-Side Item Comparison** - Visual comparison of equipped vs new item
2. **Stat Difference Calculation** - Shows delta between items (green = upgrade, red = downgrade)
3. **Enchant Selection** - Compare items with different enchants
4. **Boss Selection & Search** - Search for any boss/NPC to simulate against
5. **Tank Simulation** - Run tank sim for both items, compare survivability
6. **Tank Score Calculation** - Weighted score based on stat weights from simulation
7. **Stat Weights Display** - Shows value of each stat point for selected boss
8. **Drag-and-Drop Interface** - Drag items from gear slots to comparison panel
9. **Radial Menu Integration** - Click to select equipped item from radial menu

---

## Architecture Overview

```
gearCompare.js (Gear Comparison System)
├── State Management
│   ├── currentCompareSlot - Currently selected slot
│   ├── currentComparisonItem - Item being compared
│   ├── equippedEnchantIndex - Selected enchant for equipped item
│   ├── comparisonEnchantIndex - Selected enchant for comparison item
│   ├── equippedItemSimResults - Sim results for equipped item
│   ├── comparisonItemSimResults - Sim results for comparison item
│   └── selectedBoss - Selected boss for simulation
│
├── Callback Storage (injected by app.js)
│   ├── calculateEHPCallback - EHP calculation function
│   ├── getCurrentClassCallback - Get current class
│   ├── getCurrentRaceCallback - Get current race
│   ├── getGearStatsCallback - Get gear stats
│   ├── getTalentBonusesCallback - Get talent bonuses
│   ├── getActiveBuffsCallback - Get active buffs
│   └── ... (other callbacks)
│
├── Initialization
│   ├── initializeGearCompare() - Sets up event listeners
│   ├── initializeBossSearchAndSim() - Sets up boss search
│   └── populateEnchantDropdown() - Populates enchant dropdowns
│
├── Item Selection
│   ├── handleRadialMenuSelection() - Select equipped item from radial menu
│   ├── handleDrop() - Drag-and-drop item selection
│   ├── handleNewIconClick() - Click to open item modal
│   └── setComparisonItem() - Set comparison item (from modal)
│
├── Boss Search & Selection
│   ├── searchBosses() - Search for bosses/NPCs
│   ├── loadBoss() - Load boss data from Wowhead
│   └── enableRunSimButtonIfReady() - Enable sim button when ready
│
├── Display Updates
│   ├── updateComparisonDisplay() - Updates both item displays
│   ├── updateEquippedItemDisplay() - Updates equipped item UI
│   ├── updateComparisonItemDisplay() - Updates comparison item UI
│   ├── updateStatDifferences() - Updates stat delta display
│   └── renderStatDifferences() - Renders stat diff HTML
│
├── Stat Calculations
│   ├── calculateStatDifferencesFromTotals() - Calculates stat deltas
│   ├── calculateStatDifferences() - Calculates raw stat deltas
│   ├── calculateItemEHP() - Calculates effective health
│   ├── calculateMitigationScore() - Calculates mitigation score
│   └── calculateTankScore() - Calculates Tank Score
│
└── Simulation
    ├── runCompareSim() - Runs tank sim for both items
    ├── updateStatWeightsDisplay() - Updates stat weights tables
    └── renderStatWeightsTable() - Renders stat weights HTML
```

---

## Major Sections

### 1. State & Callbacks (Lines 15-55)

**Module State:**
```javascript
currentCompareSlot = null             // 'head', 'chest', etc.
currentComparisonItem = null          // Item object being compared
equippedEnchantIndex = 0              // Selected enchant for equipped item
comparisonEnchantIndex = 0            // Selected enchant for comparison item
userChangedEquippedEnchant = false    // Flag for enchant changes
equippedItemSimResults = null         // Sim results for equipped item
comparisonItemSimResults = null       // Sim results for comparison item
selectedBoss = null                   // Boss object for simulation
```

**Callback Injections:**
```javascript
calculateEHPCallback              // From app.js: calculateEHPWithSwap()
getCurrentClassCallback           // From app.js: getCurrentClass()
getCurrentRaceCallback            // From app.js: getCurrentRace()
getGearStatsCallback              // From gear.js: getGearStats()
getTalentBonusesCallback          // From talents_new.js: getTalentBonuses()
getActiveBuffsCallback            // From buffs.js: getActiveBuffs()
getEnchantStatsCallback           // From gear.js: getEnchantStats()
getOffhandArmorCallback           // From app.js
getSetBonusesCallback             // From setBonuses.js: getSetBonuses()
getAttackerLevelCallback          // From app.js
displaySimulationResultsCallback  // From app.js (for sim results display)
```

**Callback Setters:**
- `setGetCurrentClass(callback)` - Set current class getter
- `setEHPCalculator(callback)` - Set EHP calculator
- `setCharacterDataCallbacks(callbacks)` - Set all character data callbacks

---

### 2. Initialization (Lines 57-239)

#### `initializeGearCompare()` (Lines 57-123)
**Main initialization function** - Called once by app.js

**Process:**

1. **Initialize equipped item icon** (left side)
   - Set placeholder image
   - Make clickable → opens radial menu
   - Add drag-and-drop handlers (backward compatibility)
   - Event: Click → `openRadialMenu()` → `handleRadialMenuSelection()`
   - Event: Drop → `handleDrop()`

2. **Initialize comparison item icon** (right side)
   - Set placeholder image
   - Event: Click → `handleNewIconClick()` → opens item modal

3. **Initialize enchant dropdowns**
   - Equipped enchant dropdown → change event → update stat differences
   - Comparison enchant dropdown → change event → update stat differences
   - Dropdowns populated when items selected

4. **Initialize boss search** - `initializeBossSearchAndSim()`

5. **Initialize reset button** - Click → `resetSimulation()`

#### `initializeBossSearchAndSim()` (Lines 204-239)
**Sets up boss search and simulation controls**

**Event Listeners:**
- Boss search input → debounced search (500ms delay)
- Boss search input (Enter key) → immediate search
- Run simulation button → `runCompareSim()`

---

### 3. Item Selection (Lines 126-180, 501-519)

#### `handleRadialMenuSelection(slotId, item)` (Lines 168-180)
**Handles equipped item selection from radial menu**

**Process:**
1. Set `currentCompareSlot` to selected slot
2. Reset `currentComparisonItem` (user must select new comparison)
3. Reset enchant indices
4. Update display with `updateComparisonDisplay()`

**Called by:** Radial menu (when user selects a slot)

#### `handleDrop(e)` (Lines 135-161)
**Drag-and-drop handler** (backward compatibility)

**Process:**
1. Parse dragged item data from JSON
2. Validate item has a slot
3. Set `currentCompareSlot` to item's slot
4. Reset comparison item and enchants
5. Update display

**Note:** Drag-and-drop is legacy; radial menu is preferred

#### `handleNewIconClick()` (Lines 501-505)
**Opens item modal for comparison item selection**

**Process:**
1. Check if equipped item is selected (required first)
2. Open item modal for `currentCompareSlot` in compare mode
3. Modal calls `setComparisonItem()` when user selects item

#### `setComparisonItem(item, slot)` (Lines 507-514)
**Exported** - Called by modal when user selects comparison item

**Process:**
1. Set `currentComparisonItem` to selected item
2. Reset comparison enchant index
3. Update display with `updateComparisonDisplay()`

---

### 4. Boss Search & Selection (Lines 241-370)

#### `searchBosses(query, resultsEl)` (Lines 241-320)
**Async** - Searches for bosses/NPCs by name

**API Call:**
```javascript
GET /bosses/search?q={query}
```

**Response:**
```javascript
{
    success: true,
    results: [
        { id: 123, name: 'Patchwerk', level: 63, is_boss: true },
        { id: 456, name: 'Ragnaros', level: 63, is_boss: true },
        // ...
    ]
}
```

**Display:**
- Shows list of matching bosses/NPCs
- Highlights bosses vs regular NPCs
- Shows level and ID
- Click boss → `loadBoss(bossId, bossName)`

**Features:**
- HTML entity decoding (e.g., `&#39;` → `'`)
- Loading/error states
- No results message

#### `loadBoss(bossId, bossName)` (Lines 322-356)
**Async** - Loads boss data from Wowhead API

**API Call:**
```javascript
GET /bosses/scrape?id={bossId}
```

**Response:**
```javascript
{
    success: true,
    boss: {
        id: 123,
        name: 'Patchwerk',
        level: 63,
        minDamage: 2000,
        maxDamage: 3000,
        attackSpeed: 2.0,
        attackPower: 420,
        armor: 3731
    }
}
```

**Process:**
1. Show loading state in search input
2. Fetch boss data from server
3. Store in `selectedBoss`
4. Update search input with boss name and damage range
5. Enable run simulation button (if items selected)

**Data Stored:**
```javascript
selectedBoss = {
    id, name, level,
    minDamage, maxDamage, attackSpeed,
    attackPower, armor
}
```

#### `enableRunSimButtonIfReady()` (Lines 358-370)
**Enables run simulation button when all requirements met**

**Requirements:**
- Boss selected with valid damage range
- Equipped item selected (`currentCompareSlot`)
- Comparison item selected (`currentComparisonItem`)

**Disables button if any requirement missing**

---

### 5. Tank Simulation (Lines 372-500)

#### `runCompareSim()` (Lines 372-500)
**Async** - Main simulation function - runs tank sim for both items

**Validation:**
1. Boss selected with damage range
2. Equipped item selected
3. Comparison item selected

**Process:**

1. **Show loading state**
   ```javascript
   runSimBtn.disabled = true
   simStatus.textContent = 'Running simulations...'
   ```

2. **Build character data helper function**
   ```javascript
   const buildCharacterData = () => ({
       selectedClass: currentClass,
       selectedRace: currentRace,
       attackerLevel: attackerLevel,
       gearStats: getGearStats(),
       talentBonuses: talentBonuses,
       racialBonuses: getSelectedRaceBonuses(currentRace),
       activeBuffs: getActiveBuffs(talentBonuses),
       enchantStats: getEnchantStats(),
       offhandArmor: offhandArmor,
       setBonuses: getSetBonuses(getEquippedGearObjects()),
       isDualWielding: isDualWielding,
       mainhandWeaponType: mainhandWeaponType,
       offhandWeaponType: offhandWeaponType
   })
   ```

3. **Calculate totals for equipped item**
   ```javascript
   const equippedTotals = calculateEHPCallback(
       null,                    // newItem (null = use currently equipped)
       null,                    // oldItem
       equippedEnchantIndex,    // newEnchantIndex
       null                     // oldEnchantIndex
   )
   ```

4. **Run simulation for equipped item**
   ```javascript
   const simConfig = {
       targetLevel: selectedBoss.level,
       targetAttackPower: selectedBoss.attackPower || 420,
       targetWeaponDamageMin: selectedBoss.minDamage,
       targetWeaponDamageMax: selectedBoss.maxDamage,
       targetAttackSpeed: selectedBoss.attackSpeed || 2.0,
       numHits: 10000
   }
   equippedItemSimResults = runTankSimulation(equippedTotals, simConfig, selectedBoss)
   ```

5. **Calculate totals for comparison item**
   - Temporarily equip comparison item
   - Calculate totals with comparison enchant
   - Restore original item

6. **Run simulation for comparison item**
   ```javascript
   comparisonItemSimResults = runTankSimulation(comparisonTotals, simConfig, selectedBoss)
   ```

7. **Calculate stat differences**
   ```javascript
   const statDiffs = calculateStatDifferencesFromTotals(equippedTotals, comparisonTotals)
   ```

8. **Calculate Tank Scores**
   ```javascript
   const equippedTankScore = calculateTankScore(equippedItem, equippedItemSimResults)
   const comparisonTankScore = calculateTankScore(comparisonItem, comparisonItemSimResults)
   const tankScoreDiff = comparisonTankScore - equippedTankScore
   ```

9. **Display results**
   - Hide sim controls, show stat differences
   - Render stat deltas with Tank Score
   - Update stat weights tables for both items
   - Show success message

**Temporary Item Swapping:**
- Equipped item is temporarily replaced with comparison item for calculations
- Original item restored after calculations complete
- Prevents UI from flickering during calculation

---

### 6. Display Updates (Lines 520-978)

#### `updateComparisonDisplay()` (Lines 520-534)
**Updates both item displays**

**Process:**
1. Get equipped item from `getCurrentlyEquippedItem(currentCompareSlot)`
2. Update equipped item display with `updateEquippedItemDisplay(equippedItem)`
3. Update comparison item display with `updateComparisonItemDisplay(currentComparisonItem)`
4. Update stat differences with `updateStatDifferences(equippedItem, currentComparisonItem)`

#### `updateEquippedItemDisplay(item)` (Lines 536-584)
**Updates left side (equipped item) UI**

**UI Updates:**
1. **Icon:** Item icon or placeholder
2. **Name:** Item name with quality color
3. **Enchant Dropdown:** Populated with available enchants for slot
   - Auto-selects currently applied enchant (unless user changed it)
   - Filters enchants by item type (e.g., shield enchants only for shields)

**Enchant Auto-Selection:**
```javascript
if (!userChangedEquippedEnchant) {
    const appliedEnchant = getAppliedEnchant(currentCompareSlot)
    if (appliedEnchant && appliedEnchant.name !== 'None') {
        const enchantList = enchantDatabase[currentCompareSlot]
        const index = enchantList.findIndex(e => e.name === appliedEnchant.name)
        if (index >= 0) {
            equippedEnchantIndex = index
        }
    }
}
```

#### `updateComparisonItemDisplay(item)` (Lines 586-630)
**Updates right side (comparison item) UI**

**Similar to equipped item display:**
1. Icon, name, enchant dropdown
2. No auto-selection (defaults to "None")
3. Filters enchants by item type

#### `updateStatDifferences(equippedItem, comparisonItem)` (Lines 632-719)
**Updates stat delta display**

**Process:**
1. **Calculate totals for equipped item:**
   ```javascript
   const currentTotals = calculateEHPCallback(
       null, null,
       equippedEnchantIndex,
       null
   )
   ```

2. **Calculate totals for comparison item:**
   ```javascript
   const newTotals = calculateEHPCallback(
       comparisonItem,
       equippedItem,
       comparisonEnchantIndex,
       equippedEnchantIndex
   )
   ```

3. **Calculate stat differences:**
   ```javascript
   const statDiffs = calculateStatDifferencesFromTotals(currentTotals, newTotals)
   ```

4. **Calculate EHP difference:**
   ```javascript
   const ehpDiff = newTotals.effectiveHealth - currentTotals.effectiveHealth
   ```

5. **Render differences:**
   ```javascript
   renderStatDifferences(statDiffs, ehpDiff)
   ```

#### `calculateStatDifferencesFromTotals(currentTotals, newTotals)` (Lines 721-756)
**Calculates stat deltas from two totals objects**

**Returns:**
```javascript
{
    stamina: +10,
    armor: +50,
    defense: +5,
    dodge: +0.5,
    parry: +0.3,
    block: +0.2,
    missChance: +0.1,
    // ... all stats
}
```

**Formula:** `newValue - currentValue` for each stat

#### `renderStatDifferences(statDiffs, ehpDiff, tankScoreDiff)` (Lines 816-978)
**Renders stat difference HTML**

**UI Structure:**
```html
<div class="stat-diff-row">
    <span class="stat-name">Stamina</span>
    <span class="stat-value positive">+10</span>
</div>
<div class="stat-diff-row">
    <span class="stat-name">Armor</span>
    <span class="stat-value negative">-50</span>
</div>
<!-- ... -->
<div class="stat-diff-summary">
    <div class="ehp-diff positive">
        Effective Health: +5,234
    </div>
    <div class="tank-score-diff positive">
        Tank Score: +12.5
    </div>
</div>
```

**Styling:**
- Positive values: Green with `+` prefix
- Negative values: Red with `-` prefix
- Zero values: Grey, not displayed
- Summary section at bottom (EHP, Tank Score)

**Stat Categories:**
1. **Primary Stats:** Stamina, Strength, Agility
2. **Defense:** Armor, Defense, Dodge, Parry, Block, Miss
3. **Offense:** Attack Power, Hit, Crit, Expertise
4. **Resistances:** Fire, Nature, Frost, Shadow, Arcane

---

### 7. Stat Calculations (Lines 1022-1229)

#### `calculateItemEHP(item, simResults)` (Lines 1114-1163)
**Calculates effective health for an item**

**Formula:**
```javascript
EHP = Health / (1 - DamageReduction)
```

**Uses simulation results if available:**
```javascript
if (simResults && simResults.damageReduction) {
    const dr = simResults.damageReduction  // Already as decimal
    EHP = health / (1 - dr)
} else {
    // Fallback: use armor-only DR
    const armorDR = calculateArmorDR(armor, attackerLevel)
    EHP = health / (1 - armorDR)
}
```

**Returns:** EHP value (number)

#### `calculateMitigationScore(item, simResults)` (Lines 1164-1223)
**Calculates mitigation score** (complex weighted metric)

**Formula:**
```javascript
MitigationScore = (
    Armor × 0.05 +
    Defense × 2.0 +
    Dodge × 100 +
    Parry × 100 +
    Block × 80 +
    BlockValue × 0.5
) × DamageReductionMultiplier
```

**Damage Reduction Multiplier:**
```javascript
if (simResults && simResults.damageReduction) {
    multiplier = 1 + simResults.damageReduction
} else {
    multiplier = 1.0  // No bonus without sim
}
```

**Returns:** Mitigation score (number)

#### `calculateTankScore(item, simResults)` (Lines 1224-1229)
**Calculates Tank Score** - Primary gear ranking metric

**Formula:**
```javascript
TankScore = sum of (stat_value × stat_weight)
```

**Stat Weights from Simulation:**
```javascript
if (simResults && simResults.statWeights) {
    score = 0
    for (stat in statWeights) {
        score += item_stat_value × statWeights[stat]
    }
}
```

**Example:**
```javascript
// Item: +10 Stamina, +50 Armor, +5 Defense
// Weights: Stamina = 1.2, Armor = 0.05, Defense = 2.0
TankScore = (10 × 1.2) + (50 × 0.05) + (5 × 2.0)
          = 12 + 2.5 + 10
          = 24.5
```

**No Simulation Results:**
- Returns `null` (Tank Score requires simulation)

**Returns:** Tank Score (number) or `null`

---

### 8. Stat Weights Display (Lines 1022-1112)

#### `updateStatWeightsDisplay()` (Lines 1022-1036)
**Updates stat weights tables for both items**

**Process:**
1. Render equipped item stat weights table
2. Render comparison item stat weights table

**Called after:** Simulation completes

#### `renderStatWeightsTable(elementId, item, simResults)` (Lines 1038-1112)
**Renders stat weights table HTML**

**Table Structure:**
```
| Stat       | Value | Weight | Score  |
|------------|-------|--------|--------|
| Stamina    | 10    | 1.2    | 12.0   |
| Armor      | 50    | 0.05   | 2.5    |
| Defense    | 5     | 2.0    | 10.0   |
| Dodge      | 0.5%  | 50.0   | 25.0   |
| ...        |       |        |        |
```

**Columns:**
- **Stat:** Stat name
- **Value:** Item's stat value
- **Weight:** Stat weight from simulation (DPS per stat point)
- **Score:** Value × Weight (contribution to Tank Score)

**Features:**
- Only shows stats present on item
- Sorts by score (descending)
- Color-codes high-value stats (green)
- Shows total Tank Score at bottom

**No Simulation:**
- Shows "Run simulation to see stat weights"

---

### 9. Enchant Dropdown Population (Lines 979-1021)

#### `populateEnchantDropdown(dropdownId, slot, item, selectedValue)` (Lines 979-1021)
**Populates enchant dropdown with filtered enchants**

**Process:**

1. **Get all enchants for slot:**
   ```javascript
   const allEnchants = enchantDatabase[slot] || []
   ```

2. **Filter by item type:**
   ```javascript
   const itemType = getItemType(item)  // 'shield', 'weapon', 'armor', etc.
   const filteredEnchants = filterEnchantsByItemType(allEnchants, itemType)
   ```

3. **Build dropdown HTML:**
   ```html
   <option value="0">None</option>
   <option value="1">+7 Stamina</option>
   <option value="2">+9 Stamina</option>
   <!-- ... -->
   ```

4. **Set selected value:**
   ```javascript
   dropdown.value = selectedValue
   ```

**Smart Filtering:**
- Shield enchants only for shields
- Weapon enchants only for weapons
- 2H weapon enchants only for 2H weapons
- Ranged enchants only for enchantable ranged weapons

---

### 10. Reset Simulation (Lines 182-202)

#### `resetSimulation()` (Lines 182-202)
**Resets comparison to pre-simulation state**

**Process:**
1. Show sim section, hide stat differences
2. Clear simulation results
3. Clear Tank Score displays
4. Re-enable run simulation button

**Use Case:** User wants to change boss/enchants and re-run simulation

---

## Key Data Structures

### Selected Boss Object
```javascript
{
    id: number,               // Boss ID
    name: string,             // Boss name
    level: number,            // 60-63
    minDamage: number,        // Min weapon damage
    maxDamage: number,        // Max weapon damage
    attackSpeed: number,      // Attack speed (seconds)
    attackPower: number,      // Attack power (optional)
    armor: number             // Armor (optional)
}
```

### Simulation Results Object
```javascript
{
    // Summary
    effectiveHealth: number,
    damagePerHit: number,
    timeToDie: number,
    damageReduction: number,  // As decimal (0.50 = 50% DR)

    // Stat weights (DPS per stat point)
    statWeights: {
        stamina: 1.2,
        armor: 0.05,
        defense: 2.0,
        dodge: 50.0,
        parry: 45.0,
        block: 40.0,
        // ... all defensive stats
    },

    // Avoidance
    missCount: number,
    dodgeCount: number,
    parryCount: number,
    blockCount: number,

    // Damage
    hitCount: number,
    critCount: number,
    crushCount: number,
    totalDamageTaken: number
}
```

### Stat Differences Object
```javascript
{
    stamina: number,          // +10 or -5
    armor: number,
    defense: number,
    dodge: number,            // As % (not decimal)
    parry: number,
    block: number,
    missChance: number,
    // ... all stats
}
```

---

## How to Make Updates/Changes

### Adding a New Stat to Comparison

**Files to update:**
1. **`gearCompare.js`** - Add to `calculateStatDifferencesFromTotals()`
2. **`gearCompare.js`** - Add to `renderStatDifferences()`

**Steps:**

1. Add stat to `calculateStatDifferencesFromTotals()`:
   ```javascript
   statDiffs.newStat = (newTotals.newStat || 0) - (currentTotals.newStat || 0);
   ```

2. Add stat to `renderStatDifferences()`:
   ```javascript
   if (statDiffs.newStat) {
       html += `
           <div class="stat-diff-row">
               <span class="stat-name">New Stat</span>
               <span class="stat-value ${statDiffs.newStat > 0 ? 'positive' : 'negative'}">
                   ${statDiffs.newStat > 0 ? '+' : ''}${statDiffs.newStat.toFixed(1)}
               </span>
           </div>
       `;
   }
   ```

### Modifying Tank Score Calculation

**File:** `calculateTankScore()` (Line 1224)

**Current formula:** Sum of (stat × weight)

**To change weights:**
- Weights come from simulation results (`simResults.statWeights`)
- To modify, update `tankSimulator.js` stat weight calculation

**To add custom weights:**
```javascript
// Add custom weight multipliers
const customWeights = {
    stamina: 1.5,  // 50% more valuable
    armor: 1.0,
    defense: 1.2
};

for (const stat in statWeights) {
    const customMult = customWeights[stat] || 1.0;
    score += statValue * statWeights[stat] * customMult;
}
```

### Adding a New Stat Weight Display

**File:** `renderStatWeightsTable()` (Line 1038)

**Steps:**

1. Add stat to table rows:
   ```javascript
   if (item.stats.newStat) {
       const weight = statWeights.newStat || 0;
       const score = item.stats.newStat * weight;
       rows.push({
           stat: 'New Stat',
           value: item.stats.newStat,
           weight: weight.toFixed(2),
           score: score.toFixed(1)
       });
   }
   ```

2. Stat automatically appears in table (sorted by score)

### Customizing Boss Search

**File:** `searchBosses()` (Line 241)

**API Endpoint:** `/bosses/search?q={query}`

**To filter results:**
```javascript
// Only show bosses (exclude NPCs)
const filteredResults = data.results.filter(npc => npc.is_boss);

// Only show specific level range
const filteredResults = data.results.filter(npc => npc.level >= 60 && npc.level <= 63);
```

**To change result limit:**
- Server-side change in `server.py`

### Debugging Simulations

**Enable logging:**
```javascript
console.log('Equipped totals:', equippedTotals);
console.log('Comparison totals:', comparisonTotals);
console.log('Equipped sim results:', equippedItemSimResults);
console.log('Comparison sim results:', comparisonItemSimResults);
console.log('Stat differences:', statDiffs);
console.log('Tank Scores:', equippedTankScore, comparisonTankScore);
```

**Common Issues:**
- **Wrong stat deltas:** Check `calculateStatDifferencesFromTotals()`
- **Missing enchants:** Check `populateEnchantDropdown()` filtering
- **Wrong Tank Score:** Check simulation results have `statWeights`
- **Simulation fails:** Check boss has valid damage range

---

## Performance Considerations

### Simulation Speed
- **Single item sim:** ~1-2 seconds (10,000 hits)
- **Both items:** ~2-4 seconds total (sequential)
- **Stat weight calculation:** Already done in tank sim (no extra cost)

### UI Updates
- **Stat difference calculation:** <50ms
- **Stat weights table rendering:** <100ms
- **Item display update:** <50ms

### Optimization Tips
1. **Cache simulation results** per item+enchant combination
2. **Reduce hit count** for faster testing (use 1,000 instead of 10,000)
3. **Debounce enchant changes** to avoid recalculating on every change

---

## Related Files

- **`app.js`** - Injects callbacks, handles item modal
- **`modules/gear/gear.js`** - Item management, stats aggregation
- **`modules/gear/enchants.js`** - Enchant database (2,886 LOC)
- **`modules/tank/tankSimulator.js`** - Tank simulation engine (1,847 LOC)
- **`modules/ui/calculator.js`** - Stat calculation (`calculateEHPWithSwap`)
- **`modules/ui/radialMenu.js`** - Radial menu for item selection (`openRadialMenu`); same wheel/CSS is reused by **`openCustomRadialMenu`** for other UIs (e.g. shaman priority onboarding presets)
- **`modules/ui/modal.js`** - Item selection modal
- **`server.py`** - Boss search API endpoints

---

## Known Issues / TODOs

1. **Sequential simulations** - Could run in parallel for 2× speed
2. **No caching** - Simulations re-run even for same item+enchant combo
3. **Temporary item swapping** - Causes brief UI flicker during calculations
4. **Hardcoded weights** - Tank Score formula not user-configurable
5. **No export** - Can't export comparison results or share

---

## Testing Strategy

### Manual Testing Checklist
- [ ] Radial menu opens and selects equipped item correctly
- [ ] Drag-and-drop works (backward compatibility)
- [ ] Comparison item icon opens item modal
- [ ] Boss search returns results
- [ ] Boss selection loads boss data
- [ ] Enchant dropdowns populate correctly
- [ ] Enchant filtering works (shield enchants only for shields)
- [ ] Stat differences calculate correctly
- [ ] Simulation runs for both items
- [ ] Tank Score calculates correctly
- [ ] Stat weights table displays correctly
- [ ] Reset button clears simulation state

### Unit Testing (Recommended)
- Test `calculateStatDifferencesFromTotals()` with various stat combos
- Test `calculateTankScore()` with known stat weights
- Test `populateEnchantDropdown()` filtering logic
- Test boss search with various queries
- Test enchant auto-selection logic

---

## Architecture Philosophy

**gearCompare.js should:**
- ✅ Provide side-by-side item comparison
- ✅ Calculate stat differences
- ✅ Integrate with tank simulation
- ✅ Display Tank Score based on simulation weights
- ❌ NOT contain simulation logic (delegate to tankSimulator.js)
- ❌ NOT contain stat calculation logic (use callbacks from app.js)
- ❌ NOT contain item/enchant data (use gear.js, enchants.js)

**Future Refactoring Goals:**
1. Add result caching to avoid re-running sims
2. Parallelize simulations for 2× speed
3. Make Tank Score formula user-configurable
4. Add export/share functionality for comparisons
5. Extract stat weights display to separate module
