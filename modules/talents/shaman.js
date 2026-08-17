// Shaman talents for Turtle WoW
export const shamanTalents = {
    elemental: {
        name: "Elemental",
        icon: "spell_nature_lightning",
        talents: [
            {
                id: 1,
                name: "Convection",
                icon: "spell_nature_wispsplode",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Reduces the mana cost of your offensive Fire, Frost, and Nature spells by ",
                
                fullDescription: "Reduces the mana cost of your offensive Fire, Frost, and Nature spells by 2%.",
                
                spellIds: [
                    16039,
                    16109,
                    16110,
                    16111,
                    16112
                ],
                rankDescriptions: [
                    "Reduces the mana cost of your offensive Fire, Frost, and Nature spells by 2%.",
                    "Reduces the mana cost of your offensive Fire, Frost, and Nature spells by 4%.",
                    "Reduces the mana cost of your offensive Fire, Frost, and Nature spells by 6%.",
                    "Reduces the mana cost of your offensive Fire, Frost, and Nature spells by 8%.",
                    "Reduces the mana cost of your offensive Fire, Frost, and Nature spells by 10%."
                ]
            },
            {
                id: 2,
                name: "Concussion",
                icon: "spell_fire_fireball",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Increases the damage done by your Fire, Frost, and Nature spells by ",
                
                fullDescription: "Increases the damage done by your Fire, Frost, and Nature spells by 1%.",
                
                spellIds: [
                    16035,
                    16105,
                    16106,
                    16107,
                    16108
                ],
                rankDescriptions: [
                    "Increases the damage done by your Fire, Frost, and Nature spells by 1%.",
                    "Increases the damage done by your Fire, Frost, and Nature spells by 2%.",
                    "Increases the damage done by your Fire, Frost, and Nature spells by 3%.",
                    "Increases the damage done by your Fire, Frost, and Nature spells by 4%.",
                    "Increases the damage done by your Fire, Frost, and Nature spells by 5%."
                ]
            },
            {
                id: 4,
                name: "Earth's Grasp",
                icon: "spell_nature_stoneclawtotem",
                ranks: 2,
                row: 2,
                col: 1,
                description: "Increases the health of your Stoneclaw Totem by ",
                
                fullDescription: "Increases the health of your Stoneclaw Totem by 25% and the radius of your Earthbind Totem by 10%.",
                
                spellIds: [
                    16043,
                    16130
                ],
                rankDescriptions: [
                    "Increases the health of your Stoneclaw Totem by 25% and the radius of your Earthbind Totem by 10%.",
                    "Increases the health of your Stoneclaw Totem by 50% and the radius of your Earthbind Totem by 20%."
                ]
            },
            {
                id: 5,
                name: "Elemental Warding",
                icon: "spell_nature_elementalabsorption",
                ranks: 3,
                row: 2,
                col: 2,
                description: "Reduces damage taken from Fire, Frost and Nature effects by ",
                
                fullDescription: "Reduces damage taken from Fire, Frost and Nature effects by 4%.",
                
                spellIds: [
                    28996,
                    28997,
                    28998
                ],
                rankDescriptions: [
                    "Reduces damage taken from Fire, Frost and Nature effects by 4%.",
                    "Reduces damage taken from Fire, Frost and Nature effects by 7%.",
                    "Reduces damage taken from Fire, Frost and Nature effects by 10%."
                ]
            },
            {
                id: 6,
                name: "Elemental Devastation",
                icon: "spell_fire_elementaldevastation",
                ranks: 3,
                row: 2,
                col: 3,
                description: "Increases your chance to hit with spells and melee attacks by ",
                
                fullDescription: "Increases your chance to hit with spells and melee attacks by 1% and your melee critical strikes increase your chance to hit with spells by additional 3% for 10 sec.",
                
                spellIds: [
                    30160,
                    29179,
                    29180
                ],
                rankDescriptions: [
                    "Increases your chance to hit with spells and melee attacks by 1% and your melee critical strikes increase your chance to hit with spells by additional 3% for 10 sec.",
                    "Increases your chance to hit with spells and melee attacks by 2% and your melee critical strikes increase your chance to hit with spells by additional 6% for 10 sec.",
                    "Increases your chance to hit with spells and melee attacks by 3% and your melee critical strikes increase your chance to hit with spells by additional 9% for 10 sec."
                ]
            },
            {
                id: 8,
                name: "Elemental Focus",
                icon: "spell_shadow_manaburn",
                ranks: 1,
                row: 3,
                col: 1,
                description: "After landing a critical strike with a Fire, Frost, or Nature damage spell, you enter a Clearcasting state. The Clearcasting state reduces the mana cost of your next two damage spells or abilities by 60%.",
                
                fullDescription: "After landing a critical strike with a Fire, Frost, or Nature damage spell, you enter a Clearcasting state. The Clearcasting state reduces the mana cost of your next two damage spells or abilities by 60%.",
                
                spellIds: [
                    45541
                ],
                rankDescriptions: [
                    "After landing a critical strike with a Fire, Frost, or Nature damage spell, you enter a Clearcasting state. The Clearcasting state reduces the mana cost of your next two damage spells or abilities by 60%."
                ]
            },
            {
                id: 9,
                name: "Reverberation",
                icon: "spell_frost_frostward",
                ranks: 3,
                row: 3,
                col: 2,
                description: "Reduces the cooldown of your Shock spells by ",
                
                fullDescription: "Reduces the cooldown of your Shock spells by 0.333 sec.",
                
                spellIds: [
                    16040,
                    16113,
                    16114
                ],
                rankDescriptions: [
                    "Reduces the cooldown of your Shock spells by 0.333 sec.",
                    "Reduces the cooldown of your Shock spells by 0.667 sec.",
                    "Reduces the cooldown of your Shock spells by 1.0 sec."
                ]
            },
            {
                id: 10,
                name: "Call of Thunder",
                icon: "spell_nature_callstorm",
                ranks: 5,
                row: 3,
                col: 3,
                description: "Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional ",
                
                fullDescription: "Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional 1%.",
                
                spellIds: [
                    16041,
                    16117,
                    16118,
                    16119,
                    16120
                ],
                rankDescriptions: [
                    "Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional 1%.",
                    "Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional 2%.",
                    "Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional 3%.",
                    "Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional 4%.",
                    "Increases the critical strike chance of your Lightning Bolt and Chain Lightning spells by an additional 6%."
                ]
            },
            {
                id: 11,
                name: "Improved Molten Blast",
                icon: "spell_fire_meteorstorm",
                ranks: 2,
                row: 3,
                col: 4,
                description: "Refreshing Flame Shock with Molten Blast deals damage equal to ",
                
                fullDescription: "Refreshing Flame Shock with Molten Blast deals damage equal to 30% of the refreshed duration.",
                
                spellIds: [
                    46107,
                    46108
                ],
                rankDescriptions: [
                    "Refreshing Flame Shock with Molten Blast deals damage equal to 30% of the refreshed duration.",
                    "Refreshing Flame Shock with Molten Blast deals damage equal to 60% of the refreshed duration."
                ]
            },
            {
                id: 12,
                name: "Improved Fire Totems",
                icon: "spell_fire_sealoffire",
                ranks: 2,
                row: 4,
                col: 1,
                description: "Reduces the delay before your Fire Nova Totem activates by ",
                
                fullDescription: "Reduces the delay before your Fire Nova Totem activates by 1000 sec, decreases the threat generated by your Magma Totem by 25%, and increases your Searing Totem's attack speed by 10% and its attack range by 5 yards.",
                
                spellIds: [
                    16086,
                    16544
                ],
                rankDescriptions: [
                    "Reduces the delay before your Fire Nova Totem activates by 1000 sec, decreases the threat generated by your Magma Totem by 25%, and increases your Searing Totem's attack speed by 10% and its attack range by 5 yards.",
                    "Reduces the delay before your Fire Nova Totem activates by 2000 sec, decreases the threat generated by your Magma Totem by 50%, and increases your Searing Totem's attack speed by 20% and its attack range by 10 yards."
                ]
            },
            {
                id: 13,
                name: "Call of Earth",
                icon: "earthshaker_slam_16",
                ranks: 2,
                row: 4,
                col: 2,
                description: "Increases the maximum charges of Earth Shield by ",
                
                fullDescription: "Increases the maximum charges of Earth Shield by 2, while it is active your damaging spells replenish one charge and it increases your chance to avoid interruption caused by damage while casting any damaging spells by an additional 25%.",
                
                spellIds: [
                    58238,
                    58239
                ],
                rankDescriptions: [
                    "Increases the maximum charges of Earth Shield by 2, while it is active your damaging spells replenish one charge and it increases your chance to avoid interruption caused by damage while casting any damaging spells by an additional 25%.",
                    "Increases the maximum charges of Earth Shield by 4, while it is active your damaging spells replenish one charge and it increases your chance to avoid interruption caused by damage while casting any damaging spells by an additional 50%."
                ]
            },
            {
                id: 15,
                name: "Call of Flame",
                icon: "spell_fire_immolation",
                ranks: 3,
                row: 4,
                col: 4,
                description: "Increases the damage done by your Fire Totems and Fire spells by ",
                
                fullDescription: "Increases the damage done by your Fire Totems and Fire spells by 5%, and the range of your Flame Shock by 3 yards.",
                
                spellIds: [
                    16038,
                    16160,
                    16161
                ],
                rankDescriptions: [
                    "Increases the damage done by your Fire Totems and Fire spells by 5%, and the range of your Flame Shock by 3 yards.",
                    "Increases the damage done by your Fire Totems and Fire spells by 10%, and the range of your Flame Shock by 6 yards.",
                    "Increases the damage done by your Fire Totems and Fire spells by 15%, and the range of your Flame Shock by 10 yards."
                ]
            },
            {
                id: 16,
                name: "Storm Reach",
                icon: "spell_nature_stormreach",
                ranks: 2,
                row: 5,
                col: 1,
                description: "Increases the range of your Lightning Bolt and Chain Lightning spells by ",
                
                fullDescription: "Increases the range of your Lightning Bolt and Chain Lightning spells by 3 yards.",
                
                spellIds: [
                    28999,
                    29000
                ],
                rankDescriptions: [
                    "Increases the range of your Lightning Bolt and Chain Lightning spells by 3 yards.",
                    "Increases the range of your Lightning Bolt and Chain Lightning spells by 6 yards."
                ]
            },
            {
                id: 17,
                name: "Elemental Mastery",
                icon: "spell_nature_wispheal",
                ranks: 1,
                row: 5,
                col: 2,
                description: "When activated, your next Fire, Frost, or Nature damage spell with a base casting time less than 10 sec becomes an instant cast spell. If that spell is a damaging spell, the damage it deals is reduced by ",
                
                fullDescription: "Increases your Fire, Frost, and Nature damage by 15% and reduces the mana cost of your offensive spells by 20% for 10 sec.",
                
                spellIds: [
                    16166
                ],
                rankDescriptions: [
                    "Increases your Fire, Frost, and Nature damage by 15% and reduces the mana cost of your offensive spells by 20% for 10 sec."
                ]
            },
            {
                id: 19,
                name: "Elemental Fury",
                icon: "spell_fire_volcano",
                ranks: 2,
                row: 5,
                col: 4,
                description: "Increases the damage done by your Fire and Nature spells by ",
                
                fullDescription: "Increases the damage done by your Fire and Nature spells by 5% and increases the critical strike damage bonus of your Searing, Magma, and Fire Nova Totems and your Fire, Frost, and Nature spells by 50%.",
                
                spellIds: [
                    56556,
                    56557
                ],
                rankDescriptions: [
                    "Increases the damage done by your Fire and Nature spells by 5% and increases the critical strike damage bonus of your Searing, Magma, and Fire Nova Totems and your Fire, Frost, and Nature spells by 50%.",
                    "Increases the damage done by your Fire and Nature spells by 10% and increases the critical strike damage bonus of your Searing, Magma, and Fire Nova Totems and your Fire, Frost, and Nature spells by 100%."
                ]
            },
            {
                id: 22,
                name: "Lightning Mastery",
                icon: "spell_lightning_lightningbolt01",
                ranks: 5,
                row: 6,
                col: 3,
                requires: 10,
                description: "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by ",
                
                fullDescription: "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.2 sec.",
                
                spellIds: [
                    16578,
                    16579,
                    16580,
                    16581,
                    16582
                ],
                rankDescriptions: [
                    "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.2 sec.",
                    "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.4 sec.",
                    "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.6 sec.",
                    "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 0.8 sec.",
                    "Reduces the cast time of your Lightning Bolt and Chain Lightning spells by 1.0 sec."
                ]
            },
            {
                id: 25,
                name: "Earthquake",
                icon: "spell_nature_earthquake",
                ranks: 1,
                row: 7,
                col: 2,
                requires: 17,
                description: "Breaks the earth beneath the target, dealing Nature damage to the target and an additional 35% of that damage as Nature damage to other enemies within 10 yards. Creates a patch of broken earth that slows enemies inside it by 15%. After 4 sec, the broken earth erupts in an aftershock, dealing Nature damage equal to 30% of the initial damage to all enemies within the area.\\r\\nRequires Elemental Mastery",
                
                fullDescription: "Breaks the earth beneath the target, dealing 587 to 634 Nature damage to the target and an additional 35% of that damage as Nature damage to other enemies within 10 yards. Creates a patch of broken earth that slows enemies inside it by 15%. After 4 sec, the broken earth erupts in an aftershock, dealing Nature damage equal to 30% of the initial damage to all enemies within the area.",
                
                spellIds: [
                    48306
                ],
                rankDescriptions: [
                    "Breaks the earth beneath the target, dealing 587 to 634 Nature damage to the target and an additional 35% of that damage as Nature damage to other enemies within 10 yards. Creates a patch of broken earth that slows enemies inside it by 15%. After 4 sec, the broken earth erupts in an aftershock, dealing Nature damage equal to 30% of the initial damage to all enemies within the area."
                ]
            }
        ],
    },
    enhancement: {
        name: "Enhancement",
        icon: "spell_nature_lightningshield",
        talents: [
            {
                id: 1,
                name: "Ancestral Knowledge",
                icon: "spell_shadow_grimward",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Increases the total value of all your stats by ",
                
                fullDescription: "Increases the total value of all your stats by 1%.",
                
                spellIds: [
                    17485,
                    17486,
                    17487,
                    17488,
                    17489
                ],
                rankDescriptions: [
                    "Increases the total value of all your stats by 1%.",
                    "Increases the total value of all your stats by 2%.",
                    "Increases the total value of all your stats by 3%.",
                    "Increases the total value of all your stats by 4%.",
                    "Increases the total value of all your stats by 5%."
                ]
            },
            {
                id: 2,
                name: "Shield Specialization",
                icon: "inv_shield_06",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Increases your chance to block attacks with a shield by ",
                
                fullDescription: "Increases your chance to block attacks with a shield by 1% and increases the amount blocked by 6%.",
                
                spellIds: [
                    16253,
                    16298,
                    16299,
                    16300,
                    16301
                ],
                rankDescriptions: [
                    "Increases your chance to block attacks with a shield by 1% and increases the amount blocked by 6%.",
                    "Increases your chance to block attacks with a shield by 2% and increases the amount blocked by 12%.",
                    "Increases your chance to block attacks with a shield by 3% and increases the amount blocked by 18%.",
                    "Increases your chance to block attacks with a shield by 4% and increases the amount blocked by 24%.",
                    "Increases your chance to block attacks with a shield by 5% and increases the amount blocked by 30%."
                ]
            },
            {
                id: 4,
                name: "Totemic Alignment",
                icon: "spell_nature_agitatingtotem",
                ranks: 2,
                row: 2,
                col: 1,
                description: "Improves your chance to get a critical strike with your weapon attacks by ",
                
                fullDescription: "45% of the threat generated by your totems is transferred to you.",
                
                spellIds: [
                    51381,
                    51382
                ],
                rankDescriptions: [
                    "45% of the threat generated by your totems is transferred to you.",
                    "90% of the threat generated by your totems is transferred to you."
                ]
            },
            {
                id: 5,
                name: "Thundering Strikes",
                icon: "ability_thunderbolt",
                ranks: 5,
                row: 2,
                col: 2,
                description: "Improves your chance to get a critical strike with your weapon attacks by ",
                
                fullDescription: "Improves your chance to get a critical strike with your weapon attacks by 1%.",
                
                spellIds: [
                    16255,
                    16302,
                    16303,
                    16304,
                    16305
                ],
                rankDescriptions: [
                    "Improves your chance to get a critical strike with your weapon attacks by 1%.",
                    "Improves your chance to get a critical strike with your weapon attacks by 2%.",
                    "Improves your chance to get a critical strike with your weapon attacks by 3%.",
                    "Improves your chance to get a critical strike with your weapon attacks by 4%.",
                    "Improves your chance to get a critical strike with your weapon attacks by 5%."
                ]
            },
            {
                id: 6,
                name: "Stable Shields",
                icon: "spell_nature_lightningshield",
                ranks: 3,
                row: 2,
                col: 3,
                description: "Increases the number of charges of your shield spells by ",
                
                fullDescription: "Increases the number of charges of your shield spells by 2, but increases the cooldown between activations by 1 sec.",
                
                spellIds: [
                    16261,
                    16290,
                    16291
                ],
                rankDescriptions: [
                    "Increases the number of charges of your shield spells by 2, but increases the cooldown between activations by 1 sec.",
                    "Increases the number of charges of your shield spells by 4, but increases the cooldown between activations by 1 sec.",
                    "Increases the number of charges of your shield spells by 6, but increases the cooldown between activations by 1 sec."
                ]
            },
            {
                id: 7,
                name: "Improved Ghost Wolf",
                icon: "spell_nature_spiritwolf",
                ranks: 2,
                row: 2,
                col: 4,
                description: "Reduces the cast time of your Ghost Wolf spell by ",
                
                fullDescription: "Reduces the cast time of your Ghost Wolf spell by 1000 sec.",
                
                spellIds: [
                    16262,
                    16287
                ],
                rankDescriptions: [
                    "Reduces the cast time of your Ghost Wolf spell by 1000 sec.",
                    "Reduces the cast time of your Ghost Wolf spell by 2000 sec."
                ]
            },
            {
                id: 8,
                name: "Calming Winds",
                icon: "spell_nature_tranquility",
                ranks: 3,
                row: 3,
                col: 1,
                description: "Reduces threat generated by your physical attacks, weapon imbue effects, and your Lightning Strike and Stormstrike abilities by ",
                
                fullDescription: "Reduces threat generated by your physical attacks, weapon imbue effects, and your Lightning Strike and Stormstrike abilities by 8%. This effect does not apply while Rockbiter Weapon is active.",
                
                spellIds: [
                    51383,
                    51384,
                    51385
                ],
                rankDescriptions: [
                    "Reduces threat generated by your physical attacks, weapon imbue effects, and your Lightning Strike and Stormstrike abilities by 8%. This effect does not apply while Rockbiter Weapon is active.",
                    "Reduces threat generated by your physical attacks, weapon imbue effects, and your Lightning Strike and Stormstrike abilities by 16%. This effect does not apply while Rockbiter Weapon is active.",
                    "Reduces threat generated by your physical attacks, weapon imbue effects, and your Lightning Strike and Stormstrike abilities by 25%. This effect does not apply while Rockbiter Weapon is active."
                ]
            },
            {
                id: 10,
                name: "Lightning Strike",
                icon: "spell_nature_thunderclap",
                ranks: 1,
                row: 3,
                col: 3,
                requires: 6,
                description: "Gives you an extra melee attack for ",
                
                fullDescription: "Instantly strikes your target, causing 60% weapon damage and an additional 20% as Nature damage. This strike also triggers an empowered version of your active shield, consuming 1 charge.",
                
                spellIds: [
                    51387
                ],
                rankDescriptions: [
                    "Instantly strikes your target, causing 60% weapon damage and an additional 20% as Nature damage. This strike also triggers an empowered version of your active shield, consuming 1 charge."
                ]
            },
            {
                id: 11,
                name: "Ancestral Guardian",
                icon: "spell_nature_ancestralguardian",
                ranks: 3,
                row: 3,
                col: 4,
                description: "Increases your armor value from items by ",
                
                fullDescription: "Increases your armor value from items by 5% and chance to dodge by an additional 2%.",
                
                spellIds: [
                    45545,
                    45546,
                    45547
                ],
                rankDescriptions: [
                    "Increases your armor value from items by 5% and chance to dodge by an additional 2%.",
                    "Increases your armor value from items by 10% and chance to dodge by an additional 4%.",
                    "Increases your armor value from items by 15% and chance to dodge by an additional 6%."
                ]
            },
            {
                id: 13,
                name: "Flurry",
                icon: "ability_ghoulfrenzy",
                ranks: 5,
                row: 4,
                col: 2,
                requires: 5,
                description: "Increases your attack speed by ",
                
                fullDescription: "Increases your attack speed by 8% for your next 3 swings after dealing a critical strike.",
                
                spellIds: [
                    16256,
                    16281,
                    16282,
                    16283,
                    16284
                ],
                rankDescriptions: [
                    "Increases your attack speed by 8% for your next 3 swings after dealing a critical strike.",
                    "Increases your attack speed by 11% for your next 3 swings after dealing a critical strike.",
                    "Increases your attack speed by 14% for your next 3 swings after dealing a critical strike.",
                    "Increases your attack speed by 17% for your next 3 swings after dealing a critical strike.",
                    "Increases your attack speed by 20% for your next 3 swings after dealing a critical strike."
                ]
            },
            {
                id: 14,
                name: "Spirit Armor",
                icon: "spell_nature_spiritarmor",
                ranks: 2,
                row: 4,
                col: 3,
                description: "Increases the armor gained from shields by ",
                
                fullDescription: "Increases the armor gained from shields by 15% and threat generated by 5% while wearing a shield.",
                
                spellIds: [
                    45951,
                    45952
                ],
                rankDescriptions: [
                    "Increases the armor gained from shields by 15% and threat generated by 5% while wearing a shield.",
                    "Increases the armor gained from shields by 30% and threat generated by 10% while wearing a shield."
                ]
            },
            {
                id: 16,
                name: "Enhancing Totems",
                icon: "spell_nature_earthbindtotem",
                ranks: 2,
                row: 5,
                col: 1,
                description: "Increases the effect of your Strength of Earth and Grace of Air Totems by ",
                
                fullDescription: "Increases the effect of your Strength of Earth and Grace of Air Totems by 12% and reduces the cooldown of your Grounding Totem by 1000 sec. Your Stoneskin Totem's damage reduction is increased by 15% and additionally it increases block amount by 15%.",
                
                spellIds: [
                    16259,
                    16295
                ],
                rankDescriptions: [
                    "Increases the effect of your Strength of Earth and Grace of Air Totems by 12% and reduces the cooldown of your Grounding Totem by 1000 sec. Your Stoneskin Totem's damage reduction is increased by 15% and additionally it increases block amount by 15%.",
                    "Increases the effect of your Strength of Earth and Grace of Air Totems by 25% and reduces the cooldown of your Grounding Totem by 2000 sec. Your Stoneskin Totem's damage reduction is increased by 30% and additionally it increases block amount by 30%."
                ]
            },
            {
                id: 17,
                name: "Elemental Weapons",
                icon: "spell_fire_flametounge",
                ranks: 3,
                row: 5,
                col: 2,
                description: "Imbuing your weapon grants a special benefit based on the imbue:\\n\\n- Flametongue: Hitting enemies with your attacks increases damage done by Fire Totems and Fire spells by ",
                
                fullDescription: "Imbuing your weapon grants a special benefit based on the imbue:\\n\\n- Flametongue: Hitting enemies with your attacks increases damage done by Fire Totems and Fire spells by 10% for 5 sec.\\n- Frostbrand: Increases the chance to trigger the effect by 8% and causes it to critically hit if the target is afflicted with Frost Shock.\\n- Windfury: Gaining extra attacks increases attack speed by 1% for 5 sec. Stacks up to 2 times.\\n- Rockbiter: Physical damage builds up an earthen bulwark equal to 20% of damage dealt, tripled while wearing a shield. The bulwark absorbs 15% of incoming damage for 8 sec or until it mitigates enough damage. Its durability cannot exceed 20% of maximum health.",
                
                spellIds: [
                    16266,
                    29079,
                    29080
                ],
                rankDescriptions: [
                    "Imbuing your weapon grants a special benefit based on the imbue:\\n\\n- Flametongue: Hitting enemies with your attacks increases damage done by Fire Totems and Fire spells by 10% for 5 sec.\\n- Frostbrand: Increases the chance to trigger the effect by 8% and causes it to critically hit if the target is afflicted with Frost Shock.\\n- Windfury: Gaining extra attacks increases attack speed by 1% for 5 sec. Stacks up to 2 times.\\n- Rockbiter: Physical damage builds up an earthen bulwark equal to 20% of damage dealt, tripled while wearing a shield. The bulwark absorbs 15% of incoming damage for 8 sec or until it mitigates enough damage. Its durability cannot exceed 20% of maximum health.",
                    "Imbuing your weapon grants a special benefit based on the imbue:\\n\\n- Flametongue: Hitting enemies with your attacks increases damage done by Fire Totems and Fire spells by 20% for 5 sec.\\n- Frostbrand: Increases the chance to trigger the effect by 16% and causes it to critically hit if the target is afflicted with Frost Shock.\\n- Windfury: Gaining extra attacks increases attack speed by 1% for 5 sec. Stacks up to 4 times.\\n- Rockbiter: Physical damage builds up an earthen bulwark equal to 20% of damage dealt, tripled while wearing a shield. The bulwark absorbs 15% of incoming damage for 8 sec or until it mitigates enough damage. Its durability cannot exceed 20% of maximum health.",
                    "Imbuing your weapon grants a special benefit based on the imbue:\\n\\n- Flametongue: Hitting enemies with your attacks increases damage done by Fire Totems and Fire spells by 30% for 5 sec.\\n- Frostbrand: Increases the chance to trigger the effect by 25% and causes it to critically hit if the target is afflicted with Frost Shock.\\n- Windfury: Gaining extra attacks increases attack speed by 1% for 5 sec. Stacks up to 6 times.\\n- Rockbiter: Physical damage builds up an earthen bulwark equal to 20% of damage dealt, tripled while wearing a shield. The bulwark absorbs 15% of incoming damage for 8 sec or until it mitigates enough damage. Its durability cannot exceed 20% of maximum health."
                ]
            },
            {
                id: 18,
                name: "Stormstrike",
                icon: "ability_shaman_stormstrike",
                ranks: 1,
                row: 5,
                col: 3,
                description: "Gives you an extra attack for ",
                
                fullDescription: "Gives you an extra attack for 100% weapon damage and increases the next 2 sources of Nature damage you deal by 25%.  Lasts 12 sec.",
                
                spellIds: [
                    17364
                ],
                rankDescriptions: [
                    "Gives you an extra attack for 100% weapon damage and increases the next 2 sources of Nature damage you deal by 25%.  Lasts 12 sec."
                ]
            },
            {
                id: 22,
                name: "Element's Grace",
                icon: "spell_fire_enchantweapon",
                ranks: 5,
                row: 6,
                col: 3,
                description: "Increases the damage you deal with all weapons, Stormstrike and Lightning Strike abilities by ",
                
                fullDescription: "Increases the damage you deal with all weapons, Stormstrike and Lightning Strike abilities by 2%. Increases the critical strike chance of your instant cast spells by 2%.",
                
                spellIds: [
                    29082,
                    29084,
                    29086,
                    29087,
                    29088
                ],
                rankDescriptions: [
                    "Increases the damage you deal with all weapons, Stormstrike and Lightning Strike abilities by 2%. Increases the critical strike chance of your instant cast spells by 2%.",
                    "Increases the damage you deal with all weapons, Stormstrike and Lightning Strike abilities by 4%. Increases the critical strike chance of your instant cast spells by 4%.",
                    "Increases the damage you deal with all weapons, Stormstrike and Lightning Strike abilities by 6%. Increases the critical strike chance of your instant cast spells by 6%.",
                    "Increases the damage you deal with all weapons, Stormstrike and Lightning Strike abilities by 8%. Increases the critical strike chance of your instant cast spells by 8%.",
                    "Increases the damage you deal with all weapons, Stormstrike and Lightning Strike abilities by 10%. Increases the critical strike chance of your instant cast spells by 10%."
                ]
            },
            {
                id: 25,
                name: "Bloodlust",
                icon: "spell_nature_bloodlust",
                ranks: 1,
                row: 7,
                col: 2,
                requires: 17,
                description: "Increases melee, ranged, and spell haste by ",
                
                fullDescription: "Fly into a frenzy, increasing your attack speed by 20% and spell casting speed by 20% for 30 sec.  While under this effect, your melee critical strikes increase the attack and spell casting speed of all party members within 30 yards by 8% for 6 sec.",
                
                spellIds: [
                    45509
                ],
                rankDescriptions: [
                    "Fly into a frenzy, increasing your attack speed by 20% and spell casting speed by 20% for 30 sec.  While under this effect, your melee critical strikes increase the attack and spell casting speed of all party members within 30 yards by 8% for 6 sec."
                ]
            }
        ],
    },
    restoration: {
        name: "Restoration",
        icon: "spell_nature_healingwavegreater",
        talents: [
            {
                id: 1,
                name: "Improved Healing Wave",
                icon: "spell_nature_magicimmunity",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Reduces the casting time of your Healing Wave spell by ",
                
                fullDescription: "Reduces the casting time of your Healing Wave spell by 0.150 sec.",
                
                spellIds: [
                    16182,
                    16226,
                    16227,
                    16228,
                    16229
                ],
                rankDescriptions: [
                    "Reduces the casting time of your Healing Wave spell by 0.150 sec.",
                    "Reduces the casting time of your Healing Wave spell by 300 sec.",
                    "Reduces the casting time of your Healing Wave spell by 0.450 sec.",
                    "Reduces the casting time of your Healing Wave spell by 600 sec.",
                    "Reduces the casting time of your Healing Wave spell by 0.750 sec."
                ]
            },
            {
                id: 2,
                name: "Tidal Focus",
                icon: "spell_frost_manarecharge",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Reduces the mana cost of your healing spells by ",
                
                fullDescription: "Reduces the Mana cost of your healing spells by 1% and your totems by 5%.",
                
                spellIds: [
                    16179,
                    16214,
                    16215,
                    16216,
                    16217
                ],
                rankDescriptions: [
                    "Reduces the Mana cost of your healing spells by 1% and your totems by 5%.",
                    "Reduces the Mana cost of your healing spells by 2% and your totems by 10%.",
                    "Reduces the Mana cost of your healing spells by 3% and your totems by 15%.",
                    "Reduces the Mana cost of your healing spells by 4% and your totems by 20%.",
                    "Reduces the Mana cost of your healing spells by 5% and your totems by 25%."
                ]
            },
            {
                id: 4,
                name: "Improved Reincarnation",
                icon: "spell_nature_reincarnation",
                ranks: 2,
                row: 2,
                col: 1,
                description: "Reduces the cooldown of your Reincarnation spell by ",
                
                fullDescription: "Reduces the cooldown of your Reincarnation spell by 600000 min and increases the amount of health and mana you reincarnate with by an additional 10%.",
                
                spellIds: [
                    16184,
                    16209
                ],
                rankDescriptions: [
                    "Reduces the cooldown of your Reincarnation spell by 600000 min and increases the amount of health and mana you reincarnate with by an additional 10%.",
                    "Reduces the cooldown of your Reincarnation spell by 1200000 min and increases the amount of health and mana you reincarnate with by an additional 20%."
                ]
            },
            {
                id: 5,
                name: "Ancestral Healing",
                icon: "spell_nature_undyingstrength",
                ranks: 3,
                row: 2,
                col: 2,
                description: "Increases your target's armor value by ",
                
                fullDescription: "Increases your target's armor value by 8% for 15 sec after getting a critical effect from one of your healing spells.",
                
                spellIds: [
                    16176,
                    16235,
                    16240
                ],
                rankDescriptions: [
                    "Increases your target's armor value by 8% for 15 sec after getting a critical effect from one of your healing spells.",
                    "Increases your target's armor value by 16% for 15 sec after getting a critical effect from one of your healing spells.",
                    "Increases your target's armor value by 25% for 15 sec after getting a critical effect from one of your healing spells."
                ]
            },
            {
                id: 6,
                name: "Tidal Mastery",
                icon: "spell_nature_tranquility",
                ranks: 5,
                row: 2,
                col: 3,
                description: "Increases the critical effect chance of your healing and lightning spells by ",
                
                fullDescription: "Increases the critical effect chance of your healing and lightning spells by 1%.",
                
                spellIds: [
                    16194,
                    16218,
                    16219,
                    16220,
                    16221
                ],
                rankDescriptions: [
                    "Increases the critical effect chance of your healing and lightning spells by 1%.",
                    "Increases the critical effect chance of your healing and lightning spells by 2%.",
                    "Increases the critical effect chance of your healing and lightning spells by 3%.",
                    "Increases the critical effect chance of your healing and lightning spells by 4%.",
                    "Increases the critical effect chance of your healing and lightning spells by 5%."
                ]
            },
            {
                id: 8,
                name: "Healing Way",
                icon: "spell_nature_healingway",
                ranks: 3,
                row: 3,
                col: 1,
                description: "Your Healing Wave, Lesser Healing Wave, and Chain Heal spells have a ",
                
                fullDescription: "Your Healing Wave and Lesser Healing Wave spells each have a 33% chance, and your Chain Heal spell has a 11% chance to increase the healing of your next Healing Wave or Chain Heal on that target by 6% for 15 sec. This effect stacks up to 15001 times.",
                
                spellIds: [
                    29206,
                    29205,
                    29202
                ],
                rankDescriptions: [
                    "Your Healing Wave and Lesser Healing Wave spells each have a 33% chance, and your Chain Heal spell has a 11% chance to increase the healing of your next Healing Wave or Chain Heal on that target by 6% for 15 sec. This effect stacks up to 15001 times.",
                    "Your Healing Wave and Lesser Healing Wave spells each have a 66% chance, and your Chain Heal spell has a 22% chance to increase the healing of your next Healing Wave or Chain Heal on that target by 6% for 15 sec. This effect stacks up to 15001 times.",
                    "Your Healing Wave and Lesser Healing Wave spells each have a 100% chance, and your Chain Heal spell has a 33% chance to increase the healing of your next Healing Wave or Chain Heal on that target by 6% for 15 sec. This effect stacks up to 15001 times."
                ]
            },
            {
                id: 9,
                name: "Healing Focus",
                icon: "spell_nature_regenerate",
                ranks: 2,
                row: 3,
                col: 2,
                description: "Gives you a ",
                
                fullDescription: "Gives you a 35% chance to avoid interruption caused by damage while casting any healing spell.",
                
                spellIds: [
                    16181,
                    16230
                ],
                rankDescriptions: [
                    "Gives you a 35% chance to avoid interruption caused by damage while casting any healing spell.",
                    "Gives you a 70% chance to avoid interruption caused by damage while casting any healing spell."
                ]
            },
            {
                id: 10,
                name: "Totemic Mastery",
                icon: "spell_nature_nullward",
                ranks: 1,
                row: 3,
                col: 3,
                description: "Increases the duration of your beneficial totems by ",
                
                fullDescription: "Increases the duration of your helpful totems by 20% and the amount of mana refunded by Totemic Recall by an additional 15%.",
                
                spellIds: [
                    16189
                ],
                rankDescriptions: [
                    "Increases the duration of your helpful totems by 20% and the amount of mana refunded by Totemic Recall by an additional 15%."
                ]
            },
            {
                id: 11,
                name: "Nature's Grace",
                icon: "spell_nature_healingtouch",
                ranks: 3,
                row: 3,
                col: 4,
                description: "Reduces the threat generated by your healing and lightning spells by ",
                
                fullDescription: "Reduces the threat generated by your Nature spells by 5%.",
                
                spellIds: [
                    29187,
                    29189,
                    29191
                ],
                rankDescriptions: [
                    "Reduces the threat generated by your Nature spells by 5%.",
                    "Reduces the threat generated by your Nature spells by 10%.",
                    "Reduces the threat generated by your Nature spells by 15%."
                ]
            },
            {
                id: 13,
                name: "Restorative Totems",
                icon: "spell_nature_manaregentotem",
                ranks: 5,
                row: 4,
                col: 2,
                description: "Increases the amount healed by your Healing Stream Totem by ",
                
                fullDescription: "Reduces mana cost of your Mana Spring Totem by 10% and increases the effect of your Healing Stream Totem by 5%.",
                
                spellIds: [
                    16187,
                    16205,
                    16206,
                    16207,
                    16208
                ],
                rankDescriptions: [
                    "Reduces mana cost of your Mana Spring Totem by 10% and increases the effect of your Healing Stream Totem by 5%.",
                    "Reduces mana cost of your Mana Spring Totem by 20% and increases the effect of your Healing Stream Totem by 10%.",
                    "Reduces mana cost of your Mana Spring Totem by 30% and increases the effect of your Healing Stream Totem by 15%.",
                    "Reduces mana cost of your Mana Spring Totem by 40% and increases the effect of your Healing Stream Totem by 20%.",
                    "Reduces mana cost of your Mana Spring Totem by 50% and increases the effect of your Healing Stream Totem by 25%."
                ]
            },
            {
                id: 14,
                name: "Improved Water Shield",
                icon: "ability_shaman_watershield",
                ranks: 3,
                row: 4,
                col: 3,
                description: "Your Water Shield restores ",
                
                fullDescription: "While your Water Shield is active, you restore 3 Mana every 5 sec, and your total mana regeneration is increased by 10% for each active Water Shield globe.",
                
                spellIds: [
                    51369,
                    51370,
                    51371
                ],
                rankDescriptions: [
                    "While your Water Shield is active, you restore 3 Mana every 5 sec, and your total mana regeneration is increased by 10% for each active Water Shield globe.",
                    "While your Water Shield is active, you restore 6 Mana every 5 sec, and your total mana regeneration is increased by 15% for each active Water Shield globe.",
                    "While your Water Shield is active, you restore 9 Mana every 5 sec, and your total mana regeneration is increased by 20% for each active Water Shield globe."
                ]
            },
            {
                id: 16,
                name: "Tidal Surge",
                icon: "spell_arcane_manatap",
                ranks: 2,
                row: 5,
                col: 1,
                requires: 8,
                description: "You regain ",
                
                fullDescription: "After healing a target affected by your Healing Way effect, you have a 15% chance to regain mana equal to 15% of the base cost of the spell.",
                
                spellIds: [
                    51491,
                    51492
                ],
                rankDescriptions: [
                    "After healing a target affected by your Healing Way effect, you have a 15% chance to regain mana equal to 15% of the base cost of the spell.",
                    "After healing a target affected by your Healing Way effect, you have a 30% chance to regain mana equal to 15% of the base cost of the spell."
                ]
            },
            {
                id: 18,
                name: "Ancestral Swiftness",
                icon: "spell_nature_ravenform",
                ranks: 1,
                row: 5,
                col: 3,
                description: "When activated, your next Nature spell with a base casting time less than 10 sec becomes an instant cast spell. If that spell is a damaging spell, the damage it deals is reduced by ",
                
                fullDescription: "When activated, your next Nature spell with a casting time less than 10 sec becomes an instant cast spell. Affected damaging spells have 25% reduced effectiveness.",
                
                spellIds: [
                    16188
                ],
                rankDescriptions: [
                    "When activated, your next Nature spell with a casting time less than 10 sec becomes an instant cast spell. Affected damaging spells have 25% reduced effectiveness."
                ]
            },
            {
                id: 19,
                name: "Undertow",
                icon: "spell_shaman_tidalwaves",
                ranks: 2,
                row: 5,
                col: 4,
                requires: 14,
                description: "Your Chain Heal, Healing Wave, and Lesser Healing Wave have a ",
                
                fullDescription: "Your Healing Wave and Lesser Healing Wave spells have a 25% chance to restore a charge of your active Water Shield.  When your Water Shield is at maximum charges, this effect consumes a charge instead.",
                
                spellIds: [
                    51372,
                    51373
                ],
                rankDescriptions: [
                    "Your Healing Wave and Lesser Healing Wave spells have a 25% chance to restore a charge of your active Water Shield.  When your Water Shield is at maximum charges, this effect consumes a charge instead.",
                    "Your Healing Wave and Lesser Healing Wave spells have a 50% chance to restore a charge of your active Water Shield.  When your Water Shield is at maximum charges, this effect consumes a charge instead."
                ]
            },
            {
                id: 21,
                name: "Improved Chain Heal",
                icon: "spell_nature_healingwavegreater",
                ranks: 5,
                row: 6,
                col: 2,
                requires: 13,
                description: "Reduces the cast time of your Chain Heal spell by ",
                
                fullDescription: "Increases the amount healed to targets beyond the first by 26%.",
                
                spellIds: [
                    51374,
                    51375,
                    51376,
                    51377,
                    51378
                ],
                rankDescriptions: [
                    "Increases the amount healed to targets beyond the first by 26%.",
                    "Increases the amount healed to targets beyond the first by 50%.",
                    "Reduces the cast time of your Chain Heal spell by 600 sec.",
                    "Reduces the cast time of your Chain Heal spell by 800 sec.",
                    "Reduces the cast time of your Chain Heal spell by 1000 sec."
                ]
            },
            {
                id: 25,
                name: "Spirit Link",
                icon: "spell_shaman_spiritlink",
                ranks: 1,
                row: 7,
                col: 2,
                requires: 21,
                description: "You link the friendly target with up to 2 nearby allies, causing ",
                
                fullDescription: "Links the spirit of an ally to that of other group members within 35 yards. When the target takes damage, 30% is distributed among nearby allies. Lasts 20 sec.",
                
                spellIds: [
                    51363
                ],
                rankDescriptions: [
                    "Links the spirit of an ally to that of other group members within 35 yards. When the target takes damage, 30% is distributed among nearby allies. Lasts 20 sec."
                ]
            }
        ],
    },
};
