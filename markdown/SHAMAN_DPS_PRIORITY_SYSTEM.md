# Shaman DPS Simulator - Hard-Coded Priority System Documentation

## Overview

The Shaman DPS simulator uses a hard-coded priority-based rotation system in the `executeRotation()` method. This system determines which ability to cast at any given moment during combat simulation. The rotation is executed every simulation iteration, and abilities are prioritized based on their importance for optimal DPS.

## Simulation Loop Structure

The simulation runs in a continuous loop that:

1. **Processes scheduled events** (auto-attacks, DoT ticks, totem attacks, etc.)
2. **Executes the rotation** (`executeRotation()`) to determine the next ability to cast
3. **Advances time** to the next scheduled event using `getNextEventTime()`

The rotation is called every iteration, but abilities only execute when:
- The Global Cooldown (GCD) is ready (1.5 seconds)
- The specific ability's cooldown is ready
- Any other prerequisites are met

## Priority System Breakdown

The priority system uses a **top-to-bottom check** with early returns. Once a priority condition is met and an ability is cast, the function returns immediately, preventing lower-priority abilities from executing in the same iteration.

### Priority 0: Searing Totem Refresh (No GCD Required)

**Condition:** `if (this.activeFireTotem !== 'searing')`

**Action:** `this.dropSearingTotem()`

**Details:**
- **Does NOT use GCD** - This is checked BEFORE the GCD check, allowing it to execute even when GCD is on cooldown
- Searing Totem lasts 60 seconds (55 seconds duration + setup time)
- Automatically refreshes when the totem expires or is replaced by Fire Nova Totem
- Attack rate: 2.2 seconds base (1.76s with Improved Fire Totems 2/2)

**Why Priority 0:** Totem maintenance is critical for DPS, and since it doesn't use GCD, it can be refreshed without interfering with the rotation.

---

### GCD Check (Gate for All Other Priorities)

**Condition:** `if (!this.isGCDReady())`

**Action:** `return` (exit rotation, wait for GCD)

**Details:**
- Global Cooldown is 1.5 seconds
- All abilities except Searing Totem refresh trigger GCD
- If GCD is not ready, the rotation exits and waits for the next event

---

### Priority 1: Lightning Shield - Critical Refresh (For Lightning Strike)

**Condition:** 
```javascript
this.lightningShieldCharges <= 0 && 
(this.isAbilityReady('lightningStrike') || lightningStrikeReadySoon)
```

Where `lightningStrikeReadySoon = (lightningStrikeCD - this.currentTime) <= 1.5`

**Action:** `this.applyLightningShield()`

**Details:**
- **Triggers when:** Lightning Shield has 0 charges AND Lightning Strike is either ready now or will be ready within 1.5 seconds
- **Purpose:** Ensures Lightning Shield charges are available when Lightning Strike comes off cooldown
- Lightning Strike requires at least 1 charge to cast
- Restores 3 charges base (+2/4/6 with Stable Shields talent ranks 1/2/3)

**Why Priority 1:** Lightning Strike is a high-priority DPS ability. This prevents wasting Lightning Strike cooldowns by ensuring charges are available.

---

### Priority 2: Elemental Mastery + Flame Shock Refresh

**Condition:** 
```javascript
flameShockTimeRemaining <= 0 && this.isAbilityReady('shocks')
```

Where `flameShockTimeRemaining = this.flameShockDotExpires - this.currentTime`

**Action:** 
1. If Elemental Mastery talent is available and off cooldown: `this.activateElementalMastery()`
2. `this.castAbility('flameShock', 'Flame Shock')`

**Details:**
- **Triggers when:** Flame Shock DoT has expired (time remaining <= 0) AND shock cooldown is ready
- **Elemental Mastery:** Used right before Flame Shock if available and off cooldown (3 minute cooldown)
- Elemental Mastery does NOT trigger GCD, so it can be used simultaneously with Flame Shock
- Flame Shock DoT lasts 15 seconds, ticks every 3 seconds (5 ticks total)
- The DoT preserves Elemental Mastery's 15% damage bonus for its full duration even after EM expires

**Why Priority 3:** Flame Shock DoT is a significant source of damage. Maintaining 100% uptime is critical. Elemental Mastery is timed to maximize DoT damage.

---

