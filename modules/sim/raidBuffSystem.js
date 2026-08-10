/**
 * Raid Buff System Module
 *
 * @module sim/raidBuffSystem
 * @description Handles external raid buff generation and tracking.
 *
 * ## Overview
 * Generates pre-determined buff windows for raid debuffs:
 * - Nightfall: +10% spell damage for 7 seconds (35-50% uptime)
 * - Hemorrhage: +2%/+4% physical damage (40-50% sporadic uptime)
 * - Corrosive Spit: -400 boss armor for 10 seconds (65-85% uptime)
 *
 * These are modeled as probability distributions since the sim
 * doesn't control when other raid members apply these debuffs.
 *
 * @version 1.1.0
 * @since 2026-01-27
 */

// ============================================
// CONSTANTS
// ============================================

/**
 * Nightfall configuration
 * @constant
 */
export const NIGHTFALL_CONFIG = {
    duration: 7.0,              // Each proc lasts 7 seconds
    minUptime: 0.35,            // 35% minimum uptime
    maxUptime: 0.50,            // 50% maximum uptime
    damageMultiplier: 1.10      // +10% spell damage
};

/**
 * Corrosive Spit configuration
 * @constant
 */
export const CORROSIVE_SPIT_CONFIG = {
    duration: 10.0,           // Each proc lasts 10 seconds
    minUptime: 0.65,          // 65% minimum uptime
    maxUptime: 0.85,          // 85% maximum uptime
    armorReduction: 400       // -400 boss armor
};

/**
 * Hemorrhage configuration
 * @constant
 */
export const HEMORRHAGE_CONFIG = {
    minDuration: 3.0,           // Min burst duration (charges consumed)
    maxDuration: 6.0,           // Max burst duration
    minUptime: 0.40,            // 40% minimum uptime
    maxUptime: 0.50,            // 50% maximum uptime
    minGap: 2.0,                // Min gap between bursts
    maxGap: 8.0,                // Max gap between bursts
    normalMultiplier: 1.02,     // +2% physical damage
    improvedMultiplier: 1.04    // +4% physical damage (improved)
};

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize raid buff states on context
 * 
 * @param {Object} ctx - Simulation context
 * @param {Object} [options] - Options
 * @param {boolean} [options.nightfallEnabled=false] - Enable Nightfall
 * @param {boolean} [options.hemoEnabled=false] - Enable Hemorrhage
 * @param {boolean} [options.hemoImproved=false] - Use improved Hemorrhage
 * @param {boolean} [options.corrosiveSpitEnabled=false] - Enable Corrosive Spit
 */
export function initializeRaidBuffStates(ctx, options = {}) {
    const { nightfallEnabled = false, hemoEnabled = false, hemoImproved = false, corrosiveSpitEnabled = false } = options;

    ctx.nightfallEnabled = nightfallEnabled;
    ctx.hemoEnabled = hemoEnabled;
    ctx.hemoImproved = hemoImproved;
    ctx.corrosiveSpitEnabled = corrosiveSpitEnabled;

    // Initialize proc windows
    ctx.nightfallProcs = [];
    ctx.hemoProcs = [];
    ctx.corrosiveSpitProcs = [];

    // Initialize tracking (if buffUptime exists)
    if (ctx.buffUptime) {
        if (!ctx.buffUptime.nightfall) {
            ctx.buffUptime.nightfall = {
                procs: 0,
                totalUptime: 0,
                activationTimes: []
            };
        }
        if (!ctx.buffUptime.hemorrhage) {
            ctx.buffUptime.hemorrhage = {
                procs: 0,
                totalUptime: 0,
                activationTimes: []
            };
        }
        if (!ctx.buffUptime.corrosiveSpit) {
            ctx.buffUptime.corrosiveSpit = {
                procs: 0,
                totalUptime: 0,
                activationTimes: []
            };
        }
    }
}

// ============================================
// NIGHTFALL
// ============================================

/**
 * Generate Nightfall procs to achieve 35-50% uptime
 * Nightfall is a raid debuff on the boss that gives +10% spell damage for 7 seconds
 * Procs can overlap (multiple applications stack)
 * 
 * @param {Object} ctx - Simulation context with rng, fightDuration, buffUptime
 */
