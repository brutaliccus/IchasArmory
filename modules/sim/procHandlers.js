/**
 * Proc Handlers Module
 * 
 * @module sim/procHandlers
 * @description Handles proc triggering logic extracted from ShamanCombatSimulator.
 * 
 * ## Overview
 * This module contains proc trigger handlers:
 * - triggerCrusader - +100 Strength proc
 * - triggerFlurry - Attack speed buff
 * - triggerWrathOfCenarius - +8 spell power stacking buff
 * - triggerElementalDevastation - Spell crit proc from melee
 * - triggerStonebreaker - AP proc from shocks
 * - triggerElementalFocus - Clearcasting proc
 * - And more...
 * 
 * ## Proc Pattern
 * Most procs follow this pattern:
 * 1. Check if proc source is equipped/available
 * 2. Roll for proc chance (PPM or flat %)
 * 3. Check if already active (for refresh logic)
 * 4. Apply buff effect (stats, duration)
 * 5. Schedule expiration event
 * 6. Track uptime (if not quickSim)
 * 7. Log the proc
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

/**
 * @typedef {Object} ProcContext
 * @property {Object} stats - Character stats
 * @property {Object} rng - RNG with random() method
 * @property {number} currentTime - Current simulation time
 * @property {number} fightDuration - Total fight duration
 * @property {Object} buffUptime - Buff tracking data
 * @property {Object} activeProcs - Active proc states
 * @property {Array} procsFromProcsJs - Procs from procs.js
 * @property {Function} log - Logging function
 * @property {Function} shouldTrackUptime - Check if tracking enabled
 * @property {Function} scheduleEvent - Event scheduler
 * @property {Function} unscheduleEvent - Event unscheduler
 * @property {Function} recalculateWeaponDamage - Recalc weapon damage after AP change
 */

/**
 * Generic proc activation helper
 * Handles the common pattern of activating or refreshing a buff
 * 
 * @param {ProcContext} ctx - Proc context
 * @param {Object} options - Activation options
 * @param {string} options.buffName - Name of the buff in buffUptime
 * @param {number} options.duration - Buff duration in seconds
 * @param {string} options.triggerSource - What triggered this proc
 * @param {string} options.triggerIcon - Icon for the trigger
 * @param {boolean} options.isActive - Whether buff is currently active
 * @param {Function} [options.onActivate] - Called on new activation
 * @param {Function} [options.onRefresh] - Called on refresh
 * @param {Object} [options.extraData] - Extra data to store in activation
 * @returns {{isNew: boolean, activation: Object}} Activation result
 */
export function activateOrRefreshBuff(ctx, options) {
    const {
        buffName,
        duration,
        triggerSource,
        triggerIcon,
        isActive,
        onActivate,
        onRefresh,
        extraData = {}
    } = options;
    
    const buff = ctx.buffUptime[buffName];
    if (!buff) {
        console.warn(`[ProcHandlers] Unknown buff: ${buffName}`);
        return { isNew: false, activation: null };
    }
    
    if (isActive) {
        // Refresh existing buff
        if (ctx.shouldTrackUptime()) {
            const lastActivation = buff.activationTimes[buff.activationTimes.length - 1];
            if (lastActivation) {
                lastActivation.end = ctx.currentTime + duration;
                lastActivation.duration = lastActivation.end - lastActivation.start;
                if (!lastActivation.refreshes) {
                    lastActivation.refreshes = [];
                }
                lastActivation.refreshes.push({
                    time: ctx.currentTime,
                    source: triggerSource,
                    icon: triggerIcon
                });
            }
            buff.refreshes++;
        }
        
        if (onRefresh) onRefresh();
        return { isNew: false, activation: buff.activationTimes[buff.activationTimes.length - 1] };
    } else {
        // New activation
        const activation = {
            start: ctx.currentTime,
            end: ctx.currentTime + duration,
            duration: duration,
            triggerSource,
            triggerIcon,
            refreshes: [],
            ...extraData
        };
        
        if (ctx.shouldTrackUptime()) {
            buff.activationTimes.push(activation);
            buff.procs++;
        }
        
        if (onActivate) onActivate();
        return { isNew: true, activation };
    }
}

/**
 * Schedule a buff expiration event
 * 
 * @param {ProcContext} ctx - Proc context
 * @param {string} eventId - Unique event ID for scheduling
 * @param {number} expiresAt - When the buff expires
 * @param {Function} onExpire - Called when buff expires
 */
export function scheduleBuffExpiration(ctx, eventId, expiresAt, onExpire) {
    if (expiresAt <= ctx.fightDuration) {
        ctx.unscheduleEvent(eventId);
        ctx.scheduleEvent(expiresAt, 'buffExpire', onExpire, eventId);
    }
}

/**
 * Roll for a proc based on PPM (procs per minute)
 * 
 * @param {number} ppm - Procs per minute
 * @param {number} weaponSpeed - Weapon speed in seconds
 * @param {Function} rng - Random function returning 0-1
 * @returns {boolean} Whether the proc triggered
 */
export function rollPpmProc(ppm, weaponSpeed, rng) {
    const procChance = (ppm * weaponSpeed / 60);
    return rng() < procChance;
}

