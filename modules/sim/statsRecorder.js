/**
 * Stats Recorder Module
 * 
 * @module sim/statsRecorder
 * @description Handles UI reporting data collection, decoupled from simulation logic.
 * 
 * ## Overview
 * This module manages:
 * - Damage event recording (for damage/threat timeline)
 * - Buff activation recording (for uptime timeline)
 * - Combat statistics tracking (hits, crits, misses)
 * - Result building for UI display
 * 
 * ## Design Philosophy
 * - Single responsibility: Only handles "what to show in UI"
 * - Simulation modules handle "what happens" (damage, procs, buffs)
 * - This module handles "what to record for display"
 * - Can be disabled entirely in quickSim mode
 * 
 * ## Usage
 * ```javascript
 * import { initializeStatsRecorder, recordDamageEvent, buildSimulationResults } from './statsRecorder.js';
 * 
 * // Initialize at start of sim
 * initializeStatsRecorder(ctx);
 * 
 * // Record events during sim
 * recordDamageEvent(ctx, 'Stormstrike', 500, { type: 'melee', outcome: 'crit' });
 * 
 * // Build results at end
 * const results = buildSimulationResults(ctx);
 * ```
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

// ============================================
// STATE MANAGEMENT
// ============================================

/**
 * Stats recorder state storage key on context
 * @constant {string}
 */
const STATS_STATE_KEY = '_statsRecorder';

/**
 * Initialize stats recorder on context
 * @param {Object} ctx - Simulation context
 * @param {Object} [options] - Options
 * @param {boolean} [options.quickSim=false] - Minimal tracking for performance
 */
export function initializeStatsRecorder(ctx, options = {}) {
    const { quickSim = false } = options;
    
    ctx[STATS_STATE_KEY] = {
        quickSim,
        
        // Damage events for timeline
        damageEvents: [],
        
        // Totals
        totalDamage: 0,
        totalThreat: 0,
        
        // Combat statistics
        combatStats: {
            totalHits: 0,
            totalCrits: 0,
            totalMisses: 0,
            totalDodges: 0,
            totalParries: 0,
            totalGlancingBlows: 0,
            totalResists: 0,
            hitDamageTotal: 0,
            critDamageTotal: 0,
            glancingDamageTotal: 0,
            partialResists: {
                resist_75: 0,
                resist_50: 0,
                resist_25: 0
            },
            fullResists: 0
        },
        
        // Combat log
        combatLog: []
    };
}

/**
 * Get stats recorder state
 * @param {Object} ctx - Simulation context
 * @returns {Object} Stats recorder state
 */
export function getStatsRecorderState(ctx) {
    if (!ctx[STATS_STATE_KEY]) {
        initializeStatsRecorder(ctx);
    }
    return ctx[STATS_STATE_KEY];
}

/**
 * Check if stats recorder should track detailed data
 * @param {Object} ctx - Simulation context
 * @returns {boolean} Whether to track detailed data
 */
export function shouldTrackDetails(ctx) {
    const state = getStatsRecorderState(ctx);
    return !state.quickSim;
}

// ============================================
// DAMAGE EVENT RECORDING
// ============================================

/**
 * Record a damage event
 * @param {Object} ctx - Simulation context
 * @param {string} abilityName - Name of the ability
 * @param {number} damage - Damage dealt
 * @param {Object} [eventData] - Additional event data
 * @param {string} [eventData.type] - Event type (melee, spell, proc, dot)
 * @param {string} [eventData.outcome] - Outcome (hit, crit, miss, dodge, parry, glancing)
 * @param {string} [eventData.resistType] - Resist type (none, resist_25, resist_50, resist_75, full_resist)
 * @param {string} [eventData.school] - Damage school (physical, fire, nature, etc.)
 * @param {number} [eventData.threat] - Threat generated (defaults to damage)
 */
