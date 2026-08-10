/**
 * Ability System Module
 * 
 * @module sim/abilitySystem
 * @description Handles spell casting, cooldowns, GCD management, and ability prioritization.
 * 
 * ## Overview
 * This module manages:
 * - Spell cast queue and prioritization
 * - Global Cooldown (GCD) tracking
 * - Spell cooldown management
 * - Cast time and channeling
 * - Mana cost calculations
 * - Spell queueing logic
 * 
 * ## GCD Rules
 * - Base GCD: 1.5 seconds
 * - Minimum GCD: 1.0 second (cannot go below with haste)
 * - Instant spells trigger GCD
 * - Some abilities are off-GCD (e.g., trinkets)
 * 
 * ## Cast Time Mechanics
 * - Haste reduces cast time: castTime = baseCast / (1 + hastePercent)
 * - Spellpower does not affect cast time
 * - Lightning Mastery reduces Lightning Bolt/Chain Lightning cast time
 * 
 * ## Cooldown Types
 * - Spell cooldowns (individual ability cooldowns)
 * - Shared cooldowns (e.g., Fire/Frost Shock share CD)
 * - Internal cooldowns (for proc-based abilities)
 * 
 * ## Priority System
 * The rotation priority determines which ability to use next:
 * 1. Check mana availability
 * 2. Check cooldown availability
 * 3. Check GCD availability
 * 4. Apply priority rules (e.g., maintain Stormstrike debuff)
 * 
 * @version 1.0.0
 * @since 2026-01-25
 */

/**
 * Ability state types
 * @enum {string}
 */
export const AbilityState = {
    READY: 'ready',
    ON_COOLDOWN: 'on_cooldown',
    ON_GCD: 'on_gcd',
    NO_MANA: 'no_mana',
    CASTING: 'casting',
    CHANNELING: 'channeling'
};

/**
 * GCD configuration constants
 * @constant
 */
export const GCD_CONFIG = {
    BASE_GCD: 1.5,      // Base GCD in seconds
    MIN_GCD: 1.0,       // Minimum GCD (with haste)
    MELEE_GCD: 1.5      // Melee GCD (not affected by spell haste)
};

/**
 * Calculate effective GCD with haste
 * 
 * @param {number} hastePercent - Haste percentage (0.10 = 10%)
 * @param {boolean} isMelee - Whether this is a melee ability
 * @returns {number} Effective GCD in seconds
 */
export function calculateGcd(hastePercent = 0, isMelee = false) {
    if (isMelee) {
        return GCD_CONFIG.MELEE_GCD;
    }
    
    const gcd = GCD_CONFIG.BASE_GCD / (1 + hastePercent);
    return Math.max(GCD_CONFIG.MIN_GCD, gcd);
}

/**
 * Calculate effective cast time with haste and talents
 * 
 * @param {number} baseCastTime - Base cast time in seconds
 * @param {number} hastePercent - Haste percentage
 * @param {number} castTimeReduction - Flat reduction from talents (e.g., Lightning Mastery)
 * @returns {number} Effective cast time in seconds
 */
export function calculateCastTime(baseCastTime, hastePercent = 0, castTimeReduction = 0) {
    // Apply talent reduction first
    let castTime = baseCastTime - castTimeReduction;
    castTime = Math.max(0, castTime);
    
    // Apply haste
    if (hastePercent > 0) {
        castTime = castTime / (1 + hastePercent);
    }
    
    return castTime;
}

/**
 * AbilitySystem class - manages spell casting and cooldowns
 */
export class AbilitySystem {
    /**
     * Create a new AbilitySystem instance
     * 
     * @param {Object} config - Configuration object
     * @param {Function} config.getCurrentTime - Function to get current simulation time
     * @param {Object} config.spells - Spell definitions
     * @param {Object} config.stats - Character stats (for mana, haste, etc.)
     */
    constructor(config = {}) {
        this.getCurrentTime = config.getCurrentTime || (() => 0);
        this.spells = config.spells || {};
        this.stats = config.stats || {};
        
        // Cooldown tracking
        this.cooldowns = new Map();
        
        // GCD tracking
        this.gcdEndTime = 0;
        
        // Cast state
        this.isCasting = false;
        this.castEndTime = 0;
        this.currentCast = null;
        
        // Mana tracking
        this.currentMana = 0;
        this.maxMana = 0;
    }
    
    /**
     * Initialize mana pool
     * 
     * @param {number} maxMana - Maximum mana
     */
    initializeMana(maxMana) {
        this.maxMana = maxMana;
        this.currentMana = maxMana;
    }
    
