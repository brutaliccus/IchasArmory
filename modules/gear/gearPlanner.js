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
