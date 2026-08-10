# modules/tank/tankSimulator.js - Tank Combat Simulation Engine

## Overview

`modules/tank/tankSimulator.js` is the core tank simulation engine for IchaCalc. It provides realistic Monte Carlo-based combat simulations that model tank survivability against raid bosses, including complex mechanics like parry haste, proc tracking, attack table calculations, and stat weight generation for gear optimization.

**File Size:** 1,847 lines of code
**Type:** ES6 Module
**Primary Use:** Tank survivability analysis and gear optimization
**Simulation Type:** Time-based Monte Carlo with iterative averaging

---

## Key Features

1. **Time-Based Combat Simulation** - Event-driven simulation with boss and player attack timing
2. **Attack Table Mechanics** - Full WoW Classic attack table (miss, dodge, parry, block, crit, crush, hit)
3. **Parry Haste Simulation** - Models boss parry haste mechanic (40% swing timer reduction)
4. **Proc System Integration** - Tracks defensive procs (Holy Shield, Redoubt, trinkets, talents, buffs)
5. **Multiple Iterations** - Runs 1000+ iterations to average out RNG variance
6. **Stat Weight Calculation** - Generates EHP-based stat weights for gear comparison
7. **Death Scenario Analysis** - Calculates min/max/median hits to kill and "Gibbability Rating"
8. **Reactive Abilities** - Hunter Deterrence (activates when about to die)
9. **Damage Timeline Tracking** - Records damage sequence and attack timestamps for visualization
10. **Crush/Crit Immunity Detection** - Handles mitigation caps and immunity breakpoints

---

## Architecture Overview

```
tankSimulator.js (Combat Simulation Engine)
├── Core Simulation
│   ├── runTankSimulation() - Main entry point (multi-iteration wrapper)
│   ├── runSingleSimulation() - Single iteration combat simulation
│   ├── averageSimulationResults() - Averages results across iterations
│   └── calculateMode() - Statistical mode calculation for procs
│
├── Combat Mechanics
│   ├── Time-based event loop - Boss attacks vs player attacks
│   ├── processBossAttack() - Attack table resolution
│   ├── processPlayerAttack() - Parry haste trigger detection
│   ├── checkChanceOnHitProcs() - Proc activation (Redoubt, etc.)
│   └── Attack table ordering - Dodge → Parry → Miss → Block → Crit → Crush → Hit
│
├── Proc System
│   ├── Proc state tracking (active, cooldown, duration, blocks remaining)
│   ├── On-use procs (Holy Shield, Glyph of Deflection)
│   ├── Chance-on-hit procs (Redoubt, Bulwark trinket)
│   ├── Buff-based procs (Stoneshield Potion)
│   ├── Talent procs (dynamic stat modifiers)
│   └── Uptime window tracking (for timeline visualization)
│
├── Stat Weight Calculation
│   ├── calculateStatWeights() - EHP-based stat weight generation
│   ├── Avoidance value (dodge/parry/miss)
│   ├── Stamina value (HP with DR multiplier)
│   ├── Defense value (avoidance + crit reduction)
│   ├── Armor value (DR with diminishing returns)
│   ├── Block value (damage reduction per block)
│   └── Block chance value (crit/crush prevention + damage reduction)
│
├── Death Scenario Analysis
│   ├── calculateDeathMetrics() - 10,000 iteration death simulation
│   ├── Min hits to kill (theoretical worst case)
│   ├── Max hits to kill (best case with lucky avoidance)
│   ├── Median hits to kill (50th percentile)
│   └── Gibbability Rating (% chance to die in 3 or fewer hits)
│
└── Utility Functions
    ├── getPlayerWeaponSpeed() - Extract player weapon speed with haste
    ├── calculateMode() - Most frequent value in array
    └── Boss database access (getBossDatabase, getBossById)
```

---

## Major Sections

### 1. Boss Database (Lines 7-11)

**Purpose:** Placeholder for boss data (populated from raidDefinitions.js)

**Structure:**
```javascript
{
    id: string,           // 'ragnaros', 'onyxia', etc.
    name: string,         // Display name
    level: number,        // Boss level (63 for raid bosses)
    minDamage: number,    // Min melee damage
    maxDamage: number,    // Max melee damage
    attackSpeed: number   // Swing timer in seconds
}
```

**Note:** Actual boss data comes from `raidDefinitions.js` via app.js

---

### 2. Player Weapon Speed Calculation (Lines 13-43)

#### `getPlayerWeaponSpeed(characterData, totals)` (Lines 18-43)

**Purpose:** Extract player weapon speed for parry haste calculations

**Process:**
1. Try to get `weaponSpeed` from `characterData.gearStats`
2. If not found, default to 2.0 (typical 1H weapon)
3. Apply haste: `hastedSpeed = baseSpeed / (1 + haste/100)`
4. Log weapon speed calculation for debugging

**Returns:** Hasted weapon speed (e.g., 1.82s with 10% haste)

**Used by:** Parry haste mechanic - determines when player attacks trigger boss parries

---

### 3. Main Simulation Entry Point (Lines 45-205)

#### `runTankSimulation(characterData, boss, timeInSeconds, iterations = 1000, options = {})` (Lines 54-205)

**Async** - Main simulation entry point

**Parameters:**
- `characterData` - Character stats from calculator (gear, talents, buffs, etc.)
- `boss` - Boss object with damage/attack speed
- `timeInSeconds` - Duration to simulate (typically 60-180 seconds)
- `iterations` - Number of Monte Carlo iterations (default: 1000)
- `options` - `{ yieldEvery: number }` - Yield to browser every N iterations

**Process:**

1. **Calculate effective attack speed** (after debuffs)
   ```javascript
   attackSpeedReduction = sum of buff.attack_speed_reduction
   effectiveAttackSpeed = baseAttackSpeed * (1 + attackSpeedReduction)
   ```

2. **Get player weapon speed** for parry haste
   ```javascript
   playerWeaponSpeed = getPlayerWeaponSpeed(characterData, totals)
   ```

3. **Find active procs** from items, buffs, talents
   ```javascript
   activeProcs = findActiveProcs(equippedItems, activeBuffs, characterData)
   ```

4. **Run multiple iterations**
   ```javascript
   for (iter = 0; iter < iterations; iter++) {
       result = runSingleSimulation(...)
       allResults.push(result)
       // Yield to browser periodically to prevent UI freeze
       if (yieldEvery > 0 && (iter + 1) % yieldEvery === 0) {
           await new Promise(resolve => setTimeout(resolve, 0))
       }
   }
   ```

5. **Average results across iterations**
   ```javascript
   averagedResults = averageSimulationResults(allResults, avgHits, ...)
   ```

6. **Calculate proc stats mode** (most frequent trigger/uptime values)
   - For each proc, calculate mode of triggers and uptime across iterations
   - Preserves activation times from first iteration for timeline visualization

7. **Add parry haste stats** for display
   ```javascript
   averagedResults.parryHasteStats = {
       playerAttacks, bossParries, parryHasteApplied,
       expectedBossAttacks, actualBossAttacks,
       playerWeaponSpeed, effectiveBossAttackSpeed
   }
   ```

8. **Average Deterrence stats** (Hunter reactive ability)

**Returns:** Averaged simulation results with proc stats, stat weights, death metrics

**Performance:** Yields to browser every N iterations to prevent UI freezes during long simulations

---

### 4. Single Iteration Simulation (Lines 231-1104)

#### `runSingleSimulation(characterData, boss, timeInSeconds, baseBossAttackSpeed, playerWeaponSpeed, activeProcs)` (Lines 241-1104)

**Core simulation function** - Runs a single combat iteration

**Initialization:**

1. **Initialize results object** (Lines 245-268)
   ```javascript
   results = {
       totalDamage: 0,
       hits: 0, crits: 0, crushes: 0,
       dodges: 0, parries: 0, blocks: 0, misses: 0,
       blockDamage: 0, hitDamage: 0, critDamage: 0, crushDamage: 0,
       landedHits: 0,
       damageReducedFromBlock: 0,
       damageSequence: [],        // For graphing
       attackTimestamps: [],      // For parry haste verification
       parryHasteCount: 0,
       playerAttacks: 0,
       bossParries: 0,
       procStats: {}              // Per-proc uptime tracking
   }
   ```

