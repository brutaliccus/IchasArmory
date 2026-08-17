// modules/character/buffs.js
import { createGenericTooltip } from '../ui/tooltips.js';
import { KEY_MAP } from './stats.js';
import { resolveIconUrl } from '../gear/gear.js';

// no_slot.json has been removed — consumable tooltips use inline data only
const noSlotData = [];
async function loadNoSlotItems() { return noSlotData; }

// Spell data cache
let spellsData = null;

// Load spells.json
async function loadSpells() {
    if (spellsData) return spellsData;

    try {
        const response = await fetch('/assets/spells.json');
        spellsData = await response.json();
        return spellsData;
    } catch (error) {
        console.error('Failed to load spells.json:', error);
        return [];
    }
}

// Custom tooltip text for buffs (overrides spells.json)
// Use {armor}, {sta}, {agi}, etc. as placeholders that will be replaced with actual values
const customTooltips = {
    'Rockbiter Weapon': 'Imbue the Shaman\'s weapon, increasing melee attack power by 653 and all threat caused by 35% when using that weapon. Lasts for 1 hour.',
    'Windfury Weapon': 'Imbue the Shaman\'s weapon with wind. Each hit has a 25% chance of granting you 2 extra attacks with 333 extra melee attack power. Lasts for 1 hour.',
    'Frostbrand Weapon': 'Imbue the Shaman\'s weapon with frost. Each hit has a chance of causing 175 additional Frost damage and slowing the target\'s movement speed by 25% for 8 sec. Lasts for 1 hour.',
    'Water Shield': 'The caster is surrounded by 3 globes of rejuvenating water for 10 min. When a spell, melee or ranged attack hits the caster, 130 Mana is restored to the caster, spending one globe. This effect can only occur once every 3 sec. Only one elemental shield can be active on the Shaman at any one time.',
    'Lightning Shield': 'The caster is surrounded by 3 globes of unstable lightning for 10 min. When a spell, melee or ranged attack hits the caster, the attacker will be struck for 198 Nature damage, spending one globe. This effect can only occur once every 3 sec. Only one elemental shield can be active on the Shaman at any one time.',
    'Mark of the Wild': 'Increases the friendly target\'s armor by {armor}, all attributes by {sta} and all resistances by {resist} for 30 min.',
    'Power Word: Fortitude': 'Power infuses the target, increasing their Stamina by {sta} for 30 min.',
    'Grace of Air Totem': 'Summons a Grace of Air Totem with 5 health at the feet of the caster. The totem increases the agility of party members within 30 yards by {agi}. Lasts 2 min.',
    'Arcane Brilliance': 'Infuses the target\'s party with brilliance, increasing their Intellect by {int} for 1 hour.',
    'Devotion Aura': 'Gives {armor} additional armor to party members within 30 yards. Players may only have one Aura on them per Paladin at any one time.',
    'Blessing of Kings': 'Places a Blessing on the friendly target, increasing total stats by 10% for 10 min. Players may only have one Blessing on them per Paladin at any one time.',
    "Imp's Blood Pact": 'Increases party members\' Stamina by {sta}.',
    'Flask of the Titans': 'Increases the player\'s maximum health by {health} for 2 hours. You can only have the effect of one flask at a time. This effect persists through death.',
    'Elixir of the Mongoose': 'Increases Agility by {agi} and chance to get a critical hit by 2% for 1 hour.',
    'Elixir of Fortitude': 'Increases the player\'s maximum health by {health} for 1 hour.',
    'Elixir of Superior Defense': 'Increases armor by {armor} for 1 hour.',
    'Greater Stoneshield Potion': 'Increases armor by {armor} for 2 min.',
    'Dirge\'s Kickin\' Chimaerok Chops': 'Restores 2550 health over 30 sec. Must remain seated while eating. If you spend at least 10 seconds eating you will become well fed and gain {sta} Stamina for 15 min.',
    'Rumsey Rum Black Label': 'Increases Stamina by {sta} for 15 min and gets you drunk to boot!',
    'Spirit of Zanza': 'Increases the player\'s Spirit by 50 and Stamina by {sta} for 2 hours. You can only have the effect of one Zanza potion at a time.',
    'Medivhs Merlot': 'Increases Stamina by {sta} for 15 min and gets you drunk to boot!',
    'Le Fishe Au Chocolat': 'Increases dodge chance by 1% and defense by 4 for 15 min.',
    'Dragonbreath Chili': 'Occasionally belch flame at enemies struck in melee for 10 min.',
    // Weapon Mastery Books
    'Mastery of Axes': '+5 Axe Skill',
    'Mastery of Swords': '+5 Sword Skill',
    'Mastery of Hammers': '+5 Mace Skill',
    'Mastery of Daggers': '+5 Dagger Skill',
    'Mastery of Fist Weapons': '+5 Fist Weapon Skill',
    'Mastery of Polearms': '+5 Polearm Skill',
    'Mastery of Staves': '+5 Staff Skill',
    'Mastery of Bows': '+5 Bow Skill',
    'Mastery of Crossbows': '+5 Crossbow Skill',
    'Mastery of Guns': '+5 Gun Skill',
    'Mastery of Thrown': '+5 Thrown Skill',
    // Druid Forms
    'Cat Form': 'Shapeshift into cat form, increasing melee attack power by 120. In addition, agility provides an additional 1 melee attack power. Only druids can cast this spell. The druidic Cat Form is a versatile form that can pounce on enemies with swiftness.',
    'Dire Bear Form': 'Shapeshift into dire bear form, increasing melee attack power by 180, armor contribution from items by 360%, and health by 1240. The act of shapeshifting frees the caster of polymorph and movement impairing effects.',
    'Moonkin Form': 'Shapeshift into Moonkin Form, increasing armor contribution from items by 360% and spell critical strike chance by 3%. The Moonkin can only cast Balance spells while shapeshifted. The act of shapeshifting frees the caster of polymorph and movement impairing effects.',
    'Leader of the Pack': 'While in Cat, Bear or Dire Bear Form, the Leader of the Pack increases ranged and melee critical chance of all party members within 45 yards by 3%.',
    'Battle Shout': 'The warrior shouts, increasing the melee attack power of all party members within 20 yards by {ap}. Lasts 120 sec.',
    'Greater Blessing of Might': 'Gives all members of the raid or group that share the same class with the target the Greater Blessing of Might, increasing melee attack power by {ap} for 1800 sec. Players may only have one Blessing on them per Paladin at any one time.',
    'Trueshot Aura': 'Increases the attack power of party members within 45 yards by 5%, plus an additional {ap}. The aura lasts until canceled.',
    'Emerald Blessing': 'The druid and raid members within 80 yards are blessed by the Emerald Dream granting 10% movement speed, 1% spell hit chance, and allows 5% mana regeneration to continue while casting.',
    'Curse of the Elements': 'Curses the target for 300 sec, reducing Fire and Frost resistances by 75 and increasing Fire and Frost damage taken by 10%. Only one Curse per Warlock can be active on any one target.',
    'Sunder Armor': 'Sunders the target\'s armor, reducing it by 450 per Sunder Armor and causes a high amount of threat. Can be applied up to 5 times. Lasts 30 sec.',
    'Expose Armor': 'Finishing move that exposes the target for 30 sec, reducing armor per combo point. At 5 combo points, reduces armor by {armor}.',
    'Fire Vulnerability': 'Your Scorch and Fire Blast spells have a 100% chance to cause your target to be vulnerable to Fire damage. This vulnerability increases the Fire damage dealt to your target by 3% per stack and lasts 30 sec. Stacks up to 5 times (15% total).',
    'Nightfall': 'Raid debuff on the boss. When one person in the raid uses the Nightfall weapon, it procs Spell Vulnerability, increasing spell damage taken by 10% for 7 seconds. Has 35-50% uptime per iteration. This is modeled as a toggle - when enabled, the simulation will randomly generate Nightfall procs to achieve 35-50% uptime.',
    'Hemorrhage': 'Raid debuff on the boss. When rogues use Hemorrhage, it increases physical damage taken by 2% (base) or 4% (improved with Serrated Blades talent). Has 40-50% uptime (sporadic due to charge consumption). Click the + button to toggle improved version.',
    'Strength of Earth Totem': 'Summons a Strength of Earth Totem with 5 health at the feet of the caster. The totem increases the strength of party members within 30 yards by {str}. Lasts 120 sec.',
    'Fire Resistance Totem': 'Summons a Fire Resistance Totem with 5 health at the feet of the caster for 120 sec that increases the fire resistance of party members within 30 yards by 60.',
    'Frost Resistance Totem': 'Summons a Frost Resistance Totem with 5 health at the feet of the caster for 120 sec. The totem increases party members\' frost resistance by 60, if within 30 yards.',
    'Nature Resistance Totem': 'Summons a Nature Resistance Totem with 5 health at the feet of the caster for 120 sec that increases the nature resistance of party members within 30 yards by 60.',
    'Proclaim Champion': 'Proclaims a friendly target as your Champion for 7200 sec, reducing all damage taken by 5% and increasing all resistances by 60. Allows the use of various Champion spells on that target. In addition, you gain Mana equal to 2% of the damage taken by your Champion. Only one Champion can be proclaimed at a time.'
};

// Find spell by name and return the buff effect (not crafting recipe)
function findSpellByName(spellName) {
    if (!spellsData) return null;

    const matchingSpells = spellsData.filter(spell => spell.name === spellName);
    if (matchingSpells.length === 0) return null;

    // Prefer spells that don't have "Reagents:" in tooltip (avoid crafting recipes)
    const buffSpell = matchingSpells.find(spell =>
        spell.tooltip_html && !spell.tooltip_html.includes('Reagents:')
    );

    if (buffSpell) return buffSpell;

    // Fallback to highest rank if no buff-only spell found
    return matchingSpells[matchingSpells.length - 1];
}

// Find spell by ID
function findSpellById(spellId) {
    if (!spellsData) return null;
    return spellsData.find(spell => spell.id === spellId) || null;
}

