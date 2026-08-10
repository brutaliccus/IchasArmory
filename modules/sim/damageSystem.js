import { isTargetSchoolImmune } from '../shaman/targetSchoolImmunity.js';
import { resolveShieldrenderPhysicalArmor } from './procEngine.js';

/**
 * Damage System Module
 * 
 * @module sim/damageSystem
 * @description Handles all damage calculation, resistance rolls, and damage recording.
 * 
 * ## Overview
 * This module is responsible for:
 * - Rolling for damage outcomes (hit/crit/miss/dodge/parry/glancing)
 * - Calculating resistance effects
 * - Recording damage events for breakdown tracking
 * - Applying armor reduction
 * - Managing crit multipliers
 * 
 * ## Attack Table (Melee)
 * The melee attack table determines outcomes in this order:
 * 1. Miss (based on hit rating vs boss level)
 * 2. Dodge (boss dodge chance)
 * 3. Parry (boss parry chance, if in front)
 * 4. Glancing (40% for auto attacks only)
 * 5. Crit (remaining crit chance)
 * 6. Hit (everything else)
 * 
 * ## Resistance Mechanics
 * - Uses WoW Classic resistance table with breakpoints at 15/30/45/60/75%
 * - Interpolates between breakpoints for smooth transitions
 * - Spell penetration reduces effective resistance
 * 
 * ## Usage
 * This module is designed to be used by the combat simulator.
 * It requires access to:
 * - Stats object (for hit/crit/resistance values)
 * - RNG function (for random rolls)
 * - Combat stats tracker (for recording outcomes)
 * 
 * @version 1.0.0
 * @since 2026-01-25
 * 
 * ## TODO: Full Extraction
 * This module currently contains documentation and helper functions.
 * The full rollDamage/rollForResistance extraction is planned for
 * when we can do comprehensive regression testing.
 */

/**
 * Resistance outcome table (royalgiraffe model)
 * 4 reference points at 0, 1/3, 2/3, and 3/3 of resistance cap.
 * Each row: [% chance of 0% resist, 25% resist, 50% resist, 75% resist]
 * Values linearly interpolated between reference points.
 * Source: https://royalgiraffe.github.io/legacy-sim/#/resistances
 * @constant
 */
export const RESISTANCE_TABLE = [
    [100,  0,  0,  0],   // ratio = 0/3 (0% of cap)
    [ 24, 55, 18,  3],   // ratio = 1/3 (~33% of cap)
    [  0, 22, 56, 22],   // ratio = 2/3 (~67% of cap)
    [  0,  4, 16, 80]    // ratio = 3/3 (100% of cap)
];

/**
 * Calculate resistance stats for a player casting on a boss.
 * Implements the royalgiraffe resistance model:
 *   resistanceCap = max(5 * attackerLevel, 100)
 *   levelBasedResistance = 8 * max(0, targetLevel - attackerLevel)  [non-binary, player→NPC]
 *   effectiveResistance = max(0, resistance - spellPen) + levelBasedResistance
 *   ratio = min(1, effectiveResistance / resistanceCap)
 *
 * @param {number} resistance - Target's base resistance value
 * @param {number} spellPen - Caster's spell penetration
 * @param {number} attackerLevel - Caster's level (default 60)
 * @param {number} targetLevel - Target's level (default 63)
 * @param {boolean} isBinary - Whether the spell is binary
 * @returns {{ratio: number, avgMitigation: number, effectiveResistance: number, levelBasedResistance: number, resistanceCap: number}}
 */
export function calculateResistanceStats(resistance, spellPen = 0, attackerLevel = 60, targetLevel = 63, isBinary = false) {
    const resistanceCap = Math.max(5 * attackerLevel, 100);
    const levelBasedResistance = isBinary ? 0 : 8 * Math.max(0, targetLevel - attackerLevel);
    const effectiveResistance = Math.max(0, resistance - spellPen) + levelBasedResistance;
    const ratio = Math.min(1, effectiveResistance / resistanceCap);
    const avgMitigation = 0.75 * ratio - (isBinary ? 0 : 3 / 16) * Math.max(0, ratio - 2 / 3);

    return { ratio, avgMitigation, effectiveResistance, levelBasedResistance, resistanceCap };
}

/**
 * Get interpolated resistance outcome probabilities from the 4-point table.
 *
 * @param {number} ratio - Resistance ratio (effectiveResistance / cap), 0-1
 * @returns {number[]} Array of 4 probabilities (0-1) for [0% resist, 25% resist, 50% resist, 75% resist]
 */
export function getResistanceTableEntry(ratio) {
    ratio = Math.max(0, Math.min(1, ratio));

    if (ratio >= 1) return RESISTANCE_TABLE[3].map(v => v / 100);

    const idx = Math.floor(3 * ratio);
    const frac = 3 * ratio - idx;

    const lower = RESISTANCE_TABLE[idx];
    const upper = RESISTANCE_TABLE[Math.min(idx + 1, 3)];
    const result = [];
    for (let i = 0; i < 4; i++) {
        result.push((lower[i] * (1 - frac) + upper[i] * frac) / 100);
    }

    // Minimum 1% chance of full damage when below 2/3 cap
    if (ratio < 2 / 3 - 1e-6) {
        result[0] = Math.max(0.01, result[0]);
    }

    return result;
}

/**
 * Calculate expected damage multiplier from resistance ratio.
 * Used for deterministic/expected DPS calculations.
 * 
 * @param {number} ratio - Resistance ratio (effectiveResistance / cap), 0-1
 * @returns {number} Expected damage multiplier (0-1)
 */
