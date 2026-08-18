/**
 * Gear Planner mobile chrome: viewport detection, body class, nav offset, pane tabs.
 * Auto-fit UI scale is skipped here (responsive CSS); manual scale still applies via uiScale.js.
 */

export const GP_MOBILE_MQ = '(max-width: 900px)';
export const GP_MOBILE_COARSE_MQ = '(max-width: 1199px) and (pointer: coarse)';

const PANE_IDS = ['gear', 'locations', 'stats'];

let navObserver = null;
let mediaMql = null;
let coarseMql = null;
let onLayoutChange = null;
let currentPane = 'gear';

export function isGpMobileViewport() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia(GP_MOBILE_MQ).matches
        || window.matchMedia(GP_MOBILE_COARSE_MQ).matches;
}

export function isFinePointerHover() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true;
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function isGearPlannerMode() {
    return document.body?.dataset?.appMode === 'gearPlanner';
}

/** True when GP is open and the viewport should use mobile chrome. */
export function isGpMobileLayout() {
    return isGearPlannerMode() && isGpMobileViewport();
}

export function getGpMobilePane() {
    return PANE_IDS.includes(currentPane) ? currentPane : 'gear';
}

export function setGpMobilePane(pane) {
    currentPane = PANE_IDS.includes(pane) ? pane : 'gear';
    syncGpMobileChrome();
}

export function syncGpNavOffset() {
    const nav = document.querySelector('.top-nav-bar');
    const h = nav ? Math.max(36, Math.round(nav.getBoundingClientRect().height)) : 60;
    document.documentElement.style.setProperty('--gp-nav-offset', `${h}px`);
    const tabbar = document.getElementById('gp-mobile-tabbar');
    const th = tabbar && !tabbar.hidden ? Math.round(tabbar.getBoundingClientRect().height) : 0;
    document.documentElement.style.setProperty('--gp-tabbar-height', `${th}px`);
}

export function applyGpMobileClass() {
    const on = isGpMobileLayout();
    document.body?.classList.toggle('gp-mobile', on);
    document.documentElement.classList.toggle('gp-mobile', on);
    if (!on) {
        document.body?.classList.remove('gp-pane-locations', 'gp-pane-stats', 'gp-pane-gear');
    }
    return on;
}

function syncPaneVisibility(mobile) {
    const loc = document.getElementById('gp-locations-sidebar');
    const stats = document.getElementById('gp-stats-sidebar');
    const tabbar = document.getElementById('gp-mobile-tabbar');
    const inGp = isGearPlannerMode();

    if (tabbar) tabbar.hidden = !inGp || !mobile;

    if (!inGp) {
        if (loc) loc.hidden = true;
        if (stats) stats.hidden = true;
        return;
    }

    if (!mobile) {
        if (loc) loc.hidden = false;
        if (stats) stats.hidden = false;
        document.body.classList.remove('gp-pane-locations', 'gp-pane-stats', 'gp-pane-gear');
        return;
    }

    const pane = getGpMobilePane();
    document.body.classList.toggle('gp-pane-gear', pane === 'gear');
    document.body.classList.toggle('gp-pane-locations', pane === 'locations');
    document.body.classList.toggle('gp-pane-stats', pane === 'stats');
    if (loc) loc.hidden = pane !== 'locations';
    if (stats) stats.hidden = pane !== 'stats';

    tabbar?.querySelectorAll('[data-gp-pane]').forEach((btn) => {
        const active = btn.dataset.gpPane === pane;
        btn.classList.toggle('is-active', active);
        btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
}

export function syncGpMobileChrome() {
    const mobile = applyGpMobileClass();
    syncPaneVisibility(mobile);
    syncGpNavOffset();
}

export function initGpMobile(options = {}) {
    onLayoutChange = typeof options.onLayoutChange === 'function' ? options.onLayoutChange : null;
    if (typeof options.initialPane === 'string' && PANE_IDS.includes(options.initialPane)) {
        currentPane = options.initialPane;
    }

    const tabbar = document.getElementById('gp-mobile-tabbar');
    if (tabbar && tabbar.dataset.gpMobileWired !== '1') {
        tabbar.dataset.gpMobileWired = '1';
        tabbar.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-gp-pane]');
            if (!btn) return;
            setGpMobilePane(btn.dataset.gpPane);
            onLayoutChange?.({ reason: 'pane', pane: getGpMobilePane() });
        });
    }

    const nav = document.querySelector('.top-nav-bar');
    if (nav && typeof ResizeObserver === 'function' && !navObserver) {
        navObserver = new ResizeObserver(() => syncGpNavOffset());
        navObserver.observe(nav);
    }

    if (typeof window.matchMedia === 'function' && !mediaMql) {
        const onMq = () => {
            syncGpMobileChrome();
            onLayoutChange?.({ reason: 'viewport', pane: getGpMobilePane() });
        };
        mediaMql = window.matchMedia(GP_MOBILE_MQ);
        coarseMql = window.matchMedia(GP_MOBILE_COARSE_MQ);
        mediaMql.addEventListener?.('change', onMq);
        coarseMql.addEventListener?.('change', onMq);
        window.addEventListener('orientationchange', onMq);
        window.addEventListener('resize', () => syncGpNavOffset());
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => {
                document.documentElement.style.setProperty(
                    '--gp-vv-height',
                    `${Math.round(window.visualViewport.height)}px`
                );
                syncGpNavOffset();
            });
        }
    }

    syncGpMobileChrome();
    return getGpMobilePane();
}
