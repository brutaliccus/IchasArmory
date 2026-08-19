// modules/races.js (Updated with full racial bonus data)

// NOTE: High Elf stats copied from Night Elf, Goblin stats copied from Gnome
export const baseStats = {
    warrior: {
        baseHealth: 1509,
        baseArmor: 0,
        human: { str: 120, agi: 80, sta: 110, int: 30, spi: 47 },
        dwarf: { str: 122, agi: 75, sta: 113, int: 29, spi: 44 },
        nightelf: { str: 117, agi: 85, sta: 109, int: 30, spi: 45 },
        highelf: { str: 117, agi: 85, sta: 109, int: 30, spi: 45 },
        gnome: { str: 115, agi: 83, sta: 109, int: 35, spi: 45 },
        orc: { str: 123, agi: 77, sta: 112, int: 27, spi: 48 },
        troll: { str: 121, agi: 82, sta: 111, int: 26, spi: 46 },
        tauren: { str: 125, agi: 75, sta: 112, int: 25, spi: 47 },
        undead: { str: 119, agi: 78, sta: 111, int: 28, spi: 50 },
        goblin: { str: 115, agi: 83, sta: 109, int: 35, spi: 45 },
    },
    paladin: {
        baseHealth: 1201,
        baseMana: 1232,
        baseArmor: 0,
        human: { str: 105, agi: 65, sta: 100, int: 70, spi: 79 },
        dwarf: { str: 107, agi: 61, sta: 103, int: 69, spi: 74 },
        highelf: { str: 105, agi: 65, sta: 100, int: 73, spi: 78 },
    },
    hunter: {
        baseHealth: 1287,
        baseMana: 1440,
        baseArmor: 0,
        human: { str: 75, agi: 105, sta: 92, int: 70, spi: 77 },
        dwarf: { str: 57, agi: 121, sta: 93, int: 64, spi: 69 },
        nightelf: { str: 52, agi: 130, sta: 89, int: 65, spi: 70 },
        highelf: { str: 72, agi: 110, sta: 91, int: 73, spi: 75 },
        gnome: { str: 70, agi: 108, sta: 91, int: 75, spi: 75 },
        orc: { str: 58, agi: 122, sta: 92, int: 62, spi: 73 },
        troll: { str: 56, agi: 127, sta: 91, int: 61, spi: 71 },
        tauren: { str: 60, agi: 120, sta: 92, int: 60, spi: 72 },
        undead: { str: 74, agi: 103, sta: 93, int: 68, spi: 80 },
        goblin: { str: 70, agi: 108, sta: 91, int: 75, spi: 75 },
    },
    rogue: {
        baseHealth: 1132,
        baseArmor: 80,
        human: { str: 80, agi: 130, sta: 75, int: 50, spi: 67 },
        dwarf: { str: 82, agi: 126, sta: 78, int: 49, spi: 64 },
        nightelf: { str: 77, agi: 135, sta: 74, int: 50, spi: 65 },
        highelf: { str: 77, agi: 135, sta: 73, int: 53, spi: 65 },
        gnome: { str: 75, agi: 133, sta: 74, int: 55, spi: 65 },
        orc: { str: 83, agi: 127, sta: 77, int: 47, spi: 68 },
        troll: { str: 81, agi: 132, sta: 76, int: 46, spi: 66 },
        undead: { str: 79, agi: 128, sta: 76, int: 48, spi: 70 },
        goblin: { str: 77, agi: 132, sta: 75, int: 55, spi: 65 },
    },
    priest: {
        baseHealth: 1003,
        baseMana: 1436,
        baseArmor: 0,
        human: { str: 55, agi: 55, sta: 72, int: 110, spi: 127 },
        dwarf: { str: 57, agi: 51, sta: 75, int: 109, spi: 124 },
        nightelf: { str: 52, agi: 60, sta: 71, int: 110, spi: 125 },
        highelf: { str: 52, agi: 60, sta: 71, int: 113, spi: 125 },
        troll: { str: 56, agi: 57, sta: 73, int: 106, spi: 126 },
        undead: { str: 54, agi: 53, sta: 73, int: 108, spi: 130 },
    },
    mage: {
        baseHealth: 1190,
        baseMana: 933,
        baseArmor: 0,
        human: { str: 30, agi: 35, sta: 45, int: 125, spi: 126 },
        dwarf: { str: 52, agi: 46, sta: 70, int: 114, spi: 114 },
        gnome: { str: 25, agi: 38, sta: 44, int: 134, spi: 120 },
        highelf: { str: 27, agi: 37, sta: 43, int: 129, spi: 119 },
        troll: { str: 31, agi: 37, sta: 46, int: 121, spi: 121 },
        undead: { str: 29, agi: 33, sta: 46, int: 123, spi: 125 },
        orc: { str: 53, agi: 47, sta: 69, int: 112, spi: 118 },
    },
    warlock: {
        baseHealth: 903,
        baseMana: 1373,
        baseArmor: 0,
        human: { str: 55, agi: 55, sta: 72, int: 110, spi: 117 },
        gnome: { str: 50, agi: 58, sta: 72, int: 120, spi: 115 },
        undead: { str: 54, agi: 53, sta: 73, int: 113, spi: 120 },
        orc: { str: 58, agi: 52, sta: 74, int: 112, spi: 118 },
        troll: { str: 56, agi: 57, sta: 73, int: 111, spi: 116 },
        goblin: { str: 50, agi: 58, sta: 72, int: 120, spi: 115 },
    },
    shaman: {
        baseHealth: 1100,
        baseMana: 1240,
        baseArmor: 0,
        orc: { str: 88, agi: 52, sta: 97, int: 87, spi: 103 },
        troll: { str: 86, agi: 57, sta: 96, int: 86, spi: 101 },
        tauren: { str: 90, agi: 50, sta: 97, int: 85, spi: 102 },
    },
    druid: {
        baseHealth: 1303,
        baseMana: 964,
        baseArmor: 0,
        nightelf: { str: 62, agi: 65, sta: 69, int: 100, spi: 110 },
        tauren: { str: 70, agi: 55, sta: 72, int: 95, spi: 112 },
    }
};

