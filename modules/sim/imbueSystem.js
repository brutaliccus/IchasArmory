/**
 * Weapon Imbue System - Data-Driven Weapon Imbue Handling
 * 
 * @module sim/imbueSystem
 * @description Handles weapon imbue effects (Flametongue, Windfury) in a data-driven manner.
 * 
 * ## Overview
 * Instead of hardcoded procFlametongue() and procWindfury() methods, this system:
 * - Reads imbue definitions from procs.js
 * - Processes imbue effects based on type
 * - Handles damage calculation, extra attacks, and proc triggers
 * 
 * ## Imbue Types
 * - `imbueDamage` - Deal spell damage on melee hit (Flametongue)
 * - `imbueExtraAttacks` - Grant extra attacks with AP bonus (Windfury)
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { shamanSpells } from '../shaman/spells.js';
import { calculateSpellDamage } from '../shaman/damageCalc.js';
import { getProcById } from '../gear/procs.js';
import { getProcState } from './procEngine.js';
import { getTargetDebuffMultiplier } from './simContext.js';
import { getTrinketAttackPowerBonus } from './trinketSystem.js';

// ============================================
// IMBUE STATE TRACKING
// ============================================

/**
 * Check if an imbue is active
 * @param {Object} ctx - Simulation context
 * @param {string} imbueId - Imbue ID ('flametongue_weapon' or 'windfury_weapon')
 * @returns {boolean} Whether imbue is active
 */
export function isImbueActive(ctx, imbueId) {
    if (imbueId === 'flametongue_weapon') {
        return !!ctx.stats?.activeModifiers?.flametongueActive;
    }
    if (imbueId === 'frostbrand_weapon') {
        return !!ctx.stats?.activeModifiers?.frostbrandActive;
    }
    if (imbueId === 'windfury_weapon') {
        return !!ctx.stats?.activeModifiers?.windfuryActive;
    }
    return false;
}

/**
 * Melee hit proc chance for Frostbrand: (baseWeaponSpeed × ppm / 60) + Elemental Weapons additive bonus.
 * @param {Object} stats - Sim stats (weapon speed, talentBonuses.frostbrand_proc_bonus)
 * @param {number} [ppm] - Defaults from frostbrand_weapon proc definition (9)
 */
export function getFrostbrandProcChance(stats, ppmOverride) {
    const proc = getProcById('frostbrand_weapon');
    const ppm = ppmOverride ?? proc?.effect?.ppm ?? 9;
    const baseWeaponSpeed = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
        ? stats.baseWeaponSpeed
        : (stats.weaponSpeed || 2.0);
    let p = (baseWeaponSpeed * ppm) / 60;
    p += stats.talentBonuses?.frostbrand_proc_bonus || 0;
    return Math.min(1, p);
}

// ============================================
// FLAMETONGUE WEAPON
// ============================================

/**
 * Process Flametongue Weapon proc on melee hit
 * @param {Object} ctx - Simulation context
 * @param {string} triggerSource - What triggered this (e.g., 'Auto Attack')
 * @param {string} triggerIcon - Icon
 * @returns {Object|null} Damage result or null if not active
 */
