/**
 * Totem System - Data-Driven Totem Management
 * 
 * @module sim/totemSystem
 * @description Handles totem lifecycle, attacks, detonations, and pulses.
 * 
 * ## Overview
 * Instead of hardcoded dropFireNovaTotem(), dropSearingTotem(), etc., this system:
 * - Reads totem definitions from totems.js
 * - Handles totem placement (replaces same-slot totems)
 * - Schedules attacks/detonations/pulses based on behavior type
 * - Calculates damage using shamanSpells.js data
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { totemDefinitions, getTotemById, getTotemByKey, totemsConflict } from '../shaman/totems.js';
import { shamanSpells } from '../shaman/spells.js';
import { calculateSpellDamage } from '../shaman/damageCalc.js';
import { getAoeMultiplier, getTargetDebuffMultiplier } from './simContext.js';

// ============================================
// TOTEM STATE MANAGEMENT
// ============================================

/**
 * @typedef {Object} TotemState
 * @property {string|null} totemId - Active totem ID or null
 * @property {number} droppedAt - Time totem was dropped
 * @property {number} expiresAt - Time totem expires
 * @property {number} nextAction - Time of next action (attack/pulse/detonate)
 * @property {number} actionCount - Number of actions performed
 */

/**
 * Initialize totem states for all slots
 * @param {Object} ctx - Simulation context
 */
export function initializeTotemStates(ctx) {
    if (!ctx._totemStates) {
        ctx._totemStates = {
            fire: createTotemSlotState(),
            earth: createTotemSlotState(),
            water: createTotemSlotState(),
            air: createTotemSlotState()
        };
    }
}

/**
 * Create empty totem slot state
 * @returns {TotemState}
 */
function createTotemSlotState() {
    return {
        totemId: null,
        totemKey: null,
        droppedAt: 0,
        expiresAt: 0,
        nextAction: 0,
        actionCount: 0
    };
}

/**
 * Get totem state for a slot
 * @param {Object} ctx - Simulation context
 * @param {string} slot - Element slot
 * @returns {TotemState}
 */
export function getTotemState(ctx, slot) {
    initializeTotemStates(ctx);
    return ctx._totemStates[slot];
}

/**
 * Check if a totem is active in a slot
 * @param {Object} ctx - Simulation context
 * @param {string} slot - Element slot
 * @returns {boolean}
 */
export function isTotemActive(ctx, slot) {
    const state = getTotemState(ctx, slot);
    return state.totemId !== null && state.expiresAt > ctx.currentTime;
}

/**
 * Get active totem in a slot
 * @param {Object} ctx - Simulation context
 * @param {string} slot - Element slot
 * @returns {Object|null} Totem definition or null
 */
export function getActiveTotem(ctx, slot) {
    const state = getTotemState(ctx, slot);
    if (!state.totemId || state.expiresAt <= ctx.currentTime) {
        return null;
    }
    return getTotemById(state.totemId);
}

// ============================================
// TOTEM DROPPING
// ============================================

/**
 * Drop a totem
 * @param {Object} ctx - Simulation context
 * @param {string} totemKey - Totem key (fireNova, searing, stoneclaw, etc.)
 * @param {Object} [options] - Options
 * @returns {Object} Result with success status
 */
export function dropTotem(ctx, totemKey, options = {}) {
    const totem = getTotemByKey(totemKey);
    if (!totem) {
        return { success: false, reason: 'totem_not_found', totemKey };
    }
    
    initializeTotemStates(ctx);
    
    // Remove existing totem in same slot
    const existingTotem = getActiveTotem(ctx, totem.slot);
    if (existingTotem) {
        removeTotem(ctx, totem.slot);
        if (ctx.log) {
            ctx.log(`${existingTotem.name} removed by ${totem.name}`);
        }
    }
    
    // Set up new totem state
    const state = ctx._totemStates[totem.slot];
    state.totemId = totem.id;
    state.totemKey = totemKey;
    state.droppedAt = ctx.currentTime;
    state.expiresAt = ctx.currentTime + (totem.duration || 60);
    state.actionCount = 0;
    
    // Schedule behavior based on type
    switch (totem.behavior) {
        case 'detonate':
            scheduleDetonation(ctx, totemKey, totem);
            break;
        case 'autoAttack':
            scheduleNextAttack(ctx, totemKey, totem);
            break;
        case 'pulse':
            scheduleNextPulse(ctx, totemKey, totem);
            break;
        case 'aura':
            // Auras don't need scheduled actions
            break;
    }
    
    // Schedule auto-redrop at expiration for persistent fire totems (Searing, Magma)
    // so they stay active for the full fight without requiring priority system management
    if ((totem.behavior === 'autoAttack' || totem.behavior === 'pulse') && !totem.cooldown && ctx.scheduleEvent) {
        const expireTime = state.expiresAt;
        if (expireTime < ctx.fightDuration) {
            ctx.scheduleEvent(expireTime, 'totemRedrop', () => {
                const currentState = getTotemState(ctx, totem.slot);
                if (currentState.totemKey === totemKey && currentState.expiresAt <= ctx.currentTime) {
                    const savedGcd = ctx.gcdReadyAt;
                    dropTotem(ctx, totemKey);
                    if (ctx.gcdReadyAt !== savedGcd) {
                        const reDropGcdId = 'gcdReady_' + ctx.gcdReadyAt;
                        if (ctx.unscheduleEvent) ctx.unscheduleEvent(reDropGcdId);
                        ctx.gcdReadyAt = savedGcd;
                    }
                }
            }, `${totemKey}Expire`);
        }
    }
    
    // Log
    if (ctx.log) {
        ctx.log(`${totem.name} dropped, expires at ${state.expiresAt.toFixed(3)}s`);
    }
    
    // Trigger GCD if totem uses it
    if (totem.usesGCD && ctx.triggerGCD) {
        ctx.triggerGCD();
    }
    
    return { success: true, totem, state };
}

