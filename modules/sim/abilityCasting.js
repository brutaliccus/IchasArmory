/**
 * Ability Casting System - Centralized Ability Execution
 * 
 * @module sim/abilityCasting
 * @description Handles all ability casting in a data-driven manner.
 * 
 * ## Overview
 * This module centralizes ability execution logic:
 * - Damage calculation and recording
 * - Proc triggering through the data-driven system
 * - Cooldown and GCD management
 * - Set bonus interactions
 * 
 * ## Key Design Principle
 * All proc triggering goes through fireMeleeAttackTriggers() or fireSpellHitTriggers().
 * No ability-specific trigger calls. Adding new procs only requires updating procs.js.
 * 
 * @version 1.0.0
 * @since 2026-01-27
 */

import { shamanSpells } from '../shaman/spells.js';
import { calculateSpellDamage } from '../shaman/damageCalc.js';
import { 
    fireMeleeAttackTriggers, 
    fireSpellHitTriggers,
    fireBeingHitTriggers 
} from './triggerRouter.js';
import { 
    applyDot 
} from './dotSystem.js';
import {
    getSetBonusState,
    activateEchoedThunder,
    activateInstantLightningBolt,
    isEchoedThunderActive as isEchoedThunderActiveDD,
    isInstantLightningBoltActive as isInstantLightningBoltActiveDD,
    consumeInstantLightningBolt,
    consumeEchoedThunder,
    getDotDurationBonus,
    processMeleeHit,
    processAutoAttackSetBonuses,
    tryGarbTenStormsLightningShieldProc
} from './setBonusSystem.js';
import { consumeCharge, resolveShieldrenderPhysicalArmor } from './procEngine.js';
import { getHasteMultiplier } from './damageSystem.js';
import {
    triggerEmpoweredLightningShield
} from './lightningShieldSystem.js';
import {
    processFlametongue,
    processFrostbrandWeapon,
    processWindfuryAttack,
    isImbueActive
} from './imbueSystem.js';
import { getTrinketAttackPowerBonus } from './trinketSystem.js';

// ============================================
// PROC TRIGGERING (DATA-DRIVEN)
// ============================================

/**
 * Fire all melee attack procs
 * This is the ONLY function that should be called for melee proc triggers.
 * All melee procs (Crusader, Flurry, Badge, etc.) are handled through procs.js definitions.
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - Ability name
 * @param {string} icon - Ability icon
 * @param {Object} outcome - Attack outcome { didHit, isCrit, damage }
 */
export function triggerMeleeProcs(ctx, source, icon, outcome) {
    if (!outcome.didHit) return;
    
    // Fire all melee attack triggers through data-driven system
    fireMeleeAttackTriggers(ctx, source, icon, outcome);
}

/**
 * Fire all spell hit procs
 * This is the ONLY function that should be called for spell proc triggers.
 * All spell procs (WoC, OBD, BoED, etc.) are handled through procs.js definitions.
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - Ability name
 * @param {string} icon - Ability icon
 * @param {Object} outcome - Spell outcome { didHit, isCrit, damage, school }
 */
export function triggerSpellProcs(ctx, source, icon, outcome) {
    if (!outcome.didHit || outcome.resistType === 'full_resist') return;
    
    // Fire all spell hit triggers through data-driven system
    fireSpellHitTriggers(ctx, source, icon, outcome);
}

// ============================================
// WEAPON IMBUE HANDLING
// ============================================

/**
 * Get stats for melee damage (includes Jom Gabbar etc. trinket AP bonus)
 * @param {Object} ctx - Simulation context
 * @returns {Object} Stats object with effective attackPower
 */
function getMeleeStats(ctx) {
    const bonus = getTrinketAttackPowerBonus(ctx);
    if (!bonus) return ctx.stats;
    return { ...ctx.stats, attackPower: (ctx.stats.attackPower || 0) + bonus };
}

/**
 * Check if Hand of Justice trinket is equipped (for 2% extra melee attack proc)
 * @param {Object} ctx - Simulation context
 * @returns {boolean}
 */
function hasHandOfJustice(ctx) {
    return !!(ctx.simContext?.hasHandOfJustice || ctx.stats?.hasHandOfJustice);
}

const HAND_OF_JUSTICE_ICON = 'inv_jewelry_talisman_01';

