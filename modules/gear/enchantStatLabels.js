/**
 * Shared enchant stat names and formatting for tooltips (full names) and gear strip (compact).
 * @see enchants.md
 */

/** Display names for enchant tooltip stat lines (matches prior tooltips.js map, extended for all DB keys). */
export const ENCHANT_STAT_NAME_MAP = {
    sta: 'Stamina',
    agi: 'Agility',
    str: 'Strength',
    int: 'Intellect',
    spi: 'Spirit',
    armor: 'Armor',
    def: 'Defense',
    dodge: 'Dodge',
    health: 'Health',
    parry: 'Parry',
    blockChance: 'Block Chance',
    blockValue: 'Block Value',
    ap: 'Attack Power',
    attackPower: 'Attack Power',
    rap: 'Ranged Attack Power',
    rangedAttackPower: 'Ranged Attack Power',
    healing: 'Bonus Healing',
    dmgAndHealing: '+Dmg/Heal',
    fireDamage: 'Fire Spell Damage',
    frostDamage: 'Frost Spell Damage',
    natureDamage: 'Nature Spell Damage',
    shadowDamage: 'Shadow Spell Damage',
    arcaneDamage: 'Arcane Spell Damage',
    holyDamage: 'Holy Spell Damage',
    fireResist: 'Fire Resist',
    frostResist: 'Frost Resist',
    natureResist: 'Nature Resist',
    shadowResist: 'Shadow Resist',
    arcaneResist: 'Arcane Resist',
    allResist: 'All Resistances',
    allStats: 'All Stats',
    crit: 'Crit',
    spellCrit: 'Spell Crit',
    hit: 'Hit',
    spellHit: 'Spell Hit',
    hitPercent: 'Hit',
    spellPen: 'Spell Penetration',
    haste: 'Haste',
    weaponDamage: 'Weapon Damage',
    rangedDmg: 'Ranged Damage',
    armorPen: 'Armor Penetration',
    mp5: 'Mana per 5 sec',
    mana: 'Mana',
    manaRegen: 'Mana per 5 sec',
    vampirism: 'Vampirism'
};

const PERCENT_KEYS = new Set([
    'dodge', 'parry', 'blockChance', 'haste', 'hitPercent', 'spellCrit', 'crit', 'vampirism'
]);

/** Preferred order for compact segments (then any remaining keys alphabetically). */
const COMPACT_KEY_ORDER = [
    'allStats', 'allResist', 'str', 'agi', 'int', 'spi', 'sta',
    'healing', 'dmgAndHealing',
    'ap', 'attackPower', 'rap', 'rangedAttackPower',
    'weaponDamage', 'rangedDmg',
    'def', 'armor', 'blockValue', 'blockChance',
    'crit', 'spellCrit', 'hit', 'spellHit', 'hitPercent',
    'spellPen', 'armorPen', 'haste',
    'fireDamage', 'frostDamage', 'natureDamage', 'shadowDamage', 'arcaneDamage', 'holyDamage',
    'fireResist', 'frostResist', 'natureResist', 'shadowResist', 'arcaneResist',
    'health', 'mana', 'mp5', 'manaRegen', 'vampirism'
];

/** Short suffixes for gear-strip compact label (AP/RAP disambiguation handled in formatCompactSegment). */
const COMPACT_SUFFIX = {
    sta: 'Stam', agi: 'Agi', str: 'Str', int: 'Int', spi: 'Spi',
    allStats: 'All',
    allResist: 'All Res',
    armor: 'Armor',
    def: 'Def',
    health: 'HP',
    mana: 'Mana',
    mp5: 'MP5',
    manaRegen: 'MP5',
    healing: 'Heal',
    dmgAndHealing: 'SP',
    fireDamage: 'Fire',
    frostDamage: 'Frost',
    natureDamage: 'Nat',
    shadowDamage: 'Shadow',
    arcaneDamage: 'Arcane',
    holyDamage: 'Holy',
    fireResist: 'Fire Res',
    frostResist: 'Frost Res',
    natureResist: 'Nat Res',
    shadowResist: 'Shadow Res',
    arcaneResist: 'Arcane Res',
    crit: 'Crit',
    spellCrit: 'Spell Crit',
    hit: 'Hit',
    spellHit: 'Spell Hit',
    hitPercent: 'Hit',
    spellPen: 'Pen',
    haste: 'Haste',
    weaponDamage: 'Wpn',
    rangedDmg: 'Rng',
    armorPen: 'ArP',
    blockValue: 'BV',
    blockChance: 'Block',
    parry: 'Parry',
    dodge: 'Dodge',
    vampirism: 'Vamp'
};

/**
 * One tooltip line for a stat (plain text; caller joins with <br/>).
 */
