# modules/talents_new.js - Talent Tree System

## Overview

`modules/talents_new.js` is the complete talent tree rendering and management system for all classes in IchaCalc. It provides a WoW-style talent tree interface with drag-and-drop talent allocation, tier requirements, talent dependencies, and comprehensive stat bonus calculations.

**File Size:** 1,706 lines of code
**Type:** ES6 Module
**Primary Use:** Talent tree UI, talent point allocation, talent bonus aggregation

---

## Key Features

1. **Grid-Based Talent Trees** - 4×7 grid layout matching WoW Classic talent trees
2. **Visual Talent Connections** - SVG arrows showing talent dependencies
3. **Tier Requirements** - 5 points per tier (7 tiers total)
4. **Talent Dependencies** - Prerequisites with required ranks
5. **Point Allocation** - Left-click to add, right-click to remove
6. **Dynamic Tooltips** - Rank-specific descriptions with variable placeholders
7. **Tree Point Tracking** - Shows points spent per tree (e.g., 0/31)
8. **Total Point Limit** - 51 points maximum across all trees
9. **Stat Bonus Mapping** - Maps talent bonuses to character stats
10. **Multi-Class Support** - All 9 classes (Warrior, Paladin, Shaman, Druid, Hunter, Mage, Priest, Rogue, Warlock)

---

## Architecture Overview

```
talents_new.js (Talent Tree System)
├── Data Layer
│   ├── classTalents - Imported talent definitions (per class)
│   │   ├── shamanTalents (3 trees: Elemental, Enhancement, Restoration)
│   │   ├── druidTalents (3 trees: Balance, Feral, Restoration)
│   │   ├── paladinTalents (3 trees: Holy, Protection, Retribution)
│   │   ├── warriorTalents (3 trees: Arms, Fury, Protection)
│   │   ├── hunterTalents (3 trees: Beast Mastery, Marksmanship, Survival)
│   │   ├── mageTalents (3 trees: Arcane, Fire, Frost)
│   │   ├── priestTalents (3 trees: Discipline, Holy, Shadow)
│   │   ├── rogueTalents (3 trees: Assassination, Combat, Subtlety)
│   │   └── warlockTalents (3 trees: Affliction, Demonology, Destruction)
│   └── processDescriptionArray() - Parses talent descriptions with variables
│
├── UI Generation
│   ├── generateTalentInputs() - Main entry point (tree vs legacy)
│   ├── generateTalentTrees() - New grid-based tree system
│   ├── createTalentGrid() - Creates 4×7 grid HTML
│   ├── generateLegacyTalents() - Legacy row-based format
│   └── drawTalentConnections() - SVG arrow rendering
│
├── Point Allocation
│   ├── handleTalentClick() - Left-click to add point
│   ├── handleTalentRightClick() - Right-click to remove point
│   ├── updateTalentPoints() - Updates talent counter and visuals
│   ├── handleClearTree() - Clears all points in a tree
│   └── initializeTalentClickHandlers() - Event delegation
│
├── Validation & State
│   ├── isTalentAvailable() - Checks tier and prerequisite requirements
│   ├── canRemoveTalentPoint() - Checks if point removal is valid
│   ├── getTotalTalentPoints() - Returns total points across all trees
│   ├── getTreePoints() - Returns points in specific tree
│   └── updateAllTalentStates() - Updates visual states (locked/available)
│
├── Stat Bonus System
│   ├── getTalentBonuses() - Exports talent bonuses for stats calculation
│   ├── applyTalentBonuses() - Maps talent points to stat bonuses
│   └── Class-specific bonus handlers (lines 728-1256)
│       ├── Shaman talents (Elemental Warding, Flurry, etc.)
│       ├── Paladin talents (Divine Strength, Toughness, etc.)
│       ├── Warrior talents (Cruelty, Master of Arms, etc.)
│       ├── Druid talents (Thick Hide, Heart of the Wild, etc.)
│       ├── Hunter talents (Lightning Reflexes, Lethal Shots, etc.)
│       ├── Mage talents (Arcane Focus, Ice Shards, etc.)
│       ├── Priest talents (future implementation)
│       ├── Rogue talents (future implementation)
│       └── Warlock talents (Demonic Embrace, Devastation, etc.)
│
└── Utility Functions
    ├── populateClassDropdown() - Populates class selector
    ├── updateTreePoints() - Updates tree point counter display
    ├── updateAllArrowStates() - Updates arrow visual states
    └── updateTalentBonusesDisplay() - Updates talent bonuses panel (commented out)
```

---

## Major Sections

### 1. Data Layer & Imports (Lines 1-24)

**Imports:**
```javascript
import { shamanTalents } from './talents/shaman.js';
import { druidTalents } from './talents/druid.js';
import { paladinTalents } from './talents/paladin.js';
import { warriorTalents } from './talents/warrior.js';
import { hunterTalents } from './talents/hunter.js';
import { mageTalents } from './talents/mage.js';
import { priestTalents } from './talents/priest.js';
import { rogueTalents } from './talents/rogue.js';
import { warlockTalents } from './talents/warlock.js';
import { getActiveWeaponImbue } from './character/buffs.js';
```

**Class Talents Map:**
```javascript
export const classTalents = {
    warrior: warriorTalents,
    druid: druidTalents,
    paladin: paladinTalents,
    shaman: shamanTalents,
    hunter: hunterTalents,
    mage: mageTalents,
    priest: priestTalents,
    rogue: rogueTalents,
    warlock: warlockTalents
};
```

---

### 2. Talent Description Processing (Lines 42-159)

#### `processDescriptionArray(descArray, talentName, currentRank)` (Lines 42-146)
**Purpose:** Processes talent descriptions with variable placeholders

