// modules/shamanTalents.js - Shaman talent modifiers for DPS simulation

/**
 * Shaman talent and buff modifiers
 * Each modifier has a value (percentage or absolute) and conditions
 */
export const shamanModifiers = {
    // Talent: Stormstrike buff
    stormstrike: {
        name: "Stormstrike",
        value: 0.25,  // +25% to nature damage
        type: "multiplicative",
        duration: 12,
        charges: 2,
        consumesCharge: true
    },

    // Talent: Concussion (5/5)
    concussion: {
        name: "Concussion",
        value: 0.05,  // +5% to all damage
        type: "multiplicative",
        ranks: 5,
        perRank: 0.01  // 1% per rank
    },

    // Talent: Call of Flame (3/3)
    callOfFlame: {
        name: "Call of Flame",
        value: 0.15,  // +15% to fire damage
        type: "multiplicative",
        ranks: 3,
        perRank: 0.05,  // 5% per rank
        schoolRestriction: "fire"
    },

    // Talent: Elemental Fury
    elementalFury: {
        name: "Elemental Fury",
        value: 0.10,  // +10% to elemental damage (max rank)
        type: "multiplicative",
        critMultiplier: 2.0,  // 2x crit damage instead of 1.5x
        ranks: 2,
        perRank: 0.05  // 5% per rank (5/10%)
    },

    // Talent: Elemental Weapons (3/3)
    elementalWeapons: {
        name: "Elemental Weapons",
        value: 0.30,  // +30% to fire spells and totems when Flametongue is active
        type: "multiplicative",
        ranks: 3,
        perRank: 0.10,  // 10% per rank (10/20/30%)
        requiresFlametongue: true
    },

    // Talent: Improved Fire Totems (2/2)
    improvedFireTotems: {
        name: "Improved Fire Totems",
        attackSpeedIncrease: 0.10,  // +10% attack speed at 2/2 (5% per rank)
        perRank: 0.05,              // 5% per rank
        novaDelayReduction: 2,      // -2s delay at 2/2 (1s per rank)
        novaDelayPerRank: 1,        // 1s per rank
        ranks: 2
    },

    // Talent: Reverberation
    reverberation: {
        name: "Reverberation",
        shockCooldownReduction: 1.0,  // -1s to shock cooldowns (6s -> 5s)
        ranks: 5
    },

    // Talent: Stable Shields
    stableShields: {
        name: "Stable Shields",
        lightningShieldICD: 4.0,  // Increases ICD from 3s to 4s
        ranks: 1
    },

    // Talent: Tidal Mastery (5/5) - increases crit chance of lightning spells by 1-5%
    // NOT a damage modifier; applied as crit in damageCalc.js applySpellCrit
    tidalMastery: {
        name: "Tidal Mastery",
        ranks: 5,
        perRank: 0.01
    },

    // Debuff: Curse of Elements
    curseOfElements: {
        name: "Curse of Elements",
        value: 0.10,  // +10% fire/frost/nature/shadow damage
        type: "multiplicative",
        isDebuff: true
    },

    // Debuff: Improved Scorch
    improvedScorch: {
        name: "Improved Scorch",
        value: 0.15,  // +15% fire damage
        type: "multiplicative",
        isDebuff: true,
        stacks: 5,
        schoolRestriction: "fire"
    },

    // Debuff: Nightfall
    nightfall: {
        name: "Nightfall",
        value: 0.10,  // +10% spell damage
        type: "multiplicative",
        isDebuff: true
    },

    // Set Bonus: T2 3-piece
    t2ThreePiece: {
        name: "Ten Storms 3pc",
        empoweredLSCooldownReduction: 0.5,  // -0.5s to empowered LS (9s -> 8.5s)
        isSetBonus: true
    },

    // Talent: Element's Grace (5/5)
    elementsGrace: {
        name: "Element's Grace",
        damageBonus: 0.10,        // +10% damage to Lightning Strike and Stormstrike
        critBonus: 0.10,          // +10% crit chance to affected abilities
        ranks: 5,
        perRankDamage: 0.02,      // 2% damage per rank
        perRankCrit: 0.02,        // 2% crit per rank
        affectedAbilities: [
            "Lightning Strike",
            "Stormstrike",
            "Earth Shock",
            "Frost Shock",
            "Frostbrand Weapon",
            "Fire Nova Totem",
            "Magma Totem",
            "Searing Totem"
        ]
    },

    // Talent: Elemental Devastation (3/3)
    elementalDevastation: {
        name: "Elemental Devastation",
        procType: "onSpellCrit",   // Procs on spell crit
        duration: 10,              // 10s duration
        ranks: 3,
        perRank: 3,                // 3% melee crit per rank
        meleeCritBonus: [0, 3, 6, 9]  // Melee crit bonus by rank
    },

    // Talent: Flurry (5/5)
    flurry: {
        name: "Flurry",
        procType: "onMeleeCrit",   // Melee crits via trigger router; spell crits handled in combatSim
        maxAttacks: 3,             // Lasts for 3 attacks
        ranks: 5,
        hasteBonus: [0, 8, 11, 14, 17, 20]  // Haste % by rank
    },

    // Talent: Elemental Mastery (1/1) - Active ability with cooldown
    elementalMastery: {
        name: "Elemental Mastery",
        value: 0.15,  // +15% to fire, frost, and nature damage
        type: "multiplicative",
        ranks: 1,
        duration: 15,  // 15 seconds duration
        cooldown: 180, // 3 minutes cooldown
        schoolRestriction: ["fire", "frost", "nature"]  // Applies to fire, frost, and nature spells (and totems)
    },

    // Trinket: Natural Alignment Crystal - Active trinket with cooldown
    naturalAlignmentCrystal: {
        name: "Natural Alignment Crystal",
        value: 0.20,  // +20% to all spell damage
        type: "multiplicative",
        duration: 20,  // 20 seconds duration
        appliesToTotems: true  // Also applies to totem damage
    }
};

