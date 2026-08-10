/**
 * Set Bonus System - Data-Driven Set Bonus Handling
 * 
 * @module sim/setBonusSystem
 * @description Handles set bonus effects in a data-driven manner.
 * 
 * ## Overview
 * Instead of hardcoded set bonus checks throughout the simulator, this system:
 * - Reads set bonus definitions from setBonuses.js
 * - Provides unified trigger points for set bonus effects
 * - Handles buff activation/expiration
 * - Tracks proc states
 * 
 * ## Effect Types Handled
 * - Cooldown reductions
 * - Proc-on-hit effects
 * - Buff applications
 * - DOT extensions
 * - Instant cast procs
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { getSetBonusById, getActiveBonuses } from '../gear/setBonuses.js';
import { shamanSpells } from '../shaman/spells.js';
import { calculateSpellDamage } from '../shaman/damageCalc.js';
import { triggerEmpoweredLightningShield, triggerLightningShield } from './lightningShieldSystem.js';
import { fireSpellHitTriggers } from './triggerRouter.js';
// ============================================
// SET BONUS STATE
// ============================================

/**
 * Initialize set bonus states
 * @param {Object} ctx - Simulation context
 */
export function initializeSetBonusStates(ctx) {
    if (!ctx._setBonusStates) {
        ctx._setBonusStates = {
            // Echoed Thunder (T2 5pc)
            echoedThunder: {
                active: false,
                expires: 0
            },
            // Instant Lightning Bolt (T2 8pc)
            instantLightningBolt: {
                active: false,
                expires: 0
            },
            // Stormwolf's Frenzy (Stormhowl Battlegear 5pc)
            stormwolfFrenzy: {
                active: false,
                expires: 0,
                strengthBonus: 0
            },
            // Stormwolf's Cunning (Stormhowl Garb 5pc)
            stormwolfCunning: {
                active: false,
                expires: 0
            },
            // Crackling Thunder (Totem of Crackling Thunder)
            cracklingThunder: {
                active: false,
                expires: 0
            },
            // Towerforge Fury (Towerforge Battlegear 4pc)
            towerforgeFury: {
                active: false,
                expires: 0
            },
            // Might of the Hippogryph 3pc (+20% haste; 2 charges removed by Auto / WF extras / Stormstrike / LS physical; 150 Nature on all successful melee hits while charges remain)
            hippogryphMight: {
                active: false,
                charges: 0,
                expires: 0,
                hastePercent: 20
            }
        };
    }
}

/**
 * Get set bonus state
 * @param {Object} ctx - Simulation context
 * @param {string} buffId - Buff ID
 * @returns {Object} State
 */
export function getSetBonusState(ctx, buffId) {
    initializeSetBonusStates(ctx);
    return ctx._setBonusStates[buffId];
}

// ============================================
// COOLDOWN REDUCTION
// ============================================

/**
 * Get cooldown reduction for an ability from set bonuses
 * @param {Object} ctx - Simulation context
 * @param {string} abilityKey - Ability key
 * @returns {number} Cooldown reduction in seconds
 */
export function getCooldownReduction(ctx, abilityKey) {
    let reduction = 0;
    
    // T2 3pc: -0.5s on Stormstrike and Lightning Strike
    if (ctx.stats?.setBonuses?.battlegear_ten_storms_3pc_cooldown_reduction) {
        if (abilityKey === 'stormstrike' || abilityKey === 'lightningStrike') {
            reduction += ctx.stats.setBonuses.battlegear_ten_storms_3pc_cooldown_reduction;
        }
    }
    
    return reduction;
}

/**
 * Apply cooldown reduction to an ability
 * @param {Object} ctx - Simulation context
 * @param {string} abilityKey - Ability key
 * @param {number} baseCooldown - Base cooldown
 * @returns {number} Reduced cooldown
 */
export function getReducedCooldown(ctx, abilityKey, baseCooldown) {
    const reduction = getCooldownReduction(ctx, abilityKey);
    return Math.max(0, baseCooldown - reduction);
}

// ============================================
// ECHOED THUNDER (T2 5pc)
// ============================================

/**
 * Activate Echoed Thunder buff
 * @param {Object} ctx - Simulation context
 * @returns {Object} Result
 */
export function activateEchoedThunder(ctx) {
    const state = getSetBonusState(ctx, 'echoedThunder');
    
    state.active = true;
    state.expires = Infinity; // Lasts until consumed
    
    if (ctx.log) {
        ctx.log('[Echoed Thunder] Buff activated - next auto attack will deal 10% additional nature damage');
    }
    
    return { success: true };
}

/**
 * Check if Echoed Thunder is active
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isEchoedThunderActive(ctx) {
    const state = getSetBonusState(ctx, 'echoedThunder');
    return state.active && state.expires > ctx.currentTime;
}

/**
 * Consume Echoed Thunder and deal damage
 * @param {Object} ctx - Simulation context
 * @param {number} autoAttackDamage - Auto attack damage dealt
 * @returns {Object|null} Damage result or null
 */
export function consumeEchoedThunder(ctx, autoAttackDamage) {
    if (!isEchoedThunderActive(ctx)) {
        return null;
    }
    
    const state = getSetBonusState(ctx, 'echoedThunder');
    
    // Calculate 10% nature damage
    let damage = autoAttackDamage * 0.10;
    
    // Apply nature damage modifiers
    if (ctx.stats?.activeModifiers?.elementalMastery) {
        damage *= 1.15;
    }
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) {
        damage *= 1.20;
    }
    const onSecondary = typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget();
    if (!onSecondary && ctx.nightfallEnabled && ctx.isNightfallActive?.()) {
        damage *= 1.10;
    }
    
    // Roll for resistance
    let resistType = 'none';
    if (ctx.rollForResistance) {
        const resistResult = ctx.rollForResistance('nature');
        damage *= resistResult.multiplier;
        resistType = resistResult.type;
        
        if (resistType === 'full_resist') {
            damage = 0;
        }
    }
    
    // Record damage
    if (ctx.recordDamage) {
        ctx.recordDamage('Echoed Thunder', damage, {
            type: 'set_bonus',
            outcome: resistType === 'full_resist' ? 'full_resist' : 'hit',
            resistType
        });
    }
    
    // Consume buff
    state.active = false;
    state.expires = 0;
    
    if (ctx.log) {
        ctx.log(`[Echoed Thunder] ${damage.toFixed(2)} nature damage (10% of ${autoAttackDamage.toFixed(2)})`);
    }
    
    return { damage, resistType };
}

