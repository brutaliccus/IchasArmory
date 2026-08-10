/**
 * DOT System - Data-Driven Damage Over Time Management
 * 
 * @module sim/dotSystem
 * @description Handles DOT application, tick scheduling, snapshotting, and expiration.
 * 
 * ## Overview
 * Instead of hardcoded tickFlameShockDot(), this system:
 * - Reads DOT configuration from spell definitions
 * - Handles DOT application with damage snapshotting
 * - Schedules tick events based on tick interval
 * - Calculates tick damage using shamanSpells.js data
 * 
 * ## DOT Configuration (in shamanSpells.js)
 * ```javascript
 * flameShockDot: {
 *     dot: {
 *         tickInterval: 3,
 *         baseDuration: 15,
 *         snapshots: true,
 *         canCrit: false
 *     }
 * }
 * ```
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { shamanSpells } from '../shaman/spells.js';
import { calculateSpellDamage } from '../shaman/damageCalc.js';
import { getTargetDebuffMultiplier } from './simContext.js';
import { fireSpellResistTriggers } from './triggerRouter.js';

// ============================================
// DOT STATE MANAGEMENT
// ============================================

/**
 * @typedef {Object} DotState
 * @property {boolean} active - Whether DOT is active
 * @property {number} appliedAt - Time DOT was applied
 * @property {number} expiresAt - Time DOT expires
 * @property {number} nextTick - Time of next tick
 * @property {number} tickCount - Number of ticks executed
 * @property {number} snapshotMultiplier - Snapshotted damage multiplier (EM, NAC, Nightfall)
 * @property {number} snapshotBaseDamage - Full tick damage snapshotted at cast time
 * @property {Object} snapshotStats - Snapshotted stats at application time
 */

/**
 * Initialize DOT states
 * @param {Object} ctx - Simulation context
 */
export function initializeDotStates(ctx) {
    if (!ctx._dotStates) {
        ctx._dotStates = {};
    }
}

/**
 * Get DOT state for a spell
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key (e.g., 'flameShockDot')
 * @returns {DotState}
 */
export function getDotState(ctx, spellKey) {
    initializeDotStates(ctx);
    if (!ctx._dotStates[spellKey]) {
        ctx._dotStates[spellKey] = createDotState();
    }
    return ctx._dotStates[spellKey];
}

/**
 * Create empty DOT state
 * @returns {DotState}
 */
function createDotState() {
    return {
        active: false,
        appliedAt: 0,
        expiresAt: 0,
        nextTick: 0,
        tickCount: 0,
        snapshotMultiplier: 1.0,
        snapshotBaseDamage: 0,  // Full tick damage snapshotted at cast time
        snapshotStats: null
    };
}

/**
 * Check if a DOT is active
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key
 * @returns {boolean}
 */
export function isDotActive(ctx, spellKey) {
    const state = getDotState(ctx, spellKey);
    return state.active && state.expiresAt > ctx.currentTime;
}

/**
 * Get time remaining on a DOT
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key
 * @returns {number} Time remaining in seconds (0 if not active)
 */
export function getDotTimeRemaining(ctx, spellKey) {
    const state = getDotState(ctx, spellKey);
    if (!state.active || state.expiresAt <= ctx.currentTime) {
        return 0;
    }
    return state.expiresAt - ctx.currentTime;
}

// ============================================
// DOT APPLICATION
// ============================================

/**
 * Apply a DOT
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key (e.g., 'flameShockDot')
 * @param {Object} [options] - Options
 * @param {number} [options.durationBonus] - Bonus duration (e.g., from set bonus)
 * @returns {Object} Result with state info
 */