/**
 * Character stats that affect damage calculations
 */
export class ShamanStats {
    constructor() {
        this.spellPower = 0;
        this.natureDamage = 0;   // +Nature spell damage
        this.fireDamage = 0;     // +Fire spell damage
        this.frostDamage = 0;    // +Frost spell damage (Frostbrand, frost gear, elixirs)
        this.attackPower = 0;
        this.spellCrit = 0;      // As decimal (e.g., 0.25 for 25%)
        /** Raid debuff Winter's Chill: extra spell crit (decimal) for Frost school only */
        this.wintersChillFrostCritBonus = 0;
        this.meleeCrit = 0;      // As decimal (e.g., 0.25 for 25% melee crit)
        this.spellHit = 0;       // As decimal (e.g., 0.12 for 12%)
        this.meleeHit = 0;       // As decimal (e.g., 0.06 for 6% melee hit)
        this.spellPen = 0;       // Spell penetration (reduces target resist for binary hit + partial resist math)
        this.weaponSkill = 0;    // Weapon skill bonus (e.g., 5 from talents/gear)
        this.natureResist = 0;   // Target's nature resistance
        this.fireResist = 0;     // Target's fire resistance
        this.frostResist = 0;    // Target's frost resistance
        this.shadowResist = 0;   // Target's shadow resistance
        this.arcaneResist = 0;   // Target's arcane resistance
        this.holyResist = 0;     // Target's holy resistance (rare on raid bosses)
        /** Per-school immunity: if true, that school deals 0 (no rolls). Set from DPS boss JSON / in-session sim target. */
        this.targetSchoolImmune = {
            physical: false,
            nature: false,
            fire: false,
            frost: false,
            shadow: false,
            arcane: false,
            holy: false,
        };
        /** DPS sim target creature tag (from boss JSON `faction`); e.g. undead, beast — for target-type-specific effects. */
        this.targetFaction = 'unknown';
        this.targetLevel = 63;   // Target level (default: raid boss)
        this.playerLevel = 60;
        this.targetArmor = 3731; // Target's armor (default: level 63 boss)
        this.weaponDamage = { min: 0, max: 0 };  // Weapon damage range
        this.weaponSpeed = 0;    // Weapon attack speed (for auto attack DPS)

        // Boss avoidance (for melee attacks)
        this.bossParryChance = 0.15;  // 15% parry (cannot be reduced, only from front)
        this.bossDodgeChance = 0.065; // 6.5% base dodge (reducible to 5% with weapon skill) - will be overridden from totals
        this.glancingBlowChance = 0.40; // 40% of auto attacks are glancing blows

        // Pre-calculated values from calculator (correct formulas)
        this.glancingDamagePercent = 65;  // Glancing blow damage % (from calculator totals)
        this.enemyDodgeChancePercent = 6.5;  // Enemy dodge chance % (from calculator totals)

        // Player defensive stats (for being attacked mechanics)
        this.dodge = 0;          // Dodge % (as decimal, e.g., 0.05 for 5%)
        this.parry = 0;          // Parry % (as decimal)
        this.block = 0;          // Block % (as decimal)
        this.blockValue = 0;     // Block value (flat damage reduction)
        this.defense = 300;      // Defense skill (default 300)
        this.armor = 0;          // Armor value
        this.physicalDR = 0;     // Physical damage reduction (as decimal, e.g., 0.5 for 50%)
        this.health = 0;         // Current health
        this.fortune = 0;        // % bonus to item-based proc trigger chances (multiplicative)

        // Combat situation configuration
        this.combatConfig = {
            wearingShield: false,      // Whether wearing a shield (for threat calculations)
            inFrontOfBoss: false,      // Whether in front of boss (affects parry)
            beingAttacked: false,      // Whether being attacked (affects Lightning Shield / Water Shield)
            waterShield: false,        // When true, use Water Shield instead of Lightning Shield (mana procs, EWS on LS)
            threatHold: false,         // Whether to delay DPS start to let tank establish threat
            threatHoldDuration: 5,     // Seconds to hold before starting DPS (configurable, default 5)
            handOfEdwardSpell: 'lightningBolt', // Which spell HotEO instant-cast buff casts
            jewelForcedOutcome: '',    // '' = random; 'frost'|'fire'|'arcane'|'holy' = force that Jewel of Wild Magics proc every use
            enemySwingTimer: 2.0,      // Boss attack speed in seconds (default 2.0, like most raid bosses)
            aoeEnabled: false,         // When true, AOE abilities hit multiple targets
            aoeTargetCount: 5,         // Number of targets (e.g. 5 = primary + 4 additional)
            casterMode: false,         // When true, use caster (elemental) priority — no auto-attacks, all spells hard-cast
            searingTotemEnabled: true  // When false, sim skips auto Searing Totem (ST); Magma / Fire Nova redrop unchanged when AoE
        };

        // Active modifiers
        this.activeModifiers = {
            stormstrike: false,
            stormstrikeCharges: 0,
            concussion: 0,           // Ranks (0-5)
            callOfFlame: 0,          // Ranks (0-3)
            elementalFury: 0,        // Ranks (0-2)
            elementalWeapons: 0,     // Ranks (0-2)
            improvedFireTotems: 0,   // Ranks (0-2)
            reverberation: 0,        // Ranks (0-5)
            stableShields: 0,        // Ranks (0-3)
            elementsGrace: 0,        // Ranks (0-5)
            tidalMastery: 0,         // Ranks (0-5) — +crit to lightning spells
            callOfThunder: 0,        // Ranks (0-5); rank 5 = +6% LB/CL crit (Turtle), not +5%
            lightningMastery: 0,     // Seconds of cast time reduction (ranks * 0.2)
            improvedMoltenBlast: 0,  // Ranks (0-2)
            elementalDevastation: 0, // Ranks (0-3)
            flurry: 0,               // Ranks (0-5)
            elementalMastery: false, // Active state (true when buff is active)
            naturalAlignmentCrystal: false, // Active state (true when buff is active)
            curseOfElements: false,
            improvedScorch: 0,       // Stacks (0-5)
            nightfall: false,
            t2ThreePiece: false,
            earthquake: 0,               // 0 or 1 (elemental capstone talent)
            flametongueActive: false,  // Flametongue imbue equipped
            frostbrandActive: false,   // Frostbrand Weapon imbue equipped
            ewFlametongueDamageBuffActive: false,  // EW fire damage proc active (set/cleared by sim)
            windfuryActive: false     // Windfury Weapon imbue active
        };

        // Set bonuses
        this.setBonuses = {};
    }

