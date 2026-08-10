# Ability System

## Overview

The Ability System manages spell casting, cooldowns, GCD (Global Cooldown) tracking, and mana costs. It provides the foundation for rotation logic and ability prioritization.

## File: `abilitySystem.js`

## Constants

### `AbilityState`

Enum for ability ready states:

```javascript
AbilityState = {
    READY: 'ready',           // Can be used immediately
    ON_COOLDOWN: 'on_cooldown', // Specific ability on CD
    ON_GCD: 'on_gcd',         // Global cooldown active
    NO_MANA: 'no_mana',       // Insufficient mana
    CASTING: 'casting',        // Currently casting
    CHANNELING: 'channeling'   // Currently channeling
}
```

### `GCD_CONFIG`

GCD configuration constants:

```javascript
GCD_CONFIG = {
    BASE_GCD: 1.5,    // Base GCD in seconds
    MIN_GCD: 1.0,     // Minimum GCD (with haste)
    MELEE_GCD: 1.5    // Melee GCD (not affected by spell haste)
}
```

## Functions

### `calculateGcd(hastePercent = 0, isMelee = false)`

Calculate effective GCD with haste.

**Parameters:**
- `hastePercent` (number) - Haste as decimal (0.10 = 10% haste)
- `isMelee` (boolean) - Whether this is a melee ability

**Returns:** `number` - Effective GCD in seconds

**Logic:**
- Melee abilities always use 1.5s GCD
- Spell GCD reduced by haste, minimum 1.0s

**Example:**
```javascript
const gcd = calculateGcd(0.15, false);  // 15% haste, spell
// Returns: 1.304 (1.5 / 1.15)

const meleeGcd = calculateGcd(0.15, true);  // 15% haste, melee
// Returns: 1.5 (not affected by spell haste)
```

### `calculateCastTime(baseCastTime, hastePercent = 0, castTimeReduction = 0)`

Calculate effective cast time with haste and talent reductions.

**Parameters:**
- `baseCastTime` (number) - Base cast time in seconds
- `hastePercent` (number) - Haste as decimal
- `castTimeReduction` (number) - Flat reduction from talents (seconds)

**Returns:** `number` - Effective cast time in seconds

**Logic:**
1. Apply talent reduction first (e.g., Lightning Mastery)
2. Then apply haste

**Example:**
```javascript
// Lightning Bolt: 3.0s base, 0.5s Lightning Mastery, 10% haste
const castTime = calculateCastTime(3.0, 0.10, 0.5);
// Step 1: 3.0 - 0.5 = 2.5s
// Step 2: 2.5 / 1.10 = 2.27s
```

## Class: `AbilitySystem`

### Constructor

```javascript
const abilitySystem = new AbilitySystem({
    getCurrentTime: () => currentTime,  // Time provider
    spells: shamanSpells,               // Spell definitions
    stats: characterStats               // Character stats
});
```

### Methods

#### `initializeMana(maxMana)`

Initialize the mana pool.

**Parameters:**
- `maxMana` (number) - Maximum mana

**Example:**
```javascript
abilitySystem.initializeMana(5000);
```

#### `isAbilityReady(spellName)`

Check if an ability is ready to use.

**Parameters:**
- `spellName` (string) - Name of the spell

**Returns:** `{ready: boolean, reason: string}`

**Example:**
```javascript
const { ready, reason } = abilitySystem.isAbilityReady('Lightning Bolt');
if (!ready) {
    console.log(`Cannot cast: ${reason}`);
}
```

#### `getManaCost(spell)`

Get the mana cost of a spell including modifiers.

**Parameters:**
- `spell` (Object) - Spell definition

**Returns:** `number` - Mana cost

#### `startCast(spellName)`

Start casting a spell.

**Parameters:**
- `spellName` (string) - Name of the spell

**Returns:** `boolean` - True if cast started successfully

**Side effects:**
- Deducts mana
- Sets casting state (if cast time > 0)
- Triggers GCD
- Sets spell cooldown

**Example:**
```javascript
if (abilitySystem.startCast('Lightning Bolt')) {
    // Cast started, schedule completion event
    scheduleEvent(currentTime + castTime, 'castComplete', onCastComplete);
}
```