// ============================================
// INSTANT LIGHTNING BOLT (T2 8pc)
// ============================================

/**
 * Activate Instant Lightning Bolt proc (Seeking Thunder)
 * @param {Object} ctx - Simulation context
 * @returns {Object} Result
 */
export function activateInstantLightningBolt(ctx) {
    const state = getSetBonusState(ctx, 'instantLightningBolt');
    
    state.active = true;
    state.charges = 1;
    state.expires = ctx.currentTime + 10; // 10 second duration
    
    // Track in buffUptime for timeline display
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = 'seekingThunder';
        if (!ctx.buffUptime[buffKey]) {
            ctx.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
        }
        ctx.buffUptime[buffKey].procs++;
        ctx.buffUptime[buffKey].activationTimes.push({
            start: ctx.currentTime,
            end: null,
            duration: null,
            triggerSource: 'Stormstrike',
            triggerIcon: 'ability_shaman_stormstrike',
            consumptions: [],
            refreshes: []
        });
    }
    
    // Schedule expiration
    if (ctx.scheduleEvent) {
        ctx.scheduleEvent(state.expires, 'buffExpire', () => {
            expireInstantLightningBolt(ctx);
        }, 'instantLightningBoltExpire');
    }
    
    if (ctx.log) {
        ctx.log('[Seeking Thunder] Activated - next Lightning Bolt is instant with 99% hit');
    }
    
    return { success: true, expires: state.expires };
}

/**
 * Check if Instant Lightning Bolt (Seeking Thunder) is active
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isInstantLightningBoltActive(ctx) {
    const state = getSetBonusState(ctx, 'instantLightningBolt');
    return state.active && state.expires > ctx.currentTime;
}

/**
 * Consume Instant Lightning Bolt proc (Seeking Thunder)
 * @param {Object} ctx - Simulation context
 * @returns {Object} Modifiers to apply
 */
export function consumeInstantLightningBolt(ctx) {
    if (!isInstantLightningBoltActive(ctx)) {
        return null;
    }
    
    const state = getSetBonusState(ctx, 'instantLightningBolt');
    
    // Cancel scheduled expiration
    if (ctx.unscheduleEvent) {
        ctx.unscheduleEvent('instantLightningBoltExpire');
    }
    
    // Track consumption in buffUptime
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = 'seekingThunder';
        const tracker = ctx.buffUptime[buffKey];
        if (tracker && tracker.activationTimes.length > 0) {
            const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
            if (lastActivation && lastActivation.end === null) {
                lastActivation.consumptions = lastActivation.consumptions || [];
                lastActivation.consumptions.push({
                    time: ctx.currentTime,
                    ability: 'Lightning Bolt',
                    chargesRemaining: 0
                });
                lastActivation.end = ctx.currentTime;
                lastActivation.duration = lastActivation.end - lastActivation.start;
                lastActivation.endReason = 'consumed';
            }
        }
    }
    
    state.active = false;
    state.charges = 0;
    state.expires = 0;
    
    if (ctx.log) {
        ctx.log('[Seeking Thunder] Consumed by Lightning Bolt');
    }
    
    return {
        instantCast: true,
        noManaCost: true,
        hitBonus: 0.99
    };
}

/**
 * Expire Instant Lightning Bolt proc (Seeking Thunder)
 * @param {Object} ctx - Simulation context
 */
function expireInstantLightningBolt(ctx) {
    const state = getSetBonusState(ctx, 'instantLightningBolt');
    
    if (state.active) {
        // Track expiration in buffUptime
        const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
        if (!isQuickSim && ctx.buffUptime) {
            const buffKey = 'seekingThunder';
            const tracker = ctx.buffUptime[buffKey];
            if (tracker && tracker.activationTimes.length > 0) {
                const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (lastActivation && lastActivation.end === null) {
                    lastActivation.end = ctx.currentTime;
                    lastActivation.duration = lastActivation.end - lastActivation.start;
                    lastActivation.endReason = 'expired';
                }
            }
        }
        
        state.active = false;
        state.charges = 0;
        state.expires = 0;
        
        if (ctx.log) {
            ctx.log('[Seeking Thunder] Expired without being used');
        }
    }
}

// ============================================
// STORMWOLF'S FRENZY (Stormhowl 5pc)
// ============================================

/**
 * Activate Stormwolf's Frenzy buff
 * @param {Object} ctx - Simulation context
 * @returns {Object} Result
 */
export function activateStormwolfFrenzy(ctx) {
    const state = getSetBonusState(ctx, 'stormwolfFrenzy');
    const duration = 12; // 12 seconds
    const wasAlreadyActive = state.active; // Store previous state

    // Calculate strength bonus: 5% of current strength
    const currentStrength = ctx.stats?.strength || 0;
    const strengthBonus = Math.floor(currentStrength * 0.05);

    // If already active, remove old bonus before applying new
    if (state.active && state.strengthBonus > 0) {
        const oldApBonus = state.strengthBonus * 2;
        if (ctx.stats) {
            ctx.stats.attackPower = Math.max(0, (ctx.stats.attackPower || 0) - oldApBonus);
        }
    }

    // Apply strength bonus as AP (1 STR = 2 AP)
    const apBonus = strengthBonus * 2;
    if (ctx.stats) {
        ctx.stats.attackPower = (ctx.stats.attackPower || 0) + apBonus;
    }

    state.active = true;
    state.expires = ctx.currentTime + duration;
    state.strengthBonus = strengthBonus;

    // Recalculate weapon damage (includes AP from strength bonus)
    if (ctx.recalculateWeaponDamage) {
        ctx.recalculateWeaponDamage();
    }

    // Note: Haste is applied automatically via getHasteMultiplier() when scheduling auto attacks

    // Track in buffUptime for timeline display
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = 'stormwolfFrenzy';
        if (!ctx.buffUptime[buffKey]) {
            ctx.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
        }

        // If already active, close the previous activation
        if (ctx.buffUptime[buffKey].activationTimes.length > 0) {
            const lastActivation = ctx.buffUptime[buffKey].activationTimes[ctx.buffUptime[buffKey].activationTimes.length - 1];
            if (lastActivation && lastActivation.end === null) {
                lastActivation.end = ctx.currentTime;
                lastActivation.duration = lastActivation.end - lastActivation.start;
                lastActivation.endReason = 'refreshed';
                ctx.buffUptime[buffKey].refreshes++;
            } else {
                ctx.buffUptime[buffKey].procs++;
            }
        } else {
            ctx.buffUptime[buffKey].procs++;
        }

        ctx.buffUptime[buffKey].activationTimes.push({
            start: ctx.currentTime,
            end: null,
            duration: null,
            endReason: null,
            triggerSource: 'Auto Attack',
            triggerIcon: null // Timeline will use default auto attack icon
        });
    }

    // Schedule expiration
    if (ctx.scheduleEvent) {
        // Cancel existing expiration first
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent('stormwolfFrenzyExpire');
        }

        ctx.scheduleEvent(state.expires, 'buffExpire', () => {
            expireStormwolfFrenzy(ctx);
        }, 'stormwolfFrenzyExpire');
    }

    if (ctx.log) {
        ctx.log(`[Stormwolf's Frenzy] Activated: +10% attack speed, +${strengthBonus} STR (+${apBonus} AP) for ${duration}s`);
    }

    return { success: true, strengthBonus, apBonus, expires: state.expires };
}

