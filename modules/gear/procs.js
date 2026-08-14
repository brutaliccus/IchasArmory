// modules/procs.js - Proc effect definitions and simulation logic

/**
 * Proc effect definitions
 * Each proc has:
 * - id: unique identifier
 * - name: display name
 * - itemName: name of the item that provides this proc (for detection)
 * - cooldown: cooldown in seconds
 * - duration: duration in seconds (or null if instant)
 * - statModifiers: object with stat changes { blockValue: 235, etc }
 * - procType: 'onUse' (manual activation) or 'chanceOnHit' (automatic proc)
 * - procChance: chance to proc (0-100), only for chanceOnHit type
 * - modifiesStats: function to apply stat modifiers considering talents/buffs
 */
export const procDefinitions = [
    {
        id: 'glyph_of_deflection',
        name: 'Glyph of Deflection',
        itemName: 'Glyph of Deflection',
        cooldown: 180, // 3 minutes
        duration: 20, // 20 seconds
        statModifiers: {
            blockValue: 235
        },
        procType: 'onUse', // Manual activation
        // modifiesStats will be called with (baseStats, characterData) to apply talent/buff multipliers
        modifiesStats: (baseStats, characterData) => {
            // Get talent bonuses that affect block value (multiplicative)
            const talentBonuses = characterData.talentBonuses || {};
            let blockValueMultiplier = 1 + (talentBonuses.blockValue_percent || 0);
            
            // Apply buff-based block value multipliers (e.g., Stoneskin Totem with Enhancing Totems)
            // These should be multiplicative, not additive
            const activeBuffs = characterData.activeBuffs || [];
            activeBuffs.forEach(buff => {
                if (buff.blockValueMultiplier_percent) {
                    blockValueMultiplier *= (1 + buff.blockValueMultiplier_percent);
                }
            });
            
            // Apply multipliers to block value
            const modifiedStats = { ...baseStats };
            if (modifiedStats.blockValue) {
                modifiedStats.blockValue = Math.floor(modifiedStats.blockValue * blockValueMultiplier);
            }
            
            return modifiedStats;
        }
    },
    {
        id: 'kiss_of_the_spider',
        name: 'Kiss of the Spider',
        itemName: 'Kiss of the Spider',
        itemId: 22954,
        cooldown: 180, // 3 minutes
        duration: 15, // 15 seconds
        statModifiers: {
            haste: 20 // 20% attack speed
        },
        procType: 'onUse',
        noGlobalCooldown: true, // Can be used at any time, does not incur GCD
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'onUseActivation',
            modifier: 'kissOfTheSpider',
            duration: 15,
            cooldown: 180,
            noGCD: true,
            hastePercent: 20
        },
        color: '#800080',
        icon: 'https://octowow.st/db/images/icons/large/inv_trinket_naxxramas04.png',
        modifiesStats: (baseStats, characterData) => baseStats
    },
    {
        id: 'bulwark_of_enduring_earth',
        name: 'Bulwark of Enduring Earth',
        itemName: 'Bulwark of Enduring Earth',
        cooldown: 0, // No cooldown (but proc chance limits it)
        duration: 10, // 10 seconds
        statModifiers: {
            armor: 200,
            blockValue: 30
        },
        procType: 'chanceOnHit', // Automatic proc when struck
        procChance: 3.0, // 3% chance to proc when hit
        // modifiesStats will be called with (baseStats, characterData) to apply talent/buff multipliers
        modifiesStats: (baseStats, characterData) => {
            // Get talent bonuses that affect block value (multiplicative)
            const talentBonuses = characterData.talentBonuses || {};
            let blockValueMultiplier = 1 + (talentBonuses.blockValue_percent || 0);
            
            // Apply buff-based block value multipliers (e.g., Stoneskin Totem with Enhancing Totems)
            // These should be multiplicative, not additive
            const activeBuffs = characterData.activeBuffs || [];
            activeBuffs.forEach(buff => {
                if (buff.blockValueMultiplier_percent) {
                    blockValueMultiplier *= (1 + buff.blockValueMultiplier_percent);
                }
            });
            
            // Apply multipliers to block value (armor typically doesn't have multipliers)
            const modifiedStats = { ...baseStats };
            if (modifiedStats.blockValue) {
                modifiedStats.blockValue = Math.floor(modifiedStats.blockValue * blockValueMultiplier);
            }
            
            return modifiedStats;
        }
    },
    {
        id: 'stoneshield_potion',
        name: 'Greater Stoneshield Potion',
        itemName: 'Greater Stoneshield Potion', // For buff detection
        cooldown: 0, // No cooldown (consumable, not reusable)
        duration: 120, // 2 minutes
        statModifiers: {
            armor: 2000
        },
        procType: 'onUse', // Manual activation (used before combat)
        // Armor doesn't need multipliers, so no modifiesStats needed
        modifiesStats: (baseStats, characterData) => {
            // Armor is a flat stat, no multipliers needed
            return baseStats;
        }
    },
    {
        id: 'redoubt',
        name: 'Redoubt',
        itemName: 'Redoubt', // For talent detection
        color: '#FF9800',
        icon: 'https://octowow.st/db/images/icons/large/ability_defend.png',
        cooldown: 0, // No cooldown
        duration: 10, // 10 seconds
        maxBlocks: 5, // Expires after 5 blocks OR 10 seconds, whichever comes first
        statModifiers: {}, // Will be determined by talent rank when proc activates
        procType: 'chanceOnHit', // Procs when struck in combat
        procChance: 0, // Dynamic based on talent rank (2/4/6/8/10%)
        // Spell IDs for tooltips: 45818-45822 for ranks 1-5
        spellIds: [45818, 45819, 45820, 45821, 45822],
        // Get Redoubt talent rank
        getTalentRank: function(characterData) {
            let redoubtPoints = 0;
            try {
                const redoubtEl = document.getElementById('protection-2'); // Protection tree, talent ID 2
                if (redoubtEl) {
                    redoubtPoints = parseInt(redoubtEl.dataset.points, 10) || 0;
                }
            } catch (e) {
                // Fallback: check characterData for talent rank
                if (characterData && characterData.talentBonuses) {
                    redoubtPoints = characterData.talentBonuses.redoubt_rank || 0;
                }
            }
            
            // If still 0, try to get from activeBuffs (legacy support)
            if (redoubtPoints === 0 && characterData) {
                const activeBuffs = characterData.activeBuffs || [];
                const redoubtBuff = activeBuffs.find(buff => buff.id === 'redoubt');
                if (redoubtBuff && redoubtBuff.blockChance) {
                    const blockChanceValues = [0, 3, 6, 9, 12, 15];
                    redoubtPoints = blockChanceValues.indexOf(redoubtBuff.blockChance) || 0;
                }
            }
            
            return redoubtPoints;
        },
        // Get proc chance based on talent rank: 2/4/6/8/10%
        getProcChance: function(characterData) {
            const rank = this.getTalentRank(characterData);
            const procChanceValues = [0, 2, 4, 6, 8, 10];
            return procChanceValues[rank] || 0;
        },
        // Get block chance based on talent rank: 3/6/9/12/15%
        // This is called when the proc activates to determine stat modifiers
        getTalentStats: function(characterData) {
            const redoubtPoints = this.getTalentRank(characterData);
            
            // Rank 1: 3%, Rank 2: 6%, Rank 3: 9%, Rank 4: 12%, Rank 5: 15%
            const blockChanceValues = [0, 3, 6, 9, 12, 15];
            const blockChance = redoubtPoints > 0 ? blockChanceValues[redoubtPoints] || 0 : 0;
            
            if (blockChance === 0) {
                return null; // Talent not learned - proc should not activate
            }
            
            return {
                blockChance: blockChance
            };
        }
    },
    {
        id: 'lion_horn_of_stormwind',
        name: 'The Lion Horn of Stormwind',
        itemName: 'The Lion Horn of Stormwind',
        cooldown: 0, // No cooldown (but proc chance limits it)
        duration: 30, // 30 seconds
        statModifiers: {
            haste: 5 // 5% haste
        },
        procType: 'chanceOnHit', // Automatic proc when struck
        procChance: 2.0, // 2% chance to proc when hit
        modifiesStats: (baseStats, characterData) => {
            // Haste is a flat stat, no multipliers needed
            return baseStats;
        }
    },
    {
        id: 'holy_shield',
        name: 'Holy Shield',
        itemName: 'Holy Shield', // Talent-based, not item-based
        color: '#FFD700',
        icon: 'https://octowow.st/db/images/icons/large/spell_holy_blessingofprotection.png',
        cooldown: 10.2, // 10 second cooldown + 200ms reaction delay
        duration: 10, // 10 seconds
        maxBlocks: 4, // Expires after 4 blocks OR 10 seconds
        statModifiers: {
            blockChance: 45 // +45% block chance
        },
        procType: 'onUse',
        fromTalent: true, // Indicates this comes from a talent
        spellIds: [20925], // Spell ID for tooltip lookup
        // Check if Holy Shield talent is learned (1 rank talent)
        getTalentRank: function(characterData) {
            // Primary: check characterData talent bonuses (most reliable)
            if (characterData && characterData.talentBonuses) {
                const holyShieldRank = characterData.talentBonuses.holy_shield_rank;
                if (holyShieldRank !== undefined && holyShieldRank !== null && holyShieldRank > 0) {
                    return holyShieldRank;
                }
            }
            
            // Fallback: try to get from DOM
            try {
                let talentEl = document.getElementById('holy-17');
                if (!talentEl) {
                    talentEl = document.querySelector('[data-tree="holy"][data-talent-id="17"]');
                }
                
                if (talentEl) {
                    const points = parseInt(talentEl.dataset.points, 10) || 0;
                    return points > 0 ? 1 : 0;
                }
            } catch (e) {
                // DOM access failed
            }
            
            return 0;
        },
        // Get block chance (always 45% if talented)
        getTalentStats: function(characterData) {
            const rank = this.getTalentRank(characterData);
            if (rank === 0) {
                return null; // Talent not learned - proc should not activate
            }
            
            return {
                blockChance: 45 // Always 45% block chance
            };
        }
    },
    {
        id: 'elemental_devastation',
        name: 'Elemental Devastation',
        itemName: 'Elemental Devastation', // Talent-based
        color: '#A335EE',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_elementaldevastation.png',
        cooldown: 0, // No cooldown, can proc repeatedly
        duration: 10, // 10 seconds
        statModifiers: {}, // Will be determined by talent rank when proc activates
        procType: 'onMeleeCrit', // Procs when melee attack crits (triggers spell crit buff)
        procChance: 100, // 100% chance to proc on melee crit
        fromTalent: true,
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'statBuff',
            // Stats determined by talent rank at runtime
            statsFromTalent: true,
            talentStatKey: 'spellHit', // +3/6/9% spell HIT based on rank (NOT crit!)
            talentStatValues: [0, 3, 6, 9],
            modifier: 'elementalDevastation' // For legacy sync
        },
        // Get Elemental Devastation talent rank
        getTalentRank: function(characterData) {
            if (characterData && characterData.talentBonuses) {
                return characterData.talentBonuses.elemental_devastation || 
                       characterData.talentBonuses.elementalDevastation || 0;
            }
            return 0;
        },
        // Get spell hit bonus based on talent rank: 3/6/9%
        getTalentStats: function(characterData) {
            const rank = this.getTalentRank(characterData);
            if (rank === 0) {
                return null; // Talent not learned
            }

            const spellHitValues = [0, 3, 6, 9];
            const spellHit = spellHitValues[rank] || 0;

            return {
                spellHit: spellHit // +3/6/9% spell hit
            };
        }
    },
    {
        id: 'flurry',
        name: 'Flurry',
        itemName: 'Flurry', // Talent-based
        cooldown: 0, // No cooldown, can proc repeatedly
        duration: 15, // 15 second max duration (expires if charges not consumed)
        maxAttacks: 3, // Expires after 3 melee swings
        maxCharges: 3, // Alias for data-driven system
        statModifiers: {}, // Will be determined by talent rank when proc activates
        procType: 'onMeleeCrit', // Procs on melee crit (spell crits handled separately in combatSim)
        procChance: 100, // 100% chance to proc on crit
        fromTalent: true,
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'chargeBuff',
            charges: 3,
            duration: 15, // 15 second max duration
            // Haste determined by talent rank at runtime
            hasteFromTalent: true,
            talentHasteValues: [0, 8, 11, 14, 17, 20],
            consumedBy: ['autoAttack'] // Only auto attacks consume charges
        },
        color: '#4CAF50',
        icon: 'https://octowow.st/db/images/icons/large/ability_ghoulfrenzy.png',
        // Get Flurry talent rank
        getTalentRank: function(characterData) {
            if (characterData && characterData.talentBonuses) {
                return characterData.talentBonuses.flurry || 0;
            }
            return 0;
        },
        // Get attack speed bonus based on talent rank: 8/11/14/17/20%
        getTalentStats: function(characterData) {
            const rank = this.getTalentRank(characterData);
            if (rank === 0) {
                return null; // Talent not learned
            }

            const hasteValues = [0, 8, 11, 14, 17, 20];
            const haste = hasteValues[rank] || 0;

            return {
                haste: haste // +8/11/14/17/20% attack speed
            };
        }
    },
    {
        id: 'lightning_shield',
        name: 'Lightning Shield',
        itemName: 'Lightning Shield', // Spell-based
        color: '#4E84C4',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_lightningshield.png',
        cooldown: 0, // No global cooldown
        internalCooldown: 2, // 2 second ICD (3 seconds with Stable Shields)
        duration: null, // Lasts until charges are consumed
        charges: 3, // Base 3 charges (+2/4/6 with Stable Shields talent)
        statModifiers: {}, // No passive stat modifiers, does damage when hit
        procType: 'onBeingHit', // Custom proc type: procs when player is hit
        procChance: 100, // 100% chance to proc when hit (if off ICD and has charges)
        fromSpell: true,
        requiresBeingAttacked: true, // Only works when being attacked
        // Get Stable Shields talent rank
        getTalentRank: function(characterData) {
            if (characterData && characterData.talentBonuses) {
                return characterData.talentBonuses.stable_shields || 0;
            }
            return 0;
        },
        // Get charge bonus and ICD increase from talent
        getTalentStats: function(characterData) {
            const rank = this.getTalentRank(characterData);

            // Stable Shields: 3 ranks, adds 2/4/6 charges, increases ICD by 1 sec
            const chargeValues = [0, 2, 4, 6];
            const icdIncrease = rank > 0 ? 1 : 0;

            return {
                chargesBonus: chargeValues[rank] || 0,
                icdIncrease: icdIncrease
            };
        },
        // Get total charges including talent bonus
        getTotalCharges: function(characterData) {
            const talentStats = this.getTalentStats(characterData);
            return this.charges + (talentStats?.chargesBonus || 0);
        },
        // Get total ICD including talent increase
        getTotalICD: function(characterData) {
            const talentStats = this.getTalentStats(characterData);
            return this.internalCooldown + (talentStats?.icdIncrease || 0);
        }
    },
    {
        id: 'elemental_mastery',
        name: 'Elemental Mastery',
        itemName: 'Elemental Mastery', // Talent-based
        color: '#FF7D0A',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_wispheal.png',
        cooldown: 180, // 3 minutes cooldown
        duration: 15, // 15 seconds duration (user specified, though description says 10s)
        statModifiers: {}, // Damage bonus is handled as a modifier, not a stat
        procType: 'onUse',
        fromTalent: true,
        spellIds: [16166], // Spell ID for tooltip lookup
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'onUseActivation',
            modifier: 'elementalMastery',
            duration: 15,
            cooldown: 180,
            noGCD: true,
            damagePercent: 15, // +15% Fire/Frost/Nature damage
            requiresTalent: 'elemental_mastery_rank'
        },
        // Check if Elemental Mastery talent is learned (1 rank talent)
        getTalentRank: function(characterData) {
            // Primary: check characterData talent bonuses
            if (characterData && characterData.talentBonuses) {
                const elementalMasteryRank = characterData.talentBonuses.elemental_mastery_rank;
                if (elementalMasteryRank !== undefined && elementalMasteryRank !== null && elementalMasteryRank > 0) {
                    return elementalMasteryRank;
                }
            }
            
            // Fallback: try to get from DOM
            try {
                let talentEl = document.getElementById('elemental-17');
                if (!talentEl) {
                    talentEl = document.querySelector('[data-tree="elemental"][data-talent-id="17"]');
                }
                
                if (talentEl) {
                    const points = parseInt(talentEl.dataset.points, 10) || 0;
                    return points > 0 ? 1 : 0;
                }
            } catch (e) {
                // DOM access failed
            }
            
            return 0;
        },
        // Elemental Mastery doesn't modify stats directly - it modifies damage via multiplier
        getTalentStats: function(characterData) {
            const rank = this.getTalentRank(characterData);
            if (rank === 0) {
                return null; // Talent not learned - proc should not activate
            }
            
            // Returns empty object - damage multiplier is handled in combat sim
            return {};
        }
    },
    {
        id: 'shard_of_the_fallen_star',
        name: 'Shard of the Fallen Star',
        itemName: 'Shard of the Fallen Star',
        itemId: 21891,
        cooldown: 180, // 3 minutes
        duration: null, // Instant damage, no duration
        statModifiers: {}, // No stat modifiers, deals damage directly
        procType: 'onUse', // Manual activation
        noGlobalCooldown: true, // Does not trigger GCD
        damageMin: 400, // Base damage
        damageMax: 443, // Base damage
        damageSchool: 'fire', // Fire damage
        spCoefficient: 0.25, // 25% spell power coefficient (scales with fire power)
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'onUseDamage',
            damageMin: 400,
            damageMax: 443,
            damageSchool: 'fire',
            spCoefficient: 0.25,
            cooldown: 180,
            noGCD: true,
            triggersSpellHitProcs: true // Triggers Wrath of Cenarius etc.
        },
        color: '#FF4500',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_gem_variety_02.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'eye_of_diminution',
        name: 'Eye of Diminution',
        itemName: 'Eye of Diminution',
        itemId: 23001,
        cooldown: 180, // 3 minutes
        duration: 20, // 20 seconds
        statModifiers: {}, // No stat modifiers, reduces threat via activeModifiers
        procType: 'onUse', // Manual activation
        noGlobalCooldown: true, // Does not trigger GCD
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'onUseActivation',
            modifier: 'eyeOfDiminution',
            duration: 20,
            cooldown: 180,
            noGCD: true,
            threatReduction: 35 // -35% threat generated
        },
        color: '#9C27B0',
        icon: 'https://octowow.st/db/images/icons/large/inv_trinket_naxxramas02.png',
        modifiesStats: (baseStats) => baseStats
    },
    // === ON-USE STAT TRINKETS ===
    {
        id: 'restrained_essence_of_sapphiron',
        name: 'Restrained Essence of Sapphiron',
        itemName: 'Restrained Essence of Sapphiron',
        itemId: 23046,
        cooldown: 120, // 2 minutes
        duration: 20,
        statModifiers: { spellPower: 130 },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'onUseActivation',
            modifier: 'restrainedEssenceOfSapphiron',
            duration: 20,
            cooldown: 120,
            noGCD: true,
            spellPower: 130
        },
        color: '#00BFFF',
        icon: 'https://octowow.st/db/images/icons/large/inv_trinket_naxxramas06.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'slayers_crest',
        name: "Slayer's Crest",
        itemName: "Slayer's Crest",
        itemId: 23041,
        cooldown: 120, // 2 minutes
        duration: 20,
        statModifiers: { attackPower: 260 },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'onUseActivation',
            modifier: 'slayersCrest',
            duration: 20,
            cooldown: 120,
            noGCD: true,
            attackPower: 260
        },
        color: '#CD5C5C',
        icon: 'https://octowow.st/db/images/icons/large/inv_trinket_naxxramas01.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'earthstrike',
        name: 'Earthstrike',
        itemName: 'Earthstrike',
        itemId: 21180,
        cooldown: 120, // 2 minutes
        duration: 20,
        statModifiers: { attackPower: 280 },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'onUseActivation',
            modifier: 'earthstrike',
            duration: 20,
            cooldown: 120,
            noGCD: true,
            attackPower: 280
        },
        color: '#8B4513',
        icon: 'https://octowow.st/db/images/icons/large/inv_trinket_naxxramas06.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'molten_emberstone',
        name: 'Molten Emberstone',
        itemName: 'Molten Emberstone',
        itemId: 58211,
        cooldown: 120, // 2 minutes
        duration: 20,
        statModifiers: { attackPower: 200 },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'onUseActivation',
            modifier: 'moltenEmberstone',
            duration: 20,
            cooldown: 120,
            noGCD: true,
            attackPower: 200
        },
        color: '#FF4500',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_gem_ruby_01.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'zandalarian_hero_charm',
        name: 'Zandalarian Hero Charm',
        itemName: 'Zandalarian Hero Charm',
        itemId: 19950,
        cooldown: 120, // 2 minutes
        duration: 20,
        statModifiers: { spellPower: 204 },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'decayingSpBuff',
            modifier: 'zandalarianHeroCharm',
            duration: 20,
            cooldown: 120,
            noGCD: true,
            spellPower: 204,
            spPerCharge: 17, // Loses 17 SP per qualifying spell cast
            autoReactivate: true
        },
        color: '#DAA520',
        icon: 'https://octowow.st/db/images/icons/large/inv_jewelry_necklace_13.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'vial_of_potent_venoms',
        name: 'Vial of Potent Venoms',
        itemName: 'Vial of Potent Venoms',
        itemId: 61243,
        cooldown: 0,
        internalCooldown: 0,
        duration: 12,
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 20,
        damageSchool: 'nature',
        canCrit: false,
        canResist: true,
        effect: {
            type: 'stackingSnapshotDot',
            damageSchool: 'nature',
            dotDamage: 120,
            dotDuration: 12,
            dotTickInterval: 3,
            maxStacks: 2,
            canResist: true,
            canCrit: false,
            snapshotBuffs: true,
            benefitsFromStormstrike: true,
            consumesStormstrike: false
        },
        color: '#32CD32',
        icon: 'https://octowow.st/db/images/icons/large/inv_potion_97.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'talisman_of_ephemeral_power',
        name: 'Talisman of Ephemeral Power',
        itemName: 'Talisman of Ephemeral Power',
        itemId: 18820,
        cooldown: 90, // 1.5 minutes
        duration: 15,
        statModifiers: { spellPower: 175 },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'onUseActivation',
            modifier: 'talismanOfEphemeralPower',
            duration: 15,
            cooldown: 90,
            noGCD: true,
            spellPower: 175
        },
        color: '#9370DB',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_orb_04.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'crusader',
        name: 'Crusader',
        enchantName: 'Enchant Weapon - Crusader', // Match enchant name
        enchantId: 1900, // Effect ID for Crusader enchant
        cooldown: 0, // No cooldown (PPM limits proc rate)
        duration: 15, // 15 seconds
        statModifiers: {
            str: 100 // +100 Strength
        },
        procType: 'onMeleeHit', // Procs when attacking (including Stormstrike and Lightning Strike)
        procChance: 1.0, // Base 1 PPM - will be recalculated dynamically
        ppm: 1.0, // Procs Per Minute
        spellIds: [20034], // Crusader spell ID
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'statBuff',
            stats: { strength: 100 },
            // Strength converts to AP at 2:1 ratio
            convertsTo: { strength: { attackPower: 2 } },
            applyMultipliers: ['kings', 'ancestralKnowledge']
        },
        // Calculate dynamic proc chance based on *base* weapon speed (before haste).
        // PPM: proc chance per hit = (baseWeaponSpeed × PPM) / 60. Haste does not change this
        // per-hit chance; it only increases procs by increasing hits per minute.
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;

            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 2.5;

            const procChancePercent = (baseWeaponSpeed * this.ppm) / 60 * 100;


            return procChancePercent;
        },
        modifiesStats: (baseStats, characterData) => {
            // Apply % multipliers to strength (Kings, Ancestral Knowledge, etc.)
            const modifiedStats = { ...baseStats };

            if (modifiedStats.str) {
                let strMultiplier = 1.0;

                // Check for Kings buff (10% stats)
                const activeBuffs = characterData?.activeBuffs || [];
                const hasKings = activeBuffs.some(buff =>
                    buff.name?.toLowerCase().includes('greater blessing of kings') ||
                    buff.name?.toLowerCase().includes('blessing of kings') ||
                    buff.id === 'blessingOfKings'
                );
                if (hasKings) {
                    strMultiplier *= 1.10;
                }

                // Check for talent-based multipliers (e.g., Ancestral Knowledge for shamans)
                const talentBonuses = characterData?.talentBonuses || {};
                if (talentBonuses.str_percent) {
                    strMultiplier *= (1 + talentBonuses.str_percent);
                }

                // Apply multiplier
                modifiedStats.str = Math.floor(modifiedStats.str * strMultiplier);

            }

            return modifiedStats;
        },
        color: '#FFD700',
        icon: 'https://octowow.st/db/images/icons/large/spell_holy_blessingofstrength.png'
    },
    {
        id: 'wrath_of_cenarius',
        name: 'Wrath of Cenarius',
        itemName: 'Wrath of Cenarius',
        itemId: 21190,
        cooldown: 0,
        duration: 10,
        statModifiers: {}, // +132 spell damage applied via activeModifiers.wrathOfCenarius in sim
        procType: 'onSpellHit', // Procs when harmful spells land: shocks, Lightning Strike (nature), Lightning Shield, Empowered Lightning Shield, spell strike
        procChance: 5.0, // 5% chance when your harmful spells land
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'stackingBuff',
            modifierKey: 'wrathOfCenarius',
            value: 132, // +132 spell damage
            maxStacks: 1 // Doesn't stack, just refreshes
        },
        color: '#7CFC00',
        icon: 'https://octowow.st/db/images/icons/large/inv_jewelry_ring_40.png',
        modifiesStats: (baseStats) => baseStats
    },
    // Incendosaur 3pc: 5% chance on successful melee attack (auto, Stormstrike, Lightning Strike, Windfury) to trigger a Spellstrike dealing 15-26 Fire damage.
    // Counts as a Spellstrike - triggers Wrath of Cenarius, Ornate Bloodstone Dagger, and other spell hit procs.
    // Activated via setBonuses.incendosaur_3pc_melee_fire_proc; execution is in shamanCombatSim.processIncendosaur3pc().
    {
        id: 'incendosaur_3pc',
        name: 'Incendosaur 3pc (Spellstrike)',
        fromSetBonus: true,
        procType: 'onMeleeHit',
        procChance: 5,
        damageMin: 15,
        damageMax: 26,
        damageSchool: 'fire',
        isSpellstrike: true, // Treated as spellstrike - triggers spell hit procs
        triggersWrathOfCenarius: true,
        triggersOrnateBloodstoneDagger: true
    },
    // Droplet of Nordrassil: +80 SP and +3% spell hit for 10s when spells are partially or fully resisted
    {
        id: 'droplet_of_nordrassil',
        name: "Nordrassil's Reprieve",
        itemName: 'Droplet of Nordrassil',
        itemId: 33294,
        internalCooldown: 4, // 4-sec ICD enforced by checkICD (uses internalCooldown, not cooldown)
        duration: 10,
        statModifiers: {},
        procType: 'onSpellResist',
        procChance: 100,
        effect: {
            type: 'statBuff',
            stats: { spellPower: 80, spellHit: 3 },
            cannotProcFrom: ['Arcane Missiles'], // Remains of Overwhelming Power pet missiles should not trigger this
        },
        color: '#00FF7F',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_healingtouch.png',
        modifiesStats: (baseStats) => baseStats
    },
    // Remains of Overwhelming Power: On-use (5 min CD, 60s duration)
    // Summons a Minor Arcane Elemental that casts Arcane Missiles (5 missiles per volley, 15s volley CD, 4 volleys total)
    // Each missile: 97-103 base arcane damage, 4% fixed crit (not inherited), affected by CoE/Nightfall, normal resist
    // While active: +55 spell power
    {
        id: 'remains_of_overwhelming_power',
        name: 'Arcane Missiles',
        itemName: 'Remains of Overwhelming Power',
        itemId: 55093,
        cooldown: 300,
        duration: 60,
        statModifiers: { spellPower: 55 },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'petSummon',
            modifier: 'remainsOfOverwhelmingPower',
            duration: 60,
            cooldown: 300,
            noGCD: true,
            spellPower: 55,
            pet: {
                abilityName: 'Arcane Missiles',
                abilityIcon: 'spell_nature_starfall',
                damageSchool: 'arcane',
                damageMin: 97,
                damageMax: 103,
                missilesPerVolley: 5,
                volleyCooldown: 15,
                totalVolleys: 4,
                critChance: 0.04,
                critMultiplier: 1.5,
                spCoefficient: 0,
                canResist: true
            }
        },
        color: '#9966CC',
        icon: 'https://octowow.st/db/images/icons/large/inv_enchant_dustsoul.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= DPS SIM TRINKETS/ITEMS =============
    {
        id: 'natural_alignment_crystal',
        name: 'Natural Alignment Crystal',
        itemName: 'Natural Alignment Crystal',
        itemId: 19344,
        cooldown: 300, // 5 minutes
        duration: 20, // 20 seconds
        statModifiers: {
            magicDamagePercent: 20 // +20% ALL magic damage (spells, totems, trinket procs, etc.)
        },
        procType: 'onUse',
        noGlobalCooldown: true,
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'onUseActivation',
            modifier: 'naturalAlignmentCrystal',
            duration: 20,
            cooldown: 300,
            noGCD: true,
            autoReactivate: true, // Automatically use when cooldown is ready
            damagePercent: 20 // +20% magic damage
        },
        color: '#00FF96',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_gem_03.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'badge_of_the_swarmguard',
        name: 'Badge of the Swarmguard',
        itemName: 'Badge of the Swarmguard',
        itemId: 21670,
        cooldown: 180, // 3 minutes
        duration: 30, // 30 seconds (or until 6 stacks consumed)
        statModifiers: {}, // Armor penetration is applied per-stack
        procType: 'onUse',
        noGlobalCooldown: true,
        // Once activated, melee/ranged hits add stacks of Insight (armor pen)
        // Each stack grants 200 armor penetration, max 6 stacks
        maxStacks: 6,
        armorPenPerStack: 200,
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        // Note: Badge has a complex behavior - onUse activates it, then melee hits add stacks
        // The stack-adding is handled via onMeleeHit trigger while buff is active
        effect: {
            type: 'armorPenStack',
            maxStacks: 6,
            armorPenPerStack: 200,
            // When activated via onUse, subsequent melee hits add stacks
            stackTrigger: 'onMeleeHit'
        },
        color: '#8B4513',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_ahnqirajtrinket_04.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'totem_of_stonebreaker',
        name: 'Totem of the Stonebreaker',
        itemName: 'Totem of the Stonebreaker',
        itemId: 61204,
        slot: 'ranged',
        cooldown: 0, // No ICD
        duration: 10, // 10 seconds
        statModifiers: {
            attackPower: 130 // +130 Attack Power
        },
        procType: 'onShockHit', // Triggers when shock spells hit
        procChance: 35, // 35% chance
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'statBuff',
            stats: { attackPower: 130 }
        },
        color: '#CD853F',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_stoneskintotem.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'totem_of_thundercall',
        name: 'Totem of Thundercall',
        itemName: 'Totem of Thundercall',
        itemId: 33089,
        slot: 'ranged',
        cooldown: 0,
        duration: 4,
        statModifiers: {},
        procType: 'onStormstrikeHit',
        // 70%: intentional override while in-game tooltip (35%) double-counts / feels bugged; revert to 35 when fixed
        procChance: 70,
        effect: {
            type: 'thundercallStormCloud',
            duration: 4,
            ticks: 4,
            tickInterval: 1,
            damagePerTick: 100,
            apCoefficientPerTick: 0.03,
            school: 'nature',
            canCrit: false,
            consumesStormstrikeCharge: false,
            // Matches dotSystem.processDotTick: rollForResistance(school, { isDot: true })
            resistanceProfile: 'dot',
            // No stat buff: procEngine should not schedule fake buff expiry / buffUptime rows
            skipScheduleExpiration: true,
            skipUptimeTracking: true
        },
        color: '#5CACEE',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_callstorm.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'totem_of_crackling_thunder',
        name: 'Totem of Crackling Thunder',
        itemName: 'Totem of Crackling Thunder',
        itemId: 61292,
        slot: 'ranged',
        cooldown: 0,
        duration: 8,
        statModifiers: {},
        procType: 'custom',
        effect: {
            type: 'cracklingThunder',
            duration: 8,
            hastePercent: 8,
            lbProcChance: 0.10,
            lsProcChance: 0.15
        },
        color: '#7DF9FF',
        icon: 'https://octowow.st/db/images/icons/large/inv_staff_07.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ===== ABILITY & TALENT BUFFS =====
    {
        id: 'stormstrike',
        name: 'Stormstrike',
        itemName: 'Stormstrike', // Ability-based, not item-based
        duration: 12, // 12 second debuff on target
        statModifiers: {
            natureDamageBonus: 20 // +20% nature damage taken by target
        },
        procType: 'onAbilityUse',
        color: '#0070DD',
        icon: 'https://octowow.st/db/images/icons/large/ability_shaman_stormstrike.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'bloodlust',
        name: 'Bloodlust',
        itemName: 'Bloodlust', // Ability-based
        cooldown: 360, // 6 minute cooldown
        duration: 30, // 30 seconds
        statModifiers: {
            hastePercent: 20 // +20% attack speed
        },
        procType: 'onUse',
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'onUseActivation',
            modifier: 'bloodlust',
            duration: 30,
            cooldown: 360,
            usesGCD: true, // Bloodlust uses GCD
            hastePercent: 20, // +20% attack speed
            requiresTalent: 'bloodlust' // Requires Bloodlust talent
        },
        color: '#FF4444',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_bloodlust.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'echoed_thunder',
        name: 'Echoed Thunder',
        itemName: 'Echoed Thunder', // Talent-based (Echo of the Elements)
        duration: 0, // Instant proc, no duration
        statModifiers: {},
        procType: 'onAutoAttack', // Triggers on auto attack when Lightning Strike is on CD
        procChance: 100, // Always triggers when conditions met
        color: '#FFA500',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_callstorm.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'stormwolf_frenzy',
        name: "Stormwolf's Frenzy",
        itemName: "Stormwolf's Frenzy", // Set bonus (Stormhowl 5pc)
        setId: 'stormhowl',
        setPieces: 5,
        duration: 12, // 12 seconds
        statModifiers: {
            hastePercent: 10, // +10% attack speed
            strengthPercent: 5 // +5% strength
        },
        procType: 'onAutoAttack', // Triggers on auto attack (10% chance)
        procChance: 10, // 10% chance
        color: '#4CAF50',
        icon: 'https://octowow.st/db/images/icons/large/ability_hunter_pet_wolf.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'towerforge_fury',
        name: 'Towerforge Fury',
        itemName: 'Towerforge Battlegear 4pc',
        setId: 'towerforge_battlegear',
        setPieces: 4,
        duration: 10,
        statModifiers: {
            str: 50
        },
        procType: 'onMeleeHit',
        procChance: 2,
        color: '#C0C0C0',
        icon: 'https://octowow.st/db/images/icons/large/inv_hammer_19.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'instant_lightning_bolt',
        name: 'Instant Lightning Bolt',
        itemName: 'The Ten Storms 4pc', // T2 4pc set bonus
        setId: 'ten_storms',
        setPieces: 4,
        duration: 0, // Instant cast, no duration
        statModifiers: {},
        procType: 'onLightningStrike', // Triggers when Lightning Strike hits
        procChance: 25, // 25% chance
        color: '#00CED1',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_lightning.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'nightfall',
        name: 'Nightfall',
        itemName: 'Nightfall', // External debuff from weapon proc (Spell Vulnerability)
        duration: 7, // 7 seconds (can refresh while active)
        statModifiers: {
            spellDamageBonus: 10 // +10% spell damage taken by target
        },
        procType: 'external', // Applied by another player
        uptimeRange: [35, 55], // Random uptime 35-55% based on proc rate and refreshes
        color: '#FF6B6B',
        icon: 'https://octowow.st/db/images/icons/large/spell_holy_elunesgrace.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'hemorrhage',
        name: 'Hemorrhage',
        itemName: 'Hemorrhage', // External debuff from rogue
        duration: 5, // ~3-6 seconds effective (charges consumed by physical attacks)
        statModifiers: {
            physicalDamagePercent: 2 // +2% base, +4% improved (handled by hemoImproved flag in sim)
        },
        procType: 'external', // Applied by another player
        uptimeRange: [40, 50], // Random uptime 40-50% - sporadic due to charge consumption
        color: '#DC143C',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_lifedrain.png',
        modifiesStats: (baseStats) => baseStats,
        // Improved version uses +4% instead of +2% (toggled via buff UI)
        hasImprovedVariant: true,
        improvedStatModifiers: {
            physicalDamagePercent: 4
        }
    },
    // ============= ORNATE BLOODSTONE DAGGER =============
    {
        id: 'ornate_bloodstone_dagger',
        name: 'Ornate Bloodstone Dagger',
        itemName: 'Ornate Bloodstone Dagger',
        itemId: 65004,
        slot: 'mainhand',
        cooldown: 0, // No cooldown (ICD handled separately)
        internalCooldown: 1, // 1 second ICD between procs
        duration: null, // Instant damage, no duration
        statModifiers: {}, // No stat modifiers, deals damage directly
        procType: 'onSpellHit', // Procs on spell hit: flametongue, spellstrike, shocks, lightning shield, lightning strike nature
        procChance: 20, // 20% chance when harmful spells land
        baseDamage: 250, // 250 base fire damage
        damageSchool: 'fire',
        spCoefficient: 0.4285, // 42.85% spell power coefficient
        canCrit: false, // Cannot crit
        canResist: false, // Cannot be resisted
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'damageProc',
            baseDamage: 250,
            damageSchool: 'fire',
            spCoefficient: 0.4285,
            canCrit: false,
            canResist: false,
            // Scales with: Elemental Fury, Elemental Weapons, fire debuffs
            applyMultipliers: ['elementalFury', 'elementalWeapons', 'improvedScorch', 'curseOfElements']
        },
        color: '#FF4500',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_lavaspawn.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= BLADE OF ETERNAL DARKNESS =============
    {
        id: 'blade_of_eternal_darkness',
        name: 'Blade of Eternal Darkness',
        itemName: 'Blade of Eternal Darkness',
        itemId: 17780,
        slot: 'mainhand',
        cooldown: 0, // No cooldown (ICD handled separately)
        internalCooldown: 0, // No ICD
        duration: null, // Instant damage, no duration
        statModifiers: {}, // No stat modifiers, deals damage directly
        procType: 'onSpellHit', // Procs on spell hit: same triggers as OBD
        procChance: 10, // 10% chance when harmful spells land
        baseDamage: 100, // 100 shadow damage
        manaReturn: 100, // Returns 100 mana
        damageSchool: 'shadow',
        spCoefficient: 0, // No spell power coefficient
        canCrit: false, // Cannot crit
        canResist: true, // Can be resisted (shadow damage)
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'damageProc',
            baseDamage: 100,
            damageSchool: 'shadow',
            spCoefficient: 0,
            canCrit: false,
            canResist: true,
            manaReturn: 100,
            // Scales with: EM, NAC, Nightfall
            applyMultipliers: ['elementalMastery', 'naturalAlignmentCrystal', 'nightfall']
        },
        color: '#9932CC',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_lifedrain02.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= SIGIL OF ANCIENT ACCORD =============
    {
        id: 'sigil_of_ancient_accord',
        name: 'Sigil of Ancient Accord',
        itemName: 'Sigil of Ancient Accord',
        itemId: 58244,
        slot: 'trinket',
        cooldown: 0,
        internalCooldown: 1, // 1 second ICD
        duration: null,
        statModifiers: {},
        procType: 'onDirectDamageSpellHit', // Lightning Bolt and shocks only
        procChance: 8, // 8% chance
        baseDamage: 400, // 100 AOE + 300 primary additional (single-target: primary takes both)
        damageSchool: 'arcane',
        spCoefficient: 0.22, // 15% primary + 7% AOE (both apply to primary in single-target)
        canCrit: true, // Uses player spell crit chance
        canResist: true,
        usesStandardCritMultiplier: true, // 150% crit damage
        effect: {
            type: 'damageProc',
            baseDamage: 400,
            damageSchool: 'arcane',
            spCoefficient: 0.22,
            canCrit: true,
            canResist: true,
            critMultiplier: 1.5,
            isAoe: true
        },
        color: '#ADD8E6',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_rune_03.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= SPELLPOWER GOGGLES XTREME PLUS+ (Engineering head) =============
    {
        id: 'spellpower_goggles_xtreme_plus_plus',
        name: 'Spellpower Surge (Goggles)',
        itemName: 'Spellpower Goggles Xtreme Plus+',
        itemId: 33095,
        slot: 'head',
        cooldown: 0,
        internalCooldown: 0,
        duration: 6,
        statModifiers: {},
        procType: 'onDirectDamageSpellHit',
        procChance: 8,
        effect: {
            type: 'statBuff',
            duration: 6,
            stats: { spellPower: 200 },
            spellCastSlowPercent: 10
        },
        color: '#B388FF',
        icon: 'https://octowow.st/db/images/icons/large/inv_helmet_47.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= BINDINGS OF CONTAINED MAGIC (wrist) =============
    {
        id: 'bindings_of_contained_magic',
        name: 'Contained Magic Surge',
        itemName: 'Bindings of Contained Magic',
        itemId: 55106,
        slot: 'wrist',
        cooldown: 0,
        internalCooldown: 18,
        duration: 6,
        statModifiers: {},
        procType: 'onSpellHit',
        procChance: 10,
        effect: {
            type: 'statBuff',
            duration: 6,
            stats: { spellPower: 100 }
        },
        color: '#A78BFA',
        icon: 'https://octowow.st/db/images/icons/large/inv_bracer_10.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= RING OF BURNING TALONS =============
    {
        id: 'ring_of_burning_talons',
        name: 'Ring of Burning Talons',
        itemName: 'Ring of Burning Talons',
        itemId: 33154,
        slot: 'ring',
        cooldown: 0,
        internalCooldown: 0,
        duration: null,
        statModifiers: {},
        procType: 'onDirectDamageSpellHit',
        procChance: 10, // 10% chance
        pureDot: true,              // No initial hit — all damage comes from DOT ticks
        dotDamage: 400,             // 80 dmg x 5 ticks
        dotDuration: 5,             // 5 seconds
        dotTickInterval: 1,         // 1 tick per second
        dotSpCoefficient: 0.04,     // 4% SP/fire power coefficient per tick (snapshot at application)
        damageSchool: 'fire',
        canCrit: false,             // DOTs cannot crit
        canResist: true,
        effect: {
            type: 'damageProc',
            damageSchool: 'fire',
            pureDot: true,
            dotDamage: 400,
            dotDuration: 5,
            dotTickInterval: 1,
            dotSpCoefficient: 0.04,
            canCrit: false,
            canResist: true,
            // Elemental Fury: damage bonus applies (not crit — canCrit: false handles that)
            // Elemental Weapons 30% fire bonus when Flametongue active: handled via selfBuffMult
            // Improved Scorch / Curse of Elements: handled via fireDamageMultiplier per tick
            // Elemental Mastery / NAC: handled via selfBuffMult in procEngine
        },
        color: '#FF4500',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_incinerate.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= LOOP OF UNCEASING FROST (Ring 55503) =============
    {
        id: 'loop_of_unceasing_frost',
        name: 'Freezing Cold',
        itemName: 'Loop of Unceasing Frost',
        itemId: 55503,
        slot: 'finger',
        cooldown: 0,
        internalCooldown: 0,
        duration: 10,
        statModifiers: {},
        procTypes: ['onMeleeHit', 'onSpellHit'],
        procChance: 10,
        effect: {
            type: 'targetFireDamageTakenDebuff',
            duration: 10,
            damageTakenMult: 1.05,
            procChanceByTrigger: {
                onMeleeHit: 4,
                onSpellHit: 10
            },
            requireMeleeHitSources: ['Auto Attack', 'Stormstrike', 'Lightning Strike (Physical)'],
            denySpellHitSubstrings: ['Flametongue', 'Spell Strike']
        },
        color: '#79BEF6',
        icon: 'https://octowow.st/db/images/icons/large/spell_frost_frostshock.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= DRAGONBREATH CHILI (Food Buff) =============
    {
        id: 'dragonbreath_chili',
        name: 'Dragonbreath Chili',
        itemName: 'Dragonbreath Chili',
        itemId: 12217,
        noFortune: true, // Food buff — Fortune is for equipped-item procs only (explicit opt-out; see buildSimContext procGetsFortune)
        consumable: true,
        cooldown: 0, // No cooldown
        internalCooldown: 0, // No ICD
        duration: null, // Instant damage, no duration
        statModifiers: {}, // No stat modifiers, deals damage directly
        procType: 'onMeleeHit', // Procs on successful melee hit (auto attack, Stormstrike, Lightning Strike, Windfury)
        procChance: 5, // 5% chance on melee hit
        baseDamageMin: 61, // 61-68 base fire damage
        baseDamageMax: 68,
        damageSchool: 'fire',
        spCoefficient: 0.33, // 33% spell power coefficient
        canCrit: true, // Can crit using spell crit
        canResist: true, // Fire damage can be resisted
        isAoe: true, // Cone attack: hits all targets in front of the shaman
        // Affected by: Imp Scorch, Curse of Elements, Flametongue Imbue (Ele Weapons), Elemental Fury 10% damage
        // NOT affected by: Elemental Fury crit bonus (uses standard 150% crit multiplier)
        // NOT affected by: Element's Grace crit bonus
        usesStandardCritMultiplier: true, // 150% crit (50% bonus), not Elemental Fury's 200%
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'damageProc',
            damageMin: 61,
            damageMax: 68,
            damageSchool: 'fire',
            spCoefficient: 0.33,
            canCrit: true,
            canResist: true,
            critMultiplier: 1.5, // Standard crit multiplier, not Elemental Fury's 2.0
            // Scales with: Elemental Fury damage, Elemental Weapons, fire debuffs, EM, NAC, Nightfall
            applyMultipliers: ['elementalFury', 'elementalWeapons', 'improvedScorch', 'curseOfElements', 'elementalMastery', 'naturalAlignmentCrystal', 'nightfall']
        },
        color: '#FF6347',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_incinerate.png',
        buffIcon: 'https://octowow.st/db/images/icons/large/inv_drink_17.png', // Item icon for buff tab
        modifiesStats: (baseStats) => baseStats
    },
    // ============= SULFURAS, HAND OF RAGNAROS =============
    {
        id: 'sulfuras_hand_of_ragnaros',
        name: 'Sulfuras',
        itemName: 'Sulfuras, Hand of Ragnaros',
        itemId: 17182,
        slot: 'mainhand',
        cooldown: 0,
        internalCooldown: 0,
        duration: 10, // DoT lasts 10 seconds - used for timeline tracking
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 18.5, // ~3 PPM at 3.70 speed, recalculated dynamically
        ppm: 3.0,
        baseDamageMin: 273,
        baseDamageMax: 334,
        damageSchool: 'fire',
        spCoefficient: 0,
        canCrit: true,
        canResist: false, // Sim: proc damage cannot be partially or fully spell-resisted
        usesStandardCritMultiplier: true, // 150% crit (no Elemental Fury crit bonus)
        triggersSpellHitProcs: true, // Fireball triggers onSpellHit procs (Wrath of Cenarius, Insomnius' Retribution, OBD, etc.)
        dotDamage: 75, // 75 fire damage over 10 sec
        dotDuration: 10,
        dotTickInterval: 2, // 5 ticks of 15 damage every 2 sec
        effect: {
            type: 'damageProc',
            damageMin: 273,
            damageMax: 334,
            damageSchool: 'fire',
            spCoefficient: 0,
            canCrit: true,
            canResist: false,
            critMultiplier: 1.5,
            dotDamage: 75,
            dotDuration: 10,
            dotTickInterval: 2,
            applyMultipliers: ['elementalFury', 'elementalWeapons', 'improvedScorch', 'curseOfElements', 'elementalMastery', 'naturalAlignmentCrystal', 'nightfall']
        },
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;
            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 3.70;
            return (baseWeaponSpeed * this.ppm) / 60 * 100;
        },
        color: '#FF4500',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_firebolt02.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= ELEMENTIUM REAPER (Decapitate) =============
    // Chance on hit: 550–750 physical, no AP/SP; armor + Hemorrhage; no glancing (rollDamage like Stormstrike).
    // Miss/dodge/parry use the same melee attack table as other non-auto physical (procPhysicalCanMiss true).
    // Tooltip execute vs low HP is modeled as ×1.25 for the last 30% of fight duration (fight time, not boss HP%).
    {
        id: 'elementium_reaper_decapitate',
        name: 'Elementium Reaper',
        itemName: 'Elementium Reaper',
        itemId: 33094,
        slot: 'mainhand',
        cooldown: 0,
        internalCooldown: 0,
        duration: null,
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 7.6, // ~1.2 PPM at 3.8 speed (display; recalculated via getProcChance)
        ppm: 1.2,
        baseDamageMin: 550,
        baseDamageMax: 750,
        damageSchool: 'physical',
        physicalMeleeProc: true,
        spCoefficient: 0,
        canCrit: true,
        canResist: false,
        procPhysicalCanMiss: true, // explicit: full melee avoidance (miss/dodge/parry), same caps as Stormstrike etc.
        effect: {
            type: 'damageProc',
            physicalMeleeProc: true,
            damageMin: 550,
            damageMax: 750,
            damageSchool: 'physical',
            spCoefficient: 0,
            canCrit: true,
            canResist: false,
            procPhysicalCanMiss: true,
            fightExecuteAfterPct: 0.7,
            fightExecuteDamageMult: 1.25
        },
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;
            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 3.8;
            return (baseWeaponSpeed * this.ppm) / 60 * 100;
        },
        color: '#A335EE',
        icon: 'https://octowow.st/db/images/icons/large/inv_axe_09.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= MISPLACED SERVO ARM =============
    {
        id: 'misplaced_servo_arm',
        name: 'Misplaced Servo Arm',
        itemName: 'Misplaced Servo Arm',
        itemId: 23221,
        slot: 'mainhand',
        cooldown: 0,
        internalCooldown: 0,
        duration: null,
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 11.2, // ~2.4 PPM at 2.80 speed, recalculated dynamically
        ppm: 2.4,
        baseDamageMin: 100,
        baseDamageMax: 151,
        damageSchool: 'nature',
        spCoefficient: 0,
        canCrit: true,
        canResist: true,
        usesStandardCritMultiplier: true, // 150% crit
        consumesStormstrike: true, // Benefits from and consumes Stormstrike charges
        effect: {
            type: 'damageProc',
            damageMin: 100,
            damageMax: 151,
            damageSchool: 'nature',
            spCoefficient: 0,
            canCrit: true,
            canResist: true,
            critMultiplier: 1.5,
            consumesStormstrike: true,
            applyMultipliers: ['elementalFury', 'stormstrike']
        },
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;
            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 2.80;
            return (baseWeaponSpeed * this.ppm) / 60 * 100;
        },
        color: '#00BFFF',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_lightning.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= FIST OF THE FORGOTTEN ORDER =============
    // Chance on hit: Holy damage (175–249 + 25% SP), spell crit; +50 Str for 15s (Kings / Ancestral Knowledge); 1.2 PPM.
    {
        id: 'fist_of_the_forgotten_order',
        name: 'Holy Smite',
        itemName: 'Fist of the Forgotten Order',
        itemId: 61277,
        slot: 'mainhand',
        cooldown: 0,
        internalCooldown: 0,
        duration: 15,
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 7.2, // ~1.2 PPM at 3.60 speed (display; recalculated via getProcChance)
        ppm: 1.2,
        effect: {
            type: 'damagePlusStatBuff',
            damage: {
                damageMin: 175,
                damageMax: 249,
                damageSchool: 'holy',
                spCoefficient: 0.25,
                canCrit: true,
                canResist: true,
                critMultiplier: 1.5,
                triggersSpellHitProcs: true
            },
            buff: {
                stats: { strength: 50 },
                convertsTo: { strength: { attackPower: 2 } },
                applyMultipliers: ['kings', 'ancestralKnowledge']
            }
        },
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;
            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 3.6;
            return (baseWeaponSpeed * this.ppm) / 60 * 100;
        },
        modifiesStats: (baseStats, characterData) => {
            const modifiedStats = { ...baseStats };
            if (modifiedStats.str) {
                let strMultiplier = 1.0;
                const activeBuffs = characterData?.activeBuffs || [];
                const hasKings = activeBuffs.some(buff =>
                    buff && (buff.id === 'blessing_of_kings' || buff.id === 'bok' || buff.name?.includes('Kings'))
                );
                if (hasKings) strMultiplier *= 1.1;
                const talentBonuses = characterData?.talentBonuses || {};
                if (talentBonuses.str_percent) {
                    strMultiplier *= (1 + talentBonuses.str_percent);
                }
                modifiedStats.str = Math.floor(modifiedStats.str * strMultiplier);
            }
            return modifiedStats;
        },
        color: '#FFE082',
        icon: 'https://octowow.st/db/images/icons/large/spell_holy_holysmite.png',
        buffIcon: 'https://octowow.st/db/images/icons/large/inv_mace_33.png'
    },
    // ============= DEATHBRINGER =============
    {
        id: 'deathbringer',
        name: 'Deathbringer',
        itemName: 'Deathbringer',
        itemId: 17068,
        slot: 'mainhand',
        cooldown: 0,
        internalCooldown: 0,
        duration: null,
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 8.7, // ~1.8 PPM at 2.90 speed, recalculated dynamically
        ppm: 1.8,
        baseDamageMin: 110,
        baseDamageMax: 141,
        damageSchool: 'shadow',
        spCoefficient: 0,
        canCrit: true,
        canResist: true,
        usesStandardCritMultiplier: true,
        effect: {
            type: 'damageProc',
            damageMin: 110,
            damageMax: 141,
            damageSchool: 'shadow',
            spCoefficient: 0,
            canCrit: true,
            canResist: true,
            critMultiplier: 1.5,
            applyMultipliers: []
        },
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;
            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 2.90;
            return (baseWeaponSpeed * this.ppm) / 60 * 100;
        },
        color: '#9370DB',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_shadowbolt.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= HAND OF EDWARD THE ODD =============
    {
        id: 'hand_of_edward_the_odd',
        name: 'Hand of Edward the Odd',
        itemName: 'Hand of Edward the Odd',
        itemId: 2243,
        slot: 'mainhand',
        cooldown: 0,
        internalCooldown: 0,
        duration: 4,
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 6.4,
        effect: {
            type: 'instantCastBuff',
            duration: 4,
            charges: 1
        },
        color: '#E0B0FF',
        icon: 'https://octowow.st/db/images/icons/large/inv_mace_14.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= NERETZEK, THE BLOOD DRINKER =============
    {
        id: 'neretzek_the_blood_drinker',
        name: 'Neretzek',
        itemName: 'Neretzek, The Blood Drinker',
        itemId: 21856,
        slot: 'mainhand',
        cooldown: 0,
        internalCooldown: 0,
        duration: null,
        statModifiers: {},
        procType: 'onMeleeHit',
        procChance: 8.6, // ~1.4 PPM at 3.70 speed, recalculated dynamically
        ppm: 1.4,
        baseDamageMin: 141,
        baseDamageMax: 164,
        damageSchool: 'shadow',
        spCoefficient: 1.0,
        canCrit: true,
        canResist: true,
        usesStandardCritMultiplier: true,
        effect: {
            type: 'damageProc',
            damageMin: 141,
            damageMax: 164,
            damageSchool: 'shadow',
            spCoefficient: 1.0,
            canCrit: true,
            canResist: true,
            critMultiplier: 1.5,
            applyMultipliers: []
        },
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;
            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 3.70;
            return (baseWeaponSpeed * this.ppm) / 60 * 100;
        },
        color: '#8B0000',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_lifedrain02.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= ELEMENTAL FOCUS (Talent) =============
    {
        id: 'elemental_focus',
        name: 'Elemental Focus',
        itemName: 'Elemental Focus', // Talent-based
        color: '#00CED1',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_manaburn.png',
        cooldown: 0, // No cooldown
        duration: 15, // 15 second max duration (expires if charges not consumed)
        maxCharges: 2, // 2 charges of clearcasting
        statModifiers: {
            manaCostReduction: 60 // 60% mana cost reduction
        },
        procType: 'onSpellCrit', // Procs when fire/frost/nature spell crits
        procChance: 100, // 100% chance on crit
        fromTalent: true,
        spellIds: [45541], // Spell ID for tooltip lookup
        // === DATA-DRIVEN EFFECT (v1.4.0) ===
        effect: {
            type: 'chargeBuff',
            charges: 2,
            duration: 15, // Max 15 second duration
            manaCostReduction: 60, // 60% mana cost reduction
            consumedBy: ['spell'] // Consumed by spell casts
        },
        // Get Elemental Focus talent rank (1 rank talent)
        getTalentRank: function(characterData) {
            if (characterData && characterData.talentBonuses) {
                return characterData.talentBonuses.elemental_focus || 0;
            }
            // Fallback: try to get from DOM
            try {
                let talentEl = document.getElementById('elemental-8');
                if (!talentEl) {
                    talentEl = document.querySelector('.talent-icon-container[data-tree="elemental"][data-talent-id="8"]');
                }
                if (talentEl) {
                    const points = parseInt(talentEl.dataset.points, 10) || 0;
                    return points > 0 ? 1 : 0;
                }
            } catch (e) {
                // DOM access failed
            }
            return 0;
        },
        getTalentStats: function(characterData) {
            const rank = this.getTalentRank(characterData);
            if (rank === 0) {
                return null; // Talent not learned
            }
            return {
                manaCostReduction: 60,
                maxCharges: 2
            };
        }
    },
    // ============= WEAPON IMBUES (v1.5.0) =============
    {
        id: 'flametongue_weapon',
        name: 'Flametongue Weapon',
        itemName: 'Flametongue Weapon',
        imbue: true, // Marks this as a weapon imbue
        procType: 'onMeleeHit', // Procs on every melee hit
        procChance: 100, // Always procs when imbue is active
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'imbueDamage',
            spell: 'flametongueWeapon', // Reference to shamanSpells.js
            triggersSpellHitProcs: true // Triggers Wrath of Cenarius, OBD, BoED, etc.
        },
        color: '#FF4500',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_flametounge.png'
    },
    {
        id: 'windfury_weapon',
        name: 'Windfury Weapon',
        itemName: 'Windfury Weapon',
        imbue: true, // Marks this as a weapon imbue
        procType: 'onMeleeHit', // Procs on melee hit
        procChance: 25, // 25% chance to proc
        // === DATA-DRIVEN EFFECT (v1.5.0) ===
        effect: {
            type: 'imbueExtraAttacks',
            count: 2, // 2 extra attacks
            apBonus: 323, // +323 attack power for WF attacks
            spell: 'windfuryAttack', // Reference to shamanSpells.js
            cannotProcSelf: true, // WF attacks cannot proc WF
            consumesFlurryCharges: false // WF attacks don't consume Flurry
        },
        color: '#87CEEB',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_cyclone.png'
    },
    {
        id: 'frostbrand_weapon',
        name: 'Frostbrand Weapon',
        itemName: 'Frostbrand Weapon',
        imbue: true,
        procType: 'onMeleeHit',
        // Display only; real chance = (baseWeaponSpeed × ppm) / 60 + talent frostbrand_proc_bonus (Elemental Weapons)
        procChance: 50,
        effect: {
            type: 'imbuePpmDamage',
            spell: 'frostbrandWeapon',
            ppm: 9,
            triggersSpellHitProcs: true
        },
        color: '#5BC0DE',
        icon: 'https://octowow.st/db/images/icons/large/spell_frost_frostbrand.png'
    },
    {
        id: 'hand_of_justice',
        name: 'Hand of Justice',
        itemName: 'Hand of Justice',
        itemId: 11815,
        procType: 'onMeleeHit',
        procChance: 2,
        effect: {
            type: 'extraMeleeAttack',
            cannotProcFrom: ['Windfury Attack', 'Hand of Justice']
        },
        color: '#C0C0C0',
        icon: 'https://octowow.st/db/images/icons/large/inv_jewelry_talisman_01.png'
    },
    {
        id: 'shieldrender_talisman',
        name: 'Shieldrender Talisman',
        itemName: 'Shieldrender Talisman',
        itemId: 55131,
        cooldown: 0,
        duration: 10,
        maxCharges: 4,
        statModifiers: { attackPower: 84 },
        procType: 'onMeleeHit',
        procChance: 6.25,
        ppm: 1.5,
        effect: {
            type: 'physicalArmorIgnoreChargeBuff',
            charges: 4,
            duration: 10,
            skipScheduleExpiration: true
        },
        getProcChance: function(characterData) {
            if (!characterData) return this.procChance;
            const baseWeaponSpeed = characterData.baseWeaponSpeed ?? characterData.weaponSpeed ?? 2.5;
            return (baseWeaponSpeed * this.ppm) / 60 * 100;
        },
        color: '#708090',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_stonetablet_02.png',
        modifiesStats: (baseStats) => baseStats
    },
    {
        id: 'jom_gabbar',
        name: 'Jom Gabbar',
        itemName: 'Jom Gabbar',
        itemId: 23570,
        cooldown: 120,
        duration: 20,
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'jomGabbar',
            cooldown: 120,
            noGCD: true
        },
        color: '#FFD700',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_enggizmos_19.png'
    },
    // ============= INSOMNIUS' RETRIBUTION (Chest 55102) =============
    {
        id: 'insomnius_retribution',
        name: "Insomnius' Retribution",
        itemName: "Insomnius' Retribution",
        itemId: 55102,
        slot: 'chest',
        procType: 'onSpellHit',
        procChance: 7,
        baseDamage: 100,
        damageSchool: 'nature',
        spCoefficient: 0.5,
        canCrit: true,
        canResist: true,
        internalCooldown: 0,
        effect: {
            type: 'damageProc',
            baseDamage: 100,
            damageSchool: 'nature',
            spCoefficient: 0.5,
            canCrit: true,
            canResist: true,
            // Benefits from Ele Fury and Stormstrike debuff without consuming SS (like Lightning Shield)
            stormstrikeBonusNoConsume: true,
            // Cannot proc from Spellstrike or Flametongue only; Sulfuras and other spell-like procs that fire fireSpellHitTriggers can trigger this
            cannotProcFrom: ['Flametongue Weapon'],
            cannotProcFromPatterns: ['Spell Strike (']
        },
        color: '#32CD32',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_earthshock.png'
    },
    // ============= JEWEL OF WILD MAGICS (Trinket 55087) =============
    {
        id: 'jewel_of_wild_magics',
        name: 'Jewel of Wild Magics',
        itemName: 'Jewel of Wild Magics',
        itemId: 55087,
        cooldown: 120,
        duration: 0,
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'jewelOfWildMagics',
            cooldown: 120,
            noGCD: true
        },
        color: '#9C27B0',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_astralrecal.png'
    },
    // ============= POTION OF QUICKNESS (Consumable 61181) =============
    {
        id: 'potion_of_quickness',
        name: 'Potion of Quickness',
        itemName: 'Potion of Quickness',
        itemId: 61181,
        consumable: true, // Not an equippable trinket; detected via activeBuffs toggle
        cooldown: 120,
        duration: 30,
        statModifiers: {
            haste: 5
        },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'onUseActivation',
            modifier: 'potionOfQuickness',
            duration: 30,
            cooldown: 120,
            noGCD: true,
            hastePercent: 5
        },
        color: '#00BFFF',
        icon: 'https://octowow.st/db/images/icons/large/inv_potion_08.png',
        modifiesStats: (baseStats) => baseStats
    },
    // ============= JUJU FLURRY (Consumable 12450) =============
    {
        id: 'juju_flurry',
        name: 'Juju Flurry',
        itemName: 'Juju Flurry',
        itemId: 12450,
        consumable: true, // Not an equippable trinket; detected via activeBuffs toggle
        cooldown: 60,
        duration: 20,
        statModifiers: {
            haste: 3
        },
        procType: 'onUse',
        noGlobalCooldown: true,
        effect: {
            type: 'onUseActivation',
            modifier: 'jujuFlurry',
            duration: 20,
            cooldown: 60,
            noGCD: true,
            hastePercent: 3
        },
        color: '#8B4513',
        icon: 'https://octowow.st/db/images/icons/large/inv_misc_monsterscales_17.png',
        modifiesStats: (baseStats) => baseStats
    }
];

