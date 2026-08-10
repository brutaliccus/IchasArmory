// modules/shaman/damageCalc.js - Damage calculation engine for Shaman spells

import { shamanModifiers, callOfThunderCritBonusFraction, ShamanStats } from '../character/shamanTalents.js';
import { shamanSpells } from './spells.js';
import { getTrinketArcaneSurgeSpellPower } from '../sim/trinketSystem.js';
import { calculateResistanceStats, calculateExpectedResistanceMultiplier } from '../sim/damageSystem.js';
import { isTargetSchoolImmune } from './targetSchoolImmunity.js';

/**
 * Calculate damage for a shaman spell using the 6-step formula
 *
 * Step 1: Base damage + (SP * coefficient) + (AP * coefficient)
 * Step 2: Multiply by damage modifiers (talents/buffs)
 * Step 3: Apply spell hit chance
 * Step 4: Roll for spell crit
 * Step 5: Apply magic resistance
 * Step 6: Divide by use interval for DPS
 */

/**
 * Compute effective weapon damage {min, max} from base weapon damage + current AP.
 * When baseWeaponDamageMin/Max are available, this recomputes dynamically so that
 * any runtime AP changes (on-use trinkets, buffs) are immediately reflected without
 * needing a separate recalculateWeaponDamage() call.
 */
function getEffectiveWeaponDamage(stats) {
    const bMin = stats.baseWeaponDamageMin || 0;
    const bMax = stats.baseWeaponDamageMax || 0;
    if (bMin > 0 || bMax > 0) {
        const ap = stats.attackPower || 0;
        const speed = stats.baseWeaponSpeed || 2.5;
        const mult = 1 + (stats.talentBonuses?.weaponDamageMultiplier || 0);
        const apContrib = (ap / 14) * speed;
        return {
            min: Math.floor((bMin + apContrib) * mult),
            max: Math.ceil((bMax + apContrib) * mult)
        };
    }
    return stats.weaponDamage || { min: 0, max: 0 };
}

/**
 * Effective spell power for damage formulas (matches legacy getSchoolSpellPower in calculateBaseDamage).
 * Includes Wrath of Cenarius (+132) from `stats.activeModifiers.wrathOfCenarius` — not added to raw `spellPower`.
 */
export function getEffectiveSchoolSpellPower(stats, school) {
    const woc = stats.activeModifiers?.wrathOfCenarius || 0;
    const baseSP = stats.spellPower || 0;
    if (school === 'nature') {
        return Math.max(baseSP, stats.natureDamage || 0) + woc;
    }
    if (school === 'fire') {
        return Math.max(baseSP, stats.fireDamage || 0) + woc;
    }
    if (school === 'frost') {
        return Math.max(baseSP, stats.frostDamage || 0) + woc;
    }
    return baseSP + woc;
}

/**
 * Step 1: Calculate base damage with coefficients
 */
function calculateBaseDamage(spell, stats, useMin = true) {
    let baseDamage = 0;

    // Handle Flametongue Weapon proc (special formula)
    if (spell.isFlametongueProc) {
        const minDmg = spell.damageMin;
        const maxDmg = spell.damageMax;
        const minWSP = spell.minWeaponSpeed;
        const maxWSP = spell.maxWeaponSpeed;

        // Base listed weapon speed (not hasted swing time)
        const baseWeaponSpeed = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
            ? stats.baseWeaponSpeed
            : (stats.weaponSpeed || 2.0);

        // Clamp base speed for the damage bracket (min–max proc damage vs speed curve)
        const clampedSpeed = Math.max(minWSP, Math.min(maxWSP, baseWeaponSpeed));
        const scaledBaseDamage = (maxDmg - minDmg) * ((clampedSpeed - minWSP) / (maxWSP - minWSP)) + minDmg;

        // SP: effective coef = flat + (per-second × unclamped base speed), e.g. 0.17 + 0.03×3.8 = 0.284
        const effectiveSpellPower = getEffectiveSchoolSpellPower(stats, spell.school);
        const flatCoef = spell.spCoefficient ?? 0.17;
        const perSpeed = spell.spCoefficientPerBaseWeaponSpeed ?? 0.03;
        const effectiveSpCoef = flatCoef + perSpeed * baseWeaponSpeed;
        const spContribution = Math.floor(effectiveSpellPower * effectiveSpCoef);

        baseDamage = scaledBaseDamage + spContribution;
        return baseDamage;
    }

    // Frostbrand Weapon: same speed-scaled base + SP as Flametongue, frost school power
    if (spell.isFrostbrandProc) {
        const minDmg = spell.damageMin;
        const maxDmg = spell.damageMax;
        const minWSP = spell.minWeaponSpeed;
        const maxWSP = spell.maxWeaponSpeed;

        const baseWeaponSpeed = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
            ? stats.baseWeaponSpeed
            : (stats.weaponSpeed || 2.0);

        const clampedSpeed = Math.max(minWSP, Math.min(maxWSP, baseWeaponSpeed));
        const scaledBaseDamage = (maxDmg - minDmg) * ((clampedSpeed - minWSP) / (maxWSP - minWSP)) + minDmg;

        const effectiveSpellPower = getEffectiveSchoolSpellPower(stats, spell.school);
        const flatCoef = spell.spCoefficient ?? 0.25;
        const perSpeed = spell.spCoefficientPerBaseWeaponSpeed ?? 0.04;
        const effectiveSpCoef = flatCoef + perSpeed * baseWeaponSpeed;
        const spContribution = Math.floor(effectiveSpellPower * effectiveSpCoef);

        baseDamage = scaledBaseDamage + spContribution;
        return baseDamage;
    }

    // Handle regular spells with damageMin/Max
    if (spell.damageMin !== undefined) {
        baseDamage = useMin ? spell.damageMin : spell.damageMax;

        // Apply Totem of Rage flat damage bonus to shocks (before multipliers)
        if (stats.totemOfRage && (spell.name === 'Earth Shock' || spell.name === 'Frost Shock' || spell.name === 'Flame Shock')) {
            baseDamage += 30;
        }

        // Apply Totem of the Storm flat damage bonus to Lightning Bolt and Chain Lightning (before multipliers)
        if (stats.totemOfTheStorm && (spell.name === 'Lightning Bolt' || spell.name === 'Chain Lightning')) {
            baseDamage += 33;
        }

        // Apply Totem of Broken Earth flat damage bonus to Earth Shock only (before multipliers)
        if (stats.totemOfBrokenEarth && spell.name === 'Earth Shock') {
            baseDamage += 100;
        }

        // Apply Totem of Eruption flat damage bonus to Molten Blast (before multipliers)
        if (stats.totemOfEruption && spell.name === 'Molten Blast') {
            baseDamage += 35;
        }
    }

    // Handle DoT spells
    if (spell.damagePerTick !== undefined) {
        baseDamage = spell.damagePerTick;

        // Apply Totem of Rage flat damage bonus to Flame Shock DoT ticks (before multipliers)
        if (stats.totemOfRage && spell.name === 'Flame Shock (DoT)') {
            baseDamage += 30;
        }
    }

    // Handle weapon damage abilities (Lightning Strike, Stormstrike)
    if (spell.weaponDamagePercent !== undefined) {
        const weaponDamage = getEffectiveWeaponDamage(stats);
        const weaponDmg = useMin ? weaponDamage.min : weaponDamage.max;
        baseDamage = weaponDmg * spell.weaponDamagePercent;

        // For Lightning Strike, add the nature damage component
        if (spell.natureDamagePercent) {
            const natureDmg = weaponDmg * spell.natureDamagePercent;
            // Add SP and AP scaling to the nature portion (using nature spell power)
            const effectiveSpellPower = getEffectiveSchoolSpellPower(stats, spell.school);
            const spContribution = Math.floor(effectiveSpellPower * (spell.spCoefficient || 0));
            const apContribution = Math.floor(stats.attackPower * (spell.apCoefficient || 0));
            baseDamage += natureDmg + spContribution + apContribution;
        }

        return baseDamage;
    }

    // Add spell power contribution (for non-weapon abilities)
    // In WoW Classic, coefficient contributions are calculated and added, then the total is floored
    const effectiveSpellPower = getEffectiveSchoolSpellPower(stats, spell.school);
    let spContribution = effectiveSpellPower * (spell.spCoefficient || 0);
    let apContribution = stats.attackPower * (spell.apCoefficient || 0);
    
    // Earthshatterer's Battlegear 2-set: 15% bonus to Empowered Lightning Shield AP scaling only (not SP, not base damage)
    if (spell.name === "Empowered Lightning Shield" && stats.setBonuses?.empowered_lightning_shield_scaling_bonus) {
        const scalingBonus = stats.setBonuses.empowered_lightning_shield_scaling_bonus;
        apContribution *= (1 + scalingBonus);
        // Note: SP coefficient is NOT affected by this bonus
    }
    
    baseDamage = Math.floor(baseDamage + spContribution + apContribution);

    return baseDamage;
}

