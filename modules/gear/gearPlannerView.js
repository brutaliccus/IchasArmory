// modules/gear/gearPlannerView.js — Gear Planner page UI

import {
    GEAR_PLAN_SLOTS,
    createEmptyGearPlan,
    getGearPlanData,
    saveGearPlannerSession,
    loadGearPlannerSession,
    loadLocalGearPlans,
    saveLocalGearPlans,
    applyGearPlanItemMove,
    saveGearPlannerTankStatWeights,
    getGearPlannerTankStatWeights,
    saveGearPlannerDpsStatWeights,
    getGearPlannerDpsStatWeights,
    normalizeGearPlanRoles,
    defaultIconForClassSpec,
    sanitizeGearPlanDescription,
    sanitizeGearPlanName,
    formatGearPlanRoleLabel,
    GEAR_PLAN_DESCRIPTION_MAX,
    GEAR_PLAN_NAME_MAX,
} from './gearPlanner.js';
import { getEmptySlotPlaceholderUrl, getMeleeWeaponType, getEnchantableSlots, resolveIconUrl } from './gear.js';
import { enchantDatabase } from './enchants.js';
import { getEnchantCompactLabel } from './enchantStatLabels.js';
import { STAT_TEMPLATE, KEY_MAP, parseStatsFromTooltip, getItemType, filterEnchantsByItemType } from '../character/stats.js';
import { baseStats, raceIconData, getSelectedRaceBonuses } from '../character/races.js';
import { calculateEffectiveHealth } from '../ui/calculator.js';
import { generateTalentInputs, updateTalentPoints, updateAllTalentStates, getTalentBonusesFromSpec, classTalents } from '../talents_new.js';
import { generateBuffIcons, applyBuffListToDom, getBuffsFromSavedList, handleBuffExclusivity } from '../character/buffs.js';
import { getSetBonuses } from './setBonuses.js';
import { runGearPlanQuickSim, runGearPlanStatWeightSimulations, mergeStatWeightsToTemplate, updateStatWeightsTable, sortStatWeightsTable, openDpsSimConfigModal, prepareDpsSimConfigForGearPlanner } from '../shaman/dps.js';
import { runTankSimulation, getBossDatabase } from '../tank/tankSimulator.js';
import { createItemTooltipHTML, createEnchantTooltipHTML, calculateItemDpsScore, calculateItemTankScore, formatItemTankScoreBadge } from '../ui/tooltips.js';
import { positionItemTooltipOnIcon } from '../ui/itemTooltipPosition.js';
import {
    ensureItemSourcesLoaded,
    getPreferredSourcesForItem,
    formatItemSourceLine,
    getInstanceFilterGroups,
} from './itemSources.js';
import { itemLoader } from './itemLoader.js';
import { SHAMAN_PRESET_SPEC_ICONS } from '../shaman/shamanConsumePresets.js';
import { SHAMAN_TALENT_PRESETS, SHAMAN_TALENT_PRESET_NAMES } from '../shaman/shamanTalentPresets.js';

/** Manual DPS weight keys used by item score tooltips. */
const GP_MANUAL_DPS_WEIGHT_KEYS = [
    { key: 'ap', label: 'Attack Power' },
    { key: 'str', label: 'Strength' },
    { key: 'agi', label: 'Agility' },
    { key: 'int', label: 'Intellect' },
    { key: 'physCrit', label: 'Phys Crit %' },
    { key: 'physHit', label: 'Phys Hit %' },
    { key: 'haste', label: 'Haste %' },
    { key: 'sp', label: 'Spell Power' },
    { key: 'spellCrit', label: 'Spell Crit %' },
    { key: 'spellHit', label: 'Spell Hit %' },
    { key: 'arp', label: 'Armor Pen' },
    { key: 'wepSkill', label: 'Weapon Skill' },
];

const GP_TANK_CAPABLE = new Set(['warrior', 'paladin', 'druid', 'shaman']);

/** Track user-picked icon in save dialog (never overwrite with spec default). */
let saveIconUserPicked = false;
let saveDialogSpecBaseline = '';

function specsForClass(classId) {
    const trees = classTalents[String(classId || '').toLowerCase()];
    if (!trees) return [];
    return Object.values(trees).map((t) => ({ name: t.name, icon: t.icon }));
}

const LEFT_SLOTS = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'mainhand', 'offhand'];
const RIGHT_SLOTS = ['hands', 'waist', 'legs', 'feet', 'ring1', 'ring2', 'trinket1', 'trinket2', 'ranged'];

const SLOT_LABELS = {
    head: 'Head',
    neck: 'Neck',
    shoulder: 'Shoulder',
    back: 'Back',
    chest: 'Chest',
    wrist: 'Wrist',
    hands: 'Hands',
    waist: 'Waist',
    legs: 'Legs',
    feet: 'Feet',
    ring1: 'Finger 1',
    ring2: 'Finger 2',
    trinket1: 'Trinket 1',
    trinket2: 'Trinket 2',
    mainhand: 'Main Hand',
    offhand: 'Off Hand',
    ranged: 'Ranged',
};

const classIconData = {
    warrior: { name: 'Warrior', icon: 'assets/icons/classicon_warrior.jpg' },
    paladin: { name: 'Paladin', icon: 'assets/icons/classicon_paladin.jpg' },
    hunter: { name: 'Hunter', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_weapon_bow_07.jpg' },
    rogue: { name: 'Rogue', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_throwingknife_04.jpg' },
    priest: { name: 'Priest', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_staff_30.jpg' },
    shaman: { name: 'Shaman', icon: 'assets/icons/Spell_Nature_BloodLust.png' },
    mage: { name: 'Mage', icon: 'https://wow.zamimg.com/images/wow/icons/large/inv_staff_13.jpg' },
    warlock: { name: 'Warlock', icon: 'https://wow.zamimg.com/images/wow/icons/large/spell_nature_drowsy.jpg' },
    druid: { name: 'Druid', icon: 'assets/icons/classicon_druid.jpg' },
};

const SIM_HINT_DISMISS_KEY = 'ichacalc_gp_sim_hint_dismissed';

let currentPlan = createEmptyGearPlan();
let callbacks = {};
let editingAltSlot = null;
let pickCallback = null;
let editMode = true;
let gpDidDrag = false;
let gpOverlay = null;
let characterTalentSnapshot = null;
let characterBuffSnapshot = null;
let buffsListHome = null;
let consumeToolsHome = null;
let gpQuickSimRunning = false;

const GP_ICON_TALENTS = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"></rect><rect x="14" y="3" width="7" height="7" rx="1"></rect><rect x="3" y="14" width="7" height="7" rx="1"></rect><rect x="14" y="14" width="7" height="7" rx="1"></rect></svg>`;
const GP_ICON_BUFFS = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 2v7.31L4.21 20.39A1 1 0 0 0 5.08 22h13.84a1 1 0 0 0 .87-1.61L14 9.31V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/></svg>`;
const GP_ICON_WEIGHTS = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M28.396 24.92c4.349-5.985 3.826-14.41-1.571-19.807-5.507-5.507-14.165-5.94-20.168-1.302-0.869-1.018-1.71-2.033-2.463-2.995l-3.227 3.227c0.962 0.745 1.983 1.57 3.008 2.423-4.743 6.008-4.343 14.748 1.203 20.293 5.379 5.379 13.765 5.917 19.746 1.615l1.274 1.274 4.826 1.202-1.362-4.665-1.266-1.266zM20.631 17.154l-7.288-7.288 2.729-2.729-1.99-1.99c5.647-0.282 10.325 6.479 6.549 12.006zM13.949 5.155l-3.241 3.242c-0.394-0.436-0.802-0.889-1.219-1.355 1.461-1.204 2.991-1.784 4.461-1.886zM7.315 9.315c0.453 0.395 0.894 0.784 1.317 1.159l-3.367 3.368 2.052 2.052 2.563-2.564 14.952 14.952c-11.952 8.045-27.183-6.773-17.517-18.967z"/></svg>`;
/** Thumbs-up / thumbs-down (SVG Repo 513857 / 513858 style, filled hand). */
const GP_ICON_VOTE_UP = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.71V10c0-.55-.45-1-1-1h-4V3c0-1.1-.9-2-2-2s-2 .9-2 2v7H5c-.55 0-1 .45-1 1v8c0 .55.45 1 1 1z"/></svg>`;
const GP_ICON_VOTE_DOWN = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.71V12c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23 16.41 16.41c.37-.36.59-.86.59-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/></svg>`;
const GP_TANK_WEIGHT_CLASSES = new Set(['warrior', 'paladin', 'druid']);
/** Classes that can meaningfully tank and DPS — show both stat-weight panels. */
const GP_DUAL_ROLE_CLASSES = new Set(['warrior', 'paladin', 'druid', 'shaman']);
const GP_ICON_HOME = `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true"><path d="M25,21.5c0,-0.319 -0.152,-0.619 -0.409,-0.807c-0.258,-0.188 -0.589,-0.243 -0.893,-0.146l-7.698,2.44c-0,0 -7.698,-2.44 -7.698,-2.44c-0.304,-0.097 -0.635,-0.042 -0.893,0.146c-0.257,0.188 -0.409,0.488 -0.409,0.807l0,6c0,0.552 0.448,1 1,1l16,0c0.552,0 1,-0.448 1,-1l0,-6Zm-2,1.366l0,3.634l-14,0c0,-0 0,-3.634 0,-3.634c0,0 6.698,2.123 6.698,2.123c0.196,0.063 0.408,0.063 0.604,0l6.698,-2.123Zm-2.002,-14.31c0.02,-0.341 -0.137,-0.668 -0.414,-0.868c-0.278,-0.199 -0.638,-0.243 -0.955,-0.116l-2.5,1c-0.38,0.151 -0.629,0.519 -0.629,0.928l0,11c0,0.317 0.151,0.616 0.406,0.804c0.255,0.189 0.585,0.245 0.888,0.152l6.5,-2c0.42,-0.129 0.706,-0.517 0.706,-0.956l0,-6c0,-0.552 -0.448,-1 -1,-1c-0.892,0 -1.663,-0.246 -2.203,-0.739c-0.516,-0.472 -0.797,-1.166 -0.797,-2.02c0,-0.062 -0.005,-0.124 -0.002,-0.185Zm-8.627,-0.984c-0.317,-0.127 -0.677,-0.083 -0.955,0.116c-0.277,0.2 -0.434,0.527 -0.414,0.868c0.003,0.061 -0.002,0.123 -0.002,0.185c0,0.854 -0.281,1.548 -0.797,2.02c-0.54,0.493 -1.311,0.739 -2.203,0.739c-0.552,0 -1,0.448 -1,1l0,6c0,0.439 0.286,0.827 0.706,0.956l6.5,2c0.303,0.093 0.633,0.037 0.888,-0.152c0.255,-0.188 0.406,-0.487 0.406,-0.804l0,-11c0,-0.409 -0.249,-0.777 -0.629,-0.928l-2.5,-1Zm6.756,2.354c0.21,0.942 0.675,1.72 1.32,2.31c0.666,0.609 1.537,1.023 2.553,1.186c0,0 0,4.339 0,4.339c0,0 -4.5,1.385 -4.5,1.385c0,0 0,-8.969 0,-8.969l0.627,-0.251Zm-6.254,0l0.627,0.251c0,0 0,8.969 0,8.969c-0,0 -4.5,-1.385 -4.5,-1.385c0,0 0,-4.339 0,-4.339c1.016,-0.163 1.887,-0.577 2.553,-1.186c0.645,-0.59 1.11,-1.368 1.32,-2.31Zm-1.892,-5.23c0.058,-0.294 -0.018,-0.598 -0.208,-0.83c-0.19,-0.232 -0.473,-0.366 -0.773,-0.366c-1.611,0 -3.965,1.17 -5.569,2.638c-1.191,1.089 -1.931,2.354 -1.931,3.362c0,0.552 0.448,1 1,1l5.5,0l0.981,-0.804l1,-5Zm11.019,-1.196c-0.3,0 -0.583,0.134 -0.773,0.366c-0.19,0.232 -0.266,0.536 -0.208,0.83l1,5l0.981,0.804l5.5,0c0.552,0 1,-0.448 1,-1c-0,-1.008 -0.74,-2.273 -1.931,-3.362c-1.604,-1.468 -3.958,-2.638 -5.569,-2.638Zm-13.82,5l-3.216,0c0.222,-0.299 0.501,-0.598 0.816,-0.886c0.847,-0.775 1.944,-1.485 2.948,-1.852l-0.548,2.738Zm15.64,0l-0.548,-2.738c1.004,0.367 2.101,1.078 2.948,1.852c0.315,0.288 0.594,0.587 0.816,0.886l-3.216,0Z"/></svg>`;

function planRoles() {
    return normalizeGearPlanRoles(currentPlan?.role);
}

function showTankWeightsUi() {
    const cls = String(currentPlan?.class || '').toLowerCase();
    if (!GP_TANK_CAPABLE.has(cls)) return false;
    if (GP_DUAL_ROLE_CLASSES.has(cls)) return true;
    const roles = planRoles();
    if (roles.includes('tank')) return true;
    // Pre-save fallback: classic tanks still see tank SW before role is set
    return !roles.length && GP_TANK_WEIGHT_CLASSES.has(cls);
}

function showDpsWeightsUi() {
    const cls = String(currentPlan?.class || '').toLowerCase();
    if (GP_DUAL_ROLE_CLASSES.has(cls)) return true;
    const roles = planRoles();
    if (roles.includes('dps')) return true;
    return !roles.length && cls === 'shaman';
}

function gpLocalWeightsStorageKey(planId = currentPlan?.id) {
    return `ichacalc_gp_local_weights_${planId || 'session'}`;
}

function readLocalWeightDraft() {
    try {
        const raw = localStorage.getItem(gpLocalWeightsStorageKey());
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

function writeLocalWeightDraft( partial ) {
    try {
        const prev = readLocalWeightDraft() || {};
        localStorage.setItem(gpLocalWeightsStorageKey(), JSON.stringify({ ...prev, ...partial, updatedAt: Date.now() }));
    } catch (e) {
        console.warn('[Gear Planner] local weight draft save failed', e);
    }
}

/** Resolve DPS weights: local draft → plan.statWeights → GP localStorage. */
function resolveGpDpsWeights(isAoe = false) {
    const draft = readLocalWeightDraft();
    const draftKey = isAoe ? 'statWeightsAoe' : 'statWeights';
    if (Array.isArray(draft?.[draftKey]) && draft[draftKey].length) return draft[draftKey];
    const planKey = isAoe ? 'statWeightsAoe' : 'statWeights';
    const fromPlan = currentPlan?.[planKey] || currentPlan?.ui?.[planKey];
    if (Array.isArray(fromPlan) && fromPlan.length) return fromPlan;
    return getGearPlannerDpsStatWeights(isAoe);
}

function resolveGpTankWeights() {
    const draft = readLocalWeightDraft();
    if (draft?.tankStatWeights && typeof draft.tankStatWeights === 'object') return draft.tankStatWeights;
    const fromPlan = currentPlan?.tankStatWeights || currentPlan?.ui?.tankStatWeights;
    if (fromPlan && typeof fromPlan === 'object') return fromPlan;
    return getGearPlannerTankStatWeights();
}

function hasMeaningfulDpsWeights(weights) {
    if (!Array.isArray(weights) || !weights.length) return false;
    return weights.some((w) => typeof w.statDps === 'number' && Math.abs(w.statDps) > 1e-9);
}

function hasMeaningfulTankWeights(sw) {
    if (!sw || typeof sw !== 'object') return false;
    return ['stamina1EHP', 'armor1EHP', 'defense1EHP', 'avoidance1PercentEHP', 'blockValue1EHP', 'blockChance1PercentEHP']
        .some((k) => Number(sw[k]) > 0);
}

function installGpWeightResolvers() {
    if (typeof window === 'undefined') return;
    window.getGearPlannerDpsStatWeights = (isAoe = false) => resolveGpDpsWeights(isAoe);
    window.getGearPlannerTankStatWeights = () => resolveGpTankWeights();
}

export function initGearPlannerView(cbs) {
    callbacks = cbs || {};
    installGpWeightResolvers();
    const session = loadGearPlannerSession();
    if (session?.plan) {
        currentPlan = getGearPlanData(session.plan);
        // Restore vote/community fields not in schema clone
        if (session.plan.upvotes != null) currentPlan.upvotes = session.plan.upvotes;
        if (session.plan.downvotes != null) currentPlan.downvotes = session.plan.downvotes;
        if (session.plan.myVote) currentPlan.myVote = session.plan.myVote;
        if (session.plan.sourceCommunityId) currentPlan.sourceCommunityId = String(session.plan.sourceCommunityId);
        if (session.plan.community) currentPlan.community = true;
        if (session.plan.authorId) currentPlan.authorId = String(session.plan.authorId);
        if (session.plan.authorName) currentPlan.authorName = String(session.plan.authorName);
        if (session.plan.statWeights) currentPlan.statWeights = session.plan.statWeights;
        if (session.plan.statWeightsAoe) currentPlan.statWeightsAoe = session.plan.statWeightsAoe;
        if (session.plan.tankStatWeights) currentPlan.tankStatWeights = session.plan.tankStatWeights;
        if (typeof session.editMode === 'boolean') {
            editMode = session.editMode;
        } else {
            editMode = !currentPlan.id;
        }
    } else {
        editMode = true;
    }
    ensurePlanRace();
    if (!currentPlan.talents) currentPlan.talents = {};
    if (!currentPlan.buffs) currentPlan.buffs = [];
    ensurePlanStRotation();
    wireHeaderControls();
    wireClassDrawer();
    wireRaceDrawer();
    wireBuffsView();
    wireSaveOverwriteDialog();
    wireCommunitySearchDialog();
    wireIconPickerDialog();
    wireHeaderVotes();
    wireGpTalentPresetMenu();
    wireGpTalentSync();
    wireGpConsumeToolsSync();
    wireGpTankBossSearch();
    wireGpSimConfigButton();
    refreshGearPlannerWhenItemsReady();
    hydrateCommunityVoteMeta();
}

/**
 * Slot JSON files needed so getItemById resolves plan primaries/alts.
 * Offhand may hold 1H weapons that only exist in mainhand.json.
 */
function slotsNeededForPlan(plan) {
    const needed = new Set();
    for (const slotId of GEAR_PLAN_SLOTS) {
        const slot = plan?.slots?.[slotId];
        if (!slot) continue;
        const hasItems = slot.primary != null || (slot.alternatives?.length > 0);
        if (!hasItems) continue;
        needed.add(slotId);
        if (slotId === 'offhand') needed.add('mainhand');
    }
    return [...needed];
}

/** Await loot sources + itemLoader caches for occupied plan slots. */
export async function ensureGearPlanItemsReady(plan = currentPlan) {
    const slots = slotsNeededForPlan(plan);
    await Promise.all([
        ensureItemSourcesLoaded(),
        ...slots.map((slotId) => itemLoader.loadSlot(slotId)),
    ]);
}

let itemsReadyToken = 0;

/** Load plan item data then render (locations + modified stats included). */
function refreshGearPlannerWhenItemsReady(plan = currentPlan) {
    const token = ++itemsReadyToken;
    return ensureGearPlanItemsReady(plan)
        .then(() => {
            if (token !== itemsReadyToken) return;
            renderGearPlanner();
        })
        .catch((err) => {
            console.error('[Gear Planner] Item preload failed', err);
            if (token === itemsReadyToken) renderGearPlanner();
        });
}

export function getCurrentGearPlan() {
    return getGearPlanData(currentPlan);
}

export function setGearPlan(plan) {
    if (gpOverlay) closeGpTalentsModal();
    currentPlan = getGearPlanData(plan);
    mergePlanCommunityFields(currentPlan, plan);
    currentPlan.name = sanitizeGearPlanName(currentPlan.name, 'Gear Plan');
    editMode = !currentPlan.id;
    persistSession();
    hydrateCommunityVoteMeta();
    return refreshGearPlannerWhenItemsReady(currentPlan);
}

export function handleGearPlanItemSelected(item) {
    if (!editMode || !pickCallback || !item?.id) return;
    pickCallback(item);
    pickCallback = null;
    editingAltSlot = null;
}

export function handleGearPlanEnchantSelected(slotId, enchantIndex) {
    if (!slotId || !currentPlan.slots[slotId]) return;
    const idx = parseInt(enchantIndex, 10);
    const enchant = enchantDatabase[slotId]?.[idx];
    currentPlan.slots[slotId].enchant = (!enchant || enchant.name === 'None' || !Number.isInteger(idx) || idx < 0) ? null : idx;
    persistSession();
    renderGearPlanner();
}

function persistSession() {
    saveGearPlannerSession({
        plan: getGearPlanData(currentPlan),
        editMode,
        timestamp: Date.now(),
    });
}

function syncGpPlanNameInputWidth(input = document.getElementById('gp-plan-name')) {
    const sizer = input?.closest('.gp-plan-name-wrap')?.querySelector('.gp-plan-name-sizer');
    if (!input || !sizer) return;
    const text = input.value || input.placeholder || '';
    sizer.textContent = text || '\u00a0';
}

function wireHeaderControls() {
    const nameInput = document.getElementById('gp-plan-name');
    if (nameInput) {
        nameInput.setAttribute('maxlength', String(GEAR_PLAN_NAME_MAX));
        const commitName = () => {
            const next = sanitizeGearPlanName(nameInput.value, 'Gear Plan');
            nameInput.value = next;
            syncGpPlanNameInputWidth(nameInput);
            currentPlan.name = next;
            persistSession();
        };
        nameInput.addEventListener('input', () => {
            if (nameInput.value.length > GEAR_PLAN_NAME_MAX) {
                nameInput.value = nameInput.value.slice(0, GEAR_PLAN_NAME_MAX);
            }
            syncGpPlanNameInputWidth(nameInput);
        });
        nameInput.addEventListener('change', commitName);
        nameInput.addEventListener('blur', commitName);
        syncGpPlanNameInputWidth(nameInput);
    }

    document.getElementById('gp-save-btn')?.addEventListener('click', () => requestSaveCurrentPlan());
    document.getElementById('gp-talents-btn')?.addEventListener('click', () => toggleGpTalentsView());
    document.getElementById('gp-buffs-btn')?.addEventListener('click', () => toggleGpBuffsView());
    document.getElementById('gp-stat-weights-btn')?.addEventListener('click', () => toggleGpStatWeightsView());
    document.getElementById('gp-generate-tank-weights-btn')?.addEventListener('click', () => generateGpTankStatWeights());
    document.getElementById('gp-edit-mode-btn')?.addEventListener('click', () => {
        editMode = !editMode;
        persistSession();
        renderGearPlanner();
    });
    document.getElementById('gp-load-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openLoadDropdown();
    });
    document.getElementById('gp-community-search-btn')?.addEventListener('click', () => openCommunitySearchDialog());
    document.getElementById('gp-share-btn')?.addEventListener('click', () => shareCurrentPlan());
    document.getElementById('gp-quick-sim-btn')?.addEventListener('click', () => runQuickSim());
    document.getElementById('gp-st-rotation-row')?.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-gp-st-rot]');
        if (!btn) return;
        const mode = btn.dataset.gpStRot === 'eleSt' ? 'eleSt' : 'enhSt';
        ensurePlanStRotation();
        currentPlan.ui.stRotation = mode;
        persistSession();
        syncGpStRotationUi();
    });
    document.getElementById('gp-sim-hint-dismiss')?.addEventListener('click', (e) => {
        e.stopPropagation();
        try { localStorage.setItem(SIM_HINT_DISMISS_KEY, '1'); } catch { /* ignore */ }
        updateQuickSimVisibility();
    });
}

function openGpSimConfigModal() {
    if (!prepareDpsSimConfigForGearPlanner()) {
        console.warn('[Gear Planner] DPS sim config modal bootstrap failed');
    }
    if (!openDpsSimConfigModal()) {
        console.warn('[Gear Planner] Could not open DPS sim settings modal');
        window.notify?.error?.('Could not open simulation settings', 4000, 'Gear Planner');
        return false;
    }
    return true;
}

function wireGpSimConfigButton() {
    const btn = document.getElementById('gp-sim-settings-btn');
    if (!btn || btn.dataset.gpSimConfigWired === '1') return;
    btn.dataset.gpSimConfigWired = '1';
    btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled || btn.hidden) return;
        openGpSimConfigModal();
    });
    if (String(currentPlan?.class || '').toLowerCase() === 'shaman') {
        prepareDpsSimConfigForGearPlanner();
    }
}