export function applyDot(ctx, spellKey, options = {}) {
    const spell = shamanSpells[spellKey];
    if (!spell) {
        return { success: false, reason: 'spell_not_found' };
    }
    
    // Use getDotState which properly initializes the state if needed
    const state = getDotState(ctx, spellKey);
    
    // Get DOT config from spell or use legacy fields
    const dotConfig = spell.dot || {
        tickInterval: spell.duration / spell.ticks || 3,
        baseDuration: spell.duration || 15,
        snapshots: true,
        canCrit: spell.canCrit || false
    };
    
    const baseDuration = dotConfig.baseDuration || spell.duration || 15;
    const durationBonus = options.durationBonus || 0;
    const totalDuration = baseDuration + durationBonus;
    const tickInterval = dotConfig.tickInterval || 3;
    
    // Calculate snapshot multiplier (WoW DOT snapshotting)
    let snapshotMultiplier = 1.0;
    if (dotConfig.snapshots !== false) {
        snapshotMultiplier = calculateSnapshotMultiplier(ctx, spell);
    }
    
    // Snapshot the base damage at cast time (WoW DOT snapshotting captures all stats)
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    const snapshotBaseDamage = (damageResult.average || spell.damagePerTick || 0) * snapshotMultiplier;
    
    // Snapshot the boss debuff contribution so secondary AOE targets can exclude it.
    // Static debuffs (CoE, Scorch, Fire Vulnerability) are in damageResult.
    // Nightfall (if active at cast) is in snapshotMultiplier.
    const staticDebuffMult = getTargetDebuffMultiplier(ctx, spell);
    const nightfallInSnapshot = (ctx.nightfallEnabled && ctx.isNightfallActive?.()) ? 1.10 : 1.0;
    const snapshotDebuffMultiplier = staticDebuffMult * nightfallInSnapshot;
    
    // Update state
    state.active = true;
    state.appliedAt = ctx.currentTime;
    state.expiresAt = ctx.currentTime + totalDuration;
    state.nextTick = ctx.currentTime + tickInterval;
    state.tickCount = 0;
    state.snapshotMultiplier = snapshotMultiplier;
    state.snapshotBaseDamage = snapshotBaseDamage;
    state.snapshotDebuffMultiplier = snapshotDebuffMultiplier;
    
    // Schedule first tick
    scheduleNextTick(ctx, spellKey);
    
    // Log
    if (ctx.log) {
        let msg = `${spell.name} applied, expires at ${state.expiresAt.toFixed(3)}s`;
        if (durationBonus > 0) {
            msg += ` (+${durationBonus}s bonus)`;
        }
        if (snapshotMultiplier !== 1.0) {
            msg += ` (snapshot: ${snapshotMultiplier.toFixed(2)}x)`;
        }
        ctx.log(msg);
    }
    
    return {
        success: true,
        state,
        duration: totalDuration,
        snapshotMultiplier
    };
}

/**
 * Calculate snapshot damage multiplier
 * Matches legacy behavior: checks if buffs are active at cast time
 * @param {Object} ctx - Simulation context
 * @param {Object} spell - Spell definition
 * @returns {number} Snapshot multiplier
 */
function calculateSnapshotMultiplier(ctx, spell) {
    let multiplier = 1.0;
    
    // Elemental Mastery (+15%) - check if buff is active
    if (ctx.stats?.activeModifiers?.elementalMastery) {
        multiplier *= 1.15;
    }
    
    // Natural Alignment Crystal (+20%) - check if buff is active
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) {
        multiplier *= 1.20;
    }
    
    // Nightfall (+10%) - check if buff is active via context method
    if (ctx.nightfallEnabled && ctx.isNightfallActive?.()) {
        multiplier *= 1.10;
    }
    
    return multiplier;
}

/**
 * Remove/cancel a DOT
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key
 */
export function removeDot(ctx, spellKey) {
    const state = getDotState(ctx, spellKey);
    
    if (state.active) {
        // Cancel scheduled tick
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent(`${spellKey}Tick`);
        }
        
        // Reset state
        state.active = false;
        state.expiresAt = 0;
        state.nextTick = 0;
        state.tickCount = 0;
        state.snapshotMultiplier = 1.0;
        state.snapshotBaseDamage = 0;
    }
}

// ============================================
// DOT TICKING
// ============================================

/**
 * Schedule next DOT tick
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key
 */
function scheduleNextTick(ctx, spellKey) {
    const state = getDotState(ctx, spellKey);
    
    // Allow ticks up to and including expiration time (nextTick <= expiresAt)
    if (!state.active || state.nextTick > state.expiresAt) {
        return; // DOT inactive or no more ticks
    }
    
    if (state.nextTick <= ctx.fightDuration && ctx.scheduleEvent) {
        ctx.scheduleEvent(state.nextTick, 'dotTick', () => {
            processDotTick(ctx, spellKey);
        }, `${spellKey}Tick`);
    }
}