/**
 * Execute one Hand of Justice extra attack (2% proc from melee).
 * Can proc Crusader, Flametongue, etc. Cannot proc HOJ itself or Windfury.
 * @param {Object} ctx - Simulation context
 * @returns {Object} Attack result
 */
export function executeHandOfJusticeAttack(ctx) {
    const spell = shamanSpells.autoAttack || { name: 'Auto Attack', isAutoAttack: true };
    const damageResult = calculateSpellDamage(spell, getMeleeStats(ctx));
    const outcome = ctx.rollDamage(spell, damageResult, true);

    ctx.recordDamage('Hand of Justice', outcome.damage, {
        type: 'melee',
        outcome: outcome.type
    });
    ctx.log?.(`Hand of Justice: ${outcome.damage.toFixed(2)} damage (${outcome.type})`);

    if (outcome.didHit) {
        consumeCharge(ctx, 'flurry', 'Hand of Justice');
    }
    triggerMeleeProcs(ctx, 'Hand of Justice', HAND_OF_JUSTICE_ICON, outcome);
    processWeaponImbues(ctx, 'Hand of Justice', HAND_OF_JUSTICE_ICON, outcome, {
        canProcWindfury: false,
        windfuryChance: 0,
        canProcHOJ: false
    });
    if (outcome.didHit) {
        processSpellStrikeHits(ctx, 'Hand of Justice');
    }
    processMeleeHit(ctx, 'Hand of Justice', outcome);

    return { success: true, outcome };
}

/**
 * Process weapon imbues on melee hit
 * Handles Flametongue, Windfury, and Hand of Justice (2% extra attack)
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - Ability name
 * @param {string} icon - Ability icon
 * @param {Object} outcome - Attack outcome
 * @param {Object} options - Options
 * @param {boolean} options.canProcWindfury - Whether Windfury can proc (default true)
 * @param {number} options.windfuryChance - Windfury proc chance (default 0.25)
 * Hand of Justice is data-driven (procs.js effect extraMeleeAttack, cannotProcFrom Windfury/HOJ).
 */
export function processWeaponImbues(ctx, source, icon, outcome, options = {}) {
    if (!outcome.didHit) return;
    
    const { canProcWindfury = true, windfuryChance = 0.25 } = options;
    
    // Elemental Weapons: refresh Flametongue fire damage buff on melee hit
    ctx.refreshEWFlametongueBuff?.(source);
    
    // Flametongue always procs on hit if active
    if (isImbueActive(ctx, 'flametongue_weapon')) {
        const ftResult = processFlametongue(ctx, source, icon);
        
        // Flametongue is a spell hit - trigger spell procs
        if (ftResult && ftResult.didHit) {
            triggerSpellProcs(ctx, 'Flametongue Weapon', 'spell_fire_flametounge', {
                didHit: true,
                isCrit: ftResult.isCrit,
                damage: ftResult.damage,
                school: 'fire'
            });
        }
    }

    const fbResult = processFrostbrandWeapon(ctx, source, icon);
    if (fbResult && fbResult.didHit) {
        triggerSpellProcs(ctx, 'Frostbrand Weapon', 'spell_frost_frostbrand', {
            didHit: true,
            isCrit: fbResult.isCrit,
            damage: fbResult.damage,
            school: 'frost'
        });
    }
    
    // Windfury has a 25% chance and cannot proc itself
    if (canProcWindfury && isImbueActive(ctx, 'windfury_weapon')) {
        if (ctx.rng.random() < windfuryChance) {
            // Process both Windfury attacks
            for (let i = 0; i < 2; i++) {
                const wfResult = processWindfuryAttack(ctx, i);
                if (wfResult && wfResult.didHit) {
                    // Windfury attacks can trigger melee procs (except more Windfury)
                    triggerMeleeProcs(ctx, 'Windfury Attack', 'spell_nature_cyclone', {
                        didHit: wfResult.didHit,
                        isCrit: wfResult.isCrit,
                        damage: wfResult.damage
                    });
                    
                    // Windfury attacks can proc Flametongue but not Windfury (HOJ is data-driven: cannotProcFrom in procs.js)
                    processWeaponImbues(ctx, 'Windfury Attack', 'spell_nature_cyclone', wfResult, {
                        canProcWindfury: false,
                        windfuryChance: 0
                    });
                    processMeleeHit(ctx, 'Windfury Attack', wfResult);
                }
            }
            
            // Elemental Weapons: add a haste stack on WF proc
            ctx.addEWWindfuryHasteStack?.();
        }
    }
}

