# Gear Planner Mobile View — Implementation Plan

**Status:** Implemented (Phases 1–5). Detection and chrome live in `modules/ui/gpMobile.js`; styles in `gear-planner.css` (`body.gp-mobile`) plus scoped sheet rules in `style.css`, `shaman-dps.css`, `profiles.css`, and `topnav.css`.  
**Scope:** `/gear-planner` (and `/gp`) must be fully usable on phones and small tablets: gear slots, **Locations**, **Modified stats**, overlay views, and every modal that can open from this page.  
**Out of scope for v1:** a full Character Planner mobile redesign. Shared pickers (item, enchant, tooltips, profiles) still need mobile rules because Gear Planner opens them.

---

## 1. Why the current page fails on a phone

The Gear Planner is a **desktop three-pane app**, not a page that happens to lack a media query.

| Surface | Desktop behavior | What a ~390×844 phone actually gets |
|---|---|---|
| UI scale | Auto-fit to **1920×1200**, clamp **0.5–2.0** (`modules/ui/uiScale.js`) | `390/1920 ≈ 0.20` → clamped to **0.50**. The scaled root is zoomed to 50% of a 1920-wide layout, so chrome is still ~960 CSS-px wide inside a 390-px viewport. |
| Locations + Modified stats | Fixed **260px** docks, `zoom: 1`, `top: 60px`, `z-index: 1100` | **520px of unscaled side chrome** on a 390-px screen. Docks cover the gear. `--gp-center-width` becomes `min(70vw, 100vw − 520 − 32)` → **negative / unusable**. |
| Class / race | Absolutely parked **left of** `.gp-main` | Sits on top of Locations (or off-screen). Vertical class drawers are 56-px icons in a tall column. |
| Slot grid | Two paperdoll columns; right column is **row-reverse** | Cards become ~140px wide. Name + enchant + chevron + scores clip. |
| Header | 5-column grid (name, votes, Build, Plans, Sim) | Already stacks at `max-width: 900px`, but 9+ icon buttons + labels still fight for width. |
| Locations interaction | `mouseenter` / `mouseleave` highlight | **No tap equivalent.** Hover dimming never fires; users cannot “see what I need from MC.” |
| Item / enchant tooltips | Icon hover, grow off the paperdoll | Hover never comes. Tapping the icon either does nothing useful or fights card-expand / drag. |
| Item picker | GP already **viewport-centered**; filters are a dense multi-column grid | Filters exist at 640px (2-col), but the panel is still a desktop tool: many dropdowns, 38vh filter scroll, 140px min list. |
| Enchant picker | `width: max-content`, **330px columns, `nowrap`** | 2–5 category columns → horizontal overflow; rows are desktop density. |
| Community cards | 26×26 corner icon buttons | Below 44px touch target; easy mis-taps on Load vs Delete vs Share. |
| Talent overlay | `transform: scale()` to fit `--gp-center-width` | With docks + zoom, the host is tiny; three trees shrink below readable/tappable node size. |
| Dual stat weights | Side-by-side panels, `min-width: 280px` | Forced into ~50% of a crushed center column. |
| Top nav | Wraps at 768px (`height: auto`) | GP docks stay locked to **`top: 60px`**, so they slide under a taller nav. |
| Coffee footer | Fixed bottom, `z-index: 1090` | Sits under docks and above content; on mobile it will collide with a tab bar unless reserved. |

Existing GP media queries are only:

- `max-width: 900px` — header becomes one column.
- `max-width: 520px` — save-dialog role/spec fields stack.
- `min-width: 640px` — community filters go multi-column.

That is not a mobile layout. **Do not try to shrink the three-pane desktop into a phone.** Convert Locations and Modified stats into first-class mobile **tabs / sheets**, give the gear a single readable column, and make every overlay a full-viewport dialog.

---

## 2. Design principles