2. **Initialize proc states** (Lines 270-312)
   ```javascript
   procStates[procId] = {
       lastUsed: -cooldown,       // When proc was last used
       isActive: false,           // Is proc currently active?
       expiresAt: 0,              // When does proc expire?
       activationTime: undefined, // When did current activation start?
       blocksRemaining: undefined // For Holy Shield/Redoubt
   }
   ```
   - Buff-based on-use procs (Stoneshield Potion) start active
   - Talent procs with infinite duration set `expiresAt = Number.MAX_SAFE_INTEGER`

3. **Calculate defensive stats** (Lines 314-371)
   ```javascript
   dodge, parry, block, blockValue, physicalDR, defense

   // Miss chance = 5% base + defense bonus
   defenseSkill = defense - 300
   missChance = 5.0 + (defenseSkill * 0.04)

   // Crit chance = 5.6% base - defense reduction
   critReduction = max(0, (defense - 300) * 0.04)
   critChance = max(0, 5.6 - critReduction)

   // Crush chance = 15% (not reduced by defense)
   crushChance = 15.0

   // True avoidance = dodge + parry + miss (excludes block)
   trueAvoidance = dodge + parry + missChance

   // Total mitigation = dodge + parry + miss + block
   totalMitigation = trueAvoidance + block

   // Block reduction if over 100% total mitigation
   baseEffectiveBlock = block
   if (totalMitigation > 100) {
       overCap = totalMitigation - 100
       baseEffectiveBlock = max(0, block - overCap)
   }
   ```

4. **Calculate hit chance** (Lines 374-381)
   ```javascript
   // Attack table: Dodge → Parry → Miss → Block → Crit → Crush → Hit
   if (!isOverAvoidanceCap) {
       usedChance = missChance + dodge + parry + baseEffectiveBlock + critChance + crushChance
       hitChance = max(0, 100 - usedChance)
   }
   ```

5. **Initialize proc stats tracking** (Lines 386-395)

**Pre-Combat Phase (Lines 416-464):**

**On-use proc activation** - Activate procs that are ready at time 0 (e.g., Holy Shield)
```javascript
for (proc of onUseProcs) {
    if (timeSinceLastUse >= cooldown && timeRemaining >= duration) {
        state.isActive = true
        state.expiresAt = currentTime + duration
        results.procStats[proc.id].triggers++
        // Track activation window for timeline
        results.procStats[proc.id].activationTimes.push({
            start: currentTime,
            end: currentTime + duration,
            duration: duration
        })
    }
}
```

**Chance-on-Hit Proc Handler (Lines 466-574):**

#### `checkChanceOnHitProcs(procs, states, time)` (Inner function)

**Purpose:** Check if procs trigger when tank takes damage

**Special Handling:**
- **Redoubt:** Dynamic proc chance based on talent rank (2/4/6/8/10%)
- **Talent validation:** Only proc if talent is learned
- **Block counter:** Procs with `maxBlocks` expire after N blocks (Holy Shield, Redoubt)

**Process:**
1. For each `chanceOnHit` proc:
   - Check if talent is learned (for talent procs)
   - Roll proc chance
   - If proc succeeds:
     - Activate proc (`isActive = true`)
     - Set expiration time
     - Track activation window
     - Initialize blocks remaining

**Boss Attack Handler (Lines 576-813):**

#### `processBossAttack()` (Inner function)

**Purpose:** Resolve a single boss attack against the tank

**Process:**

1. **Track attack timestamp** for parry haste verification
   ```javascript
   results.attackTimestamps.push(currentTime)
   ```

2. **Update proc states** and close expired activations
   ```javascript
   updateProcStates(activeProcs, currentTime, procStates)
   ```

3. **Get active proc stats** (block chance, block value, armor, etc.)
   ```javascript
   procStats = getActiveProcStats(activeProcs, currentTime, procStates, characterData)
   ```

4. **Apply proc block chance**
   ```javascript
   effectiveBlock = baseEffectiveBlock
   if (procStats.blockChance) {
       effectiveBlock += procStats.blockChance
       // Reduce if total mitigation > 100%
       if (trueAvoidance + effectiveBlock > 100) {
           overCap = (trueAvoidance + effectiveBlock) - 100
           effectiveBlock = max(0, effectiveBlock - overCap)
       }
   }
   ```

5. **Apply proc stat modifiers** (block value, armor)
   ```javascript
   currentBlockValue = blockValue + (procStats.blockValue || 0)

   // Recalculate physical DR with proc armor
   if (procStats.armor > 0) {
       enhancedArmor = baseArmor + procStats.armor
       enhancedArmorDR = enhancedArmor / (enhancedArmor + 400 + 85 * attackerLevel)
       // Apply increase to total DR
       effectivePhysicalDR = min(1, physicalDR + (enhancedArmorDR - baseArmorDR))
   }
   ```

6. **Get flat damage reduction from buffs** (e.g., Stoneskin Totem)
   ```javascript
   flatDamageReduction = sum of buff.flatDamageReduction
   ```

7. **Activate Deterrence (Hunter)** if conditions met
   ```javascript
   // Activate when:
   // - 3 consecutive landed hits
   // - Next hit could kill (max crit damage >= current health)
   // - Cooldown ready
   if (hasDeterrence && consecutiveLandedHits >= 3 && ...) {
       deterrenceActiveUntil = currentTime + 10
       deterrenceCooldownUntil = currentTime + 360
   }
   ```

8. **Roll attack table**
   ```javascript
   roll = Math.random() * 100

   // Deterrence adds 25% dodge/parry
   effectiveDodge = dodge + (deterrenceActive ? 25 : 0)
   effectiveParry = parry + (deterrenceActive ? 25 : 0)

   // Attack table: Dodge → Parry → Miss → Block → Crit → Crush → Hit
   if (roll < effectiveDodge) {
       results.dodges++
   } else if (roll < effectiveDodge + effectiveParry) {
       results.parries++
   } else if (roll < effectiveDodge + effectiveParry + missChance) {
       results.misses++
   } else if (roll < effectiveDodge + effectiveParry + missChance + effectiveBlock) {
       // BLOCKED HIT
       results.blocks++
       results.landedHits++

       rawDamage = boss.minDamage + random * (boss.maxDamage - boss.minDamage)
       damageAfterFlatReduction = max(0, rawDamage - flatDamageReduction)
       afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR)
       blockedDamage = max(0, afterDR - currentBlockValue)
       damageReduced = min(currentBlockValue, afterDR)

       results.blockDamage += blockedDamage
       results.totalDamage += blockedDamage
       results.damageReducedFromBlock += damageReduced

       // Check for chance-on-hit procs
       checkChanceOnHitProcs(activeProcs, procStates, currentTime)

       // Decrement block counter for procs
       if (procState.blocksRemaining !== undefined) {
           procState.blocksRemaining--
           if (procState.blocksRemaining <= 0) {
               // Expire proc early
               procState.isActive = false
               procState.expiresAt = currentTime
           }
       }
   } else if (!isOverAvoidanceCap) {
       blockEnd = effectiveDodge + effectiveParry + missChance + effectiveBlock
       if (roll < blockEnd + critChance) {
           // CRITICAL HIT (2x damage)
           results.crits++
           results.landedHits++

           rawDamage = ...
           damageAfterFlatReduction = max(0, rawDamage - flatDamageReduction)
           afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR)
           critDamage = afterDR * 2

           results.critDamage += critDamage
           results.totalDamage += critDamage

           checkChanceOnHitProcs(...)
       } else if (roll < blockEnd + critChance + crushChance) {
           // CRUSHING BLOW (1.5x damage)
           results.crushes++
           results.landedHits++

           rawDamage = ...
           damageAfterFlatReduction = max(0, rawDamage - flatDamageReduction)
           afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR)
           crushDamage = afterDR * 1.5

           results.crushDamage += crushDamage
           results.totalDamage += crushDamage

           checkChanceOnHitProcs(...)
       } else {
           // NORMAL HIT
           results.hits++
           results.landedHits++

           rawDamage = ...
           damageAfterFlatReduction = max(0, rawDamage - flatDamageReduction)
           afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR)

           results.hitDamage += afterDR
           results.totalDamage += afterDR

           checkChanceOnHitProcs(...)
       }
   } else {
       // Over avoidance cap - everything is avoided
       results.misses++
   }
   ```

