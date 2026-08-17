# IchaCalc Documentation Index

## Overview

This document provides an index of all documentation files created for the IchaCalc project. Each markdown file contains comprehensive documentation for its corresponding source file, including architecture diagrams, function references, data structures, usage examples, and guides for making modifications.

**Documentation Created:** January 2026
**Total Files Documented:** 15+ major files
**Total Documentation:** ~20,000+ lines

---

## Core Application Files

### 1. app.js - Main Application Orchestrator
**File:** `app.md`
**Source:** `app.js` (3,888 LOC)

**Contents:**
- Application initialization and setup
- Build management (save/load character builds)
- Modal management (item/enchant selection)
- UI generation (class selector, race selector, gear slots)
- Event handlers (class change, talent clicks, buff toggles)
- Stat calculation coordination
- Tank and DPS simulation UI integration
- Armory import system
- Profile management integration

**Key Features:**
- 22 module imports orchestration
- Window export management for cross-module communication
- State management for gear/talents/buffs
- Drag-and-drop interface coordination

---

### 1b. onboarding.js - Onboarding overlay
**File:** `onboarding.md`  
**Source:** `onboarding.js`

**Contents:** Skip rules (share URL, Discord default load), saved-build picker when logged in with saves but no default, welcome/import/class/race/shaman preset flow, auto-save default.

---

### 2. profiles.js - Character Profile Management
**File:** `profiles.md`
**Source:** `profiles.js` (1,299 LOC)

**Contents:**
- Discord OAuth authentication
- Cloud profile storage via server backend
- Build sharing between users
- Inbox messaging system for shared builds
- Profile CRUD operations (create, read, update, delete)
- Build format compatibility (v1 and v2)
- UI components (dropdowns, modals, loading states)

**Key Features:**
- Session-based authentication
- Profile versioning and migration
- Inbox notifications
- Edit mode state tracking

---

### 3. server.py - Main HTTP Server
**File:** `server.md`
**Source:** `server.py` (1,307 LOC)

**Contents:**
- HTTP server orchestration (Flask-based)
- Build management endpoints (save/load with random IDs)
- Boss search via HTML scraping
- Boss stat scraping from octowow.st/db
- API proxying to backend services
- Process management and cleanup
- Static file serving

**API Endpoints:**
- `/builds/save` - Save build with random ID
- `/builds/load/<build_id>` - Load build by ID
- `/bosses/search` - Search for bosses/NPCs
- `/bosses/scrape` - Scrape boss stats from external DB
- `/api/*` - Proxy to armory and other services

---

## Gear & Equipment System

### Gear Planner (v1)
**Files:** `modules/gear/gearPlanner.js`, `modules/gear/gearPlannerView.js`, `modules/gear/itemSources.js`, `modules/gear/itemLoader.js`, `gear-planner.css`

- BiS gear plans per class (items only, no enchants)
- Loot source filter in item modal (dungeons, raids, world bosses, other)
- Session persistence via `ichacalc_gear_planner_session_v1`
- Cloud saves: `user.gearPlans[]`, share URL `?gp=id`, Discord inbox `kind: gearPlan`
- Community browser: authenticated cloud saves publish to `data/community-gear-plans/`; `GET /community-gear-plans` (+ `/:id`); GP header search modal (class/role/spec filters). Save requires role + talent-tree `spec` + icon (`data/wow-icons.json`).
- **Armory import (Chronicle):** GP Plans header **Import** button + shared `modules/armory/armoryImport.js` pipeline; loads primaries, enchants, and **talents** on `currentPlan`. Character Planner uses the same fetch/apply module via `armory.js`.
- Data: `data/loot/` from `npm run import:loot` (TurtleAtlasLootWeb)

### 4. modules/gear/gearCompare.js - Gear Comparison & Tank Score
**File:** `modules/gear/gearCompare.md`
**Source:** `modules/gear/gearCompare.js` (1,229 LOC)

**Contents:**
- Side-by-side item comparison UI
- Stat difference calculations (green/red deltas)
- Enchant selection for comparison
- Boss selection and search
- Tank simulation for both items
- Tank Score calculation (weighted metric based on stat weights)
- Stat weights display
- Radial menu integration

**Key Features:**
- Temporary item swapping for calculations
- Boss database integration
- EHP and mitigation score calculations
- Visual stat delta display