/**
 * Find proc definitions for equipped items, active buffs, and talents
 * @param {Array} equippedItems - Array of equipped item objects
 * @param {Array} activeBuffs - Array of active buff objects (optional)
 * @param {Object} characterData - Character data including talentBonuses (optional)
 * @returns {Array} Array of proc definitions that match equipped items, active buffs, or talents
 */
export function findActiveProcs(equippedItems, activeBuffs = [], characterData = null) {
    const activeProcs = [];
    // Reverse match (proc name contains item name) is only safe for long strings — short
    // substrings of proc.itemName (e.g. "Hand", "Justice", "Talisman") false-match unrelated gear.
    const MIN_REVERSE_NAME_MATCH_LEN = 12;

    // Check equipped items for procs
    if (equippedItems && Array.isArray(equippedItems)) {
        for (const item of equippedItems) {
            if (!item) continue;

            // Match by item id even when name is missing (armory/minimal objects).
            const matchingProc = procDefinitions.find(proc => {
                const idMatch = proc.itemId != null && item.id != null && item.id !== '' &&
                    (Number(item.id) === Number(proc.itemId) || String(item.id) === String(proc.itemId));
                const nameMatch = item.name && (
                    item.name === proc.itemName ||
                    (proc.itemName && item.name.includes(proc.itemName)) ||
                    (proc.itemName && item.name.length >= MIN_REVERSE_NAME_MATCH_LEN &&
                        proc.itemName.includes(item.name))
                );
                return idMatch || !!nameMatch;
            });
            
            if (matchingProc) {
                activeProcs.push({
                    ...matchingProc,
                    sourceItem: item.name
                });
            }
        }
    }
    
    // Check active buffs for procs (e.g., Stoneshield Potion)
    if (activeBuffs && Array.isArray(activeBuffs)) {
        for (const buff of activeBuffs) {
            if (!buff || !buff.name) continue;
            
            // Check if this buff has a matching proc definition
            const matchingProc = procDefinitions.find(proc => 
                buff.name === proc.itemName ||
                buff.name === proc.name ||
                buff.id === proc.id ||
                (proc.itemName && proc.itemName.includes(buff.name)) ||
                (proc.itemName && buff.name.includes(proc.itemName))
            );
            
            if (matchingProc) {
                // Only add if not already added (avoid duplicates)
                const alreadyAdded = activeProcs.some(p => p.id === matchingProc.id);
                if (!alreadyAdded) {
                    activeProcs.push({
                        ...matchingProc,
                        sourceBuff: buff.name,
                        fromBuff: true // Flag to indicate this came from a buff, not an item
                    });
                }
            }
        }
    }
    
    // Check talent-based procs (e.g., Redoubt, Elemental Devastation, Flurry)
    // Also check for Lightning Shield if it's active
    for (const proc of procDefinitions) {
        // Skip if already added
        const alreadyAdded = activeProcs.some(p => p.id === proc.id);
        if (alreadyAdded) continue;

        // Special handling for Lightning Shield - check if player has Lightning Shield active
        if (proc.id === 'lightning_shield') {
            const hasLightningShield = activeBuffs.some(buff => {
                const buffName = buff.name || buff.id || '';
                return buffName.toLowerCase().includes('lightning shield');
            });

            if (hasLightningShield) {
                activeProcs.push({
                    ...proc,
                    fromSpell: true
                });
            }
            continue;
        }

        // Check if this is a talent-gated proc (has getTalentStats)
        // For chanceOnHit procs like Redoubt, we still need to check if talent is learned
        // For onUse procs like Holy Shield, we also need to check if talent is learned
        // For onSpellCrit/onMeleeCrit procs like Elemental Devastation/Flurry, we also check
        if (proc.getTalentStats) {
            const talentStats = proc.getTalentStats.call(proc, characterData);
            // If talent stats are null, talent is not learned - don't add proc
            if (talentStats === null || talentStats === undefined) {
                continue; // Talent not learned, skip this proc
            }

            // For chanceOnHit procs (Redoubt), we add it even if not active yet
            // It will be checked when hit occurs
            if (proc.procType === 'chanceOnHit') {
                activeProcs.push({
                    ...proc,
                    fromTalent: true // Flag to indicate this requires a talent
                });
            } else if (proc.procType === 'onUse') {
                // For onUse procs like Holy Shield, merge talent stats with base statModifiers
                const mergedStats = { ...proc.statModifiers, ...talentStats };
                activeProcs.push({
                    ...proc,
                    statModifiers: mergedStats,
                    fromTalent: true
                });
            } else if (proc.procType === 'onSpellCrit' || proc.procType === 'onMeleeCrit') {
                // For crit-based procs (Elemental Devastation, Flurry)
                const mergedStats = { ...proc.statModifiers, ...talentStats };
                activeProcs.push({
                    ...proc,
                    statModifiers: mergedStats,
                    fromTalent: true
                });
            } else if (proc.procType === 'talent') {
                // Legacy talent procs that are always active
                activeProcs.push({
                    ...proc,
                    statModifiers: { ...proc.statModifiers, ...talentStats },
                    fromTalent: true
                });
            }
        }
    }

    // Check for enchant-based procs (e.g., Crusader)
    if (characterData && characterData.selectedEnchants) {

        // Iterate through all equipped enchants
        for (const [slotId, enchant] of Object.entries(characterData.selectedEnchants)) {
            if (!enchant || !enchant.name) continue;

            // Check if this enchant has a matching proc definition
            const matchingProc = procDefinitions.find(proc =>
                (proc.enchantName && enchant.name === proc.enchantName) ||
                (proc.enchantId && enchant.effect_id === proc.enchantId)
            );

            if (matchingProc) {
                // Check if already added (avoid duplicates)
                const alreadyAdded = activeProcs.some(p => p.id === matchingProc.id);
                if (!alreadyAdded) {
                    activeProcs.push({
                        ...matchingProc,
                        sourceEnchant: enchant.name,
                        sourceSlot: slotId,
                        fromEnchant: true
                    });
                }
            }
        }
    }

    return activeProcs;
}