export function calculateExpectedResistanceMultiplier(ratio) {
    const table = getResistanceTableEntry(ratio);
    // Weighted average: p(0% resist)*1.0 + p(25% resist)*0.75 + p(50% resist)*0.5 + p(75% resist)*0.25
    return table[0] * 1.0 + table[1] * 0.75 + table[2] * 0.50 + table[3] * 0.25;
}

/**
 * Calculate mitigation percent from resistance value (convenience wrapper).
 * Returns a 0-75 percentage for backward compatibility with tooltip display.
 * 
 * @param {number} resistance - The resistance value
 * @param {number} spellPen - Spell penetration value (reduces resistance)
 * @param {number} attackerLevel - Caster's level (default 60)
 * @param {number} targetLevel - Target's level (default 63)
 * @param {boolean} isBinary - Whether the spell is binary
 * @returns {number} Mitigation percentage (0-75)
 */
export function calculateMitigationPercent(resistance, spellPen = 0, attackerLevel = 60, targetLevel = 63, isBinary = false) {
    const stats = calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, isBinary);
    return stats.avgMitigation * 100;
}

/**
 * Damage outcome types
 * @enum {string}
 */
export const DamageOutcome = {
    HIT: 'hit',
    CRIT: 'crit',
    MISS: 'miss',
    DODGE: 'dodge',
    PARRY: 'parry',
    GLANCING: 'glancing',
    FULL_RESIST: 'full_resist'
};

/**
 * Resist types for partial resists
 * @enum {string}
 */
export const ResistType = {
    NONE: 'none',
    RESIST_25: 'resist_25',
    RESIST_50: 'resist_50',
    RESIST_75: 'resist_75',
    FULL_RESIST: 'full_resist'
};

/**
 * Roll for resistance outcome using the 4-point interpolation table.
 * Non-binary spells can get 0%/25%/50%/75% resist (no 100% resist).
 * 
 * @param {number} ratio - Resistance ratio (effectiveResistance / cap), 0-1
 * @param {Function} rng - Random number generator function (returns 0-1)
 * @returns {{multiplier: number, type: string}} Damage multiplier and resist type
 */
export function rollResistance(ratio, rng) {
    const table = getResistanceTableEntry(ratio);
    const roll = rng();
    
    let cumulative = 0;
    
    // 0% resist (full damage)
    cumulative += table[0];
    if (roll < cumulative) {
        return { multiplier: 1.0, type: ResistType.NONE };
    }
    
    // 25% resist
    cumulative += table[1];
    if (roll < cumulative) {
        return { multiplier: 0.75, type: ResistType.RESIST_25 };
    }
    
    // 50% resist
    cumulative += table[2];
    if (roll < cumulative) {
        return { multiplier: 0.5, type: ResistType.RESIST_50 };
    }
    
    // 75% resist
    return { multiplier: 0.25, type: ResistType.RESIST_75 };
}

/**
 * Calculate armor damage reduction
 * Formula: Reduction = Armor / (Armor + 400 + 85 * AttackerLevel)
 * 
 * @param {number} armor - Target armor value
 * @param {number} attackerLevel - Attacker's level (default 60)
 * @returns {number} Damage multiplier (1 - reduction)
 */
export function calculateArmorReduction(armor, attackerLevel = 60) {
    const reduction = armor / (armor + 400 + 85 * attackerLevel);
    return 1 - reduction;
}

/**
 * Get crit multiplier for a spell school
 * 
 * @param {string} school - Spell school ('physical', 'fire', 'frost', 'nature', etc.)
 * @param {number} elementalFuryRank - Rank of Elemental Fury talent (0-2)
 * @param {boolean} isEchoedThunder - Special case for Echoed Thunder (always 1.5x)
 * @returns {number} Crit damage multiplier
 */
export function getCritMultiplier(school, elementalFuryRank = 0, isEchoedThunder = false) {
    // Echoed Thunder always uses 1.5x (doesn't benefit from Elemental Fury crit bonus)
    if (isEchoedThunder) {
        return 1.5;
    }

    const efRanks = Number(elementalFuryRank) || 0;
    
    // Physical crits are always 2x
    if (school === 'physical') {
        return 2.0;
    }
    
    // Elemental schools get Elemental Fury crit bonus
    if (school === 'fire' || school === 'frost' || school === 'nature') {
        // 1.5x base, +0.25x per rank of Elemental Fury (max 2.0x at rank 2)
        return efRanks >= 2 ? 2.0 : (efRanks === 1 ? 1.75 : 1.5);
    }
    
    // Other schools (shadow, arcane, holy) use default 1.5x
    return 1.5;
}

// ============================================
// STANDALONE DAMAGE FUNCTIONS (v1.7.0)
// ============================================

/**
 * Roll for crit (standalone function)
 * 
 * @param {Object} ctx - Simulation context with stats, rng
 * @param {Object} spell - Spell definition
 * @param {boolean} isMelee - Whether this is a melee attack
 * @returns {boolean} True if crit
 */
