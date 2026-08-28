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

/** Legacy / UI labels that should still count as a canonical role. */
export const GEAR_PLAN_ROLE_ALIASES = {
    heal: 'healer',
    healing: 'healer',
    heals: 'healer',
};

/** Talent-tree key → save-dialog display name (matches classTalents.*.name). */
export const CLASS_TALENT_TREE_LABELS = {
    warrior: { arms: 'Arms', fury: 'Fury', protection: 'Protection' },
    paladin: { holy: 'Holy', protection: 'Protection', retribution: 'Retribution' },
    hunter: { beastmastery: 'Beast Mastery', marksmanship: 'Marksmanship', survival: 'Survival' },
    rogue: { assassination: 'Assassination', combat: 'Combat', subtlety: 'Subtlety' },
    priest: { discipline: 'Discipline', holy: 'Holy', shadow: 'Shadow' },
    shaman: { elemental: 'Elemental', enhancement: 'Enhancement', restoration: 'Restoration' },
    mage: { arcane: 'Arcane', fire: 'Fire', frost: 'Frost' },
    warlock: { affliction: 'Affliction', demonology: 'Demonology', destruction: 'Destruction' },
    druid: { balance: 'Balance', feralCombat: 'Feral Combat', restoration: 'Restoration' },
};

const HEALER_SPEC_KEYS = new Set(['restoration', 'holy', 'discipline']);
const TANK_SPEC_KEYS = new Set(['protection']);

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
        const raw = String(r).toLowerCase().trim();
        const key = GEAR_PLAN_ROLE_ALIASES[raw] || raw;
        if (GEAR_PLAN_ROLES.includes(key) && !out.includes(key)) out.push(key);
    }
    return out;
}

export function inferGearPlanSpec(plan) {
    const cls = String(plan?.class || '').toLowerCase();
    const labels = CLASS_TALENT_TREE_LABELS[cls];
    if (!labels) return '';
    const talents = plan?.talents && typeof plan.talents === 'object' ? plan.talents : {};
    let bestKey = '';
    let best = 0;
    for (const treeKey of Object.keys(labels)) {
        let n = 0;
        for (const [key, val] of Object.entries(talents)) {
            if (key === treeKey || key.startsWith(`${treeKey}-`)) n += Number(val) || 0;
        }
        if (n > best) {
            best = n;
            bestKey = treeKey;
        }
    }
    if (best <= 0) return '';
    return labels[bestKey] || '';
}

export function inferGearPlanRoles(plan) {
    const existing = normalizeGearPlanRoles(plan?.role);
    if (existing.length) return existing;
    const spec = String(plan?.spec || inferGearPlanSpec(plan) || '').toLowerCase();
    if (HEALER_SPEC_KEYS.has(spec)) return ['healer'];
    if (TANK_SPEC_KEYS.has(spec)) return ['tank'];
    if (spec) return ['dps'];
    return [];
}

export function planSpecForFilter(plan) {
    const spec = String(plan?.spec || '').trim();
    return spec || inferGearPlanSpec(plan) || '';
}

export function planRolesForFilter(plan) {
    return inferGearPlanRoles({ ...plan, spec: planSpecForFilter(plan) });
}