// --- VVV NEW RACIAL BONUSES DATABASE VVV ---
const racialBonuses = {
    human: [
        { text: "+3 Sword Skill", stats: { swordSkill: 3 } },
        { text: "+3 Two-Handed Sword Skill", stats: { twoHandedSwordSkill: 3 } },
        { text: "+3 Mace Skill", stats: { maceSkill: 3 } },
        { text: "+3 Two-Handed Mace Skill", stats: { twoHandedMaceSkill: 3 } },
        { text: "+5% Spirit", stats: { spi_percent: 0.05 } },
        { text: "The Human Spirit: +5% Mana Regen While Casting", stats: { manaRegenWhileCasting_percent: 0.05 } },
        // Active: Perception (stealth detection + 2% crit for 20 sec, 3 min CD)
        // Passive: Diplomacy (+10% reputation)
    ],
    dwarf: [
        { text: "+3 Gun Skill", stats: { gunSkill: 3 } },
        { text: "+10 Frost Resistance", stats: { frostResistance: 10 } },
        // Active: Stoneform (immune bleed/poison/disease, -5% physical damage, 8 sec, 3 min CD)
        // Active: Find Treasure
    ],
    gnome: [
        { text: "+5% Intellect", stats: { intellect_percent: 0.05 } },
        { text: "+5% Damage vs Mechanical", stats: { damageVsMechanical_percent: 0.05 } },
        // Active: Escape Artist (remove immobilize/slow, 0.5 sec cast, 1.5 min CD)
        // Passive: Engineering Specialization (+15 skill)
    ],
    nightelf: [
        { text: "+1% Dodge", stats: { dodge: 1.0 } },
        { text: "+1% Attack Speed", stats: { attackSpeed_percent: 0.01 } },
        { text: "+1% Casting Speed", stats: { castSpeed_percent: 0.01 } },
        { text: "+1% Movement Speed", stats: { movementSpeed_percent: 0.01 } },
        { text: "+10 Nature Resistance", stats: { natureResistance: 10 } },
        // Active: Shadowmeld (stealth, 1 min CD)
        // Passive: Wisp Spirit (+50% ghost speed)
    ],
    highelf: [
        { text: "+2% Agility", stats: { agi_percent: 0.02 } },
        { text: "+3 Bow Skill", stats: { bowSkill: 3 } },
        // Active: Quel'dorei Meditation (restore 10% mana/20 rage/50 energy over 5 sec, 3 min CD)
        // Passive: Enchanting Specialization (+15 skill)
    ],
    orc: [
        { text: "+3 Axe Skill", stats: { axeSkill: 3 } },
        { text: "+3 Two-Handed Axe Skill", stats: { twoHandedAxeSkill: 3 } },
        { text: "+5% Pet Damage", stats: { petDamage_percent: 0.05 } },
        { text: "Hardiness: -15% Stun Duration", stats: { stunDuration_percent: -0.15 } },
        // Active: Blood Fury (+200% of level as AP and spell damage for 15 sec, -25% healing for 25 sec, 2 min CD)
    ],
    troll: [
        { text: "+3 Bow Skill", stats: { bowSkill: 3 } },
        { text: "+3 Throwing Skill", stats: { throwingSkill: 3 } },
        { text: "+5% Damage vs Beasts", stats: { damageVsBeasts_percent: 0.05 } },
        { text: "+20% Health Regeneration", stats: { healthRegen_percent: 0.20 } },
        { text: "25% Health Regen in Combat", stats: { healthRegenInCombat_percent: 0.25 } },
        // Active: Berserking (+10-15% attack/cast speed for 10 sec based on health, 3 min CD)
    ],
    tauren: [
        { text: "+5% Health", stats: { health_percent: 0.05 } },
        { text: "+10 Nature Resistance", stats: { natureResistance: 10 } },
        // Active: War Stomp (stun up to 5 enemies within 8 yds for 2 sec, 2.5 min CD)
        // Passive: Cultivation (+15 Herbalism)
    ],
    undead: [
        { text: "+2% Damage vs Humanoid/Undead (PvE)", stats: { damageVsHumanoidUndead_percent: 0.02 } },
        // Active: Will of the Forsaken (immune charm/fear/sleep for 3 sec, 2.5 min CD)
        // Active: Cannibalize (7% health every 2 sec for 10 sec from corpse, 2 min CD)
        // Passive: Underwater Breathing (300% longer)
    ],
    goblin: [
        { text: "+3 Dagger Skill", stats: { daggerSkill: 3 } },
        { text: "+3 Mace Skill", stats: { maceSkill: 3 } },
        // Active: Exit Strategy (+40% movement speed for 5 sec, can't attack/cast, 3 min CD)
        // Passive: Prospecting (+10 Mining and Jewelcrafting)
    ],
};

