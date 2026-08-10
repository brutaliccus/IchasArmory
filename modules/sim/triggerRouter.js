/**
 * Trigger Router - Routes Combat Events to Proc Checks
 * 
 * @module sim/triggerRouter
 * @description Routes combat events (onMeleeHit, onSpellCrit, etc.) to appropriate proc checks.
 * 
 * ## Overview
 * Instead of manually calling individual trigger* methods:
 * ```javascript
 * this.triggerCrusader('Auto Attack', icon);
 * this.triggerDragonbreathChili('Auto Attack', icon);
 * this.triggerBadgeOfTheSwarmguard('Auto Attack', icon);
 * ```
 * 
 * Use a single call:
 * ```javascript
 * this.fireTrigger('onMeleeHit', 'Auto Attack', icon);
 * ```
 * 
 * The router automatically:
 * 1. Finds all procs that listen to the trigger type
 * 2. Checks if each proc is available (equipped/talented)
 * 3. Processes each proc via procEngine
 * 
 * ## Trigger Types
 * - onMeleeHit - Auto attack, Stormstrike, Lightning Strike (physical), Windfury
 * - onMeleeCrit - Melee critical strikes
 * - onSpellHit - Shocks, Flametongue, spell strikes
 * - onSpellCrit - Spell critical strikes
 * - onShockHit - Shock spells specifically
 * - onSpellResist - Spell partially or fully resisted
 * - onBeingHit - When player takes damage
 * - onUse - Manual activation (trinkets)
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { procDefinitions, getProcById } from '../gear/procs.js';
import { processProcTrigger, isProcAvailable, getProcState } from './procEngine.js';

// ============================================
// TRIGGER TYPE DEFINITIONS
// ============================================

/**
 * All valid trigger types
 * @constant {string[]}
 */
export const TRIGGER_TYPES = [
    'onMeleeHit',      // Auto attack, Stormstrike, Lightning Strike (physical), Windfury
    'onMeleeCrit',     // Melee critical strikes
    'onSpellHit',      // Shocks, Flametongue, spell strikes
    'onSpellCrit',     // Spell critical strikes
    'onShockHit',      // Shock spells specifically
    'onDirectDamageSpellHit', // Lightning Bolt and shocks only (direct damage spells)
    'onSpellResist',   // Spell partially or fully resisted (non-binary resist roll)
    'onBeingHit',      // When player takes damage
    'onUse',           // Manual activation
    'onAutoAttack',    // Auto attack only
    'onStormstrikeHit', // Stormstrike hit
    'onLightningStrike', // Lightning Strike hit
    'chanceOnHit',     // Legacy alias for onMeleeHit
    'external'         // Applied by external source
];

/**
 * Map legacy procType values to normalized trigger types
 * @constant {Object}
 */
const PROCTYPE_NORMALIZATION = {
    'chanceOnHit': 'onMeleeHit',
    'onAbilityUse': 'onUse'
};

/**
 * Normalize a procType to a standard trigger type
 * @param {string} procType - Raw procType from proc definition
 * @returns {string} Normalized trigger type
 */
export function normalizeProcType(procType) {
    return PROCTYPE_NORMALIZATION[procType] || procType;
}

// ============================================
// TRIGGER MAP BUILDING
// ============================================

/**
 * Build a map of trigger types to proc IDs
 * This is built once and cached for performance
 * 
 * @returns {Map<string, string[]>} Map of trigger type to proc IDs
 */
export function buildTriggerMap() {
    const map = new Map();
    
    // Initialize all trigger types
    for (const type of TRIGGER_TYPES) {
        map.set(type, []);
    }
    
    // Add procs to their trigger types
    for (const proc of procDefinitions) {
        const types = Array.isArray(proc.procTypes) && proc.procTypes.length > 0
            ? proc.procTypes
            : (proc.procType ? [proc.procType] : []);

        for (const rawType of types) {
            const normalizedType = normalizeProcType(rawType);
            if (map.has(normalizedType)) {
                map.get(normalizedType).push(proc.id);
            }
        }
    }
    
    return map;
}

// Cached trigger map (built on first use)
let _cachedTriggerMap = null;

/**
 * Get the trigger map, building if necessary
 * @returns {Map<string, string[]>} Trigger map
 */
export function getTriggerMap() {
    if (!_cachedTriggerMap) {
        _cachedTriggerMap = buildTriggerMap();
    }
    return _cachedTriggerMap;
}

/**
 * Invalidate the cached trigger map (call if proc definitions change)
 */
export function invalidateTriggerMapCache() {
    _cachedTriggerMap = null;
}