// ============================================
// WEAPON ENCHANT DAMAGE (SPELL STRIKE)
// ============================================

/**
 * Process weapon enchant "spell strike" damage on melee hit
 * Weapon enchants like Fiery Weapon add spell damage to each melee hit.
 * These hits can crit independently and trigger spell procs (WoC, OBD, etc.).
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} triggerName - Ability name that triggered this (for logging)
 */
export function processSpellStrikeHits(ctx, triggerName) {
    const sources = ctx.stats?.spellStrikeSources || [];
    if (sources.length === 0) return;
    
    const spellStrikeIcons = {
        Fire: 'spell_fire_fireball02',
        Nature: 'spell_nature_callstorm',
        Holy: 'spell_holy_searinglight'
    };
    
    for (const { value, school } of sources) {
        const schoolLow = (school || 'physical').toLowerCase();
        
        // Roll for resistance
        const resistResult = ctx.rollForResistance(schoolLow);
        let damage = value * resistResult.multiplier;
        
        // Full resist = no damage, record and continue
        if (resistResult.type === 'full_resist') {
            ctx.recordDamage(`Spell Strike (${school})`, 0, {
                type: 'spell',
                outcome: 'full_resist',
                resistType: 'full_resist'
            });
            continue;
        }
        
        // Roll for crit
        const isCrit = ctx.rollForCrit({ canCrit: true }, false);
        
        // Crit multiplier: elemental schools can benefit from Elemental Fury
        const elementalSchools = ['fire', 'nature', 'frost'];
        const efRank = ctx.stats?.activeModifiers?.elementalFury || 0;
        const critMult = elementalSchools.includes(schoolLow)
            ? (efRank === 2 ? 2.0 : (efRank === 1 ? 1.75 : 1.5))
            : 1.5;
        
        if (isCrit) {
            damage *= critMult;
        }
        
        // Record damage
        ctx.recordDamage(`Spell Strike (${school})`, damage, {
            type: 'spell',
            outcome: isCrit ? 'crit' : 'hit',
            resistType: resistResult.type
        });
        
        // Fire spell hit triggers (WoC, OBD, BoED, Elemental Focus on crit)
        const icon = spellStrikeIcons[school] || 'spell_nature_callstorm';
        fireSpellHitTriggers(ctx, `Spell Strike (${school})`, icon, {
            didHit: true,
            isCrit,
            damage,
            school: schoolLow
        });
    }
}

// ============================================
// SET BONUS HANDLING
// ============================================

// NOTE: Stormhowl 3pc, 5pc, and Incendosaur 3pc are handled by processMeleeHit() 
// from setBonusSystem.js - imported above. These functions below are for 
// NON-melee set bonuses (shocks, Lightning Strike specific).

/**
 * Process Garb 5pc - Lightning Shield on shock hit without consuming charge
 * @param {Object} ctx - Simulation context
 * @param {string} source - Ability name (shock name)
 * @param {Object} outcome - Spell outcome
 */
export function processGarb5pc(ctx, spellKey, outcome) {
    tryGarbTenStormsLightningShieldProc(ctx, spellKey, outcome);
}

/**
 * Process Battlegear 5pc - Echoed Thunder on Lightning Strike
 * @param {Object} ctx - Simulation context
 * @param {Object} outcome - Attack outcome
 */
export function processBattlegear5pc(ctx, outcome) {
    if (!outcome.didHit) return;
    
    const hasBonus = ctx.stats?.setBonuses?.battlegear_ten_storms_5pc_echoed_thunder;
    if (!hasBonus) return;
    
    if (!isEchoedThunderActiveDD(ctx)) {
        activateEchoedThunder(ctx);
    }
}

/**
 * Process Battlegear 8pc - Instant Lightning Bolt on Stormstrike hit (50% chance)
 * @param {Object} ctx - Simulation context
 * @param {Object} outcome - Attack outcome
 */
export function processBattlegear8pc(ctx, outcome) {
    if (!outcome.didHit) return;
    
    const procChance = ctx.stats?.setBonuses?.battlegear_ten_storms_8pc_lightning_bolt_proc;
    if (!procChance) return;
    
    if (ctx.rng.random() < procChance) {
        activateInstantLightningBolt(ctx);
        ctx.log?.(`[Battlegear 8pc] Instant Lightning Bolt proc'd!`);
    }
}

