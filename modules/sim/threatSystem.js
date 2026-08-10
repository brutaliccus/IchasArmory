/**
 * Threat System Module
 * 
 * @module sim/threatSystem
 * @description Handles threat calculation for all damage sources.
 * 
 * ## Overview
 * Calculates threat from damage with multipliers:
 * - Base: 1:1 damage to threat
 * - Earth Shock: 1.5x threat multiplier
 * - Spirit Armor talent
 * - Rockbiter imbue
 * - Calming Winds talent (only without Rockbiter)
 * - Salvation buff
 * - Eye of Diminution trinket
 * - Totemic Alignment (totem damage transfer)
 * 
 * @version 1.0.0
 * @since 2026-01-27
 */

import { isTrinketBuffActive, getTrinketDefinition } from './trinketSystem.js';

// ============================================
// THREAT MULTIPLIER DEFINITIONS
// ============================================

/**
 * Abilities affected by Calming Winds talent
 * @constant {string[]}
 */
export const CALMING_WINDS_ABILITIES = [
    'Auto Attack',
    'Flametongue Weapon',
    'Lightning Strike (Physical)',
    'Lightning Strike (Nature)',
    'Stormstrike',
    'Windfury Attack',
    'Hand of Justice'
];

/**
 * Abilities with bonus threat multipliers
 * @constant {Object}
 */
export const THREAT_MULTIPLIERS = {
    'Earth Shock': 1.5  // Earth Shock generates 1.5x threat
};

// ============================================
// THREAT CALCULATION
// ============================================

/**
 * Calculate threat from damage
 * 
 * @param {Object} ctx - Simulation context
 * @param {number} damage - Damage dealt
 * @param {string} abilityName - Name of the ability
 * @param {Object} [options] - Additional options
 * @param {boolean} [options.isTotem=false] - Whether this is totem damage
 * @returns {number} Calculated threat value
 */
export function calculateThreat(ctx, damage, abilityName, options = {}) {
    const { isTotem = false } = options;
    const stats = ctx.stats || {};
    
    // Get ability-specific multiplier (e.g., Earth Shock 1.5x)
    const abilityMult = THREAT_MULTIPLIERS[abilityName] || 1;
    
    // Start with base threat
    let threat = damage * abilityMult;
    
    // Apply Spirit Armor talent multiplier
    threat *= (stats.threatSpiritArmorMult || 1);
    
    // Apply Rockbiter imbue multiplier
    const rockbiterMult = stats.threatRockbiterMult || 1;
    threat *= rockbiterMult;
    
    // Calming Winds: 8/16/25% threat reduction
    // Only applies when NOT using Rockbiter and ability is affected
    if (rockbiterMult === 1 && stats.threatCalmingWindsReduction > 0) {
        if (CALMING_WINDS_ABILITIES.includes(abilityName)) {
            threat *= (1 - stats.threatCalmingWindsReduction / 100);
        }
    }
    
    // Apply Salvation buff multiplier
    threat *= (stats.threatSalvationMult || 1);
    
    // Eye of Diminution: 35% threat reduction when active
    if (isEyeOfDiminutionActive(ctx)) {
        const eyeDef = getTrinketDefinition('eye_of_diminution');
        const reduction = eyeDef?.effect?.value || 0.35;
        threat *= (1 - reduction);
    }
    
    // Totemic Alignment: Only a percentage of totem threat transfers to player
    if (isTotem) {
        const transferPercent = stats.totemicAlignmentThreatPercent || 0;
        threat *= (transferPercent / 100);
    }
    
    return threat;
}

/**
 * Check if Eye of Diminution is active
 * Uses both data-driven and legacy state
 * 
 * @param {Object} ctx - Simulation context
 * @returns {boolean} Whether Eye of Diminution is active
 */
export function isEyeOfDiminutionActive(ctx) {
    // Check data-driven trinket system first
    if (isTrinketBuffActive(ctx, 'eye_of_diminution')) {
        return true;
    }
    
    // Legacy fallback
    if (ctx.eyeOfDiminutionExpires && ctx.eyeOfDiminutionExpires > ctx.currentTime) {
        return true;
    }
    
    return false;
}

/**
 * Get threat multiplier for display/tooltip
 * Returns the combined multiplier without damage
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} abilityName - Name of the ability
 * @param {Object} [options] - Additional options
 * @returns {number} Combined threat multiplier
 */
export function getThreatMultiplier(ctx, abilityName, options = {}) {
    const { isTotem = false } = options;
    const stats = ctx.stats || {};
    
    let multiplier = THREAT_MULTIPLIERS[abilityName] || 1;
    
    multiplier *= (stats.threatSpiritArmorMult || 1);
    
    const rockbiterMult = stats.threatRockbiterMult || 1;
    multiplier *= rockbiterMult;
    
    if (rockbiterMult === 1 && stats.threatCalmingWindsReduction > 0) {
        if (CALMING_WINDS_ABILITIES.includes(abilityName)) {
            multiplier *= (1 - stats.threatCalmingWindsReduction / 100);
        }
    }
    
    multiplier *= (stats.threatSalvationMult || 1);
    
    if (isEyeOfDiminutionActive(ctx)) {
        const eyeDef = getTrinketDefinition('eye_of_diminution');
        multiplier *= (1 - (eyeDef?.effect?.value || 0.35));
    }
    
    if (isTotem) {
        multiplier *= ((stats.totemicAlignmentThreatPercent || 0) / 100);
    }
    
    return multiplier;
}

/**
 * Get threat from damage using context method (legacy compatibility wrapper)
 * This mirrors the old getThreatFromDamage method signature
 * 
 * @param {Object} ctx - Simulation context (or simulator instance)
 * @param {number} damage - Damage dealt
 * @param {string} abilityName - Name of the ability
 * @returns {number} Calculated threat value
 */
export function getThreatFromDamage(ctx, damage, abilityName) {
    return calculateThreat(ctx, damage, abilityName);
}

// ============================================
// STAT KEY DOCUMENTATION
// ============================================

/**
 * Threat-related stat keys expected on ctx.stats:
 * 
 * - threatSpiritArmorMult: Spirit Armor talent multiplier (e.g., 1.15 for 15% increase)
 * - threatRockbiterMult: Rockbiter weapon imbue multiplier (e.g., 1.5)
 * - threatCalmingWindsReduction: Calming Winds reduction % (e.g., 25 for 25%)
 * - threatSalvationMult: Salvation buff multiplier (e.g., 0.7 for 30% reduction)
 * - totemicAlignmentThreatPercent: % of totem threat transferred (0-100)
 */

// ============================================
// EXPORTS
// ============================================

export default {
    CALMING_WINDS_ABILITIES,
    THREAT_MULTIPLIERS,
    calculateThreat,
    isEyeOfDiminutionActive,
    getThreatMultiplier,
    getThreatFromDamage
};
