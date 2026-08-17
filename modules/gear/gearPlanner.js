// modules/gear/gearPlanner.js — gear plan schema and session persistence

export const GEAR_PLAN_SLOTS = [
    'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet',
    'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged',
];

export const SESSION_STORAGE_KEY = 'ichacalc_gear_planner_session_v1';
export const LOCAL_GEAR_PLANS_KEY = 'ichacalc_local_gear_plans_v1';

/** @returns {import('./gearPlanner.js').GearPlan} */
/** Canonical role tags for community / save metadata. */
export const GEAR_PLAN_ROLES = ['dps', 'tank', 'healer'];

/**
 * Default Vanilla icon keys per class + talent-tree display name.
 * Keys match `classTalents[class].*.name` (case-sensitive display names).
 */
export const DEFAULT_SPEC_ICONS = {
    warrior: { Arms: 'ability_rogue_ambush', Fury: 'spell_nature_purge', Protection: 'ability_racial_bloodrage' },
    paladin: { Holy: 'ability_golemthunderclap', Protection: 'spell_holy_devotionaura', Retribution: 'spell_holy_spiritualguidence' },
    hunter: { 'Beast Mastery': 'spell_nature_ravenform', Marksmanship: 'spell_frost_stun', Survival: 'spell_holy_prayerofhealing' },
    rogue: { Assassination: 'ability_rogue_eviscerate', Combat: 'ability_warrior_warcry', Subtlety: 'ability_stealth' },
    priest: { Discipline: 'inv_wand_01', Holy: 'spell_holy_renew', Shadow: 'spell_shadow_requiem' },
    shaman: { Elemental: 'spell_nature_lightning', Enhancement: 'spell_nature_lightningshield', Restoration: 'spell_nature_healingwavegreater' },
    mage: { Arcane: 'spell_holy_dispelmagic', Fire: 'spell_fire_flamebolt', Frost: 'spell_frost_frostward' },
    warlock: { Affliction: 'spell_shadow_unsummonbuilding', Demonology: 'inv_stone_04', Destruction: 'spell_shadow_shadowbolt' },
    druid: { Balance: 'spell_nature_abolishmagic', 'Feral Combat': 'ability_hunter_pet_hyena', Restoration: 'spell_nature_regeneration' },
};

export function normalizeGearPlanRoles(roles) {
    const arr = Array.isArray(roles) ? roles : (roles != null && roles !== '' ? [roles] : []);
    const out = [];
    for (const r of arr) {
        const key = String(r).toLowerCase().trim();
        if (GEAR_PLAN_ROLES.includes(key) && !out.includes(key)) out.push(key);
    }
    return out;
}

export function defaultIconForClassSpec(classId, spec) {
    const cls = String(classId || 'warrior').toLowerCase();
    const map = DEFAULT_SPEC_ICONS[cls] || {};
    if (spec && map[spec]) return map[spec];
    const first = Object.values(map)[0];
    return first || 'inv_misc_questionmark';
}

/** Max length for gear plan short description (community cards / save meta). */
export const GEAR_PLAN_DESCRIPTION_MAX = 180;

/** Max length for gear plan display name (header input + API). */
export const GEAR_PLAN_NAME_MAX = 64;

export function sanitizeGearPlanDescription(desc) {
    return String(desc == null ? '' : desc).replace(/\s+/g, ' ').trim().slice(0, GEAR_PLAN_DESCRIPTION_MAX);
}

export function sanitizeGearPlanName(name, fallback = 'Gear Plan') {
    const cleaned = String(name == null ? '' : name).replace(/\s+/g, ' ').trim().slice(0, GEAR_PLAN_NAME_MAX);
    return cleaned || fallback;
}

