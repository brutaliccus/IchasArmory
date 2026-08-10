/**
 * Trinket System Module
 * 
 * @module sim/trinketSystem
 * @description Handles on-use trinket activation, cooldown tracking, and buff management.
 * 
 * ## Overview
 * This module manages on-use trinkets:
 * - Activation and effect application
 * - Cooldown tracking
 * - Buff duration and expiration
 * - Uptime recording for UI timelines
 * 
 * ## Supported Trinkets
 * - Natural Alignment Crystal (+20% spell damage, 20s, 5min CD)
 * - Shard of the Fallen Star (fire damage, 3min CD)
 * - Eye of Diminution (-35% threat, 20s, 3min CD)
 * - Kiss of the Spider (+20% haste, 15s, 3min CD)
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { getProcById } from '../gear/procs.js';
import { getAoeMultiplier, getTargetDebuffMultiplier } from './simContext.js';

// ============================================
// TRINKET DEFINITIONS
// ============================================

/**
 * Trinket definitions with default values
 * These are overridden by procs.js definitions when available
 * @constant {Object}
 */
export const TRINKET_DEFINITIONS = {
    natural_alignment_crystal: {
        id: 'natural_alignment_crystal',
        name: 'Natural Alignment Crystal',
        itemId: 19344,
        duration: 20,
        cooldown: 300, // 5 minutes
        effect: {
            type: 'spellDamagePercent',
            value: 0.20 // +20% spell damage
        },
        triggersGCD: false,
        autoReactivate: true // Auto-use on cooldown
    },
    shard_of_the_fallen_star: {
        id: 'shard_of_the_fallen_star',
        name: 'Shard of the Fallen Star',
        itemId: 21891,
        duration: 0, // Instant damage
        cooldown: 180, // 3 minutes
        effect: {
            type: 'damage',
            school: 'fire',
            damageMin: 400,
            damageMax: 443,
            spCoefficient: 0.25
        },
        triggersGCD: false,
        autoReactivate: true
    },
    eye_of_diminution: {
        id: 'eye_of_diminution',
        name: 'Eye of Diminution',
        itemId: 23001,
        duration: 20,
        cooldown: 180, // 3 minutes
        effect: {
            type: 'threatReduction',
            value: 0.35 // -35% threat
        },
        triggersGCD: false,
        autoReactivate: false // Manual control via priority system
    },
    kiss_of_the_spider: {
        id: 'kiss_of_the_spider',
        name: 'Kiss of the Spider',
        itemId: 22954,
        duration: 15,
        cooldown: 180, // 3 minutes
        effect: {
            type: 'hastePercent',
            value: 0.20 // +20% haste
        },
        triggersGCD: false,
        autoReactivate: false // Manual control via priority system
    },
    jom_gabbar: {
        id: 'jom_gabbar',
        name: 'Jom Gabbar',
        itemId: 23570,
        duration: 20,
        cooldown: 120, // 2 minutes (typical use trinket CD)
        effect: {
            type: 'attackPowerRamp',
            initial: 65,
            perTick: 65,
            tickInterval: 2,
            duration: 20,
            maxStacks: 10 // 65 * 10 = 650 at 18s, expires at 20s
        },
        triggersGCD: false,
        autoReactivate: false
    },
    jewel_of_wild_magics: {
        id: 'jewel_of_wild_magics',
        name: 'Jewel of Wild Magics',
        itemId: 55087,
        duration: 0,
        cooldown: 120, // 2 min use CD; effect is random (frost/fire/arcane/holy)
        effect: {
            type: 'jewelOfWildMagics',
            damageMin: 491,
            damageMax: 540,
            spCoefficient: 0.15,
            dotBaseDamage: 100,
            dotSpCoefficient: 0.10,
            dotTickInterval: 2,
            dotDuration: 6,
            arcaneSurgeDuration: 12,
            arcaneSurgeCastSpeedPercent: 3,
            arcaneSurgeSpellPower: 50
        },
        triggersGCD: false,
        autoReactivate: false
    }
};

// ============================================
// STATE MANAGEMENT
// ============================================

/**
 * Trinket state storage key on context
 * @constant {string}
 */
const TRINKET_STATE_KEY = '_trinketStates';

