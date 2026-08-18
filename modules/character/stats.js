// modules/stats.js - Centralized stat definitions and mappings
// Single source of truth for all stat-related constants and utilities

// Template for default stat values
export const STAT_TEMPLATE = {
    stamina: 0,
    agility: 0,
    strength: 0,
    intellect: 0,
    spirit: 0,
    defense: 0,
    armor: 0,
    health: 0,
    mana: 0,
    dodge: 0,
    parry: 0,
    blockChance: 0,
    blockValue: 0,
    attackPower: 0,
    druidAP: 0,
    crit: 0,
    hit: 0,
    haste: 0,
    spellCrit: 0,
    spellHit: 0,
    spellPen: 0,
    healing: 0,
    dmgAndHealing: 0,
    fireDamage: 0,
    frostDamage: 0,
    natureDamage: 0,
    shadowDamage: 0,
    arcaneDamage: 0,
    holyDamage: 0,
    fireResist: 0,
    natureResist: 0,
    frostResist: 0,
    shadowResist: 0,
    arcaneResist: 0,
    allStats: 0,
    allResist: 0,
    vampirism: 0,
    critDmgReduction: 0,
    armorPen: 0,
    weaponSkill: 0,
    weaponSkillByType: {}, // Hidden per-weapon-type bonuses (e.g., {'Axe': 5, 'Two-handed Axes': 6})
    weaponDamageMin: 0,
    weaponDamageMax: 0,
    weaponSpeed: 0,
    rangedAttackPower: 0,
    fortune: 0,       // % multiplicative bonus to item-based proc trigger chances
    /** Bonus melee AP when fighting X (tooltip: "Increases attack power when fighting …" / "+AP when fighting …") */
    apVsUndead: 0,
    apVsBeast: 0,
    apVsDemon: 0,
    apVsElemental: 0,
    apVsDragonkin: 0,
    apVsHumanoid: 0,
    apVsGiant: 0,
    apVsAberration: 0,
    apVsMechanical: 0,
    apVsCritter: 0,
    apVsTotem: 0,
    /** Bonus spell dmg/heal vs creature type (e.g. Mark of the Champion: damage to Undead/Demons by magical spells and effects). */
    dmgHealingVsUndead: 0,
    dmgHealingVsBeast: 0,
    dmgHealingVsDemon: 0,
    dmgHealingVsElemental: 0,
    dmgHealingVsDragonkin: 0,
    dmgHealingVsHumanoid: 0,
    dmgHealingVsGiant: 0,
    dmgHealingVsAberration: 0,
    dmgHealingVsMechanical: 0,
    dmgHealingVsCritter: 0,
    dmgHealingVsTotem: 0
};

/** Keys on STAT_TEMPLATE used for gear/enchant "AP vs creature type" (aggregation + UI). */
export const AP_VS_GEAR_STAT_KEYS = Object.keys(STAT_TEMPLATE).filter(k => k.startsWith('apVs'));

/** Keys on STAT_TEMPLATE for spell damage/healing vs creature type (gear + UI). */
export const DMG_HEALING_VS_GEAR_STAT_KEYS = Object.keys(STAT_TEMPLATE).filter(k => k.startsWith('dmgHealingVs'));

/** Boss / target `faction` tag (normalized) → STAT_TEMPLATE apVs* key */
export const FACTION_TAG_TO_AP_VS_KEY = {
    undead: 'apVsUndead',
    beast: 'apVsBeast',
    beasts: 'apVsBeast',
    demon: 'apVsDemon',
    demons: 'apVsDemon',
    elemental: 'apVsElemental',
    elementals: 'apVsElemental',
    dragonkin: 'apVsDragonkin',
    humanoid: 'apVsHumanoid',
    humanoids: 'apVsHumanoid',
    giant: 'apVsGiant',
    giants: 'apVsGiant',
    aberration: 'apVsAberration',
    aberrations: 'apVsAberration',
    mechanical: 'apVsMechanical',
    critter: 'apVsCritter',
    critters: 'apVsCritter',
    totem: 'apVsTotem',
    totems: 'apVsTotem'
};

/** Boss / target `faction` tag → STAT_TEMPLATE dmgHealingVs* key (parallel to AP vs type). */
export const FACTION_TAG_TO_DMG_HEALING_VS_KEY = Object.fromEntries(
    Object.entries(FACTION_TAG_TO_AP_VS_KEY).map(([tag, k]) => [tag, k.replace(/^apVs/, 'dmgHealingVs')])
);

/** Preferred order for Advanced Melee "AP vs …" rows (only non-zero rows are shown). */
export const AP_VS_DISPLAY_ORDER = [
    'apVsUndead', 'apVsBeast', 'apVsDemon', 'apVsElemental', 'apVsDragonkin', 'apVsHumanoid',
    'apVsGiant', 'apVsAberration', 'apVsMechanical', 'apVsCritter', 'apVsTotem'
];

/** Preferred order for "SP vs …" rows (only non-zero rows are shown). */
export const DMG_HEALING_VS_DISPLAY_ORDER = AP_VS_DISPLAY_ORDER.map(k => k.replace(/^apVs/, 'dmgHealingVs'));

/**
 * Map tooltip creature label (e.g. "Undead", "Beasts", "Elementals") to STAT_TEMPLATE key.
 * @returns {string|null}
 */
export function mapCreatureLabelToApVsStatKey(rawLabel) {
    let s = String(rawLabel || '').trim().replace(/\.$/, '').toLowerCase();
    s = s.replace(/^the\s+/, '');
    const table = {
        undead: 'apVsUndead',
        beast: 'apVsBeast',
        beasts: 'apVsBeast',
        demon: 'apVsDemon',
        demons: 'apVsDemon',
        elemental: 'apVsElemental',
        elementals: 'apVsElemental',
        dragonkin: 'apVsDragonkin',
        humanoid: 'apVsHumanoid',
        humanoids: 'apVsHumanoid',
        giant: 'apVsGiant',
        giants: 'apVsGiant',
        aberration: 'apVsAberration',
        aberrations: 'apVsAberration',
        mechanical: 'apVsMechanical',
        critter: 'apVsCritter',
        critters: 'apVsCritter',
        totem: 'apVsTotem',
        totems: 'apVsTotem'
    };
    return table[s] || null;
}

/**
 * Map creature label to dmgHealingVs* key (spell damage/healing vs type).
 * @returns {string|null}
 */
export function mapCreatureLabelToDmgHealingVsStatKey(rawLabel) {
    const apKey = mapCreatureLabelToApVsStatKey(rawLabel);
    return apKey ? apKey.replace(/^apVs/, 'dmgHealingVs') : null;
}

/**
 * UI label for an apVs* stat key, e.g. apVsUndead → "AP vs Undead"
 * @param {string} statKey
 * @returns {string}
 */