function formatStatLinePlain(key, value) {
    if (value == null || value === 0) return '';
    const statName = ENCHANT_STAT_NAME_MAP[key] ||
        (key.charAt(0).toUpperCase() + key.slice(1));
    const prefix = '+';
    if (PERCENT_KEYS.has(key)) {
        return `${prefix}${value}% ${statName}`;
    }
    return `${prefix}${value} ${statName}`;
}

/**
 * HTML body lines for enchant stats (for tooltips).
 * @param {Record<string, number>|undefined|null} stats
 * @returns {string}
 */
export function formatEnchantStatsHTML(stats) {
    if (!stats || typeof stats !== 'object') return '';
    const parts = [];
    for (const [key, value] of Object.entries(stats)) {
        const line = formatStatLinePlain(key, value);
        if (line) parts.push(line);
    }
    return parts.join('<br/>');
}

function sortedStatEntries(stats) {
    const entries = Object.entries(stats).filter(([, v]) => v != null && v !== 0 && v !== '');
    entries.sort((a, b) => {
        const ia = COMPACT_KEY_ORDER.indexOf(a[0]);
        const ib = COMPACT_KEY_ORDER.indexOf(b[0]);
        if (ia === -1 && ib === -1) return a[0].localeCompare(b[0]);
        if (ia === -1) return 1;
        if (ib === -1) return -1;
        return ia - ib;
    });
    return entries;
}

/**
 * @param {string} key
 * @param {number} value
 * @param {Record<string, number>} fullStats
 * @returns {string}
 */
function formatCompactSegment(key, value, fullStats) {
    if (value == null || value === 0) return '';

    if (key === 'allStats') {
        return `+${value} All`;
    }

    if (PERCENT_KEYS.has(key)) {
        const suf = COMPACT_SUFFIX[key] || key;
        return `+${value}% ${suf}`;
    }

    let suffix;
    if (key === 'rap') {
        suffix = 'RAP';
    } else if (key === 'rangedAttackPower') {
        if (fullStats.rap != null && Number(fullStats.rap) === Number(value)) {
            suffix = 'RAP';
        } else {
            suffix = 'AP';
        }
    } else if (key === 'ap' || key === 'attackPower') {
        suffix = 'AP';
    } else {
        suffix = COMPACT_SUFFIX[key] ||
            (ENCHANT_STAT_NAME_MAP[key] || key).split(' ')[0];
    }

    return `+${value} ${suffix}`;
}

/**
 * Build compact stat summary for gear strip (dedupes identical segments e.g. triple +14 AP).
 * @param {Record<string, number>} stats
 * @returns {string[]}
 */
export function getEnchantCompactStatSegments(stats) {
    if (!stats || typeof stats !== 'object') return [];
    const seen = new Set();
    const out = [];
    for (const [key, value] of sortedStatEntries(stats)) {
        const seg = formatCompactSegment(key, value, stats);
        if (seg && !seen.has(seg)) {
            seen.add(seg);
            out.push(seg);
        }
    }
    return out;
}

/**
 * Strip "Enchant &lt;slot&gt; - " / "Enchant Weapon - " prefix for mechanic-only enchants.
 * @param {string} fullName
 * @returns {string}
 */
export function mechanicShortNameFromFullName(fullName) {
    if (!fullName || fullName === 'None') return '';
    const trimmed = fullName.trim();
    const lower = trimmed.toLowerCase();
    const prefixes = [
        /^enchant\s+2h\s+weapon\s*-\s*/i,
        /^enchant\s+shield\s*-\s*/i,
        /^enchant\s+weapon\s*-\s*/i,
        /^enchant\s+\w+\s*-\s*/i
    ];
    for (const re of prefixes) {
        const m = trimmed.replace(re, '');
        if (m !== trimmed) return m.trim() || trimmed;
    }
    return trimmed;
}

/**
 * Short label for main gear page: stats summary or mechanic name.
 * @param {{ name?: string, stats?: Record<string, number>, shortName?: string }|null|undefined} enchant
 * @returns {string}
 */
export function getEnchantCompactLabel(enchant) {
    if (!enchant || enchant.name === 'None') return '';

    const stats = enchant.stats && typeof enchant.stats === 'object' ? enchant.stats : {};
    const hasStat = Object.values(stats).some(v => v != null && v !== 0 && v !== '');

    if (!hasStat) {
        if (enchant.shortName) return String(enchant.shortName);
        return mechanicShortNameFromFullName(enchant.name);
    }

    const segments = getEnchantCompactStatSegments(stats);
    if (segments.length === 0) {
        if (enchant.shortName) return String(enchant.shortName);
        return mechanicShortNameFromFullName(enchant.name);
    }
    return segments.join(', ');
}