/**
 * Process a DOT tick
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key
 * @returns {Object|null} Tick result or null
 */
export function processDotTick(ctx, spellKey) {
    const spell = shamanSpells[spellKey];
    if (!spell) {
        return null;
    }
    
    const state = getDotState(ctx, spellKey);
    // Allow ticks at exactly expiration time (use < not <=)
    if (!state.active || state.expiresAt < ctx.currentTime) {
        return null; // DOT expired
    }
    
    // Use snapshotted damage from cast time (WoW DOT snapshotting)
    let baseDamage = state.snapshotBaseDamage || 0;
    
    // Fallback for legacy state (shouldn't happen in normal operation)
    if (!baseDamage && state.snapshotMultiplier) {
        const damageResult = calculateSpellDamage(spell, ctx.stats);
        baseDamage = (damageResult.average || spell.damagePerTick || 0) * state.snapshotMultiplier;
    }
    
    const canCrit = spell.dot?.canCrit ?? spell.canCrit ?? false;
    const abilityName = spellKey === 'flameShockDot' ? 'Flame Shock DoT' : spell.name;
    
    // AOE: Flame Shock DoT ticks independently on each target with its own FS active
    const tickTargets = spellKey === 'flameShockDot' && typeof ctx.getFlameShockAoeMultiplier === 'function'
        ? ctx.getFlameShockAoeMultiplier()
        : 1;
    
    // Secondary AOE targets don't have boss debuffs; divide them out of the snapshot
    const debuffDiv = state.snapshotDebuffMultiplier || 1.0;
    const secondaryBaseDamage = debuffDiv > 1 ? baseDamage / debuffDiv : baseDamage;
    
    let totalDamage = 0;
    for (let t = 0; t < tickTargets; t++) {
        const isSecondary = t > 0;
        let damage = isSecondary ? secondaryBaseDamage : baseDamage;
        let resistType = 'none';
        let outcome = 'hit';
        
        // DOT ticks use 1/10th resistance (bosses have effective 2.4 base resist for DOTs)
        if (spell.school && spell.school !== 'physical' && ctx.rollForResistance) {
            const resistResult = ctx.rollForResistance(spell.school, { isDot: true });
            damage *= resistResult.multiplier;
            resistType = resistResult.type;
        }
        
        let isCrit = false;
        if (canCrit && ctx.rollForCrit && damage > 0) {
            isCrit = ctx.rollForCrit(spell, false);
            if (isCrit) {
                damage *= 1.5;
                outcome = 'crit';
            }
        }
        
        if (ctx.recordDamage) {
            ctx.recordDamage(abilityName, damage, {
                type: 'dot',
                outcome,
                resistType
            });
        }
        
        if (resistType !== 'none') {
            fireSpellResistTriggers(ctx, abilityName, spell.icon || '', { school: spell.school });
        }
        
        totalDamage += damage;
    }
    
    if (ctx.log) {
        let msg = `${abilityName} tick: ${totalDamage.toFixed(2)} damage`;
        if (tickTargets > 1) {
            msg += ` (${tickTargets} targets)`;
        }
        ctx.log(msg);
    }
    
    // Update state
    state.tickCount++;
    
    // Get tick interval
    const dotConfig = spell.dot || {};
    const tickInterval = dotConfig.tickInterval || (spell.duration / spell.ticks) || 3;
    
    state.nextTick += tickInterval;
    
    // Schedule next tick if within DOT duration
    if (state.nextTick <= state.expiresAt) {
        scheduleNextTick(ctx, spellKey);
    } else {
        state.nextTick = 0;
    }
    
    return {
        damage: totalDamage,
        tickNumber: state.tickCount
    };
}

// ============================================
// EXPORTS
// ============================================

export default {
    initializeDotStates,
    getDotState,
    isDotActive,
    getDotTimeRemaining,
    applyDot,
    removeDot,
    processDotTick
};