function closeGpClassDrawer() {
    const drawer = document.getElementById('gp-cr-drawer-class');
    const toggle = document.getElementById('gp-class-drawer-toggle');
    drawer?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
}

function wireClassDrawer() {
    const toggle = document.getElementById('gp-class-drawer-toggle');
    const drawer = document.getElementById('gp-cr-drawer-class');
    const sidebar = document.getElementById('gp-class-sidebar');
    if (!toggle || !drawer) return;

    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = drawer.classList.contains('is-open');
        if (open) {
            closeGpClassDrawer();
        } else {
            closeGpRaceDrawer();
            generateGpClassIcons();
            drawer.classList.add('is-open');
            toggle.setAttribute('aria-expanded', 'true');
        }
    });

    document.addEventListener('click', (e) => {
        if (sidebar && !sidebar.contains(e.target)) {
            closeGpClassDrawer();
            closeGpRaceDrawer();
        }
    });

    generateGpClassIcons();
}

function generateGpClassIcons() {
    const container = document.getElementById('gp-class-selector');
    const sidebar = document.getElementById('gp-class-sidebar');
    if (!container || !sidebar) return;

    const selected = currentPlan.class || 'warrior';
    sidebar.dataset.selectedClass = selected;
    syncGpClassToggle();

    const sortedIds = Object.keys(classIconData)
        .sort((a, b) => classIconData[a].name.localeCompare(classIconData[b].name))
        .filter(id => id !== selected);

    container.innerHTML = sortedIds.map(classId => {
        const data = classIconData[classId];
        return `<div class="class-icon gp-class-icon" data-class-id="${classId}" data-class-name="${data.name}">
            <img src="${data.icon}" alt="${data.name}">
        </div>`;
    }).join('');

    container.querySelectorAll('.gp-class-icon').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            currentPlan.class = el.dataset.classId;
            sidebar.dataset.selectedClass = el.dataset.classId;
            currentPlan.talents = {};
            ensurePlanRace(true);
            persistSession();
            updateQuickSimVisibility();
            updateStatWeightsBtnVisibility();
            if (currentPlan.class === 'shaman') prepareDpsSimConfigForGearPlanner();
            closeGpClassDrawer();
            renderGearPlanner();
            if (gpOverlay === 'talents') {
                const host = document.getElementById('gp-talents-host');
                if (host) {
                    generateTalentInputs(host, currentPlan.class || 'warrior');
                    fitGpTalentTree();
                }
                syncGpTalentPresetTools();
            }
            if (gpOverlay === 'buffs') refreshGpBuffsHost();
            if (gpOverlay === 'weights') renderGpStatWeightsPanels();
        });
    });
}

function syncGpClassToggle() {
    const img = document.getElementById('gp-class-drawer-toggle-img');
    const cls = currentPlan.class || 'warrior';
    const data = classIconData[cls];
    if (img && data) {
        img.src = data.icon;
        img.alt = data.name;
    }
}

function racesForGpClass(classId) {
    const available = Object.keys(baseStats[classId] || {}).filter(key => raceIconData[key]);
    available.sort((a, b) => raceIconData[a].name.localeCompare(raceIconData[b].name, undefined, { sensitivity: 'base' }));
    return available;
}

function ensurePlanRace(forceIfInvalid = false) {
    const cls = currentPlan.class || 'warrior';
    const races = racesForGpClass(cls);
    const fallback = races[0] || 'human';
    if (!currentPlan.race || forceIfInvalid || !races.includes(currentPlan.race)) {
        currentPlan.race = races.includes(currentPlan.race) ? currentPlan.race : fallback;
    }
}

function closeGpRaceDrawer() {
    const drawer = document.getElementById('gp-cr-drawer-race');
    const toggle = document.getElementById('gp-race-drawer-toggle');
    drawer?.classList.remove('is-open');
    toggle?.setAttribute('aria-expanded', 'false');
}

function wireRaceDrawer() {
    const toggle = document.getElementById('gp-race-drawer-toggle');
    const drawer = document.getElementById('gp-cr-drawer-race');
    if (!toggle || !drawer) return;
    toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const open = !drawer.classList.contains('is-open');
        closeGpClassDrawer();
        drawer.classList.toggle('is-open', open);
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
        if (open) generateGpRaceIcons();
    });
}

function generateGpRaceIcons() {
    const container = document.getElementById('gp-race-selector');
    const sidebar = document.getElementById('gp-class-sidebar');
    if (!container || !sidebar) return;
    ensurePlanRace();
    const selected = currentPlan.race;
    sidebar.dataset.selectedRace = selected;
    syncGpRaceToggle();
    const listIds = racesForGpClass(currentPlan.class || 'warrior').filter(id => id !== selected);
    container.innerHTML = listIds.map(raceId => {
        const data = raceIconData[raceId];
        return `<div class="race-icon gp-race-icon" data-race-id="${raceId}" data-race-name="${data.name}">
            <img src="${data.icon}" alt="${data.name}">
        </div>`;
    }).join('');
    container.querySelectorAll('.gp-race-icon').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            currentPlan.race = el.dataset.raceId;
            sidebar.dataset.selectedRace = el.dataset.raceId;
            persistSession();
            closeGpRaceDrawer();
            renderGearPlanner();
        });
    });
}

function syncGpRaceToggle() {
    const img = document.getElementById('gp-race-drawer-toggle-img');
    const race = currentPlan.race || 'human';
    const data = raceIconData[race];
    if (img && data) {
        img.src = data.icon;
        img.alt = data.name;
    }
}

function serializeTalentSpec(root) {
    const spec = {};
    root?.querySelectorAll('.talent-icon-container').forEach(el => {
        const points = parseInt(el.dataset.points, 10) || 0;
        if (points <= 0) return;
        const key = el.dataset.tree ? `${el.dataset.tree}-${el.dataset.talentId}` : el.dataset.talentId;
        if (key) spec[key] = points;
    });
    return spec;
}

async function applyTalentSpec(root, spec) {
    if (!root || !spec) return;
    for (const [key, points] of Object.entries(spec)) {
        let tree, talentId;
        if (key.includes('-')) [tree, talentId] = key.split('-');
        else talentId = key;
        const selector = tree
            ? `.talent-icon-container[data-tree="${tree}"][data-talent-id="${talentId}"]`
            : `.talent-icon-container[data-talent-id="${talentId}"]`;
        const talentEl = root.querySelector(selector);
        if (talentEl) updateTalentPoints(talentEl, points);
    }
}

function snapshotCharacterTalents() {
    const list = document.getElementById('talents-list');
    const classId = document.getElementById('class-race-sidebar')?.dataset?.selectedClass || 'warrior';
    return { classId, spec: serializeTalentSpec(list) };
}

async function restoreCharacterTalents(snap) {
    const list = document.getElementById('talents-list');
    if (!list || !snap) return;
    generateTalentInputs(list, snap.classId);
    await applyTalentSpec(list, snap.spec);
}

/** Sync talents/buffs from open GP overlay views into currentPlan (no view teardown). */
function flushGpOverlayStateToPlan({ persist = true } = {}) {
    const talentHost = document.getElementById('gp-talents-host');
    const buffList = document.getElementById('buffs-list');
    let changed = false;
    if (gpOverlay === 'talents' && talentHost) {
        currentPlan.talents = serializeTalentSpec(talentHost);
        changed = true;
    }
    if (gpOverlay === 'buffs' && buffList) {
        currentPlan.buffs = serializeBuffSpec(buffList);
        changed = true;
    }
    if (changed && persist) persistSession();
    return changed;
}

function syncGpBuffsFromDom() {
    if (gpOverlay !== 'buffs') return;
    const list = document.getElementById('buffs-list');
    if (!list) return;
    currentPlan.buffs = serializeBuffSpec(list);
    persistSession();
    renderStatsSidebar();
}

function syncGpTalentsFromDom() {
    if (gpOverlay !== 'talents') return;
    const host = document.getElementById('gp-talents-host');
    if (!host) return;
    currentPlan.talents = serializeTalentSpec(host);
    persistSession();
    renderStatsSidebar();
}

function serializeBuffSpec(root) {
    const spec = [];
    root?.querySelectorAll('.buff-icon.active').forEach(el => {
        if (!el.id) return;
        spec.push({ id: el.id, improved: el.classList.contains('is-improved') });
    });
    return spec;
}

function snapshotCharacterBuffs() {
    const list = document.getElementById('buffs-list');
    const classId = document.getElementById('class-race-sidebar')?.dataset?.selectedClass || 'warrior';
    return { classId, spec: serializeBuffSpec(list) };
}

async function restoreCharacterBuffs(snap) {
    const list = document.getElementById('buffs-list');
    if (!list || !snap) return;
    await generateBuffIcons(list, snap.classId);
    applyBuffListToDom(snap.spec, list);
}

function setHeaderBtnIcon(btn, svg, title) {
    if (!btn) return;
    btn.innerHTML = svg;
    btn.title = title;
    btn.setAttribute('aria-label', title);
}

function syncGpTalentsTitle() {
    const title = document.getElementById('gp-talents-title');
    if (!title) return;
    const cls = getGpClassId();
    const label = classIconData[cls]?.name || (cls.charAt(0).toUpperCase() + cls.slice(1));
    title.textContent = label;
    title.hidden = gpOverlay !== 'talents';
}

function syncGpOverlayUi() {
    const shell = document.getElementById('gear-planner-shell');
    const talentsView = document.getElementById('gp-talents-view');
    const buffsView = document.getElementById('gp-buffs-view');
    const weightsView = document.getElementById('gp-stat-weights-view');
    const talentsBtn = document.getElementById('gp-talents-btn');
    const buffsBtn = document.getElementById('gp-buffs-btn');
    const weightsBtn = document.getElementById('gp-stat-weights-btn');
    const talentsOpen = gpOverlay === 'talents';
    const buffsOpen = gpOverlay === 'buffs';
    const weightsOpen = gpOverlay === 'weights';
    shell?.classList.toggle('gp-talents-open', talentsOpen);
    shell?.classList.toggle('gp-buffs-open', buffsOpen);
    shell?.classList.toggle('gp-stat-weights-open', weightsOpen);
    document.body.classList.toggle('gp-talents-open', talentsOpen);
    document.body.classList.toggle('gp-buffs-open', buffsOpen);
    document.body.classList.toggle('gp-stat-weights-open', weightsOpen);
    if (talentsView) talentsView.hidden = !talentsOpen;
    if (buffsView) buffsView.hidden = !buffsOpen;
    if (weightsView) weightsView.hidden = !weightsOpen;
    talentsBtn?.setAttribute('aria-pressed', talentsOpen ? 'true' : 'false');
    talentsBtn?.classList.toggle('is-active', talentsOpen);
    buffsBtn?.setAttribute('aria-pressed', buffsOpen ? 'true' : 'false');
    buffsBtn?.classList.toggle('is-active', buffsOpen);
    weightsBtn?.setAttribute('aria-pressed', weightsOpen ? 'true' : 'false');
    weightsBtn?.classList.toggle('is-active', weightsOpen);
    setHeaderBtnIcon(talentsBtn, talentsOpen ? GP_ICON_HOME : GP_ICON_TALENTS, talentsOpen ? 'Gear Planner' : 'Talents');
    setHeaderBtnIcon(buffsBtn, buffsOpen ? GP_ICON_HOME : GP_ICON_BUFFS, buffsOpen ? 'Gear Planner' : 'Buffs & consumables');
    setHeaderBtnIcon(weightsBtn, weightsOpen ? GP_ICON_HOME : GP_ICON_WEIGHTS, weightsOpen ? 'Gear Planner' : 'Stat weights');
    syncGpTalentsTitle();
}