/**
 * Step 2: Apply all damage modifiers
 */
function applyDamageModifiers(damage, spell, stats) {
    let modifiedDamage = damage;

    // Get all applicable modifiers for this spell
    const modifiers = stats.getAllDamageModifiers(spell);

    // Apply each modifier multiplicatively
    for (const modifier of modifiers) {
        modifiedDamage *= (1 + modifier.value);
    }

    return modifiedDamage;
}

/**
 * Step 3: Apply spell hit chance (DISABLED for damage display)
 * Hit chance will be factored in during fight simulation, not damage display
 * Base miss chance: 17% (0.17)
 * With hit: 17% - spell hit (capped at 16%, leaving 1% minimum miss)
 *
 * Note: This is only used for expected damage in the main spell calculation loop.
 * The spell and stats are not passed here, so binary spell logic is not needed.
 * Binary spells are handled in their own sections (like Flametongue above).
 */
function applySpellHit(damage, stats) {
    // Don't apply hit chance to damage display
    // Hit chance will be used in fight simulation instead
    return damage;
}

/**
 * Step 4: Roll for spell crit
 * Melee abilities: 2.0x crit damage (100% bonus)
 * Spell abilities: 1.5x crit damage (50% bonus)
 * With Elemental Fury (1/1): +50% crit bonus for elemental spells (1.5x -> 1.75x)
 * With Elemental Fury (2/2): +100% crit bonus for elemental spells (1.5x -> 2.0x)
 * Formula: (damage * critMultiplier * critChance) + (damage * (1 - critChance))
 */
function applySpellCrit(damage, spell, stats, bonusCritChance = 0) {
    // Can this spell crit?
    if (!spell.canCrit) {
        return damage;
    }

    // Lightning Strike is handled separately (physical and nature components calculated independently)
    // Don't apply crit here for Lightning Strike - it's handled in calculateSpellDamage
    if (spell.name === "Lightning Strike") {
        return damage;
    }

    // Use melee crit for melee abilities, spell crit for spells
    const isMeleeAbility = spell.isAutoAttack || spell.usesMeleeHit || spell.school === 'physical';
    let baseCritChance = isMeleeAbility ? stats.meleeCrit : stats.spellCrit;
    
    // Earthshatterer's Battlegear 4-set: +5% crit chance to Shock spells
    const isShockSpell = spell.name === "Earth Shock" || spell.name === "Flame Shock" || spell.name === "Frost Shock";
    if (isShockSpell && !isMeleeAbility && stats.setBonuses?.shock_spell_crit) {
        baseCritChance += stats.setBonuses.shock_spell_crit / 100; // Convert 5 to 0.05
    }

    // Call of Thunder: +1/2/3/4/6% crit at ranks 1–5 (Turtle rank 5 is +6%, not +5%)
    if (spell.isLightningSpell && stats.activeModifiers?.callOfThunder > 0) {
        baseCritChance += callOfThunderCritBonusFraction(stats.activeModifiers.callOfThunder);
    }

    // Tidal Mastery: +1-5% crit chance for lightning spells
    if (spell.isLightningSpell && stats.activeModifiers?.tidalMastery > 0) {
        baseCritChance += stats.activeModifiers.tidalMastery * 0.01;
    }

    // Winter's Chill (raid debuff): +% spell crit for Frost spells only
    if (!isMeleeAbility && spell.school === 'frost' && stats.wintersChillFrostCritBonus) {
        baseCritChance += stats.wintersChillFrostCritBonus;
    }
    
    const effectiveCritChance = Math.min(baseCritChance + bonusCritChance, 1.0);

    // Base crit multiplier
    let critMultiplier;
    if (spell.school === 'physical') {
        critMultiplier = 2.0; // Melee abilities: 100% bonus damage on crit
    } else {
        critMultiplier = 1.5; // Spell abilities: 50% bonus damage on crit

        // Elemental Fury: +50% or +100% to the crit bonus for elemental spells
        // Note: Lightning Strike is excluded (handled separately)
        const efRank = Number(stats.activeModifiers?.elementalFury) || 0;
        if (!spell.usesStandardCritMultiplier &&
            efRank > 0 &&
            (spell.school === 'nature' || spell.school === 'fire' || spell.school === 'frost')) {
            if (efRank >= 2) {
                critMultiplier = 2.0; // 1.5x + 0.5x = 2.0x (100% bonus)
            } else {
                critMultiplier = 1.75; // 1.5x + 0.25x = 1.75x (75% bonus)
            }
        }
    }

    // Calculate expected damage with crits
    const critDamage = damage * critMultiplier * effectiveCritChance;
    const nonCritDamage = damage * (1 - effectiveCritChance);

    return critDamage + nonCritDamage;
}