/**
 * Initialize trinket states on context
 * @param {Object} ctx - Simulation context
 */
export function initializeTrinketStates(ctx) {
    if (!ctx[TRINKET_STATE_KEY]) {
        ctx[TRINKET_STATE_KEY] = {};
    }
    
    for (const trinketId of Object.keys(TRINKET_DEFINITIONS)) {
        if (!ctx[TRINKET_STATE_KEY][trinketId]) {
            ctx[TRINKET_STATE_KEY][trinketId] = {
                cooldownReady: 0,
                buffExpires: 0,
                isActive: false,
                activationCount: 0
            };
        }
    }
}

/**
 * Get trinket state
 * @param {Object} ctx - Simulation context
 * @param {string} trinketId - Trinket ID
 * @returns {Object} Trinket state
 */
export function getTrinketState(ctx, trinketId) {
    initializeTrinketStates(ctx);
    return ctx[TRINKET_STATE_KEY][trinketId] || {};
}

/**
 * Get trinket definition with procs.js overrides
 * @param {string} trinketId - Trinket ID
 * @returns {Object} Trinket definition
 */
export function getTrinketDefinition(trinketId) {
    const baseDef = TRINKET_DEFINITIONS[trinketId];
    if (!baseDef) return null;
    
    // Get procs.js override if available
    const procDef = getProcById(trinketId);
    if (procDef) {
        return {
            ...baseDef,
            duration: procDef.duration ?? baseDef.duration,
            cooldown: procDef.cooldown ?? baseDef.cooldown
        };
    }
    
    return baseDef;
}

// ============================================
// AVAILABILITY CHECKS
// ============================================

/**
 * Check if trinket is equipped
 * @param {Object} ctx - Simulation context
 * @param {string} trinketId - Trinket ID
 * @returns {boolean} Whether trinket is equipped
 */
export function hasTrinket(ctx, trinketId) {
    // Check simContext flags
    if (ctx.simContext) {
        switch (trinketId) {
            case 'natural_alignment_crystal':
                if ('hasNaturalAlignmentCrystal' in ctx.simContext) {
                    return !!ctx.simContext.hasNaturalAlignmentCrystal;
                }
                break;
            case 'shard_of_the_fallen_star':
                if ('hasShardOfTheFallenStar' in ctx.simContext) {
                    return !!ctx.simContext.hasShardOfTheFallenStar;
                }
                break;
            case 'eye_of_diminution':
                if ('hasEyeOfDiminution' in ctx.simContext) {
                    return !!ctx.simContext.hasEyeOfDiminution;
                }
                break;
            case 'kiss_of_the_spider':
                if ('hasKissOfTheSpider' in ctx.simContext) {
                    return !!ctx.simContext.hasKissOfTheSpider;
                }
                break;
            case 'jom_gabbar':
                if ('hasJomGabbar' in ctx.simContext) {
                    return !!ctx.simContext.hasJomGabbar;
                }
                break;
            case 'jewel_of_wild_magics':
                if ('hasJewelOfWildMagics' in ctx.simContext) {
                    return !!ctx.simContext.hasJewelOfWildMagics;
                }
                break;
        }
    }
    
    // Check stats flags
    if (ctx.stats) {
        switch (trinketId) {
            case 'natural_alignment_crystal':
                return !!ctx.stats.hasNaturalAlignmentCrystal;
            case 'shard_of_the_fallen_star':
                return !!ctx.stats.hasShardOfTheFallenStar;
            case 'eye_of_diminution':
                return !!ctx.stats.hasEyeOfDiminution;
            case 'kiss_of_the_spider':
                return !!ctx.stats.hasKissOfTheSpider;
            case 'jom_gabbar':
                return !!ctx.stats.hasJomGabbar;
            case 'jewel_of_wild_magics':
                return !!ctx.stats.hasJewelOfWildMagics;
        }
    }
    
    return false;
}

/**
 * Check if trinket is off cooldown
 * @param {Object} ctx - Simulation context
 * @param {string} trinketId - Trinket ID
 * @returns {boolean} Whether trinket is ready
 */
export function isTrinketReady(ctx, trinketId) {
    if (!hasTrinket(ctx, trinketId)) return false;
    
    const state = getTrinketState(ctx, trinketId);
    return ctx.currentTime >= state.cooldownReady;
}