/**
 * Get all proc IDs that respond to a trigger type
 * @param {string} triggerType - Trigger type
 * @returns {string[]} Array of proc IDs
 */
export function getProcsForTrigger(triggerType) {
    const map = getTriggerMap();
    return map.get(triggerType) || [];
}

// ============================================
// TRIGGER FIRING
// ============================================

/**
 * Fire a trigger event, processing all applicable procs
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} triggerType - Type of trigger (onMeleeHit, onSpellCrit, etc.)
 * @param {string} source - What caused this trigger (ability name)
 * @param {string} icon - Icon for the triggering ability
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.didHit=true] - Whether the triggering action hit
 * @param {boolean} [options.isCrit=false] - Whether it was a critical hit
 * @param {string} [options.school] - Damage school (fire, nature, shadow, etc.)
 * @returns {Object} Results of proc processing
 */
export function fireTrigger(ctx, triggerType, source, icon, options = {}) {
    const { didHit = true, isCrit = false, school = null } = options;
    
    // Skip if the triggering action didn't hit (for hit-based triggers)
    if (!didHit && triggerType.includes('Hit')) {
        return { triggered: [], skipped: [] };
    }
    
    const procIds = getProcsForTrigger(triggerType);
    const results = {
        triggered: [],
        skipped: [],
        failed: []
    };
    
    for (const procId of procIds) {
        const proc = getProcById(procId);
        if (!proc) {
            results.failed.push({ procId, reason: 'not_found' });
            continue;
        }
        
        // Skip imbue procs - they are handled by the dedicated imbue system
        // (processFlametongue, processWindfury in imbueSystem.js)
        if (proc.imbue) {
            results.skipped.push({ procId, reason: 'imbue_handled_separately' });
            continue;
        }
        
        // Check if proc is available (equipped/talented/buffed)
        if (!isProcAvailable(ctx, proc)) {
            results.skipped.push({ procId, reason: 'not_available' });
            continue;
        }
        
        // For spell crit procs, check if crit actually happened
        if (triggerType === 'onSpellCrit' && !isCrit) {
            results.skipped.push({ procId, reason: 'not_crit' });
            continue;
        }
        
        // For melee crit procs, check if crit actually happened
        if (triggerType === 'onMeleeCrit' && !isCrit) {
            results.skipped.push({ procId, reason: 'not_crit' });
            continue;
        }
        
        // Process the proc (pass trigger type for per-trigger proc chance / filters)
        const triggered = processProcTrigger(ctx, procId, source, icon, { triggerType });
        
        if (triggered) {
            results.triggered.push(procId);
        } else {
            results.skipped.push({ procId, reason: 'proc_check_failed' });
        }
    }
    
    return results;
}

/**
 * Fire multiple trigger types at once
 * Useful for actions that trigger multiple proc types (e.g., melee crit triggers both onMeleeHit and onMeleeCrit)
 * 
 * @param {Object} ctx - Simulation context
 * @param {string[]} triggerTypes - Array of trigger types
 * @param {string} source - What caused this trigger
 * @param {string} icon - Icon
 * @param {Object} [options] - Additional options
 * @returns {Object} Combined results
 */
export function fireMultipleTriggers(ctx, triggerTypes, source, icon, options = {}) {
    const combined = {
        triggered: [],
        skipped: [],
        failed: []
    };
    
    // Track which procs we've already processed to avoid duplicates
    const processedProcs = new Set();
    
    for (const triggerType of triggerTypes) {
        const results = fireTrigger(ctx, triggerType, source, icon, options);
        
        // Add triggered procs (avoid duplicates)
        for (const procId of results.triggered) {
            if (!processedProcs.has(procId)) {
                combined.triggered.push(procId);
                processedProcs.add(procId);
            }
        }
        
        // Add skipped/failed (these might have duplicates, but that's informational)
        combined.skipped.push(...results.skipped);
        combined.failed.push(...results.failed);
    }
    
    return combined;
}

// ============================================
// HELPER FUNCTIONS FOR COMMON SCENARIOS
// ============================================

/**
 * Fire triggers for a melee attack
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - Ability name
 * @param {string} icon - Icon
 * @param {Object} outcome - Attack outcome
 * @param {boolean} outcome.didHit - Whether attack hit
 * @param {boolean} outcome.isCrit - Whether attack crit
 * @returns {Object} Combined results
 */
