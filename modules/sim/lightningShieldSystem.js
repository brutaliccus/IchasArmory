/**
 * Lightning Shield System - Data-Driven Lightning Shield Management
 * 
 * @module sim/lightningShieldSystem
 * @description Handles Lightning Shield and Empowered Lightning Shield processing.
 * 
 * ## Overview
 * Instead of hardcoded triggerLightningShield() and triggerEmpoweredLightningShield(),
 * this system:
 * - Reads shield definitions from shamanSpells.js
 * - Handles charge tracking and ICD
 * - Calculates damage using spell data
 * 
 * ## Shield Types
 * - `lightningShield` - Reactive damage on being hit (3s ICD)
 * - `empoweredLightningShield` - On Lightning Strike hit (9s CD, 8.5s with set bonus)
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { shamanSpells } from '../shaman/spells.js';
import { calculateSpellDamage } from '../shaman/damageCalc.js';
import { fireSpellHitTriggers, fireSpellResistTriggers } from './triggerRouter.js';

// ============================================
// LIGHTNING SHIELD STATE
// ============================================

/**
 * @typedef {Object} LightningShieldState
 * @property {boolean} active - Whether shield is active
 * @property {number} charges - Current charges
 * @property {number} maxCharges - Maximum charges
 * @property {number} lastTrigger - Time of last trigger (for ICD)
 * @property {number} totalDamage - Total damage dealt by shield
 * @property {number} triggerCount - Number of times triggered
 */

/**
 * Initialize Lightning Shield states
 * @param {Object} ctx - Simulation context
 */
export function initializeLightningShieldStates(ctx) {
    if (!ctx._lightningShieldState) {
        ctx._lightningShieldState = createLightningShieldState();
    }
    if (!ctx._empoweredLightningShieldState) {
        ctx._empoweredLightningShieldState = createEmpoweredLightningShieldState();
    }
}

/**
 * Create Lightning Shield state
 * @returns {LightningShieldState}
 */
function createLightningShieldState() {
    return {
        active: false,
        charges: 0,
        maxCharges: 3,
        lastTrigger: -Infinity,
        totalDamage: 0,
        triggerCount: 0
    };
}

/**
 * Create Empowered Lightning Shield state
 * @returns {Object}
 */
function createEmpoweredLightningShieldState() {
    return {
        lastTrigger: -Infinity,
        totalDamage: 0,
        triggerCount: 0
    };
}

/**
 * Get Lightning Shield state
 * @param {Object} ctx - Simulation context
 * @returns {LightningShieldState}
 */
export function getLightningShieldState(ctx) {
    initializeLightningShieldStates(ctx);
    return ctx._lightningShieldState;
}

/**
 * Get Empowered Lightning Shield state
 * @param {Object} ctx - Simulation context
 * @returns {Object}
 */
export function getEmpoweredLightningShieldState(ctx) {
    initializeLightningShieldStates(ctx);
    return ctx._empoweredLightningShieldState;
}

// ============================================
// LIGHTNING SHIELD
// ============================================

/**
 * Get max Lightning Shield charges from base + Stable Shields talent (2/4/6 per rank).
 * @param {Object} ctx - Simulation context with stats.talentBonuses
 * @returns {number} Total charges (3 base + 0/2/4/6 for 0/1/2/3 ranks)
 */
export function getLightningShieldMaxCharges(ctx) {
    const rank = ctx.stats?.talentBonuses?.stableShields ?? ctx.stats?.talentBonuses?.stable_shields ?? 0;
    const chargeBonus = [0, 2, 4, 6][Math.min(rank, 3)] ?? 0;
    return 3 + chargeBonus;
}

/**
 * Apply Lightning Shield (give charges)
 * @param {Object} ctx - Simulation context
 * @param {Object} [options] - Options
 * @param {number} [options.charges] - Number of charges (default: from getLightningShieldMaxCharges)
 * @returns {Object} Result
 */
export function applyLightningShield(ctx, options = {}) {
    const state = getLightningShieldState(ctx);
    const charges = options.charges ?? getLightningShieldMaxCharges(ctx);
    
    state.active = true;
    state.charges = charges;
    state.maxCharges = charges;
    
    if (ctx.log) {
        ctx.log(`Lightning Shield applied with ${charges} charges`);
    }
    
    return { success: true, charges };
}

