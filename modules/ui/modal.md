# Modal System Documentation

## Overview

The modal system (`modules/ui/modal.js`) provides a unified interface for item selection and enchant selection in IchaCalc. It handles filtering, searching, rendering, and state management for both items and enchants.

## Table of Contents

1. [Item Selection Modal System](#item-selection-modal-system)
2. [Enchant Selection Modal System](#enchant-selection-modal-system)
3. [Filtering and Search Functionality](#filtering-and-search-functionality)
4. [Quality and Required Level Filters](#quality-and-required-level-filters)
5. [Stat-Based Search](#stat-based-search)
6. [Can Equip Filter](#can-equip-filter)
7. [Item Rendering and Tooltips](#item-rendering-and-tooltips)
8. [Modal State Management](#modal-state-management)
9. [Modifying Filtering Logic](#modifying-filtering-logic)
10. [Adding New Filter Types](#adding-new-filter-types)

---

## Item Selection Modal System

### Opening the Item Modal

**Function:** `openItemModal(slotId, items, elements, anchorEl?)`

Opens the **anchored item picker** (not a centered fullscreen modal): `#item-modal` is `item-picker-root` with a dimmed `#item-modal-backdrop` (click closes) and `#item-modal-panel` positioned **beside** the slot. **Left column** (`#gear-icons-left`): panel opens to the **right** of the slot (gap after the slot’s right edge). **Right column** (`#gear-icons-right`): panel opens to the **left**. Horizontal clamping uses `getItemPickerMaxLeft()` (via `getRightGearIconsLeftEdge()` = **min of `.icon-frame` `left` inside `#gear-icons-right`**, not the column box, so padding does not eat clearance) plus `ITEM_PICKER_RIGHT_GEAR_GAP` (32px) and viewport margin. **East** placement uses `left = min(maxLeft, max(minLeft, left))` so we never force `minLeft` past the gear cap (that previously overlapped the right column). The panel’s **top** aligns with the slot’s **top**; if the bottom would clip the viewport, `top` is shifted up with **`ITEM_PICKER_MARGIN_BOTTOM`** (~28px) so the panel does not sit flush against the bottom edge. If there is not enough horizontal room on the preferred side, placement **flips** to the other side of the slot, then `left` is clamped. Without an anchor, the panel is centered (also clamped with `getItemPickerMaxLeft`). **Gear Planner** (`body[data-app-mode="gearPlanner"]`): always **viewport-centered** — no slot anchor (Gear Planner used to pass `gp_icon_*`, which shifted the panel like a character-sheet slot and clipped it). `getItemPickerMaxLeft` also skips the hidden character-sheet right-column cap in that mode. Opening uses a short slide/fade-in (`item-picker-panel--visible`); `data-item-picker-side` is `east` (panel right of slot) | `west` | `center` for CSS, and `transform-origin` is set in JS (`0 0`, `100% 0`, or `50% 50%`).

**Parameters:**
- `slotId` (string): The equipment slot identifier (e.g., 'mainhand', 'offhand', 'head', 'chest')
- `items` (Array): Array of item objects available for the slot
- `elements` (Object): DOM elements object containing `modal`, `modalTitle`, `modalSearchInput`, `modalItemList`
- `anchorEl` (HTMLElement | null, optional): Gear slot frame; defaults to `document.getElementById('icon_frame_' + slotId)` on Character Planner. Ignored on Gear Planner (centered).

**Filter UI:**
1. **Primary row** (`.item-picker-filters-primary-row`): six equal columns — search, **type**, Primary, Secondary, Defensive, Quality. Second row (`.item-picker-instance-row`): four compact checkbox dropdowns — Dungeons, Raids, World Bosses, Other (same UX as Quality).
2. **Toolbar**: **min / max** required level — `.item-picker-req-axis` + dual-thumb range (`#ilvl-min-slider` / `#ilvl-max-slider`, 1–60), **Can equip** (`#can-equip-toggle`), **DPS** / **Tank** sort buttons (larger tap targets), **Reset**.

**Panel layout (CSS):** `#item-modal-panel` is wider (`min(96vw, 1320px)`), height capped at `min(94vh, 100dvh - 16px)` with `overflow: hidden` so the flex column bounds correctly. Filters scroll inside `max-height: min(42vh, 400px)` when tall; `#modal-item-list` keeps at least **140px** height and scrolls. UI-wide scale is handled by `modules/ui/uiScale.js` (2560×1440 auto-fit + manual cog in top nav).

**Behavior:**
1. Sets `dataset.currentSlot` and `dataset.anchorSlotId` on the root
2. Restores saved filters (search, stats, quality, required-level range)
3. Shows/hides armor vs weapon dropdown column by slot
4. Renders via `filterAndRenderItems`, then shows root (`display: block`), positions panel, focuses search

**Example:**
```javascript
openItemModal('mainhand', weaponItems, {
    modal: document.getElementById('item-modal'),
    modalTitle: document.getElementById('modal-title'),
    modalSearchInput: document.getElementById('modal-search-input'),
    modalItemList: document.getElementById('modal-item-list')
});
```

### Slot-Specific Filtering

**Function:** `filterItemsBySlot(items, slot)`

Applies intelligent filtering based on equipment slot rules.

**Mainhand Slot:**
- Allows: One-hand / One-Hand / One-Handed, Main Hand, and Two-hand / Two-Hand / Two-Handed weapons (comma-combined Atlas lines such as `One-Hand, Dagger` are parsed by splitting on comma)
- Blocks: Off Hand only weapons; **wands, bows, crossbows, guns, thrown** (ranged-slot subtypes); **relics** (Totem / Idol / Libram with `Relic` in tooltip)

**Offhand Slot:**
- **Item list:** `getItemsForSlot('offhand')` merges **`offhand.json`** with **One-hand** weapons from **`mainhand.json`** (so dual-wielders see real 1H weapons; shields/frills stay in `offhand.json`).
- **Modal filter:** Allows **One-hand** (including `One-Hand, …`), **Off Hand** (OH-only weapons), **Held In Off-Hand**, **Shields**; blocks **Main Hand**–only rows, **Two-hand** weapons, and the same **ranged subtypes** / **relics** as mainhand.
- **One-hand** / **Off Hand** melee in OH: `canClassEquipItem` → **`CAN_DUAL_WIELD`** (warrior, rogue, hunter, shaman). Shields → warrior/paladin/shaman; held-in-off-hand → any class.

**Ranged Slot:**
- Allows only: ranged weapon subtypes (wand/bow/crossbow/gun/thrown as early tooltip lines) **or** relic items (totem/idol/libram + relic). Class-specific equipping is still enforced by `canClassEquipItem()`.

**Weapon type dropdown (`syncWeaponTypeFilterUI`):**
- **Mainhand:** One-Handed, Two-Handed, plus melee subtypes (Axe, Sword, Mace, Dagger, Fist Weapon, Polearm, Staff, Fishing Pole) — no Shield, no ranged, no relic rows.
- **Offhand:** handedness + melee + Shield; no ranged, no relic rows.
- **Ranged:** depends on class via `CLASS_RANGED_TYPE`: Hunter/Warrior/Rogue → Bow, Crossbow, Gun, Thrown; Priest/Mage/Warlock → Wand; Shaman → Totem; Druid → Idol + Wand; Paladin → Libram. Hidden rows are unchecked and removed from `savedFilters.stats`.
- **Default:** all **visible** weapon checkboxes are checked so the list is not empty. Armor-type leftovers are stripped when opening a weapon slot (and weapon leftovers when opening armor).
- **Match logic:** handedness is OR among selected One-Handed/Two-Handed; subtype is OR among selected types; the two groups AND together. If every visible handedness (or every visible subtype) is selected, that group is unrestricted. Checking only **Dagger** matches `Dagger` and `One-Hand, Dagger`. Checking only **Two-Handed** shows all two-hand weapons. Real stats still AND. Armor types stay OR among Plate/Mail/Leather/Cloth and are not affected.

**Other Slots:**
- No additional filtering (items are already slot-appropriate from database)

**`canClassEquipItem`:** For mainhand/offhand, rejects ranged subtypes and relics before other rules. One-hand detection is case-insensitive (`One-Hand` / `One-hand`).

---

## Enchant Selection Modal System

### Opening the Enchant Modal

**Function:** `openEnchantModal(slotId, enchants, elements)`

Opens the enchant selection modal for a specific equipment slot.

**Parameters:**
- `slotId` (string): The equipment slot identifier
- `enchants` (Array): Array of enchant objects available for the slot
- `elements` (Object): DOM elements object containing:
  - `enchantModal`: The modal container element
  - `enchantModalTitle`: Title element
  - `enchantModalList`: List container for enchants

**Behavior:**
1. Sets the current slot in the modal's dataset
2. Updates modal title
3. Resets search input
4. Stores original enchant database for index mapping
5. Applies smart filtering based on currently equipped item type
6. Renders filtered enchants
7. Displays modal and focuses search input

**Smart Enchant Filtering:**
The system automatically filters enchants based on the currently equipped item:
- Gets the equipped item for the slot
- Determines item type (weapon type, armor type, etc.)
- Uses `filterEnchantsByItemType()` to show only relevant enchants
- For example: Only shows shield-specific enchants when a shield is equipped

### Enchant Rendering

**Function:** `renderEnchants(enchants, allEnchants, listElement)`

Renders enchants as clickable items with hover tooltips.

**Features:**
- Displays enchant name
- Maps enchants to original database indices for selection
- Attaches tooltip handlers showing enchant effects
- Shows "No enchants found" when filter results are empty

---

## Filtering and Search Functionality

### Unified Item Filtering

**Function:** `filterAndRenderItems(allItems, filters, listElement)`

Main filtering function that applies multiple filter types simultaneously.

**Filter Object Structure:**
```javascript
{
    search: '',           // Text search term
    stats: [],           // Array of stat filter strings
    qualities: [3,4,5],  // Array of quality integers (0-5)
    ilvlMin: 1,        // Minimum required level (tooltip)
    ilvlMax: 60,        // Maximum item level
    slot: 'mainhand'    // Current slot ID
}
```

**Filter Application Order:**
1. Slot-specific filtering (weapon hand restrictions)
2. Name and stat text search
3. Item level range
4. Stat requirements (must match ALL selected stats)
5. Quality tier
6. Sorting by primary stat value (if stat filters active)

### Text Search

**Search Scope:**
- Item name (case-insensitive)
- All tooltip text content

**Implementation:**
```javascript
if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    filteredItems = filteredItems.filter(item => {
        if (item.name.toLowerCase().includes(searchLower)) {
            return true;
        }
        if (item.tooltip_lines_raw) {
            const tooltipText = item.tooltip_lines_raw.join(' ').toLowerCase();
            if (tooltipText.includes(searchLower)) {
                return true;
            }
        }
        return false;
    });
}
```

### Enchant Filtering

**Function:** `filterAndRenderEnchants(allEnchants, searchTerm, listElement, originalDatabase)`

Filters enchants based on search term.

**Search Matching:**
- Enchant name
- Stat keys (e.g., 'stamina', 'intellect')
- Description text

---

## Quality and Required Level Filters

### Quality Filter

**Quality Values:**
- 0: Poor (Gray)
- 1: Common (White)
- 2: Uncommon (Green)
- 3: Rare (Blue)
- 4: Epic (Purple)
- 5: Legendary (Orange)

**Default:** Rare, Epic, and Legendary (3, 4, 5)

**Implementation:**
```javascript
if (filters.qualities && filters.qualities.length > 0) {
    filteredItems = filteredItems.filter(item =>
        filters.qualities.includes(item.quality)
    );
}
```

### Required Level Filter (dual range, 1–60)

**Range:** Min/max **character level** from tooltip (`Requires Level N`), not WoW item level. UI: one track with two thumbs (`#ilvl-min-slider`, `#ilvl-max-slider`); values sync to hidden `#ilvl-min` / `#ilvl-max` for `getCurrentFilters()`. The green fill (`#req-level-fill`) is positioned with `calc(8px + (100% - 16px) * t)` so it lines up with the inset track and native thumbs.

**Parsing:** `parseReqLevelInput` + `normalizeReqLevelPair` clamp to 1–60, swap if reversed, and avoid `NaN` (which would otherwise make every leveled item fail the range check).

**Behavior:**
- Extracts level requirement from tooltip text (e.g., "Requires Level 60")
- Quest rewards and items without level requirements always pass the filter
- Default range: **1–60** (sliders and `savedFilters.ilvlMin` / `ilvlMax`)

**Panel placement:** `positionItemPickerPanel` uses a 12px gap from the slot. After viewport clamping, west-side panels are checked so the panel’s right edge does not cross into the anchor (`ar.left - GAP`); if there is no room on the left, it tries opening east instead.

**Implementation:**
```javascript
const levelLine = item.tooltip_lines_raw.find(line =>
    line && line.includes('Requires Level')
);
if (levelLine) {
    const match = levelLine.match(/Requires Level (\d+)/);
    if (match) {
        itemLevel = parseInt(match[1]);
        hasLevelRequirement = true;
    }
}

if (!hasLevelRequirement) return true; // Quest rewards pass
return itemLevel >= minLevel && itemLevel <= maxLevel;
```

---

## Stat-Based Search

### Multi-Stat Filtering

**Requirement:** Items must match ALL selected stats (AND logic, not OR)

**Stat Categories:**
1. **Armor Types:** Plate, Mail, Leather, Cloth
2. **Weapon Types:** Axe, Sword, Mace, Dagger, Fist Weapon, etc.
3. **Primary Stats:** Stamina, Agility, Strength, Intellect, Spirit
4. **Secondary Stats:** Attack Power, Spell Power, Critical Strike, Hit, Haste
5. **Defensive Stats:** Defense, Armor, Dodge, Parry, Block

### Stat Search Terms

The system uses `getStatSearchTerms()` to find alternative search terms for stats:

**Example:** "Spell Power" matches:
- "spell power"
- "damage and healing"
- "spell damage and healing"

**Haste** uses `STAT_ALIASES['haste']` in `modules/character/stats.js` so the filter matches Turtle equip text (e.g. "attack and casting speed", "casting speed", "% haste", "melee haste"), not only the word "haste".

### Stat Preview

**Function:** `extractStatPreview(item, selectedStats)`

Shows matched stat values inline with item names in the modal list.

**Output Format:**
```
+40 Stamina • +30 Intellect • +15 Spell Hit Rating
```

### Stat-Based Sorting

When stat filters are active, items are sorted by the **first non-type stat** in descending order.

**Excluded from Sorting:**
- Armor types (plate, mail, leather, cloth)
- Weapon types (sword, axe, etc.)

**Stat Key Mapping:**
```javascript
const statFilterToKey = {
    'stamina': 'sta',
    'agility': 'agi',
    'strength': 'str',
    'intellect': 'int',
    'spirit': 'spi',
    'defense': 'def',
    'armor': 'armor',
    'dodge': 'dodge',
    'parry': 'parry',
    'block': 'blockChance',
    'block value': 'blockValue',
    'attack power': 'attackPower',
    'spell power': 'dmgAndHealing',
    'healing power': 'healing',
    'critical strike': 'crit',
    'hit': 'hit',
    'haste': 'haste',
    'health': 'health',
    'mana': 'mana'
};
```

**Implementation:**
```javascript
filteredItems.sort((a, b) => {
    const statsA = parseStatsFromTooltip(a);
    const statsB = parseStatsFromTooltip(b);

    const valueA = statsA[statKey] || 0;
    const valueB = statsB[statKey] || 0;

    return valueB - valueA; // Descending order
});
```

---

## Can Equip Filter

A "Can Equip" toggle button (green when active, default on) filters out items the current class cannot use. It checks four things in order:

### 1. Explicit Class Restrictions

Items with a `"Classes: X, Y"` line in `tooltip_lines_raw` are restricted to those classes. If the player's class is not in the list, the item is hidden.

### 2. Ranged Slot Restrictions

Each class can only equip a specific type of ranged item:

| Class | Allowed Ranged Type | Tooltip Markers |
|-------|-------------------|-----------------|
| Shaman | Totem | `Relic` + `Totem` |
| Druid | Idol | `Relic` + `Idol` |
| Paladin | Libram | `Relic` + `Libram` |
| Priest, Warlock, Mage | Wand | `Wand` |
| Warrior, Rogue, Hunter | Ranged weapons | Bow, Crossbow, Gun, Thrown (not Relic/Wand) |

### 3. Offhand Slot Restrictions

| Item Type | Who Can Equip | Detection |
|-----------|--------------|-----------|
| Shield | Warrior, Paladin, Shaman | `Shield` in tooltip |
| Held In Off-Hand | All classes | `Held In Off-Hand` in tooltip |
| One-hand weapon (dual wield) | Warrior, Rogue, Hunter, Shaman | `One-hand` in tooltip |
| Off Hand weapon | Warrior, Rogue, Hunter, Shaman | `Off Hand` (not Shield/Held) |

Classes that cannot dual wield only see shields (if allowed) and "Held In Off-Hand" items.

### 4. Armor Type Proficiency

Each class can only wear certain armor types:

| Class | Allowed Armor |
|-------|--------------|
| Priest, Warlock, Mage | Cloth |
| Rogue, Druid | Cloth, Leather |
| Shaman, Hunter | Cloth, Leather, Mail |
| Warrior, Paladin | Cloth, Leather, Mail, Plate |

### Implementation

- **`canClassEquipItem(item, playerClass, slot)`**: Internal function applying all rules above.
- **`canEquipFilterActive`**: Module-level boolean state, default `true`.
- **`CLASS_ARMOR_PROFICIENCY`**: Lookup table mapping class -> allowed armor types.
- **`CLASS_RANGED_TYPE`**: Lookup table mapping class -> allowed ranged item subtype.
- **`CAN_DUAL_WIELD`**: Set of classes that can equip weapons in offhand.
- **`CAN_USE_SHIELD`**: Set of classes that can equip shields.
- The current class is read via `getPlayerClassForItemFilters()`: `#class-race-sidebar` `dataset.selectedClass`, then fallback `.class-icon.active`, then `warrior`.
- The current slot is passed from `filters.slot` in `filterAndRenderItems`.
- "Reset Filters" resets the toggle back to on.

---

## Loot Source / Instance Filter

Four compact **dropdowns** on `.item-picker-instance-row` (`#instances-dungeons-dropdown`, `#instances-raids-dropdown`, `#instances-worldbosses-dropdown`, `#instances-other-dropdown`). Open the header, check instances, close — menus are `max-height: 220px` with overflow scroll so they do not fill the screen. Labels show a count when filters are active (`Raids (2)`). Data from `/data/loot/` via `modules/gear/itemSources.js`.

- **OR semantics**: item shown if any source matches a selected instance id
- **Empty selection**: no instance filter (all items)
- **`savedFilters.instances`**: persisted with other modal filters
- **Source subline**: `getPrimarySourceLabel(itemId)` on each modal row (`.modal-item-source`)
- **Gear planner**: `setItemModalPlayerClassOverride(classId)` for can-equip when picking plan items

---

## Item Rendering and Tooltips

### Item List Rendering

**Function:** `renderItems(items, listElement)`

Creates DOM elements for each item in the filtered list.

**Item Structure:**
```html
<div class="modal-item" data-item-id="12345">
    <img src="icon.jpg" alt="Item Name">
    <div class="modal-item-info">
        <span class="q4">Epic Item Name</span>
        <div class="item-stat-preview">+40 Stamina • +30 Intellect</div>
    </div>
    <span class="item-dps-score">~142 DPS</span>  <!-- only when stat weights available -->
</div>
```

**Quality Classes:** `q0` through `q5` for color-coding

### DPS Score Display

When stat weights have been generated (via the Stat Weights sim), each item row shows an estimated DPS contribution (`~X DPS`) right-aligned. The score is computed by `calculateItemDpsScore()` in `tooltips.js`, which multiplies each parsed item stat by the corresponding stat weight. Item tooltips also show the score at the bottom.

**Sort by DPS:** A "Sort by DPS" toggle button appears in the modal filter area when stat weights are available. When active (gold highlight), items are sorted descending by DPS score, overriding stat-based sort. The toggle state resets when filters are cleared.

### Tooltip System

**Hover Behavior:**
- On `mouseenter`: Display tooltip with full item/enchant details
- On `mousemove`: Update tooltip position to follow cursor
- On `mouseleave`: Hide tooltip

**Tooltip Positioning:**

`#item-tooltip` uses **`position: fixed`** (see `style.css`) with **`positionItemTooltipAtCursor()`** from `itemTooltipPosition.js`: **`clientX` / `clientY`** plus offset, clamped to `innerWidth` / `innerHeight`. This matches viewport space to the tooltip’s containing mode and avoids skew from mixing `pageX`/`pageY` with viewport clamping or from **`body { zoom }`** (Edge vs other Chromium browsers).

**Performance:** Uses `requestAnimationFrame()` for smooth tooltip updates

---

## Modal State Management

### Persistent Filter State

**Object:** `savedFilters`

Stores filter settings that persist across modal open/close cycles:

```javascript
const savedFilters = {
    search: '',
    stats: [],
    qualities: [3, 4, 5],
    ilvlMin: 1,
    ilvlMax: 60
};
```

**Benefits:**
- User doesn't lose filter settings when closing modal
- Maintains consistent experience across slots
- Reduces need to re-configure filters

### Getting Current Filters

**Function:** `getCurrentFilters()`

Reads current UI state and updates `savedFilters`.

**Returns:**
```javascript
{
    search: string,
    stats: Array<string>,
    qualities: Array<number>,
    ilvlMin: number,
    ilvlMax: number,
    slot: string
}
```

### Resetting Filters

**Function:** `resetFilters()`

Resets all filters to default values and updates UI.

**Default Values:**
- Search: empty string
- Stats: empty array
- Qualities: [3, 4, 5] (Rare, Epic, Legendary)
- Required level: 1–60

**UI Updates:**
- Clears search input
- Unchecks all stat checkboxes
- Resets quality checkboxes to defaults
- Resets required-level sliders to 1–60
- Triggers filter change event to re-render

### Event System

**Filter Change Event:**
```javascript
const event = new CustomEvent('filterChanged');
document.dispatchEvent(event);
```

Fired when:
- Stat checkboxes change
- Reset button clicked
- Any filter value modified

**Stat Filter Listeners:**

**Function:** `setupStatFilterListeners()`

Attaches change event handlers to all stat filter checkboxes:
- `armor-type-filter`
- `weapon-type-filter`
- `primary-stats-filter`
- `secondary-stats-filter`
- `defensive-stats-filter`

---

## Modifying Filtering Logic

### Adding a New Filter Condition

**Step 1:** Add filter parameter to the filters object
**Step 2:** Add filter application logic in `filterAndRenderItems()`
**Step 3:** Update UI to capture filter value
**Step 4:** Update `getCurrentFilters()` to read new filter
**Step 5:** Update `resetFilters()` to handle new filter

**Example: Adding a "Socket Count" Filter**

```javascript
// Step 1: Add to savedFilters
const savedFilters = {
    search: '',
    stats: [],
    qualities: [3, 4, 5],
    ilvlMin: 1,
    ilvlMax: 60,
    minSockets: 0  // NEW
};

// Step 2: Add filtering logic
export function filterAndRenderItems(allItems, filters, listElement) {
    // ... existing filters ...

    // Apply socket filter
    if (filters.minSockets > 0) {
        filteredItems = filteredItems.filter(item => {
            if (!item.tooltip_lines_raw) return false;

            // Count socket lines in tooltip
            const socketCount = item.tooltip_lines_raw.filter(line =>
                line.includes('Socket') &&
                (line.includes('Red') || line.includes('Blue') ||
                 line.includes('Yellow') || line.includes('Meta'))
            ).length;

            return socketCount >= filters.minSockets;
        });
    }

    // ... continue with rendering ...
}

// Step 3: Add UI element in HTML
// <input type="number" id="min-sockets" min="0" max="3" value="0">

// Step 4: Update getCurrentFilters()
export function getCurrentFilters() {
    // ... existing code ...

    const minSocketsInput = document.getElementById('min-sockets');
    const minSockets = minSocketsInput ? parseInt(minSocketsInput.value) : 0;

    savedFilters.minSockets = minSockets;

    return {
        // ... existing properties ...
        minSockets: savedFilters.minSockets
    };
}

// Step 5: Update resetFilters()
function resetFilters() {
    // ... existing resets ...

    savedFilters.minSockets = 0;
    const minSocketsInput = document.getElementById('min-sockets');
    if (minSocketsInput) minSocketsInput.value = '0';

    // ... trigger filter change ...
}
```

### Modifying Sort Order

**Current Behavior:** Sorts by first stat filter in descending order

**To Change Sort Logic:**

Locate this section in `filterAndRenderItems()`:

```javascript
filteredItems.sort((a, b) => {
    const statsA = parseStatsFromTooltip(a);
    const statsB = parseStatsFromTooltip(b);

    const valueA = statsA[statKey] || 0;
    const valueB = statsB[statKey] || 0;

    // Change this line for different sort order
    return valueB - valueA; // Current: descending
});
```

**Examples:**

**Ascending Order:**
```javascript
return valueA - valueB;
```

**Multi-Stat Sorting:**
```javascript
filteredItems.sort((a, b) => {
    const statsA = parseStatsFromTooltip(a);
    const statsB = parseStatsFromTooltip(b);

    // Primary sort: Stamina
    const staA = statsA['sta'] || 0;
    const staB = statsB['sta'] || 0;
    if (staB !== staA) return staB - staA;

    // Secondary sort: Intellect
    const intA = statsA['int'] || 0;
    const intB = statsB['int'] || 0;
    return intB - intA;
});
```

### Modifying Slot-Specific Rules

To change weapon hand restrictions, edit `filterItemsBySlot()`:

```javascript
function filterItemsBySlot(items, slot) {
    if (slot === 'mainhand') {
        return items.filter(item => {
            const tooltipText = item.tooltip_lines_raw.join('\n');

            const hasOneHand = tooltipHasHandedness(item, 'one-handed');
            const hasMainHand = /main hand/i.test(tooltipText);
            const hasTwoHand = tooltipHasHandedness(item, 'two-handed');
            const hasOffHand = /off hand/i.test(tooltipText);

            // Change this logic to adjust what's allowed
            return hasOneHand || hasMainHand || hasTwoHand || !hasOffHand;
        });
    }

    // Similar for offhand...
}
```

---

## Adding New Filter Types

### Stat Filter Dropdown

To add a new stat category dropdown:

**Step 1:** Add checkbox group to HTML

```html
<div class="filter-dropdown" id="resistance-stats-container">
    <button class="filter-dropdown-button">Resistances</button>
    <div class="filter-dropdown-content">
        <label>
            <input type="checkbox" name="resistance-stats-filter" value="Fire Resistance">
            Fire Resistance
        </label>
        <label>
            <input type="checkbox" name="resistance-stats-filter" value="Nature Resistance">
            Nature Resistance
        </label>
        <!-- etc. -->
    </div>
</div>
```

**Step 2:** Add filter name to checkbox list in `getSelectedStatsFromDropdowns()`

```javascript
function getSelectedStatsFromDropdowns() {
    const stats = [];
    const checkboxNames = [
        'armor-type-filter',
        'weapon-type-filter',
        'primary-stats-filter',
        'secondary-stats-filter',
        'defensive-stats-filter',
        'resistance-stats-filter'  // NEW
    ];

    // ... rest of function unchanged ...
}
```

**Step 3:** Add to `setupStatFilterListeners()`

```javascript
function setupStatFilterListeners() {
    const checkboxNames = [
        'armor-type-filter',
        'weapon-type-filter',
        'primary-stats-filter',
        'secondary-stats-filter',
        'defensive-stats-filter',
        'resistance-stats-filter'  // NEW
    ];

    // ... rest of function unchanged ...
}
```

**Step 4:** Add to `resetFilters()` and `openItemModal()` checkbox clearing loops

Add `'resistance-stats-filter'` to the `checkboxNames` arrays in both functions.

**Step 5:** (Optional) Add stat search term mappings in `stats.js`

If the stat names need alternative search terms, add them to `STAT_ALIASES` in `modules/character/stats.js` (consumed by `getStatSearchTerms()`).

### Custom Filter UI Element

To add a completely new filter type (e.g., dropdown, radio buttons):

**Step 1:** Create UI element

```html
<div class="filter-group">
    <label for="profession-filter">Profession:</label>
    <select id="profession-filter">
        <option value="">All</option>
        <option value="blacksmithing">Blacksmithing</option>
        <option value="engineering">Engineering</option>
        <option value="tailoring">Tailoring</option>
    </select>
</div>
```

**Step 2:** Add to filter state

```javascript
const savedFilters = {
    search: '',
    stats: [],
    qualities: [3, 4, 5],
    ilvlMin: 1,
    ilvlMax: 60,
    profession: ''  // NEW
};
```

**Step 3:** Add filtering logic to `filterAndRenderItems()`

```javascript
// Apply profession filter
if (filters.profession) {
    filteredItems = filteredItems.filter(item => {
        if (!item.tooltip_lines_raw) return false;

        const tooltipText = item.tooltip_lines_raw.join('\n').toLowerCase();
        return tooltipText.includes(`requires ${filters.profession}`);
    });
}
```

**Step 4:** Update `getCurrentFilters()`

```javascript
const professionSelect = document.getElementById('profession-filter');
savedFilters.profession = professionSelect ? professionSelect.value : '';

return {
    // ... other filters ...
    profession: savedFilters.profession
};
```

**Step 5:** Update `resetFilters()`

```javascript
savedFilters.profession = '';
const professionSelect = document.getElementById('profession-filter');
if (professionSelect) professionSelect.value = '';
```

**Step 6:** Update `openItemModal()` to restore filter value

```javascript
const professionSelect = document.getElementById('profession-filter');
if (professionSelect) {
    professionSelect.value = savedFilters.profession;
}
```

**Step 7:** Add event listener

```javascript
const professionSelect = document.getElementById('profession-filter');
if (professionSelect) {
    professionSelect.addEventListener('change', () => {
        const event = new CustomEvent('filterChanged');
        document.dispatchEvent(event);
    });
}
```

---

## Dependencies

The modal system imports and uses:

- `createItemTooltipHTML`, `createEnchantTooltipHTML` from `./tooltips.js`
- `createIconImage`, `getCurrentlyEquippedItem` from `../gear/gear.js`
- `getStatSearchTerms`, `getItemType`, `filterEnchantsByItemType`, `parseStatsFromTooltip`, `KEY_MAP` from `../character/stats.js`

---

## Key Functions Reference

### Exported Functions

| Function | Purpose |
|----------|---------|
| `filterAndRenderItems()` | Main item filtering and rendering |
| `filterAndRenderEnchants()` | Enchant filtering and rendering |
| `openItemModal()` | Opens item selection modal |
| `openEnchantModal()` | Opens enchant selection modal |
| `closeModal()` | Closes all modals |
| `getCurrentFilters()` | Gets current filter state |
| `getSelectedQualities()` | Gets selected quality checkboxes |

### Internal Functions

| Function | Purpose |
|----------|---------|
| `filterItemsBySlot()` | Slot-specific item filtering |
| `renderItems()` | Renders items to DOM (includes DPS score when stat weights available) |
| `renderEnchants()` | Renders enchants to DOM |
| `extractStatPreview()` | Creates stat preview HTML |
| `enchantMatchesSearch()` | Checks if enchant matches search |
| `getSelectedStatsFromDropdowns()` | Collects all selected stats |
| `setupStatFilterListeners()` | Attaches stat filter events |
| `setupResetFilterButton()` | Attaches reset, DPS sort, and can-equip button handlers |
| `resetFilters()` | Resets all filters to defaults (including DPS sort, can-equip on) |
| `canClassEquipItem()` | Checks class restriction, armor proficiency, ranged/offhand slot rules |
| `updateCanEquipButtonStyle()` | Syncs the can-equip button's visual state |

---

## Best Practices

1. **Always use `getCurrentFilters()`** before filtering to ensure saved state is current
2. **Dispatch `filterChanged` event** after modifying any filter to trigger re-render
3. **Store original databases** when filtering arrays to maintain index mapping
4. **Use `requestAnimationFrame()`** for smooth tooltip positioning
5. **Validate filter inputs** before applying (check for null/undefined)
6. **Clear event listeners** on modal close to prevent memory leaks
7. **Test slot-specific logic** for both weapons and armor slots
8. **Log filter results** during development to verify behavior

---

## Common Pitfalls

1. **Not restoring filters** in `openItemModal()` - leads to lost user settings
2. **Forgetting to update `resetFilters()`** - leaves orphaned filter state
3. **Not handling missing tooltip data** - causes filter crashes
4. **Breaking index mapping** when filtering enchants - selection won't work
5. **Forgetting to dispatch `filterChanged`** - UI won't update
6. **Hard-coding slot logic** - use dynamic slot checks instead
7. **Not excluding type filters from sorting** - sorts by "Plate" instead of stats
8. **Tooltip positioning without bounds checking** - tooltips go off-screen

---

## Conclusion

The modal system provides a powerful, extensible framework for item and enchant selection. By following the patterns established in the codebase and using the modification guidelines in this document, you can safely extend the system with new filter types and behaviors while maintaining consistency and performance.