export function rollForCrit(ctx, spell, isMelee = false) {
    const stats = ctx.stats;
    let critChance = isMelee ? stats.meleeCrit : stats.spellCrit;

    // Add Element's Grace crit bonus if applicable
    if (stats.getElementsGraceCritBonus) {
        critChance += stats.getElementsGraceCritBonus(spell);
    }

    // Winter's Chill: +% spell crit for Frost spells only
    if (!isMelee && spell.school === 'frost' && stats.wintersChillFrostCritBonus) {
        critChance += stats.wintersChillFrostCritBonus;
    }

    // Crit suppression: -3% crit chance vs level 63 bosses (ONLY applies to melee attacks, not spells)
    if (isMelee) {
        critChance -= 0.03;
    }

    // Ensure crit chance doesn't go negative
    critChance = Math.max(0, critChance);

    // Wrap RNG call to preserve 'this' binding for FastRNG.random()
    const roll = ctx.rng ? ctx.rng.random() : Math.random();
    return roll < critChance;
}

/**
 * Roll for resistance (standalone function).
 * Uses the royalgiraffe resistance model with level-based resistance.
 * 
 * @param {Object} ctx - Simulation context with stats, rng
 * @param {string} school - Spell school
 * @param {Object} [options] - Options
 * @param {boolean} [options.isBinary=false] - Whether the spell is binary
 * @param {boolean} [options.isDot=false] - Whether this is a DOT tick (resistance scaled to 1/10th)
 * @returns {{multiplier: number, type: string}} Resistance result
 */
export function rollForResistanceStandalone(ctx, school, options = {}) {
    // Support legacy boolean third arg for isBinary
    const isBinary = typeof options === 'boolean' ? options : (options.isBinary || false);
    const isDot = typeof options === 'object' ? (options.isDot || false) : false;

    const stats = ctx.stats;

    if (school && isTargetSchoolImmune(stats, school, false)) {
        return { multiplier: 0, type: 'immune' };
    }
    
    // Get resistance value based on school
    let resistance = 0;
    switch (school) {
        case 'nature': resistance = stats.natureResist || 0; break;
        case 'fire': resistance = stats.fireResist || 0; break;
        case 'frost': resistance = stats.frostResist || 0; break;
        case 'shadow': resistance = stats.shadowResist || 0; break;
        case 'arcane': resistance = stats.arcaneResist || 0; break;
        case 'holy': resistance = stats.holyResist || 0; break;
        default: return { multiplier: 1.0, type: 'none' };
    }
    
    const spellPen = stats.spellPen || 0;
    const attackerLevel = stats.playerLevel || 60;
    const targetLevel = stats.targetLevel || 63;
    
    if (isDot) {
        // DOTs use 1/10th effective resistance:
        // - The hidden level-based resistance (8 * levelDiff = 24) becomes 2.4
        // - Any gear/buff resistance beyond that is also divided by 10
        const resistStats = calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, isBinary);
        const dotRatio = Math.min(1, resistStats.ratio / 10);
        const rngFn = ctx.rng ? () => ctx.rng.random() : Math.random;
        return rollResistance(dotRatio, rngFn);
    }
    
    const resistStats = calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, isBinary);
    
    // Wrap RNG call to preserve 'this' binding for FastRNG.random()
    const rngFn = ctx.rng ? () => ctx.rng.random() : Math.random;
    
    return rollResistance(resistStats.ratio, rngFn);
}

/**
 * Get spell hit bonus from active effects (Elemental Devastation)
 * 
 * @param {Object} ctx - Simulation context
 * @returns {number} Spell hit bonus (0-1)
 */
export function getSpellHitBonus(ctx) {
    let bonus = 0;
    
    // Elemental Devastation spell hit bonus
    if (ctx.elementalDevastationExpires && ctx.currentTime < ctx.elementalDevastationExpires) {
        const rank = ctx.stats?.activeModifiers?.elementalDevastation || 0;
        const hitValues = [0, 3, 6, 9];
        bonus += (hitValues[rank] || 0) / 100;
    }
    
    return bonus;
}

/**
 * Check if Nightfall debuff is active (for damage multiplier)
 * 
 * @param {Object} ctx - Simulation context
 * @returns {boolean} Whether Nightfall is active
 */
function isNightfallActiveForDamage(ctx) {
    if (!ctx.nightfallEnabled) return false;
    if (ctx.isNightfallActive && typeof ctx.isNightfallActive === 'function') {
        return ctx.isNightfallActive();
    }
    // Check nightfall proc windows
    if (ctx.nightfallProcs && ctx.nightfallProcs.length > 0) {
        return ctx.nightfallProcs.some(proc => 
            ctx.currentTime >= proc.start && ctx.currentTime < proc.end
        );
    }
    return false;
}

/**
 * Check if Hemorrhage debuff is active (for damage multiplier)
 * 
 * @param {Object} ctx - Simulation context
 * @returns {boolean} Whether Hemorrhage is active
 */
function isHemorrhageActiveForDamage(ctx) {
    if (!ctx.hemoEnabled) return false;
    if (ctx.isHemorrhageActive && typeof ctx.isHemorrhageActive === 'function') {
        return ctx.isHemorrhageActive();
    }
    // Check hemorrhage proc windows
    if (ctx.hemoProcs && ctx.hemoProcs.length > 0) {
        return ctx.hemoProcs.some(proc => 
            ctx.currentTime >= proc.start && ctx.currentTime < proc.end
        );
    }
    return false;
}

/**
 * Check if Corrosive Spit debuff is active (for armor reduction)
 *
 * @param {Object} ctx - Simulation context
 * @returns {boolean} Whether Corrosive Spit is active
 */
function isCorrosiveSpitActiveForDamage(ctx) {
    if (!ctx.corrosiveSpitEnabled) return false;
    if (ctx.isCorrosiveSpitActive && typeof ctx.isCorrosiveSpitActive === 'function') {
        return ctx.isCorrosiveSpitActive();
    }
    if (ctx.corrosiveSpitProcs && ctx.corrosiveSpitProcs.length > 0) {
        return ctx.corrosiveSpitProcs.some(proc =>
            ctx.currentTime >= proc.start && ctx.currentTime < proc.end
        );
    }
    return false;
}

