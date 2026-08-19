// modules/tooltips.js - Unified tooltip generation
// Creates HTML tooltips for items and enchants

import { isItemProcModeled } from '../gear/procs.js';
import { setDatabase } from '../gear/setDatabase.js';
import { parseStatsFromTooltip } from '../character/stats.js';
import { getCurrentlyEquippedItem, getMeleeWeaponType } from '../gear/gear.js';
import { formatEnchantStatsHTML } from '../gear/enchantStatLabels.js';
import { calculateEffectiveHealth } from './calculator.js';
import { getSelectedRaceBonuses } from '../character/races.js';
import { getTalentBonuses } from '../talents_new.js';
import { getSetBonuses } from '../gear/setBonuses.js';
import { getActiveBuffs } from '../character/buffs.js';
import { ShamanStats } from '../character/shamanTalents.js';
import { calculateSpellDPS } from '../shaman/damageCalc.js';
import { shamanSpells } from '../shaman/spells.js';

function isGearPlannerAppMode() {
    return document.body?.dataset?.appMode === 'gearPlanner';
}

/** DPS/tank weights for item scores: GP-generated when Gear Planner is active. */
export function getActiveItemScoreWeights() {
    if (isGearPlannerAppMode()) {
        const dps = typeof window.getGearPlannerDpsStatWeights === 'function'
            ? window.getGearPlannerDpsStatWeights()
            : null;
        const tank = typeof window.getGearPlannerTankStatWeights === 'function'
            ? window.getGearPlannerTankStatWeights()
            : null;
        return { dps, tank };
    }
    const dps = typeof window.getStoredStatWeights === 'function' ? window.getStoredStatWeights() : null;
    const tank = typeof window.getStoredTankStatWeights === 'function' ? window.getStoredTankStatWeights() : null;
    return { dps, tank };
}

// Mapping from parseStatsFromTooltip keys to tank stat weight keys
// Each entry is: { weight: <tankStatWeightsKey>, component: 'ehp' | 'mit' }
const TOOLTIP_TO_TANK_WEIGHT = {
    sta:             { weight: 'stamina1EHP',              component: 'ehp' },
    armor:           { weight: 'armor1EHP',                component: 'mit' },
    def:             { weight: 'defense1EHP',              component: 'mit' },
    blockValue:      { weight: 'blockValue1EHP',           component: 'mit' },
    blockValueEquip: { weight: 'blockValue1EHP',           component: 'mit' },
    blockChance:     { weight: 'blockChance1PercentEHP',   component: 'mit' },
    dodge:           { weight: 'avoidance1PercentEHP',     component: 'mit' },
    parry:           { weight: 'avoidance1PercentEHP',     component: 'mit' },
};

/**
 * Calculate an item's tank score (EHP and mitigation components) from its stats
 * and the current tank stat weights.
 * @param {Object} item - Item with tooltip_lines_raw
 * @param {Object|null} tankWeights - Object from getStoredTankStatWeights()
 * @returns {{ ehp: number, mitScore: number, tankScore: number }|null}
 */
export function calculateItemTankScore(item, tankWeights) {
    if (!tankWeights || !item) return null;

    const stats = parseStatsFromTooltip(item);
    let ehp = 0;
    let mitScore = 0;

    for (const [statKey, { weight, component }] of Object.entries(TOOLTIP_TO_TANK_WEIGHT)) {
        const value = stats[statKey];
        if (!value) continue;
        const weightValue = tankWeights[weight];
        if (!weightValue) continue;
        const contribution = value * weightValue;
        if (component === 'ehp') ehp += contribution;
        else mitScore += contribution;
    }

    if (ehp === 0 && mitScore === 0) return null;

    return {
        ehp: Math.round(ehp),
        mitScore: Math.round(mitScore),
        tankScore: Math.round(ehp + mitScore),
    };
}

/**
 * Compact tank score label for GP item cards and similar UI.
 * @param {{ ehp: number, mitScore: number, tankScore: number }} tank
 * @returns {string}
 */
export function formatItemTankScoreBadge(tank) {
    if (!tank) return '';
    return `Tank score: ${tank.tankScore.toLocaleString()} (EHP ${tank.ehp.toLocaleString()} · MIT ${tank.mitScore.toLocaleString()})`;
}

// Mapping from parseStatsFromTooltip keys to stat weight keys
const TOOLTIP_TO_WEIGHT_KEY = {
    attackPower: 'ap',
    str: 'str',
    agi: 'agi',
    int: 'int',
    dmgAndHealing: 'sp',
    fireDamage: 'fireSp',
    natureDamage: 'natureSp',
    crit: 'physCrit',
    spellCrit: 'spellCrit',
    hit: 'physHit',
    spellHit: 'spellHit',
    haste: 'haste',
    armorPen: 'arp'
};

// Known weapon type lines in tooltip_lines_raw
const WEAPON_TYPES = new Set([
    'axe', 'sword', 'mace', 'dagger', 'fist weapon',
    'polearm', 'staff', 'bow', 'crossbow', 'gun', 'thrown'
]);

const WEAPON_SKILL_SINGULAR = {
    axe: 'Axe', axes: 'Axe',
    sword: 'Sword', swords: 'Sword',
    mace: 'Mace', maces: 'Mace',
    dagger: 'Dagger', daggers: 'Dagger',
    'fist weapon': 'Fist Weapon', 'fist weapons': 'Fist Weapon',
    polearm: 'Polearm', polearms: 'Polearm',
    staff: 'Staff', staves: 'Staff',
    bow: 'Bow', bows: 'Bow',
    crossbow: 'Crossbow', crossbows: 'Crossbow',
    gun: 'Gun', guns: 'Gun',
    thrown: 'Thrown',
    weapon: 'Weapon', weapons: 'Weapon',
};