export function fireMeleeAttackTriggers(ctx, source, icon, outcome) {
    const triggerTypes = [];
    
    if (outcome.didHit) {
        triggerTypes.push('onMeleeHit');
        
        if (outcome.isCrit) {
            triggerTypes.push('onMeleeCrit');
        }
        
        // Check for Stormstrike-specific triggers
        const isStormstrike = source.toLowerCase().includes('stormstrike');
        if (isStormstrike) {
            triggerTypes.push('onStormstrikeHit');
        }
        
        // Check for Lightning Strike-specific triggers
        const isLightningStrike = source.toLowerCase().includes('lightning strike');
        if (isLightningStrike) {
            triggerTypes.push('onLightningStrike');
        }
    }
    
    return fireMultipleTriggers(ctx, triggerTypes, source, icon, outcome);
}

/**
 * Fire triggers for a spell hit
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - Spell name
 * @param {string} icon - Icon
 * @param {Object} outcome - Spell outcome
 * @param {boolean} outcome.didHit - Whether spell hit
 * @param {boolean} outcome.isCrit - Whether spell crit
 * @param {string} outcome.school - Damage school
 * @param {Object} [options] - Optional
 * @param {boolean} [options.alsoFireDirectDamageSpell] - If true, also fire onDirectDamageSpellHit (LB, CL bounces, shocks, EQ hits, Molten Blast, LS/ELS, etc.)
 * @returns {Object} Combined results
 */
export function fireSpellHitTriggers(ctx, source, icon, outcome, options = {}) {
    const triggerTypes = [];

    if (outcome.didHit) {
        triggerTypes.push('onSpellHit');

        if (outcome.isCrit) {
            triggerTypes.push('onSpellCrit');
        }

        // Check for shock-specific triggers
        const isShock = source.toLowerCase().includes('shock');
        if (isShock) {
            triggerTypes.push('onShockHit');
        }

        // Harmful direct spell hits (LB, CL, shocks, EQ, Molten Blast, LS/ELS, …) — Sigil, Spellpower Goggles, etc.
        if (options.alsoFireDirectDamageSpell) {
            triggerTypes.push('onDirectDamageSpellHit');
        }
    }

    return fireMultipleTriggers(ctx, triggerTypes, source, icon, outcome);
}

/**
 * Fire triggers when a spell is partially or fully resisted.
 * Called after damage resolution when resistType !== 'none'.
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - Spell name
 * @param {string} icon - Icon
 * @param {Object} outcome - Spell outcome (resistType, school, etc.)
 * @returns {Object} Results
 */
export function fireSpellResistTriggers(ctx, source, icon, outcome) {
    return fireTrigger(ctx, 'onSpellResist', source, icon, {
        didHit: true,
        school: outcome.school || null
    });
}

/**
 * Fire triggers for being hit by an enemy
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - What hit the player
 * @param {string} icon - Icon
 * @returns {Object} Results
 */
export function fireBeingHitTriggers(ctx, source, icon) {
    return fireTrigger(ctx, 'onBeingHit', source, icon, { didHit: true });
}

// ============================================
// CONTEXT INTEGRATION
// ============================================

/**
 * Create a bound fireTrigger function for a simulation context
 * This allows using `sim.fireTrigger(type, source, icon)` syntax
 * 
 * @param {Object} ctx - Simulation context
 * @returns {Function} Bound fireTrigger function
 */
export function createBoundFireTrigger(ctx) {
    return (triggerType, source, icon, options) => 
        fireTrigger(ctx, triggerType, source, icon, options);
}

/**
 * Install trigger router methods on a simulator instance
 * 
 * @param {Object} sim - Simulator instance
 */
export function installTriggerRouter(sim) {
    // Main fire trigger method
    sim.fireTrigger = (triggerType, source, icon, options) => 
        fireTrigger(sim, triggerType, source, icon, options);
    
    // Convenience methods
    sim.fireMeleeAttackTriggers = (source, icon, outcome) =>
        fireMeleeAttackTriggers(sim, source, icon, outcome);
    
    sim.fireSpellHitTriggers = (source, icon, outcome) =>
        fireSpellHitTriggers(sim, source, icon, outcome);
    
    sim.fireSpellResistTriggers = (source, icon, outcome) =>
        fireSpellResistTriggers(sim, source, icon, outcome);
    
    sim.fireBeingHitTriggers = (source, icon) =>
        fireBeingHitTriggers(sim, source, icon);
}

// ============================================
// EXPORTS
// ============================================

export default {
    TRIGGER_TYPES,
    normalizeProcType,
    buildTriggerMap,
    getTriggerMap,
    invalidateTriggerMapCache,
    getProcsForTrigger,
    fireTrigger,
    fireMultipleTriggers,
    fireMeleeAttackTriggers,
    fireSpellHitTriggers,
    fireSpellResistTriggers,
    fireBeingHitTriggers,
    createBoundFireTrigger,
    installTriggerRouter
};