9. **Track damage for timeline**
   ```javascript
   results.damageSequence.push(damageThisHit)
   ```

10. **Update Deterrence tracking**
    ```javascript
    if (damageThisHit > 0) {
        consecutiveLandedHits++
        currentHealth -= damageThisHit
    } else {
        consecutiveLandedHits = 0  // Reset on avoidance
    }
    ```

**Player Attack Handler (Lines 815-851):**

#### `processPlayerAttack()` (Inner function)

**Purpose:** Process player attack and check for boss parry (triggers parry haste)

**Process:**
1. Increment player attack counter
2. Roll for boss parry (15% chance)
3. If boss parries:
   ```javascript
   // Calculate remaining time until next boss attack
   remainingSwingTime = nextBossAttackTime - currentTime
   minAllowedTime = baseBossSwingTime * 0.20  // 20% floor

   // Reduce swing timer by 40%
   reducedTime = remainingSwingTime * 0.60

   // Only apply if it doesn't go below 20% threshold
   if (reducedTime >= minAllowedTime) {
       timeSaved = remainingSwingTime - reducedTime
       nextBossAttackTime = currentTime + reducedTime
       results.parryHasteCount++
   }
   ```

**Parry Haste Mechanic:**
- Boss has 15% parry chance against player attacks
- When boss parries, remaining swing timer reduced by 40%
- Minimum swing timer is 20% of base speed (prevents infinite acceleration)
- Example: If boss has 1.0s remaining on 2.0s timer, parry reduces it to 0.6s (saves 0.4s)

**Main Simulation Loop (Lines 853-948):**

**Time-based event loop** - Processes events in chronological order

```javascript
currentTime = 0
nextBossAttackTime = baseBossAttackSpeed
nextPlayerAttackTime = playerWeaponSpeed

while (currentTime < timeInSeconds) {
    // Advance to next event (whichever happens first)
    if (nextBossAttackTime <= nextPlayerAttackTime) {
        // Boss attacks
        currentTime = nextBossAttackTime
        processBossAttack()
        nextBossAttackTime = currentTime + baseBossAttackSpeed
    } else {
        // Player attacks
        currentTime = nextPlayerAttackTime
        processPlayerAttack()
        nextPlayerAttackTime = currentTime + playerWeaponSpeed
    }

    // Check for on-use proc activations (optimal timing)
    for (proc of onUseProcs) {
        if (!isActive && timeSinceLastUse >= cooldown && timeRemaining >= duration) {
            // Activate proc
            state.isActive = true
            state.expiresAt = currentTime + duration
            // Track activation
            results.procStats[proc.id].triggers++
            results.procStats[proc.id].activationTimes.push(...)
        }
    }

    // Update proc states and close expired activations
    updateProcStates(...)
}
```

**Post-Simulation Calculations (Lines 950-1104):**

1. **Calculate averages** (Lines 1055-1064)
   ```javascript
   results.avgLandedHit = totalDamage / landedHits
   results.avgBlock = blockDamage / blocks
   results.avgHit = hitDamage / hits
   results.avgCrit = critDamage / crits
   results.avgCrush = crushDamage / crushes
   results.avgDamagePerAttack = totalDamage / numHits
   ```

2. **Calculate percentages** (Lines 1066-1082)
   ```javascript
   results.dodgePercent = (dodges / numHits) * 100
   results.parryPercent = (parries / numHits) * 100
   results.blockPercent = (blocks / numHits) * 100
   // ... etc
   ```

3. **Finalize proc uptime** (Lines 953-1011)
   ```javascript
   // Calculate total uptime from activation windows
   for (proc of activeProcs) {
       procStat.totalUptime = 0
       procStat.maxUptime = 0

       for (activation of procStat.activationTimes) {
           actualEnd = min(activation.end, timeInSeconds)
           actualDuration = max(0, actualEnd - activation.start)
           procStat.totalUptime += actualDuration
           procStat.maxUptime = max(procStat.maxUptime, actualDuration)
       }

       procStat.uptimePercent = (totalUptime / timeInSeconds) * 100
   }
   ```

4. **Calculate death metrics** (Line 1090)
   ```javascript
   deathMetrics = calculateDeathMetrics(characterData, boss, dodge, parry,
       missChance, baseEffectiveBlock, block, blockValue, physicalDR,
       critChance, crushChance, isOverAvoidanceCap, health, totalMitigation)

   results.minHitsToKill = deathMetrics.minHitsToKill
   results.maxHitsToKill = deathMetrics.maxHitsToKill
   results.medianHitsToKill = deathMetrics.medianHitsToKill
   results.gibbabilityRating = deathMetrics.gibbabilityRating
   ```

5. **Calculate stat weights** (Line 1096)
   ```javascript
   statWeights = calculateStatWeights(totals, boss, physicalDR,
       effectiveAvoidanceForEHP, trueAvoidance, block, blockValue,
       blockRate, gibbabilityRating, minHitsToKill, avgDamagePerAttack)

   results.statWeights = statWeights
   ```

**Returns:** Single iteration results with all combat data

---

### 5. Result Averaging (Lines 1106-1233)

#### `averageSimulationResults(allResults, numHits, characterData, boss, timeInSeconds, effectiveAttackSpeed)` (Lines 1116-1233)

**Purpose:** Average results across multiple iterations to reduce RNG variance

**Process:**

1. **Recalculate base stats** (defensive stats are deterministic)
   ```javascript
   totals = calculateEffectiveHealth(characterData)
   dodge, parry, block, blockValue, physicalDR, defense
   missChance = 5.0 + (defenseSkill * 0.04)
   critChance = max(0, 5.6 - critReduction)
   trueAvoidance = dodge + parry + missChance
   totalMitigation = trueAvoidance + block
   effectiveBlock = block (reduced if totalMitigation > 100)
   ```

2. **Sum all iteration results** (Lines 1156-1171)
   ```javascript
   averaged = {
       totalDamage: sum(result.totalDamage) / iterations,
       hits: sum(result.hits) / iterations,
       crits: sum(result.crits) / iterations,
       // ... all counters averaged
   }
   ```

3. **Calculate averaged metrics** (Lines 1190-1211)
   ```javascript
   averaged.avgLandedHit = totalDamage / landedHits
   averaged.avgDamagePerAttack = totalDamage / numHits
   averaged.dodgePercent = (dodges / numHits) * 100
   // ... all percentages
   ```

4. **Recalculate death metrics** (Line 1214)
   - Run separate 10,000-iteration simulation for death scenarios
   - More accurate than averaging death metrics across combat iterations

5. **Recalculate stat weights** (Line 1218)
   - Use averaged block rate and death metrics

6. **Add time-based metadata** (Lines 1227-1230)
   ```javascript
   averaged.timeSimulated = timeInSeconds
   averaged.effectiveAttackSpeed = effectiveAttackSpeed
   averaged.numHits = numHits
   ```

**Returns:** Averaged results object

---

### 6. Death Scenario Analysis (Lines 1235-1404)

#### `calculateDeathMetrics(characterData, boss, dodge, parry, missChance, effectiveBlock, block, blockValue, physicalDR, critChance, crushChance, isOverAvoidanceCap, health, totalMitigation)` (Lines 1253-1404)

**Purpose:** Calculate survivability metrics - min/max/median hits to kill and Gibbability Rating

**Process:**