---

### 5. modules/gear/enchants.js - Enchant Database
**File:** `modules/gear/enchants.md` (title-audit notes + pointer to `enchantStatLabels.md`)
**Source:** `modules/gear/enchants.js` (2,886 LOC)
**Script:** `scripts/audit-enchant-titles.mjs` — lists enchants with modeled stats but no numeric summary in parentheses in `name`

**Contents:**
- Comprehensive enchant database (200+ enchants)
- Organized by equipment slot (13 slots)
- Stat bonuses, descriptions, effect IDs
- Special enchants (Shaman-only, Engineering-only)
- Smart filtering by item type

**Enchant Categories:**
- Weapon enchants (+damage, +skill, procs)
- Armor enchants (+stats, +resistances)
- Scope enchants (ranged weapons)
- Leg/head armor kits
- Shoulder enchants (Zandalar, Naxxramas)

---

### 5a. modules/gear/enchantStatLabels.js - Enchant label formatting
**File:** `modules/gear/enchantStatLabels.md`
**Source:** `modules/gear/enchantStatLabels.js`

**Contents:**
- Shared stat name map and `formatEnchantStatsHTML()` for enchant tooltips (`tooltips.js`)
- `getEnchantCompactLabel()` for the main gear strip (`gear.js` → `updateEnchantDisplay`)
- Modal picker still uses full `enchant.name` (`modal.js`)

---

### 5b. modules/gear/enchantEffectIds.js - Armory effect ID map
**File:** `modules/gear/enchantEffectIds.md`
**Source:** `modules/gear/enchantEffectIds.js`

**Contents:** Manual effect_id → name map for `findEnchantIndexByEffectId`; Chronicle alias `464→930` in `armoryImport.js`; Rockbiter `3026` skipped on import.

---

### 5c. modules/armory/ - Armory import
**Files:** `modules/armory/armory.js`, `modules/armory/armoryImport.js`, `armory_proxy.py`
**Docs:** `modules/armory/armory.md`, `modules/armory/armoryImport.md`

**Contents:** Chronicle Octo API proxy (default), Turtle rollback (`ARMORY_UPSTREAM=turtle`), shared client fetch/apply for Character Planner and Gear Planner.

---

### 6. modules/gear/setDatabase.js + setBonuses.js - Set Bonus Registry
**Files:** `modules/gear/setDatabase.md`, `modules/gear/setBonuses.md`  
**Sources:** `setDatabase.js`, `setBonuses.js`, `setDatabaseSheetStats.generated.js`

**Contents:**
- Item ID → set mapping and bonus tier definitions
- `modeledInSim` for tooltip ★ markers (`tooltips.js`)
- `sheetStats` for pure stat bonuses (all classes; generated file)
- `getSetBonuses()` used by `app.js`, `calculator.js`, combat sim

**Regenerate sheet stats:** `npm run generate:set-sheet-stats`

---

### 6b. modules/gear/procs.js - Proc Effect Definitions
**File:** `modules/gear/procs.md` (existing comprehensive documentation)
**Source:** `modules/gear/procs.js` (1,591 LOC)

**Contents:**
- Proc definition database (~32 procs)
- Multiple proc types (onUse, chanceOnHit, PPM, etc.)
- Stat modification system with talent multipliers
- ICD and duration tracking
- Talent-based procs (Redoubt, Holy Shield, Elemental Devastation)
- Data-driven effect system (v1.4.0+)
- Integration with simulation engines

**Proc Categories:**
- Trinket procs (on-use and chance-on-hit)
- Enchant procs (Crusader, PPM-based)
- Set bonuses (T2.5 Rushing Charges, etc.)
- Talent procs (dynamic based on talent rank)
- Weapon imbues (Flametongue, Windfury)

---

## Character System

### 7. modules/character/buffs.js - Buff System
**File:** `modules/character/buffs.md` (existing documentation)
**Source:** `modules/character/buffs.js` (1,609 LOC)

**Contents:**
- Buff generation and UI rendering
- Buff categories (raid buffs, consumables, world buffs)
- Stat bonuses and effects
- Buff exclusivity rules (Battle Shout vs Blessing of Might)
- Improved buff detection (talent-based upgrades)
- Class-specific buffs
- Buff icon management