/**
 * Canonical weapon skill / subtype string for strict matching (1H and 2H stay separate).
 * Examples: "Two-handed Maces" → "Two-handed Mace", "Mace" → "Mace".
 */
function canonicalWeaponSkillType(type) {
    if (!type) return null;
    let s = String(type).trim();
    let twoHand = false;
    const twoHandPrefix = /^two[- ]hand(?:ed)?\s+/i;
    if (twoHandPrefix.test(s)) {
        twoHand = true;
        s = s.replace(twoHandPrefix, '');
    }
    const lower = s.toLowerCase();
    const base = WEAPON_SKILL_SINGULAR[lower]
        || (s ? s.charAt(0).toUpperCase() + s.slice(1) : null);
    if (!base) return null;
    return twoHand ? `Two-handed ${base}` : base;
}

function itemTooltipIsTwoHanded(item) {
    if (!item?.tooltip_lines_raw) return false;
    return item.tooltip_lines_raw.some((line) => {
        const t = (line || '').trim().toLowerCase();
        return t === 'two-hand' || t === 'two-handed' || t.startsWith('two-hand');
    });
}

/**
 * Get the weapon subtype (e.g. "Axe", "Two-handed Mace") from a weapon item's tooltip.
 * Returns null for non-weapons.
 */
function getWeaponSubtype(weaponItem) {
    if (!weaponItem?.tooltip_lines_raw) return null;
    let isTwoHand = false;
    for (const line of weaponItem.tooltip_lines_raw) {
        const trimmed = line.trim();
        if (/^two[- ]hand(?:ed)?$/i.test(trimmed)) isTwoHand = true;
        if (WEAPON_TYPES.has(trimmed.toLowerCase())) {
            return canonicalWeaponSkillType(isTwoHand ? `Two-handed ${trimmed}` : trimmed);
        }
    }
    const meleeType = getMeleeWeaponType(weaponItem);
    if (meleeType) {
        return canonicalWeaponSkillType(
            itemTooltipIsTwoHanded(weaponItem) ? `Two-handed ${meleeType}` : meleeType
        );
    }
    return null;
}

function resolveEquippedGearSnapshot(equippedGear) {
    if (equippedGear) return equippedGear;
    if (document.body?.dataset?.appMode === 'gearPlanner'
        && typeof window.getGearPlannerWeaponSkillEquippedGear === 'function') {
        const gpGear = window.getGearPlannerWeaponSkillEquippedGear();
        if (gpGear) return gpGear;
    }
    if (getEquippedGearFunc) return getEquippedGearFunc();
    return null;
}

const WEAPON_GEAR_SLOTS = new Set(['mainhand', 'offhand', 'ranged']);
const WEAPON_SCALING_SPELL_KEYS = ['autoAttack', 'stormstrike', 'lightningStrike', 'windfuryAttack'];
const WEAPON_STAT_KEYS = new Set(['weaponDamageMin', 'weaponDamageMax', 'weaponSpeed']);

function resolveClassId() {
    if (typeof window !== 'undefined') {
        if (window.__ichacalcGpSimClass) return window.__ichacalcGpSimClass;
        const sidebar = document.getElementById('class-race-sidebar');
        if (sidebar?.dataset?.selectedClass) return sidebar.dataset.selectedClass;
    }
    return 'warrior';
}

function resolveRaceId() {
    if (typeof window !== 'undefined') {
        if (window.__ichacalcGpSimRace) return window.__ichacalcGpSimRace;
        const sidebar = document.getElementById('class-race-sidebar');
        if (sidebar?.dataset?.selectedRace) return sidebar.dataset.selectedRace;
    }
    return 'human';
}

function isScorableWeaponItem(item) {
    if (!item?.tooltip_lines_raw) return false;
    const stats = parseStatsFromTooltip(item);
    return !!(stats.weaponDamageMin && stats.weaponDamageMax && stats.weaponSpeed);
}

function aggregateGearStatsFromSnapshot(equippedGear) {
    const total = { weaponSkillByType: {} };
    for (const [slot, item] of Object.entries(equippedGear || {})) {
        if (!item?.tooltip_lines_raw) continue;
        const parsed = parseStatsFromTooltip(item);
        for (const [key, value] of Object.entries(parsed)) {
            if (WEAPON_GEAR_SLOTS.has(slot) && WEAPON_STAT_KEYS.has(key)) continue;
            if (key === 'weaponSkillByType' && value && typeof value === 'object') {
                for (const [skillType, skillValue] of Object.entries(value)) {
                    total.weaponSkillByType[skillType] = (total.weaponSkillByType[skillType] || 0) + skillValue;
                }
            } else if (typeof value === 'number') {
                total[key] = (total[key] || 0) + value;
            }
        }
    }
    return total;
}

function buildCalculatorTotalsFromEquippedSnapshot(equippedGear) {
    const gear = equippedGear || {};
    const classId = resolveClassId();
    const raceId = resolveRaceId();
    const mh = gear.mainhand;
    const oh = gear.offhand;
    const mhType = getMeleeWeaponType(mh);
    const ohType = getMeleeWeaponType(oh);
    const talentBonuses = getTalentBonuses(classId);
    const characterData = {
        selectedClass: classId,
        selectedRace: raceId,
        attackerLevel: 63,
        gearStats: aggregateGearStatsFromSnapshot(gear),
        talentBonuses,
        racialBonuses: getSelectedRaceBonuses(raceId),
        activeBuffs: [],
        enchantStats: {},
        offhandArmor: oh?.stats?.armor || 0,
        setBonuses: getSetBonuses(gear, false),
        isDualWielding: !!(oh && ohType),
        mainhandWeaponType: mhType,
        offhandWeaponType: ohType,
        mainhandIsTwoHanded: itemTooltipIsTwoHanded(mh),
        offhandIsTwoHanded: itemTooltipIsTwoHanded(oh),
        rangedWeaponType: null,
    };
    return calculateEffectiveHealth(characterData);
}