1. **Determine worst-case damage** (Lines 1270-1292)
   ```javascript
   isCritImmune = critChance <= 0  // 440 defense
   isCrushImmune = totalMitigation >= 100
   isFullyImmune = isOverAvoidanceCap

   if (isFullyImmune) {
       worstCaseDamagePerHit = 0  // Never die
   } else if (isCrushImmune) {
       // Worst case: normal hit or blocked hit
       worstCaseDamagePerHit = max(normalHitDamage, blockedHitDamage)
   } else if (isCritImmune) {
       // Worst case: crushing blow (1.5x)
       worstCaseDamagePerHit = boss.maxDamage * (1 - physicalDR) * 1.5
   } else {
       // Worst case: critical hit (2x)
       worstCaseDamagePerHit = boss.maxDamage * (1 - physicalDR) * 2
   }

   minHitsToKillTheoretical = ceil(health / worstCaseDamagePerHit)
   ```

2. **Run 10,000 death iterations** (Lines 1298-1362)
   ```javascript
   for (iter = 0; iter < 10000; iter++) {
       currentHealth = health
       damagingHitsTaken = 0
       attemptsTaken = 0  // Includes dodges/parries/misses

       while (currentHealth > 0 && attemptsTaken < 10000) {
           attemptsTaken++
           roll = random(100)

           // Attack table resolution (same as combat sim)
           if (roll < dodge) {
               // Dodge - no damage
           } else if (roll < dodge + parry) {
               // Parry - no damage
           } else if (roll < dodge + parry + missChance) {
               // Miss - no damage
           } else if (roll < dodge + parry + missChance + effectiveBlock) {
               // Blocked hit - reduced damage
               damagingHitsTaken++
               damage = max(0, randomDamage * (1 - physicalDR) - blockValue)
               currentHealth -= damage
           } else if (!isOverAvoidanceCap) {
               // Crit/Crush/Hit - full damage
               damagingHitsTaken++
               damage = randomDamage * (1 - physicalDR) * damageMultiplier
               currentHealth -= damage
           } else {
               // Over cap - avoided
           }
       }

       hitsToKillArray.push({
           damagingHits: damagingHitsTaken,
           attempts: attemptsTaken
       })
   }
   ```

3. **Calculate Gibbability Rating** (Lines 1368-1370)
   ```javascript
   // Probability of dying in 3 or fewer hits
   deathsIn3OrLess = hitsToKillArray.filter(r => r.damagingHits <= 3).length
   gibbabilityRating = (deathsIn3OrLess / 10000) * 100
   ```

4. **Calculate median hits to kill** (Lines 1382-1394)
   ```javascript
   sortedHits = hitsToKillArray.map(r => r.damagingHits).sort()
   mid = floor(sortedHits.length / 2)

   if (sortedHits.length % 2 === 0) {
       medianHitsToKill = (sortedHits[mid - 1] + sortedHits[mid]) / 2
   } else {
       medianHitsToKill = sortedHits[mid]
   }
   ```

**Returns:**
```javascript
{
    minHitsToKill: number,        // Theoretical worst case
    maxHitsToKill: number,        // Best case with lucky avoidance
    medianHitsToKill: number,     // 50th percentile
    gibbabilityRating: number,    // % chance to die in ≤3 hits
    gibbedCount: number,          // Number of deaths ≤3 hits
    iterations: 10000
}
```

**Key Metric: Gibbability Rating**
- 0% = Never die in 3 hits (very safe)
- 50% = Half the time you die in 3 hits (risky)
- 100% = Always die in 3 hits (very dangerous)

---

### 7. Stat Weight Calculation (Lines 1406-1832)

#### `calculateStatWeights(totals, boss, currentDR, effectiveAvoidancePercent, trueAvoidancePercent, blockChance, blockValue, actualBlockRate, currentGibRating, currentMinHitsToKill, simulatedAvgDamagePerAttack)` (Lines 1420-1832)

**Purpose:** Calculate EHP value of each stat point for gear optimization

**Methodology:** All stat weights calculated as EHP (Effective Health Points) value

**Formula:**
```
EHP Value = (Damage Prevented Per Attack) × (Attacks You Can Survive)
```

**Parameters:**
- `totals` - Character totals from calculator
- `boss` - Boss data (damage range)
- `currentDR` - Current physical damage reduction (0-1)
- `effectiveAvoidancePercent` - Current avoidance (capped at 100% for EHP)
- `trueAvoidancePercent` - Current true avoidance (dodge + parry + miss)
- `blockChance` - Current block chance %
- `blockValue` - Current block value
- `actualBlockRate` - Actual block rate from simulation (0-1)
- `simulatedAvgDamagePerAttack` - Average damage per attack from simulation (if available)

**Stat Weights:**

#### 1. Avoidance (Dodge/Parry) - 1% Value (Lines 1445-1516)

**Calculation depends on attack table zone:**

```javascript
avgBossDamage = (boss.minDamage + boss.maxDamage) / 2
normalHitDamage = avgBossDamage * (1 - currentDR)
crushDamage = normalHitDamage * 1.5
critDamage = normalHitDamage * 2.0

totalMitigation = trueAvoidancePercent + blockChance

// Determine what adding 1% avoidance prevents
if (totalMitigation >= 100 - critChance) {
    // CRIT IMMUNE ZONE: Prevents crits (2x damage completely avoided)
    damagePreventedPerAttack = 0.01 * critDamage
} else if (totalMitigation >= 100 - crushChance - critChance) {
    // CRUSH IMMUNE ZONE: Prevents crushes (1.5x damage completely avoided)
    damagePreventedPerAttack = 0.01 * crushDamage
} else {
    // NORMAL ZONE: Prevents normal hits (1x damage completely avoided)
    damagePreventedPerAttack = 0.01 * normalHitDamage
}

// Convert to EHP
if (simulatedAvgDamagePerAttack > 0) {
    avgDamagePerAttack = simulatedAvgDamagePerAttack  // Use actual average
} else {
    avgDamagePerAttack = normalHitDamage  // Fallback
}

attacksToKill = health / avgDamagePerAttack
avoidance1PercentValue = damagePreventedPerAttack * attacksToKill
```

**Key Insight:** Avoidance value increases dramatically in crit/crush immune zones because it prevents higher-damage attacks

**Cap:** If `trueAvoidancePercent >= 100%`, avoidance has 0 value (already avoiding everything)

#### 2. Stamina - 1 Point Value (Lines 1519-1540)

**Calculation:**

```javascript
// HP per stamina depends on buffs/talents
// Base: 10 HP/stamina
// With Commanding Shout (+10%), Vitality (+5%), % HP buffs: 12.1 HP/stamina
staminaHP = totals.hpPerStamina || 10

// Stamina value ONLY amplified by DR, NOT by avoidance
// (avoidance value already captured in dodge/parry stat weight)
stamina1Value = staminaHP / (1 - currentDR)

// Stamina equivalent of 1% avoidance
staminaPer1PercentAvoidance = avoidance1PercentValue / stamina1Value
```

**Example:**
- Current DR: 75% → 1 stamina = 10 / 0.25 = 40 EHP
- 1% avoidance worth 200 EHP → Need 5 stamina to equal 1% avoidance

#### 3. Defense - 1 Point Value (Lines 1542-1616)

**Two components:**

**Part 1: Avoidance value** (0.12% per defense)
```javascript
// Defense gives 0.04% to miss, dodge, parry, block
// For avoidance (miss + dodge + parry): 0.04% * 3 = 0.12%

if (!isAtAvoidanceCap) {
    normalHitDamageAfterDR = avgBossDamage * (1 - currentDR)
    normalHitsToKill = health / normalHitDamageAfterDR

    // 1 defense = 0.12% avoidance
    // Prevents: (damage per hit * 0.0012) per attack
    avoidanceValue = (normalHitDamageAfterDR * 0.0012) * normalHitsToKill
}
```