1. **Readable first.** Body text ≥ 16px on the phone (or `1rem` at `--ts: 1`). Stat values stay tabular and do not wrap mid-number. Long item names wrap to two lines, then ellipsis.
2. **One primary task per screen.** Gear, Locations, and Modified stats are mutually exclusive views on a phone. Overlay views (talents / buffs / weights) replace Gear, not the tab bar.
3. **44×44px tap targets** (Apple HIG / WCAG 2.5.5). Icon-only 36×36 header buttons grow to 44. Community corner buttons become a trailing action row, not 26px overlays.
4. **Touch, not hover.** Location highlight is tap-to-pin. Item tooltips are tap-to-toggle (second tap / backdrop / close dismisses). Drag-reorder stays edit-mode-only and is not required for basic use.
5. **Kill CSS `zoom` on GP mobile.** Auto-scale is a desktop fit tool. On a phone it fights every `vw`/`vh` and every unscaled dock. Mobile GP uses `--ui-scale: 1` and real reflow. Keep `--text-scale` so the existing text slider still works.
6. **Safe areas and dynamic toolbar.** `env(safe-area-inset-*)`, `100dvh`, and a measured nav height (not hardcoded `60px`) after the top nav wraps. Reserve space for the coffee footer **or** hide it while a GP tab bar is shown.
7. **No iOS input zoom.** Inputs/selects in dialogs use `font-size: 16px` minimum so Safari does not zoom the page on focus.
8. **Don’t fork business logic.** Same `currentPlan`, same `renderLocationsSidebar` / `renderStatsSidebar` data. Mobile is layout + interaction adapters.
9. **Character Planner stays desktop-first** unless a shared modal would otherwise be unusable from GP. Shared CSS must be scoped (`body[data-app-mode="gearPlanner"]` and/or `.gp-mobile`) so CP paperdoll anchoring does not break.

---

## 3. Breakpoints and the `gp-mobile` switch

### 3.1 Breakpoints

| Name | Width | Intent |
|---|---|---|
| **Phone** | `max-width: 720px` | Full mobile chrome: tab bar, single-column slots, sheet modals. Matches existing `style.css` 720px habit. |
| **Narrow tablet** | `721px–900px` | Still too tight for two 260px docks. Keep mobile chrome (tabs + single column). |
| **Wide tablet / small laptop** | `901px–1199px` | Optional later: collapsible drawers instead of always-on docks. **v1 can keep today’s docks** once the center column is guaranteed `≥ 480px`. |
| **Desktop** | `≥ 1200px` | Current three-pane layout unchanged. |

**v1 rule:** treat **`max-width: 900px` OR coarse pointer + `max-width: 1199px`** as mobile GP. Prefer a JS class on `body` so layout, scale, and JS share one source of truth:

```text
body.gp-mobile           // phone / narrow tablet chrome
body[data-app-mode="gearPlanner"]
```

Compute with `matchMedia('(max-width: 900px)')` and update on `resize` / `orientationchange`. Persist nothing — it is viewport state.

### 3.2 UI scale (must land in phase 1)

In `computeAutoScale()` / `applyUiScale()`:

- If `data-app-mode === 'gearPlanner'` **and** `gp-mobile`, force **`--ui-scale: 1`** (ignore auto 0.5).
- Leave the settings sliders visible but document that **layout scale is disabled** on GP mobile; **text scale still applies** to shell, docks/sheets, and dialogs.
- `#ichacalc-scaled-root { zoom: 1 }` in this mode so item-picker `vw`/`dvh` and tooltip math match the viewport.
- `itemTooltipPosition.js` already divides by `--ui-scale`; with scale = 1 the existing path stays correct.

Without this, every later CSS change is fighting a 50% zoom.

### 3.3 Center width

On `.gp-mobile`:

```text
--gp-dock-width: 0px;
--gp-center-width: 100%;
#gear-planner-shell padding-inline: 12px;
#gear-planner-shell padding-bottom: calc(tabbar + coffee + safe-area);
.gp-main { width: 100%; max-width: 100%; }
```

Class/race no longer uses `translateX(-100% - 8px)`.

---

## 4. Mobile information architecture

```text
┌─────────────────────────────────────┐
│ Top nav (single compact row)        │
├─────────────────────────────────────┤
│ GP header: name · class/race · ⋯    │
├─────────────────────────────────────┤
│                                     │
│  Active pane:                       │
│    Gear  |  Locations  |  Stats     │
│    (+ talents / buffs / weights     │
│     replace Gear, keep tab bar)     │
│                                     │
├─────────────────────────────────────┤
│ [ Gear ] [ Locations ] [ Stats ]    │  ← bottom tab bar
│          Buy me a coffee            │  ← hide or sit above tabs
└─────────────────────────────────────┘
```

### 4.1 Bottom tab bar (new)

Add `#gp-mobile-tabbar` in `index.html` (hidden on desktop via CSS). Three tabs:

| Tab | `aria-controls` | Opens |
|---|---|---|
| **Gear** | `#gp-slots` / `.gp-layout` | Default. Also the return target from overlay “home” (armor) button. |
| **Locations** | `#gp-locations-sidebar` | Full-screen sheet of today’s Locations list. |
| **Stats** | `#gp-stats-sidebar` | Full-screen sheet of Modified stats. |