/**
 * Check if Stormwolf's Frenzy is active
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isStormwolfFrenzyActive(ctx) {
    const state = getSetBonusState(ctx, 'stormwolfFrenzy');
    return state.active && state.expires > ctx.currentTime;
}

/**
 * Expire Stormwolf's Frenzy buff
 * @param {Object} ctx - Simulation context
 */
function expireStormwolfFrenzy(ctx) {
    const state = getSetBonusState(ctx, 'stormwolfFrenzy');

    if (state.active) {
        // Remove strength bonus
        if (state.strengthBonus > 0 && ctx.stats) {
            const apBonus = state.strengthBonus * 2;
            ctx.stats.attackPower = Math.max(0, (ctx.stats.attackPower || 0) - apBonus);

            if (ctx.recalculateWeaponDamage) {
                ctx.recalculateWeaponDamage();
            }
        }

        // Note: Haste is removed automatically via getHasteMultiplier() when scheduling next auto attack

        // Track expiration in buffUptime
        const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
        if (!isQuickSim && ctx.buffUptime) {
            const buffKey = 'stormwolfFrenzy';
            const tracker = ctx.buffUptime[buffKey];
            if (tracker && tracker.activationTimes.length > 0) {
                const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (lastActivation && lastActivation.end === null) {
                    lastActivation.end = ctx.currentTime;
                    lastActivation.duration = lastActivation.end - lastActivation.start;
                    lastActivation.endReason = 'expired';
                }
            }
        }

        state.active = false;
        state.expires = 0;
        state.strengthBonus = 0;

        if (ctx.log) {
            ctx.log("[Stormwolf's Frenzy] Buff expired");
        }
    }
}

/**
 * Get haste multiplier from Stormwolf's Frenzy
 * @param {Object} ctx - Simulation context
 * @returns {number} Haste multiplier (1.10 if active, 1.0 otherwise)
 */
export function getStormwolfFrenzyHaste(ctx) {
    return isStormwolfFrenzyActive(ctx) ? 1.10 : 1.0;
}

// ============================================
// STORMWOLF'S CUNNING (Stormhowl Garb 5pc)
// ============================================

const STORMWOLF_CUNNING_DURATION = 12;
const STORMWOLF_CUNNING_SPELL_HASTE = 0.10; // 10%

/**
 * Activate Stormwolf's Cunning buff (triggered by Elemental Mastery)
 * @param {Object} ctx - Simulation context
 * @returns {Object} Result
 */
export function activateStormwolfCunning(ctx) {
    const state = getSetBonusState(ctx, 'stormwolfCunning');
    const wasActive = state.active;

    state.active = true;
    state.expires = ctx.currentTime + STORMWOLF_CUNNING_DURATION;

    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = 'stormwolfCunning';
        if (!ctx.buffUptime[buffKey]) {
            ctx.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
        }

        if (wasActive && ctx.buffUptime[buffKey].activationTimes.length > 0) {
            const last = ctx.buffUptime[buffKey].activationTimes[ctx.buffUptime[buffKey].activationTimes.length - 1];
            if (last && last.end === null) {
                last.end = ctx.currentTime;
                last.duration = last.end - last.start;
                last.endReason = 'refreshed';
                ctx.buffUptime[buffKey].refreshes++;
            }
        } else {
            ctx.buffUptime[buffKey].procs++;
        }

        ctx.buffUptime[buffKey].activationTimes.push({
            start: ctx.currentTime,
            end: null,
            duration: null,
            endReason: null,
            triggerSource: 'Elemental Mastery',
            triggerIcon: 'spell_nature_wispheal'
        });
    }

    if (ctx.scheduleEvent) {
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent('stormwolfCunningExpire');
        }
        ctx.scheduleEvent(state.expires, 'buffExpire', () => {
            expireStormwolfCunning(ctx);
        }, 'stormwolfCunningExpire');
    }

    if (ctx.log) {
        ctx.log(`[Stormwolf's Cunning] Activated: +10% spell haste for ${STORMWOLF_CUNNING_DURATION}s`);
    }

    return { success: true, expires: state.expires };
}

/**
 * Refresh Stormwolf's Cunning duration (triggered by nature spell crit)
 * @param {Object} ctx - Simulation context
 * @param {string} source - Spell that triggered the refresh
 */
export function refreshStormwolfCunning(ctx, source) {
    const state = getSetBonusState(ctx, 'stormwolfCunning');
    if (!state.active) return;

    state.expires = ctx.currentTime + STORMWOLF_CUNNING_DURATION;

    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = 'stormwolfCunning';
        const tracker = ctx.buffUptime[buffKey];
        if (tracker && tracker.activationTimes.length > 0) {
            const last = tracker.activationTimes[tracker.activationTimes.length - 1];
            if (last && last.end === null) {
                last.end = ctx.currentTime;
                last.duration = last.end - last.start;
                last.endReason = 'refreshed';
                tracker.refreshes++;
            }
        }
        if (!tracker) {
            ctx.buffUptime[buffKey] = { procs: 0, refreshes: 1, activationTimes: [] };
        }
        ctx.buffUptime[buffKey].activationTimes.push({
            start: ctx.currentTime,
            end: null,
            duration: null,
            endReason: null,
            triggerSource: source,
            triggerIcon: null
        });
    }

    if (ctx.scheduleEvent) {
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent('stormwolfCunningExpire');
        }
        ctx.scheduleEvent(state.expires, 'buffExpire', () => {
            expireStormwolfCunning(ctx);
        }, 'stormwolfCunningExpire');
    }

    if (ctx.log) {
        ctx.log(`[Stormwolf's Cunning] Refreshed by ${source} crit (${STORMWOLF_CUNNING_DURATION}s)`);
    }
}