**Part 2: Crit reduction value** (0.04% per defense above 300)
```javascript
if (defense >= 300 && currentCritChance > 0) {
    critReductionPerPoint = 0.0004  // 0.04% as decimal

    normalHitDamageAfterDR = avgBossDamage * (1 - currentDR)
    critDamageAfterDR = normalHitDamageAfterDR * 2

    // Damage difference between crit and normal hit
    damageDifference = critDamageAfterDR - normalHitDamageAfterDR

    // +1 defense reduces crit chance by 0.04%
    // This means 0.04% of attacks become normal hits instead of crits
    damagePreventedPerAttack = critReductionPerPoint * damageDifference

    normalHitsToKill = health / normalHitDamageAfterDR
    critReductionEHP = damagePreventedPerAttack * normalHitsToKill
}

defense1Value = avoidanceValue + critReductionEHP
```

**Key Insight:** Defense has high value against bosses with high crit chance (low defense tanks)

#### 4. Armor - 1 Point Value (Lines 1618-1667)

**Calculation with diminishing returns:**

```javascript
// Turtle WoW: No armor cap, uses diminishing returns
// Formula: DR = armor / (armor + 400 + 85 * attackerLevel)
armorDenominator = 400 + 85 * 63 = 5755

currentArmorDR = armor / (armor + armorDenominator)
newArmorDR = (armor + 1) / (armor + 1 + armorDenominator)
armorDRDelta = newArmorDR - currentArmorDR

// Calculator combines DR sources multiplicatively:
// finalDamageTaken = (1 - armorDR) * (1 - talentDR) * (1 - buffDR)
// totalDR = 1 - finalDamageTaken

// Calculate other DR multipliers
otherDRMultipliers = (1 - currentDR) / (1 - currentArmorDR)
newTotalDR = 1 - ((1 - newArmorDR) * otherDRMultipliers)

// Armor value ONLY based on DR increase, NOT amplified by avoidance
currentEHPWithoutAvoidance = health / (1 - currentDR)
newEHPWithArmor = health / (1 - newTotalDR)
armor1Value = newEHPWithArmor - currentEHPWithoutAvoidance
```

**Example:**
- Current armor: 10,000 → DR: 63.5%
- +1 armor → 10,001 → DR: 63.51%
- Health: 10,000
- EHP gain: 10,000 / 0.3649 - 10,000 / 0.365 = 0.76 EHP per armor

**Key Insight:** Armor has diminishing returns - each point adds less DR at high armor levels

#### 5. Block Value - 1 Point Value (Lines 1669-1737)

**Calculation:**

```javascript
// Block value reduces damage on blocked hits
// +1 block value = 1 less damage per blocked hit

if (actualBlockRate > 0) {
    avgBossDamage = (boss.minDamage + boss.maxDamage) / 2
    normalHitDamage = avgBossDamage * (1 - currentDR)

    // With +1 block value, we reduce damage by 1 more on each blocked hit
    damageReductionPerAttack = actualBlockRate * 1

    // Determine average damage per attack
    if (simulatedAvgDamagePerAttack > 0) {
        avgDamagePerAttack = simulatedAvgDamagePerAttack
    } else {
        avgDamagePerAttack = normalHitDamage
    }

    // EHP = (damage reduced per attack) * (attacks to kill)
    attacksToKill = health / avgDamagePerAttack
    blockValue1EHP = damageReductionPerAttack * attacksToKill
}
```

**Example:**
- Block rate: 30% (from simulation)
- +1 block value reduces 0.3 damage per attack on average
- If you can survive 100 attacks → 30 EHP from +1 block value

**Key Insight:** Block value scales with block rate - more valuable with higher block chance

#### 6. Block Chance - 1% Value (Lines 1739-1811)

**Calculation depends on attack table zone:**

```javascript
totalMitigation = trueAvoidancePercent + blockChance

avgBossDamage = (boss.minDamage + boss.maxDamage) / 2
normalHitDamage = avgBossDamage * (1 - currentDR)
crushDamage = normalHitDamage * 1.5
critDamage = normalHitDamage * 2.0

// Determine what 1% more block would prevent
if (totalMitigation >= 100 - critChance) {
    // CRIT IMMUNE: Prevents crits (2x → 1x + block value reduction)
    blockedHitDamage = max(0, normalHitDamage - blockValue)
    damagePreventedPerAttack = 0.01 * (critDamage - blockedHitDamage)
} else if (totalMitigation >= 100 - crushChance - critChance) {
    // CRUSH IMMUNE: Prevents crushes (1.5x → 1x + block value reduction)
    blockedHitDamage = max(0, normalHitDamage - blockValue)
    damagePreventedPerAttack = 0.01 * (crushDamage - blockedHitDamage)
} else {
    // NORMAL ZONE: Converts normal hits to blocked hits
    damagePreventedPerAttack = 0.01 * blockValue
}

// Convert to EHP
attacksToKill = health / avgDamagePerAttack
blockChance1PercentEHP = damagePreventedPerAttack * attacksToKill
```

**Key Insight:** Block chance has two benefits:
1. **Crit/crush prevention** - Pushes them off attack table (valuable in high mitigation zones)
2. **Damage reduction** - Applies block value on blocked hits

**Returns:**
```javascript
{
    avoidance1PercentEHP: number,             // EHP from 1% dodge/parry
    stamina1EHP: number,                      // EHP from 1 stamina
    staminaPer1PercentAvoidance: number,      // Stamina needed for 1% avoidance EHP
    defense1EHP: number,                      // EHP from 1 defense
    defensePer1PercentAvoidance: number,      // Defense needed for 1% avoidance EHP
    armor1EHP: number,                        // EHP from 1 armor
    armorPer1PercentAvoidance: number,        // Armor needed for 1% avoidance EHP
    blockValue1EHP: number,                   // EHP from 1 block value
    blockValuePer1PercentAvoidance: number,   // Block value needed for 1% avoidance EHP
    blockChance1PercentEHP: number,           // EHP from 1% block chance
    blockChancePer1PercentAvoidance: number   // % block needed for 1% avoidance EHP
}
```

---

### 8. Boss Database Access (Lines 1834-1847)

#### `getBossDatabase()` (Lines 1837-1839)

**Purpose:** Return boss database for population in UI

**Returns:** Array of boss objects

**Used by:** Tank simulator UI (app.js) to populate boss dropdown

#### `getBossById(id)` (Lines 1844-1846)

**Purpose:** Get boss by ID

**Returns:** Boss object or `undefined`

---

## Key Data Structures

### Boss Object
```javascript
{
    id: string,           // 'ragnaros', 'patchwerk', etc.
    name: string,         // Display name
    level: number,        // Boss level (63 for raid bosses)
    minDamage: number,    // Min melee damage
    maxDamage: number,    // Max melee damage
    attackSpeed: number,  // Swing timer in seconds
    attackPower: number,  // Boss AP (for formula reference)
    armor: number         // Boss armor (for formula reference)
}
```

### Character Data Object
```javascript
{
    selectedClass: string,         // 'warrior', 'paladin', etc.
    selectedRace: string,          // 'human', 'orc', etc.
    attackerLevel: number,         // Boss level (63)
    gearStats: Object,             // Aggregated gear stats
    talentBonuses: Object,         // Talent bonuses
    racialBonuses: Object,         // Racial bonuses
    activeBuffs: Array,            // Active buffs
    enchantStats: Object,          // Enchant stats
    offhandArmor: number,          // Shield armor
    setBonuses: Object,            // Set bonuses
    equippedItems: Array,          // Equipped item objects
    isDualWielding: boolean,
    mainhandType: string,
    offhandType: string
}
```

