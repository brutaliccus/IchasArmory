# Opener System Implementation Plan

## Overview
Implement a customizable opener sequence system that allows users to define a specific sequence of abilities/trinkets to execute at the start of combat, before falling back to the priority-based rotation system.

## Requirements
1. Opener takes precedence over priority system until fully executed
2. After opener completes, simulation falls back to priority system
3. If no opener configured (default: disabled), start with priority system from 0.00s
4. Opener system includes ALL abilities AND trinkets/on-use effects
5. Drag-and-drop reordering for opener sequence configuration
6. Opener defaults to disabled until explicitly configured

## Current Status

### ✅ Completed
1. Removed hardcoded opener (Searing Totem, Lightning Shield, Elemental Mastery, Flame Shock at start)
2. Simulation now uses priority system from 0.00s
3. Added Stormstrike delay setting for Flame Shock DoT expiration
4. Added opener configuration structure to `DEFAULT_PRIORITY_CONFIG`:
   ```javascript
   opener: {
       enabled: false,
       sequence: []
   }
   ```
5. Added opener card to priority list UI (shows at top, styled differently)

### ⏳ Pending Implementation
1. Opener configuration modal with drag-and-drop
2. Simulator integration to execute opener sequence
3. Trinket/on-use effect inclusion in opener list

---

## Implementation Details

### 1. Opener Configuration Modal (`showOpenerConfigModal` function)

**Location:** `modules/shamanDPS.js` (add after `getPriorityConfig` function)

**Functionality:**
- Opens a modal dialog to configure the opener sequence
- Lists all available abilities and trinkets/on-use effects
- Provides drag-and-drop interface for reordering
- Toggle to enable/disable opener
- Save/Cancel buttons

**Available Items in Opener List:**
- **Abilities:**
  - Lightning Shield (Critical)
  - Lightning Shield (Emergency)
  - Lightning Shield (Proactive)
  - Elemental Mastery
  - Flame Shock
  - Stormstrike
  - Lightning Strike
  - Earth Shock
  - Fire Nova Totem
  
- **Trinkets/On-Use Effects:**
  - Natural Alignment Crystal (trinket)
  - Elemental Mastery (talent-based, if available)
  
**UI Structure:**
```
┌─────────────────────────────────────────┐
│ Opener Sequence Configuration        [×]│
├─────────────────────────────────────────┤
│ ✓ Enabled                               │
│                                         │
│ Drag abilities here to set opener:     │
│ ┌─────────────────────────────────────┐│
│ │ [⚡] Natural Alignment Crystal    ☰ ││
│ │ [⚡] Elemental Mastery            ☰ ││
│ │ [⚡] Flame Shock                  ☰ ││
│ │ [⚡] Lightning Shield             ☰ ││
│ └─────────────────────────────────────┘│
│                                         │
│ Available abilities (drag to add):     │
│ ┌─────────────────────────────────────┐│
│ │ [⚡] Stormstrike                   ││
│ │ [⚡] Lightning Strike               ││
│ │ [⚡] Earth Shock                    ││
│ │ ...                                 ││
│ └─────────────────────────────────────┘│
│                                         │
│              [Cancel]  [Save]           │
└─────────────────────────────────────────┘
```

**Key Features:**
- Drag-and-drop using HTML5 Drag API
- Visual feedback during drag operations
- Ability to remove items from sequence
- Ability to add items from available list
- Order preservation
- Visual distinction between configured sequence and available abilities

**Data Structure:**
- Sequence stored as array of strings (ability/trinket keys)
- Example: `['naturalAlignmentCrystal', 'elementalMastery', 'flameShock', 'lightningShield']`

---

### 2. Simulator Integration

**Location:** `modules/shamanCombatSim.js`

**Changes Needed:**

#### A. Track Opener State
Add to `ShamanCombatSimulator` constructor:
```javascript
this.openerSequence = priorityConfig?.opener?.sequence || [];
this.openerEnabled = priorityConfig?.opener?.enabled === true;
this.openerIndex = 0; // Current position in opener sequence
this.openerComplete = false; // Flag to track if opener is done
```