/**
 * Remove a totem from a slot
 * @param {Object} ctx - Simulation context
 * @param {string} slot - Element slot
 */
export function removeTotem(ctx, slot) {
    initializeTotemStates(ctx);
    const state = ctx._totemStates[slot];
    
    if (state.totemId) {
        const totem = getTotemById(state.totemId);
        const totemKey = state.totemKey;
        
        // Cancel scheduled events (use legacy-compatible event IDs)
        if (ctx.unscheduleEvent) {
            // Fire Nova
            if (totemKey === 'fireNova') {
                ctx.unscheduleEvent('fireNovaDetonate');
            }
            // Searing Totem
            else if (totemKey === 'searing') {
                ctx.unscheduleEvent('searingTotemAttack');
            }
            // Stoneclaw Totem
            else if (totemKey === 'stoneclaw') {
                ctx.unscheduleEvent('stoneclawTotemPulse');
            }
            // Generic fallback
            else {
                ctx.unscheduleEvent(`${totemKey}Attack`);
                ctx.unscheduleEvent(`${totemKey}Detonate`);
                ctx.unscheduleEvent(`${totemKey}Pulse`);
            }
            ctx.unscheduleEvent(`${totemKey}Expire`);
        }
        
        // Reset state
        state.totemId = null;
        state.totemKey = null;
        state.droppedAt = 0;
        state.expiresAt = 0;
        state.nextAction = 0;
        state.actionCount = 0;
    }
}

// ============================================
// TOTEM BEHAVIORS
// ============================================

/**
 * Schedule detonation for Fire Nova Totem
 * @param {Object} ctx - Simulation context
 * @param {string} totemKey - Totem key
 * @param {Object} totem - Totem definition
 */
function scheduleDetonation(ctx, totemKey, totem) {
    const config = totem.behaviorConfig || {};
    let delay = config.detonationDelay || 4;
    
    // Apply talent reduction
    if (config.talentReduction && ctx.stats?.activeModifiers) {
        const talentRank = ctx.stats.activeModifiers[config.talentReduction.talent] || 0;
        if (talentRank > 0) {
            delay -= config.talentReduction.reductionPerRank * talentRank;
            delay = Math.max(delay, 0);
        }
    }
    
    const detonationTime = ctx.currentTime + delay;
    const state = getTotemState(ctx, totem.slot);
    state.nextAction = detonationTime;
    
    if (ctx.log) {
        ctx.log(`${totem.name} will detonate at ${detonationTime.toFixed(3)}s (${delay}s delay)`);
    }
    
    // Schedule detonation event (use legacy-compatible event ID)
    if (detonationTime <= ctx.fightDuration && ctx.scheduleEvent) {
        ctx.scheduleEvent(detonationTime, 'fireNovaDetonate', () => {
            executeDetonation(ctx, totemKey);
        }, 'fireNovaDetonate');
    }
}

/**
 * Execute Fire Nova detonation
 * @param {Object} ctx - Simulation context
 * @param {string} totemKey - Totem key
 */
