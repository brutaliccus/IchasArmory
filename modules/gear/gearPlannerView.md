# gearPlannerView.js

Renders the Gear Planner page: locations-needed sidebar, class drawer, two-column expandable slot cards, save/load/share, and Shaman quick sim.

## Locations sidebar

- `#gp-locations-sidebar` is **outside** `#ichacalc-scaled-root`: `position: fixed; left: 0; top: 60px` (below the unscaled nav), docked to the **screen** left. Hidden unless `body[data-app-mode="gearPlanner"]`.
- `#gp-stats-sidebar` mirrors it on the **far right**. Each listed stat is **total** (GP class/race/talents/**buffs** + primary items + **slot enchants** via `calculateEffectiveHealth`) then **(gear bonus)** vs the same payload with no gear. Example: `120 (+53)`. Damage reduction fields are 0–1 fractions shown as percent (`11.00%`). Rows with non-zero gear bonus or totals that differ from ungared/unbuffed baseline. Empty plan: “No modified stats yet”.
- Gear Planner class/race/talents/**buffs** are **independent** of the Character Planner. **Talents**, **Buffs**, and **Stat weights** are full views (not modals): they hide slot columns. Locations Needed and Modified stats stay docked. Opening talents/buffs snapshots Character Planner trees/buffs (moves `#buffs-list` + consumable presets into GP buffs view only) and restores on close. Buff icon clicks are handled on `#gp-buffs-view` (Character Planner’s `#buffs-card` listener does not see parked icons). **Talent presets** (shaman hamburger in `#gp-talent-preset-tools`) live on the talents view; **`#gp-talents-title`** shows the class name; trees are **top-aligned** in `#gp-talents-host`; consumable preset hamburger + Clear all stay on the buffs view. The talent tree scales with `transform` to fit `#gp-talents-host` (no fixed zoom). The active view’s header button morphs into the Gear Planner (armor) icon to return to slots — no Done button.
- **Stat weights** (`#gp-stat-weights-btn`): hidden unless the plan class supports tank and/or DPS weights. **Dual-role classes** (`warrior`, `paladin`, `druid`, `shaman`) show **both** tank and DPS panels side by side; single-role plans keep one panel (tank-only or DPS-only). Tank uses `runTankSimulation` (same EHP/mit weights as Character Planner). Shaman DPS uses `runGearPlanStatWeightSimulations`; other dual-role DPS uses manual weight fields. Context is the plan only: class, race, talents, buffs, primary items, enchants. Results persist in `ichacalc_gp_tankStatWeights` / `ichacalc_gp_statWeights[_aoe]`. GP item tooltips and the item picker use these weights instead of Character Planner weights.
- **Overlay views** (talents, buffs, stat weights) stay inside `.gp-main` at a **fixed center width** (`--gp-center-width`: ~70vw, capped by space between the fixed location/stats docks). Switching menus does not resize the shell; talent trees scale to fit `#gp-talents-host` within that column (no full-viewport stretch).
- `#gear-planner-shell` is full-width block layout with `.gp-main` centered via auto margins. The locations/stats docks overlay the screen edges and do **not** pad the shell by sidebar width.
- Nested item names use quality classes (`span.q0`–`q5`) from `getItemById`.
- Built from the current plan’s **primary and alternative** item IDs via `getPreferredSourcesForItem` (`itemSources.js`). Unique dungeon/raid/worldboss instances (not Collections when an instance source exists). Nested indented item names under each location; click opens octowow DB. Hovering a location adds `.gp-location-hovering` on `#gear-planner-shell`, `.gp-row--location-hl` on matching primary/alt rows, and `.gp-item-name--location-hl` on the inner `.gp-item-name-text` span only (not the card).
- Dungeons follow the same high-level-first order as the item-modal instance filter (`getInstanceFilterGroups`). Other groups are alphabetical.
- Save: always opens `#gp-save-overwrite-dialog` … **`flushGpOverlayStateToPlan()`** runs before populate/save so open talents/buffs views sync into `currentPlan`; overwrite preserves existing **description** when the dialog field is empty. Cloud saves publish to community; local guest saves do not.
- **Community browser:** cards show icon, description, talent spread, role labels (DPS/Tank/Healer), filled thumbs-up/down SVG vote icons (18px, green/red when active) with counts, and **Favorite** (copies into My Gear Plans; idempotent via `sourceCommunityId`). Header votes sit immediately after `#gp-plan-name` in `.gp-plan-title-row` when a community plan is open; vote swap is one-click (server applies new direction; UI syncs `myVote` before header refresh).
- **Stat weights:** Dual-role plans show **Tank** and **Single Target (DPS)** panels side by side (`gp-dual-weights`), centered as a pair in `.gp-stat-weights-view`; single panels stay centered too. Shaman AoE panel is hidden in dual layout. **Non-shaman** DPS weights use manual fields with placeholder **"-"** until the user enters values (not 0). GP stat weight tables include `.sort-indicator` spans for sort UI. Generate re-queries live DOM after `renderGearPlanner()` so progress/button updates do not throw on detached nodes.
- **Class/race sidebar:** `#gp-class-sidebar` lives inside `.gp-main` (`position: absolute; top: 0; left: 0; transform: translateX(calc(-100% - 8px))`) so it anchors to the top-left edge of the centered main column, not over `#gp-locations`.
- **Item scores:** `~DPS` / EHP badges right-align on right-column cards via `.gp-slot-card--right .gp-item-scores { justify-content: flex-end }`.
- Header: main icon buttons centered; **Sim** group (label + settings + Quick DPS) right-aligned, **hidden entirely** for non-shaman plans (`#gp-header-sim` hidden + `display:none`).
- Larger type in `gear-planner.css` (~1rem instance names, gold headings); independent scroll if the list is long.

## Integration (app.js)

- Direct URL `/gear-planner` (alias `/gp`) calls `setAppMode('gearPlanner')`. Character planner stays `/`. Share copies `origin/gear-planner?gp=<id>` (`?b=` character builds are unchanged).
- `initGearPlannerView({ setAppMode, getItemById, openItemModalForGearPlan, openEnchantModalForGearPlan, exportGearPlanToURL })`
- **Shared / loaded plans:** `setGearPlan`, session restore, and My Gear Plans load call `ensureGearPlanItemsReady` (awaits `ensureItemSourcesLoaded` + `itemLoader.loadSlot` for every occupied slot, plus `mainhand` when offhand has items) before `renderGearPlanner`. Guests on `/gear-planner?gp=` see real names/icons/quality, Locations Needed, and Modified stats without entering edit mode. `importGearPlanFromURL` awaits the promise returned by `setGearPlan`.
- Item picks from modal call `handleGearPlanItemSelected(item)` when `data-gear-plan-pick` is set on modal.
- Enchant picks call `handleGearPlanEnchantSelected(slotId, index)` when `#enchant-modal` has `data-gear-plan-enchant`. Filtering uses the plan primary (`itemOverride`), not Character Planner gear.

## UI elements (index.html)

- `#gear-planner-shell`, `#gp-locations-sidebar`, `#gp-class-sidebar`, `#gp-slots-left`, `#gp-slots-right`
- Header: `#gp-plan-name` in `.gp-plan-name-wrap` (hidden `.gp-plan-name-sizer` mirror + input; width tracks text up to **64** chars, not a fixed wide box) + `#gp-header-votes` in `.gp-plan-title-row` (votes `flex-shrink: 0` at end); icon buttons Save / **Edit mode** / **My Gear Plans** dropdown (`#gear-plans-dropdown`, same classes as My Builds: share/delete/favorite) / **Community search** (`#gp-community-search-btn`) / Share
- Talents view: `#gp-talent-preset-tools` hamburger (shaman only) applies `SHAMAN_TALENT_PRESETS`; **`#gp-talents-title`** shows the plan class name (e.g. “Shaman”); talent tree is **top-aligned** in `#gp-talents-host` (scale transform from top center).
- `#gp-quick-sim-btn`: Shaman-only header icon … `#gp-sim-settings-btn`: shaman-only cog wired via **direct click listener** on the button (`openGpSimConfigModal()` → `prepareDpsSimConfigForGearPlanner()` + `openDpsSimConfigModal()`). Talents/buffs apply to `currentPlan` **on change** (`wireGpTalentSync`, `wireGpConsumeToolsSync`, buff icon clicks) — not only when leaving the overlay view.
- **Quick DPS sim running state:** `runQuickSim()` sets `gpQuickSimRunning`, disables `#gp-quick-sim-btn` and `#gp-sim-settings-btn`, swaps the sword icon for `.loading-spinner-small`, and shows **Simming…** (with **%** from `runGearPlanQuickSim` progress) in `#gp-quick-sim-result`. UI helpers re-query live DOM nodes so `renderGearPlanner()` during a run does not orphan state. Restores icon/labels on success, error, or throw.
- `#gp-stat-weights-btn`: spinning-sword SVG (SVG Repo 499402), same `.gp-btn-icon` size as other header buttons. Quick DPS Sim keeps its own sword.
- Class drawer: `#gp-cr-drawer-class` uses `.is-open` (same as character `#cr-drawer-class`) so `#gp-class-drawer-toggle` expands `#gp-class-drawer-panel`

## Edit mode

- New unsaved plans start with edit **on**. Saved or loaded plans start with edit **off** (session `editMode` overrides when present). Saving a plan turns edit off.
- **View (off):** hide clear/remove X **and** empty `inventoryslot_*` add icons (`.gp-slot-add-wrap`); no picker or drag-reorder; cards still expand to show alts. Shell gets `.gp-view-mode`.
- **Edit (on):** X buttons, outside empty-slot add icons, icon drag-and-drop, item picker.

## Slot cards

Paperdoll order (same as `#gear-icons-left` / `#gear-icons-right`):

- Left: head, neck, shoulder, back, chest, wrist, mainhand, offhand
- Right: hands, waist, legs, feet, ring1, ring2, trinket1, trinket2, ranged

Each card:

- Collapsed by default (`plan.ui.collapsed[slotId] !== false`); session-persisted
- Icon on the **outer** edge; name + `Zone: Dungeon – Boss` source line
- Middle-click icon opens `https://octowow.st/db/?item=` (same as item modal)
- Enchantable slots (same as Character Planner `getEnchantableSlots`): `.gp-item-name-row` is a horizontal flex line with the quality-colored **item name** plus `.gp-enchant-chrome` (`.enchant-btn` + optional gold `.gp-enchant-name` using `getEnchantCompactLabel`). Left: `[name][scroll][enchant]`; right: `[enchant][scroll][name]`. Source line sits under the name only. Collapse chevron (`.gp-toggle-alts`) is last in the primary row DOM so it sits at the **end of the card line** (far right on left column; far left on right column via `row-reverse`). Click opens the existing enchant picker with the plan primary as `itemOverride`. Stored as `slots[slot].enchant` (database index). Included in Modified stats and Shaman quick sim (snapshot/restore Character Planner enchants).
- Click card or chevron to expand alternatives (icon, name, source; remove/add only in edit mode)
- Right-column cards reverse the **primary/alt rows** so the icon stays on the outer edge; `.gp-alts-panel` stays a column so **Add alternative** is full-width under the alt list (not beside the primary X)
- Item tooltips (`#item-tooltip` via `createItemTooltipHTML` / `positionItemTooltipOnIcon`) fire **only on the item icon** (`.gp-item-tip` on `.gp-slot-icon-frame` / `.gp-alt-icon`). Left-column cards grow left+down from the icon’s top-left; right-column cards grow right+down from top-right. They do not follow the cursor.
- Drag-and-drop from the icon only when edit mode is on (`cursor: grab`): alt → primary swaps that alt into primary (old primary becomes that alt); primary → alt swaps; alt → alt reorders. Persists through `saveGearPlannerSession` on re-render. Card click-to-expand is ignored after a drag.