export function recordDamageEvent(ctx, abilityName, damage, eventData = {}) {
    const state = getStatsRecorderState(ctx);
    const {
        type = 'melee',
        outcome = 'hit',
        resistType = 'none',
        school = 'physical',
        threat = damage
    } = eventData;
    
    // Always update totals
    state.totalDamage += damage;
    state.totalThreat += threat;
    
    // Update combat stats
    updateCombatStats(state.combatStats, damage, outcome, resistType);
    
    // Skip detailed event tracking in quickSim mode
    if (state.quickSim) {
        return;
    }
    
    // Record the event for timeline
    state.damageEvents.push({
        time: ctx.currentTime,
        ability: abilityName,
        damage,
        threat,
        type,
        outcome,
        resistType,
        school,
        ...eventData
    });
}

/**
 * Record a threat-only event (no damage)
 * @param {Object} ctx - Simulation context
 * @param {string} abilityName - Name of the ability
 * @param {number} threat - Threat generated
 * @param {Object} [eventData] - Additional event data
 */
export function recordThreatEvent(ctx, abilityName, threat, eventData = {}) {
    const state = getStatsRecorderState(ctx);
    
    state.totalThreat += threat;
    
    if (state.quickSim) {
        return;
    }
    
    state.damageEvents.push({
        time: ctx.currentTime,
        ability: abilityName,
        damage: 0,
        threat,
        type: eventData.type || 'threat',
        outcome: 'hit',
        ...eventData
    });
}

/**
 * Update combat statistics based on outcome
 * @param {Object} stats - Combat stats object
 * @param {number} damage - Damage dealt
 * @param {string} outcome - Hit outcome
 * @param {string} resistType - Resist type
 */
function updateCombatStats(stats, damage, outcome, resistType) {
    switch (outcome) {
        case 'crit':
            stats.totalCrits++;
            stats.critDamageTotal += damage;
            break;
        case 'hit':
            stats.totalHits++;
            stats.hitDamageTotal += damage;
            break;
        case 'miss':
            stats.totalMisses++;
            break;
        case 'dodge':
            stats.totalDodges++;
            break;
        case 'parry':
            stats.totalParries++;
            break;
        case 'glancing':
            stats.totalGlancingBlows++;
            stats.glancingDamageTotal += damage;
            break;
        case 'full_resist':
            stats.fullResists++;
            stats.totalResists++;
            break;
    }
    
    // Track partial resists
    if (resistType === 'resist_75') {
        stats.partialResists.resist_75++;
    } else if (resistType === 'resist_50') {
        stats.partialResists.resist_50++;
    } else if (resistType === 'resist_25') {
        stats.partialResists.resist_25++;
    }
}

// ============================================
// COMBAT LOG
// ============================================

/**
 * Add entry to combat log
 * @param {Object} ctx - Simulation context
 * @param {string} message - Log message
 */
export function logCombat(ctx, message) {
    const state = getStatsRecorderState(ctx);
    
    if (state.quickSim) {
        return;
    }
    
    state.combatLog.push({
        time: ctx.currentTime,
        message
    });
}

// ============================================
// RESULT BUILDING
// ============================================

/**
 * Build simulation results object for UI
 * @param {Object} ctx - Simulation context
 * @param {number} fightDuration - Fight duration in seconds
 * @returns {Object} Formatted results for UI
 */
export function buildSimulationResults(ctx, fightDuration) {
    const state = getStatsRecorderState(ctx);
    
    // Close any open buff activations at fight end
    closeOpenActivations(ctx, fightDuration);
    
    // Calculate DPS/TPS
    const dps = fightDuration > 0 ? state.totalDamage / fightDuration : 0;
    const tps = fightDuration > 0 ? state.totalThreat / fightDuration : 0;
    
    // Build damage breakdown
    const damageBreakdown = buildDamageBreakdown(state.damageEvents, state.totalDamage);
    
    // Calculate combat stat rates
    const combatStats = calculateCombatStatRates(state.combatStats);
    
    // Build buff uptime (from context buffUptime if available)
    const buffUptime = buildBuffUptime(ctx, fightDuration);
    
    return {
        totalDamage: state.totalDamage,
        dps,
        totalThreat: state.totalThreat,
        tps,
        damageEvents: state.damageEvents,
        damageBreakdown,
        combatLog: state.combatLog,
        combatStats,
        buffUptime
    };
}

/**
 * Build damage breakdown by ability
 * @param {Array} damageEvents - Array of damage events
 * @param {number} totalDamage - Total damage dealt
 * @returns {Object} Damage breakdown by ability
 */