/** Display labels for role keys (store lowercase; UI title-case except DPS). */
export function formatGearPlanRoleLabel(role) {
    const key = String(role || '').toLowerCase();
    if (key === 'dps') return 'DPS';
    if (key === 'tank') return 'Tank';
    if (key === 'healer') return 'Healer';
    return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

export function createEmptyGearPlan(classId = 'warrior', name = 'New Gear Plan') {
    const slots = {};
    for (const slot of GEAR_PLAN_SLOTS) {
        slots[slot] = { primary: null, alternatives: [], enchant: null };
    }
    return {
        schemaVersion: 1,
        kind: 'gearPlan',
        name: sanitizeGearPlanName(name, 'New Gear Plan'),
        class: classId,
        race: 'human',
        talents: {},
        buffs: [],
        slots,
        ui: { collapsed: {}, stRotation: 'enhSt' },
        role: [],
        spec: '',
        description: '',
        icon: defaultIconForClassSpec(classId, ''),
        community: false,
    };
}

/**
 * @typedef {Object} GearPlanSlot
 * @property {number|null} primary
 * @property {number[]} alternatives
 * @property {number|null} enchant Enchant database index for this slot's primary, or null
 */

/**
 * @typedef {Object} GearPlan
 * @property {number} schemaVersion
 * @property {'gearPlan'} kind
 * @property {string} name
 * @property {string} class
 * @property {string} race
 * @property {Record<string, number>} talents
 * @property {Array<{ id: string, improved?: boolean }>} buffs
 * @property {Record<string, GearPlanSlot>} slots
 * @property {{ collapsed?: Record<string, boolean>, stRotation?: 'enhSt'|'eleSt' }} ui
 * @property {Array<'dps'|'tank'|'healer'>} [role]
 * @property {string} [spec]
 * @property {string} [description] Short blurb (max 180)
 * @property {string} [icon] Vanilla icon basename (e.g. spell_nature_lightning)
 * @property {boolean} [community]
 * @property {string} [authorName]
 * @property {string} [authorId]
 * @property {string} [sourceCommunityId] When favorited from community
 * @property {string} [sourceShareId] Snapshot id from ?gp= share URL (not writable)
 */

/** @returns {GearPlan} */
export function getGearPlanData(plan) {
    if (!plan || plan.kind !== 'gearPlan') return createEmptyGearPlan();
    const out = createEmptyGearPlan(plan.class || 'warrior', sanitizeGearPlanName(plan.name, 'Gear Plan'));
    out.schemaVersion = plan.schemaVersion || 1;
    if (plan.race) out.race = String(plan.race);
    if (plan.talents && typeof plan.talents === 'object') out.talents = { ...plan.talents };
    if (Array.isArray(plan.buffs)) {
        out.buffs = plan.buffs
            .filter(b => b && b.id)
            .map(b => ({ id: String(b.id), improved: !!b.improved }));
    }
    for (const slot of GEAR_PLAN_SLOTS) {
        const s = plan.slots?.[slot];
        if (!s) continue;
        const enchantIdx = s.enchant != null && s.enchant !== '' ? Number(s.enchant) : null;
        out.slots[slot] = {
            primary: s.primary != null ? Number(s.primary) : null,
            alternatives: Array.isArray(s.alternatives) ? s.alternatives.map(Number).filter(Boolean) : [],
            enchant: Number.isInteger(enchantIdx) && enchantIdx >= 0 ? enchantIdx : null,
        };
    }
    if (plan.ui?.collapsed) out.ui.collapsed = { ...plan.ui.collapsed };
    if (plan.ui?.stRotation === 'eleSt' || plan.ui?.stRotation === 'enhSt') {
        out.ui.stRotation = plan.ui.stRotation;
    }
    if (plan.id) out.id = plan.id;
    if (plan.favorite) out.favorite = true;

    out.role = normalizeGearPlanRoles(plan.role);
    out.spec = plan.spec != null ? String(plan.spec) : '';
    out.description = sanitizeGearPlanDescription(plan.description);
    const iconRaw = plan.icon != null ? String(plan.icon).trim() : '';
    const iconKey = iconRaw
        .replace(/^https?:\/\/[^/]+\/.*\//i, '')
        .replace(/\.(jpg|png|blp)$/i, '')
        .toLowerCase();
    // Preserve user-picked icons; only fall back to spec default when missing/invalid
    out.icon = /^[a-z0-9_]+$/.test(iconKey)
        ? iconKey
        : defaultIconForClassSpec(out.class, out.spec);
    out.community = !!plan.community;
    if (plan.authorName) out.authorName = String(plan.authorName);
    if (plan.authorId) out.authorId = String(plan.authorId);
    if (plan.sourceCommunityId) out.sourceCommunityId = String(plan.sourceCommunityId);
    if (plan.sourceShareId) out.sourceShareId = String(plan.sourceShareId);
    if (plan.createdAt) out.createdAt = plan.createdAt;
    if (plan.updatedAt) out.updatedAt = plan.updatedAt;
    if (plan.upvotes != null) out.upvotes = Number(plan.upvotes) || 0;
    if (plan.downvotes != null) out.downvotes = Number(plan.downvotes) || 0;
    if (plan.myVote === 'up' || plan.myVote === 'down') out.myVote = plan.myVote;
    else if (plan.myVote === null) out.myVote = null;
    return out;
}

const GP_TANK_WEIGHTS_KEY = 'ichacalc_gp_tankStatWeights';
const GP_DPS_WEIGHTS_KEY = 'ichacalc_gp_statWeights';
const GP_DPS_WEIGHTS_AOE_KEY = 'ichacalc_gp_statWeights_aoe';

export function saveGearPlannerTankStatWeights(sw) {
    try {
        if (!sw) localStorage.removeItem(GP_TANK_WEIGHTS_KEY);
        else localStorage.setItem(GP_TANK_WEIGHTS_KEY, JSON.stringify(sw));
    } catch (e) {
        console.warn('[gearPlanner] Failed to save tank stat weights:', e);
    }
}

export function getGearPlannerTankStatWeights() {
    try {
        const raw = localStorage.getItem(GP_TANK_WEIGHTS_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveGearPlannerDpsStatWeights(weights, isAoe = false) {
    if (!weights || !Array.isArray(weights)) return;
    const key = isAoe ? GP_DPS_WEIGHTS_AOE_KEY : GP_DPS_WEIGHTS_KEY;
    try {
        localStorage.setItem(key, JSON.stringify(weights));
    } catch (e) {
        console.warn('[gearPlanner] Failed to save DPS stat weights:', e);
    }
}

export function getGearPlannerDpsStatWeights(isAoe = false) {
    const key = isAoe ? GP_DPS_WEIGHTS_AOE_KEY : GP_DPS_WEIGHTS_KEY;
    try {
        const raw = localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : null;
        return Array.isArray(parsed) && parsed.length ? parsed : null;
    } catch {
        return null;
    }
}

if (typeof window !== 'undefined') {
    window.getGearPlannerTankStatWeights = getGearPlannerTankStatWeights;
    window.getGearPlannerDpsStatWeights = getGearPlannerDpsStatWeights;
}

export function loadGearPlanData(raw) {
    if (!raw) return createEmptyGearPlan();
    if (typeof raw === 'string') {
        try { return getGearPlanData(JSON.parse(raw)); } catch { return createEmptyGearPlan(); }
    }
    return getGearPlanData(raw);
}

/** Session: plan + UI state for mode switching */
export function saveGearPlannerSession(session) {
    try {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } catch (e) {
        console.warn('[gearPlanner] session save failed:', e);
    }
}

export function loadGearPlannerSession() {
    try {
        const raw = localStorage.getItem(SESSION_STORAGE_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function loadLocalGearPlans() {
    try {
        const raw = localStorage.getItem(LOCAL_GEAR_PLANS_KEY);
        if (!raw) return [];
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
}

export function saveLocalGearPlans(plans) {
    try {
        localStorage.setItem(LOCAL_GEAR_PLANS_KEY, JSON.stringify(plans));
    } catch (e) {
        console.warn('[gearPlanner] local plans save failed:', e);
    }
}

/**
 * Reorder/swap primary vs alternatives in one slot.
 * @param {GearPlan} plan
 * @param {{ slot: string, role: 'primary'|'alt', altIndex?: number, itemId?: number }} from
 * @param {{ slot: string, role: 'primary'|'alt', altIndex?: number }} to
 */
export function applyGearPlanItemMove(plan, from, to) {
    if (!plan || !from?.slot || !to?.slot || from.slot !== to.slot) return false;
    const slot = plan.slots?.[from.slot];
    if (!slot) return false;
    if (!Array.isArray(slot.alternatives)) slot.alternatives = [];
    const alts = slot.alternatives;

    if (from.role === 'alt' && to.role === 'primary') {
        const idx = Number.isInteger(from.altIndex) ? from.altIndex : alts.indexOf(from.itemId);
        if (idx < 0 || idx >= alts.length) return false;
        const moving = alts[idx];
        const oldPrimary = slot.primary;
        slot.primary = moving;
        if (oldPrimary) alts[idx] = oldPrimary;
        else alts.splice(idx, 1);
        return true;
    }

    if (from.role === 'primary' && to.role === 'alt') {
        const idx = Number.isInteger(to.altIndex) ? to.altIndex : 0;
        if (idx < 0 || idx >= alts.length || !slot.primary) return false;
        const oldAlt = alts[idx];
        alts[idx] = slot.primary;
        slot.primary = oldAlt;
        return true;
    }

    if (from.role === 'alt' && to.role === 'alt') {
        const fromIdx = Number.isInteger(from.altIndex) ? from.altIndex : alts.indexOf(from.itemId);
        const toIdx = Number.isInteger(to.altIndex) ? to.altIndex : 0;
        if (fromIdx < 0 || toIdx < 0 || fromIdx >= alts.length || toIdx >= alts.length || fromIdx === toIdx) return false;
        const [moved] = alts.splice(fromIdx, 1);
        alts.splice(toIdx, 0, moved);
        return true;
    }

    return false;
}
