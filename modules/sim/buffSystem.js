/**
 * Buff System Module
 * 
 * @module sim/buffSystem
 * @description Handles buff/debuff tracking, uptime calculation, and activation recording.
 * 
 * ## Overview
 * This module manages:
 * - Buff activation and expiration tracking
 * - Uptime calculation for timeline display
 * - Refresh tracking (when buffs are refreshed before expiring)
 * - Trigger source recording (what caused the buff)
 * 
 * ## Buff Data Structure
 * Each buff tracks:
 * - `activationTimes` - Array of activation periods
 * - `totalUptime` - Calculated uptime in seconds
 * - `procs` - Number of times the buff procced
 * - `refreshes` - Number of times the buff was refreshed
 * 
 * ## Activation Period Structure
 * ```javascript
 * {
 *   start: number,           // Start time in seconds
 *   end: number,             // End time in seconds
 *   duration: number,        // Duration in seconds (end - start)
 *   triggerSource: string,   // What triggered this (e.g., "Lightning Bolt")
 *   triggerIcon: string,     // Icon URL for the trigger
 *   refreshes: Array         // Array of refresh events
 * }
 * ```
 * 
 * ## Usage Example
 * ```javascript
 * const buffSystem = new BuffSystem();
 * 
 * // Activate a buff
 * buffSystem.activateBuff('flurry', {
 *   duration: 15,
 *   triggerSource: 'Auto Attack',
 *   triggerIcon: 'spell_nature_windfury.png'
 * });
 * 
 * // Refresh a buff
 * buffSystem.refreshBuff('flurry', {
 *   newDuration: 15,
 *   triggerSource: 'Stormstrike'
 * });
 * 
 * // Deactivate when time expires
 * buffSystem.deactivateBuff('flurry');
 * 
 * // Get uptime for timeline
 * const uptime = buffSystem.calculateUptime('flurry', fightDuration);
 * ```
 * 
 * @version 1.0.0
 * @since 2026-01-25
 */

/**
 * Default buff configuration
 * @constant
 */
export const DEFAULT_BUFF_CONFIG = {
    activationTimes: [],
    totalUptime: 0,
    procs: 0,
    refreshes: 0
};

/**
 * List of all tracked buffs in the simulator
 * @constant
 */
export const TRACKED_BUFFS = [
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
    'corrosiveSpit',
    'echoedThunder',
    'instantLightningBolt',
    'stormwolfFrenzy',
    'bloodlust',
    'badgeOfTheSwarmguard',
    'ornateBloodstoneDagger',
    'bladeOfEternalDarkness',
    'elementalFocus',
    'dragonbreathChili'
];

/**
 * Create a fresh buff tracking object
 * 
 * @param {Object} options - Additional options for the buff
 * @returns {Object} Fresh buff tracking object
 */
export function createBuffTracker(options = {}) {
    return {
        activationTimes: [],
        totalUptime: 0,
        procs: 0,
        refreshes: 0,
        ...options
    };
}

/**
 * Create minimal buff tracker for quickSim mode (performance optimization)
 * 
 * @returns {Object} Minimal buff tracker
 */
export function createMinimalBuffTracker() {
    return {
        activationTimes: [],
        totalUptime: 0,
        procs: 0,
        refreshes: 0
    };
}

/**
 * Create all buff trackers for simulation
 * 
 * @param {boolean} quickSim - Whether to use minimal tracking
 * @returns {Object} Object with all buff trackers
 */
export function createAllBuffTrackers(quickSim = false) {
    const factory = quickSim ? createMinimalBuffTracker : createBuffTracker;
    
    const trackers = {};
    for (const buffName of TRACKED_BUFFS) {
        trackers[buffName] = factory();
    }
    
    // Special case: elementalFocus has additional tracking
    if (!quickSim) {
        trackers.elementalFocus.chargesConsumed = 0;
    }
    
    return trackers;
}

/**
 * BuffSystem class - manages buff tracking
 */