let gpTalentFitObserver = null;
let gpTalentFitLock = false;
let gpTalentLastScale = 0;

function onGpTalentHostResize() {
    gpTalentLastScale = 0;
    fitGpTalentTree();
}

function unbindGpTalentFit() {
    gpTalentFitObserver?.disconnect();
    gpTalentFitObserver = null;
    gpTalentLastScale = 0;
    window.removeEventListener('resize', onGpTalentHostResize);
}

function fitGpTalentTree() {
    const host = document.getElementById('gp-talents-host');
    const tree = host?.querySelector('.talent-main-container') || host?.querySelector('.talent-trees-wrapper');
    if (!host || !tree || gpOverlay !== 'talents' || gpTalentFitLock) return;

    tree.style.transform = 'none';
    tree.style.marginBottom = '0';
    tree.style.width = '';

    const treeW = Math.max(tree.scrollWidth, tree.offsetWidth, 1);
    const treeH = Math.max(tree.scrollHeight, tree.offsetHeight, 1);
    const boxW = Math.max(host.clientWidth, 1);
    const boxH = Math.max(host.clientHeight, 1);
    const scale = Math.min(boxW / treeW, boxH / treeH);
    if (!Number.isFinite(scale) || scale <= 0) return;
    if (Math.abs(scale - gpTalentLastScale) < 0.002) return;

    gpTalentFitLock = true;
    gpTalentLastScale = scale;
    tree.style.transformOrigin = 'top center';
    tree.style.transform = `scale(${scale})`;
    tree.style.width = `${treeW}px`;
    tree.style.margin = `0 auto ${Math.round(treeH * (scale - 1))}px`;
    gpTalentFitLock = false;

    if (!gpTalentFitObserver) {
        const view = document.getElementById('gp-talents-view');
        gpTalentFitObserver = new ResizeObserver(() => {
            window.requestAnimationFrame(onGpTalentHostResize);
        });
        if (view) gpTalentFitObserver.observe(view);
        window.addEventListener('resize', onGpTalentHostResize);
    }
}

function wireBuffsView() {
    document.getElementById('gp-buffs-view')?.addEventListener('click', (event) => {
        if (gpOverlay !== 'buffs') return;
        const list = document.getElementById('buffs-list');
        const upgradeToggle = event.target.closest('.buff-upgrade-toggle');
        const buffIcon = event.target.closest('.buff-icon');
        if (buffIcon && list?.contains(buffIcon)) {
            if (upgradeToggle) {
                event.stopPropagation();
                buffIcon.classList.toggle('is-improved');
            } else {
                const wasActive = buffIcon.classList.contains('active');
                buffIcon.classList.toggle('active');
                if (!wasActive && buffIcon.classList.contains('active')) {
                    handleBuffExclusivity(buffIcon.id);
                }
                if (!buffIcon.classList.contains('active')) {
                    buffIcon.classList.remove('is-improved');
                }
            }
        }
        syncGpBuffsFromDom();
    });
}

function wireGpConsumeToolsSync() {
    const view = document.getElementById('gp-buffs-view');
    if (!view || view.dataset.consumeSyncWired === '1') return;
    view.dataset.consumeSyncWired = '1';
    view.addEventListener('click', (event) => {
        if (gpOverlay !== 'buffs') return;
        const presetBtn = event.target.closest('.shaman-consume-preset-tier-btn');
        const clearBtn = event.target.closest('#shaman-clear-consumables-btn');
        if (!presetBtn && !clearBtn) return;
        queueMicrotask(() => syncGpBuffsFromDom());
    });
}

function wireGpTalentSync() {
    const view = document.getElementById('gp-talents-view');
    if (!view || view.dataset.talentSyncWired === '1') return;
    view.dataset.talentSyncWired = '1';
    const afterTalentMutation = () => queueMicrotask(() => syncGpTalentsFromDom());
    view.addEventListener('click', afterTalentMutation);
    view.addEventListener('contextmenu', afterTalentMutation);
}

function toggleGpTalentsView() {
    if (gpOverlay === 'talents') closeGpTalentsModal();
    else openGpTalentsView();
}

function toggleGpStatWeightsView() {
    if (gpOverlay === 'weights') closeGpTalentsModal();
    else openGpStatWeightsView();
}

async function openGpStatWeightsView() {
    if (gpOverlay === 'talents' || gpOverlay === 'buffs') await closeGpTalentsModal();
    gpOverlay = 'weights';
    syncGpOverlayUi();
    renderGpStatWeightsPanels();
}

function gpClassSupportsStatWeights(classId = currentPlan.class) {
    return showTankWeightsUi() || showDpsWeightsUi()
        || GP_TANK_WEIGHT_CLASSES.has(classId) || classId === 'shaman';
}

function updateStatWeightsBtnVisibility() {
    const btn = document.getElementById('gp-stat-weights-btn');
    if (!btn) return;
    const show = showTankWeightsUi() || showDpsWeightsUi()
        || GP_TANK_WEIGHT_CLASSES.has(currentPlan.class) || currentPlan.class === 'shaman';
    btn.hidden = !show;
    if (!show && gpOverlay === 'weights') closeGpTalentsModal();
}

function fillGpTankWeightDisplay(sw) {
    const set = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = (val == null || Number.isNaN(Number(val))) ? '-' : Math.round(Number(val)).toLocaleString();
    };
    set('gp-sw-avoidance', sw?.avoidance1PercentEHP);
    set('gp-sw-stamina', sw?.stamina1EHP);
    set('gp-sw-defense', sw?.defense1EHP);
    set('gp-sw-armor', sw?.armor1EHP);
    set('gp-sw-blockvalue', sw?.blockValue1EHP);
    set('gp-sw-blockchance', sw?.blockChance1PercentEHP);
}

let gpSelectedTankBoss = null;

function resolveGpTankBoss() {
    const input = document.getElementById('gp-tank-boss-search');
    if (input?.dataset?.bossData) {
        try {
            const parsed = JSON.parse(input.dataset.bossData);
            if (parsed?.minDamage && parsed?.maxDamage) return parsed;
        } catch { /* ignore */ }
    }
    if (gpSelectedTankBoss?.minDamage && gpSelectedTankBoss?.maxDamage) return gpSelectedTankBoss;
    const charSearch = document.getElementById('boss-search');
    if (charSearch?.dataset?.bossData) {
        try {
            const parsed = JSON.parse(charSearch.dataset.bossData);
            if (parsed?.minDamage && parsed?.maxDamage) return parsed;
        } catch { /* ignore */ }
    }
    try {
        const stored = localStorage.getItem('lastSelectedBoss');
        if (stored) {
            const boss = JSON.parse(stored);
            if (boss?.minDamage && boss?.maxDamage) return boss;
        }
    } catch { /* ignore */ }
    return null;
}

