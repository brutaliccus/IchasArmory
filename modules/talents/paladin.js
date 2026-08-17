// Paladin talents for Turtle WoW
export const paladinTalents = {
    holy: {
        name: "Holy",
        icon: "ability_golemthunderclap",
        talents: [
            {
                id: 1,
                name: "Divine Strength",
                icon: "ability_golemthunderclap",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Increases your Strength by 2%.",
                
                fullDescription: "Increases your Strength by 2%.",
                
                spellIds: [
                    20262,
                    20263,
                    20264,
                    20265,
                    20266
                ],
                rankDescriptions: [
                    "Increases your Strength by 2%.",
                    "Increases your Strength by 4%.",
                    "Increases your Strength by 6%.",
                    "Increases your Strength by 8%.",
                    "Increases your Strength by 10%."
                ]
            },
            {
                id: 2,
                name: "Divine Intellect",
                icon: "spell_nature_sleep",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Increases your total Intellect by 2%.",
                
                fullDescription: "Increases your total Intellect by 2%.",
                
                spellIds: [
                    20257,
                    20258,
                    20259,
                    20260,
                    20261
                ],
                rankDescriptions: [
                    "Increases your total Intellect by 2%.",
                    "Increases your total Intellect by 4%.",
                    "Increases your total Intellect by 6%.",
                    "Increases your total Intellect by 8%.",
                    "Increases your total Intellect by 10%."
                ]
            },
            {
                id: 4,
                name: "Holy Judgement",
                icon: "ability_paladin_judgementblue",
                ranks: 3,
                row: 2,
                col: 1,
                description: "Casting Judgement reduces the casting time of your next Holy Light by 0.3 sec.",
                
                fullDescription: "Casting Judgement reduces the casting time of your next Holy Light by 0.3 sec.",
                
                spellIds: [
                    51304,
                    51306,
                    51308
                ],
                rankDescriptions: [
                    "Casting Judgement reduces the casting time of your next Holy Light by 0.3 sec.",
                    "Casting Judgement reduces the casting time of your next Holy Light by 0.6 sec.",
                    "Casting Judgement reduces the casting time of your next Holy Light by 1 sec."
                ]
            },
            {
                id: 5,
                name: "Spiritual Focus",
                icon: "spell_arcane_blink",
                ranks: 2,
                row: 2,
                col: 2,
                description: "Gives your Flash of Light and Holy Light spells a 35% chance to not lose casting time when you take damage.",
                
                fullDescription: "Gives your Flash of Light and Holy Light spells a 35% chance to not lose casting time when you take damage.",
                
                spellIds: [
                    20205,
                    20206
                ],
                rankDescriptions: [
                    "Gives your Flash of Light and Holy Light spells a 35% chance to not lose casting time when you take damage.",
                    "Gives your Flash of Light and Holy Light spells a 70% chance to not lose casting time when you take damage."
                ]
            },
            {
                id: 6,
                name: "Improved Seal of Righteousness",
                icon: "ability_thunderbolt",
                ranks: 5,
                row: 2,
                col: 3,
                description: "Increases the damage done by your Seal of Righteousness and Judgement of Righteousness by 2%.",
                
                fullDescription: "Increases the damage done by your Seal of Righteousness and Judgement of Righteousness by 2%.",
                
                spellIds: [
                    20224,
                    20225,
                    20330,
                    20331,
                    20332
                ],
                rankDescriptions: [
                    "Increases the damage done by your Seal of Righteousness and Judgement of Righteousness by 2%.",
                    "Increases the damage done by your Seal of Righteousness and Judgement of Righteousness by 4%.",
                    "Increases the damage done by your Seal of Righteousness and Judgement of Righteousness by 6%.",
                    "Increases the damage done by your Seal of Righteousness and Judgement of Righteousness by 8%.",
                    "Increases the damage done by your Seal of Righteousness and Judgement of Righteousness by 10%."
                ]
            },
            {
                id: 8,
                name: "Healing Light",
                icon: "spell_holy_holybolt",
                ranks: 3,
                row: 3,
                col: 1,
                description: "Increases the amount healed by your Holy Light, Flash of Light and Holy Shock spells by 8%.",
                
                fullDescription: "Increases the amount healed by your Holy Light, Flash of Light and Holy Shock spells by 8%.",
                
                spellIds: [
                    20237,
                    20238,
                    20239
                ],
                rankDescriptions: [
                    "Increases the amount healed by your Holy Light, Flash of Light and Holy Shock spells by 8%.",
                    "Increases the amount healed by your Holy Light, Flash of Light and Holy Shock spells by 12%.",
                    "Increases the amount healed by your Holy Light, Flash of Light and Holy Shock spells by 8%."
                ]
            },
            {
                id: 9,
                name: "Sanctity Aura",
                icon: "spell_holy_mindvision",
                ranks: 1,
                row: 3,
                col: 2,
                description: "Increases Holy damage done by party members within 30 yards by 10%.  Players may only have one Aura on them per Paladin at any one time.",
                
                fullDescription: "Increases Holy damage done by party members within 30 yards by 10%.  Players may only have one Aura on them per Paladin at any one time.",
                
                spellIds: [
                    20218
                ],
                rankDescriptions: [
                    "Increases Holy damage done by party members within 30 yards by 10%.  Players may only have one Aura on them per Paladin at any one time."
                ]
            },
            {
                id: 10,
                name: "Improved Lay on Hands",
                icon: "spell_holy_layonhands",
                ranks: 2,
                row: 3,
                col: 3,
                description: "Gives the target of your Lay on Hands spell a 15% bonus to their armor value from items for 2 min. In addition, the cooldown for your Lay on Hands spell is reduced by 10 min.",
                
                fullDescription: "Gives the target of your Lay on Hands spell a 15% bonus to their armor value from items for 2 min. In addition, the cooldown for your Lay on Hands spell is reduced by 10 min.",
                
                spellIds: [
                    20234,
                    20235
                ],
                rankDescriptions: [
                    "Gives the target of your Lay on Hands spell a 15% bonus to their armor value from items for 2 min. In addition, the cooldown for your Lay on Hands spell is reduced by 10 min.",
                    "Gives the target of your Lay on Hands spell a 30% bonus to their armor value from items for 2 min. In addition, the cooldown for your Lay on Hands spell is reduced by 20 min."
                ]
            },
            {
                id: 11,
                name: "Unyielding Faith",
                icon: "spell_holy_unyieldingfaith",
                ranks: 2,
                row: 3,
                col: 4,
                description: "Increases your chance to resist Fear and Disorient effects by an additional 5%.",
                
                fullDescription: "Increases your chance to resist Fear and Disorient effects by an additional 5%.",
                
                spellIds: [
                    9453,
                    25836
                ],
                rankDescriptions: [
                    "Increases your chance to resist Fear and Disorient effects by an additional 5%.",
                    "Increases your chance to resist Fear and Disorient effects by an additional 10%."
                ]
            },
            {
                id: 12,
                name: "Improved Concentration Aura",
                icon: "spell_holy_mindsooth",
                ranks: 3,
                row: 4,
                col: 1,
                description: "Increases the effect of your Concentration Aura by an additional 5% and gives all group members affected by the aura an additional 5% chance to resist Silence and Interrupt effects.",
                
                fullDescription: "Increases the effect of your Concentration Aura by an additional 5% and gives all group members affected by the aura an additional 5% chance to resist Silence and Interrupt effects.",
                
                spellIds: [
                    20254,
                    20255,
                    20256
                ],
                rankDescriptions: [
                    "Increases the effect of your Concentration Aura by an additional 5% and gives all group members affected by the aura an additional 5% chance to resist Silence and Interrupt effects.",
                    "Increases the effect of your Concentration Aura by an additional 10% and gives all group members affected by the aura an additional 10% chance to resist Silence and Interrupt effects.",
                    "Increases the effect of your Concentration Aura by an additional 15% and gives all group members affected by the aura an additional 15% chance to resist Silence and Interrupt effects."
                ]
            },
            {
                id: 13,
                name: "Illumination",
                icon: "spell_holy_greaterheal",
                ranks: 5,
                row: 4,
                col: 2,
                description: "After getting a critical effect from your Flash of Light, Holy Light, or Holy Shock heal spell, you regain Mana equal to 12% of the base cost of the spell.",
                
                fullDescription: "After getting a critical effect from your Flash of Light, Holy Light, or Holy Shock heal spell, you regain Mana equal to 12% of the base cost of the spell.",
                
                spellIds: [
                    20210,
                    20212,
                    20213,
                    20214,
                    20215
                ],
                rankDescriptions: [
                    "After getting a critical effect from your Flash of Light, Holy Light, or Holy Shock heal spell, you regain Mana equal to 12% of the base cost of the spell.",
                    "After getting a critical effect from your Flash of Light, Holy Light, or Holy Shock heal spell, you regain Mana equal to 24% of the base cost of the spell.",
                    "After getting a critical effect from your Flash of Light, Holy Light, or Holy Shock heal spell, you regain Mana equal to 36% of the base cost of the spell.",
                    "After getting a critical effect from your Flash of Light, Holy Light, or Holy Shock heal spell, you regain Mana equal to 48% of the base cost of the spell.",
                    "After getting a critical effect from your Flash of Light, Holy Light, or Holy Shock heal spell, you regain Mana equal to 60% of the base cost of the spell."
                ]
            },
            {
                id: 14,
                name: "Ironclad",
                icon: "inv_shoulder_30",
                ranks: 2,
                row: 4,
                col: 3,
                description: "Increases your healing power by 2% of your Armor.",
                
                fullDescription: "Increases your healing power by 2% of your Armor.",
                
                spellIds: [
                    51310,
                    51311
                ],
                rankDescriptions: [
                    "Increases your healing power by 2% of your Armor.",
                    "Increases your healing power by 2% of your Armor."
                ]
            },
            {
                id: 16,
                name: "Divine Favor",
                icon: "spell_holy_heal",
                ranks: 5,
                row: 5,
                col: 1,
                requires: 17,
                description: "Improves your chance to get a critical strike with Holy Shock by 10%.",
                
                fullDescription: "Improves your chance to get a critical strike with Holy Shock by 10%.",
                
                spellIds: [
                    51312,
                    51313,
                    51314,
                    51315,
                    51316
                ],
                rankDescriptions: [
                    "Improves your chance to get a critical strike with Holy Shock by 10%.",
                    "Improves your chance to get a critical strike with Holy Shock by 20%.",
                    "Improves your chance to get a critical strike with Holy Shock by 30%.",
                    "Improves your chance to get a critical strike with Holy Shock by 40%.",
                    "Improves your chance to get a critical strike with Holy Shock by 50%."
                ]
            },
            {
                id: 17,
                name: "Holy Shock",
                icon: "spell_holy_searinglight",
                ranks: 1,
                row: 5,
                col: 2,
                description: "Blasts the target with Holy energy, causing 97 to 105 Holy damage to an enemy, or 311 to 321 healing to an ally. Casting Holy Shock has a chance to have no cooldown for its next cast.",
                
                fullDescription: "Blasts the target with Holy energy, causing 97 to 105 Holy damage to an enemy, or 311 to 321 healing to an ally. Casting Holy Shock has a chance to have no cooldown for its next cast.",
                
                spellIds: [
                    20473
                ],
                rankDescriptions: [
                    "Blasts the target with Holy energy, causing 97 to 105 Holy damage to an enemy, or 311 to 321 healing to an ally. Casting Holy Shock has a chance to have no cooldown for its next cast."
                ]
            },
            {
                id: 20,
                name: "Holy Power",
                icon: "spell_holy_power",
                ranks: 3,
                row: 6,
                col: 1,
                description: "Increases the critical effect chance of your Holy Light and Flash of Light by 2%.",
                
                fullDescription: "Increases the critical effect chance of your Holy Light and Flash of Light by 2%.",
                
                spellIds: [
                    5923,
                    5924,
                    5925
                ],
                rankDescriptions: [
                    "Increases the critical effect chance of your Holy Light and Flash of Light by 2%.",
                    "Increases the critical effect chance of your Holy Light and Flash of Light by 4%.",
                    "Increases the critical effect chance of your Holy Light and Flash of Light by 6%."
                ]
            },
            {
                id: 22,
                name: "Blessed Strikes",
                icon: "spell_holy_revivechampion",
                ranks: 5,
                row: 6,
                col: 3,
                requires: 17,
                description: "Crusader Strike has a 20% chance to reset the cooldown of your Holy Shock.  In addition, the healing effect of your Holy Strike is increased by 20% and benefits from an additional 5% of your healing power.",
                
                fullDescription: "Crusader Strike has a 20% chance to reset the cooldown of your Holy Shock.  In addition, the healing effect of your Holy Strike is increased by 20% and benefits from an additional 5% of your healing power.",
                
                spellIds: [
                    51317,
                    51318,
                    51319,
                    51320,
                    51321
                ],
                rankDescriptions: [
                    "Crusader Strike has a 20% chance to reset the cooldown of your Holy Shock.  In addition, the healing effect of your Holy Strike is increased by 20% and benefits from an additional 5% of your healing power.",
                    "Crusader Strike has a 40% chance to reset the cooldown of your Holy Shock.  In addition, the healing effect of your Holy Strike is increased by 40% and benefits from an additional 10% of your healing power.",
                    "Crusader Strike has a 60% chance to reset the cooldown of your Holy Shock.  In addition, the healing effect of your Holy Strike is increased by 60% and benefits from an additional 15% of your healing power.",
                    "Crusader Strike has a 80% chance to reset the cooldown of your Holy Shock.  In addition, the healing effect of your Holy Strike is increased by 80% and benefits from an additional 20% of your healing power.",
                    "Crusader Strike has a 100% chance to reset the cooldown of your Holy Shock.  In addition, the healing effect of your Holy Strike is increased by 100% and benefits from an additional 25% of your healing power."
                ]
            },
            {
                id: 25,
                name: "Daybreak",
                icon: "spell_holy_auramastery",
                ranks: 1,
                row: 7,
                col: 2,
                requires: 17,
                description: "Critically healing an ally applies Daybreak on them for 30 sec. When the ally takes damage, Daybreak is consumed to heal them for 348 to 390.",
                
                fullDescription: "Critically healing an ally applies Daybreak on them for 30 sec. When the ally takes damage, Daybreak is consumed to heal them for 348 to 390.",
                
                spellIds: [
                    51323
                ],
                rankDescriptions: [
                    "Critically healing an ally applies Daybreak on them for 30 sec. When the ally takes damage, Daybreak is consumed to heal them for 348 to 390."
                ]
            }
        ],
    },
    protection: {
        name: "Protection",
        icon: "spell_holy_devotionaura",
        talents: [
            {
                id: 1,
                name: "Improved Devotion Aura",
                icon: "spell_holy_devotionaura",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Increases the armor bonus of your Devotion Aura by 5%.",
                
                fullDescription: "Increases the armor bonus of your Devotion Aura by 5%.",
                
                spellIds: [
                    20138,
                    20139,
                    20140,
                    20141,
                    20142
                ],
                rankDescriptions: [
                    "Increases the armor bonus of your Devotion Aura by 5%.",
                    "Increases the armor bonus of your Devotion Aura by 10%.",
                    "Increases the armor bonus of your Devotion Aura by 15%.",
                    "Increases the armor bonus of your Devotion Aura by 20%.",
                    "Increases the armor bonus of your Devotion Aura by 25%."
                ]
            },
            {
                id: 2,
                name: "Redoubt",
                icon: "ability_defend",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Successful melee and ranged attacks against you have a 2/4/6/8/10% chance to increase your chance to block by 3/6/9/12/15%. Lasts 10 sec or 5 blocks.",
                
                fullDescription: "Successful melee and ranged attacks against you have a 2/4/6/8/10% chance to increase your chance to block by 3/6/9/12/15%. Lasts 10 sec or 5 blocks.",
                
                spellIds: [
                    45818,
                    45819,
                    45820,
                    45821,
                    45822
                ],
                rankDescriptions: [
                    "Successful melee and ranged attacks against you have a 2% chance to increase your chance to block by 3%. Lasts 10 sec or 5 blocks.",
                    "Successful melee and ranged attacks against you have a 4% chance to increase your chance to block by 6%. Lasts 10 sec or 5 blocks.",
                    "Successful melee and ranged attacks against you have a 6% chance to increase your chance to block by 9%. Lasts 10 sec or 5 blocks.",
                    "Successful melee and ranged attacks against you have a 8% chance to increase your chance to block by 12%. Lasts 10 sec or 5 blocks.",
                    "Successful melee and ranged attacks against you have a 10% chance to increase your chance to block by 15%. Lasts 10 sec or 5 blocks."
                ]
            },
            {
                id: 4,
                name: "Precision",
                icon: "ability_rogue_ambush",
                ranks: 3,
                row: 2,
                col: 1,
                description: "Increases your chance to hit with melee attacks and spells by 1%.",
                
                fullDescription: "Increases your chance to hit with melee attacks and spells by 1%.",
                
                spellIds: [
                    20189,
                    20192,
                    20193
                ],
                rankDescriptions: [
                    "Increases your chance to hit with melee attacks and spells by 1%.",
                    "Increases your chance to hit with melee attacks and spells by 2%.",
                    "Increases your chance to hit with melee attacks and spells by 3%."
                ]
            },
            {
                id: 5,
                name: "Guardian's Favor",
                icon: "spell_holy_sealofprotection",
                ranks: 2,
                row: 2,
                col: 2,
                description: "Reduces the cooldown of your Hand of Protection by 60 sec and increases the duration of your Hand of Freedom by 3 sec.",
                
                fullDescription: "Reduces the cooldown of your Hand of Protection by 60 sec and increases the duration of your Hand of Freedom by 3 sec.",
                
                spellIds: [
                    20174,
                    20175
                ],
                rankDescriptions: [
                    "Reduces the cooldown of your Hand of Protection by 60 sec and increases the duration of your Hand of Freedom by 3 sec.",
                    "Reduces the cooldown of your Hand of Protection by 0.12 sec and increases the duration of your Hand of Freedom by 6 sec."
                ]
            },
            {
                id: 7,
                name: "Toughness",
                icon: "spell_holy_devotion",
                ranks: 5,
                row: 2,
                col: 4,
                description: "Increases your armor value from items by 2%.",
                
                fullDescription: "Increases your armor value from items by 2%.",
                
                spellIds: [
                    20143,
                    20144,
                    20145,
                    20146,
                    20147
                ],
                rankDescriptions: [
                    "Increases your armor value from items by 2%.",
                    "Increases your armor value from items by 4%.",
                    "Increases your armor value from items by 6%.",
                    "Increases your armor value from items by 8%.",
                    "Increases your armor value from items by 10%."
                ]
            },
            {
                id: 8,
                name: "Improved Righteous Fury",
                icon: "spell_holy_sealoffury",
                ranks: 3,
                row: 3,
                col: 1,
                description: "Increases the amount of threat generated by your Righteous Fury spell by 25%.",
                
                fullDescription: "Increases the amount of threat generated by your Righteous Fury spell by 25%.",
                
                spellIds: [
                    20468,
                    20469,
                    20470
                ],
                rankDescriptions: [
                    "Increases the amount of threat generated by your Righteous Fury spell by 25%.",
                    "Increases the amount of threat generated by your Righteous Fury spell by 75%.",
                    "Increases the amount of threat generated by your Righteous Fury spell by 25%."
                ]
            },
            {
                id: 9,
                name: "Blessing of Sanctuary",
                icon: "spell_nature_lightningshield",
                ranks: 1,
                row: 3,
                col: 2,
                description: "Places a Blessing on the friendly target, reducing damage dealt from all sources by up to 10 for 0.6 sec.  In addition, when the target blocks a melee attack the attacker will take 14 Holy damage.  Players may only have one Blessing on them per Paladin at any one time.",
                
                fullDescription: "Places a Blessing on the friendly target, reducing damage dealt from all sources by up to 10 for 0.6 sec.  In addition, when the target blocks a melee attack the attacker will take 14 Holy damage.  Players may only have one Blessing on them per Paladin at any one time.",
                
                spellIds: [
                    20911
                ],
                rankDescriptions: [
                    "Places a Blessing on the friendly target, reducing damage dealt from all sources by up to 10 for 0.6 sec.  In addition, when the target blocks a melee attack the attacker will take 14 Holy damage.  Players may only have one Blessing on them per Paladin at any one time."
                ]
            },
            {
                id: 10,
                name: "Shield Specialization",
                icon: "inv_shield_06",
                ranks: 3,
                row: 3,
                col: 3,
                requires: 2,
                description: "Increases the amount of damage absorbed by your shield by 10% and has a 33% chance to restore 2% of maximum mana when a block occurs. This effect cannot occur more than once every 5 sec.",
                
                fullDescription: "Increases the amount of damage absorbed by your shield by 10% and has a 33% chance to restore 2% of maximum mana when a block occurs. This effect cannot occur more than once every 5 sec.",
                
                spellIds: [
                    20148,
                    20149,
                    20150
                ],
                rankDescriptions: [
                    "Increases the amount of damage absorbed by your shield by 10% and has a 33% chance to restore 2% of maximum mana when a block occurs. This effect cannot occur more than once every 5 sec.",
                    "Increases the amount of damage absorbed by your shield by 20% and has a 66% chance to restore 2% of maximum mana when a block occurs. This effect cannot occur more than once every 5 sec.",
                    "Increases the amount of damage absorbed by your shield by 30% and has a 100% chance to restore 2% of maximum mana when a block occurs. This effect cannot occur more than once every 5 sec."
                ]
            },
            {
                id: 11,
                name: "Anticipation",
                icon: "spell_magic_lesserinvisibilty",
                ranks: 3,
                row: 3,
                col: 4,
                description: "Increases your Defense skill by 7.",
                
                fullDescription: "Increases your Defense skill by 7.",
                
                spellIds: [
                    20096,
                    20097,
                    20098
                ],
                rankDescriptions: [
                    "Increases your Defense skill by 7.",
                    "Increases your Defense skill by 14.",
                    "Increases your Defense skill by 20."
                ]
            },
            {
                id: 13,
                name: "Improved Hand of Reckoning",
                icon: "spell_holy_redemption",
                ranks: 2,
                row: 4,
                col: 2,
                description: "Improves your chance to hit with Hand of Reckoning by 4%.",
                
                fullDescription: "Improves your chance to hit with Hand of Reckoning by 4%.",
                
                spellIds: [
                    51334,
                    51335
                ],
                rankDescriptions: [
                    "Improves your chance to hit with Hand of Reckoning by 4%.",
                    "Improves your chance to hit with Hand of Reckoning by 8%."
                ]
            },
            {
                id: 14,
                name: "Improved Hammer of Justice",
                icon: "spell_holy_sealofmight",
                ranks: 3,
                row: 4,
                col: 3,
                description: "Decreases the cooldown of your Hammer of Justice spell by 5 sec.",
                
                fullDescription: "Decreases the cooldown of your Hammer of Justice spell by 5 sec.",
                
                spellIds: [
                    20487,
                    20488,
                    20489
                ],
                rankDescriptions: [
                    "Decreases the cooldown of your Hammer of Justice spell by 5 sec.",
                    "Decreases the cooldown of your Hammer of Justice spell by 10 sec.",
                    "Decreases the cooldown of your Hammer of Justice spell by 15 sec."
                ]
            },
            {
                id: 16,
                name: "Righteous Defense",
                icon: "ability_warrior_swordandboard",
                ranks: 3,
                row: 5,
                col: 1,
                requires: 8,
                description: "While Righteous Fury is active, your damage taken is reduced by 3%.",
                
                fullDescription: "While Righteous Fury is active, your damage taken is reduced by 3%.",
                
                spellIds: [
                    51328,
                    51329,
                    51330
                ],
                rankDescriptions: [
                    "While Righteous Fury is active, your damage taken is reduced by 3%.",
                    "While Righteous Fury is active, your damage taken is reduced by 6%.",
                    "While Righteous Fury is active, your damage taken is reduced by 10%."
                ]
            },
            {
                id: 17,
                name: "Holy Shield",
                icon: "spell_holy_blessingofprotection",
                ranks: 1,
                row: 5,
                col: 2,
                description: "Increases chance to block by 45% for 10 sec, and deals 35 Holy damage for each attack blocked while active.  Damage caused by Holy Shield causes 30% additional threat.  Each block expends a charge.  4 charges.",
                
                fullDescription: "Increases chance to block by 45% for 10 sec, and deals 35 Holy damage for each attack blocked while active.  Damage caused by Holy Shield causes 30% additional threat.  Each block expends a charge.  4 charges.",
                
                spellIds: [
                    20925
                ],
                rankDescriptions: [
                    "Increases chance to block by 45% for 10 sec, and deals 35 Holy damage for each attack blocked while active.  Damage caused by Holy Shield causes 30% additional threat.  Each block expends a charge.  4 charges."
                ]
            },
            {
                id: 18,
                name: "Reckoning",
                icon: "spell_holy_blessingofstrength",
                ranks: 5,
                row: 5,
                col: 3,
                description: "Gives you a 10% chance after blocking an attack to generate an additional attack.",
                
                fullDescription: "Gives you a 10% chance after blocking an attack to generate an additional attack.",
                
                spellIds: [
                    45823,
                    45824,
                    45825,
                    45826,
                    45837
                ],
                rankDescriptions: [
                    "Gives you a 10% chance after blocking an attack to generate an additional attack.",
                    "Gives you a 20% chance after blocking an attack to generate an additional attack.",
                    "Gives you a 30% chance after blocking an attack to generate an additional attack.",
                    "Gives you a 40% chance after blocking an attack to generate an additional attack.",
                    "Gives you a 50% chance after blocking an attack to generate an additional attack."
                ]
            },
            {
                id: 22,
                name: "Righteous Strikes",
                icon: "spell_holy_sealofblood",
                ranks: 5,
                row: 6,
                col: 3,
                description: "Increases the threat generated by your Holy Strike by 6% and its damage by 5%.  In addition, Zeal increases the amount of damage blocked by 2%.",
                
                fullDescription: "Increases the threat generated by your Holy Strike by 6% and its damage by 5%.  In addition, Zeal increases the amount of damage blocked by 2%.",
                
                spellIds: [
                    51341,
                    51342,
                    51343,
                    51344,
                    51345
                ],
                rankDescriptions: [
                    "Increases the threat generated by your Holy Strike by 6% and its damage by 5%.  In addition, Zeal increases the amount of damage blocked by 2%.",
                    "Increases the threat generated by your Holy Strike by 12% and its damage by 10%.  In addition, Zeal increases the amount of damage blocked by 4%.",
                    "Increases the threat generated by your Holy Strike by 18% and its damage by 15%.  In addition, Zeal increases the amount of damage blocked by 6%.",
                    "Increases the threat generated by your Holy Strike by 24% and its damage by 20%.  In addition, Zeal increases the amount of damage blocked by 8%.",
                    "Increases the threat generated by your Holy Strike by 30% and its damage by 25%.  In addition, Zeal increases the amount of damage blocked by 10%."
                ]
            },
            {
                id: 25,
                name: "Bulwark of the Righteous",
                icon: "ability_warrior_victoryrush",
                ranks: 1,
                row: 7,
                col: 2,
                requires: 17,
                description: "Bash the target with your shield, dealing 274 to 302 Holy damage and reducing the damage you take by 30% for 12 sec.",
                
                fullDescription: "Bash the target with your shield, dealing 274 to 302 Holy damage and reducing the damage you take by 30% for 12 sec.",
                
                spellIds: [
                    51346
                ],
                rankDescriptions: [
                    "Bash the target with your shield, dealing 274 to 302 Holy damage and reducing the damage you take by 30% for 12 sec."
                ]
            }
        ],
    },
    retribution: {
        name: "Retribution",
        icon: "spell_holy_spiritualguidence",
        talents: [
            {
                id: 1,
                name: "Improved Blessings",
                icon: "spell_holy_spiritualguidence",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Increases the effectiveness your Blessing of Might and Wisdom by 4%.",
                
                fullDescription: "Increases the effectiveness your Blessing of Might and Wisdom by 4%.",
                
                spellIds: [
                    20042,
                    20045,
                    20046,
                    20047,
                    20048
                ],
                rankDescriptions: [
                    "Increases the effectiveness your Blessing of Might and Wisdom by 4%.",
                    "Increases the effectiveness your Blessing of Might and Wisdom by 8%.",
                    "Increases the effectiveness your Blessing of Might and Wisdom by 12%.",
                    "Increases the effectiveness your Blessing of Might and Wisdom by 16%.",
                    "Increases the effectiveness your Blessing of Might and Wisdom by 20%."
                ]
            },
            {
                id: 2,
                name: "Benediction",
                icon: "spell_frost_windwalkon",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Reduces the Mana cost of your Judgement and Seal spells by 3%.",
                
                fullDescription: "Reduces the Mana cost of your Judgement and Seal spells by 3%.",
                
                spellIds: [
                    20101,
                    20102,
                    20103,
                    20104,
                    20105
                ],
                rankDescriptions: [
                    "Reduces the Mana cost of your Judgement and Seal spells by 3%.",
                    "Reduces the Mana cost of your Judgement and Seal spells by 6%.",
                    "Reduces the Mana cost of your Judgement and Seal spells by 9%.",
                    "Reduces the Mana cost of your Judgement and Seal spells by 12%.",
                    "Reduces the Mana cost of your Judgement and Seal spells by 15%."
                ]
            },
            {
                id: 4,
                name: "Improved Judgement",
                icon: "spell_holy_righteousfury",
                ranks: 2,
                row: 2,
                col: 1,
                description: "Decreases the cooldown of your Judgement spell by 1 sec.",
                
                fullDescription: "Decreases the cooldown of your Judgement spell by 1 sec.",
                
                spellIds: [
                    25956,
                    25957
                ],
                rankDescriptions: [
                    "Decreases the cooldown of your Judgement spell by 1 sec.",
                    "Decreases the cooldown of your Judgement spell by 2 sec."
                ]
            },
            {
                id: 5,
                name: "Improved Seal of the Crusader",
                icon: "spell_holy_holysmite",
                ranks: 3,
                row: 2,
                col: 2,
                description: "Increases the melee attack power bonus of your Seal of the Crusader and the Holy damage increase of your Judgement of the Crusader by 5%.",
                
                fullDescription: "Increases the melee attack power bonus of your Seal of the Crusader and the Holy damage increase of your Judgement of the Crusader by 5%.",
                
                spellIds: [
                    20335,
                    20336,
                    20337
                ],
                rankDescriptions: [
                    "Increases the melee attack power bonus of your Seal of the Crusader and the Holy damage increase of your Judgement of the Crusader by 5%.",
                    "Increases the melee attack power bonus of your Seal of the Crusader and the Holy damage increase of your Judgement of the Crusader by 15%.",
                    "Increases the melee attack power bonus of your Seal of the Crusader by 48 and the Holy damage increase of your Judgement of the Crusader by 33."
                ]
            },
            {
                id: 6,
                name: "Deflection",
                icon: "ability_parry",
                ranks: 5,
                row: 2,
                col: 3,
                description: "Increases your Parry chance by 1%.",
                
                fullDescription: "Increases your Parry chance by 1%.",
                
                spellIds: [
                    20060,
                    20061,
                    20062,
                    20063,
                    20064
                ],
                rankDescriptions: [
                    "Increases your Parry chance by 1%.",
                    "Increases your Parry chance by 2%.",
                    "Increases your Parry chance by 3%.",
                    "Increases your Parry chance by 4%.",
                    "Increases your Parry chance by 5%."
                ]
            },
            {
                id: 8,
                name: "Improved Retribution Aura",
                icon: "spell_holy_auraoflight",
                ranks: 2,
                row: 3,
                col: 1,
                description: "Increases the damage done by your Retribution Aura by 25%.",
                
                fullDescription: "Increases the damage done by your Retribution Aura by 25%.",
                
                spellIds: [
                    20091,
                    20092
                ],
                rankDescriptions: [
                    "Increases the damage done by your Retribution Aura by 25%.",
                    "Increases the damage done by your Retribution Aura by 50%."
                ]
            },
            {
                id: 9,
                name: "Conviction",
                icon: "spell_holy_retributionaura",
                ranks: 5,
                row: 3,
                col: 2,
                description: "Increases your chance to get a critical strike with melee weapons by 1%.",
                
                fullDescription: "Increases your chance to get a critical strike with melee weapons by 1%.",
                
                spellIds: [
                    20117,
                    20118,
                    20119,
                    20120,
                    20121
                ],
                rankDescriptions: [
                    "Increases your chance to get a critical strike with melee weapons by 1%.",
                    "Increases your chance to get a critical strike with melee weapons by 2%.",
                    "Increases your chance to get a critical strike with melee weapons by 3%.",
                    "Increases your chance to get a critical strike with melee weapons by 4%.",
                    "Increases your chance to get a critical strike with melee weapons by 5%."
                ]
            },
            {
                id: 10,
                name: "Blessing of Kings",
                icon: "spell_magic_magearmor",
                ranks: 1,
                row: 3,
                col: 3,
                description: "Places a Blessing on the friendly target, increasing total stats by 10% for 10 min.  Players may only have one Blessing on them per Paladin at any one time.",
                
                fullDescription: "Places a Blessing on the friendly target, increasing total stats by 10% for 10 min.  Players may only have one Blessing on them per Paladin at any one time.",
                
                spellIds: [
                    20217
                ],
                rankDescriptions: [
                    "Places a Blessing on the friendly target, increasing total stats by 10% for 10 min.  Players may only have one Blessing on them per Paladin at any one time."
                ]
            },
            {
                id: 11,
                name: "Pursuit of Justice",
                icon: "spell_holy_persuitofjustice",
                ranks: 2,
                row: 3,
                col: 4,
                description: "Increases movement and mounted movement speed by 4%.  This does not stack with other movement speed increasing effects.",
                
                fullDescription: "Increases movement and mounted movement speed by 4%.  This does not stack with other movement speed increasing effects.",
                
                spellIds: [
                    26022,
                    26023
                ],
                rankDescriptions: [
                    "Increases movement and mounted movement speed by 4%.  This does not stack with other movement speed increasing effects.",
                    "Increases movement and mounted movement speed by 8%.  This does not stack with other movement speed increasing effects."
                ]
            },
            {
                id: 12,
                name: "Two-Handed Weapon Specialization",
                icon: "inv_hammer_04",
                ranks: 3,
                row: 4,
                col: 1,
                description: "Increases the damage you deal with two-handed melee weapons by 2%, and your weapon skill with two-handed swords, maces and axes by 1.",
                
                fullDescription: "Increases the damage you deal with two-handed melee weapons by 2%, and your weapon skill with two-handed swords, maces and axes by 1.",
                
                spellIds: [
                    20111,
                    20112,
                    20113
                ],
                rankDescriptions: [
                    "Increases the damage you deal with two-handed melee weapons by 2%, and your weapon skill with two-handed swords, maces and axes by 1.",
                    "Increases the damage you deal with two-handed melee weapons by 4%, and your weapon skill with two-handed swords, maces and axes by 2.",
                    "Increases the damage you deal with two-handed melee weapons by 6%, and your weapon skill with two-handed swords, maces and axes by 3."
                ]
            },
            {
                id: 14,
                name: "Vindication",
                icon: "spell_holy_vindication",
                ranks: 3,
                row: 4,
                col: 3,
                description: "Gives the Paladin's damaging melee attacks a chance to reduce the target's damage dealt by 6% for 10 sec. Only affects targets of level  or lower.",
                
                fullDescription: "Gives the Paladin's damaging melee attacks a chance to reduce the target's damage dealt by 6% for 10 sec. Only affects targets of level  or lower.",
                
                spellIds: [
                    9452,
                    26016,
                    26021
                ],
                rankDescriptions: [
                    "Gives the Paladin's damaging melee attacks a chance to reduce the target's damage dealt by 6% for 10 sec. Only affects targets of level  or lower.",
                    "Gives the Paladin's damaging melee attacks a chance to reduce the target's damage dealt by 9% for 10 sec. Only affects targets of level  or lower.",
                    "Gives the Paladin's damaging melee attacks a chance to reduce the target's damage dealt by 6% for 10 sec. Only affects targets of level  or lower."
                ]
            },
            {
                id: 16,
                name: "Eye for an Eye",
                icon: "spell_holy_eyeforaneye",
                ranks: 2,
                row: 5,
                col: 1,
                description: "All spell criticals against you cause 15% of the damage taken to the caster as well.  The damage caused by Eye for an Eye will not exceed 50% of the Paladin's total health.",
                
                fullDescription: "All spell criticals against you cause 15% of the damage taken to the caster as well.  The damage caused by Eye for an Eye will not exceed 50% of the Paladin's total health.",
                
                spellIds: [
                    9799,
                    25988
                ],
                rankDescriptions: [
                    "All spell criticals against you cause 15% of the damage taken to the caster as well.  The damage caused by Eye for an Eye will not exceed 50% of the Paladin's total health.",
                    "All spell criticals against you cause 30% of the damage taken to the caster as well.  The damage caused by Eye for an Eye will not exceed 50% of the Paladin's total health."
                ]
            },
            {
                id: 17,
                name: "Vengeance",
                icon: "ability_racial_avatar",
                ranks: 5,
                row: 5,
                col: 2,
                requires: 9,
                description: "Gives you a 1% bonus to all damage you deal and decreases threat you generate by 2% for 30 sec after dealing a critical strike from a weapon swing, spell, or ability. This effect stacks up to 3 times. Threat reduction does not apply if the Paladin is under the effect of Righteous Fury.",
                
                fullDescription: "Gives you a 1% bonus to all damage you deal and decreases threat you generate by 2% for 30 sec after dealing a critical strike from a weapon swing, spell, or ability. This effect stacks up to 3 times. Threat reduction does not apply if the Paladin is under the effect of Righteous Fury.",
                
                spellIds: [
                    20049,
                    20056,
                    20057,
                    20058,
                    20059
                ],
                rankDescriptions: [
                    "Gives you a 1% bonus to all damage you deal and decreases threat you generate by 2% for 30 sec after dealing a critical strike from a weapon swing, spell, or ability. This effect stacks up to 3 times. Threat reduction does not apply if the Paladin is under the effect of Righteous Fury.",
                    "Gives you a 1% bonus to all damage you deal and decreases threat you generate by 2% for 30 sec after dealing a critical strike from a weapon swing, spell, or ability. This effect stacks up to 3 times. Threat reduction does not apply if the Paladin is under the effect of Righteous Fury.",
                    "Gives you a 1% bonus to all damage you deal and decreases threat you generate by 2% for 30 sec after dealing a critical strike from a weapon swing, spell, or ability. This effect stacks up to 3 times. Threat reduction does not apply if the Paladin is under the effect of Righteous Fury.",
                    "Gives you a 1% bonus to all damage you deal and decreases threat you generate by 2% for 30 sec after dealing a critical strike from a weapon swing, spell, or ability. This effect stacks up to 3 times. Threat reduction does not apply if the Paladin is under the effect of Righteous Fury.",
                    "Gives you a 1% bonus to all damage you deal and decreases threat you generate by 2% for 30 sec after dealing a critical strike from a weapon swing, spell, or ability. This effect stacks up to 3 times. Threat reduction does not apply if the Paladin is under the effect of Righteous Fury."
                ]
            },
            {
                id: 18,
                name: "Seal of Command",
                icon: "ability_warrior_innerrage",
                ranks: 1,
                row: 5,
                col: 3,
                description: "Gives the Paladin a chance to deal additional Holy damage equal to 70% of melee damage.  Only one Seal can be active on the Paladin at any one time.  Lasts 30 sec.\\\\n\\\\nUnleashing this Seal's energy will judge an enemy, instantly causing 93 to 102 Holy damage, 93 to 102 if the target is stunned or incapacitated. This damage is increased by 15% of your attack power.",
                
                fullDescription: "Gives the Paladin a chance to deal additional Holy damage equal to 70% of melee damage.  Only one Seal can be active on the Paladin at any one time.  Lasts 30 sec.\\\\n\\\\nUnleashing this Seal's energy will judge an enemy, instantly causing 93 to 102 Holy damage, 93 to 102 if the target is stunned or incapacitated. This damage is increased by 15% of your attack power.",
                
                spellIds: [
                    20375
                ],
                rankDescriptions: [
                    "Gives the Paladin a chance to deal additional Holy damage equal to 70% of melee damage.  Only one Seal can be active on the Paladin at any one time.  Lasts 30 sec.\\\\n\\\\nUnleashing this Seal's energy will judge an enemy, instantly causing 93 to 102 Holy damage, 93 to 102 if the target is stunned or incapacitated. This damage is increased by 15% of your attack power."
                ]
            },
            {
                id: 21,
                name: "Vengeful Strikes",
                icon: "spell_holy_crusaderstrike",
                ranks: 5,
                row: 6,
                col: 2,
                description: "Crusader Strike deals an additional 2% damage and Zeal increases your attack and casting speed by an additional 2% per stack.\\r\\\\nHoly Strike infuses you with Holy Might, increasing your Strength by 4% for 20 sec.",
                
                fullDescription: "Crusader Strike deals an additional 2% damage and Zeal increases your attack and casting speed by an additional 2% per stack.\\r\\\\nHoly Strike infuses you with Holy Might, increasing your Strength by 4% for 20 sec.",
                
                spellIds: [
                    51355,
                    51356,
                    51357,
                    51358,
                    51359
                ],
                rankDescriptions: [
                    "Crusader Strike deals an additional 2% damage and Zeal increases your attack and casting speed by an additional 2% per stack.\\r\\\\nHoly Strike infuses you with Holy Might, increasing your Strength by 4% for 20 sec.",
                    "Crusader Strike deals an additional 4% damage and Zeal increases your attack and casting speed by an additional 2% per stack.\\r\\\\nHoly Strike infuses you with Holy Might, increasing your Strength by 8% for 20 sec.",
                    "Crusader Strike deals an additional 6% damage and Zeal increases your attack and casting speed by an additional 2% per stack.\\r\\\\nHoly Strike infuses you with Holy Might, increasing your Strength by 12% for 20 sec.",
                    "Crusader Strike deals an additional 8% damage and Zeal increases your attack and casting speed by an additional 2% per stack.\\r\\\\nHoly Strike infuses you with Holy Might, increasing your Strength by 16% for 20 sec.",
                    "Crusader Strike deals an additional 10% damage and Zeal increases your attack and casting speed by an additional 2% per stack.\\r\\\\nHoly Strike infuses you with Holy Might, increasing your Strength by 20% for 20 sec."
                ]
            },
            {
                id: 25,
                name: "Repentance",
                icon: "spell_holy_prayerofhealing",
                ranks: 1,
                row: 7,
                col: 2,
                description: "Puts the enemy target in a state of meditation, incapacitating them for up to 6 sec.  Any damage caused will awaken the target.\\\\n\\\\nIf the target is immune to the effect, they repent for their sins, taking 80 Holy damage each time they perform a melee attack for 20 sec.",
                
                fullDescription: "Puts the enemy target in a state of meditation, incapacitating them for up to 6 sec.  Any damage caused will awaken the target.\\\\n\\\\nIf the target is immune to the effect, they repent for their sins, taking 80 Holy damage each time they perform a melee attack for 20 sec.",
                
                spellIds: [
                    20066
                ],
                rankDescriptions: [
                    "Puts the enemy target in a state of meditation, incapacitating them for up to 6 sec.  Any damage caused will awaken the target.\\\\n\\\\nIf the target is immune to the effect, they repent for their sins, taking 80 Holy damage each time they perform a melee attack for 20 sec."
                ]
            }
        ],
    },
};