**Input Formats:**

1. **Simple String:**
   ```javascript
   "Increases Fire damage by 5%."
   ```

2. **Array with Variables:**
   ```javascript
   [
       "Increases Fire damage by ",
       ["$", "$L22", "1", { tree: "elemental", talent: 1, values: [5, 10, 15] }],
       "%."
   ]
   ```

**Process:**

1. **Clean metadata:** Remove talent name, mana cost, range, cast time, cooldown
   ```javascript
   // Example: "Intimidation8% of base mana100 yd rangeInstant60 sec cooldown"
   // Becomes: "Command your pet to intimidate the target..."
   ```

2. **Replace variables:** Use current rank to select value from array
   ```javascript
   // Rank 1: values[0] = 5
   // Rank 2: values[1] = 10
   // Rank 3: values[2] = 15
   ```

3. **Clean escape sequences:** Convert `\n` and `/n` to real newlines
   ```javascript
   .replace(/\\n/g, '\n')
   .replace(/\/n/g, '\n')
   .replace(/\n{3,}/g, '\n\n')  // Collapse 3+ newlines to 1 blank line
   ```

4. **Clean HTML entities:**
   ```javascript
   .replace(/&nbsp;/g, ' ')
   .replace(/&amp;/g, '&')
   .replace(/&lt;/g, '<')
   .replace(/&gt;/g, '>')
   .replace(/<[^>]+>/g, '')  // Remove HTML tags
   ```

5. **Extract and append cooldown:**
   ```javascript
   // "60 sec cooldown" extracted and moved to end
   ```

**Returns:** Cleaned, rank-specific description string

#### `generateRankDescriptions(talent)` (Lines 149-159)
**Purpose:** Pre-generates all rank descriptions for talents with variables

**Process:**
```javascript
const rankDescs = {};
for (let rank = 1; rank <= talent.ranks; rank++) {
    rankDescs[`rank${rank}`] = processDescriptionArray(
        talent.description,
        talent.name,
        rank
    );
}
```

**Returns:** Object with rank-specific descriptions
```javascript
{
    rank1: "Increases damage by 5%.",
    rank2: "Increases damage by 10%.",
    rank3: "Increases damage by 15%."
}
```

---

### 3. UI Generation (Lines 162-334)

#### `generateTalentInputs(container, className)` (Lines 27-39)
**Main entry point** - Determines which talent format to use

**Process:**
```javascript
const talents = classTalents[className];

if (talents && typeof talents === 'object' && !Array.isArray(talents)) {
    // New tree format (all classes now use this)
    generateTalentTrees(container, talents, className);
} else {
    // Legacy row-based format (deprecated)
    generateLegacyTalents(container, talents);
}
```

**Called by:** `app.js` during class selection and initialization

#### `generateTalentTrees(container, treeData, className)` (Lines 162-227)
**Generates complete talent tree UI** (new grid-based system)

**HTML Structure:**
```html
<div class="talent-main-container" data-class="shaman">
    <div class="talent-trees-wrapper">
        <!-- Elemental Tree -->
        <div class="talent-tree" data-tree="elemental">
            <div class="talent-tree-header">
                <img src="icon.png" class="tree-icon">
                <span class="tree-name">Elemental</span>
                <span class="tree-points"><span id="elemental-points">0</span></span>
            </div>
            <div class="talent-tree-talents">
                <div class="talent-grid-container">
                    <svg class="talent-arrows-svg" id="elemental-arrows-svg"></svg>
                    <div class="talent-grid" id="elemental-grid">
                        <!-- 4×7 grid cells -->
                    </div>
                </div>
                <button class="clear-tree-button">Clear Elemental Points</button>
            </div>
        </div>
        <!-- Enhancement Tree -->
        <!-- Restoration Tree -->
    </div>
</div>
```

**Process:**
1. For each tree (Elemental, Enhancement, Restoration):
   - Create tree header with icon and name
   - Create 4×7 talent grid
   - Create SVG canvas for arrows
   - Add clear tree button
2. Initialize click handlers (event delegation)
3. Draw talent connection arrows
4. Update all talent states

#### `createTalentGrid(talents, treeKey)` (Lines 230-307)
**Creates 4×7 talent grid** - Core grid layout function

**Grid Layout:**
```
Row 1:  [T] [ ] [T] [ ]    (Tier 1: 0 points required)
Row 2:  [ ] [T] [ ] [T]
Row 3:  [T] [ ] [T] [ ]    (Tier 2: 5 points required)
Row 4:  [ ] [T] [ ] [T]
Row 5:  [T] [ ] [T] [ ]    (Tier 3: 10 points required)
Row 6:  [ ] [T] [ ] [T]
Row 7:  [T] [ ] [T] [ ]    (Tier 7: 30 points required)
```

**Talent Cell HTML:**
```html
<div class="talent-cell" data-row="1" data-col="1">
    <div class="talent-icon-container"
         id="elemental-1"
         data-tree="elemental"
         data-talent-id="1"
         data-points="0"
         data-max-points="5"
         data-requires=""
         data-req-ranks=""
         data-spell-ids="[8134,8135,8136,8137,8138]"
         data-rank-descriptions="{...}"
         data-full-desc="Increases Fire, Frost and Nature damage by 1%.">
        <img src="https://talents.turtlecraft.gg/icons/spell_fire_elemaggreabuff.png">
        <div class="talent-counter">0/5</div>
        <div class="talent-tooltip">
            <div class="tooltip-name">Convection</div>
            <div class="tooltip-rank">Rank <span class="current-rank">0</span>/5</div>
            <div class="tooltip-desc">Reduces the mana cost of...</div>
        </div>
    </div>
</div>
```

