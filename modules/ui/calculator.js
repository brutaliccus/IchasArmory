// modules/ui/calculator.js (Corrected)
import { baseStats } from '../character/races.js';
import { AP_VS_GEAR_STAT_KEYS, DMG_HEALING_VS_GEAR_STAT_KEYS } from '../character/stats.js';
const classAvoStats = {
    druid:   { dodge: 0.9, parry: 0,   block: 0,   agiPerDodge: 20.0 },
    warrior: { dodge: 0.0, parry: 5.0, block: 5.0, agiPerDodge: 20.0 },
    paladin: { dodge: 0.66, parry: 5.0, block: 5.0, agiPerDodge: 19.767 },
    shaman:  { dodge: 1.7, parry: 5.0, block: 5.0, agiPerDodge: 20.0 },
    hunter:  { dodge: 0,   parry: 5.0, block: 0,   agiPerDodge: 20.0 },
};

// Your existing class formula database
const classFormulas = {
    warrior: { apPerStr: 2, apPerAgi: 0, rapPerAgi: 1, agiPerCrit: 20.0, intPerSpellCrit: 0, baseCrit: 0.0, baseSpellCrit: 0.0 },
    paladin: { apPerStr: 2, apPerAgi: 0, rapPerAgi: 0, agiPerCrit: 20.0, intPerSpellCrit: 29.5, baseCrit: 0.7, baseSpellCrit: 2.3 },
    shaman:  { apPerStr: 2, apPerAgi: 0, rapPerAgi: 0, agiPerCrit: 20.0, intPerSpellCrit: 59.5, baseCrit: 1.7, baseSpellCrit: 3.544 },
    druid:   { apPerStr: 2, apPerAgi: 0, rapPerAgi: 0, agiPerCrit: 20.0, intPerSpellCrit: 60.0, baseCrit: 0.9, baseSpellCrit: 1.81 },
    hunter:  { apPerStr: 1, apPerAgi: 1, rapPerAgi: 1, agiPerCrit: 53.0, intPerSpellCrit: 0, baseCrit: -1.5, baseSpellCrit: 0.0 },
    rogue:   { apPerStr: 1, apPerAgi: 1, rapPerAgi: 1, agiPerCrit: 29.0, intPerSpellCrit: 0, baseCrit: 0.0, baseSpellCrit: 0.0 },
    mage:    { apPerStr: 0, apPerAgi: 0, rapPerAgi: 0, agiPerCrit: 0,    intPerSpellCrit: 59.5, baseCrit: 0.0, baseSpellCrit: 0.32 },
    warlock: { apPerStr: 0, apPerAgi: 0, rapPerAgi: 0, agiPerCrit: 0,    intPerSpellCrit: 60.6, baseCrit: 0.0, baseSpellCrit: 0.0 },
    priest:  { apPerStr: 0, apPerAgi: 0, rapPerAgi: 0, agiPerCrit: 0,    intPerSpellCrit: 60.0, baseCrit: 0.0, baseSpellCrit: 0.0 },
};