export class BuffSystem {
    /**
     * Create a new BuffSystem instance
     * 
     * @param {Object} config - Configuration object
     * @param {boolean} config.quickSim - Use minimal tracking for performance
     * @param {Function} config.getCurrentTime - Function to get current simulation time
     */
    constructor(config = {}) {
        this.quickSim = config.quickSim || false;
        this.getCurrentTime = config.getCurrentTime || (() => 0);
        
        // Initialize all buff trackers
        this.buffs = createAllBuffTrackers(this.quickSim);
        
        // Track currently active buffs
        this.activeBuffs = new Set();
    }
    
    /**
     * Check if we should track detailed uptime
     * Returns false in quickSim mode for performance
     * 
     * @returns {boolean}
     */
    shouldTrackUptime() {
        return !this.quickSim;
    }
    
    /**
     * Activate a buff
     * 
     * @param {string} buffName - Name of the buff
     * @param {Object} options - Activation options
     * @param {number} options.duration - Duration in seconds
     * @param {string} options.triggerSource - What triggered this buff
     * @param {string} options.triggerIcon - Icon URL for the trigger
     * @param {number} [options.stacks] - Number of stacks (for stackable buffs)
     * @returns {Object} The activation record
     */
    activateBuff(buffName, options = {}) {
        const currentTime = this.getCurrentTime();
        const buff = this.buffs[buffName];
        
        if (!buff) {
            console.warn(`[BuffSystem] Unknown buff: ${buffName}`);
            return null;
        }
        
        buff.procs++;
        this.activeBuffs.add(buffName);
        
        if (!this.shouldTrackUptime()) {
            return null;
        }
        
        const activation = {
            start: currentTime,
            end: currentTime + (options.duration || 0),
            duration: options.duration || 0,
            triggerSource: options.triggerSource || 'Unknown',
            triggerIcon: options.triggerIcon || null,
            stacks: options.stacks || 1,
            refreshes: []
        };
        
        buff.activationTimes.push(activation);
        return activation;
    }
    
    /**
     * Refresh an active buff (extend duration)
     * 
     * @param {string} buffName - Name of the buff
     * @param {Object} options - Refresh options
     * @param {number} options.newDuration - New duration from current time
     * @param {string} options.triggerSource - What triggered the refresh
     * @param {string} options.triggerIcon - Icon URL for the trigger
     * @returns {boolean} True if refresh was recorded
     */
    refreshBuff(buffName, options = {}) {
        const currentTime = this.getCurrentTime();
        const buff = this.buffs[buffName];
        
        if (!buff) return false;
        
        buff.refreshes++;
        
        if (!this.shouldTrackUptime()) {
            return true;
        }
        
        const lastActivation = buff.activationTimes[buff.activationTimes.length - 1];
        if (!lastActivation) return false;
        
        // Update end time
        const newEnd = currentTime + (options.newDuration || 0);
        lastActivation.end = newEnd;
        
        // IMPORTANT: Update duration to match new end time
        // This ensures timeline displays correct duration including refreshes
        lastActivation.duration = lastActivation.end - lastActivation.start;
        
        // Record the refresh event
        lastActivation.refreshes.push({
            time: currentTime,
            triggerSource: options.triggerSource || 'Unknown',
            triggerIcon: options.triggerIcon || null,
            newEndTime: newEnd
        });
        
        return true;
    }
    
    /**
     * Deactivate a buff
     * 
     * @param {string} buffName - Name of the buff
     * @param {number} [endTime] - Optional end time (defaults to current time)
     */
    deactivateBuff(buffName, endTime = null) {
        const currentTime = endTime !== null ? endTime : this.getCurrentTime();
        const buff = this.buffs[buffName];
        
        if (!buff) return;
        
        this.activeBuffs.delete(buffName);
        
        if (!this.shouldTrackUptime()) return;
        
        const lastActivation = buff.activationTimes[buff.activationTimes.length - 1];
        if (lastActivation && lastActivation.end > currentTime) {
            lastActivation.end = currentTime;
            lastActivation.duration = lastActivation.end - lastActivation.start;
        }
    }
    
    /**
     * Check if a buff is currently active
     * 
     * @param {string} buffName - Name of the buff
     * @returns {boolean}
     */
    isBuffActive(buffName) {
        return this.activeBuffs.has(buffName);
    }
    
