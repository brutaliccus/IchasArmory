/**
 * Ability Handlers Module
 * 
 * @module sim/abilityHandlers
 * @description Handles ability execution logic extracted from ShamanCombatSimulator.
 * 
 * ## Overview
 * This module contains the core ability execution logic:
 * - castAbility - Generic spell casting
 * - castLightningStrike - Lightning Strike special handling
 * - performAutoAttack - Auto attack with procs
 * - performStormstrike - Stormstrike with debuff application
 * 
 * ## Context Pattern
 * All handlers receive a `SimContext` object that provides access to:
 * - stats: Character stats
 * - rng: Random number generator
 * - currentTime: Current simulation time
 * - buffUptime: Buff tracking
 * - Trigger functions for procs
 * 
 * @version 1.0.0
 * @since 2026-01-26
 */

import { shamanSpells } from '../shaman/spells.js';
import { calculateSpellDamage } from '../shaman/damageCalc.js';

/**
 * @typedef {Object} SimContext
 * @property {Object} stats - Character stats
 * @property {Object} rng - RNG with random() method
 * @property {number} currentTime - Current simulation time
 * @property {Object} buffUptime - Buff tracking data
 * @property {Function} log - Logging function
 * @property {Function} recordDamage - Damage recording function
 * @property {Function} rollDamage - Damage roll function
 * @property {Function} rollForCrit - Crit roll function
 * @property {Function} rollForResistance - Resistance roll function
 * @property {Function} triggerGCD - GCD trigger function
 * @property {Function} setCooldown - Cooldown setter
 * @property {Function} isAbilityReady - Cooldown checker
 * @property {Object} combatStats - Combat statistics
 * @property {Object} simContext - Simulation context flags
 */

/**
 * Create a simulation context from a simulator instance
 * This bridges the old class-based approach with the new functional handlers
 * 
 * @param {ShamanCombatSimulator} sim - Simulator instance
 * @returns {SimContext} Context object for handlers
 */
export function createSimContextFromSimulator(sim) {
    return {
        // Core state
        stats: sim.stats,
        rng: sim.rng,
        currentTime: sim.currentTime,
        fightDuration: sim.fightDuration,
        
        // Buff tracking
        buffUptime: sim.buffUptime,
        _buffSystem: sim._buffSystem,
        
        // Combat stats
        combatStats: sim.combatStats,
        
        // Simulation flags
        simContext: sim.simContext,
        deterministicMode: sim.deterministicMode,
        
        // Lightning Shield
        lightningShieldCharges: sim.lightningShieldCharges,
        
        // Active procs/buffs state
        activeProcs: sim.activeProcs,
        echoedThunderActive: sim.echoedThunderActive,
        instantLightningBoltActive: sim.instantLightningBoltActive,
        
        // Nightfall/Hemorrhage/Corrosive Spit
        nightfallEnabled: sim.nightfallEnabled,
        hemoEnabled: sim.hemoEnabled,
        hemoImproved: sim.hemoImproved,
        corrosiveSpitEnabled: sim.corrosiveSpitEnabled,
        
        // Methods (bound to simulator)
        log: sim.log.bind(sim),
        recordDamage: sim.recordDamage.bind(sim),
        rollDamage: sim.rollDamage.bind(sim),
        rollForCrit: sim.rollForCrit.bind(sim),
        rollForResistance: sim.rollForResistance.bind(sim),
        triggerGCD: sim.triggerGCD.bind(sim),
        setCooldown: sim.setCooldown.bind(sim),
        isAbilityReady: sim.isAbilityReady.bind(sim),
        
        // Proc triggers (bound to simulator)
        triggerElementalDevastation: sim.triggerElementalDevastation.bind(sim),
        triggerFlurry: sim.triggerFlurry.bind(sim),
        triggerCrusader: sim.triggerCrusader.bind(sim),
        triggerWrathOfCenarius: sim.triggerWrathOfCenarius.bind(sim),
        triggerOrnateBloodstoneDagger: sim.triggerOrnateBloodstoneDagger.bind(sim),
        triggerBladeOfEternalDarkness: sim.triggerBladeOfEternalDarkness.bind(sim),
        triggerElementalFocus: sim.triggerElementalFocus.bind(sim),
        triggerDragonbreathChili: sim.triggerDragonbreathChili.bind(sim),
        triggerBadgeOfTheSwarmguard: sim.triggerBadgeOfTheSwarmguard.bind(sim),
        triggerStonebreaker: sim.triggerStonebreaker.bind(sim),
        
        // Other ability methods
        procFlametongue: sim.procFlametongue.bind(sim),
        procWindfury: sim.procWindfury.bind(sim),
        procEmpoweredLightningShield: sim.procEmpoweredLightningShield.bind(sim),
        consumeFlurryCharge: sim.consumeFlurryCharge.bind(sim),
        processSpellStrikeHits: sim.processSpellStrikeHits.bind(sim),
        processIncendosaur3pc: sim.processIncendosaur3pc.bind(sim),
        trackEmpoweredAbility: sim.trackEmpoweredAbility.bind(sim),
        activateEchoedThunder: sim.activateEchoedThunder.bind(sim),
        activateStormwolfFrenzy: sim.activateStormwolfFrenzy.bind(sim),
        
        // Helpers
        hasBadgeOfTheSwarmguard: sim.hasBadgeOfTheSwarmguard.bind(sim),
        getBadgeOfTheSwarmguardProcChance: sim.getBadgeOfTheSwarmguardProcChance.bind(sim),
        isNightfallActive: sim.isNightfallActive.bind(sim),
        isHemorrhageActive: sim.isHemorrhageActive.bind(sim),
        isCorrosiveSpitActive: sim.isCorrosiveSpitActive?.bind(sim),
        getMainhandIcon: sim.getMainhandIcon.bind(sim),
        getHasteMultiplier: sim.getHasteMultiplier.bind(sim),
        
        // Event scheduling
        scheduleEvent: sim.scheduleEvent.bind(sim),
        unscheduleEvent: sim.unscheduleEvent.bind(sim),
        
        // State mutation helpers (return values that caller should apply)
        // These allow handlers to request state changes without direct mutation
        _simulator: sim  // Escape hatch for complex cases
    };
}