### Simulation Results Object
```javascript
{
    // Summary
    totalDamage: number,
    avgDamagePerAttack: number,
    numHits: number,

    // Attack table results
    hits: number,
    crits: number,
    crushes: number,
    dodges: number,
    parries: number,
    blocks: number,
    misses: number,

    // Damage breakdown
    hitDamage: number,
    critDamage: number,
    crushDamage: number,
    blockDamage: number,
    damageReducedFromBlock: number,

    // Averages
    avgLandedHit: number,
    avgBlock: number,
    avgHit: number,
    avgCrit: number,
    avgCrush: number,

    // Percentages
    dodgePercent: number,
    parryPercent: number,
    blockPercent: number,
    missPercent: number,
    hitPercent: number,
    critPercent: number,
    crushPercent: number,

    // Mitigation stats
    totalMitigation: number,      // dodge + parry + miss + block
    trueAvoidance: number,        // dodge + parry + miss
    effectiveBlock: number,       // block after reduction
    isOverCap: boolean,           // trueAvoidance >= 100%

    // Death metrics
    minHitsToKill: number,
    maxHitsToKill: number,
    medianHitsToKill: number,
    gibbabilityRating: number,    // % chance to die in ≤3 hits

    // Stat weights
    statWeights: {
        avoidance1PercentEHP: number,
        stamina1EHP: number,
        defense1EHP: number,
        armor1EHP: number,
        blockValue1EHP: number,
        blockChance1PercentEHP: number,
        // ... equivalency ratios
    },

    // Proc tracking
    procStats: {
        [procId]: {
            triggers: number,
            totalUptime: number,
            maxUptime: number,
            uptimePercent: number,
            activationTimes: [
                { start: number, end: number, duration: number },
                ...
            ]
        }
    },

    // Parry haste tracking
    parryHasteStats: {
        playerAttacks: number,
        bossParries: number,
        parryHasteApplied: number,
        expectedBossAttacks: number,
        actualBossAttacks: number,
        playerWeaponSpeed: number,
        effectiveBossAttackSpeed: number
    },

    // Timeline data (for graphing)
    damageSequence: Array<number>,     // Damage per attack
    attackTimestamps: Array<number>,   // Time of each boss attack

    // Deterrence tracking (Hunter)
    deterrenceStats: {
        triggers: number,
        totalUptime: number,
        activationTimes: Array
    },

    // Simulation metadata
    timeSimulated: number,
    effectiveAttackSpeed: number,
    landedHits: number
}
```

### Proc State Object
```javascript
{
    lastUsed: number,           // Time when proc was last used/activated
    isActive: boolean,          // Is proc currently active?
    expiresAt: number,          // Time when proc expires
    activationTime: number,     // When current activation started
    blocksRemaining: number,    // For procs that expire after N blocks (Holy Shield, Redoubt)
    statModifiers: Object       // Cached stat modifiers for this proc
}
```

### Stat Weights Object
```javascript
{
    // EHP values (how much EHP you gain from each stat)
    avoidance1PercentEHP: number,    // EHP from +1% dodge/parry
    stamina1EHP: number,             // EHP from +1 stamina
    defense1EHP: number,             // EHP from +1 defense
    armor1EHP: number,               // EHP from +1 armor
    blockValue1EHP: number,          // EHP from +1 block value
    blockChance1PercentEHP: number,  // EHP from +1% block chance

    // Equivalency ratios (how much of stat X equals 1% avoidance)
    staminaPer1PercentAvoidance: number,      // Stamina needed for 1% avoidance EHP
    defensePer1PercentAvoidance: number,      // Defense needed for 1% avoidance EHP
    armorPer1PercentAvoidance: number,        // Armor needed for 1% avoidance EHP
    blockValuePer1PercentAvoidance: number,   // Block value needed for 1% avoidance EHP
    blockChancePer1PercentAvoidance: number   // % block needed for 1% avoidance EHP
}
```

---

## Attack Table Mechanics

### Attack Table Order
```
Miss → Dodge → Parry → Block → Crit → Crush → Hit
```

### Attack Table Resolution

**Total Chances:**
```javascript
missChance = 5% + (defense - 300) * 0.04%
dodgeChance = from stats
parryChance = from stats
blockChance = from stats (reduced if totalMitigation > 100%)
critChance = max(0, 5.6% - (defense - 300) * 0.04%)
crushChance = 15% (not reduced by defense)
hitChance = 100% - (miss + dodge + parry + block + crit + crush)
```

**Roll Resolution:**
```javascript
roll = random(0, 100)

if (roll < dodge)
    → Dodge (0 damage)
else if (roll < dodge + parry)
    → Parry (0 damage, triggers parry haste)
else if (roll < dodge + parry + miss)
    → Miss (0 damage)
else if (roll < dodge + parry + miss + block)
    → Block (damage reduced by block value)
else if (roll < dodge + parry + miss + block + crit)
    → Crit (2x damage)
else if (roll < dodge + parry + miss + block + crit + crush)
    → Crush (1.5x damage)
else
    → Normal Hit (1x damage)
```

### Mitigation Caps

**Avoidance Cap (100%):**
- If `dodge + parry + miss >= 100%`, all attacks are avoided
- Block, crit, crush, and hit are pushed off the table entirely

**Crush Immunity (100% Total Mitigation):**
- If `dodge + parry + miss + block >= 100%`, crushes are impossible
- Requires high total mitigation (typically 102-103% to be safe)

**Crit Immunity (440 Defense):**
- At 440 defense: `crit = 5.6% - (440-300)*0.04% = 0%`
- Crits become impossible without block

**Block Reduction:**
- If `totalMitigation > 100%`, block is reduced:
  ```javascript
  overCap = totalMitigation - 100
  effectiveBlock = max(0, block - overCap)
  ```
- Example: 15% dodge + 15% parry + 10% miss + 65% block = 105% total
  - Effective block = 65% - 5% = 60%

---

## Parry Haste Mechanic

### Implementation

**When Boss Parries Player Attack:**
```javascript
// Boss has 15% parry chance against player attacks
if (random(100) < 15) {
    // Calculate remaining time until next boss attack
    remainingSwingTime = nextBossAttackTime - currentTime
    minAllowedTime = baseBossSwingTime * 0.20  // 20% floor

    // Reduce swing timer by 40%
    reducedTime = remainingSwingTime * 0.60

    // Only apply if it doesn't go below 20% floor
    if (reducedTime >= minAllowedTime) {
        nextBossAttackTime = currentTime + reducedTime
        parryHasteCount++
    }
}
```

**Example:**
- Boss swing timer: 2.0s
- Player attacks at 1.0s into boss swing
- Boss parries → Remaining time: 1.0s
- After parry haste: 1.0s * 0.6 = 0.6s
- Boss attacks 0.6s later instead of 1.0s (saved 0.4s)

**Floor Mechanic:**
- Parry haste cannot reduce swing timer below 20% of base
- Example: 2.0s base → Cannot go below 0.4s
- Prevents infinite acceleration

**Impact:**
- Faster player weapon speed → more player attacks → more parry opportunities
- Can significantly increase boss attack frequency (10-20% more attacks)
- Important for slow bosses with high parry rates

---

## Proc System Integration

### Proc Types

**1. On-Use Procs**
- Activated optimally during simulation
- Example: Holy Shield (Paladin), Glyph of Deflection (trinket)
- Activation logic:
  ```javascript
  if (!isActive && timeSinceLastUse >= cooldown && timeRemaining >= duration) {
      activate()
  }
  ```

**2. Chance-on-Hit Procs**
- Trigger when tank takes damaging hit
- Example: Redoubt (Paladin talent), Bulwark trinket
- Trigger logic:
  ```javascript
  if (damageThisHit > 0 && random(100) < procChance) {
      activate()
  }
  ```

**3. Buff-Based Procs**
- Start active (activated before combat)
- Example: Stoneshield Potion, Greater Stoneshield Potion
- Activated at `time = 0`

**4. Talent Procs**
- Always active or have special trigger conditions
- Example: Shield Discipline (passive), Deterrence (reactive)

### Proc State Tracking

**State Fields:**
```javascript
procStates[procId] = {
    lastUsed: number,           // -cooldown at start (ready immediately)
    isActive: boolean,          // Is proc currently active?
    expiresAt: number,          // When does proc expire?
    activationTime: number,     // When current activation started
    blocksRemaining: number,    // For Holy Shield (4 blocks), Redoubt (5 blocks)
    statModifiers: Object       // Cached modifiers (block chance, block value, armor)
}
```