/**
 * Calculate when a proc should be activated during simulation
 * @param {Object} proc - Proc definition
 * @param {number} currentTime - Current simulation time
 * @param {number} simulationDuration - Total simulation duration
 * @param {Object} procState - Current state of this proc { lastUsed: number, isActive: boolean, expiresAt: number }
 * @returns {Object} { shouldActivate: boolean, activationTime: number }
 */
export function calculateProcActivation(proc, currentTime, simulationDuration, procState) {
    const { cooldown, duration, procType } = proc;
    
    // For onUse procs, use them optimally (use as soon as cooldown is ready)
    if (procType === 'onUse') {
        const timeSinceLastUse = currentTime - (procState.lastUsed || -cooldown);
        
        // If cooldown is ready and we have enough time left for the duration
        if (timeSinceLastUse >= cooldown) {
            const timeRemaining = simulationDuration - currentTime;
            if (timeRemaining >= duration) {
                return {
                    shouldActivate: true,
                    activationTime: currentTime
                };
            }
        }
    }
    
    // For chanceOnHit procs, activation is handled when damage is taken
    // (checked in the simulation when boss hits the player)
    
    return {
        shouldActivate: false,
        activationTime: null
    };
}

/**
 * Check if a chance-on-hit proc should trigger
 * @param {Object} proc - Proc definition
 * @returns {boolean} True if proc should trigger
 */