/**
 * Get Corrosive Spit bonus armor-reduction multiplier when active.
 * Computes the extra damage factor from reducing boss armor by 400.
 *
 * @param {Object} ctx - Simulation context
 * @returns {number} Extra multiplier (1.0 when inactive)
 */
function getCorrosiveSpitArmorBonusMultiplier(ctx) {
    if (!isCorrosiveSpitActiveForDamage(ctx)) return 1.0;
    const stats = ctx.stats;
    const rawArmor = stats.targetArmor || 0;
    const armorPen = stats.armorPen || 0;
    const armor = Math.max(0, rawArmor - armorPen);
    const K = 400 + 85 * (stats.playerLevel || 60);
    const reducedArmor = Math.max(0, armor - 400);
    return (armor + K) / (reducedArmor + K);
}

/**
 * Calculate expected damage deterministically (standalone function)
 * Uses probability-weighted averages for hit/crit/miss/resist
 *
 * @param {Object} ctx - Simulation context with stats, currentTime
 * @param {Object} spell - Spell definition
 * @param {Object} damageResult - Result from calculateSpellDamage
 * @param {boolean} isPhysicalDamage - Whether this is physical damage
 * @returns {Object} Expected damage outcome
 */
export function calculateExpectedDamage(ctx, spell, damageResult, isPhysicalDamage = false) {
    const stats = ctx.stats;

    if (isPhysicalDamage && isTargetSchoolImmune(stats, 'physical', true)) {
        return {
            damage: 0,
            hitChance: 0,
            critChance: 0,
            type: 'immune',
            isCrit: false,
            didHit: false,
            isDeterministic: true
        };
    }
    const sch = spell.school || '';
    if (!isPhysicalDamage && sch && sch !== 'physical' && isTargetSchoolImmune(stats, sch, false)) {
        return {
            damage: 0,
            hitChance: 0,
            critChance: 0,
            type: 'immune',
            isCrit: false,
            didHit: false,
            isDeterministic: true
        };
    }
    
    // Use average damage (midpoint of min/max range)
    const baseDamage = damageResult.average ?? 
        ((damageResult.min + damageResult.max) / 2) ?? 
        damageResult.min ?? damageResult.max ?? 0;
    const isMeleeAbility = spell.usesMeleeHit || spell.isAutoAttack;
    const canMiss = spell.canMiss !== false;
    
    let expectedDamage = baseDamage;
    let hitChance = 1.0;
    let critChance = 0.0;
    let glancingChance = 0.0;
    
    // Calculate hit/crit probabilities for melee abilities
    if (canMiss && isMeleeAbility) {
        const avoidance = stats.getTotalMeleeAvoidance(spell.isAutoAttack);
        hitChance = avoidance.landChance;
        
        // Glancing blows (40% for auto attacks only, after avoidance)
        if (spell.hasGlancingBlows) {
            glancingChance = 0.40;
            const glancing = stats.getGlancingBlowReduction();
            expectedDamage *= (1 - glancingChance) + (glancingChance * glancing.averageMultiplier);
        }
        
        // Crit chance (only if not glancing)
        if (!spell.hasGlancingBlows || glancingChance < 1.0) {
            let crit = stats.meleeCrit;
            if (stats.getElementsGraceCritBonus) {
                crit += stats.getElementsGraceCritBonus(spell);
            }
            crit -= 0.03; // -3% crit suppression vs level 63
            critChance = Math.max(0, Math.min(1, crit));
        }
    } else if (canMiss && !isMeleeAbility) {
        // Spell hit chance
        const baseSpellHitChance = 0.83; // 17% base miss vs level 63
        const elementalDevastationBonus = getSpellHitBonus(ctx);
        let effectiveSpellHit = Math.min(baseSpellHitChance + stats.spellHit + elementalDevastationBonus, 0.99);
        
        // Binary spell mechanics
        if (spell.isBinarySpell) {
            let resistance = 0;
            if (spell.school === 'nature') resistance = stats.natureResist || 0;
            else if (spell.school === 'fire') resistance = stats.fireResist || 0;
            else if (spell.school === 'frost') resistance = stats.frostResist || 0;
            
            const spellPen = stats.spellPen || 0;
            resistance = Math.max(0, resistance - spellPen);
            const resistanceHitPenalty = (resistance * 0.0025);
            effectiveSpellHit = Math.max(0.01, effectiveSpellHit - resistanceHitPenalty);
        }
        
        hitChance = effectiveSpellHit;
        
        // Spell crit chance
        if (spell.canCrit !== false) {
            let crit = stats.spellCrit;
            if (stats.getElementsGraceCritBonus) {
                crit += stats.getElementsGraceCritBonus(spell);
            }
            if (spell.school === 'frost' && stats.wintersChillFrostCritBonus) {
                crit += stats.wintersChillFrostCritBonus;
            }
            critChance = Math.max(0, Math.min(1, crit));
        }
    }
    
    // Apply armor reduction to physical damage
    if (isPhysicalDamage) {
        const armorMultiplier = stats.getArmorDamageMultiplier();
        expectedDamage *= armorMultiplier;
    }
    
    // Apply expected resistance for spell damage (non-binary)
    if (!isPhysicalDamage && spell.school && !spell.isBinarySpell) {
        let resistance = 0;
        switch (spell.school) {
            case 'nature': resistance = stats.natureResist || 0; break;
            case 'fire': resistance = stats.fireResist || 0; break;
            case 'frost': resistance = stats.frostResist || 0; break;
        }
        const spellPen = stats.spellPen || 0;
        const attackerLevel = stats.playerLevel || 60;
        const targetLevel = stats.targetLevel || 63;
        const resistStats = calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, false);
        const resistMultiplier = calculateExpectedResistanceMultiplier(resistStats.ratio);
        expectedDamage *= resistMultiplier;
    }
    
    // Apply boss debuff multipliers
    if (!isPhysicalDamage && spell.school && !spell.isAutoAttack && isNightfallActiveForDamage(ctx)) {
        expectedDamage *= 1.1;
    }
    if (isPhysicalDamage && isHemorrhageActiveForDamage(ctx)) {
        expectedDamage *= ctx.hemoImproved ? 1.04 : 1.02;
    }
    if (isPhysicalDamage) {
        expectedDamage *= getCorrosiveSpitArmorBonusMultiplier(ctx);
    }

    // Calculate expected damage with crit
    if (critChance > 0 && spell.canCrit !== false) {
        const critMultiplier = getCritMultiplier(
            spell.school || 'physical',
            stats.activeModifiers?.elementalFury || 0,
            spell.name === 'Echoed Thunder'
        );
        expectedDamage = expectedDamage * ((1 - critChance) + (critChance * critMultiplier));
    }
    
    // Apply hit chance
    expectedDamage *= hitChance;
    
    // Determine outcome type for logging/tracking
    const likelyHit = hitChance > 0.5;
    const likelyCrit = likelyHit && critChance > 0.1;
    let outcomeType = 'hit';
    if (!likelyHit) {
        outcomeType = 'miss';
    } else if (likelyCrit) {
        outcomeType = 'crit';
    }
    
    return {
        damage: expectedDamage,
        hitChance: hitChance,
        critChance: critChance,
        type: outcomeType,
        isCrit: likelyCrit,
        didHit: likelyHit,
        isDeterministic: true
    };
}

