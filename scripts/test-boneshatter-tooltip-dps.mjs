#!/usr/bin/env node
/**
 * Boneshatter Maul tooltip weapon-add calibration test.
 * Run: node scripts/test-boneshatter-tooltip-dps.mjs
 *
 * Expects weapon physical-output add (candidate vs 0–0) + item stats ≈ 180–220 DPS,
 * not ~55 white-only or ~900 full character DPS.
 */
import { JSDOM } from 'jsdom';
import { calculateEffectiveHealth } from '../modules/ui/calculator.js';
import { getTalentBonusesFromSpec } from '../modules/talents_new.js';
import { getBuffsFromSavedList } from '../modules/character/buffs.js';
import { getSelectedRaceBonuses } from '../modules/character/races.js';
import { parseStatsFromTooltip } from '../modules/character/stats.js';
import { computeWeaponPhysicalOutputAdd, calculateItemDpsScore } from '../modules/ui/tooltips.js';

const dom = new JSDOM('<!DOCTYPE html><html><body data-app-mode="gearPlanner"><div id="gp-class-sidebar" data-selected-class="shaman" data-selected-race="orc"></div></body></html>', {
    url: 'http://localhost/',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;

const WHITE_WEAPON = {
    tooltip_lines_raw: [
        'Two-hand',
        'Mace',
        '11 - 17  Damage',
        'Speed 3.70',
        '+5 Strength',
        'Requires Level 2',
    ],
};

const BONESHATTER = {
    tooltip_lines_raw: [
        'Two-hand',
        'Mace',
        '156 - 250  Damage',
        'Speed 3.70',
        '(54.9 damage per second)',
        '+35 Strength',
        'Requires Level 60',
        'Equip:',
        'Improves your chance to get a critical strike by 1%.',
    ],
};

// Enhancement ST preset: Stormstrike, Lightning Strike, Element's Grace 5/5, prereqs
const ENH_TALENTS = {
    'enhancement-1': 5,
    'enhancement-2': 5,
    'enhancement-4': 1,
    'enhancement-5': 5,
    'enhancement-6': 1,
    'enhancement-7': 3,
    'enhancement-8': 3,
    'enhancement-10': 1,
    'enhancement-11': 5,
    'enhancement-13': 1,
    'enhancement-14': 3,
    'enhancement-16': 2,
    'enhancement-17': 3,
    'enhancement-18': 1,
    'enhancement-22': 5,
};

const GP_BUFFS = [
    { id: 'windfury' },
    { id: 'lightningshield' },
    { id: 'motw', improved: true },
    { id: 'fortitude', improved: true },
    { id: 'graceOfAir', improved: true },
    { id: 'strengthOfEarthTotem', improved: true },
    { id: 'battleShout', improved: true },
    { id: 'blessingOfMight', improved: true },
    { id: 'leaderOfThePack' },
];

function buildMockGpPayload() {
    const classId = 'shaman';
    const raceId = 'orc';
    const talentBonuses = getTalentBonusesFromSpec(classId, ENH_TALENTS);
    const activeBuffs = getBuffsFromSavedList(GP_BUFFS, talentBonuses);

    const gearStats = {
        attackPower: 2000,
        strength: 350,
        agility: 120,
        stamina: 400,
        crit: 28,
        hit: 6,
        haste: 8,
        dmgAndHealing: 180,
        natureDamage: 220,
        armorPen: 0,
    };

    return {
        selectedClass: classId,
        selectedRace: raceId,
        attackerLevel: 63,
        gearStats,
        talentBonuses,
        racialBonuses: getSelectedRaceBonuses(raceId),
        activeBuffs,
        enchantStats: {},
        offhandArmor: 0,
        setBonuses: {},
        isDualWielding: false,
        mainhandWeaponType: 'Mace',
        offhandWeaponType: null,
        mainhandIsTwoHanded: true,
        offhandIsTwoHanded: false,
        rangedWeaponType: null,
    };
}

const MOCK_STAT_WEIGHTS = [
    { key: 'str', statDps: 0.85 },
    { key: 'ap', statDps: 0.35 },
    { key: 'physCrit', statDps: 2.1 },
    { key: 'physHit', statDps: 1.4 },
    { key: 'haste', statDps: 1.1 },
];

function fmt(n) {
    return typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : n;
}

function run() {
    const payload = buildMockGpPayload();
    window.getGearPlannerCalcPayload = () => payload;
    const totals = calculateEffectiveHealth(payload);

    const whiteAdd = computeWeaponPhysicalOutputAdd(WHITE_WEAPON, {}, 'mainhand');
    const bonesVsZero = computeWeaponPhysicalOutputAdd(BONESHATTER, {}, 'mainhand');
    const bonesVsWhite = bonesVsZero - whiteAdd;
    const bonesScore = calculateItemDpsScore(BONESHATTER, MOCK_STAT_WEIGHTS, {}, 'mainhand');
    const whiteScore = calculateItemDpsScore(WHITE_WEAPON, MOCK_STAT_WEIGHTS, {}, 'mainhand');
    const statOnly = bonesScore - bonesVsZero;

    console.log('=== Boneshatter tooltip DPS calibration ===');
    console.log(`Character AP (mock): ${fmt(totals.attackPower)}`);
    console.log(`White weapon add vs 0–0: ${fmt(whiteAdd)} DPS`);
    console.log(`Boneshatter weapon add vs 0–0: ${fmt(bonesVsZero)} DPS`);
    console.log(`Boneshatter incremental vs white: ${fmt(bonesVsWhite)} DPS`);
    console.log(`Boneshatter stat-weight portion: ${fmt(statOnly)} DPS`);
    console.log(`Boneshatter total tooltip score: ${fmt(bonesScore)} DPS`);
    console.log(`White total tooltip score: ${fmt(whiteScore)} DPS`);

    const okWeapon = bonesVsZero >= 140 && bonesVsZero <= 240;
    const okTotal = bonesScore >= 180 && bonesScore <= 240;
    const notWhiteOnly = bonesVsZero > 100;

    if (!notWhiteOnly) {
        console.error(`FAIL: weapon add ${fmt(bonesVsZero)} looks white-only (~55–80)`);
        process.exit(1);
    }
    if (!okWeapon) {
        console.error(`FAIL: weapon add ${fmt(bonesVsZero)} outside 140–240`);
        process.exit(1);
    }
    if (!okTotal) {
        console.error(`FAIL: total score ${fmt(bonesScore)} outside 180–240`);
        process.exit(1);
    }

    console.log('PASS: Boneshatter tooltip DPS in expected range (~200)');
}

run();
