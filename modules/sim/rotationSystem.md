# Rotation System Module

## Overview

The `rotationSystem.js` module handles ability rotation execution, priority-based decision making, and opener sequence management. It centralizes all rotation logic that was previously scattered throughout the simulator.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     rotationSystem.js                       │
├─────────────────────────────────────────────────────────────┤
│  Constants                                                  │
│    ├─ NO_GCD_ABILITIES                                     │
│    ├─ COOLDOWN_MAP                                         │
│    ├─ TRINKETS_AND_COOLDOWNS                               │
│    ├─ DEFAULT_ROTATION_PRIORITY                            │
│    └─ OPENER_HANDLERS                                      │
├─────────────────────────────────────────────────────────────┤
│  Helper Functions                                           │
│    ├─ abilityUsesGCD(abilityKey)                           │
│    ├─ getAbilityCooldownRemaining(ctx, abilityKey)         │
│    ├─ shouldDelayForHigherPriority(ctx, ...)               │
│    ├─ getSortedAbilities(priorityConfig)                   │
│    ├─ checkAbilityConditions(ctx, abilityKey)              │
│    ├─ checkLightningShieldConditions(ctx, rules)           │
│    ├─ checkFlameShockStatus(ctx)                           │
│    └─ allRotationalOnCooldown(ctx)                         │
├─────────────────────────────────────────────────────────────┤
│  Main Execution                                             │
│    ├─ executeRotation(ctx)                                 │
│    ├─ executePriorityRotation(ctx)                         │
│    ├─ executeHardcodedRotation(ctx)                        │
│    └─ tryExecuteAbility(ctx, abilityKey, config)           │
├─────────────────────────────────────────────────────────────┤
│  Opener System                                              │
│    ├─ openerItemUsesGCD(itemKey)                           │
│    ├─ tryExecuteOpenerItem(ctx, itemKey)                   │
│    └─ executeOpenerSequence(ctx, openerSequence)           │
└─────────────────────────────────────────────────────────────┘
```

## Rotation Flow

```
executeRotation(ctx)
       │
       ├─► Has priorityConfig?
       │         │
       │    Yes  │  No
       │         ▼
       │    executeHardcodedRotation(ctx)
       │         │
       ▼         │
executePriorityRotation(ctx)
       │
       ▼
for each ability in priority order:
       │
       ▼
tryExecuteAbility(ctx, key, config)
       │
       ├─► Check conditions (rules)
       ├─► Check cooldowns
       ├─► Execute if ready
       │
       ▼
{ executed: true/false, ability: key }
```

## Usage

### Basic Rotation Execution

```javascript
import { executeRotation } from './rotationSystem.js';

// During simulation loop
while (currentTime < fightDuration) {
    // Process next GCD
    if (ctx.isGCDReady()) {
        const result = executeRotation(ctx);
        if (result.executed) {
            console.log(`Used: ${result.ability}`);
        }
    }
    
    // Advance time...
}
```

### Opener Sequence

```javascript
import { executeOpenerSequence } from './rotationSystem.js';

const openerSequence = [
    'naturalAlignmentCrystal',  // No GCD
    'elementalMastery',         // No GCD  
    'flameShock',               // GCD
    'stormstrike',              // GCD
    'lightningStrike'           // GCD
];

// Execute at fight start
executeOpenerSequence(ctx, openerSequence);
```

## API Reference

### Constants

#### `NO_GCD_ABILITIES`
Abilities that don't trigger GCD:
```javascript
['naturalAlignmentCrystal', 'shardOfTheFallenStar', 'eyeOfDiminution', 
 'kissOfTheSpider', 'elementalMastery', 'lightningShield', 
 'lightningShieldCritical', 'lightningShieldProactive']
```

#### `COOLDOWN_MAP`
Maps ability keys to cooldown tracking keys:
```javascript
{
    flameShock: 'shocks',
    earthShock: 'shocks',
    frostShock: 'shocks',
    // ... others use same key as ability
}
```

#### `TRINKETS_AND_COOLDOWNS`
On-use trinkets that have cooldowns:
```javascript
['naturalAlignmentCrystal', 'shardOfTheFallenStar', 
 'eyeOfDiminution', 'kissOfTheSpider', 'elementalMastery', 'bloodlust']
```

#### `DEFAULT_ROTATION_PRIORITY`
Hardcoded priority when no config provided:
```javascript
['lightningShieldCritical', 'flameShockRefresh', 'stormstrike',
 'lightningStrike', 'earthShock', 'lightningShieldLow', 'fireNovaTotem']