// Raid Buffs - Stat Buffs (primary stats, stamina, intellect)
export const raidStatBuffs = [
    {
        id: 'motw',
        name: 'Mark of the Wild',
        icon: 'assets/icons/motw.jpg',
        // Base: +12 stats, +285 armor, +20 all resistances
        base_stats: {
            sta: 12,
            agi: 12,
            str: 12,
            int: 12,
            spi: 12,
            armor: 285,
            fireResist: 20,
            natureResist: 20,
            frostResist: 20,
            shadowResist: 20,
            arcaneResist: 20
        },
        // Improved: +35% talent bonus
        improved_stats: {
            sta: 16,
            agi: 16,
            str: 16,
            int: 16,
            spi: 16,
            armor: 384,
            fireResist: 27,      // 20 + floor(20 * 0.35) = 27
            natureResist: 27,
            frostResist: 27,
            shadowResist: 27,
            arcaneResist: 27
        }
    },
    {
        id: 'fortitude',
        name: 'Power Word: Fortitude',
        icon: 'assets/icons/fortitudepriest.jpg',
        // Base: +54 stamina
        base_stats: { sta: 54 },
        // Improved: +30% talent bonus
        improved_stats: { sta: 70 } // 54 + floor(54 * 0.30) = 70
    },
    {
        id: 'graceOfAir',
        name: 'Grace of Air Totem',
        icon: 'assets/icons/grace.jpg',
        // Base: +77 agility
        base_stats: { agi: 77 },
        // Improved: +25% talent bonus (for Enhancing Totems)
        improved_stats: { agi: 96 } // 77 + floor(77 * 0.25) = 96
    },
    {
        id: 'strengthOfEarthTotem',
        name: 'Strength of Earth Totem',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_earthbindtotem.png',
        spellId: 25361,  // Spell ID for tooltip lookup in spells.json
        // Base: +77 strength
        base_stats: { str: 77 },
        // Improved: +25% talent bonus (for Enhancing Totems)
        improved_stats: { str: 96 } // 77 + floor(77 * 0.25) = 96
    },
    { id: 'arcaneBrilliance', name: 'Arcane Brilliance', icon: 'https://octowow.st/db/images/icons/large/spell_holy_magicalsentry.png', base_stats: { int: 31 } },
    { id: 'bok', name: 'Blessing of Kings', icon: 'assets/icons/spell_magic_magearmor.jpg', base_stats: { stat_percent: 0.10 } },
    { id: 'bloodPact', name: "Imp's Blood Pact", icon: 'assets/icons/bloodpact.jpg', base_stats: { sta: 42 } }
];

// Raid Buffs - Defensive Buffs (armor, damage reduction, resistances)
export const raidDefensiveBuffs = [
    {
        id: 'devotionAura',
        name: 'Devotion Aura',
        icon: 'assets/icons/spell_holy_devotionaura.jpg',
        // Base: +735 armor
        base_stats: { armor: 735 },
        // Improved: +25% talent bonus
        improved_stats: { armor: 919 } // 735 + floor(735 * 0.25) = 919
    },
    {
        id: 'ancestralHealing',
        name: 'Ancestral Healing',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_undyingstrength.png',
        spellId: 16240,  // Spell ID for tooltip lookup in spells.json
        // Increases target's armor value by 25% for 15 sec after getting a critical effect from healing spells
        base_stats: { armor_percent: 0.25 }
    },
    {
        id: 'proclaimChampion',
        name: 'Proclaim Champion',
        icon: 'https://octowow.st/db/images/icons/large/spell_holy_proclaimchampion_02.png',
        base_stats: {
            damageReduction_percent: 0.05,  // 5% all damage reduction (physical and magical)
            fireResistance: 60,
            frostResistance: 60,
            natureResistance: 60,
            shadowResistance: 60,
            arcaneResistance: 60
        },
        exclusiveGroup: 'resistance_aura'
    },
    { id: 'fireResistanceTotem', name: 'Fire Resistance Totem', icon: 'https://octowow.st/db/images/icons/large/spell_fireresistancetotem_01.png', base_stats: { fireResistance: 60 }, exclusiveGroup: 'resistance_aura' },
    { id: 'frostResistanceTotem', name: 'Frost Resistance Totem', icon: 'https://octowow.st/db/images/icons/large/spell_frostresistancetotem_01.png', base_stats: { frostResistance: 60 }, exclusiveGroup: 'resistance_aura' },
    { id: 'natureResistanceTotem', name: 'Nature Resistance Totem', icon: 'https://octowow.st/db/images/icons/large/spell_nature_natureresistancetotem.png', base_stats: { natureResistance: 60 }, exclusiveGroup: 'resistance_aura' },
    {
        id: 'shadowResistanceTotem',
        spellId: 19896,  // Spell ID for icon, name, and tooltip lookup in spells.json
        base_stats: { shadowResistance: 60 },
        exclusiveGroup: 'resistance_aura'
    }
];

// Raid Buffs - Offensive Buffs (attack power, crit, spell hit)
export const raidOffensiveBuffs = [
    {
        id: 'battleShout',
        name: 'Battle Shout',
        icon: 'https://octowow.st/db/images/icons/large/ability_warrior_battleshout.png',
        // Base: +232 AP (Rank 7)
        base_stats: { ap: 232 },
        // Improved: +25% talent bonus
        improved_stats: { ap: 290 } // 232 + floor(232 * 0.25) = 290
    },
    {
        id: 'blessingOfMight',
        name: 'Greater Blessing of Might',
        icon: 'https://octowow.st/db/images/icons/large/spell_holy_greaterblessingofkings.png',
        // Base: +185 AP
        base_stats: { ap: 185 },
        // Improved Blessing of Might: 20% more → 185 × 1.20 = 222
        improved_stats: { ap: 222 }
    },
    {
        id: 'leaderOfThePack',
        name: 'Leader of the Pack',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_unyeildingstamina.png',
        // +3% crit
        base_stats: { crit: 3 }
    },
    {
        id: 'trueshotAura',
        name: 'Trueshot Aura',
        icon: 'https://octowow.st/db/images/icons/large/ability_trueshot.png',
        // +5% AP + 55 flat AP
        base_stats: { ap_percent: 0.05, ap: 55 }
    },
    {
        id: 'emeraldBlessing',
        name: 'Emerald Blessing',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_protectionformnature.png',
        // +10% movement speed, +1% spell hit, +5% mana regen while casting
        base_stats: { spellHit: 1 },
        // Note: Movement speed and mana regen while casting are not tracked in current stat system
    },
    {
        id: 'moonkinAura',
        name: 'Moonkin Aura',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_moonglow.png',
        base_stats: { spellCrit: 3 },
        tooltip: 'Increases your chance to critical strike with spells by 3%.'
    },
    {
        id: 'potgSpellCrit',
        name: 'Power of the Guardian (Spell Crit)',
        icon: 'https://octowow.st/db/images/icons/large/inv_staff_medivh.png',
        base_stats: { spellCrit: 2 },
        tooltip: 'Increases the spell critical chance of all party members within 30 yards by 2%.',
        exclusiveGroup: 'power_of_the_guardian'
    },
    {
        id: 'potgSpellDamage',
        name: 'Power of the Guardian (Spell Damage)',
        icon: 'https://octowow.st/db/images/icons/large/inv_staff_medivh.png',
        base_stats: { spellDamage: 33 },
        tooltip: 'Increases damage and healing done by magical spells and effects of all party members within 30 yards by up to 33.',
        exclusiveGroup: 'power_of_the_guardian'
    },
    {
        id: 'potgHaste',
        name: 'Power of the Guardian (Haste)',
        icon: 'https://octowow.st/db/images/icons/large/inv_staff_medivh.png',
        base_stats: { haste: 2 },
        tooltip: 'Increases the attack and casting speed of all party members within 30 yards by 2%.',
        exclusiveGroup: 'power_of_the_guardian'
    },
    {
        id: 'greaterBlessingOfSalvation',
        spellId: 25895,
        base_stats: { threatReduction_percent: 25 }
    }
];

// Combined raid buffs array for backward compatibility
export const raidBuffs = [...raidStatBuffs, ...raidDefensiveBuffs, ...raidOffensiveBuffs];

// Weapon Imbues - Only one can be active at a time
export const weaponImbues = [
    {
        id: 'rockbiter',
        name: 'Rockbiter Weapon',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_rockbiter.png',
        base_stats: { ap: 653 },
        classes: ['shaman'],
        exclusiveGroup: 'weapon_imbue'
    },
    {
        id: 'flametongue',
        name: 'Flametongue Weapon',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_flametounge.png',
        base_stats: { fire_damage: 326 },
        classes: ['shaman'],
        exclusiveGroup: 'weapon_imbue'
    },
    {
        id: 'windfury',
        name: 'Windfury Weapon',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_cyclone.png',
        base_stats: {},
        classes: ['shaman'],
        exclusiveGroup: 'weapon_imbue'
    },
    {
        id: 'frostbrand',
        name: 'Frostbrand Weapon',
        icon: 'https://octowow.st/db/images/icons/large/spell_frost_frostbrand.png',
        base_stats: { frost_damage: 35 },
        classes: ['shaman'],
        exclusiveGroup: 'weapon_imbue'
    }
];

// Shields - Only one can be active at a time
export const shields = [
    {
        id: 'watershield',
        name: 'Water Shield',
        icon: 'https://octowow.st/db/images/icons/large/ability_shaman_watershield.png',
        base_stats: { mp5: 50 },
        classes: ['shaman'],
        exclusiveGroup: 'shield',
        tooltip: 'The caster is surrounded by 3 globes of rejuvenating water. When a spell, melee or ranged attack hits the caster, 130 Mana is restored (4s ICD). Lightning Strike procs Empowered Water Shield (130 mana + 20% AP). Only one elemental shield can be active at a time.'
    },
    {
        id: 'lightningshield',
        name: 'Lightning Shield',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_lightningshield.png',
        base_stats: { nature_damage: 13 },
        classes: ['shaman'],
        exclusiveGroup: 'shield'
    }
];

// Shaman Totems (Personal) - Only one of each type can be active at a time
export const shamanTotems = [
    {
        id: 'stoneskinTotem',
        name: 'Stoneskin Totem',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_stoneskintotem.png',
        spellId: 10408,  // Spell ID for tooltip lookup in spells.json
        base_stats: {
            flatDamageReduction: 30  // -30 damage BEFORE armor and DR
        },
        classes: ['shaman'],
        // Talent bonus function: returns additional stats if Enhancing Totems talent is taken
        getTalentBonus: (talentBonuses) => {
            // Check for Enhancing Totems talent rank
            let enhancingTotemsRank = 0;
            
            // Try to get rank from DOM (if talents are loaded)
            try {
                const enhancingTotemEl = document.getElementById('enhancement-16'); // ID 16 is Enhancing Totems
                if (enhancingTotemEl) {
                    const points = parseInt(enhancingTotemEl.dataset.points, 10) || 0;
                    enhancingTotemsRank = points;
                }
            } catch (e) {
                // Fallback: check if talentBonuses has a rank property
                enhancingTotemsRank = talentBonuses.enhancing_totems_rank || 0;
            }
            
            if (enhancingTotemsRank === 0) {
                return {}; // No talent bonus
            }
            
            // Rank 1: +15 flat DR, +15% block value
            // Rank 2: +30 flat DR, +30% block value
            const flatDRBonus = enhancingTotemsRank === 1 ? 15 : 30;
            const blockValueMultiplier = enhancingTotemsRank === 1 ? 0.15 : 0.30;
            
            return {
                flatDamageReduction: flatDRBonus,  // Additional flat DR (base 30 + bonus)
                blockValueMultiplier_percent: blockValueMultiplier  // Block value multiplier
            };
        }
    },
    {
        id: 'stoneclawTotem',
        name: 'Stoneclaw Totem',
        spellId: 10428,
        base_stats: {},  // Threat only; no stat bonus
        classes: ['shaman']
    }
];