**Key Features:**
- Dynamic buff generation based on class/talents
- Exclusivity groups prevent buff conflicts
- Improved talent detection (e.g., Improved Mark of the Wild)

---

### 8. modules/talents_new.js - Talent System
**File:** `modules/talents_new.md`
**Source:** `modules/talents_new.js` (1,705 LOC)

**Contents:**
- Grid-based talent tree rendering (4×7 grid matching WoW Classic)
- Talent point allocation system
- Tier requirements (5 points per tier)
- Prerequisite validation
- Talent connection arrows (SVG rendering)
- Rank-specific tooltips with variable placeholders
- Multi-class support (all 9 classes)
- Stat bonus mapping (comprehensive talent → stat mappings)

**Key Features:**
- Visual talent tree with arrows
- Drag-to-allocate or click-to-add points
- Real-time validation
- 51-point maximum enforcement

---

## Simulation Engines

### 9. modules/tank/tankSimulator.js - Tank Simulation Engine
**File:** `modules/tank/tankSimulator.md`
**Source:** `modules/tank/tankSimulator.js` (1,847 LOC)

**Contents:**
- Boss database with attack patterns
- Combat simulation (10,000 hits default)
- Attack table mechanics (miss, dodge, parry, block, hit, crit, crush)
- Parry haste implementation
- Proc system integration
- Stat weight calculation (EHP-based methodology)
- Death scenario analysis (Gibbability Rating)
- Result averaging and statistical analysis

**Key Features:**
- Complete attack table resolution
- Proc uptime tracking
- Dynamic stat weight calculation (6 stat types)
- Boss database with 20+ raid bosses

---

### 10. modules/shaman/combatSim.js - Combat Simulation Engine
**File:** `modules/shaman/combatSim.md`
**Source:** `modules/shaman/combatSim.js` (1,351 LOC)

**Contents:**
- Event-driven simulation system (priority queue)
- Rotation execution (priority-based ability selection)
- Ability casting with hit/crit/resist rolls
- Auto-attack system with imbues
- Lightning Strike (dual physical/nature damage)
- DOT system (Flame Shock tracking)
- Totem management (Searing, Fire Nova)
- Lightning Shield charge tracking
- Resource management (mana, GCD, cooldowns)
- Proc engine integration
- Threat calculation
- Timeline tracking (damage, threat, buffs, procs)
- Web Worker pool for parallel execution

**Key Features:**
- FastRNG system (seeded PRNG for deterministic sims)
- Multi-iteration support with statistical analysis
- Complete combat log with event tracking

---

### 11. modules/shaman/dps.js - DPS Optimization Engine
**File:** `modules/shaman/dps.md`
**Source:** `modules/shaman/dps.js` (6,453 LOC - **largest file**)

**Contents:**
- Character state aggregation (converts totals/talents/buffs to ShamanStats)
- Ability damage calculations (analytical DPS for all spells)
- Combat simulation integration
- Stat weight generation (SimC-style +delta simulations)
- Interactive UI (multi-tab: Abilities, Combat Sim, Stat Weights)
- Rotation optimizer (configurable priority system)
- Analytical & simulation modes (fast math + detailed combat sims)
- Proc tracking and timeline visualization
- Threat tracking (TPS analysis)

**Key Features:**
- Hybrid stat weight approach (analytical for simple stats, simulation for complex stats)
- Build-based caching (stat weights cached per build hash)
- Rotation priority configuration (drag-and-drop UI)
- Complete timeline visualization (damage, threat, procs, buffs)

### 11b. modules/shaman/dpsBossPortraits.js - DPS boss picker portraits
**File:** `modules/shaman/dpsBossPortraits.md`  
**Source:** `modules/shaman/dpsBossPortraits.js`

**Contents:** NPC id → image URL map for the sim sidebar raid boss grid; placeholder when unset.

### 11b2. modules/shaman/shamanConsumePresets.js — Shaman buff/consumable tiers
**File:** `modules/shaman/shamanConsumePresets.md`  
**Source:** `modules/shaman/shamanConsumePresets.js`

### 11b2a. modules/shaman/shamanTalentPresets.js — Shaman talent preset allocations
**File:** `modules/shaman/shamanTalentPresets.md`  
**Source:** `modules/shaman/shamanTalentPresets.js`  
**Contents:** `SHAMAN_TALENT_PRESET_NAMES`, `SHAMAN_TALENT_PRESETS` — shared by onboarding, `app.js` `applyTalentPreset`, and Gear Planner talents hamburger.