/**
 * Roll for actual damage (standalone function)
 * Full attack table with hit/crit/miss/dodge/parry/glancing/resist
 * 
 * @param {Object} ctx - Simulation context with stats, rng, combatStats, currentTime
 * @param {Object} spell - Spell definition
 * @param {Object} damageResult - Result from calculateSpellDamage
 * @param {boolean} isPhysicalDamage - Whether this is physical damage
 * @returns {Object} Damage outcome with damage, type, isCrit, didHit, resistType
 */
export function rollDamage(ctx, spell, damageResult, isPhysicalDamage = false, skipTargetDebuffs = false) {
    const stats = ctx.stats;
    const combatStats = ctx.combatStats || ctx._combatStats || {};
    // Wrap RNG call to preserve 'this' binding for FastRNG.random()
    const rngFn = ctx.rng ? () => ctx.rng.random() : Math.random;

    if (isPhysicalDamage && isTargetSchoolImmune(stats, 'physical', true)) {
        return { damage: 0, type: 'immune', didHit: false, isCrit: false, resistType: 'immune' };
    }
    const rdSchool = spell.school || '';
    if (!isPhysicalDamage && rdSchool && rdSchool !== 'physical' && isTargetSchoolImmune(stats, rdSchool, false)) {
        return { damage: 0, type: 'immune', didHit: false, isCrit: false, resistType: 'immune' };
    }
    
    // Use deterministic mode if enabled
    if (ctx.deterministicMode) {
        return calculateExpectedDamage(ctx, spell, damageResult, isPhysicalDamage);
    }
    
    // Use random value in [min, max] when range exists; otherwise average
    const baseDamage = (typeof damageResult.min === 'number' && 
                        typeof damageResult.max === 'number' && 
                        damageResult.min < damageResult.max)
        ? damageResult.min + rngFn() * (damageResult.max - damageResult.min)
        : (damageResult.average ?? damageResult.min ?? damageResult.max ?? 0);
    
    const isMeleeAbility = spell.usesMeleeHit || spell.isAutoAttack;
    const canMiss = spell.canMiss !== false;

    let outcome = {
        damage: 0,
        type: 'hit',
        isCrit: false,
        didHit: true
    };

    let isGlancing = false;
    let attackTableRoll = null;

    // Attack table for melee abilities
    if (canMiss && isMeleeAbility) {
        const avoidance = stats.getTotalMeleeAvoidance(spell.isAutoAttack);

        attackTableRoll = rngFn();

        let currentThreshold = 0;

        // Miss
        currentThreshold += avoidance.miss;
        if (attackTableRoll < currentThreshold) {
            outcome.type = 'miss';
            outcome.didHit = false;
            if (combatStats.totalMisses !== undefined) combatStats.totalMisses++;
            return outcome;
        }

        // Dodge
        currentThreshold += avoidance.dodge;
        if (attackTableRoll < currentThreshold) {
            outcome.type = 'dodge';
            outcome.didHit = false;
            if (combatStats.totalDodges !== undefined) combatStats.totalDodges++;
            return outcome;
        }

        // Parry
        currentThreshold += avoidance.parry;
        if (attackTableRoll < currentThreshold) {
            outcome.type = 'parry';
            outcome.didHit = false;
            if (combatStats.totalParries !== undefined) combatStats.totalParries++;
            return outcome;
        }

        // Glancing (exactly 40% for auto attacks only)
        if (spell.hasGlancingBlows) {
            const glancingChance = 0.40;
            currentThreshold += glancingChance;
            if (attackTableRoll < currentThreshold) {
                isGlancing = true;
                outcome.type = 'glancing';
                if (combatStats.totalGlancingBlows !== undefined) combatStats.totalGlancingBlows++;
            }
        }

        // Crit (remaining space after all other outcomes)
        if (!isGlancing) {
            let critChance = stats.meleeCrit;
            if (stats.getElementsGraceCritBonus) {
                critChance += stats.getElementsGraceCritBonus(spell);
            }
            critChance -= 0.03; // -3% crit suppression vs level 63
            critChance = Math.max(0, critChance);

            currentThreshold += critChance;
            if (attackTableRoll < currentThreshold) {
                outcome.isCrit = true;
                outcome.type = 'crit';
            }
        }
    } else if (canMiss && !isMeleeAbility) {
        // Spell miss chance
        const baseSpellHitChance = 0.83; // 17% base miss vs level 63
        const elementalDevastationBonus = getSpellHitBonus(ctx);
        let effectiveSpellHit = Math.min(baseSpellHitChance + stats.spellHit + elementalDevastationBonus, 0.99);

        // Binary spell mechanics
        if (spell.isBinarySpell) {
            let resistance = 0;
            if (spell.school === 'nature') resistance = stats.natureResist || 0;
            else if (spell.school === 'fire') resistance = stats.fireResist || 0;
            else if (spell.school === 'frost') resistance = stats.frostResist || 0;
            
            const spellPen = stats.spellPen || 0;
            resistance = Math.max(0, resistance - spellPen);
            const resistanceHitPenalty = (resistance * 0.0025);
            effectiveSpellHit = Math.max(0.01, effectiveSpellHit - resistanceHitPenalty);
        }

        if (rngFn() > effectiveSpellHit) {
            outcome.type = 'miss';
            outcome.didHit = false;
            if (combatStats.totalMisses !== undefined) combatStats.totalMisses++;
            return outcome;
        }
    }

    // Calculate base damage
    let damage = baseDamage;

    // Apply armor reduction to physical damage
    let shieldrenderIgnore = false;
    if (isPhysicalDamage) {
        const sr = resolveShieldrenderPhysicalArmor(ctx, spell, spell.name, { skipSecondary: skipTargetDebuffs });
        shieldrenderIgnore = sr.ignoreArmor;
        if (!shieldrenderIgnore) {
            const armorMultiplier = stats.getArmorDamageMultiplier();
            damage *= armorMultiplier;
        }
    }

    // Apply resistance for spell damage (non-binary)
    let resistType = 'none';
    if (!isPhysicalDamage && spell.school && !spell.isBinarySpell) {
        const resistResult = rollForResistanceStandalone(ctx, spell.school);
        damage *= resistResult.multiplier;
        resistType = resistResult.type;

        if (resistType === 'full_resist') {
            outcome.type = 'full_resist';
            outcome.didHit = false;
            outcome.damage = 0;
            outcome.resistType = resistType;
            return outcome;
        }
    }

    // Apply glancing blow reduction
    if (isGlancing) {
        const glancing = stats.getGlancingBlowReduction();
        damage *= glancing.multiplier;
        if (combatStats.glancingDamageTotal !== undefined) {
            combatStats.glancingDamageTotal += damage;
        }
    }

    // Apply boss target debuffs (primary target only; secondary AOE targets and target-swap windows skip these)
    const onSecondary = skipTargetDebuffs || (typeof ctx.isOnSecondaryTarget === 'function' && ctx.isOnSecondaryTarget());
    if (!onSecondary) {
        if (!isPhysicalDamage && spell.school && !spell.isAutoAttack && isNightfallActiveForDamage(ctx)) {
            damage *= 1.10;
        }
        if (isPhysicalDamage && isHemorrhageActiveForDamage(ctx)) {
            damage *= ctx.hemoImproved ? 1.04 : 1.02;
        }
        if (isPhysicalDamage && !shieldrenderIgnore) {
            damage *= getCorrosiveSpitArmorBonusMultiplier(ctx);
        }
    }

    // For non-melee abilities (spells), roll for crit separately
    if (!isMeleeAbility && spell.canCrit !== false) {
        const isCrit = rollForCrit(ctx, spell, false);
        if (isCrit) {
            outcome.isCrit = true;
            outcome.type = 'crit';
        }
    }

    // Apply crit multiplier if this is a crit
    if (outcome.isCrit) {
        const critMultiplier = (spell.usesStandardCritMultiplier && spell.school !== 'physical')
            ? 1.5
            : getCritMultiplier(
                spell.school || 'physical',
                stats.activeModifiers?.elementalFury || 0,
                spell.name === 'Echoed Thunder'
            );
        damage *= critMultiplier;
        if (combatStats.totalCrits !== undefined) combatStats.totalCrits++;
        if (combatStats.critDamageTotal !== undefined) combatStats.critDamageTotal += damage;
    } else if (!isGlancing) {
        if (combatStats.totalHits !== undefined) combatStats.totalHits++;
        if (combatStats.hitDamageTotal !== undefined) combatStats.hitDamageTotal += damage;
    }

    outcome.damage = damage;
    outcome.resistType = resistType;
    return outcome;
}