// ============================================
// COOLDOWN CALCULATION
// ============================================

/**
 * Calculate shock cooldown with Reverberation
 * @param {Object} ctx - Simulation context
 * @param {Object} spell - Spell definition
 * @returns {number} Adjusted cooldown
 */
export function calculateShockCooldown(ctx, spell) {
    let cooldown = spell.cooldown || 6;
    
    const reverb = ctx.stats?.activeModifiers?.reverberation || 0;
    if (reverb > 0) {
        const reductions = [0.3, 0.7, 1.0];
        cooldown = Math.max(cooldown - (reductions[reverb - 1] || 0), 5);
    }
    
    return cooldown;
}

/**
 * Calculate ability cooldown with Battlegear 3pc reduction
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - Spell key
 * @param {Object} spell - Spell definition
 * @returns {number} Adjusted cooldown
 */
export function calculateAbilityCooldown(ctx, spellKey, spell) {
    let cooldown = spell.cooldown || 0;
    const baseCooldown = cooldown;
    
    // Battlegear 3pc reduces Stormstrike and Lightning Strike cooldowns
    if ((spellKey === 'stormstrike' || spellKey === 'lightningStrike') && 
        ctx.stats?.setBonuses?.battlegear_ten_storms_3pc_cooldown_reduction) {
        const reduction = ctx.stats.setBonuses.battlegear_ten_storms_3pc_cooldown_reduction;
        cooldown = Math.max(cooldown - reduction, 0);
        if (ctx.log && baseCooldown !== cooldown) {
            ctx.log(`[T2 3pc] ${spellKey} cooldown: ${baseCooldown}s -> ${cooldown}s (-${reduction}s)`);
        }
    }
    
    return cooldown;
}

// ============================================
// ABILITY EXECUTION
// ============================================

/**
 * Execute a generic ability cast
 * Handles damage, procs, cooldowns, and GCD
 * 
 * @param {Object} ctx - Simulation context (the simulator)
 * @param {string} spellKey - Spell key from shamanSpells
 * @param {Object} options - Options
 * @returns {Object} Cast result
 */
export function executeAbility(ctx, spellKey, options = {}) {
    const spell = shamanSpells[spellKey];
    if (!spell) {
        ctx.log?.(`ERROR: Spell ${spellKey} not found`);
        return { success: false, error: 'spell_not_found' };
    }
    
    const spellName = spell.name || spellKey;
    const icon = spell.icon || null;
    
    // Calculate damage
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    const isPhysical = spell.school === 'physical' || spell.isAutoAttack;
    
    // Roll for hit/crit/resist
    const outcome = ctx.rollDamage(spell, damageResult, isPhysical);
    
    // Record damage
    ctx.recordDamage(spellName, outcome.damage, {
        type: 'ability',
        outcome: outcome.type,
        resistType: outcome.resistType || 'none'
    });
    
    // Log
    ctx.log(`Cast ${spellName}: ${outcome.damage.toFixed(2)} damage (${outcome.type})`);
    
    // Trigger procs based on ability type
    if (isPhysical || spell.usesMeleeHit) {
        // Melee ability
        triggerMeleeProcs(ctx, spellName, icon, outcome);
        processWeaponImbues(ctx, spellName, icon, outcome);
        processMeleeHit(ctx, spellName, outcome);
    }
    
    if (spell.school && spell.school !== 'physical' && !spell.isAutoAttack) {
        // Spell
        triggerSpellProcs(ctx, spellName, icon, {
            ...outcome,
            school: spell.school
        });
    }
    
    // Handle cooldown
    if (spell.cooldown) {
        const isShock = ['earthShock', 'frostShock', 'flameShock'].includes(spellKey);
        if (isShock) {
            ctx.setCooldown('shocks', calculateShockCooldown(ctx, spell));
            processGarb5pc(ctx, spellKey, outcome);
        } else {
            ctx.setCooldown(spellKey, calculateAbilityCooldown(ctx, spellKey, spell));
        }
    }
    
    // Trigger GCD
    ctx.triggerGCD();
    
    return {
        success: true,
        outcome,
        damage: outcome.damage,
        didHit: outcome.didHit,
        isCrit: outcome.isCrit
    };
}

