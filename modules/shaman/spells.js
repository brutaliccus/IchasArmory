// modules/shamanSpells.js - Shaman spell data and coefficients

/**
 * Shaman spell database with damage coefficients and properties
 * SP = Spell Power coefficient
 * AP = Attack Power coefficient
 */
export const shamanSpells = {
    earthShock: {
        id: 10414,
        name: "Earth Shock",
        icon: "spell_nature_earthshock",
        school: "nature",
        damageMin: 492,
        damageMax: 520,
        spCoefficient: 0.37,   // 37%
        apCoefficient: 0.10,   // 10%
        cooldown: 6,           // 6s base, 5s with reverb
        canCrit: true,
        isBinarySpell: true,   // Binary spell: resistance reduces hit chance instead of damage
        canBeBuffedByStormstrike: true,
        consumesStormstrikeCharge: true,  // Consumes Stormstrike charge
        hasElementsGraceCrit: true,  // Gets crit bonus from Element's Grace
        modifiers: {
            stormstrike: true,      // Consumes charge, +25%
            concussion: true,       // +5%
            callOfFlame: false,
            elementalFury: true,    // +10% damage, 2x crit
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,        // +10%
            elementsGrace: true,     // Only crit bonus, not damage
            elementalMastery: true, // +15% damage when active
            naturalAlignmentCrystal: true  // +20% spell damage when active
        }
    },

    frostShock: {
        id: 10473,
        name: "Frost Shock",
        icon: "https://octowow.st/db/images/icons/large/spell_frost_frostshock.png",
        school: "frost",
        damageMin: 442,
        damageMax: 470,
        spCoefficient: 0.36,   // 36%
        apCoefficient: 0.10,   // 10%
        cooldown: 6,           // 6s base, 5s with reverb
        /** Movement slow debuff duration on target (Frostbrand EW guaranteed crit while active) */
        frostSlowDuration: 8,
        canCrit: true,
        canBeBuffedByStormstrike: true,
        hasElementsGraceCrit: true,  // Gets crit bonus from Element's Grace
        modifiers: {
            stormstrike: true,      // Consumes charge, +25%
            concussion: true,       // +5%
            callOfFlame: false,
            elementalFury: true,    // +10% damage, 2x crit (frost)
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,        // +10%
            elementsGrace: true,     // Only crit bonus, not damage
            elementalMastery: true, // +15% damage when active
            naturalAlignmentCrystal: true  // +20% spell damage when active
        }
    },

    flameShock: {
        id: 29228,
        name: "Flame Shock",
        icon: "spell_fire_flameshock",
        school: "fire",
        damageMin: 293,
        damageMax: 293,
        spCoefficient: 0.21,   // 21%
        apCoefficient: 0.085,  // 8.5%
        cooldown: 6,           // 6s base (shared with all shocks, reduced by Reverberation)
        canCrit: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: true,   // Initial damage benefits from Element's Grace crit
        modifiers: {
            stormstrike: false,
            concussion: true,       // +5%
            callOfFlame: true,      // +15%
            elementalFury: true,    // +10% damage, 1.5x crit (fire)
            elementalWeapons: true, // +30% if FT active
            curseOfElements: true,  // +10%
            improvedScorch: true,   // +15%
            nightfall: true,        // +10%
            elementsGrace: true,     // Crit bonus applies to initial damage
            elementalMastery: true, // +15% damage when active
            naturalAlignmentCrystal: true  // +20% spell damage when active
        }
    },

    flameShockDot: {
        id: 29228,
        name: "Flame Shock (DoT)",
        icon: "spell_fire_flameshock",
        school: "fire",
        damagePerTick: 82,  // 410 total over 15s (5 ticks) = 82 per tick
        ticks: 5,
        duration: 15,
        spCoefficient: 0.0975, // 9.75% per tick
        apCoefficient: 0.015,  // 1.5% per tick
        canCrit: false,        // DoTs cannot crit
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: false,  // DoTs cannot crit
        // === DATA-DRIVEN DOT CONFIG (v1.5.0) ===
        dot: {
            tickInterval: 3,       // 3s between ticks
            baseDuration: 15,      // 15s base duration
            snapshots: true,       // Damage snapshots on application
            canCrit: false,        // DOT ticks cannot crit
            refreshableWithClip: false // Cannot refresh early
        },
        modifiers: {
            stormstrike: false,
            concussion: true,
            callOfFlame: true,
            elementalFury: true,    // +10% damage only
            elementalWeapons: true,
            curseOfElements: true,
            improvedScorch: true,
            nightfall: true,
            elementsGrace: false,
            elementalMastery: true, // +15% damage when active (preserved for DoT duration)
            naturalAlignmentCrystal: true  // +20% spell damage when active
        }
    },

    /** Earthfury Battlegear 8pc: one tick at +4s after Earth Shock (DoT resist profile, no crit, SS like Lightning Shield) */
    earthfuryBattlegearAftershockDot: {
        id: 0,
        name: "Earthfury Aftershock",
        icon: "spell_nature_earthshock",
        school: "nature",
        damageMin: 175,
        damageMax: 226,
        spCoefficient: 0,
        apCoefficient: 0,
        canCrit: false,
        canBeBuffedByStormstrike: true,
        consumesStormstrikeCharge: false,
        hasElementsGraceCrit: false,
        dot: {
            tickInterval: 4,
            baseDuration: 4,
            snapshots: true,
            canCrit: false
        },
        modifiers: {
            stormstrike: true,
            concussion: true,
            callOfFlame: false,
            elementalFury: true,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,
            elementsGrace: false,
            elementalMastery: true,
            naturalAlignmentCrystal: true
        }
    },

    lightningShield: {
        id: 10432,
        name: "Lightning Shield",
        icon: "spell_nature_lightningshield",
        school: "nature",
        damageMin: 198,
        damageMax: 198,
        spCoefficient: 0.27,   // 27%
        apCoefficient: 0.0,    // 0%
        icd: 3,                // 3s internal cooldown (4s with Stable Shields)
        canCrit: false,        // Lightning Shield cannot crit
        canMiss: false,        // Lightning Shield cannot miss (thorns-like effect)
        canBeBuffedByStormstrike: true,  // Benefits from Stormstrike but doesn't consume
        consumesStormstrikeCharge: false,  // Does NOT consume Stormstrike charge
        hasElementsGraceCrit: false,  // Cannot crit
        modifiers: {
            stormstrike: true,      // Benefits but doesn't consume
            concussion: false,      // Does NOT apply to Lightning Shield
            callOfFlame: false,
            elementalFury: true,    // +10% damage only (no crit)
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,
            elementsGrace: false,
            elementalMastery: true, // +15% damage when active
            naturalAlignmentCrystal: true  // +20% spell damage when active
        }
    },

    empoweredLightningShield: {
        id: 52422,
        name: "Empowered Lightning Shield",
        icon: "spell_nature_lightningshield",
        school: "nature",
        damageMin: 198,
        damageMax: 198,
        spCoefficient: 0.27,   // 27%
        apCoefficient: 0.25,   // 25%
        // Note: ELS has no cooldown - it procs every time Lightning Strike hits while LS is active
        // The 9s cooldown is on Lightning Strike itself, not ELS
        canCrit: false,        // Lightning Shield cannot crit
        canMiss: false,        // Cannot miss (procs on successful Lightning Strike)
        canBeBuffedByStormstrike: true,
        consumesStormstrikeCharge: true,  // Consumes Stormstrike charge
        hasElementsGraceCrit: false,  // Cannot crit
        modifiers: {
            stormstrike: true,      // Consumes charge, +25%
            concussion: false,      // Does NOT apply to Lightning Shield
            callOfFlame: false,
            elementalFury: true,    // +10% damage only (no crit)
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,
            elementsGrace: false,
            elementalMastery: true, // +15% damage when active
            naturalAlignmentCrystal: true  // +20% spell damage when active
        }
    },

    lightningStrike: {
        id: 52422,
        name: "Lightning Strike",
        icon: "https://talents.turtlecraft.gg/icons/spell_nature_thunderclap.png",
        school: "nature",
        weaponDamagePercent: 0.60,  // 60% weapon damage (physical)
        natureDamagePercent: 0.20,  // +20% as nature
        spCoefficient: 0.27,        // Inherits from lightning shield
        apCoefficient: 0.25,        // Inherits from lightning shield (25%)
        cooldown: 9,                // 9s cooldown
        canCrit: true,
        usesMeleeHit: true,         // Uses melee hit (8% base, can cap to 0%)
        canBeBuffedByStormstrike: true,  // Nature component benefits from Stormstrike
        consumesStormstrikeCharge: false,  // Does NOT consume Stormstrike charge
        hasElementsGraceCrit: true,   // Gets crit bonus from Element's Grace
        hasElementsGraceDamage: true, // Gets damage bonus from Element's Grace
        modifiers: {
            stormstrike: true,      // Nature component benefits but doesn't consume
            concussion: false,
            callOfFlame: false,
            elementalFury: true,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,
            elementsGrace: true,     // Both damage and crit bonus
            elementalMastery: true, // +15% damage when active (applies to nature component)
            naturalAlignmentCrystal: true  // +20% spell damage when active (applies to nature component)
        }
    },

    waterShield: {
        id: 51536,
        name: "Water Shield",
        icon: "ability_shaman_watershield",
        school: "frost",
        manaReturn: 130,       // per globe proc (placeholder until mana system)
        icdSeconds: 4,
        maxCharges: 3,
        isPersonalBuff: true,
        shamanOnly: true
    },

    empoweredWaterShield: {
        id: 51532,            // proc spell id from database
        name: "Empowered Water Shield",
        icon: "ability_shaman_watershield",
        school: "frost",
        manaReturn: 130,
        apCoefficient: 0.20,  // 20% AP scaling (placeholder)
        isProc: true,
        noELS: true           // when Water Shield active, Lightning Strike procs this instead of ELS
    },

    totemOfTides: {
        id: 41826,            // spell from Totem of Tides item 58146 (damaging ability: Tidal Wave)
        name: "Tidal Wave",
        icon: "spell_frost_frostnova",
        school: "frost",
        damageMin: 25,
        damageMax: 33,
        spCoefficient: 0,
        apCoefficient: 0,
        noScaling: true,      // 25-33 flat, no SP/AP
        canCrit: true,         // Phase 3: uses spell crit
        itemId: 58146
    },

    searingTotem: {
        id: 10438,
        name: "Searing Totem",
        icon: "spell_fire_searingtotem",
        school: "fire",
        damageMin: 40,
        damageMax: 54,
        spCoefficient: 0.165,  // 16.5%
        apCoefficient: 0.0,
        attackRate: 2.2,       // 2.2s base
        duration: 55,
        canCrit: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: false,  // EG crit only affects shocks, SS, LS
        modifiers: {
            stormstrike: false,
            concussion: false,      // Concussion does not apply to totems
            callOfFlame: true,
            elementalFury: true,    // +10% damage, 2.0x crit (fire)
            elementalWeapons: true,
            curseOfElements: true,
            improvedScorch: true,
            nightfall: true,
            elementsGrace: true,    // Crit bonus only
            elementalMastery: true, // Applies to totem damage
            naturalAlignmentCrystal: true  // Applies to totem damage
        }
    },

    magmaTotem: {
        id: 8190,
        name: "Magma Totem",
        icon: "spell_fire_selfdestruct",
        school: "fire",
        damageMin: 75,
        damageMax: 75,
        spCoefficient: 0.0333, // 3.33%
        apCoefficient: 0.0,
        tickRate: 2.0,
        duration: 20,
        canCrit: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: false,  // EG crit only affects shocks, SS, LS
        modifiers: {
            stormstrike: false,
            concussion: false,      // Concussion does not apply to totems
            callOfFlame: true,
            elementalFury: true,    // +10% damage, 2.0x crit (fire)
            elementalWeapons: true,
            curseOfElements: true,
            improvedScorch: true,
            nightfall: true,
            elementsGrace: true,    // Crit bonus only
            elementalMastery: true, // Applies to totem damage
            naturalAlignmentCrystal: true  // Applies to totem damage
        }
    },

    stoneclawTotem: {
        id: 10428,
        name: "Stoneclaw Totem",
        icon: "spell_nature_stoneclawtotem",
        // Threat only: 136 on drop + 136 every 2s for 8 pulses (15s). 30s CD. No GCD.
    },

    fireNovaTotem: {
        id: 11315,
        name: "Fire Nova Totem",
        icon: "spell_fire_sealoffire",
        school: "fire",
        damageMin: 413,
        damageMax: 459,
        spCoefficient: 0.145,  // 14.5%
        apCoefficient: 0.0,
        delay: 4,              // 4s delay, 2s with improved fire totems
        cooldown: 15,
        canCrit: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: false,  // EG crit only affects shocks, SS, LS
        modifiers: {
            stormstrike: false,
            concussion: false,      // Concussion does not apply to totems
            callOfFlame: true,
            elementalFury: true,    // +10% damage, 2.0x crit (fire)
            elementalWeapons: true,
            curseOfElements: true,
            improvedScorch: true,
            nightfall: true,
            elementsGrace: true,    // Crit bonus only
            elementalMastery: true, // Applies to totem damage
            naturalAlignmentCrystal: true  // Applies to totem damage
        }
    },

    stormstrike: {
        id: 17364,
        name: "Stormstrike",
        icon: "https://octowow.st/db/images/icons/large/ability_shaman_stormstrike.png",
        school: "physical",
        weaponDamagePercent: 1.0,  // 100% weapon damage
        cooldown: 8,   // 8s cooldown
        duration: 12,
        charges: 2,
        natureDamageBonus: 0.25,   // +25% to next 2 nature damage sources
        canCrit: true,
        usesMeleeHit: true,        // Uses melee hit (8% base, can cap to 0%)
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: true,   // Gets crit bonus from Element's Grace
        hasElementsGraceDamage: true, // Gets damage bonus from Element's Grace
        modifiers: {
            stormstrike: false,
            concussion: false,
            callOfFlame: false,
            elementalFury: false,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: false,
            elementsGrace: true     // Both damage and crit bonus
        }
    },

    autoAttack: {
        id: 0,
        name: "Auto Attack",
        icon: "inv_sword_04",
        school: "physical",
        weaponDamagePercent: 1.0,  // 100% weapon damage
        isAutoAttack: true,        // Special flag for auto attacks
        canCrit: true,
        usesMeleeHit: true,
        hasGlancingBlows: true,    // 40% of attacks are glancing blows
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: false,
        hasElementsGraceDamage: false,
        modifiers: {
            stormstrike: false,
            concussion: false,
            callOfFlame: false,
            elementalFury: false,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: false,
            elementsGrace: false
        }
    },

    // Windfury Attack - extra melee attacks that use the white hit table
    // CAN glance, CAN be dodged/parried (parry only in front)
    windfuryAttack: {
        id: 0,
        name: "Windfury Attack",
        icon: "spell_nature_cyclone",
        school: "physical",
        weaponDamagePercent: 1.0,  // 100% weapon damage
        isAutoAttack: false,
        canCrit: true,
        usesMeleeHit: true,
        hasGlancingBlows: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: false,
        hasElementsGraceDamage: false,
        modifiers: {
            stormstrike: false,
            concussion: false,
            callOfFlame: false,
            elementalFury: false,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: false,
            elementsGrace: false
        }
    },

    flametongueWeapon: {
        id: 10400,
        name: "Flametongue Weapon",
        icon: "spell_fire_flametounge",
        school: "fire",
        // Base fire proc: linear scale by base weapon speed (clamped minWSP–maxWSP) + SP × effective coef
        // effective SP coef = spCoefficient + spCoefficientPerBaseWeaponSpeed × baseWeaponSpeed (not hasted swing time)
        // e.g. 3.8s weapon: 0.16 + 0.03×3.8 = 27.4% of fire spell power
        damageMin: 36.5,
        damageMax: 112.4,
        minWeaponSpeed: 1.5,
        maxWeaponSpeed: 4.0,
        spCoefficient: 0.16,   // flat portion of effective SP coefficient
        spCoefficientPerBaseWeaponSpeed: 0.03, // per second of base weapon speed (additive to flat)
        apCoefficient: 0.0,
        isFlametongueProc: true,  // Special flag for FT procs
        canCrit: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: true,
        modifiers: {
            stormstrike: false,
            concussion: false,      // Flametongue does not get Concussion bonus
            callOfFlame: true,      // +15%
            elementalFury: true,    // +10% damage, 1.5x crit (fire)
            elementalWeapons: true, // +30% if EW buff active
            curseOfElements: true,  // +10%
            improvedScorch: true,   // +15%
            nightfall: true,        // +10%
            elementsGrace: false
        }
    },

    frostbrandWeapon: {
        id: 16356,
        name: "Frostbrand Weapon",
        icon: "https://octowow.st/db/images/icons/large/spell_frost_frostbrand.png",
        school: "frost",
        // Base proc damage scales with base weapon speed (same pattern as Flametongue)
        damageMin: 186,
        damageMax: 187,
        minWeaponSpeed: 1.5,
        maxWeaponSpeed: 4.0,
        spCoefficient: 0.25,
        spCoefficientPerBaseWeaponSpeed: 0.04,
        apCoefficient: 0.0,
        isFrostbrandProc: true,
        canCrit: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: true, // +2% spell crit per rank (no EG weapon-damage bonus; same pattern as Flametongue proc)
        modifiers: {
            stormstrike: false,
            concussion: false,
            callOfFlame: false,
            // Elemental Fury: +5% damage per rank (10% at 2/2); crit 1.75x / 2.0x like other frost spells
            elementalFury: true,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,
            elementsGrace: false
        }
    },

    lightningBolt: {
        id: 10391,
        name: "Lightning Bolt",
        icon: "https://octowow.st/db/images/icons/large/spell_nature_lightning.png",
        school: "nature",
        damageMin: 419,
        damageMax: 468,
        spCoefficient: 0.85714,  // 85.714% spell power coefficient
        apCoefficient: 0.0,
        castTime: 3.0,            // 3 second cast time (can be reduced by Lightning Mastery talent)
        canCrit: true,
        canBeBuffedByStormstrike: true,  // Benefits from Stormstrike buff
        consumesStormstrikeCharge: true,  // Consumes Stormstrike charge
        hasElementsGraceCrit: false,  // Does NOT get crit bonus from Element's Grace
        isLightningSpell: true,       // Affected by Tidal Mastery and Call of Thunder
        modifiers: {
            stormstrike: true,      // Benefits from and consumes Stormstrike charge, +25%
            concussion: true,       // +5% damage
            callOfFlame: false,     // Only applies to Fire spells
            elementalFury: true,    // +10% damage, 2x crit damage (nature)
            elementalWeapons: false,
            curseOfElements: false, // Only applies to Fire/Frost
            improvedScorch: false,  // Only applies to Fire
            nightfall: true,        // +10% damage
            elementsGrace: false,   // Does NOT get crit bonus from Element's Grace
            elementalMastery: true, // +15% damage when active
            naturalAlignmentCrystal: true,  // +20% spell damage when active
            tidalMastery: true      // +1-5% damage (lightning spells)
        }
    },

    chainLightning: {
        id: 10605,
        name: "Chain Lightning",
        icon: "https://octowow.st/db/images/icons/large/spell_nature_chainlightning.png",
        school: "nature",
        damageMin: 493,
        damageMax: 552,
        spCoefficient: 0.71428,  // 71.428% spell power coefficient
        apCoefficient: 0.0,
        castTime: 2.5,
        cooldown: 6,
        canCrit: true,
        canBeBuffedByStormstrike: true,
        consumesStormstrikeCharge: true,
        hasElementsGraceCrit: false,
        isLightningSpell: true,
        modifiers: {
            stormstrike: true,
            concussion: true,
            callOfFlame: false,
            elementalFury: true,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,
            elementsGrace: false,
            elementalMastery: true,
            naturalAlignmentCrystal: true,
            tidalMastery: true
        }
    },

    moltenBlast: {
        id: 0,
        name: "Molten Blast",
        icon: "https://octowow.st/db/images/icons/large/spell_fire_meteorstorm.png",
        school: "fire",
        castTime: 2.0,
        damageMin: 290,
        damageMax: 332,
        spCoefficient: 0.571428,  // 57.1428% spell power coefficient
        apCoefficient: 0.0,
        canCrit: true,
        canBeBuffedByStormstrike: false,
        hasElementsGraceCrit: false,  // EG crit only affects shocks, SS, LS
        refreshesFlameShock: true,
        modifiers: {
            stormstrike: false,
            concussion: true,
            callOfFlame: true,
            elementalFury: true,
            elementalWeapons: true,
            curseOfElements: true,
            improvedScorch: true,
            nightfall: true,
            elementsGrace: true,
            elementalMastery: true,
            naturalAlignmentCrystal: true
        }
    },

    earthquake: {
        id: 48308,
        name: "Earthquake",
        icon: "https://octowow.st/db/images/icons/large/spell_nature_earthquake.png",
        school: "nature",
        damageMin: 587,
        damageMax: 634,
        spCoefficient: 0.71428,  // 71.43% spell power coefficient
        apCoefficient: 0.0,
        castTime: 2.5,
        cooldown: 16,
        canCrit: true,
        canBeBuffedByStormstrike: true,
        consumesStormstrikeCharge: true,
        hasElementsGraceCrit: false,
        isLightningSpell: false,
        hasTidalMasteryCrit: false,
        hasAftershock: true,       // 30% aftershock at +4s (recalculated independently)
        aftershockDelay: 4,
        aftershockMultiplier: 0.30,
        hasAoeSplash: true,        // 35% of initial damage as Nature AoE to nearby enemies
        aoeSplashMultiplier: 0.35,
        modifiers: {
            stormstrike: true,
            concussion: true,
            callOfFlame: false,
            elementalFury: true,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: true,
            elementsGrace: false,
            elementalMastery: true,
            naturalAlignmentCrystal: true
        }
    },

    bloodlust: {
        id: 2825,
        name: "Bloodlust",
        icon: "https://octowow.st/db/images/icons/large/spell_nature_bloodlust.png",
        school: "nature",
        cooldown: 360,  // 6 minutes (360 seconds)
        castTime: 0,    // Instant cast
        isBuff: true,   // This is a buff, not a damage spell
        canCrit: false,
        canBeBuffedByStormstrike: false,
        consumesStormstrikeCharge: false,
        modifiers: {}   // No damage modifiers for buffs
    },

    // Might of the Hippogryph 3pc — 150 Nature while Might has charges (any successful melee); charges drop on Auto / WF / Stormstrike / LS physical; PPM applies haste + charges
    hippogryphMightNature: {
        id: 0,
        name: "Might of the Hippogryph",
        icon: "https://octowow.st/db/images/icons/large/spell_lightning_lightningbolt01.png",
        school: "nature",
        damageMin: 150,
        damageMax: 150,
        spCoefficient: 0,
        apCoefficient: 0,
        canCrit: true,
        usesStandardCritMultiplier: true,
        canBeBuffedByStormstrike: true,
        consumesStormstrikeCharge: false,
        isHippogryphMightProc: true,
        hideFromAbilityList: true,
        hasElementsGraceCrit: false,
        modifiers: {
            stormstrike: true,
            elementalFury: true,
            concussion: false,
            callOfFlame: false,
            elementalWeapons: false,
            curseOfElements: false,
            improvedScorch: false,
            nightfall: false,
            elementsGrace: false,
            elementalMastery: false,
            naturalAlignmentCrystal: false
        }
    }
};

/**
 * Get spell data by name
 */
export function getSpell(spellName) {
    return shamanSpells[spellName];
}

/**
 * Get all damage spells (excluding buffs like Stormstrike)
 */
export function getDamageSpells() {
    return Object.entries(shamanSpells)
        .filter(([key, spell]) =>
            (spell.damageMin !== undefined || spell.damagePerTick !== undefined) && !spell.hideFromAbilityList)
        .map(([key, spell]) => ({ key, ...spell }));
}