export function getApVsRowLabel(statKey) {
    if (!statKey || typeof statKey !== 'string' || !statKey.startsWith('apVs')) return statKey || '';
    const tail = statKey.slice(4);
    if (!tail) return statKey;
    const spaced = tail.replace(/([a-z])([A-Z])/g, '$1 $2');
    return `AP vs ${spaced}`;
}

/**
 * UI label for dmgHealingVs* keys, e.g. dmgHealingVsUndead → "SP vs Undead"
 * @param {string} statKey
 * @returns {string}
 */
export function getDmgHealingVsRowLabel(statKey) {
    if (!statKey || typeof statKey !== 'string' || !statKey.startsWith('dmgHealingVs')) return statKey || '';
    const tail = statKey.slice('dmgHealingVs'.length);
    if (!tail) return statKey;
    const spaced = tail.replace(/([a-z])([A-Z])/g, '$1 $2');
    return `SP vs ${spaced}`;
}

// Mapping from short stat names to full stat keys
export const KEY_MAP = {
    sta: 'stamina',
    agi: 'agility',
    str: 'strength',
    int: 'intellect',
    spi: 'spirit',
    def: 'defense',
    ap: 'attackPower',
    block: 'blockChance',
    fireresist: 'fireResist',
    natureresist: 'natureResist',
    frostresist: 'frostResist',
    shadowresist: 'shadowResist',
    arcaneresist: 'arcaneResist',
    allresist: 'allResist',
    rap: 'rangedAttackPower',
    rangedattackpower: 'rangedAttackPower',
    hitpercent: 'hit',
    hitPercent: 'hit',
    // Support both "Resist" and "Resistance" naming
    fireResistance: 'fireResist',
    natureResistance: 'natureResist',
    frostResistance: 'frostResist',
    shadowResistance: 'shadowResist',
    arcaneResistance: 'arcaneResist'
};

// Smart stat aliases for filtering
// NOTE: Keep aliases precise - resistance types should NOT cross-match
export const STAT_ALIASES = {
    'stamina': ['+ stamina'],
    'agility': ['+ agility'],
    'strength': ['+ strength'],
    'intellect': ['+ intellect'],
    'spirit': ['+ spirit'],
    'defense': ['defense rating', '+ defense'],
    'armor': ['armour'],
    'attack power': ['+ attack power', 'attack power by'],
    'spell power': ['damage and healing', 'spell damage and healing', '+ damage and healing'],
    'spell damage': ['damage and healing', 'spell damage and healing'],
    'healing power': ['healing done', '+ healing', 'healing spells'],
    'critical strike': ['critical strike rating', 'crit rating', '+ critical strike'],
    'hit': ['hit rating', '+ hit'],
    // Turtle gear uses "attack and casting speed" / "% haste" etc.; keep in sync with STAT_PATTERNS.haste
    'haste': [
        'haste rating',
        '+ haste',
        'attack and casting speed',
        'casting speed',
        'attack speed',
        '% melee haste',
        'melee haste',
        '% haste'
    ],
    'spell penetration': [
        'spell penetration',
        'spell pen',
        '+ spell penetration',
        'decreases the magical resistance',
        'magical resistances of your spell targets'
    ],
    'dodge': ['dodge rating', '+ dodge'],
    'parry': ['parry rating', '+ parry'],
    'block': ['block rating', '+ block', 'chance to block'],
    'block value': ['+ block value', 'block value of'],
    'mp5': ['mana per 5', 'mp5'],
    'fire resistance': ['+ fire resistance'],
    'nature resistance': ['+ nature resistance'],
    'frost resistance': ['+ frost resistance'],
    'shadow resistance': ['+ shadow resistance'],
    'arcane resistance': ['+ arcane resistance']
};

// Slot mapping for item categorization
export const SLOT_TEXT_MAP = {
    'head': 'head',
    'neck': 'neck',
    'shoulder': 'shoulder',
    'back': 'back',
    'chest': 'chest',
    'shirt': null,
    'tabard': null,
    'wrist': 'wrist',
    'hands': 'hands',
    'waist': 'waist',
    'legs': 'legs',
    'feet': 'feet',
    'finger': ['ring1', 'ring2'],
    'trinket': ['trinket1', 'trinket2'],
    'main hand': 'mainhand',
    'one-hand': ['mainhand', 'offhand'],
    'two-hand': 'mainhand',
    'off hand': 'offhand',
    'held in off-hand': 'offhand',
    'shield': 'offhand',
    'axe': ['mainhand', 'offhand'],
    'sword': ['mainhand', 'offhand'],
    'mace': ['mainhand', 'offhand'],
    'dagger': ['mainhand', 'offhand'],
    'fist weapon': ['mainhand', 'offhand'],
    'polearm': 'mainhand',
    'staff': 'mainhand',
    'bow': 'ranged',
    'crossbow': 'ranged',
    'gun': 'ranged',
    'thrown': 'ranged',
    'wand': 'ranged',
    'relic': 'ranged',
    'idol': 'ranged',
    'libram': 'ranged',
    'totem': 'ranged',
};