/**
 * Handle common proc triggers after a successful ability hit
 * 
 * @param {SimContext} ctx - Simulation context
 * @param {Object} options - Options
 * @param {string} options.abilityName - Name of the ability
 * @param {string} options.icon - Ability icon
 * @param {boolean} options.didHit - Whether the ability hit
 * @param {boolean} options.isCrit - Whether it was a critical hit
 * @param {boolean} options.isMelee - Whether this is a melee ability
 * @param {boolean} options.isSpell - Whether this is a spell
 * @param {string} options.school - Damage school
 */
export function handleCommonProcs(ctx, options) {
    const { abilityName, icon, didHit, isCrit, isMelee, isSpell, school } = options;
    
    if (!didHit) return;
    
    // Melee procs
    if (isMelee) {
        // Elemental Devastation (on melee crit)
        if (isCrit) {
            ctx.triggerElementalDevastation(abilityName, icon);
            ctx.triggerFlurry(abilityName, icon);
        }
        
        // Crusader
        ctx.triggerCrusader(abilityName, icon);
        
        // Dragonbreath Chili
        ctx.triggerDragonbreathChili(abilityName, icon);
        
        // Badge of the Swarmguard
        if (ctx.hasBadgeOfTheSwarmguard()) {
            const procChance = ctx.getBadgeOfTheSwarmguardProcChance();
            if (ctx.rng.random() < procChance) {
                ctx.triggerBadgeOfTheSwarmguard(abilityName, icon);
            }
        }
        
        // Spell strike hits
        ctx.processSpellStrikeHits(abilityName);
        
        // Incendosaur 3pc
        ctx.processIncendosaur3pc(abilityName, icon);
    }
    
    // Spell procs
    if (isSpell && school !== 'physical') {
        // Wrath of Cenarius
        ctx.triggerWrathOfCenarius(abilityName, icon);
        
        // Ornate Bloodstone Dagger
        ctx.triggerOrnateBloodstoneDagger(abilityName, icon);
        
        // Blade of Eternal Darkness
        ctx.triggerBladeOfEternalDarkness(abilityName, icon);
        
        // Elemental Focus (on spell crit)
        if (isCrit && ['fire', 'frost', 'nature'].includes(school?.toLowerCase())) {
            ctx.triggerElementalFocus(abilityName, icon);
        }
    }
}