/**
 * Resistance table lookup - maps mitigation percent to partial resist probabilities
 * Based on WoW Classic resistance mechanics
 * Table format: { mitigationPercent: [p100, p75, p50, p25, p0] }
 * Where p100 = chance of 100% resist, p75 = chance of 75% resist, etc.
 */
// Resistance table removed — now using royalgiraffe model from damageSystem.js

/**
 * Get resistance table entry for a given mitigation percent
 * Uses linear interpolation between breakpoints
 */
// getResistanceTableEntry removed — now using royalgiraffe model from damageSystem.js

/**
 * Calculate expected damage multiplier from resistance table
 * Returns the average damage multiplier (0.0 to 1.0) after applying partial resists
 */
// calculateResistanceMultiplier removed — now using calculateExpectedResistanceMultiplier from damageSystem.js

/**
 * Step 5: Apply magic resistance using resistance table
 * Formula: Calculate mitigation percent from resistance, then use table lookup
 *
 * Binary spells (like Earth Shock): Resistance reduces hit chance instead of damage
 * - Formula: Hit chance reduction = resistance * 0.25%
 * - When it hits, full damage is dealt (no partial resists)
 */
function applyMagicResistance(damage, spell, stats) {
    if (spell.school && spell.school !== 'physical' && isTargetSchoolImmune(stats, spell.school, false)) {
        return 0;
    }
    if (spell.isBinarySpell) {
        return damage;
    }

    let resistance = 0;
    if (spell.school === 'nature') {
        resistance = stats.natureResist || 0;
    } else if (spell.school === 'fire') {
        resistance = stats.fireResist || 0;
    } else if (spell.school === 'frost') {
        resistance = stats.frostResist || 0;
    } else if (spell.school === 'shadow') {
        resistance = stats.shadowResist || 0;
    } else if (spell.school === 'arcane') {
        resistance = stats.arcaneResist || 0;
    }

    const spellPen = stats.spellPen || 0;
    const attackerLevel = stats.playerLevel || 60;
    const targetLevel = stats.targetLevel || 63;
    const resistStats = calculateResistanceStats(resistance, spellPen, attackerLevel, targetLevel, false);
    const damageMultiplier = calculateExpectedResistanceMultiplier(resistStats.ratio);

    return damage * damageMultiplier;
}

/**
 * Calculate damage range for a spell (min and max)
 * Returns both base damage (for display) and expected damage (for DPS calculation)
 */