**Contents:** `getShamanConsumeBuffs(spec, tier)`, `SHAMAN_CONSUME_GRID_COLUMNS`, `SHAMAN_PRESET_SPEC_ICONS` (same URLs as DPS priority preset radial), `SHAMAN_CONSUME_TIERS` (tier coin icon URLs), `SHAMAN_CONSUME_SPEC_ORDER`; data in **`modules/shaman/data/onboardingConsumePresets.json`** (regenerate: `node scripts/extract-onboarding-consume-presets.mjs`). Used by onboarding consume step and Buffs tab preset grid (`app.js`); **`dps.js`** imports **`SHAMAN_PRESET_SPEC_ICONS`** for the radial menu.

### 11c. modules/shaman/data/dpsRaidBossStats.json — preloaded DPS raid bosses
**File:** `modules/shaman/data/dpsRaidBossStats.md`  
**Source:** `modules/shaman/data/dpsRaidBossStats.json` (regenerate: `npm run gen:dps-boss-stats` → `scripts/export-dps-raid-boss-stats.py`; placeholders: `npm run gen:dps-boss-stats:defaults`; ZAM journal **`iconUrl`**: `npm run gen:dps-boss-icons:zam` → `scripts/apply-zam-ej-icons-to-dps-boss-json.py`). Optional curated **`faction`** tags: `scripts/dps-boss-faction-overrides.json` (merged by the export script).

**Contents:** Per-npcId armor, resists, level, attack speed, optional **`iconUrl`**, per-school **`immune_*`** flags for DPS sim raid tiles; `/bosses/scrape` fallback only for ids missing from JSON.

### 11d. modules/shaman/targetSchoolImmunity.js — target school immunity helpers
**File:** `modules/shaman/targetSchoolImmunity.md`  
**Source:** `modules/shaman/targetSchoolImmunity.js`

**Contents:** `isTargetSchoolImmune`, payload merge from boss JSON / in-memory DPS session boss; used by `damageCalc`, `combatSim`, `damageSystem`.

### 11e. modules/character/stats.js — Stat template & tooltip parsing
**File:** `modules/character/stats.md`  
**Source:** `modules/character/stats.js`

**Contents:** `STAT_TEMPLATE`; `apVs*` / `dmgHealingVs*` keys and faction maps; tooltip parsers (including Mark of the Champion spell-vs-type lines); `getAttackPowerBonusVsCreatureType` / `getSpellDamageHealingBonusVsCreatureType`; display order helpers for Advanced Melee / spell rows in `app.js`.

---

## UI System

### 12. modules/ui/calculator.js - Stat Calculation Engine
**File:** `modules/ui/calculator.md`
**Source:** `modules/ui/calculator.js` (746 LOC)

**Contents:**
- Stat aggregation from all sources (gear, buffs, talents, racials)
- Percentage multiplier application (Blessing of Kings, talents)
- Derived stat calculations (HP, armor, mana, AP)
- Combat stats (crit, hit, weapon skill, avoidance)
- Damage reduction calculations (armor DR, defense DR)
- EHP (Effective Health Points) calculations
- Resistance and magic EHP calculations
- Offensive stat calculations (spell damage, penetration)
- 47+ calculated properties returned

**Key Calculations:**
- Armor damage reduction formula
- Defense-based avoidance/crit immunity
- Weapon skill hit/crit/glancing adjustments
- Block value calculations
- Attack power from strength
- Spell crit from intellect

---

### 13. modules/ui/modal.js - Item Selection UI
**File:** `modules/ui/modal.md`
**Source:** `modules/ui/modal.js` (932 LOC)

**Contents:**
- Item selection modal system
- Enchant selection modal system
- Filtering and search functionality (multi-criteria)
- Quality/tier filters (Poor to Legendary)
- Stat-based search (multi-stat AND logic)
- Item rendering with tooltips
- Modal state management
- Advanced tooltip positioning

**Key Features:**
- Unified filtering system
- Stat preview in item lists
- Automatic sorting by stat values
- Slot-specific filtering (mainhand/offhand weapon rules)
- Sort by DPS toggle (when stat weights available)
- DPS score display in item rows