export function generateNightfallProcs(ctx) {
    if (!ctx.nightfallEnabled) return;
    
    // Wrap RNG call to preserve 'this' binding for FastRNG.random()
    const rngFn = ctx.rng ? () => ctx.rng.random() : Math.random;
    const fightDuration = ctx.fightDuration;
    
    // Random uptime between 35% and 50%
    const targetUptimePercent = NIGHTFALL_CONFIG.minUptime + 
        rngFn() * (NIGHTFALL_CONFIG.maxUptime - NIGHTFALL_CONFIG.minUptime);
    const targetUptime = fightDuration * targetUptimePercent;
    const procDuration = NIGHTFALL_CONFIG.duration;
    
    // Calculate how many procs we need (accounting for overlaps)
    const estimatedProcs = Math.ceil(targetUptime / procDuration * 1.2);
    
    // Generate proc times randomly throughout the fight
    const procTimes = [];
    for (let i = 0; i < estimatedProcs; i++) {
        const procTime = rngFn() * fightDuration;
        procTimes.push(procTime);
    }
    
    // Sort proc times
    procTimes.sort((a, b) => a - b);
    
    // Create activation records
    const activationTimes = [];
    for (const procTime of procTimes) {
        const endTime = Math.min(procTime + procDuration, fightDuration);
        const actualDuration = endTime - procTime;
        
        if (actualDuration > 0) {
            activationTimes.push({
                start: procTime,
                end: endTime,
                duration: actualDuration
            });
        }
    }
    
    // Store in context
    ctx.nightfallProcs = activationTimes;
    
    // Update buffUptime tracking if available
    if (ctx.buffUptime?.nightfall) {
        ctx.buffUptime.nightfall.activationTimes = activationTimes;
        ctx.buffUptime.nightfall.procs = activationTimes.length;
        ctx.buffUptime.nightfall.totalUptime = calculateMergedUptime(activationTimes);
    }
    
    // Log
    if (ctx.log && typeof ctx.log === 'function') {
        const actualUptimePercent = (calculateMergedUptime(activationTimes) / fightDuration) * 100;
        ctx.log(`Nightfall: Generated ${activationTimes.length} procs, ${actualUptimePercent.toFixed(1)}% uptime (target: ${(targetUptimePercent * 100).toFixed(1)}%)`);
    }
}

/**
 * Check if Nightfall is active at the current time
 * 
 * @param {Object} ctx - Simulation context with currentTime, nightfallProcs
 * @returns {boolean} Whether Nightfall is active
 */
export function isNightfallActive(ctx) {
    if (!ctx.nightfallEnabled) return false;
    
    const procs = ctx.nightfallProcs || ctx.buffUptime?.nightfall?.activationTimes || [];
    const currentTime = ctx.currentTime;
    
    for (const activation of procs) {
        if (currentTime >= activation.start && currentTime < activation.end) {
            return true;
        }
    }
    return false;
}

/**
 * Get Nightfall damage multiplier if active
 * 
 * @param {Object} ctx - Simulation context
 * @returns {number} Damage multiplier (1.0 or 1.1)
 */
export function getNightfallDamageMultiplier(ctx) {
    return isNightfallActive(ctx) ? NIGHTFALL_CONFIG.damageMultiplier : 1.0;
}

// ============================================
// HEMORRHAGE
// ============================================

/**
 * Generate Hemorrhage procs to achieve 40-50% sporadic uptime
 * Hemorrhage is a raid debuff on the boss that gives +2% (or +4% improved) physical damage
 * The debuff has charges that get consumed by physical attacks, so uptime is sporadic
 * 
 * @param {Object} ctx - Simulation context with rng, fightDuration, buffUptime
 */