/** Race portrait basenames on Chronicle turtle CDN (race_*). */
export const raceIconData = {
    human: { name: 'Human', icon: 'race_human' },
    dwarf: { name: 'Dwarf', icon: 'race_dwarf' },
    nightelf: { name: 'Night Elf', icon: 'race_night_elf' },
    highelf: { name: 'High Elf', icon: 'race_high_elf' },
    gnome: { name: 'Gnome', icon: 'race_gnome' },
    orc: { name: 'Orc', icon: 'race_orc' },
    troll: { name: 'Troll', icon: 'race_troll' },
    tauren: { name: 'Tauren', icon: 'race_tauren' },
    undead: { name: 'Undead', icon: 'race_forsaken' },
    goblin: { name: 'Goblin', icon: 'race_goblin' },
};

/**
 * Returns an array of all racial bonus objects for the selected race.
 * @param {string} raceId
 * @returns {Array<object>}
 */
export function getRaceBonuses(raceId) {
    // Normalize race ID to lowercase to avoid case-sensitivity issues
    const normalizedRaceId = raceId ? raceId.toLowerCase() : 'human';
    return racialBonuses[normalizedRaceId] || [];
}

/**
 * Aggregates all stat bonuses from a race's racials.
 * @param {string} raceId
 * @returns {object} A combined stats object.
 */
export function getSelectedRaceBonuses(raceId) {
    // Normalize race ID to lowercase to avoid case-sensitivity issues
    const normalizedRaceId = raceId ? raceId.toLowerCase() : 'human';
    const bonuses = getRaceBonuses(normalizedRaceId);
    const combinedStats = {};
    bonuses.forEach(bonus => {
        Object.assign(combinedStats, bonus.stats);
    });
    return combinedStats;
}