/**
 * Execute Stormstrike with all its special handling
 * @param {Object} ctx - Simulation context
 * @returns {Object} Cast result
 */
export function executeStormstrike(ctx) {
    const spell = shamanSpells.stormstrike;
    const spellName = 'Stormstrike';
    const icon = spell.icon || 'ability_shaman_stormstrike';
    
    // Calculate and roll damage (melee: include trinket AP)
    const damageResult = calculateSpellDamage(spell, getMeleeStats(ctx));
    const outcome = ctx.rollDamage(spell, damageResult, true);
    
    // Record damage
    ctx.recordDamage(spellName, outcome.damage, {
        type: 'ability',
        outcome: outcome.type,
        resistType: 'none'
    });
    
    ctx.log(`Cast ${spellName}: ${outcome.damage.toFixed(2)} damage (${outcome.type})`);
    
    // Apply Stormstrike debuff
    if (outcome.didHit) {
        ctx.stats.applyStormstrike();
        ctx.log('Stormstrike debuff applied (2 charges)');
        
        // Track buff uptime
        if (ctx.buffUptime?.stormstrike) {
            ctx.buffUptime.stormstrike.activationTimes.push({
                start: ctx.currentTime,
                end: null,
                charges: 2
            });
            ctx.buffUptime.stormstrike.procs++;
        }
    }
    
    // Consume Elemental Focus charge (Stormstrike consumes clearcasting)
    consumeCharge(ctx, 'elemental_focus', 'Stormstrike');
    
    // Fire melee procs
    triggerMeleeProcs(ctx, spellName, icon, outcome);
    
    // Weapon imbues
    processWeaponImbues(ctx, spellName, icon, outcome);
    
    // Note: Flurry only consumed by auto attacks, not Stormstrike
    
    // Set bonus procs (melee hit + specific)
    processMeleeHit(ctx, spellName, outcome);
    processBattlegear8pc(ctx, outcome);
    
    // Cooldown with Battlegear 3pc reduction
    const cooldown = calculateAbilityCooldown(ctx, 'stormstrike', spell);
    ctx.setCooldown('stormstrike', cooldown);
    
    // GCD
    ctx.triggerGCD();
    
    return { success: true, outcome };
}

/**
 * Execute Lightning Strike with physical/nature split
 * @param {Object} ctx - Simulation context
 * @returns {Object} Cast result
 */