export function checkProcChance(proc) {
    if (proc.procType !== 'chanceOnHit') {
        return false;
    }
    
    const roll = Math.random() * 100;
    return roll < (proc.procChance || 0);
}

/**
 * Get stat modifiers from active procs at a given time
 * @param {Array} activeProcs - Array of active proc definitions
 * @param {number} currentTime - Current simulation time
 * @param {Object} procStates - Map of proc states { procId: { lastUsed, isActive, expiresAt } }
 * @param {Object} characterData - Character data for stat modification calculations
 * @returns {Object} Combined stat modifiers from all active procs
 */
export function getActiveProcStats(activeProcs, currentTime, procStates, characterData) {
    const combinedStats = {};
    
    for (const proc of activeProcs) {
        const procState = procStates[proc.id] || { isActive: false, expiresAt: 0 };
        
        // Check if proc is currently active
        // For Redoubt and Holy Shield, also check blocksRemaining
        let isActive = procState.isActive;
        if (proc.maxBlocks !== undefined) {
            // Procs with maxBlocks expire after maxBlocks OR time, whichever comes first
            isActive = procState.isActive && 
                      currentTime < procState.expiresAt && 
                      (procState.blocksRemaining === undefined || procState.blocksRemaining > 0);
        } else {
            isActive = procState.isActive && currentTime < procState.expiresAt;
        }
        
        if (isActive) {
            // For Redoubt (chanceOnHit), use the statModifiers stored in state when it procced
            // (includes talent-based block chance calculated at proc time)
            // For onUse procs like Holy Shield, use the proc's statModifiers directly
            let modifiedStats = procState.statModifiers;
            
            // If no stored modifiers (for onUse procs like Holy Shield, or fallback)
            if (!modifiedStats) {
                modifiedStats = proc.statModifiers || {};
                
                // Apply modifiers if proc has modifiesStats function (for multipliers, etc.)
                if (proc.modifiesStats) {
                    modifiedStats = proc.modifiesStats(proc.statModifiers || {}, characterData);
                }
            }
            
            // Combine stats (additive)
            for (const [stat, value] of Object.entries(modifiedStats)) {
                if (value !== undefined && value !== null) {
                    combinedStats[stat] = (combinedStats[stat] || 0) + value;
                }
            }
        }
    }
    
    return combinedStats;
}