Implementation notes:

- Do **not** duplicate the lists. Reuse `#gp-locations-sidebar` and `#gp-stats-sidebar`. On `.gp-mobile`, change them from `position: fixed; left/right: 0; width: 260px` to **full-bleed panels** under the header (`top: var(--gp-mobile-header-bottom)`, `bottom: var(--gp-mobile-tabbar-height)`).
- Only the active panel is visible (`hidden` / `.is-active`). Gear pane hides both.
- Persist the last tab in session (`ichacalc_gear_planner_session_v1.ui.mobileTab`) so rotate / planner-mode toggle does not dump the user.
- Tab bar `z-index` above coffee footer (1090) and below modals (2000+). Suggest **1150**.
- Icons + text labels (not icon-only). Selected state uses the existing gold accent.
- When talents/buffs/weights are open, the Gear tab stays selected (those views live in `.gp-main`). Switching to Locations/Stats closes the overlay the same way the armor-home button does (`flushGpOverlayStateToPlan` already exists).

### 4.2 Why tabs instead of swipe-only drawers

Drawers are easy to miss, fight the item picker, and make “where did my stats go?” the default. The user asked for the **Locations tab** and **Modified stats tab** to be first-class. A persistent tab bar is the readable, discoverable version of those docks.

Optional later: swipe between the three panes. Not required for v1.

---

## 5. Header, class/race, and plans chrome

### 5.1 Header

On `.gp-mobile`, replace the 5-column grid with a stacked, readable header:

1. **Title row:** `#gp-plan-name` full width (16–18px, wraps to 2 lines). Votes sit on a second line under the name, not squeezed beside a 1.35rem input.
2. **Identity row:** class toggle + race toggle **in the header**, 44px, not floating in the left gutter.
3. **Actions row:** two labeled groups that wrap:
   - **Build:** Talents, Buffs, Weights (hide Weights if unsupported, as today).
   - **Plans:** Import, Save, Edit, Browse, Share, Clear — wrap; 44px icons with `title` **and** a visually hidden or tiny caption on the first wrap, or a single **“Plans”** overflow button.

**Plans overflow (recommended if the second row still wraps twice on 320px):** one 44px “⋯” / “Plans” button opens a compact action sheet (same handlers, no new APIs). Sim (shaman) stays visible: cog + sword + result text under the actions.

`#gp-st-rotation-row` and the quick-sim hint become full-width stacked buttons (already wrap).

### 5.2 Class / race drawers

Desktop vertical icon columns are unusable on a phone (they push the page or overlay the tab).

On mobile:

- Toggle still uses `#gp-class-drawer-toggle` / `#gp-race-drawer-toggle`.
- Open state is a **horizontal wrap panel** or a small **centered sheet** of class/race icons (min 44px), not a 2400px-tall column.
- Opening class closes race and vice versa.
- `pointer-events` on `.gp-class-sidebar` stays auto; the sidebar becomes `position: static` inside the header identity row.

### 5.3 Edit mode

Keep current rules (view hides X / add-slot). On mobile:

- Edit toggle must be obvious (pressed gold state already exists).
- Empty-slot add target stays 48px (already OK).
- **Skip drag-and-drop as a required path.** Card tap still expands alts; add/remove X is enough. If drag is kept, require a long-press handle so it does not steal scroll.

---

## 6. Gear pane — slot cards

Single column: `.gp-layout { grid-template-columns: 1fr; }`.

**Unify left/right card chrome on mobile.** Right-column `row-reverse` and right-aligned meta exist so icons sit on the paperdoll outer edge. On a single column that mirroring is confusing (enchant/chevron jump sides every other card). On `.gp-mobile`:

- Always icon **left**, name **left**, chevron **right**.
- `.gp-item-name` wraps (`overflow: visible`, `-webkit-line-clamp: 2`).
- Source line (`Zone: Dungeon – Boss`) wraps; `word-break: break-word`.
- Enchant chrome: if the name + scroll + enchant label do not fit, **stack** — name on line 1, enchant on line 2. Do not shrink enchant text below 14px.
- Scores (`.gp-item-scores`) wrap under the name; tank score may use a shorter label on phone (`Tank 12.4k` + detail on expand) if the full `Tank score: X (EHP Y · MIT Z)` overflows. Prefer wrap over truncation.
- Expanded alts: full-width rows, 44px icons, same left-aligned pattern. **Add alternative** stays a full-width button (already is).

Paperdoll slot **order** can stay left-then-right (head → … → ranged) so users are not relearning a third order.

---