### Priority 3: Stormstrike

**Condition:** `this.isAbilityReady('stormstrike')`

**Action:** `this.castAbility('stormstrike', 'Stormstrike')`

**Details:**
- **Cooldown:** 8 seconds (base)
- **Effect:** 
  - Deals weapon damage + nature damage
  - Applies Stormstrike buff (2 charges, +25% nature damage)
  - Consumes Stormstrike charges when used by certain abilities
- **High DPS ability** with significant damage output

**Why Priority 3:** Stormstrike is one of the highest DPS abilities. It's prioritized after Flame Shock maintenance because DoT uptime is more critical than a single high-damage ability.

---

### Priority 4: Lightning Strike

**Condition:** `this.isAbilityReady('lightningStrike') && this.lightningShieldCharges > 0`

**Action:** `this.castAbility('lightningStrike', 'Lightning Strike')`

**Details:**
- **Cooldown:** 9 seconds (8.5s with T2 3-piece set bonus)
- **Requires:** At least 1 Lightning Shield charge
- **Effect:**
  - Deals 60% weapon damage (physical) + 20% weapon damage as nature
  - Consumes 1 Lightning Shield charge
  - Procs Empowered Lightning Shield (consumes Stormstrike charge if available)
- **High DPS ability** with both physical and nature components

**Why Priority 4:** Lightning Strike is a core rotational ability, but requires Lightning Shield charges. Lower than Stormstrike because it has a shorter cooldown and is used more frequently.

---

### Priority 5: Earth Shock

**Condition:** `this.isAbilityReady('shocks')`

**Action:** `this.castAbility('earthShock', 'Earth Shock')`

**Details:**
- **Cooldown:** 6 seconds base (5s with Reverberation talent, shared with all shocks)
- **Effect:** Deals nature damage, consumes Stormstrike charge if available
- **Filler ability** used when higher-priority abilities are on cooldown

**Why Priority 5:** Earth Shock is a filler ability. It's used to fill gaps in the rotation when more important abilities are on cooldown. Lower priority because it's less damage than Stormstrike or Lightning Strike.

---

### Priority 6: Lightning Shield - Emergency Refresh

**Condition:** `this.lightningShieldCharges <= 0`

**Action:** `this.applyLightningShield()`

**Details:**
- **Triggers when:** Lightning Shield has 0 charges
- **Fallback priority** - only triggers if Priority 1 didn't catch it (shouldn't normally happen)
- Ensures Lightning Shield is always available when needed

**Why Priority 6:** Emergency fallback to prevent being unable to use Lightning Strike. Should rarely trigger due to Priority 1.

---

### Priority 7: Lightning Shield - Proactive Refresh

**Condition:** `this.lightningShieldCharges <= 3 && this.lightningShieldCharges > 0`

**Action:** `this.applyLightningShield()`

**Details:**
- **Triggers when:** Lightning Shield has 1-3 charges remaining (but not 0)
- **Purpose:** Proactively refreshes Lightning Shield when charges are low to prevent running out
- This is a "maintenance" priority to keep charges available

**Why Priority 7:** Prevents charge depletion that could delay Lightning Strike usage. Lower priority because it's not immediately critical - only used when all other abilities are on cooldown.

---

### Priority 8: Fire Nova Totem

**Condition:**
```javascript
allRotationalOnCD && this.isAbilityReady('fireNovaTotem') && this.activeFireTotem !== 'fireNova'
```

Where `allRotationalOnCD = !this.isAbilityReady('stormstrike') && !this.isAbilityReady('lightningStrike') && !this.isAbilityReady('shocks')`

**Action:** `this.dropFireNovaTotem()`

**Details:**
- **Triggers when:** All rotational abilities (Stormstrike, Lightning Strike, Shocks) are on cooldown AND Fire Nova Totem is ready AND Searing Totem is currently active
- **Effect:** Replaces Searing Totem with Fire Nova Totem, which detonates after a delay
- **Cooldown:** 15 seconds
- **Delay:** 3 seconds base (1s with Improved Fire Totems 2/2)

**Why Priority 8:** Fire Nova Totem is a situational ability used when all other abilities are on cooldown. It's lower priority because it replaces Searing Totem (which provides consistent DPS) and has a delay before dealing damage.

---

## Event Scheduling System

