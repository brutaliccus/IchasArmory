# Water Shield, Totem of Tides, and AOE Sim – Implementation Plan

## References
- [Water Shield (51536)](https://octowow.st/db/?spell=51536): 3 globes, 130 mana when struck, 3s ICD (we use 4s per your spec).
- [Totem of Tides (58146)](https://octowow.st/db/?item=58146): When Water Shield procs from being struck, releases tide: 25–33 Frost damage to enemies within 10 yards.

## Phase 1: Water Shield + Empowered Water Shield (placeholders)

### 1.1 Data layer
- **shaman/spells.js**
  - Add `waterShield`: spell id 51536, name "Water Shield", icon, school frost, no damage (mana only), `icd: 4`, `manaReturn: 130`.
  - Add `empoweredWaterShield`: name "Empowered Water Shield", `manaReturn: 130`, `apCoefficient: 0.20` (20% AP for future), no damage for now (placeholder).
- **character/buffs.js**
  - Water Shield already exists; ensure id/name match so sim can detect it (e.g. `watershield` / "Water Shield").

### 1.2 Sim: “which shield is active”
- **Stats / combat config**
  - From activeBuffs (or a combat config toggle), set e.g. `stats.hasWaterShield` / `stats.combatConfig.waterShield` so the sim knows Water Shield is active.
- **Mutual exclusion**
  - Only one elemental shield at a time: if Water Shield is active, treat as “no Lightning Shield” for ELS (don’t give LS charges; when Lightning Strike hits, proc Empowered Water Shield instead of ELS).

### 1.3 Water Shield system (mirror Lightning Shield where useful)
- **New module or extend lightningShieldSystem**
  - Option A: New `waterShieldSystem.js` with:
    - `getWaterShieldState(ctx)`, `triggerWaterShield(ctx, source)` (on being struck: 130 mana placeholder, 4s ICD).
    - `triggerEmpoweredWaterShield(ctx, source)` (on Lightning Strike: 130 mana + 20% AP placeholder).
  - Option B: Add water shield state and triggers inside existing shield/combat code without a full parallel system, and call from enemy attack + Lightning Strike.
- **Enemy attack**
  - In `enemyAttackSystem.js`: when attack lands, if Water Shield is active (and not Lightning Shield), call `triggerWaterShield(ctx, 'Enemy Attack')` instead of (or in addition to, depending on mutual exclusion) Lightning Shield. If both shouldn’t be active, only one runs.
- **Lightning Strike**
  - In `combatSim.js` (or ability handler) where we currently call `triggerEmpoweredLightningShield`: if Water Shield is active, call `triggerEmpoweredWaterShield` (placeholder: log or record “130 mana + 20% AP”) and do **not** call `triggerEmpoweredLightningShield`. If Lightning Shield is active, keep current ELS behavior.

### 1.4 Placeholders
- Mana not implemented: in `triggerWaterShield` / `triggerEmpoweredWaterShield`, record “mana returned” in a small structure (e.g. `ctx.waterShieldManaReturned += 130`) or log only, so when you add mana later we can hook real mana gain.

---

## Phase 2: Totem of Tides (item 58146)

### 2.1 Proc definition
- **gear/procs.js** (or item-driven proc)
  - Totem of Tides: item 58146, ranged/relic slot.
  - Effect: when Water Shield is **activated from being struck** (not from Lightning Strike), deal 25–33 Frost damage to enemies within 10 yards. No scaling.
  - Trigger: from inside `triggerWaterShield(ctx, 'Enemy Attack')` only (not from Empowered Water Shield).

### 2.2 Implementation
- In `triggerWaterShield` (or the “on struck” path only):
  - After applying the Water Shield proc (130 mana, 4s ICD), check if Totem of Tides is equipped (e.g. `ctx.stats.hasTotemOfTides` or check ranged item id 58146).
  - If yes, deal 25–33 Frost damage (single target for now; AOE count comes in Phase 4). Record as "Totem of Tides" with school frost.
- **Damage**
  - Base 25–33, no SP/AP. Roll resist/crit (see Phase 3). Use same `recordDamage` and damage pipeline as other procs so it shows in breakdown.

---

## Phase 3: Totem of Tides – crit, Clearcasting, Sigil

### 3.1 Crit
- Totem of Tides damage can crit using spell crit (inherited). In the Totem of Tides damage path: use `ctx.rollForCrit(..., false)` (spell), and if crit, apply 1.5x (or your standard spell crit multiplier). Record outcome as hit/crit.

### 3.2 Clearcasting (Elemental Focus)
- On Totem of Tides **crit**: grant Clearcasting (same as when a spell crits). Call the same “grant Elemental Focus” / `consumeElementalFocus`-inverse or “add charge” that the rest of the sim uses for spell crit procs.

### 3.3 Sigil of Ancient Accord
- Totem of Tides is a direct damage spell (Frost). After dealing Totem of Tides damage, call `fireSpellHitTriggers(ctx, 'Totem of Tides', icon, outcome, { alsoFireDirectDamageSpell: true })` so Sigil can proc (8% chance, 1s ICD) like for Lightning Bolt and shocks.

---

## Phase 4: AOE sim feature

### 4.1 Config
- **Combat config**
  - New toggle: “AOE” or “Multiple targets”.
  - New input: “Number of additional targets” or “Total targets” (e.g. 1 = single target, 5 = 5 targets). Store e.g. `stats.combatConfig.aoeEnabled` and `stats.combatConfig.aoeTargetCount` (or `extraTargets`).

### 4.2 Abilities that gain AOE damage
- Fire Nova Totem: already AOE; when AOE enabled, damage × (min(targetCount, cap) or per-target).
- Magma Totem: same idea (periodic AOE).
- Totem of Tides: 25–33 Frost to “enemies within 10 yards” → when AOE enabled, apply to primary + (targetCount - 1) additional targets.
- Sigil of Ancient Accord: “100 arcane to target and all nearby” + 300 to primary → primary gets 400 + scaling; each extra target gets 100 + scaling. When AOE enabled, add (targetCount - 1) × (100 + 0.07*SP) damage.

### 4.3 Damage recording
- For each AOE ability, when AOE is enabled and targetCount > 1:
  - Compute damage to primary (as now).
  - Compute damage to each extra target (same or reduced if needed; some abilities might have a cap).
  - Record total damage (primary + secondaries) so total damage and DPS reflect multi-target. Optionally break down “Fire Nova (primary)” vs “Fire Nova (AOE)” in the breakdown so the user sees the split.

### 4.4 Order of implementation
1. Add `aoeEnabled` and `aoeTargetCount` (or `numberOfTargets`) to combat config and UI.
2. For each AOE ability (Fire Nova, Magma, Totem of Tides, Sigil), add a branch: if AOE enabled and targetCount > 1, add (targetCount - 1) × per-target damage to total and record it (with a label that includes “AOE” or “multi-target” so breakdown is clear).

---

## Implementation order (recommended)

1. **Phase 1**: Water Shield + Empowered Water Shield (placeholders, no mana yet), including “which shield is active” and Lightning Strike branching (ELS vs EWS).
2. **Phase 2**: Totem of Tides proc when Water Shield procs from being struck (25–33 Frost, no scaling).
3. **Phase 3**: Totem of Tides crit, Clearcasting on crit, and Sigil proc.
4. **Phase 4**: AOE toggle + target count, then multi-target damage for Fire Nova, Magma, Totem of Tides, and Sigil.

This keeps each phase testable and avoids big-bang changes.