/**
 * DamageSystem class - manages damage calculations
 * 
 * Note: The standalone rollDamage/rollForCrit functions above are preferred
 * for new code. This class is maintained for backward compatibility.
 */
export class DamageSystem {
    /**
     * Create a new DamageSystem instance
     * 
     * @param {Object} config - Configuration object
     * @param {Object} config.stats - Stats object for resistance/hit values
     * @param {Function} config.rng - Random number generator
     * @param {Object} config.combatStats - Combat stats tracker
     */
    constructor(config = {}) {
        this.stats = config.stats;
        this.rng = config.rng || Math.random;
        this.combatStats = config.combatStats;
        
        // Damage event tracking
        this.damageEvents = [];
        this.totalDamage = 0;
        this.totalThreat = 0;
    }
    
    /**
     * Roll for resistance effect on spell damage
     * 
     * @param {string} school - Spell school
     * @returns {{multiplier: number, type: string}} Resistance result
     */
    rollForResistance(school) {
        if (!this.stats) {
            return { multiplier: 1.0, type: ResistType.NONE };
        }
        
        // Get resistance value based on school
        let resistance = 0;
        switch (school) {
            case 'nature': resistance = this.stats.natureResist || 0; break;
            case 'fire': resistance = this.stats.fireResist || 0; break;
            case 'frost': resistance = this.stats.frostResist || 0; break;
            case 'shadow': resistance = this.stats.shadowResist || 0; break;
            case 'arcane': resistance = this.stats.arcaneResist || 0; break;
            case 'holy': resistance = this.stats.holyResist || 0; break;
            default: return { multiplier: 1.0, type: ResistType.NONE };
        }
        
        const spellPen = this.stats.spellPen || 0;
        const attackerLevel = this.stats.playerLevel || 60;
        const targetLevel = this.stats.targetLevel || 63;
        const resistStats = calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, false);
        