The simulator uses an event-driven approach. The `getNextEventTime()` method calculates the next scheduled event from:

1. **GCD ready time** (`this.gcdReadyAt`)
2. **Ability cooldowns** (all entries in `this.cooldowns`)
3. **Auto-attack** (`this.nextAutoAttack`)
4. **Enemy attacks** (for Lightning Shield procs, if `beingAttacked` is true)
5. **Fire Nova detonation** (`this.fireNovaDetonationTime`)
6. **Searing Totem attacks** (`this.searingTotemNextAttack`)
7. **Flame Shock DoT ticks** (`this.nextFlameShockTick`)

The simulation advances time to the earliest of these events, then processes all events that occur at that time before executing the rotation again.

## Key Mechanics

### Global Cooldown (GCD)
- **Duration:** 1.5 seconds
- **Applies to:** All abilities except Searing Totem refresh and Elemental Mastery
- **Purpose:** Prevents ability spam and simulates realistic casting limitations

### Shared Cooldowns
- **Shocks:** Earth Shock, Frost Shock, and Flame Shock share a 6-second cooldown (5s with Reverberation)
- **Fire Totems:** Searing Totem and Fire Nova Totem are mutually exclusive

### Lightning Shield Charge System
- **Base charges:** 3 (+2/4/6 with Stable Shields talent)
- **Consumption:** Lightning Strike consumes 1 charge
- **Refresh:** `applyLightningShield()` restores all charges and triggers GCD
- **Proactive management:** Refreshed at Priority 7 (≤3 charges) to prevent depletion

### Stormstrike Charge System
- **Charges:** 2 charges per cast
- **Consumption:** Earth Shock, Empowered Lightning Shield consume charges
- **Benefit:** +25% nature damage to affected abilities
- **Non-consumption:** Lightning Strike and Lightning Shield benefit but don't consume

### Elemental Mastery Timing
- **Cooldown:** 180 seconds (3 minutes)
- **Duration:** 15 seconds
- **GCD:** Does NOT trigger GCD (can be used at any time)
- **Timing:** Always used right before Flame Shock refresh to maximize DoT damage
- **Preservation:** Flame Shock DoT preserves the 15% bonus for its full 15-second duration

## Rotation Flow Example

Here's a typical rotation flow during combat:

1. **0.0s:** Opening sequence - Drop Searing Totem, Apply Lightning Shield, Activate Elemental Mastery, Cast Flame Shock
2. **3.0s:** Flame Shock DoT tick #1
3. **6.0s:** Flame Shock DoT tick #2, Cast Earth Shock (filler)
4. **9.0s:** Cast Lightning Strike (if charges available)
5. **12.0s:** Flame Shock DoT tick #3
6. **15.0s:** Flame Shock DoT tick #5 (final tick), Refresh Flame Shock DoT (Priority 2)
7. **18.0s:** Flame Shock DoT tick #1 (new application)
8. **8.0s:** Cast Stormstrike (Priority 3, 8s cooldown)
9. **21.0s:** Flame Shock DoT tick #2
10. **24.0s:** Flame Shock DoT tick #3, Cast Lightning Strike
11. **27.0s:** Flame Shock DoT tick #4
12. **30.0s:** Flame Shock DoT tick #5, Refresh Flame Shock DoT

And so on...

## Important Notes

1. **Early Returns:** Each priority uses `return` after executing, preventing lower priorities from checking in the same iteration
2. **GCD Gating:** All priorities except 0 require GCD to be ready
3. **Resource Management:** Lightning Shield charges are proactively managed to prevent ability lockouts
4. **DoT Uptime:** Flame Shock DoT is prioritized to maintain 100% uptime
5. **Cooldown Optimization:** Higher cooldown abilities (Stormstrike) are prioritized over shorter cooldown abilities (Earth Shock)
6. **Situational Abilities:** Fire Nova Totem is only used when all other abilities are unavailable

## Opening Sequence

The opening sequence (executed once at simulation start) is:

1. Drop Searing Totem (no GCD)
2. Apply Lightning Shield (triggers GCD)
3. Activate Elemental Mastery (if talent available, no GCD)
4. Cast Flame Shock (triggers GCD, benefits from Elemental Mastery)

This ensures all buffs and DoTs are active from the start of combat.