/**
 * Update proc states for a time step
 * @param {Array} activeProcs - Array of active proc definitions
 * @param {number} currentTime - Current simulation time
 * @param {Object} procStates - Map of proc states to update
 * @param {Object} characterData - Character data for talent lookups
 * @returns {Object} Updated proc states
 */
export function updateProcStates(activeProcs, currentTime, procStates = {}, characterData = null) {
    const updatedStates = { ...procStates };

    for (const proc of activeProcs) {
        if (!updatedStates[proc.id]) {
            // Initialize proc state based on proc type
            const baseState = {
                lastUsed: -proc.cooldown, // Initialize so it can be used immediately
                isActive: false,
                expiresAt: 0
            };

            // Add special state for procs with maxBlocks (Redoubt, Holy Shield)
            if (proc.maxBlocks) {
                baseState.blocksRemaining = proc.maxBlocks;
            }

            // Add special state for Flurry (maxAttacks)
            if (proc.maxAttacks) {
                baseState.attacksRemaining = proc.maxAttacks;
            }

            // Add special state for Lightning Shield (charges and ICD)
            if (proc.id === 'lightning_shield') {
                const totalCharges = proc.getTotalCharges ? proc.getTotalCharges(characterData) : proc.charges;
                const totalICD = proc.getTotalICD ? proc.getTotalICD(characterData) : proc.internalCooldown;
                baseState.chargesRemaining = totalCharges;
                baseState.lastProcTime = -totalICD; // Initialize so it can proc immediately
                baseState.internalCooldown = totalICD;
            }

            updatedStates[proc.id] = baseState;
        }

        const state = updatedStates[proc.id];

        // Talent-based procs that are always active (procType === 'talent')
        const isTalentProc = proc.procType === 'talent' && proc.fromTalent === true;
        if (isTalentProc) {
            // Keep talent procs always active - they don't expire
            state.isActive = true;
            state.expiresAt = Number.MAX_SAFE_INTEGER;
            continue; // Skip expiration checks and activation logic for talent procs
        }

        // Check expiration based on proc type
        if (state.isActive) {
            let shouldExpire = false;

            // For Flurry (maxAttacks), check if attacks are depleted
            if (proc.maxAttacks && state.attacksRemaining !== undefined && state.attacksRemaining <= 0) {
                shouldExpire = true;
            }

            // For Redoubt/Holy Shield (maxBlocks), check if blocks are depleted or time expired
            if (proc.maxBlocks) {
                if (currentTime >= state.expiresAt || (state.blocksRemaining !== undefined && state.blocksRemaining <= 0)) {
                    shouldExpire = true;
                }
            }

            // For time-based procs (with duration), check if time expired
            if (proc.duration && currentTime >= state.expiresAt) {
                shouldExpire = true;
            }

            if (shouldExpire) {
                state.isActive = false;
            }
        }

        // For onUse procs, check if we should activate
        if (proc.procType === 'onUse') {
            const activation = calculateProcActivation(proc, currentTime, currentTime + 60, state);
            if (activation.shouldActivate) {
                state.lastUsed = activation.activationTime;
                state.isActive = true;
                state.expiresAt = activation.activationTime + proc.duration;

                // Reset blocks/attacks on activation
                if (proc.maxBlocks) {
                    state.blocksRemaining = proc.maxBlocks;
                }
            }
        }
    }

    return updatedStates;
}