function buildDamageBreakdown(damageEvents, totalDamage) {
    const breakdown = {};
    const abilityStats = {};
    
    for (const event of damageEvents) {
        const ability = event.ability;
        
        if (!breakdown[ability]) {
            breakdown[ability] = {
                total: 0,
                count: 0,
                percent: 0,
                threat: 0
            };
            abilityStats[ability] = {
                hits: 0,
                crits: 0,
                misses: 0,
                dodges: 0,
                parries: 0,
                glancing: 0,
                fullResists: 0,
                hitDamage: 0,
                critDamage: 0,
                minHit: Infinity,
                maxHit: 0,
                minCrit: Infinity,
                maxCrit: 0
            };
        }
        
        breakdown[ability].total += event.damage;
        breakdown[ability].count++;
        breakdown[ability].threat += event.threat || 0;
        
        // Update ability-specific stats
        const stats = abilityStats[ability];
        switch (event.outcome) {
            case 'crit':
                stats.crits++;
                stats.critDamage += event.damage;
                if (event.damage > 0) {
                    stats.minCrit = Math.min(stats.minCrit, event.damage);
                    stats.maxCrit = Math.max(stats.maxCrit, event.damage);
                }
                break;
            case 'hit':
                stats.hits++;
                stats.hitDamage += event.damage;
                if (event.damage > 0) {
                    stats.minHit = Math.min(stats.minHit, event.damage);
                    stats.maxHit = Math.max(stats.maxHit, event.damage);
                }
                break;
            case 'miss':
                stats.misses++;
                break;
            case 'dodge':
                stats.dodges++;
                break;
            case 'parry':
                stats.parries++;
                break;
            case 'glancing':
                stats.glancing++;
                stats.hitDamage += event.damage;
                break;
            case 'full_resist':
                stats.fullResists++;
                break;
        }
    }
    
    // Calculate percentages and merge stats
    for (const ability of Object.keys(breakdown)) {
        breakdown[ability].percent = totalDamage > 0 
            ? (breakdown[ability].total / totalDamage) * 100 
            : 0;
        
        // Merge ability stats
        const stats = abilityStats[ability];
        breakdown[ability].hits = stats.hits;
        breakdown[ability].crits = stats.crits;
        breakdown[ability].misses = stats.misses;
        breakdown[ability].avgHit = stats.hits > 0 ? stats.hitDamage / stats.hits : 0;
        breakdown[ability].avgCrit = stats.crits > 0 ? stats.critDamage / stats.crits : 0;
        breakdown[ability].minHit = stats.minHit === Infinity ? 0 : stats.minHit;
        breakdown[ability].maxHit = stats.maxHit;
        breakdown[ability].minCrit = stats.minCrit === Infinity ? 0 : stats.minCrit;
        breakdown[ability].maxCrit = stats.maxCrit;
    }
    
    // Sort by damage (descending)
    return Object.entries(breakdown)
        .sort(([, a], [, b]) => b.total - a.total)
        .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {});
}

/**
 * Calculate combat stat rates
 * @param {Object} stats - Raw combat stats
 * @returns {Object} Stats with rates
 */
function calculateCombatStatRates(stats) {
    const totalAttempts = stats.totalHits + stats.totalCrits + stats.totalMisses + 
                          stats.totalDodges + stats.totalParries + stats.totalGlancingBlows;
    
    return {
        ...stats,
        totalAttempts,
        avgCritDamage: stats.totalCrits > 0 ? stats.critDamageTotal / stats.totalCrits : 0,
        avgHitDamage: stats.totalHits > 0 ? stats.hitDamageTotal / stats.totalHits : 0,
        avgGlancingDamage: stats.totalGlancingBlows > 0 ? stats.glancingDamageTotal / stats.totalGlancingBlows : 0,
        critRate: totalAttempts > 0 ? (stats.totalCrits / totalAttempts) * 100 : 0,
        missRate: totalAttempts > 0 ? (stats.totalMisses / totalAttempts) * 100 : 0,
        dodgeRate: totalAttempts > 0 ? (stats.totalDodges / totalAttempts) * 100 : 0,
        parryRate: totalAttempts > 0 ? (stats.totalParries / totalAttempts) * 100 : 0,
        glancingRate: totalAttempts > 0 ? (stats.totalGlancingBlows / totalAttempts) * 100 : 0,
        hitRate: totalAttempts > 0 ? (stats.totalHits / totalAttempts) * 100 : 0
    };
}

