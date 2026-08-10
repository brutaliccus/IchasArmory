// modules/tank/tankSimulator.js - Tank damage simulation
import { calculateEffectiveHealth } from '../ui/calculator.js';
import { parseStatsFromTooltip } from '../character/stats.js';
import { findActiveProcs, getActiveProcStats, updateProcStates, checkProcChance } from '../gear/procs.js';

// Boss database - will be populated from scraping or manual entry
// Format: { id, name, level, minDamage, maxDamage, attackSpeed }
const bossDatabase = [
    // Example entries - will be expanded with scraped data
    { id: 'ragnaros', name: 'Ragnaros', level: 63, minDamage: 2000, maxDamage: 3000, attackSpeed: 2.0 },
    { id: 'onyxia', name: 'Onyxia', level: 63, minDamage: 1500, maxDamage: 2500, attackSpeed: 2.5 },
];

/**
 * Get player weapon speed from characterData
 * Tries to get from gearStats first, otherwise defaults to 2.0 (typical 1H weapon)
 * Applies haste if available
 */
function getPlayerWeaponSpeed(characterData, totals) {
    // Try to get weapon speed from gearStats
    let baseWeaponSpeed = characterData.gearStats?.weaponSpeed;
    
    // If not found, default to 2.0 (typical 1H weapon speed)
    // This is reasonable since most tanks use 1H weapons
    if (!baseWeaponSpeed || baseWeaponSpeed <= 0) {
        baseWeaponSpeed = 2.0;
        console.log('[PARRY HASTE] Player weapon speed not found in gearStats, using default 2.0s');
    } else {
        console.log('[PARRY HASTE] Player weapon speed from gearStats:', baseWeaponSpeed);
    }
    
    // Apply haste if available (haste reduces weapon speed)
    // Formula: newSpeed = baseSpeed / (1 + haste/100)
    const haste = totals?.haste || 0;
    const hastedSpeed = baseWeaponSpeed / (1 + haste / 100);
    
    console.log('[PARRY HASTE] Player weapon speed calculation:', {
        baseSpeed: baseWeaponSpeed,
        haste: haste,
        hastedSpeed: hastedSpeed.toFixed(2)
    });
    
    return hastedSpeed;
}

/**
 * Run tank simulation with crits and crushes
 * @param {Object} characterData - Character stats from calculator
 * @param {Object} boss - Boss data
 * @param {number} timeInSeconds - Time to simulate in seconds
 * @param {number} iterations - Number of iterations to run (default: 1000)
 * @param {Object} [options] - { yieldEvery: number } yield to browser every N iterations (0 = no yield)
 * @returns {Promise<Object>} Simulation results (averaged across iterations)
 */
export async function runTankSimulation(characterData, boss, timeInSeconds, iterations = 1000, options = {}) {
    const yieldEvery = (options && options.yieldEvery) || 0;
    // Boss base attack speed (default 2.0 seconds)
    const baseAttackSpeed = boss.attackSpeed || 2.0;

    // Calculate attack speed reduction from debuffs
    let attackSpeedReduction = 0;
    characterData.activeBuffs.forEach(buff => {
        attackSpeedReduction += buff.attack_speed_reduction || 0;
    });

    // Apply attack speed reduction (e.g., Thunderfury 25% = 0.25)
    const effectiveAttackSpeed = baseAttackSpeed * (1 + attackSpeedReduction);

    // Get player weapon speed for parry haste calculations
    const totals = calculateEffectiveHealth(characterData);
    const playerWeaponSpeed = getPlayerWeaponSpeed(characterData, totals);
    
    // Find active procs from equipped items, active buffs, and talents
    const equippedItems = characterData.equippedItems || [];
    const activeBuffs = characterData.activeBuffs || [];
    const activeProcs = findActiveProcs(equippedItems, activeBuffs, characterData);
    
    if (activeProcs.length > 0) {
        console.log('[PROCS] Found active procs:', activeProcs.map(p => p.name));
    }

    // Run multiple iterations and aggregate results
    const allResults = [];
    let firstIterationDamageSequence = null;
    for (let iter = 0; iter < iterations; iter++) {
        const iterationResult = runSingleSimulation(characterData, boss, timeInSeconds, effectiveAttackSpeed, playerWeaponSpeed, activeProcs);
        allResults.push(iterationResult);
        // Store damage sequence from first iteration for graphing
        if (iter === 0) {
            firstIterationDamageSequence = iterationResult.damageSequence;
        }
        // Yield to browser periodically to prevent UI freeze (same pattern as DPS sim)
        if (yieldEvery > 0 && (iter + 1) % yieldEvery === 0) {
            await new Promise(resolve => setTimeout(resolve, 0));
        }
    }

    // Count total hits across all iterations to get average
    const totalHits = allResults.reduce((sum, r) => sum + r.hits + r.dodges + r.parries + r.misses + r.blocks + r.crits + r.crushes, 0);
    const avgHits = totalHits / iterations;

    // Average all results
    const averagedResults = averageSimulationResults(allResults, avgHits, characterData, boss, timeInSeconds, effectiveAttackSpeed);
    
    // Add damage sequence and attack timestamps from first iteration for graphing
    averagedResults.damageSequence = firstIterationDamageSequence;
    averagedResults.attackTimestamps = allResults[0].attackTimestamps || [];
    
    // Average proc stats across iterations
    if (allResults.length > 0 && allResults[0].procStats) {
        const procStatsMap = {};
        const procIds = new Set();
        
        // Collect all proc IDs
        allResults.forEach(result => {
            if (result.procStats) {
                Object.keys(result.procStats).forEach(procId => procIds.add(procId));
            }
        });
        
        // Calculate mode (most frequent value) for each proc
        procIds.forEach(procId => {
            let totalUptimePercent = 0;
            let maxUptime = 0;
            let count = 0;
            
            // Track all values for mode calculation
            const triggerValues = [];
            const uptimeValues = [];
            
            allResults.forEach(result => {
                if (result.procStats && result.procStats[procId]) {
                    const stats = result.procStats[procId];
                    const triggers = stats.triggers || 0;
                    const uptime = stats.totalUptime || 0;
                    
                    triggerValues.push(triggers);
                    uptimeValues.push(uptime);
                    maxUptime = Math.max(maxUptime, stats.maxUptime || 0);
                    totalUptimePercent += stats.uptimePercent || 0;
                    count++;
                }
            });
            
            if (count > 0) {
                // Calculate mode for triggers (discrete values)
                const triggerMode = calculateMode(triggerValues);

                // Calculate mode for uptime (round to 0.1s precision for meaningful mode)
                const roundedUptimes = uptimeValues.map(u => Math.round(u * 10) / 10);
                const uptimeMode = calculateMode(roundedUptimes);

                // Preserve activationTimes from the first iteration for timeline visualization
                const firstIterationWithActivations = allResults.find(r =>
                    r.procStats?.[procId]?.activationTimes?.length > 0
                );

                procStatsMap[procId] = {
                    triggers: triggerMode,
                    totalUptime: uptimeMode,
                    maxUptime: maxUptime,
                    uptimePercent: totalUptimePercent / count,
                    activationTimes: firstIterationWithActivations?.procStats?.[procId]?.activationTimes || []
                };
            }
        });
        
        console.log('[PROC STATS] Averaged proc stats:', procStatsMap);
        
        averagedResults.procStats = procStatsMap;
    }
    
    // Add parry haste stats for display
    const firstIteration = allResults[0];
    averagedResults.parryHasteStats = {
        playerAttacks: firstIteration.playerAttacks || 0,
        bossParries: firstIteration.bossParries || 0,
        parryHasteApplied: firstIteration.parryHasteCount || 0,
        expectedBossAttacks: Math.floor(timeInSeconds / effectiveAttackSpeed),
        actualBossAttacks: firstIteration.damageSequence ? firstIteration.damageSequence.length : 0,
        playerWeaponSpeed: playerWeaponSpeed,
        effectiveBossAttackSpeed: effectiveAttackSpeed
    };
    
    // Deterrence (Hunter): average stats across iterations when talented
    const hasDeterrence = (characterData.selectedClass || '') === 'hunter' && (characterData.talentBonuses || {}).deterrence_rank > 0;
    if (hasDeterrence && allResults.length > 0) {
        let sumTriggers = 0, sumUptime = 0;
        let firstWithActivations = null;
        for (const r of allResults) {
            if (r.deterrenceStats) {
                sumTriggers += r.deterrenceStats.triggers || 0;
                sumUptime += r.deterrenceStats.totalUptime || 0;
                if (!firstWithActivations && (r.deterrenceStats.activationTimes || []).length > 0)
                    firstWithActivations = r.deterrenceStats.activationTimes;
            }
        }
        averagedResults.deterrenceStats = {
            triggers: Math.round(sumTriggers / allResults.length),
            totalUptime: sumUptime / allResults.length,
            activationTimes: firstWithActivations || []
        };
    }
    
    return averagedResults;
}

/**
 * Calculate the mode (most frequent value) from an array of numbers
 * @param {Array<number>} values - Array of numeric values
 * @returns {number} The mode (most frequent value)
 */
function calculateMode(values) {
    if (!values || values.length === 0) return 0;
    
    // Count frequency of each value
    const frequencyMap = {};
    let maxFreq = 0;
    let mode = values[0];
    
    for (const value of values) {
        frequencyMap[value] = (frequencyMap[value] || 0) + 1;
        if (frequencyMap[value] > maxFreq) {
            maxFreq = frequencyMap[value];
            mode = value;
        }
    }
    
    return mode;
}

/**
 * Run a single simulation iteration with parry haste mechanics
 * @param {Object} characterData - Character stats from calculator
 * @param {Object} boss - Boss data
 * @param {number} timeInSeconds - Time to simulate in seconds
 * @param {number} baseBossAttackSpeed - Base boss attack speed (after debuffs)
 * @param {number} playerWeaponSpeed - Player weapon speed (after haste)
 * @param {Array} activeProcs - Array of active proc definitions
 * @returns {Object} Single iteration results
 */