function applyMinimalTalentModifiers(stats, talentBonuses) {
    if (!talentBonuses || !stats?.setTalent) return;
    if (talentBonuses.elemental_fury_crit_damage !== undefined) {
        const ranks = Math.min(Math.round(talentBonuses.elemental_fury_crit_damage / 50), 2);
        stats.setTalent('elementalFury', ranks);
    }
    if (talentBonuses.weaponDamageMultiplier !== undefined) {
        const ranks = Math.min(Math.round(talentBonuses.weaponDamageMultiplier * 100 / 2), 5);
        stats.setTalent('elementsGrace', ranks);
    }
}

function applyWeaponDamageToShamanStats(stats, baseMin, baseMax, baseSpeed, setWeaponMin = 0, setWeaponMax = 0) {
    if (!stats || !baseSpeed) return;

    const ap = stats.attackPower || 0;
    const mult = 1 + (stats.talentBonuses?.weaponDamageMultiplier || 0);
    const weaponMin = baseMin + setWeaponMin;
    const weaponMax = baseMax + setWeaponMax;

    stats.baseWeaponDamageMin = weaponMin;
    stats.baseWeaponDamageMax = weaponMax;
    stats.baseWeaponSpeed = baseSpeed;
    const apContrib = (ap / 14) * baseSpeed;
    stats.weaponDamage = {
        min: Math.floor((weaponMin + apContrib) * mult),
        max: Math.ceil((weaponMax + apContrib) * mult),
    };
    const haste = stats.meleeHaste || 0;
    stats.weaponSpeed = baseSpeed / (1 + haste / 100);
}

function buildShamanBaseStats(equippedGear) {
    const gear = equippedGear || {};
    const classId = resolveClassId();
    if (classId !== 'shaman') return null;

    const totals = isGearPlannerAppMode()
        ? buildCalculatorTotalsFromEquippedSnapshot(gear)
        : (typeof window.getFreshCalculatorTotals === 'function'
            ? window.getFreshCalculatorTotals()
            : (window.currentCalculatorTotals || buildCalculatorTotalsFromEquippedSnapshot(gear)));

    const talentBonuses = getTalentBonuses(classId);
    const setBonuses = getSetBonuses(gear, false);
    const stats = new ShamanStats();
    stats.talentBonuses = talentBonuses;
    stats.setBonuses = setBonuses;
    stats.attackPower = totals.attackPower || 0;
    stats.spellPower = totals.dmgAndHealing || 0;
    stats.natureDamage = totals.natureDamage || 0;
    stats.fireDamage = totals.fireDamage || 0;
    stats.frostDamage = totals.frostDamage || 0;
    stats.meleeCrit = (totals.crit || 0) / 100;
    stats.spellCrit = (totals.spellCrit || 0) / 100;
    stats.meleeHit = (totals.hit || 0) / 100;
    stats.spellHit = (totals.spellHit || 0) / 100;
    stats.weaponSkill = totals.weaponSkill || 300;
    stats.glancingDamagePercent = totals.glancingDamage || 65;
    stats.enemyDodgeChancePercent = totals.enemyDodgeChance || 6.5;
    stats.meleeHaste = totals.meleeHastePassive ?? totals.meleeHaste ?? totals.haste ?? 0;
    stats.armorPen = totals.armorPen || 0;
    stats.spellPen = totals.spellPen || 0;
    stats.bossDodgeChancePercent = stats.enemyDodgeChancePercent;

    applyMinimalTalentModifiers(stats, talentBonuses);

    const activeBuffs = getActiveBuffs(talentBonuses);
    const hasWindfury = activeBuffs.some((buff) => buff.name && buff.name.toLowerCase().includes('windfury'));
    if (hasWindfury) stats.toggleModifier('windfuryActive', true);

    return stats;
}

function buildShamanStatsWithWeaponDamage(equippedGear, baseMin, baseMax, baseSpeed) {
    const gear = equippedGear || {};
    const stats = buildShamanBaseStats(gear);
    if (!stats) return null;

    const setBonuses = getSetBonuses(gear, false);
    const setWeaponMin = setBonuses?.sheetStats?.weaponDamageMin || 0;
    const setWeaponMax = setBonuses?.sheetStats?.weaponDamageMax || 0;
    applyWeaponDamageToShamanStats(stats, baseMin, baseMax, baseSpeed, setWeaponMin, setWeaponMax);
    return stats;
}

function sumWeaponScalingAbilityDps(stats) {
    if (!stats) return 0;
    let total = 0;
    for (const key of WEAPON_SCALING_SPELL_KEYS) {
        const spell = shamanSpells[key];
        if (!spell?.weaponDamagePercent) continue;
        if (key === 'windfuryAttack' && !stats.activeModifiers?.windfuryActive) continue;
        try {
            const result = calculateSpellDPS(spell, stats);
            total += result?.dps || 0;
        } catch (_) {
            // ignore individual spell failures
        }
    }
    return total;
}

/**
 * Character-sheet white-hit DPS (app.js displayMainResults): ((min+max)/2) / hastedSpeed
 * with min/max = (weapon base + AP/14×speed) × talent weapon-damage multiplier.
 */