/**
 * Close all open buff activations at end of fight
 * Ensures accurate uptime calculation by setting end time on any buff
 * that was still active when the fight ended.
 * 
 * @param {Object} ctx - Simulation context  
 * @param {number} fightDuration - Fight duration
 */
export function closeOpenActivations(ctx, fightDuration) {
    const sourceBuffs = ctx.buffUptime || ctx._buffSystem?.buffs || {};
    
    for (const [buffName, buffData] of Object.entries(sourceBuffs)) {
        if (!buffData || !buffData.activationTimes || buffData.activationTimes.length === 0) continue;
        
        const lastActivation = buffData.activationTimes[buffData.activationTimes.length - 1];
        if (lastActivation) {
            // If activation has no end time, close it at fight end
            if (!lastActivation.end || lastActivation.end > fightDuration) {
                lastActivation.end = fightDuration;
            }
            // Recalculate duration if needed
            if (lastActivation.start !== undefined) {
                lastActivation.duration = lastActivation.end - lastActivation.start;
            }
        }
    }
}

/**
 * Build buff uptime data from context
 * @param {Object} ctx - Simulation context
 * @param {number} fightDuration - Fight duration
 * @returns {Object} Buff uptime data
 */
function buildBuffUptime(ctx, fightDuration) {
    const buffUptime = {};
    
    // Get buff data from context (may be from BuffSystem or legacy buffUptime)
    const sourceBuffs = ctx.buffUptime || ctx._buffSystem?.buffs || {};
    
    for (const [buffName, buffData] of Object.entries(sourceBuffs)) {
        if (!buffData || !buffData.activationTimes) continue;
        
        // Calculate total uptime
        let totalUptime = 0;
        for (const activation of buffData.activationTimes) {
            const effectiveEnd = Math.min(activation.end || fightDuration, fightDuration);
            const effectiveStart = Math.max(activation.start || 0, 0);
            if (effectiveEnd > effectiveStart) {
                totalUptime += effectiveEnd - effectiveStart;
            }
        }
        
        buffUptime[buffName] = {
            totalUptime,
            uptimePercent: fightDuration > 0 ? (totalUptime / fightDuration) * 100 : 0,
            procs: buffData.procs || 0,
            refreshes: buffData.refreshes || 0,
            activationTimes: buffData.activationTimes
        };
    }
    
    return buffUptime;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get total damage dealt
 * @param {Object} ctx - Simulation context
 * @returns {number} Total damage
 */
export function getTotalDamage(ctx) {
    return getStatsRecorderState(ctx).totalDamage;
}

/**
 * Get total threat generated
 * @param {Object} ctx - Simulation context
 * @returns {number} Total threat
 */
export function getTotalThreat(ctx) {
    return getStatsRecorderState(ctx).totalThreat;
}

/**
 * Get damage events array
 * @param {Object} ctx - Simulation context
 * @returns {Array} Damage events
 */
export function getDamageEvents(ctx) {
    return getStatsRecorderState(ctx).damageEvents;
}

/**
 * Get combat stats
 * @param {Object} ctx - Simulation context
 * @returns {Object} Combat stats
 */
export function getCombatStats(ctx) {
    return getStatsRecorderState(ctx).combatStats;
}

/**
 * Reset stats recorder for new simulation
 * @param {Object} ctx - Simulation context
 */
export function resetStatsRecorder(ctx) {
    const state = getStatsRecorderState(ctx);
    const quickSim = state.quickSim;
    
    initializeStatsRecorder(ctx, { quickSim });
}

// ============================================
// EXPORTS
// ============================================

export default {
    initializeStatsRecorder,
    getStatsRecorderState,
    shouldTrackDetails,
    recordDamageEvent,
    recordThreatEvent,
    logCombat,
    buildSimulationResults,
    closeOpenActivations,
    getTotalDamage,
    getTotalThreat,
    getDamageEvents,
    getCombatStats,
    resetStatsRecorder
};
