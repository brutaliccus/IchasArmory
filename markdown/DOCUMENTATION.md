# IchaCalc Documentation

Comprehensive documentation for all modules and Python scripts in the IchaCalc project.

## Table of Contents

1. [Python Scripts](#python-scripts)
   - [server.py](#serverpy)
   - [scrape_bosses.py](#scrape_bossespy)
   - [armory_proxy.py](#armory_proxypy)
2. [Core JavaScript Modules](#core-javascript-modules)
   - [calculator.js](#calculatorjs)
   - [gear.js](#gearjs)
   - [gearCompare.js](#gearcomparejs)
   - [tankSimulator.js](#tanksimulatorjs)
3. [Talent System](#talent-system)
   - [talents_new.js](#talents_newjs)
   - [druid_talents.js](#druid_talentsjs)
   - [paladin_talents.js](#paladin_talentsjs)
   - [warrior_talents.js](#warrior_talentsjs)
   - [shaman_talents.js](#shaman_talentsjs)
4. [Supporting Modules](#supporting-modules)
   - [buffs.js](#buffsjs)
   - [races.js](#racesjs)
   - [stats.js](#statsjs)
   - [tooltips.js](#tooltipsjs)
   - [setBonuses.js](#setbonusesjs)
   - [modal.js](#modaljs)
   - [itemLoader.js](#itemloaderjs)
   - [enchants.js](#enchantsjs)
   - [enchantEffectIds.js](#enchanteffectidsjs)
   - [enchantSpellIds.js](#enchantspellidsjs)
   - [armory.js](#armoryjs)
   - [buildManager.js](#buildmanagerjs)
5. [Main Application](#main-application)
   - [app.js](#appjs)

---

## Python Scripts

### server.py

**Purpose**: Main HTTP server for the IchaCalc application. Handles static file serving, boss data scraping, build storage/retrieval, and coordinates the armory proxy service.

**Key Features**:
- Serves static files (HTML, CSS, JS) on port 6100
- Boss search and scraping endpoints
- Build storage system (6-character build IDs)
- Armory proxy process management
- CORS headers for development

**Main Endpoints**:
- `GET /` - Serves index.html
- `GET /bosses/search?q={query}` - Search for NPCs/bosses
- `GET /bosses/scrape?id={npcId}` - Scrape detailed boss stats
- `POST /builds` - Save a build (returns build ID)
- `GET /builds/{buildId}` - Retrieve a saved build
- `GET /builds/{buildId}/view` - View build in browser (redirects with URL params)

**Key Functions**:
- `generate_build_id()` - Creates unique 6-character build IDs
- `validate_build_id(build_id)` - Validates build ID format
- `save_build(build_data)` - Saves build to JSON file
- `load_build(build_id)` - Loads build from JSON file
- `search_bosses(query)` - Searches Wowhead for NPCs
- `scrape_boss_stats(npc_id)` - Scrapes detailed boss statistics from Wowhead

**Dependencies**:
- `http.server`, `socketserver` - HTTP server
- `requests`, `BeautifulSoup` - Web scraping
- `subprocess` - Armory proxy management
- `json`, `pathlib` - Data handling

**Configuration**:
- `HTTP_PORT = 6100` - Main server port
- `PROXY_PORT = 8001` - Armory proxy port
- `BUILDS_DIR = "builds"` - Build storage directory
- `BUILD_ID_LENGTH = 6` - Build ID character length

---

### scrape_bosses.py

**Purpose**: Standalone script for scraping boss/NPC data from Wowhead. Can be run independently or called by the main server.

**Key Features**:
- Searches Wowhead for NPCs by name
- Scrapes detailed boss statistics (damage, health, level, etc.)
- Handles Wowhead's anti-scraping measures
- Returns structured JSON data

**Main Functions**:
- `search_npcs(query)` - Search for NPCs matching query
- `scrape_npc_stats(npc_id)` - Get detailed stats for a specific NPC
- `parse_damage_range(text)` - Parse damage range from text (e.g., "1234-5678")

**Usage**:
```python
# Search for bosses
results = search_npcs("Patchwerk")

# Scrape specific boss
stats = scrape_npc_stats(16028)  # Patchwerk's NPC ID
```

**Output Format**:
```json
{
  "id": 16028,
  "name": "Patchwerk",
  "level": 63,
  "health": 4137747,
  "minDamage": 2300,
  "maxDamage": 2600,
  "armor": 3700,
  ...
}
```

---

### armory_proxy.py

**Purpose**: Proxy server for WoW Classic armory API requests. Handles CORS issues when making requests from the browser.

**Key Features**:
- Proxies requests to Turtle WoW armory API
- Adds CORS headers to allow browser requests
- Handles character data retrieval
- Error handling and response formatting

**Port**: 8001 (managed by server.py)

**Endpoints**:
- `GET /api/character/{server}/{character}` - Get character data

**Usage**: Automatically started by server.py. Not intended for direct use.

---

## Core JavaScript Modules

### calculator.js

**Purpose**: Core calculation engine for character statistics. Computes effective health, damage reduction, avoidance, and all derived stats.

**Key Functions**:
- `calculateEffectiveHealth(data)` - Main calculation function
  - Takes character data (class, race, gear, talents, buffs)
  - Returns comprehensive stats object
  - Handles all stat aggregation and formulas

**Calculations Performed**:
- Health from stamina (with bonuses)
- Armor and physical damage reduction
- Avoidance (dodge, parry, miss, block)
- Magic resistances and damage reduction
- Attack power, weapon stats
- Spell stats (crit, hit, haste, healing)
- Effective Health Pool (EHP)

**Key Formulas**:
- Physical DR: `armor / (armor + 400 + 85 * attackerLevel)`
- Effective HP: `health / ((1 - DR) * (1 - avoidance))`
- Miss chance: `5% + (defense - 300) * 0.04%`
- Stamina to Health: `10 health per stamina` (base, modified by bonuses)

**Class-Specific Handling**:
- Warrior/Paladin/Druid: Base 300 defense
- Druid forms: Armor multipliers
- Class-specific stat conversions

**Exports**:
- `calculateEffectiveHealth(data)` - Main export

---

### gear.js

**Purpose**: Manages equipped gear, item loading, enchantments, and gear slot interactions.

**Key Features**:
- Equip/unequip items
- Enchant management per slot
- Item stat aggregation
- Icon handling and placeholder management
- Gear slot generation

**Key Functions**:
- `getItemsForSlot(slotId)` - Lazy-load items for a slot
- `equipItem(itemId, slotId)` - Equip an item
- `clearItem(slotId)` - Unequip an item
- `getGearStats()` - Get aggregated stats from all equipped gear
- `getEnchantStats()` - Get aggregated stats from all enchants
- `applyEnchant(slotId, enchantIndex)` - Apply enchant to slot
- `getAppliedEnchant(slotId)` - Get currently applied enchant
- `getCurrentlyEquippedItem(slotId)` - Get equipped item object
- `getEquippedGearObjects()` - Get all equipped items as objects

**State Management**:
- `equippedGear` - Object mapping slot IDs to item IDs
- `selectedEnchants` - Object mapping slot IDs to enchant indices

**Icon Handling**:
- `ICON_BASE_URL` - Primary icon source
- `ICON_BASE_URL_BACKUP` - Fallback icon source
- `PLACEHOLDER_ICON_URL` - Placeholder for missing icons
- `createIconImage(iconName, altText)` - Creates icon image element

**Exports**:
- All gear management functions
- Icon constants and utilities
- Slot icon mappings

---

### gearCompare.js

**Purpose**: Gear comparison system. Allows comparing two items side-by-side with Tank Score calculations.

**Key Features**:
- Side-by-side item comparison
- Tank Score calculation (absolute EHP + mitigation equivalents)
- Quick simulation integration
- Enchant comparison
- Stat difference display

**Tank Score Calculation**:
- Base EHP from health/stamina
- Mitigation EHP from:
  - Avoidance (dodge + parry + miss)
  - Defense (crit reduction)
  - Armor
  - Block Value
  - Block Chance
- Gibbability-adjusted stat weights
- Uses simulation results for accurate weights

**Key Functions**:
- `initializeGearCompare()` - Initialize comparison UI
- `setComparisonItem(item, slot)` - Set item to compare
- `updateStatDifferences(equippedItem, comparisonItem)` - Calculate and display differences
- `calculateTankScore(currentStats, newStats)` - Calculate Tank Score difference
- `calculateAbsoluteTankScore(item, characterStats, isEquippedItem)` - Calculate absolute Tank Score for an item
- `runQuickSim()` - Run simulation for Tank Score calculation
- `calculateStatWeightsForTankScore(stats, useEstimatedSimResults)` - Calculate stat weights

**Simulation Integration**:
- Requires boss selection and simulation
- Stores `equippedResults` and `comparisonResults`
- Uses simulation results for gibbability rating and stat weights

**UI Components**:
- Equipped item panel
- Comparison item panel
- Stat differences display
- Tank Score breakdowns
- Quick sim interface

**Exports**:
- `initializeGearCompare()`
- `setComparisonItem(item, slot)`
- `getCurrentCompareSlot()`
- `setEHPCalculator(callback)`
- `setGetCurrentClass(callback)`
- `setCharacterDataCallbacks(callbacks)`

---

### tankSimulator.js

**Purpose**: Tank simulation engine. Simulates boss attacks and calculates damage taken, avoidance, and death metrics.

**Key Features**:
- Attack table simulation (dodge, parry, miss, block, crit, crush, hit)
- Damage calculation with armor and block value
- Death metrics (min/max/median hits to kill)
- Gibbability Rating (chance of dying in 3 or fewer hits)
- Stat weight calculations
- Multiple simulation iterations for statistical accuracy

**Key Functions**:
- `runTankSimulation(characterData, boss, numHits, iterations)` - Main simulation function
  - Runs multiple iterations
  - Averages results
  - Returns comprehensive stats
- `runSingleSimulation(characterData, boss, numHits)` - Single simulation run
- `calculateDeathMetrics(characterData, boss, iterations)` - Death simulation
  - Runs 10,000 iterations
  - Tracks min/max/median hits to kill
  - Calculates gibbability rating
- `calculateStatWeights(results, characterData, boss)` - Calculate EHP value of stats
  - 1% avoidance EHP value
  - 1 stamina EHP value
  - 1 defense EHP value
  - 1 armor EHP value
  - 1 block value EHP value
  - 1% block chance EHP value
  - Gibbability multiplier applied

**Attack Table Mechanics**:
1. Dodge (if applicable)
2. Parry (if applicable)
3. Miss (base 5% + defense bonus)
4. Block (if applicable, prevents crit/crush)
5. Crit (if not immune, 2x damage)
6. Crush (if not immune, 1.5x damage)
7. Hit (normal damage)

**Avoidance Cap**:
- 100% dodge + parry + miss = crit/crush immune
- Block can push crit/crush off table
- Block reduces damage by block value

**Gibbability Rating**:
- Percentage of iterations where character dies in 3 or fewer damaging hits
- Used to scale stat weights (higher gibbability = stats more valuable)
- Multiplier: `1.0 + (gibbabilityRating / 100) * 2.0`

**Stat Weight Calculations**:
- Uses EHP formula: `HP / ((1 - DR) * (1 - avoidance))`
- Calculates marginal value of +1 stat
- Includes gibbability multiplier
- Defense includes crit reduction value

**Exports**:
- `runTankSimulation(characterData, boss, numHits, iterations)`

---

## Talent System

### talents_new.js

**Purpose**: Unified talent system for all classes. Manages talent trees, talent point allocation, and talent bonus calculation.

**Key Features**:
- Multi-class talent support (Warrior, Paladin, Druid, Shaman)
- Talent tree rendering with arrows
- Talent point allocation/deallocation
- Bonus calculation from talents
- Class-specific talent handling

**Key Functions**:
- `generateTalentInputs(class, container)` - Generate talent UI for a class
- `getTalentBonuses(class)` - Calculate bonuses from allocated talents
- `applyTalentBonuses(bonuses, class, stats)` - Apply talent bonuses to stats
- `resetTalents(class)` - Reset all talents for a class

**Talent Bonus Types**:
- `health_percent` - Health percentage increase
- `armor_percent` - Armor percentage increase
- `armor_percent_from_gear` - Armor percentage from gear only
- `stamina_percent` - Stamina percentage increase
- `defense` - Flat defense increase
- `block_percent` - Block chance increase
- `blockValue_percent` - Block value percentage increase
- `dodge_percent` - Dodge chance increase
- `parry_percent` - Parry chance increase
- And many more...

**Class-Specific Talent Files**:
- `druid_talents.js` - Druid talent definitions
- `paladin_talents.js` - Paladin talent definitions
- `warrior_talents.js` - Warrior talent definitions
- `shaman_talents.js` - Shaman talent definitions

**Exports**:
- `generateTalentInputs(class, container)`
- `getTalentBonuses(class)`
- `classTalents` - Talent definitions object

---

### druid_talents.js, paladin_talents.js, warrior_talents.js, shaman_talents.js

**Purpose**: Class-specific talent definitions. Defines talent trees, prerequisites, and bonuses for each class.

**Structure**:
Each file exports a talent tree object with:
- Talent IDs
- Talent names
- Prerequisites (talent IDs that must be maxed)
- Ranks (array of bonus objects for each rank)
- Position data for UI rendering

**Example Talent Definition**:
```javascript
{
  id: 'thick_hide',
  name: 'Thick Hide',
  maxRank: 5,
  requires: [], // No prerequisites
  ranks: [
    { armor_percent_from_gear: 0.02 }, // Rank 1: +2% armor
    { armor_percent_from_gear: 0.04 }, // Rank 2: +4% armor
    // ... etc
  ]
}
```

---

## Supporting Modules

### buffs.js

**Purpose**: Manages character buffs. Handles buff icons, active buff tracking, and buff exclusivity rules.

**Key Features**:
- Buff icon generation
- Active buff tracking
- Buff exclusivity (e.g., only one flask at a time)
- Buff bonus calculation
- Class-specific buff availability

**Key Functions**:
- `generateBuffIcons(container, class)` - Generate buff UI
- `getActiveBuffs(talentBonuses)` - Get currently active buffs
- `handleBuffExclusivity(buffId, isActive)` - Handle exclusive buffs

**Buff Types**:
- Consumables (food, flasks, elixirs)
- World buffs
- Class buffs
- Form buffs (Druid)

**Exports**:
- `generateBuffIcons(container, class)`
- `getActiveBuffs(talentBonuses)`
- `handleBuffExclusivity(buffId, isActive)`

---

### races.js

**Purpose**: Manages race data, racial bonuses, and race selection.

**Key Features**:
- Race stat bases
- Racial bonuses
- Race icon data
- Class-race combinations

**Key Functions**:
- `getRaceBonuses(race, class)` - Get racial bonuses
- `getSelectedRaceBonuses(race)` - Get selected race bonuses
- `generateRaceIcons(class)` - Generate race selection UI

**Races Supported**:
- Human, Dwarf, Gnome, Night Elf (Alliance)
- Orc, Undead, Tauren, Troll (Horde)

**Exports**:
- `getRaceBonuses(race, class)`
- `getSelectedRaceBonuses(race)`
- `generateRaceIcons(class)`
- `baseStats` - Base stat data
- `raceIconData` - Icon URLs

---

### stats.js

**Purpose**: Parses and processes item stats from tooltips. Handles stat key mapping and item type detection.

**Key Features**:
- Tooltip stat parsing (regex patterns)
- Stat key normalization (sta → stamina, etc.)
- Item type detection
- Enchant filtering by item type

**Key Functions**:
- `parseStatsFromTooltip(item)` - Parse stats from item tooltip lines
- `getItemType(item)` - Detect item type (weapon, armor, etc.)
- `filterEnchantsByItemType(enchants, itemType)` - Filter enchants by compatibility

**Stat Patterns**:
- Primary stats (Stamina, Strength, Agility, Intellect, Spirit)
- Secondary stats (Defense, Armor, Block, Block Value)
- Resistances
- Weapon stats (damage, speed)
- Special stats (all stats, damage and healing, etc.)

**Key Mappings**:
- `KEY_MAP` - Maps short keys to full keys (sta → stamina)

**Exports**:
- `parseStatsFromTooltip(item)`
- `getItemType(item)`
- `filterEnchantsByItemType(enchants, itemType)`
- `KEY_MAP` - Stat key mapping object
- `getStatSearchTerms(stats)` - Get search terms for item filtering

---

### tooltips.js

**Purpose**: Generates HTML tooltips for items and enchants. Handles tooltip styling and stat display.

**Key Features**:
- Item tooltip generation
- Enchant tooltip generation
- Stat formatting
- Quality color coding
- Set bonus display

**Key Functions**:
- `createItemTooltipHTML(item, equippedGear)` - Generate item tooltip
- `createEnchantTooltipHTML(enchant)` - Generate enchant tooltip
- `setGetEquippedGear(callback)` - Set callback for equipped gear (for set bonuses)

**Tooltip Content**:
- Item name (quality-colored)
- Item level and quality
- Slot and type
- Stat lines
- Set bonuses (if applicable)
- Enchant display (if enchanted)

**Exports**:
- `createItemTooltipHTML(item, equippedGear)`
- `createEnchantTooltipHTML(enchant)`
- `setGetEquippedGear(callback)`

---

### setBonuses.js

**Purpose**: Manages item set bonuses. Tracks equipped sets and calculates set bonuses.

**Key Features**:
- Set detection from equipped gear
- Set bonus calculation
- Multi-piece set bonuses
- Class-specific set handling

**Key Functions**:
- `getSetBonuses(equippedGear)` - Calculate active set bonuses

**Set Bonus Types**:
- Stat increases (stamina, strength, etc.)
- Percentage bonuses
- Special effects (e.g., bear form health bonus)

**Exports**:
- `getSetBonuses(equippedGear)`

---

### modal.js

**Purpose**: Manages item and enchant selection modals. Handles filtering, searching, and item/enchant display.

**Key Features**:
- Item modal with search and filters
- Enchant modal
- Quality filtering
- Stat filtering
- Slot-specific filtering

**Key Functions**:
- `filterAndRenderItems(items, filters, container)` - Filter and display items
- `filterAndRenderEnchants(enchants, filters, container)` - Filter and display enchants
- `openItemModal(slot, mode)` - Open item selection modal
- `openEnchantModal(slot)` - Open enchant selection modal
- `closeModal()` - Close modals

**Filtering**:
- Quality (Common, Uncommon, Rare, Epic, Legendary)
- Stats (search by stat name)
- Slot-specific
- Item level

**Exports**:
- `filterAndRenderItems(items, filters, container)`
- `filterAndRenderEnchants(enchants, filters, container)`
- `openItemModal(slot, mode)`
- `openEnchantModal(slot)`
- `closeModal()`
- `getSelectedQualities()`
- `getCurrentFilters()`

---

### itemLoader.js

**Purpose**: Lazy-loads item data from JSON files. Manages item caching and slot-based loading.

**Key Features**:
- Lazy loading (loads items only when needed)
- Item caching
- Slot-based organization
- Item lookup by ID

**Key Functions**:
- `loadSlot(slotId)` - Load items for a slot
- `getItemById(itemId)` - Get item by ID (from cache)
- `getStatus()` - Get loading status

**Item Storage**:
- Items stored in `data/items/{slot}.json`
- Cached in memory after first load
- Slot IDs: head, neck, shoulder, back, chest, wrist, hands, waist, legs, feet, ring1, ring2, trinket1, trinket2, mainhand, offhand, ranged

**Exports**:
- `itemLoader` - Singleton item loader instance

---

### enchants.js

**Purpose**: Manages enchantment database. Provides enchant lookup and filtering.

**Key Features**:
- Enchant database by slot
- Enchant effect lookup
- Enchant filtering by item type

**Key Functions**:
- Enchant database access
- Effect ID to enchant mapping

**Enchant Database Structure**:
```javascript
{
  'head': [
    { name: 'Arcanum of...', effect_id: 123, stats: {...} },
    ...
  ],
  'shoulder': [...],
  ...
}
```

**Exports**:
- `enchantDatabase` - Enchant database object

---

### enchantEffectIds.js, enchantSpellIds.js

**Purpose**: Mapping files for enchant effect IDs and spell IDs. Used for enchant identification and lookup.

**Key Functions**:
- `findEnchantIndexByEffectId(slot, effectId)` - Find enchant by effect ID

**Exports**:
- Effect ID mappings
- Spell ID mappings
- Lookup functions

---

### armory.js

**Purpose**: Handles armory import functionality. Fetches character data from Turtle WoW armory API.

**Key Features**:
- Character data fetching
- Gear import
- Talent import
- Error handling

**Key Functions**:
- `importFromArmoryAPI(server, character)` - Import character from armory
- `parseArmoryData(data)` - Parse armory response

**Exports**:
- `importFromArmoryAPI(server, character)`

---

### buildManager.js

**Purpose**: Manages build import/export. Handles URL encoding and build data serialization.

**Key Features**:
- Build export to URL
- Build import from URL
- Build data serialization
- Build storage integration

**Key Functions**:
- `exportBuildToURL()` - Export current build to URL
- `importBuildFromURL()` - Import build from URL parameters

**Build Data Structure**:
- Class, race, level
- Equipped items (by slot)
- Enchants (by slot)
- Talents
- Active buffs

**Exports**:
- Build import/export functions

---

## Main Application

### app.js

**Purpose**: Main application entry point. Orchestrates all modules, handles UI events, and manages application state.

**Key Responsibilities**:
- DOM element management
- Event listener setup
- Module initialization
- UI updates
- Calculation orchestration
- Build import/export
- Armory integration

**Key Functions**:
- `init()` - Application initialization
- `updateAllCalculations()` - Trigger all stat calculations
- `calculateEHPWithSwap(newItem, oldItem, ...)` - Calculate EHP with item swap (for gear compare)
- `handleClassChange()` - Handle class selection change
- `handleRaceChange()` - Handle race selection change
- `runSimulation()` - Run tank simulation
- `displaySimulationResults(results)` - Display simulation results
- `exportBuildToURL()` - Export build
- `importFromArmoryAPI()` - Import from armory

**Initialization Flow**:
1. Cache DOM elements
2. Initialize UI (class icons, race icons, talents, buffs)
3. Setup event listeners
4. Initialize modules (gear compare, tank simulator)
5. Preload critical data
6. Hide loading screen
7. Run initial calculations

**Event Handling**:
- Class/race selection
- Item equipping/unequipping
- Enchant application
- Talent point allocation
- Buff toggling
- Simulation running
- Build import/export

**Module Integration**:
- Imports all core modules
- Sets up callbacks between modules
- Coordinates module interactions
- Manages shared state

**Exports**:
- None (main application file, not a module)

---

## Data Flow

### Calculation Flow

1. User changes gear/talents/buffs
2. `updateAllCalculations()` called
3. `getGearStats()` aggregates gear stats
4. `getEnchantStats()` aggregates enchant stats
5. `getTalentBonuses()` calculates talent bonuses
6. `getActiveBuffs()` gets active buffs
7. `getSetBonuses()` calculates set bonuses
8. `calculateEffectiveHealth()` performs all calculations
9. `displayMainResults()` updates UI

### Simulation Flow

1. User selects boss and configures simulation
2. `runSimulation()` called
3. Character data gathered (gear, talents, buffs, etc.)
4. `runTankSimulation()` runs simulation iterations
5. `calculateDeathMetrics()` runs death simulation
6. `calculateStatWeights()` calculates stat weights
7. Results displayed in UI

### Gear Compare Flow

1. User selects items to compare
2. `updateStatDifferences()` called
3. `calculateEHPWithSwap()` calculates stats for both items
4. `calculateTankScore()` calculates Tank Score difference
5. `calculateAbsoluteTankScore()` calculates absolute Tank Scores
6. `runQuickSim()` runs simulation for accurate weights (if needed)
7. Results displayed in comparison UI

---

## Configuration

### Ports
- Main server: 6100
- Armory proxy: 8001

### Directories
- Builds: `builds/`
- Item data: `data/items/`
- Icons: `assets/icons/`

### Build IDs
- Format: 6 alphanumeric characters
- Stored as: `{buildId}.json`

---

## Dependencies

### Python
- `requests` - HTTP requests
- `BeautifulSoup4` - HTML parsing
- Standard library: `http.server`, `socketserver`, `json`, `pathlib`, etc.

### JavaScript
- `jsdom` - DOM manipulation (for testing/server-side)
- Native ES6 modules
- No external frameworks (vanilla JavaScript)

---

## Notes

- All calculations assume level 60 characters vs level 63 bosses (default)
- Stat formulas based on WoW Classic mechanics
- Armor DR formula: `armor / (armor + 400 + 85 * level)`
- Avoidance cap for crit/crush immunity: 100% (dodge + parry + miss)
- Defense gives 0.04% to dodge, parry, miss, and block each (0.12% total avoidance + 0.04% block)
- 1 stamina = 10 health (base, modified by bonuses)