        // Wrap RNG call to preserve 'this' binding if rng is an object with random() method
        const rngFn = (typeof this.rng === 'function') 
            ? this.rng 
            : (this.rng?.random ? () => this.rng.random() : Math.random);
        return rollResistance(resistStats.ratio, rngFn);
    }
    
    /**
     * Get expected resistance multiplier (for deterministic mode)
     * 
     * @param {string} school - Spell school
     * @returns {number} Expected damage multiplier
     */
    getExpectedResistanceMultiplier(school) {
        if (!this.stats) return 1.0;
        
        let resistance = 0;
        switch (school) {
            case 'nature': resistance = this.stats.natureResist || 0; break;
            case 'fire': resistance = this.stats.fireResist || 0; break;
            case 'frost': resistance = this.stats.frostResist || 0; break;
            case 'shadow': resistance = this.stats.shadowResist || 0; break;
            case 'arcane': resistance = this.stats.arcaneResist || 0; break;
            case 'holy': resistance = this.stats.holyResist || 0; break;
            default: return 1.0;
        }
        
        const spellPen = this.stats.spellPen || 0;
        const attackerLevel = this.stats.playerLevel || 60;
        const targetLevel = this.stats.targetLevel || 63;
        const resistStats = calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, false);
        
        return calculateExpectedResistanceMultiplier(resistStats.ratio);
    }
    
    /**
     * Reset damage tracking for a new simulation
     */
    reset() {
        this.damageEvents = [];
        this.totalDamage = 0;
        this.totalThreat = 0;
    }
    
    /**
     * Get damage results
     * 
     * @returns {{damageEvents: Array, totalDamage: number, totalThreat: number}}
     */
    getResults() {
        return {
            damageEvents: this.damageEvents,
            totalDamage: this.totalDamage,
            totalThreat: this.totalThreat
        };
    }
}

// ============================================
// HASTE CALCULATION
// ============================================

/**
 * Calculate total melee haste multiplier from all active sources
 * 
 * Combines haste from:
 * - Passive/gear haste (stats.meleeHaste % from calculator)
 * - Flurry (talent-based %)
 * - Stormwolf's Frenzy (+10%)
 * - Bloodlust (+20%)
 * - Kiss of the Spider (+20%)
 * - Elemental Weapons Windfury miss haste (+30%)
 * 
 * @param {Object} ctx - Simulation context
 * @returns {number} Total haste multiplier (1.0 = no haste, 1.3 = 30% faster)
 */