#### B. Modify `executeRotation()` Method
Update the rotation execution logic:
```javascript
executeRotation() {
    // Priority 0: Refresh Searing Totem (doesn't use GCD)
    if (this.activeFireTotem !== 'searing') {
        this.dropSearingTotem();
    }

    // Skip if GCD is not ready
    if (!this.isGCDReady()) {
        return;
    }

    // Execute opener sequence if enabled and not complete
    if (this.openerEnabled && !this.openerComplete && this.openerIndex < this.openerSequence.length) {
        const openerKey = this.openerSequence[this.openerIndex];
        if (this.executeOpenerAbility(openerKey)) {
            this.openerIndex++;
            if (this.openerIndex >= this.openerSequence.length) {
                this.openerComplete = true;
            }
            return; // Opener ability executed, exit
        } else {
            // Opener ability couldn't execute (on cooldown, etc.)
            // Move to next opener ability or mark complete
            this.openerIndex++;
            if (this.openerIndex >= this.openerSequence.length) {
                this.openerComplete = true;
            }
            // Fall through to priority system if opener failed
        }
    }

    // If opener complete or disabled, use priority system
    if (this.openerComplete || !this.openerEnabled) {
        // Existing priority system logic...
        if (!this.priorityConfig) {
            this.executeHardcodedRotation();
            return;
        }
        // ... rest of priority system code
    }
}
```

#### C. Create `executeOpenerAbility()` Method
New method to handle opener ability execution:
```javascript
executeOpenerAbility(abilityKey) {
    switch (abilityKey) {
        case 'naturalAlignmentCrystal':
            return this.activateNaturalAlignmentCrystal();
        
        case 'elementalMastery':
            if (this.hasElementalMasteryTalent() && this.isAbilityReady('elementalMastery')) {
                this.activateElementalMastery();
                return true;
            }
            return false;
        
        case 'lightningShield':
        case 'lightningShieldCritical':
        case 'lightningShieldProactive':
            this.applyLightningShield();
            return true;
        
        case 'flameShock':
            if (this.isAbilityReady('shocks')) {
                this.castAbility('flameShock', 'Flame Shock');
                return true;
            }
            return false;
        
        case 'stormstrike':
            if (this.isAbilityReady('stormstrike')) {
                this.castAbility('stormstrike', 'Stormstrike');
                return true;
            }
            return false;
        
        case 'lightningStrike':
            if (this.isAbilityReady('lightningStrike') && this.lightningShieldCharges > 0) {
                this.castLightningStrike();
                return true;
            }
            return false;
        
        case 'earthShock':
            if (this.isAbilityReady('shocks')) {
                this.castAbility('earthShock', 'Earth Shock');
                return true;
            }
            return false;
        
        case 'fireNovaTotem':
            if (this.isAbilityReady('fireNovaTotem') && this.activeFireTotem !== 'fireNova') {
                this.dropFireNovaTotem();
                return true;
            }
            return false;
        
        default:
            return false;
    }
}
```

**Key Considerations:**
- Opener abilities should execute even if conditions aren't perfect (e.g., Lightning Strike without charges)
- Some abilities don't trigger GCD (Natural Alignment Crystal, Elemental Mastery)
- Need to handle cases where opener ability can't execute (cooldowns, etc.)
- Opener should complete even if some abilities fail

---

### 3. Ability/Trinket Mapping

**Location:** `modules/shamanDPS.js` (in `showOpenerConfigModal` function)

**Map of Available Items:**