/**
 * SimProcManager - Manages proc state and triggers for combat simulations
 * This is the main interface for the combat sim to interact with procs
 */
export class SimProcManager {
    constructor(sim) {
        this.sim = sim; // Reference to ShamanCombatSimulator
        this.procStates = new Map(); // Map of procId -> state
        this.activeProcs = []; // List of proc definitions active for this sim
    }

    /**
     * Initialize procs based on equipped items and stats
     * @param {Object} stats - Character stats object with item flags
     */
    initialize(stats) {
        this.procStates.clear();
        this.activeProcs = [];

        // Check for each proc-granting item
        for (const proc of procDefinitions) {
            let hasProc = false;

            // Check by item flag on stats object
            if (proc.id === 'natural_alignment_crystal' && stats.hasNaturalAlignmentCrystal) {
                hasProc = true;
            } else if (proc.id === 'badge_of_the_swarmguard' && stats.hasBadgeOfTheSwarmguard) {
                hasProc = true;
            } else if (proc.id === 'totem_of_stonebreaker' && stats.totemOfStonebreaker) {
                hasProc = true;
            } else if (proc.id === 'kiss_of_the_spider' && stats.hasKissOfTheSpider) {
                hasProc = true;
            } else if (proc.id === 'shard_of_the_fallen_star' && stats.hasShardOfTheFallenStar) {
                hasProc = true;
            } else if (proc.id === 'eye_of_diminution' && stats.hasEyeOfDiminution) {
                hasProc = true;
            } else if (proc.id === 'crusader' && stats.hasCrusader) {
                hasProc = true;
            } else if (proc.id === 'wrath_of_cenarius' && stats.hasWrathOfCenarius) {
                hasProc = true;
            } else if (proc.id === 'zandalarian_hero_charm' && stats.hasZandalarianHeroCharm) {
                hasProc = true;
            } else if (proc.id === 'vial_of_potent_venoms' && stats.hasVialOfPotentVenoms) {
                hasProc = true;
            } else if (proc.id === 'hand_of_edward_the_odd' && stats.hasHandOfEdwardTheOdd) {
                hasProc = true;
            }

            if (hasProc) {
                this.activeProcs.push(proc);
                this.procStates.set(proc.id, this.createInitialState(proc));
            }
        }
    }