// Paladin Auras and Abilities
export const paladinAuras = [
    {
        id: 'righteous_fury',
        name: 'Righteous Fury',
        icon: 'spell_holy_sealoffury',
        base_stats: {},
        // Righteous Defense talent adds damage reduction when this is active
        // The talent bonus is applied in calculator based on talent points
        classes: ['paladin'],
        tooltip: 'Increases the threat generated by your Holy attacks by 60%. Lasts until cancelled.',
        getTalentBonus: (talentBonuses) => {
            // Righteous Defense talent provides -3/6/10% damage taken
            if (talentBonuses.righteous_fury_damage_reduction) {
                return { damageReduction_percent: talentBonuses.righteous_fury_damage_reduction };
            }
            return {};
        }
    },
    // Holy Shield is now handled via procs.js (talent-based proc)
    // Redoubt is now handled via procs.js (talent-based proc)
    // Both removed from personal buffs to prevent duplicate block chance application
];

// Flasks - Only one can be active at a time
export const flasks = [
    { id: 'titans', name: 'Flask of the Titans', icon: 'assets/icons/flask.jpg', base_stats: { health: 1200 }, exclusiveGroup: 'flask', tooltip: '+1200 Maximum Health for 2 hours. Counts as both a Battle and Guardian Elixir.' },
    { id: 'distilled_wisdom', name: 'Flask of Distilled Wisdom', icon: 'https://octowow.st/db/images/icons/large/inv_potion_120.png', base_stats: { mana: 2000 }, exclusiveGroup: 'flask', tooltip: '+2000 Maximum Mana for 2 hours. Counts as both a Battle and Guardian Elixir.' },
    { id: 'supreme_power', name: 'Flask of Supreme Power', icon: 'https://octowow.st/db/images/icons/large/inv_potion_41.png', base_stats: { spellDamage: 150 }, exclusiveGroup: 'flask', tooltip: '+150 Spell Damage and Healing for 2 hours. Counts as both a Battle and Guardian Elixir.' },
    { id: 'chromatic_resistance', name: 'Flask of Chromatic Resistance', icon: 'https://octowow.st/db/images/icons/large/inv_potion_48.png', base_stats: { arcaneResistance: 50, fireResistance: 50, frostResistance: 50, natureResistance: 50, shadowResistance: 50 }, exclusiveGroup: 'flask', tooltip: '+50 to all Resistances for 2 hours. Counts as both a Battle and Guardian Elixir.' }
];

// Battle Elixirs (offensive) - Multiple can be active at the same time
export const battleElixirs = [
    { id: 'mongoose', name: 'Elixir of the Mongoose', icon: 'assets/icons/mongoose.jpg', base_stats: { agi: 25, crit: 2 }, tooltip: '+25 Agility and +2% Critical Strike Chance for 1 hour.' },
    { id: 'giants', name: 'Elixir of Giants', icon: 'https://octowow.st/db/images/icons/large/inv_potion_61.png', base_stats: { str: 25 }, exclusiveGroup: 'str_buff', tooltip: '+25 Strength for 1 hour.' },
    { id: 'greater_arcane', name: 'Greater Arcane Elixir', icon: 'https://octowow.st/db/images/icons/large/inv_potion_25.png', base_stats: { spellDamage: 35 }, tooltip: '+35 Spell Damage for 1 hour.' },
    { id: 'greater_firepower', name: 'Elixir of Greater Firepower', icon: 'https://octowow.st/db/images/icons/large/inv_potion_60.png', base_stats: { fireSpellDamage: 40 }, tooltip: '+40 Fire Spell Damage for 1 hour.' },
    { id: 'greater_nature_power', name: 'Elixir of Greater Nature Power', icon: 'https://octowow.st/db/images/icons/large/inv_potion_106.png', base_stats: { natureSpellDamage: 55 }, tooltip: '+55 Nature Spell Damage for 1 hour.' },
    { id: 'greater_frost_power', name: 'Elixir of Greater Frost Power', icon: 'https://octowow.st/db/images/icons/large/inv_potion_13.png', itemId: 55046, base_stats: { frostSpellDamage: 40 }, tooltip: '+40 Frost Spell Damage for 1 hour.' }
];

// Guardian Elixirs (defensive) - Multiple can be active at the same time
export const guardianElixirs = [
    { id: 'fortitudeElixir', name: 'Elixir of Fortitude', icon: 'assets/icons/fortitude.jpg', base_stats: { health: 120 }, tooltip: '+120 Maximum Health for 1 hour.' },
    { id: 'defense', name: 'Elixir of Superior Defense', icon: 'assets/icons/defense.png', base_stats: { armor: 450 }, tooltip: '+450 Armor for 1 hour.' },
    { id: 'mageblood', name: 'Mageblood Potion', icon: 'https://octowow.st/db/images/icons/large/inv_potion_45.png', base_stats: { mp5: 12 }, tooltip: 'Restores 12 mana per 5 sec for 1 hour.' },
    { id: 'dreamshard', name: 'Dreamshard Elixir', icon: 'https://octowow.st/db/images/icons/large/inv_potion_113.png', base_stats: { spellCrit: 2, spellDamage: 15 }, tooltip: '+2% Spell Critical Strike Chance and +15 Spell Damage for 1 hour.' }
];

// Concoctions - Special Turtle WoW consumables
export const concoctions = [
    { id: 'emerald_mongoose', name: 'Concoction of the Emerald Mongoose', icon: 'https://octowow.st/db/images/icons/large/inv_blue_gold_elixir_2.png', base_stats: { agi: 25, crit: 2, spellCrit: 2, spellDamage: 15 }, tooltip: '+25 Agility, +2% Melee Critical Strike, +2% Spell Critical Strike, and +15 Spell Damage for 1 hour. Counts as both a Battle and Guardian Elixir.' },
    { id: 'arcane_giant', name: 'Concoction of the Arcane Giant', icon: 'https://octowow.st/db/images/icons/large/inv_yellow_purple_elixir_2.png', base_stats: { str: 25, spellDamage: 35 }, exclusiveGroup: 'str_buff', tooltip: '+25 Strength and +35 Spell Damage for 1 hour. Counts as both a Battle and Guardian Elixir.' },
    { id: 'dreamwater', name: 'Concoction of the Dreamwater', icon: 'https://octowow.st/db/images/icons/large/inv_green_pink_elixir_1.png', base_stats: { ap: 35, spellDamage: 35 }, exclusiveGroup: 'ap_buff', tooltip: '+35 Attack Power and +35 Spell Damage for 1 hour. Counts as both a Battle and Guardian Elixir.' }
];

// Juju Buffs
export const jujuBuffs = [
    { id: 'juju_power', name: 'Juju Power', icon: 'https://octowow.st/db/images/icons/large/inv_misc_monsterscales_11.png', base_stats: { str: 30 }, exclusiveGroup: 'str_buff', tooltip: '+30 Strength for 10 min.' },
    { id: 'juju_might', name: 'Juju Might', icon: 'https://octowow.st/db/images/icons/large/inv_misc_monsterscales_07.png', base_stats: { ap: 40 }, exclusiveGroup: 'ap_buff', tooltip: '+40 Attack Power for 10 min.' },
    { id: 'juju_ember', name: 'Juju Ember', icon: 'https://octowow.st/db/images/icons/large/inv_misc_monsterscales_15.png', base_stats: { fireResistance: 15 }, tooltip: '+15 Fire Resistance for 10 min.' },
    { id: 'juju_chill', name: 'Juju Chill', icon: 'https://octowow.st/db/images/icons/large/inv_misc_monsterscales_09.png', base_stats: { frostResistance: 15 }, tooltip: '+15 Frost Resistance for 10 min.' },
    { id: 'juju_flurry', name: 'Juju Flurry', icon: 'https://octowow.st/db/images/icons/large/inv_misc_monsterscales_17.png', base_stats: {}, tooltip: 'Increases attack and casting speed by 3% for 20 sec.' }
];

// Blasted Lands Buffs
export const blastedLandsBuffs = [
    { id: 'roids', name: 'R.O.I.D.S.', icon: 'https://octowow.st/db/images/icons/large/inv_stone_15.png', base_stats: { str: 25 }, exclusiveGroup: 'blasted_lands', tooltip: '+25 Strength for 30 min.' },
    { id: 'scorpok_assay', name: 'Ground Scorpok Assay', icon: 'https://octowow.st/db/images/icons/large/inv_misc_dust_07.png', base_stats: { agi: 25 }, exclusiveGroup: 'blasted_lands', tooltip: '+25 Agility for 30 min.' },
    { id: 'cerebral_cortex', name: 'Cerebral Cortex Compound', icon: 'https://octowow.st/db/images/icons/large/inv_potion_119.png', base_stats: { int: 25 }, exclusiveGroup: 'blasted_lands', tooltip: '+25 Intellect for 30 min.' }
];