export function calculateEffectiveHealth(data) {
    // --- Stat Aggregation ---
    const { selectedClass, selectedRace, attackerLevel, gearStats, talentBonuses, racialBonuses, activeBuffs, enchantStats, offhandArmor, setBonuses = {} } = data;
    const setSheet = setBonuses.sheetStats || {};

    const classBase = baseStats[selectedClass] || {};
    const raceClassBase = classBase[selectedRace] || { sta: 0, agi: 0, str: 0, int: 0, spi: 0 };

    // Initialize totals from base stats
    let totalStamina = raceClassBase.sta || 0;
    let totalAgility = raceClassBase.agi || 0;
    let totalStrength = raceClassBase.str || 0;
    let totalIntellect = raceClassBase.int || 0;
    let totalSpirit = raceClassBase.spi || 0;
    let totalHealth = classBase.baseHealth || 0;
    let totalArmor = classBase.baseArmor || 0;
    let totalDefense = (selectedClass === 'warrior' || selectedClass === 'paladin' || selectedClass === 'druid' || selectedClass === 'shaman' || selectedClass === 'hunter') ? 300 : 0;

    console.log('Base stats:', { stamina: totalStamina, strength: totalStrength, spirit: totalSpirit });

    // Handle "allStats" from gear, enchants, and set bonuses first
    const allStatsBonus = (gearStats.allStats || 0) + (enchantStats.allStats || 0) + (setSheet.allStats || 0);
    if (allStatsBonus > 0) {
        totalStamina += allStatsBonus;
        totalAgility += allStatsBonus;
        totalStrength += allStatsBonus;
        totalIntellect += allStatsBonus;
        totalSpirit += allStatsBonus;
    }
    console.log('After allStats:', { stamina: totalStamina, strength: totalStrength, spirit: totalSpirit, allStatsBonus });

    // Add flat stats from Gear, Enchants, and set bonus sheet stats
    totalStamina += (gearStats.stamina || 0) + (enchantStats.stamina || 0) + (setSheet.stamina || 0);
    totalAgility += (gearStats.agility || 0) + (enchantStats.agility || 0) + (setSheet.agility || 0);
    totalStrength += (gearStats.strength || 0) + (enchantStats.strength || 0) + (setSheet.strength || 0);
    totalIntellect += (gearStats.intellect || 0) + (enchantStats.intellect || 0) + (setSheet.intellect || 0);
    totalSpirit += (gearStats.spirit || 0) + (enchantStats.spirit || 0) + (setSheet.spirit || 0);
    console.log('After gear/enchants:', { stamina: totalStamina, strength: totalStrength, spirit: totalSpirit,
        'gear.stamina': gearStats.stamina, 'enchant.stamina': enchantStats.stamina,
        'gear.strength': gearStats.strength, 'enchant.strength': enchantStats.strength,
        'gear.spirit': gearStats.spirit, 'enchant.spirit': enchantStats.spirit });
    totalHealth += (gearStats.health || 0) + (enchantStats.health || 0) + (setSheet.health || 0);
    totalDefense += (gearStats.defense || 0) + (enchantStats.defense || 0) + (setSheet.defense || 0);

    // Handle armor with talent multipliers
    // IMPORTANT: Enchant armor is NOT affected by talent/buff armor bonuses, only gear armor is
    const enchantArmor = enchantStats.armor || 0;
    const shieldArmor = offhandArmor || 0;
    const nonShieldGearArmor = (gearStats.armor || 0) - shieldArmor;

    // Get buff armor multiplier (from Druid forms like Dire Bear/Moonkin)
    let buffArmorPercent = 0;
    activeBuffs.forEach(buff => {
        buffArmorPercent += buff.armor_percent_from_gear_buff || 0;
    });

    // CRITICAL: Buff armor (e.g., Bear Form 360%) and talent armor (e.g., Thick Hide) are ADDITIVE
    // Formula: (gear × buff_multiplier) + (gear × talent_multiplier) + enchant_armor
    // NOT: gear × (buff_multiplier + talent_multiplier)

    // Calculate armor from buff multiplier (e.g., Bear Form)
    const buffBoostedArmor = (nonShieldGearArmor + shieldArmor) * buffArmorPercent;

    // Calculate armor from talent multiplier (e.g., Thick Hide) - separate from buff
    const talentArmorPercent = (talentBonuses.armor_percent || 0) + (talentBonuses.armor_percent_from_gear || 0);
    const talentBoostedArmor = (nonShieldGearArmor + shieldArmor) * talentArmorPercent;

    // Apply shield_armor_multiplier to shield only (e.g., Shaman Spirit Armor)
    const shieldArmorMultiplier = talentBonuses.shield_armor_multiplier || 0;
    const shieldBonusArmor = shieldArmor * shieldArmorMultiplier;

    // Total armor = base gear + buff boost + talent boost + shield bonus + enchants
    totalArmor += (nonShieldGearArmor + shieldArmor) + buffBoostedArmor + talentBoostedArmor + shieldBonusArmor + enchantArmor + (setSheet.armor || 0);

    // Add flat stats from Buffs
    activeBuffs.forEach(buff => {
        totalStamina += buff.sta || 0;
        totalAgility += buff.agi || 0;
        totalStrength += buff.str || 0;
        totalIntellect += buff.int || 0;
        totalSpirit += buff.spi || 0;
        totalArmor += buff.armor || 0;

        // Add health from buff, with Dreamwalker 6-set bonus if in bear form
        let healthFromBuff = buff.health || 0;
        if (buff.id === 'dire_bear_form' && setBonuses.bear_form_health_bonus) {
            // Apply 6-set bonus: 25% extra bear form health (1240 * 1.25 = 1550 total)
            healthFromBuff = healthFromBuff * (1 + setBonuses.bear_form_health_bonus);
        }
        totalHealth += healthFromBuff;

        totalDefense += buff.def || 0;
    });

    // Add flat stats from Talents and Racials
    totalHealth += talentBonuses.health_flat || 0;
    totalDefense += (racialBonuses.defense || 0) + (talentBonuses.defense || 0);

    // Debug: Log pre-multiplier values
    console.log('Pre-multiplier stats:', {
        stamina: totalStamina,
        strength: totalStrength,
        spirit: totalSpirit,
        agility: totalAgility,
        'stamina*1.05': totalStamina * 1.05,
        'strength*1.05': totalStrength * 1.05,
        'spirit*1.05': totalSpirit * 1.05
    });

    // Track stamina multiplier for calculating HP per stamina (used for stat weights)
    let staminaMultiplier = 1.0;

    // Apply percentage-based multipliers and truncate (floor) after each application
    // WoW uses floor (truncation), not rounding, for final stat values
    if (talentBonuses.stat_percent_all || 0) {
        const multiplier = 1 + talentBonuses.stat_percent_all;
        staminaMultiplier *= multiplier;
        totalStamina = Math.floor(totalStamina * multiplier);
        totalAgility = Math.floor(totalAgility * multiplier);
        totalStrength = Math.floor(totalStrength * multiplier);
        totalIntellect = Math.floor(totalIntellect * multiplier);
        totalSpirit = Math.floor(totalSpirit * multiplier);
    }

    // Apply buff percentage multipliers
    activeBuffs.forEach(buff => {
        if (buff.stat_percent) {
            const multiplier = 1 + buff.stat_percent;
            staminaMultiplier *= multiplier;
            totalStamina = Math.floor(totalStamina * multiplier);
            totalAgility = Math.floor(totalAgility * multiplier);
            totalStrength = Math.floor(totalStrength * multiplier);
            totalIntellect = Math.floor(totalIntellect * multiplier);
            totalSpirit = Math.floor(totalSpirit * multiplier);
        }
    });

    // Apply racial percentage bonuses
    if (racialBonuses.agi_percent) {
        totalAgility = Math.floor(totalAgility * (1 + racialBonuses.agi_percent));
    }
    if (racialBonuses.spi_percent) {
        totalSpirit = Math.floor(totalSpirit * (1 + racialBonuses.spi_percent));
    }

    // Apply individual stat percentage bonuses from talents
    if (talentBonuses.str_percent) {
        totalStrength = Math.floor(totalStrength * (1 + talentBonuses.str_percent));
    }
    if (talentBonuses.agi_percent) {
        totalAgility = Math.floor(totalAgility * (1 + talentBonuses.agi_percent));
    }
    if (talentBonuses.sta_percent || talentBonuses.stamina_percent) {
        const staPercent = (talentBonuses.sta_percent || 0) + (talentBonuses.stamina_percent || 0);
        const multiplier = 1 + staPercent;
        staminaMultiplier *= multiplier;
        totalStamina = Math.floor(totalStamina * multiplier);
    }
    if (talentBonuses.int_percent) {
        totalIntellect = Math.floor(totalIntellect * (1 + talentBonuses.int_percent));
    }
    if (talentBonuses.spi_percent) {
        totalSpirit = Math.floor(totalSpirit * (1 + talentBonuses.spi_percent));
    }

    // Apply form-specific bonuses from Heart of the Wild
    const isInBearForm = activeBuffs.some(buff => buff.id === 'dire_bear_form');
    const isInCatForm = activeBuffs.some(buff => buff.id === 'cat_form');

    if (isInBearForm && talentBonuses.heart_of_wild_bear_sta_percent) {
        totalStamina = Math.floor(totalStamina * (1 + talentBonuses.heart_of_wild_bear_sta_percent));
    }
    if (isInCatForm && talentBonuses.heart_of_wild_cat_str_percent) {
        totalStrength = Math.floor(totalStrength * (1 + talentBonuses.heart_of_wild_cat_str_percent));
    }

    // Ensure no stat can go below 0 (in case of negative gear stats)
    totalStamina = Math.max(0, totalStamina);
    totalAgility = Math.max(0, totalAgility);
    totalStrength = Math.max(0, totalStrength);
    totalIntellect = Math.max(0, totalIntellect);
    totalSpirit = Math.max(0, totalSpirit);

    // Final Health and Armor calculations
    totalHealth += totalStamina * 10;
    const hpPercentMultiplier = (1 + (racialBonuses.health_percent || 0)) * (1 + (talentBonuses.health_percent || 0));
    totalHealth = Math.floor(totalHealth * hpPercentMultiplier);

    // Calculate HP per 1 stamina (for stat weight calculations)
    // Formula: 1 stamina × stamina% × 10 HP × HP%
    const hpPerStamina = staminaMultiplier * 10 * hpPercentMultiplier;

    totalArmor += totalAgility * 2;

    // Apply multiplicative armor bonuses from buffs (e.g., Ancestral Healing: 25% total armor)
    let totalArmorMultiplier = 1.0;
    activeBuffs.forEach(buff => {
        totalArmorMultiplier += (buff.armor_percent || 0);
    });
    totalArmor = totalArmor * totalArmorMultiplier;

    totalArmor = Math.round(totalArmor);
    
    // Mana calculation (baseMana + intellect × 15 + flat mana from gear/enchants/buffs)
    let totalMana = classBase.baseMana || 0;
    totalMana += totalIntellect * 15;

    // Add flat mana from gear, enchants, and buffs
    totalMana += (gearStats.mana || 0) + (enchantStats.mana || 0);
    activeBuffs.forEach(buff => {
        totalMana += buff.mana || 0;
    });

    totalMana = Math.floor(totalMana);

    // --- Offensive Calcs ---
    const formulas = classFormulas[selectedClass] || {};
    
    // Base Attack Power varies by class (verified from Wowhead naked stats)
    // Warrior: 160, Paladin: 160, Shaman: 100, Druid: -20
    // Most other classes: 120 (Rogues, Hunters)
    const playerLevel = 60;
    let baseAP = 120; // Default for Rogues, Hunters
    if (selectedClass === 'warrior' || selectedClass === 'paladin') {
        baseAP = 160;
    } else if (selectedClass === 'shaman') {
        baseAP = 100;
    } else if (selectedClass === 'druid') {
        baseAP = -20; // Druids have negative base AP due to caster nature
    } else if (selectedClass === 'mage' || selectedClass === 'priest' || selectedClass === 'warlock') {
        baseAP = 0; // Casters have no base melee AP
    }
    let totalAttackPower = baseAP;
    
    // Add AP from gear, enchants, and talents
    totalAttackPower += (gearStats.attackPower || 0) + (enchantStats.attackPower || 0) + (talentBonuses.attackPower || 0) + (setSheet.attackPower || 0);
    
    // Add AP from buffs (with set bonus multiplier for Rockbiter)
    activeBuffs.forEach(buff => {
        // Get AP from either buff.ap or buff.base_stats.ap
        let apBonus = buff.ap || buff.base_stats?.ap || 0;

        // Apply Stormcaller's Battlegear 5-piece bonus to Rockbiter Weapon
        if (buff.name === 'Rockbiter Weapon' && setBonuses.rockbiter_weapon_bonus) {
            apBonus = apBonus * (1 + setBonuses.rockbiter_weapon_bonus);
        }

        totalAttackPower += apBonus;
    });

    // Add AP from stats (strength and agility)
    totalAttackPower += (formulas.apPerStr ? totalStrength * formulas.apPerStr : 0);
    totalAttackPower += (formulas.apPerAgi ? totalAgility * formulas.apPerAgi : 0);

    // Cat Form: Agility provides additional 1:1 AP bonus
    activeBuffs.forEach(buff => {
        if (buff.agi_to_ap) {
            totalAttackPower += totalAgility * buff.agi_to_ap;
        }
    });

    // Lightning Reflexes (Hunter): melee AP = +X% of Agility (in addition to normal apPerAgi)
    totalAttackPower += totalAgility * (talentBonuses.lightning_reflexes_melee_ap_from_agi_percent || 0);

    // Apply percentage-based AP modifiers (e.g. Trueshot Aura +5% AP)
    let apPercentBonus = 0;
    activeBuffs.forEach(buff => {
        apPercentBonus += buff.ap_percent || buff.base_stats?.ap_percent || 0;
    });
    apPercentBonus += talentBonuses.ap_percent || 0;
    apPercentBonus += talentBonuses.predatory_strikes_ap_percent || 0;
    if (apPercentBonus > 0) {
        totalAttackPower *= (1 + apPercentBonus);
    }

    // --- Ranged Attack Power ---
    let totalRangedAttackPower = (formulas.rapPerAgi ? totalAgility * formulas.rapPerAgi : 0)
        + (gearStats.rangedAttackPower || 0) + (enchantStats.rangedAttackPower || 0) + (setSheet.rangedAttackPower || 0);
    activeBuffs.forEach(buff => {
        totalRangedAttackPower += (buff.rangedAttackPower || buff.rangedAP || 0);
    });

    // --- Weapon Skill Calculations ---
    // Helper function to calculate weapon skill for a specific weapon type
    function calculateWeaponSkillForType(weaponType, isTwoHanded = false) {
        let skillValue = 300; // Base weapon skill at level 60

        // Add generic weapon skill bonuses (not type-specific)
        skillValue += (gearStats.weaponSkill || 0) + (enchantStats.weaponSkill || 0) + (talentBonuses.weaponSkill || 0);

        // Build the full weapon type key (e.g., "Two-handed Mace" or "Mace")
        let weaponTypeKey = weaponType;
        if (isTwoHanded && weaponType) {
            weaponTypeKey = 'Two-handed ' + weaponType;
        }

        // Add weapon-type-specific bonuses from gear (e.g., Carapace Handguards: {'Two-handed Axe': 6, ...})
        if (weaponTypeKey && setSheet.weaponSkillByType && setSheet.weaponSkillByType[weaponTypeKey]) {
            skillValue += setSheet.weaponSkillByType[weaponTypeKey];
        }
        if (weaponTypeKey && gearStats.weaponSkillByType && gearStats.weaponSkillByType[weaponTypeKey]) {
            skillValue += gearStats.weaponSkillByType[weaponTypeKey];
        }

        // Add weapon-type-specific bonuses from enchants
        if (weaponTypeKey && enchantStats.weaponSkillByType && enchantStats.weaponSkillByType[weaponTypeKey]) {
            skillValue += enchantStats.weaponSkillByType[weaponTypeKey];
        }

        // Normalize weapon type for comparisons
        const weaponTypeNormalized = weaponType ? weaponType.toLowerCase() : '';

        // Add weapon skill from buffs (weapon masteries) - only if they match this weapon type
        // Use the full weaponTypeKey (e.g. "Two-handed Mace") to strictly separate 1H vs 2H
        activeBuffs.forEach(buff => {
            if (buff.weaponSkill && buff.weaponTypes) {
                if (buff.weaponTypes.includes(weaponTypeKey)) {
                    skillValue += buff.weaponSkill || 0;
                }
            } else if (buff.weaponSkill) {
                // Non-weapon-specific skill bonus (generic weaponSkill with no type restriction)
                skillValue += buff.weaponSkill || 0;
            }
        });

        // Add racial weapon skill bonuses
        if (weaponType && racialBonuses) {
            // Map weapon types to racial bonus keys (weaponTypeNormalized already defined above)

            // Check for one-handed weapon skills first
            if (!isTwoHanded) {
                if (weaponTypeNormalized === 'sword' && racialBonuses.swordSkill) {
                    console.log(`Applying racial sword skill bonus: +${racialBonuses.swordSkill}`);
                    skillValue += racialBonuses.swordSkill;
                } else if (weaponTypeNormalized === 'mace' && racialBonuses.maceSkill) {
                    console.log(`Applying racial mace skill bonus: +${racialBonuses.maceSkill}`);
                    skillValue += racialBonuses.maceSkill;
                } else if (weaponTypeNormalized === 'axe' && racialBonuses.axeSkill) {
                    console.log(`Applying racial axe skill bonus: +${racialBonuses.axeSkill}`);
                    skillValue += racialBonuses.axeSkill;
                } else if (weaponTypeNormalized === 'dagger' && racialBonuses.daggerSkill) {
                    console.log(`Applying racial dagger skill bonus: +${racialBonuses.daggerSkill}`);
                    skillValue += racialBonuses.daggerSkill;
                }
            }

            // Check for two-handed weapon skills (these can stack with one-handed for some races)
            if (isTwoHanded) {
                if (weaponTypeNormalized === 'sword' && racialBonuses.twoHandedSwordSkill) {
                    console.log(`Applying racial two-handed sword skill bonus: +${racialBonuses.twoHandedSwordSkill}`);
                    skillValue += racialBonuses.twoHandedSwordSkill;
                } else if (weaponTypeNormalized === 'mace' && racialBonuses.twoHandedMaceSkill) {
                    console.log(`Applying racial two-handed mace skill bonus: +${racialBonuses.twoHandedMaceSkill}`);
                    skillValue += racialBonuses.twoHandedMaceSkill;
                } else if (weaponTypeNormalized === 'axe' && racialBonuses.twoHandedAxeSkill) {
                    console.log(`Applying racial two-handed axe skill bonus: +${racialBonuses.twoHandedAxeSkill}`);
                    skillValue += racialBonuses.twoHandedAxeSkill;
                }
            }

            // Check for ranged weapon skills
            if (weaponTypeNormalized === 'bow' && racialBonuses.bowSkill) {
                console.log(`Applying racial bow skill bonus: +${racialBonuses.bowSkill}`);
                skillValue += racialBonuses.bowSkill;
            } else if (weaponTypeNormalized === 'gun' && racialBonuses.gunSkill) {
                console.log(`Applying racial gun skill bonus: +${racialBonuses.gunSkill}`);
                skillValue += racialBonuses.gunSkill;
            } else if (weaponTypeNormalized === 'thrown' && racialBonuses.throwingSkill) {
                console.log(`Applying racial throwing skill bonus: +${racialBonuses.throwingSkill}`);
                skillValue += racialBonuses.throwingSkill;
            }
        }

        // Set bonus weapon skill (Towerforge Battlegear 2pc: +6 Two-handed Maces)
        if (isTwoHanded && weaponTypeNormalized === 'mace' && setBonuses.towerforge_2pc_two_handed_maces) {
            skillValue += setBonuses.towerforge_2pc_two_handed_maces;
        }

        return skillValue;
    }

    // If dual wielding with different weapon types, calculate separately
    let totalWeaponSkill, mhWeaponSkill, ohWeaponSkill;

    if (data.isDualWielding && data.mainhandWeaponType && data.offhandWeaponType) {
        mhWeaponSkill = calculateWeaponSkillForType(data.mainhandWeaponType, data.mainhandIsTwoHanded);
        ohWeaponSkill = calculateWeaponSkillForType(data.offhandWeaponType, data.offhandIsTwoHanded);
        // Use mainhand weapon skill as the "total" for general calculations
        totalWeaponSkill = mhWeaponSkill;
    } else if (data.mainhandWeaponType) {
        totalWeaponSkill = calculateWeaponSkillForType(data.mainhandWeaponType, data.mainhandIsTwoHanded);
        mhWeaponSkill = totalWeaponSkill;
        ohWeaponSkill = totalWeaponSkill;
    } else {
        // No weapon equipped, use base
        totalWeaponSkill = 300;
        mhWeaponSkill = 300;
        ohWeaponSkill = 300;
    }

    // Ranged weapon skill (for Bow, Crossbow, Gun)
    let rangedWeaponSkill = 300;
    let rangedWeaponSkillHitBonus = 0;
    if (data.rangedWeaponType) {
        rangedWeaponSkill = calculateWeaponSkillForType(data.rangedWeaponType, false);
        rangedWeaponSkillHitBonus = (rangedWeaponSkill - 300) * 0.2;
    }

    console.log('Weapon skills - MH:', mhWeaponSkill, 'OH:', ohWeaponSkill);

    // Calculate benefits from weapon skill (vs level 63 boss) - using mainhand as primary
    const weaponSkillOver300 = totalWeaponSkill - 300;
    const weaponSkillHitBonus = weaponSkillOver300 * 0.2; // 0.2% hit per skill point
    const weaponSkillCritBonus = weaponSkillOver300 * 0.04; // 0.04% crit per skill point

    // Calculate separate bonuses for each hand when dual wielding
    const mhWeaponSkillOver300 = mhWeaponSkill - 300;
    const mhWeaponSkillHitBonus = mhWeaponSkillOver300 * 0.2;
    const mhWeaponSkillCritBonus = mhWeaponSkillOver300 * 0.04;

    const ohWeaponSkillOver300 = ohWeaponSkill - 300;
    const ohWeaponSkillHitBonus = ohWeaponSkillOver300 * 0.2;
    const ohWeaponSkillCritBonus = ohWeaponSkillOver300 * 0.04;

    // Glancing blow damage: base 65%, +2% per skill point, caps at 95% (15 skill = 315 total)
    // At 300 skill: 65%, at 314 skill: 93%, at 315 skill: 95%
    const glancingSkillBonus = Math.min(15, weaponSkillOver300); // Cap at 15 skill
    const glancingDamagePercent = 65 + (glancingSkillBonus * 2);

    // Enemy dodge chance formula: 6.5% - ((weaponSkill - 300) * 0.1%), caps at 315 skill
    // At 300 skill: 6.5%, at 305: 6.0%, at 310: 5.5%, at 315+: 5.0% (capped)
    const dodgeReductionBonus = Math.min(15, totalWeaponSkill - 300); // Cap at 15 skill
    const enemyDodgeChance = 6.5 - (dodgeReductionBonus * 0.1);
    const mhDodgeReductionBonus = Math.min(15, mhWeaponSkill - 300);
    const mhEnemyDodgeChance = 6.5 - (mhDodgeReductionBonus * 0.1);
    const ohDodgeReductionBonus = Math.min(15, ohWeaponSkill - 300);
    const ohEnemyDodgeChance = 6.5 - (ohDodgeReductionBonus * 0.1);

    // --- Dual Wield Detection ---
    // Check if player has an offhand weapon equipped (not a shield)
    const isDualWielding = data.isDualWielding || false;
    // Note: Dual wield has a 19% miss penalty, but we don't show it on the character sheet
    const dualWieldMissPenalty = 0; // Not displayed on sheet

    // Add crit and spell hit from buffs
    let buffCrit = 0;
    let buffSpellCrit = 0;
    let buffSpellHit = 0;
    activeBuffs.forEach(buff => {
        buffCrit += buff.crit || 0;
        buffSpellCrit += buff.spellCrit || 0;
        buffSpellHit += buff.spellHit || 0;
    });

    // Calculate crit with base crit + weapon skill crit
    const baseCrit = (formulas.baseCrit || 0) + (gearStats.crit || 0) + (enchantStats.crit || 0) + (talentBonuses.crit || 0) + buffCrit + (setBonuses.black_dragon_mail_3pc_crit || 0) + (setSheet.crit || 0);
    const agiCrit = (formulas.agiPerCrit > 0) ? totalAgility / formulas.agiPerCrit : 0;

    let totalCrit = baseCrit + agiCrit + weaponSkillCritBonus;
    const mhCrit = baseCrit + agiCrit + mhWeaponSkillCritBonus;
    const ohCrit = baseCrit + agiCrit + ohWeaponSkillCritBonus;

    // Calculate spell crit with base spell crit
    let totalSpellCrit = (formulas.baseSpellCrit || 0) + (gearStats.spellCrit || 0) + (enchantStats.spellCrit || 0) + (talentBonuses.spellCrit || 0) + buffSpellCrit + (setSheet.spellCrit || 0);
    if (formulas.intPerSpellCrit > 0) { totalSpellCrit += totalIntellect / formulas.intPerSpellCrit; }

    // --- Mitigation Logic ---
    // Base miss vs a boss is 5.6%. The level difference (boss weapon skill 315 vs player
    // defense 300 = -15) reduces all avoidance by 0.04% per point, so at default 300 defense:
    // miss = 5.6 - 0.6 = 5.0%, and dodge/parry/block each lose 0.6%.
    // Every defense point above 300 recovers 0.04% of each stat. No cap.
    const attackerWeaponSkill = attackerLevel * 5;
    const defenseDifference = totalDefense - attackerWeaponSkill;
    const defenseSkillModifier = defenseDifference * 0.04;
    const baseMissChance = 5.6;
    const missChance = Math.max(0, baseMissChance + defenseSkillModifier);

    const avo = classAvoStats[selectedClass] || { dodge: 0, parry: 0, block: 0, agiPerDodge: 20 };
    // Add dodge from buffs
    let buffDodge = 0;
    activeBuffs.forEach(buff => {
        buffDodge += buff.dodge || 0;
    });
    let totalDodge = (avo.dodge || 0) + (totalAgility / avo.agiPerDodge) + (gearStats.dodge || 0) + (enchantStats.dodge || 0) + (talentBonuses.dodge || 0) + buffDodge + (setBonuses.dodge || 0) + (setSheet.dodge || 0) + defenseSkillModifier;
    // Improved Primal Aspects (Hunter): +2/4/6% dodge when Aspect of the Monkey is active
    if (selectedClass === 'hunter' && (talentBonuses.improved_primal_aspects_dodge || 0) > 0 &&
        activeBuffs.some(b => b.id === 'aspectOfTheMonkey' || (b.name && b.name.includes('Aspect of the Monkey')))) {
        totalDodge += talentBonuses.improved_primal_aspects_dodge;
    }
    let totalParry = (avo.parry || 0) + (gearStats.parry || 0) + (enchantStats.parry || 0) + (talentBonuses.parry || 0) + (setSheet.parry || 0) + defenseSkillModifier;
    let totalBlock = (avo.block || 0) + (gearStats.blockChance || 0) + (enchantStats.blockChance || 0) + (talentBonuses.blockChance || 0) + (setBonuses.blockChance || 0) + (setSheet.blockChance || 0) + defenseSkillModifier;

    // Add blockChance from buffs (e.g., Holy Shield)
    activeBuffs.forEach(buff => {
        totalBlock += buff.blockChance || 0;
    });

    // Druids cannot parry or block (no shields)
    if (selectedClass === 'druid') {
        totalParry = 0;
        totalBlock = 0;
    }
    // Hunters cannot block
    if (selectedClass === 'hunter') {
        totalBlock = 0;
    }
    // No shield equipped: block chance is 0% for avoidance (all classes)
    if ((offhandArmor || 0) <= 0) {
        totalBlock = 0;
    }

    totalDodge = Math.max(0, totalDodge);
    totalParry = Math.max(0, totalParry);
    totalBlock = Math.max(0, totalBlock);
    
    const totalMitigation = missChance + totalDodge + totalParry + totalBlock;

    // --- EHP Calculation ---
    // Turtle WoW: Armor cap removed, uses diminishing returns above 75%
    // Formula: DR = armor / (armor + 400 + 85 * attackerLevel)
    // No hard cap - continues with diminishing returns above 75%
    const armorDR = totalArmor / (totalArmor + 400 + 85 * attackerLevel);
    const isArmorCapped = false; // No longer capped in Turtle WoW
    const cappedArmorDR = armorDR; // Use uncapped value

    // Check if Rockbiter Weapon is active
    const hasRockbiter = activeBuffs.some(buff => buff.name === 'Rockbiter Weapon');

    // Get Elemental Weapons talent damage reduction (only applies when Rockbiter is active)
    let elementalWeaponsDR = 0;
    if (hasRockbiter) {
        // Use the raw talent value (4/7/10%) - will be 0 if talent not taken
        elementalWeaponsDR = talentBonuses.elemental_weapons_rockbiter_dr || 0;
    }

    // Apply Stormcaller's Battlegear 5-piece bonus multiplier to Elemental Weapons DR
    // Only applies if both 5-piece is equipped AND Rockbiter is active
    if (setBonuses.rockbiter_weapon_bonus && hasRockbiter && elementalWeaponsDR > 0) {
        elementalWeaponsDR = elementalWeaponsDR * (1 + setBonuses.rockbiter_weapon_bonus);
    }

    // Add base set bonus damage reduction (5% from 5-piece) - only if Rockbiter is active
    const baseSetDR = (setBonuses.all_damage_reduction_rockbiter && hasRockbiter) ? setBonuses.all_damage_reduction_rockbiter : 0;

    // Add damageReduction_percent from buffs (e.g., Righteous Fury + Righteous Defense talent)
    let buffDR = 0;
    activeBuffs.forEach(buff => {
        buffDR += buff.damageReduction_percent || 0;
    });

    // Get flat damage reduction from buffs (e.g., Stoneskin Totem - applied BEFORE armor/DR)
    let flatDamageReduction = 0;
    activeBuffs.forEach(buff => {
        flatDamageReduction += buff.flatDamageReduction || 0;
    });

    // Combine all flat DR sources (percent-based, applied AFTER armor)
    const flatDRFromTalents = elementalWeaponsDR;

    // Calculate damage after flat reduction (applied BEFORE armor/DR)
    // This means: finalDamage = max(0, rawDamage - flatDamageReduction)
    // Then apply armor and DR as normal
    // For EHP calculation, we need to adjust: if we reduce damage by X flat, 
    // it's effectively increasing EHP by X / (damage taken per hit)
    // But for simplicity, we'll apply it as a flat reduction in the damage formula
    
    // Note: flatDamageReduction is stored but will be applied in damage calculations
    // For now, we calculate DR normally (flat reduction applied per hit, not in DR %)
    const finalDamageTaken = (1 - cappedArmorDR) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR);
    const totalDR = 1 - finalDamageTaken;
    
    // Check for Berserker Stance (10% increased damage taken = reduced effective HP)
    const berserkerStance = activeBuffs.find(buff => buff.id === 'berserker_stance');
    const damageTakenMultiplier = berserkerStance?.damageIncrease_percent ? (1 + berserkerStance.damageIncrease_percent) : 1.0;
    
    // Effective HP is reduced when taking more damage
    // If you take 10% more damage, your EHP is divided by 1.1
    const effectiveHP = (totalHealth / (1 - totalDR)) / damageTakenMultiplier;

    // --- Resistances ---
    let totalFireResist = (gearStats.fireResist || 0) + (enchantStats.fireResist || 0) + (setSheet.fireResist || 0);
    let totalNatureResist = (gearStats.natureResist || 0) + (enchantStats.natureResist || 0) + (setSheet.natureResist || 0);
    let totalFrostResist = (gearStats.frostResist || 0) + (enchantStats.frostResist || 0) + (setSheet.frostResist || 0);
    let totalShadowResist = (gearStats.shadowResist || 0) + (enchantStats.shadowResist || 0) + (setSheet.shadowResist || 0);
    let totalArcaneResist = (gearStats.arcaneResist || 0) + (enchantStats.arcaneResist || 0) + (setSheet.arcaneResist || 0);

    // Add resistances from buffs
    activeBuffs.forEach(buff => {
        totalFireResist += buff.fireResist || 0;
        totalNatureResist += buff.natureResist || 0;
        totalFrostResist += buff.frostResist || 0;
        totalShadowResist += buff.shadowResist || 0;
        totalArcaneResist += buff.arcaneResist || 0;
    });

    const allResistBonus = (gearStats.allResist || 0) + (enchantStats.allResist || 0) + (talentBonuses.allResist || 0) + (setSheet.allResist || 0);
    if (allResistBonus > 0) {
        totalFireResist += allResistBonus;
        totalNatureResist += allResistBonus;
        totalFrostResist += allResistBonus;
        totalShadowResist += allResistBonus;
        totalArcaneResist += allResistBonus;
    }

    // Ensure resistances can't go below 0 (in case of negative gear stats)
    totalFireResist = Math.max(0, totalFireResist);
    totalNatureResist = Math.max(0, totalNatureResist);
    totalFrostResist = Math.max(0, totalFrostResist);
    totalShadowResist = Math.max(0, totalShadowResist);
    totalArcaneResist = Math.max(0, totalArcaneResist);

    // --- School-Specific Damage Reduction ---
    // Resistance provides 0.238% DR per point, capped at 75% (315 resistance)
    // Formula: DR = min(resistance * 0.00238, 0.75)
    const resistanceDRMultiplier = 0.00238;
    const maxResistanceDR = 0.75;
    
    // Calculate DR from resistance for each school
    const fireDRFromResist = Math.min(totalFireResist * resistanceDRMultiplier, maxResistanceDR);
    const natureDRFromResist = Math.min(totalNatureResist * resistanceDRMultiplier, maxResistanceDR);
    const frostDRFromResist = Math.min(totalFrostResist * resistanceDRMultiplier, maxResistanceDR);
    const shadowDRFromResist = Math.min(totalShadowResist * resistanceDRMultiplier, maxResistanceDR);
    const arcaneDRFromResist = Math.min(totalArcaneResist * resistanceDRMultiplier, maxResistanceDR);
    
    // Get talent-based damage reduction for each school
    const fireDRFromTalents = talentBonuses.fire_dr || 0;
    const natureDRFromTalents = talentBonuses.nature_dr || 0;
    const frostDRFromTalents = talentBonuses.frost_dr || 0;
    const shadowDRFromTalents = talentBonuses.shadow_dr || 0;
    const arcaneDRFromTalents = talentBonuses.arcane_dr || 0;
    const holyDRFromTalents = talentBonuses.holy_dr || 0;
    const physicalDRFromTalents = talentBonuses.physical_dr || 0;

    // Debug logging
    console.log('Talent Bonuses:', talentBonuses);
    console.log('Fire Resist:', totalFireResist, 'Fire DR from resist:', fireDRFromResist, 'Fire DR from talents:', fireDRFromTalents);
    console.log('Frost Resist:', totalFrostResist, 'Frost DR from resist:', frostDRFromResist, 'Frost DR from talents:', frostDRFromTalents);

    // Total damage reduction by school (resistance + talents + all DR from Rockbiter + set bonus + buff DR)
    // Use flatDRFromTalents which includes set bonus multiplier, and baseSetDR for the 5% base reduction
    // Formula: 1 - ((1 - resist_DR) * (1 - talent_DR) * (1 - flatDR_with_set_bonus) * (1 - base_set_DR) * (1 - buff_DR))
    const totalFireDR = 1 - ((1 - fireDRFromResist) * (1 - fireDRFromTalents) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR));
    const totalNatureDR = 1 - ((1 - natureDRFromResist) * (1 - natureDRFromTalents) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR));
    const totalFrostDR = 1 - ((1 - frostDRFromResist) * (1 - frostDRFromTalents) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR));
    const totalShadowDR = 1 - ((1 - shadowDRFromResist) * (1 - shadowDRFromTalents) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR));
    const totalArcaneDR = 1 - ((1 - arcaneDRFromResist) * (1 - arcaneDRFromTalents) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR));
    const totalHolyDR = 1 - ((1 - 0) * (1 - holyDRFromTalents) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR)); // No holy resistance

    // Physical damage uses armor DR + talents + flatDR from Rockbiter (with set bonus) + base set DR + buff DR
    const totalPhysicalDR = 1 - ((1 - cappedArmorDR) * (1 - physicalDRFromTalents) * (1 - flatDRFromTalents) * (1 - baseSetDR) * (1 - buffDR));


    // --- School-Specific Damage Bonuses ---
    // Add spell damage from buffs
    let buffSpellDamage = 0;
    let buffFireSpellDamage = 0;
    let buffFrostSpellDamage = 0;
    let buffNatureSpellDamage = 0;
    activeBuffs.forEach(buff => {
        buffSpellDamage += buff.spellDamage || 0;
        buffFireSpellDamage += buff.fireSpellDamage || 0;
        buffFrostSpellDamage += buff.frostSpellDamage || 0;
        buffNatureSpellDamage += buff.natureSpellDamage || 0;
    });

    // Each school gets base spell damage + school-specific bonus
    const baseSpellDamage = (gearStats.dmgAndHealing || 0) + (enchantStats.dmgAndHealing || 0) + (setSheet.dmgAndHealing || 0) + buffSpellDamage;
    const fireDamage = baseSpellDamage + (gearStats.fireDamage || 0) + (enchantStats.fireDamage || 0) + (setSheet.fireDamage || 0) + buffFireSpellDamage;
    const frostDamage = baseSpellDamage + (gearStats.frostDamage || 0) + (enchantStats.frostDamage || 0) + (setSheet.frostDamage || 0) + buffFrostSpellDamage;
    const natureDamage = baseSpellDamage + (gearStats.natureDamage || 0) + (enchantStats.natureDamage || 0) + (setSheet.natureDamage || 0) + buffNatureSpellDamage;
    const shadowDamage = baseSpellDamage + (gearStats.shadowDamage || 0) + (enchantStats.shadowDamage || 0) + (setSheet.shadowDamage || 0);
    const arcaneDamage = baseSpellDamage + (gearStats.arcaneDamage || 0) + (enchantStats.arcaneDamage || 0) + (setSheet.arcaneDamage || 0);
    const holyDamage = baseSpellDamage + (gearStats.holyDamage || 0) + (enchantStats.holyDamage || 0) + (setSheet.holyDamage || 0);
    const spellPen = (gearStats.spellPen || 0) + (enchantStats.spellPen || 0) + (talentBonuses.spellPen || 0) + (setSheet.spellPen || 0);
    // Debug: Log spell pen sources
    if (talentBonuses.spellPen) {
        console.log('Spell Penetration:', {
            gear: gearStats.spellPen || 0,
            enchant: enchantStats.spellPen || 0,
            talent: talentBonuses.spellPen || 0,
            total: spellPen
        });
    }

    // Calculate hit stats for each hand
    const baseHit = (gearStats.hit || 0) + (enchantStats.hit || 0) + (talentBonuses.hit || 0) + (setBonuses.black_dragon_mail_2pc_hit || 0) + (setSheet.hit || 0);
    const totalHit = baseHit + weaponSkillHitBonus - dualWieldMissPenalty;
    const mhHit = baseHit + mhWeaponSkillHitBonus - dualWieldMissPenalty;
    const ohHit = baseHit + ohWeaponSkillHitBonus - dualWieldMissPenalty;
    const rangedHit = baseHit + rangedWeaponSkillHitBonus;

    // --- Magic EHP Calculations ---
    // Magic EHP = health / (1 - magicDR) / damageTakenMultiplier (for Berserker Stance)
    const fireEHP = (totalHealth / (1 - totalFireDR || 0.0001)) / damageTakenMultiplier;
    const frostEHP = (totalHealth / (1 - totalFrostDR || 0.0001)) / damageTakenMultiplier;
    const natureEHP = (totalHealth / (1 - totalNatureDR || 0.0001)) / damageTakenMultiplier;
    const shadowEHP = (totalHealth / (1 - totalShadowDR || 0.0001)) / damageTakenMultiplier;
    const arcaneEHP = (totalHealth / (1 - totalArcaneDR || 0.0001)) / damageTakenMultiplier;
    const holyEHP = (totalHealth / (1 - totalHolyDR || 0.0001)) / damageTakenMultiplier;

    // --- Return Object ---
    const buffHaste = activeBuffs.reduce((sum, buff) => sum + (buff.haste || 0), 0);
    const baseHaste = (gearStats.haste || 0) + (enchantStats.haste || 0) + (talentBonuses.haste || 0) + buffHaste + (setSheet.haste || 0);

    const apVsFromGear = {};
    for (const k of AP_VS_GEAR_STAT_KEYS) {
        apVsFromGear[k] = (gearStats[k] || 0) + (enchantStats[k] || 0) + (setSheet[k] || 0);
    }
    const dmgHealingVsFromGear = {};
    for (const k of DMG_HEALING_VS_GEAR_STAT_KEYS) {
        dmgHealingVsFromGear[k] = (gearStats[k] || 0) + (enchantStats[k] || 0) + (setSheet[k] || 0);
    }
    // Passive haste for sim baseline: gear + enchant + talent + UI buffs (auras like Atiesh, food).
    // Excludes sim-internal procs (Bloodlust, Kiss, Flurry) which are applied dynamically.
    const meleeHastePassive = (gearStats.haste || 0) + (enchantStats.haste || 0) + (talentBonuses.haste || 0) + (talentBonuses.swift_reflexes_melee_haste || 0) + buffHaste;
    return {
        health: Math.floor(totalHealth), mana: totalMana, armor: Math.floor(totalArmor), dr: totalDR, ehp: Math.floor(effectiveHP), drCapped: isArmorCapped,
        stamina: totalStamina, agility: totalAgility, strength: totalStrength, intellect: totalIntellect, spirit: totalSpirit,
        hpPerStamina: hpPerStamina,
        attackPower: Math.floor(totalAttackPower),
        druidAP: (gearStats.druidAP || 0) + (enchantStats.druidAP || 0) + (setSheet.druidAP || 0),
        crit: totalCrit,
        hit: totalHit,
        haste: baseHaste,
        meleeHaste: baseHaste + (talentBonuses.swift_reflexes_melee_haste || 0),
        meleeHastePassive,
        rangedCrit: totalCrit + (talentBonuses.rangedCrit || 0),
        rangedAttackPower: Math.floor(totalRangedAttackPower),
        rangedHit: rangedHit,
        ranged_weapon_damage_percent: talentBonuses.ranged_weapon_damage_percent || 0,
        spellCrit: totalSpellCrit,
        spellHit: (gearStats.spellHit || 0) + (enchantStats.spellHit || 0) + (talentBonuses.spellHit || 0) + buffSpellHit + (setSheet.spellHit || 0),
        weaponSkill: totalWeaponSkill,
        enemyDodgeChance: enemyDodgeChance,
        glancingDamage: glancingDamagePercent,
        // Dual wield specific stats
        mhWeaponSkill: mhWeaponSkill,
        ohWeaponSkill: ohWeaponSkill,
        mhCrit: mhCrit,
        ohCrit: ohCrit,
        mhHit: mhHit,
        ohHit: ohHit,
        mhEnemyDodgeChance: mhEnemyDodgeChance,
        ohEnemyDodgeChance: ohEnemyDodgeChance,
        healing: (gearStats.healing || 0) + (enchantStats.healing || 0) + (setSheet.healing || 0) + (activeBuffs.reduce((sum, buff) => sum + (buff.healing || 0), 0)),
        dmgAndHealing: (gearStats.dmgAndHealing || 0) + (enchantStats.dmgAndHealing || 0) + (setBonuses.dmgAndHealing || 0) + (setSheet.dmgAndHealing || 0) + buffSpellDamage,
        mp5: (gearStats.mp5 || 0) + (enchantStats.mp5 || 0) + (setSheet.mp5 || 0) + (activeBuffs.reduce((sum, buff) => sum + (buff.mp5 || 0), 0)),
        defense: Math.floor(totalDefense), dodge: totalDodge, parry: totalParry, block: totalBlock,
        missChance,
        blockValue: (selectedClass === 'druid' || selectedClass === 'hunter' || (offhandArmor || 0) <= 0) ? 0 : (() => {
            // Base block value calculation
            const baseBlockValue = Math.floor((gearStats.blockValue || 0) + (enchantStats.blockValue || 0) + (setBonuses.blockValue || 0) + (setSheet.blockValue || 0) + Math.floor(totalStrength / 20));
            
            // Apply talent-based block value multipliers (multiplicative)
            let blockValueMultiplier = 1 + (talentBonuses.blockValue_percent || 0);
            
            // Apply buff-based block value multipliers (e.g., Stoneskin Totem with Enhancing Totems)
            // These should be multiplicative, not additive
            activeBuffs.forEach(buff => {
                if (buff.blockValueMultiplier_percent) {
                    blockValueMultiplier *= (1 + buff.blockValueMultiplier_percent);
                }
            });
            
            return Math.floor(baseBlockValue * blockValueMultiplier);
        })(),
        totalMitigation: totalMitigation,
        fireResist: totalFireResist, natureResist: totalNatureResist,
        frostResist: totalFrostResist, shadowResist: totalShadowResist,
        arcaneResist: totalArcaneResist,
        fireDR: totalFireDR, natureDR: totalNatureDR, frostDR: totalFrostDR,
        shadowDR: totalShadowDR, arcaneDR: totalArcaneDR, holyDR: totalHolyDR,
        physicalDR: totalPhysicalDR,
        fireEHP: Math.floor(fireEHP), frostEHP: Math.floor(frostEHP), natureEHP: Math.floor(natureEHP),
        shadowEHP: Math.floor(shadowEHP), arcaneEHP: Math.floor(arcaneEHP), holyEHP: Math.floor(holyEHP),
        vampirism: (gearStats.vampirism || 0) + (enchantStats.vampirism || 0) + (setSheet.vampirism || 0),
        critDmgReduction: (gearStats.critDmgReduction || 0) + (enchantStats.critDmgReduction || 0),
        armorPen: (gearStats.armorPen || 0) + (enchantStats.armorPen || 0),
        ...apVsFromGear,
        ...dmgHealingVsFromGear,
        fireDamage: fireDamage,
        frostDamage: frostDamage,
        natureDamage: natureDamage,
        shadowDamage: shadowDamage,
        arcaneDamage: arcaneDamage,
        holyDamage: holyDamage,
        spellPen: spellPen,
        // Item proc modifier (%): gear + enchants + talents (passed to combat sim / UI)
        fortune: (gearStats.fortune || 0) + (enchantStats.fortune || 0) + (talentBonuses.fortune || 0)
    };
}