// Regex patterns for parsing stats from tooltips
export const STAT_PATTERNS = {
    // Primary stats - match anywhere in line (Equip: lines are merged before matching)
    sta: /([+-]?\d+)\s+Stamina/i,
    agi: /([+-]?\d+)\s+Agility/i,
    str: /([+-]?\d+)\s+Strength/i,
    int: /([+-]?\d+)\s+Intellect/i,
    spi: /([+-]?\d+)\s+Spirit/i,
    health: /^([+-]?\d+)\s+Health$/,
    armor: /^([+-]?\d+)\s+Armor/,
    blockValue: /^([+-]?\d+)\s+Block$/,
    def: /Equip:.*?Defense.*?\+(\d+)/,
    // Exclude "when fighting" lines — those are apVsUndead / apVsBeast / apVsDemon
    attackPower: /(?:Equip:.*?Attack Power by (\d+)(?! in Cat)|Equip:.*?\+(\d+)\s+Attack Power(?! in Cat)|^\+(\d+)\s+Attack Power(?! in Cat)(?!\s+when))/,
    healing: /Equip:.*?healing done.*?by up to (\d+)/,
    dmgAndHealing: /Equip:.*?damage and healing done.*?by up to (\d+)/,
    fireDamage: /Equip:.*?damage done by Fire spells and effects.*?by up to (\d+)/i,
    frostDamage: /Equip:.*?damage done by Frost spells and effects.*?by up to (\d+)/i,
    natureDamage: /Equip:.*?damage done by Nature spells and effects.*?by up to (\d+)/i,
    shadowDamage: /Equip:.*?damage done by Shadow spells and effects.*?by up to (\d+)/i,
    arcaneDamage: /Equip:.*?damage done by Arcane spells and effects.*?by up to (\d+)/i,
    // Melee crit (matches "critical strike" without "spells" - applies to melee crit)
    crit: /(?:Equip:.*?critical strike(?!\s+with spells)(?:\s+with attacks)? by |Improves your chance to get a critical strike(?!\s+with spells)(?:\s+with attacks)? by )(\d+)%/i,
    // Melee hit (matches "chance to hit" without "spells" - applies to melee hit)
    hit: /(?:Equip:.*?chance to hit(?!\s+with spells)(?:\s+with attacks)? by |Improves your chance to hit(?!\s+with spells)(?:\s+with attacks)? by )(\d+)%/i,
    haste: /Equip:.*?(?:(?:Increases|Improves)(?:(?!reduce|target'?s?\s).)*?(?:attack|casting)\s+speed.*?by\s+(\d+)%|haste.*?(\d+)%|(?:increases|adds)\s+(\d+)%\s+haste|(\d+)%\s+(?:melee\s+)?haste)/i,
    // Spell-specific crit (matches "critical strike with spells" - applies only to spellCrit)
    spellCrit: /(?:Equip:.*?critical strike with spells(?!\s+and attacks) by |Improves your chance to (?:hit and get a )?critical strike with spells(?!\s+and attacks) by )(\d+)%/i,
    // Spell-specific hit (matches "hit with spells" - applies only to spellHit)
    spellHit: /(?:Equip:.*?hit with spells(?!\s+and attacks) by |Improves your chance to hit(?!\s+and get a critical strike)(?:\s+with)? spells(?!\s+and attacks) by )(\d+)%/i,
    // Vanilla/Turtle: "Equip: Decreases the magical resistance(s) of your spell targets by X."
    // Also: "Equip: ... spell penetration ... N", green "+N Spell Penetration" lines
    spellPen: /(?:Equip:.*?(?:[Dd]ecreases the magical resistances? of your spell targets by (\d+)|spell penetration.*?(\d+))|^\+(\d+)\s+Spell Penetration)/i,
    dodge: /Equip:.*?chance to dodge an attack by (\d+)%/,
    parry: /Equip:.*?chance to parry an attack by (\d+)%/,
    blockChance: /(?:Equip:.*?chance to block.*?by (\d+)%|Increases your chance to block attacks with a shield by (\d+)%)/,
    blockValueEquip: /(?:Equip:.*?\+(\d+)\s+Block Value|Equip:.*?block value.*?by (\d+))/,
    druidAP: /\+(\d+)\s+Attack Power in Cat, Bear, Dire Bear, and Moonkin forms only/,
    weaponDamage: /^(\d+)\s*-\s*(\d+)\s+Damage/,
    weaponSpeed: /^Speed (\d+\.?\d*)/,
    rangedAttackPower: /(?:Equip:.*?ranged attack power.*?(\d+)|(?:\+(\d+)\s+Ranged Attack Power))/i,
    allStats: /(?:([+-]?\d+) to all stats|All Stats.*?([+-]?\d+))/i,
    fireResist: /([+-]?\d+)\s+Fire Resistance\.?/i,
    natureResist: /([+-]?\d+)\s+Nature Resistance\.?/i,
    frostResist: /([+-]?\d+)\s+Frost Resistance\.?/i,
    shadowResist: /([+-]?\d+)\s+Shadow Resistance\.?/i,
    arcaneResist: /([+-]?\d+)\s+Arcane Resistance\.?/i,
    allResist: /([+-]?\d+)\s+(?:to )?All Resistances\.?/i,
    vampirism: /(?:Equip:.*?(?:vampirism|leeching).*?(\d+)%|Equip:.*?(\d+)%\s+of\s+(?:the\s+)?damage\s+dealt(?:\s+is\s+returned)?\s+as\s+healing|(\d+)%\s+of\s+(?:the\s+)?damage\s+dealt(?:\s+is\s+returned)?\s+as\s+healing|^\+(\d+)%\s+(?:Vampirism|Leeching))/i,
    critDmgReduction: /(?:Equip:.*?reduces.*?critical strike damage.*?(\d+)%|Reduces.*?critical.*?damage.*?(\d+)%)/i,
    armorPen: /(?:Equip:.*?(?:armor penetration.*?(\d+)|attacks ignore (\d+) of.*?armor)|^\+(\d+)\s+Armor Penetration)/i,
    // Generic weapon skill (not weapon-type-specific) - very rare
    weaponSkill: /Equip:.*?Increased Weapon Skill \+(\d+)/i,
    // Fortune: "Use/Equip: Increases your chance to trigger effects from equipped items by X%"
    fortune: /(?:Use|Equip):\s*Increases? your chance to trigger effects from equipped items by (\d+)%/i
};

// Weapon skill by type pattern: "Increased {WeaponType} +X"
export const WEAPON_SKILL_BY_TYPE_PATTERN = /Increased (Two[- ]handed )?(?:Axes|Swords|Maces|Daggers|Fist Weapons|Polearms|Staves|Bows|Crossbows|Guns|Thrown) \+(\d+)/i;

// Spell Strike: "Adds X {school} damage to your weapon/melee attack(s)."
// Matches both "weapon attacks" and "melee attacks" (e.g. "Adds 3 Lightning damage to your melee attacks.").
// Each match is a separate damage source. Use parseSpellStrikeFromText or parseSpellStrikeSourcesFromItem.
export const SPELL_STRIKE_PATTERN = /Adds\s+(\d+)\s+(\w+)\s+damage\s+to\s+your\s+(?:weapon|melee)\s+attacks?/gi;

/**
 * Parse all "Adds X {school} damage to your weapon/melee attack(s)" matches from text.
 * @param {string} text - Tooltip or description text
 * @returns {Array<{value: number, school: string}>}
 */
export function parseSpellStrikeFromText(text) {
    if (!text || typeof text !== 'string') return [];
    const out = [];
    const re = new RegExp(SPELL_STRIKE_PATTERN.source, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
        const value = parseInt(m[1], 10);
        const school = (m[2] || '').charAt(0).toUpperCase() + (m[2] || '').slice(1).toLowerCase();
        if (!isNaN(value)) out.push({ value, school });
    }
    return out;
}

/**
 * Parse spell strike sources from an item's tooltip. Each "Adds X Y damage to your weapon/melee attack(s)" is one source.
 * @param {Object} item - Item with tooltip_lines_raw
 * @returns {Array<{value: number, school: string}>}
 */
export function parseSpellStrikeSourcesFromItem(item) {
    if (!item || !item.tooltip_lines_raw) return [];
    const lines = item.tooltip_lines_raw;
    const out = [];
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        if (line.match(/^\(\d+\)\s*Set:/i) || (i > 0 && lines[i - 1].match(/^\(\d+\)\s*Set:/i))) continue;
        if (line.trim().toLowerCase() === 'equip:' && i + 1 < lines.length && !lines[i + 1].match(/^\(\d+\)\s*Set:/i)) {
            line = `Equip: ${lines[i + 1]}`;
            i++;
        }
        out.push(...parseSpellStrikeFromText(line));
    }
    return out;
}

/**
 * Get all search terms for a stat (including aliases)
 * @param {string} searchTerm - The search term entered by user
 * @returns {Array<string>} Array of search terms including aliases
 */
export function getStatSearchTerms(searchTerm) {
    const terms = [searchTerm];
    if (STAT_ALIASES[searchTerm]) {
        terms.push(...STAT_ALIASES[searchTerm]);
    }
    return terms;
}

/**
 * Create a new stat object with default values
 * @returns {Object} Stat object with all stats set to 0
 */
export function createEmptyStats() {
    return { ...STAT_TEMPLATE };
}

/**
 * Flat attack-power bonus from gear that applies vs the current DPS target creature type.
 * @param {object} totals - Calculator output (includes apVs* from gear)
 * @param {string} [factionTag] - Normalized tag from boss JSON `faction` (e.g. undead, beast, demon)
 * @returns {number}
 */
export function getAttackPowerBonusVsCreatureType(totals, factionTag) {
    if (!totals || typeof totals !== 'object') return 0;
    const f = String(factionTag == null ? '' : factionTag).trim().toLowerCase().replace(/\s+/g, '_');
    const key = FACTION_TAG_TO_AP_VS_KEY[f];
    if (!key) return 0;
    return Number(totals[key]) || 0;
}

/**
 * Flat spell damage/healing bonus from gear vs the current DPS target creature type
 * (e.g. Mark of the Champion vs Undead/Demon).
 * @param {object} totals - Calculator output (includes dmgHealingVs* from gear)
 * @param {string} [factionTag] - Normalized tag from boss JSON `faction`
 * @returns {number}
 */
export function getSpellDamageHealingBonusVsCreatureType(totals, factionTag) {
    if (!totals || typeof totals !== 'object') return 0;
    const f = String(factionTag == null ? '' : factionTag).trim().toLowerCase().replace(/\s+/g, '_');
    const key = FACTION_TAG_TO_DMG_HEALING_VS_KEY[f];
    if (!key) return 0;
    return Number(totals[key]) || 0;
}

/**
 * Apply one AP value to one or more creature labels ("Undead and Demons" → two stats).
 * @returns {boolean} true if at least one label mapped
 */
function applyApVsBonusToCreatureLabels(rawLabel, value, stats) {
    if (Number.isNaN(value) || value <= 0) return false;
    const parts = String(rawLabel || '')
        .split(/\s+and\s+/i)
        .map(p => p.trim().replace(/\.$/, ''))
        .filter(Boolean);
    if (parts.length === 0) return false;
    let any = false;
    for (const part of parts) {
        const key = mapCreatureLabelToApVsStatKey(part);
        if (key) {
            stats[key] = (stats[key] || 0) + value;
            any = true;
        }
    }
    return any;
}

/**
 * Parse one tooltip line for "+AP when fighting …" / "Increases attack power when fighting …".
 * Supports multiple types in one clause (e.g. "Undead and Demons") and text after the clause
 * (e.g. "…Demons. It also allows…") — do not anchor to end of line.
 * @returns {boolean} true if line was consumed (caller should `continue`)
 */
function tryParseBonusApVsLine(line, stats) {
    // "Increases attack power when fighting Undead and Demons by 150" — greedy label so "by" binds to the number
    const inc = line.match(/Increases\s+attack\s+power\s+when\s+fighting\s+(.+?)\s+by\s+(\d+)/i);
    if (inc) {
        const value = parseInt(inc[2], 10);
        if (!applyApVsBonusToCreatureLabels(inc[1], value, stats)) return false;
        return true;
    }
    // "+150 Attack Power when fighting Undead and Demons. It also …" — stop at first sentence end
    let plus = line.match(/\+(\d+)\s+Attack\s+Power\s+when\s+fighting\s+(.+?)\./i);
    if (!plus) {
        plus = line.match(/\+(\d+)\s+Attack\s+Power\s+when\s+fighting\s+(.+?)$/i);
    }
    if (plus) {
        const value = parseInt(plus[1], 10);
        if (!applyApVsBonusToCreatureLabels(plus[2], value, stats)) return false;
        return true;
    }
    return false;
}

/**
 * Apply one spell dmg/heal vs type value to creature labels ("Undead and Demons" → two stats).
 * @returns {boolean} true if at least one label mapped
 */
function applyDmgHealingVsBonusToCreatureLabels(rawLabel, value, stats) {
    if (Number.isNaN(value) || value <= 0) return false;
    const parts = String(rawLabel || '')
        .split(/\s+and\s+/i)
        .map(p => p.trim().replace(/\.$/, ''))
        .filter(Boolean);
    if (parts.length === 0) return false;
    let any = false;
    for (const part of parts) {
        const key = mapCreatureLabelToDmgHealingVsStatKey(part);
        if (key) {
            stats[key] = (stats[key] || 0) + value;
            any = true;
        }
    }
    return any;
}

/**
 * Parse tooltip lines for spell damage vs creature type:
 * - Mark of the Champion: "Increases damage done to Undead and Demons by magical spells and effects by up to 85"
 * - "Increases spell damage and healing when fighting … by N"
 * - "+N Spell Damage and Healing when fighting …"
 * @returns {boolean} true if line was consumed
 */
function tryParseBonusDmgHealingVsLine(line, stats) {
    // Mark of the Champion / similar — text may continue after the number ("It also allows…")
    let moc = line.match(
        /Increases\s+damage\s+done\s+to\s+(.+?)\s+by\s+magical\s+spells\s+and\s+effects\s+by\s+up\s+to\s+(\d+)/i
    );
    if (moc) {
        const value = parseInt(moc[2], 10);
        if (!applyDmgHealingVsBonusToCreatureLabels(moc[1], value, stats)) return false;
        return true;
    }
    moc = line.match(
        /Increases\s+damage\s+done\s+to\s+(.+?)\s+by\s+magical\s+spells\s+and\s+effects\s+by\s+(\d+)/i
    );
    if (moc) {
        const value = parseInt(moc[2], 10);
        if (!applyDmgHealingVsBonusToCreatureLabels(moc[1], value, stats)) return false;
        return true;
    }
    const inc = line.match(/Increases\s+spell\s+damage\s+and\s+healing\s+when\s+fighting\s+(.+?)\s+by\s+(\d+)/i);
    if (inc) {
        const value = parseInt(inc[2], 10);
        if (!applyDmgHealingVsBonusToCreatureLabels(inc[1], value, stats)) return false;
        return true;
    }
    const inc2 = line.match(/Increases\s+damage\s+and\s+healing\s+when\s+fighting\s+(.+?)\s+by\s+(\d+)/i);
    if (inc2) {
        const value = parseInt(inc2[2], 10);
        if (!applyDmgHealingVsBonusToCreatureLabels(inc2[1], value, stats)) return false;
        return true;
    }
    let plus = line.match(/\+(\d+)\s+Spell\s+Damage\s+and\s+Healing\s+when\s+fighting\s+(.+?)\./i);
    if (!plus) {
        plus = line.match(/\+(\d+)\s+Spell\s+Damage\s+and\s+Healing\s+when\s+fighting\s+(.+?)$/i);
    }
    if (plus) {
        const value = parseInt(plus[1], 10);
        if (!applyDmgHealingVsBonusToCreatureLabels(plus[2], value, stats)) return false;
        return true;
    }
    return false;
}

/**
 * Parse stats from an item's tooltip lines
 * @param {Object} item - Item object with tooltip_lines_raw
 * @returns {Object} Parsed stats
 */
/**
 * Parse pure sheet stats from a set bonus description line.
 * Returns null when the bonus is conditional, proc-like, or otherwise not a flat sheet modifier.
 * @param {string} text - Set bonus description (line after "(N) Set:")
 * @returns {Object|null} Partial STAT_TEMPLATE values
 */
/** Smart percent for UI: 3%, 3.5%, not 3.00%. */
export function formatSmartPercent(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '0%';
    const rounded = Math.round(n * 100) / 100;
    if (Math.abs(rounded - Math.round(rounded)) < 1e-9) return `${Math.round(rounded)}%`;
    return `${parseFloat(rounded.toFixed(2))}%`;
}

/**
 * Parse sheet stats from enchant description when `enchant.stats` is empty or incomplete.
 * @param {string} text - Enchant description or name
 * @returns {Object} Partial stat keys (e.g. vampirism)
 */
export function parseStatsFromEnchantDescription(text) {
    if (!text || typeof text !== 'string') return {};
    const out = {};
    const add = (key, val) => { out[key] = (out[key] || 0) + val; };
    let m;
    if ((m = text.match(/(?:adds?|increase(?:s)?)\s+(\d+)%\s+vampirism/i))) add('vampirism', parseInt(m[1], 10));
    if ((m = text.match(/(?:adds?|increase(?:s)?)\s+(\d+)%\s+leeching/i))) add('vampirism', parseInt(m[1], 10));
    if ((m = text.match(/vampirism by (\d+)%/i))) add('vampirism', parseInt(m[1], 10));
    if ((m = text.match(/leeching by (\d+)%/i))) add('vampirism', parseInt(m[1], 10));
    return out;
}

/** Merge explicit enchant.stats with description-parsed stats (description fills gaps only). */
export function getEffectiveEnchantStats(enchant) {
    const base = enchant?.stats ? { ...enchant.stats } : {};
    const parsed = parseStatsFromEnchantDescription(enchant?.description || '');
    for (const [key, val] of Object.entries(parsed)) {
        if (!(key in base)) base[key] = val;
    }
    return base;
}

export function parseSetBonusSheetStats(text) {
    if (!text || typeof text !== 'string') return null;
    const line = text.trim();
    const lower = line.toLowerCase();

    const outEarly = {};
    const addEarly = (key, val) => { outEarly[key] = (outEarly[key] || 0) + val; };
    let mEarly;
    if ((mEarly = line.match(/^(\d+)%\s+of\s+(?:the\s+)?damage\s+dealt(?:\s+is\s+returned)?\s+as\s+healing\.?$/i))) {
        addEarly('vampirism', parseInt(mEarly[1], 10));
        return outEarly;
    }
    if ((mEarly = line.match(/^(?:Increases?|Adds?)\s+(?:vampirism|leeching)\s+by\s+(\d+)%\.?$/i))) {
        addEarly('vampirism', parseInt(mEarly[1], 10));
        return outEarly;
    }
    if ((mEarly = line.match(/^\+(\d+)%\s+(?:Vampirism|Leeching)\.?$/i))) {
        addEarly('vampirism', parseInt(mEarly[1], 10));
        return outEarly;
    }

    const skipPatterns = [
        /\bchance\b/, /\bwhen you\b/, /\bwhen fighting\b/, /\bfor \d+ sec/, /\bwhile\b/,
        /\bcritical\b/, /\brestores?\b/, /\bheals?\b/, /\bgrants?\b/, /\bpet\b/,
        /\bstacking\b/, /\beach time\b/, /\busing a\b/, /\bblocking\b/, /\bdodging\b/,
        /\bparrying\b/, /\breduces the (?:mana|threat|cast time|cooldown)\b/,
        /\bincreases the .* by \d+%/, /\byour .* spells\b/, /\band threat\b/,
        /\bdisplace\b/, /\bempowers\b/, /\breturned as healing\b/, /\badditionally\b/,
        /\bfor both you and\b/, /\ballows an additional\b/, /\bdeals \d+%\b/,
        /\blast \d+ sec longer\b/, /\baffects all\b/, /\bnow hits\b/,
    ];
    if (skipPatterns.some((re) => re.test(lower))) return null;

    const out = {};
    const add = (key, val) => { out[key] = (out[key] || 0) + val; };

    let m;
    if ((m = line.match(/^\+(\d+)\s+(Strength|Stamina|Agility|Intellect|Spirit)\.?$/i))) {
        const key = { strength: 'strength', stamina: 'stamina', agility: 'agility', intellect: 'intellect', spirit: 'spirit' }[m[2].toLowerCase()];
        add(key, parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+(Fire|Nature|Frost|Shadow|Arcane)\s+Resistance\.?$/i))) {
        add(`${m[2].toLowerCase()}Resist`, parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+All Resistances\.?$/i))) {
        add('allResist', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+Attack Power\.?$/i))) {
        add('attackPower', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+ranged Attack Power\.?$/i))) {
        add('rangedAttackPower', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+Armor\.?$/i))) {
        add('armor', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+to All Weapons$/i))) {
        const n = parseInt(m[1], 10);
        add('weaponDamageMin', n);
        add('weaponDamageMax', n);
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+Attack Power in Cat, Bear, Dire Bear, and Moonkin forms only\.?$/i))) {
        add('druidAP', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^\+(\d+)\s+Attack Power when fighting ([A-Za-z]+)\.?$/i))) {
        const creature = m[2].toLowerCase().replace(/s$/, '');
        const vsKey = FACTION_TAG_TO_AP_VS_KEY[creature] || FACTION_TAG_TO_AP_VS_KEY[`${creature}s`];
        if (vsKey) {
            add(vsKey, parseInt(m[1], 10));
            return out;
        }
        return null;
    }
    if ((m = line.match(/Increases damage and healing done by magical spells and effects by up to (\d+)\.?$/i))) {
        add('dmgAndHealing', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Increases healing done by spells and effects by up to (\d+)\.?$/i))) {
        add('healing', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Increases damage done by (Fire|Frost|Nature|Shadow|Arcane) spells and effects by up to (\d+)\.?$/i))) {
        add(`${m[1].toLowerCase()}Damage`, parseInt(m[2], 10));
        return out;
    }
    if ((m = line.match(/Improves your chance to hit(?: with attacks)? by (\d+)%\.?$/i))) {
        add('hit', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Improves your chance to get a critical strike(?: with attacks)? by (\d+)%\.?$/i))) {
        add('crit', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Improves your chance to hit with spells by (\d+)%\.?$/i))) {
        add('spellHit', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Improves your chance to get a critical strike with spells by (\d+)%\.?$/i))) {
        add('spellCrit', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Increases your chance to block attacks with a shield by (\d+)%\.?$/i))) {
        add('blockChance', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Increases the block value of your shield by (\d+)\.?$/i))) {
        add('blockValue', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^Increased Defense \+(\d+)\.?$/i))) {
        add('defense', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^Increases Attack Power by (\d+)\.?$/i))) {
        add('attackPower', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^Adds (\d+) (fire|frost|nature|shadow|arcane|holy) damage to your melee attacks\.?$/i))) {
        const school = m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase();
        const key = `${m[2].toLowerCase()}Damage`;
        if (school === 'Fire' || school === 'Frost' || school === 'Nature' || school === 'Shadow' || school === 'Arcane' || school === 'Holy') {
            add(key === 'holyDamage' ? 'holyDamage' : key, parseInt(m[1], 10));
            return out;
        }
        return null;
    }
    if ((m = line.match(/Decreases the magical resistances of your spell targets by (\d+)\.?$/i))) {
        add('spellPen', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/Increases your attack and casting speed by (\d+)%\.?$/i))) {
        add('haste', parseInt(m[1], 10));
        return out;
    }
    if ((m = line.match(/^Increased (Two[- ]handed )?(Axes|Swords|Maces|Daggers|Fist Weapons|Polearms|Staves|Bows|Crossbows|Guns|Thrown) \+(\d+)\.?$/i))) {
        const twoHanded = m[1] ? 'Two-handed ' : '';
        const weaponType = `${twoHanded}${m[2]}`;
        out.weaponSkillByType = { [weaponType]: parseInt(m[3], 10) };
        return out;
    }

    return null;
}