// Food Buffs - Only one food buff can be active at a time
export const foodBuffs = [
    { id: 'le_fishe', name: 'Le Fishe Au Chocolat', icon: 'https://octowow.st/db/images/icons/large/inv_misc_fishe_au_chocolate.png', base_stats: { dodge: 1, def: 4 }, exclusiveGroup: 'food', tooltip: '+1% Dodge and +4 Defense for 30 min.' },
    { id: 'dragonbreath_chili', name: 'Dragonbreath Chili', icon: 'https://octowow.st/db/images/icons/large/inv_drink_17.png', base_stats: {}, exclusiveGroup: 'food', tooltip: 'Occasionally belch flame at enemies for 61 to 68 Fire damage when attacking.' },
    { id: 'hardened_mushroom', name: 'Hardened Mushroom', icon: 'https://octowow.st/db/images/icons/large/inv_mushroom_15.png', base_stats: { sta: 25 }, exclusiveGroup: 'food', tooltip: '+25 Stamina for 30 min.' },
    { id: 'lichbloom', name: 'Dirge\'s Kickin\' Chimaerok Chops', icon: 'https://octowow.st/db/images/icons/large/inv_misc_food_65.png', base_stats: { sta: 25 }, exclusiveGroup: 'food', tooltip: '+25 Stamina for 30 min.' },
    { id: 'grilled_squid', name: 'Grilled Squid', icon: 'https://octowow.st/db/images/icons/large/inv_misc_fish_13.png', base_stats: { agi: 10 }, exclusiveGroup: 'food', tooltip: '+10 Agility for 30 min.' },
    { id: 'power_mushroom', name: 'Power Mushroom', icon: 'https://octowow.st/db/images/icons/large/inv_mushroom_14.png', base_stats: { str: 20 }, exclusiveGroup: 'food', tooltip: '+20 Strength for 30 min.' },
    { id: 'smoked_desert_dumplings', name: 'Smoked Desert Dumplings', icon: 'https://octowow.st/db/images/icons/large/inv_misc_food_64.png', base_stats: { str: 20 }, exclusiveGroup: 'food', tooltip: '+20 Strength for 30 min.' },
    { id: 'empowering_herbal_salad', name: 'Empowering Herbal Salad', icon: 'https://octowow.st/db/images/icons/large/inv_misc_food_salad.png', base_stats: { healing: 24 }, exclusiveGroup: 'food', tooltip: '+24 Healing for 30 min.' },
    { id: 'telabim_medley', name: 'Danonzo\'s Tel\'Abim Medley', icon: 'https://octowow.st/db/images/icons/large/inv_misc_food_73.png', base_stats: { haste: 2 }, exclusiveGroup: 'food', tooltip: '+2% Haste for 30 min.' },
    { id: 'telabim_surprise', name: 'Danonzo\'s Tel\'Abim Surprise', icon: 'https://octowow.st/db/images/icons/large/inv_misc_food_92.png', base_stats: { rangedAP: 45 }, exclusiveGroup: 'food', tooltip: '+45 Ranged Attack Power for 30 min.' },
    { id: 'telabim_delight', name: 'Danonzo\'s Tel\'Abim Delight', icon: 'https://octowow.st/db/images/icons/large/inv_drink_21.png', base_stats: { spellDamage: 22 }, exclusiveGroup: 'food', tooltip: '+22 Spell Damage for 30 min.' }
];

// Drinks - Only one stamina drink can be active at a time
export const drinks = [
    { id: 'rumsey', name: 'Rumsey Rum Black Label', icon: 'assets/icons/rum.jpg', base_stats: { sta: 15 }, exclusiveGroup: 'stamina_drink', tooltip: '+15 Stamina for 15 min.' },
    { id: 'Merlot', name: 'Medivhs Merlot', icon: 'assets/icons/merlot.png', base_stats: { sta: 25 }, exclusiveGroup: 'stamina_drink', tooltip: '+25 Stamina for 15 min.' },
    { id: 'merlot_blue', name: 'Medivh\'s Merlot Blue', icon: 'https://octowow.st/db/images/icons/large/inv_drink_waterskin_01.png', base_stats: { int: 15 }, exclusiveGroup: 'int_drink', tooltip: '+15 Intellect for 15 min.' },
    { id: 'winterfall_firewater', name: 'Winterfall Firewater', icon: 'https://octowow.st/db/images/icons/large/inv_potion_92.png', base_stats: { ap: 35 }, exclusiveGroup: 'ap_buff', tooltip: '+35 Attack Power for 20 min.' },
    { id: 'dreamtonic', name: 'Dreamtonic', icon: 'https://octowow.st/db/images/icons/large/inv_potion_114.png', base_stats: { spellDamage: 35 }, tooltip: '+35 Spell Damage for 20 min.' }
];

// Potions and other consumables
export const potions = [
    // Stoneshield Potion armor is now handled via procs.js (on-use effect)
    // Removed armor from base_stats to prevent double-counting
    { id: 'stoneshield', name: 'Greater Stoneshield Potion', icon: 'https://octowow.st/db/images/icons/large/inv_potion_69.png', base_stats: {}, tooltip: 'Absorbs 2250 to 3750 physical damage for 2 min.' },
    { id: 'trolls_blood', name: 'Major Troll\'s Blood Potion', icon: 'https://octowow.st/db/images/icons/large/inv_potion_80.png', base_stats: { healthRegen: 20 }, tooltip: 'Regenerates 20 health per 5 sec for 1 hour.' },
    { id: 'zanza', name: 'Spirit of Zanza', icon: 'assets/icons/zanza.jpg', base_stats: { sta: 50, spi: 50 }, tooltip: '+50 Stamina and +50 Spirit for 2 hours.' },
    { id: 'potion_of_quickness', name: 'Potion of Quickness', icon: 'https://octowow.st/db/images/icons/large/inv_potion_08.png', base_stats: {}, tooltip: 'Increases haste by 5% for 30 sec.' }
];

// Weapon Enhancements
export const weaponEnhancements = [
    { id: 'elemental_sharpening', name: 'Elemental Sharpening Stone', icon: 'https://octowow.st/db/images/icons/large/inv_stone_02.png', base_stats: { crit: 2 }, exclusiveGroup: 'weapon_enhancement', tooltip: '+2% Critical Strike Chance for 30 min.' },
    { id: 'brilliant_wizard_oil', name: 'Brilliant Wizard Oil', icon: 'https://octowow.st/db/images/icons/large/inv_potion_105.png', base_stats: { spellDamage: 36, spellCrit: 1 }, exclusiveGroup: 'weapon_enhancement', tooltip: '+36 Spell Damage and +1% Spell Critical Strike Chance for 30 min.' },
    { id: 'brilliant_mana_oil', name: 'Brilliant Mana Oil', icon: 'https://octowow.st/db/images/icons/large/inv_potion_100.png', base_stats: { mp5: 12, healing: 25 }, exclusiveGroup: 'weapon_enhancement', tooltip: 'Restores 12 mana per 5 sec and +25 Healing for 30 min.' }
];