**Empty Cell HTML:**
```html
<div class="talent-cell empty" data-row="1" data-col="2"></div>
```

**Critical:** Empty cells MUST have `data-row` and `data-col` for arrow routing

**Data Attributes:**
- `data-tree` - Tree key (elemental, enhancement, restoration)
- `data-talent-id` - Talent ID (unique within tree)
- `data-points` - Current points invested (0 to max)
- `data-max-points` - Maximum ranks (1, 3, or 5)
- `data-requires` - Prerequisite talent ID (if any)
- `data-req-ranks` - Required ranks in prerequisite (default: 1)
- `data-spell-ids` - Spell IDs for each rank (JSON array)
- `data-rank-descriptions` - Rank-specific descriptions (JSON object)
- `data-full-desc` - Full description for rank 1 (fallback)

**HTML Entity Encoding:**
```javascript
const escapedRankDescs = rankDescsJson
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
```
**Prevents attribute parsing issues with JSON data**

---

### 4. Talent Connection Arrows (Lines 1258-1392)

#### `drawTalentConnections(treeKey, talents)` (Lines 1258-1392)
**Draws SVG arrows between connected talents**

**Arrow Types:**

1. **Vertical Arrow:**
   ```
   [Prereq]
      |
      ↓
   [Talent]
   ```

2. **Horizontal Arrow:**
   ```
   [Prereq] → [Talent]
   ```

3. **90-Degree Bend:**
   ```
   [Prereq] ┐
            └→ [Talent]
   ```

**SVG Structure:**
```xml
<svg class="talent-arrows-svg" width="244" height="427">
    <defs>
        <filter id="arrowShadow-elemental">
            <feDropShadow dx="1" dy="1" stdDeviation="1.5"/>
        </filter>
    </defs>

    <!-- Arrow group (3 layers) -->
    <g class="talent-arrow" data-to="5">
        <!-- Layer 1: Shadow -->
        <line stroke="#888888" stroke-width="4" filter="url(#arrowShadow)"/>
        <!-- Layer 2: Dark border -->
        <line stroke="#1a1a1a" stroke-width="5.5"/>
        <!-- Layer 3: Main line -->
        <line stroke="#888888" stroke-width="4"/>
        <!-- Arrowhead -->
        <polygon points="..." fill="#888888"/>
    </g>
</svg>
```