export function processFlametongue(ctx, triggerSource, triggerIcon) {
    if (!isImbueActive(ctx, 'flametongue_weapon')) {
        return null;
    }
    
    const spell = shamanSpells.flametongueWeapon;
    if (!spell) {
        console.warn('[ImbueSystem] flametongueWeapon spell not found');
        return null;
    }
    
    // Calculate damage using existing damage calc system
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    
    // When on a secondary target (FS swap window), strip static boss debuffs from damage
    const onSecondary = typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget();
    let effectiveDamageResult = damageResult;
    if (onSecondary) {
        const debuffDiv = getTargetDebuffMultiplier(ctx, spell);
        if (debuffDiv > 1) {
            effectiveDamageResult = {
                min: damageResult.min / debuffDiv,
                max: damageResult.max / debuffDiv,
                average: damageResult.average / debuffDiv
            };
        }
    }
    
    // Roll damage outcome (skipTargetDebuffs for dynamic debuffs handled via isOnSecondaryTarget in rollDamage)
    const outcome = ctx.rollDamage ? ctx.rollDamage(spell, effectiveDamageResult, false) : {
        damage: damageResult.average || 0,
        type: 'hit',
        resistType: 'none',
        didHit: true,
        isCrit: false
    };

    // Earthfury 5pc (+45% Flametongue vs Flame Shock) is applied once in damageCalc via
    // stats.getAllDamageModifiers (shamanTalents) → applyDamageModifiers — do not multiply here
    // or damage is ~1.45² when FS is up.

    // Record damage
    if (ctx.recordDamage) {
        ctx.recordDamage('Flametongue Weapon', outcome.damage, {
            type: 'proc',
            outcome: outcome.type,
            resistType: outcome.resistType || 'none'
        });
    }
    
    // Track empowered abilities for Elemental Mastery and Natural Alignment Crystal
    const icon = spell.icon || 'spell_fire_flametounge';
    trackEmpoweredAbility(ctx, 'Flametongue Weapon', icon);
    
    // Log
    if (ctx.log && outcome.didHit) {
        let logMessage = `Flametongue Weapon: ${outcome.damage.toFixed(2)} damage (${outcome.type})`;
        if (outcome.resistType && outcome.resistType !== 'none') {
            logMessage += ` [${outcome.resistType}]`;
        }
        ctx.log(logMessage);
    }
    
    return {
        damage: outcome.damage,
        isCrit: outcome.isCrit,
        resistType: outcome.resistType,
        didHit: outcome.didHit,
        triggersSpellHitProcs: outcome.resistType !== 'full_resist' && outcome.type !== 'immune'
    };
}

// ============================================
// FROSTBRAND WEAPON (PPM + Elemental Weapons)
// ============================================

/**
 * Roll and apply Frostbrand Weapon on an eligible melee hit (auto, Stormstrike, LS physical, WF, etc.)
 * @returns {Object|null} Result like processFlametongue, or null if imbue inactive / proc failed
 */
export function processFrostbrandWeapon(ctx, triggerSource, triggerIcon) {
    if (!isImbueActive(ctx, 'frostbrand_weapon')) {
        return null;
    }

    const chance = getFrostbrandProcChance(ctx.stats);
    if (!ctx.rng || ctx.rng.random() >= chance) {
        return null;
    }

    const spell = shamanSpells.frostbrandWeapon;
    if (!spell) {
        console.warn('[ImbueSystem] frostbrandWeapon spell not found');
        return null;
    }

    const damageResult = calculateSpellDamage(spell, ctx.stats);

    const onSecondary = typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget();
    let effectiveDamageResult = damageResult;
    if (onSecondary) {
        const debuffDiv = getTargetDebuffMultiplier(ctx, spell);
        if (debuffDiv > 1) {
            effectiveDamageResult = {
                min: damageResult.min / debuffDiv,
                max: damageResult.max / debuffDiv,
                average: damageResult.average / debuffDiv
            };
        }
    }

    const ewRanks = ctx.stats?.activeModifiers?.elementalWeapons
        || ctx.stats?.talentBonuses?.elemental_weapons_ranks
        || 0;
    const fsSlow = (ctx.frostShockDebuffExpires || 0) > ctx.currentTime;
    const forceSpellCrit = ewRanks > 0 && fsSlow;

    const outcome = ctx.rollDamage
        ? ctx.rollDamage(spell, effectiveDamageResult, false, false, { forceSpellCrit })
        : {
            damage: damageResult.average || 0,
            type: 'hit',
            resistType: 'none',
            didHit: true,
            isCrit: false
        };

    const icon = spell.icon || 'https://database.turtlecraft.gg/images/icons/large/spell_frost_frostbrand.png';

    if (ctx.recordDamage) {
        ctx.recordDamage('Frostbrand Weapon', outcome.damage, {
            type: 'proc',
            outcome: outcome.type,
            resistType: outcome.resistType || 'none',
            icon
        });
    }

    trackEmpoweredAbility(ctx, 'Frostbrand Weapon', icon);

    if (ctx.log && outcome.didHit) {
        let logMessage = `Frostbrand Weapon: ${outcome.damage.toFixed(2)} damage (${outcome.type})`;
        if (outcome.resistType && outcome.resistType !== 'none') {
            logMessage += ` [${outcome.resistType}]`;
        }
        ctx.log(logMessage);
    }

    return {
        damage: outcome.damage,
        isCrit: outcome.isCrit,
        resistType: outcome.resistType,
        didHit: outcome.didHit,
        triggersSpellHitProcs: outcome.resistType !== 'full_resist' && outcome.type !== 'immune',
        icon
    };
}

