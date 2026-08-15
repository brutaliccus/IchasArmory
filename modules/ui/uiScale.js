// modules/ui/uiScale.js - Auto + manual UI scaling (independent of browser zoom)

const STORAGE_KEY = 'ichacalc_uiUserScale';
export const DESIGN_WIDTH = 2560;
export const DESIGN_HEIGHT = 1440;
export const USER_SCALE_MIN = 0.7;
export const USER_SCALE_MAX = 1.3;
export const USER_SCALE_DEFAULT = 1;

/**
 * Scale down to fit the design baseline (2560×1440) in both width and height.
 * Never scales above 1.
 */
export function computeAutoScale() {
    const w = window.innerWidth || DESIGN_WIDTH;
    const h = window.innerHeight || DESIGN_HEIGHT;
    return Math.min(w / DESIGN_WIDTH, h / DESIGN_HEIGHT, 1);
}

export function getUserScale() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw == null) return USER_SCALE_DEFAULT;
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return USER_SCALE_DEFAULT;
        return Math.max(USER_SCALE_MIN, Math.min(USER_SCALE_MAX, n));
    } catch {
        return USER_SCALE_DEFAULT;
    }
}

export function setUserScale(value) {
    const clamped = Math.max(USER_SCALE_MIN, Math.min(USER_SCALE_MAX, value));
    try {
        localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
        /* ignore quota errors */
    }
    applyUiScale();
    return clamped;
}

export function getEffectiveScale() {
    return computeAutoScale() * getUserScale();
}

function syncScaleCssVars(auto, user, total) {
    const root = document.documentElement;
    root.style.setProperty('--ui-auto-scale', String(auto));
    root.style.setProperty('--ui-user-scale', String(user));
    root.style.setProperty('--ui-scale', String(total));
}

/**
 * Apply combined auto × user scale via CSS zoom (matches legacy layout behavior).
 */
export function applyUiScale() {
    const auto = computeAutoScale();
    const user = getUserScale();
    const total = auto * user;
    syncScaleCssVars(auto, user, total);

    if (document.body) {
        document.body.style.zoom = String(total);
    }
    document.documentElement.style.zoom = String(total);

    window.dispatchEvent(new CustomEvent('uiScaleChanged', {
        detail: { auto, user, total }
    }));
}

function formatPercent(fraction) {
    return `${Math.round(fraction * 100)}%`;
}

function bindUiScaleSettings() {
    const toggle = document.getElementById('ui-scale-settings-btn');
    const panel = document.getElementById('ui-scale-settings-panel');
    const slider = document.getElementById('ui-scale-slider');
    const valueEl = document.getElementById('ui-scale-value');
    const effectiveEl = document.getElementById('ui-scale-effective');
    const resetBtn = document.getElementById('ui-scale-reset-btn');

    if (!toggle || !panel || !slider) return;

    const syncPanel = () => {
        const user = getUserScale();
        const auto = computeAutoScale();
        const total = auto * user;
        slider.value = String(user);
        if (valueEl) valueEl.textContent = formatPercent(user);
        if (effectiveEl) {
            effectiveEl.textContent = `${formatPercent(total)} (auto ${formatPercent(auto)} × manual ${formatPercent(user)})`;
        }
    };

    const closePanel = () => {
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
    };

    const openPanel = () => {
        syncPanel();
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
    };

    if (!toggle.dataset.bound) {
        toggle.dataset.bound = '1';
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.hidden) openPanel();
            else closePanel();
        });
    }

    if (!slider.dataset.bound) {
        slider.dataset.bound = '1';
        slider.min = String(USER_SCALE_MIN);
        slider.max = String(USER_SCALE_MAX);
        slider.step = '0.05';
        slider.addEventListener('input', () => {
            setUserScale(parseFloat(slider.value));
            syncPanel();
        });
    }

    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', () => {
            setUserScale(USER_SCALE_DEFAULT);
            syncPanel();
        });
    }

    if (!panel.dataset.bound) {
        panel.dataset.bound = '1';
        document.addEventListener('click', (e) => {
            if (panel.hidden) return;
            if (panel.contains(e.target) || toggle.contains(e.target)) return;
            closePanel();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) closePanel();
        });
    }

    window.addEventListener('uiScaleChanged', syncPanel);
    syncPanel();
}

let resizeTimer = null;
function onResize() {
    if (resizeTimer) clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyUiScale(), 100);
}

/**
 * Call once on app startup (and after DOM is ready for settings UI).
 */
export function initUiScale() {
    applyUiScale();
    window.addEventListener('resize', onResize);
    bindUiScaleSettings();
}

/** Early boot (inline in index.html) — sets zoom before first paint when possible */
export function applyUiScaleEarly() {
    const auto = computeAutoScale();
    const user = getUserScale();
    const total = auto * user;
    syncScaleCssVars(auto, user, total);
    document.documentElement.style.zoom = String(total);
}