export function calculateSpellDamage(spell, stats, ctx = null) {
    // Arcane Surge (Jewel of Wild Magics Arcane effect): +50 SP while buff is active.
    // Preserve stats prototype so getAllDamageModifiers etc. still work (workers rely on this).
    if (ctx && getTrinketArcaneSurgeSpellPower(ctx) > 0) {
        const bonusSP = getTrinketArcaneSurgeSpellPower(ctx);
        stats = Object.assign(Object.create(Object.getPrototypeOf(stats)), stats, { spellPower: (stats.spellPower || 0) + bonusSP });
    }
    // Step 1: Calculate base damage (min and max)
    const baseDamageMin = calculateBaseDamage(spell, stats, true);
    const baseDamageMax = calculateBaseDamage(spell, stats, false);

    const formula = [];
    const displayFormula = []; // Formula without crit/resist for display

    // For Flametongue Weapon, calculate using the special formula (returns single value)
    if (spell.isFlametongueProc) {
        const baseDamage = calculateBaseDamage(spell, stats, true);

        // Apply damage modifiers
        let displayDamage = applyDamageModifiers(baseDamage, spell, stats);
        let expectedDamage = displayDamage;

        if (spell.school === 'fire' && isTargetSchoolImmune(stats, 'fire', false)) {
            return {
                min: 0,
                max: 0,
                average: 0,
                expectedMin: 0,
                expectedMax: 0,
                expectedAverage: 0,
                formula: 'School immune (fire)'
            };
        }

        // Apply boss debuff multipliers (Fire Vulnerability, Curse of Elements, Curse of Shadows)
        if (spell.school === 'fire' && stats.fireDamageMultiplier && stats.fireDamageMultiplier > 1) {
            displayDamage *= stats.fireDamageMultiplier;
            expectedDamage *= stats.fireDamageMultiplier;
        } else if (spell.school === 'frost' && stats.frostDamageMultiplier && stats.frostDamageMultiplier > 1) {
            displayDamage *= stats.frostDamageMultiplier;
            expectedDamage *= stats.frostDamageMultiplier;
        } else if (spell.school === 'shadow' && stats.shadowDamageMultiplier && stats.shadowDamageMultiplier > 1) {
            displayDamage *= stats.shadowDamageMultiplier;
            expectedDamage *= stats.shadowDamageMultiplier;
        } else if (spell.school === 'arcane' && stats.arcaneDamageMultiplier && stats.arcaneDamageMultiplier > 1) {
            displayDamage *= stats.arcaneDamageMultiplier;
            expectedDamage *= stats.arcaneDamageMultiplier;
        }

        // For expected DPS: apply spell hit, crit, and resist
        const baseSpellHitChance = 0.83; // 17% base miss vs level 63
        let effectiveSpellHit = Math.min(baseSpellHitChance + stats.spellHit, 0.99);

        // Binary spell mechanics: resistance reduces hit chance instead of damage
        if (spell.isBinarySpell) {
            let resistance = 0;
            if (spell.school === 'nature') {
                resistance = stats.natureResist || 0;
            } else if (spell.school === 'fire') {
                resistance = stats.fireResist || 0;
            } else if (spell.school === 'frost') {
                resistance = stats.frostResist || 0;
            }

            const spellPen = stats.spellPen || 0;
            resistance = Math.max(0, resistance - spellPen);
            // Binary spell formula: each point of (effective) resistance reduces hit chance by 0.25%
            const resistanceHitPenalty = (resistance * 0.0025);
            effectiveSpellHit = Math.max(0.01, effectiveSpellHit - resistanceHitPenalty); // Min 1% hit chance
        }

        expectedDamage *= effectiveSpellHit;

        // Apply crit
        if (spell.canCrit) {
            const bonusCritChance = stats.getElementsGraceCritBonus(spell);
            expectedDamage = applySpellCrit(expectedDamage, spell, stats, bonusCritChance);
        }

        // Apply magic resistance
        expectedDamage = applyMagicResistance(expectedDamage, spell, stats);

        const modifiers = stats.getAllDamageModifiers(spell);
        let modMultiplier = 1;
        modifiers.forEach(mod => modMultiplier *= (1 + mod.value));

        formula.push(`Flametongue: ${baseDamage.toFixed(1)}`);
        if (modMultiplier > 1) {
            formula.push(` × ${modMultiplier.toFixed(3)} (mods)`);
        }

        return {
            min: displayDamage,
            max: displayDamage,
            average: displayDamage,
            expectedMin: expectedDamage,
            expectedMax: expectedDamage,
            expectedAverage: expectedDamage,
            formula: formula.join(' ')
        };
    }

    // Frostbrand Weapon: same pipeline as Flametongue; expected damage scaled by PPM + Elemental Weapons additive proc %
    if (spell.isFrostbrandProc) {
        const baseDamage = calculateBaseDamage(spell, stats, true);

        let displayDamage = applyDamageModifiers(baseDamage, spell, stats);
        let expectedDamage = displayDamage;

        if (spell.school === 'frost' && isTargetSchoolImmune(stats, 'frost', false)) {
            return {
                min: 0,
                max: 0,
                average: 0,
                expectedMin: 0,
                expectedMax: 0,
                expectedAverage: 0,
                formula: 'School immune (frost)'
            };
        }

        if (stats.frostDamageMultiplier && stats.frostDamageMultiplier > 1) {
            displayDamage *= stats.frostDamageMultiplier;
            expectedDamage *= stats.frostDamageMultiplier;
        }

        const baseSpellHitChance = 0.83;
        let effectiveSpellHit = Math.min(baseSpellHitChance + stats.spellHit, 0.99);

        if (spell.isBinarySpell) {
            const spellPen = stats.spellPen || 0;
            const resistance = Math.max(0, (stats.frostResist || 0) - spellPen);
            const resistanceHitPenalty = (resistance * 0.0025);
            effectiveSpellHit = Math.max(0.01, effectiveSpellHit - resistanceHitPenalty);
        }

        expectedDamage *= effectiveSpellHit;

        if (spell.canCrit) {
            const bonusCritChance = stats.getElementsGraceCritBonus(spell);
            expectedDamage = applySpellCrit(expectedDamage, spell, stats, bonusCritChance);
        }

        expectedDamage = applyMagicResistance(expectedDamage, spell, stats);

        const baseWeaponSpeed = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
            ? stats.baseWeaponSpeed
            : (stats.weaponSpeed || 2.0);
        const ppm = 9;
        let procChance = (baseWeaponSpeed * ppm) / 60;
        procChance += stats.talentBonuses?.frostbrand_proc_bonus || 0;
        procChance = Math.min(1, procChance);
        expectedDamage *= procChance;

        const modifiers = stats.getAllDamageModifiers(spell);
        let modMultiplier = 1;
        modifiers.forEach(mod => modMultiplier *= (1 + mod.value));

        formula.push(`Frostbrand (per proc): ${baseDamage.toFixed(1)}`);
        if (modMultiplier > 1) {
            formula.push(` × ${modMultiplier.toFixed(3)} (mods)`);
        }
        formula.push(`; PPM ${ppm} → ${(procChance * 100).toFixed(1)}% per hit`);

        return {
            min: displayDamage,
            max: displayDamage,
            average: displayDamage,
            expectedMin: expectedDamage,
            expectedMax: expectedDamage,
            expectedAverage: expectedDamage,
            formula: formula.join(' ')
        };
    }

    // Might of the Hippogryph 3pc: PPM applies buff; 150 Nature on melee hits until 2 charge-consuming swings (Auto / WF / SS / LS); sheet uses rough ×3 multiplier
    if (spell.isHippogryphMightProc) {
        const baseDamage = calculateBaseDamage(spell, stats, true);
        let displayDamage = applyDamageModifiers(baseDamage, spell, stats);
        let expectedDamage = displayDamage;

        if (spell.school === 'nature' && isTargetSchoolImmune(stats, 'nature', false)) {
            return {
                min: 0,
                max: 0,
                average: 0,
                expectedMin: 0,
                expectedMax: 0,
                expectedAverage: 0,
                formula: 'School immune (nature)'
            };
        }

        const baseSpellHitChance = 0.83;
        let effectiveSpellHit = Math.min(baseSpellHitChance + stats.spellHit, 0.99);
        expectedDamage *= effectiveSpellHit;

        if (spell.canCrit) {
            const bonusCritChance = stats.getElementsGraceCritBonus(spell);
            expectedDamage = applySpellCrit(expectedDamage, spell, stats, bonusCritChance);
        }

        expectedDamage = applyMagicResistance(expectedDamage, spell, stats);

        const baseWeaponSpeed = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
            ? stats.baseWeaponSpeed
            : (stats.weaponSpeed || 2.0);
        const ppm = 1.2;
        const procChance = Math.min(1, (baseWeaponSpeed * ppm) / 60);
        expectedDamage *= procChance * 3;

        const modifiers = stats.getAllDamageModifiers(spell);
        let modMultiplier = 1;
        modifiers.forEach(mod => modMultiplier *= (1 + mod.value));

        formula.push(`Hippogryph 3pc (per bonus hit): ${baseDamage.toFixed(1)}`);
        if (modMultiplier > 1) {
            formula.push(` × ${modMultiplier.toFixed(3)} (mods)`);
        }
        formula.push(`; PPM ${ppm} → ${(procChance * 100).toFixed(1)}% buff / swing; ×3 approx (nature while charges; charges on Auto/WF/SS/LS)`);

        return {
            min: displayDamage,
            max: displayDamage,
            average: displayDamage,
            expectedMin: expectedDamage,
            expectedMax: expectedDamage,
            expectedAverage: expectedDamage,
            formula: formula.join(' ')
        };
    }

    // For Lightning Strike, calculate physical and nature separately
    if (spell.name === "Lightning Strike") {
        const weaponDamage = getEffectiveWeaponDamage(stats);

        // Physical portion (60% weapon damage)
        const physicalBaseMin = weaponDamage.min * 0.60;
        const physicalBaseMax = weaponDamage.max * 0.60;

        // Apply Element's Grace damage bonus to physical portion
        const modifiers = stats.getAllDamageModifiers(spell);
        let egDamageBonus = 1;
        modifiers.forEach(mod => {
            if (mod.name === "Element's Grace") {
                egDamageBonus *= (1 + mod.value);
            }
        });

        // Display values (no crit/resist)
        let physicalDisplayMin = physicalBaseMin * egDamageBonus;
        let physicalDisplayMax = physicalBaseMax * egDamageBonus;

        // Nature portion (20% weapon damage only - no SP/AP)
        // Apply Element's Grace damage bonus to nature portion as well
        const natureBaseMin = weaponDamage.min * 0.20 * egDamageBonus;
        const natureBaseMax = weaponDamage.max * 0.20 * egDamageBonus;

        // Apply other modifiers to nature portion (Element's Grace already applied above)
        // Stormstrike applies to nature component only and doesn't consume charges for Lightning Strike
        let natureModMultiplier = 1;
        modifiers.forEach(mod => {
            if (mod.name !== "Element's Grace") {
                // Stormstrike applies to nature component
                natureModMultiplier *= (1 + mod.value);
            }
        });

        let natureDisplayMin = natureBaseMin * natureModMultiplier;
        let natureDisplayMax = natureBaseMax * natureModMultiplier;

        // For expected damage (DPS calculation), apply avoidance, crit and resist
        // Lightning Strike uses melee hit, so apply melee avoidance (not auto attack, so includes parry)
        const avoidance = stats.getTotalMeleeAvoidance(false);

        const physImmune = isTargetSchoolImmune(stats, 'physical', true);
        const natureImmune = isTargetSchoolImmune(stats, 'nature', false);

        const bonusCritChance = stats.getElementsGraceCritBonus(spell);
        // Lightning Strike uses melee hit, so use melee crit for physical component
        const effectivePhysicalCrit = Math.min(stats.meleeCrit + bonusCritChance, 1.0);
        // Physical component: 2.0x crit (NOT affected by Elemental Fury - physical damage only)
        const physicalCritMultiplier = 2.0;
        const physicalCritDamage = effectivePhysicalCrit * physicalCritMultiplier + (1 - effectivePhysicalCrit);
        const physicalExpectedMin = physImmune ? 0 : physicalDisplayMin * physicalCritDamage * avoidance.landChance;
        const physicalExpectedMax = physImmune ? 0 : physicalDisplayMax * physicalCritDamage * avoidance.landChance;

        if (physImmune) {
            physicalDisplayMin = 0;
            physicalDisplayMax = 0;
        }

        // Nature component: 1.5x base, boosted by Elemental Fury (rank 1 = 1.75x, rank 2 = 2.0x)
        const efRank = stats.activeModifiers.elementalFury || 0;
        const natureCritMultiplier = efRank === 2 ? 2.0 : (efRank === 1 ? 1.75 : 1.5);
        // Nature component uses spell crit (it's a spell, not melee)
        const effectiveNatureCrit = Math.min(stats.spellCrit + bonusCritChance, 1.0);
        const natureCritDamage = effectiveNatureCrit * natureCritMultiplier + (1 - effectiveNatureCrit);

        // Calculate nature resistance using royalgiraffe model
        const natureResistance = stats.natureResist || 0;
        const lsSpellPen = stats.spellPen || 0;
        const lsAttackerLevel = stats.playerLevel || 60;
        const lsTargetLevel = stats.targetLevel || 63;
        const natureResistStats = calculateResistanceStats(natureResistance, lsSpellPen, lsAttackerLevel, lsTargetLevel, false);
        const natureResistMultiplier = natureImmune ? 0 : calculateExpectedResistanceMultiplier(natureResistStats.ratio);

        const natureLandFactor = natureImmune ? 0 : (physImmune ? 1 : avoidance.landChance);

        const natureExpectedMin = natureImmune ? 0 : natureDisplayMin * natureCritDamage * natureResistMultiplier * natureLandFactor;
        const natureExpectedMax = natureImmune ? 0 : natureDisplayMax * natureCritDamage * natureResistMultiplier * natureLandFactor;

        if (natureImmune) {
            natureDisplayMin = 0;
            natureDisplayMax = 0;
        }

        formula.push(`Physical: ${weaponDamage.min}×0.6 to ${weaponDamage.max}×0.6`);
        if (egDamageBonus > 1) {
            formula.push(` × ${egDamageBonus.toFixed(3)} (EG)`);
        }
        formula.push(` | Nature: ${weaponDamage.min}×0.2 to ${weaponDamage.max}×0.2`);
        if (egDamageBonus > 1) {
            formula.push(` × ${egDamageBonus.toFixed(3)} (EG)`);
        }
        if (natureModMultiplier > 1) {
            formula.push(` × ${natureModMultiplier.toFixed(3)} (mods)`);
        }

        return {
            // Display values (no crit/resist)
            min: physicalDisplayMin + natureDisplayMin,
            max: physicalDisplayMax + natureDisplayMax,
            average: (physicalDisplayMin + physicalDisplayMax + natureDisplayMin + natureDisplayMax) / 2,
            physicalMin: physicalDisplayMin,
            physicalMax: physicalDisplayMax,
            natureMin: natureDisplayMin,
            natureMax: natureDisplayMax,
            // Expected values (with crit/resist for DPS)
            expectedMin: physicalExpectedMin + natureExpectedMin,
            expectedMax: physicalExpectedMax + natureExpectedMax,
            expectedAverage: (physicalExpectedMin + physicalExpectedMax + natureExpectedMin + natureExpectedMax) / 2,
            formula: formula.join(' ')
        };
    }

    // Process both min and max through all steps
    // We'll calculate TWO versions: display (no crit/resist) and expected (with crit/resist for DPS)
    const displayResults = [];
    const expectedResults = [];

    [baseDamageMin, baseDamageMax].forEach((baseDamage, idx) => {
        const isMin = idx === 0;

        if (spell.school === 'physical' && isTargetSchoolImmune(stats, 'physical', true)) {
            displayResults.push(0);
            expectedResults.push(0);
            return;
        }
        if (spell.school && spell.school !== 'physical' && isTargetSchoolImmune(stats, spell.school, false)) {
            displayResults.push(0);
            expectedResults.push(0);
            return;
        }

        // Track formula steps for display (no crit/resist)
        const displaySteps = [];

        // Step 1: Base damage
        if (spell.damageMin !== undefined) {
            displaySteps.push(`Base: ${baseDamage.toFixed(1)}`);
        } else if (spell.weaponDamagePercent !== undefined) {
            const wd = getEffectiveWeaponDamage(stats);
            const weaponDmg = isMin ? wd.min : wd.max;
            displaySteps.push(`Weapon: ${weaponDmg.toFixed(1)} × ${spell.weaponDamagePercent}`);
        }

        // Step 2: Apply damage modifiers
        let displayDamage = applyDamageModifiers(baseDamage, spell, stats);
        let expectedDamage = displayDamage; // Start with same value

        // For tooltip display, exclude raid debuffs (Improved Scorch, Curse of Elements)
        // They still get applied via applyDamageModifiers above, just not shown as personal mods
        const displayModifiers = stats.getAllDamageModifiers(spell, { excludeDebuffs: true });
        if (displayModifiers.length > 0) {
            let modMultiplier = 1;
            displayModifiers.forEach(mod => modMultiplier *= (1 + mod.value));
            displaySteps.push(`× ${modMultiplier.toFixed(3)} (mods)`);
        }

        // Apply boss debuff multipliers (Fire Vulnerability, Curse of Elements, Nightfall)
        if (spell.school === 'fire' && stats.fireDamageMultiplier && stats.fireDamageMultiplier > 1) {
            displayDamage *= stats.fireDamageMultiplier;
            expectedDamage *= stats.fireDamageMultiplier;
            displaySteps.push(`× ${stats.fireDamageMultiplier.toFixed(3)} (debuffs)`);
        } else if (spell.school === 'frost' && stats.frostDamageMultiplier && stats.frostDamageMultiplier > 1) {
            displayDamage *= stats.frostDamageMultiplier;
            expectedDamage *= stats.frostDamageMultiplier;
            displaySteps.push(`× ${stats.frostDamageMultiplier.toFixed(3)} (debuffs)`);
        } else if (spell.school === 'shadow' && stats.shadowDamageMultiplier && stats.shadowDamageMultiplier > 1) {
            displayDamage *= stats.shadowDamageMultiplier;
            expectedDamage *= stats.shadowDamageMultiplier;
            displaySteps.push(`× ${stats.shadowDamageMultiplier.toFixed(3)} (debuffs)`);
        } else if (spell.school === 'arcane' && stats.arcaneDamageMultiplier && stats.arcaneDamageMultiplier > 1) {
            displayDamage *= stats.arcaneDamageMultiplier;
            expectedDamage *= stats.arcaneDamageMultiplier;
            displaySteps.push(`× ${stats.arcaneDamageMultiplier.toFixed(3)} (debuffs)`);
        }
        
        // Nightfall is a boss debuff, applied when damage is dealt (in rollDamage), not here

        // For display: Stop here (no crit, no resist)
        displayResults.push(displayDamage);

        // For expected DPS: Continue with crit and resist
        // Step 3: Apply hit/avoidance
        if (spell.usesMeleeHit) {
            // Melee attacks: apply miss + dodge + parry
            const avoidance = stats.getTotalMeleeAvoidance(spell.isAutoAttack);
            expectedDamage *= avoidance.landChance;

            // Auto attacks also have glancing blows
            if (spell.hasGlancingBlows) {
                const glancing = stats.getGlancingBlowReduction();
                expectedDamage *= glancing.averageMultiplier;
            }
        } else {
            // Spell attacks: apply spell hit chance
            const baseSpellHitChance = 0.83; // 17% base miss vs level 63
            let effectiveSpellHit = Math.min(baseSpellHitChance + stats.spellHit, 0.99);

            // Binary spell mechanics: resistance reduces hit chance instead of damage
            if (spell.isBinarySpell) {
                let resistance = 0;
                if (spell.school === 'nature') {
                    resistance = stats.natureResist || 0;
                } else if (spell.school === 'fire') {
                    resistance = stats.fireResist || 0;
                } else if (spell.school === 'frost') {
                    resistance = stats.frostResist || 0;
                }

                const spellPen = stats.spellPen || 0;
                resistance = Math.max(0, resistance - spellPen);
                // Binary spell formula: each point of (effective) resistance reduces hit chance by 0.25%
                const resistanceHitPenalty = (resistance * 0.0025);
                effectiveSpellHit = Math.max(0.01, effectiveSpellHit - resistanceHitPenalty); // Min 1% hit chance
            }

            expectedDamage *= effectiveSpellHit;
        }

        // Step 4: Apply spell crit (for expected damage only)
        if (spell.canCrit) {
            const bonusCritChance = stats.getElementsGraceCritBonus(spell);
            expectedDamage = applySpellCrit(expectedDamage, spell, stats, bonusCritChance);
        }

        // Step 5: Apply magic resistance (for expected damage only)
        // Binary spells skip resistance damage reduction (already applied to hit chance)
        if (spell.school !== 'physical') {
            expectedDamage = applyMagicResistance(expectedDamage, spell, stats);
        }

        expectedResults.push(expectedDamage);

        if (idx === 0) {
            displayFormula.push(...displaySteps);
        }
    });

    // Note: Stormstrike charge consumption is handled in shamanCombatSim.js
    // during combat events to ensure charges are only consumed once per cast

    return {
        // Display values (without crit/resist averaged in)
        min: displayResults[0],
        max: displayResults[1],
        average: (displayResults[0] + displayResults[1]) / 2,
        // Expected values (with crit/resist for DPS calculation)
        expectedMin: expectedResults[0],
        expectedMax: expectedResults[1],
        expectedAverage: (expectedResults[0] + expectedResults[1]) / 2,
        formula: displayFormula.join(' ')
    };
}

