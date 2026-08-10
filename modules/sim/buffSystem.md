# Buff System

## Overview

The Buff System tracks buff activations, expirations, refreshes, and calculates uptime statistics. It supports detailed tracking for timeline visualization and minimal tracking for performance-critical simulations.

## File: `buffSystem.js`

## Constants

### `TRACKED_BUFFS`

Array of all buff names tracked by the system:

```javascript
TRACKED_BUFFS = [
    'flurry',
    'elementalDevastation',
    'stormstrike',
    'naturalAlignmentCrystal',
    'elementalMastery',
    'lightningShield',
    'crusader',
    'wrathOfCenarius',
    'eyeOfDiminution',
    'kissOfTheSpider',
    'stonebreaker',
    'nightfall',
    'hemorrhage',
    'echoedThunder',
    'instantLightningBolt',
    'stormwolfFrenzy',
    'bloodlust',
    'badgeOfTheSwarmguard',
    'ornateBloodstoneDagger',
    'bladeOfEternalDarkness',
    'elementalFocus',
    'dragonbreathChili'
]
```

### `DEFAULT_BUFF_CONFIG`

Default structure for buff tracking:

```javascript
DEFAULT_BUFF_CONFIG = {
    activationTimes: [],  // Array of activation records
    totalUptime: 0,       // Calculated uptime in seconds
    procs: 0,             // Number of times buff activated
    refreshes: 0          // Number of times buff was refreshed
}
```

## Functions

### `createBuffTracker(options = {})`

Create a fresh buff tracking object.

**Parameters:**
- `options` (Object) - Additional options to merge

**Returns:** Buff tracker object

### `createMinimalBuffTracker()`

Create a minimal buff tracker for quickSim mode (better performance).

**Returns:** Minimal buff tracker object

### `createAllBuffTrackers(quickSim = false)`

Create trackers for all known buffs.

**Parameters:**
- `quickSim` (boolean) - Use minimal tracking

**Returns:** Object with all buff trackers

## Class: `BuffSystem`

### Constructor

```javascript
const buffSystem = new BuffSystem({
    quickSim: false,                    // Use detailed tracking
    getCurrentTime: () => currentTime   // Time provider function
});
```

### Methods

#### `activateBuff(buffName, options)`

Activate a buff and record the activation.

**Parameters:**
- `buffName` (string) - Name of the buff (from TRACKED_BUFFS)
- `options` (Object):
  - `duration` (number) - Duration in seconds
  - `triggerSource` (string) - What triggered this buff
  - `triggerIcon` (string) - Icon URL for the trigger
  - `stacks` (number) - Number of stacks (default 1)

**Returns:** Activation record object or null (if quickSim)

**Example:**
```javascript
buffSystem.activateBuff('flurry', {
    duration: 15,
    triggerSource: 'Auto Attack Crit',
    triggerIcon: 'spell_nature_flurry.png'
});
```

#### `refreshBuff(buffName, options)`

Refresh an active buff, extending its duration.

**Parameters:**
- `buffName` (string) - Name of the buff
- `options` (Object):
  - `newDuration` (number) - New duration from current time
  - `triggerSource` (string) - What triggered the refresh
  - `triggerIcon` (string) - Icon URL

**Returns:** `boolean` - True if refresh was recorded

**Important:** This correctly updates the `duration` field to reflect the total duration including refreshes.

**Example:**
```javascript
// Buff was activated at t=5 for 10 seconds (ends at t=15)
// At t=12, we refresh for 10 more seconds
buffSystem.refreshBuff('wrathOfCenarius', {
    newDuration: 10,           // New duration from current time
    triggerSource: 'Earth Shock'
});
// Buff now ends at t=22, duration = 17 seconds (22-5)
```

#### `deactivateBuff(buffName, endTime = null)`

Deactivate a buff (marks it as ended).

**Parameters:**
- `buffName` (string) - Name of the buff
- `endTime` (number, optional) - End time (defaults to current time)

#### `isBuffActive(buffName)`

Check if a buff is currently active.

**Parameters:**
- `buffName` (string) - Name of the buff

**Returns:** `boolean`

#### `getLastActivation(buffName)`

Get the last activation record for a buff.

**Parameters:**
- `buffName` (string) - Name of the buff

**Returns:** Activation record or null