/**
 * Check if trinket buff is active
 * @param {Object} ctx - Simulation context
 * @param {string} trinketId - Trinket ID
 * @returns {boolean} Whether buff is active
 */
export function isTrinketBuffActive(ctx, trinketId) {
    const state = getTrinketState(ctx, trinketId);
    return state.isActive && ctx.currentTime < state.buffExpires;
}

/**
 * Get cooldown remaining
 * @param {Object} ctx - Simulation context
 * @param {string} trinketId - Trinket ID
 * @returns {number} Seconds until ready (0 if ready)
 */
export function getTrinketCooldownRemaining(ctx, trinketId) {
    const state = getTrinketState(ctx, trinketId);
    return Math.max(0, state.cooldownReady - ctx.currentTime);
}

// ============================================
// ACTIVATION HANDLERS
// ============================================

/**
 * Activate a trinket
 * @param {Object} ctx - Simulation context
 * @param {string} trinketId - Trinket ID
 * @param {Object} [options] - Activation options
 * @param {boolean} [options.scheduleReactivation=true] - Whether to schedule auto-reactivation
 * @returns {Object} Activation result
 */
export function activateTrinket(ctx, trinketId, options = {}) {
    const { scheduleReactivation = true } = options;
    
    if (!hasTrinket(ctx, trinketId)) {
        return { success: false, reason: 'not_equipped' };
    }
    
    if (!isTrinketReady(ctx, trinketId)) {
        return { success: false, reason: 'on_cooldown' };
    }
    
    const def = getTrinketDefinition(trinketId);
    if (!def) {
        return { success: false, reason: 'unknown_trinket' };
    }
    
    const state = getTrinketState(ctx, trinketId);
    
    // Apply effect based on type
    let result;
    switch (def.effect.type) {
        case 'spellDamagePercent':
            result = activateSpellDamageTrinket(ctx, def, state);
            break;
        case 'damage':
            result = activateDamageTrinket(ctx, def, state);
            break;
        case 'threatReduction':
            result = activateThreatReductionTrinket(ctx, def, state);
            break;
        case 'hastePercent':
            result = activateHasteTrinket(ctx, def, state);
            break;
        case 'attackPowerRamp':
            result = activateAttackPowerRampTrinket(ctx, def, state);
            break;
        case 'jewelOfWildMagics':
            result = activateJewelOfWildMagics(ctx, def, state);
            break;
        default:
            return { success: false, reason: 'unknown_effect_type' };
    }
    
    if (!result.success) {
        return result;
    }
    
    // Set cooldown
    state.cooldownReady = ctx.currentTime + def.cooldown;
    state.activationCount++;
    
    // Track uptime if buff-based
    if (def.duration > 0 && ctx.buffUptime) {
        const buffKey = trinketIdToBuffKey(trinketId);
        if (ctx.buffUptime[buffKey]) {
            ctx.buffUptime[buffKey].activationTimes.push({
                start: ctx.currentTime,
                end: state.buffExpires,
                duration: def.duration
            });
            ctx.buffUptime[buffKey].procs++;
        }
    }
    
    // Schedule expiration if buff-based
    if (def.duration > 0 && state.buffExpires <= ctx.fightDuration && ctx.scheduleEvent) {
        ctx.unscheduleEvent?.(`${trinketId}Expire`);
        ctx.scheduleEvent(state.buffExpires, 'buffExpire', () => {
            handleTrinketExpiration(ctx, trinketId);
        }, `${trinketId}Expire`);
    }
    
    // Schedule auto-reactivation if configured
    if (scheduleReactivation && def.autoReactivate) {
        const nextActivation = ctx.currentTime + def.cooldown;
        if (nextActivation <= ctx.fightDuration && ctx.scheduleEvent) {
            ctx.scheduleEvent(nextActivation, 'trinketReady', () => {
                activateTrinket(ctx, trinketId, { scheduleReactivation: true });
            }, `${trinketId}Reactivate`);
        }
    }
    
    // Log
    if (ctx.log) {
        ctx.log(`${def.name} activated!${def.duration > 0 ? ` (${def.duration}s duration)` : ''}`);
    }
    
    return { success: true, ...result };
}

/**
 * Handle trinket buff expiration
 * @param {Object} ctx - Simulation context
 * @param {string} trinketId - Trinket ID
 */