/** Search/filter a full catalog. Callers paginate the returned matches. */
export function filterGearPlans(plans, filters = {}) {
    const q = String(filters.q || '').trim().toLowerCase();
    const classFilter = String(filters.class || '').trim().toLowerCase();
    const roleFilter = String(filters.role || '').trim().toLowerCase();
    const specFilter = String(filters.spec || '').trim();
    return (plans || []).filter((p) => {
        if (classFilter && String(p.class || '').toLowerCase() !== classFilter) return false;
        if (roleFilter && !planRolesForFilter(p).includes(roleFilter)) return false;
        if (specFilter && planSpecForFilter(p) !== specFilter) return false;
        if (q) {
            const hay = [p.name, p.authorName, p.description, planSpecForFilter(p), p.class]
                .map((x) => String(x || '').toLowerCase()).join(' ');
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

export function paginateList(items, page, pageSize = 50) {
    const list = Array.isArray(items) ? items : [];
    const size = Math.max(1, Number(pageSize) || 50);
    const total = list.length;
    const pageCount = total === 0 ? 1 : Math.ceil(total / size);
    const safePage = Math.min(Math.max(1, Number(page) || 1), pageCount);
    const start = (safePage - 1) * size;
    return {
        page: safePage,
        pageCount,
        pageSize: size,
        total,
        slice: list.slice(start, start + size),
    };
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
        ui: { collapsed: {}, stRotation: 'enhSt', statsCardOrder: [], statsCardCollapsed: {} },
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
 * @property {{ collapsed?: Record<string, boolean>, stRotation?: 'enhSt'|'eleSt', statsCardOrder?: string[], statsCardCollapsed?: Record<string, boolean> }} ui
 * @property {Array<'dps'|'tank'|'healer'>} [role]
 * @property {string} [spec]
 * @property {string} [description] Short blurb (max 180)
 * @property {string} [icon] Vanilla icon basename (e.g. spell_nature_lightning)
 * @property {boolean} [community]
 * @property {string} [authorName]
 * @property {string} [authorId]
 * @property {string} [sourceCommunityId] When favorited from community
 * @property {string} [sourceShareId] Snapshot id from ?gp= share URL (not writable)
 * @property {Record<string, GearPlanClassStatWeights>} [statWeightsByClass] Per-class stat weights
 */

/**
 * @typedef {Object} GearPlanClassStatWeights
 * @property {Array} [statWeights] ST DPS weight rows
 * @property {Array} [statWeightsAoe] AOE DPS weight rows (shaman)
 * @property {Object} [tankStatWeights] Tank EHP/mit weights object
 */

function cloneClassWeightBucket(bucket) {
    if (!bucket || typeof bucket !== 'object') return {};
    const out = {};
    if (Array.isArray(bucket.statWeights) && bucket.statWeights.length) {
        out.statWeights = bucket.statWeights.map((r) => ({ ...r }));
    }
    if (Array.isArray(bucket.statWeightsAoe) && bucket.statWeightsAoe.length) {
        out.statWeightsAoe = bucket.statWeightsAoe.map((r) => ({ ...r }));
    }
    if (bucket.tankStatWeights && typeof bucket.tankStatWeights === 'object') {
        out.tankStatWeights = { ...bucket.tankStatWeights };
    }
    return out;
}

/** Normalize per-class stat weight buckets on a gear plan. */
export function sanitizeGearPlanStatWeightsByClass(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const out = {};
    for (const [classId, bucket] of Object.entries(raw)) {
        const cls = String(classId || '').toLowerCase().trim();
        if (!cls) continue;
        const cloned = cloneClassWeightBucket(bucket);
        if (cloned.statWeights || cloned.statWeightsAoe || cloned.tankStatWeights) {
            out[cls] = cloned;
        }
    }
    return Object.keys(out).length ? out : undefined;
}

/** Merge legacy flat weight fields into `statWeightsByClass` for one class. */
export function migrateGearPlanStatWeightsToByClass(plan, classId = plan?.class) {
    if (!plan) return plan;
    const cls = String(classId || plan.class || 'warrior').toLowerCase();
    const byClass = plan.statWeightsByClass && typeof plan.statWeightsByClass === 'object'
        ? { ...plan.statWeightsByClass }
        : {};
    const bucket = cloneClassWeightBucket(byClass[cls]);
    if (Array.isArray(plan.statWeights) && plan.statWeights.length && !bucket.statWeights) {
        bucket.statWeights = plan.statWeights.map((r) => ({ ...r }));
    }
    if (Array.isArray(plan.statWeightsAoe) && plan.statWeightsAoe.length && !bucket.statWeightsAoe) {
        bucket.statWeightsAoe = plan.statWeightsAoe.map((r) => ({ ...r }));
    }
    if (plan.tankStatWeights && typeof plan.tankStatWeights === 'object' && !bucket.tankStatWeights) {
        bucket.tankStatWeights = { ...plan.tankStatWeights };
    }
    if (bucket.statWeights || bucket.statWeightsAoe || bucket.tankStatWeights) {
        byClass[cls] = bucket;
        plan.statWeightsByClass = byClass;
        delete plan.statWeights;
        delete plan.statWeightsAoe;
        delete plan.tankStatWeights;
    }
    return plan;
}

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
    if (Array.isArray(plan.ui?.statsCardOrder)) {
        out.ui.statsCardOrder = plan.ui.statsCardOrder.map((id) => String(id).trim()).filter(Boolean);
    }
    if (plan.ui?.statsCardCollapsed && typeof plan.ui.statsCardCollapsed === 'object') {
        out.ui.statsCardCollapsed = {};
        for (const [key, val] of Object.entries(plan.ui.statsCardCollapsed)) {
            if (val) out.ui.statsCardCollapsed[String(key)] = true;
        }
    }
    if (plan.ui?.stRotation === 'eleSt' || plan.ui?.stRotation === 'enhSt') {
        out.ui.stRotation = plan.ui.stRotation;
    }
    if (plan.id) out.id = plan.id;
    if (plan.favorite) out.favorite = true;

    out.role = normalizeGearPlanRoles(plan.role);
    out.spec = plan.spec != null ? String(plan.spec) : '';
    if (!out.spec) out.spec = inferGearPlanSpec(plan);
    if (!out.role.length) out.role = inferGearPlanRoles({ ...plan, spec: out.spec });
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
    // Missing flag (pre-community schema) means "publishable"; only explicit false stays personal.
    out.community = plan.community !== false;
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

    let byClass = sanitizeGearPlanStatWeightsByClass(plan.statWeightsByClass);
    if (!byClass) {
        const legacy = {};
        if (Array.isArray(plan.statWeights) && plan.statWeights.length) legacy.statWeights = plan.statWeights;
        if (Array.isArray(plan.statWeightsAoe) && plan.statWeightsAoe.length) legacy.statWeightsAoe = plan.statWeightsAoe;
        if (plan.tankStatWeights && typeof plan.tankStatWeights === 'object') legacy.tankStatWeights = plan.tankStatWeights;
        const cls = String(plan.class || 'warrior').toLowerCase();
        const legacyBucket = cloneClassWeightBucket(legacy);
        if (legacyBucket.statWeights || legacyBucket.statWeightsAoe || legacyBucket.tankStatWeights) {
            byClass = { [cls]: legacyBucket };
        }
    }
    if (byClass) out.statWeightsByClass = byClass;

    return out;
}

const GP_TANK_WEIGHTS_KEY = 'ichacalc_gp_tankStatWeights';
const GP_DPS_WEIGHTS_KEY = 'ichacalc_gp_statWeights';
const GP_DPS_WEIGHTS_AOE_KEY = 'ichacalc_gp_statWeights_aoe';

function gpTankWeightsKey(classId) {
    return `${GP_TANK_WEIGHTS_KEY}_${String(classId || 'warrior').toLowerCase()}`;
}

function gpDpsWeightsKey(classId, isAoe = false) {
    const base = isAoe ? GP_DPS_WEIGHTS_AOE_KEY : GP_DPS_WEIGHTS_KEY;
    return `${base}_${String(classId || 'warrior').toLowerCase()}`;
}

export function saveGearPlannerTankStatWeights(sw, classId = 'warrior') {
    const key = gpTankWeightsKey(classId);
    try {
        if (!sw) localStorage.removeItem(key);
        else localStorage.setItem(key, JSON.stringify(sw));
    } catch (e) {
        console.warn('[gearPlanner] Failed to save tank stat weights:', e);
    }
}

export function getGearPlannerTankStatWeights(classId = 'warrior') {
    try {
        const raw = localStorage.getItem(gpTankWeightsKey(classId));
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export function saveGearPlannerDpsStatWeights(weights, isAoe = false, classId = 'warrior') {
    if (!weights || !Array.isArray(weights)) return;
    const key = gpDpsWeightsKey(classId, isAoe);
    try {
        localStorage.setItem(key, JSON.stringify(weights));
    } catch (e) {
        console.warn('[gearPlanner] Failed to save DPS stat weights:', e);
    }
}

export function getGearPlannerDpsStatWeights(isAoe = false, classId = 'warrior') {
    try {
        const raw = localStorage.getItem(gpDpsWeightsKey(classId, isAoe));
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

/**
 * Snapshot primary-slot item objects for set bonus / tooltip detection.
 * Uses full item data when loaded; falls back to `{ id }` stubs so setDatabase
 * ID lookup still works before slot JSON finishes loading.
 * Alternatives are excluded (primary slots only).
 * @param {GearPlan} plan
 * @param {(id: number|string) => object|null} [getItemById]
 * @returns {Record<string, { id: number }>}
 */
export function getGearPlanPrimaryEquipped(plan, getItemById) {
    const equipped = {};
    const p = plan?.slots || {};
    for (const slot of GEAR_PLAN_SLOTS) {
        const id = p[slot]?.primary;
        if (id == null) continue;
        const numId = Number(id);
        const item = getItemById?.(numId);
        equipped[slot] = item?.id != null ? item : { id: numId };
    }
    return equipped;
}