export function generateHemorrhageProcs(ctx) {
    if (!ctx.hemoEnabled) return;
    
    // Wrap RNG call to preserve 'this' binding for FastRNG.random()
    const rngFn = ctx.rng ? () => ctx.rng.random() : Math.random;
    const fightDuration = ctx.fightDuration;
    
    const { minDuration, maxDuration, minUptime, maxUptime, minGap, maxGap } = HEMORRHAGE_CONFIG;
    
    // Random uptime between 40% and 50%
    const targetUptimePercent = minUptime + rngFn() * (maxUptime - minUptime);
    const targetUptime = fightDuration * targetUptimePercent;
    
    // Generate sporadic bursts throughout the fight
    const activationTimes = [];
    let currentTime = 0;
    let totalGeneratedUptime = 0;
    let procCount = 0;
    
    while (currentTime < fightDuration && totalGeneratedUptime < targetUptime) {
        // Random gap before next application
        const gap = minGap + rngFn() * (maxGap - minGap);
        currentTime += gap;
        
        if (currentTime >= fightDuration) break;
        
        // Random burst duration (charges consumed)
        const burstDuration = minDuration + rngFn() * (maxDuration - minDuration);
        const endTime = Math.min(currentTime + burstDuration, fightDuration);
        const actualDuration = endTime - currentTime;
        
        if (actualDuration > 0.5) { // Only count meaningful bursts
            activationTimes.push({
                start: currentTime,
                end: endTime,
                duration: actualDuration
            });
            totalGeneratedUptime += actualDuration;
            procCount++;
        }
        
        currentTime = endTime;
    }
    
    // If we haven't hit target uptime, add more bursts randomly
    const avgDuration = (minDuration + maxDuration) / 2;
    const additionalBurstCount = Math.ceil((targetUptime - totalGeneratedUptime) / avgDuration);
    for (let i = 0; i < additionalBurstCount && totalGeneratedUptime < targetUptime; i++) {
        const startTime = rngFn() * (fightDuration - minDuration);
        const burstDuration = minDuration + rngFn() * (maxDuration - minDuration);
        const endTime = Math.min(startTime + burstDuration, fightDuration);
        
        activationTimes.push({
            start: startTime,
            end: endTime,
            duration: endTime - startTime
        });
        procCount++;
    }
    
    // Sort by start time
    activationTimes.sort((a, b) => a.start - b.start);
    
    // Store in context
    ctx.hemoProcs = activationTimes;
    
    // Update buffUptime tracking if available
    if (ctx.buffUptime?.hemorrhage) {
        ctx.buffUptime.hemorrhage.activationTimes = activationTimes;
        ctx.buffUptime.hemorrhage.procs = procCount;
        ctx.buffUptime.hemorrhage.totalUptime = calculateMergedUptime(activationTimes);
    }
    
    // Log
    if (ctx.log && typeof ctx.log === 'function') {
        const actualUptimePercent = (calculateMergedUptime(activationTimes) / fightDuration) * 100;
        const bonusPercent = ctx.hemoImproved ? 4 : 2;
        ctx.log(`Hemorrhage${ctx.hemoImproved ? ' (Improved)' : ''}: Generated ${procCount} applications, ${actualUptimePercent.toFixed(1)}% uptime (target: ${(targetUptimePercent * 100).toFixed(1)}%), +${bonusPercent}% physical damage`);
    }
}

/**
 * Check if Hemorrhage is active at the current time
 * 
 * @param {Object} ctx - Simulation context with currentTime, hemoProcs
 * @returns {boolean} Whether Hemorrhage is active
 */
export function isHemorrhageActive(ctx) {
    if (!ctx.hemoEnabled) return false;
    
    const procs = ctx.hemoProcs || ctx.buffUptime?.hemorrhage?.activationTimes || [];
    const currentTime = ctx.currentTime;
    
    for (const activation of procs) {
        if (currentTime >= activation.start && currentTime < activation.end) {
            return true;
        }
    }
    return false;
}

/**
 * Get Hemorrhage damage multiplier if active
 * 
 * @param {Object} ctx - Simulation context
 * @returns {number} Damage multiplier (1.0, 1.02, or 1.04)
 */
export function getHemorrhageDamageMultiplier(ctx) {
    if (!isHemorrhageActive(ctx)) return 1.0;
    return ctx.hemoImproved ? 
        HEMORRHAGE_CONFIG.improvedMultiplier : 
        HEMORRHAGE_CONFIG.normalMultiplier;
}

// ============================================
// CORROSIVE SPIT
// ============================================

/**
 * Generate Corrosive Spit procs to achieve 65-85% uptime
 * Corrosive Spit is a raid debuff on the boss that reduces armor by 400 for 10 seconds.
 * Procs can overlap (Nightfall-style random placement).
 *
 * @param {Object} ctx - Simulation context with rng, fightDuration, buffUptime
 */