// Weapon Skill Masteries (Learned from books)
export const weaponMasteries = [
    { id: 'mastery_axes', name: 'Mastery of Axes', icon: 'https://octowow.st/db/images/icons/large/inv_axe_01.png', weaponTypes: ['Axe', 'Two-handed Axe'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_swords', name: 'Mastery of Swords', icon: 'https://octowow.st/db/images/icons/large/inv_sword_27.png', weaponTypes: ['Sword', 'Two-handed Sword'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_hammers', name: 'Mastery of Hammers', icon: 'https://octowow.st/db/images/icons/large/inv_hammer_01.png', weaponTypes: ['Mace', 'Two-handed Mace'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_daggers', name: 'Mastery of Daggers', icon: 'https://octowow.st/db/images/icons/large/inv_weapon_shortblade_05.png', weaponTypes: ['Dagger'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_fist', name: 'Mastery of Fist Weapons', icon: 'https://octowow.st/db/images/icons/large/inv_gauntlets_04.png', weaponTypes: ['Fist Weapon'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_polearms', name: 'Mastery of Polearms', icon: 'https://octowow.st/db/images/icons/large/inv_spear_01.png', weaponTypes: ['Polearm'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_staves', name: 'Mastery of Staves', icon: 'https://octowow.st/db/images/icons/large/inv_staff_08.png', weaponTypes: ['Staff'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_bows', name: 'Mastery of Bows', icon: 'https://octowow.st/db/images/icons/large/inv_weapon_bow_07.png', weaponTypes: ['Bow'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_crossbows', name: 'Mastery of Crossbows', icon: 'https://octowow.st/db/images/icons/large/inv_weapon_crossbow_07.png', weaponTypes: ['Crossbow'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_guns', name: 'Mastery of Guns', icon: 'https://octowow.st/db/images/icons/large/inv_weapon_rifle_01.png', weaponTypes: ['Gun'], base_stats: { weaponSkill: 5 } },
    { id: 'mastery_thrown', name: 'Mastery of Thrown', icon: 'https://octowow.st/db/images/icons/large/inv_throwingknife_04.png', weaponTypes: ['Thrown'], base_stats: { weaponSkill: 5 } }
];

// Druid Shapeshifting Forms - Only one can be active at a time
export const druidForms = [
    {
        id: 'cat_form',
        name: 'Cat Form',
        icon: 'https://octowow.st/db/images/icons/large/ability_druid_catform.png',
        base_stats: {
            ap: 120,
            agi_to_ap: 1  // Agility converts 1:1 to AP in Cat Form
        },
        classes: ['druid'],
        exclusiveGroup: 'druid_form'
    },
    {
        id: 'dire_bear_form',
        name: 'Dire Bear Form',
        icon: 'https://octowow.st/db/images/icons/large/ability_racial_bearform.png',
        base_stats: {
            ap: 180,
            armor_percent_from_gear_buff: 3.60,  // +360% armor BONUS (base + base×3.6 = base×4.6 total)
            health: 1240
        },
        classes: ['druid'],
        exclusiveGroup: 'druid_form'
    },
    {
        id: 'moonkin_form',
        name: 'Moonkin Form',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_forceofnature.png',
        base_stats: {
            armor_percent_from_gear_buff: 3.60,  // +360% armor BONUS (base + base×3.6 = base×4.6 total)
            spellCrit: 3
        },
        classes: ['druid'],
        exclusiveGroup: 'druid_form'
    }
];

// Druid Talent-Based Buffs (conditional on having talents)
export const druidTalentBuffs = [
    {
        id: 'leader_of_the_pack',
        name: 'Leader of the Pack',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_unyeildingstamina.png',
        base_stats: {
            crit: 3  // +3% melee and ranged crit
        },
        classes: ['druid'],
        requiresTalent: {
            tree: 'feralCombat',
            talentId: 25,
            minRanks: 1
        }
    }
];

// Hunter Aspects - Only one can be active at a time. Aspect of the Monkey: 8% dodge base; Improved Primal Aspects adds 2/4/6% when talented (applied in calculator).
export const hunterAspects = [
    {
        id: 'aspectOfTheMonkey',
        name: 'Aspect of the Monkey',
        spellId: 13163,
        base_stats: { dodge: 8 },
        classes: ['hunter'],
        exclusiveGroup: 'hunter_aspect'
    }
];

// Warrior Stances - Only one can be active at a time
export const warriorStances = [
    {
        id: 'battle_stance',
        name: 'Battle Stance',
        icon: 'https://octowow.st/db/images/icons/large/ability_warrior_offensivestance.png',
        base_stats: {},
        classes: ['warrior'],
        exclusiveGroup: 'warrior_stance'
    },
    {
        id: 'defensive_stance',
        name: 'Defensive Stance',
        icon: 'https://octowow.st/db/images/icons/large/ability_warrior_defensivestance.png',
        base_stats: {
            damageReduction_percent: 0.10,  // -10% damage taken
            damageModifier: 0.9  // 0.9x damage dealt (affects weapon damage display)
        },
        classes: ['warrior'],
        exclusiveGroup: 'warrior_stance'
    },
    {
        id: 'berserker_stance',
        name: 'Berserker Stance',
        icon: 'https://octowow.st/db/images/icons/large/ability_racial_avatar.png',
        base_stats: {
            damageIncrease_percent: 0.10,  // +10% damage taken
            crit: 3  // +3% crit chance
        },
        classes: ['warrior'],
        exclusiveGroup: 'warrior_stance'
    }
];

// Boss Debuffs - Defensive Debuffs (reduce boss damage output)
export const defensiveDebuffs = [
    {
        id: 'thunderfury_debuff',
        name: 'Thunderfury',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_cyclone.png',
        tooltip: 'Target is consumed by a cyclone, slowing its attack speed by 20% for 12 sec.',
        base_stats: {
            attack_speed_reduction: 0.20,  // 20% attack speed slow (uptime depends on proc rate)
            enemyNatureResistReduction: -25  // Reduces nature resistance by 25
        },
        exclusiveGroup: 'attack_speed_debuff'
    },
    {
        id: 'thunderclap',
        name: 'Thunderclap',
        icon: 'https://octowow.st/db/images/icons/large/ability_thunderclap.png',
        tooltip: 'Blasts nearby enemies with thunder increasing the time between their attacks by 10% for 18 sec',
        base_stats: {
            attack_speed_reduction: 0.10  // 10% attack speed slow
        },
        exclusiveGroup: 'attack_speed_debuff'
    },
    {
        id: 'demoralizing_shout',
        name: 'Demoralizing Shout',
        icon: 'https://octowow.st/db/images/icons/large/ability_warrior_warcry.png',
        spellId: 11556,  // Spell ID for lookup in spells.json
        base_stats: {
            bossAttackPowerReduction: 0  // Will be parsed from spell tooltip
        },
        improved_stats: {
            bossAttackPowerReduction: 0  // Base * 1.4 (40% more reduction)
        },
        exclusiveGroup: 'demoralizing_debuff'
    },
    {
        id: 'demoralizing_roar',
        name: 'Demoralizing Roar',
        icon: 'https://octowow.st/db/images/icons/large/ability_druid_demoralizingroar.png',
        spellId: 9898,  // Spell ID for lookup in spells.json
        base_stats: {
            bossAttackPowerReduction: 0  // Will be parsed from spell tooltip
        },
        improved_stats: {
            bossAttackPowerReduction: 0  // Base * 1.4 (40% more reduction)
        },
        exclusiveGroup: 'demoralizing_debuff'
    }
];

// Boss Debuffs - Offensive Debuffs (increase player damage)
export const offensiveDebuffs = [
    {
        id: 'curseOfTheElements',
        name: 'Curse of the Elements',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_chilltouch.png',
        spellId: 11722,  // Spell ID for lookup in spells.json
        // Reduces Fire/Frost/Arcane/Shadow resist by 75, increases Fire/Frost damage taken by 10%
        base_stats: {
            enemyFireResistReduction: -75,
            enemyFrostResistReduction: -75,
            enemyArcaneResistReduction: -75,
            enemyShadowResistReduction: -75,
            enemyFireDamageIncrease: 0.10,
            enemyFrostDamageIncrease: 0.10
        }
    },
    {
        id: 'curseOfShadows',
        name: 'Curse of Shadows',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_curseofachimonde.png',
        spellId: 17937,  // Spell ID for lookup in spells.json (Rank 2: -75 shadow/arcane resist, +10% shadow/arcane damage)
        // Reduces Shadow and Arcane resist by 75, increases Shadow and Arcane damage taken by 10%
        base_stats: {
            enemyShadowResistReduction: -75,
            enemyArcaneResistReduction: -75,
            enemyShadowDamageIncrease: 0.10,
            enemyArcaneDamageIncrease: 0.10
        }
    },
    {
        id: 'sunderArmor',
        name: 'Sunder Armor',
        icon: 'https://octowow.st/db/images/icons/large/ability_warrior_sunder.png',
        spellId: 11597,  // Spell ID for lookup in spells.json
        // 450 per stack, 5 stacks = 2250 total armor reduction
        base_stats: { enemyArmorReduction: -2250 },
        exclusiveGroup: 'armor_debuff'
    },
    {
        id: 'exposeArmor',
        name: 'Expose Armor',
        icon: 'https://octowow.st/db/images/icons/large/ability_warrior_riposte.png',
        spellId: 11198,  // Spell ID for lookup in spells.json
        // Unimproved: 1700 armor reduction at 5 combo points
        base_stats: { enemyArmorReduction: -1700 },
        // Improved Expose Armor: 50% more → 1700 × 1.50 = 2550
        improved_stats: { enemyArmorReduction: -2550 },
        exclusiveGroup: 'armor_debuff'
    },
    {
        id: 'fireVulnerability',
        name: 'Fire Vulnerability',
        icon: 'https://octowow.st/db/images/icons/large/spell_fire_soulburn.png',
        spellId: 12875,  // Spell ID for lookup in spells.json
        // 3% per stack, 5 stacks = 15% fire damage increase
        base_stats: { enemyFireDamageIncrease: 0.15 } // 5 stacks × 3% = 15%
    },
    {
        id: 'wintersChill',
        name: 'Winter\'s Chill',
        icon: 'https://octowow.st/db/images/icons/large/spell_frost_chillingblast.png',
        tooltip: 'Increases the chance Frost spells will critically hit the target by 10%.',
        base_stats: { enemyFrostSpellCritBonus: 0.10 }
    },
    {
        id: 'nightfall',
        name: 'Nightfall',
        icon: 'https://octowow.st/db/images/icons/large/spell_holy_elunesgrace.png',
        spellId: 23605,  // Spell ID for lookup in spells.json
        // Nightfall is a raid debuff that gives +10% spell damage for 7 seconds
        // It has 35-50% uptime when one person in the raid uses the Nightfall weapon
        // This is handled specially in the simulation (not a standard buff stat)
        base_stats: {} // No direct stat modification - handled in sim via nightfallEnabled flag
    },
    {
        id: 'hemorrhage',
        name: 'Hemorrhage',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_lifedrain.png',
        spellId: 16511,  // Spell ID for lookup in spells.json
        // Hemorrhage is a raid debuff that gives +2% physical damage (base) or +4% (improved with Serrated Blades)
        // It has 40-50% uptime when rogues use Hemorrhage (sporadic due to charge consumption)
        // This is handled specially in the simulation (not a standard buff stat)
        // The improved_stats is a marker to show the "+" toggle - actual values handled by hemoImproved flag in sim
        base_stats: {}, // Base: +2% physical damage - handled in sim via hemoEnabled flag
        improved_stats: {} // Improved (Serrated Blades): +4% physical damage - handled in sim via hemoImproved flag
    },
    {
        id: 'corrosiveSpit',
        name: 'Feast of Hakkar',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_bloodboil.png',
        tooltip: 'Reduces the armor of the target by 400 for 10 seconds. Applied by raid members at 65-85% uptime.',
        // Corrosive Spit is a raid debuff that reduces boss armor by 400 for 10 seconds.
        // It has 65-85% uptime with overlapping 10-second windows.
        // This is handled specially in the simulation (not a standard buff stat)
        base_stats: {} // No direct stat modification - handled in sim via corrosiveSpitEnabled flag
    },
    {
        id: 'faerieFire',
        name: 'Faerie Fire',
        icon: 'https://octowow.st/db/images/icons/large/spell_nature_faeriefire.png',
        spellId: 9907,  // Spell ID for lookup in spells.json
        // Rank 4: 505 armor reduction
        base_stats: { enemyArmorReduction: -505 }
    },
    {
        id: 'curseOfRecklessness',
        name: 'Curse of Recklessness',
        icon: 'https://octowow.st/db/images/icons/large/spell_shadow_unholystrength.png',
        spellId: 11717,  // Spell ID for lookup in spells.json
        // Rank 4: 640 armor reduction
        base_stats: { enemyArmorReduction: -640 }
    },
    {
        id: 'annihilator',
        name: 'Armor Shatter',
        icon: 'https://octowow.st/db/images/icons/large/inv_axe_12.png',
        spellId: 16928,  // Spell ID for lookup in spells.json
        // 100 armor per stack, max 3 stacks = 300 total armor reduction
        base_stats: { enemyArmorReduction: -300 },
        exclusiveGroup: 'armor_shatter_debuff'
    },
    {
        id: 'shart',
        name: 'Shattered Armor',
        icon: 'https://octowow.st/db/images/icons/large/inv_demonaxe.png',
        spellId: 51144,  // Spell ID for lookup in spells.json
        // 250 armor reduction (does not stack with Annihilator)
        base_stats: { enemyArmorReduction: -250 },
        exclusiveGroup: 'armor_shatter_debuff'
    }
];

// Combined boss debuffs array for backward compatibility
export const bossDebuffs = [...defensiveDebuffs, ...offensiveDebuffs];

// Mage Armor Buffs - Only one can be active at a time
export const mageArmorBuffs = [
    {
        id: 'ice_armor',
        name: 'Ice Armor',
        spellId: 10220,  // Spell ID for icon and tooltip lookup in spells.json
        base_stats: {
            armor_percent_from_gear_buff: 0.30  // +30% armor from gear (base Ice Armor)
        },
        classes: ['mage'],
        exclusiveGroup: 'mage_armor',
        // Talent bonus function: returns total armor bonus including Frost Warding talent
        getTalentBonus: (talentBonuses) => {
            // Check for Frost Warding talent rank from talentBonuses
            const frostWardingRank = talentBonuses.frost_warding_ranks || 0;
            
            if (frostWardingRank === 0) {
                return {}; // No talent bonus, use base stats
            }
            
            // Base: 30% armor bonus
            // Rank 1: +15% additional (total 45%)
            // Rank 2: +30% additional (total 60%)
            const baseArmorPercent = 0.30;
            const additionalArmorPercent = frostWardingRank * 0.15;
            const totalArmorPercent = baseArmorPercent + additionalArmorPercent;
            
            // Return total value (will replace base_stats when merged)
            return {
                armor_percent_from_gear_buff: totalArmorPercent
            };
        }
    }
];

// Warlock Armor Buffs - Only one can be active at a time
export const warlockArmorBuffs = [
    {
        id: 'demon_armor',
        name: 'Demon Armor',
        spellId: 11735,  // Spell ID for icon and tooltip lookup in spells.json
        base_stats: {
            armor_percent_from_gear_buff: 0.30  // +30% armor from gear (base Demon Armor)
        },
        classes: ['warlock'],
        exclusiveGroup: 'warlock_armor',
        // Talent bonus function: returns total armor bonus including Demonic Aegis talent
        getTalentBonus: (talentBonuses) => {
            // Check for Demonic Aegis talent rank from talentBonuses
            const demonicAegisRank = talentBonuses.demonic_aegis_ranks || 0;
            
            if (demonicAegisRank === 0) {
                return {}; // No talent bonus, use base stats
            }
            
            // Base: 30% armor bonus
            // Rank 1: +20% additional (total 50%)
            // Rank 2: +40% additional (total 70%)
            // Rank 3: +60% additional (total 90%)
            const baseArmorPercent = 0.30;
            const additionalArmorPercent = demonicAegisRank * 0.20;
            const totalArmorPercent = baseArmorPercent + additionalArmorPercent;
            
            // Return total value (will replace base_stats when merged)
            return {
                armor_percent_from_gear_buff: totalArmorPercent
            };
        }
    }
];

// Legacy exports
export const personalBuffs = [...weaponImbues, ...shields, ...paladinAuras, ...shamanTotems, ...weaponMasteries, ...druidForms, ...druidTalentBuffs, ...hunterAspects, ...warriorStances, ...mageArmorBuffs, ...warlockArmorBuffs];
export const consumables = [
    ...flasks,
    ...battleElixirs,
    ...guardianElixirs,
    ...concoctions,
    ...jujuBuffs,
    ...blastedLandsBuffs,
    ...foodBuffs,
    ...drinks,
    ...potions,
    ...weaponEnhancements
];

// Combined array for backward compatibility
export const buffs = [...personalBuffs, ...raidBuffs, ...consumables, ...bossDebuffs];

/**
 * Clean tooltip HTML by removing unnecessary information
 * @param {string} htmlTooltip - HTML tooltip string
 * @returns {string} Cleaned HTML tooltip
 */
function cleanTooltipHTML(htmlTooltip) {
    if (!htmlTooltip) return '';

    // Create a temporary div to parse and manipulate HTML
    const temp = document.createElement('div');
    temp.innerHTML = htmlTooltip;

    const tables = temp.querySelectorAll('table');

    if (tables.length >= 2) {
        // Remove the first table entirely (contains rank, mana, cast time, etc.)
        // Keep only the second table which has the actual description
        tables[0].remove();
    } else if (tables.length === 1) {
        // If there's only one table, try to extract just the spell name
        const firstTable = tables[0];
        const firstRow = firstTable.querySelector('tr td');
        if (firstRow) {
            const boldText = firstRow.querySelector('b');
            if (boldText) {
                firstRow.innerHTML = boldText.outerHTML;
            }
        }
    }

    return temp.innerHTML;
}

// Find item by name in no_slot.json
function findItemByName(itemName) {
    if (!noSlotData) return null;

    return noSlotData.find(item => item.name === itemName);
}

/**
 * Convert seconds to more readable time format
 * @param {string} text - Text containing time in seconds
 * @returns {string} Text with converted time format
 */
function convertTimeFormat(text) {
    // Convert "X sec" or "X seconds" patterns
    let converted = text;

    // 7200 sec -> 2 hours
    converted = converted.replace(/7200\s+sec(?:onds)?/gi, '2 hours');

    // 3600 sec -> 1 hour
    converted = converted.replace(/3600\s+sec(?:onds)?/gi, '1 hour');

    // 1800 sec -> 30 min
    converted = converted.replace(/1800\s+sec(?:onds)?/gi, '30 min');

    // 900 sec -> 15 min
    converted = converted.replace(/900\s+sec(?:onds)?/gi, '15 min');

    // 600 sec -> 10 min
    converted = converted.replace(/600\s+sec(?:onds)?/gi, '10 min');

    // 300 sec -> 5 min
    converted = converted.replace(/300\s+sec(?:onds)?/gi, '5 min');

    // 180 sec -> 3 min
    converted = converted.replace(/180\s+sec(?:onds)?/gi, '3 min');

    // 120 sec -> 2 min
    converted = converted.replace(/120\s+sec(?:onds)?/gi, '2 min');

    // 60 sec -> 1 min
    converted = converted.replace(/60\s+sec(?:onds)?/gi, '1 min');

    return converted;
}

/**
 * Create tooltip HTML for a buff
 * @param {Object} buff - Buff object
 * @param {boolean} isImproved - Whether the buff is in improved state
 * @returns {string} HTML string for tooltip
 */
function createBuffTooltipHTML(buff, isImproved = false) {
    // Determine display name - prefer spell name if available
    let displayName = buff.name;
    let spell = null;
    
    if (buff.spellId) {
        spell = findSpellById(buff.spellId);
        // Use spell name if available (prefer over buff.name)
        if (spell && spell.name) {
            displayName = spell.name;
        }
    }
    
    // Check for custom getTooltip function first (for dynamic tooltips like Stoneskin Totem)
    if (buff.getTooltip && typeof buff.getTooltip === 'function') {
        // Get talent bonuses for tooltip generation
        const talentBonuses = window.getTalentBonusesFunc ? window.getTalentBonusesFunc() : {};
        return buff.getTooltip(isImproved, talentBonuses);
    }
    
    // Check for buff.tooltip property (for custom buffs like paladin abilities)
    if (buff.tooltip) {
        return createGenericTooltip(displayName, [buff.tooltip], 2);
    }

    // Check for custom tooltip text before item DB lookup (e.g., weapon masteries)
    if (customTooltips[buff.name]) {
        let tooltipText = customTooltips[buff.name];

        // Replace placeholders with actual stat values
        const stats = isImproved && buff.improved_stats ? buff.improved_stats : buff.base_stats;
        if (stats) {
            for (const [key, value] of Object.entries(stats)) {
                tooltipText = tooltipText.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
            }

            // Special handling for Mark of the Wild - use fireResist value for {resist} placeholder
            if (buff.name === 'Mark of the Wild' && stats.fireResist !== undefined) {
                tooltipText = tooltipText.replace(/\{resist\}/g, stats.fireResist);
            }
            // Expose Armor: {armor} = armor reduction (1700 unimproved, 2550 improved)
            if (buff.name === 'Expose Armor' && stats.enemyArmorReduction !== undefined) {
                tooltipText = tooltipText.replace(/\{armor\}/g, Math.abs(stats.enemyArmorReduction));
            }
        }

        return createGenericTooltip(displayName, [tooltipText], 2);
    }

    // Try to find item data from no_slot.json first (for consumables)
    const item = findItemByName(buff.name);
    if (item && item.tooltip_lines_raw && item.tooltip_lines_raw.length > 0) {
        // Filter out empty lines and "Binds when picked up" / "Unique" / "Requires Level X" / "Use:"
        const filteredLines = item.tooltip_lines_raw
            .filter(line => {
                const trimmed = line.trim();
                return trimmed &&
                       !trimmed.startsWith('Binds when') &&
                       !trimmed.startsWith('Unique') &&
                       !trimmed.startsWith('Requires Level') &&
                       !trimmed.startsWith('Requires ') &&
                       !trimmed.startsWith('Classes:') &&
                       !trimmed.startsWith('Quest Item') &&
                       !trimmed.startsWith('Use:');
            })
            .map(line => convertTimeFormat(line)); // Convert time formats

        if (filteredLines.length > 0) {
            return createGenericTooltip(displayName, filteredLines, 2);
        }
    }

    // Try to find spell data by ID first (for spells with spellId property)
    if (!spell && buff.spellId) {
        spell = findSpellById(buff.spellId);
    }
    
    // Fallback to name lookup if no spellId or not found
    if (!spell) {
        spell = findSpellByName(buff.name);
    }

    if (spell && spell.tooltip_html) {
        // Clean the spell tooltip - remove tool requirement lines
        let cleanedTooltip = cleanTooltipHTML(spell.tooltip_html);
        
        // For Stoneskin Totem, we need to update the damage reduction value based on talent
        if (buff.id === 'stoneskinTotem') {
            // Get talent rank for Enhancing Totems
            let enhancingTotemsRank = 0;
            try {
                const enhancingTotemEl = document.getElementById('enhancement-16');
                if (enhancingTotemEl) {
                    enhancingTotemsRank = parseInt(enhancingTotemEl.dataset.points, 10) || 0;
                }
            } catch (e) {
                // Fallback
                enhancingTotemsRank = 0;
            }
            
            // Base is 30, with talent: 45 (rank 1) or 60 (rank 2)
            const totalDR = enhancingTotemsRank === 0 ? 30 : (enhancingTotemsRank === 1 ? 45 : 60);
            
            // Replace the damage value in the tooltip
            // Try various patterns to catch different tooltip formats
            // Pattern 1: "reduces damage taken by X"
            cleanedTooltip = cleanedTooltip.replace(/reduces?\s+damage\s+taken\s+by\s+\d+/i, `reduces damage taken by ${totalDR}`);
            // Pattern 2: "X damage" (standalone number before "damage")
            cleanedTooltip = cleanedTooltip.replace(/(\d+)(\s+damage)/i, (match, num, suffix) => {
                // Only replace if it's the small number (likely 4), not a large number
                if (parseInt(num) < 10) {
                    return `${totalDR}${suffix}`;
                }
                return match;
            });
            // Pattern 3: Replace any standalone "4" near "damage" text
            if (cleanedTooltip.toLowerCase().includes('damage')) {
                cleanedTooltip = cleanedTooltip.replace(/\b4\b(?=\s*damage)/i, String(totalDR));
            }
            
            // Remove tool requirement lines
            cleanedTooltip = cleanedTooltip.replace(/<[^>]*>.*?tool.*?<[^>]*>/gi, '');
            cleanedTooltip = cleanedTooltip.replace(/Requires:.*?$/gmi, '');
            
            // Add block value line if talented
            if (enhancingTotemsRank > 0) {
                const blockBonus = enhancingTotemsRank === 1 ? 15 : 30;
                cleanedTooltip += `<br />Increases block value by ${blockBonus}%.`;
            }
        // Redoubt is now handled via procs.js - removed from buffs
        } else {
            // For other spells, remove tool requirement lines
            cleanedTooltip = cleanedTooltip.replace(/<[^>]*>.*?tool.*?<[^>]*>/gi, '');
            cleanedTooltip = cleanedTooltip.replace(/Requires:.*?$/gmi, '');
        }
        
        // Prepend the name with green styling (q2 = green)
        return `<b class="q2">${displayName}</b><br />${cleanedTooltip}`;
    }

    // Fallback to manual stat generation
    const stats = isImproved && buff.improved_stats ? buff.improved_stats : buff.base_stats;
    const lines = [];

    // Add stat lines
    for (const [key, value] of Object.entries(stats)) {
        switch (key) {
            case 'sta':
                lines.push(`+${value} Stamina`);
                break;
            case 'agi':
                lines.push(`+${value} Agility`);
                break;
            case 'int':
                lines.push(`+${value} Intellect`);
                break;
            case 'armor':
                lines.push(`+${value} Armor`);
                break;
            case 'ap':
                lines.push(`+${value} Attack Power`);
                break;
            case 'health':
                lines.push(`+${value} Health`);
                break;
            case 'mp5':
                lines.push(`+${value} Mana per 5 seconds`);
                break;
            case 'stat_percent':
                lines.push(`+${Math.round(value * 100)}% to all stats`);
                break;
            case 'fire_damage':
                lines.push(`${value} Fire damage on hit`);
                break;
            case 'frost_damage':
                lines.push(`${value} Frost damage on hit`);
                break;
            case 'nature_damage':
                lines.push(`${value} Nature damage when struck`);
                break;
            case 'frostSpellDamage':
                lines.push(`+${value} Frost Spell Damage`);
                break;
            case 'fireSpellDamage':
                lines.push(`+${value} Fire Spell Damage`);
                break;
            case 'natureSpellDamage':
                lines.push(`+${value} Nature Spell Damage`);
                break;
            case 'blockChance':
                lines.push(`+${value}% Block Chance`);
                break;
            case 'damageReduction_percent':
                lines.push(`-${Math.round(value * 100)}% Damage Taken`);
                break;
            case 'armor_percent':
                lines.push(`+${Math.round(value * 100)}% Armor`);
                break;
            default:
                lines.push(`+${value} ${key}`);
        }
    }

    // Use displayName if we have it (from spell), otherwise use buff.name
    const finalName = displayName || buff.name;
    return createGenericTooltip(finalName, lines, isImproved ? 2 : 1);
}

// Generate buff icons organized by category
export async function generateBuffIcons(container, currentClass = null, talentSpec = null) {
    if (!container) return;

    // Load item and spell data for tooltips
    await loadNoSlotItems();
    await loadSpells();

    const renderBuffGroup = (buffs, title) => {
        if (buffs.length === 0) return ''; // Don't show empty groups

        const buffIcons = buffs.map(buff => {
            const upgradeToggle = buff.improved_stats
                ? '<div class="buff-upgrade-toggle">+</div>'
                : '';

            // If buff has spellId, load icon and name from spells.json
            let iconUrl = resolveIconUrl(buff.icon);
            let buffName = buff.name;
            
            if (buff.spellId) {
                const spell = findSpellById(buff.spellId);
                if (spell) {
                    // Load name from spell (prefer spell name over buff name)
                    if (spell.name) {
                        buffName = spell.name;
                    }
                    // Load icon from spell if not already set
                    if (!iconUrl && spell.icon) {
                        iconUrl = resolveIconUrl(spell.icon);
                    }
                }
            }
            
            // Fallback name if still not set
            if (!buffName) {
                buffName = 'Unknown Buff';
            }

            // If still no icon, use a placeholder
            if (!iconUrl) {
                iconUrl = resolveIconUrl('inv_misc_questionmark');
            }

            return `
                <div class="buff-icon" id="${buff.id}" data-buff-name="${buffName}">
                    <img src="${iconUrl}" alt="${buffName}" loading="lazy">
                    ${upgradeToggle}
                </div>
            `;
        }).join('');

        return `
            <div class="buff-category">
                <div class="buff-category-header">${title}</div>
                <div class="buff-category-icons">
                    ${buffIcons}
                </div>
            </div>
        `;
    };

    // Helper function to check if a talent is learned
    const hasTalent = (tree, talentId, minRanks = 1) => {
        if (talentSpec && typeof talentSpec === 'object') {
            const pts = talentSpec[`${tree}-${talentId}`] ?? talentSpec[talentId] ?? 0;
            return Number(pts) >= minRanks;
        }
        const talentElement = document.querySelector(`.talent-icon-container[data-tree="${tree}"][data-talent-id="${talentId}"]`);
        if (!talentElement) return false;
        const currentPoints = parseInt(talentElement.getAttribute('data-points')) || 0;
        return currentPoints >= minRanks;
    };

    // Filter class-specific buffs by current class
    const filterByClass = (buffs) => buffs.filter(buff => {
        if (!buff.classes) return true; // No class restriction
        if (!currentClass) return false; // No class selected
        return buff.classes.includes(currentClass);
    });

    // Filter talent-based buffs by talent requirements
    const filterByTalent = (buffs) => buffs.filter(buff => {
        if (!buff.requiresTalent) return true; // No talent requirement
        const { tree, talentId, minRanks } = buff.requiresTalent;
        return hasTalent(tree, talentId, minRanks);
    });

    const filteredWeaponImbues = filterByClass(weaponImbues);
    const filteredShields = filterByClass(shields);
    const filteredPaladinAuras = filterByClass(paladinAuras);
    const filteredShamanTotems = filterByClass(shamanTotems);
    const filteredWeaponMasteries = filterByClass(weaponMasteries);
    const filteredDruidForms = filterByClass(druidForms);
    const filteredDruidTalentBuffs = filterByTalent(filterByClass(druidTalentBuffs));
    const filteredHunterAspects = filterByClass(hunterAspects);
    const filteredWarriorStances = filterByClass(warriorStances);
    const filteredMageArmorBuffs = filterByClass(mageArmorBuffs);
    const filteredWarlockArmorBuffs = filterByClass(warlockArmorBuffs);

    // Build Personal Buffs section with subsections
    const personalBuffsSection = (filteredWeaponImbues.length > 0 || filteredShields.length > 0 || filteredPaladinAuras.length > 0 || filteredShamanTotems.length > 0 || filteredWeaponMasteries.length > 0 || filteredDruidForms.length > 0 || filteredDruidTalentBuffs.length > 0 || filteredHunterAspects.length > 0 || filteredWarriorStances.length > 0 || filteredMageArmorBuffs.length > 0 || filteredWarlockArmorBuffs.length > 0) ? `
        <div class="buff-main-category">
            <div class="buff-main-header">Personal Buffs</div>
            <div class="buff-subcategories">
                ${renderBuffGroup(filteredWeaponImbues, 'Weapon Imbues')}
                ${renderBuffGroup(filteredShields, 'Shields')}
                ${renderBuffGroup(filteredPaladinAuras, 'Paladin Auras & Abilities')}
                ${renderBuffGroup(filteredShamanTotems, 'Shaman Totems')}
                ${renderBuffGroup(filteredHunterAspects, 'Hunter Aspects')}
                ${renderBuffGroup(filteredWarriorStances, 'Warrior Stances')}
                ${renderBuffGroup(filteredDruidForms, 'Druid Forms')}
                ${renderBuffGroup(filteredDruidTalentBuffs, 'Druid Talent Abilities')}
                ${renderBuffGroup(filteredWeaponMasteries, 'Weapon Skill Books')}
                ${renderBuffGroup(filteredMageArmorBuffs, 'Mage Armor')}
                ${renderBuffGroup(filteredWarlockArmorBuffs, 'Warlock Armor')}
            </div>
        </div>
    ` : '';

    // Build Raid Buffs section with subsections
    const raidBuffsSection = `
        <div class="buff-main-category">
            <div class="buff-main-header">Raid Buffs</div>
            <div class="buff-subcategories">
                ${renderBuffGroup(raidStatBuffs, 'Stat Buffs')}
                ${renderBuffGroup(raidDefensiveBuffs, 'Defensive Buffs')}
                ${renderBuffGroup(raidOffensiveBuffs, 'Offensive Buffs')}
            </div>
        </div>
    `;

    // Build Boss Debuffs section with subsections
    const bossDebuffsSection = `
        <div class="buff-main-category">
            <div class="buff-main-header">Boss Debuffs</div>
            <div class="buff-subcategories">
                ${renderBuffGroup(defensiveDebuffs, 'Defensive Debuffs')}
                ${renderBuffGroup(offensiveDebuffs, 'Offensive Debuffs')}
            </div>
        </div>
    `;

    // Build Consumables section with 2-column layout
    const consumablesSection = `
        <div class="buff-consumables-section">
            <div class="buff-main-header">Consumables</div>
            <div class="buff-consumables-columns">
                <div class="buff-subcategories">
                    ${renderBuffGroup(flasks, 'Flasks')}
                    ${renderBuffGroup(battleElixirs, 'Battle Elixirs')}
                    ${renderBuffGroup(guardianElixirs, 'Guardian Elixirs')}
                    ${renderBuffGroup(concoctions, 'Concoctions')}
                    ${renderBuffGroup(jujuBuffs, 'Juju Buffs')}
                </div>
                <div class="buff-subcategories">
                    ${renderBuffGroup(blastedLandsBuffs, 'Blasted Lands Buffs')}
                    ${renderBuffGroup(foodBuffs, 'Food')}
                    ${renderBuffGroup(drinks, 'Drinks')}
                    ${renderBuffGroup(potions, 'Potions')}
                    ${renderBuffGroup(weaponEnhancements, 'Weapon Enhancements')}
                </div>
            </div>
        </div>
    `;

    container.innerHTML = `
        <div class="buff-categories-container">
            ${personalBuffsSection}
            ${raidBuffsSection}
            ${bossDebuffsSection}
            ${consumablesSection}
        </div>
    `;

    // Attach tooltip event listeners to all buff icons
    attachBuffTooltips(container);
}

/**
 * Attach tooltip event listeners to buff icons
 * @param {HTMLElement} container - Container element with buff icons
 */
function attachBuffTooltips(container) {
    const buffIcons = container.querySelectorAll('.buff-icon');
    const tooltip = document.getElementById('item-tooltip');

    if (!tooltip) {
        console.error('Tooltip element not found');
        return;
    }

    buffIcons.forEach(icon => {
        const buffId = icon.id;
        const buff = buffs.find(b => b.id === buffId);
        if (!buff) return;

        icon.addEventListener('mouseenter', (e) => {
            if (!tooltip) return;

            const isImproved = icon.classList.contains('is-improved');
            const tooltipHTML = createBuffTooltipHTML(buff, isImproved);

            tooltip.innerHTML = tooltipHTML;
            tooltip.style.display = 'block';

            // Position tooltip
            const rect = icon.getBoundingClientRect();
            const tooltipRect = tooltip.getBoundingClientRect();
            const offset = 10;

            // Calculate initial position (viewport coordinates)
            let left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);
            let top = rect.top - tooltipRect.height - offset;

            // Keep tooltip on screen - check all edges (viewport coordinates)
            // Check left edge
            if (left < offset) left = offset;
            
            // Check right edge
            if (left + tooltipRect.width > window.innerWidth - offset) {
                left = window.innerWidth - tooltipRect.width - offset;
            }
            
            // Check top edge - if no room above, show below
            if (top < offset) {
                top = rect.bottom + offset;
            }
            
            // Check bottom edge - if no room below either, show above anyway (will be clipped but visible)
            if (top + tooltipRect.height > window.innerHeight - offset) {
                top = rect.top - tooltipRect.height - offset;
                // If still off screen, position at top of viewport
                if (top < offset) {
                    top = offset;
                }
            }

            // Viewport coords — #item-tooltip uses position:fixed (see style.css)
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${top}px`;
        });

        icon.addEventListener('mouseleave', () => {
            if (!tooltip) return;
            tooltip.style.display = 'none';
        });

        // Update tooltip when improved state changes
        icon.addEventListener('click', () => {
            if (!tooltip) return;

            // Small delay to let the class update
            setTimeout(() => {
                if (icon.matches(':hover')) {
                    const isImproved = icon.classList.contains('is-improved');
                    const tooltipHTML = createBuffTooltipHTML(buff, isImproved);
                    tooltip.innerHTML = tooltipHTML;
                }
            }, 50);
        });
    });
}

/**
 * Deactivate every buff and debuff toggle in `#buffs-list` (raid buffs, consumables, personal buffs, boss debuffs, etc.).
 */
export function clearAllBuffsDebuffsInDom(root = document.getElementById('buffs-list')) {
    if (!root) return;
    root.querySelectorAll('.buff-icon').forEach((icon) => {
        icon.classList.remove('active', 'is-improved');
    });
}

/**
 * Apply a saved buff list (e.g. shaman consume preset): clear all toggles via {@link clearAllBuffsDebuffsInDom}, then enable listed buffs.
 * Calls handleBuffExclusivity after each activation so flask/elixir groups stay consistent.
 * @param {Array<{ id: string, improved?: boolean }>} buffList
 */
export function applyBuffListToDom(buffList, root = document.getElementById('buffs-list')) {
    if (!root) return;

    clearAllBuffsDebuffsInDom(root);

    for (const b of buffList || []) {
        if (!b || !b.id) continue;
        const el = root.querySelector(`[id="${CSS.escape(b.id)}"]`) || document.getElementById(b.id);
        if (!el) continue;
        el.classList.add('active');
        if (b.improved) el.classList.add('is-improved');
        handleBuffExclusivity(b.id);
    }
}

/**
 * Deactivate other buffs in the same exclusive group as the activated buff.
 * @param {string} buffId - ID of the buff being activated
 */
export function handleBuffExclusivity(buffId) {
    const buff = buffs.find(b => b.id === buffId);

    // Define concoction relationships (concoction -> [elixir1, elixir2])
    const concoctionRelationships = {
        'emerald_mongoose': ['mongoose', 'dreamshard'],
        'arcane_giant': ['giants', 'greater_arcane'],
        'dreamwater': ['winterfall_firewater', 'dreamtonic']
    };

    // Create reverse mapping (elixir -> concoction)
    const elixirToConcoctionMap = {};
    Object.entries(concoctionRelationships).forEach(([concoction, elixirs]) => {
        elixirs.forEach(elixir => {
            if (!elixirToConcoctionMap[elixir]) {
                elixirToConcoctionMap[elixir] = [];
            }
            elixirToConcoctionMap[elixir].push(concoction);
        });
    });

    // Handle concoction exclusivity
    if (concoctionRelationships[buffId]) {
        // This is a concoction - deactivate its component elixirs
        const componentElixirs = concoctionRelationships[buffId];
        componentElixirs.forEach(elixirId => {
            const elixirIcon = document.getElementById(elixirId);
            if (elixirIcon) {
                elixirIcon.classList.remove('active');
                elixirIcon.classList.remove('is-improved');
            }
        });
    }

    // Handle elixir exclusivity
    if (elixirToConcoctionMap[buffId]) {
        // This is an elixir - deactivate its matching concoction(s)
        const matchingConcoctions = elixirToConcoctionMap[buffId];
        matchingConcoctions.forEach(concoctionId => {
            const concoctionIcon = document.getElementById(concoctionId);
            if (concoctionIcon) {
                concoctionIcon.classList.remove('active');
                concoctionIcon.classList.remove('is-improved');
            }
        });
    }

    // Handle standard exclusiveGroup logic (for flasks, battle elixirs, etc.)
    if (!buff || !buff.exclusiveGroup) return;

    // Find all other buffs in the same exclusive group
    const conflictingBuffs = buffs.filter(b =>
        b.exclusiveGroup === buff.exclusiveGroup && b.id !== buffId
    );

    // Deactivate all conflicting buffs
    conflictingBuffs.forEach(conflictBuff => {
        const conflictIcon = document.getElementById(conflictBuff.id);
        if (conflictIcon) {
            conflictIcon.classList.remove('active');
            conflictIcon.classList.remove('is-improved');
        }
    });
}

/**
 * Get the currently active weapon imbue (if any)
 * @returns {Object|null} The active weapon imbue buff object, or null if none active
 */
export function getActiveWeaponImbue() {
    const activeIcons = document.querySelectorAll('.buff-icon.active');

    for (const icon of activeIcons) {
        const buff = buffs.find(b => b.id === icon.id);
        if (buff && buff.exclusiveGroup === 'weapon_imbue') {
            return buff;
        }
    }

    return null;
}

// Helper to get equipped weapon from gear.js module
function getEquippedWeapon(slot) {
    try {
        const gearModule = window.gearModule || {};
        console.log('getEquippedWeapon:', slot, 'gearModule exists?', !!window.gearModule, 'function exists?', typeof gearModule.getCurrentlyEquippedItem);
        if (typeof gearModule.getCurrentlyEquippedItem === 'function') {
            const item = gearModule.getCurrentlyEquippedItem(slot);
            console.log('Got item for slot', slot, ':', item);
            return item;
        }
    } catch (e) {
        console.warn('Could not get equipped weapon:', e);
    }
    return null;
}

// This function gets the active buffs and does not need to be changed.
export function getActiveBuffs(talentBonuses = {}) {
    const activeBuffs = [];
    const activeIcons = document.querySelectorAll('.buff-icon.active');

    console.log('[getActiveBuffs] Found', activeIcons.length, 'active buff icons:', Array.from(activeIcons).map(i => i.id));

    activeIcons.forEach(icon => {
        const buff = buffs.find(b => b.id === icon.id);
        if (buff) {
            // For weapon masteries, check if player is using a matching weapon type
            if (buff.weaponTypes) {
                const mainhand = getEquippedWeapon('mainhand');
                const offhand = getEquippedWeapon('offhand');
                const ranged = getEquippedWeapon('ranged');

                // Get weapon types - use getMeleeWeaponType for extraction from tooltip_lines_raw
                // (items no longer have a pre-computed weaponType property)
                const gearModule = window.gearModule || {};
                const getMeleeType = typeof gearModule.getMeleeWeaponType === 'function'
                    ? gearModule.getMeleeWeaponType
                    : (item) => item?.weaponType || null;
                const mainhandType = getMeleeType(mainhand);
                const offhandType = getMeleeType(offhand);
                const rangedType = ranged?.weaponType || null;

                console.log('Checking weapon mastery:', buff.name, {
                    weaponTypes: buff.weaponTypes,
                    mainhandType,
                    offhandType,
                    rangedType
                });

                // Check if any equipped weapon matches the mastery's weapon types
                // Build the full type key (including "Two-handed" prefix for 2H weapons)
                const getFullWeaponType = (item, baseType) => {
                    if (!baseType || !item) return baseType;
                    const isTwoHand = (item.tooltip_lines_raw || []).includes('Two-hand');
                    return isTwoHand ? `Two-handed ${baseType}` : baseType;
                };
                const mainhandFullType = getFullWeaponType(mainhand, mainhandType);
                const offhandFullType = getFullWeaponType(offhand, offhandType);

                const hasMatchingWeapon = [mainhandFullType, offhandFullType, rangedType].some(weaponType => {
                    if (!weaponType) return false;
                    return buff.weaponTypes.includes(weaponType);
                });

                console.log('Has matching weapon?', hasMatchingWeapon);

                // Skip this buff if no matching weapon is equipped
                if (!hasMatchingWeapon) {
                    console.log('Skipping mastery - no matching weapon');
                    return;
                }
            }

            // Return an object that includes the buff name AND the stats
            // This allows the calculator to check buff.name for conditionals
            const isImproved = buff.improved_stats && icon.classList.contains('is-improved');
            let stats;
            if (isImproved) {
                stats = buff.improved_stats;
            } else {
                stats = buff.base_stats;
            }

            // Check if buff has talent-based bonuses (e.g., Righteous Fury + Righteous Defense talent)
            let talentBonusStats = {};
            if (buff.getTalentBonus && typeof buff.getTalentBonus === 'function') {
                talentBonusStats = buff.getTalentBonus(talentBonuses) || {};
            }

            // Normalize only the full-name variants to their expected forms
            // This handles cases where buffs use "fireResistance" but calculator expects "fireResist"
            // Note: We keep short names (sta, agi, str, int, spi) as-is since calculator expects them
            const resistanceNormalization = {
                fireResistance: 'fireResist',
                natureResistance: 'natureResist',
                frostResistance: 'frostResist',
                shadowResistance: 'shadowResist',
                arcaneResistance: 'arcaneResist',
                stamina: 'sta',
                agility: 'agi',
                strength: 'str',
                intellect: 'int',
                spirit: 'spi'
            };

            const normalizedStats = {};
            const mergedStats = { ...stats, ...talentBonusStats };

            Object.keys(mergedStats).forEach(key => {
                const normalizedKey = resistanceNormalization[key] || key;
                normalizedStats[normalizedKey] = mergedStats[key];
            });

            // Merge the buff name with the normalized stats
            activeBuffs.push({
                name: buff.name,
                id: buff.id,
                isImproved: isImproved, // Track improved state for buffs like Hemorrhage
                weaponTypes: buff.weaponTypes, // Preserve weapon types for weapon masteries
                ...normalizedStats
            });
        }
    });
    return activeBuffs;
}

/** Resolve a saved `{ id, improved }[]` list to calculator buff objects (no DOM). */
export function getBuffsFromSavedList(savedList, talentBonuses = {}) {
    const activeBuffs = [];
    for (const entry of savedList || []) {
        if (!entry?.id) continue;
        const buff = buffs.find(b => b.id === entry.id);
        if (!buff) continue;
        const isImproved = !!(buff.improved_stats && entry.improved);
        const stats = isImproved ? buff.improved_stats : buff.base_stats;
        let talentBonusStats = {};
        if (buff.getTalentBonus && typeof buff.getTalentBonus === 'function') {
            talentBonusStats = buff.getTalentBonus(talentBonuses) || {};
        }
        const resistanceNormalization = {
            fireResistance: 'fireResist',
            natureResistance: 'natureResist',
            frostResistance: 'frostResist',
            shadowResistance: 'shadowResist',
            arcaneResistance: 'arcaneResist',
            stamina: 'sta',
            agility: 'agi',
            strength: 'str',
            intellect: 'int',
            spirit: 'spi'
        };
        const normalizedStats = {};
        const mergedStats = { ...stats, ...talentBonusStats };
        Object.keys(mergedStats).forEach(key => {
            const normalizedKey = resistanceNormalization[key] || key;
            normalizedStats[normalizedKey] = mergedStats[key];
        });
        activeBuffs.push({
            name: buff.name,
            id: buff.id,
            isImproved,
            weaponTypes: buff.weaponTypes,
            ...normalizedStats
        });
    }
    return activeBuffs;
}