function executeDetonation(ctx, totemKey) {
    const totem = getTotemByKey(totemKey);
    if (!totem) return;
    
    const state = getTotemState(ctx, totem.slot);
    if (state.totemKey !== totemKey) return; // Totem was replaced
    
    const spell = shamanSpells[totem.spell];
    if (!spell) {
        console.warn(`[TotemSystem] Spell not found: ${totem.spell}`);
        return;
    }
    
    // Calculate base damage (includes static boss debuffs from calculateSpellDamage)
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    
    // AOE: roll damage independently for each target
    // Secondary targets don't have boss debuffs (CoE, Improved Scorch, Fire Vulnerability, etc.)
    const aoeMult = getAoeMultiplier(ctx);
    const debuffMult = aoeMult > 1 ? getTargetDebuffMultiplier(ctx, spell) : 1.0;
    const secondaryDamageResult = debuffMult > 1 ? {
        min: damageResult.min / debuffMult,
        max: damageResult.max / debuffMult,
        average: damageResult.average / debuffMult
    } : damageResult;
    
    for (let t = 0; t < aoeMult; t++) {
        const isSecondary = t > 0;
        const dmgResult = isSecondary ? secondaryDamageResult : damageResult;
        const outcome = ctx.rollDamage ? ctx.rollDamage(spell, dmgResult, false, isSecondary) : {
            damage: dmgResult.average || 0,
            type: 'hit',
            resistType: 'none',
            didHit: true,
            isCrit: false
        };
        if (ctx.recordDamage) {
            ctx.recordDamage(spell.name, outcome.damage, {
                type: 'totem',
                outcome: outcome.type,
                resistType: outcome.resistType || 'none'
            });
        }
    }
    
    if (ctx.log) {
        ctx.log(`${spell.name} detonated${aoeMult > 1 ? ` on ${aoeMult} targets` : ''}`);
    }
    
    // Clear totem state
    removeTotem(ctx, totem.slot);
    
    // Auto-drop fire totem after Fire Nova: Magma when AOE (hits all targets), Searing otherwise
    // Save and restore GCD state so the auto-redrop doesn't consume a rotation GCD
    if (totemKey === 'fireNova') {
        const savedGcd = ctx.gcdReadyAt;
        const fireTotemKey = ctx.stats?.combatConfig?.aoeEnabled ? 'magma' : 'searing';
        const allowSearingRedrop = fireTotemKey !== 'searing' || ctx.stats?.combatConfig?.searingTotemEnabled !== false;
        if (allowSearingRedrop) {
            dropTotem(ctx, fireTotemKey);
            if (ctx.gcdReadyAt !== savedGcd) {
                const reDropEventId = 'gcdReady_' + ctx.gcdReadyAt;
                if (ctx.unscheduleEvent) ctx.unscheduleEvent(reDropEventId);
                ctx.gcdReadyAt = savedGcd;
            }
        }
    }
    
}

/**
 * Schedule next Searing Totem attack
 * @param {Object} ctx - Simulation context
 * @param {string} totemKey - Totem key
 * @param {Object} totem - Totem definition
 */
function scheduleNextAttack(ctx, totemKey, totem) {
    const config = totem.behaviorConfig || {};
    let attackRate = config.baseAttackRate || 2.2;
    
    // Apply talent haste
    if (config.talentHaste && ctx.stats?.activeModifiers) {
        const talentRank = ctx.stats.activeModifiers[config.talentHaste.talent] || 0;
        if (talentRank > 0) {
            const speedIncrease = config.talentHaste.hastePerRank * talentRank;
            attackRate *= (1 - speedIncrease);
        }
    }
    
    // Add cast delay
    attackRate += config.castDelay || 0;
    
    const state = getTotemState(ctx, totem.slot);
    state.nextAction = ctx.currentTime + attackRate;
    
    // Schedule attack if within fight duration and totem duration
    // Use legacy-compatible event ID for Searing Totem
    const eventId = totemKey === 'searing' ? 'searingTotemAttack' : `${totemKey}Attack`;
    if (state.nextAction <= ctx.fightDuration && state.nextAction <= state.expiresAt && ctx.scheduleEvent) {
        ctx.scheduleEvent(state.nextAction, 'totemAttack', () => {
            executeTotemAttack(ctx, totemKey);
        }, eventId);
    }
}

/**
 * Execute Searing Totem attack
 * @param {Object} ctx - Simulation context
 * @param {string} totemKey - Totem key
 */
function executeTotemAttack(ctx, totemKey) {
    const totem = getTotemByKey(totemKey);
    if (!totem) return;
    
    const state = getTotemState(ctx, totem.slot);
    if (state.totemKey !== totemKey || state.expiresAt <= ctx.currentTime) {
        return; // Totem was replaced or expired
    }
    
    const spell = shamanSpells[totem.spell];
    if (!spell) {
        console.warn(`[TotemSystem] Spell not found: ${totem.spell}`);
        return;
    }
    
    // Calculate damage
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    
    // Roll damage
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
            type: 'totem',
            outcome: outcome.type,
            resistType: outcome.resistType || 'none'
        });
    }
    
    // Log
    if (ctx.log) {
        ctx.log(`${spell.name}: ${outcome.damage.toFixed(2)} damage (${outcome.type})`);
    }
    
    state.actionCount++;
    
    // Schedule next attack
    scheduleNextAttack(ctx, totemKey, totem);
    
    return outcome;
}