function handleTrinketExpiration(ctx, trinketId) {
    const state = getTrinketState(ctx, trinketId);
    const def = getTrinketDefinition(trinketId);
    
    if (!state.isActive || ctx.currentTime < state.buffExpires) {
        return; // Not expired yet or already expired
    }
    
    state.isActive = false;
    
    // Remove effect based on type
    switch (def?.effect?.type) {
        case 'spellDamagePercent':
            if (ctx.stats?.activeModifiers) {
                ctx.stats.activeModifiers.naturalAlignmentCrystal = false;
            }
            break;
        case 'threatReduction':
            // Threat reduction is checked dynamically, no cleanup needed
            break;
        case 'hastePercent':
            // Haste is checked dynamically via isTrinketBuffActive
            break;
        case 'attackPowerRamp':
            // AP ramp is checked dynamically via getTrinketAttackPowerBonus
            break;
    }
    
    if (ctx.log) {
        ctx.log(`${def?.name || trinketId} expired`);
    }
}

// ============================================
// EFFECT-SPECIFIC ACTIVATIONS
// ============================================

/**
 * Activate spell damage trinket (Natural Alignment Crystal)
 */
function activateSpellDamageTrinket(ctx, def, state) {
    state.isActive = true;
    state.buffExpires = ctx.currentTime + def.duration;
    
    // Set modifier flag
    if (ctx.stats?.activeModifiers) {
        ctx.stats.activeModifiers.naturalAlignmentCrystal = true;
    }
    
    // Legacy compatibility
    if (ctx.naturalAlignmentCrystalExpires !== undefined) {
        ctx.naturalAlignmentCrystalExpires = state.buffExpires;
    }
    
    return { success: true };
}

/**
 * Activate damage trinket (Shard of the Fallen Star)
 */
function activateDamageTrinket(ctx, def, state) {
    // Calculate damage
    const { damageMin, damageMax, spCoefficient, school } = def.effect;
    
    // Get fire spell power
    const fireSpellPower = ctx.stats?.fireDamage || 0;
    const woc = ctx.stats?.activeModifiers?.wrathOfCenarius || 0;
    const effectiveFireSP = fireSpellPower + woc;
    const spBonus = Math.floor(effectiveFireSP * spCoefficient);
    
    const minDamage = damageMin + spBonus;
    const maxDamage = damageMax + spBonus;
    
    // Roll damage
    let damage = minDamage + (ctx.rng?.random() || Math.random()) * (maxDamage - minDamage);
    
    // Apply modifiers
    const elementalFuryRanks = ctx.stats?.activeModifiers?.elementalFury || 0;
    if (elementalFuryRanks > 0) {
        damage *= (1 + elementalFuryRanks * 0.05);
    }
    
    const elementalWeaponsRanks = ctx.stats?.activeModifiers?.elementalWeapons || 0;
    if (elementalWeaponsRanks > 0 && ctx.ewFlametongueBuffActive && ctx.currentTime < ctx.ewFlametongueBuffExpires) {
        damage *= (1 + elementalWeaponsRanks * 0.10);
    }
    
    if (ctx.stats?.fireDamageMultiplier && ctx.stats.fireDamageMultiplier > 1) {
        damage *= ctx.stats.fireDamageMultiplier;
    }
    if (ctx.stats?.activeModifiers?.elementalMastery) damage *= 1.15;
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) damage *= 1.20;
    
    // Record damage
    if (ctx.recordDamage) {
        ctx.recordDamage('Shard of the Fallen Star', damage, {
            type: 'spell',
            outcome: 'hit',
            resistType: 'none',
            school: school
        });
    }
    
    // Fire spell hit triggers
    if (ctx.fireSpellHitTriggers) {
        ctx.fireSpellHitTriggers('Shard of the Fallen Star', 'spell_fire_fireball02', { didHit: true, isCrit: false });
    }
    
    // Legacy compatibility
    if (ctx.shardOfTheFallenStarCooldown !== undefined) {
        ctx.shardOfTheFallenStarCooldown = ctx.currentTime + def.cooldown;
    }
    
    return { success: true, damage };
}

/**
 * Activate threat reduction trinket (Eye of Diminution)
 */