#### `completeCast()`

Complete the current cast.

**Returns:** `Object|null` - The completed spell or null if not casting

**Example:**
```javascript
// In cast complete handler
const spell = abilitySystem.completeCast();
if (spell) {
    // Apply spell effects
    dealSpellDamage(spell);
}
```

#### `getCastTimeReduction(spell)`

Get cast time reduction from talents for a spell.

**Parameters:**
- `spell` (Object) - Spell definition

**Returns:** `number` - Reduction in seconds

**Note:** This is a stub that returns 0. The actual reduction is handled in the main simulator based on talents.

#### `addMana(amount)`

Add mana (from regeneration, procs, etc.).

**Parameters:**
- `amount` (number) - Mana to add

**Returns:** `number` - Actual mana gained (capped at max)

**Example:**
```javascript
const gained = abilitySystem.addMana(100);
console.log(`Restored ${gained} mana`);
```

#### `getRemainingCooldown(spellName)`

Get remaining cooldown for an ability.

**Parameters:**
- `spellName` (string) - Name of the spell

**Returns:** `number` - Remaining cooldown in seconds (0 if ready)

#### `getGcdRemaining()`

Get time until GCD is ready.

**Returns:** `number` - Time in seconds

#### `reset()`

Reset the ability system for a new simulation.

## Adding a New Ability

### Step 1: Define the Spell (in shamanSpells.js)

```javascript
export const shamanSpells = {
    // ... existing spells
    'My New Spell': {
        name: 'My New Spell',
        manaCost: 200,
        castTime: 2.0,        // Cast time in seconds (0 for instant)
        cooldown: 6,          // Cooldown in seconds
        triggersGcd: true,    // Whether it triggers GCD
        isMelee: false,       // Melee or spell
        school: 'nature',     // Damage school
        // ... other properties
    }
};
```

### Step 2: Use in Rotation Logic

```javascript
function chooseNextAbility() {
    const { ready, reason } = abilitySystem.isAbilityReady('My New Spell');
    
    if (ready && shouldUseNewSpell()) {
        return 'My New Spell';
    }
    
    // Fall back to other abilities
    return getDefaultAbility();
}
```

### Step 3: Handle Cast Completion

```javascript
function onCastComplete(spell) {
    if (spell.name === 'My New Spell') {
        // Apply spell-specific effects
        applyMyNewSpellEffect();
    }
}
```

## Usage Example

```javascript
import { AbilitySystem, calculateGcd, AbilityState } from './sim/abilitySystem.js';
import { shamanSpells } from '../shamanSpells.js';

let currentTime = 0;

const abilitySystem = new AbilitySystem({
    getCurrentTime: () => currentTime,
    spells: shamanSpells,
    stats: { spellHaste: 0.10 }
});

// Initialize mana
abilitySystem.initializeMana(5000);

// Main loop
while (currentTime < fightDuration) {
    // Find next ability to use
    for (const spellName of rotationPriority) {
        const { ready, reason } = abilitySystem.isAbilityReady(spellName);
        
        if (ready) {
            if (abilitySystem.startCast(spellName)) {
                const spell = shamanSpells[spellName];
                
                if (spell.castTime > 0) {
                    // Wait for cast
                    currentTime += calculateCastTime(
                        spell.castTime,
                        stats.spellHaste
                    );
                    abilitySystem.completeCast();
                }
                
                // Deal damage
                dealDamage(spell);
                break;
            }
        }
    }
    
    // Advance time
    currentTime += 0.1;
}
```

## Cooldown Mechanics

### Individual Cooldowns
Each spell can have its own cooldown:
```javascript
{ cooldown: 6 }  // 6 second cooldown
```

### Shared Cooldowns
Implemented at the spell level:
```javascript
// Fire Shock and Frost Shock share a cooldown
'Fire Shock': { sharedCooldownGroup: 'shock', cooldown: 6 }
'Frost Shock': { sharedCooldownGroup: 'shock', cooldown: 6 }
```

### GCD
- Triggered by `spell.triggersGcd !== false`
- Calculated by `calculateGcd()`
- Melee GCD not affected by spell haste