function runSingleSimulation(characterData, boss, timeInSeconds, baseBossAttackSpeed, playerWeaponSpeed, activeProcs = []) {
    const totals = calculateEffectiveHealth(characterData);
    
    // Initialize results object early so we can track proc stats
    const results = {
        totalDamage: 0,
        hits: 0,
        crits: 0,
        crushes: 0,
        dodges: 0,
        parries: 0,
        blocks: 0,
        misses: 0,
        blockDamage: 0,
        hitDamage: 0,
        critDamage: 0,
        crushDamage: 0,
        landedHits: 0, // blocks + hits + crits + crushes (not dodges/parries/misses)
        damageReducedFromBlock: 0, // Total damage reduced by block value
        damageSequence: [], // Track damage per attack for graphing
        attackTimestamps: [], // Track when each boss attack occurred (for parry haste verification)
        // Parry haste tracking
        parryHasteCount: 0, // Number of times parry haste was applied
        playerAttacks: 0, // Total player attacks
        bossParries: 0, // Total boss parries (15% of player attacks)
        // Proc uptime tracking
        procStats: {} // { procId: { triggers: number, totalUptime: number, maxUptime: number, uptimePercent: number } }
    };
    
    // Initialize proc states
    const procStates = {};
    for (const proc of activeProcs) {
        // If proc comes from a buff (e.g., Stoneshield Potion), it should start active
        // since buffs are used before combat starts
        const fromBuff = proc.fromBuff === true;
        const fromTalent = proc.fromTalent === true;
        
        // Talent-based procs that are always active (procType === 'talent')
        const isTalentProc = proc.procType === 'talent' && fromTalent;
        
        // Redoubt is chanceOnHit, not always active, so it starts inactive
        const shouldStartActive = (fromBuff && proc.procType === 'onUse') && !isTalentProc;
        
        // For talent procs with Infinity duration, set expiresAt to a very large number
        const procDuration = isTalentProc && proc.duration === Infinity ? Number.MAX_SAFE_INTEGER : proc.duration;
        
        procStates[proc.id] = {
            lastUsed: shouldStartActive ? 0 : -proc.cooldown,
            isActive: shouldStartActive, // Most procs start inactive (activate when proc)
            expiresAt: shouldStartActive ? procDuration : 0,
            activationTime: shouldStartActive ? 0 : undefined, // Track when buff-based procs start
            blocksRemaining: proc.maxBlocks ? proc.maxBlocks : undefined // For Redoubt
        };
        
        // Initialize proc stats for this proc
        results.procStats[proc.id] = {
            triggers: 0,
            totalUptime: 0,
            maxUptime: 0,
            uptimePercent: 0
        };
        
        // If proc starts active (e.g., Stoneshield Potion from buff), record the activation
        if (shouldStartActive) {
            results.procStats[proc.id].triggers = 1; // Count as 1 trigger (used before combat)
            results.procStats[proc.id].activationTimes = [{
                start: 0,
                end: procDuration,
                duration: procDuration
            }];
        }
    }
    
    // Get defensive stats (base, will be modified by procs during simulation)
    const dodge = totals.dodge || 0;
    const parry = totals.parry || 0;
    const block = totals.block || 0;
    let blockValue = totals.blockValue || 0;
    const physicalDR = totals.physicalDR || 0;
    const defense = totals.defense || 0;
    const attackerLevel = characterData.attackerLevel || 63;
    const selectedClass = characterData.selectedClass || '';
    const talentBonuses = characterData.talentBonuses || {};
    const hasDeterrence = selectedClass === 'hunter' && (talentBonuses.deterrence_rank > 0);
    
    // Calculate miss chance (5% base + defense skill bonus)
    // Defense skill vs level 63: (defense - 300) * 0.04% miss chance
    const defenseSkill = defense - 300; // Base defense is 300
    const missChance = 5.0 + (defenseSkill * 0.04);
    
    // Boss crit chance: 5.6% base, reduced by defense
    // Defense reduces crit by 0.04% per point above 300
    // At 440 defense: 5.6 - (440-300)*0.04 = 5.6 - 5.6 = 0% crit
    const critReduction = Math.max(0, (defense - 300) * 0.04);
    const critChance = Math.max(0, 5.6 - critReduction);
    
    // Boss crush chance: 15% base (not reduced by defense)
    const crushChance = 15.0;
    
    // Calculate true avoidance (dodge + parry + miss)
    const trueAvoidance = dodge + parry + missChance;
    const avoidanceCap = 100; // If dodge + parry + miss >= 100%, everything else is pushed off
    
    // Calculate total mitigation (dodge + parry + miss + block)
    const totalMitigation = trueAvoidance + block;
    
    // If dodge + parry + miss >= 100%, block/crit/crush/hit are all pushed off the table
    const isOverAvoidanceCap = trueAvoidance >= avoidanceCap;
    
    // Block prevents crits/crushes, but block gets reduced if total mitigation exceeds 100%
    // Block is reduced if dodge + parry + miss + block > 100%
    // Note: This is the base effectiveBlock. Proc block chance will be added dynamically during simulation
    let baseEffectiveBlock = block;
    if (totalMitigation > 100) {
        // Reduce block by the amount over 100%
        const overCap = totalMitigation - 100;
        baseEffectiveBlock = Math.max(0, block - overCap);
    }
    
    // Debug logging
    console.log('[TANK SIM] Stats:', {
        dodge: dodge.toFixed(2),
        parry: parry.toFixed(2),
        block: block.toFixed(2),
        baseEffectiveBlock: baseEffectiveBlock.toFixed(2),
        missChance: missChance.toFixed(2),
        defense: defense,
        defenseSkill: defenseSkill,
        critChance: critChance.toFixed(2),
        crushChance: crushChance.toFixed(2)
    });
    
    // Calculate hit chance (using base effectiveBlock - proc block chance will be added dynamically during attacks)
    let hitChance = 0;
    if (!isOverAvoidanceCap) {
        // Attack table: Dodge → Parry → Miss → Block → Crit → Crush → Hit
        // Block prevents crits/crushes (comes before them in attack table)
        // But if dodge + parry + miss >= 100%, block is pushed off and can't prevent crits/crushes
        const usedChance = missChance + dodge + parry + baseEffectiveBlock + critChance + crushChance;
        hitChance = Math.max(0, 100 - usedChance);
    }
    
    // Results object was already initialized earlier for proc tracking
    // All fields are already initialized, so we don't need to redeclare it
    
    // Initialize proc stats for all active procs (so they show up in the table even if they never trigger)
    for (const proc of activeProcs) {
        results.procStats[proc.id] = {
            triggers: 0,
            totalUptime: 0,
            maxUptime: 0,
            uptimePercent: 0,
            activationTimes: []
        };
    }
    
    // Deterrence (Hunter): reactive on-use, 25% dodge/parry for 10s, 6min CD. Activate when 3 consecutive landed hits and next would kill.
    let currentHealth = totals.health || 0;
    let consecutiveLandedHits = 0;
    let deterrenceActiveUntil = 0;
    let deterrenceCooldownUntil = 0;
    if (hasDeterrence) {
        results.deterrenceStats = { triggers: 0, totalUptime: 0, activationTimes: [] };
    }
    
    // Time-based simulation with parry haste
    let currentTime = 0;
    let nextBossAttackTime = baseBossAttackSpeed; // Time when boss will next attack
    let nextPlayerAttackTime = playerWeaponSpeed; // Time when player will next attack

    // Boss parry chance: 15%
    const bossParryChance = 15.0;
    const baseBossSwingTime = baseBossAttackSpeed; // Store base for parry haste calculations

    // Pre-combat: Activate on-use procs that are ready at time 0 (e.g., Holy Shield)
    for (const proc of activeProcs) {
        if (proc.procType === 'onUse' && procStates[proc.id]) {
            const state = procStates[proc.id];
            const timeSinceLastUse = currentTime - state.lastUsed;

            // Activate if cooldown is ready (should be for all on-use procs at start)
            if (!state.isActive && timeSinceLastUse >= proc.cooldown && timeInSeconds >= proc.duration) {
                // Initialize proc stats if not exists
                if (!results.procStats[proc.id]) {
                    results.procStats[proc.id] = {
                        triggers: 0,
                        totalUptime: 0,
                        maxUptime: 0,
                        uptimePercent: 0
                    };
                }

                // Track proc trigger
                results.procStats[proc.id].triggers++;

                // Store statModifiers in state
                if (proc.statModifiers) {
                    state.statModifiers = { ...proc.statModifiers };
                }

                state.lastUsed = currentTime;
                state.isActive = true;
                state.expiresAt = currentTime + proc.duration;
                state.activationTime = currentTime;

                // Track uptime for this activation
                if (!results.procStats[proc.id].activationTimes) {
                    results.procStats[proc.id].activationTimes = [];
                }
                results.procStats[proc.id].activationTimes.push({
                    start: currentTime,
                    end: currentTime + proc.duration,
                    duration: proc.duration
                });

                // Initialize blocks remaining for procs that expire after max blocks (Holy Shield)
                if (proc.maxBlocks) {
                    state.blocksRemaining = proc.maxBlocks;
                }

                console.log(`[PROCS] ${proc.name || proc.id} activated at start of combat (time 0s), expires at ${(currentTime + proc.duration).toFixed(2)}s`);
            }
        }
    }

    // Check for chance-on-hit procs when player takes damage
    const checkChanceOnHitProcs = (procs, states, time) => {
        for (const proc of procs) {
            if (proc.procType === 'chanceOnHit') {
                const state = states[proc.id];
                if (!state) continue;
                
                // Special handling for Redoubt - must check if talent is learned and get dynamic proc chance
                if (proc.id === 'redoubt') {
                    // Check if Redoubt talent is learned before allowing proc
                    const redoubtPoints = proc.getTalentRank ? proc.getTalentRank.call(proc, characterData) : 0;
                    
                    // Only proc if talent is learned
                    if (redoubtPoints === 0) {
                        continue; // Skip if talent not learned
                    }
                    
                    // Get dynamic proc chance based on talent rank (2/4/6/8/10%)
                    if (proc.getProcChance) {
                        const dynamicProcChance = proc.getProcChance.call(proc, characterData);
                        // Temporarily override proc chance for this check
                        const originalProcChance = proc.procChance;
                        proc.procChance = dynamicProcChance;
                        const shouldProc = checkProcChance(proc);
                        proc.procChance = originalProcChance; // Restore original
                        
                        if (!shouldProc) {
                            continue; // Proc chance roll failed
                        }
                    } else {
                        // Fallback to standard check
                        if (!checkProcChance(proc)) {
                            continue;
                        }
                    }
                } else {
                    // Check if proc should trigger (based on procChance) for other procs
                    if (!checkProcChance(proc)) {
                        continue;
                    }
                }
                
                // Proc triggered - proceed with activation
                    // Initialize proc stats if not exists
                    if (!results.procStats[proc.id]) {
                        results.procStats[proc.id] = {
                            triggers: 0,
                            totalUptime: 0,
                            maxUptime: 0
                        };
                    }
                    
                    // Track proc trigger
                    results.procStats[proc.id].triggers++;
                    
                    // For Redoubt, get block chance based on talent rank when it procs
                    let statModifiers = proc.statModifiers || {};
                    if (proc.id === 'redoubt' && proc.getTalentStats) {
                        const talentStats = proc.getTalentStats.call(proc, characterData);
                        if (talentStats) {
                            statModifiers = { ...statModifiers, ...talentStats };
                            // Store the actual modifiers for this proc activation (with talent-based block chance)
                            state.statModifiers = statModifiers;
                        } else {
                            continue; // Talent not learned, skip proc
                        }
                    } else {
                        // For other procs, store base statModifiers if not already set
                        if (!state.statModifiers) {
                            state.statModifiers = statModifiers;
                        }
                    }
                    
                    // Activate the proc
                    state.isActive = true;
                    state.expiresAt = time + proc.duration;
                    state.lastUsed = time;
                    state.activationTime = time; // Track when this activation started
                    
                    // Track uptime for this activation
                    if (!results.procStats[proc.id].activationTimes) {
                        results.procStats[proc.id].activationTimes = [];
                    }
                    results.procStats[proc.id].activationTimes.push({
                        start: time,
                        end: time + proc.duration,
                        duration: proc.duration
                    });
                    
                    // Initialize blocks remaining for procs that expire after max blocks (Redoubt, Holy Shield)
                    if (proc.maxBlocks) {
                        state.blocksRemaining = proc.maxBlocks;
                    }
                    
                    if (proc.id === 'bulwark_of_enduring_earth') {
                        console.log(`[PROCS] Bulwark of Enduring Earth proc'd at ${time.toFixed(2)}s, expires at ${state.expiresAt.toFixed(2)}s`);
                    } else if (proc.id === 'redoubt') {
                        const blockChance = statModifiers.blockChance || 0;
                        console.log(`[PROCS] Redoubt proc'd at ${time.toFixed(2)}s (${blockChance}% block), expires at ${state.expiresAt.toFixed(2)}s or after ${proc.maxBlocks} blocks`);
                    } else if (proc.id === 'holy_shield') {
                        const blockChance = statModifiers.blockChance || 0;
                        console.log(`[PROCS] Holy Shield activated at ${time.toFixed(2)}s (${blockChance}% block), expires at ${state.expiresAt.toFixed(2)}s or after ${proc.maxBlocks} blocks`);
                    } else if (proc.id === 'lion_horn_of_stormwind') {
                        console.log(`[PROCS] The Lion Horn of Stormwind proc'd at ${time.toFixed(2)}s, expires at ${state.expiresAt.toFixed(2)}s`);
                    }
            }
        }
    };
    
    // Process boss attack
    const processBossAttack = () => {
        // Track when this attack occurred (for parry haste verification)
        results.attackTimestamps.push(currentTime);
        
        // Update proc states and get current proc stats before this attack
        updateProcStates(activeProcs, currentTime, procStates);

        // Close activations for procs that just expired
        for (const proc of activeProcs) {
            const procState = procStates[proc.id];
            if (procState && !procState.isActive && results.procStats[proc.id] && results.procStats[proc.id].activationTimes) {
                const activations = results.procStats[proc.id].activationTimes;
                // Check if the last activation is still open (no end time)
                if (activations.length > 0) {
                    const lastActivation = activations[activations.length - 1];
                    if (!lastActivation.end || lastActivation.end > currentTime) {
                        // Close this activation at the current time
                        lastActivation.end = currentTime;
                        lastActivation.duration = currentTime - lastActivation.start;
                        console.log(`[PROCS] ${proc.name} expired at ${currentTime.toFixed(2)}s (duration: ${lastActivation.duration.toFixed(2)}s)`);
                    }
                }
            }
        }

        const procStats = getActiveProcStats(activeProcs, currentTime, procStates, characterData);

        // Apply proc block chance (e.g., Holy Shield +45%, Redoubt +3-15%)
        // Start with base effectiveBlock, then add proc block chance
        let effectiveBlock = baseEffectiveBlock;
        if (procStats.blockChance) {
            const procBlockChance = procStats.blockChance;
            effectiveBlock += procBlockChance;
            // Recalculate total mitigation with proc block chance
            const totalMitigationWithProc = trueAvoidance + effectiveBlock;
            // If total mitigation exceeds 100%, reduce block proportionally
            if (totalMitigationWithProc > 100) {
                const overCap = totalMitigationWithProc - 100;
                effectiveBlock = Math.max(0, effectiveBlock - overCap);
            }
        }
        
        // Apply proc stat modifiers (e.g., blockValue from Glyph of Deflection, armor/blockValue from Bulwark)
        let currentBlockValue = blockValue;
        if (procStats.blockValue) {
            currentBlockValue = blockValue + procStats.blockValue;
        }
        
        // Apply armor from procs (e.g., Bulwark of Enduring Earth)
        // Note: This recalculates DR for each attack, accounting for proc armor
        let procArmorBonus = procStats.armor || 0;
        
        // Calculate effective physical DR with proc armor
        // Base physicalDR from totals already includes armor + other DR sources
        // We need to add the proc armor contribution
        let effectivePhysicalDR = physicalDR;
        if (procArmorBonus > 0) {
            const baseArmor = totals.armor || 0;
            const enhancedArmor = baseArmor + procArmorBonus;
            const attackerLevel = characterData.attackerLevel || 63;
            
            // Recalculate armor DR with proc bonus (using diminishing returns, no hard cap)
            // Formula: DR = armor / (armor + 400 + 85 * attackerLevel)
            const enhancedArmorDR = enhancedArmor / (enhancedArmor + 400 + 85 * attackerLevel);
            
            // Base armor DR from totals
            const baseArmorDR = totals.armor ? totals.armor / (totals.armor + 400 + 85 * attackerLevel) : 0;
            
            // If proc armor increases beyond base, recalculate
            if (enhancedArmorDR > baseArmorDR) {
                // Calculate the DR increase from proc armor
                // This is a simplified approach that assumes proc armor DR stacks multiplicatively
                // with other DR sources (which is how armor DR works)
                const armorDRIncrease = enhancedArmorDR - baseArmorDR;
                
                // Apply the armor DR increase to the total physical DR
                // Since physicalDR already includes base armor DR, we need to add the increase
                // accounting for the multiplicative nature of DR stacking
                // Simplified: add the DR increase (this assumes the increase is small)
                effectivePhysicalDR = Math.min(1, physicalDR + armorDRIncrease);
            }
        }
        
        // Get flat damage reduction from buffs (e.g., Stoneskin Totem - applied BEFORE armor/DR)
        // Calculate once before all damage types
        let flatDamageReduction = 0;
        characterData.activeBuffs.forEach(buff => {
            flatDamageReduction += buff.flatDamageReduction || 0;
        });
        
        // Deterrence (Hunter): reactive 25% dodge/parry for 10s, 6min CD. Activate when 3 consecutive landed hits and next would kill (worst case = crit).
        if (hasDeterrence && consecutiveLandedHits >= 3 && currentTime >= deterrenceCooldownUntil && currentTime >= deterrenceActiveUntil) {
            const maxDamageNext = Math.max(0, boss.maxDamage - flatDamageReduction) * (1 - effectivePhysicalDR) * 2;
            if (currentHealth <= maxDamageNext) {
                deterrenceActiveUntil = currentTime + 10;
                deterrenceCooldownUntil = currentTime + 360;
                results.deterrenceStats.triggers++;
                results.deterrenceStats.totalUptime += 10;
                results.deterrenceStats.activationTimes.push({ start: currentTime, end: currentTime + 10, duration: 10 });
            }
        }
        const deterrenceActive = hasDeterrence && currentTime < deterrenceActiveUntil;
        const effectiveDodge = dodge + (deterrenceActive ? 25 : 0);
        const effectiveParry = parry + (deterrenceActive ? 25 : 0);
        
        const roll = Math.random() * 100;
        let damageThisHit = 0;
        
        // Attack table order: Dodge → Parry → Miss → Block → Crit → Crush → Hit (use effectiveDodge/effectiveParry for Deterrence)
        if (roll < effectiveDodge) {
            results.dodges++;
        } else if (roll < effectiveDodge + effectiveParry) {
            results.parries++;
        } else if (roll < effectiveDodge + effectiveParry + missChance) {
            results.misses++;
        } else if (roll < effectiveDodge + effectiveParry + missChance + effectiveBlock) {
            // Blocked hit
            results.blocks++;
            results.landedHits++;
            
            const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
            
            // Apply flat damage reduction BEFORE armor/DR
            const damageAfterFlatReduction = Math.max(0, rawDamage - flatDamageReduction);
            
            const afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR);
            const blockedDamage = Math.max(0, afterDR - currentBlockValue);
            const damageReduced = Math.min(currentBlockValue, afterDR);
            
            results.blockDamage += blockedDamage;
            results.totalDamage += blockedDamage;
            results.damageReducedFromBlock += damageReduced;
            damageThisHit = blockedDamage;
            
            // Check for chance-on-hit procs (only triggers on landed hits that deal damage)
            if (blockedDamage > 0) {
                checkChanceOnHitProcs(activeProcs, procStates, currentTime);
                
                // Decrement block counter for procs that expire after max blocks (Redoubt, Holy Shield)
                const blockExpiringProcs = activeProcs.filter(p => p.maxBlocks !== undefined);
                for (const proc of blockExpiringProcs) {
                    const procState = procStates[proc.id];
                    if (procState && procState.isActive && procState.blocksRemaining !== undefined) {
                        procState.blocksRemaining--;
                        if (procState.blocksRemaining <= 0) {
                            // Expires after max blocks - update activationTimes to reflect actual expiration
                            const activationTime = procState.activationTime || 0;
                            if (results.procStats[proc.id] && results.procStats[proc.id].activationTimes) {
                                // Find the most recent activation (should be the last one)
                                const activations = results.procStats[proc.id].activationTimes;
                                if (activations.length > 0) {
                                    const lastActivation = activations[activations.length - 1];
                                    // Update the end time to the actual expiration time (when blocks ran out)
                                    lastActivation.end = currentTime;
                                    lastActivation.duration = currentTime - lastActivation.start;
                                    console.log(`[PROCS] ${proc.name} expired early at ${currentTime.toFixed(2)}s (actual uptime: ${lastActivation.duration.toFixed(2)}s) after ${proc.maxBlocks} blocks`);
                                }
                            }
                            procState.isActive = false;
                            procState.expiresAt = currentTime; // Update expiresAt to actual expiration
                        }
                    }
                }
            }
        } else if (!isOverAvoidanceCap) {
            const blockEnd = effectiveDodge + effectiveParry + missChance + effectiveBlock;
            if (roll < blockEnd + critChance) {
                // Critical hit
                results.crits++;
                results.landedHits++;
                
                const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
                
                // Apply flat damage reduction BEFORE armor/DR
                const damageAfterFlatReduction = Math.max(0, rawDamage - flatDamageReduction);
                
                const afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR);
                const critDamage = afterDR * 2;
                
                results.critDamage += critDamage;
                results.totalDamage += critDamage;
                damageThisHit = critDamage;
                
                // Check for chance-on-hit procs
                checkChanceOnHitProcs(activeProcs, procStates, currentTime);
            } else if (roll < blockEnd + critChance + crushChance) {
                // Crushing blow
                results.crushes++;
                results.landedHits++;
                
                const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
                
                // Apply flat damage reduction BEFORE armor/DR
                const damageAfterFlatReduction = Math.max(0, rawDamage - flatDamageReduction);
                
                const afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR);
                const crushDamage = afterDR * 1.5;
                
                results.crushDamage += crushDamage;
                results.totalDamage += crushDamage;
                damageThisHit = crushDamage;
                
                // Check for chance-on-hit procs
                checkChanceOnHitProcs(activeProcs, procStates, currentTime);
            } else {
                // Normal hit
                results.hits++;
                results.landedHits++;
                
                const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
                
                // Apply flat damage reduction BEFORE armor/DR
                const damageAfterFlatReduction = Math.max(0, rawDamage - flatDamageReduction);
                
                const afterDR = damageAfterFlatReduction * (1 - effectivePhysicalDR);
                
                results.hitDamage += afterDR;
                results.totalDamage += afterDR;
                damageThisHit = afterDR;
                
                // Check for chance-on-hit procs
                checkChanceOnHitProcs(activeProcs, procStates, currentTime);
            }
        } else {
            results.misses++;
        }
        
        results.damageSequence.push(damageThisHit);
        
        // Deterrence: track consecutive landed hits and current health (reset on dodge/parry/miss)
        if (damageThisHit > 0) {
            consecutiveLandedHits++;
            currentHealth -= damageThisHit;
        } else {
            consecutiveLandedHits = 0;
        }
    };
    
    // Process player attack (check for boss parry and apply parry haste)
    const processPlayerAttack = () => {
        results.playerAttacks++;
        const roll = Math.random() * 100;
        
        // Check if boss parries (15% chance)
        if (roll < bossParryChance) {
            results.bossParries++;
            // Boss parries - apply parry haste
            // Calculate remaining swing time until next boss attack
            const remainingSwingTime = nextBossAttackTime - currentTime;
            const minAllowedTime = baseBossSwingTime * 0.20; // 20% of base timer
            
            // Calculate new timer after 40% reduction
            const reducedTime = remainingSwingTime * 0.60; // Reduce by 40% = multiply by 0.6
            
            // Only apply if it doesn't go below 20% threshold
            if (reducedTime >= minAllowedTime) {
                // Update next boss attack time (current time + reduced swing time)
                const timeSaved = remainingSwingTime - reducedTime;
                const originalNextAttackTime = nextBossAttackTime;
                nextBossAttackTime = currentTime + reducedTime;
                results.parryHasteCount++;
                
                // Debug logging (can be enabled for verification)
                if (results.parryHasteCount <= 10) { // Log first 10 parry hastes for debugging
                    console.log(`[PARRY HASTE] At ${currentTime.toFixed(2)}s: Boss parried player attack. Next attack moved from ${originalNextAttackTime.toFixed(2)}s to ${nextBossAttackTime.toFixed(2)}s (saved ${timeSaved.toFixed(2)}s, remaining was ${remainingSwingTime.toFixed(2)}s)`);
                }
            } else {
                // Parry haste would go below 20% threshold - don't apply
                if (results.bossParries <= 10) {
                    console.log(`[PARRY HASTE] At ${currentTime.toFixed(2)}s: Boss parried but parry haste not applied (would reduce below 20% threshold: ${reducedTime.toFixed(2)}s < ${minAllowedTime.toFixed(2)}s, base speed: ${baseBossSwingTime.toFixed(2)}s)`);
                }
            }
        }
        // If boss doesn't parry, nothing happens to boss attack time
    };
    
    // Main simulation loop - process events in time order
    while (currentTime < timeInSeconds) {
        // Advance time to next event (whichever happens first)
        if (nextBossAttackTime <= nextPlayerAttackTime) {
            // Boss attacks first
            currentTime = nextBossAttackTime;
            if (currentTime <= timeInSeconds) {
                processBossAttack();
                // Schedule next boss attack
                nextBossAttackTime = currentTime + baseBossAttackSpeed;
            }
        } else {
            // Player attacks first
            currentTime = nextPlayerAttackTime;
            if (currentTime <= timeInSeconds) {
                processPlayerAttack();
                // Schedule next player attack
                nextPlayerAttackTime = currentTime + playerWeaponSpeed;
            }
        }
        
        // Check if any onUse procs should be activated (at optimal times)
        for (const proc of activeProcs) {
            if (proc.procType === 'onUse' && procStates[proc.id]) {
                const state = procStates[proc.id];
                const timeSinceLastUse = currentTime - state.lastUsed;
                const timeRemaining = timeInSeconds - currentTime;
                
                // Activate if cooldown is ready and we have time for the full duration
                if (!state.isActive && timeSinceLastUse >= proc.cooldown && timeRemaining >= proc.duration) {
                    // Initialize proc stats if not exists
                    if (!results.procStats[proc.id]) {
                        results.procStats[proc.id] = {
                            triggers: 0,
                            totalUptime: 0,
                            maxUptime: 0
                        };
                    }
                    
                    // Track proc trigger
                    results.procStats[proc.id].triggers++;
                    
                    // Store statModifiers in state (for consistent retrieval in getActiveProcStats)
                    // This ensures blockChance and other modifiers are available when proc is active
                    if (proc.statModifiers) {
                        state.statModifiers = { ...proc.statModifiers };
                    }
                    
                    state.lastUsed = currentTime;
                    state.isActive = true;
                    state.expiresAt = currentTime + proc.duration;
                    state.activationTime = currentTime; // Track activation time
                    
                    // Track uptime for this activation
                    if (!results.procStats[proc.id].activationTimes) {
                        results.procStats[proc.id].activationTimes = [];
                    }
                    results.procStats[proc.id].activationTimes.push({
                        start: currentTime,
                        end: currentTime + proc.duration,
                        duration: proc.duration
                    });
                    
                    // Initialize blocks remaining for procs that expire after max blocks (Redoubt, Holy Shield)
                    if (proc.maxBlocks) {
                        state.blocksRemaining = proc.maxBlocks;
                    }
                    
                    if (proc.id === 'glyph_of_deflection') {
                        console.log(`[PROCS] Glyph of Deflection activated at ${currentTime.toFixed(2)}s, expires at ${state.expiresAt.toFixed(2)}s`);
                    }
                }
            }
        }

        // Update proc states
        updateProcStates(activeProcs, currentTime, procStates);

        // Close activations for procs that just expired
        for (const proc of activeProcs) {
            const procState = procStates[proc.id];
            if (procState && !procState.isActive && results.procStats[proc.id] && results.procStats[proc.id].activationTimes) {
                const activations = results.procStats[proc.id].activationTimes;
                // Check if the last activation is still open (no end time)
                if (activations.length > 0) {
                    const lastActivation = activations[activations.length - 1];
                    if (!lastActivation.end || lastActivation.end > currentTime) {
                        // Close this activation at the current time
                        lastActivation.end = currentTime;
                        lastActivation.duration = currentTime - lastActivation.start;
                        console.log(`[PROCS] ${proc.name} expired at ${currentTime.toFixed(2)}s (duration: ${lastActivation.duration.toFixed(2)}s)`);
                    }
                }
            }
        }
    }

    const numHits = results.hits + results.dodges + results.parries + results.misses + 
                    results.blocks + results.crits + results.crushes;
    
    // Finalize proc uptime calculations
    // Calculate total uptime from activation history
    for (const proc of activeProcs) {
        if (!results.procStats[proc.id]) {
            // Initialize if proc exists but never triggered
            results.procStats[proc.id] = {
                triggers: 0,
                totalUptime: 0,
                maxUptime: 0,
                uptimePercent: 0
            };
            continue;
        }
        
        const procStat = results.procStats[proc.id];
        
        // Calculate total uptime from all activations
        if (procStat.activationTimes && procStat.activationTimes.length > 0) {
            procStat.totalUptime = 0;
            procStat.maxUptime = 0;
            
            for (const activation of procStat.activationTimes) {
                // Calculate actual uptime (capped at simulation end)
                const actualEnd = Math.min(activation.end, timeInSeconds);
                const actualDuration = Math.max(0, actualEnd - activation.start);
                procStat.totalUptime += actualDuration;
                
                // Track max single activation duration
                if (actualDuration > procStat.maxUptime) {
                    procStat.maxUptime = actualDuration;
                }
            }
        } else if (!procStat.activationTimes || procStat.activationTimes.length === 0) {
            // If no activationTimes but proc was active (e.g., Stoneshield Potion from buff that started active)
            // Try to calculate from proc states
            const procState = procStates[proc.id];
            if (procState && procState.activationTime !== undefined) {
                // Proc started active - calculate uptime from start to end (or simulation end, whichever is first)
                const actualEnd = Math.min(timeInSeconds, procState.expiresAt || timeInSeconds);
                const actualDuration = Math.max(0, actualEnd - procState.activationTime);
                procStat.totalUptime = actualDuration;
                
                // Also set maxUptime
                if (actualDuration > procStat.maxUptime) {
                    procStat.maxUptime = actualDuration;
                }
            }
        }
        
        // Calculate uptime percentage
        procStat.uptimePercent = timeInSeconds > 0 
            ? (procStat.totalUptime / timeInSeconds) * 100 
            : 0;
    }
    
    // Debug log proc stats
    if (Object.keys(results.procStats).length > 0) {
        console.log('[PROC STATS] Final proc stats:', results.procStats);
    }
    
    // Calculate expected boss attacks without parry haste
    const expectedBossAttacks = Math.floor(timeInSeconds / baseBossAttackSpeed);
    const actualBossAttacks = numHits;
    const parryHasteEffect = actualBossAttacks - expectedBossAttacks;
    
    // Log parry haste summary
    const damageSequenceLength = results.damageSequence.length;
    
    // Verify attack timestamps show parry haste effect (attacks should cluster/clump when parry haste occurs)
    const attackTimestamps = results.attackTimestamps || [];
    let parryHasteDetectedInTimestamps = false;
    if (attackTimestamps.length > 1 && results.parryHasteCount > 0) {
        // Check if any attacks happened closer together than expected (indicating parry haste)
        for (let i = 1; i < Math.min(attackTimestamps.length, 20); i++) {
            const interval = attackTimestamps[i] - attackTimestamps[i-1];
            if (interval < baseBossAttackSpeed * 0.8) { // Less than 80% of base speed indicates parry haste
                parryHasteDetectedInTimestamps = true;
                break;
            }
        }
    }
    
    console.log('[PARRY HASTE SUMMARY]', {
        playerWeaponSpeed: playerWeaponSpeed.toFixed(2),
        baseBossAttackSpeed: baseBossAttackSpeed.toFixed(2),
        playerAttacks: results.playerAttacks,
        bossParries: results.bossParries,
        parryHasteApplied: results.parryHasteCount,
        expectedBossAttacks,
        actualBossAttacks,
        damageSequenceLength: damageSequenceLength,
        extraBossAttacks: parryHasteEffect,
        parryRate: results.playerAttacks > 0 ? ((results.bossParries / results.playerAttacks) * 100).toFixed(1) + '%' : '0%',
        parryHasteVisibleInTimestamps: parryHasteDetectedInTimestamps,
        firstFewAttackTimes: attackTimestamps.slice(0, 10).map(t => t.toFixed(2))
    });
    
    // Verify damage sequence matches actual attacks
    if (damageSequenceLength !== actualBossAttacks) {
        console.warn('[PARRY HASTE WARNING] Damage sequence length (' + damageSequenceLength + ') does not match actual boss attacks (' + actualBossAttacks + ')');
    }
    
    // Calculate averages
    results.avgLandedHit = results.landedHits > 0 ? results.totalDamage / results.landedHits : 0;
    results.avgBlock = results.blocks > 0 ? results.blockDamage / results.blocks : 0;
    results.avgHit = results.hits > 0 ? results.hitDamage / results.hits : 0;
    results.avgCrit = results.crits > 0 ? results.critDamage / results.crits : 0;
    results.avgCrush = results.crushes > 0 ? results.crushDamage / results.crushes : 0;
    
    // Calculate average damage per attack (weighted by avoidance)
    results.avgDamagePerAttack = numHits > 0 ? results.totalDamage / numHits : 0;
    
    // Calculate percentages
    if (numHits > 0) {
        results.dodgePercent = (results.dodges / numHits) * 100;
        results.parryPercent = (results.parries / numHits) * 100;
        results.blockPercent = (results.blocks / numHits) * 100;
        results.missPercent = (results.misses / numHits) * 100;
        results.hitPercent = (results.hits / numHits) * 100;
        results.critPercent = (results.crits / numHits) * 100;
        results.crushPercent = (results.crushes / numHits) * 100;
    } else {
        results.dodgePercent = 0;
        results.parryPercent = 0;
        results.blockPercent = 0;
        results.missPercent = 0;
        results.hitPercent = 0;
        results.critPercent = 0;
        results.crushPercent = 0;
    }
    results.totalMitigation = totalMitigation;
    results.trueAvoidance = trueAvoidance;
    results.isOverCap = isOverAvoidanceCap; // Based on true avoidance (dodge + parry + miss) >= 100%
    results.effectiveBlock = baseEffectiveBlock; // Base effective block (proc bonuses applied dynamically during attacks)
    
    // Calculate death scenario metrics (min/max hits to kill and Gibbability Rating)
    // Use baseEffectiveBlock for calculations (proc bonuses are handled dynamically during simulation)
    const deathMetrics = calculateDeathMetrics(characterData, boss, dodge, parry, missChance, baseEffectiveBlock, block, blockValue, physicalDR, critChance, crushChance, isOverAvoidanceCap, totals.health, totalMitigation);
    
    // Calculate stat weights (using block rate and gibbability metrics)
    // Use the trueAvoidance we already calculated (dodge + parry + miss, excludes block)
    // For EHP calculations, cap true avoidance at 100% (100% cap is for crit/crush immunity)
    const effectiveAvoidanceForEHP = Math.min(trueAvoidance, 100);
    const statWeights = calculateStatWeights(totals, boss, physicalDR, effectiveAvoidanceForEHP, trueAvoidance, block, blockValue, results.blocks / numHits, deathMetrics.gibbabilityRating, deathMetrics.minHitsToKill, results.avgDamagePerAttack);
    results.statWeights = statWeights;
    results.minHitsToKill = deathMetrics.minHitsToKill;
    results.maxHitsToKill = deathMetrics.maxHitsToKill;
    results.medianHitsToKill = deathMetrics.medianHitsToKill;
    results.gibbabilityRating = deathMetrics.gibbabilityRating;
    
    return results;
}

