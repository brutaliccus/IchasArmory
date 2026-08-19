#!/usr/bin/env node
/**
 * Reproduce Ichabaddie's 2H Mace Pre-Raid BIS tooltip DPS with/without raid debuffs.
 * Run: node scripts/test-preraid-bis-tooltip-dps.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { JSDOM } from 'jsdom';
import { calculateEffectiveHealth } from '../modules/ui/calculator.js';
import { getTalentBonusesFromSpec } from '../modules/talents_new.js';
import { getBuffsFromSavedList } from '../modules/character/buffs.js';
import { getSelectedRaceBonuses } from '../modules/character/races.js';
import { parseStatsFromTooltip, KEY_MAP } from '../modules/character/stats.js';
import { computeWeaponPhysicalOutputAdd, calculateItemDpsScore, invalidateItemScoreCache } from '../modules/ui/tooltips.js';
import { getSetBonuses } from '../modules/gear/setBonuses.js';
import { GEAR_PLAN_SLOTS } from '../modules/gear/gearPlanner.js';
import { enchantDatabase } from '../modules/gear/enchants.js';
import { getEffectiveEnchantStats } from '../modules/character/stats.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const PLAN = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gp-preraid-2h-mace-bis.json'), 'utf8'));

const WHITE_WEAPON = {
    tooltip_lines_raw: ['Two-hand', 'Mace', '11 - 17  Damage', 'Speed 3.70', '+5 Strength', 'Requires Level 2'],
};

const itemCache = new Map();
function loadItemsForSlot(slot) {
    const fileSlot = slot.startsWith('ring') ? 'ring' : slot.startsWith('trinket') ? 'trinket' : slot;
    const filePath = path.join(ROOT, 'data', 'items', `${fileSlot}.json`);
    if (!fs.existsSync(filePath)) return [];
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
function getItemById(id) {
    const key = String(id);
    if (itemCache.has(key)) return itemCache.get(key);
    for (const slot of GEAR_PLAN_SLOTS) {
        for (const item of loadItemsForSlot(slot)) {
            itemCache.set(String(item.id), item);
        }
    }
    return itemCache.get(key) || null;
}

function emptyStatTemplate() {
    const total = { weaponSkillByType: {} };
    for (const k of ['strength', 'agility', 'stamina', 'intellect', 'spirit', 'attackPower', 'crit', 'hit', 'haste', 'armorPen', 'dmgAndHealing', 'natureDamage', 'fireDamage', 'frostDamage', 'spellCrit', 'spellHit', 'spellPen']) {
        total[k] = 0;
    }
    return total;
}

function aggregatePlanEnchantStats(plan) {
    const total = emptyStatTemplate();
    for (const slot of GEAR_PLAN_SLOTS) {
        const idx = plan.slots?.[slot]?.enchant;
        if (idx == null) continue;
        const enchant = enchantDatabase[slot]?.[idx];
        if (!enchant) continue;
        const effectiveStats = getEffectiveEnchantStats(enchant);
        for (const stat in effectiveStats) {
            const finalKey = KEY_MAP[stat] || stat;
            if (stat === 'weaponSkillByType' && typeof effectiveStats[stat] === 'object') {
                for (const weaponType in effectiveStats[stat]) {
                    total.weaponSkillByType[weaponType] = (total.weaponSkillByType[weaponType] || 0) + effectiveStats[stat][weaponType];
                }
            } else if (Object.prototype.hasOwnProperty.call(total, finalKey)) {
                total[finalKey] += effectiveStats[stat];
            }
        }
    }
    return total;
}

function buildGpCalcPayload(plan, { includeGear, includeTalents, includeBuffs }) {
    const cls = plan.class || 'warrior';
    const race = plan.race || 'human';
    const total = emptyStatTemplate();
    const equipped = {};
    if (includeGear) {
        for (const slot of GEAR_PLAN_SLOTS) {
            const id = plan.slots?.[slot]?.primary;
            if (!id) continue;
            const item = getItemById(id);
            if (!item) continue;
            equipped[slot] = item;
            const stats = item.stats || parseStatsFromTooltip(item);
            item.stats = stats;
            for (const itemStatKey in stats) {
                if (itemStatKey === 'weaponSkillByType' && typeof stats[itemStatKey] === 'object') {
                    for (const weaponType in stats[itemStatKey]) {
                        total.weaponSkillByType[weaponType] = (total.weaponSkillByType[weaponType] || 0) + stats[itemStatKey][weaponType];
                    }
                } else {
                    const finalKey = KEY_MAP[itemStatKey] || itemStatKey;
                    if (Object.prototype.hasOwnProperty.call(total, finalKey)) {
                        total[finalKey] += stats[itemStatKey];
                    }
                }
            }
        }
    }
    const mh = equipped.mainhand;
    const oh = equipped.offhand;
    const talentBonuses = includeTalents ? getTalentBonusesFromSpec(cls, plan.talents || {}) : {};
    return {
        selectedClass: cls,
        selectedRace: race,
        attackerLevel: 63,
        gearStats: total,
        talentBonuses,
        racialBonuses: getSelectedRaceBonuses(race),
        activeBuffs: includeBuffs ? getBuffsFromSavedList(plan.buffs || [], talentBonuses) : [],
        enchantStats: includeGear ? aggregatePlanEnchantStats(plan) : emptyStatTemplate(),
        offhandArmor: oh?.stats?.armor || 0,
        setBonuses: includeGear ? getSetBonuses(equipped, false) : {},
        isDualWielding: false,
        mainhandWeaponType: mh?.tooltip_lines_raw?.includes('Mace') ? 'Mace' : null,
        offhandWeaponType: null,
        mainhandIsTwoHanded: mh?.tooltip_lines_raw?.includes('Two-hand') || false,
        offhandIsTwoHanded: false,
        rangedWeaponType: null,
        stRotation: plan.ui?.stRotation === 'eleSt' ? 'eleSt' : 'enhSt',
    };
}

function fmt(n) {
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n * 10) / 10 : n;
}

function runScenario(label, plan, { stripDebuffs = false, fast = false } = {}) {
    const testPlan = stripDebuffs
        ? { ...plan, buffs: (plan.buffs || []).filter((b) => {
            const debuffIds = new Set(['exposeArmor', 'faerieFire', 'curseOfRecklessness', 'sunderArmor', 'shart', 'annihilator', 'curseOfTheElements', 'curseOfShadows', 'fireVulnerability', 'nightfall', 'thunderfury_debuff']);
            return !debuffIds.has(b.id);
        }) }
        : plan;

    const payload = buildGpCalcPayload(testPlan, { includeGear: true, includeTalents: true, includeBuffs: true });
    window.getGearPlannerCalcPayload = () => payload;
    invalidateItemScoreCache();

    const bones = getItemById(83440);
    const statWeights = testPlan.statWeightsByClass?.shaman?.statWeights || [];
    const equipped = {};
    for (const slot of GEAR_PLAN_SLOTS) {
        const id = testPlan.slots?.[slot]?.primary;
        if (id) equipped[slot] = getItemById(id);
    }

    const totals = calculateEffectiveHealth(payload);
    const weaponAdd = computeWeaponPhysicalOutputAdd(bones, equipped, 'mainhand', { fastWeaponScoring: fast });
    const whiteAdd = computeWeaponPhysicalOutputAdd(WHITE_WEAPON, equipped, 'mainhand', { fastWeaponScoring: fast });
    const totalScore = calculateItemDpsScore(bones, statWeights, equipped, 'mainhand', { fastWeaponScoring: fast });
    const whiteScore = calculateItemDpsScore(WHITE_WEAPON, statWeights, equipped, 'mainhand', { fastWeaponScoring: fast });

    let armorReduction = 0;
    for (const b of payload.activeBuffs || []) {
        if (b?.enemyArmorReduction) armorReduction += Math.abs(b.enemyArmorReduction);
    }
    const effectiveArmor = Math.max(0, 3731 - armorReduction);

    console.log(`\n--- ${label}${fast ? ' (fast)' : ''} ---`);
    console.log(`Effective target armor from plan debuffs: ${effectiveArmor} (reduction ${armorReduction})`);
    console.log(`AP: ${fmt(totals.attackPower)} | armor pen: ${fmt(totals.armorPen)}`);
    console.log(`Boneshatter weapon add vs 0–0: ${fmt(weaponAdd)}`);
    console.log(`White weapon add vs 0–0: ${fmt(whiteAdd)}`);
    console.log(`Boneshatter incremental vs white: ${fmt(weaponAdd - whiteAdd)}`);
    console.log(`Boneshatter total tooltip ~DPS: ${fmt(totalScore)}`);
    console.log(`White total tooltip ~DPS: ${fmt(whiteScore)}`);
    console.log(`Stat-weight portion (total - weapon add): ${fmt(totalScore - weaponAdd)}`);

    return { weaponAdd, totalScore, whiteAdd, whiteScore, ap: totals.attackPower };
}

const dom = new JSDOM('<!DOCTYPE html><html><body data-app-mode="gearPlanner"><div id="gp-class-sidebar" data-selected-class="shaman" data-selected-race="tauren"></div></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

console.log('Plan:', PLAN.name);
console.log('Debuff buffs:', (PLAN.buffs || []).filter(b => ['exposeArmor','faerieFire','curseOfRecklessness','sunderArmor','shart','annihilator'].includes(b.id)).map(b => b.id).join(', ') || '(none named)');

const withDebuffs = runScenario('Plan buffs (with raid debuffs on targetArmor)', PLAN);
const noDebuffs = runScenario('Raid debuffs stripped from plan buffs', PLAN, { stripDebuffs: true });
const withDebuffsFast = runScenario('Plan buffs', PLAN, { fast: true });

const planWithWf = { ...PLAN, buffs: [{ id: 'windfury', improved: false }, ...(PLAN.buffs || [])] };
const withWf = runScenario('Plan + Windfury imbue buff', planWithWf);

console.log('\n=== Summary ===');
console.log(`User reported ~169 | current full: ${fmt(withDebuffs.totalScore)} | no debuffs: ${fmt(noDebuffs.totalScore)} | fast: ${fmt(withDebuffsFast.totalScore)}`);
console.log(`Weapon add delta (plan vs no debuffs): ${fmt(withDebuffs.weaponAdd - noDebuffs.weaponAdd)}`);
