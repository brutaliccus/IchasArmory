# Shaman DPS Simulation - Integration Guide

## Files Created

1. **modules/shamanSpells.js** - Spell database with all coefficients and modifiers
2. **modules/shamanTalents.js** - Talent system and ShamanStats class
3. **modules/shamanDamageCalc.js** - 6-step damage calculation engine
4. **modules/shamanDPS.js** - UI integration layer
5. **shaman-dps.css** - Styling for DPS display
6. **SHAMAN_DPS_INTEGRATION.md** - This file

## Integration Steps

### Step 1: Add CSS to index.html

Add this line in the `<head>` section of index.html:

```html
<link rel="stylesheet" href="shaman-dps.css">
```

### Step 2: Import the DPS module in app.js

Add this import at the top of app.js:

```javascript
import { updateDPSSimulation, initializeDPSSimulation } from './modules/shamanDPS.js';
```

### Step 3: Initialize DPS simulation container

Add this after the page loads (in the `window.addEventListener('load', ...)` section):

```javascript
// Initialize DPS simulation for shaman
if (getCurrentClass() === 'shaman') {
    initializeDPSSimulation();
}
```

### Step 4: Update DPS on calculator changes

In the `calculate()` or `displayMainResults()` function, add:

```javascript
// Update shaman DPS simulation
if (getCurrentClass() === 'shaman') {
    const talentBonuses = getTalentBonuses('shaman');
    const activeBuffs = getActiveBuffs(talentBonuses);
    updateDPSSimulation(totals, talentBonuses, activeBuffs);
}
```

### Step 5: Add HTML container (optional)

If you want to control placement, add this div somewhere in index.html:

```html
<div id="shaman-dps-simulation" class="dps-simulation-section"></div>
```

Otherwise, it will auto-create and append to `.container`.

## How It Works

### Data Flow

1. **Character State** → ShamanStats object
   - Reads spell power, attack power, crit, hit from totals
   - Maps talents from `getTalentBonuses()`
   - Maps buffs from `getActiveBuffs()`

2. **ShamanStats** → Damage Calculator
   - Each spell is calculated independently
   - 6-step formula applied:
     1. Base + (SP × coeff) + (AP × coeff)
     2. Apply damage modifiers (talents/buffs)
     3. Apply spell hit (17% base miss, 99% cap)
     4. Apply crit (1.5x base, 2x with Elemental Fury)
     5. Apply resistance
     6. Divide by interval for DPS

3. **Results** → UI Display
   - Shows all spells with icons
   - Displays damage range
   - Shows DPS and cast/cooldown interval
   - Sorted by DPS (highest first)

### Talent Mapping

The system needs to map talent names from `getTalentBonuses()` to the shaman modifier system. Current mappings in `shamanDPS.js`:

- `concussion` → Concussion talent (5 ranks)
- `callOfFlame` → Call of Flame (3 ranks)
- `elementalFury` → Elemental Fury (boolean)
- `elementalWeapons` → Elemental Weapons (2 ranks)
- `improvedFireTotems` → Improved Fire Totems (2 ranks)
- `reverberation` → Reverberation (5 ranks)
- `stableShields` → Stable Shields (boolean)
- `t2ThreePiece` → T2 3-piece bonus (boolean)

**TODO**: Verify these talent names match what `getTalentBonuses('shaman')` actually returns. You may need to adjust the mapping.

### Buff Detection

The system looks for these buff names (case-insensitive):
- `stormstrike` → Applies Stormstrike buff (+25% nature, 2 charges)
- `flametongue` → Marks Flametongue active (required for Elemental Weapons)
- `curse of elements` or `curse of shadow` → +10% elemental damage
- `scorch` or `fire vulnerability` → +15% fire damage
- `nightfall` or `spell vulnerability` → +15% spell damage

## Testing

### Test the Example Calculation

Run this in browser console:

```javascript
import { testEmpoweredLSExample } from './modules/shamanDamageCalc.js';
testEmpoweredLSExample();
```

Expected output:
- **Expected DPS**: ~107.11 (964.03 damage / 9s)
- Should match or be very close

### Manual Testing

1. Select Shaman class
2. Add spell power and attack power via gear
3. Select relevant talents (Concussion, Elemental Fury, etc.)
4. Activate buffs (Stormstrike, Nightfall, etc.)
5. Check DPS simulation display updates
6. Verify damage calculations make sense

## Spell Data Reference

| Spell | SP Coeff | AP Coeff | Base Damage | Interval |
|-------|----------|----------|-------------|----------|
| Earth Shock | 38.6% | 10% | 492-521 | 6s (5s with Reverb) |
| Flame Shock | 14.95% | 6% | 293 | 15s |
| Flame Shock DoT | 13%/tick | 1.5%/tick | 82×5 | 15s duration |
| Lightning Shield | 27% | 0% | 198 | 3s ICD (4s with Stable) |
| Empowered LS | 27% | 25% | 198 | 9s (8.5s with T2 3pc) |
| Searing Totem | 10% | 0% | 40-55 | 2s (1.6s with Imp Fire) |
| Magma Totem | 3.33% | 0% | 75 | 2s tick |
| Fire Nova Totem | 15% | 0% | 413-459 | 4s delay (2s with Imp Fire) |

## Next Steps

1. **Integration**: Follow steps above to integrate into app.js
2. **Talent Verification**: Verify talent name mappings match actual talent system
3. **Testing**: Test with the provided example (500 SP, 1500 AP, etc.)
4. **Buff System**: Ensure buff detection works with actual buff names
5. **UI Tweaks**: Adjust styling and layout as needed
6. **Rotation System**: Add ability rotation/priority system (future phase)

## Known Limitations

- **Stormstrike charges**: Currently simplified - doesn't track complex charge consumption across multiple spells in a rotation
- **Weapon damage**: Lightning Strike weapon damage component not fully implemented
- **Resistance values**: Currently hardcoded to 0, needs UI control
- **Target level**: Currently hardcoded to 63, needs UI control
- **Rotation**: No rotation/priority system yet - just shows individual spell damage

## Future Enhancements

1. **Rotation Simulator**: Add ability to simulate actual spell rotations over time
2. **DPS Timeline**: Show DPS over 30s/1min/5min fight durations
3. **Buff Uptime**: Track buff uptimes and their impact
4. **Comparison Mode**: Compare different talent builds or gear sets
5. **Export Results**: Export simulation results to CSV or share link