/**
 * Average results across multiple simulation iterations
 * @param {Array} allResults - Array of result objects from each iteration
 * @param {number} numHits - Number of hits per iteration
 * @param {Object} characterData - Character stats
 * @param {Object} boss - Boss data
 * @param {number} timeInSeconds - Time simulated in seconds
 * @param {number} effectiveAttackSpeed - Effective attack speed after debuffs
 * @returns {Object} Averaged results
 */
function averageSimulationResults(allResults, numHits, characterData, boss, timeInSeconds, effectiveAttackSpeed) {
    const totals = calculateEffectiveHealth(characterData);
    const dodge = totals.dodge || 0;
    const parry = totals.parry || 0;
    const block = totals.block || 0;
    const blockValue = totals.blockValue || 0;
    const physicalDR = totals.physicalDR || 0;
    const defense = totals.defense || 0;
    const defenseSkill = defense - 300;
    const missChance = 5.0 + (defenseSkill * 0.04);
    const critReduction = Math.max(0, (defense - 300) * 0.04);
    const critChance = Math.max(0, 5.6 - critReduction);
    const crushChance = 15.0;
    const trueAvoidance = dodge + parry + missChance;
    const totalMitigation = trueAvoidance + block;
    const isOverAvoidanceCap = trueAvoidance >= 100;
    let effectiveBlock = block;
    if (totalMitigation > 100) {
        const overCap = totalMitigation - 100;
        effectiveBlock = Math.max(0, block - overCap);
    }
    
    // Sum all results
    const averaged = {
        totalDamage: 0,
        hits: 0,
        crits: 0,
        crushes: 0,
        dodges: 0,
        parries: 0,
        blocks: 0,
        misses: 0,
        blockDamage: 0,
        hitDamage: 0,
        critDamage: 0,
        crushDamage: 0,
        landedHits: 0,
        damageReducedFromBlock: 0,
    };
    
    for (const result of allResults) {
        averaged.totalDamage += result.totalDamage;
        averaged.hits += result.hits;
        averaged.crits += result.crits;
        averaged.crushes += result.crushes;
        averaged.dodges += result.dodges;
        averaged.parries += result.parries;
        averaged.blocks += result.blocks;
        averaged.misses += result.misses;
        averaged.blockDamage += result.blockDamage;
        averaged.hitDamage += result.hitDamage;
        averaged.critDamage += result.critDamage;
        averaged.crushDamage += result.crushDamage;
        averaged.landedHits += result.landedHits;
        averaged.damageReducedFromBlock += result.damageReducedFromBlock;
    }
    
    // Average the results
    const numIterations = allResults.length;
    averaged.totalDamage /= numIterations;
    averaged.hits /= numIterations;
    averaged.crits /= numIterations;
    averaged.crushes /= numIterations;
    averaged.dodges /= numIterations;
    averaged.parries /= numIterations;
    averaged.blocks /= numIterations;
    averaged.misses /= numIterations;
    averaged.blockDamage /= numIterations;
    averaged.hitDamage /= numIterations;
    averaged.critDamage /= numIterations;
    averaged.crushDamage /= numIterations;
    averaged.landedHits /= numIterations;
    averaged.damageReducedFromBlock /= numIterations;
    
    // Calculate averages
    averaged.avgLandedHit = averaged.landedHits > 0 ? averaged.totalDamage / averaged.landedHits : 0;
    averaged.avgBlock = averaged.blocks > 0 ? averaged.blockDamage / averaged.blocks : 0;
    averaged.avgHit = averaged.hits > 0 ? averaged.hitDamage / averaged.hits : 0;
    averaged.avgCrit = averaged.crits > 0 ? averaged.critDamage / averaged.crits : 0;
    averaged.avgCrush = averaged.crushes > 0 ? averaged.crushDamage / averaged.crushes : 0;
    
    // Calculate average damage per attack (weighted by avoidance)
    averaged.avgDamagePerAttack = averaged.totalDamage / numHits;
    
    // Calculate percentages
    averaged.dodgePercent = (averaged.dodges / numHits) * 100;
    averaged.parryPercent = (averaged.parries / numHits) * 100;
    averaged.blockPercent = (averaged.blocks / numHits) * 100;
    averaged.missPercent = (averaged.misses / numHits) * 100;
    averaged.hitPercent = (averaged.hits / numHits) * 100;
    averaged.critPercent = (averaged.crits / numHits) * 100;
    averaged.crushPercent = (averaged.crushes / numHits) * 100;
    averaged.totalMitigation = totalMitigation;
    averaged.trueAvoidance = trueAvoidance;
    averaged.isOverCap = isOverAvoidanceCap;
    averaged.effectiveBlock = effectiveBlock;
    
    // Calculate death scenario metrics (min/max hits to kill and Gibbability Rating)
    const deathMetrics = calculateDeathMetrics(characterData, boss, dodge, parry, missChance, effectiveBlock, block, blockValue, physicalDR, critChance, crushChance, isOverAvoidanceCap, totals.health, totalMitigation);
    
    // Calculate stat weights (using averaged block rate and gibbability metrics)
    const effectiveAvoidanceForEHP = Math.min(trueAvoidance, 100);
    const statWeights = calculateStatWeights(totals, boss, physicalDR, effectiveAvoidanceForEHP, trueAvoidance, block, blockValue, averaged.blocks / numHits, deathMetrics.gibbabilityRating, deathMetrics.minHitsToKill, averaged.avgDamagePerAttack);
    averaged.statWeights = statWeights;
    averaged.minHitsToKill = deathMetrics.minHitsToKill;
    averaged.maxHitsToKill = deathMetrics.maxHitsToKill;
    averaged.medianHitsToKill = deathMetrics.medianHitsToKill;
    averaged.gibbabilityRating = deathMetrics.gibbabilityRating;
    averaged.gibbedCount = deathMetrics.gibbedCount;
    averaged.iterations = deathMetrics.iterations;

    // Add time-based simulation info
    averaged.timeSimulated = timeInSeconds;
    averaged.effectiveAttackSpeed = effectiveAttackSpeed;
    averaged.numHits = numHits;

    return averaged;
}