export function executeLightningStrike(ctx) {
    const spell = shamanSpells.lightningStrike;
    const spellName = 'Lightning Strike';
    const icon = spell.icon || 'spell_nature_thunderclap';
    
    // Calculate damage (physical portion uses melee stats / trinket AP)
    const damageResult = calculateSpellDamage(spell, getMeleeStats(ctx));
    
    // Check for Lightning Shield charges (needed for ELS)
    const hadCharges = (ctx.getLightningShieldCharges?.() || ctx.lightningShieldCharges || 0) > 0;
    
    // Roll damage ranges
    const physicalBase = ctx.rng.random() * (damageResult.physicalMax - damageResult.physicalMin) + damageResult.physicalMin;
    const natureBase = ctx.rng.random() * (damageResult.natureMax - damageResult.natureMin) + damageResult.natureMin;
    
    // Check melee avoidance for physical portion
    const avoidance = ctx.stats.getTotalMeleeAvoidance(false);
    const avoidRoll = ctx.rng.random();
    let didHit = true;
    let hitType = 'hit';
    
    if (avoidRoll < avoidance.miss) {
        hitType = 'miss';
        didHit = false;
    } else if (avoidRoll < avoidance.miss + avoidance.dodge) {
        hitType = 'dodge';
        didHit = false;
    } else if (avoidRoll < avoidance.miss + avoidance.dodge + avoidance.parry) {
        hitType = 'parry';
        didHit = false;
    }
    
    // Physical portion
    let physicalDamage = 0;
    let physicalOutcome = hitType;
    let physicalIsCrit = false;
    
    if (didHit) {
        const sr = resolveShieldrenderPhysicalArmor(ctx, spell, spell.name);
        physicalDamage = physicalBase * (sr.ignoreArmor ? 1 : ctx.stats.getArmorDamageMultiplier());
        physicalIsCrit = ctx.rollForCrit(spell, true);
        if (physicalIsCrit) {
            // Physical component uses standard 2.0x crit (not affected by Elemental Fury)
            physicalDamage *= 2.0;
            physicalOutcome = 'crit';
        }
    }
    
    // Nature portion
    let natureDamage = 0;
    let natureOutcome = hitType;
    let natureIsCrit = false;
    let natureResistType = 'none';
    
    if (didHit) {
        natureDamage = natureBase;
        const resistResult = ctx.rollForResistance('nature');
        natureDamage *= resistResult.multiplier;
        natureResistType = resistResult.type;
        
        if (resistResult.type !== 'full_resist') {
            natureIsCrit = ctx.rollForCrit(spell, false);
            if (natureIsCrit) {
                const efRank = ctx.stats.activeModifiers?.elementalFury || 0;
                natureDamage *= efRank >= 2 ? 2.0 : (efRank === 1 ? 1.75 : 1.5);
                natureOutcome = 'crit';
            } else {
                natureOutcome = 'hit';
            }
            
            // Apply buff multipliers
            if (ctx.stats.activeModifiers?.elementalMastery) natureDamage *= 1.15;
            if (ctx.stats.activeModifiers?.naturalAlignmentCrystal) natureDamage *= 1.20;
            if (ctx.nightfallEnabled && ctx.isNightfallActive?.()) natureDamage *= 1.10;
        } else {
            natureDamage = 0;
            natureOutcome = 'full_resist';
        }
    }
    
    // Record damage
    ctx.recordDamage('Lightning Strike (Physical)', physicalDamage, { type: 'ability', outcome: physicalOutcome });
    ctx.recordDamage('Lightning Strike (Nature)', natureDamage, { type: 'ability', outcome: natureOutcome, resistType: natureResistType });
    
    ctx.log(`Cast ${spellName}: ${physicalDamage.toFixed(2)} physical (${physicalOutcome}) + ${natureDamage.toFixed(2)} nature (${natureOutcome})`);
    
    // Proc Empowered Lightning Shield if we had charges
    if (didHit && hadCharges) {
        triggerEmpoweredLightningShield(ctx, spellName, true);
    }
    
    // Fire melee procs for physical portion
    triggerMeleeProcs(ctx, 'Lightning Strike (Physical)', icon, {
        didHit,
        isCrit: physicalIsCrit,
        damage: physicalDamage
    });
    
    // Lightning Strike (Nature) does NOT proc Wrath of Cenarius or other onSpellHit procs

    // Consume Elemental Focus charge (Lightning Strike consumes clearcasting)
    consumeCharge(ctx, 'elemental_focus', 'Lightning Strike');
    
    // Weapon imbues
    processWeaponImbues(ctx, spellName, icon, { didHit, isCrit: physicalIsCrit });
    
    // Note: Flurry only consumed by auto attacks, not Lightning Strike
    
    // Set bonus procs (melee hit + Lightning Strike specific)
    // Note: T2 8pc (Instant LB) procs from Stormstrike, not Lightning Strike
    processMeleeHit(ctx, spellName, { didHit });
    processBattlegear5pc(ctx, { didHit });
    
    // Cooldown with Battlegear 3pc reduction
    const cooldown = calculateAbilityCooldown(ctx, 'lightningStrike', spell);
    ctx.setCooldown('lightningStrike', cooldown);
    
    // GCD
    ctx.triggerGCD();
    
    return {
        success: true,
        didHit,
        physicalDamage,
        natureDamage,
        physicalIsCrit,
        natureIsCrit
    };
}

/**
 * Execute a shock spell
 * @param {Object} ctx - Simulation context
 * @param {string} spellKey - 'earthShock', 'flameShock', or 'frostShock'
 * @returns {Object} Cast result
 */
