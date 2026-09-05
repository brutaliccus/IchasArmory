/**
 * Gear Planner share URL helpers (`?gp=<id>&view=<page>`).
 * First-class pages only: gear paperdoll, talent/buffs/weights overlays,
 * and mobile Locations/Stats tabs.
 */

export const GP_SHARE_VIEWS = Object.freeze([
    'gear',
    'talents',
    'buffs',
    'weights',
    'locations',
    'stats',
]);

/** Unknown or empty values fall back to the paperdoll. */
export function normalizeGpShareView(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    return GP_SHARE_VIEWS.includes(v) ? v : 'gear';
}

/**
 * @param {string} origin
 * @param {string|number} planId
 * @param {string} [view]
 */
export function buildGearPlannerShareUrl(origin, planId, view) {
    const qs = new URLSearchParams();
    qs.set('gp', String(planId));
    const normalized = normalizeGpShareView(view);
    if (normalized !== 'gear') qs.set('view', normalized);
    const base = String(origin || '').replace(/\/+$/, '');
    return `${base}/gear-planner?${qs}`;
}

/** Path + search + hash with `view` set or removed (gear omits the param). */
export function applyGpShareViewToUrlString(href, view) {
    const url = new URL(href, 'http://localhost');
    const normalized = normalizeGpShareView(view);
    if (normalized === 'gear') url.searchParams.delete('view');
    else url.searchParams.set('view', normalized);
    return url.pathname + url.search + url.hash;
}

/**
 * @returns {string|null} normalized view, or null when `view` is absent
 */
export function readGpShareViewFromSearch(search) {
    const raw = String(search || '');
    const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw);
    if (!params.has('view')) return null;
    return normalizeGpShareView(params.get('view'));
}