    /**
     * Check if an ability is ready to use
     * 
     * @param {string} spellName - Name of the spell
     * @returns {{ready: boolean, reason: string}} Ready status and reason if not ready
     */
    isAbilityReady(spellName) {
        const currentTime = this.getCurrentTime();
        const spell = this.spells[spellName];
        
        if (!spell) {
            return { ready: false, reason: 'unknown_spell' };
        }
        
        // Check if currently casting
        if (this.isCasting && currentTime < this.castEndTime) {
            return { ready: false, reason: AbilityState.CASTING };
        }
        
        // Check GCD (for spells that trigger GCD)
        if (spell.triggersGcd !== false && currentTime < this.gcdEndTime) {
            return { ready: false, reason: AbilityState.ON_GCD };
        }
        
        // Check cooldown
        const cdEndTime = this.cooldowns.get(spellName);
        if (cdEndTime && currentTime < cdEndTime) {
            return { ready: false, reason: AbilityState.ON_COOLDOWN };
        }
        
        // Check mana
        const manaCost = this.getManaCost(spell);
        if (this.currentMana < manaCost) {
            return { ready: false, reason: AbilityState.NO_MANA };
        }
        
        return { ready: true, reason: AbilityState.READY };
    }
    
    /**
     * Get the mana cost of a spell (including modifiers)
     * 
     * @param {Object} spell - Spell definition
     * @returns {number} Mana cost
     */
    getManaCost(spell) {
        let cost = spell.manaCost || 0;
        
        // Apply cost modifiers (e.g., Elemental Focus)
        // This would be extended to check for active cost reduction buffs
        
        return Math.max(0, Math.floor(cost));
    }
    
    /**
     * Start casting a spell
     * 
     * @param {string} spellName - Name of the spell
     * @returns {boolean} True if cast started successfully
     */
    startCast(spellName) {
        const { ready, reason } = this.isAbilityReady(spellName);
        if (!ready) return false;
        
        const spell = this.spells[spellName];
        const currentTime = this.getCurrentTime();
        
        // Deduct mana
        const manaCost = this.getManaCost(spell);
        this.currentMana -= manaCost;
        
        // Calculate cast time
        const hastePercent = this.stats.spellHaste || 0;
        const castTimeReduction = this.getCastTimeReduction(spell);
        const castTime = calculateCastTime(spell.castTime || 0, hastePercent, castTimeReduction);
        
        if (castTime > 0) {
            // Start casting
            this.isCasting = true;
            this.castEndTime = currentTime + castTime;
            this.currentCast = { spell, startTime: currentTime, endTime: this.castEndTime };
        }
        
        // Trigger GCD if applicable
        if (spell.triggersGcd !== false) {
            const gcd = calculateGcd(hastePercent, spell.isMelee);
            this.gcdEndTime = currentTime + gcd;
        }
        
        // Set cooldown
        if (spell.cooldown > 0) {
            this.cooldowns.set(spellName, currentTime + spell.cooldown);
        }
        
        return true;
    }
    
    /**
     * Complete a cast (call when cast time finishes)
     * 
     * @returns {Object|null} The completed spell or null if not casting
     */
    completeCast() {
        if (!this.isCasting) return null;
        
        const completed = this.currentCast;
        this.isCasting = false;
        this.castEndTime = 0;
        this.currentCast = null;
        
        return completed?.spell || null;
    }
    
    /**
     * Get cast time reduction from talents
     * 
     * @param {Object} spell - Spell definition
     * @returns {number} Cast time reduction in seconds
     */
    getCastTimeReduction(spell) {
        // This would check for talents like Lightning Mastery
        // For now, return 0 - the simulator handles this
        return 0;
    }
    
    /**
     * Add mana (from regeneration, procs, etc.)
     * 
     * @param {number} amount - Mana to add
     * @returns {number} Actual mana gained (capped at max)
     */
    addMana(amount) {
        const before = this.currentMana;
        this.currentMana = Math.min(this.maxMana, this.currentMana + amount);
        return this.currentMana - before;
    }
    
    /**
     * Get remaining cooldown for an ability
     * 
     * @param {string} spellName - Name of the spell
     * @returns {number} Remaining cooldown in seconds (0 if ready)
     */
    getRemainingCooldown(spellName) {
        const cdEndTime = this.cooldowns.get(spellName);
        if (!cdEndTime) return 0;
        return Math.max(0, cdEndTime - this.getCurrentTime());
    }
    
    /**
     * Get time until GCD is ready
     * 
     * @returns {number} Time until GCD ready in seconds
     */
    getGcdRemaining() {
        return Math.max(0, this.gcdEndTime - this.getCurrentTime());
    }
    
    /**
     * Reset the ability system
     */
    reset() {
        this.cooldowns.clear();
        this.gcdEndTime = 0;
        this.isCasting = false;
        this.castEndTime = 0;
        this.currentCast = null;
        this.currentMana = this.maxMana;
    }
}

export default AbilitySystem;