function wireGpTankBossSearch() {
    const input = document.getElementById('gp-tank-boss-search');
    const resultsEl = document.getElementById('gp-tank-boss-results');
    if (!input || !resultsEl || input.dataset.gpBossWired === '1') return;
    input.dataset.gpBossWired = '1';
    let searchTimeout = null;

    const decodeHtml = (html) => {
        const txt = document.createElement('textarea');
        txt.innerHTML = html;
        return txt.value;
    };

    async function searchGpTankBosses(query) {
        resultsEl.innerHTML = '<div class="search-loading">Searching...</div>';
        resultsEl.style.display = 'block';
        try {
            const res = await fetch(`/bosses/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            if (!data.success || !data.results?.length) {
                resultsEl.innerHTML = '<div class="search-no-results">No bosses found.</div>';
                return;
            }
            resultsEl.innerHTML = '';
            const list = document.createElement('div');
            list.className = 'search-results-list';
            data.results.forEach((npc) => {
                const name = decodeHtml(npc.name);
                const item = document.createElement('div');
                item.className = `search-result-item ${npc.is_boss ? 'is-boss' : ''}`;
                item.dataset.bossId = npc.id;
                item.dataset.bossName = name;
                item.innerHTML = `<div class="result-name"></div><div class="result-meta"></div>`;
                item.querySelector('.result-name').textContent = name;
                item.querySelector('.result-meta').textContent =
                    `${npc.is_boss ? 'Boss' : 'NPC'}${npc.level ? ` - Level ${npc.level}` : ''} - ID: ${npc.id}`;
                item.addEventListener('click', () => loadGpTankBoss(npc.id, name));
                list.appendChild(item);
            });
            resultsEl.appendChild(list);
        } catch (e) {
            console.error('[GP tank boss search]', e);
            resultsEl.innerHTML = `<div class="search-error">Error: ${e.message || e}</div>`;
        }
    }

    async function loadGpTankBoss(bossId, bossName) {
        resultsEl.style.display = 'none';
        const prev = input.value;
        input.disabled = true;
        input.value = 'Loading...';
        try {
            const res = await fetch(`/bosses/scrape?id=${encodeURIComponent(bossId)}`);
            const data = await res.json();
            if (!data.success || !data.boss) throw new Error(data.error || 'Invalid boss data');
            const boss = data.boss;
            const bossData = {
                id: boss.id || `boss_${bossId}`,
                name: boss.name || bossName,
                level: boss.level || 63,
                minDamage: boss.minDamage || 0,
                maxDamage: boss.maxDamage || 0,
                attackSpeed: boss.attackSpeed || 2.0,
            };
            gpSelectedTankBoss = bossData;
            input.dataset.bossData = JSON.stringify(bossData);
            input.value = `${bossData.name} (${bossData.minDamage}-${bossData.maxDamage} dmg)`;
            try { localStorage.setItem('lastSelectedBoss', JSON.stringify(bossData)); } catch { /* ignore */ }
            const status = document.getElementById('gp-tank-weights-status');
            if (status) status.textContent = `Boss ready: ${bossData.name}`;
        } catch (e) {
            console.error('[GP tank boss load]', e);
            input.value = prev;
            window.notify?.error?.(e.message || 'Failed to load boss', 4000, 'Gear Planner');
        } finally {
            input.disabled = false;
        }
    }

    input.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        delete input.dataset.bossData;
        gpSelectedTankBoss = null;
        const query = input.value.trim();
        if (query.length < 2) {
            resultsEl.style.display = 'none';
            return;
        }
        searchTimeout = setTimeout(() => searchGpTankBosses(query), 350);
    });
    input.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const query = input.value.trim();
            if (query) searchGpTankBosses(query);
        }
    });
    document.addEventListener('click', (e) => {
        if (!input.contains(e.target) && !resultsEl.contains(e.target)) {
            resultsEl.style.display = 'none';
        }
    });
}

async function generateGpTankStatWeights() {
    const status = document.getElementById('gp-tank-weights-status');
    const btn = document.getElementById('gp-generate-tank-weights-btn');
    const boss = resolveGpTankBoss();
    if (!boss) {
        if (status) status.textContent = 'Search and select a boss below (or use last Character Planner tank boss).';
        return;
    }
    if (!boss.minDamage || !boss.maxDamage) {
        if (status) status.textContent = 'Boss damage data is missing. Pick the boss again from search results.';
        return;
    }
    const minutes = parseInt(document.getElementById('gp-tank-time-min')?.value, 10) || 0;
    const seconds = parseInt(document.getElementById('gp-tank-time-sec')?.value, 10) || 0;
    const timeInSeconds = (minutes * 60) + seconds;
    if (timeInSeconds <= 0) {
        if (status) status.textContent = 'Enter a valid fight duration.';
        return;
    }
    const plan = getGearPlanData(currentPlan);
    const { equipped } = aggregatePrimaryGearStats(plan);
    const characterData = buildGpCalcPayload(plan, { includeGear: true, includeTalents: true, includeBuffs: true });
    characterData.equippedItems = Object.values(equipped).filter(Boolean);
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
    if (status) status.textContent = `Simulating ${boss.name}…`;
    try {
        const results = await runTankSimulation(characterData, boss, timeInSeconds, 1000, { yieldEvery: 50 });
        const sw = results?.statWeights || null;
        saveGearPlannerTankStatWeights(sw);
        currentPlan.tankStatWeights = sw;
        writeLocalWeightDraft({ tankStatWeights: sw });
        fillGpTankWeightDisplay(sw);
        persistSession();
        renderGearPlanner();
        if (status) status.textContent = `Done (${boss.name}). Item scores now use these weights.`;
    } catch (e) {
        console.error('[GP tank stat weights]', e);
        if (status) status.textContent = e.message || 'Simulation failed';
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Generate'; }
    }
}

function isGpDualWeightsLayout() {
    return showTankWeightsUi() && showDpsWeightsUi();
}

function gpStatWeightsTableHtml(weights, tableClass) {
    let html = `<div class="stat-weights-table-wrap"><table class="stat-weights-table ${tableClass}" style="font-size: 12px;"><thead><tr>`;
    html += '<th class="stat-weight-sortable" data-sort="stat" style="cursor: pointer; user-select: none; text-align: left; padding: 4px 6px;">Stat <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable stat-weight-value-col" data-sort="dps" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;"><span class="stat-weight-col-label">DPS</span> <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable" data-sort="ap" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;">AP <span class="sort-indicator"></span></th>';
    html += '<th class="stat-weight-sortable" data-sort="sp" style="cursor: pointer; user-select: none; text-align: right; padding: 4px 6px;">SP <span class="sort-indicator"></span></th>';
    html += '</tr></thead><tbody>';
    for (const row of weights) {
        html += `<tr data-stat-key="${row.key || ''}">`;
        html += `<td style="text-align: left; padding: 4px 6px;">${row.stat}</td>`;
        html += `<td style="text-align: right; padding: 4px 6px;">${row.dps}</td>`;
        html += `<td style="text-align: right; padding: 4px 6px;">${row.ap}</td>`;
        html += `<td style="text-align: right; padding: 4px 6px;">${row.sp}</td></tr>`;
    }
    html += '</tbody></table></div>';
    return html;
}

function bindGpDpsWeightGenerate(host, isAoe) {
    const btnId = isAoe ? 'gp-generate-aoe-stat-weights-btn' : 'gp-generate-stat-weights-btn';
    const btn = host.querySelector(`#${btnId}`);
    if (!btn) return;
    btn.addEventListener('click', () => {
        btn.disabled = true;
        btn.textContent = 'Generating...';
        setTimeout(async () => {
            try {
                const weights = await runGearPlanStatWeightSimulations(
                    getGearPlanData(currentPlan),
                    { isAoe },
                    (completed, total) => {
                        const liveBtn = document.getElementById(btnId);
                        if (liveBtn) liveBtn.textContent = 'Generating... ' + Math.round(100 * completed / total) + '%';
                    }
                );
                saveGearPlannerDpsStatWeights(weights, isAoe);
                if (isAoe) currentPlan.statWeightsAoe = weights;
                else currentPlan.statWeights = weights;
                writeLocalWeightDraft(isAoe ? { statWeightsAoe: weights } : { statWeights: weights });
                persistSession();
                renderGearPlanner();
                const freshHost = document.getElementById('gp-dps-weights-host');
                const panel = isAoe
                    ? freshHost?.querySelector('.stat-weights-aoe-panel')
                    : freshHost?.querySelector('.stat-weights-panel:not(.stat-weights-aoe-panel)');
                const table = panel?.querySelector('.stat-weights-table');
                if (table) updateStatWeightsTable(weights, 'dps', table);
            } catch (e) {
                console.error('[GP DPS stat weights]', e);
                alert('Failed to generate stat weights: ' + (e.message || e));
            } finally {
                const liveBtn = document.getElementById(btnId);
                if (liveBtn) {
                    liveBtn.disabled = false;
                    liveBtn.textContent = 'Generate';
                }
            }
        }, 50);
    });
}

function renderGpManualDpsWeightsHost() {
    const host = document.getElementById('gp-dps-weights-host');
    if (!host) return;
    const existing = mergeStatWeightsToTemplate(resolveGpDpsWeights(false));
    const byKey = Object.fromEntries((existing || []).map((r) => [r.key, r]));
    host.innerHTML = `<p class="gp-weights-hint">Enter DPS weights manually for this class. Values apply to item card scores and persist with the plan (local draft until reload from My Gear Plans / community).</p>
        <div class="gp-manual-weights-grid">
            ${GP_MANUAL_DPS_WEIGHT_KEYS.map(({ key, label }) => {
                const val = byKey[key]?.statDps;
                const hasVal = typeof val === 'number' && !Number.isNaN(val) && Math.abs(val) > 1e-9;
                const shown = hasVal ? val : '';
                return `<label>${escapeHtml(label)}
                    <input type="number" step="any" class="slick-input gp-manual-weight-input" data-weight-key="${escapeHtml(key)}" placeholder="-" value="${shown === '' ? '' : escapeHtml(String(shown))}" />
                </label>`;
            }).join('')}
        </div>`;
    const persistManual = () => {
        const rows = mergeStatWeightsToTemplate(null).map((row) => {
            const input = host.querySelector(`.gp-manual-weight-input[data-weight-key="${row.key}"]`);
            const raw = input?.value;
            const num = raw === '' || raw == null ? null : Number(raw);
            const statDps = (num != null && !Number.isNaN(num) && Math.abs(num) > 1e-9) ? num : null;
            return {
                ...row,
                statDps,
                dps: statDps != null ? String(statDps) : '-',
                ap: '-',
                sp: '-',
            };
        });
        currentPlan.statWeights = rows;
        saveGearPlannerDpsStatWeights(rows, false);
        writeLocalWeightDraft({ statWeights: rows });
        persistSession();
        renderGearPlanner();
    };
    host.querySelectorAll('.gp-manual-weight-input').forEach((el) => {
        el.addEventListener('change', persistManual);
        el.addEventListener('blur', persistManual);
    });
}

function renderGpDpsWeightsHost() {
    const host = document.getElementById('gp-dps-weights-host');
    if (!host) return;
    if (String(currentPlan.class || '').toLowerCase() !== 'shaman') {
        renderGpManualDpsWeightsHost();
        return;
    }
    const dual = isGpDualWeightsLayout();
    const st = mergeStatWeightsToTemplate(resolveGpDpsWeights(false));
    const aoe = mergeStatWeightsToTemplate(resolveGpDpsWeights(true));
    const stPanel = `<div class="stat-weights-panel gp-dps-st-panel" style="flex: 0 1 400px; min-width: 280px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h4 style="margin:0;color:#ffd700;">Single Target (DPS)</h4>
                <button type="button" id="gp-generate-stat-weights-btn" class="gp-btn gp-btn-primary">Generate</button>
            </div>
            ${gpStatWeightsTableHtml(st, 'gp-st-weights')}
        </div>`;
    const aoePanel = dual ? '' : `<div class="stat-weights-aoe-panel stat-weights-panel" style="flex: 0 1 400px; min-width: 280px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <h4 style="margin:0;color:#ffd700;">AOE</h4>
                <button type="button" id="gp-generate-aoe-stat-weights-btn" class="gp-btn gp-btn-primary">Generate</button>
            </div>
            ${gpStatWeightsTableHtml(aoe, 'gp-aoe-weights')}
        </div>`;
    host.innerHTML = `<div class="stat-weights-tab-content gp-dps-weights-columns" style="padding: 8px 0; display: flex; gap: 20px; justify-content: center; flex-wrap: ${dual ? 'nowrap' : 'wrap'};">
        ${stPanel}
        ${aoePanel}
    </div>`;
    bindGpDpsWeightGenerate(host, false);
    if (!dual) bindGpDpsWeightGenerate(host, true);
    host.querySelectorAll('.stat-weights-panel').forEach(panel => {
        panel.querySelectorAll('th.stat-weight-sortable').forEach(header => {
            header.addEventListener('click', () => {
                const table = panel.querySelector('.stat-weights-table');
                const column = header.dataset.sort;
                if (table && column) sortStatWeightsTable(column, true, table);
            });
        });
    });
}

function renderGpStatWeightsPanels() {
    const tankPanel = document.getElementById('gp-tank-weights-panel');
    const dpsPanel = document.getElementById('gp-dps-weights-panel');
    const unsupported = document.getElementById('gp-weights-unsupported');
    const title = document.getElementById('gp-dps-weights-title');
    const showTank = showTankWeightsUi();
    const showDps = showDpsWeightsUi();
    if (tankPanel) tankPanel.hidden = !showTank;
    if (dpsPanel) dpsPanel.hidden = !showDps;
    if (unsupported) unsupported.hidden = showTank || showDps;
    const shell = document.getElementById('gear-planner-shell');
    shell?.classList.toggle('gp-dual-weights', showTank && showDps);
    if (title) {
        if (showTank && showDps) {
            title.textContent = 'Single Target (DPS) stat weights';
        } else if (String(currentPlan.class || '').toLowerCase() === 'shaman') {
            title.textContent = 'Shaman DPS stat weights';
        } else {
            title.textContent = 'DPS stat weights (manual)';
        }
    }
    if (showTank) {
        wireGpTankBossSearch();
        fillGpTankWeightDisplay(resolveGpTankWeights());
        const input = document.getElementById('gp-tank-boss-search');
        const boss = resolveGpTankBoss();
        if (input && boss && !input.value) {
            input.value = `${boss.name} (${boss.minDamage}-${boss.maxDamage} dmg)`;
            input.dataset.bossData = JSON.stringify(boss);
        }
    }
    if (showDps) renderGpDpsWeightsHost();
}

function toggleGpBuffsView() {
    if (gpOverlay === 'buffs') closeGpTalentsModal();
    else openGpBuffsView();
}

async function openGpTalentsView() {
    if (gpOverlay === 'buffs' || gpOverlay === 'weights') await closeGpTalentsModal();
    const host = document.getElementById('gp-talents-host');
    const charList = document.getElementById('talents-list');
    if (!host) return;
    if (gpOverlay !== 'talents') {
        characterTalentSnapshot = snapshotCharacterTalents();
        if (charList) charList.innerHTML = '';
    }
    gpOverlay = 'talents';
    syncGpOverlayUi();
    syncGpTalentPresetTools();
    generateTalentInputs(host, currentPlan.class || 'warrior');
    await applyTalentSpec(host, currentPlan.talents || {});
    updateAllTalentStates(false);
    requestAnimationFrame(() => fitGpTalentTree());
}

async function refreshGpBuffsHost() {
    const list = document.getElementById('buffs-list');
    if (!list) return;
    await generateBuffIcons(list, currentPlan.class || 'warrior', currentPlan.talents || {});
    applyBuffListToDom(currentPlan.buffs || [], list);
    const tools = document.getElementById('shaman-buffs-consume-tools');
    if (tools) tools.style.display = currentPlan.class === 'shaman' ? 'flex' : 'none';
}

function parkConsumeTools(toolsSlotId) {
    const tools = document.getElementById('shaman-buffs-consume-tools');
    const toolsSlot = document.getElementById(toolsSlotId);
    if (!tools || !toolsSlot) return;
    if (!consumeToolsHome) {
        consumeToolsHome = { parent: tools.parentElement, next: tools.nextSibling };
    }
    if (tools.parentElement !== toolsSlot) toolsSlot.appendChild(tools);
}

function parkBuffsDomInGp() {
    const list = document.getElementById('buffs-list');
    const listSlot = document.getElementById('gp-buffs-list-slot');
    if (list && listSlot && list.parentElement !== listSlot) {
        buffsListHome = { parent: list.parentElement, next: list.nextSibling };
        listSlot.appendChild(list);
    }
    parkConsumeTools('gp-buffs-tools-slot');
}

function restoreBuffsDomHome() {
    const list = document.getElementById('buffs-list');
    const tools = document.getElementById('shaman-buffs-consume-tools');
    if (list && buffsListHome?.parent) {
        if (buffsListHome.next && buffsListHome.next.parentNode === buffsListHome.parent) {
            buffsListHome.parent.insertBefore(list, buffsListHome.next);
        } else {
            buffsListHome.parent.appendChild(list);
        }
    }
    if (tools && consumeToolsHome?.parent) {
        if (consumeToolsHome.next && consumeToolsHome.next.parentNode === consumeToolsHome.parent) {
            consumeToolsHome.parent.insertBefore(tools, consumeToolsHome.next);
        } else {
            consumeToolsHome.parent.appendChild(tools);
        }
    }
    buffsListHome = null;
    consumeToolsHome = null;
}

async function openGpBuffsView() {
    if (gpOverlay === 'talents' || gpOverlay === 'weights') await closeGpTalentsModal();
    if (gpOverlay !== 'buffs') {
        characterBuffSnapshot = snapshotCharacterBuffs();
        parkBuffsDomInGp();
    }
    gpOverlay = 'buffs';
    syncGpOverlayUi();
    await refreshGpBuffsHost();
}

export async function closeGpTalentsModal() {
    const talentHost = document.getElementById('gp-talents-host');
    const list = document.getElementById('buffs-list');
    if (gpOverlay === 'talents' && talentHost) {
        currentPlan.talents = serializeTalentSpec(talentHost);
        talentHost.innerHTML = '';
    }
    if (gpOverlay === 'buffs' && list) {
        currentPlan.buffs = serializeBuffSpec(list);
    }
    persistSession();
    const wasBuffs = gpOverlay === 'buffs';
    const wasTalents = gpOverlay === 'talents';
    gpOverlay = null;
    syncGpOverlayUi();
    if (wasTalents) {
        unbindGpTalentFit();
        closeGpTalentPresetDropdown();
        await restoreCharacterTalents(characterTalentSnapshot);
        characterTalentSnapshot = null;
    }
    if (wasBuffs) {
        restoreBuffsDomHome();
        await restoreCharacterBuffs(characterBuffSnapshot);
        characterBuffSnapshot = null;
        const tools = document.getElementById('shaman-buffs-consume-tools');
        const charClass = document.getElementById('class-race-sidebar')?.dataset?.selectedClass;
        if (tools) tools.style.display = charClass === 'shaman' ? 'flex' : 'none';
    }
    if (document.body.dataset.appMode === 'gearPlanner') renderStatsSidebar();
}

function emptyStatTemplate() {
    const total = Object.assign({}, STAT_TEMPLATE);
    total.weaponSkillByType = {};
    return total;
}

function aggregatePlanEnchantStats(plan) {
    const total = emptyStatTemplate();
    for (const slot of GEAR_PLAN_SLOTS) {
        const idx = plan.slots?.[slot]?.enchant;
        if (idx == null) continue;
        const enchant = enchantDatabase[slot]?.[idx];
        if (!enchant?.stats) continue;
        for (const stat in enchant.stats) {
            const finalKey = KEY_MAP[stat] || stat;
            if (stat === 'weaponSkillByType' && typeof enchant.stats[stat] === 'object') {
                for (const weaponType in enchant.stats[stat]) {
                    total.weaponSkillByType[weaponType] = (total.weaponSkillByType[weaponType] || 0) + enchant.stats[stat][weaponType];
                }
            } else if (Object.prototype.hasOwnProperty.call(total, finalKey)) {
                total[finalKey] += enchant.stats[stat];
            }
        }
    }
    return total;
}

function pruneSlotEnchant(slotId) {
    const slot = currentPlan.slots[slotId];
    if (!slot || slot.enchant == null) return;
    const db = enchantDatabase[slotId] || [];
    const enchant = db[slot.enchant];
    if (!enchant || enchant.name === 'None') {
        slot.enchant = null;
        return;
    }
    const item = slot.primary != null ? callbacks.getItemById?.(slot.primary) : null;
    if (!item) return;
    const filtered = filterEnchantsByItemType(db, getItemType(item), slotId, item);
    if (!filtered.some(e => e.name === enchant.name)) slot.enchant = null;
}

function gpRangedIsEnchantable(item) {
    if (!item) return false;
    const lines = (item.tooltip_lines_raw || []).map(l => String(l || '').toLowerCase().trim());
    if (lines.includes('wand') || lines.includes('thrown') || lines.includes('relic')) return false;
    return lines.includes('ranged') || lines.includes('bow') || lines.includes('crossbow') || lines.includes('gun');
}

function gpSlotShowsEnchant(slotId, primaryItem) {
    if (!getEnchantableSlots().includes(slotId)) return false;
    if (slotId === 'ranged') return gpRangedIsEnchantable(primaryItem);
    return true;
}

function gpEnchantDisplayName(slotId) {
    const idx = currentPlan.slots[slotId]?.enchant;
    if (idx == null) return '';
    const enchant = enchantDatabase[slotId]?.[idx];
    if (!enchant || enchant.name === 'None') return '';
    return getEnchantCompactLabel(enchant) || enchant.name;
}

function gpEnchantChromeHtml(slotId, side) {
    const name = gpEnchantDisplayName(slotId);
    const enchanted = !!name;
    const title = enchanted ? 'Change enchant' : 'Select enchant';
    const nameHtml = enchanted
        ? `<span class="gp-enchant-name">${escapeHtml(name)}</span>`
        : '';
    return `<span class="gp-enchant-chrome${enchanted ? ' is-enchanted' : ''}" data-side="${side}">
        <button type="button" class="gp-enchant-btn enchant-btn${enchanted ? ' is-enchanted' : ''}" data-slot="${slotId}" data-side="${side}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"></button>
        ${nameHtml}
    </span>`;
}

function aggregatePrimaryGearStats(plan) {
    const total = emptyStatTemplate();
    const equipped = {};
    for (const slot of GEAR_PLAN_SLOTS) {
        const id = plan.slots?.[slot]?.primary;
        if (id == null) continue;
        const item = callbacks.getItemById?.(id);
        if (!item) continue;
        if (!item.stats) item.stats = parseStatsFromTooltip(item);
        equipped[slot] = item;
        if (!item.stats) continue;
        for (const itemStatKey in item.stats) {
            if (itemStatKey === 'weaponSkillByType' && typeof item.stats[itemStatKey] === 'object') {
                for (const weaponType in item.stats[itemStatKey]) {
                    total.weaponSkillByType[weaponType] = (total.weaponSkillByType[weaponType] || 0) + item.stats[itemStatKey][weaponType];
                }
            } else {
                const finalKey = KEY_MAP[itemStatKey] || itemStatKey;
                if (Object.prototype.hasOwnProperty.call(total, finalKey)) {
                    total[finalKey] += item.stats[itemStatKey];
                }
            }
        }
    }
    return { gearStats: total, equipped };
}

function buildGpCalcPayload(plan, { includeGear, includeTalents, includeBuffs }) {
    const cls = plan.class || 'warrior';
    const race = plan.race || 'human';
    const { gearStats, equipped } = includeGear ? aggregatePrimaryGearStats(plan) : { gearStats: emptyStatTemplate(), equipped: {} };
    const mh = equipped.mainhand;
    const oh = equipped.offhand;
    const mhType = getMeleeWeaponType(mh);
    const ohType = getMeleeWeaponType(oh);
    const talentBonuses = includeTalents ? getTalentBonusesFromSpec(cls, plan.talents || {}) : {};
    return {
        selectedClass: cls,
        selectedRace: race,
        attackerLevel: 63,
        gearStats,
        talentBonuses,
        racialBonuses: getSelectedRaceBonuses(race),
        activeBuffs: includeBuffs ? getBuffsFromSavedList(plan.buffs || [], talentBonuses) : [],
        enchantStats: includeGear ? aggregatePlanEnchantStats(plan) : emptyStatTemplate(),
        offhandArmor: oh?.stats?.armor || 0,
        setBonuses: includeGear ? getSetBonuses(equipped, false) : {},
        isDualWielding: !!(oh && ohType),
        mainhandWeaponType: mhType,
        offhandWeaponType: ohType,
        mainhandIsTwoHanded: mh?.tooltip_lines_raw?.includes('Two-hand') || false,
        offhandIsTwoHanded: oh?.tooltip_lines_raw?.includes('Two-hand') || false,
        rangedWeaponType: null,
    };
}

const GP_STAT_GROUPS = [
    { title: 'Attributes', rows: [
        ['strength', 'Strength'], ['agility', 'Agility'], ['stamina', 'Stamina'],
        ['intellect', 'Intellect'], ['spirit', 'Spirit'], ['vampirism', 'Vampirism', 'pct'],
        ['critDmgReduction', 'Crit Dmg Reduction', 'pct'],
    ]},
    { title: 'Melee', rows: [
        ['attackPower', 'Attack Power'], ['crit', 'Melee Crit', 'pct'],
        ['hit', 'Melee Hit', 'pct'], ['haste', 'Haste', 'pct'], ['armorPen', 'Armor Pen'],
    ]},
    { title: 'Ranged', rows: [
        ['rangedAttackPower', 'Attack Power'], ['rangedCrit', 'Ranged Crit', 'pct'],
        ['rangedHit', 'Ranged Hit', 'pct'],
    ]},
    { title: 'Spell', rows: [
        ['dmgAndHealing', 'Spell Damage'], ['healing', 'Healing'], ['spellCrit', 'Spell Crit', 'pct'],
        ['spellHit', 'Spell Hit', 'pct'], ['spellPen', 'Spell Pen'], ['mp5', 'Mp5'],
        ['fireDamage', 'Fire Damage'], ['frostDamage', 'Frost Damage'], ['natureDamage', 'Nature Damage'],
        ['shadowDamage', 'Shadow Damage'], ['arcaneDamage', 'Arcane Damage'], ['holyDamage', 'Holy Damage'],
    ]},
    { title: 'Defense', rows: [
        ['health', 'Health'], ['mana', 'Mana'], ['armor', 'Armor'], ['defense', 'Defense'],
        ['dodge', 'Dodge', 'pct'], ['parry', 'Parry', 'pct'], ['block', 'Block', 'pct'],
        ['blockValue', 'Block Value'],
    ]},
    { title: 'Damage Reduction', rows: [
        ['fireDR', 'Fire', 'frac'], ['natureDR', 'Nature', 'frac'], ['frostDR', 'Frost', 'frac'],
        ['shadowDR', 'Shadow', 'frac'], ['arcaneDR', 'Arcane', 'frac'], ['holyDR', 'Holy', 'frac'],
    ]},
];

function formatGpStatValue(value, kind) {
    if (kind === 'frac') return `${(Number(value) * 100).toFixed(2)}%`;
    if (kind === 'pct') return `${Number(value).toFixed(2)}%`;
    if (Number.isInteger(value)) return String(value);
    return Number(value).toFixed(1);
}

function renderStatsSidebar() {
    const list = document.getElementById('gp-stats-list');
    if (!list) return;
    ensurePlanRace();
    const plan = getGearPlanData(currentPlan);
    const hasPrimary = GEAR_PLAN_SLOTS.some(s => plan.slots?.[s]?.primary != null);
    const hasBuffs = Array.isArray(plan.buffs) && plan.buffs.length > 0;
    const hasTalents = plan.talents && Object.values(plan.talents).some(v => Number(v) > 0);
    if (!hasPrimary && !hasBuffs && !hasTalents) {
        list.innerHTML = '<p class="gp-locations-empty">No modified stats yet</p>';
        return;
    }
    const full = calculateEffectiveHealth(buildGpCalcPayload(plan, { includeGear: true, includeTalents: true, includeBuffs: true }));
    const ungeared = calculateEffectiveHealth(buildGpCalcPayload(plan, { includeGear: false, includeTalents: true, includeBuffs: true }));
    const naked = calculateEffectiveHealth(buildGpCalcPayload(plan, { includeGear: false, includeTalents: false, includeBuffs: false }));
    const cards = GP_STAT_GROUPS.map(group => {
        const rows = group.rows.map(([key, label, kind]) => {
            const total = Number(full[key]) || 0;
            const gearBonus = total - (Number(ungeared[key]) || 0);
            const vsNaked = total - (Number(naked[key]) || 0);
            if (Math.abs(gearBonus) < 0.005 && Math.abs(vsNaked) < 0.005) return '';
            const bonusSign = gearBonus > 0 ? '+' : '';
            const bonusHtml = Math.abs(gearBonus) >= 0.005
                ? ` (${bonusSign}${formatGpStatValue(gearBonus, kind)})`
                : '';
            return `<div class="gp-stat-item"><span>${escapeHtml(label)}</span><strong>${formatGpStatValue(total, kind)}${bonusHtml}</strong></div>`;
        }).filter(Boolean).join('');
        if (!rows) return '';
        return `<div class="gp-stat-card"><h4 class="gp-locations-group-heading">${escapeHtml(group.title)}</h4>${rows}</div>`;
    }).filter(Boolean).join('');
    list.innerHTML = cards || '<p class="gp-locations-empty">No modified stats yet</p>';
}

function hideSaveDialog() {
    const el = document.getElementById('gp-save-overwrite-dialog');
    if (el) {
        el.style.display = 'none';
        el.setAttribute('aria-hidden', 'true');
    }
    document.querySelectorAll('#gp-save-overwrite-dialog .stat-dropdown-menu').forEach((menu) => {
        menu.style.display = 'none';
    });
    document.querySelectorAll('#gp-save-overwrite-dialog .stat-dropdown-header').forEach((header) => {
        header.classList.remove('open');
        header.setAttribute('aria-expanded', 'false');
    });
}

function setSaveRoleValue(value) {
    const role = String(value || 'dps').toLowerCase();
    const hidden = document.getElementById('gp-save-role');
    const label = document.getElementById('gp-save-role-label');
    if (hidden) hidden.value = role;
    const labels = { dps: 'DPS', tank: 'Tank', healer: 'Healer' };
    if (label) label.textContent = labels[role] || role;
    document.querySelectorAll('#gp-save-role-dropdown .gp-save-dd-option').forEach((btn) => {
        btn.classList.toggle('is-selected', btn.dataset.value === role);
    });
}

function setSaveSpecValue(value) {
    const spec = String(value || '').trim();
    const hidden = document.getElementById('gp-save-spec');
    const label = document.getElementById('gp-save-spec-label');
    if (hidden) hidden.value = spec;
    if (label) label.textContent = spec || '—';
    document.querySelectorAll('#gp-save-spec-dropdown .gp-save-dd-option').forEach((btn) => {
        btn.classList.toggle('is-selected', btn.dataset.value === spec);
    });
}

function onSaveSpecChanged(spec) {
    const currentIcon = document.getElementById('gp-save-icon-value')?.value;
    const prevDefault = defaultIconForClassSpec(currentPlan.class, saveDialogSpecBaseline || currentPlan.spec);
    if (!saveIconUserPicked && (!currentIcon || currentIcon === prevDefault)) {
        setSaveIconPreview(defaultIconForClassSpec(currentPlan.class, spec));
    }
    saveDialogSpecBaseline = spec;
}

function canOverwriteCurrentPlan() {
    if (!currentPlan?.id) return false;
    const user = window.profileManager?.user;
    if (!currentPlan.community && String(currentPlan.id).startsWith('local_gp_')) return true;
    if (!user) {
        return !currentPlan.community && !currentPlan.authorId;
    }
    if (currentPlan.authorId != null && String(currentPlan.authorId) === String(user.id)) return true;
    if (!currentPlan.community && !currentPlan.authorId) return true;
    return false;
}

function fillSaveSpecOptions(classId, selectedSpec) {
    const menu = document.getElementById('gp-save-spec-dropdown');
    if (!menu) return;
    const specs = specsForClass(classId);
    menu.innerHTML = specs.map((s) =>
        `<button type="button" class="gp-save-dd-option" data-value="${escapeHtml(s.name)}" role="option">${escapeHtml(s.name)}</button>`
    ).join('');
    let value = selectedSpec && specs.some((s) => s.name === selectedSpec)
        ? selectedSpec
        : (specs[0]?.name || '');
    setSaveSpecValue(value);
}

function setSaveIconPreview(iconKey, { userPicked = false } = {}) {
    const key = iconKey || defaultIconForClassSpec(currentPlan.class, currentPlan.spec);
    const img = document.getElementById('gp-save-icon-preview');
    const hidden = document.getElementById('gp-save-icon-value');
    const nameEl = document.getElementById('gp-save-icon-name');
    if (hidden) hidden.value = key;
    if (img) {
        img.src = resolveIconUrl(key);
        img.alt = key;
    }
    if (nameEl) nameEl.textContent = key;
    if (userPicked) saveIconUserPicked = true;
}

function updateSaveDescCounter() {
    const ta = document.getElementById('gp-save-description');
    const counter = document.getElementById('gp-save-desc-count');
    if (!ta || !counter) return;
    const n = String(ta.value || '').length;
    counter.textContent = `${n} / ${GEAR_PLAN_DESCRIPTION_MAX}`;
}

function readSaveMetaFromDialog() {
    const roleSel = document.getElementById('gp-save-role')?.value || '';
    const roles = normalizeGearPlanRoles(roleSel ? [roleSel] : []);
    const spec = document.getElementById('gp-save-spec')?.value || '';
    const icon = document.getElementById('gp-save-icon-value')?.value
        || currentPlan.icon
        || defaultIconForClassSpec(currentPlan.class, spec);
    const rawDesc = document.getElementById('gp-save-description')?.value ?? '';
    let description = sanitizeGearPlanDescription(rawDesc);
    if (!description && currentPlan?.description) {
        description = sanitizeGearPlanDescription(currentPlan.description);
    }
    return { roles, spec, icon, description };
}

function applySaveMetaToPlan(meta) {
    currentPlan.role = meta.roles;
    currentPlan.spec = meta.spec;
    if (meta.icon) currentPlan.icon = meta.icon;
    else if (!currentPlan.icon) currentPlan.icon = defaultIconForClassSpec(currentPlan.class, meta.spec);
    currentPlan.description = meta.description != null
        ? sanitizeGearPlanDescription(meta.description)
        : sanitizeGearPlanDescription(currentPlan.description || '');
    persistSession();
    updateStatWeightsBtnVisibility();
}

function validateSaveMeta(meta) {
    const err = document.getElementById('gp-save-meta-error');
    const ok = meta.roles.length > 0 && !!String(meta.spec || '').trim();
    if (err) err.hidden = ok;
    return ok;
}

function collectSaveWarnings(meta) {
    const warnings = [];
    const talents = currentPlan.talents || {};
    const talentPts = Object.values(talents).reduce((n, v) => n + (Number(v) || 0), 0);
    if (talentPts <= 0) warnings.push('No talents are selected.');
    if (!Array.isArray(currentPlan.buffs) || currentPlan.buffs.length === 0) {
        warnings.push('No consumables/buffs are selected.');
    }
    const roles = meta?.roles || planRoles();
    const cls = String(currentPlan.class || '').toLowerCase();
    const warnDps = roles.includes('dps') || GP_DUAL_ROLE_CLASSES.has(cls);
    const warnTank = (roles.includes('tank') || GP_DUAL_ROLE_CLASSES.has(cls)) && GP_TANK_CAPABLE.has(cls);
    if (warnDps && !hasMeaningfulDpsWeights(resolveGpDpsWeights(false))) {
        warnings.push('No DPS stat weights are set.');
    }
    if (warnTank && !hasMeaningfulTankWeights(resolveGpTankWeights())) {
        warnings.push('No tank stat weights are set.');
    }
    return warnings;
}

function confirmSaveWarnings(warnings) {
    if (!warnings.length) return Promise.resolve(true);
    const body = `This plan may be incomplete:\n\n• ${warnings.join('\n• ')}\n\nSave anyway?`;
    return Promise.resolve(window.confirm(body));
}

async function proceedSaveFromDialog(asNew) {
    flushGpOverlayStateToPlan();
    const meta = readSaveMetaFromDialog();
    if (!validateSaveMeta(meta)) return;
    if (!asNew && !canOverwriteCurrentPlan()) {
        window.notify?.error?.('Only the original author can overwrite this plan. Use Save as New.', 4500, 'Gear Planner');
        return;
    }
    const warnings = collectSaveWarnings(meta);
    if (!(await confirmSaveWarnings(warnings))) return;
    applySaveMetaToPlan(meta);
    hideSaveDialog();
    await saveCurrentPlan(asNew);
}

function populateSaveDialogFields() {
    flushGpOverlayStateToPlan();
    const roles = normalizeGearPlanRoles(currentPlan.role);
    setSaveRoleValue(roles[0] || 'dps');
    fillSaveSpecOptions(currentPlan.class, currentPlan.spec);
    const spec = document.getElementById('gp-save-spec')?.value || currentPlan.spec || '';
    saveDialogSpecBaseline = spec;
    const defaultIcon = defaultIconForClassSpec(currentPlan.class, spec);
    const icon = currentPlan.icon || defaultIcon;
    saveIconUserPicked = !!(currentPlan.icon && currentPlan.icon !== defaultIcon);
    setSaveIconPreview(icon);
    const desc = document.getElementById('gp-save-description');
    if (desc) desc.value = sanitizeGearPlanDescription(currentPlan.description || '');
    updateSaveDescCounter();
    const err = document.getElementById('gp-save-meta-error');
    if (err) err.hidden = true;
    loadWowIconsList().then(() => renderSaveIconGrid());
}

function wireSaveMetaDropdowns() {
    const root = document.getElementById('gp-save-overwrite-dialog');
    if (!root || root.dataset.saveDdWired === '1') return;
    root.dataset.saveDdWired = '1';
    root.addEventListener('click', (e) => {
        const opt = e.target.closest('.gp-save-dd-option');
        if (!opt) return;
        const container = opt.closest('.stat-dropdown-container');
        const menu = opt.closest('.stat-dropdown-menu');
        if (!container || !menu) return;
        const value = opt.dataset.value || '';
        const hidden = container.querySelector('input[type="hidden"]');
        if (hidden?.id === 'gp-save-role') {
            setSaveRoleValue(value);
        } else if (hidden?.id === 'gp-save-spec') {
            setSaveSpecValue(value);
            onSaveSpecChanged(value);
        }
        menu.style.display = 'none';
        container.querySelector('.stat-dropdown-header')?.classList.remove('open');
        container.querySelector('.stat-dropdown-header')?.setAttribute('aria-expanded', 'false');
    });
}

function wireSaveOverwriteDialog() {
    wireSaveMetaDropdowns();
    const hide = () => hideSaveDialog();
    document.getElementById('gp-save-overwrite-close')?.addEventListener('click', hide);
    document.getElementById('gp-save-dialog-backdrop')?.addEventListener('click', hide);
    document.getElementById('gp-save-cancel')?.addEventListener('click', hide);
    document.getElementById('gp-save-overwrite-confirm')?.addEventListener('click', () => proceedSaveFromDialog(false));
    document.getElementById('gp-save-new-confirm')?.addEventListener('click', () => proceedSaveFromDialog(true));
    document.getElementById('gp-save-confirm')?.addEventListener('click', () => proceedSaveFromDialog(false));
    document.getElementById('gp-save-description')?.addEventListener('input', updateSaveDescCounter);
    let filterTimer = null;
    document.getElementById('gp-save-icon-q')?.addEventListener('input', () => {
        clearTimeout(filterTimer);
        filterTimer = setTimeout(() => renderSaveIconGrid(), 120);
    });
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const dlg = document.getElementById('gp-save-overwrite-dialog');
        if (dlg && dlg.style.display !== 'none') hideSaveDialog();
    });
}

function requestSaveCurrentPlan() {
    populateSaveDialogFields();
    const existing = !!currentPlan.id;
    const canOw = canOverwriteCurrentPlan();
    const msg = document.getElementById('gp-save-overwrite-msg');
    if (msg) {
        if (existing && !canOw) {
            msg.textContent = `"${currentPlan.name || 'This plan'}" belongs to another author. You can Save as New (your own copy) — overwrite is disabled.`;
        } else if (existing) {
            msg.textContent = `"${currentPlan.name || 'This plan'}" is already saved. Choose role & spec, then overwrite or save as new.`;
        } else {
            msg.textContent = window.profileManager?.user
                ? 'Choose role & talent focus. Cloud saves are published to the community browser.'
                : 'Choose role & talent focus. Local saves stay on this device (not published to community).';
        }
    }
    const hint = document.getElementById('gp-save-author-hint');
    if (hint) hint.hidden = !(existing && !canOw);
    const overwriteBtn = document.getElementById('gp-save-overwrite-confirm');
    if (overwriteBtn) {
        overwriteBtn.disabled = existing && !canOw;
        overwriteBtn.title = (existing && !canOw) ? 'Only the original author can overwrite' : '';
    }
    const footerLeft = document.getElementById('gp-save-footer-left');
    if (footerLeft) footerLeft.hidden = !existing;
    const dlg = document.getElementById('gp-save-overwrite-dialog');
    if (dlg) {
        dlg.style.display = 'flex';
        dlg.setAttribute('aria-hidden', 'false');
    }
}

let wowIconsCache = null;

async function loadWowIconsList() {
    if (wowIconsCache) return wowIconsCache;
    try {
        const res = await fetch('/data/wow-icons.json');
        const data = await res.json();
        wowIconsCache = Array.isArray(data) ? data : [];
    } catch (e) {
        console.warn('[Gear Planner] wow-icons load failed', e);
        wowIconsCache = Object.values(DEFAULT_SPEC_ICONS_FLAT());
    }
    return wowIconsCache;
}

function DEFAULT_SPEC_ICONS_FLAT() {
    const out = {};
    for (const [cls, map] of Object.entries(classTalents)) {
        for (const tree of Object.values(map)) {
            if (tree.icon) out[`${cls}:${tree.name}`] = tree.icon;
        }
    }
    return out;
}

function wireIconPickerDialog() {
    // Icons live inside the save modal now; stub kept for init compatibility.
}

function renderSaveIconGrid() {
    const grid = document.getElementById('gp-save-icon-grid');
    if (!grid) return;
    const q = String(document.getElementById('gp-save-icon-q')?.value || '').trim().toLowerCase();
    const all = wowIconsCache || [];
    const filtered = (q ? all.filter((n) => n.includes(q)) : all).slice(0, 400);
    const selected = document.getElementById('gp-save-icon-value')?.value || '';
    grid.innerHTML = filtered.map((name) =>
        `<button type="button" class="gp-icon-pick ${name === selected ? 'is-selected' : ''}" data-icon="${escapeHtml(name)}" title="${escapeHtml(name)}" role="option" aria-selected="${name === selected ? 'true' : 'false'}">
            <img src="${resolveIconUrl(name)}" alt="" loading="lazy" width="34" height="34" />
        </button>`
    ).join('') || '<p class="gp-locations-empty">No icons match</p>';
    grid.querySelectorAll('.gp-icon-pick').forEach((btn) => {
        btn.addEventListener('click', () => {
            setSaveIconPreview(btn.dataset.icon, { userPicked: true });
            renderSaveIconGrid();
        });
    });
}

function fillCommunitySpecFilter(classId) {
    const sel = document.getElementById('gp-community-spec');
    if (!sel) return;
    const prev = sel.value;
    const specs = classId ? specsForClass(classId) : [];
    const allSpecs = classId
        ? specs
        : Object.keys(classTalents).flatMap((c) => specsForClass(c));
    const uniq = [...new Map(allSpecs.map((s) => [s.name, s])).values()];
    sel.innerHTML = `<option value="">All specs</option>` + uniq.map((s) =>
        `<option value="${escapeHtml(s.name)}">${escapeHtml(s.name)}</option>`
    ).join('');
    if (prev && uniq.some((s) => s.name === prev)) sel.value = prev;
}

function getCommunityVoterId() {
    if (window.profileManager?.user?.id) return `discord:${window.profileManager.user.id}`;
    const key = 'ichacalc_gp_voter_id';
    try {
        let id = localStorage.getItem(key);
        if (!id) {
            id = `anon_${(typeof crypto !== 'undefined' && crypto.randomUUID)
                ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
                : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`}`;
            localStorage.setItem(key, id);
        }
        return id;
    } catch {
        return `anon_${Date.now()}`;
    }
}

/** Community plan id used for voting (favorites vote via sourceCommunityId). */
function getCommunityVoteId(plan = currentPlan) {
    if (!plan) return null;
    const src = plan.sourceCommunityId ? String(plan.sourceCommunityId).trim() : '';
    if (src) return src;
    // Only community-published plans are votable by their own id (not personal copies via authorId alone).
    if (plan.community && plan.id && !String(plan.id).startsWith('local_gp_')) {
        return String(plan.id);
    }
    return null;
}

function mergePlanCommunityFields(target, source) {
    if (!target || !source) return;
    if (source.sourceCommunityId) target.sourceCommunityId = String(source.sourceCommunityId);
    if (source.community) target.community = true;
    if (source.authorId) target.authorId = String(source.authorId);
    if (source.authorName) target.authorName = String(source.authorName);
    if (source.favorite) target.favorite = true;
    if (source.upvotes != null) target.upvotes = Number(source.upvotes) || 0;
    if (source.downvotes != null) target.downvotes = Number(source.downvotes) || 0;
    if (source.myVote === 'up' || source.myVote === 'down') target.myVote = source.myVote;
    else if (source.myVote === null) target.myVote = null;
}

async function hydrateCommunityVoteMeta(plan = currentPlan) {
    const voteId = getCommunityVoteId(plan);
    if (!voteId) return;
    const voterId = getCommunityVoterId();
    let meta = null;
    if (window.profileManager?.fetchCommunityGearPlan) {
        meta = await window.profileManager.fetchCommunityGearPlan(voteId, voterId);
    } else {
        try {
            const params = new URLSearchParams({ voterId });
            const res = await fetch(`/community-gear-plans/${encodeURIComponent(voteId)}?${params}`, { credentials: 'include' });
            const data = await res.json();
            meta = data.success ? data.plan : null;
        } catch (e) {
            console.error('[Gear Planner] hydrate vote meta failed', e);
        }
    }
    if (!meta) return;
    currentPlan.upvotes = Number(meta.upvotes) || 0;
    currentPlan.downvotes = Number(meta.downvotes) || 0;
    currentPlan.myVote = meta.myVote === 'up' || meta.myVote === 'down' ? meta.myVote : null;
    updateHeaderVotesUi();
    persistSession();
}

function syncGpTalentPresetTools() {
    const tools = document.getElementById('gp-talent-preset-tools');
    if (!tools) return;
    const show = gpOverlay === 'talents' && String(currentPlan?.class || '').toLowerCase() === 'shaman';
    tools.hidden = !show;
    tools.style.display = show ? 'flex' : 'none';
}

function closeGpTalentPresetDropdown() {
    const btn = document.getElementById('gp-talent-preset-menu-btn');
    const dropdown = document.getElementById('gp-talent-preset-dropdown');
    if (!dropdown) return;
    dropdown.style.display = 'none';
    dropdown.setAttribute('aria-hidden', 'true');
    btn?.setAttribute('aria-expanded', 'false');
}

async function applyGpShamanTalentPreset(presetName) {
    const preset = SHAMAN_TALENT_PRESETS[presetName];
    const host = document.getElementById('gp-talents-host');
    if (!preset?.talents || !host) return;
    host.querySelectorAll('.talent-icon-container').forEach((el) => updateTalentPoints(el, 0));
    await applyTalentSpec(host, preset.talents);
    updateAllTalentStates(true);
    syncGpTalentsFromDom();
    requestAnimationFrame(() => fitGpTalentTree());
    closeGpTalentPresetDropdown();
}

function wireGpTalentPresetMenu() {
    const btn = document.getElementById('gp-talent-preset-menu-btn');
    const dropdown = document.getElementById('gp-talent-preset-dropdown');
    if (!btn || !dropdown || btn.dataset.wired === '1') return;
    btn.dataset.wired = '1';

    const list = document.createElement('div');
    list.className = 'gp-talent-preset-list';
    for (const name of SHAMAN_TALENT_PRESET_NAMES) {
        if (!SHAMAN_TALENT_PRESETS[name]) continue;
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'gp-talent-preset-item';
        item.setAttribute('role', 'menuitem');
        item.dataset.preset = name;
        item.title = name;
        const iconUrl = SHAMAN_PRESET_SPEC_ICONS[name];
        if (iconUrl) {
            const img = document.createElement('img');
            img.src = resolveIconUrl(iconUrl);
            img.alt = '';
            item.appendChild(img);
        }
        const label = document.createElement('span');
        label.className = 'gp-talent-preset-item-label';
        label.textContent = name;
        item.appendChild(label);
        item.addEventListener('click', (e) => {
            e.stopPropagation();
            applyGpShamanTalentPreset(name);
        });
        list.appendChild(item);
    }
    dropdown.appendChild(list);

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const open = dropdown.style.display !== 'none';
        if (open) {
            closeGpTalentPresetDropdown();
            return;
        }
        dropdown.style.display = 'block';
        dropdown.setAttribute('aria-hidden', 'false');
        btn.setAttribute('aria-expanded', 'true');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            closeGpTalentPresetDropdown();
        }
    });
}

function formatTalentSpread(spread) {
    const arr = Array.isArray(spread) && spread.length
        ? spread.map((n) => Number(n) || 0)
        : [0, 0, 0];
    while (arr.length < 3) arr.push(0);
    return arr.slice(0, 3).join('/');
}

function wireCommunitySearchDialog() {
    const hide = () => {
        const el = document.getElementById('gp-community-search-dialog');
        if (el) el.style.display = 'none';
    };
    document.getElementById('gp-community-search-close')?.addEventListener('click', hide);
    document.getElementById('gp-community-search-dialog')?.addEventListener('click', (e) => {
        if (e.target.id === 'gp-community-search-dialog') hide();
    });
    document.getElementById('gp-community-search-go')?.addEventListener('click', () => runCommunitySearch());
    document.getElementById('gp-community-q')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') runCommunitySearch();
    });
    document.getElementById('gp-community-class')?.addEventListener('change', () => {
        fillCommunitySpecFilter(document.getElementById('gp-community-class')?.value || '');
    });
    document.getElementById('gp-community-sort')?.addEventListener('change', () => runCommunitySearch());
}

function openCommunitySearchDialog() {
    fillCommunitySpecFilter(document.getElementById('gp-community-class')?.value || '');
    const dlg = document.getElementById('gp-community-search-dialog');
    if (dlg) dlg.style.display = 'flex';
    runCommunitySearch();
}

async function runCommunitySearch() {
    const results = document.getElementById('gp-community-results');
    if (results) results.innerHTML = '<div class="gp-community-empty">Searching…</div>';
    const filters = {
        q: document.getElementById('gp-community-q')?.value || '',
        class: document.getElementById('gp-community-class')?.value || '',
        role: document.getElementById('gp-community-role')?.value || '',
        spec: document.getElementById('gp-community-spec')?.value || '',
        sort: document.getElementById('gp-community-sort')?.value || 'popular',
        voterId: getCommunityVoterId(),
    };
    let plans = [];
    if (window.profileManager?.fetchCommunityGearPlans) {
        plans = await window.profileManager.fetchCommunityGearPlans(filters);
    } else {
        try {
            const params = new URLSearchParams();
            Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
            const qs = params.toString();
            const res = await fetch(`/community-gear-plans${qs ? `?${qs}` : ''}`, { credentials: 'include' });
            const data = await res.json();
            plans = data.success ? (data.plans || []) : [];
        } catch (e) {
            console.error('[Gear Planner] community search failed', e);
        }
    }
    renderCommunityResults(plans);
}

function formatCommunityDate(iso) {
    if (!iso) return '';
    try {
        const d = new Date(iso);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return '';
    }
}

function renderCommunityResults(plans) {
    const list = document.getElementById('gp-community-results');
    if (!list) return;
    if (!plans.length) {
        list.innerHTML = '<div class="gp-community-empty">No community builds found.</div>';
        return;
    }
    list.innerHTML = plans.map((p) => {
        const roles = normalizeGearPlanRoles(p.role).map((r) => formatGearPlanRoleLabel(r)).join(', ');
        const cls = p.class ? String(p.class).charAt(0).toUpperCase() + String(p.class).slice(1) : '';
        const date = formatCommunityDate(p.updatedAt || p.createdAt);
        const spread = formatTalentSpread(p.talentSpread);
        const desc = sanitizeGearPlanDescription(p.description || '');
        const up = Number(p.upvotes) || 0;
        const down = Number(p.downvotes) || 0;
        const my = p.myVote === 'up' || p.myVote === 'down' ? p.myVote : '';
        return `<article class="gp-community-card" data-id="${escapeHtml(p.id || '')}" role="listitem" tabindex="0">
            <img class="gp-community-card-icon" src="${resolveIconUrl(p.icon)}" alt="" width="48" height="48" loading="lazy" />
            <div class="gp-community-card-body">
                <div class="gp-community-card-title">${escapeHtml(p.name || 'Untitled')}</div>
                ${desc ? `<div class="gp-community-card-desc">${escapeHtml(desc)}</div>` : ''}
                <div class="gp-community-card-spread" title="Talent tree points">${escapeHtml(spread)}</div>
                <div class="gp-community-card-meta">${escapeHtml([cls, roles, p.spec].filter(Boolean).join(' · '))}</div>
                <div class="gp-community-card-author">${escapeHtml(p.authorName || 'Anonymous')}${date ? ` · ${escapeHtml(date)}` : ''}</div>
            </div>
            <div class="gp-community-card-actions" data-stop="1">
                <button type="button" class="gp-fav-community-btn" data-fav-id="${escapeHtml(p.id || '')}" title="Copy to My Gear Plans" aria-label="Favorite to My Gear Plans">★ Favorite</button>
                <div class="gp-community-card-votes">
                    <button type="button" class="gp-vote-btn gp-vote-up ${my === 'up' ? 'is-active' : ''}" data-vote="up" data-id="${escapeHtml(p.id || '')}" title="Upvote" aria-label="Upvote" aria-pressed="${my === 'up' ? 'true' : 'false'}">
                        ${GP_ICON_VOTE_UP}<span class="gp-vote-count" data-up-count>${up}</span>
                    </button>
                    <button type="button" class="gp-vote-btn gp-vote-down ${my === 'down' ? 'is-active' : ''}" data-vote="down" data-id="${escapeHtml(p.id || '')}" title="Downvote" aria-label="Downvote" aria-pressed="${my === 'down' ? 'true' : 'false'}">
                        ${GP_ICON_VOTE_DOWN}<span class="gp-vote-count" data-down-count>${down}</span>
                    </button>
                </div>
            </div>
        </article>`;
    }).join('');

    list.querySelectorAll('.gp-community-card').forEach((card) => {
        card.addEventListener('click', (e) => {
            if (e.target.closest('[data-stop]')) return;
            loadCommunityPlanById(card.dataset.id);
        });
        card.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            if (e.target.closest('[data-stop]')) return;
            e.preventDefault();
            loadCommunityPlanById(card.dataset.id);
        });
    });
    list.querySelectorAll('.gp-vote-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            voteCommunityPlan(btn.dataset.id, btn.dataset.vote);
        });
    });
    list.querySelectorAll('.gp-fav-community-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            favoriteCommunityPlanById(btn.dataset.favId);
        });
    });
}

async function voteCommunityPlan(id, direction) {
    if (!id || (direction !== 'up' && direction !== 'down')) return;
    const voterId = getCommunityVoterId();
    let updated = null;
    if (window.profileManager?.voteCommunityGearPlan) {
        updated = await window.profileManager.voteCommunityGearPlan(id, direction, voterId);
    } else {
        try {
            const res = await fetch(`/community-gear-plans/${encodeURIComponent(id)}/vote`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ direction, voterId }),
            });
            const data = await res.json();
            updated = data.success ? data.plan : null;
        } catch (e) {
            console.error('[Gear Planner] vote failed', e);
        }
    }
    if (!updated) return;
    syncVoteUiEverywhere(updated, id);
    if (planMatchesVoteId(currentPlan, id)) {
        currentPlan.upvotes = Number(updated.upvotes) || 0;
        currentPlan.downvotes = Number(updated.downvotes) || 0;
        currentPlan.myVote = updated.myVote === 'up' || updated.myVote === 'down' ? updated.myVote : null;
        persistSession();
    }
}

function applyVoteUi(updated, rootEl) {
    if (!updated || !rootEl) return;
    const upBtn = rootEl.querySelector('.gp-vote-up');
    const downBtn = rootEl.querySelector('.gp-vote-down');
    const upCount = rootEl.querySelector('[data-up-count], #gp-header-up-count');
    const downCount = rootEl.querySelector('[data-down-count], #gp-header-down-count');
    if (upCount) upCount.textContent = String(Number(updated.upvotes) || 0);
    if (downCount) downCount.textContent = String(Number(updated.downvotes) || 0);
    const my = updated.myVote === 'up' || updated.myVote === 'down' ? updated.myVote : '';
    upBtn?.classList.toggle('is-active', my === 'up');
    downBtn?.classList.toggle('is-active', my === 'down');
    if (upBtn) upBtn.setAttribute('aria-pressed', my === 'up' ? 'true' : 'false');
    if (downBtn) downBtn.setAttribute('aria-pressed', my === 'down' ? 'true' : 'false');
}

function planMatchesVoteId(plan, id) {
    if (!plan || !id) return false;
    return String(getCommunityVoteId(plan)) === String(id);
}

/** Keep header votes and any open community-card votes in sync after a vote. */
function syncVoteUiEverywhere(updated, id) {
    if (!updated || !id) return;
    if (planMatchesVoteId(currentPlan, id)) {
        currentPlan.upvotes = Number(updated.upvotes) || 0;
        currentPlan.downvotes = Number(updated.downvotes) || 0;
        currentPlan.myVote = updated.myVote === 'up' || updated.myVote === 'down' ? updated.myVote : null;
    }
    const headerWrap = document.getElementById('gp-header-votes');
    if (headerWrap && planMatchesVoteId(currentPlan, id)) {
        applyVoteUi(updated, headerWrap);
    }
    const list = document.getElementById('gp-community-results');
    if (!list) return;
    list.querySelectorAll('.gp-community-card').forEach((card) => {
        if (String(card.dataset.id) === String(id)) applyVoteUi(updated, card);
    });
}

function isCommunityPlanOpen() {
    return !!getCommunityVoteId();
}

function updateHeaderVotesUi() {
    const wrap = document.getElementById('gp-header-votes');
    if (!wrap) return;
    const show = isCommunityPlanOpen();
    wrap.hidden = !show;
    if (!show) return;
    const up = Number(currentPlan.upvotes) || 0;
    const down = Number(currentPlan.downvotes) || 0;
    const my = currentPlan.myVote === 'up' || currentPlan.myVote === 'down' ? currentPlan.myVote : '';
    const upCount = document.getElementById('gp-header-up-count');
    const downCount = document.getElementById('gp-header-down-count');
    const upBtn = document.getElementById('gp-header-vote-up');
    const downBtn = document.getElementById('gp-header-vote-down');
    if (upCount) upCount.textContent = String(up);
    if (downCount) downCount.textContent = String(down);
    upBtn?.classList.toggle('is-active', my === 'up');
    downBtn?.classList.toggle('is-active', my === 'down');
    if (upBtn) upBtn.setAttribute('aria-pressed', my === 'up' ? 'true' : 'false');
    if (downBtn) downBtn.setAttribute('aria-pressed', my === 'down' ? 'true' : 'false');
}

function wireHeaderVotes() {
    const wrap = document.getElementById('gp-header-votes');
    if (!wrap || wrap.dataset.wired === '1') return;
    wrap.dataset.wired = '1';
    wrap.querySelectorAll('.gp-vote-btn').forEach((btn) => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const voteId = getCommunityVoteId();
            if (!voteId) return;
            voteCommunityPlan(voteId, btn.dataset.vote);
        });
    });
}

async function favoriteCommunityPlanById(id) {
    if (!id) return;
    let plan = null;
    if (window.profileManager?.fetchCommunityGearPlan) {
        plan = await window.profileManager.fetchCommunityGearPlan(id);
    } else {
        try {
            const res = await fetch(`/community-gear-plans/${encodeURIComponent(id)}`, { credentials: 'include' });
            const data = await res.json();
            plan = data.success ? data.plan : null;
        } catch (e) {
            console.error('[Gear Planner] favorite fetch failed', e);
        }
    }
    if (!plan) {
        window.notify?.error?.('Could not favorite community plan', 4000, 'Gear Planner');
        return;
    }
    const copy = getGearPlanData(plan);
    copy.sourceCommunityId = String(plan.id);
    copy.community = false;
    copy.favorite = true;
    copy.description = sanitizeGearPlanDescription(plan.description || copy.description);
    if (plan.icon) copy.icon = plan.icon;
    delete copy.id;
    delete copy.upvotes;
    delete copy.downvotes;
    delete copy.myVote;
    delete copy.votes;

    if (window.profileManager?.user) {
        const saved = await window.profileManager.saveGearPlan(copy);
        if (saved) {
            window.notify?.success?.('Saved to My Gear Plans', 3000, 'Gear Planner');
            return;
        }
        window.notify?.error?.('Cloud favorite failed', 4000, 'Gear Planner');
        return;
    }

    const local = loadLocalGearPlans();
    const src = String(plan.id);
    const idx = local.findIndex((p) => String(p.sourceCommunityId || '') === src || String(p.id) === src);
    copy.id = idx >= 0 ? local[idx].id : `local_gp_${Date.now()}`;
    copy.updatedAt = new Date().toISOString();
    if (idx >= 0) local[idx] = { ...local[idx], ...copy, favorite: true };
    else local.push(copy);
    saveLocalGearPlans(local);
    window.notify?.success?.('Saved to My Gear Plans (local)', 3000, 'Gear Planner');
}

async function loadCommunityPlanById(id) {
    if (!id) return;
    let plan = null;
    const voterId = getCommunityVoterId();
    if (window.profileManager?.fetchCommunityGearPlan) {
        plan = await window.profileManager.fetchCommunityGearPlan(id, voterId);
    } else {
        try {
            const qs = voterId ? `?voterId=${encodeURIComponent(voterId)}` : '';
            const res = await fetch(`/community-gear-plans/${encodeURIComponent(id)}${qs}`, { credentials: 'include' });
            const data = await res.json();
            plan = data.success ? data.plan : null;
        } catch (e) {
            console.error('[Gear Planner] load community plan failed', e);
        }
    }
    if (!plan) {
        window.notify?.error?.('Could not load community gear plan', 4000, 'Gear Planner');
        return;
    }
    plan.community = true;
    if (!plan.id) plan.id = id;
    const dlg = document.getElementById('gp-community-search-dialog');
    if (dlg) dlg.style.display = 'none';
    await loadPlanIntoView(plan);
    window.notify?.success?.(`Loaded "${plan.name || 'community plan'}"`, 3000, 'Gear Planner');
}

function ensurePlanStRotation() {
    if (!currentPlan.ui) currentPlan.ui = { collapsed: {} };
    if (currentPlan.ui.stRotation !== 'eleSt' && currentPlan.ui.stRotation !== 'enhSt') {
        currentPlan.ui.stRotation = 'enhSt';
    }
}

function syncGpStRotationUi() {
    ensurePlanStRotation();
    const mode = currentPlan.ui.stRotation;
    document.querySelectorAll('#gp-st-rotation-row [data-gp-st-rot]').forEach(btn => {
        const on = btn.dataset.gpStRot === mode;
        btn.classList.toggle('is-active', on);
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
}

function updateQuickSimVisibility() {
    const btn = document.getElementById('gp-quick-sim-btn');
    const cfg = document.getElementById('gp-sim-settings-btn');
    const simWrap = document.getElementById('gp-header-sim');
    const rotRow = document.getElementById('gp-st-rotation-row');
    const wrap = document.getElementById('gp-quick-sim-wrap');
    const resultEl = document.getElementById('gp-quick-sim-result');
    const isShaman = currentPlan.class === 'shaman';
    if (btn) btn.style.display = isShaman ? '' : 'none';
    if (cfg) cfg.style.display = isShaman ? '' : 'none';
    if (simWrap) {
        simWrap.hidden = !isShaman;
        simWrap.style.display = isShaman ? '' : 'none';
    }
    if (rotRow) {
        rotRow.hidden = !isShaman;
        rotRow.style.display = isShaman ? '' : 'none';
    }
    if (resultEl) resultEl.style.display = isShaman ? '' : 'none';
    if (isShaman) {
        syncGpStRotationUi();
        prepareDpsSimConfigForGearPlanner();
    }
    let hintDismissed = false;
    try { hintDismissed = localStorage.getItem(SIM_HINT_DISMISS_KEY) === '1'; } catch { hintDismissed = false; }
    if (wrap) {
        const showHint = isShaman && !hintDismissed;
        wrap.hidden = !showHint;
        wrap.style.display = showHint ? '' : 'none';
    }
}

function syncEditModeUi() {
    const shell = document.getElementById('gear-planner-shell');
    shell?.classList.toggle('gp-view-mode', !editMode);
    const btn = document.getElementById('gp-edit-mode-btn');
    if (btn) {
        btn.setAttribute('aria-pressed', editMode ? 'true' : 'false');
        btn.classList.toggle('is-active', editMode);
    }
}

function escapeHtml(str) {
    return String(str ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatPlannerSourceLine(itemId) {
    return formatItemSourceLine(itemId);
}

const LOCATION_KIND_ORDER = [
    ['dungeon', 'Dungeons'],
    ['raid', 'Raids'],
    ['worldboss', 'World Bosses'],
    ['other', 'Other'],
];

function collectPlanItemIds(plan) {
    const ids = [];
    for (const slot of Object.values(plan?.slots || {})) {
        if (slot?.primary != null) ids.push(slot.primary);
        if (Array.isArray(slot?.alternatives)) {
            for (const alt of slot.alternatives) {
                if (alt != null) ids.push(alt);
            }
        }
    }
    return ids;
}

function sortLocationEntries(kind, entries) {
    if (kind === 'dungeon') {
        const groups = getInstanceFilterGroups();
        const order = new Map((groups.dungeons || []).map((d, i) => [d.id, i]));
        return [...entries].sort((a, b) => {
            const ia = order.has(a.id) ? order.get(a.id) : 999;
            const ib = order.has(b.id) ? order.get(b.id) : 999;
            if (ia !== ib) return ia - ib;
            return String(a.name).localeCompare(String(b.name));
        });
    }
    return [...entries].sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

function collectLocationGroups(plan) {
    const byKind = {
        dungeon: new Map(),
        raid: new Map(),
        worldboss: new Map(),
        other: new Map(),
    };
    const ensureEntry = (kind, id, name) => {
        if (!byKind[kind].has(id)) byKind[kind].set(id, { id, name, items: [] });
        return byKind[kind].get(id);
    };
    for (const itemId of collectPlanItemIds(plan)) {
        const sources = getPreferredSourcesForItem(itemId);
        const item = callbacks.getItemById?.(itemId);
        const itemName = item?.name || `Item ${itemId}`;
        if (!sources.length) {
            const entry = ensureEntry('other', '__other__', 'Other / Unknown');
            if (!entry.items.some(i => i.id === itemId)) {
                entry.items.push({ id: itemId, name: itemName, quality: item?.quality ?? 0 });
            }
            continue;
        }
        for (const s of sources) {
            const kind = (s.kind === 'dungeon' || s.kind === 'raid' || s.kind === 'worldboss') ? s.kind : 'other';
            const id = s.instanceId || s.instanceName || '__other__';
            const name = s.instanceName || s.tableTitle || id;
            const entry = ensureEntry(kind, id, name);
            if (!entry.items.some(i => i.id === itemId)) {
                entry.items.push({ id: itemId, name: itemName, quality: item?.quality ?? 0 });
            }
        }
    }
    return LOCATION_KIND_ORDER
        .filter(([kind]) => byKind[kind].size)
        .map(([kind, label]) => ({
            kind,
            label,
            entries: sortLocationEntries(kind, [...byKind[kind].values()]),
        }));
}

function renderLocationsSidebar() {
    const list = document.getElementById('gp-locations-list');
    if (!list) return;
    const groups = collectLocationGroups(currentPlan);
    if (!groups.length) {
        list.innerHTML = '<p class="gp-locations-empty">No locations yet</p>';
        clearLocationHighlights();
        return;
    }
    list.innerHTML = groups.map(g => `
        <div class="gp-locations-group" data-kind="${escapeHtml(g.kind)}">
            <h4 class="gp-locations-group-heading">${escapeHtml(g.label)}</h4>
            <ul>${g.entries.map(e => `<li class="gp-location-entry" data-instance-id="${escapeHtml(e.id)}" data-instance-name="${escapeHtml(e.name)}">
                <span class="gp-location-name">${escapeHtml(e.name)}</span>
                <ul class="gp-location-items">${(e.items || []).map(it => {
                    const q = it.quality ?? callbacks.getItemById?.(it.id)?.quality ?? 0;
                    return `<li class="gp-location-item" data-item-id="${it.id}"><span class="q${q}">${escapeHtml(it.name)}</span></li>`;
                }).join('')}</ul>
            </li>`).join('')}</ul>
        </div>`).join('');
    bindLocationHoverHighlights();
    bindLocationItemClicks();
}

function clearLocationHighlights() {
    document.querySelectorAll('.gp-item-name--location-hl').forEach(el => el.classList.remove('gp-item-name--location-hl'));
    document.querySelectorAll('.gp-row--location-hl').forEach(el => el.classList.remove('gp-row--location-hl'));
    document.getElementById('gear-planner-shell')?.classList.remove('gp-location-hovering');
}

function itemMatchesLocationHover(itemId, instanceId, instanceName) {
    const sources = getPreferredSourcesForItem(itemId);
    if (!sources.length) {
        return instanceId === '__other__' || instanceName === 'Other / Unknown';
    }
    return sources.some(s =>
        (instanceId && s.instanceId === instanceId) ||
        (instanceName && s.instanceName === instanceName)
    );
}

function applyLocationHighlights(instanceId, instanceName) {
    clearLocationHighlights();
    document.getElementById('gear-planner-shell')?.classList.add('gp-location-hovering');
    document.querySelectorAll('#gear-planner-shell .gp-primary-row[data-item-id], #gear-planner-shell .gp-alt-row[data-item-id]').forEach(el => {
        const itemId = Number(el.dataset.itemId);
        if (!itemId || !itemMatchesLocationHover(itemId, instanceId, instanceName)) return;
        el.classList.add('gp-row--location-hl');
        el.querySelector('.gp-item-name-text')?.classList.add('gp-item-name--location-hl');
    });
}

function bindLocationHoverHighlights() {
    const list = document.getElementById('gp-locations-list');
    if (!list) return;
    list.querySelectorAll('.gp-location-entry').forEach(li => {
        li.addEventListener('mouseenter', () => {
            applyLocationHighlights(li.dataset.instanceId || '', li.dataset.instanceName || '');
        });
        li.addEventListener('mouseleave', () => clearLocationHighlights());
    });
}

function bindLocationItemClicks() {
    document.querySelectorAll('#gp-locations-list .gp-location-item').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const id = el.dataset.itemId;
            if (id) window.open('https://octowow.st/db/?item=' + id, '_blank');
        });
    });
}

function itemIconHtml(item) {
    const src = resolveIconUrl(item?.icon || 'inv_misc_questionmark');
    return `<img src="${src}" alt="${escapeHtml(item?.name || '')}">`;
}

function gpItemScoreBadgesHtml(item) {
    if (!item) return '';
    const parts = [];
    const dpsW = resolveGpDpsWeights(false);
    const tankW = resolveGpTankWeights();
    if (hasMeaningfulDpsWeights(dpsW)) {
        const dps = calculateItemDpsScore(item, dpsW);
        if (dps != null) parts.push(`<span class="gp-item-score-dps" title="Estimated DPS score">~${Math.round(dps).toLocaleString()} DPS</span>`);
    }
    if (hasMeaningfulTankWeights(tankW)) {
        const tank = calculateItemTankScore(item, tankW);
        if (tank) {
            parts.push(`<span class="gp-item-score-tank" title="Tank score = EHP contribution + MIT contribution">${formatItemTankScoreBadge(tank)}</span>`);
        }
    }
    if (!parts.length) return '';
    return `<div class="gp-item-scores">${parts.join('')}</div>`;
}

function renderItemMeta(item, enchantChrome = '') {
    if (!item) return '';
    const q = item.quality ?? 0;
    const source = formatPlannerSourceLine(item.id);
    return `<div class="gp-item-meta">
        <div class="gp-item-name-row">
            <div class="gp-item-name q${q}"><span class="gp-item-name-text">${escapeHtml(item.name || `Item ${item.id}`)}</span></div>
            ${enchantChrome}
        </div>
        ${source ? `<div class="gp-item-source">${escapeHtml(source)}</div>` : ''}
        ${gpItemScoreBadgesHtml(item)}
    </div>`;
}

export function renderGearPlanner() {
    const nameInput = document.getElementById('gp-plan-name');
    if (nameInput && nameInput !== document.activeElement) {
        nameInput.value = sanitizeGearPlanName(currentPlan.name, 'Gear Plan');
        syncGpPlanNameInputWidth(nameInput);
    }
    generateGpClassIcons();
    generateGpRaceIcons();
    updateQuickSimVisibility();
    updateStatWeightsBtnVisibility();
    updateHeaderVotesUi();
    syncEditModeUi();
    renderLocationsSidebar();
    renderStatsSidebar();

    const leftCol = document.getElementById('gp-slots-left');
    const rightCol = document.getElementById('gp-slots-right');
    if (!leftCol || !rightCol) return;

    leftCol.innerHTML = LEFT_SLOTS.map(s => renderSlotCard(s, 'left')).join('');
    rightCol.innerHTML = RIGHT_SLOTS.map(s => renderSlotCard(s, 'right')).join('');

    bindSlotEvents();
    persistSession();
}

function getGpClassId() {
    return currentPlan.class || document.getElementById('gp-class-sidebar')?.dataset.selectedClass || 'warrior';
}

function gpSlotAddButtonHtml(slotId, hasPrimary, side) {
    const url = getEmptySlotPlaceholderUrl(slotId, getGpClassId());
    const label = SLOT_LABELS[slotId] || slotId;
    const title = hasPrimary ? `Add ${label} alternative` : `Add ${label}`;
    return `<div class="gp-slot-add-wrap">
        <button type="button" class="gp-slot-add" data-slot="${slotId}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${editMode ? '' : ' disabled'}>
            <img src="${url}" alt="">
            <span class="gp-slot-add-plus" aria-hidden="true">+</span>
        </button>
    </div>`;
}

function renderSlotCard(slotId, side) {
    if (!currentPlan.ui) currentPlan.ui = { collapsed: {} };
    if (!currentPlan.ui.collapsed) currentPlan.ui.collapsed = {};

    const slot = currentPlan.slots[slotId];
    const collapsed = currentPlan.ui.collapsed[slotId] !== false;
    const primaryId = slot?.primary;
    const alts = slot?.alternatives || [];
    const primaryItem = primaryId && callbacks.getItemById ? callbacks.getItemById(primaryId) : null;
    const label = SLOT_LABELS[slotId] || slotId;
    const empty = !primaryItem;
    const expanded = !collapsed && !empty;

    const altsHtml = alts.map((id, i) => {
        const it = callbacks.getItemById?.(id);
        const q = it?.quality ?? 0;
        const name = it?.name || `Item ${id}`;
        const source = it ? formatPlannerSourceLine(it.id) : '';
        const icon = it ? itemIconHtml(it) : '';
        return `<div class="gp-alt-row" data-slot="${slotId}" data-gp-role="alt" data-alt-index="${i}" data-item-id="${id}">
            <div class="gp-alt-icon gp-drag-handle gp-item-tip" draggable="${editMode ? 'true' : 'false'}" data-slot="${slotId}" data-gp-role="alt" data-alt-index="${i}" data-item-id="${id}">${icon}</div>
            <div class="gp-item-meta">
                <div class="gp-item-name q${q}"><span class="gp-item-name-text">${escapeHtml(name)}</span></div>
                ${source ? `<div class="gp-item-source">${escapeHtml(source)}</div>` : ''}
                ${it ? gpItemScoreBadgesHtml(it) : ''}
            </div>
            <button type="button" class="gp-remove-alt" data-slot="${slotId}" data-alt-index="${i}" title="Remove"${editMode ? '' : ' hidden'}>×</button>
        </div>`;
    }).join('');

    const showEnchant = gpSlotShowsEnchant(slotId, primaryItem);
    const enchantChrome = showEnchant ? gpEnchantChromeHtml(slotId, side) : '';

    const nameBlock = empty
        ? `<div class="gp-item-name-row"><span class="gp-empty-label">${escapeHtml(label)}</span>${enchantChrome}</div>`
        : renderItemMeta(primaryItem, enchantChrome);
    const toggleBtn = `<button type="button" class="gp-toggle-alts" data-slot="${slotId}" aria-expanded="${expanded}" title="Alternatives">▾</button>`;
    const clearBtn = `<button type="button" class="gp-clear-primary" data-slot="${slotId}" title="Clear"${editMode ? '' : ' hidden'}>×</button>`;
    const primaryInner = empty
        ? `<div class="gp-empty-primary">${nameBlock}</div>`
        : `<div class="gp-primary-row" data-slot="${slotId}" data-item-id="${primaryItem.id}" data-gp-role="primary">
                <span class="gp-slot-icon-frame gp-drag-handle gp-item-tip" draggable="${editMode ? 'true' : 'false'}" data-slot="${slotId}" data-gp-role="primary" data-item-id="${primaryItem.id}">${itemIconHtml(primaryItem)}</span>
                ${nameBlock}
                ${clearBtn}
                ${toggleBtn}
           </div>`;

    const card = `<article class="gp-slot-card gp-slot-card--${side}${empty ? ' gp-slot-card--empty' : ''}${expanded ? ' gp-slot-card--expanded' : ''}"
        data-slot="${slotId}" data-side="${side}" aria-expanded="${expanded}">
        <div class="gp-slot-card-header">${primaryInner}</div>
        <div class="gp-alts-panel" data-slot="${slotId}" ${expanded ? '' : 'hidden'}>
            ${altsHtml}
        </div>
    </article>`;
    const addBtn = gpSlotAddButtonHtml(slotId, !empty, side);
    return side === 'right'
        ? `<div class="gp-slot-row gp-slot-row--right">${card}${addBtn}</div>`
        : `<div class="gp-slot-row gp-slot-row--left">${addBtn}${card}</div>`;
}

function toggleSlotCollapsed(slotId) {
    if (!currentPlan.ui) currentPlan.ui = { collapsed: {} };
    if (!currentPlan.ui.collapsed) currentPlan.ui.collapsed = {};
    const wasCollapsed = currentPlan.ui.collapsed[slotId] !== false;
    currentPlan.ui.collapsed[slotId] = !wasCollapsed;
    renderGearPlanner();
}

function bindSlotEvents() {
    document.querySelectorAll('.gp-slot-card').forEach(card => {
        card.addEventListener('click', (e) => {
            if (gpDidDrag) return;
            if (e.target.closest('.gp-slot-add, .gp-empty-primary, .gp-remove-alt, .gp-clear-primary, .gp-toggle-alts, .gp-drag-handle, .gp-enchant-btn')) return;
            const slotId = card.dataset.slot;
            if (!currentPlan.slots[slotId]?.primary) {
                if (editMode) openPickerForSlot(slotId, false);
                return;
            }
            toggleSlotCollapsed(slotId);
        });
    });

    document.querySelectorAll('.gp-slot-add').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!editMode) return;
            const slotId = el.dataset.slot;
            const hasPrimary = !!currentPlan.slots[slotId]?.primary;
            editingAltSlot = hasPrimary ? slotId : null;
            openPickerForSlot(slotId, hasPrimary);
        });
    });

    document.querySelectorAll('.gp-clear-primary').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            currentPlan.slots[el.dataset.slot].primary = null;
            currentPlan.slots[el.dataset.slot].enchant = null;
            renderGearPlanner();
        });
    });

    document.querySelectorAll('.gp-remove-alt').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            const slotId = el.dataset.slot;
            const idx = parseInt(el.dataset.altIndex, 10);
            currentPlan.slots[slotId].alternatives.splice(idx, 1);
            renderGearPlanner();
        });
    });

    document.querySelectorAll('.gp-toggle-alts').forEach(el => {
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleSlotCollapsed(el.dataset.slot);
        });
    });

    document.querySelectorAll('#gear-planner-shell .gp-enchant-btn').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openEnchantPickerForSlot(el.dataset.slot);
        });
        el.addEventListener('mousedown', (e) => e.stopPropagation());
        el.addEventListener('dragstart', (e) => {
            e.preventDefault();
            e.stopPropagation();
        });
    });

    bindPlannerTooltips();
    bindPlannerDragDrop();
    bindPlannerMiddleClick();
}

function bindPlannerTooltips() {
    const tooltip = document.getElementById('item-tooltip');
    if (!tooltip) return;
    document.querySelectorAll('#gear-planner-shell .gp-item-tip').forEach(el => {
        const itemId = Number(el.dataset.itemId);
        const item = itemId && callbacks.getItemById ? callbacks.getItemById(itemId) : null;
        if (!item) return;
        el.addEventListener('mouseenter', () => {
            tooltip.innerHTML = createItemTooltipHTML(item);
            tooltip.style.display = 'block';
            const side = el.closest('#gp-slots-right') || el.closest('.gp-slot-card--right') ? 'east' : 'left';
            requestAnimationFrame(() => positionItemTooltipOnIcon(tooltip, el, { side }));
        });
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
    document.querySelectorAll('#gear-planner-shell .gp-enchant-btn').forEach(el => {
        el.addEventListener('mouseenter', async (e) => {
            e.stopPropagation();
            const slotId = el.dataset.slot;
            const idx = currentPlan.slots[slotId]?.enchant;
            const enchant = idx != null ? enchantDatabase[slotId]?.[idx] : null;
            if (!enchant || enchant.name === 'None') return;
            tooltip.innerHTML = await createEnchantTooltipHTML(enchant);
            tooltip.style.display = 'block';
            const side = el.dataset.side === 'right' ? 'east' : 'left';
            requestAnimationFrame(() => positionItemTooltipOnIcon(tooltip, el, { side }));
        });
        el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
    });
}

function bindPlannerMiddleClick() {
    document.querySelectorAll('#gear-planner-shell .gp-item-tip').forEach(el => {
        el.addEventListener('mousedown', (e) => {
            if (e.button !== 1) return;
            e.preventDefault();
            e.stopPropagation();
            const itemId = el.dataset.itemId;
            if (itemId) window.open('https://octowow.st/db/?item=' + itemId, '_blank');
        });
    });
}

function parseDropTarget(el) {
    const handle = el.closest?.('.gp-drag-handle');
    const row = el.closest?.('.gp-primary-row, .gp-alt-row');
    const node = handle || row;
    if (!node) return null;
    return {
        slot: node.dataset.slot,
        role: node.dataset.gpRole || (node.classList.contains('gp-primary-row') ? 'primary' : 'alt'),
        altIndex: node.dataset.altIndex != null ? parseInt(node.dataset.altIndex, 10) : null,
    };
}

function bindPlannerDragDrop() {
    if (!editMode) return;
    const handles = document.querySelectorAll('#gear-planner-shell .gp-drag-handle');
    const dropRows = document.querySelectorAll('#gear-planner-shell .gp-primary-row, #gear-planner-shell .gp-alt-row');

    handles.forEach(el => {
        el.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            gpDidDrag = true;
            const payload = {
                slot: el.dataset.slot,
                role: el.dataset.gpRole,
                altIndex: el.dataset.altIndex != null ? parseInt(el.dataset.altIndex, 10) : null,
                itemId: Number(el.dataset.itemId),
            };
            e.dataTransfer.setData('application/json', JSON.stringify(payload));
            e.dataTransfer.setData('text/plain', JSON.stringify(payload));
            e.dataTransfer.effectAllowed = 'move';
            el.classList.add('gp-dragging');
            const tooltip = document.getElementById('item-tooltip');
            if (tooltip) tooltip.style.display = 'none';
        });
        el.addEventListener('dragend', () => {
            el.classList.remove('gp-dragging');
            document.querySelectorAll('.gp-drop-target').forEach(n => n.classList.remove('gp-drop-target'));
            setTimeout(() => { gpDidDrag = false; }, 0);
        });
        el.addEventListener('click', (e) => {
            e.stopPropagation();
            if (gpDidDrag) {
                e.preventDefault();
                return;
            }
            if (!editMode || el.dataset.gpRole !== 'primary') return;
            editingAltSlot = null;
            openPickerForSlot(el.dataset.slot, false);
        });
    });

    const bindDropZone = (el) => {
        el.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            el.classList.add('gp-drop-target');
        });
        el.addEventListener('dragleave', () => el.classList.remove('gp-drop-target'));
        el.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            el.classList.remove('gp-drop-target');
            let payload;
            try {
                payload = JSON.parse(e.dataTransfer.getData('application/json') || e.dataTransfer.getData('text/plain') || '{}');
            } catch {
                return;
            }
            const to = parseDropTarget(el);
            if (applyGearPlanItemMove(currentPlan, payload, to)) renderGearPlanner();
        });
    };
    handles.forEach(bindDropZone);
    dropRows.forEach(bindDropZone);
}

async function openEnchantPickerForSlot(slotId) {
    if (!callbacks.openEnchantModalForGearPlan) return;
    const primaryId = currentPlan.slots[slotId]?.primary;
    const item = primaryId != null ? callbacks.getItemById?.(primaryId) : null;
    await callbacks.openEnchantModalForGearPlan(slotId, item);
}

async function openPickerForSlot(slotId, isAlt) {
    if (!editMode || !callbacks.openItemModalForGearPlan) return;
    pickCallback = (item) => {
        if (isAlt) {
            const alts = currentPlan.slots[slotId].alternatives;
            if (!alts.includes(item.id) && currentPlan.slots[slotId].primary !== item.id) {
                alts.push(item.id);
            }
        } else {
            currentPlan.slots[slotId].primary = item.id;
            currentPlan.slots[slotId].alternatives = (currentPlan.slots[slotId].alternatives || [])
                .filter(id => id !== item.id);
            pruneSlotEnchant(slotId);
        }
        renderGearPlanner();
    };
    await callbacks.openItemModalForGearPlan(slotId, currentPlan.class);
}

async function saveCurrentPlan(asNew = false) {
    flushGpOverlayStateToPlan();
    if (!asNew && !canOverwriteCurrentPlan()) {
        window.notify?.error?.('Only the original author can overwrite this plan. Use Save as New.', 4500, 'Gear Planner');
        return;
    }
    const plan = getGearPlanData(currentPlan);
    plan.name = sanitizeGearPlanName(currentPlan.name || plan.name, 'Gear Plan');
    currentPlan.name = plan.name;
    plan.updatedAt = new Date().toISOString();
    plan.role = normalizeGearPlanRoles(currentPlan.role);
    plan.spec = currentPlan.spec || '';
    // Preserve user-picked icon; never force-overwrite with a different default
    plan.icon = currentPlan.icon || defaultIconForClassSpec(plan.class, plan.spec);
    plan.description = sanitizeGearPlanDescription(currentPlan.description || '');
    const dpsW = resolveGpDpsWeights(false);
    const dpsAoe = resolveGpDpsWeights(true);
    const tankW = resolveGpTankWeights();
    if (dpsW) plan.statWeights = dpsW;
    if (dpsAoe) plan.statWeightsAoe = dpsAoe;
    if (tankW) plan.tankStatWeights = tankW;
    if (!plan.role.length || !plan.spec) {
        window.notify?.error?.('Role and talent tree focus are required to save', 4000, 'Gear Planner');
        requestSaveCurrentPlan();
        return;
    }
    if (asNew) {
        delete plan.id;
        delete plan.authorId;
        delete plan.authorName;
        delete plan.upvotes;
        delete plan.downvotes;
        delete plan.myVote;
        delete plan.sourceCommunityId;
    }

    if (window.profileManager?.user) {
        plan.community = true;
        const saved = await window.profileManager.saveGearPlan(plan);
        if (saved) {
            const id = saved.id || plan.id;
            if (id) currentPlan.id = id;
            if (saved.favorite) currentPlan.favorite = true;
            if (saved.role) currentPlan.role = normalizeGearPlanRoles(saved.role);
            if (saved.spec) currentPlan.spec = saved.spec;
            if (saved.icon) currentPlan.icon = saved.icon;
            if (saved.description != null) currentPlan.description = sanitizeGearPlanDescription(saved.description);
            if (saved.authorId) currentPlan.authorId = String(saved.authorId);
            if (saved.authorName) currentPlan.authorName = saved.authorName;
            currentPlan.community = true;
            editMode = false;
            persistSession();
            renderGearPlanner();
            window.notify?.success('Gear plan saved to cloud (community)', 3000, 'Gear Planner');
        } else {
            window.notify?.error?.('Cloud save failed — you may not overwrite another author’s plan', 4500, 'Gear Planner');
        }
        return;
    }

    plan.community = false;
    const local = loadLocalGearPlans();
    if (asNew || !plan.id) plan.id = `local_gp_${Date.now()}`;
    const existing = local.findIndex(p => p.id === plan.id);
    if (existing >= 0) local[existing] = { ...local[existing], ...plan };
    else local.push(plan);
    saveLocalGearPlans(local);
    currentPlan.id = plan.id;
    editMode = false;
    persistSession();
    renderGearPlanner();
    window.notify?.success('Gear plan saved locally', 3000, 'Gear Planner');
}

function closeGearPlansDropdown() {
    document.getElementById('gear-plans-dropdown')?.classList.remove('open');
}

function starBtnHtml(plan, isLocal) {
    const on = !!plan.favorite;
    return `<button class="builds-dropdown-action-btn default-btn ${on ? 'is-default' : ''}" data-id="${plan.id || ''}" data-local="${isLocal ? '1' : ''}" title="${on ? 'Unfavorite' : 'Favorite'}">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="${on ? '#ffd700' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
    </button>`;
}

function shareBtnHtml(plan) {
    return `<button class="builds-dropdown-action-btn share-btn" data-id="${plan.id || ''}" title="Share">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="18" cy="5" r="3"></circle>
            <circle cx="6" cy="12" r="3"></circle>
            <circle cx="18" cy="19" r="3"></circle>
            <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"></line>
            <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"></line>
        </svg>
    </button>`;
}

function gearPlanRowHtml(plan, isLocal) {
    const cls = plan.class ? String(plan.class).charAt(0).toUpperCase() + String(plan.class).slice(1) : '';
    const favBadge = plan.favorite ? '<span class="default-badge">favorite</span>' : '';
    const localBadge = isLocal ? '<span class="default-badge local-device-badge">local</span>' : '';
    return `<div class="builds-dropdown-item" data-id="${plan.id || ''}" data-local="${isLocal ? '1' : ''}">
        <div class="builds-dropdown-item-info">
            <div class="builds-dropdown-item-name">${escapeHtml(plan.name || 'Untitled')}${favBadge}${localBadge}</div>
            ${cls ? `<div class="builds-dropdown-item-details">${escapeHtml(cls)}</div>` : ''}
        </div>
        <div class="builds-dropdown-item-actions">
            ${starBtnHtml(plan, isLocal)}
            ${shareBtnHtml(plan)}
            <button class="builds-dropdown-action-btn delete-btn" data-id="${plan.id || ''}" data-local="${isLocal ? '1' : ''}" title="Delete">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="3 6 5 6 21 6"></polyline>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        </div>
    </div>`;
}

function sortPlansFavFirst(plans) {
    return [...plans].sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || String(a.name || '').localeCompare(String(b.name || '')));
}

function loadPlanIntoView(plan) {
    if (!plan) return;
    const prevId = currentPlan?.id;
    currentPlan = getGearPlanData(plan);
    mergePlanCommunityFields(currentPlan, plan);
    if (plan.id) currentPlan.id = plan.id;
    if (plan.statWeights) currentPlan.statWeights = plan.statWeights;
    if (plan.statWeightsAoe) currentPlan.statWeightsAoe = plan.statWeightsAoe;
    if (plan.tankStatWeights) currentPlan.tankStatWeights = plan.tankStatWeights;
    currentPlan.name = sanitizeGearPlanName(currentPlan.name, 'Gear Plan');
    // Reload from My Gear Plans / community overwrites local weight drafts for this plan id
    try {
        localStorage.removeItem(gpLocalWeightsStorageKey(plan.id || prevId));
        if (plan.statWeights) saveGearPlannerDpsStatWeights(plan.statWeights, false);
        if (plan.statWeightsAoe) saveGearPlannerDpsStatWeights(plan.statWeightsAoe, true);
        if (plan.tankStatWeights) saveGearPlannerTankStatWeights(plan.tankStatWeights);
    } catch { /* ignore */ }
    editMode = false;
    persistSession();
    closeGearPlansDropdown();
    updateHeaderVotesUi();
    updateStatWeightsBtnVisibility();
    const ready = refreshGearPlannerWhenItemsReady(currentPlan);
    hydrateCommunityVoteMeta();
    return ready;
}

async function openLoadDropdown() {
    const dropdown = document.getElementById('gear-plans-dropdown');
    const list = document.getElementById('gear-plans-dropdown-list');
    if (!dropdown || !list) return;

    if (dropdown.classList.contains('open')) {
        closeGearPlansDropdown();
        return;
    }

    let cloud = [];
    if (window.profileManager?.user) {
        cloud = await window.profileManager.fetchGearPlans?.() || [];
    }
    const local = loadLocalGearPlans();
    const localOnly = local.filter(lp => !cloud.some(c => String(c.id) === String(lp.id)));

    if (!cloud.length && !localOnly.length) {
        list.innerHTML = '<div class="builds-dropdown-empty">No saved gear plans yet.<br>Click Save to keep this plan.</div>';
    } else {
        const parts = [];
        if (cloud.length) parts.push(...sortPlansFavFirst(cloud).map(p => gearPlanRowHtml(p, false)));
        if (localOnly.length) {
            if (cloud.length) parts.push('<div class="builds-dropdown-divider" role="separator"></div>');
            parts.push('<div class="builds-dropdown-section-label">Local plans</div>');
            parts.push(...sortPlansFavFirst(localOnly).map(p => gearPlanRowHtml(p, true)));
        }
        list.innerHTML = parts.join('');
    }

    const allPlans = [...cloud, ...localOnly];
    list.querySelectorAll('.builds-dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            if (e.target.closest('.builds-dropdown-action-btn')) return;
            const plan = allPlans.find(p => String(p.id) === item.dataset.id);
            loadPlanIntoView(plan);
        });
        item.querySelector('.default-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.currentTarget.dataset.id;
            const isLocal = item.dataset.local === '1';
            if (isLocal) {
                const plans = loadLocalGearPlans();
                const p = plans.find(x => String(x.id) === String(id));
                if (p) {
                    p.favorite = !p.favorite;
                    saveLocalGearPlans(plans);
                }
            } else if (window.profileManager?.setGearPlanFavorite) {
                await window.profileManager.setGearPlanFavorite(id);
            }
            closeGearPlansDropdown();
            openLoadDropdown();
        });
        item.querySelector('.share-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const plan = allPlans.find(p => String(p.id) === item.dataset.id);
            closeGearPlansDropdown();
            if (window.profileManager?.user && window.profileManager.openShareModal && plan) {
                window.profileManager.openShareModal({ id: plan.id, name: plan.name, kind: 'gearPlan', buildData: plan });
            } else if (plan && callbacks.exportGearPlanToURL) {
                await callbacks.exportGearPlanToURL(getGearPlanData(plan));
            }
        });
        item.querySelector('.delete-btn')?.addEventListener('click', async (e) => {
            e.stopPropagation();
            const id = e.currentTarget.dataset.id;
            const plan = allPlans.find(p => String(p.id) === String(id));
            if (!plan || !confirm(`Delete gear plan "${plan.name || 'Untitled'}"?`)) return;
            if (item.dataset.local === '1') {
                saveLocalGearPlans(loadLocalGearPlans().filter(p => String(p.id) !== String(id)));
            } else if (window.profileManager?.deleteGearPlan) {
                await window.profileManager.deleteGearPlan(id);
            }
            closeGearPlansDropdown();
            openLoadDropdown();
        });
    });

    dropdown.classList.add('open');
}

document.addEventListener('click', (e) => {
    const dd = document.getElementById('gear-plans-dropdown');
    const btn = document.getElementById('gp-load-btn');
    if (!dd?.classList.contains('open')) return;
    if (dd.contains(e.target) || btn?.contains(e.target)) return;
    closeGearPlansDropdown();
});

async function shareCurrentPlan() {
    if (callbacks.exportGearPlanToURL) {
        await callbacks.exportGearPlanToURL(getGearPlanData(currentPlan));
    }
}

function setGpQuickSimRunningUi(running, progressPct = null) {
    const btn = document.getElementById('gp-quick-sim-btn');
    const cfg = document.getElementById('gp-sim-settings-btn');
    const resultEl = document.getElementById('gp-quick-sim-result');
    if (btn) {
        btn.disabled = running;
        btn.classList.toggle('is-sim-running', running);
        if (running) {
            btn.setAttribute('aria-busy', 'true');
            if (!btn.dataset.gpQuickSimIconHtml) {
                btn.dataset.gpQuickSimIconHtml = btn.innerHTML;
            }
            btn.innerHTML = '<span class="loading-spinner-small" aria-hidden="true"></span>';
            btn.title = 'Simming…';
            btn.setAttribute('aria-label', 'Quick DPS Sim running');
        } else {
            btn.removeAttribute('aria-busy');
            if (btn.dataset.gpQuickSimIconHtml) {
                btn.innerHTML = btn.dataset.gpQuickSimIconHtml;
            }
            btn.title = 'Quick DPS Sim';
            btn.setAttribute('aria-label', 'Quick DPS Sim');
        }
    }
    if (cfg) cfg.disabled = running;
    if (resultEl) {
        resultEl.classList.toggle('gp-quick-sim-result--running', running);
        if (running) {
            resultEl.textContent = progressPct != null ? `Simming… ${progressPct}%` : 'Simming…';
        }
    }
}

async function runQuickSim() {
    if (gpQuickSimRunning) return;
    gpQuickSimRunning = true;
    setGpQuickSimRunningUi(true);
    try {
        const result = await runGearPlanQuickSim(
            getGearPlanData(currentPlan),
            (completed, total) => {
                const pct = total ? Math.round(100 * completed / total) : 0;
                setGpQuickSimRunningUi(true, pct);
            }
        );
        const resultEl = document.getElementById('gp-quick-sim-result');
        if (resultEl) {
            resultEl.classList.remove('gp-quick-sim-result--running');
            resultEl.textContent = result?.dps != null
                ? `~${Math.round(result.dps)} DPS`
                : (result?.error || 'Sim failed');
        }
    } catch (error) {
        console.error('[GP quick sim]', error);
        const resultEl = document.getElementById('gp-quick-sim-result');
        if (resultEl) {
            resultEl.classList.remove('gp-quick-sim-result--running');
            resultEl.textContent = error.message || 'Sim failed';
        }
    } finally {
        gpQuickSimRunning = false;
        setGpQuickSimRunningUi(false);
    }
}