**Activation record structure:**
```javascript
{
    start: number,           // Start time
    end: number,             // End time
    duration: number,        // Duration (end - start)
    triggerSource: string,   // What triggered it
    triggerIcon: string,     // Icon URL
    stacks: number,          // Stack count
    refreshes: [             // Array of refresh events
        {
            time: number,
            triggerSource: string,
            triggerIcon: string,
            newEndTime: number
        }
    ]
}
```

#### `calculateUptime(buffName, fightDuration)`

Calculate total uptime for a buff.

**Parameters:**
- `buffName` (string) - Name of the buff
- `fightDuration` (number) - Total fight duration

**Returns:** `number` - Uptime in seconds

#### `calculateUptimePercent(buffName, fightDuration)`

Calculate uptime percentage for a buff.

**Parameters:**
- `buffName` (string) - Name of the buff
- `fightDuration` (number) - Total fight duration

**Returns:** `number` - Uptime percentage (0-100)

#### `getAllBuffData()`

Get all buff tracking data.

**Returns:** Object with all buff trackers

#### `reset()`

Reset all buff tracking for a new simulation.

#### `getSummary(fightDuration)`

Get summary statistics for all buffs that procced.

**Parameters:**
- `fightDuration` (number) - Total fight duration

**Returns:** Object with summary for each buff

## Adding a New Buff

### Step 1: Add to TRACKED_BUFFS

In `buffSystem.js`:
```javascript
export const TRACKED_BUFFS = [
    // ... existing buffs
    'myNewBuff'
];
```

### Step 2: Use in Simulator

In your simulation code:
```javascript
// When buff activates
buffSystem.activateBuff('myNewBuff', {
    duration: 10,
    triggerSource: 'Some Ability',
    triggerIcon: 'my_icon.png'
});

// When buff refreshes
buffSystem.refreshBuff('myNewBuff', {
    newDuration: 10,
    triggerSource: 'Another Ability'
});

// When buff expires (if manually tracking)
buffSystem.deactivateBuff('myNewBuff');
```

### Step 3: Special Tracking (Optional)

For buffs with special properties (like elementalFocus with charges):
```javascript
// In createAllBuffTrackers
if (!quickSim) {
    trackers.myNewBuff.specialProperty = 0;
}
```

## Usage Example

```javascript
import { BuffSystem, TRACKED_BUFFS } from './sim/buffSystem.js';

let currentTime = 0;
const buffSystem = new BuffSystem({
    quickSim: false,
    getCurrentTime: () => currentTime
});

// Simulate buff activation at t=0
currentTime = 0;
buffSystem.activateBuff('flurry', {
    duration: 15,
    triggerSource: 'Auto Attack'
});

// Simulate refresh at t=10
currentTime = 10;
buffSystem.refreshBuff('flurry', {
    newDuration: 15,
    triggerSource: 'Stormstrike'
});

// Get results at end of fight
const fightDuration = 120;
const uptime = buffSystem.calculateUptime('flurry', fightDuration);
const uptimePercent = buffSystem.calculateUptimePercent('flurry', fightDuration);

console.log(`Flurry uptime: ${uptime}s (${uptimePercent.toFixed(1)}%)`);
```

## Performance Considerations

- In `quickSim` mode, detailed activation tracking is skipped
- `shouldTrackUptime()` returns false in quickSim mode
- Use quickSim for stat weight calculations where timeline data isn't needed

---

# Talent Buff System (v1.6.0)

The buff system also includes a data-driven talent buff subsystem for handling talent-based abilities like Elemental Mastery and Bloodlust.

## Talent Buff Definitions

### `TALENT_BUFF_DEFINITIONS`

```javascript
TALENT_BUFF_DEFINITIONS = {
    elementalMastery: {
        id: 'elementalMastery',
        name: 'Elemental Mastery',
        duration: 15,
        cooldown: 180,     // 3 minutes
        effect: {
            type: 'spellDamagePercent',
            value: 0.15,   // +15% Fire/Frost/Nature
            schools: ['fire', 'frost', 'nature']
        },
        triggersGCD: false,
        fromTalent: true,
        talentId: 'elemental_mastery'
    },
    bloodlust: {
        id: 'bloodlust',
        name: 'Bloodlust',
        duration: 30,
        cooldown: 360,     // 6 minutes
        effect: {
            type: 'hastePercent',
            value: 0.20    // +20% attack speed
        },
        triggersGCD: true,
        fromTalent: true,
        talentId: 'bloodlust'
    }
}
```

## Talent Buff Functions

### State Management