// ============================================
// WINDFURY WEAPON
// ============================================

/**
 * Windfury AP bonus constant
 * @constant {number}
 */
export const WINDFURY_AP_BONUS = 323;

/**
 * Process a single Windfury Weapon attack
 * Called twice by the simulator to perform both extra attacks
 * 
 * @param {Object} ctx - Simulation context
 * @param {number} attackIndex - Which attack (0 or 1) for logging
 * @param {Object} [options] - Options
 * @param {boolean} [options.skipRecord] - If true, don't record damage (caller will)
 * @param {boolean} [options.skipLog] - If true, don't log (caller will)
 * @returns {Object|null} Attack result or null if not active/failed
 */
export function processWindfuryAttack(ctx, attackIndex = 0, options = {}) {
    const spell = shamanSpells.windfuryAttack;
    
    if (!spell) {
        console.warn('[ImbueSystem] windfuryAttack spell not found');
        return null;
    }
    
    // Convert +323 AP to bonus weapon damage
    // Formula: Bonus Damage = AP / 14 * Weapon Speed
    const weaponSpeed = ctx.autoAttackSpeed || 2.5;
    const bonusDamage = (WINDFURY_AP_BONUS / 14) * weaponSpeed;
    
    // Calculate base damage (include Jom Gabbar etc. trinket AP)
    const apBonus = getTrinketAttackPowerBonus(ctx);
    const meleeStats = apBonus ? { ...ctx.stats, attackPower: (ctx.stats.attackPower || 0) + apBonus } : ctx.stats;
    const damageResult = calculateSpellDamage(spell, meleeStats);
    
    // Add Windfury AP bonus to damage result (before crit/armor)
    damageResult.min += bonusDamage;
    damageResult.max += bonusDamage;
    damageResult.avg += bonusDamage;
    
    // Roll damage (physical, apply armor)
    const outcome = ctx.rollDamage ? ctx.rollDamage(spell, damageResult, true) : {
        damage: damageResult.avg || 0,
        type: 'hit',
        resistType: 'none',
        didHit: true,
        isCrit: false
    };
    
    // Record damage unless caller opts out
    if (!options.skipRecord && ctx.recordDamage) {
        ctx.recordDamage('Windfury Attack', outcome.damage, {
            type: 'melee',
            outcome: outcome.type,
            resistType: outcome.resistType || 'none'
        });
    }
    
    // Log unless caller opts out
    if (!options.skipLog && ctx.log) {
        ctx.log(`Windfury Attack ${attackIndex + 1}: ${outcome.damage.toFixed(2)} damage (${outcome.type}, +${bonusDamage.toFixed(1)} from WF AP bonus)`);
    }
    
    return {
        damage: outcome.damage,
        isCrit: outcome.isCrit,
        type: outcome.type,
        didHit: outcome.didHit,
        bonusDamage,
        attackIndex
    };
}

/**
 * Process Windfury Weapon proc - grants 2 extra attacks
 * This is a convenience wrapper that calls processWindfuryAttack twice
 * For per-attack trigger handling, use processWindfuryAttack directly
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object|null} Attack results or null if not active
 */
export function processWindfury(ctx, triggerSource, triggerIcon) {
    if (!isImbueActive(ctx, 'windfury_weapon')) {
        return null;
    }
    
    const attacks = [];
    
    // Perform 2 extra attacks
    for (let i = 0; i < 2; i++) {
        const result = processWindfuryAttack(ctx, i);
        if (result) {
            attacks.push(result);
        }
    }
    
    if (attacks.length === 0) {
        return null;
    }
    
    return {
        attacks,
        totalDamage: attacks.reduce((sum, a) => sum + a.damage, 0),
        crits: attacks.filter(a => a.isCrit).length,
        hits: attacks.filter(a => a.didHit).length
    };
}

// ============================================
// GENERIC IMBUE PROCESSOR
// ============================================