export function executeShock(ctx, spellKey) {
    const spell = shamanSpells[spellKey];
    const spellName = spell.name;
    const icon = spell.icon;
    
    // Consume Elemental Focus charge (spell cast)
    consumeCharge(ctx, 'elemental_focus', spellName);
    
    // Calculate and roll damage
    const damageResult = calculateSpellDamage(spell, ctx.stats);
    const outcome = ctx.rollDamage(spell, damageResult, false);
    
    // Record damage
    ctx.recordDamage(spellName, outcome.damage, {
        type: 'ability',
        outcome: outcome.type,
        resistType: outcome.resistType || 'none'
    });
    
    ctx.log(`Cast ${spellName}: ${outcome.damage.toFixed(2)} damage (${outcome.type})`);
    
    // Fire spell procs
    triggerSpellProcs(ctx, spellName, icon, {
        ...outcome,
        school: spell.school
    });
    
    // Flame Shock DOT
    if (spellKey === 'flameShock' && outcome.didHit) {
        const durationBonus = getDotDurationBonus(ctx, 'flameShockDot');
        applyDot(ctx, 'flameShockDot', { durationBonus });
    }
    
    // Shock cooldown with Reverberation
    ctx.setCooldown('shocks', calculateShockCooldown(ctx, spell));
    
    // Garb 5pc
    processGarb5pc(ctx, spellKey, outcome);
    
    // GCD
    ctx.triggerGCD();
    
    return { success: true, outcome };
}

/**
 * Execute auto attack with full proc handling
 * 
 * Handles:
 * - Damage calculation and recording
 * - Parry haste (if boss parried, accelerate next enemy attack)
 * - Echoed Thunder consumption (T2 5pc)
 * - Flurry charge consumption
 * - Melee procs (Crusader, Flurry, etc.)
 * - Weapon imbues (Flametongue, Windfury)
 * - Spell strike hits (weapon enchants)
 * - Set bonus procs (Stormhowl 3pc/5pc, Incendosaur)
 * - Windfury miss haste consumption
 * - Next auto attack scheduling
 * 
 * @param {Object} ctx - Simulation context
 * @param {Object} options - Options
 * @param {boolean} options.scheduleNext - Whether to schedule next auto (default true)
 * @returns {Object} Attack result
 */
export function executeAutoAttack(ctx, options = {}) {
    const { scheduleNext = true } = options;
    const spell = shamanSpells.autoAttack || { name: 'Auto Attack', isAutoAttack: true };
    const icon = ctx.getMainhandIcon?.() || 'inv_sword_04';
    
    // Calculate damage (use melee stats for Jom Gabbar etc.)
    const damageResult = calculateSpellDamage(spell, getMeleeStats(ctx));
    const outcome = ctx.rollDamage(spell, damageResult, true);
    
    // Record damage
    ctx.recordDamage('Auto Attack', outcome.damage, {
        type: 'melee',
        outcome: outcome.type
    });
    
    // Log
    ctx.log?.(`Auto Attack: ${outcome.damage.toFixed(2)} damage (${outcome.type})`);
    
    // === PARRY HASTE ===
    // If boss parried this attack, accelerate the next enemy attack
    if (outcome.type === 'parry' && ctx.stats?.combatConfig?.beingAttacked) {
        const remainingSwingTime = (ctx.nextEnemyAttack || 0) - ctx.currentTime;
        const baseBossSwingTime = ctx.enemySwingTimer || 2.0;
        const minAllowedTime = baseBossSwingTime * 0.20; // 20% of base timer
        
        // Calculate new timer after 40% reduction
        const reducedTime = remainingSwingTime * 0.60;
        
        // Only apply if it doesn't go below 20% threshold
        if (reducedTime >= minAllowedTime && remainingSwingTime > 0) {
            const originalNextAttackTime = ctx.nextEnemyAttack;
            ctx.nextEnemyAttack = ctx.currentTime + reducedTime;
            ctx.log?.(`[Parry Haste] Boss parried. Next attack moved from ${originalNextAttackTime?.toFixed(2)}s to ${ctx.nextEnemyAttack.toFixed(2)}s`);
        }
    }
    
    // === ECHOED THUNDER (T2 5pc) ===
    // If Echoed Thunder is active and we hit, consume it for bonus nature damage
    if (isEchoedThunderActiveDD(ctx) && outcome.didHit) {
        const etResult = consumeEchoedThunder(ctx, outcome.damage);
        if (etResult && etResult.damage > 0) {
            ctx.log?.(`[Echoed Thunder] Auto Attack triggered: ${etResult.damage.toFixed(2)} nature damage`);
        }
    }
    
    // === FLURRY CHARGE CONSUMPTION ===
    // Consume a Flurry charge after each auto attack (if Flurry is active)
    if (outcome.didHit) {
        consumeCharge(ctx, 'flurry', 'Auto Attack');
    }
    
    // === MELEE PROCS ===
    // Fire all melee hit triggers (Crusader, Flurry on crit, Badge, etc.)
    triggerMeleeProcs(ctx, 'Auto Attack', icon, outcome);
    
    // === WEAPON IMBUES ===
    // Windfury can proc on auto attacks
    processWeaponImbues(ctx, 'Auto Attack', icon, outcome, {
        canProcWindfury: true,
        windfuryChance: 0.25
    });
    
    // === SPELL STRIKE HITS ===
    // Weapon enchant damage (Fiery Weapon, etc.)
    if (outcome.didHit) {
        processSpellStrikeHits(ctx, 'Auto Attack');
    }
    
    // === SET BONUS PROCS ===
    // Stormhowl 3pc, Incendosaur 3pc handled by processMeleeHit
    processMeleeHit(ctx, 'Auto Attack', outcome);
    // Stormhowl 5pc (Stormwolf's Frenzy) only procs on auto attacks
    processAutoAttackSetBonuses(ctx, outcome);
    
    // Elemental Weapons: refresh FT buff on auto attack hit (new engine path)
    if (outcome.didHit) {
        ctx.refreshEWFlametongueBuff?.('Auto Attack');
    }
    
    // === SCHEDULE NEXT AUTO ATTACK ===
    if (scheduleNext) {
        const hasteMultiplier = getHasteMultiplier(ctx);
        // Use unhasted base weapon speed so haste is applied dynamically (stats.weaponSpeed is pre-hasted from UI)
        const baseSpeed = ctx.baseWeaponSpeed ?? ctx.stats?.baseWeaponSpeed ?? 2.5;
        const adjustedSpeed = baseSpeed / hasteMultiplier;
        ctx.nextAutoAttack = ctx.currentTime + adjustedSpeed;
        
        // Schedule event if within fight duration
        if (ctx.nextAutoAttack <= ctx.fightDuration && ctx.scheduleEvent) {
            ctx.unscheduleEvent?.('autoAttack');
            ctx.scheduleEvent(ctx.nextAutoAttack, 'autoAttack', () => {
                executeAutoAttack(ctx);
            }, 'autoAttack');
        }
    }
    
    return { success: true, outcome };
}