/**
 * Calculate death scenario metrics (min/max hits to kill and Gibbability Rating)
 * @param {Object} characterData - Character stats
 * @param {Object} boss - Boss data
 * @param {number} dodge - Dodge chance
 * @param {number} parry - Parry chance
 * @param {number} missChance - Miss chance
 * @param {number} effectiveBlock - Effective block chance
 * @param {number} block - Base block chance (before reduction)
 * @param {number} blockValue - Block value
 * @param {number} physicalDR - Physical damage reduction
 * @param {number} critChance - Crit chance (0% if crit immune from defense)
 * @param {number} crushChance - Crush chance
 * @param {boolean} isOverAvoidanceCap - Whether over avoidance cap (dodge+parry+miss >= 100%)
 * @param {number} health - Character health
 * @param {number} totalMitigation - Total mitigation (dodge + parry + miss + block)
 * @returns {Object} Death metrics
 */
function calculateDeathMetrics(characterData, boss, dodge, parry, missChance, effectiveBlock, block, blockValue, physicalDR, critChance, crushChance, isOverAvoidanceCap, health, totalMitigation) {
    const iterations = 10000; // Run 10,000 iterations to get accurate statistics
    const hitsToKillArray = [];
    let minHitsToKillActual = Infinity;
    let maxHitsToKillActual = 0;

    console.log('[GIBBABILITY CALC] Input stats:', {
        health: health.toFixed(0),
        physicalDR: (physicalDR * 100).toFixed(2) + '%',
        bossMaxDamage: boss.maxDamage,
        dodge: dodge.toFixed(2) + '%',
        parry: parry.toFixed(2) + '%',
        missChance: missChance.toFixed(2) + '%',
        effectiveBlock: effectiveBlock.toFixed(2) + '%',
        blockValue: blockValue.toFixed(0)
    });

    // Calculate theoretical min/max hits to kill
    // Determine worst case damage based on what types of damage you can take
    const isCritImmune = critChance <= 0; // Crit immune from defense (440 defense = 0% crit)
    const isCrushImmune = totalMitigation >= 100; // Crush immune if total mitigation (dodge+parry+miss+block) = 100%
    const isFullyImmune = isOverAvoidanceCap; // Fully immune if dodge+parry+miss >= 100%
    
    // Calculate worst case damage per hit based on immunity
    let worstCaseDamagePerHit;
    if (isFullyImmune) {
        // Everything is avoided, but this shouldn't happen in practice (would never die)
        worstCaseDamagePerHit = 0;
    } else if (isCrushImmune) {
        // Crit and crush immune (block prevents them), worst case is normal hit or blocked hit
        const maxNormalDamage = boss.maxDamage * (1 - physicalDR);
        const maxBlockDamage = Math.max(0, boss.maxDamage * (1 - physicalDR) - blockValue);
        worstCaseDamagePerHit = Math.max(maxNormalDamage, maxBlockDamage);
    } else if (isCritImmune) {
        // Crit immune but can be crushed, worst case is crush
        worstCaseDamagePerHit = boss.maxDamage * (1 - physicalDR) * 1.5;
    } else {
        // Can be crit, worst case is crit
        worstCaseDamagePerHit = boss.maxDamage * (1 - physicalDR) * 2;
    }
    
    // Worst case: all hits at worst case damage
    const minHitsToKillTheoretical = worstCaseDamagePerHit > 0 ? Math.ceil(health / worstCaseDamagePerHit) : Infinity;
    
    // Run simulation iterations
    for (let iter = 0; iter < iterations; iter++) {
        let currentHealth = health;
        let damagingHitsTaken = 0; // Count only hits that deal damage
        let attemptsTaken = 0; // Count all attempts including dodges/parries/misses (for max hits to kill)
        const maxAttempts = 10000; // Safety limit
        
        while (currentHealth > 0 && attemptsTaken < maxAttempts) {
            attemptsTaken++;
            const roll = Math.random() * 100;
            
            // Attack table order: Dodge → Parry → Miss → Block → Crit → Crush → Hit
            if (roll < dodge) {
                // Dodge (0 damage)
                // Continue - don't increment damagingHitsTaken
            } else if (roll < dodge + parry) {
                // Parry (0 damage)
                // Continue - don't increment damagingHitsTaken
            } else if (roll < dodge + parry + missChance) {
                // Miss (0 damage)
                // Continue - don't increment damagingHitsTaken
            } else if (roll < dodge + parry + missChance + effectiveBlock) {
                // Blocked hit (deals damage)
                damagingHitsTaken++;
                const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
                const afterDR = rawDamage * (1 - physicalDR);
                const blockedDamage = Math.max(0, afterDR - blockValue);
                currentHealth -= blockedDamage;
            } else if (!isOverAvoidanceCap) {
                // Past block range - damaging hit
                damagingHitsTaken++;
                const blockEnd = dodge + parry + missChance + effectiveBlock;
                if (roll < blockEnd + critChance) {
                    // Critical hit (2x damage)
                    const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
                    const afterDR = rawDamage * (1 - physicalDR);
                    const critDamage = afterDR * 2;
                    currentHealth -= critDamage;
                } else if (roll < blockEnd + critChance + crushChance) {
                    // Crushing blow (1.5x damage)
                    const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
                    const afterDR = rawDamage * (1 - physicalDR);
                    const crushDamage = afterDR * 1.5;
                    currentHealth -= crushDamage;
                } else {
                    // Normal hit
                    const rawDamage = boss.minDamage + Math.random() * (boss.maxDamage - boss.minDamage);
                    const afterDR = rawDamage * (1 - physicalDR);
                    currentHealth -= afterDR;
                }
            } else {
                // Over avoidance cap - treat as miss
                // Continue - don't increment damagingHitsTaken
            }
        }
        
        if (currentHealth <= 0) {
            // Store damaging hits for statistics
            hitsToKillArray.push({ 
                damagingHits: damagingHitsTaken, 
                attempts: attemptsTaken
            });
            minHitsToKillActual = Math.min(minHitsToKillActual, damagingHitsTaken);
            maxHitsToKillActual = Math.max(maxHitsToKillActual, attemptsTaken); // Use attempts for max
        }
    }
    
    // Use theoretical minimum for min hits to kill (worst case scenario - all crits at max damage)
    const minHitsToKill = minHitsToKillTheoretical;
    
    // Calculate Gibbability Rating - probability of dying in 3 or fewer hits
    // Simple metric: if you always take 4+ hits to die, gibbability rating is 0%
    const deathsIn3OrLess = hitsToKillArray.filter(result => result.damagingHits <= 3).length;
    const gibbabilityRating = (deathsIn3OrLess / iterations) * 100;

    // Temporarily disabled to see other logs
    // console.log('[GIBBABILITY CALC] Results:', {
    //     totalIterations: iterations,
    //     deathsIn3OrLess: deathsIn3OrLess,
    //     gibbabilityRating: gibbabilityRating.toFixed(2) + '%',
    //     minHitsToKill: minHitsToKillTheoretical,
    //     sampleDeaths: hitsToKillArray.slice(0, 5).map(r => r.damagingHits)
    // });
    
    // Calculate median hits to kill (more useful than average, less affected by outliers)
    let medianHitsToKill = 0;
    if (hitsToKillArray.length > 0) {
        // Sort by damaging hits
        const sortedHits = hitsToKillArray.map(r => r.damagingHits).sort((a, b) => a - b);
        const mid = Math.floor(sortedHits.length / 2);
        if (sortedHits.length % 2 === 0) {
            // Even number of elements - average the two middle values
            medianHitsToKill = (sortedHits[mid - 1] + sortedHits[mid]) / 2;
        } else {
            // Odd number of elements - take the middle value
            medianHitsToKill = sortedHits[mid];
        }
    }
    
    return {
        minHitsToKill: minHitsToKill,
        maxHitsToKill: maxHitsToKillActual === 0 ? Infinity : maxHitsToKillActual,
        medianHitsToKill: medianHitsToKill,
        gibbabilityRating: gibbabilityRating,
        gibbedCount: deathsIn3OrLess,
        iterations: iterations
    };
}

