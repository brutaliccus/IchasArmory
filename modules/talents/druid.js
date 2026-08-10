// Druid talents for Turtle WoW
export const druidTalents = {
    balance: {
        name: "Balance",
        icon: "spell_nature_abolishmagic",
        talents: [
            {
                id: 0,
                name: "Improved Wrath",
                icon: "spell_nature_abolishmagic",
                ranks: 5,
                row: 1,
                col: 1,
                description: "Reduces the cast time and global cooldown of your Wrath spell by 0.1 sec.",
                fullDescription: "Reduces the cast time and global cooldown of your Wrath spell by 0.1 sec.",
                spellIds: [
                    16814,
                    16815,
                    16816,
                    16817,
                    16818
                ],
                rankDescriptions: [
                    "Reduces the cast time and global cooldown of your Wrath spell by 0.1 sec.",
                    "Reduces the cast time and global cooldown of your Wrath spell by 0.2 sec.",
                    "Reduces the cast time and global cooldown of your Wrath spell by 0.3 sec.",
                    "Reduces the cast time and global cooldown of your Wrath spell by 0.4 sec.",
                    "Reduces the cast time and global cooldown of your Wrath spell by 0.5 sec."
                ]
            },
            {
                id: 1,
                name: "Nature's Grasp",
                icon: "spell_nature_natureswrath",
                ranks: 1,
                row: 1,
                col: 2,
                description: "While active, any time an enemy strikes the caster they have a 35% chance to become afflicted by Entangling Roots (Rank 1).  Only useable outdoors.  1 charge.  Lasts 45 sec.",
                fullDescription: "While active, any time an enemy strikes the caster they have a 35% chance to become afflicted by Entangling Roots (Rank 1).  Only useable outdoors.  1 charge.  Lasts 45 sec.",
                spellIds: [
                    16689
                ],
                rankDescriptions: [
                    "While active, any time an enemy strikes the caster they have a 35% chance to become afflicted by Entangling Roots (Rank 1).  Only useable outdoors.  1 charge.  Lasts 45 sec."
                ]
            },
            {
                id: 2,
                name: "Improved Nature's Grasp",
                icon: "spell_nature_natureswrath",
                ranks: 4,
                row: 1,
                col: 3,
                description: "Increases the chance for your Nature's Grasp to entangle an enemy by 15%.",
                fullDescription: "Increases the chance for your Nature's Grasp to entangle an enemy by 15%.",
                spellIds: [
                    17245,
                    17247,
                    17248,
                    17249
                ],
                rankDescriptions: [
                    "Increases the chance for your Nature's Grasp to entangle an enemy by 15%.",
                    "Increases the chance for your Nature's Grasp to entangle an enemy by 30%.",
                    "Increases the chance for your Nature's Grasp to entangle an enemy by 45%.",
                    "Increases the chance for your Nature's Grasp to entangle an enemy by 65%."
                ],
                requires: 1,
                reqRanks: 1
            },
            {
                id: 3,
                name: "Sylvan Blessing",
                icon: "inv_misc_gem_emerald_01",
                ranks: 2,
                row: 1,
                col: 4,
                description: "Gives you a 50% chance after killing a target that yields experience or honor to allow your Mana to regenerate at a 100% rate while casting.  Lasts 15 sec.",
                fullDescription: "Gives you a 50% chance after killing a target that yields experience or honor to allow your Mana to regenerate at a 100% rate while casting.  Lasts 15 sec.",
                spellIds: [
                    51421,
                    51422
                ],
                rankDescriptions: [
                    "Gives you a 50% chance after killing a target that yields experience or honor to allow your Mana to regenerate at a 100% rate while casting.  Lasts 15 sec.",
                    "Gives you a 100% chance after killing a target that yields experience or honor to allow your Mana to regenerate at a 100% rate while casting.  Lasts 15 sec."
                ]
            },
            {
                id: 4,
                name: "Guidance of the Dream",
                icon: "spell_nature_sleep",
                ranks: 3,
                row: 2,
                col: 1,
                description: "Gives you a 23% chance to avoid interruption caused by damage while casting your Balance spells.",
                fullDescription: "Gives you a 23% chance to avoid interruption caused by damage while casting your Balance spells.",
                spellIds: [
                    51423,
                    51424,
                    51425
                ],
                rankDescriptions: [
                    "Gives you a 23% chance to avoid interruption caused by damage while casting your Balance spells.",
                    "Gives you a 46% chance to avoid interruption caused by damage while casting your Balance spells.",
                    "Gives you a 70% chance to avoid interruption caused by damage while casting your Balance spells."
                ]
            },
            {
                id: 5,
                name: "Improved Moonfire",
                icon: "spell_nature_starfall",
                ranks: 2,
                row: 2,
                col: 2,
                description: "Increases the damage and critical strike chance of your Moonfire spell by 5%.",
                fullDescription: "Increases the damage and critical strike chance of your Moonfire spell by 5%.",
                spellIds: [
                    16821,
                    16822
                ],
                rankDescriptions: [
                    "Increases the damage and critical strike chance of your Moonfire spell by 5%.",
                    "Increases the damage and critical strike chance of your Moonfire spell by 10%."
                ]
            },
            {
                id: 6,
                name: "Natural Weapons",
                icon: "inv_staff_01",
                ranks: 3,
                row: 2,
                col: 3,
                description: "Increases the damage you deal with physical attacks in all forms by 3%. Also increases chance to hit with melee attacks and spells by 1%.",
                fullDescription: "Increases the damage you deal with physical attacks in all forms by 3%. Also increases chance to hit with melee attacks and spells by 1%.",
                spellIds: [
                    45715,
                    45716,
                    45717
                ],
                rankDescriptions: [
                    "Increases the damage you deal with physical attacks in all forms by 3%. Also increases chance to hit with melee attacks and spells by 1%.",
                    "Increases the damage you deal with physical attacks in all forms by 6%. Also increases chance to hit with melee attacks and spells by 2%.",
                    "Increases the damage you deal with physical attacks in all forms by 10%. Also increases chance to hit with melee attacks and spells by 3%."
                ]
            },
            {
                id: 7,
                name: "Natural Shapeshifter",
                icon: "spell_nature_wispsplode",
                ranks: 3,
                row: 2,
                col: 4,
                description: "Reduces the mana cost of all shapeshifting by 10%.",
                fullDescription: "Reduces the mana cost of all shapeshifting by 10%.",
                spellIds: [
                    16833,
                    16834,
                    16835
                ],
                rankDescriptions: [
                    "Reduces the mana cost of all shapeshifting by 10%.",
                    "Reduces the mana cost of all shapeshifting by 20%.",
                    "Reduces the mana cost of all shapeshifting by 30%."
                ]
            },
            {
                id: 8,
                name: "Moonfury",
                icon: "spell_nature_moonglow",
                ranks: 3,
                row: 3,
                col: 1,
                description: "Increases the damage of your Starfire, Moonfire, Hurricane, Insect Swarm, and Wrath spells by 4%.",
                fullDescription: "Increases the damage of your Starfire, Moonfire, Hurricane, Insect Swarm, and Wrath spells by 4%.",
                spellIds: [
                    16896,
                    16897,
                    16899
                ],
                rankDescriptions: [
                    "Increases the damage of your Starfire, Moonfire, Hurricane, Insect Swarm, and Wrath spells by 4%.",
                    "Increases the damage of your Starfire, Moonfire, Hurricane, Insect Swarm, and Wrath spells by 8%.",
                    "Increases the damage of your Starfire, Moonfire, Hurricane, Insect Swarm, and Wrath spells by 12%."
                ]
            },
            {
                id: 10,
                name: "Omen of Clarity",
                icon: "spell_nature_crystalball",
                ranks: 1,
                row: 3,
                col: 3,
                description: "Imbues the Druid with natural energy.  Each of the Druid's melee attacks or offensive spell casts has a chance of causing the caster to enter a Clearcasting state.  The Clearcasting state reduces the Mana, Rage or Energy cost of your next damage or healing spell or offensive ability by 100%.",
                fullDescription: "Imbues the Druid with natural energy.  Each of the Druid's melee attacks or offensive spell casts has a chance of causing the caster to enter a Clearcasting state.  The Clearcasting state reduces the Mana, Rage or Energy cost of your next damage or healing spell or offensive ability by 100%.",
                spellIds: [
                    16864
                ],
                rankDescriptions: [
                    "Imbues the Druid with natural energy.  Each of the Druid's melee attacks or offensive spell casts has a chance of causing the caster to enter a Clearcasting state.  The Clearcasting state reduces the Mana, Rage or Energy cost of your next damage or healing spell or offensive ability by 100%."
                ],
                requires: 6,
                reqRanks: 3
            },
            {
                id: 11,
                name: "Nature's Reach",
                icon: "spell_nature_naturetouchgrow",
                ranks: 2,
                row: 3,
                col: 4,
                description: "Increases the range of your Wrath, Entangling Roots, Faerie Fire, Moonfire, Starfire, Insect Swarm, Hurricane, Remove Curse, Abolish Poison, and Cure Poison spells by 10%.",
                fullDescription: "Increases the range of your Wrath, Entangling Roots, Faerie Fire, Moonfire, Starfire, Insect Swarm, Hurricane, Remove Curse, Abolish Poison, and Cure Poison spells by 10%.",
                spellIds: [
                    16819,
                    16820
                ],
                rankDescriptions: [
                    "Increases the range of your Wrath, Entangling Roots, Faerie Fire, Moonfire, Starfire, Insect Swarm, Hurricane, Remove Curse, Abolish Poison, and Cure Poison spells by 10%.",
                    "Increases the range of your Wrath, Entangling Roots, Faerie Fire, Moonfire, Starfire, Insect Swarm, Hurricane, Remove Curse, Abolish Poison, and Cure Poison spells by 20%."
                ]
            },
            {
                id: 13,
                name: "Vengeance",
                icon: "spell_nature_purge",
                ranks: 5,
                row: 4,
                col: 2,
                description: "Increases the critical strike damage bonus of your Starfire, Moonfire, and Wrath spells by 20%.",
                fullDescription: "Increases the critical strike damage bonus of your Starfire, Moonfire, and Wrath spells by 20%.",
                spellIds: [
                    16909,
                    16910,
                    16911,
                    16912,
                    16913
                ],
                rankDescriptions: [
                    "Increases the critical strike damage bonus of your Starfire, Moonfire, and Wrath spells by 20%.",
                    "Increases the critical strike damage bonus of your Starfire, Moonfire, and Wrath spells by 40%.",
                    "Increases the critical strike damage bonus of your Starfire, Moonfire, and Wrath spells by 60%.",
                    "Increases the critical strike damage bonus of your Starfire, Moonfire, and Wrath spells by 80%.",
                    "Increases the critical strike damage bonus of your Starfire, Moonfire, and Wrath spells by 100%."
                ],
                requires: 5,
                reqRanks: 2
            },
            {
                id: 14,
                name: "Moonglow",
                icon: "spell_nature_sentinal",
                ranks: 3,
                row: 4,
                col: 3,
                description: "Reduces the Mana cost of your Moonfire, Starfire, Wrath, Hurricane, Insect Swarm, Healing Touch, Regrowth and Rejuvenation spells by 3%.",
                fullDescription: "Reduces the Mana cost of your Moonfire, Starfire, Wrath, Hurricane, Insect Swarm, Healing Touch, Regrowth and Rejuvenation spells by 3%.",
                spellIds: [
                    16845,
                    16846,
                    16847
                ],
                rankDescriptions: [
                    "Reduces the Mana cost of your Moonfire, Starfire, Wrath, Hurricane, Insect Swarm, Healing Touch, Regrowth and Rejuvenation spells by 3%.",
                    "Reduces the Mana cost of your Moonfire, Starfire, Wrath, Hurricane, Insect Swarm, Healing Touch, Regrowth and Rejuvenation spells by 6%.",
                    "Reduces the Mana cost of your Moonfire, Starfire, Wrath, Hurricane, Insect Swarm, Healing Touch, Regrowth and Rejuvenation spells by 9%."
                ]
            },
            {
                id: 16,
                name: "Owlkin Frenzy",
                icon: "ability_druid_owlkinfrenzy",
                ranks: 3,
                row: 5,
                col: 1,
                description: "Damage taken while in Moonkin Form has a 10% chance to enrage you, granting a 30% chance to avoid interruption caused by damage while casting and regenerating 1% of your maximum mana per second for 10 sec. This effect can only trigger once every 30 seconds.",
                fullDescription: "Damage taken while in Moonkin Form has a 10% chance to enrage you, granting a 30% chance to avoid interruption caused by damage while casting and regenerating 1% of your maximum mana per second for 10 sec. This effect can only trigger once every 30 seconds.",
                spellIds: [
                    45734,
                    51426,
                    51429
                ],
                rankDescriptions: [
                    "Damage taken while in Moonkin Form has a 10% chance to enrage you, granting a 30% chance to avoid interruption caused by damage while casting and regenerating 1% of your maximum mana per second for 10 sec. This effect can only trigger once every 30 seconds.",
                    "Damage taken while in Moonkin Form has a 10% chance to enrage you, granting a 30% chance to avoid interruption caused by damage while casting and regenerating 1% of your maximum mana per second for 10 sec. This effect can only trigger once every 25 seconds."
                ],
                requires: 17,
                reqRanks: 1
            },
            {
                id: 17,
                name: "Moonkin Form",
                icon: "spell_nature_forceofnature",
                ranks: 1,
                row: 5,
                col: 2,
                description: "Transforms the Druid into Moonkin Form. While in this form the armor contribution from items is increased by 180%, the Mana cost of your Balance spells is reduced by 20%, and all party members within 30 yards have their spell critical chance increased by 3%. The Moonkin can only cast Balance spells, Innervate, and Remove Curse while shapeshifted. The act of shapeshifting frees the caster of Polymorph and Movement Impairing effects.",
                fullDescription: "Transforms the Druid into Moonkin Form. While in this form the armor contribution from items is increased by 180%, the Mana cost of your Balance spells is reduced by 20%, and all party members within 30 yards have their spell critical chance increased by 3%. The Moonkin can only cast Balance spells, Innervate, and Remove Curse while shapeshifted. The act of shapeshifting frees the caster of Polymorph and Movement Impairing effects.",
                spellIds: [
                    24858
                ],
                rankDescriptions: [
                    "Transforms the Druid into Moonkin Form. While in this form the armor contribution from items is increased by 180%, the Mana cost of your Balance spells is reduced by 20%, and all party members within 30 yards have their spell critical chance increased by 3%. The Moonkin can only cast Balance spells, Innervate, and Remove Curse while shapeshifted. The act of shapeshifting frees the caster of Polymorph and Movement Impairing effects."
                ]
            },
            {
                id: 18,
                name: "Nature's Grace",
                icon: "spell_nature_naturesblessing",
                ranks: 1,
                row: 5,
                col: 3,
                description: "All spell criticals grace you with a blessing of nature, reducing the casting time of your next spell by 0.5 sec.",
                fullDescription: "All spell criticals grace you with a blessing of nature, reducing the casting time of your next spell by 0.5 sec.",
                spellIds: [
                    16880
                ],
                rankDescriptions: [
                    "All spell criticals grace you with a blessing of nature, reducing the casting time of your next spell by 0.5 sec."
                ],
                requires: 14,
                reqRanks: 3
            },
            {
                id: 19,
                name: "Improved Starfire",
                icon: "spell_arcane_starfire",
                ranks: 3,
                row: 5,
                col: 4,
                description: "Reduces the cast time of Starfire by 0.17 sec and gives it a 5% chance to stun the target for 3 sec.",
                fullDescription: "Reduces the cast time of Starfire by 0.17 sec and gives it a 5% chance to stun the target for 3 sec.",
                spellIds: [
                    45743,
                    45744,
                    45745
                ],
                rankDescriptions: [
                    "Reduces the cast time of Starfire by 0.17 sec and gives it a 5% chance to stun the target for 3 sec.",
                    "Reduces the cast time of Starfire by 0.34 sec and gives it a 10% chance to stun the target for 3 sec.",
                    "Reduces the cast time of Starfire by 0.5 sec and gives it a 15% chance to stun the target for 3 sec."
                ]
            },
            {
                id: 21,
                name: "Balance of All Things",
                icon: "ability_druid_manatree",
                ranks: 5,
                row: 6,
                col: 2,
                description: "Gives your Insect Swarm spell a 6% chance to reduce the cast time of your next Starfire by 0.5 sec.\r\\n\r\\nGives your Moonfire spell a 6% chance to reduce the mana cost of your next Wrath by 50%.\r\\n\r\\nIncreases the critical strike chance of your Starfire spell by up to 9%.",
                fullDescription: "Gives your Insect Swarm spell a 6% chance to reduce the cast time of your next Starfire by 0.5 sec.\r\\n\r\\nGives your Moonfire spell a 6% chance to reduce the mana cost of your next Wrath by 50%.\r\\n\r\\nIncreases the critical strike chance of your Starfire spell by up to 9%.",
                spellIds: [
                    51433,
                    51434,
                    51435,
                    51436,
                    51437
                ],
                rankDescriptions: [
                    "Gives your Insect Swarm spell a 6% chance to reduce the cast time of your next Starfire by 0.5 sec.\r\\n\r\\nGives your Moonfire spell a 6% chance to reduce the mana cost of your next Wrath by 50%.\r\\n\r\\nIncreases the critical strike chance of your Starfire spell by 3%.",
                    "Gives your Insect Swarm spell a 12% chance to reduce the cast time of your next Starfire by 0.5 sec.\r\\n\r\\nGives your Moonfire spell a 12% chance to reduce the mana cost of your next Wrath by 50%.\r\\n\r\\nIncreases the critical strike chance of your Starfire spell by 6%.",
                    "Gives your Insect Swarm spell a 18% chance to reduce the cast time of your next Starfire by 0.5 sec.\r\\n\r\\nGives your Moonfire spell a 18% chance to reduce the mana cost of your next Wrath by 50%.\r\\n\r\\nIncreases the critical strike chance of your Starfire spell by 9%.",
                    "Gives your Insect Swarm spell a 24% chance to reduce the cast time of your next Starfire by 0.5 sec.\r\\n\r\\nGives your Moonfire spell a 24% chance to reduce the mana cost of your next Wrath by 50%.\r\\n\r\\nIncreases the critical strike chance of your Starfire spell by 9%.",
                    "Gives your Insect Swarm spell a 30% chance to reduce the cast time of your next Starfire by 0.5 sec.\r\\n\r\\nGives your Moonfire spell a 30% chance to reduce the mana cost of your next Wrath by 50%.\r\\n\r\\nIncreases the critical strike chance of your Starfire spell by 9%."
                ]
            },
            {
                id: 22,
                name: "Gale Winds",
                icon: "ability_druid_galewinds",
                ranks: 2,
                row: 6,
                col: 3,
                description: "Reduces the mana cost of Hurricane by 10% and causes it to reduce the attack speed of affected enemies by 12%.",
                fullDescription: "Reduces the mana cost of Hurricane by 10% and causes it to reduce the attack speed of affected enemies by 12%.",
                spellIds: [
                    51440,
                    51441
                ],
                rankDescriptions: [
                    "Reduces the mana cost of Hurricane by 10% and causes it to reduce the attack speed of affected enemies by 12%.",
                    "Reduces the mana cost of Hurricane by 20% and causes it to reduce the attack speed of affected enemies by 25%."
                ]
            },
            {
                id: 25,
                name: "Eclipse",
                icon: "ability_druid_eclipse",
                ranks: 1,
                row: 7,
                col: 2,
                description: "Aligns natural and astral energies. Damage from Wrath has a 40% chance to grant Arcane Eclipse, increasing Arcane damage dealt. Damage from Starfire has a 60% chance to grant Nature Eclipse, increasing Nature damage dealt.\\n\\nThe damage bonus is 10% plus 60% of your spell critical strike chance. Each effect lasts 15 sec and has its own 30 sec cooldown. Only one Eclipse can be active at a time.",
                fullDescription: "Aligns natural and astral energies. Damage from Wrath has a 40% chance to grant Arcane Eclipse, increasing Arcane damage dealt. Damage from Starfire has a 60% chance to grant Nature Eclipse, increasing Nature damage dealt.\\n\\nThe damage bonus is 10% plus 60% of your spell critical strike chance. Each effect lasts 15 sec and has its own 30 sec cooldown. Only one Eclipse can be active at a time.",
                spellIds: [
                    51444
                ],
                rankDescriptions: [
                    "Aligns natural and astral energies. Damage from Wrath has a 40% chance to grant Arcane Eclipse, increasing Arcane damage dealt. Damage from Starfire has a 60% chance to grant Nature Eclipse, increasing Nature damage dealt.\\n\\nThe damage bonus is 10% plus 60% of your spell critical strike chance. Each effect lasts 15 sec and has its own 30 sec cooldown. Only one Eclipse can be active at a time."
                ]
            }
        ]
    },
    feralCombat: {
        name: "Feral Combat",
        icon: "ability_hunter_pet_hyena",
        talents: [
            {
                id: 1,
                name: "Ferocity",
                icon: "ability_hunter_pet_hyena",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Reduces the cost of your Maul, Swipe, Savage Bite, Claw, and Rake abilities by 1 Rage or Energy.",
                fullDescription: "Reduces the cost of your Maul, Swipe, Savage Bite, Claw, and Rake abilities by 1 Rage or Energy.",
                spellIds: [
                    16934,
                    16935,
                    16936,
                    16937,
                    16938
                ],
                rankDescriptions: [
                    "Reduces the cost of your Maul, Swipe, Savage Bite, Claw, and Rake abilities by 1 Rage or Energy.",
                    "Reduces the cost of your Maul, Swipe, Savage Bite, Claw, and Rake abilities by 2 Rage or Energy.",
                    "Reduces the cost of your Maul, Swipe, Savage Bite, Claw, and Rake abilities by 3 Rage or Energy.",
                    "Reduces the cost of your Maul, Swipe, Savage Bite, Claw, and Rake abilities by 4 Rage or Energy.",
                    "Reduces the cost of your Maul, Swipe, Savage Bite, Claw, and Rake abilities by 5 Rage or Energy."
                ]
            },
            {
                id: 2,
                name: "Feral Aggression",
                icon: "ability_druid_demoralizingroar",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Increases the Attack Power reduction of your Demoralizing Roar by 8% and the damage caused by your Ferocious Bite by 3%.",
                fullDescription: "Increases the Attack Power reduction of your Demoralizing Roar by 8% and the damage caused by your Ferocious Bite by 3%.",
                spellIds: [
                    16858,
                    16859,
                    16860,
                    16861,
                    16862
                ],
                rankDescriptions: [
                    "Increases the Attack Power reduction of your Demoralizing Roar by 8% and the damage caused by your Ferocious Bite by 3%.",
                    "Increases the Attack Power reduction of your Demoralizing Roar by 16% and the damage caused by your Ferocious Bite by 6%.",
                    "Increases the Attack Power reduction of your Demoralizing Roar by 24% and the damage caused by your Ferocious Bite by 9%.",
                    "Increases the Attack Power reduction of your Demoralizing Roar by 32% and the damage caused by your Ferocious Bite by 12%.",
                    "Increases the Attack Power reduction of your Demoralizing Roar by 40% and the damage caused by your Ferocious Bite by 15%."
                ]
            },
            {
                id: 4,
                name: "Feral Instinct",
                icon: "ability_ambush",
                ranks: 3,
                row: 2,
                col: 1,
                description: "Increases threat caused in Bear and Dire Bear Form by 5% and reduces the chance enemies have to detect you while Prowling.",
                fullDescription: "Increases threat caused in Bear and Dire Bear Form by 5% and reduces the chance enemies have to detect you while Prowling.",
                spellIds: [
                    16947,
                    16948,
                    16949
                ],
                rankDescriptions: [
                    "Increases threat caused in Bear and Dire Bear Form by 5% and reduces the chance enemies have to detect you while Prowling.",
                    "Increases threat caused in Bear and Dire Bear Form by 10% and reduces the chance enemies have to detect you while Prowling.",
                    "Increases threat caused in Bear and Dire Bear Form by 15% and reduces the chance enemies have to detect you while Prowling."
                ]
            },
            {
                id: 5,
                name: "Brutal Impact",
                icon: "ability_druid_bash",
                ranks: 2,
                row: 2,
                col: 2,
                description: "Increases the stun duration of your Bash and Pounce abilities by 0.5 sec.",
                fullDescription: "Increases the stun duration of your Bash and Pounce abilities by 0.5 sec.",
                spellIds: [
                    16940,
                    16941
                ],
                rankDescriptions: [
                    "Increases the stun duration of your Bash and Pounce abilities by 0.5 sec.",
                    "Increases the stun duration of your Bash and Pounce abilities by 1.0 sec."
                ]
            },
            {
                id: 6,
                name: "Thick Hide",
                icon: "inv_misc_pelt_bear_03",
                ranks: 3,
                row: 2,
                col: 3,
                description: "Increases your Armor contribution from items by 3%.",
                fullDescription: "Increases your Armor contribution from items by 3%.",
                spellIds: [
                    16929,
                    16930,
                    16931
                ],
                rankDescriptions: [
                    "Increases your Armor contribution from items by 3%.",
                    "Increases your Armor contribution from items by 6%.",
                    "Increases your Armor contribution from items by 10%."
                ]
            },
            {
                id: 7,
                name: "Open Wounds",
                icon: "ability_druid_disembowel",
                ranks: 3,
                row: 2,
                col: 4,
                description: "Increases the damage of Rip by 5%. In addition, increases the damage of Claw by 10% for each active Bleed effect on the target.",
                fullDescription: "Increases the damage of Rip by 5%. In addition, increases the damage of Claw by 10% for each active Bleed effect on the target.",
                spellIds: [
                    51402,
                    51403,
                    51404
                ],
                rankDescriptions: [
                    "Increases the damage of Rip by 5%. In addition, increases the damage of Claw by 10% for each active Bleed effect on the target.",
                    "Increases the damage of Rip by 10%. In addition, increases the damage of Claw by 20% for each active Bleed effect on the target.",
                    "Increases the damage of Rip by 15%. In addition, increases the damage of Claw by 30% for each active Bleed effect on the target."
                ]
            },
            {
                id: 8,
                name: "Feral Swiftness",
                icon: "spell_nature_spiritwolf",
                ranks: 2,
                row: 3,
                col: 1,
                description: "Increases your movement speed by 15% while outdoors in Cat Form and increases your chance to dodge while in Bear, Dire Bear and Cat Form by 2%.",
                fullDescription: "Increases your movement speed by 15% while outdoors in Cat Form and increases your chance to dodge while in Bear, Dire Bear and Cat Form by 2%.",
                spellIds: [
                    17002,
                    24866
                ],
                rankDescriptions: [
                    "Increases your movement speed by 15% while outdoors in Cat Form and increases your chance to dodge while in Bear, Dire Bear and Cat Form by 2%.",
                    "Increases your movement speed by 30% while outdoors in Cat Form and increases your chance to dodge while in Bear, Dire Bear and Cat Form by 4%."
                ]
            },
            {
                id: 9,
                name: "Feral Charge",
                icon: "ability_hunter_pet_bear",
                ranks: 1,
                row: 3,
                col: 2,
                description: "Causes you to charge an enemy, immobilizing and interrupting any spell being cast for 4 sec.",
                fullDescription: "Causes you to charge an enemy, immobilizing and interrupting any spell being cast for 4 sec.",
                spellIds: [
                    16979
                ],
                rankDescriptions: [
                    "Causes you to charge an enemy, immobilizing and interrupting any spell being cast for 4 sec."
                ]
            },
            {
                id: 10,
                name: "Sharpened Claws",
                icon: "inv_misc_monsterclaw_04",
                ranks: 3,
                row: 3,
                col: 3,
                description: "Increases your critical strike chance while in Bear, Dire Bear or Cat Form by 2%.",
                fullDescription: "Increases your critical strike chance while in Bear, Dire Bear or Cat Form by 2%.",
                spellIds: [
                    16942,
                    16943,
                    16944
                ],
                rankDescriptions: [
                    "Increases your critical strike chance while in Bear, Dire Bear or Cat Form by 2%.",
                    "Increases your critical strike chance while in Bear, Dire Bear or Cat Form by 4%.",
                    "Increases your critical strike chance while in Bear, Dire Bear or Cat Form by 6%."
                ]
            },
            {
                id: 11,
                name: "Primal Fury",
                icon: "ability_racial_cannibalize",
                ranks: 2,
                row: 3,
                col: 4,
                description: "Gives you a 50% chance to gain an additional 50 Rage anytime you get a critical strike while in Bear and Dire Bear Form.",
                fullDescription: "Gives you a 50% chance to gain an additional 50 Rage anytime you get a critical strike while in Bear and Dire Bear Form.",
                spellIds: [
                    16958,
                    16961
                ],
                rankDescriptions: [
                    "Gives you a 50% chance to gain an additional 50 Rage anytime you get a critical strike while in Bear and Dire Bear Form.",
                    "Gives you a 100% chance to gain an additional 50 Rage anytime you get a critical strike while in Bear and Dire Bear Form."
                ],
                requires: 10,
                reqRanks: 3
            },
            {
                id: 13,
                name: "Predatory Strikes",
                icon: "ability_hunter_pet_cat",
                ranks: 3,
                row: 4,
                col: 2,
                description: "Increases your melee attack power in Cat, Bear, and Dire Bear Forms by 3%. In addition, increases the damage caused by your Claw, Rake, Maul, Swipe, and Savage Bite abilities by 7%.",
                fullDescription: "Increases your melee attack power in Cat, Bear, and Dire Bear Forms by 3%. In addition, increases the damage caused by your Claw, Rake, Maul, Swipe, and Savage Bite abilities by 7%.",
                spellIds: [
                    16972,
                    16974,
                    16975
                ],
                rankDescriptions: [
                    "Increases your melee attack power in Cat, Bear, and Dire Bear Forms by 3%. In addition, increases the damage caused by your Claw, Rake, Maul, Swipe, and Savage Bite abilities by 7%.",
                    "Increases your melee attack power in Cat, Bear, and Dire Bear Forms by 6%. In addition, increases the damage caused by your Claw, Rake, Maul, Swipe, and Savage Bite abilities by 14%.",
                    "Increases your melee attack power in Cat, Bear, and Dire Bear Forms by 10%. In addition, increases the damage caused by your Claw, Rake, Maul, Swipe, and Savage Bite abilities by 20%."
                ]
            },
            {
                id: 14,
                name: "Blood Frenzy",
                icon: "ability_ghoulfrenzy",
                ranks: 2,
                row: 4,
                col: 3,
                description: "Your Cat Form abilities that generate combo points have a 50% chance to grant an additional combo point on critical strikes.",
                fullDescription: "Your Cat Form abilities that generate combo points have a 50% chance to grant an additional combo point on critical strikes.",
                spellIds: [
                    16952,
                    16954
                ],
                rankDescriptions: [
                    "Your Cat Form abilities that generate combo points have a 50% chance to grant an additional combo point on critical strikes.",
                    "Your Cat Form abilities that generate combo points have a 100% chance to grant an additional combo point on critical strikes."
                ],
                requires: 10,
                reqRanks: 3
            },
            {
                id: 15,
                name: "Improved Shred",
                icon: "spell_shadow_vampiricaura",
                ranks: 2,
                row: 4,
                col: 4,
                description: "Increases the damage of Shred by 5% and reduces its Energy cost by 6.",
                fullDescription: "Increases the damage of Shred by 5% and reduces its Energy cost by 6.",
                spellIds: [
                    16966,
                    16968
                ],
                rankDescriptions: [
                    "Increases the damage of Shred by 5% and reduces its Energy cost by 6.",
                    "Increases the damage of Shred by 10% and reduces its Energy cost by 12."
                ]
            },
            {
                id: 16,
                name: "Ancient Brutality",
                icon: "spell_shadow_unholyfrenzy",
                ranks: 2,
                row: 5,
                col: 1,
                description: "Dodging an attack while in Bear or Dire Bear Form imbues you with the spirit of the Ancients, generating 20 Rage per second for 5 sec. This effect can only occur once every 9 seconds.  While in Cat Form, periodic ticks of your Bleed effects restore 3 Energy.",
                fullDescription: "Dodging an attack while in Bear or Dire Bear Form imbues you with the spirit of the Ancients, generating 20 Rage per second for 5 sec. This effect can only occur once every 9 seconds.  While in Cat Form, periodic ticks of your Bleed effects restore 3 Energy.",
                spellIds: [
                    51415,
                    51416
                ],
                rankDescriptions: [
                    "Dodging an attack while in Bear or Dire Bear Form imbues you with the spirit of the Ancients, generating 20 Rage per second for 5 sec. This effect can only occur once every 9 seconds.  While in Cat Form, periodic ticks of your Bleed effects restore 3 Energy.",
                    "Dodging an attack while in Bear or Dire Bear Form imbues you with the spirit of the Ancients, generating 40 Rage per second for 5 sec. This effect can only occur once every 9 seconds.  While in Cat Form, periodic ticks of your Bleed effects restore 5 Energy."
                ]
            },
            {
                id: 18,
                name: "Berserk",
                icon: "ability_druid_berserk",
                ranks: 1,
                row: 5,
                col: 3,
                description: "Removes all Fear effects and increases your energy regeneration rate by 100% while in Cat form, and increases your total health by 20% while in Bear form. After the effect ends, the health is lost. Effect lasts 20 seconds.",
                fullDescription: "Removes all Fear effects and increases your energy regeneration rate by 100% while in Cat form, and increases your total health by 20% while in Bear form. After the effect ends, the health is lost. Effect lasts 20 seconds.",
                spellIds: [
                    45708
                ],
                rankDescriptions: [
                    "Removes all Fear effects and increases your energy regeneration rate by 100% while in Cat form, and increases your total health by 20% while in Bear form. After the effect ends, the health is lost. Effect lasts 20 seconds."
                ]
            },
            {
                id: 21,
                name: "Heart of the Wild",
                icon: "spell_holy_blessingofagility",
                ranks: 5,
                row: 6,
                col: 2,
                description: "Increases your Intellect by 4%.  In addition, while in Bear or Dire Bear Form your Stamina is increased by 4% and while in Cat Form your Strength is increased by 4%.",
                fullDescription: "Increases your Intellect by 4%.  In addition, while in Bear or Dire Bear Form your Stamina is increased by 4% and while in Cat Form your Strength is increased by 4%.",
                spellIds: [
                    17003,
                    17004,
                    17005,
                    17006,
                    24894
                ],
                rankDescriptions: [
                    "Increases your Intellect by 4%.  In addition, while in Bear or Dire Bear Form your Stamina is increased by 4% and while in Cat Form your Strength is increased by 4%.",
                    "Increases your Intellect by 8%.  In addition, while in Bear or Dire Bear Form your Stamina is increased by 8% and while in Cat Form your Strength is increased by 8%.",
                    "Increases your Intellect by 12%.  In addition, while in Bear or Dire Bear Form your Stamina is increased by 12% and while in Cat Form your Strength is increased by 12%.",
                    "Increases your Intellect by 16%.  In addition, while in Bear or Dire Bear Form your Stamina is increased by 16% and while in Cat Form your Strength is increased by 16%.",
                    "Increases your Intellect by 20%.  In addition, while in Bear or Dire Bear Form your Stamina is increased by 20% and while in Cat Form your Strength is increased by 20%."
                ],
                requires: 13,
                reqRanks: 3
            },
            {
                id: 22,
                name: "Carnage",
                icon: "ability_druid_ravage",
                ranks: 2,
                row: 6,
                col: 3,
                description: "Your Maul, Swipe, and Savage Bite abilities return 5% of their damage as healing to you. In addition, gives your Ferocious Bite a 10% chance per combo point spent to refresh your active Rake and Rip effects and to add an additional combo point.",
                fullDescription: "Your Maul, Swipe, and Savage Bite abilities return 5% of their damage as healing to you. In addition, gives your Ferocious Bite a 10% chance per combo point spent to refresh your active Rake and Rip effects and to add an additional combo point.",
                spellIds: [
                    16998,
                    16999
                ],
                rankDescriptions: [
                    "Your Maul, Swipe, and Savage Bite abilities return 5% of their damage as healing to you. In addition, gives your Ferocious Bite a 10% chance per combo point spent to refresh your active Rake and Rip effects and to add an additional combo point.",
                    "Your Maul, Swipe, and Savage Bite abilities return 10% of their damage as healing to you. In addition, gives your Ferocious Bite a 20% chance per combo point spent to refresh your active Rake and Rip effects and to add an additional combo point."
                ]
            },
            {
                id: 25,
                name: "Leader of the Pack",
                icon: "spell_nature_unyeildingstamina",
                ranks: 1,
                row: 7,
                col: 2,
                description: "While in Cat, Bear or Dire Bear Form, the Leader of the Pack increases ranged and melee critical chance of all party members within 45 yards by 3%.",
                fullDescription: "While in Cat, Bear or Dire Bear Form, the Leader of the Pack increases ranged and melee critical chance of all party members within 45 yards by 3%.",
                spellIds: [
                    17007
                ],
                rankDescriptions: [
                    "While in Cat, Bear or Dire Bear Form, the Leader of the Pack increases ranged and melee critical chance of all party members within 45 yards by 3%."
                ]
            }
        ]
    },
    restoration: {
        name: "Restoration",
        icon: "spell_nature_regeneration",
        talents: [
            {
                id: 1,
                name: "Improved Mark of the Wild",
                icon: "spell_nature_regeneration",
                ranks: 5,
                row: 1,
                col: 2,
                description: "Increases the effects of your Mark of the Wild and Gift of the Wild spells by 7%.",
                fullDescription: "Increases the effects of your Mark of the Wild and Gift of the Wild spells by 7%.",
                spellIds: [
                    17050,
                    17051,
                    17053,
                    17054,
                    17055
                ],
                rankDescriptions: [
                    "Increases the effects of your Mark of the Wild and Gift of the Wild spells by 7%.",
                    "Increases the effects of your Mark of the Wild and Gift of the Wild spells by 14%.",
                    "Increases the effects of your Mark of the Wild and Gift of the Wild spells by 21%.",
                    "Increases the effects of your Mark of the Wild and Gift of the Wild spells by 28%.",
                    "Increases the effects of your Mark of the Wild and Gift of the Wild spells by 35%."
                ]
            },
            {
                id: 2,
                name: "Furor",
                icon: "spell_holy_blessingofstamina",
                ranks: 5,
                row: 1,
                col: 3,
                description: "Gives you 20% chance to gain 100 Rage when you shapeshift into Bear and Dire Bear Form or 40 Energy when you shapeshift into Cat Form.",
                fullDescription: "Gives you 20% chance to gain 100 Rage when you shapeshift into Bear and Dire Bear Form or 40 Energy when you shapeshift into Cat Form.",
                spellIds: [
                    17056,
                    17058,
                    17059,
                    17060,
                    17061
                ],
                rankDescriptions: [
                    "Gives you 20% chance to gain 100 Rage when you shapeshift into Bear and Dire Bear Form or 40 Energy when you shapeshift into Cat Form.",
                    "Gives you 40% chance to gain 100 Rage when you shapeshift into Bear and Dire Bear Form or 40 Energy when you shapeshift into Cat Form.",
                    "Gives you 60% chance to gain 100 Rage when you shapeshift into Bear and Dire Bear Form or 40 Energy when you shapeshift into Cat Form.",
                    "Gives you 80% chance to gain 100 Rage when you shapeshift into Bear and Dire Bear Form or 40 Energy when you shapeshift into Cat Form.",
                    "Gives you 100% chance to gain 100 Rage when you shapeshift into Bear and Dire Bear Form or 40 Energy when you shapeshift into Cat Form."
                ]
            },
            {
                id: 4,
                name: "Improved Healing Touch",
                icon: "spell_nature_healingtouch",
                ranks: 5,
                row: 2,
                col: 1,
                description: "Reduces the cast time of your Healing Touch spell by 0.1 sec.",
                fullDescription: "Reduces the cast time of your Healing Touch spell by 0.1 sec.",
                spellIds: [
                    17069,
                    17070,
                    17071,
                    17072,
                    17073
                ],
                rankDescriptions: [
                    "Reduces the cast time of your Healing Touch spell by 0.1 sec.",
                    "Reduces the cast time of your Healing Touch spell by 0.2 sec.",
                    "Reduces the cast time of your Healing Touch spell by 0.3 sec.",
                    "Reduces the cast time of your Healing Touch spell by 0.4 sec.",
                    "Reduces the cast time of your Healing Touch spell by 0.5 sec."
                ]
            },
            {
                id: 5,
                name: "Nature's Focus",
                icon: "spell_nature_healingwavegreater",
                ranks: 5,
                row: 2,
                col: 2,
                description: "Gives you a 14% chance to avoid interruption caused by damage while casting the Healing Touch, Regrowth, and Tranquility spells.",
                fullDescription: "Gives you a 14% chance to avoid interruption caused by damage while casting the Healing Touch, Regrowth, and Tranquility spells.",
                spellIds: [
                    17063,
                    17065,
                    17066,
                    17067,
                    17068
                ],
                rankDescriptions: [
                    "Gives you a 14% chance to avoid interruption caused by damage while casting the Healing Touch, Regrowth, and Tranquility spells.",
                    "Gives you a 28% chance to avoid interruption caused by damage while casting the Healing Touch, Regrowth, and Tranquility spells.",
                    "Gives you a 42% chance to avoid interruption caused by damage while casting the Healing Touch, Regrowth, and Tranquility spells.",
                    "Gives you a 56% chance to avoid interruption caused by damage while casting the Healing Touch, Regrowth, and Tranquility spells.",
                    "Gives you a 70% chance to avoid interruption caused by damage while casting the Healing Touch, Regrowth, and Tranquility spells."
                ]
            },
            {
                id: 6,
                name: "Subtlety",
                icon: "ability_eyeoftheowl",
                ranks: 5,
                row: 2,
                col: 3,
                description: "Reduces the threat generated by your spells by 4%.",
                fullDescription: "Reduces the threat generated by your spells by 4%.",
                spellIds: [
                    17118,
                    17119,
                    17120,
                    17121,
                    17122
                ],
                rankDescriptions: [
                    "Reduces the threat generated by your spells by 4%.",
                    "Reduces the threat generated by your spells by 8%.",
                    "Reduces the threat generated by your spells by 12%.",
                    "Reduces the threat generated by your spells by 16%.",
                    "Reduces the threat generated by your spells by 20%."
                ]
            },
            {
                id: 9,
                name: "Swiftmend",
                icon: "inv_relics_idolofrejuvenation",
                ranks: 1,
                row: 3,
                col: 2,
                description: "Consumes a Rejuvenation or Regrowth effect on a friendly target to instantly heal them an amount equal to 12 sec. of Rejuvenation or 18 sec. of Regrowth.",
                fullDescription: "Consumes a Rejuvenation or Regrowth effect on a friendly target to instantly heal them an amount equal to 12 sec. of Rejuvenation or 18 sec. of Regrowth.",
                spellIds: [
                    18562
                ],
                rankDescriptions: [
                    "Consumes a Rejuvenation or Regrowth effect on a friendly target to instantly heal them an amount equal to 12 sec. of Rejuvenation or 18 sec. of Regrowth."
                ]
            },
            {
                id: 10,
                name: "Genesis",
                icon: "btnorbofdepths",
                ranks: 3,
                row: 3,
                col: 3,
                description: "Increases the damage and healing of your periodic magical spells and effects by 5%.",
                fullDescription: "Increases the damage and healing of your periodic magical spells and effects by 5%.",
                spellIds: [
                    17111,
                    17112,
                    17113
                ],
                rankDescriptions: [
                    "Increases the damage and healing of your periodic magical spells and effects by 5%.",
                    "Increases the damage and healing of your periodic magical spells and effects by 10%.",
                    "Increases the damage and healing of your periodic magical spells and effects by 15%."
                ]
            },
            {
                id: 11,
                name: "Reflection",
                icon: "spell_frost_windwalkon",
                ranks: 3,
                row: 3,
                col: 4,
                description: "Allows 5% of your Mana regeneration to continue while casting.",
                fullDescription: "Allows 5% of your Mana regeneration to continue while casting.",
                spellIds: [
                    17106,
                    17107,
                    17108
                ],
                rankDescriptions: [
                    "Allows 5% of your Mana regeneration to continue while casting.",
                    "Allows 10% of your Mana regeneration to continue while casting.",
                    "Allows 15% of your Mana regeneration to continue while casting."
                ]
            },
            {
                id: 13,
                name: "Gift of Nature",
                icon: "spell_nature_protectionformnature",
                ranks: 5,
                row: 4,
                col: 2,
                description: "Increases the effectiveness of all healing spells by 2%.",
                fullDescription: "Increases the effectiveness of all healing spells by 2%.",
                spellIds: [
                    17104,
                    24943,
                    24944,
                    24945,
                    24946
                ],
                rankDescriptions: [
                    "Increases the effectiveness of all healing spells by 2%.",
                    "Increases the effectiveness of all healing spells by 4%.",
                    "Increases the effectiveness of all healing spells by 6%.",
                    "Increases the effectiveness of all healing spells by 8%.",
                    "Increases the effectiveness of all healing spells by 10%."
                ]
            },
            {
                id: 15,
                name: "Tranquil Spirit",
                icon: "spell_holy_elunesgrace",
                ranks: 5,
                row: 4,
                col: 4,
                description: "Reduces the mana cost of your Healing Touch, Regrowth and Tranquility spells by 2%.",
                fullDescription: "Reduces the mana cost of your Healing Touch, Regrowth and Tranquility spells by 2%.",
                spellIds: [
                    24968,
                    24969,
                    24970,
                    24972
                ],
                rankDescriptions: [
                    "Reduces the mana cost of your Healing Touch, Regrowth and Tranquility spells by 2%.",
                    "Reduces the mana cost of your Healing Touch, Regrowth and Tranquility spells by 4%.",
                    "Reduces the mana cost of your Healing Touch, Regrowth and Tranquility spells by 6%.",
                    "Reduces the mana cost of your Healing Touch, Regrowth and Tranquility spells by 10%."
                ]
            },
            {
                id: 16,
                name: "Aessina's Bloom",
                icon: "inv_misc_herb_02",
                ranks: 2,
                row: 5,
                col: 1,
                description: "Reduces the casting time of your Healing Touch spell by 0.15 sec and refunds 5% of it's mana cost.",
                fullDescription: "Reduces the casting time of your Healing Touch spell by 0.15 sec and refunds 5% of it's mana cost.",
                spellIds: [
                    46788,
                    46789
                ],
                rankDescriptions: [
                    "Reduces the casting time of your Healing Touch spell by 0.15 sec and refunds 5% of it's mana cost.",
                    "Reduces the casting time of your Healing Touch spell by 0.3 sec and refunds 10% of it's mana cost."
                ],
                requires: 4,
                reqRanks: 5
            },
            {
                id: 18,
                name: "Nature's Swiftness",
                icon: "spell_nature_ravenform",
                ranks: 1,
                row: 5,
                col: 3,
                description: "When activated, your next Nature spell becomes an instant cast spell.",
                fullDescription: "When activated, your next Nature spell becomes an instant cast spell.",
                spellIds: [
                    17116
                ],
                rankDescriptions: [
                    "When activated, your next Nature spell becomes an instant cast spell."
                ],
                requires: 10,
                reqRanks: 3
            },
            {
                id: 19,
                name: "Preservation",
                icon: "inv_relics_idolofhealth",
                ranks: 3,
                row: 5,
                col: 4,
                description: "Increases the periodic healing of Regrowth by 10% if the friendly target is affected by Rejuvenation.",
                fullDescription: "Increases the periodic healing of Regrowth by 10% if the friendly target is affected by Rejuvenation.",
                spellIds: [
                    51448,
                    51449,
                    51450
                ],
                rankDescriptions: [
                    "Increases the periodic healing of Regrowth by 10% if the friendly target is affected by Rejuvenation.",
                    "Increases the periodic healing of Regrowth by 20% if the friendly target is affected by Rejuvenation.",
                    "Increases the periodic healing of Regrowth by 30% if the friendly target is affected by Rejuvenation."
                ]
            },
            {
                id: 21,
                name: "Improved Regrowth",
                icon: "spell_nature_resistnature",
                ranks: 5,
                row: 6,
                col: 2,
                description: "Increases the critical effect chance of your Regrowth spell by 10%.",
                fullDescription: "Increases the critical effect chance of your Regrowth spell by 10%.",
                spellIds: [
                    17074,
                    17075,
                    17076,
                    17077,
                    17078
                ],
                rankDescriptions: [
                    "Increases the critical effect chance of your Regrowth spell by 10%.",
                    "Increases the critical effect chance of your Regrowth spell by 20%.",
                    "Increases the critical effect chance of your Regrowth spell by 30%.",
                    "Increases the critical effect chance of your Regrowth spell by 40%.",
                    "Increases the critical effect chance of your Regrowth spell by 50%."
                ],
                requires: 13,
                reqRanks: 5
            },
            {
                id: 22,
                name: "Improved Tranquility",
                icon: "spell_nature_tranquility",
                ranks: 2,
                row: 6,
                col: 3,
                description: "Increases the healing done by your Tranquility spell by 20%.",
                fullDescription: "Increases the healing done by your Tranquility spell by 20%.",
                spellIds: [
                    17123,
                    17124
                ],
                rankDescriptions: [
                    "Increases the healing done by your Tranquility spell by 20%.",
                    "Increases the healing done by your Tranquility spell by 40%."
                ]
            },
            {
                id: 25,
                name: "Tree of Life Form",
                icon: "ability_druid_treeoflife",
                ranks: 1,
                row: 7,
                col: 2,
                description: "Shapeshift into the Tree of Life.  While in this form armor contribution from items is inreased by 180%, the healing power of nearby party members is increased by an amount equal to 20% of your spirit, your movement speed is reduced by 19%, and you cannot cast damaging spells or Healing Touch, but the mana cost of heal over time spells is reduced by 20%.\\n\\nThe act of shapeshifting frees the caster of Polymorph and Movement Impairing effects.",
                fullDescription: "Shapeshift into the Tree of Life.  While in this form armor contribution from items is inreased by 180%, the healing power of nearby party members is increased by an amount equal to 20% of your spirit, your movement speed is reduced by 19%, and you cannot cast damaging spells or Healing Touch, but the mana cost of heal over time spells is reduced by 20%.\\n\\nThe act of shapeshifting frees the caster of Polymorph and Movement Impairing effects.",
                spellIds: [
                    45705
                ],
                rankDescriptions: [
                    "Shapeshift into the Tree of Life.  While in this form armor contribution from items is inreased by 180%, the healing power of nearby party members is increased by an amount equal to 20% of your spirit, your movement speed is reduced by 19%, and you cannot cast damaging spells or Healing Touch, but the mana cost of heal over time spells is reduced by 20%.\\n\\nThe act of shapeshifting frees the caster of Polymorph and Movement Impairing effects."
                ],
                requires: 21,
                reqRanks: 5
            }
        ]
    }
};