## 7. Locations tab (today’s left dock)

### 7.1 Layout

Full-panel sheet:

- Title **Locations needed** sticky at the top of the panel (keep `.gp-locations-title`).
- Scroll the list only (`overflow-y: auto`), not the title.
- Group headings (Dungeons, Raids, World Bosses, Other) stay gold, slightly larger (`1rem`), with more padding (`10px 8px`) so they scan as section breaks.
- Each `.gp-location-entry` is a **block** with min-height 44px, not a 3px-padded line.
- Nested `.gp-location-item` names use quality colors (already) and wrap. Min tap height 40px.

Empty copy (“No locations yet”) should sit centered with a one-line hint: *Equip items in Gear to see where to farm.*

### 7.2 Touch highlight (replaces hover)

Today (`gearPlannerView.js`):

- `mouseenter` → `applyLocationHighlights` + `.gp-location-hovering` dims other cards.
- `mouseleave` → `clearLocationHighlights`.
- Nested item click → octowow DB.

On mobile, hover never fires. Replace with **sticky selection**:

1. Tap a location row (not an item name) → pin highlight (`aria-pressed="true"` on the entry). Dim other gear rows; gold wash on matches (existing `.gp-item-name--location-hl` / `.gp-row--location-hl`).
2. Tap the same location again (or a **Clear highlight** control in the title row) → clear.
3. Tap a different location → retarget.
4. Nested item tap still opens octowow. `stopPropagation` stays so it does not toggle highlight.

**Cross-pane:** after pinning a location, offer a text button **“Show on gear”** that switches to the Gear tab and `scrollIntoView` the first highlighted row. Without this, highlight is invisible while the Locations sheet covers the cards.

Keep `mouseenter` on non-mobile so desktop is unchanged. Gate with `!document.body.classList.contains('gp-mobile')` or `matchMedia('(hover: hover) and (pointer: fine)')`.

### 7.3 Readability details

- Do not rely on hover border (`#c9a227`) as the only selected state — use a filled background (`rgba(255, 215, 0, 0.12)`) + left gold bar.
- Instance names like “Molten Core – Ragnaros” must wrap; avoid `nowrap` / `ellipsis` on the only line.
- If a location has many items, collapse item names behind a count (`4 items`) with an expand chevron. Default **expanded** when the group has ≤ 3 items so short lists stay one tap.

---

## 8. Modified stats tab (today’s right dock)

### 8.1 Layout

Same sheet pattern as Locations (full bleed, sticky title **Modified stats**, scrolling `.gp-stats-list`).

Cards (Melee, Defense, Spell, Ranged, Misc Effects, …) already stack. On mobile:

- Card title (if present) sticky-or-bold at 15–16px.
- Each `.gp-stat-item` is a two-column row: label (can wrap) + `strong` value (`white-space: nowrap`, already). Increase vertical padding to 8px so rows are tappable even if we do not attach actions.
- Nested rows (Dodge / Glancing under weapon skill; avoidance children) keep the indent but use a slightly smaller label, not a smaller value.
- Percent formatting stays `formatGpSmartPercent` — no change.
- Hide Ranged for shaman/druid/paladin as today.

Empty state: keep “No modified stats yet” and add *Buffs, talents, and equipped primaries appear here.*

### 8.2 Values that currently overflow

Watch these on a 320-px-wide panel (full width minus 24px padding):

- Long labels: **Chance to be Missed**, **AP vs. Beast**, **All Spell** DR.
- Composite **Tank Score** / **Mit Score** plus “Run Sim” placeholder.

Rules:

- Label `min-width: 0; overflow-wrap: anywhere` (or break at spaces only — prefer wrap at spaces).
- Value column `flex: 0 0 auto; max-width: 45%` so a wrapped label never shoves the number off-screen.
- “Run Sim” should be a real control that **switches to the Stat weights overlay** (today it is inert copy). That is the mobile-friendly path to generating tank weights.

### 8.3 Optional (v1 if cheap)

A one-line **summary strip** under the title: Health, Armor, Tank Score or ~DPS if weights exist. The full list stays below. Do not hide groups behind accordions in v1 unless the list is taller than ~3 viewports; scrolling is OK if type is 16px.

---

## 9. Overlay views (still in `.gp-main`)

These already hide `.gp-layout`. On mobile they must use the **full width** between header and tab bar.

### 9.1 Talents

`fitGpTalentTree()` scales three trees into the host. On a 390-px-wide host, Classic trees become untappable.

**v1 approach (readable):**

