/**
 * Set Bonus Database - Single Source of Truth
 *
 * This file contains all set bonus definitions with numeric item ID mappings.
 * Bonuses are assigned unique numeric IDs for unambiguous identification.
 *
 * @version 2.0.0
 * @since 2026-02-24
 */

export const setDatabase = {
  sets: {
    battlegear_ten_storms: {
      name: "battlegear_ten_storms",
      displayName: "Battlegear of the Ten Storms",
      // Turtle WoW enhancement T2 visuals (47136–47143). Classic 16943–16950 are Garb (caster), not this set.
      itemIds: [
        47136, 47137, 47138, 47139, 47140, 47141, 47142, 47143
      ],
      bonuses: {
        "3pc": {
          bonusId: 1,
          pieces: 3,
          name: "Battlegear of the Ten Storms 3pc",
          description: "Reduces the cooldown of Stormstrike and Lightning Strike by 0.5 seconds",
          modeledInSim: true,
          effect: {
            type: "cooldownReduction",
            abilities: ["stormstrike", "lightningStrike"],
            reduction: 0.5
          },
          statsKey: "battlegear_ten_storms_3pc_cooldown_reduction",
          statsValue: 0.5
        },
        "5pc": {
          bonusId: 2,
          pieces: 5,
          name: "Battlegear of the Ten Storms 5pc",
          description: "Lightning Strike grants Echoed Thunder buff - next auto attack deals 10% additional nature damage",
          modeledInSim: true,
          effect: {
            type: "procOnAbilityHit",
            triggerAbility: "lightningStrike",
            buff: {
              id: "echoed_thunder",
              name: "Echoed Thunder",
              duration: null,
              onNextAutoAttack: true,
              additionalDamage: 0.10,
              damageSchool: "nature"
            }
          },
          statsKey: "battlegear_ten_storms_5pc_echoed_thunder",
          statsValue: true
        },
        "8pc": {
          bonusId: 3,
          pieces: 8,
          name: "Battlegear of the Ten Storms 8pc",
          description: "Stormstrike has 50% chance to make next Lightning Bolt instant cast and cost no mana",
          modeledInSim: true,
          effect: {
            type: "procOnAbilityHit",
            triggerAbility: "stormstrike",
            procChance: 0.5,
            buff: {
              id: "instant_lightning_bolt",
              name: "Instant Lightning Bolt",
              duration: 10,
              instantCast: "lightningBolt",
              noManaCost: true,
              hitBonus: 0.99
            }
          },
          statsKey: "battlegear_ten_storms_8pc_lightning_bolt_proc",
          statsValue: 0.5
        }
      }
    },
    garb_ten_storms: {
      name: "garb_ten_storms",
      displayName: "Garb of the Ten Storms",
      // Classic / caster T2 (Bindings through Raiments). Not Stormcaller's Garb (T2.5).
      itemIds: [
        16943, 16944, 16945, 16946, 16947, 16948, 16949, 16950
      ],
      bonuses: {
        "3pc": {
          bonusId: 4,
          pieces: 3,
          name: "Garb of the Ten Storms 3pc",
          description: "Increases the duration of Flame Shock by 6 seconds",
          modeledInSim: true,
          effect: {
            type: "dotExtension",
            dot: "flameShockDot",
            extension: 6
          },
          statsKey: "garb_ten_storms_3pc_flame_shock_dot_duration",
          statsValue: 6
        },
        "5pc": {
          bonusId: 5,
          pieces: 5,
          name: "Garb of the Ten Storms 5pc",
          description: "Shocks have 25% chance and Lightning Bolt has 15% chance to trigger Lightning Shield without consuming a charge",
          modeledInSim: true,
          effect: {
            type: "procOnAbilityHit",
            triggerAbility: ["flameShock", "earthShock", "frostShock", "lightningBolt"],
            procChance: { shock: 0.25, lightningBolt: 0.15 },
            action: {
              type: "triggerAbility",
              ability: "lightningShield",
              consumeCharge: false
            },
            elementalPriority: { insertLightningShieldRefresh: true }
          },
          statsKeys: {
            garb_ten_storms_5pc_shock_ls_chance: 0.25,
            garb_ten_storms_5pc_lightning_bolt_ls_chance: 0.15,
            garb_ten_storms_5pc_caster_ls_priority: true
          }
        },
        "8pc": {
          bonusId: 23,
          pieces: 8,
          name: "Garb of the Ten Storms 8pc",
          description: "Lightning Bolt has 20% chance to echo for 50% damage (3 sec ICD)",
          modeledInSim: true,
          effect: {
            type: "procOnAbilityHit",
            triggerAbility: "lightningBolt",
            procChance: 0.2,
            icdSeconds: 3,
            echoDamageMultiplier: 0.5
          },
          statsKeys: {
            garb_ten_storms_8pc_lb_echo_chance: 0.2,
            garb_ten_storms_8pc_lb_echo_damage_mult: 0.5,
            garb_ten_storms_8pc_lb_echo_icd: 3
          }
        }
      }
    },
    stormhowl_battlegear: {
      name: "stormhowl_battlegear",
      displayName: "Stormhowl Battlegear",
      itemIds: [
        47180, 47181, 47182, 47183, 47184, 47185, // Enhancement variant (6 pieces including neck)
        47192, 47193, 47194, 47195, 47196, 47197  // Restoration variant (6 pieces including neck)
      ],
      bonuses: {
        "3pc": {
          bonusId: 6,
          pieces: 3,
          name: "Stormhowl Battlegear 3pc",
          description: "Melee attacks have 15% chance to trigger Empowered Lightning Shield without consuming a charge",
          modeledInSim: true,
          effect: {
            type: "procOnMeleeHit",
            procChance: 0.15,
            action: {
              type: "triggerAbility",
              ability: "empoweredLightningShield",
              consumeCharge: false
            }
          },
          statsKey: "stormhowl_3pc_empowered_ls_chance",
          statsValue: 0.15
        },
        "5pc": {
          bonusId: 7,
          pieces: 5,
          name: "Stormhowl Battlegear 5pc",
          description: "Auto attacks have 10% chance to grant Stormwolf's Frenzy (+10% attack speed, +5% strength for 12s)",
          modeledInSim: true,
          effect: {
            type: "procOnAutoAttack",
            procChance: 0.10,
            buff: {
              id: "stormwolf_frenzy",
              name: "Stormwolf's Frenzy",
              duration: 12,
              hastePercent: 10,
              strengthPercent: 5
            }
          },
          statsKey: "stormhowl_5pc_stormwolf_frenzy",
          statsValue: true
        }
      }
    },
    stormhowl_garb: {
      name: "stormhowl_garb",
      displayName: "Stormhowl Garb",
      itemIds: [
        47186, 47187, 47188, 47189, 47190, 47191 // Elemental variant (6 pieces including neck)
      ],
      bonuses: {
        "3pc": {
          bonusId: 16,
          pieces: 3,
          name: "Stormhowl Garb 3pc",
          description: "Increases the mana-cost reduction of Clearcasting to 70%",
          modeledInSim: true,
          effect: {
            type: "passiveModifier",
            modifier: "clearcastingManaReduction",
            value: 0.70
          },
          statsKey: "stormhowl_garb_3pc_clearcasting",
          statsValue: 0.70
        },
        "5pc": {
          bonusId: 17,
          pieces: 5,
          name: "Stormhowl Garb 5pc",
          description: "Elemental Mastery infuses you with Stormwolf's Cunning, increasing casting speed by 10% for 12 sec. Refreshed on nature spell crit.",
          modeledInSim: true,
          effect: {
            type: "buffOnAbilityUse",
            triggerAbility: "elementalMastery",
            buff: {
              id: "stormwolf_cunning",
              name: "Stormwolf's Cunning",
              duration: 12,
              spellHastePercent: 10,
              refreshOn: "natureSpellCrit"
            }
          },
          statsKey: "stormhowl_garb_5pc_stormwolf_cunning",
          statsValue: true
        }
      }
    },
    incendosaur: {
      name: "incendosaur",
      displayName: "Incendosaur",
      itemIds: [60572, 60568, 60582],
      bonuses: {
        "3pc": {
          bonusId: 8,
          pieces: 3,
          name: "Incendosaur 3pc",
          description: "5% chance on melee attacks to trigger a Spellstrike dealing 15-26 fire damage",
          modeledInSim: true,
          effect: {
            type: "procOnMeleeHit",
            procChance: 0.05,
            isSpellstrike: true,
            damage: {
              type: "fire",
              min: 15,
              max: 26,
              spCoefficient: 0
            }
          },
          statsKey: "incendosaur_3pc_melee_fire_proc",
          statsValue: true
        }
      }
    },
    earthfury_the_earthfury: {
      name: "earthfury_the_earthfury",
      displayName: "The Earthfury",
      itemIds: [16837, 16838, 16839, 16840, 16841, 16842, 16843, 16844],
      bonuses: {}
    },
    earthfury_battlegear: {
      name: "earthfury_battlegear",
      displayName: "Earthfury Battlegear",
      itemIds: [47120, 47121, 47122, 47123, 47124, 47125, 47126, 47127],
      bonuses: {
        "5pc": {
          bonusId: 9,
          pieces: 5,
          name: "Earthfury Battlegear 5pc",
          description: "Flametongue Weapon deals 45% more damage against targets affected by your Flame Shock",
          modeledInSim: true,
          effect: {
            type: "conditionalDamageModifier",
            ability: "flametongueWeapon",
            condition: "targetHasFlameShock",
            multiplier: 1.45
          },
          statsKey: "earthfury_5pc_flametongue_vs_flameshock",
          statsValue: 0.45
        },
        "8pc": {
          bonusId: 24,
          pieces: 8,
          name: "Earthfury Battlegear 8pc",
          description: "Your Earth Shock causes an Aftershock, dealing an additional 175 to 226 Nature damage after 4 sec",
          modeledInSim: true,
          effect: {
            type: "delayedDamageOnAbility",
            triggerAbility: "earthShock",
            delaySeconds: 4,
            school: "nature",
            damageMin: 175,
            damageMax: 226,
            dotTickProfile: true
          },
          statsKey: "earthfury_8pc_aftershock",
          statsValue: true
        }
      }
    },
    earthfury_garb: {
      name: "earthfury_garb",
      displayName: "Earthfury Garb",
      itemIds: [47128, 47129, 47130, 47131, 47132, 47133, 47134, 47135],
      bonuses: {}
    },
    black_dragon_mail: {
      name: "black_dragon_mail",
      displayName: "Black Dragon Mail",
      itemIds: [16984, 15050, 15052, 15051],
      bonuses: {
        "2pc": {
          bonusId: 12,
          pieces: 2,
          name: "Black Dragon Mail 2pc",
          description: "Improves your chance to hit by 1%",
          modeledInSim: true,
          effect: {
            type: "statBonus",
            stat: "meleeHit",
            value: 1
          },
          statsKey: "black_dragon_mail_2pc_hit",
          statsValue: 1
        },
        "3pc": {
          bonusId: 13,
          pieces: 3,
          name: "Black Dragon Mail 3pc",
          description: "Improves your chance to get a critical strike by 2%",
          modeledInSim: true,
          effect: {
            type: "statBonus",
            stat: "meleeCrit",
            value: 2
          },
          statsKey: "black_dragon_mail_3pc_crit",
          statsValue: 2
        }
      }
    },
    earthshatterer: {
      name: "earthshatterer",
      displayName: "Earthshatterer's Battlegear",
      itemIds: [47162, 47163, 47164, 47165, 47166, 47167, 47168, 47169, 47170],
      bonuses: {
        "2pc": {
          bonusId: 10,
          pieces: 2,
          name: "Earthshatterer's Battlegear 2pc",
          description: "Increases the damage from the Attack Power coefficient of Empowered Lightning Shield by 15%",
          modeledInSim: true,
          effect: {
            type: "coefficientModifier",
            ability: "empoweredLightningShield",
            coefficient: "attackPower",
            multiplier: 1.15
          },
          statsKey: "empowered_lightning_shield_scaling_bonus",
          statsValue: 0.15
        },
        "4pc": {
          bonusId: 18,
          pieces: 4,
          name: "Earthshatterer's Battlegear 4pc",
          description: "Increases the critical strike chance of your Shock spells by 5%",
          modeledInSim: true,
          effect: {
            type: "spellCritBonus",
            spellFamily: "shock",
            value: 5
          },
          statsKey: "shock_spell_crit",
          statsValue: 5
        },
        "8pc": {
          bonusId: 25,
          pieces: 8,
          name: "Earthshatterer's Battlegear 8pc",
          description: "Your Stormstrike and Lightning Strike spells have a 20% chance to reset the cooldown of your Shock spells",
          modeledInSim: true,
          effect: {
            type: "procOnAbilityHit",
            abilities: ["stormstrike", "lightningStrike"],
            procChance: 0.2,
            resetCooldowns: ["shocks"]
          },
          statsKey: "earthshatter_8pc_shock_cooldown_reset_chance",
          statsValue: 0.2
        }
      }
    },
    towerforge_battlegear: {
      name: "towerforge_battlegear",
      displayName: "Towerforge Battlegear",
      itemIds: [60007, 60008, 60009, 60010],
      bonuses: {
        "2pc": {
          bonusId: 14,
          pieces: 2,
          name: "Towerforge Battlegear 2pc",
          description: "Increased Two-handed Maces +6",
          modeledInSim: true,
          effect: {
            type: "statBonus",
            stat: "weaponSkill",
            weaponType: "Two-handed Mace",
            value: 6
          },
          statsKey: "towerforge_2pc_two_handed_maces",
          statsValue: 6
        },
        "4pc": {
          bonusId: 15,
          pieces: 4,
          name: "Towerforge Battlegear 4pc",
          description: "Your melee hits have a 2% chance to grant 50 Strength for 10 sec",
          modeledInSim: true,
          effect: {
            type: "procOnMeleeHit",
            procChance: 0.02,
            buff: {
              id: "towerforge_fury",
              name: "Towerforge Fury",
              duration: 10,
              strength: 50
            }
          },
          statsKey: "towerforge_4pc_strength_proc",
          statsValue: true
        }
      }
    },
    redemption_battleplate: {
      name: "redemption_battleplate",
      displayName: "Redemption Battleplate",
      itemIds: [
        47042, // Redemption Helmet
        47043, // Redemption Shoulderguards
        47044, // Redemption Chestguard
        47045, // Redemption Wristguards
        47046, // Redemption Handguards
        47047, // Redemption Waistguard
        47048, // Redemption Legguards
        47049, // Redemption Greaves
        47050, // Signet of Redemption
      ],
      bonuses: {
        "2pc": {
          bonusId: 19,
          pieces: 2,
          name: "Redemption Battleplate 2pc",
          description: "Increases your chance to block attacks with a shield by 3%",
          modeledInSim: true,
          effect: {
            type: "statBonus",
            stat: "blockChance",
            value: 3
          },
          statsKey: "blockChance",
          statsValue: 3
        },
        "4pc": {
          bonusId: 20,
          pieces: 4,
          name: "Redemption Battleplate 4pc",
          description: "Increases the block value of your shield by 32",
          modeledInSim: true,
          effect: {
            type: "statBonus",
            stat: "blockValue",
            value: 32
          },
          statsKey: "blockValue",
          statsValue: 32
        },
        "6pc": {
          bonusId: 21,
          pieces: 6,
          name: "Redemption Battleplate 6pc",
          description: "Reduces the cooldown of Exorcism by 5 seconds",
          modeledInSim: true,
          effect: {
            type: "cooldownReduction",
            abilities: ["exorcism"],
            reduction: 5
          },
          statsKey: "redemption_6pc_exorcism_cooldown",
          statsValue: 5
        },
        "8pc": {
          bonusId: 22,
          pieces: 8,
          name: "Redemption Battleplate 8pc",
          description: "Increases damage and healing done by magical spells and effects by up to 57",
          modeledInSim: true,
          effect: {
            type: "statBonus",
            stat: "dmgAndHealing",
            value: 57
          },
          statsKey: "dmgAndHealing",
          statsValue: 57
        }
      }
    },
    stormcaller_s_battlegear: {
      name: "stormcaller_s_battlegear",
      displayName: "Stormcaller's Battlegear",
      itemIds: [
        47152, 47153, 47154, 47155, 47156, // Tank variant
        47157, 47158, 47159, 47160, 47161  // Healer variant
      ],
      bonuses: {
        "5pc": {
          bonusId: 11,
          pieces: 5,
          name: "Stormcaller's Battlegear 5pc",
          description: "Increases the effects of Rockbiter Weapon by 25% (both AP and threat)",
          modeledInSim: true,
          effect: {
            type: "imbueModifier",
            imbue: "rockbiterWeapon",
            multiplier: 1.25
          },
          statsKey: "rockbiter_weapon_bonus",
          statsValue: 0.25
        }
      }
    },
    might_of_the_hippogryph: {
      name: "might_of_the_hippogryph",
      displayName: "Might of the Hippogryph",
      itemIds: [33392, 33393, 33394, 33395, 33396, 33397],
      bonuses: {
        "3pc": {
          bonusId: 27,
          pieces: 3,
          name: "Might of the Hippogryph 3pc",
          description:
            "Melee: 1.2 PPM for +20% attack speed and Might (8s). Two charges are removed by auto attacks, Windfury extra hits (one WF = two hits = two charges), Stormstrike, or Lightning Strike (physical). While charges remain, 150 Nature on successful melee hits.",
          modeledInSim: true,
          effect: {
            type: "hippogryphMight",
            ppm: 1.2,
            natureDamage: 150,
            hastePercent: 20,
            durationSec: 8,
            maxCharges: 2
          },
          statsKey: "hippogryph_3pc_might",
          statsValue: true
        }
      }
    }
  }
};

export default setDatabase;