/**
 * Check if Stormwolf's Cunning is active
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isStormwolfCunningActive(ctx) {
    const state = getSetBonusState(ctx, 'stormwolfCunning');
    return state.active && state.expires > ctx.currentTime;
}

/**
 * Get spell haste multiplier from Stormwolf's Cunning
 * @param {Object} ctx - Simulation context
 * @returns {number} 1.10 if active, 1.0 otherwise
 */
export function getStormwolfCunningSpellHaste(ctx) {
    return isStormwolfCunningActive(ctx) ? (1 + STORMWOLF_CUNNING_SPELL_HASTE) : 1.0;
}

/**
 * Expire Stormwolf's Cunning buff
 * @param {Object} ctx - Simulation context
 */
function expireStormwolfCunning(ctx) {
    const state = getSetBonusState(ctx, 'stormwolfCunning');

    if (state.active) {
        const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
        if (!isQuickSim && ctx.buffUptime) {
            const buffKey = 'stormwolfCunning';
            const tracker = ctx.buffUptime[buffKey];
            if (tracker && tracker.activationTimes.length > 0) {
                const last = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (last && last.end === null) {
                    last.end = ctx.currentTime;
                    last.duration = last.end - last.start;
                    last.endReason = 'expired';
                }
            }
        }

        state.active = false;
        state.expires = 0;

        if (ctx.log) {
            ctx.log("[Stormwolf's Cunning] Buff expired");
        }
    }
}

// ============================================
// CRACKLING THUNDER (Totem of Crackling Thunder)
// ============================================

const CRACKLING_THUNDER_DURATION = 8;
const CRACKLING_THUNDER_HASTE = 0.08; // 8%

/**
 * Activate Crackling Thunder haste buff
 * @param {Object} ctx - Simulation context
 * @param {string} source - Ability that triggered the proc
 * @returns {Object} Result
 */
export function activateCracklingThunder(ctx, source) {
    const state = getSetBonusState(ctx, 'cracklingThunder');
    const wasActive = state.active && state.expires > ctx.currentTime;

    state.active = true;
    state.expires = ctx.currentTime + CRACKLING_THUNDER_DURATION;

    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = 'cracklingThunder';
        if (!ctx.buffUptime[buffKey]) {
            ctx.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
        }

        if (wasActive && ctx.buffUptime[buffKey].activationTimes.length > 0) {
            const last = ctx.buffUptime[buffKey].activationTimes[ctx.buffUptime[buffKey].activationTimes.length - 1];
            if (last && last.end === null) {
                last.end = ctx.currentTime;
                last.duration = last.end - last.start;
                last.endReason = 'refreshed';
                ctx.buffUptime[buffKey].refreshes++;
            }
        } else {
            ctx.buffUptime[buffKey].procs++;
        }

        ctx.buffUptime[buffKey].activationTimes.push({
            start: ctx.currentTime,
            end: null,
            duration: null,
            endReason: null,
            triggerSource: source,
            triggerIcon: null
        });
    }

    if (ctx.scheduleEvent) {
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent('cracklingThunderExpire');
        }
        ctx.scheduleEvent(state.expires, 'buffExpire', () => {
            expireCracklingThunder(ctx);
        }, 'cracklingThunderExpire');
    }

    if (ctx.log) {
        const action = wasActive ? 'Refreshed' : 'Activated';
        ctx.log(`[Crackling Thunder] ${action} by ${source}: +8% attack & casting speed for ${CRACKLING_THUNDER_DURATION}s`);
    }

    return { success: true, expires: state.expires };
}

/**
 * Check if Crackling Thunder is active
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isCracklingThunderActive(ctx) {
    const state = getSetBonusState(ctx, 'cracklingThunder');
    return state.active && state.expires > ctx.currentTime;
}

/**
 * Get haste multiplier from Crackling Thunder (applies to both melee and spell)
 * @param {Object} ctx - Simulation context
 * @returns {number} 1.08 if active, 1.0 otherwise
 */
export function getCracklingThunderHaste(ctx) {
    return isCracklingThunderActive(ctx) ? (1 + CRACKLING_THUNDER_HASTE) : 1.0;
}

/**
 * Expire Crackling Thunder buff
 * @param {Object} ctx - Simulation context
 */
function expireCracklingThunder(ctx) {
    const state = getSetBonusState(ctx, 'cracklingThunder');

    if (state.active) {
        const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
        if (!isQuickSim && ctx.buffUptime) {
            const buffKey = 'cracklingThunder';
            const tracker = ctx.buffUptime[buffKey];
            if (tracker && tracker.activationTimes.length > 0) {
                const last = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (last && last.end === null) {
                    last.end = ctx.currentTime;
                    last.duration = last.end - last.start;
                    last.endReason = 'expired';
                }
            }
        }

        state.active = false;
        state.expires = 0;

        if (ctx.log) {
            ctx.log('[Crackling Thunder] Buff expired');
        }
    }
}

// ============================================
// TOWERFORGE FURY (Towerforge Battlegear 4pc)
// ============================================

const TOWERFORGE_FURY_STRENGTH = 50;
const TOWERFORGE_FURY_DURATION = 10;
const TOWERFORGE_FURY_AP = TOWERFORGE_FURY_STRENGTH * 2; // 1 STR = 2 AP

/**
 * Activate Towerforge Fury buff (+50 Strength for 10s)
 * @param {Object} ctx - Simulation context
 * @param {string} [source='Melee Hit'] - Ability that triggered the proc
 * @returns {Object} Result
 */