export function parseStatsFromTooltip(item) {
    const stats = {};
    if (!item.tooltip_lines_raw) return stats;

    const lines = item.tooltip_lines_raw;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        
        // Skip set name lines (e.g., "Stormcaller's Battlegear (1/8)" or just "(1/8)")
        // Also skip the line before if it's just a set name without count
        if (line.match(/\([\d]+\/[\d]+\)$/)) {
            continue;
        }
        
        // Skip set bonus lines - they should NOT be parsed as item stats
        // Set bonuses are handled separately by the setBonuses module
        // Format: "(X) Set:" followed by description line (e.g., "+15 Stamina")
        if (line.match(/^\(\d+\)\s*Set:/i)) {
            // Skip this line AND the next line (which contains the stat description)
            i++; // Increment to skip the next line
            continue;
        }
        
        // Skip lines that immediately follow a "(X) Set:" line (these are the set bonus stat descriptions)
        if (i > 0 && lines[i - 1].match(/^\(\d+\)\s*Set:/i)) {
            continue;
        }

        // Fix negative stats display (e.g., "+-25" should be "-25")
        line = line.replace(/\+-/g, '-');

        // Handle split "Equip:" lines
        if (line.trim().toLowerCase() === 'equip:' && i + 1 < lines.length) {
            // Check if next line is not a set bonus
            if (!lines[i + 1].match(/^\(\d+\)\s*Set:/i)) {
                line = `Equip: ${lines[i + 1]}`;
                i++;
            }
        }

        // Handle split "Use:" lines (e.g. Flask of Petrified Gold has "Use:" on its own line)
        if (line.trim().toLowerCase() === 'use:' && i + 1 < lines.length) {
            line = `Use: ${lines[i + 1]}`;
            i++;
        }

        // Bonus melee AP vs creature type (after Equip:/Use: merge; before generic +Attack Power patterns)
        if (tryParseBonusApVsLine(line, stats)) {
            continue;
        }

        // Spell damage/healing vs creature type (e.g. Mark of the Champion)
        if (tryParseBonusDmgHealingVsLine(line, stats)) {
            continue;
        }

        // Handle hybrid stat descriptions first (before individual patterns)
        // "Improves your chance to hit and get a critical strike with spells by X%"
        const spellHitAndCritMatch = line.match(/(?:Equip:.*?|Improves your chance to )hit and get a critical strike with spells(?: and attacks)? by (\d+)%/i);
        if (spellHitAndCritMatch) {
            const value = parseInt(spellHitAndCritMatch[1], 10);
            if (!isNaN(value)) {
                stats.spellHit = (stats.spellHit || 0) + value;
                stats.spellCrit = (stats.spellCrit || 0) + value;
            }
        }
        
        // "Improves your chance to get a critical strike with spells and attacks by X%"
        const spellAndAttackCritMatch = line.match(/(?:Equip:.*?|Improves your chance to get a )critical strike with spells and attacks by (\d+)%/i);
        if (spellAndAttackCritMatch) {
            const value = parseInt(spellAndAttackCritMatch[1], 10);
            if (!isNaN(value)) {
                stats.spellCrit = (stats.spellCrit || 0) + value;
                stats.crit = (stats.crit || 0) + value;
            }
        }
        
        // "Improves your chance to hit with spells and attacks by X%"
        const spellAndAttackHitMatch = line.match(/(?:Equip:.*?|Improves your chance to )hit with spells and attacks by (\d+)%/i);
        if (spellAndAttackHitMatch) {
            const value = parseInt(spellAndAttackHitMatch[1], 10);
            if (!isNaN(value)) {
                stats.spellHit = (stats.spellHit || 0) + value;
                stats.hit = (stats.hit || 0) + value;
            }
        }

        // Parse weapon skill by type (e.g., "Increased Axes +5", "Increased Two-handed Maces +6")
        const weaponSkillByTypeMatch = line.match(WEAPON_SKILL_BY_TYPE_PATTERN);
        if (weaponSkillByTypeMatch) {
            const fullMatch = weaponSkillByTypeMatch[0]; // e.g., "Increased Two-handed Axes +6"
            const twoHandedPrefix = weaponSkillByTypeMatch[1] || ''; // "Two-handed " or empty
            const weaponTypeRaw = fullMatch.match(/(?:Axes|Swords|Maces|Daggers|Fist Weapons|Polearms|Staves|Bows|Crossbows|Guns|Thrown)/i)[0];
            const skillValue = parseInt(weaponSkillByTypeMatch[2], 10);

            if (!isNaN(skillValue)) {
                // Build the weapon type key (e.g., "Axe", "Two-handed Axe")
                // Normalize plural to singular
                let weaponType = weaponTypeRaw.replace(/Axes/i, 'Axe')
                    .replace(/Swords/i, 'Sword')
                    .replace(/Maces/i, 'Mace')
                    .replace(/Daggers/i, 'Dagger')
                    .replace(/Fist Weapons/i, 'Fist Weapon')
                    .replace(/Polearms/i, 'Polearm')
                    .replace(/Staves/i, 'Staff')
                    .replace(/Bows/i, 'Bow')
                    .replace(/Crossbows/i, 'Crossbow')
                    .replace(/Guns/i, 'Gun');

                // Add "Two-handed " prefix if present
                if (twoHandedPrefix.trim()) {
                    weaponType = 'Two-handed ' + weaponType;
                }

                // Initialize weaponSkillByType object if needed
                if (!stats.weaponSkillByType) {
                    stats.weaponSkillByType = {};
                }

                // Add to the weapon type
                stats.weaponSkillByType[weaponType] = (stats.weaponSkillByType[weaponType] || 0) + skillValue;
            }
        }

        // Test each pattern (skip if already handled by hybrid patterns above)
        for (const key in STAT_PATTERNS) {
            // Skip if this stat was already set by a hybrid pattern
            if (key === 'spellHit' && stats.spellHit !== undefined && (spellHitAndCritMatch || spellAndAttackHitMatch)) continue;
            if (key === 'spellCrit' && stats.spellCrit !== undefined && (spellHitAndCritMatch || spellAndAttackCritMatch)) continue;
            if (key === 'crit' && stats.crit !== undefined && spellAndAttackCritMatch) continue;
            if (key === 'hit' && stats.hit !== undefined && spellAndAttackHitMatch) continue;

            // Skip haste from conditional on-kill / slay proc lines (e.g. Elementium Reaper — not modeled as passive haste)
            if (key === 'haste' &&
                /\bkill(?:ing|ed|s)?\b|\bslay\b|when\s+you\s+kill|enemy\s+dies|after\s+killing|decapitat/i.test(line)) {
                continue;
            }

            const match = line.match(STAT_PATTERNS[key]);
            if (match) {
                // Handle weapon damage specially (has two capture groups: min and max)
                if (key === 'weaponDamage') {
                    const minDmg = parseInt(match[1], 10);
                    const maxDmg = parseInt(match[2], 10);
                    if (!isNaN(minDmg) && !isNaN(maxDmg)) {
                        stats.weaponDamageMin = minDmg;
                        stats.weaponDamageMax = maxDmg;
                    }
                } else {
                    // Use parseFloat for weapon speed to preserve decimals
                    const value = (key === 'weaponSpeed')
                        ? parseFloat(match[1] || match[2] || match[3] || match[4])
                        : parseInt(match[1] || match[2] || match[3] || match[4], 10);

                    if (!isNaN(value)) {
                        const statKey = key === 'blockValueEquip' ? 'blockValue' : key;
                        stats[statKey] = (stats[statKey] || 0) + value;
                    }
                }
            }
        }

        // Detect slot from tooltip
        if (!stats.Slot) {
            const potentialSlot = line.trim();
            if (Object.keys(SLOT_TEXT_MAP).includes(potentialSlot.toLowerCase())) {
                stats.Slot = potentialSlot;
            }
        }
    }

    return stats;
}

