/**
 * Taxonomy for the categorized enchant picker (modal.js).
 * @see enchants.md — Enchant picker categories
 */

/** @typedef {'offensive'|'defensive'|'healing'|'utility'|'other'} EnchantMainCategory */
/** @typedef {'phys'|'spell'|null} EnchantSubCategory */

/** @type {Record<EnchantMainCategory, { label: string; cssClass: string }>} */
export const ENCHANT_MAIN_CATEGORIES = {
    offensive: { label: 'Offensive', cssClass: 'enchant-picker-main-header--offensive' },
    defensive: { label: 'Defensive', cssClass: 'enchant-picker-main-header--defensive' },
    healing: { label: 'Healing', cssClass: 'enchant-picker-main-header--healing' },
    utility: { label: 'Utility', cssClass: 'enchant-picker-main-header--utility' },
    other: { label: 'Other', cssClass: 'enchant-picker-main-header--other' },
};

/** @type {Record<string, { main: EnchantMainCategory; sub: EnchantSubCategory }>} */
export const ENCHANT_SUBCATEGORIES = {
    'offensive.phys': { main: 'offensive', sub: 'phys' },
    'offensive.spell': { main: 'offensive', sub: 'spell' },
    'defensive.phys': { main: 'defensive', sub: 'phys' },
    'defensive.spell': { main: 'defensive', sub: 'spell' },
    healing: { main: 'healing', sub: null },
    utility: { main: 'utility', sub: null },
    other: { main: 'other', sub: null },
};

/** Column render order (main categories left-to-right). */
export const ENCHANT_CATEGORY_ORDER = ['offensive', 'defensive', 'healing', 'utility', 'other'];

/** Sub-group order within Offensive / Defensive columns. */
export const ENCHANT_SUBCATEGORY_ORDER = ['phys', 'spell'];

const OFFENSIVE_PHYS_KEYS = new Set([
    'ap', 'attackPower', 'rap', 'rangedAttackPower', 'rangedDmg',
    'str', 'agi', 'crit', 'hit', 'hitPercent', 'weaponDamage', 'armorPen', 'haste', 'vampirism',
]);

const OFFENSIVE_SPELL_KEYS = new Set([
    'dmgAndHealing',
    'fireDamage', 'frostDamage', 'natureDamage', 'shadowDamage', 'arcaneDamage', 'holyDamage',
    'spellCrit', 'spellHit', 'spellPen', 'int',
]);

const DEFENSIVE_PHYS_KEYS = new Set([
    'sta', 'armor', 'def', 'dodge', 'parry', 'blockValue', 'blockChance', 'health',
]);

const DEFENSIVE_SPELL_KEYS = new Set([
    'allResist', 'fireResist', 'frostResist', 'natureResist', 'shadowResist', 'arcaneResist',
    'mana', 'mp5', 'manaRegen',
]);

const HEALING_KEYS = new Set(['healing']);

const UTILITY_NAME_PATTERNS = [
    /\bminor speed\b/, /\brun speed\b/, /\briding\b/, /\bthreat\b/, /\bsubtlety\b/, /\bstealth\b/,
    /\bherbalism\b/, /\bmining\b/, /\bskinning\b/, /\bfishing\b/, /\bskill\b/,
    /\bspike\b/, /\bbuckle\b/,
];

const OFFENSIVE_PHYS_NAME_PATTERNS = [
    /\bcrusader\b/, /\bfiery\b/, /\blifesteal/, /\bdemonslay/, /\bbeastslay/, /\bunholy\b/,
    /\bwinter'?s might\b/, /\bicy chill\b/, /\bferocity\b/, /\bleeching\b/,
    /\battack power\b/, /\bagility\b/, /\bstrength\b/, /\bweapon damage\b/, /\bscope\b/,
];

const OFFENSIVE_SPELL_NAME_PATTERNS = [
    /\bspell (damage|power)\b/, /\bspell dmg\b/, /\bfire power\b/, /\bfrost power\b/,
    /\bshadow power\b/, /\bnature power\b/, /\barcane power\b/,
];

const HEALING_NAME_PATTERNS = [
    /\bhealing power\b/, /\bhealing\b/, /\bserenity\b/,
];

const UTILITY_STAT_KEYS = new Set(['spi']);

const DEFENSIVE_PHYS_NAME_PATTERNS = [
    /\bdefen[cs]e\b/, /\bstamina\b/, /\barmor\b/, /\bdodge\b/, /\bparry\b/, /\bblock\b/,
    /\bresilience\b/,
];

const DEFENSIVE_SPELL_NAME_PATTERNS = [
    /\bresist(ance)?\b/, /\bmana\b/, /\bmp5\b/, /\bmana regen\b/,
];