1. Give `#gp-talents-host` a horizontal scroll (`overflow-x: auto; -webkit-overflow-scrolling: touch`) and **do not scale below a minimum** (e.g. scale floor **0.55**, or fit height only).
2. Better: **one tree at a time** — segmented control (tree names) above the host; `fitGpTalentTree` fits a single tree to `min(hostWidth, hostHeight)`. Header title + shaman preset hamburger stay; hamburger becomes a 44px target, dropdown becomes a sheet (see modals).

Prefer (2) if the existing tree markup can hide inactive `.talent-tree` without rewriting `talents_new`. If not, ship (1) with a “swipe to see other trees” hint.

`syncGpTalentsHeaderLayout()` uses `getBoundingClientRect()` of scaled trees — retest after scale-floor / single-tree so the title stays centered and the hamburger does not sit off-screen.

### 9.2 Buffs

`#buffs-list` was designed for a wide card. On mobile:

- Icon grid wraps (`flex-wrap: wrap`, 40–44px icons).
- Consumable preset hamburger + Clear all stay in `#gp-buffs-tools-slot`, stacked or wrapping, not `justify-content: flex-end` only.
- Buff tooltips: same tap-to-toggle as items (see §11). Shared `#item-tooltip` path already used for some spell tips.

### 9.3 Stat weights

- `#gear-planner-shell.gp-dual-weights .gp-stat-weights-view` → **column** (`flex-direction: column`).
- Each `.gp-weights-panel` `width: 100%; max-width: none`.
- Controls (boss search, minutes, seconds, Generate) stack; Generate is full-width.
- `#gp-tank-boss-results` must not clip (`position: absolute` inside a scrolling view — portal to `body` or allow the panel to grow).
- Manual weight grid: `minmax(140px, 1fr)` → `minmax(100%, 1fr)` on phone (one field per row) so labels are readable.
- Weight **tables**: `overflow-x: auto` on a wrapper; do not shrink columns below ~72px. Sticky first column if possible.
- Shaman generate progress text stays visible (`#gp-dps-weights-host`).

---

## 10. Modals and dialogs (complete inventory)

Every overlay a GP user can open. Shared = also used by Character Planner; scope selectors carefully.

### 10.1 Item picker — `#item-modal` / `#item-modal-panel`

**Already GP-centered** (`modal.md`). Still a desktop filter surface.

Mobile rules (`body.gp-mobile` or `max-width: 720px` under GP):

- Panel: `left/right/top/bottom` inset **8px** under the nav; `width: auto; max-width: none; max-height: calc(100dvh - nav - 16px)`; `border-radius: 12px`. Treat as a **sheet**, not `min(96vw, 1320px)` sitting wherever JS last clamped.
- `applyItemPickerPanelBounds` / `positionItemPickerPanel`: if `gp-mobile`, skip slot-adjacent math (already skipped on GP) **and** set inset sheet bounds so keyboard open (`visualViewport`) shrinks the list, not the filter into oblivion.
- **Filters:** collapse into a `<details>` / toggle **Filters** by default **collapsed** after first search focus, so the item list gets ≥ 50% of the sheet. Primary row already becomes 2-col at 640px; on phone use **1-col**: search full width, then type, then stacked dropdowns, then source chips (wrap), then instance dropdowns, then Can equip / DPS / Tank as a wrapping chip row.
- Required-level dual slider: already wraps at 640px; give thumbs 44px hit sliders (CSS `height` + padding) — native range thumbs are too small.
- List rows: min-height 48px; icon 40px; name wraps 2 lines; score badges wrap under the name.
- Reset + Close stay in the header (44px close).
- Tooltip: tap icon to pin (see §11). Do not open tooltip on the same tap that equips.

`style.css` already has 1200 / 640 filter grids — extend with a GP-mobile 1-col sheet, do not regress CP’s anchored picker.

### 10.2 Enchant picker — `#enchant-modal`

Current CSS (`style.css`): `width: max-content`, columns **330× N**, `flex-wrap: nowrap`. This is the worst modal on a phone.

Mobile:

- Overlay already `position: fixed; inset 0`. Content: `width: 100%; max-width: 100%; max-height: 100dvh; height: 100%` (or 96dvh sheet).
- `.enchant-picker-categories { flex-direction: column; flex-wrap: nowrap; width: 100%; }`.
- `.enchant-picker-column { flex: 1 1 auto; min-width: 0; width: 100%; }`.
- Category headers stay color-coded and sticky inside the scroll body.
- Each enchant row ≥ 48px; compact label wraps.
- Close button 44px.

### 10.3 Save / overwrite — `#gp-save-overwrite-dialog`