```javascript
const openerItems = [
    // Trinkets/On-Use
    {
        key: 'naturalAlignmentCrystal',
        name: 'Natural Alignment Crystal',
        icon: 'https://database.turtlecraft.gg/images/icons/large/inv_trinket_naxxramas04.png', // Need actual icon
        type: 'trinket'
    },
    {
        key: 'elementalMastery',
        name: 'Elemental Mastery',
        icon: 'spell_nature_wispheal',
        type: 'ability'
    },
    
    // Abilities
    {
        key: 'lightningShield',
        name: 'Lightning Shield',
        icon: shamanSpells.lightningShield.icon,
        type: 'ability'
    },
    {
        key: 'lightningShieldCritical',
        name: 'Lightning Shield (Critical)',
        icon: shamanSpells.lightningShield.icon,
        type: 'ability'
    },
    {
        key: 'lightningShieldProactive',
        name: 'Lightning Shield (Proactive)',
        icon: shamanSpells.lightningShield.icon,
        type: 'ability'
    },
    {
        key: 'flameShock',
        name: 'Flame Shock',
        icon: shamanSpells.flameShock.icon,
        type: 'ability'
    },
    {
        key: 'stormstrike',
        name: 'Stormstrike',
        icon: shamanSpells.stormstrike.icon,
        type: 'ability'
    },
    {
        key: 'lightningStrike',
        name: 'Lightning Strike',
        icon: shamanSpells.lightningStrike.icon,
        type: 'ability'
    },
    {
        key: 'earthShock',
        name: 'Earth Shock',
        icon: shamanSpells.earthShock.icon,
        type: 'ability'
    },
    {
        key: 'fireNovaTotem',
        name: 'Fire Nova Totem',
        icon: shamanSpells.fireNovaTotem.icon,
        type: 'ability'
    }
];
```

---

## Implementation Order

1. **Create `showOpenerConfigModal` function**
   - Basic modal structure
   - Enable/disable toggle
   - List of available items
   - Save/Cancel handlers

2. **Implement drag-and-drop functionality**
   - HTML5 Drag API setup
   - Visual feedback
   - Sequence management

3. **Integrate with simulator**
   - Add opener state tracking
   - Modify `executeRotation()`
   - Create `executeOpenerAbility()`

4. **Testing & refinement**
   - Test opener execution
   - Test fallback to priority system
   - Test edge cases (failed abilities, empty sequence, etc.)

---

## Edge Cases & Considerations

1. **Opener ability fails to execute** (e.g., on cooldown)
   - Should we skip to next ability?
   - Should we wait for cooldown?
   - **Decision:** Skip to next ability, but log warning

2. **Opener sequence includes abilities with prerequisites**
   - Lightning Strike requires Lightning Shield charges
   - **Decision:** Execute anyway (user responsibility to sequence correctly)

3. **Opener sequence includes non-GCD abilities**
   - Natural Alignment Crystal, Elemental Mastery
   - **Decision:** Execute immediately without waiting for GCD

4. **Empty opener sequence**
   - **Decision:** Treat as disabled, use priority system

5. **Opener enabled but sequence is empty**
   - **Decision:** Treat as disabled, use priority system

6. **User changes opener mid-fight**
   - Not applicable (config loaded at start)
   - Opener executes once at fight start

---

## Files to Modify

1. **modules/shamanDPS.js**
   - Add `showOpenerConfigModal` function
   - Update `refreshPriorityList` to handle opener card updates
   - Ensure opener config is saved/loaded correctly

2. **modules/shamanCombatSim.js**
   - Add opener state tracking to constructor
   - Modify `executeRotation()` method
   - Add `executeOpenerAbility()` method
   - Initialize opener state in `simulate()` method

---

## Testing Checklist

- [ ] Opener modal opens and closes correctly
- [ ] Drag-and-drop reordering works
- [ ] Opener sequence saves correctly
- [ ] Opener executes at start of fight
- [ ] Priority system takes over after opener
- [ ] Empty sequence defaults to priority system
- [ ] Disabled opener defaults to priority system
- [ ] Opener with trinkets executes correctly
- [ ] Opener with abilities executes correctly
- [ ] Failed opener abilities are handled gracefully
- [ ] Opener completes even if some abilities fail


