// modules/ui/uiScale.js - Auto + manual UI scaling (independent of browser zoom)

import { isGpMobileLayout } from './gpMobile.js';

const STORAGE_KEY = 'ichacalc_uiUserScale';
const TEXT_STORAGE_KEY = 'ichacalc_textUserScale';

/** Layout design width: character planner main column (~1850px) / GP center column target. */
export const DESIGN_WIDTH = 1920;
/** Usable height below fixed nav (60px) for two-column planner chrome. */
export const DESIGN_HEIGHT = 1200;
export const NAV_CHROME_HEIGHT = 60;

export const AUTO_SCALE_MIN = 0.5;
export const AUTO_SCALE_MAX = 2.0;
export const USER_SCALE_MIN = 0.5;
export const USER_SCALE_MAX = 2.0;
export const USER_SCALE_DEFAULT = 1;

export const TEXT_SCALE_MIN = 0.5;
export const TEXT_SCALE_MAX = 2.0;
export const TEXT_SCALE_DEFAULT = 1;

/**
 * Fit planner chrome to the viewport using both width and height.
 * Scales up on large displays (4K) and down on small ones; clamped to [0.5, 2.0].
 *
 * Formula: auto = clamp(min(availW / DESIGN_WIDTH, availH / DESIGN_HEIGHT), 0.5, 2.0)
 * where availH = innerHeight - NAV_CHROME_HEIGHT.
 */
export function computeAutoScale() {
    const w = window.innerWidth || DESIGN_WIDTH;
    const h = Math.max(1, (window.innerHeight || DESIGN_HEIGHT + NAV_CHROME_HEIGHT) - NAV_CHROME_HEIGHT);
    const scaleW = w / DESIGN_WIDTH;
    const scaleH = h / DESIGN_HEIGHT;
    const raw = Math.min(scaleW, scaleH);
    return Math.max(AUTO_SCALE_MIN, Math.min(AUTO_SCALE_MAX, raw));
}

export function hasUserScalePreference() {
    try {
        return localStorage.getItem(STORAGE_KEY) != null;
    } catch {
        return false;
    }
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

export function hasTextScalePreference() {
    try {
        return localStorage.getItem(TEXT_STORAGE_KEY) != null;
    } catch {
        return false;
    }
}

export function getTextScale() {
    try {
        const raw = localStorage.getItem(TEXT_STORAGE_KEY);
        if (raw == null) return TEXT_SCALE_DEFAULT;
        const n = parseFloat(raw);
        if (!Number.isFinite(n)) return TEXT_SCALE_DEFAULT;
        return Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, n));
    } catch {
        return TEXT_SCALE_DEFAULT;
    }
}

export function clearTextScalePreference() {
    try {
        localStorage.removeItem(TEXT_STORAGE_KEY);
    } catch {
        /* ignore quota errors */
    }
    applyTextScale();
}

export function setTextScale(value) {
    const clamped = Math.max(TEXT_SCALE_MIN, Math.min(TEXT_SCALE_MAX, value));
    try {
        localStorage.setItem(TEXT_STORAGE_KEY, String(clamped));
    } catch {
        /* ignore quota errors */
    }
    applyTextScale();
    return clamped;
}

export function clearUserScalePreference() {
    try {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(TEXT_STORAGE_KEY);
    } catch {
        /* ignore quota errors */
    }
    applyUiScale();
    applyTextScale();
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
    const auto = isGpMobileLayout() ? 1 : computeAutoScale();
    return auto * getUserScale();
}

function computeTotalScale() {
    const auto = computeAutoScale();
    const user = getUserScale();
    // GP mobile uses responsive CSS, not 1920 auto-fit; manual scale still applies.
    const layoutAuto = isGpMobileLayout() ? 1 : auto;
    return layoutAuto * user;
}

function getScaledRoot() {
    return document.getElementById('ichacalc-scaled-root');
}

function syncScaleCssVars(auto, user, total) {
    const root = document.documentElement;
    root.style.setProperty('--ui-auto-scale', String(auto));
    root.style.setProperty('--ui-user-scale', String(user));
    root.style.setProperty('--ui-scale', String(total));
}

/**
 * Apply scale only to #ichacalc-scaled-root. Nav + UI settings panel stay at zoom 1.
 */
export function applyUiScale() {
    const auto = computeAutoScale();
    const user = getUserScale();
    const total = computeTotalScale();
    syncScaleCssVars(auto, user, total);

    const scaled = getScaledRoot();
    if (scaled) {
        scaled.style.zoom = String(total);
    }

    document.documentElement.style.zoom = '';
    if (document.body) {
        document.body.style.zoom = '';
    }

    window.dispatchEvent(new CustomEvent('uiScaleChanged', {
        detail: { auto, user, total, text: getTextScale() }
    }));
}