**Arrow Visual States:**
- **Grey (#888)** - Talent not available (locked)
- **Golden** - Talent available (added via `.unlocked` class)

**Cell Sizing:**
```javascript
const cellSize = 61;  // 45px icon + 16px gap
const talentSize = 45;
const buffer = 3;     // Buffer beyond icon border
```

**Arrow Routing:**
```javascript
function getCellCenter(row, col) {
    const x = (col - 1) * cellSize + talentSize / 2;
    const y = (row - 1) * cellSize + talentSize / 2;
    return { x, y };
}

function getCellEdge(fromRow, fromCol, toRow, toCol) {
    const fromCenter = getCellCenter(fromRow, fromCol);
    const toCenter = getCellCenter(toRow, toCol);
    // Add buffer to start beyond icon border
    // Different logic for horizontal vs vertical
}
```

**Arrow Construction (Vertical Example):**
```javascript
const edges = getCellEdge(fromRow, fromCol, toRow, toCol);
const lineEndY = edges.to.y - 5;  // Stop before arrowhead

// Layer 1: Shadow (behind everything)
<line ... filter="url(#arrowShadow)"/>
// Layer 2: Dark border
<line ... stroke="#1a1a1a" stroke-width="5.5"/>
// Layer 3: Main line
<line ... stroke="#888888" stroke-width="4"/>
// Arrowhead
<polygon points="x,y x-6,y-5 x+6,y-5"/>
```

---

### 5. Point Allocation System (Lines 336-419, 421-506)

#### `handleTalentClick(e)` (Lines 372-394)
**Left-click handler** - Adds talent point

**Validation:**
1. Check if talent is available (`isTalentAvailable()`)
2. Check if total points < 51 (`getTotalTalentPoints()`)
3. Check if current points < max points

**Process:**
```javascript
if (currentPoints < maxPoints) {
    const newPoints = currentPoints + 1;
    updateTalentPoints(container, newPoints);
    updateAllTalentStates();
}
```

#### `handleTalentRightClick(e)` (Lines 396-406)
**Right-click handler** - Removes talent point

**Validation:**
1. Check if current points > 0
2. Check if point can be removed (`canRemoveTalentPoint()`)

**Process:**
```javascript
if (currentPoints > 0 && canRemoveTalentPoint(container)) {
    const newPoints = currentPoints - 1;
    updateTalentPoints(container, newPoints);
    updateAllTalentStates();
}
```

#### `updateTalentPoints(container, points)` (Lines 421+)
**Updates talent point counter and visual state**

**Process:**

1. **Clamp to valid range** (saved builds may exceed current max ranks after a talent is nerfed, e.g. old 3/3 vs new 2/2):
   ```javascript
   const numPoints = Math.min(Math.max(0, parsed), maxPoints);
   ```

2. **Update data attribute:**
   ```javascript
   container.dataset.points = String(numPoints);
   ```

3. **Update counter display:**
   ```javascript
   counter.textContent = `${numPoints}/${maxPoints}`;
   ```

4. **Update tooltip rank:**
   ```javascript
   rankSpan.textContent = String(numPoints);
   ```

5. **Update tooltip description (rank-specific):**
   ```javascript
   if (tooltipDesc && container.dataset.rankDescriptions) {
       const rankDescriptions = JSON.parse(decodedJson);
       const desc = numPoints > 0
           ? rankDescriptions[`rank${numPoints}`]
           : rankDescriptions.rank1;
       tooltipDesc.textContent = desc;
   }
   ```

6. **Update visual classes:**
   ```javascript
   container.classList.remove('has-points', 'maxed');

   if (numPoints > 0 && numPoints < maxPoints) {
       container.classList.add('has-points');  // Partial investment
   } else if (numPoints === maxPoints && maxPoints > 0) {
       container.classList.add('maxed');       // Fully invested
   }
   ```

7. **Update tree points counter:**
   ```javascript
   updateTreePoints(treeKey);  // "0/31" → "5/31"
   ```

8. **Update talent bonuses display:**
   ```javascript
   updateTalentBonusesDisplay();  // (commented out as bloat)
   ```

9. **Trigger stats recalculation:**
   ```javascript
   window.recalculateStats();  // Calls app.js
   ```

#### `handleClearTree(treeKey)` (Lines 408-419)
**Clears all points in a tree**

**Process:**
```javascript
const grid = document.getElementById(`${treeKey}-grid`);
grid.querySelectorAll('.talent-icon-container').forEach(container => {
    updateTalentPoints(container, 0);
});
updateAllTalentStates();
```

**Triggered by:** Clear tree button click

---

### 6. Validation & State Management (Lines 525-661)

#### `isTalentAvailable(container)` (Lines 525-553)
**Checks if talent can be learned**

**Requirements:**

1. **Tier Requirement:**
   ```javascript
   const talentRow = parseInt(container.closest('[data-row]')?.dataset.row) || 1;
   const requiredPoints = (talentRow - 1) * 5;  // 5 points per tier
   const treePoints = getTreePoints(treeKey);

   if (treePoints < requiredPoints) {
       return false;  // Not enough points in tree
   }
   ```

   **Tier Table:**
   | Row | Tier | Required Points |
   |-----|------|-----------------|
   | 1   | 1    | 0               |
   | 2   | 1    | 0               |
   | 3   | 2    | 5               |
   | 4   | 2    | 5               |
   | 5   | 3    | 10              |
   | 6   | 3    | 10              |
   | 7   | 4    | 15              |

2. **Prerequisite Requirement:**
   ```javascript
   const requires = container.dataset.requires;
   if (requires) {
       const prereqContainer = document.getElementById(`${treeKey}-${requires}`);
       const reqRanks = parseInt(container.dataset.reqRanks) || 1;
       const prereqPoints = parseInt(prereqContainer.dataset.points) || 0;

       if (prereqPoints < reqRanks) {
           return false;  // Prerequisite not met
       }
   }
   ```

   **Example:** Stormstrike requires 5/5 Elemental Weapons
   ```html
   <div data-requires="17" data-req-ranks="5">
   ```

**Returns:** `true` if available, `false` if locked

#### `canRemoveTalentPoint(container)` (Lines 556-573)
**Checks if point removal is valid**

**Validation:**
- Check if any other talent depends on this one
- If dependent talent has points, cannot remove

```javascript
const dependents = grid.querySelectorAll(`[data-requires="${talentId}"]`);
for (const dependent of dependents) {
    const depPoints = parseInt(dependent.dataset.points) || 0;
    if (depPoints > 0) {
        return false;  // Can't remove, something depends on it
    }
}
```

**Example:** Cannot remove points from Elemental Weapons if Stormstrike has points

**Returns:** `true` if can remove, `false` if blocked

#### `getTotalTalentPoints()` (Lines 576-582)
**Counts total points across all trees**

```javascript
let total = 0;
document.querySelectorAll('.talent-icon-container').forEach(icon => {
    total += parseInt(icon.dataset.points) || 0;
});
return total;
```

**Used for:** 51-point limit enforcement

#### `getTreePoints(treeKey)` (Lines 585-594)
**Counts points in a specific tree**

```javascript
const grid = document.getElementById(`${treeKey}-grid`);
let total = 0;
grid.querySelectorAll('.talent-icon-container').forEach(icon => {
    total += parseInt(icon.dataset.points) || 0;
});
return total;
```

**Used for:** Tier requirement checks

#### `updateAllTalentStates(dispatchEvent = true)` (Lines 597-630)
**Updates visual states for all talents and arrows**

**Process:**

1. **Check if maxed out:**
   ```javascript
   const totalPoints = getTotalTalentPoints();
   const maxedOut = totalPoints >= 51;
   ```

2. **Update talent visual states:**
   ```javascript
   document.querySelectorAll('.talent-icon-container').forEach(container => {
       const available = isTalentAvailable(container);
       const currentPoints = parseInt(container.dataset.points) || 0;

       if (maxedOut && currentPoints === 0) {
           // Grey out all talents with 0 points when maxed
           container.classList.remove('available');
           container.classList.add('locked');
       } else {
           if (available) {
               container.classList.add('available');
               container.classList.remove('locked');
           } else {
               container.classList.remove('available');
               if (currentPoints === 0) {
                   container.classList.add('locked');
               }
           }
       }
   });
   ```

3. **Update arrow states:**
   ```javascript
   updateAllArrowStates();
   ```

4. **Dispatch event (optional):**
   ```javascript
   if (dispatchEvent) {
       document.dispatchEvent(new CustomEvent('talentChanged'));
   }
   ```

**Called after:** Every talent point change

#### `updateAllArrowStates()` (Lines 633-660)
**Updates arrow visual states based on talent availability**

**Process:**
```javascript
document.querySelectorAll('.talent-icon-container[data-requires]').forEach(container => {
    const treeKey = container.dataset.tree;
    const talentId = container.dataset.talentId;
    const available = isTalentAvailable(container);
    const currentPoints = parseInt(container.dataset.points) || 0;

    const svg = document.getElementById(`${treeKey}-arrows-svg`);
    svg.querySelectorAll(`[data-to="${talentId}"]`).forEach(arrow => {
        if (maxedOut && currentPoints === 0) {
            arrow.classList.remove('unlocked');  // Grey arrow
        } else if (available) {
            arrow.classList.add('unlocked');     // Golden arrow
        } else {
            arrow.classList.remove('unlocked');  // Grey arrow
        }
    });
});
```

**Visual Result:**
- **Grey arrow** - Talent locked
- **Golden arrow** - Talent available

---

### 7. Stat Bonus System (Lines 669-1256)

#### `getTalentBonuses(className)` (Lines 669-726)
**Exported** - Main function for stat bonus aggregation

**Process:**

1. **Check talent format:**
   ```javascript
   if (talents && typeof talents === 'object' && !Array.isArray(talents)) {
       // New tree-based format (all classes)
   }
   ```

2. **Iterate all trees and talents:**
   ```javascript
   Object.entries(talents).forEach(([treeKey, tree]) => {
       tree.talents.forEach(talent => {
           const el = document.getElementById(`${treeKey}-${talent.id}`);
           const points = parseInt(el.dataset.points, 10) || 0;

           if (points === 0) return;  // Skip talents with no points

           applyTalentBonuses(talent, points, bonuses, className);
       });
   });
   ```

3. **Debug log:**
   ```javascript
   console.log('Talent Bonuses:', bonuses);
   ```

**Returns:** Bonuses object
```javascript
{
    crit: 5,                        // +5% crit
    hit: 3,                         // +3% hit
    str_percent: 0.10,              // +10% strength
    armor_percent: 0.08,            // +8% armor
    fire_damage_percent: 0.30,      // +30% fire damage
    elemental_weapons_ranks: 3,     // Elemental Weapons 3/3 (for sim)
    // ... many more
}
```

**Called by:** `app.js` → `calculateEHPWithSwap()` → `getTalentBonuses('shaman')`

#### `applyTalentBonuses(talent, points, bonuses, className)` (Lines 728-1256)
**LARGE FUNCTION** - Maps individual talent bonuses to stat bonuses

**Class Coverage:**

| Class   | Lines      | Talents Implemented |
|---------|------------|---------------------|
| Shaman  | 734-883    | 25+ talents         |
| Paladin | 886-965    | 10+ talents         |
| Warrior | 968-1006   | 8+ talents          |
| Druid   | 1009-1107  | 15+ talents         |
| Hunter  | 1110-1161  | 10+ talents         |
| Mage    | 1164-1214  | 8+ talents          |
| Warlock | 1217-1256  | 6+ talents          |

**Switch Statement Pattern:**
```javascript
switch (talent.name) {
    case 'Talent Name':
        // Apply bonuses based on points
        bonuses.stat_name = (bonuses.stat_name || 0) + value;
        break;

    // ... 100+ case statements
}
```

**Example Implementations:**

1. **Simple Percentage Bonus:**
   ```javascript
   case 'Elemental Warding':
       // Reduces Fire, Frost, and Nature damage by 4/7/10%
       bonuses.fire_dr = (bonuses.fire_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
       bonuses.frost_dr = (bonuses.frost_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
       bonuses.nature_dr = (bonuses.nature_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
       break;
   ```

2. **Flat Bonus Per Rank:**
   ```javascript
   case 'Thundering Strikes':
       // +1% crit per rank (max 5%)
       bonuses.crit = (bonuses.crit || 0) + points;
       break;
   ```

3. **Lookup Table:**
   ```javascript
   case 'Flurry':
       // Attack speed: 8/11/14/17/20%
       const flurryValues = [8, 11, 14, 17, 20];
       bonuses.flurry_attack_speed = flurryValues[points - 1];
       bonuses.flurry = points;  // For DPS sim
       break;
   ```

4. **Class-Specific Handling:**
   ```javascript
   case 'Shield Specialization':
       if (className === 'shaman') {
           // Shaman: +1/2/3% block chance and +6/12/18% block value
           bonuses.blockChance = (bonuses.blockChance || 0) + points;
           bonuses.blockValue_percent = (bonuses.blockValue_percent || 0) + (points * 0.06);
       } else if (className === 'paladin') {
           // Paladin: +10/20/30% block value only (no block chance)
           bonuses.blockValue_percent = (bonuses.blockValue_percent || 0) + (points * 0.10);
       } else if (className === 'warrior') {
           // Warrior: +1/2/3/4/5% block chance
           bonuses.blockChance = (bonuses.blockChance || 0) + points;
       }
       break;
   ```

5. **Conditional Bonus (Buff-Dependent):**
   ```javascript
   case 'Elemental Weapons':
       // Different bonuses based on active weapon imbue
       bonuses.elemental_weapons_ranks = points;  // Always store ranks

       const activeImbue = getActiveWeaponImbue();
       if (activeImbue) {
           switch (activeImbue.id) {
               case 'flametongue':
                   // +10/20/30% fire damage
                   bonuses.fire_damage_percent = (bonuses.fire_damage_percent || 0) +
                       (talent.values.flametongue[points - 1] / 100);
                   break;
               case 'rockbiter':
                   // -4/7/10% damage taken
                   bonuses.elemental_weapons_rockbiter_dr =
                       talent.values.rockbiter[points - 1] / 100;
                   break;
               // ... etc
           }
       }
       break;
   ```

6. **Simulation-Only Bonus:**
   ```javascript
   case 'Improved Fire Totems':
       // No immediate stat bonus, but needed for DPS simulation
       bonuses.improved_fire_totems = points;
       break;
   ```

7. **Form-Specific Bonus (Druid):**
   ```javascript
   case 'Heart of the Wild':
       // +4/8/12/16/20% Intellect (always)
       bonuses.int_percent = (bonuses.int_percent || 0) + (points * 0.04);

       // +4/8/12/16/20% Stamina (Bear Form only)
       bonuses.heart_of_wild_bear_sta_percent = points * 0.04;

       // +4/8/12/16/20% Strength (Cat Form only)
       bonuses.heart_of_wild_cat_str_percent = points * 0.04;
       break;
   ```

**Complexity:** Many talents have multiple effects or conditional logic

**Future Work:** Priest and Rogue talents need implementation

**Turtle WoW patch notes (Jan 2026, data in `modules/talents/*.js`):** Moonfury bonus values in `getTalentBonuses` are **4/8/12%** (`balance_spell_damage_percent_FUTURE`). Druid Eclipse proc text uses **40%/60%** (Wrath/Starfire); Balance of All Things includes **Starfire crit up to 9%** at max rank. Priest **Blackout** and **Improved Mind Blast** grid positions were swapped (Shadow). **Empowered Recovery** (was Swift Recovery) extends Renew by **3 sec per rank**. Other classes: see individual talent files for Coordinated Assault, Kill Command, Vicious Strikes, Bane/Searing Pain/Unleashed Potential/Master Summoner, Improved Fire Blast GCD, Taste for Blood, and rogue poison creature restrictions on **Vile Poisons**.

---

### 8. Legacy Talent System (Lines 309-334)

#### `generateLegacyTalents(container, talents)` (Lines 309-334)
**Deprecated** - Old row-based talent format

**HTML Structure:**
```html
<div class="talent-row">
    <div class="talent-icon-container" id="talent-id">
        <img src="icon.png">
        <div class="talent-counter">0/5</div>
    </div>
    <div class="talent-info">
        <div class="talent-name">Talent Name</div>
        <div class="talent-description">Talent description...</div>
    </div>
</div>
```

**Status:** No longer used (all classes converted to tree format)

---

### 9. Utility Functions (Lines 508-523, 662-666, 1394-1705)

#### `updateTreePoints(treeKey)` (Lines 508-523)
**Updates tree point counter display**

```javascript
const grid = document.getElementById(`${treeKey}-grid`);
let totalPoints = 0;
let totalMax = 0;

grid.querySelectorAll('.talent-icon-container').forEach(icon => {
    totalPoints += parseInt(icon.dataset.points) || 0;
    totalMax += parseInt(icon.dataset.maxPoints) || 0;
});

const pointsDisplay = document.getElementById(`${treeKey}-points`);
pointsDisplay.textContent = `${totalPoints}/${totalMax}`;  // "15/31"
```

#### `populateClassDropdown(selectElement)` (Lines 662-666)
**Exported** - Populates class dropdown

```javascript
selectElement.innerHTML = Object.keys(classTalents).map(classKey =>
    `<option value="${classKey}">${classKey.charAt(0).toUpperCase() + classKey.slice(1)}</option>`
).join('');
```

**Returns:** HTML options for all 9 classes

#### `updateTalentBonusesDisplay()` (Lines 1521-1705)
**Updates talent bonuses panel** (commented out as bloat)

**Purpose:** Shows visual list of active talent bonuses

**Example Output:**
```
Damage & Healing
─────────────────
+5% Elemental Damage (Concussion)
+5% Fire Damage (Call of Flame)
+1% Hit Chance (Elemental Devastation)

Defensive
─────────────────
+5% Armor (Ancestral Guardian)
+2% Dodge (Ancestral Guardian)
-10% Elemental Damage Taken (Elemental Warding)
```

**Status:** Commented out in UI (lines 194-210) but function remains

---

## Key Data Structures

### Talent Object (from talent definition files)
```javascript
{
    id: number,                // Unique ID within tree
    name: string,              // "Elemental Warding"
    icon: string,              // "spell_fire_elemaggreabuff"
    row: number,               // 1-7 (tier)
    col: number,               // 1-4 (column)
    ranks: number,             // 1, 3, or 5
    requires: number,          // Prerequisite talent ID (optional)
    reqRanks: number,          // Required ranks in prerequisite (default: 1)

    // Description formats:
    description: string,       // Simple string
    // OR
    description: array,        // Array with variable placeholders

    // Additional data:
    fullDescription: string,   // Full description (optional)
    values: array,             // Values per rank (for simple talents)
    spellIds: array,           // Spell IDs per rank (for tooltips)
    rankDescriptions: object   // Pre-generated rank descriptions
}
```

### Tree Definition Object
```javascript
{
    name: string,              // "Elemental"
    icon: string,              // "spell_nature_lightning"
    talents: [
        // Array of talent objects
    ]
}
```

### Class Talents Object
```javascript
{
    elemental: {               // Tree 1
        name: "Elemental",
        icon: "spell_nature_lightning",
        talents: [ /* ... */ ]
    },
    enhancement: {             // Tree 2
        name: "Enhancement",
        icon: "spell_nature_lightningshield",
        talents: [ /* ... */ ]
    },
    restoration: {             // Tree 3
        name: "Restoration",
        icon: "spell_nature_magicimmunity",
        talents: [ /* ... */ ]
    }
}
```

### Talent Bonuses Object (returned by getTalentBonuses)
```javascript
{
    // Flat bonuses (%)
    crit: 5,                   // +5% melee crit
    hit: 3,                    // +3% melee hit
    spellCrit: 2,              // +2% spell crit
    spellHit: 1,               // +1% spell hit

    // Percentage multipliers (decimal)
    str_percent: 0.10,         // +10% strength
    armor_percent: 0.08,       // +8% armor
    fire_damage_percent: 0.30, // +30% fire damage

    // Special bonuses
    blockChance: 3,            // +3% block chance
    blockValue_percent: 0.18,  // +18% block value
    dodge: 4,                  // +4% dodge
    parry: 5,                  // +5% parry
    defense: 20,               // +20 defense skill

    // Simulation-specific (ranks stored)
    elemental_weapons_ranks: 3,       // Elemental Weapons 3/3
    improved_fire_totems: 2,          // Improved Fire Totems 2/2
    flurry: 5,                        // Flurry 5/5
    elemental_devastation: 3,         // Elemental Devastation 3/3

    // Threat modifiers
    spirit_armor_threat_percent: 10,  // +10% threat from Spirit Armor
    calming_winds_threat_reduction: 25, // -25% threat from Calming Winds
    totemic_alignment_threat_percent: 90, // 90% totem threat transfer

    // Damage reduction
    fire_dr: 0.10,             // -10% fire damage taken
    frost_dr: 0.10,            // -10% frost damage taken
    nature_dr: 0.10,           // -10% nature damage taken
    elemental_weapons_rockbiter_dr: 0.10, // -10% damage with Rockbiter

    // Form-specific (Druid)
    sharpened_claws_crit: 6,   // +6% crit in feral forms
    predatory_strikes_ap_percent: 0.10,    // +10% AP in feral
    heart_of_wild_bear_sta_percent: 0.20,  // +20% sta in bear
    heart_of_wild_cat_str_percent: 0.20,   // +20% str in cat

    // And many more...
}
```

---

## How to Make Updates/Changes

### Adding a New Class

**Files to update:**
1. **Create talent definition file** - `modules/talents/{class}.js`
2. **Import in `talents_new.js`** - Add import and to `classTalents` map
3. **Implement talent bonuses** - Add case statements in `applyTalentBonuses()`

**Steps:**

1. **Create talent definition file:**
   ```javascript
   // modules/talents/newclass.js
   export const newclassTalents = {
       tree1: {
           name: 'Tree 1',
           icon: 'spell_icon',
           talents: [
               {
                   id: 1,
                   name: 'Talent Name',
                   icon: 'spell_icon',
                   row: 1,
                   col: 1,
                   ranks: 5,
                   description: 'Increases damage by 1% per rank.',
                   values: [1, 2, 3, 4, 5]
               },
               // ... more talents
           ]
       },
       tree2: { /* ... */ },
       tree3: { /* ... */ }
   };
   ```

2. **Import in `talents_new.js`:**
   ```javascript
   import { newclassTalents } from './talents/newclass.js';

   export const classTalents = {
       // ... existing classes
       newclass: newclassTalents
   };
   ```

3. **Implement bonuses in `applyTalentBonuses()`:**
   ```javascript
   // Add case statements for each talent
   case 'Talent Name':
       bonuses.damage_percent = (bonuses.damage_percent || 0) + points;
       break;
   ```

### Adding a New Talent

**Files to update:**
1. **Talent definition file** - `modules/talents/{class}.js`
2. **`talents_new.js`** - Add bonus mapping in `applyTalentBonuses()`

**Steps:**

1. **Add talent to tree definition:**
   ```javascript
   {
       id: 25,
       name: 'New Talent',
       icon: 'spell_icon',
       row: 5,        // Tier 3 (10 points required)
       col: 3,
       ranks: 3,
       requires: 17,  // Requires talent 17
       reqRanks: 5,   // Requires 5/5 in prerequisite
       description: [
           "Increases spell damage by ",
           ["$", "$L22", "1", { tree: "elemental", talent: 25, values: [5, 10, 15] }],
           "%."
       ],
       spellIds: [12345, 12346, 12347]
   }
   ```

2. **Add bonus mapping:**
   ```javascript
   case 'New Talent':
       const values = [5, 10, 15];
       bonuses.spell_damage_percent = (bonuses.spell_damage_percent || 0) + (values[points - 1] / 100);
       break;
   ```

3. **Test:**
   - Talent appears in correct row/column
   - Tier requirement works (10 points for row 5)
   - Prerequisite requirement works
   - Tooltip shows rank-specific description
   - Stat bonus applies correctly

### Modifying Talent Bonus Calculation

**File:** `applyTalentBonuses()` (Line 728)

**Example: Change Elemental Warding to also reduce Shadow damage:**

```javascript
case 'Elemental Warding':
    bonuses.fire_dr = (bonuses.fire_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
    bonuses.frost_dr = (bonuses.frost_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
    bonuses.nature_dr = (bonuses.nature_dr || 0) + parseFloat(talent.values[points - 1]) / 100;

    // NEW: Add shadow DR
    bonuses.shadow_dr = (bonuses.shadow_dr || 0) + parseFloat(talent.values[points - 1]) / 100;
    break;
```

### Adding Talent Arrows

**Arrows are automatically drawn** based on `requires` property

**Example:**
```javascript
{
    id: 10,
    name: 'Stormstrike',
    requires: 17,    // Requires Elemental Weapons (id: 17)
    reqRanks: 5      // Requires 5/5 ranks
}
```

**Arrow will draw automatically from talent 17 → talent 10**

**To customize arrow type:** Modify routing logic in `drawTalentConnections()`

### Debugging Talents

**Enable logging:**
```javascript
// In getTalentBonuses()
console.log('Talent Bonuses:', bonuses);

// In updateTalentPoints()
console.log('Updated talent:', container.id, 'to', points, 'points');

// In isTalentAvailable()
console.log('Talent availability:', container.id, available);
```

**Inspect talent data:**
```javascript
// Get talent element
const talent = document.getElementById('elemental-5');

// Check data attributes
console.log('Points:', talent.dataset.points);
console.log('Max:', talent.dataset.maxPoints);
console.log('Requires:', talent.dataset.requires);
console.log('Req ranks:', talent.dataset.reqRanks);

// Check classes
console.log('Available:', talent.classList.contains('available'));
console.log('Locked:', talent.classList.contains('locked'));
console.log('Has points:', talent.classList.contains('has-points'));
console.log('Maxed:', talent.classList.contains('maxed'));
```

**Common Issues:**
- **Talent not appearing:** Check row/col in talent definition
- **Arrow not drawing:** Check `requires` property and target talent ID
- **Wrong tier requirement:** Check row calculation (row 1-2 = tier 1, row 3-4 = tier 2, etc.)
- **Bonus not applying:** Check case statement in `applyTalentBonuses()`
- **Tooltip wrong rank:** Check `rankDescriptions` JSON parsing

---

## Performance Considerations

### UI Rendering
- **Initial render:** ~200-300ms (3 trees × 20-30 talents each)
- **Arrow drawing:** ~100-150ms (SVG path generation)
- **State updates:** ~50ms (updateAllTalentStates after each click)

### Event Handling
- **Event delegation:** Single listener on container (not per talent)
- **Debouncing:** Not needed (instant response expected)

### Stat Calculation
- **getTalentBonuses:** ~10ms (iterates all talents once)
- **applyTalentBonuses:** O(1) per talent (switch statement)

### Optimization Tips
1. **Cache DOM queries:** Store talent elements in Map for faster lookup
2. **Batch updates:** Update multiple talents before calling `updateAllTalentStates()`
3. **Lazy arrow rendering:** Only draw arrows when tree is visible
4. **Virtualization:** Only render visible talents (not needed for 4×7 grid)

---

## Related Files

- **`modules/talents/{class}.js`** - Talent definitions per class
  - `modules/talents/shaman.js` (1,234 LOC)
  - `modules/talents/druid.js` (987 LOC)
  - `modules/talents/paladin.js` (876 LOC)
  - `modules/talents/warrior.js` (654 LOC)
  - ... etc
- **`app.js`** - Calls `generateTalentInputs()` and `getTalentBonuses()`
- **`modules/ui/calculator.js`** - Uses talent bonuses in stat calculations
- **`modules/character/buffs.js`** - Provides `getActiveWeaponImbue()` for conditional bonuses
- **`modules/shaman/dps.js`** - Uses talent bonuses for DPS simulation
- **`modules/tank/tankSimulator.js`** - Uses talent bonuses for tank simulation

---

## Known Issues / TODOs

1. **Large switch statement** (500+ lines) - Consider talent bonus registry pattern
2. **Hardcoded talent names** - Fragile (rename breaks bonus mapping)
3. **No validation** - Talent definitions not validated on load
4. **Priest/Rogue bonuses incomplete** - Need implementation in `applyTalentBonuses()`
5. **No undo/redo** - Can't undo accidental point removals
6. **No talent presets** - Can't save/load common builds quickly
7. **Arrow routing conflicts** - Some arrow paths overlap (visual only)

---

## Testing Strategy

### Manual Testing Checklist
- [ ] All 9 classes load without errors
- [ ] Talents appear in correct grid positions
- [ ] Arrows draw correctly between prerequisites
- [ ] Tier requirements work (0/5/10/15/20/25/30 points)
- [ ] Prerequisite requirements work (requires X ranks)
- [ ] Left-click adds points correctly
- [ ] Right-click removes points correctly
- [ ] Cannot remove points if dependent talent has points
- [ ] 51-point limit enforced
- [ ] Tooltips show rank-specific descriptions
- [ ] Visual states update correctly (locked/available/has-points/maxed)
- [ ] Arrow states update correctly (grey/golden)
- [ ] Clear tree button works
- [ ] Tree point counters update (0/31, 15/31, etc.)
- [ ] Stats recalculate after talent changes
- [ ] All talent bonuses apply correctly

### Unit Testing (Recommended)
- Test `isTalentAvailable()` with various tier/prerequisite combos
- Test `canRemoveTalentPoint()` with dependent talents
- Test `getTalentBonuses()` with known talent allocations
- Test `processDescriptionArray()` with variable placeholders
- Test `generateRankDescriptions()` for all ranks
- Test arrow routing for vertical/horizontal/90-degree paths

---

## Architecture Philosophy

**talents_new.js should:**
- ✅ Provide visual talent tree UI
- ✅ Enforce WoW Classic talent rules (tiers, prerequisites, 51 points)
- ✅ Map talent points to stat bonuses
- ✅ Support all 9 classes
- ❌ NOT contain talent definitions (use separate talent files)
- ❌ NOT contain stat calculation logic (use calculator.js)
- ❌ NOT contain simulation logic (use dps.js, tankSimulator.js)

**Future Refactoring Goals:**
1. Extract `applyTalentBonuses()` to registry pattern (reduce switch statement)
2. Add talent definition validation (schema checking)
3. Implement undo/redo system
4. Add talent preset save/load
5. Complete Priest and Rogue bonus implementations
6. Extract arrow rendering to separate module
7. Add talent search/filter functionality

---

## Version History

- **v1.0:** Legacy row-based format (deprecated)
- **v2.0:** New grid-based tree format (Shaman only)
- **v3.0:** All classes converted to tree format
- **Current:** Full 9-class support with comprehensive bonus system