    /**
     * Convert ShamanStats to a plain object for serialization (for Web Workers)
     */
    toJSON() {
        return {
            spellPower: this.spellPower,
            natureDamage: this.natureDamage,
            fireDamage: this.fireDamage,
            frostDamage: this.frostDamage || 0,
            attackPower: this.attackPower,
            spellCrit: this.spellCrit,
            wintersChillFrostCritBonus: this.wintersChillFrostCritBonus || 0,
            meleeCrit: this.meleeCrit,
            spellHit: this.spellHit,
            meleeHit: this.meleeHit,
            spellPen: this.spellPen || 0,
            weaponSkill: this.weaponSkill,
            natureResist: this.natureResist,
            fireResist: this.fireResist,
            frostResist: this.frostResist,
            shadowResist: this.shadowResist,
            arcaneResist: this.arcaneResist,
            holyResist: this.holyResist,
            targetSchoolImmune: this.targetSchoolImmune
                ? { ...this.targetSchoolImmune }
                : {
                    physical: false,
                    nature: false,
                    fire: false,
                    frost: false,
                    shadow: false,
                    arcane: false,
                    holy: false,
                },
            targetFaction: this.targetFaction || 'unknown',
            targetLevel: this.targetLevel,
            playerLevel: this.playerLevel,
            targetArmor: this.targetArmor,
            armorPen: this.armorPen || 0,
            weaponDamage: (this.weaponDamage && typeof this.weaponDamage === 'object') ? { ...this.weaponDamage } : this.weaponDamage,
            weaponSpeed: this.weaponSpeed,
            baseWeaponSpeed: this.baseWeaponSpeed,
            bossParryChance: this.bossParryChance,
            bossDodgeChance: this.bossDodgeChance,
            glancingBlowChance: this.glancingBlowChance,
            glancingDamagePercent: this.glancingDamagePercent,
            enemyDodgeChancePercent: this.enemyDodgeChancePercent,
            dodge: this.dodge,
            parry: this.parry,
            block: this.block,
            blockValue: this.blockValue,
            defense: this.defense,
            armor: this.armor,
            physicalDR: this.physicalDR,
            health: this.health,
            fortune: this.fortune || 0,
            combatConfig: { ...this.combatConfig },
            activeModifiers: { ...this.activeModifiers },
            setBonuses: { ...this.setBonuses }
        };
    }