    /**
     * Get the last activation for a buff
     * 
     * @param {string} buffName - Name of the buff
     * @returns {Object|null} Last activation record or null
     */
    getLastActivation(buffName) {
        const buff = this.buffs[buffName];
        if (!buff || buff.activationTimes.length === 0) return null;
        return buff.activationTimes[buff.activationTimes.length - 1];
    }
    
    /**
     * Calculate total uptime for a buff
     * 
     * @param {string} buffName - Name of the buff
     * @param {number} fightDuration - Total fight duration
     * @returns {number} Total uptime in seconds
     */
    calculateUptime(buffName, fightDuration) {
        const buff = this.buffs[buffName];
        if (!buff) return 0;
        
        let totalUptime = 0;
        for (const activation of buff.activationTimes) {
            const effectiveEnd = Math.min(activation.end, fightDuration);
            const effectiveStart = Math.max(activation.start, 0);
            if (effectiveEnd > effectiveStart) {
                totalUptime += effectiveEnd - effectiveStart;
            }
        }
        
        buff.totalUptime = totalUptime;
        return totalUptime;
    }
    
    /**
     * Calculate uptime percentage for a buff
     * 
     * @param {string} buffName - Name of the buff
     * @param {number} fightDuration - Total fight duration
     * @returns {number} Uptime percentage (0-100)
     */
    calculateUptimePercent(buffName, fightDuration) {
        if (fightDuration <= 0) return 0;
        const uptime = this.calculateUptime(buffName, fightDuration);
        return (uptime / fightDuration) * 100;
    }
    
    /**
     * Get all buff tracking data
     * 
     * @returns {Object} All buff tracking data
     */
    getAllBuffData() {
        return this.buffs;
    }
    
    /**
     * Reset all buff tracking
     */
    reset() {
        this.buffs = createAllBuffTrackers(this.quickSim);
        this.activeBuffs.clear();
    }
    
    /**
     * Get summary statistics for all buffs
     * 
     * @param {number} fightDuration - Total fight duration
     * @returns {Object} Summary statistics
     */
    getSummary(fightDuration) {
        const summary = {};
        
        for (const buffName of TRACKED_BUFFS) {
            const buff = this.buffs[buffName];
            if (buff.procs > 0) {
                summary[buffName] = {
                    procs: buff.procs,
                    refreshes: buff.refreshes,
                    uptime: this.calculateUptime(buffName, fightDuration),
                    uptimePercent: this.calculateUptimePercent(buffName, fightDuration)
                };
            }
        }
        
        return summary;
    }
}

// ============================================
// TALENT BUFF DEFINITIONS
// ============================================

/**
 * Talent buff definitions
 * @constant {Object}
 */