/**
 * Process an imbue effect based on its type
 * @param {Object} ctx - Simulation context
 * @param {string} imbueId - Imbue ID
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @returns {Object|null} Result or null
 */
export function processImbue(ctx, imbueId, triggerSource, triggerIcon) {
    const proc = getProcById(imbueId);
    if (!proc || !proc.imbue) {
        return null;
    }
    
    const effect = proc.effect;
    if (!effect) {
        return null;
    }
    
    switch (effect.type) {
        case 'imbueDamage':
            return processFlametongue(ctx, triggerSource, triggerIcon);

        case 'imbuePpmDamage':
            return processFrostbrandWeapon(ctx, triggerSource, triggerIcon);
        
        case 'imbueExtraAttacks':
            return processWindfury(ctx, triggerSource, triggerIcon);
        
        default:
            console.warn(`[ImbueSystem] Unknown imbue effect type: ${effect.type}`);
            return null;
    }
}

/**
 * Process all active imbues on melee hit
 * @param {Object} ctx - Simulation context
 * @param {string} triggerSource - What triggered this
 * @param {string} triggerIcon - Icon
 * @param {Object} options - Options
 * @param {boolean} options.canProcWindfury - Whether Windfury can proc (false for WF attacks)
 * @param {number} options.windfuryChance - Windfury proc chance (default 25%)
 * @returns {Object} Results from all imbue procs
 */
export function processImbuesOnMeleeHit(ctx, triggerSource, triggerIcon, options = {}) {
    const { canProcWindfury = true, windfuryChance = 0.20 } = options;
    
    const results = {
        flametongue: null,
        frostbrand: null,
        windfury: null
    };
    
    // Flametongue always procs on hit if active
    if (isImbueActive(ctx, 'flametongue_weapon')) {
        results.flametongue = processFlametongue(ctx, triggerSource, triggerIcon);
    }

    if (isImbueActive(ctx, 'frostbrand_weapon')) {
        results.frostbrand = processFrostbrandWeapon(ctx, triggerSource, triggerIcon);
    }
    
    // Windfury has a 25% chance and cannot proc itself
    if (canProcWindfury && isImbueActive(ctx, 'windfury_weapon')) {
        if (ctx.rng && ctx.rng.random() < windfuryChance) {
            results.windfury = processWindfury(ctx, triggerSource, triggerIcon);
        }
    }
    
    return results;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Track empowered ability usage for buff tracking
 * @param {Object} ctx - Simulation context
 * @param {string} abilityName - Ability name
 * @param {string} icon - Icon
 */
function trackEmpoweredAbility(ctx, abilityName, icon) {
    if (!ctx.buffUptime) return;
    
    // Track for Elemental Mastery
    if (ctx.buffUptime.elementalMastery?.activationTimes?.length > 0) {
        const lastActivation = ctx.buffUptime.elementalMastery.activationTimes[
            ctx.buffUptime.elementalMastery.activationTimes.length - 1
        ];
        if (lastActivation && (!lastActivation.end || ctx.currentTime <= lastActivation.end)) {
            if (!lastActivation.empoweredAbilities) {
                lastActivation.empoweredAbilities = [];
            }
            lastActivation.empoweredAbilities.push({
                name: abilityName,
                icon,
                time: ctx.currentTime
            });
        }
    }
    
    // Track for Natural Alignment Crystal
    if (ctx.buffUptime.naturalAlignmentCrystal?.activationTimes?.length > 0) {
        const lastActivation = ctx.buffUptime.naturalAlignmentCrystal.activationTimes[
            ctx.buffUptime.naturalAlignmentCrystal.activationTimes.length - 1
        ];
        if (lastActivation && (!lastActivation.end || ctx.currentTime <= lastActivation.end)) {
            if (!lastActivation.empoweredAbilities) {
                lastActivation.empoweredAbilities = [];
            }
            lastActivation.empoweredAbilities.push({
                name: abilityName,
                icon,
                time: ctx.currentTime
            });
        }
    }
}

// ============================================
// EXPORTS
// ============================================

export default {
    isImbueActive,
    getFrostbrandProcChance,
    processFlametongue,
    processFrostbrandWeapon,
    processWindfuryAttack,
    processWindfury,
    processImbue,
    processImbuesOnMeleeHit,
    WINDFURY_AP_BONUS
};