/**
 * Calculate DPS for a spell (Step 6: divide by use interval)
 */
export function calculateSpellDPS(spell, stats) {
    const damage = calculateSpellDamage(spell, stats);

    // Determine use interval
    let interval;

    // Auto attacks use weapon speed
    if (spell.isAutoAttack) {
        interval = stats.weaponSpeed || 0;
    } else if (spell.isFlametongueProc) {
        // Flametongue procs on every melee swing
        interval = stats.weaponSpeed || 0;
    } else if (spell.isFrostbrandProc) {
        interval = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
            ? stats.baseWeaponSpeed
            : (stats.weaponSpeed || 0);
    } else if (spell.isHippogryphMightProc) {
        interval = (stats.baseWeaponSpeed && stats.baseWeaponSpeed > 0)
            ? stats.baseWeaponSpeed
            : (stats.weaponSpeed || 0);
    } else {
        interval = spell.cooldown || 0;
    }

    // Handle special cases
    if (spell.icd) {
        // Lightning Shield uses internal cooldown (3s base, 4s with Stable Shields)
        if (spell.name === "Lightning Shield") {
            interval = stats.activeModifiers.stableShields ? 4.0 : 3.0;
        } else {
            interval = spell.icd;
        }
    } else if (spell.tickRate) {
        // Totems use tick/attack rate
        interval = spell.tickRate;
        // Adjust for Improved Fire Totems (10% increased attack speed per rank: 10/20%)
        // Magma Totem does NOT benefit from Improved Fire Totems speed increase
        if (stats.activeModifiers.improvedFireTotems > 0 && spell.school === 'fire' && spell.name !== 'Magma Totem') {
            const speedIncrease = 0.10 * stats.activeModifiers.improvedFireTotems; // 10% per rank
            interval *= (1 - speedIncrease);
        }
    } else if (spell.attackRate) {
        interval = spell.attackRate;
        // Adjust for Improved Fire Totems (10% increased attack speed per rank: 10/20%)
        // Magma Totem does NOT benefit from Improved Fire Totems speed increase
        if (stats.activeModifiers.improvedFireTotems > 0 && spell.school === 'fire' && spell.name !== 'Magma Totem') {
            const speedIncrease = 0.10 * stats.activeModifiers.improvedFireTotems; // 10% per rank
            interval *= (1 - speedIncrease);
        }
    }

    // Adjust cooldowns for talents
    // Reverberation: -0.3/0.7/1.0s to all shock spells (Earth, Frost, Flame)
    // Note: DoT portions are not affected by Reverberation
    if ((spell.name === "Earth Shock" || spell.name === "Frost Shock" || spell.name === "Flame Shock") &&
        stats.activeModifiers.reverberation > 0) {
        const reverberationValues = [0.3, 0.7, 1.0];
        const reduction = reverberationValues[stats.activeModifiers.reverberation - 1] || 0;
        interval = Math.max(interval - reduction, 5); // Reduce by talent value, min 5s
    }
    // Note: "Flame Shock (DoT)" duration is not affected by Reverberation

    if (spell.name === "Empowered Lightning Shield" && stats.activeModifiers.t2ThreePiece) {
        interval -= 0.5; // -0.5s with T2 3pc
    }

    // Battlegear of Ten Storms 3pc: -0.5s to Stormstrike and Lightning Strike cooldowns
    if ((spell.name === "Stormstrike" || spell.name === "Lightning Strike") &&
        stats.setBonuses?.battlegear_ten_storms_3pc_cooldown_reduction) {
        const reduction = stats.setBonuses.battlegear_ten_storms_3pc_cooldown_reduction;
        interval = Math.max(interval - reduction, 0);
    }

    // Handle DoTs - use expected damage for DPS calculation
    if (spell.damagePerTick && spell.ticks) {
        const totalExpectedDamage = damage.expectedAverage * spell.ticks;
        const totalDisplayDamage = damage.average * spell.ticks;
        return {
            damagePerCast: totalDisplayDamage,
            dps: spell.duration ? totalExpectedDamage / spell.duration : 0,
            interval: spell.duration,
            ...damage
        };
    }

    // Calculate Fire Nova Totem delay (for totem twisting info)
    let fireNovaDelay = null;
    if (spell.name === "Fire Nova Totem" && spell.delay) {
        fireNovaDelay = spell.delay;
        if (stats.activeModifiers.improvedFireTotems > 0) {
            const delayReduction = 1.0 * stats.activeModifiers.improvedFireTotems; // 1s per rank
            fireNovaDelay = Math.max(fireNovaDelay - delayReduction, 0);
        }
    }

    // Use expectedAverage for DPS calculation, but keep display values for damage display
    const result = {
        damagePerCast: damage.average,
        dps: interval > 0 ? damage.expectedAverage / interval : 0,
        interval,
        ...damage
    };

    // Add Fire Nova delay if applicable
    if (fireNovaDelay !== null) {
        result.fireNovaDelay = fireNovaDelay;
    }

    return result;
}