function syncTextScaleCssVar(text) {
    document.documentElement.style.setProperty('--text-scale', String(text));
}

/** Sets --text-scale on html; planner roots consume it as --ts via CSS. */
export function applyTextScale() {
    const text = getTextScale();
    syncTextScaleCssVar(text);
    window.dispatchEvent(new CustomEvent('textScaleChanged', { detail: { text } }));
}

function formatPercent(fraction) {
    return `${Math.round(fraction * 100)}%`;
}

function syncPanelValues() {
    const slider = document.getElementById('ui-scale-slider');
    const valueEl = document.getElementById('ui-scale-value');
    const effectiveEl = document.getElementById('ui-scale-effective');
    const autoEl = document.getElementById('ui-scale-auto');
    const manualEl = document.getElementById('ui-scale-manual');
    const textSlider = document.getElementById('text-scale-slider');
    const textValueEl = document.getElementById('text-scale-value');
    if (!slider) return;

    const user = getUserScale();
    const auto = computeAutoScale();
    const mobileGp = isGpMobileLayout();
    const total = computeTotalScale();
    const text = getTextScale();
    slider.value = String(user);
    if (valueEl) valueEl.textContent = formatPercent(user);
    if (effectiveEl) effectiveEl.textContent = formatPercent(total);
    if (autoEl) autoEl.textContent = mobileGp ? '—' : formatPercent(auto);
    if (manualEl) manualEl.textContent = formatPercent(user);
    if (textSlider) textSlider.value = String(text);
    if (textValueEl) textValueEl.textContent = formatPercent(text);
}

function bindUiScaleSettings() {
    const toggles = [
        document.getElementById('ui-scale-settings-btn'),
        document.getElementById('ui-scale-settings-btn-guest')
    ].filter(Boolean);
    const panel = document.getElementById('ui-scale-settings-panel');
    const slider = document.getElementById('ui-scale-slider');
    const textSlider = document.getElementById('text-scale-slider');
    const resetBtn = document.getElementById('ui-scale-reset-btn');

    if (!toggles.length || !panel || !slider) return;

    const setExpanded = (open) => {
        toggles.forEach(btn => btn.setAttribute('aria-expanded', open ? 'true' : 'false'));
    };

    const closePanel = () => {
        panel.hidden = true;
        setExpanded(false);
    };

    const openPanel = () => {
        syncPanelValues();
        panel.hidden = false;
        setExpanded(true);
    };

    toggles.forEach(toggle => {
        if (toggle.dataset.bound) return;
        toggle.dataset.bound = '1';
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            if (panel.hidden) openPanel();
            else closePanel();
        });
    });

    if (!slider.dataset.bound) {
        slider.dataset.bound = '1';
        slider.min = String(USER_SCALE_MIN);
        slider.max = String(USER_SCALE_MAX);
        slider.step = '0.05';
        slider.addEventListener('input', () => {
            setUserScale(parseFloat(slider.value));
            syncPanelValues();
        });
    }

    if (textSlider && !textSlider.dataset.bound) {
        textSlider.dataset.bound = '1';
        textSlider.min = String(TEXT_SCALE_MIN);
        textSlider.max = String(TEXT_SCALE_MAX);
        textSlider.step = '0.05';
        textSlider.addEventListener('input', () => {
            setTextScale(parseFloat(textSlider.value));
            syncPanelValues();
        });
    }

    if (resetBtn && !resetBtn.dataset.bound) {
        resetBtn.dataset.bound = '1';
        resetBtn.addEventListener('click', () => {
            clearUserScalePreference();
            syncPanelValues();
        });
    }

    if (!panel.dataset.bound) {
        panel.dataset.bound = '1';
        document.addEventListener('click', (e) => {
            if (panel.hidden) return;
            if (panel.contains(e.target) || toggles.some(btn => btn.contains(e.target))) return;
            closePanel();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !panel.hidden) closePanel();
        });
    }

    window.addEventListener('uiScaleChanged', syncPanelValues);
    window.addEventListener('textScaleChanged', syncPanelValues);
    syncPanelValues();
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
    applyTextScale();
    window.addEventListener('resize', onResize);
    bindUiScaleSettings();
}

/** Early boot (inline in index.html) — CSS vars only */
export function applyUiScaleEarly() {
    const auto = computeAutoScale();
    const user = getUserScale();
    const total = auto * user;
    syncScaleCssVars(auto, user, total);
    syncTextScaleCssVar(getTextScale());
}