/**
 * Schedule next pulse (Stoneclaw threat, Magma damage)
 * @param {Object} ctx - Simulation context
 * @param {string} totemKey - Totem key
 * @param {Object} totem - Totem definition
 */
function scheduleNextPulse(ctx, totemKey, totem) {
    const config = totem.behaviorConfig || {};
    const pulseInterval = config.pulseInterval || 2.0;
    
    const state = getTotemState(ctx, totem.slot);
    
    // First pulse is immediate for initial threat
    if (state.actionCount === 0 && config.initialThreat) {
        executePulse(ctx, totemKey, true);
    }
    
    state.nextAction = ctx.currentTime + pulseInterval;
    
    // Check max pulses
    const maxPulses = config.totalPulses || Infinity;
    if (state.actionCount >= maxPulses) {
        return; // No more pulses
    }
    
    // Schedule pulse if within fight duration and totem duration
    // Use legacy-compatible event ID for Stoneclaw Totem
    const eventId = totemKey === 'stoneclaw' ? 'stoneclawTotemPulse' : `${totemKey}Pulse`;
    if (state.nextAction <= ctx.fightDuration && state.nextAction <= state.expiresAt && ctx.scheduleEvent) {
        ctx.scheduleEvent(state.nextAction, 'totemPulse', () => {
            executePulse(ctx, totemKey, false);
        }, eventId);
    }
}

/**
 * Execute totem pulse
 * @param {Object} ctx - Simulation context
 * @param {string} totemKey - Totem key
 * @param {boolean} isInitial - Whether this is the initial pulse on drop
 */
function executePulse(ctx, totemKey, isInitial = false) {
    const totem = getTotemByKey(totemKey);
    if (!totem) return;
    
    const state = getTotemState(ctx, totem.slot);
    if (state.totemKey !== totemKey || state.expiresAt <= ctx.currentTime) {
        return; // Totem was replaced or expired
    }
    
    const config = totem.behaviorConfig || {};
    
    // Stoneclaw: threat only
    if (config.threatPerPulse) {
        const threat = isInitial ? (config.initialThreat || config.threatPerPulse) : config.threatPerPulse;
        
        if (ctx.recordThreatOnly) {
            ctx.recordThreatOnly(totem.name, threat);
        }
        
        if (ctx.log) {
            ctx.log(`${totem.name} pulse: ${threat} threat`);
        }
        
        state.actionCount++;
        
        // Schedule next pulse
        if (!isInitial) {
            scheduleNextPulse(ctx, totemKey, totem);
        }
        
        return { threat };
    }
    
    // Magma: damage pulse (roll independently per target)
    // Secondary targets don't have boss debuffs (CoE, Improved Scorch, Fire Vulnerability, etc.)
    if (totem.spell) {
        const spell = shamanSpells[totem.spell];
        if (spell) {
            const damageResult = calculateSpellDamage(spell, ctx.stats);
            const aoeMult = getAoeMultiplier(ctx);
            const debuffMult = aoeMult > 1 ? getTargetDebuffMultiplier(ctx, spell) : 1.0;
            const secondaryDamageResult = debuffMult > 1 ? {
                min: damageResult.min / debuffMult,
                max: damageResult.max / debuffMult,
                average: damageResult.average / debuffMult
            } : damageResult;
            
            let totalDamage = 0;
            let lastOutcome = { damage: 0, type: 'hit' };
            for (let t = 0; t < aoeMult; t++) {
                const isSecondary = t > 0;
                const dmgResult = isSecondary ? secondaryDamageResult : damageResult;
                const outcome = ctx.rollDamage ? ctx.rollDamage(spell, dmgResult, false, isSecondary) : {
                    damage: dmgResult.average || 0,
                    type: 'hit'
                };
                if (ctx.recordDamage) {
                    ctx.recordDamage(spell.name, outcome.damage, {
                        type: 'totem',
                        outcome: outcome.type
                    });
                }
                totalDamage += outcome.damage;
                lastOutcome = outcome;
            }
            
            state.actionCount++;
            scheduleNextPulse(ctx, totemKey, totem);
            
            return { ...lastOutcome, damage: totalDamage };
        }
    }
}

// ============================================
// EXPORTS
// ============================================

export default {
    initializeTotemStates,
    getTotemState,
    isTotemActive,
    getActiveTotem,
    dropTotem,
    removeTotem
};