    /**
     * Create initial state for a proc
     */
    createInitialState(proc) {
        const state = {
            isActive: false,
            expiresAt: 0,
            lastUsed: -proc.cooldown, // Can be used immediately
            procs: 0,
            uptime: 0
        };

        // Badge of the Swarmguard specific state
        if (proc.id === 'badge_of_the_swarmguard') {
            state.stacks = 0;
            state.maxStacks = proc.maxStacks || 6;
            state.armorPen = 0;
        }

        return state;
    }

    /**
     * Get a proc definition by ID
     */
    getProc(procId) {
        return this.activeProcs.find(p => p.id === procId);
    }

    /**
     * Get proc state by ID
     */
    getState(procId) {
        return this.procStates.get(procId);
    }

    /**
     * Check if a proc is currently active
     */
    isActive(procId) {
        const state = this.procStates.get(procId);
        return state && state.isActive && state.expiresAt > this.sim.currentTime;
    }

    /**
     * Check if a proc is off cooldown
     */
    isOffCooldown(procId) {
        const proc = this.getProc(procId);
        const state = this.getState(procId);
        if (!proc || !state) return false;
        return this.sim.currentTime >= state.lastUsed + proc.cooldown;
    }

    /**
     * Activate an onUse proc
     */
    activateOnUse(procId) {
        const proc = this.getProc(procId);
        const state = this.getState(procId);
        if (!proc || !state) return false;
        if (!this.isOffCooldown(procId)) return false;

        state.isActive = true;
        state.lastUsed = this.sim.currentTime;
        state.expiresAt = this.sim.currentTime + proc.duration;
        state.procs++;

        // Apply stat modifiers
        this.applyStatModifiers(proc);

        return true;
    }