// Enchant filtering helpers
export function getItemType(item) {
    if (!item || !item.tooltip_lines_raw) return null;

    // Check the FIRST few lines which contain the item slot/type info
    // This avoids false positives from stat descriptions or set bonuses
    const relevantLines = item.tooltip_lines_raw.slice(0, 5).map(line => line.toLowerCase());
    const relevantText = relevantLines.join('\n');

    console.log('getItemType for', item.name, ':', { relevantLines, relevantText });

    // Check in priority order: shield first, then ranged, then 2H, then 1H
    // For ranged: class is "Ranged" (like "Two-Hand" for melee), type is Bow/Crossbow/Gun
    if (relevantText.includes('shield')) {
        console.log('-> Detected as shield');
        return 'shield';
    }
    if (relevantText.includes('ranged') || relevantText.includes('bow') || relevantText.includes('crossbow') || relevantText.includes('gun')) {
        console.log('-> Detected as ranged');
        return 'ranged';
    }
    if (relevantText.includes('two-hand')) {
        console.log('-> Detected as 2h');
        return '2h';
    }
    if (relevantText.includes('one-hand') || relevantText.includes('main hand')) {
        console.log('-> Detected as 1h');
        return '1h';
    }
    // Check for generic "Off Hand" last (weapons that can go in offhand but aren't shields)
    if (relevantText.includes('off hand')) {
        console.log('-> Detected as 1h (off hand weapon)');
        return '1h';
    }

    console.log('-> No type detected, relevantText:', relevantText);
    return null;
}