/**
 * Calculate damage for all spells
 */
export function calculateAllSpellDamage(stats) {
    const results = {};

    for (const [key, spell] of Object.entries(shamanSpells)) {
        // Skip non-damage abilities
        if (spell.weaponDamagePercent !== undefined && !spell.damageMin) {
            continue; // Skip Stormstrike for now
        }

        results[key] = calculateSpellDPS(spell, stats);
    }

    return results;
}

/**
 * Calculate the effective DPS value of pressing each ability once, accounting for the
 * time cost (GCD for instants, cast time for hard-casts) and cooldowns.
 * Returns a sorted array of { key, name, value, tooltip } for Smart Priority ordering.
 */
export function calculateSmartPriority(stats, enabledKeys, spellData) {
    const GCD = 1.5;
    const results = [];
    const spells = spellData || shamanSpells;
    const hasteMultiplier = 1.0 + ((stats.hastePercent || 0) / 100);
    const spellHasteMultiplier = hasteMultiplier;

    for (const key of enabledKeys) {
        let spell, label, timeCost, rawDamage, bonusDps;
        bonusDps = 0;

        const castVariant = key.endsWith('Cast');
        const baseKey = castVariant ? key.replace('Cast', '') : key;

        if (baseKey === 'lightningBolt') {
            spell = spells.lightningBolt;
            label = castVariant ? 'Lightning Bolt (Cast)' : 'Lightning Bolt (T2)';
        } else if (baseKey === 'chainLightning') {
            spell = spells.chainLightning;
            label = castVariant ? 'Chain Lightning (Cast)' : 'Chain Lightning';
        } else if (baseKey === 'moltenBlast') {
            spell = spells.moltenBlast;
            label = castVariant ? 'Molten Blast (Cast)' : 'Molten Blast';
        } else {
            spell = spells[baseKey] || spells[key];
            label = spell?.name || key;
        }
        if (!spell) continue;

        // Skip non-damage / meta entries
        if (key === 'autoAttack' || key === 'opener' || key === 'aoeOpener' || key === 'aoePriority') continue;

        // Time cost: cast time (hasted) for hard-casts, else GCD
        if (castVariant && spell.castTime) {
            let baseCast = spell.castTime;
            if (spell.isLightningSpell && stats.activeModifiers?.lightningMastery > 0) {
                baseCast = Math.max(1.0, baseCast - stats.activeModifiers.lightningMastery);
            }
            timeCost = baseCast / spellHasteMultiplier;
        } else {
            timeCost = GCD;
        }

        // Damage per use
        const dmgResult = calculateSpellDamage(spell, stats);
        rawDamage = dmgResult?.expectedAverage || dmgResult?.average || 0;

        // DoT bonus for Flame Shock
        if (key === 'flameShock') {
            const dotSpell = spells.flameShockDot;
            if (dotSpell) {
                const dotResult = calculateSpellDamage(dotSpell, stats);
                const tickDmg = dotResult?.expectedAverage || dotResult?.average || 0;
                const ticks = dotSpell.ticks || 5;
                rawDamage += tickDmg * ticks;
            }
        }

        // Rekindle bonus for Molten Blast (if Improved Molten Blast talented)
        if (baseKey === 'moltenBlast' && stats.activeModifiers?.improvedMoltenBlast > 0) {
            const dotSpell = spells.flameShockDot;
            if (dotSpell) {
                const dotResult = calculateSpellDamage(dotSpell, stats);
                const tickDmg = dotResult?.expectedAverage || dotResult?.average || 0;
                const refreshedTicks = Math.min(dotSpell.ticks || 5, 3);
                const rekindlePct = stats.activeModifiers.improvedMoltenBlast * 0.30;
                rawDamage += tickDmg * refreshedTicks * rekindlePct;
            }
        }

        // Stormstrike debuff value: +20% nature damage for 2 charges over the next few GCDs
        if (key === 'stormstrike') {
            const ssDebuffBonus = 0.20;
            const chargesUseful = 2;
            const avgNatureDmgPerGcd = (calculateSpellDamage(spells.earthShock, stats)?.expectedAverage || 300);
            bonusDps += (avgNatureDmgPerGcd * ssDebuffBonus * chargesUseful) / timeCost;
        }

        // Lightning Shield variants: maintenance spells, lower intrinsic priority
        if (key.startsWith('lightningShield')) {
            const lsSpell = spells.lightningShield || spells.empoweredLightningShield;
            if (lsSpell) {
                const lsDmg = calculateSpellDamage(lsSpell, stats);
                rawDamage = (lsDmg?.expectedAverage || 0) * 3;
            }
        }

        const valuePerSecond = (rawDamage / timeCost) + bonusDps;
        const tooltip = `${Math.round(rawDamage)} dmg / ${timeCost.toFixed(2)}s = ${valuePerSecond.toFixed(1)} dps`;

        results.push({ key, name: label, value: valuePerSecond, tooltip });
    }

    results.sort((a, b) => b.value - a.value);
    return results;
}