function scoreKeys(stats, keySet) {
    let score = 0;
    for (const key of keySet) {
        const val = stats[key];
        if (val) score += Math.abs(Number(val)) || 1;
    }
    return score;
}

function scoreNamePatterns(text, patterns) {
    return patterns.some((re) => re.test(text)) ? 1 : 0;
}

/**
 * Resolve enchant bucket id (e.g. `offensive.phys`, `healing`, `other`).
 * @param {object} enchant
 * @returns {string}
 */
export function getEnchantCategoryId(enchant) {
    if (!enchant || enchant.name === 'None') return 'other';

    const stats = enchant.stats || {};
    const nameText = (enchant.name || '').toLowerCase();
    const utilityText = `${enchant.name || ''} ${enchant.description || ''}`.toLowerCase();

    const healingScore = scoreKeys(stats, HEALING_KEYS)
        + scoreNamePatterns(nameText, HEALING_NAME_PATTERNS) * 50;
    if (healingScore > 0 && scoreKeys(stats, OFFENSIVE_SPELL_KEYS) === 0) {
        return 'healing';
    }

    const scores = {
        'offensive.phys': scoreKeys(stats, OFFENSIVE_PHYS_KEYS),
        'offensive.spell': scoreKeys(stats, OFFENSIVE_SPELL_KEYS),
        'defensive.phys': scoreKeys(stats, DEFENSIVE_PHYS_KEYS),
        'defensive.spell': scoreKeys(stats, DEFENSIVE_SPELL_KEYS),
        healing: healingScore,
        utility: scoreKeys(stats, UTILITY_STAT_KEYS),
    };

    scores['offensive.phys'] += scoreNamePatterns(nameText, OFFENSIVE_PHYS_NAME_PATTERNS) * 50;
    scores['offensive.spell'] += scoreNamePatterns(nameText, OFFENSIVE_SPELL_NAME_PATTERNS) * 50;
    scores['defensive.phys'] += scoreNamePatterns(nameText, DEFENSIVE_PHYS_NAME_PATTERNS) * 50;
    scores['defensive.spell'] += scoreNamePatterns(nameText, DEFENSIVE_SPELL_NAME_PATTERNS) * 50;

    if (scoreNamePatterns(utilityText, UTILITY_NAME_PATTERNS)) {
        scores.utility += 50;
    }

    // Mixed dmg/heal threads: spell offense beats healing when spell dmg is present
    if (scores['offensive.spell'] > 0 && scores.healing > 0) {
        scores.healing = 0;
    }

    // allStats alone → utility-ish; with other stats the numeric keys above win
    if (stats.allStats && Object.keys(stats).length === 1) {
        scores.utility += 10;
    }

    let bestId = 'other';
    let bestScore = -1;
    for (const [id, score] of Object.entries(scores)) {
        if (score > bestScore) {
            bestScore = score;
            bestId = id;
        }
    }

    if (bestScore <= 0) return 'other';
    return bestId;
}

/**
 * @param {object} enchant
 * @returns {{ main: EnchantMainCategory; sub: EnchantSubCategory; bucketId: string }}
 */
export function getEnchantCategory(enchant) {
    const bucketId = getEnchantCategoryId(enchant);
    const meta = ENCHANT_SUBCATEGORIES[bucketId] || ENCHANT_SUBCATEGORIES.other;
    return { ...meta, bucketId };
}

/**
 * Infer WoW-style quality color class for picker display (enchants have no item quality field).
 * @param {object} enchant
 * @returns {string} CSS class e.g. `q3`
 */
export function getEnchantQualityClass(enchant) {
    if (!enchant || enchant.name === 'None') return 'q0';

    const name = enchant.name.toLowerCase();
    if (/zandalar|naxx|spectral|eternal|powerful|mighty|major/.test(name)) return 'q4';
    if (/superior|greater|excellent|strong/.test(name)) return 'q3';
    if (/lesser|minor|small|weak/.test(name)) return 'q1';
    return 'q2';
}

/**
 * Group enchants by category for picker rendering. Preserves input order within buckets.
 * @param {object[]} enchants
 * @returns {Map<string, object[]>}
 */
export function groupEnchantsByCategory(enchants) {
    /** @type {Map<string, object[]>} */
    const groups = new Map();
    const noneEntry = enchants.find((e) => e.name === 'None');
    if (noneEntry) groups.set('other', [noneEntry]);

    for (const enchant of enchants) {
        if (enchant.name === 'None') continue;
        const bucketId = getEnchantCategoryId(enchant);
        if (!groups.has(bucketId)) groups.set(bucketId, []);
        groups.get(bucketId).push(enchant);
    }
    return groups;
}