    /**
     * Create ShamanStats from a plain object (for Web Workers)
     */
    static fromJSON(data) {
        const stats = new ShamanStats();
        Object.assign(stats, data);
        return stats;
    }

    /**
     * Set talent ranks
     */
    setTalent(talentName, ranks) {
        if (this.activeModifiers.hasOwnProperty(talentName)) {
            this.activeModifiers[talentName] = ranks;
        }
    }

    /**
     * Toggle a boolean modifier
     */
    toggleModifier(modifierName, active) {
        if (this.activeModifiers.hasOwnProperty(modifierName)) {
            this.activeModifiers[modifierName] = active;
        }
    }

    /**
     * Get the total modifier value for a specific spell and modifier type
     */
    getModifierValue(modifierName, spell) {
        const modifier = shamanModifiers[modifierName];
        if (!modifier) return 0;

        // Check if modifier applies to this spell
        const hasSpellFlag = spell.modifiers && spell.modifiers[modifierName];
        // Frostbrand is frost spell damage: always allow Elemental Fury (+5%/rank damage) even if modifiers omit the flag
        const forceEfOnFrostbrand = modifierName === 'elementalFury' && spell.isFrostbrandProc;
        if (!hasSpellFlag && !forceEfOnFrostbrand) {
            return 0;
        }

        // Get active value
        const activeValue = this.activeModifiers[modifierName];

        // Boolean modifiers
        if (typeof activeValue === 'boolean') {
            return activeValue ? modifier.value : 0;
        }

        // Ranked modifiers
        if (typeof activeValue === 'number' && modifier.perRank) {
            return activeValue * modifier.perRank;
        }

        // Fixed value modifiers
        if (typeof activeValue === 'number' && activeValue > 0) {
            return modifier.value;
        }

        return 0;
    }