export function filterEnchantsByItemType(enchants, itemType, slotId = null, item = null) {
    if (!enchants) return enchants;

    // If no item equipped but we have a slot, filter based on slot capabilities
    if (!itemType && slotId) {
        if (slotId === 'offhand') {
            // Offhand can have shields or 1H weapons, but NOT 2H weapons
            return enchants.filter(enchant => {
                if (enchant.name === 'None') return true;
                const name = enchant.name.toLowerCase();
                // Exclude 2H weapon enchants from offhand
                if (name.includes('enchant 2h weapon')) return false;
                return true;
            });
        } else if (slotId === 'mainhand') {
            // Mainhand can have 1H or 2H weapons
            return enchants.filter(enchant => {
                if (enchant.name === 'None') return true;
                const name = enchant.name.toLowerCase();
                // Exclude shield enchants from mainhand
                if (name.includes('enchant shield')) return false;
                return true;
            });
        }
    }

    // If no item type at all, return all enchants
    if (!itemType) return enchants;

    return enchants.filter(enchant => {
        // Always include "None" option
        if (enchant.name === 'None') return true;

        const name = enchant.name.toLowerCase();

        // Iron Counterweight special handling - only for 2H swords, maces, axes, and polearms (not staves)
        if (name.includes('iron counterweight')) {
            if (itemType !== '2h') return false;

            // Check weapon subtype if available
            if (item && item.weaponType) {
                const weaponType = item.weaponType;
                // Exclude Staff explicitly
                if (weaponType === 'Staff') return false;
                const allowedTypes = ['Two-Hand Sword', 'Two-Hand Mace', 'Two-Hand Axe', 'Polearm'];
                return allowedTypes.includes(weaponType);
            }

            // If no weaponType info, check tooltip for staff (exclude staves)
            if (item && item.tooltip_lines_raw) {
                const tooltipText = item.tooltip_lines_raw.join(' ').toLowerCase();
                if (tooltipText.includes('staff')) return false;
            }

            return true; // Allow for other 2H weapons if we can't determine type
        }

        if (itemType === 'shield') {
            // Only show shield enchants for shields
            return name.includes('enchant shield');
        } else if (itemType === '2h') {
            // 2H weapons can use both "Enchant 2H Weapon" and regular "Enchant Weapon"
            return (name.includes('enchant 2h weapon') || name.includes('enchant weapon'))
                   && !name.includes('enchant shield');
        } else if (itemType === '1h') {
            // 1H weapons can only use regular "Enchant Weapon" (not 2H-specific, not shield)
            // Check for 2H exclusion FIRST since "Enchant 2H Weapon" contains "Enchant Weapon"
            if (name.includes('enchant 2h weapon')) return false;
            if (name.includes('enchant shield')) return false;
            return name.includes('enchant weapon');
        } else if (itemType === 'ranged') {
            // Ranged (bow/crossbow/gun): enchants for this slot are scopes only — allow all
            return true;
        }

        return true;
    });
}