function computeSheetWeaponDpsFromValues(weaponMin, weaponMax, weaponSpeed, context) {
    if (!weaponSpeed) return 0;

    const {
        ap = 0,
        haste = 0,
        weaponDamageMultiplier = 1,
        damageModifier = 1,
        offhandMultiplier = 1,
        setWeaponMin = 0,
        setWeaponMax = 0,
    } = context;

    const baseSpeed = weaponSpeed;
    const hastedSpeed = baseSpeed / (1 + haste / 100);
    const minDamage = Math.floor(
        (weaponMin + setWeaponMin + (ap / 14) * baseSpeed)
        * weaponDamageMultiplier * damageModifier * offhandMultiplier
    );
    const maxDamage = Math.ceil(
        (weaponMax + setWeaponMax + (ap / 14) * baseSpeed)
        * weaponDamageMultiplier * damageModifier * offhandMultiplier
    );
    return ((minDamage + maxDamage) / 2) / hastedSpeed;
}

function computeSheetWeaponDps(weaponItem, context) {
    if (!weaponItem?.tooltip_lines_raw) return 0;
    const weaponStats = parseStatsFromTooltip(weaponItem);
    if (weaponStats.weaponDamageMin == null || weaponStats.weaponDamageMax == null || !weaponStats.weaponSpeed) return 0;
    return computeSheetWeaponDpsFromValues(
        weaponStats.weaponDamageMin,
        weaponStats.weaponDamageMax,
        weaponStats.weaponSpeed,
        context
    );
}

function buildSheetWeaponContext(equippedGear) {
    const gear = equippedGear || {};
    const classId = resolveClassId();
    const talentBonuses = getTalentBonuses(classId);
    const totals = isGearPlannerAppMode()
        ? buildCalculatorTotalsFromEquippedSnapshot(gear)
        : (typeof window.getFreshCalculatorTotals === 'function'
            ? window.getFreshCalculatorTotals()
            : (window.currentCalculatorTotals || buildCalculatorTotalsFromEquippedSnapshot(gear)));
    const setBonuses = getSetBonuses(gear, false);
    return {
        ap: totals.attackPower || 0,
        haste: totals.meleeHastePassive ?? totals.meleeHaste ?? totals.haste ?? 0,
        weaponDamageMultiplier: 1 + (talentBonuses.weaponDamageMultiplier || 0),
        damageModifier: 1,
        offhandMultiplier: 0.5 * (1 + (talentBonuses.offhand_damage_percent || 0)),
        setWeaponMin: setBonuses?.sheetStats?.weaponDamageMin || 0,
        setWeaponMax: setBonuses?.sheetStats?.weaponDamageMax || 0,
    };
}

/** Physical white-hit output from weapon damage range vs 0–0 at the same speed (not swap vs equipped). */
function computeSheetWeaponDpsAdd(candidateItem, equippedGear, targetSlot = 'mainhand') {
    const gear = resolveEquippedGearSnapshot(equippedGear) || {};
    const slot = targetSlot || inferWeaponTargetSlot(candidateItem);
    const weaponStats = parseStatsFromTooltip(candidateItem);
    if (weaponStats.weaponDamageMin == null || weaponStats.weaponDamageMax == null || !weaponStats.weaponSpeed) return 0;

    const ctx = buildSheetWeaponContext(gear);
    const offhandMult = slot === 'offhand' ? ctx.offhandMultiplier : 1;
    const fullCtx = { ...ctx, offhandMultiplier: offhandMult };
    const candidateDps = computeSheetWeaponDpsFromValues(
        weaponStats.weaponDamageMin,
        weaponStats.weaponDamageMax,
        weaponStats.weaponSpeed,
        fullCtx
    );
    const zeroDps = computeSheetWeaponDpsFromValues(0, 0, weaponStats.weaponSpeed, {
        ...fullCtx,
        setWeaponMin: 0,
        setWeaponMax: 0,
    });
    return candidateDps - zeroDps;
}

function inferWeaponTargetSlot(item) {
    if (itemTooltipIsTwoHanded(item)) return 'mainhand';
    return 'mainhand';
}

/**
 * Physical output this weapon adds: candidate vs 0–0 at same speed (current AP/talents/abilities).
 * Shaman mainhand: damageCalc weapon-scaling abilities (auto, Stormstrike, Lightning Strike, Windfury).
 * Others / offhand: character-sheet weapon DPS formula (app.js).
 */
function computeWeaponPhysicalOutputAdd(candidateItem, equippedGear, targetSlot) {
    if (!isScorableWeaponItem(candidateItem)) return 0;

    const slot = targetSlot || inferWeaponTargetSlot(candidateItem);
    const gear = resolveEquippedGearSnapshot(equippedGear) || {};
    const classId = resolveClassId();
    const weaponStats = parseStatsFromTooltip(candidateItem);

    if (classId === 'shaman' && slot !== 'offhand') {
        const candidateStats = buildShamanStatsWithWeaponDamage(
            gear,
            weaponStats.weaponDamageMin,
            weaponStats.weaponDamageMax,
            weaponStats.weaponSpeed
        );
        const zeroStats = buildShamanStatsWithWeaponDamage(gear, 0, 0, weaponStats.weaponSpeed);
        if (!candidateStats || !zeroStats) return 0;

        return sumWeaponScalingAbilityDps(candidateStats) - sumWeaponScalingAbilityDps(zeroStats);
    }

    return computeSheetWeaponDpsAdd(candidateItem, gear, slot);
}

/**
 * Weapon types used to decide whether typed weapon skill on an item applies.
 * Uses the item's own subtype when it is a weapon (item picker / unequipped weapons),
 * plus the equipped mainhand when present (armor and accessories).
 */
function getWeaponSkillMatchTypes(item, equippedGear = null) {
    const types = new Set();
    const itemType = getWeaponSubtype(item);
    if (itemType) types.add(itemType);

    const gear = resolveEquippedGearSnapshot(equippedGear);
    const mainhand = gear?.mainhand || getCurrentlyEquippedItem('mainhand');
    const equippedType = mainhand ? getWeaponSubtype(mainhand) : null;
    if (equippedType) types.add(equippedType);
    return types;
}