export function activateTowerforgeFury(ctx, source = 'Melee Hit') {
    const state = getSetBonusState(ctx, 'towerforgeFury');

    // If already active, remove old AP bonus before refreshing
    if (state.active && ctx.stats) {
        ctx.stats.attackPower = Math.max(0, (ctx.stats.attackPower || 0) - TOWERFORGE_FURY_AP);
    }

    // Apply +50 STR as +100 AP
    if (ctx.stats) {
        ctx.stats.attackPower = (ctx.stats.attackPower || 0) + TOWERFORGE_FURY_AP;
    }

    state.active = true;
    state.expires = ctx.currentTime + TOWERFORGE_FURY_DURATION;

    if (ctx.recalculateWeaponDamage) {
        ctx.recalculateWeaponDamage();
    }

    // Track in buffUptime for timeline display
    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        const buffKey = 'towerforgeFury';
        if (!ctx.buffUptime[buffKey]) {
            ctx.buffUptime[buffKey] = { procs: 0, refreshes: 0, activationTimes: [] };
        }

        if (ctx.buffUptime[buffKey].activationTimes.length > 0) {
            const lastActivation = ctx.buffUptime[buffKey].activationTimes[ctx.buffUptime[buffKey].activationTimes.length - 1];
            if (lastActivation && lastActivation.end === null) {
                lastActivation.end = ctx.currentTime;
                lastActivation.duration = lastActivation.end - lastActivation.start;
                lastActivation.endReason = 'refreshed';
                ctx.buffUptime[buffKey].refreshes++;
            } else {
                ctx.buffUptime[buffKey].procs++;
            }
        } else {
            ctx.buffUptime[buffKey].procs++;
        }

        ctx.buffUptime[buffKey].activationTimes.push({
            start: ctx.currentTime,
            end: null,
            duration: null,
            endReason: null,
            triggerSource: source,
            triggerIcon: null
        });
    }

    // Schedule expiration
    if (ctx.scheduleEvent) {
        if (ctx.unscheduleEvent) {
            ctx.unscheduleEvent('towerforgeFuryExpire');
        }
        ctx.scheduleEvent(state.expires, 'buffExpire', () => {
            expireTowerforgeFury(ctx);
        }, 'towerforgeFuryExpire');
    }

    if (ctx.log) {
        ctx.log(`[Towerforge Fury] Activated: +${TOWERFORGE_FURY_STRENGTH} STR (+${TOWERFORGE_FURY_AP} AP) for ${TOWERFORGE_FURY_DURATION}s`);
    }

    return { success: true, expires: state.expires };
}

/**
 * Check if Towerforge Fury is active
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
export function isTowerforgeFuryActive(ctx) {
    const state = getSetBonusState(ctx, 'towerforgeFury');
    return state.active && state.expires > ctx.currentTime;
}

/**
 * Expire Towerforge Fury buff
 * @param {Object} ctx - Simulation context
 */
function expireTowerforgeFury(ctx) {
    const state = getSetBonusState(ctx, 'towerforgeFury');

    if (state.active) {
        if (ctx.stats) {
            ctx.stats.attackPower = Math.max(0, (ctx.stats.attackPower || 0) - TOWERFORGE_FURY_AP);
        }

        if (ctx.recalculateWeaponDamage) {
            ctx.recalculateWeaponDamage();
        }

        const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
        if (!isQuickSim && ctx.buffUptime) {
            const buffKey = 'towerforgeFury';
            const tracker = ctx.buffUptime[buffKey];
            if (tracker && tracker.activationTimes.length > 0) {
                const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
                if (lastActivation && lastActivation.end === null) {
                    lastActivation.end = ctx.currentTime;
                    lastActivation.duration = lastActivation.end - lastActivation.start;
                    lastActivation.endReason = 'expired';
                }
            }
        }

        state.active = false;
        state.expires = 0;

        if (ctx.log) {
            ctx.log('[Towerforge Fury] Buff expired');
        }
    }
}

// ============================================
// MIGHT OF THE HIPPOGRYPH (3pc)
// ============================================

const HIPPOGRYPH_MIGHT_PPM = 1.2;
const HIPPOGRYPH_MIGHT_DURATION_SEC = 8;
const HIPPOGRYPH_MIGHT_HASTE_PERCENT = 20;
const HIPPOGRYPH_MIGHT_MAX_CHARGES = 2;

function getHippogryphMightProcChance(ctx) {
    const bws = ctx.stats?.baseWeaponSpeed || ctx.stats?.weaponSpeed || 2.0;
    return Math.min(1, (bws * HIPPOGRYPH_MIGHT_PPM) / 60);
}

function clearHippogryphMightBuff(ctx, endReason) {
    const state = getSetBonusState(ctx, 'hippogryphMight');
    if (!state.active) return;

    if (ctx.unscheduleEvent) {
        ctx.unscheduleEvent('hippogryphMightExpire');
    }

    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime?.hippogryphMight?.activationTimes?.length) {
        const last = ctx.buffUptime.hippogryphMight.activationTimes[
            ctx.buffUptime.hippogryphMight.activationTimes.length - 1
        ];
        if (last && last.end === null) {
            last.end = ctx.currentTime;
            last.duration = last.end - last.start;
            last.endReason = endReason || 'ended';
        }
    }

    state.active = false;
    state.charges = 0;
    state.expires = 0;

    ctx.log?.(`[Hippogryph 3pc] Might buff ended (${endReason || 'ended'})`);
}

/** Sources that remove one Might charge (2 total per buff). Hand of Justice and other extras do not. */
function hippogryphMightSourceConsumesCharge(source) {
    return source === 'Auto Attack'
        || source === 'Windfury Attack'
        || source === 'Stormstrike'
        || source === 'Lightning Strike';
}

/**
 * Buff is up with time/charges remaining (may clear on expiry).
 */
function isHippogryphMightBuffActiveForBonusNature(ctx) {
    const state = getSetBonusState(ctx, 'hippogryphMight');
    if (!state.active || state.charges <= 0) return false;
    if (state.expires && ctx.currentTime >= state.expires) {
        clearHippogryphMightBuff(ctx, 'duration');
        return false;
    }
    return true;
}

/**
 * Consume one Hippogryph Might charge on Auto Attack, Windfury extra hits, Stormstrike, or Lightning Strike (physical hit).
 * One Windfury proc = 2 extra attacks = 2 charges. Hand of Justice does not consume.
 */
