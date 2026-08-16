// modules/gear/gearPlanner.js — gear plan schema and session persistence

export const GEAR_PLAN_SLOTS = [
    'head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet',
    'ring1', 'ring2', 'trinket1', 'trinket2', 'mainhand', 'offhand', 'ranged',
];

export const SESSION_STORAGE_KEY = 'ichacalc_gear_planner_session_v1';
export const LOCAL_GEAR_PLANS_KEY = 'ichacalc_local_gear_plans_v1';

/** @returns {import('./gearPlanner.js').GearPlan} */
export function createEmptyGearPlan(classId = 'warrior', name = 'New Gear Plan') {
    const slots = {};
    for (const slot of GEAR_PLAN_SLOTS) {
        slots[slot] = { primary: null, alternatives: [] };
    }
    return {
        schemaVersion: 1,
        kind: 'gearPlan',
        name,
        class: classId,
        slots,
        ui: { collapsed: {} },
    };
}

/**
 * @typedef {Object} GearPlanSlot
 * @property {number|null} primary
 * @property {number[]} alternatives
 */

/**
 * @typedef {Object} GearPlan
 * @property {number} schemaVersion
 * @property {'gearPlan'} kind
 * @property {string} name
 * @property {string} class
 * @property {Record<string, GearPlanSlot>} slots
 * @property {{ collapsed?: Record<string, boolean> }} ui
 */

/** @returns {GearPlan} */
export function getGearPlanData(plan) {
    if (!plan || plan.kind !== 'gearPlan') return createEmptyGearPlan();
    const out = createEmptyGearPlan(plan.class || 'warrior', plan.name || 'Gear Plan');
    out.schemaVersion = plan.schemaVersion || 1;
    for (const slot of GEAR_PLAN_SLOTS) {
        const s = plan.slots?.[slot];
        if (!s) continue;
        out.slots[slot] = {
            primary: s.primary != null ? Number(s.primary) : null,
            alternatives: Array.isArray(s.alternatives) ? s.alternatives.map(Number).filter(Boolean) : [],
        };
    }
    if (plan.ui?.collapsed) out.ui.collapsed = { ...plan.ui.collapsed };
    if (plan.id) out.id = plan.id;
    if (plan.favorite) out.favorite = true;
    return out;
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