/**
 * Calculate an item's DPS score from its stats and current stat weights.
 * Typed weapon skill counts when it matches the scored weapon and/or equipped mainhand.
 * Weapons add physical output from damage range vs 0–0 at same speed (sheet + weapon-scaling abilities), not listed tooltip DPS.
 * @param {Object} item - Item object with tooltip_lines_raw
 * @param {Array|null} statWeights - Array of stat weight objects (from getStoredStatWeights)
 * @param {Object|null} [equippedGear] - Optional {slot: item} snapshot for weapon-skill matching (Gear Planner)
 * @param {string|null} [targetSlot] - Slot being picked (mainhand/offhand); defaults from weapon type
 * @returns {number|null} DPS score, or null if weights unavailable
 */
export function calculateItemDpsScore(item, statWeights, equippedGear = null, targetSlot = null) {
    if (!statWeights || !Array.isArray(statWeights) || statWeights.length === 0) return null;
    if (!item) return null;

    const weightMap = {};
    for (const w of statWeights) {
        if (w.key && typeof w.statDps === 'number') {
            weightMap[w.key] = w.statDps;
        }
    }
    if (Object.keys(weightMap).length === 0) return null;

    const stats = parseStatsFromTooltip(item);
    let score = 0;
    for (const [tooltipKey, weightKey] of Object.entries(TOOLTIP_TO_WEIGHT_KEY)) {
        if (WEAPON_STAT_KEYS.has(tooltipKey)) continue;
        const value = stats[tooltipKey];
        if (value && weightMap[weightKey]) {
            score += value * weightMap[weightKey];
        }
    }

    const wepSkillWeight = weightMap.wepSkill;
    if (wepSkillWeight) {
        const matchTypes = getWeaponSkillMatchTypes(item, equippedGear);

        // Weapon skill by type (e.g. "Increased Two-handed Axes +5")
        if (stats.weaponSkillByType && matchTypes.size > 0) {
            for (const [skillType, skillValue] of Object.entries(stats.weaponSkillByType)) {
                if (!skillValue) continue;
                const canonicalSkill = canonicalWeaponSkillType(skillType);
                for (const weaponType of matchTypes) {
                    if (doesWeaponSkillMatch(canonicalSkill, weaponType)) {
                        score += skillValue * wepSkillWeight;
                        break;
                    }
                }
            }
        }

        // Generic weapon skill (rare — "Increased Weapon Skill +X")
        if (stats.weaponSkill) {
            score += stats.weaponSkill * wepSkillWeight;
        }
    }

    if (isScorableWeaponItem(item)) {
        const weaponDelta = computeWeaponPhysicalOutputAdd(item, equippedGear, targetSlot);
        if (Number.isFinite(weaponDelta)) score += weaponDelta;
    }

    return score;
}

/**
 * Check if a weapon skill type (e.g. "Axe", "Two-handed Axe") matches a weapon subtype.
 * Classic treats 1H and 2H skills as separate. Generic "Two-handed Weapon" matches any 2H subtype.
 */
function doesWeaponSkillMatch(skillType, weaponType) {
    const skill = canonicalWeaponSkillType(skillType);
    const weapon = canonicalWeaponSkillType(weaponType);
    if (!skill || !weapon) return false;
    if (skill === weapon) return true;
    if (skill === 'Two-handed Weapon' && weapon.startsWith('Two-handed ')) return true;
    return false;
}

/**
 * Determine the CSS class for a tooltip line based on its content
 * @param {string} text - The tooltip line text
 * @param {Object} setInfo - Set information for highlighting
 * @returns {string} CSS class name
 */