Mostly in good shape (`min(640px, 96vw)`, role/spec stack at 520px).

Mobile polish:

- `max-height: 100dvh`; body scrolls; **footer sticky** (Overwrite / Save as New / Cancel) so it is not below the keyboard.
- Icon grid cells 44px (today 40).
- Name + description `font-size: 16px`.
- Footer buttons full-width stack on `max-width: 420px` (`Save as New` above `Overwrite`) so two wrapping pills are not 80px wide.

### 10.4 Community / personal browser — `#gp-community-search-dialog`

- Full-viewport sheet (`width: 100%; height: 100dvh; max-height: 100dvh; border-radius: 0` on phone).
- Tabs sticky; filters already 2-col below 640 — on phone **1-col** (search, class, role, spec, sort, Search button).
- Results list is the flex grow (already).
- **Cards:** drop absolute 26px corners. Layout:

  ```text
  [icon] title
         meta
         [Delete] [Star] [Share]     ← 44px text-or-icon buttons
         [▲ n] [▼ n]                 ← if votes
  ```

- Title `white-space: normal` (today `nowrap` + ellipsis). Description clamp 2 is OK.

### 10.5 Armory import — `#gp-armory-import-dialog`

Already `width: calc(100vw - 32px)`. Ensure:

- `max-width: min(420px, 100vw - 24px)`.
- Inputs 16px; actions stacked full-width.
- Native `<dialog>` + backdrop is fine; confirm it scrolls when the keyboard is open.

### 10.6 DPS sim settings — `#dps-sim-config-modal` (shaman)

Portaled to `document.body`, `z-index: 10050`, desktop ~820px / three columns (`dps.md`).

Mobile:

- Dialog `width: 100vw; max-height: 100dvh`; **one column**.
- Combat toggles as 44px rows, not a tight icon strip.
- Config tooltips (`setupConfigTooltip`) become tap-to-toggle; they already portal to `body`.
- Close + implicit “done” at the top (sticky header).

### 10.7 Profiles — `#profiles-modal`

`profiles.css` already stacks rows at 768px. On GP mobile: `width: min(100vw, 560px); max-height: 100dvh`; list scroll; empty state padding reduced. Opened from top nav **My Builds** while in GP.

### 10.8 Inbox — `#inbox-modal` and `#inbox-dropdown`

Dropdown `min-width: 300px; right: -80px` at 768px **overflows the viewport**. On `.gp-mobile`:

- Prefer opening `#inbox-modal` (full sheet) instead of the dropdown, **or** pin the dropdown to `left: 8px; right: 8px; width: auto; max-height: 70dvh`.
- Same for `.builds-dropdown`.

### 10.9 Share — `#share-modal`

Centered overlay. Mobile: `width: calc(100vw - 16px)`; textarea 16px; Send/Cancel stacked.

### 10.10 Talent preset dropdown — `#gp-talent-preset-dropdown`

Desktop menu under the hamburger. Mobile: fixed sheet (`bottom` or centered), full width, 44px rows. Do not clip inside `#gp-talents-header` overflow.

### 10.11 Consumable preset menu (buffs view)

Same treatment as talent presets — sheet, not a clipped absolute menu.

### 10.12 UI settings panel (top nav)

`position: fixed; top: 68px; right: 16px`. On a wrapped nav + phone: `left: 8px; right: 8px; width: auto; max-height: 80dvh; overflow: auto`. Sliders stay usable (large thumbs). GP-mobile copy: layout scale disabled (see §3.2).

### 10.13 Onboarding overlay

Already `100dvh` + scroll on the card. If “Take me to Gear Planner” is used on a phone, landing must hit `.gp-mobile` after `setAppMode('gearPlanner')`. No extra onboarding work unless the card itself overflows (verify on 320×568).

### 10.14 Confirm / native dialogs

Clear-build confirm: keep `confirm()` for v1 **or** reuse the save-dialog pattern if `confirm()` is already replaced. If it is still `window.confirm`, it is mobile-safe.

### 10.15 Radial menu — `#radial-menu-container`

Used from Character Planner gear. Confirm GP does **not** open it (GP uses card chrome). If a path remains, hide it on `.gp-mobile` and use the item picker only.

### 10.16 Shared `.modal-overlay`

Base rule is `position: fixed; 100% × 100%; flex center`. Add:

```css
body.gp-mobile .modal-overlay {
  align-items: stretch;
  padding: 0;
}
body.gp-mobile .modal-overlay > .modal-content {
  width: 100%;
  max-width: 100%;
  max-height: 100dvh;
  border-radius: 0;
  display: flex;
  flex-direction: column;
}
```