export function consumeHippogryphMightCharge(ctx, source) {
    if (!ctx.stats?.setBonuses?.hippogryph_3pc_might) return false;
    if (!hippogryphMightSourceConsumesCharge(source)) return false;

    const state = getSetBonusState(ctx, 'hippogryphMight');
    if (!state.active || state.charges <= 0) return false;
    if (state.expires && ctx.currentTime >= state.expires) {
        clearHippogryphMightBuff(ctx, 'duration');
        return false;
    }

    state.charges--;
    ctx.log?.(`[Hippogryph 3pc] Might charge consumed (${source}); ${state.charges} left`);

    if (state.charges <= 0) {
        clearHippogryphMightBuff(ctx, 'charges_depleted');
    }
    return true;
}

function activateHippogryphMightBuff(ctx, source) {
    const state = getSetBonusState(ctx, 'hippogryphMight');

    if (state.active && ctx.unscheduleEvent) {
        ctx.unscheduleEvent('hippogryphMightExpire');
    }

    state.active = true;
    state.charges = HIPPOGRYPH_MIGHT_MAX_CHARGES;
    state.hastePercent = HIPPOGRYPH_MIGHT_HASTE_PERCENT;
    state.expires = ctx.currentTime + HIPPOGRYPH_MIGHT_DURATION_SEC;

    const isQuickSim = ctx.simContext?.quickSim || ctx.quickSim || false;
    if (!isQuickSim && ctx.buffUptime) {
        if (!ctx.buffUptime.hippogryphMight) {
            ctx.buffUptime.hippogryphMight = { procs: 0, refreshes: 0, activationTimes: [] };
        }
        const tr = ctx.buffUptime.hippogryphMight;
        if (tr.activationTimes.length > 0) {
            const last = tr.activationTimes[tr.activationTimes.length - 1];
            if (last && last.end === null) {
                last.end = ctx.currentTime;
                last.duration = last.end - last.start;
                last.endReason = 'refreshed';
                tr.refreshes++;
            } else {
                tr.procs++;
            }
        } else {
            tr.procs++;
        }
        tr.activationTimes.push({
            start: ctx.currentTime,
            end: null,
            duration: null,
            endReason: null,
            triggerSource: source,
            triggerIcon: null
        });
    }

    if (ctx.scheduleEvent) {
        ctx.scheduleEvent(state.expires, 'buffExpire', () => {
            const st = getSetBonusState(ctx, 'hippogryphMight');
            if (st.active && ctx.currentTime >= st.expires - 0.001) {
                clearHippogryphMightBuff(ctx, 'duration');
            }
        }, 'hippogryphMightExpire');
    }

    ctx.log?.(
        `[Hippogryph 3pc] +${HIPPOGRYPH_MIGHT_HASTE_PERCENT}% attack speed, ${HIPPOGRYPH_MIGHT_MAX_CHARGES} attacks / ${HIPPOGRYPH_MIGHT_DURATION_SEC}s (${source})`
    );
}

/** PPM success: haste + 2 charges only — no instant Nature damage. */
function processHippogryphMightProcActivate(ctx, source) {
    activateHippogryphMightBuff(ctx, source);
    ctx.log?.(
        `[Hippogryph 3pc] Might buff from PPM (${source}) — +${HIPPOGRYPH_MIGHT_HASTE_PERCENT}% haste; 150 Nature on melee hits until ${HIPPOGRYPH_MIGHT_MAX_CHARGES} charges removed (Auto / WF / SS / LS)`
    );
}

/**
 * 150 Nature rider on a successful melee hit while Might has charges (any `processMeleeHit` source).
 */
function dealHippogryphMightBonusNatureDamage(ctx, source) {
    const spell = shamanSpells.hippogryphMightNature;
    if (!spell || typeof ctx.rollDamage !== 'function') return null;

    const damageResult = calculateSpellDamage(spell, ctx.stats, ctx);
    const outcome = ctx.rollDamage(spell, damageResult, false);
    const hIcon = spell.icon;

    if (ctx.recordDamage) {
        ctx.recordDamage('Might of the Hippogryph', outcome.damage, {
            type: 'set_bonus',
            outcome: outcome.type,
            resistType: outcome.resistType || 'none',
            icon: hIcon,
            school: 'nature'
        });
    }

    if (outcome.didHit && outcome.type !== 'immune' && outcome.type !== 'miss') {
        fireSpellHitTriggers(ctx, 'Might of the Hippogryph', hIcon, {
            didHit: true,
            isCrit: !!outcome.isCrit,
            damage: outcome.damage,
            school: 'nature'
        });
    }

    ctx.log?.(`[Hippogryph 3pc] bonus nature (${source}): ${outcome.damage.toFixed(1)} (${outcome.type})`);
    return outcome;
}

// ============================================
// PROC TRIGGERS
// ============================================

/**
 * Garb of the Ten Storms 5pc: shocks / Lightning Bolt can proc Lightning Shield without consuming a charge (data-driven chances on ctx.stats.setBonuses).
 * @param {Object} ctx
 * @param {string} abilityKey
 * @param {Object} outcome
 */
export function tryGarbTenStormsLightningShieldProc(ctx, abilityKey, outcome) {
    if (!outcome?.didHit || !ctx.rng) return;

    const sb = ctx.stats?.setBonuses;
    let procChance = 0;
    let sourceName = '';

    if (['flameShock', 'earthShock', 'frostShock'].includes(abilityKey)) {
        procChance = sb?.garb_ten_storms_5pc_shock_ls_chance || 0;
        sourceName = shamanSpells[abilityKey]?.name || abilityKey;
    } else if (abilityKey === 'lightningBolt') {
        procChance = sb?.garb_ten_storms_5pc_lightning_bolt_ls_chance || 0;
        sourceName = shamanSpells.lightningBolt?.name || 'Lightning Bolt';
    } else {
        return;
    }

    if (!procChance || ctx.rng.random() >= procChance) return;

    const charges = ctx.getLightningShieldCharges?.() || ctx.lightningShieldCharges || 0;
    if (charges <= 0) return;

    triggerLightningShield(ctx, `${sourceName} (Garb 5pc)`, { consumeCharge: false });
    ctx.log?.(`[Garb 5pc] ${sourceName} triggered Lightning Shield (no charge consumed)`);
}

/**
 * Garb of the Ten Storms 8pc: Lightning Bolt echo (damage mult + ICD from setBonuses).
 * @param {Object} ctx
 * @param {Object} outcome - Lightning Bolt hit outcome (uses outcome.damage after resist)
 */