function getTooltipLineClass(text, setInfo = {}) {
    const lowerText = text.toLowerCase();
    const trimmedLowerText = lowerText.trim();

    // Check if this is a set piece name
    if (setInfo.equippedPieces && setInfo.equippedPieces.includes(text)) {
        return 'tooltip-set-equipped'; // White for equipped pieces
    }

    // Check if this is the set name line
    if (setInfo.setName) {
        // Check if this line IS the set name (might be standalone or with count)
        if (text.trim() === setInfo.setName || text.startsWith(setInfo.setName + ' (')) {
            return 'tooltip-set-name'; // Gold for set name
        }

        // Check if this is just the count line (X/Y)
        if (text.match(/^\((\d+)\/(\d+)\)$/)) {
            return 'tooltip-set-name'; // Gold for piece count too
        }
    }

    // Check for set bonus lines
    const setBonusMatch = text.match(/^\((\d+)\) Set:/);
    if (setBonusMatch) {
        const requiredPieces = parseInt(setBonusMatch[1]);
        if (setInfo.activeBonuses && setInfo.activeBonuses.includes(requiredPieces)) {
            return 'tooltip-green'; // Green for active set bonuses
        } else {
            return 'tooltip-set-grey'; // Grey for inactive set bonuses
        }
    }

    // Green for equip/use effects (non-set)
    if (lowerText.startsWith('equip:') ||
        lowerText.startsWith('use:') ||
        lowerText.startsWith('chance on hit:')) {
        return 'tooltip-green';
    }

    // Gold for flavor text
    if (lowerText.startsWith('"')) {
        return 'tooltip-gold';
    }

    // Check if this looks like a set piece name (grey out unequipped)
    // Exclude slot names (Head, Neck, Shoulder, etc.), armor types, and item properties
    const slotNames = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger', 'trinket', 'one-hand', 'two-hand', 'main hand', 'off hand', 'ranged', 'relic', 'totem'];
    const armorTypes = ['cloth', 'leather', 'mail', 'plate', 'shield', 'mace', 'sword', 'axe', 'dagger'];

    if (setInfo.setName && text.trim().length > 0 &&
        !text.includes('+') && !text.includes(':') &&
        !text.match(/^\d/) && !text.match(/^\([\d.]+/) && // Exclude lines starting with (number
        !text.includes('Durability') && !text.includes('Speed') && !text.includes('Damage') &&
        !text.includes('Classes:') && !text.includes('Requires') &&
        !lowerText.includes('binds') && !lowerText.includes('unique') &&
        !slotNames.includes(trimmedLowerText) && !armorTypes.includes(trimmedLowerText)) {
        // This might be a set piece name
        const isEquipped = setInfo.equippedPieces && setInfo.equippedPieces.includes(text);
        return isEquipped ? 'tooltip-white' : 'tooltip-set-grey';
    }

    // Default white (includes attributes like "+5 Stamina")
    return 'tooltip-white';
}

// Import getEquippedGear at the top (we'll add this)
let getEquippedGearFunc = null;

/**
 * Set the function to get equipped gear (dependency injection)
 * @param {Function} func - Function that returns equipped gear object
 */
export function setGetEquippedGear(func) {
    getEquippedGearFunc = func;
}

/**
 * Create HTML tooltip for an item
 * @param {Object} item - Item object with name, quality, and tooltip_lines_raw
 * @param {Object} equippedGear - Currently equipped gear (optional, for set tracking)
 * @returns {string} HTML string for tooltip
 */
export function createItemTooltipHTML(item, equippedGear = null) {
    // If no equipped gear passed, try to get it from the injected function
    // NOTE: equippedGear should be an object of {slot: itemObject}, not {slot: itemId}
    if (!equippedGear && getEquippedGearFunc) {
        equippedGear = getEquippedGearFunc();
    }
    if (!item || !item.name) return '';

    const simStar = isItemProcModeled(item)
        ? '<span class="tooltip-sim-star" title="Proc/On-Use effect is modeled in simulation">&#9733;</span>'
        : '';
    const nameHTML = `<div class="tooltip-name-row"><b class="q${item.quality || 0}">${item.name}</b>${simStar}</div>`;

    if (!item.tooltip_lines_raw || item.tooltip_lines_raw.length === 0) {
        return nameHTML;
    }

    // Get set information for highlighting
    const setInfo = extractSetInfo(item, equippedGear);

    // Merge "Equip:" and "Set:" lines with their following text
    // Also merge set name with (X/Y) count
    // Also merge slot+armor, weapon info, and damage+speed
    const mergedLines = [];
    const slotTypes = ['Head', 'Neck', 'Shoulder', 'Back', 'Chest', 'Wrist', 'Hands', 'Waist', 'Legs', 'Feet', 'Finger', 'Trinket'];
    const armorTypes = ['Cloth', 'Leather', 'Mail', 'Plate'];
    const weaponSlots = ['One-hand', 'One-Hand', 'Two-hand', 'Two-Hand', 'Main Hand', 'Off Hand', 'Ranged'];
    const weaponTypes = ['Mace', 'Sword', 'Axe', 'Dagger', 'Staff', 'Polearm', 'Fist Weapon', 'Shield', 'Bow', 'Gun', 'Crossbow', 'Wand', 'Thrown'];

    for (let i = 0; i < item.tooltip_lines_raw.length; i++) {
        const line = item.tooltip_lines_raw[i];

        // Skip empty lines entirely
        if (!line || line.trim() === '') {
            continue;
        }

        // Get the next non-empty line for merging checks
        let nextLine = null;
        let nextLineIndex = i + 1;
        while (nextLineIndex < item.tooltip_lines_raw.length) {
            const potentialNext = item.tooltip_lines_raw[nextLineIndex];
            if (potentialNext && potentialNext.trim() !== '') {
                nextLine = potentialNext;
                break;
            }
            nextLineIndex++;
        }

        // Check if this line is just "Equip:", "Use:", "Chance on hit:", or "(X) Set:"
        if (line === 'Equip:' || line === 'Use:' || line === 'Chance on hit:' || line.match(/^\(\d+\) Set:$/)) {
            // Merge with next line if it exists
            if (nextLine) {
                mergedLines.push({ text: line + ' ' + nextLine, type: 'normal' });
                i = nextLineIndex; // Skip to the line we just merged
            } else {
                mergedLines.push({ text: line, type: 'normal' });
            }
        }
        // Check if this is a slot type followed by armor type
        else if (slotTypes.includes(line) && nextLine && armorTypes.includes(nextLine)) {
            mergedLines.push({ text: line, textRight: nextLine, type: 'split' });
            i = nextLineIndex; // Skip to the line we just merged
        }
        // Check if this is a weapon slot followed by weapon type
        else if (weaponSlots.includes(line) && nextLine && weaponTypes.includes(nextLine)) {
            mergedLines.push({ text: line, textRight: nextLine, type: 'split' });
            i = nextLineIndex; // Skip to the line we just merged
        }
        // Check if this is damage range followed by speed
        else if (line.match(/^\d+ - \d+\s+Damage$/) && nextLine && nextLine.startsWith('Speed ')) {
            mergedLines.push({ text: line, textRight: nextLine, type: 'split' });
            i = nextLineIndex; // Skip to the line we just merged
        }
        // Check if next line is (X/Y) - if so, merge set name with count
        else if (nextLine && nextLine.match(/^\((\d+)\/(\d+)\)$/)) {
            // This is a set name, merge with count
            mergedLines.push({ text: line + ' ' + nextLine, type: 'normal' });
            i = nextLineIndex; // Skip to the line we just merged
        } else {
            mergedLines.push({ text: line, type: 'normal' });
        }
    }

    const htmlLines = mergedLines
        .map(lineObj => {
            if (!lineObj || !lineObj.text || lineObj.text.trim() === '') return '';

            let displayText = lineObj.text;
            let displayTextRight = lineObj.textRight || '';

            // Update the set piece count if this line contains (X/Y)
            if (setInfo.setName && displayText.includes('(') && displayText.match(/\((\d+)\/(\d+)\)/)) {
                // Replace the count with the actual equipped count
                displayText = displayText.replace(/\((\d+)\/(\d+)\)/, `(${setInfo.equippedCount || 0}/$2)`);
            }

            // Check if this is a set piece name that needs indenting
            const isSetPieceName = setInfo.setName &&
                                   setInfo.equippedPieces &&
                                   (setInfo.equippedPieces.includes(displayText) ||
                                    displayText.includes(setInfo.setName));

            // Handle split-line format (slot/armor, weapon info, damage/speed)
            if (lineObj.type === 'split') {
                const leftClass = getTooltipLineClass(displayText, setInfo);
                const rightClass = getTooltipLineClass(displayTextRight, setInfo);
                return `<div class="tooltip-split-line"><span class="${leftClass}">${displayText}</span><span class="${rightClass}">${displayTextRight}</span></div>`;
            }

            // Check if this looks like an unequipped set piece name for indenting
            const lowerDisplayText = displayText.toLowerCase();
            const shouldIndent = setInfo.setName &&
                                !displayText.includes('+') &&
                                !displayText.includes(':') &&
                                !displayText.match(/^\d/) &&
                                !displayText.match(/^\([\d.]+/) && // Don't indent lines starting with (number
                                !displayText.includes('Durability') &&
                                !displayText.includes('Speed') &&
                                !displayText.includes('Damage') &&
                                !displayText.includes('Classes:') &&
                                !displayText.includes('Requires') &&
                                !lowerDisplayText.includes('binds') &&
                                !lowerDisplayText.includes('unique') &&
                                !displayText.includes(setInfo.setName) &&
                                !displayText.match(/^\((\d+)\/(\d+)\)$/) &&
                                !displayText.match(/^\(\d+\) Set:/) &&
                                displayText.trim().length > 0;

            // Fix display of negative stats (e.g., "+-25 Stamina" should be "-25 Stamina")
            let cleanedDisplayText = displayText.replace(/\+-/g, '-');

            const lineClass = getTooltipLineClass(cleanedDisplayText, setInfo);
            const indent = (shouldIndent && setInfo.setName) ? '&nbsp;&nbsp;' : '';

            // Prepend star to set bonus lines that are modeled in the sim
            let simStar = '';
            const setBonusPieceMatch = cleanedDisplayText.match(/^\((\d+)\) Set:/);
            if (setBonusPieceMatch && setInfo.modeledBonusTiers?.has(parseInt(setBonusPieceMatch[1]))) {
                simStar = '<span class="tooltip-sim-star" title="Set bonus is modeled in simulation">&#9733;</span> ';
            }

            return `<span class="${lineClass}">${indent}${simStar}${cleanedDisplayText}</span>`;
        })
        .filter(line => line !== '');

    // Join lines, but don't add <br /> after div elements (split-lines)
    const bodyHTML = htmlLines
        .map((line, index) => {
            // Check if this line is a div (split-line) - if so, don't add <br /> after it
            if (line.startsWith('<div')) {
                return line;
            }
            // For span lines, add <br /> after unless it's the last line
            return index < htmlLines.length - 1 ? line + '<br />' : line;
        })
        .join('');

    // Build bottom score line: DPS on the left, tank score on the right
    const { dps: statWeights, tank: tankWeights } = getActiveItemScoreWeights();
    const dpsScore = statWeights ? calculateItemDpsScore(item, statWeights, equippedGear) : null;
    const hasDps = dpsScore !== null && dpsScore > 0;

    const tankScore = tankWeights ? calculateItemTankScore(item, tankWeights) : null;
    const hasTank = tankScore !== null;

    let scoreHTML = '';
    if (hasDps && hasTank) {
        scoreHTML = `<br /><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;">` +
            `<span style="color:#ffd700;font-size:12px;font-weight:bold;">~${Math.round(dpsScore)} DPS</span>` +
            `<span style="color:#7ec8e3;font-size:12px;font-weight:bold;">EHP: ${tankScore.ehp.toLocaleString()} | Mit Score: ${tankScore.mitScore.toLocaleString()} (Tank Score: ${tankScore.tankScore.toLocaleString()})</span>` +
            `</div>`;
    } else if (hasDps) {
        scoreHTML = `<br /><span style="color:#ffd700;font-size:12px;font-weight:bold;">~${Math.round(dpsScore)} DPS</span>`;
    } else if (hasTank) {
        scoreHTML = `<br /><div style="text-align:right;">` +
            `<span style="color:#7ec8e3;font-size:12px;font-weight:bold;">EHP: ${tankScore.ehp.toLocaleString()} | Mit Score: ${tankScore.mitScore.toLocaleString()} (Tank Score: ${tankScore.tankScore.toLocaleString()})</span>` +
            `</div>`;
    }

    return `${nameHTML}${bodyHTML}${scoreHTML}`;
}

/**
 * Extract set information from item and check against equipped gear
 * @param {Object} item - Item object
 * @param {Object} equippedGear - Currently equipped gear
 * @returns {Object} Set information with equipped pieces and active bonuses
 */
function extractSetInfo(item, equippedGear) {
    if (!item.tooltip_lines_raw || !equippedGear) {
        return { equippedPieces: [], activeBonuses: [] };
    }

    // Find the set name line (gold colored set name with piece count)
    let setName = null;
    let setTotal = 0;

    for (let i = 0; i < item.tooltip_lines_raw.length; i++) {
        const line = item.tooltip_lines_raw[i];

        // Check if line ends with (X/Y) - combined format
        let setMatch = line.match(/^(.+?)\s*\((\d+)\/(\d+)\)$/);
        if (setMatch) {
            setName = setMatch[1].trim();
            setTotal = parseInt(setMatch[3]);
            break;
        } else if (i + 1 < item.tooltip_lines_raw.length) {
            // Check if next line is just (X/Y) - split format
            const nextLine = item.tooltip_lines_raw[i + 1];
            const countMatch = nextLine.match(/^\((\d+)\/(\d+)\)$/);
            if (countMatch && line.trim().length > 0 && !line.includes(':') && !line.match(/^\+/)) {
                setName = line.trim();
                setTotal = parseInt(countMatch[2]);
                break;
            }
        }
    }

    if (!setName) {
        return { equippedPieces: [], activeBonuses: [] };
    }

    // Find all equipped pieces from this set
    const equippedPieces = [];
    for (const [slot, equippedItem] of Object.entries(equippedGear)) {
        if (!equippedItem || !equippedItem.tooltip_lines_raw) continue;

        // Check if this equipped item belongs to the same set
        // The set name might be on its own line or combined with count
        for (let i = 0; i < equippedItem.tooltip_lines_raw.length; i++) {
            const line = equippedItem.tooltip_lines_raw[i];

            // Check if line contains the set name
            if (line.includes(setName)) {
                equippedPieces.push(equippedItem.name);
                break;
            }

            // Also check if this is a split format and the line matches exactly
            if (line.trim() === setName) {
                equippedPieces.push(equippedItem.name);
                break;
            }
        }
    }

    // Determine which set bonuses are active
    const activeBonuses = [];
    const equippedCount = equippedPieces.length;

    for (const line of item.tooltip_lines_raw) {
        const bonusMatch = line.match(/^\((\d+)\) Set:/);
        if (bonusMatch) {
            const requiredPieces = parseInt(bonusMatch[1]);
            if (equippedCount >= requiredPieces) {
                activeBonuses.push(requiredPieces);
            }
        }
    }

    // Modeled-in-sim stars: setDatabase bonus.modeledInSim === true (not merely having a statsKey).
    // Match tooltip set line to displayName or optional displayNameAliases.
    const modeledBonusTiers = new Set();
    if (setName) {
        for (const setData of Object.values(setDatabase.sets)) {
            const aliasMatch = Array.isArray(setData.displayNameAliases) && setData.displayNameAliases.includes(setName);
            if (setData.displayName === setName || aliasMatch) {
                for (const bonus of Object.values(setData.bonuses)) {
                    if (bonus.pieces && bonus.modeledInSim === true) {
                        modeledBonusTiers.add(bonus.pieces);
                    }
                }
                break;
            }
        }
    }

    return {
        setName,
        equippedPieces,
        activeBonuses,
        equippedCount,
        modeledBonusTiers
    };
}

// no_slot.json has been removed — enchant tooltips use inline data only
const noSlotDataForEnchants = [];
async function loadNoSlotItemsForEnchants() { return noSlotDataForEnchants; }

function findItemByNameForEnchants(itemName) {
    if (!noSlotDataForEnchants) return null;
    return noSlotDataForEnchants.find(item => item.name === itemName);
}

/**
 * Create HTML tooltip for an enchant
 * @param {Object} enchant - Enchant object with name, stats, and optional description
 * @returns {string} HTML string for tooltip
 */
export async function createEnchantTooltipHTML(enchant) {
    if (!enchant || !enchant.name || enchant.name === 'None') return '';

    const nameHTML = `<b class="q2">${enchant.name}</b>`;

    // If enchant has itemName, try to load tooltip from no_slot.json (e.g., Iron Counterweight)
    if (enchant.itemName) {
        await loadNoSlotItemsForEnchants();
        const item = findItemByNameForEnchants(enchant.itemName);
        if (item && item.tooltip_lines_raw && item.tooltip_lines_raw.length > 0) {
            // Filter out empty lines and requirements
            const filteredLines = item.tooltip_lines_raw
                .filter(line => {
                    const trimmed = line.trim();
                    return trimmed &&
                           !trimmed.startsWith('Binds when') &&
                           !trimmed.startsWith('Unique') &&
                           !trimmed.startsWith('Requires Level') &&
                           !trimmed.startsWith('Requires ') &&
                           !trimmed.startsWith('Classes:') &&
                           !trimmed.startsWith('Quest Item');
                });

            if (filteredLines.length > 0) {
                const body = filteredLines.join('<br/>');
                return `${nameHTML}<br/>${body}`;
            }
        }
    }

    const statsHTML = formatEnchantStatsHTML(enchant.stats);

    // Use stats if available, otherwise use description
    const body = statsHTML
        ? statsHTML
        : `<span class="tooltip-gold">"${enchant.description || 'Effect'}"</span>`;

    return `${nameHTML}<br/>${body}`;
}

/**
 * Create a generic tooltip (for future expansion)
 * @param {string} title - Tooltip title
 * @param {Array<string>} lines - Array of tooltip lines
 * @param {number} quality - Quality level (0-7 for WoW quality colors)
 * @returns {string} HTML string for tooltip
 */
export function createGenericTooltip(title, lines = [], quality = 0) {
    const nameHTML = `<b class="q${quality}">${title}</b>`;

    if (lines.length === 0) {
        return nameHTML;
    }

    const bodyHTML = lines
        .map(lineText => {
            if (!lineText) return '';
            const lineClass = getTooltipLineClass(lineText);
            return `<span class="${lineClass}">${lineText}</span>`;
        })
        .join('<br />');

    return `${nameHTML}<br />${bodyHTML}`;
}