Scope to GP if CP should keep centered cards.

---

## 11. Tooltips on touch

`#item-tooltip` is `position: fixed` inside the scaled root. Hover-only consumers: GP slot icons, modal rows, buff icons, some sim-config icons.

**Mobile behavior:**

1. First tap on an icon **shows** the tooltip (do not also expand the card / select the item).
2. Second tap on the **same** icon performs the desktop action (open picker / toggle buff / select item) **or** we use a dedicated “Equip” in the tooltip footer. Prefer: **tap icon = tooltip; tap name/row = select/expand.** That matches “don’t trap equip behind a tooltip.”
3. Tooltip becomes a **readable card**: `max-width: min(100vw - 16px, 360px); max-height: 70dvh; overflow-y: auto; font-size: 14–16px`. Prefer **below the icon**, flip up, then **center in the viewport** if it still clips (common on the last slot).
4. Backdrop tap or Close (×) hides it. Opening any modal hides it.
5. `positionItemTooltipOnIcon` should detect `.gp-mobile` and use the sheet/center fallback instead of growing off-screen left of a left-column icon.

Do not use hover delays on coarse pointers.

---

## 12. Top nav, coffee footer, and z-index

| Layer | z-index today | Mobile note |
|---|---|---|
| Coffee footer | 1090 | Hide on `.gp-mobile` **or** sit in the tab bar as a text link. Hiding is cleaner. |
| Locations / stats docks | 1100 | Become pane content, `z-index: 5`, not overlays. |
| Class sidebar | 1200 | In-header, no overlay race. |
| Item picker | 2100 | Unchanged. |
| Save dialog | 2200 | Unchanged. |
| Sim config | 10050 | Unchanged. |
| Onboarding | 99999 | Unchanged. |

Nav:

- Measure `#top-nav-bar` height and set `--gp-nav-offset` (JS `ResizeObserver`). Docks/sheets/tab bar use it instead of `60px`.
- On `.gp-mobile` the top nav stays **one 40px row**: circular armory portrait + title left-aligned, actions (icon-only Discord, remaining icons) right-aligned. `#mode-character-btn` is hidden. Do not wrap to a second row.

Shell padding today: `calc(68px / var(--ui-scale))` top and `calc(52px + safe-area)` bottom. On mobile: top = nav + 8px; bottom = tab bar + safe-area (+ coffee if kept).

---

## 13. Implementation phases

Ship in this order so the page is usable after phase 1, then complete.

### Phase 1 — Foundation (blocker)

- `body.gp-mobile` from `matchMedia`.
- Disable UI zoom on GP mobile (`uiScale.js` + CSS).
- `--gp-center-width: 100%`; hide desktop docks; single-column slots; left-aligned cards.
- Compact header + in-header class/race.
- Bottom tab bar; relocate the two asides into full-screen panes.
- Nav offset + tab-bar padding; hide coffee footer on GP mobile.
- Update `gearPlannerView.md` / this plan’s “landed” notes.

**Exit:** On a 390-px emulator, user can name a plan, pick class, expand a slot, and read item names without horizontal page scroll.

### Phase 2 — Locations + Modified stats

- Sheet typography and spacing (§7–8).
- Tap-to-pin location highlight + “Show on gear”.
- Stats value wrapping; “Run Sim” → weights overlay.
- Session-persist `mobileTab`.

**Exit:** A filled plan’s Locations list is scannable; tapping “Molten Core” highlights matching cards after switching to Gear. Stats list is readable to the last nested dodge row.

### Phase 3 — Modals

- Item picker sheet + collapsible filters + 16px inputs.
- Enchant categories stack.
- Save footer sticky; community cards reflow; inbox dropdown fixed.
- Armory, share, profiles, sim-config, preset menus.

**Exit:** Equip an item, apply an enchant, save, browse community, import armory, open sim settings — none require landscape or pinch-zoom.

### Phase 4 — Overlays + tooltips

- Talent single-tree or min-scale + scroll.
- Buffs wrap; weights stack.
- Tap-to-toggle tooltips with viewport clamp.

**Exit:** Spend talent points, toggle buffs, generate tank weights, read an item tooltip, all on a phone.

### Phase 5 — Polish

- Keyboard / `visualViewport` for save + item search.
- Landscape: still tabs; two-column slots **only if** width ≥ 700 **and** height ≥ 500 (optional).
- `prefers-reduced-motion` on sheet transitions.
- QA matrix below.

---

## 14. Files to touch (expected)