export const TALENT_BUFF_DEFINITIONS = {
    elementalMastery: {
        id: 'elementalMastery',
        name: 'Elemental Mastery',
        duration: 15,
        cooldown: 180, // 3 minutes
        effect: {
            type: 'spellDamagePercent',
            value: 0.15, // +15% Fire/Frost/Nature damage
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
        cooldown: 360, // 6 minutes
        effect: {
            type: 'hastePercent',
            value: 0.20 // +20% attack speed
        },
        triggersGCD: true,
        fromTalent: true,
        talentId: 'bloodlust'
    }
};

// ============================================
// TALENT BUFF STATE MANAGEMENT
// ============================================

/**
 * Talent buff state storage key on context
 * @constant {string}
 */
const TALENT_BUFF_STATE_KEY = '_talentBuffStates';

/**
 * Initialize talent buff states on context
 * @param {Object} ctx - Simulation context
 */
export function initializeTalentBuffStates(ctx) {
    if (!ctx[TALENT_BUFF_STATE_KEY]) {
        ctx[TALENT_BUFF_STATE_KEY] = {};
    }
    
    for (const buffId of Object.keys(TALENT_BUFF_DEFINITIONS)) {
        if (!ctx[TALENT_BUFF_STATE_KEY][buffId]) {
            ctx[TALENT_BUFF_STATE_KEY][buffId] = {
                cooldownReady: 0,
                buffExpires: 0,
                isActive: false,
                activationCount: 0
            };
        }
    }
}

/**
 * Get talent buff state
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 * @returns {Object} Buff state
 */
export function getTalentBuffState(ctx, buffId) {
    initializeTalentBuffStates(ctx);
    return ctx[TALENT_BUFF_STATE_KEY][buffId] || {};
}

/**
 * Get talent buff definition
 * @param {string} buffId - Buff ID
 * @returns {Object} Buff definition
 */
export function getTalentBuffDefinition(buffId) {
    return TALENT_BUFF_DEFINITIONS[buffId] || null;
}

// ============================================
// TALENT BUFF AVAILABILITY
// ============================================

/**
 * Check if talent is learned
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 * @returns {boolean} Whether talent is learned
 */
export function hasTalentBuff(ctx, buffId) {
    const def = getTalentBuffDefinition(buffId);
    if (!def) return false;
    
    // Check via simContext
    if (ctx.simContext) {
        switch (buffId) {
            case 'elementalMastery':
                if ('hasElementalMastery' in ctx.simContext) {
                    return !!ctx.simContext.hasElementalMastery;
                }
                break;
            case 'bloodlust':
                if ('hasBloodlust' in ctx.simContext) {
                    return !!ctx.simContext.hasBloodlust;
                }
                break;
        }
    }
    
    // Check via stats.activeModifiers or talent bonuses
    if (ctx.stats) {
        switch (buffId) {
            case 'elementalMastery':
                // Check if talent is available
                return ctx.stats.talentBonuses?.elemental_mastery > 0 ||
                       ctx.hasElementalMasteryTalent?.() ||
                       ctx.stats.activeModifiers?.hasElementalMastery;
            case 'bloodlust':
                return ctx.stats.talentBonuses?.bloodlust > 0 ||
                       ctx.hasBloodlustTalent?.() ||
                       ctx.stats.activeModifiers?.hasBloodlust;
        }
    }
    
    return false;
}

/**
 * Check if talent buff is off cooldown
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 * @returns {boolean} Whether buff is ready
 */
export function isTalentBuffReady(ctx, buffId) {
    if (!hasTalentBuff(ctx, buffId)) return false;
    
    const state = getTalentBuffState(ctx, buffId);
    return ctx.currentTime >= state.cooldownReady;
}

/**
 * Check if talent buff is currently active
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 * @returns {boolean} Whether buff is active
 */
export function isTalentBuffActive(ctx, buffId) {
    const state = getTalentBuffState(ctx, buffId);
    return state.isActive && ctx.currentTime < state.buffExpires;
}

/**
 * Get cooldown remaining for talent buff
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 * @returns {number} Seconds until ready (0 if ready)
 */
export function getTalentBuffCooldownRemaining(ctx, buffId) {
    const state = getTalentBuffState(ctx, buffId);
    return Math.max(0, state.cooldownReady - ctx.currentTime);
}

// ============================================
// TALENT BUFF ACTIVATION
// ============================================

/**
 * Activate a talent buff
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 * @returns {Object} Activation result
 */
export function activateTalentBuff(ctx, buffId) {
    if (!hasTalentBuff(ctx, buffId)) {
        return { success: false, reason: 'talent_not_learned' };
    }
    
    if (!isTalentBuffReady(ctx, buffId)) {
        return { success: false, reason: 'on_cooldown' };
    }
    
    const def = getTalentBuffDefinition(buffId);
    if (!def) {
        return { success: false, reason: 'unknown_buff' };
    }
    
    const state = getTalentBuffState(ctx, buffId);
    
    // Activate the buff
    state.isActive = true;
    state.buffExpires = ctx.currentTime + def.duration;
    state.cooldownReady = ctx.currentTime + def.cooldown;
    state.activationCount++;
    
    // Set modifier flag
    if (ctx.stats?.activeModifiers) {
        ctx.stats.activeModifiers[buffId] = true;
    }
    
    // Track uptime
    if (ctx.buffUptime?.[buffId]) {
        ctx.buffUptime[buffId].activationTimes.push({
            start: ctx.currentTime,
            end: state.buffExpires,
            duration: def.duration
        });
        ctx.buffUptime[buffId].procs++;
    }
    
    // Schedule expiration
    if (state.buffExpires <= ctx.fightDuration && ctx.scheduleEvent) {
        ctx.unscheduleEvent?.(`${buffId}Expire`);
        ctx.scheduleEvent(state.buffExpires, 'buffExpire', () => {
            handleTalentBuffExpiration(ctx, buffId);
        }, `${buffId}Expire`);
    }
    
    // Legacy compatibility
    switch (buffId) {
        case 'elementalMastery':
            if (ctx.elementalMasteryExpires !== undefined) {
                ctx.elementalMasteryExpires = state.buffExpires;
            }
            if (ctx.cooldowns) {
                ctx.cooldowns.elementalMastery = state.cooldownReady;
            }
            break;
        case 'bloodlust':
            if (ctx.bloodlustExpires !== undefined) {
                ctx.bloodlustExpires = state.buffExpires;
            }
            if (ctx.bloodlustActive !== undefined) {
                ctx.bloodlustActive = true;
            }
            if (ctx.bloodlustCooldown !== undefined) {
                ctx.bloodlustCooldown = state.cooldownReady;
            }
            break;
    }
    
    // Log
    if (ctx.log) {
        ctx.log(`${def.name} activated! (${def.duration}s duration, ${def.cooldown}s cooldown)`);
    }
    
    return { success: true };
}

/**
 * Handle talent buff expiration
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 */
function handleTalentBuffExpiration(ctx, buffId) {
    const state = getTalentBuffState(ctx, buffId);
    const def = getTalentBuffDefinition(buffId);
    
    if (!state.isActive || ctx.currentTime < state.buffExpires) {
        return; // Not expired yet or already expired
    }
    
    state.isActive = false;
    
    // Remove modifier flag
    if (ctx.stats?.activeModifiers) {
        ctx.stats.activeModifiers[buffId] = false;
    }
    
    // Legacy compatibility
    switch (buffId) {
        case 'elementalMastery':
            if (ctx.elementalMasteryExpires !== undefined) {
                ctx.elementalMasteryExpires = 0;
            }
            break;
        case 'bloodlust':
            if (ctx.bloodlustExpires !== undefined) {
                ctx.bloodlustExpires = 0;
            }
            if (ctx.bloodlustActive !== undefined) {
                ctx.bloodlustActive = false;
            }
            break;
    }
    
    if (ctx.log) {
        ctx.log(`${def?.name || buffId} expired`);
    }
}

// ============================================
// BUFF MULTIPLIER HELPERS
// ============================================

/**
 * Get haste multiplier from active talent buffs
 * @param {Object} ctx - Simulation context
 * @returns {number} Haste multiplier (1.0 = no haste)
 */
export function getTalentBuffHasteMultiplier(ctx) {
    let multiplier = 1.0;
    
    // Bloodlust: +20% attack speed
    if (isTalentBuffActive(ctx, 'bloodlust')) {
        const def = getTalentBuffDefinition('bloodlust');
        multiplier *= (1 + (def?.effect?.value || 0.20));
    }
    
    return multiplier;
}

/**
 * Get spell damage multiplier from active talent buffs for a specific school
 * @param {Object} ctx - Simulation context
 * @param {string} [school] - Spell school (fire, frost, nature)
 * @returns {number} Spell damage multiplier (1.0 = no bonus)
 */
export function getTalentBuffSpellDamageMultiplier(ctx, school = null) {
    let multiplier = 1.0;
    
    // Elemental Mastery: +15% Fire/Frost/Nature damage
    if (isTalentBuffActive(ctx, 'elementalMastery')) {
        const def = getTalentBuffDefinition('elementalMastery');
        const affectedSchools = def?.effect?.schools || ['fire', 'frost', 'nature'];
        
        if (!school || affectedSchools.includes(school.toLowerCase())) {
            multiplier *= (1 + (def?.effect?.value || 0.15));
        }
    }
    
    return multiplier;
}

export default BuffSystem;