export function getHasteMultiplier(ctx) {
    let multiplier = 1.0;

    // NOTE: Gear/passive haste is NOT included here — it's already baked into
    // autoAttackSpeed (= stats.weaponSpeed) by createShamanStatsFromCharacter.
    // This function only provides dynamic buff haste (Flurry, Bloodlust, etc.).

    // Flurry haste: data-driven proc state OR legacy activeProcs (mutually exclusive — do not chain under Hippogryph)
    const flurryState = ctx._procStates?.flurry || ctx.activeProcs?.flurry;
    if (flurryState?.active && flurryState.charges > 0) {
        const hastePercent = flurryState.appliedValue?.hastePercent ||
                            flurryState.hastePercent || 0;
        multiplier *= (1 + hastePercent / 100);
    } else if (ctx.activeProcs?.flurry?.active && ctx.activeProcs.flurry.attacksRemaining > 0) {
        multiplier *= (1 + (ctx.activeProcs.flurry.hastePercent / 100));
    }

    // Might of the Hippogryph 3pc: +20% attack speed until 2 charge-consuming melee hits (Auto/WF/SS/LS) or 8s
    const hippogryphMight = ctx._setBonusStates?.hippogryphMight;
    if (hippogryphMight?.active &&
        hippogryphMight.charges > 0 &&
        ctx.currentTime < (hippogryphMight.expires || 0)) {
        const hp = hippogryphMight.hastePercent || 20;
        multiplier *= (1 + hp / 100);
    }

    // Stormwolf's Frenzy: +10% melee attack speed
    const stormwolfActive = ctx.isStormwolfFrenzyActive?.() ||
        (ctx._setBonusStates?.stormwolfFrenzy?.active &&
         ctx.currentTime < ctx._setBonusStates.stormwolfFrenzy.expires);
    if (stormwolfActive) {
        multiplier *= 1.10;
    }

    // Bloodlust: +20% attack speed (from procEngine state or legacy)
    const bloodlustState = ctx._procStates?.bloodlust;
    if (bloodlustState?.active && ctx.currentTime < bloodlustState.expires) {
        const hastePercent = bloodlustState.appliedValue?.hastePercent || 20;
        multiplier *= (1 + hastePercent / 100);
    }
    // Legacy fallback
    else if (ctx.bloodlustActive && ctx.currentTime < ctx.bloodlustExpires) {
        multiplier *= 1.20;
    }

    // Kiss of the Spider: +20% attack speed (from procEngine state or legacy)
    const kissState = ctx._procStates?.kiss_of_the_spider;
    if (kissState?.active && ctx.currentTime < kissState.expires) {
        const hastePercent = kissState.appliedValue?.hastePercent || 20;
        multiplier *= (1 + hastePercent / 100);
    }
    // Legacy fallback
    else if (ctx._trinketStates?.kiss_of_the_spider?.buffActive ||
             (ctx.kissOfTheSpiderExpires > 0 && ctx.currentTime < ctx.kissOfTheSpiderExpires)) {
        multiplier *= 1.20;
    }

    // Potion of Quickness: +5% attack speed (from procEngine state)
    const potionQuicknessState = ctx._procStates?.potion_of_quickness;
    if (potionQuicknessState?.active && ctx.currentTime < potionQuicknessState.expires) {
        const hastePercent = potionQuicknessState.appliedValue?.hastePercent || 5;
        multiplier *= (1 + hastePercent / 100);
    }

    // Juju Flurry: +3% attack speed (from procEngine state)
    const jujuFlurryState = ctx._procStates?.juju_flurry;
    if (jujuFlurryState?.active && ctx.currentTime < jujuFlurryState.expires) {
        const hastePercent = jujuFlurryState.appliedValue?.hastePercent || 3;
        multiplier *= (1 + hastePercent / 100);
    }

    // Elemental Weapons Windfury: stacking haste (1% per stack, up to 2/4/6)
    if (ctx.ewWindfuryHasteStacks > 0 && ctx.currentTime < ctx.ewWindfuryHasteExpires) {
        multiplier *= (1 + ctx.ewWindfuryHasteStacks * 0.01);
    }

    // Crackling Thunder (Totem of Crackling Thunder): +8% attack speed
    const ctState = ctx._setBonusStates?.cracklingThunder;
    if (ctState?.active && ctx.currentTime < ctState.expires) {
        multiplier *= 1.08;
    }

    return multiplier;
}

/**
 * Spell haste multiplier — only sources that affect cast speed.
 * Gear haste ("increases attack and cast speed") + Bloodlust.
 * Excludes melee-only: Flurry, Stormwolf Frenzy, Kiss of the Spider, EW WF haste.
 */
export function getSpellHasteMultiplier(ctx) {
    let multiplier = 1.0;

    // Passive/gear haste (applies to both melee and spell). NOT Flurry — Flurry is melee-only.
    const gearHaste = ctx.stats?.meleeHaste ?? ctx.stats?.haste ?? 0;
    if (gearHaste > 0) {
        multiplier *= (1 + gearHaste / 100);
    }

    const bloodlustState = ctx._procStates?.bloodlust;
    if (bloodlustState?.active && ctx.currentTime < bloodlustState.expires) {
        const hastePercent = bloodlustState.appliedValue?.hastePercent || 20;
        multiplier *= (1 + hastePercent / 100);
    } else if (ctx.bloodlustActive && ctx.currentTime < ctx.bloodlustExpires) {
        multiplier *= 1.20;
    }

    // Juju Flurry: +3% attack AND casting speed (from procEngine state)
    const jujuFlurryState = ctx._procStates?.juju_flurry;
    if (jujuFlurryState?.active && ctx.currentTime < jujuFlurryState.expires) {
        const hastePercent = jujuFlurryState.appliedValue?.hastePercent || 3;
        multiplier *= (1 + hastePercent / 100);
    }

    // Stormwolf's Cunning (Stormhowl Garb 5pc): +10% spell haste
    const scState = ctx._setBonusStates?.stormwolfCunning;
    if (scState?.active && ctx.currentTime < scState.expires) {
        multiplier *= 1.10;
    }

    // Crackling Thunder (Totem of Crackling Thunder): +8% casting speed
    const ctState = ctx._setBonusStates?.cracklingThunder;
    if (ctState?.active && ctx.currentTime < ctState.expires) {
        multiplier *= 1.08;
    }

    // Spellpower Goggles Xtreme Plus+ only (tooltip: +200 SP but reduce casting speed by 10%).
    const spGogglesSlow = ctx._procStates?.spellpower_goggles_xtreme_plus_plus;
    if (spGogglesSlow?.active && ctx.currentTime < spGogglesSlow.expires && spGogglesSlow.appliedValue?.spellCastSlowPercent > 0) {
        const slowPct = spGogglesSlow.appliedValue.spellCastSlowPercent;
        multiplier *= 1 - slowPct / 100;
    }

    return multiplier;
}

export default DamageSystem;