/**
 * Check if Lightning Shield is off ICD
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isLightningShieldReady(ctx) {
    const state = getLightningShieldState(ctx);
    if (!state.active || state.charges <= 0) {
        return false;
    }
    
    const spell = shamanSpells.lightningShield;
    const icd = spell?.icd || 3;
    
    // Stable Shields talent adds 1s to ICD
    const stableShieldsRank = ctx.stats?.talentBonuses?.stableShields || 0;
    const actualICD = icd + stableShieldsRank; // +1s per rank (up to 4s with 1 rank)
    
    return ctx.currentTime >= state.lastTrigger + actualICD;
}

/**
 * Trigger Lightning Shield (on being hit)
 * @param {Object} ctx - Simulation context
 * @param {string} triggerSource - What triggered this
 * @param {Object} [options]
 * @param {boolean} [options.consumeCharge=true] - When false (e.g. Garb of the Ten Storms 5pc), deal damage and respect ICD without consuming a charge
 * @returns {Object|null} Damage result or null
 */
export function triggerLightningShield(ctx, triggerSource = 'Being Hit', options = {}) {
    const consumeCharge = options.consumeCharge !== false;
    const state = getLightningShieldState(ctx);
    
    // Check if ready (has charges and off ICD)
    if (!isLightningShieldReady(ctx)) {
        return null;
    }
    
    const spell = shamanSpells.lightningShield;
    if (!spell) {
        console.warn('[LightningShieldSystem] Lightning Shield spell not found');
        return null;
    }
    
    // Calculate damage
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    
    // Roll damage (cannot miss, cannot crit)
    const outcome = ctx.rollDamage ? ctx.rollDamage(spell, damageResult, false) : {
        damage: damageResult.average || 0,
        type: 'hit',
        resistType: 'none',
        didHit: true,
        isCrit: false
    };
    
    // Lightning Shield cannot miss
    if (!outcome.didHit) {
        outcome.didHit = true;
        outcome.damage = damageResult.average || 0;
        outcome.type = 'hit';
    }
    
    // Record damage
    if (ctx.recordDamage) {
        ctx.recordDamage(spell.name, outcome.damage, {
            type: 'reactive',
            outcome: outcome.type,
            resistType: outcome.resistType || 'none'
        });
    }
    
    // Fire spell hit triggers so procs like Sigil of Ancient Accord can proc from Lightning Shield (being attacked)
    fireSpellHitTriggers(ctx, spell.name, spell.icon || 'spell_nature_lightningshield', {
        didHit: true,
        isCrit: false,
        damage: outcome.damage,
        school: spell.school || 'nature'
    }, { alsoFireDirectDamageSpell: true });
    if (outcome.resistType && outcome.resistType !== 'none') {
        fireSpellResistTriggers(ctx, spell.name, spell.icon || 'spell_nature_lightningshield', { school: spell.school || 'nature' });
    }
    
    // Update state (sync ctx.lightningShieldLastProc for enemy attack system ICD)
    state.lastTrigger = ctx.currentTime;
    if (ctx.lightningShieldLastProc !== undefined) ctx.lightningShieldLastProc = ctx.currentTime;
    state.triggerCount++;
    state.totalDamage += outcome.damage;
    if (consumeCharge) {
        state.charges--;
    }
    
    if (consumeCharge && state.charges <= 0) {
        state.active = false;
    }
    
    // Track in buffUptime for timeline (consumptions and segment end)
    if (consumeCharge && !ctx.simContext?.quickSim && ctx.buffUptime?.lightningShield?.activationTimes?.length > 0) {
        const activations = ctx.buffUptime.lightningShield.activationTimes;
        const last = activations[activations.length - 1];
        if (!last.consumptions) last.consumptions = [];
        last.consumptions.push({
            time: ctx.currentTime,
            ability: 'Lightning Shield',
            icon: spell.icon || 'spell_nature_lightningshield'
        });
        if (state.charges <= 0) last.end = ctx.currentTime;
    }
    
    // Log
    if (ctx.log) {
        let msg = `Lightning Shield: ${outcome.damage.toFixed(2)} damage`;
        if (state.charges > 0) {
            msg += ` (${state.charges} charges remaining)`;
        } else {
            msg += ` (shield depleted)`;
        }
        ctx.log(msg);
    }
    
    // Note: Reapplication is handled by the rotation priority system, not automatically here
    // This ensures the GCD cost is properly accounted for
    
    return {
        damage: outcome.damage,
        isCrit: false,
        resistType: outcome.resistType || 'none',
        chargesRemaining: state.charges
    };
}