export function processGarbTenStorms8pcLightningBoltEcho(ctx, outcome) {
    if (!outcome?.didHit || !ctx.rng) return;

    const chance = ctx.stats?.setBonuses?.garb_ten_storms_8pc_lb_echo_chance;
    if (!chance) return;

    const icd = ctx.stats?.setBonuses?.garb_ten_storms_8pc_lb_echo_icd ?? 3;
    const mult = ctx.stats?.setBonuses?.garb_ten_storms_8pc_lb_echo_damage_mult ?? 0.5;

    if (ctx.rng.random() >= chance) return;

    const until = ctx._garbTenStorms8pcEchoIcdUntil || 0;
    if (ctx.currentTime < until) return;

    ctx._garbTenStorms8pcEchoIcdUntil = ctx.currentTime + icd;

    const echoDamage = Math.round((outcome.damage || 0) * mult);
    if (echoDamage <= 0) return;

    if (ctx.recordDamage) {
        ctx.recordDamage('Lightning Bolt (Garb 8pc)', echoDamage, {
            type: 'set_bonus',
            outcome: 'hit',
            resistType: 'none',
            school: 'nature'
        });
    }
    ctx.log?.(`[Garb 8pc] Lightning Bolt echo: ${echoDamage} nature (${Math.round(mult * 100)}% of hit)`);
}

/**
 * Earthshatterer's Battlegear 8pc: 20% chance on Stormstrike or Lightning Strike hit to reset shared Shock CD (Earth/Frost/Flame).
 * @param {Object} ctx - Simulator (`this`); must have `cooldowns`, `rng`, `stats.setBonuses`, `log`.
 * @param {string} abilityKey - `stormstrike` | `lightningStrike`
 * @returns {boolean} Whether shocks were reset
 */
export function tryEarthshatterer8pcShockCooldownReset(ctx, abilityKey) {
    if (abilityKey !== 'stormstrike' && abilityKey !== 'lightningStrike') return false;
    const chance = ctx.stats?.setBonuses?.earthshatter_8pc_shock_cooldown_reset_chance;
    if (!chance || !ctx.rng) return false;
    if (ctx.rng.random() >= chance) return false;
    if (!ctx.cooldowns || typeof ctx.cooldowns !== 'object') return false;
    ctx.cooldowns.shocks = 0;
    const name = abilityKey === 'stormstrike' ? 'Stormstrike' : 'Lightning Strike';
    ctx.log?.(`[Earthshatter 8pc] ${name} reset Shock cooldowns (${Math.round(chance * 100)}% proc)`);
    return true;
}

/**
 * Process set bonus effects on ability hit
 * @param {Object} ctx - Simulation context
 * @param {string} abilityKey - Ability that hit
 * @param {Object} outcome - Hit outcome
 * @returns {Object} Results of any triggered effects
 */
export function processAbilityHit(ctx, abilityKey, outcome) {
    const results = {};

    if (!outcome.didHit) return results;

    // T2 5pc: Lightning Strike activates Echoed Thunder
    if (abilityKey === 'lightningStrike' && ctx.stats?.setBonuses?.battlegear_ten_storms_5pc_echoed_thunder) {
        if (!isEchoedThunderActive(ctx)) {
            activateEchoedThunder(ctx);
            results.echoedThunder = true;
        }
    }

    // T2 8pc: Stormstrike 50% chance for Instant LB
    if (abilityKey === 'stormstrike' && ctx.stats?.setBonuses?.battlegear_ten_storms_8pc_lightning_bolt_proc) {
        const procChance = ctx.stats.setBonuses.battlegear_ten_storms_8pc_lightning_bolt_proc;
        if (ctx.rng && ctx.rng.random() < procChance) {
            activateInstantLightningBolt(ctx);
            results.instantLightningBolt = true;
        }
    }

    // Earthshatterer's Battlegear 8pc: SS / LS hit → 20% reset shared Shock cooldown
    if ((abilityKey === 'stormstrike' || abilityKey === 'lightningStrike') &&
        ctx.stats?.setBonuses?.earthshatter_8pc_shock_cooldown_reset_chance) {
        if (tryEarthshatterer8pcShockCooldownReset(ctx, abilityKey)) {
            results.earthshatter8pcShockReset = true;
        }
    }

    // Garb 5pc: shocks + Lightning Bolt → LS (no charge); Garb 8pc: LB echo
    if (['flameShock', 'earthShock', 'frostShock', 'lightningBolt'].includes(abilityKey)) {
        tryGarbTenStormsLightningShieldProc(ctx, abilityKey, outcome);
    }
    if (abilityKey === 'lightningBolt') {
        processGarbTenStorms8pcLightningBoltEcho(ctx, outcome);
    }

    // Stormhowl Garb 5pc: nature spell crit refreshes Stormwolf's Cunning
    if (outcome.isCrit && ctx.stats?.setBonuses?.stormhowl_garb_5pc_stormwolf_cunning) {
        const NATURE_SPELLS = ['earthShock', 'lightningBolt', 'chainLightning', 'lightningStrike', 'earthquake'];
        if (NATURE_SPELLS.includes(abilityKey) && isStormwolfCunningActive(ctx)) {
            const spellName = shamanSpells[abilityKey]?.name || abilityKey;
            refreshStormwolfCunning(ctx, spellName);
            results.stormwolfCunningRefreshed = true;
        }
    }

    // Totem of Crackling Thunder: LB 10% / LS 15% chance for +8% haste
    if (outcome.didHit && (ctx.simContext?.hasCracklingThunder || ctx.stats?.hasCracklingThunder)) {
        let procChance = 0;
        if (abilityKey === 'lightningBolt') procChance = 0.10;
        else if (abilityKey === 'lightningStrike') procChance = 0.15;

        if (procChance > 0 && ctx.rng && ctx.rng.random() < procChance) {
            const spellName = shamanSpells[abilityKey]?.name || abilityKey;
            activateCracklingThunder(ctx, spellName);
            results.cracklingThunder = true;
        }
    }

    return results;
}

/**
 * Process set bonus effects on melee hit
 * Called after each successful melee hit to check for set bonus procs.
 * This function fully executes all triggered effects (ELS, Stormwolf, Incendosaur).
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - Ability name that triggered this (for logging)
 * @param {Object} outcome - Attack outcome { didHit, isCrit, damage }
 * @returns {Object} Results of any triggered effects
 */