function activateThreatReductionTrinket(ctx, def, state) {
    state.isActive = true;
    state.buffExpires = ctx.currentTime + def.duration;
    
    // Legacy compatibility
    if (ctx.eyeOfDiminutionExpires !== undefined) {
        ctx.eyeOfDiminutionExpires = state.buffExpires;
    }
    if (ctx.eyeOfDiminutionCooldown !== undefined) {
        ctx.eyeOfDiminutionCooldown = ctx.currentTime + def.cooldown;
    }
    
    return { success: true };
}

/**
 * Activate haste trinket (Kiss of the Spider)
 */
function activateHasteTrinket(ctx, def, state) {
    state.isActive = true;
    state.buffExpires = ctx.currentTime + def.duration;
    
    // Legacy compatibility
    if (ctx.kissOfTheSpiderExpires !== undefined) {
        ctx.kissOfTheSpiderExpires = state.buffExpires;
    }
    if (ctx.kissOfTheSpiderCooldown !== undefined) {
        ctx.kissOfTheSpiderCooldown = ctx.currentTime + def.cooldown;
    }
    
    return { success: true };
}

/**
 * Activate attack power ramp trinket (Jom Gabbar)
 * Use: 65 AP instantly, +65 every 2s for 20s (max 650 AP at 18s, expires at 20s)
 */
function activateAttackPowerRampTrinket(ctx, def, state) {
    state.isActive = true;
    state.activationTime = ctx.currentTime;
    state.buffExpires = ctx.currentTime + def.duration;
    
    return { success: true };
}

/**
 * Get effective spell power for a school (max of general SP and school-specific SP)
 */
function getEffectiveSpellPowerForSchool(ctx, school) {
    const base = ctx.stats?.spellPower || 0;
    if (school === 'fire') return Math.max(base, ctx.stats?.fireDamage || 0);
    if (school === 'frost') return Math.max(base, ctx.stats?.frostDamage || 0);
    if (school === 'nature') return Math.max(base, ctx.stats?.natureDamage || 0);
    if (school === 'shadow') return Math.max(base, ctx.stats?.shadowDamage || 0);
    if (school === 'arcane') return Math.max(base, ctx.stats?.arcaneDamage || 0);
    if (school === 'holy') return base; // no holy SP stat typically
    return base;
}

/**
 * Apply fire-only modifiers for Jewel of Wild Magics fire effect: Elemental Fury, Elemental Weapons, Call of Flame; no Concussion.
 */
function applyJewelFireModifiers(ctx, damage) {
    const elementalFuryRanks = ctx.stats?.activeModifiers?.elementalFury || 0;
    if (elementalFuryRanks > 0) {
        damage *= (1 + elementalFuryRanks * 0.05);
    }
    const elementalWeaponsRanks = ctx.stats?.activeModifiers?.elementalWeapons || 0;
    if (elementalWeaponsRanks > 0 && ctx.ewFlametongueBuffActive && ctx.currentTime < ctx.ewFlametongueBuffExpires) {
        damage *= (1 + elementalWeaponsRanks * 0.10);
    }
    const callOfFlameRanks = ctx.stats?.activeModifiers?.callOfFlame || 0;
    if (callOfFlameRanks > 0) {
        damage *= (1 + callOfFlameRanks * 0.05);
    }
    if (ctx.stats?.fireDamageMultiplier && ctx.stats.fireDamageMultiplier > 1) {
        damage *= ctx.stats.fireDamageMultiplier;
    }
    if (ctx.stats?.activeModifiers?.elementalMastery) damage *= 1.15;
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) damage *= 1.20;
    return damage;
}

/**
 * Activate Jewel of Wild Magics: random effect (1=frost, 2=fire, 3=arcane, 4=holy).
 * Direct hit: 491-540 + 15% SP (school = max(SP, schoolSP)). All scale from raid debuffs.
 * Fire: also Ele Fury %, Ele Weapons, Call of Flame (no Concussion); plus DoT 100 + 10% SP per tick every 2s for 6s.
 * Arcane: also applies Arcane Surge buff (3% cast speed, 50 SP, 12s).
 */