#### `initializeTalentBuffStates(ctx)`
Initializes talent buff state storage on the simulation context.

#### `getTalentBuffState(ctx, buffId)`
Returns the current state for a talent buff.

**Returns:**
```javascript
{
    cooldownReady: 0,      // Time when cooldown ends
    buffExpires: 0,        // Time when buff expires
    isActive: false,       // Whether buff is active
    activationCount: 0     // Number of activations
}
```

#### `getTalentBuffDefinition(buffId)`
Returns the talent buff definition.

### Availability Checks

#### `hasTalentBuff(ctx, buffId)`
Checks if the talent is learned. Checks `simContext`, `stats.talentBonuses`, and helper methods.

#### `isTalentBuffReady(ctx, buffId)`
Returns `true` if talent is learned AND off cooldown.

#### `isTalentBuffActive(ctx, buffId)`
Returns `true` if the buff is currently active.

#### `getTalentBuffCooldownRemaining(ctx, buffId)`
Returns seconds until ready (0 if ready).

### Activation

#### `activateTalentBuff(ctx, buffId)`
Activates a talent buff.

**Returns:**
```javascript
{
    success: true
}
// or
{
    success: false,
    reason: 'talent_not_learned' | 'on_cooldown' | 'unknown_buff'
}
```

**Side Effects:**
- Sets `ctx.stats.activeModifiers[buffId] = true`
- Records activation in `ctx.buffUptime`
- Schedules expiration via `ctx.scheduleEvent()`
- Sets legacy fields (e.g., `ctx.elementalMasteryExpires`)

### Multiplier Helpers

#### `getTalentBuffHasteMultiplier(ctx)`
Returns combined haste multiplier from active talent buffs.

```javascript
// Example: Bloodlust active
getTalentBuffHasteMultiplier(ctx); // Returns 1.20
```

#### `getTalentBuffSpellDamageMultiplier(ctx, school)`
Returns spell damage multiplier for a specific school.

```javascript
// Example: Elemental Mastery active
getTalentBuffSpellDamageMultiplier(ctx, 'fire');   // Returns 1.15
getTalentBuffSpellDamageMultiplier(ctx, 'shadow'); // Returns 1.0 (not affected)
getTalentBuffSpellDamageMultiplier(ctx);           // Returns 1.15 (any school)
```

## Talent Buff Usage Example

```javascript
import { 
    initializeTalentBuffStates,
    hasTalentBuff,
    isTalentBuffReady,
    activateTalentBuff,
    getTalentBuffSpellDamageMultiplier
} from './buffSystem.js';

// Initialize at sim start
initializeTalentBuffStates(ctx);

// Check if EM is available
if (hasTalentBuff(ctx, 'elementalMastery') && isTalentBuffReady(ctx, 'elementalMastery')) {
    const result = activateTalentBuff(ctx, 'elementalMastery');
    if (result.success) {
        console.log('Elemental Mastery activated!');
    }
}

// Later: Get damage multiplier for fire spell
const fireMultiplier = getTalentBuffSpellDamageMultiplier(ctx, 'fire');
const damage = baseDamage * fireMultiplier;
```

## Legacy Compatibility

The talent buff system maintains backward compatibility:

```javascript
// When Elemental Mastery activates:
ctx.stats.activeModifiers.elementalMastery = true;
ctx.elementalMasteryExpires = buffExpires;
ctx.cooldowns.elementalMastery = cooldownReady;

// When Bloodlust activates:
ctx.stats.activeModifiers.bloodlust = true;
ctx.bloodlustActive = true;
ctx.bloodlustExpires = buffExpires;
ctx.bloodlustCooldown = cooldownReady;
```

## Integration with Event System

Talent buff expirations are scheduled via the EventSystem:

```javascript
ctx.scheduleEvent(buffExpires, 'buffExpire', () => {
    handleTalentBuffExpiration(ctx, buffId);
}, `${buffId}Expire`);
```

The expiration handler:
1. Sets `state.isActive = false`
2. Clears `ctx.stats.activeModifiers[buffId]`
3. Clears legacy fields
4. Logs expiration

## Version History

- **v1.0.0**: Initial BuffSystem implementation
- **v1.6.0** (2026-01-26): Added talent buff subsystem
  - `TALENT_BUFF_DEFINITIONS` for Elemental Mastery and Bloodlust
  - State management functions
  - Activation with expiration scheduling
  - Multiplier helper functions
  - Legacy field compatibility
