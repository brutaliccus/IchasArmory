/**
 * Proc System Module
 * 
 * @module sim/procSystem
 * @description Handles proc detection, triggering, and effect application.
 * 
 * ## Overview
 * This module manages:
 * - Proc chance calculations and rolls
 * - Proc trigger conditions (on hit, on crit, on spell cast, etc.)
 * - Proc effect application
 * - Internal cooldown (ICD) tracking
 * - Proc-per-minute (PPM) normalization
 * 
 * ## Proc Types
 * - `onMeleeHit` - Triggers on any melee hit (auto attack, abilities)
 * - `onMeleeCrit` - Triggers on melee critical strikes
 * - `onSpellHit` - Triggers on spell damage
 * - `onSpellCrit` - Triggers on spell critical strikes
 * - `onSpellCast` - Triggers when casting spells
 * - `onDamageTaken` - Triggers when taking damage
 * - `onUse` - Active use (trinkets, etc.)
 * 
 * ## Proc Configuration
 * Procs are defined in modules/procs.js and include:
 * ```javascript
 * {
 *   id: 'proc_name',
 *   itemId: 12345,           // Item that provides the proc
 *   procChance: 5,           // Percent chance to proc
 *   procType: 'onMeleeHit',  // When it can proc
 *   icd: 0,                  // Internal cooldown in seconds
 *   ppm: null,               // Procs per minute (overrides procChance)
 *   effect: { ... }         // What happens when it procs
 * }
 * ```
 * 
 * ## PPM (Procs Per Minute) Normalization
 * For PPM procs: procChance = (PPM * weaponSpeed) / 60
 * This ensures consistent proc rates regardless of weapon speed.
 * 
 * @version 1.0.0
 * @since 2026-01-25
 */

/**
 * Proc trigger types
 * @enum {string}
 */
export const ProcTrigger = {
    ON_MELEE_HIT: 'onMeleeHit',
    ON_MELEE_CRIT: 'onMeleeCrit',
    ON_SPELL_HIT: 'onSpellHit',
    ON_SPELL_CRIT: 'onSpellCrit',
    ON_SPELL_CAST: 'onSpellCast',
    ON_DAMAGE_TAKEN: 'onDamageTaken',
    ON_USE: 'onUse'
};

/**
 * Calculate proc chance for PPM (procs per minute) based items
 * 
 * @param {number} ppm - Procs per minute value
 * @param {number} weaponSpeed - Weapon speed in seconds
 * @returns {number} Proc chance as a percentage (0-100)
 */
export function calculatePpmProcChance(ppm, weaponSpeed) {
    return (ppm * weaponSpeed / 60) * 100;
}

/**
 * Check if a proc should trigger based on chance
 * 
 * @param {number} procChance - Proc chance as a percentage (0-100)
 * @param {Function} rng - Random number generator (returns 0-1)
 * @returns {boolean} True if proc triggers
 */
export function rollProcChance(procChance, rng) {
    return rng() * 100 < procChance;
}

/**
 * ProcSystem class - manages proc detection and triggering
 */
export class ProcSystem {
    /**
     * Create a new ProcSystem instance
     * 
     * @param {Object} config - Configuration object
     * @param {Function} config.rng - Random number generator
     * @param {Function} config.getCurrentTime - Function to get current simulation time
     * @param {Object} config.procDefinitions - Proc definitions from procs.js
     */
    constructor(config = {}) {
        this.rng = config.rng || Math.random;
        this.getCurrentTime = config.getCurrentTime || (() => 0);
        this.procDefinitions = config.procDefinitions || {};
        
        // Track active procs
        this.activeProcs = new Map();
        
        // Track internal cooldowns
        this.icdTracking = new Map();
        
        // Track proc statistics
        this.procStats = new Map();
    }
    
    /**
     * Register a proc for tracking
     * 
     * @param {string} procId - Unique identifier for the proc
     * @param {Object} procConfig - Proc configuration
     */
    registerProc(procId, procConfig) {
        this.activeProcs.set(procId, procConfig);
        this.procStats.set(procId, {
            attempts: 0,
            procs: 0,
            totalDamage: 0
        });
    }
    
    /**
     * Unregister a proc
     * 
     * @param {string} procId - Proc identifier to remove
     */
    unregisterProc(procId) {
        this.activeProcs.delete(procId);
        this.icdTracking.delete(procId);
    }
    