const ENCHANT_CLASS_IDS = ['warrior', 'paladin', 'shaman', 'hunter', 'rogue', 'priest', 'mage', 'warlock', 'druid'];

/** ZG head/leg class enchants (Turtle/Octo) and other known class-only enchants (normalized base name). */
const ENCHANT_BASE_CLASS_MAP = {
    'animist\'s caress': ['druid'],
    'falcon\'s call': ['hunter'],
    'presence of might': ['warrior'],
    'presence of sight': ['mage'],
    'prophetic aura': ['priest'],
    'syncretist\'s sigil': ['paladin'],
    'death\'s embrace': ['rogue'],
    'vodouisant\'s vigilant embrace': ['shaman'],
    'hoodoo hex': ['warlock'],
    'gift of ferocity': ['druid'],
};

/** effect_id fallback for ZG head/leg enchants and Gift of Ferocity (covers duplicate slot entries). */
const ENCHANT_EFFECT_CLASS_MAP = {
    2583: ['warrior'],   // Presence of Might
    2584: ['paladin'],   // Syncretist's Sigil
    2585: ['rogue'],     // Death's Embrace
    2586: ['hunter'],    // Falcon's Call
    2587: ['shaman'],    // Vodouisant's Vigilant Embrace
    2588: ['mage'],      // Presence of Sight
    2589: ['warlock'],   // Hoodoo Hex
    2590: ['priest'],    // Prophetic Aura
    2591: ['druid'],     // Animist's Caress
    3004: ['druid'],     // Gift of Ferocity (head)
};