```

#### `OPENER_HANDLERS`
Map of opener items to their handlers:
```javascript
{
    naturalAlignmentCrystal: {
        usesGCD: false,
        check: (ctx) => ctx.hasNaturalAlignmentCrystal(),
        execute: (ctx) => ctx.activateNaturalAlignmentCrystal()
    },
    // ... other handlers
}
```

### Helper Functions

#### `abilityUsesGCD(abilityKey)`
Returns whether an ability triggers the global cooldown.

#### `getAbilityCooldownRemaining(ctx, abilityKey)`
Returns seconds until ability is ready.

#### `shouldDelayForHigherPriority(ctx, currentKey, currentConfig, windowSeconds)`
Checks if a higher-priority ability will be ready within `windowSeconds`.

#### `getSortedAbilities(priorityConfig)`
Returns abilities sorted by priority (lower number = higher priority).

**Returns:** `[{ key: 'stormstrike', config: {...}, priority: 1 }, ...]`

#### `checkAbilityConditions(ctx, abilityKey)`
Checks basic conditions for an ability (equipped, talented, etc.).

#### `checkLightningShieldConditions(ctx, rules)`
Checks Lightning Shield-specific conditions.

**Returns:**
```javascript
{
    critical: true,    // 0 charges AND LS ready soon
    low: true,         // At or below threshold
    charges: 2         // Current charges
}
```

#### `checkFlameShockStatus(ctx)`
Returns Flame Shock DoT status.

**Returns:**
```javascript
{
    timeRemaining: 5.2,   // Seconds until expiry
    isActive: true,       // Whether DoT is ticking
    needsRefresh: false   // Below refresh threshold
}
```

#### `allRotationalOnCooldown(ctx)`
Returns `true` if all rotational abilities (SS, LS, shocks) are on cooldown.

### Main Execution

#### `executeRotation(ctx)`
Main entry point for rotation execution. Uses priority config if available, otherwise falls back to hardcoded rotation.

**Returns:**
```javascript
{
    executed: true,
    ability: 'stormstrike'
}
// or
{
    executed: false,
    reason: 'gcd_not_ready' | 'all_on_cooldown'
}
```

#### `executePriorityRotation(ctx)`
Executes rotation based on `ctx.priorityConfig`.

#### `executeHardcodedRotation(ctx)`
Executes default rotation without config.

#### `tryExecuteAbility(ctx, abilityKey, config)`
Attempts to execute a specific ability with its configuration rules.

**Parameters:**
- `abilityKey` - Ability identifier
- `config` - Priority config for this ability with rules

**Config Rules (examples):**
```javascript
{
    priority: 3,
    enabled: true,
    rules: {
        // Common rules
        useAfterFightTime: 5,        // Wait N seconds before using
        delayIfHigherPriorityReadyIn: 1.5,  // Delay window
        
        // Stormstrike rules
        delayWhenFlameShockExpiring: 2,     // Don't clip FS
        
        // Lightning Strike rules
        requireLightningShield: true,
        requireStormstrikeBuff: false,
        minStormstrikeCooldown: 0,
        
        // Earth Shock rules
        requireStormstrikeBuff: false,
        
        // Fire Nova rules
        onlyWhenAllOnCD: true,
        
        // Lightning Shield rules
        triggerWhenCharges: 3,      // Refresh threshold
        
        // Elemental Mastery rules
        useBeforeFlameShock: true
    }
}
```

### Opener System

#### `openerItemUsesGCD(itemKey)`
Returns whether an opener item triggers GCD.

#### `tryExecuteOpenerItem(ctx, itemKey)`
Attempts to execute an opener item.

**Returns:** `true` if executed, `false` if conditions not met.

#### `executeOpenerSequence(ctx, openerSequence)`
Executes a complete opener sequence.

**Parameters:**
- `openerSequence` - Array of ability keys in order

**Returns:**
```javascript
{
    executed: true,
    results: [
        { itemKey: 'naturalAlignmentCrystal', executed: true },
        { itemKey: 'flameShock', executed: true },
        // ...
    ]
}
```

## Ability Execution Details

### Lightning Shield Critical
Triggers when:
- Charges = 0
- Lightning Strike is ready or will be ready within 1.5s

### Flame Shock
Triggers when:
- DoT time remaining <= `reapplyTiming` (default: 0)
- Shocks not on cooldown
- Optionally uses Elemental Mastery first

### Stormstrike
Triggers when:
- Off cooldown
- Not delaying for Flame Shock (optional rule)

### Lightning Strike
Triggers when:
- Off cooldown
- Has Lightning Shield charges (if required)
- Stormstrike buff active (if required)

### Earth Shock
Triggers when:
- Shocks off cooldown
- Stormstrike buff conditions met (if required)

### Fire Nova Totem
Triggers when:
- Off cooldown
- All rotational abilities on CD (if rule enabled)

### Trinkets/Cooldowns
Triggers when:
- Equipped and off cooldown
- Fight time >= `useAfterFightTime` (if set)

## Priority Configuration Schema

```javascript
{
    stormstrike: {
        priority: 1,
        enabled: true,
        rules: {
            delayWhenFlameShockExpiring: 0
        }
    },
    lightningStrike: {
        priority: 2,
        enabled: true,
        rules: {
            requireLightningShield: true
        }
    },
    flameShock: {
        priority: 3,
        enabled: true,
        rules: {
            reapplyTiming: 0
        }
    },
    // ... other abilities
}
```

## Integration with Simulator

The rotation system expects these methods on `ctx`:
- `isGCDReady()` - Check if GCD is ready
- `isAbilityReady(key)` - Check if ability is off cooldown
- `castAbility(key, name)` - Cast an ability
- `castLightningStrike()` - Cast Lightning Strike
- `dropFireNovaTotem()` - Drop Fire Nova Totem
- `applyLightningShield()` - Refresh Lightning Shield
- `getLightningShieldCharges()` - Get current charges
- `activateElementalMastery()` - Activate EM talent
- `activateBloodlust()` - Activate Bloodlust
- `triggerGCD()` - Trigger global cooldown
- `setCooldown(key, duration)` - Set ability cooldown
- `hasElementalMasteryTalent()` - Check if EM talented
- `hasBloodlustTalent()` - Check if BL talented

## Version History

- **v1.0.0** (2026-01-25): Initial implementation with helpers and opener handlers
- **v1.6.0** (2026-01-26): Added full rotation execution
  - `executeRotation()` main entry point
  - `executePriorityRotation()` for config-based rotation
  - `executeHardcodedRotation()` fallback
  - `tryExecuteAbility()` with full rule support
  - `executeOpenerSequence()` for opener execution
  - All ability-specific execution handlers