/**
 * Format damage for display
 */
export function formatDamage(damageResult) {
    if (damageResult.min === damageResult.max) {
        return Math.round(damageResult.average).toString();
    }
    return `${Math.round(damageResult.min)} - ${Math.round(damageResult.max)}`;
}

/**
 * Format DPS for display
 */
export function formatDPS(dps) {
    return dps.toFixed(2);
}

/**
 * Test calculation with the provided example
 * Empowered Lightning Shield: 500 SP, 1500 AP, no T2, Nightfall active, 12% spell hit, 15 nature resist
 * Uses static imports (same as the rest of this module) so the build does not warn about ineffective dynamic import().
 */
export function testEmpoweredLSExample() {
    const stats = new ShamanStats();
    stats.spellPower = 500;
    stats.attackPower = 1500;
    stats.spellHit = 0.12;
    stats.natureResist = 15;
    stats.targetLevel = 63;

    stats.setTalent('concussion', 5);
    stats.toggleModifier('elementalFury', true);
    stats.toggleModifier('nightfall', true);
    stats.applyStormstrike();

    const spell = shamanSpells.empoweredLightningShield;
    const result = calculateSpellDPS(spell, stats);

    console.log('=== Empowered Lightning Shield Test ===');
    console.log('Expected DPS: ~107.11 (964.03 / 9s)');
    console.log('Calculated DPS:', formatDPS(result.dps));
    console.log('Damage per cast:', formatDamage(result));
    console.log('Interval:', result.interval);

    return result;
}