/**
 * Handle weapon procs (Flametongue, Windfury) after a melee hit
 * 
 * @param {SimContext} ctx - Simulation context
 * @param {boolean} didHit - Whether the attack hit
 * @param {number} windfuryChance - Windfury proc chance (default 0.25)
 */
export function handleWeaponProcs(ctx, didHit, windfuryChance = 0.20) {
    if (!didHit) return;
    
    // Flametongue
    if (ctx.stats.activeModifiers.flametongueActive) {
        ctx.procFlametongue();
    }
    
    // Windfury
    if (ctx.stats.activeModifiers.windfuryActive && ctx.rng.random() < windfuryChance) {
        ctx.procWindfury();
    }
}

/**
 * Handle Stormhowl 3-set proc (Empowered Lightning Shield without consuming charge)
 * 
 * @param {SimContext} ctx - Simulation context
 * @param {boolean} didHit - Whether the attack hit
 * @param {string} abilityName - Name of the triggering ability
 */
export function handleStormhowl3pc(ctx, didHit, abilityName) {
    if (!didHit) return;
    
    const procChance = ctx.stats.setBonuses?.stormhowl_3pc_empowered_ls_chance;
    if (procChance && ctx.rng.random() < procChance) {
        if (ctx.lightningShieldCharges > 0) {
            ctx.procEmpoweredLightningShield(false);
            ctx.log(`[Stormhowl 3-set] ${abilityName} triggered Empowered Lightning Shield without consuming a charge`);
        }
    }
}

/**
 * Handle Stormhowl 5-set proc (Stormwolf's Frenzy)
 * 
 * @param {SimContext} ctx - Simulation context
 */
export function handleStormhowl5pc(ctx) {
    const procChance = ctx.stats.setBonuses?.stormhowl_5pc_stormwolf_frenzy;
    if (procChance && ctx.rng.random() < 0.10) {
        ctx.activateStormwolfFrenzy();
    }
}

/**
 * Calculate and apply shock cooldown with Reverberation
 * 
 * @param {SimContext} ctx - Simulation context
 * @param {Object} spell - Spell definition
 * @returns {number} Final cooldown value
 */
export function calculateShockCooldown(ctx, spell) {
    let cooldown = spell.cooldown;
    
    if (ctx.stats.activeModifiers.reverberation > 0) {
        const reverberationValues = [0.3, 0.7, 1.0];
        const reduction = reverberationValues[ctx.stats.activeModifiers.reverberation - 1] || 0;
        cooldown = Math.max(cooldown - reduction, 5);
    }
    
    return cooldown;
}

/**
 * Calculate cooldown with Battlegear of the Ten Storms 3-set reduction
 * 
 * @param {SimContext} ctx - Simulation context
 * @param {string} spellKey - Spell key
 * @param {Object} spell - Spell definition
 * @returns {number} Final cooldown value
 */
export function calculateBattlegear3pcCooldown(ctx, spellKey, spell) {
    let cooldown = spell.cooldown;
    
    if ((spellKey === 'stormstrike' || spellKey === 'lightningStrike') && 
        ctx.stats.setBonuses?.battlegear_ten_storms_3pc_cooldown_reduction) {
        const reduction = ctx.stats.setBonuses.battlegear_ten_storms_3pc_cooldown_reduction;
        cooldown = Math.max(cooldown - reduction, 0);
        ctx.log(`[Battlegear 3-set] ${spell.name} cooldown reduced by ${reduction}s`);
    }
    
    return cooldown;
}

// Export the spell data for use by handlers
export { shamanSpells, calculateSpellDamage };

export default {
    createSimContextFromSimulator,
    handleCommonProcs,
    handleWeaponProcs,
    handleStormhowl3pc,
    handleStormhowl5pc,
    calculateShockCooldown,
    calculateBattlegear3pcCooldown
};