    /**
     * Get all applicable damage modifiers for a spell
     * @param {Object} spell - The spell to get modifiers for
     * @param {Object} options - Options for filtering modifiers
     * @param {boolean} options.excludeDebuffs - If true, exclude raid debuffs (for tooltip display)
     */
    getAllDamageModifiers(spell, options = {}) {
        const modifiers = [];
        const excludeDebuffs = options.excludeDebuffs || false;

        // Check each modifier
        for (const [modifierName, modifierData] of Object.entries(shamanModifiers)) {
            if (modifierData.type === 'multiplicative') {
                // Skip Nightfall - it's a dynamic boss debuff applied in rollDamage(), not a static modifier
                if (modifierName === 'nightfall') {
                    continue;
                }
                
                // Skip debuffs if requested (for tooltip display - debuffs shouldn't show as personal modifiers)
                if (excludeDebuffs && modifierData.isDebuff) {
                    continue;
                }
                
                const value = this.getModifierValue(modifierName, spell);
                if (value > 0) {
                    // Elemental Weapons: timed proc (5s on melee hit), same pattern as Stormstrike
                    if (modifierName === 'elementalWeapons') {
                        if (this.activeModifiers.ewFlametongueDamageBuffActive) {
                            modifiers.push({ name: modifierData.name, value });
                        }
                        continue;
                    }

                    // Stormstrike: check charges
                    if (modifierName === 'stormstrike') {
                        if (this.activeModifiers.stormstrikeCharges > 0 && spell.canBeBuffedByStormstrike) {
                            modifiers.push({ name: modifierData.name, value });
                        }
                    } else {
                        modifiers.push({ name: modifierData.name, value });
                    }
                }
            }
        }

        // Add Element's Grace damage bonus (only for Lightning Strike and Stormstrike)
        if (spell.hasElementsGraceDamage && this.activeModifiers.elementsGrace > 0) {
            const elementsGrace = shamanModifiers.elementsGrace;
            const damageBonus = this.activeModifiers.elementsGrace * elementsGrace.perRankDamage;
            modifiers.push({ name: "Element's Grace", value: damageBonus });
        }


        // Earthfury Battlegear 5-set: +45% Flametongue Weapon damage vs Flame Shock targets
        // For DPS calculations, we assume Flame Shock is always on the target (Enhancement should maintain it)
        if (spell.isFlametongueProc && this.setBonuses?.earthfury_5pc_flametongue_vs_flameshock) {
            modifiers.push({ 
                name: "Earthfury 5pc (vs FS)", 
                value: this.setBonuses.earthfury_5pc_flametongue_vs_flameshock 
            });
        }

        return modifiers;
    }

    /**
     * Get Element's Grace crit bonus for a spell
     */
    getElementsGraceCritBonus(spell) {
        if (spell.hasElementsGraceCrit && this.activeModifiers.elementsGrace > 0) {
            const elementsGrace = shamanModifiers.elementsGrace;
            return this.activeModifiers.elementsGrace * elementsGrace.perRankCrit;
        }
        return 0;
    }