| File | Why |
|---|---|
| `index.html` | `#gp-mobile-tabbar`; maybe header overflow sheet markup. |
| `gear-planner.css` | Vast majority of layout. |
| `modules/gear/gearPlannerView.js` | Tab state, location tap, class/race placement, “Show on gear”, Run Sim link, session key. |
| `modules/ui/uiScale.js` / `uiScale.md` | Disable zoom on GP mobile. |
| `modules/ui/modal.js` / `modal.md` | Picker sheet bounds; tooltip tap vs select. |
| `modules/ui/itemTooltipPosition.js` / `.md` | Mobile clamp / center fallback. |
| `style.css` | Enchant stack; shared `.modal-overlay`; item-picker 1-col; `#item-tooltip` mobile. |
| `shaman-dps.css` | Sim-config one-column. |
| `profiles.css` / `topnav.css` | Inbox/builds dropdowns; settings panel; nav hit targets. |
| `modules/gear/gearPlannerView.md` | Document tabs, tap highlight, mobile scale. |
| `DOCUMENTATION_INDEX.md` | Link this plan. |

No server or loot-data changes.

---

## 15. QA checklist

Test in Chrome device mode **and** one real iOS Safari if possible (zoom, `100dvh`, input zoom, `visualViewport`).

**Viewports:** 320×568 (SE 1), 390×844 (14), 430×932 (14 Pro Max), 768×1024 (iPad portrait), 844×390 (landscape phone).

| # | Case |
|---|---|
| 1 | Fresh `/gear-planner` — no horizontal scroll, tabs visible above home indicator. |
| 2 | Load `?gp=` share as guest — names, Locations, Stats populate. |
| 3 | Class + race change — drawers usable; plan stats update. |
| 4 | Edit on: add item (picker), add alt, enchant, remove X, collapse. |
| 5 | Edit off: no add/X; cards still expand; picker does not open. |
| 6 | Locations: pin raid, Show on gear, clear; item name opens octowow. |
| 7 | Stats: long labels wrap; numbers visible; empty plan copy. |
| 8 | Talents: nodes tappable; shaman presets sheet; home icon returns to Gear. |
| 9 | Buffs: icons wrap; exclusive buffs; consume presets. |
| 10 | Dual-role weights: stacked panels; Generate; table scroll. |
| 11 | Item picker: filter, search, select; tooltip does not steal equip. |
| 12 | Enchant: all categories reachable without horizontal page scroll. |
| 13 | Save (create + overwrite + save as new); icon grid; keyboard does not hide Save. |
| 14 | Browse personal + community; load; vote; delete does not misfire. |
| 15 | Armory import error + success. |
| 16 | Share + inbox + profiles from nav. |
| 17 | Shaman: sim settings + quick sim progress + result text. |
| 18 | Rotate phone; tab and overlay survive. |
| 19 | Text scale 150% — tabs and sheets still usable. |
| 20 | Desktop ≥ 1200px — **pixel-equivalent** three-pane (no tab bar, docks on). |

---

## 16. Risks

- **`zoom: 1` only on GP mobile** — if the user then opens Character Planner in the same session, `applyUiScale()` must restore auto-fit. Hook `setAppMode` and the resize listener.
- **Shared item picker CSS** — GP sheet rules leaking into CP will break slot-anchored placement. Gate every override.
- **Moving the asides** with `position: fixed` + `hidden` — `hidden` is already used when lists are empty-ish; do not fight `hidden` with `display: flex !important` on the wrong breakpoint. Use `.gp-mobile` + `[data-gp-pane]`.
- **Talent tree internals** — single-tree mode may need a small `talents_new` / host CSS hook; budget that in phase 4.
- **Hover highlight CSS** (`.gp-location-hovering` opacity 0.4) — if we switch panes, dimming must apply to `.gp-layout` even when Locations was the previous view (highlight classes stay on rows).

---

## 17. Non-goals (v1)

- Redesigning Character Planner paperdoll / tank sim tabs.
- A separate mobile site or PWA install prompt.
- Changing loot grouping or stat formulas.
- Pinch-zoom canvas (browser zoom remains available).
- Drag-and-drop polish on touch (nice-to-have after v1).

---

## 18. Suggested first implementation slice

When implementation starts, land **Phase 1 only** in the first PR: `gp-mobile` + no zoom + tab bar + single-column gear + docks-as-panes. That unlocks real-device feedback before investing in picker/enchant sheets. Phases 2–4 can follow as stacked PRs against the same branch or sequential PRs.

This document is the spec those PRs should implement and then tick off.
