# gearPlannerView.js

Renders the Gear Planner page: locations-needed sidebar, class drawer, two-column expandable slot cards, save/load/share, and Shaman quick sim.

## Locations sidebar

- `#gp-locations-sidebar` is **outside** `#ichacalc-scaled-root`: `position: fixed; left: 0; top: 60px` (below the unscaled nav), docked to the **screen** left. Hidden unless `body[data-app-mode="gearPlanner"]`.
- `#gp-stats-sidebar` mirrors it on the **far right**. Each listed stat is **total** (GP class/race/talents/**buffs** + primary items + **slot enchants** via `calculateEffectiveHealth`) then **(gear bonus)** vs the same payload with no gear. Example: `120 (+53)`. Damage reduction fields are 0–1 fractions shown as percent (`11.00%`). Rows with non-zero gear bonus or totals that differ from ungared/unbuffed baseline. Empty plan: “No modified stats yet”.
- Gear Planner class/race/talents/**buffs** are **independent** of the Character Planner. **Talents**, **Buffs**, and **Stat weights** are full views (not modals): they hide slot columns. Locations Needed and Modified stats stay docked. Opening talents/buffs snapshots Character Planner trees/buffs (moves `#buffs-list` + consume presets into GP) and restores on close. Buff icon clicks are handled on `#gp-buffs-view` (Character Planner’s `#buffs-card` listener does not see parked icons). Preset hamburger + Clear all sit on the right. The talent tree scales with `transform` to fit `#gp-talents-host` (no fixed zoom). The active view’s header button morphs into the Gear Planner (armor) icon to return to slots — no Done button.
- **Stat weights** (`#gp-stat-weights-btn`): hidden unless the plan class is a tank (`warrior`/`paladin`/`druid`) or `shaman`. Tank uses `runTankSimulation` (same EHP/mit weights as Character Planner). Shaman uses `runGearPlanStatWeightSimulations` (same `runStatWeightSimulations` formulas). Context is the plan only: class, race, talents, buffs, primary items, enchants. Results persist in `ichacalc_gp_tankStatWeights` / `ichacalc_gp_statWeights[_aoe]`. GP item tooltips and the item picker use these weights instead of Character Planner weights.
- `#gear-planner-shell` is viewport-centered (`margin: 0 auto`); the locations/stats docks overlay the edges and do **not** pad the shell by sidebar width.
- Nested item names use quality classes (`span.q0`–`q5`) from `getItemById`.
- Built from the current plan’s **primary and alternative** item IDs via `getPreferredSourcesForItem` (`itemSources.js`). Unique dungeon/raid/worldboss instances (not Collections when an instance source exists). Nested indented item names under each location; click opens octowow DB. Hovering a location adds `.gp-location-hovering` on `#gear-planner-shell`, `.gp-row--location-hl` on matching primary/alt rows, and `.gp-item-name--location-hl` on the inner `.gp-item-name-text` span only (not the card).
- Dungeons follow the same high-level-first order as the item-modal instance filter (`getInstanceFilterGroups`). Other groups are alphabetical.
- Save: always opens `#gp-save-overwrite-dialog` with **role** dropdown (DPS / Tank / Healer), **spec**, optional **description** (max 180), and **inline icon grid** (not a separate popup). Existing plans: Overwrite only if current Discord user is `authorId`; otherwise Save as New. Warns (confirm) if missing talents / buffs / role-appropriate stat weights. Cloud saves publish to community; local guest saves do not.
- **Community browser:** cards show icon, description, talent spread, role labels (DPS/Tank/Healer), votes, and **Favorite** (copies into My Gear Plans; idempotent via `sourceCommunityId`). Header shows upvote/downvote when a community plan is open.
- **Stat weights:** Tank SW for warrior/paladin/druid and shaman-with-Tank (live boss search via `/bosses/search` + scrape). Shaman DPS: generate. Non-shaman DPS: manual weight fields. Item cards show ~DPS / EHP scores when weights exist.
- Header: main icon buttons centered; **Sim** group (settings + Quick DPS) right-aligned.
- Larger type in `gear-planner.css` (~1rem instance names, gold headings); independent scroll if the list is long.

## Integration (app.js)

- Direct URL `/gear-planner` (alias `/gp`) calls `setAppMode('gearPlanner')`. Character planner stays `/`. Share copies `origin/gear-planner?gp=<id>` (`?b=` character builds are unchanged).
- `initGearPlannerView({ setAppMode, getItemById, openItemModalForGearPlan, openEnchantModalForGearPlan, exportGearPlanToURL })`
- **Shared / loaded plans:** `setGearPlan`, session restore, and My Gear Plans load call `ensureGearPlanItemsReady` (awaits `ensureItemSourcesLoaded` + `itemLoader.loadSlot` for every occupied slot, plus `mainhand` when offhand has items) before `renderGearPlanner`. Guests on `/gear-planner?gp=` see real names/icons/quality, Locations Needed, and Modified stats without entering edit mode. `importGearPlanFromURL` awaits the promise returned by `setGearPlan`.
- Item picks from modal call `handleGearPlanItemSelected(item)` when `data-gear-plan-pick` is set on modal.
- Enchant picks call `handleGearPlanEnchantSelected(slotId, index)` when `#enchant-modal` has `data-gear-plan-enchant`. Filtering uses the plan primary (`itemOverride`), not Character Planner gear.

## UI elements (index.html)

- `#gear-planner-shell`, `#gp-locations-sidebar`, `#gp-class-sidebar`, `#gp-slots-left`, `#gp-slots-right`
- Header: `#gp-plan-name` (left, slick fade borders); icon buttons Save / **Edit mode** / **My Gear Plans** dropdown (`#gear-plans-dropdown`, same classes as My Builds: share/delete/favorite) / **Community search** (`#gp-community-search-btn`) / Share
- `#gp-quick-sim-btn`: Shaman-only header icon (sword SVG, `.gp-btn-icon`, same size as other GP header icons). Result text in `#gp-quick-sim-result`. `#gp-sim-settings-btn`: shaman-only cog that opens `#dps-sim-config-modal` via `openDpsSimConfigModal()` (same fight settings as Character Planner DPS). `#gp-st-rotation-row`: Enhance ST / Elemental ST only; stored as `plan.ui.stRotation`. `#gp-quick-sim-wrap`: dismissible info banner only. Dismiss X stores `ichacalc_gp_sim_hint_dismissed` in localStorage
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