// ============================================
// STORMSTRIKE CHARGE MANAGEMENT
// ============================================

/**
 * Consume a Stormstrike charge with buff uptime tracking
 * Updates the buffUptime.stormstrike end time when charges are depleted
 * 
 * @param {Object} ctx - Simulation context
 * @param {string} source - What consumed the charge (for logging)
 */
export function consumeStormstrikeChargeWithTracking(ctx, source = 'spell') {
    if (!ctx.stats?.activeModifiers) return;
    
    const charges = ctx.stats.activeModifiers.stormstrikeCharges || 0;
    if (charges <= 0) return;
    
    // Consume the charge
    ctx.stats.consumeStormstrikeCharge?.();
    
    const newCharges = ctx.stats.activeModifiers.stormstrikeCharges || 0;
    
    ctx.log?.(`Stormstrike charge consumed by ${source} (${newCharges} remaining)`);
    
    // Update buff uptime when charges depleted
    if (newCharges === 0 && ctx.buffUptime?.stormstrike) {
        const tracker = ctx.buffUptime.stormstrike;
        const lastActivation = tracker.activationTimes[tracker.activationTimes.length - 1];
        if (lastActivation && !lastActivation.end) {
            lastActivation.end = ctx.currentTime;
            lastActivation.duration = lastActivation.end - lastActivation.start;
        }
        ctx.log?.('Stormstrike debuff faded (charges depleted)');
    }
}

// ============================================
// EXPORTS
// ============================================

export default {
    // Proc triggering
    triggerMeleeProcs,
    triggerSpellProcs,
    processWeaponImbues,
    
    // Weapon enchant damage
    processSpellStrikeHits,
    
    // Set bonus handling (non-melee specific)
    // Note: processMeleeHit from setBonusSystem.js handles Stormhowl 3pc/5pc and Incendosaur 3pc
    processGarb5pc,
    processBattlegear5pc,
    processBattlegear8pc,
    
    // Cooldown calculation
    calculateShockCooldown,
    calculateAbilityCooldown,
    
    // Stormstrike charge management
    consumeStormstrikeChargeWithTracking,
    
    // Ability execution
    executeAbility,
    executeStormstrike,
    executeLightningStrike,
    executeShock,
    executeAutoAttack
};