    /**
     * Get effective boss dodge chance (reduced by weapon skill)
     * Uses pre-calculated value from calculator (correct formula: 6.5 - ((weaponSkill - 300) * 0.1))
     */
    getEffectiveBossDodgeChance() {
        // Use pre-calculated enemy dodge chance from calculator totals (as percent, convert to decimal)
        return (this.enemyDodgeChancePercent || 6.5) / 100;
    }

    /**
     * Get total melee avoidance (miss + dodge + parry)
     * @param {boolean} isAutoAttack - If true, considers attacking from behind (no parry)
     */
    getTotalMeleeAvoidance(isAutoAttack = false) {
        const baseMeleeHitChance = 0.92; // 8% base miss
        const effectiveMeleeHit = Math.min(baseMeleeHitChance + this.meleeHit, 1.0);
        const missChance = 1 - effectiveMeleeHit;
        const dodgeChance = this.getEffectiveBossDodgeChance();
        // Parry only applies when in front of boss
        const parryChance = this.combatConfig.inFrontOfBoss ? this.bossParryChance : 0;

        return {
            miss: missChance,
            dodge: dodgeChance,
            parry: parryChance,
            total: missChance + dodgeChance + parryChance,
            landChance: 1 - (missChance + dodgeChance + parryChance)
        };
    }

    /**
     * Get glancing blow damage reduction
     * Uses pre-calculated value from calculator (correct formula: 65 + (min(15, weaponSkillOver300) * 2))
     */
    getGlancingBlowReduction() {
        // Use pre-calculated glancing damage from calculator totals (as percent, convert to decimal)
        const damageMultiplier = (this.glancingDamagePercent || 65) / 100;

        return {
            chance: this.glancingBlowChance,
            multiplier: damageMultiplier,
            averageMultiplier: (this.glancingBlowChance * damageMultiplier) + ((1 - this.glancingBlowChance) * 1.0)
        };
    }

    /**
     * Consume a Stormstrike charge
     */
    consumeStormstrikeCharge() {
        if (this.activeModifiers.stormstrikeCharges > 0) {
            this.activeModifiers.stormstrikeCharges--;
            // Remove the buff when charges reach 0
            if (this.activeModifiers.stormstrikeCharges === 0) {
                this.activeModifiers.stormstrike = false;
            }
        }
    }

    /**
     * Apply Stormstrike buff
     */
    applyStormstrike() {
        this.activeModifiers.stormstrike = true;
        this.activeModifiers.stormstrikeCharges = 2;
    }

    /**
     * Update combat configuration
     */
    setCombatConfig(configName, value) {
        if (this.combatConfig.hasOwnProperty(configName)) {
            this.combatConfig[configName] = value;
        }
    }

    /**
     * Calculate armor damage reduction multiplier
     * Formula: Damage Multiplier = 1 - (Armor / (Armor + 400 + 85 * AttackerLevel))
     * For level 60: Damage Multiplier = 1 - (Armor / (Armor + 5500))
     */
    getArmorDamageMultiplier() {
        const rawArmor = this.targetArmor || 0;
        const armorPen = this.armorPen || 0;
        const armor = Math.max(0, rawArmor - armorPen);
        const attackerLevel = this.playerLevel || 60;
        const armorConstant = 400 + 85 * attackerLevel; // 5500 at level 60

        if (armor <= 0) return 1.0;

        const damageReduction = armor / (armor + armorConstant);
        const damageMultiplier = 1 - damageReduction;

        return damageMultiplier;
    }
}

/**
 * Call of Thunder (Turtle): total crit to Lightning Bolt / Chain Lightning is +1/2/3/4/6% at ranks 1–5.
 * @param {number} ranks 0–5
 * @returns {number} Added crit as fraction (e.g. 0.06 at 5/5)
 */
export function callOfThunderCritBonusFraction(ranks) {
    const r = Math.min(5, Math.max(0, Math.floor(Number(ranks) || 0)));
    if (r <= 0) return 0;
    if (r >= 5) return 0.06;
    return r * 0.01;
}