export function generateCorrosiveSpitProcs(ctx) {
    if (!ctx.corrosiveSpitEnabled) return;

    const rngFn = ctx.rng ? () => ctx.rng.random() : Math.random;
    const fightDuration = ctx.fightDuration;

    const targetUptimePercent = CORROSIVE_SPIT_CONFIG.minUptime +
        rngFn() * (CORROSIVE_SPIT_CONFIG.maxUptime - CORROSIVE_SPIT_CONFIG.minUptime);
    const targetUptime = fightDuration * targetUptimePercent;
    const procDuration = CORROSIVE_SPIT_CONFIG.duration;

    // Estimate needed procs (with overlap buffer)
    const estimatedProcs = Math.ceil(targetUptime / procDuration * 1.2);

    const procTimes = [];
    for (let i = 0; i < estimatedProcs; i++) {
        procTimes.push(rngFn() * fightDuration);
    }
    procTimes.sort((a, b) => a - b);

    const activationTimes = [];
    for (const procTime of procTimes) {
        const endTime = Math.min(procTime + procDuration, fightDuration);
        const actualDuration = endTime - procTime;
        if (actualDuration > 0) {
            activationTimes.push({ start: procTime, end: endTime, duration: actualDuration });
        }
    }

    ctx.corrosiveSpitProcs = activationTimes;

    if (ctx.buffUptime?.corrosiveSpit) {
        ctx.buffUptime.corrosiveSpit.activationTimes = activationTimes;
        ctx.buffUptime.corrosiveSpit.procs = activationTimes.length;
        ctx.buffUptime.corrosiveSpit.totalUptime = calculateMergedUptime(activationTimes);
    }

    if (ctx.log && typeof ctx.log === 'function') {
        const actualUptimePercent = (calculateMergedUptime(activationTimes) / fightDuration) * 100;
        ctx.log(`Corrosive Spit: Generated ${activationTimes.length} procs, ${actualUptimePercent.toFixed(1)}% uptime (target: ${(targetUptimePercent * 100).toFixed(1)}%), -${CORROSIVE_SPIT_CONFIG.armorReduction} armor`);
    }
}

/**
 * Check if Corrosive Spit is active at the current time
 *
 * @param {Object} ctx - Simulation context with currentTime, corrosiveSpitProcs
 * @returns {boolean} Whether Corrosive Spit is active
 */
export function isCorrosiveSpitActive(ctx) {
    if (!ctx.corrosiveSpitEnabled) return false;

    const procs = ctx.corrosiveSpitProcs || ctx.buffUptime?.corrosiveSpit?.activationTimes || [];
    const currentTime = ctx.currentTime;

    for (const activation of procs) {
        if (currentTime >= activation.start && currentTime < activation.end) {
            return true;
        }
    }
    return false;
}

/**
 * Get Corrosive Spit armor reduction if active (returns 0 or 400)
 *
 * @param {Object} ctx - Simulation context
 * @returns {number} Armor reduction amount (0 or 400)
 */
export function getCorrosiveSpitArmorReduction(ctx) {
    return isCorrosiveSpitActive(ctx) ? CORROSIVE_SPIT_CONFIG.armorReduction : 0;
}

// ============================================
// HELPERS
// ============================================

/**
 * Calculate total unique uptime from overlapping periods
 * 
 * @param {Array<{start: number, end: number}>} activationTimes - Activation periods
 * @returns {number} Total unique uptime
 */
export function calculateMergedUptime(activationTimes) {
    if (!activationTimes || activationTimes.length === 0) return 0;
    
    // Sort by start time
    const sorted = [...activationTimes].sort((a, b) => a.start - b.start);
    
    // Merge overlapping periods
    const merged = [{ start: sorted[0].start, end: sorted[0].end }];
    for (let i = 1; i < sorted.length; i++) {
        const last = merged[merged.length - 1];
        if (sorted[i].start <= last.end) {
            // Overlap: extend the period
            last.end = Math.max(last.end, sorted[i].end);
        } else {
            // No overlap: add new period
            merged.push({ start: sorted[i].start, end: sorted[i].end });
        }
    }
    
    // Calculate total unique uptime
    let totalUptime = 0;
    for (const period of merged) {
        totalUptime += (period.end - period.start);
    }
    
    return totalUptime;
}

/**
 * Generate all raid buff procs
 * Convenience function to generate both Nightfall and Hemorrhage
 * 
 * @param {Object} ctx - Simulation context
 */
export function generateAllRaidBuffProcs(ctx) {
    generateNightfallProcs(ctx);
    generateHemorrhageProcs(ctx);
    generateCorrosiveSpitProcs(ctx);
}

// ============================================
// EXPORTS
// ============================================

export default {
    // Constants
    NIGHTFALL_CONFIG,
    HEMORRHAGE_CONFIG,
    CORROSIVE_SPIT_CONFIG,

    // Initialization
    initializeRaidBuffStates,

    // Nightfall
    generateNightfallProcs,
    isNightfallActive,
    getNightfallDamageMultiplier,

    // Hemorrhage
    generateHemorrhageProcs,
    isHemorrhageActive,
    getHemorrhageDamageMultiplier,

    // Corrosive Spit
    generateCorrosiveSpitProcs,
    isCorrosiveSpitActive,
    getCorrosiveSpitArmorReduction,

    // Helpers
    calculateMergedUptime,
    generateAllRaidBuffProcs
};