---

### 13a. modules/ui/itemTooltipPosition.js - Item tooltip icon placement
**File:** `modules/ui/itemTooltipPosition.md`  
**Source:** `modules/ui/itemTooltipPosition.js`

**Contents:**
- `positionItemTooltipOnIcon()` — icon-rect placement for `#item-tooltip` (`position: fixed`): outer top corner, grow away from center and down, clamp / flip up

**Key features:**
- Does not follow the cursor
- Left vs right paperdoll / Gear Planner columns set grow direction; lists use the side that fits

---

### 13b. modules/ui/radialMenu.js - Radial slot / custom item wheel
**File:** `modules/ui/radialMenu.md`  
**Source:** `modules/ui/radialMenu.js`

**Contents:**
- **`openRadialMenu`** — Equipped gear slots (gear compare pattern)
- **`openCustomRadialMenu`** — Arbitrary `{ id, title, iconUrl }` wedges (same backdrop + **`radialItemFadeIn`** animation as gear)
- **`closeRadialMenu`**

**Consumers:** `gearCompare.js`, `dps.js` (Totemic priority presets, stat-weight compare slot picker)

---

### 13c. modules/ui/uiScale.js - Viewport UI scaling
**File:** `modules/ui/uiScale.md`  
**Source:** `modules/ui/uiScale.js`

**Contents:**
- Auto-fit scale for 2560×1440 baseline (width + height)
- Manual UI scale (70%–130%) via top-nav settings cog; persisted in `localStorage`
- `uiScaleChanged` event; `app.js` repositions item picker on scale change

---

### 14. modules/ui/tooltips.js - Tooltip Generation
**File:** `modules/ui/tooltips.md`
**Source:** `modules/ui/tooltips.js`

**Contents:**
- Item tooltip HTML generation (quality-colored, set bonuses, sim-star)
- Enchant tooltip HTML generation
- DPS score calculation from stat weights (`calculateItemDpsScore`)

**Key Features:**
- Merged tooltip lines for Equip/Use/Set descriptions
- Set bonus active/inactive highlighting
- DPS score appended to tooltips when stat weights exist

---

## Documentation Coverage Summary

| Category | Files Documented | Total LOC | Status |
|----------|------------------|-----------|--------|
| Core Application | 3 files | 6,494 LOC | ✅ Complete |
| Gear & Equipment | 3 files | 5,706 LOC | ✅ Complete |
| Character System | 2 files | 3,314 LOC | ✅ Complete |
| Simulation Engines | 3 files | 9,651 LOC | ✅ Complete |
| UI System | 3 files | ~2,200 LOC | ✅ Complete |
| **TOTAL** | **14 files** | **~27,400 LOC** | **✅ Complete** |

---

## Additional Documentation Files

### Existing Comprehensive Documentation

The following files already had comprehensive documentation before this project:

1. **Simulation Engine Modules** (`/modules/sim/` directory)
   - 21 markdown files covering the complete simulation system
   - Includes: eventSystem.md, damageSystem.md, buffSystem.md, procSystem.md, abilitySystem.md
   - Plus: combatStats.md, workerPool.md, engine.md, rotationSystem.md, and more

2. **General Documentation** (`/markdown/` directory)
   - DOCUMENTATION.md (835 lines) - Comprehensive overview
   - Deployment guides, integration docs, tool guides

---

## Documentation Standards

All documentation files follow a consistent structure:

### Standard Sections
1. **Overview** - File purpose, size, type, key features
2. **Architecture Overview** - Visual diagram of system components
3. **Major Sections** - Detailed breakdown with line number references
4. **Key Functions** - Function signatures, parameters, return values, examples
5. **Data Structures** - Object schemas with property descriptions
6. **How to Make Updates/Changes** - Step-by-step modification guides
7. **Performance Considerations** - Timing, optimization tips
8. **Common Patterns** - Code examples for common use cases
9. **Related Files** - Dependencies and integration points
10. **Known Issues / TODOs** - Current limitations and future improvements
11. **Testing Strategy** - Manual checklists and unit test recommendations

### Documentation Features
- **Line Number References** - Functions linked to source line numbers
- **Code Examples** - Practical usage examples throughout
- **Visual Diagrams** - ASCII/text architecture diagrams
- **Comprehensive Coverage** - All major functions and data structures documented
- **Modification Guides** - Step-by-step instructions for common changes