export function processMeleeHit(ctx, source, outcome) {
    const results = {};
    
    if (!outcome.didHit) return results;

    // Might of the Hippogryph 3pc: 150 Nature on every successful melee hit while buff has charges; charges drop on Auto / WF / SS / LS; then 1.2 PPM for buff
    if (ctx.stats?.setBonuses?.hippogryph_3pc_might) {
        if (isHippogryphMightBuffActiveForBonusNature(ctx)) {
            results.hippogryphMightBonusNature = dealHippogryphMightBonusNatureDamage(ctx, source);
        }
        consumeHippogryphMightCharge(ctx, source);
        const ppmChance = getHippogryphMightProcChance(ctx);
        if (ctx.rng && ctx.rng.random() < ppmChance) {
            processHippogryphMightProcActivate(ctx, source);
            results.hippogryphMightProc = true;
        }
    }
    
    // Stormhowl 3pc: 15% chance for ELS on melee hit
    // Note: Does NOT consume LS charge, but DOES consume Stormstrike charge
    if (ctx.stats?.setBonuses?.stormhowl_3pc_empowered_ls_chance) {
        const procChance = ctx.stats.setBonuses.stormhowl_3pc_empowered_ls_chance;
        if (ctx.rng && ctx.rng.random() < procChance) {
            // Check LS charges from multiple possible sources
            const charges = ctx.getLightningShieldCharges?.() || 
                           ctx.lightningShieldCharges || 
                           ctx._lightningShieldStates?.lightningShield?.charges || 0;
            if (charges > 0) {
                // Trigger ELS - does NOT consume LS charge, but DOES consume SS charge
                triggerEmpoweredLightningShield(ctx, `${source} (Stormhowl 3pc)`, true);
                ctx.log?.(`[Stormhowl 3pc] ${source} triggered Empowered Lightning Shield`);
                results.stormhowl3pc = true;
            }
        }
    }
    
    // NOTE: Stormhowl 5pc (Stormwolf's Frenzy) is handled in processAutoAttackSetBonuses()
    // as it only procs on auto attacks, not all melee hits
    
    // Incendosaur 3pc: Fire damage proc
    if (ctx.stats?.setBonuses?.incendosaur_3pc_melee_fire_proc) {
        if (ctx.rng && ctx.rng.random() < 0.05) {
            results.incendosaurProc = processIncendosaurProc(ctx);
        }
    }
    
    // Towerforge Battlegear 4pc: 2% chance for +50 STR for 10s
    if (ctx.stats?.setBonuses?.towerforge_4pc_strength_proc) {
        if (ctx.rng && ctx.rng.random() < 0.02) {
            activateTowerforgeFury(ctx, source);
            results.towerforgeFury = true;
        }
    }
    
    return results;
}

/**
 * Process Incendosaur 3pc Spellstrike proc
 * 15-26 fire damage, treated as a spellstrike (triggers WoC, OBD, etc.)
 * @param {Object} ctx - Simulation context
 * @returns {Object} Damage result
 */
function processIncendosaurProc(ctx) {
    const damageMin = 15;
    const damageMax = 26;
    let damage = damageMin + (ctx.rng?.random() || Math.random()) * (damageMax - damageMin);
    
    // Roll for resistance
    let resistType = 'none';
    if (ctx.rollForResistance) {
        const resistResult = ctx.rollForResistance('fire');
        damage *= resistResult.multiplier;
        resistType = resistResult.type;
    }
    
    if (ctx.recordDamage) {
        ctx.recordDamage('Incendosaur Spellstrike', damage, {
            type: 'set_bonus',
            outcome: resistType === 'full_resist' ? 'full_resist' : 'hit',
            resistType,
            isSpellstrike: true // Triggers spell hit procs
        });
    }
    
    if (ctx.log) {
        ctx.log(`[Incendosaur 3pc] Spellstrike: ${damage.toFixed(2)} fire damage`);
    }
    
    return { damage, resistType, isSpellstrike: true };
}

/**
 * Process set bonus effects on auto attack specifically
 * Called after each auto attack to check for auto-attack-only procs.
 * 
 * @param {Object} ctx - Simulation context
 * @param {Object} outcome - Attack outcome { didHit, isCrit, damage }
 * @returns {Object} Results of any triggered effects
 */
export function processAutoAttackSetBonuses(ctx, outcome) {
    const results = {};

    if (!outcome.didHit) return results;

    // Stormhowl 5pc: 10% chance for Stormwolf's Frenzy on AUTO ATTACK
    if (ctx.stats?.setBonuses?.stormhowl_5pc_stormwolf_frenzy) {
        const roll = ctx.rng ? ctx.rng.random() : Math.random();
        if (roll < 0.10) {
            activateStormwolfFrenzy(ctx);
            results.stormwolfFrenzy = true;
        }
    }

    return results;
}

/**
 * Get DOT duration bonus from set bonuses
 * @param {Object} ctx - Simulation context
 * @param {string} dotKey - DOT spell key
 * @returns {number} Duration bonus in seconds
 */
export function getDotDurationBonus(ctx, dotKey) {
    let bonus = 0;
    
    // T2 3pc (Garb of the Ten Storms): +6s Flame Shock duration
    if (dotKey === 'flameShockDot' && ctx.stats?.setBonuses?.garb_ten_storms_3pc_flame_shock_dot_duration) {
        bonus += ctx.stats.setBonuses.garb_ten_storms_3pc_flame_shock_dot_duration;
    }
    
    return bonus;
}

// ============================================
// EXPORTS
// ============================================

export default {
    initializeSetBonusStates,
    getSetBonusState,
    getCooldownReduction,
    getReducedCooldown,
    activateEchoedThunder,
    isEchoedThunderActive,
    consumeEchoedThunder,
    activateInstantLightningBolt,
    isInstantLightningBoltActive,
    consumeInstantLightningBolt,
    activateStormwolfFrenzy,
    isStormwolfFrenzyActive,
    getStormwolfFrenzyHaste,
    activateStormwolfCunning,
    refreshStormwolfCunning,
    isStormwolfCunningActive,
    getStormwolfCunningSpellHaste,
    activateCracklingThunder,
    isCracklingThunderActive,
    getCracklingThunderHaste,
    activateTowerforgeFury,
    isTowerforgeFuryActive,
    processAbilityHit,
    tryGarbTenStormsLightningShieldProc,
    processGarbTenStorms8pcLightningBoltEcho,
    processMeleeHit,
    processAutoAttackSetBonuses,
    getDotDurationBonus
};