const ENCHANT_CLASS_SUFFIX_RE = /\((Warrior|Paladin|Shaman|Hunter|Rogue|Priest|Mage|Warlock|Druid)\)\s*$/i;
const ENCHANT_CLASSES_LINE_RE = /Classes:\s*([^\n<]+)/i;
const ENCHANT_ONLY_USABLE_BY_RE = /only usable by\s+(?:a\s+)?(warrior|paladin|shaman|hunter|rogue|priest|mage|warlock|druid)s?/i;
const ENCHANT_REQUIRES_CLASS_RE = /requires\s+(?:a\s+)?(warrior|paladin|shaman|hunter|rogue|priest|mage|warlock|druid)/i;

function normalizeEnchantText(value) {
    return String(value || '')
        .replace(/[\u2018\u2019\u201B`]/g, '\'')
        .trim()
        .toLowerCase();
}

function parseEnchantClassesList(raw) {
    if (!raw) return null;
    const allowed = String(raw)
        .split(',')
        .map((c) => normalizeEnchantText(c))
        .filter((c) => ENCHANT_CLASS_IDS.includes(c));
    return allowed.length ? allowed : null;
}

function parseClassesFromText(text) {
    if (!text) return null;
    const classesMatch = text.match(ENCHANT_CLASSES_LINE_RE);
    if (classesMatch) return parseEnchantClassesList(classesMatch[1]);
    const onlyUsable = text.match(ENCHANT_ONLY_USABLE_BY_RE);
    if (onlyUsable) return [normalizeEnchantText(onlyUsable[1])];
    const requiresClass = text.match(ENCHANT_REQUIRES_CLASS_RE);
    if (requiresClass) return [normalizeEnchantText(requiresClass[1])];
    return null;
}

/**
 * Strip trailing parenthetical summary from enchant display name (e.g. "+7 Agi").
 * @param {string} name
 * @returns {string}
 */
export function getEnchantBaseName(name) {
    if (!name) return '';
    return name.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Classes allowed to use this enchant, or null when unrestricted.
 * Checks `classes`, tooltip "Classes:" lines, description restrictions, "(Druid)" suffix,
 * effect_id map, and known base-name map.
 * @param {Object} enchant
 * @returns {string[]|null}
 */
export function getEnchantRestrictedClasses(enchant) {
    if (!enchant) return null;

    if (Array.isArray(enchant.classes) && enchant.classes.length > 0) {
        return parseEnchantClassesList(enchant.classes.join(','));
    }

    if (Array.isArray(enchant.tooltip_lines_raw)) {
        for (const line of enchant.tooltip_lines_raw) {
            const fromLine = parseClassesFromText(line);
            if (fromLine) return fromLine;
        }
    }

    const fromDescription = parseClassesFromText(enchant.description);
    if (fromDescription) return fromDescription;

    const suffixMatch = enchant.name?.match(ENCHANT_CLASS_SUFFIX_RE);
    if (suffixMatch) return [suffixMatch[1].toLowerCase()];

    const effectId = Number(enchant.effect_id);
    if (Number.isFinite(effectId) && ENCHANT_EFFECT_CLASS_MAP[effectId]) {
        return ENCHANT_EFFECT_CLASS_MAP[effectId];
    }

    const baseKey = normalizeEnchantText(getEnchantBaseName(enchant.name));
    if (ENCHANT_BASE_CLASS_MAP[baseKey]) return ENCHANT_BASE_CLASS_MAP[baseKey];

    return null;
}

/**
 * Hide class-restricted enchants when the current class is not allowed.
 * @param {Array} enchants
 * @param {string} playerClass
 * @returns {Array}
 */
export function filterEnchantsByClass(enchants, playerClass) {
    if (!enchants || !playerClass) return enchants;
    const cls = String(playerClass).toLowerCase();
    return enchants.filter((enchant) => {
        if (enchant.name === 'None') return true;
        const restricted = getEnchantRestrictedClasses(enchant);
        if (!restricted || restricted.length === 0) return true;
        return restricted.includes(cls);
    });
}