function activateJewelOfWildMagics(ctx, def, state) {
    const eff = def.effect;
    const rng = (ctx.rng && typeof ctx.rng.random === 'function') ? () => ctx.rng.random() : Math.random;
    const forced = (ctx.simContext?.jewelForcedOutcome || '').toLowerCase();
    const validForced = ['frost', 'fire', 'arcane', 'holy'].includes(forced);
    let outcome;
    if (validForced) {
        outcome = forced;
    } else {
        const roll = rng();
        outcome = roll < 0.25 ? 'frost' : roll < 0.5 ? 'fire' : roll < 0.75 ? 'arcane' : 'holy';
    }
    const school = outcome;

    const effectiveSP = getEffectiveSpellPowerForSchool(ctx, school);
    const spBonus = effectiveSP * (eff.spCoefficient ?? 0.15);
    const minD = (eff.damageMin ?? 491) + spBonus;
    const maxD = (eff.damageMax ?? 540) + spBonus;

    let selfMult = 1.0;
    if (school === 'fire') {
        const elementalFuryRanks = ctx.stats?.activeModifiers?.elementalFury || 0;
        if (elementalFuryRanks > 0) selfMult *= (1 + elementalFuryRanks * 0.05);
        const elementalWeaponsRanks = ctx.stats?.activeModifiers?.elementalWeapons || 0;
        if (elementalWeaponsRanks > 0 && ctx.ewFlametongueBuffActive && ctx.currentTime < ctx.ewFlametongueBuffExpires) selfMult *= (1 + elementalWeaponsRanks * 0.10);
        const callOfFlameRanks = ctx.stats?.activeModifiers?.callOfFlame || 0;
        if (callOfFlameRanks > 0) selfMult *= (1 + callOfFlameRanks * 0.05);
        if (ctx.stats?.fireDamageMultiplier && ctx.stats.fireDamageMultiplier > 1) {
            selfMult *= ctx.stats.fireDamageMultiplier;
        }
    }
    if (ctx.stats?.activeModifiers?.elementalMastery && (school === 'fire' || school === 'frost' || school === 'nature')) selfMult *= 1.15;
    if (ctx.stats?.activeModifiers?.naturalAlignmentCrystal) selfMult *= 1.20;

    const critChance = ctx.stats?.spellCrit || 0;
    const debuffMult = getTargetDebuffMultiplier(ctx, { school });
    const aoeMult = getAoeMultiplier(ctx);
    const displayName = `Jewel of Wild Magics: ${outcome.charAt(0).toUpperCase() + outcome.slice(1)}`;

    let totalDamage = 0;
    let primaryIsCrit = false;
    for (let t = 0; t < aoeMult; t++) {
        const isSecondary = t > 0;
        let damage = minD + rng() * (maxD - minD);
        damage *= selfMult;

        let isCrit = false;
        if (critChance > 0 && rng() < critChance) {
            isCrit = true;
            damage *= 1.5;
        }
        if (t === 0) primaryIsCrit = isCrit;

        if (!isSecondary) {
            damage *= debuffMult;
        }

        totalDamage += damage;
        if (ctx.recordDamage) {
            ctx.recordDamage(displayName, damage, {
                type: 'spell',
                outcome: isCrit ? 'crit' : 'hit',
                resistType: 'none',
                school
            });
        }
    }

    // Buff/timeline: record each Jewel activation with outcome-specific icon (no duration bar); Arcane Surge bar only when arcane procs
    const JEWEL_OUTCOME_ICONS = { frost: 'spell_frost_frostnova', fire: 'spell_holy_excorcism_02', arcane: 'spell_nature_wispsplode', holy: 'spell_holy_holynova' };
    if (ctx.buffUptime) {
        if (!ctx.buffUptime.jewelOfWildMagics) {
            ctx.buffUptime.jewelOfWildMagics = { procs: 0, refreshes: 0, activationTimes: [] };
        }
        const jewelTracker = ctx.buffUptime.jewelOfWildMagics;
        jewelTracker.activationTimes.push({
            start: ctx.currentTime,
            end: ctx.currentTime,
            duration: 0,
            triggerSource: displayName,
            triggerIcon: JEWEL_OUTCOME_ICONS[school] || 'spell_nature_astralrecal',
            outcome: school,
            refreshes: []
        });
        jewelTracker.procs += 1;
        if (school === 'arcane') {
            const arcaneSurgeDuration = eff.arcaneSurgeDuration ?? 12;
            if (!ctx.buffUptime.arcaneSurge) {
                ctx.buffUptime.arcaneSurge = { procs: 0, refreshes: 0, activationTimes: [] };
            }
            ctx.buffUptime.arcaneSurge.activationTimes.push({
                start: ctx.currentTime,
                end: ctx.currentTime + arcaneSurgeDuration,
                duration: arcaneSurgeDuration,
                triggerSource: 'Arcane Surge',
                triggerIcon: 'spell_nature_astralrecal',
                refreshes: []
            });
            ctx.buffUptime.arcaneSurge.procs += 1;
        }
    }
    if (ctx.fireSpellHitTriggers && (school === 'fire' || school === 'arcane' || school === 'frost' || school === 'holy')) {
        const icon = school === 'fire' || school === 'arcane' ? 'spell_nature_astralrecal' : 'spell_frost_frostnova';
        ctx.fireSpellHitTriggers(displayName, icon, { didHit: true, isCrit: primaryIsCrit });
    }

    if (school === 'fire') {
        const dotBase = eff.dotBaseDamage ?? 100;
        const dotCoef = eff.dotSpCoefficient ?? 0.10;
        const baseTickDmg = dotBase + effectiveSP * dotCoef;
        const dotDuration = eff.dotDuration ?? 6;
        const tickInterval = eff.dotTickInterval ?? 2;
        const numTicks = Math.floor(dotDuration / tickInterval);
        for (let i = 1; i <= numTicks; i++) {
            const tickTime = ctx.currentTime + i * tickInterval;
            if (tickTime < (ctx.fightDuration ?? 1e6) && ctx.scheduleEvent) {
                const eventId = `jewelWildMagicsFireDot_${tickTime}_${ctx.currentTime}`;
                ctx.scheduleEvent(tickTime, 'jewelWildMagicsFireDot', () => {
                    const currentAoeMult = getAoeMultiplier(ctx);
                    const currentDebuffMult = getTargetDebuffMultiplier(ctx, { school: 'fire' });
                    for (let tt = 0; tt < currentAoeMult; tt++) {
                        let d = baseTickDmg;
                        d = applyJewelFireModifiers(ctx, d);
                        if (tt === 0) d *= currentDebuffMult;
                        if (ctx.recordDamage) {
                            ctx.recordDamage('Jewel of Wild Magics: Fire (DoT)', d, {
                                type: 'spell',
                                outcome: 'hit',
                                resistType: 'none',
                                school: 'fire'
                            });
                        }
                    }
                }, eventId);
            }
        }
    }

    if (school === 'arcane') {
        initializeTrinketStates(ctx);
        const arcaneSurgeDuration = eff.arcaneSurgeDuration ?? 12;
        ctx[TRINKET_STATE_KEY].arcane_surge = {
            buffExpires: ctx.currentTime + arcaneSurgeDuration,
            castSpeedPercent: eff.arcaneSurgeCastSpeedPercent ?? 3,
            spellPower: eff.arcaneSurgeSpellPower ?? 50
        };
        if (ctx.scheduleEvent && ctx.unscheduleEvent) {
            ctx.unscheduleEvent?.('arcaneSurgeExpire');
            ctx.scheduleEvent(ctx.currentTime + arcaneSurgeDuration, 'buffExpire', () => {
                if (ctx[TRINKET_STATE_KEY]?.arcane_surge) {
                    ctx[TRINKET_STATE_KEY].arcane_surge.buffExpires = 0;
                }
            }, 'arcaneSurgeExpire');
        }
    }

    return { success: true, damage: totalDamage, outcome };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert trinket ID to buff tracking key
 * @param {string} trinketId - Trinket ID
 * @returns {string} Buff key
 */
function trinketIdToBuffKey(trinketId) {
    const mapping = {
        'natural_alignment_crystal': 'naturalAlignmentCrystal',
        'shard_of_the_fallen_star': 'shardOfTheFallenStar',
        'eye_of_diminution': 'eyeOfDiminution',
        'kiss_of_the_spider': 'kissOfTheSpider',
        'jom_gabbar': 'jomGabbar',
        'jewel_of_wild_magics': 'jewelOfWildMagics'
    };
    return mapping[trinketId] || trinketId;
}

/**
 * Get haste multiplier from active trinkets
 * @param {Object} ctx - Simulation context
 * @returns {number} Haste multiplier (1.0 = no haste)
 */
export function getTrinketHasteMultiplier(ctx) {
    let multiplier = 1.0;
    
    // Kiss of the Spider: +20% haste
    if (isTrinketBuffActive(ctx, 'kiss_of_the_spider')) {
        const def = getTrinketDefinition('kiss_of_the_spider');
        multiplier *= (1 + (def?.effect?.value || 0.20));
    }
    
    return multiplier;
}

/**
 * Get spell damage multiplier from active trinkets
 * @param {Object} ctx - Simulation context
 * @returns {number} Spell damage multiplier (1.0 = no bonus)
 */
export function getTrinketSpellDamageMultiplier(ctx) {
    let multiplier = 1.0;
    
    // Natural Alignment Crystal: +20% spell damage
    if (isTrinketBuffActive(ctx, 'natural_alignment_crystal')) {
        const def = getTrinketDefinition('natural_alignment_crystal');
        multiplier *= (1 + (def?.effect?.value || 0.20));
    }
    
    return multiplier;
}

/**
 * Get flat spell power from Arcane Surge (Jewel of Wild Magics Arcane effect). Cast speed is spell-only, not melee haste.
 * @param {Object} ctx - Simulation context
 * @returns {number} Bonus spell power (0 if Arcane Surge not active)
 */
export function getTrinketArcaneSurgeSpellPower(ctx) {
    const state = getTrinketState(ctx, 'arcane_surge');
    if (!state?.buffExpires || ctx.currentTime >= state.buffExpires) return 0;
    return state.spellPower ?? 50;
}

/**
 * Get spell cast speed percent from Arcane Surge (Jewel of Wild Magics Arcane effect). This is casting speed only, not melee haste.
 * @param {Object} ctx - Simulation context
 * @returns {number} Cast speed percent (0 if not active)
 */
export function getTrinketCastSpeedPercent(ctx) {
    const state = getTrinketState(ctx, 'arcane_surge');
    if (!state?.buffExpires || ctx.currentTime >= state.buffExpires) return 0;
    return state.castSpeedPercent ?? 3;
}

/**
 * Get flat attack power bonus from trinkets (e.g. Jom Gabbar ramping AP)
 * Jom Gabbar: 65 AP at use, +65 every 2s for 20s (max 650 at 18s).
 * @param {Object} ctx - Simulation context
 * @returns {number} Bonus attack power (0 if none)
 */
export function getTrinketAttackPowerBonus(ctx) {
    if (!isTrinketBuffActive(ctx, 'jom_gabbar')) return 0;
    const state = getTrinketState(ctx, 'jom_gabbar');
    const def = getTrinketDefinition('jom_gabbar');
    if (!def?.effect?.initial || state.activationTime == null) return 0;
    const elapsed = ctx.currentTime - state.activationTime;
    const ticks = Math.min(def.effect.maxStacks || 10, 1 + Math.floor(elapsed / (def.effect.tickInterval || 2)));
    return (def.effect.initial || 65) * ticks;
}

/**
 * Check if threat reduction is active
 * @param {Object} ctx - Simulation context
 * @returns {number} Threat reduction multiplier (1.0 = no reduction)
 */
export function getTrinketThreatMultiplier(ctx) {
    let multiplier = 1.0;
    
    // Eye of Diminution: -35% threat
    if (isTrinketBuffActive(ctx, 'eye_of_diminution')) {
        const def = getTrinketDefinition('eye_of_diminution');
        multiplier *= (1 - (def?.effect?.value || 0.35));
    }
    
    return multiplier;
}

// ============================================
// EXPORTS
// ============================================

export default {
    TRINKET_DEFINITIONS,
    initializeTrinketStates,
    getTrinketState,
    getTrinketDefinition,
    hasTrinket,
    isTrinketReady,
    isTrinketBuffActive,
    getTrinketCooldownRemaining,
    activateTrinket,
    getTrinketHasteMultiplier,
    getTrinketSpellDamageMultiplier,
    getTrinketArcaneSurgeSpellPower,
    getTrinketCastSpeedPercent,
    getTrinketThreatMultiplier
};