/**
 * Calculate stat weights - how much each stat is worth in terms of EHP or avoidance
 * @param {Object} totals - Character totals from calculateEffectiveHealth
 * @param {Object} boss - Boss data
 * @param {number} currentDR - Current physical damage reduction (0-1)
 * @param {number} effectiveAvoidancePercent - Current total avoidance percentage (capped at 100% for EHP)
 * @param {number} trueAvoidancePercent - Current true avoidance (dodge + parry + miss)
 * @param {number} blockChance - Current block chance percentage
 * @param {number} blockValue - Current block value
 * @param {number} actualBlockRate - Actual block rate from simulation (0-1)
 * @param {number} currentGibRating - Current gibbability rating (0-100)
 * @param {number} currentMinHitsToKill - Current minimum hits to kill
 * @returns {Object} Stat weights
 */
function calculateStatWeights(totals, boss, currentDR, effectiveAvoidancePercent, trueAvoidancePercent, blockChance, blockValue, actualBlockRate, currentGibRating = 0, currentMinHitsToKill = Infinity, simulatedAvgDamagePerAttack = null) {
    const health = totals.health || 0;
    const stamina = totals.stamina || 0;
    const armor = totals.armor || 0;
    const defense = totals.defense || 0;
    const attackerLevel = 63; // Boss level
    
    // Calculate crit reduction from defense (used in multiple places)
    const critReduction = Math.max(0, (defense - 300) * 0.04);
    const currentCritChance = Math.max(0, 5.6 - critReduction);
    
    // effectiveAvoidancePercent is already capped at 100% for EHP calculations
    const avoidanceDecimal = effectiveAvoidancePercent / 100;
    
    // Safety check: if true avoidance (dodge + parry + miss) is >= 100%, 
    // additional avoidance stats have no value (you're already avoiding everything)
    // Block prevents crits/crushes, but block gets pushed off the table as mitigation increases
    // So dodge/parry/defense have value until you have 100% dodge + parry + miss combined
    const avoidanceCap = 100; // 100% cap - if dodge + parry + miss >= 100%, everything else is pushed off
    const isAtAvoidanceCap = trueAvoidancePercent >= avoidanceCap;
    
    // Use the calculator's EHP formula: EHP = HP / ((1 - DR) * (1 - avoidance))
    // This accounts for all DR sources (armor, talents, buffs) from the calculator
    const currentEHP = health / ((1 - currentDR) * (1 - avoidanceDecimal));
    
    // === 1% Avoidance Value (Dodge/Parry) ===
    // Dodge and parry completely negate attacks (0 damage), unlike block which converts them
    // Attack table: Miss → Dodge → Parry → Block → Crit → Crush → Hit
    //
    // Three zones based on attack table mechanics (same as block, but complete negation):
    // 1. Low mitigation: Dodge/parry prevent normal hits (full damage avoided)
    // 2. Crush immune zone (total mitigation >= 100% - crush - crit): Dodge/parry prevent crushes (1.5x damage completely avoided)
    // 3. Crit immune zone (total mitigation >= 100% - crit): Dodge/parry prevent crits (2x damage completely avoided)
    //
    // Key difference from block: Parry/dodge completely negate the attack (0 damage), 
    // while block converts crits/crushes to normal blocked hits (reduced damage)
    let avoidance1PercentValue = 0;
    if (!isAtAvoidanceCap) {
        // Use currentCritChance calculated at top of function
        const crushChance = 15.0;
        
        // Calculate total mitigation (what's on the attack table before crits/crushes)
        const totalMitigation = trueAvoidancePercent + blockChance;
        
        // Calculate damage values
        const avgBossDamage = (boss.minDamage + boss.maxDamage) / 2;
        const normalHitDamage = avgBossDamage * (1 - currentDR);
        const crushDamage = normalHitDamage * 1.5;
        const critDamage = normalHitDamage * 2.0;
        
        // Determine what 1% more avoidance (dodge/parry) would prevent based on current mitigation level
        let damagePreventedPerAttack = 0;
        
        if (totalMitigation >= 100 - currentCritChance) {
            // Crit immune zone: Adding 1% avoidance prevents crits (2x damage completely avoided)
            // Damage prevented = 0.01 * critDamage (full damage, not reduced)
            damagePreventedPerAttack = 0.01 * critDamage;
        } else if (totalMitigation >= 100 - crushChance - currentCritChance) {
            // Crush immune zone: Adding 1% avoidance prevents crushes (1.5x damage completely avoided)
            // Damage prevented = 0.01 * crushDamage (full damage, not reduced)
            damagePreventedPerAttack = 0.01 * crushDamage;
        } else {
            // Low mitigation zone: Adding 1% avoidance prevents normal hits (1x damage completely avoided)
            // Damage prevented = 0.01 * normalHitDamage (full damage, not reduced)
            damagePreventedPerAttack = 0.01 * normalHitDamage;
        }
        
        // Convert to EHP using simulated average damage if available
        if (damagePreventedPerAttack > 0) {
            let avgDamagePerAttack;
            if (simulatedAvgDamagePerAttack && simulatedAvgDamagePerAttack > 0) {
                avgDamagePerAttack = simulatedAvgDamagePerAttack;
            } else {
                // Fall back to theoretical calculation based on zone
                if (totalMitigation >= 100 - currentCritChance) {
                    // Crit immune zone: average includes crits being completely avoided
                    avgDamagePerAttack = normalHitDamage;
                } else if (totalMitigation >= 100 - crushChance - currentCritChance) {
                    // Crush immune zone: average includes crushes being completely avoided
                    avgDamagePerAttack = normalHitDamage;
                } else {
                    // Normal zone: just normal hits and occasional crits/crushes
                    avgDamagePerAttack = normalHitDamage;
                }
            }
            
            if (avgDamagePerAttack > 0) {
                const attacksToKill = health / avgDamagePerAttack;
                avoidance1PercentValue = damagePreventedPerAttack * attacksToKill;
            }
        }
        
        // Cap to reasonable values
        if (!isFinite(avoidance1PercentValue) || avoidance1PercentValue > 1000000) {
            avoidance1PercentValue = 0;
        }
    }
    // If at avoidance cap, additional avoidance has no value (stays 0)
    
    // === 1 Stamina Value ===
    // Use HP per stamina calculated by the calculator (accounts for % stamina and % HP buffs/talents)
    // Base is 10 HP, but buffs like:
    //   - Commanding Shout (+10% stamina)
    //   - Vitality talent (+5% stamina)
    //   - % HP buffs (+5% HP)
    // Example: 1 × 1.1 × 1.05 × 10 × 1.05 = 12.1 HP per stamina
    // Stamina value should ONLY be amplified by DR, NOT by avoidance
    // (avoidance value is already captured in the avoidance stat weight)
    const staminaHP = totals.hpPerStamina || 10;
    const stamina1Value = staminaHP / (1 - currentDR);
    
    // Stamina equivalent of 1% avoidance
    // Handle edge cases: avoid division by zero or infinite values
    let staminaPer1PercentAvoidance = 0;
    if (stamina1Value > 0 && avoidance1PercentValue > 0 && isFinite(stamina1Value) && isFinite(avoidance1PercentValue)) {
        staminaPer1PercentAvoidance = avoidance1PercentValue / stamina1Value;
        // Cap at reasonable value
        if (staminaPer1PercentAvoidance > 100000) {
            staminaPer1PercentAvoidance = 0;
        }
    }
    
    // === 1 Defense Value ===
    // Defense gives 0.04% to miss, dodge, parry, and block
    // For avoidance (dodge + parry + miss): 0.04% * 3 = 0.12% per defense point
    // Block also gets 0.04% per point, but block reduces damage rather than avoiding it
    // PLUS: Defense reduces crit chance by 0.04% per point above 300
    let defense1ValueBase = 0;
    
    // Part 1: Avoidance value (0.12% per defense point)
    // Defense avoidance can only prevent normal hits, NOT crits or crushes (same as dodge/parry)
    if (!isAtAvoidanceCap) {
        // 1 defense = 0.04% miss + 0.04% dodge + 0.04% parry = 0.12% total avoidance
        const avgBossDamage = (boss.minDamage + boss.maxDamage) / 2;
        const normalHitDamageAfterDR = avgBossDamage * (1 - currentDR);

        // How many normal hits can you survive?
        const normalHitsToKill = health / normalHitDamageAfterDR;

        // Adding 1 defense gives 0.12% avoidance, meaning you avoid 0.12 out of every 100 normal hits
        // Over the course of a fight, 0.12% avoidance prevents: (normalHitDamage * 0.0012) per attack
        // Total damage prevented = (damage per avoided hit * 0.0012) * total attacks you can survive
        const avoidanceValue = (normalHitDamageAfterDR * 0.0012) * normalHitsToKill;

        // Cap to reasonable values
        if (isFinite(avoidanceValue) && avoidanceValue <= 1000000 && avoidanceValue > 0) {
            defense1ValueBase += avoidanceValue;
        }
    }
    
    // Part 2: Crit reduction value
    // +1 defense reduces crit chance by 0.04% (if defense > 300)
    // This prevents crits, which deal 2x damage instead of 1x
    // Use critReduction and currentCritChance calculated at top of function

    if (defense >= 300 && currentCritChance > 0) {
        const critReductionPerPoint = 0.0004; // 0.04% as decimal

        // Calculate average damage after DR
        const avgBossDamage = (boss.minDamage + boss.maxDamage) / 2;
        const normalHitDamageAfterDR = avgBossDamage * (1 - currentDR);
        const critDamageAfterDR = normalHitDamageAfterDR * 2; // Crits deal 2x damage

        // Damage difference between crit and normal hit
        const damageDifference = critDamageAfterDR - normalHitDamageAfterDR;

        // With +1 defense, we reduce crit chance by 0.04%
        // This means 0.04% of attacks that would have been crits become normal hits instead
        // Damage prevented per attack = 0.04% * (crit damage - normal damage)
        const damagePreventedPerAttack = critReductionPerPoint * damageDifference;

        // How many normal hits can you survive?
        const normalHitsToKill = health / normalHitDamageAfterDR;

        // Convert to EHP: damage prevented over the attacks you can survive
        const critReductionEHP = damagePreventedPerAttack * normalHitsToKill;

        if (isFinite(critReductionEHP) && critReductionEHP <= 1000000 && critReductionEHP > 0) {
            defense1ValueBase += critReductionEHP;
        }
    }
    
    const defense1Value = defense1ValueBase;

    // Note: Defense also gives 0.04% block per point, which reduces damage taken
    // This block value is separate from avoidance and always has value (reduces damage on blocked hits)
    
    // Defense points equivalent of 1% avoidance
    // Handle edge cases: avoid division by zero or infinite values
    let defensePer1PercentAvoidance = 0;
    if (defense1Value > 0 && avoidance1PercentValue > 0 && isFinite(defense1Value) && isFinite(avoidance1PercentValue)) {
        defensePer1PercentAvoidance = avoidance1PercentValue / defense1Value;
        // Cap at reasonable value
        if (defensePer1PercentAvoidance > 100000) {
            defensePer1PercentAvoidance = 0;
        }
    }
    
    // === 1 Armor Value ===
    // Turtle WoW: Armor cap removed, uses diminishing returns above 75%
    // Formula: DR = armor / (armor + 400 + 85 * attackerLevel)
    // No hard cap - continues with diminishing returns above 75%
    const armorDenominator = 400 + 85 * attackerLevel; // For level 63: 400 + 85*63 = 5755
    const currentArmorDR = armor / (armor + armorDenominator);
    
    // Add 1 armor and calculate new DR using calculator's exact formula (no cap)
    const newArmor = armor + 1;
    const newArmorDR = newArmor / (newArmor + armorDenominator);
    
    // Calculate change in DR from armor
    const armorDRDelta = newArmorDR - currentArmorDR;
    
    // The calculator combines DR sources multiplicatively:
    // finalDamageTaken = (1 - armorDR) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR)
    // totalDR = 1 - finalDamageTaken
    // 
    // For stat weights with +1 armor:
    // newFinalDamageTaken = (1 - newArmorDR) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR)
    // newTotalDR = 1 - newFinalDamageTaken
    //
    // Since currentDR = 1 - [(1 - currentArmorDR) * otherDRMultipliers]
    // We can solve for otherDRMultipliers = (1 - currentDR) / (1 - currentArmorDR)
    // Then newTotalDR = 1 - [(1 - newArmorDR) * otherDRMultipliers]
    const otherDRMultipliers = (1 - currentDR) / (1 - currentArmorDR);
    const newTotalDR = 1 - ((1 - newArmorDR) * otherDRMultipliers);
    // No cap - use the full calculated value
    const newTotalDRUncapped = newTotalDR;

    // Armor value should ONLY be based on DR increase, NOT amplified by avoidance
    // (avoidance value is already captured in the avoidance stat weight)
    const currentEHPWithoutAvoidance = health / (1 - currentDR);
    const newEHPWithArmor = health / (1 - newTotalDRUncapped);
    let armor1Value = newEHPWithArmor - currentEHPWithoutAvoidance;
    // Cap to reasonable values
    if (!isFinite(armor1Value) || armor1Value > 1000000) {
        armor1Value = 0;
    }
    
    // Armor equivalent of 1% avoidance
    // Handle edge cases: avoid division by zero or infinite values
    let armorPer1PercentAvoidance = 0;
    if (armor1Value > 0 && avoidance1PercentValue > 0 && isFinite(armor1Value) && isFinite(avoidance1PercentValue)) {
        armorPer1PercentAvoidance = avoidance1PercentValue / armor1Value;
        // Cap at reasonable value to avoid displaying millions
        if (armorPer1PercentAvoidance > 100000) {
            armorPer1PercentAvoidance = 0; // Too high, likely calculation error
        }
    }
    
    // === 1 Block Value ===
    // Block value reduces damage on blocked hits
    // IMPORTANT: What blocks prevent depends on total mitigation (attack table mechanics)
    // Attack table: Miss → Dodge → Parry → Block → Crit → Crush → Normal Hit
    //
    // Three zones based on attack table mechanics:
    // 1. Low mitigation: Blocks prevent normal hits, +1 block value reduces damage by 1
    // 2. Crush immune (total mitigation >= 100% - crush - crit): Blocks prevent crushes
    //    Blocked crush becomes blocked normal hit, so +1 block value provides additional 1 damage reduction
    // 3. Crit immune (total mitigation >= 100% - crit): Blocks prevent crits
    //    Blocked crit becomes blocked normal hit, so +1 block value provides additional 1 damage reduction
    //
    // In all cases, +1 block value = 1 less damage per blocked hit
    // But the value calculation needs to use the appropriate damage baseline for "attacks to kill"

    let blockValue1EHPBase = 0;
    if (actualBlockRate > 0) {
        // Calculate what type of attacks we're dealing with based on total mitigation
        const avgBossDamage = (boss.minDamage + boss.maxDamage) / 2;
        const normalHitDamage = avgBossDamage * (1 - currentDR);
        const crushChance = 15.0;

        // Use currentCritChance calculated at top of function
        const totalMitigation = trueAvoidancePercent + blockChance;

        // With +1 block value, we reduce damage by 1 more on each blocked hit
        const damageReductionPerAttack = actualBlockRate * 1;

        // Determine the baseline for calculating attacks to kill
        let avgDamagePerAttack;
        if (simulatedAvgDamagePerAttack && simulatedAvgDamagePerAttack > 0) {
            // Use actual simulated average (accounts for current block value, crits, crushes, avoidance, etc.)
            avgDamagePerAttack = simulatedAvgDamagePerAttack;
        } else {
            // Fall back to theoretical calculation based on zone
            if (totalMitigation >= 100 - currentCritChance) {
                // Crit immune zone: average includes crits being converted to blocked hits
                avgDamagePerAttack = normalHitDamage;
            } else if (totalMitigation >= 100 - crushChance - currentCritChance) {
                // Crush immune zone: average includes crushes being converted to blocked hits
                avgDamagePerAttack = normalHitDamage;
            } else {
                // Normal zone: just normal hits and occasional crits/crushes
                avgDamagePerAttack = normalHitDamage;
            }
        }

        // EHP = (damage reduced per attack) * (attacks you can survive)
        if (avgDamagePerAttack > 0) {
            const attacksToKill = health / avgDamagePerAttack;
            blockValue1EHPBase = damageReductionPerAttack * attacksToKill;
        }

        // Cap to reasonable values
        if (!isFinite(blockValue1EHPBase) || blockValue1EHPBase > 1000000) {
            blockValue1EHPBase = 0;
        }
    }
    const blockValue1EHP = blockValue1EHPBase;
    
    // Block value equivalent of 1% avoidance
    let blockValuePer1PercentAvoidance = 0;
    if (blockValue1EHP > 0 && avoidance1PercentValue > 0 && isFinite(blockValue1EHP) && isFinite(avoidance1PercentValue)) {
        blockValuePer1PercentAvoidance = avoidance1PercentValue / blockValue1EHP;
        // Cap at reasonable value
        if (blockValuePer1PercentAvoidance > 100000) {
            blockValuePer1PercentAvoidance = 0;
        }
    }
    
    // === 1% Block Chance Value ===
    // Block chance has two benefits:
    // 1. Prevents crits/crushes (pushes them off attack table)
    // 2. Reduces damage by block value on blocked hits
    //
    // Attack table transition zones:
    // - Below crush immune: Blocks prevent normal hits, reduce by block value
    // - Crush immune zone (total >= 100% - crush - crit): Blocks prevent crushes (1.5x → 1x + block value reduction)
    // - Crit immune zone (total >= 100% - crit): Blocks prevent crits (2x → 1x + block value reduction)
    let blockChance1PercentEHPBase = 0;

    // Use currentCritChance calculated at top of function
    const crushChance = 15.0;

    // Calculate total mitigation (what's on the attack table before crits/crushes)
    const totalMitigation = trueAvoidancePercent + blockChance;

    // Determine what adding 1% block would prevent
    const avgBossDamage = (boss.minDamage + boss.maxDamage) / 2;
    const normalHitDamage = avgBossDamage * (1 - currentDR);
    const crushDamage = normalHitDamage * 1.5;
    const critDamage = normalHitDamage * 2.0;

    // Determine what 1% more block would prevent based on current mitigation level
    let damagePreventedPerAttack = 0;

    if (totalMitigation >= 100 - currentCritChance) {
        // Crit immune: Adding 1% block prevents crits (2x) and reduces to normal hit with block value
        // Damage prevented = 0.01 * (critDamage - (normalHitDamage - blockValue))
        const blockedHitDamage = Math.max(0, normalHitDamage - blockValue);
        damagePreventedPerAttack = 0.01 * (critDamage - blockedHitDamage);
    } else if (totalMitigation >= 100 - crushChance - currentCritChance) {
        // Crush immune: Adding 1% block prevents crushes (1.5x) and reduces to normal hit with block value
        // Damage prevented = 0.01 * (crushDamage - (normalHitDamage - blockValue))
        const blockedHitDamage = Math.max(0, normalHitDamage - blockValue);
        damagePreventedPerAttack = 0.01 * (crushDamage - blockedHitDamage);
    } else {
        // Not immune: Adding 1% block prevents normal hits and reduces by block value
        // Damage prevented = 0.01 * blockValue
        damagePreventedPerAttack = 0.01 * blockValue;
    }

    // Convert to EHP using simulated average damage if available
    if (damagePreventedPerAttack > 0) {
        let avgDamagePerAttack;
        if (simulatedAvgDamagePerAttack && simulatedAvgDamagePerAttack > 0) {
            avgDamagePerAttack = simulatedAvgDamagePerAttack;
        } else {
            avgDamagePerAttack = normalHitDamage;
        }

        if (avgDamagePerAttack > 0) {
            const attacksToKill = health / avgDamagePerAttack;
            blockChance1PercentEHPBase = damagePreventedPerAttack * attacksToKill;
        }
    }

    // Cap to reasonable values
    if (!isFinite(blockChance1PercentEHPBase) || blockChance1PercentEHPBase > 1000000) {
        blockChance1PercentEHPBase = 0;
    }

    const blockChance1PercentEHP = blockChance1PercentEHPBase;
    
    // Block chance equivalent of 1% avoidance
    let blockChancePer1PercentAvoidance = 0;
    if (blockChance1PercentEHP > 0 && avoidance1PercentValue > 0 && isFinite(blockChance1PercentEHP) && isFinite(avoidance1PercentValue)) {
        blockChancePer1PercentAvoidance = avoidance1PercentValue / blockChance1PercentEHP;
        // Cap at reasonable value
        if (blockChancePer1PercentAvoidance > 100000) {
            blockChancePer1PercentAvoidance = 0;
        }
    }
    
    // Ensure all values are finite and reasonable
    const safeValue = (val) => {
        if (!isFinite(val) || val < 0 || val > 1000000) return 0;
        return val;
    };
    
    return {
        avoidance1PercentEHP: safeValue(avoidance1PercentValue),
        stamina1EHP: safeValue(stamina1Value),
        staminaPer1PercentAvoidance: safeValue(staminaPer1PercentAvoidance),
        defense1EHP: safeValue(defense1Value),
        defensePer1PercentAvoidance: safeValue(defensePer1PercentAvoidance),
        armor1EHP: safeValue(armor1Value),
        armorPer1PercentAvoidance: safeValue(armorPer1PercentAvoidance),
        blockValue1EHP: safeValue(blockValue1EHP),
        blockValuePer1PercentAvoidance: safeValue(blockValuePer1PercentAvoidance),
        blockChance1PercentEHP: safeValue(blockChance1PercentEHP),
        blockChancePer1PercentAvoidance: safeValue(blockChancePer1PercentAvoidance)
    };
}

/**
 * Get boss database
 */
export function getBossDatabase() {
    return bossDatabase;
}

/**
 * Get boss by ID
 */
export function getBossById(id) {
    return bossDatabase.find(boss => boss.id === id);
}