**Activation Window Tracking:**
```javascript
results.procStats[procId] = {
    triggers: number,           // How many times proc activated
    totalUptime: number,        // Total seconds active
    maxUptime: number,          // Longest single activation
    uptimePercent: number,      // (totalUptime / timeSimulated) * 100
    activationTimes: [
        { start: 0, end: 10, duration: 10 },     // First activation
        { start: 20, end: 30, duration: 10 },    // Second activation
        ...
    ]
}
```

### Proc Examples

**Holy Shield (Paladin On-Use Proc):**
```javascript
{
    id: 'holy_shield',
    name: 'Holy Shield',
    procType: 'onUse',
    cooldown: 8,               // 8 second cooldown
    duration: 10,              // 10 second duration
    maxBlocks: 4,              // Expires after 4 blocks
    statModifiers: {
        blockChance: 30         // +30% block chance (rank 4)
    }
}
```

**Redoubt (Paladin Talent Proc):**
```javascript
{
    id: 'redoubt',
    name: 'Redoubt',
    procType: 'chanceOnHit',
    procChance: 10,            // 10% at 5/5 (dynamic based on talent rank)
    duration: 10,              // 10 second duration
    maxBlocks: 5,              // Expires after 5 blocks
    fromTalent: true,
    getTalentRank: function(characterData) {
        return characterData.talentBonuses?.redoubt_rank || 0
    },
    getProcChance: function(characterData) {
        const rank = this.getTalentRank(characterData)
        return rank * 2  // 2/4/6/8/10% based on rank
    },
    getTalentStats: function(characterData) {
        const rank = this.getTalentRank(characterData)
        if (rank === 0) return null
        return {
            blockChance: rank * 3  // 3/6/9/12/15% block based on rank
        }
    }
}
```

**Bulwark of Enduring Earth (Trinket Proc):**
```javascript
{
    id: 'bulwark_of_enduring_earth',
    name: 'Bulwark of Enduring Earth',
    procType: 'chanceOnHit',
    procChance: 3,             // 3% chance on hit
    duration: 10,              // 10 second duration
    cooldown: 0,               // No cooldown (can chain-proc)
    statModifiers: {
        armor: 1100,           // +1100 armor
        blockValue: 285        // +285 block value
    }
}
```

---

## Stat Weight Calculation Details

### EHP-Based Stat Weights

**Core Philosophy:**
- All stat weights measured in **Effective Health Points (EHP)**
- EHP = Health / [(1 - DR) × (1 - Avoidance)]
- Higher EHP = More survivable

**Stat Weight Formula:**
```
Stat Weight = (Damage Prevented Per Attack) × (Attacks You Can Survive)
```

### Attack Table Zone Impact

**Stat values change based on mitigation level:**

**Zone 1: Normal (Low Mitigation)**
- Total mitigation < 80%
- Avoidance/block prevent normal hits (1x damage)
- Stat weights relatively stable

**Zone 2: Crush Immune (High Mitigation)**
- Total mitigation >= 100% - crush - crit (typically ~80%)
- Avoidance/block prevent crushes (1.5x damage)
- **Stat weights increase by 50%** (preventing 1.5x instead of 1x)

**Zone 3: Crit Immune (Very High Mitigation)**
- Total mitigation >= 100% - crit (typically ~94%)
- Avoidance/block prevent crits (2x damage)
- **Stat weights double** (preventing 2x instead of 1x)

**Example:**
```
Normal Zone:
  1% dodge prevents 1x damage
  EHP value: 1000

Crush Immune Zone:
  1% dodge prevents 1.5x damage (crushes)
  EHP value: 1500 (+50%)

Crit Immune Zone:
  1% dodge prevents 2x damage (crits)
  EHP value: 2000 (+100%)
```

### Stat Weight Comparisons

**Avoidance vs Stamina:**
```javascript
staminaPer1PercentAvoidance = avoidance1PercentValue / stamina1Value
```
- Shows how much stamina equals 1% dodge/parry
- Example: If value is 5, then 5 stamina = 1% dodge in EHP

**Defense vs Avoidance:**
```javascript
defensePer1PercentAvoidance = avoidance1PercentValue / defense1Value
```
- Shows how much defense equals 1% dodge/parry
- Defense gives 0.12% avoidance per point (0.04% each to miss, dodge, parry)
- Plus crit reduction value

**Armor vs Avoidance:**
```javascript
armorPer1PercentAvoidance = avoidance1PercentValue / armor1Value
```
- Shows how much armor equals 1% dodge/parry
- Armor has severe diminishing returns at high values

---

## How to Make Updates/Changes

### Adding a New Boss

**Files:** `raidDefinitions.js` (boss data is imported from there)

**Process:**
1. Add boss to `raidDefinitions.js`:
   ```javascript
   {
       id: 'new_boss',
       name: 'New Boss',
       level: 63,
       raid: 'Raid Name',
       attack_power: 420,
       weapon_damage_min: 2000,
       weapon_damage_max: 3000,
       attack_speed: 2.0,
       iconUrl: 'https://...'
   }
   ```
2. Boss auto-populates in tank sim UI via `getBossDatabase()`

### Modifying Attack Table

**File:** `runSingleSimulation()` (Lines 682-802)

**Process:**
1. Locate attack table resolution code
2. Modify roll thresholds:
   ```javascript
   if (roll < dodge) {
       // Dodge
   } else if (roll < dodge + parry) {
       // Parry
   }
   // ... etc
   ```
3. Ensure order matches WoW mechanics

### Adding a New Stat Weight

**File:** `calculateStatWeights()` (Lines 1420-1832)

**Process:**
1. Add new stat weight calculation:
   ```javascript
   // === 1 NewStat Value ===
   let newStat1Value = 0

   // Calculate damage prevented per attack
   damagePreventedPerAttack = ... (depends on stat)

   // Convert to EHP
   attacksToKill = health / avgDamagePerAttack
   newStat1Value = damagePreventedPerAttack * attacksToKill

   // Cap to reasonable values
   newStat1Value = safeValue(newStat1Value)
   ```

2. Add to return object:
   ```javascript
   return {
       // ... existing weights
       newStat1EHP: safeValue(newStat1Value),
       newStatPer1PercentAvoidance: safeValue(avoidance1PercentValue / newStat1Value)
   }
   ```

3. Update UI to display new stat weight (in app.js)

### Modifying Parry Haste

**File:** `processPlayerAttack()` (Lines 815-851)

**Current Implementation:**
```javascript
// Boss parries 15% of player attacks
// Parry haste reduces remaining swing timer by 40%
// Minimum swing time is 20% of base
```

**To Modify:**
1. Change boss parry chance:
   ```javascript
   const bossParryChance = 15.0  // Change this
   ```

2. Change parry haste reduction:
   ```javascript
   const reducedTime = remainingSwingTime * 0.60  // 0.60 = 40% reduction
   ```

3. Change minimum floor:
   ```javascript
   const minAllowedTime = baseBossSwingTime * 0.20  // 20% floor
   ```

### Adding a New Proc

**File:** `modules/gear/procs.js` (proc definitions)

**Process:**
1. Define proc in `procs.js`:
   ```javascript
   {
       id: 'new_proc',
       name: 'New Proc Name',
       procType: 'chanceOnHit',  // or 'onUse'
       procChance: 10,           // 10% chance
       duration: 15,             // 15 second duration
       cooldown: 30,             // 30 second cooldown
       statModifiers: {
           blockChance: 20,      // +20% block
           armor: 500            // +500 armor
       }
   }
   ```

2. Proc system automatically handles:
   - Activation/expiration tracking
   - Uptime calculation
   - Stat modifier application during attacks
   - Timeline visualization

### Debugging Simulations

**Enable Debug Logging:**
```javascript
// Add console.logs in key areas:
console.log('[TANK SIM] Stats:', { dodge, parry, block, ... })
console.log('[PROCS] Proc triggered:', proc.name)
console.log('[PARRY HASTE] Boss parried, timer reduced')
```

**Verify Attack Table:**
```javascript
// After simulation, check percentages match expected values
console.log('Dodge %:', results.dodgePercent.toFixed(2))
console.log('Parry %:', results.parryPercent.toFixed(2))
console.log('Block %:', results.blockPercent.toFixed(2))
// Should roughly match character stats (with RNG variance)
```