/**
 * Roll for a proc based on flat percentage
 * 
 * @param {number} percent - Proc chance as percentage (0-100)
 * @param {Function} rng - Random function returning 0-1
 * @returns {boolean} Whether the proc triggered
 */
export function rollFlatProc(percent, rng) {
    return rng() * 100 < percent;
}

/**
 * Calculate Crusader AP bonus with stat multipliers
 * 
 * @param {Object} stats - Character stats
 * @returns {number} Effective AP bonus
 */
export function calculateCrusaderApBonus(stats) {
    let statMultiplier = 1.0;
    
    // Ancestral Knowledge talent (stat_percent_all)
    if (stats.talentBonuses && typeof stats.talentBonuses === 'object') {
        statMultiplier *= (1 + (stats.talentBonuses.stat_percent_all || 0));
    }
    
    // Blessing of Kings (+10% stats)
    const activeBuffs = stats.activeBuffs || [];
    const hasKings = activeBuffs.some(b => 
        (b && typeof b === 'object' && (b.id === 'blessing_of_kings' || b.id === 'bok' || b.name?.includes('Kings')))
    );
    if (hasKings) {
        statMultiplier *= 1.1;
    }
    
    // 100 Strength * stat multiplier * 2 AP per Str
    const effectiveStr = 100 * statMultiplier;
    return Math.floor(effectiveStr * 2);
}

/**
 * Get Flurry haste value based on talent rank
 * 
 * @param {number} rank - Flurry talent rank (0-5)
 * @returns {number} Haste percentage
 */
export function getFlurryHaste(rank) {
    const hasteValues = [0, 8, 11, 14, 17, 20];
    return hasteValues[rank] || 0;
}

/**
 * Get Elemental Devastation crit bonus based on talent rank
 * 
 * @param {number} rank - Elemental Devastation talent rank (0-3)
 * @returns {number} Crit chance percentage
 */
export function getElementalDevastationCrit(rank) {
    const critValues = [0, 3, 6, 9];
    return critValues[rank] || 0;
}

/**
 * Wrath of Cenarius stack values
 * @constant
 */
export const WRATH_OF_CENARIUS = {
    SPELL_POWER_PER_STACK: 8,
    MAX_STACKS: 10,
    DURATION: 10
};

/**
 * Crusader enchant values
 * @constant
 */
export const CRUSADER = {
    STRENGTH_BONUS: 100,
    DURATION: 15
};

/**
 * Elemental Focus (Clearcasting) values
 * @constant
 */
export const ELEMENTAL_FOCUS = {
    CHARGES: 2,
    MANA_REDUCTION: 0.60  // 60% reduced mana cost
};

/**
 * Proc handler factory - creates a standardized proc trigger function
 * This allows easy creation of new proc handlers following the same pattern
 * 
 * @param {Object} config - Proc configuration
 * @param {string} config.id - Proc ID (matches procs.js)
 * @param {string} config.buffName - Buff name in buffUptime
 * @param {number} config.duration - Buff duration
 * @param {Function} config.getProcChance - Function to get proc chance
 * @param {Function} config.onActivate - Called on new activation
 * @param {Function} config.onRefresh - Called on refresh
 * @param {Function} config.onExpire - Called on expiration
 * @param {string} config.logMessageNew - Log message for new proc
 * @param {string} config.logMessageRefresh - Log message for refresh
 * @returns {Function} Proc trigger function
 */
export function createProcHandler(config) {
    return function(ctx, triggerSource = 'Unknown', triggerIcon = null) {
        // Check if proc is available
        if (config.isAvailable && !config.isAvailable(ctx)) {
            return false;
        }
        
        // Roll for proc
        const procChance = config.getProcChance(ctx);
        if (ctx.rng.random() >= procChance) {
            return false;
        }
        
        // Check current state
        const isActive = config.isActive ? config.isActive(ctx) : false;
        
        // Activate or refresh
        const result = activateOrRefreshBuff(ctx, {
            buffName: config.buffName,
            duration: config.duration,
            triggerSource,
            triggerIcon,
            isActive,
            onActivate: config.onActivate ? () => config.onActivate(ctx) : undefined,
            onRefresh: config.onRefresh ? () => config.onRefresh(ctx) : undefined,
            extraData: config.extraData ? config.extraData(ctx) : {}
        });
        
        // Schedule expiration
        if (config.onExpire) {
            const expiresAt = ctx.currentTime + config.duration;
            scheduleBuffExpiration(ctx, `${config.id}Expire`, expiresAt, () => {
                config.onExpire(ctx);
            });
        }
        
        // Log
        const logMsg = result.isNew ? config.logMessageNew : config.logMessageRefresh;
        if (logMsg) {
            ctx.log(logMsg.replace('{source}', triggerSource));
        }
        
        return true;
    };
}

// Export constants and helpers
export default {
    activateOrRefreshBuff,
    scheduleBuffExpiration,
    rollPpmProc,
    rollFlatProc,
    calculateCrusaderApBonus,
    getFlurryHaste,
    getElementalDevastationCrit,
    createProcHandler,
    WRATH_OF_CENARIUS,
    CRUSADER,
    ELEMENTAL_FOCUS
};