---

## How to Use This Documentation

### For New Developers
1. Start with `app.md` to understand overall application structure
2. Read `calculator.md` to understand stat calculation system
3. Read relevant simulation docs (`tankSimulator.md` or `combatSim.md` + `dps.md`)
4. Explore specific feature docs as needed (gear, talents, buffs, etc.)

### For Feature Development
1. Identify which file(s) contain the feature
2. Read the corresponding `.md` file(s)
3. Check "How to Make Updates/Changes" section
4. Follow code examples and modification guides
5. Test using "Testing Strategy" checklist

### For Debugging
1. Find the file with the bug using this index
2. Read "Architecture Overview" to understand system
3. Check "Key Functions" for implementation details
4. Use "Common Patterns" for correct usage
5. Consult "Known Issues" for existing limitations

### For Code Review
1. Use documentation to understand context
2. Verify changes follow documented patterns
3. Check if "Known Issues" need updating
4. Ensure new features are documented

---

## Documentation Maintenance

### When to Update Documentation
- **Adding new files** - Create corresponding `.md` file
- **Adding major features** - Update relevant `.md` file's sections
- **Fixing bugs** - Update "Known Issues" if applicable
- **Refactoring** - Update architecture diagrams and function references
- **API changes** - Update function signatures and examples

### Documentation File Naming
- Use same name as source file: `filename.js` → `filename.md`
- Place in same directory as source file
- For root-level files: place `.md` in root directory

### Keeping Documentation Synchronized
1. Update documentation when code changes
2. Keep line number references current (use ranges if specific lines change frequently)
3. Update architecture diagrams for structural changes
4. Add new sections as features are added
5. Mark deprecated features clearly

---

## Quick Reference

### Most Commonly Referenced Files
1. **app.md** - Application orchestration
2. **calculator.md** - Stat calculations
3. **tankSimulator.md** - Tank simulation mechanics
4. **dps.md** - Shaman DPS simulation
5. **talents_new.md** - Talent system

### Best Starting Points
- **Understanding codebase:** Start with `app.md`
- **Adding features:** Read relevant feature `.md` file
- **Debugging calculations:** Read `calculator.md`
- **Debugging simulations:** Read `tankSimulator.md` or `combatSim.md`
- **Adding gear/items:** Read `gear.md` and `enchants.md`

---

## Future Documentation Needs

### Files Not Yet Documented
- Individual class talent definition files (warrior.js, paladin.js, druid.js, etc.)
- Smaller utility files and helpers
- Test files and development tools
- Build configuration files

### Documentation Improvements Needed
1. Add more visual diagrams (flowcharts, sequence diagrams)
2. Create video walkthroughs for complex systems
3. Add interactive examples (JSFiddle/CodePen)
4. Create API reference generator from JSDoc comments
5. Build searchable documentation website

---

## Contributing to Documentation

### Guidelines
1. **Be comprehensive** - Cover all major aspects of the file
2. **Use examples** - Show code examples for all concepts
3. **Be practical** - Include "How to" guides for modifications
4. **Stay current** - Update docs when code changes
5. **Cross-reference** - Link to related documentation files

### Documentation Template
Use existing `.md` files as templates. Key sections to include:
- Overview (what, why, how big)
- Architecture (visual diagram)
- Major Sections (with line numbers)
- Key Functions (with examples)
- Data Structures (with schemas)
- How-To Guides (practical modifications)
- Testing Strategy (manual + unit tests)

---

## Contact & Support

Site shell includes a shared **Buy me a coffee** control (`.site-support-footer` in `index.html` / `style.css`): **fixed to the viewport bottom** on Character Planner and Gear Planner (always visible; subtle dark-gold styling). Link: https://www.buymeacoffee.com/jeb32411u

For questions about the documentation or codebase:
1. Check this index for relevant documentation file
2. Read the corresponding `.md` file thoroughly
3. Search for specific terms using file search (Ctrl+F)
4. Consult "Related Files" sections for additional context

---

**Last Updated:** August 2026
**Documentation Version:** 1.0
**Total Documentation Files:** 15+ major files
**Codebase Coverage:** 26,843+ LOC documented (core systems)