    /**
     * Check if proc is on internal cooldown
     * 
     * @param {string} procId - Proc identifier
     * @returns {boolean} True if on cooldown
     */
    isOnCooldown(procId) {
        const icdEnd = this.icdTracking.get(procId);
        if (!icdEnd) return false;
        return this.getCurrentTime() < icdEnd;
    }
    
    /**
     * Set internal cooldown for a proc
     * 
     * @param {string} procId - Proc identifier
     * @param {number} duration - Cooldown duration in seconds
     */
    setInternalCooldown(procId, duration) {
        if (duration > 0) {
            this.icdTracking.set(procId, this.getCurrentTime() + duration);
        }
    }
    
    /**
     * Attempt to trigger a proc
     * 
     * @param {string} procId - Proc identifier
     * @param {Object} context - Trigger context
     * @param {string} context.triggerType - Type of trigger (from ProcTrigger enum)
     * @param {number} [context.weaponSpeed] - Weapon speed for PPM calculation
     * @returns {boolean} True if proc triggered
     */
    attemptProc(procId, context = {}) {
        const procConfig = this.activeProcs.get(procId);
        if (!procConfig) return false;
        
        const stats = this.procStats.get(procId);
        if (stats) stats.attempts++;
        
        // Check ICD
        if (this.isOnCooldown(procId)) {
            return false;
        }
        
        // Calculate proc chance
        let procChance = procConfig.procChance || 0;
        
        // PPM normalization
        if (procConfig.ppm && context.weaponSpeed) {
            procChance = calculatePpmProcChance(procConfig.ppm, context.weaponSpeed);
        }
        
        // Roll for proc
        if (!rollProcChance(procChance, this.rng)) {
            return false;
        }
        
        // Proc triggered!
        if (stats) stats.procs++;
        
        // Set ICD if applicable
        if (procConfig.icd) {
            this.setInternalCooldown(procId, procConfig.icd);
        }
        
        return true;
    }
    
    /**
     * Get all procs that can trigger on a specific event
     * 
     * @param {string} triggerType - Type of trigger event
     * @returns {Array<{id: string, config: Object}>} Array of matching procs
     */
    getProcsForTrigger(triggerType) {
        const matches = [];
        for (const [procId, procConfig] of this.activeProcs) {
            if (procConfig.procType === triggerType) {
                matches.push({ id: procId, config: procConfig });
            }
        }
        return matches;
    }
    
    /**
     * Process all procs for a trigger event
     * 
     * @param {string} triggerType - Type of trigger event
     * @param {Object} context - Trigger context
     * @returns {Array<string>} Array of proc IDs that triggered
     */
    processTriggersForEvent(triggerType, context = {}) {
        const triggered = [];
        const procs = this.getProcsForTrigger(triggerType);
        
        for (const { id, config } of procs) {
            if (this.attemptProc(id, { ...context, triggerType })) {
                triggered.push(id);
            }
        }
        
        return triggered;
    }
    
    /**
     * Record damage from a proc
     * 
     * @param {string} procId - Proc identifier
     * @param {number} damage - Damage dealt
     */
    recordProcDamage(procId, damage) {
        const stats = this.procStats.get(procId);
        if (stats) {
            stats.totalDamage += damage;
        }
    }
    
    /**
     * Get statistics for all procs
     * 
     * @returns {Object} Proc statistics by ID
     */
    getStats() {
        const result = {};
        for (const [procId, stats] of this.procStats) {
            result[procId] = { ...stats };
        }
        return result;
    }
    
    /**
     * Reset the proc system
     */
    reset() {
        this.icdTracking.clear();
        for (const stats of this.procStats.values()) {
            stats.attempts = 0;
            stats.procs = 0;
            stats.totalDamage = 0;
        }
    }
}

/**
 * Helper to detect equipped procs from gear
 * 
 * @param {Object} gear - Equipped gear object
 * @param {Object} procDefinitions - Proc definitions from procs.js
 * @returns {Array<Object>} Array of active proc configurations
 */
export function detectEquippedProcs(gear, procDefinitions) {
    const activeProcs = [];
    
    for (const [procId, procDef] of Object.entries(procDefinitions)) {
        if (!procDef.itemId) continue;
        
        // Check if item is equipped
        const isEquipped = Object.values(gear).some(item => {
            return item && Number(item.id) === Number(procDef.itemId);
        });
        
        if (isEquipped) {
            activeProcs.push({
                id: procId,
                ...procDef
            });
        }
    }
    
    return activeProcs;
}

export default ProcSystem;