**Verify Stat Weights:**
```javascript
// Check for infinite/NaN values
console.log('Stat weights:', results.statWeights)
// All values should be finite and > 0
```

---

## Performance Considerations

### Iteration Count

**Default: 1000 iterations**
- Balances accuracy vs performance
- Standard deviation ~3% for most metrics
- Runtime ~1-2 seconds for 60s simulation

**Higher Iterations (5000+):**
- More accurate averaging (SD ~1%)
- Longer runtime (~5-10 seconds)
- Recommended for precise stat weight generation

**Lower Iterations (100-500):**
- Faster results (~0.5 seconds)
- Higher variance (SD ~10%)
- Good for quick gear comparisons

### Yielding to Browser

**Purpose:** Prevent UI freeze during long simulations

**Implementation:**
```javascript
if (yieldEvery > 0 && (iter + 1) % yieldEvery === 0) {
    await new Promise(resolve => setTimeout(resolve, 0))
}
```

**Recommended Values:**
- `yieldEvery: 100` - Yield every 100 iterations
- Keeps UI responsive during 1000+ iteration sims
- Minimal performance impact (~5% overhead)

### Simulation Duration

**Typical Values:**
- **60 seconds:** Quick simulation, good for most bosses
- **120 seconds:** More accurate proc uptime, recommended for trinket testing
- **180 seconds:** Very accurate, but slower runtime

**Trade-offs:**
- Longer duration = more boss attacks = more accurate results
- Longer duration = more iterations needed for same accuracy
- Diminishing returns above 180 seconds

---

## Common Patterns

### Running a Simulation

```javascript
// Build character data
const characterData = {
    selectedClass: 'warrior',
    gearStats: getGearStats(),
    talentBonuses: getTalentBonuses(),
    activeBuffs: getActiveBuffs(),
    equippedItems: getEquippedItems(),
    // ... etc
}

// Get boss data
const boss = {
    id: 'patchwerk',
    name: 'Patchwerk',
    level: 63,
    minDamage: 2000,
    maxDamage: 3000,
    attackSpeed: 1.2
}

// Run simulation
const results = await runTankSimulation(
    characterData,
    boss,
    60,        // 60 seconds
    1000,      // 1000 iterations
    { yieldEvery: 100 }
)

// Access results
console.log('Avg damage per attack:', results.avgDamagePerAttack)
console.log('Dodge %:', results.dodgePercent)
console.log('Gibbability:', results.gibbabilityRating)
console.log('Stat weights:', results.statWeights)
```

### Comparing Gear

```javascript
// Simulate with current gear
const resultsA = await runTankSimulation(characterDataA, boss, 60, 1000)

// Simulate with new gear
const resultsB = await runTankSimulation(characterDataB, boss, 60, 1000)

// Compare
const ehpDiff = resultsB.statWeights.avoidance1PercentEHP - resultsA.statWeights.avoidance1PercentEHP
const survivalDiff = resultsB.minHitsToKill - resultsA.minHitsToKill

console.log('EHP difference:', ehpDiff)
console.log('Min hits to kill difference:', survivalDiff)
```

---

## Related Files

- **`modules/ui/calculator.js`** - `calculateEffectiveHealth()` function used for stat calculations
- **`modules/character/stats.js`** - `parseStatsFromTooltip()` for parsing item stats
- **`modules/gear/procs.js`** - Proc definitions and proc system functions
  - `findActiveProcs()` - Find active procs from items/buffs/talents
  - `getActiveProcStats()` - Get current proc stat modifiers
  - `updateProcStates()` - Update proc active/expired states
  - `checkProcChance()` - Roll proc chance
- **`raidDefinitions.js`** - Boss database (populated in app.js)
- **`app.js`** - Tank simulator UI and boss selection
  - `runSimulation()` - Main UI entry point
  - `displaySimulationResults()` - Renders sim results
  - `renderDamageGraph()` - Damage timeline visualization
  - `renderProcUptimeTimeline()` - Proc uptime visualization

---

## Known Issues / TODOs

1. **Boss database placeholder** (Lines 7-11)
   - Currently hardcoded with 2 example bosses
   - Should be populated from `raidDefinitions.js`

2. **Parry haste verification** (Lines 1021-1048)
   - Currently logged for debugging
   - Could be exposed in UI for transparency

3. **Proc averaging mode calculation** (Lines 212-229)
   - Uses mode instead of average to reduce outlier impact
   - Could be configurable (mode vs average vs median)

4. **Death scenario iterations hardcoded** (Line 1254)
   - 10,000 iterations for death metrics
   - Could be configurable for faster results

5. **Stat weight caps** (Lines 1513-1515, etc.)
   - Caps values at 1,000,000 to prevent display issues
   - Could be refined for better edge case handling

6. **Hunter Deterrence implementation** (Lines 667-677)
   - Reactive ability (activates when about to die)
   - Only class with this mechanic - could be generalized

7. **No multi-target simulation**
   - Only simulates single boss
   - Could add AoE tank scenarios (trash packs)

---

## Testing Strategy

### Unit Testing (Recommended)

**Test Attack Table Resolution:**
```javascript
// Test with 100% dodge
characterData.dodge = 100
results = runSingleSimulation(...)
expect(results.dodges).toBe(results.numHits)
expect(results.hits + results.crits + results.crushes).toBe(0)
```

**Test Stat Weights:**
```javascript
// Test stamina scaling
const weights1 = calculateStatWeights(totals1, boss, ...)
const weights2 = calculateStatWeights(totals2, boss, ...)
// Weights should scale proportionally with health/DR changes
```

**Test Parry Haste:**
```javascript
// Run with fast player weapon vs slow weapon
// Fast weapon should trigger more parry hastes
```

**Test Proc System:**
```javascript
// Test on-use proc activation
// Verify triggers = ceil(timeInSeconds / cooldown)
```

### Integration Testing

**Manual Testing Checklist:**
- [ ] Run simulation with no gear (verify baseline stats)
- [ ] Run simulation with full BiS gear (verify stat weights reasonable)
- [ ] Test with various defense levels (200, 350, 440)
- [ ] Test crush immunity (verify crushChance = 0 when total mitigation >= 100%)
- [ ] Test crit immunity (verify critChance = 0 at 440 defense)
- [ ] Test avoidance cap (verify all attacks avoided at 100%+ avoidance)
- [ ] Test Holy Shield proc (verify 4 blocks, correct uptime)
- [ ] Test Redoubt proc (verify 5 blocks, correct trigger rate)
- [ ] Test parry haste (verify more attacks when boss parries)
- [ ] Test Deterrence (Hunter - verify activates when about to die)
- [ ] Verify damage timeline matches attack count
- [ ] Verify stat weights are finite and > 0

---

## Version History

- **Original:** Basic combat simulation with attack table
- **Added:** Parry haste mechanics (time-based event loop)
- **Added:** Proc system integration (on-use, chance-on-hit, buff-based)
- **Added:** Death scenario analysis (Gibbability Rating)
- **Added:** Stat weight calculation (EHP-based)
- **Added:** Multiple iterations with averaging (1000+ iterations)
- **Current:** Full tank simulation engine with all mechanics

---

## Architecture Philosophy

**tankSimulator.js serves as the simulation engine** - it should:
- ✅ Provide accurate combat simulation
- ✅ Handle complex mechanics (parry haste, procs, attack table)
- ✅ Generate actionable stat weights for gear optimization
- ✅ Average results across iterations for RNG smoothing
- ❌ NOT contain UI code (delegate to app.js)
- ❌ NOT contain boss data (delegate to raidDefinitions.js)
- ❌ NOT contain proc definitions (delegate to procs.js)

**Future Improvements:**
- Separate stat weight calculation into its own module
- Extract death scenario analysis into separate function
- Add multi-target simulation support
- Add threat simulation (TPS tracking)
- Optimize performance for 10,000+ iteration runs