    /**
     * Try to trigger a chance-based proc
     * @param {string} procId - ID of the proc
     * @param {string} triggerType - Type of trigger (onMeleeHit, onSpellHit, onShockHit)
     * @returns {boolean} Whether the proc triggered
     */
    tryTrigger(procId, triggerType) {
        const proc = this.getProc(procId);
        const state = this.getState(procId);
        if (!proc || !state) return false;

        // Check if proc type matches trigger type
        if (proc.procType !== triggerType) return false;

        // Check cooldown/ICD
        if (proc.cooldown > 0 && this.sim.currentTime < state.lastUsed + proc.cooldown) {
            return false;
        }

        // Roll for proc
        const roll = this.sim.rng.random() * 100;
        if (roll >= proc.procChance) return false;

        // Proc triggered!
        state.isActive = true;
        state.lastUsed = this.sim.currentTime;
        state.expiresAt = this.sim.currentTime + proc.duration;
        state.procs++;

        // Apply stat modifiers
        this.applyStatModifiers(proc);

        return true;
    }

    /**
     * Apply stat modifiers from a proc
     */
    applyStatModifiers(proc) {
        if (!proc.statModifiers) return;

        for (const [stat, value] of Object.entries(proc.statModifiers)) {
            if (value && this.sim.stats[stat] !== undefined) {
                this.sim.stats[stat] += value;
            }
        }
    }

    /**
     * Remove stat modifiers from a proc
     */
    removeStatModifiers(proc) {
        if (!proc.statModifiers) return;

        for (const [stat, value] of Object.entries(proc.statModifiers)) {
            if (value && this.sim.stats[stat] !== undefined) {
                this.sim.stats[stat] -= value;
            }
        }
    }

    /**
     * Update all proc states (check expirations, etc.)
     */
    update() {
        for (const [procId, state] of this.procStates) {
            if (state.isActive && this.sim.currentTime >= state.expiresAt) {
                const proc = this.getProc(procId);
                if (proc) {
                    // Remove stat modifiers
                    this.removeStatModifiers(proc);
                }
                state.isActive = false;
            }
        }
    }

    /**
     * Get total uptime for a proc (as percentage of fight duration)
     */
    getUptime(procId) {
        const state = this.getState(procId);
        if (!state) return 0;
        return state.uptime / this.sim.fightDuration;
    }
}

/**
 * Get proc definition by ID
 */
export function getProcById(procId) {
    return procDefinitions.find(p => p.id === procId);
}

/**
 * Get proc definition by item ID
 */
export function getProcByItemId(itemId) {
    if (itemId == null || itemId === '') return undefined;
    const n = Number(itemId);
    const s = String(itemId);
    return procDefinitions.find(p =>
        p.itemId != null && (Number(p.itemId) === n || String(p.itemId) === s)
    );
}

const _modeledItemIds = new Set();
for (const p of procDefinitions) {
    if (p.itemId == null) continue;
    _modeledItemIds.add(p.itemId);
    _modeledItemIds.add(Number(p.itemId));
    _modeledItemIds.add(String(p.itemId));
}
const _modeledItemNames = new Set(
    procDefinitions.filter(p => p.itemId).map(p => p.itemName)
);

/**
 * Get all on-use trinket/consumable proc definitions (items that can appear in opener/priority).
 * Excludes talent-based abilities (Elemental Mastery, Bloodlust) and non-item procs.
 */
export function getOnUseTrinketProcs() {
    return procDefinitions.filter(p => p.procType === 'onUse' && p.itemId && !p.fromTalent);
}

/**
 * Convert a snake_case proc ID to a camelCase key (e.g., 'kiss_of_the_spider' → 'kissOfTheSpider').
 */
export function procIdToCamelCase(id) {
    return id.split('_').map((w, i) => i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

export function isItemProcModeled(item) {
    if (!item) return false;
    if (item.id != null && item.id !== '' && _modeledItemIds.has(item.id)) return true;
    if (item.id != null && item.id !== '' && _modeledItemIds.has(String(item.id))) return true;
    if (item.id != null && item.id !== '' && _modeledItemIds.has(Number(item.id))) return true;
    if (item.name && _modeledItemNames.has(item.name)) return true;
    return !!getProcByItemId(item.id);
}