// ============================================
// EMPOWERED LIGHTNING SHIELD
// ============================================

/**
 * Check if Empowered Lightning Shield can be triggered
 * Note: ELS has no cooldown - it procs every time Lightning Strike hits while LS is active
 * The only requirement is having Lightning Shield charges available
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isEmpoweredLightningShieldReady(ctx) {
    // ELS has no cooldown - it's always ready as long as we have LS charges
    // The check for LS charges is done by the caller
    return true;
}

/**
 * Trigger Empowered Lightning Shield (on Lightning Strike hit or set bonus proc)
 * ELS has no cooldown - it can proc every time it's triggered as long as LS charges are available
 * @param {Object} ctx - Simulation context
 * @param {string} triggerSource - What triggered this (e.g., 'Lightning Strike', 'Stormhowl 3pc')
 * @returns {Object|null} Damage result or null if no LS charges
 */
export function triggerEmpoweredLightningShield(ctx, triggerSource = 'Lightning Strike', consumeSSCharge = true) {
    // ELS has no cooldown - always ready to trigger
    // consumeSSCharge: whether to consume a Stormstrike charge (false for Stormhowl 3pc)
    
    const spell = shamanSpells.empoweredLightningShield;
    if (!spell) {
        console.warn('[LightningShieldSystem] Empowered Lightning Shield spell not found');
        return null;
    }
    
    const state = getEmpoweredLightningShieldState(ctx);
    
    // Calculate damage
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    
    // Roll damage (cannot miss, cannot crit)
    const outcome = ctx.rollDamage ? ctx.rollDamage(spell, damageResult, false) : {
        damage: damageResult.average || 0,
        type: 'hit',
        resistType: 'none',
        didHit: true,
        isCrit: false
    };
    
    // Record damage
    if (ctx.recordDamage) {
        ctx.recordDamage(spell.name, outcome.damage, {
            type: 'proc',
            outcome: outcome.type,
            resistType: outcome.resistType || 'none'
        });
    }
    
    // Fire spell hit triggers so procs like Sigil of Ancient Accord can proc from Empowered Lightning Shield
    fireSpellHitTriggers(ctx, spell.name, spell.icon || 'spell_nature_lightningshield', {
        didHit: true,
        isCrit: outcome.isCrit || false,
        damage: outcome.damage,
        school: spell.school || 'nature'
    }, { alsoFireDirectDamageSpell: true });
    if (outcome.resistType && outcome.resistType !== 'none') {
        fireSpellResistTriggers(ctx, spell.name, spell.icon || 'spell_nature_lightningshield', { school: spell.school || 'nature' });
    }
    
    // Update state
    state.lastTrigger = ctx.currentTime;
    state.triggerCount++;
    state.totalDamage += outcome.damage;
    
    // Check if Stormstrike is consumed (Stormhowl 3pc procs do NOT consume SS charge)
    if (spell.consumesStormstrikeCharge && consumeSSCharge) {
        // Consume Stormstrike charge with tracking
        if (typeof ctx.consumeStormstrikeCharge === 'function') {
            ctx.consumeStormstrikeCharge('Empowered Lightning Shield');
        }
    }
    
    // Log
    if (ctx.log) {
        ctx.log(`Empowered Lightning Shield: ${outcome.damage.toFixed(2)} damage`);
    }
    
    return {
        damage: outcome.damage,
        isCrit: false,
        resistType: outcome.resistType || 'none'
    };
}

/**
 * Get cooldown remaining for Empowered Lightning Shield
 * Note: ELS has no cooldown - this always returns 0
 * Kept for API compatibility
 * @param {Object} ctx - Simulation context
 * @returns {number} Always 0 (ELS has no cooldown)
 */
export function getEmpoweredLightningShieldCooldown(ctx) {
    // ELS has no cooldown - it's a proc that triggers on Lightning Strike hit
    return 0;
}

// ============================================
// EXPORTS
// ============================================

export default {
    initializeLightningShieldStates,
    getLightningShieldState,
    getEmpoweredLightningShieldState,
    getLightningShieldMaxCharges,
    applyLightningShield,
    isLightningShieldReady,
    triggerLightningShield,
    isEmpoweredLightningShieldReady,
    triggerEmpoweredLightningShield,
    getEmpoweredLightningShieldCooldown
};
